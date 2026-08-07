// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

export interface DeferredIdlePersistenceOptions {
    readonly debounceMs: number;
    readonly bootDelayMs: number;
    readonly idleTimeoutMs: number;
    readonly flush: () => unknown | Promise<unknown>;
    readonly onError?: (error: unknown) => void;
    readonly documentRef?: Document | null;
}

export interface DeferredIdlePersistenceController {
    readonly schedule: () => void;
    readonly flushNow: () => Promise<void>;
    readonly clear: () => void;
    readonly hasPending: () => boolean;
    readonly bindLifecycleFlush: () => void;
}

function getElapsedSinceNavigationMs(): number {
    const performanceRef = (globalThis as any).performance;
    if (performanceRef && typeof performanceRef.now === 'function') {
        return Math.max(0, Number(performanceRef.now()) || 0);
    }
    return 0;
}

function getScheduleDelayMs(options: DeferredIdlePersistenceOptions): number {
    const elapsedMs = getElapsedSinceNavigationMs();
    if (elapsedMs < options.bootDelayMs) {
        return Math.max(options.debounceMs, options.bootDelayMs - elapsedMs);
    }
    return options.debounceMs;
}

export function createDeferredIdlePersistence(
    options: DeferredIdlePersistenceOptions,
): DeferredIdlePersistenceController {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let idleHandle: any = null;
    let lifecycleBound = false;

    function clear() {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        const cancelIdle = (globalThis as any).cancelIdleCallback;
        if (idleHandle != null && typeof cancelIdle === 'function') {
            cancelIdle(idleHandle);
        }
        idleHandle = null;
    }

    async function flushNow() {
        clear();
        try {
            await options.flush();
        } catch (error) {
            options.onError?.(error);
        }
    }

    function runIdleFlush() {
        const requestIdle = (globalThis as any).requestIdleCallback;
        if (typeof requestIdle === 'function') {
            idleHandle = requestIdle(
                () => {
                    idleHandle = null;
                    void flushNow();
                },
                { timeout: options.idleTimeoutMs },
            );
            return;
        }
        void flushNow();
    }

    function bindLifecycleFlush() {
        if (lifecycleBound || typeof window === 'undefined') return;
        const documentRef = options.documentRef ?? (typeof document !== 'undefined' ? document : null);
        const flushPending = () => {
            if (hasPending()) void flushNow();
        };
        window.addEventListener('pagehide', flushPending);
        documentRef?.addEventListener?.('visibilitychange', () => {
            if (documentRef.visibilityState === 'hidden') flushPending();
        });
        lifecycleBound = true;
    }

    function schedule() {
        clear();
        bindLifecycleFlush();
        const delayMs = getScheduleDelayMs(options);
        timer = setTimeout(() => {
            timer = null;
            runIdleFlush();
        }, delayMs);
        (timer as any)?.unref?.();
    }

    function hasPending() {
        return timer != null || idleHandle != null;
    }

    return Object.freeze({
        schedule,
        flushNow,
        clear,
        hasPending,
        bindLifecycleFlush,
    });
}
