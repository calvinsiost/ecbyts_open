// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GUIDED TOURS — Import & Export (5 tours, 27 steps)
   Tours 17-21: export ECO1, import ECO1, spreadsheet wizard,
   document import (PDF/DOCX), data loading from scratch
   ================================================================ */

import { registerGuidedTour } from '../categories.js';

declare global {
    interface Window {
        switchRibbonTab?: (tab: string) => void;
        openExportModal?: () => void;
        closeModal?: (id: string) => void;
        openImportModal?: () => void;
        handleOpenIngestionModal?: () => void;
        switchView?: (view: string) => void;
        handleCloseIngestionModal?: () => void;
    }
}

// ----------------------------------------------------------------
// Tour 17: Export ECO1 Key
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'export-ecbt-key',
    categoryId: 'import-export',
    nameKey: 'guidedTourExportECBT',
    descKey: 'guidedTourExportECBTDesc',
    icon: 'upload',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-exp-ribbon',
            target: '[data-ribbon="file"]',
            title: 'gtExportRibbon',
            body: 'gtExportRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('file'),
        },
        {
            id: 'gt-exp-btn',
            target: '[onclick*="openExportModal"]',
            title: 'gtExportBtn',
            body: 'gtExportBtnBody',
            position: 'bottom',
        },
        {
            id: 'gt-exp-modal',
            target: '#export-modal, .export-modal',
            title: 'gtExportModal',
            body: 'gtExportModalBody',
            position: 'left',
            action: () => window.openExportModal?.(),
            delay: 300,
        },
        {
            id: 'gt-exp-complete',
            target: '#export-modal, .export-modal',
            title: 'gtExportComplete',
            body: 'gtExportCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('export-modal'),
        },
    ],
});

// ----------------------------------------------------------------
// Tour 18: Import ECBT Key
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'import-ecbt-key',
    categoryId: 'import-export',
    nameKey: 'guidedTourImportECBT',
    descKey: 'guidedTourImportECBTDesc',
    icon: 'download',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-imp-ribbon',
            target: '[data-ribbon="file"]',
            title: 'gtImportRibbon',
            body: 'gtImportRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('file'),
        },
        {
            id: 'gt-imp-btn',
            target: '[onclick*="openImportModal"], [onclick*="handleOpenImportModal"]',
            title: 'gtImportBtn',
            body: 'gtImportBtnBody',
            position: 'bottom',
        },
        {
            id: 'gt-imp-modal',
            target: '#import-modal, .import-modal',
            title: 'gtImportModal',
            body: 'gtImportModalBody',
            position: 'left',
            action: () => window.openImportModal?.(),
            delay: 300,
        },
        {
            id: 'gt-imp-complete',
            target: '#import-modal, .import-modal',
            title: 'gtImportComplete',
            body: 'gtImportCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('import-modal'),
        },
    ],
});

// ----------------------------------------------------------------
// Tour 19: Spreadsheet Import Wizard
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'spreadsheet-import-wizard',
    categoryId: 'import-export',
    nameKey: 'guidedTourSpreadsheet',
    descKey: 'guidedTourSpreadsheetDesc',
    icon: 'file-text',
    difficulty: 'intermediate',
    estimatedMinutes: 4,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-xlsx-ribbon',
            target: '[data-ribbon="insert"]',
            title: 'gtSpreadsheetRibbon',
            body: 'gtSpreadsheetRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('insert'),
        },
        {
            id: 'gt-xlsx-btn',
            target: '[onclick*="handleOpenIngestionModal"]',
            title: 'gtSpreadsheetBtn',
            body: 'gtSpreadsheetBtnBody',
            position: 'bottom',
        },
        {
            id: 'gt-xlsx-upload',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtSpreadsheetUpload',
            body: 'gtSpreadsheetUploadBody',
            position: 'left',
            action: () => window.handleOpenIngestionModal?.(),
            delay: 400,
        },
        {
            id: 'gt-xlsx-mapping',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtSpreadsheetMapping',
            body: 'gtSpreadsheetMappingBody',
            position: 'left',
        },
        {
            id: 'gt-xlsx-validate',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtSpreadsheetValidate',
            body: 'gtSpreadsheetValidateBody',
            position: 'left',
        },
        {
            id: 'gt-xlsx-preview',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtSpreadsheetPreview',
            body: 'gtSpreadsheetPreviewBody',
            position: 'left',
        },
        {
            id: 'gt-xlsx-complete',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtSpreadsheetComplete',
            body: 'gtSpreadsheetCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('ingestion-modal'),
        },
    ],
});

// ----------------------------------------------------------------
// Tour 20: Document Import (PDF/DOCX)
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'document-import-pdf',
    categoryId: 'import-export',
    nameKey: 'guidedTourDocImport',
    descKey: 'guidedTourDocImportDesc',
    icon: 'file-plus',
    difficulty: 'advanced',
    estimatedMinutes: 4,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-doc-ribbon',
            target: '[data-ribbon="insert"]',
            title: 'gtDocImportRibbon',
            body: 'gtDocImportRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('insert'),
        },
        {
            id: 'gt-doc-btn',
            target: '[onclick*="handleOpenIngestionModal"]',
            title: 'gtDocImportBtn',
            body: 'gtDocImportBtnBody',
            position: 'bottom',
        },
        {
            id: 'gt-doc-upload',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtDocImportUpload',
            body: 'gtDocImportUploadBody',
            position: 'left',
            action: () => window.handleOpenIngestionModal?.(),
            delay: 400,
        },
        {
            id: 'gt-doc-ai',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtDocImportAI',
            body: 'gtDocImportAIBody',
            position: 'left',
        },
        {
            id: 'gt-doc-review',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtDocImportReview',
            body: 'gtDocImportReviewBody',
            position: 'left',
        },
        {
            id: 'gt-doc-complete',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtDocImportComplete',
            body: 'gtDocImportCompleteBody',
            position: 'left',
            postAction: () => window.closeModal?.('ingestion-modal'),
        },
    ],
});

// ----------------------------------------------------------------
// Tour 21: Data Loading from Scratch (full journey)
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'data-loading-from-scratch',
    categoryId: 'import-export',
    nameKey: 'guidedTourDataLoading',
    descKey: 'guidedTourDataLoadingDesc',
    icon: 'hard-drive',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-dl-home',
            target: '.home-stats, [data-testid="home-stats"]',
            title: 'gtDataLoadingHome',
            body: 'gtDataLoadingHomeBody',
            position: 'bottom',
            action: () => window.switchView?.('home'),
            delay: 500,
        },
        {
            id: 'gt-dl-newproject',
            target: '[onclick*="newProject"], [data-ribbon="file"]',
            title: 'gtDataLoadingNewProject',
            body: 'gtDataLoadingNewProjectBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('file'),
        },
        {
            id: 'gt-dl-wizard',
            target: '#ingestion-modal, .ingestion-wizard, [onclick*="handleOpenIngestionModal"]',
            title: 'gtDataLoadingWizard',
            body: 'gtDataLoadingWizardBody',
            position: 'left',
            action: () => window.handleOpenIngestionModal?.(),
            delay: 400,
        },
        {
            id: 'gt-dl-quickimport',
            target: '#ingestion-modal, .ingestion-wizard',
            title: 'gtDataLoadingQuickImport',
            body: 'gtDataLoadingQuickImportBody',
            position: 'left',
        },
        {
            id: 'gt-dl-merge',
            target: '#import-modal, #import-merge-toggle',
            title: 'gtDataLoadingMerge',
            body: 'gtDataLoadingMergeBody',
            position: 'left',
            action: () => {
                window.handleCloseIngestionModal?.();
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => window.openImportModal?.());
                });
            },
            delay: 500,
        },
        {
            id: 'gt-dl-completeness',
            target: '.home-suggested, [data-testid="home-suggested"]',
            title: 'gtDataLoadingCompleteness',
            body: 'gtDataLoadingCompletenessBody',
            position: 'top',
            action: () => {
                window.closeModal?.('import-modal');
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => window.switchView?.('home'));
                });
            },
            delay: 500,
        },
    ],
});
