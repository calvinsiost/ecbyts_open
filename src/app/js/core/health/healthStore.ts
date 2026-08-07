// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 Phase 4 — Health Store (IDB persistence facade)
   Referência: SPEC_HEALTH_ENVIRONMENTAL_MONITORING §S4

   Facade pública sobre idbAdapter.js com a API canônica da spec:
     saveWorker, loadWorkers, saveReading, loadReadings, clearHealthData

   Estratégia de persistência:
   - Workers: lista completa salva atomicamente em 'ecbyts-health-workers'
   - Readings: lista completa salva atomicamente em 'ecbyts-health-readings'
   - Upsert manual: carrega, adiciona/substitui, salva de volta

   Trade-off: granularidade baixa (write amplification) vs simplicidade
   (sem cursor IDB, sem índices secundários, sem migrações). Suficiente
   para n < 10.000 registros de saúde por projeto.

   Lógica pura — sem DOM direto. Importável em Node com backend mockado.
   ================================================================ */

import {
    saveReadingsToIDB,
    loadReadingsFromIDB,
    saveWorkersToIDB,
    loadWorkersFromIDB,
    setIdbBackend,
} from './idbAdapter.js';

export { setIdbBackend }; // re-exporta para testes que precisam mockar

const LOG_PREFIX = '[ecbyts:health:store]';

// ----------------------------------------------------------------
// Workers API
// ----------------------------------------------------------------

/**
 * Persiste um worker no IDB (upsert por id).
 * Carrega lista atual, insere ou substitui o worker com o mesmo id, salva de volta.
 *
 * @param worker - objeto worker (deve ter campo `id`)
 * @returns true se salvo com sucesso
 */
export async function saveWorker(worker: { id: string; [k: string]: unknown }): Promise<boolean> {
    if (!worker || typeof worker !== 'object' || !worker.id) {
        console.warn(LOG_PREFIX, 'saveWorker: worker inválido (sem id)', worker);
        return false;
    }
    try {
        const existing = (await loadWorkersFromIDB()) as Array<{ id: string; [k: string]: unknown }>;
        const idx = existing.findIndex((w) => w.id === worker.id);
        const updated =
            idx >= 0
                ? [...existing.slice(0, idx), { ...worker }, ...existing.slice(idx + 1)]
                : [...existing, { ...worker }];
        return await saveWorkersToIDB(updated);
    } catch (err) {
        console.warn(LOG_PREFIX, 'saveWorker failed:', err);
        return false;
    }
}

/**
 * Carrega todos os workers do IDB.
 * Retorna array vazio se IDB não disponível ou chave ausente.
 */
export async function loadWorkers(): Promise<object[]> {
    try {
        return await loadWorkersFromIDB();
    } catch (err) {
        console.warn(LOG_PREFIX, 'loadWorkers failed:', err);
        return [];
    }
}

// ----------------------------------------------------------------
// Readings API
// ----------------------------------------------------------------

/**
 * Persiste uma leitura de biomarcador no IDB (upsert por id).
 *
 * @param reading - objeto reading (deve ter campo `id`)
 * @returns true se salvo com sucesso
 */
export async function saveReading(reading: {
    id: string;
    workerPseudonym?: string;
    [k: string]: unknown;
}): Promise<boolean> {
    if (!reading || typeof reading !== 'object' || !reading.id) {
        console.warn(LOG_PREFIX, 'saveReading: reading inválido (sem id)', reading);
        return false;
    }
    try {
        const existing = (await loadReadingsFromIDB()) as Array<{
            id: string;
            workerPseudonym?: string;
            [k: string]: unknown;
        }>;
        const idx = existing.findIndex((r) => r.id === reading.id);
        const updated =
            idx >= 0
                ? [...existing.slice(0, idx), { ...reading }, ...existing.slice(idx + 1)]
                : [...existing, { ...reading }];
        return await saveReadingsToIDB(updated);
    } catch (err) {
        console.warn(LOG_PREFIX, 'saveReading failed:', err);
        return false;
    }
}

/**
 * Carrega leituras do IDB, com filtro opcional por workerPseudoId.
 *
 * @param workerPseudoId - filtra por workerPseudonym se fornecido
 */
export async function loadReadings(workerPseudoId: string | null = null): Promise<object[]> {
    try {
        const all = (await loadReadingsFromIDB()) as Array<{
            id: string;
            workerPseudonym?: string;
            [k: string]: unknown;
        }>;
        if (!workerPseudoId) return all;
        return all.filter((r) => r.workerPseudonym === workerPseudoId);
    } catch (err) {
        console.warn(LOG_PREFIX, 'loadReadings failed:', err);
        return [];
    }
}

/**
 * Remove todos os dados de saúde do IDB (workers + readings).
 * Usar para LGPD erasure request ou reset de projeto.
 *
 * @returns true se ambas as chaves foram limpas
 */
export async function clearHealthData(): Promise<boolean> {
    try {
        const [wOk, rOk] = await Promise.all([saveWorkersToIDB([]), saveReadingsToIDB([])]);
        return wOk !== false && rOk !== false;
    } catch (err) {
        console.warn(LOG_PREFIX, 'clearHealthData failed:', err);
        return false;
    }
}
