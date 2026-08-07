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
// Application: EHS & Mining - Thermal Pollution Model
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Thermal Pollution Model - Aquatic Thermal Impact Assessment
 *
 * Módulo puro implementando modelos de poluição térmica aquática:
 * mistura térmica por balanço energético, saturação de oxigênio dissolvido
 * (Benson & Krause 1984), efeito Q10 em metabolismo e classificação de
 * impacto conforme CONAMA 357/2005.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module thermalPollutionModel
 * @references
 *   Benson, B.B. & Krause, D. (1984) The concentration and isotopic fractionation of
 *     oxygen dissolved in freshwater and seawater in equilibrium with the atmosphere.
 *     Limnol. Oceanogr. 29(3):620-632. DOI: 10.4319/lo.1984.29.3.0620
 *   CONAMA Resolução 357/2005 - Classificação dos corpos d'água e padrões de qualidade.
 *   EPA (1976) Quality Criteria for Water (Red Book). EPA-440/9-76-023.
 *   Van't Hoff, J.H. (1884) Études de dynamique chimique. Frederik Muller & Co.
 */

interface ComputeThermalMixingResult { mixedTemp_C: number; deltaT_C: number; }
interface ComputeOxygenSaturationResult { doSat_mg_L: number; }
interface ComputeQ10EffectResult { adjustedRate: number; accelerationFactor: number; }
interface ComputeThermalPlumeResult { delta_T_C: number; plume_extent_m: number; }
interface ComputeDissolvedOxygenDepressionResult { DO_saturation_mg_L: number; }
interface ComputeAquaticStressIndexResult { ASI: number; }
interface ClassifyThermalPollutionResult { level: 'acceptable' | 'mild' | 'moderate' | 'severe'; }
interface ClassifyThermalImpactResult { impact: 'none' | 'minor' | 'moderate' | 'severe'; standardExceeded: boolean; }

/**
 * Compute thermal mixing temperature using energy-balance (heat-budget) model.
 * Calcula a temperatura de mistura por balanço de energia (balanço de calor).
 *
 * T_mix = (Te × Qe + Tr × Qr) / (Qe + Qr)
 * Assumindo densidade e calor específico iguais para ambos os fluxos (água doce ≈ 4186 J/kg·K).
 *
 * @param {number} effluentTemp_C - Effluent temperature (°C)
 * @param {number} effluentFlow_m3_s - Effluent flow rate (m³/s), > 0
 * @param {number} receivingTemp_C - Receiving water temperature (°C)
 * @param {number} receivingFlow_m3_s - Receiving water flow rate (m³/s), > 0
 * @returns {{ mixedTemp_C: number, deltaT_C: number }}
 * @throws {RangeError} se fluxos não positivos
 * @references EPA (1976) Red Book ch. 6; CONAMA 357/2005 Art. 24.
 */
export function computeThermalMixing(effluentTemp_C: number, effluentFlow_m3_s: number, receivingTemp_C: number, receivingFlow_m3_s: number): ComputeThermalMixingResult {
    if (effluentFlow_m3_s <= 0) throw new RangeError('effluentFlow_m3_s must be > 0');
    if (receivingFlow_m3_s <= 0) throw new RangeError('receivingFlow_m3_s must be > 0');

    // Temperatura de mistura por conservação de energia (entalpia)
    // Mixed temperature from energy conservation (enthalpy balance)
    const totalFlow = effluentFlow_m3_s + receivingFlow_m3_s;
    const mixedTemp_C = (effluentTemp_C * effluentFlow_m3_s + receivingTemp_C * receivingFlow_m3_s) / totalFlow;
    const deltaT_C = mixedTemp_C - receivingTemp_C;

    return { mixedTemp_C, deltaT_C };
}

/**
 * Compute dissolved oxygen saturation concentration.
 * Calcula a concentração de saturação de oxigênio dissolvido.
 *
 * Equação de Benson & Krause (1984) - padrão internacional para limnologia:
 * ln(DO_sat) = -139.34411 + 1.575701e5/T - 6.642308e7/T² + 1.2438e10/T³ - 8.621949e11/T⁴
 * onde T em Kelvin (T = °C + 273.15).
 * Ajuste de salinidade: DO_s = DO_sat × exp(-S × (0.017674 - 10.754/T + 2140.7/T²))
 *
 * @param {number} temperature_C - Water temperature (°C), [-2, 40]
 * @param {number} salinity_ppt - Salinity (ppt), [0, 40], default 0 (freshwater)
 * @returns {{ doSat_mg_L: number }}
 * @throws {RangeError} se temperatura fora do intervalo de validade
 * @references Benson & Krause (1984) Limnol. Oceanogr. 29(3):620-632, eq. 2 and 5.
 */
export function computeOxygenSaturation(temperature_C: number, salinity_ppt: number = 0): ComputeOxygenSaturationResult {
    if (temperature_C < -2 || temperature_C > 40) {
        throw new RangeError('temperature_C must be in [-2, 40] (validity range of Benson & Krause 1984)');
    }
    if (salinity_ppt < 0 || salinity_ppt > 40) {
        throw new RangeError('salinity_ppt must be in [0, 40]');
    }

    // Temperatura em Kelvin (exigida pela equação de Benson & Krause)
    const T = temperature_C + 273.15;

    // Coeficientes de Benson & Krause (1984) Tabela 1 - água pura
    const lnDO =
        -139.34411 + 1.575701e5 / T - 6.642308e7 / (T * T) + 1.2438e10 / (T * T * T) - 8.621949e11 / (T * T * T * T);

    let doSat_mg_L = Math.exp(lnDO);

    // Correção de salinidade - Benson & Krause (1984) eq. 5
    // Salinity correction reduces DO saturation due to salting-out effect
    if (salinity_ppt > 0) {
        const saltCorrection = Math.exp(-salinity_ppt * (0.017674 - 10.754 / T + 2140.7 / (T * T)));
        doSat_mg_L *= saltCorrection;
    }

    return { doSat_mg_L };
}

/**
 * Compute metabolic rate change using Van't Hoff Q10 rule.
 * Calcula a aceleração do metabolismo pela regra Q10 de Van't Hoff (1884).
 *
 * R2 = R1 × Q10^(ΔT/10)
 * Q10 = 2.0 típico para poikilothermos aquáticos (Fry 1971).
 *
 * @param {number} metabolicRate - Baseline metabolic rate (any consistent unit), > 0
 * @param {number} temperatureChange_C - Temperature change ΔT (°C), can be negative
 * @param {number} [q10=2.0] - Q10 coefficient (dimensionless), > 0
 * @returns {{ adjustedRate: number, accelerationFactor: number }}
 * @throws {RangeError} se metabolicRate ou q10 não positivos
 * @references Van't Hoff (1884); Fry, F.E.J. (1971) The effect of environmental
 *   factors on the physiology of fish. Fish Physiology 6:1-98.
 */
export function computeQ10Effect(metabolicRate: number, temperatureChange_C: number, q10: number = 2.0): ComputeQ10EffectResult {
    if (metabolicRate <= 0) throw new RangeError('metabolicRate must be > 0');
    if (q10 <= 0) throw new RangeError('q10 must be > 0');

    // Fator de aceleração metabólica pela variação de temperatura
    const accelerationFactor = Math.pow(q10, temperatureChange_C / 10);
    const adjustedRate = metabolicRate * accelerationFactor;

    return { adjustedRate, accelerationFactor };
}

/**
 * Compute thermal plume characteristics using simple turbulent mixing model.
 * Calcula características da pluma térmica por mistura turbulenta simplificada.
 *
 * deltaT = (Td - Ta) × Q / (Q + mixing_coef × Q)
 * extent = flow / (mixing_coef × 0.1)
 *
 * @param {number} discharge_temp_C - Effluent discharge temperature (°C)
 * @param {number} ambient_temp_C   - Ambient water temperature (°C)
 * @param {number} flow_m3_s        - Effluent flow rate (m³/s); > 0
 * @param {number} mixing_coef      - Turbulent mixing coefficient (dimensionless); > 0
 * @returns {{ delta_T_C: number, plume_extent_m: number }}
 * @throws {RangeError} se flow_m3_s ou mixing_coef não positivos
 */
export function computeThermalPlume(discharge_temp_C: number, ambient_temp_C: number, flow_m3_s: number, mixing_coef: number): ComputeThermalPlumeResult {
    if (typeof flow_m3_s !== 'number' || flow_m3_s <= 0) {
        throw new RangeError('flow_m3_s must be > 0');
    }
    if (typeof mixing_coef !== 'number' || mixing_coef <= 0) {
        throw new RangeError('mixing_coef must be > 0');
    }

    // Diferença de temperatura após mistura turbulenta
    // Temperature differential after turbulent mixing
    const delta_T_C = ((discharge_temp_C - ambient_temp_C) * flow_m3_s) / (flow_m3_s + mixing_coef * flow_m3_s);

    // Extensão da pluma: estimativa empírica baseada na razão fluxo/mistura
    // Plume extent: empirical estimate based on flow-to-mixing ratio
    const plume_extent_m = flow_m3_s / (mixing_coef * 0.1);

    return { delta_T_C, plume_extent_m };
}

/**
 * Compute dissolved oxygen saturation using simplified Benson & Krause formula.
 * Calcula a saturação de OD pela fórmula simplificada de Benson & Krause (1984).
 *
 * Aproximação: DO = 468 / (31.6 + temp) - válida para 0–30°C água doce.
 * Benson, B.B. & Krause, D. (1984). DOI: 10.4319/lo.1984.29.3.0620
 *
 * @param {number} temperature_C - Water temperature (°C); [0, 35]
 * @returns {{ DO_saturation_mg_L: number }}
 * @throws {RangeError} se temperatura fora do intervalo [0, 35]
 */
export function computeDissolvedOxygenDepression(temperature_C: number): ComputeDissolvedOxygenDepressionResult {
    if (typeof temperature_C !== 'number' || temperature_C < 0 || temperature_C > 35) {
        throw new RangeError('temperature_C must be in [0, 35]');
    }

    // Fórmula simplificada de Benson & Krause (1984): DO = 468 / (31.6 + T)
    const DO_saturation_mg_L = 468 / (31.6 + temperature_C);

    return { DO_saturation_mg_L };
}

/**
 * Compute Aquatic Stress Index (ASI) from thermal and oxygen parameters.
 * Calcula o Índice de Estresse Aquático (ASI) a partir de parâmetros térmicos e de OD.
 *
 * ASI = (delta_T/10 × 0.5) + (max(0, (background_DO - DO_mg_L)/background_DO) × 0.5)
 * Capeado em [0, 1]. Pesos iguais: 50% térmico, 50% depleção de OD.
 *
 * @param {number} delta_T_C       - Temperature rise due to effluent (°C); >= 0
 * @param {number} DO_mg_L         - Current dissolved oxygen (mg/L); >= 0
 * @param {number} background_DO_mg_L - Background (reference) DO (mg/L); > 0
 * @returns {{ ASI: number }}
 * @throws {RangeError} se parâmetros fora do intervalo válido
 */
export function computeAquaticStressIndex(delta_T_C: number, DO_mg_L: number, background_DO_mg_L: number): ComputeAquaticStressIndexResult {
    if (typeof delta_T_C !== 'number' || delta_T_C < 0) {
        throw new RangeError('delta_T_C must be >= 0');
    }
    if (typeof DO_mg_L !== 'number' || DO_mg_L < 0) {
        throw new RangeError('DO_mg_L must be >= 0');
    }
    if (typeof background_DO_mg_L !== 'number' || background_DO_mg_L <= 0) {
        throw new RangeError('background_DO_mg_L must be > 0');
    }

    // Componente térmico: normalizado por 10°C como referência de estresse severo
    const thermal_component = Math.min(0.5, (delta_T_C / 10) * 0.5);

    // Componente de depleção de OD: déficit relativo ao OD de referência
    const do_deficit = Math.max(0, (background_DO_mg_L - DO_mg_L) / background_DO_mg_L);
    const do_component = do_deficit * 0.5;

    const ASI = Math.min(1, thermal_component + do_component);

    return { ASI };
}

/**
 * Classify thermal pollution level according to CONAMA 357/2005.
 * Classifica o nível de poluição térmica conforme CONAMA 357/2005.
 *
 * Limites ΔT (°C) conforme Art. 24 CONAMA 357/2005:
 *   acceptable : ΔT < 3°C
 *   mild       : ΔT < 5°C
 *   moderate   : ΔT < 10°C
 *   severe     : ΔT >= 10°C
 *
 * @param {number} delta_T_C - Temperature rise at mixing zone boundary (°C); >= 0
 * @returns {{ level: 'acceptable'|'mild'|'moderate'|'severe' }}
 * @throws {RangeError} se delta_T_C negativo
 */
export function classifyThermalPollution(delta_T_C: number): ClassifyThermalPollutionResult {
    if (typeof delta_T_C !== 'number' || delta_T_C < 0) {
        throw new RangeError('delta_T_C must be >= 0');
    }

    let level: 'acceptable' | 'mild' | 'moderate' | 'severe';
    if (delta_T_C < 3) level = 'acceptable';
    else if (delta_T_C < 5) level = 'mild';
    else if (delta_T_C < 10) level = 'moderate';
    else level = 'severe';

    return { level };
}

/**
 * Classify thermal pollution impact according to CONAMA 357/2005.
 * Classifica o impacto de poluição térmica conforme CONAMA 357/2005.
 *
 * CONAMA 357/2005 Art. 24: ΔT ≤ 3°C em qualquer ponto após a zona de mistura.
 * Classificação de impacto:
 *   none:     ΔT ≤ 1°C
 *   minor:    ΔT ≤ 3°C (dentro do padrão CONAMA)
 *   moderate: ΔT ≤ 5°C (excede padrão mas não causa mortalidade aguda)
 *   severe:   ΔT > 5°C ou temperatura resultante > 32°C
 *
 * @param {number} deltaT_C - Temperature rise after mixing (°C)
 * @param {number} receivingTemp_C - Pre-mixing receiving water temperature (°C)
 * @param {boolean} [sensitiveSpecies=false] - True if sensitive aquatic species present (reduces thresholds)
 * @returns {{ impact: 'none'|'minor'|'moderate'|'severe', standardExceeded: boolean }}
 * @throws {RangeError} se deltaT_C negativo
 * @references CONAMA 357/2005 Art. 24; EPA (1976) Red Book thermal criteria.
 */
export function classifyThermalImpact(deltaT_C: number, receivingTemp_C: number, sensitiveSpecies: boolean = false): ClassifyThermalImpactResult {
    if (deltaT_C < 0) throw new RangeError('deltaT_C must be >= 0 (positive temperature increase)');

    // Limite CONAMA 357/2005: 3°C máximo de elevação
    const conama357Limit = 3.0;
    const standardExceeded = deltaT_C > conama357Limit;

    // Temperatura resultante no corpo receptor
    const resultingTemp = receivingTemp_C + deltaT_C;

    // Limites reduzidos para espécies sensíveis (e.g., salmonídeos, espécies ameaçadas)
    const severeThreshold = sensitiveSpecies ? 3.0 : 5.0;
    const moderateThreshold = sensitiveSpecies ? 1.5 : 3.0;

    let impact: 'none' | 'minor' | 'moderate' | 'severe';
    if (deltaT_C <= 1.0 && !sensitiveSpecies) {
        impact = 'none';
    } else if (deltaT_C > severeThreshold || resultingTemp > 32) {
        impact = 'severe';
    } else if (deltaT_C > moderateThreshold) {
        impact = 'moderate';
    } else {
        impact = 'minor';
    }

    return { impact, standardExceeded };
}

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
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const thermalPollutionModelMeta: AnalyticsModuleMeta = {
    name: 'thermalPollutionModel',
    description: 'Thermal Pollution Model',
    category: 'analytics',
    familyTags: ['climate'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROG'
    }
};
