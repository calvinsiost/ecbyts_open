// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 1 F3.3 - reusable share button helper.
//
// Cada painel Tier-A integra via createDeepLinkShareButton({ toolId, getPayload }).
// O helper centraliza render DOM, clipboard, i18n fallback e telemetria.

import { generateToolsUrl } from './deepLinkGenerator.js';

export type ShareToastFn = (
    message: string,
    type?: 'success' | 'error' | 'warning' | 'info',
) => void;

export type ShareT = (key: string) => string;

export interface CreateDeepLinkShareButtonOptions {
    readonly toolId: string;
    readonly getPayload: () => unknown;
    readonly toast?: ShareToastFn;
    readonly t?: ShareT;
    readonly label?: string;
    readonly extraClass?: string;
}

function defaultToast(_msg: string, _type?: string): void {
    // no-op em ambiente sem DOM.
}

function defaultT(key: string): string {
    return key;
}

function resolveShareText(t: ShareT, key: string, fallback: string): string {
    const value = t(key);
    return value && value !== key ? value : fallback;
}

/**
 * Fallback REAL quando o clipboard falha (permissão negada, contexto
 * inseguro, API ausente): toast de erro claro + modal com o link num
 * campo selecionável (asyncPrompt pré-seleciona o valor) para o
 * usuário copiar manualmente. Nunca falha em silêncio.
 */
async function showShareLinkFallback(url: string, t: ShareT, toast: ShareToastFn): Promise<void> {
    toast(
        resolveShareText(t, 'share.action.copyFailed', 'Não foi possível copiar automaticamente — copie o link manualmente'),
        'error',
    );
    try {
        const mod = await import('../ui/asyncDialogs.js');
        await mod.asyncPrompt(
            resolveShareText(t, 'share.fallback.copyManual', 'Copie o link abaixo manualmente (Ctrl+C):'),
            url,
            {
                confirmLabel: resolveShareText(t, 'share.fallback.done', 'Fechar'),
                cancelLabel: resolveShareText(t, 'share.fallback.done', 'Fechar'),
            },
        );
    }
    catch (e) {
        // Último recurso (ambiente sem asyncDialogs): mostra o link no toast.
        toast(`${resolveShareText(t, 'share.action.showLink', 'Link:')} ${url}`, 'info');
        console.debug('[deepLink:shareButton] fallback modal failed', (e as Error)?.message || e);
    }
}

export function createDeepLinkShareButton(opts: CreateDeepLinkShareButtonOptions): HTMLButtonElement {
    const toast = opts.toast || defaultToast;
    const t = opts.t || defaultT;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ecbt-btn ecbt-btn--secondary${opts.extraClass ? ' ' + opts.extraClass : ''}`;
    btn.setAttribute('aria-label', resolveShareText(t, 'share.button.label', 'Compartilhar esta tela'));
    btn.title = resolveShareText(t, 'share.button.tooltip', 'Gerar link copiavel');
    btn.textContent = opts.label || resolveShareText(t, 'share.action.copy', 'Compartilhar esta tela');
    btn.dataset.toolId = opts.toolId;

    btn.addEventListener('click', async () => {
        let payload: unknown;
        try {
            payload = opts.getPayload();
        }
        catch (e) {
            toast(resolveShareText(t, 'share.error.generic', 'Erro ao gerar link'), 'error');
            console.debug('[deepLink:shareButton] getPayload failed', (e as Error)?.message || e);
            return;
        }

        const result = generateToolsUrl(opts.toolId, payload);
        if (!result.ok) {
            const keyByReason: Record<string, string> = {
                'unknown-tool-id': 'share.error.unknown',
                'payload-not-serializable': 'share.error.notSerializable',
                'payload-too-large': 'share.error.tooLong',
            };
            const i18nKey = keyByReason[result.reason] || 'share.error.generic';
            toast(resolveShareText(t, i18nKey, result.detail), 'error');
            return;
        }

        try {
            const nav = (globalThis as any).navigator;
            if (nav?.clipboard?.writeText) {
                await nav.clipboard.writeText(result.url);
                toast(resolveShareText(t, 'share.action.copied', 'Link copiado!'), 'success');
            }
            else {
                // API de clipboard ausente (contexto inseguro / browser antigo).
                await showShareLinkFallback(result.url, t, toast);
            }
        }
        catch (e) {
            // Permissão negada ou writeText rejeitado — nunca silêncio.
            console.debug('[deepLink:shareButton] clipboard failed', (e as Error)?.message || e);
            await showShareLinkFallback(result.url, t, toast);
        }

        try {
            const mod = (await import('../telemetry/tracker.js')) as Record<string, unknown>;
            const track = mod.trackEvent as
                | ((eventType: string, target: string, metadata?: Record<string, unknown>) => void)
                | undefined;
            if (typeof track === 'function') {
                track('deep_link_shared', opts.toolId, {
                    hasPayload: payload !== null && payload !== undefined,
                });
            }
        }
        catch (e) {
            console.debug('[deepLink:telemetry] shared track failed', (e as Error)?.message || e);
        }
    });

    return btn;
}
