// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * MKT-OWNER-VERIFY-001 RF-7 (claude-omni, 2026-07-14) — formulário público e
 * anônimo "cole uma chave" (D2 Calvin 2026-07-08, "SIM"). SEM gate de login
 * nem de flag — verificação pública é intencionalmente aberta a qualquer
 * visitante (diferente do painel Minhas Obras, que exige sessão).
 *
 * Chama a edge function license-verify (sem JWT, rate-limited 30/min/IP) e
 * mostra o veredito SEM pseudônimo (mesmo cartão visual de ownerWorksPanel.ts,
 * mas sem o campo "licenciado a").
 */
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';

let _a11yCleanup: (() => void) | null = null;
let _controller: AbortController | null = null;

const VERDICT_CLASS: Record<string, string> = {
    authentic_licensed: 'ok',
    authentic_unlicensed: 'warn',
    tampered: 'bad',
    not_derived: 'neutral',
};

function _getOrCreateOverlay(): HTMLElement {
    const existing = document.getElementById('license-verify-public-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'license-verify-public-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = 'license-verify-public-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--sm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closeLicenseVerifyPublicModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

export function openLicenseVerifyPublicModal(): void {
    const overlay = _getOrCreateOverlay();
    const modal = overlay.querySelector('#license-verify-public-modal') as HTMLElement;
    _controller?.abort();
    _controller = new AbortController();
    const { signal } = _controller;

    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(t('owner.publicVerify.title') || 'Verificar uma cópia')}</h3>
            <button class="ecbt-close license-verify-public-close" aria-label="Close">&times;</button>
        </div>
        <div class="license-verify-public-body">
            <p class="license-verify-public-hint">${escapeHtml(
                t('owner.publicVerify.hint') ||
                    'Cole o manifest JSON de uma cópia para verificar se ela corresponde a uma obra paga registrada — sem identificar o comprador.',
            )}</p>
            <textarea id="license-verify-public-input" class="oworks-input" rows="4"
              aria-label="${escapeHtml(t('owner.works.pasteManifest') || 'Cole aqui o manifest JSON da cópia…')}"
              placeholder="${escapeHtml(t('owner.works.pasteManifest') || 'Cole aqui o manifest JSON da cópia…')}"></textarea>
            <button id="license-verify-public-submit" class="btn btn-primary">
              ${escapeHtml(t('owner.works.verify') || 'Verificar origem')}</button>
            <div id="license-verify-public-verdict" class="oworks-verdict" aria-live="polite"></div>
        </div>
    `;

    modal.querySelector('.license-verify-public-close')?.addEventListener('click', closeLicenseVerifyPublicModal, { signal });
    modal.querySelector('#license-verify-public-submit')?.addEventListener('click', () => void _submit(modal), { signal });

    overlay.style.display = 'flex';
    _a11yCleanup = attachModalA11y(overlay, closeLicenseVerifyPublicModal);
}

export function closeLicenseVerifyPublicModal(): void {
    const overlay = document.getElementById('license-verify-public-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    _controller?.abort();
    _controller = null;
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}

async function _submit(modal: HTMLElement): Promise<void> {
    const out = modal.querySelector('#license-verify-public-verdict');
    const raw = (modal.querySelector('#license-verify-public-input') as HTMLTextAreaElement)?.value?.trim();
    const submitBtn = modal.querySelector('#license-verify-public-submit') as HTMLButtonElement | null;
    if (!out) return;
    let manifest: unknown;
    try {
        manifest = JSON.parse(raw || '');
    } catch {
        _renderVerdict(out, 'neutral', t('owner.works.invalidInput') || 'Entrada inválida', t('owner.works.pasteValidJson') || 'Cole um manifest JSON válido.');
        return;
    }
    if (submitBtn) submitBtn.disabled = true;
    try {
        const client = (window as any).__ecbyts_supabase_client;
        if (!client) throw new Error('supabase client indisponível');
        const { data: v, error } = await client.functions.invoke('license-verify', { body: { manifest } });
        if (error) throw error;
        const titles: Record<string, string> = {
            authentic_licensed: t('owner.publicVerify.vLicensed') || 'Cópia licenciada',
            authentic_unlicensed: t('owner.works.vUnlicensed') || 'Autêntica, SEM licença ativa',
            tampered: t('owner.works.vTampered') || 'Adulterada',
            not_derived: t('owner.works.vNotDerived') || 'Não corresponde a nenhuma obra registrada',
        };
        _renderVerdict(out, v.kind || 'neutral', titles[v.kind] || v.kind || 'Erro', v.reason || '');
    } catch {
        _renderVerdict(out, 'neutral', t('owner.works.invalidInput') || 'Entrada inválida', t('owner.publicVerify.error') || 'Não foi possível verificar agora. Tente novamente.');
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

function _renderVerdict(el: Element, kind: string, title: string, reason: string): void {
    const cls = VERDICT_CLASS[kind] || 'neutral';
    el.innerHTML = `<div class="oworks-verdict-card ${cls}" data-verdict="${escapeHtml(kind)}">
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(reason)}</p>
      </div>`;
}

/** Registra handlers window.* (chamado no main.ts). */
export function registerLicenseVerifyPublicHandlers(): void {
    (window as any).openLicenseVerifyPublicModal = openLicenseVerifyPublicModal;
    (window as any).closeLicenseVerifyPublicModal = closeLicenseVerifyPublicModal;
}
