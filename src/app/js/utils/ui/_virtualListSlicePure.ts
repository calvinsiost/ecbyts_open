// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Virtual List Slice Resolver — pure logic for WS-7 of
 * SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR (Render Virtualization).
 *
 * Given a total item count + item height + scroll position + viewport
 * height, computes which slice of items to render. Pure algorithm —
 * caller plugs DOM (renderer attaches the slice into a scroll container
 * with `transform: translateY(offsetTopPx)`).
 *
 * Supports:
 *   - Fixed-height items (single height for all)
 *   - Variable-height items (caller passes accumulated offsets)
 *   - Overscan (render N extra above/below for smooth scroll)
 *
 * Tests live in `tests/virtual-list-slice-pure.test.mjs`.
 */

export interface FixedHeightInput {
    readonly totalItems: number;
    readonly itemHeightPx: number;
    readonly scrollTopPx: number;
    readonly viewportHeightPx: number;
    /** Items to render above + below the visible window (default 3). */
    readonly overscanItems?: number;
}

export interface VariableHeightInput {
    readonly totalItems: number;
    /** Cumulative offset array: cumulativeOffsets[i] = top of item i. cumulativeOffsets.length = totalItems + 1 (last = total height). */
    readonly cumulativeOffsets: ReadonlyArray<number>;
    readonly scrollTopPx: number;
    readonly viewportHeightPx: number;
    readonly overscanItems?: number;
}

export interface SliceVM {
    readonly startIndex: number;
    readonly endIndex: number;
    readonly visibleCount: number;
    readonly totalHeightPx: number;
    readonly offsetTopPx: number;
    readonly isEmpty: boolean;
}

const DEFAULT_OVERSCAN = 3;

function isFiniteNonNeg(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function clampInt(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.floor(v)));
}

function freezeSlice(s: SliceVM): SliceVM {
    return Object.freeze({ ...s });
}

function emptySlice(totalHeightPx = 0): SliceVM {
    return freezeSlice({
        startIndex: 0,
        endIndex: 0,
        visibleCount: 0,
        totalHeightPx,
        offsetTopPx: 0,
        isEmpty: true,
    });
}

/**
 * Compute slice for fixed-height items. Pure: returns frozen VM.
 */
export function resolveFixedHeightSlice(input: FixedHeightInput | null | undefined): SliceVM {
    if (!input || typeof input !== 'object') return emptySlice();
    if (
        !isFiniteNonNeg(input.totalItems) ||
        !isFiniteNonNeg(input.itemHeightPx) ||
        input.itemHeightPx === 0 ||
        !isFiniteNonNeg(input.viewportHeightPx)
    ) {
        return emptySlice();
    }
    if (input.totalItems === 0) return emptySlice();

    const overscan = isFiniteNonNeg(input.overscanItems)
        ? Math.floor(input.overscanItems as number)
        : DEFAULT_OVERSCAN;
    const scrollTop = isFiniteNonNeg(input.scrollTopPx) ? input.scrollTopPx : 0;
    const totalHeightPx = input.totalItems * input.itemHeightPx;
    const firstVisible = Math.floor(scrollTop / input.itemHeightPx);
    const lastVisible = Math.ceil((scrollTop + input.viewportHeightPx) / input.itemHeightPx);

    const startIndex = clampInt(firstVisible - overscan, 0, input.totalItems);
    const endIndex = clampInt(lastVisible + overscan, startIndex, input.totalItems);
    const visibleCount = endIndex - startIndex;
    const offsetTopPx = startIndex * input.itemHeightPx;

    return freezeSlice({
        startIndex,
        endIndex,
        visibleCount,
        totalHeightPx,
        offsetTopPx,
        isEmpty: visibleCount === 0,
    });
}

/**
 * Binary search the cumulative offsets array for the first index whose
 * top >= scrollTop. Returns the FOUND index OR length-1 when scrollTop
 * exceeds the array.
 */
function binarySearchFirstAtOrAfter(offsets: ReadonlyArray<number>, target: number): number {
    let lo = 0;
    let hi = offsets.length - 1;
    let best = offsets.length - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const v = offsets[mid] as number;
        if (v >= target) {
            best = mid;
            hi = mid - 1;
        } else {
            lo = mid + 1;
        }
    }
    return best;
}

/**
 * Compute slice for variable-height items using cumulative offsets.
 * `cumulativeOffsets[i]` is the TOP of item i; `cumulativeOffsets[total]`
 * is the bottom of the last item (total content height).
 */
export function resolveVariableHeightSlice(input: VariableHeightInput | null | undefined): SliceVM {
    if (!input || typeof input !== 'object') return emptySlice();
    if (
        !Array.isArray(input.cumulativeOffsets) ||
        input.cumulativeOffsets.length === 0 ||
        !isFiniteNonNeg(input.totalItems) ||
        !isFiniteNonNeg(input.viewportHeightPx)
    ) {
        return emptySlice();
    }
    if (input.totalItems === 0) return emptySlice();

    const overscan = isFiniteNonNeg(input.overscanItems)
        ? Math.floor(input.overscanItems as number)
        : DEFAULT_OVERSCAN;
    const scrollTop = isFiniteNonNeg(input.scrollTopPx) ? input.scrollTopPx : 0;
    const offsets = input.cumulativeOffsets;
    const totalHeightPx = offsets[offsets.length - 1] as number;

    const firstIdx = binarySearchFirstAtOrAfter(offsets, scrollTop);
    // firstIdx is the FIRST index whose top >= scrollTop; we actually want the
    // item that CONTAINS scrollTop, which is firstIdx - 1 (its top is below
    // scrollTop). Clamp at 0.
    const firstVisible = Math.max(0, firstIdx - 1);
    const lastIdx = binarySearchFirstAtOrAfter(offsets, scrollTop + input.viewportHeightPx);
    const lastVisible = Math.min(input.totalItems, lastIdx + 1);

    const startIndex = clampInt(firstVisible - overscan, 0, input.totalItems);
    const endIndex = clampInt(lastVisible + overscan, startIndex, input.totalItems);
    const visibleCount = endIndex - startIndex;
    const offsetTopPx = offsets[startIndex] as number;

    return freezeSlice({
        startIndex,
        endIndex,
        visibleCount,
        totalHeightPx,
        offsetTopPx,
        isEmpty: visibleCount === 0,
    });
}

/**
 * Helper — build cumulative offsets from an array of per-item heights.
 * Useful for callers that have heights but not cumulative offsets yet.
 */
export function buildCumulativeOffsets(heights: ReadonlyArray<number> | null | undefined): ReadonlyArray<number> {
    if (!Array.isArray(heights) || heights.length === 0) return Object.freeze([0]);
    const offsets: number[] = [0];
    let acc = 0;
    for (const h of heights) {
        acc += isFiniteNonNeg(h) ? h : 0;
        offsets.push(acc);
    }
    return Object.freeze(offsets);
}
