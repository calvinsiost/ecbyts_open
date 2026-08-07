// @ts-check
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
 * @module phytoremediationEfficiencyModel
 * Phytoremediation efficiency calculations based on Pilon-Smits (2005) and EPA (2000).
 *
 * References:
 * - Pilon-Smits, E. (2005). Phytoremediation. Annual Review of Plant Biology, 56, 15-39.
 *   DOI: 10.1146/annurev.arplant.56.032604.144214
 * - Baker, A.J.M. (1981). Accumulators and excluders - strategies in the response of plants
 *   to heavy metals. Journal of Plant Nutrition, 3(1-4), 643-654.
 * - EPA (2000). Introduction to Phytoremediation. EPA/600/R-99/107. Cincinnati, OH.
 */

'use strict';

/**
 * Calculates annual mass removal via phytoextraction.
 *
 * Formula: Removal (mg/ha/yr) = BCF × TF × biomass_kg_ha × soilConc_mg_kg × 1000
 * (×1000 converts kg to g; output in mg: (mg_plant/kg_plant) × kg_plant/ha = mg/ha)
 *
 * @param {number} bioconcentrationFactor - BCF: plant-to-soil concentration ratio (dimensionless)
 * @param {number} translocFactor - TF: root-to-shoot translocation factor (dimensionless)
 * @param {number} biomass_kg_ha - Harvestable above-ground biomass (kg dry weight / ha / yr)
 * @param {number} soilConc_mg_kg - Contaminant concentration in soil (mg/kg dry weight)
 * @returns {{ removal_mg_ha_yr: number }} Annual phytoextraction removal in mg/ha/yr
 * @throws {RangeError} If any parameter is negative or biomass/soilConc are zero
 */
export function calcPhytoextractionEfficiency(bioconcentrationFactor: any, translocFactor: any, biomass_kg_ha: any, soilConc_mg_kg: any) {
    if (bioconcentrationFactor < 0 || translocFactor < 0 || biomass_kg_ha <= 0 || soilConc_mg_kg < 0) {
        throw new RangeError(
            'calcPhytoextractionEfficiency: BCF and TF must be ≥0; biomass must be >0; soilConc must be ≥0',
        );
    }
    // plant_conc (mg/kg plant) = BCF × TF × soilConc_mg_kg
    // removal (mg/ha) = plant_conc × biomass_kg_ha
    const plantConc_mg_kg = bioconcentrationFactor * translocFactor * soilConc_mg_kg;
    const removal_mg_ha_yr = plantConc_mg_kg * biomass_kg_ha;
    return { removal_mg_ha_yr };
}

/**
 * Estimates years required to reach cleanup target via phytoextraction.
 *
 * Formula: years = (initialConc - targetConc) × area_ha × soilMass_kg_ha / annualRemoval_mg_ha_yr
 * soilMass_kg_ha = soilDepth_m × bulkDensity_kg_m3 × 10000 m2/ha × 1000 g/kg → mg conversion handled
 *
 * @param {number} initialConc - Initial soil contaminant concentration (mg/kg)
 * @param {number} targetConc - Cleanup target concentration (mg/kg)
 * @param {number} annualRemoval_mg_ha_yr - Annual removal per hectare (mg/ha/yr)
 * @param {number} contamArea_ha - Contaminated area (ha)
 * @param {number} soilDepth_m - Depth of contaminated soil layer (m)
 * @param {number} bulkDensity_kg_m3 - Soil bulk density (kg/m³); typical range 1100-1800
 * @returns {{ years: number, feasible: boolean }} Years to cleanup and feasibility flag
 * @throws {RangeError} If parameters are invalid or removal rate is zero
 */
export function calcCleanupTime(
    initialConc: any,
    targetConc: any,
    annualRemoval_mg_ha_yr: any,
    contamArea_ha: any,
    soilDepth_m: any,
    bulkDensity_kg_m3: any,
) {
    if (
        initialConc < 0 ||
        targetConc < 0 ||
        annualRemoval_mg_ha_yr <= 0 ||
        contamArea_ha <= 0 ||
        soilDepth_m <= 0 ||
        bulkDensity_kg_m3 <= 0
    ) {
        throw new RangeError('calcCleanupTime: all parameters must be positive; concentrations must be ≥0');
    }
    if (initialConc <= targetConc) {
        return { years: 0, feasible: true };
    }
    // Soil mass per hectare (kg/ha): depth_m × 10000 m²/ha × bulkDensity_kg/m³
    const soilMass_kg_ha = soilDepth_m * 10000 * bulkDensity_kg_m3;
    // Mass to remove (mg): (initialConc - targetConc) mg/kg × soilMass_kg/ha × area_ha
    const massToRemove_mg = (initialConc - targetConc) * soilMass_kg_ha * contamArea_ha;
    // Total annual removal (mg/yr) = annualRemoval_mg_ha_yr × area_ha
    const totalAnnualRemoval_mg_yr = annualRemoval_mg_ha_yr * contamArea_ha;
    const years = massToRemove_mg / totalAnnualRemoval_mg_yr;
    return { years, feasible: years <= 30 };
}

/**
 * Calculates the Bioconcentration Factor (BCF).
 *
 * BCF = C_plant / C_soil
 * Values >1 indicate net accumulation; hyperaccumulators typically BCF >1.
 *
 * @param {number} plantConc_mg_kg - Contaminant concentration in plant tissue (mg/kg dry weight)
 * @param {number} soilConc_mg_kg - Contaminant concentration in soil (mg/kg dry weight)
 * @returns {{ BCF: number }} Bioconcentration Factor (dimensionless)
 * @throws {RangeError} If soilConc is zero or negative, or plantConc is negative
 */
export function calcBioconcentrationFactor(plantConc_mg_kg: any, soilConc_mg_kg: any) {
    if (plantConc_mg_kg < 0) {
        throw new RangeError('calcBioconcentrationFactor: plantConc must be ≥0');
    }
    if (soilConc_mg_kg <= 0) {
        throw new RangeError('calcBioconcentrationFactor: soilConc must be >0');
    }
    const BCF = plantConc_mg_kg / soilConc_mg_kg;
    return { BCF };
}

/**
 * Classifies phytoremediation potential per Baker (1981) thresholds.
 *
 * Classification rules (BCF and TF both >1 = hyperaccumulator; BCF>1, TF<1 = accumulator;
 * BCF<1 = excluder).
 *
 * @param {number} BCF - Bioconcentration Factor (plant/soil, dimensionless)
 * @param {number} TF - Translocation Factor (shoot/root, dimensionless)
 * @returns {{ classification: string, description: string }}
 *   classification: 'hyperaccumulator'|'accumulator'|'excluder'
 */
export function classifyPhytoremediationPotential(BCF: any, TF: any) {
    if (typeof BCF !== 'number' || typeof TF !== 'number' || BCF < 0 || TF < 0) {
        throw new TypeError('classifyPhytoremediationPotential: BCF and TF must be non-negative numbers');
    }
    if (BCF > 1 && TF > 1) {
        return {
            classification: 'hyperaccumulator',
            description: 'High accumulation in shoots — ideal for phytoextraction (Baker 1981)',
        };
    }
    if (BCF > 1 && TF <= 1) {
        return {
            classification: 'accumulator',
            description: 'Accumulates in roots; limited shoot translocation — phytostabilization candidate',
        };
    }
    return {
        classification: 'excluder',
        description: 'Low uptake relative to soil concentration — poor phytoremediation candidate',
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const phytoremediationEfficiencyModelMeta = {
    name: 'phytoremediationEfficiencyModel',
    description: 'phytoremediationEfficiencyModel',
    category: 'analytics',
    familyTags: ['remediation'],
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
