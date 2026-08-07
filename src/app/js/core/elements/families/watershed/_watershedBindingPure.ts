// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WATERSHED-FAMILY-001 — Amarração família 'watershed' ↔ algoritmo D8 (R3).
   Pure-logic (sub-módulo de família, sem DOM).

   Liga um ELEMENTO da família 'watershed' (que carrega um ponto de exutório e
   uma grade de elevação do terreno) ao motor hidrológico em core/hydrology:
   calcula a bacia de contribuição, sua área e o talvegue. É a "cola" que o
   WatershedModule (UI, F2) consome.

   Determinístico; sem DOM/rede.
   ================================================================ */

import { computeFlowDirections, computeFlowAccumulation, type Grid } from '../../../hydrology/_d8FlowPure.js';
import { delineateWatershed, traceFlowPath, type WatershedResult } from '../../../hydrology/_watershedPure.js';

export interface WatershedElementInput {
    /** Grade de elevação do terreno (DEM). */
    readonly terrain: Grid;
    /** Ponto de exutório em coordenadas de célula. */
    readonly pourX: number;
    readonly pourY: number;
    /** Tamanho da célula em metros (para a área). Default 1. */
    readonly cellSize?: number;
    /** Se true, também devolve a acumulação de fluxo (canais). Default false. */
    readonly withAccumulation?: boolean;
}

export interface WatershedComputed extends WatershedResult {
    /** Talvegue (caminho de escoamento) a partir do exutório, índices de célula. */
    readonly flowPath: number[];
    /** Acumulação de fluxo (se solicitada), senão null. */
    readonly accumulation: Float64Array | null;
    readonly width: number;
    readonly height: number;
}

/**
 * Calcula a bacia hidrográfica de um elemento 'watershed' a partir do terreno
 * e do ponto de exutório. Esta é a amarração canônica família ↔ algoritmo.
 */
export function computeWatershedForElement(input: WatershedElementInput): WatershedComputed {
    if (!input || !input.terrain) throw new TypeError('computeWatershedForElement: terrain ausente');
    const { terrain, pourX, pourY } = input;
    const cellSize = input.cellSize ?? 1;
    const dir = computeFlowDirections(terrain);
    const ws = delineateWatershed(dir, terrain.width, terrain.height, pourX, pourY, cellSize);
    const flowPath = traceFlowPath(dir, terrain.width, terrain.height, pourX, pourY);
    const accumulation = input.withAccumulation
        ? computeFlowAccumulation(dir, terrain.width, terrain.height)
        : null;
    return Object.freeze({
        ...ws,
        flowPath,
        accumulation,
        width: terrain.width,
        height: terrain.height,
    });
}

/** Resumo legível para o painel/relatório (não-DOM). */
export function summarizeWatershed(c: WatershedComputed, cellSize = 1): string {
    const km2 = c.area / 1_000_000;
    const areaTxt = km2 >= 0.01 ? `${km2.toFixed(2)} km²` : `${Math.round(c.area)} m²`;
    return `Bacia: ${c.cellCount} células (${areaTxt}); talvegue de ${c.flowPath.length} células; resolução ${cellSize} m.`;
}
