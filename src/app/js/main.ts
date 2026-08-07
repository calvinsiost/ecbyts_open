// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining of validated
//               payloads via ECO1) — NOT blockchain consensus, NOT real-time
//               Digital Twin. Current data regime: campaign-based (Digital Model).
//               See CCC-001 §1.1 PN-1/PN-2/PN-5 (taxonomia honesta).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   APPLICATION ENTRY POINT — ecbyts v0.1.0-beta
   Ponto de entrada da aplicacao ecbyts

   Este arquivo apenas inicializa o sistema e conecta os modulos.
   A logica de cada area esta nos arquivos especificos:
   - handlers/   → acoes do usuario (botoes, formularios)
   - scene/      → visualizacao 3D (Three.js)
   - elements/   → dados dos elementos ambientais
   - ui/         → componentes da interface
   - analytics/  → graficos e analises
   - io/         → importar/exportar modelos

   ORDEM DE INICIALIZACAO:
   1. Traducoes (i18n)
   2. Gerenciador de campos
   3. Cena 3D
   4. Carrega modelo da URL (se houver)
   5. Interface (abas, paineis, eventos)
   6. Registra handlers globais
   7. Inicia animacao
   ================================================================ */
// --- Core ---
import { initI18n, t, applyTranslations, updateLanguageSelector } from './utils/i18n/translations.js';
import { initScene, handleResize, animate, wakeRenderLoop, getInterpolationGroup, getVoxelGroup, getIssuesGroup, getPhotoMarkersGroup, applyQualityTier, getCurrentQualityTier, initPostProcessing, getRenderer, } from './utils/scene/setup.js';
import { initLabelRenderer } from './utils/labels/renderer.js';
import { initLabels, clearAllLabels } from './utils/labels/manager.js';
import { restoreLabelDensity } from './utils/handlers/labels.js';
import { initPicker } from './utils/scene/picker.js';
import { initCompass, initGlobe, updateGlobe } from './utils/scene/compass.js';
import { initGeoHud } from './utils/ui/geoHud.js';
import { initSceneHud } from './utils/ui/sceneHud.js';
import { initCursorProjector } from './utils/scene/cursorProjector.js';
import { initConstellation, syncConstellationLayout, updateConstellation } from './utils/scene/constellation.js';
import { getAllElements, refreshAutoLabelNames, rebindMeshesToScene, } from './core/elements/manager.js';
import { getCameraState, setCameraState, } from './utils/scene/controls.js';
import { getSelectedElement } from './core/elements/manager.js';
import { CONFIG, APP_VERSION } from './config.js';
// V3: apply runtime feature-flag overrides (query param + localStorage)
// BEFORE any UI module reads CONFIG.FEATURES. Default CONFIG values in
// config.js remain off; runtime knows how to flip per session without
// editing the shipped config (ADR §Publish Gate compliance).
import { applyFeatureFlagOverrides, applyRemoteFeatureFlagOverrides } from './utils/startup/featureFlagsRuntime.js';
applyFeatureFlagOverrides(CONFIG);
// Modo Simples/Técnico: aplica a classe + injeta o toggle assim que o DOM estiver
// pronto (idempotente, auto-difere p/ DOMContentLoaded). Top-level = roda sempre.
try { initLanguageMode(); } catch (e: any) { console.debug('[main] languageMode init:', e?.message || e); }
// Remote admin-panel overrides: async, non-blocking. If admin is
// reachable, applies flags then re-renders Launchpad. Offline/slow:
// bridge falls back to cached snapshot or does nothing (CONFIG stays
// with sync overrides only).
applyRemoteFeatureFlagOverrides(CONFIG)
    .then(/** @param {any} flipped */ (flipped: any) => {
    if (flipped && flipped.length > 0) {
        // Notify UI to re-render with new flags. homeGrid._updateDynamic
        // re-renders hero/feed/panels on this event.
        window.dispatchEvent(new CustomEvent('ecbyts:feature-flags-updated', { detail: { flipped } }));
    }
})
    .catch(/** @param {any} _e */ (_e: any) => console.debug('[main] remote flag fetch:', _e?.message || _e));
// --- I/O ---
import { importFromURL, applyModel } from './core/io/import.js';
import { buildModel } from './core/io/export.js';
import { getModelId, getModelIdSync } from './core/io/modelLink.js';
// --- History ---
import { initHistory, pushSnapshot, clearHistory } from './utils/history/manager.js';
// importCampaigns, importEdges removidos - agora dentro de buildFullRandomModel
// --- Cross-tab sync ---
import { initBroadcastSync, destroyBroadcastSync } from './utils/storage/broadcastSync.js';
import { setupBroadcastListeners, getLastSyncReloadTs, getSyncReloadCooldownMs, } from './utils/startup/broadcastSyncInit.js';
// --- View Router + Home ---
import { initViewRouter, initSwipeNavigation, onSceneReady, onDataStudioReady, switchView, switchGroup, getCurrentGroup, isSceneReady, markSceneReady, applySavedView, } from './utils/scene/viewRouter.js';
import { initHomeGrid, renderHomeGrid, isHomeViewActive, setHomePreparingRandom } from './utils/ui/homeGrid.js';
import { initHomeHeader } from './utils/ui/homeHeader.js';
import { initSnapshotEngine, setBootPreparing } from './core/purpose/index.js';
import { initCustomize } from './utils/customize/manager.js';
// Modo Simples/Técnico (FRIEND-SCORE-001 TD-11, conceito da Fundação ecbyts):
// jargão explicado em linguagem leiga, alcançável de qualquer tela. Default = Simples.
// Chamado top-level (não no caminho scene-ready) p/ aparecer também na home/sem modelo.
import { initLanguageMode } from './utils/ui/languageModeManager.js';
// --- UI ---
import { showToast } from './utils/ui/toast.js';
import { initTabs, initSections } from './utils/ui/tabs.js';
import { initProjectTabBar } from './utils/ui/projectTabBar.js';
import { wireProjectTabBarToSwitchBridge } from './core/projectTabs/bridgeWire.js';
import { createProgressHandler as createSwitchOverlayHandler } from './core/projectTabs/switchOverlay.js';
import { runLegacyMigration, buildDefaultMigrationDeps } from './core/projectTabs/legacyTabMigration.js';
import { snapshotCurrent as bridgeSnapshotCurrent, setCurrentTabIdForWire } from './core/projectTabs/modelSwitchBridge.js';
import { buildDefaultBridgeDeps as buildBridgeDepsForMig } from './core/projectTabs/bridgeWire.js';
import { createTabModelSnapshotsAdapter } from './core/projectTabs/tabModelSnapshotsAdapter.js';
import {
    openProjectTab as openProjectTabForMig,
    getProjectTabsSnapshot as getProjectTabsSnapshotForMig,
} from './utils/ui/projectTabBar.js';
import { initRibbon } from './utils/ui/ribbon.js';
import { initPanelManager, rebuildGridRows } from './utils/ui/panelManager.js';
import { initMobileMenu } from './utils/ui/mobileMenu.js';
import { hydrateIcons, initIconObserver } from './utils/ui/icons.js';
import { initStampPanel, updateStampPanel, injectStampStyles } from './utils/ui/stampPanel.js';
import { initComplianceUi } from './utils/ui/complianceUiBootstrap.js';
import { initActionPlanUi } from './utils/ui/actionPlanUiBootstrap.js';
import { registerConsistencyPanelHandlers } from './utils/ui/consistencyPanel.js';
import { registerOwnerWorksHandlers } from './utils/ui/ownerWorksPanel.js';
import { registerBuyerPurchasesHandlers } from './utils/ui/buyerPurchasesPanel.js';
import { registerBalanceHubHandlers } from './utils/ui/balanceHub.js';
import { registerLicenseVerifyPublicHandlers } from './utils/ui/licenseVerifyPublicModal.js';
import { initConsistencyStatusBadge } from './utils/ui/consistencyStatusBadge.js';
import { seedBuiltinLibraryModules } from './core/libraries/seedBuiltins.js';
import { syncLibraryFieldMetaToTaxonomies } from './core/libraries/taxonomyBridge.js';
// LOADING-PERF-001 RF-4 (claude - adm 2026-06-25): cooperative yielding no boot.
// yieldToMain() cede a main thread ENTRE blocos determinísticos pesados do boot
// (sem mudar ordem nem corretude), deixando o browser pintar/responder a input
// no meio do boot de ~30s → ataca INP. Reusa a facade de PERF-CODEBASE-WIDE WS-5.
import { yieldToMain } from './utils/performance/yielding.js';
import { initEdgeEditor, updateEdgePanel, injectEdgeStyles } from './utils/ui/edgeEditor.js';
import { initFieldManager } from './utils/ui/fieldManager.js';
import { initFormAccessibility } from './utils/ui/formAccessibility.js';
import { applyChartDefaults } from './utils/ui/chartTheme.js';
import './utils/ui/customSelect.js';
import { renderSensorCenterTab } from './utils/ui/sensorCenterPanel.js';
import { updateFamiliesList, updateElementsList, updateStatusBar, updateElementDetails, updateCampaignsList, updateScenesList, } from './utils/ui/lists.js';
import { handleFileInputChange, handleKeyInputChange } from './utils/ui/modals.js';
// --- Analytics ---
import { initVercelAnalytics } from './analytics/vercelAnalytics.js';
import { initAnalyticsModule, initUncertaintyHubPanel, updateAnalyticsData } from './utils/startup/analyticsInit.js';
import { initTour } from './utils/tour/engine.js';
import { initProjectAreas, renderProjectAreas, renderCorporateIO, getInitConfig, restoreInitForm, } from './utils/handlers/project.js';
import { initAreasTree, renderAreasTree } from './utils/handlers/project.js';
// --- Governance ---
import { renderGovernanceTab, hydrateRegulatoryCalendar, hydrateDecisionLog, hydrateStakeholderShares, hydrateRetentionPolicies, hydrateProvenanceGraphPreview, } from './utils/ui/governancePanel.js';
import { addInsuranceContract, loadContracts } from './utils/governance/contractManager.js';
import { loadWbs } from './utils/governance/wbsManager.js';
import { loadProjects } from './utils/governance/projectManager.js';
import { loadCostCenters } from './utils/governance/costCenterManager.js';
// --- Cost Analysis ---
import { renderCostAnalysisTab } from './utils/ui/costAnalysisPanel.js';
import { updateCostHudBadge } from './utils/ui/costHud.js';
// HUD-CARDS-REDESIGN-001 M3 (Calvin 2026-06-10): tile novo de violações
import { updateViolationsHud } from './utils/ui/violationsHud.js';
import { updateEcbtHudBadge } from './utils/ui/ecbtScoreHud.js';
// --- Pipeline Automation tab ---
import { renderPipelineManagerTab } from './utils/handlers/pipelines.js';
import { renderFilesPanel } from './utils/files/filePanel.js';
// --- SAO Protocol ---
import { initSAO } from './core/sao/index.js';
// --- Auth ---
import { initAuth, getCurrentUser } from './utils/auth/session.js';
import { updateAuthUI, authHandlers } from './utils/handlers/auth.js';
import { hydrateDevLocalLlmConfig } from './core/llm/client.js';
import { runRandomPostbootSequence } from './main/random-postboot.js';
import { runBootPreflightSequence } from './main/boot-preflight.js';
import { markBootPhase } from './main/boot-phase.js';
import { runRandomBootSequence } from './main/random-boot.js';
import { runStartupGatesSequence } from './main/startup-gates.js';
import { bindSaveStatusRetry as _bindSaveStatusRetry, forceDismissWelcomeOverlays as _forceDismissWelcomeOverlays, setSaveStatus as _setSaveStatus, startLoadingTips as _startLoadingTips, stopLoadingTips as _stopLoadingTips, updateLoading as _updateLoading, } from './main/startup-feedback.js';
import { runFeatureInitSequence, runFeaturePostEventsSequence } from './main/feature-init.js';
import { runUiShellInitSequence } from './main/ui-shell-init.js';
import { initErrorRecoveryRuntime } from './utils/recovery/errorRecoveryRuntime.js';
import { initDeferredStyles } from './main/deferred-styles.js';
import { installMissingHandlerGuard } from './main/deferred-handler-guard.js';
initDeferredStyles();
import { registerSceneBootstrapSequence } from './main/scene-bootstrap.js';
import { runPostShellActivationSequence } from './main/post-shell-activation.js';
import { runPostShellHydrationSequence } from './main/post-shell-hydration.js';
import { runPostbootLifecycleSequence } from './main/postboot-lifecycle.js';
import { mountFeedbackWidgetLazy, maybeAutoStartTourLazy, installSequencerLazyBridge, initLifecycleMetricsLazy, maybeInitApiBridgeLazy, initFineScenarioConsoleLazy, scheduleOptionalUiBootstrapsLazy, scheduleScreenshotPrewarmLazy, scheduleIdlePreloadsLazy, warmupSaoNnLazy, } from './main/lazy-registry.js';
import { setupGlobalEventListeners } from './main/global-events.js';
import { ensureStaticWindowBridges, exposeLazyWindowModules, registerEarlyWindowBridges, registerCalculatorBridge, registerHandlerRegistryBridge, registerFeedbackBridges, registerPerfMonitorBridge, } from './main/window-bridges.js';
import { createRuntimeState, registerInitDispatcher, setupGlobalErrorBoundary } from './main/runtime-lifecycle.js';
import { UI_INVALIDATION_DOMAINS } from './main/uiInvalidationRegistry.js';
// --- Ticker ---
import { initTicker, getTickerConfig, computeAll } from './utils/ticker/manager.js';
import { initTickerBar, renderTicker, setTickerBarVisible } from './utils/ticker/renderer.js';
// --- Calculator ---
import { initCalculator, getCalculatorItems } from './core/calculator/manager.js';
// --- User Constants ---
import { initConstants } from './core/constants/manager.js';
// --- Pipelines ---
// generateRandomPipelines removido - agora dentro de buildFullRandomModel
// --- Interpolation ---
import { initInterpolation, setInterpolationGroup, } from './core/interpolation/manager.js';
// --- Voxel Geology ---
import { initVoxel, setVoxelGroup } from './core/voxel/manager.js';
// --- Issues 3D + Bounty ---
import { loadIssues, setMarkerRefreshCallback, getOpenBountyCount, clearIssues, } from './core/issues/manager.js';
import { setIssuesGroup as setIssuesGroupRef, refreshAllMarkers } from './core/issues/issueMarker.js';
import { setPhotoMarkersGroup, refreshPhotoMarkers } from './core/photolog/photoMarker.js';
import { initBountyPanel, updateBountyBadge } from './utils/ui/bountyPanel.js';
// --- Groups ---
import { initGroups } from './utils/groups/manager.js';
// --- Report ---
import { initReport } from './utils/report/manager.js';
import { initFilterPresets } from './utils/report/filterPresets.js';
// --- Neural Networks ---
import { initNN } from './core/nn/manager.js';
// --- Libraries ---
import { initLibraries, installLibrary } from './utils/libraries/manager.js';
import { hasUserPurchased, downloadLibraryManifest } from './utils/libraries/supabaseMarketplace.js';
import { getCurrentCloudModelId } from './utils/handlers/cloud.js';
// --- Taxonomy Data Dictionaries ---
import { initTaxonomies } from './core/taxonomy/manager.js';
// Quick Actions (lightbulb) REMOVED - migrated to Proactive AI tips
// import { initQuickActions } from './utils/handlers/quickActions.js';
// --- HUD Cards ---
import { initHudCards } from './utils/hud/cardManager.js';
import { initHudCardsPanel, renderHudCards } from './utils/hud/cardRenderer.js';
import { initEquipmentHud } from './utils/hud/equipmentManager.js';
import { initEquipmentHudPanel, renderEquipmentHud } from './utils/hud/equipmentRenderer.js';
// --- Theme ---
import { initTheme } from './utils/theme/manager.js';
import { initCookieConsent } from './utils/ui/privacyNotice.js';
import { initCreditsBadge, handleOpenCreditsPanel } from './utils/ui/creditsBadge.js';
// --- Performance Monitor ---
import { getPerfMonitor } from './utils/performance/monitor.js';
import { initPerfHud, togglePerfHud } from './utils/performance/hud.js';
// --- Viz Settings ---
import { initVizSettings } from './utils/vizSettings/manager.js';
import { initSymbology } from './core/symbology/manager.js';
import { initVizSettingsBar, renderVizSettings } from './utils/vizSettings/renderer.js';
// --- JSON Inspector ---
import { initInspector } from './utils/inspector/manager.js';
import { initInspectorPanel, renderInspector } from './utils/inspector/renderer.js';
// --- Disclaimer ---
import { initDisclaimer } from './utils/ui/disclaimer.js';
// --- Storage Monitor ---
import { clearModelData, safeSetItem } from './utils/storage/storageMonitor.js';
// --- Shape Editing ---
import { initEditor, isEditing, exitEditMode, exitGizmoMode, getEditMode, getSelectedVertexIndex, registerStrategy, toggleGizmoShapeEdit, } from './utils/editing/editManager.js';
import { initContextMenu } from './utils/editing/contextMenu.js';
import { initGizmo, setGizmoMode, toggleGizmoSpace } from './utils/editing/gizmoController.js';
import { toggleSnap } from './utils/editing/snapEngine.js';
// --- Element Context Menu ---
import { initElementContextMenu } from './utils/ui/contextMenu.js';
// --- Canvas Context Menu (right-click on empty 3D space) ---
import { initCanvasContextMenu } from './utils/scene/canvasContextMenu.js';
// --- Global Context Menu (fallback para áreas sem menu próprio) ---
import { initGlobalContextMenu } from './utils/ui/globalContextMenu.js';
import { PolygonStrategy } from './utils/editing/strategies/polygonStrategy.js';
import { PathStrategy } from './utils/editing/strategies/pathStrategy.js';
import { LinearPathStrategy } from './utils/editing/strategies/linearPathStrategy.js';
import { EllipsoidStrategy } from './utils/editing/strategies/ellipsoidStrategy.js';
import { EllipseStrategy } from './utils/editing/strategies/ellipseStrategy.js';
import { BoxStrategy } from './utils/editing/strategies/boxStrategy.js';
import { ExtrudedPolygonStrategy } from './utils/editing/strategies/extrudedPolygonStrategy.js';
import { PointStrategy } from './utils/editing/strategies/pointStrategy.js';
// --- Modo Convidado (ECBYTS-OPEN-LOCAL-001 F1) ---
import { initGuestMode, isGuestMode, mountGuestModeBanner } from './main/guestGate.js';
import { mountGuestDemoButton } from './main/guestDemo.js';
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';
// ECBYTS-OPEN-LOCAL-001 F1 — Modo Convidado: decidido ANTES de qualquer
// sequência de init (telemetry, recovery heartbeat, startup gates consultam
// isGuestMode()). Com config real: no-op total. Banner RF2 montado já aqui
// para ficar visível durante o próprio boot.
initGuestMode({
    url: SUPABASE_URL,
    key: SUPABASE_KEY,
    enabled: (CONFIG as any)?.FEATURES?.GUEST_MODE !== false,
});
if (isGuestMode()) mountGuestModeBanner(document);
// RF3 — botão "Carregar exemplo": 1 clique carrega o dataset demo. Montado no
// boot (não espera o init completo) porque só depende do DOM; o clique é que
// dispara o import, e aí a cena já está pronta.
if (isGuestMode()) mountGuestDemoButton(document);
// Ensure static onclick handlers can switch views even before full handler registration.
ensureStaticWindowBridges({ switchView });
const INIT_PHASE_TIMEOUT_MS = 15000;
const INIT_BOOT_WATCHDOG_MS = 45000;
/**
 * @param {any} task
 * @param {any} label
 * @param {number} [timeoutMs]
 * @param {{ critical?: boolean }} [opts]
 */
async function _withInitTimeout( task: any, label: any, timeoutMs: any = INIT_PHASE_TIMEOUT_MS, { critical = false }: any = {}) {
    const timeoutError = new Error(`[Init] ${label} timed out after ${timeoutMs}ms`);
    try {
        return await Promise.race([
            Promise.resolve().then(task),
            new Promise((_, reject) => setTimeout(() => reject(timeoutError), timeoutMs)),
        ]);
    }
    catch (err: any) {
        if (critical)
            throw err;
        console.warn(`[Init] ${label} skipped: ${err?.message || err}`);
        return null;
    }
}
/**
 * Block until the user authenticates (authChanged event with valid session).
 * Aguarda ate o usuario autenticar via evento authChanged.
 * Timeout: 10 minutos (usuario abandonou a pagina).
 *
 * @returns {Promise<void>}
 */
function _waitForAuth() {
    return new Promise((resolve: any) => {
        const MAX_WAIT = 10 * 60_000; // 10 min
        const timer = setTimeout(resolve, MAX_WAIT);
        const handler = () => {
            import('./utils/auth/session.js' as string).then(({ getCurrentUser }: any) => {
                if (getCurrentUser()) {
                    clearTimeout(timer);
                    window.removeEventListener('authChanged', handler);
                    resolve();
                }
            }).catch((e: any) => console.debug('[main:auth-wait:silent-catch]', e?.message || e));
        };
        window.addEventListener('authChanged', handler);
        // Check imediato (sessao pode ja existir de OAuth redirect rapido)
        import('./utils/auth/session.js' as string).then(({ getCurrentUser }: any) => {
            if (getCurrentUser()) {
                clearTimeout(timer);
                window.removeEventListener('authChanged', handler);
                resolve();
            }
        }).catch((e: any) => console.debug('[main:auth-wait-immediate:silent-catch]', e?.message || e));
    });
}
// ================================================================
// MAIN INITIALIZATION
// ================================================================
async function _checkLibraryCheckoutReturn() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('library_purchase') !== 'success')
        return;
    const libraryDbId = params.get('library_db_id');
    if (!libraryDbId)
        return;
    // Clean URL params without reload
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
    try {
        await _waitForAuth();
        const purchased = await hasUserPurchased(libraryDbId);
        if (!purchased) {
            console.warn('[Checkout] Purchase not confirmed for', libraryDbId);
            return;
        }
        // Download manifest and install
        const dl = await downloadLibraryManifest(libraryDbId);
        if (dl.manifest) {
            const manifest = dl.manifest;
            const result = installLibrary(manifest);
            if (result.success) {
                window.showToast?.(`Purchase complete! ${manifest.name} installed.`, 'success');
            }
            else {
                window.showToast?.(result.error || 'error', 'error');
            }
        }
        else {
            console.warn('[Checkout] Manifest download failed:', dl.error);
        }
        // Auto-create local insurance contracts from DB records
        try {
            const { getSupabaseClient, getCurrentUser } = await import('./utils/auth/session.js' as string);
            const sb = getSupabaseClient();
            const user = getCurrentUser();
            if (sb && user) {
                // OPT-1: explicit columns matching downstream addInsuranceContract() usage
                const { data: insuranceRows } = await sb
                    .from('insurance_purchases')
                    .select('id, library_id, library_purchase_id, order_id, subtype, premium_cents, coverage_value_cents, status')
                    .eq('user_id', user.id)
                    .eq('library_id', libraryDbId)
                    .in('status', ['active', 'pending']);
                if (insuranceRows?.length) {
                    for (const ins of insuranceRows) {
                        addInsuranceContract({
                            subtype: ins.subtype,
                            linkedOrderId: ins.library_purchase_id || ins.order_id || '',
                            linkedLibraryId: ins.library_id,
                            premiumCents: ins.premium_cents,
                            coverageValueCents: ins.coverage_value_cents,
                            userName: user.email || '',
                            currency: 'USD',
                        });
                    }
                    console.debug(`[Checkout] Created ${insuranceRows.length} insurance contract(s)`);
                }
            }
        }
        catch (insErr: any) {
            console.warn('[Checkout] Insurance contract creation skipped:', insErr);
        }
    }
    catch (err: any) {
        console.error('[Checkout] Post-checkout error:', err);
    }
}
/* eslint-disable */
const { hasPendingSessionSave, refreshGeoLayers: _refreshGeoLayers, scheduleCameraSave: _scheduleCameraSave, scheduleSessionSave: _scheduleSessionSave, invalidateUI, updateAllUI, } = createRuntimeState({
    buildModel,
    configFeatures: CONFIG.FEATURES,
    documentRef: document,
    getCameraState,
    getCurrentCloudModelId,
    getCurrentUser,
    getLastSyncReloadTs,
    getModelIdSync,
    getOpenBountyCount,
    getPerfMonitor,
    getRenderer,
    getSelectedElement,
    getSyncReloadCooldownMs,
    getTickerConfig,
    isHomeViewActive,
    isSceneReady,
    localStorageRef: localStorage,
    performanceRef: performance,
    pushSnapshot,
    rebuildGridRows,
    renderAreasTree,
    renderCorporateIO,
    renderCostAnalysisTab,
    renderEquipmentHud,
    renderFilesPanel,
    renderGovernanceTab,
    renderHomeGrid,
    renderHudCards,
    renderInspector,
    renderPipelineManagerTab,
    renderProjectAreas,
    renderSensorCenterTab,
    renderTicker: () => renderTicker(computeAll()),
    requestAnimationFrameRef: requestAnimationFrame,
    safeSetItem,
    setSaveStatus: _setSaveStatus,
    setTickerBarVisible,
    updateAnalyticsData,
    updateAuthUI,
    updateBountyBadge,
    updateCampaignsList,
    updateConstellation,
    updateCostHudBadge,
    updateEcbtHudBadge,
    updateViolationsHud,
    updateEdgePanel,
    updateElementDetails,
    updateElementsList,
    updateFamiliesList,
    updateScenesList,
    updateStampPanel,
    updateStatusBar,
    wakeRenderLoop,
});
/* eslint-enable */
function requestUIRefresh(domain?: string, reason?: string) {
    (invalidateUI as any)(domain || UI_INVALIDATION_DOMAINS.FULL, reason || 'handler');
}
let allHandlersRegistrationPromise: any = null;
let registerAllHandlersImpl: any = null;
async function ensureAllHandlersRegistered() {
    if (registerAllHandlersImpl) {
        registerAllHandlersImpl(requestUIRefresh, updateAnalyticsData);
        return registerAllHandlersImpl;
    }
    if (!allHandlersRegistrationPromise) {
        allHandlersRegistrationPromise = import('./utils/handlers/index.js' as string)
            .then(({ registerAllHandlers }: any) => {
            registerAllHandlersImpl = registerAllHandlers;
            registerAllHandlers(requestUIRefresh, updateAnalyticsData);
            return registerAllHandlers;
        })
            .then(async (mainRegister: any) => {
            // Wave MMM1 (claude-otimizacao): register otimizacao handlers V2 (17 window.* handlers)
            // Unblocks SPEC_CONSTELLATION_HUD_9_75 + EIS_COMPLETENESS_BASELINE + ECBY_PRIVACY_CONTEXT_GUARD
            // + MODULE_PROVENANCE_LIBRARIES_NAV + MODEL_VCS_GIT panels accessible from HTML onclick=.
            try {
                const v2 = await import('./utils/handlers/registerAllOtimizacaoHandlersV2.js' as string);
                const result = v2.registerAllOtimizacaoHandlersV2?.();
                if (result?.errors?.length) {
                    console.warn('[ecbyts:boot] otimizacao V2 partial:', result.errors);
                }
            }
            catch (err: any) {
                console.debug('[ecbyts:boot] otimizacao V2 register skipped:', /** @type {any} */ (err)?.message || err);
            }
            return mainRegister;
        })
            .catch((err: any) => {
            allHandlersRegistrationPromise = null;
            console.error('[ecbyts:boot] handler registry lazy-load failed:', err);
            throw err;
        });
    }
    return allHandlersRegistrationPromise;
}
installMissingHandlerGuard(ensureAllHandlersRegistered);
function registerAllHandlers( requestUIRefreshArg: any = requestUIRefresh, updateAnalyticsDataArg: any = updateAnalyticsData) {
    if (registerAllHandlersImpl) {
        return registerAllHandlersImpl(requestUIRefreshArg, updateAnalyticsDataArg);
    }
    return import('./utils/handlers/index.js' as string)
        .then(({ registerAllHandlers: loadedRegisterAllHandlers }: any) => {
        registerAllHandlersImpl = loadedRegisterAllHandlers;
        loadedRegisterAllHandlers(requestUIRefreshArg, updateAnalyticsDataArg);
        return loadedRegisterAllHandlers;
    })
        .catch((err: any) => {
        console.error('[ecbyts:boot] handler registry registration failed:', err);
        throw err;
    });
}
function installBootReadinessSurface() {
    if (typeof window === 'undefined')
        return;
    window.switchGroup = window.switchGroup || switchGroup;
    window.getCurrentGroup = window.getCurrentGroup || getCurrentGroup;
    window.syncConstellationLayout = window.syncConstellationLayout || syncConstellationLayout;
    window.registerAllHandlers = registerAllHandlers;
    if (typeof window.handleAddElement !== 'function') {
        window.handleAddElement = async (...args: any[]) => {
            await ensureAllHandlersRegistered();
            return (window as any).handleAddElement(...args);
        };
    }
    window.__ecbyts_handlersProxyReady = true;
}
/**
 * Main initialization function.
 * Funcao principal - inicializa todos os subsistemas na ordem correta.
 * Chamada automaticamente quando a pagina termina de carregar.
 */
async function init() {
    const initStartedAt = Date.now();
    // Marca início para telemetria de boot (lido no log handlers-ready abaixo)
    if (typeof window !== 'undefined' && !window.__ecbyts_initStart) {
        window.__ecbyts_initStart = performance.now();
    }
    // PERF-MASTER-001 S0/S1 + MONOLITH §2.5: instrumentação formal
    try {
        const { markBootPhase } = await import('./core/performance/bootBudget.js' as string);
        markBootPhase('init-start');
    }
    catch (e: any) {
        console.debug('[main] boot-budget-init-start:', e?.message || e); /* original noop */
    }
    const root: any = (typeof window !== 'undefined' ? window : globalThis);
    root.__ecbytsInitState = root.__ecbytsInitState || {
        dispatched: false,
        running: false,
        completed: false,
        lastDispatchReason: null,
        lastCallId: 0,
    };
    if (root.__ecbytsInitState.running) {
        console.warn('[ecbyts:init] duplicate init call blocked (global running)', {
            readyState: document.readyState,
            href: window.location.href,
        });
        return;
    }
    root.__ecbytsInitState.running = true;
    root.__ecbytsInitCallCount = Number(root.__ecbytsInitCallCount || 0) + 1;
    const initCallId = root.__ecbytsInitCallCount;
    root.__ecbytsInitState.lastCallId = initCallId;
    const appNode = document.getElementById('app');
    const bootMarker = appNode?.dataset?.ecbytsBootId || null;
    if (appNode)
        appNode.dataset.ecbytsBootId = String(initCallId);
    console.debug('[ecbyts:init] start', {
        callId: initCallId,
        readyState: document.readyState,
        href: window.location.href,
        previousBootMarker: bootMarker,
        domStats: {
            scripts: document.querySelectorAll('script').length,
            appChildren: appNode?.children?.length ?? 0,
        },
    });
    const bootWatchdog = setTimeout(() => {
        const loadingOverlay = document.getElementById('loading-overlay');
        if (!loadingOverlay)
            return;
        // TOOLING-PERF/boot-diag (claude - adm 2026-06-11): o watchdog dizia só
        // "reached 45000ms" sem apontar a fase travada — diagnóstico exigia
        // probe externo. Agora imprime a fase corrente + timeline completa
        // (__ecbytsBootPhaseLog populado por markPhase no boot-preflight).
        const _stuckPhase = (window as any).__ecbytsBootPhase || 'unknown';
        const _phaseLog = (window as any).__ecbytsBootPhaseLog || [];
        console.warn(
            `[Init] Boot watchdog reached ${INIT_BOOT_WATCHDOG_MS}ms; hiding startup overlay. ` +
                `STUCK AT phase="${_stuckPhase}" — timeline: ` +
                _phaseLog.map((p: any) => `${p.phase}@${p.t}ms`).join(' → '),
        );
        loadingOverlay.style.pointerEvents = 'none';
        loadingOverlay.remove();
        _stopLoadingTips();
        try {
            showToast(t('initSlowContinue') || 'Initial loading took too long. Continuing with partial startup.', 'warning');
        }
        catch (e: any) {
            console.debug('[main] watchdog-toast:', e?.message || e); /* original noop */
        }
    }, INIT_BOOT_WATCHDOG_MS);
    // FIX 2026-06-10 (claude - ui): pré-seed localStorage quando há `?tools=` na URL.
    // applySavedView (em runPostShellHydrationSequence) e loadLayout (em
    // initPanelManager) restauram view + painéis MINIMIZED do localStorage. Sem
    // pré-seed, eles RE-revertem o estado que o wrapper deep-link acabou de
    // restaurar → painel desaparece após boot. Pré-seed garante coerência.
    // Reproduzido por Calvin 2026-06-10 em localhost (mesmo após mover
    // applyDeepLink p/ fim do boot, applySavedView roda ANTES e contamina).
    let _deepLinkToolForBoot = '';
    try {
        const _deepLinkParams = new URLSearchParams(window.location.search);
        const _deepLinkTool = _deepLinkParams.get('tools');
        _deepLinkToolForBoot = _deepLinkTool || '';
        if (_deepLinkTool === 'cost-analysis') {
            try {
                localStorage.setItem('ecbyts-default-view', '3d');
            } catch (e: any) { console.debug('[boot:deep-link:default-view]', e?.message || e); }
            try {
                const _layoutRaw = localStorage.getItem('ecbyts-panel-layout');
                const _layout = _layoutRaw ? JSON.parse(_layoutRaw) : {};
                if (_layout && typeof _layout === 'object') {
                    _layout.families = { ..._layout.families, state: 'docked' };
                    localStorage.setItem('ecbyts-panel-layout', JSON.stringify(_layout));
                }
            } catch (e: any) { console.debug('[boot:deep-link:panel-layout]', e?.message || e); }
        }
    } catch (_e: any) {
        console.debug('[ecbyts:boot] deep-link pre-seed failed', _e?.message || _e);
    }
    try {
        const preflightResult = await runBootPreflightSequence({
            startLoadingTips: _startLoadingTips,
            bindSaveStatusRetry: () => _bindSaveStatusRetry(_scheduleSessionSave),
            features: CONFIG.FEATURES,
            documentRef: document,
            windowRef: window,
            localStorageRef: localStorage,
            sessionStorageRef: sessionStorage,
            historyRef: history,
            locationRef: location,
            appVersion: APP_VERSION,
            clearModelData,
            safeSetItem,
            initTheme,
            updateLoading: _updateLoading,
            withInitTimeout: _withInitTimeout,
            initI18n,
            updateLanguageSelector,
            translate: t,
            initCookieConsent,
            initLifecycleMetrics: initLifecycleMetricsLazy,
            initVercelAnalytics,
            applyChartDefaults,
            initFieldManager,
            initSAO,
            initLibraries,
            initTaxonomies,
            exposeLazyWindowModules,
            getAllElements,
            loadContracts,
            loadWbs,
            loadProjects,
            loadCostCenters,
            initNN,
            initAuth,
            hydrateDevLocalLlmConfig,
            initCreditsBadge,
            registerEarlyWindowBridges,
            authHandlers,
            handleOpenCreditsPanel,
            hydrateRegulatoryCalendar,
            hydrateDecisionLog,
            hydrateStakeholderShares,
            hydrateRetentionPolicies,
            hydrateProvenanceGraphPreview,
            checkLibraryCheckoutReturn: _checkLibraryCheckoutReturn,
        });
        if (preflightResult.aborted)
            return;
        // E2E and local bridge readiness should not wait on heavier view/startup
        // sections once preflight has completed.
        installBootReadinessSurface();
        void ensureAllHandlersRegistered();
        // 2h. View Router (maquina de estado: Actions/2D/2D+D/3D)
        _updateLoading(t('settingUpViews') || 'Setting up views...', 55);
        initViewRouter();
        // 2h2. Swipe Navigation - carrossel horizontal entre groups (actions/model/datastudio)
        // T10.1: marca fase + timeout — este await não tinha teto nem marca,
        // então um stall aqui aparecia no watchdog como STUCK AT preflight:done.
        markBootPhase(window, 'init:swipe-nav');
        await _withInitTimeout(() => initSwipeNavigation(), 'init:swipe-nav');
        // 2h3. Data Studio - LAZY: so inicializado na primeira troca para datastudio
        onDataStudioReady(async () => {
            const { initDataStudio } = await import('./utils/datastudio/index.js' as string);
            await initDataStudio();
        });
        // 2i. Home Grid - inicializado APOS registerAllHandlers (precisa de hydrateIcons)
        //     Placeholder: initHomeGrid() e chamado no step 7 abaixo.
        // 3. Cena 3D - LAZY: so inicializada na primeira troca para 2D/2D+D/3D
        //    Registra callback via onSceneReady; switchView() chama quando necessario.
        registerSceneBootstrapSequence({
            applyQualityTier,
            animate,
            documentRef: document,
            getCurrentQualityTier,
            getInterpolationGroup,
            getIssuesGroup,
            getPhotoMarkersGroup,
            getVoxelGroup,
            initCanvasContextMenu,
            initCompass,
            initConstellation,
            initContextMenu,
            initCursorProjector,
            initEditor,
            initGeoHud,
            initGizmo,
            initGlobe,
            initLabelRenderer,
            initLabels,
            initPicker,
            initPostProcessing,
            initScene,
            initSceneHud,
            markSceneReady,
            onSceneReady,
            rebindMeshesToScene,
            refreshPhotoMarkers,
            registerStrategies: () => {
                registerStrategy('boundary', PolygonStrategy);
                registerStrategy('river', PathStrategy);
                registerStrategy('plume', EllipsoidStrategy);
                registerStrategy('lake', EllipseStrategy);
                registerStrategy('building', ExtrudedPolygonStrategy);
                registerStrategy('tank', BoxStrategy);
                registerStrategy('well', PointStrategy); // único ponto com edição real (handle de profundidade)
                // SYS-TRUST-USE-001 #0 — spring/waste/waste_stream NÃO têm handles (hasDepthHandle:false em
                // pointStrategy.ts); registrá-las aqui só fazia hasStrategy() mentir "true" e o usuário cair
                // num modo de edição vazio com a mensagem de vértices. Sem strategy → fallback gizmo (correto).
                registerStrategy('blueprint', PolygonStrategy); // SYS-TRUST-USE-001 #3 — meshFactory já consome data.vertices (footprint DXF)
                registerStrategy('area', PolygonStrategy); // SYS-TRUST-USE-001 #3 — createAreaMesh ampliado p/ consumir data.vertices (backward-compat com data.dimensions)
                registerStrategy('habitat', PolygonStrategy); // SYS-TRUST-USE-001 #3 — createHabitatMesh ampliado (backward-compat com data.footprint / data.area)
                registerStrategy('dam', PolygonStrategy); // SYS-TRUST-USE-001 #3 — createDamMesh footprint extrudado vertical (backward-compat com data.dimensions)
                registerStrategy('pit', PolygonStrategy); // SYS-TRUST-USE-001 #3 — createPitMesh footprint extrudado para baixo (open-pit, backward-compat com data.dimensions)
                registerStrategy('infra_linear', LinearPathStrategy); // SYS-TRUST-USE-001 #3 — createInfraLinearMesh path-based (rodovia/duto/ferrovia/cabo)
                registerStrategy('route_flow', LinearPathStrategy); // SYS-TRUST-USE-001 #3 — createRouteFlowMesh path-based (rota amostragem/transporte/fluxo)
            },
            restoreLabelDensity,
            setInterpolationGroup,
            setIssuesGroupRef,
            setPhotoMarkersGroup,
            setVoxelGroup,
            windowRef: window,
        });
        // 4. Tenta carregar modelo da URL (?key=ECBT...)
        //    Se modelo carregado, força view 3D (precisa da cena ativa)
        _updateLoading(t('loadingModel') || 'Loading model...', 60);
        let loadedFromURL = false;
        try {
            // T10.1: marca fase + timeout (importFromURL faz fetch de rede sem teto próprio).
            // critical:true preserva o catch externo (toast de erro) — só o timeout
            // vira um Error relançado, igual a uma falha real de importFromURL.
            markBootPhase(window, 'init:import-from-url');
            const model = await _withInitTimeout(() => importFromURL(), 'init:import-from-url', INIT_PHASE_TIMEOUT_MS, { critical: true });
            if (model) {
                loadedFromURL = true;
                showToast(t('modelLoadedFromUrl'), 'success');
                // Modelo importado via URL - ativa view 3D diretamente
                await switchView('3d');
            }
        }
        catch (error: any) {
            showToast(`${t('failedToLoad')}: ${error.message}`, 'error');
        }
        // Lê configuração de inicialização do localStorage
        const initConfig = getInitConfig();
        let _showRandomBootState = false;
        // T10.1: marca fase — NÃO aplicar _withInitTimeout aqui: esta sequência
        // legitimamente espera o usuário (showWelcomeScreen/waitForAuth, sem
        // teto, dentro de startup-gates.ts), aplicar timeout quebraria o login.
        // startup-gates.ts marca sub-fases granulares (incl. 'gate:welcome-wait')
        // para o watchdog distinguir espera-de-usuário de travamento real.
        markBootPhase(window, 'init:startup-gates');
        const startupGatesResult = await runStartupGatesSequence({
            loadedFromURL,
            initConfig,
            applyModel,
            showToast,
            waitForAuth: _waitForAuth,
            forceDismissWelcomeOverlays: _forceDismissWelcomeOverlays,
            stopLoadingTips: _stopLoadingTips,
            documentRef: document,
            windowRef: window,
            localStorageRef: localStorage,
            sessionStorageRef: sessionStorage,
            historyRef: history,
            locationRef: location,
            features: CONFIG.FEATURES,
        });
        if (startupGatesResult.aborted)
            return;
        // BOOT-RESILIENCE-001: inicializa o shell de UI base (ribbon + panelManager)
        // ANTES das fases não-limitadas/timeout-propensas (random-boot sem teto,
        // feature-init, postboot-lifecycle). O panelManager registra os handlers
        // window.toggleToolbar/toggleStatusbar/toggleConstellation/_updateRibbonToggleState
        // que fazem o chip "Menu" (#ribbon-toggle-btn) funcionar. A toolbar colapsa
        // por DEFAULT na 1ª visita e o chip Menu é o ÚNICO caminho de volta — se uma
        // fase posterior estola sob carga (máquina lenta: boot 23.8s, postboot-lifecycle
        // pulado por timeout de 15s), o usuário ficaria SEM acesso ao ribbon inteiro.
        // Hoisting garante que esses handlers críticos existam independentemente das
        // fases opcionais. runUiShellInitSequence não consome saída de random-boot;
        // initPanelManager tem guarda de idempotência (_initialized).
        runUiShellInitSequence({
            initRibbon,
            initPanelManager,
            initMobileMenu,
            initTabs,
            initSections,
            initStampPanel,
            initEdgeEditor,
            initElementContextMenu,
            initGlobalContextMenu,
            injectStampStyles,
            injectEdgeStyles,
        });
        // FINDING-012 (UI/UX Audit 2026-06-04, claude - ui): applyDeepLink
        // movido para DEPOIS de runRandomBootSequence (linha ~798). Antes:
        // applyDeepLink rodava aqui, ANTES do random model ser gerado.
        // Painéis Tier-B que filtram por modelo populado (ghg-inventory:
        // emission_sources, etc.) faziam early-return silencioso (toast
        // warning + null) porque getAllElements() retornava 0. Painéis sem
        // essa dependência (customize, domain-editor, forum, risk) viam
        // applyDeepLink primeiro mas funcionavam ok. Deferir após random
        // garante contexto consistente para TODOS os painéis.
        // Full handler registration was started immediately after preflight.
        // P1-2 Phase 3 - Impact Uncertainty Card: subscreve evento
        // 'impact:uncertainty-result' emitido por handleEstimate*WithUncertainty.
        // No-op se container não existir (defensive) ou document/window undefined.
        try {
            const { mountImpactUncertaintyCard } = await import('./utils/ui/impactUncertaintyCard.js' as string);
            mountImpactUncertaintyCard({ containerId: 'impact-uncertainty-host' });
        }
        catch (_err: any) {
            console.warn('[ecbyts:boot] impact uncertainty card mount failed', _err);
        }
        // Telemetria de boot - expõe tempo até app-ready para gates de regressão
        // detectarem desaceleração antes que vire timeout no Playwright.
        try {
            const _t = window.__ecbyts_initStart || performance.now();
            const _readyMs = Math.round(performance.now() - _t);
            window.__ecbyts_appReadyMs = _readyMs;
            window.__ecbyts_appReadyAt = Date.now();
            console.debug(`[ecbyts:boot] handlers ready in ${_readyMs}ms`);
            if (_readyMs > 10000) {
                console.warn(`[ecbyts:boot] SLOW handlers ready (${_readyMs}ms > 10000ms) — Playwright timeouts at risk`);
            }
            // PERF-MASTER-001 S0/S1: avaliar contra budget canônico
            try {
                const { markBootPhase, measureBootSpan, evaluateBudget, detectViewport } = await import('./core/performance/bootBudget.js' as string);
                markBootPhase('handlers-ready');
                const span = measureBootSpan('init-start', 'handlers-ready');
                const viewport = detectViewport();
                const budget = evaluateBudget('appReady', _readyMs, { viewport });
                window.__ecbyts_bootBudget = budget;
                if (budget.severity === 'fail') {
                    console.warn(`[ecbyts:boot] BUDGET FAIL — ${_readyMs}ms > ${budget.budgetMs}ms (${viewport}, ratio=${budget.ratio})`);
                }
                if (span)
                    console.debug(`[ecbyts:boot] init→handlers-ready span = ${span.durationMs}ms`);
            }
            catch (e: any) {
                console.debug('[main] boot-budget-evaluate:', e?.message || e); /* original noop */
            }
        }
        catch (e: any) {
            console.debug('[main] handlers-ready-block:', e?.message || e); /* original noop */
        }
        // API bridge precisa subir cedo em ambiente de automacao.
        // O smoke consulta /api/health logo apos app-ready; se deixarmos a
        // bridge apenas no postboot, o endpoint reporta browser desconectado
        // por puro atraso de inicializacao.
        // T10.1: marca fase + timeout — sem teto próprio.
        markBootPhase(window, 'init:api-bridge-lazy');
        await _withInitTimeout(() => maybeInitApiBridgeLazy(), 'init:api-bridge-lazy');
        // Se nao veio da URL, decide se gera modelo random ou inicia em branco
        // T10.1: só marca fase (sem _withInitTimeout) — o resultado é
        // desestruturado logo abaixo (randomBootResult.showRandomBootState);
        // envolver com timeout trocaria o retorno por null em caso de stall,
        // quebrando essa leitura. A marca de fase já é suficiente p/ bisseção.
        markBootPhase(window, 'init:random-boot');
        const randomBootResult = await runRandomBootSequence({
            loadedFromURL,
            initConfig,
            initCallId,
            updateLoading: _updateLoading,
            applyModel,
            clearModelData,
            clearIssues,
            clearAllLabels,
            clearHistory,
            setHomePreparingRandom,
            setBootPreparing,
            getModelId,
            showToast,
            translate: t,
            documentRef: document,
            localStorageRef: localStorage,
            updateGlobe,
            skipRandomBootForTrainingDeepLink: _deepLinkToolForBoot === 'training',
        });
        _showRandomBootState = randomBootResult.showRandomBootState === true;
        // 5. Interface — o shell de UI (ribbon + panelManager + tabs + sections)
        // já foi inicializado ANTES de random-boot/feature-init/postboot em
        // BOOT-RESILIENCE-001 para não ser gated por timeout de fase posterior.
        // (moved above; era aqui — ver comentário no hoisting.)
        // LOADING-PERF-001 RF-4: ceder a thread entre a construção do shell de UI
        // (síncrona, pesada) e a inicialização das features. Mesma ordem; só um
        // respiro p/ o browser pintar o shell antes de prosseguir.
        await yieldToMain();
        // T10.1: marca fase. runFeatureInitSequence já recebe withInitTimeout
        // e aplica timeout por-feature internamente (feature-init.ts) — não
        // precisa de outro wrap aqui, só a marca para bisseção.
        markBootPhase(window, 'init:feature-init');
        await runFeatureInitSequence({
            withInitTimeout: _withInitTimeout,
            initGroups,
            initReport,
            initFilterPresets,
            initTicker,
            initTickerBar,
            initGeoHud,
            initSceneHud,
            initCalculator,
            registerCalculatorBridge,
            getCalculatorItems,
            initConstants,
            initInterpolation,
            initVoxel,
            features: CONFIG.FEATURES,
            setMarkerRefreshCallback,
            refreshAllMarkers,
            loadIssues,
            documentRef: document,
            initBountyPanel,
            updateBountyBadge,
            initHudCards,
            initHudCardsPanel,
            initEquipmentHud,
            initEquipmentHudPanel,
            initVizSettings,
            initVizSettingsBar,
            initSymbology,
            initInspector,
            initInspectorPanel,
        });
        setupGlobalEventListeners({
            handleResize,
            showToast,
            isEditing,
            getEditMode,
            exitGizmoMode,
            exitEditMode,
            getSelectedVertexIndex,
            setGizmoMode,
            toggleGizmoSpace,
            toggleGizmoShapeEdit,
            toggleSnap,
            getSelectedElement,
            getAllElements,
            updateLanguageSelector,
            applyTranslations,
            refreshAutoLabelNames,
            invalidateUI,
            updateGlobe,
            refreshGeoLayers: _refreshGeoLayers,
            updateConstellation,
            updateStatusBar,
            scheduleSessionSave: _scheduleSessionSave,
            scheduleCameraSave: _scheduleCameraSave,
            renderVizSettings,
            renderInspector,
            handleFileInputChange,
            handleKeyInputChange,
            updateAuthUI,
            translate: t,
        });
        runFeaturePostEventsSequence({
            initProjectAreas,
            initAreasTree,
            initAnalyticsModule,
            initUncertaintyHubPanel,
            initFormAccessibility,
        });
        // LOADING-PERF-001 RF-4: respiro entre features pós-eventos e a ativação
        // pós-shell (registerAllHandlers etc.), os dois blocos mais pesados do boot.
        await yieldToMain();
        if (CONFIG.FEATURES.PROJECT_TABS) {
            // CRÍTICO IS-5/6 fix 2026-06-02: aguardar initProjectTabBar
            // resolver. _initProjectTabBar é async (await _restoreFromIDB
            // + openTab). Sem await, getProjectTabsSnapshot retornava
            // vazio e bridge.currentId nunca era populado → snapshot
            // skip + restore vazio.
            // T10.1: marca fase + timeout — sem teto próprio; preferível
            // seguir o boot com warning a travar 45s no watchdog.
            markBootPhase(window, 'init:project-tabs');
            await _withInitTimeout(() => initProjectTabBar(), 'init:project-tabs');
            // TAB-MODEL-SWITCH-001 F5+F6+F8: wire completo.
            //  F5: substitui handler legacy window.handleSwitchProjectTab por
            //      bridge real (snapshot/restore de 7 managers críticos).
            //  F6: passa onProgress que mostra loading overlay durante swap.
            //  F8: runLegacyMigration auto cria "Projeto 1" preservando state
            //      legacy do usuário ao habilitar feature pela 1ª vez.
            if ((CONFIG.FEATURES as any).TAB_MODEL_SWITCH) {
                wireProjectTabBarToSwitchBridge({
                    onProgress: createSwitchOverlayHandler({ t }),
                });
                // CRÍTICO bug fix 2026-06-02 (IS-5/6): bridge precisa saber
                // da tab inicial ANTES do usuário clicar em "+". Versão
                // anterior usava import().then() async — race condition
                // permitia click antes do setCurrentTabIdForWire executar,
                // resultando em currentId=null + snapshot skipped + restore
                // vazio. Static import + call síncrono elimina o race.
                try {
                    const initialSnap = getProjectTabsSnapshotForMig();
                    const initialActiveId = (initialSnap as any)?.activeTabId
                        || ((initialSnap as any)?.tabs?.[0]?.id ?? null);
                    if (initialActiveId && typeof setCurrentTabIdForWire === 'function') {
                        setCurrentTabIdForWire(initialActiveId);
                    }
                }
                catch (e: any) {
                    console.debug('[main:tab-init] initial tab sync failed:', e?.message || e);
                }
                // F8 wire: legacy migration auto (idempotente via IDB marker)
                try {
                    const idbAdapter = createTabModelSnapshotsAdapter();
                    const migDeps = buildDefaultMigrationDeps({
                        snapshotCurrent: bridgeSnapshotCurrent,
                        bridgeDeps: buildBridgeDepsForMig(),
                        countOpenTabs: () => {
                            const snap = getProjectTabsSnapshotForMig();
                            return Array.isArray((snap as any)?.tabs) ? (snap as any).tabs.length : 0;
                        },
                        createTabRegistryEntry: ({ title }: { title: string }) => {
                            try {
                                const tab: any = openProjectTabForMig({ title });
                                return tab?.id || undefined;
                            }
                            catch (e: any) {
                                console.debug('[main:F8] create tab registry entry failed:', e?.message || e);
                                return undefined;
                            }
                        },
                        idb: idbAdapter,
                        title: t ? t('projectTabs.defaultTitle') : 'Projeto 1',
                    });
                    runLegacyMigration(migDeps)
                        .then((r) => console.debug('[main:F8] legacy migration', r))
                        .catch((e) => console.debug('[main:F8] migration failed:', e?.message || e));
                }
                catch (e: any) {
                    console.debug('[main:F8] wire skipped:', e?.message || e);
                }
            }
        }
        // T10.1: marca fase + timeout — sem teto próprio.
        markBootPhase(window, 'init:post-shell-activation');
        await _withInitTimeout(() => runPostShellActivationSequence({
            mountFeedbackWidgetLazy,
            registerAllHandlers,
            registerFeedbackBridges,
            registerHandlerRegistryBridge,
            translate: t,
            requestUIRefresh,
            updateAnalyticsData,
            updateLoading: _updateLoading,
            initTour,
            maybeAutoStartTourLazy,
            initHistory,
            buildModel,
            applyModel,
            installSequencerLazyBridge,
        }), 'init:post-shell-activation');
        // LOADING-PERF-001 RF-4: ceder entre ativação pós-shell (handlers) e a
        // hidratação pós-shell (home grid, ícones, customize) — blocos longos em série.
        await yieldToMain();
        // T10.1: marca fase + timeout — sem teto próprio.
        markBootPhase(window, 'init:post-shell-hydration');
        await _withInitTimeout(() => runPostShellHydrationSequence({
            applySavedView,
            documentRef: document,
            hydrateIcons,
            initCustomize,
            initHomeGrid,
            initHomeHeader,
            initIconObserver,
            initSnapshotEngine,
            loadedFromURL,
            localStorageRef: localStorage,
            setBootPreparing,
            setCameraState,
            setHomePreparingRandom,
            showRandomBootState: _showRandomBootState,
            translate: t,
            requestUIRefresh,
            updateLoading: _updateLoading,
        }), 'init:post-shell-hydration');
        // COMPLIANCE-PRESET-001 UI wire (claude - executor 2026-06-06)
        try {
            initComplianceUi();
        }
        catch (e: any) {
            console.debug('[main] initComplianceUi failed:', e?.message || e);
        }
        // ACTION-PLAN-001 (FASE 2 UI) — revela a aba "Plano de Ação" no painel
        // constellation quando CONFIG.FEATURES.ACTION_PLAN === true (guard
        // defensivo dentro de initActionPlanUi; no-op silencioso com a flag off).
        try {
            initActionPlanUi();
        }
        catch (e: any) {
            console.debug('[main] initActionPlanUi failed:', e?.message || e);
        }
        // CONSIST-OBS-001 S2 — admin panel "Consistência do Sistema" handlers
        // + statusbar badge (sempre visível quando flag ON — UI-first regra Calvin)
        try {
            registerConsistencyPanelHandlers();
            initConsistencyStatusBadge().catch((e: any) =>
                console.debug('[main] consistencyStatusBadge init err:', e?.message || e)
            );
        }
        catch (e: any) {
            console.debug('[main] registerConsistencyPanelHandlers failed:', e?.message || e);
        }
        // MKT-OWNER-VERIFY-001 F2 — painel Licenças de Modelos Pagos
        // (Minhas Obras + Obras Adquiridas). Gate: flag MARKETPLACE_OWNER_VERIFY.
        try {
            registerOwnerWorksHandlers();
        }
        catch (e: any) {
            console.debug('[main] registerOwnerWorksHandlers failed:', e?.message || e);
        }
        // T2.3 (SPEC_COMMERCIAL_READINESS_DOD) — painel Minhas Compras do
        // comprador: confirmar recebimento + abrir/acompanhar disputa.
        try {
            registerBuyerPurchasesHandlers();
        }
        catch (e: any) {
            console.debug('[main] registerBuyerPurchasesHandlers failed:', e?.message || e);
        }
        // CBMD-001 F4 / T1.3 — BalanceHub (Saldos/Histórico/Alertas): expõe
        // window.openBalanceHub + handleOpenBalanceHub (click do balanceBadge F3.5).
        try {
            registerBalanceHubHandlers();
        }
        catch (e: any) {
            console.debug('[main] registerBalanceHubHandlers failed:', e instanceof Error ? e.message : e);
        }
        // MKT-OWNER-VERIFY-001 RF-7 — verificação pública anônima (D2 Calvin
        // 2026-07-08). SEM gate de flag/login por design (endpoint público).
        try {
            registerLicenseVerifyPublicHandlers();
        }
        catch (e: any) {
            console.debug('[main] registerLicenseVerifyPublicHandlers failed:', e?.message || e);
        }
        // Faróis terreno + georef no statusbar (Calvin 2026-06-11) — confiança
        // visível: terreno carregou? local corretamente posicionado (zona UTM)?
        import('./utils/ui/geoStatusBeacon.js' as string)
            .then((m: any) => m.initGeoStatusBeacon())
            .catch((e: any) => console.debug('[main] geoStatusBeacon init err:', e?.message || e));
        // MOD-LIB-MIG-001 — seed built-in library modules via S4 APIs
        // (B1 trust model valida cada manifest declarativo) + taxonomy
        // bridge: field_meta dos manifests vira taxonomias ativáveis.
        try {
            const seedResult = seedBuiltinLibraryModules();
            // LOADING-PERF-001 RF-4: ceder a thread entre seed e sync de taxonomias —
            // são dois blocos determinísticos pesados em série; o yield deixa o
            // browser pintar/responder entre eles SEM mudar a ordem (seed continua
            // antes do sync, que ainda depende do seed ter rodado).
            await yieldToMain();
            const taxResult = syncLibraryFieldMetaToTaxonomies();
            console.debug('[main] library seed:', seedResult.accepted, '/', seedResult.total,
                '· taxonomies:', taxResult.registered);
        }
        catch (e: any) {
            console.debug('[main] seedBuiltinLibraryModules failed:', e?.message || e);
        }
        // LOADING-PERF-001 RF-4: ceder antes da sequência de lifecycle pós-boot.
        await yieldToMain();
        // T10.1: marca fase + timeout — sem teto próprio (última etapa pós-preflight).
        markBootPhase(window, 'init:postboot-lifecycle');
        await _withInitTimeout(() => runPostbootLifecycleSequence({
            animate,
            destroyBroadcastSync,
            documentRef: document,
            getTickerConfig,
            hasPendingSave: hasPendingSessionSave,
            initBroadcastSync,
            initCallId,
            initConfig,
            initDisclaimer,
            initFineScenarioConsoleLazy,
            initPerfHud,
            isSceneReady,
            loadedFromURL,
            maybeInitApiBridgeLazy,
            registerPerfMonitorBridge,
            restoreInitForm,
            runRandomPostbootSequence,
            scheduleOptionalUiBootstrapsLazy,
            scheduleIdlePreloadsLazy,
            scheduleScreenshotPrewarmLazy,
            warmupSaoNnLazy,
            setSaveStatus: _setSaveStatus,
            setTickerBarVisible,
            setupBroadcastListeners,
            showToast,
            stopLoadingTips: _stopLoadingTips,
            togglePerfHud,
            translate: t,
            requestUIRefresh,
            updateLoading: _updateLoading as any,
            windowRef: window,
        } as any), 'init:postboot-lifecycle');
        // DEEP-LINK-TOOLS-001 — applyDeepLink no FIM do boot, DEFERRED.
        // Pré-seed de localStorage no início (linha ~553) + setTimeout 500ms
        // garantem que applySavedView/loadLayout e qualquer broadcast listener
        // async já tenham resolvido antes do wrapper rodar. Sem o defer, J1 do
        // Playwright revelou que o wrapper rodava com sucesso (logs confirmam)
        // mas algo dispara DEPOIS reverte view+layout. O defer pula essa janela
        // de race condition.
        const _runDeepLink = async () => {
            try {
                const { applyDeepLink } = await import(
                    './utils/sharing/deepLinkDispatcher.js' as string
                );
                await applyDeepLink({
                    onSuccess: (toolId: string) => {
                        showToast(
                            t('share.opened.success')
                                || 'Tela aberta a partir do link compartilhado',
                            'success',
                        );
                        console.debug('[ecbyts:boot] deep-link applied', toolId);
                    },
                    onError: (reason: string, detail: string) => {
                        if (reason !== 'no-tools-param') {
                            showToast(
                                t('share.opened.fallback')
                                    || 'Link inválido — abrindo ferramenta vazia',
                                'warning',
                            );
                            console.debug('[ecbyts:boot] deep-link error', reason, detail);
                        }
                    },
                });
            }
            catch (_e: any) {
                console.debug(
                    '[ecbyts:boot] deep-link dispatcher import failed',
                    _e?.message || _e,
                );
            }
        };
        // Defer 3s para escapar dos side-effects async do boot (applySavedView,
        // broadcast listeners, scene reinit). Empiricamente verificado via
        // Playwright J1: applySavedView no runPostShellHydrationSequence
        // restaura view 'actions' DEPOIS do boot principal terminar. 3s cobre.
        setTimeout(() => {
            _runDeepLink().catch((e: any) =>
                console.debug('[ecbyts:boot] deep-link deferred failed', e?.message || e)
            );
        }, 3000);
    }
    catch (err: any) {
        console.error('[ecbyts] Init failed:', err);
        // Mostra erro visivel para o usuario em vez de tela vazia
        document.body.innerHTML = `
        <div style="padding:2rem;font-family:monospace;color:#e74c3c">
            <h2>ecbyts failed to initialize</h2>
            <pre>${err.message}\n${err.stack}</pre>
            <button data-cc-action="cc-90311952" style="margin-top:1rem;padding:.5rem 1rem;cursor:pointer">
                Reload
            </button>
        </div>`;
    }
    finally {
        root.__ecbytsInitState.running = false;
        root.__ecbytsInitState.completed = true;
        clearTimeout(bootWatchdog);
        _stopLoadingTips();
        console.debug('[ecbyts:init] finish', {
            callId: initCallId,
            durationMs: Date.now() - initStartedAt,
            bootMarker: appNode?.dataset?.ecbytsBootId || null,
        });
    }
}
setupGlobalErrorBoundary({ navigatorRef: navigator, windowRef: window });
initErrorRecoveryRuntime({
    applyModel,
    documentRef: document,
    localStorageRef: localStorage,
    navigatorRef: navigator,
    requestUIRefresh,
    showToast,
    windowRef: window,
});
registerInitDispatcher({ documentRef: document, initFn: init, windowRef: window });
