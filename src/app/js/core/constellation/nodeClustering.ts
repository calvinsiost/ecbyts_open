// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Constellation Node Clustering — Phase 1.59
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S59
 *
 * Phase 1.59 (2026-05-02) — agrupamento puro de nodes por atributo ou estrutura.
 * Estratégias: attribute (valor de campo), connectivity (componentes conectados),
 * degree (tiers por grau in+out).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase/Promise/setTimeout.
 *
 * Owner: Claude (orquestrador)
 */

export type ClusterStrategy = 'attribute' | 'connected' | 'degree';

export interface ClusteringNode {
    readonly id?: string | number;
    readonly [k: string]: unknown;
}

export interface ClusteringEdge {
    readonly source?: string | number;
    readonly target?: string | number;
    readonly [k: string]: unknown;
}

export interface ClusteringGraph {
    readonly nodes?: ReadonlyArray<ClusteringNode>;
    readonly edges?: ReadonlyArray<ClusteringEdge>;
}

export type AttributeBuckets = Readonly<Record<string, ReadonlyArray<string>>>;

export interface ConnectivityCluster {
    readonly id: string;
    readonly nodeIds: ReadonlyArray<string>;
}

export interface DegreeBuckets {
    readonly high: ReadonlyArray<string>;
    readonly mid: ReadonlyArray<string>;
    readonly low: ReadonlyArray<string>;
}

export interface ClusterEntry {
    readonly id: string;
    readonly nodeIds: ReadonlyArray<string>;
    readonly label: string;
}

export interface ClusterRegistry {
    readonly clusters: Readonly<Record<string, ClusterEntry>>;
    readonly count: number;
}

export interface ClusterSummary {
    readonly totalClusters: number;
    readonly totalNodes: number;
    readonly avgSize: number;
    readonly maxSize: number;
    readonly minSize: number;
}

export interface DegreeOptions {
    readonly highThreshold?: number;
    readonly lowThreshold?: number;
}

/** Estratégias de clustering disponíveis. */
export const CLUSTER_STRATEGIES: ReadonlyArray<ClusterStrategy> = Object.freeze([
    'attribute',
    'connected',
    'degree',
]);

/** Identidade do módulo. */
export const NODE_CLUSTERING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.59',
    deliveredAt: '2026-05-02',
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

interface ParsedGraph {
    readonly nodes: ReadonlyArray<ClusteringNode>;
    readonly edges: ReadonlyArray<ClusteringEdge>;
}

/**
 * Extrai nodes e edges de um graph object ou retorna fallbacks seguros.
 */
function parseGraph(graph: ClusteringGraph | null | undefined): ParsedGraph {
    if (!graph || typeof graph !== 'object') return { nodes: [], edges: [] };
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    return { nodes, edges };
}

// ---------------------------------------------------------------------------
// clusterByAttribute
// ---------------------------------------------------------------------------

/**
 * Agrupa nodes por valor de atributo (ex: type, region).
 * Nodes sem o atributo vão para o bucket '_unknown'.
 */
export function clusterByAttribute(
    graph: ClusteringGraph | null | undefined,
    attributeKey: string,
): AttributeBuckets {
    const { nodes } = parseGraph(graph);
    if (!nodes.length) return Object.freeze({});

    const buckets: Record<string, string[]> = {};

    for (const node of nodes) {
        if (!node || typeof (node as Record<string, unknown>).id === 'undefined') continue;
        const val = (node as Record<string, unknown>)[attributeKey];
        const key = val !== undefined && val !== null ? String(val) : '_unknown';
        if (!buckets[key]) buckets[key] = [];
        buckets[key].push(String((node as Record<string, unknown>).id));
    }

    const frozen: Record<string, ReadonlyArray<string>> = {};
    for (const k of Object.keys(buckets)) {
        const arr = buckets[k];
        frozen[k] = Object.freeze(arr ?? []);
    }
    return Object.freeze(frozen);
}

// ---------------------------------------------------------------------------
// clusterByConnectivity
// ---------------------------------------------------------------------------

/**
 * Agrupa nodes em componentes conectados (undirected BFS/union-find).
 * Nodes isolados (sem edges) formam seu próprio cluster.
 */
export function clusterByConnectivity(
    graph: ClusteringGraph | null | undefined,
): ReadonlyArray<ConnectivityCluster> {
    const { nodes, edges } = parseGraph(graph);
    if (!nodes.length) return Object.freeze<ConnectivityCluster[]>([]);

    // Union-Find
    const parent: Record<string, string> = {};
    for (const node of nodes) {
        const id = String((node as Record<string, unknown>).id);
        parent[id] = id;
    }

    function find(x: string): string {
        let cur = x;
        while (parent[cur] !== undefined && parent[cur] !== cur) {
            const p = parent[cur] as string;
            const gp = parent[p];
            if (gp !== undefined) parent[cur] = gp; // path compression
            cur = parent[cur] as string;
        }
        return cur;
    }

    function union(a: string, b: string): void {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    for (const edge of edges) {
        if (!edge) continue;
        const src = String((edge as Record<string, unknown>).source);
        const tgt = String((edge as Record<string, unknown>).target);
        if (parent[src] !== undefined && parent[tgt] !== undefined) {
            union(src, tgt);
        }
    }

    // Group by root
    const groups: Record<string, string[]> = {};
    for (const node of nodes) {
        const id = String((node as Record<string, unknown>).id);
        const root = find(id);
        if (!groups[root]) groups[root] = [];
        groups[root].push(id);
    }

    let clusterId = 0;
    const result: ConnectivityCluster[] = Object.values(groups).map((nodeIds) =>
        Object.freeze({
            id: `cluster-${clusterId++}`,
            nodeIds: Object.freeze(nodeIds),
        }),
    );

    return Object.freeze(result);
}

// ---------------------------------------------------------------------------
// clusterByDegree
// ---------------------------------------------------------------------------

/**
 * Agrupa nodes em 3 tiers por grau total (in + out).
 */
export function clusterByDegree(
    graph: ClusteringGraph | null | undefined,
    options: DegreeOptions = {},
): DegreeBuckets {
    const { nodes, edges } = parseGraph(graph);
    const highThreshold = typeof options.highThreshold === 'number' ? options.highThreshold : 0.7;
    const lowThreshold = typeof options.lowThreshold === 'number' ? options.lowThreshold : 0.3;

    const EMPTY: DegreeBuckets = Object.freeze({
        high: Object.freeze<string[]>([]),
        mid: Object.freeze<string[]>([]),
        low: Object.freeze<string[]>([]),
    });
    if (!nodes.length) return EMPTY;

    // Count degree for each node
    const degreeMap: Record<string, number> = {};
    for (const node of nodes) {
        degreeMap[String((node as Record<string, unknown>).id)] = 0;
    }
    for (const edge of edges) {
        if (!edge) continue;
        const src = String((edge as Record<string, unknown>).source);
        const tgt = String((edge as Record<string, unknown>).target);
        if (degreeMap[src] !== undefined) degreeMap[src]++;
        if (degreeMap[tgt] !== undefined) degreeMap[tgt]++;
    }

    const degrees = Object.values(degreeMap).sort((a, b) => a - b);
    const n = degrees.length;

    const highCutoff = degrees[Math.floor((n - 1) * highThreshold)] ?? 0;
    const lowCutoff = degrees[Math.floor((n - 1) * lowThreshold)] ?? 0;

    const high: string[] = [];
    const mid: string[] = [];
    const low: string[] = [];

    for (const [id, deg] of Object.entries(degreeMap)) {
        if (deg >= highCutoff) {
            high.push(id);
        } else if (deg <= lowCutoff) {
            low.push(id);
        } else {
            mid.push(id);
        }
    }

    return Object.freeze({
        high: Object.freeze(high),
        mid: Object.freeze(mid),
        low: Object.freeze(low),
    });
}

// ---------------------------------------------------------------------------
// createClusterRegistry
// ---------------------------------------------------------------------------

export interface ClusterInput {
    readonly id?: string | number;
    readonly nodeIds: ReadonlyArray<string | number>;
    readonly label?: string;
}

/**
 * Cria ClusterRegistry frozen a partir de um array de grupos.
 */
export function createClusterRegistry(
    clusters: ReadonlyArray<ClusterInput> | null | undefined,
): ClusterRegistry {
    const EMPTY: ClusterRegistry = Object.freeze({
        clusters: Object.freeze<Record<string, ClusterEntry>>({}),
        count: 0,
    });
    if (!clusters || !Array.isArray(clusters)) return EMPTY;

    const map: Record<string, ClusterEntry> = {};
    let idx = 0;
    for (const c of clusters) {
        if (!c || !Array.isArray(c.nodeIds)) continue;
        const id = c.id !== undefined ? String(c.id) : `cluster-${idx}`;
        map[id] = Object.freeze({
            id,
            nodeIds: Object.freeze((c.nodeIds as ReadonlyArray<string | number>).map((x: string | number) => String(x))),
            label: c.label !== undefined ? String(c.label) : id,
        });
        idx++;
    }

    return Object.freeze({ clusters: Object.freeze(map), count: Object.keys(map).length });
}

// ---------------------------------------------------------------------------
// mergeClusters
// ---------------------------------------------------------------------------

/**
 * Merge dois ClusterRegistries.
 */
export function mergeClusters(
    registryA: ClusterRegistry | null | undefined,
    registryB: ClusterRegistry | null | undefined,
): ClusterRegistry {
    const clustersA = registryA && registryA.clusters ? registryA.clusters : {};
    const clustersB = registryB && registryB.clusters ? registryB.clusters : {};

    const merged: Record<string, ClusterEntry> = {};
    for (const [k, v] of Object.entries(clustersA)) merged[k] = v;
    for (const [k, v] of Object.entries(clustersB)) merged[k] = v;

    return Object.freeze({ clusters: Object.freeze(merged), count: Object.keys(merged).length });
}

// ---------------------------------------------------------------------------
// summarizeClusters
// ---------------------------------------------------------------------------

/**
 * Sumariza registry: total clusters, total nodes, avg size, max/min size.
 */
export function summarizeClusters(registry: ClusterRegistry | null | undefined): ClusterSummary {
    const EMPTY: ClusterSummary = Object.freeze({
        totalClusters: 0,
        totalNodes: 0,
        avgSize: 0,
        maxSize: 0,
        minSize: 0,
    });
    if (!registry || !registry.clusters) return EMPTY;

    const entries = Object.values(registry.clusters);
    if (!entries.length) return EMPTY;

    let total = 0;
    let maxSize = -Infinity;
    let minSize = Infinity;

    for (const c of entries) {
        const sz = Array.isArray(c.nodeIds) ? c.nodeIds.length : 0;
        total += sz;
        if (sz > maxSize) maxSize = sz;
        if (sz < minSize) minSize = sz;
    }

    return Object.freeze({
        totalClusters: entries.length,
        totalNodes: total,
        avgSize: total / entries.length,
        maxSize,
        minSize,
    });
}

// ---------------------------------------------------------------------------
// Module meta
// ---------------------------------------------------------------------------

export const nodeClusteringMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.59',
    exports: Object.freeze([
        'CLUSTER_STRATEGIES',
        'NODE_CLUSTERING_META',
        'clusterByAttribute',
        'clusterByConnectivity',
        'clusterByDegree',
        'createClusterRegistry',
        'mergeClusters',
        'summarizeClusters',
        'nodeClusteringMeta',
    ]),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
});
