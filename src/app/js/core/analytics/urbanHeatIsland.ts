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
// Application: EHS & Mining - Urban Heat Island Analysis
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

interface UHIIntensityResult { intensity_C: number; category: string; }
interface GreenCoolingResult { coolingEffect_C: number; optimalCoverage: boolean; }
interface AlbedoEffectResult { surfaceTemp_C: number; coolRoofBenefit_C: (albedoTarget: number) => number; }
interface MitigationStrategyResult { strategies: string[]; priority: string; }

// Stefan-Boltzmann constant (W·m⁻²·K⁻⁴)
// Constante de Stefan-Boltzmann usada no cálculo de temperatura de superfície
const SIGMA = 5.67e-8;

// Albedo alvo para telhados frios conforme EPA (2008)
// eslint-disable-next-line
const COOL_ROOF_ALBEDO_TARGET = 0.65;

/**
 * Computes Urban Heat Island intensity (ΔT) and category.
 * Calcula a intensidade da ilha de calor urbana e sua categoria.
 *
 * ΔT = T_urban − T_rural
 * Categories (Oke 1982):
 *   negligible < 0.5 °C
 *   weak       0.5–2 °C
 *   moderate   2–4 °C
 *   strong     4–6 °C
 *   extreme    ≥ 6 °C
 *
 * @param {number} urbanTemp_C  - Urban air temperature (°C)
 * @param {number} ruralTemp_C  - Rural reference temperature (°C)
 * @returns {{ intensity_C: number, category: string }}
 */
export function computeUHIIntensity(urbanTemp_C: number, ruralTemp_C: number): UHIIntensityResult {
    if (typeof urbanTemp_C !== 'number' || !isFinite(urbanTemp_C)) {
        throw new TypeError('urbanTemp_C must be a finite number');
    }
    if (typeof ruralTemp_C !== 'number' || !isFinite(ruralTemp_C)) {
        throw new TypeError('ruralTemp_C must be a finite number');
    }

    // Intensidade: diferença entre temperatura urbana e rural
    const intensity_C = urbanTemp_C - ruralTemp_C;

    let category: string;
    if (intensity_C < 0.5) {
        category = 'negligible';
    } else if (intensity_C < 2) {
        category = 'weak';
    } else if (intensity_C < 4) {
        category = 'moderate';
    } else if (intensity_C < 6) {
        category = 'strong';
    } else {
        category = 'extreme';
    }

    return { intensity_C, category };
}

/**
 * Computes green infrastructure cooling effect.
 * Calcula o resfriamento proporcionado pela vegetação urbana.
 *
 * ΔT_green = −0.02 × coverage − 0.01 × LAI − latentHeat/100
 * Clamped to [−8, 0] °C (Gill et al. 2007)
 *
 * @param {number} vegetationCoverage_pct - Vegetation coverage (0–100 %)
 * @param {number} leafAreaIndex          - Leaf Area Index (m²/m²)
 * @param {number} latentHeatFlux_W_m2    - Latent heat flux (W/m²)
 * @returns {{ coolingEffect_C: number, optimalCoverage: boolean }}
 */
export function computeGreenCoolingEffect(vegetationCoverage_pct: number, leafAreaIndex: number, latentHeatFlux_W_m2: number): GreenCoolingResult {
    if (typeof vegetationCoverage_pct !== 'number' || vegetationCoverage_pct < 0 || vegetationCoverage_pct > 100) {
        throw new RangeError('vegetationCoverage_pct must be between 0 and 100');
    }
    if (typeof leafAreaIndex !== 'number' || leafAreaIndex < 0) {
        throw new RangeError('leafAreaIndex must be >= 0');
    }
    if (typeof latentHeatFlux_W_m2 !== 'number' || !isFinite(latentHeatFlux_W_m2)) {
        throw new TypeError('latentHeatFlux_W_m2 must be a finite number');
    }

    // Resfriamento combinado de cobertura vegetal, LAI e fluxo latente
    const raw = -0.02 * vegetationCoverage_pct - 0.01 * leafAreaIndex - latentHeatFlux_W_m2 / 100;
    const coolingEffect_C = Math.max(-8, Math.min(0, raw));

    // Cobertura ≥30% considerada ótima conforme Gill et al. (2007)
    const optimalCoverage = vegetationCoverage_pct >= 30;

    return { coolingEffect_C, optimalCoverage };
}

/**
 * Computes surface temperature via Stefan-Boltzmann and cool-roof benefit.
 * Calcula a temperatura de superfície por Stefan-Boltzmann e o benefício do telhado frio.
 *
 * T_s = ((1−α)×G / σ)^0.25 − 273.15
 *
 * @param {number} surfaceAlbedo        - Surface albedo (0–1)
 * @param {number} solarRadiation_W_m2  - Incident solar radiation (W/m²)
 * @returns {{ surfaceTemp_C: number, coolRoofBenefit_C: function }}
 */
export function computeAlbedoEffect(surfaceAlbedo: number, solarRadiation_W_m2: number): AlbedoEffectResult {
    if (typeof surfaceAlbedo !== 'number' || surfaceAlbedo < 0 || surfaceAlbedo > 1) {
        throw new RangeError('surfaceAlbedo must be between 0 and 1');
    }
    if (typeof solarRadiation_W_m2 !== 'number' || solarRadiation_W_m2 < 0) {
        throw new RangeError('solarRadiation_W_m2 must be >= 0');
    }

    // Temperatura de superfície pelo balanço de energia simplificado
    const G = solarRadiation_W_m2;
    const surfaceTemp_C = Math.pow(((1 - surfaceAlbedo) * G) / SIGMA, 0.25) - 273.15;

    /**
     * Calcula o benefício de temperatura ao adotar albedo alvo.
     * @param {number} greenCoverage_pct - Target albedo (0–1)
     * @returns {number} Temperature reduction (°C, positive = cooler)
     */
    const coolRoofBenefit_C = (albedoTarget: number): number => {
        if (typeof albedoTarget !== 'number' || albedoTarget < 0 || albedoTarget > 1) {
            throw new RangeError('albedoTarget must be between 0 and 1');
        }
        const targetTemp_C = Math.pow(((1 - albedoTarget) * G) / SIGMA, 0.25) - 273.15;
        return surfaceTemp_C - targetTemp_C;
    };

    return { surfaceTemp_C, coolRoofBenefit_C };
}

function _validateMitigationInputs(uhi_intensity: number, greenCoverage_pct: number, albedo: number, populationDensity: number): void {
    if (typeof uhi_intensity !== 'number' || !isFinite(uhi_intensity)) {
        throw new TypeError('uhi_intensity must be a finite number');
    }
    if (typeof greenCoverage_pct !== 'number' || greenCoverage_pct < 0 || greenCoverage_pct > 100) {
        throw new RangeError('greenCoverage_pct must be between 0 and 100');
    }
    if (typeof albedo !== 'number' || albedo < 0 || albedo > 1) {
        throw new RangeError('albedo must be between 0 and 1');
    }
    if (typeof populationDensity !== 'number' || populationDensity < 0) {
        throw new RangeError('populationDensity must be >= 0');
    }
}

function _buildStrategies(greenCoverage_pct: number, albedo: number, populationDensity: number): string[] {
    const strategies: string[] = ['tree_planting', 'cool_roofs'];
    if (greenCoverage_pct < 20) strategies.push('urban_parks');
    if (albedo < 0.3) strategies.push('reflective_pavements');
    if (populationDensity > 5000) strategies.push('vertical_gardens');
    return strategies;
}

function _priorityFromUHI(uhi_intensity: number): string {
    if (uhi_intensity >= 4) return 'urgent';
    if (uhi_intensity >= 2) return 'high';
    if (uhi_intensity >= 0.5) return 'medium';
    return 'low';
}

/**
 * Classifies UHI mitigation strategies based on site characteristics.
 * Classifica estratégias de mitigação da ilha de calor com base nas características do local.
 *
 * @param {number} greenCoverage_pct       - UHI intensity (°C)
 * @param {number} greenCoverage_pct   - Current green coverage (0–100 %)
 * @param {number} greenCoverage_pct              - Surface albedo (0–1)
 * @param {number} greenCoverage_pct   - Population density (persons/km²)
 * @returns {{ strategies: string[], priority: string }}
 */
export function classifyMitigationStrategy(uhi_intensity: number, greenCoverage_pct: number, albedo: number, populationDensity: number): MitigationStrategyResult {
    _validateMitigationInputs(uhi_intensity, greenCoverage_pct, albedo, populationDensity);
    const strategies = _buildStrategies(greenCoverage_pct, albedo, populationDensity);
    const priority = _priorityFromUHI(uhi_intensity);
    return { strategies, priority };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const urbanHeatIslandMeta = {
    name: 'urbanHeatIsland',
    description: 'Urban Heat Island Analysis',
    category: 'analytics',
    familyTags: ['environmental'],
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
