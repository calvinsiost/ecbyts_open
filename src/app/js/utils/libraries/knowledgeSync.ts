// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   KNOWLEDGE SYNC — Supabase knowledge_assets synchronization
   Sincronizacao da base de conhecimento com Supabase

   Busca assets do repositorio centralizado (knowledge_assets),
   compara com cache local (IndexedDB) e atualiza diferencas.
   Funciona offline com fallback para cache IDB.
   ================================================================ */
import { idbSet, idbGet } from '../storage/idbStore.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { createLogger } from '../helpers/logger.js';
import { getSupabaseClient } from '../auth/session.js';
const log = createLogger('KnowledgeSync');
// ----------------------------------------------------------------
// CONSTANTS
// Chaves de armazenamento e configuracao
// ----------------------------------------------------------------
const IDB_KEY = 'ecbyts-knowledge-assets';
const META_KEY = 'ecbyts-knowledge-sync-meta';
/** Tempo minimo entre syncs automaticos (5 min) */
const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
/** Maximo de assets por pagina na query Supabase */
const PAGE_SIZE = 1000;
/**
 * Colunas explicitas do knowledge_assets - substitui select('*') (OPT-1).
 * Mantemos `category` (legacy) e `asset_category` (atual) ate sweep do schema.
 * Tags vem de tabela auxiliar; aqui carregamos apenas campos do registro principal.
 */
const KNOWLEDGE_ASSET_COLUMNS = [
    'id',
    'slug',
    'name',
    'description',
    'category',
    'asset_category',
    'data_format',
    'source_url',
    'source_name',
    'license',
    'attribution',
    'version',
    'storage_backend',
    'storage_ref',
    'bbox_west',
    'bbox_south',
    'bbox_east',
    'bbox_north',
    'region_tags',
    'feature_count',
    'size_bytes',
    'source_updated_at',
    'last_synced_at',
    'staleness_days',
    'refresh_policy',
    'metadata',
    'tags',
    'tag_list',
    'is_active',
    'created_at',
    'updated_at',
].join(',');
// ----------------------------------------------------------------
// MODULE STATE
// Estado interno do modulo - closure privada
// ----------------------------------------------------------------
/** @type {Array<KnowledgeAsset>|null} Cache em memoria dos assets carregados */
let _memoryCache: any = null;
/** @type {string|null} ISO timestamp do ultimo sync bem-sucedido */
let _lastSyncAt: any = null;
/** @type {boolean} Guard contra sync concorrente */
let _syncing = false;
// ----------------------------------------------------------------
// INITIALIZATION
// Carrega metadados do ultimo sync
// ----------------------------------------------------------------
/**
 * Initialize knowledge sync module.
 * Carrega metadados do ultimo sync do localStorage.
 */
export function initKnowledgeSync() {
    try {
        const meta = localStorage.getItem(META_KEY) || '';
        if (meta) {
            const parsed = JSON.parse(meta);
            _lastSyncAt = parsed.lastSyncAt || null;
        }
    }
    catch (e: any) {
        log.warn('Failed to load sync metadata', e?.message || e);
    }
}
// ----------------------------------------------------------------
// CORE API
// Funcoes principais de sincronizacao e consulta
// ----------------------------------------------------------------
/**
 * Sync knowledge base from Supabase.
 * Busca assets remotos, compara com cache local, atualiza diferencas.
 * Se Supabase offline, retorna cache local sem erro.
 *
 * @param {SyncOptions} [options]
 * @returns {Promise<SyncResult>}
 */
export async function syncKnowledgeBase(options: any = {}) {
    const { force = false } = options;
    // Guard: sync ja em andamento
    if (_syncing) {
        log.info('Sync already in progress, skipping');
        return { success: true, count: 0, source: 'skipped' };
    }
    // Guard: cooldown (evita requests excessivos)
    if (!force && _lastSyncAt) {
        const elapsed = Date.now() - new Date(_lastSyncAt).getTime();
        if (elapsed < SYNC_COOLDOWN_MS) {
            log.debug('Sync cooldown active, using cache');
            const cached = await getCachedAssets();
            return { success: true, count: cached.length, source: 'cache' };
        }
    }
    _syncing = true;
    try {
        const client = getSupabaseClient();
        if (!client) {
            log.warn('Supabase client not available, using offline cache');
            const cached = await getCachedAssets();
            return { success: true, count: cached.length, source: 'offline' };
        }
        // Fetch all active assets from Supabase
        const { data, error } = await client
            .from('knowledge_assets')
            .select(KNOWLEDGE_ASSET_COLUMNS)
            .eq('is_active', true)
            .order('updated_at', { ascending: false })
            .limit(PAGE_SIZE);
        if (error) {
            log.error('Supabase query failed', error.message);
            const cached = await getCachedAssets();
            return { success: false, count: cached.length, source: 'offline', error: error.message };
        }
        const assets = data || [];
        // Persist to IDB
        const stored = await idbSet(IDB_KEY, assets);
        if (!stored) {
            log.warn('Failed to persist assets to IDB');
        }
        // Update memory cache
        _memoryCache = assets;
        // Update sync metadata
        _lastSyncAt = new Date().toISOString();
        safeSetItem(META_KEY, JSON.stringify({ lastSyncAt: _lastSyncAt }));
        log.info(`Synced ${assets.length} knowledge assets`);
        return { success: true, count: assets.length, source: 'remote' };
    }
    catch (e: any) {
        log.error('Sync failed with exception', e?.message || e);
        const cached = await getCachedAssets();
        return { success: false, count: cached.length, source: 'offline', error: e?.message || String(e) };
    }
    finally {
        _syncing = false;
    }
}
/**
 * Query knowledge assets with optional filters.
 * Tenta buscar do Supabase; se offline, filtra cache local.
 *
 * @param {AssetFilters} [filters]
 * @returns {Promise<Array<KnowledgeAsset>>}
 */
export async function getKnowledgeAssets(filters: any = {}) {
    const { category, tag, search, limit = 100 } = filters;
    // Try remote first
    const client = getSupabaseClient();
    if (client) {
        try {
            let query = client
                .from('knowledge_assets')
                .select(KNOWLEDGE_ASSET_COLUMNS)
                .eq('is_active', true)
                .order('updated_at', { ascending: false })
                .limit(limit);
            if (category) {
                query = query.eq('category', category);
            }
            if (search) {
                query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
            }
            const { data, error } = await query;
            if (!error && data) {
                // Tag filtering requires join or post-filter
                // knowledge_asset_tags is a separate table, so post-filter from cache if tag provided
                if (tag) {
                    return _filterByTag(data, tag);
                }
                return data;
            }
            log.warn('Remote query failed, falling back to cache', error?.message);
        }
        catch (e: any) {
            log.warn('Remote query exception, falling back to cache', e?.message || e);
        }
    }
    // Fallback: filter cached assets locally
    const cached = await getCachedAssets();
    return filterAssets(cached, filters);
}
/**
 * Return locally cached assets from IndexedDB.
 * Retorna assets do cache IDB; se vazio, retorna array vazio.
 *
 * @returns {Promise<Array<KnowledgeAsset>>}
 */
export async function getCachedAssets() {
    // Memory cache (fastest)
    if (_memoryCache !== null) {
        return _memoryCache;
    }
    // IDB cache
    const stored = await idbGet(IDB_KEY);
    if (Array.isArray(stored) && stored.length > 0) {
        _memoryCache = stored;
        return stored;
    }
    return [];
}
/**
 * Force refresh: clear cache and re-fetch from Supabase.
 * Limpa cache local e forca nova busca.
 *
 * @returns {Promise<SyncResult>}
 */
export async function forceRefresh() {
    // Clear memory cache
    _memoryCache = null;
    // Clear IDB cache
    await idbSet(IDB_KEY, null);
    // Clear sync metadata
    _lastSyncAt = null;
    safeSetItem(META_KEY, '');
    log.info('Cache cleared, forcing re-sync');
    return syncKnowledgeBase({ force: true });
}
// ----------------------------------------------------------------
// LOCAL FILTERING
// Filtragem local para modo offline
// ----------------------------------------------------------------
/**
 * Filter assets array by criteria.
 * Filtra assets localmente - usado quando offline.
 *
 * @param {Array<KnowledgeAsset>} assets
 * @param {AssetFilters} filters
 * @returns {Array<KnowledgeAsset>}
 */
export function filterAssets(assets: any, filters: any = {}) {
    if (!Array.isArray(assets))
        return [];
    const { category, tag, search, limit = 100 } = filters;
    let result = assets;
    if (category) {
        result = result.filter((a: any) => a.category === category);
    }
    if (search) {
        const lower = search.toLowerCase();
        result = result.filter((a: any) => {
            const name = (a.name || '').toLowerCase();
            const desc = (a.description || '').toLowerCase();
            return name.includes(lower) || desc.includes(lower);
        });
    }
    if (tag) {
        result = _filterByTag(result, tag);
    }
    if (limit && result.length > limit) {
        result = result.slice(0, limit);
    }
    return result;
}
/**
 * Filter assets by tag.
 * Tags podem estar em asset.tags (array) ou asset.tag_list (string separada por virgula).
 *
 * @param {Array<KnowledgeAsset>} assets
 * @param {string} tag
 * @returns {Array<KnowledgeAsset>}
 */
function _filterByTag(assets: any, tag: any) {
    const lower = tag.toLowerCase();
    return assets.filter((a: any) => {
        // Check tags array
        if (Array.isArray(a.tags)) {
            return a.tags.some((t: any) => t.toLowerCase() === lower);
        }
        // Check tag_list string (comma-separated)
        if (typeof a.tag_list === 'string') {
            return a.tag_list
                .split(',')
                .map((t: any) => t.trim().toLowerCase())
                .includes(lower);
        }
        return false;
    });
}
// ----------------------------------------------------------------
// STATE QUERIES
// Consultas de estado do modulo
// ----------------------------------------------------------------
/**
 * Check if sync is currently in progress.
 * @returns {boolean}
 */
export function isSyncing() {
    return _syncing;
}
/**
 * Get last sync timestamp.
 * @returns {string|null} ISO timestamp or null if never synced
 */
export function getLastSyncAt() {
    return _lastSyncAt;
}
/**
 * Get sync cooldown remaining in milliseconds.
 * @returns {number} 0 if ready to sync, positive ms if cooling down
 */
export function getSyncCooldownRemaining() {
    if (!_lastSyncAt)
        return 0;
    const elapsed = Date.now() - new Date(_lastSyncAt).getTime();
    return Math.max(0, SYNC_COOLDOWN_MS - elapsed);
}
