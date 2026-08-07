// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   VISIBILITY ENGINE — SPEC_FILTER_RADAR_HUD_001 §S5

   Pure helpers para sincronizar 3D + radar + search:
   - applySearchFilter(query, index) → Set<elementId>
   - applyGroupFilter(visibleGroupIds, elements) → Set<elementId>
   - intersectVisibility(search, group, all) → Set<elementId>
   - computeOpacity(elementId, visible) → {opacity, pulse}

   Não deleta elementos (apenas altera visibility/opacity).
   Elementos filtrados: opacity 0.15 (evita "where did it go?").
   Elementos matching: opacity 1.0 + pulse animation flag.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §S5
// ──────────────────────────────────────────────────────────────────────

export const OPACITY_VISIBLE = 1.0;
export const OPACITY_FILTERED = 0.15;
export const PULSE_SCALE_MIN = 1.0;
export const PULSE_SCALE_MAX = 1.05;
export const PULSE_DURATION_MS = 1000;

export const SEARCH_DEBOUNCE_MS = 150;
export const SEARCH_MIN_CHARS = 1;

export const VISIBILITY_MODES = Object.freeze(['search_only', 'group_only', 'both', 'none']);

// ──────────────────────────────────────────────────────────────────────
// Search filter (text → elementIds)
// ──────────────────────────────────────────────────────────────────────

/**
 * Normaliza query de busca (trim + lowercase + remove acentos).
 * @param query
 * @returns
 */
export function normalizeSearchQuery(query: string): string {
    if (typeof query !== 'string') return '';
    return query
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '');
}

/**
 * Aplica filtro de busca contra searchIndex.
 *
 * @param query
 * @param searchIndex
 * @returns elementIds que matcham
 */
export function applySearchFilter(
    query: string,
    searchIndex: { terms: Array<{ word: string; elementIds: string[]; groupIds?: string[] }> },
): Set<string> {
    const q = normalizeSearchQuery(query);
    if (q.length < SEARCH_MIN_CHARS) return new Set();
    if (!searchIndex || !Array.isArray(searchIndex.terms)) return new Set();

    const matched: Set<string> = new Set();
    for (const term of searchIndex.terms) {
        const word = normalizeSearchQuery(String(term?.word || ''));
        if (word.includes(q) || q.includes(word)) {
            for (const id of term.elementIds || []) {
                if (typeof id === 'string' && id) matched.add(id);
            }
        }
    }
    return matched;
}

// ──────────────────────────────────────────────────────────────────────
// Group filter (visible groups → elementIds)
// ──────────────────────────────────────────────────────────────────────

/**
 * Dado um set de groupIds visíveis + elementGroupIndex (id → {group: bool}),
 * retorna elementIds cujo pelo menos 1 grupo está visível.
 *
 * @param visibleGroupIds
 * @param elementGroupIndex
 * @returns
 */
export function applyGroupFilter(
    visibleGroupIds: Array<string>,
    elementGroupIndex: Record<string, { customGroupIds?: string[] } & Record<string, any>>,
): Set<string> {
    const visible: Set<string> = new Set();
    if (!Array.isArray(visibleGroupIds) || visibleGroupIds.length === 0) return visible;
    if (!elementGroupIndex || typeof elementGroupIndex !== 'object') return visible;

    const visibleSet = new Set(visibleGroupIds);

    for (const [elementId, groups] of Object.entries(elementGroupIndex)) {
        if (!groups || typeof groups !== 'object') continue;
        let hasVisibleGroup = false;

        for (const groupId of visibleSet) {
            if ((groups as any)[groupId] === true) {
                hasVisibleGroup = true;
                break;
            }
            if (Array.isArray(groups.customGroupIds) && groups.customGroupIds.includes(groupId)) {
                hasVisibleGroup = true;
                break;
            }
        }

        if (hasVisibleGroup) visible.add(elementId);
    }
    return visible;
}

// ──────────────────────────────────────────────────────────────────────
// Interseção search ∩ group
// ──────────────────────────────────────────────────────────────────────

/**
 * Interseção de 2 Sets: só elementos presentes em ambos.
 * Empty search → considera todos passam no filtro search.
 * Empty group → considera todos passam no filtro group.
 *
 * @param searchMatched
 * @param groupMatched
 * @param allElementIds
 * @param opts
 * @returns
 */
export function intersectVisibility(
    searchMatched: Set<string>,
    groupMatched: Set<string>,
    allElementIds: Array<string>,
    opts: { searchActive?: boolean; groupActive?: boolean } = {},
): Set<string> {
    const all = new Set(allElementIds || []);
    const searchActive = Boolean(opts?.searchActive);
    const groupActive = Boolean(opts?.groupActive);

    if (!searchActive && !groupActive) return all;
    if (searchActive && !groupActive) {
        return new Set([...searchMatched].filter((id) => all.has(id)));
    }
    if (!searchActive && groupActive) {
        return new Set([...groupMatched].filter((id) => all.has(id)));
    }
    const result: Set<string> = new Set();
    for (const id of searchMatched) {
        if (groupMatched.has(id) && all.has(id)) result.add(id);
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// Opacity + pulse computation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param elementId
 * @param visibleIds
 * @param anyFilterActive
 * @returns
 */
export function computeOpacity(
    elementId: string,
    visibleIds: Set<string>,
    anyFilterActive = true,
): { opacity: number; pulse: boolean } {
    if (!anyFilterActive) {
        return { opacity: OPACITY_VISIBLE, pulse: false };
    }
    if (visibleIds && visibleIds.has(elementId)) {
        return { opacity: OPACITY_VISIBLE, pulse: true };
    }
    return { opacity: OPACITY_FILTERED, pulse: false };
}

/**
 * Computa opacity para todos os elementIds.
 *
 * @param allElementIds
 * @param visibleIds
 * @param anyFilterActive
 * @returns
 */
export function computeVisibilityMap(
    allElementIds: Array<string>,
    visibleIds: Set<string>,
    anyFilterActive: boolean,
): Record<string, { opacity: number; pulse: boolean }> {
    const map: Record<string, { opacity: number; pulse: boolean }> = {};
    if (!Array.isArray(allElementIds)) return map;
    for (const id of allElementIds) {
        if (typeof id !== 'string' || !id) continue;
        map[id] = computeOpacity(id, visibleIds, anyFilterActive);
    }
    return map;
}

// ──────────────────────────────────────────────────────────────────────
// Mode classification
// ──────────────────────────────────────────────────────────────────────

/**
 * @param query
 * @param visibleGroupIds
 * @returns VISIBILITY_MODES
 */
export function classifyVisibilityMode(query: string, visibleGroupIds: Array<string>): string {
    const hasSearch = normalizeSearchQuery(query).length >= SEARCH_MIN_CHARS;
    const hasGroup = Array.isArray(visibleGroupIds) && visibleGroupIds.length > 0;
    if (hasSearch && hasGroup) return 'both';
    if (hasSearch) return 'search_only';
    if (hasGroup) return 'group_only';
    return 'none';
}

// ──────────────────────────────────────────────────────────────────────
// Search index builder (S1 FilterSearchIndex schema)
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói inverted index de palavras → elementIds a partir dos elementos.
 * Indexa: name, parameterType de observations, groupIds.
 *
 * @param elements
 * @returns
 */
export function buildSearchIndex(
    elements: Array<{
        id?: string;
        name?: string;
        groupIds?: string[];
        observations?: Array<{ parameterType?: string }>;
    }>,
): { terms: Array<{ word: string; elementIds: string[]; groupIds: string[] }> } {
    if (!Array.isArray(elements)) return { terms: [] };
    const termsMap: Map<string, { elementIds: Set<string>; groupIds: Set<string> }> = new Map();

    function addTerm(word: string, elementId: string, groupIds?: string[]): void {
        const w = normalizeSearchQuery(word);
        if (w.length < SEARCH_MIN_CHARS) return;
        if (!termsMap.has(w)) termsMap.set(w, { elementIds: new Set(), groupIds: new Set() });
        const entry = termsMap.get(w) as { elementIds: Set<string>; groupIds: Set<string> };
        if (elementId) entry.elementIds.add(elementId);
        if (Array.isArray(groupIds)) groupIds.forEach((g) => entry.groupIds.add(g));
    }

    for (const el of elements) {
        if (!el || typeof el !== 'object' || !el.id) continue;
        if (el.name) addTerm(el.name, el.id, el.groupIds);
        if (Array.isArray(el.observations)) {
            for (const obs of el.observations) {
                if (obs?.parameterType) addTerm(obs.parameterType, el.id, el.groupIds);
            }
        }
    }

    return {
        terms: Array.from(termsMap.entries()).map(([word, entry]) => ({
            word,
            elementIds: Array.from(entry.elementIds),
            groupIds: Array.from(entry.groupIds),
        })),
    };
}
