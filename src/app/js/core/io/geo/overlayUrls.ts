// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   OVERLAY URL BUILDER — Satellite imagery for boundary overlays
   ================================================================

   Gera imagem satellite para overlay em boundary elements via
   tile stitching client-side (Sentinel-2 Cloudless by EOX).

   Sem API key. Sem dependencia de serviços proprietarios.
   Fallback: Sentinel-2 2021 → Sentinel-2 2018 → OpenStreetMap.

   ================================================================ */

import { SUPABASE_URL } from '../../../supabase-config.js';
import { relativeToUTM, utmToWGS84 } from './coordinates.js';
import { stitchTiles, stitchTilesWithProvider } from './tileStitcher.js';

function _normalizeOverlaySize(/** @type {any} */ size: any) {
    if (!Number.isFinite(size) || size <= 0) return 1024;
    return Math.round(Math.max(512, Math.min(1024, size)));
}

function _parseOverlayFallbackEntries(/** @type {any} */ rawValue: any) {
    if (typeof rawValue !== 'string' || !rawValue.trim()) return [];
    const raw = rawValue.trim();

    if (raw.startsWith('[')) {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    return raw
        .split(/[,\n;]/)
        .map((value) => value.trim())
        .filter(Boolean);
}

// Default aerial fallback hospedado no Supabase Storage - uploaded via
// scripts/upload-aerial-fallback.mjs. Usado como ultimo recurso quando todos
// providers dinamicos (Sentinel-2, WMS, tile stitcher) falharem.
// Calvin requested 2026-04-20: fallback universal para quando sources online
// nao respondem (CORS, 503, rate limit).
const DEFAULT_SUPABASE_AERIAL_FALLBACK = 'public/aerial-fallbacks/default.png';

function _resolveConfiguredOverlayFallbackUrls() {
    const directUrls =
        typeof localStorage !== 'undefined'
            ? _parseOverlayFallbackEntries(localStorage.getItem('ecbyts-aerial-fallback-urls'))
            : [];
    const supabasePaths =
        typeof localStorage !== 'undefined'
            ? _parseOverlayFallbackEntries(localStorage.getItem('ecbyts-aerial-fallback-supabase-paths'))
            : [];

    // Garante que default hardcoded entra sempre no final da chain
    // (user-configured paths tem prioridade)
    if (!supabasePaths.includes(DEFAULT_SUPABASE_AERIAL_FALLBACK)) {
        supabasePaths.push(DEFAULT_SUPABASE_AERIAL_FALLBACK);
    }

    const supabaseUrls = supabasePaths.map((entry) => {
        if (!entry) return '';
        if (/^https?:\/\//i.test(entry)) return entry;
        return `${SUPABASE_URL}/storage/v1/object/public/${entry.replace(/^\/+/, '')}`;
    });

    return [...directUrls, ...supabaseUrls].filter((url) => typeof url === 'string' && url.trim());
}

function _dedupeOverlayUrls(/** @type {any} */ urls: any) {
    /** @type {string[]} */
    const unique = [];
    const seen = new Set();
    for (const url of urls) {
        if (typeof url !== 'string') continue;
        const normalized = url.trim();
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        unique.push(normalized);
    }
    return unique;
}

async function _attemptPreferredProvider(/** @type {any} */ sw: any, /** @type {any} */ ne: any, /** @type {any} */ size: any, /** @type {any} */ providerIndex: any) {
    if (!Number.isFinite(providerIndex) || providerIndex < 0) return '';
    try {
        return (await stitchTilesWithProvider(providerIndex, sw, ne, size)) || '';
    } catch {
        return '';
    }
}

function _buildConfiguredFallbackResult(/** @type {any} */ configuredFallbackUrls: any) {
    return {
        overlayUrl: configuredFallbackUrls[0] || '',
        overlayFallbackUrls: configuredFallbackUrls.slice(1),
    };
}

// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------

/**
 * Build aerial overlay for a rectangular area around current origin.
 * Compõe tiles Sentinel-2 em imagem para o bbox do boundary.
 *
 * @param {number} halfW - Half-width in meters (X axis)
 * @param {number} halfL - Half-length in meters (Z axis)
 * @param {number} [providerIndex] - Specific tile provider index (omit for fallback chain)
 * @returns {Promise<{ overlayUrl: string, overlayFallbackUrls: string[] }>}
 */
export async function buildOverlayUrls(halfW: any, halfL: any, providerIndex: any) {
    const sw = utmToWGS84(relativeToUTM({ x: -halfW, y: 0, z: halfL }));
    const ne = utmToWGS84(relativeToUTM({ x: halfW, y: 0, z: -halfL }));

    const extentM = Math.max(halfW, halfL) * 2;
    const size = _normalizeOverlaySize(Math.max(768, extentM * 1.25));

    return buildOverlayUrlsFromBbox(sw, ne, size, providerIndex);
}

/**
 * Build aerial overlay from pre-computed WGS84 coordinates.
 * Versão para callers que já possuem sw/ne em WGS84.
 *
 * @param {{ latitude: number, longitude: number }} sw - Southwest corner
 * @param {{ latitude: number, longitude: number }} ne - Northeast corner
 * @param {number} [size=256] - Output size in pixels
 * @param {number} [ne] - Specific tile provider index (omit for fallback chain)
 * @returns {Promise<{ overlayUrl: string, overlayFallbackUrls: string[] }>}
 */
export async function buildOverlayUrlsFromBbox(sw: any, ne: any, size = 1024, providerIndex: any) {
    const normalizedSize = _normalizeOverlaySize(size);
    const configuredFallbackUrls = _resolveConfiguredOverlayFallbackUrls();
    const preferredUrl = await _attemptPreferredProvider(sw, ne, normalizedSize, providerIndex);

    // Quando o usuario escolhe um provider explicitamente, nao devemos cair
    // silenciosamente em outro provider "livre" da cadeia generica, porque
    // isso mascara a troca visual e faz USGS/OSM parecerem ESRI.
    if (Number.isFinite(providerIndex) && (providerIndex ?? 0) >= 0) {
        if (preferredUrl) {
            const resolvedUrls = _dedupeOverlayUrls([preferredUrl, ...configuredFallbackUrls]);
            return {
                overlayUrl: resolvedUrls[0] || '',
                overlayFallbackUrls: resolvedUrls.slice(1),
            };
        }
        return _buildConfiguredFallbackResult(configuredFallbackUrls);
    }

    const stitchedFallbackUrl = preferredUrl ? '' : await stitchTiles(sw, ne, normalizedSize);
    const resolvedUrls = _dedupeOverlayUrls([preferredUrl, stitchedFallbackUrl, ...configuredFallbackUrls]);

    return {
        overlayUrl: resolvedUrls[0] || '',
        overlayFallbackUrls: resolvedUrls.slice(1),
    };
}
