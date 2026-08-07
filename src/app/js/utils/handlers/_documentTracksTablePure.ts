// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic OCR table reconstruction for handlers/documentTracks.ts.
// DOM-free, OCR-free (operates on already-extracted word bbox data).
// Extracted Wave CCCCC1 from documentTracks.ts _reconstructTablesFromOCR (343L handler).

export type OcrWord = {
    text?: unknown;
    bbox?: { x?: unknown; y?: unknown; width?: unknown; height?: unknown };
};

export const TABLE_DEFAULTS = Object.freeze({
    rowYThreshold: 12,
    minWordsPerPage: 8,
    minWordsPerRow: 2,
    minRows: 3,
    minCols: 2,
    colTolerance: 1,
    baseConfidence: 0.5,
    fillBonus: 0.3,
    maxConfidence: 0.8,
});

function num(v: unknown, fallback = 0): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function _normalizeThreshold(yThreshold: number): number {
    return Number.isFinite(yThreshold) && yThreshold > 0 ? yThreshold : TABLE_DEFAULTS.rowYThreshold;
}

function _normalizeMinWords(minWordsPerRow: number): number {
    return Number.isFinite(minWordsPerRow) && minWordsPerRow > 0 ? minWordsPerRow : TABLE_DEFAULTS.minWordsPerRow;
}

function _sortWordsByY(words: ReadonlyArray<OcrWord>): OcrWord[] {
    return [...words].sort((a, b) => num(a?.bbox?.y) - num(b?.bbox?.y));
}

function _flushRow(currentRow: OcrWord[], minRow: number, rows: OcrWord[][]): void {
    if (currentRow.length >= minRow) rows.push(currentRow);
}

/** Group OCR words into rows by y-proximity (within yThreshold px). */
export function groupWordsIntoRows(
    words: ReadonlyArray<OcrWord> | null | undefined,
    yThreshold: number = TABLE_DEFAULTS.rowYThreshold,
    minWordsPerRow: number = TABLE_DEFAULTS.minWordsPerRow,
): OcrWord[][] {
    if (!Array.isArray(words) || words.length === 0) return [];
    const threshold = _normalizeThreshold(yThreshold);
    const minRow = _normalizeMinWords(minWordsPerRow);
    const sorted = _sortWordsByY(words);
    const rows: OcrWord[][] = [];
    let currentRow: OcrWord[] = [sorted[0]!];
    let lastY = num(sorted[0]?.bbox?.y);
    for (let i = 1; i < sorted.length; i++) {
        const y = num(sorted[i]?.bbox?.y);
        if (Math.abs(y - lastY) > threshold) {
            _flushRow(currentRow, minRow, rows);
            currentRow = [];
            lastY = y;
        }
        currentRow.push(sorted[i]!);
    }
    _flushRow(currentRow, minRow, rows);
    return rows;
}

/** Median column count across rows (mode proxy). */
export function computeModeColumnCount(rows: ReadonlyArray<ReadonlyArray<unknown>>): number {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const counts = rows.map((r) => (Array.isArray(r) ? r.length : 0)).sort((a, b) => a - b);
    return counts[Math.floor(counts.length / 2)] ?? 0;
}

/** Keep rows whose column count is within tolerance of the mode. */
export function filterConsistentRows<T extends ReadonlyArray<unknown>>(
    rows: ReadonlyArray<T>,
    modeCount: number,
    tolerance: number = TABLE_DEFAULTS.colTolerance,
): T[] {
    if (!Array.isArray(rows)) return [];
    const tol = Number.isFinite(tolerance) && tolerance >= 0 ? tolerance : TABLE_DEFAULTS.colTolerance;
    return rows.filter((r) => Array.isArray(r) && Math.abs(r.length - modeCount) <= tol);
}

/** Confidence score for a reconstructed table grid (0.5..0.8 by fill ratio). */
export function computeTableConfidence(table: ReadonlyArray<ReadonlyArray<string>>, modeCount: number): number {
    if (!Array.isArray(table) || table.length === 0 || modeCount <= 0) return 0;
    const filled = table.flat().filter((c) => typeof c === 'string' && c.trim().length > 0).length;
    const ratio = filled / (table.length * modeCount);
    const conf = Math.min(TABLE_DEFAULTS.baseConfidence + ratio * TABLE_DEFAULTS.fillBonus, TABLE_DEFAULTS.maxConfidence);
    return Math.round(conf * 100) / 100;
}

export type ReconstructedTable = {
    table: string[][];
    confidence: number;
    page: unknown;
};

/** Full OCR → tables pipeline (pure). */
export function reconstructTablesFromOCR(
    pageResults: ReadonlyArray<{ page?: unknown; words?: ReadonlyArray<OcrWord> }> | null | undefined,
): ReconstructedTable[] {
    if (!Array.isArray(pageResults)) return [];
    const tables: ReconstructedTable[] = [];
    for (const pr of pageResults) {
        if (!pr || typeof pr !== 'object') continue;
        const words = pr.words;
        if (!Array.isArray(words) || words.length < TABLE_DEFAULTS.minWordsPerPage) continue;
        const rows = groupWordsIntoRows(words);
        if (rows.length < TABLE_DEFAULTS.minRows) continue;
        const modeCount = computeModeColumnCount(rows);
        const consistentRows = filterConsistentRows(rows, modeCount);
        if (consistentRows.length >= TABLE_DEFAULTS.minRows && modeCount >= TABLE_DEFAULTS.minCols) {
            const table = consistentRows.map((row) =>
                [...row]
                    .sort((a, b) => num(a?.bbox?.x) - num(b?.bbox?.x))
                    .map((w) => String(w?.text ?? '')),
            );
            tables.push({
                table,
                confidence: computeTableConfidence(table, modeCount),
                page: pr.page,
            });
        }
    }
    return tables;
}
