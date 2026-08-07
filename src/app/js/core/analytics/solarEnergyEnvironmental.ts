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
// Application: EHS & Mining - Solar Energy Environmental Impact
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Solar Energy Environmental Impact Assessment
 *
 * Módulo puro para análise de impacto ambiental de sistemas fotovoltaicos:
 * irradiância extraterrestre, potência PV, uso do solo e CO2 do ciclo de vida.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Spencer, J. W. (1971). "Fourier series representation of the position
 *     of the sun." Search, 2(5), 172. (solar irradiance extraterrestrial model)
 *   - IEA PVPS (2020). Life Cycle Assessment of Future Photovoltaic Electricity
 *     Production from Residential-Scale Systems Operated in Europe. IEA PVPS
 *     Task 12. Report T12-21:2020. (lifecycle CO2 reference)
 *   - NREL (2023). System Advisor Model (SAM). National Renewable Energy
 *     Laboratory, Golden, CO. https://sam.nrel.gov/ (PV performance modeling)
 */

/** Solar constant (W/m²) / Constante solar (W/m²) */
const SOLAR_CONSTANT_W_M2 = 1367;

/** Default grid emission factor (kg CO2/kWh) / Fator de emissão da rede padrão */
const DEFAULT_GRID_EF_KG_KWH = 0.5;

/** Default PV power density for utility-scale (kW/ha) / Densidade de potência utility-scale padrão */
const DEFAULT_POWER_DENSITY_KW_HA = 50;

/** Default temperature coefficient (%/°C) / Coeficiente de temperatura padrão */
const DEFAULT_TEMP_COEFF = -0.004;

/**
 * Compute extraterrestrial solar irradiance using Spencer (1971).
 * Calcula a irradiância solar extraterrestre pelo método de Spencer (1971).
 *
 * Formula: I = I_sc × (1 + 0.033×cos(360°×n/365)) × cos(θ_z)
 *   where θ_z = zenith angle, n = day of year
 *
 * @param {number} latitude_deg - Site latitude (degrees, -90 to 90) / Latitude do local (graus)
 * @param {number} dayOfYear - Julian day (1–365) / Dia do ano (1–365)
 * @param {number} hourAngle_deg - Hour angle (degrees, -180 to 180) / Ângulo horário (graus)
 * @returns {{ irradiance_W_m2: number }} Extraterrestrial irradiance result
 * @throws {RangeError} If any input is out of valid range
 */
export function computeSolarIrradiance(latitude_deg: number, dayOfYear: number, hourAngle_deg: number): { irradiance_W_m2: number } {
    if (typeof latitude_deg !== 'number' || typeof dayOfYear !== 'number' || typeof hourAngle_deg !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (latitude_deg < -90 || latitude_deg > 90) {
        throw new RangeError('latitude_deg must be in [-90, 90]');
    }
    if (dayOfYear < 1 || dayOfYear > 365) {
        throw new RangeError('dayOfYear must be in [1, 365]');
    }
    if (hourAngle_deg < -180 || hourAngle_deg > 180) {
        throw new RangeError('hourAngle_deg must be in [-180, 180]');
    }

        const toRad = (deg: number) => (deg * Math.PI) / 180;

    // Declination angle by Spencer (1971) Fourier series / Declinação solar de Spencer
    const B = toRad((360 * (dayOfYear - 1)) / 365);
    const declination_rad =
        0.006918 -
        0.399912 * Math.cos(B) +
        0.070257 * Math.sin(B) -
        0.006758 * Math.cos(2 * B) +
        0.000907 * Math.sin(2 * B) -
        0.002697 * Math.cos(3 * B) +
        0.00148 * Math.sin(3 * B);

    // Eccentricity correction factor / Fator de correção de excentricidade
    const eccentricity =
        1.00011 +
        0.034221 * Math.cos(B) +
        0.00128 * Math.sin(B) +
        0.000719 * Math.cos(2 * B) +
        0.000077 * Math.sin(2 * B);

    // Zenith angle: cos(θ_z) = sin(lat)×sin(dec) + cos(lat)×cos(dec)×cos(ω)
    const lat_rad = toRad(latitude_deg);
    const ha_rad = toRad(hourAngle_deg);
    const cosZenith =
        Math.sin(lat_rad) * Math.sin(declination_rad) +
        Math.cos(lat_rad) * Math.cos(declination_rad) * Math.cos(ha_rad);

    // Irradiance is zero when sun is below horizon / Irradiância nula abaixo do horizonte
    const irradiance_W_m2 = Math.max(0, SOLAR_CONSTANT_W_M2 * eccentricity * cosZenith);
    return { irradiance_W_m2 };
}

/**
 * Compute PV panel power output with temperature derating.
 * Calcula potência de saída do painel FV com redução por temperatura.
 *
 * Formula: P = G × A × η × (1 + γ × (T - 25))
 *   where G = irradiance (W/m²), A = area (m²), η = efficiency, γ = temp. coeff (/°C)
 *
 * @param {number} irradiance_W_m2 - Plane-of-array irradiance (W/m²) / Irradiância no plano do painel (W/m²)
 * @param {number} panelArea_m2 - Total panel area (m²) / Área total do painel (m²)
 * @param {number} efficiency - Panel efficiency (0–1) / Eficiência do painel (0–1)
 * @param {number} [temperatureCoeff=-0.004] - Temperature coefficient (/°C) / Coeficiente de temperatura (/°C)
 * @param {number} [moduleTemp_C=25] - Module temperature (°C) / Temperatura do módulo (°C)
 * @returns {{ power_kW: number, derating_pct: number }} Power output and temperature derating
 * @throws {RangeError} If inputs are out of valid range
 */
export function computePVPowerOutput(irradiance_W_m2: number, panelArea_m2: number, efficiency: number, temperatureCoeff: number = DEFAULT_TEMP_COEFF, moduleTemp_C: number = 25): { power_kW: number, derating_pct: number } {
    if (typeof irradiance_W_m2 !== 'number' || typeof panelArea_m2 !== 'number' || typeof efficiency !== 'number') {
        throw new TypeError('irradiance_W_m2, panelArea_m2 and efficiency must be numbers');
    }
    if (irradiance_W_m2 < 0) throw new RangeError('irradiance_W_m2 must be >= 0');
    if (panelArea_m2 <= 0) throw new RangeError('panelArea_m2 must be > 0');
    if (efficiency <= 0 || efficiency > 1) throw new RangeError('efficiency must be in (0, 1]');

    // Fator de redução por temperatura / Temperature derating factor
    const tempFactor = 1 + temperatureCoeff * (moduleTemp_C - 25);
    const derating_pct = (1 - tempFactor) * 100;

    // Potência em Watts, convertida para kW
    const power_kW = (irradiance_W_m2 * panelArea_m2 * efficiency * tempFactor) / 1000;
    return { power_kW: Math.max(0, power_kW), derating_pct };
}

/**
 * Compute land use impact of a solar installation.
 * Calcula o impacto de uso do solo de uma instalação solar.
 *
 * Formula: A = capacity_kW / powerDensity_kW_ha
 *
 * @param {number} installedCapacity_kW - Installed capacity (kW) / Capacidade instalada (kW)
 * @param {number} [powerDensity_kW_ha=50] - Power density (kW/ha) / Densidade de potência (kW/ha)
 * @returns {{ area_ha: number, areaPerMW_ha: number }} Land use metrics
 * @throws {RangeError} If inputs are out of valid range
 */
export function computeLandUseImpact(installedCapacity_kW: number, powerDensity_kW_ha: number = DEFAULT_POWER_DENSITY_KW_HA): { area_ha: number, areaPerMW_ha: number } {
    if (typeof installedCapacity_kW !== 'number') throw new TypeError('installedCapacity_kW must be a number');
    if (installedCapacity_kW <= 0) throw new RangeError('installedCapacity_kW must be > 0');
    if (powerDensity_kW_ha <= 0) throw new RangeError('powerDensity_kW_ha must be > 0');

    // Área ocupada em hectares / Land area in hectares
    const area_ha = installedCapacity_kW / powerDensity_kW_ha;
    // Área por MW instalado / Area per MW installed
    const areaPerMW_ha = (area_ha * 1000) / installedCapacity_kW;
    return { area_ha, areaPerMW_ha };
}

/**
 * Compute net lifecycle CO2 avoided by a PV system.
 * Calcula o CO2 líquido evitado no ciclo de vida de um sistema FV.
 *
 * avoided = capacity × cf × 8760 × years × gridEF / 1000 - embodied
 * paybackYears = embodied / annual_avoided
 *
 * @param {number} capacity_kW - Installed capacity (kW) / Capacidade instalada (kW)
 * @param {number} capacityFactor - Capacity factor (0–1) / Fator de capacidade (0–1)
 * @param {number} lifetimeYears - System lifetime (years) / Vida útil do sistema (anos)
 * @param {number} embodiedCO2_kgCO2_kWp - Embodied CO2 from manufacturing (kg CO2/kWp) / CO2 incorporado na fabricação (kg CO2/kWp)
 * @param {number} [gridEF=0.5] - Grid emission factor (kg CO2/kWh) / Fator de emissão da rede (kg CO2/kWh)
 * @returns {{ netAvoided_tCO2: number, paybackYears: number }} Lifecycle CO2 results
 * @throws {RangeError} If inputs are out of valid range
 */
export function computeLifecycleCO2(capacity_kW: number, capacityFactor: number, lifetimeYears: number, embodiedCO2_kgCO2_kWp: number, gridEF: number = DEFAULT_GRID_EF_KG_KWH): { netAvoided_tCO2: number, paybackYears: number } {
    if (
        typeof capacity_kW !== 'number' ||
        typeof capacityFactor !== 'number' ||
        typeof lifetimeYears !== 'number' ||
        typeof embodiedCO2_kgCO2_kWp !== 'number'
    ) {
        throw new TypeError('All primary parameters must be numbers');
    }
    if (capacity_kW <= 0) throw new RangeError('capacity_kW must be > 0');
    if (capacityFactor <= 0 || capacityFactor > 1) throw new RangeError('capacityFactor must be in (0, 1]');
    if (lifetimeYears <= 0) throw new RangeError('lifetimeYears must be > 0');
    if (embodiedCO2_kgCO2_kWp < 0) throw new RangeError('embodiedCO2_kgCO2_kWp must be >= 0');
    if (gridEF <= 0) throw new RangeError('gridEF must be > 0');

    // CO2 evitado anual (t CO2/ano) / Annual avoided CO2 (t CO2/year)
    const annualAvoided_tCO2 = (capacity_kW * capacityFactor * 8760 * gridEF) / 1000;
    // CO2 incorporado na fabricação (t CO2) / Embodied CO2 in manufacturing (t CO2)
    const embodied_tCO2 = (embodiedCO2_kgCO2_kWp * capacity_kW) / 1000;
    // CO2 líquido evitado no ciclo de vida (t CO2) / Net lifecycle avoided CO2 (t CO2)
    const netAvoided_tCO2 = annualAvoided_tCO2 * lifetimeYears - embodied_tCO2;
    // Tempo de retorno de carbono (anos) / Carbon payback period (years)
    const paybackYears = annualAvoided_tCO2 > 0 ? embodied_tCO2 / annualAvoided_tCO2 : Infinity;

    return { netAvoided_tCO2, paybackYears };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {Object}
 */
export const solarEnergyEnvironmentalMeta = {
    name: 'solarEnergyEnvironmental',
    description: 'Solar Energy Environmental Impact',
    category: 'analytics',
    familyTags: ['energy'],
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
