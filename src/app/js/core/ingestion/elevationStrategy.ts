// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   ELEVATION STRATEGY HELPERS (pure)
   Resolve como posicionar Y (cota) no momento da importacao.
   ================================================================ */

export interface ElevationResolveArgs {
    strategy?: 'file' | 'dem' | 'zero' | string;
    hasElevation?: boolean;
    projectedElevation?: number;
    defaultElevation?: number;
}

/**
 * Resolve elevacao final de um ponto importado.
 */
export function resolveElevationValue(args: ElevationResolveArgs | null | undefined): number {
    const strategy = args?.strategy || 'file';
    const hasElevation = !!args?.hasElevation;
    const projectedElevation = Number(args?.projectedElevation || 0);
    const defaultElevation = Number(args?.defaultElevation ?? 0);

    if (strategy === 'zero') return 0;

    // DEM: nesta etapa de ingestao, posiciona no baseline.
    // O ajuste final pode ocorrer no pos-processamento de terreno.
    if (strategy === 'dem') return 0;

    // file (padrao): usa cota importada quando disponivel.
    if (hasElevation) return projectedElevation;
    return defaultElevation;
}
