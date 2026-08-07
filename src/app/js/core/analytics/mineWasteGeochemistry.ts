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
 * Mine Waste Geochemistry Module - Acid-Base Accounting (ABA)
 *
 * Implements geochemical characterization of mine waste per:
 * - Sobek, A.A., et al. (1978). Field and laboratory methods applicable to overburdens and minesoils.
 *   EPA-600/2-78-054. US EPA.
 * - Lawrence, R.W. & Wang, Y. (1997). Determination of Neutralization Potential for Acid Rock Drainage
 *   Prediction. Proc. 4th Int. Conf. Acid Rock Drainage, MEND 1.16.3.
 * - Price, W.A. (2009). Prediction Manual for Drainage Chemistry from Sulphidic Geologic Materials.
 *   MEND Report 1.20.1. DOI: 10.4095/225679
 * - INAP (2009). Global Acid Rock Drainage Guide. www.inap.com.au/public-downloads/GARD_Guide_GTK.pdf
 *
 * Zero dependencies - pure math, no DOM/IDB/Three.js/fetch.
 *
 * @module mineWasteGeochemistry
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Molar mass of sulfur (g/mol).
 * Massa molar do enxofre para conversão de % S total para AP.
 */
// eslint-disable-next-line
const S_MOLAR_MASS = 32.06;

/**
 * Molar mass of calcium carbonate (g/mol).
 * Massa molar do carbonato de cálcio para conversão de NP.
 */
// eslint-disable-next-line
const CACO3_MOLAR_MASS = 100.09;

/**
 * NP:AP ratio thresholds for AMD risk classification (Lawrence & Wang 1997, Price 2009).
 * Limiares de razão NP/AP para classificação do risco de DAM.
 */
const AMD_RISK_THRESHOLDS = Object.freeze({
    LIKELY_ACID: 1.0, // NP/AP < 1 → likely acid generating
    UNCERTAIN: 2.0, // 1 ≤ NP/AP < 2 → uncertain, site-specific
    UNLIKELY_ACID: 4.0, // 2 ≤ NP/AP < 4 → unlikely acid generating (uncertain)
    // NP/AP ≥ 4 → not potentially acid generating (NAG confirmed needed)
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Assert finite non-negative number.
 * @param v
 * @param name
 */
function assertNonNegative(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

// ---------------------------------------------------------------------------
// Core exports
// ---------------------------------------------------------------------------

/**
 * Calculate Acid Potential (AP) from total sulfur content (Sobek et al. 1978).
 * Calcula o Potencial de Acidificação (AP) a partir do teor de enxofre total.
 *
 * AP (kg CaCO3/t) = %S_total × (1000 / S_molar_mass) × (CaCO3_molar_mass / 2)
 * Simplifies to: AP = %S × 31.25 (standard approximation, Sobek 1978)
 *
 * @param totalSulfurPct  - Total sulfur content (% by weight, 0–100)
 * @returns
 */
export function acidPotential(totalSulfurPct: number): { apKgCaCO3PerTonne: number; totalSulfurPct: number } {
    assertNonNegative(totalSulfurPct, 'totalSulfurPct');
    if (totalSulfurPct > 100) throw new RangeError('totalSulfurPct must be <= 100');

    // Standard Sobek factor: each % S produces 31.25 kg CaCO3/t
    // Fator padrão Sobek: cada 1% S produz 31.25 kg CaCO3/t de potencial ácido
    const apKgCaCO3PerTonne = totalSulfurPct * 31.25;
    return { apKgCaCO3PerTonne, totalSulfurPct };
}

/**
 * Calculate Neutralization Potential (NP) from carbonate content (Sobek et al. 1978).
 * Calcula o Potencial de Neutralização (NP) a partir do teor de carbonatos.
 *
 * NP is measured by acid titration (Sobek 1978) or estimated from carbonate mineralogy.
 * This function uses the mineralogical estimate: NP ≈ %CaCO3_equivalent × 10 (kg CaCO3/t)
 *
 * @param calciteEqPct     - Calcium carbonate equivalent (% by weight, 0–100)
 * @param method - Calculation method
 *   'sobek': NP = calciteEqPct × 10 (standard Sobek)
 *   'modified': NP = calciteEqPct × 8.3 (Lawrence & Wang 1997 correction for dolomite reactivity)
 * @returns
 */
export function neutralizationPotential(
    calciteEqPct: number,
    method: 'sobek' | 'modified' = 'sobek',
): { npKgCaCO3PerTonne: number; method: string } {
    assertNonNegative(calciteEqPct, 'calciteEqPct');
    if (calciteEqPct > 100) throw new RangeError('calciteEqPct must be <= 100');

    const factor = method === 'modified' ? 8.3 : 10;
    const npKgCaCO3PerTonne = calciteEqPct * factor;
    return { npKgCaCO3PerTonne, method };
}

/**
 * Calculate Net Neutralization Potential (NNP) and NP:AP ratio - the core ABA result.
 * Calcula o Potencial Líquido de Neutralização (NNP) e a razão NP/AP - resultado central do ABA.
 *
 * NNP = NP - AP (kg CaCO3/t)
 * NP:AP ratio classifies acid generation risk (Lawrence & Wang 1997, Price 2009)
 *
 * @param npKgCaCO3PerTonne  - Neutralization potential (kg CaCO3/t)
 * @param apKgCaCO3PerTonne  - Acid potential (kg CaCO3/t)
 * @returns
 */
export function acidBaseAccounting(
    npKgCaCO3PerTonne: number,
    apKgCaCO3PerTonne: number,
): {
    nnpKgCaCO3PerTonne: number;
    npApRatio: number | null;
    amdRisk: 'likely_acid' | 'potentially_acid' | 'uncertain' | 'unlikely_acid' | 'non_acid_generating';
    classification: string;
} {
    assertNonNegative(npKgCaCO3PerTonne, 'npKgCaCO3PerTonne');
    assertNonNegative(apKgCaCO3PerTonne, 'apKgCaCO3PerTonne');

    const nnpKgCaCO3PerTonne = npKgCaCO3PerTonne - apKgCaCO3PerTonne;

    // NP/AP ratio - null when AP = 0 (no acid potential)
    // Razão NP/AP - null quando AP = 0 (sem potencial ácido)
    const npApRatio = apKgCaCO3PerTonne > 0 ? npKgCaCO3PerTonne / apKgCaCO3PerTonne : null;

    let amdRisk: 'likely_acid' | 'potentially_acid' | 'uncertain' | 'unlikely_acid' | 'non_acid_generating';
    let classification: string;

    if (apKgCaCO3PerTonne === 0 || npApRatio === null) {
        amdRisk = 'non_acid_generating';
        classification = 'Non-acid generating (AP = 0). No sulfide minerals detected.';
    } else if (npApRatio < AMD_RISK_THRESHOLDS.LIKELY_ACID) {
        amdRisk = 'likely_acid';
        classification = 'Likely acid generating (NP/AP < 1). Drainage control required.';
    } else if (npApRatio < AMD_RISK_THRESHOLDS.UNCERTAIN) {
        amdRisk = 'potentially_acid';
        classification = 'Potentially acid generating (1 ≤ NP/AP < 2). Further testing required.';
    } else if (npApRatio < AMD_RISK_THRESHOLDS.UNLIKELY_ACID) {
        amdRisk = 'uncertain';
        classification = 'Uncertain (2 ≤ NP/AP < 4). Site-specific assessment needed.';
    } else {
        amdRisk = 'non_acid_generating';
        classification = 'Not potentially acid generating (NP/AP ≥ 4). Low AMD risk.';
    }

    return { nnpKgCaCO3PerTonne, npApRatio, amdRisk, classification };
}

/**
 * Classify AMD (Acid Mine Drainage) risk from combined geochemical indicators.
 * Classifica o risco de DAM (Drenagem Ácida de Mina) combinando múltiplos indicadores.
 *
 * Integrates ABA result, paste pH, and sulfide mineralogy for comprehensive risk classification.
 * Integra resultado ABA, pH de pasta e mineralogia de sulfetos para classificação de risco.
 *
 * @param params
 * @returns
 */
export function amdRiskClassification({
    npApRatio,
    pastePH,
    pyritePct = 0,
    sulfateMgL = 0,
}: {
    npApRatio: number | null;
    pastePH: number;
    pyritePct?: number;
    sulfateMgL?: number;
}): {
    riskLevel: 'negligible' | 'low' | 'moderate' | 'high' | 'critical';
    score: number;
    indicators: object;
} {
    if (npApRatio !== null && (typeof npApRatio !== 'number' || !isFinite(npApRatio) || npApRatio < 0)) {
        throw new RangeError('npApRatio must be a finite non-negative number or null');
    }
    if (typeof pastePH !== 'number' || !isFinite(pastePH) || pastePH < 0 || pastePH > 14) {
        throw new RangeError('pastePH must be between 0 and 14');
    }
    assertNonNegative(pyritePct, 'pyritePct');
    assertNonNegative(sulfateMgL, 'sulfateMgL');

    // Scoring: each indicator contributes 0–25 points (total 0–100)
    // Pontuação: cada indicador contribui 0–25 pontos (total 0–100)
    let score = 0;

    // NP/AP score (25 pts)
    if (npApRatio === null || npApRatio >= 4) score += 0;
    else if (npApRatio >= 2) score += 5;
    else if (npApRatio >= 1) score += 15;
    else score += 25;

    // Paste pH score (25 pts) - acidic paste pH indicates active acid generation
    if (pastePH >= 6) score += 0;
    else if (pastePH >= 4.5) score += 10;
    else if (pastePH >= 3) score += 20;
    else score += 25;

    // Pyrite content score (25 pts)
    if (pyritePct < 0.5) score += 0;
    else if (pyritePct < 2) score += 8;
    else if (pyritePct < 5) score += 15;
    else score += 25;

    // Sulfate in drainage (25 pts)
    if (sulfateMgL < 250) score += 0;
    else if (sulfateMgL < 500) score += 5;
    else if (sulfateMgL < 1000) score += 15;
    else score += 25;

    let riskLevel: 'negligible' | 'low' | 'moderate' | 'high' | 'critical';
    if (score < 10) riskLevel = 'negligible';
    else if (score < 30) riskLevel = 'low';
    else if (score < 55) riskLevel = 'moderate';
    else if (score < 75) riskLevel = 'high';
    else riskLevel = 'critical';

    return {
        riskLevel,
        score,
        indicators: { npApRatio, pastePH, pyritePct, sulfateMgL },
    };
}

export { AMD_RISK_THRESHOLDS };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineWasteGeochemistryMeta: AnalyticsModuleMeta = {
    name: 'mineWasteGeochemistry',
    description: 'mineWasteGeochemistry',
    category: 'analytics',
    familyTags: ['mining', 'waste', 'geochemistry'],
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
