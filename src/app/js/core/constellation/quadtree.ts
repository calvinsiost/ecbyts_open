// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Quadtree - Phase 1.19 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S19
 *
 * Phase 1.19 (2026-05-01) - pure-logic quadtree para spatial indexing.
 * Permite queries O(log n) de "quais nodes estão dentro deste retângulo"
 * para collision detection e viewport culling em constelações grandes.
 *
 * Estratégia:
 *   - Quadtree adaptativo: subdivide quando capacity excedido
 *   - Bounds: {minX, minY, maxX, maxY}
 *   - Insert/query/clear API
 *   - rangeQuery: retorna pontos dentro do range
 *   - circleQuery: retorna pontos dentro de raio
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Default capacity por node antes de subdividir. */
const DEFAULT_CAPACITY = 4;
/** Default max depth para evitar infinite recursion. */
const DEFAULT_MAX_DEPTH = 8;

/** Identidade do módulo. */
export const QUADTREE_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.19',
    deliveredAt: '2026-05-01',
    defaultCapacity: DEFAULT_CAPACITY,
    defaultMaxDepth: DEFAULT_MAX_DEPTH,
});

/**
 * Verifica se ponto está dentro de bounds.
 *
 * @param {{x:number, y:number}} point
 * @param {{minX:number, minY:number, maxX:number, maxY:number}} bounds
 * @returns {boolean}
 */
export function pointInBounds(point: {x:number, y:number}, bounds: {minX:number, minY:number, maxX:number, maxY:number}): boolean {
    if (!point || !bounds) return false;
    const x = point.x;
    const y = point.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    return x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
}

/**
 * Verifica se 2 bounds têm interseção.
 */
export function boundsIntersect( a: any,  b: any) {
    if (!a || !b) return false;
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Verifica se circle (cx, cy, r) intersecta bounds.
 */
export function circleIntersectsBounds(
     cx: any,
     cy: any,
     r: any,
     bounds: any,
) {
    if (!bounds || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r)) return false;
    const closestX = Math.max(bounds.minX, Math.min(cx, bounds.maxX));
    const closestY = Math.max(bounds.minY, Math.min(cy, bounds.maxY));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return dx * dx + dy * dy <= r * r;
}

/**
 * Cria bounds a partir de array de pontos.
 *
 * @param {Array<{x:number, y:number}>} points
 * @returns {{minX:number, minY:number, maxX:number, maxY:number}|null}
 */
export function computeBounds(points: Array<{x:number, y:number}>): {minX:number, minY:number, maxX:number, maxY:number}|null {
    if (!Array.isArray(points) || points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let valid = false;
    for (const p of points) {
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
 * Cria quadtree node interno.
 */
function createNode(
     bounds: any,
     capacity: any,
     maxDepth: any,
     depth: any,
) {
    return {
        bounds,
        points: ([] as any[]),
        children: (null as any), // [NW, NE, SW, SE] when subdivided
        capacity,
        maxDepth,
        depth,
    };
}

/**
 * Subdivide um quadtree node em 4 quadrantes.
 */
function subdivide( node: any) {
    const { minX, minY, maxX, maxY } = node.bounds;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cap = node.capacity;
    const md = node.maxDepth;
    const nd = node.depth + 1;
    node.children = [
        createNode({ minX, minY, maxX: cx, maxY: cy }, cap, md, nd), // NW
        createNode({ minX: cx, minY, maxX, maxY: cy }, cap, md, nd), // NE
        createNode({ minX, minY: cy, maxX: cx, maxY }, cap, md, nd), // SW
        createNode({ minX: cx, minY: cy, maxX, maxY }, cap, md, nd), // SE
    ];
    // Re-distribute existing points
    const oldPoints = node.points;
    node.points = [];
    for (const p of oldPoints) {
        for (const child of node.children) {
            if (pointInBounds(p, child.bounds)) {
                child.points.push(p);
                break;
            }
        }
    }
}

/**
 * Insert point em quadtree.
 *
 * @param {Record<string, any>} node - root or subtree
 * @param {Record<string, any>} any> - { x, y, ...rest }
 * @returns {boolean} true se inserido
 */
function insertNode(node: Record<string, any>, point: Record<string, any>): boolean {
    if (!pointInBounds((point as any), node.bounds)) return false;

    if (node.children) {
        for (const child of node.children) {
            if (insertNode(child, point)) return true;
        }
        return false;
    }

    if (node.points.length < node.capacity || node.depth >= node.maxDepth) {
        node.points.push(point);
        return true;
    }

    subdivide(node);
    for (const child of node.children) {
        if (insertNode(child, point)) return true;
    }
    return false;
}

/**
 * Query range.
 */
function rangeQueryNode( node: any,  range: any,  result: any) {
    if (!boundsIntersect(node.bounds, range)) return;
    if (node.children) {
        for (const child of node.children) {
            rangeQueryNode(child, range, result);
        }
    } else {
        for (const p of node.points) {
            if (pointInBounds(p, range)) result.push(p);
        }
    }
}

/**
 * Query circle.
 */
function circleQueryNode(
     node: any,
     cx: any,
     cy: any,
     r: any,
     result: any,
) {
    if (!circleIntersectsBounds(cx, cy, r, node.bounds)) return;
    if (node.children) {
        for (const child of node.children) {
            circleQueryNode(child, cx, cy, r, result);
        }
    } else {
        const r2 = r * r;
        for (const p of node.points) {
            if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
            const dx = p.x - cx;
            const dy = p.y - cy;
            if (dx * dx + dy * dy <= r2) result.push(p);
        }
    }
}

/**
 * Conta nodes no quadtree (para stats).
 */
function countNodesRec( node: any) {
    if (!node) return 0;
    let count = 1;
    if (node.children) {
        for (const child of node.children) count += countNodesRec(child);
    }
    return count;
}

/**
 * Conta points no quadtree.
 */
function countPointsRec( node: any) {
    if (!node) return 0;
    let count = node.points.length;
    if (node.children) {
        for (const child of node.children) count += countPointsRec(child);
    }
    return count;
}

/**
 * Cria quadtree.
 *
 * @param {{minX:number, minY:number, maxX:number, maxY:number}} bounds
 * @param {{capacity?:number, maxDepth?:number}} [options]
 * @returns {{insert:Function, range:Function, circle:Function, count:Function, nodeCount:Function, clear:Function, bounds:any}}
 */
export function createQuadtree(bounds: {minX:number, minY:number, maxX:number, maxY:number}, options: {capacity?:number, maxDepth?:number} = {}): {insert:Function, range:Function, circle:Function, count:Function, nodeCount:Function, clear:Function, bounds:any} {
    if (!bounds || !Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
        throw new TypeError('createQuadtree: valid bounds required');
    }
    if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) {
        throw new TypeError('createQuadtree: bounds must have positive area');
    }
    const capacity =
        Number.isInteger(options.capacity) && (options.capacity as number) > 0
            ? (options.capacity as number)
            : DEFAULT_CAPACITY;
    const maxDepth =
        Number.isInteger(options.maxDepth) && (options.maxDepth as number) > 0
            ? (options.maxDepth as number)
            : DEFAULT_MAX_DEPTH;
    let root = createNode(bounds, capacity, maxDepth, 0);

    return Object.freeze({
        insert( point: any) {
            if (!point) return false;
            return insertNode(root, point);
        },
        range( rangeBounds: any) {
            if (!rangeBounds) return [];
            const result: any[] = [];
            rangeQueryNode(root, rangeBounds, result);
            return Object.freeze(result);
        },
        circle( cx: any,  cy: any,  r: any) {
            if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(r) || r < 0) {
                return [];
            }
            const result: any[] = [];
            circleQueryNode(root, cx, cy, r, result);
            return Object.freeze(result);
        },
        count() {
            return countPointsRec(root);
        },
        nodeCount() {
            return countNodesRec(root);
        },
        clear() {
            root = createNode(bounds, capacity, maxDepth, 0);
        },
        bounds,
    });
}

/**
 * Module identity export.
 */
export const quadtreeMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.19',
    deliveredAt: '2026-05-01',
    defaults: { capacity: DEFAULT_CAPACITY, maxDepth: DEFAULT_MAX_DEPTH },
    exports: [
        'QUADTREE_META',
        'pointInBounds',
        'boundsIntersect',
        'circleIntersectsBounds',
        'computeBounds',
        'createQuadtree',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
