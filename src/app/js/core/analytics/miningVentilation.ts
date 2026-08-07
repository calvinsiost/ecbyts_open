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
// Application: EHS & Mining - Mining Ventilation Engineering
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Mining Ventilation Engineering - Underground Mine Air Quality
 *
 * Módulo puro implementando cálculos de ventilação para minas subterrâneas:
 * vazão mínima de ar, perda de pressão (Atkinson), potência do ventilador e
 * classificação da qualidade do ar conforme NR-22 e MSHA CFR 30 Part 57.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module miningVentilation
 * @references
 *   McPherson, M.J. (1993) Subsurface Ventilation and Environmental Engineering. Chapman & Hall.
 *   NR-22 - Norma Regulamentadora 22, MTE/2022 (Segurança e Saúde Ocupacional na Mineração).
 *   MSHA CFR 30 Part 57 - Mine Safety and Health Administration, Metal/Non-Metal Underground.
 */

/**
 * Compute minimum airflow requirement for an underground mine section.
 * Calcula a vazão mínima de ar para uma seção de mina subterrânea.
 *
 * Q_min = max(workers × 0.06, equipment_kW × 0.04 + 1, explosivesKg × 0.2)
 * Padrões: NR-22 §22.19 (0.06 m³/s por trabalhador), MSHA §57.5005.
 *
 * @param {number} workers - Number of workers in section, integer ≥ 0
 * @param {number} equipment_kW - Total diesel equipment power (kW), ≥ 0
 * @param {number} explosivesKg - Explosives mass detonated per blast (kg), ≥ 0
 * @returns {{ airflow_m3_s: number, limitingFactor: 'workers'|'equipment'|'explosives' }}
 * @throws {RangeError} se inputs negativos
 * @references McPherson (1993) ch. 4; NR-22 §22.19.1; MSHA 30 CFR §57.5005
 */
export function computeAirflowRequirement(workers: any, equipment_kW: any, explosivesKg: any) {
    if (workers < 0) throw new RangeError('workers must be >= 0');
    if (equipment_kW < 0) throw new RangeError('equipment_kW must be >= 0');
    if (explosivesKg < 0) throw new RangeError('explosivesKg must be >= 0');

    // Três critérios de dimensionamento em paralelo - adota-se o mais restritivo
    // Three parallel sizing criteria - the governing (maximum) is adopted
    const qWorkers = workers * 0.06;
    const qEquipment = equipment_kW * 0.04 + 1;
    const qExplosives = explosivesKg * 0.2;

    const airflow_m3_s = Math.max(qWorkers, qEquipment, qExplosives);

    /** @type {'workers'|'equipment'|'explosives'} */
    let limitingFactor;
    if (airflow_m3_s === qExplosives) limitingFactor = 'explosives';
    else if (airflow_m3_s === qEquipment) limitingFactor = 'equipment';
    else limitingFactor = 'workers';

    return { airflow_m3_s, limitingFactor };
}

/**
 * Compute pressure drop in a mine airway using Atkinson's equation.
 * Calcula a perda de pressão em uma galeria de mina pela equação de Atkinson.
 *
 * R = K × L × Per / A³
 * ΔP = R × Q²
 * onde K = fator de atrito de Atkinson (N·s²/m⁴), Per = perímetro (m), A = área (m²).
 *
 * @param {number} airflow_m3_s - Airflow rate (m³/s), > 0
 * @param {number} length_m - Airway length (m), > 0
 * @param {number} diameter_m - Equivalent circular diameter (m), > 0
 * @param {number} roughness - Atkinson friction factor K (N·s²/m⁴), typical 0.003–0.05
 * @returns {{ pressureDrop_Pa: number, resistanceR: number }}
 * @throws {RangeError} se inputs inválidos
 * @references McPherson (1993) ch. 5, eq. 5.4 (Atkinson 1854 adapted); typical K values table 5.1.
 */
export function computePressureDrop(airflow_m3_s: any, length_m: any, diameter_m: any, roughness: any) {
    if (airflow_m3_s <= 0) throw new RangeError('airflow_m3_s must be > 0');
    if (length_m <= 0) throw new RangeError('length_m must be > 0');
    if (diameter_m <= 0) throw new RangeError('diameter_m must be > 0');
    if (roughness <= 0) throw new RangeError('roughness (K) must be > 0');

    // Seção circular: A = π r², Per = π d
    const area = Math.PI * (diameter_m / 2) ** 2;
    const perimeter = Math.PI * diameter_m;

    // Resistência de Atkinson da galeria (N·s²/m⁸)
    const resistanceR = (roughness * length_m * perimeter) / area ** 3;

    // Perda de pressão (Pa) - equação quadrática de Atkinson
    const pressureDrop_Pa = resistanceR * airflow_m3_s ** 2;

    return { pressureDrop_Pa, resistanceR };
}

/**
 * Compute ventilation fan power requirement.
 * Calcula a potência necessária do ventilador de mina.
 *
 * P = ΔP × Q / (1000 × η)  [kW]
 *
 * @param {number} pressureDrop_Pa - Total system pressure drop (Pa), > 0
 * @param {number} airflow_m3_s - Airflow rate (m³/s), > 0
 * @param {number} efficiency - Fan total efficiency [0.1, 1.0]
 * @returns {{ power_kW: number }}
 * @throws {RangeError} se inputs inválidos
 * @references McPherson (1993) ch. 9; AMCA Publication 211.
 */
export function computeFanPower(pressureDrop_Pa: any, airflow_m3_s: any, efficiency: any) {
    if (pressureDrop_Pa <= 0) throw new RangeError('pressureDrop_Pa must be > 0');
    if (airflow_m3_s <= 0) throw new RangeError('airflow_m3_s must be > 0');
    if (efficiency <= 0 || efficiency > 1) throw new RangeError('efficiency must be in (0, 1]');

    // Potência hidráulica do ventilador convertida para kW
    const power_kW = (pressureDrop_Pa * airflow_m3_s) / (1000 * efficiency);
    return { power_kW };
}

/**
 * Classify underground mine air quality against NR-22 / MSHA limits.
 * Classifica a qualidade do ar em mina subterrânea conforme NR-22 e MSHA.
 *
 * Limites de perigo (danger):
 *   O2 < 19.5% (MSHA §57.5001), CO > 50 ppm (NR-15 Quadro 1 / MSHA §57.5047),
 *   NO2 > 5 ppm (MSHA §57.5047), poeira > 3 mg/m³ (NR-15 Quadro 5).
 * Limites de alerta (warning):
 *   O2 < 20.5%, CO > 25 ppm, NO2 > 3 ppm, poeira > 1.5 mg/m³.
 *
 * @param {number} o2_pct - Oxygen concentration (%), [0, 100]
 * @param {number} co_ppm - Carbon monoxide (ppm), ≥ 0
 * @param {number} no2_ppm - Nitrogen dioxide (ppm), ≥ 0
 * @param {number} dust_mg_m3 - Respirable dust (mg/m³), ≥ 0
 * @returns {{ status: 'safe'|'warning'|'danger', violations: string[] }}
 * @throws {RangeError} se O2 fora de [0,100]
 * @references NR-22 §22.19 / NR-15 Quadro 1 e 5; MSHA 30 CFR §57.5001, §57.5047.
 */
function _validateAirQualityMine(o2_pct: any, co_ppm: any, no2_ppm: any, dust_mg_m3: any): void {
    if (o2_pct < 0 || o2_pct > 100) throw new RangeError('o2_pct must be in [0, 100]');
    if (co_ppm < 0) throw new RangeError('co_ppm must be >= 0');
    if (no2_ppm < 0) throw new RangeError('no2_ppm must be >= 0');
    if (dust_mg_m3 < 0) throw new RangeError('dust_mg_m3 must be >= 0');
}

function _dangerViolations(o2_pct: number, co_ppm: number, no2_ppm: number, dust_mg_m3: number): string[] {
    const violations: string[] = [];
    if (o2_pct < 19.5) violations.push(`O2 deficiency: ${o2_pct.toFixed(1)}% < 19.5% (MSHA §57.5001)`);
    if (co_ppm > 50) violations.push(`CO excess: ${co_ppm} ppm > 50 ppm (MSHA §57.5047)`);
    if (no2_ppm > 5) violations.push(`NO2 excess: ${no2_ppm} ppm > 5 ppm (MSHA §57.5047)`);
    if (dust_mg_m3 > 3) violations.push(`Dust excess: ${dust_mg_m3} mg/m³ > 3 mg/m³ (NR-15)`);
    return violations;
}

function _warningViolations(o2_pct: number, co_ppm: number, no2_ppm: number, dust_mg_m3: number): string[] {
    const violations: string[] = [];
    if (o2_pct < 20.5) violations.push(`O2 low: ${o2_pct.toFixed(1)}% < 20.5% (warning)`);
    if (co_ppm > 25) violations.push(`CO elevated: ${co_ppm} ppm > 25 ppm (warning)`);
    if (no2_ppm > 3) violations.push(`NO2 elevated: ${no2_ppm} ppm > 3 ppm (warning)`);
    if (dust_mg_m3 > 1.5) violations.push(`Dust elevated: ${dust_mg_m3} mg/m³ > 1.5 mg/m³ (warning)`);
    return violations;
}

export function classifyAirQualityMine(o2_pct: any, co_ppm: any, no2_ppm: any, dust_mg_m3: any) {
    _validateAirQualityMine(o2_pct, co_ppm, no2_ppm, dust_mg_m3);

    const danger = _dangerViolations(o2_pct, co_ppm, no2_ppm, dust_mg_m3);
    if (danger.length > 0) {
        return { status: 'danger' as const, violations: danger };
    }

    const warning = _warningViolations(o2_pct, co_ppm, no2_ppm, dust_mg_m3);
    return { status: warning.length > 0 ? ('warning' as const) : ('safe' as const), violations: warning };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const miningVentilationMeta = {
    name: 'miningVentilation',
    description: 'Mining Ventilation Engineering',
    category: 'analytics',
    familyTags: ['mining'],
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
