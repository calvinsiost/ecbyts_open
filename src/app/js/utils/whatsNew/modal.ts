// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   WHAT'S NEW — Modal de novidades por versao
   Exibe lista de versoes com bullet points de mudancas.
   ================================================================ */

import { createLogger } from '../helpers/logger.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { getWhatsNewEntries, markSeen } from './manager.js';

const log = createLogger('WhatsNewModal');

let _modalEl: any = null;
let _overlayEl: any = null;

/**
 * Opens the What's New modal showing version history.
 * Abre modal com lista de novidades por versao.
 */
export function openWhatsNewModal(): void {
    if (_modalEl) {
        _modalEl.remove();
        _overlayEl?.remove();
    }

    const entries = getWhatsNewEntries();

    // B2 migração 2026-05-29: .modal-backdrop + .modal → .ecbt-overlay + .ecbt-dialog--md
    // canônicos (.ecbt-overlay já centra via flex; .ecbt-dialog cuida do estilo via tokens).
    // Drena #3: width:520px;max-width:90vw + 5 propriedades inline → clamp + tokens.
    _overlayEl = document.createElement('div');
    _overlayEl.className = 'ecbt-overlay';
    _overlayEl.addEventListener('click', (e: any) => {
        if (e.target === _overlayEl) closeWhatsNewModal();
    });
    _modalEl = document.createElement('div');
    _modalEl.className = 'ecbt-dialog ecbt-dialog--md whats-new-dialog';
    _modalEl.setAttribute('role', 'dialog');
    _modalEl.setAttribute('aria-modal', 'true');
    _modalEl.setAttribute('aria-label', t('whatsNew.title') || "What's New");

    const title = escapeHtml(t('whatsNew.title') || "What's New");
    const closeLabel = escapeHtml(t('close') || 'Close');

    let bodyHtml: string;
    if (entries.length === 0) {
        const emptyMsg = escapeHtml(t('whatsNew.empty') || 'No updates yet.');
        bodyHtml = `<p style="opacity:0.7;">${emptyMsg}</p>`;
    } else {
        bodyHtml = entries
            .map((entry: any) => {
                const ver = escapeHtml(entry.version);
                const ttl = escapeHtml(entry.title);
                const items = entry.items
                    .map((item: any) => `<li style="margin:4px 0;">${escapeHtml(item)}</li>`)
                    .join('');
                return `
                <div style="margin-bottom:16px;">
                    <h3 style="margin:0 0 4px;font-size:15px;">
                        <span style="opacity:0.6;">v${ver}</span> &#8212; ${ttl}
                    </h3>
                    <ul style="margin:0;padding-left:20px;font-size:13px;">${items}</ul>
                </div>`;
            })
            .join('');
    }

    _modalEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
            <h2 style="margin:0;font-size:18px;">${title}</h2>
            <button id="whats-new-close-btn" style="background:none;border:none;color:inherit;cursor:pointer;font-size:18px;padding:4px;" aria-label="${closeLabel}">&#10005;</button>
        </div>
        <div id="whats-new-body">${bodyHtml}</div>
    `;

    _overlayEl.appendChild(_modalEl);
    document.body.appendChild(_overlayEl);

    _modalEl.querySelector('#whats-new-close-btn')?.addEventListener('click', closeWhatsNewModal);

    // Keyboard: Escape to close
    _modalEl._keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeWhatsNewModal();
    };
    document.addEventListener('keydown', _modalEl._keyHandler);

    log.debug("What's New modal opened with", entries.length, 'entries');
}

/**
 * Closes the What's New modal and marks all entries as seen.
 * Fecha o modal e marca todas as versoes como vistas.
 */
export async function closeWhatsNewModal(): Promise<void> {
    // Mark all entries as seen
    const entries = getWhatsNewEntries();
    for (const entry of entries) {
        await markSeen(entry.version);
    }

    if (_modalEl?._keyHandler) {
        document.removeEventListener('keydown', _modalEl._keyHandler);
    }
    _modalEl?.remove();
    _overlayEl?.remove();
    _modalEl = null;
    _overlayEl = null;

    log.debug("What's New modal closed");
}
