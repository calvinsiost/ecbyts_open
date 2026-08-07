// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//
'use strict';

/**
 * Industrial waste audit scoring module.
 *
 * References:
 * - CONAMA Resolução 358/2004 - Tratamento e disposição de resíduos de serviços de saúde.
 * - ABNT NBR 10004:2004 - Resíduos sólidos - Classificação.
 *   https://www.abntcatalogo.com.br/norma.aspx?ID=936
 * - ABNT NBR 10005:2004 - Procedimento para obtenção de extrato lixiviado de resíduos sólidos.
 * - ABNT NBR 10006:2004 - Procedimento para obtenção de extrato solubilizado.
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

/**
 * Hazardous characteristics per ABNT NBR 10004:2004 Annex H.
 * If any characteristic is true, waste is Class I (Hazardous).
 */
const CLASS_I_CHARACTERISTICS = [
    'flammability', // Inflamabilidade
    'corrosivity', // Corrosividade
    'reactivity', // Reatividade
    'toxicity_leachate', // Toxicidade (lixiviado ABNT 10005)
    'pathogenicity', // Patogenicidade
    'mutagenicity', // Mutagenicidade / carcinogenicidade
    'teratogenicity', // Teratogenicidade
];

/**
 * Classify waste hazardousness per ABNT NBR 10004:2004.
 * - Class I: Hazardous (any hazardous characteristic present)
 * - Class IIA: Non-hazardous non-inert (may have biodegradability, combustibility, solubility)
 * - Class IIB: Non-hazardous inert (none of the above)
 *
 * @param characteristics - Map of property → true/false
 */
export function classifyWasteHazardousness(characteristics: { [key: string]: boolean }): {
    classification: 'Class_I' | 'Class_IIA' | 'Class_IIB';
    reason: string;
} {
    if (!characteristics || typeof characteristics !== 'object') {
        throw new TypeError('characteristics must be an object');
    }

    // Check Class I
    for (const prop of CLASS_I_CHARACTERISTICS) {
        if (characteristics[prop] === true) {
            return { classification: 'Class_I', reason: `Hazardous property detected: ${prop}` };
        }
    }

    // Class IIA: non-hazardous, non-inert
    const niiA = ['biodegradability', 'combustibility', 'solubility'];
    for (const prop of niiA) {
        if (characteristics[prop] === true) {
            return { classification: 'Class_IIA', reason: `Non-inert property: ${prop}` };
        }
    }

    // Class IIB: inert
    return { classification: 'Class_IIB', reason: 'No hazardous or non-inert properties detected' };
}

/**
 * Calculate waste generation intensity (kg per production unit).
 * @param wasteKg_yr    - Total waste generated (kg/year)
 * @param productionUnits - Production output (units, tonnes, m², etc.)
 */
export function calcWasteGenerationIntensity(
    wasteKg_yr: number,
    productionUnits: number,
): { intensity_kg_per_unit: number; wasteKg_yr: number; productionUnits: number } {
    if (typeof wasteKg_yr !== 'number' || wasteKg_yr < 0) {
        throw new RangeError(`wasteKg_yr must be a non-negative number, got ${wasteKg_yr}`);
    }
    if (typeof productionUnits !== 'number' || productionUnits <= 0) {
        throw new RangeError(`productionUnits must be > 0, got ${productionUnits}`);
    }
    const intensity_kg_per_unit = wasteKg_yr / productionUnits;
    return { intensity_kg_per_unit, wasteKg_yr, productionUnits };
}

/**
 * Calculate recycling/recovery rate as a percentage.
 * @param recycled_kg - Mass recycled or valorized (kg)
 * @param total_kg    - Total waste generated (kg)
 */
export function calcRecyclingRate(
    recycled_kg: number,
    total_kg: number,
): { recyclingRate_pct: number; recycled_kg: number; disposed_kg: number } {
    if (typeof recycled_kg !== 'number' || recycled_kg < 0) {
        throw new RangeError(`recycled_kg must be a non-negative number, got ${recycled_kg}`);
    }
    if (typeof total_kg !== 'number' || total_kg <= 0) {
        throw new RangeError(`total_kg must be > 0, got ${total_kg}`);
    }
    if (recycled_kg > total_kg) {
        throw new RangeError(`recycled_kg (${recycled_kg}) cannot exceed total_kg (${total_kg})`);
    }
    const recyclingRate_pct = (recycled_kg / total_kg) * 100;
    return { recyclingRate_pct, recycled_kg, disposed_kg: total_kg - recycled_kg };
}

/**
 * Calculate composite waste audit score (0–100) based on 5 criteria:
 * 1. Waste classification compliance (Class I handled correctly): 0 or 20
 * 2. Recycling rate (0–20): linearly scaled from rate%
 * 3. Generation intensity reduction vs. baseline (0–20)
 * 4. Manifest/tracking coverage % (0–20)
 * 5. Licensed disposal facility usage (boolean): 0 or 20
 *
 * @param metrics
 */
export function calcWasteAuditScore(metrics: {
    classIHandledCorrectly: boolean;
    recyclingRate_pct: number;
    intensityReduction_pct: number;
    manifestCoverage_pct: number;
    licensedDisposalUsed: boolean;
}): { score: number; breakdown: object; grade: string } {
    if (!metrics || typeof metrics !== 'object') throw new TypeError('metrics must be an object');

    const {
        classIHandledCorrectly,
        recyclingRate_pct,
        intensityReduction_pct,
        manifestCoverage_pct,
        licensedDisposalUsed,
    } = metrics;

    const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

    const s1 = classIHandledCorrectly ? 20 : 0;
    const s2 = clamp((recyclingRate_pct / 100) * 20, 0, 20);
    const s3 = clamp((intensityReduction_pct / 100) * 20, 0, 20);
    const s4 = clamp((manifestCoverage_pct / 100) * 20, 0, 20);
    const s5 = licensedDisposalUsed ? 20 : 0;

    const score = Math.round(s1 + s2 + s3 + s4 + s5);

    let grade;
    if (score >= 90) grade = 'A';
    else if (score >= 75) grade = 'B';
    else if (score >= 60) grade = 'C';
    else if (score >= 40) grade = 'D';
    else grade = 'F';

    return {
        score,
        grade,
        breakdown: {
            classI_compliance: s1,
            recycling: Number(s2.toFixed(1)),
            intensityReduction: Number(s3.toFixed(1)),
            manifestCoverage: Number(s4.toFixed(1)),
            licensedDisposal: s5,
        },
    };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialWasteAuditScoreMeta: AnalyticsModuleMeta = {
    name: 'industrialWasteAuditScore',
    description: 'industrialWasteAuditScore',
    category: 'analytics',
    familyTags: ['industrial', 'waste'],
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
