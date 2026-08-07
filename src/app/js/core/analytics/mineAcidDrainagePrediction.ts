// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Mine Acid Drainage Prediction - Previsão de Drenagem Ácida de Mina (AMD/DAM)
 *
 * References / Referências:
 *  - INAP (2009). Global Acid Rock Drainage Guide (GARD Guide). www.gardguide.com
 *  - Price, W.A. (2009). Prediction Manual for Drainage Chemistry from Sulphidic Geologic
 *    Materials. MEND Report 1.20.1. doi:10.4095/248338
 *  - Smart, R. et al. (2002). EPA Acid Rock Drainage Technical Guide, Vol. I.
 *  - Acid Base Accounting (ABA) - Sobek et al. (1978). Field and laboratory methods
 *    applicable to overburdens and minesoils. EPA-600/2-78-054.
 *
 * Calculations:
 *  - NNR (Net Neutralization Ratio) = NP / AP, where
 *    NP = Neutralization Potential (kg CaCO3/tonne)
 *    AP = Acid Potential (kg CaCO3/tonne) = 31.25 × %S_total
 *  - AMD risk classification (GARD Guide, Table 2-1):
 *    NNR > 2.0  → no risk (NP >> AP, uncertainty safe)
 *    1.0–2.0    → uncertain / transitional (further kinetic testing required)
 *    < 1.0      → AMD risk (AP > NP, acid generation likely)
 *  - Simplified kinetic model: time to AMD onset (years) based on acid generation rate (AGR)
 *    and neutralizing material buffer.
 *
 * Zero DOM/IDB/Three.js/fetch dependencies.
 * Comentários: headers em inglês, explicações em português.
 *
 * @module mineAcidDrainagePrediction
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// Conversion factor: %S_total → AP (kg CaCO3/tonne)
// Fator de conversão enxofre total → potencial de acidificação (kg CaCO3/t)
// AP = (S% / 100) × (1000 g/t) × (1 mol S / 32 g) × (1 mol H2SO4 / mol S)
//    × (100 g CaCO3/mol) / (2 eq/mol) = 31.25 × S%  [Sobek et al. 1978]
const AP_CONVERSION_FACTOR = 31.25;

// AMD risk thresholds (NNR - Net Neutralization Ratio) — GARD Guide Table 2-1
// Limiares de risco AMD baseados no NNR
const NNR_NO_RISK_THRESHOLD = 2.0;
const NNR_UNCERTAIN_THRESHOLD = 1.0;

/**
 * Calculates Acid Potential (AP) from total sulfur content.
 * Calcula o Potencial de Acidificação a partir do teor de enxofre total.
 *
 * Formula: AP = 31.25 × S_total(%) [kg CaCO3/tonne] (Sobek et al. 1978)
 *
 * @param {number} sulfurPercent - Total sulfur content (% by weight, 0–100).
 * @returns {number} Acid Potential (kg CaCO3/tonne).
 * @throws {RangeError} If sulfurPercent is not in [0, 100].
 */
export function acidPotential(sulfurPercent: number): number {
    if (typeof sulfurPercent !== 'number' || sulfurPercent < 0 || sulfurPercent > 100) {
        throw new RangeError(`sulfurPercent must be in [0, 100], got: ${sulfurPercent}`);
    }
    return AP_CONVERSION_FACTOR * sulfurPercent;
}

/**
 * Calculates Net Neutralization Potential (NNP).
 * Calcula o Potencial de Neutralização Líquido (PNL).
 *
 * Formula: NNP = NP - AP [kg CaCO3/tonne]
 *
 * @param {number} neutralizationPotential - NP (kg CaCO3/tonne). Must be >= 0.
 * @param {number} ap - Acid Potential (kg CaCO3/tonne). Must be >= 0.
 * @returns {number} Net Neutralization Potential (negative = acid generating).
 * @throws {RangeError} If either value is negative.
 */
export function netNeutralizationPotential(neutralizationPotential: number, ap: number): number {
    if (typeof neutralizationPotential !== 'number' || neutralizationPotential < 0) {
        throw new RangeError(`neutralizationPotential must be >= 0, got: ${neutralizationPotential}`);
    }
    if (typeof ap !== 'number' || ap < 0) {
        throw new RangeError(`ap must be >= 0, got: ${ap}`);
    }
    return neutralizationPotential - ap;
}

/**
 * Calculates Net Neutralization Ratio (NNR = NP / AP).
 * Calcula a Razão de Neutralização Líquida (NNR = NP / AP).
 *
 * A NNR > 2.0 é considerado seguro pelo GARD Guide (sem risco de AMD).
 *
 * @param {number} np - Neutralization Potential (kg CaCO3/tonne). Must be >= 0.
 * @param {number} ap - Acid Potential (kg CaCO3/tonne). Must be > 0.
 * @returns {number} NNR value.
 * @throws {RangeError} If np < 0 or ap <= 0.
 */
export function netNeutralizationRatio(np: number, ap: number): number {
    if (typeof np !== 'number' || np < 0) {
        throw new RangeError(`np must be >= 0, got: ${np}`);
    }
    if (typeof ap !== 'number' || ap <= 0) {
        throw new RangeError(`ap must be > 0, got: ${ap}`);
    }
    return np / ap;
}

/**
 * Classifies AMD risk from NNR value following GARD Guide Table 2-1.
 * Classifica risco de AMD a partir do NNR conforme GARD Guide (Tabela 2-1).
 *
 * @param {number} nnr - Net Neutralization Ratio.
 * @returns {'no_risk'|'uncertain'|'amd_risk'} AMD risk classification.
 * @throws {RangeError} If nnr is negative.
 */
export function classifyAmdRisk(nnr: number): 'no_risk' | 'uncertain' | 'amd_risk' {
    if (typeof nnr !== 'number' || nnr < 0) {
        throw new RangeError(`nnr must be a non-negative number, got: ${nnr}`);
    }
    if (nnr >= NNR_NO_RISK_THRESHOLD) return 'no_risk';
    if (nnr >= NNR_UNCERTAIN_THRESHOLD) return 'uncertain';
    return 'amd_risk';
}

/**
 * Estimates time to AMD onset using a simplified kinetic buffer model.
 * Estima tempo (anos) para início de AMD com modelo cinético simplificado.
 *
 * Rationale: buffer time ≈ NNP (kg CaCO3/t) / AGR (kg CaCO3/t/year)
 * Applicable only when NNP > 0. When NNP <= 0, onset is immediate (0 years).
 * This is a simplified screening model; kinetic column tests provide better estimates.
 *
 * @param {number} nnp - Net Neutralization Potential (kg CaCO3/tonne).
 * @param {number} acidGenerationRateKgPerTPerYear - Annual acid generation rate (kg CaCO3/tonne/year). Must be > 0.
 * @returns {number} Estimated years to AMD onset (0 if already acid generating).
 * @throws {RangeError} If acidGenerationRateKgPerTPerYear is not positive.
 */
export function timeToAmdOnset(nnp: number, acidGenerationRateKgPerTPerYear: number): number {
    if (typeof nnp !== 'number') {
        throw new TypeError(`nnp must be a number, got: ${nnp}`);
    }
    if (typeof acidGenerationRateKgPerTPerYear !== 'number' || acidGenerationRateKgPerTPerYear <= 0) {
        throw new RangeError(`acidGenerationRateKgPerTPerYear must be > 0, got: ${acidGenerationRateKgPerTPerYear}`);
    }
    if (nnp <= 0) return 0;
    return nnp / acidGenerationRateKgPerTPerYear;
}

/**
 * Estimates annual preventive control cost for AMD.
 * Estima custo anual de controle preventivo para AMD.
 *
 * Simplified model: cost = tonnage × treatment rate (L water/tonne rock/year)
 *   × lime dose (g CaCO3/L) / 1e6 × lime cost ($/tonne CaCO3)
 * Cost reference: typical lime treatment $50–200/tonne CaCO3 (INAP GARD Guide, Ch. 6).
 *
 * @param {number} tonnage - Total material tonnage at risk.
 * @param {number} waterContactRateL_per_t_per_year - Water contacting rock (L/tonne/year).
 * @param {number} limeDoseG_per_L - Lime (CaCO3) required per litre of AMD (g/L).
 * @param {number} limeCostPerTonne - Lime cost (USD/tonne CaCO3). Default 120.
 * @returns {number} Estimated annual control cost (USD).
 * @throws {RangeError} If any numeric input is not positive.
 */
export function preventiveControlCost(
    tonnage: number,
    waterContactRateL_per_t_per_year: number,
    limeDoseG_per_L: number,
    limeCostPerTonne: number = 120,
): number {
    for (const [name, val] of [
        ['tonnage', tonnage],
        ['waterContactRateL_per_t_per_year', waterContactRateL_per_t_per_year],
        ['limeDoseG_per_L', limeDoseG_per_L],
        ['limeCostPerTonne', limeCostPerTonne],
    ] as [string, number][]) {
        if (typeof val !== 'number' || val <= 0) {
            throw new RangeError(`${name} must be a positive number, got: ${val}`);
        }
    }
    // Total lime requerida (toneladas/ano) = (L água/t/ano × t material × g CaCO3/L) / 1e6 g/t
    const limeTonnesPerYear = (waterContactRateL_per_t_per_year * tonnage * limeDoseG_per_L) / 1e6;
    return limeTonnesPerYear * limeCostPerTonne;
}

/**
 * Full static AMD prediction from raw geochemical inputs.
 * Previsão estática completa de AMD a partir de dados geoquímicos brutos.
 *
 * @param {Object} params
 * @param {number} params.sulfurPercent - Total sulfur content (% wt).
 * @param {number} params.neutralizationPotential - Measured NP (kg CaCO3/tonne).
 * @param {number} [params.acidGenerationRate] - AGR for kinetic estimate (kg CaCO3/t/year). Optional.
 * @param {number} [params.tonnage] - Tonnage for cost estimate. Optional.
 * @param {number} [params.waterContactRate] - L/tonne/year. Required with tonnage for cost.
 * @param {number} [params.limeDose] - g CaCO3/L. Required with tonnage for cost.
 * @param {number} [params.limeCost] - USD/tonne CaCO3.
 * @returns {{ap: number, np: number, nnp: number, nnr: number, riskClass: string, yearsToOnset: number|null, annualCost: number|null}}
 */
export function staticAmdPrediction(params: {
    sulfurPercent: number;
    neutralizationPotential: number;
    acidGenerationRate?: number;
    tonnage?: number;
    waterContactRate?: number;
    limeDose?: number;
    limeCost?: number;
}): {
    ap: number;
    np: number;
    nnp: number;
    nnr: number;
    riskClass: string;
    yearsToOnset: number | null;
    annualCost: number | null;
} {
    const {
        sulfurPercent,
        neutralizationPotential,
        acidGenerationRate,
        tonnage,
        waterContactRate,
        limeDose,
        limeCost,
    } = params;
    const ap = acidPotential(sulfurPercent);
    const np = neutralizationPotential;
    if (typeof np !== 'number' || np < 0) {
        throw new RangeError(`neutralizationPotential must be >= 0, got: ${np}`);
    }
    const nnp = netNeutralizationPotential(np, ap);
    // Quando AP = 0 (sem enxofre), NNR → infinito (sem risco)
    const nnr = ap > 0 ? netNeutralizationRatio(np, ap) : Infinity;
    const riskClass = ap > 0 ? classifyAmdRisk(nnr) : 'no_risk';
    const yearsToOnset = acidGenerationRate !== undefined ? timeToAmdOnset(nnp, acidGenerationRate) : null;
    const annualCost =
        tonnage !== undefined && waterContactRate !== undefined && limeDose !== undefined
            ? preventiveControlCost(tonnage, waterContactRate, limeDose, limeCost)
            : null;
    return { ap, np, nnp, nnr, riskClass, yearsToOnset, annualCost };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineAcidDrainagePredictionMeta: AnalyticsModuleMeta = {
    name: 'mineAcidDrainagePrediction',
    description: 'mineAcidDrainagePrediction',
    category: 'analytics',
    familyTags: ['mining', 'stormwater'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
