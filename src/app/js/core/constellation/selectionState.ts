// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Selection State - Phase 1.52 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S52
 *
 * Phase 1.52 (2026-05-02) - pure-logic selection state machine: nodes,
 * edges, multi-select, range, invert, history undo/redo.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const SELECTION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.52',
    deliveredAt: '2026-05-02',
});

/** Default config. */
export const DEFAULT_CONFIG = Object.freeze({
    historyLimit: 20,
});

/**
 * @typedef {Object} SelectionSnapshot
 * @property {ReadonlyArray<string>} nodes
 * @property {ReadonlyArray<string>} edges
 */
interface SelectionSnapshot {
    nodes: ReadonlyArray<string>;
    edges: ReadonlyArray<string>;
}

/**
 * @typedef {Object} SelectionState
 * @property {ReadonlyArray<string>} nodes
 * @property {ReadonlyArray<string>} edges
 * @property {ReadonlyArray<SelectionSnapshot>} history
 * @property {ReadonlyArray<SelectionSnapshot>} future
 * @property {number} historyLimit
 */
interface SelectionState {
    nodes: ReadonlyArray<string>;
    edges: ReadonlyArray<string>;
    history: ReadonlyArray<SelectionSnapshot>;
    future: ReadonlyArray<SelectionSnapshot>;
    historyLimit: number;
}

/**
 * Cria selection state inicial.
 *
 * @param {{historyLimit?: number}} [config]
 * @returns {SelectionState}
 */
export function createSelection(config: {historyLimit?: number} = {}): SelectionState {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return Object.freeze({
        nodes: Object.freeze(([] as string[])),
        edges: Object.freeze(([] as string[])),
        history: Object.freeze(([] as SelectionSnapshot[])),
        future: Object.freeze(([] as SelectionSnapshot[])),
        historyLimit:
            Number.isInteger(cfg.historyLimit) && cfg.historyLimit > 0 ? cfg.historyLimit : DEFAULT_CONFIG.historyLimit,
    });
}

/**
 * @param {SelectionState} sel
 * @returns {SelectionSnapshot}
 */
function snapshot(sel: SelectionState): SelectionSnapshot {
    return Object.freeze({ nodes: sel.nodes, edges: sel.edges });
}

/**
 * @param {SelectionState} sel
 * @returns {ReadonlyArray<SelectionSnapshot>}
 */
function pushHistory(sel: SelectionState): ReadonlyArray<SelectionSnapshot> {
    const history = [...sel.history, snapshot(sel)];
    if (history.length > sel.historyLimit) history.shift();
    return Object.freeze(history);
}

/**
 * Seleciona node (replace ou add).
 *
 * @param {SelectionState} sel
 * @param {string} id
 * @param {{additive?: boolean}} [options]
 * @returns {SelectionState}
 */
export function selectNode(sel: SelectionState, id: string, options: {additive?: boolean} = {}): SelectionState {
    if (!sel || typeof id !== 'string') return sel;
    const additive = !!options.additive;
    if (!additive && sel.nodes.length === 1 && sel.nodes[0] === id && sel.edges.length === 0) {
        return sel; // noop
    }
    const newNodes = additive
        ? sel.nodes.includes(id)
            ? sel.nodes
            : Object.freeze([...sel.nodes, id])
        : Object.freeze([id]);
    return Object.freeze({
        ...sel,
        nodes: newNodes,
        edges: additive ? sel.edges : Object.freeze([]),
        history: pushHistory(sel),
        future: Object.freeze([]),
    });
}

/**
 * Seleciona múltiplos nodes.
 *
 * @param {SelectionState} sel
 * @param {ReadonlyArray<unknown>} ids
 * @param {{additive?: boolean}} [options]
 * @returns {SelectionState}
 */
export function selectNodes(sel: SelectionState, ids: ReadonlyArray<unknown>, options: {additive?: boolean} = {}): SelectionState {
    if (!sel || !Array.isArray(ids)) return sel;
    const valid = (ids.filter( /** @param {unknown} id */ (id) => typeof id === 'string', ) as string[]);
    const additive = !!options.additive;
        let newNodes: ReadonlyArray<string>;
    if (additive) {
        const set = new Set(sel.nodes);
        for (const id of valid) set.add(id);
        newNodes = Object.freeze(Array.from(set));
    } else {
        newNodes = Object.freeze(Array.from(new Set(valid)));
    }
    return Object.freeze({
        ...sel,
        nodes: newNodes,
        edges: additive ? sel.edges : Object.freeze([]),
        history: pushHistory(sel),
        future: Object.freeze([]),
    });
}

/**
 * Seleciona edge.
 *
 * @param {SelectionState} sel
 * @param {string} id
 * @param {{additive?: boolean}} [options]
 * @returns {SelectionState}
 */
export function selectEdge(sel: SelectionState, id: string, options: {additive?: boolean} = {}): SelectionState {
    if (!sel || typeof id !== 'string') return sel;
    const additive = !!options.additive;
    const newEdges = additive
        ? sel.edges.includes(id)
            ? sel.edges
            : Object.freeze([...sel.edges, id])
        : Object.freeze([id]);
    return Object.freeze({
        ...sel,
        edges: newEdges,
        nodes: additive ? sel.nodes : Object.freeze([]),
        history: pushHistory(sel),
        future: Object.freeze([]),
    });
}

/**
 * Deseleciona node.
 *
 * @param {SelectionState} sel
 * @param {string} id
 * @returns {SelectionState}
 */
export function deselectNode(sel: SelectionState, id: string): SelectionState {
    if (!sel || typeof id !== 'string') return sel;
    if (!sel.nodes.includes(id)) return sel;
    return Object.freeze({
        ...sel,
        nodes: Object.freeze(
            sel.nodes.filter(
                /** @param {string} id */
                (n) => n !== id,
            ),
        ),
        history: pushHistory(sel),
        future: Object.freeze(([] as SelectionSnapshot[])),
    });
}

/**
 * Toggle node selection.
 *
 * @param {SelectionState} id
 * @param {string} id
 * @returns {SelectionState}
 */
export function toggleNode(sel: SelectionState, id: string): SelectionState {
    if (!sel || typeof id !== 'string') return sel;
    if (sel.nodes.includes(id)) return deselectNode(sel, id);
    return selectNode(sel, id, { additive: true });
}

/**
 * Limpa selection.
 *
 * @param {SelectionState} sel
 * @returns {SelectionState}
 */
export function clearSelection(sel: SelectionState): SelectionState {
    if (!sel) return sel;
    if (sel.nodes.length === 0 && sel.edges.length === 0) return sel;
    return Object.freeze({
        ...sel,
        nodes: Object.freeze(([] as string[])),
        edges: Object.freeze(([] as string[])),
        history: pushHistory(sel),
        future: Object.freeze(([] as SelectionSnapshot[])),
    });
}

/**
 * Inverte selection (dado universo total de ids).
 *
 * @param {SelectionState} sel
 * @param {ReadonlyArray<unknown>} allNodeIds
 * @returns {SelectionState}
 */
export function invertSelection(sel: SelectionState, allNodeIds: ReadonlyArray<unknown>): SelectionState {
    if (!sel || !Array.isArray(allNodeIds)) return sel;
    const set = new Set(sel.nodes);
    const inverted = (allNodeIds.filter( /** @param {unknown} sel */ (id) => typeof id === 'string' && !set.has(id), ) as string[]);
    return Object.freeze({
        ...sel,
        nodes: Object.freeze(inverted),
        edges: Object.freeze(([] as string[])),
        history: pushHistory(sel),
        future: Object.freeze(([] as SelectionSnapshot[])),
    });
}

/**
 * Undo último change.
 *
 * @param {SelectionState} sel
 * @returns {SelectionState}
 */
export function undo(sel: SelectionState): SelectionState {
    if (!sel || sel.history.length === 0) return sel;
    const prev = sel.history[sel.history.length - 1]!;
    const newHistory = sel.history.slice(0, -1);
    const future = [snapshot(sel), ...sel.future];
    return Object.freeze({
        ...sel,
        nodes: prev.nodes,
        edges: prev.edges,
        history: Object.freeze(newHistory),
        future: Object.freeze(future),
    });
}

/**
 * Redo último undo.
 *
 * @param {SelectionState} sel
 * @returns {SelectionState}
 */
export function redo(sel: SelectionState): SelectionState {
    if (!sel || sel.future.length === 0) return sel;
    const next = sel.future[0]!;
    return Object.freeze({
        ...sel,
        nodes: next.nodes,
        edges: next.edges,
        history: Object.freeze([...sel.history, snapshot(sel)]),
        future: Object.freeze(sel.future.slice(1)),
    });
}

/**
 * Sumariza selection.
 *
 * @param {SelectionState | null | undefined} sel
 * @returns {{nodeCount: number, edgeCount: number, total: number, canUndo: boolean, canRedo: boolean}}
 */
export function summarizeSelection(sel: SelectionState | null | undefined): {nodeCount: number, edgeCount: number, total: number, canUndo: boolean, canRedo: boolean} {
    const empty = { nodeCount: 0, edgeCount: 0, total: 0, canUndo: false, canRedo: false };
    if (!sel) return empty;
    return Object.freeze({
        nodeCount: sel.nodes.length,
        edgeCount: sel.edges.length,
        total: sel.nodes.length + sel.edges.length,
        canUndo: sel.history.length > 0,
        canRedo: sel.future.length > 0,
    });
}

/**
 * Module identity export.
 */
export const selectionStateMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.52',
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'SELECTION_META',
        'createSelection',
        'selectNode',
        'selectNodes',
        'selectEdge',
        'deselectNode',
        'toggleNode',
        'clearSelection',
        'invertSelection',
        'undo',
        'redo',
        'summarizeSelection',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
