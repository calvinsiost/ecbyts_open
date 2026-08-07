// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TOOLBAR DOCK STATE — UX-53

   Pure-logic, zero DOM. Layout state for toolbars/panels/HUDs that
   can be docked (left/right/top/bottom), floated, hidden, minimized,
   resized and reordered. Immutable; every mutator returns a new
   frozen state.
   ================================================================ */

export const DOCK_POSITIONS = Object.freeze(['left', 'right', 'top', 'bottom', 'floating']);
const DOCK_EDGES = Object.freeze(['left', 'right', 'top', 'bottom']);
const ITEM_TYPES = Object.freeze(['panel', 'toolbar', 'hud']);

const DEFAULT_DOCK_SIZES = Object.freeze({
    left: 280,
    right: 280,
    top: 56,
    bottom: 120,
});

const MIN_DOCK_SIZE = 28;

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function freezeItem(item: any): any {
    const size = Object.freeze({ ...(item.size || {}) });
    const floatingPosition = item.floatingPosition ? Object.freeze({ ...item.floatingPosition }) : null;
    return Object.freeze({ ...item, size, floatingPosition });
}

function freezeState(state: any): any {
    return Object.freeze({
        items: state.items,
        dockSizes: Object.freeze({ ...state.dockSizes }),
    });
}

function cloneItems(items: any): any {
    return new Map(items);
}

function requireItem(state: any, id: any): any {
    const item = state.items.get(id);
    if (!item) throw new Error(`Item not found: ${id}`);
    return item;
}

function validatePosition(position: any): void {
    if (!DOCK_POSITIONS.includes(position)) {
        throw new Error(`Invalid position: ${position}`);
    }
}

function validateEdge(position: any): void {
    if (!DOCK_EDGES.includes(position)) {
        throw new Error(`Invalid dock edge: ${position}`);
    }
}

function validateSize(size: any): void {
    if (!size || typeof size !== 'object') return;
    if (size.width != null && (typeof size.width !== 'number' || size.width < 0)) {
        throw new Error('size.width must be a non-negative number');
    }
    if (size.height != null && (typeof size.height !== 'number' || size.height < 0)) {
        throw new Error('size.height must be a non-negative number');
    }
}

function normalizeItem(input: any): any {
    if (!input || typeof input !== 'object') {
        throw new Error('Item must be an object');
    }
    const { id, type, position } = input;
    if (!id || typeof id !== 'string') throw new Error('Item.id required (string)');
    if (!ITEM_TYPES.includes(type)) throw new Error(`Invalid item.type: ${type}`);
    validatePosition(position);
    validateSize(input.size);
    if (position === 'floating' && !input.floatingPosition) {
        throw new Error('floating item requires floatingPosition');
    }
    if (input.floatingPosition) {
        const fp = input.floatingPosition;
        if (typeof fp.x !== 'number' || typeof fp.y !== 'number') {
            throw new Error('floatingPosition requires numeric {x, y}');
        }
    }
    return freezeItem({
        id,
        type,
        position,
        size: input.size || {},
        order: typeof input.order === 'number' ? input.order : 0,
        visible: input.visible !== false,
        minimized: !!input.minimized,
        floatingPosition: input.floatingPosition || null,
    });
}

// ──────────────────────────────────────────────────────────────────────
// Constructors
// ──────────────────────────────────────────────────────────────────────

export function createDockState(initialItems: any = []): any {
    if (!Array.isArray(initialItems)) {
        throw new Error('initialItems must be an array');
    }
    const items = new Map();
    for (const raw of initialItems) {
        const item = normalizeItem(raw);
        if (items.has(item.id)) throw new Error(`Duplicate item id: ${item.id}`);
        items.set(item.id, item);
    }
    return freezeState({ items, dockSizes: { ...DEFAULT_DOCK_SIZES } });
}

// ──────────────────────────────────────────────────────────────────────
// Mutators (immutable)
// ──────────────────────────────────────────────────────────────────────

export function addItem(state: any, item: any): any {
    const normalized = normalizeItem(item);
    if (state.items.has(normalized.id)) {
        throw new Error(`Duplicate item id: ${normalized.id}`);
    }
    const items = cloneItems(state.items);
    items.set(normalized.id, normalized);
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function removeItem(state: any, id: any): any {
    if (!state.items.has(id)) return state;
    const items = cloneItems(state.items);
    items.delete(id);
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function dockItem(state: any, id: any, position: any): any {
    validateEdge(position);
    const item = requireItem(state, id);
    const items = cloneItems(state.items);
    items.set(id, freezeItem({ ...item, position, floatingPosition: null }));
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function floatItem(state: any, id: any, floatingPosition: any): any {
    if (!floatingPosition || typeof floatingPosition.x !== 'number' || typeof floatingPosition.y !== 'number') {
        throw new Error('floatItem requires floatingPosition {x, y}');
    }
    const item = requireItem(state, id);
    const items = cloneItems(state.items);
    items.set(
        id,
        freezeItem({
            ...item,
            position: 'floating',
            floatingPosition: { x: floatingPosition.x, y: floatingPosition.y },
        }),
    );
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function setItemSize(state: any, id: any, size: any): any {
    validateSize(size);
    const item = requireItem(state, id);
    const newSize = { ...item.size };
    if (size && size.width != null) newSize.width = size.width;
    if (size && size.height != null) newSize.height = size.height;
    const items = cloneItems(state.items);
    items.set(id, freezeItem({ ...item, size: newSize }));
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function setItemOrder(state: any, id: any, order: any): any {
    if (typeof order !== 'number') throw new Error('order must be a number');
    const item = requireItem(state, id);
    const items = cloneItems(state.items);
    items.set(id, freezeItem({ ...item, order }));
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function toggleVisibility(state: any, id: any): any {
    const item = requireItem(state, id);
    const items = cloneItems(state.items);
    items.set(id, freezeItem({ ...item, visible: !item.visible }));
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function toggleMinimize(state: any, id: any): any {
    const item = requireItem(state, id);
    const items = cloneItems(state.items);
    items.set(id, freezeItem({ ...item, minimized: !item.minimized }));
    return freezeState({ items, dockSizes: state.dockSizes });
}

export function setDockSize(state: any, position: any, size: any): any {
    validateEdge(position);
    if (typeof size !== 'number' || size < 0) {
        throw new Error('dock size must be a non-negative number');
    }
    return freezeState({
        items: state.items,
        dockSizes: { ...state.dockSizes, [position]: size },
    });
}

export function resetLayout(state: any, defaultLayout: any): any {
    return createDockState(defaultLayout || []);
}

// ──────────────────────────────────────────────────────────────────────
// Queries
// ──────────────────────────────────────────────────────────────────────

export function getItemsAtPosition(state: any, position: any): any[] {
    validatePosition(position);
    const arr = [];
    for (const item of state.items.values()) {
        if (item.position === position) arr.push(item);
    }
    arr.sort((a, b) => {
        // visible (non-minimized) first, then minimized, then hidden
        const rank = (it: any) => (it.visible && !it.minimized ? 0 : it.minimized ? 1 : 2);
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) return ra - rb;
        if (a.order !== b.order) return a.order - b.order;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
    return arr;
}

export function getDockSize(state: any, position: any): number {
    validateEdge(position);
    const isHorizontal = position === 'left' || position === 'right';
    let total = 0;
    for (const item of state.items.values()) {
        if (item.position !== position) continue;
        if (!item.visible) continue;
        if (item.minimized) {
            total += MIN_DOCK_SIZE;
            continue;
        }
        const dim = isHorizontal ? item.size.width : item.size.height;
        if (typeof dim === 'number') total += dim;
    }
    const baseline = state.dockSizes[position] ?? (DEFAULT_DOCK_SIZES as any)[position];
    return Math.max(MIN_DOCK_SIZE, total || baseline);
}

export function summarizeDock(state: any): any {
    let visible = 0;
    let minimized = 0;
    let floating = 0;
    const byPosition: Record<string, number> = { left: 0, right: 0, top: 0, bottom: 0, floating: 0 };
    for (const item of state.items.values()) {
        byPosition[item.position] = (byPosition[item.position] || 0) + 1;
        if (item.position === 'floating') floating++;
        if (item.minimized) minimized++;
        if (item.visible && !item.minimized) visible++;
    }
    return {
        totalItems: state.items.size,
        visible,
        minimized,
        floating,
        byPosition,
    };
}

export const __testing = Object.freeze({ DEFAULT_DOCK_SIZES, MIN_DOCK_SIZE });
