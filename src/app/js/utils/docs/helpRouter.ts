// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

const DEFAULT_DOCS_SECTION = 'overview';

export const HANDLER_DOCS_HELP_SECTIONS = Object.freeze([
    'overview',
    'interface',
    'elements',
    'campaigns',
    'observations',
    'scenes',
    'scene-3d',
    'labels-3d',
    'analytics',
    'filter-radar',
    'scenario-simulation',
    'calculator',
    'import-export',
    'files-module',
    'interpolation',
    'voxel',
    'neural-networks',
    'aerial-georef',
    'eis',
    'sao-matrices',
    'validation',
    'validation-profiles',
    'constants',
    'workflows',
    'spatial',
    'ingestion',
    'data-entry-matrix',
    'sequencer',
    'pipelines',
    'well-geology',
    'issues',
    'audit',
    'random-generator',
    'ai-assistant',
    'reports',
    'governance',
    'timekeeper',
    'sensors',
    'tours',
    'multi-model-tabs',
    'taxonomy',
    'raster-upload',
    'photolog',
    'diagrams',
    'impact-estimator',
    'cost-analysis',
    'purpose',
    'automation',
    'radar',
    'datastudio',
    'customize',
    'libraries-marketplace',
    'esg-framework',
    'authentication',
    'data-model',
    'inspector',
    'simulation',
    'ai-agents',
    'document-assessment',
    'chemistry',
    'field-metadata',
    'merge-diff',
    'notifications',
    'notification-rules',
    'wallet',
    'history-recovery',
    'imagery',
    'organization-management',
    'ownership-access',
    'presets',
    'health-export',
    'accessibility',
    'background-analysis',
    'decision-rules',
    'dama-quality',
    'ecbt-validator',
    'ledger-summary',
    'parameter-groups',
    'sao-heatmap',
    'sdg-alignment',
    'spatial-clustering',
    'optimization',
]);

const TAB_DOCS_SECTION = Object.freeze({
    elements: 'elements',
    campaigns: 'campaigns',
    observations: 'observations',
    scenes: 'scenes',
    stamps: 'stamps-edges',
    edges: 'stamps-edges',
    analytics: 'analytics',
    interpolation: 'interpolation',
    report: 'reports',
    reports: 'reports',
    storyboard: 'sequencer',
    governance: 'governance',
    timekeeper: 'timekeeper',
    files: 'files-module',
    sensors: 'sensors',
    eis: 'eis',
    inspector: 'inspector',
    simulation: 'simulation',
    agents: 'ai-agents',
    assessment: 'document-assessment',
    chemistry: 'chemistry',
    notifications: 'notifications',
    wallet: 'wallet',
    history: 'history-recovery',
    imagery: 'imagery',
    org: 'organization-management',
    ownership: 'ownership-access',
    presets: 'presets',
    accessibility: 'accessibility',
});

const PANEL_DOCS_SECTION = Object.freeze({
    families: 'interface',
    properties: 'interface',
    'left-panel': 'interface',
    'right-panel': 'interface',
    'constellation-hud': 'interface',
    'viz-settings-bar': 'scene-3d',
    'llm-chat-panel': 'ai-assistant',
    inspector: 'inspector',
    'inspector-panel': 'inspector',
    'simulation-panel': 'simulation',
    notifications: 'notifications',
    wallet: 'wallet',
    history: 'history-recovery',
    imagery: 'imagery',
});

const DOCS_SECTION_SELECTOR_RULES = Object.freeze([
    ['#inspector-panel, .inspector-panel, .inspector-card, .inspector-context-menu', 'inspector'],
    ['#simulation-panel-modal, .simulation-lab, .simulation-modal, [data-docs-section="simulation"]', 'simulation'],
    ['#agents-panel, .agents-panel, .agent-card, [data-tab="agents"]', 'ai-agents'],
    ['#document-assessment-panel, .document-assessment-panel, .assessment-panel', 'document-assessment'],
    ['#chemistry-panel, .chemistry-panel, .cas-registry, .chemistry-registry', 'chemistry'],
    ['#field-meta-popover, .field-meta-popover, .field-meta-wrapper, [data-field-meta]', 'field-metadata'],
    ['#merge-panel, .merge-panel, .diff-panel', 'merge-diff'],
    ['#notification-center, .notification-center, .notification-panel', 'notifications'],
    ['#notification-rules-panel, .notification-rules-panel', 'notification-rules'],
    ['#wallet-panel, .wallet-panel, .credits-panel, .credits-badge', 'wallet'],
    ['#history-panel, .history-panel, .recovery-panel', 'history-recovery'],
    ['#imagery-panel, .imagery-panel, .imagery-layer-panel', 'imagery'],
    ['#organization-panel, #org-panel, .organization-panel, .org-panel', 'organization-management'],
    ['#ownership-panel, .ownership-panel, .access-control-panel', 'ownership-access'],
    ['#presets-panel, .presets-panel, .preset-card', 'presets'],
    ['#health-export-panel, .health-export-panel', 'health-export'],
    ['#accessibility-panel, .accessibility-panel, .a11y-panel', 'accessibility'],
    ['#background-analysis-panel, .background-analysis-panel', 'background-analysis'],
    ['#decision-rules-panel, .decision-rules-panel', 'decision-rules'],
    ['#dama-quality-panel, .dama-quality-panel', 'dama-quality'],
    ['#ecbt-validator-panel, .ecbt-validator-panel', 'ecbt-validator'],
    ['#ledger-summary-panel, .ledger-summary-panel', 'ledger-summary'],
    ['#parameter-groups-panel, .parameter-groups-panel', 'parameter-groups'],
    ['#sao-heatmap-panel, .sao-heatmap-panel', 'sao-heatmap'],
    ['#sdg-alignment-panel, .sdg-alignment-panel', 'sdg-alignment'],
    ['#spatial-clustering-panel, .spatial-clustering-panel', 'spatial-clustering'],
    ['#optimization-panel, .optimization-panel', 'optimization'],
    ['#tab-elements, .element-card, .family-item, #families-list, [data-tab="elements"]', 'elements'],
    ['#tab-campaigns, .campaign-card, [data-tab="campaigns"]', 'campaigns'],
    ['#tab-observations, .observation-card, [data-tab="observations"]', 'observations'],
    ['#tab-scenes, .scene-card, [data-tab="scenes"]', 'scenes'],
    ['#tab-stamps, #stamp-panel, .stamp-panel, .edge-editor, [data-tab="stamps"], [data-tab="edges"]', 'stamps-edges'],
    ['#analytics-workspace, .analytics-workspace, [data-tab="analytics"]', 'analytics'],
    ['#interpolation-panel, .interpolation-panel, [data-tab="interpolation"]', 'interpolation'],
    ['#scenario-simulation-modal, .scenario-simulation', 'scenario-simulation'],
    ['#calculator-panel, .calculator-panel', 'calculator'],
    ['#import-modal, #export-modal, .export-modal, .import-modal', 'import-export'],
    ['#data-studio-root, .data-studio, .data-studio-shell', 'datastudio'],
    ['#data-entry-matrix-modal, .data-entry-matrix', 'data-entry-matrix'],
    ['#eis-dashboard-modal, .eis-dashboard, .eis-card', 'eis'],
    ['#report-editor-modal, .report-editor, .report-shell', 'reports'],
    ['#governance-panel, .governance-panel', 'governance'],
    ['#timekeeper-panel, .timekeeper-panel, .timesheet-modal', 'timekeeper'],
    ['#sensor-center-panel, .sensor-center-panel', 'sensors'],
    ['#tour-picker, .tour-picker, .tour-controller', 'tours'],
    ['#ai-assistant, #llm-chat-panel, .llm-chat-panel, .ai-assistant', 'ai-assistant'],
    ['#map-picker, .map-picker', 'map-picker'],
    ['#files-panel, .files-panel, .file-manager', 'files-module'],
    ['#photo-log-modal, .photo-log-modal, .photo-gallery', 'photolog'],
    ['#raster-upload-modal, .raster-upload-modal', 'raster-upload'],
    ['#symbology-modal, .symbology-modal', 'symbology-profiles'],
    ['#validation-profile-modal, .validation-profile-modal', 'validation-profiles'],
    ['#constants-modal, .constants-modal', 'constants'],
    ['#pipeline-editor, .pipeline-editor', 'pipelines'],
    ['#issues-panel, .issues-panel', 'issues'],
    ['#command-palette, .command-palette', 'shortcuts'],
    ['#library-marketplace, .library-marketplace, .marketplace-panel', 'libraries-marketplace'],
]);

const MODAL_DOCS_SECTION = Object.freeze({
    'eis-dashboard-modal': 'eis',
    'report-editor-modal': 'reports',
    'scenario-simulation-modal': 'scenario-simulation',
    'simulation-panel-modal': 'simulation',
    'data-entry-matrix-modal': 'data-entry-matrix',
    'document-assessment-panel': 'document-assessment',
    'chemistry-panel': 'chemistry',
    'merge-panel': 'merge-diff',
    'wallet-panel': 'wallet',
    'history-panel': 'history-recovery',
    'imagery-panel': 'imagery',
    'organization-panel': 'organization-management',
    'ownership-panel': 'ownership-access',
    'presets-panel': 'presets',
    'health-export-panel': 'health-export',
    'optimization-panel': 'optimization',
});

function docsBaseUrl(): string {
    if (typeof window === 'undefined') return '/docs';
    try {
        return `${window.location.origin}/docs`;
    } catch (e: any) {
        console.debug('[helpRouter] docsBaseUrl:', e?.message || e);
        return '/docs';
    }
}

function normalizeSection(sectionId: any): string {
    return (
        String(sectionId || DEFAULT_DOCS_SECTION)
            .replace(/^#/, '')
            .trim() || DEFAULT_DOCS_SECTION
    );
}

function appViewSection(): string {
    if (typeof document === 'undefined') return DEFAULT_DOCS_SECTION;
    const app = document.getElementById('app') || document.body;
    if (app?.classList?.contains('view-group-model')) return 'scene-3d';
    if (app?.classList?.contains('view-group-datastudio')) return 'data-entry-matrix';
    if (app?.classList?.contains('view-group-actions')) return 'overview';
    return DEFAULT_DOCS_SECTION;
}

export function getDocsHelpLabel(): string {
    return 'Como Usar?';
}

export function getDocsHelpUrl(sectionId: string = DEFAULT_DOCS_SECTION): string {
    return `${docsBaseUrl()}#${encodeURIComponent(normalizeSection(sectionId))}`;
}

export function openDocsHelp(sectionId: string = DEFAULT_DOCS_SECTION): string {
    const url = getDocsHelpUrl(sectionId);
    if (typeof window === 'undefined') return url;
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) {
        window.location.href = url;
    }
    return url;
}

export function getDocsSectionForPanelContext(ctx: any = {}): string {
    const tabMap: Record<string, string> = TAB_DOCS_SECTION;
    const modalMap: Record<string, string> = MODAL_DOCS_SECTION;
    const panelMap: Record<string, string> = PANEL_DOCS_SECTION;
    if (ctx.tabId && tabMap[ctx.tabId]) return tabMap[ctx.tabId] as string;
    if (
        ctx.type === 'constellation' ||
        ctx.type === 'constellation-collapsed' ||
        ctx.type === 'constellation-floating'
    ) {
        return 'interface';
    }
    if (ctx.type === 'viz-settings') return 'scene-3d';
    if (ctx.type === 'chat') return 'ai-assistant';
    if (ctx.type === 'modal') return modalMap[ctx.id] || 'interface';
    return panelMap[ctx.panelId] || panelMap[ctx.id] || appViewSection();
}

function resolveTargetElement(target: unknown): Element | null {
    if (!target) return null;
    const elementNode = typeof Node !== 'undefined' ? Node.ELEMENT_NODE : 1;
    const el = (target as Element).nodeType === elementNode ? (target as Element) : (target as { parentElement?: Element | null }).parentElement;
    return el ?? null;
}

function matchSectionBySelectorRules(el: Element): string | null {
    for (const [selector, sectionId] of DOCS_SECTION_SELECTOR_RULES as ReadonlyArray<string[]>) {
        try {
            if (el.closest(selector as string)) return sectionId as string;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            console.debug('[helpRouter] selectorClosest:', msg);
            /* Ignore malformed selectors in older browsers. */
        }
    }
    return null;
}

function matchSectionByStaticSelectors(el: Element): string | null {
    if (el.closest('#canvas-container, #viewport, canvas, .scene-canvas, .webgl-canvas')) return 'scene-3d';
    if (el.closest('#constellation-hud, .constellation-panel, .constellation-graph')) return 'interface';
    if (el.closest('#left-panel, #right-panel, .dock-panel, .panel-floating')) return 'interface';
    if (el.closest('#data-studio-root, .data-studio, [data-docs-section="data-entry-matrix"]'))
        return 'data-entry-matrix';
    if (el.closest('#eis-dashboard-modal, [data-docs-section="eis"]')) return 'eis';
    if (el.closest('#report-editor-modal, .report-editor, [data-docs-section="reports"]')) return 'reports';
    return null;
}

export function detectDocsSectionFromElement(target: unknown): string {
    if (typeof document === 'undefined') return DEFAULT_DOCS_SECTION;
    const el = resolveTargetElement(target);
    if (!el) return appViewSection();

    return (
        matchSectionBySelectorRules(el) ??
        matchSectionByStaticSelectors(el) ??
        appViewSection()
    );
}
