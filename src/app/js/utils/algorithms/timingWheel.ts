// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Timing wheel / hashed timer wheel (item 39). Pure-logic.

   Agenda MUITOS temporizadores com custo O(1) por agendamento e por "tick",
   em vez de N setTimeout ou uma fila de prioridade O(log N). Os prazos são
   distribuídos em "slots" circulares (a roda); o ponteiro avança a cada tick
   e dispara o que vence. Determinístico; o tempo é passado explicitamente.

   Uso no ecbyts: orquestrar muitos disparos diferidos com um único relógio —
   ex.: polling de auto-refresh de sensores, agendamento de notificações,
   expiração de caches/tokens — sem criar centenas de setTimeout.

   Ref: Varghese & Lauck 1987, "Hashed and Hierarchical Timing Wheels".
   ================================================================ */

export class TimingWheel {
    private readonly numSlots: number;
    private readonly tickMs: number;
    private readonly slots: Map<string, number>[]; // slot → (id → dueAbsTick)
    private readonly idToSlot = new Map<string, number>();
    private startMs: number | null = null;
    private currentAbsTick = 0;

    constructor(numSlots: number, tickMs: number) {
        if (!Number.isInteger(numSlots) || numSlots <= 0) {
            throw new RangeError('TimingWheel: numSlots deve ser inteiro ≥ 1');
        }
        if (!Number.isFinite(tickMs) || tickMs <= 0) {
            throw new RangeError('TimingWheel: tickMs deve ser > 0');
        }
        this.numSlots = numSlots;
        this.tickMs = tickMs;
        this.slots = Array.from({ length: numSlots }, () => new Map<string, number>());
    }

    get size(): number {
        return this.idToSlot.size;
    }

    private absTickAt(nowMs: number): number {
        if (this.startMs === null) this.startMs = nowMs;
        return Math.floor((nowMs - this.startMs) / this.tickMs);
    }

    /** Agenda um disparo `delayMs` à frente de `nowMs`. Re-agendar mesmo id substitui. */
    schedule(id: string, delayMs: number, nowMs: number): void {
        if (typeof id !== 'string' || id === '') throw new TypeError('schedule: id string não-vazia');
        if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError('schedule: delayMs ≥ 0 finito');
        this.cancel(id);
        const nowTick = this.absTickAt(nowMs);
        if (nowTick > this.currentAbsTick) this.currentAbsTick = nowTick;
        const ticks = Math.max(1, Math.ceil(delayMs / this.tickMs));
        const dueAbsTick = this.currentAbsTick + ticks;
        const slot = dueAbsTick % this.numSlots;
        this.slots[slot]!.set(id, dueAbsTick);
        this.idToSlot.set(id, slot);
    }

    /** Cancela um agendamento (no-op se ausente). */
    cancel(id: string): boolean {
        const slot = this.idToSlot.get(id);
        if (slot === undefined) return false;
        this.slots[slot]!.delete(id);
        this.idToSlot.delete(id);
        return true;
    }

    /** Avança o relógio até nowMs e devolve os ids vencidos (removidos da roda). */
    advanceTo(nowMs: number): string[] {
        const targetTick = this.absTickAt(nowMs);
        const due: string[] = [];
        if (targetTick <= this.currentAbsTick) {
            // mesmo tick: ainda assim colhe overdue eventualmente presentes
            this.collectSlot(this.currentAbsTick % this.numSlots, this.currentAbsTick, due);
            return due;
        }
        const gap = targetTick - this.currentAbsTick;
        if (gap >= this.numSlots) {
            // salto grande: varre todos os slots colhendo dueAbsTick ≤ targetTick
            for (let s = 0; s < this.numSlots; s++) this.collectSlot(s, targetTick, due);
        } else {
            for (let t = this.currentAbsTick + 1; t <= targetTick; t++) {
                this.collectSlot(t % this.numSlots, t, due);
            }
        }
        this.currentAbsTick = targetTick;
        return due;
    }

    private collectSlot(slot: number, uptoAbsTick: number, out: string[]): void {
        const bucket = this.slots[slot]!;
        for (const [id, dueAbsTick] of bucket) {
            if (dueAbsTick <= uptoAbsTick) {
                out.push(id);
                bucket.delete(id);
                this.idToSlot.delete(id);
            }
        }
    }
}
