// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// MODAL FACTORY — canonical .ecbt-overlay + .ecbt-dialog--{xs..2xl}.
// Espelha design-tokens.css. AbortController nativo no close (PERF-MASTER S3.3).
// Z-index canônico via Z_INDEX.ASYNC_DIALOG.

import { t } from '../i18n/translations.js';
import { Z_INDEX } from './zIndex.js';

export type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface ModalOptions {
    size?: ModalSize;
    titleKey?: string;
    title?: string;
    body: HTMLElement | string; // HTMLElement preferido; string injeta como textContent (não-HTML, anti-XSS)
    footer?: HTMLElement;
    onClose?: () => void;
    closeOnEsc?: boolean;
    closeOnBackdropClick?: boolean;
    extraClass?: string; // ex: 'photolog-dialog'
}

export interface ModalHandle {
    overlay: HTMLDivElement;
    dialog: HTMLDivElement;
    close: () => void;
}

/**
 * Cria modal canônico + abre imediatamente. Retorna handle com close().
 * Behavior:
 *   - AbortController cleanup automatico em close (zero listener leak)
 *   - ESC key fecha (opcional)
 *   - backdrop click fecha (opcional)
 *   - z-index Z_INDEX.ASYNC_DIALOG
 *   - size via .ecbt-dialog--{size} (design-tokens.css clamp())
 */
export function createModal(opts: ModalOptions): ModalHandle {
    const size = opts.size || 'md';
    const overlay = document.createElement('div');
    overlay.className = 'ecbt-overlay';
    overlay.style.zIndex = String(Z_INDEX.ASYNC_DIALOG);

    const dialog = document.createElement('div');
    dialog.className = 'ecbt-dialog ecbt-dialog--' + size + (opts.extraClass ? ' ' + opts.extraClass : '');

    // Header
    const titleText = opts.title || (opts.titleKey ? (t(opts.titleKey) || opts.titleKey) : '');
    // Always render the header so the close button is present, regardless of title.
    {
        const header = document.createElement('div');
        header.className = 'ecbt-dialog-header';

        const titleEl = document.createElement('h2');
        titleEl.className = 'ecbt-dialog-title';
        titleEl.textContent = titleText;
        header.appendChild(titleEl);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'ecbt-dialog-close';
        closeBtn.setAttribute('aria-label', t('close') || 'Close');
        closeBtn.innerHTML = '&#10005;'; // CLAUDE.md: no emoji, use HTML entity
        header.appendChild(closeBtn);

        dialog.appendChild(header);
    }

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'ecbt-dialog-body';
    if (typeof opts.body === 'string') {
        bodyEl.textContent = opts.body; // anti-XSS: textContent, não innerHTML
    } else {
        bodyEl.appendChild(opts.body);
    }
    dialog.appendChild(bodyEl);

    // Footer (opcional)
    if (opts.footer) {
        const footerEl = document.createElement('div');
        footerEl.className = 'ecbt-dialog-footer';
        footerEl.appendChild(opts.footer);
        dialog.appendChild(footerEl);
    }

    overlay.appendChild(dialog);

    // Listener cleanup via AbortController (PERF-MASTER S3.3 pattern)
    const controller = new AbortController();
    const { signal } = controller;

    let closed = false;
    const close = () => {
        if (closed) return;
        closed = true;
        controller.abort();
        overlay.remove();
        opts.onClose?.();
    };

    // Close button
    const closeBtn = dialog.querySelector('.ecbt-dialog-close');
    closeBtn?.addEventListener('click', close, { signal });

    // ESC key
    if (opts.closeOnEsc !== false) {
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape') close();
            },
            { signal },
        );
    }

    // Backdrop click
    if (opts.closeOnBackdropClick !== false) {
        overlay.addEventListener(
            'click',
            (e) => {
                if (e.target === overlay) close();
            },
            { signal },
        );
    }

    document.body.appendChild(overlay);
    return { overlay, dialog, close };
}
