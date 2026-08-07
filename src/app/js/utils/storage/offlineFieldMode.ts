// Generated from src/app/js/utils/storage/offlineFieldMode.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
/* ================================================================
   OFFLINE FIELD MODE — Connectivity state for field data capture
   Estado global de conectividade para coleta em campo.

   - Detecta online/offline via navigator + eventos window
   - Modo Campo forcado manualmente (persistido em localStorage)
   - Ao reconectar, dispara sync das fotos pendentes (PhotoLog)
   - Estado observavel para badge do statusbar

   Spec: docs/specs/features/SPEC_OFFLINE_FIELD_MODE.md
   Reusa: storageMonitor.safeSetItem, core/photolog/manager.syncPendingPhotos
   ================================================================ */
import { safeSetItem } from './storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('OfflineFieldMode');
/** localStorage key — preferencia persistida do modo campo forcado. */
export const FIELD_MODE_KEY = 'ecbyts-offline-field-mode';
let _forced: any = false;
let _initialized: any = false;
/** @type {Set<(state: OfflineState) => void>} */
const _listeners: Set<any> = new Set();
/** @type {(() => void)|null} */
let _onReconnect: any = null;
/**
 * @typedef {{ online: boolean, offline: boolean, forced: boolean }} OfflineState
 */
/**
 * Returns whether the browser reports network connectivity.
 * / Indica se o navegador reporta conectividade de rede.
 * @returns {boolean}
 */
function _navigatorOnline() {
    try {
        return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    } catch (e: any) {
        console.debug('[offlineFieldMode:nav]', /** @type {any} */ (e)?.message || e);
        return true;
    }
}
/**
 * Reads the persisted forced-field-mode preference from localStorage.
 * / Le a preferencia persistida de modo campo forcado.
 * @returns {boolean}
 */
function _readPersisted() {
    try {
        if (typeof localStorage === 'undefined') return false;
        return localStorage.getItem(FIELD_MODE_KEY) === '1';
    } catch (e: any) {
        console.debug('[offlineFieldMode:read]', /** @type {any} */ (e)?.message || e);
        return false;
    }
}
/**
 * Returns true when the app is effectively offline (forced OR no network).
 * / Verdadeiro quando o app esta efetivamente offline (forcado OU sem rede).
 * @returns {boolean}
 */
export function isOffline() {
    return _forced || !_navigatorOnline();
}
/**
 * Returns whether Field Mode was manually forced by the user.
 * / Indica se o Modo Campo foi forcado manualmente pelo usuario.
 * @returns {boolean}
 */
export function isFieldModeForced() {
    return _forced;
}
/**
 * Returns the current connectivity state snapshot.
 * / Retorna um snapshot do estado atual de conectividade.
 * @returns {OfflineState}
 */
export function getOfflineState() {
    const online = _navigatorOnline();
    return { online, offline: _forced || !online, forced: _forced };
}
/**
 * Notifies all subscribers with the current state.
 * / Notifica todos os assinantes com o estado atual.
 */
function _emit() {
    const state = getOfflineState();
    for (const fn of _listeners) {
        try {
            fn(state);
        } catch (e: any) {
            console.debug('[offlineFieldMode:listener]', /** @type {any} */ (e)?.message || e);
        }
    }
}
/**
 * Subscribes to connectivity state changes.
 * / Inscreve um ouvinte para mudancas de estado de conectividade.
 * @param {(state: OfflineState) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribe( fn: any) {
    if (typeof fn !== 'function') return () => {};
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}
/**
 * Forces (or clears) Field Mode and persists the preference.
 * / Forca (ou limpa) o Modo Campo e persiste a preferencia.
 * @param {boolean} value
 * @returns {boolean} novo estado forcado
 */
export function setFieldModeForced( value: any) {
    _forced = !!value;
    safeSetItem(FIELD_MODE_KEY, _forced ? '1' : '0');
    log.info(`Field Mode ${_forced ? 'enabled' : 'disabled'}`);
    _emit();
    // Se o usuario desligou o modo forcado e ha rede, tenta sincronizar.
    if (!_forced && _navigatorOnline()) _triggerReconnectSync();
    return _forced;
}
/** Toggles Field Mode. / Alterna o Modo Campo. @returns {boolean} */
export function toggleFieldMode() {
    return setFieldModeForced(!_forced);
}
/**
 * Pure helper: derives the badge label/tone from state + pending count.
 * / Helper puro: deriva rotulo/tom do badge a partir do estado + pendentes.
 * @param {{ offline: boolean, forced: boolean, pending: number }} input
 * @returns {{ key: string, tone: 'neutral'|'warn', pending: number }}
 */
export function computeBadgeState({ offline, forced, pending }: any) {
    const p = Number.isFinite(pending) && pending > 0 ? Math.floor(pending) : 0;
    if (forced) return { key: 'fieldModeForced', tone: 'warn', pending: p };
    if (offline) return { key: 'fieldModeOffline', tone: 'warn', pending: p };
    return { key: 'fieldModeOnline', tone: 'neutral', pending: p };
}
/**
 * Triggers PhotoLog sync of pending photos (best-effort, dynamic import).
 * / Dispara sync das fotos pendentes do PhotoLog (best-effort).
 */
async function _triggerReconnectSync() {
    try {
        const mgr = await import('../../core/photolog/manager.js' as string);
        const result = await mgr.syncPendingPhotos();
        log.info(`Reconnect sync: ${result.synced} ok, ${result.failed} failed`);
    } catch (e: any) {
        console.debug('[offlineFieldMode:sync]', /** @type {any} */ (e)?.message || e);
    }
    if (_onReconnect) {
        try {
            _onReconnect();
        } catch (e: any) {
            console.debug('[offlineFieldMode:onReconnect]', /** @type {any} */ (e)?.message || e);
        }
    }
}
/** Handler for the browser `online` event. / Handler do evento `online`. */
function _handleOnline() {
    log.info('Browser reported online');
    _emit();
    if (!_forced) _triggerReconnectSync();
}
/** Handler for the browser `offline` event. / Handler do evento `offline`. */
function _handleOffline() {
    log.info('Browser reported offline');
    _emit();
}
/**
 * Initializes Offline Field Mode: restores preference + installs listeners.
 * Idempotente — chamadas repetidas nao duplicam listeners.
 * / Inicializa o Modo Campo: restaura preferencia + instala listeners.
 *
 * @param {{ onReconnect?: () => void }} [options]
 * @returns {OfflineState}
 */
export function initOfflineFieldMode( options: any = {}) {
    if (options && typeof options.onReconnect === 'function') {
        _onReconnect = options.onReconnect;
    }
    if (_initialized) return getOfflineState();
    _initialized = true;
    _forced = _readPersisted();
    try {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', _handleOnline);
            window.addEventListener('offline', _handleOffline);
        }
    } catch (e: any) {
        console.debug('[offlineFieldMode:init]', /** @type {any} */ (e)?.message || e);
    }
    _emit();
    return getOfflineState();
}
/**
 * Internal reset for tests.
 * / Reset interno para testes.
 */
export function __resetOfflineFieldModeForTests() {
    _forced = false;
    _initialized = false;
    _onReconnect = null;
    _listeners.clear();
}
