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
// Application: EHS & Mining -- Environmental Epidemiology
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Environmental Epidemiology -- Epidemiologia Ambiental
 *
 * Modulo puro implementando metricas epidemiologicas fundamentais para estudos
 * de exposicao ambiental: risco relativo, razao de chances, fracao atribuivel
 * e classificacao de forca de evidencia conforme criterios de Hill (1965).
 * Zero dependencias de DOM, IDB, Three.js ou fetch.
 *
 * References / Referencias:
 * - Hill, A.B. (1965) The environment and disease: association or causation?
 *   Proceedings of the Royal Society of Medicine 58(5):295-300.
 * - Rothman, K.J. & Greenland, S. (1998) Modern Epidemiology, 2nd ed. Lippincott-Raven.
 * - WHO (2013) Environmental Health Criteria 240. Geneva: World Health Organization.
 *
 * @module environmentalEpidemiology
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

/** Z-score for 95% confidence interval */
const Z_95 = 1.96;

/**
 * Validate contingency table cells (all must be non-negative numbers).
 * @param values
 */
function validateCells(...values: number[]): void {
    for (const v of values) {
        if (typeof v !== 'number' || !isFinite(v) || v < 0) {
            throw new RangeError('All contingency table cells must be non-negative numbers');
        }
    }
}

/**
 * Compute Relative Risk (RR) with 95% Woolf confidence interval.
 * Calcula Risco Relativo (RR) com IC95 pelo metodo de Woolf.
 *
 * RR = [a/(a+b)] / [c/(c+d)]
 * SE(ln RR) = sqrt(1/a - 1/(a+b) + 1/c - 1/(c+d))
 *
 * @param exposedCases - Cases in exposed group (a)
 * @param exposedTotal - Total in exposed group (a+b)
 * @param unexposedCases - Cases in unexposed group (c)
 * @param unexposedTotal - Total in unexposed group (c+d)
 * @returns
 * @throws {RangeError}
 */
export function computeRelativeRisk(
    exposedCases: number,
    exposedTotal: number,
    unexposedCases: number,
    unexposedTotal: number,
): { rr: number; ci95: [number, number] } {
    validateCells(exposedCases, exposedTotal, unexposedCases, unexposedTotal);
    if (exposedTotal === 0) throw new RangeError('exposedTotal must be > 0');
    if (unexposedTotal === 0) throw new RangeError('unexposedTotal must be > 0');
    if (exposedCases > exposedTotal) throw new RangeError('exposedCases cannot exceed exposedTotal');
    if (unexposedCases > unexposedTotal) throw new RangeError('unexposedCases cannot exceed unexposedTotal');
    if (exposedCases === 0 || unexposedCases === 0) {
        throw new RangeError('Cell counts must be > 0 for Woolf CI (use continuity correction if needed)');
    }

    const rr = exposedCases / exposedTotal / (unexposedCases / unexposedTotal);
    const se = Math.sqrt(1 / exposedCases - 1 / exposedTotal + 1 / unexposedCases - 1 / unexposedTotal);
    const lnRr = Math.log(rr);
    return { rr, ci95: [Math.exp(lnRr - Z_95 * se), Math.exp(lnRr + Z_95 * se)] };
}

/**
 * Compute Odds Ratio (OR) with 95% Cornfield (log-linear) confidence interval.
 * Calcula Razao de Chances (OR) com IC95 por Cornfield.
 *
 * OR = (a x d) / (b x c)
 * SE(ln OR) = sqrt(1/a + 1/b + 1/c + 1/d)
 *
 * @param exposedCases      - Exposed cases (a)
 * @param exposedControls   - Exposed controls (b)
 * @param unexposedCases    - Unexposed cases (c)
 * @param unexposedControls - Unexposed controls (d)
 * @returns
 * @throws {RangeError} If any cell is zero
 */
export function computeOddsRatio(
    exposedCases: number,
    exposedControls: number,
    unexposedCases: number,
    unexposedControls: number,
): { or: number; ci95: [number, number] } {
    validateCells(exposedCases, exposedControls, unexposedCases, unexposedControls);
    if ([exposedCases, exposedControls, unexposedCases, unexposedControls].some((v) => v === 0)) {
        throw new RangeError('All cells must be > 0 for OR calculation');
    }

    const or = (exposedCases * unexposedControls) / (exposedControls * unexposedCases);
    const se = Math.sqrt(1 / exposedCases + 1 / exposedControls + 1 / unexposedCases + 1 / unexposedControls);
    const lnOr = Math.log(or);
    return { or, ci95: [Math.exp(lnOr - Z_95 * se), Math.exp(lnOr + Z_95 * se)] };
}

/**
 * Compute Population Attributable Fraction (PAF) -- Levin formula.
 * Calcula Fracao Atribuivel Populacional (FAP) -- formula de Levin.
 *
 * PAF = p*(RR-1) / [1 + p*(RR-1)]
 *
 * @param relativeRisk       - RR >= 1
 * @param exposurePrevalence - Proportion exposed p in [0,1]
 * @returns
 * @throws {RangeError}
 */
export function computeAttributableFraction(
    relativeRisk: number,
    exposurePrevalence: number,
): { paf: number; preventableCases_pct: number } {
    if (typeof relativeRisk !== 'number' || typeof exposurePrevalence !== 'number') {
        throw new TypeError('relativeRisk and exposurePrevalence must be numbers');
    }
    if (relativeRisk < 1) throw new RangeError('relativeRisk must be >= 1');
    if (exposurePrevalence < 0 || exposurePrevalence > 1) {
        throw new RangeError('exposurePrevalence must be in [0, 1]');
    }

    const excess = exposurePrevalence * (relativeRisk - 1);
    const paf = excess / (1 + excess);
    return { paf, preventableCases_pct: paf * 100 };
}

/**
 * Classify epidemiological evidence strength using Hill (1965) criteria subset.
 * Classifica forca da evidencia epidemiologica pelos criterios de Hill (1965).
 *
 * 4 criteria evaluated: strength (RR>2), CI excludes null, p<0.05, bioplausibility.
 * sufficient=4, probable=3, suggestive=2, insufficient<=1.
 *
 * @param rr - Relative risk
 * @param ci95 - [lower, upper] 95% CI
 * @param pValue - Statistical p-value
 * @param biologicalPlausibility - Expert judgment
 * @returns
 */
function validateEvidenceInputs(
    rr: number,
    ci95: [number, number],
    pValue: number,
    biologicalPlausibility: boolean,
): void {
    if (typeof rr !== 'number') throw new TypeError('rr must be a number');
    if (!Array.isArray(ci95) || ci95.length !== 2) throw new TypeError('ci95 must be [lower, upper]');
    if (typeof pValue !== 'number') throw new TypeError('pValue must be a number');
    if (typeof biologicalPlausibility !== 'boolean') {
        throw new TypeError('biologicalPlausibility must be a boolean');
    }
    if (rr <= 0) throw new RangeError('rr must be > 0');
    if (pValue < 0 || pValue > 1) throw new RangeError('pValue must be in [0, 1]');
    if (ci95[0] > ci95[1]) throw new RangeError('ci95[0] must be <= ci95[1]');
}

function evaluateEvidenceCriteria(
    rr: number,
    ci95: [number, number],
    pValue: number,
    biologicalPlausibility: boolean,
): { criteria: string[]; met: number } {
    const criteria: string[] = [];
    let met = 0;

    if (rr > 2) {
        criteria.push('Strong association (RR > 2)');
        met++;
    }
    if (ci95[0] > 1.0 || ci95[1] < 1.0) {
        criteria.push('95% CI excludes null (RR=1)');
        met++;
    }
    if (pValue < 0.05) {
        criteria.push('Statistical significance (p < 0.05)');
        met++;
    }
    if (biologicalPlausibility) {
        criteria.push('Biological plausibility confirmed');
        met++;
    }

    return { criteria, met };
}

function strengthFromScore(met: number): 'insufficient' | 'suggestive' | 'probable' | 'sufficient' {
    if (met >= 4) return 'sufficient';
    if (met === 3) return 'probable';
    if (met === 2) return 'suggestive';
    return 'insufficient';
}

export function classifyEpidemiologicalEvidence(
    rr: number,
    ci95: [number, number],
    pValue: number,
    biologicalPlausibility: boolean,
): { strength: 'insufficient' | 'suggestive' | 'probable' | 'sufficient'; criteria: string[] } {
    validateEvidenceInputs(rr, ci95, pValue, biologicalPlausibility);

    const { criteria, met } = evaluateEvidenceCriteria(rr, ci95, pValue, biologicalPlausibility);

    return { strength: strengthFromScore(met), criteria };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const environmentalEpidemiologyMeta: AnalyticsModuleMeta = {
    name: 'environmentalEpidemiology',
    description: '- Environmental Epidemiology',
    category: 'analytics',
    familyTags: ['epidemiology'],
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
