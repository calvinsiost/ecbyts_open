// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Quorum R+W>N (item 28). Pure-logic.

   Em um sistema com N réplicas, exigir que o conjunto de leitura (R) e o de
   escrita (W) se SOBREPONHAM garante consistência forte: toda leitura
   enxerga a última escrita. A condição clássica é R + W > N (Gifford 1979).

   Determinístico; sem rede. São predicados/derivações puras sobre contagens —
   o ecbyts não tem réplicas de servidor, mas o mesmo cálculo modela:
   confirmações multi-aba (BroadcastChannel) antes de considerar uma escrita
   "comprometida", e tolerância a falha em coletas redundantes de sensores.

   Ref: Gifford 1979, "Weighted Voting for Replicated Data" (SOSP 1979).
   ================================================================ */

export interface QuorumConfig {
    readonly n: number; // total de réplicas/participantes
    readonly r: number; // tamanho do quórum de leitura
    readonly w: number; // tamanho do quórum de escrita
}

/** Valida e congela uma configuração de quórum. */
export function quorumConfig(n: number, r: number, w: number): QuorumConfig {
    for (const [name, v] of [['n', n], ['r', r], ['w', w]] as const) {
        if (!Number.isInteger(v) || v < 0) {
            throw new RangeError(`quorumConfig: ${name} deve ser inteiro ≥ 0`);
        }
    }
    if (r > n || w > n) {
        throw new RangeError('quorumConfig: r e w não podem exceder n');
    }
    return Object.freeze({ n, r, w });
}

/** R+W>N → leitura e escrita se sobrepõem (consistência forte de leitura). */
export function isStronglyConsistent(cfg: QuorumConfig): boolean {
    return cfg.r + cfg.w > cfg.n;
}

/** W>N/2 → escritas se sobrepõem entre si (sem escritas concorrentes "cegas"). */
export function hasWriteOverlap(cfg: QuorumConfig): boolean {
    return cfg.w * 2 > cfg.n;
}

/** Menor R que garante sobreposição dado W e N: n - w + 1 (clamp ≥ 1). */
export function minReadQuorum(w: number, n: number): number {
    if (!Number.isInteger(w) || !Number.isInteger(n) || w < 0 || n < 0 || w > n) {
        throw new RangeError('minReadQuorum: w,n inteiros 0..n');
    }
    return Math.max(1, n - w + 1);
}

/** True quando o nº de confirmações atinge o quórum exigido. */
export function hasQuorum(acks: number, required: number): boolean {
    if (!Number.isInteger(acks) || acks < 0) {
        throw new RangeError('hasQuorum: acks deve ser inteiro ≥ 0');
    }
    return acks >= required;
}

export interface QuorumVerdict {
    readonly committed: boolean;
    readonly acks: number;
    readonly required: number;
    readonly missing: number; // quantas confirmações ainda faltam (0 se ok)
}

/**
 * Decide se uma operação (read|write) atingiu seu quórum, dado o nº de
 * confirmações recebidas. Verdict frozen com a lacuna (`missing`).
 */
export function decideQuorum(cfg: QuorumConfig, kind: 'read' | 'write', acks: number): QuorumVerdict {
    if (kind !== 'read' && kind !== 'write') {
        throw new RangeError("decideQuorum: kind deve ser 'read' ou 'write'");
    }
    if (!Number.isInteger(acks) || acks < 0) {
        throw new RangeError('decideQuorum: acks deve ser inteiro ≥ 0');
    }
    const required = kind === 'read' ? cfg.r : cfg.w;
    const committed = acks >= required;
    return Object.freeze({
        committed,
        acks,
        required,
        missing: committed ? 0 : required - acks,
    });
}
