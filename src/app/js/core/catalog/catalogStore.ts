/**
 * core/catalog/catalogStore.js - IDB persistence for Data Catalog Access Groups P1-24
 * (SPEC_DATA_CATALOG_ACCESS_GROUPS_9_66)
 *
 * Persiste grupos de acesso no IndexedDB via idbSet/idbGet.
 * Os dados sobrevivem reload sem depender de localStorage.
 *
 * @module catalog/catalogStore
 * @license AGPL-3.0-only
 */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';

type AccessLevel = 'public' | 'restricted' | 'private';
interface AccessGroup { id: string; name: string; level: AccessLevel; memberIds: string[]; }

/** Chave IDB para o array de AccessGroup. */
const GROUPS_KEY = 'ecbyts-catalog-access-groups';

/**
 * Persiste o array de grupos de acesso no IDB.
 *
 * @param {Readonly<AccessGroup>[]} groups
 * @returns {Promise<void>}
 */
export async function saveAccessGroups(groups: Readonly<AccessGroup>[]): Promise<void> {
    await idbSet(GROUPS_KEY, groups);
}

/**
 * Carrega os grupos de acesso do IDB.
 * Retorna array vazio se nenhum grupo foi salvo.
 *
 * @returns {Promise<Readonly<AccessGroup>[]>}
 */
export async function loadAccessGroups(): Promise<Readonly<AccessGroup>[]> {
    return (await idbGet(GROUPS_KEY)) ?? [];
}

/**
 * Limpa todos os grupos de acesso do IDB.
 * Usado em testes e no reset de workspace.
 *
 * @returns {Promise<void>}
 */
export async function clearCatalogData(): Promise<void> {
    await idbSet(GROUPS_KEY, []);
}
