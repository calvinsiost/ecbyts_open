// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Ledger (razão) — pure logic (ERP-DRE-001 §4.1, M4).
 *
 * Aggregates the postings of a set of journal entries within a period into a
 * per-account balance, respecting the natural side of each `rootType`:
 *
 *   - ativo / despesa      → debit-normal  (balance = Σdebit − Σcredit)
 *   - passivo / patrimonio / receita → credit-normal (balance = Σcredit − Σdebit)
 *
 * The returned balance is therefore the "natural" positive magnitude of the
 * account in its own root convention. Pure — no DOM, no I/O.
 */

import type { EcbtFinancialScopeTag } from '../ecbtScore/_financialScopePure.js';
import type { Account, RootType } from './_chartOfAccountsPure.js';
import type { JournalEntry } from './_journalPure.js';

export interface Period {
    /** Inclusive ISO-8601 start date. */
    readonly start: string;
    /** Inclusive ISO-8601 end date. */
    readonly end: string;
}

export interface AccountBalance {
    readonly accountId: string;
    readonly rootType: RootType;
    /** Σ debits posted to the account in the period. */
    readonly totalDebit: number;
    /** Σ credits posted to the account in the period. */
    readonly totalCredit: number;
    /** Natural balance in the account's root convention (always sign-correct). */
    readonly balance: number;
    /** Ids of the journal entries that contributed (provenance → drilldown). */
    readonly sourceEntryIds: readonly string[];
    readonly sourceScopes?: readonly EcbtFinancialScopeTag[];
}

const DEBIT_NORMAL: ReadonlySet<RootType> = new Set<RootType>(['ativo', 'despesa']);

/**
 * Whether a root type is debit-normal (asset/expense) vs credit-normal.
 *
 * @param rootType - The account root type.
 * @returns true for ativo/despesa; false otherwise.
 */
export function isDebitNormal(rootType: RootType): boolean {
    return DEBIT_NORMAL.has(rootType);
}

/**
 * Whether an entry's date falls inside the (inclusive) period.
 * String ISO comparison is lexicographically correct for well-formed dates.
 */
function inPeriod(date: string, period: Period): boolean {
    return date >= period.start && date <= period.end;
}

/**
 * Build the ledger: aggregate postings by account for entries whose date is in
 * the period, computing each account's natural balance (RF / §B).
 *
 * Entries with a `date` outside the period are ignored. Accounts with no
 * postings in the period are absent from the result map.
 *
 * @param entries - The posted journal entries.
 * @param accounts - The chart of accounts (array or Map) for root-type lookup.
 * @param period - The inclusive ISO-8601 date window.
 * @returns A `Map<accountId, AccountBalance>` (the map itself is frozen).
 */
export function buildLedger(
    entries: readonly JournalEntry[],
    accounts: readonly Account[] | ReadonlyMap<string, Account>,
    period: Period,
): ReadonlyMap<string, AccountBalance> {
    const byId =
        accounts instanceof Map
            ? accounts
            : new Map((accounts as readonly Account[]).map((a) => [a.id, a]));

    interface Acc {
        totalDebit: number;
        totalCredit: number;
        sourceEntryIds: Set<string>;
        sourceScopes: EcbtFinancialScopeTag[];
    }
    const accum = new Map<string, Acc>();

    for (const entry of entries) {
        if (!inPeriod(entry.date, period)) continue;
        for (const p of entry.postings) {
            let row = accum.get(p.accountId);
            if (!row) {
                row = {
                    totalDebit: 0,
                    totalCredit: 0,
                    sourceEntryIds: new Set(),
                    sourceScopes: [],
                };
                accum.set(p.accountId, row);
            }
            row.totalDebit += Number(p.debit) || 0;
            row.totalCredit += Number(p.credit) || 0;
            row.sourceEntryIds.add(entry.id);
            if (entry.ecbtScope) {
                row.sourceScopes.push(entry.ecbtScope);
            }
        }
    }

    const result = new Map<string, AccountBalance>();
    for (const [accountId, row] of accum) {
        const rootType = byId.get(accountId)?.rootType ?? 'ativo';
        const balance = isDebitNormal(rootType)
            ? row.totalDebit - row.totalCredit
            : row.totalCredit - row.totalDebit;
        result.set(
            accountId,
            Object.freeze({
                accountId,
                rootType,
                totalDebit: row.totalDebit,
                totalCredit: row.totalCredit,
                balance,
                sourceEntryIds: Object.freeze([...row.sourceEntryIds]),
                sourceScopes: Object.freeze(row.sourceScopes),
            }),
        );
    }
    return result;
}
