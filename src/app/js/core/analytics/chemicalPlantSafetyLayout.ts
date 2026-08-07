// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Chemical Plant Safety Layout - Separation distances, exclusion zones and consequence modeling
// Layout de segurança de instalações químicas - distâncias de separação, zonas de exclusão e conseqüências
// Refs: NFPA 400 (2022); API RP 752 (2009); TNO Yellow Book (2005); UK HSE (2011); ABNT NBR 14063:2012

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

// Fatores de distância mínima por classe de substância (metros por tonelada^0.333)
// Baseado em NFPA 400 Tabela 10.1 e API RP 752 Seção 3
const HAZARD_DISTANCE_FACTORS = {
    flammable_gas: { min: 15, scale: 8.5 },
    flammable_liquid: { min: 7.5, scale: 5.0 },
    toxic_gas: { min: 30, scale: 14.0 },
    oxidizer: { min: 10, scale: 6.0 },
    explosive: { min: 50, scale: 20.0 },
};

// Multiplicadores de distância recomendada por tipo de instalação (API RP 752)
const FACILITY_MULTIPLIERS = {
    process: 1.5,
    storage: 1.2,
    office: 2.0,
    control_room: 2.5,
};

const VALID_HAZARD_CLASSES = new Set(Object.keys(HAZARD_DISTANCE_FACTORS));
const VALID_FACILITY_TYPES = new Set(Object.keys(FACILITY_MULTIPLIERS));

/**
 * Compute minimum and recommended separation distances per NFPA 400 and API RP 752.
 * Calcula distâncias de separação mínimas e recomendadas para instalações químicas.
 * Ref: NFPA 400 (2022) Hazardous Materials Code; API RP 752 (2009) Management of Hazards.
 *
 * @param {number} quantity_kg - Quantity of hazardous substance [kg]
 * @param {string} substance_hazard_class - Hazard class: 'flammable_gas'|'flammable_liquid'|'toxic_gas'|'oxidizer'|'explosive'
 * @param {string} facility_type - Facility type: 'process'|'storage'|'office'|'control_room'
 * @returns {{ min_distance_m: number, recommended_distance_m: number }}
 */
export function computeSeparationDistance(
    quantity_kg: number,
    substance_hazard_class: string,
    facility_type: string,
): { min_distance_m: number; recommended_distance_m: number } {
    if (typeof quantity_kg !== 'number') throw new TypeError('quantity_kg must be a number');
    if (quantity_kg <= 0) throw new RangeError('quantity_kg must be > 0');
    if (!VALID_HAZARD_CLASSES.has(substance_hazard_class)) {
        throw new RangeError(`substance_hazard_class must be one of: ${[...VALID_HAZARD_CLASSES].join(', ')}`);
    }
    if (!VALID_FACILITY_TYPES.has(facility_type)) {
        throw new RangeError(`facility_type must be one of: ${[...VALID_FACILITY_TYPES].join(', ')}`);
    }

    const factor = HAZARD_DISTANCE_FACTORS[substance_hazard_class as keyof typeof HAZARD_DISTANCE_FACTORS];
    // Distância escala com cubo da raiz da quantidade (baseado em modelos de onda de pressão/dispersão)
    const scale_distance = factor.scale * Math.pow(quantity_kg / 1000, 1 / 3);
    const min_distance_m = Math.max(factor.min, scale_distance);
    const recommended_distance_m =
        min_distance_m * FACILITY_MULTIPLIERS[facility_type as keyof typeof FACILITY_MULTIPLIERS];

    return { min_distance_m, recommended_distance_m };
}

/**
 * Compute toxic gas exclusion zone radius using simplified Gaussian dispersion model.
 * Calcula o raio da zona de exclusão para gás tóxico com modelo gaussiano simplificado.
 * r = sqrt(Q / (π × σ × u × C)) com σ iterativo proporcional ao raio.
 * Ref: TNO (2005) Methods for the Calculation of Physical Effects (Yellow Book), 3rd ed.
 *
 * @param {number} release_rate_kg_s - Release rate [kg/s]
 * @param {number} molecular_weight - Molecular weight of substance [g/mol]
 * @param {number} toxic_concentration_ppm - Toxic threshold concentration [ppm]
 * @param {number} wind_speed_m_s - Wind speed at 10 m height [m/s]
 * @returns {{ radius_m: number, area_m2: number }}
 */
export function computeExclusionZoneRadius(
    release_rate_kg_s: number,
    molecular_weight: number,
    toxic_concentration_ppm: number,
    wind_speed_m_s: number,
): { radius_m: number; area_m2: number } {
    if (
        typeof release_rate_kg_s !== 'number' ||
        typeof molecular_weight !== 'number' ||
        typeof toxic_concentration_ppm !== 'number' ||
        typeof wind_speed_m_s !== 'number'
    ) {
        throw new TypeError('All inputs must be numbers');
    }
    if (release_rate_kg_s <= 0) throw new RangeError('release_rate_kg_s must be > 0');
    if (molecular_weight <= 0) throw new RangeError('molecular_weight must be > 0');
    if (toxic_concentration_ppm <= 0) throw new RangeError('toxic_concentration_ppm must be > 0');
    if (wind_speed_m_s <= 0) throw new RangeError('wind_speed_m_s must be > 0');

    // Converter ppm para kg/m³: C_mass = C_ppm × M / (22.4 × 1e6) em condições normais
    const conc_kg_m3 = (toxic_concentration_ppm * molecular_weight) / (22400 * 1000);

    // Modelo gaussiano: Q = C × u × π × σ² (integração lateral + vertical simplificada)
    // Iteração com σ = 0.1 × r (estabilidade Pasquill D, terreno aberto)
    let radius_m = 1;
    for (let i = 0; i < 50; i++) {
        const sigma = 0.1 * radius_m;
        const r_new = Math.sqrt(release_rate_kg_s / (Math.PI * sigma * wind_speed_m_s * conc_kg_m3));
        if (Math.abs(r_new - radius_m) < 0.01) {
            radius_m = r_new;
            break;
        }
        radius_m = r_new;
    }

    const area_m2 = Math.PI * radius_m * radius_m;
    return { radius_m, area_m2 };
}

/**
 * Compute explosion hazard zones including fireball radius, overpressure zone, and thermal flux.
 * Calcula zonas de perigo de explosão: raio da bola de fogo, zona de sobrepressão e fluxo térmico.
 * Ref: TNO (2005) Yellow Book Chap. 6; Baker et al. (1983) Explosion Hazards.
 *
 * @param {number} fuel_mass_kg - Mass of fuel involved [kg]
 * @param {number} heat_of_combustion_MJ_kg - Net heat of combustion [MJ/kg]
 * @param {number} confinement - Confinement factor [0=open, 1=fully confined]
 * @returns {{ fireball_radius_m: number, overpressure_zone_m: number, thermal_flux_kW_m2_at_50m: number }}
 */
export function computeExplosionHazardZone(
    fuel_mass_kg: number,
    heat_of_combustion_MJ_kg: number,
    confinement: number,
): { fireball_radius_m: number; overpressure_zone_m: number; thermal_flux_kW_m2_at_50m: number } {
    if (
        typeof fuel_mass_kg !== 'number' ||
        typeof heat_of_combustion_MJ_kg !== 'number' ||
        typeof confinement !== 'number'
    ) {
        throw new TypeError('All inputs must be numbers');
    }
    if (fuel_mass_kg <= 0) throw new RangeError('fuel_mass_kg must be > 0');
    if (heat_of_combustion_MJ_kg <= 0) throw new RangeError('heat_of_combustion_MJ_kg must be > 0');
    if (confinement < 0 || confinement > 1) throw new RangeError('confinement must be in [0, 1]');

    // Raio da bola de fogo (fireball): Roberts (1982) correlação empírica
    const fireball_radius_m = 3.86 * Math.pow(fuel_mass_kg, 0.325);

    // Zona de 1 psi de sobrepressão (TNO multi-energy method simplificado)
    const energy_MJ = fuel_mass_kg * heat_of_combustion_MJ_kg * (0.03 + 0.07 * confinement);
    const overpressure_zone_m = 0.84 * Math.pow(energy_MJ, 1 / 3) * 10; // ×10 para MJ→kJ escala

    // Fluxo térmico a 50 m: modelo de ponto fonte, irradiação proporcional a E e à distância^-2
    const radiated_fraction = 0.2; // fração da energia total irradiada
    const energy_kJ = energy_MJ * 1000;
    const thermal_flux_kW_m2_at_50m = (radiated_fraction * energy_kJ) / (4 * Math.PI * 50 * 50);

    return { fireball_radius_m, overpressure_zone_m, thermal_flux_kW_m2_at_50m };
}

/**
 * Classify overall facility risk level based on distance criteria and occupancy.
 * Classifica o nível de risco global da instalação com base em distâncias e ocupação.
 * Ref: UK HSE (2011) Land Use Planning Methodology; Vrijling et al. (1995) F-N criterion.
 *
 * @param {number} separation_distance_m - Actual separation distance [m]
 * @param {number} exclusion_zone_m - Computed exclusion zone radius [m]
 * @param {number} explosion_zone_m - Computed overpressure zone [m]
 * @param {string} occupancy - Occupancy level: 'low'|'medium'|'high'
 * @returns {{ risk_level: string, f_n_criterion: boolean }}
 */
export function classifyFacilityRiskLevel(
    separation_distance_m: number,
    exclusion_zone_m: number,
    explosion_zone_m: number,
    occupancy: string,
): { risk_level: string; f_n_criterion: boolean } {
    if (
        typeof separation_distance_m !== 'number' ||
        typeof exclusion_zone_m !== 'number' ||
        typeof explosion_zone_m !== 'number'
    ) {
        throw new TypeError('Distance inputs must be numbers');
    }
    if (!['low', 'medium', 'high'].includes(occupancy)) {
        throw new RangeError("occupancy must be 'low', 'medium', or 'high'");
    }
    if (separation_distance_m < 0) throw new RangeError('separation_distance_m must be >= 0');

    // Dentro da zona de exclusão = inaceitável
    if (separation_distance_m < exclusion_zone_m) {
        return { risk_level: 'unacceptable', f_n_criterion: false };
    }

    // Dentro da zona de sobrepressão = amplo - tolerable dependendo de ocupação
    if (separation_distance_m < explosion_zone_m) {
        const risk_level = occupancy === 'high' ? 'unacceptable' : 'tolerable';
        return { risk_level, f_n_criterion: occupancy !== 'high' };
    }

    // Fora de zonas ativas - avalia pela ocupação
    if (occupancy === 'low') {
        return { risk_level: 'broadly_acceptable', f_n_criterion: true };
    }
    if (occupancy === 'medium') {
        return { risk_level: 'acceptable', f_n_criterion: true };
    }
    // Alta ocupação fora das zonas ativas: aceitável mas monitorar
    return { risk_level: 'acceptable', f_n_criterion: true };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const chemicalPlantSafetyLayoutMeta: AnalyticsModuleMeta = {
    name: 'chemicalPlantSafetyLayout',
    description: 'chemicalPlantSafetyLayout',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
