// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

import { UI_INVALIDATION_DOMAINS, createUIInvalidationRegistry } from './uiInvalidationRegistry.js';
import { logNetworkAware } from '../utils/helpers/_offlineAwareLogPure.js';

const SESSION_SAVE_DEBOUNCE_MS = 3000;
const SESSION_SAVE_BOOT_DEFER_MS = 12000;
const SESSION_SAVE_IDLE_TIMEOUT_MS = 3000;

/**
 * @param {any} deps
 */
export function createRuntimeState({ buildModel, configFeatures, documentRef, getCameraState, getCurrentCloudModelId, getCurrentUser, getLastSyncReloadTs, getModelIdSync, getOpenBountyCount, getPerfMonitor, getRenderer, getSelectedElement, getSyncReloadCooldownMs, getTickerConfig, isHomeViewActive, isSceneReady, localStorageRef, performanceRef, pushSnapshot, rebuildGridRows, renderAreasTree, renderCorporateIO, renderCostAnalysisTab, renderEquipmentHud, renderFilesPanel, renderGovernanceTab, renderHomeGrid, renderHudCards, renderInspector, renderPipelineManagerTab, renderProjectAreas, renderSensorCenterTab, renderTicker, requestAnimationFrameRef, safeSetItem, setSaveStatus, setTickerBarVisible, updateAnalyticsData, updateAuthUI, updateBountyBadge, updateCampaignsList, updateConstellation, updateCostHudBadge, updateEcbtHudBadge, updateEdgePanel, updateElementDetails, updateElementsList, updateFamiliesList, updateScenesList, updateStampPanel, updateStatusBar, updateViolationsHud, wakeRenderLoop }: any) {
    // Expose updateViolationsHud globally so domain-driven invalidator can call.
    if (typeof window !== 'undefined' && typeof updateViolationsHud === 'function') {
        (window as any).updateViolationsHud = updateViolationsHud;
    }
    let sessionSaveTimer: any = null;
    let sessionSaveIdleHandle: any = null;
    let sessionSaveLifecycleBound = false;
    let cameraSaveTimer: any = null;
    let cloudAutosaveInFlight = false;
    const uiInvalidationRegistry = createUIInvalidationRegistry({
        scheduleFlush: () => requestAnimationFrameRef(runUIUpdates),
    });
    function captureAutosaveThumbnail() {
        try {
            const source = getRenderer()?.domElement ?? null;
            if (!source || source.width < 2 || source.height < 2)
                return null;
            const thumb = documentRef.createElement('canvas');
            thumb.width = 320;
            thumb.height = 180;
            const ctx = thumb.getContext('2d');
            if (!ctx)
                return null;
            ctx.drawImage(source, 0, 0, thumb.width, thumb.height);
            return thumb.toDataURL('image/jpeg', 0.58);
        }
        catch ( /** @type {any} */e) {
            console.debug('[runtime-lifecycle] thumbDraw:', (e as any)?.message || e);
            return null;
        }
    }
    function scheduleCloudAutosave(sessionModel: any) {
        if (!sessionModel || cloudAutosaveInFlight)
            return;
        if (!getCurrentUser())
            return;
        cloudAutosaveInFlight = true;
        const thumbnailDataUrl = captureAutosaveThumbnail();
        const modelId = typeof getCurrentCloudModelId === 'function' ? getCurrentCloudModelId() : null;
        const scopeKey = modelId ? `cloud:${modelId}` : 'local:session';
        import('../utils/cloud/manager.js' as string)
            .then((mod) => mod.autosaveModelSnapshot({
            modelData: sessionModel,
            modelId,
            scopeKey,
            thumbnailDataUrl,
            force: false,
        }))
            .then((saved) => {
            if (saved && document.visibilityState === 'visible') {
                setSaveStatus('saved', 'Salvo (Supabase x5)');
            }
        })
            .catch((err) => {
            // Offline-aware (BUG-019 drain): autosave falha offline = esperado
            // (banner do mascote já informa) → debug, fora da telemetria.
            logNetworkAware(console, err, ['[Session] Cloud autosave skipped:', (err as any)?.message || err]);
        })
            .finally(() => {
            cloudAutosaveInFlight = false;
        });
    }
    function getSessionSaveDelayMs() {
        const readyAt = (globalThis as any).__ecbyts_appReadyAt;
        return Number.isFinite(readyAt) ? SESSION_SAVE_DEBOUNCE_MS : SESSION_SAVE_BOOT_DEFER_MS;
    }
    function clearSessionSaveSchedule() {
        if (sessionSaveTimer) {
            clearTimeout(sessionSaveTimer);
            sessionSaveTimer = null;
        }
        const cancelIdle = (globalThis as any).cancelIdleCallback;
        if (sessionSaveIdleHandle != null && typeof cancelIdle === 'function') {
            cancelIdle(sessionSaveIdleHandle);
        }
        sessionSaveIdleHandle = null;
    }
    async function persistSessionNow() {
        try {
            const { idbSet } = await import('../utils/storage/idbStore.js' as string);
            const { getViewMode } = await import('../utils/scene/controls.js' as string);
            const session = buildModel();
            session._uiState = {
                viewMode: getViewMode(),
                panelLayout: localStorageRef.getItem('ecbyts-panel-layout'),
                barsLayout: localStorageRef.getItem('ecbyts-bars-layout'),
                constellationHeight: localStorageRef.getItem('ecbyts-constellation-height'),
                constellationCollapsed: localStorageRef.getItem('ecbyts-constellation-collapsed'),
                tabLayout: localStorageRef.getItem('ecbyts-tab-layout'),
            };
            const saved = await idbSet('ecbyts-session', session);
            if (saved && Date.now() - getLastSyncReloadTs() > getSyncReloadCooldownMs()) {
                safeSetItem('ecbyts-session-saved-at', String(Date.now()));
                const { broadcastChange } = await import('../utils/storage/broadcastSync.js' as string);
                broadcastChange('model:changed');
                setSaveStatus('saved');
                scheduleCloudAutosave(session);
            }
            else if (!saved) {
                setSaveStatus('failed');
            }
        }
        catch ( /** @type {any} */e) {
            console.warn('[Session] Auto-save falhou:', (e as any)?.message || e);
            setSaveStatus('failed');
        }
    }
    function scheduleSessionSaveIdleFlush() {
        const requestIdle = (globalThis as any).requestIdleCallback;
        if (typeof requestIdle === 'function') {
            sessionSaveIdleHandle = requestIdle(() => {
                sessionSaveIdleHandle = null;
                void persistSessionNow();
            }, { timeout: SESSION_SAVE_IDLE_TIMEOUT_MS });
            return;
        }
        void persistSessionNow();
    }
    function bindSessionSaveLifecycleFlush() {
        if (sessionSaveLifecycleBound || typeof window === 'undefined')
            return;
        const flushPending = () => {
            if (!sessionSaveTimer && sessionSaveIdleHandle == null)
                return;
            clearSessionSaveSchedule();
            void persistSessionNow();
        };
        window.addEventListener('pagehide', flushPending);
        if (typeof documentRef?.addEventListener === 'function') {
            documentRef.addEventListener('visibilitychange', () => {
                if (documentRef.visibilityState === 'hidden')
                    flushPending();
            });
        }
        sessionSaveLifecycleBound = true;
    }
    function scheduleSessionSave() {
        clearSessionSaveSchedule();
        bindSessionSaveLifecycleFlush();
        if (configFeatures.FIRST_JOURNEY_SAVE_STATUS)
            setSaveStatus('saving');
        sessionSaveTimer = window.setTimeout(() => {
            sessionSaveTimer = null;
            scheduleSessionSaveIdleFlush();
        }, getSessionSaveDelayMs());
    }
    async function refreshGeoLayers() {
        const [interpMod, elementsMod, overlayRuntime, overlayMod] = await Promise.all([
            import('../core/interpolation/manager.js' as string),
            import('../core/elements/manager.js' as string),
            import('../core/elements/boundaryOverlayRuntime.js' as string),
            import('../core/io/geo/overlayUrls.js' as string),
        ]);
        await interpMod.refreshAutoTerrainLayer();
        const boundary = /** @type {{ data: { vertices: Array<{ x?: unknown, z?: unknown }>, overlayUrl?: string } } | undefined} */ (elementsMod
            .getAllElements()
            .find((e: any) => e.family === 'boundary' &&
            Array.isArray(e.data?.vertices) &&
            e.data.vertices.length >= 3 &&
            !e.data.overlayUrl?.startsWith('data:')));
        if (!boundary)
            return;
        const vertices = boundary.data.vertices;
        const xs = vertices.map((v: any) => Number(v.x) || 0);
        const zs = vertices.map((v: any) => Number(v.z) || 0);
        const halfW = Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2);
        const halfL = Math.max(1, (Math.max(...zs) - Math.min(...zs)) / 2);
        const { overlayUrl, overlayFallbackUrls } = await overlayMod.buildOverlayUrls(halfW, halfL);
        await overlayRuntime.applyBoundaryOverlayUrls(boundary, [overlayUrl, ...overlayFallbackUrls], {
            persistData: true,
        });
    }
    function scheduleCameraSave() {
        clearTimeout(cameraSaveTimer);
        cameraSaveTimer = window.setTimeout(() => {
            try {
                const state = getCameraState();
                if (state)
                    safeSetItem('ecbyts-camera-state', JSON.stringify(state));
            }
            catch ( /** @type {any} */e) {
                console.debug('[runtime-lifecycle] cameraSave:', (e as any)?.message || e);
            }
        }, 1000);
    }
    function updateBountyStatusbar() {
        const el = documentRef.getElementById('status-bounties');
        if (!el)
            return;
        const count = getOpenBountyCount();
        el.textContent = count > 0 ? `${count} ● bounties` : '';
    }
    function updateModelIdDisplay() {
        const id = getModelIdSync();
        const badge = documentRef.getElementById('model-id-badge');
        if (badge)
            badge.textContent = id || '—';
        const statusEl = documentRef.getElementById('status-model-id');
        if (statusEl)
            statusEl.textContent = id ? `ID: ${id}` : '';
    }
    function shouldRecordUIUpdateEvent() {
        if (typeof window === 'undefined') return false;
        if (Array.isArray((window as any).__ecbytsUiUpdateEvents)) return true;
        if ((window as any).__perfRouteVitals || (window as any).__ecbytsWebVitalsFieldMonitor) return true;
        try {
            return localStorageRef.getItem('ecbyts-perf-debug') === 'true';
        }
        catch (_e) {
            return false;
        }
    }
    function recordUIUpdateEvent(label: string, startTime: number, success: boolean, error: any = null) {
        if (!shouldRecordUIUpdateEvent()) return;
        const event = {
            label,
            startTime: Math.round(startTime),
            duration: Math.round(performanceRef.now() - startTime),
            success,
            error: error ? String(error?.message || error).slice(0, 120) : '',
        };
        const current = Array.isArray((window as any).__ecbytsUiUpdateEvents)
            ? (window as any).__ecbytsUiUpdateEvents
            : [];
        (window as any).__ecbytsUiUpdateEvents = [...current, event]
            .sort((a: any, b: any) => Number(b?.duration || 0) - Number(a?.duration || 0))
            .slice(0, 80);
    }
    function runUIUpdates() {
        const invalidation = uiInvalidationRegistry.consumePending();
        const domains = new Set(invalidation.domains);
        const D = UI_INVALIDATION_DOMAINS;
        const shouldRun = (...targetDomains: string[]) => {
            return invalidation.hasFull || targetDomains.some((domain) => domains.has(domain as any));
        };
        const t0 = performanceRef.now();
        getPerfMonitor().tickUIUpdate();
        if (isSceneReady())
            wakeRenderLoop();
        const isTabVisible = (id: any) => {
            const el = documentRef.getElementById(id);
            return el && el.style.display !== 'none';
        };
        const updates = [
            { label: 'status-bar', domains: [D.STATUS, D.AUTH, D.MODEL, D.LIBRARIES, D.NN, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY], fn: updateStatusBar },
            { label: 'auth-ui', domains: [D.AUTH], fn: updateAuthUI },
            { label: 'model-id-display', domains: [D.STATUS, D.MODEL], fn: updateModelIdDisplay },
            { label: 'home-grid', domains: [D.HOME, D.AUTH, D.MODEL, D.LIBRARIES, D.NN, D.HISTORY], fn: () => {
                if (isHomeViewActive())
                    renderHomeGrid();
            } },
            { label: 'families-list', domains: [D.LISTS, D.MODEL, D.HIERARCHY, D.INTERPOLATION], fn: updateFamiliesList },
            { label: 'project-areas', domains: [D.LISTS, D.MODEL, D.HIERARCHY, D.INTERPOLATION], fn: renderProjectAreas },
            { label: 'corporate-io', domains: [D.LISTS, D.MODEL, D.HIERARCHY, D.INTERPOLATION], fn: renderCorporateIO },
            { label: 'constellation', domains: [D.SCENE, D.MODEL, D.HIERARCHY, D.INTERPOLATION, D.BOREHOLE, D.HISTORY], fn: () => {
                if (isSceneReady())
                    updateConstellation(getSelectedElement());
            } },
            { label: 'elements-tab', domains: [D.LISTS, D.SCENE, D.MODEL, D.ELEMENT_LIST, D.HIERARCHY, D.INTERPOLATION, D.BOREHOLE, D.HISTORY], fn: () => {
                if (isTabVisible('tab-elements')) {
                    updateElementsList();
                    updateElementDetails();
                }
            } },
            { label: 'sensor-tab', domains: [D.LISTS, D.MODEL, D.SENSOR], fn: () => {
                if (isTabVisible('tab-sensors'))
                    renderSensorCenterTab();
            } },
            { label: 'campaigns-tab', domains: [D.LISTS, D.MODEL], fn: () => {
                if (isTabVisible('tab-campaigns'))
                    updateCampaignsList();
            } },
            { label: 'scenes-tab', domains: [D.LISTS, D.MODEL], fn: () => {
                if (isTabVisible('tab-scenes'))
                    updateScenesList();
            } },
            { label: 'areas-tab', domains: [D.LISTS, D.MODEL], fn: () => {
                if (isTabVisible('tab-areas'))
                    renderAreasTree();
            } },
            { label: 'stamp-panel', domains: [D.LISTS, D.SCENE, D.MODEL], fn: () => {
                if (isTabVisible('tab-stamps'))
                    updateStampPanel(getSelectedElement());
            } },
            { label: 'governance-tab', domains: [D.LISTS, D.MODEL], fn: () => {
                if (isTabVisible('tab-governance'))
                    renderGovernanceTab();
            } },
            { label: 'cost-analysis-tab', domains: [D.LISTS, D.ANALYTICS, D.MODEL], fn: () => {
                if (isTabVisible('tab-cost-analysis'))
                    renderCostAnalysisTab();
            } },
            { label: 'pipeline-manager-tab', domains: [D.LISTS, D.MODEL, D.LIBRARIES, D.PIPELINES], fn: () => {
                if (isTabVisible('tab-automation'))
                    renderPipelineManagerTab();
            } },
            { label: 'files-panel', domains: [D.LISTS, D.MODEL, D.LIBRARIES, D.FILES], fn: () => {
                if (isTabVisible('tab-files')) {
                    renderFilesPanel().catch((e: any) => console.error('[Files] render failed:', e));
                }
            } },
            { label: 'edge-panel', domains: [D.SCENE, D.MODEL, D.INTERPOLATION], fn: () => updateEdgePanel(getSelectedElement()) },
            { label: 'ticker', domains: [D.TICKER, D.MODEL, D.HISTORY], fn: () => {
                const cfg = getTickerConfig();
                const bar = documentRef.getElementById('ticker-bar');
                if (bar)
                    bar.style.display = cfg.visible ? '' : 'none';
                if (cfg.visible) {
                    renderTicker();
                    rebuildGridRows();
                    setTickerBarVisible(true);
                }
            } },
            { label: 'eis-status-badge', domains: [D.STATUS, D.ANALYTICS, D.MODEL, D.LIBRARIES, D.NN, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY, D.VALIDATION], fn: () => {
                if (window.updateEisStatusBadge)
                    window.updateEisStatusBadge();
            } },
            { label: 'cost-hud-badge', domains: [D.STATUS, D.ANALYTICS, D.MODEL, D.LIBRARIES, D.NN, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY, D.VALIDATION], fn: updateCostHudBadge },
            { label: 'ecbt-hud-badge', domains: [D.STATUS, D.ANALYTICS, D.MODEL, D.LIBRARIES, D.NN, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY, D.VALIDATION], fn: updateEcbtHudBadge },
            { label: 'violations-hud', domains: [D.STATUS, D.ANALYTICS, D.MODEL, D.VALIDATION], fn: () => {
                if (typeof window.updateViolationsHud === 'function') window.updateViolationsHud();
            } },
            { label: 'bounty-badge-statusbar', domains: [D.STATUS, D.MODEL], fn: () => {
                if (isTabVisible('tab-bounty'))
                    updateBountyBadge();
                updateBountyStatusbar();
            } },
            { label: 'hud-cards', domains: [D.SCENE, D.ANALYTICS, D.MODEL, D.INTERPOLATION, D.LIBRARIES, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY], fn: renderHudCards },
            { label: 'equipment-hud', domains: [D.SCENE, D.MODEL], fn: renderEquipmentHud },
            { label: 'inspector', domains: [D.INSPECTOR, D.SCENE, D.MODEL, D.ELEMENT_LIST, D.HIERARCHY, D.INTERPOLATION, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY, D.VALIDATION], fn: renderInspector },
            { label: 'analytics-data', domains: [D.ANALYTICS, D.MODEL, D.HIERARCHY, D.INTERPOLATION, D.LIBRARIES, D.NN, D.SENSOR, D.CONSTANTS, D.BOREHOLE, D.HISTORY, D.VALIDATION], fn: updateAnalyticsData },
            { label: 'snapshot', domains: Object.values(D), fn: pushSnapshot },
        ];
        updates.filter((task: any) => shouldRun(...task.domains)).forEach((task: any) => {
            const taskStart = performanceRef.now();
            try {
                task.fn();
                recordUIUpdateEvent(task.label || task.fn.name || 'anonymous', taskStart, true);
            }
            catch ( /** @type {any} */e) {
                recordUIUpdateEvent(task.label || task.fn.name || 'anonymous', taskStart, false, e);
                console.error(`[UI] Erro em ${task.fn.name || 'anonymous'}:`, e);
            }
        });
        const dt = performanceRef.now() - t0;
        const perfDebug = typeof localStorageRef !== 'undefined' && localStorageRef.getItem('ecbyts-perf-debug') === 'true';
        // Telemetry drain (claude - bug 2026-06-14): diagnóstico de perf opt-in
        // (gated por ecbyts-perf-debug + dt>32ms) NÃO é erro — era console.warn e
        // o reporter ingere warn/error → poluía telemetry_errors (~92 linhas).
        // console.debug fica visível no console verbose do dev mas não vira erro.
        if (perfDebug && dt > 32)
            console.debug(`[UI] updateAllUI took ${dt.toFixed(1)}ms`);
        scheduleSessionSave();
    }
    function invalidateUI(domain = UI_INVALIDATION_DOMAINS.FULL, reason = 'manual') {
        uiInvalidationRegistry.invalidate(domain, reason);
    }
    function updateAllUI() {
        invalidateUI(UI_INVALIDATION_DOMAINS.FULL, 'updateAllUI');
    }
    return {
        hasPendingSessionSave: () => !!sessionSaveTimer,
        refreshGeoLayers,
        scheduleCameraSave,
        scheduleSessionSave,
        invalidateUI,
        updateAllUI,
    };
}
/**
 * @param {any} deps
 */
export function setupGlobalErrorBoundary({ navigatorRef, windowRef }: any) {
    if (windowRef.__ecbytsErrorBoundaryInstalled)
        return;
    windowRef.__ecbytsErrorBoundaryInstalled = true;
    const securityPaths = ['crypto/', 'auth/', 'metering/', 'llm/'];
    /** @type {any} */
    let captureErrorFn: any = null;
    import('../utils/errorReporting/reporter.js' as string)
        .then((mod) => {
        captureErrorFn = mod.captureError;
    })
        .catch((_e) => console.debug('[main:silent-catch]', (_e as any)?.message || _e));
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    const formatConsoleArgs = (args: any[]) => args.map((a: any) => typeof a === 'object' ? JSON.stringify(a)?.slice(0, 500) : String(a)).join(' ');
    const isEcbytsInternal = (args: any[]) => {
        const first = String(args[0] || '');
        return first.startsWith('[ecbyts]') || first.startsWith('[ecbyts:');
    };
    console.error = (...args) => {
        originalConsoleError.apply(console, args);
        if (isEcbytsInternal(args))
            return;
        if (captureErrorFn) {
            captureErrorFn('warning', formatConsoleArgs(args).slice(0, 2000), {
                metadata: { source: 'console.error', argCount: args.length },
            });
        }
    };
    console.warn = (...args) => {
        originalConsoleWarn.apply(console, args);
        if (isEcbytsInternal(args))
            return;
        if (captureErrorFn) {
            captureErrorFn('warning', formatConsoleArgs(args).slice(0, 2000), {
                metadata: { source: 'console.warn', argCount: args.length },
            });
        }
    };
    /**
     * @param {any} message
     * @param {any} source
     * @param {any} lineno
     * @param {any} colno
     * @param {any} error
     */
    windowRef.onerror = (message: any, source: any, lineno: any, colno: any, error: any) => {
        const isSecurity = source && securityPaths.some((/** @type {string} */ p) => source.includes(p));
        const prefix = isSecurity ? '[ecbyts:security]' : '[ecbyts]';
        console.error(`${prefix} Unhandled error: ${message}`, { source, lineno, colno, error });
        if (captureErrorFn) {
            captureErrorFn('crash', String(message), {
                stack: error?.stack,
                metadata: { source, lineno, colno, isSecurity },
            });
        }
        return false;
    };
    /** @param {any} event */
    windowRef.onunhandledrejection = (event: any) => {
        const stack = event.reason?.stack || '';
        const isSecurity = securityPaths.some((/** @type {string} */ p) => stack.includes(p));
        const prefix = isSecurity ? '[ecbyts:security]' : '[ecbyts]';
        console.error(`${prefix} Unhandled promise rejection:`, event.reason);
        if (captureErrorFn) {
            captureErrorFn('crash', String(event.reason?.message || event.reason), {
                stack: event.reason?.stack,
                metadata: { isSecurity },
            });
        }
    };
    navigatorRef.storage?.persist?.();
}
/**
 * @param {any} deps
 */
export function registerInitDispatcher({ documentRef, initFn, windowRef }: any) {
    let initDispatched = false;
    function dispatchInit(reason: any) {
        const root = typeof windowRef !== 'undefined' ? windowRef : globalThis;
        root.__ecbytsInitState = root.__ecbytsInitState || {
            dispatched: false,
            running: false,
            completed: false,
            lastDispatchReason: null,
            lastCallId: 0,
        };
        if (root.__ecbytsInitState.dispatched) {
            console.warn('[ecbyts:init] duplicate init dispatch blocked (global)', {
                reason,
                readyState: documentRef.readyState,
                lastDispatchReason: root.__ecbytsInitState.lastDispatchReason,
                completed: root.__ecbytsInitState.completed,
            });
            return;
        }
        if (initDispatched) {
            console.warn('[ecbyts:init] duplicate init dispatch blocked', {
                reason,
                readyState: documentRef.readyState,
            });
            return;
        }
        initDispatched = true;
        root.__ecbytsInitState.dispatched = true;
        root.__ecbytsInitState.lastDispatchReason = reason;
        console.debug('[ecbyts:init] dispatch', { reason, readyState: documentRef.readyState });
        void initFn();
    }
    if (documentRef.readyState === 'loading') {
        documentRef.addEventListener('DOMContentLoaded', () => dispatchInit('domcontentloaded'));
        return;
    }
    dispatchInit('readyState-not-loading');
}
