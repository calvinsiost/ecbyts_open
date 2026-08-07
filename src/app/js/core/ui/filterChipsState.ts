// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Filter Chips State - UX-71
 * Pure-logic filter pills + saved filters (Gmail/Notion-style).
 * Zero DOM. Imutável (frozen).
 */

type FilterOp = 'eq' | 'neq' | 'in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'between';

interface FilterChip {
    id: string;
    fieldKey: string;
    op: FilterOp;
    value: any;
    removable?: boolean;
    label?: string;
}

interface SavedFilter {
    id: string;
    name: string;
    chips: ReadonlyArray<FilterChip>;
    createdAt: number;
    lastUsed: number | null;
}

interface FilterChipsState {
    chips: ReadonlyArray<FilterChip>;
    savedFilters: Map<string, SavedFilter>;
    freeText: string;
}

interface FilterChipsStateInit {
    chips?: Array<FilterChip>;
    savedFilters?: Array<Partial<SavedFilter> & { id: string }>;
    freeText?: string;
}

interface FilterChipsStatePatch {
    chips?: Array<FilterChip>;
    savedFilters?: Map<string, SavedFilter>;
    freeText?: string;
}

const VALID_OPS = new Set(['eq', 'neq', 'in', 'gt', 'lt', 'gte', 'lte', 'contains', 'between']);

function freezeChip(chip: FilterChip): FilterChip {
    return Object.freeze({ ...chip });
}

function freezeSaved(saved: SavedFilter): SavedFilter {
    const copy = { ...saved, chips: saved.chips.map(freezeChip) };
    Object.freeze(copy.chips);
    return Object.freeze(copy);
}

function freezeState(state: FilterChipsState): FilterChipsState {
    Object.freeze(state.chips);
    Object.freeze(state);
    return state;
}

function cloneSaved(savedFilters: Map<string, SavedFilter>): Map<string, SavedFilter> {
    const next: Map<string, SavedFilter> = new Map();
    for (const [k, v] of savedFilters) next.set(k, freezeSaved(v));
    return next;
}

function withState(prev: FilterChipsState, patch: FilterChipsStatePatch): FilterChipsState {
    const next: FilterChipsState = {
        chips: (patch.chips ?? prev.chips).map(freezeChip),
        savedFilters: patch.savedFilters ?? cloneSaved(prev.savedFilters),
        freeText: patch.freeText ?? prev.freeText,
    };
    return freezeState(next);
}

function validateChip(chip: FilterChip): void {
    if (!chip || typeof chip !== 'object') throw new Error('chip must be an object');
    if (typeof chip.id !== 'string' || !chip.id) throw new Error('chip.id required');
    if (typeof chip.fieldKey !== 'string' || !chip.fieldKey) throw new Error('chip.fieldKey required');
    if (!VALID_OPS.has(chip.op)) throw new Error(`invalid op: ${chip.op}`);
    if (chip.op === 'in') {
        if (!Array.isArray(chip.value)) throw new Error("op 'in' requires array value");
    }
    if (chip.op === 'between') {
        if (!Array.isArray(chip.value) || chip.value.length !== 2) {
            throw new Error("op 'between' requires value=[min,max]");
        }
    }
}

export function createFilterChipsState({
    chips = [],
    savedFilters = [],
    freeText = '',
}: FilterChipsStateInit = {}): FilterChipsState {
    const ids: Set<string> = new Set();
    for (const c of chips) {
        validateChip(c);
        if (ids.has(c.id)) throw new Error(`duplicate chip id: ${c.id}`);
        ids.add(c.id);
    }
    const savedMap: Map<string, SavedFilter> = new Map();
    for (const s of savedFilters) {
        if (!s || typeof s.id !== 'string') throw new Error('saved filter requires id');
        savedMap.set(
            s.id,
            freezeSaved({
                id: s.id,
                name: s.name ?? '',
                chips: s.chips ?? [],
                createdAt: s.createdAt ?? 0,
                lastUsed: s.lastUsed ?? null,
            } as SavedFilter),
        );
    }
    return freezeState({
        chips: chips.map((c: FilterChip) => freezeChip({ removable: true, label: '', ...c })),
        savedFilters: savedMap,
        freeText: String(freeText || ''),
    });
}

export function addChip(state: FilterChipsState, chip: FilterChip): FilterChipsState {
    validateChip(chip);
    if (state.chips.some((c: FilterChip) => c.id === chip.id)) {
        throw new Error(`duplicate chip id: ${chip.id}`);
    }
    const next = [...state.chips, { removable: true, label: '', ...chip }];
    return withState(state, { chips: next });
}

export function removeChip(state: FilterChipsState, chipId: string): FilterChipsState {
    const found = state.chips.find((c: FilterChip) => c.id === chipId);
    if (!found) throw new Error(`chip not found: ${chipId}`);
    if (!found.removable) throw new Error(`chip not removable: ${chipId}`);
    return withState(state, {
        chips: state.chips.filter((c: FilterChip) => c.id !== chipId),
    });
}

export function updateChip(
    state: FilterChipsState,
    chipId: string,
    partial: Partial<FilterChip>,
): FilterChipsState {
    const idx = state.chips.findIndex((c: FilterChip) => c.id === chipId);
    if (idx < 0) throw new Error(`chip not found: ${chipId}`);
    const merged = { ...state.chips[idx], ...partial, id: chipId } as FilterChip;
    validateChip(merged);
    const next = state.chips.slice();
    next[idx] = merged;
    return withState(state, { chips: next });
}

export function clearAllChips(state: FilterChipsState): FilterChipsState {
    return withState(state, {
        chips: state.chips.filter((c: FilterChip) => !c.removable),
    });
}

export function setFreeText(state: FilterChipsState, text: string): FilterChipsState {
    return withState(state, { freeText: String(text || '') });
}

export function saveCurrentFilter(
    state: FilterChipsState,
    name: string,
    opts: { id?: string; now?: number } = {},
): { state: FilterChipsState; filterId: string } {
    if (typeof name !== 'string' || !name.trim()) throw new Error('name required');
    const id = opts.id ?? `sf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = opts.now ?? Date.now();
    if (state.savedFilters.has(id)) throw new Error(`saved filter id exists: ${id}`);
    const saved = freezeSaved({
        id,
        name: name.trim(),
        chips: state.chips.map((c: FilterChip) => ({ ...c })),
        createdAt: now,
        lastUsed: null,
    });
    const nextMap = cloneSaved(state.savedFilters);
    nextMap.set(id, saved);
    return { state: withState(state, { savedFilters: nextMap }), filterId: id };
}

export function loadSavedFilter(
    state: FilterChipsState,
    filterId: string,
    now: number = Date.now(),
): FilterChipsState {
    const saved = state.savedFilters.get(filterId);
    if (!saved) throw new Error(`saved filter not found: ${filterId}`);
    const nextMap = cloneSaved(state.savedFilters);
    nextMap.set(filterId, freezeSaved({ ...saved, lastUsed: now }));
    return withState(state, {
        chips: saved.chips.map((c: FilterChip) => ({ ...c })),
        savedFilters: nextMap,
    });
}

export function deleteSavedFilter(state: FilterChipsState, filterId: string): FilterChipsState {
    if (!state.savedFilters.has(filterId)) throw new Error(`saved filter not found: ${filterId}`);
    const nextMap = cloneSaved(state.savedFilters);
    nextMap.delete(filterId);
    return withState(state, { savedFilters: nextMap });
}

export function renameSavedFilter(
    state: FilterChipsState,
    filterId: string,
    newName: string,
): FilterChipsState {
    if (typeof newName !== 'string' || !newName.trim()) throw new Error('newName required');
    const saved = state.savedFilters.get(filterId);
    if (!saved) throw new Error(`saved filter not found: ${filterId}`);
    const nextMap = cloneSaved(state.savedFilters);
    nextMap.set(filterId, freezeSaved({ ...saved, name: newName.trim() }));
    return withState(state, { savedFilters: nextMap });
}

function chipMatches(
    chip: FilterChip,
    item: Record<string, any> | null | undefined,
    fieldGetters: Record<string, (item: any) => any> | undefined,
): boolean {
    const getter = fieldGetters?.[chip.fieldKey];
    const v = getter ? getter(item) : item?.[chip.fieldKey];
    switch (chip.op) {
        case 'eq':
            return v === chip.value;
        case 'neq':
            return v !== chip.value;
        case 'in':
            return chip.value.includes(v);
        case 'gt':
            return v > chip.value;
        case 'lt':
            return v < chip.value;
        case 'gte':
            return v >= chip.value;
        case 'lte':
            return v <= chip.value;
        case 'contains': {
            if (v == null) return false;
            return String(v).toLowerCase().includes(String(chip.value).toLowerCase());
        }
        case 'between': {
            const [min, max] = chip.value;
            return v >= min && v <= max;
        }
        default:
            return false;
    }
}

export function applyFilterToItems(
    items: Array<Record<string, any>>,
    state: FilterChipsState,
    fieldGetters: Record<string, (item: any) => any> = {},
): Array<Record<string, any>> {
    if (!Array.isArray(items)) return [];
    const ft = state.freeText ? state.freeText.toLowerCase() : '';
    const getterKeys = Object.keys(fieldGetters);
    return items.filter((item: Record<string, any>) => {
        for (const chip of state.chips) {
            if (!chipMatches(chip, item, fieldGetters)) return false;
        }
        if (ft) {
            let hit = false;
            const keys = getterKeys.length ? getterKeys : Object.keys(item || {});
            for (const k of keys) {
                const getter = fieldGetters[k];
                const v = getter ? getter(item) : item?.[k];
                if (v != null && String(v).toLowerCase().includes(ft)) {
                    hit = true;
                    break;
                }
            }
            if (!hit) return false;
        }
        return true;
    });
}

export function getActiveChipCount(state: FilterChipsState): number {
    return state.chips.length;
}

export function summarizeFilters(state: FilterChipsState): {
    chipCount: number;
    savedCount: number;
    hasFreeText: boolean;
    mostRecentSaved: { id: string; name: string; lastUsed: number } | null;
} {
    let mostRecent: SavedFilter | null = null;
    for (const s of state.savedFilters.values()) {
        if (s.lastUsed != null) {
            if (!mostRecent || (mostRecent.lastUsed != null && s.lastUsed > mostRecent.lastUsed)) {
                mostRecent = s;
            }
        }
    }
    return {
        chipCount: state.chips.length,
        savedCount: state.savedFilters.size,
        hasFreeText: state.freeText.length > 0,
        mostRecentSaved:
            mostRecent && mostRecent.lastUsed != null
                ? { id: mostRecent.id, name: mostRecent.name, lastUsed: mostRecent.lastUsed }
                : null,
    };
}
