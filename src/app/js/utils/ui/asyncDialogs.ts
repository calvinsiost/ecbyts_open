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
   ASYNC DIALOGS — Non-blocking replacements for prompt() and confirm()
   ================================================================

   Substitui prompt() e confirm() nativos do navegador por modais
   customizados que nao bloqueiam a thread principal.

   Retorna Promises — use com await.

   ================================================================ */

// ----------------------------------------------------------------
// SHARED HELPERS
// ----------------------------------------------------------------

let _activeDialog: HTMLElement | null = null;

/** Remove the active dialog and clean up */
function _destroyDialog(): void {
    if (_activeDialog) {
        _activeDialog.remove();
        _activeDialog = null;
    }
}

/**
 * Create the overlay + dialog container.
 * @param type
 * @returns The dialog container
 */
function _createShell(type: 'confirm' | 'prompt'): HTMLElement {
    _destroyDialog();

    const overlay = document.createElement('div');
    overlay.className = 'async-dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = `
        <div class="async-dialog async-dialog--${type}">
            <div class="async-dialog-body"></div>
            <div class="async-dialog-actions"></div>
        </div>
    `;

    document.body.appendChild(overlay);
    _activeDialog = overlay;
    return overlay;
}

// ----------------------------------------------------------------
// asyncConfirm
// ----------------------------------------------------------------

/**
 * Non-blocking replacement for window.confirm().
 * Mostra um modal de confirmacao com botoes Cancelar e Confirmar.
 *
 * @param message - Mensagem de confirmacao
 * @param options
 * @returns true se confirmado, false se cancelado
 */
export function asyncConfirm(
    message: string,
    options: { confirmLabel?: string; cancelLabel?: string; danger?: boolean } = {},
): Promise<boolean> {
    const { confirmLabel = 'OK', cancelLabel = 'Cancelar', danger = false } = options;

    return new Promise((resolve) => {
        const overlay = _createShell('confirm');
        const body = overlay.querySelector('.async-dialog-body') as HTMLElement;
        const actions = overlay.querySelector('.async-dialog-actions') as HTMLElement;

        body.innerHTML = `<p class="async-dialog-message">${_escapeHtml(message)}</p>`;

        actions.innerHTML = `
            <button type="button" class="async-dialog-btn async-dialog-btn--cancel">${_escapeHtml(cancelLabel)}</button>
            <button type="button" class="async-dialog-btn async-dialog-btn--confirm ${danger ? 'async-dialog-btn--danger' : ''}">${_escapeHtml(confirmLabel)}</button>
        `;

        const cancelBtn = actions.querySelector('.async-dialog-btn--cancel') as HTMLButtonElement;
        const confirmBtn = actions.querySelector('.async-dialog-btn--confirm') as HTMLButtonElement;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                done(false);
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                done(true);
            }
        };

        const done = (result: boolean) => {
            document.removeEventListener('keydown', onKey);
            _destroyDialog();
            resolve(result);
        };

        cancelBtn.addEventListener('click', () => done(false));
        confirmBtn.addEventListener('click', () => done(true));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) done(false);
        });

        document.addEventListener('keydown', onKey);

        confirmBtn.focus();
    });
}

// ----------------------------------------------------------------
// asyncPrompt
// ----------------------------------------------------------------

/**
 * Non-blocking replacement for window.prompt().
 * Mostra um modal com campo de texto para entrada do usuario.
 *
 * @param message - Mensagem/label para o campo
 * @param defaultValue - Valor padrao do campo
 * @param options
 * @returns Valor digitado ou null se cancelado
 */
export function asyncPrompt(
    message: string,
    defaultValue: string = '',
    options: { confirmLabel?: string; cancelLabel?: string; placeholder?: string } = {},
): Promise<string | null> {
    const { confirmLabel = 'OK', cancelLabel = 'Cancelar', placeholder = '' } = options;

    return new Promise((resolve) => {
        const overlay = _createShell('prompt');
        const body = overlay.querySelector('.async-dialog-body') as HTMLElement;
        const actions = overlay.querySelector('.async-dialog-actions') as HTMLElement;

        body.innerHTML = `
            <p class="async-dialog-message">${_escapeHtml(message)}</p>
            <input type="text" class="async-dialog-input" value="${_escapeAttr(defaultValue)}" placeholder="${_escapeAttr(placeholder)}">
        `;

        actions.innerHTML = `
            <button type="button" class="async-dialog-btn async-dialog-btn--cancel">${_escapeHtml(cancelLabel)}</button>
            <button type="button" class="async-dialog-btn async-dialog-btn--confirm">${_escapeHtml(confirmLabel)}</button>
        `;

        const input = body.querySelector('.async-dialog-input') as HTMLInputElement;
        const cancelBtn = actions.querySelector('.async-dialog-btn--cancel') as HTMLButtonElement;
        const confirmBtn = actions.querySelector('.async-dialog-btn--confirm') as HTMLButtonElement;

        const done = (result: string | null) => {
            _destroyDialog();
            resolve(result);
        };

        cancelBtn.addEventListener('click', () => done(null));
        confirmBtn.addEventListener('click', () => done(input.value));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) done(null);
        });

        input.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                done(input.value);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                done(null);
            }
        });

        input.focus();
        input.select();
    });
}

// ----------------------------------------------------------------
// ESCAPING
// ----------------------------------------------------------------

function _escapeHtml(str: unknown): string {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function _escapeAttr(str: unknown): string {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
