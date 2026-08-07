// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline DAG Validator - Phase 48 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S48
 *
 * Phase 48 (2026-05-02) - pure-logic validador de DAG: cycle detection
 * (Tarjan SCC), topological sort (Kahn), unreachable node detection,
 * fan-in / fan-out métricas.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const DAG_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 48,
    deliveredAt: '2026-05-02',
});

/**
 * Cria graph state from {nodes:[{id}], edges:[{from,to}]}.
 */
export function createGraph( spec: any) {
    if (!spec || typeof spec !== 'object') return null;
    const nodes = Array.isArray(spec.nodes) ? spec.nodes.filter(( n: any) => n && typeof n.id === 'string') : [];
    const edges = Array.isArray(spec.edges) ? spec.edges.filter(( e: any) => e && typeof e.from === 'string' && typeof e.to === 'string') : [];
    const ids = new Set(nodes.map(( n: any) => n.id));
    const validEdges = edges.filter(( e: any) => ids.has( (e as any).from) && ids.has( (e as any).to));
    return Object.freeze({
        nodes: Object.freeze(nodes.map(( n: any) => Object.freeze({ ...n }))),
        edges: Object.freeze(validEdges.map(( e: any) => Object.freeze({ ...e }))),
    });
}

/**
 * Build adjacency Map<id, Array<id>> (out edges).
 */
function buildAdj( graph: any) {
    const adj = new Map();
    if (!graph) return adj;
    for (const n of graph.nodes) adj.set(n.id, []);
    for (const e of graph.edges) {
        if (adj.has(e.from)) adj.get(e.from).push(e.to);
    }
    return adj;
}

/**
 * Detecta ciclo via DFS. Retorna {hasCycle, cycle: [ids]} (cycle pode estar vazio).
 */
export function detectCycle( graph: any) {
    if (!graph) return Object.freeze({ hasCycle: false, cycle: Object.freeze([]) });
    const adj = buildAdj(graph);
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    const parent = new Map();
    for (const n of graph.nodes) color.set(n.id, WHITE);
    let cycleStart = null;
    let cycleEnd = null;
    function dfs( u: any) {
        color.set(u, GRAY);
        for (const v of adj.get(u) || []) {
            if (color.get(v) === WHITE) {
                parent.set(v, u);
                if (dfs(v)) return true;
            } else if (color.get(v) === GRAY) {
                cycleEnd = u;
                cycleStart = v;
                return true;
            }
        }
        color.set(u, BLACK);
        return false;
    }
    for (const n of graph.nodes) {
        if (color.get(n.id) === WHITE) {
            if (dfs(n.id)) {
                const cycle = [cycleStart];
                let cur = cycleEnd;
                while (cur !== cycleStart && cur !== undefined) {
                    cycle.push(cur);
                    cur = parent.get(cur);
                }
                cycle.push(cycleStart);
                return Object.freeze({ hasCycle: true, cycle: Object.freeze(cycle.reverse()) });
            }
        }
    }
    return Object.freeze({ hasCycle: false, cycle: Object.freeze([]) });
}

/**
 * Topological sort (Kahn). Retorna {sorted, valid}. valid=false se ciclo.
 */
export function topoSort( graph: any) {
    if (!graph) return Object.freeze({ sorted: Object.freeze([]), valid: false });
    const adj = buildAdj(graph);
    const indeg = new Map();
    for (const n of graph.nodes) indeg.set(n.id, 0);
    for (const e of graph.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    const queue = [];
    for (const [id, d] of indeg.entries()) if (d === 0) queue.push(id);
    queue.sort(); // determinismo
    const sorted = [];
    while (queue.length > 0) {
        const u = queue.shift();
        sorted.push(u);
        for (const v of adj.get(u) || []) {
            const d = (indeg.get(v) || 0) - 1;
            indeg.set(v, d);
            if (d === 0) {
                queue.push(v);
                queue.sort();
            }
        }
    }
    return Object.freeze({
        sorted: Object.freeze(sorted),
        valid: sorted.length === graph.nodes.length,
    });
}

/**
 * Encontra nodes inalcançáveis a partir de roots (in-degree 0).
 */
export function findUnreachable( graph: any) {
    if (!graph) return Object.freeze([]);
    const indeg = new Map();
    for (const n of graph.nodes) indeg.set(n.id, 0);
    for (const e of graph.edges) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
    const roots = [...indeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
    const adj = buildAdj(graph);
    const visited = new Set();
    const stack = [...roots];
    while (stack.length > 0) {
        const u = stack.pop();
        if (visited.has(u)) continue;
        visited.add(u);
        for (const v of adj.get(u) || []) stack.push(v);
    }
    return Object.freeze(graph.nodes.filter(( n: any) => !visited.has( (n as any).id)).map(( n: any) => n.id));
}

/**
 * Compute fan-in/fan-out per node.
 */
export function computeFanInOut( graph: any) {
    if (!graph) return new Map();
    const m = new Map();
    for (const n of graph.nodes) m.set(n.id, { fanIn: 0, fanOut: 0 });
    for (const e of graph.edges) {
        if (m.has(e.from)) m.get(e.from).fanOut++;
        if (m.has(e.to)) m.get(e.to).fanIn++;
    }
    return m;
}

/**
 * Sumariza graph.
 */
export function summarizeDag( graph: any) {
    const empty = { nodes: 0, edges: 0, hasCycle: false, valid: false, unreachable: 0 };
    if (!graph) return empty;
    const cycle = detectCycle(graph);
    const topo = topoSort(graph);
    const unreach = findUnreachable(graph);
    return Object.freeze({
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        hasCycle: cycle.hasCycle,
        valid: topo.valid && !cycle.hasCycle,
        unreachable: unreach.length,
    });
}

/**
 * Module identity export.
 */
export const pipelineDagValidatorMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 48,
    deliveredAt: '2026-05-02',
    exports: [
        'DAG_META',
        'createGraph',
        'detectCycle',
        'topoSort',
        'findUnreachable',
        'computeFanInOut',
        'summarizeDag',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
