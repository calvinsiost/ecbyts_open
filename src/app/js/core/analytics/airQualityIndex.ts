// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

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
// Application: EHS & Mining - Air Quality Index
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

'use strict';

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

interface Breakpoint {
    cLow: number;
    cHigh: number;
    iLow: number;
    iHigh: number;
}

const BREAKPOINTS: Record<string, Breakpoint[]> = {
    pm25: [
        { cLow: 0, cHigh: 12.0, iLow: 0, iHigh: 40 },
        { cLow: 12.1, cHigh: 35.4, iLow: 41, iHigh: 80 },
        { cLow: 35.5, cHigh: 55.4, iLow: 81, iHigh: 120 },
        { cLow: 55.5, cHigh: 150.4, iLow: 121, iHigh: 200 },
        { cLow: 150.5, cHigh: 500, iLow: 201, iHigh: 400 },
    ],
    pm10: [
        { cLow: 0, cHigh: 50, iLow: 0, iHigh: 40 },
        { cLow: 51, cHigh: 100, iLow: 41, iHigh: 80 },
        { cLow: 101, cHigh: 150, iLow: 81, iHigh: 120 },
        { cLow: 151, cHigh: 250, iLow: 121, iHigh: 200 },
        { cLow: 251, cHigh: 600, iLow: 201, iHigh: 400 },
    ],
    co: [
        { cLow: 0, cHigh: 4.4, iLow: 0, iHigh: 40 },
        { cLow: 4.5, cHigh: 9.4, iLow: 41, iHigh: 80 },
        { cLow: 9.5, cHigh: 12.4, iLow: 81, iHigh: 120 },
        { cLow: 12.5, cHigh: 15.4, iLow: 121, iHigh: 200 },
        { cLow: 15.5, cHigh: 50, iLow: 201, iHigh: 400 },
    ],
    o3: [
        { cLow: 0, cHigh: 54, iLow: 0, iHigh: 40 },
        { cLow: 55, cHigh: 70, iLow: 41, iHigh: 80 },
        { cLow: 71, cHigh: 85, iLow: 81, iHigh: 120 },
        { cLow: 86, cHigh: 105, iLow: 121, iHigh: 200 },
        { cLow: 106, cHigh: 500, iLow: 201, iHigh: 400 },
    ],
    no2: [
        { cLow: 0, cHigh: 53, iLow: 0, iHigh: 40 },
        { cLow: 54, cHigh: 100, iLow: 41, iHigh: 80 },
        { cLow: 101, cHigh: 360, iLow: 81, iHigh: 120 },
        { cLow: 361, cHigh: 649, iLow: 121, iHigh: 200 },
        { cLow: 650, cHigh: 2000, iLow: 201, iHigh: 400 },
    ],
    so2: [
        { cLow: 0, cHigh: 35, iLow: 0, iHigh: 40 },
        { cLow: 36, cHigh: 75, iLow: 41, iHigh: 80 },
        { cLow: 76, cHigh: 185, iLow: 81, iHigh: 120 },
        { cLow: 186, cHigh: 304, iLow: 121, iHigh: 200 },
        { cLow: 305, cHigh: 1000, iLow: 201, iHigh: 400 },
    ],
};

const VALID_POLLUTANTS = new Set(Object.keys(BREAKPOINTS));

export function computeSubIndex(pollutant: string, concentration: number): number {
    if (typeof pollutant !== 'string' || !VALID_POLLUTANTS.has(pollutant)) {
        throw new TypeError('pollutant must be one of: ' + [...VALID_POLLUTANTS].join(', '));
    }
    if (typeof concentration !== 'number' || !Number.isFinite(concentration)) {
        throw new TypeError('concentration must be a finite number');
    }
    if (concentration < 0) throw new RangeError('concentration must be >= 0');
    const breaks = BREAKPOINTS[pollutant] as Breakpoint[];
    for (const bp of breaks) {
        if (concentration >= bp.cLow && concentration <= bp.cHigh) {
            return ((bp.iHigh - bp.iLow) / (bp.cHigh - bp.cLow)) * (concentration - bp.cLow) + bp.iLow;
        }
    }
    return 400;
}

export function computeAQI(
    pollutantReadings: Array<{ pollutant: string; concentration: number }>,
): { aqi: number; dominantPollutant: string; category: string } {
    if (!Array.isArray(pollutantReadings) || pollutantReadings.length === 0) {
        throw new TypeError('pollutantReadings must be a non-empty array');
    }
    let maxSubIndex = -Infinity;
    let dominantPollutant = '';
    for (const reading of pollutantReadings) {
        const subIndex = computeSubIndex(reading.pollutant, reading.concentration);
        if (subIndex > maxSubIndex) {
            maxSubIndex = subIndex;
            dominantPollutant = reading.pollutant;
        }
    }
    const aqi = Math.round(maxSubIndex);
    const { category } = classifyAQI(aqi);
    return { aqi, dominantPollutant, category };
}

export function classifyAQI(aqi: number): { category: string; color: string; healthAdvice: string } {
    if (typeof aqi !== 'number' || !Number.isFinite(aqi)) throw new TypeError('aqi must be a finite number');
    if (aqi < 0) throw new RangeError('aqi must be >= 0');
    if (aqi <= 40) return { category: 'boa', color: '#00e400', healthAdvice: 'Qualidade do ar boa.' };
    if (aqi <= 80)
        return { category: 'moderada', color: '#ffff00', healthAdvice: 'Grupos sensiveis devem reduzir atividades.' };
    if (aqi <= 120)
        return {
            category: 'ruim',
            color: '#ff7e00',
            healthAdvice: 'Grupos sensiveis devem evitar atividades ao ar livre.',
        };
    if (aqi <= 200)
        return {
            category: 'muito_ruim',
            color: '#ff0000',
            healthAdvice: 'Toda a populacao deve evitar atividades ao ar livre.',
        };
    return { category: 'pessima', color: '#7e0023', healthAdvice: 'Alerta de emergencia.' };
}

export function computeExposureRisk(aqi: number, exposureHours: number, sensitiveGroup: boolean): number {
    if (typeof aqi !== 'number' || !Number.isFinite(aqi)) throw new TypeError('aqi must be a finite number');
    if (typeof exposureHours !== 'number' || !Number.isFinite(exposureHours))
        throw new TypeError('exposureHours must be a finite number');
    if (typeof sensitiveGroup !== 'boolean') throw new TypeError('sensitiveGroup must be a boolean');
    if (aqi < 0) throw new RangeError('aqi must be >= 0');
    if (exposureHours < 0 || exposureHours > 24) throw new RangeError('exposureHours must be between 0 and 24');
    let risk = (aqi / 200) * (exposureHours / 24);
    if (sensitiveGroup && aqi > 80) risk *= 2;
    return risk;
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airQualityIndexMeta: AnalyticsModuleMeta = {
    name: 'airQualityIndex',
    description: 'Air Quality Index',
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
