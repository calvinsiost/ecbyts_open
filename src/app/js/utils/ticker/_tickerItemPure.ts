// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (utils/ticker/manager).
//
// Aplicação direta: utils/ticker/manager.ts (775L) tem padrão CRUD/normalize
// idêntico a calculator/manager.ts (514L → 467L pós-adoção c0dd3f7f). Extrair
// pure CRUD libera DRY interno + tests mock-friendly.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Segue padrão dos 7 Modules C anteriores
// (permissions, calculator, scenes, libraries, campaigns, edgeGraph, exportPure).
//
// Spec NOT:
// - NÃO ler module state (tickerConfig — caller passa items[])
// - NÃO usar nextId++ — caller injeta id ou ID generator (DI)
// - NÃO persistir (persist é side-effect — caller chama)
// - NÃO emoji
//
// Extracted helpers:
//   - TickerFilter / TickerItem (canonical types)
//   - ReorderDirection
//   - TICKER_ITEM_DEFAULTS                 (frozen shape sem id)
//   - VALID_TICKER_CALCULATIONS            (frozen list)
//   - createTickerItem(id, partial)        pure factory (DI id)
//   - cloneTickerItem(item, newId)         pure deep clone
//   - reorderTickerItemsArray(items, id, direction)  pure swap → new array
//   - serializeTickerItemsForExport(items) pure deep copy
//   - createTickerId(counter)              pure ID generator
//   - isValidTickerItem(value)             type-guard

export type ReorderDirection = 'up' | 'down';

export interface TickerFilter {
    dimension?: string;
    operator?: string;
    value?: unknown;
    [key: string]: unknown;
}

export interface TickerItem {
    id: string;
    label: string;
    suffix: string;
    filters: TickerFilter[];
    calculation: string;
    campaignA: string | null;
    campaignB: string | null;
    unitId: string | null;
    precision: number;
    color: string;
    enabled: boolean;
    [key: string]: unknown;
}

export type TickerItemPartial = Partial<TickerItem>;

/**
 * Frozen default fields para TickerItem (sem id — caller injeta).
 * Matches addTickerItem default shape @ ticker/manager.ts:105-117.
 */
export const TICKER_ITEM_DEFAULTS: Readonly<Omit<TickerItem, 'id'>> = Object.freeze({
    label: '',
    suffix: '',
    filters: [] as TickerFilter[],
    calculation: 'average',
    campaignA: null,
    campaignB: null,
    unitId: null,
    precision: 2,
    color: '',
    enabled: true,
});

/**
 * Frozen list of valid calculation kinds (mesmas do calculator).
 */
export const VALID_TICKER_CALCULATIONS: ReadonlyArray<string> = Object.freeze([
    'average',
    'sum',
    'min',
    'max',
    'count',
    'median',
    'stddev',
    'percentile',
    'custom',
]);

/**
 * Pure ID generator — returns next id and updated counter.
 * Matches `id: 'ticker-' + (nextId++)` pattern @ ticker/manager.ts:106, 160.
 */
export function createTickerId(counter: number): { id: string; nextCounter: number } {
    const safe = Number.isFinite(counter) && counter >= 0 ? Math.floor(counter) : 0;
    const next = safe + 1;
    return { id: `ticker-${next}`, nextCounter: next };
}

/**
 * Create new ticker item from partial + caller-injected id.
 * Matches addTickerItem body @ ticker/manager.ts:104-122 sem persist/push.
 */
export function createTickerItem(id: string, partial: TickerItemPartial = {}): TickerItem {
    return {
        ...TICKER_ITEM_DEFAULTS,
        ...partial,
        id,
        // Preserva filters array (evita aliasing do frozen template).
        filters: Array.isArray(partial.filters) ? partial.filters.map((f) => ({ ...f })) : [],
    } as TickerItem;
}

/**
 * Deep clone ticker item com novo id.
 * Matches duplicateTickerItem body @ ticker/manager.ts:154-165 sem push/persist.
 */
export function cloneTickerItem(item: TickerItem, newId: string): TickerItem {
    return {
        ...item,
        id: newId,
        filters: Array.isArray(item.filters) ? item.filters.map((f) => ({ ...f })) : [],
    };
}

/**
 * Pure reorder: returns new array (não muta input).
 * Matches reorderTickerItem swap @ ticker/manager.ts:174-185 (pure version).
 */
export function reorderTickerItemsArray<T extends { id: string }>(
    items: ReadonlyArray<T>,
    id: string,
    direction: ReorderDirection,
): T[] {
    const arr = items.slice();
    const idx = arr.findIndex((i) => i.id === id);
    if (idx === -1) return arr;
    const target = direction === 'up' ? idx - 1 : idx + 1;
    if (target < 0 || target >= arr.length) return arr;
    const tmp = arr[idx] as T;
    arr[idx] = arr[target] as T;
    arr[target] = tmp;
    return arr;
}

/**
 * Pure deep copy of ticker items array (filters cloned per item).
 * Útil para export/serialização sem aliasing.
 */
export function serializeTickerItemsForExport(items: ReadonlyArray<TickerItem>): TickerItem[] {
    return items.map((item) => ({
        ...item,
        filters: Array.isArray(item.filters) ? item.filters.map((f) => ({ ...f })) : [],
    }));
}

/**
 * Type-guard for TickerItem shape (boundary validation).
 */
export function isValidTickerItem(value: unknown): value is TickerItem {
    if (!value || typeof value !== 'object') return false;
    const v = value as TickerItem;
    if (typeof v.id !== 'string' || v.id.length === 0) return false;
    if (typeof v.calculation !== 'string') return false;
    if (!Array.isArray(v.filters)) return false;
    return true;
}

/**
 * Validate ReorderDirection input.
 */
export function isValidReorderDirection(value: unknown): value is ReorderDirection {
    return value === 'up' || value === 'down';
}
