// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Routing - Phase 1.45 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S45
 *
 * Phase 1.45 (2026-05-02) - pure-logic algoritmos para roteamento de
 * edges (orthogonal, curved, straight). Diferente de pathRouting (que
 * roteia entre nodes), aqui calcula GEOMETRIA de uma edge específica.
 *
 * NÃO depende de browser. Sem DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface Point2D {
    x: number;
    y: number;
}

export interface CurvedOptions {
    samples?: number;
    curvature?: number;
    direction?: string;
    axis?: string;
}

/** Estilos canônicos. */
export const ROUTING_STYLES = Object.freeze(['straight', 'orthogonal', 'curved', 'stepped']);

/** Identidade do módulo. */
export const ROUTING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.45',
    deliveredAt: '2026-05-02',
});

/**
 * Verifica se style é canônico.
 */
export function isValidStyle(style: unknown): boolean {
    return typeof style === 'string' && ROUTING_STYLES.includes(style);
}

/**
 * Roteamento straight - 2 pontos.
 */
export function routeStraight(
    p1: Point2D | null | undefined,
    p2: Point2D | null | undefined,
): ReadonlyArray<Readonly<Point2D>> {
    if (!p1 || !p2) return Object.freeze([]);
    return Object.freeze([
        Object.freeze({ x: p1.x, y: p1.y }),
        Object.freeze({ x: p2.x, y: p2.y }),
    ]);
}

/**
 * Roteamento orthogonal - 4 pontos via L-shape.
 * Direction='h' faz horizontal first, 'v' vertical first.
 */
export function routeOrthogonal(
    p1: Point2D | null | undefined,
    p2: Point2D | null | undefined,
    direction = 'h',
): ReadonlyArray<Readonly<Point2D>> {
    if (!p1 || !p2) return Object.freeze([]);
    const mid = direction === 'v'
        ? { x: p1.x, y: p2.y }
        : { x: p2.x, y: p1.y };
    return Object.freeze([
        Object.freeze({ x: p1.x, y: p1.y }),
        Object.freeze(mid),
        Object.freeze({ x: p2.x, y: p2.y }),
    ]);
}

/**
 * Roteamento stepped - Z-shape com elbow no meio.
 */
export function routeStepped(
    p1: Point2D | null | undefined,
    p2: Point2D | null | undefined,
    axis = 'h',
): ReadonlyArray<Readonly<Point2D>> {
    if (!p1 || !p2) return Object.freeze([]);
    if (axis === 'v') {
        const my = (p1.y + p2.y) / 2;
        return Object.freeze([
            Object.freeze({ x: p1.x, y: p1.y }),
            Object.freeze({ x: p1.x, y: my }),
            Object.freeze({ x: p2.x, y: my }),
            Object.freeze({ x: p2.x, y: p2.y }),
        ]);
    }
    const mx = (p1.x + p2.x) / 2;
    return Object.freeze([
        Object.freeze({ x: p1.x, y: p1.y }),
        Object.freeze({ x: mx, y: p1.y }),
        Object.freeze({ x: mx, y: p2.y }),
        Object.freeze({ x: p2.x, y: p2.y }),
    ]);
}

/**
 * Roteamento curved - sample N pontos em quadratic bezier com controle perpendicular.
 */
export function routeCurved(
    p1: Point2D | null | undefined,
    p2: Point2D | null | undefined,
    options: CurvedOptions = {},
): ReadonlyArray<Readonly<Point2D>> {
    if (!p1 || !p2) return Object.freeze([]);
    const optSamples = options.samples as number;
    const optCurvature = options.curvature as number;
    const samples = Number.isInteger(optSamples) && optSamples >= 2 ? optSamples : 16;
    const curvature = Number.isFinite(optCurvature) ? optCurvature : 0.3;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    // Perpendicular offset
    const cx = (p1.x + p2.x) / 2 + (-dy) * curvature;
    const cy = (p1.y + p2.y) / 2 + dx * curvature;
    const out: Array<Readonly<Point2D>> = [];
    for (let i = 0; i < samples; i++) {
        const t = i / (samples - 1);
        const it = 1 - t;
        const x = it * it * p1.x + 2 * it * t * cx + t * t * p2.x;
        const y = it * it * p1.y + 2 * it * t * cy + t * t * p2.y;
        out.push(Object.freeze({ x, y }));
    }
    return Object.freeze(out);
}

/**
 * Despacha por style.
 */
export function routeEdge(
    p1: Point2D | null | undefined,
    p2: Point2D | null | undefined,
    style = 'straight',
    options: CurvedOptions = {},
): ReadonlyArray<Readonly<Point2D>> {
    if (!isValidStyle(style)) return Object.freeze([]);
    switch (style) {
        case 'straight': return routeStraight(p1, p2);
        case 'orthogonal': return routeOrthogonal(p1, p2, options.direction);
        case 'stepped': return routeStepped(p1, p2, options.axis);
        case 'curved': return routeCurved(p1, p2, options);
        default: return Object.freeze([]);
    }
}

/**
 * Computa comprimento total do path.
 */
export function pathLength(points: ReadonlyArray<Point2D> | null | undefined): number {
    if (!Array.isArray(points) || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i];
        const b = points[i - 1];
        if (!a || !b) continue;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        total += Math.sqrt(dx * dx + dy * dy);
    }
    return total;
}

/**
 * Sumariza routing.
 */
export function summarizeRouting(
    points: ReadonlyArray<Point2D> | null | undefined,
): { points: number; length: number; segments: number } | Readonly<{ points: number; length: number; segments: number }> {
    const empty = { points: 0, length: 0, segments: 0 };
    if (!Array.isArray(points) || points.length === 0) return empty;
    return Object.freeze({
        points: points.length,
        length: pathLength(points),
        segments: Math.max(0, points.length - 1),
    });
}

/**
 * Module identity export.
 */
export const edgeRoutingMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.45',
    deliveredAt: '2026-05-02',
    exports: [
        'ROUTING_STYLES',
        'ROUTING_META',
        'isValidStyle',
        'routeStraight',
        'routeOrthogonal',
        'routeStepped',
        'routeCurved',
        'routeEdge',
        'pathLength',
        'summarizeRouting',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
