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

/**
 * offlineBanner.js - pure offline banner contract.
 *
 * UI adapters render this view model. Keeping the state builder pure makes the
 * offline UX testable without browser globals and keeps queue/heartbeat logic
 * independent from DOM details.
 */

import { escapeAttr, escapeHtml } from '../helpers/html.js';

export const OFFLINE_BANNER_ACTIONS = Object.freeze({
    RETRY_SYNC: 'retry_sync',
    VIEW_QUEUE: 'view_queue',
    DISMISS: 'dismiss',
});

const BANNER_ID = 'ecbyts-offline-banner';
const STYLE_ID = 'ecbyts-offline-banner-styles';

function nonNegativeInteger(value: any, fallback = 0): any {
    if (value == null) return fallback;
    if (!Number.isInteger(value) || value < 0) {
        throw new Error('counts must be non-negative integers');
    }
    return value;
}

function pluralize(count: any, one: any, many: any): any {
    return count === 1 ? one : many;
}

function freezeActions(actions: any): any {
    return Object.freeze(actions.map((a: any) => Object.freeze({ ...a })));
}

function freezeState(state: any): any {
    return Object.freeze({
        kind: 'offline-banner',
        visible: state.visible,
        friendlyState: state.friendlyState,
        severity: state.severity,
        message: state.message,
        pendingCount: state.pendingCount,
        failedCount: state.failedCount,
        syncingCount: state.syncingCount,
        actions: freezeActions(state.actions),
        aria: Object.freeze({ role: 'status', live: 'polite' }),
    });
}

/**
 * Build the banner view model for offline, unstable, pending, and failed states.
 *
 * @param input
 */
export function buildOfflineBannerState(
    input: {
        isOnline?: boolean;
        mode?: string;
        pendingCount?: number;
        failedCount?: number;
        syncingCount?: number;
        heartbeatFailures?: number;
        userDismissed?: boolean;
    } = {},
): any {
    const pendingCount = nonNegativeInteger(input.pendingCount);
    const failedCount = nonNegativeInteger(input.failedCount);
    const syncingCount = nonNegativeInteger(input.syncingCount);
    const heartbeatFailures = nonNegativeInteger(input.heartbeatFailures);
    const isOnline = input.isOnline !== false;
    const mode = input.mode || (isOnline ? 'online' : 'offline');
    const hasQueueWork = pendingCount + failedCount + syncingCount > 0;
    const visible = input.userDismissed === true ? false : mode !== 'online' || hasQueueWork;

    if (!visible) {
        return freezeState({
            visible: false,
            friendlyState: 'clean',
            severity: 'ok',
            message: '',
            pendingCount,
            failedCount,
            syncingCount,
            actions: [],
        });
    }

    let friendlyState = 'pending_sync';
    let severity = 'warning';
    let message: string;

    if (failedCount > 0) {
        friendlyState = 'sync_failed';
        severity = 'error';
        message = `Falha ao sincronizar - ${failedCount} ${pluralize(failedCount, 'mudanca falhou', 'mudancas falharam')}`;
    } else if (mode === 'offline') {
        friendlyState = 'offline';
        severity = 'offline';
        message =
            pendingCount > 0
                ? `Modo offline - ${pendingCount} ${pluralize(pendingCount, 'mudanca pendente', 'mudancas pendentes')}`
                : 'Modo offline - alteracoes serao salvas localmente';
    } else if (mode === 'unstable') {
        friendlyState = 'unstable';
        severity = 'warning';
        message =
            heartbeatFailures > 0
                ? `Conexao instavel - ${heartbeatFailures} falha(s) de verificacao`
                : 'Conexao instavel - modo offline pode ser ativado';
    } else if (syncingCount > 0) {
        friendlyState = 'syncing';
        severity = 'info';
        message = `Sincronizando - ${syncingCount} ${pluralize(syncingCount, 'mudanca', 'mudancas')}`;
    } else {
        message = `${pendingCount} ${pluralize(pendingCount, 'mudanca pendente', 'mudancas pendentes')}`;
    }

    const actions = [
        {
            id: OFFLINE_BANNER_ACTIONS.RETRY_SYNC,
            label: 'Tentar sincronizar agora',
            enabled: pendingCount > 0 || failedCount > 0 || mode !== 'online',
            primary: true,
        },
        {
            id: OFFLINE_BANNER_ACTIONS.VIEW_QUEUE,
            label: 'Ver fila',
            enabled: hasQueueWork,
            primary: false,
        },
        {
            id: OFFLINE_BANNER_ACTIONS.DISMISS,
            label: 'Fechar',
            enabled: true,
            primary: false,
        },
    ];

    return freezeState({
        visible,
        friendlyState,
        severity,
        message,
        pendingCount,
        failedCount,
        syncingCount,
        actions,
    });
}

/**
 * Translate a banner button into an integration command.
 */
export function planOfflineBannerAction(state: any, actionId: any): any {
    const action = state.actions.find((a: any) => a.id === actionId);
    if (!action) throw new Error(`Unknown offline banner action: ${actionId}`);
    if (!action.enabled) throw new Error(`Offline banner action disabled: ${actionId}`);

    if (actionId === OFFLINE_BANNER_ACTIONS.RETRY_SYNC) {
        return Object.freeze({ type: 'retry_sync_queue', source: 'offline-banner' });
    }
    if (actionId === OFFLINE_BANNER_ACTIONS.VIEW_QUEUE) {
        return Object.freeze({ type: 'open_sync_queue', source: 'offline-banner' });
    }
    return Object.freeze({ type: 'dismiss_offline_banner', source: 'offline-banner' });
}

function ensureOfflineBannerStyles(documentRef: any): void {
    if (!documentRef || documentRef.getElementById(STYLE_ID)) return;
    const style = documentRef.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
        .ecbyts-offline-banner {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            z-index: 3100;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            min-height: 42px;
            padding: 8px 14px;
            background: #92400e;
            color: #ffffff;
            box-shadow: 0 6px 18px rgba(15, 23, 42, 0.22);
            font-size: 13px;
            line-height: 1.35;
        }
        .ecbyts-offline-banner[data-severity="error"] {
            background: #991b1b;
        }
        .ecbyts-offline-banner[data-severity="info"] {
            background: #075985;
        }
        .ecbyts-offline-banner-message {
            min-width: 0;
            overflow-wrap: anywhere;
            font-weight: 600;
        }
        .ecbyts-offline-banner-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-end;
        }
        .ecbyts-offline-banner button {
            min-height: 28px;
            border: 1px solid rgba(255, 255, 255, 0.54);
            border-radius: 6px;
            padding: 4px 9px;
            background: rgba(255, 255, 255, 0.14);
            color: #ffffff;
            font: inherit;
            font-size: 12px;
            cursor: pointer;
        }
        .ecbyts-offline-banner button.primary {
            background: #ffffff;
            color: #78350f;
        }
        .ecbyts-offline-banner button:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
        @media (max-width: 620px) {
            .ecbyts-offline-banner {
                align-items: stretch;
                flex-direction: column;
                gap: 8px;
            }
            .ecbyts-offline-banner-actions {
                justify-content: stretch;
            }
            .ecbyts-offline-banner button {
                flex: 1 1 auto;
            }
        }
    `;
    documentRef.head.appendChild(style);
}

function removeExisting(documentRef: any): void {
    const existing = documentRef?.getElementById(BANNER_ID);
    if (existing) existing.remove();
}

function actionButtonHtml(action: any): string {
    return `<button type="button" class="${action.primary ? 'primary' : ''}" data-offline-action="${escapeAttr(
        action.id,
    )}" ${action.enabled ? '' : 'disabled'}>${escapeHtml(action.label)}</button>`;
}

/**
 * Mount or update the offline banner in the browser DOM.
 *
 * @param state
 * @param options
 */
export function mountOfflineBanner(
    state: ReturnType<typeof buildOfflineBannerState>,
    options: { documentRef?: Document; onAction?: Function } = {},
): any {
    const documentRef = options.documentRef || (typeof document !== 'undefined' ? document : null);
    if (!documentRef) return null;
    removeExisting(documentRef);
    if (!state?.visible) return null;

    ensureOfflineBannerStyles(documentRef);
    const banner = documentRef.createElement('div');
    banner.id = BANNER_ID;
    banner.className = 'ecbyts-offline-banner';
    banner.setAttribute('data-severity', state.severity);
    banner.setAttribute('role', state.aria.role);
    banner.setAttribute('aria-live', state.aria.live);
    banner.innerHTML = `
        <div class="ecbyts-offline-banner-message">${escapeHtml(state.message)}</div>
        <div class="ecbyts-offline-banner-actions">${state.actions.map(actionButtonHtml).join('')}</div>
    `;

    banner.querySelectorAll('[data-offline-action]').forEach((button: any) => {
        button.addEventListener('click', () => {
            const actionId = button.getAttribute('data-offline-action');
            let command;
            try {
                command = planOfflineBannerAction(state, actionId);
            } catch (error) {
                console.warn('[ecbyts:offline] action failed:', (error as Error)?.message || error);
                return;
            }
            Promise.resolve(options.onAction?.(command, state)).then((result) => {
                if (command.type === 'dismiss_offline_banner' && result !== false) {
                    banner.remove();
                }
            });
        });
    });

    documentRef.body.prepend(banner);
    return banner;
}

export default { OFFLINE_BANNER_ACTIONS, buildOfflineBannerState, planOfflineBannerAction, mountOfflineBanner };
