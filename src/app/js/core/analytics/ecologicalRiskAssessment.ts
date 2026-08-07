// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining -- Ecological Risk Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Ecological Risk Assessment (ERA) -- Hazard Quotient, SSD, Ecosystem Services
 *
 * Pure module implementing ERA components: hazard quotient (HQ), species
 * sensitivity distribution (SSD), ecosystem service loss, and risk level.
 * Zero dependencies on DOM, IDB, Three.js or fetch.
 *
 * References:
 *   - ECHA (2011). Guidance Chemical Safety Assessment Chapter R.10. ECHA-2008-GD-003-EN.
 *   - Posthuma et al. (2002). Species Sensitivity Distributions in Ecotoxicology. CRC Press.
 *   - MEA (2005). Millennium Ecosystem Assessment. Island Press. ISBN: 978-1-59726-040-4
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

// Service weights (MEA 2005)
// Pesos dos servicos ecossistemicos usados no calculo de perda
const SERVICE_WEIGHTS: Record<string, number> = {
    carbon_seq: 0.25,
    water_reg: 0.3,
    biodiversity: 0.35,
    nutrient_cycling: 0.1,
};

/**
 * Computes ecological hazard quotient.
 * Calcula o quociente de risco ecologico: HQ = MEC / PNEC.
 * ecologicalRisk = HQ > 1 (ECHA 2011).
 * @param {number} measuredConc - MEC measured environmental concentration (mg/L)
 * @param {number} pnec         - PNEC predicted no-effect concentration (mg/L)
 * @returns {{ hq: number, ecologicalRisk: boolean }}
 */
export function computeHazardQuotientEcological(
    measuredConc: number,
    pnec: number,
): { hq: number; ecologicalRisk: boolean } {
    if (typeof measuredConc !== 'number' || measuredConc < 0) throw new RangeError('measuredConc must be >= 0');
    if (typeof pnec !== 'number' || pnec <= 0) throw new RangeError('pnec must be > 0');
    const hq = measuredConc / pnec;
    return { hq, ecologicalRisk: hq > 1 };
}

/**
 * Estimates fraction of species at risk via simplified SSD (Posthuma et al. 2002).
 * Estima a fracao de especies em risco usando SSD simplificada.
 * Approximation: <=HC5 -> 0.05; >HC5*10 -> 0.5; else linear interpolation.
 * @param {number} hc5_mg_L               - HC5 5th-percentile hazardous concentration (mg/L)
 * @param {number} environmentalConc_mg_L - Environmental concentration (mg/L)
 * @param {number} totalSpecies           - Total species count (integer)
 * @returns {{ fractionAtRisk: number, speciesAtRisk: number }}
 */
export function computeSpeciesAtRisk(
    hc5_mg_L: number,
    environmentalConc_mg_L: number,
    totalSpecies: number,
): { fractionAtRisk: number; speciesAtRisk: number } {
    if (typeof hc5_mg_L !== 'number' || hc5_mg_L <= 0) throw new RangeError('hc5_mg_L must be > 0');
    if (typeof environmentalConc_mg_L !== 'number' || environmentalConc_mg_L < 0)
        throw new RangeError('environmentalConc_mg_L must be >= 0');
    if (typeof totalSpecies !== 'number' || totalSpecies < 0 || !Number.isInteger(totalSpecies))
        throw new RangeError('totalSpecies must be a non-negative integer');

    let fractionAtRisk: number;
    if (environmentalConc_mg_L <= hc5_mg_L) {
        fractionAtRisk = 0.05;
    } else if (environmentalConc_mg_L > hc5_mg_L * 10) {
        fractionAtRisk = 0.5;
    } else {
        const t = (environmentalConc_mg_L - hc5_mg_L) / (hc5_mg_L * 9);
        fractionAtRisk = 0.05 + t * 0.45;
    }
    return { fractionAtRisk, speciesAtRisk: Math.ceil(fractionAtRisk * totalSpecies) };
}

/**
 * Computes ecosystem service loss from contamination (MEA 2005).
 * Calcula a perda de servico ecossistemico: loss = area * intensity * weight.
 * monetaryProxy_USD = (loss_pct/100) * affectedArea * 1000.
 * @param {number} affectedArea_ha - Affected area (ha)
 * @param {string} serviceType     - carbon_seq | water_reg | biodiversity | nutrient_cycling
 * @param {number} intensity       - Contamination intensity (0-1)
 * @returns {{ loss_pct: number, monetaryProxy_USD: number }}
 */
export function computeEcosystemServiceLoss(
    affectedArea_ha: number,
    serviceType: string,
    intensity: number,
): { loss_pct: number; monetaryProxy_USD: number } {
    if (typeof affectedArea_ha !== 'number' || affectedArea_ha < 0)
        throw new RangeError('affectedArea_ha must be >= 0');
    if (!SERVICE_WEIGHTS[serviceType])
        throw new TypeError('serviceType must be one of: ' + Object.keys(SERVICE_WEIGHTS).join(', '));
    if (typeof intensity !== 'number' || intensity < 0 || intensity > 1)
        throw new RangeError('intensity must be between 0 and 1');
    const loss_pct = Math.min(100, affectedArea_ha * intensity * SERVICE_WEIGHTS[serviceType]!);
    return { loss_pct, monetaryProxy_USD: (loss_pct / 100) * affectedArea_ha * 1000 };
}

function assertRiskLevelInputs(
    hq: number,
    fractionAtRisk: number,
    ecosystemServiceLoss_pct: number,
): void {
    if (typeof hq !== 'number' || hq < 0) throw new RangeError('hq must be >= 0');
    if (typeof fractionAtRisk !== 'number' || fractionAtRisk < 0 || fractionAtRisk > 1)
        throw new RangeError('fractionAtRisk must be between 0 and 1');
    if (
        typeof ecosystemServiceLoss_pct !== 'number' ||
        ecosystemServiceLoss_pct < 0 ||
        ecosystemServiceLoss_pct > 100
    )
        throw new RangeError('ecosystemServiceLoss_pct must be between 0 and 100');
}

function calculateRiskLevel(
    hq: number,
    fractionAtRisk: number,
    ecosystemServiceLoss_pct: number,
): string {
    if (hq > 10 || fractionAtRisk > 0.2 || ecosystemServiceLoss_pct > 50) return 'very_high';
    if (hq > 5 || fractionAtRisk > 0.1 || ecosystemServiceLoss_pct > 30) return 'high';
    if (hq > 1 || fractionAtRisk > 0.05) return 'moderate';
    if (hq > 0.1) return 'low';
    return 'negligible';
}

/**
 * Classifies ecological risk level based on ERA indicators (ECHA 2011).
 * Classifica o nivel de risco ecologico com base em multiplos indicadores.
 * very_high: HQ>10 or fractionAtRisk>0.2 or loss>50%;
 * high: HQ>5 or fractionAtRisk>0.1 or loss>30%;
 * moderate: HQ>1 or fractionAtRisk>0.05; low: HQ>0.1; negligible: otherwise.
 * requiresAction: true for moderate, high, very_high.
 * @param {number} hq                       - Hazard quotient
 * @param {number} fractionAtRisk           - Fraction of species at risk (0-1)
 * @param {number} ecosystemServiceLoss_pct - Service loss (%)
 * @returns {{ riskLevel: string, requiresAction: boolean }}
 */
export function classifyEcologicalRiskLevel(
    hq: number,
    fractionAtRisk: number,
    ecosystemServiceLoss_pct: number,
): { riskLevel: string; requiresAction: boolean } {
    assertRiskLevelInputs(hq, fractionAtRisk, ecosystemServiceLoss_pct);
    const riskLevel = calculateRiskLevel(hq, fractionAtRisk, ecosystemServiceLoss_pct);
    const requiresAction = riskLevel !== 'negligible' && riskLevel !== 'low';
    return { riskLevel, requiresAction };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const ecologicalRiskAssessmentMeta: AnalyticsModuleMeta = {
    name: 'ecologicalRiskAssessment',
    description: '- Ecological Risk Assessment',
    category: 'analytics',
    familyTags: ['ecosystem', 'risk'],
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
