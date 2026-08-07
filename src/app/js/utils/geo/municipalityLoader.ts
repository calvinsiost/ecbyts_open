// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MUNICIPALITY LOADER — Lazy load de municípios/cidades
   
   Carrega dados de municípios sob demanda, por estado.
   Prioridade:
   1. Cache em memória
   2. Supabase (se disponível e online)
   3. IndexedDB (cache local)
   4. JSON estático (fallback)
   ================================================================ */

// eslint-disable-next-line
import { getCountryByCode } from './countries.js';

// Cache em IndexedDB
const DB_NAME = 'ecbyts-municipalities';
const DB_VERSION = 1;
const STORE_NAME = 'municipalities';

/** @type {any} */
let db: any = null;
/** @type {any} */
let supabaseClient: any = null;

// Cache em memória
const memoryCache = new Map();

/**
 * Inicializa IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
async function initDB() {
    if (db) return db;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event: any) => {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

/**
 * Obtém cliente Supabase (lazy load)
 * @returns {Promise<any|null>}
 */
async function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    try {
        // Importa dinamicamente para evitar dependência circular
        const { getSupabaseClient: getClient } = await import('../auth/session.js');
        supabaseClient = getClient();
        return supabaseClient;
    } catch (error: any) {
        console.debug('[MunicipalityLoader] Supabase not available:', error?.message || error);
        return null;
    }
}

/**
 * Busca municípios do Supabase (RPC)
 * @param {string} countryCode
 * @param {string} stateCode
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<any[]|null>}
 */
async function searchFromSupabase(countryCode: any, stateCode: any, query: any, limit = 10) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    try {
        // Usa a função RPC search_municipalities
        const { data, error } = await sb.rpc('search_municipalities', {
            p_country: countryCode.toUpperCase(),
            p_state: stateCode.toUpperCase(),
            p_query: query.trim(),
            p_limit: limit,
        });

        if (error) {
            // Se a função não existir, fallback para query direta
            if (error.message?.includes('function') || error.code === 'PGRST202') {
                return await searchFromSupabaseDirect(countryCode, stateCode, query, limit);
            }
            console.warn('[MunicipalityLoader] Supabase search error:', error);
            return null;
        }

        return data?.map((/** @type {any} */ m: any) => ({
            nome: m.city_name,
            codigo_ibge: m.ibge_code,
            populacao: m.population,
            source: 'supabase'
        })) || null;
    } catch (error) {
        console.warn('[MunicipalityLoader] Supabase error:', error);
        return null;
    }
}

/**
 * Busca municípios do Supabase (query direta - fallback)
 * @param {string} countryCode
 * @param {string} stateCode
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<any[]|null>}
 */
async function searchFromSupabaseDirect(countryCode: any, stateCode: any, query: any, limit = 10) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    try {
        const normalizedQuery = query
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        const { data, error } = await sb
            .from('municipalities')
            .select('city_name, ibge_code, population')
            .eq('country_code', countryCode.toUpperCase())
            .eq('state_code', stateCode.toUpperCase())
            .ilike('city_name_normalized', `${normalizedQuery}%`)
            .order('population', { ascending: false, nullsLast: true })
            .limit(limit);

        if (error) {
            console.warn('[MunicipalityLoader] Supabase direct query error:', error);
            return null;
        }

        return data?.map((/** @type {any} */ m: any) => ({
            nome: m.city_name,
            codigo_ibge: m.ibge_code,
            populacao: m.population,
            source: 'supabase'
        })) || null;
    } catch (error) {
        console.warn('[MunicipalityLoader] Supabase direct error:', error);
        return null;
    }
}

/**
 * Busca todos os municípios de um estado (para cache local)
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Promise<any[]|null>}
 */
async function fetchAllFromSupabase(countryCode: any, stateCode: any) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    try {
        const { data, error } = await sb
            .from('municipalities')
            .select('city_name, ibge_code, population')
            .eq('country_code', countryCode.toUpperCase())
            .eq('state_code', stateCode.toUpperCase())
            .order('city_name');

        if (error) {
            console.warn('[MunicipalityLoader] Supabase fetch all error:', error);
            return null;
        }

        return data?.map((/** @type {any} */ m: any) => ({
            nome: m.city_name,
            codigo_ibge: m.ibge_code,
            populacao: m.population,
            source: 'supabase'
        })) || null;
    } catch (error) {
        console.warn('[MunicipalityLoader] Supabase fetch all error:', error);
        return null;
    }
}

/**
 * Busca municípios do cache em memória
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {any[]|null}
 */
function getFromMemory(countryCode: any, stateCode: any) {
    const key = `${countryCode}-${stateCode}`.toUpperCase();
    return memoryCache.get(key) || null;
}

/**
 * Salva municípios no cache em memória
 * @param {string} countryCode
 * @param {string} stateCode
 * @param {any[]} data
 */
function saveToMemory(countryCode: any, stateCode: any, data: any) {
    const key = `${countryCode}-${stateCode}`.toUpperCase();
    memoryCache.set(key, data);

    // Limita tamanho do cache (LRU simples)
    if (memoryCache.size > 10) {
        const firstKey = memoryCache.keys().next().value;
        memoryCache.delete(firstKey);
    }
}

/**
 * Busca municípios do cache IndexedDB
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Promise<any[]|null>}
 */
async function getFromCache(countryCode: any, stateCode: any) {
    try {
        const database = await initDB();
        const key = `${countryCode}-${stateCode}`.toUpperCase();

        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                if (!result) {
                    resolve(null);
                    return;
                }

                // Verifica TTL (30 dias)
                const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
                if (Date.now() - result.timestamp > THIRTY_DAYS) {
                    resolve(null); // Expirado
                    return;
                }

                resolve(result.data);
            };

            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('[MunicipalityLoader] IndexedDB cache error:', error);
        return null;
    }
}

/**
 * Salva municípios no cache IndexedDB
 * @param {string} countryCode
 * @param {string} stateCode
 * @param {any[]} data
 */
async function saveToCache(countryCode: any, stateCode: any, data: any) {
    try {
        const database = await initDB();
        const key = `${countryCode}-${stateCode}`.toUpperCase();

        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);

            const request = store.put({
                key,
                data,
                timestamp: Date.now(),
            });

            request.onsuccess = () => resolve(undefined);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('[MunicipalityLoader] IndexedDB save error:', error);
    }
}

/**
 * Fetch municípios do servidor (JSON estático)
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Promise<any[]>}
 */
async function fetchMunicipalities(countryCode: any, stateCode: any) {
    const url = `/data/municipalities/${countryCode}/${stateCode}.json`;

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Carrega todos os municípios de um estado (hierarquia de caches)
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Promise<any[]>}
 */
export async function loadMunicipalities(countryCode: any, stateCode: any) {
    // Normaliza códigos
    countryCode = countryCode.toUpperCase();
    stateCode = stateCode.toUpperCase();

    // 1. Cache em memória
    const memory = getFromMemory(countryCode, stateCode);
    if (memory) return memory;

    // 2. Supabase (se disponível)
    const supabaseData = await fetchAllFromSupabase(countryCode, stateCode);
    if (supabaseData) {
        saveToMemory(countryCode, stateCode, supabaseData);
        saveToCache(countryCode, stateCode, supabaseData);
        return supabaseData;
    }

    // 3. IndexedDB cache
    const cached = await getFromCache(countryCode, stateCode);
    if (cached) {
        saveToMemory(countryCode, stateCode, cached);
        return cached;
    }

    // 4. JSON estático (fallback)
    try {
        const data = await fetchMunicipalities(countryCode, stateCode);

        // Salva em todos os caches
        saveToMemory(countryCode, stateCode, data);
        saveToCache(countryCode, stateCode, data);

        return data;
    } catch (error) {
        console.error('[MunicipalityLoader] Error loading municipalities:', error);
        return [];
    }
}

/**
 * Busca municípios com autocomplete (usa Supabase se disponível)
 * @param {string} countryCode
 * @param {string} stateCode
 * @param {string} query - Termo de busca
 * @param {number} limit - Máximo de resultados
 * @returns {Promise<any[]>}
 */
export async function searchMunicipalities(countryCode: any, stateCode: any, query: any, limit = 10) {
    if (!query || query.length < 2) {
        return [];
    }

    // Normaliza códigos
    countryCode = countryCode.toUpperCase();
    stateCode = stateCode.toUpperCase();

    // 1. Tenta Supabase primeiro (busca full-text)
    const supabaseResults = await searchFromSupabase(countryCode, stateCode, query, limit);
    if (supabaseResults) {
        return supabaseResults;
    }

    // 2. Fallback: busca local nos dados carregados
    const municipalities = await loadMunicipalities(countryCode, stateCode);
    return searchLocally(municipalities, query, limit);
}

/**
 * Busca local (quando Supabase indisponível)
 * @param {any[]} municipalities - Lista completa
 * @param {string} query - Termo de busca
 * @param {number} limit - Máximo de resultados
 * @returns {any[]}
 */
function searchLocally(municipalities: any, query: any, limit = 10) {
    // Normaliza query (remove acentos, lowercase)
    const normalizedQuery = normalizeString(query);

    // Filtra e ordena por relevância
    const results = municipalities
        .map((m: any) => ({
        ...m,
        _score: scoreMatch(m.nome || m.city_name, normalizedQuery)
    }))
        .filter((m: any) => m._score > 0)
        .sort((a: any, b: any) => b._score - a._score)
        .slice(0, limit);

    // Remove score interno
    return results.map(({
        _score,
        ...m
    }: any) => m);
}

/**
 * Normaliza string (remove acentos, lowercase)
 * @param {string} str
 * @returns {string}
 */
function normalizeString(str: any) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Calcula score de match
 * @param {string} name - Nome do município
 * @param {string} query - Query normalizada
 * @returns {number}
 */
function scoreMatch(name: any, query: any) {
    if (!name) return 0;
    const normalizedName = normalizeString(name);

    // Match exato no início
    if (normalizedName.startsWith(query)) {
        return 100;
    }

    // Match no início da palavra
    if (normalizedName.includes(' ' + query)) {
        return 80;
    }

    // Match em qualquer lugar
    if (normalizedName.includes(query)) {
        return 50;
    }

    // Match parcial (caracteres em sequência)
    let queryIndex = 0;
    for (const char of normalizedName) {
        if (char === query[queryIndex]) {
            queryIndex++;
            if (queryIndex === query.length) {
                return 30;
            }
        }
    }

    return 0;
}

/**
 * Limpa todo o cache de municípios
 */
export async function clearCache() {
    try {
        const database = await initDB();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();

            request.onsuccess = () => resolve(undefined);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.warn('[MunicipalityLoader] Clear cache error:', error);
    }
}

/**
 * Verifica se há dados em cache para um estado
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Promise<boolean>}
 */
export async function hasCache(countryCode: any, stateCode: any) {
    const cached = await getFromCache(countryCode, stateCode);
    return cached !== null;
}

/**
 * Sincroniza dados locais com Supabase (upload em batch)
 * @param {string} countryCode
 * @param {string} stateCode
 * @returns {Promise<boolean>}
 */
export async function syncToSupabase(countryCode: any, stateCode: any) {
    const sb = await getSupabaseClient();
    if (!sb) {
        console.warn('[MunicipalityLoader] Supabase not available for sync');
        return false;
    }

    try {
        const municipalities = await loadMunicipalities(countryCode, stateCode);
        if (!municipalities.length) return false;

        // Prepara dados para upsert
        const records = municipalities.map((m: any) => ({
            country_code: countryCode.toUpperCase(),
            state_code: stateCode.toUpperCase(),
            city_name: m.nome || m.city_name,
            city_name_normalized: normalizeString(m.nome || m.city_name),
            ibge_code: m.codigo_ibge || m.ibge_code,
            population: m.populacao || m.population || null
        }));

        // Upsert em batch
        const { error } = await sb.from('municipalities').upsert(records, {
            onConflict: 'country_code,state_code,city_name',
            ignoreDuplicates: false,
        });

        if (error) {
            console.error('[MunicipalityLoader] Sync error:', error);
            return false;
        }

        console.debug(`[MunicipalityLoader] Synced ${records.length} municipalities to Supabase`);
        return true;
    } catch (error) {
        console.error('[MunicipalityLoader] Sync error:', error);
        return false;
    }
}
