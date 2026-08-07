// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * registerHandlerBags - shared helper for handler registration.
 *
 * Extracted in ARCH-MONO-001 Phase 1d from the 84 `Object.assign(window, bag)`
 * calls in `utils/handlers/index.js`. Purpose: one canonical place to register
 * a bag of window.* handlers with optional observability (log how many
 * functions each bag contributes) and collision detection.
 *
 * Why this exists: scattered `Object.assign(window, x)` calls grow silently.
 * Every time a new handler file is added, someone copies a line. A helper
 * makes it trivial to (a) enforce every bag has a name, (b) detect accidental
 * overwrites of existing handlers, (c) collect registration stats for tests
 * (see `tests/handler-registry.test.mjs`).
 *
 * The helper never re-throws on collision - production must not crash during
 * boot. It logs a warning instead. Tests can opt into strict mode.
 *
 * @example
 * import { registerHandlerBags } from './registerHandlers.js';
 * import { elementHandlers } from './elements.js';
 * import { observationHandlers } from './observations.js';
 *
 * registerHandlerBags(
 *     { elementHandlers, observationHandlers },
 *     { target: window, tag: 'core' }
 * );
 */

export interface RegisterOptions {
    target?: unknown;
    tag?: string;
    strict?: boolean;
    silent?: boolean;
}

export interface RegisterReport {
    totalBags: number;
    totalFunctions: number;
    collisions: number;
    collidedKeys: string[];
    perBag: Record<string, number>;
}

/**
 * Register an object of handler bags onto a target (usually `window`).
 *
 * Each key in `bags` is the bag variable name (used only for logging/tests);
 * the value is the handler bag itself - an object whose keys are global
 * function names and values are functions.
 *
 * Behavior:
 *   - Skips non-object bags (null/undefined/primitives) with a warning
 *   - Detects collisions: a bag key that already exists on target
 *   - Default: warn once per collision, continue
 *   - strict: throw Error on first collision
 *   - Returns a report of what was registered
 *
 * @param {Record<string, object>} bags
 * @param {RegisterOptions} [opts]
 * @returns {RegisterReport}
 */
export function registerHandlerBags(
    bags: Record<string, object>,
    opts: RegisterOptions = {} as RegisterOptions,
): RegisterReport {
    const target = (opts.target as any) || (typeof window !== 'undefined' ? window : {});
    const tag = opts.tag || 'handlers';
    const strict = opts.strict === true;
    const silent = opts.silent === true;

    const report: RegisterReport = {
        totalBags: 0,
        totalFunctions: 0,
        collisions: 0,
        collidedKeys: [],
        perBag: {},
    };

    for (const [bagName, bag] of Object.entries(bags || {})) {
        if (!bag || typeof bag !== 'object') {
            if (!silent) console.warn(`[ecbyts:${tag}] bag "${bagName}" is not an object — skipped`);
            continue;
        }
        report.totalBags++;
        let bagFnCount = 0;
        for (const [key, value] of Object.entries(bag)) {
            if (typeof value !== 'function') continue;
            if (Object.prototype.hasOwnProperty.call(target, key) && target[key] !== value) {
                report.collisions++;
                report.collidedKeys.push(key);
                if (strict) {
                    throw new Error(`[ecbyts:${tag}] collision on window.${key} (from bag "${bagName}")`);
                }
                if (!silent) console.warn(`[ecbyts:${tag}] collision on ${key} (bag "${bagName}") — overwriting`);
            }
            target[key] = value;
            bagFnCount++;
            report.totalFunctions++;
        }
        report.perBag[bagName] = bagFnCount;
    }

    return report;
}

/**
 * Register a single inline bag of handlers (shortcut for ad-hoc groups).
 *
 * Same semantics as `registerHandlerBags` but takes the handler object
 * directly and a name for the bag label.
 *
 * @param {string} bagName
 * @param {object} handlers
 * @param {RegisterOptions} [opts]
 * @returns {RegisterReport}
 */
export function registerInlineBag(
    bagName: string,
    handlers: object,
    opts: RegisterOptions = {} as RegisterOptions,
): RegisterReport {
    return registerHandlerBags({ [bagName]: handlers }, opts);
}