// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S4 (lógica) — modelo PURO dos cards de estatística
 * da home. claude - ui 2026-06-15.
 *
 * EN: Pure data model for the home "stats" strip (Elements / Campaigns /
 *     Completeness / Last Save). No DOM, no i18n, no globals — the renderer in
 *     homeGrid.ts (_renderStats) consumes this and maps it to DOM with t()
 *     labels. Extracting the logic makes the completeness % + progress tier
 *     coloring unit-testable (cheap tests) and shrinks the monolith.
 *
 * PT (leigo): monta, sem tela nem tradução, a "ficha" dos 4 números que
 *     aparecem no topo da home (quantos elementos, quantas campanhas, quão
 *     completo está o modelo, e quando foi o último salvamento). Quem desenha
 *     na tela é o homeGrid; aqui só calculamos os valores e a cor da barrinha.
 *
 * Pure: entradas → saída congelada, determinística. Cheap tests:
 * tests/home-stats-pure.test.mjs.
 */

/** Faixa de cor da barra de completude (espelha as classes CSS low/medium/high). */
export type CompletenessTier = 'low' | 'medium' | 'high';

/** Snapshot de completude vindo de computeCompleteness() (score de N campos). */
export interface CompletenessSnapshot {
    readonly score: number;
    readonly total: number;
}

/** Entradas cruas para montar os cards (já resolvidas a montante). */
export interface StatModelInput {
    readonly elementsCount: number;
    readonly campaignsCount: number;
    /** null quando não há elementos nem campanhas (modelo vazio). */
    readonly completeness: CompletenessSnapshot | null;
    /** Texto já formatado do último salvamento (ex.: "há 2 min" ou "--"). */
    readonly lastSaveLabel: string;
}

/** Um card de estatística — independente de i18n (label resolvido na tela). */
export interface StatCard {
    readonly key: 'elements' | 'campaigns' | 'completeness' | 'lastSave';
    /** Chave i18n do rótulo (o renderer chama t() sobre ela). */
    readonly labelKey: string;
    readonly value: string | number;
    readonly icon: string;
    readonly hasProgress: boolean;
    /** Presentes só quando hasProgress=true (card de completude). */
    readonly progressPct?: number;
    readonly progressScore?: number;
    readonly progressTier?: CompletenessTier;
}

/** Número finito >= 0, senão 0 (fail-safe contra NaN/negativo/sujeira). */
function safeCount(n: unknown): number {
    const v = Number(n);
    return Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0;
}

/**
 * Faixa de cor da barra pelo score de completude (mesma regra do CSS legado:
 * ≤2 baixo, ≤4 médio, senão alto). Score negativo/sujo cai em 'low'.
 */
export function completenessTier(score: unknown): CompletenessTier {
    const s = Number(score);
    if (!Number.isFinite(s) || s <= 2) return 'low';
    if (s <= 4) return 'medium';
    return 'high';
}

/**
 * Percentual de completude [0,100] inteiro. total<=0 → 0 (evita divisão por
 * zero) e clampa em [0,100] (score nunca passa de total na prática, mas guarda).
 */
export function completenessPct(snapshot: CompletenessSnapshot | null | undefined): number {
    if (!snapshot) return 0;
    const score = Number(snapshot.score);
    const total = Number(snapshot.total);
    if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return 0;
    const pct = Math.round((score / total) * 100);
    return Math.max(0, Math.min(100, pct));
}

/** Texto "score/total" da completude, ou "--" quando ausente. */
export function completenessLabel(snapshot: CompletenessSnapshot | null | undefined): string {
    if (!snapshot) return '--';
    const score = Number(snapshot.score);
    const total = Number(snapshot.total);
    if (!Number.isFinite(score) || !Number.isFinite(total)) return '--';
    return `${score}/${total}`;
}

/**
 * Monta o array congelado dos 4 cards de estatística da home, na ordem
 * canônica. Pure: sem DOM/i18n/relógio. O renderer mapeia para elementos e
 * aplica t() sobre labelKey.
 */
export function buildStatCards(input: StatModelInput): readonly StatCard[] {
    const elementsCount = safeCount(input?.elementsCount);
    const campaignsCount = safeCount(input?.campaignsCount);
    const snap = input?.completeness ?? null;
    const score = snap ? safeCount(snap.score) : 0;

    return Object.freeze([
        Object.freeze({
            key: 'elements' as const,
            labelKey: 'homeStatsElements',
            value: elementsCount,
            icon: 'layers',
            hasProgress: false,
        }),
        Object.freeze({
            key: 'campaigns' as const,
            labelKey: 'homeStatsCampaigns',
            value: campaignsCount,
            icon: 'calendar',
            hasProgress: false,
        }),
        Object.freeze({
            key: 'completeness' as const,
            labelKey: 'homeStatsCompleteness',
            value: completenessLabel(snap),
            icon: 'check-circle-2',
            hasProgress: true,
            progressPct: completenessPct(snap),
            progressScore: score,
            progressTier: completenessTier(score),
        }),
        Object.freeze({
            key: 'lastSave' as const,
            labelKey: 'homeStatsLastSave',
            value: String(input?.lastSaveLabel ?? '--'),
            icon: 'clock',
            hasProgress: false,
        }),
    ]);
}
