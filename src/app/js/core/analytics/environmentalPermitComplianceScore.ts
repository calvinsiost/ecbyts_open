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
 * Industrial Energy Management Index - ISO 50001:2018 EnPI / SEC / EnB
 *
 * Implements Energy Performance Indicators (EnPI) and Specific Energy Consumption
 * (SEC) per ISO 50001:2018 and ISO 50006:2014 for tracking industrial energy
 * performance over time relative to an energy baseline (EnB).
 *
 * Academic references:
 *   - ISO 50001:2018. Energy management systems - Requirements with guidance for use.
 *     International Organization for Standardization. Geneva.
 *   - ISO 50006:2014. Energy management systems - Measuring energy performance using
 *     energy baselines (EnB) and energy performance indicators (EnPI).
 *   - International Energy Agency (2014). Capturing the Multiple Benefits of Energy
 *     Efficiency. IEA/OECD, Paris. ISBN: 978-92-64-22098-1.
 *   - Thollander, P., Palm, J. (2013). Improving Energy Efficiency in Industrial
 *     Energy Systems. Springer. DOI:10.1007/978-1-4471-4162-4
 *
 * @module environmentalPermitComplianceScore
 */
'use strict';
/**
 * Calculates the Energy Performance Indicator (EnPI) ratio.
 *
 * EnPI = actual_consumption / baseline_consumption
 *
 * Per ISO 50006:2014 §4.2: EnPI < 1 indicates improved performance relative to
 * the baseline period. The baseline must represent normal operating conditions.
 *
 * @param {number} actualConsumption_kWh - Actual energy consumption in the current period (kWh), > 0
 * @param {number} baselineConsumption_kWh - Baseline energy consumption (kWh), > 0
 * @returns {number} EnPI ratio (dimensionless; < 1 = improvement, > 1 = degradation)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If either parameter is <= 0
 */
export function calcEnPI(actualConsumption_kWh: any, baselineConsumption_kWh: any) {
    if (typeof actualConsumption_kWh !== 'number' || !isFinite(actualConsumption_kWh))
        throw new TypeError('calcEnPI: actualConsumption_kWh must be a finite number');
    if (typeof baselineConsumption_kWh !== 'number' || !isFinite(baselineConsumption_kWh))
        throw new TypeError('calcEnPI: baselineConsumption_kWh must be a finite number');
    if (actualConsumption_kWh <= 0)
        throw new RangeError('calcEnPI: actualConsumption_kWh must be > 0');
    if (baselineConsumption_kWh <= 0)
        throw new RangeError('calcEnPI: baselineConsumption_kWh must be > 0');
    return actualConsumption_kWh / baselineConsumption_kWh;
}
/**
 * Calculates the Specific Energy Consumption (SEC).
 *
 * SEC = total_energy / production_units (kWh / unit)
 *
 * SEC normalizes energy use by production output, enabling comparison across
 * periods with different production volumes (ISO 50006:2014 §4.3). Commonly
 * expressed as kWh/tonne, kWh/m², or kWh/product unit.
 *
 * @param {number} totalEnergy_kWh - Total energy consumed (kWh), > 0
 * @param {number} productionUnits - Production volume (any unit), > 0
 * @returns {number} SEC (kWh per production unit)
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If either parameter is <= 0
 */
export function calcSpecificEnergyConsumption(totalEnergy_kWh: any, productionUnits: any) {
    if (typeof totalEnergy_kWh !== 'number' || !isFinite(totalEnergy_kWh))
        throw new TypeError('calcSpecificEnergyConsumption: totalEnergy_kWh must be a finite number');
    if (typeof productionUnits !== 'number' || !isFinite(productionUnits))
        throw new TypeError('calcSpecificEnergyConsumption: productionUnits must be a finite number');
    if (totalEnergy_kWh <= 0)
        throw new RangeError('calcSpecificEnergyConsumption: totalEnergy_kWh must be > 0');
    if (productionUnits <= 0)
        throw new RangeError('calcSpecificEnergyConsumption: productionUnits must be > 0');
    return totalEnergy_kWh / productionUnits;
}
/**
 * Calculates the Energy Intensity Improvement (%) between baseline and current SEC.
 *
 * improvement (%) = (SEC_baseline - SEC_current) / SEC_baseline × 100
 *
 * A positive value indicates improvement (energy savings per unit produced).
 * A negative value indicates degradation in energy intensity.
 * Source: ISO 50001:2018 §6.4 (Energy performance improvement objective).
 *
 * @param {number} SEC_baseline - Baseline Specific Energy Consumption (kWh/unit), > 0
 * @param {number} SEC_current - Current Specific Energy Consumption (kWh/unit), > 0
 * @returns {number} Energy intensity improvement (%). Positive = improvement.
 * @throws {TypeError} If parameters are not finite numbers
 * @throws {RangeError} If either parameter is <= 0
 */
export function calcEnergyIntensityImprovement(SEC_baseline: any, SEC_current: any) {
    if (typeof SEC_baseline !== 'number' || !isFinite(SEC_baseline))
        throw new TypeError('calcEnergyIntensityImprovement: SEC_baseline must be a finite number');
    if (typeof SEC_current !== 'number' || !isFinite(SEC_current))
        throw new TypeError('calcEnergyIntensityImprovement: SEC_current must be a finite number');
    if (SEC_baseline <= 0)
        throw new RangeError('calcEnergyIntensityImprovement: SEC_baseline must be > 0');
    if (SEC_current <= 0)
        throw new RangeError('calcEnergyIntensityImprovement: SEC_current must be > 0');
    return ((SEC_baseline - SEC_current) / SEC_baseline) * 100;
}
/**
 * Classifies energy performance from the EnPI ratio.
 *
 * Classification thresholds derived from IEA (2014) multiple-benefit framework
 * and ISO 50006:2014 §5 guidance on performance trending:
 *   EnPI ≤ 0.85  → 'excellent'        (≥15% below baseline)
 *   EnPI ≤ 0.95  → 'good'             (5–15% below baseline)
 *   EnPI ≤ 1.05  → 'satisfactory'     (within ±5% of baseline)
 *   EnPI ≤ 1.15  → 'needs_improvement' (5–15% above baseline)
 *   EnPI > 1.15  → 'poor'             (>15% above baseline)
 *
 * @param {number} EnPI - Energy Performance Indicator ratio (> 0)
 * @returns {'excellent'|'good'|'satisfactory'|'needs_improvement'|'poor'} Performance class
 * @throws {TypeError} If EnPI is not a finite number
 * @throws {RangeError} If EnPI <= 0
 */
export function classifyEnergyPerformance(EnPI: any) {
    if (typeof EnPI !== 'number' || !isFinite(EnPI))
        throw new TypeError('classifyEnergyPerformance: EnPI must be a finite number');
    if (EnPI <= 0)
        throw new RangeError('classifyEnergyPerformance: EnPI must be > 0');
    if (EnPI <= 0.85)
        return 'excellent';
    if (EnPI <= 0.95)
        return 'good';
    if (EnPI <= 1.05)
        return 'satisfactory';
    if (EnPI <= 1.15)
        return 'needs_improvement';
    return 'poor';
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalPermitComplianceScoreMeta = {
    name: 'environmentalPermitComplianceScore',
    description: 'environmentalPermitComplianceScore',
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
//# sourceMappingURL=environmentalPermitComplianceScore.js.map
