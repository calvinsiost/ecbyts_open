// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   EMERGENCY LOGIN MODAL — Phase 3 of Emergency Auth feature
   Modal acionado quando Supabase fica offline e o usuario tem cache
   AES-GCM local (allowlist trusted-bypass). Submete via
   tryEmergencyLogin(email, password) — restora sessao a partir do
   cache decifrado, sem depender da rede.

   Helpers puros exportados para teste:
   - mapErrorToI18nKey(errorCode)
   - normalizeEmail(input)
   - validateForm({ email, password })
   ================================================================ */
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { showToast } from './toast.js';
const MODAL_ID = 'emergency-login-modal';
const ERROR_ID = 'emergency-login-error';
const SUBMIT_ID = 'emergency-login-submit';
const DISMISS_ID = 'emergency-login-dismiss';
const EMAIL_ID = 'emergency-email';
const PASSWORD_ID = 'emergency-password';
let _escListener: any = null;
function errorMessage(err: any) {
    return err && typeof err === 'object' && 'message' in err ? String(err.message) : String(err);
}
// ----------------------------------------------------------------
// PURE HELPERS (exported for testing)
// ----------------------------------------------------------------
/**
 * Map Emergency Auth error code → i18n key suffix.
 * Mapeia codigo de erro do emergencyAuth para sufixo de chave i18n.
 *
 * @param {string|null|undefined} errorCode
 * @returns {string} i18n key suffix (use as `auth.emergency.errors.${suffix}`)
 */
export function mapErrorToI18nKey(errorCode: any) {
    const map = {
        not_allowed: 'notAllowed',
        no_cache: 'noCache',
        cache_expired: 'expired',
        decrypt_failed: 'wrongPassword',
    };
    if (!errorCode || typeof errorCode !== 'string')
        return 'generic';
    return (map as Record<string,any>)[errorCode] || "generic";
}
/**
 * Normalize email input: trim + lowercase.
 * Normaliza email: remove espacos e converte para minusculas.
 *
 * @param {string|null|undefined} input
 * @returns {string}
 */
export function normalizeEmail(input: any) {
    if (input == null)
        return '';
    return String(input).trim().toLowerCase();
}
/**
 * Validate form values without DOM access.
 * Valida formulario sem tocar no DOM. Retorna ok=false + reason em caso de erro.
 *
 * @param {{ email?: string|null, password?: string|null }} values
 * @returns {{ ok: boolean, reason?: 'empty_email'|'empty_password' }}
 */
export function validateForm(values: any): { ok: boolean; reason?: 'empty_email' | 'empty_password' } {
    const email = normalizeEmail(values?.email);
    const password = values?.password == null ? '' : String(values.password);
    if (!email)
        return { ok: false, reason: 'empty_email' };
    if (!password)
        return { ok: false, reason: 'empty_password' };
    return { ok: true };
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Open the Emergency Login modal.
 * Abre o modal de emergencia (offline fallback).
 *
 * @param {{ prefilledEmail?: string }} [options]
 */
export function openEmergencyLoginModal(options: any = {}) {
    let modal = document.getElementById(MODAL_ID);
    if (!modal) {
        modal = _createModal();
        document.body.appendChild(modal);
    }
    // Reset state
    const emailInput = modal.querySelector(`#${EMAIL_ID}`);
    const passInput = modal.querySelector(`#${PASSWORD_ID}`);
    const errorEl = modal.querySelector(`#${ERROR_ID}`);
    if (emailInput)
        (emailInput as any).value = options?.prefilledEmail || '';
    if (passInput)
        (passInput as any).value = '';
    if (errorEl) {
        errorEl.textContent = '';
        (errorEl as any).hidden = true;
    }
    _resetSubmitButton(modal);
    modal.style.display = 'flex';
    // Focus primary actionable field (email if empty, password otherwise)
    requestAnimationFrame(() => {
        if (modal.style.display !== 'flex')
            return;
        const target = emailInput && !(emailInput as any).value ? emailInput : passInput;
        if (target && typeof (target as any).focus === 'function') {
            (target as any).focus({ preventScroll: true });
        }
    });
    // ESC key listener
    _attachEscListener();
}
/**
 * Close the Emergency Login modal.
 * Fecha o modal de emergencia.
 */
export function closeEmergencyLoginModal() {
    const modal = document.getElementById(MODAL_ID);
    if (modal)
        modal.style.display = 'none';
    _detachEscListener();
}
// ----------------------------------------------------------------
// INTERNAL
// ----------------------------------------------------------------
function _createModal() {
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ecbt-overlay emergency-login-overlay';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'emergency-login-title');
    modal.style.display = 'none';
    const bannerText = t('auth.emergency.banner') || 'Supabase offline — emergency login available';
    const title = t('auth.emergency.title') || 'Emergency Login';
    const emailLabel = t('auth.emergency.emailLabel') || 'Email';
    const passLabel = t('auth.emergency.passwordLabel') || 'Password';
    const dismissLabel = t('auth.emergency.dismiss') || 'Dismiss';
    const submitLabel = t('auth.emergency.submit') || 'Sign in offline';
    modal.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--sm emergency-login-dialog">
            <div class="emergency-login-banner" role="status" aria-live="polite">
                <span aria-hidden="true">&#9888;</span>
                <span>${escapeHtml(bannerText)}</span>
            </div>
            <h2 id="emergency-login-title" class="emergency-login-title">${escapeHtml(title)}</h2>
            <form class="emergency-login-form" novalidate>
                <label for="${EMAIL_ID}">${escapeHtml(emailLabel)}</label>
                <input type="email" id="${EMAIL_ID}" name="email" required autocomplete="email">

                <label for="${PASSWORD_ID}">${escapeHtml(passLabel)}</label>
                <input type="password" id="${PASSWORD_ID}" name="password" required
                       data-sensitive="true" autocomplete="current-password">

                <div class="emergency-login-error" id="${ERROR_ID}" role="alert" aria-live="assertive" hidden></div>

                <div class="emergency-login-actions">
                    <button type="button" class="ecbt-btn ecbt-btn--cancel" id="${DISMISS_ID}">
                        ${escapeHtml(dismissLabel)}
                    </button>
                    <button type="submit" class="ecbt-btn ecbt-btn--primary" id="${SUBMIT_ID}">
                        ${escapeHtml(submitLabel)}
                    </button>
                </div>
            </form>
        </div>
    `;
    // Dismiss button
    const dismissBtn = modal.querySelector(`#${DISMISS_ID}`);
    if (dismissBtn)
        dismissBtn.addEventListener('click', closeEmergencyLoginModal);
    // Overlay click closes
    modal.addEventListener('click', (/** @type {MouseEvent} */ e) => {
        if (e.target === modal)
            closeEmergencyLoginModal();
    });
    // Form submit
    const form = modal.querySelector('.emergency-login-form');
    if (form) {
        form.addEventListener('submit', (/** @type {SubmitEvent} */ e) => {
            e.preventDefault();
            _handleSubmit(modal).catch((err) => console.debug('[utils/ui/emergencyLoginModal:submit-failure]', errorMessage(err)));
        });
    }
    return modal;
}
/**
 * Read form input elements and current values.
 * @param {HTMLElement} modal
 */
function _getFormInputs(modal: HTMLElement) {
    const emailInput = modal.querySelector(`#${EMAIL_ID}`) as HTMLInputElement | null;
    const passInput = modal.querySelector(`#${PASSWORD_ID}`) as HTMLInputElement | null;
    const errorEl = modal.querySelector(`#${ERROR_ID}`) as HTMLElement | null;
    return {
        rawEmail: emailInput?.value || '',
        rawPassword: passInput?.value || '',
        errorEl,
    };
}

/**
 * Build the validation error message for a known reason.
 * @param {HTMLElement|null} errorEl
 * @param {'empty_email'|'empty_password'} reason
 */
function _showValidationError(errorEl: HTMLElement | null, reason: 'empty_email' | 'empty_password') {
    const key = reason === 'empty_email'
        ? 'auth.emergency.errors.emptyEmail'
        : 'auth.emergency.errors.emptyPassword';
    _showError(errorEl, t(key) || 'Required field');
}

/**
 * Call the emergency login session helper, returning a safe fallback on error.
 * @param {string} email
 * @param {string} password
 */
async function _callTryEmergencyLogin(email: string, password: string): Promise<any> {
    try {
        const sessionMod = await import('../auth/session.js' as string);
        if (typeof sessionMod.tryEmergencyLogin !== 'function') {
            throw new Error('tryEmergencyLogin not available');
        }
        return await sessionMod.tryEmergencyLogin(email, password);
    }
    catch (err: any) {
        console.debug('[utils/ui/emergencyLoginModal:try-emergency]', errorMessage(err));
        return { ok: false, error: { code: 'generic', message: 'Emergency login unavailable' } };
    }
}

/**
 * Render the submit result: success toast + close, or display error.
 * @param {HTMLElement} modal
 * @param {any} result
 * @param {HTMLElement|null} errorEl
 */
function _renderSubmitResult(modal: HTMLElement, result: any, errorEl: HTMLElement | null) {
    if (result && result.ok) {
        showToast(t('auth.emergency.success') || 'Signed in (offline mode)', 'success');
        closeEmergencyLoginModal();
        return;
    }
    const code = result?.error?.code || 'generic';
    const i18nSuffix = mapErrorToI18nKey(code);
    const msg = t(`auth.emergency.errors.${i18nSuffix}`) || result?.error?.message || 'Emergency login failed';
    _showError(errorEl, msg);
}

/**
 * Handle the submit event: validate, call tryEmergencyLogin, handle result.
 * @param {HTMLElement} modal
 */
async function _handleSubmit(modal: HTMLElement) {
    const { rawEmail, rawPassword, errorEl } = _getFormInputs(modal);
    const validation = validateForm({ email: rawEmail, password: rawPassword });
    if (!validation.ok) {
        _showValidationError(errorEl, validation.reason ?? 'empty_email');
        return;
    }
    const email = normalizeEmail(rawEmail);
    _setSubmitting(modal, true);
    const result = await _callTryEmergencyLogin(email, rawPassword);
    _setSubmitting(modal, false);
    _renderSubmitResult(modal, result, errorEl);
}
/**
 * @param {any} modal
 * @param {boolean} busy
 */
function _setSubmitting(modal: any, busy: any) {
    const submit = modal.querySelector(`#${SUBMIT_ID}`);
    const dismiss = modal.querySelector(`#${DISMISS_ID}`);
    const emailInput = modal.querySelector(`#${EMAIL_ID}`);
    const passInput = modal.querySelector(`#${PASSWORD_ID}`);
    if (submit) {
        submit.disabled = busy;
        submit.classList.toggle('is-loading', busy);
        if (busy) {
            submit.dataset.originalLabel = submit.dataset.originalLabel || submit.textContent || '';
            submit.innerHTML = `<span class="emergency-login-spinner" aria-hidden="true"></span> ${escapeHtml(t('auth.emergency.submitting') || 'Signing in...')}`;
        }
        else if (submit.dataset.originalLabel) {
            submit.textContent = submit.dataset.originalLabel;
        }
    }
    if (dismiss)
        dismiss.disabled = busy;
    if (emailInput)
        emailInput.disabled = busy;
    if (passInput)
        passInput.disabled = busy;
}
/**
 * @param {any} modal
 */
function _resetSubmitButton(modal: any) {
    const submit = modal.querySelector(`#${SUBMIT_ID}`);
    if (!submit)
        return;
    submit.disabled = false;
    submit.classList.remove('is-loading');
    const label = t('auth.emergency.submit') || 'Sign in offline';
    submit.textContent = label;
    submit.dataset.originalLabel = label;
}
/**
 * @param {any} errorEl
 * @param {string} message
 */
function _showError(errorEl: any, message: any) {
    if (!errorEl)
        return;
    errorEl.textContent = message;
    (errorEl as any).hidden = false;
}
function _attachEscListener() {
    if (_escListener)
        return;
    _escListener = (e: any) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById(MODAL_ID);
            if (modal && modal.style.display === 'flex') {
                closeEmergencyLoginModal();
            }
        }
    };
    document.addEventListener('keydown', _escListener);
}
function _detachEscListener() {
    if (_escListener) {
        document.removeEventListener('keydown', _escListener);
        _escListener = null;
    }
}
