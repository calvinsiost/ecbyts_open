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
// VOC Emission Factors
// Fatores de emissao de compostos organicos volateis (VOC)
// Refs: EPA AP-42 (2021); EPA (1995) Protocol for Equipment Leak; CONAMA 382/2006; CETESB (2012)

'use strict';

const R_GAS = 8.314;
const K_M_BASE = 0.0292;

/**
 * Computes evaporative VOC emission from storage tank or open surface.
 * Calcula taxa de emissao evaporativa de VOC (modelo EPA AP-42 Ch.7).
 * E = K_M_BASE * (Pv/(R*T)) * MW * A * u^0.78
 * @param {number} vapor_pressure_kPa @param {number} molecular_weight (g/mol)
 * @param {number} area_m2 @param {number} temperature_c @param {number} wind_speed_m_s
 * @returns {{ emission_rate_g_s: number, emission_kg_hr: number }}
 * @throws {RangeError} Se parametros invalidos.
 */
export function computeEvaporativeEmission(
    vapor_pressure_kPa: any,
    molecular_weight: any,
    area_m2: any,
    temperature_c: any,
    wind_speed_m_s: any,
) {
    if (
        [vapor_pressure_kPa, molecular_weight, area_m2, temperature_c, wind_speed_m_s].some(
            (v) => typeof v !== 'number',
        )
    )
        throw new TypeError('All parameters must be numbers');
    if (vapor_pressure_kPa <= 0) throw new RangeError('vapor_pressure_kPa must be > 0');
    if (molecular_weight <= 0) throw new RangeError('molecular_weight must be > 0');
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');
    if (wind_speed_m_s < 0) throw new RangeError('wind_speed_m_s must be >= 0');
    const T_K = temperature_c + 273.15;
    // Concentracao de saturacao: Cs = Pv/(RT) * MW (g/m3)
    const C_s = ((vapor_pressure_kPa * 1000) / (R_GAS * T_K)) * molecular_weight;
    // Fator de vento u^0.78; usa 1.0 quando vento = 0 para evitar NaN
    const u_factor = wind_speed_m_s > 0 ? Math.pow(wind_speed_m_s, 0.78) : 1;
    const emission_rate_g_s = K_M_BASE * C_s * area_m2 * u_factor;
    return { emission_rate_g_s, emission_kg_hr: emission_rate_g_s * 3.6 };
}

/**
 * Computes fugitive VOC emission from equipment leaks.
 * Calcula emissao fugitiva de VOC por vazamentos em equipamentos.
 * E_total = leak_rate * component_count * voc_fraction
 * @param {number} leak_rate_kg_hr @param {number} component_count @param {number} voc_fraction [0,1]
 * @returns {{ total_kg_hr: number, total_t_yr: number }}
 * @throws {RangeError} Se negativos ou voc_fraction fora de [0,1].
 */
export function computeFugitiveEmission(leak_rate_kg_hr: any, component_count: any, voc_fraction: any) {
    if ([leak_rate_kg_hr, component_count, voc_fraction].some((v) => typeof v !== 'number'))
        throw new TypeError('leak_rate_kg_hr, component_count and voc_fraction must be numbers');
    if (leak_rate_kg_hr < 0) throw new RangeError('leak_rate_kg_hr must be >= 0');
    if (component_count < 0) throw new RangeError('component_count must be >= 0');
    if (voc_fraction < 0 || voc_fraction > 1) throw new RangeError('voc_fraction must be in [0, 1]');
    const total_kg_hr = leak_rate_kg_hr * component_count * voc_fraction;
    // 8760 h/yr; /1000 para t/yr
    return { total_kg_hr, total_t_yr: (total_kg_hr * 8760) / 1000 };
}

/**
 * Computes stack VOC emission from a continuous point source.
 * Calcula emissao de VOC de chamine/fonte pontual continua.
 * E = Q * C / 1000 (g/s); annual = E * op_hours * 3600 / 1e6 (t/yr)
 * @param {number} flow_rate_m3_s @param {number} concentration_mg_m3 @param {number} operating_hours_yr
 * @returns {{ mass_flow_g_s: number, annual_t_yr: number }}
 * @throws {RangeError} Se parametros invalidos.
 */
export function computeStackEmission(flow_rate_m3_s: any, concentration_mg_m3: any, operating_hours_yr: any) {
    if ([flow_rate_m3_s, concentration_mg_m3, operating_hours_yr].some((v) => typeof v !== 'number'))
        throw new TypeError('flow_rate_m3_s, concentration_mg_m3 and operating_hours_yr must be numbers');
    if (flow_rate_m3_s <= 0) throw new RangeError('flow_rate_m3_s must be > 0');
    if (concentration_mg_m3 < 0) throw new RangeError('concentration_mg_m3 must be >= 0');
    if (operating_hours_yr <= 0) throw new RangeError('operating_hours_yr must be > 0');
    if (operating_hours_yr > 8760) throw new RangeError('operating_hours_yr must be <= 8760');
    // Fluxo massico: Q(m3/s) * C(mg/m3) / 1000 = g/s
    const mass_flow_g_s = (flow_rate_m3_s * concentration_mg_m3) / 1000;
    return { mass_flow_g_s, annual_t_yr: (mass_flow_g_s * operating_hours_yr * 3600) / 1e6 };
}

/**
 * Classifies emission source per EPA Clean Air Act Title V thresholds.
 * Classifica fonte de emissao conforme limiares EPA CAA Titulo V.
 * HAP: major >= 10 t/yr; VOC/criteria: title_V >= 100, major >= 50, synthetic_minor >= 10.
 * @param {number} annual_t_yr @param {'HAP'|'VOC'|'criteria'} pollutant_type
 * @returns {{ category: 'minor'|'major'|'synthetic_minor'|'title_V', reporting_required: boolean }}
 * @throws {RangeError} Se annual_t_yr negativo. @throws {TypeError} Se pollutant_type invalido.
 */
export function classifyEmissionSource(annual_t_yr: any, pollutant_type: any) {
    if (typeof annual_t_yr !== 'number') throw new TypeError('annual_t_yr must be a number');
    if (annual_t_yr < 0) throw new RangeError('annual_t_yr must be >= 0');
    if (!['HAP', 'VOC', 'criteria'].includes(pollutant_type))
        throw new TypeError('pollutant_type must be HAP, VOC or criteria');
    /** @type {'minor'|'major'|'synthetic_minor'|'title_V'} */
    let category;
    /** @type {boolean} */
    let reporting_required;
    if (pollutant_type === 'HAP') {
        if (annual_t_yr >= 10) {
            category = 'major';
            reporting_required = true;
        } else if (annual_t_yr >= 1) {
            category = 'synthetic_minor';
            reporting_required = true;
        } else {
            category = 'minor';
            reporting_required = false;
        }
    } else {
        if (annual_t_yr >= 100) {
            category = 'title_V';
            reporting_required = true;
        } else if (annual_t_yr >= 50) {
            category = 'major';
            reporting_required = true;
        } else if (annual_t_yr >= 10) {
            category = 'synthetic_minor';
            reporting_required = true;
        } else {
            category = 'minor';
            reporting_required = false;
        }
    }
    return { category, reporting_required };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const vocEmissionFactorsMeta = {
    name: 'vocEmissionFactors',
    description: 'vocEmissionFactors',
    category: 'analytics',
    familyTags: ['vapor'],
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
