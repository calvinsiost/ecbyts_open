// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Aggregator — ECBT Transformation Libraries Phase 61
 * Pure aggregation: groupBy + sum/avg/min/max/count/first/last/collect.
 * No browser, no Promise/setTimeout — synchronous execution.
 */

export type AggFunction = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'first' | 'last' | 'collect';

export type AggValue = number | string | boolean | null | ReadonlyArray<unknown>;

export type Record = { readonly [k: string]: unknown };

export type KeySpec<R extends Record = Record> = string | ((r: R) => string);

export interface AggSpec {
    readonly field: string;
    readonly fn: AggFunction | string;
    readonly as?: string;
}

export type Groups<R extends Record = Record> = Readonly<{ [groupKey: string]: ReadonlyArray<R> }>;

export interface AggregatedRow {
    readonly groupKey: string;
    readonly [k: string]: unknown;
}

export const AGGREGATOR_META: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 61,
    deliveredAt: '2026-05-02',
});

export const AGG_FUNCTIONS: ReadonlyArray<AggFunction> = Object.freeze([
    'sum',
    'avg',
    'min',
    'max',
    'count',
    'first',
    'last',
    'collect',
] as const);

/**
 * Agrupa array de registros por chave.
 */
export function groupBy<R extends Record = Record>(
    records: ReadonlyArray<R> | unknown,
    keySpec: KeySpec<R>,
): Groups<R> {
    if (!Array.isArray(records)) return Object.freeze({}) as Groups<R>;
    const keyFn: (r: R) => string =
        typeof keySpec === 'function'
            ? (keySpec as (r: R) => string)
            : (r: R) => String((r as Record)?.[keySpec as string] ?? '_unknown');
    const groups: { [k: string]: R[] } = {};
    for (const r of records as ReadonlyArray<R>) {
        const k = keyFn(r);
        if (!groups[k]) groups[k] = [];
        groups[k].push(r);
    }
    const frozen: { [k: string]: ReadonlyArray<R> } = {};
    for (const [k, v] of Object.entries(groups)) frozen[k] = Object.freeze(v);
    return Object.freeze(frozen);
}

/**
 * Aplica função de agregação a um array de valores.
 */
export function aggregate(fn: string, values: ReadonlyArray<unknown> | unknown): unknown {
    if (!(AGG_FUNCTIONS as ReadonlyArray<string>).includes(fn)) return null;
    if (!Array.isArray(values) || values.length === 0) {
        if (fn === 'count') return 0;
        if (fn === 'collect') return Object.freeze([]);
        if (fn === 'sum') return 0;
        return null;
    }
    const arr = values as ReadonlyArray<unknown>;
    const nums = arr.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    switch (fn as AggFunction) {
        case 'sum':
            return nums.reduce((a, b) => a + b, 0);
        case 'avg':
            return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
        case 'min':
            return nums.length > 0 ? Math.min(...nums) : null;
        case 'max':
            return nums.length > 0 ? Math.max(...nums) : null;
        case 'count':
            return arr.length;
        case 'first':
            return arr[0];
        case 'last':
            return arr[arr.length - 1];
        case 'collect':
            return Object.freeze(arr.slice());
        default:
            return null;
    }
}

/**
 * Agrega grupos segundo múltiplas especificações.
 */
export function aggregateGroups<R extends Record = Record>(
    groups: Groups<R> | unknown,
    specs: ReadonlyArray<AggSpec> | unknown,
): ReadonlyArray<AggregatedRow> {
    if (!groups || typeof groups !== 'object') return Object.freeze([]);
    if (!Array.isArray(specs) || specs.length === 0) return Object.freeze([]);
    const result: AggregatedRow[] = [];
    for (const [groupKey, records] of Object.entries(groups as Groups<R>)) {
        const row: { [k: string]: unknown } = { groupKey };
        for (const spec of specs as ReadonlyArray<AggSpec>) {
            if (
                !spec ||
                typeof spec.field !== 'string' ||
                !(AGG_FUNCTIONS as ReadonlyArray<string>).includes(spec.fn)
            ) {
                continue;
            }
            const alias = spec.as || `${spec.fn}_${spec.field}`;
            const values = (records as ReadonlyArray<R>).map((r) => (r as Record)?.[spec.field]);
            row[alias] = aggregate(spec.fn, values);
        }
        result.push(Object.freeze(row) as AggregatedRow);
    }
    return Object.freeze(result);
}

/**
 * Pipeline completo: groupBy + aggregateGroups.
 */
export function groupAndAggregate<R extends Record = Record>(
    records: ReadonlyArray<R> | unknown,
    keySpec: KeySpec<R>,
    specs: ReadonlyArray<AggSpec>,
): ReadonlyArray<AggregatedRow> {
    const groups = groupBy<R>(records, keySpec);
    return aggregateGroups<R>(groups, specs);
}

/**
 * Pivot: transforma resultado em mapa keyed por groupKey.
 */
export function pivotResult(
    aggregated: ReadonlyArray<AggregatedRow> | unknown,
): Readonly<{ [k: string]: AggregatedRow }> {
    if (!Array.isArray(aggregated)) return Object.freeze({});
    const pivot: { [k: string]: AggregatedRow } = {};
    for (const row of aggregated as ReadonlyArray<AggregatedRow>) {
        if (row?.groupKey !== undefined) pivot[row.groupKey] = row;
    }
    return Object.freeze(pivot);
}

/**
 * Ordena resultado por um campo.
 */
export function sortAggregated(
    aggregated: ReadonlyArray<AggregatedRow> | unknown,
    field: string,
    direction: 'asc' | 'desc' = 'desc',
): ReadonlyArray<AggregatedRow> {
    if (!Array.isArray(aggregated)) return Object.freeze([]);
    const sorted = (aggregated as ReadonlyArray<AggregatedRow>).slice().sort((a, b) => {
        const va = (a?.[field] as number | undefined) ?? 0;
        const vb = (b?.[field] as number | undefined) ?? 0;
        return direction === 'asc' ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
    return Object.freeze(sorted);
}

/**
 * Sumariza resultado de agregação.
 */
export function summarizeAggregation(
    aggregated: ReadonlyArray<AggregatedRow> | unknown,
): Readonly<{ groups: number; fields: ReadonlyArray<string> }> {
    if (!Array.isArray(aggregated)) return Object.freeze({ groups: 0, fields: Object.freeze([]) });
    const arr = aggregated as ReadonlyArray<AggregatedRow>;
    const first = arr[0];
    const fields = first ? Object.keys(first).filter((k) => k !== 'groupKey') : [];
    return Object.freeze({
        groups: arr.length,
        fields: Object.freeze(fields),
    });
}

export const pipelineAggregatorMeta: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
    exports: ReadonlyArray<string>;
    provenance: Readonly<{ generatedBy: string; disclaimerAcknowledged: boolean }>;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 61,
    deliveredAt: '2026-05-02',
    exports: Object.freeze([
        'AGGREGATOR_META',
        'AGG_FUNCTIONS',
        'groupBy',
        'aggregate',
        'aggregateGroups',
        'groupAndAggregate',
        'pivotResult',
        'sortAggregated',
        'summarizeAggregation',
    ] as const),
    provenance: Object.freeze({ generatedBy: 'AI', disclaimerAcknowledged: true }),
});
