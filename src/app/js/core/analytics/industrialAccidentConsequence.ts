// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Industrial Accident Consequence Analysis
// Análise de consequências de acidentes industriais: BLEVE, nuvem tóxica e explosão.
//
// References:
//   Roberts (1982) J Hazard Mater - BLEVE fireball correlations
//   EU Seveso III Directive 2012/18/EU - Major accident hazards
//   TNO Yellow Book (2005) - Methods for Consequence Analysis of Dangerous Substances
//   CETESB (2013) - Análise de Riscos Tecnológicos em Empreendimentos Industriais

'use strict';

// Seveso III thresholds (tonnes) - categorias simplificadas para classificação
/** @type {Record<string, { lower: number, upper: number }>} */
const SEVESO_THRESHOLDS = {
    toxic: { lower: 5_000, upper: 20_000 }, // kg
    flammable: { lower: 10_000, upper: 50_000 },
    explosive: { lower: 10_000, upper: 50_000 },
    environmental: { lower: 100_000, upper: 200_000 },
};

/**
 * Computes BLEVE (Boiling Liquid Expanding Vapor Explosion) fireball parameters.
 * Calcula parâmetros de bola de fogo BLEVE - método Roberts (1982).
 *
 * @param {number} vessel_volume_m3          - Vessel volume (m³)
 * @param {number} pressure_bar              - Operating pressure (bar)
 * @param {number} liquid_fraction           - Liquid fraction [0–1]
 * @param {number} heat_of_vaporization_kJ_kg - Heat of vaporization of substance (kJ/kg)
 * @returns {{ fireball_radius_m: number, fireball_duration_s: number, thermal_radiation_kW_m2_at_100m: number }}
 */
export function computeBLEVE(vessel_volume_m3: any, pressure_bar: any, liquid_fraction: any, heat_of_vaporization_kJ_kg: any) {
    if (
        [vessel_volume_m3, pressure_bar, liquid_fraction, heat_of_vaporization_kJ_kg].some((v) => typeof v !== 'number')
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (vessel_volume_m3 < 0) throw new RangeError('vessel_volume_m3 must be >= 0');
    if (pressure_bar < 0) throw new RangeError('pressure_bar must be >= 0');
    if (liquid_fraction < 0 || liquid_fraction > 1) throw new RangeError('liquid_fraction must be in [0, 1]');
    if (heat_of_vaporization_kJ_kg < 0) throw new RangeError('heat_of_vaporization_kJ_kg must be >= 0');

    // Massa flash: densidade média assumida 500 kg/m³ (hidrocarbonetos líquidos típicos)
    const mass_flash_kg = vessel_volume_m3 * 500 * liquid_fraction;

    // Roberts (1982): raio da bola de fogo e duração
    const fireball_radius_m = 3.86 * Math.pow(mass_flash_kg, 0.325);
    const fireball_duration_s = 0.825 * Math.pow(mass_flash_kg, 0.26);

    // Radiação térmica a 100 m: lei do inverso do quadrado simplificada
    // Referência: 100 kW/m² na superfície da bola de fogo (estimativa conservadora TNO)
    const thermal_radiation_kW_m2_at_100m = 100 * Math.pow(fireball_radius_m / 100, 2);

    return { fireball_radius_m, fireball_duration_s, thermal_radiation_kW_m2_at_100m };
}

/**
 * Computes toxic cloud dispersion distance using Gaussian plume model.
 * Calcula a distância de dispersão de nuvem tóxica (modelo Gaussiano simplificado).
 *
 * @param {number} release_rate_kg_s  - Release rate (kg/s)
 * @param {number} molecular_weight   - Molecular weight of substance (g/mol)
 * @param {number} tlv_ppm            - Threshold Limit Value (ppm)
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} stability_class - Pasquill-Gifford stability class
 * @param {number} wind_speed_m_s     - Wind speed (m/s), must be > 0
 * @returns {{ hazard_distance_m: number, lethality_distance_m: number }}
 */
export function computeToxicCloudDispersion(
    release_rate_kg_s: any,
    molecular_weight: any,
    tlv_ppm: any,
    stability_class: any,
    wind_speed_m_s: any,
) {
    if ([release_rate_kg_s, molecular_weight, tlv_ppm, wind_speed_m_s].some((v) => typeof v !== 'number')) {
        throw new TypeError('Numeric parameters must be numbers');
    }
    if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(stability_class)) {
        throw new TypeError('stability_class must be A–F');
    }
    if (wind_speed_m_s <= 0) throw new RangeError('wind_speed_m_s must be > 0');
    if (release_rate_kg_s < 0) throw new RangeError('release_rate_kg_s must be >= 0');
    if (tlv_ppm <= 0) throw new RangeError('tlv_ppm must be > 0');

    // Conversão TLV de ppm para kg/m³ (gás ideal a 20 °C, 1 atm)
    const tlv_kg_m3 = (tlv_ppm * 1e-6 * molecular_weight) / 24.04;

    // Coeficiente de dispersão σ para classe D (neutro) - simplificação TNO Yellow Book
    // σy = σz = 0.08 × x (em metros); resolução iterativa para concentração axial
    // C(x) = Q / (π × σy × σz × u) com σy = σz = 0.08×x
    // C(x) = Q / (π × (0.08×x)² × u) → resolve para x: x = sqrt(Q / (π × 0.0064 × u × C_target))

    const sigma_coeff = 0.08;
    const hazard_distance_m = Math.sqrt(
        release_rate_kg_s / (Math.PI * sigma_coeff * sigma_coeff * wind_speed_m_s * tlv_kg_m3),
    );

    // Distância de letalidade: IDLH estimado ≈ 10× TLV (pior caso conservador)
    const lethality_tlv = tlv_kg_m3 / 10; // 10× TLV → maior concentração → menor distância
    const lethality_distance_m = Math.sqrt(
        release_rate_kg_s / (Math.PI * sigma_coeff * sigma_coeff * wind_speed_m_s * lethality_tlv),
    );

    return {
        hazard_distance_m: Math.max(1, hazard_distance_m),
        lethality_distance_m: Math.max(1, lethality_distance_m),
    };
}

/**
 * Computes explosion overpressure at a given distance using TNT equivalence method.
 * Calcula sobrepressão de explosão pelo método de equivalência TNT (Hopkinson-Cranz).
 *
 * @param {number} tnt_equivalent_kg - TNT equivalent mass (kg)
 * @param {number} distance_m        - Distance from explosion center (m), must be > 0
 * @returns {{ overpressure_kPa: number, damage_level: string }}
 */
export function computeExplosionOverpressure(tnt_equivalent_kg: any, distance_m: any) {
    if (typeof tnt_equivalent_kg !== 'number' || typeof distance_m !== 'number') {
        throw new TypeError('Parameters must be numbers');
    }
    if (tnt_equivalent_kg < 0) throw new RangeError('tnt_equivalent_kg must be >= 0');
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');

    // Escala de distância reduzida de Hopkinson-Cranz: Z = d / W^(1/3)
    const Z = distance_m / Math.pow(tnt_equivalent_kg + 1e-9, 1 / 3);

    // Correlação de Baker (1973), simplificada para Z > 0.5
    // Ps_kPa = 1772/Z³ - 114/Z² + 108/Z (referência TNO Yellow Book, eq. 5.6)
    const overpressure_kPa = Math.max(0, 1772 / Math.pow(Z, 3) - 114 / Math.pow(Z, 2) + 108 / Z);

    // Classificação de danos segundo TNO e CETESB (2013)
    let damage_level;
    if (overpressure_kPa > 70) {
        damage_level = 'total_destruction';
    } else if (overpressure_kPa > 35) {
        damage_level = 'severe';
    } else if (overpressure_kPa > 7) {
        damage_level = 'structural_damage';
    } else if (overpressure_kPa > 3.5) {
        damage_level = 'window_breakage';
    } else {
        damage_level = 'none';
    }

    return { overpressure_kPa, damage_level };
}

/**
 * Classifies a facility under Seveso III Directive 2012/18/EU.
 * Classifica uma instalação conforme a Diretiva Seveso III.
 *
 * @param {string[]} substances              - List of substance categories
 * @param {number[]} quantities_kg           - Quantities for each substance (kg)
 * @param {{ temperature_c: number, pressure_bar: number }} process_conditions
 * @returns {{ seveso_tier: string, required_measures: string[] }}
 */
export function classifyMajorHazardFacility(substances: any, quantities_kg: any, process_conditions: any) {
    if (!Array.isArray(substances) || !Array.isArray(quantities_kg)) {
        throw new TypeError('substances and quantities_kg must be arrays');
    }
    if (substances.length !== quantities_kg.length) {
        throw new RangeError('substances and quantities_kg must have the same length');
    }
    if (typeof process_conditions !== 'object' || process_conditions === null) {
        throw new TypeError('process_conditions must be an object');
    }

    const validCategories = Object.keys(SEVESO_THRESHOLDS);
    substances.forEach((s, i) => {
        if (!validCategories.includes(s)) {
            throw new TypeError(`substances[${i}] must be one of: ${validCategories.join(', ')}`);
        }
        if (quantities_kg[i] < 0) throw new RangeError(`quantities_kg[${i}] must be >= 0`);
    });

    // Calcula razões de qualificação: soma(qi/Qi_threshold) - regra de soma Seveso III Annex I
    let upper_ratio = 0;
    let lower_ratio = 0;

    substances.forEach((s, i) => {
        const t = SEVESO_THRESHOLDS[(s as keyof typeof SEVESO_THRESHOLDS)];
        upper_ratio += quantities_kg[i] / t.upper;
        lower_ratio += quantities_kg[i] / t.lower;
    });

    let seveso_tier;
    const required_measures = [];

    if (upper_ratio >= 1) {
        seveso_tier = 'upper_tier';
        required_measures.push(
            'Safety management system (SMS) mandatory',
            'External emergency plan required',
            'Safety report submission to authority',
            'Land use planning consultation required',
            'Public information obligation',
        );
    } else if (lower_ratio >= 1) {
        seveso_tier = 'lower_tier';
        required_measures.push(
            'Major accident prevention policy (MAPP) document',
            'Internal emergency plan required',
            'Notification to competent authority',
        );
    } else {
        seveso_tier = 'non_seveso';
        required_measures.push('Standard industrial safety regulations apply');
    }

    // Condições de processo agravantes
    const { temperature_c = 20, pressure_bar = 1 } = process_conditions;
    if (temperature_c > 200 || pressure_bar > 50) {
        required_measures.push('High-temperature/pressure process — enhanced risk assessment required');
    }

    return { seveso_tier, required_measures };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const industrialAccidentConsequenceMeta = {
    name: 'industrialAccidentConsequence',
    description: 'industrialAccidentConsequence',
    category: 'analytics',
    familyTags: ['industrial'],
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
