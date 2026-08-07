// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   DEEP CLONE — JSON-safe structural clone (consolidação dedup)

   Pattern alvo: `JSON.parse(JSON.stringify(x))` (15+ sites pré-existentes)

   Limitações conhecidas (mesmo escopo do pattern original):
   - Funciona apenas com tipos JSON-safe (no Date, Map, Set, RegExp, fn)
   - Date → string ISO; Map/Set → {}; undefined em arrays → null
   - NaN/Infinity → null

   Para clone com tipos avançados, considerar structuredClone() nativo
   (modern browsers + Node 17+) — não usado aqui para manter compat com
   ambientes legados onde o pattern original já roda.

   Pure: sem state, sem DOM.
   ================================================================ */

/**
 * Deep clone JSON-safe value via serialize/parse roundtrip.
 *
 * @param value - any JSON-serializable value (objects, arrays, primitives)
 * @returns deep-cloned copy
 *
 * Examples:
 *   deepClone({a: 1, b: [2, 3]})  → new instance with same shape
 *   deepClone(null)               → null
 *   deepClone(undefined)          → undefined
 *   deepClone([{x: 1}])           → new array with new inner objects
 *
 * Throws: JSON.stringify can throw on circular refs (TypeError). Callers
 * with non-JSON-safe data should use structuredClone() or a domain-specific
 * cloner.
 */
export function deepClone<T>(value: T): T {
    if (value === undefined) return undefined as T;
    if (value === null) return null as T;
    return JSON.parse(JSON.stringify(value));
}
