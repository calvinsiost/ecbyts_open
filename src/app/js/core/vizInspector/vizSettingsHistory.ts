// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * vizSettingsHistory.js - Historico persistido de snapshots via IDB
 *
 * Armazena snapshots de vizSettings no IndexedDB com cap de 100 entradas
 * (LIFO - mais recente primeiro). API async espelha semantica de git log.
 */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';

interface Snapshot {
    id: string;
    label: string;
    settings: object;
    createdAt: number;
}

/** Chave IDB para o historico de snapshots */
const KEY: string = 'ecbyts-vizinspector-snapshots';

/** Numero maximo de snapshots retidos (remove os mais antigos apos o limite) */
const MAX_SNAPSHOTS: number = 100;

/**
 * Adiciona snapshot ao historico e persiste no IDB.
 * Snapshots excedentes sao descartados (oldest-first).
 * @param {Snapshot} snapshot
 * @returns {Promise<Array<any>>} historico atualizado
 */
export async function pushSnapshot(snapshot: Snapshot): Promise<Array<any>> {
    const history = await loadHistory();
    const updated = [snapshot, ...history].slice(0, MAX_SNAPSHOTS);
    await idbSet(KEY, updated);
    return updated;
}

/**
 * Carrega historico completo de snapshots do IDB.
 * @returns {Promise<Array<any>>} array de snapshots (mais recente primeiro)
 */
export async function loadHistory(): Promise<Array<any>> {
    return (await idbGet(KEY)) ?? [];
}

/**
 * Busca snapshot pelo id unico.
 * @param {string} id
 * @returns {Promise<Object|null>} snapshot encontrado ou null
 */
export async function getSnapshot(id: string): Promise<object | null> {
    const history = await loadHistory();
    return (history.find((s) => s.id === id) as Snapshot | undefined) ?? null;
}

/**
 * Remove todos os snapshots do IDB.
 * @returns {Promise<void>}
 */
export async function clearHistory(): Promise<void> {
    await idbSet(KEY, []);
}
