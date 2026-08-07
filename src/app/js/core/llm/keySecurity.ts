// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LLM KEY SECURITY — SPEC_RECONCILIATION_001_LLM_KEYS

   Pure helpers (sem crypto.subtle direto — derivação real em client.js):
   - Passphrase strength meter §T3
   - Rate limiter 5 tentativas / 60s → bloqueio 5min §T3
   - Captcha PoW simples (SHA-256 leading zeros)
   - Legacy key detection §Q1.2
   - PBKDF2 iteration selector benchmarked §T3

   A derivação real (PBKDF2 ou Argon2id) fica em client.js onde há acesso
   a WebCrypto.subtle.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §Q1.3 / §T3
// ──────────────────────────────────────────────────────────────────────

export const KDF_CONFIG = Object.freeze({
    ALGORITHM: 'PBKDF2',
    HASH: 'SHA-256',
    DEFAULT_ITERATIONS: 600_000, // §Q1.3 OWASP 2024
    FLOOR_ITERATIONS: 300_000,
    CEILING_ITERATIONS: 2_000_000,
    TARGET_MS: 500, // §T3 key stretching adaptativo
});

export const PASSPHRASE_RULES = Object.freeze({
    MIN_LENGTH: 12,
    MIN_CATEGORIES: 3, // lowercase, uppercase, digit, symbol (precisa 3 de 4)
});

export const RATE_LIMIT = Object.freeze({
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 60_000, // 60s
    LOCKOUT_MS: 5 * 60_000, // 5min
});

export const KEY_FORMAT_VERSION = Object.freeze({
    LEGACY: 'v0.2', // _deriveEncKey(userId)
    CURRENT: 'v0.3', // PBKDF2 passphrase
});

export const KDF_MODES = Object.freeze(['legacy', 'passphrase']);

// ──────────────────────────────────────────────────────────────────────
// Passphrase strength meter
// ──────────────────────────────────────────────────────────────────────

export function scorePassphrase(
    passphrase: string,
): { score: number; valid: boolean; checks: Record<string, boolean>; feedback: string[] } {
    if (typeof passphrase !== 'string') {
        return {
            score: 0,
            valid: false,
            checks: {},
            feedback: ['passphrase required'],
        };
    }
    const checks = {
        minLength: passphrase.length >= PASSPHRASE_RULES.MIN_LENGTH,
        hasLower: /[a-z]/.test(passphrase),
        hasUpper: /[A-Z]/.test(passphrase),
        hasDigit: /[0-9]/.test(passphrase),
        hasSymbol: /[^a-zA-Z0-9]/.test(passphrase),
    };
    const categoriesCount =
        (checks.hasLower ? 1 : 0) + (checks.hasUpper ? 1 : 0) + (checks.hasDigit ? 1 : 0) + (checks.hasSymbol ? 1 : 0);
    const valid = checks.minLength && categoriesCount >= PASSPHRASE_RULES.MIN_CATEGORIES;

    // Score 0..5
    let score = 0;
    if (checks.minLength) score++;
    if (passphrase.length >= 16) score++;
    score += Math.min(3, categoriesCount);
    score = Math.min(5, score);

    const feedback: string[] = [];
    if (!checks.minLength) feedback.push(`passphrase too short (min ${PASSPHRASE_RULES.MIN_LENGTH})`);
    if (categoriesCount < PASSPHRASE_RULES.MIN_CATEGORIES) {
        feedback.push(`need at least ${PASSPHRASE_RULES.MIN_CATEGORIES} of: lower/upper/digit/symbol`);
    }

    return { score, valid, checks, feedback };
}

// ──────────────────────────────────────────────────────────────────────
// Rate limiter (5 attempts / 60s → lockout 5min) §T3
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide se uma tentativa é permitida e atualiza estado.
 */
export function tryAuthenticate(
    state: { attempts?: number[]; lockedUntil?: number },
    nowMs: number,
): { allowed: boolean; reason: string; state: { attempts: number[]; lockedUntil: number } } {
    const s: { attempts: number[]; lockedUntil: number } = state
        ? { attempts: state.attempts || [], lockedUntil: state.lockedUntil || 0 }
        : { attempts: [], lockedUntil: 0 };
    const now = Number(nowMs) || 0;

    // Se locked e ainda no prazo
    if (s.lockedUntil && now < s.lockedUntil) {
        return {
            allowed: false,
            reason: `locked_until:${s.lockedUntil}`,
            state: s,
        };
    }

    // Purgar tentativas antigas (fora da janela)
    const recentAttempts = (s.attempts || []).filter((t) => now - t <= RATE_LIMIT.WINDOW_MS);

    if (recentAttempts.length >= RATE_LIMIT.MAX_ATTEMPTS) {
        const lockedUntil = now + RATE_LIMIT.LOCKOUT_MS;
        return {
            allowed: false,
            reason: 'rate_limit_exceeded',
            state: { attempts: recentAttempts, lockedUntil },
        };
    }

    const nextAttempts = [...recentAttempts, now];
    return {
        allowed: true,
        reason: 'ok',
        state: {
            attempts: nextAttempts,
            lockedUntil: s.lockedUntil || 0,
        },
    };
}

/**
 * @returns ms restantes de lockout, 0 se não locked
 */
export function getLockoutRemainingMs(
    state: { lockedUntil?: number } | null | undefined,
    nowMs: number,
): number {
    if (!state || !state.lockedUntil) return 0;
    const remaining = state.lockedUntil - Number(nowMs || 0);
    return remaining > 0 ? remaining : 0;
}

/**
 * Reseta estado após sucesso.
 */
export function resetRateLimit(): { attempts: number[]; lockedUntil: number } {
    return { attempts: [], lockedUntil: 0 };
}

// ──────────────────────────────────────────────────────────────────────
// Captcha PoW (simples: encontrar nonce que hash(challenge+nonce) tem N leading zero bits)
// ──────────────────────────────────────────────────────────────────────

/**
 * Gera um token aleatório criptograficamente forte (hex) para o desafio PoW.
 * Auditoria 2026-06-26 (achado real R1): o default usava `Math.random()`, que é
 * PREVISÍVEL — para um desafio anti-abuso, um challenge previsível permite que o
 * atacante pré-compute nonces. Usa `crypto.getRandomValues` (CSPRNG) quando
 * disponível (browser/Node/Deno) e só cai p/ Math.random() se não houver crypto.
 */
function _secureChallengeToken(): string {
    const g = (typeof globalThis !== 'undefined' ? globalThis : {}) as {
        crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array };
    };
    if (g.crypto && typeof g.crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(12);
        g.crypto.getRandomValues(bytes);
        let hex = '';
        for (const b of bytes) hex += b.toString(16).padStart(2, '0');
        return hex;
    }
    // Fallback (ambiente sem WebCrypto): mantém funcionalidade, sinaliza degradação.
    return Math.random().toString(36).slice(2, 18);
}

/**
 * Gera desafio PoW.
 * @param difficulty - bits de zero esperados (default 12)
 * @param randomFn? - gerador injetável (testes); por padrão CSPRNG seguro.
 */
export function createCaptchaChallenge(
    difficulty: number = 12,
    randomFn?: () => string,
): { challenge: string; difficulty: number } {
    const rand = randomFn || _secureChallengeToken;
    return {
        challenge: rand(),
        difficulty: Math.max(4, Math.min(24, Number(difficulty) || 12)),
    };
}

/**
 * Verifica se um nonce satisfaz a dificuldade.
 * Implementação SHA-256 abstraída - passa função hash injetável para testes.
 *
 * @param challenge - retorna hex
 */
export function verifyCaptcha(
    challenge: string,
    nonce: string,
    difficulty: number,
    hashFn: (str: string) => string,
): boolean {
    if (typeof challenge !== 'string' || typeof nonce !== 'string') return false;
    if (typeof hashFn !== 'function') return false;
    const hex = hashFn(challenge + nonce);
    if (typeof hex !== 'string') return false;
    const binary = _hexToBinary(hex);
    const requiredZeros = Number(difficulty) || 0;
    return binary.slice(0, requiredZeros) === '0'.repeat(requiredZeros);
}

function _hexToBinary(hex: string): string {
    let out = '';
    for (const c of hex) {
        const n = parseInt(c, 16);
        if (Number.isFinite(n)) out += n.toString(2).padStart(4, '0');
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// Legacy key detection §Q1.2
// ──────────────────────────────────────────────────────────────────────

export function isLegacyKey(
    storedKey: { format?: string; kdf?: string; userIdMaterial?: boolean } | null | undefined,
): boolean {
    if (!storedKey || typeof storedKey !== 'object') return false;
    if (storedKey.format === KEY_FORMAT_VERSION.LEGACY) return true;
    if (storedKey.kdf === 'legacy') return true;
    // Sem format declarado + presença de userId como material → legacy
    if (!storedKey.format && storedKey.userIdMaterial === true) return true;
    return false;
}

export function filterLegacyKeys(
    keys: Array<{ format?: string; kdf?: string; userIdMaterial?: boolean }>,
): Array<{ format?: string; kdf?: string; userIdMaterial?: boolean }> {
    if (!Array.isArray(keys)) return [];
    return keys.filter(isLegacyKey);
}

// ──────────────────────────────────────────────────────────────────────
// PBKDF2 iteration selector §T3 (adaptive)
// ──────────────────────────────────────────────────────────────────────

/**
 * Dado um benchmark em ms para N iterações, calcula iterações alvo para
 * cumprir TARGET_MS (500ms) respeitando floor/ceiling.
 *
 * @param benchmarkMs - tempo em ms da rodada de benchmark
 * @param benchmarkIterations - iterações usadas no benchmark
 * @returns iterações recomendadas
 */
export function computeAdaptiveIterations(benchmarkMs: number, benchmarkIterations: number): number {
    const ms = Number(benchmarkMs);
    const iter = Number(benchmarkIterations);
    if (!Number.isFinite(ms) || ms <= 0 || !Number.isFinite(iter) || iter <= 0) {
        return KDF_CONFIG.DEFAULT_ITERATIONS;
    }
    const iterPerMs = iter / ms;
    const target = Math.round(iterPerMs * KDF_CONFIG.TARGET_MS);
    return Math.max(KDF_CONFIG.FLOOR_ITERATIONS, Math.min(KDF_CONFIG.CEILING_ITERATIONS, target));
}
