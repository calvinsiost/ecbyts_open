// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Performance Observability Report — pure logic for WS-9 of
 * SPEC_CODEBASE_WIDE_PERFORMANCE_REFACTOR.
 *
 * Aggregates `PerformanceEntry`-shaped measures by phase/category and
 * produces a deterministic report (JSON + Markdown) for local
 * debugging + CI gate consumption.
 *
 * Pure: caller passes a list of measure entries; module returns a
 * frozen report VM. Caller persists to `.runtime/performance/latest.json`
 * or generates a Markdown summary.
 *
 * Anti-N (no PII): the module REFUSES entries whose name contains
 * known sensitive prefixes (`email:`, `user:`, `uid:`) — defensive guard.
 *
 * Tests live in `tests/observability-report-pure.test.mjs`.
 */

export interface MeasureEntry {
    readonly name: string;
    readonly durationMs: number;
    /** Optional category — defaults to first dot-segment of `name`. */
    readonly category?: string;
    readonly timestamp?: string;
}

export interface CategoryStats {
    readonly category: string;
    readonly count: number;
    readonly totalMs: number;
    readonly meanMs: number;
    readonly maxMs: number;
    readonly p95Ms: number;
}

export interface ObservabilityReport {
    readonly generatedAt: string;
    readonly totalMeasures: number;
    readonly totalDurationMs: number;
    readonly categories: ReadonlyArray<CategoryStats>;
    readonly slowest: ReadonlyArray<MeasureEntry>;
    readonly rejectedPii: number;
}

const PII_PREFIXES = Object.freeze(['email:', 'user:', 'uid:', 'phone:', 'cpf:']);
const SLOWEST_TOP = 10;

function isFiniteNonNeg(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function hasPii(name: string): boolean {
    const lower = name.toLowerCase();
    for (const p of PII_PREFIXES) {
        if (lower.includes(p)) return true;
    }
    return false;
}

function deriveCategory(name: string, explicit?: string): string {
    if (typeof explicit === 'string' && explicit.length > 0) return explicit;
    const idx = name.indexOf('.');
    return idx > 0 ? name.slice(0, idx) : 'uncategorized';
}

function percentile(sorted: ReadonlyArray<number>, p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx] as number;
}

/**
 * Aggregate measure entries into a frozen observability report.
 * Pure: returns a new frozen VM; never mutates inputs.
 *
 * @param entries  raw measure list (caller filtered by feature flag already)
 * @param nowIso   ISO-8601 stamp for `generatedAt` (deterministic testing)
 */
export function buildObservabilityReport(
    entries: ReadonlyArray<MeasureEntry> | null | undefined,
    nowIso: string,
): ObservabilityReport {
    const ts =
        typeof nowIso === 'string' && Number.isFinite(Date.parse(nowIso)) ? nowIso : '1970-01-01T00:00:00Z';
    if (!Array.isArray(entries) || entries.length === 0) {
        return Object.freeze({
            generatedAt: ts,
            totalMeasures: 0,
            totalDurationMs: 0,
            categories: Object.freeze([]),
            slowest: Object.freeze([]),
            rejectedPii: 0,
        });
    }

    // Filter invalid + PII
    const clean: MeasureEntry[] = [];
    let rejectedPii = 0;
    for (const e of entries) {
        if (!e || typeof e !== 'object') continue;
        if (typeof e.name !== 'string' || e.name.length === 0) continue;
        if (!isFiniteNonNeg(e.durationMs)) continue;
        if (hasPii(e.name)) {
            rejectedPii++;
            continue;
        }
        clean.push(
            Object.freeze({
                name: e.name,
                durationMs: e.durationMs,
                category: deriveCategory(e.name, e.category),
                timestamp: typeof e.timestamp === 'string' ? e.timestamp : undefined,
            }),
        );
    }

    // Group by category
    const byCat = new Map<string, MeasureEntry[]>();
    for (const e of clean) {
        const cat = e.category as string;
        const arr = byCat.get(cat) ?? [];
        arr.push(e);
        byCat.set(cat, arr);
    }
    const categoryStats: CategoryStats[] = [];
    for (const [cat, list] of byCat) {
        const durations = list.map((e) => e.durationMs).sort((a, b) => a - b);
        const total = durations.reduce((a, b) => a + b, 0);
        categoryStats.push(
            Object.freeze({
                category: cat,
                count: list.length,
                totalMs: total,
                meanMs: total / list.length,
                maxMs: durations[durations.length - 1] as number,
                p95Ms: percentile(durations, 95),
            }),
        );
    }
    categoryStats.sort((a, b) => b.totalMs - a.totalMs);

    // Top N slowest individual measures
    const slowest = [...clean].sort((a, b) => b.durationMs - a.durationMs).slice(0, SLOWEST_TOP);

    const totalDurationMs = clean.reduce((acc, e) => acc + e.durationMs, 0);
    return Object.freeze({
        generatedAt: ts,
        totalMeasures: clean.length,
        totalDurationMs,
        categories: Object.freeze(categoryStats),
        slowest: Object.freeze(slowest),
        rejectedPii,
    });
}

/**
 * Build a Markdown report from the JSON VM. Pure: returns a string ready
 * to write to `docs/reports/PERF_TRACE_SUMMARY_YYYY_MM_DD.md`.
 */
export function reportToMarkdown(report: ObservabilityReport | null | undefined): string {
    if (!report) return '';
    const lines: string[] = [];
    lines.push(`# Performance Trace Summary — ${report.generatedAt}`);
    lines.push('');
    lines.push(`**Total measures:** ${report.totalMeasures}`);
    lines.push(`**Total duration:** ${report.totalDurationMs.toFixed(2)} ms`);
    lines.push(`**Rejected (PII):** ${report.rejectedPii}`);
    lines.push('');
    lines.push('## Categories');
    lines.push('');
    lines.push('| Category | Count | Total (ms) | Mean (ms) | P95 (ms) | Max (ms) |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    for (const c of report.categories) {
        lines.push(
            `| ${c.category} | ${c.count} | ${c.totalMs.toFixed(2)} | ${c.meanMs.toFixed(2)} | ${c.p95Ms.toFixed(
                2,
            )} | ${c.maxMs.toFixed(2)} |`,
        );
    }
    lines.push('');
    lines.push('## Slowest measures');
    lines.push('');
    lines.push('| Name | Duration (ms) | Category |');
    lines.push('|---|---:|---|');
    for (const m of report.slowest) {
        lines.push(`| ${m.name} | ${m.durationMs.toFixed(2)} | ${m.category ?? '—'} |`);
    }
    return lines.join('\n') + '\n';
}
