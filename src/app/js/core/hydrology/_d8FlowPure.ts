// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WATERSHED-FAMILY-001 / R3 — Hidrologia de terreno D8. Pure-logic.

   A partir de uma grade de elevação (DEM), deriva por onde a água escoa:
   1) Priority-Flood preenche depressões (Barnes et al. 2014) para a água não
      ficar "presa" em buracos artificiais do modelo;
   2) D8 (O'Callaghan & Mark 1984) atribui a cada célula a direção de escoamento
      para o vizinho de descida mais íngreme (8 direções);
   3) acumulação de fluxo conta quantas células drenam por cada célula
      (revela canais/cursos d'água).

   Tudo determinístico, sem DOM/rede; grade em array linear row-major.
   Refs: O'Callaghan & Mark 1984 (D8); Barnes, Lehman & Mulla 2014 (Priority-Flood).
   ================================================================ */

// 8 vizinhos: E, SE, S, SW, W, NW, N, NE
const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];
const DIST = [1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2, 1, Math.SQRT2];

export interface Grid {
    readonly width: number;
    readonly height: number;
    readonly elevation: ReadonlyArray<number> | Float64Array; // row-major: idx = y*width + x
}

function idx(x: number, y: number, w: number): number {
    return y * w + x;
}

function validateGrid(g: Grid): void {
    if (!g || !Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width < 2 || g.height < 2) {
        throw new RangeError('Grid: width/height inteiros ≥ 2');
    }
    if (!g.elevation || g.elevation.length !== g.width * g.height) {
        throw new RangeError('Grid: elevation deve ter width*height valores');
    }
}

/** Min-heap binário de {priority, cell}. */
class MinHeap {
    private readonly pr: number[] = [];
    private readonly cell: number[] = [];
    get size(): number {
        return this.pr.length;
    }
    push(priority: number, cell: number): void {
        this.pr.push(priority);
        this.cell.push(cell);
        let i = this.pr.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (this.pr[p]! <= this.pr[i]!) break;
            this.swap(i, p);
            i = p;
        }
    }
    pop(): number {
        const top = this.cell[0]!;
        const lastPr = this.pr.pop()!;
        const lastCell = this.cell.pop()!;
        if (this.pr.length > 0) {
            this.pr[0] = lastPr;
            this.cell[0] = lastCell;
            let i = 0;
            const n = this.pr.length;
            for (;;) {
                let smallest = i;
                const l = 2 * i + 1;
                const r = 2 * i + 2;
                if (l < n && this.pr[l]! < this.pr[smallest]!) smallest = l;
                if (r < n && this.pr[r]! < this.pr[smallest]!) smallest = r;
                if (smallest === i) break;
                this.swap(i, smallest);
                i = smallest;
            }
        }
        return top;
    }
    private swap(a: number, b: number): void {
        [this.pr[a], this.pr[b]] = [this.pr[b]!, this.pr[a]!];
        [this.cell[a], this.cell[b]] = [this.cell[b]!, this.cell[a]!];
    }
}

/**
 * Preenche depressões (Priority-Flood). Retorna nova grade de elevação onde
 * nenhuma célula interna é um sumidouro — toda água tem saída até a borda.
 */
export function fillDepressions(g: Grid): Float64Array {
    validateGrid(g);
    const { width: w, height: h } = g;
    const n = w * h;
    const filled = new Float64Array(n);
    const closed = new Uint8Array(n);
    const heap = new MinHeap();
    // semeia a borda
    for (let x = 0; x < w; x++) {
        for (const y of [0, h - 1]) {
            const c = idx(x, y, w);
            filled[c] = g.elevation[c]!;
            closed[c] = 1;
            heap.push(filled[c]!, c);
        }
    }
    for (let y = 1; y < h - 1; y++) {
        for (const x of [0, w - 1]) {
            const c = idx(x, y, w);
            filled[c] = g.elevation[c]!;
            closed[c] = 1;
            heap.push(filled[c]!, c);
        }
    }
    while (heap.size > 0) {
        const c = heap.pop();
        const cx = c % w;
        const cy = (c / w) | 0;
        for (let d = 0; d < 8; d++) {
            const nx = cx + DX[d]!;
            const ny = cy + DY[d]!;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const nc = idx(nx, ny, w);
            if (closed[nc]) continue;
            filled[nc] = Math.max(g.elevation[nc]!, filled[c]!);
            closed[nc] = 1;
            heap.push(filled[nc]!, nc);
        }
    }
    return filled;
}

/**
 * Direção de escoamento D8 por célula. Código 0..7 (vizinho de descida mais
 * íngreme) ou -1 quando drena para fora da grade (borda baixa = exutório).
 * Usa a grade preenchida internamente.
 */
export function computeFlowDirections(g: Grid): Int8Array {
    validateGrid(g);
    const { width: w, height: h } = g;
    const filled = fillDepressions(g);
    const dir = new Int8Array(w * h).fill(-1);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const c = idx(x, y, w);
            let bestD = -1;
            let bestSlope = 0; // só desce
            let bestDrop = -Infinity; // desempate p/ flats: maior queda absoluta
            for (let d = 0; d < 8; d++) {
                const nx = x + DX[d]!;
                const ny = y + DY[d]!;
                if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; // fora da grade → dir fica -1 (exutório de borda)
                const nc = idx(nx, ny, w);
                const drop = filled[c]! - filled[nc]!;
                const slope = drop / DIST[d]!;
                if (slope > bestSlope || (slope === bestSlope && drop > bestDrop)) {
                    if (slope > 0) {
                        bestSlope = slope;
                        bestDrop = drop;
                        bestD = d;
                    }
                }
            }
            dir[c] = bestD; // -1 se nenhum vizinho mais baixo (exutório/borda)
        }
    }
    return dir;
}

/**
 * Acumulação de fluxo: nº de células (incl. ela mesma) que drenam por cada
 * célula. Valores altos = canais/talvegues. Ordenação topológica O(n).
 */
export function computeFlowAccumulation(dir: Int8Array, w: number, h: number): Float64Array {
    if (dir.length !== w * h) throw new RangeError('computeFlowAccumulation: dir.length != w*h');
    const n = w * h;
    const acc = new Float64Array(n).fill(1);
    const inDeg = new Uint32Array(n);
    const downstream = new Int32Array(n).fill(-1);
    for (let c = 0; c < n; c++) {
        const d = dir[c]!;
        if (d < 0) continue;
        const cx = c % w;
        const cy = (c / w) | 0;
        const nc = idx(cx + DX[d]!, cy + DY[d]!, w);
        downstream[c] = nc;
        inDeg[nc]!++;
    }
    const queue: number[] = [];
    for (let c = 0; c < n; c++) if (inDeg[c] === 0) queue.push(c);
    let head = 0;
    while (head < queue.length) {
        const c = queue[head++]!;
        const ds = downstream[c]!;
        if (ds < 0) continue;
        acc[ds]! += acc[c]!;
        if (--inDeg[ds]! === 0) queue.push(ds);
    }
    return acc;
}
