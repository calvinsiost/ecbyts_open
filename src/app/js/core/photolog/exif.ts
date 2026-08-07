// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   EXIF BASIC PARSER — Lightweight GPS + Date extraction
   Parser leve de EXIF para arquivos JPEG.

   Extrai apenas GPS (lat/lng) e DateTimeOriginal do APP1 marker.
   Sem dependencia CDN — parsing puro de ArrayBuffer (~80 linhas).
   Referencia: EXIF 2.3 spec (CIPA DC-008-2012), TIFF 6.0 spec.
   GPS datum assumido: WGS84 (mandatorio pelo padrao EXIF 2.3).
   ================================================================ */

const EXIF_DEFAULT = Object.freeze({ gps: null, dateTaken: null, orientation: 0 });

type ExifResult = { gps: { lat: number; lng: number } | null; dateTaken: string | null; orientation: number };

/**
 * Extracts GPS coordinates, DateTimeOriginal and Orientation from JPEG EXIF.
 * Pure vanilla JS - no CDN dependency. Graceful on non-JPEG or corrupt data.
 *
 * @param buffer - JPEG file buffer
 */
export function extractExifBasic(buffer: ArrayBuffer): ExifResult {
    try {
        const view = new DataView(buffer);
        if (buffer.byteLength < 4) return { ...EXIF_DEFAULT };
        // Valida JPEG SOI marker
        if (view.getUint16(0) !== 0xffd8) return { ...EXIF_DEFAULT };

        let offset = 2;
        while (offset < buffer.byteLength - 4) {
            const marker = view.getUint16(offset);
            if (marker === 0xffe1) {
                // APP1 marker encontrado
                const segLen = view.getUint16(offset + 2);
                return _parseApp1(view, offset + 4, segLen - 2);
            }
            // Pula segmento para proximo marker
            if ((marker & 0xff00) !== 0xff00) break;
            const len = view.getUint16(offset + 2);
            offset += 2 + len;
        }
        return { ...EXIF_DEFAULT };
    } catch {
        return { ...EXIF_DEFAULT };
    }
}

/**
 * Parsa segmento APP1 (Exif header + TIFF IFDs).
 * @param view - inicio do segmento (apos marker+length)
 * @param start - tamanho do segmento
 */
function _parseApp1(view: DataView, start: number, len: number): ExifResult {
    const result: ExifResult = { gps: null, dateTaken: null, orientation: 0 };
    const end = Math.min(start + len, view.byteLength);

    // Verifica "Exif\0\0" header
    if (end - start < 14) return result;
    const exifStr = String.fromCharCode(
        view.getUint8(start),
        view.getUint8(start + 1),
        view.getUint8(start + 2),
        view.getUint8(start + 3),
    );
    if (exifStr !== 'Exif') return result;

    const tiffStart = start + 6; // apos "Exif\0\0"
    if (tiffStart + 8 > end) return result;

    // Detecta byte order (II = little-endian, MM = big-endian)
    const bo = view.getUint16(tiffStart);
    const le = bo === 0x4949;
    if (!le && bo !== 0x4d4d) return result;

    const _u16 = (off: number) => view.getUint16(off, le);
    const _u32 = (off: number) => view.getUint32(off, le);

    // IFD0
    const ifd0Off = tiffStart + _u32(tiffStart + 4);
    if (ifd0Off + 2 > end) return result;

    const ifd0Count = _u16(ifd0Off);
    let gpsIfdPointer = 0;
    let exifIfdPointer = 0;

    for (let i = 0; i < ifd0Count; i++) {
        const entryOff = ifd0Off + 2 + i * 12;
        if (entryOff + 12 > end) break;
        const tag = _u16(entryOff);
        if (tag === 0x0112) {
            // Orientation
            result.orientation = _u16(entryOff + 8);
        } else if (tag === 0x8825) {
            // GPSInfo IFD pointer
            gpsIfdPointer = _u32(entryOff + 8);
        } else if (tag === 0x8769) {
            // ExifIFD pointer
            exifIfdPointer = _u32(entryOff + 8);
        }
    }

    // Parse ExifIFD para DateTimeOriginal
    if (exifIfdPointer) {
        const exifOff = tiffStart + exifIfdPointer;
        if (exifOff + 2 <= end) {
            const exifCount = _u16(exifOff);
            for (let i = 0; i < exifCount; i++) {
                const entryOff = exifOff + 2 + i * 12;
                if (entryOff + 12 > end) break;
                const tag = _u16(entryOff);
                if (tag === 0x9003) {
                    // DateTimeOriginal - ASCII string at offset
                    const strOff = tiffStart + _u32(entryOff + 8);
                    if (strOff + 19 <= end) {
                        const chars: number[] = [];
                        for (let c = 0; c < 19; c++) chars.push(view.getUint8(strOff + c));
                        result.dateTaken = String.fromCharCode(...chars);
                    }
                    break;
                }
            }
        }
    }

    // Parse GPS IFD
    if (gpsIfdPointer) {
        const gpsOff = tiffStart + gpsIfdPointer;
        if (gpsOff + 2 <= end) {
            const gpsCount = _u16(gpsOff);
            let latRef = 'N',
                lngRef = 'E';
            let latRat: number[] | null = null,
                lngRat: number[] | null = null;

            for (let i = 0; i < gpsCount; i++) {
                const entryOff = gpsOff + 2 + i * 12;
                if (entryOff + 12 > end) break;
                const tag = _u16(entryOff);

                if (tag === 1) {
                    // GPSLatitudeRef
                    latRef = String.fromCharCode(view.getUint8(entryOff + 8));
                } else if (tag === 2) {
                    // GPSLatitude - 3 rationals
                    latRat = _readRationals(view, tiffStart + _u32(entryOff + 8), 3, le, end);
                } else if (tag === 3) {
                    // GPSLongitudeRef
                    lngRef = String.fromCharCode(view.getUint8(entryOff + 8));
                } else if (tag === 4) {
                    // GPSLongitude - 3 rationals
                    lngRat = _readRationals(view, tiffStart + _u32(entryOff + 8), 3, le, end);
                }
            }

            if (latRat && lngRat && latRat.length >= 3 && lngRat.length >= 3) {
                const [latD, latM, latS] = latRat as [number, number, number];
                const [lngD, lngM, lngS] = lngRat as [number, number, number];
                let lat = latD + latM / 60 + latS / 3600;
                let lng = lngD + lngM / 60 + lngS / 3600;
                if (latRef === 'S') lat = -lat;
                if (lngRef === 'W') lng = -lng;
                // Valida faixa razoavel
                if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
                    result.gps = { lat, lng };
                }
            }
        }
    }

    return result;
}

/**
 * Le N valores racionais (numerador/denominador uint32) do buffer.
 * Cada rational ocupa 8 bytes.
 * @param view - offset no buffer
 * @param off - quantidade de rationals
 * @param count - little-endian
 * @param le - limite do buffer
 * @returns array de valores decimais ou null se fora dos limites
 */
function _readRationals(view: DataView, off: number, count: number, le: boolean, end: number): number[] | null {
    if (off + count * 8 > end) return null;
    const vals: number[] = [];
    for (let i = 0; i < count; i++) {
        const num = view.getUint32(off + i * 8, le);
        const den = view.getUint32(off + i * 8 + 4, le);
        vals.push(den === 0 ? 0 : num / den);
    }
    return vals;
}
