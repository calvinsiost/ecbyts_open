// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F1 — Vector clocks / Lamport (item 29). Pure-logic.

   Detecta se dois eventos são causais (um antes do outro) ou CONCORRENTES
   (conflito que precisa de resolução: LWW item 33, CRDT item 32, etc.).
   Relevante p/ coordenação distribuída + chain-of-custody no ecbyts.

   Lamport clock = caso particular de um único contador. Aqui o vetor mapeia
   nó → contador. Imutável: toda operação retorna um novo objeto frozen.
   Determinístico; sem DOM/rede/relógio.
   Ref: Lamport 1978 (Time, Clocks, and the Ordering of Events).
   ================================================================ */

export type VectorClock = Readonly<Record<string, number>>;

export type ClockOrder = 'before' | 'after' | 'equal' | 'concurrent';

/** Relógio vazio (frozen). */
export function emptyClock(): VectorClock {
    return Object.freeze({});
}

/** Incrementa o contador do nó (novo objeto frozen). */
export function increment(vc: VectorClock | null | undefined, node: string): VectorClock {
    if (typeof node !== 'string' || node === '') {
        throw new TypeError('increment: node deve ser string não-vazia');
    }
    const base = vc && typeof vc === 'object' ? vc : {};
    return Object.freeze({ ...base, [node]: (base[node] ?? 0) + 1 });
}

/** Une dois relógios (máximo componente a componente) — novo objeto frozen. */
export function merge(a: VectorClock | null | undefined, b: VectorClock | null | undefined): VectorClock {
    const x = a && typeof a === 'object' ? a : {};
    const y = b && typeof b === 'object' ? b : {};
    const out: Record<string, number> = { ...x };
    for (const n of Object.keys(y)) {
        out[n] = Math.max(out[n] ?? 0, y[n] ?? 0);
    }
    return Object.freeze(out);
}

/**
 * Compara dois relógios:
 *  - 'before'     : a → b (a aconteceu-antes de b)
 *  - 'after'      : b → a
 *  - 'equal'      : idênticos
 *  - 'concurrent' : nem um nem outro domina (conflito)
 */
export function compare(a: VectorClock | null | undefined, b: VectorClock | null | undefined): ClockOrder {
    const x = a && typeof a === 'object' ? a : {};
    const y = b && typeof b === 'object' ? b : {};
    const nodes = new Set<string>([...Object.keys(x), ...Object.keys(y)]);
    let less = false;
    let greater = false;
    for (const n of nodes) {
        const xi = x[n] ?? 0;
        const yi = y[n] ?? 0;
        if (xi < yi) less = true;
        if (xi > yi) greater = true;
    }
    if (less && greater) return 'concurrent';
    if (less) return 'before';
    if (greater) return 'after';
    return 'equal';
}

/** True quando os eventos são concorrentes (precisam de resolução de conflito). */
export function isConcurrent(a: VectorClock, b: VectorClock): boolean {
    return compare(a, b) === 'concurrent';
}

/** True quando `a` aconteceu-antes de `b` (ou são iguais) — útil para ordenação parcial. */
export function happensBeforeOrEqual(a: VectorClock, b: VectorClock): boolean {
    const o = compare(a, b);
    return o === 'before' || o === 'equal';
}
