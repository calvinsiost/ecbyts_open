// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * pipelinePivot — ECBT Transformation Libraries Phase 63
 * Melt/Pivot (wide↔narrow) transformations for pipeline records.
 * Pure-logic, synchronous, no browser deps.
 */

export type RecordObj = { readonly [k: string]: unknown };

export type AggFn = (values: ReadonlyArray<unknown>) => unknown;

export interface ValidateTidyResult {
    readonly valid: boolean;
    readonly rowsWithNull: number;
}

export interface PivotShape {
    readonly rows: number;
    readonly cols: number;
}

export interface PivotSummary {
    readonly original: PivotShape;
    readonly transformed: PivotShape;
}

export const PIVOT_META: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 63,
    deliveredAt: '2026-05-02',
});

/**
 * Wide → narrow.
 */
export function melt(
    records: ReadonlyArray<RecordObj> | unknown,
    idFields: ReadonlyArray<string>,
    valueFields: ReadonlyArray<string>,
    variableField = 'variable',
    valueField = 'value',
): ReadonlyArray<RecordObj> {
    if (!Array.isArray(records) || records.length === 0) return [];
    if (!Array.isArray(valueFields) || valueFields.length === 0) return [];

    const result: RecordObj[] = [];
    for (const record of records as ReadonlyArray<RecordObj>) {
        for (const field of valueFields) {
            const row: { [k: string]: unknown } = {};
            for (const id of idFields) {
                row[id] = record[id] !== undefined ? record[id] : null;
            }
            row[variableField] = field;
            row[valueField] = record[field] !== undefined ? record[field] : null;
            result.push(Object.freeze(row));
        }
    }
    return result;
}

/**
 * Narrow → wide.
 */
export function pivot(
    records: ReadonlyArray<RecordObj> | unknown,
    idField: string,
    variableField = 'variable',
    valueField = 'value',
    aggFn?: AggFn,
): ReadonlyArray<RecordObj> {
    if (!Array.isArray(records) || records.length === 0) return [];

    const agg: AggFn =
        typeof aggFn === 'function' ? aggFn : (values) => values[values.length - 1];

    const groups = new Map<unknown, { id: unknown; cols: Map<unknown, unknown[]> }>();
    for (const record of records as ReadonlyArray<RecordObj>) {
        const key = record[idField];
        if (!groups.has(key)) {
            groups.set(key, { id: key, cols: new Map<unknown, unknown[]>() });
        }
        const group = groups.get(key)!;
        const variable = record[variableField];
        if (!group.cols.has(variable)) {
            group.cols.set(variable, []);
        }
        group.cols.get(variable)!.push(record[valueField]);
    }

    const result: RecordObj[] = [];
    for (const { id, cols } of groups.values()) {
        const row: { [k: string]: unknown } = { [idField]: id };
        for (const [variable, values] of cols.entries()) {
            row[String(variable)] = agg(values);
        }
        result.push(Object.freeze(row));
    }
    return result;
}

/**
 * Transposes a matrix.
 */
export function transpose<T = unknown>(
    matrix: ReadonlyArray<ReadonlyArray<T>> | unknown,
): Array<Array<T | null>> {
    if (!Array.isArray(matrix) || matrix.length === 0) return [];
    const m = matrix as ReadonlyArray<ReadonlyArray<T>>;
    const rows = m.length;
    const first = m[0];
    if (!first) return [];
    const cols = first.length;
    if (cols === 0) return [];

    const result: Array<Array<T | null>> = [];
    for (let c = 0; c < cols; c++) {
        const row: Array<T | null> = [];
        for (let r = 0; r < rows; r++) {
            const cell = m[r]?.[c];
            row.push(cell !== undefined ? (cell as T) : null);
        }
        result.push(row);
    }
    return result;
}

export function wideToLong(
    records: ReadonlyArray<RecordObj>,
    idFields: ReadonlyArray<string>,
    valueFields: ReadonlyArray<string>,
): ReadonlyArray<RecordObj> {
    return melt(records, idFields, valueFields);
}

export function longToWide(
    records: ReadonlyArray<RecordObj>,
    idField: string,
    variableField = 'variable',
    valueField = 'value',
    aggFn?: AggFn,
): ReadonlyArray<RecordObj> {
    return pivot(records, idField, variableField, valueField, aggFn);
}

/**
 * Validates that a tidy dataset has no nulls in required fields.
 */
export function validateTidy(
    records: ReadonlyArray<RecordObj> | unknown,
    requiredFields: ReadonlyArray<string>,
): ValidateTidyResult {
    if (!Array.isArray(records)) return { valid: false, rowsWithNull: 0 };
    if (!Array.isArray(requiredFields) || requiredFields.length === 0) {
        return { valid: true, rowsWithNull: 0 };
    }

    let rowsWithNull = 0;
    for (const record of records as ReadonlyArray<RecordObj>) {
        for (const field of requiredFields) {
            if (record[field] === null || record[field] === undefined) {
                rowsWithNull++;
                break;
            }
        }
    }
    return { valid: rowsWithNull === 0, rowsWithNull };
}

/**
 * Sumariza uma transformação pivot/melt.
 */
export function summarizePivot(
    original: ReadonlyArray<RecordObj> | unknown,
    transformed: ReadonlyArray<RecordObj> | unknown,
): PivotSummary {
    const countCols = (arr: unknown): number => {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        const first = (arr as ReadonlyArray<RecordObj>)[0];
        return first ? Object.keys(first).length : 0;
    };
    const countRows = (arr: unknown): number => (Array.isArray(arr) ? arr.length : 0);

    return {
        original: {
            rows: countRows(original),
            cols: countCols(original),
        },
        transformed: {
            rows: countRows(transformed),
            cols: countCols(transformed),
        },
    };
}

export const pipelinePivotMeta: Readonly<{
    module: string;
    spec: string;
    phase: number;
    exports: ReadonlyArray<string>;
    provenance: Readonly<{ generatedBy: string; disclaimerAcknowledged: boolean }>;
}> = Object.freeze({
    module: 'pipelinePivot',
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 63,
    exports: Object.freeze([
        'PIVOT_META',
        'melt',
        'pivot',
        'transpose',
        'wideToLong',
        'longToWide',
        'validateTidy',
        'summarizePivot',
        'pipelinePivotMeta',
    ] as const),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
});
