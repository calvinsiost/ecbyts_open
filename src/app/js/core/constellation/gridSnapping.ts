// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Grid Snapping - Phase 1.38 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S38
 *
 * Phase 1.38 (2026-05-01) - pure-logic grid snapping.
 * Aligns node positions to a regular grid for orderly layouts and
 * deterministic placement during manual editing.
 *
 * API:
 *   - snapToGrid({x,y}, gridSize) → snapped point
 *   - computeGridSize(viewport, opts) → auto grid size from viewport
 *   - snapNodesToGrid(nodes, gridSize) → array of snapped nodes
 *   - summarizeSnap(originalNodes, snappedNodes) → stats
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const GRID_SNAPPING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.38',
    deliveredAt: '2026-05-01',
});

/** Defaults canônicos. */
export const DEFAULT_GRID_SIZE = 20;
const DEFAULT_TARGET_DIVISIONS = 20;
const MIN_GRID_SIZE = 1;
const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];

/**
 * Snap a single point to the nearest grid intersection.
 */
export function snapToGrid(
    point: { x: number; y: number },
    gridSize: number = DEFAULT_GRID_SIZE,
): { x: number; y: number } {
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
        throw new TypeError('snapToGrid: point must have numeric x,y');
    }
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
        throw new TypeError('snapToGrid: point coordinates must be finite');
    }
    const g = Number(gridSize);
    if (!Number.isFinite(g) || g <= 0) {
        throw new RangeError('snapToGrid: gridSize must be a positive finite number');
    }
    return {
        x: Math.round(point.x / g) * g,
        y: Math.round(point.y / g) * g,
    };
}

/**
 * Compute a "nice" grid size based on viewport extents.
 * Picks a step from NICE_STEPS so that ≈targetDivisions cells fit
 * across the smaller viewport dimension.
 */
export function computeGridSize(
    viewport: { width: number; height: number },
    opts: { targetDivisions?: number; minGridSize?: number } = {},
): number {
    if (!viewport || typeof viewport.width !== 'number' || typeof viewport.height !== 'number') {
        throw new TypeError('computeGridSize: viewport must have numeric width,height');
    }
    if (viewport.width <= 0 || viewport.height <= 0) {
        throw new RangeError('computeGridSize: viewport dimensions must be positive');
    }
    const target = Math.max(1, opts.targetDivisions || DEFAULT_TARGET_DIVISIONS);
    const minSize = Math.max(MIN_GRID_SIZE, opts.minGridSize || MIN_GRID_SIZE);
    const minDim = Math.min(viewport.width, viewport.height);
    const ideal = minDim / target;
    // Find nice step closest to ideal (>= minSize).
    let best = NICE_STEPS[0] as number;
    let bestDiff = Math.abs((NICE_STEPS[0] as number) - ideal);
    for (const step of NICE_STEPS) {
        if (step < minSize) continue;
        const diff = Math.abs(step - ideal);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = step;
        }
    }
    return Math.max(best, minSize);
}

/**
 * Snap an array of nodes to the grid. Returns new array (immutable input).
 * Each node must have {id, x, y}; extra fields are preserved.
 */
export function snapNodesToGrid(
    nodes: Array<{ id: string; x: number; y: number }>,
    gridSize: number = DEFAULT_GRID_SIZE,
): Array<{ id: string; x: number; y: number }> {
    if (!Array.isArray(nodes)) {
        throw new TypeError('snapNodesToGrid: nodes must be an array');
    }
    return nodes.map((n, idx) => {
        if (!n || typeof n.x !== 'number' || typeof n.y !== 'number') {
            throw new TypeError(`snapNodesToGrid: node[${idx}] must have numeric x,y`);
        }
        const snapped = snapToGrid({ x: n.x, y: n.y }, gridSize);
        return { ...n, x: snapped.x, y: snapped.y };
    });
}

/**
 * Summarize snapping statistics by comparing original vs snapped.
 */
export function summarizeSnap(
    originalNodes: Array<{ id?: string; x: number; y: number }>,
    snappedNodes: Array<{ id?: string; x: number; y: number }>,
): { count: number; moved: number; unchanged: number; totalDelta: number; maxDelta: number; avgDelta: number } {
    if (!Array.isArray(originalNodes) || !Array.isArray(snappedNodes)) {
        throw new TypeError('summarizeSnap: both inputs must be arrays');
    }
    if (originalNodes.length !== snappedNodes.length) {
        throw new RangeError('summarizeSnap: arrays must have same length');
    }
    const count = originalNodes.length;
    let moved = 0;
    let totalDelta = 0;
    let maxDelta = 0;
    for (let i = 0; i < count; i++) {
        const a = originalNodes[i] as { id?: string; x: number; y: number };
        const b = snappedNodes[i] as { id?: string; x: number; y: number };
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > 0) moved++;
        totalDelta += d;
        if (d > maxDelta) maxDelta = d;
    }
    const unchanged = count - moved;
    const avgDelta = count > 0 ? totalDelta / count : 0;
    return { count, moved, unchanged, totalDelta, maxDelta, avgDelta };
}
