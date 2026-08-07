// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WATERSHED-FAMILY-001 / R3 — Delineação de bacia hidrográfica. Pure-logic.

   Dado o campo de direções de escoamento (D8) e um "ponto de exutório" (pour
   point — ex.: um poço de monitoramento, uma captação, a foz), encontra TODAS
   as células que drenam para esse ponto: a bacia de contribuição. Também traça
   o caminho de escoamento (talvegue) de um ponto até a borda/exutório.

   Algoritmo: percorre o grafo de fluxo ao CONTRÁRIO (de jusante para montante)
   a partir do exutório, coletando todo célula cujo escoamento chega nele.

   Determinístico; sem DOM/rede. Consome a saída de _d8FlowPure.
   ================================================================ */

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

function idx(x: number, y: number, w: number): number {
    return y * w + x;
}

export interface WatershedResult {
    /** Máscara: 1 se a célula pertence à bacia, 0 caso contrário (row-major). */
    readonly mask: Uint8Array;
    /** Nº de células na bacia. */
    readonly cellCount: number;
    /** Área da bacia em unidades² (cellCount × cellSize²) quando cellSize informado. */
    readonly area: number;
}

function validateWatershedArgs(dir: Int8Array, w: number, h: number, pourX: number, pourY: number): void {
    if (dir.length !== w * h) throw new RangeError('delineateWatershed: dir.length != w*h');
    if (pourX < 0 || pourY < 0 || pourX >= w || pourY >= h) {
        throw new RangeError('delineateWatershed: exutório fora da grade');
    }
}

function getUpstreamNeighbors(c: number, dir: Int8Array, w: number, h: number): number[] {
    const cx = c % w;
    const cy = (c / w) | 0;
    const neighbors: number[] = [];
    for (let d = 0; d < 8; d++) {
        const nx = cx + DX[d]!;
        const ny = cy + DY[d]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nc = idx(nx, ny, w);
        const nd = dir[nc]!;
        if (nd < 0) continue;
        // vizinho nc escoa para (nx+DX[nd], ny+DY[nd]); pertence à bacia se esse destino é c
        if (nx + DX[nd]! === cx && ny + DY[nd]! === cy) {
            neighbors.push(nc);
        }
    }
    return neighbors;
}

function collectUpstreamCells(dir: Int8Array, w: number, h: number, outlet: number): { mask: Uint8Array; count: number } {
    const mask = new Uint8Array(w * h);
    const stack: number[] = [outlet];
    mask[outlet] = 1;
    let count = 1;
    // BFS/DFS para montante: um vizinho n pertence à bacia se dir[n] aponta para a célula atual.
    while (stack.length > 0) {
        const c = stack.pop() as number;
        for (const nc of getUpstreamNeighbors(c, dir, w, h)) {
            if (mask[nc]) continue;
            mask[nc] = 1;
            count++;
            stack.push(nc);
        }
    }
    return { mask, count };
}

/**
 * Delineia a bacia que drena para (pourX, pourY) usando o campo de direções D8.
 * @param dir tamanho da célula (m); se >0, calcula a área.
 */
export function delineateWatershed(
    dir: Int8Array,
    w: number,
    h: number,
    pourX: number,
    pourY: number,
    cellSize = 1,
): WatershedResult {
    validateWatershedArgs(dir, w, h, pourX, pourY);
    const outlet = idx(pourX, pourY, w);
    const { mask, count } = collectUpstreamCells(dir, w, h, outlet);
    return Object.freeze({
        mask,
        cellCount: count,
        area: cellSize > 0 ? count * cellSize * cellSize : count,
    });
}

/**
 * Traça o caminho de escoamento (talvegue) de (startX,startY) seguindo as
 * direções D8 até sair da grade ou atingir um exutório (-1). Retorna a lista
 * de índices de célula na ordem do escoamento. Protegido contra ciclo.
 */
export function traceFlowPath(dir: Int8Array, w: number, h: number, startX: number, startY: number): number[] {
    if (dir.length !== w * h) throw new RangeError('traceFlowPath: dir.length != w*h');
    if (startX < 0 || startY < 0 || startX >= w || startY >= h) {
        throw new RangeError('traceFlowPath: início fora da grade');
    }
    const path: number[] = [];
    const seen = new Uint8Array(w * h);
    let x = startX;
    let y = startY;
    for (let guard = 0; guard < w * h + 1; guard++) {
        const c = idx(x, y, w);
        if (seen[c]) break; // proteção anti-ciclo
        seen[c] = 1;
        path.push(c);
        const d = dir[c]!;
        if (d < 0) break; // exutório
        x += DX[d]!;
        y += DY[d]!;
        if (x < 0 || y < 0 || x >= w || y >= h) break; // saiu da grade
    }
    return path;
}
