// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB R2 — Helpers pure-logic para operações booleanas de polígono.

   Parte testável (sem CDN) do adapter polygonBoolean: normalização de anel,
   bounding box, rejeição rápida por bbox, área (shoelace) e extração de anéis
   de geometrias GeoJSON. As operações booleanas em si vivem em polygonBoolean.ts
   (lazy-load do Turf). Determinístico; sem DOM/rede.
   ================================================================ */

export type Ring = ReadonlyArray<readonly [number, number]>;
export interface BBox {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

/** Fecha o anel (primeiro ponto == último) se ainda não estiver fechado. */
export function closeRing(ring: Ring): Array<[number, number]> {
    if (!Array.isArray(ring) || ring.length < 3) {
        throw new RangeError('closeRing: anel precisa de ≥ 3 pontos');
    }
    const out = ring.map((p) => [p[0], p[1]] as [number, number]);
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
    return out;
}

/** Bounding box de um anel. */
export function bboxOf(ring: Ring): BBox {
    if (!Array.isArray(ring) || ring.length === 0) {
        throw new RangeError('bboxOf: anel vazio');
    }
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return Object.freeze({ minX, minY, maxX, maxY });
}

/** True se os bounding boxes se sobrepõem (rejeição rápida antes do boolean caro). */
export function bboxesOverlap(a: BBox, b: BBox): boolean {
    return !(a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY);
}

/** Área do polígono pela fórmula do cadarço (shoelace), em unidades² da entrada. */
export function ringArea(ring: Ring): number {
    const r = closeRing(ring);
    let s = 0;
    for (let i = 0; i < r.length - 1; i++) {
        s += r[i]![0] * r[i + 1]![1] - r[i + 1]![0] * r[i]![1];
    }
    return Math.abs(s) / 2;
}

/** Extrai os anéis externos de uma Feature GeoJSON Polygon/MultiPolygon. */
export function extractRings(geom: unknown): Array<Array<[number, number]>> {
    const g = (geom as { geometry?: { type?: string; coordinates?: unknown } })?.geometry;
    if (!g) return [];
    if (g.type === 'Polygon') return [(g.coordinates as [number, number][][])[0]!];
    if (g.type === 'MultiPolygon') {
        return (g.coordinates as [number, number][][][]).map((poly) => poly[0]!);
    }
    return [];
}
