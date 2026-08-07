// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
/* ================================================================
   IMPACT × UNC-001 Phase 2 — Monte Carlo wire
   Roadmap §0.2 P1-2 Impact Estimator + P1-5 Environmental Valuation Phase 5

   Bridge entre core/impact/impactEstimator.js (estimativas determinísticas com
   range {min, base, max}) e core/uncertainty/monteCarlo.js (LHS-based MC com
   N iterações). Output: percentis (p2.5, p50, p97.5), IC95, probabilidade de
   exceder threshold configurável.

   Uso:
     const result = estimateSoilWithMonteCarlo({
         volume: { distribution: 'triangular', params: { min: 800, mode: 1000, max: 1400 } },
         contaminant: 'hydrocarbons',
         method: 'exSitu'
     }, { n: 1000, seed: 42, exceedanceThreshold: 5_000_000 });
     // → { mean, sd, ic95: [p2.5, p97.5], p50, probExceedance, ... }

   Referência:
   - JCGM 101:2008 (MC supplement to GUM) — justifica uso de MC para propagação
     não-linear de incerteza em passivo ambiental (unitCost × volume × factors).
   - IPCC 2006 Vol1 Ch3 §3.2.2.4 — Tier 2 Monte Carlo quando a cadeia de
     propagação tem componentes não-lineares.

   ADR: core/impact/ADR.md + core/uncertainty/ADR.md
   ================================================================ */
import { runMonteCarlo, quantile } from '../uncertainty/monteCarlo.js';
import { estimateSoilRemediation, estimateGroundwaterRemediation, estimateOccupationalImpact, } from './impactEstimator.js';
/**
 * @typedef {Object} MCDistributionSpec
 * @property {'normal'|'lognormal'|'triangular'|'uniform'|'empirical'} distribution
 * @property {Object} params - Depende da distribuição
 */
/**
 * @typedef {Object} MCResult
 * @property {boolean} ok
 * @property {number} [mean] - Média das N realizações
 * @property {number} [sd] - Desvio padrão
 * @property {[number, number]} [ic95] - [p2.5, p97.5]
 * @property {number} [p50] - Mediana
 * @property {number} [p25]
 * @property {number} [p75]
 * @property {number} [probExceedance] - Probabilidade de exceder threshold (se configurado)
 * @property {number} [threshold] - Threshold usado (echo back)
 * @property {number} [n_iter]
 * @property {number} [seed]
 * @property {string} [method]
 * @property {number} [elapsed_ms]
 * @property {string} [reason]
 * @property {string} [outputKey]
 * @property {string} [detail]
 * @property {string} [phase]
 */
/**
 * @typedef {'inSitu'|'exSitu'|'thermal'} SoilRemediationMethod
 * @typedef {'simple'|'moderate'|'complex'|'extreme'} ImpactComplexity
 * @typedef {'shallow'|'medium'|'deep'|'veryDeep'} SoilDepth
 * @typedef {'industrial'|'commercial'|'agricultural'|'residential'|'protected'} SoilLandUse
 * @typedef {'none'|'minor'|'moderate'|'severe'} AquiferImpact
 */
// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────
/**
 * Normaliza spec de variável: aceita (a) número literal (vira constante) ou
 * (b) objeto MCDistributionSpec. Números literais permitem API flexível onde
 * caller fornece só os campos incertos.
 *
 * @param {number|MCDistributionSpec} spec
 * @param {string} id
 * @returns {{id: string, distribution: string, params: Object, constant?: boolean}}
 */
function normalizeVariable(spec: any, id: any) {
    if (typeof spec === 'number') {
        // Constante: uniform com min === max sempre retorna o valor (triangular
        // rejeita min === max como degenerate).
        return {
            id,
            distribution: 'uniform',
            params: { min: spec, max: spec },
            constant: true,
        };
    }
    if (!spec || typeof spec !== 'object') {
        throw new Error(`Invalid variable spec for "${id}"`);
    }
    return {
        id,
        distribution: spec.distribution,
        params: spec.params || {},
    };
}
/**
 * Calcula probabilidade de exceder threshold a partir de amostras ordenadas.
 * P(X > T) = |{x ∈ samples : x > T}| / N
 *
 * @param {number[]} samples - Amostras (não precisam estar ordenadas)
 * @param {number} threshold
 * @returns {number} 0..1
 */
function probabilityOfExceedance(samples: any, threshold: any) {
    if (!Array.isArray(samples) || samples.length === 0)
        return 0;
    if (!Number.isFinite(threshold))
        return 0;
    let count = 0;
    for (const v of samples)
        if (v > threshold)
            count++;
    return count / samples.length;
}
/**
 * Wraps result do runMonteCarlo em shape unificado MCResult.
 * @param {Object} mcResult - Output de runMonteCarlo
 * @param {string} outputKey - Qual key de outputs usar (default 'cost')
 * @param {number} [threshold?]
 * @returns {MCResult}
 */
function buildMCResult(mcResult: any, outputKey = "cost", threshold?: any) {
    const mc = (mcResult) as any;
    const out = mc.outputs?.[outputKey];
    if (!out) {
        return /** @type {MCResult} */ ({ ok: false, reason: 'mc_output_missing', outputKey });
    }
    const sorted = [...out.samples].sort((/** @type {number} */ a, b: number) => a - b);
    const result: any = {
        ok: true,
        mean: out.mean,
        sd: out.sd,
        ic95: out.ic95,
        p50: quantile(sorted, 0.5),
        p25: quantile(sorted, 0.25),
        p75: quantile(sorted, 0.75),
        n_iter: mc.n_iter,
        seed: mc.seed,
        method: mc.method,
        elapsed_ms: mc.elapsed_ms,
    };
    if (Number.isFinite(threshold)) {
        result.probExceedance = probabilityOfExceedance(out.samples, /** @type {number} */ (threshold));
        result.threshold = threshold;
    }
    return result;
}
// ──────────────────────────────────────────────────────────────────────────
// Soil remediation + MC
// ──────────────────────────────────────────────────────────────────────────
/**
 * Propaga incerteza via Monte Carlo em estimativa de remediação de solo.
 * Aceita `volume` como distribuição (ou número literal). Factores categóricos
 * (complexity/depth/landUse/aquiferImpact) são fixos - MC sobre eles exigiria
 * mapping categórico→numérico, fora do escopo Phase 2.
 *
 * @param {Object} params
 * @param {number|MCDistributionSpec} params.volume - Volume (m³) com incerteza
 * @param {'hydrocarbons'|'metals'|'solvents'|'pesticides'} params.contaminant
 * @param {SoilRemediationMethod} [params.method='exSitu']
 * @param {ImpactComplexity} [params.complexity='moderate']
 * @param {SoilDepth} [params.depth='medium']
 * @param {SoilLandUse} [params.landUse='industrial']
 * @param {AquiferImpact} [params.aquiferImpact='none']
 * @param {Object} [mcOpts]
 * @param {number} [mcOpts.n=1000]
 * @param {number} [mcOpts.seed=42]
 * @param {number} [mcOpts.exceedanceThreshold] - Se passado, calcula P(cost > threshold)
 * @returns {MCResult}
 */
export function estimateSoilWithMonteCarlo(params: any, mcOpts: any = {}) {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const { n = 1000, seed = 42, exceedanceThreshold } = /** @type {any} */ (mcOpts);
    let volumeVar: any;
    try {
        volumeVar = normalizeVariable(params.volume, 'volume');
    }
    catch (e: any) {
        return { ok: false, reason: 'invalid_volume_spec', detail: /** @type {any} */ (e).message };
    }
    const fixedParams = /** @type {{
        contaminant: 'hydrocarbons'|'metals'|'solvents'|'pesticides',
        method?: SoilRemediationMethod,
        complexity?: ImpactComplexity,
        depth?: SoilDepth,
        landUse?: SoilLandUse,
        aquiferImpact?: AquiferImpact,
    }} */ ({
        contaminant: params.contaminant,
        method: params.method,
        complexity: params.complexity,
        depth: params.depth,
        landUse: params.landUse,
        aquiferImpact: params.aquiferImpact,
    });
    // Validação inicial: roda estimate com volume=1 para detectar inputs inválidos
    const probe = (estimateSoilRemediation({ ...fixedParams, volume: 1 })) as any;
    if (!probe.ok) {
        return { ok: false, reason: probe.reason, phase: 'validation' };
    }
    const mcResult = runMonteCarlo({
        variables: [volumeVar],
        model: (sample: any) => {
            const est = (estimateSoilRemediation({ ...fixedParams, volume: sample.volume })) as any;
            if (!est.ok)
                return { cost: 0 };
            // Usa `base` do triple {min, base, max} para cada iteração. Incerteza
            // aditiva via factors categóricos fica fora do escopo - seria MC Tier 3.
            return { cost: Number(est.estimate?.base ?? 0) };
        },
        n,
        seed,
    });
    return buildMCResult(mcResult, 'cost', exceedanceThreshold);
}
// ──────────────────────────────────────────────────────────────────────────
// Groundwater + MC
// ──────────────────────────────────────────────────────────────────────────
/**
 * Propaga incerteza em remediação de água subterrânea (anos de operação + taxa
 * de desconto como variáveis aleatórias).
 *
 * @param {Object} params
 * @param {'pumpAndTreat'|'prb'|'naturalAttenuation'} params.method
 * @param {number|MCDistributionSpec} [params.years=5]
 * @param {number|MCDistributionSpec} [params.discountRate=0.08]
 * @param {ImpactComplexity} [params.complexity='moderate']
 * @param {Object} [mcOpts]
 * @returns {MCResult}
 */
export function estimateGroundwaterWithMonteCarlo(params: any, mcOpts: any = {}) {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const { n = 1000, seed = 42, exceedanceThreshold } = /** @type {any} */ (mcOpts);
    const variables: any[] = [];
    try {
        variables.push(normalizeVariable(params.years ?? 5, 'years'));
        variables.push(normalizeVariable(params.discountRate ?? 0.08, 'discountRate'));
    }
    catch (e: any) {
        return { ok: false, reason: 'invalid_variable_spec', detail: /** @type {any} */ (e).message };
    }
    // Probe validação
    const groundwaterBaseParams = /** @type {{
        method: 'pumpAndTreat'|'prb'|'naturalAttenuation',
        complexity?: ImpactComplexity,
        years: number,
        discountRate: number,
    }} */ ({
        method: params.method,
        complexity: params.complexity,
        years: 5,
        discountRate: 0.08,
    });
    const probe = (estimateGroundwaterRemediation(groundwaterBaseParams)) as any;
    if (!probe.ok) {
        return { ok: false, reason: probe.reason, phase: 'validation' };
    }
    const mcResult = runMonteCarlo({
        variables,
        model: (sample: any) => {
            const est = (estimateGroundwaterRemediation({
                method: params.method,
                complexity: params.complexity,
                years: sample.years,
                discountRate: sample.discountRate,
            })) as any;
            if (!est.ok)
                return { cost: 0 };
            return { cost: Number(est.totalNPV?.base ?? 0) };
        },
        n,
        seed,
    });
    return buildMCResult(mcResult, 'cost', exceedanceThreshold);
}
// ──────────────────────────────────────────────────────────────────────────
// Occupational + MC
// ──────────────────────────────────────────────────────────────────────────
/**
 * Propaga incerteza no passivo ocupacional (workers expostos + duração +
 * compliance de EPI como variáveis aleatórias).
 *
 * @param {Object} params
 * @param {number|MCDistributionSpec} params.workersExposed - Número de trabalhadores
 * @param {'low'|'moderate'|'high'|'extreme'} [params.exposureLevel='moderate']
 * @param {number|MCDistributionSpec} [params.duration=5] - Anos de exposição
 * @param {number|MCDistributionSpec} [params.ppeCompliance=0.7] - 0..1 compliance de EPI
 * @param {Object} [mcOpts]
 * @returns {MCResult}
 */
export function estimateOccupationalWithMonteCarlo(params: any, mcOpts: any = {}) {
    if (!params || typeof params !== 'object') {
        return { ok: false, reason: 'params_required' };
    }
    const { n = 1000, seed = 42, exceedanceThreshold } = /** @type {any} */ (mcOpts);
    const variables: any[] = [];
    try {
        variables.push(normalizeVariable(params.workersExposed, 'workersExposed'));
        variables.push(normalizeVariable(params.duration ?? 5, 'duration'));
        variables.push(normalizeVariable(params.ppeCompliance ?? 0.7, 'ppeCompliance'));
    }
    catch (e: any) {
        return { ok: false, reason: 'invalid_variable_spec', detail: /** @type {any} */ (e).message };
    }
    const mcResult = runMonteCarlo({
        variables,
        model: (sample: any) => {
            const est = (estimateOccupationalImpact({
                workersExposed: sample.workersExposed,
                duration: sample.duration,
                ppeCompliance: sample.ppeCompliance,
                exposureLevel: params.exposureLevel,
            })) as any;
            if (!est.ok)
                return { cost: 0 };
            return { cost: Number(est.estimate?.base ?? 0) };
        },
        n,
        seed,
    });
    return buildMCResult(mcResult, 'cost', exceedanceThreshold);
}
