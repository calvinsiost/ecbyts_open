// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Optimization - Uncertainty Proxy (IDW Distance)
// ADR: ADR-023

/* ================================================================
   UNCERTAINTY PROXY — Estimativa de incerteza por distancia IDW.

   Usa media das distancias aos K vizinhos mais proximos como proxy
   de incerteza geoespacial. Areas longe de pontos de monitoramento
   tem alta incerteza; areas proximas tem baixa.

   Formula: uncertainty(x,z) = mean_dist_to_K_nearest / max_dist
   Resultado normalizado entre 0 (certo) e 1 (incerto).

   Substitui Kriging Variance para o escopo GA reduzido.
   Kriging Variance sera implementado na Phase 2 (RL).
   ================================================================ */

/** Numero de vizinhos para calculo de distancia */
const K_NEIGHBORS = 5;

export interface Bounds {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
}

/**
 * Calcula incerteza em um ponto usando distancia media aos K vizinhos mais proximos.
 * Normalizado por maxDist (diagonal do bounding box).
 *
 * @param {number} x - Coordenada X do ponto de query
 * @param {number} z - Coordenada Z do ponto de query
 * @param {Array<{x: number, z: number}>} existingPoints - Pontos de monitoramento existentes
 * @param {number} maxDist - Distancia maxima para normalizacao (diagonal do bbox)
 * @returns {number} - Incerteza normalizada [0, 1]
 */
export function uncertaintyAtPoint(
    x: number,
    z: number,
    existingPoints: Array<{ x: number; z: number }>,
    maxDist: number,
): number {
    if (existingPoints.length === 0) return 1;
    if (maxDist <= 0) return 0;

    // Calcula distancias a todos os pontos
    const distances = existingPoints.map((p) => {
        const dx = x - p.x;
        const dz = z - p.z;
        return Math.sqrt(dx * dx + dz * dz);
    });

    // Ordena e pega os K menores
    distances.sort((a, b) => a - b);
    const k = Math.min(K_NEIGHBORS, distances.length);
    let sumDist = 0;
    for (let i = 0; i < k; i++) sumDist += distances[i] ?? 0;

    const meanDist = sumDist / k;
    return Math.min(meanDist / maxDist, 1);
}

/**
 * Calcula incerteza media de um conjunto de candidatos.
 * Considera pontos existentes + candidatos anteriores no set.
 *
 * @param {Array<{x: number, z: number}>} candidates - Pontos candidatos
 * @param {Array<{x: number, z: number}>} existingPoints - Pontos de monitoramento existentes
 * @param {Bounds} bounds
 * @returns {number} - Incerteza media [0, 1]
 */
export function meanUncertainty(
    candidates: Array<{ x: number; z: number }>,
    existingPoints: Array<{ x: number; z: number }>,
    bounds: Bounds,
): number {
    const maxDist = computeMaxDist(bounds);
    if (maxDist <= 0 || candidates.length === 0) return 0;

    let totalUncertainty = 0;

    // Pontos atualizados = existentes + candidatos ja adicionados
    const allPoints: Array<{ x: number; z: number }> = [...existingPoints];

    for (const candidate of candidates) {
        const u = uncertaintyAtPoint(candidate.x, candidate.z, allPoints, maxDist);
        totalUncertainty += u;
        // Cada candidato reduz a incerteza dos seguintes
        allPoints.push(candidate);
    }

    return totalUncertainty / candidates.length;
}

/**
 * Calcula reducao de incerteza de adicionar candidatos ao modelo.
 * Retorna fracao de reducao [0, 1] onde 1 = reducao total.
 *
 * @param {Array<{x: number, z: number}>} candidates - Pontos candidatos
 * @param {Array<{x: number, z: number}>} existingPoints - Pontos existentes
 * @param {Bounds} bounds
 * @param {number} [gridSize=20] - Resolucao do grid de amostragem
 * @returns {number} - Reducao de incerteza [0, 1]
 */
export function uncertaintyReduction(
    candidates: Array<{ x: number; z: number }>,
    existingPoints: Array<{ x: number; z: number }>,
    bounds: Bounds,
    gridSize: number = 20,
): number {
    const maxDist = computeMaxDist(bounds);
    if (maxDist <= 0) return 0;

    const dx = (bounds.maxX - bounds.minX) / gridSize;
    const dz = (bounds.maxZ - bounds.minZ) / gridSize;

    let sumBefore = 0;
    let sumAfter = 0;
    let count = 0;

    const allPointsAfter = [...existingPoints, ...candidates];

    for (let i = 0; i <= gridSize; i++) {
        for (let j = 0; j <= gridSize; j++) {
            const x = bounds.minX + i * dx;
            const z = bounds.minZ + j * dz;

            sumBefore += uncertaintyAtPoint(x, z, existingPoints, maxDist);
            sumAfter += uncertaintyAtPoint(x, z, allPointsAfter, maxDist);
            count++;
        }
    }

    if (count === 0 || sumBefore === 0) return 0;

    const avgBefore = sumBefore / count;
    const avgAfter = sumAfter / count;

    return Math.max(0, (avgBefore - avgAfter) / avgBefore);
}

/**
 * Calcula diagonal do bounding box (distancia maxima para normalizacao).
 *
 * @param {Bounds} bounds
 * @returns {number}
 */
export function computeMaxDist(bounds: Bounds): number {
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxZ - bounds.minZ;
    return Math.sqrt(w * w + h * h);
}