// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Crossings - Phase 1.42 pure-logic helpers.
 * Spec: docs/specs/features/SPEC_CONSTELLATION_HUD_9_75.md (extension)
 *
 * Phase 1.42 (2026-05-01) - segment intersection detection for graph
 * readability metrics. Counts how many edges cross each other in the current
 * 2D layout. Used to evaluate layout quality and inform untangling routines.
 *
 * Funções:
 *   - detectIntersection(a, b, c, d): boolean | {x, y}
 *   - countCrossings(edges, positions): integer count of crossing pairs
 *   - summarizeCrossings(edges, positions): { total, perEdge, ratio }
 *
 * Algoritmo: orientation test (CCW) com fallback para colinear via bbox.
 * Ignora pares que compartilham endpoint (não conta como crossing).
 *
 * Determinístico, O(E^2) brute force - adequado para grafos < 2000 edges.
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador)
 */

export interface Point2D {
    x: number;
    y: number;
}

export interface CrossingEdge {
    source: string;
    target: string;
    id?: string;
}

export type PositionMap = Map<string, Point2D> | Record<string, Point2D>;

export const EDGE_CROSSINGS_META = {
    spec: 'CONSTELLATION_HUD_9_75',
    phase: '1.42',
    deliveredAt: '2026-05-01',
} as const;

const EPSILON = 1e-10;

/**
 * Orientation of ordered triplet (p, q, r):
 *   > 0  → counter-clockwise
 *   < 0  → clockwise
 *   = 0  → collinear
 *
 * @param {Point2D} p
 * @param {Point2D} q
 * @param {Point2D} r
 * @returns {number}
 */
function orientation(p: Point2D, q: Point2D, r: Point2D): number {
    const val = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
    if (Math.abs(val) < EPSILON) return 0;
    return val;
}

/**
 * True if point q lies on segment pr (assumed collinear).
 * @param {Point2D} p
 * @param {Point2D} q
 * @param {Point2D} r
 * @returns {boolean}
 */
function onSegment(p: Point2D, q: Point2D, r: Point2D): boolean {
    return (
        q.x <= Math.max(p.x, r.x) + EPSILON &&
        q.x >= Math.min(p.x, r.x) - EPSILON &&
        q.y <= Math.max(p.y, r.y) + EPSILON &&
        q.y >= Math.min(p.y, r.y) - EPSILON
    );
}

/**
 * Detect intersection between segment AB and segment CD.
 * Returns the intersection point {x, y} if they properly intersect,
 * `true` if they touch/overlap collinearly, or `false` otherwise.
 *
 * Endpoints exatamente coincidentes (A==C, A==D, B==C, B==D) retornam false
 * - compartilhar endpoint não é considerado crossing.
 *
 * @param {Point2D | null | undefined} a
 * @param {Point2D | null | undefined} b
 * @param {Point2D | null | undefined} c
 * @param {Point2D | null | undefined} d
 * @returns {false | true | Point2D}
 */
export function detectIntersection(
    a: Point2D | null | undefined,
    b: Point2D | null | undefined,
    c: Point2D | null | undefined,
    d: Point2D | null | undefined,
): false | true | Point2D {
    if (!a || !b || !c || !d) return false;
    if (!Number.isFinite(a.x) || !Number.isFinite(a.y)) return false;
    if (!Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y)) return false;
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y)) return false;

    // Shared endpoint → não conta como crossing.
    const sharesEndpoint =
        (Math.abs(a.x - c.x) < EPSILON && Math.abs(a.y - c.y) < EPSILON) ||
        (Math.abs(a.x - d.x) < EPSILON && Math.abs(a.y - d.y) < EPSILON) ||
        (Math.abs(b.x - c.x) < EPSILON && Math.abs(b.y - c.y) < EPSILON) ||
        (Math.abs(b.x - d.x) < EPSILON && Math.abs(b.y - d.y) < EPSILON);
    if (sharesEndpoint) return false;

    const o1 = orientation(a, b, c);
    const o2 = orientation(a, b, d);
    const o3 = orientation(c, d, a);
    const o4 = orientation(c, d, b);

    // Caso geral - sinais opostos em ambos os pares.
    if (o1 * o2 < 0 && o3 * o4 < 0) {
        // Compute exact intersection point.
        const denom = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
        if (Math.abs(denom) < EPSILON) return true;
        const t = ((a.x - c.x) * (c.y - d.y) - (a.y - c.y) * (c.x - d.x)) / denom;
        return {
            x: a.x + t * (b.x - a.x),
            y: a.y + t * (b.y - a.y),
        };
    }

    // Casos colineares - touchpoint no interior de outro segmento.
    if (o1 === 0 && onSegment(a, c, b)) return true;
    if (o2 === 0 && onSegment(a, d, b)) return true;
    if (o3 === 0 && onSegment(c, a, d)) return true;
    if (o4 === 0 && onSegment(c, b, d)) return true;

    return false;
}

/**
 * Resolve segment endpoints from edge + positions map.
 * @param {CrossingEdge | null | undefined} edge
 * @param {PositionMap} positions
 * @returns {{ s: Point2D, t: Point2D } | null}
 */
function resolveEndpoints(edge: CrossingEdge | null | undefined, positions: PositionMap): { s: Point2D; t: Point2D } | null {
    if (!edge || edge.source == null || edge.target == null) return null;
    
    const get = (id: string): Point2D | undefined => {
        if (positions instanceof Map) {
            return positions.get(id);
        } else {
            return positions[id];
        }
    };

    const s = get(edge.source);
    const t = get(edge.target);
    if (!s || !t) return null;
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) return null;
    if (!Number.isFinite(t.x) || !Number.isFinite(t.y)) return null;
    return { s, t };
}

/**
 * Count number of edge-pair crossings in the layout.
 * Pares que compartilham endpoint NÃO contam.
 *
 * @param {ReadonlyArray<CrossingEdge> | null | undefined} edges
 * @param {PositionMap | null | undefined} positions
 * @returns {number}
 */
export function countCrossings(
    edges: ReadonlyArray<CrossingEdge> | null | undefined,
    positions: PositionMap | null | undefined,
): number {
    if (!Array.isArray(edges) || edges.length < 2) return 0;
    if (!positions) return 0;
    
    const segments: { s: Point2D; t: Point2D }[] = [];
    for (const e of edges) {
        const seg = resolveEndpoints(e, positions);
        if (seg) segments.push(seg);
    }
    let count = 0;
    for (let i = 0; i < segments.length; i++) {
        const si = segments[i];
        if (!si) continue;
        for (let j = i + 1; j < segments.length; j++) {
            const sj = segments[j];
            if (!sj) continue;
            const r = detectIntersection(si.s, si.t, sj.s, sj.t);
            if (r) count++;
        }
    }
    return count;
}

/**
 * Summarize crossings: total, per-edge crossing count, ratio over max possible.
 *
 * @param {ReadonlyArray<CrossingEdge> | null | undefined} edges
 * @param {PositionMap | null | undefined} positions
 * @returns {{ total: number, perEdge: Map<number, number>, ratio: number, phase: string }}
 */
export function summarizeCrossings(
    edges: ReadonlyArray<CrossingEdge> | null | undefined,
    positions: PositionMap | null | undefined,
): { total: number; perEdge: Map<number, number>; ratio: number; phase: string } {
    const perEdge = new Map<number, number>();
    if (!Array.isArray(edges) || edges.length < 2 || !positions) {
        return { total: 0, perEdge, ratio: 0, phase: '1.42' };
    }

    const pos = positions;
    const segments = edges.map((e) => resolveEndpoints(e, pos));
    let total = 0;
    for (let i = 0; i < segments.length; i++) perEdge.set(i, 0);

    for (let i = 0; i < segments.length; i++) {
        const segI = segments[i];
        if (!segI) continue;
        for (let j = i + 1; j < segments.length; j++) {
            const segJ = segments[j];
            if (!segJ) continue;
            const r = detectIntersection(segI.s, segI.t, segJ.s, segJ.t);
            if (r) {
                total++;
                perEdge.set(i, (perEdge.get(i) || 0) + 1);
                perEdge.set(j, (perEdge.get(j) || 0) + 1);
            }
        }
    }

    const n = segments.filter((s): s is { s: Point2D; t: Point2D } => s !== null).length;
    const maxPairs = n > 1 ? (n * (n - 1)) / 2 : 0;
    const ratio = maxPairs > 0 ? total / maxPairs : 0;

    return { total, perEdge, ratio, phase: '1.42' };
}