// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Surya OCR output parser — pure logic (RF1 of SPEC_INGESTION_SURYA).
 *
 * Wraps the raw Surya JSON output (datalab-to/surya) into ecbyts'
 * `ParsedDocument` shape used by the rest of the ingestion pipeline.
 *
 * Surya output structure (simplified):
 *   {
 *     pages: [
 *       {
 *         page: number, width: number, height: number,
 *         blocks: [
 *           { id, type: 'Text'|'Title'|'Table'|'Picture'|'List'|'Formula',
 *             bbox: [x0,y0,x1,y1], polygon: [[x,y]...],
 *             text?: string, html?: string,
 *             confidence: number (0..1), reading_order: number }
 *         ]
 *       }, ...
 *     ]
 *   }
 *
 * Pure: no I/O, no fetch, no parsing of binary. Caller delivers JSON.
 *
 * Anti-requirements (SPEC §2.3 won't):
 *   - Never run inference here. The model lives in a separate provider.
 *   - Never silently coerce. Invalid input → frozen result with errors list.
 *
 * Tests live in `tests/surya-parser-pure.test.mjs`.
 */

export type SuryaBlockType =
    | 'Text'
    | 'Title'
    | 'Table'
    | 'Picture'
    | 'List'
    | 'Formula'
    | 'Caption'
    | 'Footnote'
    | 'PageHeader'
    | 'PageFooter'
    | 'SectionHeader';

export interface SuryaBlock {
    readonly id?: string | number;
    readonly type?: string;
    readonly bbox?: ReadonlyArray<number>;
    readonly polygon?: ReadonlyArray<ReadonlyArray<number>>;
    readonly text?: string;
    readonly html?: string;
    readonly confidence?: number;
    readonly reading_order?: number;
}

export interface SuryaPage {
    readonly page?: number;
    readonly width?: number;
    readonly height?: number;
    readonly blocks?: ReadonlyArray<SuryaBlock>;
}

export interface SuryaDocument {
    readonly pages?: ReadonlyArray<SuryaPage>;
}

export interface ParsedBlock {
    readonly id: string;
    readonly type: SuryaBlockType | 'Unknown';
    readonly pageIndex: number;
    readonly readingOrder: number;
    readonly text: string;
    readonly html: string;
    readonly confidence: number;
    readonly bbox: readonly [number, number, number, number] | null;
}

export interface ParsedDocument {
    readonly pageCount: number;
    readonly blockCount: number;
    readonly meanConfidence: number;
    readonly blocks: ReadonlyArray<ParsedBlock>;
    readonly errors: ReadonlyArray<string>;
}

const KNOWN_TYPES: ReadonlyArray<SuryaBlockType> = Object.freeze([
    'Text',
    'Title',
    'Table',
    'Picture',
    'List',
    'Formula',
    'Caption',
    'Footnote',
    'PageHeader',
    'PageFooter',
    'SectionHeader',
]);

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function clampConfidence(v: unknown): number {
    if (!isFiniteNumber(v)) return 0;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

function parseBbox(raw: unknown): readonly [number, number, number, number] | null {
    if (!Array.isArray(raw) || raw.length !== 4) return null;
    if (!raw.every(isFiniteNumber)) return null;
    // length === 4 garante os 4 índices (noUncheckedIndexedAccess).
    return [raw[0]!, raw[1]!, raw[2]!, raw[3]!] as const;
}

function normaliseType(t: unknown): SuryaBlockType | 'Unknown' {
    if (typeof t !== 'string') return 'Unknown';
    return (KNOWN_TYPES as ReadonlyArray<string>).includes(t)
        ? (t as SuryaBlockType)
        : 'Unknown';
}

/**
 * Parse a Surya OCR document JSON. Pure, deterministic, returns frozen VM.
 * Anti-N1: invalid blocks are SKIPPED + recorded in `errors`, never coerced.
 */
export function parseSuryaDocument(doc: SuryaDocument | null | undefined): ParsedDocument {
    const errors: string[] = [];
    const blocks: ParsedBlock[] = [];

    if (!doc || typeof doc !== 'object') {
        errors.push('input_not_object');
        return Object.freeze({
            pageCount: 0,
            blockCount: 0,
            meanConfidence: 0,
            blocks: Object.freeze(blocks),
            errors: Object.freeze(errors),
        });
    }

    if (!Array.isArray(doc.pages)) {
        errors.push('pages_not_array');
        return Object.freeze({
            pageCount: 0,
            blockCount: 0,
            meanConfidence: 0,
            blocks: Object.freeze(blocks),
            errors: Object.freeze(errors),
        });
    }

    let confidenceSum = 0;
    let confidenceCount = 0;

    doc.pages.forEach((page, pageIdx) => {
        if (!page || typeof page !== 'object') {
            errors.push(`page_${pageIdx}_invalid`);
            return;
        }
        if (!Array.isArray(page.blocks)) {
            errors.push(`page_${pageIdx}_blocks_not_array`);
            return;
        }
        page.blocks.forEach((b: any, bIdx: number) => {
            if (!b || typeof b !== 'object') {
                errors.push(`page_${pageIdx}_block_${bIdx}_invalid`);
                return;
            }
            const id = b.id !== undefined && b.id !== null ? String(b.id) : `p${pageIdx}-b${bIdx}`;
            const type = normaliseType(b.type);
            const text = typeof b.text === 'string' ? b.text : '';
            const html = typeof b.html === 'string' ? b.html : '';
            const confidence = clampConfidence(b.confidence);
            const bbox = parseBbox(b.bbox);
            const readingOrder = isFiniteNumber(b.reading_order)
                ? Math.trunc(b.reading_order)
                : bIdx;
            blocks.push(
                Object.freeze({
                    id,
                    type,
                    pageIndex: pageIdx,
                    readingOrder,
                    text,
                    html,
                    confidence,
                    bbox,
                }),
            );
            if (isFiniteNumber(b.confidence)) {
                confidenceSum += confidence;
                confidenceCount++;
            }
        });
    });

    // RF8: preserve reading-order — stable sort by pageIndex then readingOrder.
    blocks.sort((a, b) => {
        if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
        return a.readingOrder - b.readingOrder;
    });

    return Object.freeze({
        pageCount: doc.pages.length,
        blockCount: blocks.length,
        meanConfidence: confidenceCount > 0 ? confidenceSum / confidenceCount : 0,
        blocks: Object.freeze(blocks),
        errors: Object.freeze(errors),
    });
}

/**
 * RF7: quality decision tier based on mean confidence.
 *   - >= 0.85 → 'accept'   (auto-merge into ingestion pipeline)
 *   - 0.6 .. 0.85 → 'review' (manual triage required)
 *   - < 0.6 → 'reject'      (block from pipeline)
 */
export function decideSuryaQuality(meanConfidence: number): 'accept' | 'review' | 'reject' {
    if (!isFiniteNumber(meanConfidence) || meanConfidence < 0) return 'reject';
    if (meanConfidence >= 0.85) return 'accept';
    if (meanConfidence >= 0.6) return 'review';
    return 'reject';
}

/**
 * Filter blocks by type. Useful when the caller wants only Tables for the
 * LabTableSchema mapper (RF2) or only Pictures for the photolog detector.
 */
export function filterBlocksByType(
    parsed: ParsedDocument,
    types: ReadonlyArray<SuryaBlockType | 'Unknown'>,
): ReadonlyArray<ParsedBlock> {
    if (!parsed || !Array.isArray(parsed.blocks)) return Object.freeze([]);
    const set = new Set(types);
    return Object.freeze(parsed.blocks.filter((b) => set.has(b.type)));
}
