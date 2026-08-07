// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Sediment Oxygen Demand - benthic SOD flux, nutrient release, and thermal stratification
// Demanda de oxigênio do sedimento - fluxo SOD bentônico, liberação de nutrientes e estratificação térmica

'use strict';

/** Densidade de sedimento seco assumida (kg/m³) — padrão limnológico */
const SEDIMENT_DENSITY_KG_M3 = 2650;

/** Aceleração gravitacional (m/s²) */
const G = 9.81;

interface SODFluxResult { o2_consumed_g_day: number; depletion_rate_mg_L_day: number; }

/**
 * Compute the oxygen depletion rate caused by sediment oxygen demand (SOD) in a water body.
 * Calcula a taxa de depleção de oxigênio causada pela demanda de oxigênio do sedimento (SOD).
 *
 * O2_consumed (g/day) = sod_rate × area_m2
 * depletion_rate (mg/L/day) = O2_consumed / (water_volume_m3 × 1000 L/m³) × 1000 mg/g
 *
 * @param {number} sod_rate_g_m2_day - Benthic SOD rate (g O2 / m² / day)
 * @param {number} area_m2 - Sediment area in contact with water (m²)
 * @param {number} water_volume_m3 - Overlying water volume (m³)
 * @returns {{ o2_consumed_g_day: number, depletion_rate_mg_L_day: number }}
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If any input is negative, or water_volume_m3 = 0
 *
 * Refs:
 *   Bowie et al. (1985) Rates, Constants, and Kinetics Formulations EPA/600/3-85/040.
 *   Chapra (1997) Surface Water Quality Modeling, McGraw-Hill.
 */
export function computeSODFlux(sod_rate_g_m2_day: number, area_m2: number, water_volume_m3: number): SODFluxResult {
    if (!Number.isFinite(sod_rate_g_m2_day) || !Number.isFinite(area_m2) || !Number.isFinite(water_volume_m3)) {
        throw new TypeError('computeSODFlux: all inputs must be finite numbers');
    }
    if (sod_rate_g_m2_day < 0 || area_m2 < 0) {
        throw new RangeError('computeSODFlux: sod_rate_g_m2_day and area_m2 must be >= 0');
    }
    if (water_volume_m3 <= 0) {
        throw new RangeError('computeSODFlux: water_volume_m3 must be > 0');
    }
    const o2_consumed_g_day = sod_rate_g_m2_day * area_m2;
    // depleção (mg/L/d) = (g/d) / (m³ × 1000 L/m³) × 1000 mg/g = g/d / volume_L
    const depletion_rate_mg_L_day = (o2_consumed_g_day / (water_volume_m3 * 1000)) * 1000;
    return { o2_consumed_g_day, depletion_rate_mg_L_day };
}

interface NutrientReleaseResult { tp_flux_mg_m2_day: number; tn_flux_mg_m2_day: number; }

/**
 * Compute diffusive nutrient flux from sediment pore water to the overlying water column.
 * Calcula o fluxo difusivo de nutrientes da água intersticial do sedimento para a coluna d'água.
 *
 * Approximation using Fick's first law:
 *   flux (mg/m²/day) = D × (C_sed - C_water) / thickness
 *   C_sed (mg/L) = sediment_conc_mg_kg × (1 - porosity) × SEDIMENT_DENSITY / 1e6 × 1000
 *
 * Nota: C_water assume 0 (condição mais conservadora - máximo gradiente de difusão)
 *
 * @param {number} sediment_tp_mg_kg - Sediment total phosphorus (mg P / kg dry sediment)
 * @param {number} sediment_tn_mg_kg - Sediment total nitrogen (mg N / kg dry sediment)
 * @param {number} porosity - Sediment porosity (dimensionless, 0–1)
 * @param {number} diffusion_coefficient_m2_day - Effective diffusion coefficient (m²/day)
 * @param {number} thickness_m - Active sediment layer thickness (m)
 * @returns {{ tp_flux_mg_m2_day: number, tn_flux_mg_m2_day: number }}
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If porosity not in [0,1] or thickness_m <= 0 or negatives
 *
 * Refs:
 *   Bowie et al. (1985) EPA/600/3-85/040, Table 4.3.
 *   Chapra (1997) §21 - Sediment Diagenesis.
 */
export function computeNutrientRelease(
    sediment_tp_mg_kg: number,
    sediment_tn_mg_kg: number,
    porosity: number,
    diffusion_coefficient_m2_day: number,
    thickness_m: number,
): NutrientReleaseResult {
    if (
        !Number.isFinite(sediment_tp_mg_kg) ||
        !Number.isFinite(sediment_tn_mg_kg) ||
        !Number.isFinite(porosity) ||
        !Number.isFinite(diffusion_coefficient_m2_day) ||
        !Number.isFinite(thickness_m)
    ) {
        throw new TypeError('computeNutrientRelease: all inputs must be finite numbers');
    }
    if (sediment_tp_mg_kg < 0 || sediment_tn_mg_kg < 0 || diffusion_coefficient_m2_day < 0) {
        throw new RangeError('computeNutrientRelease: sediment concentrations and diffusion_coefficient must be >= 0');
    }
    if (porosity < 0 || porosity > 1) {
        throw new RangeError('computeNutrientRelease: porosity must be in [0, 1]');
    }
    if (thickness_m <= 0) {
        throw new RangeError('computeNutrientRelease: thickness_m must be > 0');
    }

    // Concentração no sedimento (mg/L de água intersticial):
    // C_sed (mg/L) = conc_mg_kg × (1-porosidade) × densidade_kg/m³ / (1e6 mg/kg × 1e-3 m³/L)
    // Simplificando: mg/kg × (1-p) × ρ [kg/m³] × 1e-3 [m³/L] / 1e-3 = mg/kg × (1-p) × ρ / 1e3 → mg/L
    const solidFraction = 1 - porosity;
    const c_tp_mg_L = (sediment_tp_mg_kg * solidFraction * SEDIMENT_DENSITY_KG_M3) / 1e6;
    const c_tn_mg_L = (sediment_tn_mg_kg * solidFraction * SEDIMENT_DENSITY_KG_M3) / 1e6;

    // Fluxo de Fick (mg/m²/dia) = D (m²/dia) × ΔC (mg/L) / espessura (m) × 1000 L/m³
    // A × 1000 converte mg/L/m × m²/dia em mg/m²/dia corretamente
    const tp_flux_mg_m2_day = (diffusion_coefficient_m2_day * c_tp_mg_L * 1000) / thickness_m;
    const tn_flux_mg_m2_day = (diffusion_coefficient_m2_day * c_tn_mg_L * 1000) / thickness_m;

    return { tp_flux_mg_m2_day, tn_flux_mg_m2_day };
}

interface ThermalStratificationResult { thermocline_strength: number; stratified: boolean; schmidt_stability: number; }

/**
 * Estimate thermal stratification indicators for a lake or reservoir.
 * Estima indicadores de estratificação térmica para um lago ou reservatório.
 *
 * thermocline_strength = (T_surface - T_bottom) / depth  (°C/m)
 * stratified if ΔT/depth > 1°C/m (approximation)
 * Schmidt stability (simplified): SS ≈ g × ρ_diff × depth² / 2  (J/m²)
 *   where ρ_diff = ρ(T_bottom) - ρ(T_surface) using freshwater density approximation
 *   ρ(T) ≈ 1000 × (1 - (T - 4)² / 119500)  (T in °C, valid 0–30°C)
 *
 * @param {number} surface_temp_c - Surface water temperature (°C)
 * @param {number} bottom_temp_c - Bottom water temperature (°C)
 * @param {number} depth_m - Mean water depth (m)
 * @returns {{ thermocline_strength: number, stratified: boolean, schmidt_stability: number }}
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If depth_m <= 0 or temperatures out of physical range
 *
 * Refs:
 *   Idso (1973) Limnol. Oceanogr. 18(4):681-683 - Schmidt stability.
 *   Chapra (1997) §2 - Lake Thermal Structure.
 */
export function computeThermalStratification(surface_temp_c: number, bottom_temp_c: number, depth_m: number): ThermalStratificationResult {
    if (!Number.isFinite(surface_temp_c) || !Number.isFinite(bottom_temp_c) || !Number.isFinite(depth_m)) {
        throw new TypeError('computeThermalStratification: all inputs must be finite numbers');
    }
    if (depth_m <= 0) {
        throw new RangeError('computeThermalStratification: depth_m must be > 0');
    }
    if (surface_temp_c < -2 || surface_temp_c > 40 || bottom_temp_c < -2 || bottom_temp_c > 40) {
        throw new RangeError('computeThermalStratification: temperatures must be in [-2, 40] °C');
    }

    // Força da termoclina: gradiente vertical de temperatura
    const thermocline_strength = (surface_temp_c - bottom_temp_c) / depth_m;
    const stratified = Math.abs(thermocline_strength) > 1;

    // Densidade da água doce (kg/m³): aproximação de Schmidt (1915) / Chapra
    // ρ(T) ≈ 1000 × (1 - (T-4)²/119500)
    const rhoSurf = 1000 * (1 - Math.pow(surface_temp_c - 4, 2) / 119500);
    const rhoBott = 1000 * (1 - Math.pow(bottom_temp_c - 4, 2) / 119500);

    // Estabilidade de Schmidt simplificada (J/m²):
    // SS = g × (ρ_bottom - ρ_surface) × depth² / 2  [aproximação de duas camadas]
    const schmidt_stability = (G * (rhoBott - rhoSurf) * (depth_m * depth_m)) / 2;

    return { thermocline_strength, stratified, schmidt_stability };
}

interface BenthicStatusResult { status: string; eutrophication_risk: string; }

/**
 * Classify benthic ecological status based on SOD rate and nutrient flux.
 * Classifica o estado ecológico bentônico com base na taxa de SOD e no fluxo de nutrientes.
 *
 * Classification follows EU Water Framework Directive (WFD 2000/60/CE) inspired thresholds:
 *   good:     SOD < 1 g/m²/d AND TP_flux < 5 mg/m²/d
 *   moderate: SOD < 2 g/m²/d AND TP_flux < 10 mg/m²/d
 *   poor:     SOD < 5 g/m²/d OR TP_flux < 20 mg/m²/d
 *   bad:      SOD >= 5 g/m²/d OR TP_flux >= 20 mg/m²/d
 *
 * Eutrophication risk based on TP flux (major driver for algal blooms).
 *
 * @param {number} sod_rate_g_m2_day - Benthic SOD rate (g O2 / m² / day)
 * @param {number} nutrient_flux_tp_mg_m2_day - TP flux from sediment (mg P / m² / day)
 * @returns {{ status: string, eutrophication_risk: string }}
 * @throws {TypeError} If inputs are not finite numbers
 * @throws {RangeError} If any input is negative
 *
 * Refs: EU WFD 2000/60/CE; Chapra (1997) §25 - Eutrophication.
 */
export function classifyBenthicStatus(sod_rate_g_m2_day: number, nutrient_flux_tp_mg_m2_day: number): BenthicStatusResult {
    if (!Number.isFinite(sod_rate_g_m2_day) || !Number.isFinite(nutrient_flux_tp_mg_m2_day)) {
        throw new TypeError('classifyBenthicStatus: inputs must be finite numbers');
    }
    if (sod_rate_g_m2_day < 0 || nutrient_flux_tp_mg_m2_day < 0) {
        throw new RangeError('classifyBenthicStatus: inputs must be >= 0');
    }

    let status: string;
    if (sod_rate_g_m2_day >= 5 || nutrient_flux_tp_mg_m2_day >= 20) {
        status = 'bad';
    } else if (sod_rate_g_m2_day >= 2 || nutrient_flux_tp_mg_m2_day >= 10) {
        status = 'poor';
    } else if (sod_rate_g_m2_day >= 1 || nutrient_flux_tp_mg_m2_day >= 5) {
        status = 'moderate';
    } else {
        status = 'good';
    }

    let eutrophication_risk: string;
    if (nutrient_flux_tp_mg_m2_day >= 10) {
        eutrophication_risk = 'high';
    } else if (nutrient_flux_tp_mg_m2_day >= 5) {
        eutrophication_risk = 'moderate';
    } else {
        eutrophication_risk = 'low';
    }

    return { status, eutrophication_risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const sedimentOxygenDemandMeta = {
    name: 'sedimentOxygenDemand',
    description: 'sedimentOxygenDemand',
    category: 'analytics',
    familyTags: ['sediment'],
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
