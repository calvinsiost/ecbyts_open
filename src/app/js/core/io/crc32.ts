// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: CRC-32 - Deteccao de corrupcao para chaves ECO4+
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   CRC-32 (IEEE 802.3)
   ================================================================

   Implementacao sem dependencias do algoritmo CRC-32 usando
   lookup table pre-computada com polinomio 0xEDB88320.

   Substitui o checksum mod-65536 (4 hex chars) do formato ECO1/ECO2
   por um CRC-32 de 8 hex chars, com deteccao de corrupcao muito
   superior (probabilidade de colisao: 1 em 4 bilhoes vs 1 em 65536).

   NOTA: CRC-32 e para deteccao de corrupcao acidental, nao para
   seguranca anti-tamper. Anti-tamper usa ECDSA (blockchain/v3).

   ================================================================ */

// ----------------------------------------------------------------
// LOOKUP TABLE (pre-computada uma vez no carregamento do modulo)
// ----------------------------------------------------------------

const TABLE = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    TABLE[i] = crc;
}

// ----------------------------------------------------------------
// FUNCAO PRINCIPAL
// ----------------------------------------------------------------

/**
 * Calcula CRC-32 de um Uint8Array.
 *
 * EXEMPLO:
 *   crc32(new TextEncoder().encode('123456789'))  // 'CBF43926'
 *   crc32(new Uint8Array(0))                      // '00000000'
 */
export function crc32(bytes: Uint8Array): string {
    let crc = 0xffffffff;

    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i] ?? 0;
        crc = (crc >>> 8) ^ (TABLE[(crc ^ byte) & 0xff] ?? 0);
    }

    // Inverte bits e converte para hex uppercase de 8 chars
    return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}
