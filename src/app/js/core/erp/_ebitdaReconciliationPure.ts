// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * EBITDA / LAJIDA reconciliation — pure logic (ERP-DRE-001 §4.1, M6, RF-6).
 *
 * Derived (non-GAAP / non-contábil) metric built as a VISIBLE reconciliation
 * that STARTS from net income and adds back taxes, the net financial result and
 * depreciation/amortization:
 *
 *   EBITDA = net income + income taxes − net financial result + D&A
 *
 * (Subtracting the net financial *result* removes financial income and adds
 * back financial expense — equivalent to "+ interest expense − interest income".)
 *
 * Regulatory anchors per standard:
 *   - BR-DRE         → Resolução CVM 156/2022 (LAJIDA, reconciliation mandatory).
 *   - IFRS-IAS1      → APM/ESMA guidelines (Alternative Performance Measure).
 *   - US-GAAP-ASC220 → SEC Reg G (non-GAAP measure, reconciliation to net income).
 *
 * Pure — no DOM, no I/O. Output is frozen.
 */

import type { StandardId } from './_statementStandards.js';
import type { IncomeStatement } from './_incomeStatementPure.js';

export interface ReconciliationStep {
    readonly label: string;
    readonly amount: number;
}

export interface EbitdaResult {
    readonly standard: StandardId;
    readonly ebitda: number;
    readonly reconciliation: readonly ReconciliationStep[];
}

/** Resolve the net-income amount for each supported standard's net line key. */
const NET_INCOME_KEYS: Readonly<Record<StandardId, string>> = Object.freeze({
    'BR-DRE': 'resultadoLiquido',
    'IFRS-IAS1': 'profitForPeriod',
    'US-GAAP-ASC220': 'netIncome',
});

/** Per-standard keys for the add-back lines used in the reconciliation. */
const ADDBACK_KEYS: Readonly<
    Record<StandardId, { tax: string; finance: string }>
> = Object.freeze({
    'BR-DRE': { tax: 'irCsll', finance: 'resultadoFinanceiro' },
    'IFRS-IAS1': { tax: 'taxExpense', finance: '' },
    'US-GAAP-ASC220': { tax: 'incomeTaxExpense', finance: '' },
});

function lineAmount(statement: IncomeStatement, key: string): number {
    if (!key) return 0;
    const line = statement.lines.find((l) => l.key === key);
    return line ? line.amount : 0;
}

/**
 * Compute the net financial result for a statement: financial income (positive)
 * plus financial expense (negative). BR exposes it as a single subtotal
 * (`resultadoFinanceiro`); IFRS/US split it into income + cost lines.
 */
function netFinancialResult(statement: IncomeStatement, standard: StandardId): number {
    if (standard === 'BR-DRE') {
        return lineAmount(statement, 'resultadoFinanceiro');
    }
    if (standard === 'IFRS-IAS1') {
        return lineAmount(statement, 'financeIncome') + lineAmount(statement, 'financeCosts');
    }
    // US-GAAP-ASC220
    return lineAmount(statement, 'interestIncome') + lineAmount(statement, 'interestExpense');
}

/**
 * Compute EBITDA/LAJIDA with a reconciliation that starts from net income
 * (RF-6). Depreciation/amortization is supplied by the caller (it is not a
 * face line in any standard — it lives inside operating expenses).
 *
 * @param statement - The income statement produced by `buildIncomeStatement`.
 * @param standard - The standard id (must match `statement.standard`).
 * @param options - `{ depreciationAmortization }` add-back (default 0). Callers
 *   typically pass the period balance of the D&A account (e.g. 'D.4').
 * @returns A frozen `{ standard, ebitda, reconciliation }`.
 */
export function computeEbitda(
    statement: IncomeStatement,
    standard: StandardId,
    options: { depreciationAmortization?: number } = {},
): EbitdaResult {
    const netIncomeKey = NET_INCOME_KEYS[standard];
    const netIncome = lineAmount(statement, netIncomeKey);
    const taxAmount = lineAmount(statement, ADDBACK_KEYS[standard].tax); // already negative
    const finResult = netFinancialResult(statement, standard);
    const da = Number(options.depreciationAmortization) || 0;

    // net income is AFTER taxes (a subtraction) and AFTER the financial result.
    // To reach EBITDA we ADD BACK taxes (remove the negative tax line → +|tax|)
    // and REMOVE the financial result (−finResult), then ADD BACK D&A.
    const addBackTax = -taxAmount; // taxAmount is ≤ 0 → add-back is ≥ 0
    const removeFinancial = -finResult;
    const ebitda = netIncome + addBackTax + removeFinancial + da;

    const reconciliation: ReconciliationStep[] = [
        { label: 'Resultado Líquido (base)', amount: netIncome },
        { label: '(+) IR/CSLL (impostos)', amount: addBackTax },
        { label: '(−) Resultado Financeiro líquido', amount: removeFinancial },
        { label: '(+) Depreciação e Amortização', amount: da },
        { label: '= EBITDA / LAJIDA', amount: ebitda },
    ];

    return Object.freeze({
        standard,
        ebitda,
        reconciliation: Object.freeze(reconciliation),
    });
}
