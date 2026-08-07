// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-54 - Contextual Menu State (pure-logic, zero DOM)
// Hierarchical menus with conditional visibility, separators, submenus.

function deepFreezeItems(items: any): any {
    const frozen = items.map((it: any) => {
        const copy = { ...it };
        if (Array.isArray(copy.submenu)) {
            copy.submenu = deepFreezeItems(copy.submenu);
        }
        return Object.freeze(copy);
    });
    return Object.freeze(frozen);
}

function normalizeItem(raw: any): any {
    if (!raw || typeof raw !== 'object') {
        throw new Error('menu item must be an object');
    }
    if (raw.separator) {
        return {
            id: raw.id || `sep-${Math.random().toString(36).slice(2, 8)}`,
            separator: true,
            visible: raw.visible !== false,
            enabled: false,
            label: '',
            icon: null,
            actionId: null,
            shortcut: null,
            danger: false,
            hasSubmenu: false,
            submenu: null,
            predicate: typeof raw.predicate === 'function' ? raw.predicate : null,
        };
    }
    if (!raw.id || typeof raw.id !== 'string') {
        throw new Error('menu item must have a string id');
    }
    const submenu = Array.isArray(raw.submenu) && raw.submenu.length > 0 ? raw.submenu.map(normalizeItem) : null;
    return {
        id: raw.id,
        label: raw.label || raw.id,
        icon: raw.icon || null,
        actionId: raw.actionId || null,
        shortcut: raw.shortcut || null,
        enabled: raw.enabled !== false,
        visible: raw.visible !== false,
        danger: raw.danger === true,
        separator: false,
        submenu,
        hasSubmenu: submenu !== null,
        predicate: typeof raw.predicate === 'function' ? raw.predicate : null,
    };
}

function assertUniqueIds(items: any): void {
    const seen = new Set();
    function walk(arr: any) {
        for (const it of arr) {
            if (seen.has(it.id)) {
                throw new Error(`duplicate menu item id: ${it.id}`);
            }
            seen.add(it.id);
            if (it.submenu) walk(it.submenu);
        }
    }
    walk(items);
}

function assertFiniteXY(p: any): void {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new Error('position must have finite x/y');
    }
}

/**
 * Recursively evaluate predicates and recompute visibility.
 */
export function evaluateItems(items: any, context: any): any {
    const ctx = context || {};
    const out = items.map((it: any) => {
        let visible = it.visible !== false;
        if (typeof it.predicate === 'function') {
            try {
                visible = !!it.predicate(ctx);
            } catch {
                visible = false;
            }
        }
        const submenu = it.submenu ? evaluateItems(it.submenu, ctx) : null;
        return Object.freeze({
            ...it,
            visible,
            submenu,
            hasSubmenu: submenu !== null && submenu.length > 0,
        });
    });
    return Object.freeze(out);
}

export function createContextMenu(items: Array<any> = []): object {
    if (!Array.isArray(items)) {
        throw new Error('items must be an array');
    }
    const normalized = items.map(normalizeItem);
    assertUniqueIds(normalized);
    return Object.freeze({
        open: false,
        items: deepFreezeItems(normalized),
        position: Object.freeze({ x: 0, y: 0 }),
        openPath: Object.freeze([]),
        context: Object.freeze({}),
    });
}

export function openMenu(state: any, position: any, context: any): any {
    assertFiniteXY(position);
    const ctx = context && typeof context === 'object' ? { ...context } : {};
    const evaluated = evaluateItems(state.items, ctx);
    return Object.freeze({
        open: true,
        items: evaluated,
        position: Object.freeze({ x: position.x, y: position.y }),
        openPath: Object.freeze([]),
        context: Object.freeze(ctx),
    });
}

export function closeMenu(state: any): any {
    return Object.freeze({
        open: false,
        items: state.items,
        position: Object.freeze({ x: 0, y: 0 }),
        openPath: Object.freeze([]),
        context: Object.freeze({}),
    });
}

export function getItemAtPath(state: any, path: any): any {
    if (!Array.isArray(path) || path.length === 0) return null;
    let arr = state.items;
    let item = null;
    for (const id of path) {
        if (!arr) return null;
        item = arr.find((it: any) => it.id === id) || null;
        if (!item) return null;
        arr = item.submenu;
    }
    return item;
}

function pathExists(items: any, path: any): boolean {
    let arr = items;
    for (const id of path) {
        if (!arr) return false;
        const it = arr.find((x: any) => x.id === id);
        if (!it) return false;
        arr = it.submenu;
    }
    return true;
}

export function expandSubmenu(state: any, itemPath: any): any {
    if (!Array.isArray(itemPath) || itemPath.length === 0) {
        throw new Error('itemPath must be a non-empty array');
    }
    if (!pathExists(state.items, itemPath)) {
        throw new Error(`path does not exist: ${itemPath.join('/')}`);
    }
    const target = getItemAtPath(state, itemPath);
    if (!target || !target.hasSubmenu) {
        throw new Error('item has no submenu');
    }
    // Collapse siblings at same depth: openPath must be a strict prefix chain.
    // New openPath = parent prefix (itemPath without last) + last == itemPath
    const next = itemPath.slice();
    return Object.freeze({
        ...state,
        openPath: Object.freeze(next),
    });
}

export function collapseSubmenu(state: any, itemPath: any): any {
    if (!Array.isArray(itemPath) || itemPath.length === 0) {
        throw new Error('itemPath must be a non-empty array');
    }
    // Remove path and any descendants by truncating openPath to itemPath length - 1
    // when openPath starts with itemPath
    const op = state.openPath;
    let truncate = op.length;
    if (op.length >= itemPath.length) {
        let isPrefix = true;
        for (let i = 0; i < itemPath.length; i++) {
            if (op[i] !== itemPath[i]) {
                isPrefix = false;
                break;
            }
        }
        if (isPrefix) truncate = itemPath.length - 1;
    }
    const next = op.slice(0, Math.max(0, truncate));
    return Object.freeze({
        ...state,
        openPath: Object.freeze(next),
    });
}

export function selectItem(state: any, itemPath: any): any {
    if (!Array.isArray(itemPath) || itemPath.length === 0) {
        throw new Error('itemPath must be a non-empty array');
    }
    if (!pathExists(state.items, itemPath)) {
        throw new Error(`path does not exist: ${itemPath.join('/')}`);
    }
    const item = getItemAtPath(state, itemPath);
    if (!item || item.separator) {
        return { actionId: null, state };
    }
    if (!item.enabled || !item.visible) {
        return { actionId: null, state };
    }
    if (item.hasSubmenu) {
        return { actionId: null, state: expandSubmenu(state, itemPath) };
    }
    return { actionId: item.actionId, state: closeMenu(state) };
}

export function getVisibleItems(state: any): any {
    return state.items.filter((it: any) => it.visible !== false);
}

export function addItem(state: any, item: any): any {
    const normalized = normalizeItem(item);
    const existing = new Set();
    function walk(arr: any) {
        for (const it of arr) {
            existing.add(it.id);
            if (it.submenu) walk(it.submenu);
        }
    }
    walk(state.items);
    if (existing.has(normalized.id)) {
        throw new Error(`duplicate menu item id: ${normalized.id}`);
    }
    const nextItems = deepFreezeItems([...state.items, normalized]);
    const evaluated = state.open ? evaluateItems(nextItems, state.context) : nextItems;
    return Object.freeze({
        ...state,
        items: evaluated,
    });
}

export function removeItem(state: any, itemId: any): any {
    if (typeof itemId !== 'string' || !itemId) {
        throw new Error('itemId must be a non-empty string');
    }
    function filterTree(arr: Array<any>): Array<any> {
        const out: Array<any> = [];
        for (const it of arr) {
            if (it.id === itemId) continue;
            if (it.submenu) {
                const sub: Array<any> = filterTree(it.submenu);
                out.push(Object.freeze({ ...it, submenu: Object.freeze(sub), hasSubmenu: sub.length > 0 }));
            } else {
                out.push(it);
            }
        }
        return out;
    }
    const filtered = Object.freeze(filterTree(state.items));
    return Object.freeze({
        ...state,
        items: filtered,
    });
}

export function summarizeContextMenu(state: any): any {
    let total = 0;
    let enabled = 0;
    let dangerous = 0;
    let depth = 0;
    function walk(arr: any, d: any) {
        if (d > depth) depth = d;
        for (const it of arr) {
            if (it.separator) continue;
            total += 1;
            if (it.enabled && it.visible) enabled += 1;
            if (it.danger) dangerous += 1;
            if (it.submenu) walk(it.submenu, d + 1);
        }
    }
    walk(state.items, 1);
    if (state.items.length === 0) depth = 0;
    return {
        open: state.open,
        totalItems: total,
        enabled,
        dangerous,
        depth,
    };
}
