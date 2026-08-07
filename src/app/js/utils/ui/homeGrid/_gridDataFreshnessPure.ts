// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 (gridIdentity/gridMarketplace data layer — lógica pura)
 * — decisão PURA de frescor de cache compartilhada pelos painéis de
 * identidade/reputação (`_ensureReputationData`) e marketplace
 * (`_ensureMarketplaceData`) da home. claude (refactor) 2026-06-18.
 *
 * EN: Pure cache-freshness decision for the home grid async data loaders. Both
 *     `_ensureReputationData` (S2 identity/reputation slice) and
 *     `_ensureMarketplaceData` (S3 marketplace slice) in homeGrid.ts duplicated
 *     the EXACT same control flow:
 *       1. no user            → return the empty payload, do not fetch;
 *       2. user changed       → the per-user cache must be discarded (reset)
 *                               before evaluating freshness;
 *       3. cache fresh (now - fetchedAt < ttl) for the SAME user → serve cache;
 *       4. a fetch already in flight for the SAME user → join it;
 *       5. otherwise          → start a fresh fetch.
 *     This module isolates that decision as a deterministic verdict so the barrel
 *     only wires the actual async fetch + cache mutation. Behaviour is IDENTICAL
 *     to the legacy inline blocks — same TTL comparison (strict `<`), same
 *     user-change reset semantics, same in-flight join keyed by userId.
 *
 * PT (leigo): decide, sem tela nem rede, o que fazer quando a tela inicial
 *     precisa dos dados de reputação ou do marketplace de um usuário:
 *       - sem usuário logado → nem busca, devolve vazio;
 *       - trocou de usuário → joga fora o cache do usuário anterior;
 *       - cache ainda "fresco" (menos de 1 min) → usa o cache;
 *       - já tem uma busca acontecendo para o mesmo usuário → espera ela;
 *       - senão → faz uma busca nova.
 *     Quem realmente busca na rede e guarda o cache é o homeGrid; aqui só
 *     decidimos qual caminho seguir. É a MESMA lógica que estava embutida (e
 *     duplicada) no monolito, agora isolada e testável.
 *
 * Pure: entradas → veredito congelado, determinístico. Cheap tests:
 * tests/ui/homeGrid/grid-data-freshness.test.mjs.
 */

/** Ação que o loader deve tomar dado o estado atual do cache. */
export type DataFreshnessAction =
    | 'empty' // sem userId → devolver payload vazio, não buscar
    | 'serve_cache' // cache do mesmo usuário ainda dentro do TTL
    | 'join_in_flight' // já existe busca em andamento para o mesmo usuário
    | 'fetch_fresh'; // iniciar uma busca nova

/** Veredito puro do frescor de cache. */
export interface DataFreshnessVerdict {
    /** O que o loader deve fazer. */
    readonly action: DataFreshnessAction;
    /**
     * `true` quando o usuário pedido difere do dono atual do cache — o loader
     * deve descartar (resetar) o cache do usuário anterior ANTES de buscar.
     * Espelha `_resetReputationCacheForUser` / `_resetMarketplaceCacheForUser`.
     */
    readonly resetCache: boolean;
    /** Motivo legível (auditoria/observabilidade). */
    readonly reason: string;
}

/** Estado de entrada para a decisão (tudo já lido pelo chamador, sem efeitos). */
export interface DataFreshnessState {
    /** Usuário cujo dado está sendo solicitado. */
    readonly requestedUserId: unknown;
    /** Dono atual do cache (último usuário cujo dado foi cacheado). */
    readonly cacheUserId: unknown;
    /** Há payload cacheado em memória? */
    readonly hasCache: boolean;
    /** Timestamp (ms) em que o cache foi preenchido. */
    readonly fetchedAt: number;
    /** "Agora" em ms (injetado para determinismo nos testes). */
    readonly now: number;
    /** TTL do cache em ms. */
    readonly ttl: number;
    /** Usuário da busca em andamento, se houver (senão null/undefined). */
    readonly inFlightUserId: unknown;
}

/**
 * Decide o que fazer com base no estado do cache — espelha exatamente o fluxo
 * inline duplicado em `_ensureReputationData` / `_ensureMarketplaceData`.
 *
 * Ordem de precedência (idêntica ao legado):
 *   1. sem userId → 'empty' (antes de qualquer reset/cache);
 *   2. resetCache = (requestedUserId !== cacheUserId) — o legado roda o reset
 *      ANTES de checar TTL/in-flight, então após reset o cache/in-flight do
 *      usuário antigo não conta mais;
 *   3. cache fresco do MESMO usuário (não resetado) → 'serve_cache';
 *   4. busca em andamento para o MESMO usuário (não resetado) → 'join_in_flight';
 *   5. senão → 'fetch_fresh'.
 *
 * @param {DataFreshnessState} state estado lido pelo chamador
 * @returns {DataFreshnessVerdict} veredito congelado
 */
export function decideDataFreshness(state: DataFreshnessState): DataFreshnessVerdict {
    const { requestedUserId, cacheUserId, hasCache, fetchedAt, now, ttl, inFlightUserId } = state;

    // (1) Sem usuário → vazio. Espelha `if (!userId) return <empty>;` no topo,
    //     antes de qualquer reset. Falsy (null/undefined/'' /0) = sem usuário.
    if (!requestedUserId) {
        return freeze({
            action: 'empty',
            resetCache: false,
            reason: 'no_user',
        });
    }

    // (2) Troca de usuário → o cache do usuário anterior deve ser descartado.
    //     O legado faz isso em `_reset*CacheForUser` ANTES de avaliar frescor;
    //     logo, após o reset o cache e o in-flight do usuário antigo somem.
    const resetCache = requestedUserId !== cacheUserId;

    // Após o reset (conceitual), só o cache/in-flight do usuário ATUAL conta.
    const cacheUsableForUser = hasCache && !resetCache;
    const inFlightForUser = inFlightUserId === requestedUserId && !resetCache;

    // (3) Cache fresco do mesmo usuário dentro do TTL (comparação estrita `<`).
    if (cacheUsableForUser && now - fetchedAt < ttl) {
        return freeze({
            action: 'serve_cache',
            resetCache,
            reason: 'cache_fresh',
        });
    }

    // (4) Busca em andamento para o mesmo usuário → juntar-se a ela.
    if (inFlightForUser) {
        return freeze({
            action: 'join_in_flight',
            resetCache,
            reason: 'in_flight_join',
        });
    }

    // (5) Buscar dado novo.
    return freeze({
        action: 'fetch_fresh',
        resetCache,
        reason: resetCache ? 'fetch_after_user_change' : 'fetch_stale_or_cold',
    });
}

/** Congela rasamente o veredito para impedir mutação acidental pelo chamador. */
function freeze(v: DataFreshnessVerdict): DataFreshnessVerdict {
    return Object.freeze(v);
}
