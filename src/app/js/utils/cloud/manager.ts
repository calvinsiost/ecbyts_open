// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CLOUD MANAGER — Save/Load/Share models in Supabase
   Salvar, carregar e compartilhar modelos na nuvem via Supabase

   OPERACOES:
   - Salvar modelo atual no banco (JSONB)
   - Listar modelos do usuario
   - Carregar modelo do banco
   - Deletar modelo
   - Compartilhar modelo com outro usuario
   - Listar modelos compartilhados
   ================================================================ */
import { getSupabaseClient, getCurrentUser } from '../auth/session.js';
import { logNetworkAware } from '../helpers/_offlineAwareLogPure.js';
import { buildModel } from '../../core/io/export.js';
import { recordUsage } from '../../core/metering/quota.js';
const AUTOSAVE_MAX_STATES = 5;
const AUTOSAVE_SOURCE = 'autosave';
const AUTOSAVE_MAX_LANES_FREE = 3;
const AUTOSAVE_PRUNE_BUFFER = 2;
const AUTOSAVE_PRUNE_FALLBACK_DELETE_LIMIT = 200;
const AUTOSAVE_LANE_TOUCH_MIN_INTERVAL_MS = 60 * 1000;
const AUTOSAVE_PRUNE_RPC = 'prune_model_state_snapshots';
const AUTOSAVE_DELETE_LANE_RPC = 'delete_autosave_lane_with_snapshots';
const LANE_SCOPE_PREFIX = 'lane:';
const DEFAULT_LANE_NAME = 'Raia Principal';
let _lastAutosaveFingerprint = '';
let _laneTouchCache = new Map();
const _laneTouchInFlight = new Set();
const _autosaveScopeCountHints = new Map();
// ----------------------------------------------------------------
// LANE STATE
// ----------------------------------------------------------------
let _activeLaneId: string | null = null; // UUID da raia ativa (null = modo legado)
let _lanesCache: any[] | null = null; // cache em memória das raias do usuário
function _isMissingColumnError(err: any, columnName: string) {
    const msg = String(err?.message || '').toLowerCase();
    if (!msg || !columnName)
        return false;
    const col = String(columnName).toLowerCase();
    return (msg.includes(`column user_autosave_lanes.${col} does not exist`) ||
        msg.includes(`could not find the '${col}' column`) ||
        msg.includes(`column "${col}" does not exist`));
}
async function _selectLanes(client: any, userId: string, useLegacyName = false) {
    const selectExpr = useLegacyName
        ? 'id, name, scope_key, created_at, last_used_at'
        : 'id, name:lane_name, scope_key, created_at, last_used_at';
    return client
        .from('user_autosave_lanes')
        .select(selectExpr)
        .eq('owner_id', userId)
        .order('last_used_at', { ascending: false, nullsFirst: false });
}
/**
 * Load autosave lanes from Supabase. Creates default lane if none exist.
 * Carrega raias do Supabase. Cria raia padrão se não houver nenhuma.
 *
 * @returns {Promise<Array<{id:string, name:string, scope_key:string, last_used_at:any}>>}
 */
export async function loadAutosaveLanes() {
    const user = /** @type {any} */ (getCurrentUser());
    if (!user)
        return [];
    try {
        const client = /** @type {any} */ (getSupabaseClient());
        if (!client)
            return [];
        // Fix #6 (2026-04-11): schema uses `lane_name` (not `name`). Select
        // with alias so JS code + callers keep using `.name` untouched.
        let { data, error } = await _selectLanes(client, user.id, false);
        if (error && _isMissingColumnError(error, 'lane_name')) {
            ({ data, error } = await _selectLanes(client, user.id, true));
        }
        if (error)
            throw error;
        let lanes = Array.isArray(data) ? data : [];
        // Criar raia padrão se não houver nenhuma
        if (lanes.length === 0) {
            const created = await _createDefaultLane(client, user.id);
            if (created)
                lanes = [created];
        }
        _lanesCache = lanes;
        _syncLaneTouchCache(lanes);
        // Restaurar raia ativa do localStorage e validar
        const savedId = typeof localStorage !== 'undefined' ? localStorage.getItem('ecbyts-active-lane-id') : null;
        const validLane = savedId && lanes.find((l: any) => l.id === savedId);
        _activeLaneId = validLane ? savedId : lanes[0]?.id || null;
        if (_activeLaneId && typeof localStorage !== 'undefined') {
            localStorage.setItem('ecbyts-active-lane-id', _activeLaneId);
        }
        return lanes;
    } catch (err: any) {
        // Offline-aware (BUG-019 drain): offline já é surfaceado pelo banner do
        // mascote — falha de rede nesse estado vira debug (fora da telemetria).
        logNetworkAware(console, err, ['[AutosaveLanes] loadAutosaveLanes failed:', (err)?.message]);
        return [];
    }
}
async function _createDefaultLane(client: any, userId: string) {
    try {
        const scopeKey = `${LANE_SCOPE_PREFIX}${_generateLaneId()}`;
        // Fix #6: insert uses real column `lane_name`; select aliases back to `name`.
        let { data, error } = await client
            .from('user_autosave_lanes')
            .insert({ owner_id: userId, lane_name: DEFAULT_LANE_NAME, scope_key: scopeKey })
            .select('id, name:lane_name, scope_key, created_at, last_used_at')
            .single();
        if (error && _isMissingColumnError(error, 'lane_name')) {
            ({ data, error } = await client
                .from('user_autosave_lanes')
                .insert({ owner_id: userId, name: DEFAULT_LANE_NAME, scope_key: scopeKey })
                .select('id, name, scope_key, created_at, last_used_at')
                .single());
        }
        if (error)
            throw error;
        return data;
    } catch (err: any) {
        console.warn('[AutosaveLanes] create default lane failed:', /** @type {any} */ (err)?.message);
        return null;
    }
}
/**
 * Create a new autosave lane. Checks freemium quota.
 * Cria uma nova raia. Verifica quota freemium.
 *
 * @param {string} [name]
 * @returns {Promise<{ok:boolean, lane?:object, reason?:string}>}
 */
export async function createAutosaveLane(name = '') {
    const user = /** @type {any} */ (getCurrentUser());
    if (!user)
        return { ok: false, reason: 'Nao autenticado.' };
    const client = /** @type {any} */ (getSupabaseClient());
    if (!client)
        return { ok: false, reason: 'offline' };
    try {
        // Verificar quota freemium
        const lanes = _lanesCache || (await loadAutosaveLanes());
        const tier = user.tier || 'free';
        if (tier === 'free' && lanes.length >= AUTOSAVE_MAX_LANES_FREE) {
            return {
                ok: false,
                reason: `Limite de ${AUTOSAVE_MAX_LANES_FREE} raias (free). Faca upgrade para Pro.`,
            };
        }
        const laneName = (name || `Raia ${lanes.length + 1}`).slice(0, 80);
        const scopeKey = `${LANE_SCOPE_PREFIX}${_generateLaneId()}`;
        // Fix #6: schema column is `lane_name`.
        let { data, error } = await client
            .from('user_autosave_lanes')
            .insert({ owner_id: user.id, lane_name: laneName, scope_key: scopeKey })
            .select('id, name:lane_name, scope_key, created_at, last_used_at')
            .single();
        if (error && _isMissingColumnError(error, 'lane_name')) {
            ({ data, error } = await client
                .from('user_autosave_lanes')
                .insert({ owner_id: user.id, name: laneName, scope_key: scopeKey })
                .select('id, name, scope_key, created_at, last_used_at')
                .single());
        }
        if (error)
            throw error;
        _lanesCache = null; // invalidar cache
        return { ok: true, lane: data };
    } catch (err: any) {
        console.warn('[AutosaveLanes] createAutosaveLane failed:', /** @type {any} */ (err)?.message);
        return { ok: false, reason: /** @type {any} */ (err)?.message || 'Erro ao criar raia.' };
    }
}
/**
 * Rename an autosave lane.
 * Renomeia uma raia.
 *
 * @param {string} laneId
 * @param {string} name
 * @returns {Promise<boolean>}
 */
export async function renameAutosaveLane(laneId: any, name: any) {
    if (!laneId || !name)
        return false;
    const client = /** @type {any} */ (getSupabaseClient());
    const user = /** @type {any} */ (getCurrentUser());
    if (!client || !user)
        return false;
    try {
        // Fix #6: schema column is `lane_name`.
        let { error } = await client
            .from('user_autosave_lanes')
            .update({ lane_name: name.slice(0, 80) })
            .eq('id', laneId)
            .eq('owner_id', user.id);
        if (error && _isMissingColumnError(error, 'lane_name')) {
            ({ error } = await client
                .from('user_autosave_lanes')
                .update({ name: name.slice(0, 80) })
                .eq('id', laneId)
                .eq('owner_id', user.id));
        }
        if (error)
            throw error;
        _lanesCache = null;
        return true;
    } catch (err: any) {
        console.warn('[AutosaveLanes] renameAutosaveLane failed:', /** @type {any} */ (err)?.message);
        return false;
    }
}
/**
 * Delete an autosave lane and all its snapshots.
 * Deleta uma raia e todos os seus snapshots.
 *
 * @param {string} laneId
 * @returns {Promise<boolean>}
 */
export async function deleteAutosaveLane(laneId: any) {
    if (!laneId)
        return false;
    const client = /** @type {any} */ (getSupabaseClient());
    const user = /** @type {any} */ (getCurrentUser());
    if (!client || !user)
        return false;
    try {
        const lanes = _lanesCache || (await loadAutosaveLanes());
        if (lanes.length <= 1) {
            // Criar nova raia padrão antes de deletar a última
            await _createDefaultLane(client, user.id);
        }
        // Buscar scope_key da raia para deletar seus snapshots
        const lane = lanes.find((l: any) => l.id === laneId);
        const deletedServerSide = lane ? await _deleteAutosaveLaneServerSide(client, laneId) : false;
        if (!deletedServerSide && lane) {
            await client.from('model_state_snapshots').delete().eq('owner_id', user.id).eq('scope_key', lane.scope_key);
        }
        if (!deletedServerSide) {
            const { error } = await client
                .from('user_autosave_lanes')
                .delete()
                .eq('id', laneId)
                .eq('owner_id', user.id);
            if (error)
                throw error;
        }
        _laneTouchCache.delete(laneId);
        _laneTouchInFlight.delete(laneId);
        if (lane?.scope_key)
            _autosaveScopeCountHints.delete(lane.scope_key);
        // Se deletou a raia ativa, selecionar outra
        if (_activeLaneId === laneId) {
            _lanesCache = null;
            const refreshed = await loadAutosaveLanes();
            const next = refreshed[0];
            if (next)
                setActiveLane(next.id);
        }
        else {
            _lanesCache = null;
        }
        return true;
    } catch (err: any) {
        console.warn('[AutosaveLanes] deleteAutosaveLane failed:', /** @type {any} */ (err)?.message);
        return false;
    }
}
/**
 * Set the active lane and persist to localStorage.
 * Define a raia ativa e persiste em localStorage.
 *
 * @param {string} laneId
 */
export function setActiveLane(laneId: any) {
    _activeLaneId = laneId;
    if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ecbyts-active-lane-id', laneId);
    }
    // Resetar fingerprint para forçar próximo save na nova raia
    _lastAutosaveFingerprint = '';
}
/**
 * Set active lane by scope_key.
 * Define raia ativa a partir do scope_key.
 *
 * @param {string} scopeKey
 * @returns {Promise<boolean>}
 */
export async function setActiveLaneByScope(scopeKey: any) {
    if (!scopeKey)
        return false;
    const lanes = _lanesCache || (await loadAutosaveLanes());
    const lane = Array.isArray(lanes) ? lanes.find((l: any) => l.scope_key === scopeKey) : null;
    if (!lane?.id)
        return false;
    setActiveLane(lane.id);
    return true;
}
/**
 * Get the active lane object.
 * Retorna o objeto da raia ativa.
 *
 * @returns {{id:string, name:string, scope_key:string}|null}
 */
export function getActiveLane() {
    if (!_activeLaneId || !_lanesCache)
        return null;
    return _lanesCache.find((l: any) => l.id === _activeLaneId) || null;
}
/**
 * Get cached lanes list.
 * Retorna a lista de raias em cache.
 *
 * @returns {Array<any>}
 */
export function getCachedLanes() {
    return _lanesCache || [];
}
function _generateLaneId() {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b: any) => b.toString(16).padStart(2, '0')).join('');
}
// ----------------------------------------------------------------
// SAVE
// ----------------------------------------------------------------
/**
 * Save current model to Supabase cloud.
 * Salva o modelo atual no banco de dados Supabase.
 *
 * @param {string} name - Nome do modelo
 * @param {string} [description] - Descricao opcional
 * @returns {Promise<Object>} - Modelo salvo (com id)
 */
export async function saveModelToCloud(name: any, description = '') {
    const client = ensureClient();
    const user = ensureUser();
    // Fase 2: hard enforcement gate para models (antes de persistir)
    try {
        const { checkAndConsume } = await import('../../core/metering/quota.js');
        const quota = await checkAndConsume('models', 1);
        if (!quota.allowed) {
            throw new Error('quota_exceeded:models');
        }
    } catch (e: any) {
        if ( /** @type {any} */(e).message === 'quota_exceeded:models')
            throw e;
        // Graceful degradation: se metering indisponivel, prosseguir
    }
    const model = /** @type {{ elements?: any[], campaigns?: any[] }} */ (buildModel());
    const elements = model.elements || [];
    const campaigns = model.campaigns || [];
    // Calcula delta de observacoes (apenas novas desde o ultimo save)
    const _countObs = (m: any) => (m?.elements ?? []).reduce((s: any, el: any) => s + (Array.isArray(el?.data?.observations) ? el.data.observations.length : 0), 0);
    let _obsDelta = _countObs(model);
    try {
        const { data: existing } = await client
            .from('models')
            .select('model_data')
            .eq('owner_id', user.id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle(); // 406-safe: usuario pode nao ter modelo anterior (conta tudo como novo)
        if (existing?.model_data) {
            _obsDelta = Math.max(0, _countObs(model) - _countObs(existing.model_data));
        }
    } catch (e: any) {
        console.debug('[cloud] obs-delta-no-prior-model:', 
        /** @type {any} */ (e)?.message || e); /* original: nenhum modelo anterior — conta tudo como novo */
    }
    const { data, error } = await client
        .from('models')
        .insert({
        owner_id: user.id,
        name,
        description,
        model_data: model,
        element_count: elements.length,
        campaign_count: campaigns.length,
        has_blockchain: false,
    })
        .select('id, name, created_at')
        .single();
    if (error)
        throw new Error(`Erro ao salvar modelo: ${error.message}`);
    if (_obsDelta > 0)
        recordUsage('observations', _obsDelta, { modelName: name });
    return data;
}
/**
 * Update existing model in Supabase cloud.
 * Atualiza modelo existente no banco.
 *
 * @param {string} modelId - UUID do modelo
 * @returns {Promise<Object>} - Modelo atualizado
 */
export async function updateModelInCloud(modelId: any) {
    const client = ensureClient();
    ensureUser();
    const model = /** @type {{ elements?: any[], campaigns?: any[] }} */ (buildModel());
    const elements = model.elements || [];
    const campaigns = model.campaigns || [];
    // Calcula delta de observacoes em relacao a versao anterior
    const _countObs = (m: any) => (m?.elements ?? []).reduce((s: any, el: any) => s + (Array.isArray(el?.data?.observations) ? el.data.observations.length : 0), 0);
    let _obsDelta = 0;
    try {
        const { data: existing } = await client.from('models').select('model_data').eq('id', modelId).maybeSingle(); // 406-safe: modelo pode ter sido deletado (existing?. tolerado)
        _obsDelta = Math.max(0, _countObs(model) - _countObs(existing?.model_data));
    } catch (e: any) {
        console.debug('[cloud] obs-delta-update-fetch:', 
        /** @type {any} */ (e)?.message || e); /* original: nao bloqueia o update */
    }
    const { data, error } = await client
        .from('models')
        .update({
        model_data: model,
        element_count: elements.length,
        campaign_count: campaigns.length,
    })
        .eq('id', modelId)
        .select('id, name, updated_at')
        .maybeSingle(); // 406-safe: modelo pode ter sido deletado (error/data=null tratado abaixo)
    if (error || !data)
        throw new Error(`Erro ao atualizar modelo: ${error?.message || 'modelo nao encontrado'}`);
    if (_obsDelta > 0)
        recordUsage('observations', _obsDelta, { modelId });
    // 'models' NAO e contado em updates
    return data;
}
// ----------------------------------------------------------------
// LOAD / LIST
// ----------------------------------------------------------------
/**
 * List user's models (metadata only, no model_data).
 * Lista modelos do usuario (somente metadados, sem dados completos).
 *
 * @returns {Promise<Array<any>>} - Lista de modelos
 */
export async function loadModelsFromCloud() {
    const client = ensureClient();
    const user = ensureUser();
    const { data, error } = await client
        .from('models')
        .select('id, name, description, element_count, campaign_count, has_blockchain, professional_validation, is_public, created_at, updated_at')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false });
    if (error)
        throw new Error(`Erro ao listar modelos: ${error.message}`);
    return data || [];
}
/**
 * Load full model data from Supabase cloud.
 * Carrega dados completos do modelo do banco.
 *
 * @param {string} modelId - UUID do modelo
 * @returns {Promise<Object>} - Objeto modelo completo (para applyModel)
 */
export async function loadModelFromCloud(modelId: any) {
    const client = ensureClient();
    ensureUser();
    const { data, error } = await client.from('models').select('model_data').eq('id', modelId).maybeSingle(); // 406-safe: modelo pode ter sido deletado (error/!data tratado abaixo)
    if (error || !data)
        throw new Error(`Erro ao carregar modelo: ${error?.message || 'modelo nao encontrado'}`);
    return data?.model_data;
}
/**
 * Load the most recently updated model for the current user.
 * Carrega o modelo mais recente do usuario autenticado.
 *
 * @returns {Promise<{modelId: string, modelData: Object}|null>} - Dados do modelo ou null se nenhum
 */
export async function loadMostRecentModel() {
    const client = ensureClient();
    const user = ensureUser();
    const { data, error } = await client
        .from('models')
        .select('id, model_data')
        .eq('owner_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle(); // 406-safe: usuario sem nenhum modelo e estado NORMAL (retorna null abaixo)
    if (error) {
        // PGRST116 = nenhuma linha retornada - usuario nao tem modelos
        // (defesa residual: maybeSingle ja resolve 0 linhas como data=null sem erro)
        if (error.code === 'PGRST116')
            return null;
        throw new Error(`Erro ao carregar modelo recente: ${error.message}`);
    }
    return data ? { modelId: data.id, modelData: data.model_data } : null;
}
/**
 * Delete model from Supabase cloud.
 * Deleta modelo do banco.
 *
 * @param {string} modelId - UUID do modelo
 */
export async function deleteModelFromCloud(modelId: any) {
    const client = ensureClient();
    ensureUser();
    const { error } = await client.from('models').delete().eq('id', modelId);
    if (error)
        throw new Error(`Erro ao deletar modelo: ${error.message}`);
}
// ----------------------------------------------------------------
// AUTOSAVE SNAPSHOTS (last 5 states per scope)
// ----------------------------------------------------------------
/**
 * Persist one autosave snapshot to Supabase and keep only the last 5 states.
 * Persiste um snapshot de autosave no Supabase e retém apenas os 5 últimos.
 *
 * @param {Object} params
 * @param {any} params.modelData - Modelo completo (ECO1 buildModel)
 * @param {string|null} [params.modelId] - UUID do modelo cloud (se houver)
 * @param {string|null} [params.scopeKey] - Escopo lógico (ex.: cloud:<id> / local:session)
 * @param {string|null} [params.thumbnailDataUrl] - Miniatura data URL (jpeg/png)
 * @param {boolean} [params.force=false] - Ignora throttle/fingerprint
 * @returns {Promise<Object|null>} - Snapshot salvo (id/created_at) ou null se suprimido
 */
export async function autosaveModelSnapshot({ modelData, modelId = null, scopeKey = null, thumbnailDataUrl = null, force = false }: any = {}) {
    if (!modelData || typeof modelData !== 'object') {
        return null;
    }
    const client = ensureClient();
    const user = ensureUser();
    const resolvedScope = _resolveAutosaveScope({
        modelId: /** @type {any} */ (modelId),
        scopeKey: /** @type {any} */ (scopeKey),
    });
    const fingerprint = _buildAutosaveFingerprint(modelData, resolvedScope);
    if (!force) {
        if (fingerprint === _lastAutosaveFingerprint) {
            return null;
        }
    }
    const payload = {
        owner_id: user.id,
        model_id: typeof modelId === 'string' && modelId ? modelId : null,
        scope_key: resolvedScope,
        source: AUTOSAVE_SOURCE,
        snapshot_data: modelData,
        thumbnail_data: _sanitizeThumbnail(thumbnailDataUrl),
        element_count: Array.isArray(modelData.elements) ? modelData.elements.length : 0,
        campaign_count: Array.isArray(modelData.campaigns) ? modelData.campaigns.length : 0,
    };
    const { data, error } = await client
        .from('model_state_snapshots')
        .insert(payload)
        .select('id, created_at, model_id, scope_key, element_count, campaign_count')
        .single();
    if (error) {
        throw new Error(`Erro ao salvar snapshot automático: ${error.message}`);
    }
    _lastAutosaveFingerprint = fingerprint;
    const scopeHint = _recordAutosaveScopeInsert(resolvedScope);
    if (scopeHint > AUTOSAVE_MAX_STATES + AUTOSAVE_PRUNE_BUFFER) {
        await _pruneAutosaveSnapshots(client, user.id, resolvedScope, AUTOSAVE_MAX_STATES);
    }
    _touchActiveLaneNonBlocking(client, user.id);
    return data;
}
/**
 * List autosave snapshots for the current user and scope.
 * Lista snapshots de autosave do usuário atual por escopo.
 *
 * @param {Object} [params]
 * @param {string|null} [params.modelId]
 * @param {string|null} [params.scopeKey]
 * @param {number} [params.limit=5]
 * @param {boolean} [params.includeThumbnail=false]
 * @returns {Promise<Array<any>>}
 */
export async function listAutosaveSnapshots({ modelId = null, scopeKey = null, limit = AUTOSAVE_MAX_STATES, includeThumbnail = false, } = /** @type {any} */ ({})) {
    const client = ensureClient();
    const user = ensureUser();
    const resolvedScope = _resolveAutosaveScope({
        modelId: /** @type {any} */ (modelId),
        scopeKey: /** @type {any} */ (scopeKey),
    });
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(1, limit), 20) : AUTOSAVE_MAX_STATES;
    const { data, error } = await client
        .from('model_state_snapshots')
        .select(_buildAutosaveSnapshotListSelect(includeThumbnail))
        .eq('owner_id', user.id)
        .eq('scope_key', resolvedScope)
        .order('created_at', { ascending: false })
        .limit(safeLimit);
    if (Array.isArray(data) && data.length < safeLimit) {
        _autosaveScopeCountHints.set(resolvedScope, data.length);
    }
    if (error)
        throw new Error(`Erro ao listar snapshots automáticos: ${error.message}`);
    return data || [];
}
/**
 * Load one autosave snapshot by id (owned by current user).
 * Carrega um snapshot de autosave por id (do usuário atual).
 *
 * @param {string} snapshotId
 * @returns {Promise<Object>}
 */
export async function loadAutosaveSnapshot(snapshotId: any) {
    const client = ensureClient();
    const user = ensureUser();
    const { data, error } = await client
        .from('model_state_snapshots')
        .select('id, model_id, scope_key, source, snapshot_data, created_at')
        .eq('owner_id', user.id)
        .eq('id', snapshotId)
        .maybeSingle(); // 406-safe: snapshot pode ter sido deletado (error/!data tratado abaixo)
    if (error || !data)
        throw new Error(`Erro ao carregar snapshot automático: ${error?.message || 'snapshot nao encontrado'}`);
    return data;
}
// ----------------------------------------------------------------
// SHARING
// ----------------------------------------------------------------
/**
 * Share model with another user by email.
 * Compartilha modelo com outro usuario via email.
 *
 * @param {string} modelId - UUID do modelo
 * @param {string} email - Email do destinatario
 * @param {string} [permission='viewer'] - Permissao: 'viewer' ou 'editor'
 * @returns {Promise<Object>} - Registro de compartilhamento (com share_code)
 */
export async function shareModel(modelId: any, email: any, permission = 'viewer') {
    const client = ensureClient();
    const user = ensureUser();
    const shareCode = generateShareCode();
    const { data, error } = await client
        .from('model_shares')
        .insert({
        model_id: modelId,
        shared_by: user.id,
        shared_with_email: email.toLowerCase().trim(),
        permission,
        share_code: shareCode,
    })
        .select('id, share_code, shared_with_email, permission')
        .single();
    if (error)
        throw new Error(`Erro ao compartilhar: ${error.message}`);
    return data;
}
/**
 * List models shared with current user.
 * Lista modelos compartilhados com o usuario atual.
 *
 * @returns {Promise<Array<any>>} - Lista de modelos compartilhados
 */
export async function getSharedModels() {
    const client = ensureClient();
    const user = ensureUser();
    const { data, error } = await client
        .from('model_shares')
        .select(`
            id, permission, share_code, created_at,
            models:model_id (id, name, description, element_count, campaign_count, professional_validation, created_at, updated_at)
        `)
        .eq('shared_with_email', user.email);
    if (error)
        throw new Error(`Erro ao listar compartilhados: ${error.message}`);
    return data || [];
}
/**
 * Load model by share code.
 * Carrega modelo pelo codigo curto de compartilhamento.
 *
 * @param {string} code - Codigo de 6 caracteres
 * @returns {Promise<Object>} - Objeto modelo completo
 */
export async function loadModelByShareCode(code: any) {
    const client = ensureClient();
    ensureUser();
    const { data: share, error: shareError } = await client
        .from('model_shares')
        .select('model_id')
        .eq('share_code', code.toUpperCase().trim())
        .maybeSingle(); // 406-safe: share code invalido/expirado retorna null (shareError/!share tratado abaixo)
    if (shareError || !share)
        throw new Error('Codigo de compartilhamento invalido.');
    return loadModelFromCloud(share.model_id);
}
/**
 * List active shares for a model.
 * Lista compartilhamentos ativos de um modelo.
 *
 * @param {string} modelId - UUID do modelo
 * @returns {Promise<Array<any>>} - Lista de shares
 */
export async function getModelShares(modelId: any) {
    const client = ensureClient();
    ensureUser();
    const { data, error } = await client
        .from('model_shares')
        .select('id, shared_with_email, permission, share_code, created_at')
        .eq('model_id', modelId)
        .order('created_at', { ascending: false });
    if (error)
        throw new Error(`Erro ao listar shares: ${error.message}`);
    return data || [];
}
/**
 * Revoke a share.
 * Revoga um compartilhamento.
 *
 * @param {string} shareId - UUID do share
 */
export async function revokeShare(shareId: any) {
    const client = ensureClient();
    ensureUser();
    const { error } = await client.from('model_shares').delete().eq('id', shareId);
    if (error)
        throw new Error(`Erro ao revogar share: ${error.message}`);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Generate a random 6-character share code.
 * Gera codigo de compartilhamento de 6 caracteres.
 *
 * @returns {string} - Codigo alfanumerico maiusculo
 */
function generateShareCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I/O/0/1 para evitar ambiguidade
    let code = '';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 6; i++) {
        code += chars[(arr[i] as number) % chars.length];
    }
    return code;
}
function ensureClient() {
    const client = /** @type {any} */ (getSupabaseClient());
    if (!client)
        throw new Error('Supabase nao inicializado.');
    return client;
}
function apiSchemaClient(client: any) {
    return client && typeof client.schema === 'function' ? client.schema('api') : client;
}
function ensureUser() {
    const user = /** @type {any} */ (getCurrentUser());
    if (!user)
        throw new Error('Usuario nao autenticado.');
    return user;
}
function _buildAutosaveSnapshotListSelect(includeThumbnail = false) {
    const baseSelect = 'id, model_id, scope_key, source, element_count, campaign_count, created_at';
    return includeThumbnail ? `${baseSelect}, thumbnail_data` : baseSelect;
}
function _syncLaneTouchCache(lanes: any) {
    const next = new Map();
    for (const lane of Array.isArray(lanes) ? lanes : []) {
        if (!lane?.id)
            continue;
        const parsed = Date.parse(lane.last_used_at || '');
        next.set(lane.id, Number.isFinite(parsed) ? parsed : 0);
    }
    _laneTouchCache = next;
    for (const laneId of Array.from(_laneTouchInFlight)) {
        if (!next.has(laneId)) {
            _laneTouchInFlight.delete(laneId);
        }
    }
}
function _isMissingRpcError(err: any, fnName: any) {
    const msg = String(err?.message || '').toLowerCase();
    if (!msg || !fnName)
        return false;
    const fn = String(fnName).toLowerCase();
    return (msg.includes(`could not find the function public.${fn}`) ||
        msg.includes(`could not find the function api.${fn}`) ||
        msg.includes(`could not find the function ${fn}`) ||
        (msg.includes(`function public.${fn}`) && msg.includes('does not exist')) ||
        (msg.includes(`function api.${fn}`) && msg.includes('does not exist')) ||
        (msg.includes(`function ${fn}`) && msg.includes('does not exist')));
}
function _recordAutosaveScopeInsert(scopeKey: any) {
    if (!scopeKey)
        return AUTOSAVE_MAX_STATES + AUTOSAVE_PRUNE_BUFFER + 1;
    const current = _autosaveScopeCountHints.get(scopeKey);
    const nextCount = Number.isFinite(current)
        ? /** @type {number} */ (current) + 1
        : AUTOSAVE_MAX_STATES + AUTOSAVE_PRUNE_BUFFER + 1;
    _autosaveScopeCountHints.set(scopeKey, nextCount);
    return nextCount;
}
function _touchActiveLaneNonBlocking(client: any, userId: any) {
    if (!_activeLaneId || !client || !userId)
        return;
    const laneId = _activeLaneId;
    if (_laneTouchInFlight.has(laneId))
        return;
    const now = Date.now();
    const lastTouchedAt = _laneTouchCache.get(laneId) || 0;
    if (now - lastTouchedAt < AUTOSAVE_LANE_TOUCH_MIN_INTERVAL_MS)
        return;
    const previousTouchTs = lastTouchedAt;
    _laneTouchCache.set(laneId, now);
    _laneTouchInFlight.add(laneId);
    const nextIso = new Date(now).toISOString();
    client
        .from('user_autosave_lanes')
        .update({ last_used_at: nextIso })
        .eq('id', laneId)
        .eq('owner_id', userId)
        .then(() => {
        if (_lanesCache) {
            const lane = /** @type {any[]} */ (_lanesCache).find((entry: any) => entry.id === laneId);
            if (lane)
                lane.last_used_at = nextIso;
        }
    })
        .catch((_e: any) => {
        if (previousTouchTs > 0)
            _laneTouchCache.set(laneId, previousTouchTs);
        else
            _laneTouchCache.delete(laneId);
        console.debug('[utils/cloud/manager:silent-catch]', _e?.message || _e);
    })
        .finally(() => {
        _laneTouchInFlight.delete(laneId);
    });
}
function _resolveAutosaveScope({ modelId = null, scopeKey = null }: any = {}) {
    // Raia ativa tem precedência sobre lógica legada
    if (_activeLaneId && _lanesCache) {
        const lane = _lanesCache.find((l: any) => l.id === _activeLaneId);
        if (lane)
            return lane.scope_key;
    }
    // Fallbacks legado
    if (typeof scopeKey === 'string' && scopeKey.trim()) {
        return scopeKey.trim().slice(0, 120);
    }
    if (typeof modelId === 'string' && modelId) {
        return `cloud:${modelId}`;
    }
    return 'local:session';
}
function _sanitizeThumbnail(value: any) {
    if (typeof value !== 'string' || value.length < 20)
        return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('data:image/'))
        return null;
    return trimmed.slice(0, 180000);
}
function _buildAutosaveFingerprint(modelData: any, scopeKey: any) {
    const elements = Array.isArray(modelData.elements) ? modelData.elements.length : 0;
    const campaigns = Array.isArray(modelData.campaigns) ? modelData.campaigns.length : 0;
    const issues = Array.isArray(modelData.issues) ? modelData.issues.length : 0;
    const payload = `${scopeKey}|${elements}|${campaigns}|${issues}|${JSON.stringify(modelData).length}`;
    return payload;
}
async function _pruneAutosaveSnapshots(
client: any, userId: any, 
scopeKey: any, maxStates: any) {
    try {
        const { error: rpcError } = await apiSchemaClient(client).rpc(AUTOSAVE_PRUNE_RPC, {
            p_scope_key: scopeKey,
            p_keep: maxStates,
        });
        if (!rpcError) {
            _autosaveScopeCountHints.set(scopeKey, maxStates);
            return;
        }
        if (!_isMissingRpcError(rpcError, AUTOSAVE_PRUNE_RPC)) {
            console.warn('[AutosaveSnapshots] prune rpc failed, using fallback:', rpcError?.message);
        }
        const { data, error } = await client
            .from('model_state_snapshots')
            .select('id')
            .eq('owner_id', userId)
            .eq('scope_key', scopeKey)
            .order('created_at', { ascending: false })
            .range(maxStates, maxStates + AUTOSAVE_PRUNE_FALLBACK_DELETE_LIMIT - 1);
        if (error || !Array.isArray(data) || data.length === 0)
            return;
        const toDelete = data.map((row: any) => row.id).filter(Boolean);
        if (!toDelete.length)
            return;
        await client.from('model_state_snapshots').delete().eq('owner_id', userId).in('id', toDelete);
        _autosaveScopeCountHints.set(scopeKey, maxStates);
    } catch (e: any) {
        console.debug('[cloud] autosave-prune-fallback:', 
        /** @type {any} */ (e)?.message || e); /* original non-blocking prune */
    }
}
async function _deleteAutosaveLaneServerSide(client: any, laneId: any) {
    try {
        const { error } = await apiSchemaClient(client).rpc(AUTOSAVE_DELETE_LANE_RPC, {
            p_lane_id: laneId,
        });
        if (!error)
            return true;
        if (!_isMissingRpcError(error, AUTOSAVE_DELETE_LANE_RPC)) {
            console.warn('[AutosaveLanes] delete rpc failed, using fallback:', error?.message);
        }
        return false;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=manager.js.map
