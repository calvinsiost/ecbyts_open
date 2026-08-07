// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — F2 pure-logic do Tipo D.
 * (claude - novaspec, 2026-06-02).
 *
 * Tipo D ECBT — chave criptografada por perfil (envelope JWE-style).
 *
 * FORMATO:
 *   ECBT.D0000001-{families}-{kid}-{salt}-{check}-{envelopeB64}-10000000D.TBCE
 *                  |          |     |      |       |
 *                  |          |     |      |       +-- envelope JSON (base64url)
 *                  |          |     |      +---------- checksum estrutural
 *                  |          |     +----------------- salt aleatório (8 bytes b64url)
 *                  |          +----------------------- keyId do owner (kid) — 16 hex
 *                  +---------------------------------- códigos família (preserva semântica A/B/C)
 *
 * Pure-logic — sem Web Crypto, sem rede. Apenas:
 *   - Build da string Tipo D (canonical)
 *   - Parse da string Tipo D (validation)
 *   - Helpers: type detection, kid sanitization
 *
 * Refs:
 *   - SPEC docs/specs/features/SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE.md §4.1
 *   - core/crypto/_envelopePure.ts (envelope schema)
 *   - core/io/encoder.ts (Tipos A/B/C atuais — backward compat preservada)
 */

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

export const TYPE_D_PREFIX = 'ECBT.D' as const;
export const TYPE_D_SUFFIX = '10000000D.TBCE' as const;
export const TYPE_D_VERSION_HEX = '0000001' as const;

/** Regex match — captura families, kid, salt, check, envelopeB64. */
const TYPE_D_REGEX =
    /^ECBT\.D0000001-([A-Z0-9]+)-([a-fA-F0-9]+)-([A-Za-z0-9_-]+)-([A-Za-z0-9]+)-([A-Za-z0-9_-]+)-10000000D\.TBCE$/;

// ----------------------------------------------------------------
// TYPE DETECTION
// ----------------------------------------------------------------

/** Detecta se uma string é uma chave Tipo D (sem parse completo). */
export function isTypeDKey(key: unknown): key is string {
    if (typeof key !== 'string') return false;
    const trimmed = key.trim();
    return trimmed.startsWith(TYPE_D_PREFIX + TYPE_D_VERSION_HEX) && trimmed.endsWith(TYPE_D_SUFFIX);
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Sanitiza o kid (key identifier do owner).
 * Deve ser hex puro (16-64 chars). Inputs com `-` ou outros separadores são rejeitados —
 * usar `-` confundiria o parser da string Tipo D.
 */
export function validateKid(kid: unknown): string {
    if (typeof kid !== 'string' || kid.length < 8 || kid.length > 64) {
        throw new Error('[typeD] kid deve ser string hex 8-64 chars');
    }
    if (!/^[a-fA-F0-9]+$/.test(kid)) {
        throw new Error('[typeD] kid deve ser hex puro (sem separadores)');
    }
    return kid.toLowerCase();
}

// ----------------------------------------------------------------
// BUILD (pure — recebe envelope JSON e monta string)
// ----------------------------------------------------------------

/**
 * Monta a string canonical Tipo D.
 *
 * @param families códigos família já gerados (ex: "PWM") — preserva semântica A/B/C
 * @param kid keyId do owner (hex puro, validado por validateKid)
 * @param saltB64 salt em base64url (8 bytes)
 * @param check checksum estrutural do envelope (8 chars hex)
 * @param envelopeB64 envelope JSON serialized + base64url
 */
export function buildTypeDKey(
    families: string,
    kid: string,
    saltB64: string,
    check: string,
    envelopeB64: string,
): string {
    if (typeof families !== 'string' || families.length === 0) {
        throw new Error('[typeD] families required');
    }
    const safeKid = validateKid(kid);
    if (typeof saltB64 !== 'string' || saltB64.length === 0) {
        throw new Error('[typeD] saltB64 required');
    }
    if (typeof check !== 'string' || check.length === 0) {
        throw new Error('[typeD] check required');
    }
    if (typeof envelopeB64 !== 'string' || envelopeB64.length === 0) {
        throw new Error('[typeD] envelopeB64 required');
    }
    return `${TYPE_D_PREFIX}${TYPE_D_VERSION_HEX}-${families}-${safeKid}-${saltB64}-${check}-${envelopeB64}-${TYPE_D_SUFFIX}`;
}

// ----------------------------------------------------------------
// PARSE (pure — extrai segmentos da string)
// ----------------------------------------------------------------

export interface TypeDParsed {
    readonly families: string;
    readonly kid: string;
    readonly saltB64: string;
    readonly check: string;
    readonly envelopeB64: string;
}

/**
 * Faz parse da string Tipo D. Throw se shape inválido.
 *
 * NOTA: NÃO valida o envelope interno (isso requer base64url decode + JSON.parse +
 * validateEnvelope do _envelopePure). Aqui apenas garante shape da string.
 */
export function parseTypeDKey(key: string): TypeDParsed {
    if (typeof key !== 'string') {
        throw new Error('[typeD] key must be string');
    }
    const trimmed = key.trim();
    const match = trimmed.match(TYPE_D_REGEX);
    if (!match) {
        throw new Error(
            '[typeD] formato Tipo D inválido. Esperado: ECBT.D0000001-{families}-{kid}-{salt}-{check}-{envelope}-10000000D.TBCE',
        );
    }
    const [, families, kid, saltB64, check, envelopeB64] = match;
    if (!families || !kid || !saltB64 || !check || !envelopeB64) {
        throw new Error('[typeD] parse retornou campo vazio (regex inconsistente)');
    }
    return {
        families,
        kid: kid.toLowerCase(),
        saltB64,
        check,
        envelopeB64,
    };
}

// ----------------------------------------------------------------
// CHECKSUM ESTRUTURAL (pure — 8 chars hex deterministic)
// ----------------------------------------------------------------

/**
 * Calcula checksum estrutural simples para detectar corrupção da string Tipo D.
 * NÃO é segurança criptográfica — apenas defesa contra typos / corrupção em trânsito.
 *
 * Algoritmo: FNV-1a 32-bit hash → hex padded 8 chars.
 */
export function computeStructuralCheck(input: string): string {
    if (typeof input !== 'string') {
        throw new Error('[typeD] checksum input must be string');
    }
    let hash = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    // Convert to unsigned 32-bit hex, pad to 8 chars
    const unsigned = hash >>> 0;
    return unsigned.toString(16).padStart(8, '0');
}
