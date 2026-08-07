// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Audit Trail — Markdown export (pure-logic).
 * SPEC_ECBT_SCORE_AUDIT_TRAIL F2 + RF6 — gerador de relatório Markdown
 * auditável consumindo AuditTrailVM para colar em report/email/PR.
 * claude - novaspec, 2026-06-05.
 *
 * Consume AuditTrailVM de _auditTrailPure → produz string Markdown
 * GitHub-flavored com 9 blocos + Dashboard + footer com timestamp.
 *
 * Out of scope:
 *   - i18n strings (consumer fornece labels resolvidos)
 *   - Imagem/gráficos (MD apenas tabular)
 *   - Hyperlinks DOI (consumer pode pós-processar)
 *
 * Tests: tests/ecbt-audit-trail-markdown-pure.test.mjs
 */

import type { AuditTrailVM, AuditTrailBlockVM, AuditTrailRowVM, DashboardKpis } from './_auditTrailPure.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface MarkdownExportOptions {
    readonly title?: string;
    readonly includeDashboard?: boolean;
    readonly includeTheoreticalRefs?: boolean;
    readonly includeXlsxA1?: boolean;
    readonly labelResolver?: (key: string) => string; // i18n
    readonly verdictResolver?: (verdict: DashboardKpis['verdict']) => string;
}

export interface MarkdownExportResult {
    readonly markdown: string;
    readonly bytes: number;
    readonly blockCount: number;
    readonly rowCount: number;
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function escapeMd(s: unknown): string {
    if (s === null || s === undefined) return '';
    const str = String(s);
    return str.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function defaultLabelResolver(key: string): string {
    return key;
}

function defaultVerdictResolver(v: DashboardKpis['verdict']): string {
    if (v === 'audit_ready') return '🟢 Audit Ready';
    if (v === 'management_ready') return '🟡 Management Ready';
    return '🔴 Critical';
}

function cellKindBadge(kind: AuditTrailRowVM['cellKind']): string {
    if (kind === 'input') return '🔵';
    if (kind === 'output') return '🟢';
    return '⚪';
}

// ----------------------------------------------------------------
// BLOCK FORMATTERS
// ----------------------------------------------------------------

function formatRow(row: AuditTrailRowVM, includeXlsxA1: boolean, labelResolver: (k: string) => string): string {
    const label = escapeMd(labelResolver(row.labelKey));
    const formula = escapeMd(row.formulaSymbolic);
    const value = escapeMd(row.value);
    const unit = row.unit ? escapeMd(row.unit) : '';
    const kind = cellKindBadge(row.cellKind);
    const xlsxCol = includeXlsxA1 ? ` | \`${escapeMd(row.xlsxA1 ?? '')}\`` : '';
    return `| ${kind} \`${row.cellId}\` | ${label} | ${formula} | **${value}** ${unit}${xlsxCol} |`;
}

function formatBlock(
    block: AuditTrailBlockVM,
    options: Required<Pick<MarkdownExportOptions, 'includeTheoreticalRefs' | 'includeXlsxA1' | 'labelResolver'>>,
): string {
    const lines: string[] = [];
    lines.push(`\n## ${block.id}. ${escapeMd(options.labelResolver(block.titleKey))}`);
    if (block.coreRefs.length > 0) {
        lines.push(`\n> **core/**: \`${block.coreRefs.join('` · `')}\``);
    }
    if (options.includeTheoreticalRefs && block.theoreticalRefs.length > 0) {
        const refs = block.theoreticalRefs.map((r) => `${r.kind.toUpperCase()}:${r.id}`).join(' · ');
        lines.push(`>\n> **Base teórica**: ${escapeMd(refs)}`);
    }
    const xlsxCol = options.includeXlsxA1 ? ' | XLSX A1 |' : '';
    const xlsxSep = options.includeXlsxA1 ? ' | --- |' : '';
    lines.push('');
    lines.push(`| Cell | Label | Fórmula | Valor${xlsxCol}`);
    lines.push(`| --- | --- | --- | ---${xlsxSep}`);
    for (const row of block.rows) {
        lines.push(formatRow(row, options.includeXlsxA1, options.labelResolver));
    }
    return lines.join('\n');
}

function formatDashboard(
    kpis: DashboardKpis,
    labelResolver: (k: string) => string,
    verdictResolver: (v: DashboardKpis['verdict']) => string,
): string {
    return [
        '\n## Dashboard — Resultados-chave',
        '',
        '| KPI | Valor |',
        '| --- | --- |',
        `| EIS | **${kpis.eis}** |`,
        `| Veredito | **${verdictResolver(kpis.verdict)}** |`,
        `| Severidade S | **${kpis.severityS}** |`,
        `| κ (kappa) | **${kpis.kappa}** |`,
        `| ECBT Score % | **${kpis.ecbtPct}%** |`,
        `| Banda ± | **${kpis.ecbtBand}%** |`,
    ].join('\n');
}

// ----------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------

export function buildAuditTrailMarkdown(vm: AuditTrailVM, options?: MarkdownExportOptions): MarkdownExportResult {
    if (!vm || typeof vm !== 'object') {
        throw new TypeError('buildAuditTrailMarkdown: AuditTrailVM obrigatório');
    }
    if (!Array.isArray(vm.blocks)) {
        throw new TypeError('buildAuditTrailMarkdown: vm.blocks deve ser array');
    }

    const opts = {
        title: options?.title ?? 'Trilha auditável — ECBT Score',
        includeDashboard: options?.includeDashboard !== false,
        includeTheoreticalRefs: options?.includeTheoreticalRefs !== false,
        includeXlsxA1: options?.includeXlsxA1 !== false,
        labelResolver: options?.labelResolver ?? defaultLabelResolver,
        verdictResolver: options?.verdictResolver ?? defaultVerdictResolver,
    };

    const parts: string[] = [];
    parts.push(`# ${escapeMd(opts.title)}`);
    parts.push('');
    parts.push(`> **Modelo**: \`${escapeMd(vm.modelId)}\` · **Gerado em**: ${escapeMd(vm.generatedAt)}`);
    parts.push('>');
    parts.push('> **Legenda**: 🔵 ENTRADA · ⚪ CÁLCULO · 🟢 SAÍDA');

    if (opts.includeDashboard) {
        parts.push(formatDashboard(vm.dashboardKpis, opts.labelResolver, opts.verdictResolver));
    }

    let rowCount = 0;
    for (const block of vm.blocks) {
        parts.push(
            formatBlock(block, {
                includeTheoreticalRefs: opts.includeTheoreticalRefs,
                includeXlsxA1: opts.includeXlsxA1,
                labelResolver: opts.labelResolver,
            }),
        );
        rowCount += block.rows.length;
    }

    parts.push('');
    parts.push('---');
    parts.push(`*Trilha gerada por ecbyts ECBT-AUDIT-TRAIL-001 · ${vm.blocks.length} blocos · ${rowCount} células*`);

    const markdown = parts.join('\n');
    return Object.freeze({
        markdown,
        bytes: new TextEncoder().encode(markdown).length,
        blockCount: vm.blocks.length,
        rowCount,
    });
}
