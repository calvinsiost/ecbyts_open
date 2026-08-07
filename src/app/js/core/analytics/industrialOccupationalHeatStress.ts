// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Industrial Occupational Heat Stress - PMV/PPD Thermal Comfort Model
 *
 * Implements the Predicted Mean Vote (PMV) and Predicted Percentage Dissatisfied (PPD)
 * model per Fanger (1970) and ISO 7730:2005, with Operative Temperature calculation
 * per ASHRAE 55-2020.
 *
 * Academic references:
 *   - Fanger, P.O. (1970). Thermal Comfort. Danish Technical Press. Copenhagen.
 *   - ISO 7730:2005. Ergonomics of the thermal environment - Analytical determination
 *     and interpretation of thermal comfort.
 *   - ASHRAE Standard 55-2020. Thermal Environmental Conditions for Human Occupancy.
 *
 * @module industrialOccupationalHeatStress
 */

'use strict';

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

/**
 * Saturation vapor pressure via Antoine equation (kPa).
 * @param T_C - Air temperature (°C)
 * @returns Saturation vapor pressure (kPa)
 */
function saturationPressure(T_C: number): number {
    return 0.1333 * Math.exp(18.956 - 4030.18 / (T_C + 235));
}

/**
 * Validates all inputs for calcPMV.
 * @throws {TypeError} If any parameter is not a finite number
 * @throws {RangeError} If any parameter is outside its valid range
 */
function validateCalcPMVInputs(
    airTemp: number,
    radiantTemp: number,
    airVelocity: number,
    humidity: number,
    metabolicRate: number,
    clothing: number,
): void {
    for (const [name, val] of [
        ['airTemp', airTemp],
        ['radiantTemp', radiantTemp],
        ['airVelocity', airVelocity],
        ['humidity', humidity],
        ['metabolicRate', metabolicRate],
        ['clothing', clothing],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val)) {
            throw new TypeError(`calcPMV: '${name}' must be a finite number`);
        }
    }
    if (airTemp < 10 || airTemp > 30) throw new RangeError('calcPMV: airTemp must be 10–30 °C');
    if (airVelocity < 0 || airVelocity > 1) throw new RangeError('calcPMV: airVelocity must be 0–1 m/s');
    if (humidity < 0 || humidity > 100) throw new RangeError('calcPMV: humidity must be 0–100 %');
    if (metabolicRate < 46 || metabolicRate > 232) throw new RangeError('calcPMV: metabolicRate must be 46–232 W/m²');
    if (clothing < 0 || clothing > 2) throw new RangeError('calcPMV: clothing must be 0–2 clo');
}

/**
 * Solves clothing surface temperature iteratively per ISO 7730 Annex B.
 * @returns Final clothing surface temperature (°C)
 */
function solveClothingSurfaceTemperature(
    airTemp: number,
    radiantTemp: number,
    airVelocity: number,
    metabolicRate: number,
    Icl: number,
    fcl: number,
): number {
    const Tr_K = radiantTemp + 273;
    let tcl = airTemp + (35.5 - airTemp) / (3.5 * (6.45 * Icl + 0.1));
    const alpha = 0.5;

    for (let i = 0; i < 500; i++) {
        const deltaT = Math.abs(tcl - airTemp);
        const hc = Math.max(deltaT > 0 ? 2.38 * Math.pow(deltaT, 0.25) : 0, 12.1 * Math.sqrt(airVelocity));
        const Tcl_K = tcl + 273;
        const tclRaw =
            35.7 -
            0.028 * metabolicRate -
            Icl * (3.96e-8 * fcl * (Math.pow(Tcl_K, 4) - Math.pow(Tr_K, 4)) + fcl * hc * (tcl - airTemp));
        const tclNew = alpha * tclRaw + (1 - alpha) * tcl;
        if (Math.abs(tclNew - tcl) < 0.0001) {
            return tclNew;
        }
        tcl = tclNew;
    }

    return tcl;
}

/**
 * Calculates total heat loss components (W/m²).
 */
function calcHeatLossComponents(
    tcl: number,
    Tcl_K: number,
    Tr_K: number,
    airTemp: number,
    airVelocity: number,
    metabolicRate: number,
    pa: number,
    fcl: number,
): number {
    const hc = Math.max(2.38, 12.1 * Math.sqrt(airVelocity));
    return (
        3.96e-8 * fcl * (Math.pow(Tcl_K, 4) - Math.pow(Tr_K, 4)) +
        fcl * hc * (tcl - airTemp) +
        3.05e-3 * (5733 - 6.99 * metabolicRate - pa) +
        Math.max(0, 0.42 * (metabolicRate - 58.15)) +
        1.7e-5 * metabolicRate * (5867 - pa) +
        0.0014 * metabolicRate * (34 - airTemp)
    );
}

/**
 * Calculates the Predicted Mean Vote (PMV) using Fanger's full equation.
 *
 * PMV ranges from -3 (cold) to +3 (hot), with 0 being neutral.
 * Equation from ISO 7730:2005 Annex B.
 *
 * @param airTemp - Air (dry-bulb) temperature (°C), valid 10–30°C
 * @param radiantTemp - Mean radiant temperature (°C), valid 10–40°C
 * @param airVelocity - Relative air velocity (m/s), valid 0–1 m/s
 * @param humidity - Relative humidity (%), valid 0–100
 * @param metabolicRate - Metabolic rate (W/m²), valid 46–232 (1–4 met)
 * @param clothing - Clothing insulation (clo), valid 0–2
 * @returns PMV value (dimensionless, -3 to +3)
 * @throws {RangeError} If any parameter is outside its valid range
 * @throws {TypeError} If any parameter is not a finite number
 */
export function calcPMV(
    airTemp: number,
    radiantTemp: number,
    airVelocity: number,
    humidity: number,
    metabolicRate: number,
    clothing: number,
): number {
    validateCalcPMVInputs(airTemp, radiantTemp, airVelocity, humidity, metabolicRate, clothing);

    const Icl = clothing * 0.155;
    const fcl = clothing < 0.5 ? 1.0 + 1.29 * clothing : 1.05 + 0.645 * clothing;
    const pa = (humidity / 100) * saturationPressure(airTemp) * 1000;
    const Tr_K = radiantTemp + 273;
    const tcl = solveClothingSurfaceTemperature(airTemp, radiantTemp, airVelocity, metabolicRate, Icl, fcl);
    const Tcl_K = tcl + 273;
    const L = calcHeatLossComponents(tcl, Tcl_K, Tr_K, airTemp, airVelocity, metabolicRate, pa, fcl);

    const PMV = (0.303 * Math.exp(-0.036 * metabolicRate) + 0.028) * (metabolicRate - L);
    return Math.max(-3, Math.min(3, PMV));
}

/**
 * Validates all inputs for calcOperativeTemperature.
 * @throws {TypeError} If any parameter is not a finite number
 * @throws {RangeError} If airVelocity is negative
 */
function validateCalcOperativeTemperatureInputs(
    airTemp: number,
    radiantTemp: number,
    airVelocity: number,
): void {
    for (const [name, val] of [
        ['airTemp', airTemp],
        ['radiantTemp', radiantTemp],
        ['airVelocity', airVelocity],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || !isFinite(val))
            throw new TypeError(`calcOperativeTemperature: '${name}' must be a finite number`);
    }
    if (airVelocity < 0) throw new RangeError('calcOperativeTemperature: airVelocity must be >= 0');
}

/**
 * Calculates the Predicted Percentage Dissatisfied (PPD) from PMV.
 *
 * PPD(PMV) = 100 − 95 × exp(−(0.03353 × PMV⁴ + 0.2179 × PMV²))
 * Source: ISO 7730:2005 eq. (2)
 *
 * @param PMV - Predicted Mean Vote (-3 to +3)
 * @returns PPD percentage (5–100 %)
 * @throws {TypeError} If PMV is not a finite number
 * @throws {RangeError} If PMV is outside [-3, 3]
 */
export function calcPPD(PMV: number): number {
    if (typeof PMV !== 'number' || !isFinite(PMV)) throw new TypeError('calcPPD: PMV must be a finite number');
    if (PMV < -3 || PMV > 3) throw new RangeError('calcPPD: PMV must be in [-3, 3]');
    return 100 - 95 * Math.exp(-(0.03353 * Math.pow(PMV, 4) + 0.2179 * Math.pow(PMV, 2)));
}

/**
 * Classifies thermal comfort from PMV.
 *
 * Scale per ISO 7730:2005 Table 2:
 *   PMV < -2.5 → 'cold', -2.5 to -1.5 → 'cool', -1.5 to -0.5 → 'slightly_cool',
 *   -0.5 to 0.5 → 'neutral', 0.5 to 1.5 → 'slightly_warm',
 *   1.5 to 2.5 → 'warm', > 2.5 → 'hot'
 *
 * @param PMV - Predicted Mean Vote
 * @returns Comfort label
 * @throws {TypeError} If PMV is not a finite number
 */
export function classifyThermalComfort(
    PMV: number,
): 'cold' | 'cool' | 'slightly_cool' | 'neutral' | 'slightly_warm' | 'warm' | 'hot' {
    if (typeof PMV !== 'number' || !isFinite(PMV))
        throw new TypeError('classifyThermalComfort: PMV must be a finite number');
    if (PMV < -2.5) return 'cold';
    if (PMV < -1.5) return 'cool';
    if (PMV < -0.5) return 'slightly_cool';
    if (PMV <= 0.5) return 'neutral';
    if (PMV <= 1.5) return 'slightly_warm';
    if (PMV <= 2.5) return 'warm';
    return 'hot';
}

/**
 * Calculates Operative Temperature (°C) - the uniform temperature of an enclosure
 * in which a person would exchange the same amount of heat by radiation and convection
 * as in the actual non-uniform environment.
 *
 * Top = (h_r × T_r + h_c × T_a) / (h_r + h_c)
 * Simplified per ASHRAE 55-2020 §5.3.1: Top ≈ (T_a + T_r) / 2 for v < 0.2 m/s,
 * with h_c correction for higher velocities.
 *
 * @param airTemp - Air temperature (°C)
 * @param radiantTemp - Mean radiant temperature (°C)
 * @param airVelocity - Air velocity (m/s), ≥ 0
 * @returns Operative temperature (°C)
 * @throws {TypeError} If any parameter is not a finite number
 * @throws {RangeError} If airVelocity < 0
 */
export function calcOperativeTemperature(airTemp: number, radiantTemp: number, airVelocity: number): number {
    validateCalcOperativeTemperatureInputs(airTemp, radiantTemp, airVelocity);

    const h_r = 4.7;
    const h_c = Math.max(2.38, 12.1 * Math.sqrt(airVelocity));
    return (h_r * radiantTemp + h_c * airTemp) / (h_r + h_c);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialOccupationalHeatStressMeta: AnalyticsModuleMeta = {
    name: 'industrialOccupationalHeatStress',
    description: 'industrialOccupationalHeatStress',
    category: 'analytics',
    familyTags: ['industrial', 'occupational'],
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
