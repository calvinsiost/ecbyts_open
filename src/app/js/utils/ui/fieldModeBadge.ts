// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   FIELD MODE BADGE — Statusbar indicator for Offline Field Mode
   Indicador do statusbar para o Modo Campo Offline.

   Atualiza #status-field-mode com rotulo + pendencia + tom.
   Spec: docs/specs/features/SPEC_OFFLINE_FIELD_MODE.md
   ================================================================ */
import { t } from '../i18n/translations.js';
import {
    initOfflineFieldMode,
    subscribe,
    getOfflineState,
    computeBadgeState,
    FIELD_MODE_KEY,
} from '../storage/offlineFieldMode.js';
import { registerPreserveKey } from '../startup/versionGate.js';
const BADGE_ID = 'status-field-mode';
/**
 * Reads the pending PhotoLog count (best-effort, never throws).
 * / Le a contagem de fotos pendentes do PhotoLog (best-effort).
 * @returns {number}
 */
function _pendingCount() {
    try {
        const stats = window.handleGetPhotoStats?.();
        if (!stats) return 0;
        return (stats.local || 0) + (stats.failed || 0);
    } catch (e: any) {
        console.debug('[fieldModeBadge:pending]', e?.message || e);
        return 0;
    }
}
/**
 * Renders the badge from current state.
 * / Renderiza o badge a partir do estado atual.
 */
export function renderFieldModeBadge() {
    const el = document.getElementById(BADGE_ID);
    if (!el) return;
    const { offline, forced } = getOfflineState();
    const pending = _pendingCount();
    const badge = computeBadgeState({ offline, forced, pending });
    const label = t(badge.key) || badge.key;
    const suffix = badge.pending > 0 ? ` · ${badge.pending}` : '';
    el.textContent = label + suffix;
    el.dataset.tone = badge.tone;
    el.setAttribute('aria-label', label + suffix);
    el.title = label + suffix;
}
/**
 * Initializes the badge: starts Offline Field Mode and subscribes to changes.
 * Idempotente — seguro chamar uma vez no boot.
 * / Inicializa o badge: ativa o Modo Campo e assina mudancas.
 */
export function initFieldModeBadge() {
    registerPreserveKey(FIELD_MODE_KEY, {
        reason: 'user preference: forced Offline Field Mode',
        owner: 'utils/storage/offlineFieldMode.js',
    });
    initOfflineFieldMode({ onReconnect: renderFieldModeBadge });
    subscribe(renderFieldModeBadge);
    renderFieldModeBadge();
}
