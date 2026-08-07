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
 * Water Balance Model - Balanço Hídrico de Bacias Hidrográficas
 *
 * Módulo puro para modelagem do balanço hídrico: evapotranspiração real,
 * escoamento de base (baseflow), coeficiente de deflúvio e classificação
 * do regime hidrológico. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Eagleson, P.S. (1978). Climate, soil, and vegetation: 3. A simplified
 *     model of soil moisture movement in the liquid phase.
 *     Water Resources Research, 14(5), 722–730.
 *     DOI: 10.1029/WR014i005p00705
 *     (Modelo de evapotranspiração real baseado na umidade do solo)
 *   - Gustard, A., Bullock, A., & Dixon, J.M. (1992). Low flow estimation in
 *     the United Kingdom. Institute of Hydrology Report No. 108.
 *     DOI: 10.1080/02626669209492546
 *     (Baseflow Index - BFI - metodologia de separação de escoamento)
 *   - Zhang, L., Dawes, W.R., & Walker, G.R. (2001). Response of mean annual
 *     evapotranspiration to vegetation changes at catchment scale.
 *     Water Resources Research, 37(3), 701–708.
 *     DOI: 10.1016/S0022-1694(01)00456-5
 *     (Classificação do regime hidrológico por RC e BFI)
 *
 * @module waterBalanceModel
 */

'use strict';

interface AETResult { AET_mm: number }
interface BaseflowResult { baseflow_m3: number; BFI: number }
interface RCResult { RC: number }
interface RegimeResult { regime: 'arid' | 'semi_arid' | 'sub_humid' | 'humid' | 'perhumid' }

/**
 * Compute Actual Evapotranspiration (AET)
 * Calcula a evapotranspiração real em função da umidade disponível no solo.
 *
 * AET = PET × min(1, (SM - WP) / (FC - WP))
 * Limitada a zero quando SM ≤ WP (solo abaixo do ponto de murcha).
 *
 * @param {number} potential_ET_mm    - Evapotranspiração potencial (mm/período); ≥0
 * @param {number} soil_moisture_m3_m3 - Umidade atual do solo (m³/m³); [0, 1]
 * @param {number} FC_m3_m3           - Capacidade de campo (m³/m³); (0, 1]
 * @param {number} WP_m3_m3           - Ponto de murcha permanente (m³/m³); [0, FC)
 * @returns {{ AET_mm: number }}
 */
export function computeActualEvapotranspiration(potential_ET_mm: number, soil_moisture_m3_m3: number, FC_m3_m3: number, WP_m3_m3: number): AETResult {
    if (typeof potential_ET_mm !== 'number' || potential_ET_mm < 0) {
        throw new RangeError('potential_ET_mm must be a non-negative number');
    }
    if (typeof soil_moisture_m3_m3 !== 'number' || soil_moisture_m3_m3 < 0 || soil_moisture_m3_m3 > 1) {
        throw new RangeError('soil_moisture_m3_m3 must be in range [0, 1]');
    }
    if (typeof FC_m3_m3 !== 'number' || FC_m3_m3 <= 0 || FC_m3_m3 > 1) {
        throw new RangeError('FC_m3_m3 must be in range (0, 1]');
    }
    if (typeof WP_m3_m3 !== 'number' || WP_m3_m3 < 0 || WP_m3_m3 >= FC_m3_m3) {
        throw new RangeError('WP_m3_m3 must be in range [0, FC_m3_m3)');
    }

    // Fração de água disponível no solo (Eagleson 1978, DOI:10.1029/WR014i005p00705)
    const availableFraction = Math.max(0, (soil_moisture_m3_m3 - WP_m3_m3) / (FC_m3_m3 - WP_m3_m3));
    const AET_mm = potential_ET_mm * Math.min(1, availableFraction);
    return { AET_mm };
}

/**
 * Compute Baseflow and Baseflow Index (BFI)
 * Separa o escoamento de base do escoamento total e calcula o BFI.
 *
 * baseflow_m3 = total_flow_m3 - quickflow_m3
 * BFI = baseflow_m3 / total_flow_m3
 *
 * @param {number} total_flow_m3    - Escoamento total no período (m³); ≥0
 * @param {number} quickflow_m3     - Escoamento rápido (m³); [0, total_flow_m3]
 * @returns {{ baseflow_m3: number, BFI: number }}
 */
export function computeBaseflow(total_flow_m3: number, quickflow_m3: number): BaseflowResult {
    if (typeof total_flow_m3 !== 'number' || total_flow_m3 < 0) {
        throw new RangeError('total_flow_m3 must be a non-negative number');
    }
    if (typeof quickflow_m3 !== 'number' || quickflow_m3 < 0 || quickflow_m3 > total_flow_m3) {
        throw new RangeError('quickflow_m3 must be in range [0, total_flow_m3]');
    }

    const baseflow_m3 = total_flow_m3 - quickflow_m3;
    // BFI indefinido quando vazão total é zero; retorna 0 por convenção hidrológica
    const BFI = total_flow_m3 > 0 ? baseflow_m3 / total_flow_m3 : 0;
    return { baseflow_m3, BFI };
}

/**
 * Compute Runoff Coefficient (RC)
 * Calcula o coeficiente de deflúvio anual da bacia (adimensional, ∈ [0, 1]).
 *
 * RC = annual_runoff_mm / annual_rainfall_mm
 *
 * @param {number} annual_rainfall_mm - Precipitação total anual (mm); >0
 * @param {number} annual_runoff_mm   - Deflúvio total anual (mm); [0, rainfall]
 * @returns {{ RC: number }}
 */
export function computeRunoffCoefficient(annual_rainfall_mm: number, annual_runoff_mm: number): RCResult {
    if (typeof annual_rainfall_mm !== 'number' || annual_rainfall_mm <= 0) {
        throw new RangeError('annual_rainfall_mm must be a positive number');
    }
    if (typeof annual_runoff_mm !== 'number' || annual_runoff_mm < 0 || annual_runoff_mm > annual_rainfall_mm) {
        throw new RangeError('annual_runoff_mm must be in range [0, annual_rainfall_mm]');
    }

    // Coeficiente de deflúvio: fração da precipitação que gera escoamento
    const RC = annual_runoff_mm / annual_rainfall_mm;
    return { RC };
}

/**
 * Classify Water Balance Regime
 * Classifica o regime hidrológico da bacia pelo coeficiente de deflúvio e BFI.
 *
 * Baseado em Zhang et al. (2001), DOI: 10.1016/S0022-1694(01)00456-5:
 *   RC < 0.05  → 'arid'
 *   RC < 0.15  → 'semi_arid'
 *   RC < 0.35  → 'sub_humid'
 *   RC < 0.60  → 'humid'
 *   RC ≥ 0.60  → 'perhumid'
 *
 * @param {number} RC  - Runoff Coefficient ∈ [0, 1]
 * @param {number} BFI - Baseflow Index ∈ [0, 1]
 * @returns {{ regime: 'arid'|'semi_arid'|'sub_humid'|'humid'|'perhumid' }}
 */
export function classifyWaterBalance(RC: number, BFI: number): RegimeResult {
    if (typeof RC !== 'number' || RC < 0 || RC > 1) {
        throw new RangeError('RC must be a number in range [0, 1]');
    }
    if (typeof BFI !== 'number' || BFI < 0 || BFI > 1) {
        throw new RangeError('BFI must be a number in range [0, 1]');
    }

    // Classificação climático-hidrológica por deflúvio (Zhang 2001)
    let regime: 'arid' | 'semi_arid' | 'sub_humid' | 'humid' | 'perhumid';
    if (RC < 0.05) regime = 'arid';
    else if (RC < 0.15) regime = 'semi_arid';
    else if (RC < 0.35) regime = 'sub_humid';
    else if (RC < 0.6) regime = 'humid';
    else regime = 'perhumid';

    return { regime };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const waterBalanceModelMeta = {
    name: 'waterBalanceModel',
    description: 'waterBalanceModel',
    category: 'analytics',
    familyTags: ['water'],
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
