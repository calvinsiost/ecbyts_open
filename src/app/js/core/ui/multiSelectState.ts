// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Multi-Select State - UX-83
 * Pure-logic selection model for non-3D lists (checkbox lists, item lists with
 * select-all + indeterminate). Complementar a UX-28 selectionManager (3D).
 * Zero DOM. Imutável (frozen).
 */

function cloneSet(set: any) {
    return new Set(set);
}

function cloneGroups(groups: any) {
    const next = new Map();
    for (const [k, v] of groups) {
        next.set(k, Object.freeze([...v]));
    }
    return next;
}

function freezeState(state: any) {
    Object.freeze(state.items);
    Object.freeze(state);
    return state;
}

function buildState({ items, selectedIds, anchorId, groups }: any) {
    const itemSet = new Set(items);
    // Filtra seleção a IDs ainda válidos
    const filteredSelected = new Set();
    for (const id of selectedIds) {
        if (itemSet.has(id)) filteredSelected.add(id);
    }
    const validAnchor = anchorId !== null && itemSet.has(anchorId) ? anchorId : null;
    return freezeState({
        items: [...items],
        selectedIds: filteredSelected,
        anchorId: validAnchor,
        groups: groups instanceof Map ? groups : new Map(),
    });
}

export function createMultiSelectState(items: any = []) {
    if (!Array.isArray(items)) {
        throw new Error('createMultiSelectState: items must be array');
    }
    return buildState({
        items: [...items],
        selectedIds: new Set(),
        anchorId: null,
        groups: new Map(),
    });
}

export function setItems(state: any, items: any) {
    if (!Array.isArray(items)) {
        throw new Error('setItems: items must be array');
    }
    const itemSet = new Set(items);
    // Limpa grupos: filtra IDs que ainda existem
    const newGroups = new Map();
    for (const [gid, ids] of state.groups) {
        newGroups.set(gid, Object.freeze(ids.filter((id: any) => itemSet.has(id as any))));
    }
    return buildState({
        items,
        selectedIds: cloneSet(state.selectedIds),
        anchorId: state.anchorId,
        groups: newGroups,
    });
}

function assertItemExists(state: any, itemId: any, fnName: any) {
    if (!state.items.includes(itemId)) {
        throw new Error(`${fnName}: itemId "${itemId}" not in items`);
    }
}

export function toggleItem(state: any, itemId: any) {
    assertItemExists(state, itemId, 'toggleItem');
    const next = cloneSet(state.selectedIds);
    if (next.has(itemId)) next.delete(itemId);
    else next.add(itemId);
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: itemId,
        groups: cloneGroups(state.groups),
    });
}

export function selectItem(state: any, itemId: any) {
    assertItemExists(state, itemId, 'selectItem');
    const next = cloneSet(state.selectedIds);
    next.add(itemId);
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: itemId,
        groups: cloneGroups(state.groups),
    });
}

export function deselectItem(state: any, itemId: any) {
    assertItemExists(state, itemId, 'deselectItem');
    const next = cloneSet(state.selectedIds);
    next.delete(itemId);
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: state.anchorId,
        groups: cloneGroups(state.groups),
    });
}

export function selectRange(state: any, fromIdOrTo: any, toId: any) {
    let fromId;
    let toIdResolved;
    if (toId === undefined) {
        // 1-arg: usa anchor como from
        if (state.anchorId === null) {
            throw new Error('selectRange: no anchor set; provide fromId or call setAnchor first');
        }
        fromId = state.anchorId;
        toIdResolved = fromIdOrTo;
    } else {
        fromId = fromIdOrTo;
        toIdResolved = toId;
    }
    const fromIdx = state.items.indexOf(fromId);
    const toIdx = state.items.indexOf(toIdResolved);
    if (fromIdx === -1) throw new Error(`selectRange: fromId "${fromId}" not in items`);
    if (toIdx === -1) throw new Error(`selectRange: toId "${toIdResolved}" not in items`);
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const next = cloneSet(state.selectedIds);
    for (let i = lo; i <= hi; i++) next.add(state.items[i]);
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: toIdResolved,
        groups: cloneGroups(state.groups),
    });
}

export function selectAll(state: any) {
    return buildState({
        items: state.items,
        selectedIds: new Set(state.items),
        anchorId: state.anchorId,
        groups: cloneGroups(state.groups),
    });
}

export function deselectAll(state: any) {
    return buildState({
        items: state.items,
        selectedIds: new Set(),
        anchorId: state.anchorId,
        groups: cloneGroups(state.groups),
    });
}

export function invertSelection(state: any) {
    const next = new Set();
    for (const id of state.items) {
        if (!state.selectedIds.has(id)) next.add(id);
    }
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: state.anchorId,
        groups: cloneGroups(state.groups),
    });
}

export function setAnchor(state: any, itemId: any) {
    if (itemId !== null) assertItemExists(state, itemId, 'setAnchor');
    return buildState({
        items: state.items,
        selectedIds: cloneSet(state.selectedIds),
        anchorId: itemId,
        groups: cloneGroups(state.groups),
    });
}

export function setGroup(state: any, groupId: any, itemIds: any) {
    if (typeof groupId !== 'string' || !groupId) {
        throw new Error('setGroup: groupId must be non-empty string');
    }
    if (!Array.isArray(itemIds)) {
        throw new Error('setGroup: itemIds must be array');
    }
    const itemSet = new Set(state.items);
    const accepted = itemIds.filter((id) => itemSet.has(id));
    // (warning não fatal - IDs ausentes simplesmente não entram)
    const newGroups = cloneGroups(state.groups);
    newGroups.set(groupId, Object.freeze(accepted));
    return buildState({
        items: state.items,
        selectedIds: cloneSet(state.selectedIds),
        anchorId: state.anchorId,
        groups: newGroups,
    });
}

function assertGroupExists(state: any, groupId: any, fnName: any) {
    if (!state.groups.has(groupId)) {
        throw new Error(`${fnName}: groupId "${groupId}" not registered`);
    }
}

export function selectGroup(state: any, groupId: any) {
    assertGroupExists(state, groupId, 'selectGroup');
    const next = cloneSet(state.selectedIds);
    for (const id of state.groups.get(groupId)) next.add(id);
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: state.anchorId,
        groups: cloneGroups(state.groups),
    });
}

export function deselectGroup(state: any, groupId: any) {
    assertGroupExists(state, groupId, 'deselectGroup');
    const next = cloneSet(state.selectedIds);
    for (const id of state.groups.get(groupId)) next.delete(id);
    return buildState({
        items: state.items,
        selectedIds: next,
        anchorId: state.anchorId,
        groups: cloneGroups(state.groups),
    });
}

export function isSelected(state: any, itemId: any) {
    return state.selectedIds.has(itemId);
}

export function getSelectedIds(state: any) {
    return state.items.filter((id: any) => state.selectedIds.has(id as any));
}

export function getSelectedCount(state: any) {
    return state.selectedIds.size;
}

function classifyFraction(selectedCount: any, total: any) {
    if (total === 0) return 'none';
    if (selectedCount === 0) return 'none';
    if (selectedCount === total) return 'all';
    return 'indeterminate';
}

export function getSelectAllStatus(state: any) {
    return classifyFraction(state.selectedIds.size, state.items.length);
}

export function getGroupSelectStatus(state: any, groupId: any) {
    assertGroupExists(state, groupId, 'getGroupSelectStatus');
    const ids = state.groups.get(groupId);
    let count = 0;
    for (const id of ids) if (state.selectedIds.has(id)) count++;
    return classifyFraction(count, ids.length);
}

export function summarizeMultiSelect(state: any) {
    return {
        totalItems: state.items.length,
        selectedCount: state.selectedIds.size,
        selectAllStatus: getSelectAllStatus(state),
        anchorId: state.anchorId,
        groupCount: state.groups.size,
    };
}
