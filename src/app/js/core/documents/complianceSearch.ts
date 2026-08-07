// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Search - Phase 13 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S16
 *
 * Phase 13 (2026-05-01) - pure-logic engine de full-text search sobre
 * documentos de compliance. Suporta multi-field com pesos, filters
 * por status/category/locale, ordenação por relevância.
 *
 * Estratégia:
 *   - Tokenize + normalize + stopword filtering
 *   - Field weights: title=3.0, summary=2.0, body=1.0, tags=2.5
 *   - Score: count_matches × field_weight, somado por documento
 *   - Filters: predicate dict aplicado antes do scoring
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Field weights canônicos. */
export const FIELD_WEIGHTS = Object.freeze({
    title: 3.0,
    summary: 2.0,
    body: 1.0,
    tags: 2.5,
    category: 1.5,
    author: 1.5,
});

/** Stopwords PT-BR + EN-US (frozen, case-insensitive). */
export const STOPWORDS = Object.freeze(
    new Set([
        // PT
        'a',
        'o',
        'as',
        'os',
        'e',
        'ou',
        'de',
        'da',
        'do',
        'das',
        'dos',
        'em',
        'no',
        'na',
        'nos',
        'nas',
        'para',
        'por',
        'com',
        'um',
        'uma',
        'uns',
        'umas',
        'que',
        'se',
        // EN
        'the',
        'a',
        'an',
        'and',
        'or',
        'of',
        'in',
        'on',
        'at',
        'for',
        'to',
        'by',
        'with',
        'is',
        'are',
        'was',
        'were',
        'be',
        'been',
        'being',
    ]),
);

/** Identidade do módulo. */
export const SEARCH_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 13,
    deliveredAt: '2026-05-01',
    fieldWeights: FIELD_WEIGHTS,
    stopwordCount: STOPWORDS.size,
});

/**
 * Normaliza string (lowercase + trim).
 */
export function normalize(s: any): string {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().trim();
}

/**
 * Tokeniza string em palavras significativas (filtra stopwords).
 */
export function tokenize(text: string, options: { skipStopwords?: boolean } = {}): Array<string> {
    if (typeof text !== 'string') return [];
    const skipStopwords = options.skipStopwords !== false;
    const raw = text
        .toLowerCase()
        .split(/[\s,.;:!?\-_/\\(){}[\]<>'"]+/)
        .filter((t) => t.length > 1);
    if (!skipStopwords) return raw;
    return raw.filter((t) => !STOPWORDS.has(t));
}

/**
 * Conta ocorrências de queryTokens em fieldText.
 */
export function countMatches(fieldText: string, queryTokens: Array<string>): number {
    if (typeof fieldText !== 'string' || !Array.isArray(queryTokens)) return 0;
    const docTokens = tokenize(fieldText, { skipStopwords: false });
    const docSet = new Set(docTokens);
    let count = 0;
    for (const qt of queryTokens) {
        if (docSet.has(qt)) count++;
    }
    return count;
}

/**
 * Score documento contra query.
 */
export function scoreDocument(doc: any, query: string, options: any = {}): number {
    if (!doc || typeof doc !== 'object' || typeof query !== 'string') return 0;
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return 0;

    const weights = options.weights || FIELD_WEIGHTS;
    let score = 0;

    for (const [field, weight] of Object.entries(weights)) {
        let val = doc[field];
        if (val == null) continue;
        if (Array.isArray(val)) val = val.join(' ');
        if (typeof val !== 'string') val = String(val);
        const matches = countMatches(val, queryTokens);
        score += matches * (weight as number);
    }
    return score;
}

/**
 * Aplica filtros sobre documento (filter == null → passa).
 */
export function passesFilters(doc: any, filters: any): boolean {
    if (!filters || typeof filters !== 'object') return true;
    if (!doc || typeof doc !== 'object') return false;
    for (const [field, expected] of Object.entries(filters)) {
        const actual = doc[field];
        if (Array.isArray(expected)) {
            if (!expected.includes(actual)) return false;
        } else if (expected !== undefined && actual !== expected) {
            return false;
        }
    }
    return true;
}

/**
 * Busca documentos.
 */
export function searchDocuments(
    documents: Array<any>,
    query: string,
    options: any = {},
): Array<{ doc: any; score: any }> {
    if (!Array.isArray(documents) || typeof query !== 'string') return [];
    const minScore = Number.isFinite(options.minScore) ? options.minScore : 0.5;
    const topN = Number.isInteger(options.topN) && options.topN > 0 ? options.topN : 20;
    const filters = options.filters;

    const results = [];
    for (const doc of documents) {
        if (!doc) continue;
        if (!passesFilters(doc, filters)) continue;
        const score = scoreDocument(doc, query, options);
        if (score >= minScore) {
            results.push(Object.freeze({ doc, score }));
        }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topN);
}

/**
 * Constrói índice invertido para queries repetidas.
 */
export function buildSearchIndex(documents: Array<any>, options: any = {}): { search: any; size: any } {
    const fields =
        Array.isArray(options.fields) && options.fields.length > 0 ? options.fields : Object.keys(FIELD_WEIGHTS);
    const tokenMap = new Map(); // token → Set<docId>
    const docMap = new Map(); // docId → doc

    if (Array.isArray(documents)) {
        for (const doc of documents) {
            if (!doc || !doc.id) continue;
            docMap.set(doc.id, doc);
            for (const field of fields) {
                let val = doc[field];
                if (val == null) continue;
                if (Array.isArray(val)) val = val.join(' ');
                if (typeof val !== 'string') val = String(val);
                for (const tok of tokenize(val)) {
                    if (!tokenMap.has(tok)) tokenMap.set(tok, new Set());
                    tokenMap.get(tok).add(doc.id);
                }
            }
        }
    }

    return Object.freeze({
        search(query: any, opts: any = {}) {
            if (typeof query !== 'string' || !query.trim()) return [];
            const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0.5;
            const topN = Number.isInteger(opts.topN) && opts.topN > 0 ? opts.topN : 20;

            const queryTokens = tokenize(query);
            const candidateIds = new Set();
            for (const qt of queryTokens) {
                if (tokenMap.has(qt)) {
                    for (const id of tokenMap.get(qt)) candidateIds.add(id);
                }
            }

            const results = [];
            for (const id of candidateIds) {
                const doc = docMap.get(id);
                if (!doc) continue;
                if (opts.filters && !passesFilters(doc, opts.filters)) continue;
                const score = scoreDocument(doc, query, opts);
                if (score >= minScore) {
                    results.push({ doc, score });
                }
            }
            results.sort((a, b) => b.score - a.score);
            return results.slice(0, topN);
        },
        size() {
            return docMap.size;
        },
    });
}

/**
 * Sumariza search results.
 */
export function summarizeResults(results: any): any {
    const empty = { count: 0, maxScore: 0, minScore: 0, meanScore: 0 };
    if (!Array.isArray(results) || results.length === 0) return empty;
    const scores = results.map((r) => r.score).filter((s) => Number.isFinite(s));
    if (scores.length === 0) return empty;
    const sum = scores.reduce((a, b) => a + b, 0);
    return Object.freeze({
        count: results.length,
        maxScore: Math.max(...scores),
        minScore: Math.min(...scores),
        meanScore: sum / scores.length,
    });
}

/**
 * Module identity export.
 */
export const complianceSearchMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 13,
    deliveredAt: '2026-05-01',
    fieldWeights: FIELD_WEIGHTS,
    stopwordCount: STOPWORDS.size,
    exports: [
        'FIELD_WEIGHTS',
        'STOPWORDS',
        'SEARCH_META',
        'normalize',
        'tokenize',
        'countMatches',
        'scoreDocument',
        'passesFilters',
        'searchDocuments',
        'buildSearchIndex',
        'summarizeResults',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
