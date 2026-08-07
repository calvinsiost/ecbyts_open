// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Scenario Simulation Engine - Monte Carlo with LHS
// ADR: ADR-025

/* ================================================================
   SCENARIO SIMULATION ENGINE — Monte Carlo + LHS Sampling
   ================================================================

   Motor de simulação de cenários ambientais usando:
   - Latin Hypercube Sampling (LHS) para amostragem eficiente
   - Monte Carlo para projeção probabilística
   - Modelagem temporal de contaminação/remediação

   Use cases:
   - Projeção de dispersão de pluma
   - Análise de decisões de remediação
   - Estimativa de tempo para conformidade
   - Análise de risco de falha
   ================================================================ */

// ----------------------------------------------------------------
// MATH UTILITIES
// ----------------------------------------------------------------

/**
 * Mulberry32 PRNG - determinístico, seedável.
 * Mesmo algoritmo usado em core/analytics/optimization/
 */
/**
 * @typedef {Record<string, any>} ScenarioParams
 * @typedef {{ m: number, concentration: number, plumeRadius: number, health: number, compliance: boolean, cumulativeCost: number, failure: boolean }} ScenarioTimelinePoint
 * @typedef {{ compliance: boolean, complianceMonth: number, failure: boolean, failureMonth: number, finalConcentration: number, finalHealth: number, maxRadius: number, totalCost: number, timeToCompliance: number | null, costEfficiency: number, interimMet?: boolean | null }} ScenarioFinal
 * @typedef {{ T: ScenarioTimelinePoint[], F: ScenarioFinal }} SimulationResult
 * @typedef {SimulationResult[] & { _seed?: number }} SimulationResults
 * @typedef {Record<string, any>} ScenarioStats
 * @typedef {{ id: string, name: string, mods: ScenarioParams, description?: string, tag?: string }} ScenarioDecision
 */
type ScenarioParams = Record<string, any>;
type ScenarioTimelinePoint = { m: number, concentration: number, plumeRadius: number, health: number, compliance: boolean, cumulativeCost: number, failure: boolean };
type ScenarioFinal = { compliance: boolean, complianceMonth: number, failure: boolean, failureMonth: number, finalConcentration: number, finalHealth: number, maxRadius: number, totalCost: number, timeToCompliance: number | null, costEfficiency: number, interimMet?: boolean | null };
type SimulationResult = { T: ScenarioTimelinePoint[], F: ScenarioFinal };
type SimulationResults = SimulationResult[] & { _seed?: number };
type ScenarioStats = Record<string, any>;
type ScenarioDecision = { id: string, name: string, mods: ScenarioParams, description?: string, tag?: string };

/**
 * @param {number} s
 * @returns {() => number}
 */
function m32(s: number): () => number {
    return function () {
        let t = (s += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Box-Muller transform: gera número de distribuição normal.
 * @param {Function} rng - função que retorna [0, 1)
 * @returns {number} ~ N(0, 1)
 */
function norm(rng: Function): number {
    const u1 = rng();
    const u2 = rng();
    return Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(6.28318530718 * u2);
}

/**
 * Clamp value entre [lo, hi].
 */
/**
 * @param {number} v
 * @param {number} lo
 * @param {number} hi
 * @returns {number}
 */
function cl(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Percentil de array.
 * @param {number[]} a
 * @param {number} p - 0 a 1
 * @returns {number}
 */
function pc(a: number[], p: number): number {
    if (!a || a.length === 0) return 0;
    const s = [...a].sort((x, y) => x - y);
    const idx = cl(Math.floor(s.length * p), 0, s.length - 1);
    return s[idx] as number;
}

// ----------------------------------------------------------------
// LHS SAMPLING
// ----------------------------------------------------------------

/**
 * Latin Hypercube Sampling matrix.
 * Gera n amostras em dims dimensões, garantindo cobertura uniforme.
 *
 * @param {number} n - número de amostras
 * @param {number} dims - dimensões
 * @param {number} [seed=12345]
 * @returns {number[][]} - matriz n x dims
 */
export function lhsMatrix(n: number, dims: number, seed: number = 12345): number[][] {
    try {
        const rng = m32(seed);
        const matrix = [];
        for (let i = 0; i < n; i++) matrix.push(new Array(dims));

        for (let d = 0; d < dims; d++) {
            const samples = [];
            for (let i = 0; i < n; i++) samples.push((i + rng()) / n);
            // Shuffle
            for (let i = n - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                [samples[i], samples[j]] = [samples[j] as number, samples[i] as number];
            }
            for (let i = 0; i < n; i++) (matrix[i] as number[])[d] = samples[i] as number;
        }
        return matrix;
    } catch (_e) {
        // Fallback: amostragem puramente aleatória
        const rng = m32(42);
        const fb = [];
        for (let i = 0; i < n; i++) {
            const row = [];
            for (let d = 0; d < dims; d++) row.push(rng());
            fb.push(row);
        }
        return fb;
    }
}

// ----------------------------------------------------------------
// CLIMATE MODIFIER
// ----------------------------------------------------------------

/**
 * Climate modifier for a given month.
 * Calcula modificador climático: penalidade no decaimento, boost na dispersão, mult na falha.
 * Retorna valores neutros quando parâmetros climáticos estão ausentes (backward-compatible).
 *
 * @param {Object} P - simulation parameters
 * @param {number} m - current month (0-based)
 * @returns {{ decayPenalty: number, dispersionBoost: number, failureMult: number }}
 */
/**
 * @param {ScenarioParams} P
 * @param {number} m
 * @returns {{ decayPenalty: number, dispersionBoost: number, failureMult: number }}
 */
function climMod(P: ScenarioParams, m: number): { decayPenalty: number, dispersionBoost: number, failureMult: number } {
    const stress = P.climateStress ?? 0;
    const amp = P.seasonalAmplitude ?? 0;
    const trend = P.climateTrend ?? 0;
    const freq = P.extremeEventFreq ?? 1;
    // Seasonal cycle: 12-month period, peak at month 3 (BR summer)
    // Ciclo sazonal: período 12 meses, pico no mês 3 (verão chuvoso hemisfério sul)
    const seasonal = amp * Math.sin((2 * Math.PI * (m - 3)) / 12);
    // Progressive worsening, capped to avoid unbounded growth
    // Piora progressiva com cap para evitar crescimento ilimitado
    const progressive = Math.min(1 + trend * m, 3.0);
    return {
        decayPenalty: cl(stress * progressive * (1 + seasonal), -0.5, 0.9),
        dispersionBoost: cl(stress * 0.5 * progressive * (1 + seasonal), -0.3, 1.0),
        failureMult: Math.max(0.1, freq * (1 + stress * 0.3 * progressive)),
    };
}

// ----------------------------------------------------------------
// SIMULATION CORE
// ----------------------------------------------------------------

/**
 * Executa uma única simulação de cenário ambiental.
 *
 * @param {Object} P - parâmetros da simulação
 * @param {number[]|number} seedOrUniforms - seed ou array de uniforms LHS
 * @returns {Object} - resultado da simulação
 */
/**
 * @param {ScenarioParams} P
 * @param {number[] | number} seedOrUniforms
 * @returns {SimulationResult}
 */
export function sim(P: ScenarioParams, seedOrUniforms: number[] | number): SimulationResult {
    try {
        let idx = 0;
        let rng;

        if (typeof seedOrUniforms === 'object' && Array.isArray(seedOrUniforms)) {
            const uniforms = seedOrUniforms;
            rng = () => (idx < uniforms.length ? (uniforms[idx++] as number) : Math.random());
        } else {
            rng = m32(seedOrUniforms);
        }

        const TL = []; // Timeline
        const MO = P.months || 120; // 10 anos default

        // Estado inicial
        let concentration = P.initialConcentration || 1000;
        let plumeRadius = P.initialRadius || 50;
        let health = P.initialHealth || 70; // Índice de saúde ambiental 0-100
        let compliance = false;
        let complianceMonth = -1;
        let failure = false;
        let failureMonth = -1;
        let cumulativeCost = P.initialCost || 0;
        const remediationActive = P.remediationActive || false;
        let monitoringCost = P.monitoringCost || 5000;

        // Parâmetros de incerteza (correlacionados)
        const zDecay = norm(rng);
        const zDispersion = norm(rng);
        const zCost = norm(rng);

        // Parâmetros avançados (defaults neutros para backward compat)
        const delay = P.implementationDelay ?? 0;
        const iTarget = P.interimTarget ?? 0;
        const iMonth = P.interimTargetMonth ?? 0;

        for (let m = 0; m < MO; m++) {
            // Climate modifier - neutro quando params climáticos ausentes
            const cm = climMod(P, m);

            // Taxa de decaimento natural
            let decayRate = P.naturalDecayRate || 0.005;

            // Efeito da remediação (com delay de implementação)
            if (remediationActive && m >= delay) {
                const remEff = P.remediationEfficiency || 0.15;
                const mEff = m - delay; // meses efetivos de remediação
                // Eficiência diminui com tempo (saturação)
                const efficiencyDecay = Math.max(0.3, 1 - mEff / (MO * 0.7));
                decayRate += remEff * efficiencyDecay;
            }

            // Climate penalty on decay efficiency
            // Penalidade climática no decaimento (negativo = boost por mitigação)
            decayRate *= Math.max(0.1, 1 - cm.decayPenalty);

            // Incerteza no decaimento
            const effectiveDecay = decayRate * (1 + 0.3 * zDecay * (0.5 + 0.5 * rng()));

            // Atualização de concentração
            concentration *= 1 - effectiveDecay;
            concentration = Math.max(concentration, P.backgroundLevel || 0.1);

            // GHG uncertainty: multiplicative noise from EF, AD, and GWP conversion
            // Incerteza GHG: ruído multiplicativo de fator de emissão, dado de atividade, e GWP
            const efU = P.emissionFactorUncertainty ?? 0;
            const adU = P.activityDataUncertainty ?? 0;
            const gwpU = P.gwpUncertainty ?? 0;
            if (efU > 0 || adU > 0 || gwpU > 0) {
                concentration *= Math.max(0.01, (1 + efU * norm(rng)) * (1 + adU * norm(rng)) * (1 + gwpU * norm(rng)));
            }

            // Dispersão da pluma (com boost climático)
            const dispersionRate = P.dispersionRate || 0.02;
            const effectiveDispersion = dispersionRate * (1 + cm.dispersionBoost) * (1 + 0.2 * zDispersion * rng());
            plumeRadius *= 1 + effectiveDispersion;

            // Evento de falha (cisne negro, com multiplicador climático)
            if (!failure && rng() < (P.failureProbability || 0.001) * cm.failureMult) {
                failure = true;
                failureMonth = m;
                concentration *= 1.5; // Spike de concentração
                cumulativeCost += P.emergencyCost || 100000;
            }

            // Custos (com discount rate, delay no OPEX, e carbon pricing)
            const opexActive = remediationActive && m >= delay;
            const monthlyCost = monitoringCost + (opexActive ? P.remediationOpex || 8000 : 0);
            const costNoise = 1 + 0.1 * zCost * rng();
            const dr = P.discountRate ?? 0;
            const discountFactor = dr > 0 ? 1 / Math.pow(1 + dr, m) : 1;
            let monthCost = monthlyCost * costNoise * discountFactor;

            // Carbon pricing - custo proporcional ao nível de emissão
            const cp = P.carbonPrice ?? 0;
            if (cp > 0) {
                const cpGrowth = P.carbonPriceGrowth ?? 0;
                const cpVol = P.carbonPriceVolatility ?? 0;
                const priceNoise = cpVol > 0 ? Math.max(0.1, 1 + cpVol * norm(rng)) : 1;
                const currentPrice = cp * (1 + cpGrowth * m) * priceNoise;
                monthCost += ((currentPrice * concentration) / 12) * discountFactor;
            }
            cumulativeCost += monthCost;

            // Verificação de conformidade
            if (!compliance && concentration <= (P.threshold || 100)) {
                compliance = true;
                complianceMonth = m;
                // Reduz custo de monitoramento após conformidade
                monitoringCost *= 0.6;
            }

            // Atualização saúde ambiental
            const healthTrend = compliance ? 0.5 : failure ? -2 : -0.1;
            health = cl(health + healthTrend + 2 * norm(rng), 0, 100);

            TL.push({
                m: m + 1,
                concentration,
                plumeRadius,
                health,
                compliance,
                cumulativeCost,
                failure,
            });
        }

        const L = TL[MO - 1] as ScenarioTimelinePoint;
        return {
            T: TL,
            F: {
                compliance,
                complianceMonth,
                failure,
                failureMonth,
                finalConcentration: L.concentration,
                finalHealth: L.health,
                maxRadius: Math.max(...TL.map((t) => t.plumeRadius)),
                totalCost: L.cumulativeCost,
                timeToCompliance: compliance ? complianceMonth : null,
                costEfficiency: compliance ? L.cumulativeCost / (complianceMonth + 1) : Infinity,
                // Interim target milestone - null se não configurado
                interimMet:
                    iTarget > 0 && iMonth > 0 && iMonth <= MO
                        ? (TL[iMonth - 1]?.concentration ?? Infinity) <= iTarget
                        : null,
            },
        };
    } catch (e) {
        console.error('[ScenarioSim] Simulation error:', e);
        // Safe fallback
        return {
            T: [],
            F: {
                compliance: false,
                complianceMonth: -1,
                failure: false,
                failureMonth: -1,
                finalConcentration: P.initialConcentration || 0,
                finalHealth: 50,
                maxRadius: P.initialRadius || 50,
                totalCost: P.initialCost || 0,
                timeToCompliance: null,
                costEfficiency: Infinity,
            },
        };
    }
}

// ----------------------------------------------------------------
// BATCH SIMULATION
// ----------------------------------------------------------------

/**
 * Executa N simulações Monte Carlo com LHS.
 *
 * @param {Object} P - parâmetros base
 * @param {number} [n=300] - número de runs
 * @param {number} [seed?] - seed opcional para reprodutibilidade; undefined = aleatório
 * @returns {Object[]} - resultados individuais (com _seed anexada)
 */
/**
 * @param {ScenarioParams} P
 * @param {number} [n]
 * @param {number} [seed?]
 * @returns {SimulationResults}
 */
export function runAll(P: ScenarioParams, n: number = 300, seed?: number): SimulationResults {
    // Quando seed é explicitamente fornecida, usar runAllSeeded para reprodutibilidade total.
    // LHS usa Math.random() quando esgota o vetor de amostras, quebrando determinismo.
    if (seed != null) return runAllSeeded(P, n, seed);

    const effectiveSeed = Math.floor(Math.random() * 0xffffffff);
    try {
        const lhs = lhsMatrix(n, 30, effectiveSeed); // 20 base + 4 clima + 3 EF/AD/GWP + 3 carbono/desconto
                const results: SimulationResults= [];

        for (let i = 0; i < n; i++) {
            results.push(sim(P, lhs[i] as number[]));
        }

        // Verificação de saúde: se muitas simulações falharam, retry
        const dead = results.filter((r) => r.F.finalConcentration === (P.initialConcentration || 0)).length;
        if (dead > n * 0.2) {
            // Fallback: seeds determinísticas
            return runAllSeeded(P, n, effectiveSeed);
        }

        results._seed = effectiveSeed;
        return results;
    } catch (e) {
        console.warn('[ScenarioSim] LHS failed, using seeded fallback:', e);
        return runAllSeeded(P, n, effectiveSeed);
    }
}

/**
 * Fallback com seeds determinísticas.
 * @param {number} [seed=42]
 */
/**
 * @param {ScenarioParams} n
 * @param {number} n
 * @param {number} [n]
 * @returns {SimulationResults}
 */
function runAllSeeded(P: ScenarioParams, n: number, seed: number = 42): SimulationResults {
        const results: SimulationResults= [];
    for (let i = 0; i < n; i++) {
        results.push(sim(P, i * 7919 + seed));
    }
    results._seed = seed;
    return results;
}

// ----------------------------------------------------------------
// STATISTICS & SUMMARIES
// ----------------------------------------------------------------

/**
 * Calcula estatísticas agregadas de múltiplas simulações.
 *
 * @param {Object[]} results - array de resultados do sim()
 * @param {number|null} [budget=null] - orçamento total (R$); se informado, calcula costOverrunRate
 * @returns {Object} - estatísticas resumidas
 */
/**
 * @param {SimulationResult[]} results
 * @param {number | null} [budget]
 * @returns {ScenarioStats | null}
 */
export function calculateStats(results: SimulationResult[], budget: number | null = null): ScenarioStats | null {
    const n = results.length;
    if (n === 0) return null;

    const finals = results.map((r) => r.F);

    // Probabilidades
    const complianceRate = finals.filter((f) => f.compliance).length / n;
    const failureRate = finals.filter((f) => f.failure).length / n;
    const costOverrunRate = budget != null ? finals.filter((f) => f.totalCost > budget).length / n : 0;

    // Interim target compliance rate - null se não configurado
    const interimComplianceRate =
        finals[0]?.interimMet !== null && finals[0]?.interimMet !== undefined
            ? finals.filter((f) => f.interimMet === true).length / n
            : null;

    // Arrays para percentis
    const concentrations = finals.map((f) => f.finalConcentration);
    const costs = finals.map((f) => f.totalCost);
    const healths = finals.map((f) => f.finalHealth);
    const timesToCompliance = finals.reduce((acc, f) => {
        if (f.timeToCompliance !== null) acc.push(f.timeToCompliance);
        return acc;
    }, ([] as number[]));

    // Estatísticas de timeline
    const timelineStats = [];
    const months = results[0]?.T?.length || 0;
    for (let m = 0; m < months; m++) {
        const monthConcs = results.map((r) => r.T[m]?.concentration || 0);
        const monthCosts = results.map((r) => r.T[m]?.cumulativeCost || 0);
        const monthHealths = results.map((r) => r.T[m]?.health || 0);

        timelineStats.push({
            month: m + 1,
            concentration: {
                p10: pc(monthConcs, 0.1),
                p25: pc(monthConcs, 0.25),
                p50: pc(monthConcs, 0.5),
                p75: pc(monthConcs, 0.75),
                p90: pc(monthConcs, 0.9),
            },
            cost: {
                p10: pc(monthCosts, 0.1),
                p25: pc(monthCosts, 0.25),
                p50: pc(monthCosts, 0.5),
                p75: pc(monthCosts, 0.75),
                p90: pc(monthCosts, 0.9),
            },
            health: {
                p10: pc(monthHealths, 0.1),
                p50: pc(monthHealths, 0.5),
                p90: pc(monthHealths, 0.9),
            },
        });
    }

    return {
        nRuns: n,
        probabilities: {
            compliance: complianceRate,
            failure: failureRate,
            costOverrun: costOverrunRate,
        },
        interimComplianceRate,
        finalConcentration: {
            p10: pc(concentrations, 0.1),
            p50: pc(concentrations, 0.5),
            p90: pc(concentrations, 0.9),
            mean: concentrations.reduce((a, b) => a + b, 0) / n,
        },
        totalCost: {
            p10: pc(costs, 0.1),
            p50: pc(costs, 0.5),
            p90: pc(costs, 0.9),
            mean: costs.reduce((a, b) => a + b, 0) / n,
        },
        finalHealth: {
            p10: pc(healths, 0.1),
            p50: pc(healths, 0.5),
            p90: pc(healths, 0.9),
        },
        timeToCompliance:
            timesToCompliance.length > 0
                ? {
                      p10: pc(timesToCompliance, 0.1),
                      p50: pc(timesToCompliance, 0.5),
                      p90: pc(timesToCompliance, 0.9),
                      mean: timesToCompliance.reduce((a, b) => a + b, 0) / timesToCompliance.length,
                  }
                : null,
        timeline: timelineStats,
    };
}

// ----------------------------------------------------------------
// COMPOSITE SCORE
// ----------------------------------------------------------------

/**
 * Calcula score composto 0-100 para um cenário.
 * Similar ao score do exemplo pessoal, mas para métricas ambientais.
 *
 * @param {Object} stats - resultado de calculateStats()
 * @param {Object} weights - pesos opcionais
 * @returns {Object} - { score, breakdown }
 */
/**
 * @param {ScenarioStats} stats
 * @param {Record<string, number>} [weights]
 * @returns {ScenarioStats}
 */
export function calculateScore(stats: ScenarioStats, weights: Record<string, number> = {}): ScenarioStats {
    const w = {
        compliance: 30,
        noFailure: 20,
        costEfficiency: 20,
        health: 15,
        speed: 15,
        ...weights,
    };

    const p = stats.probabilities;
    const score = cl(
        Math.round(
            p.compliance * w.compliance +
                (1 - p.failure) * w.noFailure +
                (1 - p.costOverrun) * w.costEfficiency +
                (stats.finalHealth?.p50 / 100) * w.health +
                (stats.timeToCompliance ? cl(1 - stats.timeToCompliance.p50 / 120, 0, 1) * w.speed : 0),
        ),
        0,
        100,
    );

    return {
        score,
        color: score >= 70 ? '#34d399' : score >= 45 ? '#f59e0b' : '#ef4444',
        label: score >= 70 ? 'Cenário favorável' : score >= 45 ? 'Atenção necessária' : 'Risco elevado',
        breakdown: {
            compliance: { value: p.compliance, points: p.compliance * w.compliance },
            noFailure: { value: 1 - p.failure, points: (1 - p.failure) * w.noFailure },
            costEfficiency: { value: 1 - p.costOverrun, points: (1 - p.costOverrun) * w.costEfficiency },
            health: {
                value: (stats.finalHealth?.p50 || 0) / 100,
                points: ((stats.finalHealth?.p50 || 0) / 100) * w.health,
            },
            speed: {
                value: stats.timeToCompliance ? cl(1 - stats.timeToCompliance.p50 / 120, 0, 1) : 0,
                points: stats.timeToCompliance ? cl(1 - stats.timeToCompliance.p50 / 120, 0, 1) * w.speed : 0,
            },
        },
    };
}

// ----------------------------------------------------------------
// DECISION COMPARISON
// ----------------------------------------------------------------

/*
 * Compara múltiplas estratégias de decisão.
 *
 * @param {Object} baseParams - parâmetros base
 * @param {Array<{id, name, mods}>} decisions - array de decisões
 * @param {number} [n=200] - número de simulações por decisão
 * @param {Object} [weights={}] - pesos para calculateScore
 * @param {number|null} [budget=null] - orçamento para costOverrunRate
 * @returns {Array} - resultados comparativos
 */
/**
 * @param {ScenarioParams} baseParams
 * @param {ScenarioDecision[]} decisions
 * @param {number} [n]
 * @param {Record<string, number>} [weights]
 * @param {number | null} [budget]
 * @returns {ScenarioStats}
 */
export function compareDecisions(baseParams: ScenarioParams, decisions: ScenarioDecision[], n: number = 200, weights: Record<string, number> = {}, budget: number | null = null): ScenarioStats {
    // Baseline
    const baselineResults = runAll(baseParams, n);
    const baselineStats = (calculateStats(baselineResults, budget) as ScenarioStats);
    const baselineScore = calculateScore(baselineStats, weights);

    const comparisons = decisions.map((decision) => {
        // Aplicar modificações da decisão
        const params = { ...baseParams, ...decision.mods };
        const results = runAll(params, n);
        const stats = (calculateStats(results, budget) as ScenarioStats);
        const score = calculateScore(stats, weights);

        return {
            id: decision.id,
            name: decision.name,
            description: decision.description,
            tag: decision.tag,
            stats,
            score,
            deltas: {
                score: score.score - baselineScore.score,
                compliance: stats.probabilities.compliance - baselineStats.probabilities.compliance,
                failure: stats.probabilities.failure - baselineStats.probabilities.failure,
                cost: stats.totalCost.p50 - baselineStats.totalCost.p50,
                time:
                    stats.timeToCompliance?.p50 && baselineStats.timeToCompliance?.p50
                        ? stats.timeToCompliance.p50 - baselineStats.timeToCompliance.p50
                        : null,
            },
            impact:
                Math.abs(score.score - baselineScore.score) > 8
                    ? 'alto'
                    : Math.abs(score.score - baselineScore.score) > 2
                      ? 'medio'
                      : 'baixo',
        };
    });

    // Ordenar por delta de score
    comparisons.sort((a, b) => b.deltas.score - a.deltas.score);

    return {
        baseline: { stats: baselineStats, score: baselineScore },
        comparisons,
    };
}
