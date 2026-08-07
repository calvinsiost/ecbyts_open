// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Window Functions - Phase 65 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S65
 *
 * Phase 65 (2026-05-02) - pure-logic analytical window functions:
 * rolling aggregates, cumulative, ranking, lag/lead, partitioned windows.
 *
 * NÃO depende de browser. Sem setTimeout/Promise/DOM.
 *
 * Owner: Claude (orquestrador)
 */

/** Identidade do módulo. */
export const WINDOW_FUNCTIONS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 65,
    deliveredAt: '2026-05-02',
});

/** Window function types canônicos. */
export const WINDOW_TYPES = Object.freeze([
    'rollingMean',
    'rollingSum',
    'rollingMin',
    'rollingMax',
    'cumulativeSum',
    'rank',
    'denseRank',
    'pctRank',
    'lagField',
    'leadField',
]);

/**
 * @typedef {Record<string, unknown>} WindowRecord
 */

/**
 * @typedef {{ descending?: boolean }} RankingOptions
 */

/**
 * @typedef {'mean' | 'sum' | 'min' | 'max'} RollingAggregation
 */

/**
 * @typedef {(partitionRecords: Array<WindowRecord>) => Array<WindowRecord>} PartitionWindowFn
 */

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extrai valor numérico de um registro para o campo dado.
 */
/**
 * @param {WindowRecord} rec
 * @param {string} unknown>
 * @returns {number | null}
 */
function _num(rec: Record<string, unknown>, field: string): number | null {
    const v = rec[field];
    return v !== null && v !== undefined && Number.isFinite(Number(v)) ? Number(v) : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

interface RollingOptions {
    descending?: boolean;
}

/**
 * Aplica função de agregação sobre janela deslizante de `windowSize` registros.
 * Retorna null nos registros com dados insuficientes (menos de windowSize itens disponíveis).
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} unknown>>
 * @param {number} field
 * @param {RollingAggregation} windowSize
 * @param {string} [fn]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function rollingWindow(
    records: Array<Record<string, unknown>>,
    field: string,
    windowSize: number,
    fn: 'mean' | 'sum' | 'min' | 'max',
    targetField?: string,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const out = field + '_rolling_' + fn;
    const tgt = targetField || out;
    const size = Math.max(1, Math.floor(windowSize));
    /** @type {Record<RollingAggregation, (arr: number[]) => number>} */
    const FUNS: Record<string, (arr: number[]) => number> = {
        mean: (arr) => arr.reduce((a, b) => a + b, 0) / arr.length,
        sum: (arr) => arr.reduce((a, b) => a + b, 0),
        min: (arr) => Math.min(...arr),
        max: (arr) => Math.max(...arr),
    };
    const agg = FUNS[fn];
    if (!agg) return Object.freeze(records.map((r) => Object.freeze({ ...r, [tgt]: null })));

    return Object.freeze(
        records.map((rec, i) => {
            if (i < size - 1) return Object.freeze({ ...rec, [tgt]: null });
            /** @type {number[]} */
            const window: number[] = [];
            for (let j = i - size + 1; j <= i; j++) {
                const v = _num(records[j]!, field);
                if (v === null) {
                    return Object.freeze({ ...rec, [tgt]: null });
                }
                window.push(v);
            }
            return Object.freeze({ ...rec, [tgt]: agg(window) });
        }),
    );
}

/**
 * Soma cumulativa de um campo numérico.
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} unknown>>
 * @param {string} [field]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function cumulativeSum(
    records: Array<Record<string, unknown>>,
    field: string,
    targetField?: string,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const tgt = targetField || field + '_cumsum';
    let running = 0;
    return Object.freeze(
        records.map((rec) => {
            const v = _num(rec, field);
            if (v === null) return Object.freeze({ ...rec, [tgt]: null });
            running += v;
            return Object.freeze({ ...rec, [tgt]: running });
        }),
    );
}

/**
 * Rank 1-based com ties iguais e lacunas (standard competition ranking).
 * Adiciona `_rank` em cada registro.
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} field
 * @param {RankingOptions} [options]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function rankRecords(
    records: Array<Record<string, unknown>>,
    field: string,
    options: RollingOptions = {},
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const desc = options.descending !== false;
    const indexed = records.map((r, i) => ({ r, i, v: _num(r, field) }));
    indexed.sort((a, b) => {
        if (a.v === null && b.v === null) return 0;
        if (a.v === null) return 1;
        if (b.v === null) return -1;
        return desc ? b.v - a.v : a.v - b.v;
    });
    // assign ranks
    const rankMap: Array<number | null> = new Array(records.length);
    let pos = 0;
    while (pos < indexed.length) {
        const { v } = indexed[pos]!;
        let end = pos;
        while (end + 1 < indexed.length && indexed[end + 1]!.v === v) end++;
        const r = pos + 1; // 1-based
        for (let k = pos; k <= end; k++) rankMap[indexed[k]!.i] = v === null ? null : r;
        pos = end + 1;
    }
    return Object.freeze(records.map((rec, i) => Object.freeze({ ...rec, _rank: rankMap[i] })));
}

/**
 * Dense rank (ties iguais, sem lacunas).
 * Adiciona `_dense_rank` em cada registro.
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} field
 * @param {RankingOptions} [options]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function denseRankRecords(
    records: Array<Record<string, unknown>>,
    field: string,
    options: RollingOptions = {},
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const desc = options.descending !== false;
    const indexed = records.map((r, i) => ({ r, i, v: _num(r, field) }));
    indexed.sort((a, b) => {
        if (a.v === null && b.v === null) return 0;
        if (a.v === null) return 1;
        if (b.v === null) return -1;
        return desc ? b.v - a.v : a.v - b.v;
    });
    const rankMap: Array<number | null> = new Array(records.length);
    let denseRank = 0;
    let prevVal: number | null | undefined = undefined;
    for (const item of indexed) {
        if (item.v === null) {
            rankMap[item.i] = null;
            continue;
        }
        if (item.v !== prevVal) {
            denseRank++;
            prevVal = item.v;
        }
        rankMap[item.i] = denseRank;
    }
    return Object.freeze(records.map((rec, i) => Object.freeze({ ...rec, _dense_rank: rankMap[i] })));
}

/**
 * Percentile rank: posição relativa 0..1 (0 = menor, 1 = maior em asc; invertido em desc).
 * Adiciona `_pct_rank` em cada registro.
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} field
 * @param {RankingOptions} [options]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function pctRankRecords(
    records: Array<Record<string, unknown>>,
    field: string,
    options: RollingOptions = {},
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const desc = options.descending !== false;
    const ranked = rankRecords(records, field, options) as Array<Record<string, unknown>>;
    const nonNull = records.filter((r) => _num(r, field) !== null).length;
    if (nonNull <= 1) {
        return Object.freeze(ranked.map((r) => Object.freeze({ ...r, _pct_rank: r._rank === null ? null : 0 })));
    }
    return Object.freeze(
        ranked.map((r) => {
            const rank = r._rank;
            if (typeof rank !== 'number') return Object.freeze({ ...r, _pct_rank: null });
            const pct = (rank - 1) / (nonNull - 1);
            return Object.freeze({ ...r, _pct_rank: desc ? pct : 1 - pct });
        }),
    );
}

/**
 * Lag: desloca o valor de `field` em `n` posições para trás (o registro i recebe o valor do registro i-n).
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} unknown>>
 * @param {number} [field]
 * @param {string} [n]
 * @param {unknown} [targetField?]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function lagField(
    records: Array<Record<string, unknown>>,
    field: string,
    n = 1,
    targetField?: string,
    defaultValue: unknown = null,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const tgt = targetField || field + '_lag' + n;
    const lag = Math.max(0, Math.floor(n));
    return Object.freeze(
        records.map((rec, i) => {
            const src = i - lag;
            const val = src >= 0 ? records[src]![field] : defaultValue;
            return Object.freeze({ ...rec, [tgt]: val !== undefined ? val : defaultValue });
        }),
    );
}

/**
 * Lead: desloca o valor de `field` em `n` posições para frente (o registro i recebe o valor do registro i+n).
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} unknown>>
 * @param {number} [field]
 * @param {string} [n]
 * @param {unknown} [targetField?]
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function leadField(
    records: Array<Record<string, unknown>>,
    field: string,
    n = 1,
    targetField?: string,
    defaultValue: unknown = null,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records)) return Object.freeze([]);
    const tgt = targetField || field + '_lead' + n;
    const lead = Math.max(0, Math.floor(n));
    return Object.freeze(
        records.map((rec, i) => {
            const src = i + lead;
            const val = src < records.length ? records[src]![field] : defaultValue;
            return Object.freeze({ ...rec, [tgt]: val !== undefined ? val : defaultValue });
        }),
    );
}

/**
 * Partitioned window: divide registros por `partitionKey`, aplica `windowFn` em cada partição
 * separadamente, depois reune mantendo a ordem original.
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string} unknown>>
 * @param {PartitionWindowFn} partitionKey
 * @returns {ReadonlyArray<Readonly<WindowRecord>>}
 */
export function partitionedWindow(
    records: Array<Record<string, unknown>>,
    partitionKey: string,
    windowFn: (partitionRecords: Array<Record<string, unknown>>) => Array<Record<string, unknown>>,
): ReadonlyArray<Readonly<Record<string, unknown>>> {
    if (!Array.isArray(records) || typeof windowFn !== 'function') return Object.freeze([]);

    // coleta partições preservando ordem dos índices originais
    /** @type {Map<string, Array<WindowRecord>>} */
    const partitions = new Map<string, Array<Record<string, unknown>>>();
    /** @type {Array<{ key: string, bucketIdx: number }>} */
    const indexMap: Array<{ key: string; bucketIdx: number }> = [];
    for (let i = 0; i < records.length; i++) {
        const key = String(records[i]![partitionKey] !== undefined ? records[i]![partitionKey] : '__null__');
        let bucket = partitions.get(key);
        if (!bucket) {
            bucket = [];
            partitions.set(key, bucket);
        }
        indexMap.push({ key, bucketIdx: bucket.length });
        bucket.push(records[i]!);
    }

    // processa cada partição
    /** @type {Map<string, Array<WindowRecord>>} */
    const processed = new Map<string, Array<Record<string, unknown>>>();
    for (const [key, bucket] of partitions) {
        processed.set(key, windowFn(bucket));
    }

    // recompõe na ordem original
    const result = records.map((_, i) => {
        const { key, bucketIdx } = indexMap[i]!;
        const arr = processed.get(key);
        return arr?.[bucketIdx] ?? records[i]!;
    });
    return Object.freeze(result);
}

/**
 * Sumariza contagem de entradas não-nulas por campo de janela.
 */
/**
 * @param {Array<WindowRecord>} records
 * @param {string[]} windowFields
 * @returns {Readonly<Record<string, number>>}
 */
export function summarizeWindows(
    records: Array<Record<string, unknown>>,
    windowFields: string[],
): Readonly<Record<string, number>> {
    if (!Array.isArray(records) || !Array.isArray(windowFields)) return Object.freeze({});
    /** @type {Record<string, number>} */
    const summary: Record<string, number> = {};
    for (const f of windowFields) {
        summary[f] = records.filter((r) => r[f] !== null && r[f] !== undefined).length;
    }
    return Object.freeze(summary);
}

// ---------------------------------------------------------------------------
// Meta export
// ---------------------------------------------------------------------------

export const pipelineWindowFunctionsMeta = Object.freeze({
    exports: [
        'WINDOW_FUNCTIONS_META',
        'WINDOW_TYPES',
        'rollingWindow',
        'cumulativeSum',
        'rankRecords',
        'denseRankRecords',
        'pctRankRecords',
        'lagField',
        'leadField',
        'partitionedWindow',
        'summarizeWindows',
    ],
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
});
