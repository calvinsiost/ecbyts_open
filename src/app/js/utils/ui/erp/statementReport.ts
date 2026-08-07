// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * DRE / Income-statement report — DOM renderer (ERP-DRE-001 §11.4, MI-5).
 *
 * Renders an {@link IncomeStatement} (and optional EBITDA reconciliation) as an
 * HTML table inside a host element, with:
 *   - a standard selector (BR-DRE / IFRS-IAS1 / US-GAAP-ASC220) that re-renders;
 *   - per-line drilldown (click/Enter expands the accountIds + journal-entry ids
 *     that feed the line — RF-9);
 *   - a visible EBITDA reconciliation bridge starting at Net Income (RF-6).
 *
 * All arithmetic/formatting lives in `_statementReportVMPure.ts`; this file only
 * touches the DOM. All user-facing text is escaped (escapeHtmlFull) and i18n is
 * applied best-effort via `window.t` (falling back to the embedded label).
 *
 * This module is reachable ONLY when `CONFIG.FEATURES.ERP_DRE === true`
 * (the ECBT Score panel gates the trigger). With the flag off it is never
 * imported, so the legacy Score path is untouched.
 */

import { escapeHtmlFull, escapeAttr } from '../../helpers/html.js';
import { buildIncomeStatement } from '../../../core/erp/_incomeStatementPure.js';
import { computeEbitda } from '../../../core/erp/_ebitdaReconciliationPure.js';
import { defaultChartBR } from '../../../core/erp/_chartOfAccountsPure.js';
import type { IncomeStatement } from '../../../core/erp/_incomeStatementPure.js';
import type { StandardId } from '../../../core/erp/_statementStandards.js';
import { exportStatement, type StatementExportFormat } from '../../../core/erp/_statementExportPure.js';
import {
    buildStatementReportVM,
    type StatementReportVM,
    type StatementLineVM,
} from './_statementReportVMPure.js';

/** Re-render context kept on the host element so the selector can rebuild. */
interface RenderContext {
    statement: IncomeStatement;
    currency: string;
    locale: string;
    depreciationAmortization: number;
}

/** Best-effort i18n: window.t(key) → translated, else the supplied fallback. */
function tr(key: string, fallback: string): string {
    const w = window as unknown as { t?: (k: string) => string };
    if (typeof w.t === 'function') {
        try {
            const out = w.t(key);
            if (out && out !== key) return out;
        } catch (e) {
            console.debug('[erp/statementReport] i18n fallback', (e as Error)?.message || e);
        }
    }
    return fallback;
}

function lineRowHtml(line: StatementLineVM, rowId: string): string {
    const cls = line.emphasis ? 'erp-dre-row erp-dre-row--emphasis' : 'erp-dre-row';
    const label = escapeHtmlFull(tr(line.labelKey, line.labelFallback));
    const amount = escapeHtmlFull(line.amountText);
    const amountCls = line.amount < 0 ? 'erp-dre-amount erp-dre-amount--neg' : 'erp-dre-amount';
    if (!line.hasDrilldown) {
        return (
            `<tr class="${cls}">` +
            `<td class="erp-dre-label">${label}</td>` +
            `<td class="${amountCls}">${amount}</td>` +
            `</tr>`
        );
    }
    const drillTitle = escapeAttr(tr('erpDre.drilldown', 'View entries for this line'));
    return (
        `<tr class="${cls} erp-dre-row--clickable" tabindex="0" role="button" ` +
        `aria-expanded="false" aria-controls="${escapeAttr(rowId)}" ` +
        `data-erp-dre-line="${escapeAttr(line.key)}" title="${drillTitle}">` +
        `<td class="erp-dre-label"><span class="erp-dre-caret" aria-hidden="true">▸</span> ${label}</td>` +
        `<td class="${amountCls}">${amount}</td>` +
        `</tr>`
    );
}

function drilldownRowHtml(line: StatementLineVM, rowId: string): string {
    const accounts = line.accountIds.map((id) => escapeHtmlFull(id)).join(', ') || '—';
    const entries = line.sourceEntryIds.map((id) => escapeHtmlFull(id)).join(', ') || '—';
    const accLabel = escapeHtmlFull(tr('erpDre.drilldownAccounts', 'Accounts'));
    const entLabel = escapeHtmlFull(tr('erpDre.drilldownEntries', 'Journal entries'));
    return (
        `<tr class="erp-dre-drill" id="${escapeAttr(rowId)}" hidden>` +
        `<td colspan="2" class="erp-dre-drill-cell">` +
        `<div class="erp-dre-drill-line"><strong>${accLabel}:</strong> ${accounts}</div>` +
        `<div class="erp-dre-drill-line"><strong>${entLabel}:</strong> ${entries}</div>` +
        `</td></tr>`
    );
}

function selectorHtml(vm: StatementReportVM): string {
    const label = escapeHtmlFull(tr('erpDre.standardLabel', 'Standard'));
    const options = vm.standardOptions
        .map((opt) => {
            const sel = opt.selected ? ' selected' : '';
            return `<option value="${escapeAttr(opt.id)}"${sel}>${escapeHtmlFull(opt.id)}</option>`;
        })
        .join('');
    const exportLabel = escapeHtmlFull(tr('erpDre.export', 'Export'));
    return (
        `<div class="erp-dre-toolbar">` +
        `<label class="erp-dre-std-label" for="erp-dre-standard">${label}</label>` +
        `<select id="erp-dre-standard" class="erp-dre-standard" data-erp-dre-standard>${options}</select>` +
        // RF-4/RF-11/RF-2 management triggers (visible — UX-First / Pixels-Over-DOM).
        `<span class="erp-dre-actions">` +
        `<button type="button" class="erp-dre-btn" data-erp-dre-new-entry>${escapeHtmlFull(tr('erpDre.newEntry', 'New entry'))}</button>` +
        `<button type="button" class="erp-dre-btn" data-erp-dre-registries>${escapeHtmlFull(tr('erpDre.registries.title', 'Registries'))}</button>` +
        `<button type="button" class="erp-dre-btn" data-erp-dre-chart>${escapeHtmlFull(tr('erpDre.chart.title', 'Chart of accounts'))}</button>` +
        `</span>` +
        // RF-10 export buttons (CSV / JSON / Markdown).
        `<span class="erp-dre-export" role="group" aria-label="${escapeAttr(exportLabel)}">` +
        `<span class="erp-dre-export-label">${exportLabel}:</span>` +
        `<button type="button" class="erp-dre-btn erp-dre-export-btn" data-erp-dre-export="csv">CSV</button>` +
        `<button type="button" class="erp-dre-btn erp-dre-export-btn" data-erp-dre-export="json">JSON</button>` +
        `<button type="button" class="erp-dre-btn erp-dre-export-btn" data-erp-dre-export="markdown">MD</button>` +
        `</span>` +
        `</div>`
    );
}

function reconciliationHtml(vm: StatementReportVM): string {
    if (vm.reconciliation.length === 0) return '';
    const title = escapeHtmlFull(tr(vm.reconciliationTitleKey, 'EBITDA Reconciliation'));
    const rows = vm.reconciliation
        .map((step) => {
            const last = step === vm.reconciliation[vm.reconciliation.length - 1];
            const cls = last ? 'erp-dre-row erp-dre-row--emphasis' : 'erp-dre-row';
            const amountCls =
                step.amount < 0 ? 'erp-dre-amount erp-dre-amount--neg' : 'erp-dre-amount';
            return (
                `<tr class="${cls}">` +
                `<td class="erp-dre-label">${escapeHtmlFull(step.labelFallback)}</td>` +
                `<td class="${amountCls}">${escapeHtmlFull(step.amountText)}</td>` +
                `</tr>`
            );
        })
        .join('');
    return (
        `<div class="erp-dre-reconciliation">` +
        `<h4 class="erp-dre-recon-title">${title}</h4>` +
        `<table class="erp-dre-table erp-dre-table--recon"><tbody>${rows}</tbody></table>` +
        `</div>`
    );
}

/** Build the full inner HTML for a view-model (pure string assembly). */
function reportHtml(vm: StatementReportVM): string {
    const title = escapeHtmlFull(tr(vm.titleKey, 'Income Statement'));
    const rowsHtml = vm.lines
        .map((line, i) => {
            const rowId = `erp-dre-drill-${escapeAttr(line.key)}-${i}`;
            const base = lineRowHtml(line, rowId);
            const drill = line.hasDrilldown ? drilldownRowHtml(line, rowId) : '';
            return base + drill;
        })
        .join('');
    return (
        `<section class="erp-dre" aria-label="${escapeAttr(title)}">` +
        `<header class="erp-dre-header"><h3 class="erp-dre-title">${title}</h3>` +
        selectorHtml(vm) +
        `</header>` +
        `<table class="erp-dre-table"><tbody>${rowsHtml}</tbody></table>` +
        reconciliationHtml(vm) +
        `</section>`
    );
}

/** Toggle a single drilldown row (expand/collapse) and its caret/aria state. */
function toggleDrilldown(host: HTMLElement, triggerRow: HTMLElement): void {
    const controls = triggerRow.getAttribute('aria-controls');
    if (!controls) return;
    const drill = host.querySelector<HTMLElement>(`#${CSS.escape(controls)}`);
    if (!drill) return;
    const expanded = triggerRow.getAttribute('aria-expanded') === 'true';
    triggerRow.setAttribute('aria-expanded', String(!expanded));
    drill.hidden = expanded;
    const caret = triggerRow.querySelector<HTMLElement>('.erp-dre-caret');
    if (caret) caret.textContent = expanded ? '▸' : '▾';
}

/** MIME + extension per export format. */
const EXPORT_META: Readonly<Record<StatementExportFormat, { mime: string; ext: string }>> =
    Object.freeze({
        csv: { mime: 'text/csv;charset=utf-8', ext: 'csv' },
        json: { mime: 'application/json;charset=utf-8', ext: 'json' },
        markdown: { mime: 'text/markdown;charset=utf-8', ext: 'md' },
    });

/** Trigger a browser download of an exported string (RF-10). DOM-only. */
function downloadStatement(
    statement: IncomeStatement,
    format: StatementExportFormat,
    currency: string,
    depreciationAmortization: number,
): void {
    let ebitda = null;
    try {
        ebitda = computeEbitda(statement, statement.standard, { depreciationAmortization });
    } catch (e) {
        console.debug(
            '[erp/statementReport] ebitda reconciliation skipped',
            (e as Error)?.message || e,
        );
    }
    const text = exportStatement(statement, format, { currency, ebitda });
    const { mime, ext } = EXPORT_META[format];
    // CSV gets a UTF-8 BOM so Excel pt-BR opens it correctly (parity with downloadCsv).
    const payload = format === 'csv' ? '﻿' + text : text;
    const blob = new Blob([payload], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dre-${statement.standard}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/** Lazy-open one of the ERP management modals (RF-2/RF-4/RF-11). */
async function openErpModal(kind: 'entry' | 'registries' | 'chart'): Promise<void> {
    if (kind === 'entry') {
        const { openJournalEditor } = await import('./journalEditor.js');
        await openJournalEditor();
        // Posting dispatches ecbt:journalEntryPosted; the Score panel re-renders.
    } else if (kind === 'registries') {
        const { openErpRegistries } = await import('./erpRegistries.js');
        await openErpRegistries();
    } else {
        const { openChartEditor } = await import('./chartEditor.js');
        await openChartEditor();
    }
}

function wire(host: HTMLElement, ctx: RenderContext): void {
    // Standard selector → recompute statement for the chosen standard + re-render.
    const select = host.querySelector<HTMLSelectElement>('[data-erp-dre-standard]');
    select?.addEventListener('change', () => {
        const id = select.value as StandardId;
        const accounts = defaultChartBR();
        // Rebuild the statement for the new standard from the SAME ledger snapshot
        // cached on the context (the journal entries don't change with standard).
        try {
            const ledger = (host as unknown as { __erpDreLedger?: unknown }).__erpDreLedger;
            if (ledger) {
                ctx.statement = buildIncomeStatement(ledger as never, accounts, id);
            } else {
                // No ledger snapshot — fall back to re-projecting via a fresh build is
                // impossible without entries; keep the cached statement's standard swap
                // by re-deriving from its lines is not valid, so just relabel safely.
                ctx.statement = { ...ctx.statement, standard: id } as IncomeStatement;
            }
        } catch (e) {
            console.debug('[erp/statementReport] standard switch failed', (e as Error)?.message);
        }
        renderStatementReport(host, ctx.statement, {
            currency: ctx.currency,
            locale: ctx.locale,
            depreciationAmortization: ctx.depreciationAmortization,
            ledger: (host as unknown as { __erpDreLedger?: unknown }).__erpDreLedger,
        });
    });

    // RF-10 export buttons (CSV / JSON / Markdown).
    host.querySelectorAll<HTMLButtonElement>('[data-erp-dre-export]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const format = btn.getAttribute('data-erp-dre-export') as StatementExportFormat;
            try {
                downloadStatement(ctx.statement, format, ctx.currency, ctx.depreciationAmortization);
            } catch (e) {
                console.warn('[erp/statementReport] export failed', (e as Error)?.message);
            }
        });
    });

    // RF-2/RF-4/RF-11 management triggers (lazy-import the modals on click).
    const wireOpen = (selector: string, kind: 'entry' | 'registries' | 'chart') => {
        host.querySelector<HTMLButtonElement>(selector)?.addEventListener('click', () => {
            openErpModal(kind).catch((e) =>
                console.warn('[erp/statementReport] modal open failed', (e as Error)?.message),
            );
        });
    };
    wireOpen('[data-erp-dre-new-entry]', 'entry');
    wireOpen('[data-erp-dre-registries]', 'registries');
    wireOpen('[data-erp-dre-chart]', 'chart');

    // Drilldown: click + keyboard (Enter / Space).
    host.querySelectorAll<HTMLElement>('.erp-dre-row--clickable').forEach((row) => {
        row.addEventListener('click', () => toggleDrilldown(host, row));
        row.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                toggleDrilldown(host, row);
            }
        });
    });
}

/** Options accepted by {@link renderStatementReport}. */
export interface RenderStatementReportOptions {
    readonly currency?: string;
    readonly locale?: string;
    /** D&A add-back for the EBITDA reconciliation (e.g. period balance of D.4). */
    readonly depreciationAmortization?: number;
    /**
     * The ledger snapshot behind the statement. Stashed on the host so the
     * standard selector can re-project onto another standard without re-fetching.
     */
    readonly ledger?: unknown;
}

/**
 * Render the DRE/income-statement report into `container` (MI-5).
 *
 * @param container - The host element (its content is replaced).
 * @param statement - The income statement to render.
 * @param options - Currency, locale, D&A add-back, and optional ledger snapshot.
 */
export function renderStatementReport(
    container: HTMLElement,
    statement: IncomeStatement,
    options: RenderStatementReportOptions = {},
): void {
    if (!container) return;
    const currency = options.currency ?? 'BRL';
    const locale = options.locale ?? 'pt-BR';
    const da = Number(options.depreciationAmortization) || 0;

    let ebitda = null;
    try {
        ebitda = computeEbitda(statement, statement.standard, {
            depreciationAmortization: da,
        });
    } catch (e) {
        console.debug('[erp/statementReport] EBITDA skipped', (e as Error)?.message);
    }

    const vm = buildStatementReportVM(statement, { currency, locale, ebitda });
    container.innerHTML = reportHtml(vm);

    // Stash the ledger snapshot so the standard selector can re-project.
    if (options.ledger !== undefined) {
        (container as unknown as { __erpDreLedger?: unknown }).__erpDreLedger = options.ledger;
    }

    wire(container, {
        statement,
        currency,
        locale,
        depreciationAmortization: da,
    });
}
