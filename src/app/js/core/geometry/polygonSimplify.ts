// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.1.6

/* ================================================================
   POLYGON SIMPLIFICATION — Douglas-Peucker iterativo
   ================================================================

   Reduz numero de vertices de polygons preservando forma geral.
   Usado para LOD: polygons distantes usam menos vertices = render
   mais rapido + menos memoria.

   Algoritmo: Douglas-Peucker iterativo (stack-based, NAO recursivo)
   - Evita stack overflow em rings com >10k vertices
   - O(n log n) average, O(n²) worst case
   - Tolerance em metros (mesma unidade dos vertices UTM)

   Sem dependencias externas (zero deps).

   ================================================================ */

interface Point2D {
    x: number;
    z: number;
}

interface RingVertex {
    x: number;
    z: number;
    y?: number;
}

/**
 * Distancia perpendicular ponto-linha 2D no plano (x, z).
 * @param p - ponto
 * @param a - inicio da linha
 * @param b - fim da linha
 * @returns distancia em metros
 */
function _perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    if (lenSq === 0) {
        // a e b sao o mesmo ponto — distancia = euclidiana ponto-ponto
        const ddx = p.x - a.x;
        const ddz = p.z - a.z;
        return Math.sqrt(ddx * ddx + ddz * ddz);
    }
    // Formula: |((p-a) × (b-a))| / |b-a|
    const cross = Math.abs((p.x - a.x) * dz - (p.z - a.z) * dx);
    return cross / Math.sqrt(lenSq);
}

/**
 * Encontra o vertice mais distante da linha (a,b) no intervalo (start,end).
 * @returns tupla [maxDist, maxIdx]
 */
function _findFarthestVertex(
    vertices: RingVertex[],
    start: number,
    end: number,
    a: RingVertex,
    b: RingVertex,
): [number, number] {
    let maxDist = 0;
    let maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
        const vi = vertices[i];
        if (vi === undefined) continue;
        const dist = _perpendicularDistance(vi, a, b);
        if (dist > maxDist) {
            maxDist = dist;
            maxIdx = i;
        }
    }
    return [maxDist, maxIdx];
}

/**
 * Marca os vertices a manter no ring usando Douglas-Peucker iterativo.
 * @returns array booleano keep (true = manter)
 */
function _markKeepFlags(vertices: RingVertex[], tolerance: number, n: number): boolean[] {
    // Marker: true = manter, false = descartar
    const keep = new Array<boolean>(n).fill(false);
    keep[0] = true;
    keep[n - 1] = true;

    // Stack de segmentos [start, end] para processar
    const stack: Array<[number, number]> = [[0, n - 1]];

    while (stack.length > 0) {
        const segment = stack.pop();
        if (!segment) break;
        const [start, end] = segment;
        if (end - start < 2) continue;

        const a = vertices[start];
        const b = vertices[end];
        if (a === undefined || b === undefined) continue;

        const [maxDist, maxIdx] = _findFarthestVertex(vertices, start, end, a, b);
        if (maxDist > tolerance && maxIdx >= 0) {
            keep[maxIdx] = true;
            stack.push([start, maxIdx]);
            stack.push([maxIdx, end]);
        }
    }

    return keep;
}

/**
 * Reconstroi o ring simplificado a partir do marker keep.
 */
function _buildSimplifiedRing(vertices: RingVertex[], keep: boolean[], n: number): RingVertex[] {
    const result: RingVertex[] = [];
    for (let i = 0; i < n; i++) {
        if (keep[i]) {
            const v = vertices[i];
            if (v !== undefined) result.push(v);
        }
    }
    return result;
}

/**
 * Fallback: amostra uniformemente N=3 pontos do ring original.
 * Chamado apenas quando n > 3 (early return cobre n<=3).
 */
function _fallbackMinimumRing(vertices: RingVertex[], n: number): RingVertex[] {
    const step = Math.max(1, Math.floor(n / 3));
    const i0 = 0;
    const i1 = step;
    const i2 = Math.min(step * 2, n - 1);
    const v0 = vertices[i0];
    const v1 = vertices[i1];
    const v2 = vertices[i2];
    if (v0 === undefined || v1 === undefined || v2 === undefined) {
        // Seguranca: se algum indice falhar, retorna copia do original sem degenerar
        return vertices.slice(0, Math.min(3, n));
    }
    return [v0, v1, v2];
}

/**
 * Simplifica ring de vertices via Douglas-Peucker (iterativo).
 *
 * @param vertices - ring de pontos
 * @param tolerance - distancia min em metros (0 = sem simplification)
 * @returns ring simplificado, sempre >= 3 pontos
 */
export function simplifyRing(vertices: RingVertex[], tolerance: number): RingVertex[] {
    if (!Array.isArray(vertices) || vertices.length <= 3) return vertices || [];
    if (!Number.isFinite(tolerance) || tolerance <= 0) return vertices;

    const n = vertices.length;
    const keep = _markKeepFlags(vertices, tolerance, n);
    const result = _buildSimplifiedRing(vertices, keep, n);

    // Garante minimo 3 pontos (degenera polygon se menos)
    if (result.length < 3) {
        return _fallbackMinimumRing(vertices, n);
    }

    return result;
}

/**
 * Sugere tolerance baseado no nivel LOD canonical (lodConfig.js PERF-MASTER S2).
 *
 * @param lodLevel - 'HIGH' | 'MEDIUM' | 'LOW' | 'SPRITE'
 * @returns tolerance em metros (0 = no simplification)
 */
export function toleranceForLOD(lodLevel: string): number {
    const map: Record<string, number> = {
        HIGH: 0,
        MEDIUM: 50,
        LOW: 500,
        SPRITE: Infinity, // sprite collapsa para centroide
    };
    return map[lodLevel] ?? 0;
}

/**
 * Conveniencia: simplifica diretamente para um LOD level.
 *
 * @param vertices
 * @param lodLevel
 */
export function simplifyForLOD(vertices: RingVertex[], lodLevel: string): RingVertex[] {
    return simplifyRing(vertices, toleranceForLOD(lodLevel));
}
