// @ts-check
// Generated from src/app/js/utils/tour/tours/campaignManagement.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   GUIDED TOURS — Campaign Management (3 tours, 12 steps)
   Tours 10-12: create campaign, planned readings,
   campaign visibility toggle
   ================================================================ */
import { registerGuidedTour } from '../categories.js';
import { ensureRightPanel, switchTab } from '../steps.js';
// ----------------------------------------------------------------
// Tour 10: Create Sampling Campaign
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'create-campaign',
    categoryId: 'campaign-management',
    nameKey: 'guidedTourCreateCampaign',
    descKey: 'guidedTourCreateCampaignDesc',
    icon: 'calendar',
    difficulty: 'beginner',
    estimatedMinutes: 2,
    prerequisites: { minElements: 0, autoScaffold: false },
    steps: [
        {
            id: 'gt-camp-tab',
            target: '.tab[data-tab="campaigns"]',
            title: 'gtCreateCampaignTab',
            body: 'gtCreateCampaignTabBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('campaigns');
            },
        },
        {
            id: 'gt-camp-add-btn',
            target: '[onclick*="handleAddCampaign"]',
            title: 'gtCreateCampaignBtn',
            body: 'gtCreateCampaignBtnBody',
            position: 'bottom',
            action: () => window.switchRibbonTab?.('insert'),
        },
        {
            id: 'gt-camp-form',
            target: '#campaigns-list, .campaign-list',
            title: 'gtCreateCampaignForm',
            body: 'gtCreateCampaignFormBody',
            position: 'left',
            action: () => {
                ensureRightPanel();
                switchTab('campaigns');
            },
            interactive: true,
            waitFor: 'ecbt:campaignAdded',
        },
        {
            id: 'gt-camp-complete',
            target: '#right-panel',
            title: 'gtCreateCampaignComplete',
            body: 'gtCreateCampaignCompleteBody',
            position: 'left',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 11: Add Planned Readings
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'add-planned-readings',
    categoryId: 'campaign-management',
    nameKey: 'guidedTourPlannedReadings',
    descKey: 'guidedTourPlannedReadingsDesc',
    icon: 'clipboard',
    difficulty: 'intermediate',
    estimatedMinutes: 3,
    prerequisites: { minCampaigns: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-plan-tab',
            target: '.tab[data-tab="campaigns"]',
            title: 'gtPlannedReadingsTab',
            body: 'gtPlannedReadingsTabBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('campaigns');
            },
        },
        {
            id: 'gt-plan-select',
            target: '#campaigns-list',
            title: 'gtPlannedReadingsSelect',
            body: 'gtPlannedReadingsSelectBody',
            position: 'left',
        },
        {
            id: 'gt-plan-expand',
            target: '.campaign-item, .campaign-details',
            title: 'gtPlannedReadingsExpand',
            body: 'gtPlannedReadingsExpandBody',
            position: 'left',
        },
        {
            id: 'gt-plan-add',
            target: '.campaign-item, .campaign-details',
            title: 'gtPlannedReadingsAdd',
            body: 'gtPlannedReadingsAddBody',
            position: 'left',
        },
        {
            id: 'gt-plan-complete',
            target: '#right-panel',
            title: 'gtPlannedReadingsComplete',
            body: 'gtPlannedReadingsCompleteBody',
            position: 'left',
        },
    ],
});
// ----------------------------------------------------------------
// Tour 12: Campaign Visibility
// ----------------------------------------------------------------
registerGuidedTour({
    id: 'campaign-visibility',
    categoryId: 'campaign-management',
    nameKey: 'guidedTourCampaignVis',
    descKey: 'guidedTourCampaignVisDesc',
    icon: 'eye-off',
    difficulty: 'beginner',
    estimatedMinutes: 1,
    prerequisites: { minCampaigns: 1, autoScaffold: true },
    steps: [
        {
            id: 'gt-cvis-tab',
            target: '.tab[data-tab="campaigns"]',
            title: 'gtCampaignVisTab',
            body: 'gtCampaignVisTabBody',
            position: 'bottom',
            action: () => {
                ensureRightPanel();
                switchTab('campaigns');
            },
        },
        {
            id: 'gt-cvis-toggle',
            target: '#campaigns-list',
            title: 'gtCampaignVisToggle',
            body: 'gtCampaignVisToggleBody',
            position: 'left',
        },
        {
            id: 'gt-cvis-complete',
            target: '#canvas-container',
            title: 'gtCampaignVisComplete',
            body: 'gtCampaignVisCompleteBody',
            position: 'bottom',
        },
    ],
});
