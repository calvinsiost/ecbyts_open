// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DISTRIBUTION FIT — SPEC_RECONCILIATION_004 (REC-004) v1.0

   Anderson-Darling goodness-of-fit test for environmental data.
   Supports Normal, Lognormal, and Exponential distributions.

   Public API:
   - testDistributionFit(data, distributionName, params) → {statistic, criticalValues, pValue, reject, ...}
   - fitNormal(data) → {mean, sd, n}
   - fitLognormal(data) → {meanLog, sdLog, mean, sd, n}
   - fitExponential(data) → {rate, mean, n}
   - selectBestDistribution(data) → {best, fits}

   Referência:
   Anderson, T.W. & Darling, D.A. (1954) "A Test of Goodness of Fit",
   Journal of the American Statistical Association, 49(268), pp. 765–769.
   DOI: 10.2307/2281537
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Critical values tables (Anderson-Darling, standard tables)
// Índices são níveis de significância: 0.10, 0.05, 0.025, 0.01
// ──────────────────────────────────────────────────────────────────────

const CRITICAL_VALUES: Record<string, Record<number, number>> = {
    normal: Object.freeze({ 0.1: 0.631, 0.05: 0.752, 0.025: 0.873, 0.01: 1.035 }),
    lognormal: Object.freeze({ 0.1: 0.631, 0.05: 0.752, 0.025: 0.873, 0.01: 1.035 }),
    exponential: Object.freeze({ 0.1: 1.062, 0.05: 1.321, 0.025: 1.591, 0.01: 1.959 }),
};

// ──────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Standard normal CDF approximation.
 * Abramowitz & Stegun §26.2.17 - maximum absolute error ≤ 7.5×10⁻⁸.
 * Suficiente para aplicações ambientais de campo.
 * @param z
 * @returns P(Z ≤ z)
 */
function normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const tail = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly;
    return z >= 0 ? tail : 1 - tail;
}

/**
 * Exponential CDF: F(x) = 1 − exp(−rate × x), for x ≥ 0.
 * @param x
 * @param rate - λ > 0
 */
function exponentialCDF(x: number, rate: number): number {
    if (x < 0) return 0;
    return 1 - Math.exp(-rate * x);
}

/**
 * Validate and sort input data array.
 * Lança RangeError se n < 3.
 * @param data
 * @returns sorted copy ascending
 */
function _prepareData(data: number[]): number[] {
    if (!Array.isArray(data) || data.length < 3) {
        throw new RangeError('Anderson-Darling test requires at least 3 data points (n ≥ 3).');
    }
    return [...data].sort((a, b) => a - b);
}

/**
 * Core Anderson-Darling A² statistic.
 * Applies the standard formula on an array of CDF values F(x_1) … F(x_n)
 * where x values have already been sorted ascending.
 *
 * A² = -n - (1/n) × Σ(i=1..n) (2i-1)[ln(F(x_i)) + ln(1 - F(x_{n+1-i}))]
 *
 * Clamps F to [ε, 1-ε] to avoid log(0).
 *
 * @param cdfValues - F(x_i) for i=1..n, sorted ascending
 */
function _andersonDarlingStatistic(cdfValues: number[]): number {
    const n = cdfValues.length;
    const EPS = 1e-10;
    let sum = 0;
    for (let i = 0; i < n; i++) {
        const fi = Math.max(EPS, Math.min(1 - EPS, cdfValues[i] as number));
        const fj = Math.max(EPS, Math.min(1 - EPS, cdfValues[n - 1 - i] as number));
        sum += (2 * (i + 1) - 1) * (Math.log(fi) + Math.log(1 - fj));
    }
    return -n - sum / n;
}

/**
 * Determina o bracket de p-value baseado no A² calculado e nos valores críticos.
 * @param statistic
 * @param cv - critical values object
 * @returns human-readable bracket
 */
function _pValueBracket(statistic: number, cv: Record<number, number>): string {
    if (statistic <= (cv[0.1] as number)) return 'p > 0.10';
    if (statistic <= (cv[0.05] as number)) return '0.05 < p ≤ 0.10';
    if (statistic <= (cv[0.025] as number)) return '0.025 < p ≤ 0.05';
    if (statistic <= (cv[0.01] as number)) return '0.01 < p ≤ 0.025';
    return 'p ≤ 0.01';
}

// ──────────────────────────────────────────────────────────────────────
// MLE parameter estimation (exported)
// ──────────────────────────────────────────────────────────────────────

/**
 * Maximum Likelihood Estimates for Normal distribution.
 * MLE: mean = x̄, sd = sqrt(Σ(xi - x̄)² / n)  [denominator n, not n-1]
 *
 * @param data - raw values, any order
 */
export function fitNormal(data: number[]): Readonly<{ mean: number; sd: number; n: number }> {
    if (!Array.isArray(data) || data.length < 1) {
        throw new RangeError('fitNormal requires at least 1 data point.');
    }
    const n = data.length;
    const mean = data.reduce((s, x) => s + x, 0) / n;
    const variance = data.reduce((s, x) => s + (x - mean) ** 2, 0) / n;
    const sd = Math.sqrt(variance);
    return Object.freeze({ mean, sd, n });
}

/**
 * Maximum Likelihood Estimates for Lognormal distribution.
 * MLE aplicado a log(x): meanLog = mean(ln xi), sdLog = sqrt(Σ(ln xi - meanLog)² / n).
 * Back-transform:
 *   mean = exp(meanLog + sdLog² / 2)
 *   sd   = mean × sqrt(exp(sdLog²) - 1)
 *
 * @param data - strictly positive values
 */
export function fitLognormal(
    data: number[],
): Readonly<{ meanLog: number; sdLog: number; mean: number; sd: number; n: number }> {
    if (!Array.isArray(data) || data.length < 1) {
        throw new RangeError('fitLognormal requires at least 1 data point.');
    }
    const n = data.length;
    const logs = data.map((x) => Math.log(x));
    const meanLog = logs.reduce((s, v) => s + v, 0) / n;
    const variance = logs.reduce((s, v) => s + (v - meanLog) ** 2, 0) / n;
    const sdLog = Math.sqrt(variance);
    const mean = Math.exp(meanLog + (sdLog * sdLog) / 2);
    const sd = mean * Math.sqrt(Math.exp(sdLog * sdLog) - 1);
    return Object.freeze({ meanLog, sdLog, mean, sd, n });
}

/**
 * Maximum Likelihood Estimates for Exponential distribution.
 * MLE: rate = n / Σxi,  mean = 1 / rate.
 *
 * @param data - non-negative values
 */
export function fitExponential(data: number[]): Readonly<{ rate: number; mean: number; n: number }> {
    if (!Array.isArray(data) || data.length < 1) {
        throw new RangeError('fitExponential requires at least 1 data point.');
    }
    const n = data.length;
    const sum = data.reduce((s, x) => s + x, 0);
    const rate = n / sum;
    const mean = 1 / rate;
    return Object.freeze({ rate, mean, n });
}

// ──────────────────────────────────────────────────────────────────────
// Anderson-Darling test
// ──────────────────────────────────────────────────────────────────────

/**
 * Anderson-Darling goodness-of-fit test.
 *
 * Testa se `data` é compatível com `distributionName` dado os parâmetros `params`
 * (ou MLE se `params` omitido).
 *
 * Fórmula:
 *   A² = -n - (1/n) × Σ(2i-1)[ln(F(x_i)) + ln(1 - F(x_{n+1-i}))]
 *   onde x_1 ≤ … ≤ x_n são dados ordenados e F é a CDF teórica.
 *
 * Referência: Anderson & Darling (1954) DOI:10.2307/2281537
 *
 * @param data - array of numbers, non-censored, ≥3 values
 * @param distributionName
 * @param params
 * @throws {RangeError} if n < 3
 * @throws {TypeError} if distributionName is unknown
 */
export function testDistributionFit(
    data: number[],
    distributionName: 'normal' | 'lognormal' | 'exponential',
    params?: { mean?: number; sd?: number; meanLog?: number; sdLog?: number; rate?: number },
): Readonly<{
    statistic: number;
    criticalValues: Readonly<Record<number, number>>;
    pValue: string;
    reject: boolean;
    distribution: string;
    n: number;
    params: Readonly<object>;
}> {
    const sorted = _prepareData(data);
    const n = sorted.length;

    if (!CRITICAL_VALUES[distributionName]) {
        throw new TypeError(`Unknown distribution '${distributionName}'. Supported: normal, lognormal, exponential.`);
    }

    let fittedParams;
    let cdfValues;

    if (distributionName === 'normal') {
        const fit =
            params && params.mean !== undefined && params.sd !== undefined
                ? { mean: params.mean, sd: params.sd }
                : fitNormal(sorted);
        fittedParams = Object.freeze({ mean: fit.mean, sd: fit.sd });
        cdfValues = sorted.map((x) => normalCDF((x - fit.mean) / fit.sd));
    } else if (distributionName === 'lognormal') {
        const fit =
            params && params.meanLog !== undefined && params.sdLog !== undefined
                ? { meanLog: params.meanLog, sdLog: params.sdLog }
                : fitLognormal(sorted);
        fittedParams = Object.freeze({ meanLog: fit.meanLog, sdLog: fit.sdLog });
        // Aplica CDF normal sobre log-transformados
        cdfValues = sorted.map((x) => normalCDF((Math.log(x) - fit.meanLog) / fit.sdLog));
    } else {
        // exponential
        const fit = params && params.rate !== undefined ? { rate: params.rate } : fitExponential(sorted);
        fittedParams = Object.freeze({ rate: fit.rate });
        cdfValues = sorted.map((x) => exponentialCDF(x, fit.rate));
    }

    const statistic = _andersonDarlingStatistic(cdfValues);
    const cv = CRITICAL_VALUES[distributionName];
    const pValue = _pValueBracket(statistic, cv);
    const reject = statistic > (cv[0.05] as number);

    return Object.freeze({
        statistic,
        criticalValues: cv,
        pValue,
        reject,
        distribution: distributionName,
        n,
        params: fittedParams,
    });
}

// ──────────────────────────────────────────────────────────────────────
// Best distribution selector
// ──────────────────────────────────────────────────────────────────────

/**
 * Testa as três distribuições e retorna a que melhor ajusta os dados (menor A²).
 * Propaga RangeError se n < 3 (valida antes de testar distribuições).
 *
 * @param data - array de números, ≥3 valores
 * @throws {RangeError} if n < 3
 */
export function selectBestDistribution(data: number[]): Readonly<{
    best: string;
    fits: Array<Readonly<{ distribution: string; statistic: number; reject: boolean }>>;
}> {
    // Valida n antes de iterar - garante que RangeError propaga para o caller
    if (!Array.isArray(data) || data.length < 3) {
        throw new RangeError('selectBestDistribution requires at least 3 data points (n ≥ 3).');
    }

    const distributions: Array<'normal' | 'lognormal' | 'exponential'> = ['normal', 'lognormal', 'exponential'];
    const unsorted = distributions.map((name) => {
        try {
            const result = testDistributionFit(data, name);
            // Trata NaN estatística (ex: lognormal sobre dados com negativos)
            const statistic = Number.isFinite(result.statistic) ? result.statistic : Infinity;
            const reject = !Number.isFinite(statistic) || result.reject;
            return Object.freeze({ distribution: name, statistic, reject });
        } catch {
            // Distribuição não aplicável para este dataset
            return Object.freeze({ distribution: name, statistic: Infinity, reject: true });
        }
    });

    const sorted = [...unsorted].sort((a, b) => a.statistic - b.statistic);
    const best = sorted[0]!.distribution;

    return Object.freeze({ best, fits: sorted });
}
