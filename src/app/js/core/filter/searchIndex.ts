// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * FEAT-FILTER-RADAR-001 - Search index (Phase 1 pure logic)
 * Builds a text index over element names + parameter names for synchronized
 * 3D+radar filtering. Debounce (300ms) is caller's responsibility.
 * @module core/filter/searchIndex
 */

import { matchParameterToGroups } from './aggregationEngine.js';

interface SearchIndexEntry {
    elementIds: Set<string>;
    groupIds: Set<string>;
}

type SearchIndex = Map<string, SearchIndexEntry>;

interface IndexableElement {
    id: string;
    name?: string;
    label?: string;
    observations?: Array<{ parameterName?: string; parameter?: string }>;
}

/**
 * Tokenize a string into lowercase words (min 2 chars, alphanumeric only).
 */
export function tokenize(text: string): string[] {
    return String(text || '')
        .toLowerCase()
        .split(/[^a-z0-9áéíóúâêîôûãõàèìòùçñ]+/)
        .filter((t) => t.length >= 2);
}

/**
 * Build a text search index from elements.
 * Index structure: Map<token, {elementIds: Set<string>, groupIds: Set<string>}>
 */
export function buildSearchIndex(elements: IndexableElement[]): SearchIndex {
    const index: SearchIndex = new Map();

    function add(token: any, elementId: any, groupIds: any): void {
        if (!index.has(token)) index.set(token, { elementIds: new Set(), groupIds: new Set() });
        const entry = index.get(token) as SearchIndexEntry;
        entry.elementIds.add(elementId);
        for (const gid of groupIds) entry.groupIds.add(gid);
    }

    for (const el of elements) {
        const nameTokens = tokenize(el.name ?? el.label ?? el.id ?? '');
        for (const t of nameTokens) add(t, el.id, []);

        for (const obs of el.observations ?? []) {
            const paramName = obs.parameterName ?? obs.parameter ?? '';
            const paramTokens = tokenize(paramName);
            const matchedGroups = matchParameterToGroups(paramName);
            for (const t of paramTokens) add(t, el.id, matchedGroups);
        }
    }

    return index;
}

/**
 * Query the search index. Returns elements and groups matching the query.
 * Multi-token queries use AND logic (element must match ALL tokens).
 */
export function searchFilter(
    index: SearchIndex,
    query: string,
): { elementIds: string[]; groupIds: string[]; isEmpty: boolean } {
    const tokens = tokenize(query);
    if (tokens.length === 0) return { elementIds: [], groupIds: [], isEmpty: true };

    let elementIds: Set<string> | null = null;
    const groupIds = new Set<string>();

    for (const token of tokens) {
        const matches = _prefixMatches(index, token);
        const ids = new Set<string>();
        for (const entry of matches) {
            for (const eid of entry.elementIds) ids.add(eid);
            for (const gid of entry.groupIds) groupIds.add(gid);
        }
        // AND: intersect with running set
        elementIds = elementIds === null ? ids : _intersect(elementIds, ids);
    }

    return {
        elementIds: elementIds ? [...elementIds] : [],
        groupIds: [...groupIds],
        isEmpty: false,
    };
}

/**
 * Incrementally update the index for a subset of changed elements.
 * Removes stale entries for changed elementIds, then re-adds.
 *
 * @returns mutated index (same reference)
 */
export function updateSearchIndex(
    index: SearchIndex,
    changedElements: Array<{ id: string; name?: string; label?: string; observations?: Array<any> }>,
): SearchIndex {
    const changedIds = new Set(changedElements.map((e) => e.id));

    // Remove stale entries
    for (const [token, entry] of index) {
        for (const eid of changedIds) entry.elementIds.delete(eid);
        // Rebuild groupIds from remaining elementIds (conservative: clear + rebuild)
        if (entry.elementIds.size === 0) index.delete(token);
    }

    // Re-index changed elements
    const patch = buildSearchIndex(changedElements as IndexableElement[]);
    for (const [token, patchEntry] of patch) {
        if (!index.has(token)) index.set(token, { elementIds: new Set(), groupIds: new Set() });
        const entry = index.get(token) as { elementIds: Set<string>; groupIds: Set<string> };
        for (const eid of patchEntry.elementIds) entry.elementIds.add(eid);
        for (const gid of patchEntry.groupIds) entry.groupIds.add(gid);
    }

    return index;
}

// --- private helpers ---

/** Collect all index entries whose token starts with the given prefix. */
function _prefixMatches(index: any, prefix: any): SearchIndexEntry[] {
    const results: SearchIndexEntry[] = [];
    for (const [token, entry] of index) {
        if (token.startsWith(prefix)) results.push(entry);
    }
    return results;
}

function _intersect(a: any, b: any): Set<string> {
    const result = new Set<string>();
    for (const v of a) {
        if (b.has(v)) result.add(v);
    }
    return result;
}
