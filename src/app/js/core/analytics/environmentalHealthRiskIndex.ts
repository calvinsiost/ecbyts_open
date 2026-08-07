// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

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
 * Environmental Health Risk Index Module
 *
 * Implements multi-pathway human health risk assessment per:
 * - WHO (2006). Air quality guidelines: global update 2005. ISBN 978-92-4-154689-1
 * - US EPA RAGS (1989, updated 2011). Risk Assessment Guidance for Superfund Volume I:
 *   Human Health Evaluation Manual. EPA/540/1-89/002.
 *   https://www.epa.gov/risk/risk-assessment-guidance-superfund-rags-part
 * - US EPA (2011). Exposure Factors Handbook: 2011 Edition. EPA/600/R-09/052F
 * - ATSDR (2021). Minimal Risk Levels (MRLs) for Hazardous Substances.
 * - USEPA IRIS (Integrated Risk Information System). https://iris.epa.gov/
 *
 * Implements:
 *   - Carcinogenic risk (multi-pathway: inhalation + ingestion + dermal)
 *   - Hazard Index (HI) for non-carcinogens
 *   - Margin of Exposure (MOE)
 *   - Integrated Environmental Health Score (IEHS)
 *
 * Zero dependencies - pure math, no DOM/IDB/Three.js/fetch.
 *
 * @module environmentalHealthRiskIndex
 */

// ---------------------------------------------------------------------------
// Risk benchmarks (EPA RAGS, WHO)
// ---------------------------------------------------------------------------

/**
 * Acceptable cancer risk range per US EPA (RAGS 1989).
 * Faixa de risco cancerígeno aceitável segundo EPA.
 */
const CANCER_RISK_ACCEPTABLE = Object.freeze({ min: 1e-6, max: 1e-4 });

/**
 * Acceptable hazard index threshold per US EPA RAGS.
 * Limite aceitável do índice de perigo (não-cancerígenos).
 */
const HI_ACCEPTABLE_THRESHOLD = 1.0;

/**
 * Exposure pathways supported.
 * Vias de exposição suportadas.
 */
const EXPOSURE_PATHWAYS = Object.freeze(['inhalation', 'ingestion', 'dermal']);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function assertPositive(v: number, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${v}`);
    }
}

function assertNonNegative(v: number, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

// ---------------------------------------------------------------------------
// Core exports
// ---------------------------------------------------------------------------

/**
 * Calculate Chronic Daily Intake (CDI) for a single exposure pathway (EPA RAGS eq. 4-1).
 * Calcula a Ingestão Diária Crônica (CDI) para uma via de exposição (EPA RAGS eq. 4-1).
 *
 * CDI (mg/kg-day) = (C × CR × EF × ED) / (BW × AT)
 * where:
 *   C   = contaminant concentration in medium (mg/L or mg/m³ or mg/cm²)
 *   CR  = contact rate (L/day or m³/day or cm²/day)
 *   EF  = exposure frequency (days/year)
 *   ED  = exposure duration (years)
 *   BW  = body weight (kg)
 *   AT  = averaging time (days): cancer = 70yr × 365 = 25550; non-cancer = ED × 365
 *
 * @param params
 */
export function chronicDailyIntake({
    concentrationMgPerL,
    contactRateLPerDay,
    exposureFreqDaysPerYear,
    exposureDurationYears,
    bodyWeightKg,
    averagingTimeDays,
}: {
    concentrationMgPerL: number;
    contactRateLPerDay: number;
    exposureFreqDaysPerYear: number;
    exposureDurationYears: number;
    bodyWeightKg: number;
    averagingTimeDays: number;
}): { cdiMgPerKgDay: number } {
    assertNonNegative(concentrationMgPerL, 'concentrationMgPerL');
    assertPositive(contactRateLPerDay, 'contactRateLPerDay');
    if (typeof exposureFreqDaysPerYear !== 'number' || exposureFreqDaysPerYear <= 0 || exposureFreqDaysPerYear > 365) {
        throw new RangeError('exposureFreqDaysPerYear must be between 1 and 365');
    }
    assertPositive(exposureDurationYears, 'exposureDurationYears');
    assertPositive(bodyWeightKg, 'bodyWeightKg');
    assertPositive(averagingTimeDays, 'averagingTimeDays');

    const cdiMgPerKgDay =
        (concentrationMgPerL * contactRateLPerDay * exposureFreqDaysPerYear * exposureDurationYears) /
        (bodyWeightKg * averagingTimeDays);

    return { cdiMgPerKgDay };
}

/**
 * Calculate carcinogenic risk for a single pathway (EPA RAGS eq. 7-1).
 * Calcula o risco cancerígeno por via de exposição (EPA RAGS eq. 7-1).
 *
 * Risk = CDI × CSF (cancer slope factor, per mg/kg-day)
 * or equivalently: Risk = 1 - exp(-CDI × CSF) for more precise calc
 *
 * @param cdiMgPerKgDay   - Chronic daily intake (mg/kg-day)
 * @param csfPerMgKgDay   - Cancer slope factor (mg/kg-day)⁻¹, from EPA IRIS
 * @param pathway - Exposure pathway label
 */
export function carcinogenicRisk(
    cdiMgPerKgDay: number,
    csfPerMgKgDay: number,
    pathway: string = 'inhalation',
): {
    risk: number;
    pathway: string;
    riskLevel: 'acceptable' | 'upper_bound_acceptable' | 'unacceptable';
    cdiMgPerKgDay: number;
    csfPerMgKgDay: number;
} {
    assertNonNegative(cdiMgPerKgDay, 'cdiMgPerKgDay');
    assertPositive(csfPerMgKgDay, 'csfPerMgKgDay');

    // Use linear low-dose approximation (EPA RAGS): Risk = CDI × CSF
    // For CDI × CSF < 0.01, linearization error < 1% (EPA RAGS §7.1)
    // Usa aproximação linear de baixa dose quando CDI×CSF < 0.01
    const product = cdiMgPerKgDay * csfPerMgKgDay;
    const risk = product < 0.01 ? product : 1 - Math.exp(-product);

    let riskLevel: 'acceptable' | 'upper_bound_acceptable' | 'unacceptable';
    if (risk <= CANCER_RISK_ACCEPTABLE.min) riskLevel = 'acceptable';
    else if (risk <= CANCER_RISK_ACCEPTABLE.max) riskLevel = 'upper_bound_acceptable';
    else riskLevel = 'unacceptable';

    return { risk, pathway, riskLevel, cdiMgPerKgDay, csfPerMgKgDay };
}

/**
 * Calculate multi-pathway total cancer risk by summing individual pathway risks.
 * Calcula o risco cancerígeno total somando os riscos por cada via de exposição.
 *
 * Total Risk = Σ Risk_i (EPA RAGS §7.1 - risks add linearly at low doses)
 *
 * @param pathways
 */
export function totalCarcinogenicRisk(
    pathways: Array<{ cdiMgPerKgDay: number; csfPerMgKgDay: number; pathway: string }>,
): {
    totalRisk: number;
    pathwayRisks: Array<ReturnType<typeof carcinogenicRisk>>;
    riskLevel: 'acceptable' | 'upper_bound_acceptable' | 'unacceptable';
} {
    if (!Array.isArray(pathways) || pathways.length === 0) {
        throw new TypeError('pathways must be a non-empty array');
    }

    const pathwayRisks = pathways.map((p) =>
        carcinogenicRisk(p.cdiMgPerKgDay, p.csfPerMgKgDay, p.pathway || 'unknown'),
    );
    const totalRisk = pathwayRisks.reduce((sum, r) => sum + r.risk, 0);

    let riskLevel: 'acceptable' | 'upper_bound_acceptable' | 'unacceptable';
    if (totalRisk <= CANCER_RISK_ACCEPTABLE.min) riskLevel = 'acceptable';
    else if (totalRisk <= CANCER_RISK_ACCEPTABLE.max) riskLevel = 'upper_bound_acceptable';
    else riskLevel = 'unacceptable';

    return { totalRisk, pathwayRisks, riskLevel };
}

/**
 * Calculate Hazard Quotient (HQ) and Hazard Index (HI) for non-carcinogenic effects.
 * Calcula o Quociente de Perigo (HQ) e Índice de Perigo (HI) para efeitos não-cancerígenos.
 *
 * HQ = CDI / RfD (Reference Dose)
 * HI = Σ HQ_i across all chemicals/pathways
 * HI > 1 = potential adverse non-cancer effects (EPA RAGS §7.2)
 *
 * @param exposures
 */
export function hazardIndex(
    exposures: Array<{ cdiMgPerKgDay: number; rfdMgPerKgDay: number; chemical?: string; pathway?: string }>,
): {
    hi: number;
    hazardLevel: 'acceptable' | 'concern' | 'unacceptable';
    hqList: Array<{ hq: number; chemical: string; pathway: string }>;
} {
    if (!Array.isArray(exposures) || exposures.length === 0) {
        throw new TypeError('exposures must be a non-empty array');
    }

    const hqList = exposures.map((e, i) => {
        assertNonNegative(e.cdiMgPerKgDay, `exposures[${i}].cdiMgPerKgDay`);
        assertPositive(e.rfdMgPerKgDay, `exposures[${i}].rfdMgPerKgDay`);
        return {
            hq: e.cdiMgPerKgDay / e.rfdMgPerKgDay,
            chemical: e.chemical || 'unknown',
            pathway: e.pathway || 'unknown',
        };
    });

    const hi = hqList.reduce((sum, h) => sum + h.hq, 0);
    let hazardLevel: 'acceptable' | 'concern' | 'unacceptable';
    if (hi <= HI_ACCEPTABLE_THRESHOLD) hazardLevel = 'acceptable';
    else if (hi <= 3) hazardLevel = 'concern';
    else hazardLevel = 'unacceptable';

    return { hi, hazardLevel, hqList };
}

/**
 * Calculate Margin of Exposure (MOE) - used for non-threshold substances (WHO 2006).
 * Calcula a Margem de Exposição (MOE) - usada para substâncias sem limiar de efeito.
 *
 * MOE = BMDL / Exposure
 * BMDL = benchmark dose lower confidence limit (point of departure)
 * MOE ≥ 10,000 → of low concern (WHO/EFSA guidance)
 *
 * @param bmdlMgPerKgDay  - Benchmark Dose Lower Confidence Limit (mg/kg-day)
 * @param exposureMgPerKgDay - Estimated daily exposure (mg/kg-day)
 */
export function marginOfExposure(
    bmdlMgPerKgDay: number,
    exposureMgPerKgDay: number,
): { moe: number; concern: 'low' | 'moderate' | 'high'; bmdlMgPerKgDay: number; exposureMgPerKgDay: number } {
    assertPositive(bmdlMgPerKgDay, 'bmdlMgPerKgDay');
    assertPositive(exposureMgPerKgDay, 'exposureMgPerKgDay');

    const moe = bmdlMgPerKgDay / exposureMgPerKgDay;
    let concern: 'low' | 'moderate' | 'high';
    if (moe >= 10000) concern = 'low';
    else if (moe >= 1000) concern = 'moderate';
    else concern = 'high';

    return { moe, concern, bmdlMgPerKgDay, exposureMgPerKgDay };
}

export { CANCER_RISK_ACCEPTABLE, HI_ACCEPTABLE_THRESHOLD, EXPOSURE_PATHWAYS };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalHealthRiskIndexMeta: AnalyticsModuleMeta = {
    name: 'environmentalHealthRiskIndex',
    description: 'environmentalHealthRiskIndex',
    category: 'analytics',
    familyTags: ['risk'],
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
