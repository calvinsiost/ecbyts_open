// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GEOREFERENCE — Pixel-to-WGS84 coordinate transformation
   ================================================================

   Converte contornos de pixel space (0-511 na grade 512x512) para
   coordenadas reais WGS84 [longitude, latitude] via cadeia:

     Pixel (x, y) → Three.js world (x, z) → UTM → WGS84 (lon, lat)

   Reutiliza relativeToWGS84() de io/geo/coordinates.js para a
   conversao Three.js → WGS84.

   REGRAS CRITICAS:
   1. Y-AXIS INVERSAO: Pixel Y=0 (topo) → extent.maxZ (norte/longe).
      Pixel Y=511 (base) → extent.minZ (sul/perto).
      Mesmo padrao de colorAnalysis.js linha 470.

   2. WINDING ORDER (RFC 7946): Anel externo DEVE ser CCW (anti-horario).
      Anel interno (hole) DEVE ser CW (horario). Verifica via Signed
      Shoelace Area e inverte se necessario.

   3. PRECISAO: Coordenadas WGS84 truncadas a 6 casas decimais
      (~0.11m de precisao) para otimizar payload.

   ================================================================ */

import { relativeToWGS84 } from '../../io/geo/coordinates.js';

// ----------------------------------------------------------------
// PIXEL SCALE - Compute meters-per-pixel from extent
// ----------------------------------------------------------------

/**
 * Compute scale factors for pixel-to-world conversion.
 * Calcula metros por pixel a partir do extent e dimensoes da imagem.
 *
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} extent - in Three.js world coords
 * @param {number} extent - Image width in pixels (e.g. 512)
 * @param {number} imgW - Image height in pixels (e.g. 512)
 * @returns {{ metersPerPixelX: number, metersPerPixelZ: number, worldW: number, worldH: number }}
 */
export function computePixelScale(extent: any, imgW: any, imgH: any) {
    const worldW = extent.maxX - extent.minX;
    const worldH = extent.maxZ - extent.minZ;
    if (worldW <= 0 || worldH <= 0 || imgW <= 0 || imgH <= 0) {
        throw new Error(
            `Invalid extent or image dimensions: worldW=${worldW}, worldH=${worldH}, imgW=${imgW}, imgH=${imgH}`,
        );
    }
    return {
        metersPerPixelX: worldW / imgW,
        metersPerPixelZ: worldH / imgH,
        worldW,
        worldH,
    };
}

// ----------------------------------------------------------------
// CONTOUR TO WORLD - Pixel contour → Three.js world coords
// ----------------------------------------------------------------

/**
 * Convert pixel-space contour to Three.js world coordinates.
 * ATENCAO: Y invertido! Pixel Y=0 (topo) → maxZ, Y=511 (base) → minZ.
 *
 * @param {Array<{x: number, y: number}>} pixelContour - Pixel coords
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} extent
 * @param {number} pixelContour - Image width (512)
 * @param {number} extent - Image height (512)
 * @returns {Array<{x: number, z: number}>} - Three.js world coords
 */
export function contourToWorld(pixelContour: any, extent: any, imgW: any, imgH: any) {
    const worldW = extent.maxX - extent.minX;
    const worldH = extent.maxZ - extent.minZ;

    return pixelContour.map((pt: any) => ({
        x: extent.minX + (pt.x / imgW) * worldW,
        z: extent.maxZ - (pt.y / imgH) * worldH
    }));
}

// ----------------------------------------------------------------
// CONTOUR TO WGS84 - Pixel contour → [lon, lat] GeoJSON ring
// ----------------------------------------------------------------

/**
 * Convert pixel-space contour to WGS84 coordinate ring.
 * Aplica inversao de Y-axis e usa relativeToWGS84() para conversao.
 * Coordenadas truncadas a 6 decimais (RFC 7946 best practice).
 *
 * @param {Array<{x: number, y: number}>} pixelContour - Pixel coords
 * @param {{minX:number,maxX:number,minZ:number,maxZ:number}} extent
 * @param {number} pixelContour - Image width (512)
 * @param {number} extent - Image height (512)
 * @returns {Array<[number, number]>} - GeoJSON ring [[lon, lat], ...]
 */
export function contourToWGS84(pixelContour: any, extent: any, imgW: any, imgH: any) {
    const worldW = extent.maxX - extent.minX;
    const worldH = extent.maxZ - extent.minZ;

    return pixelContour.map((pt: any) => {
        // Pixel → Three.js world (with Y-axis inversion)
        const worldX = extent.minX + (pt.x / imgW) * worldW;
        const worldZ = extent.maxZ - (pt.y / imgH) * worldH;

        // Three.js world → WGS84 via UTM
        const wgs = relativeToWGS84({ x: worldX, y: 0, z: worldZ });

        // Truncate to 6 decimal places (~0.11m precision)
        return [Number(wgs.longitude.toFixed(6)), Number(wgs.latitude.toFixed(6))];
    });
}

// ----------------------------------------------------------------
// WINDING ORDER - Ensure RFC 7946 compliance
// ----------------------------------------------------------------

/**
 * Compute signed area of a coordinate ring using Shoelace formula.
 * Valor positivo = CCW (anti-horario), negativo = CW (horario).
 *
 * @param {Array<[number, number]>} ring - [[lon, lat], ...]
 * @returns {number} - Signed area (positive = CCW, negative = CW)
 */
export function signedArea(ring: any) {
    let area = 0;
    const n = ring.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += ring[i][0] * ring[j][1];
        area -= ring[j][0] * ring[i][1];
    }
    return area / 2;
}

/**
 * Ensure GeoJSON ring has correct winding order per RFC 7946.
 * Anel externo → CCW (anti-horario, signed area > 0).
 * Anel interno (hole) → CW (horario, signed area < 0).
 * Inverte o array se a orientacao estiver errada.
 *
 * @param {Array<[number, number]>} ring - Coordinate ring
 * @param {boolean} isHole - true for interior ring, false for exterior
 * @returns {Array<[number, number]>} - Ring with correct winding
 */
export function ensureWinding(ring: any, isHole: any) {
    const area = signedArea(ring);

    if (isHole) {
        // Holes must be CW (negative area)
        return area > 0 ? ring.slice().reverse() : ring;
    } else {
        // Exterior must be CCW (positive area)
        return area < 0 ? ring.slice().reverse() : ring;
    }
}

/**
 * Ensure GeoJSON ring is closed (first point === last point).
 * RFC 7946 requer que aneis sejam fechados.
 *
 * @param {Array<[number, number]>} ring
 * @returns {Array<[number, number]>} - Closed ring
 */
export function ensureClosed(ring: any) {
    if (ring.length < 2) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        return [...ring, [first[0], first[1]]];
    }
    return ring;
}

// ----------------------------------------------------------------
// AREA & PERIMETER - Geometric measurements in world space
// ----------------------------------------------------------------

/**
 * Compute polygon area in square meters from world-space contour.
 * Usa formula Shoelace em coordenadas Three.js (metros).
 *
 * @param {Array<{x: number, z: number}>} worldContour - Three.js coords
 * @returns {number} - Area in square meters (absolute value)
 */
export function computeAreaM2(worldContour: any) {
    if (worldContour.length < 3) return 0;

    let area = 0;
    const n = worldContour.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += worldContour[i].x * worldContour[j].z;
        area -= worldContour[j].x * worldContour[i].z;
    }

    return Math.abs(area / 2);
}

/**
 * Compute polygon perimeter in meters from world-space contour.
 * Soma distancias euclidianas entre vertices consecutivos.
 *
 * @param {Array<{x: number, z: number}>} worldContour - Three.js coords
 * @returns {number} - Perimeter in meters
 */
export function computePerimeterM(worldContour: any) {
    if (worldContour.length < 2) return 0;

    let perimeter = 0;
    const n = worldContour.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const dx = worldContour[j].x - worldContour[i].x;
        const dz = worldContour[j].z - worldContour[i].z;
        perimeter += Math.sqrt(dx * dx + dz * dz);
    }

    return perimeter;
}

/**
 * Compute LineString length in meters from world-space path.
 * Para estradas e rios que sao LineString (nao fechados).
 *
 * @param {Array<{x: number, z: number}>} worldPath - Three.js coords
 * @returns {number} - Length in meters
 */
export function computeLengthM(worldPath: any) {
    if (worldPath.length < 2) return 0;

    let length = 0;
    for (let i = 1; i < worldPath.length; i++) {
        const dx = worldPath[i].x - worldPath[i - 1].x;
        const dz = worldPath[i].z - worldPath[i - 1].z;
        length += Math.sqrt(dx * dx + dz * dz);
    }

    return length;
}
