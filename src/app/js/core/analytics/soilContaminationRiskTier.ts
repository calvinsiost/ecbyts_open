// @ts-check
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

/**
 * Soil Contamination Risk Tier Screening
 *
 * Implements Risk-Based Corrective Action (RBCA) Tier 1 and Tier 2 screening per:
 * - ASTM E1739-95 (2015): Standard Guide for Risk-Based Corrective Action Applied at
 *   Petroleum Release Sites. DOI: 10.1520/E1739-95R15
 * - CETESB (2021): Manual de Gerenciamento de Áreas Contaminadas. São Paulo.
 * - CONAMA Resolution 420/2009: Quality criteria and intervention guidelines for soil
 *   and groundwater contamination.
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module soilContaminationRiskTier
 */

/**
 * CONAMA 420/2009 and CETESB 2021 threshold reference values (mg/kg dry soil).
 * Valores de referência CONAMA 420/2009 e CETESB 2021 (mg/kg solo seco).
 *
 * Structure: { [parameter]: { vr, vp, vi_agr, vi_res, vi_ind } }
 * vr  = Valor de Referência (background natural)
 * vp  = Valor de Prevenção
 * vi_agr = Valor de Intervenção - uso agrícola
 * vi_res = Valor de Intervenção - uso residencial
 * vi_ind = Valor de Intervenção - uso industrial
 */
const THRESHOLD_TABLE = {
    arsenic: { vr: 3.5, vp: 15, vi_agr: 35, vi_res: 55, vi_ind: 150 },
    cadmium: { vr: 0.5, vp: 1.3, vi_agr: 3, vi_res: 8, vi_ind: 20 },
    chromium: { vr: 40, vp: 75, vi_agr: 150, vi_res: 300, vi_ind: 400 },
    copper: { vr: 35, vp: 60, vi_agr: 200, vi_res: 400, vi_ind: 600 },
    lead: { vr: 17, vp: 72, vi_agr: 180, vi_res: 300, vi_ind: 900 },
    mercury: { vr: 0.05, vp: 0.5, vi_agr: 12, vi_res: 36, vi_ind: 70 },
    nickel: { vr: 13, vp: 30, vi_agr: 70, vi_res: 100, vi_ind: 130 },
    zinc: { vr: 60, vp: 300, vi_agr: 450, vi_res: 1000, vi_ind: 2000 },
    benzene: { vr: null, vp: 0.03, vi_agr: 0.1, vi_res: 0.5, vi_ind: 1.7 },
    toluene: { vr: null, vp: 0.03, vi_agr: 25, vi_res: 100, vi_ind: 300 },
    bap: { vr: null, vp: 0.1, vi_agr: 0.4, vi_res: 0.8, vi_ind: 3.0 }, // benzo[a]pyrene
    tph: { vr: null, vp: 50, vi_agr: 100, vi_res: 300, vi_ind: 1000 }, // total petroleum hydrocarbons
};

/** Land use types accepted by Tier 1 screening. */
const LAND_USE_TYPES = ['agricultural', 'residential', 'industrial'];

/**
 * Tier 1 screening: compare measured concentration against CONAMA 420/2009 thresholds.
 * Triagem Tier 1: comparação direta com valores de referência CONAMA 420/2009.
 *
 * @param {object} params
 * @param {string} params.parameter   - Parameter name (see THRESHOLD_TABLE keys)
 * @param {number} params.concentration - Measured concentration (mg/kg dry soil)
 * @param {string} params.landUse     - Land use type: 'agricultural'|'residential'|'industrial'
 * @returns {{
 *   parameter: string,
 *   concentration: number,
 *   landUse: string,
 *   vr: number|null,
 *   vp: number,
 *   vi: number,
 *   exceedsVR: boolean,
 *   exceedsVP: boolean,
 *   exceedsVI: boolean,
 *   requiredAction: string,
 *   actionCode: number
 * }}
 * @throws {TypeError} if parameter is unknown
 * @throws {RangeError} if concentration is negative or landUse is invalid
 */
export function tier1Screening(
    opts: { parameter?: string; concentration?: number; landUse?: string } = ({}),
) {
    const { parameter, concentration, landUse } = opts;
    const key = String(parameter).toLowerCase();
    const table =
        (
            THRESHOLD_TABLE
        ) as Record<string, { vr: number | null; vp: number; vi_agr: number; vi_res: number; vi_ind: number }>;
    if (!table[key]) {
        throw new TypeError(
            `tier1Screening: unknown parameter "${parameter}". Known: ${Object.keys(THRESHOLD_TABLE).join(', ')}`,
        );
    }
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError(`tier1Screening: concentration must be >= 0, got ${concentration}`);
    }
    if (typeof landUse !== 'string' || !LAND_USE_TYPES.includes(landUse)) {
        throw new RangeError(`tier1Screening: landUse must be one of ${LAND_USE_TYPES.join('|')}, got "${landUse}"`);
    }
    const landUseStr = /** @type {string} */ (landUse);

    const thresholds = table[key];
    const viKeyMap = ({
        agricultural: 'vi_agr',
        residential: 'vi_res',
        industrial: 'vi_ind',
    }) as Record<string, 'vi_agr' | 'vi_res' | 'vi_ind'>;
    const viKey = viKeyMap[landUseStr];
    const vi = thresholds[viKey!];
    const vp = thresholds.vp;
    const vr = thresholds.vr;

    const exceedsVR = vr !== null && concentration > vr;
    const exceedsVP = concentration > vp;
    const exceedsVI = concentration > vi;

    let requiredAction, actionCode;
    if (exceedsVI) {
        requiredAction = 'remediation';
        actionCode = 3;
    } else if (exceedsVP) {
        requiredAction = 'monitoring';
        actionCode = 2;
    } else if (exceedsVR) {
        requiredAction = 'investigation';
        actionCode = 1;
    } else {
        requiredAction = 'no_action';
        actionCode = 0;
    }

    return {
        parameter: key,
        concentration,
        landUse: landUseStr,
        vr,
        vp,
        vi,
        exceedsVR,
        exceedsVP,
        exceedsVI,
        requiredAction,
        actionCode,
    };
}

/**
 * Tier 2 simplified risk calculation - dermal/ingestion pathway for residential receptor.
 * Cálculo simplificado de risco Tier 2 - vias dérmica e ingestão para receptor residencial.
 *
 * Risk = CSF × CDI  (carcinogenic risk approach, ASTM E1739-95 §7.3)
 * CDI = (C × IR × EF × ED) / (BW × AT × CF)
 *
 * For non-carcinogens: Hazard Quotient (HQ) = CDI / RfD
 *
 * @param {object} params
 * @param {number} params.concentration      - Soil concentration (mg/kg)
 * @param {number} params.inhalationRate_mH  - Inhalation rate (m³/h, default 0.83 for adult)
 * @param {number} params.exposureDaysPerYear- Days exposed per year (default 350 for residential)
 * @param {number} params.exposureDuration   - Exposure duration (years, default 30)
 * @param {number} params.bodyWeight_kg      - Body weight (kg, default 70)
 * @param {number} params.rfD_mg_kg_day      - Reference dose (mg/kg-day, carcinogen slope factor if CSF mode)
 * @param {string} [params.mode]             - 'hq' (hazard quotient) | 'risk' (carcinogenic)
 * @param {number} [params.csf]              - Cancer slope factor (mg/kg-day)⁻¹ - required if mode=risk
 * @returns {{ cdi: number, hazardQuotient: number|null, carcinogenicRisk: number|null, tier2Class: string }}
 * @throws {RangeError} if physiological parameters are outside plausible ranges
 */
export function tier2RiskCalc(
    opts: { concentration?: number; inhalationRate_mH?: number; exposureDaysPerYear?: number; exposureDuration?: number; bodyWeight_kg?: number; rfD_mg_kg_day?: number; mode?: string; csf?: number } = ({}),
) {
    const {
        concentration,
        inhalationRate_mH = 0.83,
        exposureDaysPerYear = 350,
        exposureDuration = 30,
        bodyWeight_kg = 70,
        rfD_mg_kg_day,
        mode = 'hq',
        csf,
    } = opts;
    if (typeof concentration !== 'number' || concentration < 0) {
        throw new RangeError(`tier2RiskCalc: concentration must be >= 0, got ${concentration}`);
    }
    if (typeof bodyWeight_kg !== 'number' || bodyWeight_kg <= 0 || bodyWeight_kg > 300) {
        throw new RangeError(`tier2RiskCalc: bodyWeight_kg must be in (0, 300], got ${bodyWeight_kg}`);
    }
    if (typeof exposureDaysPerYear !== 'number' || exposureDaysPerYear <= 0 || exposureDaysPerYear > 365) {
        throw new RangeError(`tier2RiskCalc: exposureDaysPerYear must be in (0, 365], got ${exposureDaysPerYear}`);
    }

    const EF = exposureDaysPerYear / 365;
    const ED = exposureDuration; // years
    const AT = mode === 'risk' ? 70 * 365 : ED * 365; // averaging time (days)
    // eslint-disable-next-line
    const CF = 1e-6; // unit conversion factor (mg/kg to mg/kg)

    // CDI = Chronic Daily Intake via inhalation of re-suspended soil (simplified)
    // CDI = Ingestão Diária Crônica por inalação de solo ressuspenso (simplificado)
    const IR = inhalationRate_mH * 8; // m³/day (8h work day adapted to 24h residential)
    const cdi = (concentration * IR * EF * ED) / (bodyWeight_kg * AT * 1); // mg/kg-day

    let hazardQuotient = null;
    let carcinogenicRisk = null;

    if (mode === 'hq') {
        if (typeof rfD_mg_kg_day !== 'number' || rfD_mg_kg_day <= 0) {
            throw new RangeError('tier2RiskCalc: rfD_mg_kg_day required and must be positive for mode=hq');
        }
        hazardQuotient = Math.round((cdi / rfD_mg_kg_day) * 1e6) / 1e6;
    } else if (mode === 'risk') {
        if (typeof csf !== 'number' || csf <= 0) {
            throw new RangeError('tier2RiskCalc: csf required and must be positive for mode=risk');
        }
        carcinogenicRisk = Math.round(cdi * csf * 1e10) / 1e10;
    }

    // Classification per CETESB 2021 Table 4.1
    // Classificação por risco
    let tier2Class;
    if (hazardQuotient !== null) {
        tier2Class = hazardQuotient <= 1 ? 'acceptable' : hazardQuotient <= 10 ? 'moderate' : 'high';
    } else if (carcinogenicRisk !== null) {
        tier2Class = carcinogenicRisk <= 1e-6 ? 'acceptable' : carcinogenicRisk <= 1e-4 ? 'moderate' : 'high';
    } else {
        tier2Class = 'unknown';
    }

    return {
        cdi: Math.round(cdi * 1e10) / 1e10,
        hazardQuotient,
        carcinogenicRisk,
        tier2Class,
    };
}

/**
 * Classify intervention priority based on multiple parameter results.
 * Classifica a prioridade de intervenção com base em múltiplos resultados de parâmetros.
 *
 * Combines actionCodes from multiple tier1Screening calls into a site-level priority.
 *
 * @param {Array<{actionCode: number, parameter: string, concentration: number}>} screeningResults
 * @returns {{ sitePriority: string, maxActionCode: number, triggeredParameters: string[] }}
 * @throws {TypeError} if screeningResults is not an array
 */
export function classifyInterventionPriority(screeningResults: any) {
    if (!Array.isArray(screeningResults) || screeningResults.length === 0) {
        throw new TypeError('classifyInterventionPriority: screeningResults must be a non-empty array');
    }

    let maxActionCode = 0;
    const triggeredParameters = [];

    for (const result of screeningResults) {
        if (typeof result.actionCode !== 'number') {
            throw new TypeError('classifyInterventionPriority: each result must have numeric actionCode');
        }
        if (result.actionCode > maxActionCode) maxActionCode = result.actionCode;
        if (result.actionCode >= 2) triggeredParameters.push(result.parameter);
    }

    const priorityMap = ({ 0: 'low', 1: 'low', 2: 'medium', 3: 'high' }) as Record<number, string>;
    return {
        sitePriority: priorityMap[maxActionCode] ?? 'unknown',
        maxActionCode,
        triggeredParameters,
    };
}

/**
 * List all parameters available in the CONAMA 420/2009 reference table.
 * Lista todos os parâmetros disponíveis na tabela de referência CONAMA 420/2009.
 *
 * @returns {string[]}
 */
export function listAvailableParameters() {
    return Object.keys(THRESHOLD_TABLE);
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const soilContaminationRiskTierMeta = {
    name: 'soilContaminationRiskTier',
    description: 'soilContaminationRiskTier',
    category: 'analytics',
    familyTags: ['soil', 'risk', 'hydrocarbon'],
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
