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
 * Constellation Graph Query Engine — Phase 1.58 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S58
 *
 * Phase 1.58 (2026-05-02) — motor de query puro sobre grafos:
 * filtro de nodes/edges por predicados, travessia BFS/DFS,
 * subgrafos por critério, agregações.
 *
 * NÃO depende de browser. Sem fetch/DOM/Three.js.
 * Owner: Claude (orquestrador apropriador)
 */

export type TraversalStrategy = 'bfs' | 'dfs';
export type EdgeDirection = 'out' | 'in' | 'both';

export interface QueryNode {
    readonly id?: string;
    readonly [k: string]: unknown;
}

export interface QueryEdge {
    readonly from?: string;
    readonly to?: string;
    readonly [k: string]: unknown;
}

export interface QueryGraph {
    readonly nodes?: ReadonlyArray<QueryNode>;
    readonly edges?: ReadonlyArray<QueryEdge>;
    readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface TraversalEntry {
    readonly id: string;
    readonly depth: number;
}

export interface TraversalOptions {
    readonly maxDepth?: number;
    readonly direction?: EdgeDirection;
}

export interface DegreeRecord {
    readonly in: number;
    readonly out: number;
}

export type DegreesMap = Readonly<Record<string, DegreeRecord>>;

export interface QuerySummary {
    readonly matchedNodes: number;
    readonly matchedEdges: number;
    readonly totalNodes: number;
    readonly totalEdges: number;
}

export interface SubgraphResult {
    readonly nodes: ReadonlyArray<QueryNode>;
    readonly edges: ReadonlyArray<QueryEdge>;
    readonly metadata: Readonly<Record<string, unknown>>;
}

/** Identidade do módulo. */
export const GRAPH_QUERY_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.58',
    deliveredAt: '2026-05-02',
});

/** Estratégias de travessia. */
export const TRAVERSAL_STRATEGIES: ReadonlyArray<TraversalStrategy> = Object.freeze(['bfs', 'dfs']);

/**
 * Filtra nodes por predicado.
 */
export function queryNodes(
    graph: QueryGraph | null | undefined,
    predicate?: (n: QueryNode) => boolean,
): ReadonlyArray<QueryNode> {
    if (!graph || !Array.isArray(graph.nodes)) return Object.freeze<QueryNode[]>([]);
    if (typeof predicate !== 'function') return Object.freeze(graph.nodes.slice());
    return Object.freeze(graph.nodes.filter(predicate));
}

/**
 * Filtra edges por predicado.
 */
export function queryEdges(
    graph: QueryGraph | null | undefined,
    predicate?: (e: QueryEdge) => boolean,
): ReadonlyArray<QueryEdge> {
    if (!graph || !Array.isArray(graph.edges)) return Object.freeze<QueryEdge[]>([]);
    if (typeof predicate !== 'function') return Object.freeze(graph.edges.slice());
    return Object.freeze(graph.edges.filter(predicate));
}

/**
 * Busca node por id.
 */
export function findNodeById(graph: QueryGraph | null | undefined, id: string): QueryNode | null {
    if (!graph || !Array.isArray(graph.nodes) || typeof id !== 'string') return null;
    return graph.nodes.find((n) => n.id === id) || null;
}

/**
 * Retorna vizinhos diretos de um node (edges saindo ou chegando).
 */
export function getNeighbors(
    graph: QueryGraph | null | undefined,
    nodeId: string,
    direction: EdgeDirection = 'both',
): ReadonlyArray<string> {
    if (!graph || !Array.isArray(graph.edges) || typeof nodeId !== 'string') return Object.freeze<string[]>([]);
    const neighbors = new Set<string>();
    for (const e of graph.edges) {
        if (direction === 'out' || direction === 'both') {
            if (e.from === nodeId && typeof e.to === 'string') neighbors.add(e.to);
        }
        if (direction === 'in' || direction === 'both') {
            if (e.to === nodeId && typeof e.from === 'string') neighbors.add(e.from);
        }
    }
    return Object.freeze(Array.from(neighbors));
}

/**
 * Traversal BFS a partir de um node raiz.
 */
export function bfsTraversal(
    graph: QueryGraph | null | undefined,
    startId: string,
    options: TraversalOptions = {},
): ReadonlyArray<TraversalEntry> {
    if (!graph || typeof startId !== 'string') return Object.freeze<TraversalEntry[]>([]);
    const maxDepth = options.maxDepth ?? Infinity;
    const direction = options.direction ?? 'out';
    const visited = new Set<string>();
    const result: TraversalEntry[] = [];
    const queue: TraversalEntry[] = [{ id: startId, depth: 0 }];
    visited.add(startId);
    while (queue.length > 0) {
        const entry = queue.shift();
        if (!entry) break;
        const { id, depth } = entry;
        result.push(Object.freeze({ id, depth }));
        if (depth >= maxDepth) continue;
        for (const neighborId of getNeighbors(graph, id, direction)) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                queue.push({ id: neighborId, depth: depth + 1 });
            }
        }
    }
    return Object.freeze(result);
}

/**
 * Traversal DFS a partir de um node raiz.
 */
export function dfsTraversal(
    graph: QueryGraph | null | undefined,
    startId: string,
    options: TraversalOptions = {},
): ReadonlyArray<TraversalEntry> {
    if (!graph || typeof startId !== 'string') return Object.freeze<TraversalEntry[]>([]);
    const maxDepth = options.maxDepth ?? Infinity;
    const direction = options.direction ?? 'out';
    const visited = new Set<string>();
    const result: TraversalEntry[] = [];
    function dfs(id: string, depth: number): void {
        if (visited.has(id)) return;
        visited.add(id);
        result.push(Object.freeze({ id, depth }));
        if (depth >= maxDepth) return;
        for (const neighborId of getNeighbors(graph, id, direction)) {
            dfs(neighborId, depth + 1);
        }
    }
    dfs(startId, 0);
    return Object.freeze(result);
}

/**
 * Extrai subgrafo contendo apenas os nodes que passam no predicado
 * (e edges entre eles).
 */
export function subgraph(
    graph: QueryGraph | null | undefined,
    nodePredicate?: (n: QueryNode) => boolean,
): SubgraphResult {
    if (!graph)
        return Object.freeze({
            nodes: Object.freeze<QueryNode[]>([]),
            edges: Object.freeze<QueryEdge[]>([]),
            metadata: Object.freeze({}),
        });
    const nodes = queryNodes(graph, nodePredicate);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = Object.freeze(
        (graph.edges || []).filter(
            (e) => typeof e.from === 'string' && typeof e.to === 'string' && nodeIds.has(e.from) && nodeIds.has(e.to),
        ),
    );
    return Object.freeze({
        nodes,
        edges,
        metadata: graph.metadata ? Object.freeze({ ...graph.metadata }) : Object.freeze({}),
    });
}

/**
 * Conta in-degree e out-degree por node.
 */
export function computeDegrees(graph: QueryGraph | null | undefined): DegreesMap {
    if (!graph) return Object.freeze({});
    const degrees: Record<string, { in: number; out: number }> = {};
    for (const n of graph.nodes || []) {
        if (typeof n.id === 'string') degrees[n.id] = { in: 0, out: 0 };
    }
    for (const e of graph.edges || []) {
        const from = e.from;
        if (typeof from === 'string') {
            const degree = degrees[from];
            if (degree) degree.out += 1;
            else degrees[from] = { in: 0, out: 1 };
        }
        const to = e.to;
        if (typeof to === 'string') {
            const degree = degrees[to];
            if (degree) degree.in += 1;
            else degrees[to] = { in: 1, out: 0 };
        }
    }
    const frozen: Record<string, DegreeRecord> = {};
    for (const [id, d] of Object.entries(degrees)) frozen[id] = Object.freeze(d);
    return Object.freeze(frozen);
}

/**
 * Encontra nodes raiz (in-degree=0).
 */
export function findRoots(graph: QueryGraph | null | undefined): ReadonlyArray<string> {
    const degrees = computeDegrees(graph);
    return Object.freeze(
        Object.entries(degrees)
            .filter(([, d]) => d.in === 0)
            .map(([id]) => id),
    );
}

/**
 * Encontra nodes folha (out-degree=0).
 */
export function findLeaves(graph: QueryGraph | null | undefined): ReadonlyArray<string> {
    const degrees = computeDegrees(graph);
    return Object.freeze(
        Object.entries(degrees)
            .filter(([, d]) => d.out === 0)
            .map(([id]) => id),
    );
}

/**
 * Verifica se dois nodes têm caminho entre si (BFS).
 */
export function hasPath(graph: QueryGraph | null | undefined, fromId: string, toId: string): boolean {
    if (!graph || fromId === toId) return fromId === toId;
    const visited = bfsTraversal(graph, fromId, { direction: 'out' });
    return visited.some((v) => v.id === toId);
}

/**
 * Sumariza query sobre o grafo.
 */
export function summarizeQuery(
    graph: QueryGraph | null | undefined,
    nodePredicate?: (n: QueryNode) => boolean,
    edgePredicate?: (e: QueryEdge) => boolean,
): QuerySummary {
    const nodes = queryNodes(graph, nodePredicate);
    const edges = queryEdges(graph, edgePredicate);
    const totalNodes = graph && Array.isArray(graph.nodes) ? graph.nodes.length : 0;
    const totalEdges = graph && Array.isArray(graph.edges) ? graph.edges.length : 0;
    return Object.freeze({
        matchedNodes: nodes.length,
        matchedEdges: edges.length,
        totalNodes,
        totalEdges,
    });
}

/** Module identity export. */
export const graphQueryEngineMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.58',
    deliveredAt: '2026-05-02',
    exports: [
        'GRAPH_QUERY_META',
        'TRAVERSAL_STRATEGIES',
        'queryNodes',
        'queryEdges',
        'findNodeById',
        'getNeighbors',
        'bfsTraversal',
        'dfsTraversal',
        'subgraph',
        'computeDegrees',
        'findRoots',
        'findLeaves',
        'hasPath',
        'summarizeQuery',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
