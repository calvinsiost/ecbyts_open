// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   NOTIFICATIONS — IDB Adapter (Fase 2)
   (SPEC_NOTIFICATIONS_9_72 — persistence layer)

   Provides async IDB persistence for notifications so that the
   notification store survives page reloads (F5). Uses idbSet/idbGet
   from the project-standard idbStore wrapper — never touches IndexedDB
   directly or localStorage.

   Key: 'ecbyts-notifications-store'
   Value schema: NotificationEntry[]

   Exported API:
   - saveNotificationsToIDB(notifications) → Promise<boolean>
   - loadNotificationsFromIDB()            → Promise<NotificationEntry[]>
   - clearNotificationsFromIDB()           → Promise<boolean>
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';

/** IDB key canônica para este módulo. */
export const NOTIF_IDB_KEY = 'ecbyts-notifications-store';

/**
 * Persiste a lista de notificações no IndexedDB.
 * Serializa o array inteiro sob a chave canônica.
 *
 * @param {object[]} notifications - array de NotificationEntry retornado pelo store
 * @returns {Promise<boolean>} true se salvo com sucesso, false em erro (nunca lança)
 */
export async function saveNotificationsToIDB(notifications: object[]): Promise<boolean> {
    if (!Array.isArray(notifications)) return false;
    try {
        return await idbSet(NOTIF_IDB_KEY, notifications);
    } catch (e) {
        console.warn('[notif] saveNotificationsToIDB failed:', e);
        return false;
    }
}

/**
 * Carrega a lista de notificações do IndexedDB.
 * Retorna [] se não houver dado ou se o formato for inválido.
 *
 * @returns {Promise<object[]>} array de NotificationEntry ou [] em erro/vazio
 */
export async function loadNotificationsFromIDB(): Promise<object[]> {
    try {
        const raw = await idbGet(NOTIF_IDB_KEY);
        // idbGet retorna null quando a key não existe, false em erro de IDB
        if (!Array.isArray(raw)) return [];
        return raw as object[];
    } catch (e) {
        console.warn('[notif] loadNotificationsFromIDB failed:', e);
        return [];
    }
}

/**
 * Remove a chave de notificações do IndexedDB.
 * Útil para logout ou reset de sessão.
 *
 * @returns {Promise<boolean>} true se limpo com sucesso, false em erro
 */
export async function clearNotificationsFromIDB(): Promise<boolean> {
    try {
        return await idbSet(NOTIF_IDB_KEY, []);
    } catch (e) {
        console.warn('[notif] clearNotificationsFromIDB failed:', e);
        return false;
    }
}
