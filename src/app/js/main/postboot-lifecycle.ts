// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface PostbootLifecycleDependencies {
    destroyBroadcastSync: () => void;
    documentRef: Document;
    hasPendingSave: () => boolean;
    initBroadcastSync: () => void;
    initDisclaimer: () => void;
    initFineScenarioConsoleLazy: () => Promise<unknown>;
    initPerfHud: () => void;
    isSceneReady: () => boolean;
    maybeInitApiBridgeLazy: () => Promise<unknown>;
    registerPerfMonitorBridge: (args: { togglePerfHud: (visible: boolean) => void }) => void;
    runRandomPostbootSequence: (args: {
        loadedFromURL: unknown;
        initConfig: (config: unknown) => void;
        initCallId: (id: unknown) => void;
        updateLoading: (state: unknown) => void;
        translate: (key: string) => string;
        restoreInitForm: () => void;
        stopLoadingTips: () => void;
        setSaveStatus: (status: unknown) => void;
        showToast: (message: string) => void;
    }) => Promise<void>;
    scheduleOptionalUiBootstrapsLazy: () => void;
    scheduleIdlePreloadsLazy: () => void;
    scheduleScreenshotPrewarmLazy: () => void;
    warmupSaoNnLazy: () => void;
    setTickerBarVisible: (visible: boolean) => void;
    setupBroadcastListeners: (args: {
        hasPendingSave: () => boolean;
        requestUIRefresh: (domain?: string, reason?: string) => void;
    }) => void;
    togglePerfHud: (visible: boolean) => void;
    requestUIRefresh: (domain?: string, reason?: string) => void;
    updateLoading: (state: unknown) => void;
    windowRef: Window;
    getTickerConfig: () => { visible: boolean };
    animate: () => void;
    initConfig: (config: unknown) => void;
    initCallId: (id: unknown) => void;
    loadedFromURL: unknown;
    restoreInitForm: () => void;
    setSaveStatus: (status: unknown) => void;
    showToast: (message: string) => void;
    stopLoadingTips: () => void;
    translate: (key: string) => string;
}

export async function runPostbootLifecycleSequence(deps: PostbootLifecycleDependencies): Promise<void> {
    const {
        destroyBroadcastSync,
        documentRef,
        hasPendingSave,
        initBroadcastSync,
        initDisclaimer,
        initFineScenarioConsoleLazy,
        initPerfHud,
        isSceneReady,
        maybeInitApiBridgeLazy,
        registerPerfMonitorBridge,
        runRandomPostbootSequence,
        scheduleOptionalUiBootstrapsLazy,
        scheduleIdlePreloadsLazy,
        scheduleScreenshotPrewarmLazy,
        warmupSaoNnLazy,
        setTickerBarVisible,
        setupBroadcastListeners,
        togglePerfHud,
        requestUIRefresh,
        updateLoading,
        windowRef,
        getTickerConfig,
        animate,
        initConfig,
        initCallId,
        loadedFromURL,
        restoreInitForm,
        setSaveStatus,
        showToast,
        stopLoadingTips,
        translate,
    } = deps;

    initBroadcastSync();
    setupBroadcastListeners({
        hasPendingSave,
        requestUIRefresh,
    });
    windowRef.addEventListener('pagehide', destroyBroadcastSync);

    if (getTickerConfig().visible) setTickerBarVisible(true);
    if (isSceneReady()) animate();

    initPerfHud();
    registerPerfMonitorBridge({ togglePerfHud });
    initDisclaimer();
    await maybeInitApiBridgeLazy();
    await initFineScenarioConsoleLazy();

    await runRandomPostbootSequence({
        loadedFromURL,
        initConfig,
        initCallId,
        updateLoading,
        translate,
        restoreInitForm,
        stopLoadingTips,
        setSaveStatus,
        showToast,
    });

    // LOADING-PERF GAP-2: warm-up de SAO/NN em background (idle), fora do caminho
    // crítico — pronto antes do 1º clique sem custar TTI (ver lazy-registry).
    warmupSaoNnLazy();
    scheduleOptionalUiBootstrapsLazy();
    scheduleScreenshotPrewarmLazy();
    scheduleIdlePreloadsLazy();

    const loadingOverlay = documentRef.getElementById('loading-overlay');
    if (!loadingOverlay) {
        stopLoadingTips();
    }
}
