// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   DATA STUDIO ANALYTICS CORE — SPEC_DATA_STUDIO_ANALYTICS_NATIVE (DSA-NATIVE-001)

   Pure helpers para analytics nativo no Data Studio:
   - Aggregations pure-JS (sum/avg/count/min/max) §PIVOT-002
   - buildPivot (rowField × colField × valueField) §PIVOT-001
   - detectChartType por shape de result set
   - LTTB downsampling (Largest Triangle Three Buckets)
   - Label sanitization §Seguranca (escape XSS)

   Canvas rendering + Chart.js remoção ficam em handler.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────

export const CHART_TYPES = Object.freeze(['line', 'bar', 'scatter', 'area']);

export const AGGREGATIONS = Object.freeze(['sum', 'avg', 'count', 'min', 'max']);

export const LTTB_SAMPLING_THRESHOLD = 5000; // acima disso, downsample §Escalabilidade

// ──────────────────────────────────────────────────────────────────────
// Aggregations §PIVOT-002
// ──────────────────────────────────────────────────────────────────────

export function aggregate(values: Array<number>, agg: string): number {
    if (!Array.isArray(values)) return 0;
    const nums = values.map(Number).filter(Number.isFinite);
    if (nums.length === 0) return agg === 'count' ? 0 : NaN;

    switch (agg) {
        case 'sum':
            return nums.reduce((s, v) => s + v, 0);
        case 'avg':
            return nums.reduce((s, v) => s + v, 0) / nums.length;
        case 'count':
            return nums.length;
        case 'min':
            return Math.min(...nums);
        case 'max':
            return Math.max(...nums);
        default:
            return NaN;
    }
}

// ──────────────────────────────────────────────────────────────────────
// Pivot builder §PIVOT-001
// ──────────────────────────────────────────────────────────────────────

/**
 * Constrói pivot table a partir de dataset SQL-like.
 */
export function buildPivot(
    dataset: { columns: string[]; values: any[][] },
    config: { rowField: string; colField?: string; valueField: string; agg?: string },
): { header: string[]; rows: Array<{ label: string; cells: any[] }> } | null {
    if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.values)) return null;
    if (!config || !config.rowField || !config.valueField) return null;
    if (config.agg && !AGGREGATIONS.includes(config.agg)) return null;

    const rowIdx = dataset.columns.indexOf(config.rowField);
    const colIdx = config.colField ? dataset.columns.indexOf(config.colField) : -1;
    const valIdx = dataset.columns.indexOf(config.valueField);
    if (rowIdx < 0 || valIdx < 0) return null;

    // Group values por (row, col)
    const groups = new Map<string, Map<string, number[]>>(); // row → col → [values]
    const colSet = new Set<string>();
    for (const row of dataset.values) {
        if (!Array.isArray(row)) continue;
        const rowKey = String(row[rowIdx] ?? '');
        const colKey = colIdx >= 0 ? String(row[colIdx] ?? '') : '_total';
        const val = Number(row[valIdx]);
        if (!Number.isFinite(val) && config.agg !== 'count') continue;
        colSet.add(colKey);
        if (!groups.has(rowKey)) groups.set(rowKey, new Map());
        const byCol = groups.get(rowKey) as Map<string, number[]>;
        if (!byCol.has(colKey)) byCol.set(colKey, []);
        (byCol.get(colKey) as number[]).push(val);
    }

    const header = [config.rowField, ...[...colSet].sort()];
    const agg = config.agg || 'sum';
    const rows: Array<{ label: string; cells: any[] }> = [];
    for (const [rowKey, byCol] of groups) {
        const cells = header.slice(1).map((c) => {
            const vals = byCol.get(c) || [];
            return aggregate(vals, agg);
        });
        rows.push({ label: rowKey, cells });
    }
    rows.sort((a, b) => a.label.localeCompare(b.label));
    return { header, rows };
}

// ──────────────────────────────────────────────────────────────────────
// Chart type detector
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta tipo de chart mais adequado ao shape do dataset.
 */
export function detectChartType(dataset: { columns: string[]; values: any[][] }): string | null {
    if (!dataset || !Array.isArray(dataset.columns) || !Array.isArray(dataset.values)) return null;
    if (dataset.columns.length < 2 || dataset.values.length === 0) return null;

    const firstRow = dataset.values[0];
    if (!Array.isArray(firstRow)) return null;

    const typeOfCol = (idx: any) => {
        const v = firstRow[idx];
        if (typeof v === 'number' || (typeof v === 'string' && !isNaN(Number(v)))) return 'number';
        if (v instanceof Date || (typeof v === 'string' && !isNaN(Date.parse(v)))) return 'datetime';
        return 'string';
    };

    const types = dataset.columns.map((_, i) => typeOfCol(i));

    // 2 colunas numéricas → scatter
    if (types.length === 2 && types[0] === 'number' && types[1] === 'number') return 'scatter';

    // Primeira coluna string/datetime + resto numérico → line (ou bar)
    if ((types[0] === 'string' || types[0] === 'datetime') && types.slice(1).every((t) => t === 'number')) {
        // Poucas categorias string → bar, muitas ou datetime → line
        if (types[0] === 'string' && dataset.values.length <= 20) return 'bar';
        return 'line';
    }

    // Todas numéricas → line
    if (types.every((t) => t === 'number')) return 'line';

    return null;
}

// ──────────────────────────────────────────────────────────────────────
// LTTB downsampling §Escalabilidade
// ──────────────────────────────────────────────────────────────────────

/**
 * Largest Triangle Three Buckets - reduz N pontos para threshold mantendo shape.
 */
export function lttbDownsample(
    data: Array<{ x: any; y: any }>,
    threshold: number,
): Array<{ x: any; y: any }> {
    if (!Array.isArray(data)) return [];
    const n = data.length;
    const target = Math.max(2, Math.floor(Number(threshold) || LTTB_SAMPLING_THRESHOLD));
    if (n <= target) return [...data];

    const sampled: Array<{ x: any; y: any }> = [];
    sampled.push(data[0] as { x: any; y: any }); // first always included

    const every = (n - 2) / (target - 2);
    let a = 0;

    for (let i = 0; i < target - 2; i++) {
        // Calculate point avg for next bucket
        const avgRangeStart = Math.floor((i + 1) * every) + 1;
        const avgRangeEnd = Math.min(Math.floor((i + 2) * every) + 1, n);
        const avgRangeLength = avgRangeEnd - avgRangeStart;

        let avgX = 0,
            avgY = 0;
        for (let j = avgRangeStart; j < avgRangeEnd; j++) {
            avgX += Number((data[j] as { x: any; y: any }).x) || 0;
            avgY += Number((data[j] as { x: any; y: any }).y) || 0;
        }
        if (avgRangeLength > 0) {
            avgX /= avgRangeLength;
            avgY /= avgRangeLength;
        }

        // Find point with largest triangle area in current bucket
        const rangeOffs = Math.floor(i * every) + 1;
        const rangeTo = Math.floor((i + 1) * every) + 1;
        const pointA = data[a] as { x: any; y: any };

        let maxArea = -1;
        let nextA = a;
        for (let j = rangeOffs; j < rangeTo; j++) {
            const dj = data[j] as { x: any; y: any };
            const area =
                Math.abs(
                    (Number(pointA.x) - avgX) * (Number(dj.y) - Number(pointA.y)) -
                        (Number(pointA.x) - Number(dj.x)) * (avgY - Number(pointA.y)),
                ) * 0.5;
            if (area > maxArea) {
                maxArea = area;
                nextA = j;
            }
        }
        sampled.push(data[nextA] as { x: any; y: any });
        a = nextA;
    }

    sampled.push(data[n - 1] as { x: any; y: any }); // last always included
    return sampled;
}

// ──────────────────────────────────────────────────────────────────────
// Label sanitization §Seguranca
// ──────────────────────────────────────────────────────────────────────

/**
 * Sanitiza label para canvas rendering (escape XSS).
 */
export function sanitizeLabel(label: string): string {
    if (typeof label !== 'string') return '';
    return label.replace(/[<>"'&]/g, (ch) => {
        switch (ch) {
            case '<':
                return '&lt;';
            case '>':
                return '&gt;';
            case '"':
                return '&quot;';
            case "'":
                return '&apos;';
            case '&':
                return '&amp;';
            default:
                return ch;
        }
    });
}

// ──────────────────────────────────────────────────────────────────────
// Dataset validation
// ──────────────────────────────────────────────────────────────────────

export function validateDataset(
    dataset: Record<string, any>,
): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!dataset || typeof dataset !== 'object') return { valid: false, errors: ['not object'] };
    if (!Array.isArray(dataset.columns)) errors.push('columns must be array');
    if (!Array.isArray(dataset.values)) errors.push('values must be array');
    if (Array.isArray(dataset.columns) && Array.isArray(dataset.values)) {
        for (let i = 0; i < dataset.values.length; i++) {
            if (!Array.isArray(dataset.values[i])) {
                errors.push(`row ${i} not array`);
                break;
            }
            if (dataset.values[i].length !== dataset.columns.length) {
                errors.push(`row ${i} length mismatch`);
                break;
            }
        }
    }
    return { valid: errors.length === 0, errors };
}
