// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * ecbyts Analytics - BI Abstraction Layer
 * Camada de Business Intelligence com operadores de agregação e agrupamento
 */

/**
 * Operadores de agregação
 */
export const Aggregators: Record<string, (values: unknown[]) => unknown> = {
    SUM: (values: unknown[]) => {
        const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) : null;
    },

    AVERAGE: (values: unknown[]) => {
        const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    },

    FIRST: (values: unknown[]) => {
        return values.length > 0 ? values[0] : null;
    },

    LAST: (values: unknown[]) => {
        return values.length > 0 ? values[values.length - 1] : null;
    },

    MIN: (values: unknown[]) => {
        const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        return nums.length > 0 ? Math.min(...nums) : null;
    },

    MAX: (values: unknown[]) => {
        const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        return nums.length > 0 ? Math.max(...nums) : null;
    },

    COUNT: (values: unknown[]) => {
        return values.length;
    },

    COUNT_DISTINCT: (values: unknown[]) => {
        return new Set(values).size;
    },

    MEDIAN: (values: unknown[]) => {
        const nums = (values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[]).sort(
            (a, b) => a - b,
        );
        if (nums.length === 0) return null;
        const mid = Math.floor(nums.length / 2);
        return nums.length % 2 ? nums[mid] : ((nums[mid - 1] ?? 0) + (nums[mid] ?? 0)) / 2;
    },

    STD_DEV: (values: unknown[]) => {
        const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        if (nums.length === 0) return null;
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const squaredDiffs = nums.map((v) => Math.pow(v - mean, 2));
        return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / nums.length);
    },

    VARIANCE: (values: unknown[]) => {
        const nums = values.filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        if (nums.length === 0) return null;
        const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
        const squaredDiffs = nums.map((v) => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / nums.length;
    },
};

/**
 * Funções utilitárias para agrupamento
 */
const Utils = {
    /**
     * Agrupa array por função de chave
     * @param {any[]} array
     * @param {(item: any) => any} keyFn
     * @returns {Map<any, any[]>}
     */
    groupBy(array: unknown[], keyFn: (item: unknown) => unknown): Map<unknown, unknown[]> {
        const groups = new Map<unknown, unknown[]>();
        array.forEach((item) => {
            const key = keyFn(item);
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            const bucket = groups.get(key);
            if (bucket) bucket.push(item);
        });
        return groups;
    },

    /**
     * Trunca timestamp para unidade temporal
     * @param {number} timestamp
     * @param {string} unit
     * @returns {number}
     */
    truncateTime(timestamp: number, unit: string): number {
        const date = new Date(timestamp);

        switch (unit) {
            case 'year':
                return new Date(date.getFullYear(), 0, 1).getTime();
            case 'month':
                return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
            case 'week': {
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1);
                return new Date(date.getFullYear(), date.getMonth(), diff).getTime();
            }
            case 'day':
                return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
            case 'hour':
                return new Date(date.getFullYear(), date.getMonth(), date.getDate(), date.getHours()).getTime();
            default:
                return timestamp;
        }
    },

    /**
     * Formata timestamp para label legível
     * @param {number} timestamp
     * @param {string} unit
     * @returns {string}
     */
    formatTimeLabel(timestamp: number, unit: string): string {
        const date = new Date(timestamp);
        const pad = (n: number) => String(n).padStart(2, '0');

        switch (unit) {
            case 'year':
                return String(date.getFullYear());
            case 'month':
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
            case 'week':
                return `${date.getFullYear()}-W${this.getWeekNumber(date)}`;
            case 'day':
                return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
            case 'hour':
                return `${pad(date.getHours())}:00`;
            default:
                return date.toISOString();
        }
    },

    /**
     * Retorna número da semana no ano
     * @param {Date} date
     * @returns {number}
     */
    getWeekNumber(date: Date): number {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    },

    /**
     * Agrupa valor em bins
     * @param {number} value
     * @param {{min: number, max: number, count: number}} bins
     * @returns {number}
     */
    binValue(value: number, bins: { min: number; max: number; count: number }): number {
        const { min, max, count } = bins;
        const binWidth = (max - min) / count;
        let binIndex = Math.floor((value - min) / binWidth);
        if (binIndex >= count) binIndex = count - 1;
        if (binIndex < 0) binIndex = 0;
        return binIndex;
    },
};

/**
 * Agrupadores por dimensão
 */
export const Groupers = {
    /**
     * Agrupa por campo categórico
     * @param {any[]} data
     * @param {string} field
     * @returns {Map<any, any[]>}
     */
    byCategory(data: unknown[], field: string): Map<unknown, unknown[]> {
        return Utils.groupBy(data, (item) => {
            const it = item as Record<string, unknown> & { qualFields?: Map<string, unknown> };
            if (field === 'qualField') {
                // Acesso a campo qualitativo específico
                return it.qualFields?.get(field) || 'N/A';
            }
            return it[field] || 'N/A';
        });
    },

    /**
     * Agrupa por unidade temporal
     * @param {any[]} data
     * @param {string} [unit]
     * @returns {Map<any, any[]>}
     */
    byTime(data: unknown[], unit: string = 'day'): Map<unknown, unknown[]> {
        return Utils.groupBy(data, (item) => {
            return Utils.truncateTime((item as { timestamp: number }).timestamp, unit);
        });
    },

    /**
     * Agrupa por eixo espacial em bins
     * @param {any[]} data
     * @param {string} axis
     * @param {number} [binCount]
     * @returns {Map<any, any[]>}
     */
    bySpatial(data: unknown[], axis: string, binCount: number = 10): Map<unknown, unknown[]> {
        if (data.length === 0) return new Map();

        const values = data.map((d) => (d as { position: Record<string, number> }).position[axis]) as number[];
        const min = Math.min(...values);
        const max = Math.max(...values);

        return Utils.groupBy(data, (item) => {
            return Utils.binValue((item as { position: Record<string, number> }).position[axis] ?? 0, {
                min,
                max,
                count: binCount,
            });
        });
    },

    /**
     * Agrupa por range de valor
     * @param {any[]} data
     * @param {number} [binCount]
     * @returns {Map<any, any[]>}
     */
    byValueRange(data: unknown[], binCount: number = 10): Map<unknown, unknown[]> {
        if (data.length === 0) return new Map();

        const values = data
            .map((d) => (d as { value: unknown }).value)
            .filter((v) => typeof v === 'number' && !isNaN(v)) as number[];
        if (values.length === 0) return new Map();

        const min = Math.min(...values);
        const max = Math.max(...values);

        return Utils.groupBy(data, (item) => {
            const it = item as { value: unknown };
            if (typeof it.value !== 'number' || isNaN(it.value)) return 'N/A';
            return Utils.binValue(it.value, { min, max, count: binCount });
        });
    },
};

/**
 * Query Builder para consultas fluentes
 */
class QueryBuilder {
    data: unknown[];
    groupedData: Map<unknown, unknown[]> | null;
    aggregations: Array<{ field: string; aggregator: (values: unknown[]) => unknown; alias: string }>;
    sortConfig: { field: string; order: string } | null;
    limitConfig: number | null;

    /**
     * @param {any[]} data
     */
    constructor(data: unknown[]) {
        this.data = [...data];
        this.groupedData = null;
        this.aggregations = [];
        this.sortConfig = null;
        this.limitConfig = null;
    }

    /**
     * Verifica se um item satisfaz uma condição de filtro simples.
     */
    _matchesCondition(it: Record<string, unknown>, key: string, value: unknown): boolean {
        if (Array.isArray(value)) {
            return value.includes(it[key]);
        }
        if (typeof value === 'object' && value !== null) {
            const v = value as Record<string, unknown>;
            const itv = it[key] as number;
            // Range filter: { min: x, max: y }
            if ('min' in v && 'max' in v) {
                return itv >= (v.min as number) && itv <= (v.max as number);
            }
            // Comparison operators: { $gt: x, $lt: y, $gte: x, $lte: y, $ne: z }
            return this._matchesComparison(it, key, v, itv);
        }
        return it[key] === value;
    }

    /**
     * Aplica operadores de comparação ($gt, $lt, $gte, $lte, $ne).
     */
    _matchesComparison(
        it: Record<string, unknown>,
        key: string,
        v: Record<string, unknown>,
        itv: number,
    ): boolean {
        let passes = true;
        if ('$gt' in v) passes = passes && itv > (v.$gt as number);
        if ('$lt' in v) passes = passes && itv < (v.$lt as number);
        if ('$gte' in v) passes = passes && itv >= (v.$gte as number);
        if ('$lte' in v) passes = passes && itv <= (v.$lte as number);
        if ('$ne' in v) passes = passes && it[key] !== v.$ne;
        return passes;
    }

    /**
     * Filtra dados por condições
     * @param {Record<string, any>|((item: any) => boolean)} conditions
     */
    filter(conditions: Record<string, unknown> | ((item: unknown) => boolean)): this {
        if (typeof conditions === 'function') {
            this.data = this.data.filter(conditions as (item: unknown) => boolean);
        } else {
            this.data = this.data.filter((item) => {
                const it = item as Record<string, unknown>;
                return Object.entries(conditions).every(([key, value]) => this._matchesCondition(it, key, value));
            });
        }
        return this;
    }

    /**
     * Filtra por bounds espaciais
     * @param {{x?: {min: number, max: number}, y?: {min: number, max: number}, z?: {min: number, max: number}}} bounds
     */
    filterSpatial(bounds: {
        x?: { min: number; max: number };
        y?: { min: number; max: number };
        z?: { min: number; max: number };
    }): this {
        this.data = this.data.filter((item) => {
            const { x, y, z } = (item as { position: { x: number; y: number; z: number } }).position;
            let passes = true;

            if (bounds.x) {
                passes = passes && x >= bounds.x.min && x <= bounds.x.max;
            }
            if (bounds.y) {
                passes = passes && y >= bounds.y.min && y <= bounds.y.max;
            }
            if (bounds.z) {
                passes = passes && z >= bounds.z.min && z <= bounds.z.max;
            }

            return passes;
        });
        return this;
    }

    /**
     * Filtra por range temporal
     * @param {number} startTime
     * @param {number} endTime
     */
    filterTime(startTime: number, endTime: number): this {
        this.data = this.data.filter(
            (item) =>
                (item as { timestamp: number }).timestamp >= startTime &&
                (item as { timestamp: number }).timestamp <= endTime,
        );
        return this;
    }

    /**
     * Agrupa dados por campo ou função
     * @param {string|((item: any) => any)} grouper
     * @param {Record<string, any>} [options]
     */
    groupBy(
        grouper: string | ((item: unknown) => unknown),
        options: Record<string, unknown> = {},
    ): this {
        if (typeof grouper === 'string') {
            // Campo simples
            if (grouper === 'time') {
                this.groupedData = Groupers.byTime(this.data, (options.unit as string) || 'day');
            } else if (['x', 'y', 'z'].includes(grouper)) {
                this.groupedData = Groupers.bySpatial(this.data, grouper, (options.bins as number) || 10);
            } else {
                this.groupedData = Groupers.byCategory(this.data, grouper);
            }
        } else if (typeof grouper === 'function') {
            this.groupedData = Utils.groupBy(this.data, grouper);
        }
        return this;
    }

    /**
     * Aplica agregação aos grupos
     * @param {string} field - Campo a agregar
     * @param {string|((values: any[]) => any)} aggregator - Nome do agregador ou função
     * @param {string|null} [alias] - Nome do resultado (opcional)
     */
    aggregate(
        field: string,
        aggregator: string | ((values: unknown[]) => unknown),
        alias: string | null = null,
    ): this {
        const aggFn =
            typeof aggregator === 'function'
                ? aggregator
                : (Aggregators as Record<string, (values: unknown[]) => unknown>)[aggregator.toUpperCase()];

        if (!aggFn) {
            throw new Error(`Unknown aggregator: ${aggregator}`);
        }

        this.aggregations.push({
            field,
            aggregator: aggFn,
            alias: alias || `${field}_${aggregator}`,
        });

        return this;
    }

    /**
     * Ordena resultados
     * @param {string} field
     * @param {string} [order] - 'ASC' ou 'DESC'
     */
    sortBy(field: string, order: string = 'ASC'): this {
        this.sortConfig = { field, order };
        return this;
    }

    /**
     * Limita número de resultados
     * @param {number} n
     */
    limit(n: number): this {
        this.limitConfig = n;
        return this;
    }

    /**
     * Executa a query e retorna resultados
     * @returns {any[]}
     */
    execute(): unknown[] {
        // Se não houver agrupamento, retorna dados filtrados
        if (!this.groupedData) {
            let result = [...this.data];

            if (this.sortConfig) {
                const { field, order } = this.sortConfig;
                result.sort((a, b) => {
                    const aVal = this._getFieldValue(a, field) as number;
                    const bVal = this._getFieldValue(b, field) as number;
                    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                    return order === 'DESC' ? -comparison : comparison;
                });
            }

            if (this.limitConfig) {
                result = result.slice(0, this.limitConfig);
            }

            return result;
        }

        // Com agrupamento, aplica agregações
        const results: Array<Record<string, unknown>> = [];

        this.groupedData.forEach((items, key) => {
            const result: Record<string, unknown> = {
                group: key,
                count: items.length,
            };

            // Aplica cada agregação
            this.aggregations.forEach(({ field, aggregator, alias }) => {
                const values = items.map((item) => this._getFieldValue(item, field));
                result[alias] = aggregator(values);
            });

            results.push(result);
        });

        // Ordenação
        if (this.sortConfig) {
            const { field, order } = this.sortConfig;
            results.sort((a, b) => {
                const aVal = (a[field] ?? a.group) as number;
                const bVal = (b[field] ?? b.group) as number;
                const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
                return order === 'DESC' ? -comparison : comparison;
            });
        }

        // Limite
        if (this.limitConfig) {
            return results.slice(0, this.limitConfig);
        }

        return results;
    }

    /**
     * Extrai valor de campo (suporta nested)
     * @param {any} item
     * @param {string} field
     * @returns {any}
     */
    _getFieldValue(item: unknown, field: string): unknown {
        if (field.includes('.')) {
            return field
                .split('.')
                .reduce((obj: unknown, key: string) => (obj as Record<string, unknown> | null)?.[key], item);
        }
        return (item as Record<string, unknown>)[field];
    }
}

/**
 * Cria nova query a partir de dados
 * @param {any[]|{getAll: () => any[]}} source
 * @returns {QueryBuilder}
 */
export function query(source: unknown[] | { getAll: () => unknown[] }): QueryBuilder {
    const data = Array.isArray(source) ? source : source.getAll();
    return new QueryBuilder(data);
}

/**
 * Funções utilitárias exportadas
 */
export const BIUtils = {
    truncateTime: Utils.truncateTime,
    formatTimeLabel: Utils.formatTimeLabel,
    getWeekNumber: Utils.getWeekNumber,
    groupBy: Utils.groupBy,
};

export { QueryBuilder };
