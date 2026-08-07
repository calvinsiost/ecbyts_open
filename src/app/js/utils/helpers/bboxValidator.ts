// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// @since v0.2

/**
 * bboxValidator.ts - Validates bounding box objects for document assets.
 *
 * @module utils/validators/bboxValidator
 */

export interface Bbox {
    x: number;
    y: number;
    width: number;
    height: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

/**
 * Validate and sanitize a bbox object.
 * Returns a clean {x, y, width, height} or null if invalid.
 */
export function validateBbox(bbox: unknown): Bbox | null {
    if (!isRecord(bbox)) return null;

    const { x, y, width, height } = bbox;

    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number') {
        return null;
    }

    if (x < 0 || y < 0) return null;
    if (width <= 0 || height <= 0) return null;
    if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)) return null;

    return {
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: Math.round(width * 100) / 100,
        height: Math.round(height * 100) / 100,
    };
}
