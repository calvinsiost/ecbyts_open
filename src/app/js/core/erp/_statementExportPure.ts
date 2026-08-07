// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * DRE / income-statement export — pure logic (ERP-DRE-001 §2.2, M11, RF-10).
 *
 * Serializes a consolidated {@link IncomeStatement} (plus an optional EBITDA
 * reconciliation) to the three Should-Have formats:
 *   - {@link statementToCsv}      — flat CSV (semicolon `;` separator, BR-friendly)
 *   - {@link statementToJson}     — stable, machine-readable JSON
 *   - {@link statementToMarkdown} — a GitHub-flavoured Markdown table
 *
 * The CSV/JSON/Markdown all carry the SAME lines and amounts so the UI's
 * "export bate com a tela" parity (DoD RF-10) holds. CSV/JSON are own builders
 * (trivial); Markdown follows the table convention of
 * `core/ecbtScore/_auditTrailMarkdownPure.ts`. The XLSX template is NOT reused
 * here (§11.3) — that builder is a fixed ECBT sheet, not a generic exporter.
 *
 * Pure — no DOM, no I/O. Amounts are formatted deterministically (no `Intl`,
 * no locale dependency) so the output is byte-stable for parity tests.
 */

import type { IncomeStatement } from './_incomeStatementPure.js';
import type { EbitdaResult } from './_ebitdaReconciliationPure.js';

/** Supported export formats. */
export type StatementExportFormat = 'csv' | 'json' | 'markdown';

/** Options shared by the export builders. */
export interface StatementExportOptions {
    /** ISO currency code printed alongside amounts (default 'BRL'). */
    readonly currency?: string;
    /** Optional EBITDA reconciliation appended after the main lines. */
    readonly ebitda?: EbitdaResult | null;
    /** Optional period window printed in headers. */
    readonly period?: { readonly start?: string; readonly end?: string } | null;
}

/** Deterministic, locale-free 2-decimal formatting (e.g. -1234.5 → "-1234.50"). */
function fixed2(value: number): string {
    const n = Number.isFinite(value) ? value : 0;
    return n.toFixed(2);
}

/** Escape a CSV cell for the `;`-separated dialect (quote if it has ; " or newline). */
function csvCell(value: string): string {
    const s = String(value);
    if (/[;"\r\n]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

/** Escape a Markdown table cell (pipes break the table). */
function mdCell(value: string): string {
    return String(value).replace(/\|/g, '\\|');
}

/** The flat row shape every format derives from (single source of truth). */
interface ExportRow {
    readonly section: 'line' | 'ebitda';
    readonly key: string;
    readonly label: string;
    readonly amount: number;
    readonly emphasis: boolean;
}

/** Collapse the statement (+ optional reconciliation) into flat export rows. */
function buildRows(statement: IncomeStatement, ebitda?: EbitdaResult | null): readonly ExportRow[] {
    const rows: ExportRow[] = [];
    for (const line of statement.lines ?? []) {
        rows.push({
            section: 'line',
            key: line.key,
            label: line.label,
            amount: line.amount,
            emphasis: line.emphasis === true,
        });
    }
    if (ebitda && Array.isArray(ebitda.reconciliation)) {
        const recon = ebitda.reconciliation;
        for (let i = 0; i < recon.length; i += 1) {
            const step = recon[i];
            if (!step) continue;
            rows.push({
                section: 'ebitda',
                key: `ebitda.${i}`,
                label: step.label,
                amount: step.amount,
                emphasis: i === recon.length - 1,
            });
        }
    }
    return Object.freeze(rows);
}

/**
 * Export the statement as CSV (RF-10). Semicolon-separated (Excel pt-BR opens it
 * directly), CRLF line endings, one row per line + reconciliation step.
 *
 * Columns: `section;key;label;amount;currency`.
 *
 * @param statement - The consolidated income statement.
 * @param options - Currency, optional EBITDA reconciliation, optional period.
 * @returns A CSV string (no BOM — the UI download helper prepends it).
 */
export function statementToCsv(statement: IncomeStatement, options: StatementExportOptions = {}): string {
    const currency = options.currency ?? 'BRL';
    const rows = buildRows(statement, options.ebitda);
    const out: string[] = [];
    out.push(['section', 'key', 'label', 'amount', 'currency'].join(';'));
    for (const row of rows) {
        out.push(
            [
                csvCell(row.section),
                csvCell(row.key),
                csvCell(row.label),
                csvCell(fixed2(row.amount)),
                csvCell(currency),
            ].join(';'),
        );
    }
    return out.join('\r\n');
}

/** Stable JSON export shape (versioned for forward-compat consumers). */
export interface StatementJsonExport {
    readonly schema: 'ecbt.dre.export';
    readonly version: 1;
    readonly standard: string;
    readonly currency: string;
    readonly period: { readonly start: string | null; readonly end: string | null };
    readonly netIncome: number;
    readonly lines: readonly { readonly key: string; readonly label: string; readonly amount: number; readonly emphasis: boolean }[];
    readonly ebitda: { readonly ebitda: number; readonly reconciliation: readonly { readonly label: string; readonly amount: number }[] } | null;
}

/**
 * Export the statement as a stable JSON object (RF-10).
 *
 * @param statement - The consolidated income statement.
 * @param options - Currency, optional EBITDA reconciliation, optional period.
 * @returns A frozen {@link StatementJsonExport} (serialize with JSON.stringify).
 */
export function statementToJson(
    statement: IncomeStatement,
    options: StatementExportOptions = {},
): StatementJsonExport {
    const currency = options.currency ?? 'BRL';
    const lines = (statement.lines ?? []).map((l) =>
        Object.freeze({ key: l.key, label: l.label, amount: l.amount, emphasis: l.emphasis === true }),
    );
    const ebitda = options.ebitda
        ? Object.freeze({
              ebitda: options.ebitda.ebitda,
              reconciliation: Object.freeze(
                  options.ebitda.reconciliation.map((s) => Object.freeze({ label: s.label, amount: s.amount })),
              ),
          })
        : null;
    return Object.freeze({
        schema: 'ecbt.dre.export',
        version: 1,
        standard: statement.standard,
        currency,
        period: Object.freeze({
            start: options.period?.start ?? null,
            end: options.period?.end ?? null,
        }),
        netIncome: statement.netIncome,
        lines: Object.freeze(lines),
        ebitda,
    });
}

function buildMarkdownHeader(
    standard: string,
    currency: string,
    period: { readonly start?: string; readonly end?: string } | null | undefined,
): string[] {
    const parts: string[] = [];
    parts.push(`# DRE — ${standard}`);
    if (period?.start || period?.end) {
        parts.push('');
        parts.push(`_Período: ${period?.start ?? '—'} → ${period?.end ?? '—'}_`);
    }
    parts.push('');
    parts.push(`| Linha | Valor (${currency}) |`);
    parts.push('| --- | ---: |');
    return parts;
}

function buildMarkdownLines(
    lines: readonly { readonly label: string; readonly amount: number; readonly emphasis?: boolean }[],
): string[] {
    const parts: string[] = [];
    for (const line of lines) {
        const label = mdCell(line.label);
        const cell = line.emphasis ? `**${label}**` : label;
        const amount = line.emphasis ? `**${fixed2(line.amount)}**` : fixed2(line.amount);
        parts.push(`| ${cell} | ${amount} |`);
    }
    return parts;
}

function buildMarkdownEbitda(reconciliation: readonly { readonly label: string; readonly amount: number }[]): string[] {
    const parts: string[] = [];
    parts.push('');
    parts.push('## Reconciliação do EBITDA');
    parts.push('');
    parts.push('| Etapa | Valor |');
    parts.push('| --- | ---: |');
    for (let i = 0; i < reconciliation.length; i += 1) {
        const step = reconciliation[i];
        if (!step) continue;
        const last = i === reconciliation.length - 1;
        const label = mdCell(step.label);
        const cell = last ? `**${label}**` : label;
        const amount = last ? `**${fixed2(step.amount)}**` : fixed2(step.amount);
        parts.push(`| ${cell} | ${amount} |`);
    }
    return parts;
}

/**
 * Export the statement as Markdown (RF-10): a heading + a 2-column table of
 * lines, then (if present) an EBITDA reconciliation table. Emphasised subtotals
 * are bolded. Follows the table convention of `_auditTrailMarkdownPure.ts`.
 *
 * @param statement - The consolidated income statement.
 * @param options - Currency, optional EBITDA reconciliation, optional period.
 * @returns A Markdown string.
 */
export function statementToMarkdown(statement: IncomeStatement, options: StatementExportOptions = {}): string {
    const currency = options.currency ?? 'BRL';
    const parts: string[] = [];
    parts.push(...buildMarkdownHeader(statement.standard, currency, options.period));
    parts.push(...buildMarkdownLines(statement.lines ?? []));
    if (options.ebitda && options.ebitda.reconciliation.length > 0) {
        parts.push(...buildMarkdownEbitda(options.ebitda.reconciliation));
    }
    parts.push('');
    return parts.join('\n');
}

/**
 * Convenience dispatcher: serialize a statement to a string in the chosen
 * format (JSON is `JSON.stringify(...)`-ed with 2-space indent).
 *
 * @param statement - The consolidated income statement.
 * @param format - 'csv' | 'json' | 'markdown'.
 * @param options - Currency, optional EBITDA reconciliation, optional period.
 * @returns The serialized string.
 */
export function exportStatement(
    statement: IncomeStatement,
    format: StatementExportFormat,
    options: StatementExportOptions = {},
): string {
    if (format === 'csv') return statementToCsv(statement, options);
    if (format === 'markdown') return statementToMarkdown(statement, options);
    return JSON.stringify(statementToJson(statement, options), null, 2);
}
