// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave FFFF1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free formatters + geometry helpers from handlers/project.js
// (#5 monolito 2729 LOC). Pure: zero document/window/state refs.

/**
 * Format value as currency string in pt-BR locale.
 * Caller passes currency code (e.g. 'BRL', 'USD', 'EUR').
 *
 * @param {number|null|undefined} value
 * @param {string} currency
 * @returns {string}
 */
export function formatCurrencyByCode( value: any, currency: any) {
    const n = Number.isFinite(Number(value)) ? Number(value) : 0;
    const cur = currency && typeof currency === 'string' ? currency : 'BRL';
    return n.toLocaleString('pt-BR', { style: 'currency', currency: cur });
}

/**
 * Format value as compact currency string (e.g. "R$ 42.8k", "R$ 1.5M").
 *
 * @param {number|null|undefined} value
 * @param {string} currency
 * @returns {string}
 */
export function formatCurrencyCompact( value: any, currency: any) {
    const n = Number.isFinite(Number(value)) ? Number(value) : 0;
    const cur = currency && typeof currency === 'string' ? currency : 'BRL';
    if (Math.abs(n) >= 1_000_000) return `${cur} ${(n / 1_000_000).toFixed(1)}M`;
    if (Math.abs(n) >= 1_000) return `${cur} ${(n / 1_000).toFixed(1)}k`;
    return formatCurrencyByCode(n, cur);
}

/**
 * Compute centroid of polygon ring (closed [lon,lat] points).
 * Ring must be closed (first === last); centroid computed from n-1 unique points.
 *
 * @param {Array<[number,number]>} ring
 * @returns {[number, number]|null}
 */
export function computePolygonCentroid( ring: any) {
    if (!Array.isArray(ring) || ring.length < 4) return null;
    const n = ring.length - 1;
    let lonSum = 0;
    let latSum = 0;
    for (let i = 0; i < n; i++) {
        const pt = ring[i];
        if (!Array.isArray(pt) || pt.length < 2) return null;
        const lon = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
        lonSum += lon;
        latSum += lat;
    }
    return [lonSum / n, latSum / n];
}

/**
 * Convert WGS84 ring to local meters vertices (relative to first point).
 * Approximate: 1 deg lat ≈ 111320m; lon varies with cos(lat).
 *
 * Returns {x, y, z} where y=0 (planar) and z=-dz (Three.js convention).
 *
 * @param {Array<[number,number]>} ring - Closed lon/lat ring
 * @returns {Array<{x:number, y:number, z:number}>}
 */
export function wgs84RingToLocalVertices( ring: any) {
    if (!Array.isArray(ring) || ring.length < 2) return [];
    const n = ring.length - 1;
    const vertices = [];
    const origin = ring[0];
    if (!Array.isArray(origin) || origin.length < 2) return [];
    const originLon = Number(origin[0]);
    const originLat = Number(origin[1]);
    if (!Number.isFinite(originLon) || !Number.isFinite(originLat)) return [];
    for (let i = 0; i < n; i++) {
        const pt = ring[i];
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lon = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        const latRad = (lat * Math.PI) / 180;
        const dx = (lon - originLon) * 111320 * Math.cos(latRad);
        const dz = (lat - originLat) * 111320;
        vertices.push({ x: dx, y: 0, z: -dz });
    }
    return vertices;
}
