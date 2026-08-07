// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   RADAR MANAGER — Broadcasting de modelos para stakeholders
   Controla ativacao/desativacao de broadcasts, discovery e estado

   Cada broadcast profile ativo = 1 radar_slot (metering).
   Free: heartbeat obrigatorio (60s). Pro+: persistente.
   ================================================================ */

import { getSupabaseClient, getCurrentUser, getAccessToken } from '../../utils/auth/session.js';
import { startHeartbeat, stopHeartbeat, stopAllHeartbeats } from './heartbeat.js';
// Fix 2026-04-11: previously used require('../metering/quota.js') which is
// Node CommonJS and throws ReferenceError in browser ES modules. The silent
// catch hid this, leaving radar slot quota checking completely broken (always
// returned the free tier default limit=1). Use static ES import instead.
import { checkQuota as _meteringCheckQuota } from '../metering/quota.js';
import { shouldConsumeRadarSlot, profileFromDbRow } from './_invertedMonetizationPure.js';
import { CONFIG } from '../../config.js';

// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------

/** @returns {any} */
function _ensureClient() {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase nao inicializado.');
    return client;
}

/** @returns {any} */
function _ensureUser() {
    const user = getCurrentUser();
    if (!user) throw new Error('Usuario nao autenticado.');
    return user;
}

/**
 * Determina se o tier do usuario tem broadcasts persistentes.
 * Tiers pro, scale, enterprise nao precisam de heartbeat.
 * @returns {boolean}
 */
function _isPersistentTier() {
    const user = getCurrentUser();
    if (!user) return false;
    const tier = user.tier || 'free';
    return tier !== 'free';
}

/**
 * Gera um share code unico de 8 caracteres (base32, sem ambiguos).
 * Mesmo padrao de model_shares (evita I/O/0/1).
 * @returns {string}
 */
function _generateShareCode() {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 8; i++) {
        code += chars[arr[i]! % chars.length];
    }
    return code;
}

/**
 * Retorna a URL publica de um broadcast ativo.
 * @param {string} shareCode
 * @returns {string}
 */
export function getBroadcastUrl(shareCode: any) {
    if (!shareCode) return '';
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://ecbyts.com';
    return `${base}/broadcast?id=${shareCode}`;
}

// ----------------------------------------------------------------
// CACHE - estado local de broadcasts ativos
// ----------------------------------------------------------------

/** @type {Map<string, Object>} radarId -> entry */
/** @type {Map<string, any>} */
const _cache = new Map();

/** @type {number|null} discovery polling interval */
let _discoveryInterval: any = null;

// ----------------------------------------------------------------
// ACTIVATE / DEACTIVATE
// ----------------------------------------------------------------

/**
 * Ativa um broadcast no radar.
 * Consome 1 radar_slot via checkAndConsume (hard gate).
 *
 * @param {string} modelId - UUID do modelo
 * @param {string} profileId - UUID do broadcast profile
 * @returns {Promise<Object>} - Entrada criada em model_radar
 */
export async function activateRadar(modelId: any, profileId: any) {
    const client = _ensureClient();
    const user = _ensureUser();
    const isPersistent = _isPersistentTier();

    // RADAR-INVERTED-MONET F2b: ler profile ANTES do gate para classificar
    // openness (Calvin verbatim: "100% gratuidade para liberação de 100% e
    // pago apenas se limitar o recorte de publicação"). Comportamento legacy
    // preservado quando flag OFF (default).
    const { data: profile, error: profileErr } = await client
        .from('radar_broadcast_profiles')
        .select('visibility, allowed_emails, visible_families, visible_sections, name')
        .eq('id', profileId)
        .maybeSingle(); // 406-safe: profile pode ter sido deletado (profileErr/!profile tratado abaixo)

    if (profileErr || !profile) {
        throw new Error('Broadcast profile nao encontrado.');
    }

    // Decide consumo de quota via pure-logic helper (testável isoladamente).
    const flagEnabled = !!(CONFIG as any)?.FEATURES?.RADAR_INVERTED_MONETIZATION;
    const profileLike = profileFromDbRow(profile);
    // activateRadar não recebe slice (broadcast direto sobre profile complete).
    // Quando flag ON + profile complete → bypass gate (publicação aberta gratuita).
    const consumeQuota = shouldConsumeRadarSlot(profileLike, null, flagEnabled);

    if (consumeQuota) {
        // Hard gate - bloqueia se quota excedida
        try {
            const { checkAndConsume } = await import('../metering/quota.js' as string);
            const quota = await checkAndConsume('radar_slots', 1);
            if (!quota.allowed) {
                throw new Error('quota_exceeded:radar_slots');
            }
        } catch (e: any) {
            if (e?.message === 'quota_exceeded:radar_slots') throw e;
            // Graceful degradation: se metering indisponivel, prosseguir
        }
    }
    // else: publicação aberta gratuita — bypass de checkAndConsume (RF2).

    // Gerar share_code unico (8 chars, base32 sem ambiguos)
    const shareCode = _generateShareCode();

    // Inserir ou reativar
    const { data, error } = await client
        .from('model_radar')
        .upsert(
            {
                model_id: modelId,
                owner_id: user.id,
                profile_id: profileId,
                visibility: profile.visibility,
                allowed_emails: profile.allowed_emails || [],
                is_persistent: isPersistent,
                share_code: shareCode,
                last_heartbeat: new Date().toISOString(),
                activated_at: new Date().toISOString(),
                deactivated_at: null,
            },
            {
                onConflict: 'model_id,profile_id',
            },
        )
        .select(
            'id, model_id, profile_id, visibility, share_code, activated_at, last_heartbeat, is_persistent, owner_id',
        )
        .single();

    if (error) throw new Error(`Erro ao ativar radar: ${error.message}`);

    _cache.set(data.id, data);

    // Free tier: iniciar heartbeat
    if (!isPersistent) {
        startHeartbeat(modelId, client, user.id, getAccessToken);
    }

    return data;
}

/**
 * Desativa um broadcast especifico.
 *
 * @param {string} modelId - UUID do modelo
 * @param {string} profileId - UUID do broadcast profile
 * @returns {Promise<void>}
 */
export async function deactivateRadar(modelId: any, profileId: any) {
    const client = _ensureClient();
    const user = _ensureUser();

    const { error } = await client
        .from('model_radar')
        .update({ deactivated_at: new Date().toISOString() })
        .eq('model_id', modelId)
        .eq('profile_id', profileId)
        .eq('owner_id', user.id)
        .is('deactivated_at', null);

    if (error) throw new Error(`Erro ao desativar radar: ${error.message}`);

    // Remover do cache
    for (const [id, entry] of _cache) {
        if (entry.model_id === modelId && entry.profile_id === profileId) {
            _cache.delete(id);
            break;
        }
    }

    // Se nao houver mais broadcasts ativos para este modelo, parar heartbeat
    const hasActive = [..._cache.values()].some((e: any) => e.model_id === modelId);
    if (!hasActive) {
        stopHeartbeat(modelId);
    }
}

// ----------------------------------------------------------------
// QUERY - listagens
// ----------------------------------------------------------------

/**
 * Lista broadcasts ativos do usuario autenticado.
 * Retorna dados do model_radar JOIN com modelo e profile.
 *
 * @returns {Promise<Object[]>}
 */
export async function getMyRadarEntries() {
    const client = _ensureClient();
    const user = _ensureUser();

    const { data, error } = await client
        .from('model_radar')
        .select(
            `
            id, model_id, profile_id, visibility, is_persistent,
            share_code, last_heartbeat, activated_at,
            models!inner(name, description, element_count, campaign_count),
            radar_broadcast_profiles(name, visible_families, visible_sections)
        `,
        )
        .eq('owner_id', user.id)
        .is('deactivated_at', null)
        .order('activated_at', { ascending: false });

    if (error) throw new Error(`Erro ao listar broadcasts: ${error.message}`);

    // Atualizar cache
    _cache.clear();
    for (const entry of data || []) {
        _cache.set(entry.id, entry);
    }

    return data || [];
}

/**
 * Descobre modelos publicos/privados ativos no radar.
 * Usa a view radar_active (herda RLS).
 *
 * @param {string} [search?] - Filtro de busca por nome/descricao
 * @returns {Promise<Object[]>}
 */
export async function discoverRadarModels(search?: any) {
    const client = _ensureClient();
    _ensureUser();

    // OPT-1: explicit columns matching radar_active view definition (supabase-schema.sql)
    let query = client
        .from('radar_active')
        .select(
            'radar_id, model_id, owner_id, visibility, profile_id, share_code, activated_at, last_heartbeat, model_name, model_description, element_count, campaign_count, owner_name, profile_name, visible_families, visible_sections, hidden_fields',
        )
        .order('activated_at', { ascending: false })
        .limit(50);

    if (search && search.trim()) {
        const term = `%${search.trim()}%`;
        query = query.or(`model_name.ilike.${term},model_description.ilike.${term},owner_name.ilike.${term}`);
    }

    const { data, error } = await query;

    if (error) throw new Error(`Erro na descoberta: ${error.message}`);
    return data || [];
}

/**
 * Descobre modelos no radar próximos a um ponto geográfico — 2026-05-14.
 * Calvin: "avaliar se existe algum digital twin por perto (...) para capturar
 * dados pré-existentes do local".
 *
 * Pré-filtra via bbox (rápido server-side), filtro fino com Haversine no client.
 * Anota cada model com `distanceKm` ascendente.
 *
 * @param {{lat:number,lon:number}} center
 * @param {number} center
 * @param {string} [radiusKm]
 * @returns {Promise<Array<Object & {distanceKm: number}>>}
 */
export async function discoverRadarModelsNearby(center: any, radiusKm: any, search: any) {
    if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon)) {
        throw new TypeError('discoverRadarModelsNearby: center {lat,lon} required');
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
        throw new TypeError('discoverRadarModelsNearby: radiusKm must be > 0');
    }

    const { radiusToBbox, haversineDistanceKm } = await import('./globalDiscovery.js' as string);
    const bbox = radiusToBbox(center, radiusKm);

    const all = await discoverRadarModels(search);

    const filtered = [];
    for (const m of all || []) {
        const model = /** @type {Object & {center_lat?: unknown, centerLat?: unknown, center_lon?: unknown, centerLon?: unknown}} */ (m);
        const lat = Number(model.center_lat ?? model.centerLat ?? null);
        const lon = Number(model.center_lon ?? model.centerLon ?? null);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (bbox && (lat < bbox.minLat || lat > bbox.maxLat || lon < bbox.minLon || lon > bbox.maxLon)) {
            continue;
        }
        const distanceKm = haversineDistanceKm(center, { lat, lon });
        if (!Number.isFinite(distanceKm) || distanceKm > radiusKm) continue;
        filtered.push({ ...model, distanceKm });
    }
    filtered.sort((a: any, b: any) => a.distanceKm - b.distanceKm);
    return filtered;
}

/**
 * Retorna contagem de slots ativos vs. limite do tier.
 * Usa cache local - nao faz network call.
 *
 * @returns {{ active: number, limit: number }}
 */
export function getRadarSlotCount() {
    let limit = 1; // default free
    try {
        const q = _meteringCheckQuota('radar_slots');
        if (q && typeof q.limit === 'number') {
            limit = q.limit === -1 ? Infinity : q.limit;
        }
    } catch (e: any) {
        console.debug('[radar-manager] metering-check:', e?.message || e);
        // Metering indisponivel - usar default
    }

    return {
        active: _cache.size,
        limit,
    };
}

// ----------------------------------------------------------------
// DISCOVERY POLLING
// ----------------------------------------------------------------

/**
 * Inicia polling de discovery a cada 30s.
 * Chama callback com resultados atualizados.
 *
 * @param {Function} onUpdate - Callback com array de modelos descobertos
 * @returns {Function} stop - Funcao para parar o polling
 */
export function startDiscoveryPolling(onUpdate: any) {
    if (_discoveryInterval) clearInterval(_discoveryInterval);

    const poll = async () => {
        try {
            const results = await discoverRadarModels();
            onUpdate(results);
        } catch (e: any) {
            console.debug('[radar-manager] poll-cycle:', e?.message || e);
            // Falha silenciosa - retry no proximo ciclo
        }
    };

    poll(); // Primeira execucao imediata
    _discoveryInterval = setInterval(poll, 30000);

    return () => {
        if (_discoveryInterval) {
            clearInterval(_discoveryInterval);
            _discoveryInterval = null;
        }
    };
}

// ----------------------------------------------------------------
// PUBLIC BROADCAST ACCESS - acesso por share_code (sem auth)
// ----------------------------------------------------------------

/**
 * Carrega um broadcast pelo share_code (URL publica).
 * Nao requer autenticacao para broadcasts publicos.
 * Retorna modelo filtrado + metadata.
 *
 * @param {string} shareCode - Codigo de 8 caracteres
 * @returns {Promise<{ radar: Object, model: Object, profile: Object, filteredModel: Object }>}
 */
export async function loadBroadcastByCode(shareCode: any) {
    const client = _ensureClient();

    // 1. Buscar radar entry por share_code
    const { data: radar, error: radarErr } = await client
        .from('model_radar')
        .select(
            `
            id, model_id, profile_id, visibility, share_code,
            activated_at, last_heartbeat, is_persistent,
            owner_id
        `,
        )
        .eq('share_code', shareCode)
        .is('deactivated_at', null)
        .maybeSingle(); // 406-safe: share code invalido/expirado/desativado retorna null (radarErr/!radar tratado abaixo)

    if (radarErr || !radar) {
        throw new Error('Broadcast nao encontrado ou expirado.');
    }

    // Verificar heartbeat para free tier
    if (!radar.is_persistent) {
        const age = Date.now() - new Date(radar.last_heartbeat).getTime();
        if (age > 120000) {
            throw new Error('Broadcast expirado (offline).');
        }
    }

    // 2. Buscar profile de visibilidade
    let profile = null;
    if (radar.profile_id) {
        // OPT-1: filterModelData() consumes visible_families/sections + hidden_fields
        const { data: bp } = await client
            .from('radar_broadcast_profiles')
            .select('id, name, visibility, allowed_emails, visible_families, visible_sections, hidden_fields')
            .eq('id', radar.profile_id)
            .maybeSingle(); // 406-safe: profile may have been deleted (null tolerated below)
        profile = bp;
    }

    // 3. Buscar modelo
    const { data: model, error: modelErr } = await client
        .from('models')
        .select('id, name, description, model_data, element_count, campaign_count')
        .eq('id', radar.model_id)
        .maybeSingle(); // 406-safe: model pode ter sido deletado (modelErr/!model tratado abaixo)

    if (modelErr || !model) {
        throw new Error('Modelo nao encontrado.');
    }

    // 4. Buscar owner name
    const { data: owner } = await client.from('profiles').select('display_name').eq('id', radar.owner_id).maybeSingle(); // 406-safe: owner may not have profile row

    // 5. Aplicar filtro do profile
    let filteredModel = model.model_data;
    if (profile) {
        const { filterModelData } = await import('./broadcastProfile.js' as string);
        filteredModel = filterModelData(model.model_data, profile);
    }

    return {
        radar,
        model: {
            id: model.id,
            name: model.name,
            description: model.description,
            elementCount: model.element_count,
            campaignCount: model.campaign_count,
            ownerName: owner?.display_name || 'Unknown',
        },
        profile,
        filteredModel,
    };
}

// ----------------------------------------------------------------
// CLEANUP
// ----------------------------------------------------------------

/**
 * Limpa estado do radar (logout, troca de usuario).
 * Para todos os heartbeats e limpa cache.
 */
export function clearRadarState() {
    stopAllHeartbeats();
    _cache.clear();
    if (_discoveryInterval) {
        clearInterval(_discoveryInterval);
        _discoveryInterval = null;
    }
}
