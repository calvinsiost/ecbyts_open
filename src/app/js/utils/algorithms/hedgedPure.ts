// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Hedged requests policy (item 17). Pure-logic.

   "Requisição com cobertura": se a chamada primária demora além de um limiar
   (tipicamente o p95 histórico), dispara-se uma SEGUNDA chamada e vence a que
   responder primeiro — corta a cauda de latência. Aqui está só a POLÍTICA
   (decidir quando/se disparar a cobertura); o disparo assíncrono em si é
   runtime. Determinístico; relógio injetado.

   Uso no ecbyts: backup de chamada lenta de LLM/edge function — se o provedor
   primário não respondeu até o p95, dispara um segundo provedor e usa o 1º
   que chegar (reduz timeouts percebidos sem dobrar o custo no caso comum).

   Ref: Dean & Barroso 2013, "The Tail at Scale" (CACM 56(2)).
   ================================================================ */

/** Percentil (p ∈ [0,1]) por interpolação linear; entrada não precisa estar ordenada. */
export function percentile(latencies: readonly number[], p: number): number {
    if (!Array.isArray(latencies) || latencies.length === 0) {
        throw new RangeError('percentile: latencies vazio');
    }
    if (typeof p !== 'number' || p < 0 || p > 1) {
        throw new RangeError('percentile: p deve estar em [0,1]');
    }
    const xs = [...latencies].sort((a, b) => a - b);
    if (xs.length === 1) return xs[0]!;
    const idx = p * (xs.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    return xs[lo]! + (xs[hi]! - xs[lo]!) * frac;
}

/** True quando o tempo decorrido já passou do limiar de cobertura. */
export function shouldHedge(elapsedMs: number, hedgeAfterMs: number): boolean {
    if (!Number.isFinite(elapsedMs) || !Number.isFinite(hedgeAfterMs)) {
        throw new RangeError('shouldHedge: argumentos devem ser finitos');
    }
    return elapsedMs >= hedgeAfterMs;
}

export interface HedgeConfig {
    /** Latências observadas (ms) para derivar o limiar. */
    readonly latencies?: readonly number[];
    /** Percentil do limiar (default 0.95). */
    readonly percentile?: number;
    /** Limiar fixo (ms); se dado, ignora latencies/percentile. */
    readonly fixedThresholdMs?: number;
    /** Limite mínimo de limiar (ms) para não disparar cedo demais. */
    readonly minThresholdMs?: number;
}

export interface HedgePlan {
    readonly hedgeAfterMs: number;
    /** Instante absoluto (ms) em que a cobertura deve ser disparada. */
    readonly fireAtMs: number;
}

/** Deriva o limiar e o instante de disparo a partir do início da chamada. */
export function planHedge(config: HedgeConfig, startMs: number): HedgePlan {
    if (!Number.isFinite(startMs)) {
        throw new RangeError('planHedge: startMs deve ser finito');
    }
    let threshold: number;
    if (typeof config.fixedThresholdMs === 'number') {
        threshold = config.fixedThresholdMs;
    } else if (config.latencies && config.latencies.length > 0) {
        threshold = percentile(config.latencies, config.percentile ?? 0.95);
    } else {
        throw new RangeError('planHedge: forneça fixedThresholdMs ou latencies');
    }
    threshold = Math.max(threshold, config.minThresholdMs ?? 0);
    return Object.freeze({ hedgeAfterMs: threshold, fireAtMs: startMs + threshold });
}
