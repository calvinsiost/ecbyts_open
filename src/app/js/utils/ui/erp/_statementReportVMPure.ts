// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Statement-report view-model — pure logic (ERP-DRE-001 §11.4, MI-5).
 *
 * Turns an {@link IncomeStatement} (+ optional EBITDA reconciliation) into a flat,
 * render-ready view-model: formatted amounts, a stable i18n key per line, a
 * drilldown payload (accountIds + sourceEntryIds), and the standard selector
 * options. The DOM renderer (`statementReport.ts`) consumes THIS — it does no
 * arithmetic and no formatting of its own.
 *
 * Pure — no DOM, no I/O, no `window`. Output is frozen so the renderer can trust
 * it as immutable.
 */

import type { IncomeStatement, IncomeStatementLine } from '../../../core/erp/_incomeStatementPure.js';
import type { EbitdaResult } from '../../../core/erp/_ebitdaReconciliationPure.js';
import type { StandardId } from '../../../core/erp/_statementStandards.js';

/** One rendered DRE line in the view-model. */
export interface StatementLineVM {
    /** Stable line key (e.g. 'receitaLiquida'). */
    readonly key: string;
    /** i18n key for the line label (e.g. 'erpDre.lines.receitaLiquida'). */
    readonly labelKey: string;
    /** Fallback English/PT label embedded in the statement (when i18n misses). */
    readonly labelFallback: string;
    /** Formatted, sign-aware amount string (e.g. 'R$ 1.234,56'). */
    readonly amountText: string;
    /** Raw numeric amount (for tests / aria). */
    readonly amount: number;
    /** Bold/emphasised subtotal line? */
    readonly emphasis: boolean;
    /** Whether this line has any provenance to drill into. */
    readonly hasDrilldown: boolean;
    /** Ledger account ids feeding the line (drilldown). */
    readonly accountIds: readonly string[];
    /** Journal-entry ids feeding the line (drilldown). */
    readonly sourceEntryIds: readonly string[];
}

/** One EBITDA reconciliation step in the view-model. */
export interface ReconciliationStepVM {
    readonly labelFallback: string;
    readonly amountText: string;
    readonly amount: number;
}

/** A selectable standard for the standard picker. */
export interface StandardOptionVM {
    readonly id: StandardId;
    readonly selected: boolean;
}

/** Top-level render-ready view-model for the DRE report. */
export interface StatementReportVM {
    readonly standard: StandardId;
    readonly currency: string;
    readonly titleKey: string;
    readonly reconciliationTitleKey: string;
    readonly drilldownLabelKey: string;
    readonly standardOptions: readonly StandardOptionVM[];
    readonly lines: readonly StatementLineVM[];
    readonly netIncome: number;
    readonly netIncomeText: string;
    /** EBITDA reconciliation steps (empty when not supplied). */
    readonly reconciliation: readonly ReconciliationStepVM[];
}

/** Options for {@link buildStatementReportVM}. */
export interface StatementReportVMOptions {
    /** ISO currency for formatting (default 'BRL'). */
    readonly currency?: string;
    /** BCP-47 locale for number formatting (default 'pt-BR'). */
    readonly locale?: string;
    /** Optional EBITDA reconciliation (rendered as a sub-table when present). */
    readonly ebitda?: EbitdaResult | null;
}

const ALL_STANDARDS: readonly StandardId[] = Object.freeze([
    'BR-DRE',
    'IFRS-IAS1',
    'US-GAAP-ASC220',
]);

/**
 * Format a monetary amount for display. Falls back to a plain fixed-2 string if
 * `Intl.NumberFormat` is unavailable or throws (e.g. unknown currency code).
 */
export function formatMoney(amount: number, currency: string, locale: string): string {
    const value = Number.isFinite(amount) ? amount : 0;
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            currencyDisplay: 'symbol',
        }).format(value);
    } catch {
        const sign = value < 0 ? '-' : '';
        return `${sign}${currency} ${Math.abs(value).toFixed(2)}`;
    }
}

function lineToVM(
    line: IncomeStatementLine,
    currency: string,
    locale: string,
): StatementLineVM {
    const accountIds = Array.isArray(line.accountIds) ? line.accountIds : [];
    const sourceEntryIds = Array.isArray(line.sourceEntryIds) ? line.sourceEntryIds : [];
    return Object.freeze({
        key: line.key,
        labelKey: `erpDre.lines.${line.key}`,
        labelFallback: line.label,
        amountText: formatMoney(line.amount, currency, locale),
        amount: line.amount,
        emphasis: line.emphasis === true,
        hasDrilldown: accountIds.length > 0 || sourceEntryIds.length > 0,
        accountIds: Object.freeze([...accountIds]),
        sourceEntryIds: Object.freeze([...sourceEntryIds]),
    });
}

/**
 * Build the render-ready view-model from an income statement (MI-5).
 *
 * @param statement - The income statement produced by `buildIncomeStatement`.
 * @param options - Currency/locale and an optional EBITDA reconciliation.
 * @returns A frozen {@link StatementReportVM} (the renderer does no arithmetic).
 */
export function buildStatementReportVM(
    statement: IncomeStatement,
    options: StatementReportVMOptions = {},
): StatementReportVM {
    const currency = options.currency ?? 'BRL';
    const locale = options.locale ?? 'pt-BR';
    const lines = (statement.lines ?? []).map((l) => lineToVM(l, currency, locale));
    const reconciliation: ReconciliationStepVM[] = (options.ebitda?.reconciliation ?? []).map(
        (step) =>
            Object.freeze({
                labelFallback: step.label,
                amountText: formatMoney(step.amount, currency, locale),
                amount: step.amount,
            }),
    );
    return Object.freeze({
        standard: statement.standard,
        currency,
        titleKey: 'erpDre.title',
        reconciliationTitleKey: 'erpDre.reconciliation',
        drilldownLabelKey: 'erpDre.drilldown',
        standardOptions: Object.freeze(
            ALL_STANDARDS.map((id) =>
                Object.freeze({ id, selected: id === statement.standard }),
            ),
        ),
        lines: Object.freeze(lines),
        netIncome: statement.netIncome,
        netIncomeText: formatMoney(statement.netIncome, currency, locale),
        reconciliation: Object.freeze(reconciliation),
    });
}
