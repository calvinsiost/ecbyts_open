// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Deadline / budget propagation (item 18). Pure-logic.

   Propaga um "orçamento de tempo" por uma cadeia de operações: cada passo
   conhece quanto resta e deriva um prazo para o filho, reservando uma folga
   para o próprio encerramento. Evita que um passo lento estoure o orçamento
   total sem que ninguém perceba. Determinístico; relógio injetado.

   Uso no ecbyts: orçar tempo total de um pipeline (ingestão de documento →
   OCR → parse → IA) ou do laço agêntico do LLM — cada etapa recebe um prazo
   derivado e aborta cedo em vez de travar a jornada do usuário.

   Ref: gRPC deadlines / Go context.WithDeadline (propagação de prazo).
   ================================================================ */

export interface Deadline {
    /** Instante absoluto (ms) em que o orçamento expira. */
    readonly deadlineMs: number;
}

/** Cria um prazo a partir de um início e um orçamento. */
export function createDeadline(startMs: number, budgetMs: number): Deadline {
    if (!Number.isFinite(startMs) || !Number.isFinite(budgetMs)) {
        throw new RangeError('createDeadline: startMs e budgetMs devem ser finitos');
    }
    if (budgetMs < 0) throw new RangeError('createDeadline: budgetMs deve ser ≥ 0');
    return Object.freeze({ deadlineMs: startMs + budgetMs });
}

/** Tempo restante (ms) até o prazo; nunca negativo. */
export function remainingMs(deadline: Deadline, nowMs: number): number {
    if (!Number.isFinite(nowMs)) throw new RangeError('remainingMs: nowMs deve ser finito');
    return Math.max(0, deadline.deadlineMs - nowMs);
}

/** True quando o prazo já passou. */
export function isExpired(deadline: Deadline, nowMs: number): boolean {
    if (!Number.isFinite(nowMs)) throw new RangeError('isExpired: nowMs deve ser finito');
    return nowMs >= deadline.deadlineMs;
}

export interface ChildDeadlineOptions {
    /** Folga (ms) reservada para o encerramento do pai (default 0). */
    readonly reserveMs?: number;
    /** Fração do restante a conceder ao filho (0..1; default 1). */
    readonly fraction?: number;
}

/**
 * Deriva o prazo de um filho: concede (restante − reserva) × fração, sem nunca
 * exceder o prazo do pai. Reserva garante folga para cleanup do pai.
 */
export function deriveChildDeadline(parent: Deadline, nowMs: number, opts: ChildDeadlineOptions = {}): Deadline {
    const reserve = opts.reserveMs ?? 0;
    const fraction = opts.fraction ?? 1;
    if (reserve < 0) throw new RangeError('deriveChildDeadline: reserveMs deve ser ≥ 0');
    if (fraction <= 0 || fraction > 1) throw new RangeError('deriveChildDeadline: fraction deve estar em (0,1]');
    const avail = Math.max(0, remainingMs(parent, nowMs) - reserve);
    const childBudget = avail * fraction;
    return Object.freeze({ deadlineMs: Math.min(parent.deadlineMs, nowMs + childBudget) });
}

/** Limita um timeout solicitado ao tempo que ainda cabe no prazo. */
export function clampTimeout(requestedMs: number, deadline: Deadline, nowMs: number): number {
    if (!Number.isFinite(requestedMs) || requestedMs < 0) {
        throw new RangeError('clampTimeout: requestedMs deve ser ≥ 0 finito');
    }
    return Math.min(requestedMs, remainingMs(deadline, nowMs));
}
