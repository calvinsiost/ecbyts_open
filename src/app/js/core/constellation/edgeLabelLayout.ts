// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Edge Label Layout - Phase 1.39 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md S39
 *
 * Phase 1.39 (2026-05-01) - pure-logic helpers for positioning labels
 * over constellation graph edges. Computes label positions along edge
 * t in [0,1], avoids label-vs-label AABB overlaps via perpendicular
 * nudges, and summarizes the layout result.
 *
 * Functions:
 *   - computeEdgeLabelPosition(edge, t, opts): position (x,y) + angle
 *     along an edge parameter t in [0,1] (0 = source, 1 = target).
 *   - computeEdgeLabelAabb: bounding box for a label in world coords.
 *   - avoidOverlap(labels, opts): iterative perpendicular nudges for AABB
 *     collisions.
 *   - summarizeEdgeLabels(labels): count/overlap/average offset.
 *
 * No browser dependency. Does not touch DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Module identity. */
export const EDGE_LABEL_LAYOUT_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.39',
    deliveredAt: '2026-05-01',
});

const DEFAULTS = Object.freeze({
    t: 0.5,
    offset: 0,
    width: 40,
    height: 12,
    nudgeStep: 4,
    maxIterations: 12,
});

type EdgeLabelPoint = {
    x: number;
    y: number;
};

type EdgeLabelPosition = EdgeLabelPoint & {
    angle: number;
    t: number;
};

type EdgeLabelPositionLike = EdgeLabelPoint & {
    angle?: number;
    t?: number;
};

type EdgeLabelAabb = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};

type EdgeLabelSize = {
    width?: number;
    height?: number;
};

type EdgeLabelEndpoint = EdgeLabelPoint | string | null | undefined;

type EdgeLabelEdge = {
    source?: EdgeLabelEndpoint;
    target?: EdgeLabelEndpoint;
};

type EdgeLabelNodeMap = Record<string, EdgeLabelPoint | null | undefined>;

type EdgeLabelPositionOptions = {
    offset?: number;
    nodesById?: EdgeLabelNodeMap | null;
};

type EdgeLabelOverlapOptions = {
    nudgeStep?: number;
    maxIterations?: number;
};

type EdgeLabelRecord = {
    [key: string]: unknown;
    id?: string;
    position?: EdgeLabelPositionLike | null;
    size?: EdgeLabelSize | null;
    offset?: number;
};

type EdgeLabelSummary = {
    count: number;
    overlapping: number;
    averageAbsOffset: number;
};

/**
 * Clamp value into [min, max].
 *
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
import { clamp } from '../../utils/helpers/math.js';

/**
 * Return true when the value is a finite number.
 *
 * @param {unknown} v
 * @returns {boolean}
 */
function isFiniteNum(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Return a finite number or the provided fallback.
 *
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function finiteOr(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Return a positive finite number or the provided fallback.
 *
 * @param {unknown} v
 * @param {number} fallback
 * @returns {number}
 */
function positiveFiniteOr(v: unknown, fallback: number): number {
    return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

/**
 * Resolve an edge endpoint into {x,y}. Accepts a direct point or a string id
 * looked up in nodesById.
 *
 * @param {{x:number,y:number}|string|null|undefined} ep
 * @param {Record<string, {x:number,y:number}|null|undefined>|null} [nodesById]
 * @returns {{x:number,y:number}|null}
 */
function resolveEndpoint(ep: EdgeLabelEndpoint, nodesById: EdgeLabelNodeMap | null = null): EdgeLabelPoint | null {
    if (!ep) return null;
    if (typeof ep === 'object' && isFiniteNum(ep.x) && isFiniteNum(ep.y)) {
        return { x: ep.x, y: ep.y };
    }
    if (typeof ep === 'string' && nodesById) {
        const n = nodesById[ep];
        if (n && isFiniteNum(n.x) && isFiniteNum(n.y)) return { x: n.x, y: n.y };
    }
    return null;
}

/**
 * Compute position (x,y) + angle for a label on an edge at parameter t.
 *
 * @param {{source?: {x:number,y:number}|string|null, target?: {x:number,y:number}|string|null}|null|undefined} edge {source, target} endpoints as {x,y} or ids.
 * @param {number} t parameter in [0,1] (clamped).
 * @param {{offset?: number, nodesById?: Record<string, {x:number,y:number}|null|undefined>|null}} [opts] {offset, nodesById}
 *   - offset: perpendicular displacement (default 0).
 *   - nodesById: dictionary for resolving source/target ids.
 * @returns {{x:number,y:number,angle:number,t:number}|null}
 */
export function computeEdgeLabelPosition(
    edge: EdgeLabelEdge | null | undefined,
    t: number = DEFAULTS.t,
    opts: EdgeLabelPositionOptions = {},
): EdgeLabelPosition | null {
    if (!edge) return null;
    const offset = finiteOr(opts.offset, 0);
    const nodesById = opts.nodesById || null;
    const s = resolveEndpoint(edge.source, nodesById);
    const e = resolveEndpoint(edge.target, nodesById);
    if (!s || !e) return null;
    const tt = clamp(finiteOr(t, DEFAULTS.t), 0, 1);
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const baseX = s.x + dx * tt;
    const baseY = s.y + dy * tt;
    const len = Math.hypot(dx, dy);
    let nx = 0;
    let ny = 0;
    if (len > 0 && offset !== 0) {
        // Perpendicular unit vector, rotated 90deg counter-clockwise.
        nx = -dy / len;
        ny = dx / len;
    }
    const angle = Math.atan2(dy, dx);
    return {
        x: baseX + nx * offset,
        y: baseY + ny * offset,
        angle,
        t: tt,
    };
}

/**
 * Compute an AABB (axis-aligned bounding box) for a label centered at (x,y).
 *
 * @param {{x:number,y:number}} pos
 * @param {{width?:number,height?:number}} [size]
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}}
 */
export function computeEdgeLabelAabb(pos: EdgeLabelPoint, size: EdgeLabelSize = {}): EdgeLabelAabb {
    const w = positiveFiniteOr(size.width, DEFAULTS.width);
    const h = positiveFiniteOr(size.height, DEFAULTS.height);
    const halfW = w / 2;
    const halfH = h / 2;
    return {
        minX: pos.x - halfW,
        minY: pos.y - halfH,
        maxX: pos.x + halfW,
        maxY: pos.y + halfH,
    };
}

/**
 * Return true when two AABBs overlap.
 *
 * @param {{minX:number,minY:number,maxX:number,maxY:number}|null|undefined} a
 * @param {{minX:number,minY:number,maxX:number,maxY:number}|null|undefined} b
 * @returns {boolean}
 */
export function aabbOverlaps(a: EdgeLabelAabb | null | undefined, b: EdgeLabelAabb | null | undefined): boolean {
    if (!a || !b) return false;
    return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

/**
 * Resolve label overlaps with iterative perpendicular nudges.
 * Each label should have {id, edge, position:{x,y,angle}, size:{width,height}, offset?}.
 * Returns a new list with adjusted positions + offsets and does not mutate input.
 *
 * Algorithm: deterministic sweep in the given order. For each colliding pair
 * (i,j) with j > i, push j perpendicular to its edge in nudgeStep increments
 * until the collision clears or maxIterations is reached.
 *
 * @param {Array<{id?: string, position?: {x:number,y:number,angle?:number}|null, size?: {width?:number,height?:number}|null, offset?:number}|null|undefined>} labels
 * @param {{nudgeStep?: number, maxIterations?: number}} [opts] {nudgeStep, maxIterations}
 * @returns {Array<{id?: string, position?: {x:number,y:number,angle?:number}|null, size?: {width?:number,height?:number}|null, offset?:number}|null|undefined>} adjusted labels (shallow clones)
 */
export function avoidOverlap(
    labels: ReadonlyArray<EdgeLabelRecord | null | undefined>,
    opts: EdgeLabelOverlapOptions = {},
): Array<EdgeLabelRecord | null | undefined> {
    if (!Array.isArray(labels) || labels.length === 0) return [];
    const step = positiveFiniteOr(opts.nudgeStep, DEFAULTS.nudgeStep);
    const maxIter = Math.floor(positiveFiniteOr(opts.maxIterations, DEFAULTS.maxIterations));

    const out = labels.map((label): EdgeLabelRecord | null | undefined => {
        if (!label || !label.position) return label ? { ...label } : label;
        return {
            ...label,
            position: { ...label.position },
            offset: finiteOr(label.offset, 0),
            size: label.size ? { ...label.size } : { width: DEFAULTS.width, height: DEFAULTS.height },
        };
    });

    for (let i = 0; i < out.length; i++) {
        const a = out[i];
        if (!a || !a.position) continue;
        for (let j = i + 1; j < out.length; j++) {
            const b = out[j];
            if (!b || !b.position) continue;
            const aabbA = computeEdgeLabelAabb(a.position, a.size || undefined);
            let aabbB = computeEdgeLabelAabb(b.position, b.size || undefined);
            let iter = 0;
            const ang = finiteOr(b.position.angle, 0);
            const perpX = -Math.sin(ang);
            const perpY = Math.cos(ang);
            let sign = 1;
            while (aabbOverlaps(aabbA, aabbB) && iter < maxIter) {
                iter++;
                const delta = step * iter * sign;
                b.position.x += perpX * step * sign;
                b.position.y += perpY * step * sign;
                b.offset = (b.offset || 0) + delta;
                sign = -sign;
                aabbB = computeEdgeLabelAabb(b.position, b.size || undefined);
            }
        }
    }
    return out;
}

/**
 * Summarize layout state: total labels, labels still overlapping, average absolute offset.
 *
 * @param {Array<{position?: {x:number,y:number,angle?:number}|null, size?: {width?:number,height?:number}|null, offset?:number}|null|undefined>} labels
 * @returns {{count:number, overlapping:number, averageAbsOffset:number}}
 */
export function summarizeEdgeLabels(labels: ReadonlyArray<EdgeLabelRecord | null | undefined>): EdgeLabelSummary {
    if (!Array.isArray(labels) || labels.length === 0) {
        return { count: 0, overlapping: 0, averageAbsOffset: 0 };
    }
    const valid: Array<EdgeLabelRecord & { position: EdgeLabelPositionLike }> = [];
    for (const label of labels) {
        if (!label || !label.position) continue;
        valid.push({ ...label, position: label.position });
    }
    let overlapping = 0;
    for (let i = 0; i < valid.length; i++) {
        const current = valid[i];
        if (!current) continue;
        const aabbA = computeEdgeLabelAabb(current.position, current.size || undefined);
        for (let j = i + 1; j < valid.length; j++) {
            const candidate = valid[j];
            if (!candidate) continue;
            const aabbB = computeEdgeLabelAabb(candidate.position, candidate.size || undefined);
            if (aabbOverlaps(aabbA, aabbB)) {
                overlapping++;
                break;
            }
        }
    }
    const sumAbs = valid.reduce((acc, label) => acc + Math.abs(finiteOr(label.offset, 0)), 0);
    const averageAbsOffset = valid.length > 0 ? sumAbs / valid.length : 0;
    return {
        count: valid.length,
        overlapping,
        averageAbsOffset,
    };
}
