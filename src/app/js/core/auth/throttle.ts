// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   AUTH THROTTLE — SPEC_AUTH_HARDENING Fase 1a

   Pure reducer para UX throttle de tentativas de login.
   Não é camada de segurança — é cortesia. Proteção real = Fase 1b
   (hCaptcha server-side + Supabase rate limit).

   Este módulo não toca sessionStorage — só transforma estados.
   Handler (utils/handlers/auth.js) consome + persiste.
   ================================================================ */


// ──────────────────────────────────────────────────────────────────────
// Constants (§Fase 1a)
// ──────────────────────────────────────────────────────────────────────

export const THROTTLE_MAX_ATTEMPTS = 5;
export const THROTTLE_LOCKOUT_MS = 15 * 60_000; // 15 min
export const THROTTLE_WINDOW_MS = 10 * 60_000; // janela de contagem
export const THROTTLE_CAPTCHA_THRESHOLD = 3;

/**
 * Shape canônico (§Modelo de dados):
 * { count: number, firstAt: timestamp|null, lockedUntil: timestamp|null }
 */
export const EMPTY_THROTTLE_STATE = Object.freeze({
    count: 0,
    firstAt: null,
    lockedUntil: null,
});

// ──────────────────────────────────────────────────────────────────────
// Pure reducer
// ──────────────────────────────────────────────────────────────────────

/** Shape canônico do estado de throttle (§Modelo de dados). */
type ThrottleState = { count: number; firstAt: number | null; lockedUntil: number | null };
/** Opções de configuração do reducer de throttle. */
type ThrottleOpts = { maxAttempts?: number; lockoutMs?: number; windowMs?: number };

/**
 * Normaliza input arbitrário para shape canônico.
 * @param {any} raw
 * @returns {ThrottleState}
 */
export function normalizeThrottleState(raw: any): ThrottleState {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_THROTTLE_STATE };
    return {
        count: Number.isFinite(raw.count) ? raw.count : 0,
        firstAt: Number.isFinite(raw.firstAt) ? raw.firstAt : null,
        lockedUntil: Number.isFinite(raw.lockedUntil) ? raw.lockedUntil : null,
    };
}

/**
 * Registra tentativa falha. Retorna novo state.
 * Reseta window se fora da janela de contagem.
 *
 * @param {any} currentState
 * @param {number} now - timestamp ms
 * @param {ThrottleOpts} [opts]
 * @returns {ThrottleState}
 */
export function recordFailedAttempt(currentState: any, now: number, opts: ThrottleOpts = {}): ThrottleState {
    const maxAttempts = Number.isFinite(opts.maxAttempts) ? (opts.maxAttempts as number) : THROTTLE_MAX_ATTEMPTS;
    const lockoutMs = Number.isFinite(opts.lockoutMs) ? (opts.lockoutMs as number) : THROTTLE_LOCKOUT_MS;
    const windowMs = Number.isFinite(opts.windowMs) ? (opts.windowMs as number) : THROTTLE_WINDOW_MS;

    const state = normalizeThrottleState(currentState);
    if (!Number.isFinite(now)) now = Date.now();

    const windowStart = now - windowMs;
    const withinWindow = state.firstAt != null && state.firstAt > windowStart;

    const count = (withinWindow ? state.count : 0) + 1;
    const firstAt = withinWindow ? state.firstAt : now;
    const lockedUntil = count >= maxAttempts ? now + lockoutMs : null;

    return { count, firstAt, lockedUntil };
}

/**
 * Registra tentativa bem-sucedida - clear state.
 * @returns {ThrottleState} empty state
 */
export function clearThrottle() {
    return { ...EMPTY_THROTTLE_STATE };
}

/**
 * Verifica se user está em lockout local.
 *
 * @param {any} state
 * @param {number} [now?]
 * @returns {{ locked: boolean, remainingMs: number, expired?: boolean }}
 */
export function checkLockout(state: any, now?: number): { locked: boolean, remainingMs: number, expired?: boolean } {
    const s = normalizeThrottleState(state);
    if (!s.lockedUntil) return { locked: false, remainingMs: 0 };
    if (!Number.isFinite(now)) now = Date.now();
    const remaining = s.lockedUntil - (now as number);
    if (remaining <= 0) return { locked: false, remainingMs: 0, expired: true };
    return { locked: true, remainingMs: remaining };
}

/**
 * Determina se CAPTCHA deve ser exibido (threshold count).
 *
 * @param {any} state
 * @param {number} [threshold]
 * @returns {boolean}
 */
export function shouldShowCaptcha(state: any, threshold: number = THROTTLE_CAPTCHA_THRESHOLD): boolean {
    const s = normalizeThrottleState(state);
    return s.count >= threshold;
}

/**
 * Remaining attempts antes de lockout total.
 *
 * @param {any} state
 * @param {number} [maxAttempts]
 * @returns {number}
 */
export function getRemainingAttempts(state: any, maxAttempts: number = THROTTLE_MAX_ATTEMPTS): number {
    const s = normalizeThrottleState(state);
    return Math.max(0, maxAttempts - s.count);
}

/**
 * Formatação de lockout para mensagem de UI (minutos restantes).
 *
 * @param {number} remainingMs
 * @returns {number} minutos inteiros ceil
 */
export function formatLockoutMinutes(remainingMs: number): number {
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
    return Math.ceil(remainingMs / 60_000);
}

// ──────────────────────────────────────────────────────────────────────
// Telemetry (§observability - optional)
// ──────────────────────────────────────────────────────────────────────

/**
 * Snapshot para logging/telemetria.
 * Não inclui PII - apenas contadores derivados.
 * @param {any} state
 * @param {number} [now]
 */
export function throttleSnapshot(state: any, now: number = Date.now()) {
    const s = normalizeThrottleState(state);
    const lockout = checkLockout(s, now);
    return Object.freeze({
        count: s.count,
        captchaRequired: shouldShowCaptcha(s),
        locked: lockout.locked,
        remainingSec: Math.ceil(lockout.remainingMs / 1000),
        windowAgeMs: s.firstAt ? now - s.firstAt : null,
    });
}

