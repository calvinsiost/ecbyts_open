// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   BUYER PURCHASES PANEL — T2.3a/b/c (SPEC_COMMERCIAL_READINESS_DOD)

   "Minhas Compras" do COMPRADOR no marketplace:
   - T2.3a: botão "Abrir disputa" por compra → edge market-v2
     POST /orders/:id/disputes (backend já existente: market_disputes +
     market_notify; rate-limit e validação no edge).
   - T2.3b: botão "Confirmar recebimento" → edge market-v2
     POST /orders/:id/accept-delivery (status delivered→accepted).
   - T2.3c: acompanhamento do status da disputa por compra (leitura de
     market_disputes via RLS market_disputes_read — só as do próprio user).

   Padrões da casa: .ecbt-overlay/.ecbt-dialog--sm, attachModalA11y,
   i18n t()||fallback, listeners com AbortController, lógica de decisão
   em _buyerPurchasesPure (testável em node puro). O client apresenta;
   segurança é RLS/edge.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import { getSupabaseClient, getCurrentUser } from '../auth/session.js';
import { attachModalA11y } from './modalA11y.js';
import { Z_INDEX } from './zIndex.js';
import { acceptOrderDelivery, openOrderDispute } from '../libraries/marketV2Client.js';
import {
    buildBuyerPurchaseRows,
    disputeStatusCls,
    isValidDisputeReason,
    DISPUTE_REASON_CODES,
    type BuyerPurchaseRow,
} from './_buyerPurchasesPure.js';

const OVERLAY_ID = 'buyer-purchases-overlay';
let _controller: AbortController | null = null;
let _a11yCleanup: (() => void) | null = null;

/** Abre o painel "Minhas Compras" (gate de sessão). */
export async function openBuyerPurchasesPanel() {
    const userId = getCurrentUser?.()?.id || null;
    if (!userId) {
        showToast(t('buyer.purchases.loginRequired') || 'Entre na sua conta para ver suas compras.', 'warning');
        return;
    }
    closeBuyerPurchasesPanel();
    _controller = new AbortController();
    const { signal } = _controller;

    const overlay = document.createElement('div');
    overlay.className = 'ecbt-overlay';
    overlay.id = OVERLAY_ID;
    overlay.style.zIndex = String(Z_INDEX.ASYNC_DIALOG);
    overlay.innerHTML = `
      <div class="ecbt-dialog ecbt-dialog--sm bpurch-dialog" role="dialog" aria-modal="true"
           aria-labelledby="bpurch-title">
        <div class="oworks-header">
          <h2 id="bpurch-title">${escapeHtml(t('buyer.purchases.title') || 'Minhas Compras')}</h2>
          <button class="oworks-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
        </div>
        <div class="oworks-body">
          <p class="oworks-hint">${escapeHtml(t('buyer.purchases.hint') ||
              'Suas compras no marketplace. Confirme o recebimento quando estiver tudo certo — ou abra uma disputa se algo deu errado.')}</p>
          <div class="oworks-list" id="bpurch-list" aria-live="polite" role="list">
            <p class="oworks-empty">${escapeHtml(t('loading') || 'Carregando…')}</p>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    _a11yCleanup = attachModalA11y(overlay, closeBuyerPurchasesPanel);
    overlay.querySelector('.oworks-close')?.addEventListener('click', closeBuyerPurchasesPanel, { signal });

    // Delegação: botões são re-renderizados a cada refresh.
    overlay.querySelector('#bpurch-list')?.addEventListener(
        'click',
        (e: Event) => {
            const btn = (e.target as HTMLElement)?.closest('button[data-action]') as HTMLButtonElement | null;
            if (!btn || btn.disabled) return;
            const orderId = btn.dataset.orderId || '';
            if (!orderId) return;
            if (btn.dataset.action === 'accept') void _confirmReceipt(overlay, userId, orderId, btn);
            if (btn.dataset.action === 'dispute') _toggleDisputeForm(overlay, orderId);
            if (btn.dataset.action === 'dispute-submit') void _submitDispute(overlay, userId, orderId, btn);
        },
        { signal },
    );

    await _refresh(overlay, userId);
}

export function closeBuyerPurchasesPanel() {
    _controller?.abort();
    _controller = null;
    try {
        _a11yCleanup?.();
    } catch (e: any) {
        console.debug('[buyerPurchases] a11y cleanup:', e?.message || e);
    }
    _a11yCleanup = null;
    document.getElementById(OVERLAY_ID)?.remove();
}

/** Carrega pedidos + disputas do comprador (RLS restringe às próprias linhas). */
async function _loadData(userId: string): Promise<{ orders: any[]; disputes: any[] }> {
    const out = { orders: [] as any[], disputes: [] as any[] };
    try {
        const client: any = getSupabaseClient();
        if (!client) return out;
        const { data: orders } = await client
            .from('market_orders')
            .select('id, listing_id, status, amount_cents, currency, created_at, delivered_at, accepted_at')
            .eq('buyer_user_id', userId)
            .order('created_at', { ascending: false })
            .limit(100);
        out.orders = Array.isArray(orders) ? orders : [];
        if (out.orders.length) {
            const ids = out.orders.map((o: any) => o.id).filter(Boolean);
            const { data: disputes } = await client
                .from('market_disputes')
                .select('id, order_id, status, reason_code, created_at, resolution_note')
                .in('order_id', ids)
                .limit(100);
            out.disputes = Array.isArray(disputes) ? disputes : [];
        }
    } catch (e: any) {
        console.debug('[buyerPurchases] load:', e?.message || e);
    }
    return out;
}

async function _refresh(overlay: HTMLElement, userId: string) {
    const list = overlay.querySelector('#bpurch-list');
    if (!list) return;
    const { orders, disputes } = await _loadData(userId);
    const rows = buildBuyerPurchaseRows(orders, disputes);
    list.innerHTML = rows.length
        ? rows.map(_rowHtml).join('')
        : `<p class="oworks-empty">${escapeHtml(t('buyer.purchases.none') || 'Você ainda não tem compras no marketplace.')}</p>`;
}

const _ORDER_STATUS_LABEL = (): Record<string, string> => ({
    pending_payment: t('buyer.purchases.stPending') || 'aguardando pagamento',
    paid: t('buyer.purchases.stPaid') || 'paga',
    delivered: t('buyer.purchases.stDelivered') || 'entregue',
    accepted: t('buyer.purchases.stAccepted') || 'recebimento confirmado',
    disputed: t('buyer.purchases.stDisputed') || 'em disputa',
    refunded: t('buyer.purchases.stRefunded') || 'reembolsada',
    cancelled: t('buyer.purchases.stCancelled') || 'cancelada',
    chargeback: t('buyer.purchases.stChargeback') || 'chargeback',
});

const _DISPUTE_STATUS_LABEL = (): Record<string, string> => ({
    opened: t('buyer.purchases.dOpened') || 'disputa aberta',
    evidence: t('buyer.purchases.dEvidence') || 'coleta de evidências',
    mediation: t('buyer.purchases.dMediation') || 'em mediação',
    seller_won: t('buyer.purchases.dSellerWon') || 'resolvida a favor do vendedor',
    buyer_won: t('buyer.purchases.dBuyerWon') || 'resolvida a seu favor',
    partial_refund: t('buyer.purchases.dPartialRefund') || 'reembolso parcial',
    cancelled: t('buyer.purchases.dCancelled') || 'disputa cancelada',
    closed: t('buyer.purchases.dClosed') || 'disputa encerrada',
});

function _rowHtml(r: BuyerPurchaseRow): string {
    const oid = escapeHtml(r.orderId);
    const statusLabel = _ORDER_STATUS_LABEL()[r.status] || r.status;
    // T2.3c — badge de acompanhamento do status da disputa
    const disputeBadge = r.disputeStatus
        ? `<span class="oworks-badge ${disputeStatusCls(r.disputeStatus)}" data-dispute-status="${escapeHtml(r.disputeStatus)}">
             ${escapeHtml(_DISPUTE_STATUS_LABEL()[r.disputeStatus] || r.disputeStatus)}</span>`
        : '';
    const acceptBtn = r.canConfirmReceipt
        ? `<button type="button" class="btn btn-primary bpurch-btn" data-action="accept" data-order-id="${oid}">
             ${escapeHtml(t('buyer.purchases.confirmReceipt') || 'Confirmar recebimento')}</button>`
        : '';
    const disputeBtn = r.canOpenDispute
        ? `<button type="button" class="btn bpurch-btn" data-action="dispute" data-order-id="${oid}">
             ${escapeHtml(t('buyer.purchases.openDispute') || 'Abrir disputa')}</button>`
        : '';
    const reasons = DISPUTE_REASON_CODES.map(
        (c) => `<option value="${escapeHtml(c)}">${escapeHtml(t(`buyer.purchases.reason.${c}`) || c)}</option>`,
    ).join('');
    const disputeForm = r.canOpenDispute
        ? `<div class="bpurch-dispute-form" data-order-id="${oid}" hidden>
             <label>
               <span>${escapeHtml(t('buyer.purchases.reasonLabel') || 'Motivo da disputa')}</span>
               <select class="bpurch-reason" aria-label="${escapeHtml(t('buyer.purchases.reasonLabel') || 'Motivo da disputa')}">${reasons}</select>
             </label>
             <button type="button" class="btn btn-primary bpurch-btn" data-action="dispute-submit" data-order-id="${oid}">
               ${escapeHtml(t('buyer.purchases.disputeSubmit') || 'Enviar disputa')}</button>
           </div>`
        : '';
    return `<div class="oworks-row bpurch-row" role="listitem" data-order-id="${oid}">
        <span>${escapeHtml(r.dateIso)}</span>
        <strong>${escapeHtml(r.amountLabel)}</strong>
        <span class="oworks-badge ${r.statusCls}">${escapeHtml(statusLabel)}</span>
        ${disputeBadge}
        ${acceptBtn}
        ${disputeBtn}
        ${disputeForm}
      </div>`;
}

/** T2.3b — confirma recebimento via edge (delivered → accepted). */
async function _confirmReceipt(overlay: HTMLElement, userId: string, orderId: string, btn: HTMLButtonElement) {
    btn.disabled = true;
    try {
        await acceptOrderDelivery(orderId);
        showToast(t('buyer.purchases.receiptConfirmed') || 'Recebimento confirmado. Obrigado!', 'success');
        await _refresh(overlay, userId);
    } catch (e: any) {
        console.debug('[buyerPurchases] accept:', e?.message || e);
        btn.disabled = false;
        showToast(t('buyer.purchases.receiptError') || 'Não foi possível confirmar o recebimento.', 'error');
    }
}

function _toggleDisputeForm(overlay: HTMLElement, orderId: string) {
    const form = overlay.querySelector(`.bpurch-dispute-form[data-order-id="${CSS.escape(orderId)}"]`) as HTMLElement | null;
    if (form) form.hidden = !form.hidden;
}

/** T2.3a — abre a disputa via edge (valida buyer/status, notifica a outra parte). */
async function _submitDispute(overlay: HTMLElement, userId: string, orderId: string, btn: HTMLButtonElement) {
    const form = btn.closest('.bpurch-dispute-form');
    const reason = (form?.querySelector('.bpurch-reason') as HTMLSelectElement | null)?.value || '';
    if (!isValidDisputeReason(reason)) {
        showToast(t('buyer.purchases.reasonInvalid') || 'Escolha um motivo para a disputa.', 'warning');
        return;
    }
    btn.disabled = true;
    try {
        await openOrderDispute(orderId, { reason_code: reason });
        showToast(t('buyer.purchases.disputeOpened') || 'Disputa aberta. Você será notificado do andamento.', 'success');
        await _refresh(overlay, userId);
    } catch (e: any) {
        console.debug('[buyerPurchases] dispute:', e?.message || e);
        btn.disabled = false;
        showToast(t('buyer.purchases.disputeError') || 'Não foi possível abrir a disputa.', 'error');
    }
}

/** Expõe os openers globais (padrão registerOwnerWorksHandlers). */
export function registerBuyerPurchasesHandlers() {
    (window as any).openBuyerPurchasesPanel = openBuyerPurchasesPanel;
    (window as any).closeBuyerPurchasesPanel = closeBuyerPurchasesPanel;
}
