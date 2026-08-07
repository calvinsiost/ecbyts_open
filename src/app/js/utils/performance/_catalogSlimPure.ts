// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Catalog Slimming — pure logic for WS-6 of SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Splits a "fat" registry entry (full payload) into a slim metadata
 * record (id, title, tags, summary) plus a lazy-load handle for the
 * detail payload. The goal is to keep the search index small enough to
 * load in <1ms and only fetch the detail payload when the user actually
 * opens an entry.
 *
 * Pure: caller passes the fat registry; module returns frozen {slim,
 * detailIndex}. Caller plugs in dynamic import / IDB / fetch for the
 * actual lazy-load.
 *
 * Tests live in `tests/catalog-slim-pure.test.mjs`.
 */

export interface FatRegistryEntry {
    readonly id: string;
    readonly title: string;
    readonly summary?: string;
    readonly tags?: ReadonlyArray<string>;
    readonly payload?: unknown;
}

export interface SlimEntry {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    readonly tags: ReadonlyArray<string>;
}

export interface SplitResult {
    readonly slim: ReadonlyArray<SlimEntry>;
    readonly detailIndex: ReadonlyMap<string, unknown>;
    readonly slimBytesEstimate: number;
    readonly detailBytesEstimate: number;
    readonly entriesCount: number;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function safeString(v: unknown): string {
    return typeof v === 'string' ? v : '';
}

function safeArr(v: unknown): ReadonlyArray<string> {
    return Array.isArray(v) ? Object.freeze(v.filter((x): x is string => typeof x === 'string')) : Object.freeze([]);
}

function estimateJsonBytes(value: unknown): number {
    try {
        return JSON.stringify(value).length;
    } catch {
        return 0;
    }
}

/**
 * Split a fat registry into slim+detail pair. Pure: returns frozen
 * result; never mutates input.
 *
 * @param entries  raw registry entries (may include invalid items — filtered)
 */
export function splitFatRegistry(entries: ReadonlyArray<FatRegistryEntry> | null | undefined): SplitResult {
    if (!Array.isArray(entries) || entries.length === 0) {
        return Object.freeze({
            slim: Object.freeze([]),
            detailIndex: new Map(),
            slimBytesEstimate: 0,
            detailBytesEstimate: 0,
            entriesCount: 0,
        });
    }
    const slim: SlimEntry[] = [];
    const detailMap = new Map<string, unknown>();
    let slimBytes = 0;
    let detailBytes = 0;
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        if (!isNonEmptyString(e.id)) continue;
        if (!isNonEmptyString(e.title)) continue;
        const slimEntry: SlimEntry = Object.freeze({
            id: e.id,
            title: e.title,
            summary: safeString(e.summary).slice(0, 200), // cap summary ≤200 chars
            tags: safeArr(e.tags),
        });
        slim.push(slimEntry);
        slimBytes += estimateJsonBytes(slimEntry);
        if (e.payload !== undefined && e.payload !== null) {
            detailMap.set(e.id, e.payload);
            detailBytes += estimateJsonBytes(e.payload);
        }
    }
    return Object.freeze({
        slim: Object.freeze(slim),
        detailIndex: detailMap,
        slimBytesEstimate: slimBytes,
        detailBytesEstimate: detailBytes,
        entriesCount: slim.length,
    });
}

/**
 * Search the slim index by query string + optional tag filter. Returns
 * frozen ranked slice (max `limit` results).
 *
 * Ranking heuristic:
 *   - exact id match → score 100
 *   - title startsWith query → score 50 + prefix bonus
 *   - title includes query → score 30
 *   - tag match → +10 per tag
 *   - summary includes → +5
 */
export function searchSlim(
    slim: ReadonlyArray<SlimEntry> | null | undefined,
    query: string,
    options?: { readonly tag?: string; readonly limit?: number },
): ReadonlyArray<SlimEntry> {
    if (!Array.isArray(slim) || slim.length === 0) return Object.freeze([]);
    const q = typeof query === 'string' ? query.trim().toLowerCase() : '';
    const tag = typeof options?.tag === 'string' && options.tag.length > 0 ? options.tag.toLowerCase() : '';
    const limit = options && Number.isFinite(options.limit) && (options.limit as number) > 0
        ? Math.floor(options.limit as number)
        : 50;

    if (q === '' && tag === '') {
        return Object.freeze(slim.slice(0, limit));
    }

    const scored: Array<{ entry: SlimEntry; score: number }> = [];
    for (const e of slim) {
        let score = 0;
        const titleLower = e.title.toLowerCase();
        const summaryLower = e.summary.toLowerCase();
        const tagsLower = e.tags.map((t: string) => t.toLowerCase());
        if (q !== '') {
            if (e.id.toLowerCase() === q) score += 100;
            else if (titleLower.startsWith(q)) score += 50;
            else if (titleLower.includes(q)) score += 30;
            for (const t of tagsLower) {
                if (t === q) score += 10;
            }
            if (summaryLower.includes(q)) score += 5;
        }
        if (tag !== '') {
            if (!tagsLower.includes(tag)) continue; // tag filter is strict
            score += 5;
        }
        if (score > 0 || (q === '' && tag !== '')) {
            scored.push({ entry: e, score });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return Object.freeze(scored.slice(0, limit).map((x) => x.entry));
}

/**
 * Convenience — lookup a detail payload by id.
 */
export function getDetail(
    detailIndex: ReadonlyMap<string, unknown> | null | undefined,
    id: string,
): unknown | null {
    if (!detailIndex || typeof detailIndex.get !== 'function') return null;
    if (!isNonEmptyString(id)) return null;
    const v = detailIndex.get(id);
    return v === undefined ? null : v;
}
