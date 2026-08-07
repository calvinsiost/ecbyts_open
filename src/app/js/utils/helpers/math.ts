// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   MATH HELPERS (utils/helpers — Module C extraction)
   ================================================================

   Pure-logic math utilities. Inicial: clamp.
   Extraído de 11+ implementações duplicadas detectadas via
   grep -rn "^function clamp" — todas equivalentes a
   Math.max(min, Math.min(max, v)).
   ================================================================ */

/**
 * Clamp valor para [min, max]. NaN propaga (Math.max trata NaN como menor).
 * Para clamp [0, 1] use clamp01 (helper específico, hot path).
 *
 * @param value
 * @param min limit inferior (inclusive)
 * @param max limit superior (inclusive)
 */
export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

/** Clamp para [0, 1]. Hot path — escolhe override aritmética inline. */
export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

/** Linear interpolation. t deveria estar em [0,1] (não clamped — caller decide). */
export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
