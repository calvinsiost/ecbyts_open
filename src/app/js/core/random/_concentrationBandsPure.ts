// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RANDOM-COV-001 F1 (RF-4) — Amostragem de concentração por banda regulatória.

   Hoje o gerador sorteia valores com `random()*100` — irreal e desconexo das
   faixas regulatórias. Este módulo amostra concentrações ANCORADAS nas bandas
   VR/VP/VI (CETESB DD / CONAMA 420), produzindo valores que caem em uma banda
   semanticamente significativa (limpo / prevenção / intervenção / crítico).

   Bandas (dado os limites de um parâmetro/matriz):
     reference    : [0,  VR]      — abaixo do background natural
     prevention   : [VR, VP]      — monitoramento requerido
     intervention : [VP, VI]      — acima da prevenção, abaixo da intervenção
     critical     : [VI, VI·k]    — acima da intervenção (remediação)

   ADR A2 (síntese híbrida): regras garantem coerência; a banda dá realismo.
   Os LIMITES (VR/VP/VI) são FORNECIDOS pelo caller (vindos do módulo de
   validação CONAMA/CETESB) — este módulo NÃO duplica o catálogo de thresholds.

   Pure: rng injetado (() => number em [0,1)); determinístico; sem DOM/rede.
   ================================================================ */

export type ConcentrationBand = 'reference' | 'prevention' | 'intervention' | 'critical';

export const CONCENTRATION_BANDS: ReadonlyArray<ConcentrationBand> = Object.freeze([
    'reference',
    'prevention',
    'intervention',
    'critical',
]);

/** Limites regulatórios de um parâmetro numa matriz (mesma unidade). */
export interface ParameterThresholds {
    /** Valor de Referência (background natural). */
    readonly vr: number;
    /** Valor de Prevenção. */
    readonly vp: number;
    /** Valor de Intervenção. */
    readonly vi: number;
}

export interface BandRange {
    readonly lower: number;
    readonly upper: number;
    readonly band: ConcentrationBand;
}

/** Fator do teto da banda crítica (VI·k). 5× = pluma severa plausível. */
export const CRITICAL_BAND_FACTOR = 5;

type ContaminationLevel = 'low' | 'medium' | 'high';

/**
 * Distribuição de bandas por nível de contaminação (soma = 1 por nível).
 * Não-compensatória: nível 'low' nunca cai em 'critical'.
 */
const BAND_WEIGHTS: Readonly<Record<ContaminationLevel, Readonly<Record<ConcentrationBand, number>>>> =
    Object.freeze({
        low: Object.freeze({ reference: 0.6, prevention: 0.3, intervention: 0.1, critical: 0 }),
        medium: Object.freeze({ reference: 0.2, prevention: 0.4, intervention: 0.3, critical: 0.1 }),
        high: Object.freeze({ reference: 0.05, prevention: 0.2, intervention: 0.45, critical: 0.3 }),
    });

function isValidThresholds(t: unknown): t is ParameterThresholds {
    if (!t || typeof t !== 'object') return false;
    const { vr, vp, vi } = t as Record<string, unknown>;
    return (
        typeof vr === 'number' &&
        typeof vp === 'number' &&
        typeof vi === 'number' &&
        Number.isFinite(vr) &&
        Number.isFinite(vp) &&
        Number.isFinite(vi) &&
        vr >= 0 &&
        vp >= vr &&
        vi >= vp
    );
}

/**
 * Resolve o intervalo [lower, upper) de uma banda dados os limites do parâmetro.
 * @throws TypeError se thresholds inválidos (não-monótonos ou não-finitos).
 */
export function resolveBandRange(thresholds: ParameterThresholds, band: ConcentrationBand): BandRange {
    if (!isValidThresholds(thresholds)) {
        throw new TypeError('resolveBandRange: thresholds inválidos (exige 0<=vr<=vp<=vi finitos)');
    }
    const { vr, vp, vi } = thresholds;
    switch (band) {
        case 'reference':
            return Object.freeze({ lower: 0, upper: vr, band });
        case 'prevention':
            return Object.freeze({ lower: vr, upper: vp, band });
        case 'intervention':
            return Object.freeze({ lower: vp, upper: vi, band });
        case 'critical':
            return Object.freeze({ lower: vi, upper: vi * CRITICAL_BAND_FACTOR, band });
        default:
            throw new TypeError(`resolveBandRange: banda desconhecida ${String(band)}`);
    }
}

/**
 * Amostra um valor uniformemente em [lower, upper) usando o rng injetado.
 * Banda de largura zero (lower==upper) retorna o limite. Clampa rng a [0,1).
 */
export function sampleInBand(range: BandRange, rng: () => number): number {
    const r = typeof rng === 'function' ? rng() : 0;
    const u = Number.isFinite(r) ? Math.min(Math.max(r, 0), 0.9999999999) : 0;
    const { lower, upper } = range;
    if (!(upper > lower)) return lower;
    return lower + u * (upper - lower);
}

/**
 * Amostra uma concentração na banda pedida, ancorada nos limites do parâmetro.
 */
export function sampleConcentrationInBand(
    thresholds: ParameterThresholds,
    band: ConcentrationBand,
    rng: () => number,
): number {
    return sampleInBand(resolveBandRange(thresholds, band), rng);
}

/**
 * Escolhe uma banda de acordo com o nível de contaminação (pick ponderado
 * determinístico via rng). Nível inválido → 'low'.
 */
export function bandForContaminationLevel(
    level: ContaminationLevel | string,
    rng: () => number,
): ConcentrationBand {
    const weights = BAND_WEIGHTS[level as ContaminationLevel] ?? BAND_WEIGHTS.low;
    const r = typeof rng === 'function' ? rng() : 0;
    const u = Number.isFinite(r) ? Math.min(Math.max(r, 0), 0.9999999999) : 0;
    let acc = 0;
    for (const band of CONCENTRATION_BANDS) {
        acc += weights[band];
        if (u < acc) return band;
    }
    return 'intervention';
}
