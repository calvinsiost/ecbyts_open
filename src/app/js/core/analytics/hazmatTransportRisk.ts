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
// Application: EHS & Mining - Hazardous Materials Transport Risk
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Hazardous Materials Transport Risk (HazmatTransportRisk)
 *
 * Módulo puro implementando modelos de risco para transporte de materiais
 * perigosos: distância de perigo por liberação acidental, índice de risco
 * de transporte, raio de evacuação e classificação de incidentes NFPA 704.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - US DOT/PHMSA (2024). Emergency Response Guidebook (ERG 2024).
 *     Washington, DC: Pipeline and Hazardous Materials Safety Administration.
 *     (evacuation zones, isolation distances)
 *   - NOAA/EPA (2023). CAMEO Chemicals - Computer-Aided Management of
 *     Emergency Operations. National Oceanic and Atmospheric Administration.
 *     https://cameochemicals.noaa.gov (simplified dispersion model basis)
 *   - NFPA 704 (2022). Standard System for the Identification of the Hazards
 *     of Materials for Emergency Response. National Fire Protection Association.
 *     (severity classification: health/flammability/instability ratings)
 *   - ABNT NBR 7500 (2017). Identificação para o Transporte Terrestre,
 *     Manuseio, Movimentação e Armazenamento de Produtos. ABNT, Rio de Janeiro.
 *     (Brazilian hazmat transport standard)
 *
 * @module hazmatTransportRisk
 */

'use strict';

// Stability class factors for atmospheric dispersion
// Fatores de classe de estabilidade para dispersão atmosférica (Pasquill-Gifford)
/** @type {Record<string, number>} */
const STABILITY_FACTORS = { A: 0.4, B: 0.5, C: 0.6, D: 0.7, E: 0.8, F: 1.0 };

// Hazard class weights for transport risk index
// Pesos de classe de risco para o índice de risco de transporte (TRI)
/** @type {Record<number, number>} */
const HAZARD_WEIGHTS = { 1: 2.0, 2: 1.5, 3: 1.3, 6: 1.8, 8: 1.2 };

/**
 * Computes the danger distance and affected area from an accidental release.
 * Calcula a distância de perigo e a área afetada por liberação acidental.
 *
 * Simplified CAMEO/ALOHA model:
 *   D = 0.01 × Q^0.4 × (LC50)^(-0.5) × (windSpeed)^(-0.3) × stabilityFactor
 *
 * @param {number} quantity_kg - Released quantity (kg). Quantidade liberada (kg).
 * @param {number} toxicityLC50_mg_m3 - LC50 concentration (mg/m³). Concentração LC50 (mg/m³).
 * @param {number} windSpeed_m_s - Wind speed (m/s). Velocidade do vento (m/s).
 * @param {string} stabilityClass - Pasquill-Gifford class (A–F). Classe de estabilidade (A–F).
 * @returns {{ dangerDistance_m: number, affectedArea_m2: number }}
 * @throws {RangeError} If any numeric input is non-positive.
 * @throws {TypeError} If stabilityClass is not one of A–F.
 */
export function computeReleaseConsequence(quantity_kg: any, toxicityLC50_mg_m3: any, windSpeed_m_s: any, stabilityClass: any) {
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');
    if (toxicityLC50_mg_m3 <= 0) throw new RangeError('toxicityLC50_mg_m3 must be > 0');
    if (windSpeed_m_s <= 0) throw new RangeError('windSpeed_m_s must be > 0');
const sf = STABILITY_FACTORS[stabilityClass as keyof typeof STABILITY_FACTORS];
    if (sf === undefined)
        throw new TypeError(`stabilityClass must be one of A, B, C, D, E, F — got '${stabilityClass}'`);

    // Distância de perigo (m) baseada no modelo simplificado CAMEO
    const dangerDistance_m =
        0.01 * Math.pow(quantity_kg, 0.4) * Math.pow(toxicityLC50_mg_m3, -0.5) * Math.pow(windSpeed_m_s, -0.3) * sf;

    // Área afetada assumindo círculo com raio = distância de perigo
    const affectedArea_m2 = Math.PI * dangerDistance_m * dangerDistance_m;

    return { dangerDistance_m, affectedArea_m2 };
}

/**
 * Computes the Transport Risk Index (TRI) for hazardous material shipment.
 * Calcula o Índice de Risco de Transporte (TRI) para cargas perigosas.
 *
 *   TRI = log10(Q × pop × 1/d) × hazardWeight
 *
 * @param {number} quantity_kg - Shipment quantity (kg).
 * @param {number} distance_km - Transport distance (km).
 * @param {number} populationDensity_per_km2 - Population density (inh/km²).
 * @param {number} hazardClass - UN hazard class (1, 2, 3, 6, or 8).
 * @returns {{ tri: number, riskLevel: string }}
 * @throws {RangeError} If quantity, distance, or density are non-positive.
 * @throws {TypeError} If hazardClass is not supported.
 */
export function computeTransportRiskIndex(quantity_kg: any, distance_km: any, populationDensity_per_km2: any, hazardClass: any) {
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');
    if (distance_km <= 0) throw new RangeError('distance_km must be > 0');
    if (populationDensity_per_km2 <= 0) throw new RangeError('populationDensity_per_km2 must be > 0');
const hw = HAZARD_WEIGHTS[hazardClass as keyof typeof HAZARD_WEIGHTS];
    if (hw === undefined) throw new TypeError(`hazardClass must be one of 1, 2, 3, 6, 8 — got ${hazardClass}`);

    // TRI = log10(Q × ρ / d) × peso de classe
    const raw = (quantity_kg * populationDensity_per_km2) / distance_km;
    const tri = raw > 0 ? Math.log10(raw) * hw : 0;

    let riskLevel;
    if (tri < 2) riskLevel = 'low';
    else if (tri < 5) riskLevel = 'moderate';
    else if (tri < 8) riskLevel = 'high';
    else riskLevel = 'extreme';

    return { tri, riskLevel };
}

/**
 * Computes evacuation radius based on ERG 2024 substance data.
 * Calcula o raio de evacuação baseado nos dados de substância do ERG 2024.
 *
 * @param {number} quantityKg - Spilled quantity (kg). Quantidade derramada (kg).
 * @param {{ isolationRadius_m: number, downwindDistance_m: number, smallSpill: boolean }} substance
 *   ERG 2024 substance parameters. Parâmetros da substância conforme ERG 2024.
 * @returns {{ evacuationRadius_m: number }}
 * @throws {RangeError} If quantityKg <= 0.
 * @throws {TypeError} If substance is missing required fields.
 */
export function computeEvacuationRadius(quantityKg: any, substance: any) {
    if (quantityKg <= 0) throw new RangeError('quantityKg must be > 0');
    if (!substance || typeof substance !== 'object') throw new TypeError('substance must be an object');
    const { isolationRadius_m, downwindDistance_m, smallSpill } = substance;
    if (typeof isolationRadius_m !== 'number' || isolationRadius_m <= 0)
        throw new TypeError('substance.isolationRadius_m must be a positive number');
    if (typeof downwindDistance_m !== 'number' || downwindDistance_m <= 0)
        throw new TypeError('substance.downwindDistance_m must be a positive number');

    // Derramamento pequeno → raio de isolamento; grande → distância a sotavento
    const evacuationRadius_m = smallSpill ? isolationRadius_m : downwindDistance_m;
    return { evacuationRadius_m };
}

/**
 * Classifies a hazmat incident severity using NFPA 704 criteria.
 * Classifica a gravidade de um incidente com materiais perigosos (NFPA 704).
 *
 * Severity levels:
 *   1 - minimal risk (local containment)
 *   2 - moderate risk (notify CETESB)
 *   3 - serious risk (notify IBAMA)
 *   4 - extreme risk (all agencies + emergency response)
 *
 * @param {number} spillVolume_L - Spill volume (L). Volume derramado (L).
 * @param {boolean} flammable - Material is flammable. Material é inflamável.
 * @param {boolean} toxic - Material is toxic. Material é tóxico.
 * @param {boolean} reactiveWithWater - Reacts with water. Reage com água.
 * @returns {{ severity: number, notifyAgencies: string[] }}
 * @throws {RangeError} If spillVolume_L <= 0.
 */
export function classifyHazmatIncident(spillVolume_L: any, flammable: any, toxic: any, reactiveWithWater: any) {
    if (spillVolume_L <= 0) throw new RangeError('spillVolume_L must be > 0');

    // Calcula pontuação NFPA 704: saúde + inflamabilidade + instabilidade
    let score = 0;
    if (spillVolume_L > 1000) score += 2;
    else if (spillVolume_L > 100) score += 1;
    if (flammable) score += 1;
    if (toxic) score += 1;
    if (reactiveWithWater) score += 1;

    const severity = Math.min(4, Math.max(1, score));

    // Agências notificadas conforme gravidade
    const notifyAgencies = ['Bombeiros', 'Defesa Civil'];
    if (severity >= 2) notifyAgencies.push('CETESB');
    if (severity >= 3) notifyAgencies.push('IBAMA');
    if (severity >= 3) notifyAgencies.push('ANTT'); // transporte rodoviário
    if (severity >= 4) notifyAgencies.push('IBAMA_EMERGENCIA');

    return { severity, notifyAgencies };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const hazmatTransportRiskMeta = {
    name: 'hazmatTransportRisk',
    description: 'Hazardous Materials Transport Risk',
    category: 'analytics',
    familyTags: ['risk', 'transport', 'fate_transport'],
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
