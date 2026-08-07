// @ts-check
// Generated from src/app/js/utils/tour/tours/elementManagement.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GUIDED TOURS — Element Management (5 tours, 18 steps)
   Tours 1-5: add element, edit properties, copy/paste,
   toggle visibility, generate random model
   ================================================================ */
import { registerGuidedTour } from '../categories.js';
import { ensureLeftPanel, ensureRightPanel, switchTab } from '../steps.js';
// ----------------------------------------------------------------
// Tour 1: Add First Element (Well)
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'add-first-element',
    categoryId: 'element-management',
    nameKey: 'guidedTourAddElement',
    descKey: 'guidedTourAddElementDesc',
    icon: 'plus-circle',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    // RF-6 (TRAINING-LEARNER-MIN-001): walkthrough enxuto de ≤4 passos — o
    // antigo passo de introdução (#left-panel) foi fundido ao passo famílias.
    steps: [
        {
            id: 'gt-add-families',
            target: '#families-list',
            title: 'gtAddElementFamilies',
            body: 'gtAddElementFamiliesBody',
            position: 'right',
            action: () => {
                ensureLeftPanel();
                window.switchRibbonTab?.('home');
            },
        },
        {
            id: 'gt-add-click-well',
            target: '#families-list .family-item',
            title: 'gtAddElementClickWell',
            body: 'gtAddElementClickWellBody',
            position: 'right',
            interactive: true,
            waitFor: 'ecbt:elementAdded',
            action: () => ensureLeftPanel(),
        },
        {
            id: 'gt-add-see-3d',
            target: '#canvas-container',
            title: 'gtAddElementSee3D',
            body: 'gtAddElementSee3DBody',
            position: 'bottom',
        },
        {
            id: 'gt-add-complete',
            target: '.tab[data-tab="elements"]',
            title: 'gtAddElementComplete',
            body: 'gtAddElementCompleteBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
        },
    ],
});
// ----------------------------------------------------------------
// Tour 2: Edit Element Properties
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'edit-element-properties',
    categoryId: 'element-management',
    nameKey: 'guidedTourEditElement',
    descKey: 'guidedTourEditElementDesc',
    icon: 'edit',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-edit-select',
            target: '.tab[data-tab="elements"]',
            title: 'gtEditElementSelect',
            body: 'gtEditElementSelectBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
        },
        {
            id: 'gt-edit-list',
            target: '#elements-list',
            title: 'gtEditElementList',
            body: 'gtEditElementListBody',
            position: 'left',
            interactive: true,
            waitFor: 'ecbt:elementSelected',
        },
        {
            id: 'gt-edit-inspector',
            target: '#right-panel',
            title: 'gtEditElementInspector',
            body: 'gtEditElementInspectorBody',
            position: 'left',
            action: () => ensureRightPanel(),
        },
        {
            id: 'gt-edit-complete',
            target: '#canvas-container',
            title: 'gtEditElementComplete',
            body: 'gtEditElementCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 3: Copy/Paste Elements
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'copy-paste-elements',
    categoryId: 'element-management',
    nameKey: 'guidedTourCopyPaste',
    descKey: 'guidedTourCopyPasteDesc',
    icon: 'copy',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-cp-select',
            target: '#elements-list',
            title: 'gtCopyPasteSelect',
            body: 'gtCopyPasteSelectBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
            interactive: true,
            waitFor: 'ecbt:elementSelected',
        },
        {
            id: 'gt-cp-copy-btn',
            target: '[onclick*="handleCopyElement"]',
            title: 'gtCopyPasteCopy',
            body: 'gtCopyPasteCopyBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('home'),
        },
        {
            id: 'gt-cp-paste-btn',
            target: '[onclick*="handlePasteElement"]',
            title: 'gtCopyPastePaste',
            body: 'gtCopyPastePasteBody',
            position: 'bottom',
        },
        {
            id: 'gt-cp-complete',
            target: '#canvas-container',
            title: 'gtCopyPasteComplete',
            body: 'gtCopyPasteCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 4: Toggle Element Visibility
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'toggle-element-visibility',
    categoryId: 'element-management',
    nameKey: 'guidedTourToggleVis',
    descKey: 'guidedTourToggleVisDesc',
    icon: 'eye',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-vis-list',
            target: '#elements-list',
            title: 'gtToggleVisList',
            body: 'gtToggleVisListBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
        },
        {
            id: 'gt-vis-eye',
            target: '.element-visibility-btn, .element-item .btn-icon',
            title: 'gtToggleVisEye',
            body: 'gtToggleVisEyeBody',
            position: 'left',
        },
        {
            id: 'gt-vis-complete',
            target: '#canvas-container',
            title: 'gtToggleVisComplete',
            body: 'gtToggleVisCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 5: Generate Random Model
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'generate-random-model',
    categoryId: 'element-management',
    nameKey: 'guidedTourRandomModel',
    descKey: 'guidedTourRandomModelDesc',
    icon: 'shuffle',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-rand-ribbon',
            target: '[data-ribbon="home"]',
            title: 'gtRandomModelRibbon',
            body: 'gtRandomModelRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('home'),
        },
        {
            id: 'gt-rand-btn',
            target: '[onclick*="handleGenerateRandomModel"]',
            title: 'gtRandomModelBtn',
            body: 'gtRandomModelBtnBody',
            position: 'bottom',
        },
        {
            id: 'gt-rand-complete',
            target: '#canvas-container',
            title: 'gtRandomModelComplete',
            body: 'gtRandomModelCompleteBody',
            position: 'bottom',
        },
    ],
});
