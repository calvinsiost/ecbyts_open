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
 * Drinking Water Risk Assessment Module
 *
 * Implements chemical and microbial risk indices for drinking water quality
 * evaluation following WHO guidelines and QMRA framework.
 *
 * References:
 *  - WHO (2022) Guidelines for Drinking-water Quality, 4th ed. ISBN:9789240045446
 *  - WHO (2016) Quantitative Microbial Risk Assessment: Application for Water Safety Management
 *  - CONAMA Resolução 357/2005 - Classificação de corpos d'água
 */

/**
 * Computa o Chemical Risk Index (CRI) de um contaminante em água potável.
 * CRI = razão entre a concentração medida e o valor guia da OMS.
 * CRI < 1 indica conformidade; CRI > 1 indica risco.
 *
 * @param concentration_ug_L - Concentração do contaminante (µg/L), ≥ 0
 * @param guideline_ug_L     - Valor guia OMS para o parâmetro (µg/L), > 0
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se concentração < 0 ou guideline ≤ 0
 */
export function computeChemicalRiskIndex(concentration_ug_L: number, guideline_ug_L: number): { CRI: number } {
    if (typeof concentration_ug_L !== 'number' || !isFinite(concentration_ug_L)) {
        throw new TypeError('concentration_ug_L deve ser um número finito');
    }
    if (typeof guideline_ug_L !== 'number' || !isFinite(guideline_ug_L)) {
        throw new TypeError('guideline_ug_L deve ser um número finito');
    }
    if (concentration_ug_L < 0) {
        throw new RangeError('concentration_ug_L não pode ser negativo');
    }
    if (guideline_ug_L <= 0) {
        throw new RangeError('guideline_ug_L deve ser maior que zero');
    }

    const CRI = concentration_ug_L / guideline_ug_L;
    return { CRI };
}

/**
 * Computa o risco microbiano anual via modelo QMRA exponencial (dose-resposta).
 * P(infecção por evento) = 1 - e^(-k × N)
 * Risco anual = 1 - (1 - P)^365 (exposição diária)
 *
 * @param pathogen_conc_per_L - Concentração do patógeno (unidades/L), ≥ 0
 * @param dose_response_k     - Parâmetro k de dose-resposta (QMRA), > 0
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se pathogen_conc < 0 ou k ≤ 0
 */
export function computeMicrobialRisk(pathogen_conc_per_L: number, dose_response_k: number): { annual_risk: number } {
    if (typeof pathogen_conc_per_L !== 'number' || !isFinite(pathogen_conc_per_L)) {
        throw new TypeError('pathogen_conc_per_L deve ser um número finito');
    }
    if (typeof dose_response_k !== 'number' || !isFinite(dose_response_k)) {
        throw new TypeError('dose_response_k deve ser um número finito');
    }
    if (pathogen_conc_per_L < 0) {
        throw new RangeError('pathogen_conc_per_L não pode ser negativo');
    }
    if (dose_response_k <= 0) {
        throw new RangeError('dose_response_k deve ser maior que zero');
    }

    // Volume ingerido por dia: 2 L (padrão OMS para adulto)
    const dose = pathogen_conc_per_L * 2;
    const p_single = 1 - Math.exp(-dose_response_k * dose);
    const annual_risk = 1 - Math.pow(1 - p_single, 365);
    return { annual_risk };
}

/**
 * Computa o Water Safety Score (WSS) combinando risco químico e microbiano.
 * WSS = (1 - max(CRI)/10) × 0.6 + (1 - microbial_risk/0.001) × 0.4
 * Resultado capeado no intervalo [0, 1].
 *
 * @param CRI_values     - Array de CRI individuais (≥ 0 cada)
 * @param microbial_risk - Risco microbiano anual [0, 1]
 * @throws {TypeError}   se os argumentos tiverem tipo incorreto
 * @throws {RangeError}  se microbial_risk estiver fora de [0, 1]
 */
export function computeWaterSafetyScore(CRI_values: number[], microbial_risk: number): { WSS: number } {
    if (!Array.isArray(CRI_values) || CRI_values.length === 0) {
        throw new TypeError('CRI_values deve ser um array não vazio de números');
    }
    for (const v of CRI_values) {
        if (typeof v !== 'number' || !isFinite(v) || v < 0) {
            throw new TypeError('Cada valor de CRI deve ser um número finito ≥ 0');
        }
    }
    if (typeof microbial_risk !== 'number' || !isFinite(microbial_risk)) {
        throw new TypeError('microbial_risk deve ser um número finito');
    }
    if (microbial_risk < 0 || microbial_risk > 1) {
        throw new RangeError('microbial_risk deve estar no intervalo [0, 1]');
    }

    const maxCRI = Math.max(...CRI_values);
    const chem_component = Math.max(0, 1 - maxCRI / 10);
    const micro_component = Math.max(0, 1 - microbial_risk / 0.001);
    const WSS = Math.min(1, Math.max(0, chem_component * 0.6 + micro_component * 0.4));
    return { WSS };
}

/**
 * Classifica a qualidade da água potável com base no WSS.
 * WSS ≥ 0.8 → safe | ≥ 0.5 → marginal | ≥ 0.2 → poor | < 0.2 → unsafe
 *
 * @param WSS - Water Safety Score [0, 1]
 * @throws {TypeError}   se WSS não for número finito
 * @throws {RangeError}  se WSS estiver fora de [0, 1]
 */
export function classifyDrinkingWaterQuality(WSS: number): { quality: 'safe' | 'marginal' | 'poor' | 'unsafe' } {
    if (typeof WSS !== 'number' || !isFinite(WSS)) {
        throw new TypeError('WSS deve ser um número finito');
    }
    if (WSS < 0 || WSS > 1) {
        throw new RangeError('WSS deve estar no intervalo [0, 1]');
    }

    let quality: 'safe' | 'marginal' | 'poor' | 'unsafe';
    if (WSS >= 0.8) quality = 'safe';
    else if (WSS >= 0.5) quality = 'marginal';
    else if (WSS >= 0.2) quality = 'poor';
    else quality = 'unsafe';

    return { quality };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const drinkingWaterRiskMeta: AnalyticsModuleMeta = {
    name: 'drinkingWaterRisk',
    description: 'drinkingWaterRisk',
    category: 'analytics',
    familyTags: ['water', 'risk'],
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
