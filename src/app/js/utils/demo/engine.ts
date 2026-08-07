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
   DEMO ENGINE — Interactive onboarding state machine
   Motor de demonstracao interativa para onboarding de usuarios

   Gerencia o ciclo de vida do modo demo:
   - Carrega 50 casos pre-definidos em 4 verticais
   - Executa steps interativos com acoes visuais
   - Salva/restaura estado para cleanup limpo

   VERTICAIS: mining, forestry, contamination, occupational_health
   MODULOS: neural_net, ai_bot, satellite

   ================================================================ */
import { addElement, removeElement, getAllElements } from '../../core/elements/manager.js';
import { getCameraState, animateCameraState } from '../scene/controls.js';
import { requestRender } from '../scene/setup.js';
import { showToast } from '../ui/toast.js';
import { fetchDemoCases, generateMockCases } from './cases.js';
import { addDemoTickerLogs, clearDemoTickerLogs, simulateTickerSequence } from './ticker.js';
import { createHeatmapGrid, createWorkerRoutes, removeAllHeatmaps } from './heatmap.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// ----------------------------------------------------------------
// DEEP CLEAR FOR DEMO TAKEOVER
// SPEC_DEMO_NEW_MODEL_DEEP_CLEAR — Limpeza profunda antes do customLoader.
// Idempotente, resiliente a módulos ausentes, marca flag __demoTakeover
// por 30s para que random-boot.js NÃO restaure session pré-takeover em F5.
// ----------------------------------------------------------------
/** Tempo em ms que a flag de takeover permanece ativa após clear. */
const DEMO_TAKEOVER_WINDOW_MS = 30000;
/**
 * Deep clear before demo takeover (SPEC_DEMO_NEW_MODEL_DEEP_CLEAR).
 *
 * Ordem (cada passo guarded por try/catch e gate de existência):
 *  1. Marca window.__demoTakeover = {active:true, until:T+30s}
 *  2. clearAllElements()    — manager.js
 *  3. clearCampaigns()      — campaigns/manager.js
 *  4. clearScenes()         — scenes/manager.js
 *  5. clearTicker()         — ticker/manager.js
 *  6. clearHistory()        — history/manager.js
 *  7. setOrigin({0,0,...})  — coordinates.js
 *  8. await clearModelData() — storageMonitor.js (apaga IDB ecbyts-session etc.)
 *
 * Rollback: setar localStorage 'ecbyts-demo-deep-clear-disabled'='1' →
 * fast-return chamando apenas clearAllElements (comportamento commit 1be6ea17).
 *
 * @returns {Promise<void>}
 */
export async function deepClearForDemoTakeover() {
    // Rollback hatch — se flag setada, comportamento legado (apenas elements)
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('ecbyts-demo-deep-clear-disabled') === '1') {
            const mgr = await import('../../core/elements/manager.js' as string);
            mgr.clearAllElements?.();
            console.debug('[demo:deepClear] disabled via localStorage flag — legacy clearAllElements only');
            return;
        }
    } catch (e: any) {
        console.debug('[demo:deepClear:rollbackCheck]', e?.message || e);
    }
    // Step 1 — Flag de takeover (gate para random-boot.js)
    try {
        if (typeof window !== 'undefined') {
            window.__demoTakeover = {
                active: true,
                until: Date.now() + DEMO_TAKEOVER_WINDOW_MS,
                startedAt: Date.now(),
            };
            setTimeout(() => {
                const w = window;
                if (w.__demoTakeover && w.__demoTakeover.until <= Date.now()) {
                    w.__demoTakeover = { active: false, until: 0 };
                }
            }, DEMO_TAKEOVER_WINDOW_MS + 100);
        }
        console.debug('[demo:deepClear:step1] takeover flag set');
    } catch (e: any) {
        console.debug('[demo:deepClear:step1]', e?.message || e);
    }
    // Step 2 — clearAllElements
    try {
        const mgr = await import('../../core/elements/manager.js' as string);
        mgr.clearAllElements?.();
        console.debug('[demo:deepClear:step2] elements cleared');
    } catch (e: any) {
        console.debug('[demo:deepClear:step2]', e?.message || e);
    }
    // Step 3 — clearCampaigns (random model gera campaigns sintéticas)
    try {
        const camp = await import('../../core/campaigns/manager.js' as string);
        camp.clearCampaigns?.();
        console.debug('[demo:deepClear:step3] campaigns cleared');
    } catch (e: any) {
        console.debug('[demo:deepClear:step3]', e?.message || e);
    }
    // Step 4 — clearScenes
    try {
        const sc = await import('../scenes/manager.js' as string);
        sc.clearScenes?.();
        console.debug('[demo:deepClear:step4] scenes cleared');
    } catch (e: any) {
        console.debug('[demo:deepClear:step4]', e?.message || e);
    }
    // Step 5 — clearTicker (random model gera ticker logs)
    try {
        const tk = await import('../ticker/manager.js' as string);
        tk.clearTicker?.();
        console.debug('[demo:deepClear:step5] ticker cleared');
    } catch (e: any) {
        console.debug('[demo:deepClear:step5]', e?.message || e);
    }
    // Step 6 — clearHistory (impede undo trazer random model de volta)
    try {
        const hist = await import('../history/manager.js' as string);
        hist.clearHistory?.();
        console.debug('[demo:deepClear:step6] history cleared');
    } catch (e: any) {
        console.debug('[demo:deepClear:step6]', e?.message || e);
    }
    // Step 7 — Reset origem UTM (customLoader define a sua própria depois)
    try {
        const coords = await import('../../core/io/geo/coordinates.js' as string);
        coords.setOrigin?.({
            easting: 0,
            northing: 0,
            elevation: 0,
            zone: 23,
            hemisphere: 'S',
        });
        console.debug('[demo:deepClear:step7] origin reset');
    } catch (e: any) {
        console.debug('[demo:deepClear:step7]', e?.message || e);
    }
    // Step 8 — clearModelData (apaga ecbyts-session em IDB + 11 chaves modelo)
    try {
        const sm = await import('../storage/storageMonitor.js' as string);
        if (typeof sm.clearModelData === 'function') {
            await sm.clearModelData();
        }
        // Apaga explicitamente ecbyts-session para impedir restore em F5
        try {
            const idb = await import('../storage/idbStore.js' as string);
            if (typeof idb.idbDelete === 'function') {
                await idb.idbDelete('ecbyts-session');
            }
        } catch (e: any) {
            console.debug('[demo:deepClear:step8:idbSession]', e?.message || e);
        }
        console.debug('[demo:deepClear:step8] model data cleared');
    } catch (e: any) {
        console.debug('[demo:deepClear:step8]', e?.message || e);
    }
    console.debug('[demo:deepClear] complete');
}
// ----------------------------------------------------------------
// MODULE STATE
// Estado do modulo - closure privada
// ----------------------------------------------------------------
/**
 * @typedef {'mining'|'forestry'|'contamination'|'occupational_health'} DemoVertical
 * @typedef {'neural_net'|'ai_bot'|'satellite'} DemoModule
 * @typedef {'low'|'med'|'high'} RiskLevel
 *
 * @typedef {Object} DemoState
 * @property {boolean} active
 * @property {Object|null} currentCase
 * @property {number} currentStep
 * @property {string[]} createdElementIds
 * @property {string[]} createdTickerIds
 * @property {Object|null} savedCameraState
 * @property {boolean} isAnimating
 * @property {number} maxStepReached - Furthest step reached (for prev navigation)
 */
/** @type {DemoState} */
let state: any = createInitialState();
/** @type {Array<Object>} All 50 demo cases */
/** @type {any[]} */
let allCases: any = [];
/** @type {Function|null} UI refresh callback */
let requestUIRefresh: any = null;
/** @type {number|null} Active ticker simulation interval */
let tickerInterval: any = null;
function createInitialState() {
    return {
        active: false,
        currentCase: null,
        currentStep: -1,
        createdElementIds: [],
        createdTickerIds: [],
        savedCameraState: null,
        isAnimating: false,
        maxStepReached: -1,
    };
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize demo engine.
 * Busca cases do Supabase (async), com fallback local.
 */
export async function initDemo() {
    state = createInitialState();
    // Carrega fallback local imediato (cases custom: gee-rmsp-2024, etc.)
    const localCases = generateMockCases();
    allCases = localCases;
    try {
        const remoteCases = await fetchDemoCases();
        if (remoteCases.length > 0) {
            // Merge: Supabase remote + local cases que NAO estao no remote.
            // Antes substituia tudo, perdendo cases custom adicionados em
            // generateMockCases() (ex: gee-rmsp-2024 inventario GEE RMSP).
            const remoteIds = new Set(remoteCases.map((c: any) => c.id));
            const localOnly = localCases.filter((c: any) => !remoteIds.has(c.id));
            allCases = [...remoteCases, ...localOnly];
        }
    } catch (e: any) {
        console.warn('[Demo] Using fallback cases:', e?.message);
    }
}
/**
 * Inject UI refresh callback.
 * @param {Function} fn
 */
export function setDemoUpdateAllUI(fn: any) {
    requestUIRefresh = fn;
}
function requestDemoUIRefresh(reason = 'demo.changed') {
    if (typeof requestUIRefresh !== 'function')
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.DEMO,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.SCENE,
        UI_INVALIDATION_DOMAINS.TICKER,
        UI_INVALIDATION_DOMAINS.HOME,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
    ];
    for (const domain of domains) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// STATE ACCESS
// ----------------------------------------------------------------
/** @returns {DemoState} Current demo state */
export function getDemoState() {
    return { ...state };
}
/** @returns {boolean} Whether demo is active */
export function isActive() {
    return state.active;
}
/** @returns {Array<Object>} All cases */
export function getAllCases() {
    return allCases;
}
/**
 * Get cases filtered by vertical.
 * @param {DemoVertical} vertical
 * @returns {Array<Object>}
 */
export function getCasesByVertical(vertical: any) {
    return allCases.filter((c: any) => c.vertical === vertical);
}
/**
 * Get cases filtered by vertical and module.
 * @param {DemoVertical} vertical
 * @param {DemoModule} module
 * @returns {Array<Object>}
 */
export function getCasesByVerticalAndModule(vertical: any, module: any) {
    return allCases.filter((c: any) => c.vertical === vertical && c.module === module);
}
/**
 * Get a random case for a vertical (optionally filtered by module).
 * @param {DemoVertical} vertical
 * @param {DemoModule} [module]
 * @returns {Object|null}
 */
export function getRandomCase(vertical: any, module: any) {
    const pool = module ? getCasesByVerticalAndModule(vertical, module) : getCasesByVertical(vertical);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}
// ----------------------------------------------------------------
// DEMO LIFECYCLE
// ----------------------------------------------------------------
/**
 * Start demo with a specific case.
 * Salva estado atual, cria elementos do caso, e vai pro step 0.
 *
 * @param {string} caseId
 * @returns {Promise<boolean>} true if started successfully
 */
export async function startDemo(caseId: any) {
    const demoCase = allCases.find((c: any) => c.id === caseId);
    if (!demoCase) {
        showToast('Demo case not found', 'error');
        return false;
    }
    // Salva estado atual para restaurar depois
    state.savedCameraState = getCameraState();
    state.active = true;
    state.currentCase = demoCase;
    state.currentStep = -1;
    state.maxStepReached = -1;
    state.createdElementIds = [];
    state.createdTickerIds = [];
    // Dispatch customLoader (caso o demoCase declara loader dedicado para
    // bootstrap mais complexo que `elements[]`). Loaders ficam em
    // app/js/utils/demo/<name>.js e expoem função async chamada de acordo
    // com convenção `load<Name>()`. Ex: ghgRmspDemoLoader → loadGhgRmspDemo.
    const customLoaderName = demoCase.customLoader;
    if (typeof customLoaderName === 'string' && customLoaderName.length > 0) {
        // Se existe modelo carregado, perguntar se usuário quer criar novo
        // ou mesclar. Demos geográficos (RMSP) precisam de origem própria
        // para o shapefile importado centrar perto de (0,0,0).
        const existingCount = getAllElements().length;
        if (existingCount > 0) {
            try {
                const dlgMod = await import('../ui/asyncDialogs.js' as string);
                const createNew = await dlgMod.asyncConfirm(
                    `Você já possui ${existingCount} elementos carregados. ` +
                        `Este demo importa dados geográficos (município/área).\n\n` +
                        `Como deseja prosseguir?`,
                    {
                        confirmLabel: 'Criar novo modelo (zerar atual)',
                        cancelLabel: 'Adicionar ao modelo atual',
                    },
                );
                if (createNew) {
                    // SPEC_DEMO_NEW_MODEL_DEEP_CLEAR — limpeza profunda em 8 passos.
                    // Substitui clearAllElements bare que deixava state residual
                    // (campaigns, ticker, history, origin UTM stale, autosave session
                    // em IDB) e causava remix visual com random model em demos geo.
                    await deepClearForDemoTakeover();
                    showToast('Modelo zerado. Carregando demo...', 'info');
                }
            } catch (err: any) {
                console.warn('[demo:engine] dialog falhou, mesclando por default:', err?.message || err);
            }
        }
        try {
            const modPath = '/js/utils/demo/' + customLoaderName + '.js';
            const mod = await import(modPath);
            // Convenção: prefixo `load` + nome em PascalCase derivado do customLoader.
            const fnName =
                'load' + customLoaderName.charAt(0).toUpperCase() + customLoaderName.slice(1).replace(/Loader$/, '');
            const fn = mod[fnName] || mod.default || mod.load;
            if (typeof fn === 'function') {
                await fn(demoCase);
            } else {
                console.warn('[demo:engine] customLoader sem função exportada:', customLoaderName, fnName);
            }
        } catch (err: any) {
            console.warn('[demo:engine] customLoader falhou:', customLoaderName, err?.message || err);
            showToast('Demo loader falhou: ' + (err?.message || customLoaderName), 'warning');
        }
    }
    // Cria elementos iniciais do caso
    if (demoCase.elements && demoCase.elements.length > 0) {
        for (const elDef of demoCase.elements) {
            try {
                const el = addElement(elDef.family, elDef.id, elDef.name, elDef.data, elDef.meta || {});
                if (el) {
                    state.createdElementIds.push(el.id);
                }
            } catch (e: any) {
                console.warn('[Demo] Erro ao criar elemento:', e?.message);
            }
        }
    }
    // Anima camera para posicao inicial do caso
    if (demoCase.initialCamera) {
        await animateCameraState(demoCase.initialCamera, 1000);
    }
    // Dispara evento para UI
    window.dispatchEvent(new CustomEvent('demoChanged'));
    requestDemoUIRefresh('demo.started');
    // Avanca para o primeiro step
    await nextStep();
    return true;
}
/**
 * Advance to the next step.
 * @returns {Promise<boolean>}
 */
export async function nextStep() {
    if (!state.active || !state.currentCase) return false;
    if (state.isAnimating) return false;
    // Defensive: customLoader-only demos may not declare steps (FIELD-META-EXT
    // 2026-05-15 — individual-health demo). Treat missing/empty steps as
    // "loader completed, nothing to advance through" → silent no-op.
    const steps = state.currentCase.steps;
    if (!Array.isArray(steps) || steps.length === 0) {
        return false;
    }
    const nextIdx = state.currentStep + 1;
    if (nextIdx >= steps.length) {
        // Fim da demo - mostra toast de conclusao
        showToast('Demo completed! Click exit to return.', 'success', 0);
        return false;
    }
    state.currentStep = nextIdx;
    if (nextIdx > state.maxStepReached) {
        state.maxStepReached = nextIdx;
    }
    // Executa a acao do step
    await executeStep(steps[nextIdx]);
    window.dispatchEvent(new CustomEvent('demoChanged'));
    requestDemoUIRefresh('demo.next-step');
    return true;
}
/**
 * Go back to the previous step.
 * Restaura visual do step anterior.
 * @returns {Promise<boolean>}
 */
export async function prevStep() {
    if (!state.active || !state.currentCase) return false;
    if (state.isAnimating) return false;
    if (state.currentStep <= 0) return false;
    state.currentStep--;
    // Re-executa o step atual (restaura visual)
    const steps = state.currentCase.steps;
    await executeStep(steps[state.currentStep]);
    window.dispatchEvent(new CustomEvent('demoChanged'));
    requestDemoUIRefresh('demo.prev-step');
    return true;
}
/**
 * Exit demo mode, cleanup everything.
 * Remove elementos criados, restaura camera, limpa ticker.
 * @returns {Promise<void>}
 */
export async function exitDemo() {
    if (!state.active) return;
    state.isAnimating = true;
    // Para qualquer ticker simulation em andamento
    if (tickerInterval) {
        clearInterval(tickerInterval);
        tickerInterval = null;
    }
    // Remove heatmaps criados na demo
    removeAllHeatmaps();
    // Remove elementos criados pela demo (em ordem reversa)
    const idsToRemove = [...state.createdElementIds].reverse();
    for (const id of idsToRemove) {
        try {
            removeElement(id);
        } catch (e: any) {
            console.warn('[Demo] Erro ao remover elemento:', e?.message);
        }
    }
    // Limpa ticker logs da demo
    clearDemoTickerLogs();
    // Restaura camera
    if (state.savedCameraState) {
        await animateCameraState(state.savedCameraState, 600);
    }
    // Reseta estado
    state = createInitialState();
    window.dispatchEvent(new CustomEvent('demoChanged'));
    requestDemoUIRefresh('demo.exited');
    requestRender();
}
// ----------------------------------------------------------------
// STEP EXECUTION ENGINE
// Executa acoes visuais de cada step
// ----------------------------------------------------------------
/**
 * Execute a single step action.
 * Interpreta o tipo da acao e executa o efeito visual correspondente.
 *
 * @param {any} step - The step to execute
 */
async function executeStep(step: any) {
    state.isAnimating = true;
    try {
        // Delay opcional antes da acao
        if (step.delay && step.delay > 0) {
            await sleep(step.delay);
        }
        switch (step.action) {
            case 'camera':
                await executeCameraAction(step.params);
                break;
            case 'addElements':
                executeAddElements(step.params);
                break;
            case 'toggleLayer':
                executeToggleLayer(step.params);
                break;
            case 'simulateAI':
                await executeSimulateAI(step.params);
                break;
            case 'showToast':
                showToast(step.params.message, step.params.type || 'info', 0);
                break;
            case 'tickerLog':
                executeTicker(step.params);
                break;
            case 'highlight':
                executeHighlight(step.params);
                break;
            case 'heatmap':
                executeHeatmap(step.params);
                break;
            case 'composite':
                for (const subStep of step.params.actions) {
                    await executeStep(subStep);
                }
                break;
            default:
                console.warn(`[Demo] Acao desconhecida: ${step.action}`);
        }
        // Mostra descricao narrativa como toast se presente
        if (step.description) {
            showToast(step.description, 'info', 0);
        }
    } catch (e: any) {
        console.error('[Demo] Erro ao executar step:', e);
    } finally {
        state.isAnimating = false;
    }
}
// ----------------------------------------------------------------
// ACTION EXECUTORS
// Implementacao de cada tipo de acao
// ----------------------------------------------------------------
/** @param {any} params */
async function executeCameraAction(params: any) {
    if (params.target) {
        await animateCameraState(params.target, params.duration || 800);
    }
}
/** @param {any} params */
function executeAddElements(params: any) {
    if (!params.elements) return;
    for (const elDef of params.elements) {
        try {
            const el = addElement(elDef.family, elDef.id, elDef.name, elDef.data, elDef.meta || {});
            if (el) {
                state.createdElementIds.push(el.id);
            }
        } catch (e: any) {
            console.warn('[Demo] Erro ao criar elemento no step:', e?.message);
        }
    }
    requestRender();
}
/** @param {any} params */
function executeToggleLayer(params: any) {
    // Usa import dinamico para evitar dependencia circular
    import('../../core/elements/manager.js' as string).then(({setElementVisibility }: any) => {
        if (params.elementId) {
            setElementVisibility(params.elementId, params.visible !== false);
        }
        requestRender();
    }).catch((e: any) => console.debug('[demo:engine:lazy-manager:silent-catch]', e?.message || e));
}
/** @param {any} params */
async function executeSimulateAI(params: any) {
    const logs = params.logs || [];
    const duration = params.duration || 3000;
    // Mostra logs no ticker com efeito sequencial
    if (logs.length > 0) {
        await simulateTickerSequence(logs, Math.floor(duration / logs.length));
    }
    // Efeito de glow no elemento alvo (se especificado)
    if (params.glowTarget) {
        executeHighlight({ elementId: params.glowTarget, duration: 2000 });
    }
}
/** @param {any} params */
function executeTicker(params: any) {
    if (params.logs) {
        addDemoTickerLogs(params.logs);
    }
}
/** @param {any} params */
function executeHighlight(params: any) {
    if (!params.elementId) return;
    // Busca mesh do elemento e aplica efeito pulsante
    import('../../core/elements/manager.js' as string).then(({getMeshByElementId }: any) => {
        const mesh = getMeshByElementId(params.elementId);
        if (!mesh) return;
        const originalEmissive = mesh.material?.emissive?.clone();
        const originalIntensity = mesh.material?.emissiveIntensity || 0;
        const dur = params.duration || 2000;
        if (mesh.material && mesh.material.emissive) {
            mesh.material.emissive.setHex(params.color ? parseInt(params.color.replace('#', ''), 16) : 0x44ff44);
            mesh.material.emissiveIntensity = 0.5;
            requestRender();
            setTimeout(() => {
                if (originalEmissive) mesh.material.emissive.copy(originalEmissive);
                mesh.material.emissiveIntensity = originalIntensity;
                requestRender();
            }, dur);
        }
    }).catch((e: any) => console.debug('[demo:engine:lazy-mesh:silent-catch]', e?.message || e));
}
/** @param {any} params */
function executeHeatmap(params: any) {
    if (params.grid) {
        createHeatmapGrid(params);
    }
    if (params.routes) {
        createWorkerRoutes(params.routes);
    }
    requestRender();
}
// ----------------------------------------------------------------
// UTILITIES
// ----------------------------------------------------------------
/** @param {number} ms */
function sleep(ms: any) {
    return new Promise((resolve: any) => setTimeout(resolve, ms));
}
