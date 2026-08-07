// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   BUYER PURCHASES — view-model puro (T2.3a/b/c, SPEC_COMMERCIAL_READINESS_DOD)

   Lógica sem DOM do painel "Minhas Compras" do COMPRADOR:
   - quais compras (market_orders) permitem "Confirmar recebimento"
     (só status 'delivered' — mesma regra do edge /orders/:id/accept-delivery);
   - quais permitem "Abrir disputa" (paid|delivered|accepted, e sem disputa
     já aberta — o edge devolve 409 dispute_already_exists);
   - rótulo/classe de cada status de disputa (enum market_dispute_status).

   Regras espelham o backend (marketplace_v2.sql + market-v2/disputes.ts);
   o client NUNCA decide segurança — RLS/edge validam de novo.
   ================================================================ */

export const BUYER_PURCHASES_SCHEMA_VERSION = 1;

/** Estados de pedido em que o edge aceita abertura de disputa. */
export const DISPUTABLE_ORDER_STATUSES = new Set(['paid', 'delivered', 'accepted']);

/** Estado de pedido em que o comprador pode confirmar o recebimento. */
export const ACCEPTABLE_ORDER_STATUS = 'delivered';

/** Códigos de motivo aceitos no formulário de disputa (reason_code, 2..100 chars no edge). */
export const DISPUTE_REASON_CODES = ['not_delivered', 'not_as_described', 'corrupted_file', 'other'] as const;

export interface BuyerOrderLike {
    id?: string;
    status?: string;
    amount_cents?: number;
    currency?: string;
    created_at?: string;
    delivered_at?: string | null;
    accepted_at?: string | null;
    listing_id?: string;
}

export interface BuyerDisputeLike {
    id?: string;
    order_id?: string | null;
    status?: string;
    reason_code?: string;
    created_at?: string;
    resolution_note?: string | null;
}

export interface BuyerPurchaseRow {
    orderId: string;
    listingId: string;
    status: string;
    statusCls: string;
    amountLabel: string;
    dateIso: string;
    canConfirmReceipt: boolean;
    canOpenDispute: boolean;
    disputeId: string | null;
    disputeStatus: string | null;
}

const ORDER_STATUS_CLS: Record<string, string> = {
    pending_payment: 'neutral',
    paid: 'ok',
    delivered: 'ok',
    accepted: 'ok',
    disputed: 'warn',
    refunded: 'warn',
    cancelled: 'bad',
    chargeback: 'bad',
};

/** Classe visual (ok/warn/bad/neutral) por status de disputa. */
const DISPUTE_STATUS_CLS: Record<string, string> = {
    opened: 'warn',
    evidence: 'warn',
    mediation: 'warn',
    buyer_won: 'ok',
    partial_refund: 'ok',
    seller_won: 'bad',
    cancelled: 'neutral',
    closed: 'neutral',
};

/** cents+currency → "R$ 12,34" / "$12.34" (fallback simples sem Intl quebrar). */
export function formatAmountCents(cents: unknown, currency: unknown): string {
    if (cents == null || cents === '') return '—';
    const n = Number(cents);
    if (!Number.isFinite(n)) return '—';
    const cur = String(currency || 'usd').toUpperCase();
    const value = n / 100;
    try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(value);
    } catch {
        return `${cur} ${value.toFixed(2)}`;
    }
}

/** T2.3b — regra do botão "Confirmar recebimento" (espelha o edge accept-delivery). */
export function canConfirmReceipt(order: BuyerOrderLike | null | undefined): boolean {
    return !!order && order.status === ACCEPTABLE_ORDER_STATUS;
}

/** T2.3a — regra do botão "Abrir disputa" (espelha handleOpenDispute + unique order_id). */
export function canOpenDispute(
    order: BuyerOrderLike | null | undefined,
    existingDispute: BuyerDisputeLike | null | undefined,
): boolean {
    if (!order || !order.id) return false;
    if (existingDispute) return false;
    return DISPUTABLE_ORDER_STATUSES.has(String(order.status || ''));
}

/** Valida o reason_code do formulário (mesmos limites do edge: 2..100 chars). */
export function isValidDisputeReason(code: unknown): boolean {
    const s = String(code ?? '').trim();
    return s.length >= 2 && s.length <= 100;
}

/** Classe visual do status de disputa (T2.3c). */
export function disputeStatusCls(status: unknown): string {
    return DISPUTE_STATUS_CLS[String(status || '')] || 'neutral';
}

/** Classe visual do status do pedido. */
export function orderStatusCls(status: unknown): string {
    return ORDER_STATUS_CLS[String(status || '')] || 'neutral';
}

/**
 * Monta as linhas do painel: pedidos do comprador + disputa associada (se houver),
 * mais recentes primeiro. Linhas sem id são descartadas (dados corrompidos não
 * viram botões clicáveis).
 */
export function buildBuyerPurchaseRows(
    orders: BuyerOrderLike[] | null | undefined,
    disputes: BuyerDisputeLike[] | null | undefined,
): BuyerPurchaseRow[] {
    const byOrder = new Map<string, BuyerDisputeLike>();
    for (const d of Array.isArray(disputes) ? disputes : []) {
        if (d && d.order_id && d.id) byOrder.set(String(d.order_id), d);
    }
    const rows: BuyerPurchaseRow[] = [];
    for (const o of Array.isArray(orders) ? orders : []) {
        if (!o || !o.id) continue;
        const dispute = byOrder.get(String(o.id)) || null;
        rows.push({
            orderId: String(o.id),
            listingId: String(o.listing_id || ''),
            status: String(o.status || 'unknown'),
            statusCls: orderStatusCls(o.status),
            amountLabel: formatAmountCents(o.amount_cents, o.currency),
            dateIso: String(o.created_at || '').slice(0, 10),
            canConfirmReceipt: canConfirmReceipt(o),
            canOpenDispute: canOpenDispute(o, dispute),
            disputeId: dispute?.id ? String(dispute.id) : null,
            disputeStatus: dispute?.status ? String(dispute.status) : null,
        });
    }
    rows.sort((a, b) => (b.dateIso < a.dateIso ? -1 : b.dateIso > a.dateIso ? 1 : 0));
    return rows;
}
