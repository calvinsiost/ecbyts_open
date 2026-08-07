// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Consistent hashing ring (item 6). Pure-logic.

   Distribui chaves entre nós NOMEADOS posicionados num anel de hash. Cada nó
   recebe vários "nós virtuais" (réplicas) p/ balancear; pesos permitem nós
   maiores. Ao add/remover um nó, só as chaves daquele trecho do anel migram.

   Complementa jumpHashPure (item 8): jump hash é O(1) memória mas só baldes
   INTEIROS sem nomes; o anel suporta nós nomeados, pesos e remoção arbitrária.

   Uso no ecbyts: rotear chaves a destinos nomeados com pesos — ex.: distribuir
   modelos/coleções entre buckets de Storage nomeados, ou tarefas entre workers
   heterogêneos, mantendo estabilidade quando um destino entra/sai.

   Determinístico (FNV-1a reusado de jumpHashPure). Ref: Karger et al. 1997,
   "Consistent Hashing and Random Trees" (STOC 1997).
   ================================================================ */

import { hashStringToKey } from './jumpHashPure.js';

interface VNode {
    readonly pos: bigint;
    readonly node: string;
}

export class ConsistentHashRing {
    private readonly replicas: number;
    private ring: VNode[] = []; // ordenado por pos crescente
    private readonly nodes = new Map<string, number>(); // node → peso (nº de réplicas efetivo)

    /** @param replicas nós virtuais por unidade de peso (default 64) */
    constructor(replicas = 64) {
        if (!Number.isInteger(replicas) || replicas <= 0) {
            throw new RangeError('ConsistentHashRing: replicas deve ser inteiro ≥ 1');
        }
        this.replicas = replicas;
    }

    get nodeCount(): number {
        return this.nodes.size;
    }

    get vnodeCount(): number {
        return this.ring.length;
    }

    listNodes(): string[] {
        return [...this.nodes.keys()].sort();
    }

    /** Adiciona (ou re-pesa) um nó. weight ≥ 1 multiplica as réplicas. */
    addNode(node: string, weight = 1): void {
        if (typeof node !== 'string' || node === '') {
            throw new TypeError('addNode: node deve ser string não-vazia');
        }
        if (!Number.isInteger(weight) || weight <= 0) {
            throw new RangeError('addNode: weight deve ser inteiro ≥ 1');
        }
        if (this.nodes.has(node)) this.removeNode(node);
        const count = this.replicas * weight;
        for (let i = 0; i < count; i++) {
            this.ring.push({ pos: hashStringToKey(`${node}#${i}`), node });
        }
        this.nodes.set(node, count);
        this.ring.sort((a, b) => (a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0));
    }

    /** Remove um nó e todas as suas réplicas. */
    removeNode(node: string): void {
        if (!this.nodes.has(node)) return;
        this.ring = this.ring.filter((v) => v.node !== node);
        this.nodes.delete(node);
    }

    /** Nó responsável por uma chave (primeiro vnode ≥ hash, com wrap). null se vazio. */
    getNode(key: string): string | null {
        if (this.ring.length === 0) return null;
        const h = hashStringToKey(key);
        // busca binária pelo primeiro pos ≥ h
        let lo = 0;
        let hi = this.ring.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.ring[mid]!.pos < h) lo = mid + 1;
            else hi = mid;
        }
        const idx = lo === this.ring.length ? 0 : lo; // wrap-around
        return this.ring[idx]!.node;
    }
}
