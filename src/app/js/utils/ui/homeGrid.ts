// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   HOME GRID — Action-first launchpad
   Grid de acoes da pagina inicial

   Cards sao estaticos (renderizados uma vez em initHomeGrid).
   Stats e acao sugerida sao dinamicos (atualizados via renderHomeGrid).
   ================================================================ */

import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { CONFIG } from '../../config.js';
import { clearModelData, setEphemeral } from '../storage/storageMonitor.js';

import { getAllElements, getSelectedElement } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { applyModel } from '../../core/io/import.js';

import { getHomeCardsConfig } from '../customize/manager.js';
import { getModelIdSync } from '../../core/io/modelLink.js';
import { getCurrentUser } from '../auth/session.js';
import {
    loadModelsFromCloud,
    loadModelFromCloud,
    getSharedModels,
    loadAutosaveLanes,
    listAutosaveSnapshots,
    loadAutosaveSnapshot,
    getActiveLane,
    setActiveLane,
} from '../cloud/manager.js';
import { showToast } from './toast.js';
import { getAllReports } from '../report/manager.js';
import { getConnectedEdges } from '../edges/manager.js';
import { getActiveConstellationTab } from '../scene/constellationTable.js';
// External/sibling deps (NÃO são sub-modules de ./homeGrid/ — ficam diretos)
import {
    fetchCreatorProfile,
    getUserBadges,
    fetchActivityFeed,
    getMyPublishedLibraries,
    // eslint-disable-next-line
    fetchCommunityImpact,
} from '../libraries/supabaseMarketplace.js';
import {
    getReputationLevelMeta as _getReputationLevelMeta,
    getNextLevelMeta as _getNextLevelMeta,
    getCredentialLabelMeta as _getCredentialLabelMeta,
} from './_homeReputationPure.js';
import { groupCardsByCategory as _groupCardsByCategory } from './_homeCardsPure.js';

// ARCH-SPLIT-HOMEGRID-001 (fan-out desaturation): TODOS os 44 sub-modules de
// ./homeGrid/* são consumidos por UM único import do barrel ./homeGrid/index.js,
// em vez de 44 imports diretos. Isso dessatura o sinal maint.fan-out (66→23
// imports, abaixo do max 30) e destrava o code-score de ui/home-kpis. Os
// símbolos, aliases e types são preservados EXATAMENTE (comportamento idêntico;
// o barrel só re-exporta, side-effects de cada sub-module preservados).
// Notas de origem (referência histórica dos sub-modules consolidados):
// - homeConstellationHost / homeRelationsPanel: hosting + painel de relações (BUG-1).
// - homeLayoutController: orquestrador zoning+density+resize (3COL_V3 P1-8).
// - *Pure: decisões PURAS (cards/navigator/capability/feature-flags/shell layout/
//   slot registry/labels) extraídas do monolito. Behaviour-neutral.
import {
    initConstellationHost,
    resetConstellationHostTelemetry,
    restoreHostedConstellation as _restoreHostedConstellation,
    scheduleConstellationLayoutSync as _scheduleConstellationLayoutSync,
    renderActionsRelationsPanel as _renderActionsRelationsPanel,
    initMarketplace,
    renderMarketplace,
    // eslint-disable-next-line
    destroyMarketplace,
    initIdentity,
    renderIdentity,
    // eslint-disable-next-line
    destroyIdentity,
    initEisDashboard,
    renderEisDashboard,
    initQuickAccess,
    renderQuickAccess,
    buildHomeGridDynamicHash,
    buildHomeShellContextSignature,
    buildNavigatorTreeSignature,
    runHomeGridPhase,
    bootHomeLayout,
    computeCompleteness as _computeCompletenessHelper,
    buildStatCards as _buildStatCards,
    SHELL_SCAFFOLD_SPEC as _SHELL_SCAFFOLD_SPEC,
    buildHomeCardElement as _buildHomeCardElement,
    renderHomeCardSections as _renderHomeCardSections,
    renderHomeHeader as _renderHomeHeader,
    renderHomeSuggested,
    resolveSuggestedAction as _resolveSuggestedAction,
    renderHomeBootState as _renderHomeBootState,
    renderCommunityImpact as _renderCommunityImpactModule,
    renderReputation as _renderReputationModule,
    renderPersonalIdentity as _renderPersonalIdentityModule,
    renderMarketplaceActivity as _renderMarketplaceActivityModule,
    renderPremiumPanels,
    decideDataFreshness,
    buildNavigatorPoints,
    buildLoadedModelNavigatorNodes,
    renderEmbeddedInspector as _renderEmbeddedInspectorModule,
    renderSidebarFooter as _renderSidebarFooterModule,
    renderWorkspaceSection as _renderWorkspaceSectionModule,
    renderActionsSidePanel as _renderActionsSidePanelModule,
    renderGroupedSidebar as _renderGroupedSidebarModule,
    renderTree as _renderTreeModule,
    renderContextPanel as _renderContextPanelModule,
    renderContextualMain as _renderContextualMainModule,
    renderBreadcrumb as _renderBreadcrumbModule,
    resolveCardList as _resolveCardList,
    filterNavigatorNodes as _filterNavigatorNodesPure,
    resolveNavigatorPathLabels as _resolveNavigatorPathLabelsPure,
    getActionsForType as _getActionsForTypePure,
    formatLastSaveLabel as _formatLastSaveLabel,
    resolveCapability as _resolveCapabilityPure,
    mergeActionsFeatureFlags as _mergeActionsFeatureFlags,
    buildLastObjectContext as _buildLastObjectContext,
    coerceLastObjectContext as _coerceLastObjectContext,
    createActionsShellLayoutController,
    resolveShellLayout as _pureResolveShellLayout,
    serializeShellState as _pureSerializeShellState,
    type ShellLayoutMode,
    createSlotRegistry as _createSlotRegistry,
    registerCanonicalSlots as _registerCanonicalSlots,
    activateSlot as _activateSlot,
    getActiveSlot as _getActiveSlot,
    type SlotRegistryState as _SlotRegistryState,
    getObjectTypeLabel as _getObjectTypeLabelPure,
    originToLabel as _originToLabelPure,
    toNavigatorIdSegment as _toNavigatorIdSegmentPure,
    formatWorkspaceDate as _formatWorkspaceDatePure,
    formatNavigatorResultLabel as _formatNavigatorResultLabelPure,
    resolveNavigatorParameterLabel as _resolveNavigatorParameterLabelPure,
    collectActionsProbeLocalStorage as _collectActionsProbeLocalStorage,
    captureActionsProbeMetrics as _captureActionsProbeMetricsPure,
    waitForActionsProbeLayoutSettle as _waitForActionsProbeLayoutSettle,
    type WorkspaceSectionContext as _WorkspaceSectionContext,
    getOrganizationScopeOption as _getOrganizationScopeOptionWs,
    getScopeOptions as _getScopeOptionsWs,
    getWorkspaceSourceLabel as _getWorkspaceSourceLabelWs,
    getWorkspaceScopeLabel as _getWorkspaceScopeLabelWs,
    getWorkspaceSelectionLabel as _getWorkspaceSelectionLabelWs,
    getLocalWorkspaceEntries as _getLocalWorkspaceEntriesWs,
    getWorkspaceItemsForActiveSource as _getWorkspaceItemsForActiveSourceWs,
    getActiveLaneSnapshots as _getActiveLaneSnapshotsWs,
    getWorkspaceEmptyMessage as _getWorkspaceEmptyMessageWs,
    buildWorkspaceModelListHtml as _buildWorkspaceModelListHtmlWs,
    buildWorkspaceSnapshotListHtml as _buildWorkspaceSnapshotListHtmlWs,
    type EmbeddedInspectorContext as _EmbeddedInspectorContext,
    getEmbeddedInspectorSelection as _getEmbeddedInspectorSelectionImpl,
    renderInspectorFamilyChips as _renderInspectorFamilyChipsImpl,
    openActionsSelectionInModel as _openActionsSelectionInModelImpl,
    renderHomeStats as _renderHomeStatsModule,
    renderHomeEmptyState as _renderHomeEmptyStateModule,
    renderFlowStatusSection as _renderFlowStatusSectionModule,
    hasGeneratedReportContent as _hasGeneratedReportContent,
} from './homeGrid/index.js';

// --- State ---
// DOM element holders — tipados como HTMLElement | null (derivados de
// getElementById/createElement/querySelector). REFACTOR-TIPAGEM: substitui any
// por tipo DOM correto sem mudar comportamento (os usos já assumem HTMLElement).
let _homeEl: HTMLElement | null = null;
let _headerEl: HTMLElement | null = null;
let _bootStateEl: HTMLElement | null = null;
let _statsEl: HTMLElement | null = null;
let _suggestedEl: HTMLElement | null = null;
let _flowStatusEl: HTMLElement | null = null;
let _eisEl: HTMLElement | null = null;
let _purposeEl: HTMLElement | null = null;
let _reputationEl: HTMLElement | null = null;
let _marketplaceEl: HTMLElement | null = null;
let _personalIdentityEl: HTMLElement | null = null;
let _impactEl: HTMLElement | null = null;
let _quickAccessEl: HTMLElement | null = null;
let _gridEl: HTMLElement | null = null;
let _shellRootEl: HTMLElement | null = null;
let _shellLeftEl: HTMLElement | null = null;
let _shellMainEl: HTMLElement | null = null;
let _shellRightEl: HTMLElement | null = null;
let _shellLeftSplitterEl: HTMLElement | null = null;
let _shellRightSplitterEl: HTMLElement | null = null;
let _breadcrumbEl: HTMLElement | null = null;
let _mainTabsEl: HTMLElement | null = null;
let _contextToolbarEl: HTMLElement | null = null;
let _contextSurfaceEl: HTMLElement | null = null;
let _viewToggleEl: HTMLElement | null = null;
let _railEl: HTMLElement | null = null;
let _treeEl: HTMLElement | null = null;
let _sidePanelEl: HTMLElement | null = null;
let _inspectorPanelEl: HTMLElement | null = null;
let _relatedEl: HTMLElement | null = null;
let _metaEl: HTMLElement | null = null;
let _graphPanelEl: HTMLElement | null = null;
let _aiPanelEl: HTMLElement | null = null;
let _workspaceSectionEl: HTMLElement | null = null;
let _workspaceFooterEl: HTMLElement | null = null;
let _initialized = false;
let _active = true;
// SPEC_HOME_REDESIGN_3COL_V3 — cleanup do bootHomeLayout (zoning+density+resize)
let _3colLayoutCleanup: (() => void) | null = null;
let _bootPreparingRandom = false;
let _lastCardHash = '';
/** @type {any} */
let _activeDomain: any = null;
let _treeFilter = '';
let _lastTreeNodesSignature = '', _lastTreeNodes: any[] = [];
/** @type {any} */
let _activeObjectId: any = null;
/** @type {any} */
let _activeObjectType: any = null;
let _activeScopeKind = 'personal';
/** @type {any} */
let _activeOrgId: any = null;
let _activeModelSource = 'local';
// UI-MINIMALISM-001 F3: Scope/Source ficam colapsados por padrão (progressive
// disclosure) — drena WL-2/WL-4/WL-5 do Workspace Loader. Revelados via "Trocar fonte".
let _workspaceSourceExpanded = false;
// UI-MINIMALISM-001 F3/WL-1: o loader inteiro (Models + fontes) colapsa num bar de
// 1 linha por padrão — o inspetor domina o painel (separa os 3 concerns). Calvin
// 2026-06-15 escolheu "colapsar o loader". Expande sob demanda via 'Trocar workspace'.
let _workspaceLoaderExpanded = false;
/** @type {any} */
let _activeModelId: any = null;
/** @type {any} */
let _activeModelLabel: any = null;
/** @type {any} */
let _activeLaneId: any = null;
/** @type {any} */
let _activeSnapshotId: any = null;
let _activeViewMode = '3d';
let _workspaceFooterExpanded = false;
let _actionsSideView = 'inspector';
let _featureFlags: Record<string, boolean> = {};
let _emptyStateEl: HTMLElement | null = null;
// ARCH-SPLIT-HOMEGRID-001 S6 — Actions Shell layout/telemetry state now lives
// inside the extracted controller (homeGrid/homeActionsShellLayout.ts).
let _lastShellContextSignature = '';
// ARCH-SPLIT-HOMEGRID-001 S7 — shell slot-hosting state (PURE registry). Seeded
// with the 4 canonical slots; the runtime records WHICH slot owns the right
// column (context relations panel by default, constellation when hosted) so the
// "which is active" decision lives in data, not scattered DOM checks. Default
// active = 'context' (the relations panel is the right column's default tenant).
let _slotRegistry: _SlotRegistryState = _activateSlot(_registerCanonicalSlots(_createSlotRegistry()), 'context');

// --- Data Cache ---
/** @type {any} */
let _marketplaceCache: any = null;
let _lastDataFetch = 0;
/** @type {any} */
let _marketplaceCacheUserId: any = null;
/** @type {any} */
let _marketplaceInFlight: any = null;
/** @type {any} */
let _communityImpactCache: any = null;
let _communityImpactFetchedAt = 0;
const DATA_CACHE_TTL = 60000; // 1 minute
const LS_LAST_OBJECT_CONTEXT = 'ecbyts-actions-last-object-context';
const LS_FEATURE_FLAGS = 'ecbyts-actions-v2-flags';
const WORKSPACE_CACHE_TTL = 30000;
// LS_ACTIONS_LAYOUT + ACTIONS_SHELL_LAYOUT pure math now live with the extracted
// Actions Shell layout controller (homeGrid/homeActionsShellLayout.ts).
const WORKSPACE_SOURCE_DEFS = Object.freeze([
    { id: 'saved', label: 'Saved' },
    { id: 'shared', label: 'Shared' },
    { id: 'autosave', label: 'Autosave' },
    { id: 'local', label: 'Local' },
]);

const _workspaceCache: any = {
    userId: null,
    saved: [],
    shared: [],
    autosaveLanes: [],
    autosaveSnapshotsByLane: {},
    loading: {
        saved: false,
        shared: false,
        autosave: false,
    },
    loadedAt: {
        saved: 0,
        shared: 0,
        autosave: 0,
    },
    errors: {
        saved: null,
        shared: null,
        autosave: null,
    },
};

// ARCH-MONO-001 Phase 10a: data catalog → ./homeGridData.js
import { ACTION_CARDS } from './homeGridData.js';
// V2 G3: data model formal de SuggestedAction — validateSuggestedAction/resolveActionIcon
// foram extraídos p/ homeGrid/homeSuggested.js (ARCH-SPLIT-HOMEGRID-001 S5); este barrel
// não os consome mais diretamente, então o import dangling foi removido.
// V3 Phase 1: hero KPIs do Launchpad (consumer do Calculator)
import { ensureHeroContainer, renderHero } from './launchpad/hero.js';
// V3 Phase 2: feed + painéis
import { ensureFeedContainer, renderFeed } from './launchpad/feed.js';
import { ensurePanelsContainer, renderPanels } from './launchpad/panels.js';

/** @type {readonly any[]} */
const DOMAIN_DEFS = Object.freeze([
    { id: 'monitoring', label: 'Monitoramento', icon: 'activity' },
    { id: 'marketplace', label: 'Marketplace', icon: 'shopping-bag' },
    { id: 'automation', label: 'Automacao', icon: 'cpu' },
    { id: 'projects', label: 'Projetos', icon: 'clipboard-list' },
    { id: 'security', label: 'Chaves/Seguranca', icon: 'key' },
    { id: 'compliance', label: 'EIS/Compliance', icon: 'shield-check' },
    { id: 'export', label: 'Exportacao', icon: 'download' },
    { id: 'compare', label: 'Comparar Modelos', icon: 'git-compare' },
    { id: 'spatial', label: 'Spatial', icon: 'map' },
]);

/** @type {Record<string, any>} */
const CARD_DOMAIN_MAP = Object.freeze({
    'spatial-view': 'spatial',
    'analyze-monitoring': 'monitoring',
    'compare-models': 'compare',
    'export-data': 'export',
    automate: 'automation',
    'simulation-lab': 'monitoring',
    'training-lms': 'monitoring',
    'project-mgmt': 'projects',
    marketplace: 'marketplace',
    'eis-assessment': 'compliance',
    community: 'projects',
    'radar-status': 'projects',
    customize: 'projects',
    'generate-key': 'security',
    'ai-assistant': 'monitoring',
});

/** @type {Record<string, string>} */
const FEATURE_KEYS = Object.freeze({
    SHELL: 'FEATURE_ACTIONS_V2_SHELL',
    Z4_CONTEXT: 'FEATURE_ACTIONS_V2_Z4_CONTEXT',
    GRAPH: 'FEATURE_ACTIONS_V2_GRAPH',
    AI_PANEL: 'FEATURE_ACTIONS_V2_AI_PANEL',
});

/** @type {Record<string, boolean>} */
const DEFAULT_ACTIONS_FLAGS = Object.freeze({
    [FEATURE_KEYS.SHELL]: true,
    [FEATURE_KEYS.Z4_CONTEXT]: true,
    [FEATURE_KEYS.GRAPH]: true,
    [FEATURE_KEYS.AI_PANEL]: true,
});

/** @type {any} */
let _reputationCache: any = null;
let _reputationFetchedAt = 0;
/** @type {any} */
let _reputationCacheUserId: any = null;
/** @type {any} */
let _reputationInFlight: any = null;

// ARCH-SPLIT-HOMEGRID-001 S6 — Actions Shell layout controller instance.
// Accessors read the live barrel DOM refs (reassigned on shell rebuild); the
// controller owns its own layout/drag/telemetry closure state. The barrel
// delegates to this for splitter resize, keyboard nudge, breakpoint refresh,
// persistence, ARIA wiring, and the actions-group telemetry session.
const _actionsShellLayout = createActionsShellLayoutController({
    getShellRoot: () => _shellRootEl,
    getLeftSplitter: () => _shellLeftSplitterEl,
    getRightSplitter: () => _shellRightSplitterEl,
    getRightShell: () => _shellRightEl,
    isActive: () => _active,
    scheduleConstellationLayoutSync: (forceRebuild?: boolean) => _scheduleConstellationLayoutSync(forceRebuild),
    restoreHostedConstellation: () => _restoreHostedConstellation(),
    resetConstellationHostTelemetry: () => resetConstellationHostTelemetry(),
    renderActionsRelationsPanel: (container: HTMLElement | null) => _renderActionsRelationsPanel(container),
}) as ReturnType<typeof createActionsShellLayoutController> & { bindLayout: () => void };

// ARCH-SPLIT-HOMEGRID-001 S7 — record which slot owns the right column, via the
// PURE registry (single source of truth). Behaviour-neutral: this only updates a
// tracking var (activateSlot is a no-op if the slot is unknown or already active);
// the actual DOM hosting is done by the caller. Keeping the active-slot decision
// in data lets tests/tooling reason about "who is active" without the DOM.
/**
 * @param {string} name canonical slot name (workspace|actions|context|constellation)
 */
function _setActiveShellSlot(name: string) {
    _slotRegistry = _activateSlot(_slotRegistry, name);
}

/**
 * Active right-column tenant per the pure slot registry: 'constellation' when the
 * 3D HUD is hosted in the right shell, otherwise 'context' (relations panel).
 * @returns {string|null}
 */
export function getActiveShellSlot() {
    return _getActiveSlot(_slotRegistry)?.name ?? null;
}

// --- Action Card Definitions (v1, hardcoded) ---
// Cards are grouped by category for visual hierarchy

// --- Public API ---

/**
 * Build home grid DOM and render static cards.
 * Constroi DOM da home e renderiza cards estaticos (uma unica vez).
 * Deve ser chamado APOS registerAllHandlers (precisa de hydrateIcons).
 */
export function initHomeGrid() {
    if (_initialized) return;

    _homeEl = document.getElementById('home-container');
    if (!_homeEl) return;

    _buildInteractionShell();
    initConstellationHost({
        getShellRight: () => _shellRightEl,
        isActive: () => _initialized && _active,
        getOpenedAt: () => _actionsShellLayout.getOpenedAt(),
        dispatchTelemetry: _actionsShellLayout.dispatchTelemetry,
    });
    _renderActionsRelationsPanel(_shellRightEl);
    _setActiveShellSlot('context'); // S7: relations panel is the right column's initial tenant
    _actionsShellLayout.bindGroupSync();

    // Flow status stepper (ACTIONS-FLOW-001 FS-4 — "onde estamos", topo da home).
    _flowStatusEl = document.createElement('div');
    _flowStatusEl.className = 'home-flow-status';
    _flowStatusEl.setAttribute('data-testid', 'home-flow-status');
    _shellMainEl!.appendChild(_flowStatusEl);

    // Header section (welcome + branding)
    _headerEl = document.createElement('div');
    _headerEl.className = 'home-header';
    _headerEl.setAttribute('data-testid', 'home-header');
    _shellMainEl!.appendChild(_headerEl);

    // Boot state (transient feedback during random-model startup)
    _bootStateEl = document.createElement('div');
    _bootStateEl.className = 'home-boot-state';
    _bootStateEl.setAttribute('data-testid', 'home-random-boot-state');
    _shellMainEl!.appendChild(_bootStateEl);

    // Stats bar (dynamically updated)
    _statsEl = document.createElement('div');
    _statsEl.className = 'home-stats';
    _statsEl.setAttribute('data-testid', 'home-stats');
    _shellMainEl!.appendChild(_statsEl);

    // V3 Phase 1: hero KPIs (Calculator-driven). Substitui stats legados
    // quando LAUNCHPAD_V3_HERO=true. Quando off, stats legados ficam
    // visíveis (rollback cirúrgico por flag).
    try {
        const heroEl = ensureHeroContainer(_shellMainEl);
        if (heroEl && _statsEl && _statsEl.parentNode === _shellMainEl) {
            _shellMainEl!.insertBefore(heroEl, _statsEl);
            // Esconde stats legados quando V3 hero ativo (evita duplicação
            // conceitual EIS/VPL/PDPLU/Conformidade vs Elements/Campaigns
            // /Completeness/LastSave).
            if (CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) {
                _statsEl.style.display = 'none';
            }
            renderHero().catch((_e: unknown) =>
                console.debug('[homeGrid:launchpad-hero]', (_e as { message?: string } | null)?.message || _e),
            );
        }
    } catch (e: unknown) {
        console.debug('[homeGrid:hero-init]', (e as { message?: string } | null)?.message || e);
    }

    // V3 Phase 2: feed "Situação atual" - após stats/hero, antes de
    // _suggestedEl. Feature-flagged (LAUNCHPAD_V3_FEED).
    try {
        const feedEl = ensureFeedContainer(_shellMainEl);
        if (feedEl) {
            renderFeed().catch((_e: unknown) =>
                console.debug('[homeGrid:launchpad-feed]', (_e as { message?: string } | null)?.message || _e),
            );
        }
    } catch (e: unknown) {
        console.debug('[homeGrid:feed-init]', (e as { message?: string } | null)?.message || e);
    }

    // V3 Phase 2: painéis Ferramentas + Comunidade - bottom do shell.
    // Feature-flagged (LAUNCHPAD_V3_PANELS).
    try {
        const panelsEl = ensurePanelsContainer(_shellMainEl);
        if (panelsEl) {
            renderPanels().catch((_e: unknown) =>
                console.debug('[homeGrid:launchpad-panels]', (_e as { message?: string } | null)?.message || _e),
            );
        }
    } catch (e: unknown) {
        console.debug('[homeGrid:panels-init]', (e as { message?: string } | null)?.message || e);
    }

    // Suggested action (dynamically updated)
    _suggestedEl = document.createElement('div');
    _suggestedEl.className = 'home-suggested';
    _suggestedEl.setAttribute('data-testid', 'home-suggested');
    _shellMainEl!.appendChild(_suggestedEl);

    // Community Impact section (aggregate stats - visible to all)
    _impactEl = document.createElement('div');
    _impactEl.className = 'home-impact';
    _impactEl.setAttribute('data-testid', 'home-impact');
    _shellMainEl!.appendChild(_impactEl);
    // V3: when panels flag is on, V3 Community panel replaces legacy
    // impact - hide to avoid conceptual duplication.
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_PANELS) {
        _impactEl.style.display = 'none';
    }

    // EIS Score section (model integrity)
    _eisEl = document.createElement('div');
    _eisEl.className = 'home-eis';
    _eisEl.setAttribute('data-testid', 'home-eis');
    _shellMainEl!.appendChild(_eisEl);
    // V3: when hero flag is on, V3 Hero KPI (EIS) replaces legacy
    // integrity card - hide to avoid duplicate display of the same metric.
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) {
        _eisEl.style.display = 'none';
    }

    // Purpose section (EIS impact tracking - Camada 3)
    _purposeEl = document.createElement('div');
    _purposeEl.className = 'home-purpose';
    _purposeEl.setAttribute('data-testid', 'home-purpose');
    _shellMainEl!.appendChild(_purposeEl);
    initEisDashboard(_eisEl, _purposeEl);

    // User reputation section
    _reputationEl = document.createElement('div');
    _reputationEl.className = 'home-reputation';
    _reputationEl.setAttribute('data-testid', 'home-reputation');
    _shellMainEl!.appendChild(_reputationEl);

    // Marketplace activity section
    _marketplaceEl = document.createElement('div');
    _marketplaceEl.className = 'home-marketplace';
    _marketplaceEl.setAttribute('data-testid', 'home-marketplace');
    _shellMainEl!.appendChild(_marketplaceEl);

    initMarketplace(_marketplaceEl, _impactEl);

    // Personal Identity card (dynamic - rendered in _updateDynamic)
    _personalIdentityEl = document.createElement('div');
    _personalIdentityEl.className = 'home-personal-identity';
    _personalIdentityEl.setAttribute('data-testid', 'home-personal-identity');
    _shellMainEl!.appendChild(_personalIdentityEl);

    initIdentity(_personalIdentityEl, _reputationEl);

    // Action cards grid (rendered once, static)
    _gridEl = document.createElement('div');
    _gridEl.className = 'home-grid';
    _gridEl.setAttribute('data-testid', 'home-grid');
    _shellMainEl!.appendChild(_gridEl);

    // Quick Access section (all features) - last in sequence
    _quickAccessEl = document.createElement('div');
    _quickAccessEl.className = 'home-quick-access';
    _quickAccessEl.setAttribute('data-testid', 'home-quick-access');
    _shellMainEl!.appendChild(_quickAccessEl);
    initQuickAccess(_quickAccessEl, {
        getElements: _safeGetElements,
        executeHandler: _executeHandler,
        t,
    });

    // Empty state for Home Redesign V2
    _emptyStateEl = document.createElement('div');
    _emptyStateEl.className = 'home-empty-state';
    _emptyStateEl.setAttribute('data-testid', 'home-empty-state');
    _shellMainEl!.appendChild(_emptyStateEl);

    // data-action delegation for empty state CTA buttons
    _emptyStateEl.addEventListener(
        'click',
        (e: Event) => {
            const target = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
            if (!target) return;
            const action = target.dataset.action || '';
            if (action === 'home:generate') {
                if (typeof window.handleHomeHeaderGenerate === 'function') window.handleHomeHeaderGenerate();
                // cast genuíno: global tipado de mesmo nome conflita c/ a chamada sem-args
                else if (typeof window.handleGenerateRandomModel === 'function') (window as any).handleGenerateRandomModel();
            } else if (action === 'home:import') {
                // IMPORT-UX-001 RF-1: abre modal rico (ingestion) primeiro
                if (typeof (window as any).handleOpenIngestionModal === 'function') (window as any).handleOpenIngestionModal();
                else if (typeof window.handleHomeHeaderImport === 'function') window.handleHomeHeaderImport();
                else if (typeof window.openImportModal === 'function') window.openImportModal();
            }
        },
    );

    // Cards are static - render once
    _renderCards();

    // data-action delegation for model empty overlay (outside home container)
    const modelOverlay = document.getElementById('model-empty-overlay');
    if (modelOverlay) {
        modelOverlay.addEventListener(
            'click',
            (e: Event) => {
                const target = (e.target as Element | null)?.closest<HTMLElement>('[data-action]');
                if (!target) return;
                const action = target.dataset.action || '';
                if (action === 'home:generate') {
                    if (typeof window.handleHomeHeaderGenerate === 'function') window.handleHomeHeaderGenerate();
                    // cast genuíno: global tipado de mesmo nome conflita c/ a chamada sem-args
                    else if (typeof window.handleGenerateRandomModel === 'function') (window as any).handleGenerateRandomModel();
                } else if (action === 'home:import') {
                    // IMPORT-UX-001 RF-1: abre modal rico (ingestion) primeiro
                    if (typeof (window as any).handleOpenIngestionModal === 'function') (window as any).handleOpenIngestionModal();
                    else if (typeof window.handleHomeHeaderImport === 'function') window.handleHomeHeaderImport();
                    else if (typeof window.openImportModal === 'function') window.openImportModal();
                }
            },
        );
    }

    window.addEventListener('selectionChanged', () => {
        if (_active && _initialized) {
            _renderEmbeddedInspector();
        }
    });
    window.addEventListener('context:changed', () => {
        if (_active && _initialized) {
            _renderEmbeddedInspector();
        }
    });
    _initialized = true;
    _installActionsProbe();

    // Initial stats + suggested
    _updateDynamic();
}

/**
 * Refresh stats + suggested action only (cards are static).
 * Chamado pelo ciclo de render da home.
 */
export function renderHomeGrid() {
    if (!_initialized || !_active) return;

    const cards = _getVisibleOrderedCards();
    const hash = cards.map((c: any) => c.id).join(',');
    if (hash !== _lastCardHash) {
        _renderCards();
    }

    const dynamicHash = buildHomeGridDynamicHash({ cardsHash: hash, modelId: getModelIdSync(), userId: getCurrentUser()?.id, bootState: _bootPreparingRandom ? 'boot' : 'idle', activeDomain: _activeDomain, activeObjectId: _activeObjectId, activeObjectType: _activeObjectType, activeScopeKind: _activeScopeKind, activeModelSource: _activeModelSource, activeModelId: _activeModelId, activeLaneId: _activeLaneId, activeSnapshotId: _activeSnapshotId, treeFilter: _treeFilter, elements: _safeGetElements(), campaigns: _safeGetCampaigns() });
    const _homeElHash = _homeEl as unknown as { __lastDynamicHash?: string };
    if (_homeElHash.__lastDynamicHash === dynamicHash) return;
    _homeElHash.__lastDynamicHash = dynamicHash;
    _updateDynamic();
}

/**
 * Get all ACTION_CARD definitions (for customizeModal).
 * @returns {Array<{id: string, i18nKey: string}>}
 */
export function getActionCardDefs() {
    return ACTION_CARDS.map((c: any) => ({ id: c.id, i18nKey: c.i18nKey }));
}

/**
 * Show home container (scroll to top).
 * Visibilidade do pane controlada pelo swipe track; aqui so gerencia estado.
 * @param {{ refreshTelemetry?: boolean }} [options]
 */
export function showHomeView( options: { refreshTelemetry?: boolean } = {}) {
    if (!_actionsShellLayout.isActionsGroupActive()) {
        _active = false;
        _actionsShellLayout.resetSessionTelemetry();
        _restoreHostedConstellation();
        _setActiveShellSlot('context'); // S7: constellation re-docked → context owns the right column
        _syncGridRows();
        return;
    }
    if (options.refreshTelemetry === true) {
        _actionsShellLayout.resetSessionTelemetry();
    }
    _active = true;
    _actionsShellLayout.dispatchOpenedTelemetry();
    const homeEl = document.getElementById('home-container');
    if (homeEl) homeEl.scrollTop = 0;
    _actionsShellLayout.refreshLayout();
    _renderActionsRelationsPanel(_shellRightEl);
    _setActiveShellSlot('context'); // S7: relations panel is the right column tenant
    _syncGridRows();
    // SPEC_HOME_REDESIGN_3COL_V3 P1-8 — boot orquestrador (idempotente: só ativa uma vez)
    if (!_3colLayoutCleanup) {
        try {
            const handle = bootHomeLayout();
            _3colLayoutCleanup = handle?.cleanup || null;
        } catch (e: unknown) {
            console.debug('[homeGrid:3col-boot]', (e as { message?: string } | null)?.message || e);
        }
    }
}

/**
 * Hide home - marca inativo.
 * Visibilidade do pane controlada pelo swipe track.
 */
export function hideHomeView() {
    _active = false;
    _actionsShellLayout.resetSessionTelemetry();
    _restoreHostedConstellation();
    _setActiveShellSlot('context'); // S7: constellation re-docked → context owns the right column
    _syncGridRows();
    // SPEC_HOME_REDESIGN_3COL_V3 P1-8 — cleanup 3col layout (resize listener etc.)
    if (_3colLayoutCleanup) {
        try {
            _3colLayoutCleanup();
        } catch (e: unknown) {
            console.debug('[homeGrid:3col-cleanup]', (e as { message?: string } | null)?.message || e);
        }
        _3colLayoutCleanup = null;
    }
}

/**
 * @returns {boolean}
 */
export function isHomeViewActive() {
    return _active;
}

/**
 * Toggle transient random-boot state on Home.
 * Exibe/oculta feedback "preparando modelo random".
 * @param {boolean} preparing
 */
export function setHomePreparingRandom( preparing: boolean) {
    _bootPreparingRandom = preparing === true;
    if (_initialized) _updateDynamic();
}

// ARCH-SPLIT-HOMEGRID-001 S6 (shellRoot) — public shell-layout API. DOM glue
// (root width/gap reads, applying via controller) stays here; the pure decision
// logic lives in homeGrid/_shellLayoutPure.ts. Behaviour-neutral additions.

/** Lê a largura atual do root do shell em px (DOM glue). */
function _readShellRootWidth(): number {
    if (!_shellRootEl) return 0;
    return Math.round(_shellRootEl.getBoundingClientRect?.().width || _shellRootEl.clientWidth || 0);
}

/** Lê o gap (px) entre as colunas do shell a partir do CSS computado (DOM glue). */
function _readShellGapWidth(): number {
    if (!_shellRootEl || typeof window === 'undefined') return 0;
    const styles = window.getComputedStyle(_shellRootEl);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || '0');
    return Number.isFinite(gap) ? gap : 0;
}

/**
 * Aplica um MODO de layout nomeado ao shell, resolvendo larguras via lógica
 * pura e delegando a aplicação/persistência ao controller. Modo inválido cai em
 * 'default' (fail-safe). No-op se o shell ainda não foi montado.
 * @param mode 'default' | 'wide' | 'compact'
 */
export function setShellLayout(mode: ShellLayoutMode | string) {
    const rootWidth = _readShellRootWidth();
    if (rootWidth <= 0) return;
    const widths = _pureResolveShellLayout(mode, rootWidth, _readShellGapWidth());
    _actionsShellLayout.applyLayout(widths, { persist: true });
}

/**
 * Retorna o estado atual de layout do shell {left,right} (em px) ou null se o
 * shell ainda não estabeleceu layout. Espelha o estado vivo do controller.
 */
export function getShellState(): { left: number; right: number } | null {
    const state = _actionsShellLayout.getLayoutState();
    return state ? { left: state.left, right: state.right } : null;
}

/**
 * Persiste o estado de layout atual do shell (re-aplica com persist=true via
 * controller, gravando no localStorage por breakpoint). No-op se não há estado.
 * @returns string JSON serializada do estado persistido (ou '{}' se vazio).
 */
export function persistShellState(): string {
    const state = _actionsShellLayout.getLayoutState();
    if (!state) return _pureSerializeShellState({});
    _actionsShellLayout.applyLayout(state, { persist: true, syncGraph: false });
    return _pureSerializeShellState({ [_currentShellBreakpoint()]: { left: state.left, right: state.right } });
}

/** Breakpoint atual ('wide' >=1440px, senão 'desktop') — espelha a math do pure actions-shell. */
function _currentShellBreakpoint(): string {
    const w = typeof window !== 'undefined' ? window.innerWidth || 0 : 0;
    return w >= 1440 ? 'wide' : 'desktop';
}

// --- Internal ---

// ARCH-SPLIT-HOMEGRID-001 S6 — the Actions Shell layout/resize/telemetry
// block (_bindActionsShellGroupSync .. _bindActionsShellLayout) was extracted
// to homeGrid/homeActionsShellLayout.ts. The barrel delegates via the
// _actionsShellLayout controller instance declared above. Behaviour-neutral.

function _updateDynamic() {
    runHomeGridPhase('shell-context', _renderShellContext);
    // V3 Phase 1: re-render hero KPIs (model changed → KPIs mudam)
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) {
        renderHero().catch((_e: unknown) => console.debug('[homeGrid:hero-refresh]', (_e as { message?: string } | null)?.message || _e));
    }
    // V3 Phase 2: re-render feed + painéis em cada dynamic update
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_FEED) {
        renderFeed().catch((_e: unknown) => console.debug('[homeGrid:feed-refresh]', (_e as { message?: string } | null)?.message || _e));
    }
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_PANELS) {
        renderPanels().catch((_e: unknown) =>
            console.debug('[homeGrid:panels-refresh]', (_e as { message?: string } | null)?.message || _e),
        );
    }
    if (CONFIG.FEATURES.HOME_REDESIGN_V2) {
        const hasModel = !!getModelIdSync();
        if (typeof window.setHomeHeaderHasModel === 'function') {
            window.setHomeHeaderHasModel(hasModel);
        }
        const showEmpty = !hasModel;
        if (_emptyStateEl) _emptyStateEl.style.display = showEmpty ? '' : 'none';

        // Model pane empty overlay (SPEC_HOME_REDESIGN_3COL §2 Must Have)
        const modelOverlay = document.getElementById('model-empty-overlay');
        if (modelOverlay) modelOverlay.style.display = showEmpty ? 'flex' : 'none';
        const mainEls = [
            _flowStatusEl,
            _headerEl,
            _bootStateEl,
            _statsEl,
            _suggestedEl,
            _impactEl,
            _eisEl,
            _purposeEl,
            _reputationEl,
            _personalIdentityEl,
            _marketplaceEl,
            _gridEl,
            _quickAccessEl,
        ];
        for (const el of mainEls) {
            if (el) el.style.display = showEmpty ? 'none' : '';
        }
        if (showEmpty) {
            _renderEmptyState();
            return;
        }
    } else if (_emptyStateEl) {
        _emptyStateEl.style.display = 'none';
    }
    _renderHeader();
    _renderBootState();
    runHomeGridPhase('flow-status', _renderFlowStatus);
    runHomeGridPhase('stats', _renderStats);
    runHomeGridPhase('suggested', _renderSuggested);
    runHomeGridPhase('marketplace', renderMarketplace);
    runHomeGridPhase('eis', renderEisDashboard);
    runHomeGridPhase('identity', renderIdentity);
    runHomeGridPhase('quick-access', renderQuickAccess);
}

function _renderEmptyState() {
    // Render-from-data extraído p/ homeGrid/_renderSections (ARCH-SPLIT-HOMEGRID-001
    // render slice). Wrapper fino injeta o tradutor + hydrateIcons; marcação idêntica.
    _renderHomeEmptyStateModule(_emptyStateEl, {
        t,
        hydrateIcons: typeof window.hydrateIcons === 'function' ? window.hydrateIcons : null,
    });
}

function _buildInteractionShell() {
    if (!_homeEl) return;
    _resolveActionsFeatureFlags();
    _homeEl.innerHTML = '';
    _homeEl.classList.add('home-container-actions');

    // Scaffold do shell — contrato (ids/classes/a11y) em _homeShellScaffoldPure
    // (S6 split). Itera o spec congelado em vez de 6 blocos createElement.
    const _shellEls: Record<string, any> = {};
    for (const spec of _SHELL_SCAFFOLD_SPEC) {
        const el = document.createElement(spec.tag);
        if (spec.id) el.id = spec.id;
        el.className = spec.className;
        for (const [attr, value] of Object.entries(spec.attributes)) el.setAttribute(attr, value);
        (spec.parent === 'home' ? _homeEl : _shellEls.root).appendChild(el);
        _shellEls[spec.key] = el;
    }
    _shellRootEl = _shellEls.root;
    _shellLeftEl = _shellEls.left;
    _shellLeftSplitterEl = _shellEls.leftSplitter;
    _shellMainEl = _shellEls.main;
    _shellRightSplitterEl = _shellEls.rightSplitter;
    _shellRightEl = _shellEls.right;

    _renderLeftShell();
    _renderMainShell();
    _renderRightShell();
    _actionsShellLayout.bindLayout();
    _actionsShellLayout.refreshLayout({ forceDefault: true });
}

function _renderLeftShell() {
    if (!_shellLeftEl) return;
    _shellLeftEl.innerHTML = '';
    _shellLeftEl.classList.toggle('actions-shell-left--workspace', !!CONFIG.FEATURES.HOME_REDESIGN_V2);
    _sidePanelEl = null;
    _inspectorPanelEl = null;

    _workspaceSectionEl = document.createElement('section');
    _workspaceSectionEl.className = 'actions-shell-workspace';
    _workspaceSectionEl.setAttribute('data-testid', 'actions-workspace-shell');

    _treeEl = document.createElement('div');
    _treeEl.className = 'actions-shell-tree';
    _treeEl.setAttribute('data-testid', 'actions-tree');
    // V2 F8: label explícito de escopo + placeholder dinâmico por domínio
    const filterLabel = t('tree.filter.label') || 'Buscar no domínio ativo';
    _treeEl.innerHTML = `
        <label class="actions-shell-tree-filter-wrap" for="actions-tree-filter-input">
            <span class="actions-shell-tree-filter-label">${escapeHtml(filterLabel)}</span>
            <input id="actions-tree-filter-input"
                   class="actions-shell-tree-filter"
                   data-testid="actions-tree-filter"
                   type="search"
                   aria-label="${escapeHtml(filterLabel)}"
                   placeholder="${escapeHtml(t('tree.filter.placeholder') || 'Digite para filtrar...')}" />
        </label>
        <div data-testid="actions-tree-content"></div>
    `;
    const filterInput = _treeEl.querySelector('#actions-tree-filter-input');
    filterInput?.addEventListener(
        'input',
        /** @param {any} dateLike */ (ev: any) => {
            _treeFilter = String(ev?.target?.value || '')
                .trim()
                .toLowerCase();
            _renderTree();
        },
    );

    const footer = document.createElement('div');
    footer.className = 'actions-shell-footer';
    footer.setAttribute('data-testid', 'actions-sidebar-footer');
    _workspaceFooterEl = footer;

    if (CONFIG.FEATURES.HOME_REDESIGN_V2) {
        _railEl = null;
        _workspaceFooterEl = null;
        _sidePanelEl = document.createElement('section');
        _sidePanelEl.className = 'actions-shell-side-panel';
        _sidePanelEl.setAttribute('data-testid', 'actions-side-panel');
        _shellLeftEl.appendChild(_workspaceSectionEl);
        _shellLeftEl.appendChild(_sidePanelEl);
        _renderWorkspaceSection();
        _renderActionsSidePanel();
        return;
    }

    const tools = document.createElement('div');
    tools.className = 'actions-shell-tools';
    tools.setAttribute('data-testid', 'actions-tools');
    tools.innerHTML = `
        <button type="button" class="actions-shell-tool-btn" data-testid="actions-tool-new">+ Nova entrada</button>
        <button type="button" class="actions-shell-tool-btn" data-testid="actions-tool-explorer">Explorador</button>
        <button type="button" class="actions-shell-tool-btn" data-testid="actions-tool-search">Busca global</button>
        <button type="button" class="actions-shell-tool-btn" data-testid="actions-tool-bookmarks">Bookmarks</button>
    `;

    _railEl = document.createElement('nav');
    _railEl.className = 'actions-shell-rail';
    _railEl.setAttribute('data-testid', 'actions-rail');

    for (const domain of DOMAIN_DEFS) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'actions-shell-rail-btn';
        btn.setAttribute('data-domain-id', domain.id);
        btn.setAttribute('data-testid', `actions-rail-${domain.id}`);
        btn.innerHTML = `
            <span data-icon="${domain.icon}" data-icon-size="14px"></span>
            <span>${domain.label}</span>
        `;
        btn.addEventListener('click', () => _setActiveDomain(domain.id, 'rail'));
        _railEl.appendChild(btn);
    }

    _shellLeftEl.appendChild(_workspaceSectionEl);
    _shellLeftEl.appendChild(tools);
    _shellLeftEl.appendChild(_railEl);
    _shellLeftEl.appendChild(_treeEl);
    _shellLeftEl.appendChild(footer);
    _renderWorkspaceSection();
}

function _syncWorkspaceCacheUser() {
    const userId = getCurrentUser()?.id || null;
    if (_workspaceCache.userId === userId) return;
    _workspaceCache.userId = userId;
    _workspaceCache.saved = [];
    _workspaceCache.shared = [];
    _workspaceCache.autosaveLanes = [];
    _workspaceCache.autosaveSnapshotsByLane = {};
    _workspaceCache.loading.saved = false;
    _workspaceCache.loading.shared = false;
    _workspaceCache.loading.autosave = false;
    _workspaceCache.loadedAt.saved = 0;
    _workspaceCache.loadedAt.shared = 0;
    _workspaceCache.loadedAt.autosave = 0;
    _workspaceCache.errors.saved = null;
    _workspaceCache.errors.shared = null;
    _workspaceCache.errors.autosave = null;
}

function _ensureWorkspaceDefaults() {
    _syncWorkspaceCacheUser();
    if (!_activeModelSource) {
        _activeModelSource = 'local';
    }
    if (_activeScopeKind === 'organization' && !_getOrganizationScopeOption()?.orgId) {
        _activeScopeKind = 'personal';
        _activeOrgId = null;
    }
}

/** @param {any} dateLike */
function _formatWorkspaceDate( dateLike: unknown) {
    // Formatação PURA extraída p/ homeGrid/_navigatorLabelsPure (byte-idêntica).
    return _formatWorkspaceDatePure(dateLike);
}

// ARCH-SPLIT-HOMEGRID-001 (workspace-section slice): os derivadores READ-ONLY do
// loader de workspace (labels/mensagens/listas/HTML) foram movidos p/
// homeGrid/_workspaceSection.ts. O homeGrid expõe o estado via getters (sem
// setters — mesmo padrão de baixo acoplamento do _actionsProbe) através deste
// contexto; os wrappers finos abaixo delegam ao módulo p/ preservar a fan-out
// (companion → barrel → subject) e os nomes/assinaturas internos. Comportamento
// BYTE-idêntico.
const _workspaceSectionCtx: _WorkspaceSectionContext = {
    getActiveModelSource: () => _activeModelSource,
    getActiveScopeKind: () => _activeScopeKind,
    getActiveModelId: () => _activeModelId,
    getActiveModelLabel: () => _activeModelLabel,
    getActiveLaneId: () => _activeLaneId,
    getActiveSnapshotId: () => _activeSnapshotId,
    getWorkspaceCache: () => _workspaceCache,
    getCurrentUser,
    getModelIdSync,
    safeGetElements: _safeGetElements,
    safeGetCampaigns: _safeGetCampaigns,
    formatWorkspaceDate: _formatWorkspaceDate,
    workspaceSourceDefs: WORKSPACE_SOURCE_DEFS,
};

function _getOrganizationScopeOption() {
    return _getOrganizationScopeOptionWs(_workspaceSectionCtx);
}

function _getScopeOptions() {
    return _getScopeOptionsWs(_workspaceSectionCtx);
}

function _getWorkspaceSourceLabel() {
    return _getWorkspaceSourceLabelWs(_workspaceSectionCtx);
}

function _getWorkspaceScopeLabel() {
    return _getWorkspaceScopeLabelWs(_workspaceSectionCtx);
}

function _getWorkspaceSelectionLabel() {
    return _getWorkspaceSelectionLabelWs(_workspaceSectionCtx);
}

function _getLocalWorkspaceEntries() {
    return _getLocalWorkspaceEntriesWs(_workspaceSectionCtx);
}

/** @returns {readonly any[]} */
function _getWorkspaceItemsForActiveSource(): readonly any[] {
    return _getWorkspaceItemsForActiveSourceWs(_workspaceSectionCtx);
}

/** @returns {readonly any[]} */
function _getActiveLaneSnapshots(): readonly any[] {
    return _getActiveLaneSnapshotsWs(_workspaceSectionCtx);
}

function _getWorkspaceEmptyMessage() {
    return _getWorkspaceEmptyMessageWs(_workspaceSectionCtx);
}

/** @param {any[]} modelItems */
function _buildWorkspaceModelListHtml( modelItems: any) {
    return _buildWorkspaceModelListHtmlWs(_workspaceSectionCtx, modelItems);
}

/**
 * @param {any} snapshots
 */
function _buildWorkspaceSnapshotListHtml( snapshots: any) {
    return _buildWorkspaceSnapshotListHtmlWs(_workspaceSectionCtx, snapshots);
}

function _renderSidebarFooter() {
    // Corpo extraído p/ homeGrid/homeSidebarFooter (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderSidebarFooterModule({
        getFooterEl: () => _workspaceFooterEl,
        ensureWorkspaceDefaults: _ensureWorkspaceDefaults,
        getCurrentUser,
        getScopeOptions: _getScopeOptions,
        getWorkspaceItemsForActiveSource: _getWorkspaceItemsForActiveSource,
        getActiveModelSource: () => _activeModelSource,
        getActiveLaneSnapshots: _getActiveLaneSnapshots,
        getWorkspaceCache: () => _workspaceCache,
        getActiveLaneId: () => _activeLaneId,
        getActiveSnapshotId: () => _activeSnapshotId,
        getWorkspaceSelectionLabel: _getWorkspaceSelectionLabel,
        getWorkspaceScopeLabel: _getWorkspaceScopeLabel,
        getWorkspaceSourceLabel: _getWorkspaceSourceLabel,
        getWorkspaceFooterExpanded: () => _workspaceFooterExpanded,
        getActiveScopeKind: () => _activeScopeKind,
        workspaceSourceDefs: WORKSPACE_SOURCE_DEFS,
        buildWorkspaceModelListHtml: _buildWorkspaceModelListHtml,
        buildWorkspaceSnapshotListHtml: _buildWorkspaceSnapshotListHtml,
        getWorkspaceEmptyMessage: _getWorkspaceEmptyMessage,
        wireWorkspaceFooterEvents: _wireWorkspaceFooterEvents,
    });
}

function _renderWorkspaceSection() {
    // Corpo extraído p/ homeGrid/homeWorkspaceSection (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderWorkspaceSectionModule({
        renderSidebarFooter: _renderSidebarFooter,
        getSectionEl: () => _workspaceSectionEl,
        ensureWorkspaceSourceLoaded: _ensureWorkspaceSourceLoaded,
        getActiveModelSource: () => _activeModelSource,
        ensureWorkspaceDefaults: _ensureWorkspaceDefaults,
        getCurrentUser,
        getScopeOptions: _getScopeOptions,
        getWorkspaceItemsForActiveSource: _getWorkspaceItemsForActiveSource,
        getActiveLaneSnapshots: _getActiveLaneSnapshots,
        getWorkspaceCache: () => _workspaceCache,
        getWorkspaceSourceLabel: _getWorkspaceSourceLabel,
        getWorkspaceScopeLabel: _getWorkspaceScopeLabel,
        getWorkspaceLoaderExpanded: () => _workspaceLoaderExpanded,
        getWorkspaceSourceExpanded: () => _workspaceSourceExpanded,
        getActiveScopeKind: () => _activeScopeKind,
        workspaceSourceDefs: WORKSPACE_SOURCE_DEFS,
        buildWorkspaceModelListHtml: _buildWorkspaceModelListHtml,
        buildWorkspaceSnapshotListHtml: _buildWorkspaceSnapshotListHtml,
        wireWorkspacePickerEvents: _wireWorkspacePickerEvents,
    });
}

function _renderActionsSidePanel() {
    // Corpo extraído p/ homeGrid/homeActionsSidePanel (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderActionsSidePanelModule({
        getSidePanelEl: () => _sidePanelEl,
        getActionsSideView: () => _actionsSideView,
        setActionsSideView: (v) => {
            _actionsSideView = v;
        },
        setInspectorPanelEl: (el) => {
            _inspectorPanelEl = el;
        },
        getTreeEl: () => _treeEl,
        setTreeEl: (el) => {
            _treeEl = el;
        },
        getTreeFilter: () => _treeFilter,
        setTreeFilter: (v) => {
            _treeFilter = v;
        },
        renderActionsSidePanel: _renderActionsSidePanel,
        renderEmbeddedInspector: _renderEmbeddedInspector,
        renderTree: _renderTree,
    });
}

// ARCH-SPLIT-HOMEGRID-001 (embedded-inspector slice): os derivadores READ-ONLY do
// inspetor embutido (seleção, chips de família, atalho "abrir no modelo") foram
// movidos p/ homeGrid/_embeddedInspector.ts. As deps de leitura são injetadas via
// este contexto (getters only — sem setters, mesmo padrão do _actionsProbe); os
// wrappers finos abaixo delegam ao módulo p/ preservar a fan-out (companion →
// barrel → subject) e os nomes/assinaturas internos. Comportamento BYTE-idêntico.
// O _wireEmbeddedInspectorEvents (stateful: muda _actionsSideView + re-render)
// permanece no homeGrid p/ não inflar acoplamento.
const _embeddedInspectorCtx: _EmbeddedInspectorContext = {
    getSelectedElement,
    safeGetElements: _safeGetElements,
    safeGetCampaigns: _safeGetCampaigns,
    getConnectedEdges,
    getElementObservations: (element: any) => _getElementObservations(element),
};

function _getEmbeddedInspectorSelection() {
    return _getEmbeddedInspectorSelectionImpl(_embeddedInspectorCtx);
}

/**
 * @param {any[]} familyCounts
 */
function _renderInspectorFamilyChips( familyCounts: any) {
    return _renderInspectorFamilyChipsImpl(familyCounts, _getObjectTypeLabel);
}

function _openActionsSelectionInModel() {
    return _openActionsSelectionInModelImpl(_embeddedInspectorCtx);
}

function _wireEmbeddedInspectorEvents() {
    if (!_inspectorPanelEl) return;

    _inspectorPanelEl.querySelectorAll('[data-inspector-action]').forEach(
        /** @param {any} root */ (btn: any) => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-inspector-action');
                if (action === 'open-panel') {
                    window.handleToggleInspector?.();
                } else if (action === 'open-navigator') {
                    _actionsSideView = 'navigator';
                    _renderActionsSidePanel();
                } else if (action === 'open-model') {
                    _openActionsSelectionInModel();
                } else if (action === 'clear-selection') {
                    window.handleSelectElement?.(null);
                } else if (action === 'reset-layout') {
                    _actionsShellLayout.resetLayout();
                } else if (action === 'add-observation') {
                    // WL-7: empty-state CTA "+ Observação" no stat zerado.
                    const sel = getSelectedElement();
                    if (sel?.id) window.handleAddObservation?.(sel.id);
                } else if (action === 'add-relation') {
                    // WL-7: empty-state CTA "+ Relação" no stat zerado.
                    window.handleAddEdgeClick?.();
                }
            });
        },
    );
}

function _renderEmbeddedInspector() {
    // Corpo extraído p/ homeGrid/homeInspector (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderEmbeddedInspectorModule({
        getInspectorPanelEl: () => _inspectorPanelEl,
        getEmbeddedInspectorSelection: _getEmbeddedInspectorSelection,
        getObjectTypeLabel: _getObjectTypeLabel,
        getNavigatorSiteLabel: _getNavigatorSiteLabel,
        getWorkspaceScopeLabel: _getWorkspaceScopeLabel,
        getWorkspaceSourceLabel: _getWorkspaceSourceLabel,
        getWorkspaceSelectionLabel: _getWorkspaceSelectionLabel,
        renderInspectorFamilyChips: _renderInspectorFamilyChips,
        wireEmbeddedInspectorEvents: _wireEmbeddedInspectorEvents,
    });
}

/**
 * @param {any} root
 */
function _wireWorkspacePickerEvents( root: any) {
    if (!root) return;
    root.querySelector('[data-actions-layout-reset="true"]')?.addEventListener('click', () => {
        _actionsShellLayout.resetLayout();
    });
    // UI-MINIMALISM-001 F3: alterna a área de Scope/Source (progressive disclosure).
    root.querySelector('[data-workspace-source-toggle="true"]')?.addEventListener('click', () => {
        _workspaceSourceExpanded = !_workspaceSourceExpanded;
        _renderWorkspaceSection();
    });
    // UI-MINIMALISM-001 F3/WL-1: colapsa/expande o loader inteiro (1-linha ↔ completo).
    root.querySelector('[data-workspace-loader-toggle="true"]')?.addEventListener('click', () => {
        _workspaceLoaderExpanded = !_workspaceLoaderExpanded;
        _renderWorkspaceSection();
    });
    const scopeButtons = root.querySelectorAll('[data-scope-kind]');
    for (const btn of scopeButtons) {
        btn.addEventListener('click', () => {
            const scopeKind = btn.getAttribute('data-scope-kind') || 'personal';
            const orgId = btn.getAttribute('data-org-id') || null;
            _activeScopeKind = scopeKind;
            _activeOrgId = scopeKind === 'organization' ? orgId : null;
            _activeModelId = null;
            _activeModelLabel = null;
            _activeLaneId = null;
            _activeSnapshotId = null;
            _renderWorkspaceSection();
            _dispatchContextChanged('workspace-scope');
        });
    }

    const sourceButtons = root.querySelectorAll('[data-model-source]');
    for (const btn of sourceButtons) {
        btn.addEventListener('click', () => {
            const source = btn.getAttribute('data-model-source') || 'local';
            if (_activeModelSource === source) return;
            _activeModelSource = source;
            _activeModelId = null;
            _activeModelLabel = null;
            _activeLaneId = null;
            _activeSnapshotId = null;
            _renderWorkspaceSection();
            _dispatchContextChanged('workspace-source');
        });
    }

    const itemButtons = root.querySelectorAll('[data-workspace-item-id]');
    for (const btn of itemButtons) {
        btn.addEventListener('click', async () => {
            const itemId = btn.getAttribute('data-workspace-item-id');
            const itemKind = btn.getAttribute('data-workspace-item-kind');
            if (!itemId || !itemKind) return;
            if (itemKind === 'lane') {
                await _handleWorkspaceLaneSelect(itemId);
                return;
            }
            await _handleWorkspaceModelSelect(itemId, itemKind);
        });
    }

    const snapshotButtons = root.querySelectorAll('[data-snapshot-id]');
    for (const btn of snapshotButtons) {
        btn.addEventListener('click', async () => {
            const snapshotId = btn.getAttribute('data-snapshot-id');
            if (!snapshotId) return;
            await _handleWorkspaceSnapshotSelect(snapshotId);
        });
    }

    root.querySelector('[data-workspace-action="login"]')?.addEventListener('click', () => {
        window.handleOpenAuthModal?.();
    });
}

function _wireWorkspaceFooterEvents() {
    if (!_workspaceFooterEl) return;
    _workspaceFooterEl.querySelector('[data-workspace-footer-toggle="true"]')?.addEventListener('click', () => {
        _workspaceFooterExpanded = !_workspaceFooterExpanded;
        _renderSidebarFooter();
    });
    _wireWorkspacePickerEvents(_workspaceFooterEl);
}

/**
 * @param {any} modelId
 */
async function _syncCurrentCloudModelId( modelId: any) {
    try {
        const cloudModulePath = '../handlers/cloud.js';
        const { setCurrentCloudModelId } = await import(cloudModulePath);
        setCurrentCloudModelId(modelId || null);
    } catch (err: unknown) {
        console.debug('[homeGrid:workspace-cloud-id]', (err as { message?: string } | null)?.message || err);
    }
}

/**
 * @param {any} itemKind
 */
// eslint-disable-next-line
async function _applyLoadedWorkspaceModel( modelData: any, { modelId = null, origin: any = 'workspace-load' } ) {
    if (!modelData || typeof modelData !== 'object') {
        throw new Error('Modelo vazio');
    }
    setEphemeral(false);
    await clearModelData();
    await applyModel(modelData);
    await _syncCurrentCloudModelId(modelId);
    _treeFilter = '';
    _activeObjectId = null;
    _activeObjectType = null;
    window.dispatchEvent(new CustomEvent('modelChanged', { detail: { origin } }));
    _renderWorkspaceSection();
    _renderTree();
    _renderContextPanel(origin);
    _dispatchContextChanged(origin);
}

/**
 * @param {any} itemKind
 * @param {any} itemKind
 */
async function _loadWorkspaceModelSelection( modelId: any, itemKind: any) {
    const loadingMsg =
        itemKind === 'shared'
            ? t('cloud.loadingSharedModel') || 'Carregando modelo compartilhado...'
            : t('cloud.loadingModel') || 'Carregando modelo...';
    const successMsg =
        itemKind === 'shared'
            ? t('cloud.sharedModelLoaded') || 'Modelo compartilhado carregado.'
            : t('cloud.modelLoaded') || 'Modelo carregado.';
    showToast(loadingMsg, 'info');
    const modelData = await loadModelFromCloud(modelId);
    await _applyLoadedWorkspaceModel(modelData, {
        modelId,
        origin: itemKind === 'shared' ? 'workspace-shared' : 'workspace-model',
    });
    showToast(successMsg, 'success');
}

/**
 * @param {any} snapshotId
 */
async function _restoreWorkspaceSnapshotSelection( snapshotId: any) {
    showToast(t('cloud.loadingModel') || 'Restaurando snapshot...', 'info');
    const snapshot = await loadAutosaveSnapshot(snapshotId);
    if (!snapshot?.snapshot_data) {
        throw new Error('Snapshot vazio');
    }
    _activeModelId = snapshot.model_id || _activeModelId;
    await _applyLoadedWorkspaceModel(snapshot.snapshot_data, {
        modelId: snapshot.model_id || null,
        origin: 'workspace-snapshot',
    });
    showToast(t('cloud.snapshotRestored') || 'Snapshot restaurado.', 'success');
}

/**
 * @param {any} itemId
 * @param {any} itemKind
 */
async function _handleWorkspaceModelSelect( itemId: any, itemKind: any) {
    const items = _getWorkspaceItemsForActiveSource();
    const item = items.find((entry: any) => entry.id === itemId && entry.kind === itemKind);
    const previousState = {
        activeModelId: _activeModelId,
        activeModelLabel: _activeModelLabel,
        activeSnapshotId: _activeSnapshotId,
        activeObjectId: _activeObjectId,
        activeObjectType: _activeObjectType,
    };
    _activeModelId = itemId;
    _activeModelLabel = item?.label || itemId;
    _activeSnapshotId = null;
    _activeObjectId = null;
    _activeObjectType = null;
    _renderWorkspaceSection();

    try {
        if (itemKind === 'saved' || itemKind === 'shared') {
            await _loadWorkspaceModelSelection(itemId, itemKind);
            return;
        }
        _treeFilter = '';
        _renderTree();
        _renderContextPanel('workspace-local');
        _dispatchContextChanged('workspace-local');
    } catch (err: unknown) {
        _activeModelId = previousState.activeModelId;
        _activeModelLabel = previousState.activeModelLabel;
        _activeSnapshotId = previousState.activeSnapshotId;
        _activeObjectId = previousState.activeObjectId;
        _activeObjectType = previousState.activeObjectType;
        _renderWorkspaceSection();
        _renderTree();
        _renderContextPanel('workspace-model-error');
        showToast((err as { message?: string } | null)?.message || 'Falha ao carregar modelo.', 'error');
    }
}

/**
 * @param {any} laneId
 */
async function _handleWorkspaceLaneSelect( laneId: any) {
    _activeLaneId = laneId;
    _activeModelId = laneId;
    _activeModelLabel =
        (_workspaceCache.autosaveLanes || []).find(/** @param {any} snapshotId */ (lane: any) => lane.id === laneId)?.name ||
        'Raia de autosave';
    _activeSnapshotId = null;
    try {
        setActiveLane(laneId);
    } catch (e: unknown) {
        console.debug('[homeGrid] setActiveLane:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
    await _ensureAutosaveSnapshotsLoaded(laneId);
    _renderWorkspaceSection();
    _dispatchContextChanged('workspace-lane');
}

/**
 * @param {any} snapshotId
 */
async function _handleWorkspaceSnapshotSelect( snapshotId: any) {
    const previousState = {
        activeSnapshotId: _activeSnapshotId,
        activeObjectId: _activeObjectId,
        activeObjectType: _activeObjectType,
    };
    _activeSnapshotId = snapshotId;
    _activeObjectId = null;
    _activeObjectType = null;
    _renderWorkspaceSection();
    try {
        await _restoreWorkspaceSnapshotSelection(snapshotId);
    } catch (err: unknown) {
        _activeSnapshotId = previousState.activeSnapshotId;
        _activeObjectId = previousState.activeObjectId;
        _activeObjectType = previousState.activeObjectType;
        _renderWorkspaceSection();
        _renderTree();
        _renderContextPanel('workspace-snapshot-error');
        showToast((err as { message?: string } | null)?.message || 'Falha ao restaurar snapshot.', 'error');
    }
}

/**
 * @param {any} source
 */
async function _ensureWorkspaceSourceLoaded( source: any, { force = false }: any = {}) {
    _ensureWorkspaceDefaults();
    if (source === 'local') {
        _renderSidebarFooter();
        return;
    }

    const user = getCurrentUser();
    if (!user) {
        _workspaceCache.errors[source] = null;
        _workspaceCache.loading[source] = false;
        _workspaceCache.loadedAt[source] = Date.now();
        return;
    }

    if (_activeScopeKind === 'organization' && !_getOrganizationScopeOption()?.orgId) {
        _workspaceCache.errors[source] = 'Escopo organizacional ainda nao disponivel para esta conta.';
        _workspaceCache.loading[source] = false;
        _workspaceCache.loadedAt[source] = Date.now();
        return;
    }

    const loadedRecently =
        !force &&
        _workspaceCache.loadedAt[source] > 0 &&
        Date.now() - _workspaceCache.loadedAt[source] < WORKSPACE_CACHE_TTL;
    if (_workspaceCache.loading[source] || loadedRecently) {
        return;
    }

    _workspaceCache.loading[source] = true;
    _workspaceCache.errors[source] = null;
    _renderWorkspaceSection();

    try {
        if (source === 'saved') {
            _workspaceCache.saved = await loadModelsFromCloud();
        } else if (source === 'shared') {
            _workspaceCache.shared = await getSharedModels();
        } else if (source === 'autosave') {
            _workspaceCache.autosaveLanes = await loadAutosaveLanes();
            const defaultLane =
                (_activeLaneId &&
                    _workspaceCache.autosaveLanes.find(/** @param {any} lane */ (lane: any) => lane.id === _activeLaneId)) ||
                getActiveLane() ||
                _workspaceCache.autosaveLanes[0] ||
                null;
            _activeLaneId = defaultLane?.id || null;
            if (_activeLaneId) {
                await _ensureAutosaveSnapshotsLoaded(_activeLaneId, { force });
            }
        }
        _workspaceCache.loadedAt[source] = Date.now();
    } catch (err: unknown) {
        _workspaceCache.errors[source] = (err as { message?: string } | null)?.message || 'Falha ao carregar dados do workspace.';
        _workspaceCache.loadedAt[source] = Date.now();
    } finally {
        _workspaceCache.loading[source] = false;
        _renderWorkspaceSection();
    }
}

/**
 * @param {any} laneId
 */
async function _ensureAutosaveSnapshotsLoaded( laneId: any, { force = false }: any = {}) {
    if (!laneId) return;
    const lane = (_workspaceCache.autosaveLanes || []).find(/** @param {any} footer */ (entry: any) => entry.id === laneId);
    if (!lane?.scope_key) return;
    if (!force && _workspaceCache.autosaveSnapshotsByLane[laneId]) return;
    try {
        _workspaceCache.autosaveSnapshotsByLane[laneId] = await listAutosaveSnapshots({
            scopeKey: lane.scope_key,
            limit: 5,
            includeThumbnail: false,
        });
    } catch (err: unknown) {
        _workspaceCache.errors.autosave = (err as { message?: string } | null)?.message || 'Falha ao carregar snapshots.';
    }
}

const SIDEBAR_GROUPS = {
    essential: {
        ids: ['monitoring', 'marketplace', 'automation', 'projects'],
        i18n: 'sidebar.group.essential',
        fallbackLabel: 'Essencial',
    },
    advanced: {
        ids: ['security', 'compliance', 'export', 'spatial'],
        i18n: 'sidebar.group.advanced',
        fallbackLabel: 'Avancado',
    },
    community: { ids: ['compare'], i18n: 'sidebar.group.community', fallbackLabel: 'Comunidade' },
};

/**
 * @param {any} footer
 */
function _renderGroupedSidebar( footer: any) {
    // Corpo extraído p/ homeGrid/homeGroupedSidebar (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderGroupedSidebarModule(footer, {
        getShellLeftEl: () => _shellLeftEl,
        setWorkspaceSectionEl: (el) => {
            _workspaceSectionEl = el;
        },
        setWorkspaceFooterEl: (el) => {
            _workspaceFooterEl = el;
        },
        getTreeEl: () => _treeEl,
        sidebarGroups: SIDEBAR_GROUPS,
        domainDefs: DOMAIN_DEFS,
        setActiveDomain: _setActiveDomain,
        renderGroupedSidebar: _renderGroupedSidebar,
        renderWorkspaceSection: _renderWorkspaceSection,
    });
}

function _renderMainShellLegacy() {
    // View-toggle para trocar entre 2D/2.5D/3D. Não inclui "Acoes" porque
    // a tab superior (.actions-shell-tab active) já indica que estamos
    // no view Actions - evita label duplicada (spec V2 F1).
    _contextSurfaceEl = document.createElement('div');
    _contextSurfaceEl.className = 'actions-shell-context-surface';
    _contextSurfaceEl.setAttribute('data-testid', 'actions-context-surface');
    _shellMainEl!.appendChild(_contextSurfaceEl);
}

function _renderMainShell() {
    _mainTabsEl = null;
    _breadcrumbEl = null;
    _viewToggleEl = null;
    _contextToolbarEl = null;
    _contextSurfaceEl = null;
    _shellMainEl!.classList.add('actions-shell-main--workspace');
}

function _renderRightShell() {
    if (!_shellRightEl) return;
    _relatedEl = null;
    _metaEl = null;
    _graphPanelEl = null;
    _aiPanelEl = null;
    _renderActionsRelationsPanel(_shellRightEl);
}

function _hasLoadedWorkspaceModel() {
    return !!getModelIdSync() || _safeGetElements().length > 0 || _safeGetCampaigns().length > 0 || !!_activeModelLabel;
}

/**
 * @param {any} value
 */
function _toNavigatorIdSegment( value: unknown) {
    // Slug PURO extraído p/ homeGrid/_navigatorLabelsPure (byte-idêntico).
    return _toNavigatorIdSegmentPure(value);
}

function _getNavigatorOrganizationLabel() {
    return _activeScopeKind === 'organization' ? _getWorkspaceScopeLabel() : 'Workspace pessoal';
}

function _getNavigatorSiteLabel() {
    try {
        const projectName = (document.getElementById('project-name') as HTMLInputElement | null)?.value?.trim();
        if (projectName) return projectName;
    } catch (e: unknown) {
        console.debug('[homeGrid] navigatorSiteLabel:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
    return _activeModelLabel || getModelIdSync() || 'Modelo carregado';
}

/**
 * @param {any} element
 * @returns {any[]}
 */
function _getElementObservations( element: any) {
    if (Array.isArray(element?.data?.observations)) return element.data.observations;
    if (Array.isArray(element?.observations)) return element.observations;
    return [];
}

function _getNavigatorParameterLabel( parameterId: unknown) {
    // Decisão PURA extraída p/ homeGrid/_navigatorLabelsPure (byte-idêntica); o
    // barrel injeta a lista `CONFIG.PARAMETERS` e a pura resolve o melhor rótulo
    // (label || name || title || id || fallback) — mesma precedência do legado.
    return _resolveNavigatorParameterLabelPure((CONFIG.PARAMETERS || []) as any, parameterId);
}

function _formatNavigatorResultLabel( observation: any, index: any) {
    // Rótulo PURO extraído p/ homeGrid/_navigatorLabelsPure (byte-idêntico); o
    // formatador de data (também puro) é injetado p/ preservar o comportamento.
    return _formatNavigatorResultLabelPure(observation, index, _formatWorkspaceDatePure);
}

function _navigatorDataDeps() {
    return {
        getNavigatorParameterLabel: _getNavigatorParameterLabel,
        getElementObservations: _getElementObservations,
        toNavigatorIdSegment: _toNavigatorIdSegment,
        formatNavigatorResultLabel: _formatNavigatorResultLabel,
        hasLoadedWorkspaceModel: _hasLoadedWorkspaceModel,
        safeGetElements: _safeGetElements,
        safeGetCampaigns: _safeGetCampaigns,
        getNavigatorOrganizationLabel: _getNavigatorOrganizationLabel,
        getNavigatorSiteLabel: _getNavigatorSiteLabel,
        getActiveModelLabel: () => _activeModelLabel,
    };
}

function _buildNavigatorPoints( elements: any, opts: any = {}) {
    // Corpo extraído p/ homeGrid/homeNavigatorData (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    return buildNavigatorPoints(elements, opts, _navigatorDataDeps());
}

function _buildLoadedModelNavigatorNodes() {
    // Corpo extraído p/ homeGrid/homeNavigatorData (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    return buildLoadedModelNavigatorNodes(_navigatorDataDeps());
}

function _filterNavigatorNodes( nodes: any) {
    // Corpo extraído p/ homeGrid/_navigatorFilterPure (ARCH-SPLIT-HOMEGRID-001).
    // O barrel mantém o estado do filtro (_treeFilter) e passa como argumento;
    // a decisão (match + cadeia de ancestrais) vive na pura. Comportamento idêntico.
    return _filterNavigatorNodesPure(nodes, _treeFilter);
}

function _renderShellContext() {
    const signature = buildHomeShellContextSignature({
        activeDomain: _activeDomain || 'monitoring', activeObjectId: _activeObjectId, activeObjectType: _activeObjectType, activeScopeKind: _activeScopeKind, activeOrgId: _activeOrgId, activeModelSource: _activeModelSource,
        activeModelId: _activeModelId, activeModelLabel: _activeModelLabel, activeLaneId: _activeLaneId, activeSnapshotId: _activeSnapshotId, treeFilter: _treeFilter, actionsSideView: _actionsSideView, modelId: getModelIdSync(), userId: getCurrentUser()?.id,
        elements: _safeGetElements(), campaigns: _safeGetCampaigns(),
    });
    if (_lastShellContextSignature === signature && _workspaceSectionEl && (_sidePanelEl || _inspectorPanelEl || _treeEl)) return;
    _lastShellContextSignature = signature;
    runHomeGridPhase('shell-context:restore', _restoreLastObjectContext);
    runHomeGridPhase('shell-context:workspace', _renderWorkspaceSection);
    if (_sidePanelEl && _inspectorPanelEl && _treeEl) {
        runHomeGridPhase('shell-context:inspector', _renderEmbeddedInspector);
        runHomeGridPhase('shell-context:tree', _renderTree);
    } else {
        runHomeGridPhase('shell-context:side-panel', _renderActionsSidePanel);
    }
    runHomeGridPhase('shell-context:domain', () => _setActiveDomain(_activeDomain || 'monitoring', 'init', { preserveObject: !!_activeObjectId, skipTree: true }));
}

function _setActiveDomain( domainId: string, origin: string = 'unknown', { preserveObject = false, skipTree = false }: { preserveObject?: boolean; skipTree?: boolean } = {}) {
    _activeDomain = domainId;
    if (!preserveObject) {
        _activeObjectId = null;
        _activeObjectType = null;
    }
    runHomeGridPhase('domain:rail', _renderRailSelection);
    if (!skipTree) runHomeGridPhase('domain:tree', _renderTree);
    runHomeGridPhase('domain:context', () => _renderContextPanel(origin));
    // V2 F8: atualiza placeholder do filtro com nome do domínio ativo
    window.dispatchEvent(new CustomEvent('domain:selected', { detail: { domainId, origin } }));
    runHomeGridPhase('domain:dispatch', () => _dispatchContextChanged(origin));
}

function _updateTreeFilterPlaceholder() {
    const filterInput = _treeEl?.querySelector('#actions-tree-filter-input');
    if (!filterInput) return;
    const tpl = t('tree.filter.placeholderScoped') || 'Filtrar em {domain}...';
    const targetLabel = _hasLoadedWorkspaceModel() ? _getNavigatorSiteLabel() : _getWorkspaceSelectionLabel();
    filterInput.setAttribute('placeholder', tpl.replace('{domain}', targetLabel || 'workspace'));
}

function _renderRailSelection() {
    if (!_shellLeftEl) return;
    const buttons = _shellLeftEl.querySelectorAll('[data-domain-id]');
    for (const btn of buttons) {
        const isActive = btn.getAttribute('data-domain-id') === _activeDomain;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    }
}

function _renderTree() {
    // Corpo extraído p/ homeGrid/homeTreeRender (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderTreeModule({
        getTreeEl: () => _treeEl,
        updateTreeFilterPlaceholder: _updateTreeFilterPlaceholder,
        getTreeNodes: _getTreeNodes,
        getActiveObjectId: () => _activeObjectId,
        setActiveObjectId: (v) => {
            _activeObjectId = v;
        },
        getActiveObjectType: () => _activeObjectType,
        setActiveObjectType: (v) => {
            _activeObjectType = v;
        },
        filterNavigatorNodes: _filterNavigatorNodes,
        hasLoadedWorkspaceModel: _hasLoadedWorkspaceModel,
        getNavigatorSiteLabel: _getNavigatorSiteLabel,
        getObjectTypeLabel: _getObjectTypeLabel,
        renderTree: _renderTree,
        renderContextPanel: _renderContextPanel,
        dispatchContextChanged: _dispatchContextChanged,
    });
}

/**
 * @param {any} origin
 */
function _renderContextPanel( origin: string) {
    // Corpo extraído p/ homeGrid/homeContextRender (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderContextPanelModule(origin, {
        t,
        DOMAIN_DEFS,
        getActiveDomain: () => _activeDomain,
        getActiveObjectType: () => _activeObjectType,
        getActiveObjectId: () => _activeObjectId,
        getShellRightEl: () => _shellRightEl,
        renderBreadcrumb: _renderBreadcrumb,
        renderActionsRelationsPanel: _renderActionsRelationsPanel,
    });
}

/**
 * @param {any} origin
 */
function _dispatchContextChanged( origin: string) {
    _persistLastObjectContext();
    window.dispatchEvent(
        new CustomEvent('context:changed', {
            detail: {
                scopeKind: _activeScopeKind,
                orgId: _activeOrgId,
                modelSource: _activeModelSource,
                modelId: _activeModelId,
                laneId: _activeLaneId,
                snapshotId: _activeSnapshotId,
                domainId: _activeDomain,
                objectId: _activeObjectId,
                objectType: _activeObjectType,
                tabId: 'actions',
                origin,
            },
        }),
    );
}

function _getTreeNodes() {
    const elements = _safeGetElements();
    const campaigns = _safeGetCampaigns();
    const signature = buildNavigatorTreeSignature({ activeModelId: _activeModelId || getModelIdSync(), activeModelLabel: _activeModelLabel, activeSnapshotId: _activeSnapshotId, elements, campaigns });
    if (_lastTreeNodesSignature === signature) return _lastTreeNodes;
    _lastTreeNodesSignature = signature;
    _lastTreeNodes = _buildLoadedModelNavigatorNodes();
    return _lastTreeNodes;
}

/**
 * @param {any} origin
 */
function _renderContextualMain( origin: string) {
    // Corpo extraído p/ homeGrid/homeContextRender (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderContextualMainModule(origin, {
        t,
        DOMAIN_DEFS,
        getActiveDomain: () => _activeDomain,
        getActiveObjectType: () => _activeObjectType,
        getActiveObjectId: () => _activeObjectId,
        getContextToolbarEl: () => _contextToolbarEl,
        getContextSurfaceEl: () => _contextSurfaceEl,
        getActiveObjectLabel: _getActiveObjectLabel,
        getObjectTypeLabel: _getObjectTypeLabel,
        getActionsForType: _getActionsForType,
        originToLabel: _originToLabel,
    });
}

function _renderBreadcrumb() {
    // Corpo extraído p/ homeGrid/homeContextRender (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderBreadcrumbModule({
        t,
        DOMAIN_DEFS,
        getActiveDomain: () => _activeDomain,
        getActiveObjectType: () => _activeObjectType,
        getActiveObjectId: () => _activeObjectId,
        getBreadcrumbEl: () => _breadcrumbEl,
        getActiveNavigatorPathLabels: _getActiveNavigatorPathLabels,
        getNavigatorSiteLabel: _getNavigatorSiteLabel,
    });
}

function _getActiveNavigatorPathLabels() {
    // Decisão PURA (walk root→leaf via parentId) extraída p/
    // homeGrid/_navigatorPathPure (ARCH-SPLIT-HOMEGRID-001); aqui só o estado
    // de módulo (`_activeObjectId`) + a fonte da árvore (`_getTreeNodes`). O
    // consumidor (homeContextRender) apenas LÊ a lista — cast no boundary.
    return _resolveNavigatorPathLabelsPure(_getTreeNodes(), _activeObjectId);
}

/**
 * @param {any} mode
 */
function _applyViewToggle( mode: string, { syncScene = true, emit = true }: { syncScene?: boolean; emit?: boolean } = {}) {
    const resolvedMode = mode || '3d';
    _activeViewMode = resolvedMode;
    if (_viewToggleEl) {
        for (const btn of _viewToggleEl.querySelectorAll('[data-mode]')) {
            const active = btn.getAttribute('data-mode') === resolvedMode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    }
    if (syncScene && typeof window.handleSwitchView === 'function') {
        window.handleSwitchView(resolvedMode);
    }
    if (emit) {
        window.dispatchEvent(new CustomEvent('viewmode:changed', { detail: { mode: resolvedMode } }));
    }
}

/**
 * @param {any} objectType
 */
/**
 * @param {any} objectType
 * @returns {readonly any[]}
 */
function _getActionsForType( objectType: unknown): readonly any[] {
    // Corpo extraído p/ homeGrid/_objectActionsPure (ARCH-SPLIT-HOMEGRID-001).
    // O módulo puro devolve ReadonlyArray<ObjectAction> (imutável); o legado e o
    // consumidor (homeContextRender) usam any[] e apenas LEEM — cast no boundary.
    return _getActionsForTypePure(objectType);
}

function _getActiveObjectLabel() {
    if (!_activeObjectId) return 'Nenhum objeto selecionado';
    const node = _getTreeNodes().find((item: any) => item.id === _activeObjectId);
    return node?.label || _activeObjectId;
}

function _persistLastObjectContext() {
    // Payload puro (mesma ordem/nomes de chave) montado em
    // homeGrid/_lastObjectContextPure (ARCH-SPLIT-HOMEGRID-001); aqui só o I/O.
    try {
        const payload = _buildLastObjectContext({
            scopeKind: _activeScopeKind,
            orgId: _activeOrgId,
            modelSource: _activeModelSource,
            modelId: _activeModelId,
            modelLabel: _activeModelLabel,
            laneId: _activeLaneId,
            snapshotId: _activeSnapshotId,
            domainId: _activeDomain,
            objectId: _activeObjectId,
            objectType: _activeObjectType,
        });
        localStorage.setItem(LS_LAST_OBJECT_CONTEXT, JSON.stringify(payload));
    } catch (e: unknown) {
        console.debug('[homeGrid] persistLastObjectContext:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
}

function _restoreLastObjectContext() {
    if (_activeDomain || _activeObjectId || _activeModelId || _activeSnapshotId) return;
    try {
        const raw = localStorage.getItem(LS_LAST_OBJECT_CONTEXT) || '';
        if (!raw) return;
        const parsed = JSON.parse(raw);
        // Coerção pura por-campo (só aceita string; senão mantém o fallback vivo)
        // extraída p/ homeGrid/_lastObjectContextPure (ARCH-SPLIT-HOMEGRID-001).
        const next = _coerceLastObjectContext(parsed, {
            scopeKind: _activeScopeKind,
            orgId: _activeOrgId,
            modelSource: _activeModelSource,
            modelId: _activeModelId,
            modelLabel: _activeModelLabel,
            laneId: _activeLaneId,
            snapshotId: _activeSnapshotId,
            domainId: _activeDomain,
            objectId: _activeObjectId,
            objectType: _activeObjectType,
        });
        _activeScopeKind = next.scopeKind;
        _activeOrgId = next.orgId;
        _activeModelSource = next.modelSource;
        _activeModelId = next.modelId;
        _activeModelLabel = next.modelLabel;
        _activeLaneId = next.laneId;
        _activeSnapshotId = next.snapshotId;
        _activeDomain = next.domainId;
        _activeObjectId = next.objectId;
        _activeObjectType = next.objectType;
    } catch (e: unknown) {
        console.debug('[homeGrid] restoreLastObjectContext:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
}

// ARCH-SPLIT-HOMEGRID-001 (actions-probe slice): _collectActionsProbeLocalStorage,
// _captureActionsProbeMetrics(Pure) e _waitForActionsProbeLayoutSettle foram movidos
// para ./homeGrid/_actionsProbe.ts (importados via barrel). Aqui fica só o wrapper
// fino que injeta os refs de elementos do shell (getters) — comportamento idêntico.
function _captureActionsProbeMetrics() {
    return _captureActionsProbeMetricsPure({
        getShellRoot: () => _shellRootEl,
        getShellLeft: () => _shellLeftEl,
        getShellMain: () => _shellMainEl,
        getShellRight: () => _shellRightEl,
        getWorkspaceSection: () => _workspaceSectionEl,
        getInspectorPanel: () => _inspectorPanelEl,
    });
}

async function _exportActionsProbeState() {
    const { buildModel } = await import('../../core/io/export.js' as string);
    let lastObjectContext: any;
    try {
        lastObjectContext = JSON.parse(localStorage.getItem(LS_LAST_OBJECT_CONTEXT) || 'null');
    } catch (e: unknown) {
        console.debug('[homeGrid] parseLastObjectContext:', (e as { message?: string } | null)?.message || e);
        lastObjectContext = null;
    }

    await _waitForActionsProbeLayoutSettle({ forceRebuild: true });

    return {
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        localStorage: _collectActionsProbeLocalStorage(),
        appState: {
            activeScopeKind: _activeScopeKind,
            activeOrgId: _activeOrgId,
            activeDomain: _activeDomain,
            activeObjectId: _activeObjectId,
            activeObjectType: _activeObjectType,
            activeModelSource: _activeModelSource,
            activeModelId: _activeModelId,
            activeModelLabel: _activeModelLabel,
            activeLaneId: _activeLaneId,
            activeSnapshotId: _activeSnapshotId,
            activeViewMode: _activeViewMode,
            actionsSideView: _actionsSideView,
            workspaceFooterExpanded: _workspaceFooterExpanded,
            featureFlags: { ..._featureFlags },
            layout: (() => {
                const layoutState = _actionsShellLayout.getLayoutState();
                return layoutState ? { ...layoutState } : null;
            })(),
            activeConstellationTab: getActiveConstellationTab?.() || 'graph',
            lastObjectContext,
        },
        metrics: _captureActionsProbeMetrics(),
        model: buildModel(),
    };
}

/**
 * @param {any} [payload]
 * @param {any} [options]
 */
async function _applyActionsProbeState( payload: any = {}, options: any = {}) {
    const { switchToActions = true } = options || {};

    if (payload?.localStorage && typeof payload.localStorage === 'object') {
        try {
            Object.entries(payload.localStorage).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    localStorage.setItem(key, value);
                }
            });
        } catch (e: unknown) {
            console.debug('[homeGrid] restoreActionsProbeLocalStorage:', (e as { message?: string } | null)?.message || e);
            /* no-op */
        }
    }

    if (payload?.model && typeof payload.model === 'object') {
        await applyModel(payload.model);
    }

    const state = (payload?.appState || {}) as any;
    _activeScopeKind = typeof state.activeScopeKind === 'string' ? state.activeScopeKind : _activeScopeKind;
    _activeOrgId = typeof state.activeOrgId === 'string' ? state.activeOrgId : _activeOrgId;
    _activeModelSource = typeof state.activeModelSource === 'string' ? state.activeModelSource : _activeModelSource;
    _activeModelId = typeof state.activeModelId === 'string' ? state.activeModelId : _activeModelId;
    _activeModelLabel = typeof state.activeModelLabel === 'string' ? state.activeModelLabel : _activeModelLabel;
    _activeLaneId = typeof state.activeLaneId === 'string' ? state.activeLaneId : _activeLaneId;
    _activeSnapshotId = typeof state.activeSnapshotId === 'string' ? state.activeSnapshotId : _activeSnapshotId;
    _activeViewMode = typeof state.activeViewMode === 'string' ? state.activeViewMode : _activeViewMode;
    _actionsSideView = state.actionsSideView === 'navigator' ? 'navigator' : 'inspector';
    _workspaceFooterExpanded = state.workspaceFooterExpanded === true;
    if (state.featureFlags && typeof state.featureFlags === 'object') {
        _featureFlags = { ...DEFAULT_ACTIONS_FLAGS, ...state.featureFlags };
    } else {
        _resolveActionsFeatureFlags();
    }

    if (switchToActions && typeof window.switchGroup === 'function') {
        await (window as any).switchGroup('actions', { skipAuthGate: true });
    }

    _activeDomain = typeof state.activeDomain === 'string' ? state.activeDomain : _activeDomain;
    _activeObjectId = typeof state.activeObjectId === 'string' ? state.activeObjectId : _activeObjectId;
    _activeObjectType = typeof state.activeObjectType === 'string' ? state.activeObjectType : _activeObjectType;

    _renderWorkspaceSection();
    _renderEmbeddedInspector();
    _setActiveDomain(_activeDomain || 'monitoring', 'probe-replay', { preserveObject: !!_activeObjectId });

    if (state.layout && typeof state.layout === 'object') {
        _actionsShellLayout.applyLayout(state.layout, { persist: true, syncGraph: false });
    } else {
        _actionsShellLayout.refreshLayout();
    }

    _updateDynamic();
    _renderActionsRelationsPanel(_shellRightEl);
    _scheduleConstellationLayoutSync(true);
    await _waitForActionsProbeLayoutSettle({ forceRebuild: true });

    return _captureActionsProbeMetrics();
}

function _installActionsProbe() {
    if (typeof window === 'undefined') return;
    window.__ecbytsActionsProbe = {
        exportState: _exportActionsProbeState,
        applyState: _applyActionsProbeState,
        captureMetrics: _captureActionsProbeMetrics,
    };
}

function _resolveActionsFeatureFlags() {
    // Merge puro (defaults < persisted[stable] < window override) extraído p/
    // homeGrid/_featureFlagsPure (ARCH-SPLIT-HOMEGRID-001). Aqui ficam só os dois
    // I/Os (localStorage + window) com seus try/catch; a precedência é idêntica.
    let persisted: any = null;
    try {
        const raw = localStorage.getItem(LS_FEATURE_FLAGS) || '';
        if (raw) persisted = JSON.parse(raw);
    } catch (e: unknown) {
        console.debug('[homeGrid] featureFlags-localStorage:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
    let windowOverride: any = null;
    try {
        if (window.__ECBYTS_FEATURE_FLAGS && typeof window.__ECBYTS_FEATURE_FLAGS === 'object') {
            windowOverride = window.__ECBYTS_FEATURE_FLAGS;
        }
    } catch (e: unknown) {
        console.debug('[homeGrid] featureFlags-window:', (e as { message?: string } | null)?.message || e);
        /* no-op */
    }
    _featureFlags = _mergeActionsFeatureFlags({
        defaults: DEFAULT_ACTIONS_FLAGS,
        stableKeys: { shellKey: FEATURE_KEYS.SHELL, z4ContextKey: FEATURE_KEYS.Z4_CONTEXT },
        persisted,
        windowOverride,
    }) as any;
}

/**
 * @param {any} capability
 */
function _canUseCapability( capability: any) {
    // Decisão pura (tier/subscription → premium → capability) extraída p/
    // homeGrid/_capabilityPure (ARCH-SPLIT-HOMEGRID-001). Aqui só fica o I/O da
    // sessão; o cálculo é byte-idêntico ao legado.
    return _resolveCapabilityPure((getCurrentUser()) as any, capability);
}

/**
 * @param {any} metric
 * @param {any} context
 */
function _trackActionsPremiumUsage( metric: any, context: any) {
    import('../../core/metering/quota.js' as string)
        .then(({ recordUsage }: any) => {
            recordUsage(metric, 1, { source: 'actions-v2', ...(context || {}) });
        })
        .catch((e: unknown) => console.debug('[homeGrid:premium-usage]', (e as { message?: string } | null)?.message || e));
}

function _renderPremiumPanels() {
    // Corpo extraído p/ homeGrid/homePremiumPanels (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    renderPremiumPanels({
        featureFlags: _featureFlags,
        featureKeys: FEATURE_KEYS,
        canUseCapability: _canUseCapability,
        graphPanelEl: _graphPanelEl,
        aiPanelEl: _aiPanelEl,
        getActiveObjectId: () => _activeObjectId,
        trackPremiumUsage: _trackActionsPremiumUsage,
    });
}


function _syncGridRows() {
    import('./panelManager.js' as string)
        .then(({ rebuildGridRows }: any) => {
            rebuildGridRows();
        })
        .catch((_e: unknown) => console.debug('[utils/ui/homeGrid:silent-catch]', (_e as { message?: string } | null)?.message || _e));
}

/** @returns {any[]} */
function _safeGetElements() {
    try {
        return getAllElements();
    } catch {
        return [];
    }
}

/** @returns {any[]} */
function _safeGetCampaigns() {
    try {
        return getAllCampaigns();
    } catch {
        return [];
    }
}

function _renderHeader() {
    // Corpo extraído p/ homeGrid/homeHeader (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    const hasData = _safeGetElements().length > 0;
    _renderHomeHeader(_headerEl, { t, hasData });
}

function _renderStats() {
    if (!_statsEl) return;
    // V3: when hero KPIs flag is on, legacy stats are replaced by the
    // V3 hero (EIS/VPL/PDPLU/Compliance). Short-circuit every render
    // to survive re-renders that would otherwise wipe display:none.
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) {
        _statsEl.style.display = 'none';
        _statsEl.innerHTML = '';
        return;
    }

    const elements = _safeGetElements();
    const campaigns = _safeGetCampaigns();
    const lastSave = _getLastSave();

    // D20: completeness score — lógica pura em _homeStatsPure (S4 split).
    const check = elements.length > 0 || campaigns.length > 0 ? computeCompleteness() : null;
    const stats = _buildStatCards({
        elementsCount: elements.length,
        campaignsCount: campaigns.length,
        completeness: check ? { score: check.score, total: check.total } : null,
        lastSaveLabel: lastSave,
    });

    // Render-from-data extraído p/ homeGrid/_renderSections (ARCH-SPLIT-HOMEGRID-001
    // render slice). Wrapper fino injeta o tradutor; DOM/innerHTML idêntico ao legado.
    _renderHomeStatsModule(_statsEl, stats, { t });
}

function _renderFlowStatus() {
    // ACTIONS-FLOW-001 FS-4 — corpo extraído p/ homeGrid/flowStatusSection.
    // FS-2 — wiring do ÚNICO sinal real disponível hoje: getExports lê o store
    // síncrono de relatórios (getAllReports) e decide se há conteúdo real via
    // hasGeneratedReportContent (mesma regra do exportReport no manager). Os
    // outros 3 getters (getPipelineRuns/getResolvedFindings/getShares) não têm
    // fonte síncrona honesta hoje — permanecem undefined (default conservador).
    _renderFlowStatusSectionModule(_flowStatusEl, {
        getElements: _safeGetElements,
        getCampaigns: _safeGetCampaigns,
        t,
        getExports: () => _hasGeneratedReportContent(getAllReports()),
    });
}

function _renderSuggested() {
    // Corpo extraído p/ homeGrid/homeSuggested (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    // _renderSuggestedSuccess foi internalizada no módulo (era só uso interno).
    renderHomeSuggested(_suggestedEl, {
        t,
        computeCompleteness,
        getElements: _safeGetElements,
        bootPreparingRandom: _bootPreparingRandom,
        onAction: _executeHandler,
    });
}

/**
 * Get ordered, visible cards based on customize config.
 * @returns {any[]} Filtered and ordered ACTION_CARDS
 */
function _getVisibleOrderedCards() {
    // Delegates to the gridCards pure slice (ARCH-SPLIT-HOMEGRID-001 S5) —
    // comportamento IDÊNTICO ao legado (compõe filterOrderCards).
    return _resolveCardList({ cards: ACTION_CARDS as any, config: getHomeCardsConfig() as any });
}

function _renderCards() {
    if (!_gridEl) return;
    const cards = _getVisibleOrderedCards();
    _lastCardHash = cards.map((c: any) => c.id).join(',');

    _gridEl.innerHTML = '';

    // Group cards by category — lógica pura em _homeCardsPure (S5 split).
    const sections = _groupCardsByCategory(cards, {
        primary: t('homeCatPrimary') || 'View',
        data: t('homeCatData') || 'Data & Analysis',
        management: t('homeCatManagement') || 'Management',
        settings: t('homeCatSettings') || 'Settings',
    });

    // Render sections + cards — corpo extraído p/ homeGrid/homeCards (S5-runtime).
    const missingHandlers = _renderHomeCardSections(_gridEl, sections, {
        t,
        hasHandler: _hasHandler,
        onCardClick: _onCardClick,
        buildCardElement: _buildHomeCardElement,
    });

    if (missingHandlers.length > 0) {
        console.warn('[ecbyts:home] Missing handlers for cards:', missingHandlers);
    }

    // Hydrate SVG icons (available after registerAllHandlers)
    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons();
    }
}

/**
 * @param {any} card
 */
async function _onCardClick( card: any) {
    console.debug(
        `%c[HOME CLICK] card="${card.id}" handler="${card.handler || ''}" viewTarget="${card.viewTarget || ''}"`,
        'color:#00c853;font-weight:bold',
    );

    // Invite gate: require auth before any action in invite-only mode
    try {
        const { requireAuth } = await import('../auth/inviteGate.js' as string);
        if (requireAuth()) {
            console.warn(`[HOME CLICK] BLOCKED by invite gate — card="${card.id}"`);
            return;
        }
    } catch (e: unknown) {
        console.debug('[homeGrid] inviteGateImport:', (e as { message?: string } | null)?.message || e);
        /* inviteGate not available = no gate */
    }

    const mappedDomain = (CARD_DOMAIN_MAP as Record<string, string>)[card.id];
    if (mappedDomain) _setActiveDomain(mappedDomain, 'card');

    import('../telemetry/tracker.js' as string)
        .then(({ trackEvent }: any) => {
            trackEvent('click', card.id, { source: 'home-card' });
        })
        .catch((_e: unknown) => console.debug('[utils/ui/homeGrid:silent-catch]', (_e as { message?: string } | null)?.message || _e));

    if (card.viewTarget) {
        if (typeof window.handleSwitchView === 'function') {
            console.debug(`[HOME CLICK] -> switchView("${card.viewTarget}")`);
            window.handleSwitchView(card.viewTarget);
        } else {
            console.error(`[HOME CLICK] handleSwitchView NOT FOUND`);
        }
    } else {
        _executeHandler(card.handler);
    }
}

/**
 * @param {any} handlerName
 */
function _executeHandler( handlerName: any) {
    if (!handlerName) return;
    console.debug(
        `[HOME CLICK] -> executeHandler("${handlerName}") exists=${typeof (window as any)[handlerName] === 'function'}`,
    );
    if (typeof (window as any)[handlerName] === 'function') {
        try {
            (window as any)[handlerName]();
        } catch (e: unknown) {
            console.error(`[ecbyts:home] Handler ${handlerName} failed:`, (e as { message?: string } | null)?.message);
        }
    } else {
        console.warn(`[ecbyts:home] Handler not found: ${handlerName}`);
    }
}

/**
 * @param {any} handlerName
 */
function _hasHandler( handlerName: any) {
    return !!handlerName && typeof window[handlerName] === 'function';
}

function _renderBootState() {
    // Corpo extraído p/ homeGrid/homeBootState (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    _renderHomeBootState(_bootStateEl, _bootPreparingRandom, { t });
}

function _computeSuggestion() {
    // Lógica pura extraída p/ homeGrid/_gridStatsPure (ARCH-SPLIT-HOMEGRID-001 S4).
    // Comportamento idêntico ao computeHomeSuggestion legado: gap de maior
    // prioridade, ou o fallback de exportação quando não há gaps.
    return _resolveSuggestedAction(computeCompleteness(), t('homeSuggestExport') || 'Export your model for sharing');
}

/**
 * D20: Completeness Checker - analisa o modelo e retorna gaps.
 * Usado pelo home grid (sugestao) e pelo toast pos-import.
 *
 * @returns {{ score: number, total: number, gaps: Array<{id: string, msg: string, handler: string, severity: 'info'|'warning'}> }}
 */
export function computeCompleteness() {
    // VISION-UX-001 RF-1 dedup (claude - adm 2026-06-14, dono da frente de
    // qualidade): a cópia de ~110 LOC foi removida — delega ao helper único
    // homeCompletenessHelpers.computeCompleteness (testado: home-completeness-
    // coords.test.mjs). Quita a dívida de duplicação anotada no RF-1 e reduz
    // o monolito homeGrid. Output idêntico (6 critérios verificados linha-a-linha).
    return _computeCompletenessHelper({
        getElements: _safeGetElements,
        getCampaigns: _safeGetCampaigns,
        t,
    });
}

/**
 * V2 F7: traduz origem técnica ('init', 'tree', ...) para label
 * amigável. Se não houver mapeamento, retorna o próprio código -
 * comportamento seguro para origens novas.
 * @param {string} origin
 * @returns {string}
 */
function _originToLabel( origin: unknown) {
    // Mapa PURO extraído p/ homeGrid/_originLabelPure (byte-idêntico); o tradutor
    // i18n `t` é injetado. Origem desconhecida → devolve o próprio código.
    return _originToLabelPure(origin, t);
}

/**
 * @param {any} objectType
 */
function _getObjectTypeLabel( objectType: unknown) {
    // Mapa PURO extraído p/ homeGrid/_objectTypeLabelPure (byte-idêntico).
    return _getObjectTypeLabelPure(objectType);
}

function _getLastSave() {
    // I/O aqui; parse + bucketing relativo é puro em homeGrid/_lastSaveLabelPure.
    const labels = { never: t('home.lastSave.never') || 'Never saved', justNow: t('homeJustNow') || 'Just now' };
    try {
        const ts = localStorage.getItem('ecbyts-last-save') || '';
        return _formatLastSaveLabel({ timestamp: ts, now: Date.now(), labels });
    } catch {
        return labels.never;
    }
}

/**
 * @param {any} userId
 */
function _resetReputationCacheForUser( userId: unknown) {
    if (_reputationCacheUserId === userId) return;
    _reputationCacheUserId = userId;
    _reputationCache = null;
    _reputationFetchedAt = 0;
    _reputationInFlight = null;
}

/**
 * @param {any} userId
 */
function _resetMarketplaceCacheForUser( userId: unknown) {
    if (_marketplaceCacheUserId === userId) return;
    _marketplaceCacheUserId = userId;
    _marketplaceCache = null;
    _lastDataFetch = 0;
    _marketplaceInFlight = null;
}

/**
 * @param {any} userId
 */
async function _ensureReputationData( userId: any) {
    if (!userId) return { profile: null, badges: [] };

    // Decisão pura compartilhada (frescor de cache + reset por troca de usuário) —
    // espelha o fluxo inline legado: reset → cache fresco → in-flight → fetch.
    const v = decideDataFreshness({ requestedUserId: userId, cacheUserId: _reputationCacheUserId, hasCache: !!_reputationCache, fetchedAt: _reputationFetchedAt, now: Date.now(), ttl: DATA_CACHE_TTL, inFlightUserId: _reputationInFlight?.userId });
    if (v.resetCache) _resetReputationCacheForUser(userId);
    if (v.action === 'serve_cache') return _reputationCache;
    if (v.action === 'join_in_flight') return _reputationInFlight.promise;

    const promise = Promise.all([fetchCreatorProfile(userId), getUserBadges(userId).catch(() => [])])
        .then(([profile, badges]) => {
            const result = {
                profile: profile || null,
                badges: Array.isArray(badges) ? badges : [],
            };
            if (_reputationCacheUserId === userId) {
                _reputationCache = result;
                _reputationFetchedAt = Date.now();
            }
            return result;
        })
        .finally(() => {
            if (_reputationInFlight?.userId === userId) {
                _reputationInFlight = null;
            }
        });

    _reputationInFlight = { userId, promise };
    return promise;
}

/**
 * @param {any} userId
 */
async function _ensureMarketplaceData( userId: any) {
    if (!userId) return { activity: [], myLibs: [] };

    // Decisão pura compartilhada (frescor de cache + reset por troca de usuário) —
    // espelha o fluxo inline legado: reset → cache fresco → in-flight → fetch.
    const v = decideDataFreshness({ requestedUserId: userId, cacheUserId: _marketplaceCacheUserId, hasCache: !!_marketplaceCache, fetchedAt: _lastDataFetch, now: Date.now(), ttl: DATA_CACHE_TTL, inFlightUserId: _marketplaceInFlight?.userId });
    if (v.resetCache) _resetMarketplaceCacheForUser(userId);
    if (v.action === 'serve_cache') return _marketplaceCache;
    if (v.action === 'join_in_flight') return _marketplaceInFlight.promise;

    const promise = Promise.all([fetchActivityFeed(10), getMyPublishedLibraries()])
        .then(([activity, myLibs]) => {
            const result = {
                activity: Array.isArray(activity) ? activity : [],
                myLibs: Array.isArray(myLibs) ? myLibs : [],
            };
            if (_marketplaceCacheUserId === userId) {
                _marketplaceCache = result;
                _lastDataFetch = Date.now();
            }
            return result;
        })
        .finally(() => {
            if (_marketplaceInFlight?.userId === userId) {
                _marketplaceInFlight = null;
            }
        });

    _marketplaceInFlight = { userId, promise };
    return promise;
}

// --- Community Impact Section ---

async function _renderCommunityImpact() {
    // Corpo extraído p/ homeGrid/homeCommunityPanels (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    await _renderCommunityImpactModule(_impactEl, {
        getCache: () => _communityImpactCache,
        getFetchedAt: () => _communityImpactFetchedAt,
        setCache: (v: any) => {
            _communityImpactCache = v;
        },
        setFetchedAt: (v: any) => {
            _communityImpactFetchedAt = v;
        },
        cacheTtl: DATA_CACHE_TTL,
    });
}

// --- Reputation Section ---

async function _renderReputation() {
    // Corpo extraído p/ homeGrid/homeCommunityPanels (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    await _renderReputationModule(_reputationEl, {
        getCurrentUser,
        ensureReputationData: _ensureReputationData,
        getReputationLevel: _getReputationLevel,
        getNextLevel: _getNextLevel,
        getCredentialLabel: _getCredentialLabel,
    });
}

// Reputation tier ladder + level/next-level/credential resolvers — agora reusam
// o módulo puro já existente _homeReputationPure (extraído na Wave UUUU1). O
// bloco inline duplicado (REPUTATION_TIERS + 3 funções) que vivia aqui foi
// removido: o monolito mantinha uma cópia morta paralela ao módulo puro. Os
// wrappers abaixo apenas resolvem os rótulos i18n via t() sobre a meta pura,
// preservando comportamento IDÊNTICO ao bloco original (ARCH-SPLIT-HOMEGRID-001
// slice de progresso, claude - refactor 2026-06-18).
/**
 * @param {any} score
 */
function _getReputationLevel( score: unknown) {
    const meta = _getReputationLevelMeta(score);
    return { class: meta.class, label: t(meta.i18nKey) || meta.fallback, min: meta.min };
}

/**
 * @param {any} score
 */
function _getNextLevel( score: unknown) {
    // Comportamento original: score não-numérico (NaN) → null (o módulo puro
    // clampa NaN→0 e devolveria 'rising'; preservamos a semântica antiga aqui).
    if (typeof score !== 'number' || !Number.isFinite(score)) return null;
    const meta = _getNextLevelMeta(score);
    if (!meta) return null;
    return { threshold: meta.threshold, label: t(meta.i18nKey) || meta.fallback };
}

/**
 * @param {any} level
 */
function _getCredentialLabel( level: unknown) {
    const meta = _getCredentialLabelMeta(level);
    return t(meta.i18nKey) || meta.fallback;
}

// --- Personal Identity Section ---

async function _renderPersonalIdentity() {
    // Corpo extraído p/ homeGrid/homeProfilePanels (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    return _renderPersonalIdentityModule(_personalIdentityEl, {
        t,
        getCurrentUser,
        getContainer: () => _personalIdentityEl,
        ensureReputationData: _ensureReputationData,
        onAction: (handlerName: string) => {
            if (typeof (window as any)[handlerName] === 'function') {
                (window as any)[handlerName]();
            }
        },
    });
}

// --- Marketplace Activity Section ---

async function _renderMarketplaceActivity() {
    // Corpo extraído p/ homeGrid/homeProfilePanels (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
    return _renderMarketplaceActivityModule(_marketplaceEl, {
        t,
        getCurrentUser,
        getContainer: () => _marketplaceEl,
        ensureMarketplaceData: _ensureMarketplaceData,
        onAction: () => {},
    });
}


/** @param {any} type */
// _getActivityIcon / _formatActivity / _formatTimeAgo movidos p/
// homeGrid/homeProfilePanels (ARCH-SPLIT-HOMEGRID-001 S5-runtime).
