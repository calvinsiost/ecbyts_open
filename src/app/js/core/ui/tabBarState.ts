// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Tab Bar State - pure-logic, zero DOM (UX-70)
// Modelo de tabs estilo browser com pin, close, drag-reorder.

export interface Tab {
    id: string;
    label: string;
    icon?: string;
    content?: unknown;
    pinned: boolean;
    dirty: boolean;
    closeable: boolean;
    openedAt: number;
}

export interface TabInput {
    id?: unknown;
    label?: unknown;
    icon?: string;
    content?: unknown;
    pinned?: boolean;
    dirty?: boolean;
    closeable?: boolean;
    openedAt?: number;
}

export interface TabBarState {
    tabs: readonly Readonly<Tab>[];
    activeId: string | null;
    pinnedFirst: boolean;
}

export interface CreateTabBarOptions {
    pinnedFirst?: boolean;
}

export interface TabBarSummary {
    tabCount: number;
    pinnedCount: number;
    dirtyCount: number;
    activeLabel: string | null;
}

const TAB_DEFAULTS = { pinned: false, dirty: false, closeable: true } satisfies Pick<
    Tab,
    'pinned' | 'dirty' | 'closeable'
>;

function freezeTab(tab: Tab): Readonly<Tab> {
    return Object.freeze({ ...tab });
}

function freezeState(state: { tabs: Tab[]; activeId: string | null; pinnedFirst: boolean }): Readonly<TabBarState> {
    return Object.freeze({
        tabs: Object.freeze(state.tabs.map(freezeTab)),
        activeId: state.activeId,
        pinnedFirst: state.pinnedFirst,
    });
}

/**
 * Sort tabs respecting pinnedFirst flag while keeping relative order otherwise.
 */
function applySort(tabs: readonly Readonly<Tab>[], pinnedFirst: boolean): Tab[] {
    if (!pinnedFirst) return tabs.map((tab) => ({ ...tab }));
    const pinned = tabs.filter((t) => t.pinned);
    const rest = tabs.filter((t) => !t.pinned);
    return [...pinned, ...rest].map((tab) => ({ ...tab }));
}

export function createTabBar({ pinnedFirst = true }: CreateTabBarOptions = {}): Readonly<TabBarState> {
    return freezeState({ tabs: [], activeId: null, pinnedFirst: !!pinnedFirst });
}

export function addTab(state: Readonly<TabBarState>, tab: TabInput): Readonly<TabBarState> {
    if (!tab || typeof tab.id !== 'string' || !tab.id) {
        throw new Error('addTab: tab.id required');
    }
    if (state.tabs.some((t) => t.id === tab.id)) {
        throw new Error(`addTab: duplicate id "${tab.id}"`);
    }
    const newTab: Tab = {
        ...TAB_DEFAULTS,
        openedAt: Date.now(),
        ...tab,
        id: tab.id,
        label: typeof tab.label === 'string' ? tab.label : tab.id,
    };
    const tabs = applySort([...state.tabs, newTab], state.pinnedFirst);
    const activeId = state.activeId == null ? newTab.id : state.activeId;
    return freezeState({ ...state, tabs, activeId });
}

function requireTab(state: Readonly<TabBarState>, tabId: string): Readonly<Tab> {
    const t = state.tabs.find((x) => x.id === tabId);
    if (!t) throw new Error(`tab not found: "${tabId}"`);
    return t;
}

function nextActiveAfterClose(
    tabs: readonly Readonly<Tab>[],
    removedId: string,
    prevActiveId: string | null,
): string | null {
    if (prevActiveId !== removedId) return prevActiveId;
    if (tabs.length === 0) return null;
    const idx = tabs.findIndex((t) => t.id === removedId);
    // tabs here is the pre-removal list; pick neighbor.
    const after = tabs[idx + 1];
    if (after) return after.id;
    const before = tabs[idx - 1];
    if (before) return before.id;
    return null;
}

export function closeTab(state: Readonly<TabBarState>, tabId: string): Readonly<TabBarState> {
    const t = requireTab(state, tabId);
    if (!t.closeable) throw new Error(`tab not closeable: "${tabId}"`);
    const activeId = nextActiveAfterClose(state.tabs, tabId, state.activeId);
    const tabs = state.tabs.filter((x) => x.id !== tabId).map((tab) => ({ ...tab }));
    const finalActive = tabs.length === 0 ? null : activeId;
    return freezeState({ ...state, tabs, activeId: finalActive });
}

export function closeAll(state: Readonly<TabBarState>): Readonly<TabBarState> {
    // Specs: closeAll fecha todos closeable; preserva pinned (mesmo se closeable).
    const kept = state.tabs.filter((t) => t.pinned || !t.closeable).map((tab) => ({ ...tab }));
    let activeId: string | null = null;
    if (kept.find((t) => t.id === state.activeId)) activeId = state.activeId;
    else if (kept.length > 0) activeId = kept[0]?.id ?? null;
    return freezeState({ ...state, tabs: kept, activeId });
}

export function closeOthers(state: Readonly<TabBarState>, tabId: string): Readonly<TabBarState> {
    requireTab(state, tabId);
    const kept = state.tabs.filter((t) => t.id === tabId || t.pinned || !t.closeable).map((tab) => ({ ...tab }));
    const activeId = kept.find((t) => t.id === tabId) ? tabId : (kept[0]?.id ?? null);
    return freezeState({ ...state, tabs: kept, activeId });
}

export function setActive(state: Readonly<TabBarState>, tabId: string): Readonly<TabBarState> {
    requireTab(state, tabId);
    return freezeState({ ...state, tabs: state.tabs.map((tab) => ({ ...tab })), activeId: tabId });
}

function cycle(state: Readonly<TabBarState>, delta: number): Readonly<TabBarState> {
    if (state.tabs.length === 0) return state;
    const idx = state.tabs.findIndex((t) => t.id === state.activeId);
    const base = idx < 0 ? 0 : idx;
    const n = state.tabs.length;
    const nextIdx = (base + delta + n) % n;
    const nextTab = state.tabs[nextIdx];
    return freezeState({
        ...state,
        tabs: state.tabs.map((tab) => ({ ...tab })),
        activeId: nextTab?.id ?? null,
    });
}

export function setNext(state: Readonly<TabBarState>): Readonly<TabBarState> {
    return cycle(state, +1);
}

export function setPrev(state: Readonly<TabBarState>): Readonly<TabBarState> {
    return cycle(state, -1);
}

export function pinTab(state: Readonly<TabBarState>, tabId: string): Readonly<TabBarState> {
    const t = requireTab(state, tabId);
    if (t.pinned) return state;
    const tabs = applySort(
        state.tabs.map((x) => (x.id === tabId ? { ...x, pinned: true } : { ...x })),
        state.pinnedFirst,
    );
    return freezeState({ ...state, tabs });
}

export function unpinTab(state: Readonly<TabBarState>, tabId: string): Readonly<TabBarState> {
    const t = requireTab(state, tabId);
    if (!t.pinned) return state;
    const tabs = applySort(
        state.tabs.map((x) => (x.id === tabId ? { ...x, pinned: false } : { ...x })),
        state.pinnedFirst,
    );
    return freezeState({ ...state, tabs });
}

export function reorderTab(state: Readonly<TabBarState>, tabId: string, newIndex: number): Readonly<TabBarState> {
    const t = requireTab(state, tabId);
    if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= state.tabs.length) {
        throw new Error(`reorderTab: index ${newIndex} out of bounds`);
    }
    const without = state.tabs.filter((x) => x.id !== tabId).map((tab) => ({ ...tab }));
    let target = newIndex;
    if (state.pinnedFirst) {
        const pinnedCount = without.filter((x) => x.pinned).length;
        if (t.pinned) {
            // pinned tab cannot move into unpinned section
            target = Math.min(target, pinnedCount);
        } else {
            // unpinned tab cannot move before pinned section
            target = Math.max(target, pinnedCount);
        }
    }
    const tabs = [...without.slice(0, target), { ...t }, ...without.slice(target)];
    return freezeState({ ...state, tabs });
}

export function markDirty(state: Readonly<TabBarState>, tabId: string, dirty: unknown): Readonly<TabBarState> {
    requireTab(state, tabId);
    const tabs = state.tabs.map((x) => (x.id === tabId ? { ...x, dirty: !!dirty } : { ...x }));
    return freezeState({ ...state, tabs });
}

export function getActiveTab(state: Readonly<TabBarState>): Readonly<Tab> | null {
    if (state.activeId == null) return null;
    return state.tabs.find((t) => t.id === state.activeId) || null;
}

export function getTabs(state: Readonly<TabBarState>): Readonly<Tab>[] {
    return state.pinnedFirst ? applySort(state.tabs, true) : state.tabs.map((tab) => ({ ...tab }));
}

export function getPinnedTabs(state: Readonly<TabBarState>): Readonly<Tab>[] {
    return state.tabs.filter((t) => t.pinned);
}

export function getDirtyTabs(state: Readonly<TabBarState>): Readonly<Tab>[] {
    return state.tabs.filter((t) => t.dirty);
}

export function summarizeTabBar(state: Readonly<TabBarState>): TabBarSummary {
    const active = getActiveTab(state);
    return {
        tabCount: state.tabs.length,
        pinnedCount: state.tabs.filter((t) => t.pinned).length,
        dirtyCount: state.tabs.filter((t) => t.dirty).length,
        activeLabel: active ? active.label : null,
    };
}
