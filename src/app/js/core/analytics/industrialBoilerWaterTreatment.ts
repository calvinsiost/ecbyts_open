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
 * Industrial Boiler Water Treatment Module
 *
 * Tratamento de água para caldeiras industriais - ciclos de concentração,
 * vazão de purga (blowdown), e índice de saturação de Langelier (LSI).
 *
 * Aplicações: prevenção de incrustação (scale), corrosão e carryover em
 * caldeiras de vapor industrial, torres de resfriamento e geradores de
 * vapor de processo.
 *
 * References:
 * - ASME PTC 19.11-2008, Steam and Water Sampling, Conditioning, and
 *   Analysis in the Power Cycle. ISBN 978-0-7918-3177-5.
 * - Langelier, W.F. (1936). The analytical control of anti-corrosion water
 *   treatment. JAWWA 28(10):1500-1521. DOI:10.1002/j.1551-8833.1936.tb13785.x
 * - ASHRAE Handbook - HVAC Systems and Equipment (2020), Ch.48 Water Treatment.
 *   ISBN 978-1-939200-87-0.
 * - Ryznar, J.W. (1944). A new index for determining amount of calcium
 *   carbonate scale formed by a water. JAWWA 36(4):472-486.
 *   DOI:10.1002/j.1551-8833.1944.tb15344.x
 *
 * @module industrialBoilerWaterTreatment
 */

'use strict';

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

/**
 * Calcula os Ciclos de Concentração (CoC) de uma torre de resfriamento ou caldeira.
 * CoC = TDS_blowdown / TDS_makeup (razão de sólidos dissolvidos totais).
 *
 * Valores típicos industriais: CoC 3–6 para torres, 10–50 para caldeiras
 * (ASHRAE Handbook HVAC Systems Ch.48).
 *
 * @param {number} TDS_blowdown - TDS da água de purga/caldeira (mg/L ou ppm), > 0
 * @param {number} TDS_makeup   - TDS da água de reposição (mg/L ou ppm), > 0
 * @returns {number} Ciclos de Concentração (adimensional), ≥ 1
 * @throws {RangeError} Se parâmetros forem não-positivos ou blowdown < makeup
 */
export function calcCyclesOfConcentration(TDS_blowdown: number, TDS_makeup: number): number {
    if (TDS_makeup <= 0) throw new RangeError('TDS_makeup must be > 0');
    if (TDS_blowdown <= 0) throw new RangeError('TDS_blowdown must be > 0');
    if (TDS_blowdown < TDS_makeup) {
        throw new RangeError('TDS_blowdown must be >= TDS_makeup (concentration cannot decrease)');
    }
    return TDS_blowdown / TDS_makeup;
}

/**
 * Calcula a vazão de purga (blowdown) necessária para manter os ciclos de concentração.
 * Balanço de massa: Q_blowdown = Q_makeup / CoC
 *
 * Derivado de: Q_makeup × TDS_makeup = Q_blowdown × TDS_blowdown + Q_evap × 0
 * Assumindo evaporação pura (sem sólidos): Q_blowdown = Q_makeup / CoC
 *
 * @param {number} makeupFlow_m3_h - Vazão de água de reposição (m³/h), > 0
 * @param {number} CoC             - Ciclos de Concentração (adimensional), > 1
 * @returns {number} Vazão de purga (m³/h)
 * @throws {RangeError} Se parâmetros forem inválidos
 */
export function calcBlowdownRate(makeupFlow_m3_h: number, CoC: number): number {
    if (makeupFlow_m3_h <= 0) throw new RangeError('makeupFlow_m3_h must be > 0');
    if (CoC <= 1) throw new RangeError('CoC must be > 1 (must have concentration)');
    return makeupFlow_m3_h / CoC;
}

/**
 * Calcula o Índice de Langelier de Saturação (LSI / LI).
 * LSI = pH_atual - pH_saturação_CaCO3
 *
 * pH_s calculado por correlação empírica (Langelier 1936, ASHRAE HVAC Ch.48):
 * pH_s = pK2 - pKsp + pCa + pAlk + 5pf
 *
 * Onde os coeficientes ajustados por temperatura e TDS são determinados por
 * correlações tabeladas (simplificadas aqui para aplicação de engenharia):
 *
 * pCa = -log10([Ca²⁺] em mol/L) = -log10(Ca_mg_L / 40080)
 * pAlk = -log10([HCO₃⁻] em eq/L) ≈ -log10(alkalinity_mg_L / 50000)
 * Correção de temperatura via tabela Langelier (1936) - aproximação polinomial:
 *   C_temp = 9.3 + A + B - C - D onde os termos dependem de TDS e T
 *
 * Implementação simplificada da fórmula combinada (ASHRAE Handbook 2020 eq.48.1):
 * pH_s = (9.3 + A + B) - (C + D)
 * onde:
 *   A = (log10(TDS) - 1) / 10
 *   B = -13.12 × log10(T_K) + 34.55
 *   C = log10(Ca_mg_L as CaCO3) - 0.4
 *   D = log10(alkalinity_mg_L as CaCO3)
 *
 * @param {number} Ca_mg_L        - Dureza de cálcio como CaCO3 (mg/L), > 0
 * @param {number} alkalinity_mg_L - Alcalinidade total como CaCO3 (mg/L), > 0
 * @param {number} TDS_mg_L       - Sólidos Dissolvidos Totais (mg/L), > 0
 * @param {number} T_C            - Temperatura da água (°C), 0–100
 * @param {number} pH             - pH medido da água, 0–14
 * @returns {number} Índice de Langelier (LSI), adimensional
 * @throws {RangeError} Se parâmetros estiverem fora dos limites
 */
export function calcScalingIndex(
    Ca_mg_L: number,
    alkalinity_mg_L: number,
    TDS_mg_L: number,
    T_C: number,
    pH: number,
): number {
    if (Ca_mg_L <= 0) throw new RangeError('Ca_mg_L must be > 0');
    if (alkalinity_mg_L <= 0) throw new RangeError('alkalinity_mg_L must be > 0');
    if (TDS_mg_L <= 0) throw new RangeError('TDS_mg_L must be > 0');
    if (T_C < 0 || T_C > 100) throw new RangeError('T_C must be in [0, 100]');
    if (pH < 0 || pH > 14) throw new RangeError('pH must be in [0, 14]');

    const T_K = T_C + 273.15;

    // Coeficiente A - efeito da força iônica (TDS)
    const A = (Math.log10(TDS_mg_L) - 1) / 10;

    // Coeficiente B - efeito da temperatura (Langelier 1936 tabela)
    const B = -13.12 * Math.log10(T_K) + 34.55;

    // Coeficiente C - concentração de cálcio
    const C = Math.log10(Ca_mg_L) - 0.4;

    // Coeficiente D - alcalinidade
    const D = Math.log10(alkalinity_mg_L);

    const pH_s = 9.3 + A + B - (C + D);

    return pH - pH_s;
}

/**
 * Classifica o risco de incrustação ou corrosão com base no LSI.
 * Critérios per ASHRAE Handbook HVAC Systems (2020) Ch.48 e Ryznar (1944):
 *
 * LSI < -0.5  → corrosivo (água agressiva, subsaturada em CaCO3)
 * -0.5 ≤ LSI ≤ 0.5 → balanceado (margem de operação segura)
 * 0.5 < LSI ≤ 1.5  → tendência a incrustação leve
 * LSI > 1.5  → incrustação severa (risco operacional)
 *
 * @param {number} LSI - Índice de Langelier
 * @returns {'corrosive'|'balanced'|'scale_forming'|'severe_scaling'}
 */
export function classifyScalingRisk(LSI: number): 'corrosive' | 'balanced' | 'scale_forming' | 'severe_scaling' {
    if (typeof LSI !== 'number' || !isFinite(LSI)) {
        throw new TypeError('LSI must be a finite number');
    }
    if (LSI > 1.5) return 'severe_scaling';
    if (LSI > 0.5) return 'scale_forming';
    if (LSI >= -0.5) return 'balanced';
    return 'corrosive';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialBoilerWaterTreatmentMeta: AnalyticsModuleMeta = {
    name: 'industrialBoilerWaterTreatment',
    description: 'industrialBoilerWaterTreatment',
    category: 'analytics',
    familyTags: ['water', 'industrial', 'hydrocarbon'],
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
