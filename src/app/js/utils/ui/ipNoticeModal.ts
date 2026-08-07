// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * MKT-OWNER-VERIFY-001 RF-6 (claude-omni, 2026-07-14) — modal "como funciona"
 * do aviso de proveniência no card de produto pago do marketplace.
 *
 * Texto-base D1 (Calvin 2026-07-08, "mesmo texto-base" do consent RF-2).
 * Mesmo padrão .ecbt-overlay/.ecbt-dialog--sm + attachModalA11y de
 * balanceProtectionModal.ts — sem estado global além do overlay singleton.
 */
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';

let _a11yCleanup: (() => void) | null = null;

function _getOrCreateOverlay(): HTMLElement {
    const existing = document.getElementById('ip-notice-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'ip-notice-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = 'ip-notice-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--sm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeIpNoticeModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

/**
 * Abre o modal "como funciona" da proteção de proveniência (link no card
 * do produto pago). Sem parâmetros — texto fixo D1, sem estado por item.
 */
export function openIpNoticeModal(): void {
    const overlay = _getOrCreateOverlay();
    const modal = overlay.querySelector('#ip-notice-modal') as HTMLElement;
    const title = t('mkt.ipNotice.card') || 'Protegido por cadeia criptográfica assinada';
    const body = t('mkt.ipNotice.how') || t('mkt.ipNotice.consent') || '';
    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(title)}</h3>
            <button class="ecbt-close ip-notice-close" aria-label="Close">&times;</button>
        </div>
        <div class="ip-notice-body">
            <p>${escapeHtml(body)}</p>
            <button type="button" class="ip-notice-verify-link">${escapeHtml(t('owner.publicVerify.link') || 'Verificar uma chave publicamente')}</button>
        </div>
        <div class="ip-notice-footer">
            <button type="button" class="ip-notice-ok">${escapeHtml(t('close') || 'Fechar')}</button>
        </div>
    `;
    modal.querySelectorAll('.ip-notice-close, .ip-notice-ok').forEach((btn) => {
        btn.addEventListener('click', closeIpNoticeModal);
    });
    // RF-7 — atalho para o verificador público anônimo (D2 Calvin 2026-07-08).
    modal.querySelector('.ip-notice-verify-link')?.addEventListener('click', async () => {
        closeIpNoticeModal();
        const mod = await import('./licenseVerifyPublicModal.js' as string);
        mod.openLicenseVerifyPublicModal();
    });
    overlay.style.display = 'flex';
    _a11yCleanup = attachModalA11y(overlay, closeIpNoticeModal);
}

export function closeIpNoticeModal(): void {
    const overlay = document.getElementById('ip-notice-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}
