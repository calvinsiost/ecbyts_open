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
// Application: EHS & Mining - Estuarine Hydrodynamics
// Authorship: Calvin Stefan Iost

'use strict';

/**
 * Estuarine Hydrodynamics - Salinity Mixing & Stratification
 *
 * Módulo puro implementando modelos de mistura de salinidade em estuários,
 * classificação de tipo estuarino e excursão de maré.
 * Baseado em Fischer et al. (1979), Hansen & Rattray (1966) e Dyer (1997).
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * @module estuarineHydrodynamics
 * @references
 *   Fischer, H.B. et al. (1979) Mixing in Inland and Coastal Waters. Academic Press.
 *   Hansen, D.V. & Rattray, M. (1966) New dimensions in estuary classification. Limnol. Oceanogr. 11(3):319-326.
 *   Dyer, K.R. (1997) Estuaries: A Physical Introduction. 2nd ed. Wiley.
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

const G = 9.81; // gravitational acceleration (m/s²)
const RHO_REF = 1025; // reference seawater density (kg/m³)
const TIDAL_PERIOD_H = 12.4; // mean tidal period (hours) — semidiurnal M2

/**
 * Compute salinity mixing in an estuary using volume-conservation model.
 * Calcula a salinidade de mistura por conservação de volume (modelo de caixa simples).
 *
 * Model: S_mix = S_ocean × Vt / (Vt + Qf × T)
 * where Vt = tidal prism, Qf = freshwater flow, T = tidal period.
 *
 * @param {number} freshwaterFlow_m3_s - Freshwater river discharge (m³/s), ≥ 0
 * @param {number} tidalPrism_m3 - Tidal prism volume (m³), > 0
 * @param {number} oceanSalinity_ppt - Ocean salinity (ppt), 0–40
 * @returns {{ salinity_ppt: number, mixingRatio: number }}
 * @throws {RangeError} se inputs fora dos limites físicos
 */
export function computeSalinityMixing(
    freshwaterFlow_m3_s: number,
    tidalPrism_m3: number,
    oceanSalinity_ppt: number,
): { salinity_ppt: number; mixingRatio: number } {
    if (freshwaterFlow_m3_s < 0) throw new RangeError('freshwaterFlow_m3_s must be >= 0');
    if (tidalPrism_m3 <= 0) throw new RangeError('tidalPrism_m3 must be > 0');
    if (oceanSalinity_ppt < 0 || oceanSalinity_ppt > 40) {
        throw new RangeError('oceanSalinity_ppt must be in [0, 40]');
    }

    // Volume total de mistura durante um ciclo de maré
    // Total mixing volume over one tidal cycle
    const mixingVolume = tidalPrism_m3 + freshwaterFlow_m3_s * TIDAL_PERIOD_H * 3600;
    const mixingRatio = tidalPrism_m3 / mixingVolume;
    const salinity_ppt = oceanSalinity_ppt * mixingRatio;

    return { salinity_ppt, mixingRatio };
}

/**
 * Compute stratification number (Richardson number) for an estuary.
 * Calcula o número de estratificação de Fischer (1972) baseado no número de Richardson.
 *
 * Ri = g × Δρ × h / (ρ × u²)
 * Δρ estimado como 1 kg/m³ por ppt de diferença de salinidade.
 * Fischer et al. (1979): Ri < 0.25 = well-mixed, < 1 = partially mixed, ≥ 1 = stratified.
 *
 * @param {number} freshwaterFlow_m3_s - Freshwater discharge (m³/s), > 0
 * @param {number} tidalVelocity_m_s - RMS tidal velocity (m/s), > 0
 * @param {number} depth_m - Mean estuary depth (m), > 0
 * @param {number} width_m - Mean estuary width (m), > 0
 * @returns {{ richardsonNumber: number, stratification: 'well_mixed'|'partially_mixed'|'stratified' }}
 * @throws {RangeError} se inputs inválidos
 * @references Fischer et al. (1979) cap. 7; Fischer (1972) J. Hydraul. Div.
 */
export function computeStratificationNumber(
    freshwaterFlow_m3_s: number,
    tidalVelocity_m_s: number,
    depth_m: number,
    width_m: number,
): { richardsonNumber: number; stratification: 'well_mixed' | 'partially_mixed' | 'stratified' } {
    if (freshwaterFlow_m3_s <= 0) throw new RangeError('freshwaterFlow_m3_s must be > 0');
    if (tidalVelocity_m_s <= 0) throw new RangeError('tidalVelocity_m_s must be > 0');
    if (depth_m <= 0) throw new RangeError('depth_m must be > 0');
    if (width_m <= 0) throw new RangeError('width_m must be > 0');

    // Densidade diferencial estimada: ~1 kg/m³ por m/s de fluxo de água doce
    // Delta density estimated from freshwater fraction relative to cross-section velocity
    const crossSectionArea = depth_m * width_m;
    const freshwaterVelocity = freshwaterFlow_m3_s / crossSectionArea;

    // Salinidade relativa estimada da razão de velocidades (adimensional proxy)
    // Relative salinity estimated from velocity ratio (dimensionless proxy)
    const velocityRatio = freshwaterVelocity / tidalVelocity_m_s;

    // Δρ proporcional à fração de água doce × densidade de referência (max ~25 kg/m³)
    const deltaDensity = Math.min(velocityRatio * RHO_REF * 0.025, 25);

    const richardsonNumber = (G * deltaDensity * depth_m) / (RHO_REF * tidalVelocity_m_s ** 2);

    /** @type {'well_mixed'|'partially_mixed'|'stratified'} */
    let stratification: 'well_mixed' | 'partially_mixed' | 'stratified';
    if (richardsonNumber < 0.25) {
        stratification = 'well_mixed';
    } else if (richardsonNumber < 1.0) {
        stratification = 'partially_mixed';
    } else {
        stratification = 'stratified';
    }

    return { richardsonNumber, stratification };
}

/**
 * Compute tidal excursion distance.
 * Calcula a excursão de maré - distância percorrida pela água durante meio ciclo.
 *
 * L = U × T × 3600 / π  (Dyer, 1997 eq. 2.4)
 *
 * @param {number} tidalVelocity_m_s - Peak tidal velocity (m/s), > 0
 * @param {number} tidalPeriod_h - Tidal period (hours), > 0
 * @returns {{ excursion_m: number }}
 * @throws {RangeError} se inputs inválidos
 * @references Dyer, K.R. (1997) Estuaries: A Physical Introduction, eq. 2.4.
 */
export function computeTidalExcursion(
    tidalVelocity_m_s: number,
    tidalPeriod_h: number,
): { excursion_m: number } {
    if (tidalVelocity_m_s <= 0) throw new RangeError('tidalVelocity_m_s must be > 0');
    if (tidalPeriod_h <= 0) throw new RangeError('tidalPeriod_h must be > 0');

    // Excursão = amplitude de maré × período / π
    const excursion_m = (tidalVelocity_m_s * tidalPeriod_h * 3600) / Math.PI;
    return { excursion_m };
}

/**
 * Classify estuary type by Hansen & Rattray (1966) scheme.
 * Classifica o tipo de estuário segundo Hansen & Rattray (1966).
 *
 * - salt_wedge:      mixingRatio < 0.1  (river-dominated, strong stratification)
 * - well_mixed:      mixingRatio > 0.9  (tide-dominated, vertically homogeneous)
 * - fjord:           mixingRatio < 0.3 AND salinityRiver < 1 (deep, strongly stratified)
 * - partially_mixed: between the above limits
 *
 * @param {number} salinityRiver_ppt - River/upper estuary salinity (ppt), ≥ 0
 * @param {number} salinityOcean_ppt - Ocean/lower estuary salinity (ppt), > 0
 * @param {number} mixingRatio - Tidal mixing ratio [0, 1] from computeSalinityMixing
 * @returns {{ type: 'salt_wedge'|'partially_mixed'|'well_mixed'|'fjord' }}
 * @throws {RangeError} se inputs fora dos limites físicos
 * @references Hansen, D.V. & Rattray, M. (1966) Limnol. Oceanogr. 11(3):319-326.
 */
export function classifyEstuaryType(
    salinityRiver_ppt: number,
    salinityOcean_ppt: number,
    mixingRatio: number,
): { type: 'salt_wedge' | 'partially_mixed' | 'well_mixed' | 'fjord' } {
    if (salinityRiver_ppt < 0) throw new RangeError('salinityRiver_ppt must be >= 0');
    if (salinityOcean_ppt <= 0) throw new RangeError('salinityOcean_ppt must be > 0');
    if (mixingRatio < 0 || mixingRatio > 1) throw new RangeError('mixingRatio must be in [0, 1]');

    /** @type {'salt_wedge'|'partially_mixed'|'well_mixed'|'fjord'} */
    let type: 'salt_wedge' | 'partially_mixed' | 'well_mixed' | 'fjord';
    if (salinityRiver_ppt < 1 && mixingRatio < 0.3) {
        // Fjord: forte estratificação permanente por entrada de água doce fria
        type = 'fjord';
    } else if (mixingRatio < 0.1) {
        // Cunha salina: fluxo de rio domina, intrusão de água salgada no fundo
        type = 'salt_wedge';
    } else if (mixingRatio > 0.9) {
        // Bem misturado: maré domina, salinidade uniforme na vertical
        type = 'well_mixed';
    } else {
        // Parcialmente misturado: transição, gradiente vertical de salinidade
        type = 'partially_mixed';
    }

    return { type };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const estuarineHydrodynamicsMeta: AnalyticsModuleMeta = {
    name: 'estuarineHydrodynamics',
    description: 'Estuarine Hydrodynamics',
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
