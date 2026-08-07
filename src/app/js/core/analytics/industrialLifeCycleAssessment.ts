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
 * industrialLifeCycleAssessment.js
 * Life Cycle Assessment (LCA) impact category models.
 *
 * Implements ReCiPe 2016 Midpoint (H) and CML-IA characterisation factors.
 * All characterisation factors sourced from peer-reviewed publications only -
 * no commercial software values used.
 *
 * References:
 *   [1] Huijbregts et al. (2017) ReCiPe 2016: A harmonised life cycle impact
 *       assessment method at midpoint and endpoint level. Int J Life Cycle Assess.
 *       DOI:10.1007/s11367-016-1246-y
 *   [2] Guinée et al. (2002) Handbook on Life Cycle Assessment - CML-IA,
 *       Kluwer Academic Publishers. ISBN:1-4020-0228-9
 *   [3] Fantke et al. (2017) USEtox 2.0 Documentation, doi:10.11581/DTU:00000011
 *
 * @module core/analytics/industrialLifeCycleAssessment
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
// GWP100 characterisation factors (kgCO2eq / kg) - IPCC AR6 (2021) values
// as used in ReCiPe 2016 H perspective.
// ---------------------------------------------------------------------------
const GWP100_FACTORS: Record<string, number> = {
    CO2: 1.0,
    CH4: 27.9, // fossil methane AR6 (incl. climate-carbon feedback)
    N2O: 273.0,
    HFC134a: 1526.0,
    SF6: 25200.0,
    PFC14: 7380.0,
};

// ---------------------------------------------------------------------------
// Acidification potential factors (kgSO2eq / kg) - CML-IA baseline [2]
// ---------------------------------------------------------------------------
const AP_FACTORS = {
    SO2: 1.0,
    NOx: 0.7, // NO2 equivalent
    NH3: 1.88,
};

// ---------------------------------------------------------------------------
// Eutrophication potential factors (kgPO4eq / kg) - CML-IA [2]
// ---------------------------------------------------------------------------
const EP_FACTORS_N = 0.42 / 14; // kgPO4eq per kg N (N atomic mass=14, ratio 0.42)
const EP_FACTORS_P = 3.06 / 31; // kgPO4eq per kg P (P atomic mass=31, ratio 3.06)

// ---------------------------------------------------------------------------
// Human Toxicity Potential (HTP) look-up (kg1,4-DCBeq / kg substance)
// Subset derived from USEtox v2 [3] - 20 representative environmental
// contaminants commonly tracked in Brazilian industrial sites.
// ---------------------------------------------------------------------------
const USTOX_HTP: Record<string, number> = {
    benzene: 1.0e1,
    toluene: 6.9,
    xylene: 6.1,
    ethylbenzene: 7.5,
    naphthalene: 2.3e1,
    benzo_a_pyrene: 9.6e4,
    lead: 6.0e1,
    cadmium: 1.7e3,
    mercury: 5.2e4,
    chromium_vi: 8.1e4,
    arsenic: 3.2e3,
    nickel: 1.3e1,
    copper: 2.3,
    zinc: 5.3e-1,
    vinyl_chloride: 3.1e1,
    chloroform: 4.0,
    PCE: 2.1e1,
    TCE: 2.0e1,
    lindane: 1.5e3,
    DDT: 2.7e4,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calcula o Potencial de Aquecimento Global (GWP100) de uma emissão gasosa.
 * Soma ponderada dos gases pelo fator AR6.
 *
 * @param emissions - mapa { substância: massa_kg }. Chaves aceitas:
 *   CO2, CH4, N2O, HFC134a, SF6, PFC14.
 */
export function calcGlobalWarmingPotential(emissions: Record<string, number>): {
    gwp100_kgCO2eq: number;
    breakdown: Record<string, number>;
} {
    if (!emissions || typeof emissions !== 'object') {
        throw new TypeError('emissions must be a non-null object');
    }
    let total = 0;
    const breakdown: Record<string, number> = {};
    for (const [gas, mass_kg] of Object.entries(emissions) as [string, number][]) {
        const factor = GWP100_FACTORS[gas];
        if (factor === undefined) {
            throw new RangeError(
                `Unknown GHG substance: "${gas}". Accepted: ${Object.keys(GWP100_FACTORS).join(', ')}`,
            );
        }
        if (typeof mass_kg !== 'number' || mass_kg < 0) {
            throw new RangeError(`mass_kg for "${gas}" must be a non-negative number`);
        }
        const contribution = factor * mass_kg;
        breakdown[gas] = contribution;
        total += contribution;
    }
    return { gwp100_kgCO2eq: total, breakdown };
}

/**
 * Calcula o Potencial de Acidificação (AP) - CML-IA baseline.
 * AP = SO2_kg×1.0 + NOx_kg×0.70 + NH3_kg×1.88
 *
 * @param SO2_kg   - emissão de SO2 (kg)
 * @param NOx_kg   - emissão de NOx como NO2 (kg)
 * @param NH3_kg   - emissão de amônia (kg)
 */
export function calcAcidificationPotential(
    SO2_kg: number,
    NOx_kg: number,
    NH3_kg: number,
): { ap_kgSO2eq: number } {
    for (const [name, v] of [
        ['SO2_kg', SO2_kg],
        ['NOx_kg', NOx_kg],
        ['NH3_kg', NH3_kg],
    ] as [string, number][]) {
        if (typeof v !== 'number' || v < 0) {
            throw new RangeError(`${name} must be a non-negative number`);
        }
    }
    const ap_kgSO2eq = SO2_kg * AP_FACTORS.SO2 + NOx_kg * AP_FACTORS.NOx + NH3_kg * AP_FACTORS.NH3;
    return { ap_kgSO2eq };
}

/**
 * Calcula o Potencial de Eutrofização (EP) - CML-IA.
 * EP = Naq_kg × (0.42/14) + Paq_kg × (3.06/31)
 *
 * @param Naq_kg - nitrogênio lançado em água (kg)
 * @param Paq_kg - fósforo lançado em água (kg)
 */
export function calcEutrophicationPotential(Naq_kg: number, Paq_kg: number): { ep_kgPO4eq: number } {
    for (const [name, v] of [
        ['Naq_kg', Naq_kg],
        ['Paq_kg', Paq_kg],
    ] as [string, number][]) {
        if (typeof v !== 'number' || v < 0) {
            throw new RangeError(`${name} must be a non-negative number`);
        }
    }
    const ep_kgPO4eq = Naq_kg * EP_FACTORS_N + Paq_kg * EP_FACTORS_P;
    return { ep_kgPO4eq };
}

/**
 * Calcula o Potencial de Toxicidade Humana (HTP) - USEtox v2.
 * HTP = Σ(HTPi × massa_kg_i)
 *
 * @param substances - mapa { nome_substância: massa_kg }
 */
export function calcHumanToxicityPotential(substances: Record<string, number>): {
    htp_kg14DCBeq: number;
    breakdown: Record<string, number>;
} {
    if (!substances || typeof substances !== 'object') {
        throw new TypeError('substances must be a non-null object');
    }
    let total = 0;
    const breakdown: Record<string, number> = {};
    for (const [subst, mass_kg] of Object.entries(substances) as [string, number][]) {
        const factor = USTOX_HTP[subst];
        if (factor === undefined) {
            throw new RangeError(`Unknown substance: "${subst}". Accepted: ${Object.keys(USTOX_HTP).join(', ')}`);
        }
        if (typeof mass_kg !== 'number' || mass_kg < 0) {
            throw new RangeError(`mass_kg for "${subst}" must be a non-negative number`);
        }
        const contribution = factor * mass_kg;
        breakdown[subst] = contribution;
        total += contribution;
    }
    return { htp_kg14DCBeq: total, breakdown };
}

/**
 * Identifica a categoria de impacto dominante e gera sumário.
 *
 * @param categoryScores - mapa { categoria: score_normalizado }
 *   Ex: { GWP: 0.45, AP: 0.12, EP: 0.31, HTP: 0.08 }
 */
export function classifyEnvironmentalImpact(categoryScores: Record<string, number>): {
    dominant: string;
    summary: string;
    ranked: Array<{ category: string; score: number }>;
} {
    if (!categoryScores || typeof categoryScores !== 'object') {
        throw new TypeError('categoryScores must be a non-null object');
    }
    const entries = Object.entries(categoryScores);
    if (entries.length === 0) {
        throw new RangeError('categoryScores must have at least one entry');
    }
    for (const [cat, score] of entries) {
        if (typeof score !== 'number' || score < 0) {
            throw new RangeError(`Score for "${cat}" must be a non-negative number`);
        }
    }
    const ranked = entries.map(([cat, score]) => ({ category: cat, score })).sort((a, b) => b.score - a.score);

    const dominant = ranked[0]!.category;
    const total = ranked.reduce((s, r) => s + r.score, 0);
    const pct = total > 0 ? ((ranked[0]!.score / total) * 100).toFixed(1) : '0.0';
    const summary =
        `Dominant impact category: ${dominant} (${pct}% of total normalised score). ` +
        `Ranked: ${ranked.map((r) => `${r.category}=${r.score.toFixed(3)}`).join(', ')}.`;

    return { dominant, summary, ranked };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialLifeCycleAssessmentMeta: AnalyticsModuleMeta = {
    name: 'industrialLifeCycleAssessment',
    description: 'industrialLifeCycleAssessment',
    category: 'analytics',
    familyTags: ['industrial'],
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
