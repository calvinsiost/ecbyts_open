// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * CETESB Custom Receptor Builder — pure logic (RF-3.1 of
 * SPEC_CETESB_RISK_ASSESSMENT).
 *
 * Allows the user to define a custom receptor (e.g. "Industrial Heavy",
 * "Construction Worker Night Shift") with exposure factors clamped to
 * physiologically plausible ranges. Pure: caller passes raw params,
 * module returns a frozen CustomReceptor + an audit log of every clamp
 * applied (auditor-friendly).
 *
 * Ranges grounded on USEPA RAGS Part A (1989) + CETESB Manual §6 + ANVISA
 * RDC 359/2003 (Brazil-specific dietary reference body weights).
 *
 * Tests live in `tests/cetesb-custom-receptor-builder-pure.test.mjs`.
 */

export interface ExposureFactorsRaw {
    readonly bodyWeightKg?: number;
    readonly exposureFreqDaysYear?: number;
    readonly exposureDurationYears?: number;
    readonly averageTimeDays?: number;
    readonly inhalationRateM3PerDay?: number;
    readonly soilIngestionMgPerDay?: number;
    readonly waterIngestionLPerDay?: number;
    readonly skinSurfaceAreaCm2?: number;
    readonly soilAdherenceMgPerCm2?: number;
    readonly hoursIndoorPerDay?: number;
}

export interface ExposureFactors {
    readonly bodyWeightKg: number;
    readonly exposureFreqDaysYear: number;
    readonly exposureDurationYears: number;
    readonly averageTimeDays: number;
    readonly inhalationRateM3PerDay: number;
    readonly soilIngestionMgPerDay: number;
    readonly waterIngestionLPerDay: number;
    readonly skinSurfaceAreaCm2: number;
    readonly soilAdherenceMgPerCm2: number;
    readonly hoursIndoorPerDay: number;
}

export interface CustomReceptor {
    readonly id: string;
    readonly displayName: string;
    readonly baseReceptor: 'RES_URB' | 'RES_RUR' | 'TRAB_COM_IND' | 'TRAB_OBRA_CIV' | 'CUSTOM';
    readonly factors: ExposureFactors;
    /** Audit log: list of clamps applied + the raw value the user proposed. */
    readonly clampedLog: ReadonlyArray<ClampEntry>;
}

export interface ClampEntry {
    readonly field: keyof ExposureFactors;
    readonly userValue: number;
    readonly clampedValue: number;
    readonly reason: 'below_min' | 'above_max' | 'invalid_input';
    readonly limit: number;
}

export interface ReceptorBuildResult {
    readonly receptor: CustomReceptor | null;
    readonly errors: ReadonlyArray<string>;
}

/**
 * Physiologically plausible ranges grounded in RBCA / CETESB / ANVISA.
 * `defaultValue` used when user omits the field entirely.
 */
const RANGES: Readonly<
    Record<
        keyof ExposureFactors,
        { readonly min: number; readonly max: number; readonly defaultValue: number }
    >
> = Object.freeze({
    bodyWeightKg: { min: 20, max: 200, defaultValue: 70 },
    exposureFreqDaysYear: { min: 1, max: 365, defaultValue: 350 },
    exposureDurationYears: { min: 0.1, max: 70, defaultValue: 30 },
    averageTimeDays: { min: 1, max: 70 * 365, defaultValue: 70 * 365 },
    inhalationRateM3PerDay: { min: 5, max: 30, defaultValue: 20 },
    soilIngestionMgPerDay: { min: 0, max: 500, defaultValue: 100 },
    waterIngestionLPerDay: { min: 0, max: 5, defaultValue: 2 },
    skinSurfaceAreaCm2: { min: 100, max: 30000, defaultValue: 5700 },
    soilAdherenceMgPerCm2: { min: 0, max: 5, defaultValue: 0.2 },
    hoursIndoorPerDay: { min: 0, max: 24, defaultValue: 16 },
});

function clampField(
    field: keyof ExposureFactors,
    raw: unknown,
    log: ClampEntry[],
): number {
    const range = RANGES[field];
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        log.push({
            field,
            userValue: typeof raw === 'number' ? raw : NaN,
            clampedValue: range.defaultValue,
            reason: 'invalid_input',
            limit: range.defaultValue,
        });
        return range.defaultValue;
    }
    if (raw < range.min) {
        log.push({
            field,
            userValue: raw,
            clampedValue: range.min,
            reason: 'below_min',
            limit: range.min,
        });
        return range.min;
    }
    if (raw > range.max) {
        log.push({
            field,
            userValue: raw,
            clampedValue: range.max,
            reason: 'above_max',
            limit: range.max,
        });
        return range.max;
    }
    return raw;
}

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

/**
 * Build a custom receptor from raw user input. Pure: clamps each
 * exposure factor to its physiological range, recording every clamp in
 * `clampedLog` for auditor inspection.
 */
export function buildCustomReceptor(
    id: string | null | undefined,
    displayName: string | null | undefined,
    baseReceptor: CustomReceptor['baseReceptor'] | null | undefined,
    raw: ExposureFactorsRaw | null | undefined,
): ReceptorBuildResult {
    const errors: string[] = [];
    if (!isNonEmptyString(id)) errors.push('id_missing');
    if (!isNonEmptyString(displayName)) errors.push('displayName_missing');
    const allowedBases: ReadonlyArray<CustomReceptor['baseReceptor']> = Object.freeze([
        'RES_URB',
        'RES_RUR',
        'TRAB_COM_IND',
        'TRAB_OBRA_CIV',
        'CUSTOM',
    ]);
    if (!baseReceptor || !allowedBases.includes(baseReceptor)) {
        errors.push('baseReceptor_invalid');
    }
    if (errors.length > 0) {
        return Object.freeze({ receptor: null, errors: Object.freeze(errors) });
    }
    const input = raw && typeof raw === 'object' ? raw : ({} as ExposureFactorsRaw);
    const clampedLog: ClampEntry[] = [];
    const factors: ExposureFactors = {
        bodyWeightKg: clampField('bodyWeightKg', input.bodyWeightKg, clampedLog),
        exposureFreqDaysYear: clampField('exposureFreqDaysYear', input.exposureFreqDaysYear, clampedLog),
        exposureDurationYears: clampField('exposureDurationYears', input.exposureDurationYears, clampedLog),
        averageTimeDays: clampField('averageTimeDays', input.averageTimeDays, clampedLog),
        inhalationRateM3PerDay: clampField('inhalationRateM3PerDay', input.inhalationRateM3PerDay, clampedLog),
        soilIngestionMgPerDay: clampField('soilIngestionMgPerDay', input.soilIngestionMgPerDay, clampedLog),
        waterIngestionLPerDay: clampField('waterIngestionLPerDay', input.waterIngestionLPerDay, clampedLog),
        skinSurfaceAreaCm2: clampField('skinSurfaceAreaCm2', input.skinSurfaceAreaCm2, clampedLog),
        soilAdherenceMgPerCm2: clampField('soilAdherenceMgPerCm2', input.soilAdherenceMgPerCm2, clampedLog),
        hoursIndoorPerDay: clampField('hoursIndoorPerDay', input.hoursIndoorPerDay, clampedLog),
    };
    const receptor: CustomReceptor = Object.freeze({
        id: id as string,
        displayName: displayName as string,
        baseReceptor: baseReceptor as CustomReceptor['baseReceptor'],
        factors: Object.freeze(factors),
        clampedLog: Object.freeze(clampedLog),
    });
    return Object.freeze({ receptor, errors: Object.freeze(errors) });
}

/**
 * Convenience — list the canonical ranges (useful for UI hints and tests).
 */
export function getExposureFactorRanges(): typeof RANGES {
    return RANGES;
}
