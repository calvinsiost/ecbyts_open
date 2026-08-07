// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Layout Constraints - Phase 1.46 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S46
 *
 * Phase 1.46 (2026-05-01) - pure-logic alignment, distribution and locking
 * primitives for constellation node layouts. Deterministic, no DOM, no THREE,
 * no Supabase. Operates on plain {id, x, y} node arrays.
 *
 * API:
 *   - alignNodes(nodes, axis, ids?)         → { id → {x,y} }
 *       axis ∈ 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y'
 *   - distributeEvenly(nodes, axis, ids?)   → { id → {x,y} }
 *       axis ∈ 'horizontal' | 'vertical'
 *   - lockPosition(locks, id, x, y)         → new locks Map
 *   - unlockPosition(locks, id)             → new locks Map
 *   - isLocked(locks, id)                   → boolean
 *   - applyLocks(nodes, locks)              → nodes with locked coords forced
 *   - summarizeConstraints(nodes, locks)    → { total, lockedCount, bounds, ... }
 *
 * Owner: Claude (orquestrador apropriador)
 */

type LayoutNode = { id: string | number; x: number; y: number; [k: string]: unknown };
type LockMap = Map<string | number, { x: number; y: number }>;
type IdSelector = Iterable<string | number> | Set<string | number> | null;

export const LAYOUT_CONSTRAINTS_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.46',
    deliveredAt: '2026-05-01',
    owner: 'claude',
});

const ALIGN_AXES = new Set(['left', 'right', 'top', 'bottom', 'center-x', 'center-y']);
const DISTRIBUTE_AXES = new Set(['horizontal', 'vertical']);

/**
 * @param {unknown} nodes
 * @returns {asserts nodes is LayoutNode[]}
 */
function validateNodes(nodes: unknown): asserts nodes is LayoutNode[] {
    if (!Array.isArray(nodes)) {
        throw new TypeError('nodes must be an array');
    }
    for (const n of nodes) {
        if (!n || typeof n.id === 'undefined') {
            throw new TypeError('every node must have an id');
        }
        if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) {
            throw new TypeError(`node ${n.id} must have finite x,y`);
        }
    }
}

/**
 * @param {LayoutNode[]} nodes
 * @param {IdSelector} ids
 * @returns {LayoutNode[]}
 */
function selectNodes(nodes: LayoutNode[], ids: IdSelector): LayoutNode[] {
    if (ids === null || ids === undefined) return nodes.slice();
    const set = ids instanceof Set ? ids : new Set(ids);
    return nodes.filter((n) => set.has(n.id));
}

/**
 * Align selected nodes along an axis.
 * Returns map of id → {x,y} for nodes that moved (selected only).
 * Nodes outside selection are not included in the result.
 * @param {unknown} nodes
 * @param {string} axis
 * @param {IdSelector} [ids=null]
 * @returns {Record<string, { x: number, y: number }>}
 */
export function alignNodes(nodes: unknown, axis: string, ids: IdSelector = null): Record<string, { x: number, y: number }> {
    validateNodes(nodes);
    if (!ALIGN_AXES.has(axis)) {
        throw new RangeError(`axis must be one of: ${[...ALIGN_AXES].join(', ')}`);
    }
    const selected = selectNodes(nodes, ids);
    if (selected.length === 0) return {};

    let target = 0;
    switch (axis) {
        case 'left':
            target = Math.min(...selected.map((n: LayoutNode) => n.x));
            break;
        case 'right':
            target = Math.max(...selected.map((n: LayoutNode) => n.x));
            break;
        case 'top':
            target = Math.min(...selected.map((n: LayoutNode) => n.y));
            break;
        case 'bottom':
            target = Math.max(...selected.map((n: LayoutNode) => n.y));
            break;
        case 'center-x':
            target =
                selected.reduce((s: number, n: LayoutNode) => s + n.x, 0) / selected.length;
            break;
        case 'center-y':
            target =
                selected.reduce((s: number, n: LayoutNode) => s + n.y, 0) / selected.length;
            break;
    }

    
    const out: Record<string, { x: number, y: number }>= {};
    for (const n of selected) {
        if (axis === 'left' || axis === 'right' || axis === 'center-x') {
            out[String(n.id)] = { x: target, y: n.y };
        } else {
            out[String(n.id)] = { x: n.x, y: target };
        }
    }
    return out;
}

/**
 * Distribute selected nodes evenly along an axis.
 * Endpoints (min and max in that axis) stay; intermediate ones are
 * spaced uniformly between them. Requires ≥3 nodes to have effect.
 * @param {unknown} nodes
 * @param {string} axis
 * @param {IdSelector} [ids=null]
 * @returns {Record<string, { x: number, y: number }>}
 */
export function distributeEvenly(nodes: unknown, axis: string, ids: IdSelector = null): Record<string, { x: number, y: number }> {
    validateNodes(nodes);
    if (!DISTRIBUTE_AXES.has(axis)) {
        throw new RangeError(`axis must be one of: ${[...DISTRIBUTE_AXES].join(', ')}`);
    }
    const selected = selectNodes(nodes, ids);
    
    const out: Record<string, { x: number, y: number }>= {};
    if (selected.length < 3) {
        for (const n of selected) out[String(n.id)] = { x: n.x, y: n.y };
        return out;
    }

    
    const key: 'x'|'y'= axis === 'horizontal' ? 'x' : 'y';
    const sorted = selected.slice().sort((a: LayoutNode, b: LayoutNode) => a[key] - b[key]);
    const min = sorted[0]![key];
    const max = sorted[sorted.length - 1]![key];
    const step = (max - min) / (sorted.length - 1);

    sorted.forEach((n: LayoutNode, i: number) => {
        const v = min + step * i;
        out[String(n.id)] = key === 'x' ? { x: v, y: n.y } : { x: n.x, y: v };
    });
    return out;
}

/**
 * Lock a node at a specific position. Returns NEW locks Map (immutable input).
 * @param {unknown} locks
 * @param {string|number} id
 * @param {number} x
 * @param {number} y
 * @returns {LockMap}
 */
export function lockPosition(locks: unknown, id: string|number, x: number, y: number): LockMap {
    if (typeof id === 'undefined' || id === null) {
        throw new TypeError('id is required');
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new TypeError('x,y must be finite');
    }
    
    const next: LockMap= new Map(locks instanceof Map ? locks : []);
    next.set(id, { x, y });
    return next;
}

/**
 * @param {unknown} locks
 * @param {string|number} id
 * @returns {LockMap}
 */
export function unlockPosition(locks: unknown, id: string|number): LockMap {
    
    const next: LockMap= new Map(locks instanceof Map ? locks : []);
    next.delete(id);
    return next;
}

/**
 * @param {unknown} locks
 * @param {string|number} id
 * @returns {boolean}
 */
export function isLocked(locks: unknown, id: string|number): boolean {
    return locks instanceof Map && locks.has(id);
}

/**
 * Apply locks to a node array - locked nodes get their coordinates forced.
 * Returns new array (immutable input).
 * @param {unknown} nodes
 * @param {unknown} locks
 * @returns {LayoutNode[]}
 */
export function applyLocks(nodes: unknown, locks: unknown): LayoutNode[] {
    validateNodes(nodes);
    if (!(locks instanceof Map) || locks.size === 0) return nodes.slice();
    const lockMap = (locks) as LockMap;
    return nodes.map((n: LayoutNode) => {
        const lock = lockMap.get(n.id);
        if (!lock) return n;
        return { ...n, x: lock.x, y: lock.y };
    });
}

/**
 * Summarize constraints over a node set.
 * @param {unknown} nodes
 * @param {unknown} locks
 * @returns {{ total: number, lockedCount: number, unlockedCount: number, lockedRatio: number, bounds: null | { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } }}
 */
export function summarizeConstraints(nodes: unknown, locks: unknown): { total: number, lockedCount: number, unlockedCount: number, lockedRatio: number, bounds: null | { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } } {
    validateNodes(nodes);
    
    const lockedMap: LockMap= locks instanceof Map ? (locks) as LockMap : new Map();
    if (nodes.length === 0) {
        return {
            total: 0,
            lockedCount: 0,
            unlockedCount: 0,
            lockedRatio: 0,
            bounds: null,
        };
    }
    let lockedCount = 0;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const n of nodes) {
        if (lockedMap.has(n.id)) lockedCount++;
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
    }
    return {
        total: nodes.length,
        lockedCount,
        unlockedCount: nodes.length - lockedCount,
        lockedRatio: lockedCount / nodes.length,
        bounds: { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY },
    };
}
