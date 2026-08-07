// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB recomendação R4 — Filtro de Kalman 1D (escalar). Pure-logic.

   Estima o valor "verdadeiro" de um sinal ruidoso combinando a previsão (o que
   esperávamos) com a medição (o que medimos), ponderadas pela confiança em cada
   uma. Cada nova medição reduz a incerteza. Modelo de estado constante (random
   walk) — ideal para suavizar leituras de sensor que variam lentamente.

   Uso no ecbyts: limpar fluxo ruidoso de sensores IoT (core/sensor), fundir/
   denoise de observações de monitoramento que oscilam por erro de medição.

   Determinístico; sem DOM/rede. Ref: Kalman 1960, "A New Approach to Linear
   Filtering and Prediction Problems" (Journal of Basic Engineering 82).
   ================================================================ */

export interface Kalman1DConfig {
    /** Ruído do processo Q: quanto o valor real pode mudar entre passos. */
    readonly processNoise?: number;
    /** Ruído da medição R: quão ruidoso é o sensor. */
    readonly measurementNoise?: number;
    /** Estimativa inicial. Default: primeira medição. */
    readonly initialEstimate?: number;
    /** Incerteza inicial P. Default 1. */
    readonly initialUncertainty?: number;
}

export interface Kalman1DState {
    estimate: number;
    uncertainty: number;
    readonly processNoise: number;
    readonly measurementNoise: number;
    initialized: boolean;
}

export interface Kalman1D {
    /** Incorpora uma medição e devolve a estimativa filtrada. */
    update(measurement: number): number;
    /** Estimativa atual (sem incorporar medição). */
    readonly value: number;
    /** Incerteza atual (P). */
    readonly uncertainty: number;
}

/** Cria um filtro de Kalman 1D incremental (streaming). */
export function createKalman1D(config: Kalman1DConfig = {}): Kalman1D {
    const processNoise = config.processNoise ?? 1e-3;
    const measurementNoise = config.measurementNoise ?? 1e-1;
    if (!(processNoise >= 0) || !(measurementNoise > 0)) {
        throw new RangeError('createKalman1D: processNoise ≥ 0 e measurementNoise > 0');
    }
    const state: Kalman1DState = {
        estimate: config.initialEstimate ?? 0,
        uncertainty: config.initialUncertainty ?? 1,
        processNoise,
        measurementNoise,
        initialized: config.initialEstimate !== undefined,
    };
    return {
        update(measurement: number): number {
            if (!Number.isFinite(measurement)) {
                throw new RangeError('Kalman1D.update: measurement deve ser finito');
            }
            if (!state.initialized) {
                state.estimate = measurement; // ancora na 1ª leitura
                state.initialized = true;
                return state.estimate;
            }
            // Previsão: modelo de estado constante → estimativa igual, incerteza cresce por Q.
            const predUncertainty = state.uncertainty + state.processNoise;
            // Atualização: ganho de Kalman pondera medição vs previsão.
            const gain = predUncertainty / (predUncertainty + state.measurementNoise);
            state.estimate = state.estimate + gain * (measurement - state.estimate);
            state.uncertainty = (1 - gain) * predUncertainty;
            return state.estimate;
        },
        get value(): number {
            return state.estimate;
        },
        get uncertainty(): number {
            return state.uncertainty;
        },
    };
}

/** Aplica o filtro a uma série inteira e devolve a série suavizada. */
export function kalmanSmooth(series: readonly number[], config: Kalman1DConfig = {}): number[] {
    if (!Array.isArray(series)) throw new TypeError('kalmanSmooth: series deve ser array');
    const filter = createKalman1D(config);
    return series.map((m) => filter.update(m));
}
