// @ts-check
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
   NEURAL NETWORK MANAGER — Registry of named NN instances
   ================================================================

   Gerenciador central de redes neurais do sistema. Permite que
   qualquer modulo registre, treine e persista suas proprias
   redes neurais com identificadores unicos.

   Padroes seguidos:
   - Closure de estado (como ticker/manager.js)
   - CustomEvent para notificacao (nnChanged)
   - localStorage para persistencia local
   - Export/import no modelo ECO

   ================================================================ */

import { SimpleNN } from './network.js';
import { isEphemeral } from '../../utils/storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy } from '../../utils/storage/idbStore.js';
import { showToast } from '../../utils/ui/toast.js';
import {
    createDeferredIdlePersistence,
    type DeferredIdlePersistenceController,
} from '../../utils/performance/deferredIdlePersistence.js';
import {
    buildConfig as _buildConfigPure,
    migrateConfig as _migrateConfigPure,
} from './_nnConfigPure.js';

type SimpleNNConfigInput = ConstructorParameters<typeof SimpleNN>[0];

// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------

const STORAGE_KEY = 'ecbyts-nn';
const NN_PERSIST_DEBOUNCE_MS = 750;
const NN_PERSIST_AFTER_BOOT_DELAY_MS = 30000;
const NN_PERSIST_IDLE_TIMEOUT_MS = 3000;

/** @type {Map<string, { nn: SimpleNN, metadata: Object }>} */
/** @type {Map<string, any>} */
const _instances = new Map();
let _persistScheduler: DeferredIdlePersistenceController | null = null;
let _pendingPersistPromise: Promise<boolean> | null = null;
let _resolvePendingPersist: ((ok: boolean) => void) | null = null;
let _lastPersistSignature = '';
/** @type {boolean} Whether the NN manager finished initializing from IDB. */
let _nnInitialized = false;
/** @type {Promise<void>|null} Shared in-flight init promise (concurrency dedupe). */
let _nnInitPromise: Promise<void> | null = null;

// ----------------------------------------------------------------
// INTERNAL HELPERS
// ----------------------------------------------------------------

/**
 * Dispatch change event for UI updates.
 * Notifica o sistema que redes neurais mudaram.
 */
function _dispatchChange() {
    window.dispatchEvent(new CustomEvent('nnChanged'));
}

/**
 * Build config object from a SimpleNN instance.
 * Constroi objeto de configuracao para persistencia.
 *
 * @param {SimpleNN} nn
 * @returns {Object}
 */
function _buildConfig(nn: any) {
    return _buildConfigPure(nn);
}

/**
 * Serialize all networks for persistence.
 * Mantem a montagem do payload isolada para dedupe/debounce.
 */
function _serializeNetworks() {
    /** @type {Record<string, any>} */
    const data: Record<string, any> = {};
    for (const [id, entry] of _instances) {
        data[id] = {
            config: _buildConfig(entry.nn),
            metadata: entry.metadata,
            state: entry.nn.toJSON(),
        };
    }
    return data;
}

function _getNetworksSignature(data = _serializeNetworks()) {
    try {
        return JSON.stringify(data);
    } catch {
        return `networks:${_instances.size}`;
    }
}

function _resolvePersist(ok: boolean) {
    if (_resolvePendingPersist) _resolvePendingPersist(ok);
    _pendingPersistPromise = null;
    _resolvePendingPersist = null;
}

function _getPersistScheduler() {
    if (!_persistScheduler) {
        _persistScheduler = createDeferredIdlePersistence({
            debounceMs: NN_PERSIST_DEBOUNCE_MS,
            bootDelayMs: NN_PERSIST_AFTER_BOOT_DELAY_MS,
            idleTimeoutMs: NN_PERSIST_IDLE_TIMEOUT_MS,
            flush: _persistAll,
            onError: (error) => {
                console.debug('[core/nn/manager:persist-idle]', (error as any)?.message || error);
                _resolvePersist(false);
            },
        });
    }
    return _persistScheduler;
}

/**
 * Persist all networks to IndexedDB immediately.
 * Salva estado de todas as redes no IndexedDB quando o caller precisa aguardar.
 */
async function _persistAll() {
    if (isEphemeral()) {
        _resolvePersist(true);
        return true;
    }
    _persistScheduler?.clear();
    const data = _serializeNetworks();
    const signature = _getNetworksSignature(data);
    if (signature === _lastPersistSignature) {
        _resolvePersist(true);
        return true;
    }
    const ok = await idbSet(STORAGE_KEY, data);
    if (ok) _lastPersistSignature = signature;
    if (!ok) showToast('Storage full. Neural network data may not persist.', 'warning', undefined);
    _resolvePersist(ok);
    return ok;
}

function _schedulePersistAll() {
    if (!_pendingPersistPromise) {
        _pendingPersistPromise = new Promise((resolve) => {
            _resolvePendingPersist = resolve;
        });
    }
    _getPersistScheduler().schedule();
    return _pendingPersistPromise;
}

/**
 * Migrate old config format to new format.
 * Se config tem hiddenSize mas nao hiddenLayerSizes, cria array.
 *
 * @param {any} config
 * @returns {any}
 */
function _migrateConfig(config: any): SimpleNNConfigInput {
    return _migrateConfigPure(config) as SimpleNNConfigInput;
}

// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------

/**
 * Initialize NN manager from IndexedDB (migra do localStorage se necessário).
 * Restaura redes neurais salvas e recria instancias SimpleNN.
 */
export async function initNN() {
    if (_nnInitialized) return;
    // Dedupe de concorrência (LOADING-PERF GAP-2, claude - adm 2026-06-25):
    // initNN não tinha guard — duas chamadas simultâneas reliam o IDB e
    // recriavam as instâncias em paralelo. Agora a 2ª reaproveita a 1ª promise.
    if (_nnInitPromise) return _nnInitPromise;
    _nnInitPromise = (async () => {
        try {
            const data = await idbGetWithLegacy(STORAGE_KEY);
            if (!data || typeof data !== 'object') return;

            for (const [id, entryRaw] of Object.entries(data)) { const entry = entryRaw as any;
                if (!entry.config) continue;
                const config = _migrateConfig(entry.config);
                const nn = new SimpleNN(config);
                if (entry.state) nn.fromJSON(entry.state);
                _instances.set(id, {
                    nn,
                    metadata: entry.metadata || {},
                });
            }
            _lastPersistSignature = _getNetworksSignature();
        } catch (err) {
            console.error('NN manager: failed to load from IDB', err);
        }
    })();
    try {
        await _nnInitPromise;
        _nnInitialized = true;
    } catch (e) {
        _nnInitPromise = null;
        throw e;
    }
}

/**
 * Garante que o NN manager esteja inicializado antes do 1º uso (lazy/idempotente).
 * Ensures the NN manager is initialized before first use (lazy, idempotent).
 *
 * LOADING-PERF GAP-2 (claude - adm 2026-06-25): substitui o `await initNN()`
 * serial do boot crítico. Chamadas concorrentes deduplicadas. Rodar 2x é no-op.
 * @returns {Promise<void>}
 */
export async function ensureNN() {
    return initNN();
}

/**
 * Indica se o NN manager já terminou de inicializar (sem disparar init).
 * @returns {boolean}
 */
export function isNNReady() {
    return _nnInitialized;
}

// ----------------------------------------------------------------
// CRUD - Create, read, delete network instances
// Gerencia ciclo de vida das redes neurais registradas
// ----------------------------------------------------------------

/**
 * Register a new named NN instance.
 * Cria uma nova rede neural com identificador unico.
 *
 * @param {string} id - Unique instance name (e.g., 'aerial-classifier')
 * @param {Object} config - { inputSize, hiddenSize|hiddenLayerSizes, outputSize, classNames }
 * @param {Object} [metadata] - Additional metadata (description, createdAt, etc.)
 * @returns {SimpleNN} The created network instance
 */
export function registerNetwork(id: any, config: any, metadata = {}) {
    const nn = new SimpleNN(_migrateConfig(config));
    _instances.set(id, {
        nn,
        metadata: {
            createdAt: new Date().toISOString(),
            ...metadata,
        },
    });
    return nn;
}

/**
 * Get a named NN instance.
 * @param {string} id
 * @returns {SimpleNN|null}
 */
export function getNetwork(id: any) {
    const entry = _instances.get(id);
    return entry ? entry.nn : null;
}

/**
 * Remove a named NN instance.
 * @param {string} id
 * @returns {boolean} true if removed
 */
export function removeNetwork(id: any) {
    const removed = _instances.delete(id);
    if (removed) {
        void _schedulePersistAll();
        _dispatchChange();
    }
    return removed;
}

/**
 * Export a network as a portable payload { id, config, metadata, state }.
 * Mesmo formato usado na persistência IDB — centraliza a serialização reusável
 * pelo kind portável `nn_network` (P1-10), evitando expor `_buildConfig` interno.
 * @param {string} id
 * @returns {Object|null} payload portável, ou null se a rede não existir
 */
export function exportNetwork(id: any) {
    const entry = _instances.get(id);
    if (!entry) return null;
    return {
        id,
        config: _buildConfig(entry.nn),
        metadata: entry.metadata || {},
        state: entry.nn.toJSON(),
    };
}

/**
 * Import a network from a portable payload, restoring weights, persisting and
 * notifying the UI. IDs em colisão recebem sufixo para não sobrescrever redes
 * já existentes do usuário.
 * @param {Object} payload - { id?, config, metadata?, state? }
 * @returns {Promise<{ ok: boolean, id?: string }>}
 */
export async function importNetwork(payload: any) {
    if (!payload || typeof payload !== 'object' || !payload.config) {
        return { ok: false };
    }
    let id = typeof payload.id === 'string' && payload.id ? payload.id : 'imported-network';
    if (_instances.has(id)) {
        let n = 2;
        while (_instances.has(`${id}-${n}`)) n++;
        id = `${id}-${n}`;
    }
    const nn = new SimpleNN(_migrateConfig(payload.config));
    if (payload.state) nn.fromJSON(payload.state);
    _instances.set(id, {
        nn,
        metadata: { createdAt: new Date().toISOString(), ...(payload.metadata || {}) },
    });
    await _persistAll();
    _dispatchChange();
    return { ok: true, id };
}

/**
 * List all registered network IDs.
 * @returns {string[]}
 */
export function listNetworks() {
    return Array.from(_instances.keys());
}

/**
 * Get metadata for a named network.
 * @param {string} id
 * @returns {Object|null}
 */
export function getNetworkMetadata(id: any) {
    const entry = _instances.get(id);
    if (!entry) return null;
    return {
        ...entry.metadata,
        trained: entry.nn.trained,
        inputSize: entry.nn.inputSize,
        hiddenLayerSizes: entry.nn.hiddenLayerSizes,
        hiddenSize: entry.nn.hiddenSize, // backward compat
        outputSize: entry.nn.outputSize,
        classNames: entry.nn.classNames,
    };
}

// ----------------------------------------------------------------
// MAPPING - Variable mapping for builder/what-if
// Mapeamento de variaveis para construtor e simulador
// ----------------------------------------------------------------

/**
 * Get the variable mapping for a network.
 * @param {string} id
 * @returns {{ inputs: Array<any>, outputs: Array<any>, targetElementId: string|null }|null}
 */
export function getNetworkMapping(id: any) {
    const entry = _instances.get(id);
    return entry?.metadata?.mapping || null;
}

/**
 * Update the variable mapping for a network.
 * Atualiza mapeamento e persiste no localStorage.
 *
 * @param {string} id
 * @param {{ inputs: Array<any>, outputs: Array<any>, targetElementId?: string|null }} mapping
 */
export function updateNetworkMapping(id: any, mapping: any) {
    const entry = _instances.get(id);
    if (!entry) return;
    entry.metadata.mapping = mapping;
    void _schedulePersistAll();
    _dispatchChange();
}

/**
 * Resize network topology to match mapping dimensions.
 * Recria a rede com novos tamanhos de entrada/saida, preservando hidden layers.
 *
 * @param {string} id
 * @param {number} inputSize
 * @param {number} outputSize
 */
export function resizeNetwork(id: any, inputSize: any, outputSize: any) {
    const entry = _instances.get(id);
    if (!entry) return;

    const nn = entry.nn;
    if (nn.inputSize === inputSize && nn.outputSize === outputSize) return;

    // Recreate with new dimensions, keeping hidden topology and mode
    const config = {
        inputSize,
        hiddenLayerSizes: nn.hiddenLayerSizes,
        outputSize,
        classNames: null,
        mode: nn.mode || 'classification',
    };
    const newNN = new SimpleNN(config);
    entry.nn = newNN;
    void _schedulePersistAll();
    _dispatchChange();
}

// ----------------------------------------------------------------
// PERSISTENCE - localStorage and model export/import
// ----------------------------------------------------------------

/**
 * Persist a single network to localStorage.
 * Salva rede individual (atualiza o storage completo).
 * @param {string} id
 */
export function persistNetwork(id: any) {
    if (!_instances.has(id)) return;
    void _schedulePersistAll();
}

/**
 * Export all networks for model persistence.
 * Exporta todas as redes para inclusao no modelo ECO.
 *
 * @returns {Object|null} { [id]: { config, metadata, state } } or null if empty
 */
export function exportAllNetworks() {
    if (_instances.size === 0) return null;

    /** @type {Record<string, any>} */
    const data: Record<string, any> = {};
    for (const [id, entry] of _instances) {
        data[id] = {
            config: _buildConfig(entry.nn),
            metadata: entry.metadata,
            state: entry.nn.toJSON(),
        };
    }
    return data;
}

/**
 * Import networks from model data.
 * Importa redes do modelo ECO, recria instancias SimpleNN.
 *
 * @param {Object} data - { [id]: { config, metadata, state } }
 */
export function importAllNetworks(data: any) {
    if (!data || typeof data !== 'object') return;

    // Clear existing instances
    _instances.clear();

    for (const [id, entryRaw] of Object.entries(data)) { const entry = entryRaw as any;
        if (!entry.config) continue;
        const config = _migrateConfig(entry.config);
        const nn = new SimpleNN(config);
        if (entry.state) nn.fromJSON(entry.state);
        _instances.set(id, {
            nn,
            metadata: entry.metadata || {},
        });
    }

    void _schedulePersistAll();
}
