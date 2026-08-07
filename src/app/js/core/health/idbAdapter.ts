// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   HEALTH-MON-001 Phase 4 — IDB Persistence Adapter
   Persiste leituras de biomarcadores e registro de trabalhadores
   no IndexedDB usando idbGet/idbSet de utils/storage/idbStore.js.

   Lógica pura — sem DOM direto. idbGet/idbSet são injetáveis para
   testabilidade (padrão de módulo testável sem browser).

   IDB keys:
     ecbyts-health-readings  — array de leituras de biomarcadores
     ecbyts-health-workers   — array de trabalhadores registrados

   Coberto por tests/health-idb-csv-export.test.mjs.
   ================================================================ */

export const IDB_KEY_READINGS: string = 'ecbyts-health-readings';

export const IDB_KEY_WORKERS: string = 'ecbyts-health-workers';

// ----------------------------------------------------------------
// Dependency injection para idbGet/idbSet
// ----------------------------------------------------------------

/**
 * Adapter interno que expõe idbGet/idbSet como singletons substituíveis.
 * Em produção: resolve para utils/storage/idbStore.js via import dinâmico.
 * Em testes: substituído via setIdbBackend() antes das chamadas.
 */
let _idbGet: ((key: string) => Promise<any>) | null = null;
let _idbSet: ((key: string, value: any) => Promise<boolean>) | null = null;

/**
 * Injeta implementações alternativas de idbGet/idbSet para testes.
 * Chamar com null para resetar ao comportamento padrão (import dinâmico).
 */
export function setIdbBackend(
    backend: {
        idbGet: (key: string) => Promise<any>;
        idbSet: (key: string, value: any) => Promise<boolean>;
    } | null,
): void {
    if (backend === null || backend === undefined) {
        _idbGet = null;
        _idbSet = null;
        return;
    }
    if (typeof backend.idbGet !== 'function' || typeof backend.idbSet !== 'function') {
        throw new TypeError('setIdbBackend: backend must have idbGet and idbSet functions');
    }
    _idbGet = backend.idbGet;
    _idbSet = backend.idbSet;
}

const _IDB_STORE_PATH = '../../utils/storage/idbStore.js';

/**
 * Resolve idbGet - usa injected ou importa dinamicamente.
 * Importação indireta via variável evita inclusão estática do módulo
 * compartilhado (`utils/storage/idbStore.js`) na verificação TS deste arquivo.
 */
async function _resolveGet(): Promise<(key: string) => Promise<any>> {
    if (_idbGet) return _idbGet;
    const mod = (await import(/* @vite-ignore */ _IDB_STORE_PATH)) as {
        idbGet: (key: string) => Promise<any>;
    };
    return mod.idbGet;
}

/**
 * Resolve idbSet - usa injected ou importa dinamicamente.
 * Importação indireta via variável evita inclusão estática do módulo
 * compartilhado (`utils/storage/idbStore.js`) na verificação TS deste arquivo.
 */
async function _resolveSet(): Promise<(key: string, value: any) => Promise<boolean>> {
    if (_idbSet) return _idbSet;
    const mod = (await import(/* @vite-ignore */ _IDB_STORE_PATH)) as {
        idbSet: (key: string, value: any) => Promise<boolean>;
    };
    return mod.idbSet;
}

// ----------------------------------------------------------------
// Readings API
// ----------------------------------------------------------------

/**
 * Salva array de leituras de biomarcadores no IDB.
 * Sobrescreve completamente o valor existente na chave.
 *
 * @param readings - array de ReadingObjects (de createBiomarkerReading)
 * @returns true se sucesso, false se falha
 */
export async function saveReadingsToIDB(readings: Array<Record<string, any>>): Promise<boolean> {
    if (!Array.isArray(readings)) {
        return false;
    }
    try {
        const set = await _resolveSet();
        // Serializar para plain objects (leituras podem ser Object.freeze)
        const payload = readings.map((r) => ({ ...r }));
        return await set(IDB_KEY_READINGS, payload);
    } catch (err) {
        console.error('[health/idbAdapter] saveReadingsToIDB failed:', err);
        return false;
    }
}

/**
 * Carrega leituras de biomarcadores do IDB.
 *
 * @returns array de leituras (vazio se não encontrado)
 */
export async function loadReadingsFromIDB(): Promise<Array<Record<string, any>>> {
    try {
        const get = await _resolveGet();
        const data = await get(IDB_KEY_READINGS);
        if (!Array.isArray(data)) return [];
        return data;
    } catch (err) {
        console.error('[health/idbAdapter] loadReadingsFromIDB failed:', err);
        return [];
    }
}

/**
 * Remove todas as leituras de biomarcadores do IDB.
 *
 * @returns true se sucesso
 */
export async function clearReadingsFromIDB(): Promise<boolean> {
    try {
        const set = await _resolveSet();
        return await set(IDB_KEY_READINGS, []);
    } catch (err) {
        console.error('[health/idbAdapter] clearReadingsFromIDB failed:', err);
        return false;
    }
}

// ----------------------------------------------------------------
// Workers API
// ----------------------------------------------------------------

/**
 * Salva array de trabalhadores no IDB.
 * Sobrescreve completamente o valor existente na chave.
 *
 * @param workers - array de WorkerRecord objects
 * @returns true se sucesso, false se falha
 */
export async function saveWorkersToIDB(workers: Array<Record<string, any>>): Promise<boolean> {
    if (!Array.isArray(workers)) {
        return false;
    }
    try {
        const set = await _resolveSet();
        const payload = workers.map((w) => ({ ...w }));
        return await set(IDB_KEY_WORKERS, payload);
    } catch (err) {
        console.error('[health/idbAdapter] saveWorkersToIDB failed:', err);
        return false;
    }
}

/**
 * Carrega trabalhadores do IDB.
 *
 * @returns array de workers (vazio se não encontrado)
 */
export async function loadWorkersFromIDB(): Promise<Array<Record<string, any>>> {
    try {
        const get = await _resolveGet();
        const data = await get(IDB_KEY_WORKERS);
        if (!Array.isArray(data)) return [];
        return data;
    } catch (err) {
        console.error('[health/idbAdapter] loadWorkersFromIDB failed:', err);
        return [];
    }
}
