// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   WALLET HANDLERS — Window-exposed handlers for $ECBT wallet & checkout
   Handlers globais para carteira $ECBT e checkout unificado.

   Todas as funcoes sao registradas em window.* via handlers/index.js
   para uso nos onclick do HTML.
   ================================================================ */
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Wallet');
// ----------------------------------------------------------------
// WALLET PANEL
// ----------------------------------------------------------------
/**
 * Open the wallet dropdown panel.
 * Abre o painel dropdown da carteira $ECBT.
 */
async function handleOpenWallet() {
    try {
        const { openWalletPanel } = await import('../ui/walletPanel.js' as string);
        openWalletPanel();
    }
    catch (err: any) {
        log.error('Failed to open wallet panel', err?.message);
        showToast(t('wallet.error') || 'Erro ao abrir carteira', 'error');
    }
}
/**
 * Close the wallet dropdown panel.
 * Fecha o painel dropdown da carteira.
 */
async function handleCloseWallet() {
    try {
        const { closeWalletPanel } = await import('../ui/walletPanel.js' as string);
        closeWalletPanel();
    }
    catch (e: any) {
        console.debug('[wallet] close-panel-import-failed:', e?.message || e);
        /* noop */
    }
}
// ----------------------------------------------------------------
// CHECKOUT
// ----------------------------------------------------------------
/**
 * Open unified checkout modal for a specific item.
 * Abre o modal de checkout unificado.
 *
 * @param {string} itemType - Tipo do item ('subscription_pro', 'library', 'topup', etc.)
 * @param {string} [itemId] - ID do item (para libraries, listings)
 * @param {Record<string, unknown>} [options] - Opcoes adicionais
 */
async function handleOpenCheckout(itemType: any, itemId: any, options: any) {
    try {
        const { openCheckoutModal } = await import('../ui/checkoutModal.js' as string);
        openCheckoutModal(itemType, itemId ?? null, options);
    }
    catch (err: any) {
        log.error('Failed to open checkout', err?.message);
        showToast(t('checkout.error') || 'Erro ao abrir checkout', 'error');
    }
}
/**
 * Close the checkout modal.
 * Fecha o modal de checkout.
 */
async function handleCloseCheckout() {
    try {
        const { closeCheckoutModal } = await import('../ui/checkoutModal.js' as string);
        closeCheckoutModal();
    }
    catch (e: any) {
        console.debug('[wallet] close-checkout-import-failed:', e?.message || e);
        /* noop */
    }
}
/**
 * Open checkout in top-up mode.
 * Abre checkout para adicionar fundos.
 *
 * @param {string} [presetAmount] - Valor preset ('100','500','1000','5000')
 */
async function handleTopUp(presetAmount: any) {
    try {
        const { openCheckoutModal } = await import('../ui/checkoutModal.js' as string);
        openCheckoutModal('topup', null, { presetAmount: presetAmount ?? null });
    }
    catch (err: any) {
        log.error('Failed to open top-up', err?.message);
        showToast(t('wallet.topupError') || 'Erro ao adicionar fundos', 'error');
    }
}
// ----------------------------------------------------------------
// CREDITS HUB (mobile-first consolidated ECBT + EIC)
// ----------------------------------------------------------------
/**
 * Open consolidated credits hub.
 * Abre o Hub de Creditos consolidado.
 *
 * @param {Object} [options]
 * @param {string} [options.source]
 */
async function handleOpenCreditsHub(options: any) {
    try {
        const { closeWalletPanel } = await import('../ui/walletPanel.js' as string);
        closeWalletPanel();
    }
    catch (e: any) {
        console.debug('[wallet] hub-prep-close-wallet-failed:', e?.message || e);
        /* noop */
    }
    try {
        const { openCreditsHub } = await import('../ui/creditsHub.js' as string);
        await openCreditsHub(options || {});
    }
    catch (err: any) {
        log.error('Failed to open credits hub', err?.message);
        showToast('Erro ao abrir hub de creditos', 'error');
    }
}
/**
 * Close consolidated credits hub.
 * Fecha o Hub de Creditos consolidado.
 */
async function handleCloseCreditsHub() {
    try {
        const { closeCreditsHub } = await import('../ui/creditsHub.js' as string);
        closeCreditsHub();
    }
    catch (e: any) {
        console.debug('[wallet] close-credits-hub-import-failed:', e?.message || e);
        /* noop */
    }
}
/**
 * Refresh consolidated credits hub data.
 * Atualiza dados do Hub de Creditos.
 */
async function handleRefreshCreditsHub() {
    try {
        const { refreshCreditsHub } = await import('../ui/creditsHub.js' as string);
        await refreshCreditsHub();
    }
    catch (e: any) {
        console.debug('[wallet] refresh-credits-hub-failed:', e?.message || e);
        /* noop */
    }
}
// ----------------------------------------------------------------
// BALANCE BADGE - update wallet icon badge
// ----------------------------------------------------------------
/**
 * Update the wallet badge in the titlebar.
 * Atualiza o badge de saldo no icone da carteira.
 *
 * @param {number} [balance] - Balance in microtokens (fetches if omitted)
 */
async function handleUpdateWalletBadge(balance: any) {
    try {
        const badge = document.getElementById('wallet-badge');
        if (!badge)
            return;
        /** @type {number|undefined} */
        let bal = balance;
        if (bal == null) {
            const { getBalance } = await import('../../core/currency/ecbtLedger.js' as string);
            bal = await getBalance();
        }
        const { badgeECBT } = await import('../helpers/currencyFormat.js' as string);
        badge.textContent = badgeECBT(bal);
    }
    catch (e: any) {
        console.debug('[wallet] badge-update-best-effort-failed:', e?.message || e);
        /* noop — badge update is best-effort */
    }
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const walletHandlers = {
    handleOpenWallet,
    handleCloseWallet,
    handleOpenCheckout,
    handleCloseCheckout,
    handleTopUp,
    handleOpenCreditsHub,
    handleCloseCreditsHub,
    handleRefreshCreditsHub,
    handleUpdateWalletBadge,
};
