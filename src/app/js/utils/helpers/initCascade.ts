// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Init Cascade Resilience helper - pure module.
 *
 * Extracted in ARCH-MONO-001 Phase 1 from `app/js/utils/datastudio/index.js`
 * (commit 77d6336, lesson `init-cascade-resilience` 2026-04-11).
 *
 * Why this exists: routines that call N sub-inits in a linear `await` chain
 * are fragile by design - any throw mid-chain aborts the whole flow and
 * shows a fatal "failed to load X" screen even when 90% of the features
 * would have worked. The pattern was first formalized for `initDataStudio`
 * after a Collections endpoint 404 took down the entire Data Studio.
 *
 * This helper is the canonical source of truth - every `initX()` routine
 * with >3 sub-inits should use it instead of inventing its own try/catch
 * boilerplate. The fundamental contract is: each sub-step is isolated;
 * only a fatal infra problem (e.g. missing DOM container) should bubble
 * up to the caller.
 *
 * @example
 * import { safeInit } from '../helpers/initCascade.js';
 *
 * export async function initMyModule() {
 *     const container = document.getElementById('my-module');
 *     if (!container) throw new Error('my-module container not found');
 *
 *     await safeInit('subsystem A', () => initA(container));
 *     let bReady = false;
 *     await safeInit('subsystem B (gate)', async () => {
 *         await initB(container);
 *         bReady = true;
 *     });
 *     if (bReady) {
 *         await safeInit('subsystem C (depends on B)', () => initC(container));
 *     }
 * }
 */

/**
 * Run an init step in isolation. Logs failures with normalized message
 * + stack but never re-throws - caller decides what to do based on the
 * returned boolean.
 *
 * Log format: `[ecbyts:<module>] <name> failed: <message> <stack>`
 * The `<module>` prefix should be set via the optional `tag` parameter
 * so logs are filterable per-feature.
 *
 * @param {string} name - diagnostic name shown in console on failure
 * @param {() => void | Promise<void>} fn - init function (sync or async); may throw freely
 * @param {string} [tag='unknown'] - module tag for log prefix (e.g. 'datastudio', 'eis')
 * @returns {Promise<boolean>} true if the step succeeded, false otherwise
 */
export async function safeInit(
    name: string,
    fn: () => void | Promise<void>,
    tag: string = 'unknown',
): Promise<boolean> {
    try {
        await fn();
        return true;
    } catch (e: unknown) {
        const err = e as Error;
        const msg = err?.message || (typeof err?.toString === 'function' ? err.toString() : 'unknown');
        const stack = err?.stack || '';

        console.error(`[ecbyts:${tag}] ${name} failed:`, msg, stack);
        return false;
    }
}

/**
 * Convenience wrapper that creates a tagged version of `safeInit` for a
 * specific module. Avoids repeating the tag parameter in every call site.
 *
 * @example
 * const safeInitDS = createTaggedSafeInit('datastudio');
 * await safeInitDS('SQL engine init', initSqlEngine);
 * await safeInitDS('CodeMirror editor init', () => initEditor(el));
 *
 * @param {string} tag - module tag for log prefix
 * @returns {(name: string, fn: () => void | Promise<void>) => Promise<boolean>}
 */
export function createTaggedSafeInit(
    tag: string,
): (name: string, fn: () => void | Promise<void>) => Promise<boolean> {
    return (name, fn) => safeInit(name, fn, tag);
}