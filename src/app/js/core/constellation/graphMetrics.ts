// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Graph Metrics - Phase 1.47 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S47
 *
 * Phase 1.47 (2026-05-02) - pure-logic métricas globais de grafo:
 * density, average degree, diameter (BFS), connected components,
 * clustering coefficient.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface GraphNode {
    id?: string;
    [k: string]: unknown;
}

export interface GraphEdge {
    from: string;
    to: string;
    [k: string]: unknown;
}

export type AdjMap = Map<string, Set<string>>;

export const METRICS_META = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.47',
    deliveredAt: '2026-05-02',
} as const;

function buildAdj(nodes: GraphNode[], edges: GraphEdge[]): AdjMap {
    const adj: AdjMap = new Map();
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return adj;
    for (const n of nodes) if (n && typeof n.id === 'string') adj.set(n.id, new Set());
    for (const e of edges) {
        if (!e || !adj.has(e.from) || !adj.has(e.to)) continue;
        adj.get(e.from)?.add(e.to);
        adj.get(e.to)?.add(e.from); // undirected
    }
    return adj;
}

/**
 * Densidade = 2|E| / (|V|(|V|-1))
 */
export function density(nodes: GraphNode[], edges: GraphEdge[]): number {
    if (!Array.isArray(nodes) || !Array.isArray(edges)) return 0;
    const n = nodes.length;
    if (n < 2) return 0;
    const validEdges = edges.filter((e: GraphEdge) => e && e.from !== e.to);
    return (2 * validEdges.length) / (n * (n - 1));
}

/**
 * Average degree.
 */
export function averageDegree(nodes: GraphNode[], edges: GraphEdge[]): number {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    const adj = buildAdj(nodes, edges);
    let sum = 0;
    for (const set of adj.values()) sum += set.size;
    return sum / nodes.length;
}

/**
 * BFS shortest path lengths from source.
 */
function bfs(adj: AdjMap, source: string): Map<string, number> {
    const dist = new Map<string, number>();
    dist.set(source, 0);
    const queue: string[] = [source];
    while (queue.length > 0) {
        const u = queue.shift() as string;
        for (const v of adj.get(u) || []) {
            if (!dist.has(v)) {
                dist.set(v, (dist.get(u) as number) + 1);
                queue.push(v);
            }
        }
    }
    return dist;
}

/**
 * Diameter (longest shortest path). Undefined em grafo desconectado → retorna -1.
 */
export function diameter(nodes: GraphNode[], edges: GraphEdge[]): number {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    const adj = buildAdj(nodes, edges);
    let max = 0;
    for (const n of nodes) {
        if (!n || typeof n.id !== 'string') continue;
        const dist = bfs(adj, n.id);
        if (dist.size < adj.size) return -1; // disconnected
        for (const d of dist.values()) if (d > max) max = d;
    }
    return max;
}

/**
 * Connected components.
 */
export function connectedComponents(nodes: GraphNode[], edges: GraphEdge[]): ReadonlyArray<ReadonlyArray<string>> {
    if (!Array.isArray(nodes)) return Object.freeze([]);
    const adj = buildAdj(nodes, edges);
    const seen = new Set<string>();
    const components: Array<ReadonlyArray<string>> = [];
    for (const n of nodes) {
        if (!n || typeof n.id !== 'string' || seen.has(n.id)) continue;
        const comp: string[] = [];
        const stack: string[] = [n.id];
        while (stack.length > 0) {
            const u = stack.pop() as string;
            if (seen.has(u)) continue;
            seen.add(u);
            comp.push(u);
            for (const v of adj.get(u) || []) {
                if (!seen.has(v)) stack.push(v);
            }
        }
        components.push(Object.freeze(comp));
    }
    return Object.freeze(components);
}

/**
 * Local clustering coefficient: fraction of triangles via neighbors.
 */
export function clusteringCoefficient(nodes: GraphNode[], edges: GraphEdge[]): number {
    if (!Array.isArray(nodes) || nodes.length === 0) return 0;
    const adj = buildAdj(nodes, edges);
    let sum = 0;
    let counted = 0;
    for (const n of nodes) {
        if (!n || typeof n.id !== 'string') continue;
        const neighbors = Array.from(adj.get(n.id) || []);
        const k = neighbors.length;
        if (k < 2) continue;
        let triangles = 0;
        for (let i = 0; i < k; i++) {
            const ni = neighbors[i];
            if (ni === undefined) continue;
            for (let j = i + 1; j < k; j++) {
                const nj = neighbors[j];
                if (nj === undefined) continue;
                if (adj.get(ni)?.has(nj)) triangles++;
            }
        }
        sum += (2 * triangles) / (k * (k - 1));
        counted++;
    }
    return counted > 0 ? sum / counted : 0;
}

/**
 * Sumariza métricas globais.
 */
export function summarizeGraphMetrics(nodes: GraphNode[], edges: GraphEdge[]): {
    nodes: number;
    edges: number;
    density: number;
    avgDegree: number;
    components: number;
    diameter?: number;
    clustering?: number;
} {
    const empty = { nodes: 0, edges: 0, density: 0, avgDegree: 0, components: 0 };
    if (!Array.isArray(nodes)) return empty;
    const comps = connectedComponents(nodes, edges);
    return Object.freeze({
        nodes: nodes.length,
        edges: Array.isArray(edges) ? edges.length : 0,
        density: density(nodes, edges),
        avgDegree: averageDegree(nodes, edges),
        components: comps.length,
        diameter: diameter(nodes, edges),
        clustering: clusteringCoefficient(nodes, edges),
    });
}

/**
 * Module identity export.
 */
export const graphMetricsMeta = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.47',
    deliveredAt: '2026-05-02',
    exports: [
        'METRICS_META',
        'density',
        'averageDegree',
        'diameter',
        'connectedComponents',
        'clusteringCoefficient',
        'summarizeGraphMetrics',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const;