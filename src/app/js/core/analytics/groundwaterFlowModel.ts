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
// Groundwater Flow Model - Darcy's Law, hydraulic gradient, well capture zone
// Modelagem de fluxo de água subterrânea - lei de Darcy, gradiente hidráulico, captura de poço.
//
// References / Referências:
//   Darcy, H. (1856) Les fontaines publiques de la ville de Dijon. Dalmont, Paris.
//   Freeze, R.A. & Cherry, J.A. (1979) Groundwater. Prentice-Hall.
//   Bear, J. (1979) Hydraulics of Groundwater. McGraw-Hill.
//   EPA/540/S-92/003 - Well Capture Zone Analysis for Pump-and-Treat Remediation (1992).

'use strict';

const SECONDS_PER_DAY = 86400;

/**
 * Compute Darcy flux (specific discharge) using Darcy's Law: q = K × i.
 * Calcula o fluxo de Darcy (descarga específica) pela Lei de Darcy: q = K × i.
 *
 * @param {number} hydraulic_conductivity_m_s - Saturated hydraulic conductivity K (m/s).
 *   Condutividade hidráulica saturada (m/s). Typical range: 1e-9 (clay) to 1e-2 (gravel).
 * @param {number} hydraulic_gradient - Dimensionless hydraulic gradient i = dh/dl (m/m).
 *   Gradiente hidráulico adimensional (m/m). Typical range: 0.0001–0.1.
 * @returns {{ flux_m_s: number, flux_m_day: number }}
 *   Darcy flux in m/s and m/day.
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If inputs are negative.
 */
export function computeDarcyFlux(hydraulic_conductivity_m_s: any, hydraulic_gradient: any) {
    if (!Number.isFinite(hydraulic_conductivity_m_s) || !Number.isFinite(hydraulic_gradient)) {
        throw new TypeError('hydraulic_conductivity_m_s and hydraulic_gradient must be finite numbers');
    }
    if (hydraulic_conductivity_m_s < 0) {
        throw new RangeError('hydraulic_conductivity_m_s must be >= 0');
    }
    if (hydraulic_gradient < 0) {
        throw new RangeError('hydraulic_gradient must be >= 0');
    }

    const flux_m_s = hydraulic_conductivity_m_s * hydraulic_gradient;
    const flux_m_day = flux_m_s * SECONDS_PER_DAY;

    return { flux_m_s, flux_m_day };
}

/**
 * Compute groundwater seepage velocity (pore velocity) from Darcy flux and effective porosity.
 * Calcula a velocidade real de escoamento (velocidade de poros) a partir do fluxo de Darcy e porosidade efetiva.
 * v = q / ne
 *
 * @param {number} darcy_flux_m_s - Darcy flux (specific discharge) in m/s.
 *   Fluxo de Darcy (descarga específica) em m/s.
 * @param {number} effective_porosity - Effective (drainable) porosity as fraction (0, 1].
 *   Porosidade efetiva (drenável) como fração em (0, 1]. Típico: areia 0.25–0.40, silte 0.10–0.20.
 * @returns {{ velocity_m_s: number, velocity_m_day: number }}
 *   Pore velocity in m/s and m/day.
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If darcy_flux_m_s < 0 or effective_porosity not in (0, 1].
 */
export function computeSeepageVelocity(darcy_flux_m_s: any, effective_porosity: any) {
    if (!Number.isFinite(darcy_flux_m_s) || !Number.isFinite(effective_porosity)) {
        throw new TypeError('darcy_flux_m_s and effective_porosity must be finite numbers');
    }
    if (darcy_flux_m_s < 0) {
        throw new RangeError('darcy_flux_m_s must be >= 0');
    }
    if (effective_porosity <= 0 || effective_porosity > 1) {
        throw new RangeError('effective_porosity must be in (0, 1]');
    }

    const velocity_m_s = darcy_flux_m_s / effective_porosity;
    const velocity_m_day = velocity_m_s * SECONDS_PER_DAY;

    return { velocity_m_s, velocity_m_day };
}

/**
 * Compute well capture zone geometry for pump-and-treat systems (EPA/540/S-92/003).
 * Calcula a geometria da zona de captura de poço de bombeamento para remediação pump-and-treat.
 *
 * Maximum width (at x → ±∞): W = Q / (K × b × i)
 * Stagnation point distance (upgradient): x_s = Q / (2π × K × b × i)
 *
 * @param {number} pumping_rate_m3_s - Well pumping rate Q (m³/s).
 *   Vazão de bombeamento do poço Q (m³/s).
 * @param {number} hydraulic_conductivity_m_s - Hydraulic conductivity K (m/s).
 * @param {number} aquifer_thickness_m - Saturated aquifer thickness b (m).
 *   Espessura saturada do aquífero b (m).
 * @param {number} gradient - Ambient hydraulic gradient i (m/m, dimensionless).
 *   Gradiente hidráulico regional i (adimensional).
 * @returns {{ max_width_m: number, stagnation_point_m: number }}
 *   Maximum capture zone half-width (m) and stagnation point distance from well (m).
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If any input is <= 0.
 */
export function computeWellCaptureZone(pumping_rate_m3_s: any, hydraulic_conductivity_m_s: any, aquifer_thickness_m: any, gradient: any) {
    if (
        !Number.isFinite(pumping_rate_m3_s) ||
        !Number.isFinite(hydraulic_conductivity_m_s) ||
        !Number.isFinite(aquifer_thickness_m) ||
        !Number.isFinite(gradient)
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (pumping_rate_m3_s <= 0) {
        throw new RangeError('pumping_rate_m3_s must be > 0');
    }
    if (hydraulic_conductivity_m_s <= 0) {
        throw new RangeError('hydraulic_conductivity_m_s must be > 0');
    }
    if (aquifer_thickness_m <= 0) {
        throw new RangeError('aquifer_thickness_m must be > 0');
    }
    if (gradient <= 0) {
        throw new RangeError('gradient must be > 0');
    }

    // Transmissividade T = K × b
    const T = hydraulic_conductivity_m_s * aquifer_thickness_m;

    // Largura máxima da zona de captura: W = Q / (T × i) - full width (2 × half-width)
    const max_width_m = pumping_rate_m3_s / (T * gradient);

    // Ponto de estagnação a montante: x_s = Q / (2π × T × i)
    const stagnation_point_m = pumping_rate_m3_s / (2 * Math.PI * T * gradient);

    return { max_width_m, stagnation_point_m };
}

/**
 * Compute contaminant travel time accounting for linear sorption retardation.
 * Calcula o tempo de viagem de contaminante com retardamento por sorção linear (R × t = L/v).
 * t = (L × R) / v  where R = retardation factor (R = 1 for conservative tracer).
 *
 * @param {number} distance_m - Travel distance L (m).
 *   Distância de transporte L (m).
 * @param {number} seepage_velocity_m_day - Pore velocity v (m/day).
 *   Velocidade de escoamento em poros v (m/dia).
 * @param {number} retardation_factor - Retardation factor R (dimensionless, ≥ 1).
 *   Fator de retardamento R (adimensional, ≥ 1). R=1 traçador conservativo; R>1 contaminante sorvível.
 * @returns {{ travel_days: number, travel_years: number }}
 *   Travel time in days and years.
 * @throws {TypeError} If inputs are not finite numbers.
 * @throws {RangeError} If distance_m or seepage_velocity_m_day <= 0, or retardation_factor < 1.
 */
export function computeContaminantTravelTime(distance_m: any, seepage_velocity_m_day: any, retardation_factor: any) {
    if (
        !Number.isFinite(distance_m) ||
        !Number.isFinite(seepage_velocity_m_day) ||
        !Number.isFinite(retardation_factor)
    ) {
        throw new TypeError('All parameters must be finite numbers');
    }
    if (distance_m <= 0) {
        throw new RangeError('distance_m must be > 0');
    }
    if (seepage_velocity_m_day <= 0) {
        throw new RangeError('seepage_velocity_m_day must be > 0');
    }
    if (retardation_factor < 1) {
        throw new RangeError('retardation_factor must be >= 1');
    }

    const travel_days = (distance_m * retardation_factor) / seepage_velocity_m_day;
    const travel_years = travel_days / 365.25;

    return { travel_days, travel_years };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const groundwaterFlowModelMeta = {
    name: 'groundwaterFlowModel',
    description: 'groundwaterFlowModel',
    category: 'analytics',
    familyTags: ['groundwater', 'water'],
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
