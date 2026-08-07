// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — SIEVE cache (substituto PERMISSIVO do ARC, item 3).

   ARC (item 3) é coberto por patente (US6996676B2). SIEVE (NSDI'24, Best Paper)
   é a alternativa permissiva moderna: patent-free (paper acadêmico aberto),
   "mais simples que LRU", e com até ~63% menos miss-ratio que ARC.

   Algoritmo: uma lista FIFO (ordem de inserção) + um bit "visited" por item +
   um ponteiro "hand". get() marca visited=true. A remoção varre a partir da hand
   em direção ao mais novo: se visited → zera o bit e segue; se não-visited →
   é a vítima. Implementação inline (zero dependência → zero risco de licença).

   Ref: Zhang et al., "SIEVE is Simpler than LRU", NSDI'24.
   Estável: O(1) amortizado; determinístico; sem DOM/rede.
   ================================================================ */

interface SieveNode<K, V> {
    key: K;
    value: V;
    visited: boolean;
    prev: SieveNode<K, V> | null; // em direção ao HEAD (mais novo)
    next: SieveNode<K, V> | null; // em direção ao TAIL (mais antigo)
}

export class SieveCache<K, V> {
    private map = new Map<K, SieveNode<K, V>>();
    private head: SieveNode<K, V> | null = null; // mais novo (inserção aqui)
    private tail: SieveNode<K, V> | null = null; // mais antigo
    private hand: SieveNode<K, V> | null = null;

    constructor(private readonly capacity: number) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new Error('SieveCache: capacity deve ser inteiro > 0');
        }
    }

    get size(): number {
        return this.map.size;
    }

    has(key: K): boolean {
        return this.map.has(key);
    }

    get(key: K): V | undefined {
        const node = this.map.get(key);
        if (!node) return undefined;
        node.visited = true; // segunda chance
        return node.value;
    }

    set(key: K, value: V): void {
        const existing = this.map.get(key);
        if (existing) {
            existing.value = value;
            existing.visited = true;
            return;
        }
        if (this.map.size >= this.capacity) this.evict();
        const node: SieveNode<K, V> = { key, value, visited: false, prev: null, next: this.head };
        if (this.head) this.head.prev = node;
        this.head = node;
        if (!this.tail) this.tail = node;
        this.map.set(key, node);
    }

    private unlink(node: SieveNode<K, V>): void {
        if (node.prev) node.prev.next = node.next;
        else this.head = node.next;
        if (node.next) node.next.prev = node.prev;
        else this.tail = node.prev;
        node.prev = node.next = null;
    }

    private evict(): void {
        // Varre da hand em direção ao HEAD (.prev); ao passar do head, volta ao tail.
        let cur = this.hand ?? this.tail;
        let guard = 0;
        const cap = this.map.size * 2 + 2; // anti-loop (todos visited zeram em 1 passada)
        while (cur && cur.visited && guard++ < cap) {
            cur.visited = false;
            cur = cur.prev ?? this.tail;
        }
        if (!cur) return; // cache vazio (não deveria ocorrer quando cheio)
        // Próximo ponto de varredura (em direção ao head; volta ao tail no fim).
        this.hand = cur.prev ?? this.tail;
        this.unlink(cur);
        this.map.delete(cur.key);
        if (this.hand === cur) this.hand = this.tail; // segurança
    }
}
