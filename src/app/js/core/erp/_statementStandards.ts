// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Statement standards — TABLE of the three line-by-line mappings
 * (ERP-DRE-001 §1.4). Data, not code: the income-statement engine
 * (`_incomeStatementPure.ts`) is table-driven over this structure, so adding a
 * standard means adding a row set here, never an `if/else` per standard.
 *
 *   - BR-DRE          → Lei 6.404/76 Art. 187 + CPC 26 (begins at GROSS revenue)
 *   - IFRS-IAS1       → IAS 1 Statement of P&L, by function (begins at NET revenue)
 *   - US-GAAP-ASC220  → ASC 220 multi-step (Net sales → COGS → Gross profit → …)
 *
 * Each line is either:
 *   - a `projection` line: sums account balances selected by a predicate over
 *     the THREE account dimensions (rootType / function / nature / ifrsCategory);
 *   - a `subtotal` line: a running/derived total computed from earlier lines.
 *
 * Pure data + small pure selector predicates. No DOM, no I/O.
 */

import type { RootType, AccountFunction, IfrsCategory } from './_chartOfAccountsPure.js';

/** Identifier of a standard. */
export type StandardId = 'BR-DRE' | 'IFRS-IAS1' | 'US-GAAP-ASC220';

/** Selector over account dimensions used by a projection line. */
export interface AccountSelector {
    readonly rootType?: RootType;
    /** Match any of these functions (P&L by-function). */
    readonly functions?: readonly AccountFunction[];
    /** Match this IFRS 18 category. */
    readonly ifrsCategory?: IfrsCategory;
    /** Exclude accounts matching these ids (escape hatch for special lines). */
    readonly excludeAccountIds?: readonly string[];
    /** Include ONLY these account ids (when a line maps to specific accounts). */
    readonly onlyAccountIds?: readonly string[];
}

export type LineKind = 'projection' | 'subtotal';

/** How a subtotal combines earlier lines: each ref adds (+1) or subtracts (−1). */
export interface SubtotalTerm {
    readonly lineKey: string;
    readonly sign: 1 | -1;
}

export interface StatementLineSpec {
    /** Stable key (shared across standards where semantically equal). */
    readonly key: string;
    /** Human-readable English label (UI uses i18n keys; this is a fallback). */
    readonly label: string;
    readonly kind: LineKind;
    /** Whether the line is a bold/emphasised subtotal in the face. */
    readonly emphasis?: boolean;
    /** For `projection` lines: how account balances are selected. */
    readonly selector?: AccountSelector;
    /**
     * Sign applied to the projected magnitude when accumulating into the
     * statement (e.g. deductions/expenses subtract → −1). Default +1.
     */
    readonly projectionSign?: 1 | -1;
    /** For `subtotal` lines: which earlier lines to combine. */
    readonly terms?: readonly SubtotalTerm[];
}

export interface StatementStandard {
    readonly id: StandardId;
    readonly label: string;
    /** Ordered list of lines from top of statement to net income. */
    readonly lines: readonly StatementLineSpec[];
    /** Key of the line that equals net income / profit for the period. */
    readonly netIncomeKey: string;
    /**
     * Citable provenance of the standard (CFG-19 + spec guard-rail §2.4.0 #5).
     *
     * REQUIRED, not optional, and that is the point: the provenance used to live
     * in this file's header comment, where a fourth standard could be added
     * without one and nobody would notice. As a required field the compiler
     * refuses an uncited standard, so "each plan declares where it comes from"
     * is enforced instead of merely documented. Never ''.
     */
    readonly source: string;
}

// ---------------------------------------------------------------------------
// Shared selectors (built once, reused across standards).
// ---------------------------------------------------------------------------

const SEL_GROSS_REVENUE: AccountSelector = {
    rootType: 'receita',
    ifrsCategory: 'operating',
};
const SEL_DEDUCTIONS: AccountSelector = {
    rootType: 'despesa',
    onlyAccountIds: ['D.0'],
};
const SEL_COGS: AccountSelector = {
    rootType: 'despesa',
    functions: ['cost_of_sales'],
};
const SEL_SELLING: AccountSelector = {
    rootType: 'despesa',
    functions: ['selling'],
};
const SEL_ADMIN: AccountSelector = {
    rootType: 'despesa',
    functions: ['admin'],
};
const SEL_FINANCE_EXPENSE: AccountSelector = {
    rootType: 'despesa',
    ifrsCategory: 'financing',
};
const SEL_FINANCE_INCOME: AccountSelector = {
    rootType: 'receita',
    ifrsCategory: 'financing',
};
const SEL_TAX: AccountSelector = {
    rootType: 'despesa',
    onlyAccountIds: ['D.9'],
};

// ---------------------------------------------------------------------------
// BR-DRE (Lei 6.404/76 Art. 187 + CPC 26) — begins at GROSS revenue.
// ---------------------------------------------------------------------------

const BR_DRE: StatementStandard = {
    id: 'BR-DRE',
    label: 'Demonstração do Resultado do Exercício',
    netIncomeKey: 'resultadoLiquido',
    source:
        'Lei nº 6.404/1976, Art. 187 (Demonstração do Resultado do Exercício) — ' +
        'https://www.planalto.gov.br/ccivil_03/leis/l6404consol.htm · ' +
        'CPC 26 (R1) — Apresentação das Demonstrações Contábeis — ' +
        'http://www.cpc.org.br/CPC/Documentos-Emitidos/Pronunciamentos',
    lines: [
        { key: 'receitaBruta', label: 'Receita Bruta', kind: 'projection', selector: SEL_GROSS_REVENUE, projectionSign: 1 },
        { key: 'deducoes', label: '(−) Deduções', kind: 'projection', selector: SEL_DEDUCTIONS, projectionSign: -1 },
        { key: 'receitaLiquida', label: 'Receita Líquida', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'receitaBruta', sign: 1 },
            { lineKey: 'deducoes', sign: 1 },
        ] },
        { key: 'cmv', label: '(−) CMV/CPV/CSV', kind: 'projection', selector: SEL_COGS, projectionSign: -1 },
        { key: 'lucroBruto', label: 'Lucro Bruto', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'receitaLiquida', sign: 1 },
            { lineKey: 'cmv', sign: 1 },
        ] },
        { key: 'despesasVendas', label: '(−) Despesas com Vendas', kind: 'projection', selector: SEL_SELLING, projectionSign: -1 },
        { key: 'despesasAdmin', label: '(−) Despesas Administrativas', kind: 'projection', selector: SEL_ADMIN, projectionSign: -1 },
        { key: 'ebit', label: 'Resultado Operacional (EBIT)', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'lucroBruto', sign: 1 },
            { lineKey: 'despesasVendas', sign: 1 },
            { lineKey: 'despesasAdmin', sign: 1 },
        ] },
        { key: 'receitasFinanceiras', label: 'Receitas Financeiras', kind: 'projection', selector: SEL_FINANCE_INCOME, projectionSign: 1 },
        { key: 'despesasFinanceiras', label: '(−) Despesas Financeiras', kind: 'projection', selector: SEL_FINANCE_EXPENSE, projectionSign: -1 },
        { key: 'resultadoFinanceiro', label: '(±) Resultado Financeiro', kind: 'subtotal', terms: [
            { lineKey: 'receitasFinanceiras', sign: 1 },
            { lineKey: 'despesasFinanceiras', sign: 1 },
        ] },
        { key: 'lair', label: 'Resultado antes dos Tributos (LAIR)', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'ebit', sign: 1 },
            { lineKey: 'resultadoFinanceiro', sign: 1 },
        ] },
        { key: 'irCsll', label: '(−) IR e CSLL', kind: 'projection', selector: SEL_TAX, projectionSign: -1 },
        { key: 'resultadoLiquido', label: 'Resultado Líquido', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'lair', sign: 1 },
            { lineKey: 'irCsll', sign: 1 },
        ] },
    ],
};

// ---------------------------------------------------------------------------
// IFRS-IAS1 (Statement of P&L, by function) — begins at NET revenue.
// ---------------------------------------------------------------------------

const IFRS_IAS1: StatementStandard = {
    id: 'IFRS-IAS1',
    label: 'Statement of Profit or Loss (IAS 1)',
    netIncomeKey: 'profitForPeriod',
    source:
        'IAS 1 Presentation of Financial Statements — statement of profit or loss, ' +
        'expenses analysed BY FUNCTION — ' +
        'https://www.ifrs.org/issued-standards/list-of-standards/ias-1-presentation-of-financial-statements/ · ' +
        'NOTE: IFRS 18 (Presentation and Disclosure in Financial Statements, issued 2024) ' +
        'supersedes IAS 1 for periods beginning on/after 2027-01-01; this row set is the ' +
        'IAS 1 face and will need its own IFRS-18 sibling rather than an edit in place.',
    lines: [
        // Revenue is already net of deductions on the IFRS face: gross − deductions.
        { key: 'grossRevenue', label: 'Gross revenue', kind: 'projection', selector: SEL_GROSS_REVENUE, projectionSign: 1 },
        { key: 'deductions', label: '(−) Deductions', kind: 'projection', selector: SEL_DEDUCTIONS, projectionSign: -1 },
        { key: 'revenue', label: 'Revenue', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'grossRevenue', sign: 1 },
            { lineKey: 'deductions', sign: 1 },
        ] },
        { key: 'costOfSales', label: '(−) Cost of sales', kind: 'projection', selector: SEL_COGS, projectionSign: -1 },
        { key: 'grossProfit', label: 'Gross profit', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'revenue', sign: 1 },
            { lineKey: 'costOfSales', sign: 1 },
        ] },
        { key: 'distributionCosts', label: '(−) Distribution costs', kind: 'projection', selector: SEL_SELLING, projectionSign: -1 },
        { key: 'adminExpenses', label: '(−) Administrative expenses', kind: 'projection', selector: SEL_ADMIN, projectionSign: -1 },
        { key: 'operatingProfit', label: 'Operating profit', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'grossProfit', sign: 1 },
            { lineKey: 'distributionCosts', sign: 1 },
            { lineKey: 'adminExpenses', sign: 1 },
        ] },
        { key: 'financeIncome', label: 'Finance income', kind: 'projection', selector: SEL_FINANCE_INCOME, projectionSign: 1 },
        { key: 'financeCosts', label: '(−) Finance costs', kind: 'projection', selector: SEL_FINANCE_EXPENSE, projectionSign: -1 },
        { key: 'profitBeforeTax', label: 'Profit before tax', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'operatingProfit', sign: 1 },
            { lineKey: 'financeIncome', sign: 1 },
            { lineKey: 'financeCosts', sign: 1 },
        ] },
        { key: 'taxExpense', label: '(−) Income tax expense', kind: 'projection', selector: SEL_TAX, projectionSign: -1 },
        { key: 'profitForPeriod', label: 'Profit for the period', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'profitBeforeTax', sign: 1 },
            { lineKey: 'taxExpense', sign: 1 },
        ] },
    ],
};

// ---------------------------------------------------------------------------
// US-GAAP-ASC220 (multi-step) — Net sales → COGS → Gross profit → SG&A → …
// ---------------------------------------------------------------------------

const US_GAAP_ASC220: StatementStandard = {
    id: 'US-GAAP-ASC220',
    label: 'Income Statement (ASC 220, multi-step)',
    netIncomeKey: 'netIncome',
    source:
        'FASB ASC 220 — Income Statement—Reporting Comprehensive Income ' +
        '(multi-step presentation: Net sales → COGS → Gross profit → SG&A → Operating income) — ' +
        'https://asc.fasb.org/',
    lines: [
        { key: 'grossSales', label: 'Gross sales', kind: 'projection', selector: SEL_GROSS_REVENUE, projectionSign: 1 },
        { key: 'returnsDiscounts', label: '(−) Returns and discounts', kind: 'projection', selector: SEL_DEDUCTIONS, projectionSign: -1 },
        { key: 'netSales', label: 'Net sales', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'grossSales', sign: 1 },
            { lineKey: 'returnsDiscounts', sign: 1 },
        ] },
        { key: 'cogs', label: '(−) Cost of goods sold', kind: 'projection', selector: SEL_COGS, projectionSign: -1 },
        { key: 'grossProfit', label: 'Gross profit', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'netSales', sign: 1 },
            { lineKey: 'cogs', sign: 1 },
        ] },
        { key: 'sellingExpenses', label: '(−) Selling expenses', kind: 'projection', selector: SEL_SELLING, projectionSign: -1 },
        { key: 'generalAdmin', label: '(−) General & administrative', kind: 'projection', selector: SEL_ADMIN, projectionSign: -1 },
        { key: 'operatingIncome', label: 'Operating income', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'grossProfit', sign: 1 },
            { lineKey: 'sellingExpenses', sign: 1 },
            { lineKey: 'generalAdmin', sign: 1 },
        ] },
        { key: 'interestIncome', label: 'Interest and other income', kind: 'projection', selector: SEL_FINANCE_INCOME, projectionSign: 1 },
        { key: 'interestExpense', label: '(−) Interest and non-operating expense', kind: 'projection', selector: SEL_FINANCE_EXPENSE, projectionSign: -1 },
        { key: 'incomeBeforeTaxes', label: 'Income before taxes', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'operatingIncome', sign: 1 },
            { lineKey: 'interestIncome', sign: 1 },
            { lineKey: 'interestExpense', sign: 1 },
        ] },
        { key: 'incomeTaxExpense', label: '(−) Income tax expense', kind: 'projection', selector: SEL_TAX, projectionSign: -1 },
        { key: 'netIncome', label: 'Net income', kind: 'subtotal', emphasis: true, terms: [
            { lineKey: 'incomeBeforeTaxes', sign: 1 },
            { lineKey: 'incomeTaxExpense', sign: 1 },
        ] },
    ],
};

/**
 * The three reporting standards keyed by id (ERP-DRE-001 §1.4). Frozen.
 */
export const STANDARDS: Readonly<Record<StandardId, StatementStandard>> = Object.freeze({
    'BR-DRE': BR_DRE,
    'IFRS-IAS1': IFRS_IAS1,
    'US-GAAP-ASC220': US_GAAP_ASC220,
});

/**
 * Resolve a standard by id, throwing on an unknown id.
 *
 * @param id - The standard identifier.
 * @returns The {@link StatementStandard}.
 * @throws {RangeError} if the id is not one of the three known standards.
 */
export function getStandard(id: StandardId): StatementStandard {
    const std = STANDARDS[id];
    if (!std) {
        throw new RangeError(`getStandard: unknown standard "${id}"`);
    }
    return std;
}
