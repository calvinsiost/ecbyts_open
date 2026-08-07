// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Exporters - Phase 5 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S8
 *
 * Phase 5 (2026-05-01) - pure-logic exporters para apresentar resultados
 * de compliance em formatos consumíveis: Markdown, JSON-LD, CSV simples.
 * Complementa:
 *   - Phase 1 validator (validation engine)
 *   - Phase 2 store (provenance + revision FSM)
 *   - Phase 3 audit log (event tracking)
 *   - Phase 4 diff helper (revision comparison)
 *
 * Estratégia:
 *   - Exporters são funções puras (input → string)
 *   - Markdown: human-readable, GitHub-flavored
 *   - JSON-LD: schema.org compatible (interop)
 *   - CSV: tabular para análise externa
 *   - Sanitização básica para prevenir injeção em destinos
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const COMPLIANCE_EXPORTERS_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 5,
    deliveredAt: '2026-05-01',
    formats: ['markdown', 'jsonld', 'csv'],
});

/** Escapa pipes (|), backticks (`), e quebras de linha em strings markdown table. */
function _escMd(value: any): string {
    if (value == null) return '';
    return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ').replace(/`/g, "'");
}

/** Escapa CSV (RFC 4180): quote se contém vírgula/quebra/aspa; duplica aspas. */
function _escCsv(value: any): string {
    if (value == null) return '';
    const str = String(value);
    if (/[",\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Exporta lista de provenance entries para Markdown table.
 *
 * @param {Array<any>} entries
 * @param {Object} [options]
 * @param {string} [options.title] - título H2 opcional
 * @returns {string}
 */
export function provenanceToMarkdown(entries: any[], options: { title?: string } = {}): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return options.title ? `## ${options.title}\n\n_(no provenance entries)_` : '_(no provenance entries)_';
    }
    const lines = [];
    if (options.title) lines.push(`## ${options.title}`, '');

    lines.push('| Timestamp | Source | Actor | Document |');
    lines.push('| --- | --- | --- | --- |');
    for (const e of entries) {
        if (!e) continue;
        lines.push(
            `| ${_escMd(e.timestamp)} | ${_escMd(e.source)} | ${_escMd(e.actor || '—')} | ${_escMd(e.documentId)} |`,
        );
    }
    return lines.join('\n');
}

/**
 * Exporta revision history para Markdown.
 *
 * @param {Array<any>} revisions
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function revisionsToMarkdown(revisions: any[], options: Record<string, any> = {}): string {
    if (!Array.isArray(revisions) || revisions.length === 0) {
        return options.title ? `## ${options.title}\n\n_(no revisions)_` : '_(no revisions)_';
    }
    const lines = [];
    if (options.title) lines.push(`## ${options.title}`, '');
    lines.push('| Timestamp | State | Actor | Note |');
    lines.push('| --- | --- | --- | --- |');
    for (const r of revisions) {
        if (!r) continue;
        lines.push(
            `| ${_escMd(r.timestamp)} | ${_escMd(r.state)} | ${_escMd(r.actor || '—')} | ${_escMd(r.note || '')} |`,
        );
    }
    return lines.join('\n');
}

/**
 * Exporta audit log entries para Markdown.
 *
 * @param {Array<any>} entries
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function auditLogToMarkdown(entries: any[], options: Record<string, any> = {}): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return options.title ? `## ${options.title}\n\n_(no audit entries)_` : '_(no audit entries)_';
    }
    const lines = [];
    if (options.title) lines.push(`## ${options.title}`, '');
    lines.push('| Timestamp | Event | Document | Actor |');
    lines.push('| --- | --- | --- | --- |');
    for (const e of entries) {
        if (!e) continue;
        lines.push(
            `| ${_escMd(e.timestamp)} | ${_escMd(e.eventType)} | ${_escMd(e.documentId)} | ${_escMd(e.actor || '—')} |`,
        );
    }
    return lines.join('\n');
}

/**
 * Exporta diff changes para Markdown estruturado.
 *
 * @param {Array<any>} changes
 * @param {Record<string, any>} [options]
 * @returns {string}
 */
export function diffToMarkdown(changes: any[], options: Record<string, any> = {}): string {
    if (!Array.isArray(changes) || changes.length === 0) {
        return options.title ? `## ${options.title}\n\n_(no changes)_` : '_(no changes)_';
    }
    const lines = [];
    if (options.title) lines.push(`## ${options.title}`, '');
    lines.push('| Path | Type | Old | New |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of changes) {
        if (!c) continue;
        lines.push(
            `| ${_escMd(c.path)} | ${_escMd(c.type)} | ${_escMd(c.oldValue ?? '')} | ${_escMd(c.newValue ?? '')} |`,
        );
    }
    return lines.join('\n');
}

/**
 * Exporta full document compliance report para Markdown.
 *
 * @param {Record<string, any>} input - { documentId, provenance, revisions, auditLog, changes }
 * @returns {string}
 */
export function fullReportToMarkdown(input: Record<string, any>): string {
    if (!input || typeof input !== 'object') return '_(invalid input)_';
    const { documentId, provenance, revisions, auditLog, changes } = input;
    const sections = [
        `# Compliance Report — ${_escMd(documentId || 'Unknown')}`,
        '',
        `_Generated at:_ ${new Date().toISOString()}`,
        '',
    ];
    if (Array.isArray(provenance)) {
        sections.push(provenanceToMarkdown(provenance, { title: 'Provenance' }), '');
    }
    if (Array.isArray(revisions)) {
        sections.push(revisionsToMarkdown(revisions, { title: 'Revision History' }), '');
    }
    if (Array.isArray(auditLog)) {
        sections.push(auditLogToMarkdown(auditLog, { title: 'Audit Log' }), '');
    }
    if (Array.isArray(changes)) {
        sections.push(diffToMarkdown(changes, { title: 'Recent Changes' }), '');
    }
    return sections.join('\n');
}

/**
 * Exporta provenance para CSV (RFC 4180).
 *
 * @param {Array<any>} entries
 * @returns {string}
 */
export function provenanceToCsv(entries: any[]): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'timestamp,source,actor,documentId';
    }
    const lines = ['timestamp,source,actor,documentId'];
    for (const e of entries) {
        if (!e) continue;
        lines.push(`${_escCsv(e.timestamp)},${_escCsv(e.source)},${_escCsv(e.actor || '')},${_escCsv(e.documentId)}`);
    }
    return lines.join('\n');
}

/**
 * Exporta audit log para CSV.
 *
 * @param {Array<any>} entries
 * @returns {string}
 */
export function auditLogToCsv(entries: any[]): string {
    if (!Array.isArray(entries) || entries.length === 0) {
        return 'timestamp,eventType,documentId,actor';
    }
    const lines = ['timestamp,eventType,documentId,actor'];
    for (const e of entries) {
        if (!e) continue;
        lines.push(
            `${_escCsv(e.timestamp)},${_escCsv(e.eventType)},${_escCsv(e.documentId)},${_escCsv(e.actor || '')}`,
        );
    }
    return lines.join('\n');
}

/**
 * Exporta full document para JSON-LD compatível com schema.org/CreativeWork.
 *
 * @param {Record<string, any>} input - { documentId, provenance, revisions, auditLog }
 * @returns {Object}
 */
export function fullReportToJsonLd(input: Record<string, any>): object {
    if (!input || typeof input !== 'object') {
        return { '@context': 'https://schema.org', '@type': 'CreativeWork' };
    }
    const { documentId, provenance, revisions, auditLog } = input;
    const out: Record<string, any> = {
        '@context': 'https://schema.org',
        '@type': 'CreativeWork',
        identifier: String(documentId || ''),
        dateCreated: revisions?.[0]?.timestamp || null,
        dateModified: revisions?.[revisions.length - 1]?.timestamp || null,
    };
    if (Array.isArray(provenance) && provenance.length > 0) {
        out.provenance = provenance.map((p) => ({
            '@type': 'Action',
            actionStatus: p.source,
            agent: p.actor ? { '@type': 'Person', name: p.actor } : null,
            startTime: p.timestamp,
        }));
    }
    if (Array.isArray(revisions) && revisions.length > 0) {
        out.version = revisions.map((r, i) => ({
            '@type': 'Version',
            position: i + 1,
            status: r.state,
            agent: r.actor ? { '@type': 'Person', name: r.actor } : null,
            startTime: r.timestamp,
            description: r.note || undefined,
        }));
    }
    if (Array.isArray(auditLog) && auditLog.length > 0) {
        out.subjectOf = auditLog.map((a) => ({
            '@type': 'Action',
            actionStatus: a.eventType,
            agent: a.actor ? { '@type': 'Person', name: a.actor } : null,
            startTime: a.timestamp,
        }));
    }
    return out;
}

/**
 * Module identity export.
 */
export const complianceExportersMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 5,
    deliveredAt: '2026-05-01',
    formats: ['markdown', 'jsonld', 'csv'],
    exports: [
        'COMPLIANCE_EXPORTERS_META',
        'provenanceToMarkdown',
        'revisionsToMarkdown',
        'auditLogToMarkdown',
        'diffToMarkdown',
        'fullReportToMarkdown',
        'provenanceToCsv',
        'auditLogToCsv',
        'fullReportToJsonLd',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
