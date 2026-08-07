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
// Application: EHS & Mining - Industrial Water Treatment Chemistry
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Industrial Water Treatment Chemistry
 *
 * Módulo puro para análise química de tratamento de água industrial.
 * Implementa o Índice de Saturação de Langelier (ISL/LSI), o Índice de
 * Estabilidade de Ryznar (RSI), dosagem de cloro e classificação de
 * corrosividade/incrustação da água.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Langelier, W.F. (1936). The analytical control of anti-corrosion water
 *     treatment. Journal AWWA 28(10):1500–1521.
 *     (índice de saturação de CaCO3 original)
 *   - Ryznar, J.W. (1944). A new index for determining amount of calcium
 *     carbonate scale formed by water. Journal AWWA 36(4):472–486.
 *     (índice de estabilidade para previsão de incrustação)
 *   - White, G.C. (2010). White's Handbook of Chlorination and Alternative
 *     Disinfectants. 5th ed. John Wiley & Sons. ISBN 978-0-470-18098-3.
 *     (dosagem de cloro, demand, residual, ponto de quebra)
 *
 * @module industrialWaterTreatmentChemistry
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
 * Calcula o pH de saturação (pHs) do CaCO3 pela fórmula de Langelier (1936).
 * pHs = pK2 − pKs + p[Ca²⁺] + p[HCO3⁻] + 5×pf(I)
 * Simplificação prática: pHs ≈ (9.3 + A + B) − (C + D)
 * onde A, B, C, D são funções empíricas de TDS, temperatura, Ca²⁺ e alcalinidade.
 * Langelier (1936) §3; Rossum & Merrill (1983) para constantes empíricas.
 *
 * @param {number} temp_C          - Temperatura da água (°C)
 * @param {number} tds_mgL         - Sólidos dissolvidos totais (mg/L)
 * @param {number} calcium_mgL     - Dureza em Ca²⁺ como CaCO3 (mg/L como CaCO3)
 * @param {number} alkalinity_mgL  - Alcalinidade total como CaCO3 (mg/L como CaCO3)
 * @returns {number} pHs - pH de equilíbrio de saturação do CaCO3
 */
function calcpHSaturation(
    temp_C: number,
    tds_mgL: number,
    calcium_mgL: number,
    alkalinity_mgL: number,
): number {
    // Fator A - função da temperatura (Langelier 1936 revisado por Rossum 1983)
    const A = (Math.log10(tds_mgL) - 1) / 10;

    // Fator B - função da temperatura (empírico, valido 0–80 °C)
    // Coeficientes ajustados por regressão de dados termodinâmicos
    const B = -13.12 * Math.log10(temp_C + 273) + 34.55;

    // Fator C - função da dureza em Ca²⁺ (log10 de [Ca²⁺] como CaCO3)
    const C = Math.log10(Math.max(calcium_mgL, 0.01)) - 0.4;

    // Fator D - função da alcalinidade total (log10 de alcalinidade como CaCO3)
    const D = Math.log10(Math.max(alkalinity_mgL, 0.01));

    return 9.3 + A + B - C - D;
}

/**
 * Calcula o Índice de Saturação de Langelier (LSI / ISL).
 * LSI = pH_medido − pH_saturação
 * LSI > 0: água incrustante (supersaturada em CaCO3)
 * LSI < 0: água corrosiva (subsaturada em CaCO3)
 * LSI = 0: água em equilíbrio
 * Langelier (1936); White (2010) Cap. 2.
 *
 * @param {number} pH              - pH medido da água
 * @param {number} temp_C          - Temperatura da água (°C)
 * @param {number} tds_mgL         - TDS (mg/L; se desconhecido, usar condutividade × 0.64)
 * @param {number} calcium_mgL     - Dureza cálcica como CaCO3 (mg/L)
 * @param {number} alkalinity_mgL  - Alcalinidade total como CaCO3 (mg/L)
 * @returns {{ lsi: number, pHs: number }}
 *   lsi: Índice de Saturação de Langelier; pHs: pH de saturação calculado
 */
export function calcLangelierSaturationIndex(
    pH: number,
    temp_C: number,
    tds_mgL: number,
    calcium_mgL: number,
    alkalinity_mgL: number,
): { lsi: number; pHs: number } {
    if (typeof pH !== 'number' || pH < 0 || pH > 14) {
        throw new RangeError('pH deve ser número entre 0 e 14');
    }
    if (typeof temp_C !== 'number' || temp_C < 0 || temp_C > 100) {
        throw new RangeError('temp_C deve estar entre 0 e 100 °C');
    }
    if (typeof tds_mgL !== 'number' || tds_mgL <= 0) {
        throw new RangeError('tds_mgL deve ser número positivo (mg/L)');
    }
    if (typeof calcium_mgL !== 'number' || calcium_mgL <= 0) {
        throw new RangeError('calcium_mgL deve ser número positivo (mg/L como CaCO3)');
    }
    if (typeof alkalinity_mgL !== 'number' || alkalinity_mgL <= 0) {
        throw new RangeError('alkalinity_mgL deve ser número positivo (mg/L como CaCO3)');
    }

    const pHs = calcpHSaturation(temp_C, tds_mgL, calcium_mgL, alkalinity_mgL);
    const lsi = pH - pHs;

    return { lsi, pHs };
}

/**
 * Calcula o Índice de Estabilidade de Ryznar (RSI).
 * RSI = 2 × pHs − pH_medido
 * RSI < 6.0: incrustante; RSI 6.0–7.0: equilíbrio; RSI > 7.0: corrosivo.
 * Ryznar (1944) §2; White (2010) Cap. 2.
 *
 * @param {number} pH              - pH medido da água
 * @param {number} temp_C          - Temperatura da água (°C)
 * @param {number} tds_mgL         - TDS (mg/L)
 * @param {number} calcium_mgL     - Dureza cálcica como CaCO3 (mg/L)
 * @param {number} alkalinity_mgL  - Alcalinidade total como CaCO3 (mg/L)
 * @returns {{ rsi: number, pHs: number }}
 *   rsi: Índice de Estabilidade de Ryznar; pHs: pH de saturação calculado
 */
export function calcRyznarStabilityIndex(
    pH: number,
    temp_C: number,
    tds_mgL: number,
    calcium_mgL: number,
    alkalinity_mgL: number,
): { rsi: number; pHs: number } {
    if (typeof pH !== 'number' || pH < 0 || pH > 14) {
        throw new RangeError('pH deve ser número entre 0 e 14');
    }
    if (typeof temp_C !== 'number' || temp_C < 0 || temp_C > 100) {
        throw new RangeError('temp_C deve estar entre 0 e 100 °C');
    }
    if (typeof tds_mgL !== 'number' || tds_mgL <= 0) {
        throw new RangeError('tds_mgL deve ser número positivo (mg/L)');
    }
    if (typeof calcium_mgL !== 'number' || calcium_mgL <= 0) {
        throw new RangeError('calcium_mgL deve ser número positivo (mg/L como CaCO3)');
    }
    if (typeof alkalinity_mgL !== 'number' || alkalinity_mgL <= 0) {
        throw new RangeError('alkalinity_mgL deve ser número positivo (mg/L como CaCO3)');
    }

    const pHs = calcpHSaturation(temp_C, tds_mgL, calcium_mgL, alkalinity_mgL);
    const rsi = 2 * pHs - pH;

    return { rsi, pHs };
}

/**
 * Calcula a dosagem de cloro necessária para atingir residual de cloro livre.
 * Dosagem = Demanda de Cloro + Cloro Residual Desejado.
 * Demanda de cloro é consumida por matéria orgânica, NH3, Fe²⁺, Mn²⁺ etc.
 * White (2010) Cap. 4 - ponto de quebra (breakpoint chlorination).
 *
 * @param {number} chlorineDemand_mgL   - Demanda de cloro da água (mg/L como Cl2)
 * @param {number} desiredResidual_mgL  - Residual de cloro livre desejado (mg/L como Cl2)
 * @param {number} contactTime_min      - Tempo de contato (min; para CT check)
 * @param {number} flowRate_m3h         - Vazão de tratamento (m³/h)
 * @returns {{ dosage_mgL: number, chlorineRate_kg_h: number, ct_mg_min_L: number }}
 *   dosage_mgL: dosagem total (mg/L); chlorineRate_kg_h: taxa de dosagem (kg/h);
 *   ct_mg_min_L: parâmetro CT para inativação (mg·min/L)
 */
export function calcChlorineDosage(
    chlorineDemand_mgL: number,
    desiredResidual_mgL: number,
    contactTime_min: number,
    flowRate_m3h: number,
): { dosage_mgL: number; chlorineRate_kg_h: number; ct_mg_min_L: number } {
    if (typeof chlorineDemand_mgL !== 'number' || chlorineDemand_mgL < 0) {
        throw new RangeError('chlorineDemand_mgL deve ser >= 0 (mg/L)');
    }
    if (typeof desiredResidual_mgL !== 'number' || desiredResidual_mgL <= 0) {
        throw new RangeError('desiredResidual_mgL deve ser número positivo (mg/L)');
    }
    if (typeof contactTime_min !== 'number' || contactTime_min <= 0) {
        throw new RangeError('contactTime_min deve ser número positivo (min)');
    }
    if (typeof flowRate_m3h !== 'number' || flowRate_m3h <= 0) {
        throw new RangeError('flowRate_m3h deve ser número positivo (m³/h)');
    }

    // Dosagem total necessária (mg/L)
    const dosage_mgL = chlorineDemand_mgL + desiredResidual_mgL;

    // Taxa de dosagem de cloro (kg/h): dosagem [mg/L] × vazão [m³/h] × 1e-3 [kg/g] × 1e3 [L/m³]
    const chlorineRate_kg_h = (dosage_mgL * flowRate_m3h) / 1000;

    // CT (Concentration × Time) para inativação microbiana (mg·min/L)
    const ct_mg_min_L = desiredResidual_mgL * contactTime_min;

    return { dosage_mgL, chlorineRate_kg_h, ct_mg_min_L };
}

/**
 * Classifica a corrosividade/incrustação da água com base no LSI e RSI.
 * Utiliza ambos os índices para classificação mais robusta.
 * Langelier (1936) §4; Ryznar (1944) §3; White (2010) Tabela 2.1.
 *
 * @param {number} lsi - Índice de Saturação de Langelier
 * @param {number} rsi - Índice de Estabilidade de Ryznar
 * @returns {{ classification: string, description: string, recommendation: string }}
 *   classification: 'highly_corrosive' | 'corrosive' | 'balanced' | 'scale_forming' | 'highly_scale_forming'
 */
export function classifyWaterCorrosivity(
    lsi: number,
    rsi: number,
): { classification: string; description: string; recommendation: string } {
    if (typeof lsi !== 'number') {
        throw new TypeError('lsi deve ser número (Índice de Langelier)');
    }
    if (typeof rsi !== 'number') {
        throw new TypeError('rsi deve ser número (Índice de Ryznar)');
    }

    // Classificação combinada LSI + RSI (Langelier 1936; Ryznar 1944)
    if (lsi < -2.0 || rsi > 9.0) {
        return {
            classification: 'highly_corrosive',
            description: 'Muito corrosiva — alto potencial de corrosão de tubulações metálicas',
            recommendation: 'Adicionar alcalinidade (bicarbonato de sódio) ou ajustar pH para ≥7.5',
        };
    }
    if (lsi < 0 || rsi > 7.0) {
        return {
            classification: 'corrosive',
            description: 'Corrosiva — pode atacar metais e dissolve CaCO3 existente',
            recommendation: 'Monitorar pH e alcalinidade; considerar inibidor de corrosão',
        };
    }
    if (lsi <= 0.5 && rsi >= 6.0 && rsi <= 7.0) {
        return {
            classification: 'balanced',
            description: 'Equilibrada — baixo potencial de corrosão e de incrustação',
            recommendation: 'Manter condições atuais; monitorar mensalmente',
        };
    }
    if (lsi <= 2.0 || rsi >= 4.0) {
        return {
            classification: 'scale_forming',
            description: 'Incrustante — tende a depositar CaCO3 em superfícies quentes',
            recommendation: 'Adicionar inibidor de incrustação ou acidular com H2SO4',
        };
    }
    return {
        classification: 'highly_scale_forming',
        description: 'Muito incrustante — alto risco de obstrução por carbonato de cálcio',
        recommendation: 'Tratamento urgente: acidificação, amaciamento ou anti-incrustante',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialWaterTreatmentChemistryMeta: AnalyticsModuleMeta = {
    name: 'industrialWaterTreatmentChemistry',
    description: 'Industrial Water Treatment Chemistry',
    category: 'analytics',
    familyTags: ['water', 'industrial'],
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
