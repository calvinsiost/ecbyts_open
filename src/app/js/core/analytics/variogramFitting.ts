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
 * Variogram Fitting - Experimental variogram + theoretical model fitting
 *
 * Computes experimental variograms (Matheron estimator and Cressie-Hawkins
 * robust estimator) and fits four theoretical models (spherical, exponential,
 * Gaussian, power) via Weighted Least Squares. Provides model selection via AIC.
 *
 * Referências acadêmicas:
 *   - Matheron, G. (1962). Traité de géostatistique appliquée. Editions Technip, Paris.
 *   - Journel, A.G. & Huijbregts, C.J. (1978). Mining Geostatistics. Academic Press.
 *   - Cressie, N. & Hawkins, D.M. (1984). "Robust estimation of the variogram",
 *     Mathematical Geology, 16(2), pp. 107–128. DOI: 10.1007/BF01036237
 *   - Cressie, N. (1993). Statistics for Spatial Data (revised ed.). Wiley-Interscience.
 *   - Kitanidis, P.K. (1997). Introduction to Geostatistics: Applications in Hydrogeology.
 *     Cambridge University Press.
 */

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

/**
 * Euclidean distance between two 2D points.
 * @param {{x:number,y:number}} a
 * @param {{x:number,y:number}} b
 * @returns {number}
 */
function dist2d(a: {x:number,y:number}, b: {x:number,y:number}): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Build all unique pairs {i, j, dist, sqDiff, absDiff} for a point set.
 * @param {Array<{x:number,y:number,value:number}>} points
 * @returns {Array<{i:number,j:number,dist:number,sqDiff:number,absDiff:number}>}
 */
function buildPairs(points: Array<{x:number,y:number,value:number}>): Array<{i:number,j:number,dist:number,sqDiff:number,absDiff:number}> {
    const n = points.length;
    const pairs = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const d = dist2d(points[i]!, points[j]!);
            const diff = points[i]!.value - points[j]!.value;
            pairs.push({ i, j, dist: d, sqDiff: diff * diff, absDiff: Math.abs(diff) });
        }
    }
    return pairs;
}

/**
 * Assign pairs to lag bins and aggregate into experimental variogram arrays.
 * Shared by both Matheron and Cressie-Hawkins estimators.
 *
 * @param {Array<{dist:number,sqDiff:number,absDiff:number}>} pairs
 * @param {number} nLags
 * @param {number} maxDist
 * @param {number} lagTolerance
 * @param {'matheron'|'cressie-hawkins'} method
 * @returns {{lags:number[],gamma:number[],npairs:number[],lagTolerance:number,method:string}}
 */
function aggregatePairsToLags(pairs: Array<{dist:number,sqDiff:number,absDiff:number}>, nLags: number, maxDist: number, lagTolerance: number, method: 'matheron'|'cressie-hawkins'): {lags:number[],gamma:number[],npairs:number[],lagTolerance:number,method:string} {
    const lagStep = maxDist / nLags;
    const lags = [];
    const gamma = [];
    const npairs = [];

    for (let k = 0; k < nLags; k++) {
        const lagCenter = (k + 0.5) * lagStep;
        const lo = lagCenter - lagTolerance;
        const hi = lagCenter + lagTolerance;

        const binPairs = pairs.filter((p) => p.dist >= lo && p.dist < hi);
        const m = binPairs.length;
        if (m < 2) continue; // insufficient pairs

        let gVal;
        if (method === 'matheron') {
            // γ(h) = 1/(2m) × Σ (z_i - z_j)²
            let sumSq = 0;
            for (let p = 0; p < m; p++) sumSq += binPairs[p]!.sqDiff;
            gVal = sumSq / (2 * m);
        } else {
            // Cressie-Hawkins (1984) robust estimator:
            // γ_robust(h) = [1/m × Σ |z_i-z_j|^0.5]^4 / (0.457 + 0.494/m)
            let sumHalf = 0;
            for (let p = 0; p < m; p++) sumHalf += Math.sqrt(binPairs[p]!.absDiff);
            const meanHalf = sumHalf / m;
            gVal = Math.pow(meanHalf, 4) / (0.457 + 0.494 / m);
        }

        lags.push(lagCenter);
        gamma.push(gVal);
        npairs.push(m);
    }

    return Object.freeze({ lags, gamma, npairs, lagTolerance, method });
}

// ---------------------------------------------------------------------------
// 1. Experimental variogram - Matheron (1962)
// ---------------------------------------------------------------------------

/**
 * Computes the experimental variogram using the Matheron (1962) estimator:
 *   γ(h) = 1/(2|N(h)|) × Σ_{(i,j)∈N(h)} [z(xi) - z(xj)]²
 *
 * Pontos com menos de 2 pares em um lag são descartados.
 *
 * @param {Array<{x:number,y:number,value:number}>} points - Pontos de amostragem com coordenadas planas
 * @param {Object} [opts]
 * @param {number} [opts.nLags=10]       - Número de classes de distância
 * @param {number|null} [opts.lagTolerance=null] - Tolerância por lag (default = lagStep/2)
 * @param {number|null} [opts.maxDist=null]      - Distância máxima (default = metade da dist. máxima)
 * @returns {{lags:number[],gamma:number[],npairs:number[],lagTolerance:number,method:string}}
 *   Resultado imutável (Object.freeze). Arrays paralelos: lags[i] ↔ gamma[i] ↔ npairs[i].
 */
export function computeExperimentalVariogram(points: Array<{x:number,y:number,value:number}>, { nLags = 10, lagTolerance = null, maxDist = null }: { nLags?: number, lagTolerance?: number | null, maxDist?: number | null } = {}) {
    if (!Array.isArray(points) || points.length < 3) {
        throw new RangeError('computeExperimentalVariogram: requires at least 3 points');
    }

    const pairs = buildPairs(points);

    // Default maxDist: half the maximum pairwise distance
    let effectiveMaxDist: number | null = maxDist;
    if (effectiveMaxDist == null) {
        let dMax = 0;
        for (let k = 0; k < pairs.length; k++) {
            if (pairs[k]!.dist > dMax) dMax = pairs[k]!.dist;
        }
        effectiveMaxDist = dMax / 2;
    }

    // Default lagTolerance: half a lag step
    const lagStep = effectiveMaxDist / nLags;
    const effectiveTolerance = lagTolerance != null ? lagTolerance : lagStep / 2;

    return aggregatePairsToLags(pairs, nLags, effectiveMaxDist, effectiveTolerance, 'matheron');
}

// ---------------------------------------------------------------------------
// 2. Robust variogram - Cressie & Hawkins (1984)
// ---------------------------------------------------------------------------

/**
 * Computes the robust experimental variogram using the Cressie-Hawkins (1984)
 * estimator, resistant to outliers:
 *   γ_robust(h) = [1/m × Σ|z_i-z_j|^0.5]^4 / (0.457 + 0.494/m)
 *
 * @param {Array<{x:number,y:number,value:number}>} points
 * @param {Object} [opts]
 * @param {number} [opts.nLags=10]
 * @param {number|null} [opts.lagTolerance=null]
 * @param {number|null} [opts.maxDist=null]
 * @returns {{lags:number[],gamma:number[],npairs:number[],lagTolerance:number,method:string}}
 */
export function computeRobustVariogram(points: Array<{x:number,y:number,value:number}>, { nLags = 10, lagTolerance = null, maxDist = null }: { nLags?: number, lagTolerance?: number | null, maxDist?: number | null } = {}) {
    if (!Array.isArray(points) || points.length < 3) {
        throw new RangeError('computeRobustVariogram: requires at least 3 points');
    }

    const pairs = buildPairs(points);

    let effectiveMaxDist: number | null = maxDist;
    if (effectiveMaxDist == null) {
        let dMax = 0;
        for (let k = 0; k < pairs.length; k++) {
            if (pairs[k]!.dist > dMax) dMax = pairs[k]!.dist;
        }
        effectiveMaxDist = dMax / 2;
    }

    const lagStep = effectiveMaxDist / nLags;
    const effectiveTolerance = lagTolerance != null ? lagTolerance : lagStep / 2;

    return aggregatePairsToLags(pairs, nLags, effectiveMaxDist, effectiveTolerance, 'cressie-hawkins');
}

// ---------------------------------------------------------------------------
// 3. Theoretical variogram models (pure functions)
// ---------------------------------------------------------------------------

/**
 * Spherical variogram model (Matheron, 1962; Journel & Huijbregts, 1978):
 *   γ(h) = nugget + (sill-nugget) × [1.5(h/a) - 0.5(h/a)³]  for h ≤ range
 *   γ(h) = sill                                               for h > range
 *
 * @param {number|number[]} h       - Lag distance(s)
 * @param {{nugget:number,sill:number,range:number}} params
 * @returns {number|number[]}
 */
export function sphericalVariogram(h: number | number[], { nugget, sill, range }: { nugget: number, sill: number, range: number }): number | number[] {
    /**
     * Avalia o modelo esférico para um único valor h.
     * @param {number} hVal
     * @returns {number}
     */
    function evalSingle(hVal: number): number {
        if (hVal <= 0) return nugget;
        if (hVal >= range) return sill;
        const ratio = hVal / range;
        return nugget + (sill - nugget) * (1.5 * ratio - 0.5 * ratio * ratio * ratio);
    }

    if (Array.isArray(h)) return h.map(evalSingle);
    return evalSingle(h);
}

/**
 * Exponential variogram model (Cressie, 1993):
 *   γ(h) = nugget + (sill-nugget) × [1 - exp(-3h/range)]
 *   range = practical range at 95% of sill (3 × effective range)
 *
 * @param {number|number[]} h
 * @param {{nugget:number,sill:number,range:number}} params
 * @returns {number|number[]}
 */
export function exponentialVariogram(h: number | number[], { nugget, sill, range }: { nugget: number, sill: number, range: number }): number | number[] {
    /**
     * @param {number} hVal
     * @returns {number}
     */
    function evalSingle(hVal: number): number {
        if (hVal <= 0) return nugget;
        return nugget + (sill - nugget) * (1 - Math.exp((-3 * hVal) / range));
    }

    if (Array.isArray(h)) return h.map(evalSingle);
    return evalSingle(h);
}

/**
 * Gaussian variogram model (Kitanidis, 1997):
 *   γ(h) = nugget + (sill-nugget) × [1 - exp(-3h²/range²)]
 *
 * @param {number|number[]} h
 * @param {{nugget:number,sill:number,range:number}} params
 * @returns {number|number[]}
 */
export function gaussianVariogram(h: number | number[], { nugget, sill, range }: { nugget: number, sill: number, range: number }): number | number[] {
    /**
     * @param {number} hVal
     * @returns {number}
     */
    function evalSingle(hVal: number): number {
        if (hVal <= 0) return nugget;
        return nugget + (sill - nugget) * (1 - Math.exp((-3 * hVal * hVal) / (range * range)));
    }

    if (Array.isArray(h)) return h.map(evalSingle);
    return evalSingle(h);
}

/**
 * Power variogram model (unbounded, Journel & Huijbregts, 1978):
 *   γ(h) = nugget + slope × h^exponent   (0 < exponent < 2)
 *
 * @param {number|number[]} h
 * @param {{nugget:number,slope:number,exponent:number}} params
 * @returns {number|number[]}
 */
export function powerVariogram(h: number | number[], { nugget, slope, exponent }: { nugget: number, slope: number, exponent: number }): number | number[] {
    /**
     * @param {number} hVal
     * @returns {number}
     */
    function evalSingle(hVal: number): number {
        if (hVal <= 0) return nugget;
        return nugget + slope * Math.pow(hVal, exponent);
    }

    if (Array.isArray(h)) return h.map(evalSingle);
    return evalSingle(h);
}

// ---------------------------------------------------------------------------
// Model evaluator dispatcher (internal)
// ---------------------------------------------------------------------------

/**
 * Evaluate any model type at lag h.
 * @param {number} h
 * @param {string} modelType
 * @param {Record<string, number>} params
 * @returns {number}
 */
function evalModel(h: number, modelType: string, params: Record<string, number>): number {
    switch (modelType) {
        case 'spherical':
            return (sphericalVariogram(h, (params as {nugget:number,sill:number,range:number})) as number);
        case 'exponential':
            return (exponentialVariogram(h, (params as {nugget:number,sill:number,range:number})) as number);
        case 'gaussian':
            return (gaussianVariogram(h, (params as {nugget:number,sill:number,range:number})) as number);
        case 'power':
            return (powerVariogram(h, (params as {nugget:number,slope:number,exponent:number})) as number);
        default:
            throw new Error(`Unknown model type: ${modelType}`);
    }
}

/**
 * Compute SSE for a given model and parameters.
 * @param {number[]} lags
 * @param {number[]} gamma
 * @param {number[]} weights
 * @param {string} modelType
 * @param {Record<string, number>} params
 * @returns {number}
 */
function computeSSE(lags: number[], gamma: number[], weights: number[], modelType: string, params: Record<string, number>): number {
    let sse = 0;
    for (let i = 0; i < lags.length; i++) {
        const predicted = evalModel(lags[i]!, modelType, params);
        const residual = gamma[i]! - predicted;
        sse += weights[i]! * residual * residual;
    }
    return sse;
}

// ---------------------------------------------------------------------------
// 4. WLS model fitting
// ---------------------------------------------------------------------------

/**
 * Fits a theoretical variogram model via Weighted Least Squares (WLS).
 *
 * Minimiza: SSE = Σ w_i × (γ_obs(h_i) - γ_model(h_i))²
 *
 * Pesos default (Cressie, 1985): w_i = n_i / h_i²
 * - atribui mais peso a lags curtos com mais pares de pontos.
 *
 * Otimização: grid search 3D (nugget × sill × range) com 3 rodadas de refinamento.
 *
 * @param {number[]} experimentalLags   - Array de distâncias de lag
 * @param {number[]} experimentalGamma  - Array de valores γ observados
 * @param {string}   modelType          - 'spherical'|'exponential'|'gaussian'|'power'
 * @param {Object}   [opts]
 * @param {number[]|null} [opts.weights=null]  - Pesos WLS (default: n_i / h_i²)
 * @param {number[]|null} [opts.npairs=null]   - Número de pares por lag (para pesos default)
 * @returns {Readonly<Record<string, any>>}
 */
export function fitVariogramModel(
    experimentalLags: number[],
    experimentalGamma: number[],
    modelType: string,
    { weights = null, npairs = null }: { weights?: number[] | null, npairs?: number[] | null } = {},
) {
    if (!experimentalLags || experimentalLags.length === 0) {
        throw new RangeError('fitVariogramModel: requires at least 1 lag');
    }

    const n = experimentalLags.length;

    // Default Cressie (1985) weights: w_i = n_i / h_i²
    let w;
    if (weights != null) {
        w = weights;
    } else if (npairs != null) {
        w = experimentalLags.map((h: number, i: number) => (h > 0 ? npairs![i]! / (h * h) : npairs![i]!));
    } else {
        // fallback: uniform weights
        w = experimentalLags.map((h: number) => (h > 0 ? 1 / (h * h) : 1));
    }

    // Empirical seeds
    const sillEmp = Math.max(...experimentalGamma);
    const nuggetMaxFraction = 0.3 * sillEmp;
    const rangeMin = experimentalLags[0]!;
    const rangeMax = experimentalLags[experimentalLags.length - 1]!;

    let bestParams: { nugget?: number, sill?: number, range?: number, slope?: number, exponent?: number } = {};
    let bestSSE = Infinity;

    if (modelType === 'power') {
        // Power model: search over {nugget, slope, exponent}
        const nuggetGrid = [0, nuggetMaxFraction * 0.5, nuggetMaxFraction];
        const slopeGrid = [sillEmp / (rangeMax * rangeMax), sillEmp / rangeMax, sillEmp / Math.sqrt(rangeMax)];
        const expGrid = [0.5, 1.0, 1.5, 1.9];

        for (let ni = 0; ni < nuggetGrid.length; ni++) {
            for (let si = 0; si < slopeGrid.length; si++) {
                for (let ei = 0; ei < expGrid.length; ei++) {
                    const params = { nugget: nuggetGrid[ni]!, slope: slopeGrid[si]!, exponent: expGrid[ei]! };
                    const sse = computeSSE(experimentalLags, experimentalGamma, w, modelType, params);
                    if (sse < bestSSE) {
                        bestSSE = sse;
                        bestParams = { ...params };
                    }
                }
            }
        }

        // 3 refinement rounds around best (grid ×10)
        for (let round = 0; round < 3; round++) {
            const nMin = Math.max(0, bestParams.nugget! * 0.5);
            const nMax = bestParams.nugget! * 2 + nuggetMaxFraction * 0.05;
            const sMin = bestParams.slope! * 0.5;
            const sMax = bestParams.slope! * 2;
            const eMin = Math.max(0.01, bestParams.exponent! - 0.3);
            const eMax = Math.min(1.99, bestParams.exponent! + 0.3);
            const steps = 8;
            for (let ni = 0; ni <= steps; ni++) {
                for (let si = 0; si <= steps; si++) {
                    for (let ei = 0; ei <= steps; ei++) {
                        const params = {
                            nugget: nMin + (nMax - nMin) * (ni / steps),
                            slope: sMin + (sMax - sMin) * (si / steps),
                            exponent: eMin + (eMax - eMin) * (ei / steps),
                        };
                        const sse = computeSSE(experimentalLags, experimentalGamma, w, modelType, params);
                        if (sse < bestSSE) {
                            bestSSE = sse;
                            bestParams = { ...params };
                        }
                    }
                }
            }
        }
    } else {
        // Spherical / exponential / Gaussian: search over {nugget, sill, range}
        const varianceEmp = sillEmp;
        const nuggetGrid = linspace(0, nuggetMaxFraction, 4);
        const sillGrid = linspace(varianceEmp * 0.5, varianceEmp * 2, 6);
        const rangeGrid = linspace(rangeMin, rangeMax, 8);

        for (let ni = 0; ni < nuggetGrid.length; ni++) {
            for (let si = 0; si < sillGrid.length; si++) {
                for (let ri = 0; ri < rangeGrid.length; ri++) {
                    const params = { nugget: nuggetGrid[ni]!, sill: sillGrid[si]!, range: rangeGrid[ri]! };
                    if (params.sill <= params.nugget) continue; // invalid
                    const sse = computeSSE(experimentalLags, experimentalGamma, w, modelType, params);
                    if (sse < bestSSE) {
                        bestSSE = sse;
                        bestParams = { ...params };
                    }
                }
            }
        }

        // 3 refinement rounds
        for (let round = 0; round < 3; round++) {
            const nMin = Math.max(0, bestParams.nugget! * 0.5);
            const nMax = bestParams.nugget! * 2 + nuggetMaxFraction * 0.05;
            const sMin = Math.max(0, bestParams.sill! * 0.7);
            const sMax = bestParams.sill! * 1.4;
            const rMin = Math.max(rangeMin * 0.5, bestParams.range! * 0.6);
            const rMax = Math.min(rangeMax * 1.5, bestParams.range! * 1.5);
            const steps = 10;
            for (let ni = 0; ni <= steps; ni++) {
                for (let si = 0; si <= steps; si++) {
                    for (let ri = 0; ri <= steps; ri++) {
                        const params = {
                            nugget: nMin + (nMax - nMin) * (ni / steps),
                            sill: sMin + (sMax - sMin) * (si / steps),
                            range: rMin + (rMax - rMin) * (ri / steps),
                        };
                        if (params.sill <= params.nugget) continue;
                        const sse = computeSSE(experimentalLags, experimentalGamma, w, modelType, params);
                        if (sse < bestSSE) {
                            bestSSE = sse;
                            bestParams = { ...params };
                        }
                    }
                }
            }
        }
    }

    // Compute RMSE and R²
    const meanObs = experimentalGamma.reduce((a, b) => a + b, 0) / n;
    let ssTot = 0;
    for (let i = 0; i < n; i++) ssTot += Math.pow(experimentalGamma[i]! - meanObs, 2);
    const rmse = Math.sqrt(bestSSE / n);
    const r2 = ssTot > 0 ? 1 - bestSSE / n / (ssTot / n) : 1;

        const result: Record<string, any>= {
        model: modelType,
        params: Object.freeze({ ...bestParams }),
        rmse,
        r2,
    };
    // Expose nugget/sill/range at top level for models that have them
    if (modelType !== 'power') {
        result.nugget = bestParams.nugget;
        result.sill = bestParams.sill;
        result.range = bestParams.range;
    } else {
        result.nugget = bestParams.nugget;
        result.slope = bestParams.slope;
        result.exponent = bestParams.exponent;
    }

    return Object.freeze(result);
}

/**
 * Linspace helper (internal).
 * @param {number} start
 * @param {number} end
 * @param {number} n
 * @returns {number[]}
 */
function linspace(start: number, end: number, n: number): number[] {
    if (n <= 1) return [start];
    const out = [];
    for (let i = 0; i < n; i++) out.push(start + (end - start) * (i / (n - 1)));
    return out;
}

// ---------------------------------------------------------------------------
// 5. Model selection via AIC
// ---------------------------------------------------------------------------

/**
 * Fits all 4 variogram models and selects the best by AIC.
 *
 * AIC = n × ln(SSE/n) + 2k   (k = number of parameters)
 * All four models have k=3 (nugget, sill, range) or (nugget, slope, exponent).
 * A small AIC penalty is applied to power model to avoid overfitting
 * on bounded datasets where sill is undefined.
 *
 * @param {number[]} experimentalLags
 * @param {number[]} experimentalGamma
 * @param {Object}   [opts]
 * @param {number[]|null} [opts.npairs=null] - Pares por lag (para pesos WLS)
 * @returns {Readonly<{best:Readonly<{model:string,params:Object,rmse:number,r2:number}>,all:ReadonlyArray<Readonly<{model:string,rmse:number,r2:number,aic:number}>>}>}
 */
export function selectBestModel(experimentalLags: number[], experimentalGamma: number[], { npairs = null }: { npairs?: number[] | null } = {}) {
    const modelTypes = ['spherical', 'exponential', 'gaussian', 'power'];
    const n = experimentalLags.length;

    const results = [];
    for (const modelType of modelTypes) {
        try {
            const fit = fitVariogramModel(experimentalLags, experimentalGamma, modelType, { npairs });
            // k = 3 for all models; apply +2 penalty for power (unbounded - less parsimonious for bounded data)
            const k = modelType === 'power' ? 5 : 3;
            const sse = fit.rmse * fit.rmse * n;
            const aic = n > 0 ? n * Math.log(sse / n) + 2 * k : Infinity;
            results.push({ model: modelType, params: fit.params, rmse: fit.rmse, r2: fit.r2, aic, fit });
        } catch (err: any) {
            // skip model that fails (e.g., degenerate data)
            console.warn(`[variogramFitting] selectBestModel: model ${modelType} failed -- ${err?.message || err}`);
        }
    }

    if (results.length === 0) {
        throw new RangeError('selectBestModel: no model could be fitted to the data');
    }

    // Sort by AIC (lower = better)
    results.sort((a, b) => a.aic - b.aic);

    const best = results[0]!;
    const all = results.map((r) => Object.freeze({ model: r.model, rmse: r.rmse, r2: r.r2, aic: r.aic }));

    return Object.freeze({
        best: Object.freeze({ model: best.model, params: best.params, rmse: best.rmse, r2: best.r2 }),
        all,
    });
}

// ---------------------------------------------------------------------------
// 6. Variogram range/sill/nugget heuristic estimator
// ---------------------------------------------------------------------------

/**
 * Estimativa heurística de range, sill e nugget a partir do variograma experimental.
 * Útil como seed para `fitVariogramModel`.
 *
 * Range: lag onde γ ≥ 0.95 × max(γ).
 * Sill:  max(γ) nos lags disponíveis.
 * Nugget: γ intercept extrapolated (valor em lag zero, estimado como γ[0] * 0.1 como proxy).
 *
 * @param {number[]} experimentalGamma
 * @param {number[]} experimentalLags
 * @returns {{estimatedRange:number,estimatedSill:number,estimatedNugget:number}}
 */
export function computeVariogramRange(experimentalGamma: number[], experimentalLags: number[]): {estimatedRange:number,estimatedSill:number,estimatedNugget:number} {
    if (!experimentalGamma || experimentalGamma.length === 0) {
        throw new RangeError('computeVariogramRange: empty gamma array');
    }

    const sill = Math.max(...experimentalGamma);
    const threshold = 0.95 * sill;

    // Find first lag where gamma crosses 95% of sill
    let estimatedRange = experimentalLags[experimentalLags.length - 1]!;
    for (let i = 0; i < experimentalGamma.length; i++) {
        if (experimentalGamma[i]! >= threshold) {
            estimatedRange = experimentalLags[i]!;
            break;
        }
    }

    // Nugget: extrapolate from first lag - use 10% of first gamma as rough estimate
    // (true nugget estimation requires fitting; this is a seed only)
    const estimatedNugget = experimentalGamma[0]! * 0.1;

    return Object.freeze({ estimatedRange, estimatedSill: sill, estimatedNugget });
}

// ---------------------------------------------------------------------------
// 7. Isotropy check
// ---------------------------------------------------------------------------

/**
 * Verifica isotropia calculando variogramas direcionais e comparando seus ranges.
 * Anisotropia detectada se max_range / min_range > 1.5.
 *
 * Direções: N-S (90°), E-O (0°), NE-SO (45°), NO-SE (135°).
 * Tolerância angular: 22.5° (metade do step direcional de 45°).
 *
 * @param {Array<{x:number,y:number,value:number}>} points
 * @param {Object} [opts]
 * @param {number} [opts.nDirections=4]
 * @param {number} [opts.nLags=8]
 * @returns {Readonly<{isIsotropic:boolean,anisotropyRatio:number,directionalVariograms:ReadonlyArray<Readonly<{direction:number,lags:number[],gamma:number[],npairs:number[],lagTolerance:number,method:string}>>}>}
 */
export function checkIsotropy(points: Array<{x:number,y:number,value:number}>, { nDirections = 4, nLags = 8 }: { nDirections?: number, nLags?: number } = {}) {
    if (!Array.isArray(points) || points.length < 3) {
        throw new RangeError('checkIsotropy: requires at least 3 points');
    }

    // Direction angles in degrees: 0° (E-O), 45° (NE-SO), 90° (N-S), 135° (NO-SE)
    const dirAngles = [];
    const stepDeg = 180 / nDirections;
    for (let d = 0; d < nDirections; d++) dirAngles.push(d * stepDeg);

    const angularTol = stepDeg / 2; // degrees — angular tolerance per direction

    const pairs = buildPairs(points);

    // Compute maxDist for lag binning
    let dMax = 0;
    for (const p of pairs) if (p.dist > dMax) dMax = p.dist;
    const effectiveMaxDist = dMax / 2;
    const lagStep = effectiveMaxDist / nLags;
    const lagTolerance = lagStep / 2;

    const directionalVariograms = [];

    for (const angleDeg of dirAngles) {
        const angleRad = (angleDeg * Math.PI) / 180;
        const tolRad = (angularTol * Math.PI) / 180;

        // Filter pairs in this direction (within angular tolerance)
        const dirPairs = pairs.filter((p) => {
            const p1 = points[p.i]!;
            const p2 = points[p.j]!;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const pairAngle = Math.atan2(dy, dx); // [-π, π]

            // Normalize to [0, π) since variogram is symmetric
            let diff = Math.abs(pairAngle - angleRad);
            // Wrap around π
            if (diff > Math.PI / 2) diff = Math.PI - diff;
            return diff <= tolRad;
        });

        if (dirPairs.length < 2) {
            directionalVariograms.push(
                Object.freeze({
                    direction: angleDeg,
                    lags: [],
                    gamma: [],
                    npairs: [],
                    lagTolerance,
                    method: 'matheron',
                }),
            );
            continue;
        }

        // Build variogram for this direction's pairs
        const lags = [];
        const gamma = [];
        const npairsArr = [];

        for (let k = 0; k < nLags; k++) {
            const lagCenter = (k + 0.5) * lagStep;
            const lo = lagCenter - lagTolerance;
            const hi = lagCenter + lagTolerance;
            const binPairs = dirPairs.filter((p) => p.dist >= lo && p.dist < hi);
            if (binPairs.length < 2) continue;
            const m = binPairs.length;
            const sumSq = binPairs.reduce((s, p) => s + p.sqDiff, 0);
            lags.push(lagCenter);
            gamma.push(sumSq / (2 * m));
            npairsArr.push(m);
        }

        directionalVariograms.push(
            Object.freeze({
                direction: angleDeg,
                lags,
                gamma,
                npairs: npairsArr,
                lagTolerance,
                method: 'matheron',
            }),
        );
    }

    // Estimate range per direction using heuristic
    const ranges = [];
    for (const dv of directionalVariograms) {
        if (dv.gamma.length === 0) continue;
        try {
            const { estimatedRange } = computeVariogramRange(dv.gamma, dv.lags);
            ranges.push(estimatedRange);
        } catch (e: any) {
            console.debug('[variogramFitting] estimatedRange:', e?.message || e);
            // skip directions with insufficient data
        }
    }

    let anisotropyRatio = 1;
    let isIsotropic = true;

    if (ranges.length >= 2) {
        const maxRange = Math.max(...ranges);
        const minRange = Math.min(...ranges);
        anisotropyRatio = minRange > 0 ? maxRange / minRange : Infinity;
        isIsotropic = anisotropyRatio <= 1.5;
    }

    return Object.freeze({
        isIsotropic,
        anisotropyRatio,
        directionalVariograms,
    });
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const variogramFittingMeta = {
    name: 'variogramFitting',
    description: 'variogramFitting',
    category: 'analytics',
    familyTags: ['environmental'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // CONNECTOR populated 2026-06-02 — Ajuste de variograma para krigagem
    // Reference: Isaaks & Srivastava (1989) Applied Geostatistics
    inputSchema: {
        type: 'object',
        properties: {
            points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, value: { type: 'number' } }, required: ['x', 'y', 'value'] }, minItems: 10 },
            model: { type: 'string', enum: ['spherical', 'exponential', 'gaussian'], default: 'spherical' },
            nLags: { type: 'number', default: 10, minimum: 3 },
            lagTolerance: { type: ['number', 'null'], default: null },
            maxDist: { type: ['number', 'null'], default: null },
            robust: { type: 'boolean', default: false, description: 'Cressie-Hawkins robust estimator' },
        },
        required: ['points'],
    },
    outputSchema: {
        type: 'object',
        properties: {
            params: { type: 'object', properties: { nugget: { type: 'number' }, sill: { type: 'number' }, range: { type: 'number' } } },
            experimental: { type: 'array', description: 'Variograma experimental (h, gamma)' },
            r2: { type: 'number' },
        },
        required: ['params'],
    },
};
