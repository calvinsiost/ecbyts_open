// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Version Manager - Item 9.59
 *
 * Client-side version resolver with multi-layer cache. Pure module
 * (dependency injection for fetch/storage). Source of truth is the
 * Supabase `system_versions` table (admin-managed), but clients go
 * through a cached edge function + localStorage to minimize round trips.
 *
 * Resolution order:
 *   1. In-memory cache (per session, 5 min TTL)
 *   2. localStorage cache (cross-session, 5 min TTL)
 *   3. Edge function /v1/version (60s server cache)
 *   4. Fallback to bundled constant (never null)
 *
 * Cache invalidation: Supabase Realtime broadcast on UPDATE to
 * system_versions clears the client cache. Fallback: 5 min TTL.
 *
 * Reference: docs/IMPLEMENTATION_ROADMAP.md §9.59
 */

// ============================================================================
// Constants
// ============================================================================

type ValidationResult = { ok: true } | { ok: false; field: string | null; reason: string };

export const VERSION_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
export const VERSION_STORAGE_KEY = 'ecbyts.version.cache';
export const VERSION_STATUS = Object.freeze(['draft', 'active', 'deprecated']);

// ============================================================================
// Shape validators
// ============================================================================

/**
 * Validate a version record (DB row or API response).
 */
export function validateVersionRecord(
    v: { version?: string; status?: string } | null | undefined,
): ValidationResult {
    if (!v || typeof v !== 'object') {
        return { ok: false, field: null, reason: 'not_object' };
    }
    if (typeof v.version !== 'string' || v.version.length === 0) {
        return { ok: false, field: 'version', reason: 'invalid_version' };
    }
    // Semver-ish: digits.digits.digits optionally followed by -suffix
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(v.version)) {
        return { ok: false, field: 'version', reason: 'invalid_format' };
    }
    if (v.status && !VERSION_STATUS.includes(v.status)) {
        return { ok: false, field: 'status', reason: 'invalid_status' };
    }
    return { ok: true };
}

// ============================================================================
// Semver comparison (no external deps)
// ============================================================================

type ParsedVersion = { nums: number[]; pre: string | null };

function parseVersion(s: string): ParsedVersion {
    const [core, pre] = s.split('-');
    const nums = (core ?? '').split('.').map((n: string) => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: pre || null };
}

function compareCoreNumbers(a: number[], b: number[]): number {
    for (let i = 0; i < 3; i++) {
        const an = a[i] ?? 0;
        const bn = b[i] ?? 0;
        if (an !== bn) {
            return an < bn ? -1 : 1;
        }
    }
    return 0;
}

function comparePreReleases(a: string | null, b: string | null): number {
    if (a && !b) return -1;
    if (!a && b) return 1;
    if (a && b) {
        if (a < b) return -1;
        if (a > b) return 1;
    }
    return 0;
}

/**
 * Compare two semver strings. Returns -1/0/1 like Array.sort comparator.
 */
export function compareVersions(a: string, b: string): number {
    if (a === b) return 0;
    if (typeof a !== 'string' || typeof b !== 'string') return 0;
    const A = parseVersion(a);
    const B = parseVersion(b);
    const core = compareCoreNumbers(A.nums, B.nums);
    if (core !== 0) return core;
    return comparePreReleases(A.pre, B.pre);
}

/**
 * Check if currentVersion satisfies minVersion (>= minVersion).
 * Used for min-version gating: bloquear clientes antigos.
 */
export function satisfiesMinVersion(currentVersion: string, minVersion: string): boolean {
    if (!currentVersion || !minVersion) return true; // No gate → allow
    return compareVersions(currentVersion, minVersion) >= 0;
}

// ============================================================================
// Cache layer
// ============================================================================

/**
 * Build a cache entry from a version record + timestamp.
 */
function buildCacheEntry(
    record: object,
    now: number = Date.now(),
): { record: object; fetchedAt: number; expiresAt: number } {
    return {
        record,
        fetchedAt: now,
        expiresAt: now + VERSION_CACHE_TTL_MS,
    };
}

/**
 * Check if a cache entry is still fresh.
 */
export function isCacheFresh(
    entry: { record?: any; expiresAt?: number } | null | undefined,
    now: number = Date.now(),
): boolean {
    if (!entry || typeof entry !== 'object') return false;
    if (!entry.record || typeof entry.expiresAt !== 'number') return false;
    return entry.expiresAt > now;
}

/**
 * Read version from localStorage cache. Returns null if missing/stale/invalid.
 */
export function readFromStorage(
    storage: { getItem?: (k: string) => string | null; removeItem?: (k: string) => void } | null | undefined,
): object | null {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
        const raw = storage.getItem(VERSION_STORAGE_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw);
        if (!isCacheFresh(entry)) {
            if (typeof storage.removeItem === 'function') {
                storage.removeItem(VERSION_STORAGE_KEY);
            }
            return null;
        }
        return entry.record;
    } catch (e) {
        const err = e as Error;
        console.debug('[versionManager] readStorage parse:', err?.message || e);
        return null;
    }
}

/**
 * Write version to localStorage cache.
 */
export function writeToStorage(
    storage: { setItem?: (k: string, v: string) => void } | null | undefined,
    record: object,
): boolean {
    if (!storage || typeof storage.setItem !== 'function') return false;
    try {
        const entry = buildCacheEntry(record);
        storage.setItem(VERSION_STORAGE_KEY, JSON.stringify(entry));
        return true;
    } catch (e) {
        const err = e as Error;
        console.debug('[versionManager] writeStorage:', err?.message || e);
        return false;
    }
}

/**
 * Clear the cached version (called on Realtime UPDATE broadcast).
 */
export function clearStorage(
    storage: { removeItem?: (k: string) => void } | null | undefined,
): void {
    if (!storage || typeof storage.removeItem !== 'function') return;
    try {
        storage.removeItem(VERSION_STORAGE_KEY);
    } catch (e) {
        const err = e as Error;
        console.debug('[versionManager] clearStorage:', err?.message || e);
        /* ignore */
    }
}

// ============================================================================
// Resolver (dependency-injected)
// ============================================================================

/**
 * Resolve the current version using a fallback chain.
 */
export async function resolveVersion(
    deps:
        | {
              storage?: any;
              fetchRemote?: () => Promise<object>;
              fallback?: object;
          }
        | null
        | undefined,
): Promise<{ record: object | null; source: 'storage' | 'remote' | 'fallback' | 'none' }> {
    if (!deps || typeof deps !== 'object') {
        return { record: null, source: 'none' };
    }

    // 1. Try localStorage
    const cached = readFromStorage(deps.storage);
    if (cached) {
        const v = validateVersionRecord(cached);
        if (v.ok) return { record: cached, source: 'storage' };
    }

    // 2. Try remote fetch
    if (typeof deps.fetchRemote === 'function') {
        try {
            const remote = await deps.fetchRemote();
            const v = validateVersionRecord(remote);
            if (v.ok) {
                writeToStorage(deps.storage, remote);
                return { record: remote, source: 'remote' };
            }
        } catch (e) {
            const err = e as Error;
            console.debug('[versionManager] fetchRemote:', err?.message || e);
            /* fall through to fallback */
        }
    }

    // 3. Bundled fallback (last resort - never null)
    if (deps.fallback) {
        const v = validateVersionRecord(deps.fallback);
        if (v.ok) return { record: deps.fallback, source: 'fallback' };
    }

    return { record: null, source: 'none' };
}
