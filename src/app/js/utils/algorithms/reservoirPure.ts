// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB-001 F2 — Reservoir sampling (item 24). Pure-logic.

   Amostra UNIFORMEMENTE k elementos de um fluxo de tamanho desconhecido em
   uma única passagem, com memória O(k). Todo elemento visto tem a mesma
   probabilidade k/n de estar na amostra final (Algoritmo R, Vitter 1985).

   O RNG é INJETADO (default Math.random) → determinístico em teste quando se
   passa um gerador semeado (ex.: Mulberry32 de core/random).

   Uso no ecbyts: amostragem limitada de observações/telemetria/logs de
   auditoria para preview ou export quando o volume total é grande demais
   para carregar tudo (ex.: "mostre 100 amostras representativas").

   Ref: Vitter 1985, "Random Sampling with a Reservoir" (ACM TOMS 11(1)).
   ================================================================ */

export type Rng = () => number;

/**
 * Amostra k elementos de um iterável (Algoritmo R). Preserva a ordem de
 * chegada dos elementos que sobrevivem no reservatório.
 * @param item  qualquer iterável (array, generator, Set…)
 * @param k      tamanho da amostra (inteiro ≥ 0)
 * @param rng    gerador em [0,1); default Math.random
 */
export function reservoirSample<T>(items: Iterable<T>, k: number, rng: Rng = Math.random): T[] {
    if (!Number.isInteger(k) || k < 0) {
        throw new RangeError('reservoirSample: k deve ser inteiro ≥ 0');
    }
    const sampler = createReservoirSampler<T>(k, rng);
    for (const item of items) {
        sampler.offer(item);
    }
    return sampler.sample();
}

export interface ReservoirSampler<T> {
    /** Oferece um elemento ao reservatório (decide manter ou descartar). */
    offer(item: T): void;
    /** Cópia da amostra atual (não expõe o buffer interno). */
    sample(): T[];
    /** Quantos elementos já foram vistos no fluxo. */
    readonly seen: number;
}

/**
 * Fábrica de amostrador incremental (streaming). Útil quando os elementos
 * chegam ao longo do tempo (ex.: eventos). Estado encapsulado; determinístico
 * dado o mesmo rng.
 */
export function createReservoirSampler<T>(k: number, rng: Rng = Math.random): ReservoirSampler<T> {
    if (!Number.isInteger(k) || k < 0) {
        throw new RangeError('createReservoirSampler: k deve ser inteiro ≥ 0');
    }
    if (typeof rng !== 'function') {
        throw new TypeError('createReservoirSampler: rng deve ser função');
    }
    const buf: T[] = [];
    let seen = 0;
    return {
        offer(item: T): void {
            if (k === 0) {
                seen++;
                return;
            }
            if (buf.length < k) {
                buf.push(item);
            } else {
                // j uniforme em [0, seen]; se cair num slot do reservatório, troca.
                const j = Math.floor(rng() * (seen + 1));
                if (j < k) {
                    buf[j] = item;
                }
            }
            seen++;
        },
        sample(): T[] {
            return buf.slice();
        },
        get seen(): number {
            return seen;
        },
    };
}
