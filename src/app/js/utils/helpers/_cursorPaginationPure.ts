// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */

/**
 * Cursor-based Pagination — pure logic.
 *
 * Generic helper for Supabase / REST APIs that page via opaque cursor.
 * Pure: caller passes the current page snapshot + a fetcher result;
 * module returns a frozen state transition (`nextCursor`, `prevCursor`,
 * `hasMore`, `items`).
 *
 * Uses keyset pagination (anchored on a stable sort key like
 * `created_at:id`), NOT offset pagination — caller can resume after
 * crashes without skipping rows.
 *
 * Tests live in `tests/cursor-pagination-pure.test.mjs`.
 */

export interface PageInput<T> {
    readonly items: ReadonlyArray<T>;
    readonly pageSize: number;
    readonly sortKey: (item: T) => string | number;
    readonly currentCursor?: string | null;
}

export interface PageVM<T> {
    readonly items: ReadonlyArray<T>;
    readonly nextCursor: string | null;
    readonly prevCursor: string | null;
    readonly hasMore: boolean;
    readonly hasLess: boolean;
    readonly pageSize: number;
    readonly pageItemCount: number;
}

function isFinitePos(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

function encodeCursor(value: string | number): string {
    // Detecta o ambiente (Node tem Buffer, browser tem btoa). O bug anterior
    // testava `Buffer.isBuffer` (uma FUNÇÃO, sempre truthy) → em browser sem
    // Buffer isso lançava ReferenceError ao acessar .isBuffer.
    return typeof Buffer !== 'undefined'
        ? Buffer.from(String(value), 'utf8').toString('base64')
        : btoa(String(value));
}

function decodeCursor(cursor: string): string | null {
    if (typeof cursor !== 'string' || cursor.length === 0) return null;
    // Strict base64 charset check — Buffer.from silently returns empty/partial
    // on invalid input rather than throwing.
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cursor)) return null;
    try {
        const decoded =
            typeof Buffer !== 'undefined'
                ? Buffer.from(cursor, 'base64').toString('utf8')
                : atob(cursor);
        return decoded.length === 0 ? null : decoded;
    } catch {
        return null;
    }
}

/**
 * Build a page VM from a fetched batch. Pure.
 *
 * Algorithm:
 *   - Caller fetched up to `pageSize + 1` items to detect hasMore.
 *   - If returned count > pageSize → drop last + hasMore=true.
 *   - nextCursor = encoded sortKey of last visible item.
 *   - prevCursor = encoded sortKey of first item (if currentCursor present).
 *   - hasLess = true when currentCursor was provided (we can go back).
 */
export function buildPageVm<T>(input: PageInput<T> | null | undefined): PageVM<T> {
    if (!input || typeof input !== 'object') {
        return Object.freeze({
            items: Object.freeze([]),
            nextCursor: null,
            prevCursor: null,
            hasMore: false,
            hasLess: false,
            pageSize: 0,
            pageItemCount: 0,
        });
    }
    if (!Array.isArray(input.items)) {
        return Object.freeze({
            items: Object.freeze([]),
            nextCursor: null,
            prevCursor: null,
            hasMore: false,
            hasLess: false,
            pageSize: isFinitePos(input.pageSize) ? input.pageSize : 0,
            pageItemCount: 0,
        });
    }
    if (!isFinitePos(input.pageSize)) {
        return Object.freeze({
            items: Object.freeze([...input.items]),
            nextCursor: null,
            prevCursor: null,
            hasMore: false,
            hasLess: false,
            pageSize: 0,
            pageItemCount: input.items.length,
        });
    }
    if (typeof input.sortKey !== 'function') {
        return Object.freeze({
            items: Object.freeze([...input.items]),
            nextCursor: null,
            prevCursor: null,
            hasMore: false,
            hasLess: false,
            pageSize: input.pageSize,
            pageItemCount: input.items.length,
        });
    }
    const hasMore = input.items.length > input.pageSize;
    const visible = hasMore ? input.items.slice(0, input.pageSize) : [...input.items];
    let nextCursor: string | null = null;
    let prevCursor: string | null = null;
    if (visible.length > 0) {
        if (hasMore) {
            try {
                nextCursor = encodeCursor(input.sortKey(visible[visible.length - 1] as T));
            } catch {
                nextCursor = null;
            }
        }
        if (input.currentCursor) {
            try {
                prevCursor = encodeCursor(input.sortKey(visible[0] as T));
            } catch {
                prevCursor = null;
            }
        }
    }
    return Object.freeze({
        items: Object.freeze(visible),
        nextCursor,
        prevCursor,
        hasMore,
        hasLess: !!input.currentCursor,
        pageSize: input.pageSize,
        pageItemCount: visible.length,
    });
}

/**
 * Decode an opaque cursor to its original sort-key string. Returns null
 * when invalid (caller treats as "start from beginning").
 */
export function decodeCursorKey(cursor: string | null | undefined): string | null {
    if (!cursor) return null;
    return decodeCursor(cursor);
}

/**
 * Default max payload bytes for JSON cursors (anti-memory-bomb).
 * 16KB é generoso para qualquer cursor legítimo (Supabase keyset
 * typicamente <1KB).
 */
export const MAX_JSON_CURSOR_BYTES = 16_384;

/**
 * Decode a base64-encoded JSON cursor with strict defenses:
 *   - Strict base64 charset check (regex)
 *   - Length cap (default 16KB, configurable)
 *   - JSON.parse com try/catch (não crashea em malformed)
 *   - Returns null em qualquer falha (caller treats as "no cursor")
 *
 * Use case: marketV2Rules.decodeCursor (que antes usava JSON.parse(atob(cursor))
 * sem validação base64 — flagged pelo jwt-anti-pattern-gate batch 7).
 */
export function decodeJsonCursor<T = unknown>(
    cursor: string | null | undefined,
    options?: { readonly maxBytes?: number }
): T | null {
    if (typeof cursor !== 'string' || cursor.length === 0) return null;
    const maxBytes =
        options?.maxBytes && Number.isFinite(options.maxBytes) && options.maxBytes > 0
            ? Math.floor(options.maxBytes)
            : MAX_JSON_CURSOR_BYTES;
    if (cursor.length > maxBytes) return null;
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(cursor)) return null;
    let decoded: string;
    try {
        decoded =
            typeof Buffer !== 'undefined' && Buffer.from
                ? Buffer.from(cursor, 'base64').toString('utf8')
                : atob(cursor);
    } catch {
        return null;
    }
    if (decoded.length === 0 || decoded.length > maxBytes) return null;
    try {
        const parsed = JSON.parse(decoded);
        if (parsed === null || typeof parsed !== 'object') return null;
        return parsed as T;
    } catch {
        return null;
    }
}

/**
 * Build the WHERE-clause comparator hint for Supabase queries (caller
 * passes this to `.gt()` / `.lt()` builders). Pure: returns frozen hint.
 */
export interface CursorComparator {
    readonly op: 'gt' | 'lt';
    readonly key: string;
    readonly value: string;
}

export function buildComparator(
    cursor: string | null | undefined,
    columnName: string,
    direction: 'asc' | 'desc',
): CursorComparator | null {
    if (!cursor) return null;
    const value = decodeCursorKey(cursor);
    if (value === null) return null;
    if (typeof columnName !== 'string' || columnName.length === 0) return null;
    return Object.freeze({
        op: direction === 'asc' ? ('gt' as const) : ('lt' as const),
        key: columnName,
        value,
    });
}
