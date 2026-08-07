// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining of validated
//               payloads via ECO1) — NOT blockchain consensus, NOT real-time
//               Digital Twin. Current data regime: campaign-based (Digital Model).
//               See CCC-001 §1.1 PN-1/PN-2/PN-7 (claim ⊆ artefato verificável).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   SIGNER - ASSINATURA DIGITAL
   ================================================================

   Este modulo implementa assinatura e verificacao digital
   usando ECDSA (Elliptic Curve Digital Signature Algorithm).

   PARA QUE SERVE:
   - Provar que voce criou/modificou uma chave ECO1 blockchain
   - Verificar se uma chave foi realmente criada por alguem

   COMO FUNCIONA:
   1. Voce assina com sua chave PRIVADA
   2. Outros verificam com sua chave PUBLICA
   3. Se a assinatura bater, a autoria e confirmada

   SEGURANCA:
   - Somente quem tem a chave privada pode assinar
   - Qualquer um com a publica pode verificar
   - Impossivel falsificar sem a privada

   ================================================================ */

import { getKeyPair, getPrivateKey } from './keyManager.js';

/**
 * @typedef {Object} SignableParams
 * @property {string} [version]
 * @property {string} [familyCodes]
 * @property {string} [keyId]
 * @property {string} [prevHash]
 * @property {string} [merkleRoot]
 * @property {string} [salt]
 * @property {string} [checksum]
 * @property {string} [payload]
 */

/**
 * @typedef {Object} VerificationData
 * @property {string} dataToVerify
 * @property {string} signature
 * @property {string} keyId
 */

// ----------------------------------------------------------------
// CONFIGURACAO
// ----------------------------------------------------------------

/**
 * Algoritmo de assinatura.
 * ECDSA com SHA-256 e padrao e seguro.
 */
const SIGN_ALGORITHM = {
    name: 'ECDSA',
    hash: 'SHA-256',
};

/**
 * Algoritmo para importar chaves.
 */
const KEY_ALGORITHM = {
    name: 'ECDSA',
    namedCurve: 'P-256',
};

// ----------------------------------------------------------------
// ASSINATURA
// ----------------------------------------------------------------

/**
 * Assina dados com uma chave privada.
 *
 * @param {string} keyId - ID da chave a usar
 * @param {string|Object} data - Dados a assinar
 * @returns {Promise<string>} - Assinatura em Base64URL
 *
 * @throws {Error} Se a chave nao existir ou nao tiver parte privada
 *
 * EXEMPLO:
 * const sig = await signData("a1b2c3d4", "dados importantes");
 * // "MEUCIQDx7..."
 */
export async function signData(keyId: any, data: any) {
    // F04 - Obtem CryptoKey privada via vault (unwrap automatico + migration legado)
    const privateKey = await getPrivateKey(keyId);

    // Prepara dados para assinatura
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const dataBuffer = new TextEncoder().encode(dataString);

    // Assina
    const signatureBuffer = await crypto.subtle.sign(SIGN_ALGORITHM, privateKey, dataBuffer);

    // Converte para Base64URL
    return arrayBufferToBase64URL(signatureBuffer);
}

/**
 * Assina dados e retorna assinatura truncada.
 * Usada para incluir assinatura na chave ECO1 blockchain.
 *
 * @param {string} keyId - ID da chave
 * @param {string|Object} data - Dados a assinar
 * @param {number} length - Tamanho da assinatura (padrao: 64)
 * @returns {Promise<string>} - Assinatura truncada
 */
export async function signDataTruncated(keyId: any, data: any, length = 64) {
    const fullSignature = await signData(keyId, data);
    return fullSignature.slice(0, length);
}

// ----------------------------------------------------------------
// VERIFICACAO
// ----------------------------------------------------------------

/**
 * Verifica uma assinatura usando chave publica.
 *
 * @param {string} keyId - ID da chave publica
 * @param {string|Object} data - Dados originais
 * @param {string} signature - Assinatura em Base64URL
 * @returns {Promise<boolean>} - true se valida, false se invalida
 *
 * EXEMPLO:
 * const valid = await verifySignature("a1b2c3d4", "dados", "MEUCIQDx7...");
 * // true ou false
 */
export async function verifySignature(keyId: any, data: any, signature: any) {
    try {
        // Busca chave no banco
        const keyRecord = (await getKeyPair(keyId)) as any;

        if (!keyRecord || !keyRecord.publicKey) {
            console.warn(`Chave publica ${keyId} nao encontrada`);
            return false;
        }

        // Importa chave publica
        const publicKey = await crypto.subtle.importKey('jwk', keyRecord.publicKey, KEY_ALGORITHM, false, ['verify']);

        // Prepara dados
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        const dataBuffer = new TextEncoder().encode(dataString);

        // Decodifica assinatura
        const signatureBuffer = base64URLToArrayBuffer(signature);

        // Verifica
        return await crypto.subtle.verify(SIGN_ALGORITHM, publicKey, signatureBuffer, dataBuffer);
    } catch (err) {
        console.error('Erro ao verificar assinatura:', err);
        return false;
    }
}

/**
 * Verifica assinatura usando chave publica direta (sem buscar no banco).
 * Util para verificar chaves de terceiros sem importar.
 *
 * @param {JsonWebKey} publicKeyJWK - Chave publica em formato JWK
 * @param {string|Object} data - Dados originais
 * @param {string} signature - Assinatura em Base64URL
 * @returns {Promise<boolean>}
 */
export async function verifySignatureWithKey(publicKeyJWK: any, data: any, signature: any) {
    try {
        // Importa chave publica
        const publicKey = await crypto.subtle.importKey('jwk', publicKeyJWK, KEY_ALGORITHM, false, ['verify']);

        // Prepara dados
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        const dataBuffer = new TextEncoder().encode(dataString);

        // Decodifica assinatura
        const signatureBuffer = base64URLToArrayBuffer(signature);

        // Verifica
        return await crypto.subtle.verify(SIGN_ALGORITHM, publicKey, signatureBuffer, dataBuffer);
    } catch (err) {
        console.error('Erro ao verificar assinatura:', err);
        return false;
    }
}

// ----------------------------------------------------------------
// CONVERSAO BASE64URL
// ----------------------------------------------------------------

/**
 * Converte ArrayBuffer para Base64URL.
 *
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64URL(buffer: any) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach((byte) => {
        binary += String.fromCharCode(byte);
    });

    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Converte Base64URL para ArrayBuffer.
 *
 * @param {string} base64url
 * @returns {ArrayBuffer}
 */
function base64URLToArrayBuffer(base64url: any) {
    // Converte Base64URL para Base64 normal
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');

    // Adiciona padding se necessario
    const padding = (4 - (base64.length % 4)) % 4;
    base64 += '='.repeat(padding);

    // Decodifica
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

// ----------------------------------------------------------------
// UTILIDADES
// ----------------------------------------------------------------

/**
 * Gera dados para assinatura de uma chave ECO1 blockchain.
 * Inclui todos os campos exceto a propria assinatura.
 *
 * @param {SignableParams} params - Parametros da chave
 * @returns {string} - String para assinar
 */
export function buildSignableData(params: any) {
    const { version = '3', familyCodes, keyId, prevHash, merkleRoot, salt, checksum, payload } = params;

    // Ordem deterministica dos campos
    return `ECO${version}-${familyCodes}-${keyId}-${prevHash}-${merkleRoot}-${salt}-${checksum}-${payload}`;
}

/**
 * Extrai dados para verificacao de uma chave ECO1 blockchain.
 *
 * @param {string} key - Chave ECO1 blockchain completa
 * @returns {VerificationData | null} - { dataToVerify, signature, keyId }
 */
export function extractVerificationData(key: any) {
    // Formato: ECBT.B{hex}-CODES-KEYID-PREVHASH-MERKLE-SIG-SALT-CHECK-PAYLOAD-SUFFIX
    // Legado:  ECO1-CODES-KEYID-PREVHASH-MERKLE-SIG-SALT-CHECK-PAYLOAD
    const parts = key.split('-');

    if (parts.length < 9 || (!parts[0].startsWith('ECBT') && !parts[0].startsWith('ECO'))) {
        return null;
    }

    const [
        prefix, // ECO prefix
        codes, // PWM
        keyId, // a1b2c3d4
        prevHash, // GENESIS ou hash
        merkleRoot, // 16 chars
        signature, // 64 chars
        salt, // 11 chars
        checksum, // 4 chars
        ...payloadParts
    ] = parts;

    const payload = payloadParts.join('-'); // Pode ter - no payload

    // Reconstroi dados que foram assinados (sem a assinatura)
    const dataToVerify = `${prefix}-${codes}-${keyId}-${prevHash}-${merkleRoot}-${salt}-${checksum}-${payload}`;

    return {
        dataToVerify,
        signature,
        keyId,
    };
}
