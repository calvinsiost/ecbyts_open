// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Diff (Phase 11)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S11
 *
 * Phase 11 (2026-05-01) - pure-logic helpers para comparar 2 pipelines
 * (lista de stepConfigs) lado a lado, classificar cada step como
 * unchanged/added/removed/changed/moved, e gerar relatório textual.
 *
 * Estratégia:
 *   - Ordem importa: cada step é identificado pela tupla (libraryId, position)
 *   - Move detection: step com mesmo libraryId+config mas position diferente
 *   - Config change: mesma posição, mesmo libraryId, config diferente
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Tipos de mudança em pipeline diff. */
export const PIPELINE_CHANGE_TYPES = Object.freeze({
    UNCHANGED: 'unchanged',
    ADDED: 'added',
    REMOVED: 'removed',
    CHANGED: 'changed', // mesmo libraryId, config diferente
    MOVED: 'moved', // mesmo libraryId+config, posição diferente
});

/** Identidade do módulo. */
export const PIPELINE_DIFF_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 11,
    deliveredAt: '2026-05-01',
    changeTypes: Object.values(PIPELINE_CHANGE_TYPES),
});

/**
 * Compara configs profundamente (deep equality).
 *
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function configsEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    return JSON.stringify(_canonicalize(a)) === JSON.stringify(_canonicalize(b));
}

/**
 * @param {any} value
 * @returns {any}
 */
function _canonicalize(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(_canonicalize);
    if (typeof value === 'object') {
        const sorted = ({} as Record<string, any>);
        for (const k of Object.keys(value).sort()) {
            sorted[k] = _canonicalize(value[k]);
        }
        return sorted;
    }
    return value;
}

/**
 * Compara 2 pipelines step a step.
 *
 * Algoritmo:
 *   1. Tenta match posicional (mesma posição em ambos).
 *   2. Para steps removidos/adicionados, tenta match por libraryId+config (move).
 *   3. Resto vira added/removed.
 *
 * @param {Array<{libraryId: string, config?: Object}>} oldSteps
 * @param {Array<{libraryId: string, config?: Object}>} newSteps
 * @returns {Array<{type: string, oldIndex?: number, newIndex?: number, oldStep?: Object, newStep?: Object}>}
 */
export function diffPipelines(oldSteps: Array<{libraryId: string, config?: Object}>, newSteps: Array<{libraryId: string, config?: Object}>): Array<{type: string, oldIndex?: number, newIndex?: number, oldStep?: Object, newStep?: Object}> {
    if (!Array.isArray(oldSteps)) oldSteps = [];
    if (!Array.isArray(newSteps)) newSteps = [];

    const changes: any[] = [];
    const usedNew = new Set();
    const usedOld = new Set();

    // Pass 1: match posicional (mesma posição).
    const minLen = Math.min(oldSteps.length, newSteps.length);
    for (let i = 0; i < minLen; i++) {
        const a = oldSteps[i];
        const b = newSteps[i];
        if (!a || !b) continue;
        if (a.libraryId === b.libraryId) {
            if (configsEqual(a.config || {}, b.config || {})) {
                changes.push({
                    type: PIPELINE_CHANGE_TYPES.UNCHANGED,
                    oldIndex: i,
                    newIndex: i,
                    oldStep: a,
                    newStep: b,
                });
            } else {
                changes.push({
                    type: PIPELINE_CHANGE_TYPES.CHANGED,
                    oldIndex: i,
                    newIndex: i,
                    oldStep: a,
                    newStep: b,
                });
            }
            usedOld.add(i);
            usedNew.add(i);
        }
    }

    // Pass 2: move detection (mesmo libraryId+config em posições diferentes).
    for (let i = 0; i < oldSteps.length; i++) {
        if (usedOld.has(i)) continue;
        const a = oldSteps[i];
        if (!a) continue;
        for (let j = 0; j < newSteps.length; j++) {
            if (usedNew.has(j)) continue;
            const b = newSteps[j];
            if (!b) continue;
            if (a.libraryId === b.libraryId && configsEqual(a.config || {}, b.config || {})) {
                changes.push({
                    type: PIPELINE_CHANGE_TYPES.MOVED,
                    oldIndex: i,
                    newIndex: j,
                    oldStep: a,
                    newStep: b,
                });
                usedOld.add(i);
                usedNew.add(j);
                break;
            }
        }
    }

    // Pass 3: removed (não match em new).
    for (let i = 0; i < oldSteps.length; i++) {
        if (usedOld.has(i)) continue;
        if (!oldSteps[i]) continue;
        changes.push({
            type: PIPELINE_CHANGE_TYPES.REMOVED,
            oldIndex: i,
            oldStep: oldSteps[i],
        });
    }

    // Pass 4: added (não match em old).
    for (let j = 0; j < newSteps.length; j++) {
        if (usedNew.has(j)) continue;
        if (!newSteps[j]) continue;
        changes.push({
            type: PIPELINE_CHANGE_TYPES.ADDED,
            newIndex: j,
            newStep: newSteps[j],
        });
    }

    return changes;
}

/**
 * Sumário do diff.
 *
 * @param {any[]} changes
 * @returns {{total: number, unchanged: number, added: number, removed: number, changed: number, moved: number, hasChanges: boolean}}
 */
export function summarizePipelineDiff(changes: any[]): {total: number, unchanged: number, added: number, removed: number, changed: number, moved: number, hasChanges: boolean} {
    if (!Array.isArray(changes)) {
        return { total: 0, unchanged: 0, added: 0, removed: 0, changed: 0, moved: 0, hasChanges: false };
    }
    const counts: { unchanged: number; added: number; removed: number; changed: number; moved: number } = {
        unchanged: 0,
        added: 0,
        removed: 0,
        changed: 0,
        moved: 0,
    };
    const countsIdx = (counts as Record<string, number>);
    for (const c of changes) {
        if (!c || !c.type) continue;
        if (countsIdx[c.type] !== undefined) countsIdx[c.type] = (countsIdx[c.type] ?? 0) + 1;
    }
    const total = counts.unchanged + counts.added + counts.removed + counts.changed + counts.moved;
    const hasChanges = counts.added + counts.removed + counts.changed + counts.moved > 0;
    return {
        total,
        unchanged: counts.unchanged,
        added: counts.added,
        removed: counts.removed,
        changed: counts.changed,
        moved: counts.moved,
        hasChanges,
    };
}

/**
 * Filtra changes por tipo.
 *
 * @param {any[]} changes
 * @param {string} type
 * @returns {any[]}
 */
export function filterPipelineChangesByType(changes: any[], type: string): any[] {
    if (!Array.isArray(changes)) return [];
    if (!Object.values(PIPELINE_CHANGE_TYPES).includes((type as any))) return [];
    return changes.filter((c) => c && c.type === type);
}

/**
 * Detecta se 2 pipelines são funcionalmente idênticos
 * (ignora apenas movimentação se requireSameOrder=false).
 *
 * @param {any[]} oldSteps
 * @param {any[]} newSteps
 * @param {Object} [options]
 * @param {boolean} [options.requireSameOrder=true]
 * @returns {boolean}
 */
export function pipelinesEqual(oldSteps: any[], newSteps: any[], options: { requireSameOrder?: boolean } = {}): boolean {
    const requireSameOrder = options.requireSameOrder !== false;
    const changes = diffPipelines(oldSteps, newSteps);
    const summary = summarizePipelineDiff(changes);
    if (summary.added + summary.removed + summary.changed > 0) return false;
    if (requireSameOrder && summary.moved > 0) return false;
    return true;
}

/**
 * Render textual do diff (formato git-style: + - M ↕).
 *
 * @param {any[]} changes
 * @returns {string}
 */
export function renderPipelineDiffText(changes: any[]): string {
    if (!Array.isArray(changes) || changes.length === 0) return '(no changes)';
    const lines = [];
    // Sort por (oldIndex || newIndex) para apresentação cronológica
    const sorted = [...changes].sort((a, b) => {
        const ai = a.oldIndex ?? a.newIndex ?? 0;
        const bi = b.oldIndex ?? b.newIndex ?? 0;
        return ai - bi;
    });
    for (const c of sorted) {
        const id = (c.newStep || c.oldStep)?.libraryId || '<unknown>';
        switch (c.type) {
            case PIPELINE_CHANGE_TYPES.UNCHANGED:
                lines.push(`  [${c.oldIndex}] ${id}`);
                break;
            case PIPELINE_CHANGE_TYPES.ADDED:
                lines.push(`+ [${c.newIndex}] ${id}`);
                break;
            case PIPELINE_CHANGE_TYPES.REMOVED:
                lines.push(`- [${c.oldIndex}] ${id}`);
                break;
            case PIPELINE_CHANGE_TYPES.CHANGED:
                lines.push(`M [${c.oldIndex}→${c.newIndex}] ${id} (config changed)`);
                break;
            case PIPELINE_CHANGE_TYPES.MOVED:
                lines.push(`↕ [${c.oldIndex}→${c.newIndex}] ${id}`);
                break;
        }
    }
    return lines.join('\n');
}

/**
 * Module identity export.
 */
export const pipelineDiffMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 11,
    deliveredAt: '2026-05-01',
    changeTypes: Object.values(PIPELINE_CHANGE_TYPES),
    exports: [
        'PIPELINE_CHANGE_TYPES',
        'PIPELINE_DIFF_META',
        'diffPipelines',
        'summarizePipelineDiff',
        'filterPipelineChangesByType',
        'pipelinesEqual',
        'renderPipelineDiffText',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
