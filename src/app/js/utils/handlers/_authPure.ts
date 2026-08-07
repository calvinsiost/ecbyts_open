// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave LLLL1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free auth throttle math from handlers/auth.js
// (#14 monolito 1516 LOC). Pure: zero document/window/sessionStorage refs.
// Caller provides current state + clock; pure module computes next state.

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

/**
 * Canonical throttle policy thresholds.
 * Frozen for immutability + spec contract.
 */
export const THROTTLE_POLICY = Object.freeze({
    MAX_ATTEMPTS: 5,
    LOCKOUT_MS: 15 * 60_000, // 15 minutes
    WINDOW_MS: 10 * 60_000, // 10 minutes
    CAPTCHA_THRESHOLD: 3,
});

/**
 * Compute next throttle state given current state, now timestamp, and failed-attempt event.
 * Pure: deterministic from inputs. No I/O.
 *
 * @param {{count?:number, firstAt?:number, lockedUntil?:number|null}|null|undefined} current
 * @param {number} current - Date.now() at event
 * @returns {{count:number, firstAt:number, lockedUntil:number|null}}
 */
export function computeThrottleAfterFailure( current: any, now: any) {
    const data = current && typeof current === 'object' ? current : {};
    const t = toFiniteNumber(now, 0);
    const windowStart = t - THROTTLE_POLICY.WINDOW_MS;
    const firstAtRaw = Number(data.firstAt);
    const inWindow = Number.isFinite(firstAtRaw) && firstAtRaw > windowStart;
    const count = (inWindow ? Number(data.count || 0) : 0) + 1;
    const lockedUntil = count >= THROTTLE_POLICY.MAX_ATTEMPTS ? t + THROTTLE_POLICY.LOCKOUT_MS : null;
    return {
        count,
        firstAt: inWindow ? firstAtRaw : t,
        lockedUntil,
    };
}

/**
 * Check if state represents an active lockout at `now`.
 * Returns {locked, remainingMs}.
 *
 * @param {{lockedUntil?:number|null}|null|undefined} state
 * @param {number} state
 * @returns {{locked:boolean, remainingMs:number}}
 */
export function checkThrottleLockout( state: any, now: any) {
    if (!state || typeof state !== 'object') return { locked: false, remainingMs: 0 };
    const t = toFiniteNumber(now, 0);
    const lockedUntil = Number(state.lockedUntil);
    if (!Number.isFinite(lockedUntil) || lockedUntil <= 0) {
        return { locked: false, remainingMs: 0 };
    }
    const remainingMs = lockedUntil - t;
    if (remainingMs <= 0) return { locked: false, remainingMs: 0 };
    return { locked: true, remainingMs };
}

/**
 * Decide if throttle state warrants CAPTCHA challenge (count >= threshold).
 *
 * @param {{count?:number}|null|undefined} state
 * @returns {boolean}
 */
export function needsCaptcha( state: any) {
    if (!state || typeof state !== 'object') return false;
    return Number(state.count || 0) >= THROTTLE_POLICY.CAPTCHA_THRESHOLD;
}

/**
 * Normalize raw throttle state from storage (NaN-safe coercion).
 *
 * @param {any} raw
 * @returns {{count:number, lockedUntil:number}}
 */
export function normalizeThrottleState( raw: any) {
    const data = raw && typeof raw === 'object' ? raw : {};
    return {
        count: Math.max(0, Number(data.count) || 0),
        lockedUntil: Math.max(0, Number(data.lockedUntil) || 0),
    };
}

/**
 * Reset throttle state (returns empty object).
 *
 * @returns {{}}
 */
export function emptyThrottleState() {
    return {};
}
