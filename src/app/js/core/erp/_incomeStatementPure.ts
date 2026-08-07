// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Income-statement engine — pure logic (ERP-DRE-001 §4.1, M5).
 *
 * MULTI-STANDARD: projects a single ledger onto the line structure of the
 * chosen standard (BR-DRE / IFRS-IAS1 / US-GAAP-ASC220) using the table in
 * `_statementStandards.ts`. The engine is table-driven (no per-standard
 * branching): it evaluates `projection` lines against the account dimensions
 * and `subtotal` lines as signed combinations of earlier lines.
 *
 * Pure — no DOM, no I/O. Output is frozen.
 */

import type { Account } from './_chartOfAccountsPure.js';
import type { AccountBalance } from './_ledgerPure.js';
import type {
    StandardId,
    StatementStandard,
    AccountSelector,
    StatementLineSpec,
} from './_statementStandards.js';
import { getStandard } from './_statementStandards.js';

export interface IncomeStatementLine {
    readonly key: string;
    readonly label: string;
    readonly amount: number;
    readonly emphasis: boolean;
    /** Ids of the journal entries behind this line (provenance → drilldown). */
    readonly accountIds: readonly string[];
    /** Ids of the source journal entries behind this line (drilldown). */
    readonly sourceEntryIds: readonly string[];
}

export interface IncomeStatement {
    readonly standard: StandardId;
    readonly lines: readonly IncomeStatementLine[];
    readonly netIncome: number;
}

type LedgerMap = ReadonlyMap<string, AccountBalance>;

/**
 * Whether a leaf account matches a selector across the three dimensions.
 */
function accountMatches(account: Account, sel: AccountSelector): boolean {
    if (sel.onlyAccountIds && !sel.onlyAccountIds.includes(account.id)) return false;
    if (sel.excludeAccountIds && sel.excludeAccountIds.includes(account.id)) return false;
    if (sel.rootType && account.rootType !== sel.rootType) return false;
    if (sel.functions && (!account.function || !sel.functions.includes(account.function))) {
        return false;
    }
    if (sel.ifrsCategory && account.ifrsCategory !== sel.ifrsCategory) return false;
    return true;
}

/**
 * Evaluate a projection line: sum the natural balances of matching leaf
 * accounts and apply the line's sign. Returns the signed amount + provenance.
 */
function evalProjection(
    spec: StatementLineSpec,
    ledger: LedgerMap,
    accountById: ReadonlyMap<string, Account>,
): { amount: number; accountIds: string[]; sourceEntryIds: string[] } {
    const sel = spec.selector as AccountSelector;
    const sign = spec.projectionSign ?? 1;
    let magnitude = 0;
    const accountIds: string[] = [];
    const sourceEntryIds = new Set<string>();
    for (const [accountId, bal] of ledger) {
        const account = accountById.get(accountId);
        if (!account) continue;
        if (!accountMatches(account, sel)) continue;
        magnitude += bal.balance;
        accountIds.push(accountId);
        for (const id of bal.sourceEntryIds) sourceEntryIds.add(id);
    }
    return { amount: sign * magnitude, accountIds, sourceEntryIds: [...sourceEntryIds] };
}

/**
 * Build the income statement for the chosen standard by projecting the ledger
 * onto the standard's ordered lines (RF-5).
 *
 * @param ledger - Per-account balances from `buildLedger`.
 * @param accounts - The chart of accounts (array or Map indexed by id).
 * @param standard - Standard id ('BR-DRE' | 'IFRS-IAS1' | 'US-GAAP-ASC220') or a
 *   pre-resolved {@link StatementStandard}.
 * @returns A frozen {@link IncomeStatement} with all lines and `netIncome`.
 */
export function buildIncomeStatement(
    ledger: LedgerMap,
    accounts: readonly Account[] | ReadonlyMap<string, Account>,
    standard: StandardId | StatementStandard,
): IncomeStatement {
    const std: StatementStandard =
        typeof standard === 'string' ? getStandard(standard) : standard;
    const accountById =
        accounts instanceof Map
            ? accounts
            : new Map((accounts as readonly Account[]).map((a) => [a.id, a]));

    const byKey = new Map<string, IncomeStatementLine>();
    const lines: IncomeStatementLine[] = [];

    for (const spec of std.lines) {
        let amount = 0;
        let accountIds: readonly string[];
        let sourceEntryIds: readonly string[];

        if (spec.kind === 'projection') {
            const p = evalProjection(spec, ledger, accountById);
            amount = p.amount;
            accountIds = p.accountIds;
            sourceEntryIds = p.sourceEntryIds;
        } else {
            // subtotal: signed combination of earlier lines.
            const accIds = new Set<string>();
            const srcIds = new Set<string>();
            for (const term of spec.terms ?? []) {
                const ref = byKey.get(term.lineKey);
                if (!ref) continue; // forward refs resolved when defined later
                amount += term.sign * ref.amount;
                for (const a of ref.accountIds) accIds.add(a);
                for (const s of ref.sourceEntryIds) srcIds.add(s);
            }
            accountIds = [...accIds];
            sourceEntryIds = [...srcIds];
        }

        const line: IncomeStatementLine = Object.freeze({
            key: spec.key,
            label: spec.label,
            amount,
            emphasis: spec.emphasis === true,
            accountIds: Object.freeze([...accountIds]),
            sourceEntryIds: Object.freeze([...sourceEntryIds]),
        });
        byKey.set(spec.key, line);
        lines.push(line);
    }

    const netIncome = byKey.get(std.netIncomeKey)?.amount ?? 0;

    return Object.freeze({
        standard: std.id,
        lines: Object.freeze(lines),
        netIncome,
    });
}
