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
// Application: EHS & Mining - Carbon Sequestration
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Carbon Sequestration - Forest Biomass, Carbon Stock & REDD+ Eligibility
 *
 * Módulo puro para estimativa de sequestro de carbono em ecossistemas florestais:
 * biomassa acima do solo (Chave et al. 2014), estoque de carbono (IPCC 2006),
 * taxa de sequestro anual e elegibilidade REDD+.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   - Chave, J. et al. (2014). Improved allometric models to estimate the
 *     aboveground biomass of tropical trees. Glob. Change Biol., 20, 3177–3190.
 *     DOI: 10.1111/gcb.12629
 *   - IPCC (2006). Guidelines for National GHG Inventories, Vol. 4: AFOLU.
 *     Chapter 4 (Forest Land). Root-to-shoot ratio Table 4.4.
 *   - Verra VCS Standard v4.1 (2023). Requirements for REDD+ project activities.
 *     https://verra.org/programs/verified-carbon-standard/
 *
 * @module carbonSequestration
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

/** CO2/C molecular weight ratio (44/12) */
const CO2_C_RATIO = 44 / 12;

/** Default carbon fraction (IPCC 2006 Eq. 4.1) */
const DEFAULT_CARBON_FRACTION = 0.47;

/** Root-to-shoot ratio (below-ground / above-ground biomass, IPCC 2006 Table 4.4) */
const ROOT_TO_SHOOT_RATIO = 0.26;

/** REDD+ minimum deforestation risk threshold */
const REDD_MIN_DEFORESTATION_RISK = 0.1;

/** REDD+ minimum carbon stock threshold (t CO2/ha) */
const REDD_MIN_CARBON_STOCK = 50;

/** REDD+ minimum project area threshold (ha) */
const REDD_MIN_AREA_HA = 100;

/**
 * Computes aboveground (AGB) and belowground (BGB) forest biomass using the
 * pantropical allometric equation from Chave et al. (2014).
 *
 * AGB = 0.0673 × (ρ × BA × H)^0.976  [t/ha]
 * BGB = AGB × 0.26                     (IPCC 2006 root-to-shoot ratio)
 *
 * Calcula biomassa florestal acima e abaixo do solo (Chave 2014 + IPCC 2006).
 *
 * @param basal_area_m2_ha  - Stand basal area (m²/ha); > 0
 * @param height_m          - Mean canopy height (m); > 0
 * @param woodDensity_t_m3  - Wood specific gravity (t/m³, 0–1)
 * @throws {RangeError} on invalid inputs
 */
export function computeForestBiomass(
    basal_area_m2_ha: number,
    height_m: number,
    woodDensity_t_m3: number,
): { agb_t_ha: number; bgb_t_ha: number } {
    if (typeof basal_area_m2_ha !== 'number' || basal_area_m2_ha <= 0) {
        throw new RangeError('basal_area_m2_ha must be a positive number');
    }
    if (typeof height_m !== 'number' || height_m <= 0) {
        throw new RangeError('height_m must be a positive number');
    }
    if (typeof woodDensity_t_m3 !== 'number' || woodDensity_t_m3 <= 0 || woodDensity_t_m3 > 1.5) {
        throw new RangeError('woodDensity_t_m3 must be in range (0, 1.5]');
    }

    // AGB = 0.0673 × (ρ × BA × H)^0.976 - equação alométrica pantropical Chave 2014
    const agb_t_ha = 0.0673 * Math.pow(woodDensity_t_m3 * basal_area_m2_ha * height_m, 0.976);

    // BGB estimado pela razão raiz/parte aérea IPCC 2006 Tabela 4.4
    const bgb_t_ha = agb_t_ha * ROOT_TO_SHOOT_RATIO;

    return { agb_t_ha, bgb_t_ha };
}

/**
 * Computes the carbon stock from biomass using the IPCC (2006) carbon fraction.
 *
 * CS = biomass × carbonFraction  [t C/ha]
 *
 * Calcula estoque de carbono a partir da biomassa (IPCC 2006 Eq. 4.1).
 *
 * @param biomass_t_ha    - Total biomass (t/ha); >= 0
 * @param carbonFraction  - Carbon fraction (0–1); default 0.47
 * @throws {RangeError} on invalid inputs
 */
export function computeCarbonStock(
    biomass_t_ha: number,
    carbonFraction: number = DEFAULT_CARBON_FRACTION,
): { carbonStock_tC_ha: number } {
    if (typeof biomass_t_ha !== 'number' || biomass_t_ha < 0) {
        throw new RangeError('biomass_t_ha must be a non-negative number');
    }
    if (typeof carbonFraction !== 'number' || carbonFraction <= 0 || carbonFraction >= 1) {
        throw new RangeError('carbonFraction must be in range (0, 1)');
    }

    // Estoque de C = biomassa × fração de carbono (padrão IPCC = 0.47)
    const carbonStock_tC_ha = biomass_t_ha * carbonFraction;
    return { carbonStock_tC_ha };
}

/**
 * Computes the annual carbon sequestration rate from initial and final stock.
 * Converts from t C to t CO2eq using the 44/12 molecular weight ratio.
 *
 * rate = (finalStock − initialStock) × (44/12) / years  [t CO2eq/ha/yr]
 *
 * Calcula taxa anual de sequestro de carbono e total sequestrado.
 *
 * @param initialStock  - Initial carbon stock (t C/ha); >= 0
 * @param finalStock    - Final carbon stock (t C/ha); >= 0
 * @param years         - Time period (years); > 0
 * @throws {RangeError} on invalid inputs
 */
export function computeSequestrationRate(
    initialStock: number,
    finalStock: number,
    years: number,
): { rate_tCO2_ha_yr: number; totalSequestered_tCO2: number } {
    if (typeof initialStock !== 'number' || initialStock < 0) {
        throw new RangeError('initialStock must be a non-negative number');
    }
    if (typeof finalStock !== 'number' || finalStock < 0) {
        throw new RangeError('finalStock must be a non-negative number');
    }
    if (typeof years !== 'number' || years <= 0) {
        throw new RangeError('years must be a positive number');
    }

    // Variação de estoque de carbono, convertida para CO2eq e anualizada
    const totalSequestered_tCO2 = (finalStock - initialStock) * CO2_C_RATIO;
    const rate_tCO2_ha_yr = totalSequestered_tCO2 / years;

    return { rate_tCO2_ha_yr, totalSequestered_tCO2 };
}

/**
 * Classifies REDD+ eligibility based on deforestation risk, carbon stock,
 * and project area using simplified Verra VCS criteria.
 *
 * Eligible if: deforestationRisk > 0.1 AND carbonStock > 50 tCO2/ha AND area > 100 ha.
 * Potential credits = carbonStock × area × deforestationRisk.
 *
 * Classifica elegibilidade REDD+ simplificada (Verra VCS 2023).
 *
 * @param deforestationRisk    - Annual deforestation risk (0–1)
 * @param carbonStock_tCO2_ha  - Carbon stock (t CO2eq/ha); >= 0
 * @param projectArea_ha       - Project area (ha); > 0
 * @throws {RangeError} on invalid inputs
 */
export function classifyREDDEligibility(
    deforestationRisk: number,
    carbonStock_tCO2_ha: number,
    projectArea_ha: number,
): { eligible: boolean; potentialCredits_tCO2: number; reasons: string[] } {
    if (typeof deforestationRisk !== 'number' || deforestationRisk < 0 || deforestationRisk > 1) {
        throw new RangeError('deforestationRisk must be in range [0, 1]');
    }
    if (typeof carbonStock_tCO2_ha !== 'number' || carbonStock_tCO2_ha < 0) {
        throw new RangeError('carbonStock_tCO2_ha must be a non-negative number');
    }
    if (typeof projectArea_ha !== 'number' || projectArea_ha <= 0) {
        throw new RangeError('projectArea_ha must be a positive number');
    }

    const reasons: string[] = [];
    let eligible = true;

    // Critério 1: risco de desmatamento suficiente para adicionalidade REDD+
    if (deforestationRisk <= REDD_MIN_DEFORESTATION_RISK) {
        eligible = false;
        reasons.push(`Deforestation risk ${deforestationRisk} <= threshold ${REDD_MIN_DEFORESTATION_RISK}`);
    }

    // Critério 2: estoque de carbono mínimo para créditos significativos
    if (carbonStock_tCO2_ha <= REDD_MIN_CARBON_STOCK) {
        eligible = false;
        reasons.push(`Carbon stock ${carbonStock_tCO2_ha} tCO2/ha <= threshold ${REDD_MIN_CARBON_STOCK}`);
    }

    // Critério 3: área mínima do projeto
    if (projectArea_ha <= REDD_MIN_AREA_HA) {
        eligible = false;
        reasons.push(`Project area ${projectArea_ha} ha <= threshold ${REDD_MIN_AREA_HA}`);
    }

    if (eligible) {
        reasons.push('Meets Verra VCS REDD+ additionality criteria');
    }

    // Créditos potenciais = estoque × área × risco (proxy simples de adicionalidade)
    const potentialCredits_tCO2 = eligible ? carbonStock_tCO2_ha * projectArea_ha * deforestationRisk : 0;

    return { eligible, potentialCredits_tCO2, reasons };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const carbonSequestrationMeta: AnalyticsModuleMeta = {
    name: 'carbonSequestration',
    description: 'Carbon Sequestration',
    category: 'analytics',
    familyTags: ['climate'],
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
