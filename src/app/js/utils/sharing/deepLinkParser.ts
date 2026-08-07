// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 1 — Parser pure-logic de URL → {toolId, payload}.
//
// Convenção: `?tools=<toolId>[&payload=<base64url-json>]`
//
// Defensivos:
//   - toolId whitelist hard (DEEP_LINK_REGISTRY)
//   - payload cap 2KB (WhatsApp/SMS clipping)
//   - base64url decode + JSON.parse com try/catch (fallback graceful)
//   - validatePayload por toolId (XSS-safe)
//
// Sem DOM, sem fetch, sem eval. Caller fornece query string.
//
// SPEC: docs/specs/_archived/SPEC_DEEP_LINK_TOOLS_SHARING.md REQ-2

import { getDeepLinkEntry, type DeepLinkEntry } from './deepLinkRegistry.js';

export const PAYLOAD_MAX_BYTES = 2048;

export interface ParseSuccess {
    readonly ok: true;
    readonly toolId: string;
    readonly entry: DeepLinkEntry;
    readonly payload: unknown | null;
}

export interface ParseFailure {
    readonly ok: false;
    readonly reason: 'no-tools-param' | 'unknown-tool-id' | 'payload-too-large' | 'payload-decode-error' | 'payload-invalid';
    readonly detail: string;
    /** toolId tentado, mesmo que inválido — útil para telemetry. */
    readonly attemptedToolId: string | null;
}

export type ParseResult = ParseSuccess | ParseFailure;

/**
 * Decodifica base64url para string UTF-8.
 * Aceita ambos `+/` (base64 padrão) e `-_` (base64url).
 * Retorna null em caso de erro.
 */
export function decodeBase64Url(input: string): string | null {
    if (typeof input !== 'string' || input.length === 0) return null;
    try {
        // Normaliza base64url → base64
        let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
        // Padding
        while (b64.length % 4 !== 0) b64 += '=';
        // atob disponível em browsers; Node ≥16 também tem global
        const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
        // bin → UTF-8 string via TextDecoder
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
        return null;
    }
}

/**
 * Calcula bytes UTF-8 de uma string (cap check anti-DOS).
 */
export function utf8ByteLength(s: string): number {
    if (typeof s !== 'string') return 0;
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        if (c < 0x80) n += 1;
        else if (c < 0x800) n += 2;
        else if (c >= 0xd800 && c <= 0xdbff) {
            n += 4;
            i++;
        } else n += 3;
    }
    return n;
}

/**
 * Parseia a query-string raw de URL para {toolId, payload}.
 *
 * @param queryString — sem `?` (ex: `tools=risk&payload=eyJzcWkiOiI3MS00My0yIn0`)
 *                      OU com `?` no início — função normaliza.
 */
export function parseToolsParam(queryString: string | null | undefined): ParseResult {
    if (typeof queryString !== 'string') {
        return Object.freeze({
            ok: false,
            reason: 'no-tools-param',
            detail: 'queryString ausente',
            attemptedToolId: null,
        });
    }
    const q = queryString.startsWith('?') ? queryString.slice(1) : queryString;
    const params = new URLSearchParams(q);
    const toolIdRaw = params.get('tools');
    if (!toolIdRaw) {
        return Object.freeze({
            ok: false,
            reason: 'no-tools-param',
            detail: 'parâmetro ?tools= ausente',
            attemptedToolId: null,
        });
    }

    // Whitelist hard: lookup no registry
    const entry = getDeepLinkEntry(toolIdRaw);
    if (!entry) {
        return Object.freeze({
            ok: false,
            reason: 'unknown-tool-id',
            detail: `toolId "${toolIdRaw}" não está no DEEP_LINK_REGISTRY`,
            attemptedToolId: toolIdRaw,
        });
    }

    // Sem payload → ok, abre painel vazio
    const payloadRaw = params.get('payload');
    if (!payloadRaw) {
        return Object.freeze({
            ok: true,
            toolId: entry.toolId,
            entry,
            payload: null,
        });
    }

    // Cap anti-DOS (raw base64 length × 0.75 ≈ utf8 bytes do JSON decodificado)
    if (payloadRaw.length > PAYLOAD_MAX_BYTES * 2) {
        return Object.freeze({
            ok: false,
            reason: 'payload-too-large',
            detail: `payload raw excede ${PAYLOAD_MAX_BYTES * 2} chars`,
            attemptedToolId: entry.toolId,
        });
    }

    const decoded = decodeBase64Url(payloadRaw);
    if (decoded === null) {
        return Object.freeze({
            ok: false,
            reason: 'payload-decode-error',
            detail: 'base64url decode falhou',
            attemptedToolId: entry.toolId,
        });
    }

    if (utf8ByteLength(decoded) > PAYLOAD_MAX_BYTES) {
        return Object.freeze({
            ok: false,
            reason: 'payload-too-large',
            detail: `payload decodificado excede ${PAYLOAD_MAX_BYTES} bytes UTF-8`,
            attemptedToolId: entry.toolId,
        });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(decoded);
    } catch (_err) {
        return Object.freeze({
            ok: false,
            reason: 'payload-decode-error',
            detail: 'JSON.parse falhou',
            attemptedToolId: entry.toolId,
        });
    }

    // Validação por toolId (XSS-safe + shape)
    if (entry.validatePayload) {
        const v = entry.validatePayload(payload);
        if (!v.valid) {
            return Object.freeze({
                ok: false,
                reason: 'payload-invalid',
                detail: `validação falhou: ${v.errors.join('; ').slice(0, 200)}`,
                attemptedToolId: entry.toolId,
            });
        }
    }

    return Object.freeze({
        ok: true,
        toolId: entry.toolId,
        entry,
        payload,
    });
}
