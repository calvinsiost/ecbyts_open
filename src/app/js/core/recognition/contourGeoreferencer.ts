// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONTOUR GEOREFERENCER — Bridge entre pixel contours e mundo 3D
   ================================================================
   P1-7 G3 Raster Upload Georef DoD §"Integração" (Claude-owner).

   Converte chains de pixels (output de contourExtractor.js) para
   coordenadas 3D do mundo usando affine matrix (output de
   rasterGeoref.solveAffineMatrix). Suporta:

   - assignContourLevels: mapeia chains de pixels → elevação (manual ou OCR)
   - georeferenceContour: pixel chain (com elevação) → polyline 3D
   - georeferenceContours: pipeline batch
   - exportContoursAsGeoJSON: serialização GeoJSON LineString
   - simplifyPolyline: Douglas-Peucker para reduzir vértices

   Convenção 3D: X=Easting, Y=Elevation (positiva acima), Z=Northing
   (Three.js + ENU mapping).

   Spec: docs/specs/features/SPEC_G3_RASTER_UPLOAD_GEOREF.md
        §"Exportar isolinhas como linhas 3D"
   ================================================================ */

import { pixelToGeo } from './rasterGeoref.js';

interface ContourPolyline3D {
    points: Array<{ x: number; y: number; z: number }>;
    elevation: number;
    id?: string;
}

/**
 * Atribui níveis de elevação a chains de contornos. Aceita:
 * - levels[]: paralelo a chains (chains[i].level = levels[i])
 * - levelFn: função (chain, idx) → elevação
 * - levelByLength: mapping {minLength: elevation} para auto-classificação
 */
export function assignContourLevels(
    chains: Array<Array<{ x: number; y: number }>>,
    options: { levels?: number[]; levelFn?: Function; defaultLevel?: number } = {},
): Array<{ chain: Array<{ x: number; y: number }>; level: number }> {
    if (!Array.isArray(chains)) return [];
    const { levels, levelFn, defaultLevel = 0 } = options;
    return chains.map((chain, idx) => {
        let level = defaultLevel;
        if (Array.isArray(levels) && idx < levels.length && Number.isFinite(levels[idx])) {
            level = Number(levels[idx]);
        } else if (typeof levelFn === 'function') {
            const result = levelFn(chain, idx);
            if (Number.isFinite(result)) level = Number(result);
        }
        return { chain, level };
    });
}

/**
 * Converte pixel chain em polyline 3D usando affine matrix + elevação.
 */
export function georeferenceContour(
    pixelChain: Array<{ x: number; y: number }>,
    elevation: number,
    matrix: number[],
    opts: { id?: string } = {},
): ContourPolyline3D | null {
    if (!Array.isArray(pixelChain) || pixelChain.length === 0) return null;
    if (!Array.isArray(matrix) || matrix.length !== 6) return null;
    if (!Number.isFinite(elevation)) return null;
    const points = pixelChain.map((p) => {
        const geo = pixelToGeo(matrix, Number(p.x) || 0, Number(p.y) || 0);
        return { x: geo.easting, y: elevation, z: geo.northing };
    });
    const result = { points, elevation } as ContourPolyline3D;
    if (opts.id) result.id = String(opts.id);
    return result;
}

/**
 * Pipeline batch: chains com níveis → polylines 3D.
 */
export function georeferenceContours(
    chainsWithLevels: Array<{ chain: Array<{ x: number; y: number }>; level: number }>,
    matrix: number[],
): ContourPolyline3D[] {
    if (!Array.isArray(chainsWithLevels) || !Array.isArray(matrix)) return [];
    const result = [];
    for (let i = 0; i < chainsWithLevels.length; i++) {
        const entry = chainsWithLevels[i];
        if (!entry || !Array.isArray(entry.chain)) continue;
        const polyline = georeferenceContour(entry.chain, entry.level, matrix, {
            id: `contour-${i}`,
        });
        if (polyline) result.push(polyline);
    }
    return result;
}

/**
 * Distância perpendicular do ponto à linha (a, b). Para Douglas-Peucker.
 */
function _perpDistance2D(
    point: { x: number; z: number },
    a: { x: number; z: number },
    b: { x: number; z: number },
): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-15) {
        const ddx = point.x - a.x;
        const ddz = point.z - a.z;
        return Math.sqrt(ddx * ddx + ddz * ddz);
    }
    const num = Math.abs(dz * point.x - dx * point.z + b.x * a.z - b.z * a.x);
    return num / Math.sqrt(len2);
}

/**
 * Algoritmo Douglas-Peucker para simplificação de polilinha 2D no plano XZ
 * (mantém Y constante, ignora elevação na simplificação geométrica).
 *
 * Reduz número de vértices preservando forma geral. Útil para exportar isolinhas
 * limpas (raster gera centenas de pixels por contorno; suficiente ~10-50 para
 * visualização).
 */
export function simplifyPolyline(
    points: Array<{ x: number; y: number; z: number }>,
    epsilon: number,
): Array<{ x: number; y: number; z: number }> {
    if (!Array.isArray(points) || points.length < 3) return points || [];
    const eps = Number(epsilon);
    if (!Number.isFinite(eps) || eps <= 0) return [...points];

    // Encontra ponto com max distância à linha entre primeiro e último
    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    for (let i = 1; i < points.length - 1; i++) {
        const d = _perpDistance2D(points[i]!, first, last);
        if (d > maxDist) {
            maxDist = d;
            maxIdx = i;
        }
    }
    if (maxDist > eps) {
        const left = simplifyPolyline(points.slice(0, maxIdx + 1), eps);
        const right = simplifyPolyline(points.slice(maxIdx), eps);
        return [...left.slice(0, -1), ...right];
    }
    return [first, last];
}

/**
 * Aplica simplifyPolyline a array de polylines 3D in-place style (retorna copy).
 */
export function simplifyContours(polylines: ContourPolyline3D[], epsilon: number): ContourPolyline3D[] {
    if (!Array.isArray(polylines)) return [];
    return polylines.map((p) => ({
        ...p,
        points: simplifyPolyline(p.points, epsilon),
    }));
}

/**
 * Exporta polylines 3D como GeoJSON FeatureCollection com LineString.
 * Coordenadas em [easting, northing, elevation] per spec GeoJSON 1.1.
 */
export function exportContoursAsGeoJSON(polylines: ContourPolyline3D[], opts: { crs?: string } = {}): object {
    const features = [];
    if (Array.isArray(polylines)) {
        for (const poly of polylines) {
            if (!poly || !Array.isArray(poly.points) || poly.points.length < 2) continue;
            const coordinates = poly.points.map((p) => [
                Number(p.x) || 0, // easting
                Number(p.z) || 0, // northing
                Number(p.y) || 0, // elevation
            ]);
            features.push({
                type: 'Feature',
                geometry: { type: 'LineString', coordinates },
                properties: {
                    elevation: poly.elevation,
                    ...(poly.id ? { id: poly.id } : {}),
                },
            });
        }
    }
    return {
        type: 'FeatureCollection',
        features,
        metadata: {
            generator: 'ecbyts/contourGeoreferencer',
            crs: opts.crs || 'EPSG:UTM',
            featureCount: features.length,
        },
    };
}
