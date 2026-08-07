// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining - Industrial Compressed Air Leakage Energy Loss
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Compressed Air Leakage Energy Loss
 *
 * Módulo puro para quantificação de perdas energéticas por fugas em sistemas de
 * ar comprimido industrial: cálculo de vazão de fuga por orifício (equação
 * adiabática), perda energética anual, aumento de carga do compressor e
 * classificação de severidade de fugas.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US DOE/EERE (2004). "Improving Compressed Air System Performance: A
 *     Sourcebook for Industry." DOE/GO-102003-1822. Chapter 5: Leakage.
 *     (orifice flow equation, energy loss quantification)
 *   - CAGI - Compressed Air and Gas Institute (2016). Compressed Air & Gas
 *     Handbook (7th ed.). ISBN: 978-0-9802687-0-4. (system efficiency metrics)
 *   - ISO 11011:2013 - Compressed air systems - Energy efficiency assessment.
 *     (leakage audit methodology, severity classification thresholds)
 *   - Brundage, A. L. et al. (2011). "Fundamentals of Compressed Air Systems."
 *     AEE Energy Auditor Reference Manual. (compressor load increase formula)
 */

'use strict';

// Constantes físicas para ar seco a condições padrão ISO (0°C, 101.325 kPa)
// Physical constants for dry air at ISO standard conditions
const GAMMA_AIR = 1.4; // razão de calores específicos (cp/cv) do ar
const R_AIR_J_KG_K = 287.05; // constante específica do gás ar (J/kg·K)
const T_STD_K = 293.15; // temperatura padrão (20°C = 293.15 K) ISO 11011
const P_ATM_KPA = 101.325; // pressão atmosférica padrão (kPa)
const CD_ORIFICE = 0.61; // coeficiente de descarga de orifício (adimensional)
// eslint-disable-next-line
const RHO_AIR_STD_KG_M3 = 1.205; // densidade do ar a condições padrão (kg/m³)

/**
 * Calcula a vazão mássica de fuga de ar comprimido por um orifício usando
 * a equação de escoamento adiabático compressível (US DOE/EERE 2004, cap. 5).
 *
 * Calculate mass flow rate of compressed air leakage through an orifice using
 * the adiabatic compressible flow equation.
 * ṁ = Cd * A * P1 * sqrt(γ/(R*T1)) * [2/(γ+1)]^[(γ+1)/(2(γ-1))]  [choked flow]
 * Para escoamento sub-sônico: equação adiabática completa com razão de pressões.
 *
 * @param {number} orificeDiameter_mm  - diâmetro do orifício (mm), > 0
 * @param {number} supplyPressure_kPa  - pressão manométrica de suprimento (kPa gauge), > 0
 * @param {number} temperature_K       - temperatura do gás (K), > 200
 * @returns {number} vazão mássica de fuga (kg/s)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se parâmetros estiverem fora dos limites físicos
 */
export function calcLeakageFlowRate(orificeDiameter_mm: any, supplyPressure_kPa: any, temperature_K = T_STD_K) {
    if (
        typeof orificeDiameter_mm !== 'number' ||
        typeof supplyPressure_kPa !== 'number' ||
        typeof temperature_K !== 'number'
    ) {
        throw new TypeError('calcLeakageFlowRate: parâmetros devem ser números');
    }
    if (orificeDiameter_mm <= 0) {
        throw new RangeError('calcLeakageFlowRate: diâmetro do orifício deve ser > 0');
    }
    if (supplyPressure_kPa <= 0) {
        throw new RangeError('calcLeakageFlowRate: pressão de suprimento deve ser > 0 kPa gauge');
    }
    if (temperature_K <= 200) {
        throw new RangeError('calcLeakageFlowRate: temperatura deve ser > 200 K');
    }

    // Área do orifício em m²
    const D_m = orificeDiameter_mm / 1000;
    const A_m2 = (Math.PI * D_m * D_m) / 4;

    // Pressão absoluta a montante (Pa)
    const P1_Pa = (supplyPressure_kPa + P_ATM_KPA) * 1000;
    // Pressão absoluta a jusante (Pa) = atmosférica
    const P2_Pa = P_ATM_KPA * 1000;

    // Razão de pressão crítica para escoamento bloqueado (choked)
    // P2/P1 ≤ [2/(γ+1)]^[γ/(γ-1)] → escoamento sônico
    const pressureRatioCritical = Math.pow(2 / (GAMMA_AIR + 1), GAMMA_AIR / (GAMMA_AIR - 1));
    const pressureRatio = P2_Pa / P1_Pa;

    let massFlowRate_kg_s;
    if (pressureRatio <= pressureRatioCritical) {
        // Escoamento sônico (bloqueado): fórmula para M=1 na garganta
        // Sonic (choked) flow: maximum flow rate condition
        const chokedFactor = Math.pow(2 / (GAMMA_AIR + 1), (GAMMA_AIR + 1) / (2 * (GAMMA_AIR - 1)));
        massFlowRate_kg_s =
            CD_ORIFICE * A_m2 * P1_Pa * Math.sqrt(GAMMA_AIR / (R_AIR_J_KG_K * temperature_K)) * chokedFactor;
    } else {
        // Escoamento sub-sônico: equação adiabática geral
        // Subsonic flow: general adiabatic orifice equation
        const term1 = (2 * GAMMA_AIR) / ((GAMMA_AIR - 1) * R_AIR_J_KG_K * temperature_K);
        const term2 = Math.pow(pressureRatio, 2 / GAMMA_AIR) - Math.pow(pressureRatio, (GAMMA_AIR + 1) / GAMMA_AIR);
        massFlowRate_kg_s = CD_ORIFICE * A_m2 * P1_Pa * Math.sqrt(term1 * term2);
    }

    return massFlowRate_kg_s;
}

/**
 * Calcula a perda energética anual causada por fugas de ar comprimido.
 *
 * Calculate annual energy loss from compressed air leakage.
 * E_anual = ṁ * (W_esp / η_compressor) * H_operação
 * onde W_esp = potência específica do compressor para comprimir ar de P_atm a P1.
 * Referência: US DOE/EERE (2004), equação 5-2.
 *
 * @param {number} leakageFlowRate_kg_s  - vazão de fuga (kg/s), > 0
 * @param {number} supplyPressure_kPa    - pressão manométrica (kPa gauge), > 0
 * @param {number} operatingHours_year   - horas de operação anuais, 0 < h ≤ 8760
 * @param {number} compressorEfficiency  - eficiência isentrópica do compressor (0–1), padrão 0.75
 * @returns {number} perda energética anual (kWh/ano)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se parâmetros estiverem fora dos limites
 */
export function calcAnnualEnergyLoss(
    leakageFlowRate_kg_s: any,
    supplyPressure_kPa: any,
    operatingHours_year: any,
    compressorEfficiency = 0.75,
) {
    if (
        typeof leakageFlowRate_kg_s !== 'number' ||
        typeof supplyPressure_kPa !== 'number' ||
        typeof operatingHours_year !== 'number' ||
        typeof compressorEfficiency !== 'number'
    ) {
        throw new TypeError('calcAnnualEnergyLoss: parâmetros devem ser números');
    }
    if (leakageFlowRate_kg_s <= 0) {
        throw new RangeError('calcAnnualEnergyLoss: vazão de fuga deve ser > 0');
    }
    if (supplyPressure_kPa <= 0) {
        throw new RangeError('calcAnnualEnergyLoss: pressão deve ser > 0');
    }
    if (operatingHours_year <= 0 || operatingHours_year > 8760) {
        throw new RangeError('calcAnnualEnergyLoss: horas de operação devem ser em (0, 8760]');
    }
    if (compressorEfficiency <= 0 || compressorEfficiency >= 1) {
        throw new RangeError('calcAnnualEnergyLoss: eficiência deve ser em (0, 1)');
    }

    // Trabalho específico de compressão isentrópica (J/kg)
    // Isentropic specific work: W_sp = (γ/(γ-1)) * R * T * [(P2/P1)^((γ-1)/γ) - 1]
    const P1_abs_kPa = supplyPressure_kPa + P_ATM_KPA;
    const pressureRatio = P1_abs_kPa / P_ATM_KPA;
    const exponent = (GAMMA_AIR - 1) / GAMMA_AIR;
    const specificWork_J_kg =
        (GAMMA_AIR / (GAMMA_AIR - 1)) * R_AIR_J_KG_K * T_STD_K * (Math.pow(pressureRatio, exponent) - 1);

    // Potência de compressão real considerando eficiência do compressor
    // Actual compression power accounting for compressor efficiency
    const power_W = (leakageFlowRate_kg_s * specificWork_J_kg) / compressorEfficiency;

    // Perda energética anual em kWh
    const annualEnergyLoss_kWh = (power_W / 1000) * operatingHours_year;
    return annualEnergyLoss_kWh;
}

/**
 * Calcula o aumento percentual de carga do compressor devido às fugas.
 *
 * Calculate the percentage increase in compressor load due to air leakage.
 * Leakage load increase = (ṁ_leak / ṁ_total_demand) × 100 (%)
 * Referência: ISO 11011:2013, seção 7.4.
 *
 * @param {number} leakageFlowRate_kg_s   - vazão de fuga (kg/s), > 0
 * @param {number} totalDemandFlowRate_kg_s - demanda total do sistema (kg/s), > leakageFlowRate
 * @returns {number} aumento de carga do compressor (%)
 * @throws {TypeError} se parâmetros não forem números
 * @throws {RangeError} se valores forem ≤ 0 ou fuga ≥ demanda total
 */
export function calcCompressorLoadIncrease(leakageFlowRate_kg_s: any, totalDemandFlowRate_kg_s: any) {
    if (typeof leakageFlowRate_kg_s !== 'number' || typeof totalDemandFlowRate_kg_s !== 'number') {
        throw new TypeError('calcCompressorLoadIncrease: parâmetros devem ser números');
    }
    if (leakageFlowRate_kg_s <= 0) {
        throw new RangeError('calcCompressorLoadIncrease: vazão de fuga deve ser > 0');
    }
    if (totalDemandFlowRate_kg_s <= 0) {
        throw new RangeError('calcCompressorLoadIncrease: demanda total deve ser > 0');
    }
    if (leakageFlowRate_kg_s >= totalDemandFlowRate_kg_s) {
        throw new RangeError('calcCompressorLoadIncrease: fuga não pode ser ≥ demanda total');
    }

    // Percentual de carga adicional do compressor por fugas
    return (leakageFlowRate_kg_s / totalDemandFlowRate_kg_s) * 100;
}

/**
 * Classifica a severidade das fugas de ar comprimido conforme ISO 11011:2013
 * e critérios US DOE/EERE (2004).
 *
 * Classify compressed air leakage severity according to ISO 11011:2013 and
 * US DOE/EERE (2004) thresholds.
 * Thresholds: <5% GOOD, 5–10% ACCEPTABLE, 10–20% POOR, >20% CRITICAL.
 *
 * @param {number} leakagePercent  - percentual de fuga em relação à produção total (%), ≥ 0
 * @returns {{
 *   severityLevel: 'GOOD'|'ACCEPTABLE'|'POOR'|'CRITICAL',
 *   description: string,
 *   immediateAction: boolean,
 *   estimatedWastePct: number,
 *   recommendedAuditFrequency: string
 * }}
 * @throws {TypeError} se leakagePercent não for número
 * @throws {RangeError} se leakagePercent for negativo ou > 100
 */
export function classifyLeakageSeverity(leakagePercent: any) {
    if (typeof leakagePercent !== 'number') {
        throw new TypeError('classifyLeakageSeverity: leakagePercent deve ser número');
    }
    if (leakagePercent < 0 || leakagePercent > 100) {
        throw new RangeError('classifyLeakageSeverity: leakagePercent deve ser em [0, 100]');
    }

    // Limiares de classificação ISO 11011:2013 e DOE/EERE 2004
    // Classification thresholds from ISO 11011:2013 and DOE/EERE 2004
    if (leakagePercent < 5) {
        return {
            severityLevel: 'GOOD',
            description: 'Sistema bem mantido. Fugas mínimas (<5% da produção).',
            immediateAction: false,
            estimatedWastePct: leakagePercent,
            recommendedAuditFrequency: 'Auditoria anual de fugas recomendada.',
        };
    } else if (leakagePercent < 10) {
        return {
            severityLevel: 'ACCEPTABLE',
            description: 'Fugas aceitáveis mas com potencial de melhoria (5–10%).',
            immediateAction: false,
            estimatedWastePct: leakagePercent,
            recommendedAuditFrequency: 'Auditoria semestral e programa de detecção com ultrassom.',
        };
    } else if (leakagePercent < 20) {
        return {
            severityLevel: 'POOR',
            description: 'Sistema com fugas significativas (10–20%). Perdas energéticas relevantes.',
            immediateAction: true,
            estimatedWastePct: leakagePercent,
            recommendedAuditFrequency: 'Auditoria trimestral. Programa urgente de reparos.',
        };
    } else {
        return {
            severityLevel: 'CRITICAL',
            description: 'Sistema crítico com fugas >20% da produção. Intervenção imediata necessária.',
            immediateAction: true,
            estimatedWastePct: leakagePercent,
            recommendedAuditFrequency: 'Auditoria mensal até resolução. Revisão completa do sistema.',
        };
    }
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialAirLeakageEnergyLossMeta = {
    name: 'industrialAirLeakageEnergyLoss',
    description: 'Industrial Compressed Air Leakage Energy Loss',
    category: 'analytics',
    familyTags: ['air', 'industrial', 'energy'],
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
