// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Editable chart of accounts — DOM renderer (ERP-DRE-001 §2.2, RF-11).
 *
 * A minimal non-native modal over the default Brazilian chart
 * (`defaultChartBR`): the user sees every account and can ADD a custom leaf
 * account (id, name, rootType) or REMOVE one of their own additions. Default
 * (suggested) accounts are read-only; only user-added accounts can be removed.
 * Custom accounts are merged via `effectiveChart` and persisted into the .ecbt
 * key through `setErpCustomAccounts` (RF-11 "editável pelo usuário").
 *
 * Uses asyncPrompt/asyncConfirm (never native dialogs). DOM-only; validation
 * and immutability live in `_chartOfAccountsPure.ts`. Text is escaped; i18n
 * best-effort via `window.t`.
 *
 * Reachable ONLY when `CONFIG.FEATURES.ERP_DRE === true` (the trigger is gated).
 */

import { escapeHtmlFull, escapeAttr } from '../../helpers/html.js';
import { asyncPrompt, asyncConfirm } from '../asyncDialogs.js';
import {
    defaultChartBR,
    effectiveChart,
    addAccountToChart,
    removeAccountFromChart,
    type Account,
    type RootType,
} from '../../../core/erp/_chartOfAccountsPure.js';
import { getErpCustomAccounts, setErpCustomAccounts } from '../../../core/erp/erpModelState.js';

const DIALOG_ID = 'erp-chart-editor-overlay';
const VALID_ROOTS: readonly RootType[] = ['ativo', 'passivo', 'patrimonio', 'receita', 'despesa'];

/** Best-effort i18n: window.t(key) → translated, else fallback. */
function tr(key: string, fallback: string): string {
    const w = window as unknown as { t?: (k: string) => string };
    if (typeof w.t === 'function') {
        try {
            const out = w.t(key);
            if (out && out !== key) return out;
        } catch (e) {
            console.debug('[erp/chartEditor] i18n fallback', (e as Error)?.message || e);
        }
    }
    return fallback;
}

/** Ids that belong to the default (suggested) chart — never removable. */
function defaultIds(): ReadonlySet<string> {
    return new Set(defaultChartBR().map((a) => a.id));
}

function rowHtml(account: Account, removable: boolean): string {
    const kind = account.isGroup
        ? tr('erpDre.chart.group', 'Group')
        : tr('erpDre.chart.leaf', 'Ledger');
    const del = removable
        ? `<button type="button" class="erp-chart-del" data-erp-chart-del="${escapeAttr(account.id)}" aria-label="${escapeAttr(tr('erpDre.chart.remove', 'Remove'))}">×</button>`
        : `<span class="erp-chart-locked" title="${escapeAttr(tr('erpDre.chart.defaultLocked', 'Default account'))}">🔒</span>`;
    return (
        `<tr class="erp-chart-row${account.isGroup ? ' erp-chart-row--group' : ''}">` +
        `<td class="erp-chart-id">${escapeHtmlFull(account.id)}</td>` +
        `<td class="erp-chart-name">${escapeHtmlFull(account.name)}</td>` +
        `<td class="erp-chart-root">${escapeHtmlFull(account.rootType)}</td>` +
        `<td class="erp-chart-kind">${escapeHtmlFull(kind)}</td>` +
        `<td class="erp-chart-actions">${del}</td>` +
        `</tr>`
    );
}

function tableHtml(): string {
    const custom = getErpCustomAccounts();
    const defaults = defaultIds();
    const chart = effectiveChart(custom);
    const rows = chart
        .map((acc) => rowHtml(acc, !defaults.has(acc.id)))
        .join('');
    return (
        `<table class="erp-chart-table"><thead><tr>` +
        `<th>${escapeHtmlFull(tr('erpDre.chart.colId', 'Id'))}</th>` +
        `<th>${escapeHtmlFull(tr('erpDre.chart.colName', 'Name'))}</th>` +
        `<th>${escapeHtmlFull(tr('erpDre.chart.colRoot', 'Type'))}</th>` +
        `<th>${escapeHtmlFull(tr('erpDre.chart.colKind', 'Kind'))}</th>` +
        `<th></th></tr></thead><tbody>${rows}</tbody></table>`
    );
}

/** Prompt the user for a new custom leaf account; returns the persisted list or null. */
async function promptAddAccount(): Promise<readonly Account[] | null> {
    const id = await asyncPrompt(tr('erpDre.chart.promptId', 'Account id (e.g. D.5):'));
    if (id === null || id.trim() === '') return null;
    const name = await asyncPrompt(tr('erpDre.chart.promptName', 'Account name:'));
    if (name === null || name.trim() === '') return null;
    const rootRaw = await asyncPrompt(
        tr('erpDre.chart.promptRoot', 'Type — ativo | passivo | patrimonio | receita | despesa:'),
        'despesa',
    );
    if (rootRaw === null) return null;
    const rootType = rootRaw.trim().toLowerCase() as RootType;
    if (!VALID_ROOTS.includes(rootType)) {
        await asyncConfirm(tr('erpDre.chart.errRoot', 'Invalid account type.'), { confirmLabel: 'OK' });
        return null;
    }
    // Add onto the EFFECTIVE chart to validate integrity, but persist only the
    // custom delta (the new account).
    const custom = getErpCustomAccounts();
    const res = addAccountToChart(effectiveChart(custom), {
        id: id.trim(),
        name: name.trim(),
        rootType,
        isGroup: false,
    });
    if (res.error) {
        await asyncConfirm(res.error, { confirmLabel: 'OK' });
        return null;
    }
    const added = res.chart.find((a) => a.id === id.trim());
    return added ? [...custom, added] : null;
}

/**
 * Open the editable chart-of-accounts modal (RF-11). Persists custom accounts
 * into the .ecbt store and dispatches `ecbt:erpChartChanged`. Resolves on close.
 *
 * @returns A promise that resolves once the modal is dismissed.
 */
export function openChartEditor(): Promise<void> {
    return new Promise<void>((resolve) => {
        document.getElementById(DIALOG_ID)?.remove();

        const overlay = document.createElement('div');
        overlay.id = DIALOG_ID;
        overlay.className = 'async-dialog-overlay erp-chart-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');

        const title = escapeHtmlFull(tr('erpDre.chart.title', 'Chart of accounts'));
        overlay.innerHTML =
            `<div class="erp-chart-dialog" role="document">` +
            `<header class="erp-chart-header"><h3>${title}</h3>` +
            `<button type="button" class="erp-chart-add" data-erp-chart-add>+ ${escapeHtmlFull(tr('erpDre.chart.add', 'Add account'))}</button>` +
            `<button type="button" class="erp-chart-close" data-erp-chart-close aria-label="Close">×</button></header>` +
            `<div class="erp-chart-body"></div>` +
            `</div>`;
        document.body.appendChild(overlay);

        const bodyHost = overlay.querySelector<HTMLElement>('.erp-chart-body')!;
        const rerender = () => {
            bodyHost.innerHTML = tableHtml();
        };
        rerender();

        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                done();
            }
        };

        const persist = (custom: readonly Account[]) => {
            setErpCustomAccounts(custom);
            window.dispatchEvent(new CustomEvent('ecbt:erpChartChanged'));
            rerender();
        };

        overlay.querySelector('[data-erp-chart-add]')?.addEventListener('click', () => {
            promptAddAccount()
                .then((next) => {
                    if (next) persist(next);
                })
                .catch((e) => {
                    console.debug('[erp/chartEditor] add account cancelled', e?.message || e);
                });
        });

        bodyHost.addEventListener('click', (e) => {
            const del = (e.target as HTMLElement).closest<HTMLElement>('[data-erp-chart-del]');
            if (!del) return;
            const id = del.getAttribute('data-erp-chart-del') ?? '';
            asyncConfirm(tr('erpDre.chart.confirmRemove', 'Remove this account?'), {
                danger: true,
                confirmLabel: tr('erpDre.chart.remove', 'Remove'),
            })
                .then((ok) => {
                    if (!ok) return;
                    const res = removeAccountFromChart(getErpCustomAccounts(), id);
                    if (!res.error) persist(res.chart);
                })
                .catch((e) => {
                    console.debug('[erp/chartEditor] remove account cancelled', e?.message || e);
                });
        });

        overlay.querySelector('[data-erp-chart-close]')?.addEventListener('click', () => done());
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) done();
        });
        document.addEventListener('keydown', onKey);
    });
}
