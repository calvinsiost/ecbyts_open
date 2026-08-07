// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   RIDGELINE PLOT — KDE + distribution stats (pure, node-testable)
   SPEC_RIDGELINE_PLOT_9_71 §Q2/Q3/Q4

   Kernel Density Estimation com kernel Gaussiano e bandwidth
   via regra de Silverman (1986). Estatísticas de distribuição
   completas (skewness, kurtosis, bimodalidade) para ridgeline
   plot empilhado.

   Usado pelo painel Analytics para revelar:
   - Assimetria de distribuições (skewness)
   - Bimodalidade (mais de 1 moda via KDE peaks)
   - Comparação cross-parâmetro (normalização opcional)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Sanitização (idêntica a core/filter/aggregations.js)
// ──────────────────────────────────────────────────────────────────────

/** @param {unknown} values @returns {number[]} */
function _sanitize(values: unknown): number[] {
    if (!Array.isArray(values)) return [];
    return values
        .filter(
            (v: unknown) =>
                typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))),
        )
        .map((v: unknown) => Number(v))
        .filter((v: number) => Number.isFinite(v));
}

// ──────────────────────────────────────────────────────────────────────
// Estatísticas básicas
// ──────────────────────────────────────────────────────────────────────

/** @param {number[]} s */
function _mean(s: number[]): number {
    return s.reduce((a: number, b: number) => a + b, 0) / s.length;
}

/** @param {number[]} s @param {number} mu */
function _variance(s: number[], mu: number): number {
    if (s.length < 2) return 0;
    return s.reduce((acc: number, v: number) => acc + (v - mu) ** 2, 0) / (s.length - 1);
}

/** @param {number[]} sorted @param {number} p @returns {number|null} */
function _percentile(sorted: number[], p: number): number | null {
    if (sorted.length === 0) return null;
    if (sorted.length === 1) return sorted[0]!;
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! * (hi - idx) + sorted[hi]! * (idx - lo);
}

/**
 * Estatísticas completas de distribuição (mean, median, stdev, skewness, kurtosis).
 *
 * Skewness (Fisher-Pearson standardized): E[((X-μ)/σ)^3]
 *   > 0 = cauda direita (distribuição enviesada para valores altos)
 *   < 0 = cauda esquerda
 *   ~ 0 = simétrica
 *
 * Kurtosis (excess): E[((X-μ)/σ)^4] - 3
 *   > 0 = leptocúrtica (picos mais altos que normal, mais outliers)
 *   < 0 = platicúrtica (mais uniforme)
 *
 * @param {Array<number>} values
 * @returns {{
 *   count: number,
 *   mean: number|null,
 *   median: number|null,
 *   stdev: number|null,
 *   variance: number|null,
 *   min: number|null,
 *   max: number|null,
 *   p25: number|null,
 *   p75: number|null,
 *   skewness: number|null,
 *   kurtosis: number|null,
 * }}
 */
export function statsDistribution(values: Array<number>): { count: number, mean: number|null, median: number|null, stdev: number|null, variance: number|null, min: number|null, max: number|null, p25: number|null, p75: number|null, skewness: number|null, kurtosis: number|null, } {
    const s = _sanitize(values);
    if (s.length === 0) {
        return {
            count: 0,
            mean: null,
            median: null,
            stdev: null,
            variance: null,
            min: null,
            max: null,
            p25: null,
            p75: null,
            skewness: null,
            kurtosis: null,
        };
    }
    const sorted = s.slice().sort((a, b) => a - b);
    const mean = _mean(s);
    const variance = _variance(s, mean);
    const stdev = Math.sqrt(variance);
    const median = _percentile(sorted, 0.5);
    const p25 = _percentile(sorted, 0.25);
    const p75 = _percentile(sorted, 0.75);

    let skewness = null;
    let kurtosis = null;
    if (stdev > 0 && s.length >= 2) {
        const n = s.length;
        let m3 = 0;
        let m4 = 0;
        for (const v of s) {
            const d = (v - mean) / stdev;
            m3 += d ** 3;
            m4 += d ** 4;
        }
        skewness = m3 / n;
        kurtosis = m4 / n - 3;
    }

    return {
        count: s.length,
        mean,
        median,
        stdev,
        variance,
        min: sorted[0]!,
        max: sorted[sorted.length - 1]!,
        p25,
        p75,
        skewness,
        kurtosis,
    };
}

// ──────────────────────────────────────────────────────────────────────
// KDE (Kernel Density Estimation)
// ──────────────────────────────────────────────────────────────────────

/** @param {number} u */
function _gaussianKernel(u: number): number {
    return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

/**
 * Bandwidth via regra de Silverman (1986):
 *   h = 0.9 × min(σ, IQR/1.34) × n^(-1/5)
 *
 * @param {Array<number>} values - já sanitized
 * @returns {number}
 */
export function silvermanBandwidth(values: Array<number>): number {
    const s = _sanitize(values);
    if (s.length < 2) return 1;
    const sorted = s.slice().sort((a, b) => a - b);
    const mean = _mean(s);
    const sigma = Math.sqrt(_variance(s, mean));
    const p75 = _percentile(sorted, 0.75) ?? 0;
    const p25 = _percentile(sorted, 0.25) ?? 0;
    const iqr = p75 - p25;
    const a = iqr > 0 ? Math.min(sigma, iqr / 1.34) : sigma;
    if (a <= 0) return 1;
    return 0.9 * a * Math.pow(s.length, -1 / 5);
}

/**
 * Kernel Density Estimation (Gaussian kernel).
 * Retorna densidade em `points` grid pontos uniformemente espaçados
 * de min..max do dataset (expandido por ±2σ para caudas).
 *
 * @param {Array<number>} values
 * @param {Object} [opts]
 * @param {number} [opts.points=64] - número de pontos do grid
 * @param {number} [opts.bandwidth] - override do bandwidth Silverman
 * @param {number} [opts.padSigmas=2] - quantos desvios expandir além de min/max
 * @returns {{
 *   x: number[],
 *   density: number[],
 *   bandwidth: number,
 * } | null}
 */
export function kde(values: Array<number>, opts: { points?: number; bandwidth?: number; padSigmas?: number } = {}): { x: number[], density: number[], bandwidth: number, } | null {
    const s = _sanitize(values);
    if (s.length === 0) return null;
    const optsPoints = opts.points;
    const points =
        typeof optsPoints === 'number' && Number.isFinite(optsPoints) && optsPoints >= 8 ? Math.floor(optsPoints) : 64;
    const optsBw = opts.bandwidth;
    const bandwidth =
        typeof optsBw === 'number' && Number.isFinite(optsBw) && optsBw > 0 ? optsBw : silvermanBandwidth(s);
    const optsPad = opts.padSigmas;
    const padSigmas = typeof optsPad === 'number' && Number.isFinite(optsPad) ? optsPad : 2;

    const sorted = s.slice().sort((a, b) => a - b);
    const minV = (sorted[0] as number);
    const maxV = (sorted[sorted.length - 1] as number);
    const pad = bandwidth * padSigmas;
    const lo = minV - pad;
    const hi = maxV + pad;

    const range = hi - lo;
    if (range === 0) {
        // Todos iguais - massa pontual. Retorna densidade pico no único valor.
        return {
            x: [minV],
            density: [1],
            bandwidth,
        };
    }

    const step = range / (points - 1);
        const x: number[]= new Array(points);
        const density: number[]= new Array(points);
    const n = s.length;

    for (let i = 0; i < points; i++) {
        const xi = lo + step * i;
        x[i] = xi;
        let sum = 0;
        for (const v of s) {
            const u = (xi - v) / bandwidth;
            sum += _gaussianKernel(u);
        }
        density[i] = sum / (n * bandwidth);
    }

    return { x, density, bandwidth };
}

/**
 * Detecta modas (peaks locais) de uma densidade KDE.
 * Util para classificar unimodal/bimodal/multimodal.
 *
 * @param {{x: number[], density: number[]}} kdeResult
 * @param {Object} [opts]
 * @param {number} [opts.prominenceRatio=0.1] - prominência mínima como fração do pico max
 * @returns {Array<{x: number, density: number}>}
 */
export function findModes(kdeResult: {x: number[], density: number[]}, opts: { prominenceRatio?: number } = {}): Array<{x: number, density: number}> {
    if (!kdeResult || !Array.isArray(kdeResult.density) || kdeResult.density.length < 3) return [];
    const { x, density } = kdeResult;
    const maxDensity = Math.max(...density);
    const threshold = maxDensity * (opts.prominenceRatio ?? 0.1);
    const modes = [];
    for (let i = 1; i < density.length - 1; i++) {
        if (density[i]! > density[i - 1]! && density[i]! > density[i + 1]! && density[i]! >= threshold) {
            modes.push({ x: x[i]!, density: density[i]! });
        }
    }
    return modes;
}

/**
 * Classifica distribuição por número de modas.
 * @param {Array<number>} values
 * @returns {'unimodal'|'bimodal'|'multimodal'|'degenerate'}
 */
export function modalityClass(values: Array<number>): 'unimodal'|'bimodal'|'multimodal'|'degenerate' {
    const k = kde(values);
    if (!k || k.x.length < 3) return 'degenerate';
    const modes = findModes(k);
    if (modes.length === 0) return 'degenerate';
    if (modes.length === 1) return 'unimodal';
    if (modes.length === 2) return 'bimodal';
    return 'multimodal';
}

// ──────────────────────────────────────────────────────────────────────
// Normalização + ordering (§Q3/Q4)
// ──────────────────────────────────────────────────────────────────────

/**
 * Normaliza values para range [0, 1] (min-max scaling).
 * @param {Array<number>} values
 * @param {Object} [opts]
 * @param {number} [opts.min]
 * @param {number} [opts.max]
 * @returns {Array<number>}
 */
export function normalize(values: Array<number>, opts: { min?: number; max?: number } = {}): Array<number> {
    const s = _sanitize(values);
    if (s.length === 0) return [];
    const lo = typeof opts.min === 'number' && Number.isFinite(opts.min) ? opts.min : Math.min(...s);
    const hi = typeof opts.max === 'number' && Number.isFinite(opts.max) ? opts.max : Math.max(...s);
    if (hi === lo) return s.map(() => 0.5);
    return s.map((v) => (v - lo) / (hi - lo));
}

/** @typedef {{id: string, stats: {median: number|null, variance: number|null, skewness: number|null, count: number}}} OrderableSeries */
type OrderableSeries = {
    id: string;
    stats: { median: number | null; variance: number | null; skewness: number | null; count: number };
};

const ORDER_FUNCTIONS: Record<string, (a: OrderableSeries, b: OrderableSeries) => number>= Object.freeze({
    name: (a, b) => String(a.id).localeCompare(String(b.id)),
    median: (a, b) => (a.stats.median ?? -Infinity) - (b.stats.median ?? -Infinity),
    median_desc: (a, b) => (b.stats.median ?? -Infinity) - (a.stats.median ?? -Infinity),
    variance: (a, b) => (a.stats.variance ?? 0) - (b.stats.variance ?? 0),
    skewness: (a, b) => (a.stats.skewness ?? 0) - (b.stats.skewness ?? 0),
    count: (a, b) => (a.stats.count ?? 0) - (b.stats.count ?? 0),
});

/**
 * Ordena séries por critério (§Q3).
 *
 * @param {Array<{id: string, values: number[]}>} series
 * @param {'name'|'median'|'median_desc'|'variance'|'skewness'|'count'} [orderBy='median_desc']
 * @returns {Array<{id: string, values: number[], stats: Object}>}
 */
export function orderSeries(series: Array<{id: string, values: number[]}>, orderBy: 'name'|'median'|'median_desc'|'variance'|'skewness'|'count' = 'median_desc'): Array<{id: string, values: number[], stats: Object}> {
    if (!Array.isArray(series)) return [];
    const annotated = series
        .filter((s) => s && typeof s === 'object' && s.id)
        .map((s) => ({ ...s, stats: statsDistribution(s.values) }));
    const fn = ORDER_FUNCTIONS[orderBy] || ORDER_FUNCTIONS.median_desc;
    return annotated.slice().sort(fn);
}

// ──────────────────────────────────────────────────────────────────────
// Color by median (§Q4 gradient)
// ──────────────────────────────────────────────────────────────────────

const MEDIAN_COLORS = Object.freeze({
    good: '#4CAF50', // >80%
    warning: '#FFC107', // 50-80%
    critical: '#F44336', // <50%
});

/**
 * Retorna cor baseada na mediana percentual (0-100).
 * @param {number} medianPct - valor 0-100
 * @returns {string} - hex color
 */
export function getColorByMedian(medianPct: number): string {
    if (medianPct > 80) return MEDIAN_COLORS.good;
    if (medianPct >= 50) return MEDIAN_COLORS.warning;
    return MEDIAN_COLORS.critical;
}
