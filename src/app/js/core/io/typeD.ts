// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — F2 wire encoder/decoder Tipo D.
 * (claude - novaspec, 2026-06-02).
 *
 * Encode/decode chave ECBT Tipo D (criptografada por perfil radar).
 *
 * NÃO modifica encoder.ts / decoder.ts core (anti-monolith). Em vez disso:
 *   - encodeKeyTypeD: model → JSON → encryptEnvelope (CEK + per-recipient wrap)
 *     → base64url(envelope) → buildTypeDKey
 *   - decodeKeyTypeD: parseTypeDKey → base64url decode → parseEnvelope
 *     → decryptEnvelope (com privateKey) → JSON → model
 *
 * Backward compat: Tipos A/B/C decodificam normalmente via decoder.decodeKey;
 * apenas chamadas para Tipo D são roteadas aqui.
 *
 * Refs:
 *   - SPEC docs/specs/features/SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE.md §4.1, §4.2
 *   - core/io/_typeDPure.ts (string build/parse)
 *   - core/crypto/envelope.ts (encryptEnvelope/decryptEnvelope)
 *   - core/crypto/_envelopePure.ts (envelope schema, serialize/parse)
 */

import {
    buildTypeDKey,
    parseTypeDKey,
    computeStructuralCheck,
    validateKid,
    isTypeDKey,
} from './_typeDPure.js';
import {
    serializeEnvelope,
    parseEnvelope,
    bytesToBase64Url,
    base64UrlToBytes,
    type RecipientPublic,
} from '../crypto/_envelopePure.js';
import { encryptEnvelope, decryptEnvelope } from '../crypto/envelope.js';
import { generateFamilyCodes } from '../elements/families.js';
import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// FEATURE FLAG (ECBT-CRYPT-001 §8 Rollback)
// ----------------------------------------------------------------

/**
 * True se a EMISSÃO de chave ECBT Tipo D (criptografada) está habilitada.
 *
 * Gate de rollback EFETIVO da spec §8 + NOT-9: o Tipo D é opt-in explícito
 * até DoD verde + Calvin aprovar default-flip. Quando a flag
 * `CONFIG.FEATURES.ECBT_TYPE_D_ENCRYPTION` é `false`, `encodeKeyTypeD()`
 * lança erro actionable e NÃO produz chave cifrada (não degrada silenciosamente
 * para Tipo A — NOT-10).
 *
 * A checagem é defensiva: se `CONFIG.FEATURES` não existir (ambiente de teste
 * mínimo), trata como a flag estiver presente lendo `=== false` (precedente de
 * `isPptxImportSupported()`). O default real da spec é `false`, definido em
 * `config.ts` — esta função NÃO inventa default permissivo.
 *
 * IMPORTANTE: a DECODIFICAÇÃO (`decodeKeyTypeD`) fica SEMPRE habilitada,
 * independente da flag — spec §8: "Decoder Tipo D sempre habilitado (para
 * evitar bricking de chaves já emitidas)".
 */
export function isTypeDEncryptionSupported(): boolean {
    return CONFIG?.FEATURES?.ECBT_TYPE_D_ENCRYPTION === true;
}

// ----------------------------------------------------------------
// ENCODE
// ----------------------------------------------------------------

export interface EncodeTypeDOptions {
    /** Owner key identifier — hex puro 8-64 chars (validateKid). */
    readonly ownerKid: string;
    /** Recipients autorizados a descriptografar (1+). */
    readonly recipients: ReadonlyArray<RecipientPublic>;
}

/**
 * Codifica um modelo como chave ECBT Tipo D.
 *
 * @throws Error se recipients vazia / Web Crypto unavailable / ownerKid inválido
 */
export async function encodeKeyTypeD(model: any, opts: EncodeTypeDOptions): Promise<string> {
    // Rollback hatch (spec §8 + NOT-9/NOT-10): emissão de Tipo D é opt-in
    // explícito; flag OFF → erro actionable, NUNCA fallback silencioso p/ Tipo A.
    if (!isTypeDEncryptionSupported()) {
        throw new Error(
            '[typeD] emissão de chave Tipo D (criptografada) desabilitada — ' +
                'ative CONFIG.FEATURES.ECBT_TYPE_D_ENCRYPTION para emitir chaves cifradas por perfil',
        );
    }
    if (!opts || typeof opts !== 'object') {
        throw new Error('[typeD] opts {ownerKid, recipients} required');
    }
    const safeKid = validateKid(opts.ownerKid);
    if (!Array.isArray(opts.recipients) || opts.recipients.length === 0) {
        throw new Error('[typeD] recipients[] required and non-empty');
    }

    // 1. Serializa modelo para JSON → bytes
    const json = JSON.stringify(model);
    const plaintext = new TextEncoder().encode(json);

    // 2. Envelope encryption (gera CEK + cifra + wrap por recipient)
    const envelope = await encryptEnvelope(plaintext, opts.recipients);

    // 3. Serializa envelope para JSON canonical → base64url
    const envelopeJson = serializeEnvelope(envelope);
    const envelopeB64 = bytesToBase64Url(new TextEncoder().encode(envelopeJson));

    // 4. Salt aleatório (8 bytes) — preserva padrão dos Tipos A/B/C
    const salt = new Uint8Array(8);
    (globalThis as any).crypto.getRandomValues(salt);
    const saltB64 = bytesToBase64Url(salt);

    // 5. Famílias (mesmo padrão A/B/C — preserva semântica family-codes)
    const families = generateFamilyCodes(model?.elements || []);

    // 6. Checksum estrutural sobre (envelope + salt + kid) — detecta corrupção em trânsito
    const check = computeStructuralCheck(envelopeB64 + saltB64 + safeKid);

    // 7. Monta string Tipo D
    return buildTypeDKey(families, safeKid, saltB64, check, envelopeB64);
}

// ----------------------------------------------------------------
// DECODE
// ----------------------------------------------------------------

export interface DecodeTypeDOptions {
    /** profileId do recipient (autenticado upstream — ex: Supabase session). */
    readonly myProfileId: string;
    /** Chave privada ECDH P-256 do recipient (IDB-backed em produção). */
    readonly myPrivateKey: CryptoKey;
}

/**
 * Decodifica chave ECBT Tipo D para um recipient autorizado.
 *
 * @throws Error se profileId não está em recipients (not authorized) /
 *                envelope corrompido / Web Crypto unavailable
 */
export async function decodeKeyTypeD(key: string, opts: DecodeTypeDOptions): Promise<any> {
    if (!opts || typeof opts !== 'object') {
        throw new Error('[typeD] opts {myProfileId, myPrivateKey} required');
    }
    if (typeof opts.myProfileId !== 'string' || !opts.myProfileId) {
        throw new Error('[typeD] myProfileId required');
    }
    if (!opts.myPrivateKey) {
        throw new Error('[typeD] myPrivateKey (CryptoKey) required');
    }

    // 1. Parse string Tipo D
    const parsed = parseTypeDKey(key);

    // 2. Anti-corrupção: revalida checksum estrutural
    const expectedCheck = computeStructuralCheck(parsed.envelopeB64 + parsed.saltB64 + parsed.kid);
    if (expectedCheck !== parsed.check) {
        throw new Error('[typeD] checksum mismatch — chave corrompida ou modificada');
    }

    // 3. Decode envelope JSON
    const envelopeBytes = base64UrlToBytes(parsed.envelopeB64);
    const envelopeJson = new TextDecoder().decode(envelopeBytes);
    const envelope = parseEnvelope(envelopeJson);

    // 4. Decrypt envelope (throws "not authorized" se profileId não está em recipients)
    const plaintext = await decryptEnvelope(envelope, opts.myProfileId, opts.myPrivateKey);

    // 5. Bytes → JSON → model
    const json = new TextDecoder().decode(plaintext);
    return JSON.parse(json);
}

// ----------------------------------------------------------------
// DISPATCH HELPER (para decoder.ts re-routing futuro)
// ----------------------------------------------------------------

/**
 * Helper para decoder.ts saber se uma chave é Tipo D (precisa de async + privateKey).
 * Permite mensagem actionable em decodeKey sync ("use decodeKeyTypeD").
 */
export { isTypeDKey };
