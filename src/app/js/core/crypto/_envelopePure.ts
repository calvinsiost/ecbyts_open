// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE — pure-logic do envelope
 * (claude - novaspec, 2026-06-02, F1).
 *
 * Sem Web Crypto / sem rede / sem IDB. Apenas:
 *   - Schema do envelope (frozen)
 *   - Validações (recipients, profileId, alg, IV)
 *   - Parse / build do JSON do envelope
 *   - Lookup de wrapped_cek por profileId
 *   - base64url helpers (espelhando convenção JOSE RFC 7515 §2)
 *
 * Refs:
 *   - SPEC docs/specs/features/SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE.md
 *   - RFC 7516 §7.2 (JWE multi-recipient)
 */

// ----------------------------------------------------------------
// SCHEMA — frozen, single-source-of-truth
// ----------------------------------------------------------------

export const ENVELOPE_ALG = 'ECDH-ES+A256KW/AES-GCM-256' as const;

export const ENVELOPE_SCHEMA = Object.freeze({
    alg: ENVELOPE_ALG,
    ivLen: 12, // AES-GCM nominal
    cekLen: 32, // 256-bit
    wrappedCekLen: 40, // raw AES-256 wrapped via AES-KW (32 + 8 IV/check)
    minRecipients: 1,
} as const);

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export interface RecipientEntry {
    readonly profileId: string;
    readonly kid: string;
    readonly wrappedCek: string; // base64url
    readonly ephemeralPubJwk: object; // ECDH-ES ephemeral pub
}

export interface Envelope {
    readonly alg: typeof ENVELOPE_ALG;
    readonly iv: string; // base64url
    readonly recipients: ReadonlyArray<RecipientEntry>;
    readonly ciphertext: string; // base64url
    readonly v: 1; // envelope schema version
}

export interface RecipientPublic {
    readonly profileId: string;
    readonly publicJwk: JsonWebKey;
    readonly keyId: string;
}

// ----------------------------------------------------------------
// VALIDATION (pure)
// ----------------------------------------------------------------

function _assertObject(value: unknown, index: number): asserts value is Record<string, unknown> {
    if (!value || typeof value !== 'object') {
        throw new Error(`[envelope] recipient[${index}] not an object`);
    }
}

function _validatePublicJwk(j: Record<string, unknown>, index: number): void {
    if (j.kty !== 'EC' || j.crv !== 'P-256' || !j.x || !j.y) {
        throw new Error(`[envelope] recipient[${index}].publicJwk must be EC P-256 with x,y`);
    }
}

function _validateRecipientPublic(r: RecipientPublic, index: number, seenIds: Set<string>): void {
    _assertObject(r, index);
    if (typeof r.profileId !== 'string' || r.profileId.length === 0) {
        throw new Error(`[envelope] recipient[${index}].profileId required`);
    }
    if (seenIds.has(r.profileId)) {
        throw new Error(`[envelope] duplicate profileId: ${r.profileId}`);
    }
    seenIds.add(r.profileId);
    if (typeof r.keyId !== 'string' || r.keyId.length === 0) {
        throw new Error(`[envelope] recipient[${index}].keyId required`);
    }
    if (!r.publicJwk || typeof r.publicJwk !== 'object') {
        throw new Error(`[envelope] recipient[${index}].publicJwk required`);
    }
    _validatePublicJwk(r.publicJwk as Record<string, unknown>, index);
}

function _validateRecipientEntry(r: unknown, index: number): void {
    _assertObject(r, index);
    if (typeof r.profileId !== 'string' || !r.profileId) {
        throw new Error(`[envelope] recipients[${index}].profileId required`);
    }
    if (typeof r.kid !== 'string' || !r.kid) {
        throw new Error(`[envelope] recipients[${index}].kid required`);
    }
    if (typeof r.wrappedCek !== 'string' || !r.wrappedCek) {
        throw new Error(`[envelope] recipients[${index}].wrappedCek required`);
    }
    if (!r.ephemeralPubJwk || typeof r.ephemeralPubJwk !== 'object') {
        throw new Error(`[envelope] recipients[${index}].ephemeralPubJwk required`);
    }
}

/** Valida lista de recipients antes de encrypt. Throw em violação. */
export function validateRecipients(recipients: ReadonlyArray<RecipientPublic> | null | undefined): void {
    if (!Array.isArray(recipients)) {
        throw new Error('[envelope] recipients must be array');
    }
    if (recipients.length < ENVELOPE_SCHEMA.minRecipients) {
        throw new Error('[envelope] no recipients');
    }
    const seenIds = new Set<string>();
    for (let i = 0; i < recipients.length; i++) {
        _validateRecipientPublic(recipients[i] as RecipientPublic, i, seenIds);
    }
}

function _validateEnvelopeHeader(e: Record<string, unknown>): void {
    if (e.alg !== ENVELOPE_ALG) {
        throw new Error(`[envelope] alg mismatch: ${e.alg}`);
    }
    if (e.v !== 1) {
        throw new Error(`[envelope] unsupported schema version: ${e.v}`);
    }
    if (typeof e.iv !== 'string' || e.iv.length === 0) {
        throw new Error('[envelope] iv required');
    }
    if (typeof e.ciphertext !== 'string' || e.ciphertext.length === 0) {
        throw new Error('[envelope] ciphertext required');
    }
}

/** Valida shape do envelope decodificado. Throw em violação. */
export function validateEnvelope(env: unknown): asserts env is Envelope {
    _assertObject(env, 0);
    const e = env as Record<string, unknown>;
    _validateEnvelopeHeader(e);
    const recipients = e.recipients;
    if (!Array.isArray(recipients) || recipients.length < ENVELOPE_SCHEMA.minRecipients) {
        throw new Error('[envelope] recipients[] required and non-empty');
    }
    for (let i = 0; i < recipients.length; i++) {
        _validateRecipientEntry(recipients[i], i);
    }
}

// ----------------------------------------------------------------
// LOOKUP (pure)
// ----------------------------------------------------------------

/** Localiza o recipient entry para um profileId. Retorna null se não autorizado. */
export function findRecipient(env: Envelope, profileId: string): RecipientEntry | null {
    if (!profileId || typeof profileId !== 'string') return null;
    for (const r of env.recipients) {
        if (r.profileId === profileId) return r;
    }
    return null;
}

/** Lista profileIds autorizados (para UX "perfis autorizados nesta chave: N"). */
export function listAuthorizedProfileIds(env: Envelope): string[] {
    return env.recipients.map((r) => r.profileId);
}

// ----------------------------------------------------------------
// SIZE ESTIMATE (pure — para perf gate)
// ----------------------------------------------------------------

/**
 * Estima overhead em bytes do envelope (sem ciphertext payload).
 * Útil para garantir que crescimento é linear em N recipients.
 */
export function estimateOverheadBytes(env: Envelope): number {
    let total = 0;
    total += env.alg.length + env.iv.length + 32; // header + iv b64url
    for (const r of env.recipients) {
        total += r.profileId.length + r.kid.length + r.wrappedCek.length;
        total += JSON.stringify(r.ephemeralPubJwk).length;
        total += 32; // JSON delimiters
    }
    return total;
}

// ----------------------------------------------------------------
// BASE64URL (RFC 7515 §2 — sem padding, +/ → -_)
// ----------------------------------------------------------------

export function bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]!);
    }
    const b64 =
        typeof btoa === 'function'
            ? btoa(binary)
            : (globalThis as any).Buffer
              ? (globalThis as any).Buffer.from(binary, 'binary').toString('base64')
              : (() => {
                    throw new Error('[envelope] base64 unsupported in this runtime');
                })();
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(b64url: string): Uint8Array {
    if (typeof b64url !== 'string') {
        throw new Error('[envelope] base64UrlToBytes: input must be string');
    }
    const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary =
        typeof atob === 'function'
            ? atob(b64)
            : (globalThis as any).Buffer
              ? (globalThis as any).Buffer.from(b64, 'base64').toString('binary')
              : (() => {
                    throw new Error('[envelope] base64 unsupported in this runtime');
                })();
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
}

// ----------------------------------------------------------------
// SERIALIZE / PARSE (pure JSON, no crypto)
// ----------------------------------------------------------------

/** Serializa envelope para JSON canônico (chaves ordenadas). */
export function serializeEnvelope(env: Envelope): string {
    validateEnvelope(env);
    const recipients = env.recipients.map((r) => ({
        profileId: r.profileId,
        kid: r.kid,
        wrappedCek: r.wrappedCek,
        ephemeralPubJwk: r.ephemeralPubJwk,
    }));
    return JSON.stringify({
        v: env.v,
        alg: env.alg,
        iv: env.iv,
        recipients,
        ciphertext: env.ciphertext,
    });
}

/** Parse JSON do envelope, valida shape, retorna typed Envelope. Throw em violação. */
export function parseEnvelope(json: string): Envelope {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (e: any) {
        throw new Error(`[envelope] invalid JSON: ${e?.message || e}`, { cause: e });
    }
    validateEnvelope(parsed);
    return parsed;
}
