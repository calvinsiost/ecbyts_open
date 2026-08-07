// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Domain-specific ODS adapters — pure logic (F2 batch 3, last 5).
 *
 * Five adapters covering the remaining T2 ODS that hook into ecbyts'
 * scientific engines (gaussianPlume, health, usleRusle, validation, ana):
 *
 *   ODS 3  Good Health & Well-Being  — measureOds3Health
 *   ODS 8  Decent Work               — measureOds8DecentWork
 *   ODS 12 Responsible Consumption   — measureOds12Consumption
 *   ODS 13 Climate Action            — measureOds13Climate
 *   ODS 14 Life Below Water          — measureOds14WaterLife
 *
 * Inputs are scalar summaries from the user's model — the adapter does NOT
 * import the simulators or validators directly (pure-logic, no DOM/IDB).
 * The orchestration layer feeds these adapters from
 * `core/simulation/solvers/*`, `core/health`, `core/validation`, `core/ana`.
 *
 * Anti-requirements (SPEC_ODS_IMPACT_RISK §2):
 *   - N1: numerator NaN/null → null sub-score (anti-fabrication)
 *   - N5: imports = `_genericPure` + type only
 *   - N6: 1 file groups 5 quasi-identical adapters
 *
 * Tests live in `tests/ods-domain-adapters-pure.test.mjs`.
 */

import { measureGenericOds, type GenericOdsResult } from './_genericPure.js';

// ─── ODS 3 — Good Health & Well-Being ─────────────────────────────────────────

export interface HealthInput {
    /** Plume impact radius (m) from gaussianPlume — direction 'lower'. */
    readonly plumeImpactRadius_m?: number | null;
    /** Population inside the impact radius. */
    readonly populationInRisk?: number | null;
    /** Total population in the project's reach. */
    readonly populationTotal?: number | null;
    /** Chronic exposure ratio (concentration / reference value) — direction 'lower'. */
    readonly chronicExposureRatio?: number | null;
    /** Saturation cap for plume radius (m). */
    readonly plumeRadiusCap_m?: number;
}

export function measureOds3Health(input: HealthInput): GenericOdsResult {
    const cap = input?.plumeRadiusCap_m ?? 5000;
    return measureGenericOds({
        subIndicators: [
            {
                key: 'plumeImpactRadius',
                numerator: input?.plumeImpactRadius_m ?? null,
                denominator: cap,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'populationAtRiskShare',
                numerator: input?.populationInRisk ?? null,
                denominator: input?.populationTotal ?? null,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'chronicExposureRatio',
                numerator: input?.chronicExposureRatio ?? null,
                cap: 10,
                direction: 'lower',
            },
        ],
    });
}

// ─── ODS 8 — Decent Work & Economic Growth ────────────────────────────────────

export interface DecentWorkInput {
    /** Occupational health composite score [0, 1] from `core/health`. */
    readonly occupationalHealthScore?: number | null;
    /** Accident rate per 100k worker-hours (lower is better). */
    readonly accidentRate?: number | null;
    /** Formal employment share [0, 1] (formal contracts / total). */
    readonly formalEmploymentShare?: number | null;
    /** Saturation cap for accidentRate. */
    readonly accidentRateCap?: number;
}

export function measureOds8DecentWork(input: DecentWorkInput): GenericOdsResult {
    const cap = input?.accidentRateCap ?? 5;
    return measureGenericOds({
        subIndicators: [
            {
                key: 'occupationalHealthScore',
                numerator: input?.occupationalHealthScore ?? null,
                cap: 1,
                direction: 'higher',
            },
            {
                key: 'accidentRate',
                numerator: input?.accidentRate ?? null,
                denominator: cap,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'formalEmploymentShare',
                numerator: input?.formalEmploymentShare ?? null,
                cap: 1,
                direction: 'higher',
            },
        ],
    });
}

// ─── ODS 12 — Responsible Consumption & Production ────────────────────────────

export interface ConsumptionInput {
    /** Waste produced per unit of output (kg/unit) — direction 'lower'. */
    readonly wasteIntensity?: number | null;
    /** Share of waste recycled [0, 1] — direction 'higher'. */
    readonly recycledShare?: number | null;
    /** Share of suppliers with ESG certification [0, 1] — direction 'higher'. */
    readonly responsibleSupplierShare?: number | null;
    /** Saturation cap for waste intensity. */
    readonly wasteIntensityCap?: number;
}

export function measureOds12Consumption(input: ConsumptionInput): GenericOdsResult {
    const cap = input?.wasteIntensityCap ?? 10;
    return measureGenericOds({
        subIndicators: [
            {
                key: 'wasteIntensity',
                numerator: input?.wasteIntensity ?? null,
                denominator: cap,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'recycledShare',
                numerator: input?.recycledShare ?? null,
                cap: 1,
                direction: 'higher',
            },
            {
                key: 'responsibleSupplierShare',
                numerator: input?.responsibleSupplierShare ?? null,
                cap: 1,
                direction: 'higher',
            },
        ],
    });
}

// ─── ODS 13 — Climate Action ──────────────────────────────────────────────────

export interface ClimateInput {
    /** CO2eq emission (ton/year) — direction 'lower'. */
    readonly co2eqEmission?: number | null;
    /** Carbon offset (ton CO2eq compensated). Used for ratio = offset/emission. */
    readonly carbonOffset?: number | null;
    /** Deforestation rate (ha/year) from PRODES — direction 'lower'. */
    readonly deforestationRate?: number | null;
    /** Saturation cap for emission (ton/year). */
    readonly emissionCap?: number;
    /** Saturation cap for deforestation (ha/year). */
    readonly deforestationCap?: number;
}

export function measureOds13Climate(input: ClimateInput): GenericOdsResult {
    const emCap = input?.emissionCap ?? 10000;
    const defCap = input?.deforestationCap ?? 100;
    // Carbon offset ratio: offset / emission, capped at 1 (full neutrality)
    const offsetRatio =
        Number.isFinite(input?.carbonOffset) && Number.isFinite(input?.co2eqEmission) &&
        (input.co2eqEmission as number) > 0
            ? Math.min((input.carbonOffset as number) / (input.co2eqEmission as number), 1)
            : null;
    return measureGenericOds({
        subIndicators: [
            {
                key: 'co2eqEmission',
                numerator: input?.co2eqEmission ?? null,
                denominator: emCap,
                cap: 1,
                direction: 'lower',
            },
            {
                key: 'carbonOffsetRatio',
                numerator: offsetRatio,
                cap: 1,
                direction: 'higher',
            },
            {
                key: 'deforestationRate',
                numerator: input?.deforestationRate ?? null,
                denominator: defCap,
                cap: 1,
                direction: 'lower',
            },
        ],
    });
}

// ─── ODS 14 — Life Below Water ────────────────────────────────────────────────

export interface WaterLifeInput {
    /** Water body quality score [0, 1] (ANA ISH index normalised). */
    readonly waterBodyQualityScore?: number | null;
    /** Share of project water area legally protected [0, 1]. */
    readonly protectedWaterArea?: number | null;
    /** Aquatic biodiversity index [0, 1] (e.g. Shannon normalised). */
    readonly biodiversityIndex?: number | null;
}

export function measureOds14WaterLife(input: WaterLifeInput): GenericOdsResult {
    return measureGenericOds({
        subIndicators: [
            {
                key: 'waterBodyQualityScore',
                numerator: input?.waterBodyQualityScore ?? null,
                cap: 1,
                direction: 'higher',
            },
            {
                key: 'protectedWaterArea',
                numerator: input?.protectedWaterArea ?? null,
                cap: 1,
                direction: 'higher',
            },
            {
                key: 'biodiversityIndex',
                numerator: input?.biodiversityIndex ?? null,
                cap: 1,
                direction: 'higher',
            },
        ],
    });
}
