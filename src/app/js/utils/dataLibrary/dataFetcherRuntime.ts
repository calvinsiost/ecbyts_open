// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * dataFetcherRuntime — IP-DATA-CONSOL-001 M3.1
 *
 * Wire runtime entre `core/dataLibrary/_dataFetcherPure` (decisor) e
 * IDB + Supabase REST. Implementa cache-aside pattern com integrity hash.
 *
 * Fluxo:
 *   1. Lookup cache IDB (key: `ip-data:${catalogKey}:${version}`)
 *   2. decideFetch(ctx) — pure decision
 *   3. Action:
 *      - use_cache_fresh → return cached payload
 *      - use_cache_stale_offline → return cached payload + warning
 *      - fetch_remote → Supabase fetch → IDB set → return
 *      - denied_tier → throw TierAccessError
 *      - fail_no_data → throw OfflineNoDataError
 *
 * Não usado em boot crítico — feature flag CONFIG.FEATURES.IP_DATA_REMOTE
 * controla rollout (off por default em M3.1).
 */
import {
    decideFetch,
    buildCacheEntry,
    type CatalogMeta,
    type Tier,
    type FetchVerdict,
    type CacheEntry,
} from '../../core/dataLibrary/_dataFetcherPure.js';
import { idbSet, idbGet } from '../storage/idbStore.js';

const CACHE_KEY_PREFIX = 'ip-data';
const PAYLOAD_KEY_PREFIX = 'ip-data-payload';

export class TierAccessError extends Error {
    constructor(
        public readonly required: Tier,
        public readonly userHas: Tier,
    ) {
        super(`Tier ${required} required, user has ${userHas}`);
        this.name = 'TierAccessError';
    }
}

export class OfflineNoDataError extends Error {
    constructor(public readonly key: string) {
        super(`Offline with no cached data for ${key}`);
        this.name = 'OfflineNoDataError';
    }
}

export class IntegrityError extends Error {
    constructor(
        public readonly key: string,
        public readonly expectedHash: string,
        public readonly actualHash: string,
    ) {
        super(`Integrity mismatch for ${key}: expected ${expectedHash.slice(0, 8)}, got ${actualHash.slice(0, 8)}`);
        this.name = 'IntegrityError';
    }
}

export interface RuntimeDeps {
    /** Now in ms (injetável para tests + reprodutibilidade) */
    readonly now: () => number;
    /** Online status (navigator.onLine ou injected mock) */
    readonly isOnline: () => boolean;
    /** Tier do usuário corrente */
    readonly userTier: () => Tier;
    /** Fetch remoto: deve retornar { payload, hash } com hash do canonical JSON */
    readonly fetchRemote: (meta: CatalogMeta) => Promise<{ payload: unknown; hash: string }>;
    /** Cache get (default: IDB) */
    readonly cacheGet?: (key: string) => Promise<CacheEntry | null>;
    readonly cachePayloadGet?: (key: string) => Promise<unknown | null>;
    /** Cache set (default: IDB) */
    readonly cacheSet?: (key: string, entry: CacheEntry) => Promise<void>;
    readonly cachePayloadSet?: (key: string, payload: unknown) => Promise<void>;
}

const defaultCacheGet = async (key: string): Promise<CacheEntry | null> => {
    const v = await idbGet(`${CACHE_KEY_PREFIX}:${key}`);
    return v && typeof v === 'object' && 'hash' in v && 'version' in v && 'cached_at_ms' in v
        ? (v as CacheEntry)
        : null;
};

const defaultCachePayloadGet = async (key: string): Promise<unknown | null> => {
    return await idbGet(`${PAYLOAD_KEY_PREFIX}:${key}`);
};

const defaultCacheSet = async (key: string, entry: CacheEntry): Promise<void> => {
    await idbSet(`${CACHE_KEY_PREFIX}:${key}`, entry);
};

const defaultCachePayloadSet = async (key: string, payload: unknown): Promise<void> => {
    await idbSet(`${PAYLOAD_KEY_PREFIX}:${key}`, payload);
};

export interface FetchResult {
    readonly payload: unknown;
    readonly source: 'cache_fresh' | 'cache_stale_offline' | 'remote';
    readonly verdict: FetchVerdict;
}

/**
 * Helper pure: deriva a action e o caminho a executar a partir do contexto +
 * snapshot do cache. Não toca runtime.
 */
export function planFetch(
    meta: CatalogMeta,
    deps: { now: () => number; isOnline: () => boolean; userTier: () => Tier },
    cache: CacheEntry | null,
): FetchVerdict {
    return decideFetch({
        nowMs: deps.now(),
        userTier: deps.userTier(),
        cache,
        catalogMeta: meta,
        isOnline: deps.isOnline(),
    });
}

/**
 * Runtime principal — cache-aside com integrity verify.
 */
export async function fetchCatalog(meta: CatalogMeta, deps: RuntimeDeps): Promise<FetchResult> {
    const cacheGet = deps.cacheGet ?? defaultCacheGet;
    const cachePayloadGet = deps.cachePayloadGet ?? defaultCachePayloadGet;
    const cacheSet = deps.cacheSet ?? defaultCacheSet;
    const cachePayloadSet = deps.cachePayloadSet ?? defaultCachePayloadSet;

    const cacheKey = `${meta.key}:${meta.version}`;
    const cacheEntry = await cacheGet(cacheKey);
    const verdict = planFetch(meta, deps, cacheEntry);

    switch (verdict.action) {
        case 'denied_tier':
            throw new TierAccessError(verdict.required, verdict.userHas);

        case 'fail_no_data':
            throw new OfflineNoDataError(meta.key);

        case 'use_cache_fresh': {
            const payload = await cachePayloadGet(cacheKey);
            return Object.freeze({ payload, source: 'cache_fresh' as const, verdict });
        }

        case 'use_cache_stale_offline': {
            const payload = await cachePayloadGet(cacheKey);
            return Object.freeze({ payload, source: 'cache_stale_offline' as const, verdict });
        }

        case 'fetch_remote': {
            const { payload, hash } = await deps.fetchRemote(meta);
            if (hash !== meta.hash_sha256) {
                throw new IntegrityError(meta.key, meta.hash_sha256, hash);
            }
            const entry = buildCacheEntry(meta, deps.now());
            await cacheSet(cacheKey, entry);
            await cachePayloadSet(cacheKey, payload);
            return Object.freeze({ payload, source: 'remote' as const, verdict });
        }

        default: {
            // Exhaustive check — TS garante que nenhum verdict.action escape.
            const _exhaust: never = verdict;
            throw new Error(`Unhandled verdict: ${JSON.stringify(_exhaust)}`);
        }
    }
}
