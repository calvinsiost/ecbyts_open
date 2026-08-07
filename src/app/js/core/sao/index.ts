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
   SAO MODULE — Environmental & Occupational Health Protocol
   Módulo SAO — Protocolo de Saúde Ambiental e Ocupacional

   Ponto de entrada do sistema SAO. Gerencia cenários, matrizes,
   tiers e o carregamento dinâmico de parâmetros por matriz.

   PADRÃO: "Active Parameters"
   - Parâmetros SAO são carregados sob demanda (lazy loading)
   - Mesclados em CONFIG.PARAMETERS sem duplicar
   - getActiveParameters() filtra por cenário + tier ativo
   - Sem cenário ativo, retorna CONFIG.PARAMETERS inteiro (backward compat)
   ================================================================ */
import { CONFIG } from '../../config.js';
import { SAO_MATRICES, getAllMatrixIds } from './matrices.js';
import { getScenario } from './scenarios.js';
import { mergeSAOUnits } from './units.js';
import { isEphemeral } from '../../utils/storage/storageMonitor.js';
import { idbSet, idbGetWithLegacy } from '../../utils/storage/idbStore.js';
import {
    filterActiveParameters as _filterActiveParameters,
    filterMatrixParameters as _filterMatrixParameters,
    countParametersByMatrixTier as _countParametersByMatrixTier,
} from './_saoFilteringPure.js';
// ================================================================
// STATE
// ================================================================
/** @type {string|null} Currently active scenario ID */
let activeScenario: any = null;
/** @type {string} Current tier filter: 'essential' | 'recommended' | 'specialized' */
let activeTier = 'essential';
/** @type {Set<string>} Explicitly activated matrix IDs */
let activeMatrices = new Set<string>();
/** @type {Set<string>} Matrix IDs already loaded into CONFIG.PARAMETERS */
const loadedMatrices = new Set();
/** @type {boolean} Whether SAO module has been initialized */
let initialized = false;
/**
 * @type {Promise<void>|null}
 * LOADING-PERF GAP-2 (claude - adm 2026-06-25): promise compartilhada para
 * deduplicar chamadas concorrentes de initSAO. Antes, duas chamadas simultâneas
 * (ex: warm-up em background + 1º clique do usuário) corriam o restore de estado
 * 2x antes de `initialized=true`. Agora a 2ª chamada reaproveita a promise da 1ª.
 */
let initPromise: Promise<void> | null = null;
// Tier rank for cumulative filtering
const TIER_RANK: Record<string, number> = { essential: 0, recommended: 1, specialized: 2 };
// localStorage key for persisting active scenario
const STORAGE_KEY = 'ecbyts-sao';
// ================================================================
// INITIALIZATION
// ================================================================
/**
 * Initialize the SAO module.
 * Merges SAO units into CONFIG.UNITS and restores saved state.
 * Inicializa o módulo SAO, mescla unidades e restaura estado salvo.
 */
export async function initSAO() {
    if (initialized)
        return;
    // Dedupe de concorrência: se já há um init em andamento, reaproveita-o.
    // Sem isto, o warm-up em background e o 1º uso real (clique) poderiam rodar
    // o restore de estado em paralelo antes de `initialized=true`.
    if (initPromise)
        return initPromise;
    initPromise = (async () => {
        // Merge SAO-specific units into the global catalog
        mergeSAOUnits();
        // Eager-load ALL matrix parameter files into CONFIG.PARAMETERS
        // so every parameter is available in the Field Manager from startup
        await loadAllMatrices();
        // Restore saved state from localStorage
        try {
            const state = (await idbGetWithLegacy(STORAGE_KEY)) as any;
            if (state) {
                if (state.scenario) {
                    await activateScenario(state.scenario, false);
                }
                if (state.tier) {
                    activeTier = state.tier;
                }
                if (state.matrices && Array.isArray(state.matrices)) {
                    state.matrices.forEach((m: any) => activeMatrices.add(m));
                }
            }
        }
        catch (e: any) {
            console.warn('[SAO] Failed to restore saved state:', e?.message);
        }
        initialized = true;
    })();
    try {
        await initPromise;
    } catch (e: any) {
        // Em falha, libera a promise para permitir nova tentativa em uso futuro.
        initPromise = null;
        throw e;
    }
}

/**
 * Garante que o módulo SAO esteja inicializado antes do 1º uso (lazy/idempotente).
 * Ensures the SAO module is initialized before first use (lazy, idempotent).
 *
 * LOADING-PERF GAP-2 (claude - adm 2026-06-25): substitui o `await initSAO()`
 * serial do boot crítico. Todo consumidor que assume SAO pronto deve
 * `await ensureSAO()` no ponto de entrada. Chamadas concorrentes são
 * deduplicadas via `initPromise`. Rodar 2x é seguro (no-op após init).
 * @returns {Promise<void>}
 */
export async function ensureSAO() {
    return initSAO();
}

/**
 * Indica se o módulo SAO já terminou de inicializar (sem disparar init).
 * @returns {boolean}
 */
export function isSAOReady() {
    return initialized;
}
// ================================================================
// SCENARIO MANAGEMENT
// ================================================================
/**
 * Activate a disaster/operations scenario.
 * Loads primary and secondary matrices on demand.
 * Ativa um cenário, carregando matrizes primárias e secundárias.
 *
 * @param {string} scenarioId - Scenario ID from SAO_SCENARIOS
 * @param {boolean} [persist=true] - Whether to save to localStorage
 */
export async function activateScenario(scenarioId: any, persist: any = true) {
    const scenario = getScenario(scenarioId);
    if (!scenario) {
        console.warn(`[SAO] Unknown scenario: ${scenarioId}`);
        return;
    }
    activeScenario = scenarioId;
    activeMatrices = new Set([...scenario.primaryMatrices, ...scenario.secondaryMatrices]);
    activeTier = scenario.defaultTier || 'essential';
    // Lazy-load parameter files for all activated matrices
    const loadPromises = [];
    for (const matrixId of activeMatrices) {
        loadPromises.push(loadMatrixParameters(matrixId));
    }
    await Promise.all(loadPromises);
    if (persist)
        saveState();
    dispatchChange();
}
/**
 * Deactivate current scenario - returns to default behavior.
 * Desativa o cenário atual, voltando ao comportamento padrão.
 */
export function deactivateScenario() {
    activeScenario = null;
    activeMatrices = new Set();
    activeTier = 'essential';
    saveState();
    dispatchChange();
}
/**
 * Get the currently active scenario ID.
 * @returns {string|null}
 */
export function getActiveScenario() {
    return activeScenario;
}
// ================================================================
// TIER MANAGEMENT
// ================================================================
/**
 * Set the active tier filter level (cumulative).
 * Essential shows only essential. Recommended shows essential + recommended.
 * Specialized shows all three tiers.
 *
 * @param {'essential'|'recommended'|'specialized'} tier
 */
export function setTier(tier: any) {
    if (!(tier in TIER_RANK)) {
        console.warn(`[SAO] Unknown tier: ${tier}`);
        return;
    }
    activeTier = tier;
    saveState();
    dispatchChange();
}
/**
 * Get the currently active tier.
 * @returns {string}
 */
export function getActiveTier() {
    return activeTier;
}
// ================================================================
// MATRIX MANAGEMENT
// ================================================================
/**
 * Toggle a matrix on or off (independently of scenario).
 * Ativa/desativa uma matriz manualmente.
 *
 * @param {string} matrixId
 */
export async function toggleMatrix(matrixId: any) {
    if (!SAO_MATRICES[matrixId]) {
        console.warn(`[SAO] Unknown matrix: ${matrixId}`);
        return;
    }
    if (activeMatrices.has(matrixId)) {
        activeMatrices.delete(matrixId);
    }
    else {
        activeMatrices.add(matrixId);
        await loadMatrixParameters(matrixId);
    }
    saveState();
    dispatchChange();
}
/**
 * Check if a matrix is currently active.
 * @param {string} matrixId
 * @returns {boolean}
 */
export function isMatrixActive(matrixId: any) {
    return activeMatrices.has(matrixId);
}
/**
 * Get all currently active matrix IDs.
 * @returns {string[]}
 */
export function getActiveMatrixIds() {
    return [...activeMatrices];
}
/**
 * Load all matrices at once (for "load all" button or export).
 */
export async function loadAllMatrices() {
    const allIds = getAllMatrixIds();
    await Promise.all(allIds.map((/** @type {any} */ id) => loadMatrixParameters(id)));
}
// ================================================================
// ACTIVE PARAMETERS - Core filtering function
// ================================================================
/**
 * Get parameters filtered by active scenario and tier.
 * If no scenario is active, returns all CONFIG.PARAMETERS (backward compat).
 *
 * Retorna parâmetros filtrados pelo cenário e tier ativos.
 * Sem cenário ativo, retorna todos os CONFIG.PARAMETERS (compatibilidade).
 *
 * @returns {Array<Object>} Filtered parameters
 */
export function getActiveParameters() {
    return _filterActiveParameters(CONFIG.PARAMETERS, activeScenario, activeMatrices, activeTier, TIER_RANK);
}
/**
 * Get parameters for a specific matrix, regardless of current scenario.
 * Useful for the matrix browser panel.
 *
 * @param {string} matrixId
 * @param {string} [tier='specialized'] - Max tier to include
 * @returns {Array<Object>}
 */
export function getMatrixParameters(matrixId: any, tier: any = "specialized") {
    return _filterMatrixParameters(CONFIG.PARAMETERS, matrixId, tier, TIER_RANK);
}
/**
 * Count parameters by matrix and tier (for UI badges).
 * @returns {Object<string, {essential: number, recommended: number, specialized: number, total: number}>}
 */
export function getParameterCounts() {
    return _countParametersByMatrixTier(CONFIG.PARAMETERS, getAllMatrixIds());
}
/**
 * Check if the SAO module has any active configuration.
 * @returns {boolean}
 */
export function isSAOActive() {
    return activeScenario !== null || activeMatrices.size > 0;
}
// ================================================================
// LAZY LOADING - Dynamic parameter file import
// ================================================================
/**
 * Load parameters for a matrix using dynamic import.
 * Merges into CONFIG.PARAMETERS, avoiding duplicates.
 * Existing parameters with matching IDs get sao metadata added.
 *
 * @param {string} matrixId
 * @private
 */
async function loadMatrixParameters(matrixId: any) {
    if (loadedMatrices.has(matrixId))
        return;
    try {
        const module = await import(`./params/${matrixId}.js`);
        // Each file exports a named array: AR_PARAMETERS, AGUA_PARAMETERS, etc.
        const params = module.default || Object.values(module)[0];
        if (!Array.isArray(params)) {
            console.warn(`[SAO] Invalid parameter file for matrix: ${matrixId}`);
            return;
        }
        for (const param of params) {
            const existing = (CONFIG.PARAMETERS.find((/** @type {any} */ p) => p.id === param.id)) as any;
            if (existing) {
                // Existing parameter - add SAO metadata without duplicating
                if (!existing.sao && param.sao) {
                    existing.sao = param.sao;
                }
            }
            else {
                // New parameter - add to CONFIG.PARAMETERS
                CONFIG.PARAMETERS.push(param);
            }
        }
        loadedMatrices.add(matrixId);
    }
    catch (e: any) {
        console.error(`[SAO] Failed to load matrix ${matrixId}:`, e);
    }
}
// ================================================================
// PERSISTENCE & EVENTS
// ================================================================
/**
 * Save current SAO state to localStorage.
 * @private
 */
function saveState() {
    if (isEphemeral())
        return;
    idbSet(STORAGE_KEY, {
        scenario: activeScenario,
        tier: activeTier,
        matrices: [...activeMatrices],
    }).catch((_e) => console.debug('[core/sao/index:silent-catch]', _e?.message || _e));
}
/**
 * Dispatch saoChanged event to trigger UI updates.
 * @private
 */
function dispatchChange() {
    window.dispatchEvent(new CustomEvent('saoChanged'));
}
// ================================================================
// EXPORT INTEGRATION
// ================================================================
/**
 * Get SAO state for model export.
 * Included in buildModel() so imported models restore scenario context.
 *
 * @returns {Object} SAO state for serialization
 */
export function getSAOExportState() {
    return {
        scenario: activeScenario,
        tier: activeTier,
        matrices: [...activeMatrices],
    };
}
/**
 * Restore SAO state from imported model.
 * @param {any} state - SAO state from imported model
 */
export async function restoreSAOState(state: any) {
    if (!state)
        return;
    if (state.scenario) {
        await activateScenario(state.scenario, false);
    }
    if (state.tier) {
        activeTier = state.tier;
    }
    if (state.matrices && Array.isArray(state.matrices)) {
        for (const m of state.matrices) {
            if (!activeMatrices.has(m)) {
                activeMatrices.add(m);
                await loadMatrixParameters(m);
            }
        }
    }
    saveState();
    dispatchChange();
}
