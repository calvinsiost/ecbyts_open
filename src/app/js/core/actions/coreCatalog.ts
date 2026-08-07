// This file is part of ecbyts/ECBT.
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   CORE CATALOG — SPEC_ACTIONS_INTEGRATION_EXPANDED_DEFAULT_UX P1-39

   10 canonical seed actions covering the primary user workflows:
   import, export, analyze, visualize, configure, collaborate.
   ================================================================ */

import { createCatalogAction, ACTION_CATEGORIES } from './actionCatalog.js';

/**
 * Canonical seed actions for the action-first launchpad.
 * Ações canônicas de exemplo para o launchpad orientado a ações.
 */
export const CORE_CATALOG_ACTIONS: ReadonlyArray<import('./actionCatalog.js').CatalogAction> = Object.freeze([
    createCatalogAction({
        id: 'import-edd',
        category: ACTION_CATEGORIES.IMPORT,
        labelKey: 'actions.importEdd',
        // BOOT-RESILIENCE-001: handler real (era 'handleOpenEddWizard', órfão).
        // O wizard de ingestão É o caminho EDD/XLSX (datastudio/extractionPanel).
        handler: 'handleOpenIngestionWizard',
        tags: ['edd', 'xlsx', 'import', 'data', 'wizard', 'bulk'],
        priority: 1,
    }),
    createCatalogAction({
        id: 'import-manual',
        category: ACTION_CATEGORIES.IMPORT,
        labelKey: 'actions.manualEntry',
        // BOOT-RESILIENCE-001: handler real (era 'handleOpenManualEntry', órfão).
        handler: 'handleOpenDataEntryMatrix',
        tags: ['manual', 'observation', 'entry', 'add', 'measurement'],
        priority: 2,
    }),
    createCatalogAction({
        id: 'export-key',
        category: ACTION_CATEGORIES.EXPORT,
        labelKey: 'actions.exportEcbt',
        // BOOT-RESILIENCE-001: handler real (era 'handleExportKey', órfão).
        // openExportModal abre o modal de exportação .ecokey/JSON (modals.ts).
        handler: 'openExportModal',
        tags: ['export', 'ecbt', 'key', 'backup', 'share'],
        priority: 3,
    }),
    createCatalogAction({
        id: 'export-report',
        category: ACTION_CATEGORIES.EXPORT,
        labelKey: 'actions.exportReport',
        // BOOT-RESILIENCE-001: handler real (era 'handleGenerateReport', órfão).
        handler: 'handleOpenReportBuilder',
        tags: ['report', 'pdf', 'docx', 'export', 'document'],
        priority: 4,
    }),
    createCatalogAction({
        id: 'analyze-eis',
        category: ACTION_CATEGORIES.ANALYZE,
        labelKey: 'actions.calcEis',
        // BOOT-RESILIENCE-001: handler real (era 'handleRecalcEis', órfão).
        // Registrado via Object.assign(window, eisHandlers) (handlers/index.ts).
        handler: 'handleRefreshEisDashboard',
        tags: ['eis', 'score', 'analytics', 'integrity', 'tccca'],
        priority: 5,
    }),
    createCatalogAction({
        id: 'analyze-stats',
        category: ACTION_CATEGORIES.ANALYZE,
        labelKey: 'actions.runStats',
        handler: 'handleDsAnalyticsRun',
        tags: ['statistics', 'analytics', 'datastudio', 'mann-kendall', 'trend'],
        priority: 6,
    }),
    createCatalogAction({
        id: 'viz-random',
        category: ACTION_CATEGORIES.VISUALIZE,
        labelKey: 'actions.randomModel',
        handler: 'handleGenerateRandomModel',
        tags: ['random', 'demo', 'model', 'generate', '3d'],
        priority: 7,
    }),
    createCatalogAction({
        id: 'viz-constellation',
        category: ACTION_CATEGORIES.VISUALIZE,
        labelKey: 'actions.constellation',
        // BOOT-RESILIENCE-001: handler real (era 'handleToggleConstellation',
        // órfão). Registrado em utils/ui/panelManager.ts.
        handler: 'toggleConstellation',
        tags: ['constellation', 'graph', 'hud', 'network', 'visualization'],
        priority: 8,
    }),
    createCatalogAction({
        id: 'collab-share',
        category: ACTION_CATEGORIES.COLLABORATE,
        labelKey: 'actions.shareRadar',
        handler: 'handleOpenRadarModal',
        tags: ['share', 'radar', 'broadcast', 'stakeholder', 'collaborate'],
        requiresPremium: false,
        priority: 9,
    }),
    createCatalogAction({
        id: 'configure-eis',
        category: ACTION_CATEGORIES.CONFIGURE,
        labelKey: 'actions.configEis',
        handler: 'handleOpenEisDashboard',
        tags: ['eis', 'config', 'dashboard', 'settings', 'score'],
        priority: 10,
    }),
]);
