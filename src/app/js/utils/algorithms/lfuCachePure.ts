// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — LFU cache O(1) (item 2). Pure-logic.

   Despeja o item MENOS FREQUENTEMENTE usado quando a capacidade estoura
   (desempate: o menos recente entre os de frequência mínima). Diferente do
   LRU (recência) e do SIEVE — útil quando popularidade importa mais que
   recência. get/set em O(1) amortizado (buckets de frequência + Set ordenado).

   Uso no ecbyts: cache de dados de referência consultados com frequências
   muito diferentes (ex.: thresholds CONAMA/CETESB, catálogos de unidades) —
   manter na memória os mais pedidos, não só os mais recentes.

   Determinístico. Ref: Shah, Mitra & Matani 2010, "An O(1) algorithm for
   implementing the LFU cache eviction scheme".
   ================================================================ */

export class LfuCache<K, V> {
    private readonly capacity: number;
    private readonly vals = new Map<K, V>();
    private readonly freqs = new Map<K, number>();
    private readonly buckets = new Map<number, Set<K>>(); // freq → chaves (ordem de inserção = recência)
    private minFreq = 0;

    constructor(capacity: number) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new RangeError('LfuCache: capacity deve ser inteiro ≥ 1');
        }
        this.capacity = capacity;
    }

    get size(): number {
        return this.vals.size;
    }

    has(key: K): boolean {
        return this.vals.has(key);
    }

    /** Lê o valor (conta como um acesso → sobe a frequência). undefined se ausente. */
    get(key: K): V | undefined {
        if (!this.vals.has(key)) return undefined;
        this.bump(key);
        return this.vals.get(key);
    }

    /** Insere/atualiza. Despeja o LFU (desempate LRU) se exceder a capacidade. */
    set(key: K, value: V): void {
        if (this.vals.has(key)) {
            this.vals.set(key, value);
            this.bump(key);
            return;
        }
        if (this.vals.size >= this.capacity) {
            this.evict();
        }
        this.vals.set(key, value);
        this.freqs.set(key, 1);
        this.bucketFor(1).add(key);
        this.minFreq = 1;
    }

    /** Chave que SERIA despejada agora (sem despejar) — útil p/ inspeção/teste. */
    peekEvictionCandidate(): K | undefined {
        const bucket = this.buckets.get(this.minFreq);
        if (!bucket || bucket.size === 0) return undefined;
        return bucket.values().next().value;
    }

    private bucketFor(freq: number): Set<K> {
        let b = this.buckets.get(freq);
        if (!b) {
            b = new Set<K>();
            this.buckets.set(freq, b);
        }
        return b;
    }

    private bump(key: K): void {
        const f = this.freqs.get(key)!;
        const cur = this.buckets.get(f)!;
        cur.delete(key);
        if (cur.size === 0) {
            this.buckets.delete(f);
            if (this.minFreq === f) this.minFreq = f + 1;
        }
        this.freqs.set(key, f + 1);
        this.bucketFor(f + 1).add(key);
    }

    private evict(): void {
        const bucket = this.buckets.get(this.minFreq);
        if (!bucket || bucket.size === 0) return;
        const victim = bucket.values().next().value as K; // primeiro = menos recente
        bucket.delete(victim);
        if (bucket.size === 0) this.buckets.delete(this.minFreq);
        this.vals.delete(victim);
        this.freqs.delete(victim);
    }
}
