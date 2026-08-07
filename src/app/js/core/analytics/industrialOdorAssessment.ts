// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Industrial Odor Assessment Module
 *
 * Implements odor impact assessment following:
 *   - EN 13725:2022 - Air quality: determination of odour concentration by dynamic olfactometry
 *   - ASTM E679 - Standard practice for determination of odour and taste thresholds
 *   - VDI 3940:2006 - Measurement of odour impact by field inspection (grid and plume measurement)
 *   - Sutton (1947) simplified Gaussian dispersion model for short-range estimates
 *
 * DOI references:
 *   - Sutton dispersion: 10.1002/qj.49707331022
 *   - EN 13725 overview: 10.1016/j.chemosphere.2017.01.129
 *
 * Zero DOM / IDB / Three.js / fetch dependencies - pure math module.
 *
 * @module industrialOdorAssessment
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Impact classification thresholds (ouE/m³ at receptor)
 * Baseado em limites regulatórios europeus e VDI 3940.
 * @readonly
 */
const IMPACT_THRESHOLDS = [
    { label: 'negligible', minOuE: 0, maxOuE: 1 },
    { label: 'low', minOuE: 1, maxOuE: 3 },
    { label: 'moderate', minOuE: 3, maxOuE: 10 },
    { label: 'high', minOuE: 10, maxOuE: 50 },
    { label: 'very high', minOuE: 50, maxOuE: Infinity },
];

/**
 * Stability class parameters for Sutton dispersion (σy, σz coefficients)
 * Classes A–F from Pasquill-Gifford; using simplified power-law form.
 * Coeficientes de dispersão horizontal (Cy) e vertical (Cz) + exponents.
 * Source: Turner (1994) Workbook on Atmospheric Dispersion Estimates.
 * @readonly
 */
const STABILITY_PARAMS = {
    A: { Cy: 0.22, Cz: 0.2, n: 0.89 },
    B: { Cy: 0.16, Cz: 0.12, n: 0.92 },
    C: { Cy: 0.11, Cz: 0.08, n: 0.92 },
    D: { Cy: 0.08, Cz: 0.06, n: 0.92 },
    E: { Cy: 0.06, Cz: 0.03, n: 0.92 },
    F: { Cy: 0.04, Cz: 0.016, n: 0.92 },
};

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Convert odour concentration between common units.
 * Converte concentração de odor entre unidades comuns.
 *
 * @param {number} value  - numeric concentration value
 * @param {'ouE/m3'|'OU/m3'|'D/T'} fromUnit - source unit
 * @param {'ouE/m3'|'OU/m3'|'D/T'} toUnit   - target unit
 * @returns {number} converted value
 *
 * Conversion notes (EN 13725:2022 §3):
 *   1 ouE/m³ = 1 OU/m³ (European = ISO unit, numerically equivalent)
 *   D/T (dilution-to-threshold) ≈ ouE/m³ for pure compounds when TOC = 1 ouE
 */
export function convertOdourUnit(value: number, fromUnit: 'ouE/m3'|'OU/m3'|'D/T', toUnit: 'ouE/m3'|'OU/m3'|'D/T'): number {
    if (typeof value !== 'number' || !isFinite(value)) {
        throw new TypeError('value must be a finite number');
    }
    if (value < 0) throw new RangeError('Odour concentration cannot be negative');
    if (fromUnit === toUnit) return value;

    // Normalise para ouE/m³
    // Normalise to ouE/m³ first, then convert to target
    const toOuE = { 'ouE/m3': 1, 'OU/m3': 1, 'D/T': 1 };
    if (!toOuE[fromUnit]) throw new RangeError(`Unknown fromUnit: ${fromUnit}`);
    if (!toOuE[toUnit]) throw new RangeError(`Unknown toUnit: ${toUnit}`);
    // All supported units are numerically equivalent (EN 13725 §3.1)
    return value;
}

/**
 * Calculate odour detection threshold (TOC) via geometric mean of panellists.
 * Calcula o limiar de detecção olfativa como média geométrica dos julgamentos (EN 13725 §7).
 *
 * @param {number[]} dilutionFactors - array of individual threshold dilution factors (D/T per panellist)
 * @returns {{ toc: number, unit: string }} threshold odour concentration in ouE/m³
 *
 * Formula: TOC = (∏ dᵢ)^(1/n)   [geometric mean, EN 13725 eq. 4]
 */
export function calcDetectionThreshold(dilutionFactors: number[]): { toc: number, unit: string } {
    if (!Array.isArray(dilutionFactors) || dilutionFactors.length === 0) {
        throw new TypeError('dilutionFactors must be a non-empty array');
    }
    if (dilutionFactors.length < 3) {
        throw new RangeError('EN 13725 requires at least 3 panellists for valid TOC');
    }
    for (const d of dilutionFactors) {
        if (typeof d !== 'number' || !isFinite(d) || d <= 0) {
            throw new RangeError('Each dilution factor must be a positive finite number');
        }
    }

    // Média geométrica dos fatores de diluição individuais
    const logSum = dilutionFactors.reduce((acc, d) => acc + Math.log(d), 0);
    const toc = Math.exp(logSum / dilutionFactors.length);

    return { toc: +toc.toFixed(4), unit: 'ouE/m3' };
}

/**
 * Estimate downwind odour concentration using Sutton simplified Gaussian model.
 * Estima concentração de odor no receptor pela equação de dispersão Gaussiana simplificada de Sutton.
 *
 * Model: C(x,0,0) = Q / (π · σy · σz · u)   [centre-line, ground-level, EN 13725 §A.4]
 * where σy = Cy · x^n  and  σz = Cz · x^n   (Pasquill-Gifford power law)
 *
 * @param {object} params
 * @param {number} params.emissionRate    - source strength Q (ouE/s)
 * @param {number} params.windSpeed       - mean wind speed u (m/s)
 * @param {number} params.distance        - downwind distance x (m)
 * @param {'A'|'B'|'C'|'D'|'E'|'F'} params.stabilityClass - Pasquill-Gifford class
 * @returns {{ concentration: number, unit: string, sigmaY: number, sigmaZ: number }}
 */
export function calcSuttonDispersion({ emissionRate, windSpeed, distance, stabilityClass }: { emissionRate: number; windSpeed: number; distance: number; stabilityClass: 'A'|'B'|'C'|'D'|'E'|'F' }): { concentration: number, unit: string, sigmaY: number, sigmaZ: number } {
    if (typeof emissionRate !== 'number' || emissionRate <= 0) {
        throw new RangeError('emissionRate must be a positive number (ouE/s)');
    }
    if (typeof windSpeed !== 'number' || windSpeed <= 0) {
        throw new RangeError('windSpeed must be positive (m/s)');
    }
    if (typeof distance !== 'number' || distance <= 0) {
        throw new RangeError('distance must be positive (m)');
    }
    const params = STABILITY_PARAMS[stabilityClass];
    if (!params) {
        throw new RangeError(`stabilityClass must be one of: ${Object.keys(STABILITY_PARAMS).join(', ')}`);
    }

    const { Cy, Cz, n } = params;
    // Desvios padrão de dispersão horizontal e vertical
    const sigmaY = Cy * Math.pow(distance, n);
    const sigmaZ = Cz * Math.pow(distance, n);

    // Gaussian centre-line ground-level concentration (no stack height term - ground-level source)
    const concentration = emissionRate / (Math.PI * sigmaY * sigmaZ * windSpeed);

    return {
        concentration: +concentration.toFixed(4),
        unit: 'ouE/m3',
        sigmaY: +sigmaY.toFixed(4),
        sigmaZ: +sigmaZ.toFixed(4),
    };
}

/**
 * Calculate annoyance frequency (percentile 98 criterion, VDI 3940).
 * Calcula a frequência de incomodidade como fração de horas em que a concentração excede o limiar.
 *
 * The p98 criterion (VDI 3940-1): at protected land-uses the 98th percentile of hourly
 * ouE concentrations must not exceed 1–10 ouE/m³ depending on source type.
 *
 * @param {number[]} hourlyConcentrations - array of hourly ouE/m³ values (min 8 760 for annual)
 * @param {number}   threshold            - odour hour threshold (ouE/m³); default 1
 * @returns {{ annoyanceFrequency: number, percentile98: number, exceedanceCount: number }}
 */
export function calcAnnoyanceFrequency(hourlyConcentrations: number[], threshold: number = 1): { annoyanceFrequency: number, percentile98: number, exceedanceCount: number } {
    if (!Array.isArray(hourlyConcentrations) || hourlyConcentrations.length === 0) {
        throw new TypeError('hourlyConcentrations must be a non-empty array');
    }
    if (typeof threshold !== 'number' || threshold <= 0) {
        throw new RangeError('threshold must be a positive number');
    }

    const sorted = [...hourlyConcentrations].sort((a, b) => a - b);
    const n = sorted.length;

    // Percentil 98: posição p = (98/100) * (n-1)
    const p = 0.98 * (n - 1);
    const lower = sorted[Math.floor(p)]!;
    const upper = sorted[Math.ceil(p)]!;
    const percentile98 = lower + (p - Math.floor(p)) * (upper - lower);

    const exceedanceCount = hourlyConcentrations.filter((c) => c > threshold).length;
    const annoyanceFrequency = exceedanceCount / n;

    return {
        annoyanceFrequency: +annoyanceFrequency.toFixed(6),
        percentile98: +percentile98.toFixed(4),
        exceedanceCount,
    };
}

/**
 * Classify odour impact at receptor based on concentration (ouE/m³).
 * Classifica o impacto olfativo no receptor conforme concentração.
 *
 * @param {number} concentration - ouE/m³ at receptor
 * @returns {{ impact: string, concentration: number, unit: string }}
 */
export function classifyOdourImpact(concentration: number): { impact: string, concentration: number, unit: string } {
    if (typeof concentration !== 'number' || !isFinite(concentration)) {
        throw new TypeError('concentration must be a finite number');
    }
    if (concentration < 0) throw new RangeError('concentration cannot be negative');

    const tier = IMPACT_THRESHOLDS.find((t) => concentration >= t.minOuE && concentration < t.maxOuE);
    const impact = tier ? tier.label : 'very high';

    return { impact, concentration: +concentration.toFixed(4), unit: 'ouE/m3' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
interface AnalyticsJsonSchema {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
    description?: string;
}
interface AnalyticsModuleProvenance {
    generatedBy: string;
    version: string;
    validatedByHuman: boolean;
    disclaimerAcknowledged: boolean;
    specRef: string;
    citation?: string;
}
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: AnalyticsModuleProvenance;
    inputSchema: AnalyticsJsonSchema;
    outputSchema: AnalyticsJsonSchema;
}

export const industrialOdorAssessmentMeta: AnalyticsModuleMeta = {
    name: 'industrialOdorAssessment',
    description: 'industrialOdorAssessment',
    category: 'analytics',
    familyTags: ['industrial'],
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
