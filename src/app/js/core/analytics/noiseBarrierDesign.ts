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
// Application: EHS & Mining - Noise Barrier Acoustic Design
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Noise Barrier Acoustic Design
 *
 * Módulo puro implementando cálculos acústicos de barreiras sonoras baseados
 * em Maekawa (1968), Mass Law para transmissão, número de Fresnel e
 * classificação de desempenho por FHWA e ISO 9613-2:1996.
 * Zero dependências de DOM, IDB, Three.js ou fetch.
 *
 * References:
 *   Maekawa, Z. (1968) Noise reduction by screens. Applied Acoustics 1(3): 157–173.
 *   ISO 9613-2:1996 Acoustics - Attenuation of sound during propagation outdoors.
 *   FHWA (2011) Highway Traffic Noise: Analysis and Abatement Guidance.
 *     Federal Highway Administration, U.S. Department of Transportation.
 *
 * @module noiseBarrierDesign
 */

'use strict';

/** Speed of sound in air at 20°C (m/s) */
const SPEED_OF_SOUND = 343;

/**
 * Compute Fresnel number N for a barrier diffracting path.
 * N = 2 × δ / λ; δ = caminho pela barreira − caminho direto; λ = c/f
 *
 * @param {number} pathLengthDiff_m - path length difference δ = d_barrier - d_direct (m)
 * @param {number} frequency_Hz - frequency of interest (Hz)
 * @returns {{ fresnelNumber: number, wavelength_m: number }}
 *
 * @throws {RangeError} if frequency is non-positive
 */
export function computeFresnelNumber(pathLengthDiff_m: any, frequency_Hz: any) {
    if (typeof pathLengthDiff_m !== 'number') {
        throw new TypeError('pathLengthDiff_m must be a number');
    }
    if (typeof frequency_Hz !== 'number' || frequency_Hz <= 0) {
        throw new RangeError('frequency_Hz must be a positive number');
    }

    const wavelength_m = SPEED_OF_SOUND / frequency_Hz;
    const fresnelNumber = (2 * pathLengthDiff_m) / wavelength_m;

    return { fresnelNumber, wavelength_m };
}

/**
 * Compute Insertion Loss (IL) via Maekawa (1968) diffraction formula.
 * IL = 10 × log10(3 + 20 × N) quando N > 0
 *
 * Calcula o caminho pela barreira e o caminho direto geometricamente,
 * depois deriva N e aplica a fórmula de Maekawa.
 *
 * @param {number} barrierHeight_m - top of barrier elevation (m above ground)
 * @param {number} sourceHeight_m - source height above ground (m)
 * @param {number} receiverHeight_m - receiver height above ground (m)
 * @param {number} sourceDistance_m - horizontal distance: source to barrier (m)
 * @param {number} receiverDistance_m - horizontal distance: barrier to receiver (m)
 * @param {number} frequency_Hz - frequency (Hz)
 * @returns {{ insertionLoss_dB: number, fresnelNumber: number }}
 *
 * @throws {RangeError} if any dimension is non-positive
 */
export function computeInsertionLoss(
    barrierHeight_m: any,
    sourceHeight_m: any,
    receiverHeight_m: any,
    sourceDistance_m: any,
    receiverDistance_m: any,
    frequency_Hz: any,
) {
    for (const [name, val] of [
        ['barrierHeight_m', barrierHeight_m],
        ['sourceHeight_m', sourceHeight_m],
        ['receiverHeight_m', receiverHeight_m],
        ['sourceDistance_m', sourceDistance_m],
        ['receiverDistance_m', receiverDistance_m],
        ['frequency_Hz', frequency_Hz],
    ]) {
        if (typeof val !== 'number' || val <= 0) {
            throw new RangeError(`${name} must be a positive number`);
        }
    }

    // Caminho direto (linha reta fonte → receptor, ignorando barreira)
    const horizontalDirect = sourceDistance_m + receiverDistance_m;
    const verticalDirect = receiverHeight_m - sourceHeight_m;
    const d_direct = Math.sqrt(horizontalDirect ** 2 + verticalDirect ** 2);

    // Caminho pela difração no topo da barreira (fonte → topo + topo → receptor)
    const d_src_top = Math.sqrt(sourceDistance_m ** 2 + (barrierHeight_m - sourceHeight_m) ** 2);
    const d_top_rec = Math.sqrt(receiverDistance_m ** 2 + (barrierHeight_m - receiverHeight_m) ** 2);
    const d_barrier = d_src_top + d_top_rec;

    const delta = d_barrier - d_direct; // diferença de percurso
    const { fresnelNumber } = computeFresnelNumber(delta, frequency_Hz);

    // Fórmula de Maekawa: IL = 10 × log10(3 + 20N) para N > 0
    const N = fresnelNumber;
    let insertionLoss_dB = 0;
    if (N > 0) {
        insertionLoss_dB = 10 * Math.log10(3 + 20 * N);
    }

    return { insertionLoss_dB, fresnelNumber: N };
}

/**
 * Compute Transmission Loss (TL) via the Mass Law.
 * TL = 20 × log10(m × f) − 47.5
 * Válido para parede simples sem coincidência.
 *
 * @param {number} surfaceDensity_kg_m2 - surface mass density m (kg/m²)
 * @param {number} frequency_Hz - frequency (Hz)
 * @returns {{ transmissionLoss_dB: number }}
 *
 * @throws {RangeError} if inputs are non-positive
 */
export function computeBarrierTransmissionLoss(surfaceDensity_kg_m2: any, frequency_Hz: any) {
    if (typeof surfaceDensity_kg_m2 !== 'number' || surfaceDensity_kg_m2 <= 0) {
        throw new RangeError('surfaceDensity_kg_m2 must be a positive number');
    }
    if (typeof frequency_Hz !== 'number' || frequency_Hz <= 0) {
        throw new RangeError('frequency_Hz must be a positive number');
    }

    // Lei da massa: TL = 20·log10(m·f) − 47.5
    const transmissionLoss_dB = 20 * Math.log10(surfaceDensity_kg_m2 * frequency_Hz) - 47.5;

    return { transmissionLoss_dB };
}

/**
 * Classify noise barrier performance by insertion loss.
 * Categorias FHWA e ISO 9613-2:
 *   poor:       IL < 5 dB   → FHWA Cat A (< 7 dB)
 *   acceptable: 5 ≤ IL < 10 → FHWA Cat A/B
 *   good:       10 ≤ IL < 15 → FHWA Cat B/C
 *   excellent:  IL ≥ 15 dB  → FHWA Cat C
 *
 * @param {number} insertionLoss_dB - measured or computed IL (dB)
 * @returns {{ category: 'poor'|'acceptable'|'good'|'excellent', FHWA_category: string }}
 *
 * @throws {TypeError} if insertionLoss_dB is not a number
 */
export function classifyBarrierPerformance(insertionLoss_dB: any) {
    if (typeof insertionLoss_dB !== 'number') {
        throw new TypeError('insertionLoss_dB must be a number');
    }

    /** @type {'poor'|'acceptable'|'good'|'excellent'} */
    let category;
    /** @type {string} */
    let FHWA_category;

    if (insertionLoss_dB < 5) {
        category = 'poor';
        FHWA_category = 'Cat A';
    } else if (insertionLoss_dB < 10) {
        category = 'acceptable';
        FHWA_category = insertionLoss_dB < 7 ? 'Cat A' : 'Cat B';
    } else if (insertionLoss_dB < 15) {
        category = 'good';
        FHWA_category = 'Cat B/C';
    } else {
        category = 'excellent';
        FHWA_category = 'Cat C';
    }

    return { category, FHWA_category };
}

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const noiseBarrierDesignMeta = {
    name: 'noiseBarrierDesign',
    description: 'Noise Barrier Acoustic Design',
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
