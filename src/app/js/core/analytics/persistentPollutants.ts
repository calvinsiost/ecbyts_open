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
// Application: EHS & Mining - Persistent Organic Pollutants
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Persistent Organic Pollutants (POPs) - Stockholm Convention Screening
 *
 * Módulo puro implementando critérios da Convenção de Estocolmo (2001) para
 * triagem de poluentes orgânicos persistentes: persistência global ponderada
 * por compartimento, potencial de transporte a longa distância (LRTP),
 * magnificação trófica e classificação de risco.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module persistentPollutants
 * @references
 *   Stockholm Convention (2001) - UNEP/POPS/CONF/4
 *   Beyer et al. (2000) Environ. Sci. Technol. 34:699-703 - LRTP via CTD
 *   UNEP (2019) Global Monitoring Plan for POPs (GMP-4)
 */

'use strict';

// Air velocity used in LRTP calculation (Beyer et al. 2000)
// Velocidade do ar para cálculo de LRTP - 40 km/day (valor de referência global)
const V_AIR_KM_PER_DAY = 40;

// Stockholm Convention persistence threshold (days)
// Limiar de persistência da Convenção de Estocolmo
const PERSISTENCE_THRESHOLD_DAYS = 60;

// LRTP characteristic travel distance threshold (km)
// Limiar de distância de viagem característica para LRTP
const LRTP_THRESHOLD_KM = 2000;

// Bioaccumulation threshold (BAF) - Stockholm Annex D
// Limiar de bioacumulação pelo Anexo D da Convenção de Estocolmo
const BAF_THRESHOLD = 5000;

/**
 * Compute overall environmental persistence weighted by compartment fractions.
 * Calcula persistência global ponderada pelos compartimentos ambientais.
 *
 * P_ov = Σ(f_i × t½_i) onde f_i = fração de cada compartimento (ar, água, solo)
 * Critério Stockholm Convention Annex D: P_ov > 60 dias indica substância persistente.
 *
 * @param {number} halfLifeAir_days   - Half-life in air (days) / Meia-vida no ar (dias)
 * @param {number} halfLifeWater_days - Half-life in water (days) / Meia-vida na água (dias)
 * @param {number} halfLifeSoil_days  - Half-life in soil (days) / Meia-vida no solo (dias)
 * @param {{ air: number, water: number, soil: number }} fractions
 *   Compartment fractions (must sum to 1) / Frações de compartimento (soma = 1)
 * @returns {{ overallPersistence_days: number, persistent: boolean }}
 * @throws {RangeError} If any half-life is negative or fractions don't sum to 1 (±0.01)
 */
export function computePOPPersistence(halfLifeAir_days: any, halfLifeWater_days: any, halfLifeSoil_days: any, fractions: any) {
    if (halfLifeAir_days < 0 || halfLifeWater_days < 0 || halfLifeSoil_days < 0) {
        throw new RangeError('Half-life values must be non-negative');
    }
    const { air = 0, water = 0, soil = 0 } = fractions || {};
    const sum = air + water + soil;
    if (Math.abs(sum - 1.0) > 0.01) {
        throw new RangeError(`Compartment fractions must sum to 1.0, got ${sum.toFixed(4)}`);
    }
    // Persistência global ponderada pelos compartimentos
    const overallPersistence_days = air * halfLifeAir_days + water * halfLifeWater_days + soil * halfLifeSoil_days;
    return {
        overallPersistence_days,
        persistent: overallPersistence_days > PERSISTENCE_THRESHOLD_DAYS,
    };
}

/**
 * Compute Long-Range Transport Potential (LRTP) via Characteristic Travel Distance (CTD).
 * Calcula o potencial de transporte a longa distância pelo modelo de Beyer et al. (2000).
 *
 * CTD = v_air × t½_air / ln(2)  (simplificado para fase gasosa dominante)
 * Substâncias com CTD > 2000 km satisfazem critério de LRTP da Convenção de Estocolmo.
 *
 * @param {number} halfLifeAir_days  - Half-life in air (days) / Meia-vida no ar (dias)
 * @param {number} vaporPressure_Pa  - Vapor pressure (Pa) at 25°C / Pressão de vapor (Pa)
 * @param {number} henry_const       - Henry's law constant (Pa·m³/mol) / Constante de Henry
 * @returns {{ ctd_km: number, longRange: boolean }}
 * @throws {RangeError} If any parameter is negative
 */
export function computeLongRangeTransportPotential(halfLifeAir_days: any, vaporPressure_Pa: any, henry_const: any) {
    if (halfLifeAir_days < 0) throw new RangeError('halfLifeAir_days must be non-negative');
    if (vaporPressure_Pa < 0) throw new RangeError('vaporPressure_Pa must be non-negative');
    if (henry_const < 0) throw new RangeError('henry_const must be non-negative');

    // CTD = v_air × (t½ / ln(2))  - Beyer et al. (2000) Eq. 1 simplificada para ar
    // Fator de volatilidade: vapor pressure e Henry modificam a partição entre fases
    // (neste modelo simplificado, CTD é calculado diretamente da meia-vida no ar)
    const ctd_km = V_AIR_KM_PER_DAY * (halfLifeAir_days / Math.LN2);

    return {
        ctd_km,
        longRange: ctd_km > LRTP_THRESHOLD_KM,
    };
}

/**
 * Compute food web magnification through trophic levels.
 * Calcula a magnificação de poluentes ao longo da cadeia alimentar aquática.
 *
 * C_fish = waterConc × BAF_fish
 * C_predator = C_fish × BAF_pred
 * TMF (Trophic Magnification Factor) = C_predator / C_fish
 *
 * @param {number} waterConc_ug_L        - Concentration in water (µg/L) / Concentração na água
 * @param {number} baf_water_fish        - BAF water→fish (L/kg) / Fator de bioacumulação água→peixe
 * @param {number} baf_fish_predator     - BAF fish→predator (dimensionless) / FAB peixe→predador
 * @returns {{ fishConc_ug_kg: number, predatorConc_ug_kg: number, tmf: number }}
 * @throws {RangeError} If any concentration or BAF is negative
 */
export function computeFoodWebMagnification(waterConc_ug_L: any, baf_water_fish: any, baf_fish_predator: any) {
    if (waterConc_ug_L < 0) throw new RangeError('waterConc_ug_L must be non-negative');
    if (baf_water_fish < 0) throw new RangeError('baf_water_fish must be non-negative');
    if (baf_fish_predator < 0) throw new RangeError('baf_fish_predator must be non-negative');

    // Concentração no peixe a partir do BAF água→peixe
    const fishConc_ug_kg = waterConc_ug_L * baf_water_fish;
    // Concentração no predador a partir do BAF peixe→predador
    const predatorConc_ug_kg = fishConc_ug_kg * baf_fish_predator;
    // TMF: fator de magnificação trófica (> 1 indica biomagnificação)
    const tmf = baf_fish_predator;

    return { fishConc_ug_kg, predatorConc_ug_kg, tmf };
}

/**
 * Classify a substance against Stockholm Convention Annex D screening criteria.
 * Classifica uma substância pelos critérios de triagem do Anexo D da Convenção de Estocolmo.
 *
 * Critérios:
 *   - Persistência: P_ov > 60 dias (Annex D §1.b)
 *   - LRTP: CTD > 2000 km (Annex D §1.c)
 *   - Bioacumulação: BAF > 5000 (Annex D §1.d)
 *   - Toxicidade: confirmada por evidências (Annex D §1.a)
 *
 * @param {{ overallPersistence_days: number, persistent: boolean }} persistence
 * @param {{ ctd_km: number, longRange: boolean }} lrtp
 * @param {number} persistence - BAF value (L/kg) / Valor de BAF
 * @param {boolean} lrtp       - Confirmed toxicity / Toxicidade confirmada
 * @returns {{ meetsScreeningCriteria: boolean, criteria: string[] }}
 */
export function classifyPOPUnderStockholm(persistence: any, lrtp: any, bioaccumulation: any, toxicity: any) {
    if (typeof bioaccumulation !== 'number' || bioaccumulation < 0) {
        throw new TypeError('bioaccumulation must be a non-negative number');
    }
    if (typeof toxicity !== 'boolean') {
        throw new TypeError('toxicity must be a boolean');
    }

    const criteria = [];
    // Avaliação de cada critério do Anexo D
    if (persistence.persistent) criteria.push('persistence');
    if (lrtp.longRange) criteria.push('long_range_transport');
    if (bioaccumulation > BAF_THRESHOLD) criteria.push('bioaccumulation');
    if (toxicity) criteria.push('toxicity');

    // Substância satisfaz triagem se atender ao menos 3 dos 4 critérios do Anexo D
    const meetsScreeningCriteria = criteria.length >= 3;

    return { meetsScreeningCriteria, criteria };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const persistentPollutantsMeta = {
    name: 'persistentPollutants',
    description: 'Persistent Organic Pollutants',
    category: 'analytics',
    familyTags: ['contamination'],
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
