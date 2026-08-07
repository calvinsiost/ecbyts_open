// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Default occupational health thresholds (ACGIH BEI 2024 + OSHA PEL + SCOEL BLV).
 * Loaded per project; user can override via HealthThresholdRule CRUD.
 * @module app/js/config/health-thresholds
 */

/**
 * ACGIH BEI 2024 reference values for the 5 MVP biomarkers.
 * Units: consistent with lab reporting conventions.
 * Source: ACGIH (2024). Threshold Limit Values and Biological Exposure Indices.
 * @see docs/specs/_archived/SPEC_HEALTH_ENVIRONMENTAL_MONITORING.md
 */
export const ACGIH_BEI_2024_DEFAULTS = [
    {
        biomarkerType: 'phenol',
        labelKey: 'health.biomarker.phenol',
        sampleMatrix: 'urine',
        warningValue: 150, // mg/g creatinine (0.5 × BEI)
        criticalValue: 200, // mg/g creatinine (1.0 × BEI)
        actionValue: 300, // mg/g creatinine (1.5 × BEI)
        unit: 'mg/g creatinine',
        referenceStandard: 'ACGIH-BEI-2024',
        notes: 'End-of-shift sample. Elevated by smoking; use confounder correction.',
        confounderKeys: ['smoking', 'hoursWorked'],
    },
    {
        biomarkerType: 'leadBlood',
        labelKey: 'health.biomarker.leadBlood',
        sampleMatrix: 'blood',
        warningValue: 25, // µg/dL (0.5 × BEI)
        criticalValue: 50, // µg/dL (1.0 × BEI)
        actionValue: 75, // µg/dL (1.5 × BEI)
        unit: 'µg/dL',
        referenceStandard: 'ACGIH-BEI-2024',
        notes: 'NR-15 BR limit = 60 µg/dL. ACGIH BEI = 50 µg/dL.',
        confounderKeys: ['hoursWorked', 'ppeUsed'],
    },
    {
        biomarkerType: 'benzene',
        labelKey: 'health.biomarker.benzene',
        sampleMatrix: 'urine',
        warningValue: 12.5, // µg/L (0.5 × BEI proxy)
        criticalValue: 25, // µg/L (1.0 × BEI proxy)
        actionValue: 37.5, // µg/L (1.5 × BEI proxy)
        unit: 'µg/L',
        referenceStandard: 'ACGIH-BEI-2024',
        notes: 'SPMA (S-phenylmercapturic acid) or t,t-muconic acid. BEI varies by matrix.',
        confounderKeys: ['smoking', 'hoursWorked'],
    },
    {
        biomarkerType: 'toluene',
        labelKey: 'health.biomarker.toluene',
        sampleMatrix: 'urine',
        warningValue: 0.25, // mg/L (0.5 × BEI)
        criticalValue: 0.5, // mg/L (1.0 × BEI)
        actionValue: 0.75, // mg/L (1.5 × BEI)
        unit: 'mg/L',
        referenceStandard: 'ACGIH-BEI-2024',
        notes: 'Hippuric acid. End-of-shift. Confounded by dietary benzoate.',
        confounderKeys: ['hoursWorked'],
    },
    {
        biomarkerType: 'xylene',
        labelKey: 'health.biomarker.xylene',
        sampleMatrix: 'urine',
        warningValue: 0.75, // g/g creatinine (0.5 × BEI)
        criticalValue: 1.5, // g/g creatinine (1.0 × BEI)
        actionValue: 2.25, // g/g creatinine (1.5 × BEI)
        unit: 'g/g creatinine',
        referenceStandard: 'ACGIH-BEI-2024',
        notes: 'Methylhippuric acid. End-of-shift.',
        confounderKeys: ['hoursWorked'],
    },
];

/**
 * Formula templates for confounder-adjusted thresholds.
 * Each formula receives: value, confounders object, base threshold.
 * Returns adjusted value for comparison.
 */
export const THRESHOLD_FORMULAS = {
    default: 'value',
    creatinineCorrected: 'value / (confounders.creatinine || 1)',
    smokingCorrectedPhenol: 'value - (confounders.smoking ? 50 : 0)',
    hoursWeighted: 'value / (confounders.hoursWorked || 8) * 8',
};

/**
 * Sample matrix enum for UI dropdowns and validation.
 */
export const SAMPLE_MATRIX_OPTIONS = [
    { value: 'urine', labelKey: 'health.matrix.urine' },
    { value: 'blood', labelKey: 'health.matrix.blood' },
    { value: 'breath', labelKey: 'health.matrix.breath' },
    { value: 'other', labelKey: 'health.matrix.other' },
];

/**
 * Reference standard enum for UI dropdowns.
 */
export const REFERENCE_STANDARD_OPTIONS = [
    { value: 'ACGIH-BEI-2024', labelKey: 'health.standard.acgih2024' },
    { value: 'SCOEL', labelKey: 'health.standard.scoel' },
    { value: 'OSHA-PEL', labelKey: 'health.standard.osha' },
    { value: 'custom', labelKey: 'health.standard.custom' },
];

/**
 * Status color mapping (CSS variable names, not hex - let theme decide).
 */
export const HEALTH_STATUS_COLORS = {
    green: '--health-status-green',
    yellow: '--health-status-yellow',
    red: '--health-status-red',
    darkRed: '--health-status-dark-red',
};

/**
 * Get default threshold rule for a biomarker type.
 * @param {string} biomarkerType - e.g. 'phenol'
 * @returns {object|null} rule object or null if unknown
 */
export function getDefaultThreshold(biomarkerType: string) {
    return ACGIH_BEI_2024_DEFAULTS.find((d) => d.biomarkerType === biomarkerType) || null;
}

/**
 * Evaluate a reading against its threshold rule.
 * @param {number} value - raw or adjusted reading value
 * @param {{warningValue:number, criticalValue:number, actionValue:number}} rule - threshold rule
 * @returns {'green'|'yellow'|'red'|'darkRed'} status
 */
export function evaluateReadingStatus(
    value: number,
    rule: { warningValue: number; criticalValue: number; actionValue: number },
): 'green' | 'yellow' | 'red' | 'darkRed' {
    if (value >= rule.actionValue) return 'darkRed';
    if (value >= rule.criticalValue) return 'red';
    if (value >= rule.warningValue) return 'yellow';
    return 'green';
}
