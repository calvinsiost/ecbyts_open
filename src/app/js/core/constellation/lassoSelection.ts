// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Lasso Selection - Phase 1.22 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S22
 *
 * Phase 1.22 (2026-05-01) - pure-logic lasso (free-form polygon)
 * selection. Permite usuário desenhar uma forma livre e selecionar
 * todos os nodes dentro dela.
 *
 * Estratégia:
 *   - LassoPath: array de pontos (x,y) traçados
 *   - Smoothing: opcional decimation por distância mínima
 *   - Closure: connect last → first se close-form
 *   - Hit-test: pointInPolygon ray-casting
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const LASSO_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.22',
    deliveredAt: '2026-05-01',
});

/**
 * Cria lasso path frozen.
 *
 * @param {Array<{x: number, y: number}>} points
 * @param {{ minDistance?: number, closed?: boolean }} [options]
 * @returns {{points: any, closed: boolean, length: number}}
 */
export function createLassoPath(points: Array<{x: number, y: number}>, options: { minDistance?: number, closed?: boolean } = {}): {points: any, closed: boolean, length: number} {
    const valid = Array.isArray(points) ? points.filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
    const minDistance = Number.isFinite(options.minDistance) && (options.minDistance as number) > 0 ? (options.minDistance as number) : 2;
    const closed = options.closed !== false;

    // Decimation: skip points closer than minDistance
    const decimated = [];
    for (const p of valid) {
        const last = decimated[decimated.length - 1];
        if (!last) {
            decimated.push(Object.freeze({ x: p.x, y: p.y }));
            continue;
        }
        const dx = p.x - last.x;
        const dy = p.y - last.y;
        if (dx * dx + dy * dy >= minDistance * minDistance) {
            decimated.push(Object.freeze({ x: p.x, y: p.y }));
        }
    }

    return Object.freeze({
        points: Object.freeze(decimated),
        closed,
        length: decimated.length,
    });
}

/**
 * Hit-test: ponto está dentro do lasso (ray casting).
 *
 * @param {{x: number, y: number}} point
 * @param {Record<string, any>} lasso - output de createLassoPath
 * @returns {boolean}
 */
export function isInLasso(point: {x: number, y: number}, lasso: Record<string, any>): boolean {
    if (!point || !lasso || !Array.isArray(lasso.points)) return false;
    if (lasso.points.length < 3) return false;
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    const polygon = lasso.points;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const pi = polygon[i];
        const pj = polygon[j];
        if (pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x) {
            inside = !inside;
        }
    }
    return inside;
}

/**
 * Seleciona nodes dentro do lasso.
 *
 * @param {Array<{id: string, x: number, y: number}>} nodes
 * @param {Record<string, any>} lasso
 * @returns {ReadonlyArray<string>} node IDs selecionados
 */
export function selectInLasso(nodes: Array<{id: string, x: number, y: number}>, lasso: Record<string, any>): ReadonlyArray<string> {
    if (!Array.isArray(nodes) || !lasso) return [];
        const selected: string[]= [];
    for (const node of nodes) {
        if (!node || !node.id) continue;
        if (isInLasso(node, lasso)) {
            selected.push(node.id);
        }
    }
    return Object.freeze(selected);
}

/**
 * Calcula bounding box do lasso.
 *
 * @param {Record<string, any>} lasso
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null}
 */
export function lassoBounds(lasso: Record<string, any>): {minX: number, minY: number, maxX: number, maxY: number}|null {
    if (!lasso || !Array.isArray(lasso.points) || lasso.points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of lasso.points) {
        if (!p) continue;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return Object.freeze({ minX, minY, maxX, maxY });
}

/**
 * Calcula área aproximada (shoelace).
 */
export function lassoArea( lasso: any) {
    if (!lasso || !Array.isArray(lasso.points) || lasso.points.length < 3) return 0;
    const polygon = lasso.points;
    let sum = 0;
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (!a || !b) continue;
        sum += (a.x || 0) * (b.y || 0) - (b.x || 0) * (a.y || 0);
    }
    return Math.abs(sum) / 2;
}

/**
 * Verifica se lasso é válido (≥3 pontos não-colineares + área > 0).
 *
 * @param {Record<string, any>} lasso
 * @returns {{valid: boolean, reason?: string}}
 */
export function validateLasso(lasso: Record<string, any>): {valid: boolean, reason?: string} {
    if (!lasso || !Array.isArray(lasso.points)) {
        return Object.freeze({ valid: false, reason: 'invalid_lasso' });
    }
    if (lasso.points.length < 3) {
        return Object.freeze({ valid: false, reason: 'too_few_points' });
    }
    const area = lassoArea(lasso);
    if (area <= 0) {
        return Object.freeze({ valid: false, reason: 'zero_area' });
    }
    return Object.freeze({ valid: true });
}

/**
 * Combina dois lassos via union (ambos selecionam).
 * Não computa polygon union - apenas combina selections.
 *
 * @param {Array<string>} selectionA
 * @param {Array<string>} selectionB
 * @returns {Array<string>}
 */
export function unionSelections(selectionA: Array<string>, selectionB: Array<string>): Array<string> {
    if (!Array.isArray(selectionA) && !Array.isArray(selectionB)) return [];
        const set: Set<string>= new Set();
    if (Array.isArray(selectionA)) for (const id of selectionA) if (id) set.add(id);
    if (Array.isArray(selectionB)) for (const id of selectionB) if (id) set.add(id);
    return (Object.freeze([...set]) as string[]);
}

/**
 * Intersect: ids presentes em ambos.
 */
export function intersectSelections( selectionA: any, selectionB: any) {
    if (!Array.isArray(selectionA) || !Array.isArray(selectionB)) return [];
    const setB = new Set(selectionB);
    return Object.freeze(selectionA.filter((id) => setB.has(id)));
}

/**
 * Sumariza lasso.
 */
export function summarizeLasso( lasso: any) {
    const empty = { length: 0, area: 0, bounds: null, valid: false };
    if (!lasso) return empty;
    const v = validateLasso(lasso);
    return Object.freeze({
        length: lasso.length || 0,
        area: lassoArea(lasso),
        bounds: lassoBounds(lasso),
        valid: v.valid,
        reason: v.reason || null,
    });
}

/**
 * Module identity export.
 */
export const lassoSelectionMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.22',
    deliveredAt: '2026-05-01',
    exports: [
        'LASSO_META',
        'createLassoPath',
        'isInLasso',
        'selectInLasso',
        'lassoBounds',
        'lassoArea',
        'validateLasso',
        'unionSelections',
        'intersectSelections',
        'summarizeLasso',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
