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
   HELPERS COMPARTILHADOS DE CODIFICACAO (LEAF)
   ================================================================

   Modulo-folha (leaf) sem dependencias internas de io/.
   Contem as primitivas de criptografia/conversao usadas tanto
   pelo encoder.js quanto pelo decoder.js.

   Extraido para quebrar o ciclo decoder.js -> encoder.js:
   - decoder.js importa as primitivas daqui (folha, sem ciclo)
   - encoder.js re-exporta as primitivas daqui para preservar a API
     publica (modulos externos continuam podendo importar de encoder.js)

   FUNCOES:
   - xorCrypt(data, salt)      - ofuscacao XOR reversivel
   - checksum(bytes)           - checksum mod-65536 (4 hex)
   - toBase64URL(bytes)        - bytes -> Base64URL
   - fromBase64URL(str)        - Base64URL -> bytes

   ================================================================ */
// ----------------------------------------------------------------
// FUNCOES DE CRIPTOGRAFIA
// ----------------------------------------------------------------
/**
 * Criptografa/descriptografa bytes usando XOR com salt.
 *
 * COMO FUNCIONA O XOR:
 * - XOR e uma operacao binaria reversivel
 * - A XOR B = C, e C XOR B = A
 * - Ou seja, aplicar XOR duas vezes com a mesma chave volta ao original
 *
 * @param {Uint8Array} data - Dados a processar
 * @param {Uint8Array} salt - Chave de criptografia
 * @returns {Uint8Array} - Dados processados
 *
 * NOTA: XOR nao e criptografia segura!
 * E apenas ofuscacao para evitar edicao casual.
 * Nao use para dados sensiveis.
 */
export function xorCrypt(data: any, salt: any) {
    return data.map((byte: any, index: any) => {
        // Usa bytes do salt ciclicamente
        // Se salt tem 8 bytes e data tem 100, repete o salt
        return byte ^ salt[index % salt.length];
    });
}
/**
 * Calcula checksum de verificacao.
 *
 * PARA QUE SERVE:
 * - Detecta se a chave foi corrompida ou alterada
 * - Na importacao, comparamos o checksum calculado com o da chave
 *
 * @param {Uint8Array} bytes - Dados para calcular
 * @returns {string} - Checksum em hexadecimal (4 caracteres)
 *
 * ALGORITMO:
 * - Soma todos os bytes
 * - Aplica modulo 65536 (2^16)
 * - Converte para hex maiusculo
 */
export function checksum(bytes: any) {
    let sum = 0;
    bytes.forEach((byte: any) => {
        sum = (sum + byte) % 65536;
    });
    return sum.toString(16).toUpperCase().padStart(4, '0');
}
// ----------------------------------------------------------------
// FUNCOES DE CONVERSAO BASE64
// ----------------------------------------------------------------
/**
 * Converte bytes para Base64URL.
 *
 * POR QUE BASE64URL?
 * - Base64 normal usa + / = que sao problematicos em URLs
 * - Base64URL substitui por - _ e remove padding
 * - Resultado e seguro para usar em URLs
 *
 * @param {Uint8Array} bytes - Bytes a converter
 * @returns {string} - String Base64URL
 */
export function toBase64URL(bytes: any) {
    // Converte bytes para string binaria
    let binary = '';
    bytes.forEach((byte: any) => {
        binary += String.fromCharCode(byte);
    });
    // Codifica em Base64
    const base64 = btoa(binary);
    // Converte para Base64URL
    return base64
        .replace(/\+/g, '-') // + vira -
        .replace(/\//g, '_') // / vira _
        .replace(/=+$/g, ''); // Remove padding (=)
}
/**
 * Converte Base64URL de volta para bytes.
 *
 * @param {string} str - String Base64URL
 * @returns {Uint8Array} - Bytes decodificados
 */
export function fromBase64URL(str: string) {
    // Converte Base64URL para Base64 normal
    let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
    // Adiciona padding se necessario
    const padding = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padding);
    // Decodifica Base64 para string binaria
    const binary = atob(base64);
    // Converte string binaria para bytes
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
