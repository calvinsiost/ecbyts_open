// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * mapGeoreferencer.js - Affine transform from GCPs (pixel → world coordinates).
 *
 * Computes least-squares affine transform with centroid normalization
 * to avoid numerical instability with large UTM values (~10^6).
 * Includes RANSAC-lite outlier rejection and proximity validation.
 *
 * @module core/ingestion/documents/mapGeoreferencer
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * @typedef {Object} AffineTransform
 * @property {number[]} matrix  - [a, b, c, d, e, f]
 * @property {number}   residual - RMS in CRS units (meters for UTM)
 * @property {number}   gcpCount
 * @property {string}   method  - 'affine' | 'similarity' | 'scale_only'
 */

/**
 * @typedef {Object} GeoreferencingResult
 * @property {AffineTransform}   transform
 * @property {string}            crs
 * @property {number}            pxPerMeter
 * @property {Object}            bounds - { minEasting, maxEasting, minNorthing, maxNorthing }
 * @property {import('./coordinateExtractor.js').GroundControlPoint[]} gcpsUsed
 * @property {import('./coordinateExtractor.js').GroundControlPoint[]} gcpsRejected
 * @property {Object}            validation
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_IMAGE_DIM = 200;
const DEFAULT_MAX_RESIDUAL = 50; // meters
const RANSAC_OUTLIER_FACTOR = 2.0;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build affine transform from Ground Control Points.
 *
 * Strategy by GCP count:
 * - ≥3: Full affine (6 params, least-squares, centroid-normalized)
 * - 2: Similarity (4 params: scale, rotation, translation)
 * - 1 + scaleBar: Scale-only (translation + uniform scale)
 * - 0: returns null
 *
 * @param {import('./coordinateExtractor.js').GroundControlPoint[]} gcps
 * @param {Object} options
 * @param {string} options.crs
 * @param {number} options.imageWidth
 * @param {number} options.imageHeight
 * @param {number} [options.maxResidual=50]
 * @param {{ easting: number, northing: number }|null} [options.siteOrigin]
 * @param {number} [options.pxPerMeter] - from scale bar detection
 * @returns {GeoreferencingResult|null}
 */
export function buildTransform(gcps: any, options: any) {
    const { crs, imageWidth, imageHeight, maxResidual = DEFAULT_MAX_RESIDUAL, siteOrigin, pxPerMeter } = options;

    if (!gcps || gcps.length === 0) return null;
    if (imageWidth < MIN_IMAGE_DIM || imageHeight < MIN_IMAGE_DIM) return null;

    /** @type {any} */
    let transform: any;
    let usedGcps = [...gcps];
    let rejectedGcps = [];

    if (gcps.length >= 3) {
        // RANSAC-lite: solve, reject worst outlier, repeat
        const result = _solveWithRANSAC(gcps, maxResidual);
        transform = result.transform;
        usedGcps = result.used;
        rejectedGcps = result.rejected;
    } else if (gcps.length === 2) {
        transform = /** @type {any} */ (_solveSimilarity(gcps[0], gcps[1]));
        transform.method = 'similarity';
        transform.gcpCount = 2;
    } else if (gcps.length === 1 && pxPerMeter) {
        transform = /** @type {any} */ (_solveScaleOnly(gcps[0], pxPerMeter));
        transform.method = 'scale_only';
        transform.gcpCount = 1;
    } else {
        return null;
    }

    if (!transform) return null;

    // Compute bounds (transform image corners to world)
    const corners = [
        pixelToWorld(transform, 0, 0),
        pixelToWorld(transform, imageWidth, 0),
        pixelToWorld(transform, imageWidth, imageHeight),
        pixelToWorld(transform, 0, imageHeight),
    ];

    const eastings = corners.map((c) => c.easting);
    const northings = corners.map((c) => c.northing);

    const bounds = {
        minEasting: Math.min(...eastings),
        maxEasting: Math.max(...eastings),
        minNorthing: Math.min(...northings),
        maxNorthing: Math.max(...northings),
    };

    // Validation
    const boundsValid = _validateUTMBounds(bounds);
    const residualOk = transform.residual <= maxResidual;
    const proximityOk = siteOrigin ? _validateProximityBounds(bounds, siteOrigin, 50) : true;

    // Compute pxPerMeter from transform
    const p1 = pixelToWorld(transform, 0, 0);
    const p2 = pixelToWorld(transform, 100, 0);
    const metersPerHundredPx = Math.sqrt((p2.easting - p1.easting) ** 2 + (p2.northing - p1.northing) ** 2);
    const derivedPxPerMeter = metersPerHundredPx > 0 ? 100 / metersPerHundredPx : 0;

    return {
        transform,
        crs: crs || 'unknown',
        pxPerMeter: Math.round(derivedPxPerMeter * 100) / 100,
        bounds,
        gcpsUsed: usedGcps,
        gcpsRejected: rejectedGcps,
        validation: { boundsValid, residualOk, proximityOk },
    };
}

/**
 * Apply transform: pixel → world coordinates.
 *
 * @param {AffineTransform} transform
 * @param {number} px
 * @param {number} py
 * @returns {{ easting: number, northing: number }}
 */
export function pixelToWorld(transform: any, px: any, py: any) {
    const [a, b, c, d, e, f] = transform.matrix as any[];
    return {
        easting: a * px + b * py + c,
        northing: d * px + e * py + f,
    };
}

/**
 * Inverse transform: world → pixel.
 *
 * @param {AffineTransform} transform
 * @param {number} easting
 * @param {number} northing
 * @returns {{ px: number, py: number }}
 */
export function worldToPixel(transform: any, easting: any, northing: any) {
    const [a, b, c, d, e, f] = transform.matrix as any[];
    const det = a * e - b * d;
    if (Math.abs(det) < 1e-10) return { px: 0, py: 0 };

    const ex = easting - c;
    const ny = northing - f;
    return {
        px: (e * ex - b * ny) / det,
        py: (-d * ex + a * ny) / det,
    };
}

/**
 * Validate proximity to site origin.
 *
 * @param {{ easting: number, northing: number }} coord
 * @param {{ easting: number, northing: number }} siteOrigin
 * @param {number} [maxDistanceKm=50]
 * @returns {boolean}
 */
export function validateProximity(coord: any, siteOrigin: any, maxDistanceKm = 50) {
    const dx = coord.easting - siteOrigin.easting;
    const dy = coord.northing - siteOrigin.northing;
    const distM = Math.sqrt(dx * dx + dy * dy);
    return distM <= maxDistanceKm * 1000;
}

// ---------------------------------------------------------------------------
// Affine Solver (centroid-normalized)
// ---------------------------------------------------------------------------

/**
 * Least-squares affine from ≥3 GCPs with centroid normalization.
 * Solves: [A] * [params] = [world] via normal equations.
 */
function _solveAffine(/** @type {any} */ gcps: any) {
    const n = gcps.length;

    // Centroid normalization
    const pxC = { x: 0, y: 0 };
    const wdC = { x: 0, y: 0 };
    for (const g of gcps) {
        pxC.x += g.pixel[0];
        pxC.y += g.pixel[1];
        wdC.x += g.coord[0];
        wdC.y += g.coord[1];
    }
    pxC.x /= n;
    pxC.y /= n;
    wdC.x /= n;
    wdC.y /= n;

    // Build centered normal equations: (A^T A) params = A^T b
    // A row for easting: [cpx, cpy, 1, 0, 0, 0]
    // A row for northing: [0, 0, 0, cpx, cpy, 1]
    const ATA: any = Array.from({ length: 6 }, () => new Float64Array(6));
    const ATb: any = new Float64Array(6);

    for (const g of gcps) {
        const cpx = g.pixel[0] - pxC.x;
        const cpy = g.pixel[1] - pxC.y;
        const cwx = g.coord[0] - wdC.x;
        const cwy = g.coord[1] - wdC.y;

        // Easting equation
        ATA[0][0] += cpx * cpx;
        ATA[0][1] += cpx * cpy;
        ATA[0][2] += cpx;
        ATA[1][0] += cpy * cpx;
        ATA[1][1] += cpy * cpy;
        ATA[1][2] += cpy;
        ATA[2][0] += cpx;
        ATA[2][1] += cpy;
        ATA[2][2] += 1;
        ATb[0] += cpx * cwx;
        ATb[1] += cpy * cwx;
        ATb[2] += cwx;

        // Northing equation
        ATA[3][3] += cpx * cpx;
        ATA[3][4] += cpx * cpy;
        ATA[3][5] += cpx;
        ATA[4][3] += cpy * cpx;
        ATA[4][4] += cpy * cpy;
        ATA[4][5] += cpy;
        ATA[5][3] += cpx;
        ATA[5][4] += cpy;
        ATA[5][5] += 1;
        ATb[3] += cpx * cwy;
        ATb[4] += cpy * cwy;
        ATb[5] += cwy;
    }

    // Solve via Gaussian elimination
    const params = _gaussianElimination(ATA, ATb);
    if (!params) return null;

    const [a, b, cC, d, e, fC] = params as any[];

    // Denormalize translation terms
    const c = cC - a * pxC.x - b * pxC.y + wdC.x;
    const f = fC - d * pxC.x - e * pxC.y + wdC.y;

    // Compute RMS residual
    let sumSq = 0;
    for (const g of gcps) {
        const we = a * g.pixel[0] + b * g.pixel[1] + c;
        const wn = d * g.pixel[0] + e * g.pixel[1] + f;
        sumSq += (we - g.coord[0]) ** 2 + (wn - g.coord[1]) ** 2;
    }
    const residual = Math.sqrt(sumSq / (2 * n));

    return {
        matrix: [a, b, c, d, e, f],
        residual: Math.round(residual * 100) / 100,
        gcpCount: n,
        method: 'affine',
    };
}

function _solveSimilarity(/** @type {any} */ gcp1: any, /** @type {any} */ gcp2: any) {
    const dpx = gcp2.pixel[0] - gcp1.pixel[0];
    const dpy = gcp2.pixel[1] - gcp1.pixel[1];
    const dwx = gcp2.coord[0] - gcp1.coord[0];
    const dwy = gcp2.coord[1] - gcp1.coord[1];

    const pixelDist = Math.sqrt(dpx * dpx + dpy * dpy);
    if (pixelDist < 1) return null;

    const worldDist = Math.sqrt(dwx * dwx + dwy * dwy);
    const scale = worldDist / pixelDist;
    const angle = Math.atan2(dwy, dwx) - Math.atan2(dpy, dpx);

    const cosA = scale * Math.cos(angle);
    const sinA = scale * Math.sin(angle);
    const tx = gcp1.coord[0] - cosA * gcp1.pixel[0] + sinA * gcp1.pixel[1];
    const ty = gcp1.coord[1] - sinA * gcp1.pixel[0] - cosA * gcp1.pixel[1];

    return {
        matrix: [cosA, -sinA, tx, sinA, cosA, ty],
        residual: 0,
        gcpCount: 2,
        method: 'similarity',
    };
}

function _solveScaleOnly(/** @type {any} */ gcp: any, /** @type {any} */ pxPerMeter: any) {
    const scale = 1 / pxPerMeter;
    const tx = gcp.coord[0] - scale * gcp.pixel[0];
    const ty = gcp.coord[1] + scale * gcp.pixel[1]; // Y flipped for top-down images

    return {
        matrix: [scale, 0, tx, 0, -scale, ty],
        residual: 0,
        gcpCount: 1,
        method: 'scale_only',
    };
}

// ---------------------------------------------------------------------------
// RANSAC-lite Outlier Rejection
// ---------------------------------------------------------------------------

function _solveWithRANSAC(/** @type {any} */ gcps: any, /** @type {any} */ maxResidual: any) {
    const currentGcps = [...gcps];
    const rejected = [];

    for (let iter = 0; iter < 5 && currentGcps.length >= 3; iter++) {
        const transform = _solveAffine(currentGcps);
        if (!transform) break;

        if (transform.residual <= maxResidual || currentGcps.length <= 3) {
            return { transform, used: currentGcps, rejected };
        }

        // Find worst residual GCP
        let worstIdx = -1;
        let worstRes = 0;
        for (let i = 0; i < currentGcps.length; i++) {
            const g = currentGcps[i];
            const [a, b, c, d, e, f] = transform.matrix as any[];
            const we = a * g.pixel[0] + b * g.pixel[1] + c;
            const wn = d * g.pixel[0] + e * g.pixel[1] + f;
            const res = Math.sqrt((we - g.coord[0]) ** 2 + (wn - g.coord[1]) ** 2);
            if (res > worstRes) {
                worstRes = res;
                worstIdx = i;
            }
        }

        // Only reject if outlier is significantly worse than mean
        const meanRes = transform.residual;
        if (worstRes > meanRes * RANSAC_OUTLIER_FACTOR && worstIdx >= 0) {
            rejected.push(currentGcps.splice(worstIdx, 1)[0]);
        } else {
            return { transform, used: currentGcps, rejected };
        }
    }

    const transform =
        currentGcps.length >= 3
            ? _solveAffine(currentGcps)
            : currentGcps.length === 2
              ? _solveSimilarity(currentGcps[0], currentGcps[1])
              : null;

    return { transform, used: currentGcps, rejected };
}

// ---------------------------------------------------------------------------
// Gaussian Elimination (6×6)
// ---------------------------------------------------------------------------

function _gaussianElimination(/** @type {any} */ A: any, /** @type {any} */ b: any) {
    const n = b.length;
    const aug: any = A.map((/** @type {any} */ row: any, /** @type {any} */ i: any) => [...row, b[i]]);

    for (let col = 0; col < n; col++) {
        // Partial pivoting
        let maxRow = col;
        for (let row = col + 1; row < n; row++) {
            if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
        }
        [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

        if (Math.abs(aug[col][col]) < 1e-12) return null; // singular

        // Eliminate below
        for (let row = col + 1; row < n; row++) {
            const factor = aug[row][col] / aug[col][col];
            for (let j = col; j <= n; j++) {
                aug[row][j] -= factor * aug[col][j];
            }
        }
    }

    // Back substitution
    const x: any = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
        x[i] = aug[i][n];
        for (let j = i + 1; j < n; j++) {
            x[i] -= aug[i][j] * x[j];
        }
        x[i] /= aug[i][i];
    }

    return Array.from(x);
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function _validateUTMBounds(/** @type {any} */ bounds: any) {
    return (
        bounds.minEasting >= 100000 &&
        bounds.maxEasting <= 900000 &&
        bounds.minNorthing >= 0 &&
        bounds.maxNorthing <= 10000000
    );
}

function _validateProximityBounds(/** @type {any} */ bounds: any, /** @type {any} */ origin: any, /** @type {any} */ maxKm: any) {
    const center = {
        easting: (bounds.minEasting + bounds.maxEasting) / 2,
        northing: (bounds.minNorthing + bounds.maxNorthing) / 2,
    };
    return validateProximity(center, origin, maxKm);
}
