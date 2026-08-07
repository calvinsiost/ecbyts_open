// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ALGO-LIB recomendação R2 — Operações booleanas de polígono (runtime).

   União / interseção / diferença de polígonos para casos ambientais:
   sobreposição de plumas, interseção zona CETESB ∩ propriedade, diferença de
   áreas. NÃO adiciona dependência: reusa o Turf (@turf/turf@7.1.0) JÁ integrado
   (mesma versão de core/spatial/compliance), que internamente usa Martinez-Rueda.

   Helpers puros (bbox/área/normalização) ficam em _polygonBooleanPure.ts.
   As operações são assíncronas (lazy-load do Turf via importCDN).
   ================================================================ */

import { importCDN } from '../../utils/helpers/cdnLoader.js';
import { closeRing, bboxOf, bboxesOverlap, extractRings, type Ring } from './_polygonBooleanPure.js';

let _turf: any = null;
async function getTurf(): Promise<any> {
    if (_turf) return _turf;
    _turf = await importCDN('https://esm.sh/@turf/turf@7.1.0', { name: 'turf.js' });
    return _turf;
}

function toPolygonFeature(turf: any, ring: Ring): any {
    return turf.polygon([closeRing(ring)]);
}

/**
 * Interseção de dois polígonos (área comum). [] se não há sobreposição.
 * Rejeição rápida por bbox antes do cálculo caro.
 */
export async function polygonIntersection(a: Ring, b: Ring): Promise<Array<Array<[number, number]>>> {
    if (!bboxesOverlap(bboxOf(a), bboxOf(b))) return [];
    const turf = await getTurf();
    const result = turf.intersect(turf.featureCollection([toPolygonFeature(turf, a), toPolygonFeature(turf, b)]));
    return result ? extractRings(result) : [];
}

/** União de dois polígonos (área combinada). */
export async function polygonUnion(a: Ring, b: Ring): Promise<Array<Array<[number, number]>>> {
    const turf = await getTurf();
    const result = turf.union(turf.featureCollection([toPolygonFeature(turf, a), toPolygonFeature(turf, b)]));
    return result ? extractRings(result) : [];
}

/** Diferença a − b (parte de `a` fora de `b`). */
export async function polygonDifference(a: Ring, b: Ring): Promise<Array<Array<[number, number]>>> {
    if (!bboxesOverlap(bboxOf(a), bboxOf(b))) return [closeRing(a)];
    const turf = await getTurf();
    const result = turf.difference(turf.featureCollection([toPolygonFeature(turf, a), toPolygonFeature(turf, b)]));
    return result ? extractRings(result) : [];
}

export { closeRing, bboxOf, bboxesOverlap, ringArea, extractRings } from './_polygonBooleanPure.js';
export type { Ring, BBox } from './_polygonBooleanPure.js';
