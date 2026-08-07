// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Windowing - Phase 53 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S53
 *
 * Phase 53 (2026-05-02) - pure-logic windowing operations: tumbling,
 * sliding, session windows. Trabalha sobre eventos com timestamp.
 *
 * NÃO depende de browser. Sem setTimeout/Date.now interno.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const WINDOWING_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 53,
    deliveredAt: '2026-05-02',
});

/** Window types canônicos. */
export const WINDOW_TYPES = Object.freeze(['tumbling', 'sliding', 'session']);

interface PipelineWindowEvent {
    at: number;
    [k: string]: unknown;
}

interface PipelineWindowBucket {
    from: number;
    to: number;
    events: ReadonlyArray<unknown>;
}

/**
 * @typedef {object} PipelineWindowEvent
 * @property {number} at
 */

/**
 * @typedef {object} PipelineWindowBucket
 * @property {number} from
 * @property {number} to
 * @property {ReadonlyArray<unknown>} events
 */

/**
 * @typedef {object} PipelineWindowOptions
 * @property {number} [windowMs]
 * @property {number} [slideMs]
 * @property {number} [gapMs]
 */

/**
 * @typedef {object} PipelineSummarizeWindow
 * @property {ReadonlyArray<unknown>} [events]
 */

/**
 * @typedef {object} PipelineSummaryResult
 * @property {number} count
 * @property {number} totalEvents
 * @property {number} avgPerWindow
 * @property {number} smallest
 * @property {number} largest
 */

/**
 * Tumbling window: buckets disjuntos de tamanho fixo.
 */
/**
 * @param {Array<PipelineWindowEvent>} events
 * @param {number} windowMs
 * @returns {ReadonlyArray<Readonly<PipelineWindowBucket>>}
 */
export function tumbling(
    events: Array<PipelineWindowEvent>,
    windowMs: number,
): ReadonlyArray<Readonly<PipelineWindowBucket>> {
    if (!Array.isArray(events) || !Number.isFinite(windowMs) || windowMs <= 0) {
        return Object.freeze([]);
    }
    const valid = events.filter((e) => e && Number.isFinite(e.at)).slice().sort((a, b) => a.at - b.at);
    if (valid.length === 0) return Object.freeze([]);
    /** @type {Array<Readonly<PipelineWindowBucket>>} */
    const out: Array<Readonly<PipelineWindowBucket>> = [];
    let start = Math.floor(valid[0]!.at / windowMs) * windowMs;
    /** @type {PipelineWindowEvent[]} */
    let bucket: PipelineWindowEvent[] = [];
    for (const e of valid) {
        if (e.at >= start + windowMs) {
            if (bucket.length > 0) {
                out.push(Object.freeze({ from: start, to: start + windowMs, events: Object.freeze(bucket) }));
            }
            start = Math.floor(e.at / windowMs) * windowMs;
            bucket = [];
        }
        bucket.push(e);
    }
    if (bucket.length > 0) {
        out.push(Object.freeze({ from: start, to: start + windowMs, events: Object.freeze(bucket) }));
    }
    return Object.freeze(out);
}

/**
 * Sliding window: tamanho W, slide S. Eventos podem aparecer em N janelas.
 */
/**
 * @param {Array<PipelineWindowEvent>} events
 * @param {number} windowMs
 * @param {number} slideMs
 * @returns {ReadonlyArray<Readonly<PipelineWindowBucket>>}
 */
export function sliding(
    events: Array<PipelineWindowEvent>,
    windowMs: number,
    slideMs: number,
): ReadonlyArray<Readonly<PipelineWindowBucket>> {
    if (!Array.isArray(events) || !Number.isFinite(windowMs) || windowMs <= 0) return Object.freeze([]);
    if (!Number.isFinite(slideMs) || slideMs <= 0) return Object.freeze([]);
    const valid = events.filter((e) => e && Number.isFinite(e.at)).slice().sort((a, b) => a.at - b.at);
    if (valid.length === 0) return Object.freeze([]);
    const lo = valid[0]!.at;
    const hi = valid[valid.length - 1]!.at;
    /** @type {Array<Readonly<PipelineWindowBucket>>} */
    const out: Array<Readonly<PipelineWindowBucket>> = [];
    for (let s = Math.floor(lo / slideMs) * slideMs; s <= hi; s += slideMs) {
        const end = s + windowMs;
        const bucket = valid.filter((e) => e.at >= s && e.at < end);
        if (bucket.length > 0) {
            out.push(Object.freeze({ from: s, to: end, events: Object.freeze(bucket) }));
        }
    }
    return Object.freeze(out);
}

/**
 * Session window: agrupa por inatividade > gapMs.
 */
/**
 * @param {Array<PipelineWindowEvent>} events
 * @param {number} gapMs
 * @returns {ReadonlyArray<Readonly<PipelineWindowBucket>>}
 */
export function session(
    events: Array<PipelineWindowEvent>,
    gapMs: number,
): ReadonlyArray<Readonly<PipelineWindowBucket>> {
    if (!Array.isArray(events) || !Number.isFinite(gapMs) || gapMs < 0) return Object.freeze([]);
    const valid = events.filter((e) => e && Number.isFinite(e.at)).slice().sort((a, b) => a.at - b.at);
    if (valid.length === 0) return Object.freeze([]);
    /** @type {Array<Readonly<PipelineWindowBucket>>} */
    const out: Array<Readonly<PipelineWindowBucket>> = [];
    let bucket = [valid[0]!];
    let from = valid[0]!.at;
    let lastAt = valid[0]!.at;
    for (let i = 1; i < valid.length; i++) {
        const e = valid[i]!;
        if (e.at - lastAt > gapMs) {
            out.push(Object.freeze({ from, to: lastAt, events: Object.freeze(bucket) }));
            bucket = [];
            from = e.at;
        }
        bucket.push(e);
        lastAt = e.at;
    }
    if (bucket.length > 0) {
        out.push(Object.freeze({ from, to: lastAt, events: Object.freeze(bucket) }));
    }
    return Object.freeze(out);
}

interface PipelineWindowEventOptions {
    windowMs?: number;
    slideMs?: number;
    gapMs?: number;
}

/**
 * Despacho por type.
 */
/**
 * @param {Array<PipelineWindowEvent>} events
 * @param {string} type
 * @param {PipelineWindowOptions} [options]
 * @returns {ReadonlyArray<Readonly<PipelineWindowBucket>>}
 */
export function windowEvents(
    events: Array<PipelineWindowEvent>,
    type: string,
    options: PipelineWindowEventOptions = {},
): ReadonlyArray<Readonly<PipelineWindowBucket>> {
    if (!WINDOW_TYPES.includes(type)) return Object.freeze([]);
    switch (type) {
        case 'tumbling': return tumbling(events, Number(options.windowMs));
        case 'sliding': return sliding(events, Number(options.windowMs), Number(options.slideMs));
        case 'session': return session(events, Number(options.gapMs));
        default: return Object.freeze([]);
    }
}

interface PipelineWindowSummaryInput {
    events?: ReadonlyArray<unknown>;
}

interface PipelineWindowSummaryResult {
    count: number;
    totalEvents: number;
    avgPerWindow: number;
    smallest: number;
    largest: number;
}

/**
 * Sumariza windows.
 */
/**
 * @param {ReadonlyArray<PipelineSummarizeWindow>} windows
 * @returns {PipelineSummaryResult}
 */
export function summarizeWindows(windows: ReadonlyArray<PipelineWindowSummaryInput>): PipelineWindowSummaryResult {
    /** @type {PipelineSummaryResult} */
    const empty: PipelineWindowSummaryResult = {
        count: 0,
        totalEvents: 0,
        avgPerWindow: 0,
        smallest: 0,
        largest: 0,
    };
    if (!Array.isArray(windows) || windows.length === 0) return empty;
    const sizes = windows.map((w) => (w.events ? w.events.length : 0));
    const total = sizes.reduce((a, b) => a + b, 0);
    return Object.freeze({
        count: windows.length,
        totalEvents: total,
        avgPerWindow: total / windows.length,
        smallest: Math.min(...sizes),
        largest: Math.max(...sizes),
    });
}

/**
 * Module identity export.
 */
export const pipelineWindowingMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 53,
    deliveredAt: '2026-05-02',
    exports: [
        'WINDOW_TYPES',
        'WINDOWING_META',
        'tumbling',
        'sliding',
        'session',
        'windowEvents',
        'summarizeWindows',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
