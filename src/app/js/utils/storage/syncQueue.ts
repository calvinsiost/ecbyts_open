// @ts-check
// Generated from src/app/js/utils/storage/syncQueue.ts by TS-MIGRATION-001. Do not edit manually.
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
   SYNC QUEUE - Offline-first IDB -> Supabase
   ================================================================

   Fila persistente de operacoes pendentes para sincronizacao com Supabase.
   - Escrita local imediata (enqueue)
   - Flush assíncrono com retry e backoff exponencial
   - Sem throw no caminho feliz da aplicacao

   ================================================================ */
import { idbGetWithLegacy, idbSet } from './idbStore.js';
import { toFiniteNumber } from '../helpers/toFiniteNumber.js';
const STORAGE_KEY = 'ecbyts-sync-queue';
const MAX_RETRIES = 8;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 120000;
let _queue: any = [];
let _loaded = false;
let _flushing = false;
/** @type {any} */
let _clientProvider: any = null;
/** @type {any} */
let _storageAdapter: any = null;
// Circuit breaker: tabelas com ≥5 falhas 404 consecutivas ficam desabilitadas por sessão.
// Previne tempestade de erros quando tabela não existe no Supabase (ex: 'issues' sem migration).
const _tableFailCount = new Map(); // tableName → consecutive 404 count
const _disabledTables = new Set(); // tableName → disabled for session
const CIRCUIT_BREAKER_THRESHOLD = 5;
/**
 * Enfileira operacao para sincronizacao futura.
 * / Enqueue a pending sync operation.
 *
 * @param {string} table - Nome da tabela Supabase
 * @param {'upsert'|'insert'|'update'|'delete'} operation - Operacao
 * @param {any} payload - Payload enviado ao Supabase
 * @param {Object} [options] - Metadados opcionais
 * @param {Object} [options.match] - Filtro para update/delete (eq)
 * @param {string} [options.schema] - PostgREST schema profile, e.g. "api"
 * @returns {Promise<string>} ID do item enfileirado
 */
export async function enqueueSync( table: any, operation: any, payload: any, options: any = {}) {
    const schema = _normalizeSchema(options.schema);
    const tableKey = _tableKey(table, schema);
    if (_disabledTables.has(tableKey)) {
        console.debug('[syncQueue] circuit breaker: skip enqueue for disabled table', tableKey);
        return /** @type {any} */ (null);
    }
    await _ensureLoaded();
    const item = {
        id: _newQueueId(),
        table,
        schema,
        operation,
        payload,
        match: options.match || null,
        createdAt: new Date().toISOString(),
        attempts: 0,
        nextRetryAt: 0,
        lastError: null,
    };
    _queue.push(item);
    await _persistQueue();
    return item.id;
}
/**
 * Processa fila pendente contra Supabase.
 * / Flush pending queue against Supabase.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=50] - Maximo de itens por flush
 * @returns {Promise<{processed:number,succeeded:number,failed:number,remaining:number,reason?:string}>}
 */
export async function flushSyncQueue( options: any = {}) {
    await _ensureLoaded();
    if (_flushing) {
        return {
            processed: 0,
            succeeded: 0,
            failed: 0,
            remaining: _queue.length,
            reason: 'flush_in_progress',
        };
    }
    const ctx = await _resolveClientContext();
    if (!ctx?.client || !ctx?.user?.id) {
        return {
            processed: 0,
            succeeded: 0,
            failed: 0,
            remaining: _queue.length,
            reason: 'not_authenticated',
        };
    }
    const limit = toFiniteNumber(options.limit, 50, { min: 1 });
    const now = Date.now();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    _flushing = true;
    try {
        for (const item of [..._queue]) {
            if (processed >= limit) break;
            if (item.nextRetryAt && item.nextRetryAt > now) continue;
            processed++;
            const ok = await _applyQueueItem(ctx.client, item);
            if (ok) {
                succeeded++;
                _removeById(item.id);
                continue;
            }
            failed++;
            item.attempts = (item.attempts || 0) + 1;
            if (item.attempts >= MAX_RETRIES) {
                _removeById(item.id);
                continue;
            }
            const delay = Math.min(BASE_RETRY_MS * 2 ** (item.attempts - 1), MAX_RETRY_MS);
            item.nextRetryAt = Date.now() + delay;
        }
    } finally {
        _flushing = false;
        await _persistQueue();
    }
    return {
        processed,
        succeeded,
        failed,
        remaining: _queue.length,
    };
}
/**
 * Retorna snapshot da fila.
 * / Get queue snapshot.
 *
 * @returns {Promise<Array<any>>}
 */
export async function getSyncQueueItems() {
    await _ensureLoaded();
    return _queue.map((item: any) => ({ ...item }));
}
/**
 * Retorna quantidade de itens pendentes.
 * / Get pending queue size.
 *
 * @returns {Promise<number>}
 */
export async function getSyncQueueSize() {
    await _ensureLoaded();
    return _queue.length;
}
/**
 * Limpa toda a fila (uso administrativo/testes).
 * / Clear all queue items.
 *
 * @returns {Promise<void>}
 */
export async function clearSyncQueue() {
    _queue = [];
    _loaded = true;
    await _persistQueue();
}
/**
 * Injeta provider de client/session (uso em testes).
 * / Inject client/session provider for tests.
 *
 * @param {Function|null} provider - async () => ({ client, user })
 */
export function setSyncQueueClientProvider( provider: any) {
    _clientProvider = typeof provider === 'function' ? provider : null;
}
/**
 * Injeta adaptador de storage (uso em testes).
 * / Inject storage adapter for tests.
 *
 * @param {{load: Function, save: Function}|null} adapter
 */
export function setSyncQueueStorageAdapter( adapter: any) {
    _storageAdapter =
        adapter && typeof adapter.load === 'function' && typeof adapter.save === 'function' ? adapter : null;
}
/**
 * Reset interno para testes.
 * / Internal reset for tests.
 */
export function __resetSyncQueueForTests() {
    _queue = [];
    _loaded = false;
    _flushing = false;
    _clientProvider = null;
    _storageAdapter = null;
    _tableFailCount.clear();
    _disabledTables.clear();
}
/**
 * Returns tables currently disabled by the circuit breaker (session-scoped).
 * / Retorna tabelas desabilitadas pelo circuit breaker na sessão atual.
 * @returns {string[]}
 */
export function getDisabledSyncTables() {
    return [..._disabledTables];
}
async function _ensureLoaded() {
    if (_loaded) return;
    const raw = await _loadQueue();
    _queue = Array.isArray(raw) ? raw : [];
    _loaded = true;
}
async function _loadQueue() {
    if (_storageAdapter) {
        return _storageAdapter.load();
    }
    if (typeof indexedDB !== 'undefined') {
        return idbGetWithLegacy(STORAGE_KEY);
    }
    return [];
}
async function _persistQueue() {
    if (_storageAdapter) {
        await _storageAdapter.save(_queue.map((item: any) => ({ ...item })));
        return;
    }
    if (typeof indexedDB !== 'undefined') {
        await idbSet(STORAGE_KEY, _queue);
    }
}
async function _resolveClientContext() {
    if (_clientProvider) {
        return _clientProvider();
    }
    try {
        const session = await import('../auth/session.js' as string);
        return {
            client: session.getSupabaseClient?.(),
            user: session.getCurrentUser?.(),
        };
    } catch {
        return null;
    }
}
async function _applyQueueItem(client: any, item: any) {
    try {
        const dataClient = _clientForSchema(client, item.schema);
        let query = dataClient.from(item.table);
        if (item.operation === 'upsert') {
            const { error } = await query.upsert(item.payload);
            if (error) throw error;
            return true;
        }
        if (item.operation === 'insert') {
            const { error } = await query.insert(item.payload);
            if (error) throw error;
            return true;
        }
        if (item.operation === 'update') {
            query = query.update(item.payload);
            const filter = item.match || _fallbackMatch(item.payload);
            query = _applyMatch(query, filter);
            const { error } = await query;
            if (error) throw error;
            return true;
        }
        if (item.operation === 'delete') {
            query = query.delete();
            const filter = item.match || _fallbackMatch(item.payload);
            query = _applyMatch(query, filter);
            const { error } = await query;
            if (error) throw error;
            return true;
        }
        throw new Error(`Unsupported sync operation: ${item.operation}`);
    } catch (error: any) {
        item.lastError = String(/** @type {any} */ (error)?.message || error || 'unknown_error');
        // Circuit breaker: track consecutive 404/PGRST116 (table not found) per table
        const is404 =
            item.lastError.includes('404') ||
            item.lastError.includes('PGRST116') ||
            item.lastError.includes('relation') ||
            item.lastError.includes('does not exist');
        if (is404) {
            const tableKey = _tableKey(item.table, item.schema);
            const count = (_tableFailCount.get(tableKey) || 0) + 1;
            _tableFailCount.set(tableKey, count);
            if (count >= CIRCUIT_BREAKER_THRESHOLD && !_disabledTables.has(tableKey)) {
                _disabledTables.add(tableKey);
                _tableFailCount.delete(tableKey);
                console.warn(
                    `[syncQueue] circuit breaker: table "${tableKey}" disabled for this session after ${CIRCUIT_BREAKER_THRESHOLD} consecutive 404 responses. Sync will be suppressed until page reload.`,
                );
            }
        } else {
            _tableFailCount.delete(_tableKey(item.table, item.schema)); // reset on non-404 error
        }
        return false;
    }
}
function _normalizeSchema(value: any) {
    const normalized = String(value || '').trim();
    return /^[a-z][a-z0-9_]*$/i.test(normalized) ? normalized : null;
}
function _tableKey(table: any, schema: any) {
    const name = String(table || '').trim();
    return schema ? `${schema}.${name}` : name;
}
function _clientForSchema(client: any, schema: any) {
    if (schema && typeof client?.schema === 'function') {
        const scoped = client.schema(schema);
        if (scoped && typeof scoped.from === 'function') return scoped;
    }
    return client;
}
function _fallbackMatch(payload: any) {
    if (payload && typeof payload === 'object' && typeof payload.id === 'string') {
        return { id: payload.id };
    }
    return null;
}
function _applyMatch(query: any, match: any) {
    if (!match || typeof match !== 'object') {
        return query;
    }
    let next = query;
    for (const [key, value] of Object.entries(match)) {
        next = next.eq(key, value);
    }
    return next;
}
function _removeById(id: any) {
    const idx = _queue.findIndex((item: any) => item.id === id);
    if (idx >= 0) {
        _queue.splice(idx, 1);
    }
}
function _newQueueId() {
    const rnd = Math.random().toString(36).slice(2, 10);
    return `sync-${Date.now()}-${rnd}`;
}
