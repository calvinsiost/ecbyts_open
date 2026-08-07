// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Path Finding - Phase 1.33 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S33
 *
 * Phase 1.33 (2026-05-02) - pure-logic shortest-path algorithms over
 * weighted graphs. Suporta Dijkstra (non-negative weights), A*
 * (heuristic-guided), e single-source all-targets via Dijkstra estendido.
 *
 * Estratégia:
 *   - Adjacency: Map<nodeId, Array<{to, weight}>>
 *   - Priority queue: binary min-heap interno
 *   - Dijkstra: classic single-pair shortest path
 *   - A*: f = g + h; heuristic deve ser admissível (não superestimar)
 *   - shortestPathAll: distances + predecessors de uma fonte
 *   - reconstructPath: walks predecessors from target → source
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Module identity. */
export const PATH_FINDING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.33',
    deliveredAt: '2026-05-02',
});

/* ------------------------------------------------------------------ */
/* Internal: Min-Heap priority queue                                    */
/* ------------------------------------------------------------------ */

class MinHeap {
    heap: any[];
    constructor() {
        /** @type {any[]} */
        this.heap = [];
    }
    get size() {
        return this.heap.length;
    }
    push( item: any) {
        this.heap.push(item);
        this._siftUp(this.heap.length - 1);
    }
    pop() {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const last = this.heap.pop();
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this._siftDown(0);
        }
        return top;
    }
    _siftUp( i: any) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.heap[i].priority < this.heap[parent].priority) {
                [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
                i = parent;
            } else break;
        }
    }
    _siftDown( i: any) {
        const n = this.heap.length;
        while (true) {
            const l = 2 * i + 1;
            const r = 2 * i + 2;
            let smallest = i;
            if (l < n && this.heap[l].priority < this.heap[smallest].priority) smallest = l;
            if (r < n && this.heap[r].priority < this.heap[smallest].priority) smallest = r;
            if (smallest !== i) {
                [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
                i = smallest;
            } else break;
        }
    }
}

/* ------------------------------------------------------------------ */
/* Internal helpers                                                     */
/* ------------------------------------------------------------------ */

function _relaxDijkstraEdge(
    u: any,
    to: any,
    weight: number,
    d: number,
    dist: Map<any, number>,
    prev: Map<any, any>,
    pq: MinHeap,
    visited: Set<any>,
): void {
    if (visited.has(to)) return;
    const alt = d + weight;
    if (alt < (dist.get(to) ?? Infinity)) {
        dist.set(to, alt);
        prev.set(to, u);
        pq.push({ id: to, priority: alt });
    }
}

function _relaxAStarEdge(
    u: any,
    to: any,
    weight: number,
    gu: number,
    gScore: Map<any, number>,
    prev: Map<any, any>,
    pq: MinHeap,
    closed: Set<any>,
    heuristic: Function,
    targetId: any,
): void {
    if (closed.has(to)) return;
    const tentative = gu + weight;
    if (tentative < (gScore.get(to) ?? Infinity)) {
        gScore.set(to, tentative);
        prev.set(to, u);
        const f = tentative + heuristic(to, targetId);
        pq.push({ id: to, priority: f });
    }
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

/**
 * Constrói adjacency weighted a partir de edges.
 *
 * @param {Array<any>} edges
 * @param {string} [weightField='weight']
 * @returns {Map<any, Array<{to: any, weight: number}>>}
 */
export function buildWeightedAdjacency(edges: Array<any>, weightField: string = 'weight'): Map<any, Array<{to: any, weight: number}>> {
        const adj: Map<any, Array<{to: any, weight: number}>>= new Map();
    if (!Array.isArray(edges)) return adj;
    for (const e of edges) {
        if (!e || e.source == null || e.target == null) continue;
        const w = Number.isFinite(e[weightField]) ? Number(e[weightField]) : 1;
        if (w < 0) continue; // dijkstra requires non-negative
        if (!adj.has(e.source)) adj.set(e.source, []);
        if (!adj.has(e.target)) adj.set(e.target, []);
        (adj.get(e.source) as any).push({ to: e.target, weight: w });
        (adj.get(e.target) as any).push({ to: e.source, weight: w });
    }
    return adj;
}

/**
 * Reconstrói caminho de source → target a partir de predecessors map.
 *
 * @param {Map<any, any>|Object} predecessors
 * @param {*} any>|Object
 * @param {*} sourceId
 * @returns {Array<any>} array of node ids (vazio se sem caminho)
 */
export function reconstructPath(predecessors: Map<any, any>|Object, sourceId: any, targetId: any): Array<any> {
    const _p = (predecessors as any);
    const get = ( k: any) => (predecessors instanceof Map ? predecessors.get(k as any) : _p[k]);
    const path = [];
    let cur = targetId;
    const seen = new Set();
    while (cur !== undefined && cur !== null) {
        if (seen.has(cur)) return []; // cycle guard
        seen.add(cur);
        path.unshift(cur);
        if (cur === sourceId) return path;
        cur = get(cur);
    }
    return [];
}

/**
 * Dijkstra single-pair shortest path.
 *
 * @param {Map<any, any>} adjacency
 * @param {*} any>
 * @param {*} sourceId
 * @returns {{distance:number, path:Array<any>}}
 */
export function dijkstra(adjacency: Map<any, any>, sourceId: any, targetId: any): {distance:number, path:Array<any>} {
    if (!(adjacency instanceof Map) || !adjacency.has(sourceId) || !adjacency.has(targetId)) {
        return (Object.freeze({ distance: Infinity, path: [] }) as any);
    }
    if (sourceId === targetId) {
        return (Object.freeze({ distance: 0, path: [sourceId] }) as any);
    }
    const dist: Map<any, number> = new Map();
    const prev: Map<any, any> = new Map();
    const visited = new Set();
    const pq = new MinHeap();
    dist.set(sourceId, 0);
    pq.push({ id: sourceId, priority: 0 });

    while (pq.size > 0) {
        const { id: u, priority: d } = pq.pop() as any;
        if (visited.has(u)) continue;
        visited.add(u);
        if (u === targetId) break;
        if (d > (dist.get(u) ?? Infinity)) continue;
        const neighbors = adjacency.get(u) || [];
        for (const { to, weight } of neighbors) {
            _relaxDijkstraEdge(u, to, weight, d, dist, prev, pq, visited);
        }
    }
    const distance = dist.get(targetId) ?? Infinity;
    if (!Number.isFinite(distance)) return (Object.freeze({ distance: Infinity, path: [] }) as any);
    return (Object.freeze({ distance, path: Object.freeze(reconstructPath(prev, sourceId, targetId)) }) as any);
}

/**
 * A* heuristic search.
 *
 * @param {Map<any, any>} adjacency
 * @param {*} any>
 * @param {*} sourceId
 * @param {Function} targetId (nodeId, targetId) => estimated cost
 * @returns {{distance:number, path:Array<any>}}
 */
export function aStar(adjacency: Map<any, any>, sourceId: any, targetId: any, heuristic: Function): {distance:number, path:Array<any>} {
    if (!(adjacency instanceof Map) || !adjacency.has(sourceId) || !adjacency.has(targetId)) {
        return (Object.freeze({ distance: Infinity, path: [] }) as any);
    }
    if (sourceId === targetId) {
        return (Object.freeze({ distance: 0, path: [sourceId] }) as any);
    }
    const h = typeof heuristic === 'function' ? heuristic : () => 0;
    const gScore: Map<any, number> = new Map();
    const prev: Map<any, any> = new Map();
    const closed = new Set();
    const pq = new MinHeap();
    gScore.set(sourceId, 0);
    pq.push({ id: sourceId, priority: h(sourceId, targetId) });

    while (pq.size > 0) {
        const { id: u } = pq.pop() as any;
        if (closed.has(u)) continue;
        closed.add(u);
        if (u === targetId) break;
        const gu = gScore.get(u) ?? Infinity;
        const neighbors = adjacency.get(u) || [];
        for (const { to, weight } of neighbors) {
            _relaxAStarEdge(u, to, weight, gu, gScore, prev, pq, closed, h, targetId);
        }
    }
    const distance = gScore.get(targetId) ?? Infinity;
    if (!Number.isFinite(distance)) return (Object.freeze({ distance: Infinity, path: [] }) as any);
    return (Object.freeze({ distance, path: Object.freeze(reconstructPath(prev, sourceId, targetId)) }) as any);
}

/**
 * Single-source shortest paths to all reachable nodes.
 *
 * @param {Map<any, any>} adjacency
 * @param {*} any>
 * @returns {{distances:Object, predecessors:Object}}
 */
export function shortestPathAll(adjacency: Map<any, any>, sourceId: any): {distances:Object, predecessors:Object} {
        const distances: Record<string, number>= {};
        const predecessors: Record<string, any>= {};
    if (!(adjacency instanceof Map) || !adjacency.has(sourceId)) {
        return Object.freeze({ distances, predecessors });
    }
        const dist: Map<any, number>= new Map();
        const prev: Map<any, any>= new Map();
    const visited = new Set();
    const pq = new MinHeap();
    dist.set(sourceId, 0);
    pq.push({ id: sourceId, priority: 0 });

    while (pq.size > 0) {
        const { id: u, priority: d } = pq.pop();
        if (visited.has(u)) continue;
        visited.add(u);
        if (d > (dist.get(u) ?? Infinity)) continue;
        const neighbors = adjacency.get(u) || [];
        for (const { to, weight } of neighbors) {
            if (visited.has(to)) continue;
            const alt = d + weight;
            if (alt < (dist.get(to) ?? Infinity)) {
                dist.set(to, alt);
                prev.set(to, u);
                pq.push({ id: to, priority: alt });
            }
        }
    }
    for (const [k, v] of dist) distances[k] = v;
    for (const [k, v] of prev) predecessors[k] = v;
    return Object.freeze({ distances: Object.freeze(distances), predecessors: Object.freeze(predecessors) });
}

/**
 * Soma de pesos ao longo de um caminho.
 *
 * @param {Map<any, any>} adjacency
 * @param {Array<any>} any>
 * @returns {number} Infinity se path inválido / aresta ausente
 */
export function pathDistance(adjacency: Map<any, any>, path: Array<any>): number {
    if (!(adjacency instanceof Map) || !Array.isArray(path) || path.length === 0) return Infinity;
    if (path.length === 1) return adjacency.has(path[0]) ? 0 : Infinity;
    let total = 0;
    for (let i = 0; i < path.length - 1; i++) {
        const u = path[i];
        const v = path[i + 1];
        const neighbors = adjacency.get(u);
        if (!neighbors) return Infinity;
        const edge = neighbors.find(( n: any) => n.to === v);
        if (!edge) return Infinity;
        total += edge.weight;
    }
    return total;
}

/**
 * Sumariza estatísticas de path finding entre source e múltiplos targets.
 *
 * @param {Map<any, any>} adjacency
 * @param {*} any>
 * @param {Array<any>} [sourceId]
 * @returns {Object}
 */
export function summarizePathFinding(adjacency: Map<any, any>, sourceId: any, targets?: Array<any>): Object {
    if (!(adjacency instanceof Map) || !adjacency.has(sourceId)) {
        return Object.freeze({
            source: sourceId,
            reachable: 0,
            unreachable: 0,
            avgDistance: 0,
            maxDistance: 0,
            minDistance: 0,
        });
    }
    const all = shortestPathAll(adjacency, sourceId);
    const tgts = Array.isArray(targets) && targets.length > 0 ? targets : Object.keys(all.distances);
    let reachable = 0;
    let unreachable = 0;
    let sum = 0;
    let max = 0;
    let min = Infinity;
    for (const t of tgts) {
        if (t === sourceId) continue;
        const d = (all.distances as any)[t];
        if (Number.isFinite(d)) {
            reachable++;
            sum += d;
            if (d > max) max = d;
            if (d < min) min = d;
        } else {
            unreachable++;
        }
    }
    return Object.freeze({
        source: sourceId,
        reachable,
        unreachable,
        avgDistance: reachable > 0 ? sum / reachable : 0,
        maxDistance: max,
        minDistance: reachable > 0 ? min : 0,
    });
}

/** Module identity export. */
export const pathFindingMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.33',
    deliveredAt: '2026-05-02',
    exports: [
        'PATH_FINDING_META',
        'buildWeightedAdjacency',
        'dijkstra',
        'aStar',
        'shortestPathAll',
        'reconstructPath',
        'pathDistance',
        'summarizePathFinding',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
