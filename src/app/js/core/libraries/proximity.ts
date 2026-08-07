// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   LIBRARY PROXIMITY — SPEC_TIER2_FEATURES §B2

   Badge "Próximo" para libraries geograficamente próximas ao projeto.
   Threshold default: 100 km.

   Uses haversine formula para distância na esfera.
   ================================================================ */

export const PROXIMITY_THRESHOLD_KM = 100;

const EARTH_RADIUS_KM = 6_371;

// ──────────────────────────────────────────────────────────────────────
// Haversine distance
// ──────────────────────────────────────────────────────────────────────

export interface WGS84Point {
    lat: number | string;
    lon: number | string;
}

/**
 * Distância em km entre 2 pontos WGS84 via fórmula haversine.
 * @param {WGS84Point} a
 * @param {WGS84Point} b
 * @returns {number} km (NaN se inputs inválidos)
 */
export function haversineDistanceKm(a: WGS84Point, b: WGS84Point): number {
    if (!a || !b) return NaN;
    const lat1 = Number(a.lat);
    const lon1 = Number(a.lon);
    const lat2 = Number(b.lat);
    const lon2 = Number(b.lon);
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return NaN;

    const toRad = (deg: number): number => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return EARTH_RADIUS_KM * c;
}

// ──────────────────────────────────────────────────────────────────────
// Library proximity scoring
// ──────────────────────────────────────────────────────────────────────

export interface LibraryInput {
    id: string;
    centerPoint?: WGS84Point;
}

export interface LibraryEnriched extends LibraryInput {
    distanceKm: number | null;
    isNearby: boolean;
}

/**
 * Enriquece cada library com distanceKm e isNearby flag.
 * Libraries sem centerPoint recebem distanceKm: null.
 *
 * @param {LibraryInput[]} libraries
 * @param {WGS84Point} projectCenter
 * @param {number} [thresholdKm]
 * @returns {LibraryEnriched[]}
 */
export function enrichWithProximity(
    libraries: LibraryInput[],
    projectCenter: WGS84Point,
    thresholdKm: number = PROXIMITY_THRESHOLD_KM,
): LibraryEnriched[] {
    if (!Array.isArray(libraries)) return [];
    return libraries.map((lib) => {
        if (!lib || !lib.centerPoint) {
            return { ...lib, distanceKm: null, isNearby: false };
        }
        const d = haversineDistanceKm(projectCenter, lib.centerPoint);
        return {
            ...lib,
            distanceKm: Number.isFinite(d) ? d : null,
            isNearby: Number.isFinite(d) && d <= Number(thresholdKm),
        };
    });
}

/**
 * Sort libraries por distância ascendente (sem centerPoint vão ao final).
 * @param {LibraryEnriched[]} libraries - já com distanceKm
 * @returns {LibraryEnriched[]}
 */
export function sortByDistance(libraries: LibraryEnriched[]): LibraryEnriched[] {
    if (!Array.isArray(libraries)) return [];
    return [...libraries].sort((a, b) => {
        const da = a?.distanceKm;
        const db = b?.distanceKm;
        if (da == null && db == null) return 0;
        if (da == null) return 1;
        if (db == null) return -1;
        return da - db;
    });
}

/**
 * Filtra apenas libraries próximas (dentro do threshold).
 * @param {LibraryEnriched[]} libraries
 * @param {number} [thresholdKm]
 * @returns {LibraryEnriched[]}
 */
export function filterNearby(
    libraries: LibraryEnriched[],
    thresholdKm: number = PROXIMITY_THRESHOLD_KM,
): LibraryEnriched[] {
    if (!Array.isArray(libraries)) return [];
    return libraries.filter((lib) => {
        return Number.isFinite(lib?.distanceKm) && lib.distanceKm! <= Number(thresholdKm);
    });
}

/**
 * Formata distância para display em UI badge.
 * @param {number} km
 * @returns {string}
 */
export function formatDistanceKm(km: number): string {
    const n = Number(km);
    if (!Number.isFinite(n)) return '—';
    if (n < 1) return `${Math.round(n * 1000)}m`;
    if (n < 10) return `${n.toFixed(1)}km`;
    return `${Math.round(n)}km`;
}