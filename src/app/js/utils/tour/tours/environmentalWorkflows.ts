// Generated from src/app/js/utils/tour/tours/environmentalWorkflows.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   GUIDED TOURS — Environmental Workflows (3 tours, 17 steps)
   Tours 32-34: plume delineation, emergency response,
   risk assessment workflow
   ================================================================ */

import { registerGuidedTour } from '../categories.js';

// ----------------------------------------------------------------
// Tour 32: Plume Delineation Workflow
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'plume-delineation-workflow',
    categoryId: 'environmental-workflows',
    nameKey: 'guidedTourPlumeDelineation',
    descKey: 'guidedTourPlumeDelineationDesc',
    icon: 'droplet',
    difficulty: 'advanced',
    estimatedMinutes: 5,
    prerequisites: { minElements: 3, minObservations: 5, autoScaffold: true },
    steps: [
        {
            id: 'gt-plume-ribbon',
            target: '[onclick*="handleOpenWorkflowPicker"]',
            title: 'gtPlumeDelineationRibbon',
            body: 'gtPlumeDelineationRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-plume-picker',
            target: '#workflow-picker-modal, .workflow-picker',
            title: 'gtPlumeDelineationPicker',
            body: 'gtPlumeDelineationPickerBody',
            position: 'left',
            action: () => /** @type {any} */ (window).handleOpenWorkflowPicker?.(),
            delay: 400,
        },
        {
            id: 'gt-plume-select',
            target: '#workflow-picker-modal, .workflow-picker',
            title: 'gtPlumeDelineationSelect',
            body: 'gtPlumeDelineationSelectBody',
            position: 'left',
        },
        {
            id: 'gt-plume-wizard',
            target: '#workflow-wizard, .workflow-wizard-modal',
            title: 'gtPlumeDelineationWizard',
            body: 'gtPlumeDelineationWizardBody',
            position: 'left',
        },
        {
            id: 'gt-plume-steps',
            target: '#workflow-wizard, .workflow-wizard-modal',
            title: 'gtPlumeDelineationSteps',
            body: 'gtPlumeDelineationStepsBody',
            position: 'left',
        },
        {
            id: 'gt-plume-complete',
            target: '#canvas-container',
            title: 'gtPlumeDelineationComplete',
            body: 'gtPlumeDelineationCompleteBody',
            position: 'bottom',
            postAction: () => {
                window.closeModal?.('workflow-picker-modal');
                window.closeModal?.('workflow-wizard');
            },
        },
    ],
});

// ----------------------------------------------------------------
// Tour 33: Emergency Response Workflow
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'emergency-response-workflow',
    categoryId: 'environmental-workflows',
    nameKey: 'guidedTourEmergencyResponse',
    descKey: 'guidedTourEmergencyResponseDesc',
    icon: 'alert-circle',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-emerg-ribbon',
            target: '[onclick*="handleOpenWorkflowPicker"]',
            title: 'gtEmergencyResponseRibbon',
            body: 'gtEmergencyResponseRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-emerg-picker',
            target: '#workflow-picker-modal, .workflow-picker',
            title: 'gtEmergencyResponsePicker',
            body: 'gtEmergencyResponsePickerBody',
            position: 'left',
            action: () => /** @type {any} */ (window).handleOpenWorkflowPicker?.(),
            delay: 400,
        },
        {
            id: 'gt-emerg-select',
            target: '#workflow-picker-modal, .workflow-picker',
            title: 'gtEmergencyResponseSelect',
            body: 'gtEmergencyResponseSelectBody',
            position: 'left',
        },
        {
            id: 'gt-emerg-wizard',
            target: '#workflow-wizard, .workflow-wizard-modal',
            title: 'gtEmergencyResponseWizard',
            body: 'gtEmergencyResponseWizardBody',
            position: 'left',
        },
        {
            id: 'gt-emerg-complete',
            target: '#canvas-container',
            title: 'gtEmergencyResponseComplete',
            body: 'gtEmergencyResponseCompleteBody',
            position: 'bottom',
            postAction: () => {
                window.closeModal?.('workflow-picker-modal');
                window.closeModal?.('workflow-wizard');
            },
        },
    ],
});

// ----------------------------------------------------------------
// Tour 34: Risk Assessment Workflow
// ----------------------------------------------------------------

registerGuidedTour({
    id: 'risk-assessment-workflow',
    categoryId: 'environmental-workflows',
    nameKey: 'guidedTourRiskAssessment',
    descKey: 'guidedTourRiskAssessmentDesc',
    icon: 'shield',
    difficulty: 'advanced',
    estimatedMinutes: 5,
    prerequisites: { minElements: 3, minObservations: 5, autoScaffold: true },
    steps: [
        {
            id: 'gt-risk-ribbon',
            target: '[onclick*="handleOpenWorkflowPicker"]',
            title: 'gtRiskAssessmentRibbon',
            body: 'gtRiskAssessmentRibbonBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('optimize'),
            delay: 200,
        },
        {
            id: 'gt-risk-picker',
            target: '#workflow-picker-modal, .workflow-picker',
            title: 'gtRiskAssessmentPicker',
            body: 'gtRiskAssessmentPickerBody',
            position: 'left',
            action: () => /** @type {any} */ (window).handleOpenWorkflowPicker?.(),
            delay: 400,
        },
        {
            id: 'gt-risk-select',
            target: '#workflow-picker-modal, .workflow-picker',
            title: 'gtRiskAssessmentSelect',
            body: 'gtRiskAssessmentSelectBody',
            position: 'left',
        },
        {
            id: 'gt-risk-wizard',
            target: '#workflow-wizard, .workflow-wizard-modal',
            title: 'gtRiskAssessmentWizard',
            body: 'gtRiskAssessmentWizardBody',
            position: 'left',
        },
        {
            id: 'gt-risk-matrix',
            target: '#workflow-wizard, .workflow-wizard-modal',
            title: 'gtRiskAssessmentMatrix',
            body: 'gtRiskAssessmentMatrixBody',
            position: 'left',
        },
        {
            id: 'gt-risk-complete',
            target: '#canvas-container',
            title: 'gtRiskAssessmentComplete',
            body: 'gtRiskAssessmentCompleteBody',
            position: 'bottom',
            postAction: () => {
                window.closeModal?.('workflow-picker-modal');
                window.closeModal?.('workflow-wizard');
            },
        },
    ],
});
