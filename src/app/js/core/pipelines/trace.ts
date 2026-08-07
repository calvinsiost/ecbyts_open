// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// ECBT Pipeline Trace - distributed tracing pure-logic (Phase 42)
// Pure functions for span/trace assembly. No side effects, no clock dependency
// (caller injects timestamps). Inspired by OpenTelemetry trace model, but
// reduced to the minimum surface needed by pipeline executor instrumentation.

export interface TraceSpan {
    spanId: string;
    parentId: string | null;
    name: string;
    startTs: number;
    endTs: number;
    status?: string;
    attrs?: Record<string, unknown>;
}

export interface TraceContainer {
    traceId: string;
    meta: Record<string, unknown>;
    spans: TraceSpan[];
}

/**
 * Create a new trace container.
 * @param {string} traceId - opaque trace identifier (caller-supplied)
 * @param {Record<string, unknown>} [meta] - optional metadata bag (pipeline name, runId, etc.)
 * @returns {TraceContainer}
 */
export function createTrace(
    traceId: string,
    meta: Record<string, unknown> = {},
): TraceContainer {
    if (typeof traceId !== 'string' || traceId.length === 0) {
        throw new Error('createTrace: traceId must be non-empty string');
    }
    if (meta === null || typeof meta !== 'object') {
        throw new Error('createTrace: meta must be object');
    }
    return { traceId, meta: { ...meta }, spans: [] };
}

/**
 * Append a span to a trace. Returns a new trace (immutable-style).
 * @param {TraceContainer} trace
 * @param {TraceSpan} span - { spanId, parentId|null, name, startTs, endTs, status?, attrs? }
 * @returns {TraceContainer}
 */
export function addSpan(trace: TraceContainer, span: TraceSpan): TraceContainer {
    if (!trace || !Array.isArray(trace.spans)) {
        throw new Error('addSpan: invalid trace');
    }
    if (!span || typeof span !== 'object') {
        throw new Error('addSpan: span must be object');
    }
    const { spanId, parentId = null, name, startTs, endTs } = span;
    if (typeof spanId !== 'string' || !spanId) {
        throw new Error('addSpan: spanId required');
    }
    if (typeof name !== 'string' || !name) {
        throw new Error('addSpan: name required');
    }
    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
        throw new Error('addSpan: startTs/endTs must be finite numbers');
    }
    if (endTs < startTs) {
        throw new Error('addSpan: endTs must be >= startTs');
    }
    if (parentId !== null && typeof parentId !== 'string') {
        throw new Error('addSpan: parentId must be string or null');
    }
    if (trace.spans.some((s) => s.spanId === spanId)) {
        throw new Error(`addSpan: duplicate spanId "${spanId}"`);
    }
    const normalized: TraceSpan = {
        spanId,
        parentId,
        name,
        startTs,
        endTs,
        status: span.status || 'ok',
        attrs: span.attrs && typeof span.attrs === 'object' ? { ...span.attrs } : {},
    };
    return { ...trace, spans: [...trace.spans, normalized] };
}

/**
 * Resolve the parent chain for a span (root-first order).
 * Detects cycles and returns chain up to the offending node without throwing.
 * @param {TraceContainer} trace
 * @param {string} spanId
 * @returns {TraceSpan[]} array of spans, root first, target last
 */
export function parentChain(trace: TraceContainer, spanId: string): TraceSpan[] {
    if (!trace || !Array.isArray(trace.spans)) {
        throw new Error('parentChain: invalid trace');
    }
    const byId = new Map<string, TraceSpan>(trace.spans.map((s) => [s.spanId, s]));
    const target = byId.get(spanId);
    if (!target) return [];
    const chain = [target];
    const seen = new Set<string>([spanId]);
    let cur = target;
    while (cur.parentId) {
        if (seen.has(cur.parentId)) break; // cycle guard
        const parent = byId.get(cur.parentId);
        if (!parent) break; // orphan parent
        chain.push(parent);
        seen.add(parent.spanId);
        cur = parent;
    }
    return chain.reverse();
}

/**
 * Total trace duration (max endTs - min startTs across all spans).
 * Returns 0 for empty traces.
 * @param {TraceContainer} trace
 * @returns {number}
 */
export function traceDuration(trace: TraceContainer): number {
    if (!trace || !Array.isArray(trace.spans) || trace.spans.length === 0) return 0;
    let min = Infinity;
    let max = -Infinity;
    for (const s of trace.spans) {
        if (s.startTs < min) min = s.startTs;
        if (s.endTs > max) max = s.endTs;
    }
    return max - min;
}

/**
 * Aggregate summary: counts, status breakdown, total duration, root count,
 * orphan count (parentId set but parent missing), max depth.
 * @param {TraceContainer} trace
 * @returns {{traceId: string, total: number, roots: number, orphans: number, statusCounts: Record<string, number>, maxDepth: number, durationMs: number}}
 */
export function summarizeTrace(trace: TraceContainer): {
    traceId: string;
    total: number;
    roots: number;
    orphans: number;
    statusCounts: Record<string, number>;
    maxDepth: number;
    durationMs: number;
} {
    if (!trace || !Array.isArray(trace.spans)) {
        throw new Error('summarizeTrace: invalid trace');
    }
    const spans = trace.spans;
    const total = spans.length;
    const ids = new Set(spans.map((s) => s.spanId));
    let roots = 0;
    let orphans = 0;
    const statusCounts: Record<string, number> = {};
    for (const s of spans) {
        const status = s.status || 'ok';
        statusCounts[status] = (statusCounts[status] || 0) + 1;
        if (s.parentId === null) roots++;
        else if (!ids.has(s.parentId)) orphans++;
    }
    let maxDepth = 0;
    for (const s of spans) {
        const d = parentChain(trace, s.spanId).length;
        if (d > maxDepth) maxDepth = d;
    }
    return {
        traceId: trace.traceId,
        total,
        roots,
        orphans,
        statusCounts,
        maxDepth,
        durationMs: traceDuration(trace),
    };
}