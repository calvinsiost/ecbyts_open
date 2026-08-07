// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   EXIF GPS EXTRACTOR - exifr first + inline JPEG fallback parser
   ================================================================

   Two-layer strategy:
   1) Try exifr (MIT) via CDN for broader format coverage.
   2) If unavailable/fails, fallback to inline JPEG EXIF parser.

   GPS tags (TIFF/EXIF spec):
   - 0x0001: GPSLatitudeRef ('N'|'S')
   - 0x0002: GPSLatitude (3 RATIONALs: degrees, minutes, seconds)
   - 0x0003: GPSLongitudeRef ('E'|'W')
   - 0x0004: GPSLongitude (3 RATIONALs: degrees, minutes, seconds)

   ================================================================ */

import { importCDN } from './cdnLoader.js';

const EXIFR_CDN = 'https://esm.sh/exifr@7.1.3';

/** @type {any|null} */
let _exifr: any = null;
let _exifrLoadAttempted = false;

/**
 * Extract GPS coordinates from image metadata.
 *
 * @param {File} file - Image file
 * @returns {Promise<{ lat: number, lon: number }|null>} WGS84 coords or null
 */
export async function extractExifGPS(file: any) {
    if (!file) return null;

    // Layer 1: exifr (JPEG/TIFF/HEIC/AVIF and others)
    const fromExifr = await _extractWithExifr(file);
    if (fromExifr) return fromExifr;

    // Layer 2: fallback parser for JPEG only
    if (!file.name.match(/\.jpe?g$/i)) return null;

    try {
        const slice = file.slice(0, 131072); // 128KB
        const buf = await slice.arrayBuffer();
        const view = new DataView(buf);

        // Verify JPEG SOI marker
        if (view.getUint16(0) !== 0xffd8) return null;

        // Find APP1 (EXIF) marker
        let offset = 2;
        while (offset < view.byteLength - 4) {
            const marker = view.getUint16(offset);
            const length = view.getUint16(offset + 2);

            if (marker === 0xffe1) {
                // APP1 found - check for "Exif\0\0" header
                const exifHeader = view.getUint32(offset + 4);
                if (exifHeader === 0x45786966) {
                    // "Exif"
                    return _parseExifGPS(view, offset + 10); // TIFF starts after "Exif\0\0"
                }
            }

            // Skip to next marker (non-SOS markers)
            if (marker === 0xffda) break; // SOS - no more metadata
            offset += 2 + length;
        }
    } catch (e) {
        console.debug('[exifGps] markerScan:', (e as Error)?.message || e);
        // Silent fallback
    }
    return null;
}

/**
 * Load exifr once (best effort).
 * @returns {Promise<any|null>}
 */
async function _loadExifr() {
    if (_exifrLoadAttempted) return _exifr;
    _exifrLoadAttempted = true;
    try {
        _exifr = await importCDN(EXIFR_CDN, { name: 'exifr' });
    } catch (e) {
        console.debug('[exifGps] loadExifr:', (e as Error)?.message || e);
        _exifr = null;
    }
    return _exifr;
}

/**
 * Try extracting GPS with exifr.
 * @param {File} file
 * @returns {Promise<{ lat: number, lon: number }|null>}
 */
async function _extractWithExifr(file: any) {
    const exifr = await _loadExifr();
    if (!exifr) return null;

    try {
        let out = null;
        if (typeof exifr.gps === 'function') {
            out = await exifr.gps(file);
        } else if (typeof exifr.parse === 'function') {
            out = await exifr.parse(file, { gps: true, pick: ['latitude', 'longitude'] });
        }

        const lat = Number(out?.latitude ?? out?.lat);
        const lon = Number(out?.longitude ?? out?.lon ?? out?.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
        if (lat === 0 && lon === 0) return null;

        return { lat, lon };
    } catch (e) {
        console.debug('[exifGps] parseLatLon:', (e as Error)?.message || e);
        return null;
    }
}

/**
 * Parse TIFF structure from EXIF APP1 to find GPS IFD.
 * @param {DataView} view
 * @param {number} tiffStart - Offset of TIFF header in DataView
 * @returns {{ lat: number, lon: number }|null}
 */
function _parseExifGPS(view: any, tiffStart: any) {
    // TIFF byte order
    const bo = view.getUint16(tiffStart);
    const le = bo === 0x4949; // 'II' = little-endian

    const getU16 = (/** @type {number} */ o: any) => view.getUint16(tiffStart + o, le);
    const getU32 = (/** @type {number} */ o: any) => view.getUint32(tiffStart + o, le);

    // Verify TIFF magic
    if (getU16(2) !== 0x002a) return null;

    // IFD0 offset
    const ifd0Offset = getU32(4);
    const numEntries = getU16(ifd0Offset);

    // Find GPS IFD pointer (tag 0x8825)
    let gpsIFDOffset = 0;
    for (let i = 0; i < numEntries; i++) {
        const entryOffset = ifd0Offset + 2 + i * 12;
        const tag = getU16(entryOffset);
        if (tag === 0x8825) {
            gpsIFDOffset = getU32(entryOffset + 8);
            break;
        }
    }

    if (!gpsIFDOffset) return null;

    // Parse GPS IFD
    const gpsEntries = getU16(gpsIFDOffset);
    let latRef = '';
    let lonRef = '';
    let latRationals = null;
    let lonRationals = null;

    for (let i = 0; i < gpsEntries; i++) {
        const entryOffset = gpsIFDOffset + 2 + i * 12;
        if (tiffStart + entryOffset + 12 > view.byteLength) break;

        const tag = getU16(entryOffset);
        const valueOffset = getU32(entryOffset + 8);

        switch (tag) {
            case 0x0001: // GPSLatitudeRef
                latRef = String.fromCharCode(view.getUint8(tiffStart + entryOffset + 8));
                break;
            case 0x0002: // GPSLatitude (3 RATIONALs)
                latRationals = _readRationals(view, tiffStart, valueOffset, le);
                break;
            case 0x0003: // GPSLongitudeRef
                lonRef = String.fromCharCode(view.getUint8(tiffStart + entryOffset + 8));
                break;
            case 0x0004: // GPSLongitude (3 RATIONALs)
                lonRationals = _readRationals(view, tiffStart, valueOffset, le);
                break;
        }
    }

    if (!latRationals || !lonRationals) return null;

    let lat = latRationals[0]! + latRationals[1]! / 60 + latRationals[2]! / 3600;
    let lon = lonRationals[0]! + lonRationals[1]! / 60 + lonRationals[2]! / 3600;

    if (latRef === 'S') lat = -lat;
    if (lonRef === 'W') lon = -lon;

    // Sanity check
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    if (lat === 0 && lon === 0) return null;

    return { lat, lon };
}

/**
 * Read 3 RATIONAL values (each = 2 x LONG) from EXIF.
 * @param {DataView} view
 * @param {number} tiffStart
 * @param {number} offset - Offset from TIFF header
 * @param {boolean} le - Little-endian
 * @returns {[number, number, number]|null}
 */
function _readRationals(view: any, tiffStart: any, offset: any, le: any) {
    const abs = tiffStart + offset;
    if (abs + 24 > view.byteLength) return null;

    const result = [];
    for (let i = 0; i < 3; i++) {
        const num = view.getUint32(abs + i * 8, le);
        const den = view.getUint32(abs + i * 8 + 4, le);
        result.push(den ? num / den : 0);
    }
    return /** @type {[number, number, number]} */ (result);
}
