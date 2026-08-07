// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   P1-5 Phase 5 — Impact Estimator × Environmental Valuation wire
   Roadmap §0.2 P1-5 Environmental Valuation (ENV-VAL-001)

   Converte outputs do core/impact/impactEstimator.js em especificação
   de projeto ambiental consumível por core/financial/projectValuation.js,
   e propaga incerteza UNC-001 via core/impact/monteCarloWire.js.

   Objetivo: responder "qual o VPL/VPLA do projeto de remediação?"
   dado um estimate (determinístico ou Monte Carlo) de custos.

   Convenção de sinais (coerente com projectValuation.js):
     - capex: negativo (desembolso inicial)
     - opex: negativo (custos recorrentes)
     - revenue: positivo (receita/evitado: ativo ambiental, carbon credit)

   Referência:
     - SPEC_ENVIRONMENTAL_VALUATION.md §P5 (wire com UNC-001 P2)
     - ADR: core/impact/ADR.md + core/financial/ (ENV-VAL-001)
   ================================================================ */
import { computeProjectValuation, normalizeEnvironmentalProject } from '../financial/projectValuation.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
import { quantile } from '../uncertainty/monteCarlo.js';
/**
 * @typedef {Object} ImpactEstimateRange
 * @property {number} min
 * @property {number} base
 * @property {number} max
 */
/**
 * @typedef {Object} ImpactEstimateResult
 * @property {boolean} [ok]
 * @property {ImpactEstimateRange} [estimate] - Generic range alias (impactEstimator.js)
 * @property {ImpactEstimateRange} [totalCost] - Soil/groundwater estimator output
 * @property {ImpactEstimateRange} [annualCost] - Groundwater annual cost
 * @property {ImpactEstimateRange} [totalCost10Y] - Groundwater 10-year NPV
 * @property {ImpactEstimateRange} [totalValue] - Occupational impact
 */
/**
 * @typedef {Object} EnvironmentalProjectShape
 * @property {string} [name]
 * @property {string} [category]
 * @property {number} capex
 * @property {number} opex
 * @property {number} revenue
 * @property {number} periods
 * @property {number} discountRate
 * @property {string} [unit]
 */
/**
 * @typedef {Object} ProjectValuationResult
 * @property {boolean} ok
 * @property {number} vpl
 * @property {number} [vpla]
 * @property {number} [crf]
 * @property {number} [annualFlow]
 * @property {EnvironmentalProjectShape} [project]
 */
/**
 * @typedef {Object} WireOptions
 * @property {number} [discountRate=0.08] - Taxa de desconto anual
 * @property {number} [periods=10] - Horizonte em anos
 * @property {number} [revenueAnnual=0] - Receita anual (ativo ambiental evitado)
 * @property {string} [category='remediation'] - Categoria do projeto
 * @property {string} [name] - Nome do projeto
 * @property {'base'|'min'|'max'} [point='base'] - Ponto do range a usar
 */
type _WirePoint = 'base' | 'min' | 'max';

interface _CostPair {
    capex: number;
    opex: number;
}

function _normalizeWirePoint(point: unknown): _WirePoint {
    return point === 'min' || point === 'max' ? point : 'base';
}

function _extractCostFromEstimate(estimate: Record<string, any>, point: _WirePoint): _CostPair | null {
    const totalCostRange = estimate.estimate || estimate.totalCost;
    if (totalCostRange && typeof totalCostRange[point] === 'number') {
        return { capex: -Math.abs(totalCostRange[point]), opex: 0 };
    }
    if (estimate.annualCost && typeof estimate.annualCost[point] === 'number') {
        return { capex: 0, opex: -Math.abs(estimate.annualCost[point]) };
    }
    if (estimate.totalValue && typeof estimate.totalValue[point] === 'number') {
        return { capex: -Math.abs(estimate.totalValue[point]), opex: 0 };
    }
    return null;
}

/**
 * Converte uma estimativa de impactEstimator em especificação de projeto
 * ambiental avaliável por computeProjectValuation.
 *
 * @param {ImpactEstimateResult} estimate
 * @param {WireOptions} [opts]
 * @returns {EnvironmentalProjectShape|null} projeto ambiental normalizado, ou null se input invalido
 */
export function impactEstimateToEnvironmentalProject(estimate: any, opts: any = {}) {
    if (!estimate || typeof estimate !== 'object')
        return null;
    const point = _normalizeWirePoint(opts.point);
    const category = opts.category || 'remediation';
    const costs = _extractCostFromEstimate(estimate, point);
    if (!costs)
        return null;
    return /** @type {EnvironmentalProjectShape} */ (normalizeEnvironmentalProject({
        name: opts.name || `Impact project (${category})`,
        category,
        capex: costs.capex,
        opex: costs.opex,
        revenue: Number(opts.revenueAnnual) || 0,
        periods: Number(opts.periods) || 10,
        discountRate: toFiniteNumber(opts.discountRate, 0.08),
        unit: 'BRL',
    }));
}
/**
 * Calcula VPL/VPLA a partir de uma estimativa determinística do impactEstimator.
 *
 * @param {ImpactEstimateResult} estimate
 * @param {WireOptions} [opts]
 * @returns {ProjectValuationResult|null} { ok, vpl, vpla, crf, annualFlow, project } ou null
 */
export function valuateImpactEstimate(estimate: any, opts: any = {}) {
    const project = impactEstimateToEnvironmentalProject(estimate, opts);
    if (!project)
        return null;
    const valuation = /** @type {any} */ (computeProjectValuation({
        capex: project.capex,
        opex: project.opex,
        revenue: project.revenue,
        periods: project.periods,
        discountRate: project.discountRate,
    }));
    return {
        ok: true,
        ...valuation,
        project,
    };
}
/**
 * Propaga incerteza (Monte Carlo) em valuation de projeto ambiental.
 * Usa realizações min/base/max do estimate como distribuição triangular
 * implícita e computa percentis do VPL resultante.
 *
 * Convenção: se o estimate tem Monte Carlo nativo (samples), usa direto;
 * caso contrário, deriva 3 cenários (pessimista/base/otimista) do range.
 *
 * @param {ImpactEstimateResult} estimate
 * @param {WireOptions & { samples?: number[] }} [opts]
 * @returns {Object|null} { ok, p50, p025, p975, ic95: [low, high], scenarios }
 */
export function valuateImpactEstimateMC(estimate: any, opts: any = {}) {
    if (!estimate || typeof estimate !== 'object')
        return null;
    // Caminho 1: Monte Carlo samples já disponíveis (ex: output de monteCarloWire)
    if (Array.isArray(opts.samples) && opts.samples.length > 0) {
        const vpls = /** @type {number[]} */ (opts.samples
            .map((cost: any) => {
            const synthEstimate = { totalCost: { min: cost, base: cost, max: cost } };
            const v = valuateImpactEstimate(synthEstimate, opts);
            return v?.vpl;
        })
            .filter((x: any) => Number.isFinite(x)));
        if (vpls.length === 0)
            return null;
        vpls.sort((a: any, b: any) => a - b);
        return {
            ok: true,
            samples: vpls.length,
            p50: quantile(vpls, 0.5),
            p025: quantile(vpls, 0.025),
            p975: quantile(vpls, 0.975),
            ic95: [quantile(vpls, 0.025), quantile(vpls, 0.975)],
        };
    }
    // Caminho 2: range {min, base, max} - valua 3 cenários
    /** @type {Record<string, {vpl: number, vpla: number}>} */
    const scenarios: Record<string, any> = {};
    for (const point of /** @type {Array<'min'|'base'|'max'>} */ (['min', 'base', 'max'])) {
        const v = valuateImpactEstimate(estimate, { ...opts, point });
        if (v)
            scenarios[point] = { vpl: v.vpl, vpla: v.vpla ?? 0 };
    }
    if (Object.keys(scenarios).length === 0)
        return null;
    // IC95 ordenado crescente (low VPL, high VPL). Note: max custo = min VPL.
    const vplsAll = [scenarios.min?.vpl, scenarios.max?.vpl].filter((x: any) => Number.isFinite(x));
    vplsAll.sort((a: any, b: any) => a - b);
    return {
        ok: true,
        scenarios,
        p50: scenarios.base?.vpl,
        ic95: vplsAll,
    };
}
