// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   Uncertainty — probability distributions for Monte Carlo (UNC-HUB-002)

   Transforms a uniform sample u ∈ [0, 1) into a realization of the
   requested distribution. Used by monteCarlo.js to evaluate N iterations
   of a policy input. Pure functions, no DOM, no async.

   Distributions:
   - normal:     { mu, sigma }
   - lognormal:  { mu, sigma }         (mu, sigma of log)
   - triangular: { min, mode, max }
   - uniform:    { min, max }
   - empirical:  { samples: number[] } (ECDF — inverse interpolation)

   Reference: JCGM 101:2008 §6 (MC supplement to GUM).
   ================================================================ */

const TWO_PI = 6.283185307179586;

export type DistributionName = 'normal' | 'lognormal' | 'triangular' | 'uniform' | 'empirical';

export interface NormalParams {
    readonly mu: number;
    readonly sigma: number;
}
export interface TriangularParams {
    readonly min: number;
    readonly mode: number;
    readonly max: number;
}
export interface UniformParams {
    readonly min: number;
    readonly max: number;
}
export interface EmpiricalParams {
    readonly samples: readonly number[];
}

export type DistributionParams =
    | NormalParams
    | TriangularParams
    | UniformParams
    | EmpiricalParams
    | Record<string, unknown>;

export type Rng = () => number;

/**
 * Mulberry32 PRNG — deterministic, seedable.
 * Shared algorithm with core/analytics/scenarioSimulation/engine.js.
 * @param seed
 * @returns rng returning [0, 1)
 */
export function mulberry32(seed: number): Rng {
    let s = seed >>> 0;
    return function (): number {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Inverse normal CDF (Acklam 2003 rational approximation, ~1e-9 error).
 * Used to turn a uniform u into a standard normal variate.
 * @param p — probability in (0, 1)
 */
export function invNormalCDF(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a: readonly number[] = [
        -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
        2.506628277459239,
    ];
    const b: readonly number[] = [
        -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
    ];
    const c: readonly number[] = [
        -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
        2.938163982698783,
    ];
    const d: readonly number[] = [
        7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
    ];
    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q: number;
    let r: number;
    if (p < pLow) {
        q = Math.sqrt(-2 * Math.log(p));
        return (
            (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
            ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
        );
    }
    if (p <= pHigh) {
        q = p - 0.5;
        r = q * q;
        return (
            ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
            (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1)
        );
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
        -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
        ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1)
    );
}

/**
 * Inverse transform from uniform u ∈ [0, 1) to the requested distribution.
 */
export function sampleFromUniform(
    distribution: string,
    params: DistributionParams | null | undefined,
    u: number,
): number {
    const p = _clampOpen(u);
    const pp = (params || {}) as Record<string, unknown>;
    switch (distribution) {
        case 'normal':
            return _validNumber(pp.mu) + _validNumber(pp.sigma) * invNormalCDF(p);
        case 'lognormal':
            return Math.exp(_validNumber(pp.mu) + _validNumber(pp.sigma) * invNormalCDF(p));
        case 'triangular': {
            const a = _validNumber(pp.min);
            const c = _validNumber(pp.mode);
            const b = _validNumber(pp.max);
            if (!(a <= c && c <= b && a < b)) {
                throw new Error(`triangular: require min<=mode<=max with min<max (got ${a},${c},${b})`);
            }
            const fc = (c - a) / (b - a);
            return p < fc ? a + Math.sqrt(p * (b - a) * (c - a)) : b - Math.sqrt((1 - p) * (b - a) * (b - c));
        }
        case 'uniform': {
            const a = _validNumber(pp.min);
            const b = _validNumber(pp.max);
            return a + (b - a) * p;
        }
        case 'empirical': {
            const rawSamples = pp.samples;
            const samples = Array.isArray(rawSamples)
                ? [...(rawSamples as readonly number[])].sort((x, y) => x - y)
                : [];
            if (samples.length === 0) throw new Error('empirical: samples array is empty');
            // Linear interpolation on empirical CDF
            const idx = p * (samples.length - 1);
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            const frac = idx - lo;
            const sLo = samples[lo]!;
            const sHi = samples[hi]!;
            return sLo + (sHi - sLo) * frac;
        }
        default:
            throw new Error(`Unknown distribution: ${distribution}`);
    }
}

/**
 * Sample n values from a distribution using a seeded PRNG.
 */
export function sampleN(
    distribution: string,
    params: DistributionParams | null | undefined,
    n: number,
    seed: number = 42,
): number[] {
    const rng = mulberry32(seed);
    const out: number[] = new Array<number>(n);
    for (let i = 0; i < n; i++) out[i] = sampleFromUniform(distribution, params, rng());
    return out;
}

/**
 * Box-Muller (kept for callers that don't want inverse CDF).
 */
export function boxMuller(rng: Rng): number {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO_PI * u2);
}

function _clampOpen(u: number): number {
    if (!Number.isFinite(u)) return 0.5;
    if (u <= 0) return 1e-10;
    if (u >= 1) return 1 - 1e-10;
    return u;
}

function _validNumber(v: unknown): number {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`distribution param must be finite number (got ${String(v)})`);
    return n;
}
