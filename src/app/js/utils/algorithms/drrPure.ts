// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Deficit Round Robin fair queueing (item 40). Pure-logic.

   Distribui "atendimento" entre várias filas de forma JUSTA mesmo quando os
   itens têm tamanhos diferentes. Cada fila acumula um "déficit"; a cada volta
   ganha um quantum (× peso); só serve o item da frente se o déficit cobrir o
   tamanho dele, senão guarda o crédito para a próxima volta. O(1) amortizado.

   Uso no ecbyts: justiça entre usuários/jobs concorrentes — ex.: ordenar
   requisições de LLM ou jobs de export de vários usuários sem que um usuário
   com itens grandes monopolize a fila (anti-starvation com peso por tier).

   Ref: Shreedhar & Varghese 1996, "Efficient Fair Queuing using Deficit
   Round Robin" (SIGCOMM 1996).
   ================================================================ */

interface Flow<T> {
    readonly id: string;
    weight: number;
    deficit: number;
    queue: { item: T; size: number }[];
}

export interface DequeueResult<T> {
    readonly flowId: string;
    readonly item: T;
}

export class DeficitRoundRobin<T> {
    private readonly quantum: number;
    private readonly flows = new Map<string, Flow<T>>();
    private order: string[] = []; // round-robin entre flows
    private cursor = 0;
    private creditedCurrent = false; // já creditou o quantum na visita atual ao cursor?

    constructor(quantum: number) {
        if (!Number.isFinite(quantum) || quantum <= 0) {
            throw new RangeError('DeficitRoundRobin: quantum deve ser > 0');
        }
        this.quantum = quantum;
    }

    get pending(): number {
        let n = 0;
        for (const f of this.flows.values()) n += f.queue.length;
        return n;
    }

    /** Registra (ou re-pesa) uma fila. weight ≥ 1 multiplica o quantum. */
    addFlow(id: string, weight = 1): void {
        if (typeof id !== 'string' || id === '') throw new TypeError('addFlow: id string não-vazia');
        if (!Number.isFinite(weight) || weight <= 0) throw new RangeError('addFlow: weight > 0');
        const existing = this.flows.get(id);
        if (existing) {
            existing.weight = weight;
            return;
        }
        this.flows.set(id, { id, weight, deficit: 0, queue: [] });
        this.order.push(id);
    }

    /** Enfileira um item numa fila (cria a fila com peso 1 se não existir). */
    enqueue(flowId: string, item: T, size = 1): void {
        if (!Number.isFinite(size) || size <= 0) throw new RangeError('enqueue: size deve ser > 0');
        if (!this.flows.has(flowId)) this.addFlow(flowId);
        this.flows.get(flowId)!.queue.push({ item, size });
    }

    private advanceCursor(): void {
        this.cursor = (this.cursor + 1) % Math.max(1, this.order.length);
        this.creditedCurrent = false;
    }

    /**
     * Retira o próximo item respeitando a justiça por déficit. null se vazio.
     * Itens maiores que o quantum acumulam crédito ao longo de várias voltas
     * (resolvido dentro desta chamada — pending>0 sempre devolve um item).
     */
    dequeue(): DequeueResult<T> | null {
        if (this.pending === 0 || this.order.length === 0) return null;
        // limite superior de passos: pior caso o maior item precisa de
        // ceil(size/quantum) voltas, cada volta = order.length passos.
        let maxSize = 0;
        for (const f of this.flows.values()) {
            if (f.queue.length > 0) maxSize = Math.max(maxSize, f.queue[0]!.size / f.weight);
        }
        const guard = Math.ceil(maxSize / this.quantum + 1) * this.order.length + this.order.length + 4;
        for (let step = 0; step < guard; step++) {
            const flow = this.flows.get(this.order[this.cursor % this.order.length]!)!;
            if (flow.queue.length === 0) {
                flow.deficit = 0;
                this.advanceCursor();
                continue;
            }
            if (!this.creditedCurrent) {
                flow.deficit += this.quantum * flow.weight;
                this.creditedCurrent = true;
            }
            const head = flow.queue[0]!;
            if (head.size <= flow.deficit) {
                flow.deficit -= head.size;
                flow.queue.shift();
                const result = Object.freeze({ flowId: flow.id, item: head.item });
                if (flow.queue.length === 0) {
                    flow.deficit = 0;
                    this.advanceCursor(); // fila esvaziou → passa a vez
                }
                // senão fica na fila (mesma visita, sem re-creditar) para servir o resto do burst
                return result;
            }
            this.advanceCursor(); // déficit insuficiente → guarda crédito, próxima fila
        }
        return null; // não deve acontecer com pending>0 e sizes finitos
    }
}
