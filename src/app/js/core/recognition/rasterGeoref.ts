// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   RASTER GEOREFERENCING — Affine transform from control points
   ================================================================

   Resolve transformacao afim (6 parametros) a partir de pontos de
   controle (pixel → geo). Permite converter coordenadas de imagem
   raster para coordenadas geograficas e vice-versa.

   Referencia: Mikhail, E.M., Ackermann, F. (1976) "Observations
   and Least Squares", IEP. Capitulo sobre transformacoes afins.
   ================================================================ */

type ControlPoint = { pixel: { x: number; y: number }; geo: { easting: number; northing: number } };

/**
 * Validate control points array.
 * Minimum 4 non-collinear points required for overdetermined least-squares.
 */
export function validateControlPoints(points: ControlPoint[]): { valid: boolean; error?: string } {
    if (!Array.isArray(points)) {
        return { valid: false, error: 'Control points must be an array' };
    }
    if (points.length < 4) {
        return { valid: false, error: 'Minimum 4 control points required' };
    }
    for (let i = 0; i < points.length; i++) {
        const p = points[i];
        if (!p || !p.pixel || !p.geo) {
            return { valid: false, error: `Point ${i} missing pixel or geo` };
        }
        if (!Number.isFinite(p.pixel.x) || !Number.isFinite(p.pixel.y)) {
            return { valid: false, error: `Point ${i} has invalid pixel coordinates` };
        }
        if (!Number.isFinite(p.geo.easting) || !Number.isFinite(p.geo.northing)) {
            return { valid: false, error: `Point ${i} has invalid geo coordinates` };
        }
    }
    if (_areCollinear(points.map((p) => p.pixel))) {
        return { valid: false, error: 'Control points are collinear' };
    }
    return { valid: true };
}

/**
 * Check if 2D points are (approximately) collinear.
 * Uses area of triangle formed by first three non-coincident points.
 */
function _areCollinear(pts: Array<{ x: number; y: number }>): boolean {
    if (pts.length < 3) return true;
    const EPS = 1e-10;
    // Find three distinct points
    const a = pts[0] as { x: number; y: number };
    let b: { x: number; y: number } | null = null;
    let c: { x: number; y: number } | null = null;
    for (let i = 1; i < pts.length; i++) {
        const pi = pts[i] as { x: number; y: number };
        const dx = pi.x - a.x;
        const dy = pi.y - a.y;
        if (dx * dx + dy * dy > EPS) {
            if (!b) {
                b = pi;
                continue;
            }
            // Check area with a, b, pts[i]
            const area = Math.abs((b.x - a.x) * (pi.y - a.y) - (pi.x - a.x) * (b.y - a.y));
            if (area > EPS) {
                c = pi;
                break;
            }
        }
    }
    return !c;
}

/**
 * Solve 6-parameter affine matrix from control points via least-squares.
 * Transform: E = a0 + a1*px + a2*py, N = b0 + b1*px + b2*py
 * Returns [a0, a1, a2, b0, b1, b2].
 * @returns 6-element array or null on failure
 */
export function solveAffineMatrix(controlPoints: ControlPoint[]): number[] | null {
    const check = validateControlPoints(controlPoints);
    if (!check.valid) return null;

    const _n = controlPoints.length;
    // Build normal equations: A^T * A * x = A^T * b (for E and N separately)
    // A row = [1, px, py]
    const ata = _buildATA(controlPoints);
    const atbE = _buildATb(controlPoints, 'easting');
    const atbN = _buildATb(controlPoints, 'northing');

    const solE = _solve3x3(ata, atbE);
    const solN = _solve3x3(ata, atbN);
    if (!solE || !solN) return null;

    return [solE[0], solE[1], solE[2], solN[0], solN[1], solN[2]] as number[];
}

/**
 * Build A^T * A (3x3) from control points.
 */
function _buildATA(pts: ControlPoint[]): number[][] {
    const m: number[][] = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (const p of pts) {
        const r = [1, p.pixel.x, p.pixel.y];
        for (let i = 0; i < 3; i++) {
            const mi = m[i] as number[];
            for (let j = 0; j < 3; j++) {
                mi[j] = (mi[j] as number) + (r[i] as number) * (r[j] as number);
            }
        }
    }
    return m;
}

/**
 * Build A^T * b (3x1) for a given geo component.
 * @param comp - 'easting' or 'northing'
 */
function _buildATb(pts: ControlPoint[], comp: 'easting' | 'northing'): number[] {
    const v = [0, 0, 0];
    for (const p of pts) {
        const r = [1, p.pixel.x, p.pixel.y];
        const b = p.geo[comp];
        for (let i = 0; i < 3; i++) {
            v[i] = (v[i] as number) + (r[i] as number) * b;
        }
    }
    return v;
}

/**
 * Solve 3x3 linear system via Cramer's rule.
 * @param A - 3x3 matrix
 * @param b - 3x1 vector
 */
function _solve3x3(A: number[][], b: number[]): number[] | null {
    const det = _det3(A);
    if (Math.abs(det) < 1e-15) return null;

    const x: number[] = [];
    for (let col = 0; col < 3; col++) {
        const M = A.map((row) => [...row]);
        for (let r = 0; r < 3; r++) (M[r] as number[])[col] = b[r] as number;
        x.push(_det3(M) / det);
    }
    return x;
}

/**
 * Determinant of a 3x3 matrix.
 */
function _det3(M: number[][]): number {
    const m0 = M[0] as number[];
    const m1 = M[1] as number[];
    const m2 = M[2] as number[];
    return (
        (m0[0] as number) * ((m1[1] as number) * (m2[2] as number) - (m1[2] as number) * (m2[1] as number)) -
        (m0[1] as number) * ((m1[0] as number) * (m2[2] as number) - (m1[2] as number) * (m2[0] as number)) +
        (m0[2] as number) * ((m1[0] as number) * (m2[1] as number) - (m1[1] as number) * (m2[0] as number))
    );
}

/**
 * Apply affine transform: pixel → geo.
 * @param matrix - [a0, a1, a2, b0, b1, b2]
 * @param px - pixel X
 * @param py - pixel Y
 */
export function pixelToGeo(matrix: number[], px: number, py: number): { easting: number; northing: number } {
    if (!matrix || matrix.length !== 6) return { easting: 0, northing: 0 };
    const [a0, a1, a2, b0, b1, b2] = matrix as [number, number, number, number, number, number];
    return {
        easting: a0 + a1 * px + a2 * py,
        northing: b0 + b1 * px + b2 * py,
    };
}

/**
 * Inverse affine transform: geo → pixel.
 * @param matrix - [a0, a1, a2, b0, b1, b2]
 */
export function geoToPixel(matrix: number[], easting: number, northing: number): { x: number; y: number } {
    if (!matrix || matrix.length !== 6) return { x: 0, y: 0 };
    const [a0, a1, a2, b0, b1, b2] = matrix as [number, number, number, number, number, number];
    // Solve: E = a0 + a1*px + a2*py, N = b0 + b1*px + b2*py
    const det = a1 * b2 - a2 * b1;
    if (Math.abs(det) < 1e-15) return { x: 0, y: 0 };
    const dE = easting - a0;
    const dN = northing - b0;
    return {
        x: (dE * b2 - a2 * dN) / det,
        y: (a1 * dN - dE * b1) / det,
    };
}

/**
 * Calculate RMS error of the affine transform against control points.
 * @param matrix - [a0, a1, a2, b0, b1, b2]
 * @returns RMS error in coordinate units (meters if projected CRS)
 */
export function calculateRMSError(matrix: number[], controlPoints: ControlPoint[]): number {
    if (!matrix || !Array.isArray(controlPoints) || controlPoints.length === 0) {
        return Infinity;
    }
    let sumSq = 0;
    for (const p of controlPoints) {
        const pred = pixelToGeo(matrix, p.pixel.x, p.pixel.y);
        const dE = pred.easting - p.geo.easting;
        const dN = pred.northing - p.geo.northing;
        sumSq += dE * dE + dN * dN;
    }
    return Math.sqrt(sumSq / controlPoints.length);
}

/**
 * Generate ESRI World File (TFW/PGW/JGW/TIFW) content from affine matrix.
 *
 * Formato world file (6 linhas, 1 valor por linha, ponto como separador
 * decimal, line-separator LF per ESRI spec):
 *
 *   A : pixel size in x-direction (map units)
 *   D : rotation about y-axis (usually 0)
 *   B : rotation about x-axis (usually 0)
 *   E : negative pixel size in y-direction (origem top-left)
 *   C : x-coordinate of center of upper-left pixel
 *   F : y-coordinate of center of upper-left pixel
 *
 * Relação com affine matrix [a0, a1, a2, b0, b1, b2]:
 *   easting(px, py)  = a0 + a1*px + a2*py
 *   northing(px, py) = b0 + b1*px + b2*py
 *
 * World file usa center-of-pixel: centro (0,0) = (a0, b0).
 * Não há half-pixel offset neste mapeamento (caller pode ajustar se necessário).
 *
 * Referência: ESRI Support - World File Format
 * https://support.esri.com/en-us/knowledge-base/faq-what-is-the-format-of-the-world-file-used-for-geore-000002860
 *
 * @param matrix - [a0, a1, a2, b0, b1, b2]
 * @returns Conteúdo do world file (6 linhas separadas por \n) ou null se matrix inválida
 */
export function generateWorldFile(matrix: number[]): string | null {
    if (!Array.isArray(matrix) || matrix.length !== 6) return null;
    const [a0, a1, a2, b0, b1, b2] = matrix as [number, number, number, number, number, number];
    // ESRI world file: A (a1), D (b1), B (a2), E (b2), C (a0), F (b0)
    return [a1, b1, a2, b2, a0, b0].map((v) => Number(v).toFixed(10)).join('\n') + '\n';
}

/**
 * Cria elemento `rasterMap` compatível com schema PDPL-U do ECBT.
 *
 * Representa um mapa histórico georreferenciado como elemento de primeiro
 * cidadão no modelo, serializável em ECBT key. Pode ser usado como par de
 * treinamento para geoML (G4) ou overlay visual no terreno.
 *
 * Spec: docs/specs/features/SPEC_G3_RASTER_UPLOAD_GEOREF.md §"Integração"
 */
interface CreateRasterMapElementParams {
    id: string;
    name?: string;
    imageUrl: string;
    imageDimensions: { width: number; height: number };
    matrix: number[];
    controlPoints: ControlPoint[];
    rmsError?: number;
    projection?: string;
    filename?: string;
    createdBy?: string;
    isolines?: Array<any>;
}

function _validateRasterMapParams(params: CreateRasterMapElementParams | null | undefined): void {
    if (!params || typeof params !== 'object') {
        throw new Error('createRasterMapElement: params required');
    }
    if (!params.id) throw new Error('createRasterMapElement: id required');
    if (!params.imageUrl) throw new Error('createRasterMapElement: imageUrl required');
    if (!Array.isArray(params.matrix) || params.matrix.length !== 6) {
        throw new Error('createRasterMapElement: matrix [a0,a1,a2,b0,b1,b2] required');
    }
    if (!Array.isArray(params.controlPoints) || params.controlPoints.length < 4) {
        throw new Error('createRasterMapElement: ≥4 controlPoints required');
    }
    const dims = params.imageDimensions;
    if (!dims || !Number.isFinite(dims.width) || !Number.isFinite(dims.height)) {
        throw new Error('createRasterMapElement: imageDimensions {width, height} required');
    }
}

function _resolveRmsError(params: CreateRasterMapElementParams): number {
    return Number.isFinite(params.rmsError)
        ? (params.rmsError as number)
        : calculateRMSError(params.matrix, params.controlPoints);
}

function _buildRasterMapData(
    params: CreateRasterMapElementParams,
    rmsError: number,
): Record<string, any> {
    const dims = params.imageDimensions;
    const filename = params.filename || 'historical-map';
    return {
        imageUrl: String(params.imageUrl),
        imageDimensions: {
            width: Number(dims.width),
            height: Number(dims.height),
        },
        matrix: [...params.matrix],
        rmsError: Number(rmsError),
        controlPoints: params.controlPoints.map((p) => ({
            pixel: { x: Number(p.pixel.x), y: Number(p.pixel.y) },
            geo: { easting: Number(p.geo.easting), northing: Number(p.geo.northing) },
        })),
        worldFile: generateWorldFile(params.matrix),
        worldFileExtension: getWorldFileExtension(filename),
        isolines: Array.isArray(params.isolines) ? params.isolines : [],
    };
}

function _buildRasterMapMetadata(params: CreateRasterMapElementParams): Record<string, any> {
    const filename = params.filename || 'historical-map';
    return {
        projection: params.projection || 'UTM',
        filename,
        createdBy: params.createdBy || 'system',
    };
}

export function createRasterMapElement(params: CreateRasterMapElementParams): Record<string, any> {
    _validateRasterMapParams(params);
    const rmsError = _resolveRmsError(params);
    const filename = params.filename || 'historical-map';
    const name = params.name || filename;
    return {
        id: String(params.id),
        family: 'rasterMap',
        name,
        createdAt: new Date().toISOString(),
        data: _buildRasterMapData(params, rmsError),
        metadata: _buildRasterMapMetadata(params),
    };
}

/**
 * Validate rasterMap element integrity (RMS gate, shape).
 * Reason: rasterMap com RMS > 5m é inaceitável per CETESB mapping guidelines
 * (erro linear exceeds acceptable cartographic precision).
 */
export function validateRasterMapElement(
    element: any,
    options: { maxRMS?: number } = {},
): { valid: boolean; error?: string; warnings?: string[] } {
    const maxRMS = options.maxRMS ?? 5;
    if (!element || typeof element !== 'object') {
        return { valid: false, error: 'element required' };
    }
    if (element.family !== 'rasterMap') {
        return { valid: false, error: `expected family="rasterMap", got "${element.family}"` };
    }
    const data = element.data;
    if (!data || typeof data !== 'object') {
        return { valid: false, error: 'data object required' };
    }
    if (!Array.isArray(data.matrix) || data.matrix.length !== 6) {
        return { valid: false, error: 'data.matrix invalid' };
    }
    if (!Array.isArray(data.controlPoints) || data.controlPoints.length < 4) {
        return { valid: false, error: 'data.controlPoints must have ≥4 entries' };
    }
    const warnings: string[] = [];
    if (Number.isFinite(data.rmsError) && data.rmsError > maxRMS) {
        warnings.push(`RMS error ${data.rmsError.toFixed(2)}m exceeds max ${maxRMS}m`);
    }
    if (!data.worldFile) {
        warnings.push('worldFile missing (regenerate via generateWorldFile)');
    }
    return { valid: true, warnings };
}

/**
 * Determina extensão apropriada para world file baseado na extensão do raster.
 * @returns extension (ex: 'pgw', 'tfw', 'jgw')
 */
export function getWorldFileExtension(rasterFilename: string): string {
    if (typeof rasterFilename !== 'string' || !rasterFilename.includes('.')) return 'wld';
    const parts = rasterFilename.split('.');
    const ext = (parts[parts.length - 1] || '').toLowerCase();
    const map: Record<string, string> = {
        png: 'pgw',
        tif: 'tfw',
        tiff: 'tfw',
        jpg: 'jgw',
        jpeg: 'jgw',
        gif: 'gfw',
        bmp: 'bpw',
    };
    return map[ext] || 'wld';
}
