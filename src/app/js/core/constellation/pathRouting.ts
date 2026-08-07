// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Path Routing - Phase 1.17 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S17
 *
 * Phase 1.17 (2026-05-01) - pure-logic helpers para roteamento de
 * arestas (paths) em visualizações de constelação. Computa pontos de
 * controle, samples ao longo da curva, comprimento aproximado.
 *
 * Estratégia:
 *   - 4 styles: straight / quadratic / cubic / orthogonal
 *   - Sampling adaptativo (N pontos uniformes)
 *   - Length approximation via segment sum
 *   - Anti-overlap: offset perpendicular para parallel edges
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Path styles canônicos. */
export const PATH_STYLES = Object.freeze(['straight', 'quadratic', 'cubic', 'orthogonal']);

/** Identidade do módulo. */
export const PATH_ROUTING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.17',
    deliveredAt: '2026-05-01',
    styles: PATH_STYLES,
});

/**
 * Verifica se style é canônico.
 */
export function isValidStyle(style: any) {
    return typeof style === 'string' && PATH_STYLES.includes(style);
}

/**
 * Distância euclideana entre 2 pontos.
 */
import { distance2D as _distance2D } from '../../utils/helpers/geometry.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
export function distance(a: any, b: any) {
    return _distance2D(a, b);
}

/**
 * Computa midpoint entre 2 pontos.
 */
export function midpoint(a: any, b: any) {
    if (!a || !b) return Object.freeze({ x: 0, y: 0 });
    return Object.freeze({
        x: ((a.x || 0) + (b.x || 0)) / 2,
        y: ((a.y || 0) + (b.y || 0)) / 2,
    });
}

/**
 * Computa ponto perpendicular ao segmento AB, deslocado em offset.
 *
 * @param {{x: number, y: number}} a
 * @param {{x: number, y: number}} b
 * @param {number} offset - pixels (positivo = "esquerda" da direção AB)
 * @returns {{x: number, y: number}}
 */
export function perpendicularOffset(a: {x: number, y: number}, b: {x: number, y: number}, offset: number): {x: number, y: number} {
    if (!a || !b || !Number.isFinite(offset)) return midpoint(a, b);
    const mid = midpoint(a, b);
    const dx = (b.x || 0) - (a.x || 0);
    const dy = (b.y || 0) - (a.y || 0);
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return mid;
    // Perpendicular unit vector (90° CCW)
    const px = -dy / len;
    const py = dx / len;
    return Object.freeze({
        x: mid.x + px * offset,
        y: mid.y + py * offset,
    });
}

/**
 * Lerp linear entre 2 pontos.
 */
function lerp(a: any, b: any, t: any) {
    return Object.freeze({
        x: (a.x || 0) + ((b.x || 0) - (a.x || 0)) * t,
        y: (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t,
    });
}

/**
 * Bezier quadrático em t (de Casteljau).
 */
export function quadraticBezier(
    p0: any,
    p1: any,
    p2: any,
    t: any,
) {
    if (!p0 || !p1 || !p2) return Object.freeze({ x: 0, y: 0 });
    const _t = Math.max(0, Math.min(1, toFiniteNumber(t, 0)));
    const a = lerp(p0, p1, _t);
    const b = lerp(p1, p2, _t);
    return lerp(a, b, _t);
}

/**
 * Bezier cúbico em t.
 */
export function cubicBezier(
    p0: any,
    p1: any,
    p2: any,
    p3: any,
    t: any,
) {
    if (!p0 || !p1 || !p2 || !p3) return Object.freeze({ x: 0, y: 0 });
    const _t = Math.max(0, Math.min(1, toFiniteNumber(t, 0)));
    const a = lerp(p0, p1, _t);
    const b = lerp(p1, p2, _t);
    const c = lerp(p2, p3, _t);
    return lerp(lerp(a, b, _t), lerp(b, c, _t), _t);
}

/**
 * Computa control points padrão para path.
 *
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {string} style
 * @param {number} [curvature=0.3]
 * @returns {Array<{x: number, y: number}>}
 */
export function controlPoints(from: {x: number, y: number}, to: {x: number, y: number}, style: string, curvature: number = 0.3): Array<{x: number, y: number}> {
    if (!from || !to) return [];
    if (!isValidStyle(style)) style = 'straight';
    const _c = toFiniteNumber(curvature, 0.3);

    if (style === 'straight') return [from, to];
    if (style === 'quadratic') {
        const dist = distance(from, to);
        return [from, perpendicularOffset(from, to, dist * _c), to];
    }
    if (style === 'cubic') {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const cp1 = Object.freeze({ x: from.x + dx * 0.33, y: from.y + dy * _c });
        const cp2 = Object.freeze({ x: from.x + dx * 0.67, y: to.y - dy * _c });
        return [from, cp1, cp2, to];
    }
    // orthogonal: L-shape ou U-shape
    const mid = midpoint(from, to);
    return [from, Object.freeze({ x: mid.x, y: from.y }), Object.freeze({ x: mid.x, y: to.y }), to];
}

/**
 * Computa pontos amostrados ao longo do path.
 *
 * @param {{x: number, y: number}} from
 * @param {{x: number, y: number}} to
 * @param {string} style
 * @param {Object} [options]
 * @param {number} [options.samples=20]
 * @param {number} [options.curvature=0.3]
 * @returns {ReadonlyArray<{x: number, y: number}>}
 */
export function samplePath(from: {x: number, y: number}, to: {x: number, y: number}, style: string, options: { samples?: number; curvature?: number } = {}): ReadonlyArray<{x: number, y: number}> {
    if (!from || !to) return [];
    const samples = (Number.isInteger(options.samples) && (options.samples ?? 0) > 1 ? options.samples : 20) ?? 20;
    const cps = controlPoints(from, to, style, options.curvature);
    if (cps.length < 2) return [];

    const points = [];
    if (style === 'straight' || cps.length === 2) {
        for (let i = 0; i <= samples - 1; i++) {
            const t = i / (samples - 1);
            points.push(lerp(from, to, t));
        }
    } else if (style === 'quadratic' && cps.length === 3) {
        for (let i = 0; i <= samples - 1; i++) {
            const t = i / (samples - 1);
            points.push(quadraticBezier(cps[0], cps[1], cps[2], t));
        }
    } else if (style === 'cubic' && cps.length === 4) {
        for (let i = 0; i <= samples - 1; i++) {
            const t = i / (samples - 1);
            points.push(cubicBezier(cps[0], cps[1], cps[2], cps[3], t));
        }
    } else if (style === 'orthogonal') {
        // Linear segments between control points
        const totalLen = cps.reduce((sum, _, i) => {
            if (i === 0) return 0;
            return sum + distance(cps[i - 1], cps[i]);
        }, 0);
        if (totalLen === 0) return [from, to];
        for (let i = 0; i <= samples - 1; i++) {
            const t = i / (samples - 1);
            const targetLen = t * totalLen;
            // Find segment
            let acc = 0;
            for (let j = 1; j < cps.length; j++) {
                const segLen = distance(cps[j - 1], cps[j]);
                if (acc + segLen >= targetLen || j === cps.length - 1) {
                    const segT = segLen > 0 ? (targetLen - acc) / segLen : 0;
                    points.push(lerp(cps[j - 1], cps[j], Math.min(1, segT)));
                    break;
                }
                acc += segLen;
            }
        }
    }
    return Object.freeze(points);
}

/**
 * Aproxima comprimento do path pela soma das distâncias entre samples.
 *
 * @param {Array<{x: number, y: number}>} samples
 * @returns {number}
 */
export function approximateLength(samples: Array<{x: number, y: number}>): number {
    if (!Array.isArray(samples) || samples.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < samples.length; i++) {
        total += distance(samples[i - 1], samples[i]);
    }
    return total;
}

/**
 * Computa offsets perpendiculares para N edges paralelas evitando overlap.
 *
 * @param {number} n - quantidade de edges
 * @param {number} [spacing=10]
 * @returns {ReadonlyArray<number>} array de offsets
 */
export function parallelOffsets(n: number, spacing: number = 10): ReadonlyArray<number> {
    if (!Number.isInteger(n) || n <= 0) return [];
    const _spacing = toFiniteNumber(spacing, 10);
    const offsets = [];
    if (n === 1) return [0];
    // Distribui offsets centrados em 0: -, 0, +
    const half = Math.floor(n / 2);
    for (let i = 0; i < n; i++) {
        offsets.push((i - half + (n % 2 === 0 ? 0.5 : 0)) * _spacing);
    }
    return Object.freeze(offsets);
}

/**
 * Module identity export.
 */
export const pathRoutingMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.17',
    deliveredAt: '2026-05-01',
    styles: PATH_STYLES,
    exports: [
        'PATH_STYLES',
        'PATH_ROUTING_META',
        'isValidStyle',
        'distance',
        'midpoint',
        'perpendicularOffset',
        'quadraticBezier',
        'cubicBezier',
        'controlPoints',
        'samplePath',
        'approximateLength',
        'parallelOffsets',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
