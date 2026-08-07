// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Data Table State - UX-61
 * Pure-logic table model: sort, filter, pagination, selection, column visibility.
 * Zero DOM. Imutável (frozen). Sets/Maps clonados em cada mutação.
 */

const VALID_TYPES = new Set(['string', 'number', 'date', 'boolean', 'enum']);
const VALID_OPS = new Set(['eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'contains', 'in']);
const VALID_DIRS = new Set(['asc', 'desc']);

function freezeState(state: any): any {
    Object.freeze(state);
    Object.freeze(state.sortBy);
    Object.freeze(state.pagination);
    return state;
}

function cloneColumns(columns: any): Map<any, any> {
    const next = new Map();
    for (const [k, v] of columns) next.set(k, Object.freeze({ ...v }));
    return next;
}

function cloneFilters(filters: any): Map<any, any> {
    const next = new Map();
    for (const [k, v] of filters) next.set(k, Object.freeze({ ...v }));
    return next;
}

function cloneSelected(selected: any): Set<any> {
    return new Set(selected);
}

function cloneSortBy(sortBy: any): any[] {
    return sortBy.map((s: any) => Object.freeze({ ...s }));
}

function withState(prev: any, patch: any): any {
    return freezeState({
        rows: patch.rows ?? prev.rows,
        columns: patch.columns ?? cloneColumns(prev.columns),
        sortBy: patch.sortBy ?? cloneSortBy(prev.sortBy),
        filters: patch.filters ?? cloneFilters(prev.filters),
        pagination: patch.pagination ?? { ...prev.pagination },
        selectedIds: patch.selectedIds ?? cloneSelected(prev.selectedIds),
        rowIdField: prev.rowIdField,
    });
}

export function createDataTable(
    { columns, rows, rowIdField = 'id' }: { columns?: any[]; rows?: any[]; rowIdField?: string } = {},
): any {
    if (!Array.isArray(columns) || columns.length === 0) {
        throw new Error('createDataTable: columns must be non-empty array');
    }
    if (!Array.isArray(rows)) {
        throw new Error('createDataTable: rows must be array');
    }
    const colMap = new Map();
    for (const c of columns) {
        if (!c || typeof c.id !== 'string' || !c.id) {
            throw new Error('createDataTable: column.id required');
        }
        if (!VALID_TYPES.has(c.type)) {
            throw new Error(`createDataTable: invalid type for column ${c.id}`);
        }
        if (colMap.has(c.id)) {
            throw new Error(`createDataTable: duplicate column id ${c.id}`);
        }
        colMap.set(
            c.id,
            Object.freeze({
                id: c.id,
                label: c.label ?? c.id,
                type: c.type,
                sortable: c.sortable !== false,
                filterable: c.filterable !== false,
                hidden: !!c.hidden,
                width: typeof c.width === 'number' ? c.width : undefined,
            }),
        );
    }
    return freezeState({
        rows: rows.slice(),
        columns: colMap,
        sortBy: [],
        filters: new Map(),
        pagination: { page: 1, pageSize: 25 },
        selectedIds: new Set(),
        rowIdField,
    });
}

function requireColumn(state: any, columnId: any): any {
    const c = state.columns.get(columnId);
    if (!c) throw new Error(`column not found: ${columnId}`);
    return c;
}

export function setSort(state: any, columnId: any, dir: any, append = false): any {
    const col = requireColumn(state, columnId);
    if (!col.sortable) throw new Error(`column not sortable: ${columnId}`);
    if (!VALID_DIRS.has(dir)) throw new Error(`invalid sort dir: ${dir}`);
    let nextSort;
    if (append) {
        nextSort = state.sortBy.filter((s: any) => s.columnId !== columnId);
        nextSort.push({ columnId, dir });
    } else {
        nextSort = [{ columnId, dir }];
    }
    return withState(state, { sortBy: nextSort.map((s: any) => Object.freeze({ ...s })) });
}

export function clearSort(state: any): any {
    return withState(state, { sortBy: [] });
}

export function setFilter(state: any, columnId: any, filter: any): any {
    const col = requireColumn(state, columnId);
    if (!col.filterable) throw new Error(`column not filterable: ${columnId}`);
    if (!filter || !VALID_OPS.has(filter.op)) {
        throw new Error(`invalid filter op: ${filter && filter.op}`);
    }
    if (filter.op === 'in' && !Array.isArray(filter.value)) {
        throw new Error(`filter op 'in' requires array value`);
    }
    const next = cloneFilters(state.filters);
    next.set(columnId, Object.freeze({ op: filter.op, value: filter.value }));
    // Reset to page 1 on filter change
    return withState(state, { filters: next, pagination: { ...state.pagination, page: 1 } });
}

export function clearFilter(state: any, columnId: any): any {
    requireColumn(state, columnId);
    const next = cloneFilters(state.filters);
    next.delete(columnId);
    return withState(state, { filters: next, pagination: { ...state.pagination, page: 1 } });
}

export function clearAllFilters(state: any): any {
    return withState(state, { filters: new Map(), pagination: { ...state.pagination, page: 1 } });
}

export function setPage(state: any, page: any): any {
    if (!Number.isInteger(page) || page < 1) {
        throw new Error(`invalid page: ${page}`);
    }
    return withState(state, { pagination: { ...state.pagination, page } });
}

export function setPageSize(state: any, size: any): any {
    if (!Number.isInteger(size) || size <= 0) {
        throw new Error(`invalid pageSize: ${size}`);
    }
    return withState(state, { pagination: { page: 1, pageSize: size } });
}

export function selectRow(state: any, rowId: any): any {
    const next = cloneSelected(state.selectedIds);
    next.add(rowId);
    return withState(state, { selectedIds: next });
}

export function deselectRow(state: any, rowId: any): any {
    const next = cloneSelected(state.selectedIds);
    next.delete(rowId);
    return withState(state, { selectedIds: next });
}

export function selectAll(state: any): any {
    const visible = getProcessedRows(state);
    const next = cloneSelected(state.selectedIds);
    for (const r of visible) next.add(r[state.rowIdField]);
    return withState(state, { selectedIds: next });
}

export function toggleColumnVisibility(state: any, columnId: any): any {
    const col = requireColumn(state, columnId);
    const next = cloneColumns(state.columns);
    next.set(columnId, Object.freeze({ ...col, hidden: !col.hidden }));
    return withState(state, { columns: next });
}

function compareValues(a: any, b: any, type: any): number {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    if (type === 'number') return a - b;
    if (type === 'date') {
        const da = a instanceof Date ? a.getTime() : new Date(a).getTime();
        const db = b instanceof Date ? b.getTime() : new Date(b).getTime();
        return da - db;
    }
    if (type === 'boolean') return a === b ? 0 : a ? 1 : -1;
    return String(a).localeCompare(String(b));
}

function applyFilter(value: any, op: any, target: any): boolean {
    switch (op) {
        case 'eq':
            return value === target;
        case 'neq':
            return value !== target;
        case 'gt':
            return value > target;
        case 'lt':
            return value < target;
        case 'gte':
            return value >= target;
        case 'lte':
            return value <= target;
        case 'contains':
            if (value == null) return false;
            return String(value).toLowerCase().includes(String(target).toLowerCase());
        case 'in':
            return Array.isArray(target) && target.includes(value);
        default:
            return false;
    }
}

export function getProcessedRows(state: any): any[] {
    let result = state.rows;
    if (state.filters.size > 0) {
        result = result.filter((row: any) => {
            for (const [colId, f] of state.filters) {
                if (!applyFilter(row[colId], f.op, f.value)) return false;
            }
            return true;
        });
    }
    if (state.sortBy.length > 0) {
        const sortBy = state.sortBy;
        result = result.slice().sort((a: any, b: any) => {
            for (const s of sortBy) {
                const col = state.columns.get(s.columnId);
                const cmp = compareValues(a[s.columnId], b[s.columnId], col ? col.type : 'string');
                if (cmp !== 0) return s.dir === 'asc' ? cmp : -cmp;
            }
            return 0;
        });
    }
    return result;
}

export function getPageRows(state: any): any[] {
    const processed = getProcessedRows(state);
    const { page, pageSize } = state.pagination;
    const start = (page - 1) * pageSize;
    return processed.slice(start, start + pageSize);
}

export function getRowCount(state: any): number {
    return getProcessedRows(state).length;
}

export function getPageCount(state: any): number {
    const total = getRowCount(state);
    return Math.max(1, Math.ceil(total / state.pagination.pageSize));
}

export function summarizeTable(state: any): any {
    const filtered = getRowCount(state);
    const visibleColumns = Array.from(state.columns.values()).filter((c: any) => !c.hidden).length;
    return {
        totalRows: state.rows.length,
        filtered,
        selected: state.selectedIds.size,
        visibleColumns,
        sortLevel: state.sortBy.length,
        pageInfo: {
            page: state.pagination.page,
            pageSize: state.pagination.pageSize,
            pageCount: getPageCount(state),
        },
    };
}
