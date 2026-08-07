// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Route Flow Family - geometry utilities (polyline length, centroid, interpolation)
// No browser / Three.js dependencies - pure math.
// Spec: docs/specs/features/SPEC_FAMILY_ROUTES_FLOWS.md §2

interface LatLon {
    lat: number;
    lon: number;
}

interface LatLonElev {
    lat: number;
    lon: number;
    elev?: number;
}

// Earth radius for haversine (meters)
const EARTH_RADIUS_M = 6_371_000;

/**
 * Haversine distance between two lat/lon points in meters.
 * @param a
 * @param b
 * @returns
 */
export function haversineDistanceM(a: LatLon, b: LatLon): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const aSq = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLon * sinDLon;
    return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(aSq));
}

/**
 * 3D segment length: horizontal (haversine) + vertical elevation difference.
 * @param a
 * @param b
 * @returns meters
 */
export function segmentLength3D(a: LatLonElev, b: LatLonElev): number {
    const hz = haversineDistanceM(a, b);
    const dz = (b.elev ?? 0) - (a.elev ?? 0);
    return Math.sqrt(hz * hz + dz * dz);
}

/**
 * Total 3D polyline length.
 * @param coords
 * @returns meters (0 if fewer than 2 points)
 */
export function polylineLength(coords: LatLonElev[]): number {
    if (!Array.isArray(coords) || coords.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < coords.length; i++) {
        total += segmentLength3D(coords[i - 1] as LatLonElev, coords[i] as LatLonElev);
    }
    return total;
}

/**
 * Average slope (rise/run) along polyline as decimal fraction.
 * Positive = ascending from start to end.
 * @param coords
 * @returns null if no elevation data or < 2 points
 */
export function polylineSlope(coords: LatLonElev[]): number | null {
    if (!Array.isArray(coords) || coords.length < 2) return null;
    const start = coords[0] as LatLonElev;
    const end = coords[coords.length - 1] as LatLonElev;
    if (start.elev == null || end.elev == null) return null;
    const hz = haversineDistanceM(start, end);
    if (hz === 0) return null;
    return (end.elev - start.elev) / hz;
}

/**
 * Centroid of polyline (geographic mean of coordinates).
 * @param coords
 * @returns
 */
export function polylineCentroid(coords: LatLon[]): LatLon {
    if (!Array.isArray(coords) || coords.length === 0) return { lat: 0, lon: 0 };
    const sum = coords.reduce((acc, pt) => ({ lat: acc.lat + pt.lat, lon: acc.lon + pt.lon }), { lat: 0, lon: 0 });
    return { lat: sum.lat / coords.length, lon: sum.lon / coords.length };
}

/**
 * Linearly interpolate a point at a given fraction (0–1) along the polyline.
 * @param coords
 * @param t fraction [0, 1]
 * @returns
 */
export function interpolateAlongPolyline(
    coords: LatLonElev[],
    t: number,
): { lat: number; lon: number; elev: number | null } | null {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    const first = coords[0] as LatLonElev;
    if (t <= 0) return { ...first, elev: first.elev ?? null };
    if (t >= 1) {
        const last = coords[coords.length - 1] as LatLonElev;
        return { ...last, elev: last.elev ?? null };
    }

    const totalLen = polylineLength(coords);
    if (totalLen === 0) return { ...first, elev: first.elev ?? null };

    const target = t * totalLen;
    let accumulated = 0;

    for (let i = 1; i < coords.length; i++) {
        const a = coords[i - 1] as LatLonElev;
        const b = coords[i] as LatLonElev;
        const segLen = segmentLength3D(a, b);
        if (accumulated + segLen >= target) {
            const localT = segLen === 0 ? 0 : (target - accumulated) / segLen;
            return {
                lat: a.lat + localT * (b.lat - a.lat),
                lon: a.lon + localT * (b.lon - a.lon),
                elev: a.elev != null && b.elev != null ? a.elev + localT * (b.elev - a.elev) : null,
            };
        }
        accumulated += segLen;
    }
    const last = coords[coords.length - 1] as LatLonElev;
    return { ...last, elev: last.elev ?? null };
}

/**
 * Generate evenly-spaced waypoints along a polyline.
 * @param coords
 * @param count number of waypoints (including start and end)
 * @returns
 */
export function generateEvenWaypoints(
    coords: LatLonElev[],
    count: number,
): Array<{ lat: number; lon: number; elev: number | null }> {
    if (!Array.isArray(coords) || coords.length === 0 || count < 1) return [];
    if (count === 1) {
        const mid = interpolateAlongPolyline(coords, 0.5);
        return mid ? [mid] : [];
    }
    const out: Array<{ lat: number; lon: number; elev: number | null }> = [];
    for (let i = 0; i < count; i++) {
        const pt = interpolateAlongPolyline(coords, i / (count - 1));
        if (pt) out.push(pt);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Flight route helpers (ECBYTS-ENERGY-SCENARIOS-001#5)
// ---------------------------------------------------------------------------

interface ScenePoint {
    x: number;
    y?: number;
    z: number;
}

/** Default flight altitude (m AGL) when none is set. 60 m is conservative vs
 *  the typical 120 m VLOS ceiling (ANAC RBAC-E94 / FAA Part 107). */
export const DEFAULT_FLIGHT_ALTITUDE_M = 60;

/**
 * Resolve the flight altitude for a route_flow element's data blob.
 * Accepts flight_properties.altitude_m (schema) or flat altitude_m (legacy).
 */
export function resolveFlightAltitude(data: any): number {
    const alt = Number(data?.flight_properties?.altitude_m ?? data?.altitude_m);
    return Number.isFinite(alt) && alt > 0 ? alt : DEFAULT_FLIGHT_ALTITUDE_M;
}

/**
 * Return a NEW scene-space path elevated by altitudeM on the Y axis.
 * Pure — does not mutate the input (rebuild-safe: applying it to the original
 * data.path on every rebuild would stack altitude).
 */
export function elevateFlightPath(path: ScenePoint[], altitudeM: number): ScenePoint[] {
    if (!Array.isArray(path)) return [];
    const alt = Number.isFinite(altitudeM) && altitudeM > 0 ? altitudeM : DEFAULT_FLIGHT_ALTITUDE_M;
    return path.map((p) => ({ ...p, y: (Number(p?.y) || 0) + alt }));
}

/**
 * True when this route_flow data blob represents a flight route.
 * Checks data.type and data.route_type (both spellings exist in the app).
 */
export function isFlightRouteData(data: any): boolean {
    return data?.type === 'flight_route' || data?.route_type === 'flight_route';
}

/**
 * Bounding box of polyline coordinates.
 * @param coords
 * @returns
 */
export function polylineBBox(
    coords: LatLon[],
): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
    if (!Array.isArray(coords) || coords.length === 0) return null;
    let minLat = Infinity,
        maxLat = -Infinity,
        minLon = Infinity,
        maxLon = -Infinity;
    for (const pt of coords) {
        if (pt.lat < minLat) minLat = pt.lat;
        if (pt.lat > maxLat) maxLat = pt.lat;
        if (pt.lon < minLon) minLon = pt.lon;
        if (pt.lon > maxLon) maxLon = pt.lon;
    }
    return { minLat, maxLat, minLon, maxLon };
}
