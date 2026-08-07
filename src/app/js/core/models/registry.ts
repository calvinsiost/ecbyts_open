// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * registry.js - Multi-Model Registry
 *
 * Índice central de modelos persistido em IDB key `models:index`.
 * Fornece CRUD puro (sem efeitos colaterais de UI/cena) - o switch real
 * (dispose + load) é orquestrado por `core/scene/lifecycleOwner.js`.
 *
 * Feature flag: CONFIG.FEATURES.MULTI_MODEL (default false).
 * Quando off, código legado continua usando chaves globais sem interferência.
 *
 * Ver SPEC_MULTI_MODEL_TABS.md §4 e ADR.md deste módulo.
 */

import { idbGet, idbSet, idbDelete } from '../../utils/storage/idbStore.js';


const INDEX_KEY = 'models:index';
const INDEX_VERSION = 1;
const SOFT_LIMIT = 50;
const HARD_LIMIT = 200;
const INDEX_READ_CACHE_TTL_MS = 3000;

let _indexReadCache: any = null;
let _indexReadCacheAt = 0;
let _indexReadInflight: Promise<any> | null = null;

// Chaves globais (single-model legado) que serão migradas para scope `model:{id}:*`.
// Mantida como single source of truth - se houver nova chave de modelo,
// adicionar aqui e ao `clearModelData()` em storageMonitor.js.
export const LEGACY_MODEL_KEYS = [
    'ecbyts-elements',
    'ecbyts-campaigns',
    'ecbyts-scenes',
    'ecbyts-families',
    'ecbyts-edges',
    'ecbyts-stamps',
    'ecbyts-groups',
    'ecbyts-audit-trail',
    'ecbyts-camera-state',
    'ecbyts-default-view',
    'ecbyts-origin',
];

/**
 * Gera UUID v4. Usa crypto.randomUUID quando disponível; fallback manual.
 * @returns {string}
 */
function _uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback RFC4122 v4 - suficiente para IDs internos, não crypto-grade
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Constrói chave escopada por modelo.
 * Ex: scopedKey('abc', 'elements') → 'model:abc:elements'
 * @param {string} modelId
 * @param {string} suffix
 * @returns {string}
 */
export function scopedKey(modelId: any, suffix: any) {
    if (!modelId || typeof modelId !== 'string') {
        throw new Error('scopedKey: modelId obrigatório');
    }
    if (!suffix || typeof suffix !== 'string') {
        throw new Error('scopedKey: suffix obrigatório');
    }
    return `model:${modelId}:${suffix}`;
}

/**
 * Estrutura default do índice vazio.
 * @returns {{version:number, activeId:string|null, models:Array<any>}}
 */
function _emptyIndex() {
    return { version: INDEX_VERSION, activeId: null, models: [] };
}

function _cloneIndex(index: any) {
    const source = index && typeof index === 'object' ? index : _emptyIndex();
    return {
        ...source,
        models: Array.isArray(source.models) ? source.models.map((m: any) => ({ ...m })) : [],
    };
}

function _cacheIndex(index: any) {
    _indexReadCache = _cloneIndex(index);
    _indexReadCacheAt = Date.now();
}

function _isIndexCacheFresh() {
    return _indexReadCache && Date.now() - _indexReadCacheAt < INDEX_READ_CACHE_TTL_MS;
}

async function _readIndexFromIdb() {
    const raw = await idbGet(INDEX_KEY);
    if (!raw || typeof raw !== 'object') return _emptyIndex();
    if (typeof raw.version !== 'number' || !Array.isArray(raw.models)) {
        console.warn('[registry] índice corrompido, resetando');
        return _emptyIndex();
    }
    return raw;
}

/**
 * Lê o índice. Se não existir ou estiver corrompido, retorna índice vazio.
 * Nunca lança.
 * @returns {Promise<{version:number, activeId:string|null, models:Array<any>}>}
 */
async function _readIndexUncached() {
    const raw = await idbGet(INDEX_KEY);
    if (!raw || typeof raw !== 'object') return _emptyIndex();
    if (typeof raw.version !== 'number' || !Array.isArray(raw.models)) {
        console.warn('[registry] índice corrompido, resetando');
        return _emptyIndex();
    }
    return raw;
}

/**
 * Persiste o índice. Retorna false em falha (não lança).
 * @param {object} index
 * @returns {Promise<boolean>}
 */
export async function readIndex() {
    if (_isIndexCacheFresh()) return _cloneIndex(_indexReadCache);
    if (_indexReadInflight) return _cloneIndex(await _indexReadInflight);

    _indexReadInflight = _readIndexFromIdb()
        .then((index) => {
            _cacheIndex(index);
            return index;
        })
        .finally(() => {
            _indexReadInflight = null;
        });
    return _cloneIndex(await _indexReadInflight);
}

export async function writeIndex(index: any) {
    if (!index || typeof index !== 'object') return false;
    const ok = await idbSet(INDEX_KEY, index);
    if (ok) _cacheIndex(index);
    return ok;
}

/**
 * Lista metadata de todos os modelos (sem thumbnails).
 * Para obter thumbnail, chamar getModel(id) individualmente.
 * @returns {Promise<Array<any>>}
 */
export async function listModels() {
    const index = await readIndex();
    // Copia shallow + remove thumbnails do retorno em listagem (payload leve)
    return index.models.map((m: any) => {
        const { thumbnail: _thumb, ...rest } = m;
        return rest;
    });
}

/**
 * Obtém um modelo completo (com thumbnail) do índice.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function getModel(id: any) {
    if (!id) return null;
    const index = await readIndex();
    return index.models.find((m: any) => m.id === id) || null;
}

/**
 * Retorna o modelo ativo ou null.
 * @returns {Promise<object|null>}
 */
export async function getActiveModel() {
    const index = await readIndex();
    if (!index.activeId) return null;
    return index.models.find((m: any) => m.id === index.activeId) || null;
}

/**
 * Cria novo modelo no índice.
 * NÃO carrega dados nem inicializa cena - apenas registra metadata.
 * O caller é responsável por popular as chaves escopadas (model:{id}:elements etc.)
 * e depois chamar switchActive(id) se quiser ativar.
 *
 * @param {object} opts
 * @param {string} [opts.name] - default "Sem título"
 * @param {string} [opts.source] - 'empty' | 'random' | 'import' | 'duplicate'
 * @returns {Promise<object>} modelo criado (sem thumbnail ainda)
 */
export async function createModel({ name = 'Sem título', source = 'empty' } = {}) {
    const index = await readIndex();

    if (index.models.length >= HARD_LIMIT) {
        throw new Error(`createModel: limite máximo de ${HARD_LIMIT} modelos atingido`);
    }

    const now = Date.now();
    const model = {
        id: _uuid(),
        name: String(name).slice(0, 120),
        thumbnail: null,
        source,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: null,
        elementCount: 0,
        campaignCount: 0,
    };

    index.models.push(model);
    const ok = await writeIndex(index);
    if (!ok) {
        throw new Error('createModel: falha ao persistir índice');
    }

    if (index.models.length >= SOFT_LIMIT) {
        console.warn(`[registry] ${index.models.length} modelos — considere remover antigos`);
    }

    return { ...model };
}

/**
 * Marca um modelo como ativo. NÃO dispara dispose/load - isso é responsabilidade
 * de `sceneOwner.switchModel()` que chama esta função internamente.
 * Atualiza `lastOpenedAt`.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function switchActive(id: any) {
    if (!id) return false;
    const index = await readIndex();
    const model = index.models.find((m: any) => m.id === id);
    if (!model) {
        console.warn('[registry] switchActive: modelo não encontrado:', id);
        return false;
    }
    index.activeId = id;
    model.lastOpenedAt = Date.now();
    return writeIndex(index);
}

/**
 * Renomeia modelo. Trunca em 120 caracteres.
 * @param {string} id
 * @param {string} newName
 * @returns {Promise<boolean>}
 */
export async function renameModel(id: any, newName: any) {
    if (!id || typeof newName !== 'string') return false;
    const trimmed = newName.trim();
    if (!trimmed) return false;
    const index = await readIndex();
    const model = index.models.find((m: any) => m.id === id);
    if (!model) return false;
    model.name = trimmed.slice(0, 120);
    model.updatedAt = Date.now();
    return writeIndex(index);
}

/**
 * Atualiza thumbnail (base64 PNG).
 * Rejeita thumbnails >50KB para evitar inflar IDB.
 * @param {string} id
 * @param {string} base64
 * @returns {Promise<boolean>}
 */
export async function updateThumbnail(id: any, base64: any) {
    if (!id || typeof base64 !== 'string') return false;
    if (base64.length > 50 * 1024) {
        console.warn('[registry] thumbnail >50KB rejeitado para', id);
        return false;
    }
    const index = await readIndex();
    const model = index.models.find((m: any) => m.id === id);
    if (!model) return false;
    model.thumbnail = base64;
    model.updatedAt = Date.now();
    return writeIndex(index);
}

/**
 * Atualiza contadores (elementCount, campaignCount). Usado por managers
 * após CRUD para manter metadata da tab sincronizada.
 * @param {string} id
 * @param {{elementCount?:number, campaignCount?:number}} counts
 * @returns {Promise<boolean>}
 */
export async function updateCounts(id: any, counts = {}) {
    if (!id) return false;
    const index = await readIndex();
    const model = index.models.find((m: any) => m.id === id);
    if (!model) return false;
    if (typeof (counts as any).elementCount === 'number') model.elementCount = (counts as any).elementCount;
    if (typeof (counts as any).campaignCount === 'number') model.campaignCount = (counts as any).campaignCount;
    model.updatedAt = Date.now();
    return writeIndex(index);
}

/**
 * Remove modelo do índice E deleta todas as chaves escopadas `model:{id}:*`
 * declaradas em LEGACY_MODEL_KEYS (equivalentes escopadas).
 * Se o modelo removido era o ativo, `activeId` fica null - caller deve
 * decidir fallback (abrir outro modelo ou empty state).
 *
 * @param {string} id
 * @returns {Promise<{removed:boolean, wasActive:boolean, nextId:string|null}>}
 */
export async function deleteModel(id: any) {
    if (!id) return { removed: false, wasActive: false, nextId: null };
    const index = await readIndex();
    const idx = index.models.findIndex((m: any) => m.id === id);
    if (idx === -1) return { removed: false, wasActive: false, nextId: null };

    const wasActive = index.activeId === id;
    index.models.splice(idx, 1);

    let nextId = null;
    if (wasActive) {
        index.activeId = null;
        // Fallback: modelo mais recentemente aberto (lastOpenedAt desc)
        if (index.models.length > 0) {
            const sorted = [...index.models].sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
            nextId = sorted[0].id;
        }
    }

    const ok = await writeIndex(index);
    if (!ok) return { removed: false, wasActive, nextId: null };

    // Limpeza das chaves escopadas - best effort, não falha a operação se alguma der erro
    for (const suffix of LEGACY_MODEL_KEYS) {
        const key = scopedKey(id, suffix.replace(/^ecbyts-/, ''));
        await idbDelete(key);
    }

    return { removed: true, wasActive, nextId };
}

/**
 * Duplica modelo: cria nova entrada com novo ID + copia todas as chaves
 * escopadas. Thumbnail é copiado mas elementCount/campaignCount também.
 *
 * @param {string} sourceId
 * @param {string} [newName] - default: "{original} (cópia)"
 * @returns {Promise<object|null>} modelo novo criado ou null em falha
 */
export async function duplicateModel(sourceId: any, newName: any) {
    if (!sourceId) return null;
    const source = /** @type {any} */ (await getModel(sourceId));
    if (!source) return null;

    const copyName = newName || `${source.name} (cópia)`;
    const copy = /** @type {any} */ (await createModel({ name: copyName, source: 'duplicate' }));

    // Copia chaves escopadas
    for (const suffix of LEGACY_MODEL_KEYS) {
        const fromKey = scopedKey(sourceId, suffix.replace(/^ecbyts-/, ''));
        const toKey = scopedKey(copy.id, suffix.replace(/^ecbyts-/, ''));
        const value = await idbGet(fromKey);
        if (value != null) {
            await idbSet(toKey, value);
        }
    }

    // Copia metadata não-identificadora
    if (source.thumbnail) await updateThumbnail(copy.id, source.thumbnail);
    await updateCounts(copy.id, {
        elementCount: source.elementCount,
        campaignCount: source.campaignCount,
    });

    return getModel(copy.id);
}
