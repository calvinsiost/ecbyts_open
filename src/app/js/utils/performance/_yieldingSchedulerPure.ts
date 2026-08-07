// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Yielding Scheduler — pure logic core for WS-5 of
 * SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Algorithm-only: defines the chunking + budget-control mechanics with
 * `clock + yield` injected. The browser-API wrapper (`yielding.ts`)
 * plugs real `performance.now()` + `scheduler.yield()` /
 * `requestIdleCallback()`; this module stays platform-agnostic so the
 * algorithm itself is unit-testable without DOM/browser timers.
 *
 * Concept:
 *   - Long-running loops (ingestion, vectorization, random generation,
 *     lists rendering, mesh factory) should NOT block main thread for
 *     > 50ms.
 *   - `chunkedForEachPure(items, fn, budgetMs, hooks)` processes items
 *     synchronously until `budgetMs` elapses, then yields via `hooks.yield()`,
 *     resumes on next slot, repeats until done.
 *
 * Cancellation: caller may pass `signal: AbortSignal`. When aborted, the
 * loop exits at the next chunk boundary (NOT mid-fn — predictable state).
 *
 * Tests live in `tests/yielding-scheduler-pure.test.mjs`.
 */

export interface SchedulerHooks {
    /** Monotonic clock — returns ms (compatible with performance.now()). */
    now(): number;
    /** Yields control to the event loop / scheduler. Returns when caller resumes. */
    yieldToMain(): Promise<void>;
}

export interface ChunkedOptions {
    /** Budget per chunk in ms (default 5). Calibrated for 60FPS frame budget. */
    readonly budgetMs?: number;
    /** Optional abort signal — exits at next chunk boundary. */
    readonly signal?: AbortSignal;
    /** Optional callback per chunk for telemetry. */
    readonly onChunk?: (info: ChunkInfo) => void;
}

export interface ChunkInfo {
    readonly chunkIndex: number;
    readonly itemsProcessed: number;
    readonly elapsedMs: number;
    readonly totalProcessed: number;
}

export interface ChunkedResult {
    readonly totalChunks: number;
    readonly totalProcessed: number;
    readonly totalElapsedMs: number;
    readonly aborted: boolean;
}

const DEFAULT_BUDGET_MS = 5;

function emptyChunkedResult(): ChunkedResult {
    return Object.freeze({
        totalChunks: 0,
        totalProcessed: 0,
        totalElapsedMs: 0,
        aborted: false,
    });
}

function validateSchedulerHooks(hooks: SchedulerHooks): void {
    if (!hooks || typeof hooks.now !== 'function' || typeof hooks.yieldToMain !== 'function') {
        throw new Error('chunkedForEachPure: invalid hooks');
    }
}

function resolveBudget(options: ChunkedOptions | undefined): number {
    const candidate = options?.budgetMs;
    if (candidate !== undefined && Number.isFinite(candidate) && candidate > 0) {
        return candidate;
    }
    return DEFAULT_BUDGET_MS;
}

function emitChunkInfo(
    onChunk: ((info: ChunkInfo) => void) | null | undefined,
    chunkIndex: number,
    itemsProcessed: number,
    elapsedMs: number,
    totalProcessed: number,
): void {
    if (typeof onChunk !== 'function') return;
    onChunk(
        Object.freeze({
            chunkIndex,
            itemsProcessed,
            elapsedMs,
            totalProcessed,
        }),
    );
}

function shouldYield(elapsedMs: number, budgetMs: number, hasMoreItems: boolean): boolean {
    return elapsedMs >= budgetMs && hasMoreItems;
}

/**
 * Process `items` calling `fn(item, index)` for each, yielding to the
 * main thread whenever a chunk exceeds `budgetMs`. Returns when all
 * items processed OR `signal.aborted`.
 *
 * Pure (in the sense that all platform deps are injected via `hooks`):
 *   - `hooks.now()` provides time
 *   - `hooks.yieldToMain()` is the yield primitive
 *
 * Caller-provided `fn` may be sync or async — module awaits the result.
 */
export async function chunkedForEachPure<T>(
    items: ReadonlyArray<T>,
    fn: (item: T, index: number) => unknown | Promise<unknown>,
    hooks: SchedulerHooks,
    options?: ChunkedOptions,
): Promise<ChunkedResult> {
    if (!Array.isArray(items)) {
        return emptyChunkedResult();
    }
    validateSchedulerHooks(hooks);
    const budget = resolveBudget(options);
    const signal = options?.signal;
    const onChunk = typeof options?.onChunk === 'function' ? options.onChunk : null;

    const startTime = hooks.now();
    let chunkStart = startTime;
    let chunkItems = 0;
    let totalProcessed = 0;
    let totalChunks = 0;
    let aborted = false;

    for (let i = 0; i < items.length; i++) {
        if (signal?.aborted) {
            aborted = true;
            break;
        }
        const item = items[i];
        if (item === undefined) continue;
        await fn(item, i);
        chunkItems++;
        totalProcessed++;
        const elapsedSinceChunkStart = hooks.now() - chunkStart;
        if (shouldYield(elapsedSinceChunkStart, budget, i + 1 < items.length)) {
            totalChunks++;
            emitChunkInfo(onChunk, totalChunks - 1, chunkItems, elapsedSinceChunkStart, totalProcessed);
            await hooks.yieldToMain();
            chunkStart = hooks.now();
            chunkItems = 0;
        }
    }
    // Final chunk (whatever remained) — count once we exit the loop.
    if (chunkItems > 0 || totalChunks === 0) {
        totalChunks++;
        emitChunkInfo(onChunk, totalChunks - 1, chunkItems, hooks.now() - chunkStart, totalProcessed);
    }
    const totalElapsedMs = hooks.now() - startTime;
    return Object.freeze({
        totalChunks,
        totalProcessed,
        totalElapsedMs,
        aborted,
    });
}

/**
 * Helper — plan how many items fit in a budget given a `costPerItem` estimate.
 * Pure function: returns frozen plan { itemsPerChunk, totalChunks }.
 */
export function planChunks(itemCount: number, costPerItemMs: number, budgetMs: number): Readonly<{
    itemsPerChunk: number;
    totalChunks: number;
    estimatedTotalMs: number;
}> {
    if (
        !Number.isFinite(itemCount) ||
        itemCount <= 0 ||
        !Number.isFinite(costPerItemMs) ||
        costPerItemMs <= 0 ||
        !Number.isFinite(budgetMs) ||
        budgetMs <= 0
    ) {
        return Object.freeze({ itemsPerChunk: 0, totalChunks: 0, estimatedTotalMs: 0 });
    }
    const itemsPerChunk = Math.max(1, Math.floor(budgetMs / costPerItemMs));
    const totalChunks = Math.ceil(itemCount / itemsPerChunk);
    const estimatedTotalMs = itemCount * costPerItemMs;
    return Object.freeze({ itemsPerChunk, totalChunks, estimatedTotalMs });
}

/**
 * Default mock-friendly clock for tests: synthetic monotonic counter.
 * Caller creates one per test, advances it manually.
 */
export interface FakeClock {
    readonly now: () => number;
    advance(deltaMs: number): void;
}

export function createFakeClock(startMs = 0): FakeClock {
    let t = startMs;
    return {
        now() {
            return t;
        },
        advance(deltaMs: number) {
            t += deltaMs;
        },
    };
}
