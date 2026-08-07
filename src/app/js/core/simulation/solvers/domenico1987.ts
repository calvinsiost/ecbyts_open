// SPDX-License-Identifier: AGPL-3.0-only
// Copyright 2026 Calvin Stefan Iost
//
// Domenico (1987) 3-D analytical model for contaminant transport in saturated
// porous media: steady-state and transient solutions with optional first-order
// decay, plume centerline, 2-D footprint, and breakthrough curve.
//
// Academic references:
//   Domenico, P.A. (1987). An analytical model for multidimensional transport
//   of a decaying contaminant species. J. Hydrol. 91(1-2):49-58.
//   DOI: 10.1016/0022-1694(87)90127-2
//
//   Domenico, P.A. & Robbins, G.A. (1985). A new method of contaminant plume
//   analysis. Ground Water 23(4):476-485.
//
//   Wexler, E.J. (1992). Analytical solutions for one-, two-, and
//   three-dimensional solute transport in ground-water systems with uniform
//   flow. USGS Techniques of Water-Resources Investigations 03-B7.
//
//   Bear, J. (1972). Dynamics of Fluids in Porous Media. Dover Publications.
//
//   Gelhar, L.W., Welty, C. & Rehfeldt, K.R. (1992). A critical review of
//   data on field-scale dispersion in aquifers.
//   Water Resour. Res. 28(7):1955-1974.
//
// Governing equations (Domenico 1987, eq. 3 – steady state):
//
//   C(x,y,z) = C0/8 × A(x) × B(x,y) × D(x,z)
//
//   A(x) = exp(x/(2αx) × (1 − √(1 + 4λαx/v))) × erfc(x/(2√(αx·x)))   [λ≥0]
//   B(x,y)= erf((y+Y/2)/(2√(αy·x))) − erf((y−Y/2)/(2√(αy·x)))
//   D(x,z)= erf((z+Z/2)/(2√(αz·x))) − erf((z−Z/2)/(2√(αz·x)))
//
// Transient form (Domenico simplified, as presented in Wexler 1992):
//
//   C(x,y,z,t) = C0/8 × erfc((x − v·t/R)/(2√(αx·x)))
//                       × B(x,y) × D(x,z)
//
// Pure-logic module - no DOM, no IDB, no Three.js - importable in Node.js.

// ---------------------------------------------------------------------------
// Internal: erfc / erf approximation
// ---------------------------------------------------------------------------

/**
 * Complementary error function via Abramowitz & Stegun 7.1.26 rational
 * approximation.  Maximum absolute error: 1.5×10⁻⁷.
 *
 * @param x - argument
 * @returns erfc(x)
 */
function erfc(x: number): number {
    const absX = Math.abs(x);

    // Large-argument asymptotic: avoids exp overflow for high-Péclet terms.
    if (absX > 4) {
        const z2 = absX * absX;
        const val = (Math.exp(-z2) / (absX * Math.sqrt(Math.PI))) * (1 - 1 / (2 * z2));
        return x >= 0 ? val : 2 - val;
    }

    // Abramowitz & Stegun 7.1.26 - max |err| ≤ 1.5×10⁻⁷ for x ≥ 0
    const t = 1 / (1 + 0.3275911 * absX);
    const poly = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
    const erfcPos = poly * Math.exp(-absX * absX);

    return x >= 0 ? erfcPos : 2 - erfcPos;
}

/**
 * Error function derived from erfc.
 *
 * @param x - argument
 * @returns erf(x)
 */
function erf(x: number): number {
    return x >= 0 ? 1 - erfc(x) : erfc(-x) - 1;
}

// ---------------------------------------------------------------------------
// Internal: single-point 3-D Domenico steady-state concentration
// ---------------------------------------------------------------------------

/**
 * Compute C(x, y, z) at a single point using Domenico (1987) steady-state.
 *
 * Longitudinal factor A(x):
 *   Without decay (λ=0): A = erfc(x / (2√(αx·x))) = erfc(√(x/(4αx)))
 *   With decay (λ>0):    A = exp(x/(2αx)·(1 − √(1+4λαx/v))) × erfc(x/(2√(αx·x)))
 *
 * The erfc argument is x/(2√(αx·x)) = √(x)/(2√αx) for x > 0.
 *
 * @param C0 - Source concentration (mg/L)
 * @param x - Longitudinal distance from source (m)
 * @param y - Transverse distance from centreline (m)
 * @param z - Vertical distance from centreline (m)
 * @param alphax - Longitudinal dispersivity (m)
 * @param alphay - Transverse dispersivity (m)
 * @param alphaz - Vertical dispersivity (m)
 * @param Y - Source width in y direction (m)
 * @param Z - Source thickness in z direction (m)
 * @param v - Seepage velocity (m/day)
 * @param lambda - First-order decay coefficient (1/day)
 * @returns Concentration (same units as C0)
 */
function _domenicoConcPoint(C0: number, x: number, y: number, z: number, alphax: number, alphay: number, alphaz: number, Y: number, Z: number, v: number, lambda: number): number {
    if (C0 <= 0) return 0;
    if (x <= 0) return 0; // source is at x=0; concentration field applies for x>0

    // ---- Longitudinal term A(x) ----
    const sqrtAlphaxX = Math.sqrt(alphax * x);
    const erfcArg = x / (2 * sqrtAlphaxX); // = √(x/(4αx))

    let A: number;
    if (lambda <= 0) {
        A = erfc(erfcArg);
    } else {
        // Domenico (1987) eq. 3: decay factor in longitudinal direction
        const ratio = (4 * lambda * alphax) / v;
        const sqrtTerm = Math.sqrt(1 + ratio);
        const exponent = (x / (2 * alphax)) * (1 - sqrtTerm);
        A = (exponent < -700 ? 0 : Math.exp(exponent)) * erfc(erfcArg);
    }

    // ---- Transverse term B(x, y) ----
    const sqrtAlphayX = Math.sqrt(alphay * x);
    const B = erf((y + Y / 2) / (2 * sqrtAlphayX)) - erf((y - Y / 2) / (2 * sqrtAlphayX));

    // ---- Vertical term D(x, z) ----
    const sqrtAlphazX = Math.sqrt(alphaz * x);
    const Dterm = erf((z + Z / 2) / (2 * sqrtAlphazX)) - erf((z - Z / 2) / (2 * sqrtAlphazX));

    const C = (C0 / 8) * A * B * Dterm;
    return Math.max(0, C);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface DomenicoSteadyStateParams {
    C0: number;
    x: number | number[];
    y: number | number[];
    z: number | number[];
    alphax: number;
    alphay: number;
    alphaz: number;
    Y: number;
    Z: number;
    v: number;
    lambda?: number;
}

/**
 * Domenico (1987) 3-D steady-state analytical solution.
 *
 * Computes concentration at one or more points (x, y, z) in a uniformly
 * flowing aquifer from a finite-width, finite-thickness source at x = 0.
 *
 * Supports scalar or array inputs for x, y, z (all same length or all scalar).
 *
 * @param params - model parameters
 * @returns result object with concentration(s)
 */
export function computeDomenicoConcSteadyState(params: DomenicoSteadyStateParams): Readonly<{
    C: number | number[];
    params: Readonly<{ C0: number; alphax: number; alphay: number; alphaz: number; Y: number; Z: number; v: number; lambda: number }>;
    method: string;
}> {
    const { C0, x, y, z, alphax, alphay, alphaz, Y, Z, v, lambda = 0 } = params;

    if (alphax <= 0) throw new RangeError('alphax must be positive');
    if (alphay <= 0) throw new RangeError('alphay must be positive');
    if (alphaz <= 0) throw new RangeError('alphaz must be positive');
    if (v <= 0) throw new RangeError('v must be positive');
    if (Y <= 0) throw new RangeError('Y must be positive');
    if (Z <= 0) throw new RangeError('Z must be positive');

    const isArray = Array.isArray(x);

    let C: number | number[];
    if (isArray) {
        C = x.map((xi, i) => {
            const yi = Array.isArray(y) ? y[i]! : y;
            const zi = Array.isArray(z) ? z[i]! : z;
            return _domenicoConcPoint(C0, xi, yi, zi, alphax, alphay, alphaz, Y, Z, v, lambda);
        });
    } else {
        C = _domenicoConcPoint(
            C0,
            x,
            y as number,
            z as number,
            alphax,
            alphay,
            alphaz,
            Y,
            Z,
            v,
            lambda,
        );
    }

    return Object.freeze({
        C,
        params: Object.freeze({ C0, alphax, alphay, alphaz, Y, Z, v, lambda }),
        method: 'domenico-steady-state',
    });
}

// ---------------------------------------------------------------------------

interface OgataBanksParams {
    C0: number;
    x: number;
    t: number;
    v: number;
    D: number;
    lambda?: number;
    R?: number;
}

/**
 * Ogata-Banks 1-D ADE with optional first-order decay and retardation (R).
 *
 * Equation (Ogata & Banks 1961, extended with decay):
 *   C(x,t) = C0/2 × [ erfc((R·x − v·t) / (2√(D·R·t)))
 *                    + exp(v·x/D) · erfc((R·x + v·t) / (2√(D·R·t))) ]
 *           × exp(−λ·t)
 *
 * Note: D = αx · v / R  when dispersivity is the input instead of D.
 *
 * @param params - model parameters
 * @returns result object with concentration
 */
export function computeDomenicoConc1D(params: OgataBanksParams): Readonly<{
    C: number;
    params: Readonly<{ C0: number; x: number; t: number; v: number; D: number; lambda: number; R: number }>;
    method: string;
}> {
    const { C0, x, t, v, D, lambda = 0, R = 1 } = params;

    if (D <= 0) throw new RangeError('D must be positive');
    if (v < 0) throw new RangeError('v must be non-negative');
    if (R <= 0) throw new RangeError('R must be positive');

    let C: number;
    if (t <= 0 || C0 <= 0) {
        C = 0;
    } else if (x <= 0) {
        C = C0 * Math.exp(-lambda * t);
    } else {
        const sqrtDRt = Math.sqrt(D * R * t);
        const twoSqrt = 2 * sqrtDRt;

        const arg1 = (R * x - v * t) / twoSqrt;
        const arg2 = (R * x + v * t) / twoSqrt;

        const vxD = (v * x) / D;

        // Guard against exp overflow for large Péclet
        let term2: number;
        if (arg2 > 4) {
            const arg2sq = arg2 * arg2;
            const exponent = vxD - arg2sq;
            term2 = exponent < -700 ? 0 : (Math.exp(exponent) / (arg2 * Math.sqrt(Math.PI))) * (1 - 1 / (2 * arg2sq));
        } else {
            term2 = Math.exp(vxD) * erfc(arg2);
        }

        const cNonDecay = (C0 / 2) * (erfc(arg1) + term2);
        C = Math.max(0, Math.min(C0, cNonDecay)) * Math.exp(-lambda * t);
    }

    return Object.freeze({
        C,
        params: Object.freeze({ C0, x, t, v, D, lambda, R }),
        method: 'domenico-1d',
    });
}

// ---------------------------------------------------------------------------

interface PlumeCenterlineParams {
    C0: number;
    alphax: number;
    alphay: number;
    alphaz: number;
    Y: number;
    Z: number;
    v: number;
    lambda?: number;
}

/**
 * Concentration along the plume centreline (y = 0, z = 0) at multiple x.
 *
 * Also returns approximate positions where C drops to 10% and 1% of C0
 * by linear interpolation along xArray.
 *
 * @param params - model parameters
 * @param xArray - Longitudinal positions (m)
 * @returns result object with centerline concentrations and threshold distances
 */
export function computePlumeCenterline(params: PlumeCenterlineParams, xArray: number[]): Readonly<{
    x: number[];
    C: number[];
    maxC: number;
    x_at_10percent: number | null;
    x_at_1percent: number | null;
}> {
    const { C0, alphax, alphay, alphaz, Y, Z, v, lambda = 0 } = params;

    const concentrations = xArray.map((xi) =>
        _domenicoConcPoint(C0, xi, 0, 0, alphax, alphay, alphaz, Y, Z, v, lambda),
    );

    const maxC = Math.max(...concentrations);

    /**
     * Linear interpolation to find x where C falls below a threshold fraction.
     * Searches from the peak outward (after x of peak).
     *
     * @param fraction - threshold fraction of C0
     * @returns interpolated x position or null
     */
    function findThreshold(fraction: number): number | null {
        const threshold = C0 * fraction;
        // find peak index
        let peakIdx = 0;
        for (let i = 1; i < concentrations.length; i++) {
            if (concentrations[i]! > concentrations[peakIdx]!) peakIdx = i;
        }
        // search after peak for drop below threshold
        for (let i = peakIdx; i < concentrations.length - 1; i++) {
            if (concentrations[i]! >= threshold && concentrations[i + 1]! < threshold) {
                // linear interpolation
                const dC = concentrations[i + 1]! - concentrations[i]!;
                const dx = xArray[i + 1]! - xArray[i]!;
                if (Math.abs(dC) < 1e-30) return xArray[i]!;
                return xArray[i]! + (threshold - concentrations[i]!) * (dx / dC);
            }
        }
        return null;
    }

    return Object.freeze({
        x: xArray,
        C: concentrations,
        maxC,
        x_at_10percent: findThreshold(0.1),
        x_at_1percent: findThreshold(0.01),
    });
}

// ---------------------------------------------------------------------------

interface FootprintOptions {
    nx?: number;
    ny?: number;
    xMax: number;
    yMax: number;
}

/**
 * Compute a 2-D horizontal footprint of the plume at z = 0.
 *
 * Returns a grid[i][j] = C(xArray[i], yArray[j]) plus summary statistics.
 *
 * @param params - Same as computeDomenicoConcSteadyState
 * @param options - grid options
 * @returns result object with grid and summary statistics
 */
export function computePlumeFootprint(params: PlumeCenterlineParams, { nx = 50, ny = 50, xMax, yMax }: FootprintOptions): Readonly<{
    grid: number[][];
    xArray: number[];
    yArray: number[];
    maxC: number;
    plumeLengthAt10pct: number | null;
    plumeWidthAt10pct: number | null;
}> {
    const { C0, alphax, alphay, alphaz, Y, Z, v, lambda = 0 } = params;

    if (xMax <= 0) throw new RangeError('xMax must be positive');
    if (yMax <= 0) throw new RangeError('yMax must be positive');

    // Build coordinate arrays (avoid x=0 to prevent division issues)
    const xArray = Array.from({ length: nx }, (_, i) => (xMax * (i + 1)) / nx);
    const yArray = Array.from({ length: ny }, (_, j) => -yMax + (2 * yMax * j) / (ny - 1));

    let maxC = 0;
    const grid = xArray.map((xi) => {
        return yArray.map((yj) => {
            const c = _domenicoConcPoint(C0, xi, yj, 0, alphax, alphay, alphaz, Y, Z, v, lambda);
            if (c > maxC) maxC = c;
            return c;
        });
    });

    // Plume length: furthest x on centreline (y=0 col) above 10% threshold
    const threshold = C0 * 0.1;
    let plumeLengthAt10pct: number | null = null;
    const yMidIdx = Math.floor(ny / 2); // closest to y=0
    for (let i = nx - 1; i >= 0; i--) {
        if (grid[i]![yMidIdx]! >= threshold) {
            plumeLengthAt10pct = xArray[i]!;
            break;
        }
    }

    // Plume width: maximum y-extent at x giving max centreline concentration
    let plumeWidthAt10pct: number | null = null;
    // find x index with highest C on centreline
    let bestXIdx = 0;
    for (let i = 1; i < nx; i++) {
        if (grid[i]![yMidIdx]! > grid[bestXIdx]![yMidIdx]!) bestXIdx = i;
    }
    // scan outward from centre at that x
    let halfWidthIdx = 0;
    for (let j = yMidIdx; j < ny; j++) {
        if (grid[bestXIdx]![j]! >= threshold) halfWidthIdx = j;
        else break;
    }
    if (halfWidthIdx > 0) {
        plumeWidthAt10pct = 2 * Math.abs(yArray[halfWidthIdx]!);
    }

    return Object.freeze({
        grid,
        xArray,
        yArray,
        maxC,
        plumeLengthAt10pct,
        plumeWidthAt10pct,
    });
}

// ---------------------------------------------------------------------------

/**
 * Estimate dispersivity parameters using Gelhar et al. (1992) empirical rules.
 *
 * Heuristics (field-scale):
 *   αx ≈ 0.1 × L          (longitudinal)
 *   αy ≈ 0.1 × αx = 0.01 × L (transverse)
 *   αz ≈ 0.05 × αy = 0.0005 × L (vertical)
 *
 * Reference: Gelhar, L.W., Welty, C. & Rehfeldt, K.R. (1992).
 *   A critical review of data on field-scale dispersion in aquifers.
 *   Water Resour. Res. 28(7):1955-1974.
 *
 * @param params - plume parameters
 * @returns estimated dispersivities
 */
// eslint-disable-next-line
export function estimatePlumeParameters({ plumeLength_m, aquiferThickness_m }: { plumeLength_m: number; aquiferThickness_m?: number }): Readonly<{
    alphax: number;
    alphay: number;
    alphaz: number;
    method: string;
}> {
    if (plumeLength_m <= 0) throw new RangeError('plumeLength_m must be positive');

    const alphax = 0.1 * plumeLength_m;
    const alphay = 0.1 * alphax; // = 0.01 × L
    const alphaz = 0.05 * alphay; // = 0.0005 × L

    return Object.freeze({
        alphax,
        alphay,
        alphaz,
        method: 'gelhar-empirical',
    });
}

// ---------------------------------------------------------------------------

interface BreakthroughParams {
    C0: number;
    x: number;
    y: number;
    z: number;
    alphax: number;
    alphay: number;
    alphaz: number;
    Y: number;
    Z: number;
    v: number;
    R?: number;
    lambda?: number;
}

/**
 * Compute breakthrough curve C(x, y, z, t) over an array of times using the
 * Domenico simplified transient equation:
 *
 *   C(x,y,z,t) = C0/8 × erfc((x − v·t/R) / (2√(αx·x)))
 *                       × B(x,y) × D(x,z)  × exp(−λ·t)
 *
 * Note: The Domenico transient model is a simplification; it uses the
 * steady-state spatial terms B and D while only modifying the longitudinal
 * erfc with a time-dependent argument.  It is known to overestimate
 * concentrations at early times (see Srinivasan et al. 2007 for discussion).
 *
 * @param params - model parameters
 * @param tArray - Array of times (days)
 * @returns result object with breakthrough curve
 */
export function computeBreakthroughCurve(params: BreakthroughParams, tArray: number[]): Readonly<{
    t: number[];
    C: number[];
    tPeak: number;
    CPeak: number;
    method: string;
}> {
    const { C0, x, y, z, alphax, alphay, alphaz, Y, Z, v, R = 1, lambda = 0 } = params;

    if (alphax <= 0) throw new RangeError('alphax must be positive');
    if (alphay <= 0) throw new RangeError('alphay must be positive');
    if (alphaz <= 0) throw new RangeError('alphaz must be positive');
    if (v <= 0) throw new RangeError('v must be positive');
    if (x <= 0) throw new RangeError('x must be positive for breakthrough curve');
    if (R <= 0) throw new RangeError('R must be positive');

    const sqrtAlphaxX = Math.sqrt(alphax * x);
    const sqrtAlphayX = Math.sqrt(alphay * x);
    const sqrtAlphazX = Math.sqrt(alphaz * x);

    // Spatial B and D terms (steady-state - same for all t in Domenico model)
    const B = erf((y + Y / 2) / (2 * sqrtAlphayX)) - erf((y - Y / 2) / (2 * sqrtAlphayX));
    const Dterm = erf((z + Z / 2) / (2 * sqrtAlphazX)) - erf((z - Z / 2) / (2 * sqrtAlphazX));

    const concentrations = tArray.map((ti) => {
        if (ti <= 0 || C0 <= 0) return 0;

        // Time-dependent longitudinal erfc argument
        const arg = (x - (v * ti) / R) / (2 * sqrtAlphaxX);
        const A = erfc(arg);

        const decayFactor = lambda > 0 ? Math.exp(-lambda * ti) : 1;
        return Math.max(0, (C0 / 8) * A * B * Dterm * decayFactor);
    });

    // Find peak
    let tPeak = tArray[0]!;
    let CPeak = concentrations[0] ?? 0;
    for (let i = 1; i < concentrations.length; i++) {
        if (concentrations[i]! > CPeak) {
            CPeak = concentrations[i]!;
            tPeak = tArray[i]!;
        }
    }

    return Object.freeze({
        t: tArray,
        C: concentrations,
        tPeak,
        CPeak,
        method: 'domenico-transient',
    });
}
