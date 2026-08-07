// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Technical References module - public API
 * Módulo de referências técnicas/normativas do produto.
 */

export {
    REFERENCE_TYPES,
    createReference,
    filterByType,
    filterByModule,
    searchReferences,
} from './referencesSchema.js';

export { CORE_REFERENCES } from './coreReferences.js';
