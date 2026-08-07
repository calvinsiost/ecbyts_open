// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Jump consistent hash (item 8). Pure-logic.

   Mapeia uma chave para um de N "baldes" (buckets) de forma ESTÁVEL: ao
   aumentar N de k→k+1, só ~1/(k+1) das chaves migram (mínimo teórico). Não
   mantém tabela nem anel — é O(1) memória e O(ln N) tempo. Determinístico.

   Uso no ecbyts: distribuição estável de trabalho/itens em partições —
   ex.: atribuir abas de modelo / chaves de cache / tarefas de worker a um
   número variável de slots sem reembaralhar tudo quando o número muda.

   Patent-free (paper público). Ref: Lamping & Veach 2014,
   "A Fast, Minimal Memory, Consistent Hash Algorithm" (arXiv:1406.2294).
   ================================================================ */

const MASK64 = 0xffffffffffffffffn;
const LCG_MULT = 2862933555777941757n; // constante do paper
const TWO_POW_31 = 2147483648; // 2^31

/** FNV-1a 64-bit: string → chave de 64 bits (BigInt) determinística. */
export function hashStringToKey(s: string): bigint {
    if (typeof s !== 'string') {
        throw new TypeError('hashStringToKey: esperado string');
    }
    let h = 14695981039346656037n; // offset basis 64-bit
    const prime = 1099511628211n;
    for (let i = 0; i < s.length; i++) {
        h ^= BigInt(s.charCodeAt(i) & 0xff);
        h = (h * prime) & MASK64;
    }
    return h;
}

/**
 * Jump consistent hash: retorna o índice do balde em [0, numBuckets-1].
 * @param key  chave numérica de 64 bits (number inteiro ou bigint)
 * @param numBuckets  quantidade de baldes (inteiro ≥ 1)
 */
export function jumpConsistentHash(key: bigint | number, numBuckets: number): number {
    if (!Number.isInteger(numBuckets) || numBuckets <= 0) {
        throw new RangeError('jumpConsistentHash: numBuckets deve ser inteiro ≥ 1');
    }
    let k = typeof key === 'bigint' ? key : BigInt(Math.trunc(Number(key) || 0));
    k &= MASK64; // normaliza p/ 64-bit unsigned
    const n = BigInt(numBuckets);
    let b = -1n;
    let j = 0n;
    while (j < n) {
        b = j;
        k = (k * LCG_MULT + 1n) & MASK64;
        const denom = Number((k >> 33n) + 1n);
        j = BigInt(Math.floor((Number(b) + 1) * (TWO_POW_31 / denom)));
    }
    return Number(b);
}

/** Conveniência: jump hash a partir de uma chave string (FNV-1a → jump). */
export function jumpHashString(key: string, numBuckets: number): number {
    return jumpConsistentHash(hashStringToKey(key), numBuckets);
}
