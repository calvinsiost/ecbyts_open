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
// Application: EHS & Mining - Environmental Noise Assessment
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Environmental Noise Assessment - CONAMA 001/1990 Compliance Module
 *
 * Módulo puro implementando avaliação de ruído ambiental conforme legislação
 * brasileira (CONAMA 001/1990) e normas internacionais (ISO 9613-2, WHO 2018).
 * Cobre SPL, atenuação geométrica, nível equivalente Leq e classificação por zona.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * Referências acadêmicas:
 *   - CONAMA Resolução 001/1990. Dispõe sobre critérios e padrões de emissão
 *     de ruídos das atividades industriais. Brasília: MMA.
 *   - ISO 9613-2 (1996). Acoustics - Attenuation of sound during propagation
 *     outdoors - Part 2: General method of calculation. ISO, Geneva.
 *   - WHO (2018). Environmental Noise Guidelines for the European Region.
 *     World Health Organization, Regional Office for Europe. ISBN 978-92-890-5356-3.
 *   - ABNT NBR 10151 (2019). Acústica - Avaliação do ruído em áreas habitadas
 *     visando o conforto da comunidade. ABNT, Rio de Janeiro.
 */

'use strict';

// Referência de pressão sonora (ISO 1683)
// Reference sound pressure (threshold of human hearing)
const P_REF = 20e-6; // Pa (20 µPa)

// Limites CONAMA 001/1990 por zona e período
// CONAMA 001/1990 limits (dB(A)) by zone and time of day
const CONAMA_LIMITS = {
    // { day: dB, night: dB }
    residential: { day: 55, night: 50 },
    commercial: { day: 65, night: 60 },
    industrial: { day: 70, night: 70 },
    mixed: { day: 60, night: 55 },
};

// ─── Sound Pressure Level ─────────────────────────────────────────────────

/**
 * Compute Sound Pressure Level (SPL) in dB from RMS pressure.
 * Calcula o nível de pressão sonora em dB a partir da pressão RMS em Pascal.
 *
 * SPL = 20 × log10(p / p_ref)  where p_ref = 20 µPa
 *
 * @param {number} pressure_Pa - RMS sound pressure in Pascal (> 0)
 * @returns {{ spl: number }} SPL in dB (re 20 µPa)
 * @throws {RangeError} if pressure_Pa ≤ 0
 */
export function computeSoundPressureLevel(pressure_Pa: any) {
    if (typeof pressure_Pa !== 'number' || pressure_Pa <= 0) {
        throw new RangeError('pressure_Pa must be > 0 Pa');
    }

    // SPL = 20 × log10(p / p_ref)  - ISO 1683 definition
    const spl = 20 * Math.log10(pressure_Pa / P_REF);
    return { spl };
}

// ─── Distance Attenuation ─────────────────────────────────────────────────

/**
 * Compute point-source geometric (spherical spreading) attenuation.
 * Calcula a atenuação geométrica de ponto-fonte (propagação esférica).
 *
 * SPL_target = SPL_source - 20 × log10(r2 / r1)
 * Valid for free-field propagation; -6 dB per distance doubling.
 *
 * @param {number} sourceSPL - Sound pressure level at reference distance (dB)
 * @param {number} sourceDistance - Reference distance r1 (m, > 0)
 * @param {number} targetDistance - Target distance r2 (m, > 0)
 * @returns {{ attenuatedSPL: number }} SPL at target distance (dB)
 * @throws {RangeError} if distances ≤ 0
 */
export function computeDistanceAttenuation(sourceSPL: any, sourceDistance: any, targetDistance: any) {
    if (typeof sourceSPL !== 'number') {
        throw new TypeError('sourceSPL must be a number');
    }
    if (typeof sourceDistance !== 'number' || sourceDistance <= 0) {
        throw new RangeError('sourceDistance must be > 0 m');
    }
    if (typeof targetDistance !== 'number' || targetDistance <= 0) {
        throw new RangeError('targetDistance must be > 0 m');
    }

    // SPL_t = SPL_s - 20×log10(r2/r1)  - ISO 9613-2 point source divergence
    const attenuatedSPL = sourceSPL - 20 * Math.log10(targetDistance / sourceDistance);
    return { attenuatedSPL };
}

// ─── Equivalent Level ─────────────────────────────────────────────────────

/**
 * Compute time-averaged equivalent continuous sound level Leq (dB).
 * Calcula o nível equivalente de ruído (média energética temporal).
 *
 * Leq = 10 × log10( (1/T) × Σ(t_i × 10^(SPL_i/10)) )
 * where T = total duration, t_i and SPL_i are paired duration-level values.
 *
 * @param {number[]} levels - Array of SPL values in dB (length ≥ 1)
 * @param {number[]} durations - Array of durations in hours (same length, all > 0)
 * @returns {{ leq: number }} Leq in dB
 * @throws {TypeError} if inputs are not arrays of equal length
 * @throws {RangeError} if any duration ≤ 0 or arrays are empty
 */
export function computeEquivalentLevel(levels: any, durations: any) {
    if (!Array.isArray(levels) || !Array.isArray(durations)) {
        throw new TypeError('levels and durations must be arrays');
    }
    if (levels.length === 0 || durations.length === 0) {
        throw new RangeError('levels and durations must not be empty');
    }
    if (levels.length !== durations.length) {
        throw new RangeError('levels and durations must have the same length');
    }
    for (let i = 0; i < durations.length; i++) {
        if (typeof durations[i] !== 'number' || durations[i] <= 0) {
            throw new RangeError(`durations[${i}] must be > 0 hours`);
        }
        if (typeof levels[i] !== 'number') {
            throw new TypeError(`levels[${i}] must be a number`);
        }
    }

    const totalDuration = durations.reduce((sum, d) => sum + d, 0);

    // Leq = 10×log10( (1/T) × Σ t_i × 10^(L_i/10) )
    // Conversão energética: somar pressões quadráticas ponderadas pelo tempo
    const energySum = levels.reduce((sum, spl, i) => {
        return sum + durations[i] * Math.pow(10, spl / 10);
    }, 0);

    const leq = 10 * Math.log10(energySum / totalDuration);
    return { leq };
}

// ─── Zone Classification ──────────────────────────────────────────────────

/**
 * Classify noise zone and assess CONAMA 001/1990 exceedance.
 * Classifica zona de ruído e verifica conformidade CONAMA 001/1990.
 *
 * Returns the zone type inferred from the Leq magnitude and time of day,
 * plus whether the limit is exceeded.
 *
 * Classification logic (CONAMA 001/1990 Tables 1 & 2):
 *   Leq ≤ 55 dB (day) / 50 dB (night) → residential
 *   Leq ≤ 65 dB (day) / 60 dB (night) → commercial
 *   Leq ≤ 70 dB (day/night)            → industrial
 *   otherwise                           → industrial (with exceedance)
 *
 * @param {number} leq - Equivalent noise level (dB)
 * @param {'day'|'night'} timeOfDay - 'day' (07:00–22:00) or 'night' (22:00–07:00)
 * @returns {{ zone: string, exceedance: boolean, limit_dB: number }}
 * @throws {TypeError} if leq is not a number or timeOfDay is invalid
 */
export function classifyNoiseZone(leq: any, timeOfDay: any) {
    if (typeof leq !== 'number') {
        throw new TypeError('leq must be a number (dB)');
    }
    if (timeOfDay !== 'day' && timeOfDay !== 'night') {
        throw new TypeError("timeOfDay must be 'day' or 'night'");
    }

    const period = timeOfDay; // 'day' | 'night'

    // Classificar zona de acordo com o nível medido e o período
    // Menor zona que acomoda o nível medido - CONAMA 001/1990 Tab.1
    let zone;
    let limit_dB;

if (leq <= CONAMA_LIMITS.residential[period as 'day' | 'night']) {
        zone = 'residential';
        limit_dB = CONAMA_LIMITS.residential[period as 'day' | 'night'];
    } else if (leq <= CONAMA_LIMITS.mixed[period as 'day' | 'night']) {
        zone = 'mixed';
        limit_dB = CONAMA_LIMITS.mixed[period as 'day' | 'night'];
    } else if (leq <= CONAMA_LIMITS.commercial[period as 'day' | 'night']) {
        zone = 'commercial';
        limit_dB = CONAMA_LIMITS.commercial[period as 'day' | 'night'];
    } else {
        zone = 'industrial';
        limit_dB = CONAMA_LIMITS.industrial[period as 'day' | 'night'];
    }

    const exceedance = leq > limit_dB;
    return { zone, exceedance, limit_dB };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const noiseEnvironmentalMeta = {
    name: 'noiseEnvironmental',
    description: 'Environmental Noise Assessment',
    category: 'analytics',
    familyTags: ['noise'],
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
