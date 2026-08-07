// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// River Sediment Transport Model - Fluvial sediment load and transport capacity
// Modelo de transporte de sedimentos fluviais - carga de fundo, carga total e capacidade
// Refs: Shields (1936); Meyer-Peter & Müller (1948); Rouse (1937); van Rijn (1984)

'use strict';

const GRAVITY = 9.81; // m/s² — aceleração gravitacional padrão
const SHIELDS_CRITICAL = 0.047; // critério de início de transporte (Shields 1936)
const VON_KARMAN = 0.41; // constante de von Kármán — coeficiente de mistura turbulenta

interface ShieldsResult { shields: number; transport_initiated: boolean; }
interface BedloadResult { qb_kg_m_s: number; }
interface SuspendedLoadResult { depth_averaged_conc_kg_m3: number; }
interface RegimeResult { regime: string; erosion_risk: string; }

/**
 * Compute dimensionless Shields parameter for sediment transport initiation.
 * Calcula o parâmetro de Shields adimensional para início do transporte de sedimentos.
 * θ = τ / ((ρs - ρf) × g × d)
 * Ref: Shields (1936) Mitt. d. Preuss. Versuchsanst. für Wasserbau und Schiffbau, Heft 26.
 *
 * @param {number} shear_stress_Pa - Bed shear stress [Pa = N/m²]
 * @param {number} sediment_density_kg_m3 - Sediment density [kg/m³], typically 2650 for quartz
 * @param {number} fluid_density_kg_m3 - Fluid density [kg/m³], typically 1000 for water
 * @param {number} grain_diameter_m - Representative grain diameter D50 [m]
 * @returns {{ shields: number, transport_initiated: boolean }}
 */
export function computeShieldsParameter(
    shear_stress_Pa: number,
    sediment_density_kg_m3: number,
    fluid_density_kg_m3: number,
    grain_diameter_m: number,
): ShieldsResult {
    if (
        typeof shear_stress_Pa !== 'number' ||
        typeof sediment_density_kg_m3 !== 'number' ||
        typeof fluid_density_kg_m3 !== 'number' ||
        typeof grain_diameter_m !== 'number'
    ) {
        throw new TypeError('All inputs must be numbers');
    }
    if (shear_stress_Pa < 0) throw new RangeError('shear_stress_Pa must be >= 0');
    if (sediment_density_kg_m3 <= 0) throw new RangeError('sediment_density_kg_m3 must be > 0');
    if (fluid_density_kg_m3 <= 0) throw new RangeError('fluid_density_kg_m3 must be > 0');
    if (grain_diameter_m <= 0) throw new RangeError('grain_diameter_m must be > 0');
    if (sediment_density_kg_m3 <= fluid_density_kg_m3) {
        throw new RangeError('sediment_density_kg_m3 must be > fluid_density_kg_m3');
    }

    // Denominador: peso submerso por unidade de área do grão
    const submerged_weight_density = (sediment_density_kg_m3 - fluid_density_kg_m3) * GRAVITY * grain_diameter_m;
    const shields = shear_stress_Pa / submerged_weight_density;
    const transport_initiated = shields > SHIELDS_CRITICAL;

    return { shields, transport_initiated };
}

/**
 * Compute bed-load sediment transport rate per unit width (Meyer-Peter & Müller 1948).
 * Calcula a taxa de transporte de carga de fundo por unidade de largura.
 * qb = 8 × (ρs - ρf)^0.5 × g^0.5 × d^1.5 × (θ - 0.047)^1.5
 * Ref: Meyer-Peter, E. & Müller, R. (1948) Formulas for Bed-Load Transport. IAHR.
 *
 * @param {number} shields - Dimensionless Shields parameter θ [-]
 * @param {number} grain_diameter_m - Grain diameter D50 [m]
 * @param {number} fluid_density_kg_m3 - Fluid density [kg/m³]
 * @param {number} sediment_density_kg_m3 - Sediment density [kg/m³]
 * @returns {{ qb_kg_m_s: number }} - Bed-load transport rate [kg/(m·s)]
 */
export function computeBedloadTransport(shields: number, grain_diameter_m: number, fluid_density_kg_m3: number, sediment_density_kg_m3: number): BedloadResult {
    if (
        typeof shields !== 'number' ||
        typeof grain_diameter_m !== 'number' ||
        typeof fluid_density_kg_m3 !== 'number' ||
        typeof sediment_density_kg_m3 !== 'number'
    ) {
        throw new TypeError('All inputs must be numbers');
    }
    if (shields < 0) throw new RangeError('shields must be >= 0');
    if (grain_diameter_m <= 0) throw new RangeError('grain_diameter_m must be > 0');
    if (fluid_density_kg_m3 <= 0) throw new RangeError('fluid_density_kg_m3 must be > 0');
    if (sediment_density_kg_m3 <= fluid_density_kg_m3) {
        throw new RangeError('sediment_density_kg_m3 must be > fluid_density_kg_m3');
    }

    // Se θ ≤ θcr, não há transporte de carga de fundo
    if (shields <= SHIELDS_CRITICAL) {
        return { qb_kg_m_s: 0 };
    }

    const excess = shields - SHIELDS_CRITICAL;
    // Fórmula MPM em unidades volumétricas, convertida para massa
    const qb_vol = 8 * Math.sqrt(GRAVITY) * Math.pow(grain_diameter_m, 1.5) * Math.pow(excess, 1.5);
    // Conversão para massa: multiplica pela densidade do sedimento
    const qb_kg_m_s = qb_vol * sediment_density_kg_m3;

    return { qb_kg_m_s };
}

/**
 * Compute depth-averaged suspended sediment concentration using Rouse profile (1937).
 * Calcula a concentração média de sedimento em suspensão pelo perfil de Rouse.
 * Z = ws / (κ × u*); depth_averaged ≈ Cref × (1 - Z/6) para Z < 1.2
 * Ref: Rouse, H. (1937) Modern Conceptions of the Mechanics of Fluid Turbulence. Trans ASCE.
 *
 * @param {number} shear_velocity_m_s - Shear velocity u* [m/s]
 * @param {number} settling_velocity_m_s - Particle settling velocity ws [m/s]
 * @param {number} depth_m - Flow depth [m]
 * @param {number} reference_conc_kg_m3 - Reference concentration near bed [kg/m³]
 * @returns {{ depth_averaged_conc_kg_m3: number }}
 */
export function computeSuspendedLoadConcentration(
    shear_velocity_m_s: number,
    settling_velocity_m_s: number,
    depth_m: number,
    reference_conc_kg_m3: number,
): SuspendedLoadResult {
    if (
        typeof shear_velocity_m_s !== 'number' ||
        typeof settling_velocity_m_s !== 'number' ||
        typeof depth_m !== 'number' ||
        typeof reference_conc_kg_m3 !== 'number'
    ) {
        throw new TypeError('All inputs must be numbers');
    }
    if (shear_velocity_m_s <= 0) throw new RangeError('shear_velocity_m_s must be > 0');
    if (settling_velocity_m_s < 0) throw new RangeError('settling_velocity_m_s must be >= 0');
    if (depth_m <= 0) throw new RangeError('depth_m must be > 0');
    if (reference_conc_kg_m3 < 0) throw new RangeError('reference_conc_kg_m3 must be >= 0');

    // Número de Rouse: relação entre deposição e difusão turbulenta
    const Z = settling_velocity_m_s / (VON_KARMAN * shear_velocity_m_s);

    let depth_averaged_conc_kg_m3: number;
    if (Z >= 1.2) {
        // Sedimento concentrado perto do leito - aproximação conservadora
        depth_averaged_conc_kg_m3 = reference_conc_kg_m3 * 0.05;
    } else {
        // Perfil de Rouse linearizado para Z < 1.2
        depth_averaged_conc_kg_m3 = reference_conc_kg_m3 * Math.max(0, 1 - Z / 6);
    }

    return { depth_averaged_conc_kg_m3 };
}

/**
 * Classify the fluvial sediment transport regime based on computed parameters.
 * Classifica o regime de transporte de sedimentos fluviais.
 * Ref: van Rijn, L.C. (1984) J. Hydraul. Eng. DOI:10.1061/(ASCE)0733-9429(1984)110:10(1613)
 *
 * @param {number} shields - Shields parameter θ [-]
 * @param {number} bedload_kg_m_s - Bed-load transport rate [kg/(m·s)]
 * @param {number} suspended_conc_kg_m3 - Depth-averaged suspended concentration [kg/m³]
 * @returns {{ regime: string, erosion_risk: string }}
 */
export function classifySedimentRegime(shields: number, bedload_kg_m_s: number, suspended_conc_kg_m3: number): RegimeResult {
    if (typeof shields !== 'number' || typeof bedload_kg_m_s !== 'number' || typeof suspended_conc_kg_m3 !== 'number') {
        throw new TypeError('All inputs must be numbers');
    }
    if (shields < 0) throw new RangeError('shields must be >= 0');
    if (bedload_kg_m_s < 0) throw new RangeError('bedload_kg_m_s must be >= 0');
    if (suspended_conc_kg_m3 < 0) throw new RangeError('suspended_conc_kg_m3 must be >= 0');

    let regime: string;
    if (shields <= SHIELDS_CRITICAL) {
        regime = 'no_transport';
    } else if (suspended_conc_kg_m3 > 10 * bedload_kg_m_s) {
        // Suspensão domina quando concentração > 10× carga de fundo
        regime = 'suspended_dominant';
    } else if (bedload_kg_m_s > 0 && suspended_conc_kg_m3 <= bedload_kg_m_s) {
        regime = 'bedload_dominant';
    } else {
        regime = 'mixed';
    }

    // Risco de erosão baseado em θ (van Rijn 1984 thresholds)
    let erosion_risk: string;
    if (shields > 0.3) {
        erosion_risk = 'high';
    } else if (shields > 0.1) {
        erosion_risk = 'moderate';
    } else {
        erosion_risk = 'low';
    }

    return { regime, erosion_risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverSedimentTransportModelMeta = {
    name: 'riverSedimentTransportModel',
    description: 'riverSedimentTransportModel',
    category: 'analytics',
    familyTags: ['sediment', 'river', 'transport', 'fate_transport'],
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
