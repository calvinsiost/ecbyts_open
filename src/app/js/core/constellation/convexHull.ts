// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Convex Hull - Phase 1.20 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S20
 *
 * Phase 1.20 (2026-05-01) - pure-logic Graham scan para computar
 * convex hull de N pontos. Útil para visualizar boundaries de
 * clusters em constelações.
 *
 * Estratégia:
 *   - Graham scan: O(n log n) sort + linear scan
 *   - Cross product determina turn direction (CCW/CW/collinear)
 *   - Skip duplicates + colinear edge cases
 *   - Helpers: area, perimeter, centroid
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const CONVEX_HULL_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.20',
    deliveredAt: '2026-05-01',
});

/**
 * Cross product (sinal de turn).
 * > 0: CCW (left turn)
 * < 0: CW (right turn)
 * = 0: collinear
 *
 * @param {{x: number, y: number} | null | undefined} o
 * @param {{x: number, y: number} | null | undefined} a
 * @param {{x: number, y: number} | null | undefined} b
 * @returns {number}
 */
export function cross(o: {x: number, y: number} | null | undefined, a: {x: number, y: number} | null | undefined, b: {x: number, y: number} | null | undefined): number {
    if (!o || !a || !b) return 0;
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Distância euclideana ao quadrado.
 *
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @returns {number}
 */
function distSq(a: {x: number, y: number}, b: {x: number, y: number}): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

/**
 * Computa convex hull (lower + upper hull combinados).
 *
 * Algorithm: Andrew's monotone chain (O(n log n)).
 *
 * @param {Array<{x: number, y: number}>} points
 * @returns {ReadonlyArray<{x: number, y: number}>} pontos do hull em ordem CCW
 */
export function computeConvexHull(points: Array<{x: number, y: number}>): ReadonlyArray<{x: number, y: number}> {
    if (!Array.isArray(points)) return [];
    const valid = points.filter(
        /** @param {{x: number, y: number} | null | undefined} p */
        (p) => !!p && Number.isFinite(p.x) && Number.isFinite(p.y),
    );
    if (valid.length === 0) return [];
    if (valid.length === 1) return [valid[0]!];
    if (valid.length === 2) return [...valid];

    // Sort by x, then y
    const sorted = [...valid].sort(
        /**
         * @param {{x: number, y: number}} a
         * @param {{x: number, y: number}} b
         */
        (a, b) => a.x - b.x || a.y - b.y,
    );

    // Build lower hull
        const lower: Array<{x: number, y: number}>= [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }

    // Build upper hull
        const upper: Array<{x: number, y: number}>= [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i]!;
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }

    // Concat (last point of each is duplicate of first of next)
    lower.pop();
    upper.pop();
    return Object.freeze([...lower, ...upper]);
}

/**
 * Calcula área de um polígono via shoelace.
 *
 * @param {ReadonlyArray<{x: number, y: number}>} polygon - pontos em ordem (CCW ou CW)
 * @returns {number} área absoluta
 */
export function polygonArea(polygon: ReadonlyArray<{x: number, y: number}>): number {
    if (!Array.isArray(polygon) || polygon.length < 3) return 0;
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (!a || !b) continue;
        sum += (a.x || 0) * (b.y || 0) - (b.x || 0) * (a.y || 0);
    }
    return Math.abs(sum) / 2;
}

/**
 * Calcula perímetro do polígono.
 *
 * @param {ReadonlyArray<{x: number, y: number}>} polygon
 * @returns {number}
 */
export function polygonPerimeter(polygon: ReadonlyArray<{x: number, y: number}>): number {
    if (!Array.isArray(polygon) || polygon.length < 2) return 0;
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (!a || !b) continue;
        sum += Math.sqrt(distSq(a, b));
    }
    return sum;
}

/**
 * Centróide geométrico (média aritmética de x, y).
 *
 * @param {ReadonlyArray<{x: number, y: number} | null | undefined>} polygon
 * @returns {Readonly<{x: number, y: number}>}
 */
export function polygonCentroid(polygon: ReadonlyArray<{x: number, y: number} | null | undefined>): Readonly<{x: number, y: number}> {
    if (!Array.isArray(polygon) || polygon.length === 0) {
        return Object.freeze({ x: 0, y: 0 });
    }
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const p of polygon) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        sx += p.x;
        sy += p.y;
        count++;
    }
    if (count === 0) return Object.freeze({ x: 0, y: 0 });
    return Object.freeze({ x: sx / count, y: sy / count });
}

/**
 * Verifica se ponto está dentro de polígono (ray casting).
 *
 * @param {{x: number, y: number}} point
 * @param {ReadonlyArray<{x: number, y: number} | null | undefined>} polygon
 * @returns {boolean}
 */
export function pointInPolygon(point: {x: number, y: number}, polygon: ReadonlyArray<{x: number, y: number} | null | undefined>): boolean {
    if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        if (!pi || !pj) continue;
        if (pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Expande polígono em offset perpendicular (inflate).
 *
 * @param {ReadonlyArray<{x: number, y: number} | null | undefined>} polygon
 * @param {number} offset
 * @returns {ReadonlyArray<Readonly<{x: number, y: number}>>}
 */
export function inflatePolygon(polygon: ReadonlyArray<{x: number, y: number} | null | undefined>, offset: number): ReadonlyArray<Readonly<{x: number, y: number}>> {
    if (!Array.isArray(polygon) || polygon.length < 3) return [];
    if (!Number.isFinite(offset)) {
        return Object.freeze(
            polygon.map(
                /** @param {{x: number, y: number} | null | undefined} p */
                (p) => Object.freeze({ x: p ? p.x : 0, y: p ? p.y : 0 }),
            ),
        );
    }
    const center = polygonCentroid(polygon);
    return Object.freeze(
        polygon.map(
            /** @param {{x: number, y: number} | null | undefined} p */
            (p) => {
                if (!p) return Object.freeze({ x: 0, y: 0 });
                const dx = p.x - center.x;
                const dy = p.y - center.y;
                const len = Math.sqrt(dx * dx + dy * dy) || 1;
                const factor = (len + offset) / len;
                return Object.freeze({
                    x: center.x + dx * factor,
                    y: center.y + dy * factor,
                });
            },
        ),
    );
}

/**
 * Compute hull bounds (AABB).
 *
 * @param {ReadonlyArray<{x: number, y: number} | null | undefined>} polygon
 * @returns {Readonly<{minX: number, minY: number, maxX: number, maxY: number}> | null}
 */
export function hullBounds(polygon: ReadonlyArray<{x: number, y: number} | null | undefined>): Readonly<{minX: number, minY: number, maxX: number, maxY: number}> | null {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let valid = false;
    for (const p of polygon) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
        valid = true;
    }
    if (!valid) return null;
    return Object.freeze({ minX, minY, maxX, maxY });
}

/**
 * Module identity export.
 */
export const convexHullMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.20',
    deliveredAt: '2026-05-01',
    exports: [
        'CONVEX_HULL_META',
        'cross',
        'computeConvexHull',
        'polygonArea',
        'polygonPerimeter',
        'polygonCentroid',
        'pointInPolygon',
        'inflatePolygon',
        'hullBounds',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
