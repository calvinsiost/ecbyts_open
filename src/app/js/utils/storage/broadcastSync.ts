// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   BROADCAST SYNC — Cross-tab state synchronization
   ================================================================
   Sincronizacao entre abas do browser via BroadcastChannel API.
   Cada aba gera um tabId unico e ignora suas proprias mensagens
   (origin guard). Degrada silenciosamente se API indisponivel.
   ================================================================ */

import { CONFIG } from '../../config.js';

const CHANNEL_NAME = 'ecbyts-sync';
const DEBOUNCE_MS = 100;

/** Unique ID per tab — prevents processing own messages */
const tabId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** @type {BroadcastChannel|null} */
let _channel: any = null;

/** @type {Map<string, Set<Function>>} handlers by message type */
const _handlers = new Map();

/** @type {Map<string, number>} debounce timers per message type */
const _debounceTimers = new Map();

/** When true, broadcastChange() becomes a no-op (prevents loops during sync reload) */
let _suppressed = false;

/**
 * Initialize BroadcastChannel for cross-tab sync.
 * Cria canal e registra listener. Degrada silenciosamente se API indisponivel.
 * @returns {void}
 */
export function initBroadcastSync() {
    const features = /** @type {any} */ (CONFIG.FEATURES);
    if (!features?.BROADCAST_SYNC) return;
    if (typeof BroadcastChannel === 'undefined') {
        console.info('[BroadcastSync] API indisponivel — sync entre abas desabilitado');
        return;
    }
    if (_channel) return; // already initialized

    _channel = new BroadcastChannel(CHANNEL_NAME);
    _channel.onmessage = _onMessage;
}

/**
 * Broadcast a change to other tabs. Debounced by type.
 * Envia mensagem para outras abas com debounce para evitar flood em drag.
 * @param {string} type - Message type (e.g. 'model:changed')
 * @param {Object} [payload={}] - Optional payload data
 */
export function broadcastChange(type: any, payload = {}) {
    const ch = _channel;
    if (!ch || _suppressed) return;

    // Debounce per type - drag operations fire rapidly
    clearTimeout(_debounceTimers.get(type));
    _debounceTimers.set(
        type,
        setTimeout(() => {
            ch.postMessage({ type, payload, origin: tabId, ts: Date.now() });
            _debounceTimers.delete(type);
        }, DEBOUNCE_MS),
    );
}

/**
 * Register handler for a sync message type.
 * Registra callback para tipo de mensagem. Retorna funcao de cleanup.
 * @param {string} type - Message type to listen for
 * @param {Function} handler - Callback receiving { payload, origin, ts }
 * @returns {Function} Cleanup function to unregister
 */
export function onSyncMessage(type: any, handler: any) {
    if (!_handlers.has(type)) _handlers.set(type, new Set());
    _handlers.get(type)?.add(handler);
    return () => _handlers.get(type)?.delete(handler);
}

/**
 * Destroy channel and clean up all handlers.
 * Chamado no pagehide para liberar recursos.
 */
export function destroyBroadcastSync() {
    if (_channel) {
        _channel.close();
        _channel = null;
    }
    _handlers.clear();
    for (const t of _debounceTimers.values()) clearTimeout(t);
    _debounceTimers.clear();
    _suppressed = false;
}

/**
 * Suppress or allow outgoing broadcasts.
 * Usado durante reload de sync para evitar loop infinito.
 * @param {boolean} flag - true to suppress, false to allow
 */
export function setSuppressed(flag: any) {
    _suppressed = !!flag;
}

/**
 * Get this tab's unique ID (exposed for testing).
 * @returns {string}
 */
export function getTabId() {
    return tabId;
}

// ----------------------------------------------------------------
// INTERNAL
// ----------------------------------------------------------------

/**
 * Handle incoming BroadcastChannel message.
 * Filtra mensagens proprias (origin guard) e despacha para handlers.
 * @param {MessageEvent} event
 */
function _onMessage(event: any) {
    const { type, payload, origin } = event.data || {};
    if (!type || origin === tabId) return; // origin guard
    const set = _handlers.get(type);
    if (!set || set.size === 0) return;
    for (const fn of set) {
        try {
            fn({ payload, origin, ts: event.data.ts });
        } catch (e) {
            console.error(`[BroadcastSync] Handler error for "${type}":`, e);
        }
    }
}
