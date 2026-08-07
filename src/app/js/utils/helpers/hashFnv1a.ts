// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   FNV-1a HASH (utils/helpers — Module C extraction)
   ================================================================

   FNV-1a 32-bit deterministic hash. Stable, fast, no crypto dependency.
   Use para audit-entry IDs, cache keys, content-derived identifiers.

   NÃO use para security (não cryptographic). Para LGPD pseudonymization,
   use core/ingestion/_ingesterAlgorithmsPure.ts::pseudonymize que
   também usa FNV-1a mas com formato Trab-XXXX.

   Extraído de 7+ implementações duplicadas (FNV puro). NÃO substitui
   variants DJB2-like (sequencer/clusters, modelVcs).
   ================================================================ */

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * FNV-1a 32-bit hash de string. Retorna unsigned int (0..2^32-1).
 * Usa Math.imul para multiplication overflow-safe em V8.
 *
 * NUNCA dá throw — strings vazias retornam offset basis (0x811c9dc5).
 */
export function fnv1aHash(s: any): number {
    const str = String(s ?? '');
    let h = FNV_OFFSET_BASIS;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME);
    }
    return h >>> 0;
}

/**
 * FNV-1a 32-bit hash em hex (lowercase) com zero-padding.
 *
 * @param s — input
 * @param padTo — número de hex chars (default 8 — full uint32). Use
 *   menos para slug curto (ex: 4 = 16-bit visible).
 */
export function fnv1aHashHex(s: any, padTo: number = 8): string {
    return fnv1aHash(s).toString(16).padStart(padTo, '0');
}
