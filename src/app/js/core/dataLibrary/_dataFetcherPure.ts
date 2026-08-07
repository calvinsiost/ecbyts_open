// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * _dataFetcherPure — IP-DATA-CONSOL-001 M3
 *
 * Pure-logic decision engine para fetch de catálogos IP (Supabase).
 * NUNCA toca DOM/IDB/network — apenas decide ação baseado em cache state + tier.
 *
 * Wire runtime: `utils/dataLibrary/dataFetcherRuntime.ts` (M3.1) chama o
 * pure decisor e executa a ação (IDB get/set, fetch Supabase, etc).
 *
 * ADRs aplicados (SPEC_IP_DATA_CONSOLIDATION_CLI_TO_SUPABASE.md §10):
 *  - A4: cache IDB com TTL diferenciado (regulatórios 24h, voláteis 1h)
 *  - A5/A10: signed URL Storage com `cacheNonce = hash` reusable (warm CDN)
 *  - A6: canonical JSON hash para integrity check
 */

export type DatasetCategory = 'regulatory' | 'scientific' | 'geo' | 'model' | 'fixture';

export type Tier = 'free' | 'pro' | 'enterprise';

export type DatasetKey = `${DatasetCategory}.${string}`;

export interface CatalogMeta {
    readonly key: DatasetKey;
    readonly category: DatasetCategory;
    readonly tier_required: Tier;
    readonly version: string;
    readonly hash_sha256: string;
    readonly ttl_ms?: number; // override por categoria
}

export interface CacheEntry {
    readonly hash: string;
    readonly cached_at_ms: number;
    readonly version: string;
}

export interface FetchContext {
    readonly nowMs: number;
    readonly userTier: Tier;
    readonly cache: CacheEntry | null;
    readonly catalogMeta: CatalogMeta;
    readonly isOnline: boolean;
}

export type FetchVerdict =
    | { readonly action: 'use_cache_fresh'; readonly reason: 'within_ttl_hash_match' }
    | { readonly action: 'use_cache_stale_offline'; readonly reason: 'offline_with_cache' }
    | { readonly action: 'fetch_remote'; readonly reason: 'cache_miss' | 'ttl_expired' | 'hash_mismatch' }
    | { readonly action: 'denied_tier'; readonly required: Tier; readonly userHas: Tier }
    | { readonly action: 'fail_no_data'; readonly reason: 'offline_no_cache' };

const TIER_ORDER: Record<Tier, number> = Object.freeze({ free: 0, pro: 1, enterprise: 2 });

const DEFAULT_TTL_BY_CATEGORY: Record<DatasetCategory, number> = Object.freeze({
    regulatory: 24 * 60 * 60 * 1000, // 24h — mudam raramente
    scientific: 24 * 60 * 60 * 1000, // 24h
    geo: 60 * 60 * 1000, // 1h — datasets dinâmicos
    model: 7 * 24 * 60 * 60 * 1000, // 7d — modelos 3D mudam pouco
    fixture: 60 * 60 * 1000, // 1h
});

export function isTierSufficient(userTier: Tier, required: Tier): boolean {
    return TIER_ORDER[userTier] >= TIER_ORDER[required];
}

export function resolveTtlMs(meta: CatalogMeta): number {
    if (typeof meta.ttl_ms === 'number' && meta.ttl_ms > 0) return meta.ttl_ms;
    return DEFAULT_TTL_BY_CATEGORY[meta.category];
}

export function isCacheFresh(cache: CacheEntry | null, meta: CatalogMeta, nowMs: number): boolean {
    if (!cache) return false;
    if (cache.hash !== meta.hash_sha256) return false; // integrity mismatch
    if (cache.version !== meta.version) return false; // versão nova
    const age = nowMs - cache.cached_at_ms;
    return age >= 0 && age < resolveTtlMs(meta);
}

/**
 * Decisor principal — pure, sem side effects.
 *
 * Ordem de decisão:
 * 1. Tier gate — usuário tem permissão para o catálogo?
 * 2. Cache fresh? (TTL + hash match + version match) → use_cache_fresh
 * 3. Offline?
 *    - com cache (mesmo stale) → use_cache_stale_offline
 *    - sem cache → fail_no_data
 * 4. Online: cache_miss | ttl_expired | hash_mismatch → fetch_remote
 */
export function decideFetch(ctx: FetchContext): FetchVerdict {
    const { catalogMeta, userTier, cache, isOnline, nowMs } = ctx;

    // 1. Tier gate
    if (!isTierSufficient(userTier, catalogMeta.tier_required)) {
        return Object.freeze({
            action: 'denied_tier',
            required: catalogMeta.tier_required,
            userHas: userTier,
        });
    }

    // 2. Cache fresh
    if (isCacheFresh(cache, catalogMeta, nowMs)) {
        return Object.freeze({
            action: 'use_cache_fresh',
            reason: 'within_ttl_hash_match',
        });
    }

    // 3. Offline path
    if (!isOnline) {
        if (cache) {
            return Object.freeze({
                action: 'use_cache_stale_offline',
                reason: 'offline_with_cache',
            });
        }
        return Object.freeze({
            action: 'fail_no_data',
            reason: 'offline_no_cache',
        });
    }

    // 4. Online — escolher razão para fetch
    let reason: 'cache_miss' | 'ttl_expired' | 'hash_mismatch' = 'cache_miss';
    if (cache) {
        if (cache.hash !== catalogMeta.hash_sha256) {
            reason = 'hash_mismatch';
        } else if (cache.version !== catalogMeta.version) {
            reason = 'hash_mismatch';
        } else {
            const age = nowMs - cache.cached_at_ms;
            if (age >= resolveTtlMs(catalogMeta)) reason = 'ttl_expired';
        }
    }
    return Object.freeze({
        action: 'fetch_remote',
        reason,
    });
}

/**
 * Helper p/ Storage signed URL warm-cache pattern (ADR A10).
 * Gera `cacheNonce = hash` query param — assim Smart CDN trata cada
 * version como URL única, mas URLs com mesmo hash reusam cache edge warm.
 */
export function buildSignedUrlNonce(meta: CatalogMeta): string {
    return meta.hash_sha256.slice(0, 16);
}

/**
 * Helper p/ persistir entry de cache após fetch bem-sucedido.
 */
export function buildCacheEntry(meta: CatalogMeta, nowMs: number): CacheEntry {
    return Object.freeze({
        hash: meta.hash_sha256,
        version: meta.version,
        cached_at_ms: nowMs,
    });
}
