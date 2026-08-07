// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * ECBT Score adapter — pure logic (ERP-DRE-001 §4.1, M7, RF-8).
 *
 * Converts an income statement (and, optionally, the ledger of balance-sheet
 * accounts) into `FinancialEntry[]` consumable by `core/ecbtScore`
 * (`_ecbtScorePure.computeEcbtScore`), so the ECBT Score's V_net = Σassets −
 * Σliabilities becomes traceable down to the journal entries.
 *
 * Reuses the `FinancialEntry` / `Currency` types from `core/ecbtScore` — never
 * redefines them. Pure — no DOM, no I/O.
 */

import type { FinancialEntry, Currency } from '../ecbtScore/_ecbtScorePure.js';
import type { IncomeStatement } from './_incomeStatementPure.js';
import type { AccountBalance } from './_ledgerPure.js';

export interface ScoreEntries {
    /** Asset-side entries (ativo balances + a positive net result). */
    readonly assets: readonly FinancialEntry[];
    /** Liability-side entries (passivo balances + a negative net result). */
    readonly liabilities: readonly FinancialEntry[];
    /** The period's net income (positive = profit, negative = loss). */
    readonly netResult: number;
}

/**
 * Build `FinancialEntry[]` from an income statement's net result. A profit goes
 * to `assets` (it increases net worth); a loss goes to `liabilities`. The entry
 * carries a provenance `label`. Optionally include ativo/passivo balances from a
 * ledger so the full V_net (not just the result) is traceable.
 *
 * @param statement - The income statement (provides `netIncome`).
 * @param options - Optional `currency`, and `ledger` whose ativo/passivo
 *   balances are emitted as additional traceable entries.
 * @returns A frozen `{ assets, liabilities, netResult }`.
 */
export function toFinancialEntries(
    statement: IncomeStatement,
    options: {
        currency?: Currency;
        ledger?: ReadonlyMap<string, AccountBalance>;
    } = {},
): ScoreEntries {
    const currency: Currency = options.currency ?? 'BRL';
    const assets: FinancialEntry[] = [];
    const liabilities: FinancialEntry[] = [];

    // Balance-sheet balances from the ledger (if supplied) → traceable V_net.
    if (options.ledger) {
        for (const bal of options.ledger.values()) {
            if (bal.rootType === 'ativo' && bal.balance !== 0) {
                assets.push(
                    Object.freeze({
                        value: bal.balance,
                        currency,
                        label: `erp:ativo:${bal.accountId}`,
                    }),
                );
            } else if (bal.rootType === 'passivo' && bal.balance !== 0) {
                liabilities.push(
                    Object.freeze({
                        value: bal.balance,
                        currency,
                        label: `erp:passivo:${bal.accountId}`,
                    }),
                );
            }
        }
    }

    // The period result: profit → asset; loss → liability (absolute magnitude).
    const netResult = statement.netIncome;
    if (netResult > 0) {
        assets.push(
            Object.freeze({
                value: netResult,
                currency,
                label: `erp:resultado:${statement.standard}`,
            }),
        );
    } else if (netResult < 0) {
        liabilities.push(
            Object.freeze({
                value: Math.abs(netResult),
                currency,
                label: `erp:resultado:${statement.standard}`,
            }),
        );
    }

    return Object.freeze({
        assets: Object.freeze(assets),
        liabilities: Object.freeze(liabilities),
        netResult,
    });
}
