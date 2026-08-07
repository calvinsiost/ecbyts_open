// @ts-check
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
 * Air Toxics Risk Assessment - risco de câncer por inalação e classificação de
 * risco de poluentes atmosféricos tóxicos (HAPs) segundo metodologia USEPA IRIS.
 *
 * Referências:
 *   USEPA IRIS (2003). Risk Assessment Guidance for Superfund, Vol. I (RAGS Part A).
 *     EPA/540/1-89/002. DOI: 10.1289/ehp.1205586
 *   USEPA (1989). Exposure Factors Handbook. EPA/600/8-89/043.
 */
/**
 * Calcula o Risco de Inalação Unitário (IUR) a partir do CSF oral.
 * IUR = CSF × (IR / (BW × 1000)) - conversão oral-inhalação USEPA RAGS.
 * (IRIS EPA 2003, DOI: 10.1289/ehp.1205586)
 *
 * @param {number} CSF_per_mg_kg_day      - Fator de inclinação carcinogênico (mg/kg/dia)⁻¹
 * @param {number} inhalation_rate_m3_day - Taxa de inalação em m³/dia (adulto padrão = 20)
 * @param {number} body_weight_kg         - Peso corporal em kg (adulto padrão = 70)
 * @returns {{ IUR_per_ug_m3: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores não forem positivos
 */
export function computeInhalationUnitRisk(CSF_per_mg_kg_day: any, inhalation_rate_m3_day: any, body_weight_kg: any) {
    if (typeof CSF_per_mg_kg_day !== 'number' ||
        typeof inhalation_rate_m3_day !== 'number' ||
        typeof body_weight_kg !== 'number') {
        throw new TypeError('Todos os argumentos devem ser números');
    }
    if (CSF_per_mg_kg_day <= 0) {
        throw new RangeError('CSF_per_mg_kg_day deve ser positivo');
    }
    if (inhalation_rate_m3_day <= 0) {
        throw new RangeError('inhalation_rate_m3_day deve ser positivo');
    }
    if (body_weight_kg <= 0) {
        throw new RangeError('body_weight_kg deve ser positivo');
    }
    // IUR [1/(µg/m³)] = CSF [(mg/kg/dia)⁻¹] × IR [m³/dia] / (BW [kg] × 1000 [µg/mg])
    const IUR_per_ug_m3 = (CSF_per_mg_kg_day * inhalation_rate_m3_day) / (body_weight_kg * 1000);
    return { IUR_per_ug_m3 };
}
/**
 * Calcula a Concentração de Exposição Crônica média ao longo da vida (LAEC).
 * LAEC = ambient × occupancy × (years / lifetime) - USEPA RAGS Part A.
 *
 * @param {number} ambient_ug_m3      - Concentração ambiental em µg/m³
 * @param {number} occupancy_fraction - Fração de tempo no local [0, 1]
 * @param {number} years              - Anos de exposição no local
 * @param {number} lifetime_years     - Tempo médio de vida para média (70 anos padrão)
 * @returns {{ LAEC_ug_m3: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores estiverem fora dos limites físicos
 */
export function computeChronicExposureConcentration(ambient_ug_m3: any, occupancy_fraction: any, years: any, lifetime_years: any) {
    if (typeof ambient_ug_m3 !== 'number' ||
        typeof occupancy_fraction !== 'number' ||
        typeof years !== 'number' ||
        typeof lifetime_years !== 'number') {
        throw new TypeError('Todos os argumentos devem ser números');
    }
    if (ambient_ug_m3 < 0) {
        throw new RangeError('ambient_ug_m3 deve ser não-negativo');
    }
    if (occupancy_fraction < 0 || occupancy_fraction > 1) {
        throw new RangeError('occupancy_fraction deve estar em [0, 1]');
    }
    if (years <= 0) {
        throw new RangeError('years deve ser positivo');
    }
    if (lifetime_years <= 0) {
        throw new RangeError('lifetime_years deve ser positivo');
    }
    if (years > lifetime_years) {
        throw new RangeError('years não pode exceder lifetime_years');
    }
    // Concentração lifetime-averaged: considera apenas o período de exposição
    const LAEC_ug_m3 = ambient_ug_m3 * occupancy_fraction * (years / lifetime_years);
    return { LAEC_ug_m3 };
}
/**
 * Calcula o risco de câncer por inalação de poluente atmosférico tóxico.
 * Risco = LAEC [µg/m³] × IUR [1/(µg/m³)] - linear a baixas doses (USEPA IRIS).
 *
 * @param {number} LAEC_ug_m3      - Concentração de exposição crônica em µg/m³
 * @param {number} IUR_per_ug_m3   - Risco unitário de inalação em (µg/m³)⁻¹
 * @returns {{ cancer_risk: number }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores forem negativos
 */
export function computeCancerRisk(LAEC_ug_m3: any, IUR_per_ug_m3: any) {
    if (typeof LAEC_ug_m3 !== 'number' || typeof IUR_per_ug_m3 !== 'number') {
        throw new TypeError('LAEC_ug_m3 e IUR_per_ug_m3 devem ser números');
    }
    if (LAEC_ug_m3 < 0) {
        throw new RangeError('LAEC_ug_m3 deve ser não-negativo');
    }
    if (IUR_per_ug_m3 < 0) {
        throw new RangeError('IUR_per_ug_m3 deve ser não-negativo');
    }
    // Modelo linear a baixas doses: risco = concentração × risco unitário
    const cancer_risk = LAEC_ug_m3 * IUR_per_ug_m3;
    return { cancer_risk };
}
/**
 * Classifica o perigo de poluentes atmosféricos tóxicos com base no risco de
 * câncer e quociente de perigo não-carcinogênico (HQ).
 * Critérios: USEPA Risk Characterization Handbook (2000).
 *
 * @param {number} cancer_risk           - Risco de câncer (adimensional, ex: 1e-6)
 * @param {number} HQ_non_carcinogenic   - Quociente de perigo não-carcinogênico
 * @returns {{ hazard: 'acceptable'|'concern'|'action_required'|'emergency' }}
 * @throws {TypeError}  se argumentos não forem números
 * @throws {RangeError} se valores forem negativos
 */
export function classifyAirToxicsHazard(cancer_risk: any, HQ_non_carcinogenic: any) {
    if (typeof cancer_risk !== 'number' || typeof HQ_non_carcinogenic !== 'number') {
        throw new TypeError('cancer_risk e HQ_non_carcinogenic devem ser números');
    }
    if (cancer_risk < 0) {
        throw new RangeError('cancer_risk deve ser não-negativo');
    }
    if (HQ_non_carcinogenic < 0) {
        throw new RangeError('HQ_non_carcinogenic deve ser não-negativo');
    }
    // Hierarquia de classificação: pior condição prevalece
    /** @type {'acceptable'|'concern'|'action_required'|'emergency'} */
    let hazard;
    if (cancer_risk >= 1e-3 || HQ_non_carcinogenic >= 100) {
        hazard = 'emergency';
    }
    else if (cancer_risk >= 1e-4 || HQ_non_carcinogenic >= 10) {
        hazard = 'action_required';
    }
    else if (cancer_risk >= 1e-6 || HQ_non_carcinogenic >= 1) {
        hazard = 'concern';
    }
    else {
        hazard = 'acceptable';
    }
    return { hazard };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const airToxicsRiskMeta = {
    name: 'airToxicsRisk',
    description: 'airToxicsRisk',
    category: 'analytics',
    familyTags: ['air', 'chemical', 'risk'],
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
//# sourceMappingURL=airToxicsRisk.js.map
