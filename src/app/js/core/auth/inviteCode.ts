// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ234567';
export const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ234567]{8}$/;

export type InviteFormatReason = 'empty' | 'too_short' | 'too_long' | 'invalid_chars' | 'ok';

export interface InviteFormatCheck {
    valid: boolean;
    reason: InviteFormatReason;
    code: string;
    originalLength: number;
}

export function normalizeInviteCode(raw: unknown): string {
    if (raw == null) return '';
    const str = String(raw);
    if (!str) return '';

    const queryIdx = str.indexOf('invite=');
    const fromQuery = queryIdx >= 0 ? str.slice(queryIdx + 'invite='.length) : str;
    const codeIdx = fromQuery.indexOf('code=');
    const stripped = codeIdx >= 0 ? fromQuery.slice(codeIdx + 'code='.length) : fromQuery;

    return stripped.toUpperCase().replace(/[^ABCDEFGHJKLMNPQRSTUVWXYZ234567]/g, '');
}

export function validateInviteCodeFormat(raw: unknown): InviteFormatCheck {
    const code = normalizeInviteCode(raw);
    const originalLength = raw == null ? 0 : String(raw).replace(/\s/g, '').length;

    if (!code) {
        return { valid: false, reason: 'empty', code: '', originalLength };
    }
    if (code.length < INVITE_CODE_LENGTH) {
        return { valid: false, reason: 'too_short', code, originalLength };
    }
    if (code.length > INVITE_CODE_LENGTH) {
        return { valid: false, reason: 'too_long', code, originalLength };
    }
    if (!INVITE_CODE_REGEX.test(code)) {
        return { valid: false, reason: 'invalid_chars', code, originalLength };
    }
    return { valid: true, reason: 'ok', code, originalLength };
}

export function isCanonicalInviteCode(raw: unknown): boolean {
    return validateInviteCodeFormat(raw).valid;
}

export const INVITE_THROTTLE_MAX_ATTEMPTS = 10;
export const INVITE_THROTTLE_LOCKOUT_MS = 5 * 60_000;
export const INVITE_THROTTLE_WINDOW_MS = 15 * 60_000;

export interface InviteThrottleState {
    count: number;
    firstAt: number | null;
    lockedUntil: number | null;
}

export const EMPTY_INVITE_THROTTLE: Readonly<InviteThrottleState> = Object.freeze({
    count: 0,
    firstAt: null,
    lockedUntil: null,
});

export interface InviteAttemptOptions {
    maxAttempts?: number;
    lockoutMs?: number;
    windowMs?: number;
}

export interface InviteLockoutStatus {
    locked: boolean;
    remainingMs: number;
    expired?: boolean;
}

function finiteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeInviteThrottle(raw: unknown): InviteThrottleState {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_INVITE_THROTTLE };
    const state = raw as Partial<InviteThrottleState>;
    return {
        count: finiteNumber(state.count) ? state.count : 0,
        firstAt: finiteNumber(state.firstAt) ? state.firstAt : null,
        lockedUntil: finiteNumber(state.lockedUntil) ? state.lockedUntil : null,
    };
}

export function recordInviteAttempt(
    currentState: unknown,
    now: number,
    opts: InviteAttemptOptions = {},
): InviteThrottleState {
    const maxAttempts = finiteNumber(opts.maxAttempts) ? opts.maxAttempts : INVITE_THROTTLE_MAX_ATTEMPTS;
    const lockoutMs = finiteNumber(opts.lockoutMs) ? opts.lockoutMs : INVITE_THROTTLE_LOCKOUT_MS;
    const windowMs = finiteNumber(opts.windowMs) ? opts.windowMs : INVITE_THROTTLE_WINDOW_MS;

    const state = normalizeInviteThrottle(currentState);
    const tNow = finiteNumber(now) ? now : Date.now();

    const windowStart = tNow - windowMs;
    const withinWindow = state.firstAt != null && state.firstAt > windowStart;

    const count = (withinWindow ? state.count : 0) + 1;
    const firstAt = withinWindow ? state.firstAt : tNow;
    const lockedUntil = count >= maxAttempts ? tNow + lockoutMs : null;

    return { count, firstAt, lockedUntil };
}

export function clearInviteThrottle(): InviteThrottleState {
    return { ...EMPTY_INVITE_THROTTLE };
}

export function checkInviteLockout(state: unknown, now?: number): InviteLockoutStatus {
    const s = normalizeInviteThrottle(state);
    if (!s.lockedUntil) return { locked: false, remainingMs: 0 };
    const tNow = finiteNumber(now) ? now : Date.now();
    const remaining = s.lockedUntil - tNow;
    if (remaining <= 0) return { locked: false, remainingMs: 0, expired: true };
    return { locked: true, remainingMs: remaining };
}

export function getRemainingInviteAttempts(
    state: unknown,
    maxAttempts = INVITE_THROTTLE_MAX_ATTEMPTS,
): number {
    const s = normalizeInviteThrottle(state);
    return Math.max(0, maxAttempts - s.count);
}
