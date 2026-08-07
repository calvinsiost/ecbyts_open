// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Library - deduplicate-observations
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S2
 *
 * Remove observations duplicadas pela chave (elementId, parameter, date).
 * Mantém a primeira ocorrência (FIFO); preserva ordem das demais.
 * Observations sem chave completa (qualquer um dos 3 campos ausente)
 * passam direto sem dedup - não confundir "ausência" com colisão.
 *
 * Tipo: pure | Tags: normalization
 */

import { TransformTypes } from '../types.js';

/**
 * Constrói chave canônica (string) de uma observation, ou null se incompleta.
 */
function dedupKey(obs: Record<string, any>): string | null {
    if (!obs || typeof obs !== 'object') return null;
    const { elementId, parameter, date } = obs;
    if (elementId == null || parameter == null || date == null) return null;
    if (elementId === '' || parameter === '' || date === '') return null;
    return `${String(elementId)}::${String(parameter)}::${String(date)}`;
}

export const deduplicateObservations: import('../types.js').TransformLibrary = Object.freeze({
    id: 'deduplicate-observations',
    name: 'transform.deduplicateObservations.name',
    version: '1.0.0',
    type: TransformTypes.PURE,
    description: 'Remove duplicate observations by (elementId, parameter, date)',
    author: 'ecbyts',
    tags: ['normalization'],
    transform: (model: any): any => {
        if (!model || !Array.isArray(model.observations)) return model;
        const seen = new Set<string>();
        const result: any[] = [];
        for (const obs of model.observations) {
            const key = dedupKey(obs);
            if (key == null) {
                result.push(obs); // chave incompleta — passa sem dedup
                continue;
            }
            if (seen.has(key)) continue; // duplicata — descarta
            seen.add(key);
            result.push(obs);
        }
        if (result.length === model.observations.length) return model; // nada mudou
        return { ...model, observations: result };
    },
});

export default deduplicateObservations;
