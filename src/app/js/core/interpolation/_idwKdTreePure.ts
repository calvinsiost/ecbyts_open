// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WIRE R1 — IDW LOCAL acelerado por k-d tree (índice espacial R1). Pure-logic.

   O IDW global (engine.idwGrid) pondera TODOS os pontos por célula da grade —
   O(grade × N). Para muitos pontos isso é caro. O IDW LOCAL usa o k-d tree
   (utils/algorithms/kdTreePure) para pegar só os k vizinhos mais próximos de
   cada célula — O(grade × log N). É um método ADICIONAL: não altera o 'idw'
   existente (zero regressão).

   GARANTIA DE EQUIVALÊNCIA: com maxNeighbors ≥ N, o IDW local devolve EXATAMENTE
   o mesmo valor do IDW global (o k-d tree retorna todos os pontos). Provado por
   cheap test — é o que torna a ligação do R1 segura.

   Determinístico; sem DOM/rede. Mesma fórmula do engine.idwPoint.
   ================================================================ */

import { KdTree } from '../../utils/algorithms/kdTreePure.js';

export interface IdwPoint {
    readonly x: number;
    readonly z: number;
    readonly value: number;
}

interface IndexedPoint {
    x: number;
    y: number; // = z (o índice espacial é 2D x/y; mapeamos z→y)
    value: number;
}

export interface IdwLocalParams {
    /** Expoente de distância (default 2, igual ao IDW global). */
    readonly power?: number;
    /** Máximo de vizinhos por célula (default 12). ≥ N → idêntico ao IDW global. */
    readonly maxNeighbors?: number;
}

/** Constrói o índice espacial (k-d tree) dos pontos para IDW local. */
export function buildIdwIndex(points: ReadonlyArray<IdwPoint>): KdTree<IndexedPoint> {
    const indexed: IndexedPoint[] = points
        .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.value))
        .map((p) => ({ x: p.x, y: p.z, value: p.value }));
    return new KdTree(indexed);
}

/**
 * IDW de um ponto usando os k vizinhos mais próximos do índice. Mesma fórmula
 * do IDW global (peso 1/d^power; ponto exato retorna o valor). Com maxNeighbors
 * ≥ N o resultado é idêntico ao IDW global.
 */
export function idwLocalPoint(
    index: KdTree<IndexedPoint>,
    qx: number,
    qz: number,
    power = 2,
    maxNeighbors = 12,
): number {
    const k = Number.isInteger(maxNeighbors) && maxNeighbors > 0 ? maxNeighbors : 12;
    const neighbors = index.kNearest({ x: qx, y: qz }, k);
    let numerator = 0;
    let denominator = 0;
    for (const p of neighbors) {
        const d = Math.hypot(p.x - qx, p.y - qz);
        if (d < 1e-10) return p.value; // ponto exato (igual ao IDW global)
        const w = 1 / Math.pow(d, power);
        numerator += w * p.value;
        denominator += w;
    }
    return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Gera a grade IDW local completa (mesma assinatura de saída do idwGrid global):
 * Float32Array row-major [rows × cols].
 */
export function idwLocalGrid(
    points: ReadonlyArray<IdwPoint>,
    bounds: { minX: number; maxX: number; minZ: number; maxZ: number },
    gridSize: { cols: number; rows: number },
    params: IdwLocalParams = {},
): Float32Array {
    const { power = 2, maxNeighbors = 12 } = params;
    const { cols, rows } = gridSize;
    const grid = new Float32Array(rows * cols);
    const index = buildIdwIndex(points);
    const dx = (bounds.maxX - bounds.minX) / (cols - 1);
    const dz = (bounds.maxZ - bounds.minZ) / (rows - 1);
    for (let r = 0; r < rows; r++) {
        const qz = bounds.minZ + r * dz;
        for (let c = 0; c < cols; c++) {
            const qx = bounds.minX + c * dx;
            grid[r * cols + c] = idwLocalPoint(index, qx, qz, power, maxNeighbors);
        }
    }
    return grid;
}
