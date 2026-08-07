// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Optimization - Public API
// ADR: ADR-023
/* ================================================================
   OPTIMIZATION PUBLIC API — Ponto de entrada para otimizacao GA.

   Orquestra: Web Worker, fitness function, uncertainty proxy,
   e entrega resultado pronto para o handler/UI.

   Uso:
     import { runOptimization, cancelOptimization } from './index.js';
     const handle = runOptimization(config, onProgress);
     // ...
     cancelOptimization(handle.id);
   ================================================================ */
import { createFitnessFunction, computeDetailedCost } from './fitnessFunction.js';
import { uncertaintyReduction } from './uncertaintyProxy.js';
import { runGA } from './geneticAlgorithm.js';
// ----------------------------------------------------------------
// STATE - Tracks active optimizations
// ----------------------------------------------------------------
let _nextId = 1;
const _activeRuns: Map<any, any> = new Map();
// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------
type OptimizationConfig = Record<string, any>;
type OptimizationRunResult = Record<string, any>;
// ----------------------------------------------------------------
// CONFIG NORMALIZATION
// ----------------------------------------------------------------
const DEFAULT_COST_DEFAULTS = { drilling: 350, installation: 2500, decommission: 1500 };
const DEFAULT_WEIGHTS = { uncertainty: 0.7, cost: 0.3 };
const DEFAULT_DEPTH_RANGE = [15, 80];

function _defaultOptimizationConfig(): Required<OptimizationConfig> {
    return {
        existingPoints: [],
        bounds: undefined as unknown as OptimizationConfig['bounds'],
        numCandidates: 3,
        maxBudget: 100000,
        costDefaults: DEFAULT_COST_DEFAULTS,
        avgAnalyticalCost: 200,
        numReadingsPerYear: 4,
        horizonYears: 5,
        escalationRate: 0.05,
        appZones: [],
        weights: DEFAULT_WEIGHTS,
        populationSize: 100,
        generations: 500,
        tournamentSize: 3,
        mutationSigma: 5,
        elitismPercent: 5,
        stagnationLimit: 50,
        seed: 42,
        depthRange: DEFAULT_DEPTH_RANGE,
    };
}

function normalizeOptimizationConfig(config: OptimizationConfig): Required<OptimizationConfig> {
    return { ..._defaultOptimizationConfig(), ...config, bounds: config.bounds } as Required<OptimizationConfig>;
}
// ----------------------------------------------------------------
// RESULT BUILDERS
// ----------------------------------------------------------------
function buildOptimizationResult(
    gaResult: any,
    costBreakdown: any,
    uncReduction: number,
    startTime: number,
): OptimizationRunResult {
    const stats = gaResult.stats as any;
    return {
        best: gaResult.best,
        costBreakdown,
        uncertaintyReduction: uncReduction,
        stats: {
            convergenceMs: Date.now() - startTime,
            generations: stats.generations,
            finalFitness: stats.finalFitness,
            stagnatedAt: stats.stagnatedAt,
        },
    };
}

function buildAsyncResultPayload(msg: any, config: OptimizationConfig): OptimizationRunResult {
    const costDefaults = config.costDefaults || DEFAULT_COST_DEFAULTS;
    const costBreakdown = computeDetailedCost(
        msg.best.genes,
        costDefaults,
        config.avgAnalyticalCost || 200,
        config.numReadingsPerYear || 4,
        config.horizonYears || 5,
        config.escalationRate || 0.05,
    );
    const uncReduction = uncertaintyReduction(
        msg.best.genes,
        config.existingPoints || [],
        config.bounds as any,
    );
    return {
        best: msg.best,
        costBreakdown,
        uncertaintyReduction: uncReduction,
        stats: msg.stats,
    };
}
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * @typedef {Object} OptimizationConfig
 * @property {Array<{x: number, z: number}>} existingPoints - Pontos de monitoramento atuais
 * @property {Object} bounds - { minX, maxX, minZ, maxZ }
 * @property {number} numCandidates - Quantidade de pontos novos a propor
 * @property {number} maxBudget - Orcamento maximo (BRL)
 * @property {Object} [costDefaults] - { drilling, installation, decommission }
 * @property {number} [avgAnalyticalCost=200] - Custo medio por analise
 * @property {number} [numReadingsPerYear=4]
 * @property {number} [horizonYears=5]
 * @property {number} [escalationRate=0.05]
 * @property {any} [appZones] - Zonas de exclusao APP
 * @property {Object} [weights={ uncertainty: 0.7, cost: 0.3 }]
 * @property {number} [populationSize=100]
 * @property {number} [generations=500]
 * @property {number} [tournamentSize=3]
 * @property {number} [mutationSigma=5]
 * @property {number} [elitismPercent=5]
 * @property {number} [stagnationLimit=50]
 * @property {number} [seed=42]
 * @property {number[]} [depthRange=[15,80]]
 */
/**
 * @typedef {Object} OptimizationResult
 * @property {Object} best - Melhor individuo { genes[], fitness }
 * @property {Object} costBreakdown - Custos detalhados { totalCapex, totalOpex, totalCost, perCandidate[] }
 * @property {number} uncertaintyReduction - Fracao de reducao de incerteza [0,1]
 * @property {Object} stats - { convergenceMs, generations, stagnatedAt }
 */
/**
 * Executa otimizacao GA no thread principal.
 * Para uso em workers, use runOptimizationAsync().
 *
 * @param {OptimizationConfig} config
 * @param {Function} [onProgress] - (gen, bestFitness, avgFitness) => void
 * @returns {OptimizationResult}
 */
export function runOptimization(config: any, onProgress: any = () => { }) {
    const cfg = normalizeOptimizationConfig(config);
    const startTime = Date.now();

    const fitnessFunction = createFitnessFunction({
        existingPoints: cfg.existingPoints,
        bounds: cfg.bounds,
        maxBudget: cfg.maxBudget,
        costDefaults: cfg.costDefaults,
        avgAnalyticalCost: cfg.avgAnalyticalCost,
        numReadingsPerYear: cfg.numReadingsPerYear,
        horizonYears: cfg.horizonYears,
        escalationRate: cfg.escalationRate,
        appZones: cfg.appZones,
        weights: cfg.weights,
    });

    const gaResult = runGA({
        numCandidates: cfg.numCandidates,
        bounds: cfg.bounds,
        populationSize: cfg.populationSize,
        generations: cfg.generations,
        tournamentSize: cfg.tournamentSize,
        mutationSigma: cfg.mutationSigma,
        elitismPercent: cfg.elitismPercent,
        stagnationLimit: cfg.stagnationLimit,
        seed: cfg.seed,
        depthRange: cfg.depthRange,
        fitnessFunction: fitnessFunction as any,
        onProgress,
    } as any);

    const costBreakdown = computeDetailedCost(
        gaResult.best.genes,
        cfg.costDefaults,
        cfg.avgAnalyticalCost,
        cfg.numReadingsPerYear,
        cfg.horizonYears,
        cfg.escalationRate,
    );
    const uncReduction = uncertaintyReduction(gaResult.best.genes, cfg.existingPoints, cfg.bounds as any);

    return buildOptimizationResult(gaResult, costBreakdown, uncReduction, startTime);
}
/**
 * Executa otimizacao GA em Web Worker (async, non-blocking).
 *
 * @param {OptimizationConfig} config
 * @param {Function} [onProgress] - (gen, bestFitness, avgFitness) => void
 * @returns {Promise<{ id: number, result: OptimizationResult }>}
 */
export function runOptimizationAsync(config: any, onProgress: any = () => { }) {
    const id = _nextId++;
    return new Promise((resolve, reject) => {
        let worker;
        try {
            // Worker path relativo ao index.html
            worker = new Worker(new URL('./optimizationWorker.js', import.meta.url), { type: 'module' });
        }
        catch (_: any) {
            // Fallback: caminho absoluto para ambientes sem import.meta.url em workers
            try {
                worker = new Worker('./js/core/analytics/optimization/optimizationWorker.js');
            }
            catch (_e2: any) {
                // Fallback final: roda no main thread
                console.warn('[Optimization] Worker nao disponivel, rodando no main thread');
                try {
                    const result = runOptimization(config, onProgress);
                    resolve({ id, result });
                }
                catch (e3: any) {
                    reject(e3);
                }
                return;
            }
        }
        _activeRuns.set(id, worker);
        worker.onmessage = (e) => {
            const msg = e.data;
            if (msg.id !== id)
                return;
            if (msg.type === 'progress') {
                onProgress(msg.gen, msg.bestFitness, msg.avgFitness);
            }
            else if (msg.type === 'result') {
                _activeRuns.delete(id);
                worker.terminate();
                const result = buildAsyncResultPayload(msg, config);
                resolve({ id, result });
            }
            else if (msg.type === 'error') {
                _activeRuns.delete(id);
                worker.terminate();
                reject(new Error(msg.message));
            }
        };
        worker.onerror = (err) => {
            _activeRuns.delete(id);
            worker.terminate();
            // Fallback ao main thread
            console.warn('[Optimization] Worker erro, fallback ao main thread:', err.message);
            try {
                const result = runOptimization(config, onProgress);
                resolve({ id, result });
            }
            catch (e: any) {
                reject(e);
            }
        };
        // Envia config para o worker
        worker.postMessage({ id, action: 'run', config });
    });
}
/**
 * Cancela uma otimizacao em andamento.
 *
 * @param {number} runId - ID retornado por runOptimizationAsync
 * @returns {boolean} - true se cancelou, false se nao encontrado
 */
export function cancelOptimization(runId: any) {
    const worker = _activeRuns.get(runId);
    if (!worker)
        return false;
    worker.postMessage({ id: runId, action: 'cancel' });
    // Termina o worker apos dar chance de processar cancel
    setTimeout(() => {
        if (_activeRuns.has(runId)) {
            worker.terminate();
            _activeRuns.delete(runId);
        }
    }, 500);
    return true;
}
/**
 * Verifica se ha otimizacao ativa.
 * @returns {boolean}
 */
export function isOptimizationRunning() {
    return _activeRuns.size > 0;
}
