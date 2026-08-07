// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Bundling - Phase 1.26 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S26
 *
 * Phase 1.26 (2026-05-01) - pure-logic force-directed edge bundling
 * para reduzir visual clutter em grafos densos. Implementa simplified
 * FDEB (Holten & van Wijk 2009) sem dependências de browser.
 *
 * Estratégia:
 *   - Subdivide cada edge em N control points
 *   - Aplica spring forces entre control points consecutivos
 *   - Aplica electrostatic forces entre edges compatíveis
 *   - Itera até convergência ou max iterations
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Identidade do módulo. */
export const EDGE_BUNDLING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.26',
    deliveredAt: '2026-05-01',
});

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    subdivisions: 6,
    iterations: 30,
    stiffness: 0.1,
    compatibilityThreshold: 0.6,
    stepSize: 0.04,
});

/**
 * Computa distância euclidiana entre 2 pontos.
 */
export function euclidean( a: any, b: any) {
    if (!a || !b) return 0;
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Subdivide edge em N control points uniformes.
 *
 * @param {Record<string, any>} edge {sx, sy, tx, ty}
 * @param {number} any>
 * @returns {Array<{x:number,y:number}>}
 */
export function subdivideEdge(edge: Record<string, any>, n: number): Array<{x:number,y:number}> {
    if (!edge) return [];
    const subdivisions = Number.isInteger(n) && n > 0 ? n : DEFAULT_CONFIG.subdivisions;
    const out = [];
    const sx = edge.sx || 0;
    const sy = edge.sy || 0;
    const tx = edge.tx || 0;
    const ty = edge.ty || 0;
    for (let i = 0; i <= subdivisions; i++) {
        const t = i / subdivisions;
        out.push(Object.freeze({ x: sx + (tx - sx) * t, y: sy + (ty - sy) * t }));
    }
    return out;
}

/**
 * Verifica compatibilidade entre 2 edges (angular + scale + position).
 *
 * @param {Record<string, any>} a {sx, sy, tx, ty}
 * @param {Record<string, any>} any>
 * @returns {number} 0..1
 */
export function compatibility(a: Record<string, any>, b: Record<string, any>): number {
    if (!a || !b) return 0;
    const lA = euclidean({ x: a.sx, y: a.sy }, { x: a.tx, y: a.ty });
    const lB = euclidean({ x: b.sx, y: b.sy }, { x: b.tx, y: b.ty });
    if (lA === 0 || lB === 0) return 0;

    // Angle compatibility (cosine of angle between vectors)
    const dxA = a.tx - a.sx;
    const dyA = a.ty - a.sy;
    const dxB = b.tx - b.sx;
    const dyB = b.ty - b.sy;
    const dot = dxA * dxB + dyA * dyB;
    const angleComp = Math.abs(dot / (lA * lB));

    // Scale compatibility
    const lAvg = (lA + lB) / 2;
    const scaleComp = 2 / (lAvg / Math.min(lA, lB) + Math.max(lA, lB) / lAvg);

    // Position compatibility
    const midA = { x: (a.sx + a.tx) / 2, y: (a.sy + a.ty) / 2 };
    const midB = { x: (b.sx + b.tx) / 2, y: (b.sy + b.ty) / 2 };
    const distance = euclidean(midA, midB);
    const positionComp = lAvg / (lAvg + distance);

    return angleComp * scaleComp * positionComp;
}

/**
 * Acha pares de edges compatíveis acima do threshold.
 *
 * @param {Array<Object>} edges
 * @param {number} threshold
 * @returns {Array<{a:number,b:number,comp:number}>}
 */
export function findCompatiblePairs(edges: Array<Object>, threshold: number = DEFAULT_CONFIG.compatibilityThreshold): Array<{a:number,b:number,comp:number}> {
    if (!Array.isArray(edges)) return [];
        const out: Array<{a:number,b:number,comp:number}>= [];
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            const c = compatibility(edges[i] as Record<string, any>, edges[j] as Record<string, any>);
            if (c >= threshold) {
                out.push(Object.freeze({ a: i, b: j, comp: c }));
            }
        }
    }
    return (Object.freeze(out) as any);
}

/**
 * Aplica spring force entre control points consecutivos.
 *
 * @param {Array<{x:number,y:number}>} points
 * @param {number} stiffness
 * @returns {Array<{fx:number,fy:number}>}
 */
export function springForces(points: Array<{x:number,y:number}>, stiffness: number = DEFAULT_CONFIG.stiffness): Array<{fx:number,fy:number}> {
    if (!Array.isArray(points) || points.length < 3) return [];
    const forces = points.map(() => ({ fx: 0, fy: 0 }));
    // Skip endpoints (0 and last); they are anchors
    for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1]!;
        const curr = points[i]!;
        const next = points[i + 1]!;
        forces[i]!.fx += (prev.x - curr.x) * stiffness;
        forces[i]!.fy += (prev.y - curr.y) * stiffness;
        forces[i]!.fx += (next.x - curr.x) * stiffness;
        forces[i]!.fy += (next.y - curr.y) * stiffness;
    }
    return forces;
}

/**
 * Aplica electrostatic force entre 2 sets de control points.
 *
 * @param {Array<{x:number,y:number}>} pointsA
 * @param {Array<{x:number,y:number}>} pointsB
 * @param {number} comp
 * @returns {Array<{fx:number,fy:number}>} forces para pointsA
 */
export function electrostaticForces(pointsA: Array<{x:number,y:number}>, pointsB: Array<{x:number,y:number}>, comp: number): Array<{fx:number,fy:number}> {
    if (!Array.isArray(pointsA) || !Array.isArray(pointsB)) return [];
    if (pointsA.length !== pointsB.length) return pointsA.map(() => ({ fx: 0, fy: 0 }));
    const forces = pointsA.map(() => ({ fx: 0, fy: 0 }));
    // Skip endpoints
    for (let i = 1; i < pointsA.length - 1; i++) {
        const a = pointsA[i]!;
        const b = pointsB[i]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = comp / dist;
        forces[i]!.fx += (dx / dist) * force;
        forces[i]!.fy += (dy / dist) * force;
    }
    return forces;
}

/**
 * Aplica forces a control points (preserva endpoints).
 *
 * @param {Array<{x:number,y:number}>} points
 * @param {Array<{fx:number,fy:number}>} forces
 * @param {number} stepSize
 * @returns {Array<{x:number,y:number}>}
 */
export function applyForces(points: Array<{x:number,y:number}>, forces: Array<{fx:number,fy:number}>, stepSize: number = DEFAULT_CONFIG.stepSize): Array<{x:number,y:number}> {
    if (!Array.isArray(points) || !Array.isArray(forces)) return points || [];
    const out = [];
    for (let i = 0; i < points.length; i++) {
        if (i === 0 || i === points.length - 1) {
            // Endpoints fixed
            out.push(Object.freeze({ ...points[i]! }));
        } else {
            const f = forces[i] || { fx: 0, fy: 0 };
            out.push(
                Object.freeze({
                    x: points[i]!.x + f.fx * stepSize,
                    y: points[i]!.y + f.fy * stepSize,
                }),
            );
        }
    }
    return out;
}

/**
 * Bundle edges (uma iteração).
 *
 * @param {Array<Object>} edges {sx, sy, tx, ty}
 * @param {Object} [config]
 * @returns {Array<Array<{x:number,y:number}>>}
 */
export function bundleEdges(edges: Array<Object>, config: Object = {}): Array<Array<{x:number,y:number}>> {
    if (!Array.isArray(edges)) return [];
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const subdivisions = Number.isInteger(cfg.subdivisions) ? cfg.subdivisions : DEFAULT_CONFIG.subdivisions;
    let bundled = edges.map((e) => subdivideEdge(e, subdivisions));
    const pairs = findCompatiblePairs(edges, cfg.compatibilityThreshold);

    const iterations = Number.isInteger(cfg.iterations) ? cfg.iterations : DEFAULT_CONFIG.iterations;
    for (let iter = 0; iter < iterations; iter++) {
        const newBundled = bundled.map((points, i) => {
            const allForces = points.map(() => ({ fx: 0, fy: 0 }));
            // Spring within edge
            const sf = springForces(points, cfg.stiffness);
            for (let k = 0; k < allForces.length; k++) {
                allForces[k]!.fx += sf[k]?.fx || 0;
                allForces[k]!.fy += sf[k]?.fy || 0;
            }
            // Electrostatic with compatible
            for (const pair of pairs) {
                if (pair.a !== i && pair.b !== i) continue;
                const otherIdx = pair.a === i ? pair.b : pair.a;
                const ef = electrostaticForces(points, bundled[otherIdx] ?? [], pair.comp);
                for (let k = 0; k < allForces.length; k++) {
                    allForces[k]!.fx += ef[k]?.fx || 0;
                    allForces[k]!.fy += ef[k]?.fy || 0;
                }
            }
            return applyForces(points, allForces, cfg.stepSize);
        });
        bundled = newBundled;
    }
    return (Object.freeze(bundled.map((p) => Object.freeze([...p]))) as any);
}

/**
 * Sumariza bundling result.
 */
export function summarizeBundling( bundled: any) {
    const empty = { totalEdges: 0, totalControlPoints: 0, avgPointsPerEdge: 0 };
    if (!Array.isArray(bundled) || bundled.length === 0) return empty;
    const totalControlPoints = bundled.reduce((sum, e) => sum + (Array.isArray(e) ? e.length : 0), 0);
    return Object.freeze({
        totalEdges: bundled.length,
        totalControlPoints,
        avgPointsPerEdge: totalControlPoints / bundled.length,
    });
}

/**
 * Module identity export.
 */
export const edgeBundlingMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.26',
    deliveredAt: '2026-05-01',
    exports: [
        'EDGE_BUNDLING_META',
        'DEFAULT_CONFIG',
        'euclidean',
        'subdivideEdge',
        'compatibility',
        'findCompatiblePairs',
        'springForces',
        'electrostaticForces',
        'applyForces',
        'bundleEdges',
        'summarizeBundling',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
