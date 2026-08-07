// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   GEO ADJUSTMENTS HELPERS (pure)
   Applies planar transforms to local coordinates:
   rotation (degrees) + meter offsets.
   ================================================================ */

export interface GeoAdjustments2DArgs {
    /** Local X coordinate (east/west). */
    x?: number;
    /** Local Z coordinate (north/south). */
    z?: number;
    /** X-axis offset in meters (default 0). */
    offsetX?: number;
    /** Z-axis offset in meters (default 0). */
    offsetY?: number;
    /** Rotation in degrees around the local origin (default 0). */
    rotationDeg?: number;
}

export interface GeoAdjustments2DResult {
    x: number;
    z: number;
}

/**
 * Apply 2D adjustments to local X/Z coordinates.
 */
export function applyGeoAdjustments2D(args: GeoAdjustments2DArgs | null | undefined): GeoAdjustments2DResult {
    const x = Number(args?.x || 0);
    const z = Number(args?.z || 0);
    const offsetX = Number(args?.offsetX || 0);
    const offsetY = Number(args?.offsetY || 0);
    const rotationDeg = Number(args?.rotationDeg || 0);

    const theta = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);

    const xr = x * cos - z * sin;
    const zr = x * sin + z * cos;

    return {
        x: xr + offsetX,
        z: zr + offsetY,
    };
}
