// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Cache - Phase 37 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S37
 *
 * Phase 37 (2026-05-02) - pure-logic LRU cache com TTL para resultados
 * de pipeline steps. Suporta:
 *   - LRU eviction quando capacity reached
 *   - TTL (time-to-live) por entry
 *   - cacheKey deterministic (libraryId + config hash)
 *   - hitRate / missRate tracking
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    capacity: 100,
    ttlMs: 60_000, // 1 min
});

/** Identidade do módulo. */
export const CACHE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 37,
    deliveredAt: '2026-05-02',
});

/**
 * FNV-1a hash 32-bit (deterministic, fast).
 *
 * @param {string} s
 * @returns {string} hex
 */
import { fnv1aHash as _fnv1aHashUint, fnv1aHashHex as _fnv1aHashHex } from '../../../utils/helpers/hashFnv1a.js';
export function fnv1aHash(s: string): string {
    if (typeof s !== 'string') return '0';
    // Preserva semântica legacy: hex SEM padding (offset basis '811c9dc5' tem 8 chars
    // mas hashes pequenos podem ter <8). _fnv1aHashHex pad para 8; aqui mantemos legacy.
    return _fnv1aHashUint(s).toString(16);
}

/**
 * Cria cache key deterministic a partir de libraryId + config.
 *
 * @param {string} libraryId
 * @param {Object} [config]
 * @returns {string}
 */
export function buildCacheKey(libraryId: string, config: object = {}): string {
    if (typeof libraryId !== 'string') libraryId = 'unknown';
    let configStr: string;
    try {
        configStr = JSON.stringify(config || {});
    } catch {
        configStr = '';
    }
    return `${libraryId}:${fnv1aHash(configStr)}`;
}

/**
 * Cria cache state inicial frozen.
 *
 * @param {Object} [config]
 * @returns {Object}
 */
export function createCache(config: any = {}): object {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    return Object.freeze({
        capacity: Number.isInteger(cfg.capacity) && cfg.capacity > 0 ? cfg.capacity : DEFAULT_CONFIG.capacity,
        ttlMs: Number.isFinite(cfg.ttlMs) && cfg.ttlMs >= 0 ? cfg.ttlMs : DEFAULT_CONFIG.ttlMs,
        entries: Object.freeze([]), // [{ key, value, insertedAt, lastAccessedAt }]
        stats: Object.freeze({ hits: 0, misses: 0, evictions: 0 }),
    });
}

/**
 * Verifica se entry expirou.
 */
export function isExpired(entry: any, ttlMs: any, now: any): boolean {
    if (!entry || !Number.isFinite(entry.insertedAt)) return true;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return false;
    if (!Number.isFinite(now)) now = Date.now();
    return now - entry.insertedAt >= ttlMs;
}

/**
 * Lê valor do cache (null se miss/expired). Atualiza lastAccessedAt.
 *
 * @param {Record<string, any>} cache
 * @param {string} any>
 * @param {number} [key]
 * @returns {{cache: any, value: any, hit: boolean}}
 */
export function get(
    cache: Record<string, any>,
    key: string,
    now?: number,
): { cache: any; value: any; hit: boolean } {
    if (!cache || typeof key !== 'string') {
        return { cache, value: null, hit: false };
    }
    if (!Number.isFinite(now)) now = Date.now();
    const entry = cache.entries.find((e: any) => e && e.key === key);
    if (!entry) {
        return Object.freeze({
            cache: Object.freeze({
                ...cache,
                stats: Object.freeze({ ...cache.stats, misses: cache.stats.misses + 1 }),
            }),
            value: null,
            hit: false,
        });
    }
    if (isExpired(entry, cache.ttlMs, now)) {
        // Remove expired + count miss
        const newEntries = cache.entries.filter((e: any) => e.key !== key);
        return Object.freeze({
            cache: Object.freeze({
                ...cache,
                entries: Object.freeze(newEntries),
                stats: Object.freeze({ ...cache.stats, misses: cache.stats.misses + 1 }),
            }),
            value: null,
            hit: false,
        });
    }
    // Hit: bump lastAccessedAt
    const updated = cache.entries.map((e: any) =>
        e.key === key ? Object.freeze({ ...e, lastAccessedAt: now }) : e,
    );
    return Object.freeze({
        cache: Object.freeze({
            ...cache,
            entries: Object.freeze(updated),
            stats: Object.freeze({ ...cache.stats, hits: cache.stats.hits + 1 }),
        }),
        value: entry.value,
        hit: true,
    });
}

/**
 * Escreve valor no cache. Aplica LRU eviction se necessário.
 *
 * @param {Record<string, any>} cache
 * @param {string} any>
 * @param {*} key
 * @param {number} [value]
 * @returns {Object} novo cache
 */
export function set(cache: Record<string, any>, key: string, value: any, now?: number): object {
    if (!cache || typeof key !== 'string') return cache;
    if (!Number.isFinite(now)) now = Date.now();
    let entries = cache.entries.filter((e: any) => e.key !== key);
    let evictions = cache.stats.evictions;
    // LRU eviction: se ao adicionar excede capacity, remove o mais antigo (lastAccessedAt)
    while (entries.length >= cache.capacity) {
        let oldestIdx = 0;
        let oldest = entries[0]?.lastAccessedAt ?? 0;
        for (let i = 1; i < entries.length; i++) {
            if ((entries[i]?.lastAccessedAt ?? 0) < oldest) {
                oldest = entries[i].lastAccessedAt;
                oldestIdx = i;
            }
        }
        entries = entries.filter((_: any, i: any) => i !== oldestIdx);
        evictions++;
    }
    entries.push(Object.freeze({ key, value, insertedAt: now, lastAccessedAt: now }));
    return Object.freeze({
        ...cache,
        entries: Object.freeze(entries),
        stats: Object.freeze({ ...cache.stats, evictions }),
    });
}

/**
 * Remove entry específica.
 */
export function remove(cache: any, key: any) {
    if (!cache) return cache;
    return Object.freeze({
        ...cache,
        entries: Object.freeze(cache.entries.filter((e: any) => e.key !== key)),
    });
}

/**
 * Limpa todas entries.
 */
export function clear(cache: any) {
    if (!cache) return cache;
    return Object.freeze({
        ...cache,
        entries: Object.freeze([]),
    });
}

/**
 * Remove todas entries expiradas.
 */
export function pruneExpired(cache: any, now: any) {
    if (!cache) return cache;
    if (!Number.isFinite(now)) now = Date.now();
    const valid = cache.entries.filter((e: any) => !isExpired(e, cache.ttlMs, now));
    if (valid.length === cache.entries.length) return cache;
    return Object.freeze({
        ...cache,
        entries: Object.freeze(valid),
    });
}

/**
 * Computa hit rate.
 */
export function hitRate(cache: any) {
    if (!cache || !cache.stats) return 0;
    const total = cache.stats.hits + cache.stats.misses;
    if (total === 0) return 0;
    return cache.stats.hits / total;
}

/**
 * Sumariza cache state.
 */
export function summarizeCache(cache: any) {
    const empty = {
        size: 0,
        capacity: 0,
        utilization: 0,
        hits: 0,
        misses: 0,
        evictions: 0,
        hitRate: 0,
    };
    if (!cache) return empty;
    return Object.freeze({
        size: cache.entries.length,
        capacity: cache.capacity,
        utilization: cache.capacity > 0 ? cache.entries.length / cache.capacity : 0,
        hits: cache.stats?.hits || 0,
        misses: cache.stats?.misses || 0,
        evictions: cache.stats?.evictions || 0,
        hitRate: hitRate(cache),
    });
}

/**
 * Module identity export.
 */
export const pipelineCacheMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 37,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_CONFIG',
        'CACHE_META',
        'fnv1aHash',
        'buildCacheKey',
        'createCache',
        'isExpired',
        'get',
        'set',
        'remove',
        'clear',
        'pruneExpired',
        'hitRate',
        'summarizeCache',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
