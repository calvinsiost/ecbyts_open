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
 * Coastal Water Quality Index
 * Índice de qualidade de água costeira - CCME WQI (2001) e EU Water Framework Directive 2000/60/EC.
 *
 * References / Referências:
 *   - CCME (2001). Canadian Water Quality Guidelines for the Protection of Aquatic Life:
 *     CCME Water Quality Index 1.0. Technical Report. Canadian Council of Ministers of
 *     the Environment. ISBN: 1-896997-34-1
 *   - EU (2000). Directive 2000/60/EC of the European Parliament and of the Council -
 *     Water Framework Directive. Official Journal L 327, 22/12/2000.
 *   - CCME WQI User's Manual (2001). Winnipeg, MB, Canada.
 *
 * @module coastalWaterQualityIndex
 */

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

// ─── F1: Scope ────────────────────────────────────────────────────────────────

/**
 * F1 - Scope: % of parameters that did not meet their objectives at least once.
 * F1 - Escopo: % de parâmetros que violaram pelo menos uma vez o padrão.
 *
 * F1 = (failed_parameters / total_parameters) * 100
 *
 * @param failedParameters  - Number of parameters exceeding standard at least once
 * @param totalParameters   - Total number of parameters tested
 * @returns F1 [0,100]
 * @throws {RangeError}
 */
export function computeF1(failedParameters: number, totalParameters: number): number {
    if (totalParameters <= 0) throw new RangeError(`totalParameters must be > 0, got ${totalParameters}`);
    if (failedParameters < 0) throw new RangeError(`failedParameters must be >= 0, got ${failedParameters}`);
    if (failedParameters > totalParameters) {
        throw new RangeError(`failedParameters (${failedParameters}) > totalParameters (${totalParameters})`);
    }
    return (failedParameters / totalParameters) * 100;
}

// ─── F2: Frequency ────────────────────────────────────────────────────────────

/**
 * F2 - Frequency: % of individual tests that did not meet objectives.
 * F2 - Frequência: % de testes individuais que violaram o padrão.
 *
 * F2 = (failed_tests / total_tests) * 100
 *
 * @param failedTests - Number of individual tests exceeding objective
 * @param totalTests  - Total number of individual tests
 * @returns F2 [0,100]
 * @throws {RangeError}
 */
export function computeF2(failedTests: number, totalTests: number): number {
    if (totalTests <= 0) throw new RangeError(`totalTests must be > 0, got ${totalTests}`);
    if (failedTests < 0) throw new RangeError(`failedTests must be >= 0, got ${failedTests}`);
    if (failedTests > totalTests) {
        throw new RangeError(`failedTests (${failedTests}) > totalTests (${totalTests})`);
    }
    return (failedTests / totalTests) * 100;
}

// ─── F3: Amplitude ────────────────────────────────────────────────────────────

/**
 * F3 - Amplitude: normalized sum of deviations from objectives.
 * F3 - Amplitude: desvio normalizado das medições em relação aos objetivos.
 *
 * For each exceedance: excursion_i = (measured / objective) - 1  (when objective is maximum)
 *                   or excursion_i = (objective / measured) - 1  (when objective is minimum)
 *
 * nse = sum(excursions) / total_tests
 * F3 = (nse / (0.01 * nse + 0.01)) * 100
 *
 * @param exceedances
 *   Array of test results that exceeded the objective.
 *   isMaximum: true se o padrão é um limite máximo (ex: DBO, coliformes).
 *   false/undefined se é um limite mínimo (ex: OD).
 * @param totalTests - Total number of individual tests (including passing ones)
 * @returns F3 [0,100]
 * @throws {RangeError} | @throws {TypeError}
 */
export function computeF3(
    exceedances: Array<{ measured: number; objective: number; isMaximum?: boolean }>,
    totalTests: number,
): number {
    if (!Array.isArray(exceedances)) throw new TypeError('exceedances must be an Array');
    if (totalTests <= 0) throw new RangeError(`totalTests must be > 0, got ${totalTests}`);
    if (exceedances.length > totalTests) {
        throw new RangeError(`exceedances.length (${exceedances.length}) > totalTests (${totalTests})`);
    }

    let sumExcursions = 0;
    for (const { measured, objective, isMaximum = true } of exceedances) {
        if (measured <= 0) throw new RangeError(`measured must be > 0, got ${measured}`);
        if (objective <= 0) throw new RangeError(`objective must be > 0, got ${objective}`);
        // Excursão relativa - sempre positiva para violações (CCME eq. 3/4)
        const excursion = isMaximum ? measured / objective - 1 : objective / measured - 1;
        sumExcursions += Math.max(0, excursion);
    }

    const nse = sumExcursions / totalTests;
    const F3 = (nse / (0.01 * nse + 0.01)) * 100;
    return Math.min(100, F3);
}

// ─── WQI Composite ────────────────────────────────────────────────────────────

/**
 * CCME Water Quality Index composite score and classification.
 * Índice composto CCME WQI e classificação da qualidade da água.
 *
 * WQI = 100 - (sqrt(F1² + F2² + F3²) / 1.732)
 *
 * Classification (CCME 2001):
 *   excellent ≥ 95, good ≥ 80, fair ≥ 65, marginal ≥ 45, poor < 45
 *
 * @param F1 - Scope [0,100]
 * @param F2 - Frequency [0,100]
 * @param F3 - Amplitude [0,100]
 * @throws {RangeError}
 */
export function computeWQI(
    F1: number,
    F2: number,
    F3: number,
): { WQI: number; classification: string; description: string } {
    const fParams: Array<[string, number]> = [
        ['F1', F1],
        ['F2', F2],
        ['F3', F3],
    ];
    for (const [name, val] of fParams) {
        if (val < 0 || val > 100) throw new RangeError(`${name} must be [0,100], got ${val}`);
    }

    // Denominador 1.732 = sqrt(3) * 100 / 100 normalizes to 0–100 scale
    const WQI = Math.max(0, 100 - Math.sqrt(F1 ** 2 + F2 ** 2 + F3 ** 2) / 1.732);

    let classification: string, description: string;
    if (WQI >= 95) {
        classification = 'excellent';
        description = 'Conditions very rarely depart from natural or desirable levels';
    } else if (WQI >= 80) {
        classification = 'good';
        description = 'Conditions rarely depart from natural or desirable levels';
    } else if (WQI >= 65) {
        classification = 'fair';
        description = 'Conditions sometimes depart from natural or desirable levels';
    } else if (WQI >= 45) {
        classification = 'marginal';
        description = 'Conditions often depart from natural or desirable levels';
    } else {
        classification = 'poor';
        description = 'Conditions usually depart from natural or desirable levels';
    }

    return { WQI, classification, description };
}

// ─── Full Pipeline ────────────────────────────────────────────────────────────

/**
 * Full CCME WQI computation from raw test data.
 * Cálculo completo CCME WQI a partir dos dados brutos de monitoramento.
 *
 * @param params
 * @returns
 * @throws {RangeError} | @throws {TypeError}
 */
export function coastalWQI({
    totalParameters,
    failedParameters,
    totalTests,
    failedTests,
    exceedances,
}: {
    totalParameters: number;
    failedParameters: number;
    totalTests: number;
    failedTests: number;
    exceedances: Array<{ measured: number; objective: number; isMaximum?: boolean }>;
}): { F1: number; F2: number; F3: number; WQI: number; classification: string; description: string } {
    const F1 = computeF1(failedParameters, totalParameters);
    const F2 = computeF2(failedTests, totalTests);
    const F3 = computeF3(exceedances, totalTests);
    const { WQI, classification, description } = computeWQI(F1, F2, F3);
    return { F1, F2, F3, WQI, classification, description };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const coastalWaterQualityIndexMeta: AnalyticsModuleMeta = {
    name: 'coastalWaterQualityIndex',
    description: 'coastalWaterQualityIndex',
    category: 'analytics',
    familyTags: ['water', 'coastal'],
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
