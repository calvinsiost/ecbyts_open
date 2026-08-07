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
   HANDLER REGISTRY — Central registration of global functions
   Registro central de funcoes globais para o HTML

   Este arquivo e o unico lugar onde funcoes sao expostas no
   objeto window.* para serem chamadas pelos onclick do HTML.

   Por que window.*?
   O HTML usa atributos como data-cc-action="cc-bd4eaa4c".
   Para que isso funcione, a funcao precisa estar acessivel globalmente.
   Este registro centralizado facilita encontrar e manter essas funcoes.
   ================================================================ */
import { registerOrphanPanels } from '../ui/panelDiscoveryAutoRegister.js';
import { installPanelOpenStyleGuard } from '../../main/deferred-styles.js';
import { elementHandlers, setUpdateAllUI as setElementsUpdateAllUI } from './elements.js';
import { boundaryOverlayHandlers } from './boundaryOverlay.js';
import { issuesBcfHandlers } from './issuesBcfHandlers.js';
import { ecbtValidatorHandlers } from './ecbtValidatorHandler.js';
import { verifyKeyHandlers } from './verifyKeyHandler.js';
import { editalTabHandlers } from './editalTabHandler.js';
import { ledgerSummaryHandlers } from './ledgerSummaryHandler.js';
import { esgReportHandlers } from './esgReportHandler.js';
import { q2qDemoHandlers } from './q2qDemoHandler.js';
import { saoHeatmapHandlers } from './saoHeatmapHandler.js';
import { damaQualityHandlers } from './damaQualityHandler.js';
import { eisWeightedHandlers } from './eisWeightedHandler.js';
import { sdgAlignmentHandlers } from './sdgAlignmentHandler.js';
import { decisionRulesHandlers } from './decisionRulesHandler.js';
import { spatialClusteringHandlers } from './spatialClusteringHandler.js';
import { fieldMetaHandlers } from './fieldMetaHandler.js';
import { extendedMetadataHandlers } from './extendedMetadata.js';
import { auditTrailHandlers } from './auditTrailHandler.js';
import { productTiersHandlers } from './productTiersHandler.js';
import { setTier3CoordinateBindingUpdateAllUI, tier3CoordinateBindingHandlers, } from './tier3CoordinateBindingHandler.js';
import { summaryProviderHandlers } from './summaryProvider.js';
import { parameterGroupsHandlers } from './parameterGroupsHandler.js';
import { eisRadarConfigHandlers } from './eisRadarConfigHandler.js';
import { notificationsExtHandlers } from './notificationsExtHandler.js';
import { elementListHandlers, setUpdateAllUI as setElementListUpdateAllUI } from './elementList.js';
import { registerLaunchpadDrilldowns } from './launchpadDrilldowns.js';
import { observationHandlers, setUpdateAllUI as setObservationsUpdateAllUI } from './observations.js';
import { projectHandlers } from './project.js';
import { campaignHandlers } from './campaigns.js';
import { sceneHandlers } from './scenes.js';
import { llmChatHandlers, setRequestUIRefresh as setLLMRequestUIRefresh } from './llmChat.js';
import { agentHandlers } from './agents.js';
import { smartImportHandlers, setSmartImportUpdateAllUI } from './smartImport.js';
import { mergeHandlers, setMergeRequestUIRefresh } from './merge.js';
import { governanceHandlers, setGovernanceRequestUIRefresh } from './governance.js';
import { saoHandlers } from './sao.js';
import { sensorHandlers, setUpdateAllUI as setSensorUpdateAllUI } from './sensor.js';
import { historyHandlers } from './history.js';
import { tickerHandlers, setUpdateAllUI as setTickerUpdateAllUI } from './ticker.js';
import * as authHandlersModule from './auth.js';
import { observerHandlers } from './observer.js';
import { groupHandlers, setGroupsUpdateAllUI } from './groups.js';
import { aerialHandlers, setAerialUpdateAllUI } from './aerial.js';
import { reportHandlers, setReportUpdateAllUI } from './report.js';
import { xlsxHandlers } from './xlsx.js';
import { libraryHandlers, setLibrariesUpdateAllUI } from './libraries.js';
import { shapeEditHandlers } from './shapeEdit.js';
import { editNavigationHandlers } from './editNavigation.js';
import { hudCardsHandlers, setHudCardsUpdateAllUI } from './hudCards.js';
import { equipmentHudHandlers, setEquipmentHudUpdateAllUI } from './equipmentHud.js';
import { impactHandlers } from './impact.js';
import { modelHandlers } from './models.js';
import { projectTabsHandlers } from './projectTabs.js';
import { showGeoHud, hideGeoHud, toggleMinimize, getGeoHudVisibility } from '../ui/geoHud.js';
import { vizSettingsHandlers } from './vizSettings.js';
import { handleOpenSupportModal, handleCloseSupportModal, handleSubmitSupportTicket, initSupportModal } from '../ui/supportModal.js';
import { inspectorHandlers, setInspectorUpdateAllUI } from './inspector.js';
import { showcaseHandlers } from '../ui/showcaseModal.js';
import { nnHandlers, setNNUpdateAllUI } from './nn.js';
import { systemHandlers } from './systemHandlers.js';
import { calculatorHandlers, setCalculatorUpdateAllUI } from './calculator.js';
import { hypothesisTestHandlers } from './hypothesisTest.js';
import { backgroundAnalysisHandlers } from './backgroundAnalysis.js';
import { macCurveHandlers } from './macCurve.js';
import { droneLogisticsHandlers } from './droneLogistics.js';
import { projectRegistryHandlers, setProjectRegistryRequestUIRefresh } from './projects.js';
import { interpolationHandlers, setInterpolationHandlerUpdateAllUI } from './interpolation.js';
import { handleStartCrossSection, handleOpenCrossSectionPanel, handleCloseCrossSectionPanel, handleExportCrossSection, handleCancelCrossSection, } from './crossSection.js';
import { voxelHandlers, setVoxelUpdateAllUI } from './voxel.js';
import { simulationHandlers, setSimulationUpdateAllUI } from './simulation.js';
import { boreholeHandlers, setBoreholeUpdateAllUI } from './borehole.js';
import { tourHandlers, setTourHandlerUpdateAllUI } from './tour.js';
import { demoHandlers, setDemoHandlerUpdateAllUI } from './demo.js';
import { cloudHandlers, setCloudRequestUIRefresh } from './cloud.js';
import { ingestionHandlers, setUpdateAllUI as setIngestionUpdateAllUI } from './ingestion.js';
import { labReconciliationHandlers } from './labReconciliation.js';
import { filesHandlers, setFilesUpdateAllUI } from './files.js';
import { photologHandlers, setPhotologHandlerUpdateAllUI } from './photolog.js';
import { showLoading, hideLoading, setLoadingMessage, setLoadingProgress, withLoading, forceHideLoading, } from '../ui/loadingOverlay.js';
import { eisHandlers } from './eis.js';
import { purposeHandlers } from './purpose.js';
import { spatialHandlers, setUpdateAllUI as setSpatialUpdateAllUI } from './spatial.js';
import { workflowHandlers, setWorkflowsUpdateAllUI } from './workflows.js';
import * as pipelineHandlersModule from './pipelines.js';
import { costAnalysisHandlers } from './costAnalysis.js';
import { costCenterHandlers, setCostCenterRequestUIRefresh } from './costCenter.js';
import { homeHeaderHandlers } from './homeHeader.js';
import { dataEntryHandlers, setDataEntryUpdateAllUI } from './dataEntry.js';
import { optimizationHandlers, setOptimizationRequestUIRefresh } from './optimization.js';
import { scenarioSimulationHandlers } from './scenarioSimulation.js';
import { energyFlowSankeyHandlers } from './energyFlowSankey.js';
import { labelHandlers } from './labels.js';
import { imageryHandlers } from './imagery.js';
// quickActionHandlers REMOVED - lightbulb migrated to Proactive AI tips
import { temporalAnalysisHandlers } from './temporalAnalysis.js';
import { ecoToolsHandlers } from './ecoTools.js';
import { symbologyHandlers, setSymbologyHandlerDeps } from './symbology.js';
import { validationHandlers, setValidationUpdateAllUI } from './validationHandlers.js';
import { domainValidationHandlers, setDomainValidationUpdateAllUI } from './domainValidation.js';
import { ownershipHandlers } from './ownership.js';
import { orgHandlers } from './org.js';
import { constantHandlers, setConstantsUpdateAllUI } from './constants.js';
import { hierarchyHandlers, setHierarchyUpdateAllUI } from './hierarchyHandlers.js';
import { issueHandlers } from './issueHandlers.js';
import { bountyHandlers } from './bountyHandlers.js';
import { communityHandlers } from './community.js';
import { homeHandlers } from './home.js';
import { customizeHandlers } from './customize.js';
import { accessibilityHandlers } from './accessibility.js';
import { taxonomyHandlers } from './taxonomy.js';
import { chemistryHandlers } from './chemistry.js';
import { radarHandlers } from './radar.js';
import { walletHandlers } from './wallet.js';
import { automationHandlers } from './automation.js';
import { timeSliderHandlers } from './timeSlider.js';
import { diagramHandlers } from './diagrams.js';
import { openPresentationModal, closePresentationModal, openStepModal, closeStepModal, } from '../ui/presentationModal.js';
import { rasterUploadHandlers } from './rasterUpload.js';
import { healthExportHandlers } from './healthExport.js';
import { healthAlertsHandlers } from './healthAlerts.js';
import { handleBoundaryDrawComplete } from './boundaryDrawSave.js';
import { assessmentHandlers } from './assessment.js';
import { presetHandlers } from './presets.js';
import { libraryServiceHandlers } from './libraryService.js';
import { notificationHandlers } from './notificationHandlers.js';
import { datastudioHandlers } from './datastudio.js';
import { mascotHandlers } from './mascot.js';
import { consentHandlers } from './consent.js';
import { ghgInventoryHandlers } from './ghgInventoryHandler.js';
import { trlMrvHandlers } from './trlMrvHandlers.js';
import { ohsHandlers } from './ohs.js';
import { eisDriftAdminHandlers } from './eisDriftAdminHandler.js';
// productWizard: dynamic import para nao quebrar handler chain se modulo falhar
// (mesmo padrao do sequencer.js)
import { openRegulatoryStandards, handleRegMatrixChange, handleRegLandUseChange, handleRegAddThreshold, handleRegRemoveCustom, handleRegulatoryExport, handleRegulatoryImport, handleRegulatoryRestore, handleRegGlobalView, } from '../ui/regulatoryModal.js';
// sequencerHandlers: dynamic import (cadeia pesada: videoBot → llm/client → setup)
import { captureSnapshot } from '../ui/snapshot.js';
import { getStorageUsage, getStorageBreakdown, clearModelData, clearWorkspace, isEphemeral, } from '../storage/storageMonitor.js';
import { handleFamilySelectToggleAll, handleFamilySelectConfirm } from '../ui/familySelectModal.js';
import { listNetworks, getNetwork, getNetworkMetadata, removeNetwork, ensureNN } from '../../core/nn/manager.js';
// predictionHandlers and auditHandlers are bot-only (not exposed on window)
// They are invoked via LLM commandExecutor.js actions: ANALYZE_TRENDS, SUGGEST_SAMPLING, RUN_AUDIT
// Funcoes importadas diretamente dos modulos originais
// (nao precisaram de handler wrapper)
import { setLanguage, toggleLanguageDropdown } from '../i18n/translations.js';
import { setIsometricView, setTopView, setFrontView, zoomIn, zoomOut, resetView, fitAllElements, getCameraState, setCameraState, toggleViewMode, getViewMode, setViewMode, } from '../scene/controls.js';
import { setGlobeDetailLevel } from '../scene/compass.js';
import { switchGroup, getCurrentGroup } from '../scene/viewRouter.js';
import { copyKeyToClipboard, copyShareURL } from '../../core/io/export.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { getCapabilityModules, isCapabilityEnabled } from '../../config/libraryCategories.js';
import { initMessageLog } from '../helpers/messageLog.js';
import { switchRibbonTab } from '../ui/ribbon.js';
import { handleAppError } from '../helpers/appError.js';
import { createLogger } from '../helpers/logger.js';
import { initCommandPalette, registerCommands, toggleCommandPalette, openCommandPalette, } from '../ui/commandPalette.js';
import { openReportBugModal } from '../ui/reportBugModal.js';
const log = createLogger('Handlers');
// Panel toggle functions are registered by panelManager.js in initPanelManager()
import * as modalHandlersModule from '../ui/modals.js';
import { getSelectedElement } from '../../core/elements/manager.js';
const window = (globalThis.window);
const document = (globalThis.document);
// eslint-disable-next-line
const CustomEvent = (globalThis.CustomEvent);
const { authHandlers, setAuthRequestUIRefresh } = (authHandlersModule);
const { pipelineHandlers, setPipelinesUpdateAllUI } = (pipelineHandlersModule);
const { openExportModal, openImportModal, setImportMode, executeImport, closeModal, closeOnOverlayClick, handleCopyKey, handleCopyURL, handleDownload, onExportFormatChange, openFamilyManager, handleFamilyToggle, handleFamilyDelete, handleAddCustomFamily, toggleBlockchainOptions, onKeySelectChange, createNewKey, } = (modalHandlersModule);
/**
 * Register all handler functions on the window object.
 * Registra todas as funcoes no window para uso no HTML.
 * Tambem injeta a funcao requestUIRefresh nos handlers que precisam dela.
 *
 * @param {any} requestUIRefresh - The domain-scoped UI refresh function
 * @param {any} updateAnalyticsData - The analytics data update function
 */
export function registerAllHandlers( requestUIRefresh: any, updateAnalyticsData: any) {
    // System message capture (Mais → Logs) — install console/error hooks early.
    initMessageLog();
    // V3: drill-down handlers for launchpad hero KPI clicks.
    // Registered early so (window as any).handleOpenEisModal etc are resolvable
    // before hero first renders.
    registerLaunchpadDrilldowns();
    // Panel Discovery Auto-Register (Calvin diretiva 2026-05-27):
    // Auto-expose orphan panels (sem caller direto) via window.handleOpen<X>
    // + dropdown items no ribbon "Mais" + auto-discovery em systemCatalogModal.
    // Padrão programático: novos painéis em _panelDiscoveryRegistry.ts são
    // expostos automaticamente sem código adicional.
    registerOrphanPanels();
    // Injeta requestUIRefresh nos handlers que precisam.
    setElementsUpdateAllUI(requestUIRefresh);
    setElementListUpdateAllUI(requestUIRefresh);
    setObservationsUpdateAllUI(requestUIRefresh);
    setTier3CoordinateBindingUpdateAllUI(requestUIRefresh);
    setLLMRequestUIRefresh(requestUIRefresh);
    setSmartImportUpdateAllUI(requestUIRefresh);
    setMergeRequestUIRefresh(requestUIRefresh);
    setGovernanceRequestUIRefresh(requestUIRefresh);
    setProjectRegistryRequestUIRefresh(requestUIRefresh);
    setSensorUpdateAllUI(requestUIRefresh);
    setTickerUpdateAllUI(requestUIRefresh);
    setAuthRequestUIRefresh(requestUIRefresh);
    setGroupsUpdateAllUI(requestUIRefresh);
    setAerialUpdateAllUI(requestUIRefresh);
    setReportUpdateAllUI(requestUIRefresh);
    setLibrariesUpdateAllUI(requestUIRefresh);
    setHudCardsUpdateAllUI(requestUIRefresh);
    setEquipmentHudUpdateAllUI(requestUIRefresh);
    setInspectorUpdateAllUI(requestUIRefresh);
    setNNUpdateAllUI(requestUIRefresh);
    setCalculatorUpdateAllUI(requestUIRefresh);
    setInterpolationHandlerUpdateAllUI(requestUIRefresh);
    setVoxelUpdateAllUI(requestUIRefresh);
    setSimulationUpdateAllUI(requestUIRefresh);
    setBoreholeUpdateAllUI(requestUIRefresh);
    setTourHandlerUpdateAllUI(requestUIRefresh);
    setDemoHandlerUpdateAllUI(requestUIRefresh);
    setCloudRequestUIRefresh(requestUIRefresh);
    setIngestionUpdateAllUI(requestUIRefresh);
    setFilesUpdateAllUI(requestUIRefresh);
    setPhotologHandlerUpdateAllUI(requestUIRefresh);
    setSpatialUpdateAllUI(requestUIRefresh);
    setWorkflowsUpdateAllUI(requestUIRefresh);
    setPipelinesUpdateAllUI(requestUIRefresh);
    setDataEntryUpdateAllUI(requestUIRefresh);
    setOptimizationRequestUIRefresh(requestUIRefresh);
    setSymbologyHandlerDeps(requestUIRefresh);
    setValidationUpdateAllUI(requestUIRefresh);
    setDomainValidationUpdateAllUI(requestUIRefresh);
    setConstantsUpdateAllUI(requestUIRefresh);
    setHierarchyUpdateAllUI(requestUIRefresh);
    setCostCenterRequestUIRefresh(requestUIRefresh);
    // Force update handler - wired to the clickable version label in the
    // titlebar logo. Self-service escape hatch when cache-bust fails.
    // Ver: app/js/utils/startup/versionGate.js + SPEC_FORCE_UPDATE_STRATEGY.md
    window.handleForceUpdate = async () => {
        try {
            const { asyncConfirm } = await import('../ui/asyncDialogs.js' as string);
            const confirmed = await asyncConfirm('Isso vai limpar cache local e layout salvos, depois recarregar a página. ' +
                'Suas credenciais, idioma e dados do modelo serão preservados. Continuar?', { confirmLabel: 'Forçar atualização', cancelLabel: 'Cancelar' });
            if (!confirmed)
                return;
            const { forceUpdate } = await import('../startup/versionGate.js' as string);
            await forceUpdate();
        }
        catch (err: any) {
            console.error('[forceUpdate] failed:', err);
            // Last-resort fallback: hard reload
            if (typeof window !== 'undefined')
                window.location.reload();
        }
    };
    // Registra handlers dos modulos
    Object.assign(window, elementHandlers);
    Object.assign(window, boundaryOverlayHandlers);
    Object.assign(window, issuesBcfHandlers);
    Object.assign(window, ecbtValidatorHandlers);
    Object.assign(window, verifyKeyHandlers);
    Object.assign(window, editalTabHandlers);
    Object.assign(window, ledgerSummaryHandlers);
    Object.assign(window, esgReportHandlers);
    Object.assign(window, q2qDemoHandlers);
    Object.assign(window, saoHeatmapHandlers);
    Object.assign(window, damaQualityHandlers);
    Object.assign(window, eisWeightedHandlers);
    Object.assign(window, sdgAlignmentHandlers);
    Object.assign(window, decisionRulesHandlers);
    Object.assign(window, spatialClusteringHandlers);
    Object.assign(window, fieldMetaHandlers);
    Object.assign(window, extendedMetadataHandlers);
    Object.assign(window, auditTrailHandlers);
    Object.assign(window, productTiersHandlers);
    Object.assign(window, tier3CoordinateBindingHandlers);
    Object.assign(window, summaryProviderHandlers);
    Object.assign(window, parameterGroupsHandlers);
    Object.assign(window, eisRadarConfigHandlers);
    Object.assign(window, notificationsExtHandlers);
    window.handleBoundaryDrawComplete = handleBoundaryDrawComplete;
    Object.assign(window, elementListHandlers);
    Object.assign(window, observationHandlers);
    Object.assign(window, projectHandlers);
    Object.assign(window, campaignHandlers);
    Object.assign(window, sceneHandlers);
    Object.assign(window, llmChatHandlers);
    Object.assign(window, agentHandlers);
    Object.assign(window, smartImportHandlers);
    Object.assign(window, mergeHandlers);
    Object.assign(window, governanceHandlers);
    Object.assign(window, costCenterHandlers);
    Object.assign(window, homeHeaderHandlers);
    Object.assign(window, projectRegistryHandlers);
    Object.assign(window, saoHandlers);
    Object.assign(window, sensorHandlers);
    Object.assign(window, historyHandlers);
    Object.assign(window, tickerHandlers);
    Object.assign(window, authHandlers);
    Object.assign(window, observerHandlers);
    Object.assign(window, groupHandlers);
    Object.assign(window, aerialHandlers);
    Object.assign(window, reportHandlers);
    Object.assign(window, xlsxHandlers);
    Object.assign(window, libraryHandlers);
    Object.assign(window, shapeEditHandlers);
    Object.assign(window, editNavigationHandlers);
    Object.assign(window, hudCardsHandlers);
    Object.assign(window, equipmentHudHandlers);
    Object.assign(window, impactHandlers);
    Object.assign(window, modelHandlers);
    Object.assign(window, projectTabsHandlers);
    window.handleToggleGeoHud = () => {
        const vis = getGeoHudVisibility();
        if (vis === 'hidden')
            showGeoHud();
        else if (vis === 'expanded')
            toggleMinimize();
        else
            showGeoHud();
    };
    window.handleShowGeoHud = showGeoHud;
    window.handleHideGeoHud = hideGeoHud;
    // SPEC_READINGS_METADATA_RETENTION F5 (front-first) — demo handler
    // Substituir handler real quando wire no inspector estiver pronto (F5.5)
    import('../ui/retentionExtendModal.js' as string)
        .then(({ handleShowRetentionDemo }: any) => {
            window.handleShowRetentionDemo = handleShowRetentionDemo;
        })
        .catch((_e: any) => console.debug('[utils/handlers/index:retention-demo]', _e?.message || _e));
    // SPEC_AI_REPORT_TEMPLATE_MARKETPLACE F2 (front-first) — publish demo handler
    // Substituir stub por RPC `publish_ai_report_template` em F2.3
    import('../ui/aiReportPublishModal.js' as string)
        .then(({ handleAIReportPublishDemo }: any) => {
            window.handleAIReportPublishDemo = handleAIReportPublishDemo;
        })
        .catch((_e: any) => console.debug('[utils/handlers/index:ai-report-publish-demo]', _e?.message || _e));
    // SPEC_AI_REPORT_TEMPLATE_MARKETPLACE F2.4 (front-first) — browse demo handler
    // Substituir stub fetchRows por Supabase select em F2.5
    import('../ui/aiReportBrowseModal.js' as string)
        .then(({ handleAIReportBrowseDemo }: any) => {
            window.handleAIReportBrowseDemo = handleAIReportBrowseDemo;
        })
        .catch((_e: any) => console.debug('[utils/handlers/index:ai-report-browse-demo]', _e?.message || _e));
    // Scene HUD show/hide (toggle via ribbon)
    import('../ui/sceneHud.js' as string)
        .then(({ showSceneHud, hideSceneHud, toggleSceneHudMinimize }: any) => {
        window.handleShowSceneHud = showSceneHud;
        window.handleHideSceneHud = hideSceneHud;
        window.handleToggleSceneHudMinimize = toggleSceneHudMinimize;
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // Filter Radar HUD (FEAT-FILTER-RADAR-001)
    import('../ui/filterHud/filterRadarHud.js' as string)
        .then(({ toggleFilterRadarHud, closeFilterRadarHud }: any) => {
        window.handleToggleFilterRadarHud = toggleFilterRadarHud;
        window.handleCloseFilterRadarHud = closeFilterRadarHud;
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // Magnifier (lupa) toggle + context menu
    import('../scene/magnifier.js' as string)
        .then(({ toggleMagnifier, showMagnifierMenu }: any) => {
        window.handleToggleMagnifier = toggleMagnifier;
        window.handleMagnifierMenu = showMagnifierMenu;
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    Object.assign(window, vizSettingsHandlers);
    Object.assign(window, inspectorHandlers);
    Object.assign(window, showcaseHandlers);
    Object.assign(window, nnHandlers);
    Object.assign(window, systemHandlers);
    Object.assign(window, calculatorHandlers);
    Object.assign(window, hypothesisTestHandlers);
    Object.assign(window, backgroundAnalysisHandlers);
    Object.assign(window, macCurveHandlers);
    Object.assign(window, droneLogisticsHandlers);
    Object.assign(window, interpolationHandlers);
    Object.assign(window, {
        handleStartCrossSection,
        handleOpenCrossSectionPanel,
        handleCloseCrossSectionPanel,
        handleExportCrossSection,
        handleCancelCrossSection,
    });
    Object.assign(window, voxelHandlers);
    Object.assign(window, simulationHandlers);
    Object.assign(window, boreholeHandlers);
    // Geology popup handlers (strata, VE, overlay, presets)
    import('./geology.js' as string)
        .then((mod: any) => {
        window.handleOpenGeologyPopup = mod.handleOpenGeologyPopup;
        window.handleGeoStrataToggle = mod.handleGeoStrataToggle;
        window.handleGeoAutoHideTop = mod.handleGeoAutoHideTop;
        window.handleGeoEdgeLines = mod.handleGeoEdgeLines;
        window.handleGeoVE = mod.handleGeoVE;
        window.handleGeoOverlay = mod.handleGeoOverlay;
        window.handleGeoPreset = mod.handleGeoPreset;
        window.handleGeoLayerToggle = mod.handleGeoLayerToggle;
        window.handleGeoContoursToggle = mod.handleGeoContoursToggle;
        mod.initGeologySettings();
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // EIS terrain probe (valor no ponto do terreno sob o cursor)
    import('./eisTerrainProbe.js' as string)
        .then((mod: any) => {
        window.handleToggleEisTerrainProbe = mod.handleToggleEisTerrainProbe;
        window.handleEisTerrainProbeContextMenu = mod.handleEisTerrainProbeContextMenu;
        mod.initEisTerrainProbe();
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    Object.assign(window, tourHandlers);
    Object.assign(window, demoHandlers);
    Object.assign(window, cloudHandlers);
    Object.assign(window, ingestionHandlers);
    Object.assign(window, labReconciliationHandlers);
    Object.assign(window, labReconciliationHandlers);
    Object.assign(window, filesHandlers);
    Object.assign(window, photologHandlers);
    // Offline Field Mode badge — SPEC_OFFLINE_FIELD_MODE OFFLINE-FIELD-001
    import('../ui/fieldModeBadge.js' as string)
        .then((m: any) => m.initFieldModeBadge())
        .catch((_e: any) => console.debug('[utils/handlers/index:field-mode-badge]', _e?.message || _e));
    // PhotoLog bridge: accessors for photoMarker.js (mesh positions) and manager.js (author)
    import('../../core/elements/manager.js' as string)
        .then((m: any) => {
        window._ecbtGetMesh = m.getMeshByElementId;
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    import('../auth/session.js' as string)
        .then((m: any) => {
        window._ecbtCurrentUser = m.getCurrentUser;
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // Loading overlay - disponivel globalmente para qualquer modulo
    Object.assign(window, {
        showLoading,
        hideLoading,
        setLoadingMessage,
        setLoadingProgress,
        withLoading,
        forceHideLoading,
    });
    Object.assign(window, eisHandlers);
    Object.assign(window, purposeHandlers);
    Object.assign(window, spatialHandlers);
    Object.assign(window, workflowHandlers);
    Object.assign(window, pipelineHandlers);
    Object.assign(window, costAnalysisHandlers);
    Object.assign(window, dataEntryHandlers);
    Object.assign(window, optimizationHandlers);
    Object.assign(window, scenarioSimulationHandlers);
    Object.assign(window, energyFlowSankeyHandlers);
    Object.assign(window, labelHandlers);
    Object.assign(window, imageryHandlers);
    // quickActionHandlers removed - lightbulb migrated to AI tips
    Object.assign(window, temporalAnalysisHandlers);
    Object.assign(window, ecoToolsHandlers);
    Object.assign(window, symbologyHandlers);
    Object.assign(window, validationHandlers);
    Object.assign(window, domainValidationHandlers);
    Object.assign(window, ownershipHandlers);
    Object.assign(window, orgHandlers);
    Object.assign(window, constantHandlers);
    Object.assign(window, hierarchyHandlers);
    Object.assign(window, issueHandlers);
    Object.assign(window, bountyHandlers);
    Object.assign(window, communityHandlers);
    Object.assign(window, homeHandlers);
    Object.assign(window, datastudioHandlers);
    Object.assign(window, customizeHandlers);
    Object.assign(window, accessibilityHandlers);
    Object.assign(window, taxonomyHandlers);
    Object.assign(window, chemistryHandlers);
    Object.assign(window, radarHandlers);
    Object.assign(window, walletHandlers);
    Object.assign(window, automationHandlers);
    Object.assign(window, timeSliderHandlers);
    Object.assign(window, diagramHandlers);
    Object.assign(window, rasterUploadHandlers);
    Object.assign(window, healthExportHandlers);
    Object.assign(window, healthAlertsHandlers);
    Object.assign(window, assessmentHandlers);
    Object.assign(window, presetHandlers);
    Object.assign(window, libraryServiceHandlers);
    Object.assign(window, notificationHandlers);
    Object.assign(window, mascotHandlers);
    Object.assign(window, eisDriftAdminHandlers);
    Object.assign(window, ohsHandlers);
    Object.assign(window, consentHandlers);
    Object.assign(window, ghgInventoryHandlers);
    Object.assign(window, trlMrvHandlers);
    // Initialize automation bots (registers all bots, loads saved config)
    try {
        window.handleInitAutomation();
    }
    catch (e: any) {
        console.warn('[automation] init skipped:', (e)?.message);
    }
    // --- Cursor Projector (dynamic import - scene module) ---
    import('../scene/cursorProjector.js' as string)
        .then((mod: any) => {
        window.toggleCursorProjector = mod.toggleCursorProjector;
        window.toggleCoordDisplayMinimize = mod.toggleCoordDisplayMinimize;
        window.expandCoordDisplay = mod.expandCoordDisplay;
        window.minimizeCoordDisplay = mod.minimizeCoordDisplay;
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // --- Plume Animation (dynamic import - heavy Three.js + interpolation chain) ---
    import('./plumeAnimation.js' as string)
        .then((mod: any) => {
        Object.assign(window, mod.plumeAnimationHandlers);
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // --- API Key modal alias ---
    window.closeApiKeyModal = () => {
        if (typeof window.handleCloseApiKeys === 'function')
            window.handleCloseApiKeys();
    };
    // --- Service Productization Wizard (dynamic import) ---
    window.handleOpenProductWizard = async (opts: any) => {
        try {
            const { openProductWizard } = await import('../ui/productWizard.js' as string);
            return openProductWizard(opts);
        }
        catch (err: any) {
            log.error('Failed to load product wizard', (err)?.message);
            showToast('Erro ao abrir wizard de produtizacao', 'error');
        }
    };
    window.handleEditProductWizard = async (productId, opts) => {
        try {
            const { editProductWizard } = await import('../ui/productWizard.js' as string);
            return editProductWizard(productId, opts);
        }
        catch (err: any) {
            log.error('Failed to load product wizard for edit', (err)?.message);
            showToast('Erro ao abrir wizard de produtizacao', 'error');
        }
    };
    window.handleCloseProductWizard = async () => {
        try {
            const { closeProductWizard } = await import('../ui/productWizard.js' as string);
            closeProductWizard();
        }
        catch (e: any) {
            console.debug('[handlers] closeProductWizard:', e?.message || e);
        }
    };
    // --- System Logs viewer (Mais → Logs) ---
    window.handleOpenLogs = async () => {
        try {
            const { openLogsModal } = await import('../ui/logsModal.js' as string);
            openLogsModal();
        }
        catch (err: any) {
            log.error('Failed to open logs modal', (err)?.message);
        }
    };
    window.handleCloseLogs = async () => {
        try {
            const { closeLogsModal } = await import('../ui/logsModal.js' as string);
            closeLogsModal();
        }
        catch (e: any) {
            console.debug('[handlers] closeLogs:', e?.message || e);
        }
    };
    // --- Keyboard Shortcuts reference (Mais → Ajuda → Atalhos) ---
    window.handleOpenShortcuts = async () => {
        try {
            const { openShortcutsModal } = await import('../ui/shortcutsModal.js' as string);
            openShortcutsModal();
        }
        catch (err: any) {
            log.error('Failed to open shortcuts modal', (err)?.message);
        }
    };
    window.handleCloseShortcuts = async () => {
        try {
            const { closeShortcutsModal } = await import('../ui/shortcutsModal.js' as string);
            closeShortcutsModal();
        }
        catch (e: any) {
            console.debug('[handlers] closeShortcuts:', e?.message || e);
        }
    };
    // --- Regulatory Standards ---
    window.handleOpenRegulatoryStandards = openRegulatoryStandards;
    window.handleRegMatrixChange = handleRegMatrixChange;
    window.handleRegLandUseChange = handleRegLandUseChange;
    window.handleRegAddThreshold = handleRegAddThreshold as any;
    window.handleRegRemoveCustom = handleRegRemoveCustom;
    window.handleRegulatoryExport = handleRegulatoryExport;
    window.handleRegulatoryImport = handleRegulatoryImport;
    window.handleRegulatoryRestore = handleRegulatoryRestore;
    window.handleRegGlobalView = handleRegGlobalView;
    const sequencerHandlerNames = [
        'handleInitSequencer',
        'handleRefreshStoryboard',
        'handleStoryboardPlay',
        'handleStoryboardPause',
        'handleStoryboardStop',
        'handleStoryboardSeek',
        'handleStoryboardFlyTo',
        'handleAddStoryboardKeyframe',
        'handleRemoveStoryboardKeyframe',
        'handleMoveStoryboardKeyframe',
        'handleSetStoryboardSpeed',
        'handleToggleStoryboardLoop',
        'handleGetStoryboardState',
        'handleDestroyStoryboard',
        'handleGenerateTimelineVideo',
        'handleCancelVideoGeneration',
        'handleGetVideoProgress',
        'handleCanGenerateVideo',
        'handleUpdateStoryboardKeyframe',
        'handleRefreshStoryboardThumbnails',
        'handleGetStoryboardLanes',
        'handleCreateStoryboardLane',
        'handleDeleteStoryboardLane',
        'handleRenameStoryboardLane',
        'handleMoveKeyframeToLane',
    ];
    let sequencerHandlersPromise: Promise<any> | null = null;
    const loadSequencerHandlers = () => {
        if (!sequencerHandlersPromise) {
            sequencerHandlersPromise = import('./sequencer.js' as string).then((mod: any) => {
                Object.assign(window, mod.sequencerHandlers);
                return mod.sequencerHandlers;
            });
        }
        return sequencerHandlersPromise;
    };
    for (const handlerName of sequencerHandlerNames) {
        window[handlerName] = async (...args: any[]) => {
            try {
                const handlers = await loadSequencerHandlers();
                return handlers[handlerName](...args);
            } catch (err: any) {
                log.warn('Sequencer handler failed to load', err?.message || err);
                return null;
            }
        };
    }
    // --- Neural Networks (programmatic API) ---
    // Boot progressivo (lazy NN): estes globais são síncronos (contrato da API). Como
    // initNN saiu do boot crítico, disparamos ensureNN() fire-and-forget no registro p/
    // fechar a janela em que handleListNetworks leria lista vazia. Idempotente (dedupe).
    try { void ensureNN(); } catch (e) { console.debug('[handlers] ensureNN warm-up best-effort skipped', (e as any)?.message || e); }
    window.handleListNetworks = () => listNetworks();
    window.handleGetNetworkInfo = (id: any) => getNetworkMetadata(id);
    window.handleResetNetwork = (id: any) => {
        const nn = getNetwork(id);
        if (nn)
            nn.reset();
    };
    window.handleRemoveNetwork = (id: any) => removeNetwork(id);
    // --- Funcoes de idioma ---
    window.setLanguage = (setLanguage);
    window.handleSetLanguage = ((lang: any) => setLanguage(lang));
    window.toggleLanguageDropdown = toggleLanguageDropdown;
    // --- Funcoes de visualizacao 3D ---
    window.setIsometricView = setIsometricView;
    window.setTopView = setTopView;
    window.setFrontView = setFrontView;
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.resetView = resetView;
    window.fitAllElements = fitAllElements;
    window.getCameraState = getCameraState as any;
    window.setCameraState = setCameraState;
    window.toggleViewMode = toggleViewMode;
    window.getViewMode = getViewMode;
    window.setViewMode = setViewMode;
    window.switchGroup = switchGroup;
    window.getCurrentGroup = getCurrentGroup;
    // Side view toggle - alterna entre vista perspectiva e visada lateral (corte frontal)
    let _sideViewActive = false;
    window.handleToggleSideView = () => {
        _sideViewActive = !_sideViewActive;
        const btn = document.getElementById('side-view-btn');
        if (_sideViewActive) {
            setFrontView();
            if (btn)
                btn.classList.add('active');
        }
        else {
            resetView();
            if (btn)
                btn.classList.remove('active');
        }
    };
    window.setGlobeDetailLevel = setGlobeDetailLevel;
    // --- Funcoes de exportacao ---
    window.openExportModal = openExportModal;
    window.copyExportKey = handleCopyKey;
    window.copyShareURL = handleCopyURL;
    window.downloadKey = handleDownload;
    window.onExportFormatChange = onExportFormatChange;
    window.toggleBlockchainOptions = toggleBlockchainOptions;
    window.onKeySelectChange = onKeySelectChange;
    window.createNewKey = createNewKey;
    window.copyKeyToClipboard = async () => {
        const success = await copyKeyToClipboard();
        if (success)
            showToast(t('keyCopied'), 'success');
    };
    window.shareURL = async () => {
        const success = await copyShareURL();
        if (success)
            showToast(t('urlCopied'), 'success');
    };
    // --- Funcoes de importacao ---
    window.openImportModal = openImportModal;
    window.setImportMode = setImportMode;
    window.executeImport = () => executeImport(requestUIRefresh);

    // --- Funcoes de suporte (CR-027) ---
    window.handleOpenSupportModal = handleOpenSupportModal;
    window.handleCloseSupportModal = handleCloseSupportModal;
    window.handleSubmitSupportTicket = handleSubmitSupportTicket;
    initSupportModal();
    window.getSelectedElement = getSelectedElement;
    // --- Funcoes de modal ---
    window.closeModal = closeModal;
    window.closeOnOverlayClick = closeOnOverlayClick;
    // --- Funcoes de familias ---
    window.openFamilyManager = openFamilyManager;
    window.handleFamilyToggle = handleFamilyToggle;
    window.handleFamilyDelete = handleFamilyDelete;
    window.addCustomFamily = handleAddCustomFamily;
    // --- Family selection modal (Random/Clear) ---
    window.handleFamilySelectToggleAll = handleFamilySelectToggleAll;
    window.handleFamilySelectConfirm = handleFamilySelectConfirm;
    // --- Analytics ---
    window.updateAnalyticsData = updateAnalyticsData;
    // --- Storage Monitor ---
    window.getStorageUsage = getStorageUsage;
    window.getStorageBreakdown = getStorageBreakdown;
    window.clearModelData = clearModelData;
    window.clearWorkspace = clearWorkspace;
    window.isEphemeral = isEphemeral;
    // --- Ribbon tabs ---
    window.switchRibbonTab = switchRibbonTab;
    // --- About ---
    window.showAboutDialog = () => {
        showToast('ecbyts v0.1.0-beta — Environmental Digital Twin Platform', 'info');
    };
    // --- Documentation ---
    window.handleOpenDocs = () => {
        window.open('./docs.html', '_blank', 'noopener');
    };
    window.handleOpenApiDocs = () => {
        window.open('./api-docs.html', '_blank', 'noopener');
    };
    // --- Report Bug ---
    window.handleReportBug = () => {
        openReportBugModal();
    };
    // --- What's New ---
    window.handleOpenWhatsNew = async () => {
        const { openWhatsNewModal } = await import('../whatsNew/modal.js' as string);
        openWhatsNewModal();
    };
    // --- System Catalog (programmatic registry of all features) ---
    window.handleOpenSystemCatalog = async () => {
        const { openSystemCatalogModal } = await import('../ui/systemCatalogModal.js' as string);
        await openSystemCatalogModal();
    };
    // --- Library Hub (categories of shareable/versioned elements) ---
    window.handleOpenLibraryHub = async () => {
        const { openLibraryHubModal } = await import('../ui/libraryHubModal.js' as string);
        openLibraryHubModal();
    };
    // --- Forum (Knowledge Groups — Orkut-inspired, adjacent to Libraries) ---
    window.handleOpenForumModal = async () => {
        const { handleOpenForumModal } = await import('./forum.js' as string);
        return handleOpenForumModal();
    };
    window.handleOpenReputationModal = async () => {
        const { handleOpenReputationModal } = await import('./forum.js' as string);
        return handleOpenReputationModal();
    };
    window.handleCloseForumModal = async () => {
        const { handleCloseForumModal } = await import('./forum.js' as string);
        return handleCloseForumModal();
    };
    /** @param {import('./forum.js' as string).ForumGroupInput} input */
    window.handleCreateForumGroup = async (input: any) => {
        const { handleCreateForumGroup } = await import('./forum.js' as string);
        return handleCreateForumGroup(input);
    };
    /** @param {import('./forum.js' as string).ForumThreadInput} input */
    window.handleCreateForumThread = async (input: any) => {
        const { handleCreateForumThread } = await import('./forum.js' as string);
        return handleCreateForumThread(input);
    };
    /** @param {import('./forum.js' as string).ForumReplyInput} input */
    window.handleForumReply = async (input: any) => {
        const { handleForumReply } = await import('./forum.js' as string);
        return handleForumReply(input);
    };
    /** @param {import('./forum.js' as string).ForumVoteInput} input */
    window.handleForumVote = async (input: any) => {
        const { handleForumVote } = await import('./forum.js' as string);
        return handleForumVote(input);
    };
    /**
     * @param {string} threadOrReplyId
     * @param {string} text
     */
    window.handleModerateForumPost = async (threadOrReplyId: any, text: any) => {
        const { handleModerateForumPost } = await import('./forumModeration.js' as string);
        return handleModerateForumPost(threadOrReplyId, text);
    };
    // ARCH-ADMIN-SEGREG-001 F3.1 (2026-05-30, claude-adm):
    //   handleOpenAgentChannelReader REMOVIDO — agora vive em ecbytsadmin
    //     localhost:3001 sidebar Agent Channel.
    //   handleOpenErrorAdmin REMOVIDO — agora vive em ecbytsadmin sidebar
    //     Bugs (2 tabs: Erros automáticos + Bugs reportados).
    // calvinInbox preservado: é USER-scoped (Calvin's own inbox view), não
    // MASTER admin panel — consume core/session/agentChannelReader (USER reader).
    window.handleOpenAgentChannelReader = async () => {
        log.warn('handleOpenAgentChannelReader deprecated — use http://127.0.0.1:3001 (ecbytsadmin)');
    };
    // --- Calvin Inbox (USER: Calvin-first view of AGENT_CHANNEL.md) ---
    window.handleOpenCalvinInbox = async () => {
        const { openCalvinInboxModal } = await import('../ui/calvinInboxModal.js' as string);
        openCalvinInboxModal();
    };
    window.handleOpenErrorAdmin = async () => {
        log.warn('handleOpenErrorAdmin deprecated — use http://127.0.0.1:3001 (ecbytsadmin)');
    };
    // --- App Error Utility ---
    // Disponivel como (window as any).handleAppError para uso inline e como export para handlers
    window.handleAppError = handleAppError;
    // --- Focus Mode & Snapshot ---
    // FIX 2026-04-10: toggling focus-mode without resizing the Three.js
    // renderer caused an infinite rAF loop (gray screen freeze). CSS
    // collapses grid rows but the canvas keeps old dimensions, and the
    // next frame tries to render a viewport with mismatched size → loop.
    // Fix: after class toggle, wait one frame for layout, then dispatch
    // a resize event so scene/setup.js:handleResize runs.
    const ensureFocusModeExitButton = (enabled: any) => {
        const id = 'focus-mode-exit-btn';
        const existing = document.getElementById(id);
        if (!enabled) {
            if (existing)
                existing.remove();
            return;
        }
        if (existing)
            return;
        const btn = document.createElement('button');
        btn.id = id;
        btn.type = 'button';
        btn.className = 'focus-mode-exit-btn';
        btn.textContent = 'Exit Focus';
        btn.title = 'Exit focus mode (Esc)';
        btn.addEventListener('click', () => {
            if (document.body.classList.contains('focus-mode')) {
                window.handleToggleFocusMode?.();
            }
        });
        document.body.appendChild(btn);
    };
    window.handleToggleFocusMode = () => {
        document.body.classList.toggle('focus-mode');
        document.body.classList.remove('zen-mode');
        ensureFocusModeExitButton(document.body.classList.contains('focus-mode'));
        // Defer resize to after layout settles. Without this, the canvas
        // renders at old dimensions and the scene appears frozen gray.
        requestAnimationFrame(() => {
            try {
                window.dispatchEvent(new Event('resize'));
            }
            catch (e: any) {
                console.debug('[handlers] resize-dispatch:', e?.message || e);
                /* ignore — resize is best-effort */
            }
        });
    };
    window.exitFocusMode = () => {
        if (document.body.classList.contains('focus-mode')) {
            window.handleToggleFocusMode?.();
        }
    };
    // Escape hatch: Esc always exits focus mode.
    if (!window.__ecbytsFocusModeEscBound) {
        document.addEventListener('keydown', (e: any) => {
            if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
                window.handleToggleFocusMode?.();
            }
        });
        window.__ecbytsFocusModeEscBound = true;
    }
    // CETESB-RISK-001 Sub-4.2.2: atalho Alt+R abre painel de Avaliação de Risco.
    // Alt+R (não Ctrl+R) — evita conflito com browser reload. Ignora quando foco
    // está em input/textarea/contenteditable (não interceptar typing do usuário).
    if (!(window as any).__ecbytsRiskShortcutBound) {
        document.addEventListener('keydown', (e: any) => {
            if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
            if (e.key !== 'r' && e.key !== 'R') return;
            const tgt = e.target as HTMLElement | null;
            const tag = tgt?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (tgt?.isContentEditable) return;
            e.preventDefault();
            (window as any).handleOpenRiskAssessment?.();
        });
        (window as any).__ecbytsRiskShortcutBound = true;
    }
    window.handleCaptureSnapshot = captureSnapshot;
    // Panel toggles (toggleLeftPanel, toggleRightPanel, toggleAnalyticsFullscreen)
    // are registered by panelManager.js in initPanelManager()
    // --- Pipeline action allowlist ---
    // Registra subconjunto seguro de handlers como ações executáveis em pipelines.
    // Apenas handlers ambientais e de modelo - auth/admin excluídos por segurança.
    import('../../core/pipelines/executor.js' as string)
        .then(({ registerPipelineAction }: any) => {
        const safeActions = [
            'generateRandomModel',
            'clearWorkspace',
            'handleAddElement',
            'handleRemoveElement',
            'handleAddCampaign',
            'handleAddObservation',
            'handleOpenInterpolationPanel',
            'handleRefreshInterpolationLayer',
            'handleRecomputeVoxels',
            'handleToggleVoxelMode',
            'handleOpenWorkflowPicker',
            'handleOpenEisDashboard',
            'handleAddReport',
            'handleOpenReportOverlay',
            'handleExportReport',
            'handleOpenCalculator',
            'handleCalculateEVA',
            'handleOpenPresentationModal',
        ];
        safeActions.forEach((name: any) => {
            if (typeof window[name] === 'function') {
                registerPipelineAction(name, window[name]);
            }
        });
    })
        .catch((_e: any) => console.debug('[utils/handlers/index:silent-catch]', _e?.message || _e));
    // ================================================================
    // COMMAND PALETTE - Pesquisa Global de Comandos
    // ================================================================
    // Inicializar command palette
    initCommandPalette();
    // Registrar comandos do sistema
    registerSystemCommands();
    // Expor funções globais
    window.toggleCommandPalette = toggleCommandPalette;
    window.openCommandPalette = openCommandPalette;
    // 2026-04-12: Uncertainty Hub opens as center-screen modal from "Mais" menu.
    // Governance badge deep-link + "Mais" menu item both call the same opener.
    window.handleOpenUncertaintyHub = async () => {
        try {
            const mod = await import('../ui/uncertaintyHubPanel.js' as string);
            await mod.openUncertaintyHubModal?.();
        }
        catch (err: any) {
            console.error('[handleOpenUncertaintyHub]', err);
        }
    };
    window.handleCloseUncertaintyHub = async () => {
        try {
            const mod = await import('../ui/uncertaintyHubPanel.js' as string);
            mod.closeUncertaintyHubModal?.();
        }
        catch (err: any) {
            console.error('[handleCloseUncertaintyHub]', err);
        }
    };
    // Back-compat: GV badge still calls handleOpenUncertaintyHubFromGv.
    window.handleOpenUncertaintyHubFromGv = () => window.handleOpenUncertaintyHub?.();
    // UNC-001 Phase-3 (2026-05-15): matrix-aware Tier1→Tier2 MC promotion check.
    // Pure decision — does not run Monte Carlo, only recommends.
    /**
     * @param {unknown} chain
     * @param {unknown} inputs
     * @param {unknown} matrix
     * @param {unknown} complianceCtx
     */
    window.handleEvaluateMcPromotion = async (chain: any, inputs: any, matrix: any, complianceCtx: any) => {
        try {
            const mod = await import('../../core/uncertainty/phase3MatrixAware.js' as string);
            return mod.evaluateMcPromotion?.(chain, inputs, matrix, complianceCtx);
        }
        catch (err: any) {
            console.error('[handleEvaluateMcPromotion]', err);
            return null;
        }
    };
    // FIELD-META-001 Phase 3 - Report Builder skeleton modal.
    window.handleOpenReportBuilder = async () => {
        try {
            const mod = await import('../ui/reportBuilder.js' as string);
            await mod.openReportBuilder?.();
        }
        catch (err: any) {
            console.error('[handleOpenReportBuilder]', err);
        }
    };
    // Presentation Mode handlers
    window.handleOpenPresentationModal = openPresentationModal;
    window.handleClosePresentationModal = closePresentationModal;
    window.handleOpenStepModal = openStepModal;
    window.handleCloseStepModal = closeStepModal;
    // MOD-LIB-MIG-001 — central capability gate. Wraps each capability module's
    // openHandler so the Library Hub toggle disables the feature from ALL entry
    // points (ribbon, command palette, direct window.* call), not just the Hub.
    // Idempotent (__capWrapped) + harmless alongside any inline guard. Built-ins
    // migram para first-party libraries (spec MOD-LIB-MIG-001).
    try {
        for (const cap of getCapabilityModules()) {
            const hn = (cap as any).openHandler;
            if (!hn) continue;
            const orig = (window as any)[hn];
            if (typeof orig !== 'function' || (orig as any).__capWrapped) continue;
            const wrapped = function (this: any, ...args: any[]) {
                if (!isCapabilityEnabled(cap.id)) {
                    showToast(
                        t('library.capabilityDisabled')
                            || 'Este módulo está desativado no Library Hub. Reative para usar.',
                        'warning',
                    );
                    return undefined;
                }
                return orig.apply(this, args);
            };
            (wrapped as any).__capWrapped = true;
            (window as any)[hn] = wrapped;
        }
    } catch (e: any) {
        console.debug('[handlers] capability-gate wrap:', e?.message || e);
    }
    // BUG-DEFERRED-CSS-PANEL (2026-08-06) — guarda de folha adiada nos abridores
    // de painel. Precisa vir DEPOIS de registerOrphanPanels() e de todos os
    // Object.assign(window, ...): envolve os window.handleOpen*Modal/Panel já
    // registrados. Cobre a abertura PROGRAMÁTICA (Automation API, deep-link,
    // tour), que o fix do primeiro gesto (a8b604480) não alcança.
    try {
        const guarded = installPanelOpenStyleGuard(window, document);
        log.debug(`Deferred-CSS guard instalado em ${guarded} abridores de painel`);
    } catch (e: any) {
        console.debug('[handlers] deferred-css-guard:', e?.message || e);
    }
    // Mark handlers as ready for E2E tests
    window.handlersReady = true;
}
/**
 * Registra comandos do sistema no command palette
 * Este é o catálogo central de comandos pesquisáveis
 */
function registerSystemCommands() {
    // Comandos de Arquivo
    registerCommands([
        {
            id: 'new-model',
            label: 'New Model',
            label_pt: 'Novo Modelo',
            category: 'Arquivo',
            icon: 'file-text',
            handler: () => window.handleClearModel?.(),
        },
        {
            id: 'import-model',
            label: 'Import Model',
            label_pt: 'Importar Modelo',
            category: 'Arquivo',
            icon: 'upload',
            handler: () => window.openImportModal?.(),
        },
        {
            id: 'export-model',
            label: 'Export Model',
            label_pt: 'Exportar Modelo',
            category: 'Arquivo',
            icon: 'download',
            handler: () => window.openExportModal?.(),
        },
        {
            id: 'share-url',
            label: 'Share URL',
            label_pt: 'Compartilhar URL',
            category: 'Arquivo',
            icon: 'git-merge',
            handler: () => window.shareURL?.(),
        },
        {
            id: 'download-key',
            label: 'Download Key',
            label_pt: 'Download Key',
            category: 'Arquivo',
            icon: 'download',
            handler: () => window.downloadKey?.(),
        },
    ]);
    // Comandos de Inserir
    registerCommands([
        {
            id: 'add-plume',
            label: 'Add Plume',
            label_pt: 'Adicionar Pluma',
            category: 'Inserir',
            icon: 'wind',
            handler: () => window.handleAddElement?.('plume'),
            keywords: ['plume', 'emissao', 'fumaca', 'vento'],
        },
        {
            id: 'add-well',
            label: 'Add Well',
            label_pt: 'Adicionar Poço',
            category: 'Inserir',
            icon: 'circle',
            handler: () => window.handleAddElement?.('well'),
            keywords: ['poco', 'well', 'borehole'],
        },
        {
            id: 'add-lake',
            label: 'Add Lake',
            label_pt: 'Adicionar Lago',
            category: 'Inserir',
            icon: 'droplet',
            handler: () => window.handleAddElement?.('lake'),
            keywords: ['lago', 'lake', 'agua'],
        },
        {
            id: 'add-river',
            label: 'Add River',
            label_pt: 'Adicionar Rio',
            category: 'Inserir',
            icon: 'activity',
            handler: () => window.handleAddElement?.('river'),
            keywords: ['rio', 'river', 'agua'],
        },
        {
            id: 'add-spring',
            label: 'Add Spring',
            label_pt: 'Adicionar Nascente',
            category: 'Inserir',
            icon: 'droplet',
            handler: () => window.handleAddElement?.('spring'),
            keywords: ['nascente', 'spring', 'agua'],
        },
        {
            id: 'add-sample',
            label: 'Add Sample',
            label_pt: 'Adicionar Amostra',
            category: 'Inserir',
            icon: 'flask',
            handler: () => window.handleAddElement?.('sample'),
            keywords: ['amostra', 'sample', 'flask'],
        },
        {
            id: 'add-building',
            label: 'Add Building',
            label_pt: 'Adicionar Edifício',
            category: 'Inserir',
            icon: 'home',
            handler: () => window.handleAddElement?.('building'),
            keywords: ['edificio', 'building', 'casa'],
        },
        {
            id: 'add-tank',
            label: 'Add Tank',
            label_pt: 'Adicionar Tanque',
            category: 'Inserir',
            icon: 'box',
            handler: () => window.handleAddElement?.('tank'),
            keywords: ['tanque', 'tank', 'caixa'],
        },
        {
            id: 'add-boundary',
            label: 'Add Boundary',
            label_pt: 'Adicionar Limite',
            category: 'Inserir',
            icon: 'square',
            handler: () => window.handleAddElement?.('boundary'),
            keywords: ['limite', 'boundary', 'area'],
        },
        {
            id: 'add-marker',
            label: 'Add Marker',
            label_pt: 'Adicionar Marcador',
            category: 'Inserir',
            icon: 'map-pin',
            handler: () => window.handleAddElement?.('marker'),
            keywords: ['marcador', 'marker', 'pin'],
        },
        {
            id: 'add-area',
            label: 'Add Area',
            label_pt: 'Adicionar Área',
            category: 'Inserir',
            icon: 'layers',
            handler: () => window.handleAddElement?.('area'),
            keywords: ['area', 'estrutura', 'structure'],
        },
        {
            id: 'add-incident',
            label: 'Add Incident',
            label_pt: 'Adicionar Incidente',
            category: 'Inserir',
            icon: 'alert-triangle',
            handler: () => window.handleAddElement?.('incident'),
            keywords: ['incidente', 'incident', 'acidente'],
        },
    ]);
    // Comandos de Visualizar
    registerCommands([
        {
            id: 'reset-view',
            label: 'Reset View',
            label_pt: 'Resetar Vista',
            category: 'Visualizar',
            icon: 'compass',
            handler: () => window.resetView?.(),
            keywords: ['vista', 'view', 'camera', 'reset'],
        },
        {
            id: 'fit-all',
            label: 'Fit All Elements',
            label_pt: 'Ajustar a Todos',
            category: 'Visualizar',
            icon: 'maximize-2',
            handler: () => window.fitAllElements?.(),
            keywords: ['ajustar', 'fit', 'zoom', 'todos'],
        },
        {
            id: 'top-view',
            label: 'Top View',
            label_pt: 'Vista Superior',
            category: 'Visualizar',
            icon: 'layers',
            handler: () => window.setTopView?.(),
            keywords: ['superior', 'top', 'planta'],
        },
        {
            id: 'isometric-view',
            label: 'Isometric View',
            label_pt: 'Vista Isométrica',
            category: 'Visualizar',
            icon: 'box',
            handler: () => window.setIsometricView?.(),
            keywords: ['isometrica', 'isometric', '3d'],
        },
        {
            id: 'front-view',
            label: 'Front View',
            label_pt: 'Vista Frontal',
            category: 'Visualizar',
            icon: 'square',
            handler: () => window.setFrontView?.(),
            keywords: ['frontal', 'front', 'corte'],
        },
        {
            id: 'toggle-toolbar',
            label: 'Toggle Toolbar',
            label_pt: 'Alternar Toolbar',
            category: 'Visualizar',
            icon: 'layout',
            handler: () => window.toggleToolbar?.(),
            keywords: ['toolbar', 'barra'],
        },
        {
            id: 'toggle-left-panel',
            label: 'Toggle Left Panel',
            label_pt: 'Alternar Painel Esquerdo',
            category: 'Visualizar',
            icon: 'layout',
            handler: () => window.toggleLeftPanel?.(),
            keywords: ['painel', 'panel', 'esquerdo', 'left'],
        },
        {
            id: 'toggle-right-panel',
            label: 'Toggle Right Panel',
            label_pt: 'Alternar Painel Direito',
            category: 'Visualizar',
            icon: 'layout',
            handler: () => window.toggleRightPanel?.(),
            keywords: ['painel', 'panel', 'direito', 'right'],
        },
        {
            id: 'toggle-geo-hud',
            label: 'Toggle Geo-HUD',
            label_pt: 'Alternar Geo-HUD',
            category: 'Visualizar',
            icon: 'compass',
            handler: () => window.handleToggleGeoHud?.(),
            keywords: ['geo', 'hud', 'coordenadas'],
        },
        {
            id: 'toggle-labels',
            label: 'Toggle 3D Labels',
            label_pt: 'Alternar Rótulos 3D',
            category: 'Visualizar',
            icon: 'tag',
            handler: () => window.handleToggleLabels?.(),
            keywords: ['rotulos', 'labels', 'texto'],
        },
        {
            id: 'toggle-inspector',
            label: 'Toggle Inspector',
            label_pt: 'Alternar Inspector',
            category: 'Visualizar',
            icon: 'braces',
            handler: () => window.handleToggleInspector?.(),
            keywords: ['inspector', 'json', 'dados'],
        },
        {
            id: 'toggle-theme',
            label: 'Toggle Theme',
            label_pt: 'Alternar Tema',
            category: 'Visualizar',
            icon: 'sun',
            handler: () => window.handleSetTheme?.('system'),
            keywords: ['tema', 'theme', 'dark', 'light'],
        },
        {
            id: 'toggle-focus-mode',
            label: 'Focus Mode',
            label_pt: 'Modo Foco',
            category: 'Visualizar',
            icon: 'maximize-2',
            handler: () => window.handleToggleFocusMode?.(),
            keywords: ['foco', 'focus', 'fullscreen'],
        },
    ]);
    // Comandos de Analisar
    registerCommands([
        {
            id: 'open-analytics',
            label: 'Open Analytics',
            label_pt: 'Abrir Analytics',
            category: 'Analisar',
            icon: 'bar-chart-2',
            handler: () => window.handleOpenAnalytics?.() || window.activateTab?.('analytics'),
            keywords: ['analytics', 'estatisticas', 'dados'],
        },
        {
            id: 'update-analytics',
            label: 'Update Analytics',
            label_pt: 'Atualizar Analytics',
            category: 'Analisar',
            icon: 'refresh-cw',
            handler: () => window.updateAnalyticsData?.(),
            keywords: ['atualizar', 'update', 'refresh'],
        },
        {
            id: 'open-hypothesis-test',
            label: 'Hypothesis Test',
            label_pt: 'Teste de Hipótese',
            category: 'Analisar',
            icon: 'flask',
            handler: () => window.handleOpenHypothesisTest?.(),
            keywords: ['hipotese', 'hypothesis', 'teste', 'estatistica'],
        },
        {
            id: 'open-risk-assessment',
            label: 'CETESB Risk Assessment',
            label_pt: 'Avaliação de Risco CETESB',
            category: 'Analisar',
            icon: 'shield-alert',
            shortcut: 'Alt+R',
            handler: () => (window as any).handleOpenRiskAssessment?.(),
            keywords: ['risco', 'risk', 'cetesb', 'cma', 'ilcr', 'hq', 'remediacao', 'conama'],
        },
        {
            id: 'open-mac-curve',
            label: 'MAC Curve',
            label_pt: 'Curva MAC',
            category: 'Analisar',
            icon: 'trending-down',
            handler: () => window.handleOpenMACCurve?.(),
            keywords: ['mac', 'curva', 'custo'],
        },
        {
            id: 'open-background-analysis',
            label: 'Background Analysis',
            label_pt: 'Análise de Background',
            category: 'Analisar',
            icon: 'layers',
            handler: () => window.handleOpenBackgroundAnalysis?.(),
            keywords: ['background', 'fundo', 'analise'],
        },
        {
            id: 'open-eis-dashboard',
            label: 'EIS Dashboard',
            label_pt: 'EIS Dashboard',
            category: 'Analisar',
            icon: 'shield',
            handler: () => window.handleOpenEisDashboard?.(),
            keywords: ['eis', 'compliance', 'score'],
        },
        {
            id: 'open-cost-analysis',
            label: 'Cost Analysis',
            label_pt: 'Análise de Custo',
            category: 'Analisar',
            icon: 'dollar-sign',
            handler: () => window.handleOpenCostAnalysis?.(),
            keywords: ['custo', 'cost', 'financeiro'],
        },
    ]);
    // Comandos de Configurar
    registerCommands([
        {
            id: 'open-symbology',
            label: 'Symbology Editor',
            label_pt: 'Editor de Simbologia',
            category: 'Configurar',
            icon: 'palette',
            handler: () => window.handleOpenSymbologyEditor?.(),
            keywords: ['simbologia', 'symbology', 'cores', 'estilos'],
        },
        {
            id: 'open-label-settings',
            label: 'Label Settings',
            label_pt: 'Config. de Rótulos',
            category: 'Configurar',
            icon: 'settings',
            handler: () => window.handleOpenLabelSettings?.(),
            keywords: ['rotulos', 'labels', 'configuracao'],
        },
        {
            id: 'open-viz-settings',
            label: 'Visualization Settings',
            label_pt: 'Config. de Visualização',
            category: 'Configurar',
            icon: 'sliders',
            handler: () => window.handleToggleVizSettings?.(),
            keywords: ['visualizacao', 'viz', 'configuracao'],
        },
        {
            id: 'open-filter-panel',
            label: 'Filter Panel',
            label_pt: 'Painel de Filtros',
            category: 'Configurar',
            icon: 'filter',
            handler: () => window.handleOpenFilterPanel?.(),
            keywords: ['filtro', 'filter', 'selecao'],
        },
        {
            id: 'open-constants',
            label: 'User Constants',
            label_pt: 'Constantes do Usuário',
            category: 'Configurar',
            icon: 'hash',
            handler: () => window.handleOpenConstantsModal?.(),
            keywords: ['constantes', 'constants', 'variaveis'],
        },
    ]);
    // Comandos de Ferramentas
    registerCommands([
        {
            id: 'snapshot',
            label: 'Take Snapshot',
            label_pt: 'Capturar Snapshot',
            category: 'Ferramentas',
            icon: 'camera',
            handler: () => window.handleCaptureSnapshot?.(),
            keywords: ['snapshot', 'screenshot', 'captura'],
        },
        {
            id: 'open-automation-panel',
            label: 'Automation Panel',
            label_pt: 'Painel de Automacao',
            category: 'Ferramentas',
            icon: 'sliders',
            handler: () => window.handleOpenAutomationPanel?.(),
            keywords: ['automation', 'automacao', 'pipeline', 'receita'],
        },
        {
            id: 'open-logs',
            label: 'System Logs',
            label_pt: 'Logs do sistema',
            category: 'Ferramentas',
            icon: 'scroll-text',
            handler: () => window.handleOpenLogs?.(),
            keywords: ['logs', 'log', 'erros', 'errors', 'warnings', 'avisos', 'toast', 'mensagens', 'diagnostico'],
        },
        {
            id: 'open-shortcuts',
            label: 'Keyboard Shortcuts',
            label_pt: 'Atalhos de teclado',
            category: 'Ferramentas',
            icon: 'keyboard',
            handler: () => window.handleOpenShortcuts?.(),
            keywords: ['atalhos', 'shortcuts', 'teclado', 'keyboard', 'teclas', 'keys', 'hotkeys', 'ajuda'],
        },
        {
            id: 'open-presentation-mode',
            label: 'Presentation Mode',
            label_pt: 'Presentation Mode',
            category: 'Ferramentas',
            icon: 'play-circle',
            handler: () => window.handleOpenPresentationModal?.(),
            keywords: ['presentation', 'apresentacao', 'video', 'story'],
        },
        {
            id: 'open-calculator',
            label: 'Calculator',
            label_pt: 'Calculadora',
            category: 'Ferramentas',
            icon: 'calculator',
            handler: () => window.handleOpenCalculator?.(),
            keywords: ['calculadora', 'calculator', 'calc'],
        },
        {
            id: 'open-data-entry',
            label: 'Data Entry Matrix',
            label_pt: 'Matriz de Dados',
            category: 'Ferramentas',
            icon: 'grid',
            handler: () => window.handleOpenDataEntryMatrix?.(),
            keywords: ['dados', 'data', 'matriz', 'entrada'],
        },
        {
            id: 'open-sensors',
            label: 'Sensor Center',
            label_pt: 'Central de Sensores',
            category: 'Ferramentas',
            icon: 'radio',
            handler: () => window.handleOpenSensorsCenter?.(),
            keywords: ['sensores', 'sensors', 'iot'],
        },
        {
            id: 'open-files',
            label: 'Project Files',
            label_pt: 'Arquivos do Projeto',
            category: 'Ferramentas',
            icon: 'folder',
            handler: () => window.handleOpenFiles?.(),
            keywords: ['arquivos', 'files', 'documentos'],
        },
        {
            id: 'open-photolog',
            label: 'Photo Log',
            label_pt: 'Registro Fotográfico',
            category: 'Ferramentas',
            icon: 'camera',
            handler: () => window.handleOpenPhotoLog?.(),
            keywords: ['fotos', 'photos', 'imagens'],
        },
    ]);
    // Comandos de Ajuda
    registerCommands([
        {
            id: 'about',
            label: 'About',
            label_pt: 'Sobre',
            category: 'Ajuda',
            icon: 'info',
            handler: () => window.showAboutDialog?.(),
            keywords: ['sobre', 'about', 'versao'],
        },
        {
            id: 'documentation',
            label: 'Documentation',
            label_pt: 'Documentação',
            category: 'Ajuda',
            icon: 'book-open',
            handler: () => window.handleOpenDocs?.(),
            keywords: ['documentacao', 'docs', 'ajuda', 'help'],
        },
        {
            id: 'report-bug',
            label: 'Report Bug',
            label_pt: 'Reportar Bug',
            category: 'Ajuda',
            icon: 'bug',
            handler: () => window.handleReportBug?.(),
            keywords: ['bug', 'erro', 'reportar'],
        },
    ]);
    log.debug('Registered commands in command palette');
}
