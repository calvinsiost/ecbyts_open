// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Journal-editor view-model — pure logic (ERP-DRE-001 §5, M9, RF-2).
 *
 * Backs the manual journal-entry UI (`journalEditor.ts`): it owns the
 * arithmetic and validation so the DOM layer only renders + wires events.
 *
 * Responsibilities:
 *   - turn an editable draft (postings with debit/credit, partner, cost center)
 *     into a render-ready view-model with a live balance indicator (Σdéb vs
 *     Σcréd) and the leaf-account options;
 *   - decide whether the "Post" button is enabled (balanced + leaf accounts);
 *   - build the {@link JournalEntryDraft} consumed by `postEntry`.
 *
 * Pure — no DOM, no I/O, no `window`. Output frozen.
 */

import type { Account } from '../../../core/erp/_chartOfAccountsPure.js';
import { isLeaf } from '../../../core/erp/_chartOfAccountsPure.js';
import { sumPostings, validateEntry } from '../../../core/erp/_journalPure.js';
import type { JournalEntryDraft } from '../../../core/erp/_journalPure.js';

/** One editable posting line in the journal editor. */
export interface DraftPosting {
    readonly accountId: string;
    /** Debit amount as typed (number ≥ 0). */
    readonly debit: number;
    /** Credit amount as typed (number ≥ 0). */
    readonly credit: number;
}

/** The full editable draft the journal editor binds to. */
export interface EditorDraft {
    readonly id: string;
    readonly date: string;
    readonly memo?: string;
    readonly partnerId?: string;
    readonly costCenterId?: string;
    readonly postings: readonly DraftPosting[];
}

/** A selectable leaf account for the posting account picker. */
export interface AccountOptionVM {
    readonly id: string;
    readonly label: string;
}

/** Render-ready view-model for the journal editor. */
export interface JournalEditorVM {
    readonly totalDebit: number;
    readonly totalCredit: number;
    readonly balanced: boolean;
    /** Difference (debit − credit); 0 when balanced. */
    readonly difference: number;
    /** Whether "Post" should be enabled (≥2 postings, balanced, all valid). */
    readonly canPost: boolean;
    /** i18n key for the balance status (balanced/unbalanced). */
    readonly balanceStatusKey: string;
    /** Validation error codes (empty when valid). */
    readonly errors: readonly string[];
    /** Leaf accounts available to post to. */
    readonly accountOptions: readonly AccountOptionVM[];
}

/** Build the (frozen) list of postable leaf-account options for the picker. */
export function leafAccountOptions(accounts: readonly Account[]): readonly AccountOptionVM[] {
    const options = accounts
        .filter((a) => isLeaf(a))
        .map((a) => Object.freeze({ id: a.id, label: `${a.id} — ${a.name}` }));
    return Object.freeze(options);
}

/**
 * Convert an editor draft to the `JournalEntryDraft` accepted by `postEntry`.
 * Postings with neither debit nor credit are dropped (empty UI rows).
 *
 * @param draft - The editor draft.
 * @returns A {@link JournalEntryDraft} (caller passes to `postEntry`).
 */
export function toEntryDraft(draft: EditorDraft): JournalEntryDraft {
    const postings = (draft.postings ?? [])
        .filter((p) => (Number(p.debit) || 0) > 0 || (Number(p.credit) || 0) > 0)
        .map((p) => ({
            accountId: p.accountId,
            debit: Number(p.debit) || 0,
            credit: Number(p.credit) || 0,
        }));
    return {
        id: draft.id,
        date: draft.date,
        postings,
        ...(draft.memo !== undefined ? { memo: draft.memo } : {}),
        ...(draft.partnerId ? { partnerId: draft.partnerId } : {}),
        ...(draft.costCenterId ? { costCenterId: draft.costCenterId } : {}),
    };
}

/**
 * Build the journal-editor view-model from a draft + chart of accounts (RF-2).
 *
 * Computes the live balance, validates the (non-empty) postings via
 * `validateEntry`, and decides whether "Post" is enabled.
 *
 * @param draft - The editor draft (postings, partner, cost center, …).
 * @param accounts - The chart of accounts (for leaf validation + options).
 * @returns A frozen {@link JournalEditorVM}.
 */
export function buildJournalEditorVM(
    draft: EditorDraft,
    accounts: readonly Account[],
): JournalEditorVM {
    const entryDraft = toEntryDraft(draft);
    const balance = sumPostings(entryDraft.postings);
    const difference = balance.totalDebit - balance.totalCredit;
    // Only run full validation once there are at least 2 non-empty postings, so
    // an empty editor doesn't spam errors before the user types anything.
    const hasEnough = entryDraft.postings.length >= 2;
    const validation = hasEnough
        ? validateEntry(entryDraft, accounts)
        : { valid: false, errors: [] as readonly string[] };
    return Object.freeze({
        totalDebit: balance.totalDebit,
        totalCredit: balance.totalCredit,
        balanced: balance.balanced,
        difference,
        canPost: hasEnough && validation.valid,
        balanceStatusKey: balance.balanced ? 'erpDre.editor.balanced' : 'erpDre.editor.unbalanced',
        errors: Object.freeze([...validation.errors]),
        accountOptions: leafAccountOptions(accounts),
    });
}
