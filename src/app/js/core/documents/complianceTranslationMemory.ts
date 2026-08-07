// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Translation Memory - Phase 14 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S17
 *
 * Phase 14 (2026-05-01) - pure-logic engine para armazenar/recuperar
 * pares de tradução em PT-BR/EN-US/ES-LA. Permite fuzzy match para
 * sugestões de traduções similares já existentes.
 *
 * Estratégia:
 *   - TM entry: { sourceLocale, sourceText, translations: { locale: text } }
 *   - Hash determinístico do source para indexação O(1)
 *   - Fuzzy match: Levenshtein distance threshold para suggestions
 *   - Stats: coverage por locale, similarity score
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Locales canônicos do ecbyts. */
export const SUPPORTED_LOCALES = Object.freeze(['pt-BR', 'en-US', 'es-LA']);

/** Match types canônicos. */
export const MATCH_TYPES = Object.freeze(['exact', 'fuzzy', 'none']);

/** Identidade do módulo. */
export const TM_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 14,
    deliveredAt: '2026-05-01',
    locales: SUPPORTED_LOCALES,
    matchTypes: MATCH_TYPES,
});

/**
 * Verifica se locale é canônico.
 */
export function isValidLocale( locale: any) {
    return typeof locale === 'string' && SUPPORTED_LOCALES.includes(locale);
}

/**
 * Normaliza source text (lowercase + trim + collapse whitespace).
 */
export function normalizeSource( text: any) {
    if (typeof text !== 'string') return '';
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Hash determinístico FNV-1a 32-bit.
 */
export function hashSource( text: any) {
    const norm = normalizeSource(text);
    let hash = 0x811c9dc5;
    for (let i = 0; i < norm.length; i++) {
        hash ^= norm.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

/**
 * Edit distance (Levenshtein simplificado).
 */
export function editDistance( a: any,  b: any) {
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
 * Cria TM entry frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createEntry(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createEntry: spec required');
    }
    if (!isValidLocale(spec.sourceLocale)) {
        throw new TypeError(`createEntry: sourceLocale must be one of ${SUPPORTED_LOCALES.join(',')}`);
    }
    if (typeof spec.sourceText !== 'string' || !spec.sourceText.trim()) {
        throw new TypeError('createEntry: sourceText required');
    }
    const translations: Record<string,string> = {};
    if (spec.translations && typeof spec.translations === 'object') {
        for (const [locale, text] of Object.entries(spec.translations)) {
            if (isValidLocale(locale) && typeof text === 'string' && text.trim()) {
                translations[locale] = text;
            }
        }
    }
    return Object.freeze({
        id: spec.id || hashSource(spec.sourceText),
        sourceLocale: spec.sourceLocale,
        sourceText: spec.sourceText,
        sourceHash: hashSource(spec.sourceText),
        translations: Object.freeze(translations),
        createdAt: Number.isFinite(spec.createdAt) ? spec.createdAt : Date.now(),
        updatedAt: Number.isFinite(spec.updatedAt) ? spec.updatedAt : Date.now(),
    });
}

/**
 * Cria translation memory store.
 *
 * @param {Object} [options]
 * @param {number} [options.fuzzyThreshold=0.25] - threshold Levenshtein/length
 * @returns {{add: (entry:any) => any, get: (...args:any[]) => any, getById: (...args:any[]) => any, findExact: (...args:any[]) => any, findFuzzy: (...args:any[]) => any, lookup: (...args:any[]) => any, size: () => number, clear: () => void, snapshot: () => any, restore: (...args:any[]) => any}}
 */
export function createMemory(options: { fuzzyThreshold?: number } = {}): {add: (entry:any) => any, get: (...args:any[]) => any, getById: (...args:any[]) => any, findExact: (...args:any[]) => any, findFuzzy: (...args:any[]) => any, lookup: (...args:any[]) => any, size: () => number, clear: () => void, snapshot: () => any, restore: (...args:any[]) => any} {
    const fuzzyThreshold = Number.isFinite(options.fuzzyThreshold)
        ? Math.max(0, Math.min(1, (options.fuzzyThreshold as number)))
        : 0.25;
    const entries = new Map(); // id → entry
    const byHash = new Map(); // hash → entryId

    return Object.freeze({
        add( entry: any) {
            if (!entry || typeof entry !== 'object') return false;
            if (!entry.id || !entry.sourceText || !isValidLocale(entry.sourceLocale)) return false;
            entries.set(entry.id, entry);
            byHash.set(entry.sourceHash, entry.id);
            return true;
        },
        get( sourceText: any) {
            const hash = hashSource(sourceText);
            const id = byHash.get(hash);
            return id ? entries.get(id) : null;
        },
        getById( id: any) {
            return entries.get(id) || null;
        },
        findExact( sourceText: any) {
            return this.get(sourceText);
        },
        findFuzzy( sourceText: any, maxResults = 5) {
            if (typeof sourceText !== 'string' || !sourceText.trim()) return [];
            const norm = normalizeSource(sourceText);
            const matches = [];
            for (const entry of entries.values()) {
                const entryNorm = normalizeSource(entry.sourceText);
                if (entryNorm === norm) continue; // skip exact (use findExact)
                const dist = editDistance(norm, entryNorm);
                const maxLen = Math.max(norm.length, entryNorm.length);
                if (maxLen === 0) continue;
                const similarity = 1 - dist / maxLen;
                const distRatio = dist / maxLen;
                if (distRatio <= fuzzyThreshold) {
                    matches.push({ entry, similarity });
                }
            }
            matches.sort((a, b) => b.similarity - a.similarity);
            return Object.freeze(matches.slice(0, maxResults));
        },
        lookup( sourceText: any,  targetLocale: any) {
            if (!isValidLocale(targetLocale)) return Object.freeze({ type: 'none' });
            const exact = this.findExact(sourceText);
            if (exact && exact.translations[targetLocale]) {
                return Object.freeze({
                    type: 'exact',
                    text: exact.translations[targetLocale],
                    entry: exact,
                });
            }
            const fuzzy = this.findFuzzy(sourceText, 1);
            if (fuzzy.length > 0 && fuzzy[0].entry.translations[targetLocale]) {
                return Object.freeze({
                    type: 'fuzzy',
                    text: fuzzy[0].entry.translations[targetLocale],
                    similarity: fuzzy[0].similarity,
                    entry: fuzzy[0].entry,
                });
            }
            return Object.freeze({ type: 'none' });
        },
        size() {
            return entries.size;
        },
        clear() {
            entries.clear();
            byHash.clear();
        },
        snapshot() {
            return JSON.stringify([...entries.values()]);
        },
        restore( snap: any) {
            try {
                const data = JSON.parse(snap);
                if (!Array.isArray(data)) return false;
                this.clear();
                for (const e of data) {
                    if (e) this.add(e);
                }
                return true;
            } catch ( err: any) {
                console.debug('[tm:restore]', err?.message || err);
                return false;
            }
        },
    });
}

/**
 * Computa coverage stats.
 *
 * @param {Array<any>} entries
 * @returns {{total: number, byLocale: Record<string, number>, fullCoverage: number}}
 */
export function computeCoverage(entries: Array<any>): {total: number, byLocale: Record<string, number>, fullCoverage: number} {
    const empty = {
        total: 0,
        byLocale: { 'pt-BR': 0, 'en-US': 0, 'es-LA': 0 },
        fullCoverage: 0,
    };
    if (!Array.isArray(entries) || entries.length === 0) return empty;

    const byLocale: Record<string, number> = { 'pt-BR': 0, 'en-US': 0, 'es-LA': 0 };
    let fullCoverage = 0;
    for (const e of entries) {
        if (!e || !e.translations) continue;
        let count = 0;
        for (const locale of SUPPORTED_LOCALES) {
            if (e.translations[locale]) {
                byLocale[locale]!++;
                count++;
            }
        }
        if (count === SUPPORTED_LOCALES.length) fullCoverage++;
    }
    return Object.freeze({
        total: entries.length,
        byLocale,
        fullCoverage,
    });
}

/**
 * Module identity export.
 */
export const complianceTranslationMemoryMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 14,
    deliveredAt: '2026-05-01',
    locales: SUPPORTED_LOCALES,
    exports: [
        'SUPPORTED_LOCALES',
        'MATCH_TYPES',
        'TM_META',
        'isValidLocale',
        'normalizeSource',
        'hashSource',
        'editDistance',
        'createEntry',
        'createMemory',
        'computeCoverage',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
