// @ts-check
// Generated from src/app/js/utils/tour/tours/sceneCamera.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GUIDED TOURS — Scenes & Camera (4 tours, 16 steps)
   Tours 13-16: manage scenes, camera views, zoom/fit,
   inspector panel
   ================================================================ */
import { registerGuidedTour } from '../categories.js';
import { ensureRightPanel, switchTab } from '../steps.js';
// ----------------------------------------------------------------
// Tour 13: Manage Scenes
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'manage-scenes',
    categoryId: 'scene-camera',
    nameKey: 'guidedTourManageScenes',
    descKey: 'guidedTourManageScenesDesc',
    icon: 'image',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-scene-tab',
            target: '.tab[data-tab="scenes"]',
            title: 'gtManageScenesTab',
            body: 'gtManageScenesTabBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('scenes');
            },
        },
        {
            id: 'gt-scene-add-btn',
            target: '[onclick*="handleAddScene"]',
            title: 'gtManageScenesAdd',
            body: 'gtManageScenesAddBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('insert'),
        },
        {
            id: 'gt-scene-list',
            target: '#scenes-list, .scene-list',
            title: 'gtManageScenesList',
            body: 'gtManageScenesListBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('scenes');
            },
        },
        {
            id: 'gt-scene-navigate',
            target: '#scenes-list, .scene-list',
            title: 'gtManageScenesNavigate',
            body: 'gtManageScenesNavigateBody',
            position: 'left',
        },
        {
            id: 'gt-scene-complete',
            target: '#canvas-container',
            title: 'gtManageScenesComplete',
            body: 'gtManageScenesCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 14: Camera Views
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'camera-views',
    categoryId: 'scene-camera',
    nameKey: 'guidedTourCameraViews',
    descKey: 'guidedTourCameraViewsDesc',
    icon: 'video',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-cam-controls',
            target: '#view-controls',
            title: 'gtCameraViewsControls',
            body: 'gtCameraViewsControlsBody',
            position: 'left',
        },
        {
            id: 'gt-cam-iso',
            target: '#view-controls',
            title: 'gtCameraViewsIso',
            body: 'gtCameraViewsIsoBody',
            position: 'left',
        },
        {
            id: 'gt-cam-orbit',
            target: '#canvas-container',
            title: 'gtCameraViewsOrbit',
            body: 'gtCameraViewsOrbitBody',
            position: 'bottom',
        },
        {
            id: 'gt-cam-complete',
            target: '#canvas-container',
            title: 'gtCameraViewsComplete',
            body: 'gtCameraViewsCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 15: Zoom & Fit Controls
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'zoom-fit-controls',
    categoryId: 'scene-camera',
    nameKey: 'guidedTourZoomFit',
    descKey: 'guidedTourZoomFitDesc',
    icon: 'maximize',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-zoom-btns',
            target: '#view-controls',
            title: 'gtZoomFitBtns',
            body: 'gtZoomFitBtnsBody',
            position: 'left',
        },
        {
            id: 'gt-zoom-fit',
            target: '#view-controls',
            title: 'gtZoomFitAll',
            body: 'gtZoomFitAllBody',
            position: 'left',
        },
        {
            id: 'gt-zoom-complete',
            target: '#canvas-container',
            title: 'gtZoomFitComplete',
            body: 'gtZoomFitCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 16: Inspector Panel
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'inspector-panel',
    categoryId: 'scene-camera',
    nameKey: 'guidedTourInspector',
    descKey: 'guidedTourInspectorDesc',
    icon: 'code',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-insp-ribbon',
            target: '[onclick*="handleToggleInspector"]',
            title: 'gtInspectorRibbon',
            body: 'gtInspectorRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('view'),
            delay: 200,
        },
        {
            id: 'gt-insp-panel',
            target: '#inspector-panel, .inspector-container',
            title: 'gtInspectorPanel',
            body: 'gtInspectorPanelBody',
            position: 'left',
            action: () => window.handleToggleInspector?.(),
            delay: 300,
        },
        {
            id: 'gt-insp-data',
            target: '#inspector-panel, .inspector-container',
            title: 'gtInspectorData',
            body: 'gtInspectorDataBody',
            position: 'left',
        },
        {
            id: 'gt-insp-complete',
            target: '#canvas-container',
            title: 'gtInspectorComplete',
            body: 'gtInspectorCompleteBody',
            position: 'bottom',
            postAction: () => {
                const panel = document.getElementById('inspector-panel');
                if (panel && panel.style.display !== 'none') window.handleToggleInspector?.();
            },
        },
    ],
});
