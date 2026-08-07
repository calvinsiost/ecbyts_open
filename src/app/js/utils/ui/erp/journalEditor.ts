// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Manual journal-entry editor — DOM renderer (ERP-DRE-001 §5, M9, RF-2/RF-3).
 *
 * A non-native modal (asyncDialogs convention, never `prompt()`/`confirm()`)
 * that lets the user post a manual double-entry: pick debit/credit leaf accounts
 * from `defaultChartBR`, optionally reference a partner / cost center, and watch
 * a live balance indicator (Σdéb vs Σcréd) turn green when balanced. "Postar"
 * is enabled only when balanced + valid (partida-dobrada via
 * `_journalPure.validateEntry`/`postEntry`), then the entry is appended to the
 * .ecbt store via `setErpEntries` and `ecbt:journalEntryPosted` is dispatched so
 * the Score/DRE recompute.
 *
 * All arithmetic/validation lives in `_journalEditorVMPure.ts`; this file only
 * touches the DOM. All user text is escaped; i18n best-effort via `window.t`.
 *
 * Reachable ONLY when `CONFIG.FEATURES.ERP_DRE === true` (the trigger is gated).
 */

import { escapeHtmlFull, escapeAttr } from '../../helpers/html.js';
import { generateId } from '../../helpers/id.js';
import { defaultChartBR } from '../../../core/erp/_chartOfAccountsPure.js';
import { postEntry } from '../../../core/erp/_journalPure.js';
import type { JournalEntry } from '../../../core/erp/_journalPure.js';
import { getErpEntries, setErpEntries, getErpRegistries } from '../../../core/erp/erpModelState.js';
import {
    buildJournalEditorVM,
    toEntryDraft,
    type EditorDraft,
    type DraftPosting,
} from './_journalEditorVMPure.js';

const DIALOG_ID = 'erp-journal-editor-overlay';

/** Best-effort i18n: window.t(key) → translated, else the supplied fallback. */
function tr(key: string, fallback: string): string {
    const w = window as unknown as { t?: (k: string) => string };
    if (typeof w.t === 'function') {
        try {
            const out = w.t(key);
            if (out && out !== key) return out;
        } catch (e) {
            console.debug('[erp/journalEditor] i18n fallback', (e as Error)?.message || e);
        }
    }
    return fallback;
}

/** Today's date as ISO yyyy-mm-dd (local) for the default entry date. */
function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

/** Mutable editor state held while the dialog is open. */
interface EditorState {
    date: string;
    memo: string;
    partnerId: string;
    costCenterId: string;
    postings: DraftPosting[];
}

function newRow(): DraftPosting {
    return { accountId: '', debit: 0, credit: 0 };
}

function optionTags(
    options: readonly { id: string; label: string }[],
    selected: string,
    placeholder: string,
): string {
    const head = `<option value="">${escapeHtmlFull(placeholder)}</option>`;
    const body = options
        .map(
            (o) =>
                `<option value="${escapeAttr(o.id)}"${o.id === selected ? ' selected' : ''}>${escapeHtmlFull(o.label)}</option>`,
        )
        .join('');
    return head + body;
}

function postingRowHtml(
    p: DraftPosting,
    index: number,
    accountOptions: readonly { id: string; label: string }[],
): string {
    const accSel = optionTags(accountOptions, p.accountId, tr('erpDre.editor.accountPlaceholder', 'Account…'));
    return (
        `<tr class="erp-journal-row" data-erp-journal-row="${index}">` +
        `<td><select class="erp-journal-account" data-field="accountId" aria-label="${escapeAttr(tr('erpDre.editor.account', 'Account'))}">${accSel}</select></td>` +
        `<td><input type="number" min="0" step="0.01" class="erp-journal-debit" data-field="debit" value="${p.debit || ''}" aria-label="${escapeAttr(tr('erpDre.editor.debit', 'Debit'))}"></td>` +
        `<td><input type="number" min="0" step="0.01" class="erp-journal-credit" data-field="credit" value="${p.credit || ''}" aria-label="${escapeAttr(tr('erpDre.editor.credit', 'Credit'))}"></td>` +
        `<td><button type="button" class="erp-journal-del" data-erp-journal-del="${index}" aria-label="${escapeAttr(tr('erpDre.editor.removeRow', 'Remove row'))}">×</button></td>` +
        `</tr>`
    );
}

function shellHtml(): string {
    const title = escapeHtmlFull(tr('erpDre.editor.title', 'New journal entry'));
    return (
        `<div class="erp-journal-dialog" role="document">` +
        `<header class="erp-journal-header"><h3>${title}</h3>` +
        `<button type="button" class="erp-journal-close" data-erp-journal-close aria-label="Close">×</button></header>` +
        `<div class="erp-journal-meta"></div>` +
        `<table class="erp-journal-table"><thead><tr>` +
        `<th>${escapeHtmlFull(tr('erpDre.editor.account', 'Account'))}</th>` +
        `<th>${escapeHtmlFull(tr('erpDre.editor.debit', 'Debit'))}</th>` +
        `<th>${escapeHtmlFull(tr('erpDre.editor.credit', 'Credit'))}</th>` +
        `<th></th></tr></thead><tbody class="erp-journal-rows"></tbody></table>` +
        `<button type="button" class="erp-journal-add" data-erp-journal-add>+ ${escapeHtmlFull(tr('erpDre.editor.addRow', 'Add row'))}</button>` +
        `<div class="erp-journal-balance" role="alert" aria-live="polite" data-erp-journal-balance></div>` +
        `<footer class="erp-journal-actions">` +
        `<button type="button" class="erp-journal-cancel" data-erp-journal-close>${escapeHtmlFull(tr('erpDre.editor.cancel', 'Cancel'))}</button>` +
        `<button type="button" class="erp-journal-post" data-erp-journal-post disabled>${escapeHtmlFull(tr('erpDre.postEntry', 'Post'))}</button>` +
        `</footer>` +
        `</div>`
    );
}

function metaHtml(state: EditorState): string {
    const reg = getErpRegistries();
    const partners = reg.partners.map((p) => ({ id: p.id, label: `${p.name} (${p.kind})` }));
    const ccs = reg.costCenters.map((c) => ({ id: c.id, label: c.name }));
    return (
        `<div class="erp-journal-meta-grid">` +
        `<label>${escapeHtmlFull(tr('erpDre.editor.date', 'Date'))}<input type="date" data-meta="date" value="${escapeAttr(state.date)}"></label>` +
        `<label>${escapeHtmlFull(tr('erpDre.editor.memo', 'Memo'))}<input type="text" data-meta="memo" value="${escapeAttr(state.memo)}" placeholder="${escapeAttr(tr('erpDre.editor.memoPlaceholder', 'e.g. Service revenue'))}"></label>` +
        `<label>${escapeHtmlFull(tr('erpDre.editor.partner', 'Partner'))}<select data-meta="partnerId">${optionTags(partners, state.partnerId, tr('erpDre.editor.none', '—'))}</select></label>` +
        `<label>${escapeHtmlFull(tr('erpDre.editor.costCenter', 'Cost center'))}<select data-meta="costCenterId">${optionTags(ccs, state.costCenterId, tr('erpDre.editor.none', '—'))}</select></label>` +
        `</div>`
    );
}

function toDraft(state: EditorState): EditorDraft {
    return {
        id: generateId('jrn', 8),
        date: state.date,
        postings: state.postings,
        ...(state.memo ? { memo: state.memo } : {}),
        ...(state.partnerId ? { partnerId: state.partnerId } : {}),
        ...(state.costCenterId ? { costCenterId: state.costCenterId } : {}),
    };
}

/**
 * Open the manual journal-entry editor (RF-2/RF-3). Resolves with the posted
 * {@link JournalEntry} (appended to the .ecbt store) or `null` if cancelled.
 *
 * @returns A promise that resolves to the posted entry, or null on cancel.
 */
export function openJournalEditor(): Promise<JournalEntry | null> {
    const accounts = defaultChartBR();

    return new Promise<JournalEntry | null>((resolve) => {
        // Remove a stale dialog if any.
        document.getElementById(DIALOG_ID)?.remove();

        const overlay = document.createElement('div');
        overlay.id = DIALOG_ID;
        overlay.className = 'async-dialog-overlay erp-journal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.innerHTML = shellHtml();
        document.body.appendChild(overlay);

        const state: EditorState = {
            date: todayIso(),
            memo: '',
            partnerId: '',
            costCenterId: '',
            postings: [newRow(), newRow()],
        };

        const rowsHost = overlay.querySelector<HTMLElement>('.erp-journal-rows')!;
        const metaHost = overlay.querySelector<HTMLElement>('.erp-journal-meta')!;
        const balanceHost = overlay.querySelector<HTMLElement>('[data-erp-journal-balance]')!;
        const postBtn = overlay.querySelector<HTMLButtonElement>('[data-erp-journal-post]')!;

        let settled = false;
        const done = (result: JournalEntry | null) => {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(result);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                done(null);
            }
        };

        function renderRows(): void {
            const opts = leafOptions();
            rowsHost.innerHTML = state.postings.map((p, i) => postingRowHtml(p, i, opts)).join('');
            // Restore selected account values (innerHTML rebuild drops them otherwise
            // for dynamically added rows, but selected attr in markup handles it).
        }

        function leafOptions(): readonly { id: string; label: string }[] {
            return buildJournalEditorVM(toDraft(state), accounts).accountOptions;
        }

        function refresh(): void {
            const vm = buildJournalEditorVM(toDraft(state), accounts);
            const cls = vm.balanced
                ? 'erp-journal-balance erp-journal-balance--ok'
                : 'erp-journal-balance erp-journal-balance--bad';
            balanceHost.className = cls;
            const icon = vm.balanced ? '✓' : '✗';
            const status = vm.balanced
                ? tr('erpDre.editor.balanced', 'Balanced')
                : tr('erpDre.editor.unbalanced', 'Not balanced');
            balanceHost.innerHTML =
                `<span class="erp-journal-balance-icon" aria-hidden="true">${icon}</span> ` +
                `${escapeHtmlFull(status)} — ` +
                `${escapeHtmlFull(tr('erpDre.editor.debit', 'Debit'))}: ${vm.totalDebit.toFixed(2)} / ` +
                `${escapeHtmlFull(tr('erpDre.editor.credit', 'Credit'))}: ${vm.totalCredit.toFixed(2)}`;
            postBtn.disabled = !vm.canPost;
        }

        function readMeta(): void {
            metaHost.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-meta]').forEach((el) => {
                const field = el.getAttribute('data-meta') as keyof EditorState;
                (state as unknown as Record<string, string>)[field] = el.value;
            });
        }

        // Initial render.
        metaHost.innerHTML = metaHtml(state);
        renderRows();
        refresh();

        // Row-level input handling (event delegation).
        rowsHost.addEventListener('input', (e) => {
            const target = e.target as HTMLElement;
            const rowEl = target.closest<HTMLElement>('[data-erp-journal-row]');
            if (!rowEl) return;
            const idx = Number(rowEl.getAttribute('data-erp-journal-row'));
            const field = target.getAttribute('data-field');
            const row = state.postings[idx];
            if (!row || !field) return;
            const value = (target as HTMLInputElement | HTMLSelectElement).value;
            if (field === 'accountId') {
                state.postings[idx] = { ...row, accountId: value };
            } else if (field === 'debit') {
                state.postings[idx] = { ...row, debit: Number(value) || 0 };
            } else if (field === 'credit') {
                state.postings[idx] = { ...row, credit: Number(value) || 0 };
            }
            refresh();
        });

        rowsHost.addEventListener('click', (e) => {
            const del = (e.target as HTMLElement).closest<HTMLElement>('[data-erp-journal-del]');
            if (!del) return;
            const idx = Number(del.getAttribute('data-erp-journal-del'));
            if (state.postings.length <= 2) return; // keep ≥2 rows
            state.postings.splice(idx, 1);
            renderRows();
            refresh();
        });

        overlay.querySelector('[data-erp-journal-add]')?.addEventListener('click', () => {
            state.postings.push(newRow());
            renderRows();
            refresh();
        });

        metaHost.addEventListener('change', readMeta);
        metaHost.addEventListener('input', readMeta);

        overlay.querySelectorAll('[data-erp-journal-close]').forEach((btn) => {
            btn.addEventListener('click', () => done(null));
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) done(null);
        });

        postBtn.addEventListener('click', () => {
            readMeta();
            try {
                const entry = postEntry(toEntryDraft(toDraft(state)), accounts);
                setErpEntries([...getErpEntries(), entry]);
                window.dispatchEvent(
                    new CustomEvent('ecbt:journalEntryPosted', { detail: { id: entry.id } }),
                );
                done(entry);
            } catch (err) {
                balanceHost.className = 'erp-journal-balance erp-journal-balance--bad';
                balanceHost.textContent = (err as Error)?.message ?? 'ERR_DRE_UNBALANCED';
            }
        });

        document.addEventListener('keydown', onKey);
    });
}
