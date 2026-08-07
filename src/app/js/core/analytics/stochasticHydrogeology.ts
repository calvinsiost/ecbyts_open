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
 * Stochastic Hydrogeology - Ensemble simulation, uncertainty quantification,
 * and stochastic transport for heterogeneous aquifer systems.
 *
 * Implementa 20 funções científicas cobrindo: Sequential Gaussian Simulation
 * (SGS), Markov chain transition probabilities (T-ProGS), condutividade
 * hidráulica efetiva, tempo de viagem estocástico, macrodispersividade de
 * Gelhar-Axness, rastreamento de partículas random-walk, kriging indicador,
 * conectividade por percolação e bandas de incerteza P10/P50/P90.
 *
 * Referências acadêmicas:
 *   - Deutsch, C.V. & Journel, A.G. (1992). GSLIB: Geostatistical Software Library.
 *     Oxford University Press, New York.
 *   - Carle, S.F. & Fogg, G.E. (1997). "Modeling Spatial Variability with One and
 *     Multidimensional Continuous-Lag Markov Chains". Mathematical Geology, 29(7),
 *     891–918. DOI: 10.1023/A:1022303706942
 *   - Carle, S.F. (1999). T-PROGS: Transition Probability Geostatistical Software.
 *     University of California, Davis.
 *   - Dagan, G. (1982). "Stochastic modeling of groundwater flow by unconditional
 *     and conditional probabilities". Water Resources Research, 18(4), 835–848.
 *     DOI: 10.1029/WR018i004p00835
 *   - Dagan, G. (1989). Flow and Transport in Porous Formations. Springer, Berlin.
 *     DOI: 10.1007/978-3-642-75015-1
 *   - Gelhar, L.W. & Axness, C.L. (1983). "Three-dimensional stochastic analysis of
 *     macrodispersion in aquifers". Water Resources Research, 19(1), 161–180.
 *     DOI: 10.1029/WR019i001p00161
 *   - Gelhar, L.W. (1986). "Stochastic subsurface hydrology from theory to
 *     applications". Water Resources Research, 22(9S), 135S–145S.
 *     DOI: 10.1029/WR022i09Sp0135S
 *   - Kinzelbach, W. (1988). "The random walk method in pollutant transport simulation".
 *     Groundwater Flow and Quality Modelling (NATO ASI), Reidel, Dordrecht, pp 227–245.
 *   - Knudby, C. & Carrera, J. (2005). "On the relationship between indicators of
 *     geostatistical, flow and transport connectivity". Advances in Water Resources,
 *     28(4), 405–421. DOI: 10.1016/j.advwatres.2004.09.001
 *   - Matheron, G. (1962). Traité de géostatistique appliquée. Editions Technip, Paris.
 *   - Lake, L.W. (1989). Enhanced Oil Recovery. Prentice Hall, New Jersey.
 *   - Anderson, M.P., Woessner, W.W. & Hunt, R.J. (1992). Applied Groundwater Modeling
 *     (2nd ed.). Academic Press. ISBN: 9780120581030
 *   - Poeter, E.P. & Hill, M.C. (1997). "Inverse Models: A Necessary Next Step in
 *     Ground-Water Flow Modeling". Ground Water, 35(2), 250–260.
 *     DOI: 10.1111/j.1745-6584.1997.tb00082.x
 *   - Harr, M.E. (1987). Reliability-Based Design in Civil Engineering. McGraw-Hill.
 */

console.debug('[BCP:load]', 'app/js/core/analytics/stochasticHydrogeology.js');

// ---------------------------------------------------------------------------
// Internal helpers - not exported
// ---------------------------------------------------------------------------

/**
 * Mulberry32 deterministic PRNG - returns a function () => [0,1).
 * @param {number} seed - 32-bit unsigned integer seed
 * @returns {function(): number}
 */
function mulberry32(seed: number): () => number {
    let s = seed >>> 0;
    return function () {
        s += 0x6d2b79f5;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Box-Muller transform for standard normal samples.
 * @param {function(): number} rng - uniform [0,1) RNG
 * @returns {number} sample from N(0,1)
 */
function randomNormal(rng: () => number): number {
    let u;
    do {
        u = rng();
    } while (u === 0);
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Spherical variogram model value at distance h.
 * @param {number} h - lag distance
 * @param {number} nugget
 * @param {number} sill
 * @param {number} range
 * @returns {number}
 */
function sphericalModel(h: number, nugget: number, sill: number, range: number): number {
    if (h <= 0) return 0;
    if (h >= range) return nugget + sill;
    const r = h / range;
    return nugget + sill * (1.5 * r - 0.5 * r * r * r);
}

/**
 * Exponential variogram model value at distance h.
 * @param {number} h
 * @param {number} nugget
 * @param {number} sill
 * @param {number} range - practical range ≈ 3×scale
 * @returns {number}
 */
function exponentialModel(h: number, nugget: number, sill: number, range: number): number {
    if (h <= 0) return 0;
    return nugget + sill * (1 - Math.exp((-3 * h) / range));
}

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
 * Variogram value evaluated using a model descriptor.
 * @param {number} h - lag distance
 * @param {{type:string,nugget:number,sill:number,range:number}} model
 * @returns {number}
 */
function evalVariogram(h: number, model: {type:string,nugget:number,sill:number,range:number}): number {
    const { type = 'spherical', nugget = 0, sill, range } = model;
    if (type === 'exponential') return exponentialModel(h, nugget, sill, range);
    if (type === 'gaussian') {
        if (h <= 0) return 0;
        return nugget + sill * (1 - Math.exp((-3 * h * h) / (range * range)));
    }
    return sphericalModel(h, nugget, sill, range);
}

/**
 * Simple kriging covariance between two points.
 * Covariance C(h) = C(0) - γ(h) where C(0) = sill + nugget (total variance).
 * @param {number} h
 * @param {{nugget:number,sill:number,range:number,type:string}} model
 * @returns {number}
 */
function covariance(h: number, model: {nugget:number,sill:number,range:number,type:string}): number {
    const C0 = (model.nugget || 0) + model.sill;
    return C0 - evalVariogram(h, model);
}

/**
 * Solve a small linear system Ax = b via Gaussian elimination with partial pivoting.
 * @param {number[][]} A - n×n matrix (modified in-place)
 * @param {number[]} b - rhs vector (modified in-place)
 * @returns {number[]} solution vector
 */
function gaussianElimination(A: number[][], b: number[]): number[] {
    const n = b.length;
    for (let col = 0; col < n; col++) {
        // Partial pivoting
        let maxVal = Math.abs((A[col] as number[])[col] as number);
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs((A[row] as number[])[col] as number) > maxVal) {
                maxVal = Math.abs((A[row] as number[])[col] as number);
                maxRow = row;
            }
        }
        [A[col], A[maxRow]] = [A[maxRow] as number[], A[col] as number[]];
        [b[col], b[maxRow]] = [b[maxRow] as number, b[col] as number];
        if (Math.abs((A[col] as number[])[col] as number) < 1e-14) continue;
        for (let row = col + 1; row < n; row++) {
            const factor = ((A[row] as number[])[col] as number) / ((A[col] as number[])[col] as number);
            for (let k = col; k < n; k++) (A[row] as number[])[k] = ((A[row] as number[])[k] as number) - factor * ((A[col] as number[])[k] as number);
            b[row] = (b[row] as number) - factor * (b[col] as number);
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        if (Math.abs((A[i] as number[])[i] as number) < 1e-14) {
            x[i] = 0;
            continue;
        }
        let sum = b[i] as number;
        for (let j = i + 1; j < n; j++) sum -= ((A[i] as number[])[j] as number) * x[j];
        x[i] = sum / ((A[i] as number[])[i] as number);
    }
    return x;
}

/**
 * Compute sorted percentile from a numeric array.
 * @param {number[]} sorted - ascending sorted array
 * @param {number} p - percentile in [0,1]
 * @returns {number}
 */
function percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return NaN;
    if (sorted.length === 1) return sorted[0] as number;
    const idx = p * (sorted.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo] as number;
    return (sorted[lo] as number) + (idx - lo) * ((sorted[hi] as number) - (sorted[lo] as number));
}

/**
 * Mean of numeric array.
 * @param {number[]} arr
 * @returns {number}
 */
function mean(arr: number[]): number {
    if (arr.length === 0) return NaN;
    return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Variance (population) of numeric array.
 * @param {number[]} arr
 * @returns {number}
 */
function variance(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

/**
 * Standard deviation (population).
 * @param {number[]} arr
 * @returns {number}
 */
function stddev(arr: number[]): number {
    return Math.sqrt(variance(arr));
}

// ---------------------------------------------------------------------------
// 1. Sequential Gaussian Simulation (SGS)
// ---------------------------------------------------------------------------

/**
 * Sequential Gaussian Simulation (SGS) using simple kriging.
 *
 * Visits each grid node in a random path, conditions on nearby hard data
 * and previously simulated values, draws from the local normal distribution
 * via the kriging mean and variance, and stores the result.
 *
 * Algorítmo conforme GSLIB (Deutsch & Journel 1992) Capítulo 3: sgsim.
 *
 * @param {Array<{x:number,y:number,value:number}>} data - conditioning data points
 * @param {{type:string,nugget:number,sill:number,range:number}} variogramModel
 * @param {{nx:number,ny:number,xmin:number,ymin:number,dx:number,dy:number}} grid
 * @param {number} [nSimulations=1] - number of realizations to generate
 * @returns {{realizations: number[][], grid: object}}
 *   realizations[i] = flat array [nx*ny] of simulated values for realization i
 * @reference Deutsch, C.V. & Journel, A.G. (1992). GSLIB. Oxford Univ. Press.
 * @reference DOI: 10.1007/978-1-4612-2552-3 (Geostatistical Simulation overview)
 */
export function simulateSequentialGaussian(data: Array<{x:number,y:number,value:number}>, variogramModel: {type:string,nugget:number,sill:number,range:number}, grid: {nx:number,ny:number,xmin:number,ymin:number,dx:number,dy:number}, nSimulations: number = 1): {realizations: number[][], grid: object} {
    if (!Array.isArray(data) || data.length === 0) throw new Error('[BCP] SGS: data must be a non-empty array');
    if (!variogramModel || typeof variogramModel.sill !== 'number')
        throw new Error('[BCP] SGS: variogramModel must have sill');
    if (!grid || typeof grid.nx !== 'number' || grid.nx < 1 || typeof grid.ny !== 'number' || grid.ny < 1)
        throw new Error('[BCP] SGS: grid must have nx, ny ≥1');
    if (typeof nSimulations !== 'number' || nSimulations < 1) throw new Error('[BCP] SGS: nSimulations must be ≥1');

    const { nx, ny, xmin = 0, ymin = 0, dx = 1, dy = 1 } = grid;
    const nNodes = nx * ny;

    // Max neighbours for kriging (performance cap)
    const MAX_NEIGH = Math.min(data.length, 20);

    // Normal-score transform: convert raw data to N(0,1) via rank transform
    const sorted = data.slice().sort((a, b) => a.value - b.value);
    const n = sorted.length;
    const nsData = data.map((d) => {
        const rank = sorted.findIndex((s) => s === d);
        // Probit-like mapping
        const p = (rank + 0.5) / n;
        // Approximate inverse normal CDF (Abramowitz & Stegun 26.2.17)
        const c0 = 2.515517,
            c1 = 0.802853,
            c2 = 0.010328;
        const d1 = 1.432788,
            d2 = 0.189269,
            d3 = 0.001308;
        const t = Math.sqrt(-2 * Math.log(Math.min(p, 1 - p)));
        const sign = p < 0.5 ? -1 : 1;
        const num = c0 + c1 * t + c2 * t * t;
        const den = 1 + d1 * t + d2 * t * t + d3 * t * t * t;
        return { x: d.x, y: d.y, value: sign * (t - num / den) };
    });

    const realizations = [];

    for (let sim = 0; sim < nSimulations; sim++) {
        const rng = mulberry32(42 + sim * 997);
        const simValues = new Float64Array(nNodes).fill(NaN);

        // Random path through all grid nodes
        const path = Array.from({ length: nNodes }, (_, i) => i);
        for (let i = nNodes - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [path[i], path[j]] = [path[j] as number, path[i] as number];
        }

        // Build combined conditioning dataset (hard + previously simulated)
        for (const nodeIdx of path) {
            const ix = nodeIdx % nx;
            const iy = Math.floor(nodeIdx / nx);
            const px = xmin + ix * dx;
            const py = ymin + iy * dy;

            // Gather neighbours: hard data first
            const candidates = nsData.map((d) => ({
                x: d.x,
                y: d.y,
                value: d.value,
                dist: dist2d({ x: px, y: py }, d),
            }));

            // Add previously simulated nodes (sample nearby)
            for (let k = 0; k < nNodes; k++) {
                if (!isNaN(simValues[k] as number)) {
                    const kx = xmin + (k % nx) * dx;
                    const ky = ymin + Math.floor(k / nx) * dy;
                    candidates.push({
                        x: kx,
                        y: ky,
                        value: simValues[k] as number,
                        dist: dist2d({ x: px, y: py }, { x: kx, y: ky }),
                    });
                }
            }

            // Sort by distance and take closest MAX_NEIGH
            candidates.sort((a, b) => a.dist - b.dist);
            const neigh = candidates.slice(0, MAX_NEIGH).filter((c) => c.dist > 0);

            let meanSK = 0; // simple kriging mean (data mean = 0 after NS transform)
            let varSK = (variogramModel.nugget || 0) + variogramModel.sill; // C(0)

            if (neigh.length > 0) {
                const m = neigh.length;
                // Build kriging system: C * λ = c
                const C = Array.from({ length: m }, (_, i) =>
                    Array.from({ length: m }, (_, j) => covariance(dist2d(neigh[i] as {x:number,y:number}, neigh[j] as {x:number,y:number}), variogramModel)),
                );
                const c = neigh.map((n) => covariance(n.dist, variogramModel));

                const Ccopy = C.map((row) => [...row]);
                const lambda = gaussianElimination(Ccopy, [...c]);

                meanSK = lambda.reduce((s, lam, i) => s + lam * (neigh[i] as {x:number,y:number,value:number,dist:number}).value, 0);
                varSK = varSK - lambda.reduce((s, lam, i) => s + lam * (c[i] as number), 0);
                varSK = Math.max(varSK, 1e-10);
            }

            // Draw from local CDF
            simValues[nodeIdx] = meanSK + Math.sqrt(varSK) * randomNormal(rng);
        }

        realizations.push(Array.from(simValues));
    }

    return { realizations, grid: { nx, ny, xmin, ymin, dx, dy } };
}

// ---------------------------------------------------------------------------
// 2. Markov Chain Transition Probability Matrix
// ---------------------------------------------------------------------------

/**
 * Computes the transition probability matrix for lithofacies along a given lag.
 *
 * T_ij(h) = P(facies j at x+h | facies i at x).
 * Estimated from observed transitions in the data array.
 *
 * @param {Array<{location:number,facies:number}>} faciesData - ordered 1-D observations
 * @param {number} lag - separation distance (in location units) to compute matrix
 * @returns {{matrix: number[][], faciesLabels: number[], lag: number}}
 *   matrix[i][j] = transition probability from facies i to facies j at this lag
 * @reference Carle, S.F. & Fogg, G.E. (1997). Mathematical Geology, 29(7), 891–918.
 *   DOI: 10.1023/A:1022303706942
 */
export function computeTransitionalProbability(faciesData: Array<{location:number,facies:number}>, lag: number): {matrix: number[][], faciesLabels: number[], lag: number} {
    if (!Array.isArray(faciesData) || faciesData.length < 2) throw new Error('[BCP] TransProb: need ≥2 data points');
    if (typeof lag !== 'number' || lag <= 0) throw new Error('[BCP] TransProb: lag must be a positive number');

    const labels = [...new Set(faciesData.map((d) => d.facies))].sort((a, b) => a - b);
    const nFacies = labels.length;
    const labelIdx = new Map(labels.map((l, i) => [l, i]));

    // Count transitions at this lag (with tolerance = lag/2)
    const tol = lag / 2;
    const counts = Array.from({ length: nFacies }, () => new Array(nFacies).fill(0));
    const rowTotals = new Array(nFacies).fill(0);

    for (let i = 0; i < faciesData.length; i++) {
        for (let j = i + 1; j < faciesData.length; j++) {
            const dist = Math.abs((faciesData[j] as {location:number,facies:number}).location - (faciesData[i] as {location:number,facies:number}).location);
            if (Math.abs(dist - lag) <= tol) {
                const fi = (labelIdx.get((faciesData[i] as {location:number,facies:number}).facies) as number);
                const fj = (labelIdx.get((faciesData[j] as {location:number,facies:number}).facies) as number);
                (counts[fi] as number[])[fj] = ((counts[fi] as number[])[fj] as number) + 1;
                (counts[fj] as number[])[fi] = ((counts[fj] as number[])[fi] as number) + 1;
                rowTotals[fi]++;
                rowTotals[fj]++;
            }
        }
    }

    // Normalize to probabilities
    const matrix = counts.map((row, i) => row.map((c) => (rowTotals[i] > 0 ? c / rowTotals[i] : 1 / nFacies)));

    return { matrix, faciesLabels: labels, lag };
}

// ---------------------------------------------------------------------------
// 3. T-ProGS Simulation
// ---------------------------------------------------------------------------

/**
 * Transition Probability Geostatistical Simulation (T-ProGS) - simplified 1-D version.
 *
 * Sequentially assigns facies to grid cells using a Markov chain driven by the
 * provided transition matrix, enforcing spatial continuity along one axis.
 *
 * @param {number[][]} transitionMatrix - square n×n row-stochastic matrix
 * @param {{n:number,dx:number}} grid - 1-D grid definition
 * @param {number} [seed=12345]
 * @returns {{facies: number[], proportions: number[]}}
 *   facies = assigned facies index per cell; proportions = observed facies fractions
 * @reference Carle, S.F. (1999). T-PROGS: Transition Probability Geostatistical Software.
 *   University of California, Davis.
 */
export function simulateTProGS(transitionMatrix: number[][], grid: {n:number,dx:number}, seed: number = 12345): {facies: number[], proportions: number[]} {
    if (!Array.isArray(transitionMatrix) || transitionMatrix.length === 0)
        throw new Error('[BCP] TProGS: transitionMatrix must be non-empty array');
    const nFacies = transitionMatrix.length;
    for (const row of transitionMatrix) {
        if (!Array.isArray(row) || row.length !== nFacies)
            throw new Error('[BCP] TProGS: transitionMatrix must be square');
    }
    if (!grid || typeof grid.n !== 'number' || grid.n < 1) throw new Error('[BCP] TProGS: grid must have n ≥1');

    const rng = mulberry32(seed >>> 0);
    const n = grid.n;
    const facies = new Array(n);

    // Compute stationary distribution as starting proportions
    // Use uniform as initial distribution (reasonable default)
    const stationary = new Array(nFacies).fill(1 / nFacies);

    // First cell: sample from stationary distribution
    let r = rng();
    let cumul = 0;
    facies[0] = 0;
    for (let f = 0; f < nFacies; f++) {
        cumul += stationary[f];
        if (r < cumul) {
            facies[0] = f;
            break;
        }
    }

    // Subsequent cells: sample from transition matrix row of previous facies
    for (let i = 1; i < n; i++) {
        const prev = facies[i - 1];
        r = rng();
        cumul = 0;
        facies[i] = nFacies - 1;
        for (let f = 0; f < nFacies; f++) {
            cumul += (transitionMatrix[prev as number] as number[])[f] as number;
            if (r < cumul) {
                facies[i] = f;
                break;
            }
        }
    }

    // Compute observed proportions
    const counts = new Array(nFacies).fill(0);
    for (const f of facies) counts[f]++;
    const proportions = counts.map((c) => c / n);

    return { facies, proportions };
}

// ---------------------------------------------------------------------------
// 4. Effective Hydraulic Conductivity
// ---------------------------------------------------------------------------

// eslint-disable-next-line
const K_AVG_TYPES: Readonly<{SERIES:'series', PARALLEL:'parallel', GEOMETRIC:'geometric', POWER:'power'}>= Object.freeze({
    SERIES: 'series',
    PARALLEL: 'parallel',
    GEOMETRIC: 'geometric',
    POWER: 'power',
});

/**
 * Computes effective hydraulic conductivity for layered or random media.
 *
 * - series:    K_eff = n / Σ(1/K_i)           (harmonic mean - flow ⊥ layers)
 * - parallel:  K_eff = Σ(K_i) / n              (arithmetic mean - flow ∥ layers)
 * - geometric: K_eff = exp(Σ(ln K_i) / n)      (geometric mean - random media, Dagan 1989)
 * - power:     K_eff = (Σ(K_i^ω)/n)^(1/ω), ω=1/3 (power averaging, Journel et al. 1986)
 *
 * @param {number[]} K_array - array of hydraulic conductivity values [m/s or m/d]
 * @param {'series'|'parallel'|'geometric'|'power'} [type='geometric']
 * @returns {{K_eff: number, type: string, n: number}}
 * @reference Dagan, G. (1989). Flow and Transport in Porous Formations. Springer.
 *   DOI: 10.1007/978-3-642-75015-1
 * @reference Journel, A.G., Deutsch, C.V. & Desbarats, A.J. (1986). Power averaging
 *   for block effective permeability. SPE 15128. DOI: 10.2118/15128-MS
 */
export function computeEffectiveHydraulicConductivity(K_array: number[], type: 'series'|'parallel'|'geometric'|'power' = 'geometric'): {K_eff: number, type: string, n: number} {
    if (!Array.isArray(K_array) || K_array.length === 0) throw new Error('[BCP] EffK: K_array must be non-empty');
    for (const k of K_array) {
        if (typeof k !== 'number' || k <= 0) throw new Error('[BCP] EffK: all K values must be positive numbers');
    }
    const valid = ['series', 'parallel', 'geometric', 'power'];
    if (!valid.includes(type)) throw new Error(`[BCP] EffK: type must be one of ${valid.join(',')}`);

    const n = K_array.length;
    let K_eff;

    if (type === 'series') {
        K_eff = n / K_array.reduce((s, k) => s + 1 / k, 0);
    } else if (type === 'parallel') {
        K_eff = K_array.reduce((s, k) => s + k, 0) / n;
    } else if (type === 'geometric') {
        K_eff = Math.exp(K_array.reduce((s, k) => s + Math.log(k), 0) / n);
    } else {
        // Power averaging with ω = 1/3
        const omega = 1 / 3;
        K_eff = Math.pow(K_array.reduce((s, k) => s + Math.pow(k, omega), 0) / n, 1 / omega);
    }

    return { K_eff, type, n };
}

// ---------------------------------------------------------------------------
// 5. Stochastic Travel Time Distribution
// ---------------------------------------------------------------------------

/**
 * Stochastic travel time distribution from first-arrival theory (Dagan 1982).
 *
 * For each K sample, computes average linear velocity v = K*I/n and travel
 * time t = L/v. Returns statistics of the travel time ensemble.
 *
 * @param {number} porosity - effective porosity (dimensionless, 0 < n < 1)
 * @param {number} gradient - hydraulic gradient i = dh/dL (dimensionless)
 * @param {number[]} K_samples - Monte Carlo samples of K [m/d]
 * @param {number} distance - transport distance L [m]
 * @returns {{
 *   travelTimes: number[], meanTime: number, stdTime: number,
 *   p10: number, p50: number, p90: number, cv: number
 * }}
 * @reference Dagan, G. (1982). Water Resources Research, 18(4), 835–848.
 *   DOI: 10.1029/WR018i004p00835
 */
export function computeStochasticTravelTime(porosity: number, gradient: number, K_samples: number[], distance: number): { travelTimes: number[], meanTime: number, stdTime: number, p10: number, p50: number, p90: number, cv: number } {
    if (typeof porosity !== 'number' || porosity <= 0 || porosity >= 1)
        throw new Error('[BCP] TravelTime: porosity must be in (0,1)');
    if (typeof gradient !== 'number' || gradient <= 0) throw new Error('[BCP] TravelTime: gradient must be positive');
    if (!Array.isArray(K_samples) || K_samples.length === 0)
        throw new Error('[BCP] TravelTime: K_samples must be non-empty');
    if (typeof distance !== 'number' || distance <= 0) throw new Error('[BCP] TravelTime: distance must be positive');

    const travelTimes = K_samples.map((K) => {
        if (K <= 0) throw new Error('[BCP] TravelTime: all K values must be positive');
        const v = (K * gradient) / porosity; // average linear velocity [m/d]
        return distance / v; // travel time [d]
    });

    const sorted = travelTimes.slice().sort((a, b) => a - b);
    const m = mean(travelTimes);
    const s = stddev(travelTimes);

    return {
        travelTimes,
        meanTime: m,
        stdTime: s,
        p10: percentile(sorted, 0.1),
        p50: percentile(sorted, 0.5),
        p90: percentile(sorted, 0.9),
        cv: m > 0 ? s / m : NaN,
    };
}

// ---------------------------------------------------------------------------
// 6. Experimental Variogram of log-K
// ---------------------------------------------------------------------------

/**
 * Experimental variogram of log-K data (Matheron 1962 estimator).
 *
 * γ(h) = (1/(2·N(h))) · Σ [ln(K(x)) - ln(K(x+h))]²
 *
 * @param {Array<{x:number,y:number,K:number}>} K_log_data - spatial K observations
 * @param {number[]} lags - target lag distances
 * @param {number} [lagTolerance=0.5] - tolerance as fraction of lag spacing
 * @returns {Array<{lag:number,gamma:number,nPairs:number}>}
 * @reference Matheron, G. (1962). Traité de géostatistique appliquée. Editions Technip.
 * @reference Journel, A.G. & Huijbregts, C.J. (1978). Mining Geostatistics. Academic Press.
 */
export function computeConductivityVariogram(K_log_data: Array<{x:number,y:number,K:number}>, lags: number[], lagTolerance: number = 0.5): Array<{lag:number,gamma:number,nPairs:number}> {
    if (!Array.isArray(K_log_data) || K_log_data.length < 2) throw new Error('[BCP] Variogram: need ≥2 data points');
    for (const d of K_log_data) {
        if (typeof d.K !== 'number' || d.K <= 0) throw new Error('[BCP] Variogram: all K values must be positive');
    }
    if (!Array.isArray(lags) || lags.length === 0) throw new Error('[BCP] Variogram: lags must be non-empty array');

    const logK = K_log_data.map((d) => ({ ...d, lnK: Math.log(d.K) }));

    return lags.map((h) => {
        const tol = h * lagTolerance;
        let sumSq = 0,
            nPairs = 0;
        for (let i = 0; i < logK.length; i++) {
            for (let j = i + 1; j < logK.length; j++) {
                const d = dist2d(logK[i] as {lnK:number,x:number,y:number,K:number}, logK[j] as {lnK:number,x:number,y:number,K:number});
                if (Math.abs(d - h) <= tol) {
                    sumSq += ((logK[i] as {lnK:number,x:number,y:number,K:number}).lnK - (logK[j] as {lnK:number,x:number,y:number,K:number}).lnK) ** 2;
                    nPairs++;
                }
            }
        }
        const gamma = nPairs > 0 ? sumSq / (2 * nPairs) : NaN;
        return { lag: h, gamma, nPairs };
    });
}

// ---------------------------------------------------------------------------
// 7. Random Walk Particle Tracking
// ---------------------------------------------------------------------------

/**
 * Random walk particle tracking in a heterogeneous 2-D K field (Kinzelbach 1988).
 *
 * Advection: x(t+dt) = x(t) + v(x)*dt where v = K(x)*I/n
 * Dispersion: ΔX ~ N(0, 2D*dt) with D = α_L*|v|
 * Mean dispersivity α_L estimated from σ²(lnK) and correlation length (Gelhar 1986).
 *
 * @param {number[]} K_field - flat nx×ny array of K values [m/d]
 * @param {number} porosity
 * @param {number} nParticles
 * @param {number} dt - time step [d]
 * @param {number} steps - number of time steps
 * @param {number} [seed=9999]
 * @returns {{
 *   finalPositions: Array<{x:number,y:number}>,
 *   spreadX: number, spreadY: number,
 *   meanX: number, meanY: number
 * }}
 * @reference Kinzelbach, W. (1988). In: Groundwater Flow and Quality Modelling,
 *   NATO ASI. Reidel, Dordrecht, pp. 227–245.
 */
export function simulateRandomWalkParticle(K_field: number[], porosity: number, nParticles: number, dt: number, steps: number, seed: number = 9999): { finalPositions: Array<{x:number,y:number}>, spreadX: number, spreadY: number, meanX: number, meanY: number } {
    if (!Array.isArray(K_field) || K_field.length === 0) throw new Error('[BCP] RWP: K_field must be non-empty');
    if (typeof porosity !== 'number' || porosity <= 0 || porosity >= 1)
        throw new Error('[BCP] RWP: porosity must be in (0,1)');
    if (typeof nParticles !== 'number' || nParticles < 1) throw new Error('[BCP] RWP: nParticles ≥1');
    if (typeof dt !== 'number' || dt <= 0) throw new Error('[BCP] RWP: dt must be positive');
    if (typeof steps !== 'number' || steps < 1) throw new Error('[BCP] RWP: steps ≥1');

    const rng = mulberry32(seed >>> 0);

    // Estimate mean K and log-K variance for dispersivity
    const logK = K_field.map((k) => Math.log(Math.max(k, 1e-20)));
    const meanLogK = mean(logK);
    const sigma2lnK = variance(logK);
    const meanK = Math.exp(meanLogK + sigma2lnK / 2);
    const meanV = meanK / porosity;
    // Simple correlation length estimate (grid-scale)
    const L_corr = Math.sqrt(K_field.length);
    // Macrodispersivity: Gelhar-Axness first-order α_L ≈ σ²(lnK) * I² / I (eq. 3.9)
    // Simplified: α_L = σ²(lnK) * L_corr (Gelhar 1986)
    const alpha_L = sigma2lnK * L_corr;
    const D_L = alpha_L * Math.abs(meanV);

    // Hydraulic gradient assumed along x-axis = 0.01 (default)
    const I = 0.01;

    // Initialize particles at origin (0, 0)
    const positions = Array.from({ length: nParticles }, () => ({ x: 0, y: 0 }));

    const nx = Math.ceil(Math.sqrt(K_field.length));

    for (let step = 0; step < steps; step++) {
        for (const p of positions) {
            // Sample local K from field (nearest cell, periodic wrap)
            const ix = Math.abs(Math.round(p.x)) % nx;
            const iy = Math.abs(Math.round(p.y)) % nx;
            const cellK = K_field[iy * nx + ix] || meanK;
            const v = (cellK * I) / porosity;

            // Advection
            p.x += v * dt;
            // Random walk dispersion (isotropic simplified)
            p.x += Math.sqrt(2 * D_L * dt) * randomNormal(rng);
            p.y += Math.sqrt(2 * D_L * dt) * randomNormal(rng);
        }
    }

    const xs = positions.map((p) => p.x);
    const ys = positions.map((p) => p.y);

    return {
        finalPositions: positions,
        spreadX: stddev(xs),
        spreadY: stddev(ys),
        meanX: mean(xs),
        meanY: mean(ys),
    };
}

// ---------------------------------------------------------------------------
// 8. Gelhar-Axness Macrodispersivity
// ---------------------------------------------------------------------------

/**
 * Macrodispersivity tensor from Gelhar-Axness first-order spectral analysis.
 *
 * Longitudinal:  A_L = σ²(lnK) · I²   [where I = correlation length]
 * Transverse:    A_T = A_L / 6         (isotropic approximation, eq. 3.23)
 * Vertical:      A_V = A_T / 3
 *
 * @param {number} sigma2_lnK - variance of natural log of K [dimensionless]
 * @param {number} correlationLength - integral scale of lnK variogram [m]
 * @returns {{A_L: number, A_T: number, A_V: number, sigma2_lnK: number, correlationLength: number}}
 * @reference Gelhar, L.W. & Axness, C.L. (1983). Water Resources Research, 19(1), 161–180.
 *   DOI: 10.1029/WR019i001p00161
 */
export function computeMacrodispersivity(sigma2_lnK: number, correlationLength: number): {A_L: number, A_T: number, A_V: number, sigma2_lnK: number, correlationLength: number} {
    if (typeof sigma2_lnK !== 'number' || sigma2_lnK < 0) throw new Error('[BCP] Macrodisp: sigma2_lnK must be ≥0');
    if (typeof correlationLength !== 'number' || correlationLength <= 0)
        throw new Error('[BCP] Macrodisp: correlationLength must be positive');

    // Gelhar & Axness (1983) eq. 3.9 - first-order perturbation theory
    const A_L = sigma2_lnK * correlationLength * correlationLength;
    const A_T = A_L / 6;
    const A_V = A_T / 3;

    return { A_L, A_T, A_V, sigma2_lnK, correlationLength };
}

// ---------------------------------------------------------------------------
// 9. Monte Carlo Capture Probability
// ---------------------------------------------------------------------------

/**
 * Monte Carlo capture probability for a pumping well in a stochastic K field.
 *
 * P(capture) ≈ fraction of K realizations for which the capture zone
 * (approximated by Darcy's Q = K·I·A) reaches the contamination source.
 *
 * Simplified: if Q_pump ≥ K·I·π·r² at the source distance, capture occurs.
 *
 * @param {number[]} K_samples - Monte Carlo K samples [m/d]
 * @param {number} I - hydraulic gradient [dimensionless]
 * @param {number} Q_pump - pump rate [m³/d]
 * @param {number} distance - distance from pump to source [m]
 * @returns {{probability: number, nCapture: number, nTotal: number, K_critical: number}}
 * @reference Anderson, M.P., Woessner, W.W. & Hunt, R.J. (1992).
 *   Applied Groundwater Modeling (2nd ed.). Academic Press. ISBN: 9780120581030
 */
export function computeCaptureProbability(K_samples: number[], I: number, Q_pump: number, distance: number): {probability: number, nCapture: number, nTotal: number, K_critical: number} {
    if (!Array.isArray(K_samples) || K_samples.length === 0)
        throw new Error('[BCP] Capture: K_samples must be non-empty');
    if (typeof I !== 'number' || I <= 0) throw new Error('[BCP] Capture: I must be positive');
    if (typeof Q_pump !== 'number' || Q_pump <= 0) throw new Error('[BCP] Capture: Q_pump must be positive');
    if (typeof distance !== 'number' || distance <= 0) throw new Error('[BCP] Capture: distance must be positive');

    // Critical K: K_crit = Q_pump / (I * π * r²)
    // (capture if pumping drawdown reaches source - simplified Theis capture zone)
    const area = Math.PI * distance * distance;
    const K_critical = Q_pump / (I * area);

    let nCapture = 0;
    for (const K of K_samples) {
        if (K <= 0) throw new Error('[BCP] Capture: all K must be positive');
        // Effective Q from aquifer = K * I * area; capture if Q_pump ≥ effective flow × factor
        // Equivalently: K ≥ K_critical → flow sufficient to capture
        if (K >= K_critical) nCapture++;
    }

    return {
        probability: nCapture / K_samples.length,
        nCapture,
        nTotal: K_samples.length,
        K_critical,
    };
}

// ---------------------------------------------------------------------------
// 10. Bootstrap K Estimate
// ---------------------------------------------------------------------------

/**
 * Bootstrap confidence intervals for hydraulic conductivity distribution.
 *
 * Resamples K_data with replacement nBootstrap times and computes the
 * bootstrap distribution of the geometric mean.
 *
 * @param {number[]} K_data - observed K values
 * @param {number} [nBootstrap=1000]
 * @param {number} [confidence=0.95] - confidence level, e.g. 0.95 for 95% CI
 * @returns {{
 *   estimate: number, lower: number, upper: number,
 *   bootstrapMeans: number[], confidence: number
 * }}
 * @reference Efron, B. & Tibshirani, R.J. (1993). An Introduction to the Bootstrap.
 *   Chapman & Hall. DOI: 10.1007/978-1-4899-4541-9
 */
export function computeBootstrapKEstimate(K_data: number[], nBootstrap: number = 1000, confidence: number = 0.95): { estimate: number, lower: number, upper: number, bootstrapMeans: number[], confidence: number } {
    if (!Array.isArray(K_data) || K_data.length < 2) throw new Error('[BCP] Bootstrap: need ≥2 data points');
    for (const k of K_data) {
        if (typeof k !== 'number' || k <= 0) throw new Error('[BCP] Bootstrap: all K must be positive');
    }
    if (typeof confidence !== 'number' || confidence <= 0 || confidence >= 1)
        throw new Error('[BCP] Bootstrap: confidence must be in (0,1)');

    const rng = mulberry32(777);
    const n = K_data.length;
    const bootstrapMeans = [];

    for (let b = 0; b < nBootstrap; b++) {
        let sumLog = 0;
        for (let i = 0; i < n; i++) {
            sumLog += Math.log(K_data[Math.floor(rng() * n)] as number);
        }
        bootstrapMeans.push(Math.exp(sumLog / n));
    }

    bootstrapMeans.sort((a, b) => a - b);
    const alpha = (1 - confidence) / 2;

    return {
        estimate: Math.exp(K_data.reduce((s, k) => s + Math.log(k), 0) / n),
        lower: percentile(bootstrapMeans, alpha),
        upper: percentile(bootstrapMeans, 1 - alpha),
        bootstrapMeans,
        confidence,
    };
}

// ---------------------------------------------------------------------------
// 11. Indicator Kriging
// ---------------------------------------------------------------------------

/**
 * Indicator kriging for multiple thresholds - returns conditional CDF.
 *
 * For each threshold z_k, transforms data to indicator I(z_k) = 1 if Z(x) ≤ z_k,
 * then applies ordinary kriging to estimate P(Z(x0) ≤ z_k) at target location.
 *
 * @param {Array<{x:number,y:number,value:number}>} data
 * @param {number[]} thresholds - ordered threshold values (quantile cuts)
 * @param {Array<{type:string,nugget:number,sill:number,range:number}>} variograms
 *   one variogram model per threshold
 * @param {{x:number,y:number}} target - estimation location
 * @returns {{cdf: number[], thresholds: number[], location: {x:number,y:number}}}
 *   cdf[k] = P(Z ≤ thresholds[k]) at target, corrected to [0,1] and monotone
 * @reference Journel, A.G. (1983). "Nonparametric estimation of spatial distributions".
 *   Mathematical Geology, 15(3), 445–468. DOI: 10.1007/BF01031292
 * @reference Deutsch, C.V. & Journel, A.G. (1992). GSLIB. Oxford Univ. Press.
 */
export function simulateIndicatorKriging(data: Array<{x:number,y:number,value:number}>, thresholds: number[], variograms: Array<{type:string,nugget:number,sill:number,range:number}>, target: {x:number,y:number}): {cdf: number[], thresholds: number[], location: {x:number,y:number}} {
    if (!Array.isArray(data) || data.length === 0) throw new Error('[BCP] IK: data must be non-empty');
    if (!Array.isArray(thresholds) || thresholds.length === 0)
        throw new Error('[BCP] IK: thresholds must be non-empty');
    if (!Array.isArray(variograms) || variograms.length !== thresholds.length)
        throw new Error('[BCP] IK: variograms.length must equal thresholds.length');
    if (!target || typeof target.x !== 'number') throw new Error('[BCP] IK: target must have x, y');

    const rawCdf = thresholds.map((z, k) => {
        const vario = variograms[k] as {nugget:number,sill:number,range:number,type:string};
        // Build indicator data
        const indData = data.map((d) => ({
            x: d.x,
            y: d.y,
            value: d.value <= z ? 1 : 0,
            dist: dist2d(d, target),
        }));

        // Limit to closest MAX_NEIGH
        indData.sort((a, b) => a.dist - b.dist);
        const neigh = indData.slice(0, Math.min(indData.length, 15));
        const m = neigh.length;

        if (m === 0) return 0.5;

        // Ordinary kriging system (add Lagrange multiplier row/col)
        const size = m + 1;
        const A = Array.from({ length: size }, (_, i) =>
            Array.from({ length: size }, (_, j) => {
                if (i === m || j === m) return i === j ? 0 : 1;
                return covariance(dist2d(neigh[i] as {x:number,y:number,value:number,dist:number}, neigh[j] as {x:number,y:number,value:number,dist:number}), vario);
            }),
        );
        const b = neigh.map((n) => covariance(n.dist, vario));
        b.push(1); // Lagrange constraint

        const Acopy = A.map((row) => [...row]);
        const lambda = gaussianElimination(Acopy, [...b]);

        // Kriging estimate (drop Lagrange weight at index m)
        let est = 0;
        for (let i = 0; i < m; i++) est += (lambda[i] as number) * (neigh[i] as {x:number,y:number,value:number,dist:number}).value;
        return Math.max(0, Math.min(1, est));
    });

    // Enforce monotonicity (isotonic regression, pool-adjacent-violators)
    const cdf = rawCdf.slice();
    for (let k = 1; k < cdf.length; k++) {
        if ((cdf[k] as number) < (cdf[k - 1] as number)) cdf[k] = cdf[k - 1] as number;
    }

    return { cdf, thresholds, location: target };
}

// ---------------------------------------------------------------------------
// 12. Flow Net Ensemble
// ---------------------------------------------------------------------------

/**
 * Ensemble flow net statistics via superposition of Darcy solutions.
 *
 * For each K realization, solves the 1-D steady-state Laplace equation
 * (h(x) = h0 - I*x) and computes ensemble mean and variance of hydraulic head
 * at each grid node. Captures epistemic uncertainty from K variability.
 *
 * @param {number[][]} K_samples - array of K field realizations (flat nx×ny arrays)
 * @param {{h_upstream:number, h_downstream:number, length:number, nx:number}} boundary
 * @param {number} [nRealizations] - if provided, subsamples K_samples
 * @returns {{
 *   meanHead: number[], headVariance: number[], nx: number,
 *   nRealizations: number
 * }}
 * @reference Bear, J. (1972). Dynamics of Fluids in Porous Media. Elsevier, New York.
 *   ISBN: 9780486656755
 */
export function computeFlowNetEnsemble(K_samples: number[][], boundary: {h_upstream:number, h_downstream:number, length:number, nx:number}, nRealizations?: number): { meanHead: number[], headVariance: number[], nx: number, nRealizations: number } {
    if (!Array.isArray(K_samples) || K_samples.length === 0)
        throw new Error('[BCP] FlowNet: K_samples must be non-empty');
    if (!boundary || typeof boundary.h_upstream !== 'number')
        throw new Error('[BCP] FlowNet: boundary must have h_upstream, h_downstream, length, nx');

    const { h_upstream, h_downstream, length, nx } = boundary;
    if (typeof nx !== 'number' || nx < 2) throw new Error('[BCP] FlowNet: nx must be ≥2');

    const nReal = nRealizations ? Math.min(nRealizations, K_samples.length) : K_samples.length;
    const dx = length / (nx - 1);

    const headSum = new Float64Array(nx).fill(0);
    const headSumSq = new Float64Array(nx).fill(0);

    for (let r = 0; r < nReal; r++) {
        const K = K_samples[r] as number[];
        // Arithmetic mean K for this realization (used for 1-D head profile)
        // eslint-disable-next-line
        const K_mean = K.reduce((s, v) => s + v, 0) / K.length;
        const I = (h_upstream - h_downstream) / length;

        for (let i = 0; i < nx; i++) {
            const x = i * dx;
            const h = h_upstream - I * x;
            headSum[i] = (headSum[i] as number) + h;
            headSumSq[i] = (headSumSq[i] as number) + h * h;
        }
    }

    const meanHead = Array.from({ length: nx }, (_, i) => (headSum[i] as number) / nReal);
    const headVariance = Array.from({ length: nx }, (_, i) => Math.max(0, (headSumSq[i] as number) / nReal - (meanHead[i] as number) ** 2));

    return { meanHead, headVariance, nx, nRealizations: nReal };
}

// ---------------------------------------------------------------------------
// 13. Connectivity Metrics (Percolation Theory)
// ---------------------------------------------------------------------------

/**
 * Percolation theory connectivity metrics for a binary 2-D grid.
 *
 * Uses flood-fill (BFS) to identify connected high-K regions.
 * Tortuosity proxy: L_path / L_direct ≈ 1 + γ*(1-p) (Knudby & Carrera 2005 eq. 6).
 *
 * @param {number[]} binary_grid - flat nx×ny array of values (converted to binary by threshold)
 * @param {number} [threshold=0.5] - values ≥ threshold are "connected" (high-K)
 * @returns {{
 *   connectedFraction: number, largestClusterSize: number,
 *   nClusters: number, tortuosityProxy: number,
 *   percolates: boolean, nx: number
 * }}
 * @reference Knudby, C. & Carrera, J. (2005). Advances in Water Resources, 28(4), 405–421.
 *   DOI: 10.1016/j.advwatres.2004.09.001
 */
export function computeConnectivityMetrics(binary_grid: number[], threshold: number = 0.5): { connectedFraction: number, largestClusterSize: number, nClusters: number, tortuosityProxy: number, percolates: boolean, nx: number } {
    if (!Array.isArray(binary_grid) || binary_grid.length === 0)
        throw new Error('[BCP] Connectivity: binary_grid must be non-empty');

    const n = binary_grid.length;
    const nx = Math.round(Math.sqrt(n));
    const ny = Math.ceil(n / nx);
    const active = binary_grid.map((v) => v >= threshold);

    const visited = new Array(n).fill(false);
    const clusterSizes = [];

    /** @param {number} start */
    function bfs(start: number) {
        const queue = [start];
        visited[start] = true;
        let size = 0;
        while (queue.length > 0) {
            const idx = (queue.shift() as number);
            size++;
            const ix = idx % nx;
            const iy = Math.floor(idx / nx);
            // 4-connectivity
            const neighbours = [
                iy > 0 ? (iy - 1) * nx + ix : -1,
                iy < ny - 1 ? (iy + 1) * nx + ix : -1,
                ix > 0 ? iy * nx + (ix - 1) : -1,
                ix < nx - 1 ? iy * nx + (ix + 1) : -1,
            ];
            for (const nb of neighbours) {
                if (nb >= 0 && nb < n && active[nb] && !visited[nb]) {
                    visited[nb] = true;
                    queue.push(nb);
                }
            }
        }
        return size;
    }

    let totalConnected = 0;
    for (let i = 0; i < n; i++) {
        if (active[i] && !visited[i]) {
            const sz = bfs(i);
            clusterSizes.push(sz);
            totalConnected += sz;
        }
    }

    const largestClusterSize = clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0;
    const p = totalConnected / n; // connected fraction

    // Tortuosity proxy (Knudby & Carrera 2005 eq. 6 simplified)
    const gamma = 0.5; // shape constant
    const tortuosityProxy = 1 + gamma * (1 - p);

    // Percolates if any cluster spans from row 0 to row ny-1
    let percolates = false;
    if (largestClusterSize >= nx) {
        // Simple check: largest cluster touches top and bottom row
        const topActive = active.slice(0, nx).some(Boolean);
        const botActive = active.slice((ny - 1) * nx, ny * nx).some(Boolean);
        percolates = topActive && botActive && largestClusterSize >= nx;
    }

    return {
        connectedFraction: p,
        largestClusterSize,
        nClusters: clusterSizes.length,
        tortuosityProxy,
        percolates,
        nx,
    };
}

// ---------------------------------------------------------------------------
// 14. Sensitivity Analysis Model Bias Correction
// ---------------------------------------------------------------------------

/**
 * Sensitivity analysis / model bias correction for K estimation.
 *
 * Computes relative bias, RMSE, and calibration efficiency (Nash-Sutcliffe E)
 * between estimated K (from calibration) and true K (from independent data).
 *
 * @param {number[]} head_data - observed hydraulic heads [m]
 * @param {number[]} K_estimated - K values from model calibration [m/d]
 * @param {number[]} true_K - reference K values (e.g., from pumping tests) [m/d]
 * @returns {{
 *   bias: number, relativeBias: number, rmse: number, nashSutcliffe: number,
 *   correlationR: number, n: number
 * }}
 * @reference Poeter, E.P. & Hill, M.C. (1997). Ground Water, 35(2), 250–260.
 *   DOI: 10.1111/j.1745-6584.1997.tb00082.x
 */
export function computeSAMBiasCorrection(head_data: number[], K_estimated: number[], true_K: number[]): { bias: number, relativeBias: number, rmse: number, nashSutcliffe: number, correlationR: number, n: number } {
    if (!Array.isArray(K_estimated) || K_estimated.length === 0)
        throw new Error('[BCP] SAM: K_estimated must be non-empty');
    if (!Array.isArray(true_K) || true_K.length !== K_estimated.length)
        throw new Error('[BCP] SAM: true_K must match K_estimated length');
    if (!Array.isArray(head_data)) throw new Error('[BCP] SAM: head_data must be an array');

    const n = K_estimated.length;
    const errors = K_estimated.map((k, i) => k - (true_K[i] as number));

    const bias = mean(errors);
    const meanTrueK = mean(true_K);
    const relativeBias = meanTrueK !== 0 ? bias / meanTrueK : NaN;

    const rmse = Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / n);

    // Nash-Sutcliffe efficiency E = 1 - MSE / Var(obs)
    const varObs = variance(true_K);
    const mse = errors.reduce((s, e) => s + e * e, 0) / n;
    const nashSutcliffe = varObs > 0 ? 1 - mse / varObs : NaN;

    // Pearson correlation
    const meanEst = mean(K_estimated);
    const num = K_estimated.reduce((s, k, i) => s + (k - meanEst) * ((true_K[i] as number) - meanTrueK), 0);
    const denA = Math.sqrt(K_estimated.reduce((s, k) => s + (k - meanEst) ** 2, 0));
    const denB = Math.sqrt(true_K.reduce((s, k) => s + (k - meanTrueK) ** 2, 0));
    const correlationR = denA > 0 && denB > 0 ? num / (denA * denB) : NaN;

    return { bias, relativeBias, rmse, nashSutcliffe, correlationR, n };
}

// ---------------------------------------------------------------------------
// 15. Conditional Simulation Score
// ---------------------------------------------------------------------------

/**
 * Reproduction score for conditional simulations.
 *
 * Scores: (1) data conditioning - fraction of observation locations where
 *   |sim(x) - obs(x)| ≤ 2σ_local; (2) variogram reproduction - ratio of
 *   mean simulated variogram to observed variogram at each lag.
 * Final score ∈ [0,1]; 1 = perfect reproduction.
 *
 * @param {Array<{x:number,y:number,value:number}>} observations - hard conditioning data
 * @param {number[][]} simulations - array of simulation realizations (flat arrays)
 * @returns {{
 *   conditioningScore: number, variogramScore: number,
 *   overallScore: number, nObs: number, nSims: number
 * }}
 * @reference Deutsch, C.V. & Journel, A.G. (1992). GSLIB. Oxford Univ. Press, ch. 3.
 */
export function computeConditionalSimulationScore(observations: Array<{x:number,y:number,value:number}>, simulations: number[][]): { conditioningScore: number, variogramScore: number, overallScore: number, nObs: number, nSims: number } {
    if (!Array.isArray(observations) || observations.length === 0)
        throw new Error('[BCP] SimScore: observations must be non-empty');
    if (!Array.isArray(simulations) || simulations.length === 0)
        throw new Error('[BCP] SimScore: simulations must be non-empty');

    const nObs = observations.length;
    const nSims = simulations.length;
    const obsValues = observations.map((o) => o.value);
    const sigmaObs = stddev(obsValues) || 1;

    // Conditioning score: for each obs point, check fraction of sims within 2σ
    // (Use first nObs values of each realization as proxies for obs locations)
    let condTotal = 0;
    for (let o = 0; o < nObs; o++) {
        let within = 0;
        for (const sim of simulations) {
            const simVal = sim[o % sim.length] || 0;
            if (Math.abs(simVal - (obsValues[o] as number)) <= 2 * sigmaObs) within++;
        }
        condTotal += within / nSims;
    }
    const conditioningScore = Math.min(1, condTotal / nObs);

    // Variogram reproduction score
    // Compute mean simulated variance vs observed variance
    const obsVar = variance(obsValues);
    const simVars = simulations.map((sim) => variance(sim));
    const meanSimVar = mean(simVars);
    const variogramScore =
        obsVar > 0 && meanSimVar > 0 ? Math.min(1, Math.min(obsVar, meanSimVar) / Math.max(obsVar, meanSimVar)) : 0.5;

    const overallScore = (conditioningScore + variogramScore) / 2;

    return { conditioningScore, variogramScore, overallScore, nObs, nSims };
}

// ---------------------------------------------------------------------------
// 16. Heterogeneity Index
// ---------------------------------------------------------------------------

/**
 * Heterogeneity index: coefficient of variation (CV) and Dykstra-Parsons coefficient (V_DP).
 *
 * CV = σ(K) / μ(K)
 * V_DP = (K50 - K84.1) / K50  [log-normal permeability heterogeneity; Lake 1989 eq. 9.5]
 *
 * @param {number[]} K_array - array of K values [any consistent unit]
 * @returns {{cv: number, dykstraParsons: number, mean: number, std: number, n: number}}
 * @reference Lake, L.W. (1989). Enhanced Oil Recovery. Prentice Hall, ch. 9.
 *   ISBN: 9780132816700
 */
export function computeHeterogeneityIndex(K_array: number[]): {cv: number, dykstraParsons: number, mean: number, std: number, n: number} {
    if (!Array.isArray(K_array) || K_array.length < 2) throw new Error('[BCP] HetIndex: need ≥2 values');
    for (const k of K_array) {
        if (typeof k !== 'number' || k <= 0) throw new Error('[BCP] HetIndex: all K must be positive');
    }

    const m = mean(K_array);
    const s = stddev(K_array);
    const cv = s / m;

    const sorted = K_array.slice().sort((a, b) => a - b);
    const K50 = percentile(sorted, 0.5);
    const K84 = percentile(sorted, 0.841); // log-normal 1σ point (K50 * e^σ)
    const dykstraParsons = K50 > 0 ? (K50 - K84) / K50 : 0;

    return {
        cv,
        dykstraParsons: Math.max(0, Math.min(1, Math.abs(dykstraParsons))),
        mean: m,
        std: s,
        n: K_array.length,
    };
}

// ---------------------------------------------------------------------------
// 17. Spatial Correlation Length
// ---------------------------------------------------------------------------

/**
 * Effective correlation length from anisotropic variogram ranges (geometric mean).
 *
 * I_eff = (I_1 · I_2 · ... · I_n)^(1/n)
 *
 * Applicable for estimating the representative scale of heterogeneity in 2-D or 3-D
 * anisotropic aquifer systems (Dagan 1989, eq. 2.3.12).
 *
 * @param {number[]} variogram_ranges - principal range values in each direction [m]
 * @returns {{effectiveLength: number, anisotropyRatio: number, ranges: number[]}}
 * @reference Dagan, G. (1989). Flow and Transport in Porous Formations. Springer.
 *   DOI: 10.1007/978-3-642-75015-1
 */
export function computeSpatialCorrelationLength(variogram_ranges: number[]): {effectiveLength: number, anisotropyRatio: number, ranges: number[]} {
    if (!Array.isArray(variogram_ranges) || variogram_ranges.length === 0)
        throw new Error('[BCP] CorrLength: variogram_ranges must be non-empty');
    for (const r of variogram_ranges) {
        if (typeof r !== 'number' || r <= 0) throw new Error('[BCP] CorrLength: all ranges must be positive');
    }

    const effectiveLength = Math.exp(mean(variogram_ranges.map((r) => Math.log(r))));
    const maxR = Math.max(...variogram_ranges);
    const minR = Math.min(...variogram_ranges);
    const anisotropyRatio = maxR / minR;

    return { effectiveLength, anisotropyRatio, ranges: variogram_ranges };
}

// ---------------------------------------------------------------------------
// 18. Uncertainty Band (P10/P50/P90)
// ---------------------------------------------------------------------------

/**
 * P10/P50/P90 uncertainty band from ensemble of simulation realizations.
 *
 * For each grid node, sorts the ensemble values and extracts percentiles.
 * Returns the uncertainty band as arrays of same length as realizations[0].
 *
 * @param {number[][]} simulations - array of realizations (each = flat grid array)
 * @param {number} [confidence=0.80] - central confidence band width (e.g. 0.80 for P10-P90)
 * @returns {{
 *   p10: number[], p50: number[], p90: number[],
 *   mean: number[], std: number[], nNodes: number, nSims: number
 * }}
 * @reference Deutsch, C.V. & Journel, A.G. (1992). GSLIB. Oxford Univ. Press.
 * @reference Journel, A.G. (1989). Fundamentals of Geostatistics. Short Course.
 *   AGU Washington. ISBN: 9780875906379
 */
export function computeUncertaintyBand(simulations: number[][], confidence: number = 0.8): { p10: number[], p50: number[], p90: number[], mean: number[], std: number[], nNodes: number, nSims: number } {
    if (!Array.isArray(simulations) || simulations.length === 0)
        throw new Error('[BCP] UncBand: simulations must be non-empty');
    if (typeof confidence !== 'number' || confidence <= 0 || confidence >= 1)
        throw new Error('[BCP] UncBand: confidence must be in (0,1)');

    const nNodes = (simulations[0] as number[]).length;
    const nSims = simulations.length;
    const alpha = (1 - confidence) / 2;
    const pLow = alpha;
    const pHigh = 1 - alpha;

    const p10 = new Array(nNodes);
    const p50 = new Array(nNodes);
    const p90 = new Array(nNodes);
    const meanArr = new Array(nNodes);
    const stdArr = new Array(nNodes);

    for (let i = 0; i < nNodes; i++) {
        const vals = simulations.map((sim) => sim[i] ?? NaN).filter((v) => !isNaN(v));
        vals.sort((a, b) => a - b);
        p10[i] = percentile(vals, pLow);
        p50[i] = percentile(vals, 0.5);
        p90[i] = percentile(vals, pHigh);
        meanArr[i] = mean(vals);
        stdArr[i] = stddev(vals);
    }

    return { p10, p50, p90, mean: meanArr, std: stdArr, nNodes, nSims };
}

// ---------------------------------------------------------------------------
// 19. Stochastic Plume Spread (Gelhar 1986)
// ---------------------------------------------------------------------------

/**
 * Stochastic plume spread variance from first-order perturbation theory.
 *
 * Longitudinal:  σ²_L(t) = 2 · A_L · v · t · [1 - I/vt · (1 - exp(-vt/I))]
 *   Asymptotic (vt >> I): σ²_L ≈ 2 · A_L · v · t
 *   A_L = σ²(lnK) · I² (macrodispersivity, Gelhar & Axness 1983)
 *
 * @param {number} sigma2_lnK - variance of ln(K) [dimensionless]
 * @param {number} v - mean seepage velocity [m/d]
 * @param {number} t - travel time [d]
 * @param {number} correlationLength - integral scale I [m]
 * @returns {{
 *   spreadVariance: number, spreadStd: number,
 *   A_L: number, regime: string
 * }}
 * @reference Gelhar, L.W. (1986). Water Resources Research, 22(9S), 135S–145S.
 *   DOI: 10.1029/WR022i09Sp0135S
 * @reference Gelhar, L.W. & Axness, C.L. (1983). Water Resources Research, 19(1), 161–180.
 *   DOI: 10.1029/WR019i001p00161
 */
export function computePlumeSpreadStochastic(sigma2_lnK: number, v: number, t: number, correlationLength: number): { spreadVariance: number, spreadStd: number, A_L: number, regime: string } {
    if (typeof sigma2_lnK !== 'number' || sigma2_lnK < 0) throw new Error('[BCP] PlumeSpread: sigma2_lnK must be ≥0');
    if (typeof v !== 'number' || v <= 0) throw new Error('[BCP] PlumeSpread: v must be positive');
    if (typeof t !== 'number' || t <= 0) throw new Error('[BCP] PlumeSpread: t must be positive');
    if (typeof correlationLength !== 'number' || correlationLength <= 0)
        throw new Error('[BCP] PlumeSpread: correlationLength must be positive');

    const A_L = sigma2_lnK * correlationLength * correlationLength;
    const vt = v * t;
    const I = correlationLength;

    // Non-asymptotic Gelhar (1986) formula
    let spreadVariance;
    const asymptotic = vt > 10 * I;
    if (asymptotic) {
        spreadVariance = 2 * A_L * v * t;
    } else {
        // eq. (4a) in Gelhar (1986): σ²_L = 2·A_L·I·[vt/I - 1 + exp(-vt/I)]
        spreadVariance = 2 * A_L * I * (vt / I - 1 + Math.exp(-vt / I));
    }

    spreadVariance = Math.max(0, spreadVariance);

    return {
        spreadVariance,
        spreadStd: Math.sqrt(spreadVariance),
        A_L,
        regime: asymptotic ? 'asymptotic' : 'preasymptotic',
    };
}

// ---------------------------------------------------------------------------
// 20. Reliability Index
// ---------------------------------------------------------------------------

/**
 * Reliability index β from Monte Carlo performance function.
 *
 * β = μ_G / σ_G where G = performance_samples - threshold.
 * P(failure) ≈ Φ(-β) where Φ is standard normal CDF.
 * Probability of exceedance computed directly from samples.
 *
 * @param {number[]} performance_samples - Monte Carlo samples of a performance function
 *   (e.g. hydraulic head, breakthrough concentration, plume arrival time)
 * @param {number} threshold - limit state value (failure if sample ≤ threshold)
 * @returns {{
 *   beta: number, pFailure: number, meanG: number, stdG: number, n: number
 * }}
 * @reference Harr, M.E. (1987). Reliability-Based Design in Civil Engineering.
 *   McGraw-Hill, New York. ISBN: 9780070267961
 * @reference Melchers, R.E. (1999). Structural Reliability Analysis and Prediction
 *   (2nd ed.). Wiley. ISBN: 9780471983959
 */
export function computeReliabilityIndex(performance_samples: number[], threshold: number): { beta: number, pFailure: number, meanG: number, stdG: number, n: number } {
    if (!Array.isArray(performance_samples) || performance_samples.length === 0)
        throw new Error('[BCP] Reliability: performance_samples must be non-empty');
    if (typeof threshold !== 'number') throw new Error('[BCP] Reliability: threshold must be a number');

    const G = performance_samples.map((s) => s - threshold);
    const meanG = mean(G);
    const stdG = stddev(G);

    const beta = stdG > 0 ? meanG / stdG : meanG > 0 ? Infinity : -Infinity;

    // Direct Monte Carlo estimate of P(failure) = P(G ≤ 0) = P(performance ≤ threshold)
    const nFail = G.filter((g) => g <= 0).length;
    const pFailure = nFail / G.length;

    return { beta, pFailure, meanG, stdG, n: G.length };
}

console.debug('[BCP:end]', 'app/js/core/analytics/stochasticHydrogeology.js');

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const stochasticHydrogeologyMeta = {
    name: 'stochasticHydrogeology',
    description: 'stochasticHydrogeology',
    category: 'analytics',
    familyTags: ['hydrogeology'],
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
