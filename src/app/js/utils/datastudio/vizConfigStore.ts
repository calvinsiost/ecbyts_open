// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * vizConfigStore.ts - Persistent store for DataStudio custom viz configurations.
 * Persiste configurações de visualizações customizadas via IndexedDB.
 *
 * Prefixo de chave: 'ecbyts-datastudio-viz-configs'
 * Usa idbSet/idbGet de utils/storage/idbStore.js (padrão ECBT Storage).
 */

import { idbSet, idbGet } from '../storage/idbStore.js';
import { CustomVizConfig } from './customVizConfig.js';

const KEY = 'ecbyts-datastudio-viz-configs';

/**
 * Saves or updates a viz config in the store (upsert by id).
 * Salva ou atualiza uma configuração de visualização (upsert por id).
 *
 * @param {CustomVizConfig} config
 * @returns {Promise<void>}
 */
export async function saveVizConfig(config: CustomVizConfig): Promise<void> {
    const all = await loadVizConfigs();
    const filtered = all.filter((c) => c.id !== config.id);
    await idbSet(KEY, [...filtered, config]);
}

/**
 * Loads all stored viz configs.
 * Carrega todas as configurações de visualizações persistidas.
 *
 * @returns {Promise<CustomVizConfig[]>}
 */
export async function loadVizConfigs(): Promise<CustomVizConfig[]> {
    return (await idbGet(KEY)) ?? [];
}

/**
 * Deletes a viz config by id.
 * Remove uma configuração de visualização pelo id.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteVizConfig(id: string): Promise<void> {
    const all = await loadVizConfigs();
    await idbSet(
        KEY,
        all.filter((c) => c.id !== id),
    );
}

/**
 * Clears all stored viz configs.
 * Limpa todas as configurações de visualizações armazenadas.
 *
 * @returns {Promise<void>}
 */
export async function clearVizConfigs(): Promise<void> {
    await idbSet(KEY, []);
}
