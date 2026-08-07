// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   SAFE JSON PARSE — Defensive JSON.parse wrapper (consolidação dedup)

   Pattern alvo (>30 call sites em src/app/js):
     try { JSON.parse(raw) } catch { return fallback; }

   Helper canônico unifica:
   - Empty/null/undefined input → fallback (sem tentar parse)
   - Parse success → result
   - Parse throw → fallback + optional debug log via tag

   Pure: sem state, sem DOM.
   ================================================================ */

/**
 * Defensively parse a JSON string. Returns `fallback` on null/undefined/
 * empty input or parse error.
 *
 * @param input - raw string (or null/undefined)
 * @param fallback - value returned when parse fails or input is empty (default `null`)
 * @param tag - optional debug tag for `console.debug('[<tag>:json-parse]', e?.message)` on parse error
 *
 * Examples:
 *   safeJsonParse('{"a":1}')                  → { a: 1 }
 *   safeJsonParse('xyz')                      → null
 *   safeJsonParse('xyz', {})                  → {}
 *   safeJsonParse(null, [])                   → []
 *   safeJsonParse(localStorage.getItem('k'))  → parsed | null
 */
export function safeJsonParse<T = unknown>(
    input: string | null | undefined,
    fallback: T,
    tag?: string
): T;
export function safeJsonParse<T = unknown>(
    input: string | null | undefined
): T | null;
// Fallback `null` explícito + tag — padrão "não-setado distinguível"
// (ex.: loadFamilySelection). Retorna T | null.
export function safeJsonParse<T = unknown>(
    input: string | null | undefined,
    fallback: null,
    tag?: string
): T | null;
export function safeJsonParse<T = unknown>(
    input: string | null | undefined,
    fallback?: T | null,
    tag?: string
): T | null {
    const fb = (fallback === undefined ? null : fallback) as T | null;
    if (input === null || input === undefined || input === '') return fb;
    try {
        return JSON.parse(input) as T;
    } catch (e: any) {
        if (tag) {
            console.debug(`[${tag}:json-parse]`, e?.message || e);
        }
        return fb;
    }
}
