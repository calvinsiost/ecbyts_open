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
// Application: EHS & Mining - Oil Spill Response Planning
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Oil Spill Response Planning (OilSpillResponse)
 *
 * Módulo puro implementando modelos de resposta a derramamento de petróleo:
 * espalhamento de Fay (1971), evaporação de Fingas (1996), tempo de resposta
 * e classificação de gravidade CONAMA 398/2008 / MARPOL.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Fay, J. A. (1971). "Physical processes in the spread of oil on a water
 *     surface." Proceedings of Joint Conference on Prevention and Control of
 *     Oil Spills, pp. 463–467, Washington DC. API.
 *     DOI: 10.7901/2169-3358-1971-1-463 (gravitational-viscous spreading model)
 *   - Fingas, M. F. (1996). "The evaporation of oil spills: Development and
 *     implementation of new prediction methodology." Proceedings of the 19th
 *     Arctic and Marine Oil Spill Program (AMOP) Technical Seminar, pp. 1–33.
 *     Ottawa: Environment Canada. (empirical evaporation model)
 *   - CONAMA Resolução 398 (2008). Dispõe sobre conteúdo mínimo do Plano de
 *     Emergência Individual para incidentes de poluição por óleo. CONAMA, Brasília.
 *     (tier classification: local/regional/national response)
 *   - ITOPF (2021). Response to Marine Oil Spills. The International Tanker Owners
 *     Pollution Federation Limited, London. (operational response guidelines)
 *
 * @module oilSpillResponse
 */

'use strict';

// Fay (1971) empirical spreading constant
// Constante empírica de espalhamento de Fay (1971)
const FAY_K = 1.2;

// Time for spreading calculation: 1 hour in seconds
// Tempo para cálculo de espalhamento: 1 hora em segundos
const SPREAD_TIME_S = 3600;

// Fingas (1996) evaporation model coefficients for light crude (generic)
// Coeficientes do modelo de evaporação de Fingas (1996) para petróleo cru leve
const FINGAS_A = 0.165;
const FINGAS_B = 0.045;

/**
 * Computes oil spreading area and thickness using the Fay (1971) model.
 * Calcula a área de espalhamento e espessura do óleo pelo modelo de Fay (1971).
 *
 *   A = K × (g × V² / ν)^(1/3) × t^(2/3)
 *   thickness = V × 1000 / A  (mm)
 *
 * where K=1.2, g=9.81 m/s², t=3600 s (1h), ν=viscosity/1e6 (m²/s).
 *
 * @param {number} volume_m3 - Spilled oil volume (m³). Volume de óleo derramado (m³).
 * @param {number} viscosity_cSt - Kinematic viscosity (cSt = mm²/s). Viscosidade cinemática (cSt).
 * @param {number} density_kg_m3 - Oil density (kg/m³). Densidade do óleo (kg/m³).
 * @returns {{ area_m2: number, thickness_mm: number }}
 * @throws {RangeError} If volume or viscosity are non-positive.
 */
export function computeSpreadingRate(volume_m3: any, viscosity_cSt: any, density_kg_m3: any) {
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    if (viscosity_cSt <= 0) throw new RangeError('viscosity_cSt must be > 0');
    if (density_kg_m3 <= 0) throw new RangeError('density_kg_m3 must be > 0');

    const g = 9.81; // aceleração da gravidade (m/s²)
    const nu = viscosity_cSt / 1e6; // conversão cSt → m²/s

    // Modelo gravitacional-viscoso de Fay: fase de espalhamento dominada pela viscosidade
    const area_m2 = FAY_K * Math.pow((g * volume_m3 * volume_m3) / nu, 1 / 3) * Math.pow(SPREAD_TIME_S, 2 / 3);

    // Espessura média em mm (volume × 1000 / área)
    const thickness_mm = (volume_m3 * 1000) / area_m2;

    return { area_m2, thickness_mm };
}

/**
 * Computes the evaporated fraction of spilled oil using the Fingas (1996) model.
 * Calcula a fração evaporada do óleo pelo modelo empírico de Fingas (1996).
 *
 *   Fv = (A + B × T) × ln(t)
 *   where A=0.165, B=0.045, T in °C, t in minutes.
 *
 * @param {number} initialVolume_m3 - Initial spill volume (m³). Volume inicial derramado (m³).
 * @param {number} vaporPressure_kPa - Vapor pressure (kPa). Pressão de vapor (kPa).
 * @param {number} temperature_C - Surface temperature (°C). Temperatura da superfície (°C).
 * @param {number} windSpeed_m_s - Wind speed (m/s). Velocidade do vento (m/s).
 * @param {number} time_h - Elapsed time (h). Tempo decorrido (h).
 * @returns {{ evaporatedFraction: number, remainingVolume_m3: number }}
 * @throws {RangeError} If initialVolume or time are non-positive.
 */
export function computeEvaporationLoss(initialVolume_m3: any, vaporPressure_kPa: any, temperature_C: any, windSpeed_m_s: any, time_h: any) {
    if (initialVolume_m3 <= 0) throw new RangeError('initialVolume_m3 must be > 0');
    if (time_h <= 0) throw new RangeError('time_h must be > 0');

    // Tempo convertido para minutos (Fingas usa ln(t) em minutos)
    const t_min = time_h * 60;

    // Fração evaporada: limitada entre 0 e 1
    const rawFraction = (FINGAS_A + FINGAS_B * temperature_C) * Math.log(t_min);
    const evaporatedFraction = Math.min(1, Math.max(0, rawFraction));

    // Volume remanescente após evaporação
    const remainingVolume_m3 = initialVolume_m3 * (1 - evaporatedFraction);

    return { evaporatedFraction, remainingVolume_m3 };
}

/**
 * Computes containment and recovery time for an oil spill response.
 * Calcula os tempos de contenção e recuperação para resposta a derramamento.
 *
 *   containmentTime = volume / spillRate
 *   recoveryTime = volume / responseCapacity
 *   totalTime = containmentTime + recoveryTime
 *
 * @param {number} spillVolume_m3 - Total spill volume (m³). Volume total derramado (m³).
 * @param {number} spillRate_m3_h - Spill rate (m³/h). Taxa de derramamento (m³/h).
 * @param {number} resourceCapacity_m3_h - Response resource capacity (m³/h). Capacidade de resposta (m³/h).
 * @returns {{ containmentTime_h: number, recoveryTime_h: number, totalTime_h: number }}
 * @throws {RangeError} If any input is non-positive.
 */
export function computeResponseTime(spillVolume_m3: any, spillRate_m3_h: any, resourceCapacity_m3_h: any) {
    if (spillVolume_m3 <= 0) throw new RangeError('spillVolume_m3 must be > 0');
    if (spillRate_m3_h <= 0) throw new RangeError('spillRate_m3_h must be > 0');
    if (resourceCapacity_m3_h <= 0) throw new RangeError('resourceCapacity_m3_h must be > 0');

    // Tempo para conter o derramamento (fechar a fonte)
    const containmentTime_h = spillVolume_m3 / spillRate_m3_h;

    // Tempo para recuperar o material derramado
    const recoveryTime_h = spillVolume_m3 / resourceCapacity_m3_h;

    // Tempo total de resposta
    const totalTime_h = containmentTime_h + recoveryTime_h;

    return { containmentTime_h, recoveryTime_h, totalTime_h };
}

/**
 * Classifies oil spill severity per CONAMA 398/2008 and MARPOL convention.
 * Classifica a gravidade do derramamento conforme CONAMA 398/2008 e MARPOL.
 *
 * Tier classification:
 *   Tier 1 (local):    volume ≤ 7 m³, no sensitive habitat
 *   Tier 2 (regional): volume > 7 m³ and ≤ 700 m³, or sensitive habitat + small spill
 *   Tier 3 (national): volume > 700 m³, or any sensitive habitat involvement
 *
 * @param {number} volume_m3 - Spill volume (m³). Volume do derramamento (m³).
 * @param {string} location - Spill location: 'onshore'|'offshore'|'estuarine'. Local do derramamento.
 * @param {boolean} sensitiveHabitat - Sensitive habitat present. Habitat sensível presente.
 * @returns {{ tier: number, classification: string, responseLevel: string }}
 * @throws {RangeError} If volume_m3 <= 0.
 * @throws {TypeError} If location is not recognized.
 */
export function classifySpillSeverity(volume_m3: any, location: any, sensitiveHabitat: any) {
    if (volume_m3 <= 0) throw new RangeError('volume_m3 must be > 0');
    const validLocations = ['onshore', 'offshore', 'estuarine'];
    if (!validLocations.includes(location)) throw new TypeError(`location must be one of ${validLocations.join(', ')}`);

    let tier;
    let classification;
    let responseLevel;

    // Classificação por volume e sensibilidade ambiental (CONAMA 398/2008)
    if (volume_m3 > 700 || sensitiveHabitat) {
        tier = 3;
        classification = sensitiveHabitat ? 'Grande porte — habitat sensível comprometido' : 'Grande porte — ≥700 m³';
        responseLevel = 'national';
    } else if (volume_m3 > 7) {
        tier = 2;
        classification = 'Médio porte — 7–700 m³';
        responseLevel = 'regional';
    } else {
        tier = 1;
        classification = 'Pequeno porte — ≤7 m³';
        responseLevel = 'local';
    }

    return { tier, classification, responseLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const oilSpillResponseMeta = {
    name: 'oilSpillResponse',
    description: 'Oil Spill Response Planning',
    category: 'analytics',
    familyTags: ['hydrocarbon'],
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
