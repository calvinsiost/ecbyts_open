// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   OBJECT GUARDS (utils/helpers — Module C extraction)
   ================================================================

   Type guards para distinguir plain objects de arrays/null/primitives.
   2 variantes com semânticas distintas — escolha consciente:

     - isObjectLike: !== null + typeof object + !Array. Permite class
       instances (Date, Map, Set, Custom).
     - isPlainObject: stricter — exige prototype === Object.prototype
       OR null (rejeita class instances). Use para safe JSON cloning.

   Extraído de 3 implementações privadas (3 sites com 3 semânticas
   levemente diferentes).
   ================================================================ */

/**
 * Object-like guard: aceita qualquer objeto não-null + não-array.
 * Inclui Date, Map, Set, class instances.
 *
 * Use para iteração genérica via Object.keys/Object.entries.
 */
export function isObjectLike(v: unknown): v is Record<string, unknown> {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Strict plain object guard: aceita SOMENTE {} literals OR
 * Object.create(null). Rejeita arrays + Date + Map + Set + class instances.
 *
 * Use para serialização JSON safety + deep clone safety.
 */
export function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (v === null || v === undefined) return false;
    if (typeof v !== 'object') return false;
    if (Array.isArray(v)) return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
}
