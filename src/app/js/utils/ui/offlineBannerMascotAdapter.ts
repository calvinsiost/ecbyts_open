// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// OFFLINE BANNER MASCOT ADAPTER (Fase 2 SPEC_OFFLINE_BANNER_TO_MASCOT_BUBBLE).
// Adapter pattern: conecta buildOfflineBannerState (pure UNCHANGED) ao
// mascot bubble (DOM) em vez do banner top-fixed legado.
//
// Substitui mountOfflineBanner. buildOfflineBannerState continua autoridade
// canônica do view-model — apenas o RENDERER muda.

import {
    MASCOT_STATES,
    setMascotState,
    resetMascot,
    showMascotBubble,
    hideMascotBubble,
} from './mascotManager.js';
import {
    buildOfflineBannerState,
    planOfflineBannerAction,
    OFFLINE_BANNER_ACTIONS,
} from './offlineBanner.js';
import { t } from '../i18n/translations.js';
import type { MascotBubbleSeverity, MascotBubbleAction } from './mascotManager.js';

// ----------------------------------------------------------------
// PURE MAPPING
// ----------------------------------------------------------------

/**
 * Pure-logic: dado o severity do banner state, retorna o estado emocional
 * apropriado do mascote. Mapping documentado em SPEC §5.2.
 */
export function offlineSeverityToMascotState(severity: string): string {
    switch (severity) {
        case 'error':
        case 'offline':
            return MASCOT_STATES.ERROR;
        case 'warning':
        case 'info':
            return MASCOT_STATES.THINKING;
        default:
            return MASCOT_STATES.IDLE;
    }
}

/**
 * Pure-logic: severity do banner → severity do bubble. Trivial passthrough
 * (mesmo nome, mas mantém isolamento para futura divergência).
 */
export function offlineSeverityToBubbleSeverity(severity: string): MascotBubbleSeverity {
    if (severity === 'error') return 'error';
    if (severity === 'offline') return 'offline';
    if (severity === 'warning') return 'warning';
    if (severity === 'info') return 'info';
    return 'ok';
}

/**
 * Pure-logic: marca qual action deve ser PRIMARY no balão (auto-foco).
 * Mantém o flag `primary` do state.actions (PatternFly: 1 primary,
 * resto secondary). Falls back para "primeira ação habilitada"
 * se nenhuma action tem `primary: true`.
 */
export function pickPrimaryActionIndex(actions: any[]): number {
    if (!Array.isArray(actions) || actions.length === 0) return -1;
    const idx = actions.findIndex((a) => a?.primary === true && a?.enabled !== false);
    if (idx >= 0) return idx;
    return actions.findIndex((a) => a?.enabled !== false);
}

/**
 * Pure-logic: dado state do banner, retorna a chave i18n apropriada.
 * Permite testar mapping sem chamar t() (sem mockar i18n).
 * Reference: SPEC §5.3 + Fase 4 (i18n).
 */
export function offlineStateToI18nKey(state: any): string {
    const friendlyState = state?.friendlyState;
    switch (friendlyState) {
        case 'unstable':
            return state.pendingCount === 0 && (state as any).failedCount === 0 && (state as any).heartbeatFailures > 0
                ? 'OFFLINE_MASCOT_MSG_UNSTABLE_HEARTBEAT'
                : 'OFFLINE_MASCOT_MSG_UNSTABLE_GENERIC';
        case 'sync_failed':
            return 'OFFLINE_MASCOT_MSG_FAILED';
        case 'offline':
            return state.pendingCount > 0
                ? 'OFFLINE_MASCOT_MSG_OFFLINE_PENDING'
                : 'OFFLINE_MASCOT_MSG_OFFLINE_IDLE';
        case 'syncing':
            return 'OFFLINE_MASCOT_MSG_SYNCING';
        case 'pending_sync':
        default:
            return 'OFFLINE_MASCOT_MSG_PENDING';
    }
}

/**
 * Pure-logic: extrai o número-template ({{n}}) do state, conforme a categoria.
 * Retorna 0 quando não aplicável.
 */
export function offlineStateToI18nCount(state: any): number {
    if (!state) return 0;
    switch (state.friendlyState) {
        case 'unstable':
            return (state as any).heartbeatFailures || 0;
        case 'sync_failed':
            return state.failedCount || 0;
        case 'offline':
            return state.pendingCount || 0;
        case 'syncing':
            return state.syncingCount || 0;
        case 'pending_sync':
        default:
            return state.pendingCount || 0;
    }
}

/**
 * Pure-logic: mapeia OFFLINE_BANNER_ACTIONS → chave i18n do label.
 */
export function actionIdToI18nKey(actionId: string): string {
    if (actionId === OFFLINE_BANNER_ACTIONS.RETRY_SYNC) return 'OFFLINE_MASCOT_ACTION_RETRY';
    if (actionId === OFFLINE_BANNER_ACTIONS.VIEW_QUEUE) return 'OFFLINE_MASCOT_ACTION_QUEUE';
    if (actionId === OFFLINE_BANNER_ACTIONS.DISMISS) return 'OFFLINE_MASCOT_ACTION_DISMISS';
    return actionId;
}

// ----------------------------------------------------------------
// FEATURE FLAG
// ----------------------------------------------------------------

const FEATURE_FLAG_KEY = 'ecbyts-mascot-offline-bubble';

/**
 * Lê feature flag. Default ON (true). Calvin pode kill-switch via:
 *   localStorage.setItem('ecbyts-mascot-offline-bubble', '0')
 */
export function isMascotBubbleAdapterEnabled(): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
        const v = localStorage.getItem(FEATURE_FLAG_KEY);
        return v !== '0' && v !== 'false';
    } catch {
        return true;
    }
}

// ----------------------------------------------------------------
// ADAPTER (DOM-bound)
// ----------------------------------------------------------------

export interface SyncMascotInput {
    isOnline?: boolean;
    mode?: string;
    pendingCount?: number;
    failedCount?: number;
    syncingCount?: number;
    heartbeatFailures?: number;
    userDismissed?: boolean;
}

export interface SyncMascotResult {
    state: ReturnType<typeof buildOfflineBannerState>;
    visible: boolean;
    skippedByFlag: boolean;
}

/**
 * Sincroniza o mascote + balão com o estado de sync/conexão.
 * Substitui mountOfflineBanner. Pure state builder permanece intocado.
 *
 * Idempotente: chamável a cada heartbeat tick.
 *
 * Quando flag desabilitada, retorna { skippedByFlag: true } sem efeito
 * colateral — caller deve fallback para mountOfflineBanner legado.
 */
export function syncMascotWithOfflineState(
    input: SyncMascotInput,
    onAction?: (command: any, state: any) => void,
): SyncMascotResult {
    if (!isMascotBubbleAdapterEnabled()) {
        return {
            state: buildOfflineBannerState(input),
            visible: false,
            skippedByFlag: true,
        };
    }

    const state = buildOfflineBannerState(input);

    if (!state.visible) {
        hideMascotBubble();
        resetMascot();
        return { state, visible: false, skippedByFlag: false };
    }

    setMascotState(offlineSeverityToMascotState(state.severity));

    // SPEC §5.3 / Fase 4 — i18n message via state.friendlyState mapping.
    // Banner state.message (PT-BR hardcoded) cai como fallback se key faltar.
    const i18nKey = offlineStateToI18nKey(state);
    const i18nCount = offlineStateToI18nCount(state);
    const i18nMessage = t(i18nKey, { n: i18nCount });
    // Fallback: se a chave não existe na locale ativa nem em en-US, t() retorna a
    // própria chave; nesse caso preferimos state.message original (PT-BR hardcoded).
    const message = i18nMessage === i18nKey ? state.message : i18nMessage;

    const bubbleActions: MascotBubbleAction[] = (state.actions || []).map((a: any) => {
        const labelKey = actionIdToI18nKey(a.id);
        const i18nLabel = t(labelKey);
        const label = i18nLabel === labelKey ? a.label : i18nLabel;
        return {
            id: a.id,
            label,
            enabled: a.enabled !== false,
            primary: a.primary === true,
            onClick: () => {
                try {
                    const cmd = planOfflineBannerAction(state, a.id);
                    onAction?.(cmd, state);
                } catch (e: any) {
                    console.debug('[offlineBannerMascotAdapter:action]', e?.message || e);
                }
                if (a.id === OFFLINE_BANNER_ACTIONS.DISMISS) hideMascotBubble();
            },
        };
    });

    showMascotBubble({
        message,
        severity: offlineSeverityToBubbleSeverity(state.severity),
        actions: bubbleActions,
        ariaLabel: 'Connection status',
    });

    return { state, visible: true, skippedByFlag: false };
}
