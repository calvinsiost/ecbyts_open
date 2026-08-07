// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Feature Flags Resolver - Item 9.58
 *
 * Pure module implementing the multi-dimensional precedence chain for
 * feature flag evaluation. Matches spec Q2 precedence:
 *
 *   User allowlist  >  Organization  >  Rollout %  >  User tier  >
 *   Region  >  Environment  >  Default (OFF)
 *
 * Call `resolveFlag(flagDefinition, context)` with the current user
 * context to get a boolean + reason. The resolver is stateless - caller
 * is responsible for caching (spec Q3 mentions Redis/Edge cache with
 * 5 min TTL as the production implementation).
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.58
 */

// ============================================================================
// Constants
// ============================================================================

export interface FlagDefinition {
    key: string;
    enabled: boolean;
    environments?: Array<string>;
    tiers?: Array<string>;
    regions?: Array<string>;
    allowlistUserIds?: Array<string>;
    blocklistUserIds?: Array<string>;
    allowlistOrgIds?: Array<string>;
    rolloutPercent?: number;
    startAt?: string | null;
    endAt?: string | null;
    dependsOn?: Array<string>;
}

export interface UserContext {
    userId: string;
    orgId?: string | null;
    tier?: string;
    role?: string;
    region?: string;
    environment?: string;
    now?: number | Date;
}

export interface FlagResult {
    enabled: boolean;
    reason: string;
}

export type DependencyResolver = (key: string, ctx: UserContext) => FlagResult;

type ValidationResult = { ok: true } | { ok: false; field: string | null; reason: string };

export const FLAG_ENVIRONMENTS = Object.freeze(['dev', 'staging', 'production']);
export const FLAG_USER_TIERS = Object.freeze(['free', 'pro', 'enterprise']);
export const FLAG_USER_ROLES = Object.freeze(['admin', 'editor', 'viewer']);
export const FLAG_REGIONS = Object.freeze(['BR', 'US', 'EU', 'OTHER']);

// ============================================================================
// Validators
// ============================================================================

/**
 * Validate a flag definition (DB row or JSON config).
 */
export function validateFlagDefinition(flag: FlagDefinition | any): ValidationResult {
    if (!flag || typeof flag !== 'object') {
        return { ok: false, field: null, reason: 'not_object' };
    }
    const f: Record<string, any> = flag;
    if (typeof f.key !== 'string' || f.key.length < 1 || f.key.length > 100) {
        return { ok: false, field: 'key', reason: 'invalid_key' };
    }
    if (!/^[a-z0-9_.]+$/i.test(f.key)) {
        return { ok: false, field: 'key', reason: 'invalid_format' };
    }
    if (typeof f.enabled !== 'boolean') {
        return { ok: false, field: 'enabled', reason: 'must_be_boolean' };
    }
    if (f.rolloutPercent != null) {
        const pct = Number(f.rolloutPercent);
        if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            return { ok: false, field: 'rolloutPercent', reason: 'out_of_range' };
        }
    }
    for (const fname of ['environments', 'tiers', 'regions']) {
        if (f[fname] != null && !Array.isArray(f[fname])) {
            return { ok: false, field: fname, reason: 'must_be_array' };
        }
    }
    return { ok: true };
}

/**
 * Validate a user context (the "who is this" bag passed to resolveFlag).
 */
export function validateUserContext(ctx: UserContext | any): ValidationResult {
    if (!ctx || typeof ctx !== 'object') {
        return { ok: false, field: null, reason: 'not_object' };
    }
    const c: Record<string, any> = ctx;
    if (!c.userId || typeof c.userId !== 'string') {
        return { ok: false, field: 'userId', reason: 'missing' };
    }
    if (c.tier && !FLAG_USER_TIERS.includes(c.tier)) {
        return { ok: false, field: 'tier', reason: 'invalid' };
    }
    if (c.environment && !FLAG_ENVIRONMENTS.includes(c.environment)) {
        return { ok: false, field: 'environment', reason: 'invalid' };
    }
    return { ok: true };
}

// ============================================================================
// Deterministic hash for stable rollout bucketing
// ============================================================================

/**
 * Deterministic hash of (userId + flagKey) → integer in [0, 100).
 * Used for rollout percentage bucketing: a user always gets the same
 * bucket for a given flag across sessions, so rollout is stable.
 *
 * Simple fnv-1a variant - good enough for uniform distribution across
 * 100 buckets. Not cryptographic, not collision-resistant, but stable
 * and fast. No WebCrypto dependency → runs anywhere.
 */
export function hashBucket(userId: string, flagKey: string): number {
    const input = `${userId || ''}|${flagKey || ''}`;
    let hash = 2166136261; // FNV offset basis
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619); // FNV prime
    }
    // Convert to positive unsigned int then modulo 100
    return Math.abs(hash | 0) % 100;
}

// ============================================================================
// Resolution (precedence chain)
// ============================================================================

/**
 * Resolve a flag for a user context. Returns { enabled, reason } where
 * reason is the precedence rule that decided the outcome.
 *
 * Precedence (highest wins):
 *   1. blocklist (always OFF)
 *   2. allowlist userId (always ON)
 *   3. allowlist orgId (always ON)
 *   4. master enabled=false → OFF
 *   5. date window (startAt/endAt)
 *   6. environment constraint
 *   7. tier constraint
 *   8. region constraint
 *   9. dependencies satisfied
 *  10. rollout percentage via hashBucket
 *
 * @param flag - Flag definition
 * @param ctx - User context
 * @param resolveDependency - Recursive resolver for deps
 */
export function resolveFlag(
    flag: FlagDefinition,
    ctx: UserContext,
    resolveDependency: DependencyResolver | null = null,
): FlagResult {
    const flagCheck = validateFlagDefinition(flag);
    if (!flagCheck.ok) {
        return { enabled: false, reason: `invalid_flag:${flagCheck.reason}` };
    }
    const ctxCheck = validateUserContext(ctx);
    if (!ctxCheck.ok) {
        return { enabled: false, reason: `invalid_context:${ctxCheck.reason}` };
    }

    // 1. Blocklist always wins
    if (Array.isArray(flag.blocklistUserIds) && flag.blocklistUserIds.includes(ctx.userId)) {
        return { enabled: false, reason: 'blocklisted' };
    }

    // 2. User allowlist
    if (Array.isArray(flag.allowlistUserIds) && flag.allowlistUserIds.includes(ctx.userId)) {
        return { enabled: true, reason: 'user_allowlist' };
    }

    // 3. Org allowlist
    if (ctx.orgId && Array.isArray(flag.allowlistOrgIds) && flag.allowlistOrgIds.includes(ctx.orgId)) {
        return { enabled: true, reason: 'org_allowlist' };
    }

    // 4. Master switch
    if (flag.enabled === false) {
        return { enabled: false, reason: 'master_off' };
    }

    // 5. Date window
    const now = ctx.now instanceof Date ? ctx.now.getTime() : (ctx.now ?? Date.now());
    if (flag.startAt) {
        const start = new Date(flag.startAt).getTime();
        if (Number.isFinite(start) && now < start) {
            return { enabled: false, reason: 'before_start' };
        }
    }
    if (flag.endAt) {
        const end = new Date(flag.endAt).getTime();
        if (Number.isFinite(end) && now > end) {
            return { enabled: false, reason: 'after_end' };
        }
    }

    // 6. Environment constraint (empty array = all environments)
    if (Array.isArray(flag.environments) && flag.environments.length > 0) {
        if (!flag.environments.includes(ctx.environment as string)) {
            return { enabled: false, reason: 'environment_not_allowed' };
        }
    }

    // 7. Tier constraint
    if (Array.isArray(flag.tiers) && flag.tiers.length > 0) {
        if (!flag.tiers.includes(ctx.tier as string)) {
            return { enabled: false, reason: 'tier_not_allowed' };
        }
    }

    // 8. Region constraint
    if (Array.isArray(flag.regions) && flag.regions.length > 0) {
        if (!flag.regions.includes(ctx.region as string)) {
            return { enabled: false, reason: 'region_not_allowed' };
        }
    }

    // 9. Dependencies (all must be enabled)
    if (Array.isArray(flag.dependsOn) && flag.dependsOn.length > 0) {
        if (typeof resolveDependency !== 'function') {
            return { enabled: false, reason: 'dependency_resolver_missing' };
        }
        for (const dep of flag.dependsOn) {
            const depResult = resolveDependency(dep, ctx);
            if (!depResult?.enabled) {
                return { enabled: false, reason: `dependency_off:${dep}` };
            }
        }
    }

    // 10. Rollout percentage
    if (flag.rolloutPercent != null && flag.rolloutPercent < 100) {
        if (flag.rolloutPercent <= 0) {
            return { enabled: false, reason: 'rollout_zero' };
        }
        const bucket = hashBucket(ctx.userId, flag.key);
        if (bucket >= flag.rolloutPercent) {
            return { enabled: false, reason: 'rollout_above_bucket' };
        }
        return { enabled: true, reason: 'rollout_included' };
    }

    // All gates passed → enabled
    return { enabled: true, reason: 'all_conditions_met' };
}

/**
 * Resolve all flags in a flagSet at once. Returns a map of key → {enabled, reason}.
 * Dependency resolution is wired automatically via closure capture.
 */
export function resolveFlagSet(
    flags: Array<FlagDefinition>,
    ctx: UserContext,
): Record<string, FlagResult> {
    const empty: Record<string, FlagResult> = {};
    if (!Array.isArray(flags)) return empty;
    const byKey = new Map<string, FlagDefinition>();
    for (const f of flags) {
        if (f && f.key) byKey.set(f.key, f);
    }

    // Memoize to avoid recomputing shared deps; detect cycles
    const results: Record<string, FlagResult> = {};
    const inProgress = new Set<string>();

    const resolve = (key: string, context: UserContext): FlagResult => {
        const existing = results[key];
        if (existing) return existing;
        if (inProgress.has(key)) {
            return { enabled: false, reason: 'cycle_detected' };
        }
        const flag = byKey.get(key);
        if (!flag) return { enabled: false, reason: 'flag_not_found' };
        inProgress.add(key);
        const r = resolveFlag(flag, context, resolve);
        inProgress.delete(key);
        results[key] = r;
        return r;
    };

    for (const f of flags) {
        if (f && f.key) resolve(f.key, ctx);
    }
    return results;
}
