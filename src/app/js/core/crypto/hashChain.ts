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
   HASH CHAIN - CADEIA DE HASHES
   ================================================================

   Este modulo implementa funcoes de hash e gerenciamento de cadeia
   para rastreabilidade de versoes das chaves ECO.

   CONCEITO DE BLOCKCHAIN:
   - Cada chave contem o hash da versao anterior
   - Isso cria uma "cadeia" verificavel de versoes
   - Se alguem modificar uma versao antiga, a cadeia quebra

   FLUXO:
   1. Primeira versao: prevHash = "GENESIS"
   2. Versoes seguintes: prevHash = SHA256(chaveAnterior)
   3. Para verificar: recalcular hashes e comparar

   ================================================================ */

export interface ChainMeta {
    prevHash: string;
    version: number;
    timestamp: string;
}

export type ChainVerificationResult =
    | {
          valid: true;
          length: number;
      }
    | {
          valid: false;
          breakAt: number;
          expected: string;
          found: string;
      };

// ----------------------------------------------------------------
// FUNCOES DE HASH
// ----------------------------------------------------------------

/**
 * Calcula hash SHA-256 de qualquer dado.
 * Usa Web Crypto API nativa do navegador.
 *
 * EXEMPLO:
 * await sha256("hello") -> "2cf24dba..."
 * await sha256({foo: "bar"}) -> "7a38bf81..."
 */
export async function sha256(data: unknown): Promise<string> {
    const encoder = new TextEncoder();
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const dataBuffer = encoder.encode(dataString);

    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);

    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Converte hash hexadecimal para Base64URL truncado.
 * Usado para incluir hash na chave sem ficar muito longo.
 *
 * EXEMPLO:
 * hashToBase64URL("2cf24dba5fb0a30e...", 12) -> "LPJNul-owo"
 */
export function hashToBase64URL(hexHash: string, length = 12): string {
    const hexBytes = hexHash.match(/.{1,2}/g);
    if (!hexBytes) {
        throw new TypeError('hexHash must contain at least one hex byte');
    }

    const bytes = new Uint8Array(hexBytes.map((byte) => parseInt(byte, 16)));

    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });
    const base64 = btoa(binary);

    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '').slice(0, length);
}

/**
 * Converte Base64URL de volta para hash hexadecimal.
 */
export function base64URLToHex(base64url: string): string {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

    const padding = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padding);

    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// ----------------------------------------------------------------
// GERENCIAMENTO DA CADEIA
// ----------------------------------------------------------------

/**
 * Identificador para a primeira versao (sem antecessor).
 */
export const GENESIS = 'GENESIS';

function isChainKeyList(keys: readonly string[] | null | undefined): keys is readonly string[] {
    return Array.isArray(keys);
}

/**
 * Cria metadados da cadeia para uma nova versao.
 */
export async function createChainMeta(previousKey: string | null = null, previousVersion = 0): Promise<ChainMeta> {
    let prevHash = GENESIS;

    if (previousKey && previousKey.trim() !== '') {
        const fullHash = await sha256(previousKey);
        prevHash = hashToBase64URL(fullHash, 12);
    }

    return {
        prevHash,
        version: previousVersion + 1,
        timestamp: new Date().toISOString(),
    };
}

/**
 * Verifica integridade de uma cadeia de chaves.
 */
export async function verifyChain(keys: readonly string[] | null | undefined): Promise<ChainVerificationResult> {
    if (!isChainKeyList(keys) || keys.length === 0) {
        return { valid: true, length: 0 };
    }

    for (let i = 1; i < keys.length; i++) {
        const previousKey = keys[i - 1]!;
        const currentKey = keys[i]!;

        const expectedFullHash = await sha256(previousKey);
        const expectedPrevHash = hashToBase64URL(expectedFullHash, 12);

        const parts = currentKey.split('-');

        if (parts.length >= 4 && (parts[0]!.startsWith('ECBT') || parts[0]!.startsWith('ECO'))) {
            const foundPrevHash = parts[3]!;

            if (foundPrevHash !== expectedPrevHash) {
                return {
                    valid: false,
                    breakAt: i,
                    expected: expectedPrevHash,
                    found: foundPrevHash,
                };
            }
        }
    }

    return { valid: true, length: keys.length };
}

/**
 * Extrai o prevHash de uma chave blockchain (ECBT tipo B ou ECO legado).
 */
export function extractPrevHash(key: string | null | undefined): string | null {
    if (!key || (!key.startsWith('ECBT') && !key.startsWith('ECO'))) {
        return null;
    }

    const parts = key.split('-');
    if (parts.length >= 4) {
        return parts[3]!;
    }

    return null;
}

/**
 * Verifica se uma chave e a primeira da cadeia (GENESIS).
 */
export function isGenesisKey(key: string | null | undefined): boolean {
    const prevHash = extractPrevHash(key);
    return prevHash === GENESIS;
}
