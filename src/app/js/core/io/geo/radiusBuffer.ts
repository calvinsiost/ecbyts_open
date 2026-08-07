// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Buffer de raio (CETESB DD 038/2017) — pure-logic geoespacial. Determina quais
// elementos estão dentro de um raio (default 500 m) a partir de um centro, usando
// distância euclidiana no plano horizontal (x/z) das coordenadas relativas em metros
// (ver core/io/geo/coordinates: relativeToUTM trata rel como metros).
//
// Atende os requisitos "raio de 500 m a partir dos limites da área" da Avaliação
// Preliminar (Cap 4: poços de abastecimento; uso e ocupação do solo no entorno).

// TRUST-010 W11 adoption — registry de frameworks regulatórios.
import { getActiveFramework } from '../../validation/regulatoryFrameworks.js';

/** Raio canônico do Gerenciamento de Áreas Contaminadas CETESB (DD 038/2017). */
export const DEFAULT_GAC_RADIUS_M = 500;

/**
 * TRUST-010 W11 adoption — retorna o raio padrão do framework regulatório ativo.
 * Sem feature flag setada (`localStorage['ecbyts-active-regulatory-framework']`),
 * `getActiveFramework()` retorna CETESB DD-038 (default = 500m, backward compat).
 * Com flag US → 1609m (1mi Phase I ESA); EU → 500m; JP → 250m.
 *
 * Caller deve usar este getter em vez de `DEFAULT_GAC_RADIUS_M` direto sempre
 * que o raio for derivar do framework jurisdicional (ex: relatório de Avaliação
 * Preliminar). `DEFAULT_GAC_RADIUS_M` permanece exportado para usos hard-codados
 * CETESB-only (testes, fixtures BR).
 */
export function getActiveBufferRadiusM(): number {
    try {
        const fw = getActiveFramework();
        return typeof fw?.defaultBufferRadiusM === 'number' ? fw.defaultBufferRadiusM : DEFAULT_GAC_RADIUS_M;
    } catch (e) {
        console.debug('[radiusBuffer:getActive]', (e as any)?.message || e);
        return DEFAULT_GAC_RADIUS_M;
    }
}

export type RelPoint = { x?: number; y?: number; z?: number };

/** Distância horizontal (plano x/z) em metros entre dois pontos relativos. */
export function distanceRelMeters(a: RelPoint, b: RelPoint): number {
    const dx = (a?.x ?? 0) - (b?.x ?? 0);
    const dz = (a?.z ?? 0) - (b?.z ?? 0);
    return Math.sqrt(dx * dx + dz * dz);
}

/** Centroide (média) das posições relativas de uma lista de elementos; null se vazia. */
export function computeCentroid(elements: any[]): RelPoint | null {
    const pts = (Array.isArray(elements) ? elements : []).map((e) => e?.position).filter((p) => p && typeof p === 'object');
    if (pts.length === 0) return null;
    const sum = pts.reduce(
        (acc: RelPoint, p: RelPoint) => ({ x: (acc.x as number) + (p.x || 0), y: (acc.y as number) + (p.y || 0), z: (acc.z as number) + (p.z || 0) }),
        { x: 0, y: 0, z: 0 },
    );
    const n = pts.length;
    return { x: (sum.x as number) / n, y: (sum.y as number) / n, z: (sum.z as number) / n };
}

/** Filtra os elementos cuja posição está dentro de `radiusM` do centro (inclusive). */
export function elementsWithinRadius(center: RelPoint, elements: any[], radiusM = DEFAULT_GAC_RADIUS_M): any[] {
    if (!center || !Array.isArray(elements)) return [];
    const r = typeof radiusM === 'number' && radiusM > 0 ? radiusM : DEFAULT_GAC_RADIUS_M;
    return elements.filter((el) => {
        const p = el?.position;
        if (!p || typeof p !== 'object') return false;
        return distanceRelMeters(center, p) <= r;
    });
}

export type RadiusSummary = { total: number; radiusM: number; byFamily: Record<string, number> };

/** Resume os elementos dentro do raio: total + contagem por família. */
export function summarizeWithinRadius(center: RelPoint, elements: any[], radiusM = DEFAULT_GAC_RADIUS_M): RadiusSummary {
    const r = typeof radiusM === 'number' && radiusM > 0 ? radiusM : DEFAULT_GAC_RADIUS_M;
    const within = elementsWithinRadius(center, elements, r);
    const byFamily: Record<string, number> = {};
    for (const el of within) {
        const f = String(el?.family || 'unknown');
        byFamily[f] = (byFamily[f] || 0) + 1;
    }
    return { total: within.length, radiusM: r, byFamily };
}

/**
 * Conveniência: dado o conjunto de elementos, usa o centroide de TODOS como centro e
 * resume os que estão no raio. Útil quando não há um centro explícito (Cap 4 Fase I).
 */
export function summarizeAroundCentroid(elements: any[], radiusM = DEFAULT_GAC_RADIUS_M): RadiusSummary | null {
    const center = computeCentroid(elements);
    if (!center) return null;
    return summarizeWithinRadius(center, elements, radiusM);
}
