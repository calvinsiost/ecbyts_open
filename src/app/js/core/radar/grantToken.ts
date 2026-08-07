// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RADAR GRANT TOKEN — HS256 JWT mint / verify / hash

   SPEC: docs/specs/features/SPEC_DATASTUDIO_RADAR_PROFILES.md §4, §4.2

   Tokens de acesso por-slice assinados com segredo POR PROJETO
   (HS256), NAO a master Supabase key. O Data Owner pode rotacionar
   o segredo sem invalidar tokens Supabase.

   Web Crypto (`crypto.subtle`) — funciona em browser + Deno. A
   Edge Function radar-access/index.ts re-implementa a mesma lógica
   inline porque Deno não pode importar app/js/ diretamente; este
   módulo é o contrato canônico do lado cliente/core.

   NOT (anti-requisitos da spec §13):
   - NUNCA armazenar JWT raw em log/DB (só hash SHA-256 via hashToken)
   - NUNCA gerar token sem segredo (verifyGrantToken retorna null)
   ================================================================ */

// ----------------------------------------------------------------
// base64url helpers (RFC 7515 §2 — sem padding, +/ → -_)
// ----------------------------------------------------------------

/**
 * @param {string} value
 * @param {string} encoding
 * @returns {{ toString: (encoding: string) => string }}
 */
function nodeBufferFrom(value: any, encoding: any) {
    const BufferCtor =
        /** @type {{ from?: (value: string, encoding: string) => { toString: (encoding: string) => string } } | undefined} */ (
            /** @type {any} */ (globalThis).Buffer
        );
    if (!BufferCtor || typeof BufferCtor.from !== 'function') {
        throw new Error('[radar:grantToken] base64 fallback requires btoa/atob or Buffer.');
    }
    return BufferCtor.from(value, encoding);
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function bytesToBase64Url(bytes: any) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    const b64 = typeof btoa === 'function' ? btoa(binary) : nodeBufferFrom(binary, 'binary').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * @param {string} str
 * @returns {string}
 */
function strToBase64Url(str: any) {
    const bytes = new TextEncoder().encode(str);
    return bytesToBase64Url(bytes);
}

/**
 * @param {string} b64url
 * @returns {Uint8Array}
 */
function base64UrlToBytes(b64url: any) {
    const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
    const binary = typeof atob === 'function' ? atob(b64) : nodeBufferFrom(b64, 'base64').toString('binary');
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        out[i] = binary.charCodeAt(i);
    }
    return out;
}

/**
 * @param {string} b64url
 * @returns {string}
 */
function base64UrlToStr(b64url: any) {
    return new TextDecoder().decode(base64UrlToBytes(b64url));
}

// ----------------------------------------------------------------
// Crypto primitives (Web Crypto — browser + Deno)
// ----------------------------------------------------------------

function _subtle() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    if (!c || !c.subtle) {
        throw new Error('[radar:grantToken] Web Crypto (crypto.subtle) indisponível neste runtime.');
    }
    return c.subtle;
}

/**
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function importHmacKey(secret: any) {
    return _subtle().importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign',
        'verify',
    ]);
}

/**
 * SHA-256 hex de um token (armazenado em radar_access_grants.token_jwt_hash).
 * Determinístico; nunca reversível ao token raw.
 * @param {string} token
 * @returns {Promise<string>}
 */
export async function hashToken(token: any) {
    if (typeof token !== 'string' || !token) {
        throw new Error('[radar:grantToken] hashToken: token obrigatório (string).');
    }
    const digest = await _subtle().digest('SHA-256', new TextEncoder().encode(token));
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i]!.toString(16).padStart(2, '0');
    }
    return hex;
}

/**
 * Gera um jti pseudo-aleatório (16 bytes hex).
 * @returns {string}
 */
function randomJti() {
    const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || null;
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === 'function') {
        c.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    let hex = '';
    for (let i = 0; i < bytes.length; i += 1) hex += bytes[i]!.toString(16).padStart(2, '0');
    return hex;
}

// ----------------------------------------------------------------
// JWT mint / verify
// ----------------------------------------------------------------

/**
 * Gera um grant token HS256.
 *
 * Production wires `secret` via Supabase RPC `get_radar_signing_secret`
 * (segredo por-projeto). Aqui o segredo é parâmetro explícito; o caller
 * (grantManager) é responsável por buscá-lo de forma segura.
 *
 * @param {object} opts
 * @param {string} opts.sliceId
 * @param {string} opts.granteeEmail
 * @param {string} opts.projectId
 * @param {string} opts.secret              segredo HS256 por-projeto
 * @param {number} [opts.expiresInDays=7]   TTL (invite default 7 dias — spec §4.2)
 * @returns {Promise<string>} JWT compacto (header.payload.signature)
 */
export async function mintGrantToken(opts: any) {
    if (!opts || typeof opts !== 'object') {
        throw new Error('[radar:grantToken] mintGrantToken: opts obrigatório.');
    }
    const { sliceId, granteeEmail, projectId, secret } = opts;
    if (!sliceId || typeof sliceId !== 'string') {
        throw new Error('[radar:grantToken] sliceId obrigatório (string).');
    }
    if (!granteeEmail || typeof granteeEmail !== 'string') {
        throw new Error('[radar:grantToken] granteeEmail obrigatório (string).');
    }
    if (!projectId || typeof projectId !== 'string') {
        throw new Error('[radar:grantToken] projectId obrigatório (string).');
    }
    if (!secret || typeof secret !== 'string') {
        throw new Error('[radar:grantToken] secret obrigatório (string) — nunca gerar token sem segredo.');
    }
    const expiresInDays =
        typeof opts.expiresInDays === 'number' && Number.isFinite(opts.expiresInDays) && opts.expiresInDays > 0
            ? Math.floor(opts.expiresInDays)
            : 7;
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        slice_id: sliceId,
        project_id: projectId,
        grantee: granteeEmail,
        iat: nowSec,
        exp: nowSec + expiresInDays * 86400,
        jti: randomJti(),
    };
    const headerB64 = strToBase64Url(JSON.stringify(header));
    const payloadB64 = strToBase64Url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;
    const key = await importHmacKey(secret);
    const sigBuf = await _subtle().sign('HMAC', key, new TextEncoder().encode(signingInput));
    const sigB64 = bytesToBase64Url(new Uint8Array(sigBuf));
    return `${signingInput}.${sigB64}`;
}

/**
 * Comparação constant-time de duas strings (anti timing-attack na assinatura).
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function constantTimeEqual(a: any, b: any) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i += 1) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

/**
 * Verifica assinatura HS256 + expiração.
 * @param {string} token
 * @param {string} secret
 * @param {number} [nowMs=Date.now()]
 * @returns {Promise<object|null>} claims se válido, null se inválido/expirado
 */
export async function verifyGrantToken(token: any, secret: any, nowMs: any) {
    if (typeof token !== 'string' || !token || typeof secret !== 'string' || !secret) {
        return null;
    }
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    try {
        const header = JSON.parse(base64UrlToStr(headerB64));
        if (!header || header.alg !== 'HS256') return null;
        const key = await importHmacKey(secret);
        const expectedBuf = await _subtle().sign('HMAC', key, new TextEncoder().encode(`${headerB64}.${payloadB64}`));
        const expectedSig = bytesToBase64Url(new Uint8Array(expectedBuf));
        if (!constantTimeEqual(expectedSig, sigB64)) return null;
        const claims = JSON.parse(base64UrlToStr(payloadB64));
        if (!claims || typeof claims !== 'object') return null;
        const now = typeof nowMs === 'number' && Number.isFinite(nowMs) ? nowMs : Date.now();
        if (typeof claims.exp === 'number' && now / 1000 > claims.exp) {
            return null;
        }
        return claims;
    } catch {
        return null;
    }
}
