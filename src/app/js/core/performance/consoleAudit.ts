// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CONSOLE AUDIT - Runtime classification of console output
   ================================================================
   PERF-MASTER-001 S3 (sub-spec of memory leak elimination + boot perf)

   Pure-logic classification of console events captured during boot or
   click-harness runs. Identifies real errors/warnings, debug noise,
   module lifecycle logs, and hot-path floods.

   This layer classifies events without changing consumer code. It enables
   CI gates such as "boot must not produce >50 messages" or "click-harness
   must not produce >5 unique errors".

   Roadmap: Section 0.2 P1-2 PERF-MASTER S3 sub-track (console hygiene)
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/performance/consoleAudit.js');

export type ConsoleLevel = 'log' | 'info' | 'debug' | 'warn' | 'error';
export type ConsoleCategory = 'real_error' | 'real_warn' | 'debug_noise' | 'mod_load' | 'flood' | 'unknown';

export interface ConsoleEvent {
    readonly level?: string;
    readonly message?: unknown;
    readonly timestamp?: unknown;
    readonly origin?: string;
    readonly argCount?: number;
}

export interface ClassifyEventOptions {
    readonly recentCounts?: ReadonlyMap<string, number> | null;
}

export interface ConsoleClassification {
    category: ConsoleCategory;
    reason: string;
}

export interface MessageWindow {
    record: (msg: unknown, now: unknown) => number;
    snapshot: () => Map<string, number>;
    reset: () => void;
}

export interface SummarizeEventsOptions {
    readonly windowMs?: number;
}

export interface ConsoleFlood {
    message: unknown;
    level: unknown;
    reason: string;
}

export interface ConsoleSummary {
    total: number;
    byCategory: Record<string, number>;
    byLevel: Record<string, number>;
    floods: ConsoleFlood[];
    durationMs: number;
}

export interface ConsoleHealthBudgets {
    readonly maxTotal?: number;
    readonly maxRealErrors?: number;
    readonly maxRealWarns?: number;
    readonly maxFloods?: number;
}

export type ConsoleHealthSeverity = 'ok' | 'warn' | 'fail';

export interface ConsoleHealthViolation {
    metric: 'real_errors' | 'floods' | 'real_warns' | 'total';
    actual: number;
    budget: number;
    severity: Exclude<ConsoleHealthSeverity, 'ok'>;
}

export interface ConsoleHealth {
    severity: ConsoleHealthSeverity;
    violations: ConsoleHealthViolation[];
}

interface WindowEvent {
    msg: string;
    ts: number;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function messageToString(value: unknown): string {
    if (value === null || value === undefined || value === false || value === 0 || value === '') return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
    if (value instanceof Error) return value.message;
    return '';
}

function levelFromUnknown(value: unknown): string {
    return typeof value === 'string' && value ? value : 'log';
}

function finiteNumberOrDefault(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function countFromRecord(record: unknown, key: string): number {
    if (!isObjectRecord(record)) return 0;
    return finiteNumberOrDefault(record[key], 0);
}

function isModuleLifecycleMarker(msg: string): boolean {
    return msg.startsWith('[mod:load]') || msg.startsWith('[mod:end]');
}

function detectFlood(
    recentCounts: ReadonlyMap<string, number> | null | undefined,
    msg: string,
): ConsoleClassification | null {
    if (!recentCounts || recentCounts.size === 0) return null;
    const count = recentCounts.get(msg) || 0;
    if (count <= 5) return null;
    return { category: 'flood', reason: `repeated_${count}x` };
}

function isTaggedDebugLog(msg: string): boolean {
    return /^\[ecbyts:(boot|init|debug|mod)/.test(msg);
}

function classifyError(msg: string): ConsoleClassification {
    if (msg.length < 5) return { category: 'unknown', reason: 'error_too_short' };
    return { category: 'real_error', reason: 'level_error' };
}

function classifyWarn(msg: string): ConsoleClassification {
    if (msg.toLowerCase().includes('debug') && msg.length < 100) {
        return { category: 'debug_noise', reason: 'warn_with_debug_keyword' };
    }
    return { category: 'real_warn', reason: 'level_warn' };
}

function classifyByLevel(level: string, msg: string): ConsoleClassification | null {
    if (level === 'error') return classifyError(msg);
    if (level === 'warn') return classifyWarn(msg);
    if ((level === 'debug' || level === 'log') && isTaggedDebugLog(msg)) {
        return { category: 'debug_noise', reason: 'tagged_debug_log' };
    }
    return null;
}

/**
 * Classifies a console event by message pattern.
 * Pure function with no side effects.
 */
export function classifyEvent(event: unknown, opts: ClassifyEventOptions = {}): ConsoleClassification {
    if (!isObjectRecord(event)) {
        return { category: 'unknown', reason: 'invalid_event' };
    }
    const msg = messageToString(event.message);
    const level = levelFromUnknown(event.level);

    // 1. mod:load / mod:end - debug-only boot tracking markers.
    if (isModuleLifecycleMarker(msg)) {
        return { category: 'mod_load', reason: 'module_lifecycle_marker' };
    }

    // 2. Flood detection - same message more than 5x in the recent window.
    const flood = detectFlood(opts.recentCounts, msg);
    if (flood) return flood;

    // 3-5. Classify by level and message pattern.
    const byLevel = classifyByLevel(level, msg);
    if (byLevel) return byLevel;

    return { category: 'unknown', reason: 'unmatched_pattern' };
}

/**
 * Sliding count window for flood detection.
 */
export function createMessageWindow(windowMs = 1000): MessageWindow {
    const w = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 1000;
    const events: WindowEvent[] = [];

    function prune(now: number): void {
        const cutoff = now - w;
        while (events.length > 0 && (events[0]?.ts ?? Infinity) < cutoff) {
            events.shift();
        }
    }

    return {
        record(msg: unknown, now: unknown): number {
            const t = finiteNumberOrDefault(now, 0);
            const message = messageToString(msg);
            prune(t);
            events.push({ msg: message, ts: t });
            let count = 0;
            for (const event of events) {
                if (event.msg === message) count++;
            }
            return count;
        },
        snapshot(): Map<string, number> {
            const map = new Map<string, number>();
            for (const event of events) {
                map.set(event.msg, (map.get(event.msg) || 0) + 1);
            }
            return map;
        },
        reset(): void {
            events.length = 0;
        },
    };
}

/**
 * Builds an aggregate report from captured console events.
 * Pure function apart from local window state.
 */
export function summarizeEvents(events: unknown, opts: SummarizeEventsOptions = {}): ConsoleSummary {
    if (!Array.isArray(events) || events.length === 0) {
        return {
            total: 0,
            byCategory: {},
            byLevel: {},
            floods: [],
            durationMs: 0,
        };
    }

    const window = createMessageWindow(opts.windowMs || 1000);
    const byCategory: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    const floods: ConsoleFlood[] = [];

    let firstTs = Infinity;
    let lastTs = -Infinity;

    for (const ev of events) {
        if (!isObjectRecord(ev)) continue;
        const ts = finiteNumberOrDefault(ev.timestamp, 0);
        if (ts < firstTs) firstTs = ts;
        if (ts > lastTs) lastTs = ts;

        const recentCounts = window.snapshot();
        window.record(ev.message || '', ts);

        const classification = classifyEvent(ev, { recentCounts });
        byCategory[classification.category] = (byCategory[classification.category] || 0) + 1;
        const level = levelFromUnknown(ev.level);
        byLevel[level] = (byLevel[level] || 0) + 1;

        if (classification.category === 'flood') {
            floods.push({ message: ev.message, level: ev.level, reason: classification.reason });
        }
    }

    const durationMs = firstTs === Infinity ? 0 : Math.max(0, lastTs - firstTs);

    return {
        total: events.length,
        byCategory,
        byLevel,
        floods,
        durationMs: Math.round(durationMs),
    };
}

/**
 * Evaluates a summary against console hygiene budgets.
 */
export function evaluateConsoleHealth(summary: unknown, budgets: ConsoleHealthBudgets = {}): ConsoleHealth {
    const b = {
        maxTotal: 200,
        maxRealErrors: 0,
        maxRealWarns: 20,
        maxFloods: 0,
        ...budgets,
    };

    const summaryRecord = isObjectRecord(summary) ? summary : {};
    const byCategory = summaryRecord.byCategory;
    const violations: ConsoleHealthViolation[] = [];
    const realErrors = countFromRecord(byCategory, 'real_error');
    const realWarns = countFromRecord(byCategory, 'real_warn');
    const floodCount = Array.isArray(summaryRecord.floods) ? summaryRecord.floods.length : 0;
    const total = finiteNumberOrDefault(summaryRecord.total, 0);

    if (realErrors > b.maxRealErrors) {
        violations.push({ metric: 'real_errors', actual: realErrors, budget: b.maxRealErrors, severity: 'fail' });
    }
    if (floodCount > b.maxFloods) {
        violations.push({ metric: 'floods', actual: floodCount, budget: b.maxFloods, severity: 'fail' });
    }
    if (realWarns > b.maxRealWarns) {
        violations.push({ metric: 'real_warns', actual: realWarns, budget: b.maxRealWarns, severity: 'warn' });
    }
    if (total > b.maxTotal) {
        violations.push({ metric: 'total', actual: total, budget: b.maxTotal, severity: 'warn' });
    }

    let severity: ConsoleHealthSeverity = 'ok';
    for (const violation of violations) {
        if (violation.severity === 'fail') {
            severity = 'fail';
            break;
        }
        if (violation.severity === 'warn') severity = 'warn';
    }

    return { severity, violations };
}

console.debug('[mod:end]', 'app/js/core/performance/consoleAudit.js');
