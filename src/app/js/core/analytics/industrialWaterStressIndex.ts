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
 * Industrial Water Stress Index (WSI)
 *
 * Implements water stress and scarcity metrics for industrial water use assessment:
 * - Pfister, S., Koehler, A. & Hellweg, S. (2009). Assessing the environmental impacts
 *   of freshwater consumption in LCA. Environmental Science & Technology, 43(11), 4098–4104.
 *   DOI:10.1021/es800981u
 * - Hoekstra, A.Y. & Mekonnen, M.M. (2012). The water footprint of humanity.
 *   PNAS, 109(9), 3232–3237. DOI:10.1073/pnas.1109936109
 *
 * Zero dependencies: no DOM, IDB, Three.js, or fetch.
 *
 * @module industrialWaterStressIndex
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
 * Consumo específico de água por setor industrial [m³/unidade de produto].
 * Valores representativos da literatura (Hoekstra & Mekonnen 2012, WBCSD 2014).
 * Fator de consumo = retirada × (1 - fração de retorno).
 */
const SECTOR_CONSUMPTION_FACTORS = {
    // [m³/ton produto] - consumo específico por setor (valor típico)
    mining_metal: 4.5, // mineração de minério metálico
    mining_coal: 0.7, // mineração de carvão
    steel: 28.0, // siderurgia
    cement: 0.35, // cimento
    chemical: 35.0, // indústria química em geral
    paper_pulp: 10.0, // celulose e papel
    textile: 100.0, // têxtil (alta variabilidade)
    food_processing: 5.0, // processamento de alimentos
    petroleum_refining: 1.5, // refino de petróleo
    electronics: 15.0, // semicondutores / eletrônicos
};

/**
 * Computes the Water Stress Index (WSI) following Pfister et al. (2009).
 * Índice de estresse hídrico WSI como razão de retirada vs disponibilidade local.
 *
 * WSI = WTA / (1 - WTA)  when 0 < WTA < 1
 * where WTA = annual water withdrawal / annual water availability (renewable)
 *
 * @param withdrawal   - Annual water withdrawal [m³/yr]
 * @param availability - Annual renewable freshwater availability [m³/yr]
 * @returns WSI and withdrawal-to-availability ratio
 */
export function computeWaterStressIndex(withdrawal: number, availability: number): { wsi: number; wta: number } {
    if (typeof withdrawal !== 'number' || typeof availability !== 'number') {
        throw new TypeError('withdrawal and availability must be numbers');
    }
    if (withdrawal < 0) throw new RangeError('withdrawal must be >= 0');
    if (availability <= 0) throw new RangeError('availability must be > 0');

    // Razão retirada/disponibilidade (WTA - Water-To-Availability)
    const wta = withdrawal / availability;

    // Transformação logística de Pfister et al. (2009): WSI ∈ [0.01, 1]
    // WSI = 1 / (1 + exp(-6.4 * (wta - 0.4)))  - curva sigmóide calibrada
    const wsi = 1 / (1 + Math.exp(-6.4 * (wta - 0.4)));

    return { wsi, wta };
}

/**
 * Computes sector-specific water consumption for a given production volume.
 * Consumo específico de água por setor industrial com base em benchmarks da literatura.
 *
 * @param sector         - Industrial sector key (see SECTOR_CONSUMPTION_FACTORS)
 * @param productionTons - Annual production [metric tons]
 * @param customFactor - Optional override consumption factor [m³/ton]
 * @returns Water consumption result
 */
export function sectorWaterConsumption(
    sector: string,
    productionTons: number,
    customFactor: number | null = null,
): { consumptionM3: number; factor: number; sector: string } {
    if (typeof sector !== 'string') throw new TypeError('sector must be a string');
    if (typeof productionTons !== 'number') throw new TypeError('productionTons must be a number');
    if (productionTons < 0) throw new RangeError('productionTons must be >= 0');

    let factor;
    if (customFactor !== null && customFactor !== undefined) {
        if (typeof customFactor !== 'number' || customFactor < 0) {
            throw new RangeError('customFactor must be a non-negative number');
        }
        factor = customFactor;
    } else {
        factor = (SECTOR_CONSUMPTION_FACTORS as Record<string, number>)[sector];
        if (factor === undefined) {
            throw new RangeError(
                `Unknown sector '${sector}'. Valid: ${Object.keys(SECTOR_CONSUMPTION_FACTORS).join(', ')}`,
            );
        }
    }

    const consumptionM3 = factor * productionTons;
    return { consumptionM3, factor, sector };
}

/**
 * Classifies the water scarcity level based on WTA ratio.
 * Classifica o nível de escassez hídrica conforme razão de retirada/disponibilidade.
 *
 * Classes derived from Pfister et al. (2009) and Hoekstra et al. (2012):
 * - low:      WTA < 0.1
 * - moderate: 0.1 <= WTA < 0.4
 * - severe:   0.4 <= WTA < 0.8
 * - extreme:  WTA >= 0.8
 *
 * @param wta - Withdrawal-to-availability ratio [-]
 * @returns Scarcity classification
 */
export function classifyWaterScarcity(wta: number): { level: string; wta: number; description: string } {
    if (typeof wta !== 'number') throw new TypeError('wta must be a number');
    if (wta < 0) throw new RangeError('wta must be >= 0');

    if (wta < 0.1) {
        return { level: 'low', wta, description: 'Low water stress — sufficient water availability' };
    }
    if (wta < 0.4) {
        return { level: 'moderate', wta, description: 'Moderate water stress — demand approaches supply' };
    }
    if (wta < 0.8) {
        return { level: 'severe', wta, description: 'Severe water stress — significant scarcity risk' };
    }
    return { level: 'extreme', wta, description: 'Extreme water stress — critical scarcity conditions' };
}

/**
 * Computes the water footprint impact characterization factor (CF) for LCA.
 * Fator de caracterização do impacto da pegada hídrica para Avaliação do Ciclo de Vida.
 *
 * CF = WSI * consumption [m³_eq / m³_consumed]
 * Weighted characterization following Pfister et al. (2009) Eq. 2.
 *
 * @param consumptionM3   - Water consumption volume [m³]
 * @param wsi             - Water Stress Index [0–1]
 * @param returnFraction - Fraction returned to same watershed [0–1]
 * @returns CF and impact result
 */
export function waterFootprintCharacterization(
    consumptionM3: number,
    wsi: number,
    returnFraction = 0,
): { characterizationFactor: number; impactM3Eq: number } {
    if (typeof consumptionM3 !== 'number' || typeof wsi !== 'number') {
        throw new TypeError('consumptionM3 and wsi must be numbers');
    }
    if (consumptionM3 < 0) throw new RangeError('consumptionM3 must be >= 0');
    if (wsi < 0 || wsi > 1) throw new RangeError('wsi must be between 0 and 1');
    if (returnFraction < 0 || returnFraction > 1) throw new RangeError('returnFraction must be between 0 and 1');

    // Consumo líquido após retorno ao mesmo corpo hídrico
    const netConsumption = consumptionM3 * (1 - returnFraction);

    // Fator de caracterização: volume equivalente em condições de estresse médio
    const characterizationFactor = wsi;
    const impactM3Eq = characterizationFactor * netConsumption;

    return { characterizationFactor, impactM3Eq };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const industrialWaterStressIndexMeta: AnalyticsModuleMeta = {
    name: 'industrialWaterStressIndex',
    description: 'industrialWaterStressIndex',
    category: 'analytics',
    familyTags: ['water', 'industrial'],
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
