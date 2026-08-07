// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Scenario Simulation - Public API
// ADR: ADR-025
/* ================================================================
   SCENARIO SIMULATION PUBLIC API
   ================================================================

   Ponto de entrada para simulação de cenários ambientais.
   Orquestra: LHS sampling, Monte Carlo simulation, statistics.

   Uso:
     import { runScenarioSimulation, compareDecisions } from './index.js';
     const results = runScenarioSimulation(params, config);
     const comparison = compareDecisions(baseParams, decisions);
   ================================================================ */
import { runAll, calculateStats, calculateScore, compareDecisions as engineCompareDecisions } from './engine.js';
import { getScenario, getScenarioParams, getAllScenarios, getAllOverlays, getOverlay, resolveScenarioParams, getCustomOverlays, upsertCustomOverlay, deleteCustomOverlay, CLIMATE_OVERLAYS, } from './scenarioDefs.js';
import { getDecision, getDecisionsByTag, ENVIRONMENTAL_DECISIONS, getAllDecisions, getCustomDecisions, upsertCustomDecision, deleteCustomDecision, } from './decisionDefs.js';
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * @typedef {Object} SimulationConfig
 * @property {number} [numRuns=300] - número de simulações Monte Carlo
 * @property {number} [seed] - seed opcional para reproducibilidade
 * @property {Object} [decisionMods] - modificações de decisão a aplicar
 * @property {Object} [weights] - pesos para cálculo de score
 */
/**
 * @typedef {Object} SimulationResult
 * @property {Object[]} runs - resultados individuais de cada simulação
 * @property {Object} stats - estatísticas agregadas (percentis)
 * @property {Object} score - score composto 0-100
 * @property {Object} config - configuração usada
 */
/**
 * Executa simulação completa de cenário ambiental.
 *
 * @param {Object} params - parâmetros do cenário
 * @param {SimulationConfig} [config={}] - configurações
 * @returns {SimulationResult}
 */
export function runScenarioSimulation(params: any, config: any = {}) {
    const { numRuns = 300, decisionMods = {}, weights = {}, seed, budget } = config;
    // Aplicar modificações de decisão se houver
    const effectiveParams = decisionMods ? { ...params, ...decisionMods } : params;
    // Executar simulações (seed preserva reprodutibilidade)
    const runs = /** @type {Array<Record<string, unknown>> & {_seed?: number}} */ (runAll(/** @type {Record<string, unknown>} */ (effectiveParams), numRuns, seed));
    const usedSeed = runs._seed;
    // Calcular estatísticas (budget desbloqueia costOverrunRate)
    const stats = calculateStats(runs, budget ?? null);
    // Calcular score
    const score = calculateScore(stats as any, weights);
    return {
        runs,
        stats,
        score,
        config: { numRuns, params: effectiveParams, seed: usedSeed, budget: budget ?? null },
    };
}
/**
 * Executa simulação a partir de um cenário pré-definido.
 *
 * @param {string} scenarioId - ID do cenário em scenarioDefs.js
 * @param {SimulationConfig} [config={}]
 * @returns {SimulationResult|null}
 */
export function runScenarioById(scenarioId: any, config: any = {}) {
    const params = getScenarioParams(scenarioId);
    if (!params) {
        console.error(`[ScenarioSim] Scenario not found: ${scenarioId}`);
        return null;
    }
    return runScenarioSimulation(params, config);
}
/**
 * Compara múltiplas estratégias de decisão.
 *
 * @param {Object} baseParams - parâmetros base
 * @param {Array<string|Object>} decisions - IDs de decisões ou objetos de decisão
 * @param {number} [numRuns=200]
 * @returns {Object} - { baseline, comparisons }
 */
export function compareStrategies(baseParams: any, decisions: any, numRuns = 200, weights: any = {}, budget = null) {
    // Resolver IDs para objetos de decisão completos
    const decisionObjects = decisions
        .map((d: any) => {
        if (typeof d === 'string') {
            return getDecision(d);
        }
        return d;
    })
        .filter(Boolean);
    return engineCompareDecisions(
    /** @type {Record<string, unknown>} */ (baseParams), 
    /** @type {Array<Record<string, unknown>>} */ (decisionObjects), numRuns, weights, budget);
}
/**
 * Compara estratégias usando um cenário pré-definido como base.
 *
 * @param {string} scenarioId
 * @param {Array<string>} decisionIds
 * @param {number} [numRuns=200]
 * @returns {Object|null}
 */
export function compareStrategiesByScenario(scenarioId: any, decisionIds: any, numRuns = 200) {
    const params = getScenarioParams(scenarioId);
    if (!params)
        return null;
    return compareStrategies(params, decisionIds, numRuns);
}
/**
 * Gera relatório resumido de simulação.
 *
 * @param {SimulationResult} result
 * @returns {string}
 */
export function generateSummary(result: any) {
    const { stats, score } = /** @type {any} */ (result);
    const p = stats.probabilities;
    return `
Simulação de Cenário Ambiental
============================
Score: ${score.score}/100 (${score.label})

Probabilidades:
- Conformidade: ${(p.compliance * 100).toFixed(1)}%
- Falha: ${(p.failure * 100).toFixed(1)}%
- Estouro de orçamento: ${(p.costOverrun * 100).toFixed(1)}%

Custos (R$):
- P10: ${stats.totalCost.p10.toLocaleString()}
- Mediana: ${stats.totalCost.p50.toLocaleString()}
- P90: ${stats.totalCost.p90.toLocaleString()}

Tempo para Conformidade (meses):
${stats.timeToCompliance
        ? `
- P10: ${stats.timeToCompliance.p10.toFixed(0)}
- Mediana: ${stats.timeToCompliance.p50.toFixed(0)}
- P90: ${stats.timeToCompliance.p90.toFixed(0)}
`
        : '- Não atingiu conformidade na maioria das simulações'}
    `.trim();
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export { getScenario, getScenarioParams, getAllScenarios, getAllOverlays, getOverlay, resolveScenarioParams, getCustomOverlays, upsertCustomOverlay, deleteCustomOverlay, CLIMATE_OVERLAYS, getDecision, getDecisionsByTag, ENVIRONMENTAL_DECISIONS, getAllDecisions, getCustomDecisions, upsertCustomDecision, deleteCustomDecision, };
// Re-export engine functions for advanced users
export { lhsMatrix, sim, runAll, calculateStats, calculateScore } from './engine.js';
// ----------------------------------------------------------------
// GENERIC MODEL REGISTRY (motor × modelos plugáveis) — item #9
// ----------------------------------------------------------------
import { registerBuiltinSimModels } from './models/index.js';
registerBuiltinSimModels();
export {
    registerSimModel,
    getSimModel,
    getAllSimModels,
    getSimModelsByCategory,
    getSimModelPickerGroups,
    runSimModel,
    runGenericModel,
    SIM_MODEL_CATEGORY_LABELS,
} from './modelRegistry.js';
export { BIOMASS_PYROLYSIS_MODEL } from './models/biomassPyrolysis.js';
