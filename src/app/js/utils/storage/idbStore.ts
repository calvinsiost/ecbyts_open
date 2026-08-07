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

/**
 * idbStore.js - Wrapper assíncrono sobre IndexedDB
 *
 * API simétrica ao safeSetItem/localStorage.getItem para facilitar migração
 * dos módulos pesados (interpolation, voxel, nn) que excedem o quota do localStorage.
 *
 * IndexedDB: sem limite fixo (~50%+ do disco), suportado em todos os browsers modernos.
 * Nunca lança - retorna false em qualquer erro para não interromper o fluxo do caller.
 */

const DB_NAME = 'ecbyts-db';
const DB_VERSION = 1;
const IDB_EVENT_LIMIT = 80;
const IDB_KEY_LIMIT = 120;
// Para adicionar stores em versões futuras:
// req.onupgradeneeded: if (e.oldVersion < 2) { db.createObjectStore('nova-store'); }

let _dbPromise: any = null;

type IdbPerfEvent = {
    op: string;
    key: string;
    startTime: number;
    duration: number;
    success: boolean;
    error: string;
};

type IdbPerfWindow = Window & {
    __ecbytsIdbEvents?: IdbPerfEvent[];
    __ecbytsWebVitalsFieldMonitor?: unknown;
};

function getIdbWindow(): IdbPerfWindow | null {
    if (typeof window === 'undefined') return null;
    return window as IdbPerfWindow;
}

function idbPerfNow(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}

export function shouldRecordIdbEvent(): boolean {
    const currentWindow = getIdbWindow();
    if (!currentWindow) return false;
    try {
        return Boolean(
            currentWindow.__ecbytsWebVitalsFieldMonitor || localStorage.getItem('ecbyts-perf-debug') === 'true',
        );
    } catch {
        return Boolean(currentWindow.__ecbytsWebVitalsFieldMonitor);
    }
}

export function recordIdbEvent(
    op: string,
    key: string,
    startTime: number,
    success: boolean,
    error: string = '',
): void {
    if (!shouldRecordIdbEvent()) return;
    const currentWindow = getIdbWindow();
    if (!currentWindow) return;
    const events = Array.isArray(currentWindow.__ecbytsIdbEvents) ? currentWindow.__ecbytsIdbEvents : [];
    events.push({
        op: String(op || 'unknown'),
        key: String(key || '').slice(0, IDB_KEY_LIMIT),
        startTime: Math.round(Number(startTime || 0)),
        duration: Math.round(Math.max(0, idbPerfNow() - Number(startTime || 0))),
        success,
        error: error ? String(error).slice(0, 120) : '',
    });
    events.sort((a, b) => b.duration - a.duration);
    currentWindow.__ecbytsIdbEvents = events.slice(0, IDB_EVENT_LIMIT);
}

/**
 * Abre (ou reutiliza) a conexão com o IndexedDB.
 * Usa promise singleton para evitar race condition quando múltiplos módulos
 * chamam _openDB() em paralelo antes da primeira conexão resolver.
 * Em erro, reseta _dbPromise = null para permitir nova tentativa.
 */
function _openDB(): Promise<IDBDatabase> {
    if (!_dbPromise) {
        _dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = (e: any) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('keyval')) {
                    db.createObjectStore('keyval');
                }
            };
            req.onsuccess = (e: any) => resolve(e.target.result);
            req.onerror = (e: any) => {
                _dbPromise = null;
                reject(e.target.error);
            };
        });
    }
    return _dbPromise;
}

/**
 * Helper interno: abre DB, executa fn(db), reseta _dbPromise em qualquer erro.
 * Centraliza o reset - evita duplicar em cada export.
 * Retorna false em qualquer falha (InvalidStateError por GC, quota, etc.).
 * @param fn - recebe IDBDatabase, deve retornar Promise<any>
 */
async function _withDB(fn: Function): Promise<any> {
    try {
        const db = await _openDB();
        return await fn(db);
    } catch (e) {
        _dbPromise = null; // permite reabrir na próxima tentativa
        console.error('[IDB] operação falhou:', e);
        return false;
    }
}

/**
 * Persiste value no IndexedDB sob a key.
 * Aceita qualquer valor structured-cloneable (objetos, arrays, strings,
 * ArrayBuffer, Blob). NÃO aceita funções, símbolos ou referências circulares.
 * Resolve em tx.oncomplete - garante que o dado foi realmente commitado.
 * Retorna Promise<boolean> - nunca lança.
 */
export function idbSet(key: string, value: any): Promise<boolean> {
    const startTime = idbPerfNow();
    let recorded = false;
    return _withDB(
        (db: any) =>
            new Promise((resolve) => {
                const tx = db.transaction('keyval', 'readwrite');
                const req = tx.objectStore('keyval').put(value, key);
                // Resolver em oncomplete (não em req.onsuccess) garante commit real.
                // req.onsuccess dispara antes do commit - se tx abortar depois, seria falso positivo.
                tx.oncomplete = () => {
                    recorded = true;
                    recordIdbEvent('set', key, startTime, true);
                    resolve(true);
                };
                tx.onabort = () => {
                    console.error('[IDB] transação abortada para key:', key, tx.error);
                    recorded = true;
                    recordIdbEvent('set', key, startTime, false, tx.error?.message || 'transaction-aborted');
                    resolve(false);
                };
                req.onerror = () => {
                    // tx.onabort vai disparar automaticamente - não precisa de resolve aqui
                    console.error('[IDB] erro no request para key:', key, req.error);
                };
            }),
    ).then((result) => {
        if (!recorded) recordIdbEvent('set', key, startTime, result === true, result === true ? '' : 'open-failed');
        return result;
    });
}

/**
 * Lê value do IndexedDB para a key.
 * Retorna o value armazenado (objeto, array, string, etc.) ou null se não existir.
 * Nunca lança - retorna null em qualquer erro.
 */
export function idbGet(key: string): Promise<any | null> {
    const startTime = idbPerfNow();
    let recorded = false;
    return _withDB(
        (db: any) =>
            new Promise((resolve) => {
                const tx = db.transaction('keyval', 'readonly');
                const req = tx.objectStore('keyval').get(key);
                req.onsuccess = () => {
                    recorded = true;
                    recordIdbEvent('get', key, startTime, true);
                    resolve(req.result ?? null);
                };
                req.onerror = () => {
                    console.error('[IDB] erro ao ler key:', key, req.error);
                    recorded = true;
                    recordIdbEvent('get', key, startTime, false, req.error?.message || 'request-error');
                    resolve(null);
                };
                tx.onabort = () => {
                    console.error('[IDB] transação de leitura abortada para key:', key, tx.error);
                    if (!recorded) recordIdbEvent('get', key, startTime, false, tx.error?.message || 'transaction-aborted');
                    recorded = true;
                    resolve(null);
                };
            }),
    ).then((result) => {
        if (!recorded) recordIdbEvent('get', key, startTime, result !== false, result === false ? 'open-failed' : '');
        return result;
    });
}

/**
 * Remove a key do IndexedDB.
 * Retorna Promise<boolean> - true em sucesso ou se a key não existia.
 */
export function idbDelete(key: string): Promise<boolean> {
    const startTime = idbPerfNow();
    let recorded = false;
    return _withDB(
        (db: any) =>
            new Promise((resolve) => {
                const tx = db.transaction('keyval', 'readwrite');
                tx.objectStore('keyval').delete(key);
                tx.oncomplete = () => {
                    recorded = true;
                    recordIdbEvent('delete', key, startTime, true);
                    resolve(true);
                };
                tx.onabort = () => {
                    console.error('[IDB] falha ao deletar key:', key, tx.error);
                    recorded = true;
                    recordIdbEvent('delete', key, startTime, false, tx.error?.message || 'transaction-aborted');
                    resolve(false);
                };
            }),
    ).then((result) => {
        if (!recorded) {
            recordIdbEvent('delete', key, startTime, result === true, result === true ? '' : 'open-failed');
        }
        return result;
    });
}

/**
 * Limpa TODOS os registros do store 'keyval'.
 * Reservado para clearWorkspace() - limpeza total explícita.
 * NÃO usar em clearModelData() para evitar apagar Category B/A futura.
 * Retorna Promise<boolean>.
 */
export function idbClear(): Promise<boolean> {
    const startTime = idbPerfNow();
    let recorded = false;
    return _withDB(
        (db: any) =>
            new Promise((resolve) => {
                const tx = db.transaction('keyval', 'readwrite');
                tx.objectStore('keyval').clear();
                tx.oncomplete = () => {
                    recorded = true;
                    recordIdbEvent('clear', '*', startTime, true);
                    resolve(true);
                };
                tx.onabort = () => {
                    console.error('[IDB] falha ao limpar store:', tx.error);
                    recorded = true;
                    recordIdbEvent('clear', '*', startTime, false, tx.error?.message || 'transaction-aborted');
                    resolve(false);
                };
            }),
    ).then((result) => {
        if (!recorded) recordIdbEvent('clear', '*', startTime, result === true, result === true ? '' : 'open-failed');
        return result;
    });
}

/**
 * Lê value do IDB. Se null, tenta migrar dados legados do localStorage.
 *
 * Lógica de migração one-shot (executa apenas uma vez por key):
 *   1. idbGet(key) → se existir, retorna diretamente
 *   2. localStorage.getItem(key) → se existir, parseia e salva no IDB
 *   3. Se idbSet OK → remove do localStorage (migração completa)
 *   4. Se idbSet falhou → mantém no localStorage (dado não se perde)
 *   5. Se parse falhou → remove do localStorage de qualquer forma (dado corrompido)
 *
 * parseLegacy padrão é JSON.parse. Override para tipos custom que não usam JSON.
 */
export async function idbGetWithLegacy(key: string, parseLegacy: Function = JSON.parse): Promise<any | null> {
    // Tenta IDB primeiro
    let value = await idbGet(key);
    if (value != null) return value;

    // Tenta migrar do localStorage
    const raw = localStorage.getItem(key) || '';
    if (!raw) return null;

    try {
        value = parseLegacy(raw);
        const saved = await idbSet(key, value);
        // Remove do LS APENAS se o IDB confirmou o save (tx.oncomplete)
        // Se idbSet retornou false (quota IDB, IDB indisponível), mantém no LS
        if (saved) {
            localStorage.removeItem(key);
        } else {
            console.warn('[IDB] migração parcial: dado mantido no localStorage para key:', key);
        }
    } catch {
        // Parse falhou - dado no LS está corrompido; remove para não travar futuras tentativas
        value = null;
        localStorage.removeItem(key);
    }

    return value;
}

/**
 * Retorna um namespace escopado por modelo para IDB.
 *
 * Uso (Multi-Model Tabs, SPEC_MULTI_MODEL_TABS, ADR A6):
 *   const scope = modelScope('abc-uuid');
 *   await scope.set('elements', [...]);   // grava em 'model:abc-uuid:elements'
 *   await scope.get('campaigns');          // lê de 'model:abc-uuid:campaigns'
 *   await scope.delete('audit-trail');
 *
 * Suffix NÃO deve começar com 'ecbyts-' - o prefix 'model:{id}:' substitui
 * o namespace global. O caller traduz chaves legadas (`ecbyts-elements`) para
 * suffix puro (`elements`) antes de chamar.
 *
 * @param modelId - UUID do modelo
 */
export function modelScope(modelId: string): {
    get: Function;
    set: Function;
    delete: Function;
    key: Function;
} {
    if (!modelId || typeof modelId !== 'string') {
        throw new Error('modelScope: modelId obrigatório');
    }
    const buildKey = (suffix: any) => {
        if (!suffix || typeof suffix !== 'string') {
            throw new Error('modelScope: suffix obrigatório');
        }
        return `model:${modelId}:${suffix}`;
    };
    return {
        key: buildKey,
        get: (suffix: any) => idbGet(buildKey(suffix as any)),
        set: (suffix: any, value: any) => idbSet(buildKey(suffix as any), value as any),
        delete: (suffix: any) => idbDelete(buildKey(suffix as any)),
    };
}
