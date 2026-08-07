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
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Trend Surface Analysis — regional polynomial trend by Ordinary Least Squares.
 *
 * Fits a smooth polynomial surface z = f(x, y) to irregularly-spaced (scattered)
 * observations by minimising the sum of squared residuals. The regional "trend"
 * isolates the broad-scale spatial structure (e.g. a regional groundwater
 * gradient, a basin-wide contaminant decline) from local anomalies, which appear
 * in the residual field. Residuals are the natural input to a subsequent
 * variogram / kriging step (residual kriging = kriging with a trend).
 *
 * This is DISTINCT from `io/geo/polynomialSolver.ts`, which fits a coordinate
 * *transform* (pixel → world) mapping two outputs (X, Y) from ground-control
 * points. Here we fit a single SCALAR attribute surface and report inferential
 * goodness-of-fit (R², adjusted R², global F-test, and the incremental F-test
 * between successive polynomial orders) — the canonical trend-surface workflow.
 *
 * Supported orders:
 *   - order 1 (planar):    z = b0 + b1·x + b2·y                       (3 terms)
 *   - order 2 (quadratic): z = b0 + b1·x + b2·y + b3·x² + b4·xy + b5·y² (6 terms)
 *
 * Numerical method: normal equations Aᵀ·A·β = Aᵀ·z solved by Gauss-Jordan with
 * partial pivoting. Coordinates are centred on their mean before building the
 * design matrix to reduce the condition number of AᵀA (standard practice for
 * polynomial regression — Davis 2002, §5.4); fitted values and residuals are
 * invariant to this re-centring, and `predict()` re-applies the same shift.
 *
 * Referências acadêmicas:
 *   - Krumbein, W.C. (1959). "Trend surface analysis of contour-type maps with
 *     irregular control-point spacing." Journal of Geophysical Research, 64(7),
 *     pp. 823–834. DOI: 10.1029/JZ064i007p00823
 *   - Davis, J.C. (2002). Statistics and Data Analysis in Geology (3rd ed.),
 *     Chapter 5 (Trend surfaces), pp. 416–442. John Wiley & Sons.
 *     ISBN: 978-0-471-17275-8
 *   - Agterberg, F.P. (1974). Geomathematics: Mathematical Background and
 *     Geo-Science Applications. Elsevier. ISBN: 978-0-444-41164-9
 *   - Unwin, D.J. (1975). "An Introduction to Trend Surface Analysis."
 *     CATMOG 5, Geo Abstracts, University of East Anglia.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrendPoint {
    x: number;
    y: number;
    z: number;
}

export type TrendOrder = 1 | 2;

export interface TrendSurfaceResult {
    /** Polynomial order actually fitted. */
    readonly order: TrendOrder;
    /** Number of observations. */
    readonly n: number;
    /** Number of estimated parameters (terms): 3 for order 1, 6 for order 2. */
    readonly p: number;
    /**
     * Coefficients in the CENTRED basis, ordered to match the design matrix:
     *   order 1: [b0, b1(x'), b2(y')]
     *   order 2: [b0, b1(x'), b2(y'), b3(x'²), b4(x'y'), b5(y'²)]
     * where x' = x − meanX, y' = y − meanY. Use `predict()` for raw coords.
     */
    readonly coefficients: ReadonlyArray<number>;
    /** Mean of input x / y used for centring (needed by predict). */
    readonly meanX: number;
    readonly meanY: number;
    /** Fitted surface value at each input point (raw-coordinate aligned). */
    readonly fitted: ReadonlyArray<number>;
    /** Residual z − fitted at each input point. */
    readonly residuals: ReadonlyArray<number>;
    /** Total / regression / residual sums of squares. */
    readonly ssTotal: number;
    readonly ssRegression: number;
    readonly ssResidual: number;
    /** Coefficient of determination R² = SS_reg / SS_total ∈ [0, 1]. */
    readonly rSquared: number;
    /** Adjusted R² penalising parameter count (can be negative). */
    readonly adjustedRSquared: number;
    /** Global F-statistic for H0: all non-intercept coefficients = 0. */
    readonly fStatistic: number;
    /** Regression / residual degrees of freedom for the global F-test. */
    readonly dfRegression: number;
    readonly dfResidual: number;
    /** Root-mean-square error = sqrt(SS_residual / n). */
    readonly rmse: number;
    readonly interpretation: string;
}

export interface IncrementalFResult {
    /** Incremental F-statistic comparing order 2 (full) vs order 1 (reduced). */
    readonly fStatistic: number;
    readonly dfNumerator: number;
    readonly dfDenominator: number;
    /** Extra variance explained by the quadratic terms: R²(2) − R²(1). */
    readonly deltaRSquared: number;
    readonly interpretation: string;
}

// ---------------------------------------------------------------------------
// Internal helpers (not exported)
// ---------------------------------------------------------------------------

const EPS = 1e-12;

/** Number of polynomial terms for a given order. */
function termCount(order: TrendOrder): number {
    return order === 1 ? 3 : 6;
}

/**
 * Per-point design row in the centred basis.
 *   order 1: [1, x', y']
 *   order 2: [1, x', y', x'², x'y', y'²]
 */
function designRow(order: TrendOrder, xc: number, yc: number): number[] {
    if (order === 1) return [1, xc, yc];
    return [1, xc, yc, xc * xc, xc * yc, yc * yc];
}

/**
 * Solve A·β = b for an N×N matrix via Gauss-Jordan with partial pivoting.
 * @throws {RangeError} if the matrix is singular (|pivot| < EPS).
 */
function solveLinearSystem(A: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<number>): number[] {
    const N = A.length;
    const M: number[][] = new Array(N);
    for (let i = 0; i < N; i++) {
        const row = new Array<number>(N + 1);
        const src = A[i] as ReadonlyArray<number>;
        for (let j = 0; j < N; j++) row[j] = src[j] as number;
        row[N] = b[i] as number;
        M[i] = row;
    }

    for (let i = 0; i < N; i++) {
        let pivotRow = i;
        let pivotVal = Math.abs((M[i] as number[])[i] as number);
        for (let k = i + 1; k < N; k++) {
            const cand = Math.abs((M[k] as number[])[i] as number);
            if (cand > pivotVal) {
                pivotRow = k;
                pivotVal = cand;
            }
        }
        if (pivotVal < EPS) {
            throw new RangeError(
                'trendSurfaceAnalysis: singular normal matrix (points collinear or insufficient spatial spread for the requested order)',
            );
        }
        if (pivotRow !== i) {
            const tmp = M[i] as number[];
            M[i] = M[pivotRow] as number[];
            M[pivotRow] = tmp;
        }
        const Mi = M[i] as number[];
        const pivot = Mi[i] as number;
        for (let j = i; j <= N; j++) Mi[j] = (Mi[j] as number) / pivot;
        for (let k = 0; k < N; k++) {
            if (k === i) continue;
            const Mk = M[k] as number[];
            const factor = Mk[i] as number;
            if (factor === 0) continue;
            for (let j = i; j <= N; j++) Mk[j] = (Mk[j] as number) - factor * (Mi[j] as number);
        }
    }

    const x = new Array<number>(N);
    for (let i = 0; i < N; i++) x[i] = (M[i] as number[])[N] as number;
    return x;
}

function classifyFit(r2: number): string {
    if (r2 >= 0.9) return 'very strong regional trend';
    if (r2 >= 0.7) return 'strong regional trend';
    if (r2 >= 0.4) return 'moderate regional trend';
    if (r2 >= 0.1) return 'weak regional trend';
    return 'negligible regional trend (field is dominated by local variation/noise)';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fit a polynomial trend surface of the given order by Ordinary Least Squares.
 *
 * @param points Scattered observations {x, y, z}; need ≥ p+1 with non-collinear
 *   spatial layout (p = 3 for order 1, 6 for order 2) for a well-posed fit and
 *   ≥ 1 residual degree of freedom.
 * @param order  1 (planar) or 2 (quadratic). Defaults to 1.
 * @throws {TypeError}  if `points` is not an array.
 * @throws {RangeError} on too few points, non-finite values, or a singular
 *   (rank-deficient) normal matrix.
 */
export function fitTrendSurface(
    points: ReadonlyArray<TrendPoint>,
    order: TrendOrder = 1,
): Readonly<TrendSurfaceResult> {
    if (!Array.isArray(points)) {
        throw new TypeError('fitTrendSurface: points must be an array');
    }
    if (order !== 1 && order !== 2) {
        throw new RangeError(`fitTrendSurface: order must be 1 or 2, got ${order}`);
    }
    const n = points.length;
    const p = termCount(order);
    if (n < p + 1) {
        throw new RangeError(
            `fitTrendSurface: need at least ${p + 1} points for order ${order} (got ${n}); ` +
                'a residual degree of freedom is required for the F-test',
        );
    }

    // Centre coordinates on their mean to condition AᵀA (Davis 2002 §5.4).
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
        const pt = points[i] as TrendPoint;
        if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y) || !Number.isFinite(pt.z)) {
            throw new RangeError(`fitTrendSurface: non-finite coordinate or value at index ${i}`);
        }
        sumX += pt.x;
        sumY += pt.y;
    }
    const meanX = sumX / n;
    const meanY = sumY / n;

    // Build design matrix A (n×p) and response z.
    const A: number[][] = new Array(n);
    const z: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const pt = points[i] as TrendPoint;
        A[i] = designRow(order, pt.x - meanX, pt.y - meanY);
        z[i] = pt.z;
    }

    // Normal equations: (AᵀA) β = Aᵀz.
    const AtA: number[][] = new Array(p);
    const Atz: number[] = new Array(p).fill(0);
    for (let r = 0; r < p; r++) {
        AtA[r] = new Array<number>(p).fill(0);
    }
    for (let i = 0; i < n; i++) {
        const row = A[i] as number[];
        const zi = z[i] as number;
        for (let r = 0; r < p; r++) {
            const ar = row[r] as number;
            Atz[r] = (Atz[r] as number) + ar * zi;
            const AtAr = AtA[r] as number[];
            for (let c = r; c < p; c++) {
                AtAr[c] = (AtAr[c] as number) + ar * (row[c] as number);
            }
        }
    }
    // Mirror the symmetric lower triangle.
    for (let r = 0; r < p; r++) {
        for (let c = 0; c < r; c++) {
            (AtA[r] as number[])[c] = (AtA[c] as number[])[r] as number;
        }
    }

    const coefficients = solveLinearSystem(AtA, Atz);

    // Fitted values, residuals, sums of squares.
    let zMean = 0;
    for (let i = 0; i < n; i++) zMean += z[i] as number;
    zMean /= n;

    const fitted = new Array<number>(n);
    const residuals = new Array<number>(n);
    let ssResidual = 0;
    let ssTotal = 0;
    for (let i = 0; i < n; i++) {
        const row = A[i] as number[];
        let yi = 0;
        for (let r = 0; r < p; r++) yi += (coefficients[r] as number) * (row[r] as number);
        fitted[i] = yi;
        const res = (z[i] as number) - yi;
        residuals[i] = res;
        ssResidual += res * res;
        const dt = (z[i] as number) - zMean;
        ssTotal += dt * dt;
    }
    const ssRegression = ssTotal - ssResidual;

    const dfRegression = p - 1; // exclude intercept
    const dfResidual = n - p;
    const rSquared = ssTotal > EPS ? Math.max(0, Math.min(1, ssRegression / ssTotal)) : 0;
    const adjustedRSquared =
        dfResidual > 0 && ssTotal > EPS ? 1 - (ssResidual / dfResidual) / (ssTotal / (n - 1)) : 0;

    // Global F = (SS_reg / df_reg) / (SS_res / df_res).
    const msRes = dfResidual > 0 ? ssResidual / dfResidual : 0;
    const fStatistic =
        dfRegression > 0 && msRes > EPS ? (ssRegression / dfRegression) / msRes : 0;
    const rmse = Math.sqrt(ssResidual / n);

    return Object.freeze({
        order,
        n,
        p,
        coefficients: Object.freeze(coefficients.slice()),
        meanX,
        meanY,
        fitted: Object.freeze(fitted),
        residuals: Object.freeze(residuals),
        ssTotal,
        ssRegression,
        ssResidual,
        rSquared,
        adjustedRSquared,
        fStatistic,
        dfRegression,
        dfResidual,
        rmse,
        interpretation: classifyFit(rSquared),
    });
}

/**
 * Evaluate a fitted trend surface at an arbitrary RAW coordinate (x, y).
 * Re-applies the same mean-centring used during the fit.
 */
export function predictTrendSurface(
    model: Pick<TrendSurfaceResult, 'order' | 'coefficients' | 'meanX' | 'meanY'>,
    x: number,
    y: number,
): number {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new RangeError('predictTrendSurface: x and y must be finite');
    }
    const row = designRow(model.order, x - model.meanX, y - model.meanY);
    const coef = model.coefficients;
    let yi = 0;
    for (let r = 0; r < row.length; r++) yi += (coef[r] as number) * (row[r] as number);
    return yi;
}

/**
 * Incremental (partial) F-test comparing a 2nd-order (full) trend surface
 * against the nested 1st-order (reduced) surface fitted on the SAME points.
 *
 * F = [(SS_res,1 − SS_res,2) / (p2 − p1)] / [SS_res,2 / (n − p2)]
 *
 * Tests H0: the quadratic terms (x², xy, y²) add no explanatory power
 * (Davis 2002 §5.4 — significance of successive polynomial orders).
 *
 * @throws {RangeError} if there are too few points for an order-2 fit with a
 *   residual degree of freedom (n ≥ 7).
 */
export function incrementalFTest(points: ReadonlyArray<TrendPoint>): Readonly<IncrementalFResult> {
    const reduced = fitTrendSurface(points, 1);
    const full = fitTrendSurface(points, 2);

    const dfNumerator = full.p - reduced.p; // 6 − 3 = 3
    const dfDenominator = full.dfResidual; // n − 6
    const numerator = (reduced.ssResidual - full.ssResidual) / dfNumerator;
    const denominator = full.ssResidual / dfDenominator;
    // Tolerance is relative to the data's total variance, not an absolute floor:
    // a perfectly-fitting full model (denominator → 0) with a non-trivial reduced
    // residual yields an unbounded F (the quadratic terms explain everything),
    // which we report as +∞. When BOTH models fit perfectly (numerator → 0 too,
    // e.g. a constant or planar field) the added terms explain nothing → F = 0.
    const tol = EPS * Math.max(1, full.ssTotal);
    let fStatistic: number;
    if (denominator > tol) {
        fStatistic = numerator / denominator;
    } else if (numerator > tol) {
        fStatistic = Infinity;
    } else {
        fStatistic = 0;
    }
    const deltaRSquared = full.rSquared - reduced.rSquared;

    const interpretation =
        fStatistic >= 2.5
            ? 'quadratic terms add meaningful structure — prefer order 2'
            : 'quadratic terms add little — the planar (order 1) trend is adequate';

    return Object.freeze({
        fStatistic,
        dfNumerator,
        dfDenominator,
        deltaRSquared,
        interpretation,
    });
}
