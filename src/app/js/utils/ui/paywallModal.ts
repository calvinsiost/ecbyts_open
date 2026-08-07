// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PAYWALL MODAL — Credit-based upgrade prompt
   Modal contextual que aparece quando creditos sao insuficientes.
   Mostra saldo, presets de compra (top-up), e opcao de upgrade.

   Chamado por checkAndConsume() via showQuotaBlockedModal().
   Modelo: creditos ECBT (nao tiers fixos).
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { CREDIT_PACKAGES, calculateCreditCost } from '../../core/metering/creditPricing.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let _overlay: any = null;
// ----------------------------------------------------------------
// CREATE OVERLAY
// ----------------------------------------------------------------
function _createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'paywall-modal-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9100;';
    const modal = document.createElement('div');
    modal.id = 'paywall-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--md';
    overlay.appendChild(modal);
    overlay.addEventListener('click', (/** @type {any} */ e) => {
        if (e.target === overlay) closePaywallModal();
    });
    overlay.addEventListener('keydown', (/** @type {any} */ e) => {
        if (e.key === 'Escape') closePaywallModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
/**
 * @param {any} blockedMetric
 * @param {any} _quotaInfo
 */
function _render(blockedMetric: any, _quotaInfo: any) {
    const modal = _overlay?.querySelector('#paywall-modal');
    if (!modal) return;
    const metricLabels = {
        observations: t('observations') || 'Observacoes',
        eco1_exports: t('exports') || 'Exportacoes',
        models: t('models') || 'Modelos',
        elements: t('elements') || 'Elementos',
        eis_runs: 'EIS',
        llm_tokens: 'AI Tokens',
        mcp_calls: 'MCP',
    };
    const metricLabel = (metricLabels as Record<string,any>)[blockedMetric] || blockedMetric;
    const creditCost = calculateCreditCost(blockedMetric, 1);
    // Top-up presets (apenas onetime)
    const topups = CREDIT_PACKAGES.filter((/** @type {any} */ p) => p.type === 'onetime');
    // Pacotes mensais pagos
    const monthly = CREDIT_PACKAGES.filter((/** @type {any} */ p) => p.type === 'monthly' && p.price_brl > 0);
    let html = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(t('credits.exhausted') || 'Creditos Esgotados')}</h3>
            <button class="ecbt-close paywall-close" aria-label="${escapeHtml(t('common.close') || 'Close')}">&times;</button>
        </div>

        <div class="paywall-blocked-info">
            <div class="paywall-blocked-icon">&#9888;</div>
            <div>
                <strong>${escapeHtml(metricLabel)}</strong>: ${escapeHtml(t('credits.operationCost') || 'custo')}: ${creditCost} ${escapeHtml(t('credits.remaining') || 'creditos')}
                <br><span class="paywall-blocked-sub">${escapeHtml(t('credits.insufficientMsg') || 'Creditos insuficientes para esta operacao.')}</span>
            </div>
        </div>

        <div class="paywall-section">
            <h4 class="paywall-section-title">${escapeHtml(t('credits.buyTopup') || 'Comprar creditos (imediato)')}</h4>
            <div class="paywall-topup-grid">
    `;
    for (const pkg of topups) {
        html += `
            <button class="paywall-topup-btn" data-package="${escapeHtml(pkg.id)}">
                <span class="paywall-topup-credits">${pkg.credits.toLocaleString('pt-BR')}</span>
                <span class="paywall-topup-label">${escapeHtml(t('credits.remaining') || 'creditos')}</span>
                <span class="paywall-topup-price">R$ ${pkg.price_brl}</span>
            </button>
        `;
    }
    html += `</div></div>`;
    // Upgrade section
    html += `
        <div class="paywall-section">
            <h4 class="paywall-section-title">${escapeHtml(t('credits.upgradePackage') || 'Ou fazer upgrade de pacote mensal')}</h4>
            <div class="paywall-upgrade-list">
    `;
    for (const pkg of monthly) {
        html += `
            <button class="paywall-upgrade-btn" data-package="${escapeHtml(pkg.id)}">
                <span class="paywall-upgrade-name">${escapeHtml(pkg.name)}</span>
                <span class="paywall-upgrade-detail">${pkg.credits.toLocaleString('pt-BR')} ${escapeHtml(t('credits.remaining') || 'creditos')}/mes</span>
                <span class="paywall-upgrade-price">R$ ${pkg.price_brl}/mes</span>
            </button>
        `;
    }
    html += `</div></div>`;
    // Footer
    html += `
        <div class="paywall-footer">
            <p>${escapeHtml(t('credits.dataExportAlways') || 'Seus dados estao seguros. Voce pode exportar a qualquer momento, mesmo sem creditos.')}</p>
            <div class="paywall-actions">
                <button class="paywall-btn-wait paywall-close">${escapeHtml(t('credits.waitRenewal') || 'Aguardar renovacao')}</button>
            </div>
        </div>
    `;
    modal.innerHTML = html;
    // Bind events
    modal.querySelectorAll('.paywall-close').forEach((btn: any) => {
        btn.addEventListener('click', closePaywallModal);
    });
    modal.querySelectorAll('.paywall-topup-btn, .paywall-upgrade-btn').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            try {
                btn.disabled = true;
                const pkgId = btn.dataset.package || '';
                closePaywallModal();
                const { openCheckoutModal } = await import('./checkoutModal.js' as string);
                const pkg = CREDIT_PACKAGES.find((/** @type {any} */ p) => p.id === pkgId);
                openCheckoutModal(pkgId, null, {
                    itemName: pkg?.name || pkgId,
                    itemSubtitle: pkg?.type === 'onetime' ? 'Top-up' : 'Mensal',
                });
            } catch (err: any) {
                const { showToast } = await import('./toast.js' as string);
                showToast(err.message || 'Erro no checkout', 'error');
                btn.disabled = false;
            }
        });
    });
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Show the paywall modal when credits are insufficient.
 * Called by checkAndConsume() or any blocking gate.
 *
 * @param {string} metric - The metric that was blocked
 * @param {{ used?: number, limit?: number }} [quotaInfo={}]
 */
export function showQuotaBlockedModal(metric: any, quotaInfo: any = {}) {
    if (!_overlay) _overlay = _createOverlay();
    _overlay.style.display = 'flex';
    _render(metric, quotaInfo);
}
/**
 * Close the paywall modal.
 */
export function closePaywallModal() {
    if (_overlay) _overlay.style.display = 'none';
}
