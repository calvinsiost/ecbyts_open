// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RADAR GRANT MANAGER — CRUD de radar_access_grants

   SPEC: docs/specs/features/SPEC_DATASTUDIO_RADAR_PROFILES.md §4, §6

   - createGrant: minta token (grantToken), hash SHA-256, insere row.
     O token raw é retornado UMA VEZ (nunca armazenado em claro — só
     o hash em token_jwt_hash, spec §13 NOT).
   - revokeGrant / listGrants / listGrantsByProject / markGrantPaid
   - billing_status='unpaid' default — token-based billing (Calvin
     f7e5e43f: SEM project license cascade).

   Test mode: defina globalThis.__test_supabase__ com stub do client
   Supabase antes de invocar (mesmo padrão de profileRegistry.js —
   session.js puxa Supabase via CDN https:// que falha no ESM loader
   Node).
   ================================================================ */

import { mintGrantToken, hashToken } from './grantToken.js';

export const GRANT_ERROR_CODES = Object.freeze({
    INVALID_INPUT: 'INVALID_INPUT',
    SUPABASE_UNAVAILABLE: 'SUPABASE_UNAVAILABLE',
    NOT_FOUND: 'NOT_FOUND',
    IO_ERROR: 'IO_ERROR',
});

export class GrantError extends Error {
    code: string;
    details?: any;
    constructor(code: any, message: any, details?: any) {
        super(message);
        this.name = 'GrantError';
        this.code = code;
        if (details) {
            this.details = details;
        }
    }
}

/** @returns {Promise<any>} */
async function _getClient() {
    const testClient = (globalThis as any).__test_supabase__;
    if (testClient) return testClient;
    // Dynamic import: session.js puxa Supabase CDN (https://) que Node ESM
    // não resolve. Browser carrega normal; em tests setar __test_supabase__.
    const { getSupabaseClient } = await import('../../utils/auth/session.js' as string) as any;
    const client = getSupabaseClient();
    if (!client) {
        throw new GrantError(GRANT_ERROR_CODES.SUPABASE_UNAVAILABLE, 'Supabase não inicializado.');
    }
    return client;
}

function _apiSchemaClient(client: any) {
    return client && typeof client.schema === 'function' ? client.schema('api') : client;
}

function _parseRpcData(data: any) {
    if (typeof data !== 'string') return data;
    try {
        return JSON.parse(data);
    } catch {
        return data;
    }
}

/**
 * Origin do ambiente para montar a URL do grant.
 * @returns {string}
 */
function _origin() {
    if (typeof globalThis !== 'undefined' && globalThis.location && globalThis.location.origin) {
        return globalThis.location.origin;
    }
    return 'https://ecbyts.com';
}

/**
 * Cria um grant: minta token HS256, hash, insere radar_access_grants.
 *
 * Token retornado UMA VEZ — nunca armazenado raw (spec §13 NOT).
 * `secret` é o segredo HS256 por-projeto; production o injeta via
 * Supabase RPC `get_radar_signing_secret`. Aqui é parâmetro explícito.
 *
 * @param {object} input
 * @param {string} input.sliceId
 * @param {string} input.sliceSlug          usado na URL pública (?slice=)
 * @param {string} input.granteeEmail
 * @param {string} input.profileId
 * @param {string} input.projectId
 * @param {string} input.secret             segredo HS256 por-projeto
 * @param {number} [input.expiresInDays=7]  invite TTL — spec §4.2
 * @returns {Promise<{grantId:string, token:string, url:string, expiresAt:string}>}
 */
export async function createGrant(input: any) {
    if (!input || typeof input !== 'object') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'input obrigatório.');
    }
    const { sliceId, sliceSlug, granteeEmail, profileId, projectId, secret } = input;
    if (!sliceId || typeof sliceId !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'sliceId obrigatório (string).');
    }
    if (!granteeEmail || typeof granteeEmail !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'granteeEmail obrigatório (string).');
    }
    if (!projectId || typeof projectId !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'projectId obrigatório (string).');
    }
    if (!secret || typeof secret !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'secret obrigatório (string).');
    }
    const expiresInDays =
        typeof input.expiresInDays === 'number' && Number.isFinite(input.expiresInDays) && input.expiresInDays > 0
            ? Math.floor(input.expiresInDays)
            : 7;

    const token = await mintGrantToken({
        sliceId,
        granteeEmail,
        projectId,
        secret,
        expiresInDays,
    });
    const tokenHash = await hashToken(token);
    const nowMs = Date.now();
    const expiresAtIso = new Date(nowMs + expiresInDays * 86400000).toISOString();

    const row = {
        slice_id: sliceId,
        grantee_email: granteeEmail,
        profile_id: profileId || null,
        // Spec boundary: never store the raw JWT; lookup uses only token_jwt_hash.
        token_jwt_hash: tokenHash,
        billing_status: 'unpaid',
        issued_at: new Date(nowMs).toISOString(),
        expires_at: expiresAtIso,
    };

    let client;
    try {
        client = await _getClient();
    } catch (e: any) {
        if (e instanceof GrantError) throw e;
        throw new GrantError(GRANT_ERROR_CODES.SUPABASE_UNAVAILABLE, String(/** @type {any} */ (e)?.message || e));
    }

    const { data, error } = await _apiSchemaClient(client).rpc('radar_create_access_grant', {
        p_slice_id: row.slice_id,
        p_grantee_email: row.grantee_email,
        p_token_jwt_hash: row.token_jwt_hash,
        p_profile_id: row.profile_id,
        p_expires_at: row.expires_at,
    });
    const result = _parseRpcData(data);
    const grantId = String(result?.grantId || result?.grant_id || result?.id || result?.grant?.id || '');
    if (error || !grantId) {
        throw new GrantError(GRANT_ERROR_CODES.IO_ERROR, `Falha ao criar grant: ${error?.message || error}`, {
            supabaseError: error,
        });
    }
    const slug = sliceSlug || sliceId;
    const url = `${_origin()}/functions/v1/radar-access?token=${encodeURIComponent(token)}&slice=${encodeURIComponent(slug)}`;
    return Object.freeze({ grantId, token, url, expiresAt: expiresAtIso });
}

/**
 * Revoga um grant (sets revoked_at). Imediato (spec §4.2 Revoked).
 * @param {string} grantId
 * @param {string} [reason]
 * @returns {Promise<{grantId:string, revokedAt:string}>}
 */
export async function revokeGrant(grantId: any, reason: any) {
    if (!grantId || typeof grantId !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'grantId obrigatório (string).');
    }
    const client = await _getClient();
    const revokedAt = new Date().toISOString();
    const { data, error } = await _apiSchemaClient(client).rpc('radar_revoke_access_grant', {
        p_grant_id: grantId,
        p_reason: reason || null,
    });
    if (error) {
        throw new GrantError(GRANT_ERROR_CODES.IO_ERROR, `Falha ao revogar grant: ${error.message || error}`, {
            supabaseError: error,
        });
    }
    const result = _parseRpcData(data);
    return Object.freeze({ grantId, revokedAt: String(result?.revokedAt || revokedAt) });
}

/**
 * Marca grant como pago (stub para integração de checkout — Calvin/Codex).
 * @param {string} grantId
 * @returns {Promise<{grantId:string, billingStatus:string}>}
 */
export async function markGrantPaid(grantId: any) {
    if (!grantId || typeof grantId !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'grantId obrigatório (string).');
    }
    const client = await _getClient();
    const { error } = await _apiSchemaClient(client).rpc('radar_mark_access_grant_paid', {
        p_grant_id: grantId,
    });
    if (error) {
        throw new GrantError(GRANT_ERROR_CODES.IO_ERROR, `Falha ao marcar pago: ${error.message || error}`, {
            supabaseError: error,
        });
    }
    return Object.freeze({ grantId, billingStatus: 'paid' });
}

/**
 * Lista grants de um slice.
 * @param {string} sliceId
 * @returns {Promise<ReadonlyArray<any>>}
 */
export async function listGrants(sliceId: any) {
    if (!sliceId || typeof sliceId !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'sliceId obrigatório (string).');
    }
    const client = await _getClient();
    const { data, error } = await _apiSchemaClient(client)
        .from('radar_access_grants')
        .select('id, slice_id, grantee_email, profile_id, billing_status, issued_at, expires_at, revoked_at')
        .eq('slice_id', sliceId);
    if (error) {
        throw new GrantError(GRANT_ERROR_CODES.IO_ERROR, `Falha ao listar grants: ${error.message || error}`, {
            supabaseError: error,
        });
    }
    return Object.freeze(Array.isArray(data) ? data : []);
}

/**
 * Lista grants de um projeto (via join radar_slices).
 * @param {string} projectId
 * @returns {Promise<ReadonlyArray<any>>}
 */
export async function listGrantsByProject(projectId: any) {
    if (!projectId || typeof projectId !== 'string') {
        throw new GrantError(GRANT_ERROR_CODES.INVALID_INPUT, 'projectId obrigatório (string).');
    }
    const client = await _getClient();
    // radar_slices.project_id → radar_access_grants.slice_id
    const { data: slices, error: sliceErr } = await _apiSchemaClient(client).rpc('list_radar_slices', {
        p_project_id: projectId,
    });
    if (sliceErr) {
        throw new GrantError(GRANT_ERROR_CODES.IO_ERROR, `Falha ao listar slices: ${sliceErr.message || sliceErr}`, {
            supabaseError: sliceErr,
        });
    }
    const sliceIds = (Array.isArray(slices) ? slices : []).map((s: any) => s.id);
    if (sliceIds.length === 0) return Object.freeze([]);
    const { data, error } = await _apiSchemaClient(client)
        .from('radar_access_grants')
        .select('id, slice_id, grantee_email, profile_id, billing_status, issued_at, expires_at, revoked_at')
        .in('slice_id', sliceIds);
    if (error) {
        throw new GrantError(GRANT_ERROR_CODES.IO_ERROR, `Falha ao listar grants: ${error.message || error}`, {
            supabaseError: error,
        });
    }
    return Object.freeze(Array.isArray(data) ? data : []);
}
