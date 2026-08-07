// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// DEEP-LINK-TOOLS-001 Sprint 1 F2 — Generator pure-logic (URL encode helper).
//
// Inverso do parser: { toolId, payload } → URL string canônica.
// Caller: botão "Compartilhar esta tela" em cada painel Tier-A.
//
// SPEC: docs/specs/_archived/SPEC_DEEP_LINK_TOOLS_SHARING.md REQ-4

import { getDeepLinkEntry } from './deepLinkRegistry.js';
import { PAYLOAD_MAX_BYTES, utf8ByteLength } from './deepLinkParser.js';

export interface GenerateOptions {
    /** Base URL (default: window.location.origin + pathname; fallback ''). */
    readonly baseUrl?: string;
    /** Chave ECBT do modelo (opcional). */
    readonly key?: string;
}

export interface GenerateSuccess {
    readonly ok: true;
    readonly url: string;
    readonly bytes: number;
}

export interface GenerateFailure {
    readonly ok: false;
    readonly reason: 'unknown-tool-id' | 'payload-not-serializable' | 'payload-too-large';
    readonly detail: string;
}

export type GenerateResult = GenerateSuccess | GenerateFailure;

/**
 * Encode string UTF-8 → base64url (sem padding `=`).
 * Usa Buffer no Node, btoa no browser.
 */
export function encodeBase64Url(input: string): string {
    if (typeof input !== 'string') return '';
    let b64: string;
    if (typeof btoa === 'function') {
        // Browser: UTF-8 → bytes → binary string → btoa
        const bytes = new TextEncoder().encode(input);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
        b64 = btoa(bin);
    } else {
        b64 = Buffer.from(input, 'utf-8').toString('base64');
    }
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Resolve baseUrl com fallbacks defensivos.
 * Caller pode passar override; default usa location (browser) ou '' (node test).
 */
function resolveBaseUrl(opts: GenerateOptions): string {
    if (opts.baseUrl !== undefined) return String(opts.baseUrl);
    try {
        const loc = (globalThis as any).location;
        if (loc && typeof loc.origin === 'string' && typeof loc.pathname === 'string') {
            return loc.origin + loc.pathname;
        }
    } catch (e) {
        console.debug('[deepLink:generator] base-url resolution failed', (e as Error)?.message || e);
    }
    return '';
}

/**
 * Gera URL canônica para compartilhar uma ferramenta com estado pré-preenchido.
 *
 * @param toolId — id do registry (validado contra whitelist)
 * @param payload — opcional; será JSON.stringify + base64url. null/undefined omite.
 * @param opts — baseUrl + key ECBT opcional
 */
export function generateToolsUrl(
    toolId: string,
    payload?: unknown,
    opts: GenerateOptions = {},
): GenerateResult {
    const entry = getDeepLinkEntry(toolId);
    if (!entry) {
        return Object.freeze({
            ok: false,
            reason: 'unknown-tool-id',
            detail: `toolId "${toolId}" não está no DEEP_LINK_REGISTRY`,
        });
    }

    const base = resolveBaseUrl(opts);
    const params = new URLSearchParams();
    params.set('tools', entry.toolId);

    if (payload !== undefined && payload !== null) {
        let json: string;
        try {
            json = JSON.stringify(payload);
        } catch (e) {
            console.debug('[deepLink:generator] payload serialization failed', (e as Error)?.message || e);
            return Object.freeze({
                ok: false,
                reason: 'payload-not-serializable',
                detail: 'JSON.stringify falhou (referência circular?)',
            });
        }
        if (utf8ByteLength(json) > PAYLOAD_MAX_BYTES) {
            return Object.freeze({
                ok: false,
                reason: 'payload-too-large',
                detail: `payload JSON excede ${PAYLOAD_MAX_BYTES} bytes UTF-8`,
            });
        }
        params.set('payload', encodeBase64Url(json));
    }

    if (opts.key) params.set('key', opts.key);

    const qs = params.toString();
    const url = base ? `${base}?${qs}` : `?${qs}`;
    return Object.freeze({
        ok: true,
        url,
        bytes: utf8ByteLength(url),
    });
}
