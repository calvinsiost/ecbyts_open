// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Tree View State - pure-logic, zero DOM
// UX-88: file/folder hierarchy state for explorer-style panels.
// Modelo imutavel: cada operacao retorna estado novo congelado.

const VALID_TYPES = new Set(['folder', 'file', 'group', 'item']);
const VALID_SORT = new Set(['natural', 'alpha', 'date', 'type']);
const VALID_SELECT_MODES = new Set(['single', 'add', 'range']);

/**
 * Freeze profundo do estado.
 * @param {any} state
 */
function freezeState(state: any) {
    return Object.freeze({
        nodes: state.nodes,
        expandedIds: state.expandedIds,
        selectedIds: state.selectedIds,
        focusedId: state.focusedId,
        sortMode: state.sortMode,
    });
}

function validateNode(node: any) {
    if (!node || typeof node !== 'object') throw new Error('node must be an object');
    if (typeof node.id !== 'string' || node.id.length === 0) throw new Error('node.id must be non-empty string');
    if (typeof node.label !== 'string') throw new Error('node.label must be string');
    if (!VALID_TYPES.has(node.type)) throw new Error(`invalid node.type: ${node.type}`);
    if (typeof node.hasChildren !== 'boolean') throw new Error('node.hasChildren must be boolean');
}

/**
 * Cria estado de tree view.
 * @param {Array<any>} initialNodes
 */
export function createTreeView(initialNodes: Array<any> = []) {
    const nodes = new Map();
    for (const n of initialNodes) {
        validateNode(n);
        if (nodes.has(n.id)) throw new Error(`duplicate node id: ${n.id}`);
        nodes.set(n.id, Object.freeze({ ...n }));
    }
    // Validar parent refs e ciclos
    for (const n of nodes.values()) {
        if (n.parentId !== undefined && n.parentId !== null) {
            if (!nodes.has(n.parentId)) throw new Error(`parent not found: ${n.parentId} for node ${n.id}`);
        }
    }
    detectCyclesOrThrow(nodes);
    return freezeState({
        nodes,
        expandedIds: new Set(),
        selectedIds: new Set(),
        focusedId: null,
        sortMode: 'natural',
    });
}

function detectCyclesOrThrow(nodesMap: any) {
    for (const startId of nodesMap.keys()) {
        const seen = new Set();
        let cur = nodesMap.get(startId);
        while (cur && cur.parentId !== undefined && cur.parentId !== null) {
            if (seen.has(cur.id)) throw new Error(`cycle detected at ${cur.id}`);
            seen.add(cur.id);
            const next = nodesMap.get(cur.parentId);
            if (!next) break;
            if (next.id === startId) throw new Error(`cycle detected at ${startId}`);
            cur = next;
        }
    }
}

/**
 * Adiciona node. Throw se id duplicado ou parent inexistente.
 */
export function addNode(state: any, node: any) {
    validateNode(node);
    if (state.nodes.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
    if (node.parentId !== undefined && node.parentId !== null && !state.nodes.has(node.parentId)) {
        throw new Error(`parent not found: ${node.parentId}`);
    }
    const nodes = new Map(state.nodes);
    nodes.set(node.id, Object.freeze({ ...node }));
    detectCyclesOrThrow(nodes);
    return freezeState({ ...state, nodes });
}

/**
 * Remove node + descendants em cascata.
 */
export function removeNode(state: any, nodeId: any) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    const toRemove = new Set([nodeId]);
    const desc = collectDescendants(state.nodes, nodeId);
    for (const d of desc) toRemove.add(d);
    const nodes = new Map();
    for (const [id, n] of state.nodes) {
        if (!toRemove.has(id)) nodes.set(id, n);
    }
    const expandedIds = new Set([...state.expandedIds].filter((id) => !toRemove.has(id)));
    const selectedIds = new Set([...state.selectedIds].filter((id) => !toRemove.has(id)));
    const focusedId = toRemove.has(state.focusedId) ? null : state.focusedId;
    return freezeState({ ...state, nodes, expandedIds, selectedIds, focusedId });
}

function collectDescendants(nodesMap: any, parentId: any) {
    const result = [];
    const stack = [parentId];
    while (stack.length) {
        const cur = stack.pop();
        for (const n of nodesMap.values()) {
            if (n.parentId === cur) {
                result.push(n.id);
                stack.push(n.id);
            }
        }
    }
    return result;
}

export function expandNode(state: any, nodeId: any) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    if (state.expandedIds.has(nodeId)) return state;
    const expandedIds = new Set(state.expandedIds);
    expandedIds.add(nodeId);
    return freezeState({ ...state, expandedIds });
}

export function collapseNode(state: any, nodeId: any) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    if (!state.expandedIds.has(nodeId)) return state;
    const expandedIds = new Set(state.expandedIds);
    expandedIds.delete(nodeId);
    return freezeState({ ...state, expandedIds });
}

export function toggleNode(state: any, nodeId: any) {
    return state.expandedIds.has(nodeId) ? collapseNode(state, nodeId) : expandNode(state, nodeId);
}

export function expandAll(state: any) {
    const expandedIds = new Set();
    for (const n of state.nodes.values()) {
        if (n.hasChildren || hasChildrenInTree(state.nodes, n.id)) expandedIds.add(n.id);
    }
    return freezeState({ ...state, expandedIds });
}

function hasChildrenInTree(nodesMap: any, parentId: any) {
    for (const n of nodesMap.values()) {
        if (n.parentId === parentId) return true;
    }
    return false;
}

export function collapseAll(state: any) {
    return freezeState({ ...state, expandedIds: new Set() });
}

/**
 * Expande ancestors do node ate root.
 */
export function expandToNode(state: any, nodeId: any) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    const expandedIds = new Set(state.expandedIds);
    let cur = state.nodes.get(nodeId);
    while (cur && cur.parentId !== undefined && cur.parentId !== null) {
        expandedIds.add(cur.parentId);
        cur = state.nodes.get(cur.parentId);
    }
    return freezeState({ ...state, expandedIds });
}

export function selectNode(state: any, nodeId: any, opts: any = {}) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    const mode = opts.mode || 'single';
    if (!VALID_SELECT_MODES.has(mode)) throw new Error(`invalid select mode: ${mode}`);
    let selectedIds;
    if (mode === 'single') {
        selectedIds = new Set([nodeId]);
    } else if (mode === 'add') {
        selectedIds = new Set(state.selectedIds);
        if (selectedIds.has(nodeId)) selectedIds.delete(nodeId);
        else selectedIds.add(nodeId);
    } else {
        // range - selecionar entre focusedId e nodeId no flatten visivel
        selectedIds = new Set(state.selectedIds);
        const visible = getVisibleNodes(state).map((v: any) => v.node.id);
        const anchor = state.focusedId && visible.includes(state.focusedId) ? state.focusedId : nodeId;
        const aIdx = visible.indexOf(anchor);
        const bIdx = visible.indexOf(nodeId);
        if (aIdx >= 0 && bIdx >= 0) {
            const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
            for (let i = lo; i <= hi; i++) selectedIds.add(visible[i]);
        } else {
            selectedIds.add(nodeId);
        }
    }
    return freezeState({ ...state, selectedIds });
}

export function setFocus(state: any, nodeId: any) {
    if (nodeId !== null && !state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    return freezeState({ ...state, focusedId: nodeId });
}

export function getRootNodes(state: any) {
    const result = [];
    for (const n of state.nodes.values()) {
        if (n.parentId === undefined || n.parentId === null) result.push(n);
    }
    return sortNodes(result, state.sortMode);
}

export function getChildren(state: any, parentId: any) {
    const result = [];
    for (const n of state.nodes.values()) {
        if (n.parentId === parentId) result.push(n);
    }
    return sortNodes(result, state.sortMode);
}

export function getAncestors(state: any, nodeId: any) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    const out = [];
    let cur = state.nodes.get(nodeId);
    while (cur && cur.parentId !== undefined && cur.parentId !== null) {
        const parent = state.nodes.get(cur.parentId);
        if (!parent) break;
        out.unshift(parent);
        cur = parent;
    }
    return out;
}

export function getDescendants(state: any, nodeId: any) {
    if (!state.nodes.has(nodeId)) throw new Error(`node not found: ${nodeId}`);
    return collectDescendants(state.nodes, nodeId).map((id) => state.nodes.get(id));
}

/**
 * Flatten respeitando expanded. Retorna [{node, depth, isLast, isExpanded}].
 */
export function getVisibleNodes(state: any) {
    const result: any[] = [];
    function walk(parentId: any, depth: any) {
        const children = getChildrenInternal(state, parentId);
        children.forEach((n: any, idx: any) => {
            const isLast = idx === children.length - 1;
            const isExpanded = state.expandedIds.has(n.id);
            result.push({ node: n, depth, isLast, isExpanded });
            if (isExpanded) walk(n.id, depth + 1);
        });
    }
    walk(null, 0);
    return result;
}

function getChildrenInternal(state: any, parentId: any) {
    const out = [];
    for (const n of state.nodes.values()) {
        const p = n.parentId === undefined ? null : n.parentId;
        if (p === parentId) out.push(n);
    }
    return sortNodes(out, state.sortMode);
}

function sortNodes(arr: any, mode: any) {
    const copy = arr.slice();
    if (mode === 'natural') return copy;
    if (mode === 'alpha')
        return copy.sort((a: any, b: any) =>
            a.label.localeCompare(b.label),
        );
    if (mode === 'type') {
        const order: Record<string, number> = { folder: 0, group: 1, file: 2, item: 3 };
        return copy.sort(
            (a: any, b: any) =>
                (order[a.type] as number) - (order[b.type] as number) || a.label.localeCompare(b.label),
        );
    }
    if (mode === 'date') {
        return copy.sort((a: any, b: any) => {
            const ad = (a.metadata && a.metadata.date) || 0;
            const bd = (b.metadata && b.metadata.date) || 0;
            return ad - bd;
        });
    }
    return copy;
}

export function setSortMode(state: any, mode: any) {
    if (!VALID_SORT.has(mode)) throw new Error(`invalid sort mode: ${mode}`);
    return freezeState({ ...state, sortMode: mode });
}

/**
 * Busca por label substring (case-insensitive). Retorna {matched, ancestors}.
 */
export function searchTree(state: any, queryStr: any) {
    const q = String(queryStr || '').toLowerCase();
    const matched = new Set();
    const ancestors = new Set();
    if (q.length === 0) return { matched, ancestors };
    for (const n of state.nodes.values()) {
        if (n.label.toLowerCase().includes(q)) {
            matched.add(n.id);
            let cur = n;
            while (cur && cur.parentId !== undefined && cur.parentId !== null) {
                ancestors.add(cur.parentId);
                cur = state.nodes.get(cur.parentId);
            }
        }
    }
    return { matched, ancestors };
}

export function summarizeTree(state: any) {
    let leafCount = 0;
    let depth = 0;
    for (const n of state.nodes.values()) {
        if (!hasChildrenInTree(state.nodes, n.id)) leafCount++;
        let d = 0;
        let cur = n;
        while (cur && cur.parentId !== undefined && cur.parentId !== null) {
            d++;
            cur = state.nodes.get(cur.parentId);
            if (d > 10000) break;
        }
        if (d > depth) depth = d;
    }
    return {
        totalNodes: state.nodes.size,
        expandedCount: state.expandedIds.size,
        selectedCount: state.selectedIds.size,
        leafCount,
        depth,
    };
}
