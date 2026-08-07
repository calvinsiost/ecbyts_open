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
// Application: EHS & Mining - Stormwater Management
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

/**
 * Stormwater Management - Urban Runoff and BMP Assessment
 *
 * Módulo puro para gestão de águas pluviais: cálculo de impermeabilização,
 * volume de escoamento superficial, carga de first flush e classificação de BMPs.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Schueler, T. R. (1987). Controlling Urban Runoff: A Practical Manual
 *     for Planning and Designing Urban BMPs. Washington, DC: Metropolitan
 *     Washington Council of Governments (MWCOG). (simplified runoff equation)
 *   - US EPA (1999). Stormwater Technology Fact Sheet - Various BMPs.
 *     EPA/832/F-99/xxx. Washington, DC: US EPA. (BMP suitability criteria)
 *   - ASCE (1992). Design and Construction of Urban Stormwater Management
 *     Systems. ASCE Manuals and Reports of Engineering Practice No. 77.
 *     New York: ASCE. (first flush modeling)
 */

interface FirstFlushResult { mass_kg: number; firstFlushConc_mg_L: number; }
interface BMPClassification { recommended: string[]; unsuitable: string[]; }

/**
 * Compute imperviousness ratio for a catchment area.
 * Calcula a razão de impermeabilização da bacia hidrográfica.
 *
 * @param {number} imperviousArea_m2 - Impervious surface area (m²) / Área impermeável (m²)
 * @param {number} totalArea_m2 - Total catchment area (m²) / Área total da bacia (m²)
 * @returns {number} Imperviousness ratio (0–1) / Razão de impermeabilização (0–1)
 * @throws {RangeError} If impervious area exceeds total area or inputs are negative
 */
export function computeImperviousnessRatio(imperviousArea_m2: number, totalArea_m2: number): number {
    if (typeof imperviousArea_m2 !== 'number' || typeof totalArea_m2 !== 'number') {
        throw new TypeError('imperviousArea_m2 and totalArea_m2 must be numbers');
    }
    if (imperviousArea_m2 < 0 || totalArea_m2 <= 0) {
        throw new RangeError('Areas must be positive; totalArea_m2 must be > 0');
    }
    if (imperviousArea_m2 > totalArea_m2) {
        throw new RangeError('imperviousArea_m2 cannot exceed totalArea_m2');
    }
    // Razão simples: área impermeável / área total
    return imperviousArea_m2 / totalArea_m2;
}

/**
 * Compute stormwater runoff volume using Schueler (1987) simplified method.
 * Calcula volume de escoamento pluvial pelo método simplificado de Schueler.
 *
 * Formula: V = P × (0.05 + 0.9 × i) × A / 1000
 *   where P = rainfall (mm), i = imperviousness ratio, A = area (m²)
 *
 * @param {number} rainfall_mm - Rainfall depth (mm) / Precipitação (mm)
 * @param {number} imperviousness - Imperviousness ratio (0–1) / Razão de impermeabilização
 * @param {number} area_m2 - Catchment area (m²) / Área da bacia (m²)
 * @returns {number} Runoff volume (m³) / Volume de escoamento (m³)
 * @throws {RangeError} If any input is out of valid range
 */
export function computeRunoffVolume(rainfall_mm: number, imperviousness: number, area_m2: number): number {
    if (typeof rainfall_mm !== 'number' || typeof imperviousness !== 'number' || typeof area_m2 !== 'number') {
        throw new TypeError('All parameters must be numbers');
    }
    if (rainfall_mm < 0) {
        throw new RangeError('rainfall_mm must be >= 0');
    }
    if (imperviousness < 0 || imperviousness > 1) {
        throw new RangeError('imperviousness must be in [0, 1]');
    }
    if (area_m2 <= 0) {
        throw new RangeError('area_m2 must be > 0');
    }
    // Coeficiente de escoamento simplificado de Schueler (1987)
    const runoffCoeff = 0.05 + 0.9 * imperviousness;
    // Volume: P (mm) × coeff × A (m²) ÷ 1000 → m³
    return (rainfall_mm * runoffCoeff * area_m2) / 1000;
}

/**
 * Compute first flush pollutant load using exponential washoff model.
 * Calcula a carga de poluentes no first flush por modelo de lavagem exponencial.
 *
 * Formula: M = C0 × V × exp(-k × V)
 *   where C0 = initial concentration (mg/L), V = volume (m³), k = washoff coeff (1/m³)
 *
 * @param {number} initialConc_mg_L - Initial pollutant concentration (mg/L) / Concentração inicial (mg/L)
 * @param {number} volume_m3 - Runoff volume (m³) / Volume de escoamento (m³)
 * @param {number} [washoffCoeff=1.0] - Washoff coefficient (1/m³) / Coeficiente de lavagem (1/m³)
 * @returns {{ mass_kg: number, firstFlushConc_mg_L: number }} Mass and effective concentration
 * @throws {RangeError} If inputs are out of valid range
 */
export function computeFirstFlushLoad(initialConc_mg_L: number, volume_m3: number, washoffCoeff: number = 1.0): FirstFlushResult {
    if (typeof initialConc_mg_L !== 'number' || typeof volume_m3 !== 'number') {
        throw new TypeError('initialConc_mg_L and volume_m3 must be numbers');
    }
    if (initialConc_mg_L < 0) {
        throw new RangeError('initialConc_mg_L must be >= 0');
    }
    if (volume_m3 <= 0) {
        throw new RangeError('volume_m3 must be > 0');
    }
    if (washoffCoeff <= 0) {
        throw new RangeError('washoffCoeff must be > 0');
    }
    // Modelo de lavagem exponencial: M = C0 × V × exp(-k × V)
    // Concentração em mg/L, volume em m³ (1 m³ = 1000 L)
    const mass_kg = (initialConc_mg_L * (volume_m3 * 1000) * Math.exp(-washoffCoeff * volume_m3)) / 1e6;
    // Concentração efetiva do first flush (massa / volume total em litros)
    const firstFlushConc_mg_L = (mass_kg * 1e6) / (volume_m3 * 1000);
    return { mass_kg, firstFlushConc_mg_L };
}

/**
 * Classify BMP suitability based on site characteristics.
 * Classifica a adequação de BMPs com base nas características do local.
 *
 * BMP criteria (USEPA 1999):
 *   - bioretention: slope < 5%, soil permeability > 1e-6 m/s
 *   - infiltration basin: slope < 2%, depth > 1.5 m
 *   - green roof: any slope, area > 50 m²
 *   - wet pond: area > 1000 m²
 *
 * @param {number} area_m2 - Site area (m²) / Área do local (m²)
 * @param {number} slope_pct - Ground slope (%) / Declividade (%)
 * @param {number} soilPermeability - Soil hydraulic conductivity (m/s) / Condutividade hidráulica (m/s)
 * @param {number} depth_m - Soil depth to restrictive layer (m) / Profundidade até camada restritiva (m)
 * @returns {{ recommended: string[], unsuitable: string[] }} BMP classification
 * @throws {RangeError} If any parameter is out of range
 */
export function classifyBMPSuitability(area_m2: number, slope_pct: number, soilPermeability: number, depth_m: number): BMPClassification {
    if (
        typeof area_m2 !== 'number' ||
        typeof slope_pct !== 'number' ||
        typeof soilPermeability !== 'number' ||
        typeof depth_m !== 'number'
    ) {
        throw new TypeError('All parameters must be numbers');
    }
    if (area_m2 <= 0) throw new RangeError('area_m2 must be > 0');
    if (slope_pct < 0) throw new RangeError('slope_pct must be >= 0');
    if (soilPermeability < 0) throw new RangeError('soilPermeability must be >= 0');
    if (depth_m < 0) throw new RangeError('depth_m must be >= 0');

    const recommended: string[] = [];
    const unsuitable: string[] = [];

    // Bioretention: requer declividade < 5% e permeabilidade > 1e-6 m/s
    if (slope_pct < 5 && soilPermeability > 1e-6) {
        recommended.push('bioretention');
    } else {
        unsuitable.push('bioretention');
    }

    // Infiltration basin: requer declividade < 2% e profundidade > 1.5 m
    if (slope_pct < 2 && depth_m > 1.5) {
        recommended.push('infiltration basin');
    } else {
        unsuitable.push('infiltration basin');
    }

    // Green roof: qualquer declividade, área > 50 m²
    if (area_m2 > 50) {
        recommended.push('green roof');
    } else {
        unsuitable.push('green roof');
    }

    // Wet pond: área > 1000 m²
    if (area_m2 > 1000) {
        recommended.push('wet pond');
    } else {
        unsuitable.push('wet pond');
    }

    return { recommended, unsuitable };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const stormwaterManagementMeta = {
    name: 'stormwaterManagement',
    description: 'Stormwater Management',
    category: 'analytics',
    familyTags: ['water', 'stormwater'],
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
