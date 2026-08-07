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
 * @module circularEconomyMaterialFlow
 * Material Flow Analysis (MFA) and Circular Economy indicators.
 *
 * References:
 * - Ellen MacArthur Foundation (2013). Towards the Circular Economy: Economic and Business
 *   Rationale for an Accelerated Transition. Vol. 1.
 * - Eurostat (2018). Economy-wide Material Flow Accounts - Handbook. ISBN 978-92-79-65972-1.
 * - Kirchherr, J., Reike, D., Hekkert, M. (2017). Conceptualizing the Circular Economy.
 *   Resources, Conservation and Recycling, 127, 221-232.
 *   DOI: 10.1016/j.resconrec.2017.09.005
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
 * Calculates the Material Circularity Indicator (MCI) per Ellen MacArthur Foundation methodology.
 *
 * MCI = 1 - LFI, where:
 * LFI (Linear Flow Index) = (V + W) / (2M + F_u)
 * V = virgin material input, W = unrecovered waste output,
 * M = total mass processed, F_u = utility factor (functional efficiency, default 1.0).
 *
 * Simplified approximation (inputs available):
 * MCI = (recycledInput / totalMass) × (recyclableOutput / totalMass) × (1 - wasteLeakage / totalMass)
 * Clamped to [0, 1].
 *
 * @param recycledInput - Mass of recycled/reused material entering process (kg)
 * @param recyclableOutput - Mass of recyclable output at end-of-life (kg)
 * @param totalMass - Total mass processed (kg)
 * @param wasteLeakage - Non-recovered waste lost to landfill/environment (kg)
 * @returns MCI [0-1] and Linear Flow Index
 * @throws {RangeError} If any value is negative or totalMass is zero
 */
export function calcMaterialCircularityIndicator(
    recycledInput: number,
    recyclableOutput: number,
    totalMass: number,
    wasteLeakage: number,
): { MCI: number; LFI: number } {
    if (recycledInput < 0 || recyclableOutput < 0 || wasteLeakage < 0 || totalMass <= 0) {
        throw new RangeError('calcMaterialCircularityIndicator: all mass values must be ≥0 and totalMass >0');
    }
    // Linear Flow Index: fraction of linear (non-circular) flow
    const virginInput = Math.max(0, totalMass - recycledInput);
    const LFI = Math.min(1, (virginInput + wasteLeakage) / (2 * totalMass));
    const MCI = Math.max(0, Math.min(1, 1 - LFI));
    return { MCI, LFI };
}

/**
 * Calculates Resource Productivity (RP) - GDP generated per unit of material consumed.
 *
 * RP = GDP / TMC (Total Material Consumption)
 * Eurostat MFA methodology 2018.
 *
 * @param GDP - Gross Domestic Product (monetary unit, e.g. USD or BRL)
 * @param totalMaterialConsumption - TMC in tonnes or kg (same unit as desired output)
 * @returns RP value and unit descriptor
 * @throws {RangeError} If GDP is negative or TMC is zero/negative
 */
export function calcResourceProductivity(
    GDP: number,
    totalMaterialConsumption: number,
): { resourceProductivity: number; unit: string } {
    if (GDP < 0) {
        throw new RangeError('calcResourceProductivity: GDP must be ≥0');
    }
    if (totalMaterialConsumption <= 0) {
        throw new RangeError('calcResourceProductivity: totalMaterialConsumption must be >0');
    }
    const resourceProductivity = GDP / totalMaterialConsumption;
    return { resourceProductivity, unit: 'monetary_unit_per_mass_unit' };
}

/**
 * Calculates total waste recovery rate (recycled + reused + energy recovered).
 *
 * WRR (%) = (recycled + reused + recovered) / totalWaste × 100
 * Per EU Waste Framework Directive 2008/98/EC target framework.
 *
 * @param recycled - Mass recycled (kg)
 * @param reused - Mass directly reused without reprocessing (kg)
 * @param recovered - Mass recovered for energy (kg)
 * @param totalWaste - Total waste generated (kg)
 * @returns Recovery rate and total recovered mass
 * @throws {RangeError} If any value is negative or totalWaste is zero
 */
export function calcWasteRecoveryRate(
    recycled: number,
    reused: number,
    recovered: number,
    totalWaste: number,
): { wasteRecoveryRate_pct: number; recovered_kg: number } {
    if (recycled < 0 || reused < 0 || recovered < 0 || totalWaste <= 0) {
        throw new RangeError('calcWasteRecoveryRate: recycled/reused/recovered must be ≥0; totalWaste must be >0');
    }
    const totalRecovered = recycled + reused + recovered;
    if (totalRecovered > totalWaste) {
        throw new RangeError('calcWasteRecoveryRate: sum of recovered streams cannot exceed totalWaste');
    }
    const wasteRecoveryRate_pct = (totalRecovered / totalWaste) * 100;
    return { wasteRecoveryRate_pct, recovered_kg: totalRecovered };
}

/**
 * Classifies circularity performance based on MCI value.
 *
 * Thresholds aligned with Ellen MacArthur Foundation (2013) and
 * Kirchherr et al. (2017) qualitative tiers.
 *
 * @param MCI - Material Circularity Indicator [0-1]
 * @returns classification: 'linear'|'slightly_circular'|'moderately_circular'|'highly_circular'|'fully_circular'
 * @throws {RangeError} If MCI is outside [0, 1]
 */
export function classifyCircularityPerformance(MCI: number): { classification: string; description: string } {
    if (typeof MCI !== 'number' || MCI < 0 || MCI > 1) {
        throw new RangeError('classifyCircularityPerformance: MCI must be a number in [0, 1]');
    }
    if (MCI < 0.1) {
        return {
            classification: 'linear',
            description: 'Predominantly linear flow — virgin materials dominant, high waste leakage',
        };
    }
    if (MCI < 0.35) {
        return {
            classification: 'slightly_circular',
            description: 'Limited circularity — some recycling but high linear loss',
        };
    }
    if (MCI < 0.6) {
        return {
            classification: 'moderately_circular',
            description: 'Moderate circularity — meaningful recycled content and recovery',
        };
    }
    if (MCI < 0.9) {
        return {
            classification: 'highly_circular',
            description: 'High circularity — approaching closed-loop; minimal leakage',
        };
    }
    return {
        classification: 'fully_circular',
        description: 'Near-complete circular flow — all material recovered and recirculated',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const circularEconomyMaterialFlowMeta: AnalyticsModuleMeta = {
    name: 'circularEconomyMaterialFlow',
    description: 'circularEconomyMaterialFlow',
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
