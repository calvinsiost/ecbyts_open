// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Doc Index - Phase 19 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S22
 *
 * Phase 19 (2026-05-01) - pure-logic full-document index para
 * cross-reference resolution e outline generation. Indexa headings,
 * anchors, internal links e gera table of contents.
 *
 * Estratégia:
 *   - parseHeadings: detecta # / ## / ### em markdown
 *   - resolveAnchors: gera slug-style anchors
 *   - extractLinks: detecta [text](url) + [text](#anchor)
 *   - validateLinks: verifica se anchors existem
 *   - generateTOC: produz table of contents hierárquica
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const DOC_INDEX_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 19,
    deliveredAt: '2026-05-01',
});

/**
 * Slugify: converte texto em anchor URL-safe.
 *
 * @param {string} markdown
 * @returns {string}
 */
import { slugify as _slugifyCanonical } from '../../utils/helpers/slugify.js';
export function slugify(text: string): string {
    return _slugifyCanonical(text, { separator: '-' });
}

/**
 * Parse headings de markdown.
 *
 * @param {string} markdown
 * @returns {Array<{level: number, text: string, anchor: string, line: number}>}
 */
export function parseHeadings(markdown: string): Array<{level: number, text: string, anchor: string, line: number}> {
    if (typeof markdown !== 'string') return [];
    const lines = markdown.split(/\r?\n/);
    const out = [];
    const usedAnchors = new Map();
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const m = ln === undefined ? null : ln.match(/^(#{1,6})\s+(.+?)\s*$/);
        if (!m || m[1] === undefined || m[2] === undefined) continue;
        const level = m[1].length;
        const text = m[2].trim();
        let anchor = slugify(text);
        if (usedAnchors.has(anchor)) {
            const n = usedAnchors.get(anchor) + 1;
            usedAnchors.set(anchor, n);
            anchor = `${anchor}-${n}`;
        } else {
            usedAnchors.set(anchor, 0);
        }
        out.push(Object.freeze({ level, text, anchor, line: i + 1 }));
    }
    return (Object.freeze(out) as any);
}

/**
 * Extrai links markdown [text](url).
 *
 * @param {string} markdown
 * @returns {Array<{text: string, url: string, isInternal: boolean, anchor: string|null, line: number}>}
 */
export function extractLinks(markdown: string): Array<{text: string, url: string, isInternal: boolean, anchor: string|null, line: number}> {
    if (typeof markdown !== 'string') return [];
    const lines = markdown.split(/\r?\n/);
    const out = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    for (let i = 0; i < lines.length; i++) {
        let match;
        linkRegex.lastIndex = 0;
        const lnk = lines[i];
        if (lnk === undefined) continue;
        while ((match = linkRegex.exec(lnk)) !== null) {
            const text = match[1];
            const url = match[2] ?? '';
            const isInternal = url.startsWith('#');
            const anchor = isInternal ? url.slice(1) : null;
            out.push(
                Object.freeze({
                    text,
                    url,
                    isInternal,
                    anchor,
                    line: i + 1,
                }),
            );
        }
    }
    return (Object.freeze(out) as any);
}

/**
 * Valida links internos contra anchors disponíveis.
 *
 * @param {Array<{anchor: string|null, isInternal: boolean}>} links
 * @param {Array<{anchor: string}>} headings
 * @returns {{validCount: number, invalidCount: number, broken: Array<string>}}
 */
export function validateLinks(links: Array<{anchor: string|null, isInternal: boolean}>, headings: Array<{anchor: string}>): {validCount: number, invalidCount: number, broken: Array<string>} {
    if (!Array.isArray(links) || !Array.isArray(headings)) {
        return Object.freeze({ validCount: 0, invalidCount: 0, broken: [] });
    }
    const validAnchors = new Set(headings.map((h) => h.anchor));
    let validCount = 0;
    let invalidCount = 0;
    const broken = [];
    for (const link of links) {
        if (!link || !link.isInternal) continue;
        if (validAnchors.has((link.anchor as string))) {
            validCount++;
        } else {
            invalidCount++;
            broken.push((link.anchor as string));
        }
    }
    return (Object.freeze({ validCount, invalidCount, broken: Object.freeze(broken), }) as any);
}

/**
 * Gera table of contents hierárquica em markdown.
 *
 * @param {Array<{level: number, text: string, anchor: string}>} headings
 * @param {{maxLevel?: number}} [options]
 * @returns {string}
 */
export function generateTOC(headings: Array<{level: number, text: string, anchor: string}>, options: {maxLevel?: number} = {}): string {
    if (!Array.isArray(headings) || headings.length === 0) return '';
    const maxLevel = Number.isInteger(options.maxLevel) && (options.maxLevel as number) > 0 ? (options.maxLevel as number) : 3;
    const lines = [];
    for (const h of headings) {
        if (!h || h.level > maxLevel) continue;
        const indent = '  '.repeat(Math.max(0, h.level - 1));
        lines.push(`${indent}- [${h.text}](#${h.anchor})`);
    }
    return lines.join('\n');
}

/**
 * Conta words em markdown (ignora syntax).
 */
export function countWords( markdown: any) {
    if (typeof markdown !== 'string') return 0;
    const cleaned = markdown
        .replace(/```[\s\S]*?```/g, ' ') // code blocks
        .replace(/`[^`]+`/g, ' ') // inline code
        .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → keep text
        .replace(/[#*_>~`-]/g, ' '); // markdown symbols
    const tokens = cleaned.split(/\s+/).filter((t) => t.length > 0);
    return tokens.length;
}

/**
 * Estima reading time em minutes (200 wpm).
 */
export function estimateReadingTime( markdown: any) {
    const words = countWords(markdown);
    return Math.max(1, Math.round(words / 200));
}

/**
 * Indexa documento completo.
 *
 * @param {string} markdown
 * @returns {Object} index frozen
 */
export function indexDocument(markdown: string): Object {
    const empty = {
        headings: [],
        links: [],
        validation: { validCount: 0, invalidCount: 0, broken: [] },
        wordCount: 0,
        readingMinutes: 1,
        toc: '',
    };
    if (typeof markdown !== 'string' || markdown.length === 0) {
        return Object.freeze(empty);
    }
    const headings = parseHeadings(markdown);
    const links = extractLinks(markdown);
    const validation = validateLinks(links, headings);
    return Object.freeze({
        headings,
        links,
        validation,
        wordCount: countWords(markdown),
        readingMinutes: estimateReadingTime(markdown),
        toc: generateTOC(headings),
    });
}

/**
 * Module identity export.
 */
export const complianceDocIndexMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 19,
    deliveredAt: '2026-05-01',
    exports: [
        'DOC_INDEX_META',
        'slugify',
        'parseHeadings',
        'extractLinks',
        'validateLinks',
        'generateTOC',
        'countWords',
        'estimateReadingTime',
        'indexDocument',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
