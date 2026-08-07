// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Polynomial 2D (2nd order) Solver — 12-parameter GCP georeferencing math.
 *
 * Phase 2 of SPEC_G3_RASTER_UPLOAD_GEOREF (P1-7): pure math, no DOM/canvas.
 *
 * Solves the over-determined least-squares system for the 2nd-order
 * polynomial transform (6 coefficients per axis = 12 parameters total):
 *
 *     worldX = ax0 + ax1·pixelX + ax2·pixelY + ax3·pixelX² + ax4·pixelX·pixelY + ax5·pixelY²
 *     worldY = ay0 + ay1·pixelX + ay2·pixelY + ay3·pixelX² + ay4·pixelX·pixelY + ay5·pixelY²
 *
 * With N GCPs (N ≥ 6) we build the over-determined 2N×12 system and
 * solve via the normal equations. The 12×12 system separates into two
 * 6×6 systems with the same matrix (one for X, one for Y) — same A^T·A,
 * different right-hand sides.
 *
 * Reference: GDAL `gdal_translate` / `gdalwarp` (`-order 2`) — canonical
 * implementation following Wolberg (1990) "Digital Image Warping" IEEE
 * Press, ISBN 978-0-8186-8944-4, ch. 3.4. Also Orfeo Toolbox
 * `otb::PolynomialRSTransform` (2nd order).
 *
 * Use: raster georeferencing under moderate lens distortion (non-
 * orthorectified aerial photos, scanned legacy maps with non-linear
 * deformation, low-altitude satellite imagery). ≥10 well-distributed
 * GCPs are recommended to avoid edge over-fit.
 */

export interface GroundControlPoint {
    readonly pixelX: number;
    readonly pixelY: number;
    readonly worldX: number;
    readonly worldY: number;
}

export interface PolynomialResidual {
    readonly dx: number;
    readonly dy: number;
    readonly d: number;
}

export interface Polynomial2D {
    readonly ax: ReadonlyArray<number>;
    readonly ay: ReadonlyArray<number>;
    readonly rmse: number;
    readonly residuals: ReadonlyArray<PolynomialResidual>;
}

export interface Polynomial2DCoefficients {
    readonly ax: ReadonlyArray<number>;
    readonly ay: ReadonlyArray<number>;
}

export interface PolynomialWorldPoint {
    readonly worldX: number;
    readonly worldY: number;
}

// ----------------------------------------------------------------
// internal: linear solve NxN via Gauss-Jordan with partial pivoting
// ----------------------------------------------------------------

/**
 * Solve A·x = b for an NxN matrix A and Nx1 vector b, returning x.
 * Partial pivoting for numerical stability. Throws RangeError if the
 * matrix is singular (|pivot| < EPS).
 */
function solveLinearSystem(A: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<number>): number[] {
    const N = A.length;
    // augmented matrix [A | b] — deep copy
    const M: number[][] = new Array(N);
    for (let i = 0; i < N; i++) {
        const row = new Array<number>(N + 1);
        const sourceRow = A[i] as ReadonlyArray<number>;
        for (let j = 0; j < N; j++) row[j] = sourceRow[j] as number;
        row[N] = b[i] as number;
        M[i] = row;
    }
    const EPS = 1e-12;

    for (let i = 0; i < N; i++) {
        // partial pivoting
        let pivotRow = i;
        const Mi = M[i] as number[];
        let pivotVal = Math.abs(Mi[i] as number);
        for (let k = i + 1; k < N; k++) {
            const candidate = Math.abs((M[k] as number[])[i] as number);
            if (candidate > pivotVal) {
                pivotRow = k;
                pivotVal = candidate;
            }
        }
        if (pivotVal < EPS) {
            throw new RangeError('polynomialSolver: singular normal matrix (GCPs degenerate or collinear)');
        }
        if (pivotRow !== i) {
            const tmp = M[i] as number[];
            M[i] = M[pivotRow] as number[];
            M[pivotRow] = tmp;
        }
        // normalize pivot row
        const Mi2 = M[i] as number[];
        const pivot = Mi2[i] as number;
        for (let j = i; j <= N; j++) Mi2[j] = (Mi2[j] as number) / pivot;
        // eliminate other rows
        for (let k = 0; k < N; k++) {
            if (k === i) continue;
            const Mk = M[k] as number[];
            const factor = Mk[i] as number;
            if (factor === 0) continue;
            for (let j = i; j <= N; j++) Mk[j] = (Mk[j] as number) - factor * (Mi2[j] as number);
        }
    }
    const x = new Array<number>(N);
    for (let i = 0; i < N; i++) x[i] = (M[i] as number[])[N] as number;
    return x;
}

// ----------------------------------------------------------------
// public API
// ----------------------------------------------------------------

/**
 * Solve the 2nd-order 2D polynomial transform (12 parameters) from
 * ≥6 GCPs.
 *
 * Per-point monomials: `[1, px, py, px², px·py, py²]` (6 terms).
 * The normal-equations matrix `N = A^T·A` (6×6) is identical for X and
 * Y, so we build it once and solve two right-hand sides.
 *
 * @throws {RangeError} if `gcps.length < 6`, the matrix is singular,
 *   or a GCP has non-finite coordinates.
 * @throws {TypeError} if the input is not an array.
 */
export function solvePolynomial2D(gcps: readonly GroundControlPoint[]): Polynomial2D {
    if (!Array.isArray(gcps)) {
        throw new TypeError('polynomialSolver: gcps must be an array');
    }
    if (gcps.length < 6) {
        throw new RangeError(`polynomialSolver: need >=6 GCPs, got ${gcps.length}`);
    }

    const n = gcps.length;

    // Build 6×6 symmetric normal matrix N = A^T·A and two RHS vectors.
    // Monomial basis: m_k(px, py) = [1, px, py, px², px·py, py²]
    const N: number[][] = [
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
    ];
    const rhsX: number[] = [0, 0, 0, 0, 0, 0];
    const rhsY: number[] = [0, 0, 0, 0, 0, 0];

    for (let i = 0; i < n; i++) {
        const g = gcps[i] as GroundControlPoint;
        if (
            !Number.isFinite(g.pixelX) ||
            !Number.isFinite(g.pixelY) ||
            !Number.isFinite(g.worldX) ||
            !Number.isFinite(g.worldY)
        ) {
            throw new RangeError(`polynomialSolver: GCP ${i} has non-finite coordinate`);
        }
        const px = g.pixelX;
        const py = g.pixelY;
        const m: number[] = [1, px, py, px * px, px * py, py * py];
        for (let r = 0; r < 6; r++) {
            const Nr = N[r] as number[];
            const mr = m[r] as number;
            for (let c = 0; c < 6; c++) {
                Nr[c] = (Nr[c] as number) + mr * (m[c] as number);
            }
            rhsX[r] = (rhsX[r] as number) + mr * g.worldX;
            rhsY[r] = (rhsY[r] as number) + mr * g.worldY;
        }
    }

    const ax = solveLinearSystem(N, rhsX);
    const ay = solveLinearSystem(N, rhsY);

    // Residuals + RMSE
    const residuals: PolynomialResidual[] = new Array(n);
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
        const g = gcps[i] as GroundControlPoint;
        const px = g.pixelX;
        const py = g.pixelY;
        const predX =
            (ax[0] as number) +
            (ax[1] as number) * px +
            (ax[2] as number) * py +
            (ax[3] as number) * px * px +
            (ax[4] as number) * px * py +
            (ax[5] as number) * py * py;
        const predY =
            (ay[0] as number) +
            (ay[1] as number) * px +
            (ay[2] as number) * py +
            (ay[3] as number) * px * px +
            (ay[4] as number) * px * py +
            (ay[5] as number) * py * py;
        const dx = predX - g.worldX;
        const dy = predY - g.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        residuals[i] = Object.freeze({ dx, dy, d: dist });
        sumSq += dx * dx + dy * dy;
    }
    const rmse = Math.sqrt(sumSq / n);

    return Object.freeze({
        ax: Object.freeze(ax.slice()),
        ay: Object.freeze(ay.slice()),
        rmse,
        residuals: Object.freeze(residuals),
    });
}

/**
 * Apply a polynomial transform to a (pixelX, pixelY) pair and return
 * the world-space coordinate.
 *
 * @throws {TypeError} if `poly`, `ax`, `ay`, or the pixel coordinates
 *   are malformed or non-finite.
 */
export function applyPolynomial(
    poly: Polynomial2DCoefficients,
    pixelX: number,
    pixelY: number,
): PolynomialWorldPoint {
    if (!poly || typeof poly !== 'object') {
        throw new TypeError('applyPolynomial: poly must be an object with {ax,ay}');
    }
    const { ax, ay } = poly;
    if (!Array.isArray(ax) || ax.length !== 6 || !Array.isArray(ay) || ay.length !== 6) {
        throw new TypeError('applyPolynomial: ax and ay must be arrays of length 6');
    }
    if (!Number.isFinite(pixelX) || !Number.isFinite(pixelY)) {
        throw new TypeError('applyPolynomial: pixelX and pixelY must be finite');
    }
    const px = pixelX;
    const py = pixelY;
    return {
        worldX:
            (ax[0] as number) +
            (ax[1] as number) * px +
            (ax[2] as number) * py +
            (ax[3] as number) * px * px +
            (ax[4] as number) * px * py +
            (ax[5] as number) * py * py,
        worldY:
            (ay[0] as number) +
            (ay[1] as number) * px +
            (ay[2] as number) * py +
            (ay[3] as number) * px * px +
            (ay[4] as number) * px * py +
            (ay[5] as number) * py * py,
    };
}
