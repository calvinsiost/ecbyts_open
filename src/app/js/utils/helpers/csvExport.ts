// @ts-check
// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under AGPL-3.0-only
/* ================================================================
   CSV EXPORT — reusable utility for table exports.
   RFC 4180 compliant: doubled-quote escape, CRLF line break, UTF-8 BOM
   for Excel compatibility, JSON.stringify for object cells.
   ================================================================ */

/**
 * Escape a single value for CSV cell.
 * Wraps in double quotes if contains comma/quote/newline; doubles internal quotes.
 * Objects → JSON.stringify (safe — never raw [object Object]).
 */
export function toCsvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    let s: string;
    if (typeof value === 'object') {
        try {
            s = JSON.stringify(value);
        } catch {
            s = '';
        }
    } else {
        s = String(value);
    }
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
}

/**
 * Build a CSV string from header columns + rows of values.
 * @param headers Column names (also used as keys if rows are objects).
 * @param rows Array of arrays OR array of objects keyed by header.
 * @returns CSV string with CRLF line breaks (RFC 4180).
 */
export function toCsv(headers: string[], rows: Array<unknown[] | Record<string, unknown>>): string {
    const headerLine = headers.map(toCsvCell).join(',');
    const bodyLines = rows.map((row) => {
        const cells = Array.isArray(row) ? row : headers.map((h) => (row as Record<string, unknown>)[h]);
        return cells.map(toCsvCell).join(',');
    });
    return [headerLine, ...bodyLines].join('\r\n');
}

/**
 * Trigger browser download of a CSV string as a file.
 * Prepends UTF-8 BOM (U+FEFF) so Excel opens it with correct encoding.
 * @param csv CSV string (from toCsv() or hand-built).
 * @param filename Desired filename (will append .csv if missing).
 */
export function downloadCsv(csv: string, filename: string): void {
    const ext = filename.endsWith('.csv') ? '' : '.csv';
    const fullName = filename + ext;
    const bom = '﻿';
    const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fullName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Build CSV from headers + rows AND trigger download in one call.
 * Convenience wrapper for the common pattern.
 */
export function exportCsv(headers: string[], rows: Array<unknown[] | Record<string, unknown>>, filename: string): void {
    downloadCsv(toCsv(headers, rows), filename);
}

/**
 * Format current date as YYYY-MM-DD for filename suffix.
 */
export function csvDateSuffix(): string {
    const d = new Date();
    return d.toISOString().slice(0, 10);
}
