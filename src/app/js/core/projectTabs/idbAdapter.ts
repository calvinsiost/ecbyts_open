// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   PROJECT TABS — IDB Adapter (Phase 2)
   (SPEC_PROJECT_TABS_IMPLEMENTATION — persistence layer)

   Provides async IDB persistence for project tabs so that tab
   state survives page reloads (F5). Uses idbSet/idbGet from the
   project-standard idbStore wrapper — never touches indexedDB
   directly or localStorage.

   Key: 'ecbyts-project-tabs'
   Value schema: { version: 2, tabs: Tab[], activeTabId: string|null }

   Exported API:
   - saveTabsToIDB(snapshot)     → Promise<boolean>
   - loadTabsFromIDB()           → Promise<{version,tabs,activeTabId}|null>
   - pruneArchivedTabs(tabs, maxArchived?) → Tab[]
   ================================================================ */

import { idbSet, idbGet, idbDelete } from '../../utils/storage/idbStore.js';
import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

interface TabSnapshotPayload {
    version: number;
    tabs: object[];
    activeTabId: string | null;
}

interface TabRuntimeSnapshot {
    version: number;
    tabId: string;
    capturedAt: number;
    snapshot: object;
}

/** IDB key canônica para este módulo. */
export const IDB_KEY = 'ecbyts-project-tabs';

/** Prefixo para snapshots de hibernacao por aba. */
export const TAB_SNAPSHOT_KEY_PREFIX = 'ecbyts-project-tab-snapshot:';

/** Versão do schema armazenado — bump em breaking changes. */
const SCHEMA_VERSION = 2;

/**
 * Persiste snapshot das abas no IndexedDB.
 *
 * @param {{ tabs: object[], activeTabId: string|null }} snapshot
 *   Snapshot retornado por tabRegistry.snapshot() + activeTabId
 * @returns {Promise<boolean>} true se salvo com sucesso, false em erro
 */
export async function saveTabsToIDB(snapshot: { tabs: object[], activeTabId: string | null }): Promise<boolean> {
    if (!snapshot || !Array.isArray(snapshot.tabs)) return false;
    const payload: TabSnapshotPayload = {
        version: SCHEMA_VERSION,
        tabs: snapshot.tabs,
        activeTabId: snapshot.activeTabId ?? null,
    };
    return idbSet(IDB_KEY, payload);
}

/**
 * Carrega snapshot das abas do IndexedDB.
 * Retorna null se não houver dado ou se o schema for incompatível.
 *
 * @returns {Promise<{version: number, tabs: object[], activeTabId: string|null}|null>}
 */
export async function loadTabsFromIDB(): Promise<TabSnapshotPayload | null> {
    const raw = await idbGet(IDB_KEY);
    // idbGet retorna null quando a key não existe, false em erro de IDB
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as TabSnapshotPayload;
    if (data.version !== SCHEMA_VERSION) return null;
    if (!Array.isArray(data.tabs)) return null;
    return data;
}

/**
 * Retorna a chave IDB usada para o snapshot de runtime de uma aba.
 *
 * @param {string} tabId
 * @returns {string}
 */
export function getTabRuntimeSnapshotKey(tabId: string): string {
    if (!tabId || typeof tabId !== 'string') {
        throw new TypeError('getTabRuntimeSnapshotKey: tabId required');
    }
    return `${TAB_SNAPSHOT_KEY_PREFIX}${tabId}`;
}

/**
 * Persiste snapshot serializado do modelo para hibernacao/restauracao de aba.
 *
 * @param {string} tabId
 * @param {object} snapshot
 * @returns {Promise<boolean>}
 */
export async function saveTabRuntimeSnapshot(tabId: string, snapshot: object): Promise<boolean> {
    if (!tabId || typeof tabId !== 'string') return false;
    if (!snapshot || typeof snapshot !== 'object') return false;
    return idbSet(getTabRuntimeSnapshotKey(tabId), {
        version: 1,
        tabId,
        capturedAt: Date.now(),
        snapshot,
    } as TabRuntimeSnapshot);
}

/**
 * Carrega snapshot serializado de runtime para uma aba.
 *
 * @param {string} tabId
 * @returns {Promise<{version:number,tabId:string,capturedAt:number,snapshot:object}|null>}
 */
export async function loadTabRuntimeSnapshot(tabId: string): Promise<TabRuntimeSnapshot | null> {
    if (!tabId || typeof tabId !== 'string') return null;
    const raw = await idbGet(getTabRuntimeSnapshotKey(tabId));
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as TabRuntimeSnapshot;
    if (data.version !== 1 || data.tabId !== tabId) return null;
    if (!data.snapshot || typeof data.snapshot !== 'object') return null;
    return data;
}

/**
 * Remove snapshot de runtime de uma aba fechada.
 *
 * @param {string} tabId
 * @returns {Promise<boolean>}
 */
export async function deleteTabRuntimeSnapshot(tabId: string): Promise<boolean> {
    if (!tabId || typeof tabId !== 'string') return false;
    return idbDelete(getTabRuntimeSnapshotKey(tabId));
}

/** Máximo de dias que uma aba arquivada é retida antes de ser purgada. */
export const MAX_ARCHIVED_AGE_DAYS = 30;

/**
 * Remove abas arquivadas com mais de `maxAgeDays` dias desde o `archivedAt`.
 * Abas arquivadas sem `archivedAt` (dados legados) são mantidas para segurança.
 * Abas não arquivadas nunca são tocadas.
 *
 * Função pura - não modifica o array original.
 *
 * @param {any[]} tabs          Lista de tabs do snapshot
 * @param {number}   [maxAgeDays=30] Dias máximos de retenção de abas arquivadas
 * @returns {any[]} Nova lista filtrada
 */
export function pruneArchivedTabs(tabs: any[], maxAgeDays = MAX_ARCHIVED_AGE_DAYS): any[] {
    if (!Array.isArray(tabs)) return [];

    const archived = tabs.filter((tab: any) => tab.state === 'ARCHIVED');
    const hasArchivedAt = archived.some((tab: any) => typeof tab.archivedAt === 'number');
    if (!hasArchivedAt) {
        const nonArchived = tabs.filter((tab: any) => tab.state !== 'ARCHIVED');
        const maxArchived = Math.max(0, Math.trunc(toFiniteNumber(maxAgeDays, 0)));
        const keptArchived = archived.length > maxArchived ? archived.slice(archived.length - maxArchived) : archived;
        return [...nonArchived, ...keptArchived];
    }

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    return tabs.filter((tab: any) => {
        if (tab.state !== 'ARCHIVED') return true; // nunca remove não-arquivadas
        if (!tab.archivedAt) return true; // sem timestamp — mantém (segurança)
        return tab.archivedAt > cutoff; // mantém se dentro do prazo
    });
}
