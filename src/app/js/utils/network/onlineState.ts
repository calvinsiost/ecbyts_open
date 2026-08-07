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
 * onlineState.ts - pure connectivity state for SPEC_ERROR_RECOVERY_JOURNEY.
 *
 * The browser integration owns event listeners and heartbeat fetches. This
 * module only reduces those facts into a deterministic online/offline contract
 * that banners and queues can consume without touching DOM or network.
 */

/**
 * @typedef {Object} OnlineState
 * @property {boolean} navigatorOnline
 * @property {boolean} heartbeatOk
 * @property {number} heartbeatFailures
 * @property {number | null} lastCheckedAt
 * @property {number | null} lastChangedAt
 *
 * @typedef {Object} OnlineStateOptions
 * @property {boolean} [navigatorOnline]
 * @property {boolean} [heartbeatOk]
 * @property {number} [heartbeatFailures]
 * @property {number | null} [lastCheckedAt]
 * @property {number | null} [lastChangedAt]
 *
 * @typedef {Object} OnlineEvent
 * @property {'browser-online'|'browser-offline'|'heartbeat-success'|'heartbeat-failure'} type
 * @property {number} [now]
 *
 * @typedef {Object} ConnectivityOptions
 * @property {number} [failureThreshold]
 *
 * @typedef {Object} ConnectivityState
 * @property {boolean} isOnline
 * @property {'online'|'offline'|'unstable'} mode
 * @property {string} reason
 * @property {number} heartbeatFailures
 */

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 30000;
export const DEFAULT_HEARTBEAT_FAILURE_THRESHOLD = 3;

const EVENT_TYPES = new Set(['browser-online', 'browser-offline', 'heartbeat-success', 'heartbeat-failure']);

export interface OnlineState {
    navigatorOnline: boolean;
    heartbeatOk: boolean;
    heartbeatFailures: number;
    lastCheckedAt: number | null;
    lastChangedAt: number | null;
}

/**
 * @param {unknown} value
 * @param {number | null} [fallback]
 * @returns {number | null}
 */
function finiteNumber(value: unknown, fallback: number | null = null): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * @param {OnlineState} state
 * @returns {OnlineState}
 */
function freezeState(state: OnlineState): OnlineState {
    return Object.freeze({
        navigatorOnline: state.navigatorOnline,
        heartbeatOk: state.heartbeatOk,
        heartbeatFailures: state.heartbeatFailures,
        lastCheckedAt: state.lastCheckedAt,
        lastChangedAt: state.lastChangedAt,
    });
}

/**
 * @param {OnlineStateOptions} [opts]
 * @returns {OnlineState}
 */
export function createOnlineState(opts: {
    navigatorOnline?: boolean;
    heartbeatOk?: boolean;
    heartbeatFailures?: number;
    lastCheckedAt?: number | null;
    lastChangedAt?: number | null;
} = {}): OnlineState {
    /** @type {number} */
    const heartbeatFailures = finiteNumber(opts.heartbeatFailures, 0) ?? 0;
    if (!Number.isInteger(heartbeatFailures) || heartbeatFailures < 0) {
        throw new Error('heartbeatFailures must be a non-negative integer');
    }
    return freezeState({
        navigatorOnline: opts.navigatorOnline !== false,
        heartbeatOk: opts.heartbeatOk !== false,
        heartbeatFailures,
        lastCheckedAt: finiteNumber(opts.lastCheckedAt, null) as number | null,
        lastChangedAt: finiteNumber(opts.lastChangedAt, null) as number | null,
    });
}

/**
 * @param {OnlineState} state
 * @param {OnlineEvent} event
 * @returns {OnlineState}
 */
export function reduceOnlineEvent(
    state: OnlineState,
    event: { type: string; now?: number }
): OnlineState {
    if (!event || !EVENT_TYPES.has(event.type)) {
        throw new Error(`Invalid online event: ${event?.type}`);
    }
    const now = finiteNumber(event.now, Date.now()) as number;

    if (event.type === 'browser-offline') {
        return freezeState({
            ...state,
            navigatorOnline: false,
            heartbeatOk: false,
            lastChangedAt: now,
        });
    }

    if (event.type === 'browser-online') {
        return freezeState({
            ...state,
            navigatorOnline: true,
            lastChangedAt: now,
        });
    }

    if (event.type === 'heartbeat-success') {
        return freezeState({
            ...state,
            heartbeatOk: true,
            heartbeatFailures: 0,
            lastCheckedAt: now,
        });
    }

    return freezeState({
        ...state,
        heartbeatOk: false,
        heartbeatFailures: state.heartbeatFailures + 1,
        lastCheckedAt: now,
    });
}

export interface ConnectivityMode {
    isOnline: boolean;
    mode: 'online' | 'offline' | 'unstable';
    reason: 'ok' | 'browser_offline' | 'heartbeat_timeout' | 'heartbeat_degraded';
    heartbeatFailures: number;
}

/**
 * @param {OnlineState} state
 * @param {ConnectivityOptions} [opts]
 * @returns {ConnectivityState}
 */
export function deriveConnectivity(
    state: OnlineState,
    opts: { failureThreshold?: number } = {}
): ConnectivityMode {
    const failureThreshold = opts.failureThreshold ?? DEFAULT_HEARTBEAT_FAILURE_THRESHOLD;
    if (!Number.isInteger(failureThreshold) || failureThreshold <= 0) {
        throw new Error('failureThreshold must be a positive integer');
    }

    if (!state.navigatorOnline) {
        return Object.freeze({
            isOnline: false,
            mode: 'offline',
            reason: 'browser_offline',
            heartbeatFailures: state.heartbeatFailures,
        }) as ConnectivityMode;
    }

    if (state.heartbeatFailures >= failureThreshold) {
        return Object.freeze({
            isOnline: false,
            mode: 'offline',
            reason: 'heartbeat_timeout',
            heartbeatFailures: state.heartbeatFailures,
        }) as ConnectivityMode;
    }

    if (!state.heartbeatOk || state.heartbeatFailures > 0) {
        return Object.freeze({
            isOnline: true,
            mode: 'unstable',
            reason: 'heartbeat_degraded',
            heartbeatFailures: state.heartbeatFailures,
        }) as ConnectivityMode;
    }

    return Object.freeze({
        isOnline: true,
        mode: 'online',
        reason: 'ok',
        heartbeatFailures: 0,
    }) as ConnectivityMode;
}

/**
 * @param {OnlineState} state
 * @param {number} now
 * @param {number} [intervalMs]
 * @returns {boolean}
 */
export function shouldRunHeartbeat(
    state: unknown,
    now: unknown,
    intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
): boolean {
    if (typeof now !== 'number' || !Number.isFinite(now)) return false;
    if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
        throw new Error('intervalMs must be a positive integer');
    }
    const s = state as OnlineState;
    if (!s.navigatorOnline) return false;
    if (s.lastCheckedAt == null) return true;
    return now - s.lastCheckedAt >= intervalMs;
}

export default {
    DEFAULT_HEARTBEAT_INTERVAL_MS,
    DEFAULT_HEARTBEAT_FAILURE_THRESHOLD,
    createOnlineState,
    reduceOnlineEvent,
    deriveConnectivity,
    shouldRunHeartbeat,
};
