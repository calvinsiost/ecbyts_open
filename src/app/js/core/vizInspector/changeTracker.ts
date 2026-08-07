// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * changeTracker.js - Persistencia de commits de mudanca via IndexedDB
 *
 * Armazena ate 500 entradas (LIFO) usando idbSet/idbGet para evitar o limite
 * do localStorage. Zero dependências de DOM - modulo puro de persistencia.
 */

import { idbSet, idbGet } from '../../utils/storage/idbStore.js';
import { createChangeCommit, CHANGE_STATUS } from './auditSchema.js';

/**
 * @typedef {object} ChangeCommit
 * @property {string} id
 * @property {string} [author]
 * @property {string} [status]
 */

/** Chave de armazenamento IDB para a lista de commits */
const KEY = 'ecbyts-vizinspector-commits';

/** Limite maximo de commits armazenados (LIFO) */
const MAX_COMMITS = 500;

/**
 * Registra um novo commit de mudanca no historico.
 * Insere no inicio da lista (LIFO) e aplica cap de MAX_COMMITS.
 *
 * @param {object} commitData - Dados do commit (ver createChangeCommit)
 * @returns {Promise<ChangeCommit>} Commit normalizado que foi persistido
 */
export async function recordCommit(commitData: any) {
    const existing = await loadCommits();
    const entry = createChangeCommit(commitData);
    await idbSet(KEY, [entry, ...existing].slice(0, MAX_COMMITS));
    return entry;
}

/**
 * Carrega todos os commits do historico.
 *
 * @returns {Promise<ChangeCommit[]>}
 */
export async function loadCommits() {
    return (await idbGet(KEY)) ?? [];
}

/**
 * Atualiza o status de um commit pelo seu ID.
 *
 * @param {string} id     - UUID do commit a atualizar
 * @param {string} status - Novo status (CHANGE_STATUS)
 * @returns {Promise<void>}
 */
export async function updateCommitStatus(id: any, status: any) {
    const commits = await loadCommits();
    const updated = commits.map((c: any) => c.id === id ? { ...c, status } : c);
    await idbSet(KEY, updated);
}

/**
 * Retorna um subconjunto filtrado do historico de commits.
 *
 * @param {object} [opts]
 * @param {string} [opts.author]  - Filtrar por tag de autoria
 * @param {string} [opts.status]  - Filtrar por status
 * @param {number} [opts.limit]   - Numero maximo de resultados (default 50)
 * @returns {Promise<ChangeCommit[]>}
 */
export async function getCommitHistory({
 author,
 status,
 limit = 50
}: any = {}) {
    const commits = await loadCommits();
    return commits.filter((c: any) => (!author || c.author === author) && (!status || c.status === status)).slice(0, limit);
}

/**
 * Remove todos os commits do historico.
 *
 * @returns {Promise<void>}
 */
export async function clearCommitHistory() {
    await idbSet(KEY, []);
}
