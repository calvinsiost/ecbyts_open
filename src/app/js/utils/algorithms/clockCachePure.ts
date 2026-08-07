// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Clock / Second-Chance cache (item 5). Pure-logic.

   Aproximação barata do LRU: cada slot tem um "bit de referência". Um ponteiro
   ("ponteiro do relógio") percorre os slots em círculo; ao precisar despejar,
   se o bit está ligado dá uma "segunda chance" (zera o bit e avança); se está
   desligado, despeja. Custo O(1) amortizado, sem listas encadeadas pesadas.

   Uso no ecbyts: cache de objetos com custo de manter bit por item baixo —
   ex.: páginas/tiles de terreno, fragmentos de modelo — onde LRU exato seria
   caro mas recência aproximada basta.

   Determinístico. Ref: Corbató 1968 (clock/second-chance, MULTICS).
   ================================================================ */

export class ClockCache<K, V> {
    private readonly capacity: number;
    private readonly keys: (K | undefined)[];
    private readonly vals: (V | undefined)[];
    private readonly ref: boolean[];
    private readonly index = new Map<K, number>(); // chave → slot
    private hand = 0;
    private filled = 0;

    constructor(capacity: number) {
        if (!Number.isInteger(capacity) || capacity <= 0) {
            throw new RangeError('ClockCache: capacity deve ser inteiro ≥ 1');
        }
        this.capacity = capacity;
        this.keys = new Array(capacity).fill(undefined);
        this.vals = new Array(capacity).fill(undefined);
        this.ref = new Array(capacity).fill(false);
    }

    get size(): number {
        return this.filled;
    }

    has(key: K): boolean {
        return this.index.has(key);
    }

    /** Lê o valor e dá "segunda chance" (liga o bit de referência). */
    get(key: K): V | undefined {
        const slot = this.index.get(key);
        if (slot === undefined) return undefined;
        this.ref[slot] = true;
        return this.vals[slot];
    }

    /** Insere/atualiza; despeja via varredura do relógio se necessário. */
    set(key: K, value: V): void {
        const existing = this.index.get(key);
        if (existing !== undefined) {
            this.vals[existing] = value;
            this.ref[existing] = true;
            return;
        }
        const slot = this.claimSlot();
        const evicted = this.keys[slot];
        if (evicted !== undefined) this.index.delete(evicted);
        else this.filled++;
        this.keys[slot] = key;
        this.vals[slot] = value;
        this.ref[slot] = true; // recém-inserido começa com referência
        this.index.set(key, slot);
    }

    /** Acha um slot: vazio se houver; senão varre o relógio (second-chance). */
    private claimSlot(): number {
        if (this.filled < this.capacity) {
            // primeiro slot vazio a partir da mão
            for (let i = 0; i < this.capacity; i++) {
                const s = (this.hand + i) % this.capacity;
                if (this.keys[s] === undefined) {
                    this.hand = (s + 1) % this.capacity;
                    return s;
                }
            }
        }
        // cheio: varre dando segunda chance
        // garantido a terminar em ≤ 2·capacity passos (todo bit é zerado no máx 1×)
        for (let steps = 0; steps < this.capacity * 2; steps++) {
            const s = this.hand;
            this.hand = (this.hand + 1) % this.capacity;
            if (this.ref[s]) {
                this.ref[s] = false; // segunda chance
            } else {
                return s; // vítima
            }
        }
        // fallback determinístico (não deve acontecer)
        const s = this.hand;
        this.hand = (this.hand + 1) % this.capacity;
        return s;
    }
}
