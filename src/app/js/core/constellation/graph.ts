// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONSTELLATION GRAPH — core data model + algorithms (pure)
   SPEC_CONSTELLATION_HUD_9_75 §Q5

   Grafo dirigido com 4 camadas de relação (Z3a espacial, Z3b
   hierárquica, Z3c temporal, Z3d semântica). Algoritmos puros
   para focus/neighbors, path-finding, cluster detection.

   Sem DOM, sem Three.js — apenas estruturas + algoritmos. UI
   layer em utils/ui/constellationHud (fase 2).
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Relation layers (§2.2)
// ──────────────────────────────────────────────────────────────────────

export const RELATION_LAYERS = Object.freeze({
    SPATIAL: 'z3a', // proximity, containment geographic
    HIERARCHICAL: 'z3b', // campaign → family → element
    TEMPORAL: 'z3c', // before, depends on
    SEMANTIC: 'z3d', // monitora, alimenta, drena (custom types)
});

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida shape de nó.
 * @param {any} node
 * @returns {boolean}
 */
export function isValidNode(node: any): boolean {
    return !!(
        node &&
        typeof node === 'object' &&
        typeof node.id === 'string' &&
        node.id.length > 0 &&
        (typeof node.type === 'string' || node.type === undefined)
    );
}

/**
 * Valida shape de aresta.
 * @param {any} edge
 * @returns {boolean}
 */
export function isValidEdge(edge: any): boolean {
    return !!(
        edge &&
        typeof edge === 'object' &&
        typeof edge.source === 'string' &&
        typeof edge.target === 'string' &&
        edge.source !== edge.target // self-loop rejected
    );
}

// ──────────────────────────────────────────────────────────────────────
// Graph builder - adjacency map O(1) lookup
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói índice de grafo (nodes Map + outAdj Map + inAdj Map).
 *
 * @param {Array<any>} nodes
 * @param {Array<any>} edges
 * @returns {{
 *   nodes: Map<string, any>,
 *   outAdj: Map<string, Array<{target: string, edge: any}>>,
 *   inAdj: Map<string, Array<{source: string, edge: any}>>,
 *   edges: Array<any>,
 *   stats: { nodeCount: number, edgeCount: number, droppedNodes: number, droppedEdges: number }
 * }}
 */
export function buildGraph(nodes: Array<any> = [], edges: Array<any> = []): { nodes: Map<string, any>, outAdj: Map<string, Array<{target: string, edge: any}>>, inAdj: Map<string, Array<{source: string, edge: any}>>, edges: Array<any>, stats: { nodeCount: number, edgeCount: number, droppedNodes: number, droppedEdges: number } } {
    const validNodes = Array.isArray(nodes) ? nodes.filter(isValidNode) : [];
    const droppedNodes = (Array.isArray(nodes) ? nodes.length : 0) - validNodes.length;

    const nodeMap = new Map();
    for (const n of validNodes) nodeMap.set(n.id, n);

    const validEdges = [];
    const outAdj = new Map();
    const inAdj = new Map();
    let droppedEdges = 0;

    for (const e of Array.isArray(edges) ? edges : []) {
        if (!isValidEdge(e)) {
            droppedEdges++;
            continue;
        }
        if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) {
            droppedEdges++;
            continue;
        }
        validEdges.push(e);
        if (!outAdj.has(e.source)) outAdj.set(e.source, []);
        if (!inAdj.has(e.target)) inAdj.set(e.target, []);
        outAdj.get(e.source).push({ target: e.target, edge: e });
        inAdj.get(e.target).push({ source: e.source, edge: e });
    }

    return {
        nodes: nodeMap,
        outAdj,
        inAdj,
        edges: validEdges,
        stats: {
            nodeCount: validNodes.length,
            edgeCount: validEdges.length,
            droppedNodes,
            droppedEdges,
        },
    };
}

// ──────────────────────────────────────────────────────────────────────
// Neighborhood queries (focus / N-hop)
// ──────────────────────────────────────────────────────────────────────

/**
 * Collect outgoing neighbor ids, optionally filtering by layer.
 */
function collectOutNeighbors(graph: ReturnType<typeof buildGraph>, nodeId: string, layer: string | null): Set<string> {
    const out = new Set<string>();
    const adj = graph.outAdj.get(nodeId) || [];
    for (const { target, edge } of adj) {
        if (layer && edge.layer !== layer) continue;
        out.add(target);
    }
    return out;
}

/**
 * Collect incoming neighbor ids, optionally filtering by layer.
 */
function collectInNeighbors(graph: ReturnType<typeof buildGraph>, nodeId: string, layer: string | null): Set<string> {
    const out = new Set<string>();
    const adj = graph.inAdj.get(nodeId) || [];
    for (const { source, edge } of adj) {
        if (layer && edge.layer !== layer) continue;
        out.add(source);
    }
    return out;
}

/**
 * Vizinhos diretos (1-hop) de um nó. Inclui out + in edges.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} nodeId
 * @param {any} [opts]
 * @returns {Set<string>}
 */
export function getNeighbors(graph: ReturnType<typeof buildGraph>, nodeId: string, opts: any = {}): Set<string> {
    const out = new Set<string>();
    if (!graph || !nodeId || !graph.nodes?.has(nodeId)) return out;
    const direction = opts.direction || 'both';
    const layer = opts.layer || null;

    if (direction === 'out') return collectOutNeighbors(graph, nodeId, layer);
    if (direction === 'in') return collectInNeighbors(graph, nodeId, layer);

    for (const n of collectOutNeighbors(graph, nodeId, layer)) out.add(n);
    for (const n of collectInNeighbors(graph, nodeId, layer)) out.add(n);
    return out;
}

/**
 * BFS N-hop neighborhood. Retorna Set de IDs dentro de `maxHops`.
 * Inclui o próprio nó (distância 0).
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} startId
 * @param {number} maxHops
 * @param {any} [opts]
 * @returns {Map<string, number>} - id → hop distance
 */
export function getNHopNeighbors(graph: ReturnType<typeof buildGraph>, startId: string, maxHops: number = 1, opts: any = {}): Map<string, number> {
    const result = new Map();
    if (!graph || !startId || !graph.nodes?.has(startId)) return result;
    if (!Number.isFinite(maxHops) || maxHops < 0) return result;

    result.set(startId, 0);
    let frontier = [startId];
    for (let hop = 1; hop <= maxHops; hop++) {
        const nextFrontier = [];
        for (const nodeId of frontier) {
            const neighbors = getNeighbors(graph, nodeId, opts);
            for (const n of neighbors) {
                if (!result.has(n)) {
                    result.set(n, hop);
                    nextFrontier.push(n);
                }
            }
        }
        if (nextFrontier.length === 0) break;
        frontier = nextFrontier;
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// Shortest path (BFS - unweighted)
// ──────────────────────────────────────────────────────────────────────

/**
 * Encontra caminho mais curto (menos arestas) entre dois nós via BFS.
 * Grafo considerado como não-dirigido para path-finding (matches §Q6
 * "Path: traçar caminho entre dois nós" - qualquer direção).
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} sourceId
 * @param {string} targetId
 * @returns {Array<string>|null} - sequência de IDs, ou null se não existe caminho
 */
export function shortestPath(graph: ReturnType<typeof buildGraph>, sourceId: string, targetId: string): Array<string>|null {
    if (!graph || !sourceId || !targetId) return null;
    if (!graph.nodes?.has(sourceId) || !graph.nodes?.has(targetId)) return null;
    if (sourceId === targetId) return [sourceId];

    const visited = new Set([sourceId]);
    const parent = new Map();
    const queue = [sourceId];

    while (queue.length > 0) {
        const current = (queue.shift()) as string;
        const neighbors = getNeighbors(graph, current);
        for (const n of neighbors) {
            if (visited.has(n)) continue;
            visited.add(n);
            parent.set(n, current);
            if (n === targetId) {
                // Reconstruct path
                const path = [targetId];
                let p = current;
                while (p !== undefined) {
                    path.unshift(p);
                    p = parent.get(p);
                }
                return path;
            }
            queue.push(n);
        }
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────
// Connected components (cluster detection)
// ──────────────────────────────────────────────────────────────────────

/**
 * Encontra componentes conectados (weakly - trata como não-dirigido).
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @returns {Array<Set<string>>} - array de sets de IDs
 */
export function connectedComponents(graph: ReturnType<typeof buildGraph>): Array<Set<string>> {
    if (!graph?.nodes) return [];
    const visited = new Set<string>();
    const components: Set<string>[] = [];

    for (const nodeId of graph.nodes.keys()) {
        if (visited.has(nodeId)) continue;
        const comp = new Set<string>();
        const stack = [nodeId];
        while (stack.length > 0) {
            const cur = (stack.pop()) as string;
            if (visited.has(cur)) continue;
            visited.add(cur);
            comp.add(cur);
            const neighbors = getNeighbors(graph, cur);
            for (const n of neighbors) {
                if (!visited.has(n)) stack.push(n);
            }
        }
        components.push(comp);
    }
    return components;
}

// ──────────────────────────────────────────────────────────────────────
// Degree + centrality helpers
// ──────────────────────────────────────────────────────────────────────

/**
 * Degree (in + out) de um nó.
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} nodeId
 * @returns {{ in: number, out: number, total: number }}
 */
export function getDegree(graph: ReturnType<typeof buildGraph>, nodeId: string): { in: number, out: number, total: number } {
    if (!graph || !nodeId) return { in: 0, out: 0, total: 0 };
    const outAdj = graph.outAdj?.get(nodeId) || [];
    const inAdj = graph.inAdj?.get(nodeId) || [];
    return { in: inAdj.length, out: outAdj.length, total: inAdj.length + outAdj.length };
}

/**
 * Top-N nós por degree centrality (simples).
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {number} [limit=10]
 * @returns {Array<{ id: string, degree: number }>}
 */
export function topByDegree(graph: ReturnType<typeof buildGraph>, limit: number = 10): Array<{ id: string, degree: number }> {
    if (!graph?.nodes) return [];
    const ranked = [];
    for (const id of graph.nodes.keys()) {
        const { total } = getDegree(graph, id);
        ranked.push({ id, degree: total });
    }
    ranked.sort((a, b) => b.degree - a.degree);
    return ranked.slice(0, limit);
}

// ──────────────────────────────────────────────────────────────────────
// Layout algorithms
// ──────────────────────────────────────────────────────────────────────

/**
 * Gera grafo a partir de modelo (conveniência para tests + UI).
 *
 * @param {{ nodes?: Array<any>, edges?: Array<any> }} model
 * @returns {ReturnType<typeof buildGraph>}
 */
export function generateGraph(model: { nodes?: Array<any>, edges?: Array<any> } = {}): ReturnType<typeof buildGraph> {
    return buildGraph(model.nodes || [], model.edges || []);
}

/**
 * Parse options for force-directed layout.
 */
function parseForceOptions(opts: any) {
    const width = opts.width ?? 800;
    const height = opts.height ?? 600;
    return {
        iterations: opts.iterations ?? 300,
        width,
        height,
        repulsion: opts.repulsion ?? 200,
        attraction: opts.attraction ?? 0.05,
        damping: opts.damping ?? 0.9,
        minMovement: opts.minMovement ?? 0.01,
        cutoff: opts.cutoff ?? Math.min(width, height) * 0.5,
    };
}

/**
 * Initialize position/velocity arrays for force-directed layout.
 */
function initForceLayout(graph: ReturnType<typeof buildGraph>, width: number, height: number) {
    const nodeIds = Array.from(graph.nodes.keys());
    const n = nodeIds.length;
    const px = new Float64Array(n);
    const py = new Float64Array(n);
    const vx = new Float64Array(n);
    const vy = new Float64Array(n);
    const idToIdx = new Map<string, number>();

    for (let i = 0; i < n; i++) {
        idToIdx.set(nodeIds[i] as string, i);
        px[i] = (Math.random() - 0.5) * width * 0.5;
        py[i] = (Math.random() - 0.5) * height * 0.5;
    }

    return { nodeIds, n, px, py, vx, vy, idToIdx };
}

/**
 * Apply repulsive forces between all node pairs within cutoff distance.
 */
function applyRepulsionForces(
    px: Float64Array,
    py: Float64Array,
    vx: Float64Array,
    vy: Float64Array,
    n: number,
    repulsion: number,
    cutoffSq: number,
) {
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const dx = px[i]! - px[j]!;
            const dy = py[i]! - py[j]!;
            const distSq = dx * dx + dy * dy;
            if (distSq > cutoffSq || distSq === 0) continue;
            const dist = Math.sqrt(distSq);
            const force = repulsion / distSq;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            vx[i] = vx[i]! + fx;
            vy[i] = vy[i]! + fy;
            vx[j] = vx[j]! - fx;
            vy[j] = vy[j]! - fy;
        }
    }
}

/**
 * Apply attractive forces along edges.
 */
function applyAttractionForces(
    px: Float64Array,
    py: Float64Array,
    vx: Float64Array,
    vy: Float64Array,
    edges: Array<any>,
    idToIdx: Map<string, number>,
    attraction: number,
) {
    for (const e of edges) {
        const i = idToIdx.get(e.source);
        const j = idToIdx.get(e.target);
        if (i === undefined || j === undefined) continue;
        const dx = px[j]! - px[i]!;
        const dy = py[j]! - py[i]!;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = dist * attraction;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        vx[i] = vx[i]! + fx;
        vy[i] = vy[i]! + fy;
        vx[j] = vx[j]! - fx;
        vy[j] = vy[j]! - fy;
    }
}

/**
 * Apply damping, update positions and return total movement.
 */
function applyDampingAndUpdate(
    px: Float64Array,
    py: Float64Array,
    vx: Float64Array,
    vy: Float64Array,
    n: number,
    damping: number,
): number {
    let totalMovement = 0;
    for (let i = 0; i < n; i++) {
        vx[i] = vx[i]! * damping;
        vy[i] = vy[i]! * damping;
        px[i] = px[i]! + vx[i]!;
        py[i] = py[i]! + vy[i]!;
        totalMovement += Math.abs(vx[i]!) + Math.abs(vy[i]!);
        vx[i] = 0;
        vy[i] = 0;
    }
    return totalMovement;
}

/**
 * Build result nodes from position arrays.
 */
function buildLayoutNodes(nodeIds: string[], px: Float64Array, py: Float64Array, n: number): Array<{ id: string; x: number; y: number }> {
    const nodes = [];
    for (let i = 0; i < n; i++) {
        nodes.push({ id: nodeIds[i]!, x: px[i]!, y: py[i]! });
    }
    return nodes;
}

/**
 * Layout force-directed com repulsão + atração.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {any} [opts]
 * @returns {{ nodes: Array<{id: string, x: number, y: number}> }}
 */
export function layoutForceDirected(graph: ReturnType<typeof buildGraph>, opts: any = {}): { nodes: Array<{id: string, x: number, y: number}> } {
    const { iterations, width, height, repulsion, attraction, damping, minMovement, cutoff } = parseForceOptions(opts);

    if (!graph?.nodes?.size) return { nodes: [] };

    const { nodeIds, n, px, py, vx, vy, idToIdx } = initForceLayout(graph, width, height);
    const cutoffSq = cutoff * cutoff;

    for (let iter = 0; iter < iterations; iter++) {
        applyRepulsionForces(px, py, vx, vy, n, repulsion, cutoffSq);
        applyAttractionForces(px, py, vx, vy, graph.edges, idToIdx, attraction);
        const totalMovement = applyDampingAndUpdate(px, py, vx, vy, n, damping);
        if (totalMovement < minMovement) break;
    }

    const nodes = buildLayoutNodes(nodeIds, px, py, n);
    normalizePositions(nodes, width, height, 20);
    return { nodes };
}

/**
 * Find root nodes (no incoming edges). Falls back to highest-degree node when
 * the graph has no roots (cycle).
 */
function findRootNodes(graph: ReturnType<typeof buildGraph>): string[] {
    const roots = [];
    for (const id of graph.nodes.keys()) {
        const inDegree = graph.inAdj.get(id)?.length || 0;
        if (inDegree === 0) roots.push(id);
    }
    if (roots.length === 0) {
        const top = topByDegree(graph, 1);
        if (top.length) roots.push((top[0] as { id: string }).id);
    }
    return roots;
}

/**
 * Assign BFS levels starting from root nodes following outgoing edges.
 */
function assignBfsLevels(graph: ReturnType<typeof buildGraph>, roots: string[]): Map<string, number> {
    const levels = new Map<string, number>();
    const visited = new Set<string>();
    const queue = roots.map((id) => ({ id, level: 0 }));
    for (const { id } of queue) visited.add(id);

    while (queue.length > 0) {
        const { id, level } = queue.shift() as { id: string; level: number };
        levels.set(id, level);
        const outNeighbors = getNeighbors(graph, id, { direction: 'out' });
        for (const n of outNeighbors) {
            if (!visited.has(n)) {
                visited.add(n);
                queue.push({ id: n, level: level + 1 });
            }
        }
    }

    return levels;
}

/**
 * Ensure every node has a level (isolated/cycle nodes default to 0).
 */
function ensureAllLevels(levels: Map<string, number>, graph: ReturnType<typeof buildGraph>) {
    for (const id of graph.nodes.keys()) {
        if (!levels.has(id)) levels.set(id, 0);
    }
}

/**
 * Group node ids by their assigned level.
 */
function groupNodesByLevel(levels: Map<string, number>): { levelGroups: Map<number, string[]>; maxLevel: number } {
    const levelGroups = new Map<number, string[]>();
    for (const [id, level] of levels) {
        if (!levelGroups.has(level)) levelGroups.set(level, []);
        levelGroups.get(level)!.push(id);
    }
    const maxLevel = Math.max(0, ...levels.values());
    return { levelGroups, maxLevel };
}

/**
 * Compute coordinates for a single level of nodes.
 */
function positionLevelNodes(
    level: number,
    ids: string[],
    maxLevel: number,
    width: number,
    height: number,
    direction: string,
): Array<{ id: string; x: number; y: number }> {
    const nodes = [];
    const count = ids.length;
    const levelFraction = level / Math.max(maxLevel, 1);

    for (let i = 0; i < count; i++) {
        const fraction = count === 1 ? 0.5 : i / (count - 1);
        let x, y;
        if (direction === 'TB' || direction === 'BT') {
            x = width * 0.1 + fraction * width * 0.8;
            y = direction === 'TB'
                ? height * 0.1 + levelFraction * height * 0.8
                : height * 0.9 - levelFraction * height * 0.8;
        } else {
            y = height * 0.1 + fraction * height * 0.8;
            x = direction === 'LR'
                ? width * 0.1 + levelFraction * width * 0.8
                : width * 0.9 - levelFraction * width * 0.8;
        }
        nodes.push({ id: ids[i] as string, x, y });
    }

    return nodes;
}

/**
 * Layout hierárquico (tree) usando BFS levels.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {any} [opts]
 * @returns {{ nodes: Array<{id: string, x: number, y: number}> }}
 */
export function layoutHierarchical(graph: ReturnType<typeof buildGraph>, opts: any = {}): { nodes: Array<{id: string, x: number, y: number}> } {
    const width = opts.width ?? 800;
    const height = opts.height ?? 600;
    const direction = opts.direction ?? 'TB';

    if (!graph?.nodes?.size) return { nodes: [] };

    const roots = findRootNodes(graph);
    const levels = assignBfsLevels(graph, roots);
    ensureAllLevels(levels, graph);

    const { levelGroups, maxLevel } = groupNodesByLevel(levels);
    const nodes: Array<{ id: string; x: number; y: number }> = [];

    for (const [level, ids] of levelGroups) {
        nodes.push(...positionLevelNodes(level, ids, maxLevel, width, height, direction));
    }

    return { nodes };
}

/**
 * Layout circular - coloca nós em círculo, ordenados por degree centrality.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {any} [opts]
 * @returns {{ nodes: Array<{id: string, x: number, y: number}> }}
 */
export function layoutCircular(graph: ReturnType<typeof buildGraph>, opts: any = {}): { nodes: Array<{id: string, x: number, y: number}> } {
    const width = opts.width ?? 800;
    const height = opts.height ?? 600;

    if (!graph?.nodes?.size) return { nodes: [] };

    const ranked = topByDegree(graph, graph.nodes.size);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 40;

    const nodes = ranked.map(({ id }, i) => {
        const angle = (2 * Math.PI * i) / ranked.length - Math.PI / 2;
        return {
            id,
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        };
    });

    return { nodes };
}

/**
 * Extract a 2D coordinate from node metadata, if present.
 */
function extractSpatialCoordinate(node: any, id: string): { id: string; x: number; y: number } | null {
    const meta = node || {};
    if (typeof meta.x === 'number' && typeof meta.y === 'number') {
        return { id, x: meta.x, y: meta.y };
    }
    if (typeof meta.lng === 'number' && typeof meta.lat === 'number') {
        return { id, x: meta.lng, y: meta.lat };
    }
    return null;
}

/**
 * Layout espacial - usa coordenadas (x, y, z) dos metadados do nó;
 * fallback para force-directed.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {any} [opts]
 * @returns {{ nodes: Array<{id: string, x: number, y: number}> }}
 */
export function layoutSpatial(graph: ReturnType<typeof buildGraph>, opts: any = {}): { nodes: Array<{id: string, x: number, y: number}> } {
    const width = opts.width ?? 800;
    const height = opts.height ?? 600;

    if (!graph?.nodes?.size) return { nodes: [] };

    const nodes: Array<{ id: string; x: number; y: number }> = [];
    let spatialCount = 0;

    for (const [id, node] of graph.nodes) {
        const pos = extractSpatialCoordinate(node, id);
        if (pos) {
            spatialCount++;
            nodes.push(pos);
        }
    }

    if (spatialCount > 0 && spatialCount === graph.nodes.size) {
        normalizePositions(nodes, width, height, 20);
        return { nodes };
    }

    // Fallback to force-directed
    return layoutForceDirected(graph, { ...opts, iterations: opts.iterations ?? 200 });
}

/**
 * Calcula bounding box de um array de posições.
 *
 * @param {Array<{x: number, y: number}>} nodes
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number, width: number, height: number }}
 */
export function calculateBoundingBox(nodes: Array<{x: number, y: number}>): { minX: number, minY: number, maxX: number, maxY: number, width: number, height: number } {
    if (!nodes || nodes.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
    }
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const n of nodes) {
        if (n.x < minX) minX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.x > maxX) maxX = n.x;
        if (n.y > maxY) maxY = n.y;
    }
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * Normaliza posições para caber no bounding box com padding.
 *
 * @param {Array<{id?: string, x: number, y: number}>} nodes
 * @param {number} width
 * @param {number} height
 * @param {number} [padding=20]
 */
export function normalizePositions(nodes: Array<{id?: string, x: number, y: number}>, width: number, height: number, padding: number = 20) {
    if (!nodes || nodes.length === 0) return;
    const bb = calculateBoundingBox(nodes);
    if (bb.width === 0 && bb.height === 0) {
        // All at same point, center them
        for (const n of nodes) {
            n.x = width / 2;
            n.y = height / 2;
        }
        return;
    }
    const availW = width - padding * 2;
    const availH = height - padding * 2;
    const scaleX = bb.width > 0 ? availW / bb.width : 1;
    const scaleY = bb.height > 0 ? availH / bb.height : 1;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = padding + (availW - bb.width * scale) / 2;
    const offsetY = padding + (availH - bb.height * scale) / 2;

    for (const n of nodes) {
        n.x = offsetX + (n.x - bb.minX) * scale;
        n.y = offsetY + (n.y - bb.minY) * scale;
    }
}

// ──────────────────────────────────────────────────────────────────────
// Utility functions
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna nós dentro de N hops (incluindo o próprio nó).
 * Wrapper conveniente sobre getNHopNeighbors.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} nodeId
 * @param {number} [depth=1]
 * @returns {Array<string>}
 */
export function findNeighbors(graph: ReturnType<typeof buildGraph>, nodeId: string, depth: number = 1): Array<string> {
    const hops = getNHopNeighbors(graph, nodeId, depth);
    return Array.from(hops.keys());
}

/**
 * Encontra caminho entre dois nós (wrapper sobre shortestPath).
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} sourceId
 * @param {string} targetId
 * @returns {Array<string>|null}
 */
export function findPath(graph: ReturnType<typeof buildGraph>, sourceId: string, targetId: string): Array<string>|null {
    return shortestPath(graph, sourceId, targetId);
}

/**
 * Collect direct and indirect impact neighbors up to `depth`.
 */
function collectImpactNeighbors(
    graph: ReturnType<typeof buildGraph>,
    nodeId: string,
    depth: number,
): { direct: Array<{ id: string; score: number }>; indirect: Array<{ id: string; score: number }>; totalScore: number } {
    const allHops = getNHopNeighbors(graph, nodeId, depth);
    const directHops = getNHopNeighbors(graph, nodeId, 1);

    const direct: Array<{ id: string; score: number }> = [];
    const indirect: Array<{ id: string; score: number }> = [];
    let totalScore = 0;

    for (const [id] of directHops) {
        if (id === nodeId) continue;
        const deg = getDegree(graph, id);
        direct.push({ id, score: deg.total });
        totalScore += deg.total;
    }

    for (const [id, hop] of allHops) {
        if (id === nodeId || hop <= 1) continue;
        const deg = getDegree(graph, id);
        const score = +(deg.total * (1 / hop)).toFixed(4);
        indirect.push({ id, score });
        totalScore += score;
    }

    return { direct, indirect, totalScore };
}

/**
 * Normalize an impact score against the maximum possible directed edges.
 */
function normalizeImpactScore(totalScore: number, nodeCount: number): number {
    const maxPossible = nodeCount * (nodeCount - 1);
    return maxPossible > 0 ? Math.min(1, +(totalScore / maxPossible).toFixed(6)) : 0;
}

/**
 * Calcula impacto de um nó: direto (1-hop) e indireto (até `depth`).
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @param {string} nodeId
 * @param {number|any} [opts=2]
 * @returns {{ direct: Array<{id: string, score: number}>, indirect: Array<{id: string, score: number}>, score: number }}
 */
export function calculateImpact(graph: ReturnType<typeof buildGraph>, nodeId: string, opts: number|any = 2): { direct: Array<{id: string, score: number}>, indirect: Array<{id: string, score: number}>, score: number } {
    const depth = typeof opts === 'number' ? opts : (opts?.depth ?? 2);

    const result: { direct: Array<{id:string,score:number}>, indirect: Array<{id:string,score:number}>, score: number } = { direct: [], indirect: [], score: 0 };
    if (!graph || !nodeId || !graph.nodes?.has(nodeId)) return result;

    const { direct, indirect, totalScore } = collectImpactNeighbors(graph, nodeId, depth);
    result.direct = direct;
    result.indirect = indirect;
    result.score = normalizeImpactScore(totalScore, graph.nodes.size);

    return result;
}

/**
 * Detecta clusters via componentes conectados + densidade de arestas.
 *
 * @param {ReturnType<typeof buildGraph>} graph
 * @returns {Array<{ id: string, nodes: Array<string>, nodeCount: number, edgeCount: number, density: number }>}
 */
export function detectClusters(graph: ReturnType<typeof buildGraph>): Array<{ id: string, nodes: Array<string>, nodeCount: number, edgeCount: number, density: number }> {
    if (!graph?.nodes) return [];
    const components = connectedComponents(graph);
    const clusters = [];

    for (let i = 0; i < components.length; i++) {
        const comp = components[i]!;
        const nodeList = Array.from(comp);
        let edgeCount = 0;
        for (const id of comp) {
            const outAdj = graph.outAdj.get(id) || [];
            for (const { target } of outAdj) {
                if (comp.has(target)) edgeCount++;
            }
        }
        const n = nodeList.length;
        const maxEdges = n * (n - 1);
        const density = maxEdges > 0 ? +(edgeCount / maxEdges).toFixed(4) : 0;
        clusters.push({
            id: `cluster-${i + 1}`,
            nodes: nodeList,
            nodeCount: n,
            edgeCount,
            density,
        });
    }

    return clusters;
}
