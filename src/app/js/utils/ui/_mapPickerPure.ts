// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave RRRR1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free polygon geometry (self-intersection, area, segment
// intersection) from utils/ui/mapPicker.js (#17 monolito 1326 LOC). Pure math.

/**
 * Cross product of vectors (b-a) and (c-a) — orientation test.
 *
 * @param {number[]} a - [x, y]
 * @param {number[]} b - [x, y]
 * @param {number[]} c - [x, y]
 * @returns {number}
 */
export function crossProduct(a: any, b: any, c: any): number {
    if (!Array.isArray(a) || !Array.isArray(b) || !Array.isArray(c)) return 0;
    const ax = Number(a[0]);
    const ay = Number(a[1]);
    const bx = Number(b[0]);
    const by = Number(b[1]);
    const cx = Number(c[0]);
    const cy = Number(c[1]);
    if (![ax, ay, bx, by, cx, cy].every(Number.isFinite)) return 0;
    return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/**
 * Check if two line segments (p1→p2) and (p3→p4) intersect properly.
 * Pure: uses cross-product orientation test.
 *
 * @param {number[]} p1
 * @param {number[]} p2
 * @param {number[]} p3
 * @param {number[]} p4
 * @returns {boolean}
 */
export function segmentsIntersect(p1: any, p2: any, p3: any, p4: any): boolean {
    const d1 = crossProduct(p3, p4, p1);
    const d2 = crossProduct(p3, p4, p2);
    const d3 = crossProduct(p1, p2, p3);
    const d4 = crossProduct(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Check if polygon ring has any self-intersecting edges.
 * Skips adjacent edges (consecutive segments share a vertex).
 *
 * @param {number[][]} ring - Closed ring of [lon, lat] pairs
 * @returns {boolean}
 */
export function isSelfIntersectingRing(ring: any): boolean {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue;
            if (segmentsIntersect(ring[i], ring[i + 1], ring[j], ring[j + 1])) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Compute polygon area using Shoelace formula (unsigned).
 * Returns area in square degrees for geodetic [lon, lat] coordinates.
 *
 * @param {number[][]} ring - Closed ring of [lon, lat] pairs
 * @returns {number}
 */
export function computePolygonArea(ring: any): number {
    if (!Array.isArray(ring) || ring.length < 4) return 0;
    let area = 0;
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        if (!Array.isArray(p1) || !Array.isArray(p2)) return 0;
        const x1 = Number(p1[0]);
        const y1 = Number(p1[1]);
        const x2 = Number(p2[0]);
        const y2 = Number(p2[1]);
        if (![x1, y1, x2, y2].every(Number.isFinite)) return 0;
        area += x1 * y2 - x2 * y1;
    }
    return Math.abs(area) / 2;
}

/**
 * Return empty GeoJSON FeatureCollection.
 *
 * @returns {{type:'FeatureCollection', features:[]}}
 */
export function emptyFeatureCollection(): { type: 'FeatureCollection'; features: [] } {
    return { type: 'FeatureCollection', features: [] };
}

/**
 * Validate that a ring is closed (first === last vertex).
 *
 * @param {number[][]} ring
 * @returns {boolean}
 */
export function isClosedRing(ring: any): boolean {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (!Array.isArray(first) || !Array.isArray(last)) return false;
    return first[0] === last[0] && first[1] === last[1];
}
