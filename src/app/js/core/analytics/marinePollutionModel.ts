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
// Application: EHS & Mining - Marine Pollution Modeling
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Marine Pollution Model - Dilution, Assimilative Capacity & MARPOL Zones
 *
 * Módulo puro para modelagem de poluição marinha: fator de diluição,
 * diluição inicial em campo próximo (Jirka & Lee 1994), capacidade
 * assimilativa e classificação de zonas MARPOL/CONAMA 357.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - Jirka, G.H. & Lee, J.H.W. (1994). Waste disposal in the ocean.
 *     J. Hydraul. Eng., 120(6), 683–718.
 *   - CONAMA 357/2005. Classificação e diretrizes ambientais para água salgada.
 *   - MARPOL 73/78. International Convention for the Prevention of Pollution
 *     from Ships.
 *
 * @module marinePollutionModel
 */

'use strict';

/** Gravitational acceleration (m/s²) */
const G = 9.81;

/** Nautical miles to km conversion factor */
const NM_TO_KM = 1.852;

/** MARPOL offshore distance threshold (12 nautical miles in km) */
const MARPOL_OFFSHORE_KM = 12 * NM_TO_KM; // ~22.224 km

/** MARPOL offshore depth threshold (m) */
const MARPOL_OFFSHORE_DEPTH_M = 200;

/**
 * Computes the dilution factor for a effluent discharge into a receiving water body.
 * DF = (Q_effluent + Q_receiving) / Q_effluent
 *
 * Calcula o fator de diluição de um efluente em corpo receptor.
 *
 * @param {number} effluentFlow_m3_s - Effluent flow rate (m³/s); must be > 0
 * @param {number} receivingFlow_m3_s - Receiving water flow rate (m³/s); must be >= 0
 * @returns {{ dilutionFactor: number, dilutionRatio: number }}
 * @throws {RangeError} if effluentFlow_m3_s <= 0 or receivingFlow_m3_s < 0
 */
export function computeDilutionFactor(effluentFlow_m3_s: number, receivingFlow_m3_s: number): { dilutionFactor: number, dilutionRatio: number } {
    if (typeof effluentFlow_m3_s !== 'number' || effluentFlow_m3_s <= 0) {
        throw new RangeError('effluentFlow_m3_s must be a positive number');
    }
    if (typeof receivingFlow_m3_s !== 'number' || receivingFlow_m3_s < 0) {
        throw new RangeError('receivingFlow_m3_s must be a non-negative number');
    }

    // DF = (Q_e + Q_r) / Q_e - razão de diluição total pelo caudal do efluente
    const dilutionFactor = (effluentFlow_m3_s + receivingFlow_m3_s) / effluentFlow_m3_s;
    return {
        dilutionFactor,
        dilutionRatio: 1 / dilutionFactor,
    };
}

/**
 * Computes the initial (near-field) dilution using the Jirka & Lee (1994)
 * simplified buoyant jet formula for submerged ocean outfalls.
 *
 * S = 0.31 × (g′ × d³ / Q²)^(1/3) × depth
 * where g′ = g × (ρ_sw − ρ_e) / ρ_sw (reduced gravity)
 *
 * Calcula diluição inicial em campo próximo por jato flutuante (Jirka 1994).
 *
 * @param {number} density_effluent   - Effluent density (kg/m³)
 * @param {number} density_seawater   - Seawater density (kg/m³)
 * @param {number} depth_m            - Water depth at discharge point (m); > 0
 * @param {number} discharge_velocity_m_s - Discharge velocity (m/s); > 0
 * @returns {{ initialDilution: number, reducedGravity_m_s2: number }}
 * @throws {RangeError} on invalid inputs
 */
export function computeInitialDilution(density_effluent: number, density_seawater: number, depth_m: number, discharge_velocity_m_s: number): { initialDilution: number, reducedGravity_m_s2: number } {
    if (typeof density_effluent !== 'number' || density_effluent <= 0) {
        throw new RangeError('density_effluent must be a positive number');
    }
    if (typeof density_seawater !== 'number' || density_seawater <= 0) {
        throw new RangeError('density_seawater must be a positive number');
    }
    if (typeof depth_m !== 'number' || depth_m <= 0) {
        throw new RangeError('depth_m must be a positive number');
    }
    if (typeof discharge_velocity_m_s !== 'number' || discharge_velocity_m_s <= 0) {
        throw new RangeError('discharge_velocity_m_s must be a positive number');
    }

    // Gravidade reduzida g′ - diferença de empuxo normalizada pela densidade da água do mar
    const gPrime = (G * (density_seawater - density_effluent)) / density_seawater;

    // Volume flux Q ≈ velocity × unit area (usamos d como escala de comprimento do bocal)
    // Aproximação simplificada: Q ~ U × d² (diâmetro do bocal = d)
    const Q = discharge_velocity_m_s * depth_m * depth_m; // proxy simplificado

    // S = 0.31 × (g′ × d³ / Q²)^(1/3) × depth (Jirka & Lee 1994 Eq. 3.2)
    const term = (Math.abs(gPrime) * Math.pow(depth_m, 3)) / (Q * Q);
    const initialDilution = 0.31 * Math.pow(term, 1 / 3) * depth_m;

    return {
        initialDilution: Math.max(1, initialDilution), // diluição nunca < 1
        reducedGravity_m_s2: gPrime,
    };
}

/**
 * Computes the marine assimilative capacity (CAC) for a given effluent discharge.
 * CAC = (standardConc − backgroundConc) × dilutionFactor
 *
 * Calcula a capacidade assimilativa do corpo receptor marinho (CONAMA 357).
 *
 * @param {number} standardConc_mg_L   - Water quality standard concentration (mg/L)
 * @param {number} backgroundConc_mg_L - Background/ambient concentration (mg/L)
 * @param {number} dilutionFactor      - Dilution factor (dimensionless); >= 1
 * @returns {{ capacity_mg_L_equivalent: number, compliant: boolean }}
 * @throws {RangeError} on invalid inputs
 */
export function computeMarineAssimilativeCapacity(standardConc_mg_L: number, backgroundConc_mg_L: number, dilutionFactor: number): { capacity_mg_L_equivalent: number, compliant: boolean } {
    if (typeof standardConc_mg_L !== 'number' || standardConc_mg_L < 0) {
        throw new RangeError('standardConc_mg_L must be a non-negative number');
    }
    if (typeof backgroundConc_mg_L !== 'number' || backgroundConc_mg_L < 0) {
        throw new RangeError('backgroundConc_mg_L must be a non-negative number');
    }
    if (typeof dilutionFactor !== 'number' || dilutionFactor < 1) {
        throw new RangeError('dilutionFactor must be >= 1');
    }
    if (backgroundConc_mg_L >= standardConc_mg_L) {
        return { capacity_mg_L_equivalent: 0, compliant: false };
    }

    // Capacidade assimilativa: concentração máxima no efluente que, após diluição,
    // atinge o padrão de qualidade no corpo receptor
    const capacity_mg_L_equivalent = (standardConc_mg_L - backgroundConc_mg_L) * dilutionFactor;

    return {
        capacity_mg_L_equivalent,
        compliant: capacity_mg_L_equivalent > 0,
    };
}

/**
 * Classifies the marine impact zone based on MARPOL 73/78 and CONAMA 357/2005.
 * Offshore criteria: depth > 200 m OR distance > 12 nautical miles (~22.2 km).
 *
 * Classifica zona de impacto marinho conforme MARPOL e CONAMA 357.
 *
 * @param {number} distanceFromShore_km - Distance from shoreline (km); >= 0
 * @param {number} depth_m              - Water depth (m); >= 0
 * @param {number} tidalRange_m         - Tidal range (m); >= 0
 * @returns {{ zone: string, sensitiveLandmark: boolean, marpol_applicable: boolean }}
 * @throws {RangeError} on negative inputs
 */
export function classifyMarineImpact(distanceFromShore_km: number, depth_m: number, tidalRange_m: number): { zone: string, sensitiveLandmark: boolean, marpol_applicable: boolean } {
    if (typeof distanceFromShore_km !== 'number' || distanceFromShore_km < 0) {
        throw new RangeError('distanceFromShore_km must be a non-negative number');
    }
    if (typeof depth_m !== 'number' || depth_m < 0) {
        throw new RangeError('depth_m must be a non-negative number');
    }
    if (typeof tidalRange_m !== 'number' || tidalRange_m < 0) {
        throw new RangeError('tidalRange_m must be a non-negative number');
    }

    // Zona nerítica: < 5 km da costa ou profundidade < 20 m
    // Zona costeira: 5–22.2 km ou profundidade 20–200 m
    // Zona oceânica (MARPOL aplicável): > 12 NM ou profundidade > 200 m
    let zone;
    if (depth_m > MARPOL_OFFSHORE_DEPTH_M || distanceFromShore_km > MARPOL_OFFSHORE_KM) {
        zone = 'offshore';
    } else if (distanceFromShore_km <= 5 || depth_m <= 20) {
        zone = 'nearshore';
    } else {
        zone = 'coastal';
    }

    // Marco sensível: praias, estuários, corais - critério CONAMA 357 Classe Especial
    // considerado quando maré > 4 m ou zona nearshore
    const sensitiveLandmark = zone === 'nearshore' || tidalRange_m > 4;

    // MARPOL aplica-se a descargas oceânicas (zona offshore)
    const marpol_applicable = zone === 'offshore';

    return { zone, sensitiveLandmark, marpol_applicable };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const marinePollutionModelMeta: AnalyticsModuleMeta = {
    name: 'marinePollutionModel',
    description: 'Marine Pollution Modeling',
    category: 'analytics',
    familyTags: ['coastal'],
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
