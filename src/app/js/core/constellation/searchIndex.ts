// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Search Index - Phase 1.15 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S15
 *
 * Phase 1.15 (2026-05-01) - pure-logic engine de busca fuzzy sobre
 * nodes da constelação. Permite buscar por name/tag/attribute com
 * ranking ponderado, sem dependência de browser/Lunr/FlexSearch.
 *
 * Estratégia:
 *   - Tokenização simples (lowercase, split por whitespace+punct)
 *   - Score: substring (1.0), prefix (0.8), fuzzy levenshtein-like (0.5)
 *   - Indexação opcional para queries repetidas
 *   - Filtros: por field name, mínimo de score, top N
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Match types canônicos. */
export const MATCH_TYPES = Object.freeze(['exact', 'substring', 'prefix', 'fuzzy', 'none']);

/** Score weights (frozen). */
export const SCORE_WEIGHTS = Object.freeze({
    exact: 1.0,
    substring: 0.7,
    prefix: 0.85,
    fuzzy: 0.5,
    none: 0,
});

/** Identidade do módulo. */
export const SEARCH_INDEX_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.15',
    deliveredAt: '2026-05-01',
    matchTypes: MATCH_TYPES,
});

/**
 * Normaliza string para comparação (lowercase, trim).
 *
 * @param {string} s
 * @returns {string}
 */
export function normalize(s: string): string {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().trim();
}

/**
 * Tokeniza string em palavras (split por whitespace + punctuation).
 *
 * @param {string} s
 * @returns {Array<string>}
 */
export function tokenize(s: string): Array<string> {
    if (typeof s !== 'string') return [];
    return s
        .toLowerCase()
        .split(/[\s,.;:!?\-_/\\(){}[\]<>'"]+/)
        .filter((t) => t.length > 0);
}

/**
 * Edit distance (Levenshtein simplificado).
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function editDistance(a: string, b: string): number {
    if (typeof a !== 'string' || typeof b !== 'string') return Infinity;
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    let prev = new Array(b.length + 1);
    let curr = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;

    for (let i = 1; i <= a.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
        }
        [prev, curr] = [curr, prev];
    }
    return prev[b.length];
}

/**
 * Compara query contra texto e retorna match type + score.
 *
 * @param {string} query
 * @param {string} text
 * @returns {{type: string, score: number}}
 */
export function matchString(query: string, text: string): { type: string; score: number } {
    const q = normalize(query);
    const t = normalize(text);
    if (!q || !t) return Object.freeze({ type: 'none', score: 0 });
    if (q === t) return Object.freeze({ type: 'exact', score: SCORE_WEIGHTS.exact });
    if (t.startsWith(q)) return Object.freeze({ type: 'prefix', score: SCORE_WEIGHTS.prefix });
    if (t.includes(q)) return Object.freeze({ type: 'substring', score: SCORE_WEIGHTS.substring });
    // Fuzzy: edit distance ≤ 25% of query length
    const dist = editDistance(q, t);
    const threshold = Math.max(1, Math.floor(q.length * 0.25));
    if (dist <= threshold) {
        const ratio = 1 - dist / Math.max(q.length, t.length);
        return Object.freeze({
            type: 'fuzzy',
            score: SCORE_WEIGHTS.fuzzy * ratio,
        });
    }
    return Object.freeze({ type: 'none', score: 0 });
}

/**
 * Busca query em nó (campos name + tags + attributes).
 *
 * @param {Record<string, any>} node
 * @param {string} query
 * @param {object} [options]
 * @param {Array<string>} [options.fields]
 * @returns {{score: number, matches: ReadonlyArray<any>}}
 */
export function scoreNode(
    node: Record<string, any>,
    query: string,
    options: { fields?: Array<string> } = {},
): { score: number; matches: ReadonlyArray<any> } {
    if (!node || typeof node !== 'object' || !query) {
        return Object.freeze({ score: 0, matches: Object.freeze([]) });
    }
    const fields =
        Array.isArray(options.fields) && options.fields.length > 0 ? options.fields : ['name', 'title', 'description'];

    const matches = [];
    let bestScore = 0;

    for (const field of fields) {
        const val = node[field];
        if (typeof val !== 'string') continue;
        const m = matchString(query, val);
        if (m.score > 0) {
            matches.push(Object.freeze({ field, type: m.type, score: m.score }));
            if (m.score > bestScore) bestScore = m.score;
        }
    }

    // Tags array
    if (Array.isArray(node.tags)) {
        for (const tag of node.tags) {
            const m = matchString(query, String(tag));
            if (m.score > 0) {
                matches.push(Object.freeze({ field: 'tag', type: m.type, score: m.score }));
                if (m.score > bestScore) bestScore = m.score;
            }
        }
    }

    return Object.freeze({ score: bestScore, matches: Object.freeze(matches) });
}

/**
 * Busca nodes contra query, retorna top N por score.
 *
 * @param {Array<Record<string, any>>} nodes
 * @param {string} query
 * @param {object} [options]
 * @param {Array<string>} [options.fields]
 * @param {number} [options.minScore]
 * @param {number} [options.topN]
 * @returns {Array<{node: any, score: number, matches: any}>}
 */
export function searchNodes(
    nodes: Array<Record<string, any>>,
    query: string,
    options: { fields?: Array<string>; minScore?: number; topN?: number } = {},
): Array<{ node: any; score: number; matches: any }> {
    if (!Array.isArray(nodes) || !query) return [];
    const minScore: number = Number.isFinite(options.minScore) ? (options.minScore as number) : 0.3;
    const topN: number =
        Number.isInteger(options.topN) && (options.topN as number) > 0 ? (options.topN as number) : 20;

    const results = [];
    for (const node of nodes) {
        if (!node) continue;
        const r = scoreNode(node, query, options);
        if (r.score >= minScore) {
            results.push(Object.freeze({ node, score: r.score, matches: r.matches }));
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
}

function _indexNodeTokens(nodeId: any, text: string, tokenMap: Map<string, Set<any>>): void {
    for (const tok of tokenize(text)) {
        if (!tokenMap.has(tok)) tokenMap.set(tok, new Set());
        tokenMap.get(tok)!.add(nodeId);
    }
}

function _indexNode(
    node: Record<string, any>,
    fields: string[],
    tokenMap: Map<string, Set<any>>,
    nodeMap: Map<any, Record<string, any>>,
): void {
    if (!node || !node.id) return;
    nodeMap.set(node.id, node);
    for (const field of fields) {
        const val = node[field];
        if (typeof val !== 'string') continue;
        _indexNodeTokens(node.id, val, tokenMap);
    }
    if (Array.isArray(node.tags)) {
        for (const tag of node.tags) {
            _indexNodeTokens(node.id, String(tag), tokenMap);
        }
    }
}

function _resolveCandidateIds(queryTokens: string[], tokenMap: Map<string, Set<any>>): Set<any> {
    const candidateIds = new Set<any>();
    for (const qt of queryTokens) {
        if (tokenMap.has(qt)) {
            for (const id of tokenMap.get(qt)!) candidateIds.add(id);
        } else {
            for (const [tok, ids] of tokenMap.entries()) {
                if (tok.startsWith(qt) || tok.includes(qt)) {
                    for (const id of ids) candidateIds.add(id);
                }
            }
        }
    }
    return candidateIds;
}

function _scoreAndRankCandidates(
    candidateIds: Set<any>,
    nodeMap: Map<any, Record<string, any>>,
    query: string,
    fields: string[],
    minScore: number,
    topN: number,
): Array<{ node: any; score: number; matches: any }> {
    const results = [];
    for (const id of candidateIds) {
        const node = nodeMap.get(id);
        if (!node) continue;
        const r = scoreNode(node, query, { fields });
        if (r.score >= minScore) {
            results.push({ node, score: r.score, matches: r.matches });
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
}

/**
 * Constrói índice invertido para queries repetidas.
 *
 * @param {Array<Record<string, any>>} nodes
 * @param {object} [options]
 * @param {Array<string>} [options.fields]
 * @returns {{search: Function, size: Function, nodeIds: Function}}
 */
export function buildInvertedIndex(
    nodes: Array<Record<string, any>>,
    options: { fields?: Array<string> } = {},
): { search: Function; size: Function; nodeIds: Function } {
    const fields =
        Array.isArray(options.fields) && options.fields.length > 0 ? options.fields : ['name', 'title', 'description'];
    const tokenMap = new Map(); // token → Set<nodeId>
    const nodeMap = new Map(); // nodeId → node

    if (Array.isArray(nodes)) {
        for (const node of nodes) {
            _indexNode(node, fields, tokenMap, nodeMap);
        }
    }

    return Object.freeze({
        search(query: any, opts: any = {}) {
            if (typeof query !== 'string' || !query.trim()) return [];
            const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0.3;
            const topN = Number.isInteger(opts.topN) && opts.topN > 0 ? opts.topN : 20;

            const queryTokens = tokenize(query);
            const candidateIds = _resolveCandidateIds(queryTokens, tokenMap);
            return _scoreAndRankCandidates(candidateIds, nodeMap, query, fields, minScore, topN);
        },
        size() {
            return nodeMap.size;
        },
        nodeIds() {
            return [...nodeMap.keys()];
        },
    });
}

/**
 * Module identity export.
 */
export const searchIndexMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.15',
    deliveredAt: '2026-05-01',
    matchTypes: MATCH_TYPES,
    exports: [
        'MATCH_TYPES',
        'SCORE_WEIGHTS',
        'SEARCH_INDEX_META',
        'normalize',
        'tokenize',
        'editDistance',
        'matchString',
        'scoreNode',
        'searchNodes',
        'buildInvertedIndex',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
