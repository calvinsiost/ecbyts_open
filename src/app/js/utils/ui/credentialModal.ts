// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   CREDENTIAL MODAL — Envio e historico de credenciais academicas
   Modal para submissao de diplomas/certificados com verificacao por IA
   e exibicao do historico de auditoria (credential_audit_log).

   Integra com professional.js (submitCredentialRequest, getCredentialHistory,
   getUserCredentials) e session.js para autenticacao.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
import { submitCredentialRequest, getUserCredentials, getCredentialHistory } from '../cloud/professional.js';
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let _overlay: any = null;
// PERF-MASTER S3.3 - listener cleanup via AbortController.
// _render() recria DOM; abortar listeners velhos evita leak em re-aberturas.
let _abortController: any = null;
// ----------------------------------------------------------------
// CREDENTIAL TYPES - tipos aceitos pelo sistema
// ----------------------------------------------------------------
const CREDENTIAL_TYPES = [
    { value: 'professional', label: 'Professional' },
    { value: 'pos_graduado', label: 'Pos-Graduado' },
    { value: 'mestre', label: 'Mestre' },
    { value: 'doutor', label: 'Doutor' },
];
// ----------------------------------------------------------------
// STATUS BADGE - cor conforme status da credencial
// ----------------------------------------------------------------
/**
 * Returns inline style for a status badge.
 * Retorna estilo inline para badge de status.
 *
 * @param {string} status - 'pending' | 'approved' | 'rejected' | 'pending_review'
 * @returns {string} CSS inline style string
 */
function badgeClass(status: any) {
    const map = {
        pending: 'pending',
        approved: 'approved',
        rejected: 'rejected',
        // A11: revisão humana reusa o visual "pending" (amarelo) com label próprio.
        pending_review: 'pending',
    };
    return `credential-badge credential-badge--${(map as Record<string, any>)[status] || 'pending'}`;
}
/**
 * Returns localized label for a status.
 * Retorna label traduzido do status.
 *
 * @param {string} status
 * @returns {string}
 */
function statusLabel(status: any) {
    const map = {
        pending: t('credential.statusPending') || 'Pending',
        approved: t('credential.statusApproved') || 'Approved',
        rejected: t('credential.statusRejected') || 'Rejected',
        pending_review: t('credential.statusPendingReview') || 'Under human review',
    };
    return (map as Record<string, any>)[status] || status;
}
// ----------------------------------------------------------------
// CREATE MODAL DOM
// ----------------------------------------------------------------
/**
 * Builds the modal overlay element (created once, reused).
 * Constroi o overlay do modal (criado uma vez, reutilizado).
 *
 * @returns {HTMLElement} The overlay element
 */
function _createOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'credential-modal-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.display = 'none';
    const modal = document.createElement('div');
    modal.id = 'credential-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--md';
    overlay.appendChild(modal);
    // Fechar ao clicar no overlay (fora do modal)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCredentialModal();
    });
    // Fechar com Escape
    overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeCredentialModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}
// ----------------------------------------------------------------
// RENDER
// ----------------------------------------------------------------
/**
 * Renders the modal content (form + history).
 * Renderiza o conteudo do modal (formulario + historico).
 */
async function _render() {
    const modal = _overlay?.querySelector('#credential-modal');
    if (!modal) return;
    // PERF-MASTER S3.3 - abort listeners do render anterior + novo controller.
    if (_abortController) {
        try {
            _abortController.abort();
        } catch (e: any) {
            console.debug('[credentialModal] abortPrev:', e?.message || e);
        }
    }
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    // Header
    const title = t('credential.modalTitle') || 'Credential Verification';
    const closeLabel = t('close') || 'Close';
    let html = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(title)}</h3>
            <button id="credential-modal-close" class="ecbt-close" aria-label="${escapeHtml(closeLabel)}">&times;</button>
        </div>
    `;
    // -- Benefits section (before form) --
    html += `
        <div class="ecbt-form">
            <div class="credential-benefits-section">
                <h4 class="credential-section-title">${escapeHtml(t('credential.benefits_title') || 'Professional Verification Benefits')}</h4>
                <div class="credential-benefits-grid">
                    <div class="credential-benefit-card">
                        <div class="credential-benefit-icon">&#9733;</div>
                        <div class="credential-benefit-text">${escapeHtml(t('credential.benefits_eis') || 'EIS Multiplier: your data weighs more in integrity scoring')}</div>
                    </div>
                    <div class="credential-benefit-card">
                        <div class="credential-benefit-icon">&#9679;</div>
                        <div class="credential-benefit-text">${escapeHtml(t('credential.benefits_seal') || 'Verified seal visible to regulators')}</div>
                    </div>
                    <div class="credential-benefit-card">
                        <div class="credential-benefit-icon">&#9650;</div>
                        <div class="credential-benefit-text">${escapeHtml(t('credential.benefits_pro') || 'Pro Plan: 500k observations, unlimited models, 500k LLM tokens')}</div>
                    </div>
                </div>
                <table class="credential-multiplier-table">
                    <thead><tr><th>Nivel</th><th>Multiplicador EIS</th></tr></thead>
                    <tbody>
                        <tr><td>${escapeHtml(t('credential.professional') || 'Professional')}</td><td>1.2x</td></tr>
                        <tr><td>${escapeHtml(t('credential.pos_graduado') || 'Post-Graduate')}</td><td>1.4x</td></tr>
                        <tr><td>${escapeHtml(t('credential.mestre') || 'Master')}</td><td>1.6x</td></tr>
                        <tr><td>${escapeHtml(t('credential.doutor') || 'Doctorate')}</td><td>2.0x</td></tr>
                    </tbody>
                </table>
            </div>
    `;
    // -- Form section --
    const typeLabel = t('credential.type') || 'Credential Type';
    const fileLabel = t('credential.file') || 'Document (PDF or image)';
    const consentLabel =
        t('credential.consent') || 'I confirm this document is authentic and I authorize its verification.';
    const submitLabel = t('credential.submit') || 'Submit for Verification';
    html += `
            <div class="credential-form-section">
                <label>${escapeHtml(typeLabel)}</label>
                <select data-field-meta="true" data-field-meta-key="auto:cred-type-select" id="cred-type-select">
                    ${CREDENTIAL_TYPES.map((ct: any) => `<option value="${ct.value}">${escapeHtml(ct.label)}</option>`).join('')}
                </select>

                <label>${escapeHtml(fileLabel)}</label>
                <input type="file" id="cred-file-input" accept=".pdf,.jpg,.jpeg,.png" />

                <label class="credential-consent">
                    <input data-field-meta="true" data-field-meta-key="auto:cred-consent-check" type="checkbox" id="cred-consent-check" />
                    <span>${escapeHtml(consentLabel)}</span>
                </label>

                <button id="cred-submit-btn" class="credential-submit-btn">
                    ${escapeHtml(submitLabel)}
                </button>
                <div id="cred-submit-status" class="credential-status"></div>
            </div>
    `;
    // -- Credentials list --
    const credListTitle = t('credential.yourCredentials') || 'Your Credentials';
    html += `<h4 class="credential-section-title">${escapeHtml(credListTitle)}</h4>`;
    html += `<div id="cred-list-container" class="credential-list-container"><span class="credential-empty">${escapeHtml(t('loading') || 'Loading...')}</span></div>`;
    // -- Audit history --
    const historyTitle = t('credential.auditHistory') || 'Audit History';
    html += `<h4 class="credential-section-title">${escapeHtml(historyTitle)}</h4>`;
    html += `<div id="cred-history-container"><span class="credential-empty">${escapeHtml(t('loading') || 'Loading...')}</span></div>`;
    html += `</div>`; // close ecbt-form
    modal.innerHTML = html;
    // PERF-MASTER S3.3 - listeners atrelados ao ciclo de render atual via signal.
    const signal = _abortController?.signal;
    const opts = signal ? { signal } : undefined;
    // Bind close button
    modal.querySelector('#credential-modal-close')?.addEventListener('click', closeCredentialModal, opts);
    // Bind submit
    modal.querySelector('#cred-submit-btn')?.addEventListener('click', _handleSubmit, opts);
    // Load async data
    _loadCredentials();
    _loadHistory();
}
// ----------------------------------------------------------------
// ASYNC DATA LOADERS
// ----------------------------------------------------------------
/**
 * Load and render the user's credentials list.
 * Carrega e renderiza a lista de credenciais do usuario.
 */
async function _loadCredentials() {
    const container = document.getElementById('cred-list-container');
    if (!container) return;
    try {
        const creds = await getUserCredentials();
        if (!creds.length) {
            container.innerHTML = `<span class="credential-empty">${escapeHtml(t('credential.noneYet') || 'No credentials submitted yet.')}</span>`;
            return;
        }
        container.innerHTML = creds
            .map((c: any) => {
                const typeLabel =
                    CREDENTIAL_TYPES.find((ct: any) => ct.value === c.credential_type)?.label || c.credential_type;
                const date = new Date(c.created_at).toLocaleDateString();
                const inst = c.institution ? ` — ${escapeHtml(c.institution)}` : '';
                const year = c.graduation_year ? ` (${c.graduation_year})` : '';
                const reason = c.rejection_reason
                    ? `<div class="credential-card-rejection">${escapeHtml(c.rejection_reason)}</div>`
                    : '';
                return `<div class="credential-card">
                <div class="credential-card-header">
                    <span class="credential-card-name">${escapeHtml(typeLabel)}${inst}${year}</span>
                    <span class="${badgeClass(c.status)}">${escapeHtml(statusLabel(c.status))}</span>
                </div>
                <div class="credential-card-date">${escapeHtml(date)}</div>
                ${reason}
            </div>`;
            })
            .join('');
    } catch (err: any) {
        console.error('[ecbyts] _loadCredentials:', err);
        container.innerHTML = `<span class="credential-error">${escapeHtml(t('error') || 'Error loading credentials.')}</span>`;
    }
}
/**
 * Load and render the credential audit history.
 * Carrega e renderiza o historico de auditoria de credenciais.
 */
async function _loadHistory() {
    const container = document.getElementById('cred-history-container');
    if (!container) return;
    try {
        const history = await getCredentialHistory();
        if (!history.length) {
            container.innerHTML = `<span class="credential-empty">${escapeHtml(t('credential.noHistory') || 'No audit history.')}</span>`;
            return;
        }
        const actionMap = {
            approved: 'approved',
            rejected: 'rejected',
            revoked: 'revoked',
            pending_review: 'pending',
        };
        container.innerHTML = history
            .map((h: any) => {
                const date = new Date(h.created_at).toLocaleString();
                const actionClass = (actionMap as Record<string, any>)[h.action] || 'pending';
                const notes = h.notes ? ` — ${escapeHtml(h.notes)}` : '';
                return `<div class="credential-history-entry credential-history-entry--${actionClass}">
                <span class="credential-history-action">${escapeHtml(h.action)}</span>
                <span class="credential-history-meta"> ${escapeHtml(h.credential_type)} — ${escapeHtml(date)}</span>${notes}
            </div>`;
            })
            .join('');
    } catch (err: any) {
        console.error('[ecbyts] _loadHistory:', err);
        container.innerHTML = `<span class="credential-error">${escapeHtml(t('error') || 'Error loading history.')}</span>`;
    }
}
// ----------------------------------------------------------------
// SUBMIT HANDLER
// ----------------------------------------------------------------
/**
 * Handles the credential submission form.
 * Processa o formulario de envio de credencial.
 */
async function _handleSubmit() {
    const typeSelect = document.getElementById("cred-type-select") as any;
    const fileInput = document.getElementById("cred-file-input") as any;
    const consentCheck = document.getElementById("cred-consent-check") as any;
    const submitBtn = document.getElementById("cred-submit-btn") as any;
    const statusEl = document.getElementById('cred-submit-status');
    const credentialType = typeSelect?.value;
    const file = fileInput?.files?.[0];
    const consent = consentCheck?.checked || false;
    // Validacao local
    if (!file) {
        _showStatus(statusEl, t('credential.selectFile') || 'Please select a document to upload.', 'error');
        return;
    }
    if (!consent) {
        _showStatus(
            statusEl,
            t('credential.consentRequired') || 'You must accept the legal consent to proceed.',
            'error',
        );
        return;
    }
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = t('credential.verifying') || 'Verifying...';
        }
        const result = await submitCredentialRequest(credentialType, file, consent);
        if (result.approved) {
            _showStatus(
                statusEl,
                `${t('credential.approved') || 'Credential approved!'} ${result.institution || ''}`,
                'success',
            );
            showToast(t('credential.approved') || 'Credential approved!', 'success');
            _showUpgradeCTA();
        } else if (result.pendingReview) {
            // A11: título de alto impacto vai para revisão humana — NÃO é rejeição.
            // Mensagem informativa (não-erro): o usuário será notificado do resultado.
            _showStatus(
                statusEl,
                t('credential.statusPendingReviewMsg')
                    || 'Submitted for human review. You will be notified of the result.',
                'success',
            );
            showToast(t('credential.statusPendingReview') || 'Under human review', 'info');
        } else {
            _showStatus(
                statusEl,
                `${t('credential.rejected') || 'Credential rejected.'} ${result.reason || ''}`,
                'error',
            );
        }
        // Refresh lists
        _loadCredentials();
        _loadHistory();
    } catch (err: any) {
        console.error('[ecbyts] credential submit error:', err);
        _showStatus(statusEl, err.message || t('error') || 'Error', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = t('credential.submit') || 'Submit for Verification';
        }
    }
}
/**
 * Show upgrade CTA after credential approval.
 * Mostra banner de upgrade apos aprovacao da credencial.
 */
function _showUpgradeCTA() {
    const form = _overlay?.querySelector('.credential-form-section');
    if (!form || form.querySelector('.credential-upgrade-cta')) return;
    const banner = document.createElement('div');
    banner.className = 'credential-upgrade-cta';
    banner.innerHTML = `
        <p>${escapeHtml(t('credential.upgrade_success') || 'Credential approved! Activate the Pro Plan to unlock all benefits.')}</p>
        <div class="credential-upgrade-buttons">
            <button class="credential-upgrade-btn" data-provider="stripe">
                ${escapeHtml(t('credential.upgrade_cta') || 'Activate Pro Plan')} &#8212; Stripe
            </button>
            <button class="credential-upgrade-btn credential-upgrade-btn--mp" data-provider="mercadopago">
                ${escapeHtml(t('credential.upgrade_cta') || 'Activate Pro Plan')} &#8212; MercadoPago
            </button>
        </div>
    `;
    banner.querySelectorAll('.credential-upgrade-btn').forEach((btn: any) => {
        btn.addEventListener('click', async () => {
            try {
                const { startCheckout } = await import('../cloud/subscription.js' as string);
                const url = await startCheckout(btn.dataset.provider);
                if (url) window.location.href = url;
            } catch (err: any) {
                showToast(err.message || 'Checkout error', 'error');
            }
        });
    });
    form.appendChild(banner);
}
/**
 * Show a status message below the submit button.
 * Mostra mensagem de status abaixo do botao de envio.
 *
 * @param {HTMLElement|null} el - Status element
 * @param {string} message - Text to display
 * @param {'success'|'error'} type - Message type
 */
function _showStatus(el: any, message: any, type: any) {
    if (!el) return;
    el.style.display = 'block';
    el.className = `credential-status credential-status--${type}`;
    el.textContent = message;
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the credential verification modal.
 * Abre o modal de verificacao de credenciais.
 */
export function openCredentialModal() {
    if (!_overlay) {
        _overlay = _createOverlay();
    }
    _overlay.style.display = 'flex';
    _render();
}
/**
 * Close the credential verification modal.
 * Fecha o modal de verificacao de credenciais.
 */
export function closeCredentialModal() {
    if (_overlay) _overlay.style.display = 'none';
}
