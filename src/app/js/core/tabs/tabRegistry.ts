// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TAB REGISTRY — SPEC_PROJECT_TABS (PROJECT-TABS-001)

   Pure helpers para state de abas de projeto:
   - Tab registry com limit §RF-5
   - Modified tracking §RF-1.3
   - Reorder §RF-7
   - Session persistence serialization §RF-6
   - Autosave queue §RF-3.2
   - Keyboard shortcut → tab index (Ctrl+1..9)

   DOM rendering + autosave execution ficam em handler.
   ================================================================ */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

interface Tab {
    id: string;
    projectId: string;
    title: string;
    order: number;
    state: string;
    modified: boolean;
    activatedAt: number | null;
    createdAt: number;
}

interface Registry {
    tabs: Map<string, any>;
    activeId: string | null;
    maxTabs: number;
}

interface OpResult {
    ok: boolean;
    reason?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Constants §RF-5/RNF-4
// ──────────────────────────────────────────────────────────────────────

export const TAB_CONFIG = Object.freeze({
    DEFAULT_MAX_TABS: 5,
    HARD_MAX_TABS: 10, // RNF-4
    UNLOAD_IDLE_MS: 30_000, // §ADR-001 descarrega inativo após 30s
    SESSION_TTL_MS: 24 * 60 * 60 * 1000, // 24h §RF-6.3
    AUTOSAVE_DEBOUNCE_MS: 500, // RNF-3
});

export const TAB_STATES = Object.freeze(['idle', 'modified', 'saving', 'loading']);

// ──────────────────────────────────────────────────────────────────────
// Tab creation + validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Record<string, any>} input
 * @returns {Object|null}
 */
export function createTab(input: Record<string, any>): Tab | null {
    if (!input || typeof input !== 'object') return null;
    if (!input.id || !input.projectId || !input.title) return null;
    return {
        id: input.id,
        projectId: input.projectId,
        title: input.title,
        order: toFiniteNumber(input.order, 0),
        state: TAB_STATES.includes(input.state) ? input.state : 'idle',
        modified: false,
        activatedAt: null,
        createdAt: Date.now(),
    };
}

/**
 * @param {Record<string, any>} tab
 * @returns {boolean}
 */
export function isValidTab(tab: Record<string, any>): boolean {
    if (!tab || typeof tab !== 'object') return false;
    return Boolean(tab.id && tab.projectId && tab.title && TAB_STATES.includes(tab.state));
}

// ──────────────────────────────────────────────────────────────────────
// Tab registry (pure map-based)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {number} [maxTabs]
 * @returns {{ tabs: Map<string, any>, activeId: string|null, maxTabs: number }}
 */
export function createRegistry(maxTabs: number = TAB_CONFIG.DEFAULT_MAX_TABS): Registry {
    const m = Math.min(TAB_CONFIG.HARD_MAX_TABS, Math.max(1, Number(maxTabs) || TAB_CONFIG.DEFAULT_MAX_TABS));
    return {
        tabs: new Map(),
        activeId: null,
        maxTabs: m,
    };
}

/**
 * @param {Record<string, any>} registry
 * @param {Record<string, any>} any>
 * @returns {{ ok: boolean, reason?: string }}
 */
export function addTab(registry: Record<string, any>, tab: Record<string, any>): OpResult {
    if (!registry || !(registry.tabs instanceof Map)) return { ok: false, reason: 'invalid_registry' };
    if (!isValidTab(tab)) return { ok: false, reason: 'invalid_tab' };
    if (registry.tabs.has(tab.id)) return { ok: false, reason: 'id_exists' };
    if (registry.tabs.size >= registry.maxTabs) return { ok: false, reason: 'max_tabs_reached' };
    // order defaults to end
    const order = registry.tabs.size;
    registry.tabs.set(tab.id, { ...tab, order });
    if (!registry.activeId) registry.activeId = tab.id;
    return { ok: true };
}

/**
 * @param {Record<string, any>} registry
 * @param {string} any>
 * @returns {{ ok: boolean, reason?: string }}
 */
export function removeTab(registry: Record<string, any>, tabId: string): OpResult {
    if (!registry || !(registry.tabs instanceof Map)) return { ok: false, reason: 'invalid_registry' };
    if (!registry.tabs.has(tabId)) return { ok: false, reason: 'not_found' };
    registry.tabs.delete(tabId);
    if (registry.activeId === tabId) {
        const next = registry.tabs.keys().next().value;
        registry.activeId = next || null;
    }
    // Reorder
    const sorted = [...registry.tabs.values()].sort((a: any, b: any) => a.order - b.order);
    sorted.forEach((t: any, i: number) => {
        t.order = i;
    });
    return { ok: true };
}

/**
 * @param {Record<string, any>} registry
 * @param {string} any>
 * @param {number} tabId
 * @returns {{ ok: boolean, reason?: string, previousActive?: string }}
 */
export function activateTab(
    registry: Record<string, any>,
    tabId: string,
    nowMs: number = Date.now(),
): { ok: boolean; reason?: string; previousActive?: string } {
    if (!registry || !(registry.tabs instanceof Map)) return { ok: false, reason: 'invalid_registry' };
    if (!registry.tabs.has(tabId)) return { ok: false, reason: 'not_found' };
    const previousActive = registry.activeId;
    registry.activeId = tabId;
    const t = registry.tabs.get(tabId);
    t.activatedAt = nowMs;
    return { ok: true, previousActive };
}

/**
 * @param {Record<string, any>} registry
 * @param {string} any>
 * @param {boolean} tabId
 */
export function setTabModified(registry: Record<string, any>, tabId: string, modified: boolean): boolean {
    if (!registry || !(registry.tabs instanceof Map)) return false;
    const t = registry.tabs.get(tabId);
    if (!t) return false;
    t.modified = Boolean(modified);
    t.state = modified ? 'modified' : 'idle';
    return true;
}

/**
 * Retorna array de tabs ordenado por order.
 * @param {Record<string, any>} registry
 * @returns {Array<any>}
 */
export function listTabs(registry: Record<string, any>): Array<any> {
    if (!registry || !(registry.tabs instanceof Map)) return [];
    return [...registry.tabs.values()].sort((a: any, b: any) => a.order - b.order);
}

// ──────────────────────────────────────────────────────────────────────
// Reorder §RF-7
// ──────────────────────────────────────────────────────────────────────

/**
 * Move tab de fromIndex para toIndex (visual order).
 * @param {Record<string, any>} registry
 * @param {number} any>
 * @param {number} fromIndex
 * @returns {boolean}
 */
export function reorderTabs(registry: Record<string, any>, fromIndex: number, toIndex: number): boolean {
    if (!registry || !(registry.tabs instanceof Map)) return false;
    const tabs = listTabs(registry);
    const n = tabs.length;
    const from = Math.max(0, Math.min(n - 1, Math.floor(Number(fromIndex))));
    const to = Math.max(0, Math.min(n - 1, Math.floor(Number(toIndex))));
    if (from === to) return false;
    const [moved] = tabs.splice(from, 1);
    tabs.splice(to, 0, moved);
    tabs.forEach((t: any, i: number) => {
        t.order = i;
    });
    return true;
}

// ──────────────────────────────────────────────────────────────────────
// Session persistence §RF-6
// ──────────────────────────────────────────────────────────────────────

/**
 * Serializa registry para session storage.
 * @param {Record<string, any>} registry
 * @returns {Object} shape { savedAt, activeId, tabs: [{id, projectId, title, order}] }
 */
export function serializeSession(registry: Record<string, any>): Record<string, any> {
    if (!registry || !(registry.tabs instanceof Map)) {
        return { savedAt: Date.now(), activeId: null, tabs: [] };
    }
    return {
        savedAt: Date.now(),
        activeId: registry.activeId,
        maxTabs: registry.maxTabs,
        tabs: listTabs(registry).map((t: any) => ({
            id: t.id,
            projectId: t.projectId,
            title: t.title,
            order: t.order,
        })),
    };
}

/**
 * Deserializa registry de session storage.
 * Ignora sessions expiradas (>24h) §RF-6.3.
 *
 * @param {Record<string, any>} snapshot
 * @param {number} [any>]
 * @returns {Object|null}
 */
export function deserializeSession(
    snapshot: Record<string, any>,
    nowMs: number = Date.now(),
): Registry | null {
    if (!snapshot || typeof snapshot !== 'object') return null;
    const age = Number(nowMs) - (Number(snapshot.savedAt) || 0);
    if (age > TAB_CONFIG.SESSION_TTL_MS) return null;
    const registry = createRegistry(snapshot.maxTabs);
    if (!Array.isArray(snapshot.tabs)) return registry;
    for (const raw of snapshot.tabs) {
        const tab = createTab(raw);
        if (tab) {
            registry.tabs.set((tab as any).id, {
                ...tab,
                order: Number.isFinite(raw.order) ? raw.order : registry.tabs.size,
            });
        }
    }
    if (snapshot.activeId && registry.tabs.has(snapshot.activeId)) {
        registry.activeId = snapshot.activeId;
    } else if (registry.tabs.size > 0) {
        registry.activeId = registry.tabs.keys().next().value || null;
    }
    return registry;
}

// ──────────────────────────────────────────────────────────────────────
// Keyboard shortcuts §A11y
// ──────────────────────────────────────────────────────────────────────

/**
 * Ctrl+1..9 → tab index 0..8.
 * @param {string} key - '1'..'9'
 * @returns {number} index, -1 se inválido
 */
export function shortcutKeyToTabIndex(key: string): number {
    if (typeof key !== 'string' || key.length !== 1) return -1;
    const n = parseInt(key, 10);
    if (!Number.isInteger(n) || n < 1 || n > 9) return -1;
    return n - 1;
}

/**
 * Ctrl+Tab → próxima; Ctrl+Shift+Tab → anterior.
 * @param {Record<string, any>} registry
 * @param {'next'|'prev'} any>
 * @returns {string|null} tabId
 */
export function cycleTab(registry: Record<string, any>, direction: 'next' | 'prev'): string | null {
    const tabs = listTabs(registry);
    if (tabs.length === 0) return null;
    const activeIdx = tabs.findIndex((t: any) => t.id === registry.activeId);
    if (activeIdx < 0) return tabs[0].id;
    if (direction === 'next') {
        return tabs[(activeIdx + 1) % tabs.length].id;
    }
    if (direction === 'prev') {
        return tabs[(activeIdx - 1 + tabs.length) % tabs.length].id;
    }
    return null;
}

// ──────────────────────────────────────────────────────────────────────
// Autosave queue §RF-3.2
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide se autosave deve disparar antes de trocar tab.
 * @param {Record<string, any>} tab
 * @returns {boolean}
 */
export function needsAutosaveBeforeSwitch(tab: Record<string, any>): boolean {
    return !!(tab && tab.modified);
}
