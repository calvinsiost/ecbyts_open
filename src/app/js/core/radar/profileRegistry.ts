// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RADAR PROFILE REGISTRY — CRUD de stakeholder profiles por projeto

   SPEC: docs/specs/features/SPEC_DATASTUDIO_RADAR_PROFILES.md (Phase 1)

   - createProfile / updateProfile / deleteProfile / listProfiles /
     duplicateProfile — operacoes contra a tabela radar_profiles
   - slugify — helper puro (lowercase, ASCII-only, underscores)
   - Cache em memoria Map<id, profile> invalidado em writes
   - Records imutaveis via Object.freeze (deep para rbac/redaction/etc.)

   Test mode: define globalThis.__test_supabase__ com stub do client
   Supabase antes de invocar para bypass do session.js (sem rede).
   ================================================================ */

// session.js eh importado dinamicamente em _getClient() para permitir testes
// Node-only (session.js puxa Supabase via CDN https:// que falha no ESM loader).
// Em browser o dynamic import resolve normalmente; em tests, basta setar
// globalThis.__test_supabase__ antes da chamada para bypass total.
//
// import { getSupabaseClient } from '../../utils/auth/session.js';

// ----------------------------------------------------------------
// CACHE
// ----------------------------------------------------------------

/** @type {Map<string, any>} */
const _cache = new Map();
/** @type {Map<string, string[]>} */
const _projectIndex = new Map(); // projectId -> [profileId, ...]

function _cachePut(profile: any) {
    if (!profile || !profile.id) return;
    _cache.set(profile.id, profile);
    if (profile.project_id) {
        const arr = _projectIndex.get(profile.project_id) || [];
        if (!arr.includes(profile.id)) arr.push(profile.id);
        _projectIndex.set(profile.project_id, arr);
    }
}

function _cacheRemove(id: any) {
    const prof = _cache.get(id);
    if (!prof) return;
    _cache.delete(id);
    if (prof.project_id) {
        const arr = _projectIndex.get(prof.project_id) || [];
        const idx = arr.indexOf(id);
        if (idx >= 0) arr.splice(idx, 1);
        if (arr.length === 0) _projectIndex.delete(prof.project_id);
        else _projectIndex.set(prof.project_id, arr);
    }
}

function _cacheClearProject(projectId: any) {
    const ids = _projectIndex.get(projectId);
    if (!ids) return;
    for (const id of ids) _cache.delete(id);
    _projectIndex.delete(projectId);
}

/** Test helper — reseta o cache. NAO usado em producao. */
export function _resetCache() {
    _cache.clear();
    _projectIndex.clear();
}

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/**
 * slugify — converte um nome em slug URL-safe.
 *
 * Regras:
 *   - lowercase
 *   - remove acentos via NFD + strip combining marks
 *   - espacos e pontuacao -> underscore
 *   - colapsa underscores consecutivos
 *   - remove underscores nas pontas
 *   - apenas [a-z0-9_]
 *
 * @param {string} name
 * @returns {string}
 */
import { slugify as _slugifyCanonical } from '../../utils/helpers/slugify.js';
import { safeJsonParse } from '../../utils/helpers/safeJsonParse.js';
export function slugify(name: any) {
    return _slugifyCanonical(name, { separator: '_' });
}

/** @returns {Promise<any>} */
async function _getClient() {
    // Test mode bypass — permite testes injetarem stub sem rede
    const testClient = (globalThis as any).__test_supabase__;
    if (testClient) return testClient;
    // Dynamic import: session.js pull Supabase CDN (https://) que Node ESM nao
    // resolve. No browser carrega normalmente; em tests basta setar
    // globalThis.__test_supabase__ para que essa branch nunca seja atingida.
    const { getSupabaseClient } = await import('../../utils/auth/session.js' as string) as any;
    const client = getSupabaseClient();
    if (!client) {
        const err = new Error('Supabase nao inicializado.');
        (err as any).code = 'supabase_unavailable';
        throw err;
    }
    return client;
}

function _apiSchemaClient(client: any) {
    return client && typeof client.schema === 'function' ? client.schema('api') : client;
}

function _parseRpcData(data: any) {
    if (typeof data !== 'string') return data;
    return safeJsonParse(data, data);
}

/**
 * Cria erro com .code anexado para que callers possam discriminar.
 * @param {string} message
 * @param {string} code
 * @returns {Error}
 */
function _err(message: any, code: any) {
    const e = new Error(message);
    (e as any).code = code;
    return e;
}

/**
 * Deep-freeze para records imutaveis.
 * @template T
 * @param {T} obj
 * @returns {T}
 */
function _deepFreeze(obj: any) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Object.isFrozen(obj)) return obj;
    for (const key of Object.keys(obj)) {
        const v = (obj)[key];
        if (v && typeof v === 'object') _deepFreeze(v) as any;
    }
    return Object.freeze(obj);
}

/** UUID v4 (loose) check — aceita qualquer string com formato de uuid. */
function _isUuidLike(s: any) {
    return (
        typeof s === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
    );
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

const _VALID_AUTH_METHODS = new Set([
    'email',
    'sso',
    'cnpj_verify',
    'oab_credential',
    'crea_credential',
    'invite_link',
    'e_signature',
    'project_owner',
]);

const _VALID_PII = new Set(['none', 'mask', 'remove']);
const _VALID_BILLING_MODELS = new Set(['free', 'tokens', 'none']);
const _RBAC_KEYS = ['read', 'write', 'sign', 'share', 'delete'];

/**
 * Valida e normaliza o RBAC matrix. Retorna objeto novo com defaults.
 * @param {any} rbac
 * @returns {{read:boolean, write:boolean, sign:boolean, share:boolean, delete:boolean}}
 */
function _validateRbac(rbac: any) {
    if (rbac == null) {
        return { read: false, write: false, sign: false, share: false, delete: false };
    }
    if (typeof rbac !== 'object' || Array.isArray(rbac)) {
        throw _err('rbac deve ser objeto com chaves read/write/sign/share/delete', 'invalid_input');
    }
    /** @type {any} */
    const out: Record<string, any> = {};
    for (const k of _RBAC_KEYS) {
        const v = rbac[k];
        if (v !== undefined && typeof v !== 'boolean') {
            throw _err(`rbac.${k} deve ser boolean`, 'invalid_input');
        }
        out[k] = v === true;
    }
    return out;
}

/**
 * Valida redaction config. Retorna novo objeto normalizado.
 * @param {any} redaction
 */
function _validateRedaction(redaction: any) {
    if (redaction == null) return { pii: 'none', precision_decimals: 4 };
    if (typeof redaction !== 'object' || Array.isArray(redaction)) {
        throw _err('redaction deve ser objeto', 'invalid_input');
    }
    const pii = redaction.pii === undefined ? 'none' : redaction.pii;
    if (!_VALID_PII.has(pii)) {
        throw _err(`redaction.pii invalido: ${pii}`, 'invalid_input');
    }
    let precision = redaction.precision_decimals;
    if (precision === undefined) precision = 4;
    if (typeof precision !== 'number' || !Number.isInteger(precision) || precision < 0 || precision > 12) {
        throw _err('redaction.precision_decimals deve ser int 0..12', 'invalid_input');
    }
    return { pii, precision_decimals: precision };
}

function _validateBilling(billing: any) {
    if (billing == null) return { required: false, model: 'free' };
    if (typeof billing !== 'object' || Array.isArray(billing)) {
        throw _err('billing deve ser objeto', 'invalid_input');
    }
    const model = billing.model === undefined ? 'free' : billing.model;
    if (!_VALID_BILLING_MODELS.has(model)) {
        throw _err(`billing.model invalido: ${model}`, 'invalid_input');
    }
    const required = billing.required === true;
    return { required, model };
}

function _validateRateLimit(rateLimit: any) {
    if (rateLimit == null) return { tokens_per_second: 10, max_tokens_per_request: 1000 };
    if (typeof rateLimit !== 'object' || Array.isArray(rateLimit)) {
        throw _err('rateLimit deve ser objeto', 'invalid_input');
    }
    const tps =
        rateLimit.tokens_per_second === undefined ? 10 : rateLimit.tokens_per_second;
    const maxReq =
        rateLimit.max_tokens_per_request === undefined
            ? 1000
            : rateLimit.max_tokens_per_request;
    if (typeof tps !== 'number' || tps < 0 || !Number.isFinite(tps)) {
        throw _err('rateLimit.tokens_per_second deve ser numero >= 0', 'invalid_input');
    }
    if (typeof maxReq !== 'number' || maxReq < 0 || !Number.isFinite(maxReq)) {
        throw _err('rateLimit.max_tokens_per_request deve ser numero >= 0', 'invalid_input');
    }
    return { tokens_per_second: tps, max_tokens_per_request: maxReq };
}

/**
 * Validacao basica de input de criacao. Retorna row normalizada (sem id).
 * @param {{
 *   projectId: string,
 *   name: string,
 *   description?: string,
 *   icon?: string,
 *   color?: string,
 *   authMethod?: string,
 *   rbac?: any,
 *   redaction?: any,
 *   billing?: any,
 *   rateLimit?: any,
 *   auditRetentionDays?: number,
 *   isSeed?: boolean,
 * }} input
 */
function _normalizeCreateInput(input: any) {
    if (!input || typeof input !== 'object') {
        throw _err('input obrigatorio', 'invalid_input');
    }
    if (!_isUuidLike(input.projectId)) {
        throw _err('projectId deve ser uuid valido', 'invalid_input');
    }
    if (typeof input.name !== 'string' || !input.name.trim()) {
        throw _err('name obrigatorio', 'invalid_input');
    }
    const name = input.name.trim();
    const slug = slugify(name);
    if (!slug) {
        throw _err('name nao pode ser slugificado (vazio apos normalizacao)', 'invalid_input');
    }
    const authMethod = input.authMethod ?? 'email';
    if (!_VALID_AUTH_METHODS.has(authMethod)) {
        throw _err(`authMethod invalido: ${authMethod}`, 'invalid_input');
    }
    const rbac = _validateRbac(input.rbac);
    const redaction = _validateRedaction(input.redaction);
    const default_billing = _validateBilling(input.billing);
    const default_rate_limit = _validateRateLimit(input.rateLimit);
    const audit_retention_days =
        input.auditRetentionDays === undefined ? 365 : input.auditRetentionDays;
    if (
        typeof audit_retention_days !== 'number' ||
        !Number.isInteger(audit_retention_days) ||
        audit_retention_days < 0
    ) {
        throw _err('auditRetentionDays deve ser int >= 0', 'invalid_input');
    }
    return {
        project_id: input.projectId,
        name,
        slug,
        description: typeof input.description === 'string' ? input.description : null,
        icon: typeof input.icon === 'string' ? input.icon : null,
        color: typeof input.color === 'string' ? input.color : null,
        auth_method: authMethod,
        rbac,
        redaction,
        audit_retention_days,
        default_billing,
        default_rate_limit,
        is_seed: input.isSeed === true,
    };
}

/**
 * Merge patch sobre profile existente. Retorna nova row para UPDATE.
 * Apenas campos editaveis sao aceitos; valida cada um.
 * @param {any} existing
 * @param {Record<string, any>} patch
 */
function _normalizeUpdatePatch(existing: any, patch: any) {
    if (!patch || typeof patch !== 'object') {
        throw _err('patch obrigatorio', 'invalid_input');
    }
    /** @type {Record<string, any>} */
    const out: Record<string, any> = {};
    if (patch.name !== undefined) {
        if (typeof patch.name !== 'string' || !patch.name.trim()) {
            throw _err('name deve ser string nao-vazia', 'invalid_input');
        }
        out.name = patch.name.trim();
        const slug = slugify(out.name);
        if (!slug) {
            throw _err('name nao pode ser slugificado', 'invalid_input');
        }
        out.slug = slug;
    }
    if (patch.description !== undefined) {
        if (patch.description !== null && typeof patch.description !== 'string') {
            throw _err('description deve ser string ou null', 'invalid_input');
        }
        out.description = patch.description;
    }
    if (patch.icon !== undefined) out.icon = patch.icon;
    if (patch.color !== undefined) out.color = patch.color;
    if (patch.authMethod !== undefined) {
        if (!_VALID_AUTH_METHODS.has(patch.authMethod)) {
            throw _err(`authMethod invalido: ${patch.authMethod}`, 'invalid_input');
        }
        out.auth_method = patch.authMethod;
    }
    if (patch.rbac !== undefined) out.rbac = _validateRbac(patch.rbac);
    if (patch.redaction !== undefined) out.redaction = _validateRedaction(patch.redaction);
    if (patch.billing !== undefined) out.default_billing = _validateBilling(patch.billing);
    if (patch.rateLimit !== undefined) {
        out.default_rate_limit = _validateRateLimit(patch.rateLimit);
    }
    if (patch.auditRetentionDays !== undefined) {
        if (
            typeof patch.auditRetentionDays !== 'number' ||
            !Number.isInteger(patch.auditRetentionDays) ||
            patch.auditRetentionDays < 0
        ) {
            throw _err('auditRetentionDays deve ser int >= 0', 'invalid_input');
        }
        out.audit_retention_days = patch.auditRetentionDays;
    }
    if (Object.keys(out).length === 0) {
        throw _err('patch sem campos validos para update', 'invalid_input');
    }
    return out;
}

// ----------------------------------------------------------------
// CRUD — Supabase-backed
// ----------------------------------------------------------------

/**
 * Cria um novo profile na tabela radar_profiles.
 *
 * @param {{
 *   projectId: string,
 *   name: string,
 *   description?: string,
 *   icon?: string,
 *   color?: string,
 *   authMethod?: string,
 *   rbac?: any,
 *   redaction?: any,
 *   billing?: any,
 *   rateLimit?: any,
 *   auditRetentionDays?: number,
 *   isSeed?: boolean,
 * }} input
 * @returns {Promise<any>} frozen profile record
 */
export async function createProfile(input: any) {
    const row = _normalizeCreateInput(input);
    const client = await _getClient();
    const { data, error } = await _apiSchemaClient(client).rpc('create_radar_profile', {
        p_project_id: row.project_id,
        p_name: row.name,
        p_payload: row,
    });
    if (error) {
        throw _err(`createProfile falhou: ${error.message || error}`, 'db_error');
    }
    const profile = _parseRpcData(data);
    if (!profile) {
        throw _err('createProfile retornou sem dados', 'db_error');
    }
    const frozen = _deepFreeze({ ...profile });
    _cachePut(frozen);
    return frozen;
}

/**
 * Atualiza profile existente (parcial). Mudancas nao retroagem em grants.
 *
 * @param {string} id
 * @param {Record<string, any>} patch
 * @returns {Promise<any>} frozen updated profile
 */
export async function updateProfile(id: any, patch: any) {
    if (!_isUuidLike(id)) {
        throw _err('id deve ser uuid valido', 'invalid_input');
    }
    // Para validar slug fica consistente precisamos do row atual — mas podemos
    // confiar no Supabase para reportar conflito de UNIQUE(project_id, slug)
    // se o slug do novo name colidir.
    const update = _normalizeUpdatePatch(/* existing */ null, patch);
    const client = await _getClient();
    const { data, error } = await _apiSchemaClient(client).rpc('update_radar_profile', {
        p_profile_id: id,
        p_patch: update,
    });
    if (error) {
        throw _err(`updateProfile falhou: ${error.message || error}`, 'db_error');
    }
    const profile = _parseRpcData(data);
    if (!profile) {
        throw _err(`profile ${id} nao encontrado`, 'not_found');
    }
    const frozen = _deepFreeze({ ...profile });
    _cache.delete(id);
    _cachePut(frozen);
    return frozen;
}

/**
 * Deleta profile. Falha se existem grants ativos referenciando-o.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteProfile(id: any) {
    if (!_isUuidLike(id)) {
        throw _err('id deve ser uuid valido', 'invalid_input');
    }
    const client = await _getClient();
    const { error } = await _apiSchemaClient(client).rpc('delete_radar_profile', {
        p_profile_id: id,
    });
    if (error) {
        const code = String(error.message || error).includes('profile_in_use') ? 'profile_in_use' : 'db_error';
        throw _err(`deleteProfile falhou: ${error.message || error}`, code);
    }
    _cacheRemove(id);
}

/**
 * Lista profiles de um projeto. Cache invalidado em writes.
 *
 * @param {string} projectId
 * @returns {Promise<ReadonlyArray<any>>} frozen array
 */
export async function listProfiles(projectId: any) {
    if (!_isUuidLike(projectId)) {
        throw _err('projectId deve ser uuid valido', 'invalid_input');
    }
    const client = await _getClient();
    const { data, error } = await _apiSchemaClient(client).rpc('list_radar_profiles', {
        p_project_id: projectId,
    });
    if (error) {
        throw _err(`listProfiles falhou: ${error.message || error}`, 'db_error');
    }
    const result = _parseRpcData(data);
    const list = Array.isArray(result) ? result : [];
    _cacheClearProject(projectId);
    const frozen = list.map((row: any) => _deepFreeze({ ...row }));
    for (const p of frozen) _cachePut(p);
    return Object.freeze(frozen);
}

/**
 * Duplica um profile com nome novo. project_id e demais campos sao copiados.
 *
 * @param {string} id
 * @param {string} newName
 * @returns {Promise<any>} frozen new profile
 */
export async function duplicateProfile(id: any, newName: any) {
    if (!_isUuidLike(id)) {
        throw _err('id deve ser uuid valido', 'invalid_input');
    }
    if (typeof newName !== 'string' || !newName.trim()) {
        throw _err('newName obrigatorio', 'invalid_input');
    }
    const client = await _getClient();
    const { data, error } = await _apiSchemaClient(client).rpc('duplicate_radar_profile', {
        p_profile_id: id,
        p_new_name: newName,
    });
    if (error) {
        throw _err(`duplicateProfile falhou: ${error.message || error}`, 'db_error');
    }
    const profile = _parseRpcData(data);
    if (!profile) {
        throw _err(`profile ${id} nao encontrado`, 'not_found');
    }
    const frozen = _deepFreeze({ ...profile });
    _cachePut(frozen);
    return frozen;
}

// ----------------------------------------------------------------
// TEST-ONLY EXPORTS — usados apenas por tests/radar-profile-registry.test.mjs
// ----------------------------------------------------------------

export const __internal = Object.freeze({
    _normalizeCreateInput,
    _normalizeUpdatePatch,
    _validateRbac,
    _validateRedaction,
    _validateBilling,
    _validateRateLimit,
    _isUuidLike,
    _deepFreeze,
});
