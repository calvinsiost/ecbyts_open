// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Constellation Graph History - Phase 1.55 (P3)
 * Pure undo/redo mutation history over arbitrary graph snapshots.
 * No browser, DOM, Three.js, or Supabase dependencies.
 */

export interface GraphHistoryConfig {
    readonly limit?: unknown;
}

export interface GraphHistory<T = unknown> {
    readonly present: T | null;
    readonly past: readonly T[];
    readonly future: readonly T[];
    readonly limit: number;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
}

export interface GraphHistorySummary {
    readonly pastCount: number;
    readonly futureCount: number;
    readonly limit: number;
    readonly canUndo: boolean;
    readonly canRedo: boolean;
}

export const GRAPH_HISTORY_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.55',
    deliveredAt: '2026-05-02',
} as const);

export const DEFAULT_CONFIG = Object.freeze({
    limit: 50,
} as const);

/** Creates an empty frozen history state. */
export function createHistory<T = unknown>(config: GraphHistoryConfig = {}): GraphHistory<T> {
    const configuredLimit = config.limit;
    const limit = typeof configuredLimit === 'number' && Number.isInteger(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : DEFAULT_CONFIG.limit;

    return Object.freeze({
        present: null,
        past: Object.freeze([]) as readonly T[],
        future: Object.freeze([]) as readonly T[],
        limit,
        canUndo: false,
        canRedo: false,
    });
}

/** Records a mutation and invalidates the redo branch. */
export function recordMutation<T>(
    history: GraphHistory<T> | null | undefined,
    mutation: T,
): GraphHistory<T> | null | undefined {
    if (!history) return history;

    const past = history.present === null
        ? [...history.past]
        : [...history.past, history.present];

    while (past.length > history.limit) past.shift();

    return Object.freeze({
        ...history,
        present: mutation,
        past: Object.freeze(past),
        future: Object.freeze([]) as readonly T[],
        canUndo: past.length > 0,
        canRedo: false,
    });
}

/** Restores the latest past state and pushes the current state into future. */
export function undo<T>(history: GraphHistory<T> | null | undefined): GraphHistory<T> | null | undefined {
    if (!history || history.past.length === 0) return history;

    const prev = history.past[history.past.length - 1] as T;
    const newPast = history.past.slice(0, -1);
    const future = history.present === null
        ? [...history.future]
        : [history.present, ...history.future];

    return Object.freeze({
        ...history,
        present: prev,
        past: Object.freeze(newPast),
        future: Object.freeze(future),
        canUndo: newPast.length > 0,
        canRedo: true,
    });
}

/** Restores the next future state and pushes the current state into past. */
export function redo<T>(history: GraphHistory<T> | null | undefined): GraphHistory<T> | null | undefined {
    if (!history || history.future.length === 0) return history;

    const next = history.future[0] as T;
    const newFuture = history.future.slice(1);
    const past = history.present === null
        ? [...history.past]
        : [...history.past, history.present];

    while (past.length > history.limit) past.shift();

    return Object.freeze({
        ...history,
        present: next,
        past: Object.freeze(past),
        future: Object.freeze(newFuture),
        canUndo: past.length > 0,
        canRedo: newFuture.length > 0,
    });
}

/** Clears present, past, and future while preserving the configured limit. */
export function clearHistory<T>(history: GraphHistory<T> | null | undefined): GraphHistory<T> | null | undefined {
    if (!history) return history;

    return Object.freeze({
        present: null,
        past: Object.freeze([]) as readonly T[],
        future: Object.freeze([]) as readonly T[],
        limit: history.limit,
        canUndo: false,
        canRedo: false,
    });
}

export function canUndo(history: Pick<GraphHistory<unknown>, 'past'> | null | undefined): boolean {
    return !!(history && history.past.length > 0);
}

export function canRedo(history: Pick<GraphHistory<unknown>, 'future'> | null | undefined): boolean {
    return !!(history && history.future.length > 0);
}

/** Returns frozen summary counters for the current history state. */
export function summarize(history: GraphHistory<unknown> | null | undefined): GraphHistorySummary {
    if (!history) {
        return Object.freeze({
            pastCount: 0,
            futureCount: 0,
            limit: DEFAULT_CONFIG.limit,
            canUndo: false,
            canRedo: false,
        });
    }

    return Object.freeze({
        pastCount: history.past.length,
        futureCount: history.future.length,
        limit: history.limit,
        canUndo: history.past.length > 0,
        canRedo: history.future.length > 0,
    });
}

export const graphHistoryMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.55',
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'GRAPH_HISTORY_META',
        'createHistory',
        'recordMutation',
        'undo',
        'redo',
        'clearHistory',
        'canUndo',
        'canRedo',
        'summarize',
    ],
    provenance: Object.freeze({ generatedBy: 'AI', disclaimerAcknowledged: true }),
} as const);
