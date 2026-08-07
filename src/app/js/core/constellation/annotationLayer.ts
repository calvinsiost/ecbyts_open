// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Annotation Layer - Phase 1.25 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S25
 *
 * Phase 1.25 (2026-05-01) - pure-logic annotation primitives para
 * constelação: text labels, arrows, callouts. Inclui collision
 * detection entre annotations.
 *
 * Estratégia:
 *   - 4 annotation types: label / arrow / callout / region
 *   - Bounding box computation per annotation
 *   - Collision detection AABB
 *   - Z-order management
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Annotation types canônicos. */
export const ANNOTATION_TYPES = Object.freeze(['label', 'arrow', 'callout', 'region']);

/** Identidade do módulo. */
export const ANNOTATION_LAYER_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.25',
    deliveredAt: '2026-05-01',
    types: ANNOTATION_TYPES,
});

/**
 * Verifica se type é canônico.
 */
export function isValidType(type: any) {
    return typeof type === 'string' && ANNOTATION_TYPES.includes(type);
}

/**
 * Cria annotation frozen.
 *
 * @param {Record<string, any>} spec
 * @returns {Object}
 */
export function createAnnotation(spec: Record<string, any>): Object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createAnnotation: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createAnnotation: id required');
    }
    if (!isValidType(spec.type)) {
        throw new TypeError(`createAnnotation: type must be one of ${ANNOTATION_TYPES.join(',')}`);
    }
    return Object.freeze({
        id: spec.id,
        type: spec.type,
        text: spec.text || '',
        x: Number.isFinite(spec.x) ? spec.x : 0,
        y: Number.isFinite(spec.y) ? spec.y : 0,
        width: Number.isFinite(spec.width) ? spec.width : 0,
        height: Number.isFinite(spec.height) ? spec.height : 0,
        // Arrow-specific
        endX: Number.isFinite(spec.endX) ? spec.endX : null,
        endY: Number.isFinite(spec.endY) ? spec.endY : null,
        // Style
        zOrder: Number.isInteger(spec.zOrder) ? spec.zOrder : 0,
        targetId: spec.targetId || null,
        metadata: spec.metadata ? Object.freeze({ ...spec.metadata }) : null,
    });
}

/**
 * Computa bounding box AABB de annotation.
 *
 * @param {Record<string, any>} annotation
 * @returns {any}
 */
export function getBounds(annotation: Record<string, any>): any {
    if (!annotation || typeof annotation !== 'object') return null;
    const x = Number.isFinite(annotation.x) ? annotation.x : 0;
    const y = Number.isFinite(annotation.y) ? annotation.y : 0;

    if (annotation.type === 'arrow') {
        const endX = Number.isFinite(annotation.endX) ? annotation.endX : x;
        const endY = Number.isFinite(annotation.endY) ? annotation.endY : y;
        return Object.freeze({
            minX: Math.min(x, endX),
            minY: Math.min(y, endY),
            maxX: Math.max(x, endX),
            maxY: Math.max(y, endY),
        });
    }
    const w = Number.isFinite(annotation.width) ? annotation.width : 0;
    const h = Number.isFinite(annotation.height) ? annotation.height : 0;
    return Object.freeze({
        minX: x,
        minY: y,
        maxX: x + w,
        maxY: y + h,
    });
}

/**
 * Verifica se 2 bounds intersectam.
 */
export function boundsIntersect(a: any, b: any) {
    if (!a || !b) return false;
    return !(a.maxX < b.minX || a.minX > b.maxX || a.maxY < b.minY || a.minY > b.maxY);
}

/**
 * Detecta colisões entre par de annotations.
 *
 * @param {Record<string, any>} a
 * @param {Record<string, any>} any>
 * @returns {boolean}
 */
export function annotationsCollide(a: Record<string, any>, b: Record<string, any>): boolean {
    if (!a || !b) return false;
    if (a.id === b.id) return false; // não colide consigo mesmo
    return boundsIntersect(getBounds(a), getBounds(b));
}

/**
 * Encontra todas as colisões em lista de annotations.
 *
 * @param {any} annotations
 * @returns {any}
 */
export function findCollisions(annotations: any): any {
    if (!Array.isArray(annotations)) return [];
        const out: any[]= [];
    for (let i = 0; i < annotations.length; i++) {
        for (let j = i + 1; j < annotations.length; j++) {
            if (annotationsCollide(annotations[i], annotations[j])) {
                out.push({ a: (annotations[i] as any).id, b: (annotations[j] as any).id });
            }
        }
    }
    return Object.freeze(out);
}

/**
 * Sort annotations por zOrder (asc) - caller renderiza in this order.
 */
export function sortByZOrder(annotations: any) {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze(
        [...annotations]
            .filter(Boolean)
            .sort((a: any, b: any) => (a.zOrder || 0) - (b.zOrder || 0)),
    );
}

/**
 * Filtra annotations dentro de viewport.
 */
export function filterInViewport(annotations: any, viewport: any) {
    if (!Array.isArray(annotations) || !viewport) return [];
    return annotations.filter((a) => {
        if (!a) return false;
        const b = getBounds(a);
        if (!b) return false;
        return boundsIntersect(b, viewport);
    });
}

/**
 * Remove annotations sobrepostas (mantém maior zOrder).
 *
 * @param {any} annotations
 * @returns {any}
 */
export function deduplicateOverlapping(annotations: any): any {
    if (!Array.isArray(annotations)) return [];
    // Sort by zOrder desc, keep first non-overlapping
    const sorted = [...annotations]
        .filter(Boolean)
        .sort((a: any, b: any) => (b.zOrder || 0) - (a.zOrder || 0));
        const kept: any[]= [];
    for (const ann of sorted) {
        const overlaps = kept.some((other: any) => annotationsCollide(ann, other));
        if (!overlaps) kept.push(ann);
    }
    return Object.freeze(kept);
}

/**
 * Sumariza annotation layer.
 */
export function summarizeLayer(annotations: any) {
    const empty = {
        total: 0,
        byType: {},
        collisionCount: 0,
        minZOrder: 0,
        maxZOrder: 0,
    };
    if (!Array.isArray(annotations) || annotations.length === 0) return empty;
        const byType: any= {};
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const a of annotations) {
        if (!a) continue;
        if (a.type) byType[a.type] = (byType[a.type] || 0) + 1;
        if (Number.isFinite(a.zOrder)) {
            if (a.zOrder < minZ) minZ = a.zOrder;
            if (a.zOrder > maxZ) maxZ = a.zOrder;
        }
    }
    const collisions = findCollisions(annotations);
    return Object.freeze({
        total: annotations.length,
        byType,
        collisionCount: collisions.length,
        minZOrder: Number.isFinite(minZ) ? minZ : 0,
        maxZOrder: Number.isFinite(maxZ) ? maxZ : 0,
    });
}

/**
 * Module identity export.
 */
export const annotationLayerMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.25',
    deliveredAt: '2026-05-01',
    types: ANNOTATION_TYPES,
    exports: [
        'ANNOTATION_TYPES',
        'ANNOTATION_LAYER_META',
        'isValidType',
        'createAnnotation',
        'getBounds',
        'boundsIntersect',
        'annotationsCollide',
        'findCollisions',
        'sortByZOrder',
        'filterInViewport',
        'deduplicateOverlapping',
        'summarizeLayer',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
