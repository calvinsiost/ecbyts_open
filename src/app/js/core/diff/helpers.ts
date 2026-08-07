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
   DIFF HELPERS — Utility functions for structural comparison
   Funcoes auxiliares para comparacao estrutural de modelos

   FUNCOES:
   - deepEqual: Igualdade estrutural profunda
   - deepClone: Copia profunda segura para JSON
   - buildIdMap: Mapa indexado por ID para busca rapida
   - describePath: Descricao legivel de caminhos no modelo
   ================================================================ */

export type ChangeType = 'added' | 'removed' | 'modified' | 'type_mismatch';

export interface DiffChange {
    readonly path: string[];
    readonly type: ChangeType;
    readonly valueA: unknown;
    readonly valueB: unknown;
}

/**
 * Deep structural equality comparison.
 * Compara dois valores recursivamente, ignorando ordem de chaves.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
        if (!Array.isArray(b) || a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i])) return false;
        }
        return true;
    }

    if (typeof a === 'object') {
        const objA = a as Record<string, unknown>;
        const objB = b as Record<string, unknown>;
        const keysA = Object.keys(objA);
        const keysB = Object.keys(objB);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
            if (!Object.prototype.hasOwnProperty.call(objB, key)) return false;
            if (!deepEqual(objA[key], objB[key])) return false;
        }
        return true;
    }

    return false;
}

/**
 * Deep clone via JSON serialization.
 * Copia profunda segura — funciona para qualquer dado serializavel.
 */
export function deepClone<T>(obj: T): T {
    if (obj == null || typeof obj !== 'object') return obj;
    return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * Build an ID-indexed Map from an array of objects.
 * Cria mapa indexado por ID para busca O(1).
 */
export function buildIdMap<T extends { id?: string | number }>(
    array: readonly T[] | unknown,
): Map<string | number, T> {
    const map = new Map<string | number, T>();
    if (!Array.isArray(array)) return map;
    for (const item of array as readonly T[]) {
        if (item && item.id != null) {
            map.set(item.id, item);
        }
    }
    return map;
}

/**
 * Build an ID-indexed Map using a custom key field.
 * Util para elementos que usam campo diferente de 'id'.
 */
export function buildIdMapByField<T extends Record<string, unknown>>(
    array: readonly T[] | unknown,
    keyField: string,
): Map<string, T> {
    const map = new Map<string, T>();
    if (!Array.isArray(array)) return map;
    for (const item of array as readonly T[]) {
        if (item && item[keyField] != null) {
            map.set(String(item[keyField]), item);
        }
    }
    return map;
}

/**
 * Describe a diff path in human-readable form.
 * Gera descricao legivel do caminho no modelo.
 *
 * @example
 * describePath(['elements', 'PM-01', 'data', 'coordinates', 'easting'])
 * // => "Element PM-01 > Coordinates > easting"
 */
export function describePath(pathParts: readonly string[] | null | undefined): string {
    if (!pathParts || pathParts.length === 0) return '';

    const labels: Readonly<Record<string, string>> = {
        project: 'Project',
        coordinate: 'Coordinates',
        families: 'Families',
        elements: 'Elements',
        edges: 'Edges',
        campaigns: 'Campaigns',
        scenes: 'Scenes',
        view: 'View',
        data: 'Data',
        coordinates: 'Position',
        construction: 'Construction',
        observations: 'Observations',
        stamps: 'Connections',
        financial: 'Financial',
        parties: 'Parties',
        disbursements: 'Disbursements',
        bonusMalus: 'Bonus/Malus',
        baseline: 'Baseline',
        planned: 'Planned',
        actual: 'Actual',
    };

    return pathParts.map((p) => labels[p] || p).join(' > ');
}

/**
 * Get the type label for a diff change.
 * Retorna rotulo do tipo de mudanca.
 */
export function changeTypeLabel(type: string): string {
    const labels: Readonly<Record<string, string>> = {
        added: 'Added',
        removed: 'Removed',
        modified: 'Modified',
        type_mismatch: 'Type Mismatch',
    };
    return labels[type] || type;
}

function keyInObject(obj: Record<string, unknown> | null | undefined, key: string): boolean {
    return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}

function pushRemoved(
    changes: DiffChange[],
    objA: Record<string, unknown>,
    key: string,
    path: string[],
): void {
    changes.push({ path, type: 'removed', valueA: objA[key], valueB: undefined });
}

function pushAdded(
    changes: DiffChange[],
    objB: Record<string, unknown>,
    key: string,
    path: string[],
): void {
    changes.push({ path, type: 'added', valueA: undefined, valueB: objB[key] });
}

function pushTypeMismatch(changes: DiffChange[], vA: unknown, vB: unknown, path: string[]): void {
    changes.push({ path, type: 'type_mismatch', valueA: vA, valueB: vB });
}

function pushModified(changes: DiffChange[], vA: unknown, vB: unknown, path: string[]): void {
    changes.push({ path, type: 'modified', valueA: vA, valueB: vB });
}

function diffNestedObjects(
    vA: unknown,
    vB: unknown,
    path: string[],
): DiffChange[] {
    if (Array.isArray(vA) !== Array.isArray(vB)) {
        return [{ path, type: 'type_mismatch', valueA: vA, valueB: vB }];
    }
    if (!deepEqual(vA, vB)) {
        return diffFlatObjects(
            vA as Record<string, unknown>,
            vB as Record<string, unknown>,
            path,
        );
    }
    return [];
}

function diffKey(
    objA: Record<string, unknown> | null | undefined,
    objB: Record<string, unknown> | null | undefined,
    key: string,
    basePath: readonly string[],
): DiffChange[] {
    const inA = keyInObject(objA, key);
    const inB = keyInObject(objB, key);
    const path = [...basePath, key];

    if (inA && !inB) {
        return [{ path, type: 'removed', valueA: (objA as Record<string, unknown>)[key], valueB: undefined }];
    }
    if (!inA && inB) {
        return [{ path, type: 'added', valueA: undefined, valueB: (objB as Record<string, unknown>)[key] }];
    }
    if (!inA || !inB) {
        return [];
    }

    const vA = (objA as Record<string, unknown>)[key];
    const vB = (objB as Record<string, unknown>)[key];

    if (typeof vA !== typeof vB) {
        return [{ path, type: 'type_mismatch', valueA: vA, valueB: vB }];
    }
    if (typeof vA === 'object' && vA !== null) {
        return diffNestedObjects(vA, vB, path);
    }
    if (vA !== vB) {
        return [{ path, type: 'modified', valueA: vA, valueB: vB }];
    }
    return [];
}

/**
 * Diff two flat objects and return list of changes.
 * Compara dois objetos simples campo a campo.
 */
export function diffFlatObjects(
    objA: Record<string, unknown> | null | undefined,
    objB: Record<string, unknown> | null | undefined,
    basePath: readonly string[] = [],
): DiffChange[] {
    const allKeys = new Set<string>([
        ...Object.keys(objA || {}),
        ...Object.keys(objB || {}),
    ]);

    const changes: DiffChange[] = [];
    for (const key of allKeys) {
        const nested = diffKey(objA, objB, key, basePath);
        changes.push(...nested);
    }

    return changes;
}
