// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   ECO1 MIGRATION v1 -> v2
   ================================================================

   v2 introduz campos de hierarquia espacial em cada elemento.
   Regras:
   - schemaVersion final = 2
   - cada elemento recebe hierarchy default, se ausente
   - objeto de entrada nao e mutado (runner ja clona)

   ================================================================ */

export interface Hierarchy {
    level?: string;
    parentId?: string | null;
    order?: number;
}

export interface MigrationElement {
    hierarchy?: Hierarchy;
    [key: string]: unknown;
}

export interface MigrationModel {
    schemaVersion?: number;
    elements?: MigrationElement[];
    [key: string]: unknown;
}

/**
 * Migra modelo ECO1 do schema v1 para v2.
 * / Migrate ECO1 model schema from v1 to v2.
 *
 * @param model - Modelo no formato v1
 * @returns Modelo migrado para v2
 */
export function migrateV1ToV2(model: Record<string, unknown>): MigrationModel {
    const next = (model || {}) as MigrationModel;
    const sourceElements = Array.isArray(next.elements) ? next.elements : [];

    next.elements = sourceElements.map((element: unknown, index: number): MigrationElement => {
        if (!element || typeof element !== 'object' || Array.isArray(element)) {
            return element as MigrationElement;
        }
        return _withDefaultHierarchy(element as MigrationElement, index);
    });

    next.schemaVersion = 2;
    return next;
}

/**
 * Garante hierarchy valida em um elemento.
 * / Ensure valid default hierarchy on element.
 *
 * @param element - Elemento ECO1
 * @param index - Posicao no array para order default
 * @returns Elemento com hierarchy normalizada
 */
function _withDefaultHierarchy(element: MigrationElement, index: number): MigrationElement {
    const hierarchy = element.hierarchy && typeof element.hierarchy === 'object' ? element.hierarchy : {};

    return {
        ...element,
        hierarchy: {
            level: typeof hierarchy.level === 'string' ? hierarchy.level : 'element',
            parentId: typeof hierarchy.parentId === 'string' ? hierarchy.parentId : null,
            order: typeof hierarchy.order === 'number' && Number.isFinite(hierarchy.order) ? hierarchy.order : index,
        },
    };
}