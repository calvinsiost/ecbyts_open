// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic helpers for handlers/quickActions.ts (geo overlap + library prioritization + string utils).
// DOM-free, window-free (modelBbox injected by caller). Extracted Wave BBBBB1 from quickActions.ts (347L).

export type Bbox = {
    south: number;
    west: number;
    north: number;
    east: number;
};

export function bboxOverlap(a: Bbox | null | undefined, b: Bbox | null | undefined): boolean {
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (
        !Number.isFinite(a.south) || !Number.isFinite(a.north) ||
        !Number.isFinite(a.west) || !Number.isFinite(a.east) ||
        !Number.isFinite(b.south) || !Number.isFinite(b.north) ||
        !Number.isFinite(b.west) || !Number.isFinite(b.east)
    ) {
        return false;
    }
    return a.south < b.north && a.north > b.south && a.west < b.east && a.east > b.west;
}

export function hasGeoOverlap(lib: unknown, modelBbox: Bbox | null | undefined): boolean {
    if (!modelBbox) return false;
    const l = lib as { contents?: { imagery?: unknown } } | null | undefined;
    const imagery = l?.contents?.imagery;
    if (!Array.isArray(imagery)) return false;
    return imagery.some((img: unknown) => {
        const i = img as { bbox?: unknown };
        if (!Array.isArray(i?.bbox) || i.bbox.length !== 4) return false;
        const [south, west, north, east] = i.bbox;
        if (
            typeof south !== 'number' || !Number.isFinite(south) ||
            typeof west !== 'number' || !Number.isFinite(west) ||
            typeof north !== 'number' || !Number.isFinite(north) ||
            typeof east !== 'number' || !Number.isFinite(east)
        ) {
            return false;
        }
        return bboxOverlap(modelBbox, { south, west, north, east });
    });
}

export function prioritizeLibsByGeo<T>(libs: ReadonlyArray<T>, modelBbox: Bbox | null | undefined): T[] {
    if (!Array.isArray(libs)) return [];
    return [...libs].sort((a, b) => {
        const aGeo = hasGeoOverlap(a, modelBbox);
        const bGeo = hasGeoOverlap(b, modelBbox);
        if (aGeo && !bGeo) return -1;
        if (!aGeo && bGeo) return 1;
        return 0;
    });
}

export function truncate(str: unknown, maxLen: unknown): string {
    const s = String(str ?? '');
    const max = Number(maxLen);
    if (!Number.isFinite(max) || max <= 0) return s;
    const cap = Math.floor(max);
    if (s.length <= cap) return s;
    return s.slice(0, cap - 1) + '…';
}

export function escapeTag(str: unknown): string {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function computeModelBboxFromOrigin(
    origin: { easting?: unknown; northing?: unknown; zone?: unknown; hemisphere?: unknown } | null | undefined,
    toWGS: (utm: { easting: number; northing: number; zone: unknown; hemisphere: unknown }) => { latitude: number; longitude: number },
    extentMeters: number = 2000,
): Bbox | null {
    if (!origin || typeof origin !== 'object') return null;
    const easting = Number(origin.easting);
    const northing = Number(origin.northing);
    if (!Number.isFinite(easting) || !Number.isFinite(northing)) return null;
    if (typeof toWGS !== 'function') return null;
    const extent = Number.isFinite(extentMeters) && extentMeters > 0 ? extentMeters : 2000;
    try {
        const sw = toWGS({ easting: easting - extent, northing: northing - extent, zone: origin.zone, hemisphere: origin.hemisphere });
        const ne = toWGS({ easting: easting + extent, northing: northing + extent, zone: origin.zone, hemisphere: origin.hemisphere });
        if (!sw || !ne) return null;
        return { south: sw.latitude, west: sw.longitude, north: ne.latitude, east: ne.longitude };
    } catch {
        return null;
    }
}
