// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — wire Web Crypto
 * (claude - novaspec, 2026-06-02, F1).
 *
 * encryptEnvelope: gera CEK aleatória → AES-GCM ciphertext → para cada
 *   recipient, ECDH-ES com ephemeral key + wrapKey(CEK, AES-KW).
 *
 * decryptEnvelope: localiza wrapped_cek do meu profileId → ECDH(ephemeral)
 *   deriva KEK → unwrapKey → AES-GCM decrypt.
 *
 * Pattern: JWE Multi-Recipient (RFC 7516 §7.2) simplificado.
 *
 * Compatibilidade:
 *   - Browser modernos (Chrome 37+, Firefox 32+, Safari 11+)
 *   - Node 19+ (globalThis.crypto.subtle nativo)
 *
 * Refs:
 *   - SPEC docs/specs/features/SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE.md
 *   - core/crypto/_envelopePure.ts (schema + validation + parse)
 */

import {
    ENVELOPE_ALG,
    ENVELOPE_SCHEMA,
    validateRecipients,
    findRecipient,
    bytesToBase64Url,
    base64UrlToBytes,
    type Envelope,
    type RecipientEntry,
    type RecipientPublic,
} from './_envelopePure.js';

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

function getSubtle(): SubtleCrypto {
    const subtle = (globalThis as any).crypto?.subtle as SubtleCrypto | undefined;
    if (!subtle) {
        throw new Error(
            '[envelope] Web Crypto API unavailable. ' +
                'Requires Chrome 37+, Firefox 32+, Safari 11+, or Node 19+.',
        );
    }
    return subtle;
}

function getRandomBytes(n: number): Uint8Array {
    const cryptoGlobal = (globalThis as any).crypto;
    if (!cryptoGlobal || typeof cryptoGlobal.getRandomValues !== 'function') {
        throw new Error('[envelope] getRandomValues unavailable');
    }
    return cryptoGlobal.getRandomValues(new Uint8Array(n));
}

async function importEcdhPublic(jwk: JsonWebKey): Promise<CryptoKey> {
    return getSubtle().importKey(
        'jwk',
        jwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        [],
    );
}

async function exportEcdhPublic(key: CryptoKey): Promise<JsonWebKey> {
    return getSubtle().exportKey('jwk', key) as Promise<JsonWebKey>;
}

// ----------------------------------------------------------------
// ENCRYPT
// ----------------------------------------------------------------

/**
 * Encrypt um payload Uint8Array para N recipients.
 *
 * Cada recipient é identificado por { profileId, publicJwk, keyId }.
 * O envelope retornado é JSON-serializable e auto-contém tudo necessário
 * para qualquer recipient decifrar com sua chave privada ECDH.
 *
 * @throws Error se recipients vazia / inválida / Web Crypto indisponível
 */
export async function encryptEnvelope(
    plaintext: Uint8Array,
    recipients: ReadonlyArray<RecipientPublic>,
): Promise<Envelope> {
    validateRecipients(recipients);
    const subtle = getSubtle();

    // 1. Gerar CEK aleatória (AES-GCM 256)
    const cek = await subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable — precisa para wrapKey
        ['encrypt', 'decrypt'],
    );

    // 2. Cifrar plaintext com CEK + IV aleatório
    const iv = getRandomBytes(ENVELOPE_SCHEMA.ivLen);
    const ciphertextBuf = await subtle.encrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        cek,
        plaintext as unknown as ArrayBuffer,
    );

    // 3. Para cada recipient, gerar ephemeral ECDH, derivar KEK, wrapKey(CEK)
    const wrappedRecipients: RecipientEntry[] = [];
    for (const r of recipients) {
        const ephemeral = await subtle.generateKey(
            { name: 'ECDH', namedCurve: 'P-256' },
            true,
            ['deriveKey'],
        );
        const recipientPub = await importEcdhPublic(r.publicJwk);
        const kek = await subtle.deriveKey(
            { name: 'ECDH', public: recipientPub } as EcdhKeyDeriveParams,
            ephemeral.privateKey,
            { name: 'AES-KW', length: 256 },
            false,
            ['wrapKey', 'unwrapKey'],
        );
        const wrappedBuf = await subtle.wrapKey('raw', cek, kek, { name: 'AES-KW' });
        const ephemeralPubJwk = await exportEcdhPublic(ephemeral.publicKey);

        wrappedRecipients.push({
            profileId: r.profileId,
            kid: r.keyId,
            wrappedCek: bytesToBase64Url(new Uint8Array(wrappedBuf)),
            ephemeralPubJwk,
        });
    }

    return {
        v: 1,
        alg: ENVELOPE_ALG,
        iv: bytesToBase64Url(iv),
        recipients: wrappedRecipients,
        ciphertext: bytesToBase64Url(new Uint8Array(ciphertextBuf)),
    };
}

// ----------------------------------------------------------------
// DECRYPT
// ----------------------------------------------------------------

/**
 * Decrypt envelope para um profileId conhecido + privateKey ECDH local.
 *
 * @param env envelope a decifrar
 * @param myProfileId profileId do recipient (autenticado upstream)
 * @param myPrivateKey CryptoKey privada ECDH P-256 (IDB-backed em produção)
 * @returns plaintext bytes
 * @throws Error se profileId não está em recipients (não autorizado)
 *                ou Web Crypto indisponível
 */
export async function decryptEnvelope(
    env: Envelope,
    myProfileId: string,
    myPrivateKey: CryptoKey,
): Promise<Uint8Array> {
    const entry = findRecipient(env, myProfileId);
    if (!entry) {
        throw new Error(`[envelope] not authorized — profileId not in recipients`);
    }
    const subtle = getSubtle();

    // Reconstruir KEK via ECDH(my_priv, ephemeral_pub)
    const ephemeralPub = await importEcdhPublic(entry.ephemeralPubJwk as JsonWebKey);
    const kek = await subtle.deriveKey(
        { name: 'ECDH', public: ephemeralPub } as EcdhKeyDeriveParams,
        myPrivateKey,
        { name: 'AES-KW', length: 256 },
        false,
        ['wrapKey', 'unwrapKey'],
    );

    // Unwrap CEK
    const wrappedBytes = base64UrlToBytes(entry.wrappedCek);
    const cek = await subtle.unwrapKey(
        'raw',
        wrappedBytes as unknown as ArrayBuffer,
        kek,
        { name: 'AES-KW' },
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt'],
    );

    // Decifra ciphertext
    const iv = base64UrlToBytes(env.iv);
    const ciphertext = base64UrlToBytes(env.ciphertext);
    const plainBuf = await subtle.decrypt(
        { name: 'AES-GCM', iv: iv as BufferSource },
        cek,
        ciphertext as unknown as ArrayBuffer,
    );
    return new Uint8Array(plainBuf);
}
