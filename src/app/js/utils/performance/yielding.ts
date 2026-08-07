// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Runtime yielding facade for PERF-CODEBASE-WIDE WS-5.
 *
 * Centraliza yields de longa duracao para evitar `setTimeout(0)` espalhado em
 * loops de ingestao, vetorizacao, geracao random e render pesado.
 */
import { chunkedForEachPure } from './_yieldingSchedulerPure.js';

export interface YieldOptions {
    readonly priority?: 'background' | 'user-visible' | 'user-blocking';
    readonly timeoutMs?: number;
}

export interface IdleOptions {
    readonly timeoutMs?: number;
}

export interface ChunkedRuntimeOptions {
    readonly budgetMs?: number;
    readonly signal?: AbortSignal;
    readonly onChunk?: (info: any) => void;
}

const DEFAULT_YIELD_TIMEOUT_MS = 16;
const DEFAULT_IDLE_TIMEOUT_MS = 250;

function getPerformanceNow(): number {
    const perf = (globalThis as any).performance;
    return perf && typeof perf.now === 'function' ? perf.now() : Date.now();
}

export async function yieldToMain(options: YieldOptions = {}): Promise<void> {
    const schedulerRef = (globalThis as any).scheduler;
    if (schedulerRef && typeof schedulerRef.yield === 'function') {
        await schedulerRef.yield({ priority: options.priority });
        return;
    }
    await new Promise<void>((resolve) => {
        const timeoutMs = Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : DEFAULT_YIELD_TIMEOUT_MS;
        setTimeout(resolve, Math.max(0, timeoutMs === 0 ? 0 : Math.min(timeoutMs, DEFAULT_YIELD_TIMEOUT_MS)));
    });
}

export async function runIdleTask<T>(fn: () => T | Promise<T>, options: IdleOptions = {}): Promise<T> {
    const requestIdle = (globalThis as any).requestIdleCallback;
    if (typeof requestIdle === 'function') {
        await new Promise<void>((resolve) => {
            requestIdle(() => resolve(), {
                timeout: Number.isFinite(options.timeoutMs) ? Number(options.timeoutMs) : DEFAULT_IDLE_TIMEOUT_MS,
            });
        });
    } else {
        await yieldToMain({ timeoutMs: options.timeoutMs ?? DEFAULT_YIELD_TIMEOUT_MS });
    }
    return fn();
}

export function chunkedForEach<T>(
    items: ReadonlyArray<T>,
    fn: (item: T, index: number) => unknown | Promise<unknown>,
    options: ChunkedRuntimeOptions = {},
) {
    return chunkedForEachPure(
        items,
        fn,
        {
            now: getPerformanceNow,
            yieldToMain: () => yieldToMain({ timeoutMs: DEFAULT_YIELD_TIMEOUT_MS }),
        },
        options,
    );
}

export function hasInputPendingSafe(): boolean {
    const schedulingRef = (globalThis as any).navigator?.scheduling;
    if (!schedulingRef || typeof schedulingRef.isInputPending !== 'function') {
        return false;
    }
    try {
        return Boolean(schedulingRef.isInputPending());
    } catch (_err) {
        return false;
    }
}
