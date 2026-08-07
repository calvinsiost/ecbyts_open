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
// Application: EHS & Mining - Air Toxics Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Air Toxics Assessment - Risco Cancerígeno e Não-Cancerígeno Atmosférico
 *
 * Módulo puro implementando avaliação de tóxicos atmosféricos conforme EPA IRIS,
 * EPA AEGL Program (2012) e OEHHA Air Toxics Hot Spots (2015).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References / Referências:
 * - EPA IRIS (2023) Integrated Risk Information System
 * - EPA AEGL Program (2012) Acute Exposure Guideline Levels
 * - OEHHA Air Toxics Hot Spots Program Risk Assessment Guidelines (2015)
 *
 * @module airToxicsAssessment
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

// ---------------------------------------------------------------------------
// Risk level thresholds (EPA IRIS cancer risk guidance)
// Limites de nível de risco cancerígeno conforme orientação EPA IRIS
// ---------------------------------------------------------------------------
const CANCER_RISK_THRESHOLDS = {
    NEGLIGIBLE: 1e-6, // < 1 in a million — desprezível
    LOW: 1e-4, // < 1 in 10,000 — baixo
    MODERATE: 1e-2, // < 1 in 100 — moderado
};

/**
 * Classify cancer risk level based on calculated risk value.
 * Classifica o nível de risco cancerígeno com base no valor calculado.
 *
 * @param risk - Dimensionless cancer risk value
 * @returns Risk level
 */
function classifyCancerRisk(risk: number): 'negligible' | 'low' | 'moderate' | 'high' {
    if (risk < CANCER_RISK_THRESHOLDS.NEGLIGIBLE) return 'negligible';
    if (risk < CANCER_RISK_THRESHOLDS.LOW) return 'low';
    if (risk < CANCER_RISK_THRESHOLDS.MODERATE) return 'moderate';
    return 'high';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute unit cancer risk from inhalation exposure.
 * Calcula risco cancerígeno unitário por inalação.
 *
 * Formula: Risk = C × URE
 * onde C = concentração (µg/m³), URE = Unit Risk Estimate ((µg/m³)^-1)
 *
 * @param concentration_ug_m3 - Air concentration (µg/m³) - concentração no ar
 * @param ure - Inhalation unit risk estimate ((µg/m³)^-1) - estimativa de risco unitário
 * @returns risk and riskLevel
 * @throws {RangeError} If concentration or URE is negative
 *
 * @example
 * computeUnitRisk(1.0, 2.4e-5) // benzene example (EPA IRIS)
 * // → { risk: 2.4e-5, riskLevel: 'low' }
 */
export function computeUnitRisk(
    concentration_ug_m3: number,
    ure: number,
): { risk: number; riskLevel: 'negligible' | 'low' | 'moderate' | 'high' } {
    if (typeof concentration_ug_m3 !== 'number' || typeof ure !== 'number') {
        throw new TypeError('concentration_ug_m3 and ure must be numbers');
    }
    if (concentration_ug_m3 < 0) {
        throw new RangeError('concentration_ug_m3 must be >= 0');
    }
    if (ure < 0) {
        throw new RangeError('ure must be >= 0');
    }

    const risk = concentration_ug_m3 * ure;
    return { risk, riskLevel: classifyCancerRisk(risk) };
}

/**
 * Compute chronic non-cancer Hazard Quotient (HQ) for air pollutant.
 * Calcula o Quociente de Perigo (HQ) crônico não-cancerígeno para poluente atmosférico.
 *
 * Formula: HQ = C / RfC
 * onde RfC = Reference Concentration (µg/m³) - concentração de referência não-cancerígena
 *
 * @param concentration_ug_m3 - Air concentration (µg/m³)
 * @param rfc_ug_m3 - Reference concentration (µg/m³) > 0
 * @returns hq and concern (HQ > 1 indicates potential concern)
 * @throws {RangeError} If concentration is negative or RfC is <= 0
 */
export function computeChronicHazardQuotient(
    concentration_ug_m3: number,
    rfc_ug_m3: number,
): { hq: number; concern: boolean } {
    if (typeof concentration_ug_m3 !== 'number' || typeof rfc_ug_m3 !== 'number') {
        throw new TypeError('concentration_ug_m3 and rfc_ug_m3 must be numbers');
    }
    if (concentration_ug_m3 < 0) {
        throw new RangeError('concentration_ug_m3 must be >= 0');
    }
    if (rfc_ug_m3 <= 0) {
        throw new RangeError('rfc_ug_m3 must be > 0');
    }

    const hq = concentration_ug_m3 / rfc_ug_m3;
    return { hq, concern: hq > 1 };
}

/**
 * Classify acute exposure against AEGL thresholds (EPA 2012).
 * Classifica a exposição aguda conforme limites AEGL (EPA 2012).
 *
 * AEGL-1: Notable discomfort but not disabling / Desconforto notável, não incapacitante
 * AEGL-2: Irreversible or serious effects / Efeitos irreversíveis ou sérios
 * AEGL-3: Life-threatening or lethal / Risco de vida ou letal
 *
 * @param concentration_ppm - Measured concentration (ppm)
 * @param aegl_1_ppm - AEGL-1 threshold (ppm)
 * @param aegl_2_ppm - AEGL-2 threshold (ppm) - must be >= aegl_1
 * @param aegl_3_ppm - AEGL-3 threshold (ppm) - must be >= aegl_2
 * @returns level and description
 * @throws {RangeError} If concentration is negative or thresholds are not increasing
 */
export function computeAcuteExposureGuideline(
    concentration_ppm: number,
    aegl_1_ppm: number,
    aegl_2_ppm: number,
    aegl_3_ppm: number,
): { level: 0 | 1 | 2 | 3; description: string } {
    if ([concentration_ppm, aegl_1_ppm, aegl_2_ppm, aegl_3_ppm].some((v) => typeof v !== 'number')) {
        throw new TypeError('All arguments must be numbers');
    }
    if (concentration_ppm < 0) {
        throw new RangeError('concentration_ppm must be >= 0');
    }
    if (!(aegl_1_ppm > 0 && aegl_2_ppm >= aegl_1_ppm && aegl_3_ppm >= aegl_2_ppm)) {
        throw new RangeError('AEGL thresholds must be positive and non-decreasing: AEGL-1 <= AEGL-2 <= AEGL-3');
    }

    // Classificação hierárquica: AEGL-3 > AEGL-2 > AEGL-1 > 0
    if (concentration_ppm >= aegl_3_ppm) {
        return { level: 3, description: 'Life-threatening or lethal effects' };
    }
    if (concentration_ppm >= aegl_2_ppm) {
        return { level: 2, description: 'Irreversible or other serious effects' };
    }
    if (concentration_ppm >= aegl_1_ppm) {
        return { level: 1, description: 'Notable discomfort, but not disabling' };
    }
    return { level: 0, description: 'Below AEGL-1: no notable adverse effect expected' };
}

/**
 * Compute composite Air Toxics Index for multiple pollutants.
 * Calcula índice composto de tóxicos atmosféricos para múltiplos poluentes.
 *
 * Soma os riscos cancerígenos e HQs; identifica poluente dominante para cada risco.
 *
 * @param pollutants - list of pollutants
 * @returns cancerRisk, hazardIndex, dominantCarcinogen, dominantHazard
 * @throws {TypeError} If pollutants is not a non-empty array
 */
export function computeAirToxicsIndex(
    pollutants: Array<{ name: string; concentration_ug_m3: number; ure: number; rfc_ug_m3: number }>,
): { cancerRisk: number; hazardIndex: number; dominantCarcinogen: string | null; dominantHazard: string | null } {
    if (!Array.isArray(pollutants) || pollutants.length === 0) {
        throw new TypeError('pollutants must be a non-empty array');
    }

    let cancerRisk = 0;
    let hazardIndex = 0;
    let maxRisk = -Infinity;
    let maxHq = -Infinity;
    let dominantCarcinogen: string | null = null;
    let dominantHazard: string | null = null;

    for (const p of pollutants) {
        if (!p.name || typeof p.concentration_ug_m3 !== 'number') {
            throw new TypeError('Each pollutant must have name (string) and concentration_ug_m3 (number)');
        }

        // Risco cancerígeno: URE pode ser 0 para poluentes sem risco cancerígeno classificado
        if (typeof p.ure === 'number' && p.ure >= 0) {
            const r = computeUnitRisk(p.concentration_ug_m3, p.ure).risk;
            cancerRisk += r;
            if (r > maxRisk) {
                maxRisk = r;
                dominantCarcinogen = p.name;
            }
        }

        // Quociente de perigo: RfC obrigatória para HQ
        if (typeof p.rfc_ug_m3 === 'number' && p.rfc_ug_m3 > 0) {
            const hq = computeChronicHazardQuotient(p.concentration_ug_m3, p.rfc_ug_m3).hq;
            hazardIndex += hq;
            if (hq > maxHq) {
                maxHq = hq;
                dominantHazard = p.name;
            }
        }
    }

    return { cancerRisk, hazardIndex, dominantCarcinogen, dominantHazard };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const airToxicsAssessmentMeta: AnalyticsModuleMeta = {
    name: 'airToxicsAssessment',
    description: 'Air Toxics Assessment',
    category: 'analytics',
    familyTags: ['air', 'chemical'],
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
