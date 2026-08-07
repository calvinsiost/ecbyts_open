// @ts-check
// Generated from src/app/js/utils/tour/steps.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   TOUR STEPS — Step definitions for the onboarding tour
   Definicoes de steps do tour de onboarding

   4 capitulos: basics, data, modules, advanced
   Cada step define: target (CSS selector), texto (i18n keys),
   acoes (action/postAction), e se e interativo.
   ================================================================ */
// ----------------------------------------------------------------
// PANEL HELPERS - Garantem que paineis estejam abertos
// Exportados para reuso nos guided tours (tours/)
// ----------------------------------------------------------------
import { welcomeTour } from './tours/welcome-tour.js';
export function ensureLeftPanel() {
    const lp = document.getElementById('left-panel');
    if (lp && lp.classList.contains('panel-minimized')) {
        window.toggleLeftPanel?.();
    }
}
export function ensureRightPanel() {
    const rp = document.getElementById('right-panel');
    if (rp && rp.classList.contains('panel-minimized')) {
        window.toggleRightPanel?.();
    }
}
export function ensureConstellationOpen() {
    const hud = document.getElementById('constellation-hud');
    if (hud && hud.classList.contains('constellation-collapsed')) {
        window.handleToggleConstellation?.();
    }
}
export function switchTab(tabName: string) {
    const tab = document.querySelector(`.tab[data-tab="${tabName}"]`) as HTMLElement | null;
    if (tab) tab.click();
}
// ----------------------------------------------------------------
// CHAPTER DEFINITIONS
// ----------------------------------------------------------------
export const TOUR_CHAPTERS = {
    welcome: {
        id: 'welcome',
        titleKey: welcomeTour.titleKey,
        descKey: 'welcomeTourDesc',
        icon: 'sparkles',
        color: '#16a34a',
        steps: welcomeTour.steps,
    },
    basics: {
        id: 'basics',
        titleKey: 'tourChapterBasics',
        descKey: 'tourChapterBasicsDesc',
        icon: 'play-circle',
        color: '#3b82f6',
        steps: [
            {
                id: 'nav-tabs',
                target: '#swipe-nav',
                title: 'tourNavTabs',
                body: 'tourNavTabsBody',
                position: 'bottom',
            },
            {
                id: 'welcome-viewport',
                target: '#canvas-container',
                title: 'tourViewport',
                body: 'tourViewportBody',
                position: 'bottom',
                action: () => {
                    // Ensure 3D view is active - canvas-container must be visible
                    if (window.switchView) {
                        window.switchView('3d');
                    }
                },
            },
            {
                id: 'camera-controls',
                // #view-controls era um stub legado (display:none). O HUD real e #scene-hud.
                target: '#scene-hud',
                title: 'tourCameraControls',
                body: 'tourCameraControlsBody',
                position: 'top',
            },
            {
                id: 'ribbon-menubar',
                // #menubar esta oculto (grid-row 0px). A toolbar real e #toolbar.
                target: '#toolbar',
                title: 'tourRibbon',
                body: 'tourRibbonBody',
                position: 'bottom',
            },
            {
                id: 'toolbar-new',
                target: '#tg-file button[onclick*="newProject"]',
                title: 'tourToolbarNew',
                body: 'tourToolbarNewBody',
                position: 'bottom',
            },
            {
                id: 'toolbar-import',
                target: '#tg-file button[onclick*="openImportModal"]',
                title: 'tourToolbarImport',
                body: 'tourToolbarImportBody',
                position: 'bottom',
            },
            {
                id: 'toolbar-export',
                target: '#tg-file button[onclick*="openExportModal"]',
                title: 'tourToolbarExport',
                body: 'tourToolbarExportBody',
                position: 'bottom',
            },
            {
                id: 'ribbon-file',
                // Aponta para o grupo de historico (desfazer/refazer) - sempre visivel.
                target: '#tg-history',
                title: 'tourRibbonFile',
                body: 'tourRibbonFileBody',
                position: 'bottom',
            },
            {
                id: 'left-panel',
                target: '#left-panel',
                title: 'tourLeftPanel',
                body: 'tourLeftPanelBody',
                position: 'right',
                action: () => {
                    window.switchRibbonTab?.('home');
                    ensureLeftPanel();
                },
            },
            {
                id: 'families-list',
                target: '#families-list',
                title: 'tourFamilies',
                body: 'tourFamiliesBody',
                position: 'right',
                action: () => ensureLeftPanel(),
            },
            {
                id: 'add-element',
                // Ilumina a lista inteira - mais claro do que destacar só o 1º item.
                target: '#families-list',
                title: 'tourAddElement',
                body: 'tourAddElementBody',
                position: 'right',
                interactive: true,
                waitFor: 'elementAdded',
                action: () => ensureLeftPanel(),
            },
            {
                id: 'right-panel',
                target: '#right-panel',
                title: 'tourRightPanel',
                body: 'tourRightPanelBody',
                position: 'left',
                action: () => ensureRightPanel(),
            },
            {
                id: 'right-panel-tabs',
                target: '#right-tabs',
                title: 'tourRightPanelTabs',
                body: 'tourRightPanelTabsBody',
                position: 'left',
                action: () => ensureRightPanel(),
            },
            {
                id: 'project-tab',
                target: '.tab[data-tab="project"]',
                title: 'tourProjectTab',
                body: 'tourProjectTabBody',
                position: 'bottom',
                action: () => ensureRightPanel(),
            },
            {
                id: 'project-init-section',
                target: '[data-section-id="projectInit"]',
                title: 'tourProjectInit',
                body: 'tourProjectInitBody',
                position: 'left',
                action: () => {
                    ensureRightPanel();
                    switchTab('project');
                },
            },
            {
                id: 'elements-tab',
                target: '.tab[data-tab="elements"]',
                title: 'tourElementsTab',
                body: 'tourElementsTabBody',
                position: 'bottom',
                action: () => ensureRightPanel(),
            },
            {
                id: 'constellation-intro',
                target: '#constellation-hud',
                title: 'tourConstellationHud',
                body: 'tourConstellationHudBody',
                position: 'top',
                action: () => ensureConstellationOpen(),
            },
            {
                id: 'constellation-graph',
                target: '.constellation-tab[data-ctab="graph"]',
                title: 'tourConstellationGraph',
                body: 'tourConstellationGraphBody',
                position: 'top',
                action: () => ensureConstellationOpen(),
            },
            {
                id: 'constellation-tables',
                target: '.constellation-tab[data-ctab="pdplu"]',
                title: 'tourConstellationTables',
                body: 'tourConstellationTablesBody',
                position: 'top',
                action: () => ensureConstellationOpen(),
            },
            {
                id: 'constellation-report',
                target: '.constellation-tab[data-ctab="report"]',
                title: 'tourConstellationReport',
                body: 'tourConstellationReportBody',
                position: 'top',
                action: () => ensureConstellationOpen(),
            },
            {
                id: 'constellation-storyboard',
                target: '.constellation-tab[data-ctab="storyboard"]',
                title: 'tourConstellationStoryboard',
                body: 'tourConstellationStoryboardBody',
                position: 'top',
                action: () => ensureConstellationOpen(),
            },
            {
                id: 'titlebar-language',
                target: '#lang-dropdown-trigger',
                title: 'tourTitlebarLanguage',
                body: 'tourTitlebarLanguageBody',
                position: 'bottom',
            },
            {
                id: 'titlebar-help',
                target: '#tour-titlebar-btn',
                title: 'tourTitlebarHelp',
                body: 'tourTitlebarHelpBody',
                position: 'bottom',
            },
            {
                id: 'titlebar-reportbug',
                target: '.titlebar-bug-btn',
                title: 'tourTitlebarReportBug',
                body: 'tourTitlebarReportBugBody',
                position: 'bottom',
            },
            {
                id: 'titlebar-more',
                target: '#tg-more-trigger',
                title: 'tourTitlebarMore',
                body: 'tourTitlebarMoreBody',
                position: 'bottom',
            },
            {
                id: 'titlebar-docs',
                // Aponta para o container #dd-more (dropdown inteiro) - mais confiavel
                // do que um botao interno, pois a posicao do container e calculada aqui.
                target: '#dd-more',
                title: 'tourTitlebarDocs',
                body: 'tourTitlebarDocsBody',
                position: 'left',
                action: () => {
                    const trigger = document.getElementById('tg-more-trigger');
                    const dd = document.getElementById('dd-more');
                    if (!trigger || !dd) return;
                    // Replicar positionDropdown() de ribbon.js para garantir top/left
                    // corretos - sem isso #dd-more (position:fixed) fica em (0,0).
                    const rect = trigger.getBoundingClientRect();
                    const margin = 8;
                    const ddMinWidth = 220;
                    const leftAligned = rect.left;
                    const wouldOverflowRight = leftAligned + ddMinWidth > window.innerWidth - margin;
                    dd.style.top = rect.bottom + 2 + 'px';
                    dd.style.left =
                        (wouldOverflowRight ? Math.max(margin, rect.right - ddMinWidth) : leftAligned) + 'px';
                    // Forçar visivel com !important: sobrescreve a cascata CSS mesmo
                    // que closeAllDropdowns() remova a classe .open.
                    dd.classList.add('open');
                    dd.style.setProperty('visibility', 'visible', 'important');
                    dd.style.setProperty('opacity', '1', 'important');
                    dd.style.setProperty('pointer-events', 'auto', 'important');
                    dd.style.setProperty('transform', 'translateY(0)', 'important');
                    trigger.setAttribute('aria-expanded', 'true');
                },
                postAction: () => {
                    const dd = document.getElementById('dd-more');
                    const trigger = document.getElementById('tg-more-trigger');
                    if (dd) {
                        dd.classList.remove('open');
                        dd.style.removeProperty('visibility');
                        dd.style.removeProperty('opacity');
                        dd.style.removeProperty('pointer-events');
                        dd.style.removeProperty('transform');
                    }
                    if (trigger) trigger.setAttribute('aria-expanded', 'false');
                },
                delay: 150,
            },
            {
                id: 'panel-collapse-toggle',
                target: '#toggle-left-panel-btn',
                title: 'tourPanelCollapseToggle',
                body: 'tourPanelCollapseToggleBody',
                position: 'bottom',
                action: () => {
                    // Open the Panels dropdown so the toggle buttons are visible
                    const trigger = document.querySelector('[data-dropdown="dd-panels"]');
                    const dd = document.getElementById('dd-panels');
                    if (trigger && dd) {
                        const rect = trigger.getBoundingClientRect();
                        dd.style.top = rect.bottom + 2 + 'px';
                        dd.style.left = rect.left + 'px';
                        dd.classList.add('open');
                        dd.style.setProperty('visibility', 'visible', 'important');
                        dd.style.setProperty('opacity', '1', 'important');
                        dd.style.setProperty('pointer-events', 'auto', 'important');
                        dd.style.setProperty('transform', 'translateY(0)', 'important');
                        trigger.setAttribute('aria-expanded', 'true');
                    }
                },
                postAction: () => {
                    const dd = document.getElementById('dd-panels');
                    const trigger = document.querySelector('[data-dropdown="dd-panels"]');
                    if (dd) {
                        dd.classList.remove('open');
                        dd.style.removeProperty('visibility');
                        dd.style.removeProperty('opacity');
                        dd.style.removeProperty('pointer-events');
                        dd.style.removeProperty('transform');
                    }
                    if (trigger) trigger.setAttribute('aria-expanded', 'false');
                },
                delay: 150,
            },
            {
                id: 'panel-collapse-constellation',
                target: '.constellation-collapse-btn',
                title: 'tourPanelCollapseConstellation',
                body: 'tourPanelCollapseConstellationBody',
                position: 'top',
                action: () => ensureConstellationOpen(),
            },
            {
                id: 'panel-collapse-minimize',
                target: '#min-tabs-left',
                title: 'tourPanelCollapseMinimize',
                body: 'tourPanelCollapseMinimizeBody',
                position: 'right',
            },
            {
                id: 'basics-complete',
                target: '#canvas-container',
                title: 'tourBasicsComplete',
                body: 'tourBasicsCompleteBody',
                position: 'bottom',
            },
        ],
    },
    data: {
        id: 'data',
        titleKey: 'tourChapterData',
        descKey: 'tourChapterDataDesc',
        icon: 'database',
        color: '#22c55e',
        steps: [
            {
                id: 'data-intro',
                target: '#right-panel',
                title: 'tourDataIntro',
                body: 'tourDataIntroBody',
                position: 'left',
                action: () => ensureRightPanel(),
            },
            {
                id: 'campaigns-tab',
                target: '.tab[data-tab="campaigns"]',
                title: 'tourCampaignsTab',
                body: 'tourCampaignsTabBody',
                position: 'bottom',
                action: () => ensureRightPanel(),
            },
            {
                id: 'scenes-tab',
                target: '.tab[data-tab="scenes"]',
                title: 'tourScenesTab',
                body: 'tourScenesTabBody',
                position: 'bottom',
                action: () => ensureRightPanel(),
            },
            {
                id: 'analytics-tab',
                target: '.tab[data-tab="analytics"]',
                title: 'tourAnalyticsTab',
                body: 'tourAnalyticsTabBody',
                position: 'bottom',
                action: () => ensureRightPanel(),
            },
            {
                id: 'governance-tab',
                target: '.tab[data-tab="governance"]',
                title: 'tourGovernanceTab',
                body: 'tourGovernanceTabBody',
                position: 'bottom',
                action: () => ensureRightPanel(),
            },
            {
                id: 'insert-ribbon',
                target: '#tg-insert',
                title: 'tourInsertRibbon',
                body: 'tourInsertRibbonBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('insert'),
            },
            {
                id: 'modeling-ribbon',
                target: '#tg-analyze',
                title: 'tourModelingRibbon',
                body: 'tourModelingRibbonBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('modeling'),
            },
            {
                id: 'data-complete',
                target: '#right-panel',
                title: 'tourDataComplete',
                body: 'tourDataCompleteBody',
                position: 'left',
            },
        ],
    },
    modules: {
        id: 'modules',
        titleKey: 'tourChapterModules',
        descKey: 'tourChapterModulesDesc',
        icon: 'cpu',
        color: '#a855f7',
        steps: [
            {
                id: 'modules-intro',
                target: '#menubar',
                title: 'tourModulesIntro',
                body: 'tourModulesIntroBody',
                position: 'bottom',
            },
            {
                id: 'nn-btn',
                target: '[onclick*="handleOpenNNManager"]',
                title: 'tourNNBtn',
                body: 'tourNNBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('optimize'),
                delay: 200,
            },
            {
                id: 'nn-modal',
                target: '#nn-modal',
                title: 'tourNNModal',
                body: 'tourNNModalBody',
                position: 'left',
                action: () => window.handleOpenNNManager?.(),
                postAction: () => window.closeModal?.('nn-modal'),
                delay: 300,
            },
            {
                id: 'aerial-btn',
                target: '[onclick*="handleOpenAerialModal"]',
                title: 'tourAerialBtn',
                body: 'tourAerialBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('optimize'),
                delay: 200,
            },
            {
                id: 'aerial-modal',
                target: '#aerial-recognition-modal',
                title: 'tourAerialModal',
                body: 'tourAerialModalBody',
                position: 'left',
                action: () => window.handleOpenAerialModal?.(),
                postAction: () => window.closeModal?.('aerial-recognition-modal'),
                delay: 300,
            },
            {
                id: 'calculator-btn',
                target: '[onclick*="handleOpenCalculator"]',
                title: 'tourCalculatorBtn',
                body: 'tourCalculatorBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('view'),
                delay: 200,
            },
            {
                id: 'calculator-modal',
                target: '#calculator-modal',
                title: 'tourCalculatorModal',
                body: 'tourCalculatorModalBody',
                position: 'left',
                action: () => window.handleOpenCalculator?.(),
                postAction: () => window.handleCloseCalculator?.(),
                delay: 300,
            },
            {
                id: 'interpolation-btn',
                target: '[onclick*="handleOpenInterpolationPanel"]',
                title: 'tourInterpolationBtn',
                body: 'tourInterpolationBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('optimize'),
                delay: 200,
            },
            {
                id: 'interpolation-modal',
                target: '.modal-overlay#interpolation-modal, [id*="interpolation"]',
                title: 'tourInterpolationModal',
                body: 'tourInterpolationModalBody',
                position: 'left',
                action: () => window.handleOpenInterpolationPanel?.(),
                postAction: () => window.handleCloseInterpolationPanel?.(),
                delay: 300,
            },
            {
                id: 'cross-section-btn',
                target: '[onclick*="handleOpenCrossSectionPanel"]',
                title: 'tourCrossSectionBtn',
                body: 'tourCrossSectionBtnBody',
                position: 'left',
                action: () => {
                    window.handleOpenInterpolationPanel?.();
                    // Espera o modal abrir
                    setTimeout(() => {
                        const btn = document.querySelector('[onclick*="handleOpenCrossSectionPanel"]');
                        if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }, 100);
                },
                delay: 300,
            },
            {
                id: 'cross-section-panel',
                target: '#cross-section-panel',
                title: 'tourCrossSectionPanel',
                body: 'tourCrossSectionPanelBody',
                position: 'right',
                action: () => {
                    // Gera modelo aleatório se não houver elementos
                    const hasElements = window.getAllElements?.().length > 0;
                    if (!hasElements) {
                        (window as any).generateRandomModel?.();
                        setTimeout(() => {
                            if (window.handleFamilySelectConfirm) window.handleFamilySelectConfirm();
                        }, 500);
                    }
                    setTimeout(() => window.handleOpenCrossSectionPanel?.(), 1000);
                },
                postAction: () => window.handleCloseCrossSectionPanel?.(),
                delay: 500,
            },
            {
                id: 'sao-btn',
                target: '[onclick*="handleOpenSAOMatrixPanel"]',
                title: 'tourSAOBtn',
                body: 'tourSAOBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('optimize'),
                delay: 200,
            },
            {
                id: 'modules-complete',
                target: '#menubar',
                title: 'tourModulesComplete',
                body: 'tourModulesCompleteBody',
                position: 'bottom',
            },
        ],
    },
    advanced: {
        id: 'advanced',
        titleKey: 'tourChapterAdvanced',
        descKey: 'tourChapterAdvancedDesc',
        icon: 'shield',
        color: '#f59e0b',
        steps: [
            {
                id: 'export-btn',
                target: '[onclick*="openExportModal"]',
                title: 'tourExportBtn',
                body: 'tourExportBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('file'),
                delay: 200,
            },
            {
                id: 'ai-chat-btn',
                target: '#toggle-chat-panel-btn',
                title: 'tourAIChatBtn',
                body: 'tourAIChatBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('view'),
                delay: 200,
            },
            {
                id: 'ai-chat-panel',
                target: '#toggle-chat-panel-btn',
                title: 'tourAIChatPanel',
                body: 'tourAIChatPanelBody',
                position: 'left',
                action: () => window.toggleLLMChatPanel?.(),
                postAction: () => {
                    // Close chat panel if it was opened
                    const panel = document.getElementById('llm-chat-panel');
                    if (panel && panel.classList.contains('open')) {
                        window.toggleLLMChatPanel?.();
                    }
                },
                delay: 300,
            },
            {
                id: 'libraries-ribbon',
                target: '#tg-libs',
                title: 'tourLibrariesRibbon',
                body: 'tourLibrariesRibbonBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('libraries'),
                delay: 200,
            },
            {
                id: 'ticker-btn',
                target: '[onclick*="handleToggleTicker"]',
                title: 'tourTickerBtn',
                body: 'tourTickerBtnBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('view'),
                delay: 200,
            },
            {
                id: 'help-ribbon',
                target: '#tg-more',
                title: 'tourHelpRibbon',
                body: 'tourHelpRibbonBody',
                position: 'bottom',
                action: () => window.switchRibbonTab?.('help'),
                delay: 200,
            },
            {
                id: 'advanced-complete',
                target: '#canvas-container',
                title: 'tourAdvancedComplete',
                body: 'tourAdvancedCompleteBody',
                position: 'bottom',
            },
        ],
    },
};
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * Get steps for a specific chapter.
 * @param {string} chapterId
 * @returns {Array<Object>}
 */
export function getChapterSteps(chapterId: string) {
    const chapter = (TOUR_CHAPTERS as Record<string, any>)[chapterId];
    return chapter ? chapter.steps : [];
}
//# sourceMappingURL=steps.js.map
