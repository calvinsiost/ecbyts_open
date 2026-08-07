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
 * Air Quality Index (AQI) calculator.
 *
 * References:
 * - EPA (2024) AQI Technical Assistance Document.
 *   https://www.airnow.gov/sites/default/files/2020-05/aqi-technical-assistance-document-sept2018.pdf
 * - CONAMA Resolução 491/2018 - Padrões de Qualidade do Ar (IQAr).
 * - 40 CFR Part 58, Appendix G.
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

// EPA AQI breakpoints: [Clow, Chigh, Ilow, Ihigh]
// Units: PM2.5 µg/m³ (24h), PM10 µg/m³ (24h), O3 ppb (8h),
//        NO2 ppb (1h), SO2 ppb (1h), CO ppm (8h)
const EPA_BREAKPOINTS: Record<string, number[][]> = {
    PM2_5: [
        [0.0, 9.0, 0, 50],
        [9.1, 35.4, 51, 100],
        [35.5, 55.4, 101, 150],
        [55.5, 125.4, 151, 200],
        [125.5, 225.4, 201, 300],
        [225.5, 325.4, 301, 500],
    ],
    PM10: [
        [0, 54, 0, 50],
        [55, 154, 51, 100],
        [155, 254, 101, 150],
        [255, 354, 151, 200],
        [355, 424, 201, 300],
        [425, 604, 301, 500],
    ],
    O3: [
        [0, 54, 0, 50],
        [55, 70, 51, 100],
        [71, 85, 101, 150],
        [86, 105, 151, 200],
        [106, 200, 201, 300],
    ],
    NO2: [
        [0, 53, 0, 50],
        [54, 100, 51, 100],
        [101, 360, 101, 150],
        [361, 649, 151, 200],
        [650, 1249, 201, 300],
        [1250, 2049, 301, 500],
    ],
    SO2: [
        [0, 35, 0, 50],
        [36, 75, 51, 100],
        [76, 185, 101, 150],
        [186, 304, 151, 200],
        [305, 604, 201, 300],
        [605, 1004, 301, 500],
    ],
    CO: [
        [0.0, 4.4, 0, 50],
        [4.5, 9.4, 51, 100],
        [9.5, 12.4, 101, 150],
        [12.5, 15.4, 151, 200],
        [15.5, 30.4, 201, 300],
        [30.5, 50.4, 301, 500],
    ],
};

// CONAMA 491/2018 breakpoints (IQAr)
// [Clow, Chigh, label]
const CONAMA_BREAKPOINTS: Record<string, Array<[number, number, string]>> = {
    PM2_5: [
        [0, 25, 'Boa'],
        [26, 50, 'Moderada'],
        [51, 75, 'Ruim'],
        [76, 125, 'Muito Ruim'],
        [126, Infinity, 'Péssima'],
    ],
    PM10: [
        [0, 50, 'Boa'],
        [51, 100, 'Moderada'],
        [101, 150, 'Ruim'],
        [151, 250, 'Muito Ruim'],
        [251, Infinity, 'Péssima'],
    ],
    O3: [
        [0, 100, 'Boa'],
        [101, 130, 'Moderada'],
        [131, 160, 'Ruim'],
        [161, 200, 'Muito Ruim'],
        [201, Infinity, 'Péssima'],
    ],
    NO2: [
        [0, 200, 'Boa'],
        [201, 240, 'Moderada'],
        [241, 320, 'Ruim'],
        [321, 1130, 'Muito Ruim'],
        [1131, Infinity, 'Péssima'],
    ],
    SO2: [
        [0, 20, 'Boa'],
        [21, 40, 'Moderada'],
        [41, 365, 'Ruim'],
        [366, 800, 'Muito Ruim'],
        [801, Infinity, 'Péssima'],
    ],
    CO: [
        [0, 9, 'Boa'],
        [10, 11, 'Moderada'],
        [12, 13, 'Ruim'],
        [14, 15, 'Muito Ruim'],
        [16, Infinity, 'Péssima'],
    ],
};

const AQI_CATEGORIES = [
    { max: 50, category: 'Good', color: '#00e400', healthMessage: 'Air quality is satisfactory; little or no risk.' },
    {
        max: 100,
        category: 'Moderate',
        color: '#ffff00',
        healthMessage: 'Acceptable; unusually sensitive individuals may be affected.',
    },
    {
        max: 150,
        category: 'Unhealthy for Sensitive Groups',
        color: '#ff7e00',
        healthMessage: 'Sensitive groups may experience health effects.',
    },
    {
        max: 200,
        category: 'Unhealthy',
        color: '#ff0000',
        healthMessage: 'Everyone may begin to experience health effects.',
    },
    {
        max: 300,
        category: 'Very Unhealthy',
        color: '#8f3f97',
        healthMessage: 'Health alert: serious effects for everyone.',
    },
    {
        max: 500,
        category: 'Hazardous',
        color: '#7e0023',
        healthMessage: 'Emergency conditions; entire population likely affected.',
    },
];

/**
 * Linear interpolation between AQI breakpoints (EPA formula).
 * @param Cp - Pollutant concentration
 * @param table - Breakpoint table for that pollutant
 * @returns AQI value (integer, 0–500)
 */
function _interpolate(Cp: number, table: Array<number[]>): number {
    for (const row of table) {
        const [Clo, Chi, Ilo, Ihi] = row as [number, number, number, number];
        if (Cp >= Clo && Cp <= Chi) {
            return Math.round(((Ihi - Ilo) / (Chi - Clo)) * (Cp - Clo) + Ilo);
        }
    }
    return 500; // beyond scale
}

/**
 * Calculate EPA AQI for a single pollutant.
 * @param concentration - Pollutant concentration (units per pollutant)
 * @param pollutant - 'PM2_5'|'PM10'|'O3'|'NO2'|'SO2'|'CO'
 * @returns AQI (0–500)
 */
export function calcAQI(concentration: number, pollutant: string): number {
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError(`concentration must be a non-negative number, got ${concentration}`);
    }
    const table = EPA_BREAKPOINTS[pollutant];
    if (!table) {
        throw new TypeError(`Unknown pollutant "${pollutant}". Valid: ${Object.keys(EPA_BREAKPOINTS).join(', ')}`);
    }
    return _interpolate(concentration, table);
}

/**
 * Classify an AQI value into EPA category.
 * @param aqi - AQI (0–500)
 */
export function classifyAQI(aqi: number): { category: string; color: string; healthMessage: string } {
    if (typeof aqi !== 'number' || aqi < 0) {
        throw new RangeError(`aqi must be a non-negative number, got ${aqi}`);
    }
    for (const cat of AQI_CATEGORIES) {
        if (aqi <= cat.max) return { category: cat.category, color: cat.color, healthMessage: cat.healthMessage };
    }
    return AQI_CATEGORIES[AQI_CATEGORIES.length - 1] as {
        max: number;
        category: string;
        color: string;
        healthMessage: string;
    };
}

/**
 * Calculate Brazilian IQAr per CONAMA 491/2018.
 * @param concentration - Pollutant concentration
 * @param pollutant - 'PM2_5'|'PM10'|'O3'|'NO2'|'SO2'|'CO'
 */
export function calcCONAMA491Index(
    concentration: number,
    pollutant: string,
): { label: string; concentration: number; pollutant: string } {
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError(`concentration must be a non-negative number, got ${concentration}`);
    }
    const table = CONAMA_BREAKPOINTS[pollutant];
    if (!table) {
        throw new TypeError(`Unknown pollutant "${pollutant}". Valid: ${Object.keys(CONAMA_BREAKPOINTS).join(', ')}`);
    }
    for (const row of table) {
        const [Clo, Chi, label] = row;
        if (concentration >= Clo && concentration <= Chi) {
            return { label, concentration, pollutant };
        }
    }
    return { label: 'Péssima', concentration, pollutant };
}

/**
 * Calculate composite AQI (highest among provided pollutants).
 * @param pollutantMap - Map of pollutant to concentration
 */
export function calcCompositeAQI(pollutantMap: {
    PM2_5?: number;
    PM10?: number;
    O3?: number;
    NO2?: number;
    SO2?: number;
    CO?: number;
}): { aqi: number; dominantPollutant: string; classification: object } {
    if (!pollutantMap || typeof pollutantMap !== 'object') {
        throw new TypeError('pollutantMap must be an object with pollutant concentrations');
    }
    let maxAQI = 0;
    let dominant: string | null = null;
    for (const [pollutant, conc] of Object.entries(pollutantMap)) {
        if (conc == null) continue;
        const aqi = calcAQI(conc, pollutant);
        if (aqi > maxAQI) {
            maxAQI = aqi;
            dominant = pollutant;
        }
    }
    if (dominant === null) throw new RangeError('pollutantMap must contain at least one valid entry');
    return { aqi: maxAQI, dominantPollutant: dominant, classification: classifyAQI(maxAQI) };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airQualityIndexCalculatorMeta: AnalyticsModuleMeta = {
    name: 'airQualityIndexCalculator',
    description: 'airQualityIndexCalculator',
    category: 'analytics',
    familyTags: ['air'],
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
