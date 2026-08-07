// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Library - add-provenance-defaults
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S2
 *
 * Para cada observation sem `provenance`, injeta default
 * `{ source: <defaultSource>, addedAt: <iso8601> }`.
 * Observations já com provenance são preservadas inalteradas.
 *
 * Config opcional:
 *   - defaultSource: string - override do source default ('unknown' por padrão)
 *
 * Tipo: pure | Tags: enrichment
 */

import { TransformTypes } from '../types.js';

export const addProvenanceDefaults: import('../types.js').TransformLibrary = Object.freeze({
    id: 'add-provenance-defaults',
    name: 'transform.addProvenanceDefaults.name',
    version: '1.0.0',
    type: TransformTypes.PURE,
    description: 'Inject provenance:{source,addedAt} on observations missing it',
    author: 'ecbyts',
    tags: ['enrichment'],
    configSchema: {
        type: 'object',
        properties: {
            defaultSource: { type: 'string' },
        },
    },
    transform: (model: any, config: any) => {
        if (!model || !Array.isArray(model.observations)) return model;
        const defaultSource =
            config && typeof config.defaultSource === 'string' && config.defaultSource.trim() !== ''
                ? config.defaultSource
                : 'unknown';
        const addedAt = new Date().toISOString();

        let mutated = false;
        const next = model.observations.map((obs: any) => {
            if (!obs || typeof obs !== 'object') return obs;
            if (obs.provenance != null) return obs;
            mutated = true;
            return { ...obs, provenance: { source: defaultSource, addedAt } };
        });
        if (!mutated) return model;
        return { ...model, observations: next };
    },
});

export default addProvenanceDefaults;
