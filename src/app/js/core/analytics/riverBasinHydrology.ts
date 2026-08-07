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
// Application: EHS & Mining - River Basin Hydrology
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * River Basin Hydrology - SCS Curve Number, Runoff, Peak Flow & Baseflow
 *
 * Módulo puro para hidrologia de bacia hidrográfica: número de curva SCS/NRCS,
 * escoamento superficial direto, vazão de pico pelo Método Racional e
 * separação de fluxo de base.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - NRCS (1986). Urban Hydrology for Small Watersheds, TR-55.
 *     USDA Soil Conservation Service Technical Release No. 55.
 *   - Chow, V.T., Maidment, D.R. & Mays, L.W. (1988).
 *     Applied Hydrology. McGraw-Hill, New York. ISBN 978-0070108110.
 *   - SCS (1972). National Engineering Handbook, Section 4: Hydrology (NEH-4).
 *     USDA Soil Conservation Service, Washington D.C.
 *
 * @module riverBasinHydrology
 */

'use strict';

interface CNTableEntry {
    A: number;
    B: number;
    C: number;
    D: number;
}

interface CN_TABLE_TYPE {
    forest: CNTableEntry;
    grass: CNTableEntry;
    cropland: CNTableEntry;
    urban: CNTableEntry;
    impervious: CNTableEntry;
}

interface AMC_ADJUSTMENT_TYPE {
    dry: number;
    normal: number;
    wet: number;
}

/**
 * SCS Curve Number table: CN[landUse][soilGroup] for Normal (AMC II) conditions.
 * Source: NRCS TR-55 Table 2-2 and NEH-4 Table 9-1.
 *
 * Tabela de CN por uso do solo e grupo hidrológico (condição Normal, AMC II).
 */
const CN_TABLE: CN_TABLE_TYPE = {
    forest: { A: 30, B: 55, C: 70, D: 77 },
    grass: { A: 39, B: 61, C: 74, D: 80 },
    cropland: { A: 67, B: 78, C: 85, D: 89 },
    urban: { A: 68, B: 79, C: 86, D: 89 },
    impervious: { A: 98, B: 98, C: 98, D: 98 },
};

/** Valid land use types */
const VALID_LAND_USE = new Set<string>(Object.keys(CN_TABLE));

/** Valid hydrologic soil groups */
const VALID_SOIL_GROUPS = new Set(['A', 'B', 'C', 'D']);

/** Valid antecedent moisture conditions */
const VALID_MOISTURE = new Set(['dry', 'normal', 'wet']);

/** AMC adjustment fractions (from normal CN): NEH-4 Table 9-2 approximation */
const AMC_ADJUSTMENT: AMC_ADJUSTMENT_TYPE = { dry: -0.2, normal: 0, wet: 0.1 };

/**
 * Computes the SCS Curve Number for a given land use, soil group, and
 * antecedent moisture condition (AMC).
 *
 * Calcula o número de curva SCS por uso do solo, grupo de solo e umidade antecedente.
 *
 * @param {'forest'|'grass'|'cropland'|'urban'|'impervious'} landUse
 * @param {'A'|'B'|'C'|'D'} soilGroup - USDA hydrologic soil group
 * @param {'dry'|'normal'|'wet'} antecedentMoisture - AMC condition
 * @returns {{ cn: number, cnNormal: number, adjustment: number }}
 * @throws {TypeError|RangeError} on invalid inputs
 */
export function computeRunoffCurveNumber(
    landUse: 'forest' | 'grass' | 'cropland' | 'urban' | 'impervious',
    soilGroup: 'A' | 'B' | 'C' | 'D',
    antecedentMoisture: 'dry' | 'normal' | 'wet'
): { cn: number, cnNormal: number, adjustment: number } {
    if (!VALID_LAND_USE.has(landUse)) {
        throw new TypeError(`landUse must be one of: ${[...VALID_LAND_USE].join(', ')}`);
    }
    if (!VALID_SOIL_GROUPS.has(soilGroup)) {
        throw new TypeError(`soilGroup must be one of: A, B, C, D`);
    }
    if (!VALID_MOISTURE.has(antecedentMoisture)) {
        throw new TypeError(`antecedentMoisture must be one of: dry, normal, wet`);
    }

    // CN base para condição normal (AMC II)
    const cnNormal = (CN_TABLE as any)[landUse][soilGroup];

    // Ajuste por condição de umidade antecedente (NEH-4 Tabela 9-2)
    const adjustment = (AMC_ADJUSTMENT as any)[antecedentMoisture];
    const cnAdjusted = cnNormal + cnNormal * adjustment;

    // CN limitado ao intervalo válido [1, 100]
    const cn = Math.min(100, Math.max(1, Math.round(cnAdjusted)));

    return { cn, cnNormal, adjustment };
}

/**
 * Computes direct runoff depth (Q) using the SCS method (NEH-4, Eq. 10-11).
 *
 * S = 25400/CN − 254  (mm, retenção potencial máxima)
 * Q = (P − 0.2S)² / (P + 0.8S)  se P > 0.2S; 0 caso contrário
 *
 * Calcula escoamento superficial direto pelo método SCS (NEH-4).
 *
 * @param {number} rainfall_mm - Total rainfall depth (mm); >= 0
 * @param {number} cn          - Curve number (1–100)
 * @returns {{ runoff_mm: number, retention_mm: number, initialAbstraction_mm: number }}
 * @throws {RangeError} on invalid inputs
 */
export function computeDirectRunoff(rainfall_mm: number, cn: number): { runoff_mm: number, retention_mm: number, initialAbstraction_mm: number } {
    if (typeof rainfall_mm !== 'number' || rainfall_mm < 0) {
        throw new RangeError('rainfall_mm must be a non-negative number');
    }
    if (typeof cn !== 'number' || cn < 1 || cn > 100) {
        throw new RangeError('cn must be in range [1, 100]');
    }

    // Retenção potencial máxima S (mm) - NEH-4 Eq. 10-9
    const retention_mm = 25400 / cn - 254;

    // Abstração inicial Ia = 0.2S (NEH-4 padrão)
    const initialAbstraction_mm = 0.2 * retention_mm;

    // Equação de escoamento SCS - NEH-4 Eq. 10-11
    let runoff_mm = 0;
    if (rainfall_mm > initialAbstraction_mm) {
        const numerator = Math.pow(rainfall_mm - initialAbstraction_mm, 2);
        const denominator = rainfall_mm - initialAbstraction_mm + retention_mm;
        runoff_mm = numerator / denominator;
    }

    return { runoff_mm, retention_mm, initialAbstraction_mm };
}

/**
 * Computes peak discharge using the Rational Method (Chow et al. 1988).
 *
 * Q_peak = C × I × A / 3600  [m³/s]
 * where A is converted from km² to m²: A_m2 = A_km2 × 1e6
 *
 * Calcula a vazão de pico pelo Método Racional (Chow 1988 Eq. 7-7.1).
 *
 * @param {number} area_km2                  - Catchment area (km²); > 0
 * @param {number} timeOfConcentration_h     - Time of concentration (hours); > 0
 * @param {number} rainfall_intensity_mm_h   - Design rainfall intensity (mm/h); > 0
 * @param {number} runoffCoeff               - Runoff coefficient C (0–1)
 * @returns {{ peakFlow_m3_s: number, peakFlow_mm_h: number }}
 * @throws {RangeError} on invalid inputs
 */
export function computePeakFlow(area_km2: number, timeOfConcentration_h: number, rainfall_intensity_mm_h: number, runoffCoeff: number): { peakFlow_m3_s: number, peakFlow_mm_h: number } {
    if (typeof area_km2 !== 'number' || area_km2 <= 0) {
        throw new RangeError('area_km2 must be a positive number');
    }
    if (typeof timeOfConcentration_h !== 'number' || timeOfConcentration_h <= 0) {
        throw new RangeError('timeOfConcentration_h must be a positive number');
    }
    if (typeof rainfall_intensity_mm_h !== 'number' || rainfall_intensity_mm_h <= 0) {
        throw new RangeError('rainfall_intensity_mm_h must be a positive number');
    }
    if (typeof runoffCoeff !== 'number' || runoffCoeff < 0 || runoffCoeff > 1) {
        throw new RangeError('runoffCoeff must be in range [0, 1]');
    }

    // Conversão: I em mm/h → m/s; A em km² → m²
    // Q (m³/s) = C × I(m/s) × A(m²) = C × (I_mm_h / 1000 / 3600) × (A_km2 × 1e6)
    // Simplificado: Q = C × I_mm_h × A_km2 × (1e6 / 1000 / 3600)
    const peakFlow_m3_s = (runoffCoeff * rainfall_intensity_mm_h * area_km2 * 1e6) / (1000 * 3600);

    // Conversão inversa para mm/h sobre a área (para referência)
    const peakFlow_mm_h = (peakFlow_m3_s * 3600 * 1000) / (area_km2 * 1e6);

    return { peakFlow_m3_s, peakFlow_mm_h };
}

/**
 * Computes baseflow by separating it from total streamflow.
 * Baseflow index (BFI) = baseflow / totalFlow.
 *
 * Separa o fluxo de base do escoamento total e calcula o Índice de Fluxo de Base.
 *
 * @param {number} totalFlow_m3_s    - Total streamflow (m³/s); >= 0
 * @param {number} directRunoff_m3_s - Direct runoff component (m³/s); >= 0
 * @returns {{ baseflow_m3_s: number, baseflowIndex: number }}
 * @throws {RangeError} on invalid or inconsistent inputs
 */
export function computeBaseflow(totalFlow_m3_s: number, directRunoff_m3_s: number): { baseflow_m3_s: number, baseflowIndex: number } {
    if (typeof totalFlow_m3_s !== 'number' || totalFlow_m3_s < 0) {
        throw new RangeError('totalFlow_m3_s must be a non-negative number');
    }
    if (typeof directRunoff_m3_s !== 'number' || directRunoff_m3_s < 0) {
        throw new RangeError('directRunoff_m3_s must be a non-negative number');
    }
    if (directRunoff_m3_s > totalFlow_m3_s + 1e-10) {
        throw new RangeError('directRunoff_m3_s cannot exceed totalFlow_m3_s');
    }

    // Fluxo de base = escoamento total − escoamento direto
    const baseflow_m3_s = Math.max(0, totalFlow_m3_s - directRunoff_m3_s);

    // BFI: razão entre fluxo de base e escoamento total (0 se total = 0)
    const baseflowIndex = totalFlow_m3_s > 0 ? baseflow_m3_s / totalFlow_m3_s : 0;

    return { baseflow_m3_s, baseflowIndex };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverBasinHydrologyMeta = {
    name: 'riverBasinHydrology',
    description: 'River Basin Hydrology',
    category: 'analytics',
    familyTags: ['river', 'hydrogeology'],
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
