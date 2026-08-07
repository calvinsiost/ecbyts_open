// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Preset Offline Cache Decision — pure logic (RF18 / B13 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET).
 *
 * Decides — given a cached preset snapshot (timestamp + payload hash),
 * current online/offline status, and TTL policy — whether the caller
 * should use the cached payload, fetch fresh from registry, or fall
 * back to the canonical seeded preset.
 *
 * Pure: caller persists the cache via IDB/Supabase; module orchestrates
 * the decision. Never touches IDB / network.
 *
 * Decision verdicts:
 *   - `use_cache_fresh`       cache age < TTL → use it
 *   - `use_cache_stale`       offline AND cache exists but age ≥ TTL → use it with warning
 *   - `fetch_fresh`           online AND cache age ≥ TTL → fetch from registry
 *   - `fallback_canonical`    no cache + offline → use seeded canonical (if id is canonical)
 *   - `fail_no_data`          no cache + offline + non-canonical id → caller surfaces error
 *
 * Tests live in `tests/compliance-offline-cache-decision-pure.test.mjs`.
 */

export interface CacheSnapshot {
    readonly presetId: string;
    /** ISO-8601 of when the snapshot was written. */
    readonly cachedAt: string;
    /** Optional content hash for integrity check (RF15). */
    readonly contentHash?: string;
}

export interface CacheDecisionInput {
    readonly presetId: string;
    /** Caller's cached snapshot, if any. */
    readonly cache?: CacheSnapshot | null;
    /** ISO-8601 "now" for deterministic testing. */
    readonly nowIso: string;
    /** TTL in milliseconds (default 1 hour). */
    readonly ttlMs?: number;
    /** True when navigator reports online (caller passes navigator.onLine). */
    readonly isOnline: boolean;
    /** True when `presetId` is one of the 5 canonical seeded presets. */
    readonly isCanonicalSeed: boolean;
}

export type CacheVerdict =
    | 'use_cache_fresh'
    | 'use_cache_stale'
    | 'fetch_fresh'
    | 'fallback_canonical'
    | 'fail_no_data';

export interface CacheDecisionVM {
    readonly verdict: CacheVerdict;
    /** Age of the cached snapshot in ms (null when no cache). */
    readonly cacheAgeMs: number | null;
    /** True when the verdict is one that requires the caller to show a "stale" badge. */
    readonly showsStaleWarning: boolean;
    /** True when the verdict produces a usable payload (caller can render). */
    readonly hasUsablePayload: boolean;
    /** i18n key explaining the verdict for tooltip/log. */
    readonly reasonKey: string;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

const REASON: Readonly<Record<CacheVerdict, string>> = Object.freeze({
    use_cache_fresh: 'compliance.cache.useFresh',
    use_cache_stale: 'compliance.cache.useStaleOffline',
    fetch_fresh: 'compliance.cache.fetchOnline',
    fallback_canonical: 'compliance.cache.fallbackCanonical',
    fail_no_data: 'compliance.cache.failNoData',
});

const VERDICT_FLAGS: Readonly<Record<CacheVerdict, Readonly<{ showsStaleWarning: boolean; hasUsablePayload: boolean }>>> = Object.freeze({
    use_cache_fresh: { showsStaleWarning: false, hasUsablePayload: true },
    use_cache_stale: { showsStaleWarning: true, hasUsablePayload: true },
    fetch_fresh: { showsStaleWarning: false, hasUsablePayload: true },
    fallback_canonical: { showsStaleWarning: true, hasUsablePayload: true },
    fail_no_data: { showsStaleWarning: false, hasUsablePayload: false },
});

function isValidIso(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0 && Number.isFinite(Date.parse(v));
}

function freezeVm(vm: CacheDecisionVM): CacheDecisionVM {
    return Object.freeze({ ...vm });
}

function buildVm(verdict: CacheVerdict, cacheAgeMs: number | null): CacheDecisionVM {
    const flags = VERDICT_FLAGS[verdict];
    return freezeVm({
        verdict,
        cacheAgeMs,
        showsStaleWarning: flags.showsStaleWarning,
        hasUsablePayload: flags.hasUsablePayload,
        reasonKey: REASON[verdict],
    });
}

function normalizeTtl(inputTtl: unknown): number {
    return Number.isFinite(inputTtl) && (inputTtl as number) > 0 ? (inputTtl as number) : DEFAULT_TTL_MS;
}

function resolveNoCacheVerdict(input: CacheDecisionInput): CacheVerdict {
    if (input.isOnline) return 'fetch_fresh';
    if (input.isCanonicalSeed === true) return 'fallback_canonical';
    return 'fail_no_data';
}

function resolveStaleVerdict(input: CacheDecisionInput, _ageMs: number): CacheVerdict {
    if (input.isOnline) return 'fetch_fresh';
    return 'use_cache_stale';
}

interface ValidatedCache {
    readonly cache: CacheSnapshot;
    readonly ageMs: number;
}

function validateInput(input: CacheDecisionInput | null | undefined): CacheDecisionInput | null {
    if (!input || typeof input !== 'object') return null;
    if (typeof input.presetId !== 'string' || input.presetId.length === 0) return null;
    if (!isValidIso(input.nowIso)) return null;
    return input;
}

function findUsableCache(input: CacheDecisionInput): ValidatedCache | null {
    const cache = input.cache && typeof input.cache === 'object' ? input.cache : null;
    if (!cache || !isValidIso(cache.cachedAt) || cache.presetId !== input.presetId) return null;
    const ageMs = Math.max(0, Date.parse(input.nowIso) - Date.parse(cache.cachedAt));
    return { cache, ageMs };
}

/**
 * Decide what to do with the cached preset given current state. Pure +
 * frozen verdict.
 */
export function decideCacheUsage(input: CacheDecisionInput | null | undefined): CacheDecisionVM {
    const validInput = validateInput(input);
    if (!validInput) return buildVm('fail_no_data', null);

    const ttl = normalizeTtl(validInput.ttlMs);
    const usable = findUsableCache(validInput);

    if (!usable) {
        return buildVm(resolveNoCacheVerdict(validInput), null);
    }

    if (usable.ageMs < ttl) {
        return buildVm('use_cache_fresh', usable.ageMs);
    }

    return buildVm(resolveStaleVerdict(validInput, usable.ageMs), usable.ageMs);
}

/**
 * Convenience — `true` when the caller should refresh from registry.
 */
export function shouldFetchFresh(vm: CacheDecisionVM | null | undefined): boolean {
    return !!vm && vm.verdict === 'fetch_fresh';
}

/**
 * Convenience — `true` when the caller has SOMETHING to render (cache or fallback).
 */
export function hasRenderableData(vm: CacheDecisionVM | null | undefined): boolean {
    return !!vm && vm.hasUsablePayload;
}
