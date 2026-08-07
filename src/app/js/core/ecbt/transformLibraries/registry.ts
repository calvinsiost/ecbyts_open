// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Registry (Phase 2)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S2
 *
 * Phase 2 (2026-04-30) - registry canônico de libraries oficiais.
 *
 * Características:
 *   - `REGISTERED_LIBRARIES = Map<id, TransformLibrary>` - mutável apenas em bootstrap
 *   - `registerLibrary(library)` valida shape antes de adicionar; throw se duplicate
 *   - `getLibrary(id)` retorna entry ou null
 *   - `listLibraries({tags, type, author})` - filtros opcionais com intersect em tags
 *   - `listLibraryTags()` retorna Set único de tags
 *   - `freezeRegistry()` Object.freeze para garantir imutabilidade pós-bootstrap
 *   - `clearRegistry()` apenas para tests - NÃO usar em runtime
 *
 * Owner: Claude (orquestrador)
 */

import { TransformTypes } from './types.js';

const REGISTERED_LIBRARIES: Map<string, import('./types.js').TransformLibrary> = new Map();

let isFrozen = false;

const VALID_TYPES = new Set([TransformTypes.PURE, TransformTypes.ASYNC]);

/**
 * Valida shape mínimo de uma library - id, version, type, transform.
 * @param library
 */
function validateLibraryShape(library: any): { valid: boolean; errors: string[] } {
    const errors = [];
    if (library == null || typeof library !== 'object' || Array.isArray(library)) {
        errors.push('library must be a plain object');
        return { valid: false, errors };
    }
    if (typeof library.id !== 'string' || library.id.trim() === '') {
        errors.push('library.id must be a non-empty string');
    }
    if (typeof library.version !== 'string' || library.version.trim() === '') {
        errors.push('library.version must be a non-empty string');
    }
    if (!VALID_TYPES.has(library.type)) {
        errors.push(`library.type must be one of: ${Array.from(VALID_TYPES).join(', ')}`);
    }
    if (typeof library.transform !== 'function') {
        errors.push('library.transform must be a function');
    }
    if (library.tags !== undefined && !Array.isArray(library.tags)) {
        errors.push('library.tags must be an array if present');
    }
    if (library.author !== undefined && typeof library.author !== 'string') {
        errors.push('library.author must be a string if present');
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Registra uma library no registry global. Valida shape antes de inserir.
 * Throws se id já registrado, shape inválido, ou registry congelado.
 *
 * @param library
 * @returns a library registrada (referência idêntica)
 */
export function registerLibrary(
    library: import('./types.js').TransformLibrary,
): import('./types.js').TransformLibrary {
    if (isFrozen) {
        throw new Error('registry is frozen — cannot register new library after bootstrap');
    }
    const { valid, errors } = validateLibraryShape(library);
    if (!valid) {
        throw new Error(`invalid library shape: ${errors.join('; ')}`);
    }
    if (REGISTERED_LIBRARIES.has(library.id)) {
        throw new Error(`library with id '${library.id}' is already registered`);
    }
    REGISTERED_LIBRARIES.set(library.id, library);
    return library;
}

/**
 * Retorna a library registrada para o id, ou null se não existe.
 *
 * @param id
 */
export function getLibrary(id: string): import('./types.js').TransformLibrary | null {
    if (typeof id !== 'string' || id.trim() === '') return null;
    return REGISTERED_LIBRARIES.get(id) || null;
}

/**
 * Lista libraries registradas com filtros opcionais.
 *   - tags: array → match se library.tags contém TODAS as tags solicitadas (intersect)
 *   - type: 'pure'|'async'
 *   - author: string exata
 *
 * @param filters
 */
export function listLibraries(
    filters: { tags?: string[]; type?: string; author?: string } = {},
): import('./types.js').TransformLibrary[] {
    const all = Array.from(REGISTERED_LIBRARIES.values());
    if (!filters || typeof filters !== 'object') return all;

    const { tags, type, author } = filters;
    return all.filter((lib) => {
        if (type && lib.type !== type) return false;
        if (author && lib.author !== author) return false;
        if (Array.isArray(tags) && tags.length > 0) {
            const libTags = new Set(Array.isArray(lib.tags) ? lib.tags : []);
            for (const requested of tags) {
                if (!libTags.has(requested)) return false;
            }
        }
        return true;
    });
}

/**
 * Retorna Set de todas as tags únicas presentes em libraries registradas.
 */
export function listLibraryTags(): Set<string> {
    const tags = new Set<string>();
    for (const lib of REGISTERED_LIBRARIES.values()) {
        if (Array.isArray(lib.tags)) {
            for (const t of lib.tags) {
                if (typeof t === 'string' && t.trim() !== '') tags.add(t);
            }
        }
    }
    return tags;
}

/**
 * Congela o registry - após chamar isto, registerLibrary() throws.
 * Idempotente. Deve ser chamado uma única vez ao final do bootstrap de libraries oficiais.
 */
export function freezeRegistry(): void {
    isFrozen = true;
}

/**
 * Limpa o registry e descongela. **Apenas para uso em testes.**
 * NÃO importar/chamar em código de produção.
 */
export function clearRegistry(): void {
    REGISTERED_LIBRARIES.clear();
    isFrozen = false;
}

/**
 * Indica se o registry está congelado. Útil para tests e debugging.
 */
export function isRegistryFrozen(): boolean {
    return isFrozen;
}

/**
 * Retorna contagem de libraries registradas.
 */
export function registrySize(): number {
    return REGISTERED_LIBRARIES.size;
}

/**
 * Module identity export.
 */
export const ecbtTransformRegistryMeta = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES',
    phase: 2,
    deliveredAt: '2026-04-30',
    exports: [
        'registerLibrary',
        'getLibrary',
        'listLibraries',
        'listLibraryTags',
        'freezeRegistry',
        'clearRegistry',
        'isRegistryFrozen',
        'registrySize',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
};
