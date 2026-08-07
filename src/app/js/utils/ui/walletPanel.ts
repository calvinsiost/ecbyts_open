// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   WALLET PANEL — $ECBT balance dropdown in titlebar
   Painel dropdown da carteira $ECBT no header.

   Mostra saldo, equivalentes fiat, transacoes recentes, e botao
   de adicionar fundos. Segue o mesmo padrao do notification-dropdown.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { formatECBT, badgeECBT, formatFiatValue } from '../helpers/currencyFormat.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
import { getBalance, getTransactions } from '../../core/currency/ecbtLedger.js';
import { convert, fetchRates } from '../../core/currency/exchangeRates.js';
import { exportMyBalanceDataCsv } from './balanceExportRuntime.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('WalletPanel');
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _dropdown: any = null;
let _isOpen = false;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the wallet dropdown panel.
 * Abre o painel dropdown. Cria o DOM se necessario.
 */
export async function openWalletPanel() {
    if (_isOpen) {
        closeWalletPanel();
        return;
    }
    const wrapper = (document.getElementById('wallet-icon-wrapper')) as any;
    if (!wrapper)
        return;
    if (!_dropdown) {
        _dropdown = _createDropdown();
        wrapper.appendChild(_dropdown);
    }
    _isOpen = true;
    _dropdown.classList.add('active');
    // Carregar dados
    await _renderContent();
    // Sprint 3 Tier-B (Calvin 2026-06-03): URL = estado painel aberto
    syncDeepLinkUrl('wallet');
    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', _onOutsideClick, { once: true });
    }, 0);
}
/**
 * Close the wallet dropdown panel.
 * Fecha o painel dropdown.
 */
export function closeWalletPanel() {
    if (_dropdown) {
        _dropdown.classList.remove('active');
        clearDeepLinkUrl();
    }
    _isOpen = false;
    document.removeEventListener('click', _onOutsideClick);
}
/**
 * Update wallet badge in header (called on balance change).
 * Atualiza badge no icone da carteira.
 *
 * @param {number} [balance] - Balance in microtokens
 */
export async function updateWalletBadge(balance: any) {
    const badge = (document.getElementById('wallet-badge')) as any;
    if (!badge)
        return;
    const bal = balance ?? (await getBalance());
    badge.textContent = badgeECBT(bal);
}
/**
 * Show/hide wallet icon based on auth state.
 * Mostra/esconde o icone da carteira baseado no estado de autenticacao.
 *
 * @param {boolean} loggedIn
 */
export function setWalletVisible(loggedIn: any) {
    const wrapper = (document.getElementById('wallet-icon-wrapper')) as any;
    if (wrapper)
        wrapper.style.display = loggedIn ? '' : 'none';
}
// ----------------------------------------------------------------
// DOM
// ----------------------------------------------------------------
function _createDropdown() {
    const el = document.createElement('div');
    el.className = 'wallet-dropdown';
    el.id = 'wallet-dropdown';
    el.addEventListener('click', (/** @type {any} */ e) => e.stopPropagation());
    return el;
}
async function _renderContent() {
    if (!_dropdown)
        return;
    try {
        const [balance, rates, transactions] = await Promise.all([
            getBalance(),
            fetchRates(),
            getTransactions({ limit: 10 }),
        ]);
        const brlEquiv = convert(balance, 'ECBT', 'BRL', rates);
        const usdEquiv = convert(balance, 'ECBT', 'USD', rates);
        const txHtml = transactions.length > 0
            ? `<ul class="wallet-tx-list">${transactions.map(_renderTx).join('')}</ul>`
            : `<div class="wallet-empty">${escapeHtml(t('wallet.emptyState') || 'Nenhuma transacao ainda')}</div>`;
        _dropdown.innerHTML = `
            <div class="wallet-header">
                <div class="wallet-balance-display">${escapeHtml(formatECBT(balance))}</div>
                <div class="wallet-balance-fiat">
                    ~ ${escapeHtml(formatFiatValue(brlEquiv, 'BRL'))} | ${escapeHtml(formatFiatValue(usdEquiv, 'USD'))}
                </div>
            </div>
            <div class="wallet-actions">
                <button class="btn btn-primary btn-sm" data-cc-action="cc-ad69229c">
                    ${escapeHtml(t('wallet.addFunds') || 'Adicionar fundos')}
                </button>
                <button class="btn btn-secondary btn-sm" id="wallet-export-btn" type="button">
                    ${escapeHtml(t('wallet.exportData') || 'Exportar meus dados (LGPD)')}
                </button>
            </div>
            ${txHtml}
        `;
        // CBMD-001 (LGPD Art. 18 II): wire do export via addEventListener —
        // CSP-safe (sem on*= inline). O dropdown é recriado a cada abertura.
        const exportBtn = _dropdown.querySelector('#wallet-export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                void exportMyBalanceDataCsv();
            });
        }
    }
    catch (err: any) {
        log.error('Failed to render wallet', /** @type {any} */ (err).message);
        _dropdown.innerHTML = `
            <div class="wallet-empty">
                ${escapeHtml(t('wallet.error') || 'Erro ao carregar carteira')}
            </div>
        `;
    }
}
/**
 * Render a single transaction item.
 * @param {any} tx
 * @returns {string} HTML
 */
function _renderTx(tx: any) {
    const isCredit = tx.amount > 0;
    const cls = isCredit ? 'credit' : 'debit';
    const sign = isCredit ? '+' : '';
    const icon = isCredit ? '&#9650;' : '&#9660;'; // triangulo up/down
    const amount = (tx.amount || 0) / 1_000_000;
    const desc = tx.description || _txTypeLabel(tx.type);
    const date = _relativeDate(tx.created_at);
    return `
        <li class="wallet-tx-item">
            <div class="wallet-tx-icon ${cls}">${icon}</div>
            <div class="wallet-tx-detail">
                <div class="wallet-tx-desc">${escapeHtml(desc)}</div>
                <div class="wallet-tx-date">${escapeHtml(date)}</div>
            </div>
            <div class="wallet-tx-amount ${cls}">${sign}$ECBT ${Math.abs(amount).toFixed(2)}</div>
        </li>
    `;
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @param {any} type
 */
function _txTypeLabel(type: any) {
    /** @type {Record<string, string>} */
    const labels = {
        topup: t('wallet.txTopup') || 'Top-up',
        purchase: t('wallet.txPurchase') || 'Compra',
        subscription: t('wallet.txSubscription') || 'Assinatura',
        refund: t('wallet.txRefund') || 'Reembolso',
        bounty: t('wallet.txBounty') || 'Recompensa',
        creator_revenue: t('wallet.txRevenue') || 'Receita',
        transfer: t('wallet.txTransfer') || 'Transferencia',
    };
    return (labels as Record<string,any>)[type] || type;
}
/**
 * @param {any} isoString
 */
function _relativeDate(isoString: any) {
    if (!isoString)
        return '';
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1)
        return t('wallet.justNow') || 'agora';
    if (mins < 60)
        return `${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30)
        return `${days}d`;
    return new Date(isoString).toLocaleDateString();
}
/**
 * @param {any} e
 */
function _onOutsideClick(e: any) {
    const wrapper = (document.getElementById('wallet-icon-wrapper')) as any;
    if (wrapper && !wrapper.contains(e.target)) {
        closeWalletPanel();
    }
    else {
        // Re-add listener se clicou dentro
        document.addEventListener('click', _onOutsideClick, { once: true });
    }
}
