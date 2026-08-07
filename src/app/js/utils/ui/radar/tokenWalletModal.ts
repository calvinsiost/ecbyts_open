// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TOKEN WALLET MODAL — view wallet + recent transactions + top-up.
   Phase 5 / 5 of SPEC_DATASTUDIO_RADAR_PROFILES.

   Reads from `radar_token_wallets` and `radar_token_transactions`
   (last 20). Pure helpers `formatTokens` and `transactionsToCSV`
   are extracted for unit testing.
   ================================================================ */

import { t } from '../../i18n/translations.js';
import { escapeHtml } from '../../helpers/html.js';
import { showToast } from '../toast.js';
import * as sessionModule from '../../auth/session.js';
import { formatTokens as _formatTokens, transactionsToCSV as _transactionsToCSV } from './_pureHelpers.js';

export { formatTokens, transactionsToCSV } from './_pureHelpers.js';

const MODAL_ID = 'radar-wallet-modal';
const RECENT_TX_LIMIT = 20;

interface Wallet {
    id: string;
    grant_id: string;
    balance: number;
    contracted_total: number;
    consumed_total: number;
    rate_limit_per_second: number;
    max_tokens_per_request: number;
    expires_at: string | null;
    last_topup_at: string | null;
}

interface TokenTx {
    id: string;
    type: string;
    amount: number;
    endpoint: string | null;
    balance_after: number | null;
    created_at: string;
}

type SupabaseLike = {
    from(table: string): {
        select(columns: string): {
            eq(column: string, value: string): {
                maybeSingle(): Promise<{ data?: unknown }>;
                order(column: string, opts: { ascending: boolean }): {
                    limit(limit: number): Promise<{ data?: unknown }>;
                };
            };
        };
    };
    schema?(schema: string): SupabaseLike;
};

type SessionWithSupabase = typeof sessionModule & {
    getSupabaseClient?: () => SupabaseLike | null;
};

let _grantId: string | null = null;
let _wallet: Wallet | null = null;
let _txs: TokenTx[] = [];

// ----------------------------------------------------------------
// INTERNALS
// ----------------------------------------------------------------

/** @param {unknown} e */
function errorMessage(e: unknown): string {
    return e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : String(e);
}

/** @param {string} key @param {string} fallback */
function tr(key: string, fallback: string): string {
    return t(key) || fallback;
}

function getSupabaseClient(): SupabaseLike | null {
    return ((sessionModule as SessionWithSupabase).getSupabaseClient?.() ?? null) as SupabaseLike | null;
}

function getApiClient(client: SupabaseLike): SupabaseLike {
    return typeof client.schema === 'function' ? client.schema('api') : client;
}

async function loadWalletAndTxs(): Promise<void> {
    const client = getSupabaseClient();
    if (!client) {
        showToast(tr('wallet.errNoSupabase', 'Supabase não disponível'), 'warning');
        _wallet = null;
        _txs = [];
        return;
    }
    if (!_grantId) {
        _wallet = null;
        _txs = [];
        return;
    }
    try {
        const apiClient = getApiClient(client);
        const wRes = await apiClient
            .from('radar_token_wallets')
            .select(
                'id,grant_id,balance,contracted_total,consumed_total,rate_limit_per_second,max_tokens_per_request,expires_at,last_topup_at',
            )
            .eq('grant_id', _grantId)
            .maybeSingle();
        _wallet = wRes && wRes.data ? (wRes.data as Wallet) : null;

        if (_wallet) {
            const tRes = await apiClient
                .from('radar_token_transactions')
                .select('id,type,amount,endpoint,balance_after,created_at')
                .eq('wallet_id', _wallet.id)
                .order('created_at', { ascending: false })
                .limit(RECENT_TX_LIMIT);
            _txs = tRes && Array.isArray(tRes.data) ? (tRes.data as TokenTx[]) : [];
        } else {
            _txs = [];
        }
    } catch (e) {
        showToast(`Wallet: ${errorMessage(e)}`, 'error');
        _wallet = null;
        _txs = [];
    }
}

function renderHeader(): string {
    return (
        '<div class="rwm-header">' +
        `<h2 style="margin:0">${escapeHtml(tr('wallet.title', 'Token Wallet'))}</h2>` +
        '<button class="ecbt-btn rwm-close-x" aria-label="close" style="padding:4px 10px">&times;</button>' +
        '</div>'
    );
}

function renderStats(): string {
    if (!_wallet) {
        return `<div class="rwm-empty">${escapeHtml(tr('wallet.noWallet', 'Nenhuma wallet encontrada para este grant.'))}</div>`;
    }
    const w = _wallet;
    const totalForPct = w.contracted_total > 0 ? w.contracted_total : 1;
    const pct = Math.min(100, Math.max(0, (w.consumed_total / totalForPct) * 100));
    const pctText = pct.toFixed(1) + '%';
    const contracted = _formatTokens(w.contracted_total);
    const balance = _formatTokens(w.balance);
    const consumed = _formatTokens(w.consumed_total);
    const rate = _formatTokens(w.rate_limit_per_second);
    const maxReq = _formatTokens(w.max_tokens_per_request);

    return (
        '<div class="rwm-stats">' +
        '<div class="rwm-stat">' +
        `<span class="rwm-stat-label">${escapeHtml(tr('wallet.contractedTotal', 'Total contratado'))}</span>` +
        `<span class="rwm-stat-value">${contracted}</span>` +
        '</div>' +
        '<div class="rwm-stat">' +
        `<span class="rwm-stat-label">${escapeHtml(tr('wallet.balance', 'Saldo'))}</span>` +
        `<span class="rwm-stat-value">${balance}</span>` +
        '</div>' +
        '<div class="rwm-stat">' +
        `<span class="rwm-stat-label">${escapeHtml(tr('wallet.consumed', 'Consumido'))}</span>` +
        `<span class="rwm-stat-value">${consumed}</span>` +
        '</div>' +
        '</div>' +
        `<div class="rwm-progress"><div class="rwm-progress-fill" style="width:${pct}%"></div></div>` +
        `<div class="rwm-progress-label">${escapeHtml(tr('wallet.consumedPct', 'Consumido'))}: ${pctText}</div>` +
        `<div class="rwm-rate">${escapeHtml(tr('wallet.rateLimit', 'Rate limit'))}: ` +
        `<strong>${rate}</strong> ${escapeHtml(tr('wallet.tokensPerSecond', 'tokens/segundo'))} ` +
        `(${escapeHtml(tr('wallet.maxPerRequest', 'max'))}: <strong>${maxReq}</strong>)</div>`
    );
}

/** @param {TokenTx} tx */
function renderTxRow(tx: TokenTx): string {
    const type = escapeHtml(tx.type || '');
    const amount = _formatTokens(tx.amount);
    const endpoint = escapeHtml(tx.endpoint || '-');
    const balance = _formatTokens(tx.balance_after ?? 0);
    const ts = escapeHtml(tx.created_at || '');
    const typeClass = type === 'credit' ? 'rwm-type-credit' : 'rwm-type-debit';
    return (
        '<tr>' +
        `<td><span class="rwm-type ${typeClass}">${type}</span></td>` +
        `<td style="text-align:right"><code>${amount}</code></td>` +
        `<td><code>${endpoint}</code></td>` +
        `<td style="text-align:right"><code>${balance}</code></td>` +
        `<td><code style="font-size:10px">${ts}</code></td>` +
        '</tr>'
    );
}

function renderTxTable(): string {
    const title = escapeHtml(tr('wallet.recentTx', 'Transações recentes'));
    if (!_wallet || _txs.length === 0) {
        return (
            `<h4 class="rwm-subtitle">${title}</h4>` +
            `<div class="rwm-empty rwm-empty--soft">${escapeHtml(tr('wallet.noTx', 'Nenhuma transação registrada.'))}</div>`
        );
    }
    const rows = _txs.map(renderTxRow).join('');
    return (
        `<h4 class="rwm-subtitle">${title}</h4>` +
        '<div class="rwm-tx-wrap">' +
        '<table class="rwm-tx-table">' +
        '<thead><tr>' +
        `<th>${escapeHtml(tr('wallet.type', 'Tipo'))}</th>` +
        `<th style="text-align:right">${escapeHtml(tr('wallet.amount', 'Quantidade'))}</th>` +
        `<th>${escapeHtml(tr('wallet.endpoint', 'Endpoint'))}</th>` +
        `<th style="text-align:right">${escapeHtml(tr('wallet.balanceAfter', 'Saldo após'))}</th>` +
        `<th>${escapeHtml(tr('wallet.timestamp', 'Timestamp'))}</th>` +
        '</tr></thead>' +
        `<tbody>${rows}</tbody></table></div>`
    );
}

function renderActions(): string {
    return (
        '<div class="rwm-actions">' +
        `<button class="ecbt-btn ecbt-btn--primary rwm-topup">${escapeHtml(tr('wallet.topUp', 'Top Up'))}</button>` +
        `<button class="ecbt-btn rwm-export">${escapeHtml(tr('wallet.exportCsv', 'Exportar CSV'))}</button>` +
        '</div>'
    );
}

function renderBody(): string {
    return renderStats() + renderTxTable() + renderActions();
}

function attachHandlers(): void {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const x = modal.querySelector('.rwm-close-x');
    if (x) x.addEventListener('click', closeTokenWalletModal);
    const topup = modal.querySelector('.rwm-topup');
    if (topup) {
        topup.addEventListener('click', () => {
            // Real checkout integration TBD in Phase 1-4 billing module.
            showToast(tr('wallet.checkoutTbd', 'Checkout flow TBD'), 'info');
        });
    }
    const exportBtn = modal.querySelector('.rwm-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const csv = _transactionsToCSV(_txs);
            try {
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `radar-wallet-tx-${_grantId || 'unknown'}-${Date.now()}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(tr('wallet.exported', 'CSV exportado'), 'success');
            } catch (e) {
                showToast(`Export: ${errorMessage(e)}`, 'error');
            }
        });
    }
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Open the wallet modal for a given grant id.
 *
 * @param {{ grantId: string }} opts
 * @returns {Promise<void>}
 */
export async function openTokenWalletModal(opts: { grantId: string }): Promise<void> {
    if (!opts || !opts.grantId) {
        showToast(tr('wallet.errMissingGrant', 'grantId ausente'), 'error');
        return;
    }
    _grantId = opts.grantId;

    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = MODAL_ID;
        modal.className = 'ecbt-overlay';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML =
            '<div class="ecbt-dialog ecbt-dialog--xl" style="max-width:840px">' +
            '<div class="rwm-shell">' +
            renderHeader() +
            '<div class="rwm-body"></div>' +
            '</div>' +
            '<style>' +
            '.rwm-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; }' +
            '.rwm-subtitle { margin:16px 0 6px; font-size:13px; color:var(--text-secondary,#bbb); }' +
            '.rwm-stats { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:10px; }' +
            '.rwm-stat { padding:10px 12px; border-radius:6px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.06); }' +
            '.rwm-stat-label { display:block; font-size:10px; text-transform:uppercase; color:var(--text-tertiary,#888); margin-bottom:4px; }' +
            '.rwm-stat-value { display:block; font-size:18px; font-weight:600; color:var(--text-primary,#fff); font-family:monospace; }' +
            '.rwm-progress { height:8px; border-radius:4px; background:rgba(255,255,255,0.06); overflow:hidden; margin-bottom:4px; }' +
            '.rwm-progress-fill { height:100%; background:linear-gradient(90deg,#22c55e,#fb923c); transition:width .3s; }' +
            '.rwm-progress-label { font-size:11px; color:var(--text-tertiary,#888); margin-bottom:8px; }' +
            '.rwm-rate { font-size:12px; color:var(--text-secondary,#bbb); margin-bottom:8px; }' +
            '.rwm-tx-wrap { max-height:280px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:6px; }' +
            '.rwm-tx-table { width:100%; border-collapse:collapse; font-size:11px; }' +
            '.rwm-tx-table th { position:sticky; top:0; background:var(--bg-secondary,#1a1a2a); padding:8px; text-align:left; font-size:10px; text-transform:uppercase; color:var(--text-tertiary,#888); z-index:1; }' +
            '.rwm-tx-table td { padding:6px 8px; border-bottom:1px solid rgba(255,255,255,0.05); }' +
            '.rwm-type { display:inline-block; padding:1px 6px; border-radius:3px; font-size:10px; font-weight:600; }' +
            '.rwm-type-credit { background:rgba(34,197,94,0.18); color:#22c55e; }' +
            '.rwm-type-debit { background:rgba(251,113,133,0.18); color:#fb7185; }' +
            '.rwm-actions { display:flex; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.08); }' +
            '.rwm-empty { padding:14px; text-align:center; color:var(--text-tertiary,#888); border:1px dashed rgba(255,255,255,0.1); border-radius:6px; font-size:12px; }' +
            '.rwm-empty--soft { border:none; padding:8px; font-style:italic; }' +
            '</style>' +
            '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeTokenWalletModal();
        });
    } else {
        // refresh header in case i18n changed
        const shell = modal.querySelector('.rwm-shell');
        if (shell) {
            const headerEl = shell.querySelector('.rwm-header');
            if (headerEl) headerEl.outerHTML = renderHeader();
        }
    }
    /** @type {HTMLElement} */ (modal).style.display = 'flex';

    await loadWalletAndTxs();
    const body = modal.querySelector('.rwm-body');
    if (body) body.innerHTML = renderBody();
    attachHandlers();
}

export function closeTokenWalletModal(): void {
    const modal = document.getElementById(MODAL_ID);
    if (modal) /** @type {HTMLElement} */ (modal).style.display = 'none';
    _grantId = null;
    _wallet = null;
    _txs = [];
}

export function _resetForTests(): void {
    _grantId = null;
    _wallet = null;
    _txs = [];
}
