// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (utils/edges/manager).
//
// Aplicação direta: utils/edges/manager.ts (582L) tem BFS / findPath /
// findTransitiveClosure / getDegree / findHubs como algoritmos puros sobre
// adjacency lists. Extração libera adoção:
//   - Tests podem rodar BFS em fixture sem inicializar module state
//   - Analytics podem importar pure helpers sem trazer window.dispatchEvent
//   - Algoritmos canônicos para citação acadêmica (BFS Cormen, hubs Newman)
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Segue padrão dos 5 Modules C anteriores
// (permissions, calculator, scenes, libraries, campaigns).
//
// Spec NOT:
// - NÃO ler module state (edges[]/edgesBySource/edgesByTarget — caller passa
//   adjacency lookup functions)
// - NÃO chamar window.dispatchEvent (side-effect — caller orquestra eventos)
// - NÃO chamar isValidEdge (depende de edgeTypes registry — caller injeta)
// - NÃO emoji
//
// Extracted helpers:
//   - EdgeLike / NeighborLookup / DegreeStats (canonical types)
//   - bfsTraversal(startId, neighborLookup, options)   pure BFS
//   - findShortestPath(startId, endId, neighborLookup, options)  pure
//   - findTransitiveClosureFromLookup(startId, neighborLookup, options)
//   - countByField<T>(items, field)                    pure aggregation
//   - computeDegreeFromIndex(elementId, outIndex, inIndex)  pure
//   - findIsolatedFromDegree(elementIds, degreeFn)     pure filter
//   - findHubsFromDegree(elementIds, degreeFn, minConnections)  pure ranking
//   - createEdgeShape(id, sourceId, targetId, typeId, options)
//   - isValidEdgeShape(value)                          type-guard

export type EdgeDirection = 'outgoing' | 'incoming' | 'both';

export interface EdgeLike {
    id: string;
    sourceId: string;
    targetId: string;
    type: string;
    bidirectional?: boolean;
    properties?: Record<string, unknown>;
    createdAt?: string;
    createdBy?: string;
    [key: string]: unknown;
}

export interface DegreeStats {
    in: number;
    out: number;
    total: number;
}

/**
 * Caller-provided neighbor lookup. Returns array of neighbor IDs.
 * Permite que pure helpers operem sobre qualquer indexação (Map, Set, plain object).
 */
export type NeighborLookup = (
    id: string,
    options: { outgoing: boolean; incoming: boolean; type?: string | null },
) => string[];

export interface BfsOptions {
    maxDepth?: number;
    type?: string | null;
    direction?: EdgeDirection;
}

export interface BfsResult {
    visited: string[];
    paths: Map<string, string[]>;
}

/**
 * Pure BFS traversal. Caller passa neighborLookup (não acopla a edges[]).
 *
 * Matches bfs @ edges/manager.ts:356 (mas pure — sem dependência de module state).
 *
 * Complexidade: O(V + E) onde V = ids alcançáveis, E = edges traversadas.
 * Algoritmo clássico (Cormen, Leiserson, Rivest, Stein 2009 — CLRS §22.2).
 */
export function bfsTraversal(
    startId: string,
    neighborLookup: NeighborLookup,
    options: BfsOptions = {},
): BfsResult {
    const maxDepth = options.maxDepth ?? Infinity;
    const direction: EdgeDirection = options.direction ?? 'both';
    const visited = new Set<string>();
    const paths = new Map<string, string[]>();
    const queue: Array<{ id: string; depth: number; path: string[] }> = [
        { id: startId, depth: 0, path: [startId] },
    ];
    visited.add(startId);
    paths.set(startId, [startId]);
    while (queue.length > 0) {
        const front = queue.shift();
        if (!front) break;
        const { id, depth, path } = front;
        if (depth >= maxDepth) continue;
        const neighbors = neighborLookup(id, {
            outgoing: direction !== 'incoming',
            incoming: direction !== 'outgoing',
            type: options.type ?? null,
        });
        for (const neighborId of neighbors) {
            if (!visited.has(neighborId)) {
                visited.add(neighborId);
                const newPath = path.concat([neighborId]);
                paths.set(neighborId, newPath);
                queue.push({ id: neighborId, depth: depth + 1, path: newPath });
            }
        }
    }
    return { visited: Array.from(visited), paths };
}

/**
 * Pure shortest path: BFS-derived (unweighted edges).
 * Returns path array (incluindo start e end) ou null se não alcançável.
 *
 * Matches findPath @ edges/manager.ts:401 (mas pure).
 */
export function findShortestPath(
    startId: string,
    endId: string,
    neighborLookup: NeighborLookup,
    options: BfsOptions = {},
): string[] | null {
    const { paths } = bfsTraversal(startId, neighborLookup, options);
    return paths.get(endId) || null;
}

/**
 * Pure transitive closure: todos os IDs alcançáveis de startId via edges do tipo.
 * Returns array de IDs DIFERENTES de startId (matches manager.ts:415 filter).
 */
export function findTransitiveClosureFromLookup(
    startId: string,
    neighborLookup: NeighborLookup,
    options: BfsOptions = {},
): string[] {
    const { visited } = bfsTraversal(startId, neighborLookup, options);
    return visited.filter((id) => id !== startId);
}

/**
 * Pure aggregation: count items por field value.
 * Generalização de countEdgesByType — útil para qualquer counting de tipos.
 *
 * Matches countEdgesByType @ edges/manager.ts:444 (mas generalizado).
 */
export function countByField<T>(items: ReadonlyArray<T>, field: keyof T): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
        const key = String(item[field]);
        counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
}

/**
 * Pure degree computation: caller passa outIndex/inIndex (Map<id, array>).
 * Returns {in, out, total}.
 *
 * Matches getDegree @ edges/manager.ts:457.
 */
export function computeDegreeFromIndex(
    elementId: string,
    outIndex: ReadonlyMap<string, ReadonlyArray<unknown>>,
    inIndex: ReadonlyMap<string, ReadonlyArray<unknown>>,
): DegreeStats {
    const inDegree = (inIndex.get(elementId) || []).length;
    const outDegree = (outIndex.get(elementId) || []).length;
    return { in: inDegree, out: outDegree, total: inDegree + outDegree };
}

/**
 * Pure isolated filter: returns IDs com degree.total === 0.
 * Caller passa degreeFn (pode usar computeDegreeFromIndex internamente).
 *
 * Matches findIsolatedElements @ edges/manager.ts:472.
 */
export function findIsolatedFromDegree(
    elementIds: ReadonlyArray<string>,
    degreeFn: (id: string) => DegreeStats,
): string[] {
    return elementIds.filter((id) => degreeFn(id).total === 0);
}

/**
 * Pure hubs ranking: returns elements com degree.total ≥ minConnections.
 * Caller passa elementIds (universe) + degreeFn.
 * Returns ordenado por degree.total desc (matches manager.ts:492 sort).
 *
 * Inspirado em Network Hub centrality (Newman 2010, §7.1 — "Networks: An Introduction").
 */
export function findHubsFromDegree(
    elementIds: ReadonlyArray<string>,
    degreeFn: (id: string) => DegreeStats,
    minConnections: number = 5,
): Array<{ id: string; degree: DegreeStats }> {
    const hubs: Array<{ id: string; degree: DegreeStats }> = [];
    for (const id of elementIds) {
        const degree = degreeFn(id);
        if (degree.total >= minConnections) hubs.push({ id, degree });
    }
    return hubs.sort((a, b) => b.degree.total - a.degree.total);
}

/**
 * Pure factory for edge shape (caller passa id pré-gerado + nowIso DI).
 * Matches addEdge inline shape @ edges/manager.ts:189-198.
 */
export function createEdgeShape(
    id: string,
    sourceId: string,
    targetId: string,
    typeId: string,
    options: {
        bidirectional?: boolean;
        properties?: Record<string, unknown>;
        createdBy?: string;
        nowIso?: string;
    } = {},
): EdgeLike {
    return {
        id,
        sourceId,
        targetId,
        type: typeId,
        bidirectional: !!options.bidirectional,
        properties: options.properties ? { ...options.properties } : {},
        createdAt: options.nowIso || new Date().toISOString(),
        createdBy: options.createdBy || 'system',
    };
}

/**
 * Type-guard for EdgeLike shape (boundary validation).
 */
export function isValidEdgeShape(value: unknown): value is EdgeLike {
    if (!value || typeof value !== 'object') return false;
    const e = value as EdgeLike;
    if (typeof e.id !== 'string' || e.id.length === 0) return false;
    if (typeof e.sourceId !== 'string' || e.sourceId.length === 0) return false;
    if (typeof e.targetId !== 'string' || e.targetId.length === 0) return false;
    if (typeof e.type !== 'string' || e.type.length === 0) return false;
    return true;
}

/**
 * Validate direction string from external sources.
 */
export function isValidEdgeDirection(value: unknown): value is EdgeDirection {
    return value === 'outgoing' || value === 'incoming' || value === 'both';
}
