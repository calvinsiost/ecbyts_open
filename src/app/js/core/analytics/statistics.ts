// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   STATISTICS — Pure mathematical functions for trend analysis
   ================================================================

   Biblioteca de metodos estatisticos para analise ambiental.
   Todas as funcoes sao deterministicas (sem LLM).

   METODOS:
   - Regressao Linear (OLS) com R²
   - Teste de Mann-Kendall (tendencia monotonica nao-parametrica)
   - Estimador de Inclinacao de Sen (mediana robusta)
   - Analise de ordem de grandeza

   ================================================================ */

// ================================================================
// LINEAR REGRESSION - Ordinary Least Squares
// Regressao linear pelo metodo dos minimos quadrados
// ================================================================

/**
 * Compute linear regression (OLS) with R².
 * Calcula regressao linear com coeficiente de determinacao.
 *
 * @param {number[]} x - Independent variable (timestamps or indices)
 * @param {number[]} y - Dependent variable (observed values)
 * @returns {Object} { slope, intercept, r2, n }
 */
export function linearRegression(x: number[], y: number[]): Object {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0, r2: 0, n };

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((a, xi, i) => a + xi * (y[i] as number), 0);
    const sumXX = x.reduce((a, xi) => a + xi * xi, 0);

    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-10) {
        return { slope: 0, intercept: sumY / n, r2: 0, n };
    }

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    // R² calculation
    const meanY = sumY / n;
    const ssTotal = y.reduce((a, yi) => a + (yi - meanY) ** 2, 0);
    const ssResidual = y.reduce((a, yi, i) => {
        const predicted = slope * (x[i] as number) + intercept;
        return a + (yi - predicted) ** 2;
    }, 0);

    const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

    return { slope, intercept, r2, n };
}

/**
 * Calculate R² for observed vs predicted.
 * Calcula coeficiente de determinacao.
 *
 * @param {number[]} observed
 * @param {number[]} predicted
 * @returns {number} R² value (0-1)
 */
export function calculateR2(observed: number[], predicted: number[]): number {
    const n = observed.length;
    if (n < 2) return 0;

    const mean = observed.reduce((a, b) => a + b, 0) / n;
    const ssTotal = observed.reduce((a, y) => a + (y - mean) ** 2, 0);
    const ssResidual = observed.reduce((a, y, i) => a + (y - (predicted[i] as number)) ** 2, 0);

    return ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;
}

// ================================================================
// MANN-KENDALL TREND TEST - Non-parametric monotonic trend
// Teste nao-parametrico para tendencia monotonica
// ================================================================

/**
 * Mann-Kendall trend test.
 * Teste de tendencia de Mann-Kendall com correcao para empates.
 *
 * Hipotese nula: nao ha tendencia monotonica na serie temporal.
 * Se |Z| > 1.96, rejeita H0 com 95% de confianca.
 *
 * @param {number[]} values - Time series values (in chronological order)
 * @returns {Object} { S, variance, Z, pValue, tau, trend, significant }
 */
export function mannKendall(values: number[]): Object {
    const n = values.length;
    if (n < 4) {
        return { S: 0, variance: 0, Z: 0, pValue: 1, tau: 0, trend: 'insufficient_data', significant: false };
    }

    // Calculate S statistic
    let S = 0;
    for (let k = 0; k < n - 1; k++) {
        for (let j = k + 1; j < n; j++) {
            const diff = (values[j] as number) - (values[k] as number);
            if (diff > 0) S++;
            else if (diff < 0) S--;
        }
    }

    // Count ties
    const tieGroups = countTieGroups(values);

    // Variance with tie correction
    // Var(S) = [n(n-1)(2n+5) - Σ tp(tp-1)(2tp+5)] / 18
    let variance = n * (n - 1) * (2 * n + 5);
    for (const tp of tieGroups) {
        variance -= tp * (tp - 1) * (2 * tp + 5);
    }
    variance /= 18;

    // Z statistic (continuity correction)
    let Z = 0;
    if (variance > 0) {
        if (S > 0) Z = (S - 1) / Math.sqrt(variance);
        else if (S < 0) Z = (S + 1) / Math.sqrt(variance);
    }

    // Kendall's tau
    const nPairs = (n * (n - 1)) / 2;
    const tau = nPairs > 0 ? S / nPairs : 0;

    // p-value (two-tailed, normal approximation)
    const pValue = 2 * (1 - normalCDF(Math.abs(Z)));

    // Trend determination
    let trend = 'stable';
    const significant = pValue < 0.05;
    if (significant) {
        trend = S > 0 ? 'increasing' : 'decreasing';
    }

    return { S, variance, Z, pValue, tau, trend, significant };
}

/**
 * Count tie groups in a series.
 * Conta grupos de empates numa serie.
 *
 * @param {number[]} values
 * @returns {number[]} Array of tie group sizes (only groups > 1)
 */
function countTieGroups(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const groups = [];
    let i = 0;

    while (i < sorted.length) {
        let count = 1;
        while (i + count < sorted.length && sorted[i + count] === sorted[i]) {
            count++;
        }
        if (count > 1) groups.push(count);
        i += count;
    }

    return groups;
}

/**
 * Standard normal CDF approximation.
 * Funcao de distribuicao acumulada normal padrao.
 * Abramowitz & Stegun approximation (max error 7.5e-8).
 *
 * @param {number} x
 * @returns {number}
 */
export function normalCDF(x: number): number {
    if (x < -8) return 0;
    if (x > 8) return 1;

    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return 0.5 * (1.0 + sign * y);
}

// ================================================================
// SEN'S SLOPE ESTIMATOR - Robust median slope
// Estimador de inclinacao de Sen (mediana robusta)
// ================================================================

/**
 * Sen's slope estimator.
 * Estimador de inclinacao robusto baseado na mediana.
 * Mais resistente a outliers que OLS.
 *
 * @param {number[]} x - Independent variable (timestamps or indices)
 * @param {number[]} y - Dependent variable (observed values)
 * @returns {Object} { slope, intercept, lowerCI, upperCI }
 */
export function sensSlope(x: number[], y: number[]): Object {
    const n = x.length;
    if (n < 2) return { slope: 0, intercept: 0, lowerCI: 0, upperCI: 0 };

    // Calculate all pairwise slopes
    const slopes = [];
    for (let i = 0; i < n - 1; i++) {
        for (let j = i + 1; j < n; j++) {
            if (x[j] !== x[i]) {
                slopes.push(((y[j] as number) - (y[i] as number)) / ((x[j] as number) - (x[i] as number)));
            }
        }
    }

    if (slopes.length === 0) {
        return { slope: 0, intercept: median(y), lowerCI: 0, upperCI: 0 };
    }

    slopes.sort((a, b) => a - b);
    const slope = median(slopes);

    // Intercept: median of (y_i - slope * x_i)
    const intercepts = y.map((yi, i) => yi - slope * (x[i] as number));
    const intercept = median(intercepts);

    // 95% confidence interval for slope
    // Using normal approximation
    const N = slopes.length;
    const Zalpha = 1.96; // 95% CI
    const Calpha = Zalpha * Math.sqrt((n * (n - 1) * (2 * n + 5)) / 18);
    const lowerIdx = Math.max(0, Math.floor((N - Calpha) / 2));
    const upperIdx = Math.min(N - 1, Math.ceil((N + Calpha) / 2));

    return {
        slope,
        intercept,
        lowerCI: slopes[lowerIdx] || slope,
        upperCI: slopes[upperIdx] || slope,
    };
}

/**
 * Calculate median of an array.
 * @param {number[]} arr
 * @returns {number}
 */
function median(arr: number[]): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

// ================================================================
// ORDER OF MAGNITUDE - Anomaly detection
// Deteccao de anomalias por ordem de grandeza
// ================================================================

/**
 * Check if a value deviates by more than 1 order of magnitude.
 * Verifica se um valor difere mais de 1 ordem de grandeza do esperado.
 *
 * @param {number} value - Observed value
 * @param {{min: number, max: number}} expectedRange - { min, max } expected range
 * @returns {Object} { magnitude, deviation, isAnomaly, direction }
 */
export function orderOfMagnitude(value: number, expectedRange: {min: number, max: number}): Object {
    if (!expectedRange || value === 0) {
        return { magnitude: 0, deviation: 0, isAnomaly: false, direction: 'normal' };
    }

    const absValue = Math.abs(value);
    const refValue = (expectedRange.min + expectedRange.max) / 2 || 1;
    const absRef = Math.abs(refValue);

    if (absRef === 0) {
        return { magnitude: 0, deviation: 0, isAnomaly: false, direction: 'normal' };
    }

    const ratio = absValue / absRef;
    const magnitude = Math.log10(ratio);

    const isAnomaly = Math.abs(magnitude) > 1; // >10x or <0.1x
    let direction = 'normal';
    if (isAnomaly) {
        direction = magnitude > 0 ? 'high' : 'low';
    }

    return { magnitude, deviation: ratio, isAnomaly, direction };
}

// ================================================================
// DESCRIPTIVE STATISTICS - Basic measures
// Estatisticas descritivas basicas
// ================================================================

/**
 * Calculate comprehensive descriptive statistics.
 * Calcula estatisticas descritivas completas.
 *
 * @param {number[]} values
 * @returns {Object}
 */
export function descriptiveStats(values: number[]): Object {
    const n = values.length;
    if (n === 0) return { n: 0, mean: 0, std: 0, min: 0, max: 0, median: 0, q1: 0, q3: 0 };

    const sorted = [...values].sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / n;

    return {
        n,
        mean,
        std: Math.sqrt(variance),
        min: sorted[0],
        max: sorted[n - 1],
        median: median(sorted),
        q1: sorted[Math.floor(n * 0.25)] || sorted[0],
        q3: sorted[Math.floor(n * 0.75)] || sorted[n - 1],
    };
}

// ================================================================
// INVERSE NORMAL CDF - Quantile function (probit)
// Funcao quantil da distribuicao normal padrao
// ================================================================

/**
 * Inverse normal CDF (quantile / probit function).
 * Rational approximation by Peter Acklam (max error 1.15e-9).
 * Retorna z tal que P(Z <= z) = p para Z ~ N(0,1).
 *
 * @param {number} p - Probability (0 < p < 1)
 * @returns {number} z-quantile
 */
export function inverseNormalCDF(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    // Coefficients for rational approximation
    const a: [number, number, number, number, number, number] = [
        -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1,
        2.506628277459239,
    ];
    const b: [number, number, number, number, number] = [
        -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1,
    ];
    const c: [number, number, number, number, number, number] = [
        -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968,
        2.938163982698783,
    ];
    const d: [number, number, number, number] = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;
    let q, r;

    if (p < pLow) {
        // Rational approximation for lower region
        q = Math.sqrt(-2 * Math.log(p));
        return (
            (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
        );
    } else if (p <= pHigh) {
        // Rational approximation for central region
        q = p - 0.5;
        r = q * q;
        return (
            ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
            (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
        );
    } else {
        // Rational approximation for upper region
        q = Math.sqrt(-2 * Math.log(1 - p));
        return (
            -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
        );
    }
}

// ================================================================
// STUDENT'S T-DISTRIBUTION CDF - Hill (1970) approximation
// CDF da distribuicao t de Student
// ================================================================

/**
 * Student's t-distribution CDF.
 * Hill (1970) approximation - compacta e precisa para df >= 1.
 * Retorna P(T <= t) para T com df graus de liberdade.
 *
 * @param {number} t - Test statistic
 * @param {number} df - Degrees of freedom (>= 1)
 * @returns {number} Probability P(T <= t)
 */
export function tCDF(t: number, df: number): number {
    if (df < 1) return NaN;
    if (!isFinite(t)) return t > 0 ? 1 : 0;
    if (df >= 200) return normalCDF(t); // convergem para normal com df grande

    const x = df / (df + t * t);
    const p = 0.5 * incompleteBeta(x, df / 2, 0.5);
    return t >= 0 ? 1 - p : p;
}

/**
 * Regularized incomplete beta function I_x(a, b).
 * Continued fraction expansion (Lentz's method).
 * Usada internamente por tCDF.
 *
 * @param {number} x - Upper limit (0 <= x <= 1)
 * @param {number} a - Shape parameter a > 0
 * @param {number} b - Shape parameter b > 0
 * @returns {number}
 */
function incompleteBeta(x: number, a: number, b: number): number {
    if (x <= 0) return 0;
    if (x >= 1) return 1;

    // Use symmetry relation when x > (a+1)/(a+b+2)
    if (x > (a + 1) / (a + b + 2)) {
        return 1 - incompleteBeta(1 - x, b, a);
    }

    const lnBeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
    const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

    // Lentz's continued fraction
    let c = 1,
        d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    let f = d;

    for (let m = 1; m <= 200; m++) {
        // Even step
        let numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + numerator / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        f *= c * d;

        // Odd step
        numerator = (-(a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
        d = 1 + numerator * d;
        if (Math.abs(d) < 1e-30) d = 1e-30;
        c = 1 + numerator / c;
        if (Math.abs(c) < 1e-30) c = 1e-30;
        d = 1 / d;
        const delta = c * d;
        f *= delta;

        if (Math.abs(delta - 1) < 1e-10) break;
    }

    return front * f;
}

/**
 * Log-gamma function (Lanczos approximation).
 * Usada internamente por incompleteBeta.
 *
 * @param {number} z
 * @returns {number}
 */
function lnGamma(z: number): number {
    if (z <= 0) return Infinity;
    const g = 7;
    const coefs = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
        12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    let x = coefs[0] as number;
    for (let i = 1; i < g + 2; i++) {
        x += (coefs[i] as number) / (z + i - 1);
    }
    const t = z + g - 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z - 0.5) * Math.log(t) - t + Math.log(x);
}

// ================================================================
// BINOMIAL CDF - Exact for small n
// CDF binomial exata para amostras pequenas
// ================================================================

/**
 * Binomial CDF: P(X <= k) for X ~ Bin(n, p).
 * Somatoria direta - eficiente para n < 100 (comum em monitoramento).
 *
 * @param {number} k - Number of successes
 * @param {number} n - Number of trials
 * @param {number} p - Probability of success
 * @returns {number}
 */
export function binomialCDF(k: number, n: number, p: number): number {
    if (k < 0) return 0;
    if (k >= n) return 1;
    if (p <= 0) return 1;
    if (p >= 1) return k >= n ? 1 : 0;

    let cdf = 0;
    let term = Math.pow(1 - p, n); // P(X=0)
    cdf += term;

    for (let i = 1; i <= k; i++) {
        term *= (p / (1 - p)) * ((n - i + 1) / i);
        cdf += term;
    }

    return Math.min(1, Math.max(0, cdf));
}

// ================================================================
// WILCOXON SIGNED-RANKS TEST - Paired non-parametric
// Teste nao-parametrico pareado para comparacao de campanhas
// ================================================================

/**
 * Wilcoxon critical values table (two-tailed).
 * Tabela de valores criticos - se T <= critical, rejeita H0.
 * Indexada por [n_eff][alpha]. Para n_eff = 5..30.
 * Fonte: EPA Unified Guidance / Wilcoxon-Signed-Ranks-Table.
 */
const WILCOXON_CRITICAL = {
    // n: { alpha_0.10, alpha_0.05, alpha_0.02, alpha_0.01 }
    5: { 0.1: 1, 0.05: 1, 0.02: 0, 0.01: 0 },
    6: { 0.1: 2, 0.05: 1, 0.02: 0, 0.01: 0 },
    7: { 0.1: 4, 0.05: 2, 0.02: 0, 0.01: 0 },
    8: { 0.1: 6, 0.05: 4, 0.02: 2, 0.01: 0 },
    9: { 0.1: 8, 0.05: 6, 0.02: 3, 0.01: 2 },
    10: { 0.1: 11, 0.05: 8, 0.02: 5, 0.01: 3 },
    11: { 0.1: 14, 0.05: 11, 0.02: 7, 0.01: 5 },
    12: { 0.1: 17, 0.05: 14, 0.02: 10, 0.01: 7 },
    13: { 0.1: 21, 0.05: 17, 0.02: 13, 0.01: 10 },
    14: { 0.1: 26, 0.05: 21, 0.02: 16, 0.01: 13 },
    15: { 0.1: 30, 0.05: 25, 0.02: 20, 0.01: 16 },
    16: { 0.1: 36, 0.05: 30, 0.02: 24, 0.01: 19 },
    17: { 0.1: 41, 0.05: 35, 0.02: 28, 0.01: 23 },
    18: { 0.1: 47, 0.05: 40, 0.02: 33, 0.01: 28 },
    19: { 0.1: 54, 0.05: 46, 0.02: 38, 0.01: 32 },
    20: { 0.1: 60, 0.05: 52, 0.02: 43, 0.01: 37 },
    21: { 0.1: 68, 0.05: 59, 0.02: 49, 0.01: 43 },
    22: { 0.1: 75, 0.05: 66, 0.02: 56, 0.01: 49 },
    23: { 0.1: 83, 0.05: 73, 0.02: 62, 0.01: 55 },
    24: { 0.1: 92, 0.05: 81, 0.02: 69, 0.01: 61 },
    25: { 0.1: 101, 0.05: 90, 0.02: 77, 0.01: 68 },
    26: { 0.1: 110, 0.05: 98, 0.02: 85, 0.01: 76 },
    27: { 0.1: 120, 0.05: 107, 0.02: 93, 0.01: 84 },
    28: { 0.1: 130, 0.05: 117, 0.02: 102, 0.01: 92 },
    29: { 0.1: 141, 0.05: 127, 0.02: 111, 0.01: 100 },
    30: { 0.1: 152, 0.05: 137, 0.02: 120, 0.01: 109 },
};

/**
 * Wilcoxon Signed-Ranks test for paired samples.
 * Teste pareado nao-parametrico - compara duas campanhas (ex: antes/depois de remediacao).
 *
 * H0: A distribuicao das diferencas e simetrica em torno de zero.
 * H1: Houve mudanca significativa entre as campanhas.
 *
 * @param {Array<{x: number, y: number}>} pairs - Pares (campanha A, campanha B) por elemento
 * @param {number} [alpha=0.05] - Nivel de significancia (two-tailed)
 * @returns {{ T: number, W_plus: number, W_minus: number, n_eff: number,
 *             critical: number|null, zStat: number|null, pValue: number|null,
 *             reject: boolean, conclusion: string }}
 */
export function wilcoxonSignedRanks(pairs: Array<{x: number, y: number}>, alpha: number = 0.05): { T: number, W_plus: number, W_minus: number, n_eff: number, critical: number|null, zStat: number|null, pValue: number|null, reject: boolean, conclusion: string } {
    if (!pairs || pairs.length < 2) {
        return {
            T: 0,
            W_plus: 0,
            W_minus: 0,
            n_eff: 0,
            critical: null,
            zStat: null,
            pValue: null,
            reject: false,
            conclusion: 'insufficient_data',
        };
    }

    // 1. Calcular diferencas, remover zeros
    const diffs = [];
    for (const { x, y } of pairs) {
        const d = y - x;
        if (Math.abs(d) > 1e-15) diffs.push(d);
    }
    const n_eff = diffs.length;

    if (n_eff < 5) {
        return {
            T: 0,
            W_plus: 0,
            W_minus: 0,
            n_eff,
            critical: null,
            zStat: null,
            pValue: null,
            reject: false,
            conclusion: 'insufficient_data',
        };
    }

    // 2. Ranquear |d_i|, resolver empates pela media
    const absDiffs = diffs.map((d, i) => ({ idx: i, abs: Math.abs(d), sign: Math.sign(d) }));
    absDiffs.sort((a, b) => a.abs - b.abs);

    // Assign ranks with tied average
    const ranks = new Array(n_eff);
    let i = 0;
    while (i < n_eff) {
        let j = i;
        while (j < n_eff && (absDiffs[j] as { idx: number, abs: number, sign: number }).abs === (absDiffs[i] as { idx: number, abs: number, sign: number }).abs) j++;
        const avgRank = (i + 1 + j) / 2; // ranks sao 1-based
        for (let k = i; k < j; k++) {
            ranks[(absDiffs[k] as { idx: number, abs: number, sign: number }).idx] = avgRank;
        }
        i = j;
    }

    // 3. Somar ranks positivos e negativos
    let W_plus = 0,
        W_minus = 0;
    for (let idx = 0; idx < n_eff; idx++) {
        if ((diffs[idx] as number) > 0) W_plus += ranks[idx];
        else W_minus += ranks[idx];
    }
    const T = Math.min(W_plus, W_minus);

    // 4. Determinar rejeicao
    let critical = null,
        zStat = null,
        pValue = null,
        reject = false;

    const _wilcox = ((WILCOXON_CRITICAL as unknown) as Record<number, Record<number, number>>);
    if (n_eff <= 30 && _wilcox[n_eff]) {
        // Usar tabela de valores criticos
        const alphaKey = alpha <= 0.01 ? 0.01 : alpha <= 0.02 ? 0.02 : alpha <= 0.05 ? 0.05 : 0.1;
        critical = (_wilcox[n_eff] as Record<number, number>)[alphaKey] as number;
        reject = critical != null && T <= critical;
    }

    if (n_eff >= 10) {
        // Aproximacao normal (tambem calculada para n<=30 como complemento)
        const mean = (n_eff * (n_eff + 1)) / 4;
        const variance = (n_eff * (n_eff + 1) * (2 * n_eff + 1)) / 24;
        zStat = (T - mean) / Math.sqrt(variance);
        pValue = 2 * normalCDF(zStat); // two-tailed (T e sempre <= mean)
        if (n_eff > 30) {
            // Sem tabela - usar z
            const zCritical = inverseNormalCDF(alpha / 2);
            reject = zStat <= zCritical;
            critical = Math.round(mean + zCritical * Math.sqrt(variance));
        }
    }

    const conclusion = reject ? 'significant_change' : 'no_significant_change';
    return { T, W_plus, W_minus, n_eff, critical, zStat, pValue, reject, conclusion };
}

// ================================================================
// PAIRED T-TEST - Parametric paired comparison
// Teste t pareado parametrico
// ================================================================

/**
 * Paired t-test for two related samples.
 * Teste parametrico pareado - assume diferencas normalmente distribuidas.
 *
 * H0: Media das diferencas = 0.
 * H1: Media das diferencas != 0 (two-tailed).
 *
 * @param {Array<{x: number, y: number}>} pairs - Pares por elemento
 * @param {number} [alpha=0.05] - Nivel de significancia
 * @returns {{ tStat: number, df: number, pValue: number, reject: boolean,
 *             meanDiff: number, stdDiff: number, n: number, conclusion: string }}
 */
export function pairedTTest(pairs: Array<{x: number, y: number}>, alpha: number = 0.05): { tStat: number, df: number, pValue: number, reject: boolean, meanDiff: number, stdDiff: number, n: number, conclusion: string } {
    if (!pairs || pairs.length < 2) {
        return {
            tStat: 0,
            df: 0,
            pValue: 1,
            reject: false,
            meanDiff: 0,
            stdDiff: 0,
            n: 0,
            conclusion: 'insufficient_data',
        };
    }

    const diffs = pairs.map(({ x, y }) => y - x);
    const n = diffs.length;
    const df = n - 1;

    const sum = diffs.reduce((a, b) => a + b, 0);
    const meanDiff = sum / n;
    const variance = diffs.reduce((a, d) => a + (d - meanDiff) ** 2, 0) / df; // sample variance
    const stdDiff = Math.sqrt(variance);

    if (stdDiff < 1e-15) {
        // Todas as diferencas iguais
        const reject = Math.abs(meanDiff) > 1e-15;
        return {
            tStat: reject ? Infinity : 0,
            df,
            pValue: reject ? 0 : 1,
            reject,
            meanDiff,
            stdDiff,
            n,
            conclusion: reject ? 'significant_change' : 'no_significant_change',
        };
    }

    const tStat = meanDiff / (stdDiff / Math.sqrt(n));
    const pValue = 2 * (1 - tCDF(Math.abs(tStat), df)); // two-tailed

    const reject = pValue < alpha;
    const conclusion = reject ? 'significant_change' : 'no_significant_change';

    return { tStat, df, pValue, reject, meanDiff, stdDiff, n, conclusion };
}

// ================================================================
// SIGN TEST - Simplest non-parametric paired test
// Teste de sinais - o mais simples dos testes pareados
// ================================================================

/**
 * Sign test for paired samples.
 * Conta sinais positivos/negativos das diferencas.
 *
 * H0: P(d > 0) = P(d < 0) = 0.5 (sem tendencia direcional).
 * H1: Tendencia significativa para aumento ou diminuicao.
 *
 * @param {Array<{x: number, y: number}>} pairs - Pares por elemento
 * @param {number} [alpha=0.05] - Nivel de significancia
 * @returns {{ nPlus: number, nMinus: number, nZero: number, nEff: number,
 *             stat: number, pValue: number, reject: boolean, conclusion: string }}
 */
export function signTest(pairs: Array<{x: number, y: number}>, alpha: number = 0.05): { nPlus: number, nMinus: number, nZero: number, nEff: number, stat: number, pValue: number, reject: boolean, conclusion: string } {
    if (!pairs || pairs.length < 2) {
        return {
            nPlus: 0,
            nMinus: 0,
            nZero: 0,
            nEff: 0,
            stat: 0,
            pValue: 1,
            reject: false,
            conclusion: 'insufficient_data',
        };
    }

    let nPlus = 0,
        nMinus = 0,
        nZero = 0;
    for (const { x, y } of pairs) {
        const d = y - x;
        if (d > 1e-15) nPlus++;
        else if (d < -1e-15) nMinus++;
        else nZero++;
    }

    const nEff = nPlus + nMinus;
    if (nEff < 1) {
        return { nPlus, nMinus, nZero, nEff, stat: 0, pValue: 1, reject: false, conclusion: 'insufficient_data' };
    }

    const stat = Math.min(nPlus, nMinus);

    // p-value: exact binomial for small n, normal approximation for large n
    let pValue;
    if (nEff <= 50) {
        // Exact: P(X <= stat) under Bin(nEff, 0.5), two-tailed
        pValue = 2 * binomialCDF(stat, nEff, 0.5);
        pValue = Math.min(1, pValue);
    } else {
        // Normal approximation with continuity correction
        const z = (stat - nEff / 2 + 0.5) / Math.sqrt(nEff / 4);
        pValue = 2 * normalCDF(z);
    }

    const reject = pValue < alpha;
    const conclusion = reject ? 'significant_change' : 'no_significant_change';

    return { nPlus, nMinus, nZero, nEff, stat, pValue, reject, conclusion };
}

// ================================================================
// BACKGROUND COMPARISON - EPA Unified Guidance approach
// Comparacao de background vs compliance points
// ================================================================

/**
 * Background comparison test (nonparametric).
 * Baseado no EPA Unified Guidance - compara dados de compliance
 * contra dados de referencia (background/montante).
 *
 * Metodo: conta exceedances dos pontos de compliance acima do
 * limite superior do background (percentil). Usa distribuicao
 * binomial/normal para testar se o numero de exceedances e
 * significativamente maior que o esperado.
 *
 * H0: Dados de compliance sao consistentes com background.
 * H1: Evidencia de contaminacao (compliance > background).
 *
 * @param {number[]} compliance - Valores nos pontos de compliance (jusante)
 * @param {number[]} background - Valores nos pontos de background (montante)
 * @param {number} [alpha=0.05] - Nivel de significancia
 * @returns {{ n_c: number, n_b: number, exceedances: number,
 *             threshold: number, expected: number, zStat: number,
 *             pValue: number, reject: boolean, conclusion: string }}
 */
export function backgroundComparison(compliance: number[], background: number[], alpha: number = 0.05): { n_c: number, n_b: number, exceedances: number, threshold: number, expected: number, zStat: number, pValue: number, reject: boolean, conclusion: string } {
    if (!compliance || !background || compliance.length < 1 || background.length < 4) {
        return {
            n_c: compliance?.length || 0,
            n_b: background?.length || 0,
            exceedances: 0,
            threshold: 0,
            expected: 0,
            zStat: 0,
            pValue: 1,
            reject: false,
            conclusion: 'insufficient_data',
        };
    }

    const n_c = compliance.length;
    const n_b = background.length;

    // Calcular limite superior do background: percentil 95 (nao-parametrico)
    const sortedBg = [...background].sort((a, b) => a - b);
    const p95idx = Math.ceil(0.95 * n_b) - 1;
    const threshold = sortedBg[Math.min(p95idx, n_b - 1)] as number;

    // Contar exceedances: quantos compliance ultrapassam o threshold
    const exceedances = compliance.filter((v) => v > threshold).length;

    // Sob H0: probabilidade de exceder o P95 do background e ~0.05
    const p0 = 0.05;
    const expected = n_c * p0;

    // Teste exato (binomial) ou normal approximation
    let pValue;
    if (n_c <= 50) {
        // Exact: P(X >= exceedances) = 1 - P(X <= exceedances-1)
        pValue = 1 - binomialCDF(exceedances - 1, n_c, p0);
    } else {
        // Normal approximation
        const mean = n_c * p0;
        const std = Math.sqrt(n_c * p0 * (1 - p0));
        const zStat = (exceedances - mean - 0.5) / std; // continuity correction
        pValue = 1 - normalCDF(zStat); // one-tailed (excedencia e unidirecional)
    }

    const variance = n_c * p0 * (1 - p0);
    const zStat = variance > 0 ? (exceedances - expected) / Math.sqrt(variance) : 0;

    const reject = pValue < alpha;
    const conclusion = reject ? 'evidence_contamination' : 'consistent_background';

    return { n_c, n_b, exceedances, threshold, expected, zStat, pValue, reject, conclusion };
}

// ================================================================
// D2 EXPANSÃO ESTATÍSTICA - Temporal KPI Analysis
// Adicionado em 2026-03-09 - ciclo D2
// Requer jStat (carregado via loadScriptCDN quando necessário)
// ================================================================

/**
 * @typedef {Object} JStatLib
 * @property {{cdf:(x:number,m:number,s:number)=>number, inv:(p:number,m:number,s:number)=>number}} normal
 * @property {{cdf:(x:number,df:number)=>number, inv:(p:number,df:number)=>number}} studentt
 * @property {{cdf:(x:number,df1:number,df2:number)=>number, inv:(p:number,df1:number,df2:number)=>number}} centralF
 * @property {{cdf:(x:number,df:number)=>number, inv:(p:number,df:number)=>number}} chisquare
 * @property {(arr:number[])=>number[]} rank
 */
interface JStatLib {
    normal: { cdf: (x: number, m: number, s: number) => number, inv: (p: number, m: number, s: number) => number };
    studentt: { cdf: (x: number, df: number) => number, inv: (p: number, df: number) => number };
    centralF: { cdf: (x: number, df1: number, df2: number) => number, inv: (p: number, df1: number, df2: number) => number };
    chisquare: { cdf: (x: number, df: number) => number, inv: (p: number, df: number) => number };
    rank: (arr: number[]) => number[];
}

/** @returns {JStatLib} jStat global — lança se não carregado */
function getJStat() {
    const w = (typeof window !== 'undefined' ? window : {} as any);
    if (w && w.jStat) return (w.jStat as JStatLib);
    throw new Error('jStat não carregado. Use loadScriptCDN antes de chamar funções D2.');
}

// ================================================================
// NORMALIDADE - Shapiro-Wilk e Kolmogorov-Smirnov
// ================================================================

/**
 * Shapiro-Wilk normality test - valid for n = 3..50
 * Teste de normalidade de Shapiro-Wilk (1965) com aproximação de Royston (1992)
 * @param {number[]} values
 * @param {number} [_alpha=0.05]
 * @returns {{ W: number, pValue: number, normal: boolean|null, n: number, method: string, error?: string }}
 */
export function shapiroWilk(values: number[], _alpha: number = 0.05): { W: number, pValue: number, normal: boolean|null, n: number, method: string, error?: string } {
    const x = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const n = x.length;
    if (n < 3 || n > 50) {
        return { W: NaN, pValue: NaN, normal: null, n, method: 'shapiro-wilk', error: `n=${n} fora do intervalo 3–50` };
    }

    const A_TABLE = {
        3: [0.7071],
        4: [0.6872, 0.1677],
        5: [0.6646, 0.2413],
        6: [0.6431, 0.2806, 0.0875],
        7: [0.6233, 0.3031, 0.1401],
        8: [0.6052, 0.3164, 0.1743, 0.0561],
        9: [0.5888, 0.3244, 0.1976, 0.0947],
        10: [0.5739, 0.3291, 0.2141, 0.1224, 0.0399],
        11: [0.5601, 0.3315, 0.226, 0.1429, 0.0695],
        12: [0.5475, 0.3325, 0.2347, 0.1586, 0.0922, 0.0303],
        13: [0.5359, 0.3325, 0.2412, 0.1707, 0.1099, 0.0539],
        14: [0.5251, 0.3318, 0.246, 0.1802, 0.124, 0.0727, 0.024],
        15: [0.515, 0.3306, 0.2495, 0.1878, 0.1353, 0.088, 0.0433],
        16: [0.5056, 0.329, 0.2521, 0.1939, 0.1447, 0.1013, 0.061, 0.0202],
        17: [0.4968, 0.3273, 0.254, 0.1988, 0.1524, 0.1128, 0.0764, 0.0381],
        18: [0.4886, 0.3253, 0.2553, 0.2027, 0.1587, 0.1231, 0.0899, 0.053, 0.0177],
        19: [0.4808, 0.3232, 0.2561, 0.2059, 0.1641, 0.1323, 0.102, 0.0663, 0.0333],
        20: [0.4734, 0.3211, 0.2565, 0.2085, 0.1686, 0.1404, 0.1128, 0.0782, 0.048, 0.0163],
        21: [0.4643, 0.3185, 0.2578, 0.2119, 0.1736, 0.1475, 0.1228, 0.0909, 0.0638, 0.0326],
        22: [0.459, 0.3156, 0.2571, 0.2131, 0.1764, 0.1499, 0.1285, 0.1009, 0.076, 0.0497, 0.0163],
        23: [0.4542, 0.3126, 0.2563, 0.2139, 0.1787, 0.1526, 0.133, 0.1099, 0.0879, 0.0619, 0.0321],
        24: [0.4493, 0.3098, 0.2554, 0.2145, 0.1807, 0.1547, 0.1365, 0.1168, 0.098, 0.071, 0.0464, 0.015],
        25: [0.445, 0.3069, 0.2543, 0.2148, 0.1822, 0.1568, 0.1395, 0.1228, 0.1066, 0.0804, 0.0563, 0.0307],
        26: [0.4407, 0.3043, 0.2533, 0.2151, 0.1836, 0.1586, 0.142, 0.1279, 0.1141, 0.0887, 0.0653, 0.0435, 0.0145],
        27: [0.4366, 0.3018, 0.2522, 0.2152, 0.1848, 0.1603, 0.144, 0.1321, 0.1201, 0.096, 0.0737, 0.0522, 0.0299],
        28: [
            0.4328, 0.2992, 0.251, 0.2151, 0.1857, 0.1618, 0.146, 0.1353, 0.1252, 0.1024, 0.0812, 0.0608, 0.0368,
            0.0122,
        ],
        29: [
            0.4291, 0.2968, 0.2499, 0.215, 0.1864, 0.163, 0.1477, 0.138, 0.1295, 0.108, 0.0878, 0.0684, 0.0424, 0.0228,
        ],
        30: [
            0.4254, 0.2944, 0.2487, 0.2148, 0.187, 0.1641, 0.1492, 0.1405, 0.1331, 0.1128, 0.0934, 0.0751, 0.0502,
            0.0263, 0.0088,
        ],
        31: [
            0.422, 0.2921, 0.2475, 0.2145, 0.1874, 0.1651, 0.1505, 0.1427, 0.1361, 0.117, 0.0985, 0.0808, 0.0563,
            0.0324, 0.014,
        ],
        32: [
            0.4188, 0.2898, 0.2463, 0.2141, 0.1878, 0.1659, 0.1517, 0.1447, 0.1388, 0.1207, 0.1031, 0.0862, 0.0618,
            0.0386, 0.0185,
        ],
        33: [
            0.4156, 0.2876, 0.2451, 0.2137, 0.188, 0.1667, 0.1527, 0.1465, 0.1413, 0.1239, 0.1073, 0.0912, 0.0668,
            0.0444, 0.0228, 0.0076,
        ],
        34: [
            0.4127, 0.2854, 0.2439, 0.2132, 0.1882, 0.1673, 0.1537, 0.1481, 0.1436, 0.1269, 0.111, 0.0958, 0.0714,
            0.0497, 0.0284, 0.0094,
        ],
        35: [
            0.4096, 0.2834, 0.2427, 0.2127, 0.1883, 0.1678, 0.1546, 0.1496, 0.1456, 0.1296, 0.1145, 0.1, 0.0757, 0.0548,
            0.0336, 0.016,
        ],
        36: [
            0.4068, 0.2813, 0.2415, 0.2121, 0.1883, 0.1683, 0.1554, 0.151, 0.1475, 0.1321, 0.1177, 0.1039, 0.0797,
            0.0595, 0.0388, 0.021, 0.0071,
        ],
        37: [
            0.404, 0.2794, 0.2403, 0.2116, 0.1883, 0.1687, 0.1561, 0.1523, 0.1492, 0.1344, 0.1206, 0.1075, 0.0834,
            0.0639, 0.0435, 0.0254, 0.014,
        ],
        38: [
            0.4015, 0.2774, 0.2391, 0.211, 0.1881, 0.169, 0.1567, 0.1535, 0.1509, 0.1365, 0.1232, 0.1109, 0.0869,
            0.0681, 0.0479, 0.0298, 0.0178, 0.0061,
        ],
        39: [
            0.3989, 0.2755, 0.238, 0.2104, 0.188, 0.1693, 0.1573, 0.1547, 0.1524, 0.1385, 0.1257, 0.114, 0.0901, 0.072,
            0.0521, 0.034, 0.0209, 0.0119,
        ],
        40: [
            0.3964, 0.2737, 0.2368, 0.2098, 0.1878, 0.1695, 0.1578, 0.1557, 0.1539, 0.1403, 0.128, 0.1169, 0.0932,
            0.0757, 0.056, 0.0381, 0.0242, 0.0139, 0.0048,
        ],
        41: [
            0.394, 0.2719, 0.2357, 0.2091, 0.1876, 0.1697, 0.1583, 0.1567, 0.1553, 0.142, 0.1302, 0.1197, 0.0961,
            0.0792, 0.0598, 0.0419, 0.0274, 0.0162, 0.0082,
        ],
        42: [
            0.3917, 0.2701, 0.2345, 0.2085, 0.1874, 0.1699, 0.1587, 0.1577, 0.1566, 0.1436, 0.1323, 0.1222, 0.0988,
            0.0826, 0.0634, 0.0456, 0.0304, 0.0185, 0.0118, 0.004,
        ],
        43: [
            0.3894, 0.2684, 0.2334, 0.2078, 0.1871, 0.17, 0.1591, 0.1586, 0.1579, 0.1451, 0.1342, 0.1245, 0.1014,
            0.0857, 0.0668, 0.0491, 0.0332, 0.0209, 0.014, 0.0062,
        ],
        44: [
            0.3872, 0.2667, 0.2323, 0.2072, 0.1868, 0.1701, 0.1595, 0.1594, 0.159, 0.1465, 0.136, 0.1267, 0.1039,
            0.0888, 0.07, 0.0524, 0.036, 0.0232, 0.0163, 0.0075,
        ],
        45: [
            0.385, 0.2651, 0.2313, 0.2065, 0.1865, 0.1702, 0.1598, 0.1602, 0.1601, 0.1478, 0.1377, 0.1289, 0.1063,
            0.0916, 0.0731, 0.0557, 0.0388, 0.0255, 0.0186, 0.0107, 0.0036,
        ],
        46: [
            0.383, 0.2635, 0.2302, 0.2058, 0.1862, 0.1702, 0.1601, 0.1609, 0.1612, 0.149, 0.1393, 0.1309, 0.1085,
            0.0944, 0.0761, 0.0589, 0.0415, 0.0278, 0.0208, 0.0123, 0.0042,
        ],
        47: [
            0.3808, 0.262, 0.2291, 0.2052, 0.1859, 0.1702, 0.1604, 0.1616, 0.1622, 0.1501, 0.1409, 0.1328, 0.1107,
            0.0971, 0.079, 0.062, 0.0441, 0.03, 0.023, 0.0138, 0.0067,
        ],
        48: [
            0.3789, 0.2604, 0.2281, 0.2045, 0.1855, 0.1702, 0.1606, 0.1623, 0.1631, 0.1512, 0.1424, 0.1346, 0.1128,
            0.0997, 0.0818, 0.0649, 0.0466, 0.0322, 0.0251, 0.0153, 0.0091,
        ],
        49: [
            0.377, 0.2589, 0.2271, 0.2038, 0.1851, 0.1701, 0.1609, 0.1629, 0.164, 0.1523, 0.1438, 0.1364, 0.1148,
            0.1022, 0.0844, 0.0678, 0.049, 0.0344, 0.0271, 0.017, 0.0105, 0.0035,
        ],
        50: [
            0.3751, 0.2574, 0.226, 0.2032, 0.1847, 0.17, 0.161, 0.1635, 0.1649, 0.1533, 0.1451, 0.138, 0.1167, 0.1047,
            0.087, 0.0706, 0.0513, 0.0365, 0.0291, 0.0186, 0.0118, 0.004,
        ],
    };

    const a = ((A_TABLE as unknown) as Record<number, number[]>)[n];
    if (!a)
        return {
            W: NaN,
            pValue: NaN,
            normal: null,
            n,
            method: 'shapiro-wilk',
            error: `Coeficientes não disponíveis para n=${n}`,
        };

    const mean = x.reduce((s, v) => s + v, 0) / n;
    const ss = x.reduce((s, v) => s + (v - mean) ** 2, 0);
    if (ss === 0) return { W: 1, pValue: 1, normal: true, n, method: 'shapiro-wilk' };

    let numerator = 0;
    const k = Math.floor(n / 2);
    for (let i = 0; i < k; i++) {
        numerator += (a[i] as number) * ((x[n - 1 - i] as number) - (x[i] as number));
    }

    const W = numerator ** 2 / ss;
    const Wc = Math.max(0.0001, Math.min(0.9999, W));

    // Valores críticos tabelados W para alpha=0.05 (Shapiro & Wilk 1965, Table 2)
    const W_CRIT_05 = {
        3: 0.767,
        4: 0.748,
        5: 0.762,
        6: 0.788,
        7: 0.803,
        8: 0.818,
        9: 0.829,
        10: 0.842,
        11: 0.85,
        12: 0.859,
        13: 0.866,
        14: 0.874,
        15: 0.881,
        16: 0.887,
        17: 0.892,
        18: 0.897,
        19: 0.901,
        20: 0.905,
        25: 0.918,
        30: 0.927,
        35: 0.934,
        40: 0.94,
        45: 0.945,
        50: 0.947,
    };
    const ns2 = Object.keys(W_CRIT_05)
        .map(Number)
        .sort((a, b) => a - b);
    const nc = ns2.reduce((p, c) => (Math.abs(c - n) < Math.abs(p - n) ? c : p));
    const Wcrit = ((W_CRIT_05 as unknown) as Record<number, number>)[nc] as number;
    const normal = Wc >= Wcrit;

    // p-value aproximado via Royston (1992) - mais confiável para n > 11
    // Para n ≤ 11: estimativa baseada na distância normalizada ao valor crítico
    let pValue;
    try {
        const jStat = getJStat();
        if (n <= 11) {
            const z = (Wc - Wcrit) / (0.02 + 0.003 * n);
            pValue = Math.max(0.001, Math.min(0.999, jStat.normal.cdf(z, 0, 1)));
        } else {
            const y = Math.log(1 - Wc);
            const mu = -1.2725 + 1.0521 * Math.log(n);
            const sigma = Math.exp(-0.6714 + 0.8861 * Math.log(n));
            const z = (y - mu) / sigma;
            pValue = 1 - jStat.normal.cdf(z, 0, 1);
        }
    } catch (e) {
        console.debug('[statistics] shapiroWilk-jStat:', e instanceof Error ? e.message : e);
        pValue = normal ? 0.5 : 0.01;
    }

    return { W: +W.toFixed(6), pValue: +pValue.toFixed(6), normal, n, method: 'shapiro-wilk' };
}

/**
 * Kolmogorov-Smirnov test against normal distribution - n > 50
 * Teste KS para normalidade (recomendado para n > 50)
 * @param {number[]} values
 * @param {number} [alpha=0.05]
 * @returns {{ D: number, pValue: number, normal: boolean|null, n: number, method: string, Dcrit?: number, error?: string }}
 */
export function kolmogorovSmirnov(values: number[], alpha: number = 0.05): { D: number, pValue: number, normal: boolean|null, n: number, method: string, Dcrit?: number, error?: string } {
    const x = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const n = x.length;
    if (n < 3) return { D: NaN, pValue: NaN, normal: null, n, method: 'ks', error: 'n < 3' };

    const mean = x.reduce((s, v) => s + v, 0) / n;
    const std = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
    if (std === 0) return { D: 0, pValue: 1, normal: true, n, method: 'ks' };

    let D = 0;
    try {
        const jStat = getJStat();
        for (let i = 0; i < n; i++) {
            const F = jStat.normal.cdf(x[i] as number, mean, std);
            const d1 = Math.abs(F - (i + 1) / n);
            const d2 = Math.abs(F - i / n);
            D = Math.max(D, d1, d2);
        }
    } catch (e) {
        console.debug('[statistics] kolmogorovSmirnov-jStat-fallback:', e instanceof Error ? e.message : e);
        for (let i = 0; i < n; i++) {
            const z = ((x[i] as number) - mean) / std;
            const F = normalCDF(z);
            D = Math.max(D, Math.abs(F - (i + 1) / n), Math.abs(F - i / n));
        }
    }

    const Dcrit = 0.886 / Math.sqrt(n);
    const pValue = Math.min(1, 2 * Math.exp(-2 * n * D * D));

    return {
        D: +D.toFixed(6),
        pValue: +pValue.toFixed(6),
        normal: pValue > alpha,
        n,
        method: 'ks',
        Dcrit: +Dcrit.toFixed(4),
    };
}

// ================================================================
// HOMOGENEIDADE DE VARIÂNCIAS - Levene
// ================================================================

/**
 * Levene's test for equality of variances across groups
 * Teste de Levene - pré-condição para ANOVA quando normalidade é assumida
 * @param {number[][]} groups
 * @param {number} [alpha=0.05]
 * @returns {{ W: number, pValue: number, homogeneous: boolean, dfBetween: number, dfWithin: number }}
 */
export function leveneTest(groups: number[][], alpha: number = 0.05): { W: number, pValue: number, homogeneous: boolean, dfBetween: number, dfWithin: number } {
    const k = groups.length;
    const N = groups.reduce((s, g) => s + g.length, 0);

    const Z = groups.map((g) => {
        const sorted = [...g].sort((a, b) => a - b);
        const m =
            sorted.length % 2 === 0
                ? ((sorted[sorted.length / 2 - 1] as number) + (sorted[sorted.length / 2] as number)) / 2
                : (sorted[Math.floor(sorted.length / 2)] as number);
        return g.map((v) => Math.abs(v - m));
    });

    const groupMeans = Z.map((z) => z.reduce((s, v) => s + v, 0) / z.length);
    const grandMean = Z.flat().reduce((s, v) => s + v, 0) / N;

    const SSB = Z.reduce((s, z, i) => s + z.length * ((groupMeans[i] as number) - grandMean) ** 2, 0);
    const SSW = Z.reduce((s, z, i) => s + z.reduce((ss, v) => ss + (v - (groupMeans[i] as number)) ** 2, 0), 0);

    const dfB = k - 1;
    const dfW = N - k;
    const W = SSB / dfB / (SSW / dfW);

    let pValue = 0.5;
    try {
        const jStat = getJStat();
        pValue = 1 - jStat.centralF.cdf(W, dfB, dfW);
    } catch (e) {
        console.debug('[statistics] leveneTest-jStat:', e instanceof Error ? e.message : e);
        /* sem jStat */
    }

    return { W: +W.toFixed(4), pValue: +pValue.toFixed(6), homogeneous: pValue > alpha, dfBetween: dfB, dfWithin: dfW };
}

// ================================================================
// COMPARAÇÃO DE GRUPOS - ANOVA e Kruskal-Wallis
// ================================================================

/**
 * One-way ANOVA - parametric, requires normality + homogeneity
 * ANOVA de um fator - comparação de médias entre grupos
 * @param {number[][]} groups
 * @param {number} [alpha=0.05]
 * @returns {{ F: number, dfBetween: number, dfWithin: number, pValue: number, reject: boolean, means: number[], grandMean: number }}
 */
export function anovaOneWay(groups: number[][], alpha: number = 0.05): { F: number, dfBetween: number, dfWithin: number, pValue: number, reject: boolean, means: number[], grandMean: number } {
    const k = groups.length;
    const N = groups.reduce((s, g) => s + g.length, 0);
    const means = groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
    const grandMean = groups.flat().reduce((s, v) => s + v, 0) / N;

    const SSB = groups.reduce((s, g, i) => s + g.length * ((means[i] as number) - grandMean) ** 2, 0);
    const SSW = groups.reduce((s, g, i) => s + g.reduce((ss, v) => ss + (v - (means[i] as number)) ** 2, 0), 0);

    const dfB = k - 1;
    const dfW = N - k;
    const F = SSB / dfB / (SSW / dfW);

    let pValue = 0.5;
    try {
        const jStat = getJStat();
        pValue = 1 - jStat.centralF.cdf(F, dfB, dfW);
    } catch (e) {
        console.debug('[statistics] anovaOneWay-jStat:', e instanceof Error ? e.message : e);
        /* sem jStat */
    }

    return {
        F: +F.toFixed(4),
        dfBetween: dfB,
        dfWithin: dfW,
        pValue: +pValue.toFixed(6),
        reject: pValue < alpha,
        means: means.map((m) => +m.toFixed(4)),
        grandMean: +grandMean.toFixed(4),
    };
}

/**
 * Kruskal-Wallis test - non-parametric alternative to ANOVA
 * Kruskal-Wallis - alternativa não-paramétrica à ANOVA de um fator
 * @param {number[][]} groups
 * @param {number} [alpha=0.05]
 * @returns {{ H: number, df: number, pValue: number, reject: boolean }}
 */
export function kruskalWallis(groups: number[][], alpha: number = 0.05): { H: number, df: number, pValue: number, reject: boolean } {
        const all: {v:number, g:number, rank?:number}[]= groups.flatMap((g, i) => g.map((v) => ({ v, g: i })));
    const N = all.length;
    all.sort((a, b) => a.v - b.v);

    let i = 0;
    while (i < N) {
        let j = i;
        while (j < N - 1 && (all[j + 1] as {v:number, g:number, rank?:number}).v === (all[j] as {v:number, g:number, rank?:number}).v) j++;
        const rank = (i + j) / 2 + 1;
        for (let kk = i; kk <= j; kk++) (all[kk] as {v:number, g:number, rank?:number}).rank = rank;
        i = j + 1;
    }

    let tieCorr = 0;
    let ti = 0;
    while (ti < N) {
        let tj = ti;
        while (tj < N - 1 && (all[tj + 1] as {v:number, g:number, rank?:number}).v === (all[tj] as {v:number, g:number, rank?:number}).v) tj++;
        const t = tj - ti + 1;
        if (t > 1) tieCorr += t ** 3 - t;
        ti = tj + 1;
    }

    const rankSums = groups.map((_, gi) => all.filter((a) => a.g === gi).reduce((s, a) => s + (a.rank ?? 0), 0));
    const ns = groups.map((g) => g.length);

    let H = (12 / (N * (N + 1))) * rankSums.reduce((s, R, i) => s + R ** 2 / (ns[i] as number), 0) - 3 * (N + 1);

    const C = 1 - tieCorr / (N ** 3 - N);
    if (C > 0) H /= C;

    const df = groups.length - 1;
    let pValue = 0.5;
    try {
        const jStat = getJStat();
        pValue = 1 - jStat.chisquare.cdf(H, df);
    } catch (e) {
        console.debug('[statistics] kruskalWallis-jStat:', e instanceof Error ? e.message : e);
        /* sem jStat */
    }

    return { H: +H.toFixed(4), df, pValue: +pValue.toFixed(6), reject: pValue < alpha };
}

/**
 * Tukey HSD post-hoc test for ANOVA
 * Teste de Tukey - comparações par-a-par após ANOVA significativa
 * @param {number[][]} groups
 * @param {number} [_alpha=0.05]
 * @returns {Array<{i: number, j: number, diff: number, q: number, significant: boolean}>}
 */
export function tukeyHSD(groups: number[][], _alpha: number = 0.05): Array<{i: number, j: number, diff: number, q: number, significant: boolean}> {
    const k = groups.length;
    const N = groups.reduce((s, g) => s + g.length, 0);
    const means = groups.map((g) => g.reduce((s, v) => s + v, 0) / g.length);
    const MSW = groups.reduce((s, g, i) => s + g.reduce((ss, v) => ss + (v - (means[i] as number)) ** 2, 0), 0) / (N - k);
    const results = [];
    for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
            const diff = Math.abs((means[i] as number) - (means[j] as number));
            const se = Math.sqrt((MSW * (1 / (groups[i] as number[]).length + 1 / (groups[j] as number[]).length)) / 2);
            const q = se > 0 ? diff / se : Infinity;
            results.push({ i, j, diff: +diff.toFixed(4), q: +q.toFixed(3), significant: q > 3.5 });
        }
    }
    return results;
}

/**
 * Dunn test post-hoc for Kruskal-Wallis - Bonferroni correction
 * Teste de Dunn com correção de Bonferroni
 * @param {number[][]} groups
 * @param {number} [alpha=0.05]
 * @returns {Array<{i: number, j: number, Z: number, pAdjusted: number, significant: boolean}>}
 */
export function dunnTest(groups: number[][], alpha: number = 0.05): Array<{i: number, j: number, Z: number, pAdjusted: number, significant: boolean}> {
        const all: {v:number, g:number, rank?:number}[]= groups.flatMap((g, gi) => g.map((v) => ({ v, g: gi })));
    const N = all.length;
    all.sort((a, b) => a.v - b.v);
    let ti = 0;
    let tieCorr = 0;
    while (ti < N) {
        let tj = ti;
        while (tj < N - 1 && (all[tj + 1] as {v:number, g:number, rank?:number}).v === (all[tj] as {v:number, g:number, rank?:number}).v) tj++;
        const t = tj - ti + 1;
        if (t > 1) tieCorr += t ** 3 - t;
        const rank = (ti + tj) / 2 + 1;
        for (let kk = ti; kk <= tj; kk++) (all[kk] as {v:number, g:number, rank?:number}).rank = rank;
        ti = tj + 1;
    }

    const rankMeans = groups.map(
        (g, gi) => all.filter((a) => a.g === gi).reduce((s, a) => s + (a.rank ?? 0), 0) / g.length,
    );
    const ns = groups.map((g) => g.length);
    const k = groups.length;
    const m = (k * (k - 1)) / 2;
    const results = [];

    for (let i = 0; i < k; i++) {
        for (let j = i + 1; j < k; j++) {
            const se = Math.sqrt(((N * (N + 1)) / 12 - tieCorr / (12 * (N - 1))) * (1 / (ns[i] as number) + 1 / (ns[j] as number)));
            const Z = se > 0 ? Math.abs((rankMeans[i] as number) - (rankMeans[j] as number)) / se : 0;
            let pRaw;
            try {
                const jStat = getJStat();
                pRaw = 2 * (1 - jStat.normal.cdf(Z, 0, 1));
            } catch (e) {
                console.debug('[statistics] dunnTest-jStat-fallback:', e instanceof Error ? e.message : e);
                pRaw = Z > 2.576 ? 0.01 : Z > 1.96 ? 0.05 : 0.5;
            }
            const pAdjusted = Math.min(1, pRaw * m);
            results.push({ i, j, Z: +Z.toFixed(3), pAdjusted: +pAdjusted.toFixed(6), significant: pAdjusted < alpha });
        }
    }
    return results;
}

// ================================================================
// DETECÇÃO DE MUDANÇA TEMPORAL - Pettitt e CUSUM
// ================================================================

/**
 * Pettitt test for change-point detection
 * Teste de Pettitt - detecta ponto de ruptura em série temporal
 * @param {number[]} values
 * @param {number} [alpha=0.05]
 * @returns {{ K: number, changeIndex: number, pValue: number, significant: boolean, error?: string }}
 */
export function pettittTest(values: number[], alpha: number = 0.05): { K: number, changeIndex: number, pValue: number, significant: boolean, error?: string } {
    const n = values.length;
    if (n < 4) return { K: NaN, changeIndex: -1, pValue: NaN, significant: false, error: 'n < 4' };

    let maxK = 0;
    let changeIndex = 0;
    const U = new Array(n).fill(0);

    for (let t = 1; t < n; t++) {
        U[t] = U[t - 1];
        for (let j = 0; j < t; j++) {
            U[t] += Math.sign((values[t] as number) - (values[j] as number));
        }
        if (Math.abs(U[t]) > maxK) {
            maxK = Math.abs(U[t]);
            changeIndex = t;
        }
    }

    const pValue = Math.min(1, 2 * Math.exp((-6 * maxK ** 2) / (n ** 3 + n ** 2)));
    return { K: maxK, changeIndex, pValue: +pValue.toFixed(6), significant: pValue < alpha };
}

/**
 * CUSUM control chart
 * Gráfico de controle CUSUM - detecta desvios cumulativos da média alvo
 * @param {number[]} values
 * @param {number} [target] - média alvo (default: média amostral)
 * @param {number} [k] - slack parameter (default: 0.5 * std)
 * @returns {{ upperCSUM: number[], lowerCSUM: number[], alarms: number[], mean: number, std: number, controlLimit: number }}
 */
export function cusum(values: number[], target?: number, k?: number): { upperCSUM: number[], lowerCSUM: number[], alarms: number[], mean: number, std: number, controlLimit: number } {
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const std = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, n - 1));
    const mu = target !== undefined ? target : mean;
    const slack = k !== undefined ? k : 0.5 * std;
    const h = 5 * std;

    const upper = new Array(n).fill(0);
    const lower = new Array(n).fill(0);
    const alarms = [];

    for (let i = 1; i < n; i++) {
        upper[i] = Math.max(0, upper[i - 1] + ((values[i] as number) - mu) - slack);
        lower[i] = Math.max(0, lower[i - 1] - ((values[i] as number) - mu) - slack);
        if (upper[i] > h || lower[i] > h) alarms.push(i);
    }

    return {
        upperCSUM: upper.map((v) => +v.toFixed(4)),
        lowerCSUM: lower.map((v) => +v.toFixed(4)),
        alarms,
        mean: +mean.toFixed(4),
        std: +std.toFixed(4),
        controlLimit: +h.toFixed(4),
    };
}

/**
 * Seasonal Mann-Kendall test (EPA Guidance)
 * Mann-Kendall com decomposição sazonal - detecta tendência em dados periódicos
 * @param {number[]} values
 * @param {number} [period=12]
 * @param {number} [alpha=0.05]
 * @returns {{ S: number, varS: number, Z: number, pValue: number, trend: string, method: string }}
 */
export function seasonalMannKendall(values: number[], period: number = 12, alpha: number = 0.05): { S: number, varS: number, Z: number, pValue: number, trend: string, method: string } {
    const seasons = [];
    for (let s = 0; s < period; s++) {
        seasons.push(values.filter((_, i) => i % period === s));
    }

    let S_total = 0;
    let Var_total = 0;

    for (const season of seasons) {
        const n = season.length;
        if (n < 2) continue;
        let S = 0;
        for (let i = 0; i < n - 1; i++) {
            for (let j = i + 1; j < n; j++) S += Math.sign((season[j] as number) - (season[i] as number));
        }
        S_total += S;
        Var_total += (n * (n - 1) * (2 * n + 5)) / 18;
    }

    if (Var_total <= 0)
        return { S: S_total, varS: 0, Z: 0, pValue: 1, trend: 'no trend', method: 'seasonal-mann-kendall' };

    const Z =
        S_total === 0 ? 0 : S_total > 0 ? (S_total - 1) / Math.sqrt(Var_total) : (S_total + 1) / Math.sqrt(Var_total);

    let pValue;
    try {
        const jStat = getJStat();
        pValue = 2 * (1 - jStat.normal.cdf(Math.abs(Z), 0, 1));
    } catch (e) {
        console.debug('[statistics] seasonalMK-jStat-fallback:', e instanceof Error ? e.message : e);
        pValue = Math.abs(Z) > 1.96 ? 0.04 : 0.5;
    }

    const trend = pValue >= alpha ? 'no trend' : Z > 0 ? 'increasing' : 'decreasing';
    return {
        S: S_total,
        varS: +Var_total.toFixed(2),
        Z: +Z.toFixed(4),
        pValue: +pValue.toFixed(6),
        trend,
        method: 'seasonal-mann-kendall',
    };
}

// ================================================================
// CORRELAÇÃO - Spearman e Pearson
// ================================================================

/**
 * Spearman rank correlation
 * Correlação de Spearman - não-paramétrica, robusta a outliers
 * @param {number[]} x @param {number[]} y @param {number} [alpha=0.05]
 * @returns {{ rs: number, pValue: number, significant: boolean, n: number }}
 */
export function spearmanCorrelation(x: number[], y: number[], alpha: number = 0.05): { rs: number, pValue: number, significant: boolean, n: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { rs: NaN, pValue: NaN, significant: false, n };

        const rank = (arr: number[]) => {
        const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
        const ranks = new Array(arr.length);
        let i = 0;
        while (i < n) {
            let j = i;
            while (j < n - 1 && (sorted[j + 1] as {v:number, i:number}).v === (sorted[j] as {v:number, i:number}).v) j++;
            const r = (i + j) / 2 + 1;
            for (let kk = i; kk <= j; kk++) ranks[(sorted[kk] as {v:number, i:number}).i] = r;
            i = j + 1;
        }
        return ranks;
    };

    const rx = rank(x.slice(0, n));
    const ry = rank(y.slice(0, n));
    const d2 = rx.reduce((s, r, i) => s + (r - ry[i]) ** 2, 0);
    const rs = 1 - (6 * d2) / (n * (n ** 2 - 1));
    const t = rs * Math.sqrt((n - 2) / Math.max(1e-10, 1 - rs ** 2));

    let pValue;
    try {
        const jStat = getJStat();
        pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2));
    } catch (e) {
        console.debug('[statistics] spearmanCorr-jStat-fallback:', e instanceof Error ? e.message : e);
        pValue = Math.abs(t) > 2 ? 0.04 : 0.5;
    }

    return { rs: +rs.toFixed(4), pValue: +pValue.toFixed(6), significant: pValue < alpha, n };
}

/**
 * Pearson correlation coefficient
 * Correlação de Pearson - paramétrica, assume normalidade bivariada
 * @param {number[]} x @param {number[]} y @param {number} [alpha=0.05]
 * @returns {{ r: number, pValue: number, significant: boolean, n: number }}
 */
export function pearsonCorrelation(x: number[], y: number[], alpha: number = 0.05): { r: number, pValue: number, significant: boolean, n: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) return { r: NaN, pValue: NaN, significant: false, n };

    const mx = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const my = y.slice(0, n).reduce((s, v) => s + v, 0) / n;
    let num = 0,
        dx2 = 0,
        dy2 = 0;
    for (let i = 0; i < n; i++) {
        num += ((x[i] as number) - mx) * ((y[i] as number) - my);
        dx2 += ((x[i] as number) - mx) ** 2;
        dy2 += ((y[i] as number) - my) ** 2;
    }
    const r = dx2 * dy2 > 0 ? num / Math.sqrt(dx2 * dy2) : 0;
    const t = r * Math.sqrt((n - 2) / Math.max(1e-10, 1 - r ** 2));

    let pValue;
    try {
        const jStat = getJStat();
        pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2));
    } catch (e) {
        console.debug('[statistics] pearsonCorr-jStat-fallback:', e instanceof Error ? e.message : e);
        pValue = Math.abs(t) > 2 ? 0.04 : 0.5;
    }

    return { r: +r.toFixed(4), pValue: +pValue.toFixed(6), significant: pValue < alpha, n };
}

/**
 * Kendall's tau-b rank correlation coefficient (tie-adjusted).
 * Coeficiente de correlação de postos tau-b de Kendall (ajustado para empates).
 *
 * Non-parametric measure of ordinal association between two variables, based on
 * the difference between concordant (C) and discordant (D) pairs. The "b" variant
 * applies a tie correction so |tau| can still reach 1 when ties are present in
 * either variable — the standard recommendation for environmental monitoring data
 * (which commonly carry ties from rounding and reporting/detection clustering).
 *
 * Estimator (Kendall 1945; Kendall & Gibbons 1990, ISBN 0-19-520837-4):
 *   S  = C − D
 *   n0 = n(n−1)/2
 *   n1 = Σ tᵢ(tᵢ−1)/2   over groups of tied x values (size tᵢ)
 *   n2 = Σ uⱼ(uⱼ−1)/2   over groups of tied y values (size uⱼ)
 *   τ_b = S / √[(n0 − n1)(n0 − n2)]
 *
 * Significance via the large-sample normal approximation of S with the
 * tie-corrected variance (Kendall 1970; matches SciPy method='asymptotic'):
 *   Var(S) = [n(n−1)(2n+5) − Σtᵢ(tᵢ−1)(2tᵢ+5) − Σuⱼ(uⱼ−1)(2uⱼ+5)] / 18
 *            + [Σtᵢ(tᵢ−1)·Σuⱼ(uⱼ−1)] / [2n(n−1)]
 *            + [Σtᵢ(tᵢ−1)(tᵢ−2)·Σuⱼ(uⱼ−1)(uⱼ−2)] / [9n(n−1)(n−2)]
 *   z = S / √Var(S),  p = 2·(1 − Φ(|z|))
 *
 * @reference Kendall, M.G. (1945). "The treatment of ties in ranking problems."
 *   Biometrika 33(3):239–251. doi:10.1093/biomet/33.3.239
 * @reference Kendall, M.G. & Gibbons, J.D. (1990). Rank Correlation Methods,
 *   5th ed., Oxford University Press. ISBN 0-19-520837-4.
 * @reference Helsel, D.R. & Hirsch, R.M. (2002). Statistical Methods in Water
 *   Resources, USGS TWRI Book 4, Ch. 8.2 (Kendall's tau).
 *
 * @param {number[]} x @param {number[]} y @param {number} [alpha=0.05]
 * @returns {{ tau: number, S: number, z: number, pValue: number, significant: boolean, n: number, concordant: number, discordant: number }}
 */
export function kendallTauB(
    x: number[],
    y: number[],
    alpha: number = 0.05,
): { tau: number, S: number, z: number, pValue: number, significant: boolean, n: number, concordant: number, discordant: number } {
    const n = Math.min(x.length, y.length);
    if (n < 3) {
        return { tau: NaN, S: 0, z: NaN, pValue: NaN, significant: false, n, concordant: 0, discordant: 0 };
    }

    const xs = x.slice(0, n);
    const ys = y.slice(0, n);

    // Concordant / discordant pair counts; tied pairs (sign product 0) excluded.
    let C = 0;
    let D = 0;
    for (let i = 0; i < n; i++) {
        const xi = xs[i] as number;
        const yi = ys[i] as number;
        for (let j = i + 1; j < n; j++) {
            const dx = (xs[j] as number) - xi;
            const dy = (ys[j] as number) - yi;
            const p = Math.sign(dx) * Math.sign(dy);
            if (p > 0) C++;
            else if (p < 0) D++;
        }
    }
    const S = C - D;

    // Tie-group sizes per variable.
    const tieCounts = (arr: number[]): number[] => {
        const m = new Map<number, number>();
        for (const v of arr) m.set(v, (m.get(v) ?? 0) + 1);
        return Array.from(m.values());
    };
    const tx = tieCounts(xs);
    const uy = tieCounts(ys);

    const n0 = (n * (n - 1)) / 2;
    const n1 = tx.reduce((s, t) => s + (t * (t - 1)) / 2, 0);
    const n2 = uy.reduce((s, u) => s + (u * (u - 1)) / 2, 0);

    const denom = Math.sqrt((n0 - n1) * (n0 - n2));
    const tau = denom > 0 ? S / denom : 0;

    // Tie-corrected variance of S (Kendall 1970).
    const v0 = n * (n - 1) * (2 * n + 5);
    const vt = tx.reduce((s, t) => s + t * (t - 1) * (2 * t + 5), 0);
    const vu = uy.reduce((s, u) => s + u * (u - 1) * (2 * u + 5), 0);
    const v1 =
        (tx.reduce((s, t) => s + t * (t - 1), 0) * uy.reduce((s, u) => s + u * (u - 1), 0)) /
        (2 * n * (n - 1));
    const v2 =
        n > 2
            ? (tx.reduce((s, t) => s + t * (t - 1) * (t - 2), 0) *
                  uy.reduce((s, u) => s + u * (u - 1) * (u - 2), 0)) /
              (9 * n * (n - 1) * (n - 2))
            : 0;
    const varS = (v0 - vt - vu) / 18 + v1 + v2;

    let z = NaN;
    let pValue = NaN;
    if (varS > 0) {
        z = S / Math.sqrt(varS);
        pValue = 2 * (1 - normalCDF(Math.abs(z)));
    }

    return {
        tau: +tau.toFixed(4),
        S,
        z: Number.isFinite(z) ? +z.toFixed(4) : z,
        pValue: Number.isFinite(pValue) ? +pValue.toFixed(6) : pValue,
        significant: Number.isFinite(pValue) ? pValue < alpha : false,
        n,
        concordant: C,
        discordant: D,
    };
}

/**
 * Correlation matrix for multiple parameter series
 * Matriz de correlação entre múltiplos parâmetros
 * @param {Array<{name: string, values: number[]}>} paramSeries
 * @param {'spearman'|'pearson'|'kendall'} [method='spearman']
 * @returns {{ names: string[], matrix: number[][], pValues: number[][] }}
 */
export function correlationMatrix(paramSeries: Array<{name: string, values: number[]}>, method: 'spearman'|'pearson'|'kendall' = 'spearman'): { names: string[], matrix: number[][], pValues: number[][] } {
    const names = paramSeries.map((p) => p.name);
    const k = names.length;
    const corrFn = method === 'pearson' ? pearsonCorrelation : method === 'kendall' ? kendallTauB : spearmanCorrelation;
    const matrix: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
    const pValues: number[][] = Array.from({ length: k }, () => new Array(k).fill(1));

    for (let i = 0; i < k; i++) {
        (matrix[i] as number[])[i] = 1;
        (pValues[i] as number[])[i] = 0;
        for (let j = i + 1; j < k; j++) {
            const res = (corrFn((paramSeries[i] as { values: number[] }).values, (paramSeries[j] as { values: number[] }).values) as { rs?: number, r?: number, tau?: number, pValue: number });
            const r = res.rs ?? res.r ?? res.tau ?? 0;
            (matrix[i] as number[])[j] = r;
            (matrix[j] as number[])[i] = r;
            (pValues[i] as number[])[j] = res.pValue;
            (pValues[j] as number[])[i] = res.pValue;
        }
    }

    return { names, matrix, pValues };
}

// ================================================================
// OUTLIERS - Grubbs e Dixon Q
// ================================================================

/**
 * Grubbs test for outliers (EPA standard method)
 * Teste de Grubbs - padrão EPA para detecção de outlier único
 * @param {number[]} values @param {number} [alpha=0.05]
 * @returns {{ G: number, Gcritical: number, outlierIndex: number, outlierValue: number, reject: boolean }}
 */
export function grubbsTest(values: number[], alpha: number = 0.05): { G: number, Gcritical: number, outlierIndex: number, outlierValue: number, reject: boolean } {
    const x = values.filter((v) => Number.isFinite(v));
    const n = x.length;
    if (n < 3) return { G: NaN, Gcritical: NaN, outlierIndex: -1, outlierValue: NaN, reject: false };

    const mean = x.reduce((s, v) => s + v, 0) / n;
    const std = Math.sqrt(x.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
    if (std === 0) return { G: 0, Gcritical: Infinity, outlierIndex: -1, outlierValue: NaN, reject: false };

    const deviations = x.map((v) => Math.abs(v - mean));
    const maxDev = Math.max(...deviations);
    const outlierIndex = deviations.indexOf(maxDev);
    const G = maxDev / std;

    let Gcritical = 2.5;
    try {
        const jStat = getJStat();
        const t = jStat.studentt.inv(alpha / (2 * n), n - 2);
        Gcritical = ((n - 1) / Math.sqrt(n)) * Math.sqrt(t ** 2 / (n - 2 + t ** 2));
    } catch (e) {
        console.debug('[statistics] grubbsTest-jStat-fallback:', e instanceof Error ? e.message : e);
        /* fallback */
    }

    return {
        G: +G.toFixed(4),
        Gcritical: +Gcritical.toFixed(4),
        outlierIndex,
        outlierValue: x[outlierIndex] as number,
        reject: G > Gcritical,
    };
}

/**
 * Dixon Q test for outliers - small samples n = 3..30
 * Teste de Dixon Q - outliers em amostras pequenas
 * @param {number[]} values @param {number} [_alpha=0.05]
 * @returns {{ Q: number, Qcritical: number, reject: boolean, outlierValue: number, error?: string }}
 */
export function dixonQTest(values: number[], _alpha: number = 0.05): { Q: number, Qcritical: number, reject: boolean, outlierValue: number, error?: string } {
    const x = [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    const n = x.length;
    if (n < 3 || n > 30)
        return { Q: NaN, Qcritical: NaN, reject: false, outlierValue: NaN, error: `n=${n} fora de 3–30` };

    const range = (x[n - 1] as number) - (x[0] as number);
    if (range === 0) return { Q: 0, Qcritical: 1, reject: false, outlierValue: NaN };

    const Qlow = ((x[1] as number) - (x[0] as number)) / range;
    const Qhigh = ((x[n - 1] as number) - (x[n - 2] as number)) / range;
    const Q = Math.max(Qlow, Qhigh);
    const outlierValue = Qhigh >= Qlow ? (x[n - 1] as number) : (x[0] as number);

    const QCRIT = {
        3: 0.941,
        4: 0.765,
        5: 0.642,
        6: 0.56,
        7: 0.507,
        8: 0.468,
        9: 0.437,
        10: 0.412,
        11: 0.392,
        12: 0.376,
        13: 0.361,
        14: 0.349,
        15: 0.338,
        16: 0.329,
        17: 0.32,
        18: 0.313,
        19: 0.306,
        20: 0.3,
        25: 0.277,
        30: 0.26,
    };
    const ns = Object.keys(QCRIT)
        .map(Number)
        .sort((a, b) => a - b);
    const closest = ns.reduce((prev, curr) => (Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev));

    const _qcrit = ((QCRIT as unknown) as Record<number, number>);
    return { Q: +Q.toFixed(4), Qcritical: _qcrit[closest] as number, reject: Q > (_qcrit[closest] as number), outlierValue };
}

/**
 * Rosner Generalized ESD (Extreme Studentized Deviate) test for up to k outliers.
 * Teste ESD generalizado de Rosner — detecta ATÉ k outliers, resistente a
 * mascaramento (masking) ao contrário do Grubbs (1 outlier) e Dixon Q.
 *
 * Padrão USEPA ProUCL / NIST e-Handbook §1.3.5.17.3 para dados ambientais.
 * Referência: Rosner, B. (1983) "Percentage Points for a Generalized ESD
 * Many-Outlier Procedure", Technometrics 25(2):165–172.
 * DOI: 10.1080/00401706.1983.10487848
 *
 * Procedimento: para i = 1..k remove iterativamente o valor mais afastado da
 * média e calcula R_i = max|x - mean| / std (em n-i+1 pontos restantes), comparando
 * com o valor crítico λ_i. O nº de outliers é o MAIOR i tal que R_i > λ_i
 * (decisão para trás — chave da resistência a masking). λ_i usa o percentil t de
 * Student conforme Rosner Eq. (5):
 *   p     = 1 - α/(2·(n - i + 1))
 *   t_{p,n-i-1}
 *   λ_i   = (n-i)·t / sqrt((n-i-1 + t²)·(n-i+1))
 *
 * @param {number[]} values amostra
 * @param {number} [maxOutliers=Math.max(1, Math.floor(values.length * 0.1))] limite superior k de outliers (a priori)
 * @param {number} [alpha=0.05] nível de significância
 * @returns {{ numOutliers: number, outlierIndices: number[], outlierValues: number[], tests: Array<{ i: number, R: number, lambda: number, value: number, index: number }>, n: number, maxOutliers: number, error?: string }}
 */
export function rosnerESDTest(
    values: number[],
    maxOutliers?: number,
    alpha: number = 0.05,
): {
    numOutliers: number,
    outlierIndices: number[],
    outlierValues: number[],
    tests: Array<{ i: number, R: number, lambda: number, value: number, index: number }>,
    n: number,
    maxOutliers: number,
    error?: string,
} {
    // Indexamos para preservar a posição original no array de entrada.
    const indexed = values
        .map((v, idx) => ({ v, idx }))
        .filter((p) => Number.isFinite(p.v));
    const n = indexed.length;
    const k = Math.max(1, Math.floor(maxOutliers ?? Math.max(1, Math.floor(n * 0.1))));

    // ESD requer pelo menos n ≥ k + 2 (gl de Student = n - i - 1 ≥ 1 no pior caso).
    if (n < k + 2) {
        return {
            numOutliers: 0,
            outlierIndices: [],
            outlierValues: [],
            tests: [],
            n,
            maxOutliers: k,
            error: `n=${n} insuficiente para k=${k} (requer n ≥ k+2)`,
        };
    }

    let jStat: JStatLib | null;
    try {
        jStat = getJStat();
    } catch (e) {
        console.debug('[statistics] rosnerESDTest-jStat:', e instanceof Error ? e.message : e);
        return {
            numOutliers: 0,
            outlierIndices: [],
            outlierValues: [],
            tests: [],
            n,
            maxOutliers: k,
            error: 'jStat não carregado (necessário para valores críticos λ_i)',
        };
    }

    const work = [...indexed];
    const tests: Array<{ i: number, R: number, lambda: number, value: number, index: number }> = [];

    for (let i = 1; i <= k; i++) {
        const m = work.length; // = n - i + 1
        const mean = work.reduce((s, p) => s + p.v, 0) / m;
        const std = Math.sqrt(work.reduce((s, p) => s + (p.v - mean) ** 2, 0) / (m - 1));
        if (std === 0) break; // todos restantes iguais → sem mais outliers possíveis

        // valor mais afastado da média (extreme studentized deviate)
        let far = 0;
        let maxDev = -1;
        for (let j = 0; j < m; j++) {
            const dev = Math.abs((work[j] as { v: number, idx: number }).v - mean);
            if (dev > maxDev) {
                maxDev = dev;
                far = j;
            }
        }
        const R = maxDev / std;

        // Valor crítico λ_i (Rosner 1983, Eq. 5)
        const dfT = m - 2; // = n - i - 1
        const p = 1 - alpha / (2 * m);
        const t = jStat.studentt.inv(p, dfT);
        const lambda = ((m - 1) * t) / Math.sqrt((dfT + t ** 2) * m);

        const removed = work[far] as { v: number, idx: number };
        tests.push({ i, R: +R.toFixed(4), lambda: +lambda.toFixed(4), value: removed.v, index: removed.idx });
        work.splice(far, 1);
    }

    // Decisão para trás: nº de outliers = maior i com R_i > λ_i (resistência a masking).
    let numOutliers = 0;
    for (let i = tests.length; i >= 1; i--) {
        const tcur = tests[i - 1] as { R: number, lambda: number };
        if (tcur.R > tcur.lambda) {
            numOutliers = i;
            break;
        }
    }

    const confirmed = tests.slice(0, numOutliers);
    return {
        numOutliers,
        outlierIndices: confirmed.map((tt) => tt.index),
        outlierValues: confirmed.map((tt) => tt.value),
        tests,
        n,
        maxOutliers: k,
    };
}

/**
 * Autocorrelation function (ACF)
 * Função de autocorrelação - detecta sazonalidade e padrões cíclicos
 * @param {number[]} values @param {number} [maxLag=20]
 * @returns {{ lags: number[], correlations: number[], confidenceInterval: number }}
 */
export function acf(values: number[], maxLag: number = 20): { lags: number[], correlations: number[], confidenceInterval: number } {
    const n = values.length;
    const mean = values.reduce((s, v) => s + v, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    if (variance === 0) return { lags: [], correlations: [], confidenceInterval: 0 };

    const lags = [];
    const correlations = [];
    const L = Math.min(maxLag, n - 1);

    for (let lag = 0; lag <= L; lag++) {
        let cov = 0;
        for (let i = lag; i < n; i++) cov += ((values[i] as number) - mean) * ((values[i - lag] as number) - mean);
        lags.push(lag);
        correlations.push(+(cov / (n * variance)).toFixed(4));
    }

    return { lags, correlations, confidenceInterval: +(1.96 / Math.sqrt(n)).toFixed(4) };
}

/**
 * LOWESS — Locally Weighted Scatterplot Smoothing (robust local linear regression).
 * Suavização robusta de séries temporais ambientais ruidosas, extraindo a
 * tendência subjacente sem impor uma forma funcional global. Cada ponto ajustado
 * é uma regressão linear ponderada sobre seus k vizinhos mais próximos (em x),
 * com peso tricúbico pela distância e iterações de robustez bisquare que reduzem
 * a influência de outliers (Cleveland 1979).
 *
 * Propriedade de referência exata: para pontos colineares (y = a + b·x), o ajuste
 * local linear recupera a reta exatamente em todos os pontos, para qualquer
 * conjunto de pesos não-negativos — usado como gate de correção nos testes.
 *
 * @reference Cleveland, W.S. (1979). "Robust Locally Weighted Regression and
 *            Smoothing Scatterplots." Journal of the American Statistical
 *            Association 74(368):829-836. doi:10.1080/01621459.1979.10481038
 *
 * @param {number[]} x - Variável independente (ex.: tempo/índice), comprimento n
 * @param {number[]} y - Variável dependente observada, comprimento n
 * @param {number} [span=0.3] - Fração de pontos na vizinhança local f ∈ (0,1]
 * @param {number} [robustnessIters=2] - Iterações de robustez bisquare (0 = sem)
 * @returns {{ x: number[], fitted: number[], residuals: number[], span: number,
 *             k: number, robustnessIters: number, n: number, method: string }}
 */
export function lowess(
    x: number[],
    y: number[],
    span: number = 0.3,
    robustnessIters: number = 2,
): { x: number[], fitted: number[], residuals: number[], span: number, k: number, robustnessIters: number, n: number, method: string } {
    const method = 'LOWESS (Cleveland 1979)';
    const n = Math.min(x.length, y.length);
    if (n === 0) return { x: [], fitted: [], residuals: [], span, k: 0, robustnessIters, n: 0, method };
    if (n === 1) return { x: [x[0] as number], fitted: [y[0] as number], residuals: [0], span, k: 1, robustnessIters, n: 1, method };

    // Sort by x so neighborhoods are contiguous in index space.
    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => (x[a] as number) - (x[b] as number));
    const xs = order.map((i) => x[i] as number);
    const ys = order.map((i) => y[i] as number);

    // Neighborhood size k = ceil(span * n), clamped to [2, n].
    const f = Math.min(1, Math.max(1e-9, span));
    const k = Math.max(2, Math.min(n, Math.ceil(f * n)));

    const fitted = new Array<number>(n).fill(0);
    let robustWeights = new Array<number>(n).fill(1);

    const iters = Math.max(0, Math.floor(robustnessIters));
    for (let iter = 0; iter <= iters; iter++) {
        for (let i = 0; i < n; i++) {
            const xi = xs[i] as number;

            // Find the k nearest neighbors in x (contiguous window minimizing max distance).
            let lo = Math.max(0, i - (k - 1));
            let hi = Math.min(n - 1, i + (k - 1));
            // Shrink window to exactly k points, dropping the farther edge each step.
            while (hi - lo + 1 > k) {
                const dLo = xi - (xs[lo] as number);
                const dHi = (xs[hi] as number) - xi;
                if (dLo > dHi) lo++;
                else hi--;
            }

            // Bandwidth = distance to the farthest neighbor in the window.
            const dmax = Math.max(xi - (xs[lo] as number), (xs[hi] as number) - xi);

            // Weighted local linear regression: w = tricube(dist/dmax) * robustWeight.
            let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
            for (let j = lo; j <= hi; j++) {
                const d = Math.abs((xs[j] as number) - xi);
                let tw: number;
                if (dmax <= 0) {
                    tw = 1; // All neighbors coincide in x.
                } else {
                    const u = d / dmax;
                    const t = 1 - u * u * u;
                    tw = u >= 1 ? 0 : t * t * t; // tricube
                }
                const w = tw * (robustWeights[j] as number);
                const xj = xs[j] as number;
                const yj = ys[j] as number;
                sw += w;
                swx += w * xj;
                swy += w * yj;
                swxx += w * xj * xj;
                swxy += w * xj * yj;
            }

            if (sw <= 0) {
                fitted[i] = ys[i] as number;
                continue;
            }
            const meanX = swx / sw;
            const meanY = swy / sw;
            const denom = swxx - sw * meanX * meanX;
            if (Math.abs(denom) < 1e-12) {
                fitted[i] = meanY; // Degenerate (no x spread) → weighted mean.
            } else {
                const b = (swxy - sw * meanX * meanY) / denom;
                const a = meanY - b * meanX;
                fitted[i] = a + b * xi;
            }
        }

        if (iter < iters) {
            // Recompute robustness weights from residuals (bisquare of |r|/(6·s)).
            const resAbs = ys.map((yv, idx) => Math.abs(yv - (fitted[idx] as number)));
            const median0 = (a: number[]): number => {
                if (a.length === 0) return 0;
                const sorted = [...a].sort((p, q) => p - q);
                const m = Math.floor(sorted.length / 2);
                return sorted.length % 2 !== 0
                    ? (sorted[m] as number)
                    : ((sorted[m - 1] as number) + (sorted[m] as number)) / 2;
            };
            // Robust scale = 6·MAD (Cleveland 1979). When the median residual is ~0
            // (most points fit exactly, a few outliers remain) MAD degenerates and
            // would either weight everything 1 (outlier survives) or, with naive
            // fallbacks, collapse the scale to floating-point dust and down-weight
            // everything. Use an epsilon-filtered scale: drop residuals that are zero
            // to machine precision, then take the median of the genuinely non-zero
            // ones. If none remain it is a genuine perfect fit (keep weight 1).
            const maxAbsRes = Math.max(...resAbs);
            const eps = 1e-9 * (1 + maxAbsRes);
            let scaleRef = median0(resAbs);
            if (scaleRef <= eps) {
                const positive = resAbs.filter((r) => r > eps);
                scaleRef = positive.length > 0 ? median0(positive) : 0;
            }
            const denomR = 6 * scaleRef;
            robustWeights = resAbs.map((r) => {
                if (denomR <= 0) return 1; // Genuine perfect fit (all residuals zero).
                const u = r / denomR;
                if (u >= 1) return 0;
                const t = 1 - u * u;
                return t * t; // bisquare
            });
        }
    }

    // Restore original input order.
    const fittedOrig = new Array<number>(n).fill(0);
    const residualsOrig = new Array<number>(n).fill(0);
    for (let idx = 0; idx < n; idx++) {
        const origPos = order[idx] as number;
        fittedOrig[origPos] = +(fitted[idx] as number);
        residualsOrig[origPos] = +((ys[idx] as number) - (fitted[idx] as number));
    }

    return { x: x.slice(0, n), fitted: fittedOrig, residuals: residualsOrig, span: f, k, robustnessIters: iters, n, method };
}

/**
 * Durbin–Watson test — detection of first-order serial correlation in regression
 * residuals.
 *
 * Por que importa aqui: os testes de tendência já presentes (linearRegression / OLS,
 * Mann–Kendall, Theil–Sen) assumem resíduos/observações independentes. Em séries
 * ambientais (concentrações diárias, vazões, NO2 horário) os resíduos costumam ser
 * autocorrelacionados, o que SUBESTIMA o erro-padrão da inclinação e infla a
 * significância da tendência (falsos positivos). O Durbin–Watson é o teste canônico
 * para diagnosticar essa autocorrelação de 1ª ordem nos resíduos de um ajuste OLS.
 *
 * Estatística (Durbin & Watson 1950/1951):
 *     d = Σ_{t=2}^{n} (e_t − e_{t−1})²  /  Σ_{t=1}^{n} e_t²
 *
 * Propriedades de referência (usadas como gate de correção nos testes):
 *   • Domínio: d ∈ [0, 4].
 *   • d ≈ 2  ⇒ ausência de autocorrelação de 1ª ordem.
 *   • d → 0  ⇒ autocorrelação positiva forte (resíduos "pegajosos").
 *   • d → 4  ⇒ autocorrelação negativa forte (resíduos alternam de sinal).
 *   • Relação exata com a autocorrelação amostral lag-1 ρ̂ dos resíduos:
 *         d ≈ 2·(1 − ρ̂),     com ρ̂ = Σ e_t e_{t−1} / Σ e_t²
 *     (a aproximação só ignora os termos de borda e₁², eₙ²; é igualdade quando
 *      esses termos são desprezíveis).
 *   • Caso fechado hand-calc: resíduos perfeitamente alternados [a,−a,a,−a,…]
 *     dão d = 4 exatamente (ρ̂ = −1); resíduos idênticos dão d = 0.
 *
 * Decisão (limites de Savin & White 1977, α = 0,05, modelo COM intercepto):
 * comparamos d contra os limites tabelados (d_L, d_U) para o nº de regressores k′
 * (excluindo o intercepto). Como a distribuição exata depende da matriz X, há uma
 * ZONA INCONCLUSIVA entre d_L e d_U (e simetricamente para 4−d). Esta implementação
 * embute a coluna k′ = 1 (regressão simples sobre o tempo — o uso dominante aqui)
 * para n = 6..100; fora disso devolve apenas a estatística e a aproximação por ρ̂.
 *
 * @reference Durbin, J. & Watson, G.S. (1950). "Testing for Serial Correlation in
 *            Least Squares Regression I." Biometrika 37(3/4):409–428.
 *            doi:10.2307/2332391
 * @reference Durbin, J. & Watson, G.S. (1951). "Testing for Serial Correlation in
 *            Least Squares Regression II." Biometrika 38(1/2):159–177.
 *            doi:10.2307/2332325
 * @reference Savin, N.E. & White, K.J. (1977). "The Durbin-Watson Test for Serial
 *            Correlation with Extreme Sample Sizes or Many Regressors."
 *            Econometrica 45(8):1989–1996. doi:10.2307/1914122
 *
 * @param {number[]} residuals - Resíduos do ajuste (e_t = y_t − ŷ_t), em ordem temporal.
 * @param {number} [k=1] - Nº de regressores excluindo o intercepto (k′). Só k=1 tem
 *                         tabela embutida; outros valores ⇒ decision = 'no-table'.
 * @returns {{ d: number, rhoHat: number, n: number, k: number,
 *             dL: number|null, dU: number|null,
 *             decision: string, interpretation: string, method: string }}
 */
export function durbinWatson(residuals: number[], k: number = 1): {
    d: number, rhoHat: number, n: number, k: number,
    dL: number | null, dU: number | null,
    decision: string, interpretation: string, method: string
} {
    const method = 'Durbin–Watson serial correlation test (Durbin & Watson 1950/1951; bounds Savin & White 1977)';
    const n = residuals.length;
    if (n < 2) {
        return { d: NaN, rhoHat: NaN, n, k, dL: null, dU: null, decision: 'insufficient-data', interpretation: 'n < 2', method };
    }

    let sumSq = 0;
    let sumDiffSq = 0;
    let sumCross = 0; // Σ e_t e_{t-1}, para ρ̂.
    for (let t = 0; t < n; t++) {
        const e = residuals[t] as number;
        sumSq += e * e;
        if (t >= 1) {
            const ePrev = residuals[t - 1] as number;
            const diff = e - ePrev;
            sumDiffSq += diff * diff;
            sumCross += e * ePrev;
        }
    }

    if (sumSq === 0) {
        // Resíduos todos nulos (ajuste perfeito): autocorrelação indefinida.
        return { d: NaN, rhoHat: NaN, n, k, dL: null, dU: null, decision: 'degenerate', interpretation: 'all residuals zero — autocorrelation undefined', method };
    }

    const d = sumDiffSq / sumSq;
    const rhoHat = sumCross / sumSq;

    // Limites de Savin & White (1977), α = 0,05 (one-sided lower), k′ = 1, intercepto.
    // Tabela (n: [dL, dU]). Valores publicados; usados para a zona de decisão.
    const SW_05_K1: Readonly<Record<number, readonly [number, number]>> = Object.freeze({
        6: [0.610, 1.400], 7: [0.700, 1.356], 8: [0.763, 1.332], 9: [0.824, 1.320],
        10: [0.879, 1.320], 11: [0.927, 1.324], 12: [0.971, 1.331], 13: [1.010, 1.340],
        14: [1.045, 1.350], 15: [1.077, 1.361], 16: [1.106, 1.371], 17: [1.133, 1.381],
        18: [1.158, 1.391], 19: [1.180, 1.401], 20: [1.201, 1.411], 25: [1.288, 1.454],
        30: [1.352, 1.489], 35: [1.402, 1.519], 40: [1.442, 1.544], 45: [1.475, 1.566],
        50: [1.503, 1.585], 55: [1.528, 1.601], 60: [1.549, 1.616], 65: [1.567, 1.629],
        70: [1.583, 1.641], 75: [1.598, 1.652], 80: [1.611, 1.662], 85: [1.624, 1.671],
        90: [1.635, 1.679], 95: [1.645, 1.687], 100: [1.654, 1.694],
    });

    let dL: number | null = null;
    let dU: number | null = null;
    if (k === 1) {
        // Use a maior chave tabelada ≤ n (conservador: limites crescem com n).
        const keys = Object.keys(SW_05_K1).map(Number).sort((a, b) => a - b);
        let chosen: number | null = null;
        for (const key of keys) {
            if (key <= n) chosen = key;
        }
        if (chosen !== null) {
            const pair = SW_05_K1[chosen] as readonly [number, number];
            dL = pair[0];
            dU = pair[1];
        }
    }

    let decision: string;
    let interpretation: string;
    if (dL === null || dU === null) {
        decision = 'no-table';
        interpretation = `d=${d.toFixed(3)} (ρ̂≈${rhoHat.toFixed(3)}). No tabulated bounds for k=${k}, n=${n}; interpret via d≈2(1−ρ̂): d<2 suggests positive, d>2 negative serial correlation.`;
    } else if (d < dL) {
        decision = 'positive-autocorrelation';
        interpretation = `d=${d.toFixed(3)} < dL=${dL} → reject H0: evidence of POSITIVE first-order autocorrelation (α=0.05). Trend significance likely overstated.`;
    } else if (d > 4 - dL) {
        decision = 'negative-autocorrelation';
        interpretation = `d=${d.toFixed(3)} > 4−dL=${(4 - dL).toFixed(3)} → reject H0: evidence of NEGATIVE first-order autocorrelation (α=0.05).`;
    } else if (d > dU && d < 4 - dU) {
        decision = 'no-autocorrelation';
        interpretation = `dU=${dU} < d=${d.toFixed(3)} < 4−dU=${(4 - dU).toFixed(3)} → fail to reject H0: no evidence of first-order autocorrelation (α=0.05).`;
    } else {
        decision = 'inconclusive';
        interpretation = `d=${d.toFixed(3)} falls in the Durbin–Watson inconclusive region [dL=${dL}, dU=${dU}] (or its upper mirror); test is indeterminate.`;
    }

    return { d: +d.toFixed(6), rhoHat: +rhoHat.toFixed(6), n, k, dL, dU, decision, interpretation, method };
}

// ================================================================
// WALD–WOLFOWITZ RUNS TEST — Non-parametric test of randomness
// Teste de sequências (runs) de Wald–Wolfowitz para aleatoriedade
// ================================================================

/**
 * Wald–Wolfowitz runs test — non-parametric test for the randomness (serial
 * independence) of a dichotomous sequence.
 *
 * Por que importa aqui: Durbin–Watson (acima) diagnostica autocorrelação de 1ª
 * ordem em resíduos de uma regressão paramétrica; o runs test é o complemento
 * NÃO-PARAMÉTRICO e livre de modelo. Ele só observa o PADRÃO de sinais de uma
 * sequência (ex.: resíduos acima/abaixo da mediana, ou medições acima/abaixo de
 * um limite regulatório CONAMA ao longo do tempo) e pergunta: esse padrão é
 * compatível com sorteio aleatório, ou há AGRUPAMENTO (poucos runs → clustering,
 * processo "pegajoso") ou OSCILAÇÃO excessiva (muitos runs → alternância
 * sistemática)? Não assume normalidade nem linearidade — útil quando o
 * pré-requisito de independência dos testes de tendência (Mann–Kendall,
 * Theil–Sen, OLS) precisa ser AUDITADO antes de confiar na sua significância.
 *
 * Definição de "run": uma sub-sequência maximal de símbolos idênticos. Para
 *   + + - - - + -   há R = 4 runs (++, ---, +, -), com n1 = 3 sinais '+' e
 *   n2 = 4 sinais '-'.
 *
 * Hipótese nula H0: a ordem dos n1 '+' e n2 '-' é uma permutação aleatória.
 * Sob H0 o número de runs R tem (Wald & Wolfowitz 1940, distribuição exata):
 *     E[R]   = 1 + 2·n1·n2/(n1+n2)
 *     Var[R] = 2·n1·n2·(2·n1·n2 − n1 − n2) / [ (n1+n2)²·(n1+n2−1) ]
 * Para n1, n2 ≳ 10 a estatística padronizada (com correção de continuidade) é
 * aproximadamente normal:
 *     Z = ( R − E[R] ± 0.5 ) / sqrt(Var[R])
 * onde o sinal da correção de continuidade aproxima R de E[R]. p bicaudal =
 * 2·(1 − Φ(|Z|)).
 *
 * Interpretação do sinal de Z:
 *   • R muito MENOR que E[R]  (Z < 0) ⇒ poucos runs ⇒ AGRUPAMENTO / tendência /
 *     autocorrelação positiva (sinais "grudam").
 *   • R muito MAIOR que E[R]  (Z > 0) ⇒ muitos runs ⇒ OSCILAÇÃO / autocorrelação
 *     negativa (sinais alternam mais do que o acaso preveria).
 *
 * Casos fechados hand-calc (gate de correção):
 *   • Sequência perfeitamente alternada + - + - + - (n1=n2=3): R = 6 = máximo,
 *     bem acima de E[R]=4 ⇒ Z > 0 (oscilação).
 *   • Dois blocos + + + - - - (n1=n2=3): R = 2 = mínimo, bem abaixo de E[R]=4
 *     ⇒ Z < 0 (agrupamento).
 *
 * Dicotomização: se a entrada for numérica e nenhum `threshold` for dado, a
 * série é dicotomizada pela MEDIANA (mediana exata é descartada como empate,
 * convenção padrão). Valores exatamente iguais ao threshold são descartados
 * (não contam como '+' nem '-'), preservando a definição binária do teste.
 *
 * @reference Wald, A. & Wolfowitz, J. (1940). "On a Test Whether Two Samples are
 *            from the Same Population." Annals of Mathematical Statistics
 *            11(2):147–162. doi:10.1214/aoms/1177731909
 * @reference Gibbons, J.D. & Chakraborti, S. (2011). "Nonparametric Statistical
 *            Inference", 5th ed., CRC Press. ISBN 978-1-4200-7761-2 (runs test,
 *            exact moments E[R], Var[R] and normal approximation).
 *
 * @param {number[]|Array<boolean|'+'|'-'|0|1>} sequence - Série a testar. Se
 *        numérica, é dicotomizada por `threshold` (ou pela mediana). Símbolos
 *        booleanos / '+' / '-' / 0 / 1 são usados diretamente.
 * @param {number} [threshold?] - Corte de dicotomização para entrada numérica.
 *        Omitido ⇒ mediana amostral. Ignorado para entrada simbólica.
 * @returns {{ runs: number, n1: number, n2: number, n: number,
 *             expected: number, variance: number, z: number, pValue: number,
 *             random: boolean|null, decision: string, threshold: number|null,
 *             interpretation: string, method: string }}
 */
export function waldWolfowitzRunsTest(
    sequence: Array<number | boolean | '+' | '-' | 0 | 1>,
    threshold?: number,
    alpha: number = 0.05,
): {
    runs: number, n1: number, n2: number, n: number,
    expected: number, variance: number, z: number, pValue: number,
    random: boolean | null, decision: string, threshold: number | null,
    interpretation: string, method: string,
} {
    const method = 'Wald–Wolfowitz runs test for randomness (Wald & Wolfowitz 1940; normal approx. Gibbons & Chakraborti 2011)';

    // 1) Convert input to a binary signal of '+'(true) / '-'(false), dropping
    //    elements that are exact ties with the dichotomization threshold.
    const bits: boolean[] = [];
    let usedThreshold: number | null = null;

    const isSymbolic = sequence.every(
        (v) => typeof v === 'boolean' || v === '+' || v === '-' || v === 0 || v === 1,
    );

    if (isSymbolic && sequence.length > 0) {
        for (const v of sequence) {
            if (v === true || v === '+' || v === 1) bits.push(true);
            else if (v === false || v === '-' || v === 0) bits.push(false);
        }
    } else {
        // Numeric dichotomization.
        const nums = sequence.map((v) => Number(v)).filter((v) => Number.isFinite(v));
        let cut: number;
        if (typeof threshold === 'number' && Number.isFinite(threshold)) {
            cut = threshold;
        } else {
            const sorted = [...nums].sort((a, b) => a - b);
            const m = sorted.length;
            cut = m === 0
                ? 0
                : (m % 2 === 1
                    ? (sorted[(m - 1) / 2] as number)
                    : ((sorted[m / 2 - 1] as number) + (sorted[m / 2] as number)) / 2);
        }
        usedThreshold = cut;
        for (const v of nums) {
            if (v > cut) bits.push(true);
            else if (v < cut) bits.push(false);
            // v === cut → tie, dropped (standard convention).
        }
    }

    const n1 = bits.filter((b) => b).length;
    const n2 = bits.length - n1;
    const n = n1 + n2;

    if (n1 === 0 || n2 === 0 || n < 2) {
        return {
            runs: n === 0 ? 0 : 1, n1, n2, n,
            expected: NaN, variance: NaN, z: NaN, pValue: NaN,
            random: null, decision: 'insufficient-data', threshold: usedThreshold,
            interpretation: `Need both symbols present (n1=${n1}, n2=${n2}); runs test undefined for a single-valued or empty sequence.`,
            method,
        };
    }

    // 2) Count runs (maximal blocks of identical symbols).
    let runs = 1;
    for (let i = 1; i < bits.length; i++) {
        if (bits[i] !== bits[i - 1]) runs++;
    }

    // 3) Exact null moments (Wald & Wolfowitz 1940).
    const expected = 1 + (2 * n1 * n2) / n;
    const variance = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));

    let z: number;
    let pValue: number;
    if (variance <= 0) {
        // Degenerate (e.g. n=2): variance non-positive ⇒ no usable Z.
        z = 0;
        pValue = 1;
    } else {
        // Standardized statistic with continuity correction toward the mean.
        const diff = runs - expected;
        const cc = diff > 0 ? -0.5 : (diff < 0 ? 0.5 : 0);
        z = (diff + cc) / Math.sqrt(variance);
        pValue = 2 * (1 - normalCDF(Math.abs(z)));
        if (pValue > 1) pValue = 1;
        if (pValue < 0) pValue = 0;
    }

    const random = variance <= 0 ? null : pValue >= alpha;

    let decision: string;
    let interpretation: string;
    if (random === null) {
        decision = 'degenerate';
        interpretation = `Variance ≤ 0 (n=${n} too small); test indeterminate.`;
    } else if (random) {
        decision = 'random';
        interpretation = `R=${runs} vs E[R]=${expected.toFixed(2)} (Z=${z.toFixed(3)}, p=${pValue.toFixed(4)} ≥ α=${alpha}) → fail to reject H0: sequence is consistent with randomness.`;
    } else if (z < 0) {
        decision = 'too-few-runs';
        interpretation = `R=${runs} < E[R]=${expected.toFixed(2)} (Z=${z.toFixed(3)}, p=${pValue.toFixed(4)} < α=${alpha}) → reject H0: TOO FEW runs ⇒ clustering / positive serial dependence (trend or sticky process).`;
    } else {
        decision = 'too-many-runs';
        interpretation = `R=${runs} > E[R]=${expected.toFixed(2)} (Z=${z.toFixed(3)}, p=${pValue.toFixed(4)} < α=${alpha}) → reject H0: TOO MANY runs ⇒ over-oscillation / negative serial dependence.`;
    }

    return {
        runs, n1, n2, n,
        expected: +expected.toFixed(6), variance: +variance.toFixed(6),
        z: +z.toFixed(6), pValue: +pValue.toFixed(6),
        random, decision, threshold: usedThreshold, interpretation, method,
    };
}
