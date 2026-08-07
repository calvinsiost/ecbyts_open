// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   LLM CRYPTO PURE (Module C extraction)
   ================================================================

   3 helpers crypto extraídos de core/llm/client.ts. AES-GCM round-trip
   sem deps de Supabase/state — testáveis em Node 20+ via globalThis.crypto.

   Reusáveis por outros módulos que precisem cifrar/decifrar strings
   curtas com AES-GCM 256 (LLM keys, OAuth tokens, secrets locais).
   ================================================================ */

/**
 * Gera salt aleatório de 32 bytes como hex string (64 chars).
 * Usado como input para PBKDF2 key derivation (LLM key storage Supabase).
 *
 * Determinístico: NÃO — usa crypto.getRandomValues.
 * Tests: validam length+formato, não o valor.
 */
export function generateSalt(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Cifra plaintext em base64(iv || ciphertext) usando AES-GCM 256.
 * IV de 12 bytes gerado por crypto.getRandomValues — nunca reusado.
 *
 * Layout output: 12-byte IV concatenado com ciphertext, depois base64.
 *
 * @param key — CryptoKey AES-GCM 256 importada (caller deriva via PBKDF2)
 * @param plaintext — string a cifrar
 */
export async function aesEncrypt(key: CryptoKey, plaintext: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
    const buf = new Uint8Array(12 + cipher.byteLength);
    buf.set(iv, 0);
    buf.set(new Uint8Array(cipher), 12);
    return btoa(String.fromCharCode(...buf));
}

/**
 * Decifra base64(iv || ciphertext) de volta para plaintext via AES-GCM.
 * Espera layout produzido por aesEncrypt (12-byte IV + ciphertext).
 *
 * Throws se cipher corrompido ou key incorreta.
 */
export async function aesDecrypt(key: CryptoKey, b64: string): Promise<string> {
    const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const cipher = buf.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return new TextDecoder().decode(plain);
}
