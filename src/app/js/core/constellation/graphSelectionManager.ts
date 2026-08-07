// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * graphSelectionManager.js
 * CONSTELLATION_METRIC_SIZING Phase 1.65 - Graph Selection Manager
 *
 * Pure-logic selection state for graph nodes and edges.
 * No browser/DOM/Three.js/Promise/setTimeout dependencies.
 *
 * @module graphSelectionManager
 */

export const SELECTION_MANAGER_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.65',
    deliveredAt: '2026-05-02',
});

/** @type {ReadonlyArray<string>} */
export const SELECTION_MODES = Object.freeze(['single', 'multi', 'range']);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Creates a frozen selection snapshot.
 * @param {string[]} nodeIds
 * @param {string[]} edgeIds
 * @param {string} mode
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
function _freeze(nodeIds: string[], edgeIds: string[], mode: string): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    return (Object.freeze({ nodeIds: Object.freeze([...nodeIds]), edgeIds: Object.freeze([...edgeIds]), mode, }) as any);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an empty frozen selection with mode 'single'.
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function createSelection() {
    return _freeze([], [], 'single');
}

/**
 * Selects a node according to the given mode.
 * - 'single': replaces nodeIds with [nodeId]
 * - 'multi': toggles nodeId (adds if absent, removes if present)
 * - 'range': appends nodeId if not already selected
 *
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {string} nodeId
 * @param {'single'|'multi'|'range'} [mode='single']
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function selectNode(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, nodeId: string, mode: 'single'|'multi'|'range' = 'single'): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection || nodeId == null) return selection;
    const ids = Array.isArray(selection.nodeIds) ? [...selection.nodeIds] : [];
    const idx = ids.indexOf(nodeId);

    let next;
    if (mode === 'single') {
        next = [nodeId];
    } else if (mode === 'multi') {
        next = idx >= 0 ? ids.filter((id) => id !== nodeId) : [...ids, nodeId];
    } else {
        // range - append if absent
        next = idx >= 0 ? ids : [...ids, nodeId];
    }
    return _freeze(next, Array.isArray(selection.edgeIds) ? selection.edgeIds : [], mode);
}

/**
 * Selects an edge according to the given mode.
 * - 'single': replaces edgeIds with [edgeId]
 * - 'multi': toggles edgeId
 * - 'range': appends edgeId if absent
 *
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {string} edgeId
 * @param {'single'|'multi'|'range'} [mode='single']
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function selectEdge(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, edgeId: string, mode: 'single'|'multi'|'range' = 'single'): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection || edgeId == null) return selection;
    const ids = Array.isArray(selection.edgeIds) ? [...selection.edgeIds] : [];
    const idx = ids.indexOf(edgeId);

    let next;
    if (mode === 'single') {
        next = [edgeId];
    } else if (mode === 'multi') {
        next = idx >= 0 ? ids.filter((id) => id !== edgeId) : [...ids, edgeId];
    } else {
        next = idx >= 0 ? ids : [...ids, edgeId];
    }
    return _freeze(Array.isArray(selection.nodeIds) ? selection.nodeIds : [], next, mode);
}

/**
 * Removes a node from the selection.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {string} nodeId
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function deselectNode(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, nodeId: string): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection) return selection;
    const nodeIds = Array.isArray(selection.nodeIds) ? selection.nodeIds.filter((id) => id !== nodeId) : [];
    return _freeze(nodeIds, Array.isArray(selection.edgeIds) ? selection.edgeIds : [], selection.mode || 'single');
}

/**
 * Removes an edge from the selection.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {string} edgeId
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function deselectEdge(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, edgeId: string): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection) return selection;
    const edgeIds = Array.isArray(selection.edgeIds) ? selection.edgeIds.filter((id) => id !== edgeId) : [];
    return _freeze(Array.isArray(selection.nodeIds) ? selection.nodeIds : [], edgeIds, selection.mode || 'single');
}

/**
 * Clears all selected nodes and edges, preserving the current mode.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function clearSelection(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection) return createSelection();
    return _freeze([], [], selection.mode || 'single');
}

/**
 * Selects all nodes and edges from the given graph.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {{nodes: Array<{id:string}>, edges: Array<{id:string}>}} graph
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function selectAll(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, graph: {nodes: Array<{id:string}>, edges: Array<{id:string}>}): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection || !graph) return selection || createSelection();
    const nodeIds = Array.isArray(graph.nodes) ? graph.nodes.map((n) => n.id) : [];
    const edgeIds = Array.isArray(graph.edges) ? graph.edges.map((e) => e.id) : [];
    return _freeze(nodeIds, edgeIds, selection.mode || 'single');
}

/**
 * Inverts the selection: selects unselected items and deselects selected ones.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {{nodes: Array<{id:string}>, edges: Array<{id:string}>}} graph
 * @returns {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>}
 */
export function invertSelection(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, graph: {nodes: Array<{id:string}>, edges: Array<{id:string}>}): Readonly<{nodeIds: string[], edgeIds: string[], mode: string}> {
    if (!selection || !graph) return selection || createSelection();
    const selectedNodes = new Set(Array.isArray(selection.nodeIds) ? selection.nodeIds : []);
    const selectedEdges = new Set(Array.isArray(selection.edgeIds) ? selection.edgeIds : []);

    const nodeIds = Array.isArray(graph.nodes)
        ? graph.nodes.filter((n) => !selectedNodes.has(n.id)).map((n) => n.id)
        : [];
    const edgeIds = Array.isArray(graph.edges)
        ? graph.edges.filter((e) => !selectedEdges.has(e.id)).map((e) => e.id)
        : [];
    return _freeze(nodeIds, edgeIds, selection.mode || 'single');
}

/**
 * Returns true if the given nodeId is currently selected.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {string} nodeId
 * @returns {boolean}
 */
export function isNodeSelected(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, nodeId: string): boolean {
    if (!selection || !Array.isArray(selection.nodeIds)) return false;
    return selection.nodeIds.includes(nodeId);
}

/**
 * Returns true if the given edgeId is currently selected.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {string} edgeId
 * @returns {boolean}
 */
export function isEdgeSelected(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, edgeId: string): boolean {
    if (!selection || !Array.isArray(selection.edgeIds)) return false;
    return selection.edgeIds.includes(edgeId);
}

/**
 * Returns a subgraph containing only the selected nodes and edges.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @param {{nodes: Array<{id:string}>, edges: Array<{id:string}>}} graph
 * @returns {Readonly<{nodes: Array<{id:string}>, edges: Array<{id:string}>}>}
 */
export function getSelectedSubgraph(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>, graph: {nodes: Array<{id:string}>, edges: Array<{id:string}>}): Readonly<{nodes: Array<{id:string}>, edges: Array<{id:string}>}> {
    if (!selection || !graph) {
        return (Object.freeze({ nodes: Object.freeze([]), edges: Object.freeze([]) }) as any);
    }
    const selectedNodes = new Set(Array.isArray(selection.nodeIds) ? selection.nodeIds : []);
    const selectedEdges = new Set(Array.isArray(selection.edgeIds) ? selection.edgeIds : []);

    const nodes = Array.isArray(graph.nodes) ? graph.nodes.filter((n) => selectedNodes.has(n.id)) : [];
    const edges = Array.isArray(graph.edges) ? graph.edges.filter((e) => selectedEdges.has(e.id)) : [];
    return (Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges) }) as any);
}

/**
 * Summarizes the current selection state.
 * @param {Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>} selection
 * @returns {Readonly<{nodeCount: number, edgeCount: number, mode: string, isEmpty: boolean}>}
 */
export function summarizeSelection(selection: Readonly<{nodeIds: string[], edgeIds: string[], mode: string}>): Readonly<{nodeCount: number, edgeCount: number, mode: string, isEmpty: boolean}> {
    if (!selection) {
        return Object.freeze({ nodeCount: 0, edgeCount: 0, mode: 'single', isEmpty: true });
    }
    const nodeCount = Array.isArray(selection.nodeIds) ? selection.nodeIds.length : 0;
    const edgeCount = Array.isArray(selection.edgeIds) ? selection.edgeIds.length : 0;
    return Object.freeze({
        nodeCount,
        edgeCount,
        mode: selection.mode || 'single',
        isEmpty: nodeCount === 0 && edgeCount === 0,
    });
}

// ---------------------------------------------------------------------------
// Module manifest
// ---------------------------------------------------------------------------

export const graphSelectionManagerMeta = Object.freeze({
    exports: [
        'SELECTION_MANAGER_META',
        'SELECTION_MODES',
        'createSelection',
        'selectNode',
        'selectEdge',
        'deselectNode',
        'deselectEdge',
        'clearSelection',
        'selectAll',
        'invertSelection',
        'isNodeSelected',
        'isEdgeSelected',
        'getSelectedSubgraph',
        'summarizeSelection',
        'graphSelectionManagerMeta',
    ],
    provenance: {
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    },
});
