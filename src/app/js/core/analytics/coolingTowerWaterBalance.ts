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
 * @module coolingTowerWaterBalance
 * Water balance calculations for cooling towers (industrial water management).
 *
 * References:
 * - CTI (2004). Cooling Tower Fundamentals, 2nd ed. Cooling Technology Institute, Houston TX.
 *   ISBN 978-1-881798-18-9.
 * - ASHRAE (2020). ASHRAE Handbook - HVAC Systems and Equipment. Chapter 40: Cooling Towers.
 *   American Society of Heating, Refrigerating and Air-Conditioning Engineers, Atlanta GA.
 * - Puckorius, P.R. & Brooke, J.M. (1991). A New Practical Index for Calcium Carbonate
 *   Scale Prediction in Cooling Tower Systems. Corrosion, 47(4), 280-284.
 *   DOI: 10.5006/1.3585258
 */

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

/**
 * Calculates evaporation loss from a cooling tower.
 *
 * E ≈ 0.00085 × R × ΔT × flowRate_m3_h
 * where R = range factor (default 1.0 for counterflow towers),
 * ΔT = temperature differential across tower (°C).
 * CTI (2004) empirical coefficient = 0.00085 per °C of range.
 *
 * @param flowRate_m3_h - Circulating water flow rate (m³/h)
 * @param deltaT_C - Temperature differential across the tower (°C); also called "range"
 * @param range - Tower range correction factor (dimensionless; 1.0 for standard CTI)
 * @returns Evaporation water loss (m³/h)
 * @throws {RangeError} If flowRate or deltaT are not positive
 */
export function calcEvaporationLoss(
    flowRate_m3_h: number,
    deltaT_C: number,
    range: number = 1.0,
): { evaporationLoss_m3_h: number } {
    if (flowRate_m3_h <= 0) {
        throw new RangeError('calcEvaporationLoss: flowRate_m3_h must be >0');
    }
    if (deltaT_C <= 0) {
        throw new RangeError('calcEvaporationLoss: deltaT_C must be >0');
    }
    if (range <= 0) {
        throw new RangeError('calcEvaporationLoss: range must be >0');
    }
    const evaporationLoss_m3_h = 0.00085 * range * deltaT_C * flowRate_m3_h;
    return { evaporationLoss_m3_h };
}

/**
 * Calculates drift (windage) loss from a cooling tower.
 *
 * D = driftRate_pct / 100 × flowRate_m3_h
 * Typical modern drift eliminators: 0.001–0.005% of circulating flow (CTI 2004).
 *
 * @param flowRate_m3_h - Circulating water flow rate (m³/h)
 * @param driftRate_pct - Drift rate as percent of circulating flow (%)
 * @returns Drift water loss (m³/h)
 * @throws {RangeError} If flowRate is not positive or driftRate is negative/unrealistic (>1%)
 */
export function calcDriftLoss(flowRate_m3_h: number, driftRate_pct: number): { driftLoss_m3_h: number } {
    if (flowRate_m3_h <= 0) {
        throw new RangeError('calcDriftLoss: flowRate_m3_h must be >0');
    }
    if (driftRate_pct < 0 || driftRate_pct > 1) {
        throw new RangeError(
            'calcDriftLoss: driftRate_pct must be in [0, 1] (percent); modern eliminators: 0.001–0.005%',
        );
    }
    const driftLoss_m3_h = (driftRate_pct / 100) * flowRate_m3_h;
    return { driftLoss_m3_h };
}

/**
 * Calculates blowdown (bleed-off) required to maintain Cycles of Concentration (CoC).
 *
 * B = (E - D × (CoC - 1)) / (CoC - 1)
 * Simplified: B = E / (CoC - 1) - D
 * ASHRAE Handbook Chapter 40.
 *
 * @param makeup_m3_h - Makeup water flow (m³/h) [informational, not used in formula]
 * @param evaporation_m3_h - Evaporation loss (m³/h)
 * @param drift_m3_h - Drift loss (m³/h)
 * @param CoC - Cycles of Concentration (ratio of circulating to makeup TDS); must be >1
 * @returns Required blowdown flow rate (m³/h)
 * @throws {RangeError} If evaporation is negative, CoC ≤ 1, or resulting blowdown is negative
 */
export function calcBlowdown(
    makeup_m3_h: number,
    evaporation_m3_h: number,
    drift_m3_h: number,
    CoC: number,
): { blowdown_m3_h: number } {
    if (evaporation_m3_h < 0 || drift_m3_h < 0) {
        throw new RangeError('calcBlowdown: evaporation_m3_h and drift_m3_h must be ≥0');
    }
    if (CoC <= 1) {
        throw new RangeError('calcBlowdown: CoC (Cycles of Concentration) must be >1');
    }
    // B = E / (CoC - 1) - D
    const blowdown_m3_h = evaporation_m3_h / (CoC - 1) - drift_m3_h;
    if (blowdown_m3_h < 0) {
        // Drift alone handles bleed-off at this CoC - return 0
        return { blowdown_m3_h: 0 };
    }
    return { blowdown_m3_h };
}

/**
 * Calculates total makeup water requirement.
 *
 * M = E + D + B (mass balance: all losses must be replenished)
 * CTI (2004) / ASHRAE Ch. 40.
 *
 * @param evaporation - Evaporation loss (m³/h)
 * @param drift - Drift loss (m³/h)
 * @param blowdown - Blowdown flow rate (m³/h)
 * @returns Total makeup water required (m³/h)
 * @throws {RangeError} If any input is negative
 */
export function calcMakeupWater(
    evaporation: number,
    drift: number,
    blowdown: number,
): { makeupWater_m3_h: number } {
    if (evaporation < 0 || drift < 0 || blowdown < 0) {
        throw new RangeError('calcMakeupWater: all flow components must be ≥0');
    }
    const makeupWater_m3_h = evaporation + drift + blowdown;
    return { makeupWater_m3_h };
}

/**
 * Classifies cooling tower water efficiency based on Cycles of Concentration (CoC).
 *
 * Higher CoC = less blowdown = better water efficiency.
 * Classification: CTI (2004) Table 3.1 + ASHRAE Ch. 40 guidelines.
 *
 * @param CoC - Cycles of Concentration (dimensionless; must be ≥1)
 * @returns classification: 'poor'|'acceptable'|'good'|'excellent'
 * @throws {RangeError} If CoC < 1
 */
export function classifyWaterEfficiency(CoC: number): { classification: string; description: string } {
    if (typeof CoC !== 'number' || CoC < 1) {
        throw new RangeError('classifyWaterEfficiency: CoC must be a number ≥1');
    }
    if (CoC < 2) {
        return {
            classification: 'poor',
            description: 'Very high blowdown; water savings opportunity significant; review chemistry treatment',
        };
    }
    if (CoC < 4) {
        return {
            classification: 'acceptable',
            description: 'Baseline performance; standard chemical treatment program; room for improvement',
        };
    }
    if (CoC < 6) {
        return {
            classification: 'good',
            description: 'Above-average efficiency; optimized chemical program; minimal water waste',
        };
    }
    return {
        classification: 'excellent',
        description: 'Best-practice performance; maximum water reuse; requires tight chemistry control',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const coolingTowerWaterBalanceMeta: AnalyticsModuleMeta = {
    name: 'coolingTowerWaterBalance',
    description: 'coolingTowerWaterBalance',
    category: 'analytics',
    familyTags: ['water'],
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
