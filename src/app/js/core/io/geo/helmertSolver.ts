// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).


/**
 * Helmert 2D Similarity Transform — 4-parameter GCP georeferencing math.
 *
 * Fase 2 do SPEC_G3_RASTER_UPLOAD_GEOREF (P1-7): puro math, sem DOM/canvas.
 *
 * Resolve o sistema linear de mínimos quadrados para a transformação de
 * similaridade 2D (rotação + escala uniforme + translação, SEM shear):
 *
 *     worldX = s·cos(θ)·pixelX − s·sin(θ)·pixelY + tx
 *     worldY = s·sin(θ)·pixelX + s·cos(θ)·pixelY + ty
 *
 * Reparametrização linear (Helmert 1893):
 *
 *     a = s·cos(θ)
 *     b = s·sin(θ)
 *     worldX = a·pixelX − b·pixelY + tx
 *     worldY = b·pixelX + a·pixelY + ty
 *
 * 4 parâmetros {a, b, tx, ty}. Com N GCPs (N ≥ 2), 2N equações, resolução
 * via equações normais fechadas (forma canônica Helmert).
 *
 * Referência: Helmert, F.R. (1880) "Die mathematischen und physikalischen
 * Theorieen der höheren Geodäsie" vol. I, Leipzig. Também Ghilani (2017)
 * "Adjustment Computations" 6th ed., Wiley, cap. 18.3 ("Two-dimensional
 * Conformal Coordinate Transformation"), ISBN 978-1-119-38598-1.
 *
 * Uso: georeferenciamento de fotos aéreas sem distorção significativa,
 * onde o raster e o mundo mantêm ângulos e proporções (ex: ortofoto
 * rotacionada/escalada mas sem anisotropia).
 */

export interface HelmertGroundControlPoint {
    readonly pixelX: number;
    readonly pixelY: number;
    readonly worldX: number;
    readonly worldY: number;
}

export interface HelmertResidual {
    readonly dx: number;
    readonly dy: number;
    readonly d: number;
}

export interface Helmert2D {
    readonly tx: number;
    readonly ty: number;
    readonly scale: number;
    readonly rotationRad: number;
    readonly a: number;
    readonly b: number;
    readonly rmse: number;
    readonly residuals: ReadonlyArray<HelmertResidual>;
}

export interface HelmertCoefficients {
    readonly a?: number;
    readonly b?: number;
    readonly tx: number;
    readonly ty: number;
    readonly scale?: number;
    readonly rotationRad?: number;
}

export interface HelmertWorldPoint {
    readonly worldX: number;
    readonly worldY: number;
}

export interface AffineCoefficientsResult {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
}

// --- public API --------------------------------------------------------------

/**
 * Resolve a transformação Helmert 2D (4 parâmetros) a partir de ≥2 GCPs.
 */
export function solveHelmert2D(gcps: ReadonlyArray<HelmertGroundControlPoint>): Readonly<Helmert2D> {
    if (!Array.isArray(gcps)) {
        throw new TypeError('helmertSolver: gcps must be an array');
    }
    if (gcps.length < 2) {
        throw new RangeError(`helmertSolver: need >=2 GCPs, got ${gcps.length}`);
    }

    const n = gcps.length;

    // Centroid-subtracted normal equations reduce the 4×4 system to:
    //   a · Σ(px'² + py'²) = Σ(px'·wx' + py'·wy')
    //   b · Σ(px'² + py'²) = Σ(px'·wy' − py'·wx')
    // where px' = px − mean(px), etc.
    let sumPx = 0,
        sumPy = 0,
        sumWx = 0,
        sumWy = 0;
    for (let i = 0; i < n; i++) {
        const g = gcps[i] as HelmertGroundControlPoint;
        if (
            !Number.isFinite(g.pixelX) ||
            !Number.isFinite(g.pixelY) ||
            !Number.isFinite(g.worldX) ||
            !Number.isFinite(g.worldY)
        ) {
            throw new RangeError(`helmertSolver: GCP ${i} has non-finite coordinate`);
        }
        sumPx += g.pixelX;
        sumPy += g.pixelY;
        sumWx += g.worldX;
        sumWy += g.worldY;
    }
    const meanPx = sumPx / n;
    const meanPy = sumPy / n;
    const meanWx = sumWx / n;
    const meanWy = sumWy / n;

    let sPP = 0; // Σ(px'² + py'²)
    let sAB = 0; // Σ(px'·wx' + py'·wy')  → a·sPP
    let sBA = 0; // Σ(px'·wy' − py'·wx')  → b·sPP
    for (let i = 0; i < n; i++) {
        const g = gcps[i] as HelmertGroundControlPoint;
        const px = g.pixelX - meanPx;
        const py = g.pixelY - meanPy;
        const wx = g.worldX - meanWx;
        const wy = g.worldY - meanWy;
        sPP += px * px + py * py;
        sAB += px * wx + py * wy;
        sBA += px * wy - py * wx;
    }

    const EPS = 1e-15;
    if (!Number.isFinite(sPP) || sPP < EPS) {
        throw new RangeError('helmertSolver: degenerate GCPs (all points coincide or zero spread)');
    }

    const a = sAB / sPP;
    const b = sBA / sPP;
    const tx = meanWx - a * meanPx + b * meanPy;
    const ty = meanWy - b * meanPx - a * meanPy;

    const scale = Math.sqrt(a * a + b * b);
    if (!Number.isFinite(scale) || scale < EPS) {
        throw new RangeError(`helmertSolver: near-zero scale (${scale})`);
    }
    const rotationRad = Math.atan2(b, a);

    // Residuals + RMSE
    const residuals: HelmertResidual[] = new Array(n);
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
        const g = gcps[i] as HelmertGroundControlPoint;
        const px = a * g.pixelX - b * g.pixelY + tx;
        const py = b * g.pixelX + a * g.pixelY + ty;
        const dx = px - g.worldX;
        const dy = py - g.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        residuals[i] = Object.freeze({ dx, dy, d: dist });
        sumSq += dx * dx + dy * dy;
    }
    const rmse = Math.sqrt(sumSq / n);

    return Object.freeze({
        tx,
        ty,
        scale,
        rotationRad,
        a,
        b,
        rmse,
        residuals: Object.freeze(residuals),
    });
}

/**
 * Aplica a transformação Helmert a um par (pixelX, pixelY) e retorna coord mundo.
 */
export function applyHelmert(h: HelmertCoefficients, pixelX: number, pixelY: number): HelmertWorldPoint {
    if (!h || typeof h !== 'object') {
        throw new TypeError('applyHelmert: h must be an object');
    }
    let a = h.a;
    let b = h.b;
    if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) {
        if (h.scale !== undefined && h.rotationRad !== undefined && Number.isFinite(h.scale) && Number.isFinite(h.rotationRad)) {
            a = h.scale * Math.cos(h.rotationRad);
            b = h.scale * Math.sin(h.rotationRad);
        } else {
            throw new TypeError('applyHelmert: need {a,b} or {scale,rotationRad}');
        }
    }
    const { tx, ty } = h;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
        throw new TypeError('applyHelmert: tx/ty must be finite');
    }
    return {
        worldX: a * pixelX - b * pixelY + tx,
        worldY: b * pixelX + a * pixelY + ty,
    };
}

/**
 * Converte um Helmert 4-param em coeficientes afim 6-param equivalentes.
 */
export function helmertToAffine(h: HelmertCoefficients): Readonly<AffineCoefficientsResult> {
    if (!h || typeof h !== 'object') {
        throw new TypeError('helmertToAffine: h must be an object');
    }
    let a = h.a;
    let b = h.b;
    if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) {
        if (h.scale !== undefined && h.rotationRad !== undefined && Number.isFinite(h.scale) && Number.isFinite(h.rotationRad)) {
            a = h.scale * Math.cos(h.rotationRad);
            b = h.scale * Math.sin(h.rotationRad);
        } else {
            throw new TypeError('helmertToAffine: need {a,b} or {scale,rotationRad}');
        }
    }
    const { tx, ty } = h;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) {
        throw new TypeError('helmertToAffine: tx/ty must be finite');
    }
    return Object.freeze({
        a: a,
        b: -b,
        c: tx,
        d: b,
        e: a,
        f: ty,
    });
}
