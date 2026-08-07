// @ts-check
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
// Application: EHS & Mining - Water Scarcity Index
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Water Scarcity Index - Hydrological Stress and Footprint Analysis
 *
 * Módulo puro implementando indicadores de escassez hídrica reconhecidos
 * internacionalmente: Water Stress Index (Pfister et al. 2009), água virtual,
 * pegada hídrica (Hoekstra et al. 2011) e classificação integrada de risco.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Pfister, S., Koehler, A., & Hellweg, S. (2009). "Assessing the
 *     environmental impacts of freshwater consumption in LCA."
 *     Environmental Science & Technology, 43(11), 4098–4104.
 *     DOI: 10.1021/es807146k. (WSI formula and categories)
 *   - Hoekstra, A. Y., Chapagain, A. K., Aldaya, M. M., & Mekonnen, M. M. (2011).
 *     The Water Footprint Assessment Manual: Setting the Global Standard.
 *     Earthscan, London. ISBN: 978-1-84971-279-8. (blue/green/grey water footprint)
 *   - Allan, J. A. (1993). "Fortunately there are substitutes for water otherwise
 *     our hydro-political futures would be impossible." Priorities for Water
 *     Resources Allocation and Management, ODA, London. (virtual water concept)
 *
 * @module waterScarcityIndex
 */

'use strict';

/** WSI category thresholds per Pfister et al. (2009) Table 1. */
const WSI_THRESHOLDS = [
    { max: 0.1, category: 'low' },
    { max: 0.2, category: 'moderate' },
    { max: 0.4, category: 'significant' },
    { max: 1.0, category: 'high' },
    { max: Infinity, category: 'extreme' },
];

/**
 * Compute the Water Stress Index (WSI) for a drainage basin or region.
 * Calcula o Índice de Estresse Hídrico (WSI) para uma bacia ou região.
 *
 * WSI = withdrawal / availability
 * Categories (Pfister et al. 2009):
 *   < 0.1   → low
 *   0.1–0.2 → moderate
 *   0.2–0.4 → significant
 *   0.4–1.0 → high
 *   ≥ 1.0   → extreme
 *
 * @param {number} withdrawal_m3_yr    - Annual water withdrawal (m³/yr); must be ≥ 0
 * @param {number} availability_m3_yr  - Annual renewable water availability (m³/yr); must be > 0
 * @returns {{ wsi: number, category: 'low'|'moderate'|'significant'|'high'|'extreme' }}
 * @throws {RangeError} If withdrawal < 0 or availability ≤ 0
 */
export function computeWSI(withdrawal_m3_yr: any, availability_m3_yr: any) {
    // Validação de entradas
    if (typeof withdrawal_m3_yr !== 'number' || !isFinite(withdrawal_m3_yr)) {
        throw new TypeError('withdrawal_m3_yr must be a finite number');
    }
    if (typeof availability_m3_yr !== 'number' || !isFinite(availability_m3_yr)) {
        throw new TypeError('availability_m3_yr must be a finite number');
    }
    if (withdrawal_m3_yr < 0) {
        throw new RangeError('withdrawal_m3_yr must be ≥ 0');
    }
    if (availability_m3_yr <= 0) {
        throw new RangeError('availability_m3_yr must be positive (> 0)');
    }

    const wsi = withdrawal_m3_yr / availability_m3_yr;

    // Classificação de categoria pelo WSI calculado
    const found = WSI_THRESHOLDS.find((t) => wsi < t.max);
    const category = /** @type {'low'|'moderate'|'significant'|'high'|'extreme'} */ (
        found ? found.category : 'extreme'
    );

    return { wsi, category };
}

/**
 * Compute virtual water content for a product or commodity.
 * Calcula a água virtual contida em um produto ou commodity.
 *
 * VW = productMass_kg × waterFootprint_m3_t / 1000
 *
 * Reference: Allan (1993); Hoekstra et al. (2011) Chapter 2.
 *
 * @param {number} productMass_kg          - Mass of product (kg); must be > 0
 * @param {number} waterFootprint_m3_t     - Water footprint of product (m³/tonne); must be > 0
 * @returns {number} Virtual water volume (m³)
 * @throws {RangeError} If any parameter ≤ 0
 */
export function computeVirtualWater(productMass_kg: any, waterFootprint_m3_t: any) {
    // Validação de entradas
    if (typeof productMass_kg !== 'number' || !isFinite(productMass_kg)) {
        throw new TypeError('productMass_kg must be a finite number');
    }
    if (typeof waterFootprint_m3_t !== 'number' || !isFinite(waterFootprint_m3_t)) {
        throw new TypeError('waterFootprint_m3_t must be a finite number');
    }
    if (productMass_kg <= 0) {
        throw new RangeError('productMass_kg must be positive (> 0)');
    }
    if (waterFootprint_m3_t <= 0) {
        throw new RangeError('waterFootprint_m3_t must be positive (> 0)');
    }

    // Conversão de kg → toneladas (÷1000) para aplicar o fator m³/t
    return (productMass_kg * waterFootprint_m3_t) / 1000;
}

/**
 * Compute total water footprint and identify the dominant water type.
 * Calcula a pegada hídrica total e identifica o tipo dominante.
 *
 * Total = blueWater + greenWater + greyWater
 *
 * Reference: Hoekstra et al. (2011) Water Footprint Assessment Manual, §2.
 *   - Blue  water: surface/groundwater consumption (irrigation, industrial)
 *   - Green water: rainwater stored in soil (evapotranspiration)
 *   - Grey  water: freshwater required to dilute pollutants to ambient standards
 *
 * @param {number} blueWater  - Blue water footprint (m³/unit); must be ≥ 0
 * @param {number} greenWater - Green water footprint (m³/unit); must be ≥ 0
 * @param {number} greyWater  - Grey water footprint (m³/unit); must be ≥ 0
 * @returns {{ total: number, dominantType: 'blue'|'green'|'grey' }}
 * @throws {RangeError} If any component is negative or all are zero
 */
export function computeWaterFootprint(blueWater: any, greenWater: any, greyWater: any) {
    // Validação de entradas
    for (const [name, val] of [
        ['blueWater', blueWater],
        ['greenWater', greenWater],
        ['greyWater', greyWater],
    ]) {
        if (typeof val !== 'number' || !isFinite(val)) {
            throw new TypeError(`${name} must be a finite number`);
        }
        if (val < 0) {
            throw new RangeError(`${name} must be ≥ 0`);
        }
    }
    if (blueWater + greenWater + greyWater === 0) {
        throw new RangeError('At least one water type must be > 0');
    }

    const total = blueWater + greenWater + greyWater;

    // Tipo dominante: aquele com maior contribuição absoluta
    const values = { blue: blueWater, green: greenWater, grey: greyWater };
    const dominantType = /** @type {'blue'|'green'|'grey'} */ (
        Object.entries(values).reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    );

    return { total, dominantType };
}

/**
 * Classify overall water risk level integrating WSI, regulatory restrictions, and drought frequency.
 * Classifica o nível geral de risco hídrico integrando WSI, restrições regulatórias e frequência de seca.
 *
 * Critical conditions: WSI > 0.4 AND (regulatoryRestrictions = true OR droughtFrequency > 0.3)
 *
 * Reference: Pfister et al. (2009); Hoekstra et al. (2011) Chapter 5.
 *
 * @param {number}  wsi                    - Water Stress Index (dimensionless, ≥ 0)
 * @param {boolean} regulatoryRestrictions - Active water use restrictions from regulatory authority
 * @param {number}  droughtFrequency       - Frequency of drought events (fraction of years, 0–1)
 * @returns {{ overallRisk: 'low'|'medium'|'high'|'critical', factors: string[] }}
 * @throws {RangeError} If wsi < 0 or droughtFrequency outside [0,1]
 * @throws {TypeError}  If regulatoryRestrictions is not a boolean
 */
export function classifyWaterRiskLevel(wsi: any, regulatoryRestrictions: any, droughtFrequency: any) {
    // Validação de entradas
    if (typeof wsi !== 'number' || !isFinite(wsi) || wsi < 0) {
        throw new RangeError('wsi must be a non-negative finite number');
    }
    if (typeof regulatoryRestrictions !== 'boolean') {
        throw new TypeError('regulatoryRestrictions must be a boolean');
    }
    if (
        typeof droughtFrequency !== 'number' ||
        !isFinite(droughtFrequency) ||
        droughtFrequency < 0 ||
        droughtFrequency > 1
    ) {
        throw new RangeError('droughtFrequency must be between 0 and 1 (inclusive)');
    }

    const factors = [];

    // Registro de fatores identificados para o relatório
    if (wsi >= 1.0) factors.push('extreme_water_stress');
    else if (wsi >= 0.4) factors.push('high_water_stress');
    else if (wsi >= 0.2) factors.push('moderate_water_stress');

    if (regulatoryRestrictions) factors.push('regulatory_restrictions_active');
    if (droughtFrequency > 0.3) factors.push('high_drought_frequency');

    // Classificação integrada de risco
    /** @type {'low'|'medium'|'high'|'critical'} */
    let overallRisk;
    if (wsi > 0.4 && (regulatoryRestrictions || droughtFrequency > 0.3)) {
        overallRisk = 'critical';
    } else if (wsi >= 0.4 || (regulatoryRestrictions && droughtFrequency > 0.2)) {
        overallRisk = 'high';
    } else if (wsi >= 0.1 || regulatoryRestrictions || droughtFrequency > 0.1) {
        overallRisk = 'medium';
    } else {
        overallRisk = 'low';
    }

    return { overallRisk, factors };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterScarcityIndexMeta = {
    name: 'waterScarcityIndex',
    description: 'Water Scarcity Index',
    category: 'analytics',
    familyTags: ['water', 'water_stress'],
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
