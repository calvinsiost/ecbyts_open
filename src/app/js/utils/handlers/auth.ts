// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   AUTH HANDLERS — Login, logout, access control management
   Acoes do usuario para autenticacao e controle de acesso

   FUNCIONALIDADES:
   - Login/logout via Google, GitHub, Microsoft e email
   - Modal SSO fullscreen para login
   - Menu de usuario no titlebar (quando logado)
   - Painel de controle de acesso (aba Governanca)
   - Gerenciamento de regras (admin: email, papel, areas)
   - Indicador de status na barra de status
   ================================================================ */
import { loginWithEmail, registerWithEmail, logout, getCurrentUser, getSupabaseClient } from '../auth/session.js';
import * as _sessionMod from '../auth/session.js';
const _session = _sessionMod;
const loginGoogle = _session.loginGoogle;
const loginGitHub = _session.loginGitHub;
const loginMicrosoft = _session.loginMicrosoft;
const getUserEmail = _session.getUserEmail;
const sendPasswordReset = _session.sendPasswordReset;
import { submitCredentialRequest } from '../cloud/professional.js';
import { startConnectOnboarding, checkConnectStatus } from '../cloud/subscription.js';
import {
    getUnreadNotificationCount,
    fetchNotifications,
    markNotificationsRead,
} from '../libraries/supabaseMarketplace.js';
import { EIS_CREDENTIAL_LABELS, EIS_CREDENTIAL_MULTIPLIERS } from '../../core/eis/eisCalculator.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
import {
    isAdmin,
    isAccessControlActive,
    claimOwnership,
    getOwner,
    getUserRole,
    getObserverMode,
    setObserverMode,
    getRules,
    addRule,
    removeRule,
    updateRule,
} from '../auth/permissions.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { openModal } from '../ui/modals.js';
import { asyncConfirm, asyncPrompt } from '../ui/asyncDialogs.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { openApiKeyModal, closeApiKeyModal } from '../ui/apiKeyModal.js';
import { openPersonalEnvironmentModal } from '../ui/personalEnvironmentModal.js';
import { CONFIG } from '../../config.js';
import { createLogger } from '../helpers/logger.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { handleCheckAdminAccess } from '../auth/roleGuard.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('Auth');
/** @typedef {Record<string, any>} AnyRecord */
/** @param {unknown} err @returns {string} */
function _errorMessage(err: any) {
    return err && typeof err === 'object' && 'message' in err ? String((err as any).message) : String(err);
}
/** @param {string} id @returns {any} */
function _el(id: any) {
    return document.getElementById(id);
}
/** @param {string} selectors @returns {any} */
function _qs(selectors: any) {
    return document.querySelector(selectors);
}
/** @param {string} selectors @returns {any} */
function _qsa(selectors: any) {
    return document.querySelectorAll(selectors);
}
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
let requestAuthUIRefreshRef: any = null;
let _notifPollInterval: any = null;
let _notifPollUserId: any = null;
let _notificationCountCache: any = null;
let _notificationCountUserId: any = null;
let _notificationCountFetchedAt = 0;
let _notificationCountInFlight: any = null;
let _connectStatusCache: any = null;
let _connectStatusUserId: any = null;
let _connectStatusFetchedAt = 0;
let _connectStatusInFlight: any = null;
const _THROTTLE_MAX_ATTEMPTS = 5;
const _THROTTLE_LOCKOUT_MS = 15 * 60_000;
const _THROTTLE_WINDOW_MS = 10 * 60_000;
const _THROTTLE_CAPTCHA_THRESHOLD = 3;
const _THROTTLE_KEY = 'ecbyts-auth-attempts';
const _AUTH_UI_REMOTE_TTL_MS = 60_000;
/**
 * Inject domain-scoped refresh callback reference.
 * @param {Function} fn
 */
export function setAuthRequestUIRefresh(fn: any) {
    requestAuthUIRefreshRef = fn;
}
function requestAuthUIRefresh(reason = 'auth.changed') {
    if (!requestAuthUIRefreshRef) return;
    for (const domain of [
        UI_INVALIDATION_DOMAINS.AUTH,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ]) {
        requestAuthUIRefreshRef(domain, reason);
    }
}
function _getThrottle() {
    return safeJsonParse<Record<string, any>>(sessionStorage.getItem('ecbyts-auth-throttle'), {}, 'auth-throttle');
}
function _recordFailedAttempt() {
    const now = Date.now();
    const data = _getThrottle();
    const windowStart = now - _THROTTLE_WINDOW_MS;
    const inWindow = Number(data.firstAt) > windowStart;
    const count = (inWindow ? Number(data.count || 0) : 0) + 1;
    const lockedUntil = count >= _THROTTLE_MAX_ATTEMPTS ? now + _THROTTLE_LOCKOUT_MS : null;
    sessionStorage.setItem(
        'ecbyts-auth-throttle',
        JSON.stringify({
            count,
            firstAt: inWindow ? Number(data.firstAt) : now,
            lockedUntil,
        }),
    );
    return { count, lockedUntil };
}
function _clearThrottle() {
    sessionStorage.removeItem('ecbyts-auth-throttle');
}
function _checkThrottleLockout() {
    const data = _getThrottle();
    if (!data.lockedUntil) return { locked: false, remainingMs: 0 };
    const remainingMs = Number(data.lockedUntil) - Date.now();
    if (remainingMs <= 0) {
        _clearThrottle();
        return { locked: false, remainingMs: 0 };
    }
    return { locked: true, remainingMs };
}
/**
 * Get throttle state (canonical name, uses _THROTTLE_KEY as logical alias).
 * Retorna o estado de throttle atual da sessão.
 * @returns {{ count: number, lockedUntil: number }}
 */
function _getThrottleState() {
    const raw = _getThrottle();
    return {
        count: Number(raw.count || 0),
        lockedUntil: Number(raw.lockedUntil || 0),
    };
}
/**
 * Reset throttle state on successful login.
 * Alias de _clearThrottle para API pública consistente com a spec.
 */
function _resetThrottle() {
    _clearThrottle();
}
/**
 * Check whether the user is currently throttled (locked out).
 * Verifica se o usuário está bloqueado por excesso de tentativas.
 *
 * @returns {{ throttled: boolean, remainingMs: number }}
 */
export function isAuthThrottled() {
    const result = _checkThrottleLockout();
    return { throttled: result.locked, remainingMs: result.remainingMs };
}
export function throttleNeedsCaptcha() {
    const data = _getThrottle();
    return Number(data.count || 0) >= _THROTTLE_CAPTCHA_THRESHOLD;
}
// ----------------------------------------------------------------
// AUTH MODAL (SSO fullscreen)
// ----------------------------------------------------------------
/** Invite-lock state — when true, auth modal cannot be closed. */
let _inviteLocked = false;
/**
 * Block Escape key while auth modal is invite-locked.
 * Impede Escape de fechar o modal durante fluxo de convite.
 * @param {KeyboardEvent} e
 */
function _blockEscapeInvite(e: any) {
    if (_inviteLocked && e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
    }
}
/**
 * Unlock the auth modal after successful login.
 * Restaura comportamento normal do modal apos autenticacao.
 */
function _unlockInviteGate() {
    _inviteLocked = false;
    document.removeEventListener('keydown', _blockEscapeInvite);
    const modal = _el('auth-modal');
    if (modal) {
        const closeBtn = modal.querySelector('.auth-card-close');
        if (closeBtn) closeBtn.style.display = '';
    }
}
/**
 * Open the SSO login modal.
 * Abre o modal fullscreen de login.
 * Quando chamado com { inviteLock: true }, impede fechamento ate login.
 *
 * @param {Object} [options]
 * @param {boolean} [options.inviteLock] - Trava o modal (sem X, sem Escape, sem overlay click)
 */
function handleOpenAuthModal(options: any = {}) {
    const modal = _el('auth-modal');
    if (!modal) return;
    // Invite-lock: hide close button, block Escape
    if (options?.inviteLock) {
        _inviteLocked = true;
        const closeBtn = modal.querySelector('.auth-card-close');
        if (closeBtn) closeBtn.style.display = 'none';
        document.addEventListener('keydown', _blockEscapeInvite);
    }
    modal.classList.add('active');
    // Clear previous state
    const errorEl = _el('auth-inline-error');
    if (errorEl) errorEl.style.display = 'none';
    const emailInput = _el('auth-email-input');
    if (emailInput) emailInput.value = '';
    const passInput = _el('auth-password-input');
    if (passInput) passInput.value = '';
    const termsCheckbox = _el('auth-accept-terms');
    if (termsCheckbox) termsCheckbox.checked = false;
    handleHideRegistrationTypes();
}
/**
 * Close the SSO login modal.
 * Fecha o modal fullscreen de login.
 * Bloqueado quando _inviteLocked ativo (fluxo invite-only).
 */
function handleCloseAuthModal() {
    if (_inviteLocked) {
        showToast(t('invite.mustLogin') || 'Please sign in to continue', 'warning');
        return;
    }
    const modal = _el('auth-modal');
    if (modal) modal.classList.remove('active');
    // Garante que o seletor de tipo de cadastro é ocultado ao fechar
    handleHideRegistrationTypes();
}
// ----------------------------------------------------------------
// REGISTRATION TYPE SELECTION - Simples vs Profissional
// ----------------------------------------------------------------
/**
 * Show the registration type selector (Simple / Professional).
 * Exibe o seletor de tipo de cadastro quando o usuário clica em "Criar Conta".
 */
function handleShowRegistrationTypes() {
    const selector = _el('auth-registration-type');
    const form = _qs('#auth-modal form');
    const forgotBtn = _qs('.auth-forgot-link');
    const termsLabel = _el('auth-terms-label');
    if (selector) selector.style.display = 'block';
    if (form) form.style.display = 'none';
    if (forgotBtn) forgotBtn.style.display = 'none';
    if (termsLabel) termsLabel.style.display = 'flex';
}
/**
 * Hide the registration type selector and restore the form.
 * Oculta o seletor e restaura o formulário de email/senha.
 */
function handleHideRegistrationTypes() {
    const selector = _el('auth-registration-type');
    const form = _qs('#auth-modal form');
    const forgotBtn = _qs('.auth-forgot-link');
    const termsLabel = _el('auth-terms-label');
    const regBtn = _el('auth-btn-register');
    if (selector) selector.style.display = 'none';
    if (form) form.style.display = '';
    if (forgotBtn) forgotBtn.style.display = '';
    if (termsLabel) termsLabel.style.display = 'none';
    // Restore register button to initial state (show registration types)
    if (regBtn) {
        regBtn.onclick = handleShowRegistrationTypes;
        regBtn.disabled = false;
    }
    _detachTermsCheckboxListener();
}
/** @type {Function|null} */
let _termsCheckboxListener: any = null;
function _attachTermsCheckboxListener() {
    const checkbox = _el('auth-accept-terms');
    const regBtn = _el('auth-btn-register');
    if (!checkbox || !regBtn) return;
    _termsCheckboxListener = function () {
        regBtn.disabled = !checkbox.checked;
    };
    checkbox.addEventListener('change', _termsCheckboxListener);
    // Initial state
    regBtn.disabled = !checkbox.checked;
}
function _detachTermsCheckboxListener() {
    const checkbox = _el('auth-accept-terms');
    if (checkbox && _termsCheckboxListener) {
        checkbox.removeEventListener('change', _termsCheckboxListener);
        _termsCheckboxListener = null;
    }
}
/**
 * Process the selected account type and proceed with email/password registration.
 * Processa o tipo de conta escolhido e prossegue com o cadastro.
 *
 * Para 'professional', o usuário é instruído a verificar via CREA/CRC após o cadastro.
 * Para 'common', cadastro padrão.
 *
 * @param {'common'|'professional'} userType - Tipo de conta
 */
function handleSelectUserType(userType: any) {
    const selector = _el('auth-registration-type');
    const form = _qs('#auth-modal form');
    const termsLabel = _el('auth-terms-label');
    const regBtn = _el('auth-btn-register');
    if (selector) selector.style.display = 'none';
    if (form) form.style.display = '';
    if (termsLabel) termsLabel.style.display = 'flex';
    // Switch register button to actual registration handler
    if (regBtn) {
        regBtn.onclick = handleRegisterEmail;
    }
    // Armazena o tipo escolhido para o handler de registro usar
    window._pendingUserType = userType;
    // LEGAL-001: enforce terms checkbox before enabling register button
    _attachTermsCheckboxListener();
    if (userType === 'professional') {
        showToast(
            t('registerProfessionalInfo') ||
                'Create your account, then go to your profile to submit your professional credentials.',
            'info',
        );
    }
    // Foca no campo de email para o usuário continuar o cadastro
    const emailInput = _el('auth-email-input');
    if (emailInput) emailInput.focus();
}
// ----------------------------------------------------------------
// CREDENTIAL UPLOAD MODAL
// ----------------------------------------------------------------
/**
 * Open the SHARE-001 resource shares panel.
 * Lazy-loads sharesPanel.js. Gating is enforced inside the panel
 * via canCurrent(ACTIONS.SHARE) - UI buttons disable themselves
 * when the active org role lacks permission. Server RLS is the
 * authoritative gate.
 */
async function handleOpenSharesPanel() {
    try {
        const { openSharesPanel } = await import('../ui/sharesPanel.js');
        openSharesPanel();
    } catch (err: any) {
        log.error('Failed to open shares panel', _errorMessage(err));
    }
}
/**
 * Close the SHARE-001 resource shares panel.
 */
async function handleCloseSharesPanel() {
    try {
        const { closeSharesPanel } = await import('../ui/sharesPanel.js');
        closeSharesPanel();
    } catch (err: any) {
        log.error('Failed to close shares panel', _errorMessage(err));
    }
}
/**
 * Open the credential verification modal (Auth Fase 2).
 * Abre o modal de verificacao de credenciais com formulario e historico.
 * Lazy-loads credentialModal.js para evitar carregar codigo desnecessario.
 */
async function handleOpenCredentialModal() {
    try {
        const { openCredentialModal } = await import('../ui/credentialModal.js');
        openCredentialModal();
    } catch (err: any) {
        log.error('Failed to open credential modal', _errorMessage(err));
    }
}
/**
 * Submit credential from the new modal (Auth Fase 2).
 * Submete credencial a partir do novo modal - delegado ao credentialModal.js.
 * Mantido como handler registrado para acesso via window.handleSubmitCredential().
 */
async function handleSubmitCredential() {
    try {
        const { openCredentialModal } = await import('../ui/credentialModal.js');
        // O submit e feito internamente pelo modal; abrir caso nao esteja aberto
        openCredentialModal();
    } catch (err: any) {
        log.error('Failed to open credential modal for submit', _errorMessage(err));
    }
}
/**
 * Close the credential upload modal.
 * Fecha o modal de upload de credencial.
 */
function handleCloseCredentialModal() {
    const modal = _el('credential-upload-modal');
    if (modal) modal.classList.remove('active');
}
/**
 * Update the EIS multiplier preview when credential type changes.
 * Atualiza o preview do multiplicador EIS conforme o tipo selecionado.
 */
function updateCredentialEisPreview() {
    const select = _el('credential-type-select');
    const previewText = _el('credential-eis-preview-text');
    if (!select || !previewText) return;
    const type = select.value;
    const multiplier = EIS_CREDENTIAL_MULTIPLIERS[type] || 1.0;
    const label = EIS_CREDENTIAL_LABELS[type] || '';
    previewText.textContent = `${label} — EIS T-axis multiplier: ${multiplier}×`;
}
/**
 * Submit the credential upload form.
 * Submete o diploma para verificação por IA (Gemini Vision).
 */
async function handleSubmitCredentialUpload() {
    const typeSelect = _el('credential-type-select');
    const fileInput = _el('credential-file-input');
    const consentCheckbox = _el('credential-consent-checkbox');
    const _statusEl = _el('credential-upload-status');
    const submitBtn = _qs('#credential-upload-modal .auth-btn-signin');
    const credentialType = typeSelect?.value;
    const file = fileInput?.files?.[0];
    const consent = consentCheckbox?.checked || false;
    if (!file) {
        showCredentialStatus(t('selectFile') || 'Please select a document to upload.', 'error');
        return;
    }
    if (!consent) {
        showCredentialStatus(t('consentRequired') || 'You must accept the legal consent to proceed.', 'error');
        return;
    }
    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="auth-spinner"></span> ${t('verifying') || 'Verifying...'}`;
        }
        const result = await submitCredentialRequest(credentialType, file, consent);
        if (result.approved) {
            showToast(
                `${EIS_CREDENTIAL_LABELS[result.level] || ''} ${t('credentialApproved') || 'Credential approved!'} — ${result.institution || ''}`,
                'success',
            );
            handleCloseCredentialModal();
            requestAuthUIRefresh();
            purposeMicroFeedback('handleSubmitCredentialUpload');
        } else {
            showCredentialStatus(`${t('credentialRejected') || 'Verification failed'}: ${result.reason}`, 'error');
        }
    } catch (err: any) {
        log.error('Credential upload failed', _errorMessage(err));
        showCredentialStatus(_errorMessage(err), 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span data-i18n="credential.submit">${t('submitVerification') || 'Submit for Verification'}</span>`;
        }
    }
}
/**
 * Show status message inside the credential upload modal.
 * @param {string} message
 * @param {'error'|'success'} type
 */
function showCredentialStatus(message: any, type = 'error') {
    const el = _el('credential-upload-status');
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
    el.style.color = type === 'success' ? 'var(--success-600)' : 'var(--danger-500)';
    if (type === 'error') {
        setTimeout(() => {
            el.style.display = 'none';
        }, 6000);
    }
}
// ----------------------------------------------------------------
// LOGIN / LOGOUT
// ----------------------------------------------------------------
/**
 * Login with email and password.
 * Faz login com email e senha via Supabase.
 */
async function handleLoginEmail() {
    const emailInput = _el('auth-email-input');
    const passInput = _el('auth-password-input');
    const btn = _el('auth-btn-login');
    const email = emailInput?.value?.trim();
    const password = passInput?.value;
    const lockout = _checkThrottleLockout();
    if (lockout.locked) {
        const mins = Math.ceil(lockout.remainingMs / 60_000);
        const msg = t('auth.tooManyAttempts', { mins });
        showAuthError(msg);
        return;
    }
    // Fase 1b usa este hook quando CAPTCHA estiver habilitado
    if (throttleNeedsCaptcha() && typeof window._captchaGetToken === 'function') {
        const token = await window._captchaGetToken();
        if (!token) {
            showAuthError(t('auth.captchaRequired') || 'Complete security verification to continue.');
            return;
        }
    }
    if (!email || !password) {
        showAuthError(t('enterEmailAndPassword') || 'Enter email and password');
        return;
    }
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="auth-spinner"></span> ${t('signingIn') || 'Signing in...'}`;
        }
        await loginWithEmail(email, password);
        _clearThrottle();
        _unlockInviteGate();
        handleCloseAuthModal();
    } catch (err: any) {
        log.error('Email login failed', _errorMessage(err));
        const { count, lockedUntil } = _recordFailedAttempt();
        if (lockedUntil) {
            showAuthError(t('auth.lockedOut', { mins: 15 }));
        } else {
            const remaining = Math.max(0, _THROTTLE_MAX_ATTEMPTS - count);
            const leftMsg = t('auth.attemptsLeft') || 'attempt(s) left';
            showAuthError(`${supabaseErrorMessage(err)} (${remaining} ${leftMsg})`);
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span data-i18n="signIn">${t('signIn') || 'Sign In'}</span>`;
        }
    }
}
/**
 * Register new account with email and password.
 * Cria nova conta - Supabase envia email de confirmacao.
 */
async function handleRegisterEmail() {
    const emailInput = _el('auth-email-input');
    const passInput = _el('auth-password-input');
    const btn = _el('auth-btn-register');
    const email = emailInput?.value?.trim();
    const password = passInput?.value;
    if (!email || !password) {
        showAuthError(t('enterEmailAndPassword') || 'Enter email and password');
        return;
    }
    if (password.length < 6) {
        showAuthError(t('passwordTooShort') || 'Password must be at least 6 characters');
        return;
    }
    // LEGAL: termos de uso devem ser aceitos antes do cadastro
    const termsCheckbox = _el('auth-accept-terms');
    if (termsCheckbox && !termsCheckbox.checked) {
        showAuthError(t('auth.termsRequired') || 'You must accept the Terms of Service and Privacy Policy');
        return;
    }
    // INVITE-ONLY: bloquear cadastro se não há código de convite no storage
    if (CONFIG.FEATURES.INVITE_ONLY && !getCurrentUser()) {
        const _pendingCode =
            sessionStorage.getItem('ecbyts-invite-code') || localStorage.getItem('ecbyts-pending-invite');
        if (!_pendingCode) {
            showAuthError(
                t('invite.requiredToRegister') ||
                    'An invite code is required. Please close this dialog and enter your invite code first.',
            );
            return;
        }
    }
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="auth-spinner"></span> ${t('creating') || 'Creating...'}`;
        }
        const user = await registerWithEmail(email, password);
        // T5.4: evento de funil 'signup' (anônimo, fire-and-forget)
        import('../telemetry/funnel.js' as string).then(({ trackFunnelEvent }) => trackFunnelEvent('signup')).catch((e: any) => console.debug('[funnel]', e?.message || e));
        showToast(t('accountCreated') || 'Account created! Check your email for verification.', 'success');
        // LEGAL-001: Registrar aceite dos termos no perfil
        try {
            const client = getSupabaseClient();
            if (client && user?.id) {
                await client
                    .from('profiles')
                    .update({
                        terms_accepted_at: new Date().toISOString(),
                        terms_version: '1.0',
                    })
                    .eq('id', user.id);
            }
        } catch (_err: any) {
            log.debug('Terms acceptance update skipped', _errorMessage(_err));
        }
        // INV-4: Claim invite code + generate user invites
        await _processInviteAfterSignup(user?.id);
        _unlockInviteGate();
        handleCloseAuthModal();
    } catch (err: any) {
        log.error('Email registration failed', _errorMessage(err));
        showAuthError(supabaseErrorMessage(err));
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span data-i18n="createAccount">${t('createAccount') || 'Create Account'}</span>`;
        }
    }
}
/**
 * Login with Google via Supabase OAuth redirect.
 */
async function handleLoginGoogle() {
    try {
        await loginGoogle();
    } catch (err: any) {
        log.error('Google OAuth login failed', _errorMessage(err));
        showAuthError(supabaseErrorMessage(err));
    }
}
/**
 * Login with GitHub via Supabase OAuth redirect.
 */
async function handleLoginGitHub() {
    try {
        await loginGitHub();
    } catch (err: any) {
        log.error('GitHub OAuth login failed', _errorMessage(err));
        showAuthError(supabaseErrorMessage(err));
    }
}
/**
 * Login with Microsoft via Supabase OAuth redirect.
 */
async function handleLoginMicrosoft() {
    try {
        await loginMicrosoft();
    } catch (err: any) {
        log.error('Microsoft OAuth login failed', _errorMessage(err));
        showAuthError(supabaseErrorMessage(err));
    }
}
/**
 * Send password reset email.
 */
async function handleForgotPassword() {
    const emailInput = _el('auth-email-input');
    const email = emailInput?.value?.trim();
    if (!email) {
        showAuthError(t('enterEmail') || 'Enter your email address first');
        return;
    }
    try {
        await sendPasswordReset(email);
        showToast(t('resetEmailSent') || 'Password reset email sent. Check your inbox.', 'success');
    } catch (err: any) {
        log.error('Password reset request failed', _errorMessage(err));
        showAuthError(supabaseErrorMessage(err));
    }
}
/**
 * Show inline error in the auth modal.
 * @param {string} message
 */
function showAuthError(message: any) {
    const el = _el('auth-inline-error');
    if (el) {
        el.textContent = message;
        el.style.display = 'block';
        setTimeout(() => {
            el.style.display = 'none';
        }, 5000);
    }
}
/**
 * Convert Supabase error to user-friendly message.
 * Converte erro Supabase para mensagem amigavel.
 *
 * @param {unknown} e - Supabase error
 * @returns {string}
 */
function supabaseErrorMessage(e: any) {
    const msg = _errorMessage(e) || '';
    const map = {
        'Invalid login credentials': t('wrongPassword') || 'Incorrect email or password',
        'Email not confirmed': t('emailNotConfirmed') || 'Please confirm your email first',
        'User already registered': t('emailInUse') || 'This email is already registered',
        'Password should be at least 6 characters': t('passwordTooShort') || 'Password must be at least 6 characters',
        'Email rate limit exceeded': t('tooManyAttempts') || 'Too many attempts. Try again later',
        'For security purposes': t('tooManyAttempts') || 'Too many attempts. Try again later',
        'Unable to validate email address': t('invalidEmail') || 'Invalid email address',
        'Supabase OAuth config invalid': t('authConfigInvalid') || 'Authentication configuration is unavailable.',
    };
    for (const [key, value] of Object.entries(map)) {
        if (msg.includes(key)) return value;
    }
    return msg || 'Authentication error';
}
/**
 * Logout current user.
 * Encerra a sessao do usuario atual.
 */
function handleLogout() {
    logout();
    showToast(t('loggedOut') || 'Logged out', 'info');
}
// ----------------------------------------------------------------
// AUTH MENU (TITLEBAR)
// ----------------------------------------------------------------
/**
 * Toggle auth: open SSO modal (if not logged in) or dropdown (if logged in).
 * Abre modal SSO ou dropdown conforme estado de login.
 */
function handleToggleAuthMenu() {
    const user = getCurrentUser();
    if (!user) {
        // Not logged in - open SSO modal
        handleOpenAuthModal();
        return;
    }
    // Logged in - toggle dropdown
    const menu = _el('auth-menu');
    if (!menu) return;
    const isVisible = menu.style.display !== 'none';
    menu.style.display = isVisible ? 'none' : 'block';
    if (!isVisible) {
        // Detect V2 header: if #ah-auth-btn exists and #titlebar is hidden,
        // the menu must be repositioned outside the hidden titlebar.
        const v2Btn = _el('ah-auth-btn');
        const titlebar = _el('titlebar');
        const isV2Active = v2Btn && titlebar && titlebar.style.display === 'none';
        if (isV2Active) {
            // Move menu to body so it is not trapped inside display:none titlebar
            if (menu.parentElement !== document.body) {
                document.body.appendChild(menu);
            }
            const rect = v2Btn.getBoundingClientRect();
            menu.style.position = 'fixed';
            menu.style.top = rect.bottom + 4 + 'px';
            menu.style.right = window.innerWidth - rect.right + 'px';
            menu.style.left = 'auto';
        } else {
            // Legacy titlebar mode: ensure menu is back inside titlebar
            const titlebarAuth = titlebar?.querySelector('#auth-button')?.parentElement;
            if (titlebarAuth && menu.parentElement !== titlebarAuth) {
                titlebarAuth.appendChild(menu);
            }
            menu.style.position = '';
            menu.style.top = '';
            menu.style.right = '';
            menu.style.left = '';
        }
        const close = /** @param {any} e */ (e: any) => {
            const target = e.target;
            const clickedBtn =
                target.id === 'auth-button' ||
                target.id === 'ah-auth-btn' ||
                target.closest('#auth-button') ||
                target.closest('#ah-auth-btn');
            if (!menu.contains(target) && !clickedBtn) {
                menu.style.display = 'none';
                document.removeEventListener('click', close);
            }
        };
        setTimeout(() => document.addEventListener('click', close), 0);
    }
}
// ----------------------------------------------------------------
// ACCESS CONTROL MODAL
// ----------------------------------------------------------------
/**
 * Open Access Control modal.
 * Abre o modal de controle de acesso (so para admin/owner).
 */
function handleOpenAccessModal() {
    if (isAccessControlActive() && !isAdmin()) {
        showToast(t('permissionDenied') || 'Permission denied', 'error');
        return;
    }
    renderAccessModal();
    openModal('access-modal');
}
/**
 * Claim model ownership.
 * Reivindica propriedade do modelo (primeiro login).
 */
function handleClaimOwnership() {
    const email = getUserEmail();
    if (!email) {
        showToast(t('loginFirst') || 'Please login first', 'error');
        return;
    }
    if (getOwner()) {
        showToast(t('ownerExists') || 'Model already has an owner', 'error');
        return;
    }
    claimOwnership(email);
    renderAccessModal();
    requestAuthUIRefresh();
    showToast(t('ownershipClaimed') || 'Ownership claimed', 'success');
}
// ----------------------------------------------------------------
// RULE MANAGEMENT
// ----------------------------------------------------------------
/**
 * Add a new empty access rule.
 */
function handleAddAccessRule() {
    addRule({ email: '', role: 'viewer', areas: ['*'] });
    renderAccessModal();
}
/**
 * Remove an access rule by index.
 * @param {number} index
 */
function handleRemoveAccessRule(index: any) {
    removeRule(index);
    renderAccessModal();
}
/**
 * Update a rule field.
 * @param {number} index
 * @param {string} field - 'email', 'role', or 'areas'
 * @param {string} value
 */
function handleUpdateAccessRule(index: any, field: any, value: any) {
    if (field === 'areas') {
        const areas = value
            .split(',')
            .map((a: any) => a.trim())
            .filter(Boolean);
        updateRule(index, { areas: areas.length > 0 ? areas : ['*'] });
    } else {
        updateRule(index, { [field]: value });
    }
}
/**
 * Update observer mode.
 * @param {string} mode
 */
function handleObserverModeChange(mode: any) {
    setObserverMode(mode);
    requestAuthUIRefresh();
}
// ----------------------------------------------------------------
// UI RENDERING
// ----------------------------------------------------------------
/**
 * Update auth UI: titlebar button, status bar, dropdown content.
 * Atualiza toda a interface de autenticacao.
 */
export function updateAuthUI() {
    _syncAuthUiCachesForCurrentUser();
    updateAuthButton();
    updateAuthStatus();
    updateAuthMenuContent();
    updateNotificationBell();
    // Start/stop notification polling based on login state
    if (getCurrentUser()) startNotificationPolling();
    else stopNotificationPolling();
}
/**
 * Start background notification polling (60s interval).
 * Inicia polling de notificacoes a cada 60 segundos.
 */
function startNotificationPolling() {
    const userId = getCurrentUser()?.id || null;
    if (!userId) {
        stopNotificationPolling();
        return;
    }
    if (_notifPollInterval && _notifPollUserId === userId) {
        return;
    }
    stopNotificationPolling();
    _notifPollUserId = userId;
    _notifPollInterval = setInterval(() => {
        if (!getCurrentUser()) {
            stopNotificationPolling();
            return;
        }
        updateNotificationBell();
    }, 60000);
}
/**
 * Stop background notification polling.
 * Para o polling de notificacoes.
 */
function stopNotificationPolling() {
    if (_notifPollInterval) {
        clearInterval(_notifPollInterval);
        _notifPollInterval = null;
    }
    _notifPollUserId = null;
}
function _syncAuthUiCachesForCurrentUser() {
    const userId = getCurrentUser()?.id || null;
    if (_notificationCountUserId !== userId) {
        _notificationCountUserId = userId;
        _notificationCountCache = null;
        _notificationCountFetchedAt = 0;
        _notificationCountInFlight = null;
    }
    if (_connectStatusUserId !== userId) {
        _connectStatusUserId = userId;
        _connectStatusCache = null;
        _connectStatusFetchedAt = 0;
        _connectStatusInFlight = null;
    }
}
function _invalidateNotificationCountCache() {
    _notificationCountCache = null;
    _notificationCountFetchedAt = 0;
    _notificationCountInFlight = null;
}
function _invalidateConnectStatusCache() {
    _connectStatusCache = null;
    _connectStatusFetchedAt = 0;
    _connectStatusInFlight = null;
}
/**
 * @param {string|null|undefined} userId
 * @param {{ force?: boolean }} [options]
 */
async function _ensureNotificationCount(userId: any, { force = false } = {}) {
    if (!userId) return 0;
    _syncAuthUiCachesForCurrentUser();
    const now = Date.now();
    if (!force && _notificationCountCache != null && now - _notificationCountFetchedAt < _AUTH_UI_REMOTE_TTL_MS) {
        return _notificationCountCache;
    }
    if (_notificationCountInFlight?.userId === userId) {
        return _notificationCountInFlight.promise;
    }
    const promise = getUnreadNotificationCount()
        .then((count: any) => {
            const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
            if (_notificationCountUserId === userId) {
                _notificationCountCache = safeCount;
                _notificationCountFetchedAt = Date.now();
            }
            return safeCount;
        })
        .finally(() => {
            if (_notificationCountInFlight?.userId === userId) {
                _notificationCountInFlight = null;
            }
        });
    _notificationCountInFlight = { userId, promise };
    return promise;
}
/**
 * @param {string|null|undefined} userId
 * @param {{ force?: boolean }} [options]
 */
async function _ensureConnectStatus(userId: any, { force = false } = {}) {
    if (!userId) return { connectId: null, status: 'none' };
    _syncAuthUiCachesForCurrentUser();
    const now = Date.now();
    if (!force && _connectStatusCache && now - _connectStatusFetchedAt < _AUTH_UI_REMOTE_TTL_MS) {
        return _connectStatusCache;
    }
    if (_connectStatusInFlight?.userId === userId) {
        return _connectStatusInFlight.promise;
    }
    const promise = checkConnectStatus()
        .then((result: any) => {
            const safeResult =
                result && typeof result === 'object'
                    ? {
                          connectId: result.connectId || null,
                          status: result.status || 'none',
                      }
                    : { connectId: null, status: 'none' };
            if (_connectStatusUserId === userId) {
                _connectStatusCache = safeResult;
                _connectStatusFetchedAt = Date.now();
            }
            return safeResult;
        })
        .finally(() => {
            if (_connectStatusInFlight?.userId === userId) {
                _connectStatusInFlight = null;
            }
        });
    _connectStatusInFlight = { userId, promise };
    return promise;
}
/**
 * Update the auth button in the titlebar.
 */
function updateAuthButton() {
    const label = _el('auth-button-label');
    if (label) {
        const user = getCurrentUser();
        label.textContent = user ? String(user.displayName || user.email || '').split(' ')[0] : t('login') || 'Login';
    }
    // V2 header avatar update
    import('../ui/homeHeader.js')
        .then((m: any) => {
            if (typeof m.updateHomeHeaderAuth === 'function') {
                m.updateHomeHeaderAuth(getCurrentUser());
            }
        })
        .catch((e: any) => console.debug('[auth] homeHeader update skipped:', _errorMessage(e)));
}
/**
 * Update auth status indicator in status bar.
 */
function updateAuthStatus() {
    const el = _el('auth-status');
    if (!el) return;
    if (!isAccessControlActive()) {
        el.style.display = 'none';
        return;
    }
    el.style.display = '';
    const user = getCurrentUser();
    const role = getUserRole();
    if (!user) {
        const obsMode = getObserverMode();
        if (obsMode === 'public') {
            el.textContent = t('observerPublic') || 'Observer (Public)';
            el.className = 'status-item auth-status auth-observer';
        } else {
            el.textContent = t('notLoggedIn') || 'Not logged in';
            el.className = 'status-item auth-status auth-none';
        }
    } else {
        const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
        el.textContent = `${roleLabel}: ${user.email}`;
        el.className = `status-item auth-status auth-${role}`;
    }
}
/**
 * Update auth dropdown content (logged-in state).
 * Atualiza conteudo do dropdown quando logado.
 */
function updateAuthMenuContent() {
    const menu = _el('auth-menu');
    if (!menu) return;
    const user = getCurrentUser();
    if (user) {
        const nameEl = _el('auth-display-name');
        const emailEl = _el('auth-email');
        if (nameEl) nameEl.textContent = user.displayName;
        if (emailEl) emailEl.textContent = user.email;
        // Exibe badge de credencial se usuário tiver nível acima de common
        const badgeEl = _el('auth-credential-badge');
        if (badgeEl) {
            const level = String(user.credentialLevel || 'common');
            if (level !== 'common') {
                badgeEl.textContent = EIS_CREDENTIAL_LABELS[level] || '';
                badgeEl.style.display = 'inline-block';
            } else {
                badgeEl.style.display = 'none';
            }
        }
        // INV-6: Exibe badge de tier (Early Adopter, VIP, etc.)
        const tierBadgeEl = _el('auth-tier-badge');
        if (tierBadgeEl) {
            const tier = user.tier || 'free';
            if (tier === 'early_adopter' || tier === 'vip' || tier === 'beta_tester') {
                const labels = {
                    early_adopter: t('invite.earlyAdopter') || 'Early Adopter',
                    vip: 'VIP',
                    beta_tester: 'Beta Tester',
                };
                tierBadgeEl.textContent = (labels as any)[tier] || tier;
                tierBadgeEl.className = `auth-tier-badge auth-tier-${tier.replace(/_/g, '-')}`;
                tierBadgeEl.style.display = 'inline-block';
            } else {
                tierBadgeEl.style.display = 'none';
            }
        }
        // INV-4: Exibe botao "Meus Convites" se INVITE_ONLY ativo
        const inviteBtn = _el('auth-invite-btn');
        if (inviteBtn) {
            inviteBtn.style.display = CONFIG.FEATURES.INVITE_ONLY ? '' : 'none';
        }
        // INV-5: Exibe botoes admin se platform admin
        const admins: string[] = (CONFIG as any).PLATFORM_ADMINS || [];
        const isAdmin = admins.includes((user.email || '').toLowerCase());
        const adminInviteBtn = _el('auth-admin-invite-btn');
        if (adminInviteBtn) adminInviteBtn.style.display = isAdmin ? '' : 'none';
        const adminErrorsBtn = _el('auth-admin-errors-btn');
        if (adminErrorsBtn) adminErrorsBtn.style.display = isAdmin ? '' : 'none';
        // Show Stripe Connect button for all logged-in users
        const connectBtn = _el('stripe-connect-menu-btn');
        if (connectBtn) {
            connectBtn.style.display = '';
            // Update label based on Connect status
            _ensureConnectStatus(user.id)
                .then(({status }: any) => {
                    const label = connectBtn.querySelector('[data-i18n="stripeConnect"]');
                    if (label) {
                        if (status === 'active') {
                            label.textContent = t('stripeConnectActive') || 'Stripe Connected';
                            connectBtn.classList.add('connect-active');
                        } else if (status === 'pending') {
                            label.textContent = t('stripeConnectPending') || 'Complete Stripe Setup';
                        } else {
                            label.textContent = t('stripeConnect') || 'Stripe Connect';
                            connectBtn.classList.remove('connect-active');
                        }
                    }
                })
                .catch((err: any) => {
                    log.debug('Stripe Connect status check ignored', _errorMessage(err));
                });
        }
        // Close SSO modal if open (user just logged in)
        handleCloseAuthModal();
    } else {
        // Hide dropdown when not logged in
        menu.style.display = 'none';
        // Hide Stripe Connect button
        const connectBtn = _el('stripe-connect-menu-btn');
        if (connectBtn) connectBtn.style.display = 'none';
    }
}
/**
 * Render the Access Control section in governance tab.
 * Renderiza a secao de controle de acesso na aba Governanca.
 *
 * @returns {string} HTML string
 */
export function renderAccessControlSection() {
    const owner = getOwner();
    const obsMode = getObserverMode();
    const rules = getRules();
    const canManage = !isAccessControlActive() || isAdmin();
    const _areaOptions = getAreaOptions();
    let html = `
        <div class="section">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('accessControl') || 'Access Control'}</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">`;
    // Model Owner
    html += `
                <div class="gov-subsection-header">${t('modelOwner') || 'Model Owner'}</div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <input data-field-meta="true" data-field-meta-key="auto:access-owner-display" type="text" class="form-input form-input-sm" id="access-owner-display"
                               value="${escapeAttr(owner || '')}" readonly
                               placeholder="${t('noOwner') || 'No owner set'}"
                               style="flex: 1;">`;
    if (!owner) {
        html += `
                        <button class="btn btn-sm btn-primary" data-cc-action="cc-6a82a1dd">
                            ${t('claimOwnership') || 'Claim'}
                        </button>`;
    }
    html += `
                    </div>
                </div>`;
    // Observer Mode
    html += `
                <div class="gov-subsection-header">${t('observerMode') || 'Observer Mode'}</div>
                <div class="form-group" style="margin-bottom: 12px;">
                    <select data-field-meta="true" data-field-meta-key="auto:access-observer-mode" class="form-input form-input-sm" id="access-observer-mode"
                            data-cc-change="cc-bb40a5f0"
                            ${canManage ? '' : 'disabled'}>
                        <option value="disabled" ${obsMode === 'disabled' ? 'selected' : ''}>
                            ${t('observerDisabled') || 'Disabled'}
                        </option>
                        <option value="authenticated" ${obsMode === 'authenticated' ? 'selected' : ''}>
                            ${t('observerAuthenticated') || 'Authenticated (email required)'}
                        </option>
                        <option value="public" ${obsMode === 'public' ? 'selected' : ''}>
                            ${t('observerPublic') || 'Public (anyone)'}
                        </option>
                    </select>
                    <small style="color: var(--neutral-500); font-size: 10px;">
                        ${t('observerHint') || 'Observers submit observations pending approval.'}
                    </small>
                </div>`;
    // Access Rules
    if (canManage) {
        html += `
                <div class="gov-subsection-header">
                    ${t('accessRules') || 'Access Rules'} (${rules.length})
                </div>`;
        if (rules.length === 0) {
            html += `<div class="gov-empty" style="font-size: 11px;">
                        ${t('noRules') || 'No rules defined. All users have full access.'}
                     </div>`;
        } else {
            for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                html += `
                <div class="access-rule-row" style="display: flex; gap: 4px; margin-bottom: 4px; align-items: center;">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:auth:input:L1283" type="email" class="form-input form-input-sm" style="flex: 2;"
                           value="${escapeAttr(rule.email)}"
                           placeholder="${t('auth.emailPlaceholder')}"
                           data-cc-call-change="handleUpdateAccessRule|j:${encodeURIComponent(String(i))}|s:email|v">
                    <select data-field-meta="true" data-field-meta-key="auto-pos:auth:select:L1070" class="form-input form-input-sm" style="flex: 1;"
                            data-cc-call-change="handleUpdateAccessRule|j:${encodeURIComponent(String(i))}|s:role|v">
                        <option value="admin" ${rule.role === 'admin' ? 'selected' : ''}>Admin</option>
                        <option value="editor" ${rule.role === 'editor' ? 'selected' : ''}>Editor</option>
                        <option value="viewer" ${rule.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                    </select>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:auth:input:L1076" type="text" class="form-input form-input-sm" style="flex: 1;"
                           value="${escapeAttr(rule.areas.join(', '))}"
                           placeholder="${t('auth.roleWildcardPlaceholder')}"
                           data-cc-call-change="handleUpdateAccessRule|j:${encodeURIComponent(String(i))}|s:areas|v">
                    <button class="btn btn-sm btn-danger" style="flex-shrink: 0;"
                            data-cc-call-click="handleRemoveAccessRule|j:${encodeURIComponent(String(i))}">
                        <span data-icon="trash-2" data-icon-size="12px"></span>
                    </button>
                </div>`;
            }
        }
        html += `
                <button class="btn btn-sm btn-primary" data-cc-action="cc-a7e3e79d" style="margin-top: 4px;">
                    + ${t('addRule') || 'Add Rule'}
                </button>`;
    }
    html += `
            </div>
        </div>`;
    return html;
}
/**
 * Render the access modal content.
 */
function renderAccessModal() {
    const container = _el('access-modal-body');
    if (!container) return;
    container.innerHTML = renderAccessControlSection();
    requestAnimationFrame(() => {
        if (window.hydrateIcons) window.hydrateIcons();
    });
}
/**
 * Get area options from the areas tree.
 * @returns {Array<{ id: string, name: string }>}
 */
function getAreaOptions() {
    const tree = (window as any).areasTreeData || [];
    const options: Array<{ id: string; name: string }> = [];
    /** @param {any} node */
    function walk(node: any) {
        options.push({ id: node.id, name: node.name });
        if (Array.isArray(node.children)) {
            node.children.forEach(walk);
        }
    }
    tree.forEach(walk);
    return options;
}
// ----------------------------------------------------------------
// API KEYS
// Gerenciamento de chaves de API para acesso programático (MCP)
// ----------------------------------------------------------------
/**
 * Open the API Keys management modal.
 * Abre o modal de gerenciamento de chaves de API.
 */
function handleOpenApiKeys() {
    const user = getCurrentUser();
    if (!user) {
        showToast(t('loginRequired') || 'Login required', 'warning');
        return;
    }
    openApiKeyModal();
}
/**
 * Close the API Keys management modal.
 * Fecha o modal de gerenciamento de chaves de API.
 */
function handleCloseApiKeys() {
    closeApiKeyModal();
}
// ----------------------------------------------------------------
// GDPR DATA EXPORT
// LGPD Art. 18 - direito de acesso/portabilidade
// ----------------------------------------------------------------
/**
 * Export all user data as JSON (GDPR/LGPD right of access).
 * Calls the gdpr-export edge function and triggers a download.
 */
async function handleExportMyData() {
    const user = getCurrentUser();
    if (!user) {
        showToast(t('loginRequired') || 'Login required', 'warning');
        return false;
    }
    const client = getSupabaseClient();
    if (!client) {
        showToast(t('errorWithMessage', { message: 'Supabase not initialized' }) || 'Error', 'error');
        return false;
    }
    const btn = _el('auth-export-data-btn');
    const originalText = btn ? btn.innerHTML : '';
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span data-i18n="gdpr.export.downloading">${t('gdpr.export.downloading') || 'Preparing your data export...'}</span>`;
        }
        const { data, error } = await client.functions.invoke('gdpr-export', {
            body: { userId: user.id },
        });
        if (error) throw error;
        if (data?.status !== 'completed') {
            throw new Error('A exportação ainda possui categorias pendentes. Tente novamente.');
        }
        if (!data || !data.export) throw new Error('Empty export response');
        const blob = new Blob([JSON.stringify(data.export, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ecbyts-export-${String(user.id || 'user').slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast(t('fileDownloaded') || 'File downloaded!', 'success');
        return true;
    } catch (err: any) {
        log.error('Data export failed', _errorMessage(err));
        showToast(t('errorWithMessage', { message: _errorMessage(err) }) || 'Export failed', 'error');
        return false;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}
// ----------------------------------------------------------------
/**
 * Extract the JSON body from a supabase-js FunctionsHttpError — err.context
 * is the raw fetch Response of the non-2xx reply. Returns null when there is
 * no readable JSON body (network error, body already consumed, non-JSON).
 */
async function _functionsErrorBody(err: any): Promise<any | null> {
    try {
        const ctx = err?.context;
        if (ctx && typeof ctx.json === 'function') return await ctx.json();
    } catch (e: any) {
        // não-JSON ou body já consumido — cai no fluxo de erro genérico
        console.debug('[gdpr-delete] corpo de erro ilegível', e?.message || e);
    }
    return null;
}
// ----------------------------------------------------------------
/**
 * Delete account + personal data (LGPD Art. 18 VI / GDPR Art. 17 —
 * direito de eliminação). Wires the "Excluir minha conta" menu button to
 * the deployed gdpr-delete edge function.
 *
 * Defesa em duas etapas (o backend também exige a frase, defense-in-depth):
 *   1. asyncConfirm (botão danger) — aviso do que será apagado.
 *   2. asyncPrompt — usuário digita a frase exata 'EXCLUIR MEUS DADOS'.
 * Só então invoca gdpr-delete com { user_id, confirmation }. Sem a frase
 * exata NADA é enviado — nenhuma deleção acidental é possível.
 */
async function handleDeleteMyData() {
    const user = getCurrentUser();
    if (!user) {
        showToast(t('loginRequired') || 'Login required', 'warning');
        return;
    }
    const client = getSupabaseClient();
    if (!client) {
        showToast(t('errorWithMessage', { message: 'Supabase not initialized' }) || 'Error', 'error');
        return;
    }
    // Frase de confirmação — DEVE bater com REQUIRED_CONFIRMATION do backend.
    const REQUIRED_PHRASE = 'EXCLUIR MEUS DADOS';
    // A exportacao usa o mesmo fluxo reconciliado da area da conta. Se qualquer
    // categoria falhar, a jornada para aqui e nao aparenta ter exportado tudo.
    const exportBeforeExit = await asyncConfirm(
        `${t('gdpr.delete.warning') || 'Saida voluntaria da conta.'}\n\nAntes de sair, voce pode exportar ou baixar seus dados primeiro em JSON. A preparacao e imediata quando todas as categorias estiverem disponiveis.`,
        {
            confirmLabel: t('gdpr.export') || 'Exportar primeiro',
            cancelLabel: 'Continuar sem exportar',
            danger: false,
        },
    );
    if (exportBeforeExit && !(await handleExportMyData())) return;
    // Etapa 1: aviso.
    const warned = await asyncConfirm(
        'Isto anonimiza seu perfil e apaga permanentemente seus dados pessoais. Esta acao e IRREVERSIVEL e encerra sua sessao. O prazo estimado para concluir o pedido e de ate 15 dias. Registros minimos de auditoria podem ser preservados por 5 anos por obrigacao legal, seguranca e prevencao a fraude.',
        {
            confirmLabel: t('gdpr.delete.confirmContinue') || 'Continuar',
            cancelLabel: t('cancel') || 'Cancelar',
            danger: true,
        },
    );
    if (!warned) return;
    // Etapa 2: exige digitar a frase exata.
    const typed = await asyncPrompt(
        (t('gdpr.delete.typePhrase') || 'Para confirmar, digite exatamente:') + ` ${REQUIRED_PHRASE}`,
        '',
        {
            confirmLabel: t('gdpr.delete.confirmDelete') || 'Excluir minha conta',
            cancelLabel: t('cancel') || 'Cancelar',
            placeholder: REQUIRED_PHRASE,
        },
    );
    if (typed == null) return; // cancelado
    if (typed.trim() !== REQUIRED_PHRASE) {
        showToast(t('gdpr.delete.phraseMismatch') || 'Frase de confirmação incorreta. Nada foi apagado.', 'warning');
        return;
    }
    const btn = _el('auth-delete-account-btn');
    const originalText = btn ? btn.innerHTML : '';
    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>Enviando solicitacao...</span>';
        }
        const idempotencyKey = crypto.randomUUID();
        const { data, error } = await client.functions.invoke('gdpr-delete', {
            body: {
                action: 'request',
                user_id: user.id,
                confirmation: REQUIRED_PHRASE,
                idempotency_key: idempotencyKey,
                policy_version: '1.0.0',
            },
        });
        if (error) throw error;
        if (!data?.request_id || data.status !== 'received') {
            throw new Error('Unexpected deletion request response');
        }
        localStorage.setItem('ecbyts.privacyDeletionRequestId', data.request_id);
        const dueDate = data.due_at ? new Date(data.due_at).toLocaleDateString() : 'ate 15 dias';
        showToast(`Solicitacao recebida. Protocolo: ${data.request_id}. Prazo: ${dueDate}.`, 'success');
    } catch (err: any) {
        // 409 owner_transfer_required (backend pre-check, migration 202608050003):
        // dono único de org com outros membros — nada foi apagado; orientar a
        // transferência de posse em vez do erro genérico.
        const body = await _functionsErrorBody(err);
        if (body?.error === 'owner_transfer_required') {
            const orgNames = Array.isArray(body.organizations)
                ? body.organizations.map((o: any) => o?.org_name).filter(Boolean).join(', ')
                : '';
            showToast(
                t('gdpr.delete.ownerTransferRequired', { orgs: orgNames })
                    || `Sua conta NÃO foi excluída — nada foi apagado. Você é o único dono da organização${orgNames ? ` "${orgNames}"` : ''}, que ainda tem outros membros. Transfira a posse para outro membro no painel da organização e tente novamente.`,
                'warning',
            );
            return;
        }
        log.error('Account deletion failed', _errorMessage(err));
        showToast(t('errorWithMessage', { message: _errorMessage(err) }) || 'Deletion failed', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}

async function handleDeletionRequestStatus() {
    const user = getCurrentUser();
    const client = getSupabaseClient();
    const requestId = localStorage.getItem('ecbyts.privacyDeletionRequestId');
    if (!user || !client) {
        showToast(t('loginRequired') || 'Login required', 'warning');
        return;
    }
    if (!requestId) {
        showToast('Nenhum protocolo de exclusao foi salvo neste navegador.', 'warning');
        return;
    }
    try {
        const { data, error } = await client.functions.invoke('gdpr-delete', {
            body: { action: 'status', user_id: user.id, request_id: requestId },
        });
        if (error || !data?.request_id || data.user_id !== user.id) {
            throw error || new Error('request_not_found');
        }
        const updated = data.updated_at ? new Date(data.updated_at).toLocaleString() : 'sem data';
        showToast(`Protocolo ${data.request_id}: ${data.status}. Atualizado em ${updated}.`, 'info');
    } catch (err: any) {
        log.error('Deletion request lookup failed', _errorMessage(err));
        showToast('Nao foi possivel consultar este protocolo.', 'error');
    }
}
// ----------------------------------------------------------------
// STRIPE CONNECT
// Onboarding para criadores venderem bibliotecas
// ----------------------------------------------------------------
/**
 * Open Stripe Connect onboarding or show status.
 * Redireciona para onboarding do Stripe Express ou mostra status.
 */
async function handleOpenStripeConnect() {
    const user = getCurrentUser();
    if (!user) {
        showToast(t('loginRequired') || 'Login required', 'warning');
        return;
    }
    try {
        const { status } = await _ensureConnectStatus(user.id, { force: true });
        if (status === 'active') {
            showToast(t('stripeConnectActive') || 'Stripe account connected!', 'success');
            return;
        }
        // Start or resume onboarding
        const url = await startConnectOnboarding();
        window.location.href = url;
    } catch (err: any) {
        log.error('Stripe Connect onboarding failed', _errorMessage(err));
        showToast(_errorMessage(err) || 'Error starting Stripe Connect', 'error');
    }
}
// ----------------------------------------------------------------
// NOTIFICATIONS - Bell icon in titlebar
// Notificacoes in-app discretas (sem push, sem email, sem som)
// ----------------------------------------------------------------
/**
 * Update notification bell visibility and unread count.
 * Mostra/esconde o sino e atualiza badge de nao-lidas.
 */
function updateNotificationBell() {
    const wrapper = _el('notification-bell-wrapper');
    if (!wrapper) return;
    const user = getCurrentUser();
    if (!user) {
        wrapper.style.display = 'none';
        return;
    }
    wrapper.style.display = '';
    // Fetch unread count (non-blocking)
    _ensureNotificationCount(user.id)
        .then((count: any) => {
            const badge = _el('notification-badge');
            if (badge) {
                if (count > 0) {
                    badge.textContent = count > 99 ? '99+' : String(count);
                    badge.style.display = '';
                } else {
                    badge.style.display = 'none';
                }
            }
        })
        .catch((err: any) => {
            log.debug('Notification count fetch ignored', _errorMessage(err));
        });
}
/**
 * Toggle notification dropdown.
 * Abre/fecha o dropdown de notificacoes.
 */
async function handleToggleNotifications() {
    const dropdown = _el('notification-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.contains('open');
    if (isOpen) {
        dropdown.classList.remove('open');
        return;
    }
    // Open and load notifications
    dropdown.classList.add('open');
    const listEl = _el('notification-list');
    if (!listEl) return;
    listEl.innerHTML = `<div class="notification-empty">${t('libraryLoadingMarketplace') || 'Loading...'}</div>`;
    try {
        const items = await fetchNotifications(30);
        if (!items || items.length === 0) {
            listEl.innerHTML = `<div class="notification-empty">${t('noNotifications') || 'No notifications'}</div>`;
            return;
        }
        listEl.innerHTML = items
            .map((n: any) => {
                /** @type {Record<string, string>} */
                const iconMap = {
                    comment_on_yours: 'message-circle',
                    reply_to_comment: 'message-circle',
                    new_follower: 'user-plus',
                    library_update: 'refresh-cw',
                    purchase_confirmed: 'check',
                    rating_received: 'star',
                };
                const item = n;
                const icon = (iconMap as any)[item.type] || 'bell';
                const unreadClass = item.is_read ? '' : ' unread';
                const time = _notifTimeAgo(item.created_at);
                return `<div class="notification-item${unreadClass}" data-notif-id="${escapeAttr(item.id)}">
                <div class="notification-item-icon"><span data-icon="${icon}" data-icon-size="14px"></span></div>
                <div class="notification-item-body">
                    <div class="notification-item-title">${escapeHtml(item.title)}</div>
                    <div class="notification-item-time">${time}</div>
                </div>
            </div>`;
            })
            .join('');
        // Footer: Ver todas
        const footer = document.createElement('div');
        footer.className = 'notification-dropdown-footer';
        footer.innerHTML = `<button type="button">${t('notification.viewAll') || 'Ver todas'}</button>`;
        footer.querySelector('button')?.addEventListener('click', () => {
            dropdown.classList.remove('open');
            handleOpenNotificationsPage();
        });
        listEl.appendChild(footer);
        // Hydrate icons in the dropdown
        if (typeof window.hydrateIcons === 'function') {
            requestAnimationFrame(() => window.hydrateIcons(dropdown));
        }
    } catch (err: any) {
        log.error('Failed to fetch notifications', _errorMessage(err));
        listEl.innerHTML = `<div class="notification-empty">${t('error') || 'Error'}</div>`;
    }
}
/**
 * Mark all notifications as read.
 */
async function handleMarkAllNotificationsRead() {
    try {
        await markNotificationsRead([]);
        _invalidateNotificationCountCache();
        updateNotificationBell();
        // Update UI: remove unread styling
        const items = _qsa('.notification-item.unread');
        items.forEach(/** @param {any} dateStr */ (el: any) => el.classList.remove('unread'));
    } catch (err: any) {
        log.debug('Mark notifications read ignored', _errorMessage(err));
    }
}
/** Simple time-ago for notifications */
/** @param {string} dateStr */
function _notifTimeAgo(dateStr: any) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('justNow') || 'just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
}
// Close notification dropdown when clicking outside
document.addEventListener('click', (e: any) => {
    const dropdown = _el('notification-dropdown');
    const wrapper = _el('notification-bell-wrapper');
    if (dropdown && wrapper && !wrapper.contains(e.target)) {
        dropdown.classList.remove('open');
    }
});
// ----------------------------------------------------------------
// INVITE-ONLY HANDLERS (INV-4)
// ----------------------------------------------------------------
/**
 * Process invite claim + generation after successful signup.
 * Reivindica o convite usado e gera 3 novos para o usuario.
 *
 * @param {string|undefined} userId - auth.users.id do novo usuario
 */
async function _processInviteAfterSignup(userId: any) {
    if (!userId) return;
    try {
        const { claimInviteCode, generateUserInvites } = await import('../auth/session.js');
        // Claim: ler codigo de sessionStorage ou localStorage (RED-1 fallback)
        const code = sessionStorage.getItem('ecbyts-invite-code') || localStorage.getItem('ecbyts-pending-invite');
        if (code) {
            await claimInviteCode(code, userId);
            sessionStorage.removeItem('ecbyts-invite-code');
            localStorage.removeItem('ecbyts-pending-invite');
        } else if (CONFIG.FEATURES.INVITE_ONLY) {
            // Não deveria ocorrer - handleRegisterEmail bloqueia cadastro sem código.
            // Se chegou aqui, uma conta foi criada sem consumir convite.
            console.warn('[Auth] INVITE_ONLY: signup completed with no invite code in storage. userId:', userId);
        }
        // Gerar 3 convites para o novo usuario
        await generateUserInvites(userId);
    } catch (err: any) {
        log.warn('Invite processing skipped', _errorMessage(err));
    }
}
/**
 * Open the "My Invites" panel.
 * Abre o painel com os codigos de convite do usuario.
 */
async function handleOpenInvitePanel() {
    try {
        const { renderInvitePanel } = await import('../ui/invitePanel.js');
        await (renderInvitePanel as any)();
    } catch (err: any) {
        log.error('Failed to open invite panel', _errorMessage(err));
    }
}
/**
 * Copy invite link to clipboard.
 * @param {string} code - Codigo do convite
 */
async function handleCopyInviteLink(code: any) {
    const link = `${location.origin}/?invite=${code}`;
    try {
        await navigator.clipboard.writeText(link);
        showToast(t('invite.linkCopied') || 'Invite link copied!', 'success');
    } catch (err: any) {
        log.error('Clipboard copy failed', _errorMessage(err));
        showToast('Failed to copy', 'error');
    }
}
// ARCH-ADMIN-SEGREG-001 F3.1 (2026-05-30, claude-adm): handleOpenInviteAdmin
// REMOVIDO — invite admin agora vive exclusivamente no ecbytsadmin
// (localhost:3001), módulo `invites` + `triagem`. Calvin acessa via
// http://127.0.0.1:3001 → sidebar Invites.
async function handleOpenInviteAdmin() {
    log.warn('handleOpenInviteAdmin deprecated — use http://127.0.0.1:3001 (ecbytsadmin)');
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export function handleOpenPersonalEnvironment() {
    openPersonalEnvironmentModal();
}

export function handleOpenRegionalPreferences() {
    import('../ui/regionalPreferencesModal.js' as string)
        .then(({ openRegionalPreferencesModal }) => openRegionalPreferencesModal())
        .catch((err: any) => log.error('Failed to open regional preferences', _errorMessage(err)));
}

if (typeof window !== 'undefined') {
    (window as any).handleOpenRegionalPreferences = handleOpenRegionalPreferences;
}
export async function handleOpenNotificationsPage() {
    try {
        const { openNotificationsPage } = await import('../ui/notificationsPage.js');
        const user = getCurrentUser();
        await openNotificationsPage(user?.id || 'anonymous');
    } catch (err: any) {
        log.error('Failed to open notifications page', _errorMessage(err));
    }
}
export const authHandlers = {
    handleLoginEmail,
    handleRegisterEmail,
    handleLoginGoogle,
    handleLoginGitHub,
    handleLoginMicrosoft,
    handleForgotPassword,
    handleLogout,
    handleToggleAuthMenu,
    handleOpenAuthModal,
    handleCloseAuthModal,
    handleOpenPersonalEnvironment,
    handleOpenRegionalPreferences,
    handleOpenAccessModal,
    handleClaimOwnership,
    handleAddAccessRule,
    handleRemoveAccessRule,
    handleUpdateAccessRule,
    handleObserverModeChange,
    updateAuthUI,
    // Novos: tipo de cadastro e credenciais
    handleShowRegistrationTypes,
    handleHideRegistrationTypes,
    handleSelectUserType,
    handleOpenCredentialModal,
    handleCloseCredentialModal,
    // SHARE-001 phase 3: resource shares panel
    handleOpenSharesPanel,
    handleCloseSharesPanel,
    handleSubmitCredentialUpload,
    handleSubmitCredential,
    updateCredentialEisPreview,
    handleOpenStripeConnect,
    handleToggleNotifications,
    handleMarkAllNotificationsRead,
    handleOpenNotificationsPage,
    handleOpenApiKeys,
    handleCloseApiKeys,
    // INV-4/5: Invite handlers
    handleOpenInvitePanel,
    handleCopyInviteLink,
    handleOpenInviteAdmin,
    // LEGAL-001: GDPR export
    handleExportMyData,
    // CR-014: GDPR account deletion (self-service, LGPD Art. 18 VI)
    handleDeleteMyData,
    handleDeletionRequestStatus,
    // SEC-1: Role guard
    handleCheckAdminAccess,
    // P1-19: UX throttle
    isAuthThrottled,
};
//# sourceMappingURL=auth.js.map
