// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TERMS ACCEPTANCE MODAL — aceite de Termos pós-OAuth
   (EARLY-ADOPTER-LAUNCH-READINESS#tos-oauth-consent)

   Modal BLOQUEANTE que aparece ANTES de a sessão ser liberada quando
   `public.profiles.terms_accepted_at` está vazio/desatualizado. Recusar
   ou fechar = sessão não liberada (o caller faz signOut).

   REUSO (o item manda reusar o padrão do #legal-consent-modal):
    • mesmas classes do design system — .ecbt-overlay / .ecbt-dialog /
      .ecbt-dialog--sm / .ecbt-header / .ecbt-title / .ecbt-form /
      .ecbt-hint / .ecbt-actions / .ecbt-btn / .legal-consent-improve-row;
    • mesmo helper de a11y (attachModalA11y: Escape, focus trap, retorno
      de foco) e mesmo escapeHtml das strings i18n.

   CSS EM SESSÃO FRIA: TODAS essas classes vivem em app/css/design-tokens.css
   (+ .btn-primary/.btn-secondary em styles.css), e os dois <link> são
   EAGER em app/index.html — NÃO carregam `data-deferred-href`. Por isso o
   modal abre estilizado no boot frio (que é o caminho real deste gate: ele
   dispara no retorno do redirect OAuth). Nenhuma folha nova é criada; se
   fosse, ela seria adiada e o modal abriria cru.
   ================================================================ */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { attachModalA11y } from './modalA11y.js';
import { Z_INDEX } from './zIndex.js';
import { TERMS_VERSION } from '../../core/auth/termsAcceptance.js';

export const TERMS_MODAL_ID = 'terms-acceptance-modal';

/** Resultado do modal, do ponto de vista do gate de sessão. */
export type TermsModalOutcome = 'accepted' | 'declined';

export interface TermsModalOptions {
    /** Versão do contrato apresentada e gravada. */
    version?: string;
    /**
     * Persistência do aceite. DEVE resolver `true` só quando o carimbo
     * chegou ao banco. `false`/throw mantém o modal aberto: liberar a
     * sessão sem carimbo é exatamente o buraco que este item fecha.
     */
    persist: (version: string) => Promise<boolean>;
}

let _a11yCleanup: (() => void) | null = null;

function _text(key: string, fallback: string): string {
    return t(key) || fallback;
}

/** Remove o modal e desarma o a11y. Idempotente. */
export function closeTermsAcceptanceModal(): void {
    if (typeof document === 'undefined') return;
    if (typeof _a11yCleanup === 'function') {
        try {
            _a11yCleanup();
        } catch (e: any) {
            console.debug('[termsAcceptanceModal:a11yCleanup]', e?.message || e);
        }
        _a11yCleanup = null;
    }
    document.getElementById(TERMS_MODAL_ID)?.remove();
}

/**
 * Mostra o modal e resolve quando o usuário decidir.
 *
 * Resolve 'accepted' SOMENTE depois de `persist()` confirmar a gravação.
 * Resolve 'declined' na recusa, no Escape e no fechamento — os três são
 * o mesmo fato para o gate: sem aceite, sem sessão.
 */
export function showTermsAcceptanceModal(options: TermsModalOptions): Promise<TermsModalOutcome> {
    const version = (typeof options?.version === 'string' && options.version.trim()) || TERMS_VERSION;
    if (typeof document === 'undefined' || !document.body) {
        // Sem DOM (Node/headless) não há como colher consentimento: recusa.
        return Promise.resolve('declined');
    }
    closeTermsAcceptanceModal();

    const title = _text('terms.gateTitle', 'Accept the Terms to continue');
    const intro = _text(
        'terms.gateIntro',
        'To use ecbyts you must accept the Terms of Service and the Privacy Policy. Your acceptance is recorded in your account.',
    );
    const termsLbl = _text('legal.terms', 'Terms of Service');
    const privacyLbl = _text('legal.privacy', 'Privacy Policy');
    const checkboxLbl = _text('terms.gateCheckbox', 'I have read and accept the Terms of Service and the Privacy Policy.');
    const acceptLbl = _text('terms.gateAccept', 'Accept and continue');
    const declineLbl = _text('terms.gateDecline', 'Decline and sign out');
    const versionLbl = _text('terms.gateVersion', 'Document version');
    const savingLbl = _text('terms.gateSaving', 'Recording acceptance...');
    const errorLbl = _text('terms.gateError', 'Could not record your acceptance. Check your connection and try again.');

    const overlay = document.createElement('div');
    overlay.id = TERMS_MODAL_ID;
    overlay.className = 'ecbt-overlay';
    // Porteiro de sessão: precisa ficar acima do welcome (9998), do disclaimer
    // (9999) e do modal de auth — é ele que decide se a sessão existe. Mesmo
    // argumento (e mesmo teto documentado, MAX_ZINDEX do css-zindex-audit) do
    // banner de Modo Convidado.
    overlay.style.zIndex = String(Z_INDEX.EXCEPTION_TERMS_ACCEPTANCE_GATE);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'terms-acceptance-title');
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--sm">
            <div class="ecbt-header">
                <span class="ecbt-title" id="terms-acceptance-title">${escapeHtml(title)}</span>
            </div>
            <div class="ecbt-form">
                <p>${escapeHtml(intro)}</p>
                <p>
                    <a href="/terms.html" target="_blank" rel="noopener">${escapeHtml(termsLbl)}</a>
                    &middot;
                    <a href="/privacy.html" target="_blank" rel="noopener">${escapeHtml(privacyLbl)}</a>
                </p>
                <label class="legal-consent-improve-row" for="terms-acceptance-check">
                    <!-- Aceite é ato afirmativo explícito: NUNCA pré-marcado. -->
                    <input type="checkbox" id="terms-acceptance-check" />
                    <span>${escapeHtml(checkboxLbl)}</span>
                </label>
                <p class="ecbt-hint">${escapeHtml(versionLbl)}: ${escapeHtml(version)}</p>
                <p class="ecbt-hint" id="terms-acceptance-status" role="status" aria-live="polite"></p>
                <div class="ecbt-actions">
                    <button type="button" class="ecbt-btn btn-secondary" id="terms-acceptance-decline">${escapeHtml(declineLbl)}</button>
                    <button type="button" class="ecbt-btn btn-primary" id="terms-acceptance-accept" disabled>${escapeHtml(acceptLbl)}</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);

    const checkbox = document.getElementById('terms-acceptance-check') as HTMLInputElement | null;
    const acceptBtn = document.getElementById('terms-acceptance-accept') as HTMLButtonElement | null;
    const declineBtn = document.getElementById('terms-acceptance-decline') as HTMLButtonElement | null;
    const status = document.getElementById('terms-acceptance-status');

    return new Promise<TermsModalOutcome>((resolve) => {
        let settled = false;
        const settle = (outcome: TermsModalOutcome) => {
            if (settled) return;
            settled = true;
            closeTermsAcceptanceModal();
            resolve(outcome);
        };

        checkbox?.addEventListener('change', () => {
            if (acceptBtn) acceptBtn.disabled = checkbox.checked !== true;
        });

        acceptBtn?.addEventListener('click', () => {
            if (settled || checkbox?.checked !== true) return;
            acceptBtn.disabled = true;
            if (declineBtn) declineBtn.disabled = true;
            if (status) status.textContent = savingLbl;
            void Promise.resolve()
                .then(() => options.persist(version))
                .then((ok) => {
                    if (ok === true) {
                        settle('accepted');
                        return;
                    }
                    // Escrita falhou: NÃO libera. Sessão sem carimbo é o buraco.
                    if (status) status.textContent = errorLbl;
                    acceptBtn.disabled = false;
                    if (declineBtn) declineBtn.disabled = false;
                })
                .catch((e: any) => {
                    console.warn('[termsAcceptanceModal] persist failed:', e?.message || e);
                    if (status) status.textContent = errorLbl;
                    acceptBtn.disabled = false;
                    if (declineBtn) declineBtn.disabled = false;
                });
        });

        declineBtn?.addEventListener('click', () => settle('declined'));
        // Escape = recusa. Fechar sem aceitar não pode deixar meia-sessão viva.
        _a11yCleanup = attachModalA11y(overlay, () => settle('declined'), {
            initialFocus: checkbox,
        });
    });
}
