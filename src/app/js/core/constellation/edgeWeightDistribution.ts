// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Weight Distribution - Phase 1.46 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S46
 *
 * Phase 1.46 (2026-05-02) - pure-logic análise de distribuição de pesos
 * de edges: histogram, percentiles, skewness, normalização.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const DISTRIBUTION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.46',
    deliveredAt: '2026-05-02',
});

/**
 * Extrai weights numéricos válidos.
 * @param {Array<Record<string, unknown>>|unknown} edges
 * @param {string} [unknown>>|unknown]
 * @returns {ReadonlyArray<number>}
 */
export function extractWeights(edges: Array<Record<string, unknown>>|unknown, field: string = 'weight'): ReadonlyArray<number> {
    if (!Array.isArray(edges) || typeof field !== 'string') return Object.freeze([]);
        const out: number[]= [];
    for (const e of edges) {
        const v = e && (e as Record<string, unknown>)[field];
        if (Number.isFinite(v)) out.push((v as number));
    }
    return Object.freeze(out);
}

/**
 * Calcula histogram com N bins entre [min, max].
 * @param {number[]|readonly number[]} weights
 * @param {number} [bins]
 * @returns {ReadonlyArray<Readonly<{from:number, to:number, count:number}>>}
 */
export function histogram(weights: number[]|readonly number[], bins: number = 10): ReadonlyArray<Readonly<{from:number, to:number, count:number}>> {
    if (!Array.isArray(weights) || weights.length === 0) return Object.freeze([]);
    if (!Number.isInteger(bins) || bins <= 0) bins = 10;
    const lo = Math.min(...weights);
    const hi = Math.max(...weights);
    if (hi === lo) {
        return Object.freeze([Object.freeze({ from: lo, to: hi, count: weights.length })]);
    }
    const step = (hi - lo) / bins;
    const counts = new Array(bins).fill(0);
    for (const w of weights) {
        let idx = Math.floor((w - lo) / step);
        if (idx >= bins) idx = bins - 1;
        if (idx < 0) idx = 0;
        counts[idx]++;
    }
    return Object.freeze(
        counts.map((c, i) => Object.freeze({
            from: lo + i * step,
            to: lo + (i + 1) * step,
            count: c,
        })),
    );
}

/**
 * Percentile (0..100) por linear interpolation.
 * @param {number[]|readonly number[]} weights
 * @param {number} p
 * @returns {number|null}
 */
export function percentile(weights: number[]|readonly number[], p: number): number|null {
    if (!Array.isArray(weights) || weights.length === 0) return null;
    if (!Number.isFinite(p) || p < 0 || p > 100) return null;
    const sorted = weights.slice().sort((a, b) => a - b);
    const idx = (p / 100) * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    const t = idx - lo;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * t;
}

/**
 * Mean.
 * @param {number[]|readonly number[]} weights
 * @returns {number}
 */
export function mean(weights: number[]|readonly number[]): number {
    if (!Array.isArray(weights) || weights.length === 0) return 0;
    return weights.reduce((a, b) => a + b, 0) / weights.length;
}

/**
 * Standard deviation (population).
 * @param {number[]|readonly number[]} weights
 * @returns {number}
 */
export function stddev(weights: number[]|readonly number[]): number {
    if (!Array.isArray(weights) || weights.length === 0) return 0;
    const m = mean(weights);
    const v = weights.reduce((a, b) => a + (b - m) * (b - m), 0) / weights.length;
    return Math.sqrt(v);
}

/**
 * Skewness (Fisher-Pearson sample skewness, no bias correction).
 * Negative = left-skewed; positive = right-skewed; 0 = symmetric.
 * @param {number[]|readonly number[]} weights
 * @returns {number}
 */
export function skewness(weights: number[]|readonly number[]): number {
    if (!Array.isArray(weights) || weights.length < 3) return 0;
    const m = mean(weights);
    const sd = stddev(weights);
    if (sd === 0) return 0;
    const n = weights.length;
    const sum = weights.reduce((acc, x) => acc + Math.pow((x - m) / sd, 3), 0);
    return sum / n;
}

/**
 * Normaliza weights para [0,1] via min-max.
 * @param {number[]|readonly number[]} weights
 * @returns {ReadonlyArray<number>}
 */
export function normalize(weights: number[]|readonly number[]): ReadonlyArray<number> {
    if (!Array.isArray(weights) || weights.length === 0) return Object.freeze([]);
    const lo = Math.min(...weights);
    const hi = Math.max(...weights);
    if (hi === lo) return Object.freeze(weights.map(() => 0.5));
    const range = hi - lo;
    return Object.freeze(weights.map((w) => (w - lo) / range));
}

/**
 * Sumariza distribution.
 * @param {number[]|readonly number[]} weights
 * @returns {{count:number, min:number, max:number, mean:number, median:number|null, stddev:number, skew:number, p25?:number|null, p75?:number|null}}
 */
export function summarizeDistribution(weights: number[]|readonly number[]): {count:number, min:number, max:number, mean:number, median:number|null, stddev:number, skew:number, p25?:number|null, p75?:number|null} {
    const empty = { count: 0, min: 0, max: 0, mean: 0, median: 0, stddev: 0, skew: 0 };
    if (!Array.isArray(weights) || weights.length === 0) return empty;
    return Object.freeze({
        count: weights.length,
        min: Math.min(...weights),
        max: Math.max(...weights),
        mean: mean(weights),
        median: percentile(weights, 50),
        p25: percentile(weights, 25),
        p75: percentile(weights, 75),
        stddev: stddev(weights),
        skew: skewness(weights),
    });
}

/**
 * Module identity export.
 */
export const edgeWeightDistributionMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.46',
    deliveredAt: '2026-05-02',
    exports: [
        'DISTRIBUTION_META',
        'extractWeights',
        'histogram',
        'percentile',
        'mean',
        'stddev',
        'skewness',
        'normalize',
        'summarizeDistribution',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
