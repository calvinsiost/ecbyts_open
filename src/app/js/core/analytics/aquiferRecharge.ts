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
// Application: EHS & Mining - Aquifer Recharge Estimation
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Aquifer Recharge Estimation (AquiferRecharge)
 *
 * Módulo puro implementando métodos de estimativa de recarga de aquíferos:
 * flutuação do nível d'água (WTF), balanço de cloreto (Eriksson 1969),
 * separação de escoamento de base Lyne-Hollick (1979) e classificação de
 * zonas de recarga. Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - Eriksson, E. & Khunakasem, V. (1969). "Chloride concentration in
 *     groundwater, recharge rate and rate of deposition of chloride in the
 *     Israel Coastal Plain." Journal of Hydrology 7(2), 178–197.
 *     DOI: 10.1016/0022-1694(69)90055-9
 *     (chloride mass balance method for recharge estimation)
 *   - Lyne, V. D. & Hollick, M. (1979). "Stochastic time-variable rainfall-
 *     runoff modelling." In: Proc. Hydrology and Water Resources Symposium,
 *     Perth, Australia, pp. 89–93. (recursive digital filter BFI)
 *   - Healy, R. W. & Cook, P. G. (2002). "Using groundwater levels to
 *     estimate recharge." Hydrogeology Journal 10(1), 91–109.
 *     DOI: 10.1007/s10040-001-0178-0 (water-table fluctuation method)
 *
 * @module aquiferRecharge
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
 * Estimates aquifer recharge from water table fluctuation (WTF method).
 * Estima a recarga do aquífero pelo método de flutuação do nível d'água.
 *
 * R = Sy × ΔH × 1000  (mm)
 * Annual recharge per hectare: R × 10 (m³/ha)
 *
 * Reference: Healy & Cook (2002) Hydrogeol. J.
 *
 * @param recharge_mm - Observed recharge depth (mm). Recarga observada (mm). [unused - derived]
 * @param specificYield - Specific yield (dimensionless, 0–1). Porosidade específica.
 * @param deltaH_m - Water table rise (m). Elevação do nível d'água (m).
 * @returns
 * @throws {RangeError} If specificYield or deltaH_m are out of range.
 */
export function computeWaterTableFluctuation(
    recharge_mm: number,
    specificYield: number,
    deltaH_m: number,
): { recharge_mm: number; annualRecharge_m3_ha: number } {
    if (specificYield <= 0 || specificYield > 1) throw new RangeError('specificYield must be in (0, 1]');
    if (deltaH_m < 0) throw new RangeError('deltaH_m must be >= 0');

    // Recarga = porosidade específica × elevação do NA × conversão para mm
    const derived_recharge_mm = specificYield * deltaH_m * 1000;
    // Recarga anual por hectare (1 mm = 10 m³/ha)
    const annualRecharge_m3_ha = derived_recharge_mm * 10;

    return { recharge_mm: derived_recharge_mm, annualRecharge_m3_ha };
}

/**
 * Estimates groundwater recharge via chloride mass balance.
 * Estima a recarga por balanço de cloreto (Eriksson & Khunakasem 1969).
 *
 *   R = (Cl_rain / Cl_gw) × P
 *
 * @param precipitationCl_mg_L - Chloride in precipitation (mg/L). Cloreto na chuva (mg/L).
 * @param groundwaterCl_mg_L - Chloride in groundwater (mg/L). Cloreto no aquífero (mg/L).
 * @param precipitation_mm - Annual precipitation (mm). Precipitação anual (mm).
 * @returns
 * @throws {RangeError} If any value is non-positive.
 */
export function computeChlorideBalance(
    precipitationCl_mg_L: number,
    groundwaterCl_mg_L: number,
    precipitation_mm: number,
): { recharge_mm_yr: number; rechargeRatio: number } {
    if (precipitationCl_mg_L <= 0) throw new RangeError('precipitationCl_mg_L must be > 0');
    if (groundwaterCl_mg_L <= 0) throw new RangeError('groundwaterCl_mg_L must be > 0');
    if (precipitation_mm <= 0) throw new RangeError('precipitation_mm must be > 0');

    // Razão de cloreto indica fração da chuva que recarga o aquífero
    const recharge_mm_yr = (precipitationCl_mg_L / groundwaterCl_mg_L) * precipitation_mm;
    const rechargeRatio = recharge_mm_yr / precipitation_mm;

    return { recharge_mm_yr, rechargeRatio };
}

/**
 * Separates baseflow from total streamflow using the Lyne-Hollick digital filter.
 * Separa o escoamento de base pelo filtro digital de Lyne-Hollick (1979).
 *
 *   qb[i] = α × qb[i-1] + ((1 − α) / 2) × (q[i] + q[i-1])
 *   α = 0.925 (filter parameter, Lyne & Hollick 1979)
 *   BFI = Σ qb / Σ q
 *
 * @param streamflowData - Array of streamflow records (m³/s).
 *   Array de registros de vazão (m³/s). Minimum 2 records required.
 * @returns
 * @throws {TypeError} If streamflowData is not an array.
 * @throws {RangeError} If fewer than 2 records are provided.
 */
export function computeBaseflowSeparation(streamflowData: { q: number }[]): { baseflow: number[]; bfi: number } {
    if (!Array.isArray(streamflowData)) throw new TypeError('streamflowData must be an array');
    if (streamflowData.length < 2) throw new RangeError('streamflowData must have at least 2 records');

    const ALPHA = 0.925; // parâmetro de filtro Lyne-Hollick
    const n = streamflowData.length;
    const baseflow = new Array(n).fill(0);

    // Inicializar com o primeiro valor de escoamento total
    baseflow[0] = streamflowData[0]!.q;

    let sumBaseflow = baseflow[0];
    let sumTotal = streamflowData[0]!.q;

    for (let i = 1; i < n; i++) {
        const q_prev = streamflowData[i - 1]!.q;
        const q_curr = streamflowData[i]!.q;
        // Filtro recursivo: componente de base não pode exceder o escoamento total
        const qb = ALPHA * baseflow[i - 1] + ((1 - ALPHA) / 2) * (q_curr + q_prev);
        baseflow[i] = Math.min(Math.max(0, qb), q_curr);
        sumBaseflow += baseflow[i];
        sumTotal += q_curr;
    }

    // BFI = Índice de Escoamento de Base (0 a 1)
    const bfi = sumTotal > 0 ? sumBaseflow / sumTotal : 0;

    return { baseflow, bfi };
}

/**
 * Classifies an aquifer recharge zone and its vulnerability.
 * Classifica a zona de recarga do aquífero e sua vulnerabilidade.
 *
 * @param soilType - Soil permeability: 'sandy'|'loamy'|'clayey'. Tipo de solo.
 * @param slope_pct - Terrain slope (%). Declividade do terreno (%).
 * @param landUse - 'natural'|'agricultural'|'urban'. Uso do solo.
 * @param rainfallIntensity_mm_h - Rainfall intensity (mm/h). Intensidade da chuva.
 * @returns
 * @throws {TypeError} If soilType or landUse are not recognized strings.
 * @throws {RangeError} If slope_pct < 0 or rainfallIntensity_mm_h <= 0.
 */
function validateRechargeInputs(
    soilType: string,
    slope_pct: number,
    landUse: string,
    rainfallIntensity_mm_h: number,
): void {
    const validSoils = ['sandy', 'loamy', 'clayey'];
    const validLandUse = ['natural', 'agricultural', 'urban'];
    if (!validSoils.includes(soilType)) throw new TypeError(`soilType must be one of ${validSoils.join(', ')}`);
    if (!validLandUse.includes(landUse)) throw new TypeError(`landUse must be one of ${validLandUse.join(', ')}`);
    if (slope_pct < 0) throw new RangeError('slope_pct must be >= 0');
    if (rainfallIntensity_mm_h <= 0) throw new RangeError('rainfallIntensity_mm_h must be > 0');
}

function computeRechargeScore(
    soilType: string,
    slope_pct: number,
    landUse: string,
    rainfallIntensity_mm_h: number,
): number {
    let rechargeScore = 0;
    if (soilType === 'sandy') rechargeScore += 3;
    else if (soilType === 'loamy') rechargeScore += 2;
    // clayey: sem pontuação
    if (slope_pct < 5) rechargeScore += 2;
    else if (slope_pct < 15) rechargeScore += 1;
    if (landUse === 'natural') rechargeScore += 2;
    else if (landUse === 'agricultural') rechargeScore += 1;
    if (rainfallIntensity_mm_h <= 10) rechargeScore += 1; // chuva suave favorece infiltração
    return rechargeScore;
}

function scoreToRechargeClass(rechargeScore: number): string {
    if (rechargeScore >= 7) return 'very_high';
    if (rechargeScore >= 5) return 'high';
    if (rechargeScore >= 3) return 'moderate';
    return 'low';
}

function determineVulnerability(soilType: string, rechargeClass: string, rechargeScore: number): string {
    if (soilType === 'sandy' && rechargeClass !== 'low') return 'high';
    if (soilType === 'loamy' && rechargeScore >= 4) return 'medium';
    return 'low';
}

export function classifyAquiferRechargeZone(
    soilType: string,
    slope_pct: number,
    landUse: string,
    rainfallIntensity_mm_h: number,
): { rechargeClass: string; vulnerability: string } {
    validateRechargeInputs(soilType, slope_pct, landUse, rainfallIntensity_mm_h);
    const rechargeScore = computeRechargeScore(soilType, slope_pct, landUse, rainfallIntensity_mm_h);
    const rechargeClass = scoreToRechargeClass(rechargeScore);
    const vulnerability = determineVulnerability(soilType, rechargeClass, rechargeScore);
    return { rechargeClass, vulnerability };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const aquiferRechargeMeta: AnalyticsModuleMeta = {
    name: 'aquiferRecharge',
    description: 'Aquifer Recharge Estimation',
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
