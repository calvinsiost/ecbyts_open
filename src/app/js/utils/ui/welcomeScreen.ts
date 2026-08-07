// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   WELCOME SCREEN — First-visit onboarding overlay
   Tela de boas-vindas na primeira visita do usuario.
   Tour do Produto como opcao destacada + 4 modos de projeto.

   CICLO DE VIDA:
   - Aparece automaticamente na primeira visita (apos disclaimer)
   - Pode ser re-aberta via botao nas configuracoes
   - Checkbox "Nao mostrar novamente" persiste preferencia
   ================================================================ */
import { t } from '../i18n/translations.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { CONFIG } from '../../config.js';
import { validateInviteCode, submitWaitlist, getCurrentUser } from '../auth/session.js';
import { validateInviteCodeFormat } from '../../core/auth/inviteCode.js';
import { isBatchInviteCode } from '../../core/freemium/_inviteBatchPure.js';
import { showToast } from './toast.js';
import { escapeHtml } from '../helpers/html.js';
import { yieldToMain } from '../performance/yielding.js';
import { FIRST_VISIT_KEY, markWelcomeTourSeen } from '../tour/firstVisitTour.js';
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-welcome-shown';
const WAITLIST_THROTTLE_KEY = 'ecbyts-waitlist-throttle';
const WAITLIST_THROTTLE_MAX = 3;
const WAITLIST_THROTTLE_WINDOW_MS = 10 * 60_000; // 10 min
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let overlayEl: any = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Check if the welcome screen should be shown.
 * Verifica se a tela de boas-vindas deve ser exibida.
 *
 * @returns {boolean}
 */
export function shouldShowWelcome() {
    return !localStorage.getItem(FIRST_VISIT_KEY) && localStorage.getItem(STORAGE_KEY) !== 'true';
}
/**
 * Show the welcome screen overlay.
 * Exibe a tela de boas-vindas e retorna o modo escolhido.
 * Se INVITE_ONLY ativo e usuario nao autenticado, mostra modo convite.
 *
 * @param {Object} [options]
 * @param {string|null} [options.prefillCode] - Codigo de convite da URL (?invite=CODE)
 * @returns {Promise<'random'|'blank'|'mapPicker'|'lastLocation'|'lastProject'|'tour'|'invite-accepted'|'invite-demo'|null>}
 */
export function showWelcomeScreen(options = {}) {
    return new Promise((resolve) => {
        // Se invite-only ativo mas usuario ja logado, bypass
        if (CONFIG.FEATURES.INVITE_ONLY && getCurrentUser()) {
            _buildOverlay(resolve);
            return;
        }
        if (CONFIG.FEATURES.INVITE_ONLY && !_hasLocalE2EInviteBypass()) {
            _buildInviteOverlay(resolve, (options as any).prefillCode || null);
            return;
        }
        _buildOverlay(resolve);
    });
}
/**
 * Reset the welcome screen preference (re-enable automatic display).
 * Reseta preferencia para que a welcome screen apareca novamente.
 */
export function resetWelcomePreference() {
    localStorage.removeItem(FIRST_VISIT_KEY);
    localStorage.removeItem(STORAGE_KEY);
}
// ----------------------------------------------------------------
// BUILD
// ----------------------------------------------------------------
/**
 * Build and display the welcome overlay.
 * Constroi o overlay com tres caminhos principais para o primeiro valor.
 *
 * @param {Function} resolve - Promise resolver (recebe modo escolhido)
 */
function _buildOverlay(resolve: any) {
    // Previne duplicacao se ja estiver aberta
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay';
    overlay.innerHTML = _buildHTML();
    document.body.appendChild(overlay);
    overlayEl = overlay;
    // Force the initial hidden layout before activating the transition. This
    // also makes the dialog active immediately for keyboard and E2E users.
    void overlay.offsetWidth;
    overlay.classList.add('active');
    // Registra handlers
    _bindEvents(overlay, resolve);
}
/**
 * Build the HTML template for the welcome screen.
 * HTML estatico - nenhum dado de usuario, sem risco XSS.
 *
 * @returns {string}
 */
function _buildHTML() {
    return `
        <div class="welcome-container" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
            <!-- Brand -->
            <div class="welcome-brand">
                <span id="welcome-title" class="welcome-brand-name">ecbyts<span class="welcome-brand-dot">.</span></span>
            </div>
            <div class="welcome-subtitle">Environmental Digital Twin Platform</div>

            <div class="welcome-section-label">${_t('welcomeHowToStart', 'How do you want to start?')}</div>

            <div class="welcome-cards" aria-label="${_t('welcomeHowToStart', 'How do you want to start?')}">
                <button class="welcome-card welcome-choice" type="button" data-mode="random" data-testid="welcome-explore-demo">
                    <span class="welcome-card-icon" aria-hidden="true">&#9851;</span>
                    <span class="welcome-card-title">${_t('welcomeExploreDemoTitle', 'Explore a demo')}</span>
                    <span class="welcome-card-desc">${_t('welcomeExploreDemoDesc', 'See a ready environmental model and learn by exploring')}</span>
                </button>
                <button class="welcome-card welcome-choice" type="button" data-action="open-key" data-testid="welcome-open-key">
                    <span class="welcome-card-icon" aria-hidden="true">&#128194;</span>
                    <span class="welcome-card-title">${_t('welcomeOpenKeyTitle', 'Open an existing key')}</span>
                    <span class="welcome-card-desc">${_t('welcomeOpenKeyDesc', 'Continue from an ECBT key saved on this computer')}</span>
                </button>
                <button class="welcome-card welcome-choice" type="button" data-mode="blank" data-testid="welcome-start-blank">
                    <span class="welcome-card-icon" aria-hidden="true">&#9634;</span>
                    <span class="welcome-card-title">${_t('welcomeStartBlankTitle', 'Start from scratch')}</span>
                    <span class="welcome-card-desc">${_t('welcomeStartBlankDesc', 'Create an empty model and add the first element')}</span>
                </button>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// EVENTS
// ----------------------------------------------------------------
/**
 * Bind click events to cards and tour button.
 * Associa cliques aos cards - cada um resolve a Promise com o modo.
 *
 * @param {HTMLElement} overlay - O elemento overlay
 * @param {Function} resolve - Promise resolver
 */
function _bindEvents(overlay: any, resolve: any) {
    let closed = false;
    /**
     * Close the overlay and resolve with chosen mode.
     * Fecha overlay com animacao e resolve.
     *
     * @param {string|null} mode - Modo escolhido
     * @param {Function|null} [afterClose] - Acao executada depois de remover o dialogo
     */
    function close(mode: any, afterClose: (() => void) | null = null) {
        if (closed) return;
        closed = true;
        document.removeEventListener('keydown', keyHandler);
        // First-visit flow is considered handled after any explicit choice or skip.
        safeSetItem(FIRST_VISIT_KEY, new Date().toISOString());
        safeSetItem(STORAGE_KEY, 'true');
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.remove();
            overlayEl = null;
            window.dispatchEvent(new CustomEvent('welcome:complete', { detail: { mode, persona: null } }));
            resolve(mode);
            if (afterClose) setTimeout(afterClose, 0);
        }, 350);
    }
    /** @param {KeyboardEvent} e */
    function keyHandler(e: any) {
        if (e.key === 'Escape') {
            close(null);
            return;
        }
        if (e.key !== 'Tab') return;
        const focusable = _getFocusableElements(overlay);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            (last as any).focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            (first as any).focus();
        }
    }
    const cards = overlay.querySelectorAll('.welcome-card[data-mode]');
    cards.forEach((card: any) => {
        card.addEventListener('click', () => {
            const mode = card.getAttribute('data-mode');
            close(mode);
        });
    });
    const openKeyBtn = overlay.querySelector('[data-action="open-key"]');
    if (openKeyBtn) {
        openKeyBtn.addEventListener('click', () => {
            close('blank', () => {
                const openImportModal = (window as any).openImportModal;
                if (typeof openImportModal === 'function') {
                    openImportModal();
                    return;
                }
                void import('./modals.js')
                    .then(({ openImportModal: openCanonicalImportModal }) => openCanonicalImportModal())
                    .catch(() => {
                        (document.getElementById('import-file') as HTMLInputElement | null)?.click();
                    });
            });
        });
    }
    document.addEventListener('keydown', keyHandler);
    const firstChoice = /** @type {HTMLElement|null} */ (overlay.querySelector('.welcome-choice'));
    const restoreInitialFocus = () => {
        if (overlay.isConnected && !overlay.contains(document.activeElement)) firstChoice?.focus();
    };
    firstChoice?.focus();
    overlay.addEventListener('transitionend', restoreInitialFocus, { once: true });
    void yieldToMain({ priority: 'user-visible', timeoutMs: 0 }).then(restoreInitialFocus);
}
/**
 * @param {ParentNode} rootEl
 * @returns {HTMLElement[]}
 */
function _getFocusableElements(rootEl: any) {
    return /** @type {HTMLElement[]} */ Array.from(
        rootEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
    ).filter((el: any) => {
        if (!(el instanceof HTMLElement)) return false;
        if ('disabled' in el && el.disabled) return false;
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && style.visibility !== 'hidden';
    });
}
/**
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function _t(key: any, fallback: any) {
    const translated = t(key);
    return translated && translated !== key ? translated : fallback;
}
function _hasLocalE2EInviteBypass() {
    try {
        const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
        return (
            isLocalhost &&
            ((window as any).__e2e_bypass_invite__ === true ||
                localStorage.getItem('__e2e_bypass_invite__') === '1' ||
                sessionStorage.getItem('__e2e_bypass_invite__') === '1')
        );
    } catch {
        return false;
    }
}
// ----------------------------------------------------------------
// INVITE-ONLY MODE (INV-2 + INV-3)
// Modo de convite exclusivo para primeira fase publica
// ----------------------------------------------------------------
/**
 * Build and display the invite-only overlay.
 * Mostra tela de convite com input de codigo + waitlist.
 *
 * @param {Function} resolve - Promise resolver
 * @param {string|null} prefillCode - Codigo pre-preenchido da URL
 */
function _buildInviteOverlay(resolve: any, prefillCode: any) {
    if (overlayEl) {
        overlayEl.remove();
        overlayEl = null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'welcome-overlay welcome-invite-mode';
    overlay.innerHTML = _buildInviteHTML(prefillCode);
    document.body.appendChild(overlay);
    overlayEl = overlay;
    requestAnimationFrame(() => {
        requestAnimationFrame(() => overlay.classList.add('active'));
    });
    _bindInviteEvents(overlay, resolve, prefillCode);
}
/**
 * Build HTML for invite-only mode.
 * Constroi tela: logo + tagline + input de codigo + link waitlist.
 *
 * @param {string|null} prefillCode - Codigo pre-preenchido
 * @returns {string}
 */
function _buildInviteHTML(prefillCode: any) {
    const code1 = prefillCode ? prefillCode.slice(0, 4).toUpperCase() : '';
    const code2 = prefillCode ? prefillCode.slice(4, 8).toUpperCase() : '';
    return `
        <div class="welcome-container welcome-invite-container">
            <!-- Brand -->
            <div class="welcome-brand">
                <span class="welcome-brand-name">ecbyts<span class="welcome-brand-dot">.</span></span>
            </div>
            <div class="welcome-subtitle">${t('invite.tagline') || 'Environmental Digital Twins -- By Invitation Only'}</div>

            <!-- Mission statement -->
            <div class="welcome-mission">
                ${t('welcomeMission') || 'Environmental data is a public asset. Join a growing network of professionals building transparent environmental monitoring for a healthier planet.'}
            </div>

            <!-- Invite code input -->
            <div class="invite-code-section">
                <label class="invite-code-label">${t('invite.enterCode') || 'Enter your invite code'}</label>
                <div class="invite-code-inputs">
                    <input data-field-meta="true" data-field-meta-key="auto:invite-code-1" type="text" id="invite-code-1" class="invite-code-field"
                           maxlength="4" placeholder="ABCD" autocomplete="off"
                           value="${escapeHtml(code1)}" />
                    <span class="invite-code-dash">&#8211;</span>
                    <input data-field-meta="true" data-field-meta-key="auto:invite-code-2" type="text" id="invite-code-2" class="invite-code-field"
                           maxlength="4" placeholder="1234" autocomplete="off"
                           value="${escapeHtml(code2)}" />
                </div>
                <div id="invite-code-error" class="invite-code-error" role="alert" aria-live="polite" style="display:none"></div>
                <button id="invite-submit-btn" class="invite-submit-btn">
                    ${t('invite.enterWithInvite') || 'Enter with Invite'}
                </button>
            </div>

            <!-- Login section for existing users -->
            <div class="invite-login-section">
                <a href="#" id="invite-login-link" class="invite-login-link">
                    ${t('invite.alreadyHaveAccount') || 'Already have an account? Log in'}
                </a>
            </div>

            <!-- Waitlist section (INV-3) -->
            <div class="invite-waitlist-section">
                <a href="#" id="invite-show-waitlist" class="invite-waitlist-link">
                    ${t('invite.requestAccess') || "Don't have an invite? Request Access"}
                </a>

                <form id="invite-waitlist-form" class="invite-waitlist-form" style="display:none">
                    <div class="invite-waitlist-title">${t('invite.waitlistTitle') || 'Request Access'}</div>
                    <input data-field-meta="true" data-field-meta-key="auto-name:name" type="text" name="name" required
                           placeholder="${t('invite.waitlistName') || 'Full name'}"
                           class="invite-waitlist-input" />
                    <input type="email" name="email" required
                           placeholder="${t('invite.waitlistEmail') || 'Email address'}"
                           class="invite-waitlist-input" />
                    <input data-field-meta="true" data-field-meta-key="auto-name:company" type="text" name="company"
                           placeholder="${t('invite.waitlistCompany') || 'Company (optional)'}"
                           class="invite-waitlist-input" />
                    <textarea data-field-meta="true" data-field-meta-key="auto-name:reason" name="reason" rows="2"
                              placeholder="${t('invite.waitlistReason') || 'Why are you interested? (optional)'}"
                              class="invite-waitlist-input invite-waitlist-textarea"></textarea>
                    <button type="submit" class="invite-submit-btn invite-waitlist-submit-btn">
                        ${t('invite.waitlistSubmit') || 'Submit Request'}
                    </button>
                    <a href="#" id="invite-back-to-code" class="invite-waitlist-link invite-back-link">
                        ${t('invite.backToInvite') || 'Back to invite code'}
                    </a>
                </form>

                <!-- Confirmacao pos-submit -->
                <div id="invite-waitlist-done" class="invite-waitlist-done" style="display:none">
                    <span>&#10003;</span> ${t('invite.waitlistSuccess') || "Your request has been received. We'll be in touch!"}
                </div>
            </div>
        </div>
    `;
}
/**
 * Bind events for invite-only mode.
 * Gerencia input mascarado, validacao, waitlist e navegacao.
 *
 * @param {HTMLElement} overlay
 * @param {Function} resolve
 * @param {string|null} prefillCode
 */
function _bindInviteEvents(overlay: any, resolve: any, prefillCode: any) {
    const input1 = overlay.querySelector('#invite-code-1') as HTMLInputElement | null;
    const input2 = overlay.querySelector('#invite-code-2') as HTMLInputElement | null;
    const errorEl = overlay.querySelector('#invite-code-error') as HTMLElement | null;
    const submitBtn = overlay.querySelector('#invite-submit-btn') as HTMLButtonElement | null;
    const _demoBtn = overlay.querySelector('#invite-demo-btn');
    const showWaitlist = overlay.querySelector('#invite-show-waitlist') as HTMLElement | null;
    const waitlistForm = overlay.querySelector('#invite-waitlist-form') as HTMLFormElement | null;
    const backToCode = overlay.querySelector('#invite-back-to-code') as HTMLElement | null;
    const codeSection = overlay.querySelector('.invite-code-section') as HTMLElement | null;
    if (!input1 || !input2 || !errorEl || !submitBtn || !showWaitlist || !waitlistForm || !backToCode || !codeSection) {
        resolve(null);
        return;
    }
    // Auto-uppercase + auto-focus no segundo campo
    input1.addEventListener('input', () => {
        input1.value = input1.value.toUpperCase().replace(/[^A-Z2-7]/g, '');
        if (input1.value.length === 4) input2.focus();
    });
    input2.addEventListener('input', () => {
        input2.value = input2.value.toUpperCase().replace(/[^A-Z2-7]/g, '');
    });
    // Paste handler: strip URL prefix, split into fields
    input1.addEventListener('paste', (e) => {
        e.preventDefault();
        const raw = (e.clipboardData?.getData('text') || '').trim();
        const cleaned = _extractCodeFromPaste(raw);
        input1.value = cleaned.slice(0, 4);
        input2.value = cleaned.slice(4, 8);
        if (input2.value.length > 0) input2.focus();
    });
    // Submit: validate code
    submitBtn.addEventListener('click', async () => {
        // Use shared pure-logic normalizer (core/auth/inviteCode.js) — rejects
        // ambiguous chars (0,1,I,O) the old regex /[^A-Z2-7]/ silently kept.
        // Defense in depth: avoids wasted round-trip + timing oracle on format errors.
        const formatCheck = validateInviteCodeFormat(input1.value + input2.value);
        errorEl.style.display = 'none';
        if (!formatCheck.valid) {
            _showInviteError(errorEl, input1, t('invite.invalidCode') || 'Invalid invite code');
            return;
        }
        const code = formatCheck.code;
        submitBtn.disabled = true;
        submitBtn.textContent = t('invite.validating') || 'Validating...';
        const result =
            /** @type {{ valid: boolean, error?: 'expired'|'exhausted'|'network'|'invalid' }} */ await validateInviteCode(
                code,
            );
        if (result.valid) {
            // Salvar em dual storage (RED-1 mitigation)
            sessionStorage.setItem('ecbyts-invite-code', code);
            safeSetItem('ecbyts-pending-invite', code);
            // T7.1 (SPEC_COMMERCIAL_READINESS_DOD): o overlay de convite É a
            // primeira visita tratada — marcar FIRST_VISIT_KEY aqui evita que o
            // gate pós-auth (startup-gates) mostre um SEGUNDO overlay de welcome.
            markWelcomeTourSeen();
            // Fechar overlay e abrir auth modal
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                overlayEl = null;
                // Dispara abertura do auth modal
                const handleOpenAuthModal = (window as any).handleOpenAuthModal;
                if (typeof handleOpenAuthModal === 'function') {
                    handleOpenAuthModal({ inviteLock: true });
                }
                resolve('invite-accepted');
            }, 350);
            return;
        }
        // Erro especifico
        const errorKey = {
            expired: t('invite.expiredCode') || 'This invite has expired',
            exhausted: t('invite.exhaustedCode') || 'This invite has already been used',
            revoked: t('invite.revokedCode') || 'This invite has been deactivated',
            network: t('invite.waitlistError') || 'Unable to validate. Please try again.',
            invalid: t('invite.invalidCode') || 'Invalid invite code',
        };
        let errMessage = (errorKey as Record<string, any>)[result.error || 'invalid'] || errorKey.invalid;
        // INVITE-BATCH-001 RF5 (flag-gated): codigo de turma TURM- ganha
        // mensagem acionavel — "peça um novo ao professor" em vez de tela morta.
        if ((CONFIG.FEATURES as any)?.INVITE_BATCH && isBatchInviteCode(code)) {
            const classroomKey: Record<string, string> = {
                exhausted:
                    t('invite.classroomExhausted') ||
                    'This class code has reached its usage limit — ask your instructor for a new one',
                expired:
                    t('invite.classroomExpired') || 'This class code has expired — ask your instructor for a new one',
                revoked:
                    t('invite.classroomRevoked') ||
                    'This class code was deactivated — ask your instructor for a new one',
            };
            errMessage = classroomKey[result.error || ''] || errMessage;
        }
        _showInviteError(errorEl, input1, errMessage);
        submitBtn.disabled = false;
        submitBtn.textContent = t('invite.enterWithInvite') || 'Enter with Invite';
    });
    // Enter key submits
    input2.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
    });
    // Login link: abre auth modal diretamente para usuarios existentes
    const loginLink = overlay.querySelector('#invite-login-link');
    if (loginLink) {
        loginLink.addEventListener('click', (e: any) => {
            e.preventDefault();
            // T7.1: usuário existente entrando pelo overlay de convite também
            // conta como primeira visita tratada — sem segundo overlay depois.
            markWelcomeTourSeen();
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.remove();
                overlayEl = null;
                const handleOpenAuthModal = (window as any).handleOpenAuthModal;
                if (typeof handleOpenAuthModal === 'function') {
                    handleOpenAuthModal({ inviteLock: true });
                }
                resolve('invite-accepted');
            }, 350);
        });
    }
    // Demo mode removido - acesso somente via convite válido
    // Toggle waitlist form
    showWaitlist.addEventListener('click', (e: any) => {
        e.preventDefault();
        codeSection.style.display = 'none';
        showWaitlist.style.display = 'none';
        waitlistForm.style.display = 'block';
        (waitlistForm.querySelector('input[name="name"]') as any)?.focus();
    });
    backToCode.addEventListener('click', (e: any) => {
        e.preventDefault();
        waitlistForm.style.display = 'none';
        codeSection.style.display = '';
        showWaitlist.style.display = '';
        input1.focus();
    });
    // Waitlist form submit (INV-3)
    waitlistForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // Throttle: max 3 submissoes por 10 minutos
        if (_isWaitlistThrottled()) {
            showToast(t('auth.tooManyAttempts') || 'Too many attempts. Please wait.', 'warning');
            return;
        }
        const formData = new FormData(waitlistForm);
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            company: formData.get('company'),
            reason: formData.get('reason'),
        };
        const submitBtnW = waitlistForm.querySelector('.invite-waitlist-submit-btn') as HTMLButtonElement | null;
        if (!submitBtnW) return;
        submitBtnW.disabled = true;
        const result = /** @type {{ success: boolean, error?: string }} */ await submitWaitlist(data);
        _recordWaitlistAttempt();
        if (result.success) {
            waitlistForm.style.display = 'none';
            const doneEl = overlay.querySelector('#invite-waitlist-done') as HTMLElement | null;
            if (doneEl) doneEl.style.display = 'block';
            showToast(t('invite.waitlistSuccess') || 'Your request has been received!', 'success');
        } else if (result.error === 'duplicate') {
            showToast(t('invite.waitlistDuplicate') || 'This email is already on our waitlist', 'warning');
            submitBtnW.disabled = false;
        } else {
            showToast(t('invite.waitlistError') || 'Unable to submit. Please try again later.', 'error');
            submitBtnW.disabled = false;
        }
    });
    // Tour sem autenticacao removido - acesso somente via convite válido
    // Escape bloqueado - não concede acesso sem convite
    // Auto-validate if prefilled
    if (prefillCode && prefillCode.length >= 8) {
        requestAnimationFrame(() => submitBtn.click());
    }
    // Focus first input
    input1.focus();
}
// ----------------------------------------------------------------
// INVITE HELPERS
// ----------------------------------------------------------------
/**
 * Extract invite code from pasted text (may be full URL).
 * Remove prefixo de URL e caracteres invalidos.
 * @param {string} raw - Texto colado
 * @returns {string} Codigo limpo (max 8 chars)
 */
function _extractCodeFromPaste(raw: any) {
    // Strip URL prefix: https://ecbyts.com/?invite=ABCD1234
    const match = raw.match(/[?&]invite=([A-Za-z0-9]+)/);
    const code = match ? match[1] : raw.replace(/[-\s]/g, '');
    return code
        .toUpperCase()
        .replace(/[^A-Z2-7]/g, '')
        .slice(0, 8);
}
/**
 * Show error below invite inputs with shake animation.
 * @param {HTMLElement} errorEl - Error message element
 * @param {HTMLElement} input - Input to shake
 * @param {string} message - Error text
 */
function _showInviteError(errorEl: any, input: any, message: any) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    const parent = input.parentElement;
    if (!parent) return;
    parent.classList.add('invite-shake');
    setTimeout(() => parent.classList.remove('invite-shake'), 500);
}
/**
 * Check if waitlist submissions are throttled.
 * @returns {boolean}
 */
function _isWaitlistThrottled() {
    try {
        const raw = sessionStorage.getItem(WAITLIST_THROTTLE_KEY) || '';
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (Date.now() - data.firstAt > WAITLIST_THROTTLE_WINDOW_MS) return false;
        return data.count >= WAITLIST_THROTTLE_MAX;
    } catch (e: any) {
        console.debug('[welcomeScreen] throttleCheck:', _errorMessage(e));
        return false;
    }
}
/**
 * Record a waitlist submission attempt.
 */
function _recordWaitlistAttempt() {
    try {
        const raw = sessionStorage.getItem(WAITLIST_THROTTLE_KEY) || '';
        const data = raw ? JSON.parse(raw) : {};
        const now = Date.now();
        if (!data.firstAt || now - data.firstAt > WAITLIST_THROTTLE_WINDOW_MS) {
            sessionStorage.setItem(WAITLIST_THROTTLE_KEY, JSON.stringify({ count: 1, firstAt: now }));
        } else {
            data.count = (data.count || 0) + 1;
            sessionStorage.setItem(WAITLIST_THROTTLE_KEY, JSON.stringify(data));
        }
    } catch (e: any) {
        console.debug('[welcomeScreen] recordAttempt:', _errorMessage(e));
        /* sessionStorage indisponivel — ignora */
    }
}
/**
 * @param {unknown} err
 * @returns {string}
 */
function _errorMessage(err: any) {
    return err instanceof Error ? err.message : String(err || '');
}
