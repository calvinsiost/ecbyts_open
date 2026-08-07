// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Annotations - Phase 34 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S34
 *
 * Phase 34 (2026-05-02) - pure-logic anotações para pipeline steps.
 * Suporta 5 types: note (info), todo (action item), warning, deprecated,
 * security. Cada anotação tem author, timestamp, severity, body.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface AnnotationsSummary {
    total: number;
    byType: Record<string, number>;
    bySeverity: Record<string, number>;
    unresolvedCount: number;
    blockerCount: number;
}

/** Annotation types canônicos. */
export const ANNOTATION_TYPES = Object.freeze(['note', 'todo', 'warning', 'deprecated', 'security']);

/** Severity levels. */
export const SEVERITY_LEVELS = Object.freeze(['info', 'low', 'medium', 'high', 'critical']);

/** Default severity por type. */
export const DEFAULT_SEVERITY = Object.freeze({
    note: 'info',
    todo: 'low',
    warning: 'medium',
    deprecated: 'high',
    security: 'critical',
});

/** Identidade do módulo. */
export const ANNOTATIONS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 34,
    deliveredAt: '2026-05-02',
    types: ANNOTATION_TYPES,
});

/**
 * Verifica se type é canônico.
 */
export function isValidType(t: any): boolean {
    return typeof t === 'string' && ANNOTATION_TYPES.includes(t);
}

/**
 * Verifica se severity é canônica.
 */
export function isValidSeverity(s: any): boolean {
    return typeof s === 'string' && SEVERITY_LEVELS.includes(s);
}

/**
 * Cria annotation frozen.
 *
 * @param spec
 */
export function createAnnotation(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createAnnotation: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createAnnotation: id required');
    }
    if (!isValidType(spec.type)) {
        throw new TypeError(`createAnnotation: type must be one of ${ANNOTATION_TYPES.join(',')}`);
    }
    if (typeof spec.stepIndex !== 'number' || !Number.isInteger(spec.stepIndex) || spec.stepIndex < 0) {
        throw new TypeError('createAnnotation: stepIndex must be non-negative integer');
    }
    return Object.freeze({
        id: spec.id,
        type: spec.type,
        severity: isValidSeverity(spec.severity)
            ? spec.severity
            : (DEFAULT_SEVERITY as Record<string, string>)[spec.type],
        stepIndex: spec.stepIndex,
        body: spec.body || '',
        author: spec.author || null,
        createdAt: spec.createdAt || new Date().toISOString(),
        resolved: !!spec.resolved,
    });
}

/**
 * Adiciona annotation ao set existente.
 */
export function addAnnotation(annotations: any, annotation: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) annotations = [];
    if (!annotation) return Object.freeze([...annotations]);
    return Object.freeze([...annotations, Object.freeze({ ...annotation })]);
}

/**
 * Remove annotation por id.
 */
export function removeAnnotation(annotations: any, id: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze(annotations.filter((a) => a && a.id !== id));
}

/**
 * Marca annotation como resolved.
 */
export function resolveAnnotation(annotations: any, id: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze(
        annotations.map((a) => (a && a.id === id ? Object.freeze({ ...a, resolved: true }) : Object.freeze({ ...a }))),
    );
}

/**
 * Filtra annotations por step.
 */
export function annotationsForStep(annotations: any, stepIndex: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze(annotations.filter((a) => a && a.stepIndex === stepIndex));
}

/**
 * Filtra annotations por type.
 */
export function filterByType(annotations: any, type: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations) || !isValidType(type)) return [];
    return Object.freeze(annotations.filter((a) => a && a.type === type));
}

/**
 * Filtra annotations por severity.
 */
export function filterBySeverity(annotations: any, severity: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations) || !isValidSeverity(severity)) return [];
    return Object.freeze(annotations.filter((a) => a && a.severity === severity));
}

/**
 * Filtra annotations não-resolvidas.
 */
export function filterUnresolved(annotations: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze(annotations.filter((a) => a && !a.resolved));
}

/**
 * Severity ordinal (info < low < medium < high < critical).
 */
export function severityOrdinal(s: any): number {
    const idx = SEVERITY_LEVELS.indexOf(s);
    return idx === -1 ? 0 : idx;
}

/**
 * Sort annotations por severity desc.
 */
export function sortBySeverity(annotations: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze([...annotations].sort((a, b) => severityOrdinal(b?.severity) - severityOrdinal(a?.severity)));
}

/**
 * Detecta blockers (annotations type=security high+ ou deprecated).
 */
export function detectBlockers(annotations: any): ReadonlyArray<any> {
    if (!Array.isArray(annotations)) return [];
    return Object.freeze(
        annotations.filter((a) => {
            if (!a || a.resolved) return false;
            if (a.type === 'deprecated') return true;
            if (a.type === 'security' && severityOrdinal(a.severity) >= severityOrdinal('high')) return true;
            return false;
        }),
    );
}

/**
 * Sumariza annotation set.
 */
export function summarizeAnnotations(annotations: any): AnnotationsSummary {
    const empty: AnnotationsSummary = {
        total: 0,
        byType: {},
        bySeverity: {},
        unresolvedCount: 0,
        blockerCount: 0,
    };
    if (!Array.isArray(annotations) || annotations.length === 0) return empty;
    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let unresolved = 0;
    for (const a of annotations) {
        if (!a) continue;
        if (a.type) byType[a.type] = (byType[a.type] || 0) + 1;
        if (a.severity) bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
        if (!a.resolved) unresolved++;
    }
    return Object.freeze({
        total: annotations.length,
        byType,
        bySeverity,
        unresolvedCount: unresolved,
        blockerCount: detectBlockers(annotations).length,
    });
}

/**
 * Module identity export.
 */
export const pipelineAnnotationsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 34,
    deliveredAt: '2026-05-02',
    types: ANNOTATION_TYPES,
    exports: [
        'ANNOTATION_TYPES',
        'SEVERITY_LEVELS',
        'DEFAULT_SEVERITY',
        'ANNOTATIONS_META',
        'isValidType',
        'isValidSeverity',
        'createAnnotation',
        'addAnnotation',
        'removeAnnotation',
        'resolveAnnotation',
        'annotationsForStep',
        'filterByType',
        'filterBySeverity',
        'filterUnresolved',
        'severityOrdinal',
        'sortBySeverity',
        'detectBlockers',
        'summarizeAnnotations',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
