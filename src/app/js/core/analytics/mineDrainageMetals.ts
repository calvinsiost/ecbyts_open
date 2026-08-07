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
// Application: EHS & Mining - Acid Mine Drainage Metal Treatment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Mine Drainage Metals - Speciation, Treatment and Sizing
 *
 * Módulo puro para análise de metais em drenagem ácida de minas (AMD/DAM):
 * especiação química, remoção por calagem, dimensionamento de wetland passivo
 * e classificação de abordagem de tratamento.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Younger, P. L., Banwart, S. A., & Hedin, R. S. (2002).
 *     Mine Water: Hydrology, Pollution, Remediation. Kluwer Academic Publishers.
 *     ISBN: 978-1-4020-0138-5
 *     (Pourbaix diagram simplification, AMD characterization)
 *   - ITRC (Interstate Technology & Regulatory Council) (2010).
 *     Technical and Regulatory Guidance for Constructed Treatment Wetlands.
 *     Washington, DC: ITRC. Available: www.itrcweb.org
 *     (wetland sizing, passive treatment HRT)
 *   - Skousen, J., Ziemkiewicz, P., & McDonald, L. (2017).
 *     "Acid Mine Drainage Formation, Control and Treatment: Approaches and Strategies."
 *     The Extractive Industries and Society, 4(3), 552–558.
 *     DOI: 10.1016/j.exis.2017.04.001
 *     (lime treatment efficiency table, AMD classification)
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

// Profundidade padrão de wetland passivo (m) conforme ITRC (2010)
const WETLAND_DEPTH_M = 0.3;

// Tabela de eficiência de remoção por calagem (pH alvo → remoção %)
// Baseado em Skousen et al. (2017) e dados de campo AMD
const LIME_REMOVAL_TABLE: Record<string, Record<number, number>> = {
    Fe: { 6: 95, 8: 99 },
    Mn: { 8: 80, 9: 95 },
    Zn: { 8: 85, 9: 98 },
    Cu: { 7: 95, 8: 99 },
};

/**
 * Validates all inputs for computeMetalSpeciation.
 * @throws {TypeError} If any parameter has the wrong type
 * @throws {RangeError} If any parameter is outside its valid range
 */
function validateSpeciationInputs(
    totalMetal_mg_L: number,
    ph: number,
    eh_mV: number,
    temperature_C: number,
): void {
    if (typeof totalMetal_mg_L !== 'number' || totalMetal_mg_L < 0) {
        throw new RangeError('totalMetal_mg_L must be >= 0');
    }
    if (typeof ph !== 'number' || ph < 0 || ph > 14) {
        throw new RangeError('ph must be between 0 and 14');
    }
    if (typeof eh_mV !== 'number' || !isFinite(eh_mV)) {
        throw new TypeError('eh_mV must be a finite number');
    }
    if (typeof temperature_C !== 'number' || !isFinite(temperature_C)) {
        throw new TypeError('temperature_C must be a finite number');
    }
}

/**
 * Determines metal solubility class from pH.
 */
function determineSolubility(ph: number): string {
    if (ph < 4) return 'high';
    if (ph <= 6) return 'moderate';
    return 'low';
}

/**
 * Determines the dominant metal form from pH and redox potential.
 */
function determineDominantForm(ph: number, isOxidizing: boolean, isReducing: boolean): string {
    if (ph < 4) {
        return isReducing ? 'Fe2+' : 'Fe3+_aq';
    }
    if (ph <= 6) {
        return isOxidizing ? 'FeOOH' : 'Fe(OH)2';
    }
    return isOxidizing ? 'Fe(OH)3' : 'Fe(OH)2';
}

/**
 * Computes simplified metal speciation using Pourbaix diagram approximations.
 * Calcula a especiação simplificada do metal usando aproximações de diagramas de Pourbaix.
 *
 * Solubility rules (Younger et al. 2002):
 *   pH < 4: high (metals remain dissolved)
 *   pH 4–6: moderate (partial hydroxide precipitation)
 *   pH > 6: low (hydroxide precipitation dominates)
 *
 * @param totalMetal_mg_L - Total dissolved metal concentration (mg/L)
 * @param ph              - Solution pH (0–14)
 * @param eh_mV           - Redox potential in millivolts
 * @param temperature_C   - Solution temperature (°C)
 */
export function computeMetalSpeciation(
    totalMetal_mg_L: number,
    ph: number,
    eh_mV: number,
    temperature_C: number,
): { dominantForm: string; solubility: string } {
    validateSpeciationInputs(totalMetal_mg_L, ph, eh_mV, temperature_C);

    const solubility = determineSolubility(ph);
    const dominantForm = determineDominantForm(ph, eh_mV > 200, eh_mV < -100);

    return { dominantForm, solubility };
}

/**
 * Computes metal removal efficiency by lime dosing.
 * Calcula a eficiência de remoção de metais por calagem.
 *
 * Uses tabulated removal efficiencies (Skousen et al. 2017).
 * Lime requirement: 0.5 × (pH_target − pH_initial) kg/m³ (empirical)
 *
 * @param inflowConc_mg_L - Inlet metal concentration (mg/L)
 * @param ph_target       - Target pH after liming
 * @param metal           - Metal symbol: 'Fe', 'Mn', 'Zn', 'Cu'
 * @param initial_pH  - Initial solution pH
 */
export function computeMetalRemovalByLime(
    inflowConc_mg_L: number,
    ph_target: number,
    metal: string,
    initial_pH: number = 4,
): { removal_pct: number; effluentConc_mg_L: number; limeRequired_kg_m3: number } {
    if (typeof inflowConc_mg_L !== 'number' || inflowConc_mg_L < 0) {
        throw new RangeError('inflowConc_mg_L must be >= 0');
    }
    if (typeof ph_target !== 'number' || ph_target < 0 || ph_target > 14) {
        throw new RangeError('ph_target must be between 0 and 14');
    }
    if (!LIME_REMOVAL_TABLE[metal]) {
        throw new TypeError(`metal must be one of: ${Object.keys(LIME_REMOVAL_TABLE).join(', ')}`);
    }

    const table = LIME_REMOVAL_TABLE[metal];
    const phKeys = Object.keys(table)
        .map(Number)
        .sort((a, b) => a - b);

    let removal_pct;
    if (ph_target <= phKeys[0]!) {
        removal_pct = table[phKeys[0]!]!;
    } else if (ph_target >= phKeys[phKeys.length - 1]!) {
        removal_pct = table[phKeys[phKeys.length - 1]!]!;
    } else {
        let lower = phKeys[0]!,
            upper = phKeys[phKeys.length - 1]!;
        for (let i = 0; i < phKeys.length - 1; i++) {
            if (ph_target >= phKeys[i]! && ph_target <= phKeys[i + 1]!) {
                lower = phKeys[i]!;
                upper = phKeys[i + 1]!;
                break;
            }
        }
        const t = (ph_target - lower) / (upper - lower);
        removal_pct = table[lower]! + t * (table[upper]! - table[lower]!);
    }

    const effluentConc_mg_L = inflowConc_mg_L * (1 - removal_pct / 100);
    const limeRequired_kg_m3 = Math.max(0, 0.5 * (ph_target - initial_pH));

    return { removal_pct, effluentConc_mg_L, limeRequired_kg_m3 };
}

/**
 * Sizes a passive constructed wetland for AMD treatment.
 * Dimensiona um wetland construído passivo para tratamento de DAM.
 *
 * Area = Q × HRT / depth (ITRC 2010)
 * depth = 0.3 m (standard)
 *
 * @param flow_m3_day     - Influent flow rate (m³/day)
 * @param inletConc_mg_L  - Inlet metal concentration (mg/L)
 * @param targetConc_mg_L - Target effluent concentration (mg/L)
 * @param hrt_hours       - Hydraulic retention time (hours)
 */
export function computePassiveTreatmentSizing(
    flow_m3_day: number,
    inletConc_mg_L: number,
    targetConc_mg_L: number,
    hrt_hours: number,
): { area_m2: number; volume_m3: number; loadingRate_g_m2_day: number } {
    if (typeof flow_m3_day !== 'number' || flow_m3_day <= 0) {
        throw new RangeError('flow_m3_day must be > 0');
    }
    if (typeof inletConc_mg_L !== 'number' || inletConc_mg_L < 0) {
        throw new RangeError('inletConc_mg_L must be >= 0');
    }
    if (typeof targetConc_mg_L !== 'number' || targetConc_mg_L < 0) {
        throw new RangeError('targetConc_mg_L must be >= 0');
    }
    if (typeof hrt_hours !== 'number' || hrt_hours <= 0) {
        throw new RangeError('hrt_hours must be > 0');
    }

    const area_m2 = (flow_m3_day * hrt_hours) / (24 * WETLAND_DEPTH_M);
    const volume_m3 = area_m2 * WETLAND_DEPTH_M;

    const removedLoad_g_day = flow_m3_day * (inletConc_mg_L - targetConc_mg_L);
    const loadingRate_g_m2_day = removedLoad_g_day / area_m2;

    return { area_m2, volume_m3, loadingRate_g_m2_day };
}

/**
 * Classifies AMD treatment approach based on water chemistry and flow.
 * Classifica a abordagem de tratamento de DAM com base na química e vazão.
 *
 * Decision logic (ITRC 2010, Skousen et al. 2017):
 *   - acidity > 300 mg/L CaCO3 OR flow > 500 m³/day → active lime dosing
 *   - pH > 4.5 → passive limestone treatment
 *   - pH 3–4.5 → anoxic limestone drain (ALD)
 *   - metals + organics → constructed wetland
 *   - otherwise → combined approach
 *
 * @param ph                  - Water pH
 * @param ironConc_mg_L       - Total iron concentration (mg/L)
 * @param flow_m3_day         - Influent flow rate (m³/day)
 * @param acidity_mg_L_CaCO3  - Total acidity as CaCO3 (mg/L)
 */
export function classifyAMDTreatmentApproach(
    ph: number,
    ironConc_mg_L: number,
    flow_m3_day: number,
    acidity_mg_L_CaCO3: number,
): { approach: string } {
    if (typeof ph !== 'number' || ph < 0 || ph > 14) {
        throw new RangeError('ph must be between 0 and 14');
    }
    if (typeof ironConc_mg_L !== 'number' || ironConc_mg_L < 0) {
        throw new RangeError('ironConc_mg_L must be >= 0');
    }
    if (typeof flow_m3_day !== 'number' || flow_m3_day < 0) {
        throw new RangeError('flow_m3_day must be >= 0');
    }
    if (typeof acidity_mg_L_CaCO3 !== 'number' || acidity_mg_L_CaCO3 < 0) {
        throw new RangeError('acidity_mg_L_CaCO3 must be >= 0');
    }

    if (acidity_mg_L_CaCO3 > 300 || flow_m3_day > 500) {
        return { approach: 'active_lime' };
    }

    if (ph > 4.5) {
        return { approach: 'passive_limestone' };
    }

    if (ph >= 3) {
        return { approach: 'anoxic_limestone_drain' };
    }

    if (ironConc_mg_L > 10) {
        return { approach: 'constructed_wetland' };
    }

    return { approach: 'combined' };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const mineDrainageMetalsMeta: AnalyticsModuleMeta = {
    name: 'mineDrainageMetals',
    description: 'Acid Mine Drainage Metal Treatment',
    category: 'analytics',
    familyTags: ['mining', 'stormwater'],
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
