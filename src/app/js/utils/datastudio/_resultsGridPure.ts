// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DATA STUDIO RESULTS GRID — PURE LOGIC
   Lógica pura do grid de resultados (sem DOM, sem execução SQL)

   Extraído de resultsGrid.ts (ARCH-MONOLITH-ATOMIZATION-001):
   - ordenação estável de linhas por coluna (comparador puro)
   - serialização CSV (escaping RFC4180-like)
   - transformação linhas→objetos (export JSON)
   - rótulo de result set ("Set N · Rr × Cc")

   Comportamento idêntico ao inline original — provado por cheap test.
   ================================================================ */

export type ResultRow = readonly unknown[];

export interface ResultSetShape {
    readonly columns: readonly string[];
    readonly values: readonly ResultRow[];
}

/**
 * Compare two cell values for sorting, matching the original inline
 * comparator in resultsGrid._renderTable:
 *   - both null → equal (0)
 *   - one null → null sorts first when ascending, last when descending
 *   - both numbers → numeric compare
 *   - otherwise → localeCompare on String()
 *
 * @param a left cell value
 * @param b right cell value
 * @param ascending sort direction
 * @returns negative / 0 / positive
 */
export function compareCells(a: unknown, b: unknown, ascending: boolean): number {
    if (a == null && b == null) return 0;
    if (a == null) return ascending ? -1 : 1;
    if (b == null) return ascending ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') {
        return ascending ? a - b : b - a;
    }
    return ascending
        ? String(a).localeCompare(String(b))
        : String(b).localeCompare(String(a));
}

/**
 * Sort rows by a column index without mutating the input.
 * When sortCol < 0 the original order is preserved (returns a shallow copy).
 *
 * @param values rows (array of arrays)
 * @param sortCol column index, or -1 for "no sort"
 * @param ascending sort direction
 * @returns a new array of rows
 */
export function sortRows(
    values: readonly ResultRow[],
    sortCol: number,
    ascending: boolean,
): ResultRow[] {
    const copy = [...values];
    if (sortCol < 0) return copy;
    return copy.sort((a, b) => compareCells(a[sortCol], b[sortCol], ascending));
}

/**
 * Escape a single CSV field per the original inline rule:
 * quote when the value contains a comma, double-quote, or newline;
 * double up embedded quotes. null/undefined become empty string.
 *
 * @param value cell value
 * @returns escaped field
 */
export function escapeCsvField(value: unknown): string {
    const s = value == null ? '' : String(value);
    return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
}

/**
 * Build the full CSV text (header + rows) from columns and values.
 * Rows are joined with '\n', matching the original export.
 *
 * @param columns column names
 * @param values rows
 * @returns CSV string (empty string when there are no columns)
 */
export function buildCsv(
    columns: readonly string[],
    values: readonly ResultRow[],
): string {
    if (!columns.length) return '';
    const header = columns.map(escapeCsvField).join(',');
    const rows = values.map((row) => row.map(escapeCsvField).join(','));
    return [header, ...rows].join('\n');
}

/**
 * Transform rows (array of arrays) into an array of objects keyed by column
 * name — the shape used by the JSON export. Mirrors the original inline map.
 *
 * @param columns column names
 * @param values rows
 * @returns array of plain objects (empty array when there are no columns)
 */
export function rowsToObjects(
    columns: readonly string[],
    values: readonly ResultRow[],
): Array<Record<string, unknown>> {
    if (!columns.length) return [];
    return values.map((row) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col, i) => {
            obj[col] = row[i];
        });
        return obj;
    });
}

/**
 * Compact human label for a result set: "Set {idx+1} · {rows}r × {cols}c".
 * Mirrors the original inline _setLabel.
 *
 * @param set result set (columns/values may be missing)
 * @param idx zero-based set index
 * @returns label string
 */
export function formatSetLabel(
    set: { columns?: readonly string[]; values?: readonly ResultRow[] } | null | undefined,
    idx: number,
): string {
    const cols = set?.columns?.length || 0;
    const rows = set?.values?.length || 0;
    return `Set ${idx + 1} · ${rows}r × ${cols}c`;
}
