// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TIME-SLIDER CORE — SPEC_TIME_SLIDER_3D_TEMPORAL (TIME-001)

   Pure helpers para slider temporal X=f(t):
   - Modo 'campaign' (discreto, por índice)
   - Modo 'date' (contínuo, proporcional entre campaigns)
   - Clip array (sem Three.js — filtra userData.temporalX)
   - Step navigation (first/prev/next/last)
   - Play state machine (idle/playing/paused) com auto-advance
   - Clamp + bounds

   DOM slider, Three.js plane, e scene traversal ficam em handler/ui/.
   ================================================================ */

export const TEMPORAL_MODES = Object.freeze(['campaign', 'date']);

export const PLAY_STATES = Object.freeze(['idle', 'playing', 'paused']);

export const DEFAULT_CONFIG = Object.freeze({
    defaultMode: 'campaign',
    xScale: 10,
    xOffset: 0,
    animationDurationMs: 300,
    autoAdvanceIntervalMs: 1500, // tempo entre campaigns em play mode
});

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

export function isValidTemporalMode(mode: string): boolean {
    return typeof mode === 'string' && (TEMPORAL_MODES as readonly string[]).includes(mode);
}

export function isValidCampaignList(campaigns: Array<{ id?: string }>): boolean {
    if (!Array.isArray(campaigns) || campaigns.length === 0) return false;
    return campaigns.every((c) => c && typeof c.id === 'string');
}

// ──────────────────────────────────────────────────────────────────────
// timeToX - Mapeamento tempo → coordenada X (spec UT-001, UT-002)
// ──────────────────────────────────────────────────────────────────────

type TemporalCampaign = { id?: string; date?: string | number | Date };

interface TimeToXOptions {
    mode?: string;
    xScale?: number;
    xOffset?: number;
    campaigns?: Array<TemporalCampaign>;
}

/**
 * Converte valor temporal (campaignId string OU timestamp number) para X.
 *
 * Modo 'campaign': X = xOffset + index × xScale (discreto)
 * Modo 'date':    X = xOffset + normalized × (N-1) × xScale (contínuo)
 */
export function timeToX(timeValue: string | number, options: TimeToXOptions = {}): number {
    const mode = options.mode || DEFAULT_CONFIG.defaultMode;
    const xScale = Number(options.xScale) || DEFAULT_CONFIG.xScale;
    const xOffset = Number(options.xOffset) || DEFAULT_CONFIG.xOffset;
    const campaigns = Array.isArray(options.campaigns) ? options.campaigns : [];

    if (campaigns.length === 0) return xOffset;

    if (mode === 'campaign') {
        const index = campaigns.findIndex((c: TemporalCampaign) => c && c.id === timeValue);
        if (index < 0) return xOffset;
        return xOffset + index * xScale;
    }

    // mode 'date': timeValue é timestamp em ms
    const firstDate = _toMs(campaigns[0]?.date);
    const lastDate = _toMs(campaigns[campaigns.length - 1]?.date);
    const t = _toMs(timeValue);
    if (!Number.isFinite(firstDate) || !Number.isFinite(lastDate) || !Number.isFinite(t)) {
        return xOffset;
    }
    if (lastDate === firstDate) return xOffset;
    const normalized = (t - firstDate) / (lastDate - firstDate);
    const span = (campaigns.length - 1) * xScale;
    return xOffset + normalized * span;
}

function _toMs(v: string | number | Date | null | undefined): number {
    if (v == null) return NaN;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    const parsed = new Date(v).getTime();
    return parsed;
}

/**
 * Inverso: X coord → timestamp aproximado (modo date) ou campaignId (modo campaign).
 */
export function xToTime(x: number, options: TimeToXOptions = {}): number | string | null {
    const mode = options.mode || DEFAULT_CONFIG.defaultMode;
    const xScale = Number(options.xScale) || DEFAULT_CONFIG.xScale;
    const xOffset = Number(options.xOffset) || DEFAULT_CONFIG.xOffset;
    const campaigns = Array.isArray(options.campaigns) ? options.campaigns : [];
    if (campaigns.length === 0) return null;

    const rel = Number(x) - xOffset;

    if (mode === 'campaign') {
        const index = Math.max(0, Math.min(campaigns.length - 1, Math.round(rel / xScale)));
        return campaigns[index]?.id ?? null;
    }
    const firstDate = _toMs(campaigns[0]?.date);
    const lastDate = _toMs(campaigns[campaigns.length - 1]?.date);
    const span = (campaigns.length - 1) * xScale;
    if (span === 0) return firstDate;
    const normalized = Math.max(0, Math.min(1, rel / span));
    return firstDate + normalized * (lastDate - firstDate);
}

// ──────────────────────────────────────────────────────────────────────
// Clip - filtra array de elementos por temporalX (spec UT-003, UT-004)
// ──────────────────────────────────────────────────────────────────────

type TemporalObject = { userData?: { temporalX?: number | string | null } };

/**
 * Retorna partição { visible, hidden } dado xCurrent e array de elementos
 * com userData.temporalX.
 */
export function partitionByTemporalX(
    objects: Array<TemporalObject>,
    xCurrent: number,
): { visible: Array<TemporalObject>; hidden: Array<TemporalObject> } {
    const visible: Array<TemporalObject> = [];
    const hidden: Array<TemporalObject> = [];
    const x = Number(xCurrent);
    if (!Array.isArray(objects) || !Number.isFinite(x)) {
        return { visible: [...(objects || [])], hidden: [] };
    }
    for (const obj of objects) {
        const tx = obj?.userData?.temporalX;
        if (tx === undefined || tx === null) {
            visible.push(obj); // elementos sem temporalX sempre visíveis
            continue;
        }
        if (Number(tx) <= x) visible.push(obj);
        else hidden.push(obj);
    }
    return { visible, hidden };
}

// ──────────────────────────────────────────────────────────────────────
// Step navigation
// ──────────────────────────────────────────────────────────────────────

function getStepIndex(
    n: number,
    currentIdx: number,
    direction: 'first' | 'prev' | 'next' | 'last',
): number {
    switch (direction) {
        case 'first':
            return 0;
        case 'last':
            return n - 1;
        case 'prev':
            return Math.max(0, currentIdx - 1);
        case 'next':
            return Math.min(n - 1, currentIdx + 1);
        default:
            return currentIdx;
    }
}

function safeCampaignId(campaigns: Array<TemporalCampaign>, index: number): string | null {
    return campaigns[index]?.id ?? null;
}

export function stepCampaign(
    campaigns: Array<TemporalCampaign>,
    currentId: string,
    direction: 'first' | 'prev' | 'next' | 'last',
): string | null {
    if (!isValidCampaignList(campaigns)) return null;
    const n = campaigns.length;
    if (direction === 'first' || direction === 'last') {
        return safeCampaignId(campaigns, getStepIndex(n, 0, direction));
    }
    const idx = campaigns.findIndex((c: TemporalCampaign) => c.id === currentId);
    if (idx < 0) return safeCampaignId(campaigns, 0);
    if (direction === 'prev' || direction === 'next') {
        return safeCampaignId(campaigns, getStepIndex(n, idx, direction));
    }
    return currentId;
}

export function clampTemporalValue(value: number, min: number, max: number): number {
    const v = Number(value);
    const lo = Number(min);
    const hi = Number(max);
    if (!Number.isFinite(v) || !Number.isFinite(lo) || !Number.isFinite(hi)) return lo || 0;
    return Math.max(lo, Math.min(hi, v));
}

// ──────────────────────────────────────────────────────────────────────
// Play state machine (auto-advance)
// ──────────────────────────────────────────────────────────────────────

type PlayerState = { state: string; campaignId: string | null; lastAdvanceAt: number };
type PlayTickCtx = { campaigns?: Array<TemporalCampaign>; nowMs?: number; advanceIntervalMs?: number };

/**
 * Tick do player: avança para próxima campanha se intervalo expirou.
 */
export function playTick(
    current: PlayerState | null | undefined,
    event: string,
    ctx: PlayTickCtx = {},
): { state: string; campaignId: string | null; lastAdvanceAt: number; didAdvance: boolean } {
    const s: PlayerState = current || { state: 'idle', campaignId: null, lastAdvanceAt: 0 };
    const now = Number(ctx.nowMs) || 0;
    const interval = Number(ctx.advanceIntervalMs) || DEFAULT_CONFIG.autoAdvanceIntervalMs;
    const campaigns = Array.isArray(ctx.campaigns) ? ctx.campaigns : [];

    if (event === 'play') {
        return { ...s, state: 'playing', lastAdvanceAt: now, didAdvance: false };
    }
    if (event === 'pause') {
        return { ...s, state: 'paused', didAdvance: false };
    }
    // tick
    if (s.state !== 'playing') return { ...s, didAdvance: false };
    if (now - s.lastAdvanceAt < interval) return { ...s, didAdvance: false };

    // Avança
    const nextId = stepCampaign(campaigns, s.campaignId ?? '', 'next');
    // Se chegou na última, pausa
    const isLast =
        campaigns.length > 0 && nextId === campaigns[campaigns.length - 1]?.id && s.campaignId === nextId;
    if (isLast) {
        return { ...s, state: 'paused', didAdvance: false };
    }
    return {
        state: 'playing',
        campaignId: nextId,
        lastAdvanceAt: now,
        didAdvance: nextId !== s.campaignId,
    };
}

/**
 * Decide em qual container o time slider deve ser montado, dado o que está
 * REALMENTE visível na tela. Lógica pura (testável sem DOM).
 *
 * Causa raiz de BOOT-RESILIENCE-001#mais-timeslider-morto: o handler montava
 * o slider dentro de #canvas-container, que fica display:none fora do modo 3D
 * — painel existia no DOM mas era invisível (botão morto, sem toast, sem erro).
 *
 * @param canvasVisible - #canvas-container está visível?
 * @param mainVisible - #main-area está visível?
 * @returns id do container alvo, ou null se nenhum visível (→ degradar com toast)
 */
export function pickTimeSliderContainerId(
    canvasVisible: boolean,
    mainVisible: boolean,
): 'canvas-container' | 'main-area' | null {
    if (canvasVisible) return 'canvas-container';
    if (mainVisible) return 'main-area';
    return null;
}
