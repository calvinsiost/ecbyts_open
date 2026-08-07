// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * crossRefLinker.js - Figure/Table cross-reference detection and resolution.
 *
 * Detects references like "Figura 3", "Tab. 2", "Quadro 1", "Anexo A"
 * in document text and resolves them against known assets and tables.
 *
 * @module core/ingestion/documents/crossRefLinker
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossReference {
    refType: 'figure' | 'table' | 'annex' | 'photo' | 'map';
    refNumber: number | string;
    rawMatch: string;
    page: number;
    charOffset: number;
    context: string;
    targetAssetId: string | null;
    targetPage: number | null;
    resolution: 'matched' | 'unresolved' | 'ambiguous';
}

export interface CrossRefResult {
    references: CrossReference[];
    stats: {
        total: number;
        matched: number;
        unresolved: number;
        ambiguous: number;
    };
}

// ---------------------------------------------------------------------------
// Detection Patterns
// ---------------------------------------------------------------------------

interface Pattern {
    re: RegExp;
    type: CrossReference['refType'];
}

const CROSSREF_PATTERNS: Pattern[] = [
    // Portuguese
    { re: /\b[Ff]igura\s*(\d{1,3})/g, type: 'figure' },
    { re: /\b[Ff]ig\.\s*(\d{1,3})/g, type: 'figure' },
    { re: /\b[Tt]abela\s*(\d{1,3})/g, type: 'table' },
    { re: /\b[Tt]ab\.\s*(\d{1,3})/g, type: 'table' },
    { re: /\b[Qq]uadro\s*(\d{1,3})/g, type: 'table' },
    { re: /\b[Aa]nexo\s*([A-Z]|\d{1,3})/g, type: 'annex' },
    { re: /\b[Ff]oto(?:grafia)?\s*(\d{1,3})/g, type: 'photo' },
    { re: /\b[Mm]apa\s*(\d{1,3})/g, type: 'map' },
    // English (bilingual reports)
    { re: /\b[Ff]igure\s*(\d{1,3})/g, type: 'figure' },
    { re: /\b[Tt]able\s*(\d{1,3})/g, type: 'table' },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect all cross-references in document text.
 * Returns unresolved references (no target matching yet).
 *
 * @param {string} rawText - full document text with \f separators
 * @returns {CrossReference[]}
 */
export function detectCrossRefs(rawText: string): CrossReference[] {
    if (!rawText) return [];

    const refs: CrossReference[] = [];
    const pages = rawText.split('\f');
    let charOffset = 0;

    for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const pageText = pages[pageIdx];
        if (pageText === undefined) continue;
        const pageNum = pageIdx + 1;

        for (const pattern of CROSSREF_PATTERNS) {
            pattern.re.lastIndex = 0; // MANDATORY: prevent stale state
            let match: RegExpExecArray | null;
            while ((match = pattern.re.exec(pageText)) !== null) {
                const absOffset = charOffset + match.index;
                const m1 = match[1] ?? '';
                const refNumber = isNaN(parseInt(m1)) ? m1 : parseInt(m1);

                // Extract context (±100 chars)
                const ctxStart = Math.max(0, match.index - 100);
                const ctxEnd = Math.min(pageText.length, match.index + match[0].length + 100);
                const context = pageText.slice(ctxStart, ctxEnd).replace(/\n/g, ' ').trim();

                refs.push({
                    refType: pattern.type,
                    refNumber,
                    rawMatch: match[0],
                    page: pageNum,
                    charOffset: absOffset,
                    context,
                    targetAssetId: null,
                    targetPage: null,
                    resolution: 'unresolved',
                });
            }
        }

        charOffset += pageText.length + 1; // +1 for \f
    }

    // Deduplicate: same type+number on same page → keep first
    const seen = new Set<string>();
    const deduped = refs.filter((r) => {
        const key = `${r.refType}:${r.refNumber}:${r.page}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    return deduped;
}

/**
 * Resolve cross-references against known assets and tables.
 *
 * @param {CrossReference[]} refs - from detectCrossRefs()
 * @param {Object} targets
 * @param {Array<{page: number, caption: string|null, index: number, id: string}>} targets.assets
 * @param {Array<{page: number, index: number}>} targets.tables
 * @returns {CrossRefResult}
 */
export function resolveCrossRefs(
    refs: CrossReference[],
    targets: {
        assets?: Array<{ page: number; caption: string | null; index: number; id: string }>;
        tables?: Array<{ page: number; index: number }>;
    } | undefined,
): CrossRefResult {
    const { assets = [], tables = [] } = targets || {};
    const results: CrossReference[] = refs.map((ref) => ({ ...ref }));

    for (const ref of results) {
        if (ref.refType === 'figure' || ref.refType === 'photo' || ref.refType === 'map') {
            _resolveFigureRef(ref, assets);
        } else if (ref.refType === 'table') {
            _resolveTableRef(ref, tables);
        }
        // 'annex' stays unresolved (annexes not in pipeline)
    }

    const stats = {
        total: results.length,
        matched: results.filter((r) => r.resolution === 'matched').length,
        unresolved: results.filter((r) => r.resolution === 'unresolved').length,
        ambiguous: results.filter((r) => r.resolution === 'ambiguous').length,
    };

    return { references: results, stats };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * Resolve figure/photo/map reference against assets by caption.
 */
function _resolveFigureRef(
    ref: CrossReference,
    assets: Array<{ page: number; caption: string | null; index: number; id: string }>,
): void {
    const figRe = new RegExp(`fig(?:ura|ure|\\.)?\\s*${ref.refNumber}\\b`, 'i');

    // Match by caption
    const captionMatches = assets.filter(
        (a) => a.caption && figRe.test(a.caption),
    );

    if (captionMatches.length === 1 && captionMatches[0]) {
        ref.targetAssetId = captionMatches[0].id;
        ref.targetPage = captionMatches[0].page;
        ref.resolution = 'matched';
        return;
    }

    if (captionMatches.length > 1 && captionMatches[0]) {
        ref.resolution = 'ambiguous';
        ref.targetAssetId = captionMatches[0].id; // first match
        ref.targetPage = captionMatches[0].page;
        return;
    }

    // Fallback: match by page proximity (figure on same or ±1 page)
    const proximityMatches = assets.filter(
        (a) => a.page && Math.abs(a.page - ref.page) <= 1,
    );

    if (proximityMatches.length === 1 && proximityMatches[0]) {
        ref.targetAssetId = proximityMatches[0].id;
        ref.targetPage = proximityMatches[0].page;
        ref.resolution = 'matched';
        return;
    }

    // Unresolved
    ref.resolution = 'unresolved';
}

/**
 * Resolve table reference by sequential index.
 * Table N = Nth table found in document order (1-based).
 */
function _resolveTableRef(
    ref: CrossReference,
    tables: Array<{ page: number; index: number }>,
): void {
    const idx = typeof ref.refNumber === 'number' ? ref.refNumber - 1 : -1;
    const table = idx >= 0 && idx < tables.length ? tables[idx] : undefined;
    if (table) {
        ref.targetPage = table.page;
        ref.resolution = 'matched';
    } else {
        ref.resolution = 'unresolved';
    }
}