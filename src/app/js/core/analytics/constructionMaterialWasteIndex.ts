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
 * Construction Material Waste Index (CMWI) - Skoyles (1976) + Formoso et al. (2002) + ABNT NBR 15112.
 *
 * Referências:
 *   Skoyles, E.R. (1976). Material wastage - a misuse of resources. Build. Technol. Manage., 14, 24–26.
 *   Formoso, C.T. et al. (2002). Material waste in building industry: main causes and prevention.
 *     J. Constr. Eng. Manage., 128(4), 316–325. DOI:10.1061/(ASCE)0733-9364(2002)128:4(316)
 *   ABNT NBR 15112:2007 - Resíduos da construção civil e resíduos volumosos.
 *   CONAMA Resolution 307/2002 - Gestão de resíduos da construção civil.
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
 * Waste benchmarks by material type (% of purchased quantity lost as waste).
 * Source: Formoso et al. (2002) Table 3 + Skoyles (1976).
 * @private
 */
const WASTE_BENCHMARKS: Record<string, { mean_pct: number; low_pct: number; high_pct: number }> = {
    concrete: { mean_pct: 8, low_pct: 3, high_pct: 15 },
    steel_rebar: { mean_pct: 10, low_pct: 5, high_pct: 15 },
    ceramic_tile: { mean_pct: 14, low_pct: 8, high_pct: 20 },
    mortar: { mean_pct: 25, low_pct: 10, high_pct: 40 },
    timber: { mean_pct: 15, low_pct: 8, high_pct: 25 },
    drywall: { mean_pct: 12, low_pct: 5, high_pct: 20 },
    masonry_block: { mean_pct: 13, low_pct: 6, high_pct: 20 },
    pvc_pipe: { mean_pct: 8, low_pct: 3, high_pct: 15 },
    insulation: { mean_pct: 10, low_pct: 5, high_pct: 20 },
    glass: { mean_pct: 5, low_pct: 2, high_pct: 10 },
};

/**
 * CONAMA 307/2002 waste classification.
 * @private
 */
const CONAMA_CLASSES: Record<'A' | 'B' | 'C' | 'D', string> = {
    A: 'reutilizável ou reciclável — terra, argamassa, cerâmica, concreto, alvenaria',
    B: 'reciclável para outras destinações — plástico, papel, metal, vidro, madeira',
    C: 'sem tecnologia ou aplicação economicamente viável para recuperação — PVC, gesso',
    D: 'perigoso — tintas, óleos, amianto, solventes',
};

/**
 * Calculates the waste index (%) for a single material.
 *
 * Waste Index = (Quantity Wasted / Quantity Ordered) × 100
 *
 * @param {number} quantity_ordered  - total quantity ordered/purchased (any consistent unit)
 * @param {number} quantity_wasted   - quantity discarded as waste
 * @returns {{ waste_index_pct: number, waste_ratio: number }}
 *
 * @see Formoso et al. (2002) DOI:10.1061/(ASCE)0733-9364(2002)128:4(316)
 */
export function calcMaterialWasteIndex(
    quantity_ordered: number,
    quantity_wasted: number,
): { waste_index_pct: number; waste_ratio: number } {
    if (quantity_ordered <= 0) throw new RangeError('calcMaterialWasteIndex: quantity_ordered must be > 0');
    if (quantity_wasted < 0) throw new RangeError('calcMaterialWasteIndex: quantity_wasted must be >= 0');
    if (quantity_wasted > quantity_ordered) {
        throw new RangeError('calcMaterialWasteIndex: quantity_wasted cannot exceed quantity_ordered');
    }

    const waste_ratio = quantity_wasted / quantity_ordered;
    return { waste_index_pct: waste_ratio * 100, waste_ratio };
}

/**
 * Classifies material waste performance against benchmarks.
 *
 * @param {string} materialType       - key from WASTE_BENCHMARKS (e.g. 'concrete')
 * @param {number} observed_waste_pct - measured waste index (%)
 * @returns {{ classification: 'excellent'|'good'|'average'|'poor'|'critical',
 *             benchmark_mean_pct: number, benchmark_low_pct: number, benchmark_high_pct: number, deviation_pct: number }}
 *
 * @see Skoyles (1976); Formoso et al. (2002)
 */
export function classifyWastePerformance(
    materialType: string,
    observed_waste_pct: number,
): {
    classification: 'excellent' | 'good' | 'average' | 'poor' | 'critical';
    benchmark_mean_pct: number;
    benchmark_low_pct: number;
    benchmark_high_pct: number;
    deviation_pct: number;
} {
    if (observed_waste_pct < 0) throw new RangeError('classifyWastePerformance: observed_waste_pct must be >= 0');

    const benchmark = WASTE_BENCHMARKS[materialType];
    if (!benchmark) {
        throw new TypeError(
            `classifyWastePerformance: unknown materialType '${materialType}'. ` +
                `Valid: ${Object.keys(WASTE_BENCHMARKS).join(', ')}`,
        );
    }

    const { mean_pct, low_pct, high_pct } = benchmark;
    const deviation_pct = observed_waste_pct - mean_pct;

    let classification: 'excellent' | 'good' | 'average' | 'poor' | 'critical';
    if (observed_waste_pct <= low_pct * 0.75) classification = 'excellent';
    else if (observed_waste_pct <= low_pct) classification = 'good';
    else if (observed_waste_pct <= mean_pct) classification = 'average';
    else if (observed_waste_pct <= high_pct) classification = 'poor';
    else classification = 'critical';

    return {
        classification,
        benchmark_mean_pct: mean_pct,
        benchmark_low_pct: low_pct,
        benchmark_high_pct: high_pct,
        deviation_pct,
    };
}

/**
 * Calculates aggregate Construction Material Waste Index (CMWI) for a project.
 *
 * CMWI = Σ (waste_mass_i / total_waste_mass) × waste_index_i
 * (weighted average waste index across all materials)
 *
 * @param {Array<{material: string, quantity_ordered: number, quantity_wasted: number, unit_mass_kg: number}>} materials
 * @returns {{ CMWI_pct: number, total_waste_kg: number, total_ordered_kg: number,
 *             breakdown: Array<{material: string, waste_index_pct: number, waste_kg: number, ordered_kg: number}> }}
 *
 * @see Formoso et al. (2002) DOI:10.1061/(ASCE)0733-9364(2002)128:4(316)
 */
export function calcProjectWasteIndex(
    materials: Array<{
        material: string;
        quantity_ordered: number;
        quantity_wasted: number;
        unit_mass_kg?: number;
    }>,
): {
    CMWI_pct: number;
    total_waste_kg: number;
    total_ordered_kg: number;
    breakdown: Array<{ material: string; waste_index_pct: number; waste_kg: number; ordered_kg: number }>;
} {
    if (!Array.isArray(materials) || materials.length === 0) {
        throw new TypeError('calcProjectWasteIndex: materials must be a non-empty array');
    }

    let total_waste_kg = 0;
    let total_ordered_kg = 0;

    const breakdown = materials.map(({ material, quantity_ordered, quantity_wasted, unit_mass_kg = 1 }) => {
        const { waste_index_pct } = calcMaterialWasteIndex(quantity_ordered, quantity_wasted);
        const waste_kg = quantity_wasted * unit_mass_kg;
        const ordered_kg = quantity_ordered * unit_mass_kg;
        total_waste_kg += waste_kg;
        total_ordered_kg += ordered_kg;
        return { material, waste_index_pct, waste_kg, ordered_kg };
    });

    // Mass-weighted average waste index
    const CMWI_pct = total_ordered_kg > 0 ? (total_waste_kg / total_ordered_kg) * 100 : 0;

    return { CMWI_pct, total_waste_kg, total_ordered_kg, breakdown };
}

/**
 * Classifies construction debris under CONAMA 307/2002.
 *
 * @param {string} description - plain-language description of waste type
 * @returns {{ class: 'A'|'B'|'C'|'D', description: string }}
 *
 * Simplified keyword-based classifier - not exhaustive; use professional judgment.
 * @see CONAMA Resolution 307/2002
 */
export function classifyCONAMA307(description: string): { class: 'A' | 'B' | 'C' | 'D'; description: string } {
    if (typeof description !== 'string' || description.trim() === '') {
        throw new TypeError('classifyCONAMA307: description must be a non-empty string');
    }

    const lower = description.toLowerCase();

    const classD_keywords = ['amianto', 'asbestos', 'tinta', 'solvente', 'óleo', 'oleo', 'perigoso', 'hazardous'];
    const classC_keywords = ['pvc', 'gesso', 'plaster', 'teto falso', 'elastomero'];
    const classB_keywords = ['plástico', 'plastico', 'metal', 'vidro', 'papel', 'madeira', 'wood', 'glass', 'paper'];

    if (classD_keywords.some((k) => lower.includes(k))) return { class: 'D', description: CONAMA_CLASSES.D };
    if (classC_keywords.some((k) => lower.includes(k))) return { class: 'C', description: CONAMA_CLASSES.C };
    if (classB_keywords.some((k) => lower.includes(k))) return { class: 'B', description: CONAMA_CLASSES.B };
    return { class: 'A', description: CONAMA_CLASSES.A };
}

/**
 * Returns benchmark data for all known material types.
 * Useful for UI display and reporting.
 *
 * @returns {Object} copy of internal WASTE_BENCHMARKS
 */
export function getWasteBenchmarks(): Record<string, { mean_pct: number; low_pct: number; high_pct: number }> {
    return Object.fromEntries(Object.entries(WASTE_BENCHMARKS).map(([k, v]) => [k, { ...v }]));
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const constructionMaterialWasteIndexMeta: AnalyticsModuleMeta = {
    name: 'constructionMaterialWasteIndex',
    description: 'constructionMaterialWasteIndex',
    category: 'analytics',
    familyTags: ['waste', 'construction'],
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
