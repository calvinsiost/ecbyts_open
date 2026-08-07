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
 * Industrial Site Risk analytics module.
 * Avaliação quantitativa de risco em instalações industriais, incluindo
 * incêndio, explosão e exposição química.
 *
 * Referências acadêmicas:
 * - Dow Chemical Company (1994). "Dow's Fire & Explosion Index Hazard Classification Guide".
 *   7th ed. AIChE. ISBN:9780816906529
 * - AIChE CCPS (1994). "Dow's Chemical Exposure Index Guide". 1st ed. AIChE.
 *   (CEI - Chemical Exposure Index methodology)
 * - IEC 61511 (2016). "Functional safety - Safety instrumented systems for the process
 *   industry sector". International Electrotechnical Commission.
 *   (Risk matrix likelihood × consequence framework)
 */

/**
 * Calcula o Índice de Fogo e Explosão de Dow (F&EI).
 * F&EI = material_factor × (1 + general_hazards_penalty) × (1 + special_hazards_penalty)
 * Nota: a fórmula simplificada aqui usa F_E_penalty como fator combinado de penalidades
 * de acordo com o método abreviado do guia Dow 7ª edição.
 *
 * @param {number} material_factor - Fator de material (Mf, 1–40)
 * @param {number} F_E_penalty - Penalidade total de fogo e explosão (≥ 0)
 * @returns {{ FEI: number }}
 */
export function computeFireAndExplosionIndex(material_factor: number, F_E_penalty: number): { FEI: number } {
    if (typeof material_factor !== 'number' || typeof F_E_penalty !== 'number') {
        throw new TypeError('material_factor e F_E_penalty devem ser números');
    }
    if (!Number.isFinite(material_factor) || material_factor < 1 || material_factor > 40) {
        throw new RangeError('material_factor deve estar entre 1 e 40');
    }
    if (!Number.isFinite(F_E_penalty) || F_E_penalty < 0) {
        throw new RangeError('F_E_penalty deve ser um número finito não-negativo');
    }
    const FEI = material_factor * (1 + F_E_penalty);
    return { FEI };
}

/**
 * Calcula o Índice de Exposição Química de Dow (CEI).
 * CEI = 655.1 × sqrt(toxic_mass / (IDLH × MW)) / distance
 * Onde:
 *   - toxic_mass: massa tóxica disponível para dispersão (kg)
 *   - IDLH: concentração imediatamente perigosa para vida e saúde (mg/m³)
 *   - MW: massa molar da substância (g/mol)
 *   - distance: distância do ponto de interesse (m)
 *
 * @param {number} toxic_mass_kg - Massa tóxica disponível (kg, > 0)
 * @param {number} IDLH_mg_m3 - Limite IDLH (mg/m³, > 0)
 * @param {number} MW - Massa molar (g/mol, > 0)
 * @param {number} distance_m - Distância ao receptor (m, > 0)
 * @returns {{ CEI: number }}
 */
export function computeChemicalExposureIndex(
    toxic_mass_kg: number,
    IDLH_mg_m3: number,
    MW: number,
    distance_m: number,
): { CEI: number } {
    if (
        typeof toxic_mass_kg !== 'number' ||
        typeof IDLH_mg_m3 !== 'number' ||
        typeof MW !== 'number' ||
        typeof distance_m !== 'number'
    ) {
        throw new TypeError('Todos os parâmetros devem ser números');
    }
    if (!Number.isFinite(toxic_mass_kg) || toxic_mass_kg <= 0) {
        throw new RangeError('toxic_mass_kg deve ser um número finito positivo');
    }
    if (!Number.isFinite(IDLH_mg_m3) || IDLH_mg_m3 <= 0) {
        throw new RangeError('IDLH_mg_m3 deve ser um número finito positivo');
    }
    if (!Number.isFinite(MW) || MW <= 0) {
        throw new RangeError('MW deve ser um número finito positivo');
    }
    if (!Number.isFinite(distance_m) || distance_m <= 0) {
        throw new RangeError('distance_m deve ser um número finito positivo');
    }
    const CEI = (655.1 * Math.sqrt(toxic_mass_kg / (IDLH_mg_m3 * MW))) / distance_m;
    return { CEI };
}

/**
 * Calcula o escore de risco por matriz de risco (likelihood × consequence).
 * Segue o framework IEC 61511 para sistemas instrumentados de segurança.
 *
 * @param {number} likelihood - Probabilidade/frequência (inteiro 1–5)
 * @param {number} consequence - Severidade da consequência (inteiro 1–5)
 * @returns {{ risk_score: number, risk_level: 'low'|'medium'|'high'|'critical' }}
 */
export function computeRiskMatrix(
    likelihood: number,
    consequence: number,
): { risk_score: number; risk_level: 'low' | 'medium' | 'high' | 'critical' } {
    if (typeof likelihood !== 'number' || typeof consequence !== 'number') {
        throw new TypeError('likelihood e consequence devem ser números');
    }
    if (!Number.isInteger(likelihood) || likelihood < 1 || likelihood > 5) {
        throw new RangeError('likelihood deve ser inteiro entre 1 e 5');
    }
    if (!Number.isInteger(consequence) || consequence < 1 || consequence > 5) {
        throw new RangeError('consequence deve ser inteiro entre 1 e 5');
    }
    const risk_score = likelihood * consequence;
    let risk_level: 'low' | 'medium' | 'high' | 'critical';
    if (risk_score <= 4) risk_level = 'low';
    else if (risk_score <= 9) risk_level = 'medium';
    else if (risk_score <= 14) risk_level = 'high';
    else risk_level = 'critical';
    return { risk_score, risk_level };
}

/**
 * Classifica o perigo geral de uma instalação industrial com base em FEI e CEI.
 * Usa o maior nível de perigo entre os dois índices.
 * Limiares FEI: <65=light, <96=moderate, <127=heavy, ≥127=severe (Dow 7ª ed.)
 *
 * @param {number} FEI - Índice de Fogo e Explosão de Dow (> 0)
 * @param {number} CEI - Índice de Exposição Química de Dow (≥ 0)
 * @returns {{ hazard: 'light'|'moderate'|'heavy'|'severe' }}
 */
export function classifyIndustrialSiteHazard(
    FEI: number,
    CEI: number,
): { hazard: 'light' | 'moderate' | 'heavy' | 'severe' } {
    if (typeof FEI !== 'number' || typeof CEI !== 'number') {
        throw new TypeError('FEI e CEI devem ser números');
    }
    if (!Number.isFinite(FEI) || FEI <= 0) {
        throw new RangeError('FEI deve ser um número finito positivo');
    }
    if (!Number.isFinite(CEI) || CEI < 0) {
        throw new RangeError('CEI deve ser um número finito não-negativo');
    }
    // Classifica FEI conforme limiares Dow
    let fei_hazard: number;
    if (FEI < 65)
        fei_hazard = 0; // light
    else if (FEI < 96)
        fei_hazard = 1; // moderate
    else if (FEI < 127)
        fei_hazard = 2; // heavy
    else fei_hazard = 3; // severe

    // CEI: limiares análogos (sem escala oficial fixada, usando proporção Dow para CEI)
    // Escalamos com: <1=light, <5=moderate, <20=heavy, ≥20=severe
    let cei_hazard: number;
    if (CEI < 1) cei_hazard = 0;
    else if (CEI < 5) cei_hazard = 1;
    else if (CEI < 20) cei_hazard = 2;
    else cei_hazard = 3;

    const level = Math.max(fei_hazard, cei_hazard);
    const labels: Array<'light' | 'moderate' | 'heavy' | 'severe'> = ['light', 'moderate', 'heavy', 'severe'];
    return { hazard: labels[level]! };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialSiteRiskMeta = {
    name: 'industrialSiteRisk',
    description: 'industrialSiteRisk',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
