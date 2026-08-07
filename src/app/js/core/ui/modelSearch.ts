// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-46 - Model Search Engine (pure-logic, zero DOM).
 *
 * Motor de busca textual sobre items do modelo (elementos, observações,
 * campanhas, notas). Estado imutável; índice invertido token→Set<itemId>
 * pré-computado para lookup O(1) por token.
 *
 * @module core/ui/modelSearch
 */

const STOPWORDS = new Set(['de', 'da', 'do', 'a', 'o', 'e', 'to', 'of', 'the', 'and', 'in']);
const VALID_TYPES = ['element', 'observation', 'campaign', 'note'];
const MIN_TOKEN_LEN = 2;

/**
 * Tokenize a string: lowercase, split on whitespace/punctuation,
 * drop stopwords and tokens shorter than MIN_TOKEN_LEN.
 * @param {string} text
 * @returns {string[]}
 */
export function tokenize(text: string): string[] {
    if (text === null || text === undefined) return [];
    const str = String(text).toLowerCase();
    const raw = str.split(/[\s\-_,.;:/]+/).filter(Boolean);
    return raw.filter((t) => t.length >= MIN_TOKEN_LEN && !STOPWORDS.has(t));
}

function collectTokensForItem(item: any): string[] {
    const fields: string[] = [];
    if (item.name) fields.push(...tokenize(item.name));
    if (item.description) fields.push(...tokenize(item.description));
    if (Array.isArray(item.tags)) {
        for (const tag of item.tags) fields.push(...tokenize(tag));
    }
    if (item.familyId) fields.push(...tokenize(item.familyId));
    return fields;
}

function validateItem(item: any): void {
    if (!item || typeof item !== 'object') throw new Error('modelSearch: item must be object');
    if (!item.id) throw new Error('modelSearch: item.id required');
    if (!VALID_TYPES.includes(item.type)) {
        throw new Error(`modelSearch: invalid item.type "${item.type}"`);
    }
}

/**
 * Build a frozen search index from a list of items.
 * @param {Array<any>} items
 * @returns {any}
 */
export function createSearchIndex(items: any[]): any {
    if (!Array.isArray(items)) throw new Error('modelSearch: items must be array');
    const byId = new Map();
    const index = new Map();
    const list: any[] = [];
    for (const item of items) {
        validateItem(item);
        if (byId.has(item.id)) throw new Error(`modelSearch: duplicate id "${item.id}"`);
        const frozen = Object.freeze({ ...item, tags: Object.freeze([...(item.tags || [])]) });
        byId.set(frozen.id, frozen);
        list.push(frozen);
        const tokens = new Set(collectTokensForItem(frozen));
        for (const tok of tokens) {
            if (!index.has(tok)) index.set(tok, new Set());
            index.get(tok).add(frozen.id);
        }
    }
    return Object.freeze({ items: Object.freeze(list), byId, index });
}

/**
 * Add an item to an existing index, returning a new frozen state.
 * @param {object} state
 * @param {object} item
 */
export function addItemToIndex(state: any, item: any): any {
    validateItem(item);
    if (state.byId.has(item.id)) throw new Error(`modelSearch: duplicate id "${item.id}"`);
    const newById = new Map(state.byId);
    const newIndex = new Map();
    for (const [tok, set] of state.index.entries()) newIndex.set(tok, new Set(set));
    const frozen = Object.freeze({ ...item, tags: Object.freeze([...(item.tags || [])]) });
    newById.set(frozen.id, frozen);
    const tokens = new Set(collectTokensForItem(frozen));
    for (const tok of tokens) {
        if (!newIndex.has(tok)) newIndex.set(tok, new Set());
        newIndex.get(tok).add(frozen.id);
    }
    const newList = Object.freeze([...state.items, frozen]);
    return Object.freeze({ items: newList, byId: newById, index: newIndex });
}

/**
 * Remove an item from index, returning new frozen state.
 * @param {object} state
 * @param {string} itemId
 */
export function removeItemFromIndex(state: any, itemId: any): any {
    if (!state.byId.has(itemId)) return state;
    const newById = new Map(state.byId);
    newById.delete(itemId);
    const newIndex = new Map();
    for (const [tok, set] of state.index.entries()) {
        const ns = new Set(set);
        ns.delete(itemId);
        if (ns.size > 0) newIndex.set(tok, ns);
    }
    const newList = Object.freeze(state.items.filter((it: any) => it.id !== itemId));
    return Object.freeze({ items: newList, byId: newById, index: newIndex });
}

function scoreItem(
    item: any,
    queryTokens: any,
    rawQuery: any,
): { score: number; matchedFields: string[] } {
    let score = 0;
    const matched = new Set<string>();
    const nameLc = (item.name || '').toLowerCase();
    const descLc = (item.description || '').toLowerCase();
    const tagsLc = (item.tags || []).map((t: any) => String(t as any).toLowerCase());
    const familyLc = (item.familyId || '').toLowerCase();
    const q = rawQuery.toLowerCase().trim();

    if (q && nameLc === q) {
        score += 10;
        matched.add('name');
    } else if (q && nameLc.includes(q)) {
        score += 5;
        matched.add('name');
    } else {
        const nameTokens = new Set(tokenize(item.name || ''));
        for (const qt of queryTokens) {
            if (nameTokens.has(qt) || nameLc.includes(qt)) {
                score += 5;
                matched.add('name');
                break;
            }
        }
    }
    for (const qt of queryTokens) {
        if (tagsLc.some((t: any) => t === qt || t.includes(qt))) {
            score += 4;
            matched.add('tags');
            break;
        }
    }
    for (const qt of queryTokens) {
        if (descLc.includes(qt)) {
            score += 2;
            matched.add('description');
            break;
        }
    }
    for (const qt of queryTokens) {
        if (familyLc && (familyLc === qt || familyLc.includes(qt))) {
            score += 1;
            matched.add('family');
            break;
        }
    }
    return { score, matchedFields: [...matched] };
}

/**
 * Search the index. Returns array of {item, score, matchedFields} ordered by score desc.
 * Multi-token query: AND - every token must appear in some searchable field.
 * @param {object} state
 * @param {string} query
 * @param {{limit?:number, types?:string[]}} [opts]
 */
export function search(
    state: any,
    query: string,
    opts: { limit?: number; types?: string[] } = {},
): any[] {
    const limit = typeof opts.limit === 'number' ? opts.limit : 50;
    const types = opts.types || VALID_TYPES;
    if (!Array.isArray(types)) throw new Error('modelSearch: opts.types must be array');
    for (const t of types) {
        if (!VALID_TYPES.includes(t)) throw new Error(`modelSearch: invalid type "${t}"`);
    }
    if (!query || !String(query).trim()) return [];
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const typeSet = new Set(types);
    const results: any[] = [];
    for (const item of state.items) {
        if (!typeSet.has(item.type)) continue;
        // AND semantics: every query token must appear somewhere
        const itemTokens = new Set(collectTokensForItem(item));
        const allTokensMatch = queryTokens.every((qt) => {
            if (itemTokens.has(qt)) return true;
            // substring fallback for partial matches (e.g. "wel" → "well")
            for (const it of itemTokens) if (it.includes(qt)) return true;
            const nameLc = (item.name || '').toLowerCase();
            const descLc = (item.description || '').toLowerCase();
            return nameLc.includes(qt) || descLc.includes(qt);
        });
        if (!allTokensMatch) continue;
        const { score, matchedFields } = scoreItem(item, queryTokens, query);
        if (score > 0) results.push({ item, score, matchedFields });
    }
    results.sort((a, b) => b.score - a.score || String(a.item.id).localeCompare(String(b.item.id)));
    return results.slice(0, limit);
}

/**
 * Search filtered to a single type.
 */
export function searchByType(state: any, type: any, query: any): any[] {
    if (!VALID_TYPES.includes(type)) throw new Error(`modelSearch: invalid type "${type}"`);
    return search(state, query, { types: [type] });
}

/**
 * Suggest tokens from the index that start with the given prefix.
 * @param {object} state
 * @param {string} prefix
 * @param {number} [limit=10]
 */
export function getSuggestions(state: any, prefix: string, limit = 10): string[] {
    if (!prefix) return [];
    const p = String(prefix).toLowerCase();
    const matches: string[] = [];
    for (const tok of state.index.keys()) {
        if (tok.startsWith(p)) matches.push(tok);
    }
    matches.sort();
    return matches.slice(0, limit);
}

/**
 * Summarize the index for diagnostics.
 */
export function summarizeIndex(state: any): { itemCount: number; tokenCount: number; avgTokensPerItem: number } {
    const itemCount = state.items.length;
    const tokenCount = state.index.size;
    let totalTokens = 0;
    for (const item of state.items) {
        totalTokens += new Set(collectTokensForItem(item)).size;
    }
    const avgTokensPerItem = itemCount === 0 ? 0 : totalTokens / itemCount;
    return { itemCount, tokenCount, avgTokensPerItem };
}
