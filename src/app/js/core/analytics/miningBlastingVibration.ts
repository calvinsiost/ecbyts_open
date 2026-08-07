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
// Mining Blasting Vibration - PPV, scaled distance, air blast overpressure, damage risk
// Vibração de detonações em mineração - PPV, escala de distância e dano estrutural

'use strict';

/**
 * Compute Peak Particle Velocity (PPV) using the Duvall & Fogelson (1962) equation.
 * Calcula a Velocidade de Pico de Partícula (PPV) pela equação de Duvall & Fogelson.
 *
 * PPV = K × (D / √W)^(-n)  where D = distance [m], W = charge weight [kg]
 *
 * @param {number} charge_weight_kg - Maximum instantaneous charge (MIC) in kg
 * @param {number} distance_m - Distance from blast to receptor in meters
 * @param {number} site_constant_K - Site-specific attenuation constant K (typical: 160–2000)
 * @param {number} decay_exponent_n - Decay exponent n (typical: 1.5–2.0)
 * @returns {{ ppv_mm_s: number }}
 *
 * Refs: Duvall & Fogelson (1962) USBM RI 5968; ABNT NBR 9653:2018
 */
export function computePPV(charge_weight_kg: any, distance_m: any, site_constant_K: any, decay_exponent_n: any) {
    if ([charge_weight_kg, distance_m, site_constant_K, decay_exponent_n].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (charge_weight_kg <= 0) throw new RangeError('charge_weight_kg must be > 0');
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');
    if (site_constant_K <= 0) throw new RangeError('site_constant_K must be > 0');
    if (decay_exponent_n <= 0) throw new RangeError('decay_exponent_n must be > 0');

    // Distância de escala (Scaled Distance): SD = D / √W
    const scaled_distance = distance_m / Math.sqrt(charge_weight_kg);
    // PPV em mm/s
    const ppv_mm_s = site_constant_K * Math.pow(scaled_distance, -decay_exponent_n);

    return { ppv_mm_s: Math.round(ppv_mm_s * 1000) / 1000 };
}

/**
 * Compute the scaled distance for a blast and classify its zone.
 * Calcula a distância de escala e classifica a zona de impacto.
 *
 * SD = D / √W
 *
 * @param {number} distance_m - Distance in meters
 * @param {number} charge_weight_kg - Charge weight in kg
 * @returns {{ scaled_distance: number, category: 'near'|'intermediate'|'far' }}
 *
 * Refs: Duvall & Fogelson (1962); ISEE (2011) Blasters Handbook
 */
export function computeScaledDistance(distance_m: any, charge_weight_kg: any) {
    if (typeof distance_m !== 'number' || typeof charge_weight_kg !== 'number') {
        throw new TypeError('Both parameters must be numbers');
    }
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');
    if (charge_weight_kg <= 0) throw new RangeError('charge_weight_kg must be > 0');

    const scaled_distance = distance_m / Math.sqrt(charge_weight_kg);

    // Categorias: near < 10, intermediate 10-50, far > 50
    /** @type {'near'|'intermediate'|'far'} */
    let category;
    if (scaled_distance < 10) category = 'near';
    else if (scaled_distance <= 50) category = 'intermediate';
    else category = 'far';

    return { scaled_distance: Math.round(scaled_distance * 1000) / 1000, category };
}

/**
 * Compute air blast overpressure from a surface explosion.
 * Calcula a sobrepressão de onda aérea de uma detonação a céu aberto.
 *
 * P = K_air × W^(1/3) / D   (Hopkinson-Cranz scaling law, surface burst)
 *
 * @param {number} charge_weight_kg - Charge weight in kg
 * @param {number} distance_m - Distance in meters
 * @param {number} confinement_factor - 0.5 (underground) to 1.0 (fully surface)
 * @returns {{ overpressure_kPa: number, overpressure_dB: number }}
 *
 * Refs: Hopkinson (1915); Cranz (1926); ISEE (2011); IBAMA IN 13/2013
 */
export function computeAirBlastOverpressure(charge_weight_kg: any, distance_m: any, confinement_factor: any) {
    if ([charge_weight_kg, distance_m, confinement_factor].some((v) => typeof v !== 'number')) {
        throw new TypeError('All parameters must be numbers');
    }
    if (charge_weight_kg <= 0) throw new RangeError('charge_weight_kg must be > 0');
    if (distance_m <= 0) throw new RangeError('distance_m must be > 0');
    if (confinement_factor < 0.5 || confinement_factor > 1.0) {
        throw new RangeError('confinement_factor must be in [0.5, 1.0]');
    }

    // K_air = 160 Pa·m/kg^(1/3) para detonação em superfície (ISEE 2011)
    const K_air = 160;
    // Pressão em Pa: P = K_air × confinement_factor × W^(1/3) / D
    const overpressure_Pa = (K_air * confinement_factor * Math.pow(charge_weight_kg, 1 / 3)) / distance_m;
    const overpressure_kPa = overpressure_Pa / 1000;
    // Conversão para dB(L): 20 × log10(P / P_ref), P_ref = 20 µPa = 20e-6 Pa
    const overpressure_dB = 20 * Math.log10(Math.max(overpressure_Pa, 20e-6) / 20e-6);

    return {
        overpressure_kPa: Math.round(overpressure_kPa * 10000) / 10000,
        overpressure_dB: Math.round(overpressure_dB * 10) / 10,
    };
}

/**
 * Classify blast-induced damage risk to structures.
 * Classifica o risco de dano estrutural por vibração de detonação.
 *
 * @param {number} ppv_mm_s - Peak particle velocity in mm/s
 * @param {number} frequency_hz - Dominant frequency in Hz
 * @param {'residential'|'commercial'|'historic'|'industrial'} structure_type
 * @returns {{ risk: 'negligible'|'cosmetic'|'minor'|'major'|'structural_damage', limit_mm_s: number }}
 *
 * Refs: ISEE (2011) Blasters Handbook; ABNT NBR 9653:2018; IBAMA IN 13/2013
 */
export function classifyBlastingDamageRisk(ppv_mm_s: any, frequency_hz: any, structure_type: any) {
    if (typeof ppv_mm_s !== 'number' || typeof frequency_hz !== 'number') {
        throw new TypeError('ppv_mm_s and frequency_hz must be numbers');
    }
    if (ppv_mm_s < 0) throw new RangeError('ppv_mm_s cannot be negative');
    if (frequency_hz <= 0) throw new RangeError('frequency_hz must be > 0');

    const VALID_TYPES = ['residential', 'commercial', 'historic', 'industrial'];
    if (!VALID_TYPES.includes(structure_type)) throw new TypeError('Invalid structure_type');

    // Limites NBR 9653:2018 + ISEE 2011 em mm/s
    // Frequência < 10 Hz: mais restritivo (factor 0.6)
    const LOW_FREQ_FACTOR = frequency_hz < 10 ? 0.6 : 1.0;
    const LIMITS = {
        residential: 15,
        commercial: 25,
        historic: 5,
        industrial: 50,
    };

const base_limit = LIMITS[structure_type as keyof typeof LIMITS];
    const limit_mm_s = Math.round(base_limit * LOW_FREQ_FACTOR * 10) / 10;
    const ratio = ppv_mm_s / limit_mm_s;

    /** @type {'negligible'|'cosmetic'|'minor'|'major'|'structural_damage'} */
    let risk;
    if (ratio <= 0.2) risk = 'negligible';
    else if (ratio <= 0.5) risk = 'cosmetic';
    else if (ratio <= 1.0) risk = 'minor';
    else if (ratio <= 2.0) risk = 'major';
    else risk = 'structural_damage';

    return { risk, limit_mm_s };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningBlastingVibrationMeta = {
    name: 'miningBlastingVibration',
    description: 'miningBlastingVibration',
    category: 'analytics',
    familyTags: ['mining', 'blasting'],
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
