// @ts-check
// Generated from src/app/js/utils/tour/tours/advancedFeatures.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GUIDED TOURS — Advanced Features (10 tours, 46 steps)
   Tours 41-50: EIS dashboard, regulatory compliance, Mann-Kendall,
   cost analysis, EVA, storyboard, timeline, shape editing,
   library marketplace, cloud save/load
   ================================================================ */
import { registerGuidedTour } from '../categories.js';
import { ensureRightPanel, switchTab } from '../steps.js';
// ----------------------------------------------------------------
// Tour 41: EIS Dashboard
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'eis-dashboard',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourEISDashboard',
    descKey: 'guidedTourEISDashboardDesc',
    icon: 'award',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, minObservations: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-eis-ribbon',
            target: '[onclick*="handleOpenEisDashboard"]',
            title: 'gtEISDashboardRibbon',
            body: 'gtEISDashboardRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-eis-modal',
            target: '#eis-dashboard-modal, .eis-dashboard',
            title: 'gtEISDashboardModal',
            body: 'gtEISDashboardModalBody',
            position: 'left',
            action: () => window.handleOpenEisDashboard?.(),
            delay: 400,
        },
        {
            id: 'gt-eis-axes',
            target: '#eis-dashboard-modal, .eis-dashboard',
            title: 'gtEISDashboardAxes',
            body: 'gtEISDashboardAxesBody',
            position: 'left',
        },
        {
            id: 'gt-eis-radar',
            target: '#eis-dashboard-modal, .eis-dashboard',
            title: 'gtEISDashboardRadar',
            body: 'gtEISDashboardRadarBody',
            position: 'left',
        },
        {
            id: 'gt-eis-complete',
            target: '#eis-dashboard-modal, .eis-dashboard',
            title: 'gtEISDashboardComplete',
            body: 'gtEISDashboardCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('eis-dashboard-modal'),
        },
    ],
});
// ----------------------------------------------------------------
// Tour 42: Regulatory Compliance Check
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'regulatory-compliance',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourRegulatory',
    descKey: 'guidedTourRegulatoryDesc',
    icon: 'check-square',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, minObservations: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-reg-ribbon',
            target: '[onclick*="handleOpenRegulatoryStandards"]',
            title: 'gtRegulatoryRibbon',
            body: 'gtRegulatoryRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-reg-modal',
            target: '#regulatory-modal, .regulatory-standards-modal',
            title: 'gtRegulatoryModal',
            body: 'gtRegulatoryModalBody',
            position: 'left',
            action: () => window.handleOpenRegulatoryStandards?.(),
            delay: 400,
        },
        {
            id: 'gt-reg-thresholds',
            target: '#regulatory-modal, .regulatory-standards-modal',
            title: 'gtRegulatoryThresholds',
            body: 'gtRegulatoryThresholdsBody',
            position: 'left',
        },
        {
            id: 'gt-reg-landuse',
            target: '#regulatory-modal, .regulatory-standards-modal',
            title: 'gtRegulatoryLandUse',
            body: 'gtRegulatoryLandUseBody',
            position: 'left',
        },
        {
            id: 'gt-reg-complete',
            target: '#regulatory-modal, .regulatory-standards-modal',
            title: 'gtRegulatoryComplete',
            body: 'gtRegulatoryCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('regulatory-modal'),
        },
    ],
});
// ----------------------------------------------------------------
// Tour 43: Mann-Kendall Trend Test
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'mann-kendall-trend',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourMannKendall',
    descKey: 'guidedTourMannKendallDesc',
    icon: 'trending-down',
    difficulty: 'advanced',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, minObservations: 5, autoScaffold: true },
    steps: [
        {
            id: 'gt-mk-ribbon',
            target: '[onclick*="handleOpenHypothesisTest"]',
            title: 'gtMannKendallRibbon',
            body: 'gtMannKendallRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-mk-modal',
            target: '#hypothesis-modal, .hypothesis-test-modal',
            title: 'gtMannKendallModal',
            body: 'gtMannKendallModalBody',
            position: 'left',
            action: () => window.handleOpenHypothesisTest?.(),
            delay: 400,
        },
        {
            id: 'gt-mk-config',
            target: '#hypothesis-modal, .hypothesis-test-modal',
            title: 'gtMannKendallConfig',
            body: 'gtMannKendallConfigBody',
            position: 'left',
        },
        {
            id: 'gt-mk-complete',
            target: '#hypothesis-modal, .hypothesis-test-modal',
            title: 'gtMannKendallComplete',
            body: 'gtMannKendallCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('hypothesis-modal'),
        },
    ],
});
// ----------------------------------------------------------------
// Tour 44: Cost Analysis Panel
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'cost-analysis-panel',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourCostAnalysis',
    descKey: 'guidedTourCostAnalysisDesc',
    icon: 'dollar-sign',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-cost-ribbon',
            target: '[onclick*="handleOpenCostAnalysis"]',
            title: 'gtCostAnalysisRibbon',
            body: 'gtCostAnalysisRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-cost-modal',
            target: '#cost-analysis-modal, .cost-analysis-panel',
            title: 'gtCostAnalysisModal',
            body: 'gtCostAnalysisModalBody',
            position: 'left',
            action: () => window.handleOpenCostAnalysis?.(),
            delay: 400,
        },
        {
            id: 'gt-cost-capex',
            target: '#cost-analysis-modal, .cost-analysis-panel',
            title: 'gtCostAnalysisCapex',
            body: 'gtCostAnalysisCapexBody',
            position: 'left',
        },
        {
            id: 'gt-cost-breakdown',
            target: '#cost-analysis-modal, .cost-analysis-panel',
            title: 'gtCostAnalysisBreakdown',
            body: 'gtCostAnalysisBreakdownBody',
            position: 'left',
        },
        {
            id: 'gt-cost-complete',
            target: '#cost-analysis-modal, .cost-analysis-panel',
            title: 'gtCostAnalysisComplete',
            body: 'gtCostAnalysisCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('cost-analysis-modal'),
        },
    ],
});
// ----------------------------------------------------------------
// Tour 45: EVA Dashboard
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'eva-dashboard',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourEVA',
    descKey: 'guidedTourEVADesc',
    icon: 'bar-chart',
    difficulty: 'intermediate',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-eva-tab',
            target: '.tab[data-tab="governance"]',
            title: 'gtEVATab',
            body: 'gtEVATabBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('governance');
            },
        },
        {
            id: 'gt-eva-panel',
            target: '#right-panel',
            title: 'gtEVAPanel',
            body: 'gtEVAPanelBody',
            position: 'left',
        },
        {
            id: 'gt-eva-metrics',
            target: '#right-panel',
            title: 'gtEVAMetrics',
            body: 'gtEVAMetricsBody',
            position: 'left',
        },
        {
            id: 'gt-eva-complete',
            target: '#right-panel',
            title: 'gtEVAComplete',
            body: 'gtEVACompleteBody',
            position: 'left',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 46: Storyboard Keyframes
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'storyboard-keyframes',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourStoryboard',
    descKey: 'guidedTourStoryboardDesc',
    icon: 'film',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 2, autoScaffold: true },
    steps: [
        {
            id: 'gt-story-hud',
            target: '#constellation-hud',
            title: 'gtStoryboardHud',
            body: 'gtStoryboardHudBody',
            position: 'top',
            action: () => {
                const hud = document.getElementById('constellation-hud');
                if (hud && hud.classList.contains('constellation-collapsed')) {
                    /** @type {any} */ (window).handleToggleConstellation?.();
                }
            },
            delay: 300,
        },
        {
            id: 'gt-story-timeline',
            target: '#constellation-hud',
            title: 'gtStoryboardTimeline',
            body: 'gtStoryboardTimelineBody',
            position: 'top',
        },
        {
            id: 'gt-story-add',
            target: '#constellation-hud',
            title: 'gtStoryboardAdd',
            body: 'gtStoryboardAddBody',
            position: 'top',
        },
        {
            id: 'gt-story-navigate',
            target: '#constellation-hud',
            title: 'gtStoryboardNavigate',
            body: 'gtStoryboardNavigateBody',
            position: 'top',
        },
        {
            id: 'gt-story-complete',
            target: '#canvas-container',
            title: 'gtStoryboardComplete',
            body: 'gtStoryboardCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 47: Timeline Playback
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'timeline-playback',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourTimeline',
    descKey: 'guidedTourTimelineDesc',
    icon: 'play',
    difficulty: 'intermediate',
    estimatedMinutes: 2,
    prerequisites: { minElements: 2, autoScaffold: true },
    steps: [
        {
            id: 'gt-tl-hud',
            target: '#constellation-hud',
            title: 'gtTimelineHud',
            body: 'gtTimelineHudBody',
            position: 'top',
            action: () => {
                const hud = document.getElementById('constellation-hud');
                if (hud && hud.classList.contains('constellation-collapsed')) {
                    /** @type {any} */ (window).handleToggleConstellation?.();
                }
            },
            delay: 300,
        },
        {
            id: 'gt-tl-controls',
            target: '#constellation-hud',
            title: 'gtTimelineControls',
            body: 'gtTimelineControlsBody',
            position: 'top',
        },
        {
            id: 'gt-tl-speed',
            target: '#constellation-hud',
            title: 'gtTimelineSpeed',
            body: 'gtTimelineSpeedBody',
            position: 'top',
        },
        {
            id: 'gt-tl-complete',
            target: '#canvas-container',
            title: 'gtTimelineComplete',
            body: 'gtTimelineCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 48: Edit Element Shape
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'edit-element-shape',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourShapeEdit',
    descKey: 'guidedTourShapeEditDesc',
    icon: 'pen-tool',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-shape-select',
            target: '#elements-list',
            title: 'gtShapeEditSelect',
            body: 'gtShapeEditSelectBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
            interactive: true,
            waitFor: 'ecbt:elementSelected',
        },
        {
            id: 'gt-shape-ribbon',
            target: '#edit-ribbon, .edit-toolbar',
            title: 'gtShapeEditRibbon',
            body: 'gtShapeEditRibbonBody',
            position: 'bottom',
            delay: 300,
        },
        {
            id: 'gt-shape-draw',
            target: '#edit-ribbon-draw-btn, [onclick*="handleToggleDrawMode"]',
            title: 'gtShapeEditDraw',
            body: 'gtShapeEditDrawBody',
            position: 'bottom',
        },
        {
            id: 'gt-shape-vertices',
            target: '#canvas-container',
            title: 'gtShapeEditVertices',
            body: 'gtShapeEditVerticesBody',
            position: 'bottom',
        },
        {
            id: 'gt-shape-complete',
            target: '[onclick*="handleExitShapeEdit"], .edit-ribbon-done-btn',
            title: 'gtShapeEditComplete',
            body: 'gtShapeEditCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 49: Library Marketplace
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'library-marketplace',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourLibrary',
    descKey: 'guidedTourLibraryDesc',
    icon: 'shopping-bag',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-lib-ribbon',
            target: '[data-ribbon="libraries"]',
            title: 'gtLibraryRibbon',
            body: 'gtLibraryRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('libraries'),
            delay: 200,
        },
        {
            id: 'gt-lib-browse',
            target: '[onclick*="handleOpenMarketplace"]',
            title: 'gtLibraryBrowse',
            body: 'gtLibraryBrowseBody',
            position: 'bottom',
        },
        {
            id: 'gt-lib-catalog',
            target: '#marketplace-modal, .marketplace-modal',
            title: 'gtLibraryCatalog',
            body: 'gtLibraryCatalogBody',
            position: 'left',
            action: () => window.handleOpenMarketplace?.(),
            delay: 400,
        },
        {
            id: 'gt-lib-complete',
            target: '#marketplace-modal, .marketplace-modal',
            title: 'gtLibraryComplete',
            body: 'gtLibraryCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('marketplace-modal'),
        },
    ],
});
// ----------------------------------------------------------------
// Tour 50: Cloud Save/Load
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'cloud-save-load',
    categoryId: 'advanced-features',
    nameKey: 'guidedTourCloud',
    descKey: 'guidedTourCloudDesc',
    icon: 'cloud',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-cloud-ribbon',
            target: '[data-ribbon="file"]',
            title: 'gtCloudRibbon',
            body: 'gtCloudRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('file'),
        },
        {
            id: 'gt-cloud-save',
            target: '#menubar',
            title: 'gtCloudSave',
            body: 'gtCloudSaveBody',
            position: 'bottom',
        },
        {
            id: 'gt-cloud-auth',
            target: '#auth-button',
            title: 'gtCloudAuth',
            body: 'gtCloudAuthBody',
            position: 'bottom',
        },
        {
            id: 'gt-cloud-load',
            target: '#menubar',
            title: 'gtCloudLoad',
            body: 'gtCloudLoadBody',
            position: 'bottom',
        },
        {
            id: 'gt-cloud-complete',
            target: '#canvas-container',
            title: 'gtCloudComplete',
            body: 'gtCloudCompleteBody',
            position: 'bottom',
        },
    ],
});
