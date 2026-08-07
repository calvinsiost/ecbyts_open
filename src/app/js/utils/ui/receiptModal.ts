// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * COMMERCIAL-READINESS T6.4 (claude-omni, 2026-07-16) — tela persistente de
 * confirmação pós-pagamento com recibo.
 *
 * Antes: sucesso de pagamento era só um toast de 3 segundos que desaparecia —
 * o cliente não tinha comprovante nem próximo passo. Esta tela renderiza o
 * recibo pure-logic (T9.3 `_receiptExportPure.ts`) no padrão de modal da casa
 * (.ecbt-overlay/.ecbt-dialog--sm + attachModalA11y, cf. postPurchaseModal.ts)
 * e oferece:
 *   - resumo do recibo (id, transação, data, item, valores);
 *   - botão "Baixar recibo" (.txt via Blob, sem rede);
 *   - próximo passo por tipo de item (assinatura/top-up/genérico).
 *
 * NOTA (escopo): compra de BIBLIOTECA continua coberta pelo postPurchaseModal
 * (T9.2b) — os callers NÃO devem abrir este modal para itemType 'library'.
 */
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';
import {
    buildReceipt,
    buildReceiptText,
    buildReceiptFilename,
    type Receipt,
    type ReceiptInput,
} from '../../core/billing/_receiptExportPure.js';

let _a11yCleanup: (() => void) | null = null;

function _getOrCreateOverlay(): HTMLElement {
    const existing = document.getElementById('receipt-modal-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'receipt-modal-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9210;';
    const modal = document.createElement('div');
    modal.id = 'receipt-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--sm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeReceiptModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

/** Próximo passo humano por tipo de item (assinatura/top-up/genérico). */
function _nextStepText(itemType: string): string {
    if (itemType.startsWith('subscription')) {
        return (
            t('receipt.next.subscription') ||
            'Sua assinatura está ativa. Os recursos do plano já estão liberados.'
        );
    }
    if (itemType === 'topup') {
        return (
            t('receipt.next.topup') ||
            'Os fundos foram adicionados ao seu saldo $ECBT e já podem ser usados.'
        );
    }
    return (
        t('receipt.next.generic') ||
        'Sua compra foi registrada na carteira e o item já está disponível.'
    );
}

function _row(label: string, value: string): string {
    if (!value) return '';
    return `
        <div style="display:flex;justify-content:space-between;gap:12px;padding:4px 0;">
            <span style="color:var(--text-secondary,#888);">${escapeHtml(label)}</span>
            <span style="text-align:right;word-break:break-all;">${escapeHtml(value)}</span>
        </div>`;
}

function _formatEcbt(amount: number): string {
    return `${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $ECBT`;
}

function _downloadReceipt(input: ReceiptInput, issuedAtMs: number): void {
    try {
        const text = buildReceiptText(input, issuedAtMs);
        const filename = buildReceiptFilename(String(input.txId || 'purchase'), issuedAtMs);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err: any) {
        console.debug('[receiptModal] download:', err?.message || err);
    }
}

function _render(modal: HTMLElement, receipt: Receipt, input: ReceiptInput, issuedAtMs: number): void {
    const title = t('receipt.title') || 'Pagamento confirmado';
    const subtitle =
        t('receipt.subtitle') || 'Guarde este comprovante — você também pode baixá-lo como arquivo.';
    const dateLocal = receipt.issuedAtIso ? new Date(receipt.issuedAtIso).toLocaleString() : '';
    const fiat =
        receipt.amountFiat !== '' && receipt.currency
            ? `${(receipt.amountFiat as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${receipt.currency}`
            : '';
    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(title)}</h3>
            <button class="ecbt-close receipt-modal-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
        </div>
        <div class="receipt-modal-body" aria-live="polite" style="padding:4px 2px 0;">
            <p style="margin:0 0 10px;color:var(--text-secondary,#888);">${escapeHtml(subtitle)}</p>
            <div style="border:1px solid var(--border-color,#333);border-radius:8px;padding:10px 12px;font-size:0.92em;">
                ${_row(t('receipt.receiptId') || 'Recibo', receipt.receiptId)}
                ${_row(t('receipt.txId') || 'Transação', receipt.txId)}
                ${_row(t('receipt.date') || 'Data', dateLocal)}
                ${_row(t('receipt.item') || 'Item', receipt.itemName || receipt.itemType)}
                ${_row(t('receipt.amount') || 'Valor', receipt.amountEcbt > 0 ? _formatEcbt(receipt.amountEcbt) : '')}
                ${_row(t('receipt.amountFiat') || 'Valor pago', fiat)}
            </div>
            <p style="margin:12px 0 0;">${escapeHtml(_nextStepText(receipt.itemType))}</p>
        </div>
        <div class="receipt-modal-footer" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px;">
            <button type="button" class="ecbt-btn ecbt-btn--outline receipt-modal-download">${escapeHtml(t('receipt.download') || 'Baixar recibo')}</button>
            <button type="button" class="ecbt-btn ecbt-btn--primary receipt-modal-continue">${escapeHtml(t('receipt.continue') || 'Continuar')}</button>
        </div>
    `;
    modal.querySelector('.receipt-modal-close')?.addEventListener('click', closeReceiptModal);
    modal.querySelector('.receipt-modal-continue')?.addEventListener('click', closeReceiptModal);
    modal
        .querySelector('.receipt-modal-download')
        ?.addEventListener('click', () => _downloadReceipt(input, issuedAtMs));
}

/**
 * Abre a tela persistente de confirmação pós-pagamento com recibo.
 * `input.amountEcbt` em TOKENS (não microtokens) — o recibo exibe cru.
 * Não usar para itemType 'library' (postPurchaseModal é o primário lá).
 */
export function openReceiptModal(input: ReceiptInput): void {
    const issuedAtMs = Number(input?.timestampMs) > 0 ? Number(input.timestampMs) : Date.now();
    const receipt = buildReceipt(input, issuedAtMs);
    const overlay = _getOrCreateOverlay();
    const modal = overlay.querySelector('#receipt-modal') as HTMLElement | null;
    if (modal) _render(modal, receipt, input, issuedAtMs);
    overlay.style.display = 'flex';
    _a11yCleanup = attachModalA11y(overlay, closeReceiptModal);
}

export function closeReceiptModal(): void {
    const overlay = document.getElementById('receipt-modal-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}
