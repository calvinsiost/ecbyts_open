// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Spatial Hash Grid - Phase 1.39 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S39
 *
 * Phase 1.39 (2026-05-02) - pure-logic spatial hash para indexação 2D
 * de nós da constellation. Permite queries O(k) por raio ou caixa em
 * vez de O(n) por iteração full.
 *
 * API:
 *   - createGrid({cellSize}) → grid
 *   - insertNode(grid, {id, x, y})
 *   - removeNode(grid, id)
 *   - queryRadius(grid, x, y, r) → ids[]
 *   - queryBox(grid, x1, y1, x2, y2) → ids[]
 *   - summarize(grid) → {cells, nodes, avgPerCell}
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const SPATIAL_HASH_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.39',
    deliveredAt: '2026-05-02',
});

function cellKey( cx: any, cy: any) {
    return `${cx}:${cy}`;
}

function cellOf( grid: any, x: any, y: any) {
    return [Math.floor(x / grid.cellSize), Math.floor(y / grid.cellSize)];
}

/**
 * Cria grid mutável (não-frozen - estrutura indexada).
 * @param {Record<string, any>} opts {cellSize}
 */
export function createGrid(opts: Record<string, any> = {}) {
    const cellSize = Number.isFinite(opts.cellSize) && opts.cellSize > 0 ? opts.cellSize : 50;
    return {
        cellSize,
        cells: new Map(), // key → Set<id>
        nodes: new Map(), // id → {x, y, key}
    };
}

/**
 * Insere ou atualiza nó.
 * @param {Record<string, any>} grid
 * @param {Record<string, any>} any> {id, x, y}
 */
export function insertNode(grid: Record<string, any>, node: Record<string, any>) {
    if (!grid || !grid.cells) throw new TypeError('insertNode: grid required');
    if (!node || typeof node !== 'object') throw new TypeError('insertNode: node required');
    if (typeof node.id !== 'string' || !node.id.trim()) throw new TypeError('insertNode: id required');
    if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) throw new TypeError('insertNode: x/y finite required');

    // Remove old position if exists
    if (grid.nodes.has(node.id)) {
        removeNode(grid, node.id);
    }
    const [cx, cy] = cellOf(grid, node.x, node.y);
    const key = cellKey(cx, cy);
    let bucket = grid.cells.get(key);
    if (!bucket) {
        bucket = new Set();
        grid.cells.set(key, bucket);
    }
    bucket.add(node.id);
    grid.nodes.set(node.id, { x: node.x, y: node.y, key });
}

/**
 * Remove nó. Retorna true se removido.
 */
export function removeNode( grid: any, id: any) {
    if (!grid || !grid.cells) return false;
    const entry = grid.nodes.get(id);
    if (!entry) return false;
    const bucket = grid.cells.get(entry.key);
    if (bucket) {
        bucket.delete(id);
        if (bucket.size === 0) grid.cells.delete(entry.key);
    }
    grid.nodes.delete(id);
    return true;
}

/**
 * Query por raio (círculo). Retorna ids dentro de distância <= r.
 */
export function queryRadius( grid: any, x: any, y: any, r: any) {
    if (!grid || !grid.cells) return Object.freeze([]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r) || r < 0) {
        return Object.freeze([]);
    }
    const minCx = Math.floor((x - r) / grid.cellSize);
    const maxCx = Math.floor((x + r) / grid.cellSize);
    const minCy = Math.floor((y - r) / grid.cellSize);
    const maxCy = Math.floor((y + r) / grid.cellSize);
    const r2 = r * r;
    const out = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
            const bucket = grid.cells.get(cellKey(cx, cy));
            if (!bucket) continue;
            for (const id of bucket) {
                const node = grid.nodes.get(id);
                if (!node) continue;
                const dx = node.x - x;
                const dy = node.y - y;
                if (dx * dx + dy * dy <= r2) out.push(id);
            }
        }
    }
    return Object.freeze(out);
}

/**
 * Query por caixa (AABB). Retorna ids dentro de [x1..x2] × [y1..y2].
 */
export function queryBox( grid: any, x1: any, y1: any, x2: any, y2: any) {
    if (!grid || !grid.cells) return Object.freeze([]);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return Object.freeze([]);
    const xMin = Math.min(x1, x2);
    const xMax = Math.max(x1, x2);
    const yMin = Math.min(y1, y2);
    const yMax = Math.max(y1, y2);
    const minCx = Math.floor(xMin / grid.cellSize);
    const maxCx = Math.floor(xMax / grid.cellSize);
    const minCy = Math.floor(yMin / grid.cellSize);
    const maxCy = Math.floor(yMax / grid.cellSize);
    const out = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
        for (let cy = minCy; cy <= maxCy; cy++) {
            const bucket = grid.cells.get(cellKey(cx, cy));
            if (!bucket) continue;
            for (const id of bucket) {
                const node = grid.nodes.get(id);
                if (!node) continue;
                if (node.x >= xMin && node.x <= xMax && node.y >= yMin && node.y <= yMax) {
                    out.push(id);
                }
            }
        }
    }
    return Object.freeze(out);
}

/**
 * Sumariza estado do grid.
 */
export function summarize( grid: any) {
    if (!grid || !grid.cells) {
        return Object.freeze({ cells: 0, nodes: 0, avgPerCell: 0 });
    }
    const cells = grid.cells.size;
    const nodes = grid.nodes.size;
    const avgPerCell = cells > 0 ? nodes / cells : 0;
    return Object.freeze({ cells, nodes, avgPerCell });
}

/**
 * Module identity export.
 */
export const spatialHashGridMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.39',
    deliveredAt: '2026-05-02',
    exports: [
        'SPATIAL_HASH_META',
        'createGrid',
        'insertNode',
        'removeNode',
        'queryRadius',
        'queryBox',
        'summarize',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
