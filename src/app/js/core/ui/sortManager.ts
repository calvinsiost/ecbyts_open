// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-85 Sort Manager - pure-logic, zero DOM
 *
 * Modelo de configuração e aplicação de ordenação multi-key com
 * tie-breakers, comparators customizados e null handling explícito.
 *
 * State imutável:
 *   { keys: SortKey[], customComparators: Map<id, fn> }
 *
 * SortKey: { field, dir:'asc'|'desc', nullsFirst:boolean, comparatorId?:string|null }
 */

interface SortKey {
    field: string;
    dir: 'asc' | 'desc';
    nullsFirst?: boolean;
    comparatorId?: string | null;
}

type CompareFn = (a: unknown, b: unknown) => number;

interface SortState {
    keys: SortKey[];
    customComparators: Map<string, CompareFn>;
}

const VALID_DIRS = new Set(['asc', 'desc']);

/**
 * Congela state preservando Map.
 */
function freezeState(state: SortState): SortState {
    Object.freeze(state.keys);
    state.keys.forEach((k: SortKey) => Object.freeze(k));
    return Object.freeze(state);
}

function cloneState(state: SortState): SortState {
    return {
        keys: state.keys.map((k: SortKey) => ({ ...k })),
        customComparators: new Map(state.customComparators),
    };
}

function validateKey(key: unknown): void {
    if (!key || typeof key !== 'object') {
        throw new Error('SortKey must be an object');
    }
    const k = key as Record<string, unknown>;
    if (typeof k.field !== 'string' || k.field.length === 0) {
        throw new Error('SortKey.field must be a non-empty string');
    }
    if (!VALID_DIRS.has(k.dir as string)) {
        throw new Error(`SortKey.dir must be 'asc' or 'desc', got: ${k.dir}`);
    }
}

function normalizeKey(key: SortKey): SortKey {
    return {
        field: key.field,
        dir: key.dir,
        nullsFirst: key.nullsFirst === true,
        comparatorId: key.comparatorId || null,
    };
}

/**
 * Cria sort manager state inicial (frozen).
 */
export function createSortManager(initialKeys: SortKey[] = []): SortState {
    if (!Array.isArray(initialKeys)) {
        throw new Error('initialKeys must be an array');
    }
    const seen = new Set<string>();
    const keys = initialKeys.map((k: SortKey) => {
        validateKey(k);
        if (seen.has(k.field)) {
            throw new Error(`Duplicate field in initialKeys: ${k.field}`);
        }
        seen.add(k.field);
        return normalizeKey(k);
    });
    return freezeState({
        keys,
        customComparators: new Map(),
    });
}

export function addSortKey(state: SortState, key: SortKey): SortState {
    validateKey(key);
    if (state.keys.some((k: SortKey) => k.field === key.field)) {
        throw new Error(`Field already in sort keys: ${key.field}`);
    }
    const next = cloneState(state);
    next.keys.push(normalizeKey(key));
    return freezeState(next);
}

export function removeSortKey(state: SortState, field: string): SortState {
    if (typeof field !== 'string' || field.length === 0) {
        throw new Error('field must be a non-empty string');
    }
    const next = cloneState(state);
    next.keys = next.keys.filter((k: SortKey) => k.field !== field);
    return freezeState(next);
}

export function updateSortKey(state: SortState, field: string, partial: Partial<SortKey>): SortState {
    if (typeof field !== 'string' || field.length === 0) {
        throw new Error('field must be a non-empty string');
    }
    if (!partial || typeof partial !== 'object') {
        throw new Error('partial must be an object');
    }
    const idx = state.keys.findIndex((k: SortKey) => k.field === field);
    if (idx === -1) {
        throw new Error(`Field not found: ${field}`);
    }
    const cur = state.keys[idx] as SortKey;
    const merged = { ...cur, ...partial, field: cur.field };
    validateKey(merged);
    const next = cloneState(state);
    next.keys[idx] = normalizeKey(merged);
    return freezeState(next);
}

export function clearSort(state: SortState): SortState {
    const next = cloneState(state);
    next.keys = [];
    return freezeState(next);
}

export function reorderKey(state: SortState, field: string, newIndex: number): SortState {
    const idx = state.keys.findIndex((k: SortKey) => k.field === field);
    if (idx === -1) {
        throw new Error(`Field not found: ${field}`);
    }
    if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= state.keys.length) {
        throw new Error(`newIndex out of bounds: ${newIndex}`);
    }
    const next = cloneState(state);
    const [item] = next.keys.splice(idx, 1);
    next.keys.splice(newIndex, 0, item as SortKey);
    return freezeState(next);
}

export function registerComparator(state: SortState, id: string, fn: CompareFn): SortState {
    if (typeof id !== 'string' || id.length === 0) {
        throw new Error('id must be a non-empty string');
    }
    if (typeof fn !== 'function') {
        throw new Error('fn must be a function');
    }
    if (state.customComparators.has(id)) {
        throw new Error(`Comparator already registered: ${id}`);
    }
    const next = cloneState(state);
    next.customComparators.set(id, fn);
    return freezeState(next);
}

export function unregisterComparator(state: SortState, id: string): SortState {
    const next = cloneState(state);
    next.customComparators.delete(id);
    return freezeState(next);
}

/**
 * Default type-aware comparator.
 */
function defaultCompare(a: unknown, b: unknown): number {
    // Type detection - prefer Date, then number, boolean, string.
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() - b.getTime();
    }
    if (typeof a === 'number' && typeof b === 'number') {
        if (Number.isNaN(a) && Number.isNaN(b)) return 0;
        if (Number.isNaN(a)) return 1;
        if (Number.isNaN(b)) return -1;
        return a < b ? -1 : a > b ? 1 : 0;
    }
    if (typeof a === 'boolean' && typeof b === 'boolean') {
        return a === b ? 0 : a ? 1 : -1;
    }
    // Fallback: string locale-aware
    const sa = String(a);
    const sb = String(b);
    return sa.localeCompare(sb);
}

function isNullish(v: unknown): boolean {
    return v === null || v === undefined;
}

function resolveNullCompare(aNull: boolean, bNull: boolean, nullsFirst: boolean): number | null {
    if (aNull && bNull) return 0;
    if (aNull) return nullsFirst ? -1 : 1;
    if (bNull) return nullsFirst ? 1 : -1;
    return null;
}

function resolveValueCompare(
    state: SortState,
    key: SortKey,
    va: unknown,
    vb: unknown,
): number {
    if (key.comparatorId) {
        const fn = state.customComparators.get(key.comparatorId);
        if (!fn) {
            throw new Error(`Comparator not registered: ${key.comparatorId}`);
        }
        return fn(va, vb);
    }
    return defaultCompare(va, vb);
}

function applyDirection(cmp: number, dir: 'asc' | 'desc'): number {
    if (cmp === 0) return 0;
    const signed = dir === 'desc' ? -cmp : cmp;
    return signed < 0 ? -1 : 1;
}

/**
 * Compara dois itens segundo state.keys em ordem. Retorna -1/0/1.
 */
export function compareItems(
    state: SortState,
    itemA: unknown,
    itemB: unknown,
    fieldGetters: Record<string, (item: unknown) => unknown> = {},
): number {
    for (const key of state.keys) {
        const getter =
            fieldGetters[key.field] ||
            ((item: unknown) =>
                item == null ? undefined : (item as Record<string, unknown>)[key.field]);
        const va = getter(itemA);
        const vb = getter(itemB);

        const aNull = isNullish(va);
        const bNull = isNullish(vb);
        const nullCmp = resolveNullCompare(aNull, bNull, key.nullsFirst === true);

        if (nullCmp !== null) {
            if (nullCmp !== 0) return nullCmp;
            continue;
        }

        const cmp = resolveValueCompare(state, key, va, vb);
        if (cmp !== 0) {
            return applyDirection(cmp, key.dir);
        }
    }
    return 0;
}

/**
 * Sort estável (Array.prototype.sort em V8/SpiderMonkey é estável desde 2019).
 * Para garantir estabilidade absoluta cross-engine, usa decorate-sort-undecorate.
 */
export function sortItems(
    items: unknown[],
    state: SortState,
    fieldGetters: Record<string, (item: unknown) => unknown> = {},
): unknown[] {
    if (!Array.isArray(items)) {
        throw new Error('items must be an array');
    }
    if (state.keys.length === 0) {
        return items.slice();
    }
    const decorated = items.map((item: unknown, idx: number) => ({ item, idx }));
    decorated.sort((a: { item: unknown; idx: number }, b: { item: unknown; idx: number }) => {
        const cmp = compareItems(state, a.item, b.item, fieldGetters);
        if (cmp !== 0) return cmp;
        return a.idx - b.idx;
    });
    return decorated.map((d: { item: unknown; idx: number }) => d.item);
}

export function getSortDescription(state: SortState): string {
    if (state.keys.length === 0) return '(no sort)';
    return state.keys.map((k: SortKey) => `${k.field} ${k.dir}`).join(', ');
}

export function summarizeSort(state: SortState): {
    keyCount: number;
    comparatorCount: number;
    primaryField: string | null;
    primaryDir: string | null;
} {
    const primary = state.keys[0] || null;
    return {
        keyCount: state.keys.length,
        comparatorCount: state.customComparators.size,
        primaryField: primary ? primary.field : null,
        primaryDir: primary ? primary.dir : null,
    };
}
