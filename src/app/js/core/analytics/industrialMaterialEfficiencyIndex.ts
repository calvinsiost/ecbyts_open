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
 * Industrial Material Efficiency Index - eco-efficiency + material intensity
 *
 * References:
 *   WBCSD (2000) Eco-Efficiency: Creating More Value with Less Impact.
 *     World Business Council for Sustainable Development. ISBN:2-940240-07-8
 *   Schmidt-Bleek F (1994) Wieviel Umwelt braucht der Mensch? Mips - das Mass
 *     für ökologisches Wirtschaften. Birkhäuser. ISBN:978-3764328214 (Factor 10)
 *   Hinterberger F, Luks F, Schmidt-Bleek F (1997) Material flows vs. 'natural capital':
 *     what makes an economy sustainable? Ecol. Econ. 23(1):1-14.
 *     DOI:10.1016/S0921-8009(97)00043-4
 *   EEA (2019) Resource efficiency and the circular economy in Europe.
 *     European Environment Agency. ISSN:1977-8449
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
 * Calculates Material Intensity (MI) - resource use per unit of economic value.
 * Lower MI = more resource-efficient production.
 *
 * MI = totalMaterialInput_kg / productValue_USD   (kg per USD)
 *
 * @param totalMaterialInput_kg - Total raw/process material input (kg). Must be > 0.
 * @param productValue_USD - Economic value of product output (USD). Must be > 0.
 * @returns MI (kg/USD).
 */
export function calcMaterialIntensity(totalMaterialInput_kg: number, productValue_USD: number): number {
    if (typeof totalMaterialInput_kg !== 'number' || typeof productValue_USD !== 'number') {
        throw new TypeError('calcMaterialIntensity: parameters must be numbers');
    }
    if (totalMaterialInput_kg <= 0) throw new RangeError('calcMaterialIntensity: totalMaterialInput_kg must be > 0');
    if (productValue_USD <= 0) throw new RangeError('calcMaterialIntensity: productValue_USD must be > 0');

    return totalMaterialInput_kg / productValue_USD;
}

/**
 * Calculates Eco-Efficiency (EE) - economic value created per unit of environmental impact.
 * Higher EE = more value per unit impact (WBCSD 2000 definition).
 *
 * EE = productValue / environmentalImpact
 *
 * Environmental impact may be expressed in any consistent unit (kg CO₂e, MJ, m³, etc.).
 *
 * @param productValue_USD - Economic value generated. Must be > 0.
 * @param environmentalImpact - Environmental impact (any unit). Must be > 0.
 * @returns EE (value/impact, unit depends on impact measure).
 */
export function calcEcoEfficiency(productValue_USD: number, environmentalImpact: number): number {
    if (typeof productValue_USD !== 'number' || typeof environmentalImpact !== 'number') {
        throw new TypeError('calcEcoEfficiency: parameters must be numbers');
    }
    if (productValue_USD <= 0) throw new RangeError('calcEcoEfficiency: productValue_USD must be > 0');
    if (environmentalImpact <= 0) throw new RangeError('calcEcoEfficiency: environmentalImpact must be > 0');

    return productValue_USD / environmentalImpact;
}

/**
 * Calculates Material Productivity (MP) - output per unit of material input.
 * High MP = more product per kg of material (Schmidt-Bleek Factor 10 logic).
 *
 * MP = productOutput_units / totalMaterial_kg   (units/kg)
 *
 * @param productOutput_units - Number of product units generated. Must be > 0.
 * @param totalMaterial_kg - Total material input (kg). Must be > 0.
 * @returns MP (units/kg).
 */
export function calcMaterialProductivity(productOutput_units: number, totalMaterial_kg: number): number {
    if (typeof productOutput_units !== 'number' || typeof totalMaterial_kg !== 'number') {
        throw new TypeError('calcMaterialProductivity: parameters must be numbers');
    }
    if (productOutput_units <= 0) throw new RangeError('calcMaterialProductivity: productOutput_units must be > 0');
    if (totalMaterial_kg <= 0) throw new RangeError('calcMaterialProductivity: totalMaterial_kg must be > 0');

    return productOutput_units / totalMaterial_kg;
}

/**
 * Classifies Material Intensity into efficiency tiers.
 * Thresholds derived from EEA (2019) sector benchmarks for manufacturing industries.
 *
 * MI (kg/USD):
 *   > 50        → 'very_low'       (extremely material-intensive, e.g. raw ore processing)
 *   10–50       → 'low'            (heavy industry, basic metals)
 *   2–10        → 'medium'         (automotive, chemicals)
 *   0.5–2       → 'high'           (electronics, precision parts)
 *   < 0.5       → 'best_in_class'  (software, high-tech services)
 *
 * @param MI_kg_USD - Material Intensity (kg/USD). Must be > 0.
 * @returns Efficiency tier.
 */
export function classifyMaterialEfficiency(
    MI_kg_USD: number,
): 'very_low' | 'low' | 'medium' | 'high' | 'best_in_class' {
    if (typeof MI_kg_USD !== 'number') throw new TypeError('classifyMaterialEfficiency: MI_kg_USD must be a number');
    if (MI_kg_USD <= 0) throw new RangeError('classifyMaterialEfficiency: MI_kg_USD must be > 0');

    if (MI_kg_USD > 50) return 'very_low';
    if (MI_kg_USD > 10) return 'low';
    if (MI_kg_USD > 2) return 'medium';
    if (MI_kg_USD > 0.5) return 'high';
    return 'best_in_class';
}

/**
 * Calculates Material Input per Service unit (MIPS) for a product system.
 * Based on Schmidt-Bleek (1994) Factor 10 framework.
 *
 * MIPS = totalMaterialInput_kg / serviceUnits
 *
 * @param totalMaterialInput_kg - Cradle-to-grave material input (kg). Must be > 0.
 * @param serviceUnits - Functional service units delivered (e.g. km, kWh, uses). Must be > 0.
 * @returns MIPS (kg/service unit).
 */
export function calcMIPS(totalMaterialInput_kg: number, serviceUnits: number): number {
    if (typeof totalMaterialInput_kg !== 'number' || typeof serviceUnits !== 'number') {
        throw new TypeError('calcMIPS: parameters must be numbers');
    }
    if (totalMaterialInput_kg <= 0) throw new RangeError('calcMIPS: totalMaterialInput_kg must be > 0');
    if (serviceUnits <= 0) throw new RangeError('calcMIPS: serviceUnits must be > 0');

    return totalMaterialInput_kg / serviceUnits;
}

/**
 * Computes a relative eco-efficiency improvement ratio between a baseline
 * and an improved scenario (WBCSD 2000 comparative analysis).
 *
 * ratio = EE_improved / EE_baseline  (> 1 = improvement)
 *
 * @param EE_baseline - Eco-efficiency of baseline scenario. Must be > 0.
 * @param EE_improved - Eco-efficiency of improved scenario. Must be > 0.
 */
export function calcEcoEfficiencyImprovement(
    EE_baseline: number,
    EE_improved: number,
): { ratio: number; improvement_pct: number; improved: boolean } {
    if (typeof EE_baseline !== 'number' || typeof EE_improved !== 'number') {
        throw new TypeError('calcEcoEfficiencyImprovement: parameters must be numbers');
    }
    if (EE_baseline <= 0) throw new RangeError('calcEcoEfficiencyImprovement: EE_baseline must be > 0');
    if (EE_improved <= 0) throw new RangeError('calcEcoEfficiencyImprovement: EE_improved must be > 0');

    const ratio = EE_improved / EE_baseline;
    const improvement_pct = (ratio - 1) * 100;
    return { ratio, improvement_pct, improved: ratio > 1 };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialMaterialEfficiencyIndexMeta: AnalyticsModuleMeta = {
    name: 'industrialMaterialEfficiencyIndex',
    description: 'industrialMaterialEfficiencyIndex',
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
