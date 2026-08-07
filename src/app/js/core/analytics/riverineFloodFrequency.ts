// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Riverine Flood Frequency Analysis
 * Análise de Frequência de Cheias em Cursos d'Água
 *
 * References / Referências:
 * - Gumbel, E.J. (1958). Statistics of Extremes. Columbia University Press, NY.
 *   ISBN: 978-0486436043
 * - Bulletin 17C (USGS, 2019). Guidelines for Determining Flood Flow Frequency.
 *   Interagency Committee on Water Data. USGS Techniques and Methods 4-B5.
 *   DOI: 10.3133/tm4B5
 * - Haan, C.T. (2002). Statistical Methods in Hydrology, 2nd ed. Iowa State Press.
 *   ISBN: 978-0813815039
 * - Kite, G.W. (1977). Frequency and Risk Analysis in Hydrology. Water Resources Publications.
 * - ANA (2012). Manual de Hidrologia: Análise de Frequência. Agência Nacional de Águas, Brasília.
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Sem dependências de DOM, IDB, Three.js ou fetch.
 */

// Standard return periods used in Brazilian and US engineering practice
// Períodos de retorno padrão usados na prática de engenharia brasileira e americana
const STANDARD_TR = [2, 5, 10, 25, 50, 100];

/**
 * Validate finite number in range.
 * Valida número finito no intervalo.
 * @param {number} v
 * @param {string} name
 * @param {number} [min]
 * @param {number} [max]
 */
function _check(v: number, name: string, min: number = -Infinity, max: number = Infinity) {
    if (typeof v !== 'number' || !isFinite(v)) {
        throw new TypeError(`${name} must be a finite number`);
    }
    if (v < min || v > max) {
        throw new RangeError(`${name} must be in [${min}, ${max}], got: ${v}`);
    }
}

/**
 * Validate array of positive finite numbers.
 * Valida array de números positivos e finitos.
 * @param {number[]} arr
 * @param {string} name
 * @param {number} [minLen=2]
 */
function _validateSeries(arr: number[], name: string, minLen: number = 2) {
    if (!Array.isArray(arr) || arr.length < minLen) {
        throw new TypeError(`${name} must be an array with at least ${minLen} elements`);
    }
    arr.forEach((v, i) => {
        if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
            throw new RangeError(`${name}[${i}] must be a positive finite number`);
        }
    });
}

/**
 * Sample mean.
 * Média amostral.
 * @param {number[]} arr
 * @returns {number}
 */
function _mean(arr: number[]): number {
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Sample standard deviation (unbiased, n-1).
 * Desvio padrão amostral (não viesado, n-1).
 * @param {number[]} arr
 * @param {number} mean
 * @returns {number}
 */
function _std(arr: number[], mean: number): number {
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
}

/**
 * Sample skewness coefficient (Bulletin 17C, moment method).
 * Coeficiente de assimetria amostral (Bulletin 17C, método dos momentos).
 * @param {number[]} arr
 * @param {number} mean
 * @param {number} std
 * @returns {number}
 */
function _skewness(arr: number[], mean: number, std: number): number {
    const n = arr.length;
    if (std < 1e-15) return 0;
    const factor = n / ((n - 1) * (n - 2));
    const sum3 = arr.reduce((s, v) => s + ((v - mean) / std) ** 3, 0);
    return factor * sum3;
}

/**
 * Fit Gumbel (Extreme Value Type I) distribution to annual maxima series.
 * Ajusta a distribuição de Gumbel (Valor Extremo Tipo I) à série de máximos anuais.
 *
 * Parameters: α = π / (√6 * σ),  u = μ - 0.5772 / α
 * (Method of Moments - Gumbel 1958, Ch. 2)
 *
 * @param {number[]} annualMaxima - Array of annual peak flows (m³/s), length >= 5
 * @returns {{ alpha: number, u: number, mean: number, std: number }}
 */
export function fitGumbel(annualMaxima: number[]): { alpha: number, u: number, mean: number, std: number } {
    _validateSeries(annualMaxima, 'annualMaxima', 5);
    const mu = _mean(annualMaxima);
    const sig = _std(annualMaxima, mu);
    if (sig < 1e-12) throw new RangeError('Standard deviation near zero; series has no variability');
    const alpha = Math.PI / (Math.sqrt(6) * sig);
    const u = mu - 0.5772156649 / alpha; // Euler–Mascheroni constant / constante de Euler-Mascheroni
    return { alpha, u, mean: mu, std: sig };
}

/**
 * Estimate peak flow for a given return period using Gumbel distribution.
 * Estima a vazão de pico para um período de retorno usando a distribuição de Gumbel.
 *
 * Q(T) = u + y_T / α  where y_T = -ln(-ln(1 - 1/T))
 *
 * @param {{ alpha: number, u: number }} gumbelParams - Output of fitGumbel()
 * @param {number} returnPeriod_yr - Return period in years (> 1)
 * @returns {number} Estimated peak flow (same units as input series)
 */
export function gumbelQuantile(gumbelParams: { alpha: number, u: number }, returnPeriod_yr: number): number {
    _check(returnPeriod_yr, 'returnPeriod_yr', 1 + 1e-9);
    const { alpha, u } = gumbelParams;
    const p = 1 - 1 / returnPeriod_yr; // exceedance probability
    const yT = -Math.log(-Math.log(p)); // reduced variate / variável reduzida
    return u + yT / alpha;
}

/**
 * Fit log-Pearson Type III distribution parameters (Bulletin 17C).
 * Ajusta parâmetros da distribuição log-Pearson Tipo III (Bulletin 17C).
 *
 * Transforms series to log-space: Yi = ln(Xi), then computes moments.
 *
 * @param {number[]} annualMaxima - Annual peak flows (m³/s), all > 0, length >= 5
 * @returns {{ meanLog: number, stdLog: number, skewnessLog: number }}
 */
export function fitLogPearsonIII(annualMaxima: number[]): { meanLog: number, stdLog: number, skewnessLog: number } {
    _validateSeries(annualMaxima, 'annualMaxima', 5);
    const logs = annualMaxima.map((v) => Math.log(v));
    const meanLog = _mean(logs);
    const stdLog = _std(logs, meanLog);
    const skLog = _skewness(logs, meanLog, stdLog);
    return { meanLog, stdLog, skewnessLog: skLog };
}

/**
 * Estimate quantile using log-Pearson III (Wilson-Hilferty approximation, Bulletin 17C eq. 3-2).
 * Estima quantil usando log-Pearson III (aproximação de Wilson-Hilferty, Bulletin 17C eq. 3-2).
 *
 * KT = (2/g) * [(z - g/6) * (g/6) + 1]^3 - 2/g
 * Q(T) = exp(meanLog + KT * stdLog)
 *
 * where g = skewnessLog, z = standard normal quantile at exceedance probability 1/T
 *
 * @param {{ meanLog: number, stdLog: number, skewnessLog: number }} lp3Params
 * @param {number} returnPeriod_yr - Return period (> 1)
 * @returns {number} Estimated peak flow (m³/s)
 */
export function logPearsonIIIQuantile(lp3Params: { meanLog: number, stdLog: number, skewnessLog: number }, returnPeriod_yr: number): number {
    _check(returnPeriod_yr, 'returnPeriod_yr', 1 + 1e-9);
    const { meanLog, stdLog, skewnessLog: g } = lp3Params;

    // Standard normal quantile via rational approximation (Abramowitz & Stegun 26.2.17)
    // Quantil normal padrão via aproximação racional
    const p = 1 - 1 / returnPeriod_yr;
    const z = _normalQuantile(p);

    let KT;
    if (Math.abs(g) < 1e-6) {
        // Normal approximation when skewness ≈ 0 / Aproximação normal quando assimetria ≈ 0
        KT = z;
    } else {
        const k = z - g / 6;
        KT = (2 / g) * (Math.pow(k * (g / 6) + 1, 3) - 1);
    }

    return Math.exp(meanLog + KT * stdLog);
}

/**
 * Standard normal quantile (inverse CDF) via rational approximation.
 * Quantil normal padrão (CDF inversa) via aproximação racional.
 * Abramowitz & Stegun (1964), section 26.2.17. Maximum error 4.5e-4.
 * @param {number} p - Probability (0 < p < 1)
 * @returns {number} z-score
 */
function _normalQuantile(p: number): number {
    if (p <= 0 || p >= 1) throw new RangeError('p must be in (0, 1)');
    const sign = p < 0.5 ? -1 : 1;
    const q = p < 0.5 ? p : 1 - p;
    const t = Math.sqrt(-2 * Math.log(q));
    const c0 = 2.515517,
        c1 = 0.802853,
        c2 = 0.010328;
    const d1 = 1.432788,
        d2 = 0.189269,
        d3 = 0.001308;
    const num = c0 + c1 * t + c2 * t * t;
    const den = 1 + d1 * t + d2 * t * t + d3 * t * t * t;
    return sign * (t - num / den);
}

/**
 * Bootstrap 95% confidence interval for a given return period quantile.
 * Intervalo de confiança 95% via bootstrap para um quantil de período de retorno.
 *
 * Uses 500 bootstrap resamples and Gumbel distribution fitting.
 * Usa 500 reamostras bootstrap e ajuste da distribuição de Gumbel.
 *
 * @param {number[]} annualMaxima - Annual peak flows
 * @param {number}   returnPeriod_yr - Return period (> 1)
 * @param {number}   [nResample=500] - Number of bootstrap resamples
 * @returns {{ lower: number, upper: number, median: number }}
 */
export function bootstrapCI(annualMaxima: number[], returnPeriod_yr: number, nResample: number = 500): { lower: number, upper: number, median: number } {
    _validateSeries(annualMaxima, 'annualMaxima', 5);
    _check(returnPeriod_yr, 'returnPeriod_yr', 1 + 1e-9);
    if (!Number.isInteger(nResample) || nResample < 10) {
        throw new RangeError('nResample must be an integer >= 10');
    }

    const n = annualMaxima.length;
    const estimates = [];

    // Simple LCG PRNG for reproducibility without Math.random dependency on seeding
    // LCG simples para reproducibilidade sem dependência de Math.random com semente
    let seed = 12345 + n + Math.floor(returnPeriod_yr);
    function lcgRand() {
        seed = (seed * 1664525 + 1013904223) & 0xffffffff;
        return (seed >>> 0) / 0xffffffff;
    }

    for (let r = 0; r < nResample; r++) {
        // Resample with replacement / Reamostrar com reposição
        const sample: number[] = [];
        for (let i = 0; i < n; i++) {
            sample.push(annualMaxima[Math.floor(lcgRand() * n)] as number);
        }
        try {
            const params = fitGumbel(sample);
            estimates.push(gumbelQuantile(params, returnPeriod_yr));
        } catch (e) {
            console.debug('[floodFreq] gumbelResample:', (e as Error)?.message || e);
            // Skip degenerate resamples / Ignorar amostras degeneradas
        }
    }

    estimates.sort((a, b) => a - b);
    const lo = Math.floor(0.025 * estimates.length);
    const hi = Math.floor(0.975 * estimates.length);
    const mid = Math.floor(0.5 * estimates.length);

    return {
        lower: (estimates[lo] ?? estimates[0]) as number,
        upper: (estimates[hi] ?? estimates[estimates.length - 1]) as number,
        median: (estimates[mid] ?? estimates[0]) as number,
    };
}

/**
 * Classify flood magnitude for a given return period.
 * Classifica a magnitude da cheia para um dado período de retorno.
 *
 * @param {number} returnPeriod_yr
 * @returns {{ magnitude: string, magnitudePT: string }}
 */
export function classifyFloodMagnitude(returnPeriod_yr: number): { magnitude: string, magnitudePT: string } {
    _check(returnPeriod_yr, 'returnPeriod_yr', 1 + 1e-9);
    let magnitude, magnitudePT;
    if (returnPeriod_yr < 5) {
        magnitude = 'minor';
        magnitudePT = 'menor';
    } else if (returnPeriod_yr < 25) {
        magnitude = 'moderate';
        magnitudePT = 'moderada';
    } else if (returnPeriod_yr < 100) {
        magnitude = 'major';
        magnitudePT = 'grande';
    } else {
        magnitude = 'extreme';
        magnitudePT = 'extrema';
    }
    return { magnitude, magnitudePT };
}

/**
 * Compute flood frequency table for standard return periods.
 * Calcula tabela de frequência de cheias para períodos de retorno padrão.
 *
 * Fits both Gumbel and LP3 and returns estimates for TR = 2, 5, 10, 25, 50, 100 years.
 * Ajusta Gumbel e LP3 e retorna estimativas para TR = 2, 5, 10, 25, 50, 100 anos.
 *
 * @param {number[]} annualMaxima
 * @returns {{ gumbel: object[], lp3: object[], skewness: number }}
 */
export function floodFrequencyTable(annualMaxima: number[]): { gumbel: object[], lp3: object[], skewness: number } {
    _validateSeries(annualMaxima, 'annualMaxima', 5);

    const logs = annualMaxima.map((v) => Math.log(v));
    const meanLog = _mean(logs);
    const stdLog = _std(logs, meanLog);
    const skewLog = _skewness(logs, meanLog, stdLog);

    const gParams = fitGumbel(annualMaxima);
    const lp3Params = { meanLog, stdLog, skewnessLog: skewLog };

    const gumbel = STANDARD_TR.map((tr) => ({
        returnPeriod_yr: tr,
        flow: gumbelQuantile(gParams, tr),
        exceedanceProbability: 1 / tr,
        magnitude: classifyFloodMagnitude(tr),
    }));

    const lp3 = STANDARD_TR.map((tr) => ({
        returnPeriod_yr: tr,
        flow: logPearsonIIIQuantile(lp3Params, tr),
        exceedanceProbability: 1 / tr,
        magnitude: classifyFloodMagnitude(tr),
    }));

    return { gumbel, lp3, skewness: skewLog };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const riverineFloodFrequencyMeta = {
    name: 'riverineFloodFrequency',
    description: 'riverineFloodFrequency',
    category: 'analytics',
    familyTags: ['river', 'flood'],
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
