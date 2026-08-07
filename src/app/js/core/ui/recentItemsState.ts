// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-73 - Recent Items State (pure-logic, zero DOM)
// MRU + sticky pinned + dedup + cap per type.

const VALID_TYPES = new Set(['search', 'file', 'element', 'campaign', 'view'] as const);

export type RecentItemType = 'search' | 'file' | 'element' | 'campaign' | 'view';

export interface RecentItem {
    id: string;
    type: RecentItemType;
    label: string;
    payload: unknown;
    lastUsedAt: number;
    useCount: number;
    pinned: boolean;
}

export interface RecentItemsState {
    items: Map<string, RecentItem>;
    byType: Map<RecentItemType, string[]>;
    maxPerType: number;
}

export interface RecentItemInput {
    id?: unknown;
    type?: unknown;
    label?: unknown;
    payload?: unknown;
}

export interface RecentItemsOptions {
    maxPerType?: number;
}

export interface RecentItemsSummary {
    totalItems: number;
    byType: Record<RecentItemType, number>;
    pinnedCount: number;
    mostUsedItem: RecentItem | null;
}

function freezeState(state: RecentItemsState): Readonly<RecentItemsState> {
    return Object.freeze({
        items: state.items,
        byType: state.byType,
        maxPerType: state.maxPerType,
    });
}

function cloneByType(byType: ReadonlyMap<RecentItemType, string[]>): Map<RecentItemType, string[]> {
    const next = new Map<RecentItemType, string[]>();
    for (const [k, arr] of byType) next.set(k, arr.slice());
    return next;
}

function ensureType(type: unknown): asserts type is RecentItemType {
    if (typeof type !== 'string' || !VALID_TYPES.has(type as RecentItemType)) {
        throw new Error(`recentItemsState: invalid type "${String(type)}"`);
    }
}

function getTypeList(byType: Map<RecentItemType, string[]>, type: RecentItemType): string[] {
    const list = byType.get(type);
    if (!list) {
        const fresh: string[] = [];
        byType.set(type, fresh);
        return fresh;
    }
    return list;
}

export function createRecentItemsState({ maxPerType = 10 }: RecentItemsOptions = {}): Readonly<RecentItemsState> {
    if (!Number.isFinite(maxPerType) || maxPerType <= 0) {
        throw new Error('recentItemsState: maxPerType must be > 0');
    }
    const byType = new Map<RecentItemType, string[]>();
    for (const t of VALID_TYPES) byType.set(t, []);
    return freezeState({
        items: new Map<string, RecentItem>(),
        byType,
        maxPerType,
    });
}

export function recordUse(
    state: Readonly<RecentItemsState>,
    item: RecentItemInput,
    now: number = Date.now(),
): Readonly<RecentItemsState> {
    if (!item || typeof item !== 'object') {
        throw new Error('recentItemsState.recordUse: item required');
    }
    if (!item.id || typeof item.id !== 'string') {
        throw new Error('recentItemsState.recordUse: item.id required');
    }
    if (!item.label || typeof item.label !== 'string') {
        throw new Error('recentItemsState.recordUse: item.label required');
    }
    ensureType(item.type);

    const items = new Map(state.items);
    const byType = cloneByType(state.byType);
    const list = getTypeList(byType, item.type);

    const existing = items.get(item.id);
    if (existing) {
        if (existing.type !== item.type) {
            throw new Error('recentItemsState.recordUse: cannot change item type');
        }
        const updated: RecentItem = {
            ...existing,
            label: item.label,
            payload: item.payload !== undefined ? item.payload : existing.payload,
            lastUsedAt: now,
            useCount: existing.useCount + 1,
        };
        items.set(item.id, updated);
        const idx = list.indexOf(item.id);
        if (idx >= 0) list.splice(idx, 1);
        list.unshift(item.id);
    } else {
        const fresh: RecentItem = {
            id: item.id,
            type: item.type,
            label: item.label,
            payload: item.payload,
            lastUsedAt: now,
            useCount: 1,
            pinned: false,
        };
        items.set(item.id, fresh);
        list.unshift(item.id);

        // Evict oldest non-pinned if over cap
        const nonPinnedIds = list.filter((id) => !items.get(id)?.pinned);
        if (nonPinnedIds.length > state.maxPerType) {
            const evictId = nonPinnedIds[nonPinnedIds.length - 1];
            if (evictId) {
                const idx = list.indexOf(evictId);
                if (idx >= 0) list.splice(idx, 1);
                items.delete(evictId);
            }
        }
    }

    byType.set(item.type, list);
    return freezeState({ items, byType, maxPerType: state.maxPerType });
}

function setPinned(state: Readonly<RecentItemsState>, itemId: string, pinned: boolean): Readonly<RecentItemsState> {
    const existing = state.items.get(itemId);
    if (!existing) return state;
    if (existing.pinned === pinned) return state;
    const items = new Map(state.items);
    items.set(itemId, { ...existing, pinned });
    return freezeState({ items, byType: state.byType, maxPerType: state.maxPerType });
}

export function pinItem(state: Readonly<RecentItemsState>, itemId: string): Readonly<RecentItemsState> {
    return setPinned(state, itemId, true);
}

export function unpinItem(state: Readonly<RecentItemsState>, itemId: string): Readonly<RecentItemsState> {
    return setPinned(state, itemId, false);
}

export function removeItem(state: Readonly<RecentItemsState>, itemId: string): Readonly<RecentItemsState> {
    const existing = state.items.get(itemId);
    if (!existing) return state;
    const items = new Map(state.items);
    items.delete(itemId);
    const byType = cloneByType(state.byType);
    const list = getTypeList(byType, existing.type);
    const idx = list.indexOf(itemId);
    if (idx >= 0) list.splice(idx, 1);
    byType.set(existing.type, list);
    return freezeState({ items, byType, maxPerType: state.maxPerType });
}

export function clearByType(state: Readonly<RecentItemsState>, type: unknown): Readonly<RecentItemsState> {
    ensureType(type);
    const items = new Map(state.items);
    const byType = cloneByType(state.byType);
    const list = getTypeList(byType, type);
    const kept: string[] = [];
    for (const id of list) {
        const it = items.get(id);
        if (it?.pinned) {
            kept.push(id);
        } else {
            items.delete(id);
        }
    }
    byType.set(type, kept);
    return freezeState({ items, byType, maxPerType: state.maxPerType });
}

export function clearAll(state: Readonly<RecentItemsState>): Readonly<RecentItemsState> {
    const items = new Map<string, RecentItem>();
    const byType = new Map<RecentItemType, string[]>();
    for (const t of VALID_TYPES) byType.set(t, []);
    for (const [id, it] of state.items) {
        if (it.pinned) {
            items.set(id, it);
            getTypeList(byType, it.type).push(id);
        }
    }
    // Preserve pinned order from original byType
    for (const t of VALID_TYPES) {
        const orig = state.byType.get(t) || [];
        const pinnedIds = orig.filter((id) => items.has(id));
        byType.set(t, pinnedIds);
    }
    return freezeState({ items, byType, maxPerType: state.maxPerType });
}

export function getRecent(state: Readonly<RecentItemsState>, type: unknown, limit?: number): RecentItem[] {
    ensureType(type);
    const list = state.byType.get(type) || [];
    const pinned: RecentItem[] = [];
    const unpinned: RecentItem[] = [];
    for (const id of list) {
        const it = state.items.get(id);
        if (!it) continue;
        if (it.pinned) pinned.push(it);
        else unpinned.push(it);
    }
    pinned.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    // unpinned already in MRU order (list ordered by insertion-to-top)
    const combined = pinned.concat(unpinned);
    return typeof limit === 'number' ? combined.slice(0, limit) : combined;
}

export function getMostUsed(state: Readonly<RecentItemsState>, type: unknown, limit = 5): RecentItem[] {
    ensureType(type);
    const list = state.byType.get(type) || [];
    const items = list.map((id) => state.items.get(id)).filter((item): item is RecentItem => Boolean(item));
    items.sort((a, b) => {
        if (b.useCount !== a.useCount) return b.useCount - a.useCount;
        return b.lastUsedAt - a.lastUsedAt;
    });
    return items.slice(0, limit);
}

export function getItemById(state: Readonly<RecentItemsState>, itemId: string): RecentItem | null {
    return state.items.get(itemId) || null;
}

export function getPinnedCount(state: Readonly<RecentItemsState>, type?: unknown): number {
    if (type === undefined) {
        let n = 0;
        for (const it of state.items.values()) if (it.pinned) n++;
        return n;
    }
    ensureType(type);
    let n = 0;
    for (const id of state.byType.get(type) || []) {
        if (state.items.get(id)?.pinned) n++;
    }
    return n;
}

export function searchRecent(state: Readonly<RecentItemsState>, type: unknown, queryStr: unknown): RecentItem[] {
    ensureType(type);
    const q =
        queryStr === null || queryStr === undefined
            ? ''
            : typeof queryStr === 'string' ||
                typeof queryStr === 'number' ||
                typeof queryStr === 'boolean' ||
                typeof queryStr === 'bigint'
              ? String(queryStr).toLowerCase()
              : '';
    if (!q) return [];
    const list = state.byType.get(type) || [];
    const out: RecentItem[] = [];
    for (const id of list) {
        const it = state.items.get(id);
        if (it?.label.toLowerCase().includes(q)) out.push(it);
    }
    return out;
}

export function summarizeRecent(state: Readonly<RecentItemsState>): RecentItemsSummary {
    const byType = {
        search: 0,
        file: 0,
        element: 0,
        campaign: 0,
        view: 0,
    } satisfies Record<RecentItemType, number>;
    for (const t of VALID_TYPES) byType[t] = state.byType.get(t)?.length || 0;
    let pinnedCount = 0;
    let mostUsedItem: RecentItem | null = null;
    for (const it of state.items.values()) {
        if (it.pinned) pinnedCount++;
        if (
            !mostUsedItem ||
            it.useCount > mostUsedItem.useCount ||
            (it.useCount === mostUsedItem.useCount && it.lastUsedAt > mostUsedItem.lastUsedAt)
        ) {
            mostUsedItem = it;
        }
    }
    return {
        totalItems: state.items.size,
        byType,
        pinnedCount,
        mostUsedItem,
    };
}
