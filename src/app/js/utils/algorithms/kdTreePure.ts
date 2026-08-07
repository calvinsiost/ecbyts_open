// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB recomendação R1 — Índice espacial k-d tree 2D. Pure-logic.

   Estrutura estática que acelera consultas espaciais de O(n) (força bruta) para
   ~O(log n): vizinho mais próximo, k vizinhos, caixa (bbox) e raio. Constrói
   uma árvore balanceada dividindo pela mediana em eixos alternados (x, y, x…).

   Uso no ecbyts: hoje picking 3D, vizinhos da interpolação (IDW/Kriging),
   clustering e spatial join varrem TODOS os elementos. Com o índice, cada
   consulta examina só uma fração — ganho real conforme o nº de elementos cresce.

   Distância EUCLIDIANA (apropriada para coordenadas projetadas/cena do app).
   Para lat/long precisa em grande extensão, projetar antes (caveat documentado).
   Determinístico; sem DOM/rede. Ref: Bentley 1975, "Multidimensional binary
   search trees used for associative searching" (CACM 18(9)).
   ================================================================ */

export interface Point2D {
    readonly x: number;
    readonly y: number;
}

interface KdNode<T extends Point2D> {
    point: T;
    left: KdNode<T> | null;
    right: KdNode<T> | null;
    axis: 0 | 1; // 0 = x, 1 = y
}

function coord(p: Point2D, axis: 0 | 1): number {
    return axis === 0 ? p.x : p.y;
}

function sqDist(a: Point2D, b: Point2D): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

export class KdTree<T extends Point2D> {
    private readonly root: KdNode<T> | null;
    private readonly count: number;

    constructor(points: readonly T[]) {
        if (!Array.isArray(points)) throw new TypeError('KdTree: points deve ser array');
        const valid = points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
        this.count = valid.length;
        this.root = this.build(valid.slice(), 0);
    }

    get size(): number {
        return this.count;
    }

    private build(pts: T[], depth: number): KdNode<T> | null {
        if (pts.length === 0) return null;
        const axis = (depth % 2) as 0 | 1;
        pts.sort((a, b) => coord(a, axis) - coord(b, axis));
        const mid = Math.floor(pts.length / 2);
        return {
            point: pts[mid]!,
            axis,
            left: this.build(pts.slice(0, mid), depth + 1),
            right: this.build(pts.slice(mid + 1), depth + 1),
        };
    }

    /** Vizinho mais próximo de `query` (Euclidiano). null se a árvore está vazia. */
    nearest(query: Point2D): T | null {
        if (!this.root) return null;
        let best: T | null = null;
        let bestSq = Infinity;
        const visit = (node: KdNode<T> | null): void => {
            if (!node) return;
            const d = sqDist(node.point, query);
            if (d < bestSq) {
                bestSq = d;
                best = node.point;
            }
            const diff = coord(query, node.axis) - coord(node.point, node.axis);
            const near = diff < 0 ? node.left : node.right;
            const far = diff < 0 ? node.right : node.left;
            visit(near);
            if (diff * diff < bestSq) visit(far); // só explora o lado distante se puder conter algo melhor
        };
        visit(this.root);
        return best;
    }

    /** k vizinhos mais próximos, ordenados do mais perto ao mais longe. */
    kNearest(query: Point2D, k: number): T[] {
        if (!Number.isInteger(k) || k <= 0 || !this.root) return [];
        // heap simples: array ordenado por distância crescente, cap k.
        const heap: { point: T; sq: number }[] = [];
        const worst = (): number => (heap.length < k ? Infinity : heap[heap.length - 1]!.sq);
        const offer = (point: T, sq: number): void => {
            if (heap.length >= k && sq >= worst()) return;
            // insere mantendo ordenado
            let i = heap.length;
            heap.push({ point, sq });
            while (i > 0 && heap[i - 1]!.sq > sq) {
                heap[i] = heap[i - 1]!;
                i--;
            }
            heap[i] = { point, sq };
            if (heap.length > k) heap.pop();
        };
        const visit = (node: KdNode<T> | null): void => {
            if (!node) return;
            offer(node.point, sqDist(node.point, query));
            const diff = coord(query, node.axis) - coord(node.point, node.axis);
            const near = diff < 0 ? node.left : node.right;
            const far = diff < 0 ? node.right : node.left;
            visit(near);
            if (diff * diff < worst()) visit(far);
        };
        visit(this.root);
        return heap.map((h) => h.point);
    }

    /** Todos os pontos dentro da caixa [minX,minY]–[maxX,maxY] (inclusive). */
    range(minX: number, minY: number, maxX: number, maxY: number): T[] {
        const out: T[] = [];
        if (!this.root) return out;
        const lo = { x: Math.min(minX, maxX), y: Math.min(minY, maxY) };
        const hi = { x: Math.max(minX, maxX), y: Math.max(minY, maxY) };
        const visit = (node: KdNode<T> | null): void => {
            if (!node) return;
            const p = node.point;
            if (p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y) out.push(p);
            const c = coord(p, node.axis);
            const loC = node.axis === 0 ? lo.x : lo.y;
            const hiC = node.axis === 0 ? hi.x : hi.y;
            if (loC <= c) visit(node.left); // pode haver candidatos à esquerda
            if (hiC >= c) visit(node.right);
        };
        visit(this.root);
        return out;
    }

    /** Todos os pontos a até `radius` de `query` (Euclidiano), do mais perto ao mais longe. */
    withinRadius(query: Point2D, radius: number): T[] {
        if (!Number.isFinite(radius) || radius < 0 || !this.root) return [];
        const r2 = radius * radius;
        const found: { point: T; sq: number }[] = [];
        const visit = (node: KdNode<T> | null): void => {
            if (!node) return;
            const d = sqDist(node.point, query);
            if (d <= r2) found.push({ point: node.point, sq: d });
            const diff = coord(query, node.axis) - coord(node.point, node.axis);
            const near = diff < 0 ? node.left : node.right;
            const far = diff < 0 ? node.right : node.left;
            visit(near);
            if (diff * diff <= r2) visit(far);
        };
        visit(this.root);
        found.sort((a, b) => a.sq - b.sq);
        return found.map((f) => f.point);
    }
}
