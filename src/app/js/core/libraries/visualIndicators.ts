// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LIBRARY VISUAL INDICATORS — SPEC_LIBRARY_VISUAL_INDICATORS_9_69

   Tracking de estado "visto/não-visto/limpo" por usuário × item.
   Pure helpers + async CRUD IDB.

   Estados (§2.2):
   - 'unseen': novo desde última lastSeenAt do usuário
   - 'seen': já visualizado (bolinha verde)
   - 'cleared': após "Limpar marcações" (sem bolinha)
   - 'updated': item atualizado após usuário já ter visto

   Auto-mark seen (§Q3): click explícito OU tempo ≥3s com scroll.
   ================================================================ */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createLogger } from '../../utils/helpers/logger.js';

const log = createLogger('LibraryVisualIndicators');

const IDB_KEY = 'ecbyts-library-seen-state';

// Auto-mark threshold (§Q3)
const AUTO_MARK_MIN_MS = 3000;

// Shape do state por usuário:
// { [userId]: { lastSeenAt: ISO, itemStates: { [itemId]: { status, seenAt, itemUpdatedAt } } } }
let _state = {};
let _loaded = false;

// ──────────────────────────────────────────────────────────────────────
// Persistence
// ──────────────────────────────────────────────────────────────────────

async function _ensureLoaded() {
    if (_loaded) return;
    try {
        const stored = await idbGet(IDB_KEY);
        if (stored && typeof stored === 'object') _state = stored;
    } catch (err) {
        log.warn('Failed to load seen state:', /** @type {any} */ (err as any)?.message);
    }
    _loaded = true;
}

async function _persist() {
    try {
        await idbSet(IDB_KEY, _state);
    } catch (err) {
        log.error('Failed to persist seen state', err);
    }
}

function _userState(/** @type {string} */ userId: any) {
    const s = /** @type {Record<string, any>} */ (_state) as Record<string, any>;
    if (!s[userId]) {
        s[userId] = { lastSeenAt: null, itemStates: {} };
    }
    return s[userId];
}

// ──────────────────────────────────────────────────────────────────────
// Pure classifiers
// ──────────────────────────────────────────────────────────────────────

/**
 * Classifica status de um item para um userState.
 * Pura - não acessa IDB.
 *
 * @param {Object} item - { id, updatedAt, createdAt }
 * @param {Object} userState - { lastSeenAt, itemStates }
 * @returns {'unseen'|'seen'|'cleared'|'updated'}
 */
export function itemStatus(/** @type {any} */ item: any, /** @type {any} */ userState: any) {
    if (!item || !item.id) return 'unseen';
    const states = userState?.itemStates || {};
    const entry = states[item.id];

    if (!entry) return 'unseen';
    if (entry.status === 'cleared') return 'cleared';

    // Se entry.status === 'seen' mas item foi atualizado depois → updated
    if (entry.status === 'seen' && item.updatedAt && entry.seenAt) {
        const itemTs = new Date(item.updatedAt).getTime();
        const seenTs = new Date(entry.seenAt).getTime();
        if (Number.isFinite(itemTs) && Number.isFinite(seenTs) && itemTs > seenTs) {
            return 'updated';
        }
    }
    return entry.status || 'unseen';
}

/**
 * Decisão de auto-marcar seen baseado em evento (§Q3).
 * Pura - usa apenas dados do evento.
 *
 * @param {Object} event
 * @param {string} event.kind - 'click' | 'view'
 * @param {number} [event.durationMs] - duração de exposição (para 'view')
 * @param {boolean} [event.scrolled] - se usuário rolou
 * @returns {boolean}
 */
export function shouldAutoMarkSeen(event: any) {
    if (!event || typeof event !== 'object') return false;
    if (event.kind === 'click') return true;
    if (event.kind === 'view') {
        return (
            !!event.scrolled &&
            Number.isFinite(event.durationMs) &&
            /** @type {number} */ (event.durationMs) >= AUTO_MARK_MIN_MS
        );
    }
    return false;
}

/**
 * Conta unseen/updated por categoria (§2.2 badge numérico).
 *
 * @param {Array<{id: string, category?: string, updatedAt?: string}>} items
 * @param {Object} items
 * @returns {{ total: number, byCategory: Object<string, number> }}
 */
export function countUnseenByCategory(items: any, userState: any) {
    if (!Array.isArray(items)) return { total: 0, byCategory: /** @type {Record<string, number>} */ ({}) };
    const byCategory = /** @type {Record<string, number>} */ ({}) as Record<string, number>;
    let total = 0;
    for (const item of items) {
        if (!item || !item.id) continue;
        const status = itemStatus(item, userState);
        if (status === 'unseen' || status === 'updated') {
            total++;
            const cat = item.category || '__default';
            byCategory[cat] = (byCategory[cat] || 0) + 1;
        }
    }
    return { total, byCategory };
}

/**
 * Filtra items com status 'unseen'|'updated' (§Q6 novo desde última marcação).
 *
 * @param {Array<Object>} items
 * @param {Object} userState
 * @returns {Array<Object>}
 */
export function getUnseenItems(items: any, userState: any) {
    if (!Array.isArray(items)) return [];
    return items.filter((/** @type {any} */ item) => {
        if (!item || !item.id) return false;
        const s = itemStatus(item, userState);
        return s === 'unseen' || s === 'updated';
    });
}

// ──────────────────────────────────────────────────────────────────────
// Async state mutations
// ──────────────────────────────────────────────────────────────────────

/**
 * Retorna state do usuário (carregando do IDB se necessário).
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getUserState(userId: any) {
    if (!userId) return { lastSeenAt: null, itemStates: {} };
    await _ensureLoaded();
    return _userState(userId);
}

/**
 * Marca item como 'seen' para um usuário.
 * @param {string} userId
 * @param {string} itemId
 * @param {string} [itemUpdatedAt] - preservado para detecção de 'updated' futuro
 * @returns {Promise<Object>} novo state do item
 */
export async function markSeen(userId: any, itemId: any, itemUpdatedAt: any) {
    if (!userId || !itemId) throw new Error('markSeen: userId and itemId required');
    await _ensureLoaded();
    const us = _userState(userId);
    const now = new Date().toISOString();
    us.itemStates[itemId] = {
        status: 'seen',
        seenAt: now,
        itemUpdatedAt: itemUpdatedAt || null,
    };
    us.lastSeenAt = now;
    await _persist();
    return us.itemStates[itemId];
}

/**
 * Marca múltiplos itens como seen (§2.2 "marcar tudo como visto").
 * @param {string} userId
 * @param {Array<{id: string, updatedAt?: string}>} items
 * @returns {Promise<number>} quantidade marcada
 */
export async function markAllSeen(userId: any, items: any) {
    if (!userId || !Array.isArray(items)) return 0;
    await _ensureLoaded();
    const us = _userState(userId);
    const now = new Date().toISOString();
    let count = 0;
    for (const item of items) {
        if (!item || !item.id) continue;
        us.itemStates[item.id] = {
            status: 'seen',
            seenAt: now,
            itemUpdatedAt: item.updatedAt || null,
        };
        count++;
    }
    us.lastSeenAt = now;
    await _persist();
    return count;
}

/**
 * Limpa todas as marcações (§Q5 "remover bolinhas").
 * Preserva histórico interno (status='cleared') - não apaga entry.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
export async function clearAllMarkings(userId: any) {
    if (!userId) return 0;
    await _ensureLoaded();
    const us = _userState(userId);
    const clearedAt = new Date().toISOString();
    let count = 0;
    for (const itemId of Object.keys(us.itemStates)) {
        const e = us.itemStates[itemId];
        if (e.status !== 'cleared') {
            us.itemStates[itemId] = { ...e, status: 'cleared', clearedAt };
            count++;
        }
    }
    await _persist();
    return count;
}

/**
 * Processa evento de visualização (wrapping de shouldAutoMarkSeen).
 * Se auto-mark = true, chama markSeen.
 *
 * @param {string} userId
 * @param {string} itemId
 * @param {{ kind: string, durationMs?: number, scrolled?: boolean }} event - { kind, durationMs, scrolled }
 * @param {string} [event]
 * @returns {Promise<{ marked: boolean, state?: Object }>}
 */
export async function processViewEvent(userId: any, itemId: any, event: any, itemUpdatedAt: any) {
    if (!shouldAutoMarkSeen(event)) return { marked: false };
    const state = await markSeen(userId, itemId, itemUpdatedAt);
    return { marked: true, state };
}

// ──────────────────────────────────────────────────────────────────────
// Test helper
// ──────────────────────────────────────────────────────────────────────

export async function _resetForTesting(clearIdb = false) {
    _state = {};
    _loaded = !clearIdb;
    if (clearIdb) {
        try {
            await idbSet(IDB_KEY, {});
        } catch (e) {
            console.debug('[visualIndicators] clearIdb:', /** @type {any} */ (e as any)?.message || e);
        }
    }
}
