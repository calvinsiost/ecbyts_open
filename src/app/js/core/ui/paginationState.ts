// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pagination State - pure-logic, zero DOM
// UX-87: offset/cursor pagination + windowed page numbers
// All operations are immutable (frozen state).

const VALID_MODES = ['offset', 'cursor'];

function freeze(state: any): any {
    return Object.freeze({
        ...state,
        cursors: Object.freeze({ ...state.cursors }),
        allowedPageSizes: Object.freeze([...state.allowedPageSizes]),
    });
}

function assertValidMode(mode: string): void {
    if (!VALID_MODES.includes(mode)) {
        throw new Error(`Invalid mode: ${mode}. Expected one of ${VALID_MODES.join(', ')}`);
    }
}

function assertAllowedPageSizes(allowedPageSizes: number[], pageSize: number): void {
    if (!Array.isArray(allowedPageSizes) || allowedPageSizes.length === 0) {
        throw new Error('allowedPageSizes must be a non-empty array');
    }
    if (!allowedPageSizes.includes(pageSize)) {
        throw new Error(`pageSize ${pageSize} not in allowedPageSizes [${allowedPageSizes.join(',')}]`);
    }
}

function assertNonNegativeNumber(value: number, name: string): void {
    if (typeof value !== 'number' || value < 0) {
        throw new Error(`${name} must be a non-negative number`);
    }
}

function assertPositiveInteger(value: number, name: string): void {
    if (typeof value !== 'number' || value < 1) {
        throw new Error(`${name} must be >= 1`);
    }
}

function buildCursors(cursors: { prev?: any; next?: any; first?: any; last?: any }): {
    prev: any;
    next: any;
    first: any;
    last: any;
} {
    return {
        prev: cursors.prev ?? null,
        next: cursors.next ?? null,
        first: cursors.first ?? null,
        last: cursors.last ?? null,
    };
}

/**
 * Create a pagination state.
 * @param opts
 * @param opts.mode
 * @param opts.pageSize
 * @param opts.allowedPageSizes
 * @param opts.totalItems
 * @param opts.currentPage
 * @param opts.cursors
 */
export function createPagination({
    mode = 'offset',
    pageSize = 25,
    allowedPageSizes = [10, 25, 50, 100],
    totalItems = 0,
    currentPage = 1,
    cursors = {},
}: {
    mode?: 'offset' | 'cursor';
    pageSize?: number;
    allowedPageSizes?: number[];
    totalItems?: number;
    currentPage?: number;
    cursors?: { prev?: any; next?: any; first?: any; last?: any };
} = {}): any {
    assertValidMode(mode);
    assertAllowedPageSizes(allowedPageSizes, pageSize);
    assertNonNegativeNumber(totalItems, 'totalItems');
    assertPositiveInteger(currentPage, 'currentPage');
    return freeze({
        mode,
        pageSize,
        allowedPageSizes: [...allowedPageSizes],
        totalItems,
        currentPage,
        cursors: buildCursors(cursors),
    });
}

export function getTotalPages(state: any): number {
    if (state.totalItems === 0 || state.pageSize === 0) return 0;
    return Math.ceil(state.totalItems / state.pageSize);
}

export function getOffset(state: any): number {
    return (state.currentPage - 1) * state.pageSize;
}

export function hasNext(state: any): boolean {
    if (state.mode === 'cursor') return state.cursors.next != null;
    const total = getTotalPages(state);
    if (total === 0) return false;
    return state.currentPage < total;
}

export function hasPrev(state: any): boolean {
    if (state.mode === 'cursor') return state.cursors.prev != null;
    return state.currentPage > 1;
}

export function setPage(state: any, page: any): any {
    if (typeof page !== 'number' || page < 1) {
        throw new Error('page must be >= 1');
    }
    const total = getTotalPages(state);
    let clamped = page;
    if (total > 0 && page > total) clamped = total;
    return freeze({ ...state, currentPage: clamped });
}

export function setPageSize(state: any, size: any): any {
    if (!state.allowedPageSizes.includes(size)) {
        throw new Error(`pageSize ${size} not in allowedPageSizes [${state.allowedPageSizes.join(',')}]`);
    }
    return freeze({ ...state, pageSize: size, currentPage: 1 });
}

export function nextPage(state: any): any {
    if (!hasNext(state)) return state;
    if (state.mode === 'cursor') {
        // In cursor mode, caller is expected to setCursor after fetching next page;
        // we simply increment currentPage as a logical hint.
        return freeze({ ...state, currentPage: state.currentPage + 1 });
    }
    return setPage(state, state.currentPage + 1);
}

export function prevPage(state: any): any {
    if (!hasPrev(state)) return state;
    if (state.mode === 'cursor') {
        return freeze({ ...state, currentPage: Math.max(1, state.currentPage - 1) });
    }
    return setPage(state, state.currentPage - 1);
}

export function firstPage(state: any): any {
    return freeze({ ...state, currentPage: 1 });
}

export function lastPage(state: any): any {
    if (state.mode === 'cursor') {
        // Without a known total, last is a no-op unless cursor.last is present;
        // we keep currentPage but let consumer use cursors.last to fetch.
        return state;
    }
    const total = getTotalPages(state);
    if (total === 0) return state;
    return freeze({ ...state, currentPage: total });
}

export function setTotalItems(state: any, total: any): any {
    if (typeof total !== 'number' || total < 0) {
        throw new Error('totalItems must be a non-negative number');
    }
    const newState = { ...state, totalItems: total };
    // Clamp currentPage if needed
    const totalPages = total === 0 ? 0 : Math.ceil(total / state.pageSize);
    if (totalPages > 0 && newState.currentPage > totalPages) {
        newState.currentPage = totalPages;
    }
    return freeze(newState);
}

export function setCursor(state: any, cursor: any): any {
    if (state.mode !== 'cursor') {
        throw new Error('setCursor requires mode=cursor');
    }
    if (!cursor || typeof cursor !== 'object') {
        throw new Error('cursor must be an object');
    }
    return freeze({
        ...state,
        cursors: {
            prev: cursor.prev ?? null,
            next: cursor.next ?? null,
            first: cursor.first ?? null,
            last: cursor.last ?? null,
        },
    });
}

/**
 * Returns a windowed page list around currentPage. Includes first and last,
 * with '...' ellipsis where appropriate.
 * Example (current=5, total=20, window=5): [1, '...', 3, 4, 5, 6, 7, '...', 20]
 */
export function getPageWindow(state: any, windowSize = 5): Array<number | string> {
    const total = getTotalPages(state);
    if (total === 0) return [];
    if (total <= windowSize + 2) {
        // Just list all pages
        const all = [];
        for (let i = 1; i <= total; i++) all.push(i);
        return all;
    }
    const half = Math.floor(windowSize / 2);
    let start = Math.max(2, state.currentPage - half);
    let end = Math.min(total - 1, state.currentPage + half);

    // Adjust window if near edges
    if (state.currentPage - half < 2) {
        end = Math.min(total - 1, end + (2 - (state.currentPage - half)));
    }
    if (state.currentPage + half > total - 1) {
        start = Math.max(2, start - (state.currentPage + half - (total - 1)));
    }

    const result: Array<number | string> = [1];
    if (start > 2) result.push('...');
    for (let i = start; i <= end; i++) result.push(i);
    if (end < total - 1) result.push('...');
    result.push(total);
    return result;
}

const RANGE_TEXT: Record<string, (from: number, to: number, total: number) => string> = {
    en: (from, to, total) => `Showing ${from}-${to} of ${total}`,
    'pt-BR': (from, to, total) => `Mostrando ${from}-${to} de ${total}`,
    pt: (from, to, total) => `Mostrando ${from}-${to} de ${total}`,
    es: (from, to, total) => `Mostrando ${from}-${to} de ${total}`,
};

export function getRangeText(state: any, locale = 'en'): string {
    const total = state.totalItems;
    if (total === 0) {
        if (locale.startsWith('pt')) return 'Mostrando 0 de 0';
        if (locale.startsWith('es')) return 'Mostrando 0 de 0';
        return 'Showing 0 of 0';
    }
    const from = getOffset(state) + 1;
    const to = Math.min(from + state.pageSize - 1, total);
    const fmt = (RANGE_TEXT[locale] ||
        (locale.startsWith('pt')
            ? RANGE_TEXT['pt']
            : locale.startsWith('es')
              ? RANGE_TEXT['es']
              : RANGE_TEXT['en'])) as (from: number, to: number, total: number) => string;
    return fmt(from, to, total);
}

export function summarizePagination(state: any): any {
    return {
        currentPage: state.currentPage,
        totalPages: getTotalPages(state),
        pageSize: state.pageSize,
        totalItems: state.totalItems,
        hasNext: hasNext(state),
        hasPrev: hasPrev(state),
        offset: getOffset(state),
    };
}
