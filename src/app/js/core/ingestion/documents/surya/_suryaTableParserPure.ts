// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Surya OCR Table HTML → LabTableSchema — pure logic (RF2 of SPEC_INGESTION_SURYA).
 *
 * Parses the HTML payload that Surya emits for Table blocks (`block.html` of
 * a `ParsedBlock` with `type='Table'`) into ecbyts' internal `LabTableSchema`
 * that the EDD/CSV ingestion wizard already consumes.
 *
 * Surya HTML shape (canonical, simplified):
 *   <table>
 *     <thead><tr><th>col1</th><th>col2</th>...</tr></thead>
 *     <tbody>
 *       <tr><td>val1</td><td>val2</td>...</tr>
 *       ...
 *     </tbody>
 *   </table>
 *
 * Pure — no DOM, no fetch. Caller passes the HTML string; module returns
 * a frozen tabular VM ready to feed the ingestion mapper.
 *
 * Anti-requirements (SPEC §2.3 N1):
 *   - Never fabricate cells: missing/short rows are padded with empty strings
 *     (recorded in `warnings`), never with inferred values.
 *   - HTML entity decode covers the 5 canonical XML entities; anything else
 *     left literal so the caller can detect odd content.
 *
 * Tests live in `tests/surya-table-parser-pure.test.mjs`.
 */

export interface LabTableSchema {
    readonly headers: ReadonlyArray<string>;
    readonly rows: ReadonlyArray<ReadonlyArray<string>>;
    readonly rowCount: number;
    readonly columnCount: number;
    readonly warnings: ReadonlyArray<string>;
}

const ENTITY_MAP: Readonly<Record<string, string>> = Object.freeze({
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&#39;': "'",
    '&nbsp;': ' ',
});

function decodeEntities(input: string): string {
    if (typeof input !== 'string') return '';
    return input.replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITY_MAP[m] ?? m);
}

function stripTags(input: string): string {
    if (typeof input !== 'string') return '';
    // Replace block-level <br>, <p>, </li>, </tr> with single space first to
    // preserve word boundaries.
    const withBreaks = input.replace(/<\s*(br|\/p|\/li|\/tr|\/td|\/th)\s*\/?\s*>/gi, ' ');
    // Strip remaining tags.
    return withBreaks.replace(/<[^>]*>/g, '');
}

function normaliseWhitespace(input: string): string {
    return input.replace(/\s+/g, ' ').trim();
}

function extractCellText(rawCell: string): string {
    return normaliseWhitespace(decodeEntities(stripTags(rawCell)));
}

/**
 * Iterate over `<tr>...</tr>` blocks, yielding inner row HTML in order.
 */
function* iterateRows(tableHtml: string): IterableIterator<string> {
    const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let match: RegExpExecArray | null;
    while ((match = rowPattern.exec(tableHtml)) !== null) {
        yield match[1] ?? '';
    }
}

/**
 * Iterate over `<th>...</th>` and `<td>...</td>` blocks within a row.
 */
function* iterateCells(rowHtml: string): IterableIterator<string> {
    const cellPattern = /<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/gi;
    let match: RegExpExecArray | null;
    while ((match = cellPattern.exec(rowHtml)) !== null) {
        yield match[1] ?? '';
    }
}

/**
 * Parse a Surya Table HTML block into LabTableSchema. Pure, frozen output.
 *
 * Header detection rules:
 *   1. First explicit `<thead>` block — used as headers
 *   2. Else: first row containing any `<th>` cell
 *   3. Else: first row of `<tbody>` (synthesised numeric headers when first
 *      row has only `<td>` and caller did not declare otherwise)
 */
export function parseSuryaTableHtml(html: string | null | undefined): LabTableSchema {
    const warnings: string[] = [];
    if (typeof html !== 'string' || html.length === 0) {
        return Object.freeze({
            headers: Object.freeze([] as string[]),
            rows: Object.freeze([] as ReadonlyArray<string>[]),
            rowCount: 0,
            columnCount: 0,
            warnings: Object.freeze(['html_empty_or_invalid']),
        });
    }

    const tableMatch = /<table\b[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (!tableMatch) {
        return Object.freeze({
            headers: Object.freeze([] as string[]),
            rows: Object.freeze([] as ReadonlyArray<string>[]),
            rowCount: 0,
            columnCount: 0,
            warnings: Object.freeze(['no_table_tag']),
        });
    }
    const tableInner = tableMatch[1] ?? '';

    // Try to peel <thead>/<tbody> for clearer semantics.
    const theadMatch = /<thead\b[^>]*>([\s\S]*?)<\/thead>/i.exec(tableInner);
    const tbodyMatch = /<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableInner);

    let headers: string[] = [];
    let dataRowsHtml: string[] = [];

    if (theadMatch) {
        for (const rowHtml of iterateRows(theadMatch[1] ?? '')) {
            const cells: string[] = [];
            for (const cell of iterateCells(rowHtml)) cells.push(extractCellText(cell));
            if (cells.length > 0) {
                headers = cells;
                break;
            }
        }
    }

    const bodyHtml = tbodyMatch?.[1] ?? tableInner;
    for (const rowHtml of iterateRows(bodyHtml)) {
        // Skip rows already consumed by <thead>
        if (theadMatch && bodyHtml === tableInner && /(?:<th\b)/i.test(rowHtml)) {
            if (headers.length === 0) {
                const cells: string[] = [];
                for (const cell of iterateCells(rowHtml)) cells.push(extractCellText(cell));
                if (cells.length > 0) {
                    headers = cells;
                    continue;
                }
            }
            continue;
        }
        dataRowsHtml.push(rowHtml);
    }

    if (headers.length === 0) {
        // First-row-th fallback
        for (let i = 0; i < dataRowsHtml.length; i++) {
            const rowHtml = dataRowsHtml[i] as string;
            if (/(?:<th\b)/i.test(rowHtml)) {
                const cells: string[] = [];
                for (const cell of iterateCells(rowHtml)) cells.push(extractCellText(cell));
                if (cells.length > 0) {
                    headers = cells;
                    dataRowsHtml = dataRowsHtml.slice(0, i).concat(dataRowsHtml.slice(i + 1));
                    break;
                }
            }
        }
    }

    const rows: string[][] = [];
    let inferredColumnCount = headers.length;
    for (const rowHtml of dataRowsHtml) {
        const cells: string[] = [];
        for (const cell of iterateCells(rowHtml)) cells.push(extractCellText(cell));
        if (cells.length === 0) continue;
        if (inferredColumnCount === 0) inferredColumnCount = cells.length;
        rows.push(cells);
    }

    // No headers? Synthesise numeric col1..colN (recorded in warnings).
    if (headers.length === 0 && inferredColumnCount > 0) {
        headers = Array.from({ length: inferredColumnCount }, (_, i) => `col${i + 1}`);
        warnings.push('synthesised_numeric_headers');
    }

    // Pad short rows + record warnings.
    const columnCount = headers.length;
    const normalisedRows: string[][] = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as string[];
        if (row.length === columnCount) {
            normalisedRows.push(row);
            continue;
        }
        if (row.length < columnCount) {
            const padded = [...row];
            while (padded.length < columnCount) padded.push('');
            warnings.push(`row_${i}_padded_${columnCount - row.length}_empty`);
            normalisedRows.push(padded);
        } else {
            warnings.push(`row_${i}_truncated_${row.length - columnCount}_cells`);
            normalisedRows.push(row.slice(0, columnCount));
        }
    }

    return Object.freeze({
        headers: Object.freeze(headers),
        rows: Object.freeze(normalisedRows.map((r) => Object.freeze(r) as ReadonlyArray<string>)),
        rowCount: normalisedRows.length,
        columnCount,
        warnings: Object.freeze(warnings),
    });
}

/**
 * Detect whether a Surya `Table` block looks like a lab table (param × value
 * rows). Returns a heuristic score in [0,1] — caller decides threshold.
 *
 *   score = 0.5 if column count in [2, 8]
 *         + 0.25 if at least one header matches /resultado|valor|concentra|unit/i
 *         + 0.25 if at least 3 data rows
 */
export function scoreLabTableLikelihood(schema: LabTableSchema): number {
    if (!schema || typeof schema !== 'object') return 0;
    let score = 0;
    if (schema.columnCount >= 2 && schema.columnCount <= 8) score += 0.5;
    const labHeaderRe = /resultado|valor|concentra|unidade|unit|param|substanc/i;
    if (schema.headers.some((h) => labHeaderRe.test(h))) score += 0.25;
    if (schema.rowCount >= 3) score += 0.25;
    return Math.min(1, score);
}
