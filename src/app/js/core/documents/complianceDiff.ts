// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Diff - Phase 4 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S7
 *
 * Phase 4 (2026-05-01) - pure-logic helpers para comparar duas
 * revisões de um documento e produzir diff estruturado.
 * Complementa:
 *   - Phase 1 validator (validation engine)
 *   - Phase 2 store (provenance + revision FSM)
 *   - Phase 3 audit log (event tracking)
 *
 * Estratégia:
 *   - Diff em nível de campo (added/removed/changed)
 *   - Profundidade configurável (shallow ou recursivo)
 *   - Detecção de mudanças significantes vs cosméticas (whitespace)
 *   - Summary statistics (count + severity)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

const MAX_DIFF_DEPTH = 8;

/** Identidade do diff. */
export const COMPLIANCE_DIFF_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 4,
    deliveredAt: '2026-05-01',
    maxDepth: MAX_DIFF_DEPTH,
});

/** Tipos de mudança em diff. */
export const CHANGE_TYPES = Object.freeze({
    ADDED: 'added',
    REMOVED: 'removed',
    CHANGED: 'changed',
    UNCHANGED: 'unchanged',
});

/**
 * Compara dois objetos e produz lista de mudanças.
 *
 * @param {Object} oldDoc
 * @param {Object} newDoc
 * @param {Object} [options]
 * @param {string} [options.path] - caminho atual (default '')
 * @param {number} [options.depth] - profundidade atual (default 0)
 * @param {boolean} [options.ignoreWhitespace] - trata strings só por trim
 * @returns {Array<{path: string, type: string, oldValue?: *, newValue?: *, note?: string}>}
 */
export function diffDocuments(oldDoc: Object, newDoc: Object, options: { path?: string; depth?: number; ignoreWhitespace?: boolean } = {}): Array<{path: string, type: string, oldValue?: any, newValue?: any, note?: string}> {
    const path = options.path || '';
    const depth = options.depth || 0;
    const ignoreWhitespace = !!options.ignoreWhitespace;
    const _oldDoc = (oldDoc as any);
    const _newDoc = (newDoc as any);

    if (depth > MAX_DIFF_DEPTH) {
        return [{ path, type: CHANGE_TYPES.CHANGED, note: 'max-depth-reached' }];
    }

        const changes: any[]= [];

    // Lidar com null/undefined
    if (oldDoc === undefined && newDoc === undefined) return changes;
    if (oldDoc === undefined && newDoc !== undefined) {
        return [{ path, type: CHANGE_TYPES.ADDED, newValue: newDoc }];
    }
    if (oldDoc !== undefined && newDoc === undefined) {
        return [{ path, type: CHANGE_TYPES.REMOVED, oldValue: oldDoc }];
    }

    // Tipos primitivos ou null
    const oldType = typeof oldDoc;
    const newType = typeof newDoc;
    if (oldDoc === null || newDoc === null || oldType !== 'object' || newType !== 'object') {
        if (_primitivesEqual(oldDoc, newDoc, ignoreWhitespace)) return changes;
        return [{ path, type: CHANGE_TYPES.CHANGED, oldValue: oldDoc, newValue: newDoc }];
    }

    // Arrays vs objetos: precisam ser do mesmo tipo
    const oldIsArray = Array.isArray(oldDoc);
    const newIsArray = Array.isArray(newDoc);
    if (oldIsArray !== newIsArray) {
        return [{ path, type: CHANGE_TYPES.CHANGED, oldValue: oldDoc, newValue: newDoc }];
    }

    if (oldIsArray) {
        const maxLen = Math.max(_oldDoc.length, _newDoc.length);
        for (let i = 0; i < maxLen; i++) {
            const childPath = path ? `${path}[${i}]` : `[${i}]`;
            const sub = diffDocuments(_oldDoc[i], _newDoc[i], {
                path: childPath,
                depth: depth + 1,
                ignoreWhitespace,
            });
            changes.push(...sub);
        }
        return changes;
    }

    // Objetos
    const allKeys = new Set([...Object.keys(_oldDoc), ...Object.keys(_newDoc)]);
    for (const key of allKeys) {
        const childPath = path ? `${path}.${key}` : key;
        const sub = diffDocuments(_oldDoc[key], _newDoc[key], {
            path: childPath,
            depth: depth + 1,
            ignoreWhitespace,
        });
        changes.push(...sub);
    }
    return changes;
}

function _primitivesEqual( a: any, b: any, ignoreWhitespace: any) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a === 'string' && typeof b === 'string' && ignoreWhitespace) {
        return a.trim() === b.trim();
    }
    return false;
}

/**
 * Sumário estatístico de uma lista de changes.
 *
 * @param {Array<any>} changes
 * @returns {{total: number, added: number, removed: number, changed: number, paths: Array<string>}}
 */
export function summarizeDiff(changes: Array<any>): {total: number, added: number, removed: number, changed: number, paths: Array<string>} {
    if (!Array.isArray(changes)) {
        return { total: 0, added: 0, removed: 0, changed: 0, paths: [] };
    }
    let added = 0;
    let removed = 0;
    let changed = 0;
        const paths: string[]= [];
    for (const c of changes) {
        if (!c) continue;
        if (c.type === CHANGE_TYPES.ADDED) added++;
        else if (c.type === CHANGE_TYPES.REMOVED) removed++;
        else if (c.type === CHANGE_TYPES.CHANGED) changed++;
        if (c.path) paths.push(c.path);
    }
    return {
        total: added + removed + changed,
        added,
        removed,
        changed,
        paths,
    };
}

/**
 * Filtra changes por tipo.
 *
 * @param {Array<any>} changes
 * @param {string} type - uma de CHANGE_TYPES
 * @returns {Array<any>}
 */
export function filterChangesByType(changes: Array<any>, type: string): Array<any> {
    if (!Array.isArray(changes)) return [];
    if (!Object.values(CHANGE_TYPES).includes((type as any))) return [];
    return changes.filter((c) => c && c.type === type);
}

/**
 * Filtra changes por padrão de path (substring case-sensitive).
 *
 * @param {Array<any>} changes
 * @param {string} pathPattern
 * @returns {Array<any>}
 */
export function filterChangesByPath(changes: Array<any>, pathPattern: string): Array<any> {
    if (!Array.isArray(changes)) return [];
    const pattern = String(pathPattern || '');
    if (!pattern) return [...changes];
    return changes.filter((c) => c && c.path && c.path.includes(pattern));
}

/**
 * Detecta se uma mudança é "significant" (não-cosmética).
 * - Whitespace-only changes em strings são cosméticas
 * - Reordenação de keys não é detectada (não-significativa por design)
 *
 * @param {Record<string, any>} change
 * @returns {boolean}
 */
export function isSignificantChange(change: Record<string, any>): boolean {
    if (!change || typeof change !== 'object') return false;
    if (change.type !== CHANGE_TYPES.CHANGED) return true; // added/removed sempre significativo
    const a = change.oldValue;
    const b = change.newValue;
    if (typeof a === 'string' && typeof b === 'string' && a.trim() === b.trim()) {
        return false; // só whitespace
    }
    return true;
}

/**
 * Computa diff "compacto" - só mudanças significativas.
 *
 * @param {Object} oldDoc
 * @param {Object} newDoc
 * @returns {Array<any>}
 */
export function diffSignificantChanges(oldDoc: Object, newDoc: Object): Array<any> {
    const all = diffDocuments(oldDoc, newDoc);
    return all.filter(isSignificantChange);
}

/**
 * Compara duas revisões e produz objeto enriquecido com summary.
 *
 * @param {Object} oldDoc
 * @param {Object} newDoc
 * @param {Object} [options]
 * @returns {{changes: Array<any>, summary: Object, hasSignificantChanges: boolean}}
 */
export function compareRevisions(oldDoc: Object, newDoc: Object, options: Object = {}): {changes: Array<any>, summary: Object, hasSignificantChanges: boolean} {
    const changes = diffDocuments(oldDoc, newDoc, options);
    const summary = summarizeDiff(changes);
    const hasSignificantChanges = changes.some(isSignificantChange);
    return { changes, summary, hasSignificantChanges };
}

/**
 * Module identity export.
 */
export const complianceDiffMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 4,
    deliveredAt: '2026-05-01',
    maxDepth: MAX_DIFF_DEPTH,
    exports: [
        'COMPLIANCE_DIFF_META',
        'CHANGE_TYPES',
        'diffDocuments',
        'summarizeDiff',
        'filterChangesByType',
        'filterChangesByPath',
        'isSignificantChange',
        'diffSignificantChanges',
        'compareRevisions',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
