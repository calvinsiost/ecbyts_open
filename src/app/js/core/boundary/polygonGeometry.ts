// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   POLYGON GEOMETRY — SPEC_MAP_POLYGON_CROP

   Pure helpers para recorte de polígono no MapPicker:
   - validatePolygonRing (fechado, ≥3 vértices, sem auto-intersect)
   - isPointInPolygon (ray casting)
   - signedArea / isClockwise / ensureCounterclockwise
   - polygonBounds + polygonCentroid
   - selectElementsInside (filtro de elementos por posição)
   - segmentsIntersect (Bentley-Ottmann simplificado)
   - toGeoJSON (FeatureCollection Polygon shape)

   Sem dependência de MapLibre/Leaflet — pronto para node:test.
   Limites §Q4: maxVertices=50 default, configurável.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants §Q4
// ──────────────────────────────────────────────────────────────────────

export const MIN_VERTICES = 3;
export const DEFAULT_MAX_VERTICES = 50;
export const CLOSE_TOLERANCE_DEG = 1e-6; // tolerância para considerar polígono fechado
export const MIN_AREA_SQ_DEG = 1e-12; // polígonos degenerados (área zero)

export const DRAW_MODES = Object.freeze(['point', 'bounds', 'polygon']);

// ──────────────────────────────────────────────────────────────────────
// Helpers de ponto e segmento
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {*} pt
 * @returns {{x: number, y: number}|null}
 */
export function normalizePoint(pt: any): {x: number, y: number}|null {
    if (!pt) return null;
    if (Array.isArray(pt) && pt.length >= 2) {
        const x = Number(pt[0]);
        const y = Number(pt[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
    if (typeof pt === 'object') {
        const x = Number(pt.x ?? pt.lng ?? pt.lon ?? pt.longitude);
        const y = Number(pt.y ?? pt.lat ?? pt.latitude);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }
    return null;
}

/**
 * Verifica se dois pontos coincidem dentro de tolerância.
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {number} [tol]
 * @returns {boolean}
 */
export function pointsEqual(a: {x: number, y: number} | undefined, b: {x: number, y: number} | undefined, tol: number = CLOSE_TOLERANCE_DEG): boolean {
    if (!a || !b) return false;
    return Math.abs(a.x - b.x) < tol && Math.abs(a.y - b.y) < tol;
}

/**
 * Teste de interseção entre dois segmentos (a1-a2) e (b1-b2).
 * Retorna true se os segmentos cruzam (não conta endpoint-shared).
 *
 * @param {{x: number, y: number}} a1
 * @param {{x: number, y: number}} a2
 * @param {{x: number, y: number}} b1
 * @param {{x: number, y: number}} b2
 * @returns {boolean}
 */
export function segmentsIntersect(a1: {x: number, y: number} | undefined, a2: {x: number, y: number} | undefined, b1: {x: number, y: number} | undefined, b2: {x: number, y: number} | undefined): boolean {
    if (!a1 || !a2 || !b1 || !b2) return false;
    function orient(p: {x: number, y: number}, q: {x: number, y: number}, r: {x: number, y: number}) {
        const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
        if (Math.abs(val) < 1e-12) return 0;
        return val > 0 ? 1 : -1;
    }
    const o1 = orient(a1, a2, b1);
    const o2 = orient(a1, a2, b2);
    const o3 = orient(b1, b2, a1);
    const o4 = orient(b1, b2, a2);

    if (o1 !== o2 && o3 !== o4) return true;
    return false;
}

// ──────────────────────────────────────────────────────────────────────
// Ring normalization
// ──────────────────────────────────────────────────────────────────────

/**
 * Normaliza ring: converte pontos, remove ponto de fechamento duplicado se houver.
 *
 * @param {Array<any>} ring
 * @returns {Array<{x: number, y: number}>}
 */
export function normalizeRing(ring: Array<any>): Array<{x: number, y: number}> {
    if (!Array.isArray(ring)) return [];
    const points = [];
    for (const pt of ring) {
        const p = normalizePoint(pt);
        if (p) points.push(p);
    }
    if (points.length >= 2 && pointsEqual(points[0], points[points.length - 1])) {
        points.pop();
    }
    return points;
}

// ──────────────────────────────────────────────────────────────────────
// Polygon validation §S2
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida ring de polígono: ≥3 vértices distintos, sem auto-interseção.
 *
 * @param {Array<any>} ring
 * @param {{ maxVertices?: number }} [opts]
 * @returns {{ valid: boolean, errors: Array<any>, normalizedRing: Array<any> }}
 */
export function validatePolygonRing(ring: Array<any>, opts: { maxVertices?: number } = {}): { valid: boolean, errors: Array<any>, normalizedRing: Array<any> } {
        const errors: Array<{code: string, message: string}>= [];
    const maxVerts: number = (Number.isFinite(opts?.maxVertices) ? (opts.maxVertices as number) : DEFAULT_MAX_VERTICES);
    const normalized = normalizeRing(ring);

    if (normalized.length < MIN_VERTICES) {
        errors.push({ code: 'too_few_vertices', message: `Mínimo ${MIN_VERTICES} vértices distintos` });
    }
    if (normalized.length > maxVerts) {
        errors.push({ code: 'too_many_vertices', message: `Máximo ${maxVerts} vértices` });
    }

    // Check auto-interseção (só se tivermos pelo menos 4 vértices)
    if (normalized.length >= 4 && errors.length === 0) {
        const n = normalized.length;
        for (let i = 0; i < n; i++) {
            const a1 = normalized[i];
            const a2 = normalized[(i + 1) % n];
            for (let j = i + 2; j < n; j++) {
                if (i === 0 && j === n - 1) continue; // adjacentes
                const b1 = normalized[j];
                const b2 = normalized[(j + 1) % n];
                if (segmentsIntersect(a1, a2, b1, b2)) {
                    errors.push({
                        code: 'self_intersection',
                        message: `Auto-interseção entre segmentos ${i} e ${j}`,
                    });
                    break;
                }
            }
            if (errors.some((e) => e.code === 'self_intersection')) break;
        }
    }

    // Check área não-degenerada
    if (errors.length === 0) {
        const area = Math.abs(signedArea(normalized));
        if (area < MIN_AREA_SQ_DEG) {
            errors.push({ code: 'degenerate', message: 'Área zero (colinear)' });
        }
    }

    return { valid: errors.length === 0, errors, normalizedRing: normalized };
}

// ──────────────────────────────────────────────────────────────────────
// Area + orientation
// ──────────────────────────────────────────────────────────────────────

/**
 * Shoelace formula - área com sinal.
 * Positivo = CCW (antihorário), Negativo = CW (horário).
 *
 * @param {Array<{x: number, y: number}>} ring
 * @returns {number}
 */
export function signedArea(ring: Array<{x: number, y: number}>): number {
    if (!Array.isArray(ring) || ring.length < 3) return 0;
    let sum = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        sum += (b.x - a.x) * (b.y + a.y);
    }
    return -sum / 2;
}

/**
 * @param {Array<{x: number, y: number}>} ring
 * @returns {boolean}
 */
export function isClockwise(ring: Array<{x: number, y: number}>): boolean {
    return signedArea(ring) < 0;
}

/**
 * Retorna ring em ordem CCW (padrão GeoJSON exterior ring).
 *
 * @param {Array<{x: number, y: number}>} ring
 * @returns {Array<{x: number, y: number}>}
 */
export function ensureCounterclockwise(ring: Array<{x: number, y: number}>): Array<{x: number, y: number}> {
    if (!Array.isArray(ring)) return [];
    return isClockwise(ring) ? ring.slice().reverse() : ring.slice();
}

// ──────────────────────────────────────────────────────────────────────
// Bounds + centroid
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Array<{x: number, y: number}>} ring
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
 */
export function polygonBounds(ring: Array<{x: number, y: number}>): {minX: number, minY: number, maxX: number, maxY: number}|null {
    if (!Array.isArray(ring) || ring.length === 0) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const p of ring) {
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    if (!Number.isFinite(minX)) return null;
    return { minX, minY, maxX, maxY };
}

/**
 * Centroide ponderado por área (método shoelace weighted).
 *
 * @param {Array<{x: number, y: number}>} ring
 * @returns {{x: number, y: number}|null}
 */
export function polygonCentroid(ring: Array<{x: number, y: number}>): {x: number, y: number}|null {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    let cx = 0,
        cy = 0,
        area = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const a = ring[i]!;
        const b = ring[(i + 1) % n]!;
        const f = a.x * b.y - b.x * a.y;
        cx += (a.x + b.x) * f;
        cy += (a.y + b.y) * f;
        area += f;
    }
    area *= 0.5;
    if (Math.abs(area) < MIN_AREA_SQ_DEG) return null;
    return { x: cx / (6 * area), y: cy / (6 * area) };
}

// ──────────────────────────────────────────────────────────────────────
// Point-in-polygon (ray casting)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {{x: number, y: number}} pt
 * @param {Array<{x: number, y: number}>} ring
 * @returns {boolean}
 */
export function isPointInPolygon(pt: {x: number, y: number}, ring: Array<{x: number, y: number}>): boolean {
    const p = normalizePoint(pt);
    if (!p || !Array.isArray(ring) || ring.length < 3) return false;
    let inside = false;
    const n = ring.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = ring[i]!.x,
            yi = ring[i]!.y;
        const xj = ring[j]!.x,
            yj = ring[j]!.y;
        const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

// ──────────────────────────────────────────────────────────────────────
// Selection + GeoJSON
// ──────────────────────────────────────────────────────────────────────

/**
 * Filtra elementos cuja posição cai dentro do polígono.
 *
 * @param {Array<any>} elements - cada um com .position {x,y} ou .lng/.lat
 * @param {Array<{x: number, y: number}>} ring
 * @returns {Array<any>} elementos inside
 */
export function selectElementsInside(elements: Array<any>, ring: Array<{x: number, y: number}>): Array<any> {
    if (!Array.isArray(elements)) return [];
    const result = [];
    for (const el of elements) {
        if (!el) continue;
        const p = normalizePoint(el.position ?? el);
        if (p && isPointInPolygon(p, ring)) result.push(el);
    }
    return result;
}

/**
 * Converte ring para GeoJSON Feature Polygon (fechamento automático).
 *
 * @param {Array<{x: number, y: number}>} ring
 * @param {Object} [properties]
 * @returns {Object|null}
 */
export function ringToGeoJSON(ring: Array<{x: number, y: number}>, properties: Object = {}): Object|null {
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const ccw = ensureCounterclockwise(ring);
    const coords = ccw.map((p) => [p.x, p.y]);
    // Fecha o ring (primeiro = último)
    if (coords.length > 0) coords.push([coords[0]![0]!, coords[0]![1]!]);
    return {
        type: 'Feature',
        geometry: {
            type: 'Polygon',
            coordinates: [coords],
        },
        properties: { ...properties },
    };
}

