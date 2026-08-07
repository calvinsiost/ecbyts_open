// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Library - sort-campaigns-by-date
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S2
 *
 * Garante ordenação cronológica crescente de campaigns.
 * Campaigns sem `date` (ou date inválida) vão para o fim, mantendo ordem relativa.
 *
 * Tipo: pure | Tags: normalization
 */

import { TransformTypes } from '../types.js';

/**
 * Parse robusto de date - retorna timestamp em ms, ou null se inválido.
 */
function toTimestamp(d: any): number | null {
    if (d == null || d === '') return null;
    const t = new Date(d).getTime();
    return Number.isFinite(t) ? t : null;
}

export const sortCampaignsByDate: import('../types.js').TransformLibrary = Object.freeze({
    id: 'sort-campaigns-by-date',
    name: 'transform.sortCampaignsByDate.name',
    version: '1.0.0',
    type: TransformTypes.PURE,
    description: 'Sort campaigns chronologically; undated campaigns at end',
    author: 'ecbyts',
    tags: ['normalization'],
    transform: (model: any) => {
        if (!model || !Array.isArray(model.campaigns)) return model;
        const indexed = model.campaigns.map((c: any, idx: any) => ({
            c,
            idx: idx as any,
            t: toTimestamp((c as any)?.date),
        }));
        indexed.sort((a: any, b: any) => {
            // Datadas primeiro, ASC; sem-data ao fim mantendo ordem relativa
            if (a.t == null && b.t == null) return a.idx - b.idx;
            if (a.t == null) return 1;
            if (b.t == null) return -1;
            if (a.t === b.t) return a.idx - b.idx;
            return a.t - b.t;
        });
        return { ...model, campaigns: indexed.map((x: any) => x.c) };
    },
});

export default sortCampaignsByDate;
