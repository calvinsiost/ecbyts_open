// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Extreme Value Analysis - GEV via L-moments, Gumbel, return periods, bootstrap CI
 *
 * Implements the Generalized Extreme Value (GEV) distribution fitted by the
 * method of L-moments (Hosking & Wallis 1997). Covers Gumbel (EV Type I) as
 * the special case κ=0, return-level computation, bootstrap confidence intervals,
 * and a Kolmogorov–Smirnov goodness-of-fit test. Pure math - no DOM, IDB or
 * Three.js dependencies. Intended for environmental frequency analysis of floods,
 * storms and concentration exceedance events.
 *
 * Referências acadêmicas:
 *   - Hosking, J.R.M. & Wallis, J.R. (1997). Regional Frequency Analysis:
 *     An Approach Based on L-Moments. Cambridge University Press.
 *     ISBN 978-0-521-43045-6.
 *   - Gumbel, E.J. (1958). Statistics of Extremes. Columbia University Press.
 *   - Stedinger, J.R., Vogel, R.M. & Foufoula-Georgiou, E. (1993). Frequency
 *     analysis of extreme events. In: Handbook of Hydrology, McGraw-Hill.
 *   - IACWD (1982). Guidelines for Determining Flood Flow Frequency. Bulletin
 *     17B. US Water Resources Council.
 *   - Massey, F.J. (1951). The Kolmogorov-Smirnov test for goodness of fit.
 *     JASA, 46(253), pp. 68–78. DOI: 10.2307/2280095
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

interface GEVParams {
    xi: number;
    alpha: number;
    kappa: number;
}

interface LMomentsResult {
    l1: number;
    l2: number;
    l3: number;
    l4: number;
    lCV: number;
    lSkewness: number;
    lKurtosis: number;
    n: number;
}

interface GEVFitResult {
    xi: number;
    alpha: number;
    kappa: number;
    type: string;
    method: string;
    lMoments: object;
    gevType?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Gamma function (Lanczos approximation, accurate to ~15 significant figures).
 * Needed to compute GEV L-moment expressions that contain Γ(1+κ).
 * Reference: Press et al. (2007). Numerical Recipes, 3rd ed., §6.1.
 * @param {number} z
 * @returns {number}
 */
function gamma(z: number): number {
    // Coefficients from Lanczos g=7 approximation
    const p = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    if (z < 0.5) {
        return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    }
    const n = z - 1;
    let x = p[0] as number;
    for (let i = 1; i < p.length; i++) x += (p[i] as number) / (n + i);
    const t = n + p.length - 1.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
}

/**
 * Draw a single sample from a GEV distribution using the inverse CDF.
 * Used internally by the bootstrap routine.
 * @param {{xi:number,alpha:number,kappa:number}} params
 * @param {number} params - uniform [0,1]
 * @returns {number}
 */
function gevInverseCDF(params: GEVParams, u: number): number {
    const { xi, alpha, kappa } = params;
    if (Math.abs(kappa) < 1e-9) {
        // Gumbel special case
        return xi - alpha * Math.log(-Math.log(u));
    }
    return xi + (alpha / kappa) * (1 - Math.pow(-Math.log(u), kappa));
}

/**
 * Linear congruential PRNG seeded with a numeric value.
 * Produces reproducible bootstrap samples without relying on Math.random().
 * @param {number} seed
 * @returns {() => number} function returning uniform [0,1)
 */
function makePRNG(seed: number): () => number {
    // Park-Miller constants
    let s = seed >>> 0 || 1;
    return () => {
        s = Math.imul(s, 1664525) + 1013904223;
        return (s >>> 0) / 0x100000000;
    };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Standard annual exceedance probabilities mapped to canonical return periods.
 * Probabilities are non-exceedance: p = 1 - 1/T.
 * @type {Readonly<{T2:number,T5:number,T10:number,T25:number,T50:number,T100:number,T200:number,T500:number}>}
 */
export const RETURN_PERIOD_PROBABILITIES: Readonly<{
    T2: number;
    T5: number;
    T10: number;
    T25: number;
    T50: number;
    T100: number;
    T200: number;
    T500: number;
}> = Object.freeze({
    T2: 0.5,
    T5: 0.8,
    T10: 0.9,
    T25: 0.96,
    T50: 0.98,
    T100: 0.99,
    T200: 0.995,
    T500: 0.998,
});

/**
 * Compute the first four L-moments and L-ratios from a data sample.
 *
 * L-moments are computed from Probability Weighted Moments (PWMs) using the
 * unbiased sample estimator (Hosking 1990, eq. 2):
 *   β_r = (1/n) Σ_{i=1}^{n} C(i-1,r)/C(n-1,r) × x_{i:n}
 *
 * Linear combinations (Hosking 1990, eq. 6):
 *   λ1 = β0
 *   λ2 = 2β1 − β0
 *   λ3 = 6β2 − 6β1 + β0
 *   λ4 = 20β3 − 30β2 + 12β1 − β0
 *
 * @param {number[]} data - Raw sample (need not be sorted, n ≥ 4)
 * @returns {Readonly<{l1:number,l2:number,l3:number,l4:number,lCV:number,lSkewness:number,lKurtosis:number,n:number}>}
 * @throws {RangeError} if n < 4
 */
export function computeLMoments(data: number[]): Readonly<LMomentsResult> {
    if (!Array.isArray(data) || data.length < 4) {
        throw new RangeError(`computeLMoments: requires at least 4 observations, got ${data?.length ?? 0}.`);
    }

    // Sort ascending (copy to avoid mutating input)
    const x = [...data].sort((a, b) => a - b);
    const n = x.length;

    // Unbiased PWM estimators β0..β3
    let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0;
    for (let i = 0; i < n; i++) {
        const xi = x[i] as number;
        // C(i, r) / C(n-1, r) for r=0..3
        // r=0: always 1
        const w0 = 1;
        // r=1: i/(n-1) [only valid when i>=1, else 0]
        const w1 = i >= 1 ? i / (n - 1) : 0;
        // r=2: i*(i-1)/((n-1)*(n-2)) [only valid when i>=2]
        const w2 = i >= 2 ? (i * (i - 1)) / ((n - 1) * (n - 2)) : 0;
        // r=3: i*(i-1)*(i-2)/((n-1)*(n-2)*(n-3)) [only valid when i>=3]
        const w3 = i >= 3 ? (i * (i - 1) * (i - 2)) / ((n - 1) * (n - 2) * (n - 3)) : 0;

        b0 += w0 * xi;
        b1 += w1 * xi;
        b2 += w2 * xi;
        b3 += w3 * xi;
    }
    b0 /= n;
    b1 /= n;
    b2 /= n;
    b3 /= n;

    // L-moments
    const l1 = b0;
    const l2 = 2 * b1 - b0;
    const l3 = 6 * b2 - 6 * b1 + b0;
    const l4 = 20 * b3 - 30 * b2 + 12 * b1 - b0;

    // L-ratios
    const lCV = l2 / l1;
    const lSkewness = l2 !== 0 ? l3 / l2 : 0;
    const lKurtosis = l2 !== 0 ? l4 / l2 : 0;

    return Object.freeze({ l1, l2, l3, l4, lCV, lSkewness, lKurtosis, n });
}

/**
 * Fit a GEV distribution to the data using the method of L-moments.
 *
 * The shape parameter κ is estimated by solving the L-skewness equation
 * (Hosking 1985, eq. 3.3) via Newton–Raphson iteration:
 *   τ3 = (2(1−3^{−κ})/(1−2^{−κ})) − 3
 *
 * Scale and location follow from κ (Hosking 1985, eq. 3.1-3.2):
 *   λ2 = α × (1−2^{−κ}) × Γ(1+κ) / κ   (κ≠0)
 *   λ1 = ξ + α × (1 − Γ(1+κ)) / κ
 *
 * For κ=0 the fit reduces to `fitGumbel`.
 *
 * @param {number[]} data - Raw sample (n ≥ 4)
 * @returns {Readonly<{xi:number,alpha:number,kappa:number,type:string,method:string,lMoments:object}>}
 * @throws {RangeError} if n < 4
 */
export function fitGEV(data: number[]): Readonly<GEVFitResult> {
    const lm = computeLMoments(data);
    const { l1, l2, lSkewness: t3 } = lm;

    // Newton-Raphson to solve for κ from τ3
    // f(κ) = τ3_gev(κ) − t3 = 0
    // τ3_gev(κ) = 2(1−3^{−κ})/(1−2^{−κ}) − 3
    const MAX_ITER = 50;
    const TOL = 1e-8;

    // Initial guess (Hosking 1997 approximation for |τ3| < 0.9)
    let kappa;
    if (Math.abs(t3) < 0.9) {
        // Cubic approximation from Hosking (1997), Table A1 row for τ3
        kappa = -(7.859 * t3 + 2.9554 * t3 * t3);
    } else {
        kappa = t3 >= 0 ? -0.3 : 0.3;
    }

    for (let iter = 0; iter < MAX_ITER; iter++) {
        // Avoid degenerate kappa values
        if (Math.abs(kappa) < 1e-9) {
            kappa = 1e-9;
            break;
        }
        const pow2 = Math.pow(2, -kappa);
        const pow3 = Math.pow(3, -kappa);
        const denom = 1 - pow2;
        if (Math.abs(denom) < 1e-12) break;
        const tau3k = (2 * (1 - pow3)) / denom - 3;
        const f = tau3k - t3;
        // Derivative dτ3/dκ
        const ln2 = Math.LN2;
        const ln3 = Math.log(3);
        const df = (2 * (ln3 * pow3 * denom + ln2 * pow2 * (1 - pow3))) / (denom * denom);
        if (Math.abs(df) < 1e-15) break;
        const delta = f / df;
        kappa -= delta;
        if (Math.abs(delta) < TOL) break;
    }

    // Clamp kappa to a numerically stable range
    kappa = Math.max(-3, Math.min(3, kappa));

    if (Math.abs(kappa) < 1e-6) {
        // Degenerate to Gumbel
        const g = fitGumbel(data);
        return Object.freeze({ ...g, lMoments: lm });
    }

    const gammaK = gamma(1 + kappa);
    const pow2k = Math.pow(2, -kappa);
    const alpha = (l2 * kappa) / ((1 - pow2k) * gammaK);
    const xi = l1 - (alpha / kappa) * (1 - gammaK);

    const type = kappa < -1e-6 ? 'Frechet' : kappa > 1e-6 ? 'Weibull' : 'Gumbel';

    return Object.freeze({
        xi,
        alpha,
        kappa,
        type: 'GEV',
        gevType: type,
        method: 'l-moments',
        lMoments: lm,
    });
}

/**
 * Fit a Gumbel (EV Type I, κ=0) distribution via L-moments.
 *
 * Direct closed-form estimators (Hosking 1997):
 *   α = λ2 / ln 2
 *   ξ = λ1 − γ_E × α   (γ_E = 0.5772156649... Euler–Mascheroni constant)
 *
 * @param {number[]} data - Raw sample (n ≥ 4)
 * @returns {Readonly<{xi:number,alpha:number,kappa:number,type:string,method:string,lMoments:object}>}
 * @throws {RangeError} if n < 4
 */
export function fitGumbel(data: number[]): Readonly<GEVFitResult> {
    const lm = computeLMoments(data);
    const { l1, l2 } = lm;
    const EULER_MASCHERONI = 0.5772156649015329;
    const alpha = l2 / Math.LN2;
    const xi = l1 - EULER_MASCHERONI * alpha;

    return Object.freeze({
        xi,
        alpha,
        kappa: 0,
        type: 'Gumbel',
        method: 'l-moments',
        lMoments: lm,
    });
}

type GEVQuantileResult = Readonly<{
    quantile: number;
    returnPeriod: number;
    probability: number;
    params: GEVParams;
}>;

type GEVReturnLevelResult = Readonly<{
    returnLevel: number;
    returnPeriod: number;
    exceedanceProbability: number;
}>;

/**
 * Compute quantile(s) of a GEV distribution.
 *
 * Inverse CDF (Hosking & Wallis 1997, eq. 2.3):
 *   κ≠0: x(F) = ξ + α/κ × (1 − (−ln F)^κ)
 *   κ=0: x(F) = ξ − α × ln(−ln F)
 *
 * @param {{xi:number,alpha:number,kappa:number}} params - GEV/Gumbel parameters
 * @param {number|number[]} probability - Non-exceedance probability F ∈ (0,1)
 * @returns {GEVQuantileResult | GEVQuantileResult[]} Result objects with {quantile, returnPeriod, probability, params}
 */
export function quantileGEV(
    params: GEVParams,
    probability: number | number[],
): GEVQuantileResult | GEVQuantileResult[] {
    const { xi, alpha, kappa } = params;

    /**
     * Compute single quantile
     * @param {number} F - non-exceedance probability
     * @returns {GEVQuantileResult}
     */
    function single(F: number): GEVQuantileResult {
        if (F <= 0 || F >= 1) {
            throw new RangeError(`quantileGEV: probability must be in (0,1), got ${F}.`);
        }
        let q;
        if (Math.abs(kappa) < 1e-9) {
            // Gumbel
            q = xi - alpha * Math.log(-Math.log(F));
        } else {
            q = xi + (alpha / kappa) * (1 - Math.pow(-Math.log(F), kappa));
        }
        return Object.freeze({
            quantile: q,
            returnPeriod: 1 / (1 - F),
            probability: F,
            params,
        });
    }

    if (Array.isArray(probability)) {
        return probability.map(single);
    }
    return single(probability);
}

/**
 * Compute return level(s) for given return period(s).
 *
 * The annual non-exceedance probability is p = 1 − 1/T, so for
 * T = 100 yr → p = 0.99 (assuming annual maxima series).
 *
 * @param {{xi:number,alpha:number,kappa:number}} params - GEV/Gumbel parameters
 * @param {number|number[]} returnPeriod - Return period T in years (T > 1)
 * @returns {GEVReturnLevelResult | GEVReturnLevelResult[]} Result objects with {returnLevel, returnPeriod, exceedanceProbability}
 */
export function computeReturnLevel(
    params: GEVParams,
    returnPeriod: number | number[],
): GEVReturnLevelResult | GEVReturnLevelResult[] {
    /**
     * @param {number} T
     * @returns {GEVReturnLevelResult}
     */
    function single(T: number): GEVReturnLevelResult {
        if (T <= 1) {
            throw new RangeError(`computeReturnLevel: returnPeriod must be > 1, got ${T}.`);
        }
        const p = 1 - 1 / T;
        const r = quantileGEV(params, p) as GEVQuantileResult;
        return Object.freeze({
            returnLevel: r.quantile,
            returnPeriod: T,
            exceedanceProbability: 1 / T,
        });
    }

    if (Array.isArray(returnPeriod)) {
        return returnPeriod.map(single);
    }
    return single(returnPeriod);
}

/**
 * Compute bootstrap parametric confidence interval for a return level.
 *
 * Procedure:
 *  1. Fit GEV to original data → θ̂.
 *  2. For each of nBootstrap replications:
 *     a. Draw n samples from GEV(θ̂) using inverse CDF.
 *     b. Fit GEV to bootstrap sample → θ*_b.
 *     c. Compute quantile x*_b at non-exceedance probability 1 − 1/T.
 *  3. Return (α/2, 1−α/2) percentiles of {x*_b} as CI.
 *
 * @param {number[]} data - Raw annual maxima sample (n ≥ 4)
 * @param {number} returnPeriod - Return period T (years, > 1)
 * @param {{nBootstrap?:number, alpha?:number}} [options]
 * @returns {Readonly<{lower:number,upper:number,estimate:number,returnPeriod:number,confidence:number,method:string}>}
 */
export function computeReturnLevelCI(
    data: number[],
    returnPeriod: number,
    options: { nBootstrap?: number; alpha?: number } = {},
): Readonly<{
    lower: number;
    upper: number;
    estimate: number;
    returnPeriod: number;
    confidence: number;
    method: string;
}> {
    const { nBootstrap = 1000, alpha = 0.05 } = options;
    const n = data.length;

    // Point estimate from original data
    const fitOriginal = fitGEV(data);
    const estimate = (computeReturnLevel(fitOriginal, returnPeriod) as GEVReturnLevelResult).returnLevel;

    const prng = makePRNG(0xdeadbeef + n);
    const bootLevels: number[] = [];

    for (let b = 0; b < nBootstrap; b++) {
        // Generate bootstrap sample from fitted GEV
        const sample: number[] = [];
        for (let i = 0; i < n; i++) {
            // Avoid edge values (0 and 1) which give ±Infinity
            let u = prng();
            while (u <= 0 || u >= 1) u = prng();
            sample.push(gevInverseCDF(fitOriginal, u));
        }

        try {
            const fitBoot = fitGEV(sample);
            const rl = (computeReturnLevel(fitBoot, returnPeriod) as GEVReturnLevelResult).returnLevel;
            if (isFinite(rl)) bootLevels.push(rl);
        } catch (e) {
            const err = e as Error;
            console.debug('[extremeValueAnalysis] bootGEV:', err?.message || err);
            // Skip degenerate bootstrap samples (e.g., all values equal)
        }
    }

    bootLevels.sort((a, b) => a - b);
    const m = bootLevels.length;
    const loIdx = Math.floor((alpha / 2) * m);
    const hiIdx = Math.min(Math.floor((1 - alpha / 2) * m), m - 1);

    return Object.freeze({
        lower: bootLevels[loIdx] ?? estimate,
        upper: bootLevels[hiIdx] ?? estimate,
        estimate,
        returnPeriod,
        confidence: 1 - alpha,
        method: 'bootstrap-parametric',
    });
}

/**
 * Kolmogorov–Smirnov goodness-of-fit test for a fitted GEV distribution.
 *
 * Computes the empirical CDF using the Weibull plotting position
 * i/(n+1), then calculates:
 *   D_n = max_i |F_emp(x_i) − F_GEV(x_i)|
 *
 * p-value approximation (Massey 1951, large-sample):
 *   P(D_n > D) ≈ 2 Σ_{k=1}^{∞} (−1)^{k+1} exp(−2k²z²)
 *   where z = D_n × (√n + 0.12 + 0.11/√n)
 *
 * @param {number[]} data - Observed sample (n ≥ 4)
 * @param {{xi:number,alpha:number,kappa:number}} params - Fitted GEV/Gumbel params
 * @returns {Readonly<{Dn:number,pValue:number,reject:boolean,n:number}>}
 */
export function goodnessOfFitKS(
    data: number[],
    params: GEVParams,
): Readonly<{ Dn: number; pValue: number; reject: boolean; n: number }> {
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    const { xi, alpha, kappa } = params;

    /**
     * GEV CDF at x.
     * @param {number} x
     * @returns {number}
     */
    function gevCDF(x: number): number {
        if (Math.abs(kappa) < 1e-9) {
            // Gumbel
            return Math.exp(-Math.exp(-(x - xi) / alpha));
        }
        const arg = 1 - (kappa * (x - xi)) / alpha;
        if (arg <= 0) return kappa < 0 ? 1 : 0;
        return Math.exp(-Math.pow(arg, 1 / kappa));
    }

    let Dn = 0;
    for (let i = 0; i < n; i++) {
        // Weibull plotting position (unbiased for uniform distribution)
        const Femp_above = (i + 1) / (n + 1);
        const Femp_below = i / (n + 1);
        const Ftheo = gevCDF(sorted[i] as number);
        const d = Math.max(Math.abs(Femp_above - Ftheo), Math.abs(Femp_below - Ftheo));
        if (d > Dn) Dn = d;
    }

    // Massey (1951) large-sample approximation for KS p-value
    const z = Dn * (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n));
    let pValue = 0;
    for (let k = 1; k <= 100; k++) {
        const term = Math.pow(-1, k + 1) * Math.exp(-2 * k * k * z * z);
        pValue += term;
        if (Math.abs(term) < 1e-10) break;
    }
    pValue = Math.max(0, Math.min(1, 2 * pValue));

    return Object.freeze({ Dn, pValue, reject: pValue < 0.05, n });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const extremeValueAnalysisMeta: AnalyticsModuleMeta = {
    name: 'extremeValueAnalysis',
    description: 'extremeValueAnalysis',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Análise de valores extremos (GEV/Gumbel + return periods)
    // Reference: Coles (2001) An Introduction to Statistical Modeling of Extreme Values
    inputSchema: {
        type: 'object',
        properties: {
            data: { type: 'array', items: { type: 'number' }, minItems: 10, description: 'Série temporal de máximos (≥10 pontos)' },
            method: { type: 'string', enum: ['gev', 'gumbel', 'lMoments'], default: 'lMoments' },
            returnPeriods: { type: 'array', items: { type: 'number' }, default: [2, 5, 10, 25, 50, 100] },
        },
        required: ['data'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            distribution: { type: 'string', enum: ['GEV', 'Gumbel'] },
            params: { type: 'object', description: 'Location, scale, shape (ξ, σ, μ)' },
            returnLevels: { type: 'object', description: 'Mapping return period → quantile' },
            n: { type: 'number' },
        },
        required: ['distribution', 'params', 'returnLevels'],
    },
};
