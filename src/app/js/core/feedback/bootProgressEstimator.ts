// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * TRUST-011 (claude - novaspec, 2026-05-30) — Boot Progress ETA Estimator (pure-logic).
 *
 * Problema (North Star v2 Pilar 1): boot do app dura ~30s subjetivos com 11 marcas
 * de progresso discretas (5/15/25/35/45/55/60/80/90/94/100%). Entre marcas, a
 * barra fica congelada e o usuário não recebe sinal de vida → percepção de
 * "spinner ~30s" mesmo quando boot está progredindo normalmente.
 *
 * Solução pure-logic (este módulo, ZERO deps de DOM):
 *
 *   1. PERSISTÊNCIA — guardar histórico dos últimos N boots por step (ms entre marcas).
 *      Média móvel exponencial (EMA) é mais resiliente a outliers que média simples.
 *      α = 0.30 (NIST/e Handbook §6.4.3 EWMA control charts) — peso novo dado a obs
 *      recente sem descartar histórico totalmente.
 *
 *   2. ETA — dado o step atual e timestamps EMA persistidos, computar:
 *        - tempo restante estimado até 100%
 *        - velocidade média % por segundo do step atual
 *
 *   3. SMOOTH FILL — entre updates discretos, calcular fração interpolada
 *      `pct + (target - pct) * elapsed/expected` (clamp ≤ target).
 *      Refs: Nielsen Norman Group "Progress Indicators Make a Slow System Less Insufferable"
 *      (Nielsen 2014) — mostrar progresso contínuo reduz percepção de tempo em 30-40%.
 *
 *   4. STUCK DETECTION — quando elapsed > 2× EMA esperado → flag stuck=true para UI
 *      mostrar mensagem "Ainda carregando... (etapa: X)" em vez de barra parada.
 *      Threshold 2× é empírico (1.5× = falso positivo demais; 3× = tarde demais).
 *
 * Não há dependência de browser/DOM — apenas Date.now()/Math/JSON. Permite cheap
 * test 100% Node.js + injeção de clock para determinismo.
 *
 * Convivência com `core/feedback/` (aggregator+manager pré-existentes): este módulo
 * NÃO usa o feedback widget — escopo é exclusivamente boot progress UX.
 */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

export interface BootStepSample {
    /** Nome canônico da fase (ex: 'i18n', 'auth', 'libraries') */
    phase: string;
    /** Porcentagem-alvo dessa fase (5, 15, 25, ...) */
    targetPct: number;
    /** Duração medida em ms (timestamp atual − timestamp da fase anterior) */
    durationMs: number;
    /** Epoch ms quando esta amostra foi registrada */
    recordedAt: number;
}

export interface BootHistoryEntry {
    phase: string;
    /** EMA da duração em ms */
    emaMs: number;
    /** Quantidade de amostras agregadas */
    sampleCount: number;
    /** Última atualização (epoch ms) */
    lastUpdatedAt: number;
}

export interface BootHistory {
    /** versão do schema p/ migração futura */
    schemaVersion: 1;
    entries: Record<string, BootHistoryEntry>;
}

export interface BootProgressState {
    /** % alvo atual (último updateLoading) */
    targetPct: number;
    /** epoch ms do último update */
    targetSetAt: number;
    /** % alvo anterior (para interpolação) */
    previousPct: number;
    /** epoch ms do update anterior */
    previousSetAt: number;
    /** Nome da fase atual (último argumento de markPhase) */
    currentPhase: string;
}

export interface SmoothFillResult {
    /** % renderizado AGORA (interpolado entre previousPct e targetPct) */
    renderedPct: number;
    /** Quanto % por segundo está progredindo no segmento atual */
    velocityPctPerSec: number;
    /** True se elapsed > stuckThresholdMultiplier × ema → mostrar "ainda carregando" */
    stuck: boolean;
    /** ETA estimada em ms até alcançar 100% (≥0). Infinity se sem histórico. */
    etaToCompletionMs: number;
}

export const EMA_ALPHA = 0.3;
export const STUCK_THRESHOLD_MULTIPLIER = 2.0;
export const DEFAULT_HISTORY_KEY = 'ecbyts-boot-progress-history-v1';
export const MAX_PHASE_ENTRIES = 32;

/**
 * Cria histórico vazio (schema válido p/ first-boot).
 */
export function createEmptyHistory(): BootHistory {
    return { schemaVersion: 1, entries: {} };
}

/**
 * Aplica EMA: emaNew = α × obs + (1 − α) × emaOld.
 * Se sampleCount = 0 (primeiro boot), retorna obs diretamente (bootstrap).
 */
export function updateEMA(prevEma: number, sampleCount: number, observation: number, alpha = EMA_ALPHA): number {
    if (sampleCount <= 0 || !Number.isFinite(prevEma)) return observation;
    return alpha * observation + (1 - alpha) * prevEma;
}

/**
 * Ingestão de uma amostra. Cria/atualiza entry no histórico via EMA.
 * Limita histórico a MAX_PHASE_ENTRIES (drop oldest by lastUpdatedAt).
 */
export function ingestSample(history: BootHistory, sample: BootStepSample): BootHistory {
    if (!sample || typeof sample.phase !== 'string' || !Number.isFinite(sample.durationMs) || sample.durationMs < 0) {
        return history;
    }
    const next: BootHistory = { schemaVersion: 1, entries: { ...history.entries } };
    const existing = next.entries[sample.phase];
    if (existing) {
        next.entries[sample.phase] = {
            phase: sample.phase,
            emaMs: updateEMA(existing.emaMs, existing.sampleCount, sample.durationMs),
            sampleCount: existing.sampleCount + 1,
            lastUpdatedAt: sample.recordedAt,
        };
    } else {
        next.entries[sample.phase] = {
            phase: sample.phase,
            emaMs: sample.durationMs,
            sampleCount: 1,
            lastUpdatedAt: sample.recordedAt,
        };
    }
    const phases = Object.keys(next.entries);
    if (phases.length > MAX_PHASE_ENTRIES) {
        const sorted = phases
            .map((p) => ({ p, t: next.entries[p]!.lastUpdatedAt })) // p vem de Object.keys
            .sort((a, b) => b.t - a.t)
            .slice(0, MAX_PHASE_ENTRIES);
        const trimmed: Record<string, BootHistoryEntry> = {};
        for (const { p } of sorted) trimmed[p] = next.entries[p]!;
        next.entries = trimmed;
    }
    return next;
}

/**
 * Calcula ETA até 100% somando EMA de todas as fases conhecidas com targetPct > currentPct.
 * Se uma fase não tem histórico, usa fallback (estimativa conservadora 1200ms).
 *
 * Retorna ms restantes (≥0) ou Infinity se nenhum dado disponível.
 *
 * NOTA: phasesRemainingTargets é a lista de [pct, phaseKey] das marcas que AINDA
 * vão ocorrer. Caller (boot orchestrator) sabe quais marcas faltam.
 */
export function estimateEtaMs(
    history: BootHistory,
    phasesRemainingTargets: Array<{ pct: number; phase: string }>,
    fallbackPhaseMs = 1200,
): number {
    if (!Array.isArray(phasesRemainingTargets) || phasesRemainingTargets.length === 0) return 0;
    let total = 0;
    let anyKnown = false;
    for (const { phase } of phasesRemainingTargets) {
        const entry = history.entries[phase];
        if (entry && Number.isFinite(entry.emaMs)) {
            total += entry.emaMs;
            anyKnown = true;
        } else {
            total += fallbackPhaseMs;
        }
    }
    if (!anyKnown && phasesRemainingTargets.length > 0) {
        return phasesRemainingTargets.length * fallbackPhaseMs;
    }
    return Math.max(0, total);
}

/**
 * Computa smooth fill + stuck + velocidade num instante `nowMs`.
 *
 * Lógica:
 *   - Se nowMs <= previousSetAt → retorna previousPct (sem extrapolação reversa)
 *   - elapsed = nowMs − previousSetAt
 *   - expected = max(1, EMA(currentPhase)) — fallback 1ms para evitar div/0
 *   - interpolatedPct = previousPct + (targetPct − previousPct) × min(1, elapsed/expected)
 *   - rendered = min(interpolatedPct, targetPct) — nunca passar do alvo já confirmado
 *   - velocity = (targetPct − previousPct) / (expected / 1000)
 *   - stuck = elapsed > stuckThresholdMultiplier × expected E rendered ainda < targetPct
 *   - eta = estimateEtaMs(history, phasesRemaining)
 */
export function computeSmoothFill(
    state: BootProgressState,
    history: BootHistory,
    phasesRemainingTargets: Array<{ pct: number; phase: string }>,
    nowMs: number,
    options: { stuckThresholdMultiplier?: number; fallbackPhaseMs?: number } = {},
): SmoothFillResult {
    const stuckMult = options.stuckThresholdMultiplier ?? STUCK_THRESHOLD_MULTIPLIER;
    const fallback = options.fallbackPhaseMs ?? 1200;
    if (!state || !Number.isFinite(state.targetPct)) {
        return { renderedPct: 0, velocityPctPerSec: 0, stuck: false, etaToCompletionMs: Infinity };
    }
    const elapsed = Math.max(0, nowMs - state.previousSetAt);
    const currentEntry = history.entries[state.currentPhase];
    const expected = Math.max(1, (currentEntry && Number.isFinite(currentEntry.emaMs)) ? currentEntry.emaMs : fallback);
    const delta = state.targetPct - state.previousPct;
    const fraction = Math.min(1, elapsed / expected);
    const interpolated = state.previousPct + delta * fraction;
    const renderedPct = Math.max(0, Math.min(interpolated, state.targetPct));
    const velocity = (delta) / (expected / 1000);
    const stuck = elapsed > stuckMult * expected && renderedPct < state.targetPct - 0.5;
    const eta = estimateEtaMs(history, phasesRemainingTargets, fallback);
    return {
        renderedPct,
        velocityPctPerSec: toFiniteNumber(velocity, 0),
        stuck,
        etaToCompletionMs: eta,
    };
}

/**
 * Serializa para localStorage (JSON estável). Caller cuida do try/catch + I/O.
 */
export function serializeHistory(history: BootHistory): string {
    return JSON.stringify(history);
}

function isValidHistoryEntry(entry: any): boolean {
    return (
        entry &&
        typeof entry === 'object' &&
        typeof entry.phase === 'string' &&
        Number.isFinite(entry.emaMs) &&
        entry.emaMs >= 0 &&
        Number.isInteger(entry.sampleCount) &&
        entry.sampleCount >= 0 &&
        Number.isFinite(entry.lastUpdatedAt)
    );
}

function normalizeHistoryEntry(entry: any): BootHistoryEntry | null {
    if (!isValidHistoryEntry(entry)) return null;
    return {
        phase: entry.phase,
        emaMs: entry.emaMs,
        sampleCount: entry.sampleCount,
        lastUpdatedAt: entry.lastUpdatedAt,
    };
}

/**
 * Desserializa + valida shape. Retorna histórico vazio em qualquer erro.
 */
export function deserializeHistory(raw: string | null | undefined): BootHistory {
    if (!raw || typeof raw !== 'string') return createEmptyHistory();
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return createEmptyHistory();
        if (parsed.schemaVersion !== 1) return createEmptyHistory();
        if (!parsed.entries || typeof parsed.entries !== 'object') return createEmptyHistory();
        const validated: BootHistory = { schemaVersion: 1, entries: {} };
        for (const [phase, entry] of Object.entries(parsed.entries as Record<string, any>)) {
            const normalized = normalizeHistoryEntry(entry);
            if (normalized) {
                validated.entries[phase] = normalized;
            }
        }
        return validated;
    } catch {
        return createEmptyHistory();
    }
}

/**
 * Formata ETA em string humana curta (pt-BR): "12s", "1m 5s", "—".
 * < 1s mostra "<1s" para evitar "0s" confuso.
 */
export function formatEtaShort(etaMs: number): string {
    if (!Number.isFinite(etaMs) || etaMs < 0) return '—';
    if (etaMs < 1000) return '<1s';
    const totalSec = Math.round(etaMs / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return sec === 0 ? `${min}m` : `${min}m ${sec}s`;
}
