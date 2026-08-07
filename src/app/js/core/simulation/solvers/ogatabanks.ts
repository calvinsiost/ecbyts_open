// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Calvin Stefan Iost
//
// Ogata-Banks (1961) 1D Advection-Dispersion Equation (ADE) analytical solver.
//
// Academic reference:
//   Ogata, A. & Banks, R.B. (1961) "A solution of the differential equation of
//   longitudinal dispersion in porous media", USGS Professional Paper 411-A,
//   United States Geological Survey.
//   https://pubs.usgs.gov/pp/0411a/report.pdf
//
// Governing equation:  ∂C/∂t = D·∂²C/∂x² − v·∂C/∂x
// Boundary/initial conditions:
//   C(0,t) = C₀  for t > 0  (step input)
//   C(x,0) = 0   for x > 0  (clean medium)
//   C(∞,t) = 0              (infinite domain)
//
// Analytical solution (eq. A3, Ogata & Banks 1961):
//   C(x,t) = (C₀/2) × [ erfc((x − v·t)/(2√(D·t)))
//                       + exp(v·x/D) · erfc((x + v·t)/(2√(D·t))) ]
//
// Pure-logic module - no DOM, no IDB, no Three.js - importable in Node.js.

// ---------------------------------------------------------------------------
// Internal: erfc approximation
// ---------------------------------------------------------------------------

/**
 * Complementary error function via Abramowitz & Stegun 7.1.26 rational
 * approximation.  Maximum absolute error: 1.5×10⁻⁷.
 *
 * @param x - Input
 * @returns erfc(x)
 */
function erfc(x: number): number {
    const absX = Math.abs(x);

    // Large-argument approximation: erfc(z) ≈ exp(−z²)/(z√π)·(1 − 1/(2z²))
    // Avoids overflow when computing exp(vx/D)·erfc(large z) for high Peclet.
    if (absX > 4) {
        const z2 = absX * absX;
        const val = (Math.exp(-z2) / (absX * Math.sqrt(Math.PI))) * (1 - 1 / (2 * z2));
        return x >= 0 ? val : 2 - val;
    }

    // Abramowitz & Stegun 7.1.26 - valid for x ≥ 0 with max |err| ≤ 1.5×10⁻⁷
    const t = 1 / (1 + 0.3275911 * absX);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erfcPos = poly * Math.exp(-absX * absX);

    return x >= 0 ? erfcPos : 2 - erfcPos;
}

// ---------------------------------------------------------------------------
// Internal: single-point Ogata-Banks concentration
// ---------------------------------------------------------------------------

/**
 * Compute C(x, t) for the Ogata-Banks step-input ADE solution.
 *
 * Handles numerical edge cases:
 *   - t = 0  → C = 0 (initial condition)
 *   - x = 0  → C = C₀ for t > 0 (boundary condition)
 *   - Large Peclet: second term uses large-z erfc to prevent exp overflow.
 *
 * @param c0 - Source concentration (mass/volume)
 * @param v - Average linear velocity (m/day)
 * @param D - Hydrodynamic dispersion coefficient (m²/day)
 * @param x - Distance from source (m)
 * @param t - Time (days)
 * @returns Concentration at (x, t)
 */
function _concentration(c0: number, v: number, D: number, x: number, t: number): number {
    if (t === 0) return 0;
    if (x === 0) return c0;

    const sqrtDt = Math.sqrt(D * t);
    const twoSqrtDt = 2 * sqrtDt;

    // First term argument: (x − v·t) / (2√(Dt))
    const arg1 = (x - v * t) / twoSqrtDt;

    // Second term argument: (x + v·t) / (2√(Dt))
    const arg2 = (x + v * t) / twoSqrtDt;

    // exp(v·x/D) can overflow for large Peclet; use combined approximation.
    // When arg2 > 4, use large-argument asymptotic erfc directly via erfc().
    // erfc() itself switches to the asymptotic form for |z| > 4, so the
    // combined product exp(vx/D)·erfc(arg2) is computed as:
    //   exp(vx/D − arg2²) / (arg2·√π) · (1 − 1/(2·arg2²))
    // which avoids exp overflow.
    let term2: number;
    const vxD = (v * x) / D;
    if (arg2 > 4) {
        // Rewrite: exp(vx/D)·erfc(arg2) = exp(vx/D − arg2²)/(arg2·√π)·(1 − 1/(2·arg2²))
        // arg2² = (x + v·t)² / (4·D·t)
        const arg2sq = arg2 * arg2;
        const exponent = vxD - arg2sq;
        if (exponent < -700) {
            term2 = 0; // underflow — negligible contribution
        } else {
            term2 = (Math.exp(exponent) / (arg2 * Math.sqrt(Math.PI))) * (1 - 1 / (2 * arg2sq));
        }
    } else {
        term2 = Math.exp(vxD) * erfc(arg2);
    }

    const c = (c0 / 2) * (erfc(arg1) + term2);

    // Clamp to [0, c0] to prevent tiny numerical negatives
    return Math.max(0, Math.min(c0, c));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface OgataBanksParams {
    c0: number;
    v: number;
    D: number;
    distances: number[];
    times: number[];
}

interface OgataBanksCell {
    x: number;
    t: number;
    c: number;
    cNorm: number;
}

interface OgataBanksResult {
    profile: ReadonlyArray<ReadonlyArray<Readonly<OgataBanksCell>>>;
    pecletNumbers: readonly number[];
    metadata: Readonly<{
        c0: number;
        v: number;
        D: number;
        nDistances: number;
        nTimes: number;
        equation: string;
    }>;
}

/**
 * Solve Ogata-Banks 1D ADE for arrays of distances and times.
 *
 * @param params - Solver parameters
 * @returns Immutable result with profile, Peclet numbers and metadata
 */
export function solveOgataBanks({ c0, v, D, distances, times }: OgataBanksParams): Readonly<OgataBanksResult> {
    if (D <= 0) throw new RangeError('D must be positive');
    if (v < 0) throw new RangeError('v must be non-negative');

    const profile = distances.map((x) => {
        const timeSeries = times.map((t) => {
            const c = _concentration(c0, v, D, x, t);
            const cNorm = c0 > 0 ? c / c0 : 0;
            return Object.freeze({ x, t, c, cNorm });
        });
        return Object.freeze(timeSeries);
    });

    const pecletNumbers = distances.map((x) => (v * x) / D);

    const metadata = Object.freeze({
        c0,
        v,
        D,
        nDistances: distances.length,
        nTimes: times.length,
        equation: 'Ogata-Banks-1961',
    });

    return Object.freeze({ profile, pecletNumbers, metadata });
}

interface PecletParams {
    v: number;
    D: number;
    L: number;
}

interface PecletResult {
    peclet: number;
    regime: string;
}

/**
 * Compute the Peclet number and transport regime for a given domain length.
 *
 * Pe = v·L / D
 *   > 10  → advection_dominated
 *   < 0.1 → diffusion_dominated
 *   else  → mixed
 *
 * @param params - Parameters
 * @returns Peclet number and regime
 */
export function computePecletNumber({ v, D, L }: PecletParams): Readonly<PecletResult> {
    const peclet = (v * L) / D;
    let regime: string;
    if (peclet > 10) {
        regime = 'advection_dominated';
    } else if (peclet < 0.1) {
        regime = 'diffusion_dominated';
    } else {
        regime = 'mixed';
    }
    return Object.freeze({ peclet, regime });
}

interface BreakthroughParams {
    x: number;
    v: number;
    D: number;
    c0: number;
    threshold?: number;
}

interface BreakthroughResult {
    tBreakthrough: number;
    cAtBreakthrough: number;
    peclet: number;
}

/**
 * Find the time at which C(x, t)/C₀ first reaches a threshold fraction
 * using bisection search.
 *
 * @param params - Parameters
 * @returns Breakthrough time, concentration and Peclet number
 */
export function computeBreakthroughTime({ x, v, D, c0, threshold = 0.5 }: BreakthroughParams): Readonly<BreakthroughResult> {
    const peclet = (v * x) / D;

    // Upper bound for bisection: 1000× advective travel time (or fallback if v=0)
    const tAdv = v > 0 ? x / v : (x * x) / D; // advective or diffusive timescale
    const tMax = 1000 * tAdv;

    // Check if threshold is ever reached
    const cMax = _concentration(c0, v, D, x, tMax);
    if (cMax / c0 < threshold) {
        return Object.freeze({ tBreakthrough: NaN, cAtBreakthrough: cMax, peclet });
    }

    // Bisection: find t such that C(x,t)/C₀ = threshold
    let lo = 0;
    let hi = tMax;
    const maxIter = 200;
    const relTol = 1e-8;

    for (let i = 0; i < maxIter; i++) {
        const mid = (lo + hi) / 2;
        const cMid = _concentration(c0, v, D, x, mid);
        const fMid = cMid / c0 - threshold;

        if (Math.abs(hi - lo) / Math.max(1, hi) < relTol) break;

        if (fMid < 0) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const tBreakthrough = (lo + hi) / 2;
    const cAtBreakthrough = _concentration(c0, v, D, x, tBreakthrough);
    return Object.freeze({ tBreakthrough, cAtBreakthrough, peclet });
}
