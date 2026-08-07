// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/* ================================================================
   FLOOD FREQUENCY ANALYSIS — Pure mathematical functions
   Análise de frequência de cheias — funções matemáticas puras
   ================================================================

   MÉTODOS:
   - Weibull (1939) e Gringorten (1963): posições de plotagem
   - Gumbel EV-I (1958): método dos momentos + quantil
   - Log-Pearson III (Bulletin 17C, USGS 2019): Wilson-Hilferty
   - Kolmogorov-Smirnov goodness-of-fit (Massey 1951)
   - Intervalo de confiança 95% (Beard 1960)
   - Design flood dispatcher + índice de frequência regional (Dalrymple 1960)

   REFERÊNCIAS:
   - Weibull, W. (1939). A statistical theory of the strength of materials.
   - Gringorten, I.I. (1963). J. Geophys. Res., 68(3), 813-814.
   - Gumbel, E.J. (1958). Statistics of Extremes. Columbia Univ. Press.
   - Bulletin 17C: USGS (2019). https://doi.org/10.3133/tm4B5
   - Wilson, E.B. & Hilferty, M.M. (1931). PNAS, 17(12), 684-688.
   - Massey, F.J. (1951). JASA, 46(253), 68-78.
   - Beard, L.R. (1960). USBR.
   - Dalrymple, T. (1960). USGS Water Supply Paper 1543-A.

   ================================================================ */

// ----------------------------------------------------------------
// INTERNAL HELPERS
// Auxiliares internos
// ----------------------------------------------------------------

/**
 * Computes sample mean.
 * Calcula a média aritmética da amostra.
 * @param {number[]} arr
 * @returns {number}
 */
function mean(arr: number[]): number {
    if (!arr || arr.length === 0) return NaN;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Computes sample standard deviation (unbiased, n-1).
 * Desvio padrão amostral (não-viesado, n-1).
 * @param {number[]} arr
 * @returns {number}
 */
function stddev(arr: number[]): number {
    const n = arr.length;
    if (n < 2) return 0;
    const m = mean(arr);
    const sumSq = arr.reduce((s, v) => s + (v - m) ** 2, 0);
    return Math.sqrt(sumSq / (n - 1));
}

/**
 * Computes sample skewness (bias-corrected g1 = n/((n-1)(n-2)) * sum((x-xbar)^3)/s^3).
 * Assimetria amostral corrigida para viés.
 * @param {number[]} arr
 * @returns {number}
 */
function skewness(arr: number[]): number {
    const n = arr.length;
    if (n < 3) return 0;
    const m = mean(arr);
    const s = stddev(arr);
    if (s === 0) return 0;
    const sumCube = arr.reduce((acc, v) => acc + ((v - m) / s) ** 3, 0);
    return (n / ((n - 1) * (n - 2))) * sumCube;
}

/**
 * Standard normal CDF via rational approximation (Abramowitz & Stegun 26.2.17).
 * CDF normal padrão por aproximação racional.
 * @param {number} z
 * @returns {number}
 */
function normalCDF(z: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
    const pdf = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
    const p = 1 - pdf * poly;
    return z >= 0 ? p : 1 - p;
}

/**
 * Standard normal quantile (inverse CDF) via Beasley-Springer-Moro approximation.
 * Quantil normal padrão (inverso da CDF) - aproximação BSM.
 * @param {number} p - probability in (0, 1)
 * @returns {number} z-score
 */
function normalQuantile(p: number): number {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    // Rational approximation from Abramowitz & Stegun 26.2.22
    const a: [number, number, number] = [2.515517, 0.802853, 0.010328];
    const b: [number, number, number] = [1.432788, 0.189269, 0.001308];
    const sign = p < 0.5 ? -1 : 1;
    const q = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(q));
    const num = a[0] + t * (a[1] + t * a[2]);
    const den = 1 + t * (b[0] + t * (b[1] + t * b[2]));
    return sign * (t - num / den);
}

/**
 * Gumbel CDF: F(x) = exp(-exp(-(x-u)/alpha)).
 * CDF da distribuição Gumbel EV-I.
 * @param {number} x
 * @param {number} u - location parameter
 * @param {number} alpha - scale parameter
 * @returns {number}
 */
function gumbelCDF(x: number, u: number, alpha: number): number {
    return Math.exp(-Math.exp(-(x - u) / alpha));
}

/**
 * Lognormal CDF using normalCDF on log-transformed value.
 * CDF lognormal usando CDF normal no valor log-transformado.
 * @param {number} x
 * @param {number} mu_ln - mean of ln(X)
 * @param {number} sigma_ln - std dev of ln(X)
 * @returns {number}
 */
function lognormalCDF(x: number, mu_ln: number, sigma_ln: number): number {
    if (x <= 0 || sigma_ln <= 0) return 0;
    return normalCDF((Math.log(x) - mu_ln) / sigma_ln);
}

// ----------------------------------------------------------------
// PLOTTING POSITIONS
// Posições de plotagem
// ----------------------------------------------------------------

/**
 * Weibull plotting position for annual maximum series.
 * Posição de plotagem de Weibull para série de máximos anuais.
 *
 * P_exceedance = rank / (n + 1)
 * T = (n + 1) / rank
 *
 * @param {number} n - sample size
 * @param {number} rank - rank of observation (1 = largest)
 * @returns {{P_exceedance: number, T_years: number}}
 * @reference Weibull (1939)
 */
function weibullPlottingPosition(n: number, rank: number): {P_exceedance: number, T_years: number} {
    if (n < 1 || rank < 1 || rank > n) throw new RangeError('rank must be in [1, n]');
    const P_exceedance = rank / (n + 1);
    const T_years = (n + 1) / rank;
    return { P_exceedance, T_years };
}

/**
 * Gringorten plotting position, optimized for Gumbel distribution.
 * Posição de plotagem de Gringorten, otimizada para distribuição de Gumbel.
 *
 * P = (rank - 0.44) / (n + 0.12)
 *
 * @param {number} n - sample size
 * @param {number} rank - rank of observation (1 = largest)
 * @returns {{P_exceedance: number, T_years: number}}
 * @reference Gringorten (1963) J. Geophys. Res. 68(3), 813-814
 */
function grindelinPlottingPosition(n: number, rank: number): {P_exceedance: number, T_years: number} {
    if (n < 1 || rank < 1 || rank > n) throw new RangeError('rank must be in [1, n]');
    const P_exceedance = (rank - 0.44) / (n + 0.12);
    const T_years = 1 / P_exceedance;
    return { P_exceedance, T_years };
}

// ----------------------------------------------------------------
// GUMBEL EV-I (Type I Extreme Value)
// ----------------------------------------------------------------

/**
 * Estimates Gumbel EV-I parameters by method of moments.
 * Estima parâmetros Gumbel EV-I pelo método dos momentos.
 *
 * alpha = sqrt(6) * sigma / pi
 * u = mean - 0.5772 * alpha  (Euler-Mascheroni constant)
 *
 * @param {number[]} annual_max_series - array of annual maximum discharges
 * @returns {{u: number, alpha: number, mean: number, sigma: number}}
 * @reference Gumbel (1958) Statistics of Extremes. Columbia Univ. Press.
 */
function gumbelParameters(annual_max_series: number[]): {u: number, alpha: number, mean: number, sigma: number} {
    if (!annual_max_series || annual_max_series.length < 2) {
        throw new RangeError('annual_max_series must have at least 2 values');
    }
    const m = mean(annual_max_series);
    const sigma = stddev(annual_max_series);
    const alpha = (Math.sqrt(6) * sigma) / Math.PI;
    const u = m - 0.5772156649 * alpha; // Euler-Mascheroni constant
    return { u, alpha, mean: m, sigma };
}

/**
 * Computes Gumbel EV-I flood quantile for given return period.
 * Calcula quantil de cheia Gumbel EV-I para dado período de retorno.
 *
 * x_T = u - alpha * ln(-ln(1 - 1/T))
 *
 * @param {number} T_years - return period in years
 * @param {number} u - location parameter
 * @param {number} alpha - scale parameter
 * @returns {number} flood quantile
 * @reference Gumbel (1958)
 */
function gumbelQuantile(T_years: number, u: number, alpha: number): number {
    if (T_years <= 1) throw new RangeError('T_years must be > 1');
    const F = 1 - 1 / T_years;
    return u - alpha * Math.log(-Math.log(F));
}

// ----------------------------------------------------------------
// LOG-PEARSON III (LP3)
// ----------------------------------------------------------------

/**
 * Estimates Log-Pearson III parameters by method of moments in log space.
 * Estima parâmetros LP3 pelo método dos momentos no espaço logarítmico.
 *
 * @param {number[]} annual_max_series - positive discharge values
 * @returns {{mu_ln: number, sigma_ln: number, g: number, n: number}}
 * @reference Bulletin 17C, USGS (2019). https://doi.org/10.3133/tm4B5
 */
function logPearsonIIIParameters(annual_max_series: number[]): {mu_ln: number, sigma_ln: number, g: number, n: number} {
    if (!annual_max_series || annual_max_series.length < 3) {
        throw new RangeError('annual_max_series must have at least 3 values');
    }
    if (annual_max_series.some((v) => v <= 0)) {
        throw new RangeError('all values must be positive for LP3');
    }
    const lnQ = annual_max_series.map((v) => Math.log(v));
    const mu_ln = mean(lnQ);
    const sigma_ln = stddev(lnQ);
    const g = skewness(lnQ);
    return { mu_ln, sigma_ln, g, n: annual_max_series.length };
}

/**
 * Computes LP3 flood quantile using Wilson-Hilferty approximation.
 * Calcula quantil LP3 usando aproximação de Wilson-Hilferty.
 *
 * Kt = (2/g) * (1 + g*z/6 - g^2/36)^3 - 2/g  (Pearson frequency factor)
 * ln(Q_T) = mu_ln + Kt * sigma_ln
 * Q_T = exp(ln(Q_T))
 *
 * @param {number} T_years - return period in years
 * @param {number} mu_ln - mean of ln(Q)
 * @param {number} sigma_ln - std dev of ln(Q)
 * @param {number} g - skewness of ln(Q)
 * @returns {number} Q_T flood quantile
 * @reference Bulletin 17C USGS (2019); Wilson & Hilferty (1931) PNAS 17(12), 684-688
 */
function logPearsonIIIQuantile(T_years: number, mu_ln: number, sigma_ln: number, g: number): number {
    if (T_years <= 1) throw new RangeError('T_years must be > 1');
    const p_exceed = 1 / T_years;
    const p_nonexceed = 1 - p_exceed;
    const z = normalQuantile(p_nonexceed);

    let Kt;
    if (Math.abs(g) < 1e-6) {
        // Symmetric case: LP3 → lognormal
        Kt = z;
    } else {
        // Wilson-Hilferty cube-root transformation
        const k = g / 6;
        const inner = 1 + k * z - k * k;
        // Guard against negative cube root argument
        const innerCubed = inner <= 0 ? 0 : inner ** 3;
        Kt = (2 / g) * (innerCubed - 1);
    }

    const lnQT = mu_ln + Kt * sigma_ln;
    return Math.exp(lnQT);
}

// ----------------------------------------------------------------
// KOLMOGOROV-SMIRNOV GOODNESS-OF-FIT
// ----------------------------------------------------------------

/**
 * Kolmogorov-Smirnov goodness-of-fit test for flood frequency distributions.
 * Teste de aderência Kolmogorov-Smirnov para distribuições de frequência de cheias.
 *
 * D_stat = max|F_empirical(x_i) - F_theoretical(x_i)|
 * D_crit_05 = 1.36 / sqrt(n)  for n > 30
 *
 * @param {number[]} sorted_data - sorted (ascending) data
 * @param {'gumbel'|'lognormal'} distribution
 * @param {{u?: number, alpha?: number, mu_ln?: number, sigma_ln?: number}} params - distribution parameters
 * @returns {{D_stat: number, D_crit_05: number, reject_H0: boolean}}
 * @reference Massey (1951) JASA 46(253), 68-78
 */
function kolmogorovSmirnovFlood(sorted_data: number[], distribution: 'gumbel'|'lognormal', params: {u?: number, alpha?: number, mu_ln?: number, sigma_ln?: number}): {D_stat: number, D_crit_05: number, reject_H0: boolean} {
    const n = sorted_data.length;
    if (n < 2) throw new RangeError('sorted_data must have at least 2 values');

        let theoreticalCDF: (x: number) => number;
    if (distribution === 'gumbel') {
        const u = (params.u as number);
        const alpha = (params.alpha as number);
        theoreticalCDF = (x) => gumbelCDF(x, u, alpha);
    } else if (distribution === 'lognormal') {
        const mu_ln = (params.mu_ln as number);
        const sigma_ln = (params.sigma_ln as number);
        theoreticalCDF = (x) => lognormalCDF(x, mu_ln, sigma_ln);
    } else {
        throw new RangeError(`Unknown distribution: ${distribution}. Use 'gumbel' or 'lognormal'.`);
    }

    let D_stat = 0;
    for (let i = 0; i < n; i++) {
        const F_emp = (i + 1) / n; // empirical CDF at x_i
        const F_theo = theoreticalCDF(sorted_data[i]!);
        const d = Math.abs(F_emp - F_theo);
        if (d > D_stat) D_stat = d;
    }

    const D_crit_05 = 1.36 / Math.sqrt(n);
    return { D_stat, D_crit_05, reject_H0: D_stat > D_crit_05 };
}

// ----------------------------------------------------------------
// CONFIDENCE INTERVAL
// Intervalo de confiança
// ----------------------------------------------------------------

/**
 * Approximate 95% confidence interval for flood quantile (Beard 1960).
 * Intervalo de confiança aproximado de 95% para quantil de cheia.
 *
 * SE = Q_T * sqrt(2 * T^2 / (n * (T-1)^2))
 * CI_95 = [Q_T - 1.96*SE, Q_T + 1.96*SE]
 *
 * @param {number} Q_T - flood quantile (m³/s or any unit)
 * @param {number} n - record length in years
 * @param {number} T_years - return period
 * @returns {{Q_T: number, CI_lower: number, CI_upper: number, SE_relative: number}}
 * @reference Beard (1960) USBR
 */
function confidenceInterval95Flood(Q_T: number, n: number, T_years: number): {Q_T: number, CI_lower: number, CI_upper: number, SE_relative: number} {
    if (n < 2) throw new RangeError('n must be >= 2');
    if (T_years <= 1) throw new RangeError('T_years must be > 1');
    const SE = Q_T * Math.sqrt((2 * T_years ** 2) / (n * (T_years - 1) ** 2));
    return {
        Q_T,
        CI_lower: Q_T - 1.96 * SE,
        CI_upper: Q_T + 1.96 * SE,
        SE_relative: SE / Q_T,
    };
}

// ----------------------------------------------------------------
// DESIGN FLOOD DISPATCHER
// Despachador de cheia de projeto
// ----------------------------------------------------------------

/**
 * Computes design flood for a given return period using the selected method.
 * Calcula a cheia de projeto para dado período de retorno pelo método selecionado.
 *
 * @param {number[]} annual_max_series - annual maximum discharge series
 * @param {number} T_years - return period in years
 * @param {'gumbel'|'lp3'|'lognormal'} method - frequency distribution
 * @returns {{Q_T: number, method: string, T_years: number, n_years: number}}
 */
function designFlood(annual_max_series: number[], T_years: number, method: 'gumbel'|'lp3'|'lognormal'): {Q_T: number, method: string, T_years: number, n_years: number} {
    if (!annual_max_series || annual_max_series.length < 3) {
        throw new RangeError('annual_max_series must have at least 3 values');
    }
    if (T_years <= 1) throw new RangeError('T_years must be > 1');

    let Q_T;
    const n_years = annual_max_series.length;

    if (method === 'gumbel') {
        const { u, alpha } = gumbelParameters(annual_max_series);
        Q_T = gumbelQuantile(T_years, u, alpha);
    } else if (method === 'lp3') {
        const { mu_ln, sigma_ln, g } = logPearsonIIIParameters(annual_max_series);
        Q_T = logPearsonIIIQuantile(T_years, mu_ln, sigma_ln, g);
    } else if (method === 'lognormal') {
        const lnQ = annual_max_series.map((v) => Math.log(v));
        const mu_ln = mean(lnQ);
        const sigma_ln = stddev(lnQ);
        const z = normalQuantile(1 - 1 / T_years);
        Q_T = Math.exp(mu_ln + z * sigma_ln);
    } else {
        throw new RangeError(`Unknown method: ${method}. Use 'gumbel', 'lp3', or 'lognormal'.`);
    }

    return { Q_T, method, T_years, n_years };
}

// ----------------------------------------------------------------
// REGIONAL FREQUENCY ANALYSIS
// Análise de frequência regional
// ----------------------------------------------------------------

/**
 * Regional frequency index (index-flood method, Dalrymple 1960).
 * Índice de frequência regional pelo método do índice de cheia.
 *
 * Index flood = median of site Q_T values.
 * Normalized growth curve = Q_T / Q_index for each site.
 *
 * @param {number[]} Q_T_sites - flood quantile at T for each site
 * @param {number[]} drainage_areas - drainage area for each site (km² or any unit)
 * @param {number} T_years - return period
 * @returns {{Q_index: number, normalized: number[], regional_mean: number, regional_cv: number}}
 * @reference Dalrymple (1960) USGS Water Supply Paper 1543-A
 */
function regionalFrequencyIndex(Q_T_sites: number[], drainage_areas: number[], _T_years: number): {Q_index: number, normalized: number[], regional_mean: number, regional_cv: number} {
    if (!Q_T_sites || Q_T_sites.length < 2) {
        throw new RangeError('Q_T_sites must have at least 2 sites');
    }
    if (Q_T_sites.length !== drainage_areas.length) {
        throw new RangeError('Q_T_sites and drainage_areas must have equal length');
    }

    // Median as index flood
    const sorted = [...Q_T_sites].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const Q_index = sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;

    const normalized = Q_T_sites.map((q) => q / Q_index);
    const regional_mean = mean(normalized);
    const regional_cv = stddev(normalized) / regional_mean;

    return { Q_index, normalized, regional_mean, regional_cv };
}

// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------

export {
    weibullPlottingPosition,
    grindelinPlottingPosition,
    gumbelParameters,
    gumbelQuantile,
    logPearsonIIIParameters,
    logPearsonIIIQuantile,
    kolmogorovSmirnovFlood,
    confidenceInterval95Flood,
    designFlood,
    regionalFrequencyIndex,
};

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const floodFrequencyAnalysisMeta = {
    name: 'floodFrequencyAnalysis',
    description: 'floodFrequencyAnalysis',
    category: 'analytics',
    familyTags: ['flood'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
