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
 * Industrial Water Footprint Calculator
 *
 * Implements Water Footprint Network methodology for industrial processes.
 *
 * References:
 * - Hoekstra, A.Y., Chapagain, A.K., Aldaya, M.M. & Mekonnen, M.M. (2011).
 *   The Water Footprint Assessment Manual. London: Earthscan.
 *   ISBN: 9781849712798
 * - ISO 14046:2014 Environmental management - Water footprint - Principles,
 *   requirements and guidelines. Geneva: ISO.
 * - Mekonnen, M.M. & Hoekstra, A.Y. (2011). The green, blue and grey water
 *   footprint of crops and derived crop products. Hydrology and Earth System
 *   Sciences, 15, 1577–1600. https://doi.org/10.5194/hess-15-1577-2011
 *
 * Zero dependencies on DOM, IndexedDB, Three.js, or fetch.
 * Volume units: m³; mass units: kg (for per-product calculations).
 *
 * @module industrialWaterFootprintCalculator
 */

// Local interface (substitui import('../../../../types/app/analytics-library.js'))
interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: 'analytics';
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
        citation?: string;
    };
    inputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: 'object'; properties: Record<string, unknown>; required: string[] };
    library?: { published: boolean; priceECBT?: number; licenseRef?: string };
}

// ---- Blue Water Footprint (surface + groundwater consumption) ----

/**
 * Calculates Blue Water Footprint (WFblue).
 * Água azul: volume de água superficial ou subterrânea consumida (evaporada/incorporada/transferida).
 *
 * @param withdrawal_m3   - Total water withdrawal (m³)
 * @param returned_m3     - Volume returned to source (m³, same quality class)
 * @param evaporation_m3  - Evaporative losses (m³)
 * @returns WFblue in m³
 */
export function calculateBlueWaterFootprint(
    withdrawal_m3: number,
    returned_m3: number,
    evaporation_m3: number,
): number {
    if (typeof withdrawal_m3 !== 'number' || typeof returned_m3 !== 'number' || typeof evaporation_m3 !== 'number') {
        throw new TypeError('All arguments must be numbers');
    }
    if (withdrawal_m3 < 0) throw new RangeError('withdrawal_m3 must be >= 0');
    if (returned_m3 < 0) throw new RangeError('returned_m3 must be >= 0');
    if (evaporation_m3 < 0) throw new RangeError('evaporation_m3 must be >= 0');
    if (returned_m3 + evaporation_m3 > withdrawal_m3 + 1e-9) {
        throw new RangeError('returned + evaporation cannot exceed withdrawal');
    }

    // Consumo = retirada - retorno (água cinza não é retirada bruta; já contabilizada separado)
    return withdrawal_m3 - returned_m3;
}

// ---- Green Water Footprint (evapotranspired precipitation) ----

/**
 * Calculates Green Water Footprint (WFgreen).
 * Água verde: precipitação evapotranspirada no processo/produto (relevante para bioprocessos e agricultura).
 *
 * @param et_actual_m3    - Actual evapotranspiration from rainfall (m³)
 * @param interception_m3 - Rainfall intercepted before reaching soil (m³)
 * @returns WFgreen in m³
 */
export function calculateGreenWaterFootprint(et_actual_m3: number, interception_m3 = 0): number {
    if (typeof et_actual_m3 !== 'number' || typeof interception_m3 !== 'number') {
        throw new TypeError('Arguments must be numbers');
    }
    if (et_actual_m3 < 0) throw new RangeError('et_actual_m3 must be >= 0');
    if (interception_m3 < 0) throw new RangeError('interception_m3 must be >= 0');

    return et_actual_m3 + interception_m3;
}

// ---- Grey Water Footprint (pollution dilution volume) ----

/**
 * Calculates Grey Water Footprint (WFgrey).
 * Água cinza: volume de água doce necessário para diluir efluentes até concentrações aceitáveis.
 * Calculado para o poluente com maior impacto relativo (fator limitante).
 *
 * @param effluent_m3           - Effluent volume discharged (m³)
 * @param concentration_kg_m3   - Contaminant concentration in effluent (kg/m³)
 * @param naturalConc_kg_m3     - Natural/background concentration in receiving water (kg/m³)
 * @param standardConc_kg_m3    - Maximum acceptable concentration (standard, kg/m³)
 * @returns WFgrey in m³
 */
export function calculateGreyWaterFootprint(
    effluent_m3: number,
    concentration_kg_m3: number,
    naturalConc_kg_m3: number,
    standardConc_kg_m3: number,
): number {
    if (
        typeof effluent_m3 !== 'number' ||
        typeof concentration_kg_m3 !== 'number' ||
        typeof naturalConc_kg_m3 !== 'number' ||
        typeof standardConc_kg_m3 !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (effluent_m3 < 0) throw new RangeError('effluent_m3 must be >= 0');
    if (concentration_kg_m3 < 0) throw new RangeError('concentration_kg_m3 must be >= 0');
    if (naturalConc_kg_m3 < 0) throw new RangeError('naturalConc_kg_m3 must be >= 0');
    if (standardConc_kg_m3 <= 0) throw new RangeError('standardConc_kg_m3 must be > 0');
    if (naturalConc_kg_m3 >= standardConc_kg_m3) {
        throw new RangeError('naturalConc_kg_m3 must be < standardConc_kg_m3');
    }

    // WFgrey = (L × effluent_volume) / (Cmax - Cnat)
    // onde L = load (kg), diluição necessária para atingir padrão
    const load_kg = effluent_m3 * concentration_kg_m3;
    const dilutionVolume = load_kg / (standardConc_kg_m3 - naturalConc_kg_m3);
    return dilutionVolume;
}

// ---- Total Water Footprint & per-product intensity ----

/**
 * Calculates Total Water Footprint and per-product water intensity.
 * Pegada hídrica total do processo e intensidade hídrica por unidade de produto.
 *
 * @param wfBlue_m3       - Blue water footprint (m³)
 * @param wfGreen_m3      - Green water footprint (m³)
 * @param wfGrey_m3       - Grey water footprint (m³)
 * @param productionVolume - Volume of product produced (units or kg)
 */
export function calculateTotalWaterFootprint(
    wfBlue_m3: number,
    wfGreen_m3: number,
    wfGrey_m3: number,
    productionVolume: number,
): { total_m3: number; intensity_m3perUnit: number; shares: object } {
    if (
        typeof wfBlue_m3 !== 'number' ||
        typeof wfGreen_m3 !== 'number' ||
        typeof wfGrey_m3 !== 'number' ||
        typeof productionVolume !== 'number'
    ) {
        throw new TypeError('All arguments must be numbers');
    }
    if (wfBlue_m3 < 0 || wfGreen_m3 < 0 || wfGrey_m3 < 0) {
        throw new RangeError('Water footprint components must be >= 0');
    }
    if (productionVolume <= 0) throw new RangeError('productionVolume must be > 0');

    const total_m3 = wfBlue_m3 + wfGreen_m3 + wfGrey_m3;
    const intensity_m3perUnit = total_m3 / productionVolume;

    const safe = total_m3 > 0 ? total_m3 : 1;
    const shares = {
        blue: wfBlue_m3 / safe,
        green: wfGreen_m3 / safe,
        grey: wfGrey_m3 / safe,
    };

    return { total_m3, intensity_m3perUnit, shares };
}

// ---- Water Sustainability Index (WSI) ----

/**
 * Calculates Water Sustainability Index (WSI) for the process location.
 * Índice de sustentabilidade hídrica: razão entre pegada total e disponibilidade local de água.
 * Classificação baseada em Hoekstra et al. (2011), Tabela 2.
 *
 * @param totalWF_m3         - Total water footprint of process (m³/year)
 * @param localAvailability_m3 - Local renewable freshwater availability (m³/year)
 */
export function calculateWSI(
    totalWF_m3: number,
    localAvailability_m3: number,
): { wsi: number; sustainability: string } {
    if (typeof totalWF_m3 !== 'number' || typeof localAvailability_m3 !== 'number') {
        throw new TypeError('Arguments must be numbers');
    }
    if (totalWF_m3 < 0) throw new RangeError('totalWF_m3 must be >= 0');
    if (localAvailability_m3 <= 0) throw new RangeError('localAvailability_m3 must be > 0');

    const wsi = totalWF_m3 / localAvailability_m3;

    let sustainability;
    if (wsi < 0.1) sustainability = 'sustainable';
    else if (wsi < 0.2) sustainability = 'moderate_pressure';
    else if (wsi < 0.4) sustainability = 'significant_pressure';
    else sustainability = 'critical';

    return { wsi, sustainability };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialWaterFootprintCalculatorMeta: AnalyticsModuleMeta = {
    name: 'industrialWaterFootprintCalculator',
    description: 'industrialWaterFootprintCalculator',
    category: 'analytics',
    familyTags: ['water', 'industrial', 'footprint'],
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
