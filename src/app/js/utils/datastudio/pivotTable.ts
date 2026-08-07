// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

function _escapeHtml(value: unknown): string {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function _toObjects(input: unknown): Record<string, unknown>[] {
    if (Array.isArray(input)) return input as Record<string, unknown>[];
    const objInput = input as Record<string, unknown>;
    if (Array.isArray(objInput?.rows)) return objInput.rows as Record<string, unknown>[];
    if (Array.isArray(objInput?.columns) && Array.isArray(objInput?.values)) {
        const columns = objInput.columns as unknown[];
        const values = objInput.values as unknown[][];
        return values.map((row) => {
            const obj: Record<string, unknown> = {};
            columns.forEach((column, index) => {
                const colKey = String(column);
                obj[colKey] = row?.[index];
            });
            return obj;
        });
    }
    return [];
}

function _toNumber(value: unknown): number | null {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    return Number.isNaN(numeric) ? null : numeric;
}

function _aggregate(values: unknown[], agg: string): number | string {
    if (agg === 'count') return values.length;

    const numericValues = values.map(_toNumber).filter((value): value is number => value !== null);
    if (!numericValues.length) return '';

    if (agg === 'avg') {
        return (
            numericValues.reduce((sum, value) => sum + value, 0) /
            numericValues.length
        );
    }
    if (agg === 'min') return Math.min(...numericValues);
    if (agg === 'max') return Math.max(...numericValues);
    return numericValues.reduce((sum, value) => sum + value, 0);
}

function _formatPivotValue(value: unknown): string {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Number(value.toFixed(4)).toString();
    }
    return value == null ? '' : String(value);
}

export interface PivotOptions {
    rowField: string;
    colField: string;
    valueField: string;
    agg?: 'sum' | 'count' | 'avg' | 'min' | 'max';
}

export interface PivotResult {
    headers: string[];
    rows: (string | number)[][];
}

export function buildPivot(
    rows: unknown,
    options: PivotOptions = {} as PivotOptions,
): PivotResult {
    const { rowField, colField, valueField, agg = 'sum' } = options;
    const normalizedRows = _toObjects(rows);
    
    if (!rowField || !colField || !valueField || !normalizedRows.length) {
        return { headers: [rowField || 'Row'], rows: [] };
    }

    const rowKeys: string[] = [];
    const colKeys: string[] = [];
    const buckets = new Map<string, unknown[]>();

    normalizedRows.forEach((row) => {
        const rowKey = String(row?.[rowField] ?? '');
        const colKey = String(row?.[colField] ?? '');
        const value = row?.[valueField];

        if (!rowKeys.includes(rowKey)) rowKeys.push(rowKey);
        if (!colKeys.includes(colKey)) colKeys.push(colKey);

        const bucketKey = `${rowKey}::${colKey}`;
        if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
        buckets.get(bucketKey)!.push(value);
    });

    const pivotRows = rowKeys.map((rowKey) => [
        rowKey,
        ...colKeys.map((colKey) => _aggregate(buckets.get(`${rowKey}::${colKey}`) || [], agg) as number | string),
    ]) as (string | number)[][];

    return {
        headers: [rowField, ...colKeys],
        rows: pivotRows,
    };
}

export function renderPivotTable(container: unknown, pivotResult: unknown): boolean {
    const el = container as HTMLElement | null;
    if (!el) return false;

    const res = pivotResult as PivotResult | undefined;
    const headers = Array.isArray(res?.headers) ? res.headers : [];
    const rows = Array.isArray(res?.rows) ? res.rows : [];

    if (!headers.length || !rows.length) {
        el.innerHTML = '<div class="ds-results-empty">No pivot data</div';
        return false;
    }

    const headerHtml = headers
        .map((header) => `<th scope="col">${_escapeHtml(header)}</th>`)
        .join('');
    const bodyHtml = rows
        .map((row) => {
            const [label, ...cells] = row;
            const cellsHtml = cells
                .map((cell) => `<td>${_escapeHtml(_formatPivotValue(cell))}</td>`)
                .join('');
            return `<tr><th scope="row">${_escapeHtml(String(label))}</th>${cellsHtml}</tr>`;
        })
        .join('');

    el.innerHTML = `
        <table class="ds-table ds-pivot-table">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
        </table>
    `;
    return true;
}