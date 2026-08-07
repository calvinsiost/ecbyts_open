// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   TO FINITE NUMBER — Defensive number coercion (consolidação dedup)

   Pattern alvo: `Number.isFinite(x) ? x : fallback` (95+ call sites
   em src/app/js).

   Helper canônico:
   - Coerces unknown → Number, returns fallback if NaN/Infinity/non-finite
   - Optional: aplica Math.max(min, ...) e Math.min(max, ...) em uma chamada
   - Pure: zero state, zero DOM, defensive (nunca throw)

   Substitui:
   - Number.isFinite(x) ? x : 0           → toFiniteNumber(x, 0)
   - Math.max(0, Number.isFinite(x) ? x : 0)  → toFiniteNumber(x, 0, { min: 0 })
   ================================================================ */

export interface ToFiniteNumberOptions {
    /** Floor value (inclusive). Default no floor. */
    min?: number;
    /** Ceiling value (inclusive). Default no ceiling. */
    max?: number;
}

/**
 * Coerce a value to a finite number with fallback.
 *
 * @param value - any value (number, string, null, undefined, etc.)
 * @param fallback - returned when value is not coerceable to finite number (default `0`)
 * @param opts - optional `{min, max}` clamp
 * @returns finite number, clamped to [min, max] if provided
 *
 * Examples:
 *   toFiniteNumber(42)                     → 42
 *   toFiniteNumber('3.14')                 → 3.14
 *   toFiniteNumber(NaN, 99)                → 99
 *   toFiniteNumber(null, 0)                → 0
 *   toFiniteNumber('not a number', 7)      → 7
 *   toFiniteNumber(-5, 0, { min: 0 })      → 0
 *   toFiniteNumber(150, 0, { max: 100 })   → 100
 */
export function toFiniteNumber(
    value: unknown,
    fallback: number = 0,
    opts: ToFiniteNumberOptions = {}
): number {
    // Defensive: null/undefined → fallback (Number(null) = 0 quirk).
    // Also reject boolean (true/false coerce to 1/0 which is rarely intended).
    let result: number;
    if (value === null || value === undefined || typeof value === 'boolean') {
        result = fallback;
    } else {
        const n = typeof value === 'number' ? value : Number(value);
        result = Number.isFinite(n) ? n : fallback;
    }
    if (typeof opts.min === 'number') result = Math.max(opts.min, result);
    if (typeof opts.max === 'number') result = Math.min(opts.max, result);
    return result;
}
