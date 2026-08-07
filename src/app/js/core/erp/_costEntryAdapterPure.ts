// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Cost-entry adapter — pure logic (ERP-DRE-001 §11.4, MI-1).
 *
 * THE bridge piece that wires the existing cost engine
 * (`core/analytics/economics/costRollup` → `buildCostRollup`) into the ERP
 * double-entry ledger, so the ECBT Score can read its liability side from the
 * accounting chain instead of a second, parallel adapter. This is the ONLY new
 * logic the integration needs — every downstream module (`_ledgerPure`,
 * `_incomeStatementPure`, `_ecbtScoreAdapterPure`) already exists and is tested.
 *
 * Single, non-duplicating data path (§11.4 "Caminho único de dados"):
 *   element.data.costs[] → buildCostRollup() → [THIS] costRollupToJournalEntries()
 *   → buildLedger() → buildIncomeStatement('BR-DRE') → toFinancialEntries()
 *   → computeEcbtScore() → V_net
 *
 * Accounting rule (§11.4 + CPC 26):
 *   - OPEX → debit an EXPENSE account (D.x, by category) → flows to the DRE.
 *   - CAPEX → debit Imobilizado (A.3, an ASSET) → does NOT hit the DRE directly
 *     (it is capitalised; depreciation, if any, is a separate posting).
 *   - Credit side: Caixa (A.1) when `basis='actual'` (cash paid), or
 *     Fornecedores (P.1) when `basis='budgeted'` (accrued/not-yet-paid) — the
 *     latter is also the default when cash granularity is unknown.
 *
 * Pure — no DOM, no I/O. All returned objects are frozen (immutable).
 */

import {
    inferCostRollupScope,
    type EcbtFinancialScopeTag,
} from '../ecbtScore/_financialScopePure.js';
// eslint-disable-next-line
import type { Account } from './_chartOfAccountsPure.js';
import type { JournalEntry, Posting } from './_journalPure.js';

/** Default ledger accounts; override any of these via {@link AdapterAccounts}. */
export const DEFAULT_ACCOUNTS = Object.freeze({
    /** Cash / equivalents (credit when paid in cash). */
    cash: 'A.1',
    /** Fixed assets / Imobilizado (debit for CAPEX). */
    fixedAssets: 'A.3',
    /** Suppliers / Fornecedores (credit when accrued/budgeted). */
    suppliers: 'P.1',
    /** Default expense account when a category has no specific mapping. */
    expenseDefault: 'D.3',
});

/** Account-id overrides for the conversion. */
export interface AdapterAccounts {
    readonly cash?: string;
    readonly fixedAssets?: string;
    readonly suppliers?: string;
    readonly expenseDefault?: string;
    /** Optional category→expense-account overrides (merged over the defaults). */
    readonly byCategory?: Readonly<Record<string, string>>;
}

/** Options accepted by {@link costRollupToJournalEntries}. */
export interface CostEntryAdapterOptions {
    /**
     * Inclusive fiscal-year window: only `costs[]` rows whose `fiscalYear` is in
     * `[from, to]` are converted. Omitting `period` converts every row.
     */
    readonly period?: { readonly from?: number | string; readonly to?: number | string };
    /**
     * `'actual'` → credit Caixa (A.1, cash already paid);
     * `'budgeted'` (default) → credit Fornecedores (P.1, accrued/not-yet-paid).
     */
    readonly basis?: 'actual' | 'budgeted';
    /** Account-id overrides. */
    readonly accounts?: AdapterAccounts;
}

/** Minimal shape of a single item inside a cost row (`costs[].items[]`). */
interface RollupCostItem {
    readonly categoryId?: string;
    readonly itemId?: string;
    readonly amount?: number;
}

/** Minimal shape of one `byElement[id].costs[]` row. */
interface RollupCostRow {
    readonly fiscalYear?: number | string;
    readonly capexTotal?: number;
    readonly opexTotal?: number;
    readonly items?: readonly RollupCostItem[];
}

/** Minimal shape of `buildCostRollup()` output consumed here. */
export interface CostRollupLike {
    readonly byElement?: Readonly<
        Record<string, { readonly name?: string; readonly costs?: readonly RollupCostRow[] }>
    >;
    readonly byCostCenter?: Readonly<Record<string, unknown>>;
    readonly grandTotal?: number;
}

/**
 * Category → expense-account (D.x) map. The cost rollup tags items with a coarse
 * `categoryId` (`'capex'` / `'opex'`) and a granular `itemId`; both are accepted
 * here so the helper degrades gracefully. Unknown keys fall back to the admin
 * default. CAPEX never resolves here (it is routed to Imobilizado upstream).
 */
const CATEGORY_TO_EXPENSE: Readonly<Record<string, string>> = Object.freeze({
    // Granular OPEX item ids → DRE expense lines.
    analytical: 'D.1', // CMV/CPV/CSV (cost of the analytical service)
    sampling: 'D.1',
    maintenance: 'D.3', // admin
    travel: 'D.2', // selling/mobilisation
    logistics: 'D.2',
    reporting: 'D.3',
    // Coarse category id → admin by default (OPEX bucket with no item detail).
    opex: 'D.3',
});

function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Resolve the debit expense account for a cost category (RF-1 mapping helper).
 *
 * @param categoryId - The cost category or item id (e.g. `'opex'`, `'analytical'`).
 * @param accounts - Optional account-id overrides (`expenseDefault`, `byCategory`).
 * @returns The id of a D.x expense account; never empty (defaults to admin/D.3).
 */
export function costCategoryToAccountId(
    categoryId: string | undefined,
    accounts: AdapterAccounts = {},
): string {
    const fallback = accounts.expenseDefault ?? DEFAULT_ACCOUNTS.expenseDefault;
    if (typeof categoryId !== 'string' || categoryId.length === 0) return fallback;
    const override = accounts.byCategory?.[categoryId];
    if (typeof override === 'string' && override.length > 0) return override;
    return CATEGORY_TO_EXPENSE[categoryId] ?? fallback;
}

/** Coerce a fiscal-year-like value to a finite number, or NaN. */
function toYearNumber(value: number | string | undefined): number {
    if (isFiniteNumber(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
}

/** Whether a fiscal year falls inside the (inclusive) period filter. */
function inPeriod(fy: number | string | undefined, period?: CostEntryAdapterOptions['period']): boolean {
    if (!period) return true;
    const year = toYearNumber(fy);
    if (!Number.isFinite(year)) return false;
    const from = period.from !== undefined ? toYearNumber(period.from) : -Infinity;
    const to = period.to !== undefined ? toYearNumber(period.to) : Infinity;
    return year >= from && year <= to;
}

/**
 * Pick the dominant expense category of a cost row from its OPEX items, so the
 * (single) OPEX debit lands on the most representative D.x account. Falls back
 * to the coarse `'opex'` bucket when no item detail is present.
 */
function dominantExpenseCategory(row: RollupCostRow): string {
    const items = Array.isArray(row.items) ? row.items : [];
    const byAccount = new Map<string, number>();
    for (const item of items) {
        if (item?.categoryId !== 'opex') continue;
        const amount = isFiniteNumber(item.amount) ? item.amount : 0;
        if (amount <= 0) continue;
        const key = item.itemId ?? 'opex';
        byAccount.set(key, (byAccount.get(key) ?? 0) + amount);
    }
    let best = 'opex';
    let bestAmount = -1;
    for (const [key, amount] of byAccount) {
        if (amount > bestAmount) {
            best = key;
            bestAmount = amount;
        }
    }
    return best;
}

function dominantCapexCategory(row: RollupCostRow): string {
    const items = Array.isArray(row.items) ? row.items : [];
    const byItem = new Map<string, number>();
    for (const item of items) {
        if (item?.categoryId !== 'capex') continue;
        const amount = isFiniteNumber(item.amount) ? item.amount : 0;
        if (amount <= 0) continue;
        const key = item.itemId ?? 'capex';
        byItem.set(key, (byItem.get(key) ?? 0) + amount);
    }
    let best = 'capex';
    let bestAmount = -1;
    for (const [key, amount] of byItem) {
        if (amount > bestAmount) {
            best = key;
            bestAmount = amount;
        }
    }
    return best;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

/**
 * Convert a cost rollup into balanced double-entry journal entries (MI-1, RF-2).
 *
 * For every `byElement[id].costs[]` row whose `fiscalYear` is inside `period`,
 * up to two entries are produced:
 *   - an OPEX entry (if `opexTotal > 0`): debit an expense account (D.x by
 *     category), credit Caixa/Fornecedores per `basis`;
 *   - a CAPEX entry (if `capexTotal > 0`): debit Imobilizado (A.3, asset),
 *     credit Caixa/Fornecedores per `basis`.
 *
 * Each entry's `date` is inferred as `'<fiscalYear>-12-31'`, `costCenterId` is
 * taken from the rollup cost-center map when unambiguous, and `memo` is the
 * element name. Every entry is balanced (Σdebit === Σcredit) and frozen.
 *
 * Closing guarantee: Σ(expense + Imobilizado debits) over the produced entries
 * equals Σ(opexTotal + capexTotal) of the in-period rows — i.e. the rollup's
 * period total, neither lost nor duplicated.
 *
 * @param rollup - Output of `buildCostRollup()` (or a compatible subset).
 * @param opts - Period filter, posting basis, and account-id overrides.
 * @returns A frozen array of frozen {@link JournalEntry} objects.
 */
export function costRollupToJournalEntries(
    rollup: CostRollupLike | null | undefined,
    opts: CostEntryAdapterOptions = {},
): readonly JournalEntry[] {
    const entries: JournalEntry[] = [];
    if (!rollup || typeof rollup !== 'object' || !rollup.byElement) {
        return Object.freeze(entries);
    }

    const accounts = opts.accounts ?? {};
    const cashAcc = accounts.cash ?? DEFAULT_ACCOUNTS.cash;
    const fixedAcc = accounts.fixedAssets ?? DEFAULT_ACCOUNTS.fixedAssets;
    const supplierAcc = accounts.suppliers ?? DEFAULT_ACCOUNTS.suppliers;
    const creditAcc = opts.basis === 'actual' ? cashAcc : supplierAcc;

    // A single cost center applies only when the rollup unambiguously has one.
    const ccIds = rollup.byCostCenter ? Object.keys(rollup.byCostCenter).filter((id) => id !== '_unassigned') : [];
    const soleCostCenterId = ccIds.length === 1 ? ccIds[0] : undefined;

    const elementIds = Object.keys(rollup.byElement);
    for (const elementId of elementIds) {
        const element = rollup.byElement[elementId];
        const costs = Array.isArray(element?.costs) ? element.costs : [];
        const memo = element?.name ?? elementId;

        for (let rowIndex = 0; rowIndex < costs.length; rowIndex += 1) {
            const row = costs[rowIndex];
            if (!row || !inPeriod(row.fiscalYear, opts.period)) continue;
            const year = toYearNumber(row.fiscalYear);
            const date = Number.isFinite(year) ? `${year}-12-31` : '1970-12-31';
            const opex = isFiniteNumber(row.opexTotal) ? round2(row.opexTotal) : 0;
            const capex = isFiniteNumber(row.capexTotal) ? round2(row.capexTotal) : 0;

            const ccSpread =
                soleCostCenterId !== undefined ? { costCenterId: soleCostCenterId } : {};

            // OPEX → expense (DRE). Credit Caixa/Fornecedores.
            if (opex > 0) {
                const itemId = dominantExpenseCategory(row);
                const expenseAcc = costCategoryToAccountId(itemId, accounts);
                entries.push(
                    makeEntry({
                        id: `cost:${elementId}:${rowIndex}:opex`,
                        date,
                        memo,
                        ...ccSpread,
                        debitAccount: expenseAcc,
                        creditAccount: creditAcc,
                        amount: opex,
                        ecbtScope: inferCostRollupScope({ costNature: 'opex', itemId }),
                    }),
                );
            }

            // CAPEX → Imobilizado (asset, NOT the DRE). Credit Caixa/Fornecedores.
            if (capex > 0) {
                const itemId = dominantCapexCategory(row);
                entries.push(
                    makeEntry({
                        id: `cost:${elementId}:${rowIndex}:capex`,
                        date,
                        memo,
                        ...ccSpread,
                        debitAccount: fixedAcc,
                        creditAccount: creditAcc,
                        amount: capex,
                        ecbtScope: inferCostRollupScope({ costNature: 'capex', itemId }),
                    }),
                );
            }
        }
    }

    return Object.freeze(entries);
}

/** Build one balanced, frozen 2-posting journal entry (debit/credit, equal). */
function makeEntry(spec: {
    id: string;
    date: string;
    memo: string;
    costCenterId?: string;
    debitAccount: string;
    creditAccount: string;
    amount: number;
    ecbtScope?: EcbtFinancialScopeTag;
}): JournalEntry {
    const postings: readonly Posting[] = Object.freeze([
        Object.freeze({ accountId: spec.debitAccount, debit: spec.amount, credit: 0 }) as Posting,
        Object.freeze({ accountId: spec.creditAccount, debit: 0, credit: spec.amount }) as Posting,
    ]);
    const entry: JournalEntry = {
        id: spec.id,
        date: spec.date,
        postings,
        memo: spec.memo,
        ...(spec.costCenterId !== undefined ? { costCenterId: spec.costCenterId } : {}),
        ...(spec.ecbtScope !== undefined ? { ecbtScope: spec.ecbtScope } : {}),
        posted: true,
    };
    return Object.freeze(entry);
}
