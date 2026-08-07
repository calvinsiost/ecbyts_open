// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: CRS Adapter (input normalization and contract hardening)

/* ================================================================
   crsAdapter.ts
   ---------------------------------------------------------------
   Normalizes CRS input contracts for conversion helpers:
   - WGS84 accepts canonical { latitude, longitude } and { lat, lon }
   - UTM validates basic fields and normalizes hemisphere (N/S)
   ================================================================ */

export interface Wgs84Input {
    readonly latitude?: unknown;
    readonly longitude?: unknown;
    readonly lat?: unknown;
    readonly lon?: unknown;
}

export interface NormalizedWgs84Input {
    readonly latitude: number;
    readonly longitude: number;
    readonly valid: boolean;
    readonly source: 'canonical' | 'alias' | 'unknown';
}

export interface UtmInput {
    readonly easting?: unknown;
    readonly northing?: unknown;
    readonly zone?: unknown;
    readonly hemisphere?: unknown;
}

export interface NormalizedUtmInput {
    readonly easting: number;
    readonly northing: number;
    readonly zone: number;
    readonly hemisphere: 'N' | 'S';
    readonly valid: boolean;
}

function isRecord(input: unknown): input is Record<string, unknown> {
    return input !== null && typeof input === 'object';
}

function hasOwn(input: unknown, key: string): input is Record<string, unknown> {
    return isRecord(input) && Object.prototype.hasOwnProperty.call(input, key);
}

function getField(input: unknown, key: string): unknown {
    return isRecord(input) ? input[key] : undefined;
}

export function normalizeWGS84Input(input: Wgs84Input | unknown): NormalizedWgs84Input {
    const hasCanonical = hasOwn(input, 'latitude') && hasOwn(input, 'longitude');
    const hasAlias = hasOwn(input, 'lat') && hasOwn(input, 'lon');

    const latitude = Number(hasCanonical ? getField(input, 'latitude') : getField(input, 'lat'));
    const longitude = Number(hasCanonical ? getField(input, 'longitude') : getField(input, 'lon'));

    const finite = Number.isFinite(latitude) && Number.isFinite(longitude);
    const rangeOk = finite && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;

    return {
        latitude,
        longitude,
        valid: rangeOk,
        source: hasCanonical ? 'canonical' : hasAlias ? 'alias' : 'unknown',
    };
}

export function normalizeUTMInput(input: UtmInput | unknown): NormalizedUtmInput {
    const easting = Number(getField(input, 'easting'));
    const northing = Number(getField(input, 'northing'));
    const zone = Number(getField(input, 'zone'));
    const hemisphereRaw = String(getField(input, 'hemisphere') || '').toUpperCase();
    const hemisphere = hemisphereRaw === 'N' ? 'N' : 'S';

    const valid =
        Number.isFinite(easting) && Number.isFinite(northing) && Number.isFinite(zone) && zone >= 1 && zone <= 60;

    return { easting, northing, zone, hemisphere, valid };
}
