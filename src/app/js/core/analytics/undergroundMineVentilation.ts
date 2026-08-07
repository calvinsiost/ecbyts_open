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
// Underground Mine Ventilation - airflow, gas dilution, and pressure loss analysis
// Ventilação de minas subterrâneas - fluxo de ar, diluição de gases e perda de pressão

'use strict';

/**
 * Compute air velocity in a mine airway from volumetric flow rate and cross-section.
 * Calcula a velocidade do ar em uma galeria de mina a partir da vazão e seção transversal.
 *
 * v = Q / A  (equação da continuidade)
 *
 * @param {number} flow_rate_m3_s - Volumetric airflow rate (m³/s)
 * @param {number} cross_section_m2 - Airway cross-sectional area (m²)
 * @returns {{ velocity_m_s: number }} Air velocity in m/s
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If cross_section_m2 <= 0 or flow_rate_m3_s < 0
 *
 * Refs:
 *   McPherson (1993) Subsurface Ventilation and Environmental Engineering, Chapman & Hall.
 *   MTE NR-22 (BR) - Segurança e Saúde Ocupacional na Mineração.
 */
export function computeAirVelocity(flow_rate_m3_s: any, cross_section_m2: any) {
    if (!Number.isFinite(flow_rate_m3_s) || !Number.isFinite(cross_section_m2)) {
        throw new TypeError('computeAirVelocity: inputs must be finite numbers');
    }
    if (flow_rate_m3_s < 0) {
        throw new RangeError('computeAirVelocity: flow_rate_m3_s must be >= 0');
    }
    if (cross_section_m2 <= 0) {
        throw new RangeError('computeAirVelocity: cross_section_m2 must be > 0');
    }
    const velocity_m_s = flow_rate_m3_s / cross_section_m2;
    return { velocity_m_s };
}

/**
 * Compute required dilution airflow to maintain a gas below its TLV-TWA.
 * Calcula a vazão de ar de diluição necessária para manter um gás abaixo do seu TLV-TWA.
 *
 * Q_dil = E × 1e6 / (TLV - background)
 * onde E é a taxa de emissão do gás (m³/s), TLV e background em ppm.
 * dilution_ratio = Q_dil / E
 *
 * @param {number} gas_emission_rate_m3_s - Gas emission rate into airway (m³/s)
 * @param {number} tlv_ppm - Threshold Limit Value – Time-Weighted Average (ppm)
 * @param {number} background_ppm - Background gas concentration in supply air (ppm)
 * @returns {{ required_airflow_m3_s: number, dilution_ratio: number }}
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If tlv_ppm <= background_ppm, or emission rate < 0
 *
 * Refs:
 *   McPherson (1993) Ch.11 - Mine Gases and Dust.
 *   NIOSH (1995) Preventing Deaths from Mine Fires, DHHS Pub. No. 95-112.
 *   ACGIH TLVs & BEIs (2024).
 */
export function computeDilutionAirflow(gas_emission_rate_m3_s: any, tlv_ppm: any, background_ppm: any) {
    if (!Number.isFinite(gas_emission_rate_m3_s) || !Number.isFinite(tlv_ppm) || !Number.isFinite(background_ppm)) {
        throw new TypeError('computeDilutionAirflow: all inputs must be finite numbers');
    }
    if (gas_emission_rate_m3_s < 0) {
        throw new RangeError('computeDilutionAirflow: gas_emission_rate_m3_s must be >= 0');
    }
    if (tlv_ppm <= background_ppm) {
        throw new RangeError('computeDilutionAirflow: tlv_ppm must be greater than background_ppm');
    }
    // Vazão de diluição: Q_dil (m³/s) = E (m³/s) × 1e6 ppm / (TLV - background) ppm
    // O fator 1e6 converte a fração volumétrica para ppm (1 m³/s gás em 1e6 m³/s ar = 1 ppm)
    const required_airflow_m3_s = (gas_emission_rate_m3_s * 1e6) / (tlv_ppm - background_ppm);
    const dilution_ratio = gas_emission_rate_m3_s > 0 ? required_airflow_m3_s / gas_emission_rate_m3_s : 0;
    return { required_airflow_m3_s, dilution_ratio };
}

/**
 * Compute pressure loss in a mine airway using the Atkinson friction equation.
 * Calcula a perda de pressão em uma galeria de mina usando a equação de atrito de Atkinson.
 *
 * ΔP = f × (L / Dh) × (ρ × v² / 2)
 * onde f é o fator de atrito de Darcy-Weisbach, Dh o diâmetro hidráulico.
 *
 * @param {number} length_m - Airway length (m)
 * @param {number} friction_factor - Darcy-Weisbach friction factor (dimensionless, typically 0.01–0.04)
 * @param {number} velocity_m_s - Air velocity (m/s)
 * @param {number} hydraulic_diameter_m - Hydraulic diameter Dh = 4A/P (m)
 * @param {number} air_density_kg_m3 - Air density (kg/m³, typically ~1.2)
 * @returns {{ pressure_loss_Pa: number }} Pressure drop in Pascals
 * @throws {TypeError} If any input is not a finite number
 * @throws {RangeError} If hydraulic_diameter_m <= 0, length_m < 0, or air_density_kg_m3 <= 0
 *
 * Refs: McPherson (1993) eq. 5.5; Darcy-Weisbach equation.
 */
export function computePressureLoss(length_m: any, friction_factor: any, velocity_m_s: any, hydraulic_diameter_m: any, air_density_kg_m3: any) {
    if (
        !Number.isFinite(length_m) ||
        !Number.isFinite(friction_factor) ||
        !Number.isFinite(velocity_m_s) ||
        !Number.isFinite(hydraulic_diameter_m) ||
        !Number.isFinite(air_density_kg_m3)
    ) {
        throw new TypeError('computePressureLoss: all inputs must be finite numbers');
    }
    if (length_m < 0) {
        throw new RangeError('computePressureLoss: length_m must be >= 0');
    }
    if (hydraulic_diameter_m <= 0) {
        throw new RangeError('computePressureLoss: hydraulic_diameter_m must be > 0');
    }
    if (air_density_kg_m3 <= 0) {
        throw new RangeError('computePressureLoss: air_density_kg_m3 must be > 0');
    }
    // Equação de Darcy-Weisbach adaptada por Atkinson para galerias de mina
    // ΔP (Pa) = f × (L/Dh) × (ρ × v²/2)
    const pressure_loss_Pa =
        friction_factor * (length_m / hydraulic_diameter_m) * ((air_density_kg_m3 * velocity_m_s * velocity_m_s) / 2);
    return { pressure_loss_Pa };
}

interface AtmosphereIssue {
    issue: string;
    level: number;
}

const ATMOSPHERE_STATUS_MAP = ['normal', 'caution', 'dangerous', 'immediately_dangerous'];

function _o2Issue(o2_pct: number): AtmosphereIssue | null {
    if (o2_pct < 16) return { issue: 'O2_critically_low', level: 3 };
    if (o2_pct < 19.5) return { issue: 'O2_deficient', level: 2 };
    return null;
}

function _coIssue(co_ppm: number): AtmosphereIssue | null {
    if (co_ppm > 1200) return { issue: 'CO_IDLH', level: 3 };
    if (co_ppm > 25) return { issue: 'CO_elevated', level: 1 };
    return null;
}

function _ch4Issue(ch4_ppm: number): AtmosphereIssue | null {
    if (ch4_ppm >= 25000) return { issue: 'CH4_dangerous_LEL50pct', level: 2 };
    if (ch4_ppm >= 5000) return { issue: 'CH4_caution_LEL10pct', level: 1 };
    return null;
}

function _dustIssue(dust_mg_m3: number): AtmosphereIssue | null {
    if (dust_mg_m3 > 10) return { issue: 'dust_above_limit', level: 2 };
    if (dust_mg_m3 > 5) return { issue: 'dust_elevated', level: 1 };
    return null;
}

/**
 * Classify mine atmosphere safety based on critical gas concentrations.
 * Classifica a segurança da atmosfera de mina com base nas concentrações de gases críticos.
 *
 * IDLH thresholds (OSHA / NR-22 BR):
 *   O2 < 19.5% → oxygen deficient (OSHA 1910.146)
 *   CO > 1200 ppm → IDLH (NIOSH)
 *   CH4 > 1% → caution (10% LEL, LEL = 5%); > 2.5% → dangerous (50% LEL)
 *   Dust > 10 mg/m³ respirable → dangerous (NR-15 Anexo 12)
 *
 * @param {number} o2_pct - Oxygen concentration (%)
 * @param {number} co_ppm - Carbon monoxide concentration (ppm)
 * @param {number} ch4_ppm - Methane concentration (ppm)
 * @param {number} dust_mg_m3 - Respirable dust concentration (mg/m³)
 * @returns {{ status: string, issues: string[] }}
 * @throws {TypeError} If any input is not a finite number
 * @throws {RangeError} If any input is negative
 *
 * Refs:
 *   OSHA 1910.94 / 1910.146; NR-22 MTE (BR); NIOSH (1995) DHHS 95-112;
 *   McPherson (1993) Ch.11.
 */
export function classifyMineAtmosphere(o2_pct: any, co_ppm: any, ch4_ppm: any, dust_mg_m3: any) {
    if (
        !Number.isFinite(o2_pct) ||
        !Number.isFinite(co_ppm) ||
        !Number.isFinite(ch4_ppm) ||
        !Number.isFinite(dust_mg_m3)
    ) {
        throw new TypeError('classifyMineAtmosphere: all inputs must be finite numbers');
    }
    if (o2_pct < 0 || co_ppm < 0 || ch4_ppm < 0 || dust_mg_m3 < 0) {
        throw new RangeError('classifyMineAtmosphere: all inputs must be >= 0');
    }

    const checks: (AtmosphereIssue | null)[] = [
        _o2Issue(o2_pct as number),
        _coIssue(co_ppm as number),
        _ch4Issue(ch4_ppm as number),
        _dustIssue(dust_mg_m3 as number),
    ];

    const issues: string[] = [];
    let maxLevel = 0; // 0=normal, 1=caution, 2=dangerous, 3=immediately_dangerous
    for (const check of checks) {
        if (check) {
            issues.push(check.issue);
            maxLevel = Math.max(maxLevel, check.level);
        }
    }

    return { status: ATMOSPHERE_STATUS_MAP[maxLevel], issues };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const undergroundMineVentilationMeta = {
    name: 'undergroundMineVentilation',
    description: 'undergroundMineVentilation',
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
