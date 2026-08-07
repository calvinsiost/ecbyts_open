// @ts-check
// Generated from src/app/js/utils/tour/tours/fieldData.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GUIDED TOURS — Field Data & Observations (4 tours, 19 steps)
   Tours 6-9: add observation, edit/delete, create binding,
   batch data entry matrix
   ================================================================ */
import { registerGuidedTour } from '../categories.js';
import { ensureRightPanel, switchTab } from '../steps.js';
// ----------------------------------------------------------------
// Tour 6: Add Observation
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'add-observation',
    categoryId: 'field-data',
    nameKey: 'guidedTourAddObs',
    descKey: 'guidedTourAddObsDesc',
    icon: 'plus-square',
    difficulty: 'beginner',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-obs-select-elem',
            target: '#elements-list',
            title: 'gtAddObsSelectElem',
            body: 'gtAddObsSelectElemBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
            interactive: true,
            waitFor: 'ecbt:elementSelected',
        },
        {
            id: 'gt-obs-btn',
            target: '[onclick*="handleAddObservation"]',
            title: 'gtAddObsBtn',
            body: 'gtAddObsBtnBody',
            position: 'left',
        },
        {
            id: 'gt-obs-form',
            target: '#observation-form, .observation-fields',
            title: 'gtAddObsForm',
            body: 'gtAddObsFormBody',
            position: 'left',
        },
        {
            id: 'gt-obs-param',
            target: '#obs-parameter-select, .obs-param-input',
            title: 'gtAddObsParam',
            body: 'gtAddObsParamBody',
            position: 'left',
        },
        {
            id: 'gt-obs-complete',
            target: '#right-panel',
            title: 'gtAddObsComplete',
            body: 'gtAddObsCompleteBody',
            position: 'left',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 7: Edit/Delete Observation
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'edit-delete-observation',
    categoryId: 'field-data',
    nameKey: 'guidedTourEditObs',
    descKey: 'guidedTourEditObsDesc',
    icon: 'edit-3',
    difficulty: 'intermediate',
    estimatedMinutes: 2,
    prerequisites: { minElements: 1, minObservations: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-editobs-list',
            target: '#elements-list',
            title: 'gtEditObsList',
            body: 'gtEditObsListBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
        },
        {
            id: 'gt-editobs-expand',
            target: '.element-item',
            title: 'gtEditObsExpand',
            body: 'gtEditObsExpandBody',
            position: 'left',
        },
        {
            id: 'gt-editobs-actions',
            target: '.observation-item, .obs-actions',
            title: 'gtEditObsActions',
            body: 'gtEditObsActionsBody',
            position: 'left',
        },
        {
            id: 'gt-editobs-complete',
            target: '#right-panel',
            title: 'gtEditObsComplete',
            body: 'gtEditObsCompleteBody',
            position: 'left',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 8: Create Field Binding
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'create-field-binding',
    categoryId: 'field-data',
    nameKey: 'guidedTourBinding',
    descKey: 'guidedTourBindingDesc',
    icon: 'link',
    difficulty: 'advanced',
    estimatedMinutes: 3,
    prerequisites: { minElements: 2, minObservations: 2, autoScaffold: true },
    steps: [
        {
            id: 'gt-bind-intro',
            target: '#right-panel',
            title: 'gtBindingIntro',
            body: 'gtBindingIntroBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('elements');
            },
        },
        {
            id: 'gt-bind-select',
            target: '#elements-list',
            title: 'gtBindingSelect',
            body: 'gtBindingSelectBody',
            position: 'left',
            interactive: true,
            waitFor: 'ecbt:elementSelected',
        },
        {
            id: 'gt-bind-obs',
            target: '.observation-item, .obs-item',
            title: 'gtBindingObs',
            body: 'gtBindingObsBody',
            position: 'left',
        },
        {
            id: 'gt-bind-config',
            target: '#right-panel',
            title: 'gtBindingConfig',
            body: 'gtBindingConfigBody',
            position: 'left',
        },
        {
            id: 'gt-bind-complete',
            target: '#canvas-container',
            title: 'gtBindingComplete',
            body: 'gtBindingCompleteBody',
            position: 'bottom',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 9: Batch Data Entry Matrix
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'batch-data-entry',
    categoryId: 'field-data',
    nameKey: 'guidedTourDataEntry',
    descKey: 'guidedTourDataEntryDesc',
    icon: 'grid',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-dentry-ribbon',
            target: '[data-ribbon="insert"]',
            title: 'gtDataEntryRibbon',
            body: 'gtDataEntryRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('insert'),
        },
        {
            id: 'gt-dentry-btn',
            target: '[onclick*="handleOpenDataEntryMatrix"]',
            title: 'gtDataEntryBtn',
            body: 'gtDataEntryBtnBody',
            position: 'bottom',
        },
        {
            id: 'gt-dentry-modal',
            target: '#data-entry-modal, .data-entry-matrix',
            title: 'gtDataEntryModal',
            body: 'gtDataEntryModalBody',
            position: 'left',
            action: () => window.handleOpenDataEntryMatrix?.(),
            delay: 300,
        },
        {
            id: 'gt-dentry-grid',
            target: '.data-entry-grid, .data-entry-table',
            title: 'gtDataEntryGrid',
            body: 'gtDataEntryGridBody',
            position: 'left',
        },
        {
            id: 'gt-dentry-complete',
            target: '#data-entry-modal, .data-entry-matrix',
            title: 'gtDataEntryComplete',
            body: 'gtDataEntryCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('data-entry-modal'),
        },
    ],
});
