// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * COMMERCIAL-READINESS T9.2b (claude-omni, 2026-07-16) — tela "e agora?"
 * pós-compra de biblioteca.
 *
 * Renderiza o view-model puro de `_postPurchasePure.ts` no mesmo padrão
 * .ecbt-overlay/.ecbt-dialog--sm + attachModalA11y de ipNoticeModal.ts /
 * balanceProtectionModal.ts. Chamada pelo CR-053 (_libraryAutoInstall.ts)
 * depois do auto-install disparado por 'libraryPurchased' /
 * 'ecbtPurchaseCompleted'.
 *
 * Próximos passos concretos oferecidos:
 *   - sucesso → "Abrir biblioteca" (Library Hub, onde a biblioteca instalada
 *     aparece ativa) + suporte como caminho discreto;
 *   - falha   → "Tentar instalar de novo" (retry via callback do caller) +
 *     "Falar com o suporte" (reportBugModal com prefill do contexto).
 */
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';
import {
    buildPostPurchaseModel,
    type PostPurchaseAction,
    type PostPurchaseInput,
    type PostPurchaseModel,
} from './_postPurchasePure.js';

export interface PostPurchaseCallbacks {
    /** Re-executa o auto-install (falha). Fornecido por _libraryAutoInstall.ts. */
    onRetry?: () => void | Promise<void>;
    /** Override opcional do "abrir biblioteca" (default: Library Hub). */
    onOpenLibrary?: () => void | Promise<void>;
}

let _a11yCleanup: (() => void) | null = null;

function _getOrCreateOverlay(): HTMLElement {
    const existing = document.getElementById('post-purchase-overlay') as HTMLElement | null;
    if (existing) return existing;
    const overlay = document.createElement('div');
    overlay.id = 'post-purchase-overlay';
    overlay.className = 'ecbt-overlay';
    overlay.style.cssText = 'display:none;z-index:9200;';
    const modal = document.createElement('div');
    modal.id = 'post-purchase-modal';
    modal.className = 'ecbt-dialog ecbt-dialog--sm';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e: MouseEvent) => {
        if (e.target === overlay) closePostPurchaseModal();
    });
    document.body.appendChild(overlay);
    return overlay;
}

function _actionButtonHtml(action: PostPurchaseAction): string {
    const label = t(action.labelKey) || action.labelFallback;
    const cls =
        action.kind === 'primary'
            ? 'ecbt-btn ecbt-btn--primary'
            : action.kind === 'secondary'
              ? 'ecbt-btn ecbt-btn--outline'
              : 'ecbt-btn ecbt-btn--cancel';
    return `<button type="button" class="${cls} post-purchase-action" data-action="${escapeHtml(action.id)}">${escapeHtml(label)}</button>`;
}

async function _openLibraryHub(): Promise<void> {
    try {
        const mod = await import('./libraryHubModal.js' as string);
        mod.openLibraryHubModal();
    } catch (err: any) {
        console.debug('[postPurchase] openLibraryHub:', err?.message || err);
        // Fallback: gerenciador de bibliotecas clássico, se registrado.
        const w = window as any;
        if (typeof w.handleOpenLibraryManager === 'function') w.handleOpenLibraryManager();
    }
}

async function _openSupport(model: PostPurchaseModel): Promise<void> {
    try {
        const mod = await import('./reportBugModal.js' as string);
        await mod.openReportBugModal({ prefill: model.supportPrefill });
    } catch (err: any) {
        console.debug('[postPurchase] openSupport:', err?.message || err);
        (window as any).showToast?.(
            t('postPurchase.support') || 'Falar com o suporte',
            'warning',
        );
    }
}

function _render(modal: HTMLElement, model: PostPurchaseModel, callbacks: PostPurchaseCallbacks): void {
    const title = t(model.titleKey) || model.titleFallback;
    const body = t(model.bodyKey, model.bodyVars) || model.bodyFallback;
    modal.innerHTML = `
        <div class="ecbt-header">
            <h3 class="ecbt-title">${escapeHtml(title)}</h3>
            <button class="ecbt-close post-purchase-close" aria-label="${escapeHtml(t('close') || 'Fechar')}">&times;</button>
        </div>
        <div class="post-purchase-body" aria-live="${model.ariaLive}" style="padding:4px 2px 0;">
            <p>${escapeHtml(body)}</p>
        </div>
        <div class="post-purchase-footer" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:14px;">
            ${model.actions
                .slice()
                .reverse()
                .map(_actionButtonHtml)
                .join('')}
        </div>
    `;

    modal.querySelector('.post-purchase-close')?.addEventListener('click', closePostPurchaseModal);
    modal.querySelectorAll('.post-purchase-action').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const actionId = (btn as HTMLElement).dataset.action;
            closePostPurchaseModal();
            try {
                if (actionId === 'open-library') {
                    if (callbacks.onOpenLibrary) await callbacks.onOpenLibrary();
                    else await _openLibraryHub();
                } else if (actionId === 'retry-install') {
                    await callbacks.onRetry?.();
                } else if (actionId === 'contact-support') {
                    await _openSupport(model);
                }
                // 'dismiss' → só fecha.
            } catch (err: any) {
                console.debug('[postPurchase] action:', actionId, err?.message || err);
            }
        });
    });
}

/**
 * Abre a tela "e agora?" pós-compra. `input.status === 'installed'` mostra a
 * confirmação + abrir biblioteca; qualquer outro status mostra retry + suporte.
 */
export function openPostPurchaseModal(
    input: PostPurchaseInput,
    callbacks: PostPurchaseCallbacks = {},
): void {
    const model = buildPostPurchaseModel(input, {
        genericName: t('postPurchase.genericLibrary') || undefined,
        genericError: t('postPurchase.unknownError') || undefined,
    });
    const overlay = _getOrCreateOverlay();
    const modal = overlay.querySelector('#post-purchase-modal') as HTMLElement | null;
    if (modal) _render(modal, model, callbacks);
    overlay.style.display = 'flex';
    _a11yCleanup = attachModalA11y(overlay, closePostPurchaseModal);
}

export function closePostPurchaseModal(): void {
    const overlay = document.getElementById('post-purchase-overlay') as HTMLElement | null;
    if (overlay) overlay.style.display = 'none';
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}
