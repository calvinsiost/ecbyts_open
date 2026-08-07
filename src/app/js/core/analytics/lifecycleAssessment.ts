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
// Application: EHS & Mining - Life Cycle Assessment (LCA)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Life Cycle Assessment (LCA) - Simplified Midpoint Impact Indicators
 *
 * Módulo puro implementando indicadores de impacto de ciclo de vida simplificados:
 * Potencial de Aquecimento Global (GWP), Eutrofização (EP) e Acidificação (AP).
 * Fatores de caracterização baseados em IPCC AR6 (GWP100) e CML 2002.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - IPCC (2021). Climate Change 2021: The Physical Science Basis.
 *     Contribution of Working Group I to the Sixth Assessment Report (AR6).
 *     Table 7.SM.7 - GWP100 values. Cambridge University Press.
 *     DOI: 10.1017/9781009157896
 *   - Guinée, J. B. et al. (2002). Handbook on Life Cycle Assessment:
 *     Operational Guide to the ISO Standards. CML 2002 method.
 *     Kluwer Academic Publishers. ISBN 1-4020-0228-9.
 *   - ISO 14040 (2006). Environmental management - Life cycle assessment -
 *     Principles and framework. ISO, Geneva.
 *   - ISO 14044 (2006). Environmental management - Life cycle assessment -
 *     Requirements and guidelines. ISO, Geneva.
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

// ─── GWP Characterization Factors (IPCC AR6, Table 7.SM.7) ────────────────
// Fatores de caracterização GWP100 (IPCC AR6 2021, kg CO2eq / kg)
const GWP_FACTORS = {
    co2: 1, // CO2 — reference substance
    ch4: 27.9, // CH4 — fossil methane (AR6 including climate–carbon feedback)
    n2o: 273, // N2O
    hfc: 1526, // HFC-134a (CH2FCF3) — IPCC AR6 Table 7.SM.7
};

// ─── EP Characterization Factors (CML 2002, kg PO4³⁻ eq / kg) ────────────
// Fatores de eutrofização (CML 2002, Guinée et al. 2002)
const EP_FACTORS = {
    nox: 0.13, // NOx → NO2 equivalent then PO4 eq
    nh3: 0.35, // NH3
    po4: 1.0, // PO4³⁻ — reference substance
    no3: 0.1, // NO3⁻
};

// ─── AP Characterization Factors (CML 2002, kg SO2 eq / kg) ───────────────
// Fatores de acidificação (CML 2002, Guinée et al. 2002)
const AP_FACTORS = {
    so2: 1.0, // SO2 — reference substance
    nox: 0.7, // NOx (as NO2)
    nh3: 1.88, // NH3
};

// ─── Global Warming Potential ─────────────────────────────────────────────

/**
 * Compute total Global Warming Potential (GWP100) in kg CO2-equivalent.
 * Calcula o potencial total de aquecimento global (GWP100) em kg CO2eq.
 *
 * GWP = Σ (mass_i × GWP_factor_i)
 * using IPCC AR6 (2021) GWP100 characterization factors.
 *
 * @param emissions
 *   Mass of each greenhouse gas emitted (kg). Missing keys default to 0.
 * @returns total GWP in kg CO2eq
 * @throws {TypeError} if emissions is not an object
 * @throws {RangeError} if any emission value is negative
 */
export function computeGlobalWarmingPotential(emissions: {
    co2?: number;
    ch4?: number;
    n2o?: number;
    hfc?: number;
}): { gwp: number } {
    if (typeof emissions !== 'object' || emissions === null || Array.isArray(emissions)) {
        throw new TypeError('emissions must be a plain object');
    }

    let gwp = 0;
    const emissionsRec = emissions as Record<string, number>;
    for (const [gas, factor] of Object.entries(GWP_FACTORS)) {
        const mass = emissionsRec[gas] ?? 0;
        if (typeof mass !== 'number' || mass < 0) {
            throw new RangeError(`emissions.${gas} must be a non-negative number (kg)`);
        }
        gwp += mass * factor;
    }
    return { gwp };
}

// ─── Eutrophication Potential ─────────────────────────────────────────────

/**
 * Compute total Eutrophication Potential (EP) in kg PO4³⁻-equivalent.
 * Calcula o potencial de eutrofização em kg PO4eq (CML 2002).
 *
 * EP = Σ (mass_i × EP_factor_i)
 *
 * @param emissions
 *   Mass of each nutrient emitted (kg). Missing keys default to 0.
 * @returns total EP in kg PO4eq
 * @throws {TypeError} if emissions is not an object
 * @throws {RangeError} if any emission value is negative
 */
export function computeEutrophicationPotential(emissions: {
    nox?: number;
    nh3?: number;
    po4?: number;
    no3?: number;
}): { ep: number } {
    if (typeof emissions !== 'object' || emissions === null || Array.isArray(emissions)) {
        throw new TypeError('emissions must be a plain object');
    }

    let ep = 0;
    const emissionsRec = emissions as Record<string, number>;
    for (const [substance, factor] of Object.entries(EP_FACTORS)) {
        const mass = emissionsRec[substance] ?? 0;
        if (typeof mass !== 'number' || mass < 0) {
            throw new RangeError(`emissions.${substance} must be a non-negative number (kg)`);
        }
        ep += mass * factor;
    }
    return { ep };
}

// ─── Acidification Potential ──────────────────────────────────────────────

/**
 * Compute total Acidification Potential (AP) in kg SO2-equivalent.
 * Calcula o potencial de acidificação em kg SO2eq (CML 2002).
 *
 * AP = Σ (mass_i × AP_factor_i)
 *
 * @param emissions
 *   Mass of each acid precursor emitted (kg). Missing keys default to 0.
 * @returns total AP in kg SO2eq
 * @throws {TypeError} if emissions is not an object
 * @throws {RangeError} if any emission value is negative
 */
export function computeAcidificationPotential(emissions: {
    so2?: number;
    nox?: number;
    nh3?: number;
}): { ap: number } {
    if (typeof emissions !== 'object' || emissions === null || Array.isArray(emissions)) {
        throw new TypeError('emissions must be a plain object');
    }

    let ap = 0;
    const emissionsRec = emissions as Record<string, number>;
    for (const [substance, factor] of Object.entries(AP_FACTORS)) {
        const mass = emissionsRec[substance] ?? 0;
        if (typeof mass !== 'number' || mass < 0) {
            throw new RangeError(`emissions.${substance} must be a non-negative number (kg)`);
        }
        ap += mass * factor;
    }
    return { ap };
}

// ─── Impact Classification ────────────────────────────────────────────────

/**
 * Classify overall environmental impact category from midpoint LCA indicators.
 * Classifica a categoria de impacto ambiental geral a partir dos indicadores LCA.
 *
 * Thresholds (conservative screening values for industrial activities):
 *   HIGH:   GWP > 10000 kg CO2eq  OR  EP > 100 kg PO4eq  OR  AP > 50 kg SO2eq
 *   MEDIUM: GWP > 1000             OR  EP > 10             OR  AP > 5
 *   LOW:    otherwise
 *
 * @param gwp - Global Warming Potential (kg CO2eq, ≥ 0)
 * @param ep  - Eutrophication Potential (kg PO4eq, ≥ 0)
 * @param ap  - Acidification Potential (kg SO2eq, ≥ 0)
 * @throws {RangeError} if any indicator is negative
 */
export function classifyEnvironmentalImpact(
    gwp: number,
    ep: number,
    ap: number,
): { category: 'low' | 'medium' | 'high'; dominantIndicator: string } {
    for (const [name, val] of [
        ['gwp', gwp],
        ['ep', ep],
        ['ap', ap],
    ] as Array<[string, number]>) {
        if (typeof val !== 'number' || val < 0) {
            throw new RangeError(`${name} must be a non-negative number`);
        }
    }

    // Determinar categoria e indicador dominante
    const isHigh = gwp > 10000 || ep > 100 || ap > 50;
    const isMedium = gwp > 1000 || ep > 10 || ap > 5;

    const category: 'low' | 'medium' | 'high' = isHigh ? 'high' : isMedium ? 'medium' : 'low';

    // Identificar indicador dominante pelo valor normalizado
    // Normaliza cada indicador pelo limiar de categoria alta
    const scores = { gwp: gwp / 10000, ep: ep / 100, ap: ap / 50 };
    const dominantIndicator = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]![0];

    return { category, dominantIndicator };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const lifecycleAssessmentMeta: AnalyticsModuleMeta = {
    name: 'lifecycleAssessment',
    description: 'Life Cycle Assessment (LCA)',
    category: 'analytics',
    familyTags: ['environmental'],
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
