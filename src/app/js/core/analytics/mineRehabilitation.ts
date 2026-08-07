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
 * Mine Rehabilitation Assessment Module
 *
 * Ferramentas para avaliação e planejamento de reabilitação de áreas mineradas.
 * Inclui: geração de drenagem ácida, índice de reabilitação de solo,
 * sucesso de revegetação e risco de erosão.
 *
 * Referências acadêmicas:
 *   - AMIRA P387A (2002). ARD Test Handbook - Prediction & Kinetic Control
 *     of Acid and Metalliferous Drainage. AMIRA International Ltd.
 *     (método AP=31.25×S%; NP=carbonate×8.3)
 *   - Wischmeier, W.H. & Smith, D.D. (1978). Predicting Rainfall Erosion
 *     Losses. USDA Agriculture Handbook No. 537.
 *     (USLE: A = R × K × LS × C × P)
 *   - Tongway, D.J. & Hindley, N.L. (2004). Landscape Function Analysis:
 *     Procedures for Monitoring and Assessing Landscapes. CSIRO Sustainable
 *     Ecosystems, Canberra. (base para SRI e revegetação)
 *
 * @module mineRehabilitation
 */

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
 * Computes Acid-Base Accounting (ABA) for mine waste classification.
 *
 * Calcula o Potencial de Geração de Ácido (AP), Potencial de Neutralização (NP)
 * e Potencial de Neutralização Líquido (NNP) conforme o método AMIRA (2002):
 *   AP  [kg H₂SO₄/t] = 31.25 × S%
 *   NP  [kg CaCO₃/t] = carbonate% × 8.3
 *   NNP = NP - AP
 *
 * Classificação:
 *   PAG      (Potentially Acid Generating): NNP < -20
 *   uncertain (zona de incerteza): -20 ≤ NNP ≤ 20
 *   NPAG     (Non-Potentially Acid Generating): NNP > 20
 *
 * @param S_pct - Teor de enxofre total [%]; deve ser 0–100
 * @param carbonate_pct - Teor de carbonato [%]; deve ser 0–100
 * @returns
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se algum percentual estiver fora de [0, 100]
 */
export function computeAcidMineGenerationPotential(
    S_pct: number,
    carbonate_pct: number,
): { AP_kg_H2SO4_t: number; NP_kg_CaCO3_t: number; NNP: number; classification: string } {
    if (typeof S_pct !== 'number' || typeof carbonate_pct !== 'number') {
        throw new TypeError('computeAcidMineGenerationPotential: S_pct e carbonate_pct devem ser números');
    }
    if (S_pct < 0 || S_pct > 100) {
        throw new RangeError(`computeAcidMineGenerationPotential: S_pct deve estar em [0, 100], recebido ${S_pct}`);
    }
    if (carbonate_pct < 0 || carbonate_pct > 100) {
        throw new RangeError(
            `computeAcidMineGenerationPotential: carbonate_pct deve estar em [0, 100], recebido ${carbonate_pct}`,
        );
    }
    const AP_kg_H2SO4_t = 31.25 * S_pct;
    const NP_kg_CaCO3_t = carbonate_pct * 8.3;
    const NNP = NP_kg_CaCO3_t - AP_kg_H2SO4_t;
    let classification: string;
    if (NNP < -20) {
        classification = 'PAG';
    } else if (NNP <= 20) {
        classification = 'uncertain';
    } else {
        classification = 'NPAG';
    }
    return { AP_kg_H2SO4_t, NP_kg_CaCO3_t, NNP, classification };
}

/**
 * Computes a composite Soil Rehabilitation Index (SRI).
 *
 * Índice composto (0–1) que pondera três indicadores-chave de qualidade do solo:
 *   - Matéria orgânica (peso 0.4): indicador de fertilidade e estrutura
 *   - pH (peso 0.4): amplitude ideal 5.5–7.5 para maioria das plantas
 *   - Compactação (peso 0.2): resistência à penetração em MPa (ideal < 2 MPa)
 *
 * @param organic_matter_pct - Teor de matéria orgânica [%]; deve ser 0–100
 * @param pH - pH do solo; deve ser 0–14
 * @param compaction_MPa - Resistência à penetração [MPa]; deve ser ≥ 0
 * @returns Índice de reabilitação de solo (0 = degradado, 1 = ótimo)
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se os valores estiverem fora dos limites físicos
 */
export function computeSoilRehabilitationIndex(
    organic_matter_pct: number,
    pH: number,
    compaction_MPa: number,
): { SRI: number } {
    if (typeof organic_matter_pct !== 'number' || typeof pH !== 'number' || typeof compaction_MPa !== 'number') {
        throw new TypeError('computeSoilRehabilitationIndex: todos os parâmetros devem ser números');
    }
    if (organic_matter_pct < 0 || organic_matter_pct > 100) {
        throw new RangeError(
            `computeSoilRehabilitationIndex: organic_matter_pct deve estar em [0, 100], recebido ${organic_matter_pct}`,
        );
    }
    if (pH < 0 || pH > 14) {
        throw new RangeError(`computeSoilRehabilitationIndex: pH deve estar em [0, 14], recebido ${pH}`);
    }
    if (compaction_MPa < 0) {
        throw new RangeError(`computeSoilRehabilitationIndex: compaction_MPa deve ser ≥ 0, recebido ${compaction_MPa}`);
    }
    // Pontuação da matéria orgânica: normalizada até 5% (mínimo desejável para solo tropical)
    const om_score = Math.min(organic_matter_pct / 5, 1);
    // Pontuação do pH: função triangular com ápice em 6.5 (ideal neutro-ligeiramente ácido)
    const pH_score = Math.max(0, 1 - Math.abs(pH - 6.5) / 3.5);
    // Pontuação de compactação: linear, 0 MPa → 1.0; ≥ 4 MPa → 0.0
    const compact_score = Math.max(0, 1 - compaction_MPa / 4);
    const SRI = om_score * 0.4 + pH_score * 0.4 + compact_score * 0.2;
    return { SRI: Math.min(1, Math.max(0, SRI)) };
}

/**
 * Computes Revegetation Success Index (RSI) and category.
 *
 * Avalia o sucesso da revegetação combinando cobertura vegetal e riqueza de espécies:
 *   RSI = (cover / target × 0.6) + (richness / 10 × 0.4)
 *
 * Categorias: poor (RSI < 0.4), fair (0.4–0.6), good (0.6–0.8), excellent (> 0.8)
 *
 * @param cover_pct - Cobertura vegetal atual [%]; deve ser 0–100
 * @param species_richness - Número de espécies presentes; deve ser ≥ 0
 * @param target_cover_pct - Meta de cobertura [%]; deve ser > 0 e ≤ 100
 * @returns
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se os valores estiverem fora dos limites físicos
 */
export function computeRevegitationSuccess(
    cover_pct: number,
    species_richness: number,
    target_cover_pct: number,
): { RSI: number; category: 'poor' | 'fair' | 'good' | 'excellent' } {
    if (typeof cover_pct !== 'number' || typeof species_richness !== 'number' || typeof target_cover_pct !== 'number') {
        throw new TypeError('computeRevegitationSuccess: todos os parâmetros devem ser números');
    }
    if (cover_pct < 0 || cover_pct > 100) {
        throw new RangeError(`computeRevegitationSuccess: cover_pct deve estar em [0, 100], recebido ${cover_pct}`);
    }
    if (species_richness < 0) {
        throw new RangeError(`computeRevegitationSuccess: species_richness deve ser ≥ 0, recebido ${species_richness}`);
    }
    if (target_cover_pct <= 0 || target_cover_pct > 100) {
        throw new RangeError(
            `computeRevegitationSuccess: target_cover_pct deve estar em (0, 100], recebido ${target_cover_pct}`,
        );
    }
    const cover_ratio = Math.min(cover_pct / target_cover_pct, 1);
    const richness_score = Math.min(species_richness / 10, 1);
    const RSI = cover_ratio * 0.6 + richness_score * 0.4;
    let category: 'poor' | 'fair' | 'good' | 'excellent';
    if (RSI < 0.4) {
        category = 'poor';
    } else if (RSI < 0.6) {
        category = 'fair';
    } else if (RSI < 0.8) {
        category = 'good';
    } else {
        category = 'excellent';
    }
    return { RSI: Math.min(1, RSI), category };
}

/**
 * Computes erosion risk using a simplified USLE approach.
 *
 * Estima a perda de solo anual e classifica o risco de erosão.
 * USLE simplificada: A = K × LS × C × P
 * (fatores R e área omitidos - retorna perda específica t/ha/ano)
 *
 * Onde:
 *   K  = erodibilidade do solo [t·h/(MJ·mm)]
 *   LS = fator topográfico adimensional derivado da declividade
 *   C  = fator de cobertura e manejo (0–1)
 *   P  = fator de práticas conservacionistas (0–1, default 1 se não informado)
 *
 * Classificação de risco (t/ha/ano): low < 5, moderate < 15, high < 50, extreme ≥ 50
 *
 * @param slope_pct - Declividade [%]; deve ser ≥ 0
 * @param soil_erodibility - Fator K de erodibilidade [t·h/(MJ·mm)]; deve ser > 0
 * @param cover_factor - Fator C de cobertura (0–1); 0 = cobertura total, 1 = solo nu
 * @returns
 * @throws {TypeError} Se os parâmetros não forem números
 * @throws {RangeError} Se os valores estiverem fora dos limites físicos
 */
export function computeErosionRisk(
    slope_pct: number,
    soil_erodibility: number,
    cover_factor: number,
): { erosion_t_ha_yr: number; risk: 'low' | 'moderate' | 'high' | 'extreme' } {
    if (typeof slope_pct !== 'number' || typeof soil_erodibility !== 'number' || typeof cover_factor !== 'number') {
        throw new TypeError('computeErosionRisk: todos os parâmetros devem ser números');
    }
    if (slope_pct < 0) {
        throw new RangeError(`computeErosionRisk: slope_pct deve ser ≥ 0, recebido ${slope_pct}`);
    }
    if (soil_erodibility <= 0) {
        throw new RangeError(`computeErosionRisk: soil_erodibility deve ser > 0, recebido ${soil_erodibility}`);
    }
    if (cover_factor < 0 || cover_factor > 1) {
        throw new RangeError(`computeErosionRisk: cover_factor deve estar em [0, 1], recebido ${cover_factor}`);
    }
    // Fator LS derivado da declividade (aproximação McCool 1987 para declives > 9%):
    // LS ≈ (slope_pct / 9)^1.4
    const LS = Math.pow(Math.max(slope_pct, 0.1) / 9, 1.4);
    // P = 1 (sem práticas conservacionistas específicas - conservador)
    const P = 1;
    // Fator de erosividade da chuva R típico para região tropical (MJ·mm/(ha·h·ano)) = 6000
    const R = 6000;
    const erosion_t_ha_yr = R * soil_erodibility * LS * cover_factor * P;
    let risk: 'low' | 'moderate' | 'high' | 'extreme';
    if (erosion_t_ha_yr < 5) {
        risk = 'low';
    } else if (erosion_t_ha_yr < 15) {
        risk = 'moderate';
    } else if (erosion_t_ha_yr < 50) {
        risk = 'high';
    } else {
        risk = 'extreme';
    }
    return { erosion_t_ha_yr, risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineRehabilitationMeta: AnalyticsModuleMeta = {
    name: 'mineRehabilitation',
    description: 'mineRehabilitation',
    category: 'analytics',
    familyTags: ['mining'],
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
