// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Selection Box - Phase 1.34 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S34
 *
 * Phase 1.34 (2026-05-02) - pure-logic rectangle drag-select para
 * mass-select de nodes. Suporta modes: replace/add/subtract/intersect
 * via modifier keys (shift/alt/ctrl).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Selection modes canônicos. */
export const SELECTION_MODES = Object.freeze(['replace', 'add', 'subtract', 'intersect']);

/** Identidade do módulo. */
export const SELECTION_BOX_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.34',
    deliveredAt: '2026-05-02',
    modes: SELECTION_MODES,
});

/**
 * Verifica se mode é canônico.
 */
export function isValidMode( m: any) {
    return typeof m === 'string' && SELECTION_MODES.includes(m);
}

/**
 * Cria selection box frozen a partir de 2 pontos.
 *
 * @param {any} startPoint
 * @param {any} endPoint
 * @returns {any}
 */
export function buildBox(startPoint: any, endPoint: any): any {
    if (!startPoint || !endPoint) {
        return Object.freeze({ minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 });
    }
    const sx = Number.isFinite(startPoint.x) ? startPoint.x : 0;
    const sy = Number.isFinite(startPoint.y) ? startPoint.y : 0;
    const ex = Number.isFinite(endPoint.x) ? endPoint.x : 0;
    const ey = Number.isFinite(endPoint.y) ? endPoint.y : 0;
    const minX = Math.min(sx, ex);
    const maxX = Math.max(sx, ex);
    const minY = Math.min(sy, ey);
    const maxY = Math.max(sy, ey);
    return Object.freeze({
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    });
}

/**
 * Verifica se ponto está dentro da box.
 */
export function isPointInBox( point: any, box: any) {
    if (!point || !box) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    return point.x >= box.minX && point.x <= box.maxX && point.y >= box.minY && point.y <= box.maxY;
}

/**
 * Mode keyboard modifier → mode mapping.
 * @param {any} [modifiers]
 */
export function modeFromModifiers(modifiers: any = {}) {
    if (modifiers.shift && modifiers.alt) return 'intersect';
    if (modifiers.shift) return 'add';
    if (modifiers.alt) return 'subtract';
    return 'replace';
}

/**
 * Encontra nodes contidos na box.
 *
 * @param {any[]} nodes
 * @param {any} box
 * @returns {readonly string[]} IDs de nodes selecionados
 */
export function findNodesInBox(nodes: any[], box: any): readonly string[] {
    if (!Array.isArray(nodes) || !box) return ([] as any);
    return (Object.freeze(nodes.filter((n) => n && n.id && isPointInBox(n, box)).map((n) => n.id)) as any);
}

/**
 * Aplica mode na seleção atual.
 *
 * @param {any[]} currentSelection
 * @param {any[]} boxSelection
 * @param {string} mode
 * @returns {readonly string[]}
 */
export function applyMode(currentSelection: any[], boxSelection: any[], mode: string): readonly string[] {
    const current = Array.isArray(currentSelection) ? currentSelection : [];
    const box = Array.isArray(boxSelection) ? boxSelection : [];
    if (!isValidMode(mode)) mode = 'replace';

    if (mode === 'replace') return (Object.freeze([...box]) as any);
    if (mode === 'add') {
        const set = new Set([...current, ...box]);
        return (Object.freeze([...set]) as any);
    }
    if (mode === 'subtract') {
        const removeSet = new Set(box);
        return (Object.freeze(current.filter((id) => !removeSet.has(id))) as any);
    }
    if (mode === 'intersect') {
        const boxSet = new Set(box);
        return (Object.freeze(current.filter((id) => boxSet.has(id))) as any);
    }
    return (Object.freeze([...current]) as any);
}

/**
 * Executa drag-select completo: build box + find nodes + apply mode.
 *
 * @param {any} state
 * @returns {any}
 */
export function performDragSelect(state: any): any {
    if (!state) {
        return Object.freeze({
            box: null,
            selectedIds: [],
            mode: 'replace',
            finalSelection: [],
        });
    }
    const box = buildBox(state.startPoint, state.endPoint);
    const selectedIds = findNodesInBox(state.nodes || [], box);
    const mode = modeFromModifiers(state.modifiers || {});
    const finalSelection = applyMode(state.currentSelection || [], (selectedIds as any), mode);
    return Object.freeze({
        box,
        selectedIds,
        mode,
        finalSelection,
    });
}

/**
 * Detecta se a box é grande o suficiente para ser uma drag-select intencional
 * (filtra clicks acidentais < threshold).
 */
export function isMeaningfulDrag( box: any, minPixels = 4) {
    if (!box) return false;
    return box.width >= minPixels || box.height >= minPixels;
}

/**
 * Computa area da box.
 */
export function boxArea( box: any) {
    if (!box) return 0;
    return (box.width || 0) * (box.height || 0);
}

/**
 * Sumariza drag-select result.
 */
export function summarizeDragSelect( result: any) {
    const empty = {
        boxArea: 0,
        selectedCount: 0,
        finalCount: 0,
        mode: 'replace',
    };
    if (!result) return empty;
    return Object.freeze({
        boxArea: boxArea(result.box),
        selectedCount: Array.isArray(result.selectedIds) ? result.selectedIds.length : 0,
        finalCount: Array.isArray(result.finalSelection) ? result.finalSelection.length : 0,
        mode: result.mode || 'replace',
    });
}

/**
 * Module identity export.
 */
export const selectionBoxMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.34',
    deliveredAt: '2026-05-02',
    modes: SELECTION_MODES,
    exports: [
        'SELECTION_MODES',
        'SELECTION_BOX_META',
        'isValidMode',
        'buildBox',
        'isPointInBox',
        'modeFromModifiers',
        'findNodesInBox',
        'applyMode',
        'performDragSelect',
        'isMeaningfulDrag',
        'boxArea',
        'summarizeDragSelect',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
