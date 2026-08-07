// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PASSPHRASE POLICY — SPEC_RECONCILIATION_001_LLM_KEYS

   Pure helpers para política de passphrase e migration de chaves LLM:
   - Strength meter (5 níveis: too_weak → strong)
   - Minimum requirements §T3: 12+ chars, 3 categorias
   - Rate limiting tracker §T3: 5 tentativas/60s + lockout 5min
   - Key migration state machine (legacy → deprecated → removed)
   - Key stretching benchmark params §T3: floor 300k, ceiling 2M

   Sem Web Crypto (só políticas) — crypto real fica em client.js.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Constants §T3 + §Q1.3
// ──────────────────────────────────────────────────────────────────────

export const MIN_LENGTH = 12;
export const MIN_CATEGORIES = 3;
export const STRENGTH_LEVELS = Object.freeze(['too_weak', 'weak', 'fair', 'good', 'strong']);

export const CHAR_CATEGORIES = Object.freeze(['lowercase', 'uppercase', 'digit', 'symbol']);

export const RATE_LIMIT_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const LOCKOUT_DURATION_MS = 5 * 60_000; // 5 min

export const PBKDF2_ITERATIONS_FLOOR = 300_000;
export const PBKDF2_ITERATIONS_DEFAULT = 600_000;
export const PBKDF2_ITERATIONS_CEILING = 2_000_000;
export const PBKDF2_TARGET_DERIVE_MS = 500;

export const KEY_KDF_MODES = Object.freeze(['legacy', 'passphrase']);

export const MIGRATION_STATES = Object.freeze(['legacy', 'deprecated', 'migrated', 'removed']);

export const KEY_STATUS = Object.freeze({
    LOCAL: 'local', // 🔒
    SYNCED: 'synced', // ☁️
    LEGACY: 'legacy', // ⚠️
    REMOVED: 'removed',
});

// ──────────────────────────────────────────────────────────────────────
// Category detection
// ──────────────────────────────────────────────────────────────────────

/**
 * Detecta quais categorias de caracteres a passphrase cobre.
 *
 * @param passphrase
 * @returns subset de CHAR_CATEGORIES
 */
export function detectCategories(passphrase: string): string[] {
    if (typeof passphrase !== 'string' || passphrase.length === 0) return [];
    const categories = new Set<string>();
    if (/[a-z]/.test(passphrase)) categories.add('lowercase');
    if (/[A-Z]/.test(passphrase)) categories.add('uppercase');
    if (/[0-9]/.test(passphrase)) categories.add('digit');
    if (/[^a-zA-Z0-9]/.test(passphrase)) categories.add('symbol');
    return Array.from(categories);
}

// ──────────────────────────────────────────────────────────────────────
// Strength meter §5 levels
// ──────────────────────────────────────────────────────────────────────

/**
 * Classifica força da passphrase em 5 níveis.
 * Heurística: length + categorias + entropia aproximada.
 *
 * @param passphrase
 */
export function classifyStrength(passphrase: string): {
    level: string;
    score: number;
    length: number;
    categories: string[];
    meets_minimum: boolean;
} {
    const pass = typeof passphrase === 'string' ? passphrase : '';
    const categories = detectCategories(pass);
    const len = pass.length;

    // Score calculation (0-100)
    let score = 0;
    if (len >= 8) score += 10;
    if (len >= 12) score += 20;
    if (len >= 16) score += 15;
    if (len >= 20) score += 10;
    score += Math.min(categories.length * 10, 40);
    if (len >= MIN_LENGTH && categories.length >= MIN_CATEGORIES) score += 5;

    let level;
    if (score < 20) level = 'too_weak';
    else if (score < 40) level = 'weak';
    else if (score < 60) level = 'fair';
    else if (score < 80) level = 'good';
    else level = 'strong';

    return {
        level,
        score: Math.min(score, 100),
        length: len,
        categories,
        meets_minimum: len >= MIN_LENGTH && categories.length >= MIN_CATEGORIES,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Validator §T3
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida passphrase contra política mínima.
 *
 * @param passphrase
 * @param opts
 */
export function validatePassphrase(
    passphrase: string,
    opts: { min_length?: number; min_categories?: number } = {},
): { valid: boolean; errors: string[] } {
    const errors = [];
    const minLen = Number.isFinite(opts?.min_length) ? (opts.min_length as number) : MIN_LENGTH;
    const minCats = Number.isFinite(opts?.min_categories) ? (opts.min_categories as number) : MIN_CATEGORIES;

    if (typeof passphrase !== 'string') {
        return { valid: false, errors: ['passphrase deve ser string'] };
    }
    if (passphrase.length < minLen) {
        errors.push(`mínimo ${minLen} caracteres`);
    }
    const categories = detectCategories(passphrase);
    if (categories.length < minCats) {
        errors.push(`mínimo ${minCats} categorias de caracteres (minúscula/maiúscula/dígito/símbolo)`);
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Rate limiting §T3
// ──────────────────────────────────────────────────────────────────────

/**
 * Dado histórico de tentativas, decide se usuário está bloqueado.
 *
 * @param attempts - cronológicas
 * @param nowMs
 * @param opts
 */
export function checkRateLimit(
    attempts: Array<{ timestamp: number; success: boolean }>,
    nowMs: number,
    opts: { maxAttempts?: number; windowMs?: number; lockoutMs?: number } = {},
): { locked: boolean; remaining_ms: number; recent_failures: number } {
    const maxAttempts = opts?.maxAttempts || RATE_LIMIT_ATTEMPTS;
    const windowMs = opts?.windowMs || RATE_LIMIT_WINDOW_MS;
    const lockoutMs = opts?.lockoutMs || LOCKOUT_DURATION_MS;

    if (!Array.isArray(attempts) || attempts.length === 0) {
        return { locked: false, remaining_ms: 0, recent_failures: 0 };
    }

    const windowStart = Number(nowMs) - windowMs;
    const recentFailures = attempts.filter((a) => a && a.success === false && Number(a.timestamp) >= windowStart);

    if (recentFailures.length < maxAttempts) {
        return { locked: false, remaining_ms: 0, recent_failures: recentFailures.length };
    }

    // Bloqueado: procura última tentativa falhada para computar remaining
    const lastFailure = recentFailures[recentFailures.length - 1]!;
    const lockoutEnd = Number(lastFailure.timestamp) + lockoutMs;
    const remaining = Math.max(0, lockoutEnd - Number(nowMs));

    return {
        locked: remaining > 0,
        remaining_ms: remaining,
        recent_failures: recentFailures.length,
    };
}

// ──────────────────────────────────────────────────────────────────────
// PBKDF2 iterations tuning §T3
// ──────────────────────────────────────────────────────────────────────

/**
 * Calcula iterações ótimas dado tempo de benchmark observado.
 * Escalona linearmente: if 100k iterations took T ms, aim for N such that N × (T/100k) ≈ target.
 *
 * @param benchmarkIterations - iterações executadas no benchmark
 * @param benchmarkMs - tempo em ms observado
 * @param opts
 * @returns iterações ideais
 */
export function tuneIterations(
    benchmarkIterations: number,
    benchmarkMs: number,
    opts: { targetMs?: number; floor?: number; ceiling?: number } = {},
): number {
    const target = opts?.targetMs || PBKDF2_TARGET_DERIVE_MS;
    const floor = opts?.floor || PBKDF2_ITERATIONS_FLOOR;
    const ceiling = opts?.ceiling || PBKDF2_ITERATIONS_CEILING;

    if (!Number.isFinite(benchmarkIterations) || benchmarkIterations <= 0) return PBKDF2_ITERATIONS_DEFAULT;
    if (!Number.isFinite(benchmarkMs) || benchmarkMs <= 0) return PBKDF2_ITERATIONS_DEFAULT;

    const ratio = target / benchmarkMs;
    const tuned = Math.round(benchmarkIterations * ratio);

    if (tuned < floor) return floor;
    if (tuned > ceiling) return ceiling;
    return tuned;
}

// ──────────────────────────────────────────────────────────────────────
// Migration state machine §Q1.2
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide estado de migração de uma chave baseado em kdf_mode + current_release.
 *
 * @param input
 * @returns MIGRATION_STATES
 */
export function classifyMigrationState(
    input: { kdf_mode: string; last_migrated_release?: number; current_release: number } | null | undefined,
): string {
    if (!input || typeof input !== 'object') return 'legacy';
    if (input.kdf_mode === 'passphrase') return 'migrated';
    if (input.kdf_mode === 'legacy') {
        // Deprecar 2 releases após current
        const current = Number(input.current_release) || 0;
        const cutoff = current + 2;
        const lastMigrated = Number(input.last_migrated_release) || 0;
        if (lastMigrated >= cutoff) return 'removed';
        return 'legacy';
    }
    return 'legacy';
}

/**
 * Transição de migration states: legacy → deprecated → migrated → removed.
 *
 * @param currentState
 * @param event - 'deprecate' | 'migrate' | 'remove' | 'restore'
 */
export function transitionMigrationState(currentState: string, event: string): string {
    const valid: Record<string, Record<string, string>> = {
        legacy: { deprecate: 'deprecated', migrate: 'migrated' },
        deprecated: { migrate: 'migrated', remove: 'removed' },
        migrated: { restore: 'legacy' },
        removed: {},
    };
    const transitions = valid[currentState] || {};
    return transitions[event] || currentState;
}

// ──────────────────────────────────────────────────────────────────────
// Reset builder (forgot passphrase)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida confirmação de reset: usuário digitou "REMOVER" em caps.
 *
 * @param confirmation
 */
export function isValidResetConfirmation(confirmation: string): boolean {
    return typeof confirmation === 'string' && confirmation.trim() === 'REMOVER';
}

/**
 * Build payload de evento para reset audit.
 *
 * @param input
 * @param nowMs
 */
export function buildResetEvent(
    input: { userId?: string; keyCount: number; reason?: string } | null | undefined,
    nowMs?: number,
): object | null {
    if (!input || typeof input !== 'object') return null;
    return {
        event: 'llm_keys_reset_all',
        user_id: input.userId || null,
        key_count_removed: Number(input.keyCount) || 0,
        reason: input.reason || 'forgot_passphrase',
        timestamp: nowMs ? new Date(nowMs).toISOString() : new Date().toISOString(),
    };
}
