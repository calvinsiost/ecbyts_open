// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEAP DELTA - Memory leak detection via performance.memory snapshots
   ================================================================
   PERF-MASTER-001 S3.5 (Memory Leak Elimination - runtime instrumentation)

   Detects memory leaks by comparing heap usage before/after N journeys
   such as clicks and modal cycles. This replaces the spec-level
   "0 growth after 1hr" statement with an actionable metric: heap delta
   per journey.

   Pure logic - receives `performance` by DI, so it is testable in Node
   and degrades gracefully when Chromium-only `performance.memory` is absent.

   Roadmap: Section 0.2 P1-2 PERF-MASTER S3.5
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/performance/heapDelta.js');

export interface HeapSnapshot {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
    ts: number;
}

export interface HeapDelta {
    usedDelta: number;
    totalDelta: number;
    durationMs: number;
}

export interface HeapBudgets {
    okPerJourney: number;
    warnPerJourney: number;
    failPerJourney: number;
    okGrowthRateMBPerMin: number;
    warnGrowthRateMBPerMin: number;
}

export type HeapSeverity = 'ok' | 'warn' | 'fail';

export interface HeapViolation {
    idx: number;
    usedDelta: number;
    severity: Exclude<HeapSeverity, 'ok'>;
}

export interface HeapHealth {
    severity: HeapSeverity;
    growthRate: number;
    totalGrowth: number;
    avgPerJourney: number;
    violations: HeapViolation[];
}

export interface EvaluateHeapHealthOptions {
    budgets?: Partial<HeapBudgets> | null;
}

export interface HeapLeakHotspot {
    snapshotIdx: number;
    growthBytes: number;
}

export interface HeapBudgetSummary {
    totalGrowth: number;
    avgPerJourney: number;
    severity: HeapSeverity;
    journeyCount: number;
}

/**
 * Severity bands for heap delta health.
 */
export const HEAP_SEVERITY = Object.freeze({
    OK: 'ok',
    WARN: 'warn',
    FAIL: 'fail',
} as const);

/**
 * Canonical runtime heap delta budgets.
 */
export const HEAP_BUDGETS = Object.freeze({
    okPerJourney: 1024 * 1024,
    warnPerJourney: 5 * 1024 * 1024,
    failPerJourney: 10 * 1024 * 1024,
    okGrowthRateMBPerMin: 1,
    warnGrowthRateMBPerMin: 5,
}) satisfies Readonly<HeapBudgets>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function finiteNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function normalizeBudgets(budget?: Partial<HeapBudgets> | null): HeapBudgets {
    return {
        ...HEAP_BUDGETS,
        ...(isObjectRecord(budget) ? budget : {}),
    };
}

function snapshotFromUnknown(value: unknown): HeapSnapshot | null {
    if (!isObjectRecord(value)) return null;
    const used = finiteNumber(value.usedJSHeapSize);
    const total = finiteNumber(value.totalJSHeapSize);
    const limit = finiteNumber(value.jsHeapSizeLimit);
    const ts = finiteNumber(value.ts);
    if (used === null || total === null || limit === null || ts === null) return null;
    return {
        usedJSHeapSize: used,
        totalJSHeapSize: total,
        jsHeapSizeLimit: limit,
        ts,
    };
}

function deltaFromUnknown(value: unknown): HeapDelta | null {
    if (!isObjectRecord(value)) return null;
    const usedDelta = finiteNumber(value.usedDelta);
    const durationMs = finiteNumber(value.durationMs);
    if (usedDelta === null || durationMs === null) return null;
    const totalDelta = finiteNumber(value.totalDelta) ?? 0;
    return { usedDelta, totalDelta, durationMs };
}

/**
 * Captures a heap snapshot. Returns null in browsers without performance.memory.
 */
export function captureHeapSnapshot(perfApi?: unknown): HeapSnapshot | null {
    const api = perfApi || (typeof globalThis.performance !== 'undefined' ? globalThis.performance : null);
    if (!isObjectRecord(api) || !isObjectRecord(api.memory)) return null;

    const used = finiteNumber(api.memory.usedJSHeapSize);
    const total = finiteNumber(api.memory.totalJSHeapSize);
    const limit = finiteNumber(api.memory.jsHeapSizeLimit);

    if (used === null || total === null || limit === null) {
        return null;
    }

    return {
        usedJSHeapSize: used,
        totalJSHeapSize: total,
        jsHeapSizeLimit: limit,
        ts: Date.now(),
    };
}

/**
 * Computes the delta between two snapshots. Inverted order returns negatives.
 */
export function computeHeapDelta(snapshotA: unknown, snapshotB: unknown): HeapDelta | null {
    const a = snapshotFromUnknown(snapshotA);
    const b = snapshotFromUnknown(snapshotB);
    if (!a || !b) return null;

    return {
        usedDelta: b.usedJSHeapSize - a.usedJSHeapSize,
        totalDelta: b.totalJSHeapSize - a.totalJSHeapSize,
        durationMs: b.ts - a.ts,
    };
}

/**
 * Evaluates a delta series and returns a health summary.
 */
export function evaluateHeapHealth(deltaSeries: unknown, opts: EvaluateHeapHealthOptions = {}): HeapHealth {
    const budgets = normalizeBudgets(opts.budgets);

    if (!Array.isArray(deltaSeries) || deltaSeries.length === 0) {
        return {
            severity: HEAP_SEVERITY.OK,
            growthRate: 0,
            totalGrowth: 0,
            avgPerJourney: 0,
            violations: [],
        };
    }

    let totalGrowth = 0;
    let totalDuration = 0;
    const violations: HeapViolation[] = [];

    for (let i = 0; i < deltaSeries.length; i++) {
        const delta = deltaFromUnknown(deltaSeries[i]);
        if (!delta) continue;

        totalGrowth += delta.usedDelta;
        if (delta.durationMs > 0) totalDuration += delta.durationMs;

        if (delta.usedDelta > budgets.failPerJourney) {
            violations.push({ idx: i, usedDelta: delta.usedDelta, severity: 'fail' });
        } else if (delta.usedDelta > budgets.warnPerJourney) {
            violations.push({ idx: i, usedDelta: delta.usedDelta, severity: 'warn' });
        }
    }

    const journeyCount = deltaSeries.length;
    const avgPerJourney = journeyCount > 0 ? totalGrowth / journeyCount : 0;
    const minutes = totalDuration > 0 ? totalDuration / 60000 : 0;
    const growthRate = minutes > 0 ? totalGrowth / 1024 / 1024 / minutes : 0;

    let severity: HeapSeverity = HEAP_SEVERITY.OK;
    const hasFail = violations.some((violation) => violation.severity === 'fail');
    const hasWarn = violations.some((violation) => violation.severity === 'warn');

    if (hasFail) {
        severity = HEAP_SEVERITY.FAIL;
    } else if (growthRate > budgets.warnGrowthRateMBPerMin) {
        severity = HEAP_SEVERITY.FAIL;
    } else if (hasWarn) {
        severity = HEAP_SEVERITY.WARN;
    } else if (growthRate > budgets.okGrowthRateMBPerMin) {
        severity = HEAP_SEVERITY.WARN;
    }

    return {
        severity,
        growthRate: Math.round(growthRate * 1000) / 1000,
        totalGrowth,
        avgPerJourney: Math.round(avgPerJourney),
        violations,
    };
}

/**
 * Finds the top N journey intervals with the largest positive heap growth.
 */
export function findHeapLeakHotspots(snapshots: unknown, topN = 5): HeapLeakHotspot[] {
    if (!Array.isArray(snapshots) || snapshots.length < 2) return [];
    const n = Number.isFinite(topN) && topN > 0 ? Math.floor(topN) : 5;

    const hotspots: HeapLeakHotspot[] = [];
    for (let i = 1; i < snapshots.length; i++) {
        const prev = snapshotFromUnknown(snapshots[i - 1]);
        const cur = snapshotFromUnknown(snapshots[i]);
        if (!prev || !cur) continue;

        const growth = cur.usedJSHeapSize - prev.usedJSHeapSize;
        if (growth > 0) {
            hotspots.push({ snapshotIdx: i, growthBytes: growth });
        }
    }

    return hotspots.sort((a, b) => b.growthBytes - a.growthBytes).slice(0, n);
}

/**
 * Summarizes heap budget from chronological snapshots.
 */
export function summarizeHeapBudget(snapshots: unknown, budget?: Partial<HeapBudgets> | null): HeapBudgetSummary {
    const b = normalizeBudgets(budget);

    if (!Array.isArray(snapshots) || snapshots.length < 2) {
        return { totalGrowth: 0, avgPerJourney: 0, severity: HEAP_SEVERITY.OK, journeyCount: 0 };
    }

    const first = snapshotFromUnknown(snapshots[0]);
    const last = snapshotFromUnknown(snapshots[snapshots.length - 1]);
    if (!first || !last) {
        return { totalGrowth: 0, avgPerJourney: 0, severity: HEAP_SEVERITY.OK, journeyCount: 0 };
    }

    const totalGrowth = last.usedJSHeapSize - first.usedJSHeapSize;
    const journeyCount = snapshots.length - 1;
    const avgPerJourney = journeyCount > 0 ? totalGrowth / journeyCount : 0;

    let severity: HeapSeverity = HEAP_SEVERITY.OK;
    if (avgPerJourney > b.failPerJourney) {
        severity = HEAP_SEVERITY.FAIL;
    } else if (avgPerJourney > b.warnPerJourney) {
        severity = HEAP_SEVERITY.WARN;
    } else if (avgPerJourney > b.okPerJourney) {
        severity = HEAP_SEVERITY.WARN;
    }

    return {
        totalGrowth,
        avgPerJourney: Math.round(avgPerJourney),
        severity,
        journeyCount,
    };
}

console.debug('[mod:end]', 'app/js/core/performance/heapDelta.js');
