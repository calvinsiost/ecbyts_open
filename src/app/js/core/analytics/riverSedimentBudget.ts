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
 * River Sediment Budget - Balanco de sedimentos em bacia hidrografica
 *
 * Implements sediment budget calculations for watershed management and
 * environmental impact assessment.
 *
 * Academic references:
 * - Walling, D.E. & Collins, A.L. (2008). The catchment sediment budget as
 *   a management tool. Environmental Science & Policy, 11(2), 136–143.
 *   DOI: 10.1016/j.envsci.2007.10.004
 * - Verstraeten, G. & Poesen, J. (2001). Factors controlling sediment yield
 *   from small intensively cultivated catchments in a temperate humid climate.
 *   Geomorphology, 40(1–2), 123–144. DOI: 10.1016/S0169-555X(01)00040-X
 * - Ferro, V. & Minacapilli, M. (1995). Sediment delivery processes at basin
 *   scale. Hydrological Sciences Journal, 40(6), 703–717.
 *   DOI: 10.1080/02626669509491460
 *
 * @module core/analytics/riverSedimentBudget
 */

interface USLEParams {
    R: number;
    K: number;
    LS: number;
    C: number;
    P: number;
}

/**
 * Calculate gross erosion using USLE (Universal Soil Loss Equation).
 * Calcula a erosao bruta usando a Equacao Universal de Perda de Solo (EUPS/USLE).
 *
 * USLE: A = R * K * LS * C * P
 *
 * @param {USLEParams} params - USLE parameters / Parametros USLE
 * @returns {number} Gross erosion A (Mg·ha⁻¹·yr⁻¹) / Erosao bruta
 */
export function calculateUSLEErosion({ R, K, LS, C, P }: USLEParams): number {
    if (typeof R !== 'number' || R < 0) throw new RangeError('R must be a non-negative number');
    if (typeof K !== 'number' || K < 0) throw new RangeError('K must be a non-negative number');
    if (typeof LS !== 'number' || LS < 0) throw new RangeError('LS must be a non-negative number');
    if (typeof C !== 'number' || C < 0 || C > 1) throw new RangeError('C must be between 0 and 1');
    if (typeof P !== 'number' || P < 0 || P > 1) throw new RangeError('P must be between 0 and 1');
    return R * K * LS * C * P;
}

/**
 * Calculate Sediment Delivery Ratio (SDR) using the Ferro & Minacapilli (1995) area-based model.
 * Calcula o Indice de Entrega de Sedimentos (SDR) usando modelo baseado em area.
 *
 * SDR = exp(-beta * A^alpha) — empirical power-law relationship
 * Default coefficients: alpha = 0.2, beta = 0.219 (Ferro & Minacapilli 1995, tropical basins)
 *
 * @param {number} areakm2 - Watershed area in km² / Area da bacia em km²
 * @param {number} [alpha=0.2] - Exponent coefficient / Coeficiente exponencial
 * @param {number} [beta=0.219] - Scale coefficient / Coeficiente de escala
 * @returns {number} SDR value (0–1) / Valor SDR
 */
export function calculateSDR(areakm2: number, alpha: number = 0.2, beta: number = 0.219): number {
    if (typeof areakm2 !== 'number' || areakm2 <= 0) {
        throw new RangeError('areakm2 must be a positive number');
    }
    if (typeof alpha !== 'number' || alpha <= 0) throw new RangeError('alpha must be positive');
    if (typeof beta !== 'number' || beta <= 0) throw new RangeError('beta must be positive');
    const sdr = Math.exp(-beta * Math.pow(areakm2, alpha));
    return Math.min(1, Math.max(0, sdr));
}

interface SedimentYieldParams {
    grossErosion: number;
    sdr: number;
    areaha: number;
}

/**
 * Calculate sediment yield at the watershed outlet.
 * Calcula a producao de sedimentos no exutorio da bacia.
 *
 * Sediment Yield = SDR × Gross Erosion × Area
 *
 * @param {SedimentYieldParams} params - Parameters / Parametros
 * @returns {number} Sediment yield (Mg·yr⁻¹) / Producao de sedimentos
 */
export function calculateSedimentYield({ grossErosion, sdr, areaha }: SedimentYieldParams): number {
    if (typeof grossErosion !== 'number' || grossErosion < 0) {
        throw new RangeError('grossErosion must be non-negative');
    }
    if (typeof sdr !== 'number' || sdr < 0 || sdr > 1) {
        throw new RangeError('sdr must be between 0 and 1');
    }
    if (typeof areaha !== 'number' || areaha <= 0) {
        throw new RangeError('areaha must be a positive number');
    }
    return grossErosion * sdr * areaha;
}

interface ConnectivityIndexParams {
    upslopeAream2: number;
    upslopeSlope: number;
    upslopeW: number;
    pathLengthm: number;
    pathSlope: number;
    pathW: number;
}

/**
 * Calculate Sediment Connectivity Index (IC) after Borselli et al. (2008).
 * Calcula o Indice de Conectividade de Sedimentos (IC).
 *
 * IC = log10(D_up / D_dn)
 * D_up = sqrt(A) * S * W  (upslope component)
 * D_dn = sum(d_i / (W_i * S_i)) (downslope component)
 *
 * Simplified single-path version for a representative flowpath.
 *
 * @param {ConnectivityIndexParams} params - Parameters / Parametros
 * @returns {number} IC value (dimensionless, typically –7 to +3)
 */
export function calculateConnectivityIndex({ upslopeAream2, upslopeSlope, upslopeW, pathLengthm, pathSlope, pathW }: ConnectivityIndexParams): number {
    if (typeof upslopeAream2 !== 'number' || upslopeAream2 <= 0) {
        throw new RangeError('upslopeAream2 must be positive');
    }
    if (typeof upslopeSlope !== 'number' || upslopeSlope <= 0) {
        throw new RangeError('upslopeSlope must be positive');
    }
    if (typeof upslopeW !== 'number' || upslopeW <= 0 || upslopeW > 1) {
        throw new RangeError('upslopeW must be between 0 and 1 (exclusive of 0)');
    }
    if (typeof pathLengthm !== 'number' || pathLengthm <= 0) {
        throw new RangeError('pathLengthm must be positive');
    }
    if (typeof pathSlope !== 'number' || pathSlope <= 0) {
        throw new RangeError('pathSlope must be positive');
    }
    if (typeof pathW !== 'number' || pathW <= 0 || pathW > 1) {
        throw new RangeError('pathW must be between 0 and 1 (exclusive of 0)');
    }

    // Componente a montante: D_up = sqrt(A) * S * W
    const D_up = Math.sqrt(upslopeAream2) * upslopeSlope * upslopeW;
    // Componente a jusante: D_dn = L / (W * S)
    const D_dn = pathLengthm / (pathW * pathSlope);

    if (D_dn <= 0) throw new RangeError('D_dn computed as non-positive; check inputs');

    return Math.log10(D_up / D_dn);
}

interface FloodplainDepositionResult {
    deposition: number;
    export: number;
}

/**
 * Calculate floodplain deposition as fraction of upland sediment supply.
 * Calcula a deposicao na planicie de inundacao como fracao do aporte de sedimentos.
 *
 * Based on Walling & Collins (2008): deposition rate depends on flood frequency,
 * settling velocity, and floodplain geometry. Simplified as:
 * Deposition = trapEfficiency × sedimentInput
 *
 * @param {number} sedimentInputMgyr - Annual sediment input to floodplain (Mg·yr⁻¹) / Aporte anual de sedimentos
 * @param {number} trapEfficiency - Trap efficiency of floodplain (0–1) / Eficiencia de retencao da planicie
 * @returns {FloodplainDepositionResult} Deposition and export (Mg·yr⁻¹) / Deposicao e exportacao
 */
export function calculateFloodplainDeposition(sedimentInputMgyr: number, trapEfficiency: number): FloodplainDepositionResult {
    if (typeof sedimentInputMgyr !== 'number' || sedimentInputMgyr < 0) {
        throw new RangeError('sedimentInputMgyr must be non-negative');
    }
    if (typeof trapEfficiency !== 'number' || trapEfficiency < 0 || trapEfficiency > 1) {
        throw new RangeError('trapEfficiency must be between 0 and 1');
    }
    const deposition = sedimentInputMgyr * trapEfficiency;
    const exportVal = sedimentInputMgyr - deposition;
    return { deposition, export: exportVal };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const riverSedimentBudgetMeta = {
    name: 'riverSedimentBudget',
    description: 'riverSedimentBudget',
    category: 'analytics',
    familyTags: ['sediment', 'river'],
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
