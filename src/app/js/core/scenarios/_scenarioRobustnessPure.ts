// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Cenários — Robustez por sensibilidade + Monte Carlo (S2).
 *
 * Módulo pure-logic que interroga a robustez de um delta de cenário:
 *
 *   1. SENSIBILIDADE (OAT/tornado, §5.3-c tipo 2): varia cada parâmetro
 *      dentro da sua faixa de incerteza (± fração) com os demais fixos e
 *      ranqueia por amplitude de efeito no delta — responde "qual alavanca
 *      pesa mais".
 *   2. INCERTEZA (Monte Carlo, §5.3-c tipo 4 / CFG-33): amostra TODOS os
 *      parâmetros juntos das suas distribuições e devolve o delta como
 *      FAIXA P10–P50–P90, não ponto único — o rigor de LCA comparativa
 *      (spec §14) que S2 exige.
 *
 * REUSO (spec §2 S2 + §16): o PRNG e o sampler gaussiano vêm do motor MC
 * canônico `core/ecbtScore/_monteCarloBandPure.ts` (mulberry32 + Box-Muller),
 * o mesmo usado na banda do ECBT Score (Results do artigo Nature). Nada de
 * PRNG novo: determinismo por seed idêntico ao motor existente.
 *
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 *  - §2 S2 — "Robustez por sensibilidade + cenário (Monte Carlo) … delta
 *    como faixa P10–P50–P90, não ponto único."
 *  - CFG-33 — nº de amostras e seed configuráveis; reprodutível por seed.
 *
 * Rigor N3: avaliações não-finitas do métrico são DESCARTADAS, nunca viram 0;
 * se o ponto-base não avalia ou sobram menos de metade das amostras válidas,
 * a banda é `null` (+ `semDado=true`) — sem faixa forjada.
 */

import { mulberry32, sampleNormal } from '../ecbtScore/_monteCarloBandPure.js';

/** Distribuições suportadas (mesmo vocabulário do motor MC canônico). */
export type RobustnessDistribution = 'normal' | 'uniform' | 'triangular';

/** Parâmetro incerto do cenário (alavanca com faixa de incerteza). */
export interface RobustnessParameter {
    /** Identificador estável (ex.: 'recoveryRate'). */
    readonly id: string;
    /** Valor central (o valor do parâmetro no cenário avaliado). */
    readonly value: number;
    /** Incerteza relativa (fração do |value|). Default 0.1 (±10%). */
    readonly uncertaintyFraction?: number;
    /** Distribuição de amostragem. Default 'normal'. */
    readonly distribution?: RobustnessDistribution;
}

/**
 * Função-métrica: recebe os valores dos parâmetros (por id) e devolve o delta
 * (ex.: ΔNPV consolidado, ΔECBT). `null` = sem dado (N3) — nunca 0 forjado.
 */
export type RobustnessMetricFn = (values: Readonly<Record<string, number>>) => number | null;

/** Opções do cálculo — amostras e seed SEMPRE configuráveis (CFG-33). */
export interface RobustnessOptions {
    /** Nº de iterações Monte Carlo; default 1000, clamp [50, 100_000]. */
    readonly iterations?: number;
    /** Seed do PRNG (mulberry32); default 42 — reprodutível. */
    readonly seed?: number;
}

/** Linha do ranking de sensibilidade (tornado). */
export interface SensitivityEntry {
    readonly id: string;
    /** Valor do parâmetro nos extremos avaliados (value ∓ spread). */
    readonly paramLow: number;
    readonly paramHigh: number;
    /** Métrica nos extremos (`null` = avaliação sem dado). */
    readonly metricLow: number | null;
    readonly metricHigh: number | null;
    /** Amplitude |metricHigh − metricLow|; `null` se algum lado sem dado. */
    readonly amplitude: number | null;
}

/** Banda P10–P50–P90 do delta (Monte Carlo). */
export interface RobustnessBand {
    readonly p10: number;
    readonly p50: number;
    readonly p90: number;
    readonly mean: number;
    /** Nº de amostras VÁLIDAS (finitas) que entraram na banda. */
    readonly validSamples: number;
}

/** Resultado consolidado da análise de robustez (S2). */
export interface ScenarioRobustnessResult {
    /** Métrica no ponto central (todos os parâmetros em `value`). */
    readonly baseMetric: number | null;
    /** Ranking desc. por amplitude; entradas sem dado vão para o fim. */
    readonly sensitivity: ReadonlyArray<SensitivityEntry>;
    /** Faixa P10–P50–P90; `null` quando não há amostra honesta suficiente. */
    readonly band: RobustnessBand | null;
    readonly iterations: number;
    readonly seed: number;
    readonly semDado: boolean;
}

const DEFAULT_ITERATIONS = 1000;
const MIN_ITERATIONS = 50;
const MAX_ITERATIONS = 100_000;
const DEFAULT_SEED = 42;
const DEFAULT_UNCERTAINTY_FRACTION = 0.1;
/** Fração mínima de amostras válidas para a banda ser honesta (N3). */
const MIN_VALID_FRACTION = 0.5;

/** Número finito ou null (N3). */
function finiteOrNull(v: number | null | undefined): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** Meia-largura absoluta da incerteza de um parâmetro. */
function spreadOf(p: RobustnessParameter): number {
    const frac = finiteOrNull(p.uncertaintyFraction);
    const f = frac !== null && frac >= 0 ? frac : DEFAULT_UNCERTAINTY_FRACTION;
    return Math.abs(p.value) * f;
}

/** Uniforme em [value − spread, value + spread]. */
function sampleUniformLocal(rng: () => number, value: number, spread: number): number {
    if (!Number.isFinite(spread) || spread <= 0) return value;
    return value + (rng() * 2 - 1) * spread;
}

/** Triangular simétrica centrada em `value`, meia-largura `spread`. */
function sampleTriangularLocal(rng: () => number, value: number, spread: number): number {
    if (!Number.isFinite(spread) || spread <= 0) return value;
    return value + (rng() + rng() - 1) * spread;
}

/** Amostra um parâmetro segundo a sua distribuição declarada. */
function sampleParameter(rng: () => number, p: RobustnessParameter): number {
    const spread = spreadOf(p);
    switch (p.distribution ?? 'normal') {
        case 'uniform':
            return sampleUniformLocal(rng, p.value, spread);
        case 'triangular':
            return sampleTriangularLocal(rng, p.value, spread);
        default:
            // Normal: spread interpretado como 1σ (mesma convenção do motor MC).
            return sampleNormal(rng, p.value, spread);
    }
}

/** Percentil por interpolação linear sobre array ordenado (0..1). */
function percentileSorted(sorted: ReadonlyArray<number>, q: number): number {
    const n = sorted.length;
    const pos = q * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo] as number;
    const w = pos - lo;
    return (sorted[lo] as number) * (1 - w) + (sorted[hi] as number) * w;
}

/** Mapa id→value com um override opcional (OAT). */
function valuesWithOverride(
    params: ReadonlyArray<RobustnessParameter>,
    overrideId?: string,
    overrideValue?: number,
): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of params) {
        out[p.id] = p.id === overrideId && overrideValue !== undefined ? overrideValue : p.value;
    }
    return out;
}

/** Sensibilidade OAT: cada parâmetro nos extremos, demais no centro. */
function computeSensitivity(
    params: ReadonlyArray<RobustnessParameter>,
    metric: RobustnessMetricFn,
): SensitivityEntry[] {
    const entries: SensitivityEntry[] = params.map((p) => {
        const spread = spreadOf(p);
        const paramLow = p.value - spread;
        const paramHigh = p.value + spread;
        const metricLow = finiteOrNull(metric(valuesWithOverride(params, p.id, paramLow)));
        const metricHigh = finiteOrNull(metric(valuesWithOverride(params, p.id, paramHigh)));
        const amplitude = metricLow === null || metricHigh === null ? null : Math.abs(metricHigh - metricLow);
        return Object.freeze({ id: p.id, paramLow, paramHigh, metricLow, metricHigh, amplitude });
    });
    // Ranking desc. por amplitude; sem-dado (null) sempre ao fim (N3 visível).
    entries.sort((a, b) => {
        if (a.amplitude === null && b.amplitude === null) return 0;
        if (a.amplitude === null) return 1;
        if (b.amplitude === null) return -1;
        return b.amplitude - a.amplitude;
    });
    return entries;
}

/**
 * Análise de robustez S2: sensibilidade por parâmetro + banda Monte Carlo
 * P10–P50–P90 do delta. Determinística por seed (mulberry32, o mesmo PRNG do
 * motor MC canônico do ECBT Score).
 *
 * @param params - Parâmetros incertos do cenário (≥ 1 para banda honesta).
 * @param metric - Função-métrica pura (values → delta | null).
 * @param options - Iterações e seed (CFG-33); defaults 1000/42.
 * @returns Resultado congelado com base, ranking tornado e banda (ou semDado).
 */
export function computeScenarioRobustness(
    params: ReadonlyArray<RobustnessParameter>,
    metric: RobustnessMetricFn,
    options?: RobustnessOptions,
): ScenarioRobustnessResult {
    const itRaw = finiteOrNull(options?.iterations);
    const iterations =
        itRaw !== null ? Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, Math.floor(itRaw))) : DEFAULT_ITERATIONS;
    const seedRaw = finiteOrNull(options?.seed);
    const seed = seedRaw !== null ? Math.floor(seedRaw) : DEFAULT_SEED;

    const baseMetric = params.length > 0 ? finiteOrNull(metric(valuesWithOverride(params))) : null;
    const sensitivity = params.length > 0 ? computeSensitivity(params, metric) : [];

    // Monte Carlo conjunto: todos os parâmetros amostrados a cada iteração.
    let band: RobustnessBand | null = null;
    if (params.length > 0 && baseMetric !== null) {
        const rng = mulberry32(seed);
        const samples: number[] = [];
        for (let i = 0; i < iterations; i++) {
            const values: Record<string, number> = {};
            for (const p of params) values[p.id] = sampleParameter(rng, p);
            const m = finiteOrNull(metric(values));
            if (m !== null) samples.push(m);
        }
        // N3: banda só com maioria de amostras válidas — sem faixa forjada.
        if (samples.length >= Math.ceil(iterations * MIN_VALID_FRACTION)) {
            samples.sort((a, b) => a - b);
            let sum = 0;
            for (const s of samples) sum += s;
            band = Object.freeze({
                p10: percentileSorted(samples, 0.1),
                p50: percentileSorted(samples, 0.5),
                p90: percentileSorted(samples, 0.9),
                mean: sum / samples.length,
                validSamples: samples.length,
            });
        }
    }

    return Object.freeze({
        baseMetric,
        sensitivity: Object.freeze(sensitivity) as ReadonlyArray<SensitivityEntry>,
        band,
        iterations,
        seed,
        semDado: baseMetric === null || band === null,
    });
}
