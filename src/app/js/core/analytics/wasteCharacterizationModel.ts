// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * @fileoverview Waste Characterization Model - ABNT NBR 10004 Classification,
 * Leaching, Solubilization and Disposal Route Selection
 *
 * Pure analytical module: no DOM, no IDB, no fetch, no Three.js dependencies.
 *
 * Academic references:
 *   - ABNT NBR 10004:2004 - Resíduos sólidos - Classificação
 *   - ABNT NBR 10005:2004 - Procedimento para obtenção de extrato lixiviado
 *   - ABNT NBR 10006:2004 - Procedimento para obtenção de extrato solubilizado
 *   - CONAMA Resolução 358/2005 - Resíduos de serviços de saúde
 *   - CONAMA Resolução 316/2002 - Tratamento térmico de resíduos
 */

'use strict';

interface WasteHazardResult { hazard_score: number; waste_class: 'I' | 'IIA' | 'IIB' }
interface LeachingResult { leachate_mg_L: number; exceeds_list8: boolean }
interface SolubilizationResult { solubilized_mg_L: number; exceeds_annex_g: boolean }
interface DisposalRouteResult { route: string; cost_tier: 'low' | 'medium' | 'high' }

// Limites da Lista 8 (NBR 10005 - lixiviação) em mg/L
// List 8 leachate limits [mg/L] per NBR 10005
const LEACHATE_LIMITS: Record<string, number> = {
    As: 1.0,
    Pb: 1.0,
    Cr: 5.0,
    Cd: 0.5,
    Hg: 0.1,
};

// Limites do Anexo G (NBR 10006 - solubilização) em mg/L
// Annex G solubilization limits [mg/L] per NBR 10006
const SOLUBILIZATION_LIMITS: Record<string, number> = {
    Fe: 0.3,
    Mn: 0.1,
    NO3: 45,
    SO4: 250,
};

// ─── Waste Hazard Score (pontuação de periculosidade) ────────────────────────

/**
 * Compute hazard score and classify waste per ABNT NBR 10004:2004.
 * Cálculo da pontuação de periculosidade e classificação do resíduo (NBR 10004).
 *
 * Classe I (perigoso): qualquer característica de periculosidade presente.
 * Classe IIA (não perigoso / não inerte): sem periculosidade mas biodegradável.
 * Classe IIB (inerte): sem periculosidade, inerte a ensaios NBR 10005/10006.
 *
 * @param {'solid'|'liquid'|'sludge'|'gas'} physical_state - Physical state of waste
 * @param {number} ignitability   - Ignitability score [0–4]
 * @param {number} corrosivity    - Corrosivity score [0–4]
 * @param {number} reactivity     - Reactivity score [0–4]
 * @param {number} toxicity_score - Toxicity score [0–4]
 * @returns {WasteHazardResult}
 * @throws {RangeError} if scores are outside [0, 4]
 * @throws {TypeError} if physical_state is invalid
 */
export function computeWasteHazardScore(physical_state: 'solid' | 'liquid' | 'sludge' | 'gas', ignitability: number, corrosivity: number, reactivity: number, toxicity_score: number): WasteHazardResult {
    const VALID_STATES = ['solid', 'liquid', 'sludge', 'gas'];
    if (!VALID_STATES.includes(physical_state))
        throw new TypeError(`physical_state must be one of ${VALID_STATES.join(', ')}`);

    const checks: Array<[string, number]> = [
        ['ignitability', ignitability],
        ['corrosivity', corrosivity],
        ['reactivity', reactivity],
        ['toxicity_score', toxicity_score],
    ];
    for (const [name, val] of checks) {
        if (!Number.isFinite(val) || val < 0 || val > 4) throw new RangeError(`${name} must be in [0, 4]`);
    }

    const hazard_score = ignitability + corrosivity + reactivity + toxicity_score;

    // Perigoso se qualquer característica de periculosidade > 0
    let waste_class: 'I' | 'IIA' | 'IIB';
    if (hazard_score > 0) {
        waste_class = 'I';
    } else if (physical_state === 'liquid' || physical_state === 'sludge') {
        // Líquidos e lodos sem periculosidade → IIA (potencialmente não inertes)
        waste_class = 'IIA';
    } else {
        waste_class = 'IIB';
    }

    return Object.freeze({ hazard_score, waste_class } as WasteHazardResult);
}

/** @type {Record<string, number>} */
const LEACHATE_LIMITS_INDEX = LEACHATE_LIMITS;

/** @type {Record<string, number>} */
const SOLUBILIZATION_LIMITS_INDEX = SOLUBILIZATION_LIMITS;

// ─── Leaching Concentration (concentração no lixiviado) ─────────────────────

/**
 * Compute leachate concentration using NBR 10005 procedure (L/S = 20).
 * Cálculo da concentração no extrato lixiviado - NBR 10005 (relação L/S = 20).
 *
 * C_lixiviado = C_residuo [mg/kg] × LF / 20
 *   LF = fator de lixiviação [0–1] representando mobilidade do contaminante
 *   Relação L:S = 20 (20 L de líquido por kg de resíduo seco)
 *
 * @param {number} waste_concentration_mg_kg - Contaminant in waste [mg/kg dry weight]
 * @param {number} leaching_factor           - Leaching factor [0–1]
 * @param {string} [parameter='As']          - Parameter name for Lista 8 comparison
 * @returns {LeachingResult}
 * @throws {RangeError} if concentrations are negative or leaching_factor not in [0,1]
 */
export function computeLeachingConcentration(waste_concentration_mg_kg: number, leaching_factor: number, parameter: string = 'As'): LeachingResult {
    if (waste_concentration_mg_kg < 0) throw new RangeError('waste_concentration_mg_kg must be >= 0');
    if (leaching_factor < 0 || leaching_factor > 1) throw new RangeError('leaching_factor must be in [0, 1]');

    // Concentração no lixiviado: C_res × LF / LS_ratio
    const LS_RATIO = 20;
    const leachate_mg_L = (waste_concentration_mg_kg * leaching_factor) / LS_RATIO;

    const limit = LEACHATE_LIMITS_INDEX[parameter];
    const exceeds_list8 = limit !== undefined ? leachate_mg_L > limit : false;

    return Object.freeze({ leachate_mg_L, exceeds_list8 } as LeachingResult);
}

// ─── Solubilization Risk (risco de solubilização) ────────────────────────────

/**
 * Compute solubilized concentration using NBR 10006 procedure (L/S = 10).
 * Cálculo da concentração no extrato solubilizado - NBR 10006 (L/S = 10).
 *
 * C_sol = C_residuo × SF / 10
 *   SF = solubility_factor [0–1]
 *
 * @param {number} waste_concentration_mg_kg - Contaminant in waste [mg/kg]
 * @param {number} solubility_factor         - Solubility factor [0–1]
 * @param {string} [target_parameter='Fe']   - Parameter for Annex G comparison
 * @returns {SolubilizationResult}
 * @throws {RangeError} if inputs are out of bounds
 */
export function computeSolubilizationRisk(waste_concentration_mg_kg: number, solubility_factor: number, target_parameter: string = 'Fe'): SolubilizationResult {
    if (waste_concentration_mg_kg < 0) throw new RangeError('waste_concentration_mg_kg must be >= 0');
    if (solubility_factor < 0 || solubility_factor > 1) throw new RangeError('solubility_factor must be in [0, 1]');

    const LS_RATIO = 10;
    const solubilized_mg_L = (waste_concentration_mg_kg * solubility_factor) / LS_RATIO;

    const limit = SOLUBILIZATION_LIMITS_INDEX[target_parameter];
    const exceeds_annex_g = limit !== undefined ? solubilized_mg_L > limit : false;

    return Object.freeze({ solubilized_mg_L, exceeds_annex_g } as SolubilizationResult);
}

// ─── Disposal Route Classification (rota de disposição) ─────────────────────

/**
 * Classify waste disposal route based on class, hazard, and thermal properties.
 * Classificação da rota de disposição de resíduos - CONAMA 316/2002, 358/2005.
 *
 * Regras de seleção (prioridade decrescente):
 *   1. Co-processamento: PCI > 18 MJ/kg e Classe I → coprocessing
 *   2. Incineração: orgânico > 50% e tóxico (hazard_score > 2) → incineration
 *   3. Classe I → aterro industrial classe I
 *   4. Classe IIA → aterro classe IIA
 *   5. Classe IIB → aterro inerte ou reciclagem
 *
 * @param {'I'|'IIA'|'IIB'} waste_class          - Waste class (NBR 10004)
 * @param {number} hazard_score                   - Hazard score [0–16]
 * @param {number} organic_content_pct            - Organic content [%]
 * @param {number} calorific_value_MJ_kg          - Lower calorific value [MJ/kg]
 * @returns {DisposalRouteResult}
 * @throws {RangeError} if organic_content_pct not in [0,100] or calorific_value negative
 * @throws {TypeError} if waste_class is invalid
 */
export function classifyDisposalRoute(waste_class: 'I' | 'IIA' | 'IIB', hazard_score: number, organic_content_pct: number, calorific_value_MJ_kg: number): DisposalRouteResult {
    if (!['I', 'IIA', 'IIB'].includes(waste_class)) throw new TypeError("waste_class must be 'I', 'IIA' or 'IIB'");
    if (organic_content_pct < 0 || organic_content_pct > 100)
        throw new RangeError('organic_content_pct must be in [0, 100]');
    if (calorific_value_MJ_kg < 0) throw new RangeError('calorific_value_MJ_kg must be >= 0');

    let route: string;
    let cost_tier: 'low' | 'medium' | 'high';

    if (waste_class === 'I' && calorific_value_MJ_kg > 18) {
        // Co-processamento em forno de cimento (CONAMA 316/2002)
        route = 'coprocessing';
        cost_tier = 'medium';
    } else if (organic_content_pct > 50 && hazard_score > 2) {
        // Incineração para resíduos orgânicos tóxicos (CONAMA 316/2002)
        route = 'incineration';
        cost_tier = 'high';
    } else if (waste_class === 'I') {
        // Aterro industrial classe I (perigosos sem valor calorífico para co-proc)
        route = 'landfill_I';
        cost_tier = 'high';
    } else if (waste_class === 'IIA') {
        // Aterro classe IIA (não perigoso / não inerte)
        route = 'landfill_IIA';
        cost_tier = 'medium';
    } else {
        // Classe IIB: inertes podem ir para aterro IIB ou reciclagem
        route = organic_content_pct < 5 ? 'recycling' : 'landfill_IIB';
        cost_tier = 'low';
    }

    return Object.freeze({ route, cost_tier } as DisposalRouteResult);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const wasteCharacterizationModelMeta = {
    name: 'wasteCharacterizationModel',
    description: 'wasteCharacterizationModel',
    category: 'analytics',
    familyTags: ['waste'],
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
