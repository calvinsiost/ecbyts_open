// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
/**
 * Industrial Process Hazard Score
 * Quantitative process hazard assessment combining Dow Fire & Explosion Index
 * principles, material factor, and process hazard factors for environmental
 * and occupational risk scoring.
 *
 * References:
 *   AIChE (1994). Dow's Fire & Explosion Index Hazard Classification Guide, 7th ed.
 *     American Institute of Chemical Engineers. ISBN: 978-0-8169-0623-7.
 *   Crowl, D.A. & Louvar, J.F. (2019). Chemical Process Safety: Fundamentals with
 *     Applications, 4th ed. Pearson. ISBN: 978-0-13-386322-4.
 *   CCPS (2000). Guidelines for Chemical Process Quantitative Risk Analysis, 2nd ed.
 *     AIChE Center for Chemical Process Safety. ISBN: 978-0-8169-0720-3.
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

/**
 * Calculates the Material Factor (MF) for a substance in a process unit.
 * MF = f(Nf, Nr)
 *
 * Based on NFPA 704 flammability (Nf) and reactivity (Nr) ratings:
 *   Base MF = 1 + Nf × 3 + Nr × 2 (simplified linear approximation of AIChE Table 1)
 *
 * @param Nf - NFPA flammability rating (0–4, integer)
 * @param Nr - NFPA reactivity rating (0–4, integer)
 * @returns Material Factor MF (1–21 range)
 *
 * Reference: AIChE (1994) Dow FEI Guide 7th ed., Table 1, p. 14.
 */
export function calcMaterialFactor(Nf: number, Nr: number): number {
    if (typeof Nf !== 'number' || typeof Nr !== 'number') {
        throw new TypeError('calcMaterialFactor: Nf and Nr must be numbers');
    }
    if (!Number.isInteger(Nf) || Nf < 0 || Nf > 4) {
        throw new RangeError('calcMaterialFactor: Nf must be integer 0–4');
    }
    if (!Number.isInteger(Nr) || Nr < 0 || Nr > 4) {
        throw new RangeError('calcMaterialFactor: Nr must be integer 0–4');
    }
    return 1 + Nf * 3 + Nr * 2;
}

/**
 * Calculates the General Process Hazard Factor (F1).
 * F1 aggregates process operation hazards into a dimensionless multiplier.
 *
 * Hazard contributors (additive penalties per AIChE Dow FEI):
 *   exothermicReaction  → +0.30
 *   endothermicReaction → +0.20
 *   materialHandling    → +0.25
 *   enclosedProcess     → +0.25
 *   accessDifficulty    → +0.20
 *
 * Base F1 = 1.0; max F1 = 1.0 + sum of applicable penalties.
 *
 * @param flags - Boolean flags for each hazard contributor
 * @returns General Process Hazard Factor F1
 *
 * Reference: AIChE (1994) Dow FEI Guide 7th ed., Section A, pp. 16-22.
 */
export function calcGeneralProcessHazardFactor(flags: {
    exothermicReaction?: boolean;
    endothermicReaction?: boolean;
    materialHandling?: boolean;
    enclosedProcess?: boolean;
    accessDifficulty?: boolean;
}): number {
    if (typeof flags !== 'object' || flags === null) {
        throw new TypeError('calcGeneralProcessHazardFactor: flags must be an object');
    }
    const penalties: Record<string, number> = {
        exothermicReaction: 0.3,
        endothermicReaction: 0.2,
        materialHandling: 0.25,
        enclosedProcess: 0.25,
        accessDifficulty: 0.2,
    };
    const flagsRec: Record<string, boolean | undefined> = flags;
    let F1 = 1.0;
    for (const [key, penalty] of Object.entries(penalties)) {
        if (flagsRec[key]) F1 += penalty;
    }
    return Math.round(F1 * 1000) / 1000;
}

/**
 * Calculates the Fire & Explosion Index (FEI) for a process unit.
 * FEI = MF × F1 × F2
 *
 * F2 (Special Process Hazard Factor) accounts for toxic substances,
 * sub-atmospheric pressure, flammable/unstable materials in process.
 * F2 = 1.0 + specialHazardPenalty (simplified, typically 1.0–2.0).
 *
 * @param MF - Material Factor from calcMaterialFactor()
 * @param F1 - General Process Hazard Factor from calcGeneralProcessHazardFactor()
 * @param F2 - Special Process Hazard Factor (≥ 1.0)
 * @returns FEI value and hazard category
 *
 * Hazard categories per Dow FEI:
 *   FEI 1–60    → 'light'
 *   FEI 61–96   → 'moderate'
 *   FEI 97–127  → 'intermediate'
 *   FEI 128–158 → 'heavy'
 *   FEI > 158   → 'severe'
 *
 * Reference: AIChE (1994) Dow FEI Guide 7th ed., Table 3, p. 41.
 */
export function calcFireExplosionIndex(
    MF: number,
    F1: number,
    F2: number,
): { FEI: number; hazardCategory: string } {
    if (typeof MF !== 'number' || typeof F1 !== 'number' || typeof F2 !== 'number') {
        throw new TypeError('calcFireExplosionIndex: MF, F1, F2 must be numbers');
    }
    if (MF <= 0) throw new RangeError('calcFireExplosionIndex: MF must be > 0');
    if (F1 < 1) throw new RangeError('calcFireExplosionIndex: F1 must be >= 1');
    if (F2 < 1) throw new RangeError('calcFireExplosionIndex: F2 must be >= 1');

    const FEI = MF * F1 * F2;
    let hazardCategory;
    if (FEI <= 60) hazardCategory = 'light';
    else if (FEI <= 96) hazardCategory = 'moderate';
    else if (FEI <= 127) hazardCategory = 'intermediate';
    else if (FEI <= 158) hazardCategory = 'heavy';
    else hazardCategory = 'severe';

    return { FEI: Math.round(FEI * 100) / 100, hazardCategory };
}

/**
 * Classifies process hazard risk for environmental and occupational reporting.
 * Combines FEI with quantity of flammable material to produce a composite score.
 *
 * Composite Risk Score = FEI × log10(quantity_kg + 1)
 * Classification:
 *   score < 50   → 'negligible'
 *   50–200       → 'low'
 *   200–500      → 'moderate'
 *   500–1000     → 'high'
 *   > 1000       → 'very_high'
 *
 * @param FEI         - Fire & Explosion Index (from calcFireExplosionIndex)
 * @param quantity_kg - Total quantity of flammable material in process unit (kg)
 * @returns Composite score and risk level
 *
 * Reference: CCPS (2000) Guidelines for CPQRA 2nd ed., Chapter 2.
 */
export function classifyProcessHazardRisk(
    FEI: number,
    quantity_kg: number,
): { score: number; riskLevel: string } {
    if (typeof FEI !== 'number' || typeof quantity_kg !== 'number') {
        throw new TypeError('classifyProcessHazardRisk: FEI and quantity_kg must be numbers');
    }
    if (FEI < 0) throw new RangeError('classifyProcessHazardRisk: FEI must be non-negative');
    if (quantity_kg < 0) throw new RangeError('classifyProcessHazardRisk: quantity_kg must be non-negative');

    const score = FEI * Math.log10(quantity_kg + 1);
    let riskLevel;
    if (score < 50) riskLevel = 'negligible';
    else if (score < 200) riskLevel = 'low';
    else if (score < 500) riskLevel = 'moderate';
    else if (score < 1000) riskLevel = 'high';
    else riskLevel = 'very_high';

    return { score: Math.round(score * 100) / 100, riskLevel };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialProcessHazardScoreMeta: AnalyticsModuleMeta = {
    name: 'industrialProcessHazardScore',
    description: 'industrialProcessHazardScore',
    category: 'analytics',
    familyTags: ['industrial', 'risk'],
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
