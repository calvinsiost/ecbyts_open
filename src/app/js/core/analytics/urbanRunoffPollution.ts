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
 * Urban Runoff Pollution Module
 *
 * Funções para análise de poluição em escoamento pluvial urbano.
 * Calcula EMC (Event Mean Concentration), carga de poluentes,
 * razão de primeiro fluxo (First Flush Ratio) e classifica a
 * qualidade do escoamento.
 *
 * References:
 *  - Brezonik P.L. & Stadelmann T.H. (2002). Analysis and predictive models
 *    of stormwater runoff volumes, loads, and pollutant concentrations from
 *    watersheds in the Twin Cities metropolitan area, Minnesota, USA.
 *    Water Research, 36(7), 1743–1757.
 *    DOI: 10.1016/S0043-1354(01)00345-5
 *  - Lee J.H. & Bang K.W. (2000). Characterization of urban stormwater runoff.
 *    Water Research, 34(6), 1773–1780.
 *    DOI: 10.1016/S0043-1354(99)00434-2
 *  - US EPA (1983). Results of the Nationwide Urban Runoff Program.
 *    NTIS PB84-185552. US Environmental Protection Agency.
 */

/**
 * Limites de classificação de qualidade para TSS (mg/L) - critério primário.
 * Baseado em referências de qualidade de cursos d'água receptores (CONAMA 357/2005).
 */
const TSS_THRESHOLDS_MG_L = {
    clean: 50, // < 50 mg/L → limpo
    slightly_polluted: 150, // < 150 mg/L → levemente poluído
    polluted: 300, // < 300 mg/L → poluído
    // >= 300 mg/L → altamente poluído
};

interface EMCResult { EMC_mg_L: number }
/**
 * Calcula a Concentração Média por Evento (EMC) de um poluente.
 * EMC = carga_total / volume_total × fator_conversão.
 * Método padrão US EPA NPDES para caracterização de escoamento pluvial.
 *
 * @param {number} pollutant_load_kg    Carga total do poluente no evento (kg).
 * @param {number} runoff_volume_m3     Volume total de escoamento no evento (m³).
 * @returns {EMCResult} Concentração média em mg/L.
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se carga for negativa ou volume for não-positivo.
 */
export function computeEventMeanConcentration(pollutant_load_kg: number, runoff_volume_m3: number): EMCResult {
    if (typeof pollutant_load_kg !== 'number' || typeof runoff_volume_m3 !== 'number') {
        throw new TypeError('pollutant_load_kg and runoff_volume_m3 must be numbers');
    }
    if (pollutant_load_kg < 0) throw new RangeError('pollutant_load_kg must be >= 0');
    if (runoff_volume_m3 <= 0) throw new RangeError('runoff_volume_m3 must be > 0');

    // kg/m³ × 1e6 mg/kg / (1e3 L/m³) = × 1e3 → mg/L
    // Simplificando: (kg / m³) × 1e3 = g/m³ = mg/L não; correto:
    // 1 kg = 1e6 mg; 1 m³ = 1e3 L → kg/m³ × (1e6 mg/kg) / (1e3 L/m³) = × 1e3 mg/L
    const EMC_mg_L = (pollutant_load_kg / runoff_volume_m3) * 1e3;

    return { EMC_mg_L };
}

interface LoadResult { load_kg: number }
/**
 * Calcula a carga total de poluente a partir da EMC e do volume de escoamento.
 * Inverso de computeEventMeanConcentration.
 * carga_kg = EMC_mg_L × volume_m3 / 1e3.
 *
 * @param {number} EMC_mg_L         Concentração média por evento (mg/L).
 * @param {number} runoff_volume_m3 Volume de escoamento (m³).
 * @returns {LoadResult} Carga total do poluente (kg).
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se EMC for negativa ou volume for não-positivo.
 */
export function computePollutantLoad(EMC_mg_L: number, runoff_volume_m3: number): LoadResult {
    if (typeof EMC_mg_L !== 'number' || typeof runoff_volume_m3 !== 'number') {
        throw new TypeError('EMC_mg_L and runoff_volume_m3 must be numbers');
    }
    if (EMC_mg_L < 0) throw new RangeError('EMC_mg_L must be >= 0');
    if (runoff_volume_m3 <= 0) throw new RangeError('runoff_volume_m3 must be > 0');

    const load_kg = (EMC_mg_L * runoff_volume_m3) / 1e3;
    return { load_kg };
}

interface FFRResult { FFR: number }
/**
 * Calcula a Razão do Primeiro Fluxo (First Flush Ratio - FFR).
 * FFR = (% de carga na fração inicial) / (% de volume na fração inicial).
 * FFR > 1 indica concentração preferencial no início do evento (first flush).
 * FFR < 1 indica diluição progressiva.
 *
 * @param {number} early_load_pct    Percentual de carga total no volume inicial (ex: 30 = 30%).
 * @param {number} early_volume_pct  Percentual de volume total na fração inicial (ex: 20 = 20%).
 * @returns {FFRResult} First Flush Ratio.
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se valores estiverem fora de (0, 100].
 */
export function computeFirstFlushRatio(early_load_pct: number, early_volume_pct: number): FFRResult {
    if (typeof early_load_pct !== 'number' || typeof early_volume_pct !== 'number') {
        throw new TypeError('early_load_pct and early_volume_pct must be numbers');
    }
    if (early_load_pct <= 0 || early_load_pct > 100) {
        throw new RangeError('early_load_pct must be in (0, 100]');
    }
    if (early_volume_pct <= 0 || early_volume_pct > 100) {
        throw new RangeError('early_volume_pct must be in (0, 100]');
    }

    const FFR = early_load_pct / early_volume_pct;
    return { FFR };
}

interface QualityResult { quality: string }
/**
 * Classifica a qualidade do escoamento pluvial urbano com base em parâmetros físico-químicos.
 * Critério primário: TSS (Sólidos Suspensos Totais) em mg/L.
 * Critérios secundários: DQO (COD) e Fósforo Total (TP) modulam a classificação.
 *
 * @param {number} TSS_mg_L   Sólidos Suspensos Totais (mg/L).
 * @param {number} COD_mg_L   Demanda Química de Oxigênio (mg/L).
 * @param {number} TP_mg_L    Fósforo Total (mg/L).
 * @returns {QualityResult} Qualidade: 'clean', 'slightly_polluted', 'polluted', 'highly_polluted'.
 * @throws {TypeError} Se algum argumento não for número.
 * @throws {RangeError} Se valores forem negativos.
 */
export function classifyUrbanRunoffQuality(TSS_mg_L: number, COD_mg_L: number, TP_mg_L: number): QualityResult {
    if (typeof TSS_mg_L !== 'number' || typeof COD_mg_L !== 'number' || typeof TP_mg_L !== 'number') {
        throw new TypeError('TSS_mg_L, COD_mg_L, and TP_mg_L must be numbers');
    }
    if (TSS_mg_L < 0) throw new RangeError('TSS_mg_L must be >= 0');
    if (COD_mg_L < 0) throw new RangeError('COD_mg_L must be >= 0');
    if (TP_mg_L < 0) throw new RangeError('TP_mg_L must be >= 0');

    // Determina categoria primária por TSS
    let base_quality: number;
    if (TSS_mg_L < TSS_THRESHOLDS_MG_L.clean) {
        base_quality = 0; // clean
    } else if (TSS_mg_L < TSS_THRESHOLDS_MG_L.slightly_polluted) {
        base_quality = 1; // slightly_polluted
    } else if (TSS_mg_L < TSS_THRESHOLDS_MG_L.polluted) {
        base_quality = 2; // polluted
    } else {
        base_quality = 3; // highly_polluted
    }

    // Critérios secundários podem elevar a categoria em até 1 nível
    let penalty = 0;
    if (COD_mg_L > 200) penalty += 1; // DQO elevada
    if (TP_mg_L > 1.0) penalty += 1; // TP elevado (eutrofização)

    const final_level = Math.min(3, base_quality + Math.min(1, penalty));

    const LABELS = ['clean', 'slightly_polluted', 'polluted', 'highly_polluted'];
    return { quality: LABELS[final_level]! };
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
    inputSchema: { type: string; properties: Record<string, any>; required: string[] };
    outputSchema: { type: string; properties: Record<string, any>; required: string[] };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const urbanRunoffPollutionMeta = {
    name: 'urbanRunoffPollution',
    description: 'urbanRunoffPollution',
    category: 'analytics',
    familyTags: ['stormwater'],
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
} as AnalyticsModuleMeta;
