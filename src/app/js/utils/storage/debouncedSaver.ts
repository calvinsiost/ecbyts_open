// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Debounced Saver - pure module.
 *
 * Extracted in ARCH-MONO-001 Phase 1 from inline debounce code in
 * `panelManager.js` (camera state saver), `homeGrid.js` (layout persist),
 * `costAnalysisPanel.js`, `viewRouter.js` (view mode persist), and ~5
 * other places that all reimplemented the same pattern slightly
 * differently.
 *
 * Why this exists: every time UI state changes frequently (drag, resize,
 * type, scroll), saving to localStorage on every event is wasteful and
 * causes jank. The pattern is "wait until user stops for N ms, then save
 * the latest value". Naive `setTimeout` reimplementation has 4 subtle bugs:
 *   1. Forgetting to clear the previous timer (multiple saves queue up)
 *   2. Not flushing on `pagehide` (last edits lost on tab close)
 *   3. Dropping errors silently (save fails, no log)
 *   4. Not deduplicating identical values (save spam if same value)
 *
 * This helper handles all 4 + provides explicit `flush()` and `cancel()`.
 *
 * @example
 * import { createDebouncedSaver } from '../storage/debouncedSaver.js';
 *
 * const savePanelLayout = createDebouncedSaver({
 *     key: 'ecbyts-panel-layout',
 *     delayMs: 300,
 *     write: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
 *     tag: 'panelManager',
 * });
 *
 * // On every drag tick:
 * savePanelLayout({ width: panel.offsetWidth, height: panel.offsetHeight });
 *
 * // On critical moments:
 * savePanelLayout.flush(); // force immediate save
 */

export interface DebouncedSaverOptions {
    key: string;
    delayMs?: number;
    write: (key: string, value: unknown) => void | Promise<void>;
    tag?: string;
    flushOnPageHide?: boolean;
}

export interface DebouncedSaverInstance {
    (value: unknown): void;
    flush: () => Promise<void>;
    cancel: () => void;
    hasPending: () => boolean;
    destroy: () => void;
}

/**
 * Create a debounced saver instance. Returns a callable that schedules
 * a write after `delayMs` of no further calls. The latest value wins.
 *
 * @param {DebouncedSaverOptions} options
 * @returns {DebouncedSaverInstance}
 */
export function createDebouncedSaver(options: DebouncedSaverOptions): DebouncedSaverInstance {
    if (!options || typeof options !== 'object') {
        throw new Error('createDebouncedSaver: options is required');
    }
    const { key, write, delayMs = 300, tag = 'unknown', flushOnPageHide = true } = options;
    if (!key || typeof key !== 'string') {
        throw new Error('createDebouncedSaver: options.key (string) is required');
    }
    if (typeof write !== 'function') {
        throw new Error('createDebouncedSaver: options.write (function) is required');
    }

    let pendingValue: unknown = undefined;
    let hasPendingValue: boolean = false;
    let lastWrittenJson: string | undefined = undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function doWrite(): Promise<void> {
        if (!hasPendingValue) return;
        const value = pendingValue;
        pendingValue = undefined;
        hasPendingValue = false;
        timer = null;

        // Dedupe: skip if value serializes to the same JSON as the last write
        let json: string;
        try {
            json = JSON.stringify(value);
        } catch (e) {
            console.warn(
                `[ecbyts:${tag}] debouncedSaver: value not serializable for key=${key}`,
                (e as Error)?.message,
            );
            return;
        }
        if (json === lastWrittenJson) return;

        try {
            await write(key, value);
            lastWrittenJson = json;
        } catch (e) {
            console.warn(
                `[ecbyts:${tag}] debouncedSaver: write failed for key=${key}`,
                (e as Error)?.message || e,
            );
        }
    }

    function schedule(value: unknown): void {
        pendingValue = value;
        hasPendingValue = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(doWrite, delayMs);
    }

    function flush(): Promise<void> {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        return doWrite();
    }

    function cancel(): void {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
        pendingValue = undefined;
        hasPendingValue = false;
    }

    let pageHideListener: (() => void) | null = null;
    if (flushOnPageHide && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        pageHideListener = () => {
            // Synchronous best-effort flush - pagehide doesn't wait for promises
            if (hasPendingValue) {
                try {
                    write(key, pendingValue);
                    lastWrittenJson = JSON.stringify(pendingValue);
                } catch (e) {
                    console.debug('[debouncedSaver] pagehide:', (e as Error)?.message || e);
                    /* swallow on pagehide */
                }
                cancel();
            }
        };
        window.addEventListener('pagehide', pageHideListener);
    }

    function destroy(): void {
        cancel();
        if (pageHideListener && typeof window !== 'undefined') {
            window.removeEventListener('pagehide', pageHideListener);
            pageHideListener = null;
        }
    }

    // Return a callable with attached methods
    const instance: DebouncedSaverInstance = (value: unknown) => schedule(value);
    instance.flush = flush;
    instance.cancel = cancel;
    instance.hasPending = () => hasPendingValue;
    instance.destroy = destroy;
    return instance;
}