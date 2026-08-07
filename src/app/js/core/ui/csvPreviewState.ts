// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * CSV Preview State - UX-77
 * Pure-logic CSV/spreadsheet parser + preview state with column type inference.
 * Zero DOM. Imutável (frozen output).
 */

const DELIM_CANDIDATES = [',', ';', '\t', '|'];
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const DMY_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
const INT_RE = /^-?\d+$/;
const NUM_RE = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
const BOOL_TRUE = new Set(['true', '1', 'yes', 'y']);
const BOOL_FALSE = new Set(['false', '0', 'no', 'n']);
const BOOL_ALL = new Set([...BOOL_TRUE, ...BOOL_FALSE]);

function detectDelimiter(firstLine: any): string {
    let best = ',';
    let bestCount = -1;
    for (const d of DELIM_CANDIDATES) {
        let count = 0;
        let inQuote = false;
        for (let i = 0; i < firstLine.length; i++) {
            const ch = firstLine[i];
            if (ch === '"') inQuote = !inQuote;
            else if (!inQuote && ch === d) count++;
        }
        if (count > bestCount) {
            bestCount = count;
            best = d;
        }
    }
    return best;
}

function parseLine(line: any, delimiter: any, quote: any, escape: any): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuote = false;
    let i = 0;
    while (i < line.length) {
        const ch = line[i];
        if (inQuote) {
            if (ch === quote) {
                // Escape: doubled quote
                if (escape === quote && line[i + 1] === quote) {
                    cur += quote;
                    i += 2;
                    continue;
                }
                inQuote = false;
                i++;
                continue;
            }
            if (ch === escape && escape !== quote) {
                cur += line[i + 1] ?? '';
                i += 2;
                continue;
            }
            cur += ch;
            i++;
            continue;
        }
        if (ch === quote) {
            inQuote = true;
            i++;
            continue;
        }
        if (ch === delimiter) {
            out.push(cur);
            cur = '';
            i++;
            continue;
        }
        cur += ch;
        i++;
    }
    if (inQuote) {
        throw new Error('Unterminated quoted field');
    }
    out.push(cur);
    return out;
}

/**
 * Parse CSV text.
 * @param {string} text
 * @param {object} opts {delimiter, quote, escape, hasHeader}
 * @returns {{headers:any, rows:any, delimiter:any, lineCount:any}} frozen
 */
export function parseCSV(
    text: string,
    opts: Record<string, any> = {},
): { headers: any; rows: any; delimiter: any; lineCount: any } {
    const o = opts as any;
    const { quote = '"', escape = '"', hasHeader = true } = o;
    let { delimiter = ',' } = o;
    if (typeof text !== 'string') throw new Error('text must be string');
    if (delimiter !== 'auto' && (typeof delimiter !== 'string' || delimiter.length === 0)) {
        throw new Error('Invalid delimiter');
    }
    if (text.length === 0) {
        return Object.freeze({
            headers: Object.freeze([]),
            rows: Object.freeze([]),
            delimiter: delimiter === 'auto' ? ',' : delimiter,
            lineCount: 0,
        });
    }
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Split by newlines respecting quotes
    const lines: string[] = [];
    let buf = '';
    let inQuote = false;
    for (let i = 0; i < normalized.length; i++) {
        const ch = normalized[i] as string;
        if (ch === quote) {
            if (inQuote && normalized[i + 1] === quote) {
                buf += ch + ch;
                i++;
                continue;
            }
            inQuote = !inQuote;
            buf += ch;
            continue;
        }
        if (ch === '\n' && !inQuote) {
            lines.push(buf);
            buf = '';
            continue;
        }
        buf += ch;
    }
    if (buf.length > 0) lines.push(buf);
    if (lines.length === 0) {
        return Object.freeze({
            headers: Object.freeze([]),
            rows: Object.freeze([]),
            delimiter: delimiter === 'auto' ? ',' : delimiter,
            lineCount: 0,
        });
    }
    if (delimiter === 'auto') {
        delimiter = detectDelimiter(lines[0]);
    }
    const parsedLines = lines.map((l) => parseLine(l, delimiter, quote, escape));
    let headers;
    let rows;
    if (hasHeader) {
        headers = parsedLines[0] || [];
        rows = parsedLines.slice(1);
    } else {
        const colCount = parsedLines[0]?.length || 0;
        headers = Array.from({ length: colCount }, (_, i) => `col_${i + 1}`);
        rows = parsedLines;
    }
    const frozenRows = Object.freeze(rows.map((r) => Object.freeze(r.slice())));
    return Object.freeze({
        headers: Object.freeze(headers.slice()),
        rows: frozenRows,
        delimiter,
        lineCount: lines.length,
    });
}

function isEmpty(s: any): boolean {
    return s == null || s === '';
}

/**
 * Infer column type from samples.
 */
export function inferColumnType(samples: any): string {
    if (!Array.isArray(samples)) throw new Error('samples must be array');
    const nonEmpty = samples.filter((s) => !isEmpty(s));
    if (nonEmpty.length === 0) return 'string';
    const allBool = nonEmpty.every((s) => BOOL_ALL.has(String(s).toLowerCase()));
    if (allBool) return 'boolean';
    const allInt = nonEmpty.every((s) => INT_RE.test(String(s).trim()));
    if (allInt) return 'integer';
    const allNum = nonEmpty.every((s) => NUM_RE.test(String(s).trim()));
    if (allNum) return 'number';
    const allDate = nonEmpty.every((s) => {
        const t = String(s).trim();
        return ISO_DATE_RE.test(t) || DMY_DATE_RE.test(t);
    });
    if (allDate) return 'date';
    return 'string';
}

export function inferAllColumnTypes(parsed: any): readonly string[] {
    if (!parsed || !Array.isArray(parsed.headers)) throw new Error('Invalid parsed');
    const types: string[] = [];
    for (let c = 0; c < parsed.headers.length; c++) {
        const samples = parsed.rows.map((r: any) => r[c]);
        types.push(inferColumnType(samples));
    }
    return Object.freeze(types);
}

/**
 * Cast strValue per type. Returns null on empty/error.
 */
export function castValue(strValue: any, type: any): any {
    if (isEmpty(strValue)) return null;
    const s = String(strValue).trim();
    switch (type) {
        case 'integer': {
            if (!INT_RE.test(s)) return null;
            const n = parseInt(s, 10);
            return Number.isFinite(n) ? n : null;
        }
        case 'number': {
            if (!NUM_RE.test(s)) return null;
            const n = parseFloat(s);
            return Number.isFinite(n) ? n : null;
        }
        case 'boolean': {
            const l = s.toLowerCase();
            if (BOOL_TRUE.has(l)) return true;
            if (BOOL_FALSE.has(l)) return false;
            return null;
        }
        case 'date': {
            let iso = s;
            if (DMY_DATE_RE.test(s)) {
                const dmy = s.split('/');
                const d = dmy[0] as string;
                const m = dmy[1] as string;
                const y = dmy[2] as string;
                iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            } else if (!ISO_DATE_RE.test(s)) {
                return null;
            }
            const dt = new Date(iso);
            return Number.isNaN(dt.getTime()) ? null : dt;
        }
        case 'string':
        default:
            return s;
    }
}

export function createPreviewState(parsed: any, types: any, maxPreviewRows = 20): Readonly<any> {
    if (!parsed || !Array.isArray(parsed.headers)) throw new Error('Invalid parsed');
    if (!Array.isArray(types)) throw new Error('types must be array');
    if (types.length !== parsed.headers.length) throw new Error('types length mismatch');
    if (!Number.isInteger(maxPreviewRows) || maxPreviewRows < 0) throw new Error('Invalid maxPreviewRows');
    return Object.freeze({
        parsed,
        types: Object.freeze(types.slice()),
        maxPreviewRows,
    });
}

export function getPreviewRows(state: any): Array<Readonly<Record<string, any>>> {
    if (!state || !state.parsed) throw new Error('Invalid state');
    const { parsed, types, maxPreviewRows } = state;
    const slice = parsed.rows.slice(0, maxPreviewRows);
    return slice.map((row: any) => {
        const obj: Record<string, any> = {};
        for (let i = 0; i < parsed.headers.length; i++) {
            obj[parsed.headers[i]] = castValue(row[i], types[i]);
        }
        return Object.freeze(obj);
    });
}

export function getColumnSummary(state: any, columnIndex: any): Readonly<any> {
    if (!state || !state.parsed) throw new Error('Invalid state');
    if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= state.parsed.headers.length) {
        throw new Error('columnIndex out of bounds');
    }
    const type = state.types[columnIndex];
    const raw = state.parsed.rows.map((r: any) => r[columnIndex]);
    let nullCount = 0;
    const counts = new Map<string, number>();
    const cast: any[] = [];
    for (const v of raw) {
        if (isEmpty(v)) {
            nullCount++;
            continue;
        }
        const c = castValue(v, type);
        if (c === null) {
            nullCount++;
            continue;
        }
        cast.push(c);
        const key = c instanceof Date ? c.toISOString() : String(c);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const distinctCount = counts.size;
    let mostCommon = null;
    let mostCount = 0;
    for (const [k, v] of counts) {
        if (v > mostCount) {
            mostCount = v;
            mostCommon = k;
        }
    }
    let min = null;
    let max = null;
    let mean = null;
    if (type === 'integer' || type === 'number') {
        if (cast.length > 0) {
            min = Math.min(...cast);
            max = Math.max(...cast);
            mean = cast.reduce((a, b) => a + b, 0) / cast.length;
        }
    } else if (type === 'date') {
        if (cast.length > 0) {
            const ts = cast.map((d) => d.getTime());
            min = new Date(Math.min(...ts));
            max = new Date(Math.max(...ts));
            mean = null;
        }
    } else {
        if (cast.length > 0) {
            const sorted = cast.slice().sort();
            min = sorted[0];
            max = sorted[sorted.length - 1];
        }
    }
    return Object.freeze({ min, max, mean, distinctCount, nullCount, mostCommon });
}

export function validateCSV(text: any): Readonly<{ valid: boolean; errors: readonly any[]; warnings: readonly any[] }> {
    const errors: any[] = [];
    const warnings: any[] = [];
    if (typeof text !== 'string') {
        return Object.freeze({
            valid: false,
            errors: Object.freeze(['text must be string']),
            warnings: Object.freeze([]),
        });
    }
    if (text.length === 0) {
        return Object.freeze({ valid: false, errors: Object.freeze(['empty input']), warnings: Object.freeze([]) });
    }
    // Encoding suspect: BOM or replacement char
    if (text.charCodeAt(0) === 0xfeff) warnings.push('BOM detected');
    if (text.includes('�')) warnings.push('replacement character detected — possible encoding issue');
    let parsed;
    try {
        parsed = parseCSV(text, { delimiter: 'auto' });
    } catch (e) {
        errors.push((e as any)?.message);
        return Object.freeze({
            valid: false,
            errors: Object.freeze(errors),
            warnings: Object.freeze(warnings),
        });
    }
    const expected = parsed.headers.length;
    parsed.rows.forEach((row: any, idx: any) => {
        if (row.length !== expected) {
            errors.push(`row ${idx + 1}: expected ${expected} columns, got ${row.length}`);
        }
    });
    return Object.freeze({
        valid: errors.length === 0,
        errors: Object.freeze(errors),
        warnings: Object.freeze(warnings),
    });
}

export function summarizeCSV(state: any): Readonly<any> {
    if (!state || !state.parsed) throw new Error('Invalid state');
    return Object.freeze({
        rowCount: state.parsed.rows.length,
        columnCount: state.parsed.headers.length,
        types: Object.freeze(state.types.slice()),
        hasHeader: true,
        delimiter: state.parsed.delimiter,
    });
}
