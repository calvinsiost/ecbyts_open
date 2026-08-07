// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Audit Reports - Phase 21 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S24
 *
 * Phase 21 (2026-05-01) - pure-logic report generators sobre audit log.
 * Produz timeline view, actor activity, daily summary, e markdown reports
 * para auditorias e investigações.
 *
 * Estratégia:
 *   - groupByDay: bucket entries por YYYY-MM-DD
 *   - groupByActor: aggregate por user
 *   - timeline: ordenado por timestamp
 *   - generateMarkdownReport: human-readable export
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Report format types. */
export const REPORT_FORMATS = Object.freeze(['markdown', 'json', 'csv']);

/** Identidade do módulo. */
export const AUDIT_REPORTS_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 21,
    deliveredAt: '2026-05-01',
    formats: REPORT_FORMATS,
});

/**
 * Verifica se format é canônico.
 */
export function isValidFormat(format: any): boolean {
    return typeof format === 'string' && REPORT_FORMATS.includes(format);
}

/**
 * Extrai YYYY-MM-DD de ISO timestamp.
 */
export function extractDay(timestamp: string): string | null {
    if (typeof timestamp !== 'string') return null;
    const ms = Date.parse(timestamp);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Agrupa entries por dia.
 */
export function groupByDay(entries: any[]): Record<string, any[]> {
    if (!Array.isArray(entries)) return {};
    const out: Record<string, any[]> = {};
    for (const e of entries) {
        if (!e || !e.timestamp) continue;
        const day = extractDay(e.timestamp);
        if (!day) continue;
        if (!out[day]) out[day] = [];
        (out[day] as any[]).push(e);
    }
    return out;
}

/**
 * Agrupa entries por actor.
 */
export function groupByActor(entries: any[]): Record<string, any[]> {
    if (!Array.isArray(entries)) return {};
    const out: Record<string, any[]> = {};
    for (const e of entries) {
        if (!e || !e.actorId) continue;
        if (!out[e.actorId]) out[e.actorId] = [];
        (out[e.actorId] as any[]).push(e);
    }
    return out;
}

/**
 * Computa actor activity summary.
 */
export function computeActorActivity(entries: any[]): any[] {
    if (!Array.isArray(entries)) return [];
    const grouped = groupByActor(entries);
    const out: any[] = [];
    for (const [actorId, list] of Object.entries(grouped)) {
        if (!Array.isArray(list)) continue;
        const byEventType: Record<string, number> = {};
        let firstAt: any = null;
        let lastAt: any = null;
        for (const e of list) {
            if (!e) continue;
            if (e.eventType) byEventType[e.eventType] = (byEventType[e.eventType] || 0) + 1;
            if (e.timestamp) {
                if (!firstAt || e.timestamp < firstAt) firstAt = e.timestamp;
                if (!lastAt || e.timestamp > lastAt) lastAt = e.timestamp;
            }
        }
        out.push(
            Object.freeze({
                actorId,
                eventCount: list.length,
                byEventType,
                firstAt,
                lastAt,
            }),
        );
    }
    out.sort((a: any, b: any) => b.eventCount - a.eventCount);
    return Object.freeze(out) as any;
}

/**
 * Computa daily summary.
 */
export function computeDailySummary(entries: any[]): any[] {
    if (!Array.isArray(entries)) return [];
    const grouped = groupByDay(entries);
    const out: any[] = [];
    for (const [day, list] of Object.entries(grouped)) {
        if (!Array.isArray(list)) continue;
        const actors = new Set();
        const byEventType: Record<string, number> = {};
        for (const e of list) {
            if (!e) continue;
            if (e.actorId) actors.add(e.actorId);
            if (e.eventType) byEventType[e.eventType] = (byEventType[e.eventType] || 0) + 1;
        }
        out.push(
            Object.freeze({
                day,
                eventCount: list.length,
                uniqueActors: actors.size,
                byEventType,
            }),
        );
    }
    out.sort((a: any, b: any) => a.day.localeCompare(b.day));
    return Object.freeze(out) as any;
}

/**
 * Constrói timeline ordenada (asc).
 */
export function buildTimeline(entries: any[]): any[] {
    if (!Array.isArray(entries)) return [];
    return Object.freeze(
        [...entries].filter((e: any) => e && e.timestamp).sort((a: any, b: any) => a.timestamp.localeCompare(b.timestamp)),
    ) as any;
}

/**
 * Gera markdown report.
 */
export function generateMarkdownReport(entries: any[], options: any = {}): string {
    if (!Array.isArray(entries)) return '(no entries)';
    const title = options.title || 'Audit Report';
    const lines: string[] = [];
    lines.push(`# ${title}`);
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push(`**Total events:** ${entries.length}`);
    lines.push('');

    // Daily summary
    const daily = computeDailySummary(entries);
    if (daily.length > 0) {
        lines.push('## Daily Summary');
        lines.push('| Day | Events | Unique Actors |');
        lines.push('|-----|--------|---------------|');
        for (const d of daily) {
            lines.push(`| ${d.day} | ${d.eventCount} | ${d.uniqueActors} |`);
        }
        lines.push('');
    }

    // Top actors
    const actors = computeActorActivity(entries);
    if (actors.length > 0) {
        lines.push('## Top Actors');
        lines.push('| Actor | Events | First | Last |');
        lines.push('|-------|--------|-------|------|');
        for (const a of actors.slice(0, 10)) {
            lines.push(`| ${a.actorId} | ${a.eventCount} | ${a.firstAt || '-'} | ${a.lastAt || '-'} |`);
        }
    }

    return lines.join('\n');
}

/**
 * Gera CSV report.
 */
export function generateCsvReport(entries: any[]): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'timestamp,actorId,eventType,docId,details\n';
    }
    const lines = ['timestamp,actorId,eventType,docId,details'];
    for (const e of entries) {
        if (!e) continue;
        const row = [
            e.timestamp || '',
            e.actorId || '',
            e.eventType || '',
            e.docId || '',
            (e.details || '').replace(/"/g, '""').replace(/\r?\n/g, ' '),
        ];
        // Quote each field
        lines.push(row.map((f: any) => `"${f}"`).join(','));
    }
    return lines.join('\n');
}

/**
 * Gera report no formato pedido.
 */
export function generateReport(entries: any[], format: any = 'markdown', options: any = {}): string {
    if (!isValidFormat(format)) format = 'markdown';
    if (format === 'json') return JSON.stringify(entries || [], null, 2);
    if (format === 'csv') return generateCsvReport(entries);
    return generateMarkdownReport(entries, options);
}

/**
 * Sumariza audit log.
 */
export function summarizeAuditLog(entries: any): any {
    const empty = {
        total: 0,
        uniqueActors: 0,
        uniqueDocs: 0,
        byEventType: {},
        dateRange: null,
    };
    if (!Array.isArray(entries) || entries.length === 0) return empty;
    const actors = new Set();
    const docs = new Set();
    const byEventType: Record<string, number> = {};
    let firstTime: any = null;
    let lastTime: any = null;
    for (const e of entries) {
        if (!e) continue;
        if (e.actorId) actors.add(e.actorId);
        if (e.docId) docs.add(e.docId);
        if (e.eventType) byEventType[e.eventType] = (byEventType[e.eventType] || 0) + 1;
        if (e.timestamp) {
            if (!firstTime || e.timestamp < firstTime) firstTime = e.timestamp;
            if (!lastTime || e.timestamp > lastTime) lastTime = e.timestamp;
        }
    }
    return Object.freeze({
        total: entries.length,
        uniqueActors: actors.size,
        uniqueDocs: docs.size,
        byEventType,
        dateRange: firstTime && lastTime ? { from: firstTime, to: lastTime } : null,
    });
}

/**
 * Module identity export.
 */
export const complianceAuditReportsMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 21,
    deliveredAt: '2026-05-01',
    formats: REPORT_FORMATS,
    exports: [
        'REPORT_FORMATS',
        'AUDIT_REPORTS_META',
        'isValidFormat',
        'extractDay',
        'groupByDay',
        'groupByActor',
        'computeActorActivity',
        'computeDailySummary',
        'buildTimeline',
        'generateMarkdownReport',
        'generateCsvReport',
        'generateReport',
        'summarizeAuditLog',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
