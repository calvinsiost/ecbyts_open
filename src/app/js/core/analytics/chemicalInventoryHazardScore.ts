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
 * Chemical Inventory Hazard Score - GHS (UN 2021) + NFPA 704 (2022)
 *
 * Provides standardized hazard scoring for chemical inventories using
 * globally harmonized classification criteria and NFPA emergency response ratings.
 *
 * References:
 *   - UN GHS 9th Revised Edition (2021) - Globally Harmonized System of Classification
 *     and Labelling of Chemicals. ISBN 978-92-1-116981-4
 *   - NFPA 704 (2022) - Standard System for the Identification of the Hazards of
 *     Materials for Emergency Response. National Fire Protection Association.
 *   - US EPA RMP (2019 amendments) - Risk Management Program (40 CFR Part 68)
 *   - EU CLP Regulation (EC) No 1272/2008 - Classification, Labelling and Packaging
 *
 * @module chemicalInventoryHazardScore
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
 * GHS hazard category weights by hazard class and category number.
 * Higher category number = less severe in GHS (Cat 1 = most hazardous).
 * Weights are proportional to regulatory severity (0–25 per class).
 *
 * Structure: { hazardClass: { cat1: weight, cat2: weight, ... } }
 */
const GHS_WEIGHTS = {
    // Physical hazards
    flammable_liquids: { 1: 20, 2: 15, 3: 10, 4: 5 },
    explosive: { 1: 25, 2: 22, 3: 18, 4: 14, 5: 10, 6: 6 },
    oxidizing_liquids: { 1: 18, 2: 12, 3: 8 },
    gases_under_pressure: { compressed: 8, liquefied: 8, refrigerated: 8, dissolved: 8 },
    self_reactive: { A: 20, B: 18, C: 14, D: 12, E: 8, F: 6 },
    // Health hazards
    acute_toxicity_oral: { 1: 25, 2: 20, 3: 15, 4: 10, 5: 5 },
    acute_toxicity_dermal: { 1: 25, 2: 20, 3: 15, 4: 10, 5: 5 },
    acute_toxicity_inhal: { 1: 25, 2: 20, 3: 15, 4: 10, 5: 5 },
    carcinogenicity: { 1: 22, 2: 14 },
    reproductive_toxicity: { 1: 20, 2: 14 },
    skin_sensitization: { 1: 10, 2: 6 },
    eye_irritation: { 1: 12, 2: 6 },
    // Environmental hazards
    aquatic_acute: { 1: 18, 2: 10, 3: 5 },
    aquatic_chronic: { 1: 20, 2: 14, 3: 8, 4: 5 },
};

/**
 * Normalize a raw GHS score sum to 0–100 scale.
 * Maximum theoretical score is bounded at 100.
 */
const GHS_MAX_RAW = 150; // theoretical max for a multi-hazard substance

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Assert integer in [min, max].
 */
function assertIntRange(v: unknown, name: string, min: number, max: number): void {
    if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) {
        throw new RangeError(`chemicalInventoryHazardScore: ${name} must be integer in [${min},${max}], got ${v}`);
    }
}

/**
 * Assert finite non-negative number.
 */
function assertNonNeg(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`chemicalInventoryHazardScore: ${name} must be non-negative finite number, got ${v}`);
    }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/**
 * Calculate GHS hazard score (0–100) for a substance from its hazard classes.
 *
 * Each entry in hazardClasses: { class: string, category: number|string }
 * e.g. { class: 'acute_toxicity_oral', category: 2 }
 *
 * Score is cumulative, capped at 100.
 *
 * @param hazardClasses - list of hazard class entries
 * @returns score, matched, details
 */
export function calcGHSHazardScore(
    hazardClasses: Array<{ class: string; category: number | string }>,
): { score: number; matched: number; details: object[] } {
    if (!Array.isArray(hazardClasses)) {
        throw new TypeError('chemicalInventoryHazardScore.calcGHSHazardScore: hazardClasses must be an array');
    }
    let rawScore = 0;
    let matched = 0;
    const details: object[] = [];
    const weights = GHS_WEIGHTS as unknown as Record<string, Record<string | number, number>>;
    for (const hc of hazardClasses) {
        const cls = (hc.class || '').toLowerCase().replace(/\s+/g, '_');
        const cat = hc.category;
        const classWeights = weights[cls];
        if (!classWeights) {
            details.push({ class: cls, category: cat, weight: 0, recognized: false });
            continue;
        }
        const weight = classWeights[cat] ?? 0;
        rawScore += weight;
        matched++;
        details.push({ class: cls, category: cat, weight, recognized: true });
    }
    const score = Math.min(100, Math.round((rawScore / GHS_MAX_RAW) * 100));
    return { score, matched, details };
}

/**
 * Calculate NFPA 704 composite score.
 *
 * NFPA 704 uses four ratings (0–4 each):
 *   H = health (blue), F = flammability (red), R = reactivity (yellow),
 *   S = special (white: OX, W, SA, COR, RAD - encoded as 0–2 each)
 *
 * Total score = H + F + R + S  (max 14 if special=2)
 * Diamond hazard symbol: highest of H/F/R drives overall severity.
 *
 * @param health       - NFPA health rating (0–4)
 * @param flammability - NFPA flammability rating (0–4)
 * @param reactivity   - NFPA reactivity rating (0–4)
 * @param special      - Special hazard score (0–2: 0=none, 1=one symbol, 2=two+)
 * @returns score, maxRating, severity
 */
export function calcNFPA704Score(
    health: number,
    flammability: number,
    reactivity: number,
    special: number = 0,
): { score: number; maxRating: number; severity: 'minimal' | 'low' | 'moderate' | 'high' | 'extreme' } {
    assertIntRange(health, 'health', 0, 4);
    assertIntRange(flammability, 'flammability', 0, 4);
    assertIntRange(reactivity, 'reactivity', 0, 4);
    assertIntRange(special, 'special', 0, 2);

    const score = health + flammability + reactivity + special;
    const maxRating = Math.max(health, flammability, reactivity);

    let severity: 'minimal' | 'low' | 'moderate' | 'high' | 'extreme';
    if (maxRating === 0) severity = 'minimal';
    else if (maxRating === 1) severity = 'low';
    else if (maxRating === 2) severity = 'moderate';
    else if (maxRating === 3) severity = 'high';
    else severity = 'extreme';

    return { score, maxRating, severity };
}

/**
 * Calculate composite inventory risk score for a collection of substances.
 *
 * Each substance: { name, ghsScore: number, quantity_kg: number }
 * Risk = weighted mean of GHS scores, weighted by log(1 + quantity_kg).
 * Logarithmic weighting dampens extreme quantities per EPA RMP guidance.
 *
 * @param substances - list of substances
 * @returns inventoryRisk, dominantSubstance, count
 */
export function calcInventoryRisk(
    substances: Array<{ name: string; ghsScore: number; quantity_kg: number }>,
): { inventoryRisk: number; dominantSubstance: string; count: number } {
    if (!Array.isArray(substances) || substances.length === 0) {
        throw new TypeError('chemicalInventoryHazardScore.calcInventoryRisk: substances must be non-empty array');
    }
    let weightedSum = 0;
    let totalWeight = 0;
    let maxScore = -Infinity;
    let dominantSubstance = '';

    for (const s of substances) {
        assertNonNeg(s.ghsScore, `${s.name}.ghsScore`);
        assertNonNeg(s.quantity_kg, `${s.name}.quantity_kg`);
        const w = Math.log1p(s.quantity_kg);
        weightedSum += s.ghsScore * w;
        totalWeight += w;
        if (s.ghsScore > maxScore) {
            maxScore = s.ghsScore;
            dominantSubstance = s.name || 'unknown';
        }
    }

    const inventoryRisk = totalWeight > 0 ? weightedSum / totalWeight : 0;
    return { inventoryRisk: Math.round(inventoryRisk * 10) / 10, dominantSubstance, count: substances.length };
}

/**
 * Classify chemical risk level from a composite score (0–100).
 *
 * @param score - Chemical hazard score (0–100)
 * @returns risk level
 */
export function classifyChemicalRisk(score: number): 'minimal' | 'low' | 'moderate' | 'high' | 'extreme' {
    if (typeof score !== 'number' || !isFinite(score) || score < 0 || score > 100) {
        throw new RangeError(
            `chemicalInventoryHazardScore.classifyChemicalRisk: score must be in [0,100], got ${score}`,
        );
    }
    if (score < 10) return 'minimal';
    if (score < 30) return 'low';
    if (score < 55) return 'moderate';
    if (score < 75) return 'high';
    return 'extreme';
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const chemicalInventoryHazardScoreMeta: AnalyticsModuleMeta = {
    name: 'chemicalInventoryHazardScore',
    description: 'chemicalInventoryHazardScore',
    category: 'analytics',
    familyTags: ['chemical', 'risk'],
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
