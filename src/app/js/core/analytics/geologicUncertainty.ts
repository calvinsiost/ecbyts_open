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
   GEOLOGIC UNCERTAINTY — Pure-math uncertainty propagation
   ================================================================

   Propagacao de incerteza para modelos geologicos ambientais.
   Todas as funcoes sao deterministicas e importaveis em Node.js
   sem dependencias de DOM, IndexedDB ou Three.js.

   REFERENCIAS:
   - Journel & Huijbregts (1978) "Mining Geostatistics"
   - Webster & Oliver (2007) "Geostatistics for Environmental Scientists"
   - Deutsch & Journel (1998) "GSLIB"
   - USEPA (1997) "Statistical Methods for Evaluating Cleanup Standards Vol. 3"
   - GUM (JCGM 100:2008)
   - Journel (1983) Mathematical Geology
   - Shannon (1948)

   ================================================================ */

// ----------------------------------------------------------------
// LCG PRNG - Linear Congruential Generator (deterministic seed)
// Gerador de numeros pseudo-aleatorios com semente deterministica
// ----------------------------------------------------------------

/**
 * Create a seedable LCG PRNG closure.
 * Retorna funcao que gera uint32 na sequencia LCG.
 *
 * @param {number} seed - Initial seed (unsigned 32-bit integer)
 * @returns {() => number} PRNG function returning [0, 1)
 */
function makeLCG(seed: number): () => number {
    let s = seed >>> 0;
    return function () {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/**
 * Box-Muller transform: uniform pair -> standard normal pair.
 * Transformacao Box-Muller para gerar normais padrao.
 *
 * @param {number} u1 - Uniform [0,1]
 * @param {number} u2 - Uniform [0,1]
 * @returns {[number, number]} Two independent N(0,1) samples
 */
function boxMuller(u1: number, u2: number): [number, number] {
    const r = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-15)));
    const theta = 2 * Math.PI * u2;
    return [r * Math.cos(theta), r * Math.sin(theta)];
}

// ----------------------------------------------------------------
// SPHERICAL VARIOGRAM - Journel & Huijbregts (1978)
// Variograma esferico - modelo de semivariancia
// ----------------------------------------------------------------

/**
 * Spherical semivariogram value at lag h.
 * Valor do semivariograma esferico na distancia h.
 *
 * @param {number} nugget - Nugget effect C0 (variance at h->0+)
 * @param {number} sill - Total sill C0+C (variance at h>=range)
 * @param {number} range - Range a (meters or same unit as h)
 * @param {number} h - Lag distance
 * @returns {number} Semivariogram value gamma(h)
 */
function sphericalGamma(nugget: number, sill: number, range: number, h: number): number {
    if (h <= 0) return 0;
    if (range <= 0) return sill;
    if (h >= range) return sill;
    const hr = h / range;
    return nugget + (sill - nugget) * (1.5 * hr - 0.5 * hr * hr * hr);
}

// ----------------------------------------------------------------
// 1. KRIGING VARIANCE
// Variancia de krigagem pontual - modelo esferico
// ----------------------------------------------------------------

/**
 * Point Kriging variance for spherical variogram model.
 * Variancia de krigagem pontual usando modelo de variograma esferico.
 *
 * Simplified ordinary kriging variance for single-point estimate:
 *   sigma_k^2 = C0 + sill - 2*gamma(h_estimate)
 *
 * @param {number} C0 - Nugget effect
 * @param {number} sill - Total sill (C0 + partial sill C)
 * @param {number} nugget - Same as C0 (alias for clarity in caller)
 * @param {number} range - Variogram range (distance units)
 * @param {number} h - Distance to nearest data point
 * @returns {{gamma_h: number, variance: number, std_dev: number}}
 * @see Journel & Huijbregts (1978) eq. V.26
 */
export function krigingVariance(C0: number, sill: number, nugget: number, range: number, h: number): {gamma_h: number, variance: number, std_dev: number} {
    // nugget parameter is an alias/override of C0 for API clarity
    const eff_nugget = nugget !== undefined && nugget !== null ? nugget : C0;
    const gamma_h = sphericalGamma(eff_nugget, sill, range, h);
    // Kriging variance: sigma_k^2 = C0 + sill - 2*gamma(h)
    const variance = Math.max(0, eff_nugget + sill - 2 * gamma_h);
    return {
        gamma_h,
        variance,
        std_dev: Math.sqrt(variance),
    };
}

// ----------------------------------------------------------------
// 2. SEMIVARIOGRAM BOOTSTRAP
// Bootstrap para intervalo de confianca do variograma
// ----------------------------------------------------------------

/**
 * Bootstrap confidence interval for spherical semivariogram parameters.
 * IC bootstrap para parametros do variograma esferico por reamostragem.
 *
 * @param {number[]} lags - Lag distances array
 * @param {number[]} gamma_experimental - Experimental semivariogram values
 * @param {number} [n_bootstrap=200] - Number of bootstrap resamples
 * @param {number} [seed=42] - PRNG seed for reproducibility
 * @returns {{sill_mean: number, sill_ci95_low: number, sill_ci95_high: number, range_mean: number, range_ci95_low: number, range_ci95_high: number}}
 * @see Webster & Oliver (2007) ch. 4
 */
export function semivariogramBootstrap(lags: number[], gamma_experimental: number[], n_bootstrap: number = 200, seed: number = 42): {sill_mean: number, sill_ci95_low: number, sill_ci95_high: number, range_mean: number, range_ci95_low: number, range_ci95_high: number} {
    const n = gamma_experimental.length;
    if (n < 2) {
        return ({
            sill_mean: 0,
            sill_ci95_low: 0,
            sill_ci95_high: 0,
            range_mean: 0,
            range_ci95_low: 0,
            range_ci95_high: 0,
        } as {sill_mean:number, sill_ci95_low:number, sill_ci95_high:number, range_mean:number, range_ci95_low:number, range_ci95_high:number});
    }
    const rand = makeLCG(seed);
        const sills: number[]= [];
        const ranges: number[]= [];

    for (let b = 0; b < n_bootstrap; b++) {
        // Resample with replacement
                const sample: number[]= [];
        for (let i = 0; i < n; i++) {
            const idx = Math.floor(rand() * n);
            sample.push(gamma_experimental[idx]!);
        }
        // Approximate sill: mean of upper half (plateau estimate)
        const sorted = sample.slice().sort((a, b2) => a - b2);
        const halfIdx = Math.floor(n / 2);
        const upperHalf = sorted.slice(halfIdx);
        const sill_est = upperHalf.reduce((s, v) => s + v, 0) / upperHalf.length;

        // Approximate range: lag where gamma first reaches 95% of sill
        const threshold = 0.95 * sill_est;
        let range_est = lags[lags.length - 1] || 1;
        for (let i = 0; i < n; i++) {
            if (sample[i]! >= threshold) {
                range_est = lags[i] || range_est;
                break;
            }
        }
        sills.push(sill_est);
        ranges.push(range_est);
    }

    sills.sort((a, b2) => a - b2);
    ranges.sort((a, b2) => a - b2);

    const lo = Math.floor(0.025 * n_bootstrap);
    const hi = Math.ceil(0.975 * n_bootstrap) - 1;

        const mean_arr = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;

    return {
        sill_mean: mean_arr(sills),
        sill_ci95_low: sills[lo]!,
        sill_ci95_high: sills[Math.min(hi, sills.length - 1)]!,
        range_mean: mean_arr(ranges),
        range_ci95_low: ranges[lo]!,
        range_ci95_high: ranges[Math.min(hi, ranges.length - 1)]!,
    };
}

// ----------------------------------------------------------------
// 3. MONTE CARLO GEOLOGIC FIELD
// Campo geologico Monte Carlo via decomposicao de Cholesky
// ----------------------------------------------------------------

/**
 * Cholesky decomposition for small (2x2 or 3x3) positive-definite matrix.
 * Decomposicao de Cholesky para matrizes pequenas (2x2 ou 3x3).
 *
 * @param {number[]} flat - Row-major flattened covariance matrix
 * @param {number} n - Matrix dimension (2 or 3)
 * @returns {number[]} Lower triangular L (row-major), L*L^T = COV
 */
function choleskyFlat(flat: number[], n: number): number[] {
    const L = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j <= i; j++) {
            let sum = 0;
            for (let k = 0; k < j; k++) {
                sum += L[i * n + k]! * L[j * n + k]!;
            }
            if (i === j) {
                const val = flat[i * n + i]! - sum;
                L[i * n + j] = Math.sqrt(Math.max(val, 0));
            } else {
                const diag = L[j * n + j]!;
                L[i * n + j] = diag > 1e-12 ? (flat[i * n + j]! - sum) / diag : 0;
            }
        }
    }
    return L;
}

/**
 * Monte Carlo geologic field realizations via Cholesky decomposition.
 * Realizacoes Monte Carlo de campo geologico via decomposicao de Cholesky.
 * Supports 2x2 or 3x3 covariance matrices.
 *
 * @param {number[]} mean_values - Mean vector (length n, n=2 or 3)
 * @param {number[]} cov_matrix_flat - Row-major covariance matrix (n*n values)
 * @param {number} [n_realizations=100] - Number of Monte Carlo samples
 * @param {number} [seed=42] - PRNG seed
 * @returns {{realizations: number[][], statistics: {mean: number[], std: number[]}}}
 * @see Deutsch & Journel (1998) GSLIB ch. 2
 */
export function monteCarloGeologicField(mean_values: number[], cov_matrix_flat: number[], n_realizations: number = 100, seed: number = 42): {realizations: number[][], statistics: {mean: number[], std: number[]}} {
    const n = mean_values.length;
    const rand = makeLCG(seed);
    const L = choleskyFlat(cov_matrix_flat, n);

        const realizations: number[][]= [];
    for (let r = 0; r < n_realizations; r++) {
        // Generate standard normals via Box-Muller
                const z: number[]= [];
        for (let i = 0; i < n; i += 2) {
            const [z1, z2] = boxMuller(rand(), rand());
            z.push(z1);
            if (i + 1 < n) z.push(z2);
        }
        // x_real = mean + L * z
        const x = mean_values.map((m, i) => {
            let s = 0;
            for (let j = 0; j <= i; j++) {
                s += L[i * n + j]! * z[j]!;
            }
            return m + s;
        });
        realizations.push(x);
    }

    // Compute statistics across realizations per dimension
    const mean = mean_values.map((_, i) => {
        const vals = realizations.map((r) => r[i]!);
        return vals.reduce((s, v) => s + v, 0) / n_realizations;
    });
    const std = mean_values.map((_, i) => {
        const vals = realizations.map((r) => r[i]!);
        const m = mean[i]!;
        const variance = vals.reduce((s, v) => s + (v - m) ** 2, 0) / n_realizations;
        return Math.sqrt(variance);
    });

    return { realizations, statistics: { mean, std } };
}

// ----------------------------------------------------------------
// 4. GEOLOGIC LAYER UNCERTAINTY
// Incerteza de espessura de camadas geologicas
// ----------------------------------------------------------------

/**
 * Monte Carlo thickness realizations for N geologic layers.
 * Realizacoes Monte Carlo de espessura de N camadas geologicas.
 * Each layer thickness is truncated Normal (> 0).
 *
 * @param {number[]} top_depths - Top depth of each layer (m)
 * @param {number[]} thickness_means - Mean thickness per layer (m)
 * @param {number[]} thickness_stds - Std dev of thickness per layer (m)
 * @param {number} [n_samples=500] - Number of Monte Carlo samples
 * @param {number} [seed=42] - PRNG seed
 * @returns {{realizations: number[][], summary: {mean_total_depth: number, std_total_depth: number, p10: number, p50: number, p90: number}}}
 */
export function geologicLayerUncertainty(top_depths: number[], thickness_means: number[], thickness_stds: number[], n_samples: number = 500, seed: number = 42): {realizations: number[][], summary: {mean_total_depth: number, std_total_depth: number, p10: number, p50: number, p90: number}} {
    const nLayers = thickness_means.length;
    const rand = makeLCG(seed);
        const realizations: number[][]= [];

    for (let s = 0; s < n_samples; s++) {
                const sample: number[]= [];
        for (let l = 0; l < nLayers; l++) {
            // Truncated normal: reject negative values (max 50 retries, fallback to mean)
            let t = -1;
            let tries = 0;
            while (t <= 0 && tries < 50) {
                const [z] = boxMuller(rand(), rand());
                t = thickness_means[l]! + thickness_stds[l]! * z;
                tries++;
            }
            sample.push(Math.max(t, 1e-6));
        }
        realizations.push(sample);
    }

    // Total depth = sum of all layer thicknesses
    const totals = realizations.map((r) => r.reduce((s, v) => s + v, 0));
    totals.sort((a, b) => a - b);

    const mean_total_depth = totals.reduce((s, v) => s + v, 0) / n_samples;
    const variance = totals.reduce((s, v) => s + (v - mean_total_depth) ** 2, 0) / n_samples;

    return ({
        realizations,
        summary: {
            mean_total_depth,
            std_total_depth: Math.sqrt(variance),
            p10: totals[Math.floor(0.1 * n_samples)],
            p50: totals[Math.floor(0.5 * n_samples)],
            p90: totals[Math.floor(0.9 * n_samples)],
        },
    } as {realizations:number[][], summary:{mean_total_depth:number, std_total_depth:number, p10:number, p50:number, p90:number}});
}

// ----------------------------------------------------------------
// 5. CONDITIONAL PROBABILITY EXCEEDANCE
// Probabilidade de excedencia do limiar de concentracao
// ----------------------------------------------------------------

/**
 * erfc via Horner polynomial A&S 7.1.26 approximation.
 * Funcao erfc via aproximacao polinomial de Horner (A&S 7.1.26).
 *
 * @param {number} x
 * @returns {number} erfc(x)
 */
function erfc(x: number): number {
    if (x < 0) return 2 - erfc(-x);
    const t = 1 / (1 + 0.3275911 * x);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    return poly * Math.exp(-x * x);
}

/**
 * Probability that concentration exceeds threshold.
 * Probabilidade de que a concentracao exceda o limiar.
 *
 * @param {number[]} concentrations - Array of concentration measurements
 * @param {number} threshold - Exceedance threshold
 * @param {'empirical'|'lognormal'} [method='empirical'] - Estimation method
 * @returns {{P_exceed: number, method: string, threshold: number, n_samples: number}}
 * @see USEPA (1997) Vol. 3 Section 5
 */
export function conditionalProbabilityExceedance(concentrations: number[], threshold: number, method: 'empirical'|'lognormal' = 'empirical'): {P_exceed: number, method: string, threshold: number, n_samples: number} {
    const n = concentrations.length;
    if (n === 0) return { P_exceed: 0, method, threshold, n_samples: 0 };

    if (method === 'empirical') {
        const above = concentrations.filter((c) => c > threshold).length;
        return { P_exceed: above / n, method, threshold, n_samples: n };
    }

    // Log-normal: filter positives, fit mu_ln and sigma_ln
    const pos = concentrations.filter((c) => c > 0);
    if (pos.length === 0) return { P_exceed: 0, method, threshold, n_samples: n };

    const ln_vals = pos.map((c) => Math.log(c));
    const mu_ln = ln_vals.reduce((s, v) => s + v, 0) / pos.length;
    const sigma_ln = Math.sqrt(ln_vals.reduce((s, v) => s + (v - mu_ln) ** 2, 0) / Math.max(pos.length - 1, 1));

    if (sigma_ln < 1e-12) {
        // Degenerate: all same value
        const P_exceed = Math.exp(mu_ln) > threshold ? 1 : 0;
        return { P_exceed, method, threshold, n_samples: n };
    }

    if (threshold <= 0) return { P_exceed: 1, method, threshold, n_samples: n };

    const z = (Math.log(threshold) - mu_ln) / (sigma_ln * Math.sqrt(2));
    const P_exceed = 0.5 * erfc(z);
    return { P_exceed: Math.max(0, Math.min(1, P_exceed)), method, threshold, n_samples: n };
}

// ----------------------------------------------------------------
// 6. SPATIAL UNCERTAINTY BUDGET
// Orcamento de incerteza espacial - variancia de dispersao
// ----------------------------------------------------------------

/**
 * Dispersion variance (variance of block mean estimate).
 * Variancia de dispersao para media de bloco em campo geoestatistico.
 *
 * @param {number} variogram_nugget - Nugget effect
 * @param {number} variogram_sill - Total sill
 * @param {number} n_data_points - Number of borehole/sample locations
 * @param {number} area_m2 - Study area (m²)
 * @param {number} [range_m=100] - Variogram range (m)
 * @returns {{dispersion_variance: number, reduction_factor: number, density: number}}
 * @see Journel & Huijbregts (1978) ch. III
 */
export function spatialUncertaintyBudget(variogram_nugget: number, variogram_sill: number, n_data_points: number, area_m2: number, range_m: number = 100): {dispersion_variance: number, reduction_factor: number, density: number} {
    // Density-based reduction factor
    const density = n_data_points / Math.max(area_m2, 1);
    const f_n = 1 - Math.exp(-n_data_points / (Math.max(area_m2, 1) * range_m));
    const dispersion_variance = variogram_sill - (variogram_sill - variogram_nugget) * f_n;
    return {
        dispersion_variance: Math.max(0, dispersion_variance),
        reduction_factor: 1 - f_n,
        density,
    };
}

// ----------------------------------------------------------------
// 7. UNCERTAINTY PROPAGATION - GUM
// Propagacao de incerteza linear conforme GUM (JCGM 100:2008)
// ----------------------------------------------------------------

/**
 * Linear GUM uncertainty propagation for sum and product of two quantities.
 * Propagacao de incerteza linear GUM para soma e produto de duas grandezas.
 *
 * @param {number} A - Value of quantity A
 * @param {number} B - Value of quantity B
 * @param {number} sigmaA - Standard uncertainty of A
 * @param {number} sigmaB - Standard uncertainty of B
 * @param {number} [rho_AB=0] - Correlation coefficient between A and B [-1,1]
 * @returns {{sigma_sum: number, sigma_product: number, relative_unc_product: number}}
 * @see GUM JCGM 100:2008 eq. 13
 */
export function uncertaintyPropagationLinear(A: number, B: number, sigmaA: number, sigmaB: number, rho_AB: number = 0): {sigma_sum: number, sigma_product: number, relative_unc_product: number} {
    // Sum: sigma_Z = sqrt(sigmaA^2 + sigmaB^2 + 2*rho*sigmaA*sigmaB)
    const sigma_sum = Math.sqrt(sigmaA ** 2 + sigmaB ** 2 + 2 * rho_AB * sigmaA * sigmaB);

    const Z_prod = A * B;
    let sigma_product = 0;
    let relative_unc_product = 0;
    if (Math.abs(A) > 1e-12 && Math.abs(B) > 1e-12) {
        const rA = sigmaA / Math.abs(A);
        const rB = sigmaB / Math.abs(B);
        relative_unc_product = Math.sqrt(rA ** 2 + rB ** 2 + 2 * rho_AB * rA * rB);
        sigma_product = Math.abs(Z_prod) * relative_unc_product;
    }

    return { sigma_sum, sigma_product, relative_unc_product };
}

// ----------------------------------------------------------------
// 8. SEQUENTIAL INDICATOR PROBABILITY
// Probabilidade indicador sequencial - Journel (1983)
// ----------------------------------------------------------------

/**
 * Sequential indicator simulation probability above threshold.
 * Probabilidade de indicador sequencial acima do limiar.
 *
 * @param {number[]} indicator_data - Array of measured values
 * @param {number} threshold - Classification threshold
 * @param {number} [lag_class=1] - Lag class index (1-based, not used in current simplified impl)
 * @returns {{P_above_threshold: number, indicator_variogram: number}}
 * @see Journel (1983) Mathematical Geology 15(3)
 */
export function sequentialIndicatorProbability(indicator_data: number[], threshold: number, lag_class: number = 1): {P_above_threshold: number, indicator_variogram: number} {
    const n = indicator_data.length;
    if (n === 0) return { P_above_threshold: 0, indicator_variogram: 0 };

    // I(x) = 1 if value > threshold, else 0
        const indicators: number[]= indicator_data.map((v) => (v > threshold ? 1 : 0));
    const P_above_threshold = indicators.reduce((s, v) => s + v, 0) / n;

    // Indicator variogram at lag_class h pairs (consecutive pairs simplified)
    const h = Math.min(lag_class, n - 1);
    let gamma_I = 0;
    let count = 0;
    for (let i = 0; i < n - h; i++) {
        gamma_I += (indicators[i + h]! - indicators[i]!) ** 2;
        count++;
    }
    const indicator_variogram = count > 0 ? gamma_I / (2 * count) : 0;

    return { P_above_threshold, indicator_variogram };
}

// ----------------------------------------------------------------
// 9. GEOLOGIC CONTACT UNCERTAINTY
// Incerteza na espessura entre dois contatos geologicos
// ----------------------------------------------------------------

/**
 * Uncertainty in thickness between two geologic contacts.
 * Incerteza na espessura entre dois contatos geologicos medidos.
 *
 * @param {number} depth1_m - Depth of upper contact (m)
 * @param {number} depth2_m - Depth of lower contact (m), must be > depth1_m
 * @param {number} sigma1_m - Standard uncertainty of upper contact depth (m)
 * @param {number} sigma2_m - Standard uncertainty of lower contact depth (m)
 * @param {number} [rho=0] - Correlation between the two depth measurements
 * @returns {{thickness_mean: number, sigma_thickness: number, CV: number}}
 * @see Bardossy et al. (1993)
 */
export function geologicContactUncertainty(depth1_m: number, depth2_m: number, sigma1_m: number, sigma2_m: number, rho: number = 0): {thickness_mean: number, sigma_thickness: number, CV: number} {
    const thickness_mean = depth2_m - depth1_m;
    // sigma_thickness = sqrt(sigma1^2 + sigma2^2 - 2*rho*sigma1*sigma2)
    const sigma_thickness = Math.sqrt(sigma1_m ** 2 + sigma2_m ** 2 - 2 * rho * sigma1_m * sigma2_m);
    const CV = Math.abs(thickness_mean) > 1e-12 ? sigma_thickness / Math.abs(thickness_mean) : Infinity;
    return { thickness_mean, sigma_thickness, CV };
}

// ----------------------------------------------------------------
// 10. INFORMATION GAIN FROM DRILLING
// Ganho de informacao de sondagens adicionais - Shannon (1948)
// ----------------------------------------------------------------

/**
 * Information gain from drilling additional boreholes (Shannon entropy reduction).
 * Ganho de informacao de sondagens adicionais pela reducao de entropia de Shannon.
 *
 * @param {number} sigma_prior - Prior standard deviation (before drilling)
 * @param {number} sigma_posterior - Posterior standard deviation (after drilling)
 * @returns {{information_gain_bits: number, reduction_percent: number}}
 * @see Shannon (1948) Bell System Technical Journal
 */
export function informationGainDrilling(sigma_prior: number, sigma_posterior: number): {information_gain_bits: number, reduction_percent: number} {
    if (sigma_posterior <= 0 || sigma_prior <= 0) {
        return { information_gain_bits: 0, reduction_percent: 0 };
    }
    // IG = 0.5 * log2(sigma_prior^2 / sigma_posterior^2)
    const information_gain_bits = 0.5 * Math.log2(sigma_prior ** 2 / sigma_posterior ** 2);
    const reduction_percent = (1 - sigma_posterior / sigma_prior) * 100;
    return { information_gain_bits, reduction_percent };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const geologicUncertaintyMeta = {
    name: 'geologicUncertainty',
    description: 'geologicUncertainty',
    category: 'analytics',
    familyTags: ['environmental'],
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
