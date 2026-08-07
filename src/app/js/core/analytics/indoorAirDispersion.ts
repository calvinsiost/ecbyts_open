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
// Indoor Air Dispersion - ventilation, air change rate, mass balance steady-state and decay
// Dispersão de contaminantes no ar interno - ventilação, taxa de troca de ar, equilíbrio de massa.
//
// References / Referências:
//   WHO (2010) WHO Guidelines for Indoor Air Quality: Selected Pollutants. ISBN 978 92 890 0213 4.
//   ASHRAE Standard 62.1-2022 - Ventilation and Acceptable Indoor Air Quality.
//   ISO 16000-8:2007 - Indoor air: Determination of local mean ages of air.
//   ASTM E741 - Standard Test Method for Determining Air Change in a Single Zone by Means of a Tracer Gas Dilution.

'use strict';

/**
 * WHO Indoor Air Quality guidelines (µg/m³).
 * Diretrizes da OMS para qualidade do ar interno (µg/m³).
 * Source: WHO (2010) Guidelines for Indoor Air Quality: Selected Pollutants.
 * @private
 */
const WHO_GUIDELINES_UG_M3 = {
    benzene: 5, // µg/m³ — WHO annual guideline (no safe threshold; 5 = practical minimum)
    formaldehyde: 100, // µg/m³ — WHO 30-min ceiling
    PM25: 15, // µg/m³ — WHO annual guideline (2021 AQG update)
    CO: 10000, // µg/m³ — WHO 8-hour guideline (10 mg/m³ = 10000 µg/m³)
};

/**
 * Compute air change rate (ACH) for a room given volumetric flow rate and room volume.
 * Calcula a taxa de troca de ar (ACH) para um ambiente a partir da vazão volumétrica e volume do cômodo.
 * ACH = Q [m³/h] / V [m³]
 *
 * @param {number} flow_rate_m3_h - Supply/exhaust air flow rate Q (m³/h).
 *   Vazão de ar (suprimento ou exaustão) Q (m³/h). Typical: 50–500 m³/h residential.
 * @param {number} room_volume_m3 - Room volume V (m³). Must be > 0.
 *   Volume do cômodo V (m³). Deve ser > 0.
 * @returns {{ ach: number }}
 *   Air change rate per hour (h⁻¹).
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If flow_rate_m3_h < 0 or room_volume_m3 <= 0.
 */
export function computeAirChangeRate(flow_rate_m3_h: any, room_volume_m3: any) {
    if (!Number.isFinite(flow_rate_m3_h) || !Number.isFinite(room_volume_m3)) {
        throw new TypeError('flow_rate_m3_h and room_volume_m3 must be finite numbers');
    }
    if (flow_rate_m3_h < 0) {
        throw new RangeError('flow_rate_m3_h must be >= 0');
    }
    if (room_volume_m3 <= 0) {
        throw new RangeError('room_volume_m3 must be > 0');
    }

    const ach = flow_rate_m3_h / room_volume_m3;
    return { ach };
}

/**
 * Compute steady-state indoor contaminant concentration (mass balance, well-mixed room model).
 * Calcula a concentração de contaminante em regime estacionário (balanço de massa, modelo de cômodo bem misturado).
 * C_ss = E / (ACH × V)  where E = emission rate [µg/h], ACH [h⁻¹], V [m³].
 *
 * @param {number} emission_rate_ug_h - Pollutant emission rate E (µg/h).
 *   Taxa de emissão do poluente E (µg/h).
 * @param {number} air_change_rate_h - Air change rate ACH (h⁻¹). Must be > 0.
 *   Taxa de troca de ar ACH (h⁻¹). Deve ser > 0.
 * @param {number} room_volume_m3 - Room volume V (m³). Must be > 0.
 *   Volume do cômodo V (m³). Deve ser > 0.
 * @returns {{ concentration_ug_m3: number }}
 *   Steady-state concentration (µg/m³).
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If emission_rate_ug_h < 0 or air_change_rate_h/room_volume_m3 <= 0.
 */
export function computeSteadyStateConcentration(emission_rate_ug_h: any, air_change_rate_h: any, room_volume_m3: any) {
    if (
        !Number.isFinite(emission_rate_ug_h) ||
        !Number.isFinite(air_change_rate_h) ||
        !Number.isFinite(room_volume_m3)
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (emission_rate_ug_h < 0) {
        throw new RangeError('emission_rate_ug_h must be >= 0');
    }
    if (air_change_rate_h <= 0) {
        throw new RangeError('air_change_rate_h must be > 0');
    }
    if (room_volume_m3 <= 0) {
        throw new RangeError('room_volume_m3 must be > 0');
    }

    // Regime estacionário: taxa de emissão = taxa de remoção por ventilação
    const concentration_ug_m3 = emission_rate_ug_h / (air_change_rate_h * room_volume_m3);
    return { concentration_ug_m3 };
}

/**
 * Compute indoor contaminant concentration decay after emission source is removed (exponential decay).
 * Calcula o decaimento da concentração de contaminante interno após remoção da fonte (decaimento exponencial).
 * C(t) = C₀ × exp(-ACH × t)
 *
 * @param {number} initial_ug_m3 - Initial concentration C₀ (µg/m³). Must be >= 0.
 *   Concentração inicial C₀ (µg/m³). Deve ser >= 0.
 * @param {number} air_change_rate_h - Air change rate ACH (h⁻¹). Must be > 0.
 *   Taxa de troca de ar ACH (h⁻¹). Deve ser > 0.
 * @param {number} time_h - Elapsed time t (h). Must be >= 0.
 *   Tempo decorrido t (h). Deve ser >= 0.
 * @returns {{ concentration_ug_m3: number }}
 *   Concentration at time t (µg/m³).
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If initial_ug_m3 or time_h < 0, or air_change_rate_h <= 0.
 */
export function computeDecayConcentration(initial_ug_m3: any, air_change_rate_h: any, time_h: any) {
    if (!Number.isFinite(initial_ug_m3) || !Number.isFinite(air_change_rate_h) || !Number.isFinite(time_h)) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (initial_ug_m3 < 0) {
        throw new RangeError('initial_ug_m3 must be >= 0');
    }
    if (air_change_rate_h <= 0) {
        throw new RangeError('air_change_rate_h must be > 0');
    }
    if (time_h < 0) {
        throw new RangeError('time_h must be >= 0');
    }

    const concentration_ug_m3 = initial_ug_m3 * Math.exp(-air_change_rate_h * time_h);
    return { concentration_ug_m3 };
}

/**
 * Assess indoor air quality risk by comparing concentration to WHO guidelines.
 * Avalia o risco de qualidade do ar interno comparando a concentração com as diretrizes da OMS.
 *
 * @param {number} concentration_ug_m3 - Measured or predicted pollutant concentration (µg/m³). Must be >= 0.
 *   Concentração medida ou estimada do poluente (µg/m³). Deve ser >= 0.
 * @param {'benzene'|'formaldehyde'|'PM25'|'CO'} pollutant - Pollutant identifier.
 *   Identificador do poluente.
 * @param {number} exposure_hours_day - Daily exposure duration (h/day). Must be in (0, 24].
 *   Duração da exposição diária (h/dia). Deve estar em (0, 24].
 * @returns {{ normalized: number, category: 'acceptable'|'moderate'|'hazardous', guideline_ug_m3: number }}
 *   Normalized concentration (C / guideline), risk category, and applicable guideline.
 * @throws {TypeError} If inputs have wrong types.
 * @throws {RangeError} If concentration_ug_m3 < 0, pollutant unsupported, or exposure_hours_day invalid.
 */
export function assessIndoorAirRisk(concentration_ug_m3: any, pollutant: any, exposure_hours_day: any) {
    if (!Number.isFinite(concentration_ug_m3) || !Number.isFinite(exposure_hours_day)) {
        throw new TypeError('concentration_ug_m3 and exposure_hours_day must be finite numbers');
    }
    if (concentration_ug_m3 < 0) {
        throw new RangeError('concentration_ug_m3 must be >= 0');
    }

    const VALID_POLLUTANTS = Object.keys(WHO_GUIDELINES_UG_M3);
    if (!VALID_POLLUTANTS.includes(pollutant)) {
        throw new RangeError(`pollutant must be one of: ${VALID_POLLUTANTS.join(', ')}`);
    }
    if (exposure_hours_day <= 0 || exposure_hours_day > 24) {
        throw new RangeError('exposure_hours_day must be in (0, 24]');
    }

const guideline_ug_m3 = (WHO_GUIDELINES_UG_M3 as any)[pollutant];

    // Fator de exposição parcial: corrige pelo tempo de exposição relativo ao dia completo (24h)
    const exposure_fraction = exposure_hours_day / 24;
    const normalized = (concentration_ug_m3 * exposure_fraction) / guideline_ug_m3;

    /** @type {'acceptable'|'moderate'|'hazardous'} */
    let category;
    if (normalized <= 1) {
        category = 'acceptable';
    } else if (normalized <= 2) {
        category = 'moderate';
    } else {
        category = 'hazardous';
    }

    return { normalized, category, guideline_ug_m3 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const indoorAirDispersionMeta = {
    name: 'indoorAirDispersion',
    description: 'indoorAirDispersion',
    category: 'analytics',
    familyTags: ['air', 'fate_transport'],
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
