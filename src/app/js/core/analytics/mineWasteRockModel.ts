// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Mine Waste Rock Model - Pure analytical module
// Gestão de estéril de mineração - módulo analítico puro sem dependências de DOM/IDB/fetch
//
// References / Referências:
//   Lawrence R.W. & Wang Y. (1997) Determination of Neutralization Potential for ARD Prediction,
//     4th ICARD, Vancouver
//   MEND (2009) Review of Passive Systems for Treatment of Acid Mine Drainage, Report 3.14.1
//   Price W.A. (2009) Prediction Manual for Drainage Chemistry from Sulphidic Geologic Materials,
//     MEND Report 1.20.1
//   ABNT NBR 10005:2004 - Lixiviação de resíduos sólidos

'use strict';

// Fatores minerais para cálculo de AP - fração molar de S por mineral sulfetado
// Mineral factors for AP calculation - molar stoichiometry (Price 2009, Table 4-1)
/** @type {Record<string, number>} */
const MINERAL_FACTORS = {
    pirita: 1.0, // FeS2
    pirrotita: 1.14, // Fe(1-x)S — maior reatividade
    calcopirita: 0.78, // CuFeS2 — menor S por unidade de massa
};

/**
 * Compute Acid Potential (AP) of sulfidic waste rock.
 * Calcula o Potencial de Acidez (PA) de estéril sulfetado.
 *
 * AP = (sulfide_pct / 100) × 31.25 × mineral_factor
 * Fator 31.25 = 1000 g CaCO₃ / (32 g/mol S × 1 mol S/mol CaCO₃)
 *
 * @param {number} sulfide_pct     - Total sulfide-S content (%), must be in [0, 100]
 * @param {string} mineral_factor  - Mineral type key: 'pirita'|'pirrotita'|'calcopirita', or numeric value
 * @returns {{ ap_kg_CaCO3_t: number }} - Acid potential in kg CaCO₃/tonne
 */
export function computeAcidPotential(sulfide_pct: number, mineral_factor: string | number): { ap_kg_CaCO3_t: number } {
    if (typeof sulfide_pct !== 'number') throw new TypeError('sulfide_pct must be a number');
    if (sulfide_pct < 0 || sulfide_pct > 100) throw new RangeError('sulfide_pct must be in [0, 100]');

    let factor: number;
    if (typeof mineral_factor === 'string') {
        if (!(MINERAL_FACTORS as Record<string, number>)[mineral_factor]) {
            throw new TypeError(`mineral_factor string must be one of: ${Object.keys(MINERAL_FACTORS).join(', ')}`);
        }
        factor = (MINERAL_FACTORS as Record<string, number>)[mineral_factor]!;
    } else if (typeof mineral_factor === 'number') {
        if (mineral_factor <= 0) throw new RangeError('mineral_factor (numeric) must be > 0');
        factor = mineral_factor;
    } else {
        throw new TypeError('mineral_factor must be a string (mineral name) or positive number');
    }

    // PA = (%S / 100) × 31.25 × fator_mineral [kg CaCO₃/t]
    const ap_kg_CaCO3_t = (sulfide_pct / 100) * 31.25 * factor;
    return { ap_kg_CaCO3_t };
}

/**
 * Compute Neutralizing Potential (NP) from carbonate and oxide minerals.
 * Calcula o Potencial de Neutralização (PN) a partir de carbonatos e óxidos.
 *
 * NP = carbonate_pct/100 × 1000 + oxide_pct/100 × 700  [kg CaCO₃/t]
 * Baseado em Lawrence & Wang (1997) - fatores estequiométricos por tipo de mineral
 *
 * @param {number} carbonate_pct - Carbonate mineral content (%), must be in [0, 100]
 * @param {number} oxide_pct     - Oxide mineral content (%), must be in [0, 100]
 * @returns {{ np_kg_CaCO3_t: number }} - Neutralizing potential in kg CaCO₃/tonne
 */
export function computeNeutralizingPotential(carbonate_pct: number, oxide_pct: number): { np_kg_CaCO3_t: number } {
    if (typeof carbonate_pct !== 'number' || typeof oxide_pct !== 'number') {
        throw new TypeError('carbonate_pct and oxide_pct must be numbers');
    }
    if (carbonate_pct < 0 || carbonate_pct > 100) throw new RangeError('carbonate_pct must be in [0, 100]');
    if (oxide_pct < 0 || oxide_pct > 100) throw new RangeError('oxide_pct must be in [0, 100]');
    if (carbonate_pct + oxide_pct > 100) throw new RangeError('carbonate_pct + oxide_pct cannot exceed 100%');

    // PN = fração_carbonato × 1000 + fração_óxido × 700 [kg CaCO₃/t]
    const np_kg_CaCO3_t = (carbonate_pct / 100) * 1000 + (oxide_pct / 100) * 700;
    return { np_kg_CaCO3_t };
}

/**
 * Compute Net Neutralizing Potential (NNP) and classify ARD risk.
 * Calcula o Potencial de Neutralização Líquido (PNL) e classifica risco de DAM.
 *
 * NNP = NP − AP     [kg CaCO₃/t]
 * NPR = NP / AP     [adimensional]
 *
 * Classification (Price 2009):
 *   potentially_acid:    NNP < −20  OR  NPR < 1.0
 *   uncertain:           NNP ∈ [−20, 20]  OR  NPR ∈ [1.0, 2.0]
 *   non_acid_generating: NNP > 20  AND  NPR > 2.0
 *
 * @param {number} np - Neutralizing potential (kg CaCO₃/t), must be ≥ 0
 * @param {number} ap - Acid potential (kg CaCO₃/t), must be ≥ 0
 * @returns {{ nnp: number, npr: number, classification: string }}
 */
export function computeNetNeutralizingPotential(np: number, ap: number): { nnp: number, npr: number, classification: string } {
    if (typeof np !== 'number' || typeof ap !== 'number') {
        throw new TypeError('np and ap must be numbers');
    }
    if (np < 0) throw new RangeError('np must be >= 0');
    if (ap < 0) throw new RangeError('ap must be >= 0');

    const nnp = np - ap;

    // NPR indefinido quando AP = 0 (sem sulfeto); tratar como não-gerador de ácido
    const npr = ap === 0 ? Infinity : np / ap;

    let classification;
    if (nnp < -20 || npr < 1.0) {
        classification = 'potentially_acid';
    } else if (nnp <= 20 || npr <= 2.0) {
        classification = 'uncertain';
    } else {
        classification = 'non_acid_generating';
    }

    return { nnp, npr, classification };
}

/**
 * Compute leachate concentration from waste rock using linear partitioning (Kd model).
 * Calcula concentração no lixiviado de estéril via modelo de partição linear (ABNT NBR 10005).
 *
 * C_leachate = C_total / (Kd + L/S)
 * Onde L/S é a razão líquido:sólido (liquid_solid_ratio)
 *
 * @param {number} metal_mg_kg            - Total metal content in solid (mg/kg)
 * @param {number} partition_coefficient_Kd - Sorption coefficient Kd (L/kg)
 * @param {number} porosity               - Void fraction [0, 1)
 * @param {number} liquid_solid_ratio     - L/S ratio (L/kg), must be > 0
 * @returns {{ leachate_mg_L: number, mobility_class: 'low'|'moderate'|'high' }}
 */
export function computeLeachateConcentration(metal_mg_kg: number, partition_coefficient_Kd: number, porosity: number, liquid_solid_ratio: number): { leachate_mg_L: number, mobility_class: 'low'|'moderate'|'high' } {
    if ([metal_mg_kg, partition_coefficient_Kd, porosity, liquid_solid_ratio].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (metal_mg_kg < 0) throw new RangeError('metal_mg_kg must be >= 0');
    if (partition_coefficient_Kd < 0) throw new RangeError('partition_coefficient_Kd must be >= 0');
    if (porosity < 0 || porosity >= 1) throw new RangeError('porosity must be in [0, 1)');
    if (liquid_solid_ratio <= 0) throw new RangeError('liquid_solid_ratio must be > 0');

    // Modelo de partição linear - concentração no lixiviado
    const leachate_mg_L = metal_mg_kg / (partition_coefficient_Kd + liquid_solid_ratio);

    // Classificação de mobilidade baseada em concentração no lixiviado (MEND 2009)
    /** @type {'low'|'moderate'|'high'} */
    let mobility_class: 'low' | 'moderate' | 'high';
    if (leachate_mg_L < 1) {
        mobility_class = 'low';
    } else if (leachate_mg_L <= 10) {
        mobility_class = 'moderate';
    } else {
        mobility_class = 'high';
    }

    return { leachate_mg_L, mobility_class };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const mineWasteRockModelMeta: AnalyticsModuleMeta = {
    name: 'mineWasteRockModel',
    description: 'mineWasteRockModel',
    category: 'analytics',
    familyTags: ['mining', 'waste'],
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
