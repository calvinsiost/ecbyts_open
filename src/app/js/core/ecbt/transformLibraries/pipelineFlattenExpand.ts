// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Flatten/Expand — ECBT Transformation Libraries Phase 64
 * Transformacoes de estruturas aninhadas: flatten, expand, explode, implode, truncate.
 * Pure-logic, no browser/DOM/setTimeout/Promise.
 */

export type RecordObj = { readonly [k: string]: unknown };

export interface FlattenSummary {
    readonly original: Readonly<{ fields: number; nested: number }>;
    readonly flat: Readonly<{ fields: number }>;
}

export const FLATTEN_EXPAND_META: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 64,
    deliveredAt: '2026-05-02',
});

/**
 * Achata um objeto aninhado em um objeto plano com chaves compostas.
 */
export function flattenObject(
    obj: RecordObj | null | undefined | unknown,
    separator = '.',
    prefix = '',
    maxDepth = Infinity,
    _depth = 0,
): Readonly<{ [k: string]: unknown }> {
    if (obj === null || obj === undefined) return Object.freeze({});
    if (typeof obj !== 'object' || Array.isArray(obj)) {
        if (prefix) return Object.freeze({ [prefix]: obj });
        return Object.freeze({});
    }

    const o = obj as RecordObj;
    const result: { [k: string]: unknown } = {};
    for (const key of Object.keys(o)) {
        const fullKey = prefix ? `${prefix}${separator}${key}` : key;
        const val = o[key];

        if (val !== null && typeof val === 'object' && !Array.isArray(val) && _depth < maxDepth) {
            const nested = flattenObject(val as RecordObj, separator, fullKey, maxDepth, _depth + 1);
            Object.assign(result, nested);
        } else {
            result[fullKey] = val;
        }
    }
    return Object.freeze(result);
}

/**
 * Expande um campo objeto em multiplas colunas com prefixo.
 */
export function expandField(
    record: RecordObj | null | undefined,
    fieldName: string,
    prefix = '',
): RecordObj | null {
    if (record === null || record === undefined) return null;
    const fieldValue = record[fieldName];
    if (fieldValue === null || typeof fieldValue !== 'object' || Array.isArray(fieldValue)) {
        return Object.freeze(Object.assign({}, record));
    }

    const colPrefix = prefix !== '' ? prefix : `${fieldName}_`;
    const expanded: { [k: string]: unknown } = {};
    for (const [k, v] of Object.entries(record)) {
        if (k === fieldName) continue;
        expanded[k] = v;
    }
    for (const [k, v] of Object.entries(fieldValue as RecordObj)) {
        expanded[`${colPrefix}${k}`] = v;
    }
    return Object.freeze(expanded);
}

/**
 * Achata array de records.
 */
export function flattenRecords(
    records: ReadonlyArray<RecordObj> | null | undefined | unknown,
    separator = '.',
): ReadonlyArray<RecordObj> {
    if (!records || !Array.isArray(records)) return Object.freeze([]);
    return Object.freeze(
        (records as ReadonlyArray<RecordObj>).map((r) => flattenObject(r, separator)),
    );
}

/**
 * Heurística simples de singularização.
 */
function _singularize(name: string): string {
    if (name.endsWith('ies')) return name.slice(0, -3) + 'y';
    if (name.endsWith('ses') || name.endsWith('xes') || name.endsWith('zes')) {
        return name.slice(0, -2);
    }
    if (name.endsWith('s') && name.length > 2) return name.slice(0, -1);
    return name;
}

/**
 * Expande array embutido em linhas separadas.
 */
export function explodeArray(
    records: ReadonlyArray<RecordObj> | null | undefined | unknown,
    arrayField: string,
    outputField?: string,
): ReadonlyArray<RecordObj> {
    if (!records || !Array.isArray(records)) return Object.freeze([]);

    const outField = outputField !== undefined ? outputField : _singularize(arrayField);
    const result: RecordObj[] = [];

    for (const record of records as ReadonlyArray<RecordObj>) {
        const arr = record[arrayField];
        if (!Array.isArray(arr)) {
            result.push(Object.freeze(Object.assign({}, record)));
            continue;
        }
        for (const item of arr) {
            const row: { [k: string]: unknown } = {};
            for (const [k, v] of Object.entries(record)) {
                if (k === arrayField) continue;
                row[k] = v;
            }
            row[outField] = item;
            result.push(Object.freeze(row));
        }
    }
    return Object.freeze(result);
}

/**
 * Inverso de explodeArray: agrega valores em array por idField.
 */
export function implodeArray(
    records: ReadonlyArray<RecordObj> | null | undefined | unknown,
    idField: string,
    valueField: string,
    targetField: string,
): ReadonlyArray<RecordObj> {
    if (!records || !Array.isArray(records)) return Object.freeze([]);

    const map = new Map<unknown, { [k: string]: unknown }>();
    const order: unknown[] = [];

    for (const record of records as ReadonlyArray<RecordObj>) {
        const id = record[idField];
        if (!map.has(id)) {
            const base: { [k: string]: unknown } = {};
            for (const [k, v] of Object.entries(record)) {
                if (k === valueField) continue;
                base[k] = v;
            }
            base[targetField] = [];
            map.set(id, base);
            order.push(id);
        }
        const entry = map.get(id);
        if (entry) {
            (entry[targetField] as unknown[]).push(record[valueField]);
        }
    }

    return Object.freeze(
        order.map((id) => {
            const v = map.get(id);
            return Object.freeze(v as RecordObj);
        }),
    );
}

/**
 * Trunca strings longas.
 */
export function truncateStrings(
    record: RecordObj | null | undefined,
    maxLength = 100,
): RecordObj | null {
    if (record === null || record === undefined) return null;
    const result: { [k: string]: unknown } = {};
    for (const [k, v] of Object.entries(record)) {
        result[k] = typeof v === 'string' && v.length > maxLength ? v.slice(0, maxLength) : v;
    }
    return Object.freeze(result);
}

/**
 * Sumariza resultado de flatten.
 */
export function summarizeFlatten(
    original: RecordObj | null | undefined,
    flat: RecordObj | null | undefined,
): FlattenSummary {
    const originalFields = original ? Object.keys(original).length : 0;
    const nestedCount = original
        ? Object.values(original).filter(
              (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
          ).length
        : 0;
    const flatFields = flat ? Object.keys(flat).length : 0;

    return Object.freeze({
        original: Object.freeze({ fields: originalFields, nested: nestedCount }),
        flat: Object.freeze({ fields: flatFields }),
    });
}

export const pipelineFlattenExpandMeta: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
    exports: ReadonlyArray<string>;
    provenance: Readonly<{ generatedBy: string; disclaimerAcknowledged: boolean }>;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 64,
    deliveredAt: '2026-05-02',
    exports: Object.freeze([
        'FLATTEN_EXPAND_META',
        'flattenObject',
        'expandField',
        'flattenRecords',
        'explodeArray',
        'implodeArray',
        'truncateStrings',
        'summarizeFlatten',
        'pipelineFlattenExpandMeta',
    ] as const),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
});
