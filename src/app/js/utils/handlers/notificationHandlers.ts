// @ts-check
// Generated from src/app/js/utils/handlers/notificationHandlers.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   NOTIFICATION HANDLERS — window.* registrations for notification actions
   Registro de handlers globais para ações de notificação in-app.

   Acessa o store via window._notificationStore (definido por initNotificationBell)
   e persiste no IDB de forma fire-and-forget após cada mutação.
   ================================================================ */
import { updateBellBadge } from '../ui/notificationBell.js';
import { saveNotificationsToIDB } from '../../core/notifications/idbAdapter.js';
/**
 * Obtém o store de notificações do escopo global.
 * Retorna null silenciosamente se não estiver inicializado.
 * @returns {object|null}
 */
function getStore() {
    return /** @type {any} */ (window)._notificationStore ?? null;
}
/**
 * Obtém o elemento sino de notificações do DOM.
 * @returns {HTMLElement|null}
 */
function getBellEl() {
    return /** @type {any} */ (window)._notificationBellEl ?? null;
}
/**
 * Persiste o estado atual do store no IDB (fire-and-forget).
 * Erros são logados como warn - nunca lança.
 * @param {object} store
 */
function persistAsync(store: any) {
    const all = store.getAll();
    saveNotificationsToIDB(all).catch((e: any) => console.warn('[notif] persist failed:', e));
}
/**
 * Marca uma notificação específica como lida.
 * Atualiza o badge e persiste no IDB.
 *
 * @param {string} id - id da notificação
 */
function handleMarkNotificationRead(id: string) {
    const store = (getStore()) as any;
    if (!store) return;
    store.markRead(id);
    const bellEl = getBellEl();
    if (bellEl) updateBellBadge(store, bellEl);
    persistAsync(store);
}
/**
 * Marca todas as notificações como lidas.
 * Atualiza o badge e persiste no IDB.
 */
function handleMarkAllNotificationsRead() {
    const store = (getStore()) as any;
    if (!store) return;
    store.markAllRead();
    const bellEl = getBellEl();
    if (bellEl) updateBellBadge(store, bellEl);
    persistAsync(store);
}
/**
 * Remove uma notificação do store pelo id.
 * Atualiza o badge e persiste no IDB.
 *
 * @param {string} id - id da notificação a remover
 */
function handleDismissNotification(id: string) {
    const store = (getStore()) as any;
    if (!store) return;
    // notificationStore não expõe remove() na Fase 1 - usar markRead como fallback
    if (typeof store.remove === 'function') {
        store.remove(id);
    } else {
        store.markRead(id);
    }
    const bellEl = getBellEl();
    if (bellEl) updateBellBadge(store, bellEl);
    persistAsync(store);
}
/**
 * Limpa todas as notificações do store e do IDB.
 * Atualiza o badge.
 */
function handleClearAllNotifications() {
    const store = (getStore()) as any;
    if (!store) return;
    store.clear();
    const bellEl = getBellEl();
    if (bellEl) updateBellBadge(store, bellEl);
    persistAsync(store);
}
export const notificationHandlers = {
    handleMarkNotificationRead,
    handleMarkAllNotificationsRead,
    handleDismissNotification,
    handleClearAllNotifications,
};
