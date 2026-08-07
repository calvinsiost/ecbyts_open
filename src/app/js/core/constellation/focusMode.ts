// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Focus Mode / Hover Emphasis - Phase 1.29 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S29
 *
 * Phase 1.29 (2026-05-01) - pure-logic focus/emphasis para hover em
 * nodes. Computa quais nodes devem ser destacados, dimmed, ou hidden
 * baseado em proximity (1-hop / N-hop neighbors) e relacionamentos.
 *
 * Estratégia:
 *   - 5 emphasis levels: focused/related/neighbor/dimmed/hidden
 *   - computeFocusState: target node + graph → emphasis map
 *   - expandNeighborhood: BFS N-hop com edges
 *   - computeOpacityMap: emphasis → alpha (0-1)
 *   - filterFocusedSubgraph: extrai sub-grafo só com focused/related
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Emphasis levels canônicos. */
export const EMPHASIS_LEVELS = Object.freeze(['focused', 'related', 'neighbor', 'dimmed', 'hidden']);

/** Default opacity map por level. */
export const DEFAULT_OPACITY = Object.freeze({
    focused: 1.0,
    related: 0.85,
    neighbor: 0.6,
    dimmed: 0.2,
    hidden: 0.0,
});

/** Identidade do módulo. */
export const FOCUS_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.29',
    deliveredAt: '2026-05-01',
    levels: EMPHASIS_LEVELS,
});

/**
 * Verifica se level é canônico.
 */
export function isValidLevel( l: any) {
    return typeof l === 'string' && EMPHASIS_LEVELS.includes(l);
}

/**
 * Constrói adjacência node → list de neighborIds a partir de edges.
 *
 * @param {Array<{source: any, target: any}>} edges
 * @returns {Object<string, Array<string>>}
 */
export function buildAdjacency(edges: Array<{source: any, target: any}>): Record<string, Array<string>> {
    if (!Array.isArray(edges)) return {};
    const adj = new Map<any, Set<any>>();
    const ensure = ( id: any) => {
        if (!adj.has(id)) adj.set(id, new Set());
        return adj.get(id) as Set<any>;
    };
    for (const e of edges) {
        if (!e || !e.source || !e.target) continue;
        ensure(e.source).add(e.target);
        ensure(e.target).add(e.source);
    }
    const out: Record<string, any> = {};
    for (const [k, neighbors] of adj.entries()) out[k] = Object.freeze([...neighbors]);
    return Object.freeze(out);
}

/**
 * BFS N-hop neighborhood expansion a partir de targetId.
 *
 * @param {string} targetId
 * @param {Object<string, Array<string>>} adjacency
 * @param {number} Array<string>>
 * @returns {Object<string, number>} nodeId → hop distance (0=self, 1=direct, ...)
 */
export function expandNeighborhood(targetId: string, adjacency: Record<string, Array<string>>, maxHops: number = 2): Record<string, number> {
    if (typeof targetId !== 'string' || !adjacency) return {};
    const max = Number.isInteger(maxHops) && maxHops >= 0 ? maxHops : 2;
    const dist: Record<string, number> = { [targetId]: 0 };
    const queue: string[] = [targetId];
    let head = 0;
    while (head < queue.length) {
        const node = queue[head++] as string;
        const d = dist[node] as number;
        if (d >= max) continue;
        const neighbors = adjacency[node] || [];
        for (const n of neighbors) {
            if (dist[n] === undefined) {
                dist[n] = d + 1;
                queue.push(n);
            }
        }
    }
    return Object.freeze(dist);
}

/**
 * Mapeia hop distance → emphasis level.
 */
export function hopToLevel( hop: any) {
    if (hop === 0) return 'focused';
    if (hop === 1) return 'related';
    if (hop === 2) return 'neighbor';
    return 'dimmed';
}

/**
 * Computa focus state para todos nodes do grafo.
 *
 * @param {string} targetId
 * @param {Array<{id: any}>} nodes
 * @param {Array<{source: any, target: any}>} edges
 * @param {any} [options]
 * @returns {Object<string, string>} nodeId → emphasis level
 */
export function computeFocusState(targetId: string, nodes: Array<{id: any}>, edges: Array<{source: any, target: any}>, options: any = {}): Record<string, string> {
    if (typeof targetId !== 'string' || !Array.isArray(nodes)) return {};
    const maxHops = Number.isInteger(options.maxHops) ? options.maxHops : 2;
    const hideUnrelated = !!options.hideUnrelated;
    const adjacency = buildAdjacency(edges || []);
    const distances = expandNeighborhood(targetId, adjacency, maxHops);
    const out: Record<string, any> = {};
    for (const n of nodes) {
        if (!n || !n.id) continue;
        if (distances[n.id] !== undefined) {
            out[n.id] = hopToLevel(distances[n.id]);
        } else {
            out[n.id] = hideUnrelated ? 'hidden' : 'dimmed';
        }
    }
    return Object.freeze(out);
}

/**
 * Mapeia focus state → opacity map.
 *
 * @param {Object<string, string>} focusState
 * @param {Object<string, number>} [opacityMap=DEFAULT_OPACITY]
 * @returns {Object<string, number>} nodeId → alpha
 */
export function computeOpacityMap(focusState: Record<string, string>, opacityMap: Record<string, number> = (DEFAULT_OPACITY as Record<string, number>)): Record<string, number> {
    if (!focusState || typeof focusState !== 'object') return {};
    const out: Record<string, number> = {};
    const map = (opacityMap as Record<string, number>);
    for (const [id, level] of Object.entries(focusState)) {
        const alpha = map[(level as string)];
        out[id] = Number.isFinite(alpha) ? (alpha as number) : 0;
    }
    return Object.freeze(out);
}

/**
 * Filtra edges que conectam nodes focused/related.
 *
 * @param {Array<{source: any, target: any}>} edges
 * @param {Object<string, string>} focusState
 * @returns {Array<any>} edges com emphasis level
 */
export function computeEdgeEmphasis(edges: Array<{source: any, target: any}>, focusState: Record<string, string>): Array<any> {
    if (!Array.isArray(edges) || !focusState) return [];
    const out: any[] = [];
    for (const e of edges) {
        if (!e || !e.source || !e.target) continue;
        const sLevel = focusState[e.source] || 'dimmed';
        const tLevel = focusState[e.target] || 'dimmed';
        // Edge level = max emphasis (lower = mais visível)
        const idx = ( lvl: any) => EMPHASIS_LEVELS.indexOf( (lvl as any));
        const edgeLevel = idx(sLevel) <= idx(tLevel) ? sLevel : tLevel;
        out.push(Object.freeze({ ...e, emphasis: edgeLevel }));
    }
    return (Object.freeze(out) as any);
}

/**
 * Extrai sub-grafo só com nodes focused/related.
 *
 * @param {Array<any>} nodes
 * @param {Array<any>} edges
 * @param {Object<string, string>} focusState
 * @returns {{nodes: any, edges: any}}
 */
export function filterFocusedSubgraph(nodes: Array<any>, edges: Array<any>, focusState: Record<string, string>): {nodes: any, edges: any} {
    if (!Array.isArray(nodes) || !focusState) {
        return Object.freeze({ nodes: Object.freeze([]), edges: Object.freeze([]) });
    }
    const keep = new Set<string>();
    for (const [id, level] of Object.entries(focusState)) {
        if (level === 'focused' || level === 'related' || level === 'neighbor') keep.add(id);
    }
    const filteredNodes = nodes.filter(( n: any) => n && keep.has(n.id));
    const filteredEdges = Array.isArray(edges)
        ? edges.filter(( e: any) => e && keep.has(e.source) && keep.has(e.target))
        : [];
    return Object.freeze({
        nodes: Object.freeze([...filteredNodes]),
        edges: Object.freeze([...filteredEdges]),
    });
}

/**
 * Limpa focus state (todos nodes em 'normal' fictício = full opacity, sem dim).
 */
export function clearFocus( nodes: any) {
    if (!Array.isArray(nodes)) return {};
    const out: Record<string, string> = {};
    for (const n of nodes) {
        if (!n || !n.id) continue;
        out[n.id] = 'focused';
    }
    return Object.freeze(out);
}

/**
 * Sumariza focus state.
 */
export function summarizeFocus( focusState: any) {
    const empty = { total: 0, byLevel: {}, focusedCount: 0, dimmedCount: 0 };
    if (!focusState || typeof focusState !== 'object') return empty;
    const byLevel: Record<string, number> = {};
    for (const level of Object.values(focusState)) {
        const k = (level as string);
        byLevel[k] = (byLevel[k] || 0) + 1;
    }
    return Object.freeze({
        total: Object.keys(focusState).length,
        byLevel,
        focusedCount: byLevel.focused || 0,
        dimmedCount: byLevel.dimmed || 0,
    });
}

/**
 * Module identity export.
 */
export const focusModeMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.29',
    deliveredAt: '2026-05-01',
    levels: EMPHASIS_LEVELS,
    exports: [
        'EMPHASIS_LEVELS',
        'DEFAULT_OPACITY',
        'FOCUS_META',
        'isValidLevel',
        'buildAdjacency',
        'expandNeighborhood',
        'hopToLevel',
        'computeFocusState',
        'computeOpacityMap',
        'computeEdgeEmphasis',
        'filterFocusedSubgraph',
        'clearFocus',
        'summarizeFocus',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
