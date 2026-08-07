// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Wave PPPP1 — Pure-logic extraction (SPEC_UI_REUSE_OPTIMIZATION_PROGRAM P1).
//
// Strategy: extract DOM-free IDB cache key + imagery result normalization from
// handlers/imagery.js (#24 monolito 1151 LOC). Pure: zero document/window/IDB.

function swLatNum(corner: any): number {
    if (!corner || typeof corner !== 'object') return 0;
    const n = Number(corner.latitude);
    return Number.isFinite(n) ? n : 0;
}
function swLonNum(corner: any): number {
    if (!corner || typeof corner !== 'object') return 0;
    const n = Number(corner.longitude);
    return Number.isFinite(n) ? n : 0;
}

/**
 * Build deterministic IDB cache key for imagery tile (provider × bbox × size).
 * 4-decimal precision in lat/lon (~11m at equator) → cache hit-rate balance.
 *
 * @param {number} providerIdx
 * @param {{latitude:number, longitude:number}} sw - southwest corner
 * @param {{latitude:number, longitude:number}} ne - northeast corner
 * @param {number} sw - output image size
 * @returns {string}
 */
export function buildImageryCacheKey(providerIdx: any, sw: any, ne: any, size: any): string {
    const safeIdx = Number.isFinite(providerIdx) ? providerIdx : 0;
    const safeSwLat = swLatNum(sw);
    const safeSwLon = swLonNum(sw);
    const safeNeLat = swLatNum(ne);
    const safeNeLon = swLonNum(ne);
    const safeSize = Number.isFinite(size) ? size : 0;
    return `ecbyts-imagery-${safeIdx}-${safeSwLat.toFixed(4)}_${safeSwLon.toFixed(4)}_${safeNeLat.toFixed(4)}_${safeNeLon.toFixed(4)}_${safeSize}`;
}

/**
 * Normalize imagery fetch result to canonical {overlayUrl, overlayFallbackUrls} shape.
 *
 * - string entry → {overlayUrl: string, overlayFallbackUrls: []}
 * - null/non-object → empty shape
 * - object → normalize fields, filter fallback strings
 *
 * @param {string|{overlayUrl?:string, overlayFallbackUrls?:string[]}|null|undefined} entry
 * @returns {{overlayUrl:string, overlayFallbackUrls:string[]}}
 */
export function normalizeImageryResult(entry: any): { overlayUrl: string; overlayFallbackUrls: string[] } {
    if (typeof entry === 'string') {
        return {
            overlayUrl: entry || '',
            overlayFallbackUrls: [],
        };
    }
    if (!entry || typeof entry !== 'object') {
        return { overlayUrl: '', overlayFallbackUrls: [] };
    }
    const overlayUrl = typeof entry.overlayUrl === 'string' ? entry.overlayUrl : '';
    const overlayFallbackUrls = Array.isArray(entry.overlayFallbackUrls)
        ? entry.overlayFallbackUrls.filter((url: any) => typeof url === 'string' && url.trim() !== '')
        : [];
    return { overlayUrl, overlayFallbackUrls };
}

/**
 * Check if normalized imagery result has any usable overlay URL.
 *
 * @param {{overlayUrl?:string, overlayFallbackUrls?:string[]}|null|undefined} result
 * @returns {boolean}
 */
export function hasAnyOverlayUrl(result: any): boolean {
    if (!result || typeof result !== 'object') return false;
    if (typeof result.overlayUrl === 'string' && result.overlayUrl.trim() !== '') return true;
    if (Array.isArray(result.overlayFallbackUrls)) {
        return result.overlayFallbackUrls.some((u: any) => typeof u === 'string' && u.trim() !== '');
    }
    return false;
}

/**
 * Validate WGS84 corner has finite latitude/longitude.
 *
 * @param {any} corner
 * @returns {boolean}
 */
export function isValidWgs84Corner(corner: any): boolean {
    if (!corner || typeof corner !== 'object') return false;
    const lat = Number(corner.latitude);
    const lon = Number(corner.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}
