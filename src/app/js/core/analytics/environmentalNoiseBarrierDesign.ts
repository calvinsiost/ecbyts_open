// @ts-check
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
 * @module environmentalNoiseBarrierDesign
 * @description Projeto de barreiras acusticas ambientais - ISO 9613-2 (1996) e
 * metodo de Maekawa (1968). Calcula atenuacao por difracao, insercao de perda
 * e nivel residual de ruido no receptor.
 *
 * Academic references:
 *   ISO 9613-2:1996 - Acoustics: Attenuation of Sound During Propagation Outdoors.
 *     Part 2: General Method of Calculation.
 *   Maekawa, Z. (1968). Noise reduction by screens.
 *     Applied Acoustics 1(3):157–173. DOI:10.1016/0003-682X(68)90006-3
 *   Kurze, U.J. & Anderson, G.S. (1971). Sound attenuation by barriers.
 *     Applied Acoustics 4(1):35–53.
 */
'use strict';
/** Velocidade do som padrao no ar a 20°C e pressao atmosferica. */
const DEFAULT_SPEED_OF_SOUND = 343; // m/s
/**
 * Calcula a diferenca de caminho de difração (δ, delta) e o numero de Fresnel (N).
 * Para um sistema fonte–barreira–receptor 2D em secao transversal.
 *
 * δ = (dSB + dBR) - dSR
 *   onde dSB = distancia fonte→topo da barreira, dBR = topo→receptor, dSR = fonte→receptor
 *
 * N = 2δ / λ = 2δ × f / c
 *
 * @param {{ x: number, y: number }} source - Posicao da fonte (m)
 * @param {{ x: number, y: number }} receiver - Posicao do receptor (m)
 * @param {{ x: number, y: number }} barrier - Posicao do topo da barreira (m)
 * @param {number} [speedOfSound=343] - Velocidade do som (m/s)
 * @returns {{ delta_m: number, dSB: number, dBR: number, dSR: number }}
 *
 * @note N (numero de Fresnel) depende da frequencia - calculado em calcInsertionLoss
 */
export function calcSoundDiffraction(source: any, receiver: any, barrier: any, speedOfSound = DEFAULT_SPEED_OF_SOUND) {
    for (const [name, pt] of [
        ['source', source],
        ['receiver', receiver],
        ['barrier', barrier],
    ]) {
        if (typeof pt !== 'object' ||
            pt === null ||
            typeof pt.x !== 'number' ||
            !isFinite(pt.x) ||
            typeof pt.y !== 'number' ||
            !isFinite(pt.y)) {
            throw new TypeError(`${name} must be {x: number, y: number}`);
        }
    }
    if (typeof speedOfSound !== 'number' || !isFinite(speedOfSound) || speedOfSound <= 0) {
        throw new RangeError(`speedOfSound must be > 0, got: ${speedOfSound}`);
    }
    /** @type {(a: {x:number,y:number}, b: {x:number,y:number}) => number} */
    const dist = (a: any, b: any) => Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const dSB = dist(source, barrier);
    const dBR = dist(barrier, receiver);
    const dSR = dist(source, receiver);
    const delta_m = dSB + dBR - dSR;
    return { delta_m, dSB, dBR, dSR };
}
/**
 * Calcula a Perda de Insercao (IL) em dB pelo metodo de Maekawa (1968).
 *
 * IL = 10 × log10(3 + 20N)
 *   N = numero de Fresnel = 2δ / λ = 2δ × frequency / speedOfSound
 *
 * Valido para N > -0.5. Para N <= -0.5 (barreira abaixo da linha de visada), IL = 0.
 *
 * @param {number} frequency_Hz - Frequencia central da banda de octave (Hz), must be > 0
 * @param {number} pathLengthDiff_m - Diferenca de caminho δ (m); pode ser negativo (sem bloqueio)
 * @param {number} [speedOfSound=343] - Velocidade do som (m/s)
 * @returns {{ IL_dB: number, N: number, frequency_Hz: number, delta_m: number }}
 */
export function calcInsertionLoss(frequency_Hz: any, pathLengthDiff_m: any, speedOfSound = DEFAULT_SPEED_OF_SOUND) {
    if (typeof frequency_Hz !== 'number' || !isFinite(frequency_Hz) || frequency_Hz <= 0) {
        throw new RangeError(`frequency_Hz must be > 0, got: ${frequency_Hz}`);
    }
    if (typeof pathLengthDiff_m !== 'number' || !isFinite(pathLengthDiff_m)) {
        throw new TypeError(`pathLengthDiff_m must be a finite number, got: ${pathLengthDiff_m}`);
    }
    if (typeof speedOfSound !== 'number' || !isFinite(speedOfSound) || speedOfSound <= 0) {
        throw new RangeError(`speedOfSound must be > 0, got: ${speedOfSound}`);
    }
    const lambda = speedOfSound / frequency_Hz;
    const N = (2 * pathLengthDiff_m) / lambda;
    // Maekawa: IL = 10×log10(3 + 20N); abaixo da linha de visada (N <= -0.5) sem atenuacao
    const IL_dB = N > -0.5 ? 10 * Math.log10(3 + 20 * N) : 0;
    return { IL_dB, N, frequency_Hz, delta_m: pathLengthDiff_m };
}
/**
 * Calcula a atenuacao por difracao em dB para uma barreira de topo simples (single-edge).
 * Equivale a calcInsertionLoss mas com interface separada para clareza.
 *
 * @param {number} frequency_Hz - Frequencia (Hz), must be > 0
 * @param {number} delta_m - Diferenca de caminho (m)
 * @param {number} [speedOfSound=343] - Velocidade do som (m/s)
 * @returns {{ attenuation_dB: number, N: number, lambda_m: number }}
 */
export function calcBarrierAttenuation(frequency_Hz: any, delta_m: any, speedOfSound = DEFAULT_SPEED_OF_SOUND) {
    if (typeof frequency_Hz !== 'number' || !isFinite(frequency_Hz) || frequency_Hz <= 0) {
        throw new RangeError(`frequency_Hz must be > 0, got: ${frequency_Hz}`);
    }
    if (typeof delta_m !== 'number' || !isFinite(delta_m)) {
        throw new TypeError(`delta_m must be a finite number, got: ${delta_m}`);
    }
    if (typeof speedOfSound !== 'number' || !isFinite(speedOfSound) || speedOfSound <= 0) {
        throw new RangeError(`speedOfSound must be > 0, got: ${speedOfSound}`);
    }
    const lambda_m = speedOfSound / frequency_Hz;
    const N = (2 * delta_m) / lambda_m;
    const attenuation_dB = N > -0.5 ? 10 * Math.log10(3 + 20 * N) : 0;
    return { attenuation_dB, N, lambda_m };
}
/**
 * Calcula o nivel de ruido residual no receptor apos insercao da barreira.
 *
 * Nivel residual (dB) = sourceLevel_dB - insertionLoss_dB
 * Limitado a sourceLevel_dB (sem ganho de energia pela barreira).
 *
 * @param {number} sourceLevel_dB - Nivel de pressao sonora na fonte (dB)
 * @param {number} insertionLoss_dB - Perda de insercao da barreira (dB), must be >= 0
 * @returns {{ residualLevel_dB: number, sourceLevel_dB: number, insertionLoss_dB: number, reduction_dB: number }}
 */
export function calcResidualNoise(sourceLevel_dB: any, insertionLoss_dB: any) {
    if (typeof sourceLevel_dB !== 'number' || !isFinite(sourceLevel_dB)) {
        throw new TypeError(`sourceLevel_dB must be a finite number, got: ${sourceLevel_dB}`);
    }
    if (typeof insertionLoss_dB !== 'number' || !isFinite(insertionLoss_dB) || insertionLoss_dB < 0) {
        throw new RangeError(`insertionLoss_dB must be >= 0, got: ${insertionLoss_dB}`);
    }
    const residualLevel_dB = sourceLevel_dB - insertionLoss_dB;
    return {
        residualLevel_dB,
        sourceLevel_dB,
        insertionLoss_dB,
        reduction_dB: insertionLoss_dB,
    };
}
/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 * @type {import('../../../../types/app/analytics-library.js').AnalyticsModuleMeta}
 */
export const environmentalNoiseBarrierDesignMeta = {
    name: 'environmentalNoiseBarrierDesign',
    description: 'environmentalNoiseBarrierDesign',
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
//# sourceMappingURL=environmentalNoiseBarrierDesign.js.map
