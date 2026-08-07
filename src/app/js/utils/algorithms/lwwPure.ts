// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Last-write-wins register (item 33). Pure-logic.

   Resolve conflito de escrita concorrente escolhendo deterministicamente o
   valor com MAIOR timestamp. Empate de timestamp é desempatado pelo nodeId
   (lexicográfico) — garante convergência: todas as réplicas decidem igual.

   Pareia com vectorClockPure (item 29): o vetor DETECTA concorrência; o LWW
   RESOLVE escolhendo um vencedor. É um CRDT de registro (estado convergente).

   Uso no ecbyts: merge offline→online (syncQueue, IDB) e colaboração
   multi-aba quando duas edições do mesmo campo colidem — em vez de perder
   silenciosamente, escolhe-se o vencedor de forma reproduzível e auditável.

   Ref: Shapiro et al. 2011, "Conflict-free Replicated Data Types" (SSS 2011).
   ================================================================ */

export interface LwwRegister<T> {
    readonly value: T;
    readonly timestamp: number;
    readonly nodeId: string;
}

/** Cria um registro LWW frozen. */
export function lwwRegister<T>(value: T, timestamp: number, nodeId: string): LwwRegister<T> {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
        throw new TypeError('lwwRegister: timestamp deve ser número finito');
    }
    if (typeof nodeId !== 'string' || nodeId === '') {
        throw new TypeError('lwwRegister: nodeId deve ser string não-vazia');
    }
    return Object.freeze({ value, timestamp, nodeId });
}

/**
 * True quando `a` vence `b` (a é mais recente). Maior timestamp vence; empate
 * → maior nodeId (lexicográfico). Total order determinística.
 */
export function lwwWins<T>(a: LwwRegister<T>, b: LwwRegister<T>): boolean {
    if (a.timestamp !== b.timestamp) return a.timestamp > b.timestamp;
    return a.nodeId > b.nodeId;
}

/**
 * Une dois registros: retorna o vencedor (sempre um dos dois, frozen).
 * Comutativo, associativo e idempotente → convergente.
 */
export function lwwMerge<T>(a: LwwRegister<T>, b: LwwRegister<T>): LwwRegister<T> {
    return lwwWins(a, b) ? a : b;
}

/**
 * Aplica uma nova escrita ao registro. Só sobrescreve se a escrita vencer o
 * estado atual (write antigo/atrasado é ignorado — last-write-wins real).
 */
export function lwwSet<T>(
    current: LwwRegister<T>,
    value: T,
    timestamp: number,
    nodeId: string,
): LwwRegister<T> {
    return lwwMerge(current, lwwRegister(value, timestamp, nodeId));
}
