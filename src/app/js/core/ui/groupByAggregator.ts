// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// UX-86 - Group-By Aggregator (pure-logic, zero DOM)
// Engine de agrupamento e agregação para pivot tables, list views e relatórios.
// Imutável: nunca muta input items.

const NULL_KEY = '_null_';

const VALID_AGG_FNS = new Set([
    'sum',
    'count',
    'avg',
    'min',
    'max',
    'median',
    'stddev',
    'distinct',
    'first',
    'last',
    'concat',
]);

function normalizeKey(k: any) {
    if (k === null || k === undefined) return NULL_KEY;
    return k;
}

/**
 * Agrupa items por chave derivada de keyFn.
 * @param {Array<any>} items
 * @param {Function} keyFn (item) => string|number|null
 * @returns {Map<any, Array<any>>}
 */
export function groupBy(items: Array<any>, keyFn: Function): Map<any, Array<any>> {
    const out = new Map();
    if (!Array.isArray(items) || items.length === 0) return out;
    if (typeof keyFn !== 'function') {
        throw new TypeError('groupBy: keyFn must be a function');
    }
    for (const item of items) {
        const k = normalizeKey(keyFn(item));
        if (!out.has(k)) out.set(k, []);
        out.get(k).push(item);
    }
    return out;
}

/**
 * Agrupa em árvore aninhada por múltiplas keyFns.
 * @param {Array<any>} items
 * @param {Function[]} keyFns
 * @returns {Map<any, any>} aninhado; folha é Array de items
 */
export function groupByMulti(items: Array<any>, keyFns: Function[]): Map<any, any> {
    if (!Array.isArray(keyFns) || keyFns.length === 0) {
        throw new TypeError('groupByMulti: keyFns must be a non-empty array');
    }
    if (keyFns.length === 1) return groupBy(items, keyFns[0] as Function);
    const top = groupBy(items, keyFns[0] as Function);
    const rest = keyFns.slice(1);
    const out = new Map();
    for (const [k, sub] of top.entries()) {
        out.set(k, groupByMulti(sub, rest));
    }
    return out;
}

function numericValues(values: any) {
    const out = [];
    for (const v of values) {
        if (v === null || v === undefined) continue;
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isNaN(n)) continue;
        out.push(n);
    }
    return out;
}

function median(nums: any) {
    if (nums.length === 0) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(nums: any) {
    if (nums.length === 0) return 0;
    const mean = nums.reduce((a: any, b: any) => a + b, 0) / nums.length;
    const variance =
        nums.reduce((acc: any, n: any) => acc + (n - mean) ** 2, 0) /
        nums.length;
    return Math.sqrt(variance);
}

/**
 * Agrega array de valores via fn nomeada.
 * @param {Array<any>} values
 * @param {string} fn
 * @returns {number|any}
 */
export function aggregate(values: Array<any>, fn: string): number | any {
    if (!VALID_AGG_FNS.has(fn)) {
        throw new Error(`aggregate: invalid aggFn "${fn}"`);
    }
    const arr = Array.isArray(values) ? values : [];
    if (fn === 'count') return arr.length;
    if (fn === 'distinct') return new Set(arr).size;
    if (fn === 'first') return arr.length > 0 ? arr[0] : null;
    if (fn === 'last') return arr.length > 0 ? arr[arr.length - 1] : null;
    if (fn === 'concat') return arr.slice();

    const nums = numericValues(arr);
    if (fn === 'sum') return nums.reduce((a, b) => a + b, 0);
    if (fn === 'avg') return nums.length === 0 ? 0 : nums.reduce((a, b) => a + b, 0) / nums.length;
    if (fn === 'min') return nums.length === 0 ? 0 : Math.min(...nums);
    if (fn === 'max') return nums.length === 0 ? 0 : Math.max(...nums);
    if (fn === 'median') return median(nums);
    if (fn === 'stddev') return stddev(nums);
    return 0;
}

/**
 * Agrega items de um grupo extraindo valor via valueFn.
 */
export function aggregateGroup(group: any, valueFn: any, aggFn: any) {
    if (!VALID_AGG_FNS.has(aggFn)) {
        throw new Error(`aggregateGroup: invalid aggFn "${aggFn}"`);
    }
    if (typeof valueFn !== 'function') {
        throw new TypeError('aggregateGroup: valueFn must be a function');
    }
    const items = Array.isArray(group) ? group : [];
    const values = items.map(valueFn);
    return aggregate(values, aggFn);
}

/**
 * Resumo numérico completo de um grupo (assume valores numéricos diretos).
 */
export function summarizeGroup(group: any) {
    const items = Array.isArray(group) ? group : [];
    const nums = numericValues(items);
    const count = nums.length;
    if (count === 0) {
        return { count: 0, sum: 0, avg: 0, min: 0, max: 0, median: 0 };
    }
    const sum = nums.reduce((a, b) => a + b, 0);
    return {
        count,
        sum,
        avg: sum / count,
        min: Math.min(...nums),
        max: Math.max(...nums),
        median: median(nums),
    };
}

/**
 * Pivot: rowKey × colKey → aggregated valueKey.
 */
export function pivotItems(
    items: any,
    {
        rowKey,
        colKey,
        valueKey,
        aggFn = 'sum',
    }: { rowKey?: any; colKey?: any; valueKey?: any; aggFn?: string } = {},
) {
    if (typeof rowKey !== 'function' || typeof colKey !== 'function' || typeof valueKey !== 'function') {
        throw new TypeError('pivotItems: rowKey/colKey/valueKey must be functions');
    }
    if (!VALID_AGG_FNS.has(aggFn)) {
        throw new Error(`pivotItems: invalid aggFn "${aggFn}"`);
    }
    const arr = Array.isArray(items) ? items : [];
    const rowSet = new Set();
    const colSet = new Set();
    const buckets = new Map(); // row -> Map<col, values[]>
    for (const item of arr) {
        const r = normalizeKey(rowKey(item));
        const c = normalizeKey(colKey(item));
        rowSet.add(r);
        colSet.add(c);
        if (!buckets.has(r)) buckets.set(r, new Map());
        const cmap = buckets.get(r);
        if (!cmap.has(c)) cmap.set(c, []);
        cmap.get(c).push(valueKey(item));
    }
    const values = new Map();
    for (const [r, cmap] of buckets.entries()) {
        const out = new Map();
        for (const [c, vs] of cmap.entries()) {
            out.set(c, aggregate(vs, aggFn));
        }
        values.set(r, out);
    }
    return {
        rows: [...rowSet].map(String),
        cols: [...colSet].map(String),
        values,
    };
}

/**
 * Achata grupo aninhado em array linear preservando parents.
 */
export function flattenGroups(groupedMap: any) {
    const out: any[] = [];
    function walk(node: any, parents: any) {
        if (!(node instanceof Map)) return;
        for (const [key, val] of node.entries()) {
            if (val instanceof Map) {
                // sub-group
                walk(val, [...parents, key]);
            } else if (Array.isArray(val)) {
                out.push({ key, count: val.length, items: val.slice(), parents: [...parents] });
            }
        }
    }
    if (groupedMap instanceof Map) walk(groupedMap, []);
    return out;
}

function sortItems(items: any, sortKey: any) {
    const arr = items.slice();
    if (typeof sortKey === 'function') {
        arr.sort((a: any, b: any) => {
            const va = sortKey(a);
            const vb = sortKey(b);
            if (va < vb) return -1;
            if (va > vb) return 1;
            return 0;
        });
    }
    return arr;
}

/**
 * Top-N items por grupo (descending por sortKey).
 */
export function topNPerGroup(groupedMap: any, n: any, sortKey: any) {
    const out = new Map();
    if (!(groupedMap instanceof Map)) return out;
    for (const [k, items] of groupedMap.entries()) {
        if (!Array.isArray(items)) continue;
        const sorted = sortItems(items, sortKey).reverse();
        out.set(k, sorted.slice(0, Math.max(0, n | 0)));
    }
    return out;
}

/**
 * Bottom-N items por grupo (ascending por sortKey).
 */
export function bottomNPerGroup(groupedMap: any, n: any, sortKey: any) {
    const out = new Map();
    if (!(groupedMap instanceof Map)) return out;
    for (const [k, items] of groupedMap.entries()) {
        if (!Array.isArray(items)) continue;
        const sorted = sortItems(items, sortKey);
        out.set(k, sorted.slice(0, Math.max(0, n | 0)));
    }
    return out;
}

/**
 * Funde grupos com count < threshold em um grupo "Other".
 */
export function mergeGroups(groupedMap: any, threshold: any) {
    const out = new Map();
    if (!(groupedMap instanceof Map)) return out;
    const t = Number(threshold) || 0;
    const other = [];
    for (const [k, items] of groupedMap.entries()) {
        if (Array.isArray(items) && items.length < t) {
            for (const it of items) other.push(it);
        } else {
            out.set(k, Array.isArray(items) ? items.slice() : items);
        }
    }
    if (other.length > 0) out.set('Other', other);
    return out;
}

/**
 * Map<key, count> a partir de groupedMap.
 */
export function getGroupCounts(groupedMap: any) {
    const out = new Map();
    if (!(groupedMap instanceof Map)) return out;
    for (const [k, items] of groupedMap.entries()) {
        out.set(k, Array.isArray(items) ? items.length : 0);
    }
    return out;
}

export const __NULL_KEY = NULL_KEY;
