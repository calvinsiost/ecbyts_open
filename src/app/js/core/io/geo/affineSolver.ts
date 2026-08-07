// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).


/**
 * Affine 2D Solver — Ground Control Point (GCP) georeferencing math.
 *
 * Fase 1 do SPEC_G3_RASTER_UPLOAD_GEOREF (P1-7): puro math, sem DOM/canvas.
 * Resolve o sistema linear de mínimos quadrados para a transformação afim de
 * 6 parâmetros:
 *
 *     worldX = a * pixelX + b * pixelY + c
 *     worldY = d * pixelX + e * pixelY + f
 *
 * Com N GCPs (N >= 3), monta o sistema sobredeterminado 2N×6 e resolve via
 * equações normais (A^T A) x = (A^T b). O sistema normal 6×6 é separável em
 * dois sistemas 3×3 (um para {a,b,c}, outro para {d,e,f}) porque linhas ímpares
 * e pares da matriz A são ortogonais — reduzimos custo e simplificamos.
 *
 * Referência: Wolf, P.R. & Ghilani, C.D. (2006) "Adjustment Computations —
 * Spatial Data Analysis" 4th ed., Wiley. ISBN 978-0-471-69728-2, cap. 17
 * ("Coordinate Transformations"), eq. 17.3-17.6.
 */

export interface AffineGroundControlPoint {
    readonly pixelX: number;
    readonly pixelY: number;
    readonly worldX: number;
    readonly worldY: number;
}

export interface AffineResidual {
    readonly dx: number;
    readonly dy: number;
    readonly d: number;
}

export interface AffineCoefficients {
    readonly a: number;
    readonly b: number;
    readonly c: number;
    readonly d: number;
    readonly e: number;
    readonly f: number;
}

export interface Affine2D extends AffineCoefficients {
    readonly rmse: number;
    readonly residuals: ReadonlyArray<AffineResidual>;
}

export interface AffineWorldPoint {
    readonly worldX: number;
    readonly worldY: number;
}

// --- internal: 3×3 linear solve via Gauss-Jordan with partial pivoting --------
/**
 * Resolve A·x = b para A 3×3 e b 3×1, retornando x (array de 3).
 * Faz pivotamento parcial para estabilidade numérica. Lança RangeError
 * se a matriz for singular (det ≈ 0).
 */
function solve3x3(A: ReadonlyArray<ReadonlyArray<number>>, b: ReadonlyArray<number>): [number, number, number] {
    // augmentada [A | b] — faz cópia para não mutar entrada
    const A0 = A[0] as ReadonlyArray<number>;
    const A1 = A[1] as ReadonlyArray<number>;
    const A2 = A[2] as ReadonlyArray<number>;
    const M: number[][] = [
        [A0[0] as number, A0[1] as number, A0[2] as number, b[0] as number],
        [A1[0] as number, A1[1] as number, A1[2] as number, b[1] as number],
        [A2[0] as number, A2[1] as number, A2[2] as number, b[2] as number],
    ];
    const EPS = 1e-12;

    for (let i = 0; i < 3; i++) {
        // partial pivoting: acha linha com maior |M[k][i]|
        let pivotRow = i;
        const Mi = M[i] as number[];
        let pivotVal = Math.abs(Mi[i] as number);
        for (let k = i + 1; k < 3; k++) {
            const candidate = Math.abs((M[k] as number[])[i] as number);
            if (candidate > pivotVal) {
                pivotRow = k;
                pivotVal = candidate;
            }
        }
        if (pivotVal < EPS) {
            throw new RangeError('affineSolver: singular normal matrix (GCPs collinear or degenerate)');
        }
        if (pivotRow !== i) {
            const tmp = M[i] as number[];
            M[i] = M[pivotRow] as number[];
            M[pivotRow] = tmp;
        }

        // normalize pivot row
        const Mi2 = M[i] as number[];
        const pivot = Mi2[i] as number;
        for (let j = i; j < 4; j++) Mi2[j] = (Mi2[j] as number) / pivot;

        // eliminate other rows
        for (let k = 0; k < 3; k++) {
            if (k === i) continue;
            const Mk = M[k] as number[];
            const factor = Mk[i] as number;
            if (factor === 0) continue;
            for (let j = i; j < 4; j++) Mk[j] = (Mk[j] as number) - factor * (Mi2[j] as number);
        }
    }

    const M0 = M[0] as number[];
    const M1 = M[1] as number[];
    const M2 = M[2] as number[];
    return [M0[3] as number, M1[3] as number, M2[3] as number];
}

// --- public API --------------------------------------------------------------

/**
 * Resolve a transformação afim 2D (6 parâmetros) a partir de ≥3 GCPs.
 *
 * Para cada GCP, gera duas equações:
 *     worldX_i = a·pixelX_i + b·pixelY_i + c
 *     worldY_i = d·pixelX_i + e·pixelY_i + f
 *
 * Constrói matriz normal N = A^T A (6×6, separável em dois blocos 3×3
 * idênticos) e vetores q_x = A^T·bx, q_y = A^T·by. Resolve dois sistemas
 * 3×3 para {a,b,c} e {d,e,f}.
 */
export function solveAffine2D(gcps: ReadonlyArray<AffineGroundControlPoint>): Readonly<Affine2D> {
    if (!Array.isArray(gcps) || gcps.length < 3) {
        throw new RangeError(`affineSolver: need >=3 GCPs, got ${Array.isArray(gcps) ? gcps.length : 'non-array'}`);
    }

    // Build normal matrix N (3×3) — same for both {a,b,c} and {d,e,f} blocks:
    //   N = [ Σx²   Σxy   Σx  ]
    //       [ Σxy   Σy²   Σy  ]
    //       [ Σx    Σy    n   ]
    let sxx = 0,
        sxy = 0,
        syy = 0,
        sx = 0,
        sy = 0;
    let sxX = 0,
        syX = 0,
        sX = 0; // right-hand side for worldX
    let sxY = 0,
        syY = 0,
        sY = 0; // right-hand side for worldY
    const n = gcps.length;

    for (let i = 0; i < n; i++) {
        const g = gcps[i];
        if (
            !Number.isFinite(g.pixelX) ||
            !Number.isFinite(g.pixelY) ||
            !Number.isFinite(g.worldX) ||
            !Number.isFinite(g.worldY)
        ) {
            throw new RangeError(`affineSolver: GCP ${i} has non-finite coordinate`);
        }
        const px = g.pixelX,
            py = g.pixelY,
            wx = g.worldX,
            wy = g.worldY;
        sxx += px * px;
        sxy += px * py;
        syy += py * py;
        sx += px;
        sy += py;
        sxX += px * wx;
        syX += py * wx;
        sX += wx;
        sxY += px * wy;
        syY += py * wy;
        sY += wy;
    }

    const N: number[][] = [
        [sxx, sxy, sx],
        [sxy, syy, sy],
        [sx, sy, n],
    ];
    const [a, b, c] = solve3x3(N, [sxX, syX, sX]);
    const [d, e, f] = solve3x3(N, [sxY, syY, sY]);

    // Residuals + RMSE
    const residuals: AffineResidual[] = new Array(n);
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
        const g = gcps[i];
        const px = a * g.pixelX + b * g.pixelY + c;
        const py = d * g.pixelX + e * g.pixelY + f;
        const dx = px - g.worldX;
        const dy = py - g.worldY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        residuals[i] = Object.freeze({ dx, dy, d: dist });
        sumSq += dx * dx + dy * dy;
    }
    const rmse = Math.sqrt(sumSq / n);

    return Object.freeze({
        a,
        b,
        c,
        d,
        e,
        f,
        rmse,
        residuals: Object.freeze(residuals),
    });
}

/**
 * Aplica a transformação afim a um par (pixelX, pixelY) e retorna coord mundo.
 */
export function applyAffine(affine: AffineCoefficients, pixelX: number, pixelY: number): AffineWorldPoint {
    if (!affine || typeof affine !== 'object') {
        throw new TypeError('applyAffine: affine must be an object with {a,b,c,d,e,f}');
    }
    const { a, b, c, d, e, f } = affine;
    return {
        worldX: a * pixelX + b * pixelY + c,
        worldY: d * pixelX + e * pixelY + f,
    };
}

/**
 * Inverte a transformação afim (2×2 linear part + translation).
 *
 * Para T(p) = M·p + t, a inversa é T⁻¹(w) = M⁻¹·(w − t) = M⁻¹·w − M⁻¹·t.
 * Em termos dos 6 coeficientes:
 *     det = a*e − b*d
 *     a' =  e/det,  b' = −b/det,  c' = (b*f − e*c)/det
 *     d' = −d/det,  e' =  a/det,  f' = (d*c − a*f)/det
 */
export function invertAffine(affine: AffineCoefficients): Readonly<AffineCoefficients> {
    if (!affine || typeof affine !== 'object') {
        throw new TypeError('invertAffine: affine must be an object with {a,b,c,d,e,f}');
    }
    const { a, b, c, d, e, f } = affine;
    const det = a * e - b * d;
    if (!Number.isFinite(det) || Math.abs(det) < 1e-15) {
        throw new RangeError(`invertAffine: non-invertible transform (det=${det})`);
    }
    return Object.freeze({
        a: e / det,
        b: -b / det,
        c: (b * f - e * c) / det,
        d: -d / det,
        e: a / det,
        f: (d * c - a * f) / det,
    });
}

/**
 * Calcula o erro RMS residual da transformação afim contra os GCPs dados.
 * Útil para re-avaliar um affine salvo contra novos pontos de validação.
 */
export function computeRMSE(gcps: ReadonlyArray<AffineGroundControlPoint>, affine: AffineCoefficients): number {
    if (!Array.isArray(gcps) || gcps.length === 0) {
        throw new RangeError('computeRMSE: gcps must be non-empty array');
    }
    let sumSq = 0;
    for (let i = 0; i < gcps.length; i++) {
        const g = gcps[i];
        const { worldX, worldY } = applyAffine(affine, g.pixelX, g.pixelY);
        const dx = worldX - g.worldX;
        const dy = worldY - g.worldY;
        sumSq += dx * dx + dy * dy;
    }
    return Math.sqrt(sumSq / gcps.length);
}
