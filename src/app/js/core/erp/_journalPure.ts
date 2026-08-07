// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Journal entries — pure logic (ERP-DRE-001 §4.2, M2/M3).
 *
 * Double-entry bookkeeping primitives: a {@link JournalEntry} has ≥2
 * {@link Posting}s and Σdebit must equal Σcredit (RF-2). Posted entries are
 * immutable (frozen) and may only be corrected by a reversal (RF-3) that
 * swaps debit/credit and references the original. Pure — no DOM, no I/O.
 */

import type { EcbtFinancialScopeTag } from '../ecbtScore/_financialScopePure.js';
import type { Currency } from '../ecbtScore/_ecbtScorePure.js';
import type { Account } from './_chartOfAccountsPure.js';
import { assertPostable } from './_chartOfAccountsPure.js';

/** A single side of a journal entry (one of debit/credit is non-zero). */
export interface Posting {
    /** Must reference a leaf (ledger) account. */
    readonly accountId: string;
    /** Debit amount (≥ 0). */
    readonly debit: number;
    /** Credit amount (≥ 0). */
    readonly credit: number;
}

export interface JournalEntry {
    readonly id: string;
    /** ISO-8601 date string (e.g. '2026-06-21'). */
    readonly date: string;
    readonly postings: readonly Posting[];
    readonly memo?: string;
    readonly partnerId?: string;
    readonly costCenterId?: string;
    readonly currency?: Currency;
    readonly ecbtScope?: EcbtFinancialScopeTag;
    /** Id of the entry this one reverses, if it is a reversal. */
    readonly reversalOf?: string;
    /** Always true for an entry returned by {@link postEntry}. */
    readonly posted: boolean;
}

/** Draft shape accepted by {@link postEntry} (not yet posted/frozen). */
export interface JournalEntryDraft {
    id: string;
    date: string;
    postings: readonly { accountId: string; debit?: number; credit?: number }[];
    memo?: string;
    partnerId?: string;
    costCenterId?: string;
    currency?: Currency;
    ecbtScope?: EcbtFinancialScopeTag;
    reversalOf?: string;
}

/** Rounding tolerance for the balance check (floating-point safety). */
const BALANCE_EPSILON = 1e-6;

function safeAmount(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface BalanceResult {
    readonly totalDebit: number;
    readonly totalCredit: number;
    readonly balanced: boolean;
}

/**
 * Sum debits/credits of a set of postings and report whether they balance.
 *
 * @param postings - The postings to total.
 * @returns A frozen result with `totalDebit`, `totalCredit`, `balanced`.
 */
export function sumPostings(
    postings: readonly { debit?: number; credit?: number }[],
): BalanceResult {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const p of postings) {
        totalDebit += safeAmount(p?.debit);
        totalCredit += safeAmount(p?.credit);
    }
    const balanced = Math.abs(totalDebit - totalCredit) <= BALANCE_EPSILON;
    return Object.freeze({ totalDebit, totalCredit, balanced });
}

/**
 * Validate a draft journal entry against the chart of accounts.
 *
 * Checks (RF-2): ≥2 postings, Σdebit === Σcredit, every posting targets a leaf
 * account, and no posting has both debit and credit non-zero.
 *
 * @param draft - The draft entry to validate.
 * @param accounts - The chart of accounts (array or Map indexed by id).
 * @returns A frozen `{ valid, errors }` result.
 */
export function validateEntry(
    draft: JournalEntryDraft,
    accounts: readonly Account[] | ReadonlyMap<string, Account>,
): { valid: boolean; errors: readonly string[] } {
    const errors: string[] = [];
    if (!draft || !Array.isArray(draft.postings) || draft.postings.length < 2) {
        errors.push('ERR_DRE_MIN_POSTINGS: an entry needs at least 2 postings');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) });
    }
    for (const p of draft.postings) {
        const d = safeAmount(p.debit);
        const c = safeAmount(p.credit);
        if (d > 0 && c > 0) {
            errors.push(
                `ERR_DRE_BOTH_SIDES: posting to "${p.accountId}" has both debit and credit`,
            );
        }
        if (d === 0 && c === 0) {
            errors.push(`ERR_DRE_EMPTY_POSTING: posting to "${p.accountId}" has no value`);
        }
        try {
            assertPostable(p.accountId, accounts);
        } catch (e) {
            errors.push((e as Error).message);
        }
    }
    const { balanced, totalDebit, totalCredit } = sumPostings(draft.postings);
    if (!balanced) {
        errors.push(
            `ERR_DRE_UNBALANCED: debits (${totalDebit}) must equal credits (${totalCredit})`,
        );
    }
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
}

/**
 * Post a draft entry: validates double-entry and returns an immutable
 * (deeply frozen) {@link JournalEntry} with `posted: true`.
 *
 * @param draft - The draft entry to post.
 * @param accounts - The chart of accounts used for leaf validation.
 * @returns The frozen posted entry.
 * @throws {Error} ERR_DRE_UNBALANCED / ERR_DRE_LEAF_ONLY (etc.) if invalid.
 */
export function postEntry(
    draft: JournalEntryDraft,
    accounts: readonly Account[] | ReadonlyMap<string, Account>,
): JournalEntry {
    const { valid, errors } = validateEntry(draft, accounts);
    if (!valid) {
        throw new Error(errors.join('; '));
    }
    const postings = Object.freeze(
        draft.postings.map((p) =>
            Object.freeze({
                accountId: p.accountId,
                debit: safeAmount(p.debit),
                credit: safeAmount(p.credit),
            } as Posting),
        ),
    );
    const entry: JournalEntry = {
        id: draft.id,
        date: draft.date,
        postings,
        ...(draft.memo !== undefined ? { memo: draft.memo } : {}),
        ...(draft.partnerId !== undefined ? { partnerId: draft.partnerId } : {}),
        ...(draft.costCenterId !== undefined ? { costCenterId: draft.costCenterId } : {}),
        ...(draft.currency !== undefined ? { currency: draft.currency } : {}),
        ...(draft.ecbtScope !== undefined ? { ecbtScope: draft.ecbtScope } : {}),
        ...(draft.reversalOf !== undefined ? { reversalOf: draft.reversalOf } : {}),
        posted: true,
    };
    return Object.freeze(entry);
}

/**
 * Build the reversal (estorno) of a posted entry: every posting's debit and
 * credit are swapped, and the new entry references the original via
 * `reversalOf` (RF-3). The original is never mutated.
 *
 * @param original - A posted entry to reverse.
 * @param options - Optional `id`/`date`/`memo` for the reversal (defaults derive
 *   from the original).
 * @returns The frozen reversal entry.
 * @throws {Error} if the original is not posted.
 */
export function reverseEntry(
    original: JournalEntry,
    options: { id?: string; date?: string; memo?: string } = {},
): JournalEntry {
    if (!original || original.posted !== true) {
        throw new Error('reverseEntry: original must be a posted entry');
    }
    const reversedPostings = Object.freeze(
        original.postings.map((p) =>
            Object.freeze({
                accountId: p.accountId,
                debit: p.credit,
                credit: p.debit,
            } as Posting),
        ),
    );
    const entry: JournalEntry = {
        id: options.id ?? `${original.id}-rev`,
        date: options.date ?? original.date,
        postings: reversedPostings,
        memo: options.memo ?? `Estorno de ${original.id}`,
        ...(original.partnerId !== undefined ? { partnerId: original.partnerId } : {}),
        ...(original.costCenterId !== undefined ? { costCenterId: original.costCenterId } : {}),
        ...(original.currency !== undefined ? { currency: original.currency } : {}),
        ...(original.ecbtScope !== undefined ? { ecbtScope: original.ecbtScope } : {}),
        reversalOf: original.id,
        posted: true,
    };
    return Object.freeze(entry);
}
