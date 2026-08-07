// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { generateRandomModel } from '../core/elements/manager.js';
import { runRandomOrchestratorV2 } from '../core/random/orchestrator.js';
import { initLastLocationMode, initLastProjectMode, initMapPickerMode } from './startup-modes.js';

/** Config de inicialização lido do localStorage (getInitConfig em main.js). */
export interface RandomBootInitConfig {
    mode: 'random' | 'lastLocation' | 'lastProject' | 'mapPicker' | 'blank' | string;
    resumeOnRandom?: boolean;
}
/**
 * Bag de dependências injetadas pelo main.ts. Assinaturas amplas (`unknown`)
 * porque este módulo só ORQUESTRA os callbacks — a validação de forma real
 * já acontece nos módulos-fonte (core/elements/manager.js, io/import.js etc).
 */
export interface RandomBootDeps {
    loadedFromURL: boolean;
    initConfig: RandomBootInitConfig;
    initCallId: string | number;
    updateLoading: (msg: string, pct: number) => void;
    applyModel: (model: unknown) => Promise<unknown>;
    clearModelData: () => Promise<unknown>;
    clearIssues: () => void;
    clearAllLabels: () => void;
    clearHistory: () => void;
    setHomePreparingRandom: (value: boolean) => void;
    setBootPreparing: (value: boolean) => void;
    getModelId: () => Promise<unknown>;
    showToast: (msg: string, kind?: string) => void;
    translate: (key: string) => string;
    documentRef: Document;
    localStorageRef: Storage;
    updateGlobe: (...args: unknown[]) => unknown;
    skipRandomBootForTrainingDeepLink: boolean;
}
export interface RandomBootResult {
    showRandomBootState: boolean;
}
/** Sessão persistida em IDB (ecbyts-session) — shape mínimo consumido aqui. */
interface SavedBootSession {
    _uiState?: {
        panelLayout?: unknown;
        barsLayout?: unknown;
        constellationHeight?: unknown;
        constellationCollapsed?: unknown;
        tabLayout?: unknown;
        viewMode?: string;
    };
    [key: string]: unknown;
}
/** Checa o flag global de demo-takeover (SPEC_DEMO_NEW_MODEL_DEEP_CLEAR). */
function isDemoTakeoverActive(): boolean {
    const bootWindow = (typeof window !== 'undefined' ? window : {}) as Window & { __demoTakeover?: { active?: boolean; until?: number } };
    const takeover = bootWindow.__demoTakeover;
    return !!(takeover && takeover.active === true && typeof takeover.until === 'number' && takeover.until > Date.now());
}
/** Busca sessão salva em IDB, respeitando o demo-takeover ativo (não restaura nesse caso). */
async function loadSavedBootSession(): Promise<SavedBootSession | null> {
    if (isDemoTakeoverActive()) {
        console.debug('[ecbyts:init] random:session-restore-skipped (demo takeover active)');
        return null;
    }
    const { idbGet } = await import('../utils/storage/idbStore.js' as string);
    return (await idbGet('ecbyts-session')) as SavedBootSession | null;
}
/** setItem tolerante a falha (quota/permissão) — usado só para valores string simples. */
function safeLocalStorageSet(localStorageRef: Storage, key: string, value: unknown): void {
    try {
        if (value != null)
            localStorageRef.setItem(key, String(value));
    }
    catch (e: unknown) {
        console.debug('[random-boot] lsSet:', (e as Error)?.message || e);
    }
}
/** Restaura o layout de UI (paineis/tabs/view-mode) persistido junto da sessão salva. */
async function restoreSessionUiState(ui: NonNullable<SavedBootSession['_uiState']>, localStorageRef: Storage): Promise<void> {
    safeLocalStorageSet(localStorageRef, 'ecbyts-panel-layout', ui.panelLayout);
    safeLocalStorageSet(localStorageRef, 'ecbyts-bars-layout', ui.barsLayout);
    safeLocalStorageSet(localStorageRef, 'ecbyts-constellation-height', ui.constellationHeight);
    safeLocalStorageSet(localStorageRef, 'ecbyts-constellation-collapsed', ui.constellationCollapsed);
    safeLocalStorageSet(localStorageRef, 'ecbyts-tab-layout', ui.tabLayout);
    if (!ui.viewMode) return;
    try {
        localStorageRef.setItem('ecbyts-view-mode', ui.viewMode);
        localStorageRef.setItem('ecbyts-default-view', ui.viewMode);
    }
    catch (e: unknown) {
        console.debug('[random-boot] viewMode-persist:', (e as Error)?.message || e);
    }
    const { setViewMode } = await import('../utils/scene/controls.js' as string);
    setViewMode(ui.viewMode);
}
/**
 * Tenta restaurar a sessão salva (applyModel + layout de UI). Em caso de falha,
 * limpa a sessão persistida em IDB e sinaliza para o caller cair no fresh-boot.
 * Retorna a sessão restaurada (truthy = sucesso) ou null (sem sessão / falhou).
 */
async function tryResumeSavedSession(
    savedSession: SavedBootSession,
    applyModel: RandomBootDeps['applyModel'],
    localStorageRef: Storage,
): Promise<SavedBootSession | null> {
    try {
        await applyModel(savedSession);
        const ui = savedSession._uiState;
        if (ui) await restoreSessionUiState(ui, localStorageRef);
        return savedSession;
    }
    catch (e: unknown) {
        console.warn('[Session] Falha ao restaurar sessão:', (e as Error)?.message || e);
        const { idbDelete } = await import('../utils/storage/idbStore.js' as string);
        await idbDelete('ecbyts-session');
        return null;
    }
}
/** Gera um modelo random do zero (limpa estado atual + orquestra a geração). */
async function runFreshRandomBoot(deps: {
    initCallId: string | number;
    updateLoading: RandomBootDeps['updateLoading'];
    clearModelData: RandomBootDeps['clearModelData'];
    clearIssues: RandomBootDeps['clearIssues'];
    clearAllLabels: RandomBootDeps['clearAllLabels'];
    clearHistory: RandomBootDeps['clearHistory'];
    setHomePreparingRandom: RandomBootDeps['setHomePreparingRandom'];
    setBootPreparing: RandomBootDeps['setBootPreparing'];
}): Promise<void> {
    const { initCallId, updateLoading, clearModelData, clearIssues, clearAllLabels, clearHistory, setHomePreparingRandom, setBootPreparing } = deps;
    console.debug('[ecbyts:init] random:fresh-boot:start', { callId: initCallId });
    setHomePreparingRandom(true);
    setBootPreparing(true);
    await clearModelData();
    clearIssues();
    clearAllLabels();
    clearHistory();
    const { buildFullRandomModel } = await import('../utils/handlers/elements.js' as string);
    await runRandomOrchestratorV2({
        source: 'boot-random',
        selectedFamilies: null,
        options: {},
        onProgress: (pct: number, msg: string) => updateLoading(msg, pct),
        generateRandomModelFn: generateRandomModel,
        buildFullRandomModelFn: buildFullRandomModel,
    });
    console.debug('[ecbyts:init] random:fresh-boot:finish', { callId: initCallId });
}
/** Modo 'random': tenta resumir sessão salva; se não houver/falhar, gera fresh boot. */
async function runRandomMode(deps: RandomBootDeps): Promise<boolean> {
    const { initConfig, initCallId, applyModel, localStorageRef } = deps;
    console.debug('[ecbyts:init] random:entry', {
        callId: initCallId,
        resumeOnRandom: initConfig.resumeOnRandom === true,
    });
    let savedSession: SavedBootSession | null = null;
    if (initConfig.resumeOnRandom === true) {
        savedSession = await loadSavedBootSession();
    }
    if (savedSession) {
        savedSession = await tryResumeSavedSession(savedSession, applyModel, localStorageRef);
    }
    if (savedSession) return false;
    await runFreshRandomBoot(deps);
    return true;
}
export async function runRandomBootSequence(deps: RandomBootDeps): Promise<RandomBootResult> {
    const { loadedFromURL, initConfig, applyModel, clearModelData, getModelId, showToast, translate, documentRef, localStorageRef, updateGlobe, skipRandomBootForTrainingDeepLink } = deps;
    let showRandomBootState = false;
    if (!loadedFromURL && initConfig.mode === 'random' && skipRandomBootForTrainingDeepLink === true) {
        console.debug('[ecbyts:init] random:skipped-for-training-deeplink', { callId: deps.initCallId });
        await getModelId();
    }
    else if (!loadedFromURL && initConfig.mode === 'random') {
        showRandomBootState = await runRandomMode(deps);
    }
    else if (!loadedFromURL && initConfig.mode === 'lastLocation') {
        await initLastLocationMode({
            documentRef,
            localStorageRef,
            translate,
            showToast,
            getModelId,
            updateGlobe,
        });
    }
    else if (!loadedFromURL && initConfig.mode === 'lastProject') {
        await initLastProjectMode({
            translate,
            showToast,
            getModelId,
            clearModelData,
            applyModel,
        });
    }
    else if (!loadedFromURL && initConfig.mode === 'mapPicker') {
        await initMapPickerMode({
            documentRef,
            localStorageRef,
            translate,
            showToast,
            getModelId,
            updateGlobe,
        });
    }
    else if (!loadedFromURL) {
        await getModelId();
        // T7.3 (SPEC_COMMERCIAL_READINESS_DOD): "Blank Project" caía numa cena
        // 3D vazia sem guia visual. Mostra um hint discreto e dispensável com
        // próximos passos clicáveis (persistência de dispensa em localStorage).
        if (initConfig.mode === 'blank') {
            try {
                const { showBlankSceneHint } = await import('../utils/ui/blankSceneHint.js' as string);
                showBlankSceneHint(documentRef);
            }
            catch (e: unknown) {
                console.debug('[random-boot] blank-hint:', e instanceof Error ? e.message : e);
            }
        }
    }
    return { showRandomBootState };
}
