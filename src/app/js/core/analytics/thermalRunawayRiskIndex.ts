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
 * Thermal Runaway Risk Index
 * Índice de risco de runaway térmico - Stoessel (2008) + DIERS AIChE
 *
 * Referências / References:
 * - Stoessel, F. (2008) Thermal Safety of Chemical Processes: Risk Assessment and
 *   Process Design. Wiley-VCH, Weinheim. ISBN:978-3-527-31712-7
 * - DIERS (Design Institute for Emergency Relief Systems) (1992) Emergency Relief
 *   System Design Using DIERS Technology. AIChE, New York.
 * - Arrhenius, S. (1889) Über die Reaktionsgeschwindigkeit bei der Inversion von
 *   Rohrzucker durch Säuren. Z. Phys. Chem. 4:226–248. DOI:10.1515/zpch-1889-0416
 */

'use strict';

// Constante universal dos gases / Universal gas constant (J/mol/K)
const R_GAS = 8.314;

/**
 * Calcula o aumento adiabático de temperatura (ΔTad) de uma reação exotérmica.
 * Calculates adiabatic temperature rise (ΔTad) for an exothermic reaction.
 *
 * ΔTad = HR / cp
 * Representa o máximo de temperatura atingível sem troca de calor com o ambiente.
 *
 * @param {number} HR_J_kg  - Calor de reação específico (J/kg, valor absoluto positivo). / Specific heat of reaction (J/kg, positive value).
 * @param {number} cp_J_kgK - Capacidade calorífica específica da massa reativa (J/kg/K). / Specific heat capacity (J/kg/K).
 * @returns {{ deltaT_ad_K: number }} Aumento adiabático de temperatura (K = °C delta). / Adiabatic temperature rise (K).
 */
export function calcAdiabaticTemperatureRise(HR_J_kg: number, cp_J_kgK: number): { deltaT_ad_K: number } {
    if (typeof HR_J_kg !== 'number' || HR_J_kg <= 0) {
        throw new RangeError('HR_J_kg must be a positive number (absolute value of exothermic heat)');
    }
    if (typeof cp_J_kgK !== 'number' || cp_J_kgK <= 0) {
        throw new RangeError('cp_J_kgK must be a positive number');
    }

    const deltaT_ad_K = HR_J_kg / cp_J_kgK;
    return { deltaT_ad_K };
}

/**
 * Calcula o Tempo até a Taxa Máxima (TMR) a uma temperatura de processo.
 * Calculates Time to Maximum Rate (TMR) at a given process temperature.
 *
 * TMR ≈ cp × R × T² / (HR × A × exp(−Ea/RT))
 * Simplificação de Stoessel (2008) Eq. 5.14 para cinética de primeira ordem.
 * Na prática industrial, usa-se o método do ln(TMR) vs 1/T (gráfico de Arrhenius).
 *
 * Aqui, fornecemos TMR24 (temperatura onde TMR = 24 h) por interpolação simples:
 * TMR(T) = TMR_ref × exp(Ea/R × (1/T − 1/T_ref))
 *
 * @param {number} TMR_ref_h  - TMR de referência medido experimentalmente (h). / Reference TMR measured experimentally (h).
 * @param {number} T_ref_C    - Temperatura de referência experimental (°C). / Reference temperature (°C).
 * @param {number} T_C        - Temperatura de processo desejada (°C). / Target process temperature (°C).
 * @param {number} Ea_kJ_mol  - Energia de ativação da reação (kJ/mol). / Activation energy (kJ/mol).
 * @returns {{ TMR_h: number, T_K: number }} TMR estimado (h) na temperatura T. / Estimated TMR (h) at temperature T.
 */
export function calcTimeToMaximumRate(TMR_ref_h: number, T_ref_C: number, T_C: number, Ea_kJ_mol: number): { TMR_h: number, T_K: number } {
    if (typeof TMR_ref_h !== 'number' || TMR_ref_h <= 0) {
        throw new RangeError('TMR_ref_h must be a positive number');
    }
    if (typeof T_ref_C !== 'number') {
        throw new TypeError('T_ref_C must be a number');
    }
    if (typeof T_C !== 'number') {
        throw new TypeError('T_C must be a number');
    }
    if (typeof Ea_kJ_mol !== 'number' || Ea_kJ_mol <= 0) {
        throw new RangeError('Ea_kJ_mol must be a positive number');
    }

    const T_K = T_C + 273.15;
    const T_ref_K = T_ref_C + 273.15;
    const Ea_J_mol = Ea_kJ_mol * 1000;

    // TMR(T) = TMR_ref × exp[(Ea/R) × (1/T − 1/T_ref)] - Stoessel (2008) Eq. 5.14
    const exponent = (Ea_J_mol / R_GAS) * (1 / T_K - 1 / T_ref_K);
    const TMR_h = TMR_ref_h * Math.exp(exponent);
    return { TMR_h, T_K };
}

/**
 * Calcula o índice de severidade de Stoessel (A/B/C/D) para uma reação química.
 * Calculates Stoessel severity index (A/B/C/D) for a chemical reaction.
 *
 * Critério baseado em ΔTad e temperatura de onset (Tonset):
 *   A: ΔTad < 25 K  (baixo)
 *   B: ΔTad < 50 K  (moderado)
 *   C: ΔTad < 200 K (elevado - requer análise detalhada)
 *   D: ΔTad ≥ 200 K (crítico - runaway provável)
 * Fonte: Stoessel (2008) Table 8.1
 *
 * @param {number} deltaT_ad_K - Aumento adiabático de temperatura (K). / Adiabatic temperature rise (K).
 * @param {number} onset_T_C   - Temperatura de onset da reação exotérmica (°C). / Onset temperature of exothermic reaction (°C).
 * @returns {{ severityClass: 'A'|'B'|'C'|'D', description: string }}
 */
export function calcSeverityIndex(deltaT_ad_K: number, onset_T_C: number): { severityClass: 'A'|'B'|'C'|'D', description: string } {
    if (typeof deltaT_ad_K !== 'number' || deltaT_ad_K < 0) {
        throw new RangeError('deltaT_ad_K must be a non-negative number');
    }
    if (typeof onset_T_C !== 'number') {
        throw new TypeError('onset_T_C must be a number');
    }

    // Stoessel (2008) Table 8.1 - severity classes
    if (deltaT_ad_K < 25) {
        return { severityClass: 'A', description: 'Low: ΔTad < 25 K; runaway unlikely under normal conditions' };
    } else if (deltaT_ad_K < 50) {
        return { severityClass: 'B', description: 'Moderate: 25 ≤ ΔTad < 50 K; cooling failure requires assessment' };
    } else if (deltaT_ad_K < 200) {
        return { severityClass: 'C', description: 'High: 50 ≤ ΔTad < 200 K; detailed risk analysis mandatory' };
    } else {
        return {
            severityClass: 'D',
            description: 'Critical: ΔTad ≥ 200 K; runaway highly probable; redesign required',
        };
    }
}

/**
 * Classifica o hazard térmico de um processo químico (Stoessel 2008, quadrante ΔTad × Tonset).
 * Classifies thermal hazard of a chemical process.
 *
 * Usa combinação ΔTad + Tonset para mapear quadrante de risco:
 *   low      : ΔTad < 50 K  e  Tonset > 150 °C
 *   medium   : ΔTad < 100 K ou Tonset > 100 °C
 *   high     : ΔTad < 200 K
 *   very_high: ΔTad ≥ 200 K ou Tonset ≤ 50 °C
 *
 * @param {number} deltaT_ad_K - Aumento adiabático de temperatura (K). / Adiabatic temperature rise (K).
 * @param {number} onset_T_C   - Temperatura de onset (°C). / Onset temperature (°C).
 * @returns {{ hazard: 'low'|'medium'|'high'|'very_high', description: string }}
 */
export function classifyThermalHazard(deltaT_ad_K: number, onset_T_C: number): { hazard: 'low'|'medium'|'high'|'very_high', description: string } {
    if (typeof deltaT_ad_K !== 'number' || deltaT_ad_K < 0) {
        throw new RangeError('deltaT_ad_K must be a non-negative number');
    }
    if (typeof onset_T_C !== 'number') {
        throw new TypeError('onset_T_C must be a number');
    }

    if (onset_T_C <= 50 || deltaT_ad_K >= 200) {
        return {
            hazard: 'very_high',
            description: 'Runaway risk at near-ambient temperatures or very high energy release',
        };
    } else if (deltaT_ad_K >= 100 || onset_T_C <= 100) {
        return { hazard: 'high', description: 'Significant runaway potential; barrier analysis required' };
    } else if (deltaT_ad_K >= 50 || onset_T_C <= 150) {
        return { hazard: 'medium', description: 'Moderate risk; cooling system integrity critical' };
    } else {
        return { hazard: 'low', description: 'Low thermal hazard under normal operating conditions' };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const thermalRunawayRiskIndexMeta = {
    name: 'thermalRunawayRiskIndex',
    description: 'thermalRunawayRiskIndex',
    category: 'analytics',
    familyTags: ['risk', 'climate'],
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
