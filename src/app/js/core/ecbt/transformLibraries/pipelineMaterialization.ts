// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Materialization - Phase 58 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S58
 *
 * Phase 58 (2026-05-02) - pure-logic materialização de pipeline lazy:
 * thunks pendentes são "forçados" sob demanda + memoização opcional
 * por step.
 *
 * NÃO depende de browser. Sem Promise/setTimeout - execução síncrona.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const MATERIALIZATION_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 58,
    deliveredAt: '2026-05-02',
});

export interface ThunkSpec {
    id: string;
    compute: (input: any) => any;
    memoize?: boolean;
}

export interface Thunk {
    id: string;
    compute: (input: any) => any;
    memoize: boolean;
}

export interface MaterializationStats {
    hits: number;
    misses: number;
    errors: number;
}

export interface MaterializationStore {
    cache: Readonly<Record<string, any>>;
    stats: Readonly<MaterializationStats>;
}

export interface ForceResult {
    store: MaterializationStore;
    value: any;
    error: string | null;
}

export interface ThunkResult {
    id: string;
    value: any;
    error: string | null;
}

/**
 * Cria thunk frozen.
 */
export function createThunk(spec: ThunkSpec): Thunk {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createThunk: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createThunk: id required');
    }
    if (typeof spec.compute !== 'function') {
        throw new TypeError('createThunk: compute fn required');
    }
    return Object.freeze({
        id: spec.id,
        compute: spec.compute,
        memoize: spec.memoize !== false,
    });
}

/**
 * Cria store de materialização frozen.
 */
export function createStore(): MaterializationStore {
    return Object.freeze({
        cache: Object.freeze({}),
        stats: Object.freeze({ hits: 0, misses: 0, errors: 0 }),
    });
}

/**
 * Força thunk + atualiza store.
 */
export function force(store: MaterializationStore, thunk: Thunk, input?: any): ForceResult {
    if (!store || !thunk) return { store, value: null, error: 'invalid' } as ForceResult;
    if (thunk.memoize && thunk.id in store.cache) {
        return Object.freeze({
            store: Object.freeze({
                ...store,
                stats: Object.freeze({ ...store.stats, hits: store.stats.hits + 1 }),
            }),
            value: store.cache[thunk.id],
            error: null,
        });
    }
    let value: any;
    let error: string | null;
    try {
        value = thunk.compute(input);
    } catch (e: any) {
        error = String(e?.message || e || 'unknown');
        return Object.freeze({
            store: Object.freeze({
                ...store,
                stats: Object.freeze({ ...store.stats, errors: store.stats.errors + 1 }),
            }),
            value: null,
            error,
        });
    }
    const nextCache = thunk.memoize
        ? Object.freeze({ ...store.cache, [thunk.id]: value })
        : store.cache;
    return Object.freeze({
        store: Object.freeze({
            ...store,
            cache: nextCache,
            stats: Object.freeze({ ...store.stats, misses: store.stats.misses + 1 }),
        }),
        value,
        error: null,
    });
}

/**
 * Materializa lista de thunks em ordem.
 */
export function materializeAll(
    store: MaterializationStore,
    thunks: ReadonlyArray<Thunk> | null | undefined,
    input?: any,
): { store: MaterializationStore; results: ReadonlyArray<ThunkResult> } {
    if (!store || !Array.isArray(thunks)) {
        return { store, results: Object.freeze([]) as ReadonlyArray<ThunkResult> };
    }
    const results: ThunkResult[] = [];
    let cur = store;
    for (const t of thunks) {
        const r = force(cur, t, input);
        cur = r.store;
        results.push(Object.freeze({ id: t.id, value: r.value, error: r.error }));
    }
    return Object.freeze({
        store: cur,
        results: Object.freeze(results) as ReadonlyArray<ThunkResult>,
    });
}

/**
 * Invalidar cache por id.
 */
export function invalidate(store: MaterializationStore, id: string): MaterializationStore {
    if (!store || typeof id !== 'string') return store;
    if (!(id in store.cache)) return store;
    const next = { ...store.cache };
    delete next[id];
    return Object.freeze({ ...store, cache: Object.freeze(next) });
}

/**
 * Limpar todo cache.
 */
export function clearCache(store: MaterializationStore): MaterializationStore {
    if (!store) return store;
    return Object.freeze({ ...store, cache: Object.freeze({}) });
}

/**
 * Sumariza store.
 */
export function summarizeStore(store: MaterializationStore | null | undefined): any {
    const empty = { cached: 0, hits: 0, misses: 0, errors: 0, hitRate: 0 };
    if (!store) return empty;
    const hits = store.stats?.hits || 0;
    const misses = store.stats?.misses || 0;
    const total = hits + misses;
    return Object.freeze({
        cached: Object.keys(store.cache || {}).length,
        hits,
        misses,
        errors: store.stats?.errors || 0,
        hitRate: total > 0 ? hits / total : 0,
    });
}

/**
 * Module identity export.
 */
export const pipelineMaterializationMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 58,
    deliveredAt: '2026-05-02',
    exports: [
        'MATERIALIZATION_META',
        'createThunk',
        'createStore',
        'force',
        'materializeAll',
        'invalidate',
        'clearCache',
        'summarizeStore',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
