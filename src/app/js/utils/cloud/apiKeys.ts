// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta

/* ================================================================
   API KEYS - Fase 2 Freemium: gerenciamento de chaves de API
   Autenticacao programatica para MCP e integracoes externas

   DESIGN:
   - Chave completa nunca armazenada; apenas SHA-256 no banco
   - Formato: ecb_live_<43 chars base62> (32 bytes de entropia)
   - prefix (16 chars) exibido na UI para identificacao visual
   - tier derivado no banco a partir do profile do usuario
   - revoked_at: soft-delete; chave invalidada, registro mantido

   FLUXO:
     generateApiKey() -> chave exibida UMA vez -> hash armazenado via api RPC
     validate-key (server-side) -> hash comparado por api.validate_api_key
     revokeApiKey() -> revoked_at preenchido via api RPC
   ================================================================ */

import { getSupabaseClient, getCurrentUser } from '../auth/session.js';

export interface ApiKeyRow {
    id: string;
    prefix: string;
    name: string;
    created_at: string;
    last_used: string | null;
    revoked_at: string | null;
}

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function getApiClient(client: any): any {
    return typeof client?.schema === 'function' ? client.schema('api') : client;
}

/**
 * Encode a Uint8Array to a base62 string.
 * 32 bytes -> ~43 chars.
 */
function toBase62(bytes: Uint8Array): string {
    let num = BigInt(
        '0x' +
            Array.from(bytes)
                .map((b) => b.toString(16).padStart(2, '0'))
                .join(''),
    );
    let result = '';
    const base = BigInt(62);
    while (num > 0n) {
        result = BASE62[Number(num % base)] + result;
        num = num / base;
    }
    return result.padStart(43, '0');
}

/**
 * Compute SHA-256 of a string, returns hex string.
 */
async function sha256Hex(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generate a new API key, store its hash through the API facade, return the full key.
 */
export async function generateApiKey(name: string = 'API Key'): Promise<string> {
    const user: any = getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const client: any = getSupabaseClient();

    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const keyBody = toBase62(randomBytes);
    const fullKey = `ecb_live_${keyBody}`;
    const prefix = fullKey.slice(0, 16);
    const keyHash = await sha256Hex(fullKey);

    const { error } = await getApiClient(client).rpc('create_api_key', {
        p_name: name || 'API Key',
        p_prefix: prefix,
        p_key_hash: keyHash,
    });
    if (error) throw new Error(error.message);
    return fullKey;
}

/**
 * Revoke an API key by ID.
 */
export async function revokeApiKey(keyId: string): Promise<void> {
    const user: any = getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const client: any = getSupabaseClient();
    const { error } = await getApiClient(client).rpc('revoke_api_key', {
        p_key_id: keyId,
    });
    if (error) throw new Error(error.message);
}

/**
 * List API keys for the current user without exposing key_hash.
 */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
    const user: any = getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    const client: any = getSupabaseClient();
    const { data, error } = await getApiClient(client)
        .from('api_keys')
        .select('id, prefix, name, created_at, last_used, revoked_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ApiKeyRow[];
}
