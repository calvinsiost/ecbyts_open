// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Non-Detect Handling — Internal math helpers
   ================================================================ */

/**
 * Normal quantile (probit) approximation.
 * Abramowitz & Stegun 26.2.17 with tail extension.
 * @param {number} p - probability in (0, 1)
 * @returns {number} z-score
 */
export function _normQuantile(p: number): number {
    if (p <= 0 || p >= 1) return NaN;
    const [c0, c1, c2] = [2.515517, 0.802853, 0.010328] as const;
    const [d0, d1, d2] = [1.432788, 0.189269, 0.001308] as const;
    const sign = p < 0.5 ? -1 : 1;
    const pMapped = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(pMapped));
    const z = t - (c0 + c1 * t + c2 * t * t) / (1 + d0 * t + d1 * t * t + d2 * t * t * t);
    return sign * z;
}

/**
 * Linear interpolation of a percentile from a CDF defined by (xs, cdf) pairs.
 * @param {number[]} xs - sorted ascending values
 * @param {number[]} cdf - non-decreasing CDF values [0..1]
 * @param {number} p - target probability [0..1]
 * @returns {number}
 */
export function _interpolatePercentile(xs: number[], cdf: number[], p: number): number {
    if (xs.length === 0) return NaN;
    if (p <= (cdf[0] ?? NaN)) return xs[0] ?? NaN;
    if (p >= (cdf[cdf.length - 1] ?? NaN)) return xs[xs.length - 1] ?? NaN;
    for (let i = 1; i < cdf.length; i++) {
        const ci = cdf[i];
        const ciPrev = cdf[i - 1];
        if (ci === undefined || ciPrev === undefined) continue;
        if (ci >= p) {
            const xi = xs[i];
            const xiPrev = xs[i - 1];
            if (xi === undefined || xiPrev === undefined) return NaN;
            const t = (p - ciPrev) / (ci - ciPrev);
            return xiPrev + t * (xi - xiPrev);
        }
    }
    return xs[xs.length - 1] ?? NaN;
}

/**
 * Sample percentile via linear interpolation (type-7, R default).
 * @param {number[]} sorted - ascending sorted array
 * @param {number} p - probability in [0, 1]
 * @returns {number}
 */
export function _samplePercentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return NaN;
    if (sorted.length === 1) return sorted[0] ?? NaN;
    if (p <= 0) return sorted[0] ?? NaN;
    if (p >= 1) return sorted[sorted.length - 1] ?? NaN;
    const n = sorted.length;
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    const vLo = sorted[lo];
    if (vLo === undefined) return NaN;
    if (lo === hi) return vLo;
    const vHi = sorted[hi];
    if (vHi === undefined) return NaN;
    return vLo + frac * (vHi - vLo);
}

// Public aliases without underscore prefix (ecbyts-local/no-underscore-prefixed-imports)
export {
    _normQuantile as normQuantile,
    _interpolatePercentile as interpolatePercentile,
    _samplePercentile as samplePercentile,
};