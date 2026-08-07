// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Metrics - Phase 1.7 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.7 (2026-05-01) - pure-logic helpers para análise de arestas e
 * topologia do grafo constellation. Complementa:
 *   - Phase 1 metricSizing (radius por métrica)
 *   - Phase 1.5 metricBinning (color ramp por bin)
 *   - Phase 1.6 graphLayout (posicionamento)
 *
 * Funções:
 *   - computeAdjacencyMap: Map<id, Set<neighborIds>> em O(E)
 *   - computeNodeDegree: contagem de conexões por nó
 *   - filterEdges: filtros por minDegree/excludeSelfLoops/types
 *   - computeConnectedComponents: BFS para componentes do grafo
 *   - computeShortestPath: BFS para distâncias entre dois nós
 *   - computeBetweennessCentrality: simple Brandes-style approximation
 *
 * Foco em determinismo (mesma entrada → mesma saída).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const EDGE_METRICS_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.7',
    deliveredAt: '2026-05-01',
});

/**
 * Constrói adjacency map (não-direcional) a partir de lista de edges.
 * Edges referenciando nós ausentes são ignoradas (fail-safe).
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @returns {Map<string, Set<string>>}
 */
export function computeAdjacencyMap(nodes: Array<{id: string}>, edges: Array<{source: string, target: string}>): Map<string, Set<string>> {
    const map = new Map();
    if (!Array.isArray(nodes)) return map;

    const validIds = new Set();
    for (const node of nodes) {
        if (!node || node.id == null) continue;
        const id = String(node.id);
        validIds.add(id);
        map.set(id, new Set());
    }

    if (!Array.isArray(edges)) return map;

    for (const edge of edges) {
        if (!edge) continue;
        const s = String(edge.source || '').trim();
        const t = String(edge.target || '').trim();
        if (!s || !t || !validIds.has(s) || !validIds.has(t)) continue;
        if (s === t) continue; // ignora self-loops por padrão
        map.get(s).add(t);
        map.get(t).add(s);
    }
    return map;
}

/**
 * Conta degree (n. de conexões) de cada nó.
 *
 * @param {Map<string, Set<string>>} adjacency
 * @returns {Map<string, number>}
 */
export function computeNodeDegree(adjacency: Map<string, Set<string>>): Map<string, number> {
    const degrees = new Map();
    if (!(adjacency instanceof Map)) return degrees;
    for (const [id, neighbors] of adjacency) {
        degrees.set(id, neighbors instanceof Set ? neighbors.size : 0);
    }
    return degrees;
}

/**
 * Filtra edges por critérios.
 *
 * @param {Array<any>} edges
 * @param {Object} [options]
 * @param {Set<string>} [options.allowedTypes] - se fornecido, só edges com type listado
 * @param {boolean} [options.excludeSelfLoops=true]
 * @param {Set<string>} [options.allowedNodes] - só edges entre esses nós
 * @returns {Array<any>}
 */
export function filterEdges(edges: Array<any>, options: { allowedTypes?: Set<string>; excludeSelfLoops?: boolean; allowedNodes?: Set<string> } = {}): Array<any> {
    if (!Array.isArray(edges)) return [];
    const excludeSelfLoops = options.excludeSelfLoops !== false;
    const types = options.allowedTypes instanceof Set ? options.allowedTypes : null;
    const nodes = options.allowedNodes instanceof Set ? options.allowedNodes : null;

    return edges.filter((edge) => {
        if (!edge) return false;
        const s = String(edge.source || '');
        const t = String(edge.target || '');
        if (!s || !t) return false;
        if (excludeSelfLoops && s === t) return false;
        if (types && !types.has(edge.type)) return false;
        if (nodes && (!nodes.has(s) || !nodes.has(t))) return false;
        return true;
    });
}

/**
 * Computa componentes conexos via BFS.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Map<string, Set<string>>} adjacency
 * @returns {Array<Array<string>>} array de componentes (cada um é array de ids)
 */
export function computeConnectedComponents(nodes: Array<{id: string}>, adjacency: Map<string, Set<string>>): Array<Array<string>> {
    
    const components: any[]= [];
    if (!Array.isArray(nodes) || !(adjacency instanceof Map)) return components;

    const visited = new Set();
    for (const node of nodes) {
        if (!node || node.id == null) continue;
        const startId = String(node.id);
        if (visited.has(startId)) continue;

        // BFS
        const queue = [startId];
        const component = [];
        visited.add(startId);

        while (queue.length > 0) {
            const current = (queue.shift()) as string;
            component.push(current);
            const neighbors = adjacency.get(current);
            if (neighbors instanceof Set) {
                for (const neighbor of neighbors) {
                    if (!visited.has(neighbor)) {
                        visited.add(neighbor);
                        queue.push(neighbor);
                    }
                }
            }
        }
        components.push(component);
    }
    return components;
}

/**
 * Caminho mais curto entre dois nós via BFS.
 * Retorna array de ids (incluindo start + end) ou null se desconectado.
 *
 * @param {string} startId
 * @param {string} endId
 * @param {Map<string, Set<string>>} adjacency
 * @returns {Array<string> | null}
 */
export function computeShortestPath(startId: string, endId: string, adjacency: Map<string, Set<string>>): Array<string> | null {
    if (!(adjacency instanceof Map)) return null;
    const start = String(startId || '');
    const end = String(endId || '');
    if (!start || !end) return null;
    if (!adjacency.has(start) || !adjacency.has(end)) return null;
    if (start === end) return [start];

    const queue = [start];
    const visited = new Set([start]);
    const parents = new Map();

    while (queue.length > 0) {
        const current = (queue.shift()) as string;
        const neighbors = adjacency.get(current);
        if (!(neighbors instanceof Set)) continue;
        for (const neighbor of neighbors) {
            if (visited.has(neighbor)) continue;
            visited.add(neighbor);
            parents.set(neighbor, current);
            if (neighbor === end) {
                // Reconstrua caminho
                const path = [end];
                let cur = end;
                while (parents.has(cur)) {
                    cur = parents.get(cur);
                    path.unshift(cur);
                }
                return path;
            }
            queue.push(neighbor);
        }
    }
    return null;
}

/**
 * Aproximação simples de betweenness centrality.
 * Para cada par (s, t), conta nós intermediários no shortest path.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Map<string, Set<string>>} adjacency
 * @returns {Map<string, number>} centrality score por id
 */
export function computeBetweennessCentrality(nodes: Array<{id: string}>, adjacency: Map<string, Set<string>>): Map<string, number> {
    const centrality = new Map();
    if (!Array.isArray(nodes) || !(adjacency instanceof Map)) return centrality;

    const ids = nodes
        .filter((n) => n && n.id != null)
        .map((n) => String(n.id))
        .filter((id) => adjacency.has(id));

    for (const id of ids) centrality.set(id, 0);

    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const path = computeShortestPath(ids[i]!, ids[j]!, adjacency);
            if (!path || path.length <= 2) continue;
            // Intermediários (exclui endpoints)
            for (let k = 1; k < path.length - 1; k++) {
                centrality.set(path[k], (centrality.get(path[k]) || 0) + 1);
            }
        }
    }
    return centrality;
}

/**
 * Sumário topológico do grafo.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @returns {Object}
 */
export function summarizeGraph(nodes: Array<{id: string}>, edges: Array<{source: string, target: string}>): Object {
    const adjacency = computeAdjacencyMap(nodes, edges);
    const degrees = computeNodeDegree(adjacency);
    const components = computeConnectedComponents(Array.isArray(nodes) ? nodes : [], adjacency);

    let totalDegree = 0;
    let maxDegree = 0;
    let isolated = 0;
    for (const d of degrees.values()) {
        totalDegree += d;
        if (d > maxDegree) maxDegree = d;
        if (d === 0) isolated++;
    }

    const nodeCount = adjacency.size;
    const edgeCount = totalDegree / 2;

    return {
        nodeCount,
        edgeCount,
        componentCount: components.length,
        largestComponentSize: components.reduce((max, c) => Math.max(max, c.length), 0),
        avgDegree: nodeCount > 0 ? totalDegree / nodeCount : 0,
        maxDegree,
        isolated,
        density: nodeCount > 1 ? (2 * edgeCount) / (nodeCount * (nodeCount - 1)) : 0,
    };
}

/**
 * Module identity export.
 */
export const edgeMetricsMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.7',
    deliveredAt: '2026-05-01',
    exports: [
        'EDGE_METRICS_META',
        'computeAdjacencyMap',
        'computeNodeDegree',
        'filterEdges',
        'computeConnectedComponents',
        'computeShortestPath',
        'computeBetweennessCentrality',
        'summarizeGraph',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
