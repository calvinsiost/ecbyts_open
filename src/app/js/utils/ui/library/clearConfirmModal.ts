// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
/* ================================================================
   CLEAR CONFIRM MODAL — SPEC_LIBRARY_VISUAL_INDICATORS_9_69

   Reuses the sym-overlay/sym-dialog shell from utils/ui/modals.js
   ================================================================ */
import { t } from '../../i18n/translations.js';
import { buildModalShell } from '../modals.js';
/**
 * Show a confirmation modal before clearing all visual markings.
 *
 * @param {object} opts
 * @param {number} [opts.affectedCount=0]
 * @param {() => void} opts.onConfirm - called when user clicks confirm
 */
export function showClearConfirmModal(opts: { affectedCount?: number; onConfirm: () => void }): void {
    const { affectedCount = 0, onConfirm } = opts;
    const { overlay, body, footer, close } =
        /** @type {{ overlay: HTMLElement, body: HTMLElement, footer: HTMLElement, close: () => void }} */ (
            buildModalShell({
                title: t('library.modal.clearTitle'),
                width: '420px',
            })
        );
    const message = document.createElement('p');
    message.className = 'clear-modal-message';
    message.textContent = t('library.modal.clearMessage');
    const hint = document.createElement('p');
    hint.className = 'clear-modal-hint';
    hint.textContent = t('library.modal.clearHint') || 'Your viewing history will be preserved internally.';
    const countLine = document.createElement('p');
    countLine.className = 'clear-modal-count';
    countLine.textContent =
        t('library.modal.clearCount', { count: affectedCount }) || `Affected items: ${affectedCount}`;
    body.appendChild(message);
    body.appendChild(hint);
    body.appendChild(countLine);
    const btnCancel = document.createElement('button');
    btnCancel.type = 'button';
    btnCancel.className = 'btn-sm';
    btnCancel.textContent = t('library.modal.clearCancel');
    btnCancel.addEventListener('click', close);
    const btnConfirm = document.createElement('button');
    btnConfirm.type = 'button';
    btnConfirm.className = 'btn-sm btn-danger';
    btnConfirm.textContent = t('library.modal.clearConfirm');
    btnConfirm.addEventListener('click', () => {
        close();
        if (typeof onConfirm === 'function') onConfirm();
    });
    footer.appendChild(btnCancel);
    footer.appendChild(btnConfirm);
    document.body.appendChild(overlay);
}
