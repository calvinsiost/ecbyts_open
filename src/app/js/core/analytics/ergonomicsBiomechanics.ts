// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Ergonomics Biomechanics - lumbar compression, NIOSH lifting, HAV, RULA posture
// Biomecanica ergonomica - compressao lombar, NIOSH, vibracao mao-braco, RULA simplificado
// Refs: NIOSH (1994) DHHS 94-110; McAtamney & Corlett (1993) DOI:10.1016/0003-6870(93)90080-S;
//       ISO 5349-1:2001; MTE NR-9 Anexo II (BR); MTE NR-17 (BR)

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

const G = 9.81;

/**
 * Computes lumbar compression force at L4/L5 and NIOSH risk category.
 * Calcula forca de compressao lombar em L4/L5 e classifica risco (NIOSH 1981).
 * F_comp = W*g*cos(theta)*(H/V_arm) + 0.6*70*g*sin(theta)
 * Thresholds: acceptable < 3400 N, caution < 6400 N.
 * @param weight_kg @param horizontal_distance_cm
 * @param vertical_distance_cm @param trunk_angle_deg [0,90]
 * @returns
 * @throws {RangeError} Se trunk_angle_deg fora de [0,90] ou valores negativos.
 */
export function computeLumbarCompression(
    weight_kg: number,
    horizontal_distance_cm: number,
    vertical_distance_cm: number,
    trunk_angle_deg: number,
): { compression_N: number; risk: 'acceptable' | 'caution' | 'high' } {
    if ([weight_kg, horizontal_distance_cm, vertical_distance_cm, trunk_angle_deg].some((v) => typeof v !== 'number'))
        throw new TypeError('All parameters must be numbers');
    if (weight_kg < 0) throw new RangeError('weight_kg must be >= 0');
    if (horizontal_distance_cm < 0) throw new RangeError('horizontal_distance_cm must be >= 0');
    if (vertical_distance_cm < 0) throw new RangeError('vertical_distance_cm must be >= 0');
    if (trunk_angle_deg < 0 || trunk_angle_deg > 90) throw new RangeError('trunk_angle_deg must be in [0, 90]');
    const theta = (trunk_angle_deg * Math.PI) / 180;
    const V_arm = 25; // cm — braco de momento do antebraco (tipico adulto)
    const load_component = weight_kg * G * Math.cos(theta) * (horizontal_distance_cm / V_arm);
    const body_contribution = 70 * 0.6 * G * Math.sin(theta);
    const compression_N = load_component + body_contribution;
    const risk = compression_N < 3400 ? 'acceptable' : compression_N < 6400 ? 'caution' : 'high';
    return { compression_N, risk };
}

/**
 * Computes NIOSH Revised Lifting Equation (1994) RWL and Lifting Index.
 * Calcula o Limite de Peso Recomendado e Indice de Levantamento NIOSH (1994).
 * RWL = LC*HM*VM*DM*FM*CM*AM; LI = weight/RWL
 * LC=23kg; HM=min(1,25/H); VM=1-0.003|V-75|; DM=0.82+4.5/D; AM=1-0.0032*A
 * @param weight_kg @param horizontal_cm @param vertical_cm [0,175]
 * @param frequency_lifts_min @param coupling_factor [0,1]
 * @param asymmetry_deg [0,135]
 * @returns
 * @throws {RangeError} Se parametros fora de limites.
 */
export function computeNIOSHLiftingIndex(
    weight_kg: number,
    horizontal_cm: number,
    vertical_cm: number,
    frequency_lifts_min: number,
    coupling_factor: number,
    asymmetry_deg: number,
): { rwl_kg: number; li: number; risk: 'safe' | 'caution' | 'hazardous' } {
    if (
        [weight_kg, horizontal_cm, vertical_cm, frequency_lifts_min, coupling_factor, asymmetry_deg].some(
            (v) => typeof v !== 'number',
        )
    )
        throw new TypeError('All parameters must be numbers');
    if (weight_kg < 0) throw new RangeError('weight_kg must be >= 0');
    if (horizontal_cm <= 0) throw new RangeError('horizontal_cm must be > 0');
    if (vertical_cm < 0 || vertical_cm > 175) throw new RangeError('vertical_cm must be in [0, 175]');
    if (frequency_lifts_min < 0) throw new RangeError('frequency_lifts_min must be >= 0');
    if (coupling_factor < 0 || coupling_factor > 1) throw new RangeError('coupling_factor must be in [0, 1]');
    if (asymmetry_deg < 0 || asymmetry_deg > 135) throw new RangeError('asymmetry_deg must be in [0, 135]');
    const LC = 23;
    const HM = Math.min(1.0, 25 / horizontal_cm);
    const VM = Math.max(0, 1 - 0.003 * Math.abs(vertical_cm - 75));
    const D = Math.max(25, vertical_cm);
    const DM = 0.82 + 4.5 / D;
    // FM simplificado - tabela NIOSH condensada por frequencia
    let FM: number;
    if (frequency_lifts_min <= 0.2) FM = 1.0;
    else if (frequency_lifts_min <= 1) FM = 0.94;
    else if (frequency_lifts_min <= 2) FM = 0.91;
    else if (frequency_lifts_min <= 3) FM = 0.88;
    else if (frequency_lifts_min <= 4) FM = 0.84;
    else if (frequency_lifts_min <= 5) FM = 0.8;
    else FM = 0.7;
    const AM = Math.max(0, 1 - 0.0032 * asymmetry_deg);
    const rwl_kg = LC * HM * VM * DM * FM * coupling_factor * AM;
    const li = weight_kg / rwl_kg;
    const risk = li <= 1.0 ? 'safe' : li <= 3.0 ? 'caution' : 'hazardous';
    return { rwl_kg, li, risk };
}

/**
 * Computes hand-arm vibration exposure per ISO 5349-1:2001 and NR-9 Anexo II.
 * Calcula exposicao a vibracao mao-braco conforme ISO 5349-1:2001.
 * A(8) = a * sqrt(T/8); EAV=2.5 m/s2; ELV=5.0 m/s2
 * @param acceleration_m_s2 @param daily_exposure_hours [0,24]
 * @returns
 * @throws {RangeError} Se parametros invalidos.
 */
export function computeHandArmVibration(
    acceleration_m_s2: number,
    daily_exposure_hours: number,
): { ahv_m_s2: number; exposure_points: number; action_reached: boolean; limit_reached: boolean } {
    if (typeof acceleration_m_s2 !== 'number' || typeof daily_exposure_hours !== 'number')
        throw new TypeError('acceleration_m_s2 and daily_exposure_hours must be numbers');
    if (acceleration_m_s2 < 0) throw new RangeError('acceleration_m_s2 must be >= 0');
    if (daily_exposure_hours < 0 || daily_exposure_hours > 24)
        throw new RangeError('daily_exposure_hours must be in [0, 24]');
    const A_action = 2.5;
    const A_limit = 5.0;
    // Exposicao normalizada para 8 horas (ISO 5349-1)
    const ahv_m_s2 = acceleration_m_s2 * Math.sqrt(daily_exposure_hours / 8);
    const exposure_points = Math.pow(acceleration_m_s2 / A_action, 2) * daily_exposure_hours;
    return { ahv_m_s2, exposure_points, action_reached: ahv_m_s2 >= A_action, limit_reached: ahv_m_s2 >= A_limit };
}

/**
 * Classifies posture risk using simplified RULA score (McAtamney and Corlett 1993).
 * Classifica risco postural pela pontuacao RULA simplificada.
 * score = trunk_score + arm_score + wrist_score + rep_penalty
 * action: 1(<=2), 2(<=4), 3(<=6), 4(>=7)
 * @param trunk_flexion_deg [0,180] @param arm_elevation_deg [0,180]
 * @param wrist_deviation_deg [0,90] @param repetitions_per_min
 * @returns
 * @throws {RangeError} Se angulos fora de limites.
 */
export function classifyPostureRisk(
    trunk_flexion_deg: number,
    arm_elevation_deg: number,
    wrist_deviation_deg: number,
    repetitions_per_min: number,
): { rula_score: number; action_level: 1 | 2 | 3 | 4; recommendation: string } {
    if (
        [trunk_flexion_deg, arm_elevation_deg, wrist_deviation_deg, repetitions_per_min].some(
            (v) => typeof v !== 'number',
        )
    )
        throw new TypeError('All parameters must be numbers');
    if (trunk_flexion_deg < 0 || trunk_flexion_deg > 180) throw new RangeError('trunk_flexion_deg must be in [0, 180]');
    if (arm_elevation_deg < 0 || arm_elevation_deg > 180) throw new RangeError('arm_elevation_deg must be in [0, 180]');
    if (wrist_deviation_deg < 0 || wrist_deviation_deg > 90)
        throw new RangeError('wrist_deviation_deg must be in [0, 90]');
    if (repetitions_per_min < 0) throw new RangeError('repetitions_per_min must be >= 0');
    const trunk_score = trunk_flexion_deg <= 10 ? 1 : trunk_flexion_deg <= 20 ? 2 : trunk_flexion_deg <= 60 ? 3 : 4;
    const arm_score = arm_elevation_deg <= 20 ? 1 : arm_elevation_deg <= 45 ? 2 : arm_elevation_deg <= 90 ? 3 : 4;
    const wrist_score = wrist_deviation_deg <= 15 ? 1 : wrist_deviation_deg <= 30 ? 2 : 3;
    const rep_penalty = repetitions_per_min <= 4 ? 0 : repetitions_per_min <= 9 ? 1 : 2;
    const rula_score = trunk_score + arm_score + wrist_score + rep_penalty;
    let action_level: 1 | 2 | 3 | 4 = 4;
    let recommendation = 'Implement changes immediately - high injury risk';
    if (rula_score <= 2) {
        action_level = 1;
        recommendation = 'Acceptable posture - no action required';
    } else if (rula_score <= 4) {
        action_level = 2;
        recommendation = 'Investigation may be needed - monitor task';
    } else if (rula_score <= 6) {
        action_level = 3;
        recommendation = 'Changes required soon - redesign workstation';
    }
    return { rula_score, action_level, recommendation };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ergonomicsBiomechanicsMeta: AnalyticsModuleMeta = {
    name: 'ergonomicsBiomechanics',
    description: 'ergonomicsBiomechanics',
    category: 'analytics',
    familyTags: ['occupational'],
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
