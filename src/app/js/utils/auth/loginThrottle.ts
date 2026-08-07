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
/* ================================================================
   LOGIN THROTTLE â€” Brute-force protection for authentication
   Protecao contra forca bruta na autenticacao

   Implementa contagem de tentativas falhas com backoff exponencial
   e sinalizacao para CAPTCHA. Usa sessionStorage (per-tab, morre
   ao fechar a aba) para que o atacante nao possa contornar
   limpando localStorage.

   POLITICA:
   - 0-2 falhas:  sem delay
   - 3 falhas:    CAPTCHA exigido + 15s delay
   - 4 falhas:    30s delay
   - 5 falhas:    60s delay
   - 6+ falhas:   300s delay (maximo)

   NOTA: Este modulo extrai e centraliza a logica de throttle que
   existia inline em handlers/auth.js, adicionando backoff exponencial
   e API publica para integracao com captchaLoader.js.
   ================================================================ */
import { createLogger } from '../helpers/logger.js';
const log = createLogger('LoginThrottle');
// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------
/** sessionStorage key for throttle state */
const STORAGE_KEY = 'ecbyts-auth-throttle';
/** Number of failed attempts before CAPTCHA is required */
const CAPTCHA_THRESHOLD = 3;
/** Delay schedule in seconds indexed by attempt count */
const DELAY_SCHEDULE = [0, 0, 0, 15, 30, 60, 300];
/** Maximum delay in seconds (for attempts beyond schedule) */
const MAX_DELAY_SECONDS = 300;
// ----------------------------------------------------------------
// INTERNAL STATE ACCESS
// ----------------------------------------------------------------
/**
 * Read throttle state from sessionStorage.
 * @private
 */
function _getState() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY) || '';
        if (!raw)
            return { count: 0, firstAt: 0, lastAt: 0 };
        return JSON.parse(raw);
    }
    catch (err: any) {
        log.debug('Throttle state parse ignored', err?.message);
        return { count: 0, firstAt: 0, lastAt: 0 };
    }
}
/**
 * Persist throttle state to sessionStorage.
 * @private
 */
function _setState(state: any) {
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    catch (err: any) {
        log.warn('Failed to persist throttle state', err?.message);
    }
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Record a failed login attempt. Increments counter and timestamps.
 * Registra uma tentativa de login falha.
 *
 * @returns Current count and delay in seconds
 */
export function recordFailedAttempt() {
    const now = Date.now();
    const state = _getState();
    const count = (state.count || 0) + 1;
    _setState({
        count,
        firstAt: state.firstAt || now,
        lastAt: now,
    });
    const delay = getThrottleDelay(count);
    log.warn(`Failed login attempt #${count}, next delay: ${delay}s`);
    return { count, delay };
}
/**
 * Get the number of failed attempts in current session.
 * Retorna o numero de tentativas falhas na sessao atual.
 */
export function getFailedAttempts() {
    return _getState().count || 0;
}
/**
 * Check if CAPTCHA should be required based on failure count.
 * Verifica se o CAPTCHA deve ser exigido.
 *
 * @param count? - Override count (for testing); defaults to current state
 * @returns true if attempts >= CAPTCHA_THRESHOLD
 */
export function needsCaptcha(count?: any) {
    const c = typeof count === 'number' ? count : getFailedAttempts();
    return c >= CAPTCHA_THRESHOLD;
}
/**
 * Reset throttle state (call on successful login).
 * Limpa o estado de throttle apos login bem-sucedido.
 */
export function resetThrottle() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
        log.debug('Throttle state cleared');
    }
    catch (err: any) {
        log.debug('Throttle clear ignored', err?.message);
    }
}
/**
 * Get the delay in seconds for a given attempt count.
 * Retorna o delay em segundos baseado no numero de tentativas.
 *
 * Schedule: 0, 0, 0, 15, 30, 60, 300 (max).
 * Attempts beyond the schedule length get MAX_DELAY_SECONDS.
 *
 * @param count? - Override count; defaults to current state
 * @returns Delay in seconds
 */
export function getThrottleDelay(count?: any) {
    const c = typeof count === 'number' ? count : getFailedAttempts();
    if (c < 0)
        return 0;
    if (c >= DELAY_SCHEDULE.length)
        return MAX_DELAY_SECONDS;
    return DELAY_SCHEDULE[c]!;
}
/**
 * Check if user is currently within a throttle delay period.
 * Verifica se o usuario esta dentro do periodo de delay.
 */
export function isThrottled() {
    const state = _getState();
    if (!state!.lastAt || !state!.count)
        return { throttled: false, remainingMs: 0 };
    const delayMs = getThrottleDelay(state!.count) * 1000;
    if (delayMs === 0)
        return { throttled: false, remainingMs: 0 };
    const elapsed = Date.now() - state!.lastAt;
    const remainingMs = Math.max(0, delayMs - elapsed);
    return {
        throttled: remainingMs > 0,
        remainingMs,
    };
}
/**
 * Get the CAPTCHA threshold constant (for testing/display).
 */
export function getCaptchaThreshold() {
    return CAPTCHA_THRESHOLD;
}
/**
 * Get the delay schedule array (for testing).
 */
export function getDelaySchedule() {
    return [...DELAY_SCHEDULE];
}
