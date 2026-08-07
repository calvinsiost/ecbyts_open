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
 * Seismic Risk Assessment for Mining Operations
 *
 * Calcula magnitude local, aceleração de pico do solo (PGA), índice de
 * perigo sísmico e classifica o risco sísmico em minas.
 *
 * References:
 *  - Richter, C.F. (1958) Elementary Seismology - magnitude scale adapted for mining
 *  - Atkinson, G.M. & Boore, D.M. (2003) Empirical ground-motion relations for
 *    subduction-zone earthquakes. Bull. Seism. Soc. Am. 93(4):1703-1729.
 *    DOI: 10.1785/0120020034
 *  - Gibowicz, S.J. & Kijko, A. (1994) An Introduction to Mining Seismology. Academic Press.
 */

interface MLResult { ML: number }
interface PGAResult { PGA_g: number }
interface SHIResult { SHI: number }
interface RiskResult { risk: 'low' | 'moderate' | 'high' | 'critical' }

/**
 * Computa a Magnitude Local (ML) adaptada para sismos induzidos por mineração.
 * ML = log10(PGV) + 1.11 × log10(distance) - 0.3
 * Baseado na formulação de Richter (1958) com coeficientes para fonte próxima.
 *
 * @param {number} peak_ground_velocity_mm_s - PGV medida pelo sismógrafo (mm/s, > 0)
 * @param {number} distance_m               - Distância epicentral (m, > 0)
 * @returns {{ ML: number }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se PGV ≤ 0 ou distance ≤ 0
 */
export function computeLocalMagnitude(peak_ground_velocity_mm_s: number, distance_m: number): MLResult {
    if (typeof peak_ground_velocity_mm_s !== 'number' || !isFinite(peak_ground_velocity_mm_s)) {
        throw new TypeError('peak_ground_velocity_mm_s deve ser um número finito');
    }
    if (typeof distance_m !== 'number' || !isFinite(distance_m)) {
        throw new TypeError('distance_m deve ser um número finito');
    }
    if (peak_ground_velocity_mm_s <= 0) {
        throw new RangeError('peak_ground_velocity_mm_s deve ser maior que zero');
    }
    if (distance_m <= 0) {
        throw new RangeError('distance_m deve ser maior que zero');
    }

    const ML = Math.log10(peak_ground_velocity_mm_s) + 1.11 * Math.log10(distance_m) - 0.3;
    return { ML };
}

/**
 * Computa a Aceleração de Pico do Solo (PGA) usando relação de atenuação.
 * PGA = 0.0026 × 10^(0.74 × ML) × distance^(-1.5) × site_amplification [g]
 * Equação de Atkinson & Boore (2003), DOI:10.1785/0120020034, adaptada para minas.
 *
 * @param {number} ML               - Magnitude local (adimensional)
 * @param {number} distance_m       - Distância epicentral (m, > 0)
 * @param {number} site_amplification - Fator de amplificação do solo (> 0, típico 1.0–3.0)
 * @returns {{ PGA_g: number }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se distance ≤ 0 ou site_amplification ≤ 0
 */
export function computePeakGroundAcceleration(ML: number, distance_m: number, site_amplification: number): PGAResult {
    if (typeof ML !== 'number' || !isFinite(ML)) {
        throw new TypeError('ML deve ser um número finito');
    }
    if (typeof distance_m !== 'number' || !isFinite(distance_m)) {
        throw new TypeError('distance_m deve ser um número finito');
    }
    if (typeof site_amplification !== 'number' || !isFinite(site_amplification)) {
        throw new TypeError('site_amplification deve ser um número finito');
    }
    if (distance_m <= 0) {
        throw new RangeError('distance_m deve ser maior que zero');
    }
    if (site_amplification <= 0) {
        throw new RangeError('site_amplification deve ser maior que zero');
    }

    const PGA_g = 0.0026 * Math.pow(10, 0.74 * ML) * Math.pow(distance_m, -1.5) * site_amplification;
    return { PGA_g };
}

/**
 * Computa o Índice de Perigo Sísmico (SHI) como índice composto normalizado [0, 1].
 * SHI = min(1, (historical_events/50 × 0.4) + (max_ML/5 × 0.4) + (mine_depth_m/2000 × 0.2))
 * Componentes: frequência histórica, magnitude máxima e profundidade da mina.
 *
 * @param {number} historical_events - Número de eventos sísmicos históricos (≥ 0)
 * @param {number} max_ML            - Magnitude máxima registrada na área (adimensional)
 * @param {number} mine_depth_m      - Profundidade média da mina (m, > 0)
 * @returns {{ SHI: number }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se historical_events < 0 ou mine_depth_m ≤ 0
 */
export function computeSeismicHazardIndex(historical_events: number, max_ML: number, mine_depth_m: number): SHIResult {
    if (typeof historical_events !== 'number' || !isFinite(historical_events)) {
        throw new TypeError('historical_events deve ser um número finito');
    }
    if (typeof max_ML !== 'number' || !isFinite(max_ML)) {
        throw new TypeError('max_ML deve ser um número finito');
    }
    if (typeof mine_depth_m !== 'number' || !isFinite(mine_depth_m)) {
        throw new TypeError('mine_depth_m deve ser um número finito');
    }
    if (historical_events < 0) {
        throw new RangeError('historical_events não pode ser negativo');
    }
    if (mine_depth_m <= 0) {
        throw new RangeError('mine_depth_m deve ser maior que zero');
    }

    const freq_component = Math.min(1, historical_events / 50) * 0.4;
    // Magnitudes negativas (microsismos) contribuem zero para o índice
    const mag_component = Math.min(1, Math.max(0, max_ML) / 5) * 0.4;
    const depth_component = Math.min(1, mine_depth_m / 2000) * 0.2;
    const SHI = Math.min(1, freq_component + mag_component + depth_component);
    return { SHI };
}

/**
 * Classifica o risco sísmico com base em SHI e PGA.
 *   SHI < 0.2 AND PGA < 0.05 g  → low
 *   SHI < 0.5 AND PGA < 0.1 g   → moderate
 *   SHI < 0.8 AND PGA < 0.3 g   → high
 *   else                          → critical
 *
 * @param {number} SHI   - Índice de perigo sísmico [0, 1]
 * @param {number} PGA_g - Aceleração de pico do solo (g, ≥ 0)
 * @returns {{ risk: 'low'|'moderate'|'high'|'critical' }}
 * @throws {TypeError}   se os argumentos não forem números finitos
 * @throws {RangeError}  se SHI fora de [0, 1] ou PGA < 0
 */
export function classifySeismicRisk(SHI: number, PGA_g: number): RiskResult {
    if (typeof SHI !== 'number' || !isFinite(SHI)) {
        throw new TypeError('SHI deve ser um número finito');
    }
    if (typeof PGA_g !== 'number' || !isFinite(PGA_g)) {
        throw new TypeError('PGA_g deve ser um número finito');
    }
    if (SHI < 0 || SHI > 1) {
        throw new RangeError('SHI deve estar no intervalo [0, 1]');
    }
    if (PGA_g < 0) {
        throw new RangeError('PGA_g não pode ser negativo');
    }

    let risk: 'low' | 'moderate' | 'high' | 'critical' = 'critical';
    if (SHI < 0.2 && PGA_g < 0.05) risk = 'low';
    else if (SHI < 0.5 && PGA_g < 0.1) risk = 'moderate';
    else if (SHI < 0.8 && PGA_g < 0.3) risk = 'high';

    return { risk };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const seismicRiskMiningMeta = {
    name: 'seismicRiskMining',
    description: 'seismicRiskMining',
    category: 'analytics',
    familyTags: ['mining', 'risk', 'seismic'],
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
