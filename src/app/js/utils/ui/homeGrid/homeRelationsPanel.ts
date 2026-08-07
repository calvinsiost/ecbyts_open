// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * HomeGrid — Actions shell "Relations" panel (substitui o constellation hosted).
 *
 * Decisão Calvin 2026-06-02 (SPEC_BUGFIX_ACTIONS_SHELL_CONSOLE BUG-1).
 * SPEC_SUNBURST_REDESIGN_001 (Calvin 2026-06-06):
 *  - Paleta canônica Tableau-10 + severity outline
 *  - Toggle "Sunburst | Árvore" persistente
 *  - Zoom + breadcrumb (focusedId state)
 *  - Centro inteligente (contagem filhos)
 *  - Tooltip DOM on hover
 *  - Tree-vertical pure-logic alternativo
 */

import { getSelectedElement, getAllElements, getElementById, setSelectedElement } from '../../../core/elements/manager.js';
import { getAllEdges } from '../../edges/manager.js';
import { getEdgeType } from '../../edges/types.js';
import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';
import { computeElementCompliance, computeParameterSeverities } from '../../../core/elements/complianceOverlay.js';
import { getAllCampaigns } from '../../../core/campaigns/manager.js';
import { computeGraphMetrics } from '../../../core/analytics/graphMetrics.js';
import { buildGraphKpiStripVM, resolveStripWorstTone } from './_relationsKpiPure.js';
import { buildParameterChildNodes } from './_parameterExpansionPure.js';
import { buildGraphKpiExport } from './_graphKpiExportPure.js';
import { exportCsv, csvDateSuffix } from '../../helpers/csvExport.js';
import { showToast } from '../toast.js';
import { PARAMETERS } from '../../../config/parameters.js';
import {
    resolveCampaignNavState,
    stepCampaignIndex,
    aggregationFactorLabelKey,
    AGGREGATION_FACTORS,
    DEFAULT_AGGREGATION,
    type AggregationFactor,
} from '../../../core/analytics/_campaignAggregationPure.js';
import {
    computeSunburstLayout,
    hitTestSlice,
    sliceMidpoint,
    familyColor,
    severityStrokeColor,
    severityRank,
    type SunburstNode,
    type SunburstLayout,
    type SliceSeverity,
} from './_relationsSunburstLayout.js';
import { computeTreeLayout, severityDotColor } from './_relationsTreeLayout.js';
import { buildCriticalBadgeVM } from './_relationsBadgePure.js';
import { buildSeverityLegend } from './_relationsLegendPure.js';
import { pruneTreeForDisplay, resolveMaxChildrenForWidth } from './_relationsCollapsePure.js';
import { reserveSeverityRed } from './_relationsNodeColorPure.js';
import { buildNodeTooltipVM } from './_relationsTooltipPure.js';
import { CONFIG } from '../../../config.js';
import {
    computeTierGraphLayout,
    // eslint-disable-next-line
    hitTestTierGraph,
    type TierGraphLayout,
} from './_relationsTierGraphLayout.js';
import {
    computeBoxTreeLayout,
    hitTestBox,
    boxSeverityColor,
    type BoxTreeLayout,
    type BoxTreeSeverity,
} from './_relationsBoxTreeLayout.js';

let _shellRightEl: any = null;
let _abortController: AbortController | null = null;

// Calvin 2026-06-07: 3ª vista "Diagrama" (boxes top-down Reingold-Tilford simplificado)
// adicionada como complemento ao Sunburst (radial) + Árvore (indented list).
type RelationsViewMode = 'sunburst' | 'tree' | 'diagram';
const VIEW_MODE_KEY = 'ecbyts-relations-view-mode';
let _viewMode: RelationsViewMode = (() => {
    try {
        if (typeof localStorage === 'undefined') return 'sunburst';
        const v = localStorage.getItem(VIEW_MODE_KEY);
        if (v === 'tree') return 'tree';
        if (v === 'diagram') return 'diagram';
        return 'sunburst';
    } catch (e: any) {
        console.debug('[relations:viewMode:init]', e?.message || e);
        return 'sunburst';
    }
})();
let _focusedId: string | null = null;
let _focusStack: Array<{ id: string; name: string }> = [];
// RELATIONS-UX-001: id do elemento selecionado a destacar quando o grafo nasce
// com o modelo completo (máximo de elementos). null = sem destaque.
let _highlightId: string | null = null;

// GRAPH-KPI-001 (Calvin 2026-06-14): navegação "<"/">" entre campanhas no mesmo
// gráfico + agregação por fator. Índice = nº de campanhas → "Todas (agregado)".
const CAMPAIGN_IDX_KEY = 'ecbyts-relations-campaign-idx';
const AGG_FACTOR_KEY = 'ecbyts-relations-agg-factor';
const KPI_COLLAPSED_KEY = 'ecbyts-relations-kpi-collapsed';
let _campaignIndex: number = (() => {
    try {
        const v = typeof localStorage !== 'undefined' ? localStorage.getItem(CAMPAIGN_IDX_KEY) : null;
        const n = v == null ? NaN : parseInt(v, 10);
        return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER; // default: "Todas"
    } catch {
        return Number.MAX_SAFE_INTEGER;
    }
})();
let _aggFactor: AggregationFactor = (() => {
    try {
        const v = typeof localStorage !== 'undefined' ? localStorage.getItem(AGG_FACTOR_KEY) : null;
        return v && (AGGREGATION_FACTORS as readonly string[]).includes(v) ? (v as AggregationFactor) : DEFAULT_AGGREGATION;
    } catch {
        return DEFAULT_AGGREGATION;
    }
})();
let _kpiCollapsed: boolean = (() => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(KPI_COLLAPSED_KEY) === '1';
    } catch {
        return false;
    }
})();

// GRAPH-KPI-001 F2: expandir o grafo por parâmetro monitorado (drill element →
// parâmetros). Cada elemento-folha com observações ganha nós-parâmetro.
const EXPAND_PARAM_KEY = 'ecbyts-relations-expand-param';
let _expandByParameter: boolean = (() => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(EXPAND_PARAM_KEY) === '1';
    } catch {
        return false;
    }
})();

// GRAPH-KPI-001 F3 (Calvin: "ver essa tela em modo tela cheia"). Transiente
// (não persiste) — toma o viewport via class no shell. Esc fecha.
let _isFullscreen = false;

/** Resolve parameterId → nome legível via catálogo CONFIG.PARAMETERS. */
const _paramNameMap: Map<string, string> = (() => {
    const m = new Map<string, string>();
    try {
        for (const p of (PARAMETERS as any[]) || []) {
            if (p?.id) m.set(String(p.id), String(p.name || p.id));
        }
    } catch (e: any) {
        console.debug('[relations:paramNameMap]', e?.message || e);
    }
    return m;
})();
function _paramName(parameterId: string): string {
    return _paramNameMap.get(parameterId) || parameterId;
}

function _setViewMode(mode: RelationsViewMode) {
    _viewMode = mode;
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch (e: any) {
        console.debug('[relations:viewMode:set]', e?.message || e);
    }
}

function tr(key: string, fallback: string): string {
    try {
        const v = t(key);
        return v && v !== key ? v : fallback;
    } catch (e: any) {
        console.debug('[relations:tr]', e?.message || e);
        return fallback;
    }
}

// ----------------------------------------------------------------
// GRAPH-KPI-001 — escopo temporal (campanha + agregação) + controles
// ----------------------------------------------------------------
function _navState() {
    return resolveCampaignNavState(getAllCampaigns() || [], _campaignIndex, {
        allLabel: tr('actionsRelations.campaignAll', 'Todas (agregado)'),
    });
}

/** Escopo passado a computeElementCompliance: campanha + fator de agregação. */
function _campaignScope(): { campaignId: string | null; aggregation: AggregationFactor } {
    return { campaignId: _navState().campaignId, aggregation: _aggFactor };
}

function _persist(key: string, value: string) {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch (e: any) {
        console.debug('[relations:persist]', e?.message || e);
    }
}

export function renderActionsRelationsPanel(shellRightEl: any) {
    if (!shellRightEl) return;
    _shellRightEl = shellRightEl;
    shellRightEl.classList.remove('actions-shell-right--constellation');
    shellRightEl.classList.add('actions-shell-right--relations');
    _bindEvents();
    _paint();
}

export function refreshActionsRelationsPanel() {
    if (_shellRightEl) _paint();
}

export function destroyActionsRelationsPanel() {
    _abortController?.abort();
    _abortController = null;
    _closeArticulationDrill();
    _isFullscreen = false;
    try {
        if (typeof document !== 'undefined') document.body.classList.remove('relations-fullscreen-active');
    } catch (e: any) {
        console.debug('[relations:destroyFullscreen]', e?.message || e);
    }
    _shellRightEl = null;
}

function _bindEvents() {
    _abortController?.abort();
    _abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    if (typeof window === 'undefined') return;
    const opts = _abortController ? { signal: _abortController.signal } : undefined;
    for (const ev of [
        'ecbt:elementSelected',
        'elementSelected',
        'selectionChanged',
        'ecbt:elementAdded',
        'elementAdded',
        'ecbt:elementUpdated',
        'ecbt:elementsCleared',
        'edgesChanged',
    ]) {
        window.addEventListener(
            ev,
            () => {
                _focusedId = null;
                _focusStack = [];
                _paint();
            },
            opts as any,
        );
    }
}

function _collectRelations(selected: any) {
    const byId = buildElementByIdMap();
    return [
        ...collectParentRelation(selected, byId),
        ...collectChildRelations(selected, byId),
        ...collectEdgeRelations(selected, byId),
    ];
}

/**
 * Constrói um mapa id → elemento para lookups rápidos.
 * @returns {Map<string, any>}
 */
function buildElementByIdMap(): Map<string, any> {
    const byId = new Map<string, any>();
    for (const el of getAllElements()) {
        if (el?.id) byId.set(el.id, el);
    }
    return byId;
}

/**
 * Coleta a relação de parentesco (contained_in) do elemento selecionado.
 * @param {any} selected
 * @param {Map<string, any>} byId
 * @returns {any[]}
 */
function collectParentRelation(selected: any, byId: Map<string, any>): any[] {
    const parentId = selected?.hierarchy?.parentId || selected?.parentId;
    if (!parentId || !byId.has(parentId)) return [];
    const parent = byId.get(parentId);
    return [{
        otherId: parentId,
        otherName: parent?.name || parentId,
        otherFamily: parent?.familyId || parent?.family || '',
        typeId: 'contained_in',
        typeName: tr('actionsRelations.containedIn', 'Contido em'),
        direction: 'in',
    }];
}

/**
 * Coleta as relações de filhos (contains) do elemento selecionado.
 * @param {any} selected
 * @param {Map<string, any>} byId
 * @returns {any[]}
 */
function collectChildRelations(selected: any, byId: Map<string, any>): any[] {
    const relations = [];
    for (const el of byId.values()) {
        const elParent = el?.hierarchy?.parentId || el?.parentId;
        if (elParent === selected.id) {
            relations.push({
                otherId: el.id,
                otherName: el.name || el.id,
                otherFamily: el.familyId || el.family || '',
                typeId: 'contains',
                typeName: tr('actionsRelations.contains', 'Contém'),
                direction: 'out',
            });
        }
    }
    return relations;
}

/**
 * Coleta as relações por arestas do elemento selecionado.
 * @param {any} selected
 * @param {Map<string, any>} byId
 * @returns {any[]}
 */
function collectEdgeRelations(selected: any, byId: Map<string, any>): any[] {
    const relations = [];
    for (const edge of getAllEdges()) {
        if (!edge?.sourceId || !edge?.targetId) continue;
        const isOutgoing = edge.sourceId === selected.id;
        const isIncoming = edge.targetId === selected.id;
        if (!isOutgoing && !isIncoming) continue;
        const otherId = isOutgoing ? edge.targetId : edge.sourceId;
        const other = byId.get(otherId);
        const typeObj = getEdgeType(edge.type);
        relations.push({
            otherId,
            otherName: other?.name || otherId,
            otherFamily: other?.familyId || other?.family || '',
            typeId: edge.type || 'related',
            typeName: typeObj?.name || edge.type || tr('actionsRelations.genericType', 'Relação'),
            direction: isOutgoing ? 'out' : 'in',
        });
    }
    return relations;
}

function _buildVirtualModelRoot(allElements: any[]): any {
    return {
        id: '__model_root__',
        name: tr('actionsRelations.virtualRootName', 'Modelo Completo'),
        family: 'root',
        familyId: 'root',
        __virtual: true,
        __childCount: allElements?.length || 0,
    };
}

function _collectVirtualRootRelations(allElements: any[]): any[] {
    const topLevel = (allElements || []).filter(
        (el) => !(el?.hierarchy?.parentId || el?.parentId),
    );
    const containsLabel = tr('actionsRelations.contains', 'Contém');
    return topLevel.map((el) => ({
        otherId: el.id,
        otherName: el.name || el.id,
        otherFamily: el.familyId || el.family || '',
        typeId: 'contains',
        typeName: containsLabel,
        direction: 'out' as const,
    }));
}

function _emptyStateHtml(message: string, hint?: string) {
    return `
        <div class="relations-empty" role="status">
            <div class="relations-empty-icon" aria-hidden="true">&#9676;</div>
            <p class="relations-empty-msg">${escapeHtml(message)}</p>
            ${hint ? `<p class="relations-empty-hint">${escapeHtml(hint)}</p>` : ''}
        </div>`;
}

function _viewToggleHtml(): string {
    const sunburstActive = _viewMode === 'sunburst' ? ' is-active' : '';
    const treeActive = _viewMode === 'tree' ? ' is-active' : '';
    const diagramActive = _viewMode === 'diagram' ? ' is-active' : '';
    return `
        <div class="relations-view-toggle" role="tablist" aria-label="${escapeHtml(
            tr('actionsRelations.viewToggleAria', 'Modo de visualização'),
        )}">
            <button type="button" class="relations-view-btn${sunburstActive}" data-view="sunburst" role="tab" aria-selected="${_viewMode === 'sunburst'}">
                ${escapeHtml(tr('actionsRelations.viewSunburst', 'Sunburst'))}
            </button>
            <button type="button" class="relations-view-btn${treeActive}" data-view="tree" role="tab" aria-selected="${_viewMode === 'tree'}">
                ${escapeHtml(tr('actionsRelations.viewTree', 'Árvore'))}
            </button>
            <button type="button" class="relations-view-btn${diagramActive}" data-view="diagram" role="tab" aria-selected="${_viewMode === 'diagram'}">
                ${escapeHtml(tr('actionsRelations.viewDiagram', 'Diagrama'))}
            </button>
        </div>`;
}

function _breadcrumbHtml(): string {
    if (_focusStack.length === 0) return '';
    const homeLabel = tr('actionsRelations.breadcrumbHome', 'Início');
    const crumbs = _focusStack
        .map(
            (c, i) =>
                `<button type="button" class="relations-crumb" data-crumb-index="${i}">${escapeHtml(c.name)}</button>`,
        )
        .join('<span class="relations-crumb-sep" aria-hidden="true">/</span>');
    return `
        <nav class="relations-breadcrumb" aria-label="${escapeHtml(
            tr('actionsRelations.breadcrumbAria', 'Caminho de navegação'),
        )}">
            <button type="button" class="relations-crumb relations-crumb--home" data-crumb-index="-1" title="${escapeHtml(homeLabel)}">
                <span aria-hidden="true">&#9737;</span>
                <span class="visually-hidden">${escapeHtml(homeLabel)}</span>
            </button>
            <span class="relations-crumb-sep" aria-hidden="true">/</span>
            ${crumbs}
        </nav>`;
}

function _paint() {
    if (!_shellRightEl) return;
    _closeArticulationDrill(); // A1: fecha popover órfão antes de re-render
    const realSelected = getSelectedElement();
    const allElements = getAllElements();
    const modelHasElements = allElements && allElements.length > 0;
    if (!realSelected && !modelHasElements) {
        _shellRightEl.innerHTML = renderEmptyRelationsPanel();
        return;
    }

    const state = buildRelationsPaintState(realSelected, allElements);
    const bodyHtml = renderRelationsBody(state);
    _shellRightEl.innerHTML = renderRelationsPanel(state, bodyHtml, allElements);

    applyRelationsFullscreenClasses();
    wireRelationsPanelInteractions();
    renderRelationsVisualization(state);
}

/**
 * Renderiza o painel vazio quando não há modelo.
 * @returns {string}
 */
function renderEmptyRelationsPanel(): string {
    return `
        <div class="relations-panel">
            <div class="relations-head">
                <h3 class="relations-title">${escapeHtml(tr('actionsRelations.heading', 'Conexões'))}</h3>
            </div>
            ${_emptyStateHtml(
                tr('actionsRelations.emptyModel', 'Nenhum elemento no modelo ainda.'),
                tr('actionsRelations.emptyModelHint', 'Adicione elementos para vê-los aqui.'),
            )}
        </div>`;
}

/**
 * Estado consolidado usado pelo paint do painel de relações.
 */
type RelationsPaintState = {
    selected: any;
    isVirtualRoot: boolean;
    graphRoot: any;
    relations: any[];
    groups: Map<string, any[]>;
    familyLabel: string;
    countLabel: string;
    hasRels: boolean;
};

/**
 * Constrói o estado consolidado usado pelo paint do painel de relações.
 * @param {any} realSelected
 * @param {any[]} allElements
 * @returns {RelationsPaintState}
 */
function buildRelationsPaintState(realSelected: any, allElements: any[]): RelationsPaintState {
    const selected = realSelected || _buildVirtualModelRoot(allElements);
    const isVirtualRoot = !realSelected;
    const v2GraphMax = !!(CONFIG as any)?.FEATURES?.RELATIONS_PANEL_UX_V2 && !isVirtualRoot;
    const graphRoot = v2GraphMax ? _buildVirtualModelRoot(allElements) : selected;
    _highlightId = v2GraphMax ? String(realSelected.id) : null;
    const relations = isVirtualRoot
        ? _collectVirtualRootRelations(allElements)
        : _collectRelations(selected);
    const groups = buildRelationGroups(relations);
    const familyLabel = isVirtualRoot
        ? ''
        : escapeHtml(String(selected.familyId || selected.family || ''));
    const countLabel = resolveRelationCountLabel(isVirtualRoot, relations.length);
    return {
        selected,
        isVirtualRoot,
        graphRoot,
        relations,
        groups,
        familyLabel,
        countLabel,
        hasRels: relations.length > 0,
    };
}

/**
 * Agrupa relações por nome de tipo.
 * @param {any[]} relations
 * @returns {Map<string, any[]>}
 */
function buildRelationGroups(relations: any[]): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    for (const rel of relations) {
        const arr = groups.get(rel.typeName) || [];
        arr.push(rel);
        groups.set(rel.typeName, arr);
    }
    return groups;
}

/**
 * Resolve o rótulo de contagem de relações.
 * @param {boolean} isVirtualRoot
 * @param {number} count
 * @returns {string}
 */
function resolveRelationCountLabel(isVirtualRoot: boolean, count: number): string {
    if (isVirtualRoot) {
        return `${count} ${tr('actionsRelations.topLevelElements', 'elementos no modelo')}`;
    }
    if (count === 1) {
        return tr('actionsRelations.oneConnection', '1 conexão');
    }
    return `${count} ${tr('actionsRelations.connections', 'conexões')}`;
}

/**
 * Renderiza o corpo do painel de relações (lista + visualização).
 * @param {RelationsPaintState} state
 * @returns {string}
 */
function renderRelationsBody(state: RelationsPaintState): string {
    if (!state.hasRels) {
        return _emptyStateHtml(
            tr('actionsRelations.noConnections', 'Este elemento ainda não tem conexões registradas.'),
            tr('actionsRelations.noConnectionsHint', 'Crie vínculos na aba Modelo (arestas entre elementos).'),
        );
    }
    const listSide = `<div class="relations-side relations-side--list">${_groupsHtml(state.groups)}</div>`;
    return `<div class="relations-body relations-body--split">${listSide}${renderRelationsVizSide()}</div>`;
}

/**
 * Renderiza o lado da visualização (canvas) conforme o modo atual.
 * @returns {string}
 */
function renderRelationsVizSide(): string {
    if (_viewMode === 'tree') {
        return `<div class="relations-side relations-side--tree" data-viz="tree">
            <canvas class="relations-tree-canvas" role="img" aria-label="${escapeHtml(
                tr('actionsRelations.treeAriaLabel', 'Árvore hierárquica do elemento'),
            )}"></canvas>
            <div class="relations-tooltip" role="tooltip" aria-hidden="true"></div>
        </div>`;
    }
    if (_viewMode === 'diagram') {
        return `<div class="relations-side relations-side--diagram">
            <canvas class="relations-diagram-canvas" role="img" aria-label="${escapeHtml(
                tr('actionsRelations.diagramAriaLabel', 'Diagrama hierárquico em árvore (boxes top-down)'),
            )}"></canvas>
            <div class="relations-tooltip" role="tooltip" aria-hidden="true"></div>
        </div>`;
    }
    return `<div class="relations-side relations-side--sunburst">
        <canvas class="relations-sunburst-canvas" role="img" aria-label="${escapeHtml(
            tr('actionsRelations.sunburstAriaLabel', 'Sunburst hierárquico do elemento'),
        )}"></canvas>
        <div class="relations-tooltip" role="tooltip" aria-hidden="true"></div>
    </div>`;
}

/**
 * Renderiza o painel completo de relações.
 * @param {RelationsPaintState} state
 * @param {string} bodyHtml
 * @param {any[]} allElements
 * @returns {string}
 */
function renderRelationsPanel(state: RelationsPaintState, bodyHtml: string, allElements: any[]): string {
    const modelHasObs = _modelHasObservations(allElements);
    return `
        <div class="relations-panel">
            ${renderRelationsHead(state, modelHasObs)}
            ${bodyHtml}
            ${state.hasRels ? _kpiStripHtml(allElements) : ''}
        </div>`;
}

/**
 * Renderiza o cabeçalho do painel de relações.
 * @param {RelationsPaintState} state
 * @param {boolean} modelHasObs
 * @returns {string}
 */
function renderRelationsHead(state: RelationsPaintState, modelHasObs: boolean): string {
    const fullscreenLabel = _isFullscreen
        ? tr('actionsRelations.exitFullscreen', 'Sair da tela cheia')
        : tr('actionsRelations.enterFullscreen', 'Tela cheia');
    const fullscreenIcon = _isFullscreen ? '&#10005;' : '&#9974;';
    const familyChip = state.familyLabel ? `<span class="relations-family">${state.familyLabel}</span>` : '';
    return `
        <div class="relations-head">
            <div class="relations-head-top">
                <h3 class="relations-title">${escapeHtml(String(state.selected.name || state.selected.id))}</h3>
                <div class="relations-head-actions">
                    ${state.hasRels ? _viewToggleHtml() : ''}
                    <button type="button" class="relations-fullscreen-btn" data-relations-fullscreen
                        aria-pressed="${_isFullscreen}"
                        aria-label="${escapeHtml(fullscreenLabel)}"
                        title="${escapeHtml(fullscreenLabel)}">${fullscreenIcon}</button>
                </div>
            </div>
            <div class="relations-sub">
                ${familyChip}
                <span class="relations-count">${escapeHtml(state.countLabel)}</span>
            </div>
            ${state.hasRels && modelHasObs ? _temporalControlsHtml() : ''}
            ${_breadcrumbHtml()}
        </div>`;
}

/**
 * Aplica as classes de tela cheia ao shell.
 */
function applyRelationsFullscreenClasses(): void {
    try {
        _shellRightEl?.classList.toggle('actions-shell-right--relations-fullscreen', _isFullscreen);
        if (typeof document !== 'undefined') {
            document.body.classList.toggle('relations-fullscreen-active', _isFullscreen);
        }
    } catch (e: any) {
        console.debug('[relations:fullscreenClass]', e?.message || e);
    }
}

/**
 * Liga os handlers de interação do painel de relações.
 */
function wireRelationsPanelInteractions(): void {
    _wireItemClicks();
    _wireViewToggle();
    _wireBreadcrumb();
    _wireTemporalControls();
    _wireKpiToggle();
    _wireFullscreen();
}

/**
 * Renderiza a visualização ativa (canvas) após o painel ser inserido no DOM.
 * @param {RelationsPaintState} state
 */
function renderRelationsVisualization(state: RelationsPaintState): void {
    if (!state.hasRels) return;
    if (_viewMode === 'tree') _renderTreeView(state.graphRoot);
    else if (_viewMode === 'diagram') _renderDiagramCanvas(state.graphRoot);
    else _renderSunburstCanvas(state.graphRoot);
}

function _setFullscreen(on: boolean) {
    _isFullscreen = on;
    _paint();
    // o canvas precisa recomputar dimensões após o reflow do takeover
    try {
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(() => {
                if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
            });
        }
    } catch (e: any) {
        console.debug('[relations:fullscreenResize]', e?.message || e);
    }
}

function _wireFullscreen() {
    if (!_shellRightEl) return;
    const opts = _abortController ? ({ signal: _abortController.signal } as any) : undefined;
    const btn = _shellRightEl.querySelector('[data-relations-fullscreen]');
    if (btn) {
        btn.addEventListener('click', () => _setFullscreen(!_isFullscreen), opts);
    }
    // Esc fecha a tela cheia (listener no document, escopado ao AbortController).
    if (_isFullscreen && typeof document !== 'undefined') {
        document.addEventListener(
            'keydown',
            (ev: any) => {
                if (ev?.key === 'Escape' && _isFullscreen) {
                    ev.preventDefault();
                    _setFullscreen(false);
                }
            },
            opts,
        );
    }
}

// ----------------------------------------------------------------
// GRAPH-KPI-001 — barra temporal "<"/">" + agregação + tira de KPIs
// ----------------------------------------------------------------
function _modelHasObservations(allElements: any[]): boolean {
    for (const el of allElements || []) {
        if ((el?.data?.observations?.length || 0) > 0) return true;
    }
    return false;
}

function _temporalControlsHtml(): string {
    const nav = _navState();
    const prevDis = nav.canPrev ? '' : ' disabled';
    const nextDis = nav.canNext ? '' : ' disabled';
    // GRAPH-KPI-001 F2 (Calvin: "deixar mais claro qual campanha está ativa"):
    // chip proeminente com prefixo "Campanha:" + posição N/total, ou "Todas".
    const isAll = nav.mode === 'all';
    const chipClass = isAll ? ' relations-campaign-chip--all' : ' relations-campaign-chip--single';
    const prefix = isAll
        ? tr('actionsRelations.campaignAllPrefix', 'Visão')
        : tr('actionsRelations.campaignPrefix', 'Campanha');
    const posSuffix = isAll ? '' : ` <span class="relations-campaign-pos">${nav.position}/${nav.total}</span>`;
    const aggOptions = (AGGREGATION_FACTORS as readonly AggregationFactor[])
        .map((f) => {
            const { key, fallback } = aggregationFactorLabelKey(f);
            const sel = f === _aggFactor ? ' selected' : '';
            return `<option value="${f}"${sel}>${escapeHtml(tr(key, fallback))}</option>`;
        })
        .join('');
    const expandOn = _expandByParameter ? ' is-active' : '';
    return `
        <div class="relations-temporal" role="group" aria-label="${escapeHtml(
            tr('actionsRelations.temporalAria', 'Navegação temporal entre campanhas'),
        )}">
            <button type="button" class="relations-temporal-nav" data-campaign-step="-1"${prevDis}
                aria-label="${escapeHtml(tr('actionsRelations.campaignPrev', 'Campanha anterior'))}"
                title="${escapeHtml(tr('actionsRelations.campaignPrev', 'Campanha anterior'))}">&#9664;</button>
            <span class="relations-campaign-chip${chipClass}" aria-live="polite"
                aria-label="${escapeHtml(`${prefix}: ${nav.label}`)}"
                title="${escapeHtml(`${prefix}: ${nav.label}`)}">
                <span class="relations-campaign-ico" aria-hidden="true">&#9678;</span>
                <span class="relations-campaign-name">${escapeHtml(nav.label)}</span>${posSuffix}
            </span>
            <button type="button" class="relations-temporal-nav" data-campaign-step="1"${nextDis}
                aria-label="${escapeHtml(tr('actionsRelations.campaignNext', 'Próxima campanha'))}"
                title="${escapeHtml(tr('actionsRelations.campaignNext', 'Próxima campanha'))}">&#9654;</button>
            <label class="relations-temporal-agg">
                <span class="visually-hidden">${escapeHtml(tr('actionsRelations.aggLabel', 'Agregar por'))}</span>
                <select class="relations-agg-select" aria-label="${escapeHtml(
                    tr('actionsRelations.aggLabel', 'Agregar por'),
                )}" title="${escapeHtml(tr('actionsRelations.aggTitle', 'Como agregar múltiplas leituras por parâmetro'))}">
                    ${aggOptions}
                </select>
            </label>
            <button type="button" class="relations-param-toggle${expandOn}" data-expand-param
                aria-pressed="${_expandByParameter}"
                title="${escapeHtml(tr('actionsRelations.expandParamTitle', 'Expandir o gráfico por parâmetro monitorado'))}">
                ${escapeHtml(tr('actionsRelations.expandParam', 'Por parâmetro'))}
            </button>
        </div>`;
}

function _buildGraphInput(allElements: any[]): { nodes: any[]; edges: any[] } {
    const ids = collectGraphNodeIds(allElements);
    const nodes = buildGraphNodes(allElements, ids);
    const edges = [
        ...buildGraphParentEdges(allElements, ids),
        ...buildGraphEdgeRelations(),
    ];
    return { nodes, edges };
}

/**
 * Coleta os ids válidos dos elementos para o grafo.
 * @param {any[]} allElements
 * @returns {Set<string>}
 */
function collectGraphNodeIds(allElements: any[]): Set<string> {
    const ids = new Set<string>();
    for (const el of allElements || []) {
        if (el?.id) ids.add(String(el.id));
    }
    return ids;
}

/**
 * Constrói os nós do grafo a partir dos elementos.
 * @param {any[]} allElements
 * @param {Set<string>} ids
 * @returns {any[]}
 */
function buildGraphNodes(allElements: any[], ids: Set<string>): any[] {
    const nodes: any[] = [];
    for (const el of allElements || []) {
        if (!el?.id) continue;
        ids.add(String(el.id));
        nodes.push({ id: String(el.id), family: String(el.familyId || el.family || 'misc') });
    }
    return nodes;
}

/**
 * Constrói as arestas de hierarquia (pai → filho).
 * @param {any[]} allElements
 * @param {Set<string>} ids
 * @returns {any[]}
 */
function buildGraphParentEdges(allElements: any[], ids: Set<string>): any[] {
    const edges: any[] = [];
    for (const el of allElements || []) {
        const pid = el?.hierarchy?.parentId || el?.parentId;
        if (pid && ids.has(String(pid)) && el?.id) {
            edges.push({ sourceId: String(pid), targetId: String(el.id) });
        }
    }
    return edges;
}

/**
 * Constrói as arestas a partir do registro de arestas do modelo.
 * @returns {any[]}
 */
function buildGraphEdgeRelations(): any[] {
    const edges: any[] = [];
    for (const edge of getAllEdges() || []) {
        if (edge?.sourceId && edge?.targetId) {
            edges.push({ sourceId: String(edge.sourceId), targetId: String(edge.targetId) });
        }
    }
    return edges;
}

function _kpiStripHtml(allElements: any[]): string {
    let cards: any[] = [];
    let worstTone = 'neutral';
    try {
        const { nodes, edges } = _buildGraphInput(allElements);
        if (nodes.length >= 2) {
            const result = computeGraphMetrics(
                { nodes, edges },
                { partitionOf: (n: any) => String(n.family || 'misc') },
            );
            cards = buildGraphKpiStripVM(result, {
                labelOf: (id: string) => {
                    const el = getElementById(id);
                    return el?.name || id;
                },
            }) as any[];
            worstTone = resolveStripWorstTone(cards as any);
        }
    } catch (e: any) {
        console.debug('[relations:kpiStrip]', e?.message || e);
    }
    if (cards.length === 0) return '';
    const collapsed = _kpiCollapsed ? ' is-collapsed' : '';
    const cardsHtml = cards
        .map((c) => {
            const label = escapeHtml(tr(c.labelKey, c.labelFallback));
            // A5: anexa o qualificador (ex.: modularidade "fraca") ao valor
            const valueText = c.valueExtraKey
                ? `${c.value} · ${tr(c.valueExtraKey, c.valueExtraFallback || '')}`
                : c.value;
            const value = escapeHtml(valueText);
            // tooltip completo (label + valor + leitura) já que o valor é clampado a 2 linhas
            const fullTitle = escapeHtml(`${tr(c.labelKey, c.labelFallback)}: ${valueText} — ${tr(c.hintKey, c.hintFallback)}`);
            // A1: card de articulação vira acionável (drill p/ a lista completa de nós)
            // A11Y (aria-required-children): o grid pai tem role="list", então TODO
            // filho precisa ser role="listitem". O card de drill mantém-se operável
            // via tabindex + aria-haspopup + data-kpi-drill (handler em _wireKpiToggle
            // liga por seletor de atributo, não por role), sem virar role="button"
            // (que quebrava a regra aria-required-children do <div role="list">).
            const drillable = c.key === 'articulation';
            const drillAttrs = drillable
                ? ` data-kpi-drill="articulation" role="listitem" tabindex="0" aria-haspopup="dialog"`
                : ' role="listitem"';
            const drillClass = drillable ? ' relations-kpi-card--drillable' : '';
            return `
                <div class="relations-kpi-card relations-kpi-card--${c.tone}${drillClass}" title="${fullTitle}"${drillAttrs}>
                    <span class="relations-kpi-label">${label}</span>
                    <span class="relations-kpi-value" title="${value}">${value}</span>
                </div>`;
        })
        .join('');
    const heading = escapeHtml(tr('actionsRelations.kpiHeading', 'KPIs científicos do grafo'));
    // A3 — legenda das cores do card (crítico/atenção/info)
    const legend = `
        <span class="relations-kpi-legend" aria-hidden="true">
            <span class="relations-kpi-legend-item relations-kpi-legend-item--critical" title="${escapeHtml(tr('actionsRelations.kpiLegendCritical', 'Crítico'))}">&#9679;</span>
            <span class="relations-kpi-legend-item relations-kpi-legend-item--warn" title="${escapeHtml(tr('actionsRelations.kpiLegendWarn', 'Atenção'))}">&#9679;</span>
            <span class="relations-kpi-legend-item relations-kpi-legend-item--info" title="${escapeHtml(tr('actionsRelations.kpiLegendInfo', 'Informativo'))}">&#9679;</span>
        </span>`;
    // A2 — botão de export CSV dos KPIs
    const exportBtn = `
        <button type="button" class="relations-kpi-export" data-kpi-export
            aria-label="${escapeHtml(tr('actionsRelations.kpiExport', 'Exportar KPIs (CSV)'))}"
            title="${escapeHtml(tr('actionsRelations.kpiExport', 'Exportar KPIs (CSV)'))}">&#8675; CSV</button>`;
    return `
        <div class="relations-kpi-strip relations-kpi-strip--${worstTone}${collapsed}">
            <div class="relations-kpi-head">
                <button type="button" class="relations-kpi-toggle" aria-expanded="${!_kpiCollapsed}"
                    title="${escapeHtml(tr('actionsRelations.kpiToggleTitle', 'Mostrar/ocultar métricas de rede'))}">
                    <span class="relations-kpi-toggle-icon" aria-hidden="true">${_kpiCollapsed ? '&#9656;' : '&#9662;'}</span>
                    <span class="relations-kpi-heading">${heading}</span>
                </button>
                <span class="relations-kpi-head-actions">${legend}${exportBtn}</span>
            </div>
            <div class="relations-kpi-grid" role="list">${cardsHtml}</div>
        </div>`;
}

/** A2 — handler do export CSV dos KPIs (recomputa do modelo atual, sem estado stale). */
function _exportKpisCsv() {
    try {
        const { nodes, edges } = _buildGraphInput(getAllElements());
        if (nodes.length < 2) {
            showToast(tr('actionsRelations.kpiExportEmpty', 'Sem métricas para exportar.'), 'info');
            return;
        }
        const result = computeGraphMetrics({ nodes, edges }, { partitionOf: (n: any) => String(n.family || 'misc') });
        const { headers, rows } = buildGraphKpiExport(result, {
            labelOf: (id: string) => getElementById(id)?.name || id,
            headers: [
                tr('actionsRelations.kpiCsvMetric', 'Métrica'),
                tr('actionsRelations.kpiCsvValue', 'Valor'),
                tr('actionsRelations.kpiCsvDetail', 'Detalhe'),
            ],
        });
        exportCsv(headers as string[], rows as string[][], `kpis-grafo-${csvDateSuffix()}`);
        showToast(tr('actionsRelations.kpiExportDone', 'KPIs exportados em CSV.'), 'success');
    } catch (e: any) {
        console.debug('[relations:kpiExport]', e?.message || e);
        showToast(tr('actionsRelations.kpiExportEmpty', 'Sem métricas para exportar.'), 'info');
    }
}

let _articulationPopover: HTMLElement | null = null;
function _closeArticulationDrill() {
    if (_articulationPopover) {
        _articulationPopover.remove();
        _articulationPopover = null;
    }
}

/**
 * A1 — drill dos pontos de articulação: popover com a lista completa dos nós
 * (elo único do CSM); clicar num nó seleciona/foca o elemento no modelo.
 */
function _openArticulationDrill(anchorEl: HTMLElement) {
    _closeArticulationDrill();
    const ids = computeArticulationPointIds();
    if (ids.length === 0) return;
    const pop = buildArticulationPopover(ids);
    document.body.appendChild(pop);
    positionPopover(pop, anchorEl);
    _articulationPopover = pop;
    (pop.querySelector('.relations-artic-popover-item') as HTMLElement | null)?.focus?.();
    attachArticulationDismiss(pop, anchorEl);
}

/**
 * Calcula os ids dos pontos de articulação do grafo atual.
 * @returns {string[]}
 */
function computeArticulationPointIds(): string[] {
    try {
        const { nodes, edges } = _buildGraphInput(getAllElements());
        const result = computeGraphMetrics({ nodes, edges });
        return (result.connectivityRisk?.articulationPoints || []) as string[];
    } catch (e: any) {
        console.debug('[relations:articDrill]', e?.message || e);
        return [];
    }
}

/**
 * Constrói o popover de pontos de articulação.
 * @param {string[]} ids
 * @returns {HTMLElement}
 */
function buildArticulationPopover(ids: string[]): HTMLElement {
    const pop = document.createElement('div');
    pop.className = 'relations-artic-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', tr('actionsRelations.kpiArticulation', 'Pontos de articulação'));
    const title = document.createElement('div');
    title.className = 'relations-artic-popover-title';
    title.textContent = `${tr('actionsRelations.kpiArticulation', 'Pontos de articulação')} (${ids.length})`;
    pop.appendChild(title);
    const list = document.createElement('div');
    list.className = 'relations-artic-popover-list';
    for (const id of ids) {
        list.appendChild(buildArticulationPopoverItem(id));
    }
    pop.appendChild(list);
    return pop;
}

/**
 * Constrói um item clicável do popover de articulação.
 * @param {string} id
 * @returns {HTMLElement}
 */
function buildArticulationPopoverItem(id: string): HTMLElement {
    const el = getElementById(id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'relations-artic-popover-item';
    item.textContent = el?.name || id;
    item.title = tr('actionsRelations.articulationDrillItem', 'Selecionar no modelo');
    item.addEventListener('click', () => {
        try {
            setSelectedElement(id);
        } catch (e: any) {
            console.debug('[relations:articSelect]', e?.message || e);
        }
        _closeArticulationDrill();
        _paint();
    });
    return item;
}

/**
 * Posiciona um popover em coordenadas fixas de viewport, clampando à janela.
 * @param {HTMLElement} pop
 * @param {HTMLElement} anchorEl
 */
function positionPopover(pop: HTMLElement, anchorEl: HTMLElement): void {
    try {
        const r = anchorEl.getBoundingClientRect();
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 800;
        const popW = Math.min(260, pop.offsetWidth || 200);
        const popH = Math.min(240, pop.offsetHeight || 160);
        const left = Math.max(8, Math.min(r.left, vw - popW - 8));
        const top = r.bottom + popH + 8 > vh ? Math.max(8, r.top - popH - 4) : r.bottom + 4;
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    } catch (e: any) {
        console.debug('[relations:articPos]', e?.message || e);
    }
}

/**
 * Liga os handlers de dismiss (Esc e clique fora) do popover de articulação.
 * @param {HTMLElement} pop
 * @param {HTMLElement} anchorEl
 */
function attachArticulationDismiss(pop: HTMLElement, anchorEl: HTMLElement): void {
    const opts = _abortController ? ({ signal: _abortController.signal } as any) : undefined;
    document.addEventListener(
        'keydown',
        (ev: any) => {
            if (ev?.key === 'Escape') {
                _closeArticulationDrill();
                anchorEl.focus?.();
            }
        },
        opts,
    );
    setTimeout(() => {
        document.addEventListener(
            'click',
            (ev: any) => {
                if (_articulationPopover && !_articulationPopover.contains(ev.target) && ev.target !== anchorEl) {
                    _closeArticulationDrill();
                }
            },
            opts,
        );
    }, 0);
}

function _wireTemporalControls() {
    if (!_shellRightEl) return;
    const opts = _abortController ? ({ signal: _abortController.signal } as any) : undefined;
    _shellRightEl.querySelectorAll('.relations-temporal-nav').forEach((btn: Element) => {
        btn.addEventListener(
            'click',
            () => {
                if ((btn as HTMLButtonElement).disabled) return;
                const dir = Number((btn as HTMLElement).getAttribute('data-campaign-step')) || 0;
                const total = (getAllCampaigns() || []).length;
                // normaliza o índice atual (clamp) antes do passo
                const cur = _navState().index;
                _campaignIndex = stepCampaignIndex(cur, total, dir);
                _persist(CAMPAIGN_IDX_KEY, String(_campaignIndex));
                _paint();
            },
            opts,
        );
    });
    const sel = _shellRightEl.querySelector('.relations-agg-select') as HTMLSelectElement | null;
    if (sel) {
        sel.addEventListener(
            'change',
            () => {
                const v = sel.value;
                if ((AGGREGATION_FACTORS as readonly string[]).includes(v)) {
                    _aggFactor = v as AggregationFactor;
                    _persist(AGG_FACTOR_KEY, v);
                    _paint();
                }
            },
            opts,
        );
    }
    const paramBtn = _shellRightEl.querySelector('[data-expand-param]');
    if (paramBtn) {
        paramBtn.addEventListener(
            'click',
            () => {
                _expandByParameter = !_expandByParameter;
                _persist(EXPAND_PARAM_KEY, _expandByParameter ? '1' : '0');
                _paint();
            },
            opts,
        );
    }
}

function _wireKpiToggle() {
    if (!_shellRightEl) return;
    const opts = _abortController ? ({ signal: _abortController.signal } as any) : undefined;
    const btn = _shellRightEl.querySelector('.relations-kpi-toggle');
    if (btn) {
        btn.addEventListener(
            'click',
            () => {
                _kpiCollapsed = !_kpiCollapsed;
                _persist(KPI_COLLAPSED_KEY, _kpiCollapsed ? '1' : '0');
                _paint();
            },
            opts,
        );
    }
    // A2 — export CSV dos KPIs (não colapsa a tira ao clicar)
    const exportBtn = _shellRightEl.querySelector('[data-kpi-export]');
    if (exportBtn) {
        exportBtn.addEventListener(
            'click',
            (ev: any) => {
                ev?.stopPropagation?.();
                _exportKpisCsv();
            },
            opts,
        );
    }
    // A1 — drill dos pontos de articulação (clique ou Enter/Espaço no card)
    const drillCard = _shellRightEl.querySelector('[data-kpi-drill="articulation"]') as HTMLElement | null;
    if (drillCard) {
        drillCard.addEventListener('click', () => _openArticulationDrill(drillCard), opts);
        drillCard.addEventListener(
            'keydown',
            (ev: any) => {
                if (ev?.key === 'Enter' || ev?.key === ' ') {
                    ev.preventDefault();
                    _openArticulationDrill(drillCard);
                }
            },
            opts,
        );
    }
}

function _groupsHtml(groups: Map<string, any[]>): string {
    return Array.from(groups.entries())
        .map(([typeName, rels]) => {
            const items = rels
                .map((rel: any) => {
                    const arrow = rel.direction === 'out' ? '&#8594;' : '&#8592;';
                    const famChip = rel.otherFamily
                        ? `<span class="relations-item-family">${escapeHtml(String(rel.otherFamily))}</span>`
                        : '';
                    // A11Y (aria-required-children): o <ul> tem role="list", então os
                    // filhos precisam ser listitem. <li> já É listitem implícito — o
                    // role="button" anterior sobrescrevia esse papel e quebrava a regra.
                    // Mantém-se acionável por teclado/mouse via tabindex + data-element-id
                    // (handler _wireItemClicks liga por classe+atributo e trata Enter/Espaço).
                    return `
                        <li class="relations-item" data-element-id="${escapeHtml(String(rel.otherId))}" tabindex="0">
                            <span class="relations-item-dir" aria-hidden="true">${arrow}</span>
                            <span class="relations-item-name">${escapeHtml(String(rel.otherName))}</span>
                            ${famChip}
                        </li>`;
                })
                .join('');
            return `
                <div class="relations-group">
                    <div class="relations-group-title">${escapeHtml(String(typeName))} <span class="relations-group-count">${rels.length}</span></div>
                    <ul class="relations-list" role="list">${items}</ul>
                </div>`;
        })
        .join('');
}

// ============================================================================
// Tree + Sunburst (SPEC_SUNBURST_REDESIGN_001)
// ============================================================================

function _buildDescendantTree(rootEl: any, maxDepth = 2): SunburstNode {
    const allEls = getAllElements();
    const childrenMap = buildElementChildrenMap(allEls);
    const scope = _campaignScope();

    function build(el: any, depth: number): SunburstNode {
        const familyVal = String(el?.familyId || el?.family || '');
        const isVirtual = el?.__virtual === true;
        const directChildren = isVirtual
            ? allEls.filter((c: any) => !(c?.hierarchy?.parentId || c?.parentId))
            : childrenMap.get(el?.id) || [];
        const ownSev = resolveElementSeverity(el, scope);
        let childNodes: SunburstNode[] =
            depth < maxDepth ? directChildren.map((c: any) => build(c, depth + 1)) : [];
        if (_expandByParameter && !isVirtual && directChildren.length === 0 && depth < maxDepth) {
            childNodes = expandParameterChildNodes(el, scope, childNodes);
        }
        const inheritedSev = computeInheritedSeverity(ownSev, childNodes);
        const includeChildren = depth < maxDepth;
        return {
            id: String(el?.id || ''),
            name: String(el?.name || el?.id || ''),
            family: familyVal,
            severity: inheritedSev,
            ...(includeChildren ? { children: childNodes } : {}),
        };
    }
    return build(rootEl, 0);
}

/**
 * Constrói o mapa de filhos por parentId a partir de todos os elementos.
 * @param {any[]} allEls
 * @returns {Map<string, any[]>}
 */
function buildElementChildrenMap(allEls: any[]): Map<string, any[]> {
    const childrenMap = new Map<string, any[]>();
    const byId = new Map<string, any>();
    for (const el of allEls) {
        if (el?.id) byId.set(el.id, el);
    }
    for (const el of byId.values()) {
        const pid = el?.hierarchy?.parentId || el?.parentId;
        if (!pid) continue;
        const arr = childrenMap.get(pid) || [];
        arr.push(el);
        childrenMap.set(pid, arr);
    }
    return childrenMap;
}

/**
 * Resolve a severidade de um elemento para o sunburst.
 * @param {any} el
 * @param {{campaignId:string|null, aggregation:AggregationFactor}} scope
 * @returns {SliceSeverity}
 */
function resolveElementSeverity(el: any, scope: { campaignId: string | null; aggregation: AggregationFactor }): SliceSeverity {
    if (el?.__virtual) return null;
    try {
        const s = computeElementCompliance(el, scope);
        if (s === 'intervention' || s === 'prevention' || s === 'reference') return s;
        return null;
    } catch (e: any) {
        console.debug('[relations:sevOf]', e?.message || e);
        return null;
    }
}

/**
 * Expande um nó folha em nós de parâmetro monitorado.
 * @param {any} el
 * @param {any} scope
 * @param {SunburstNode[]} currentChildNodes
 * @returns {SunburstNode[]}
 */
function expandParameterChildNodes(el: any, scope: any, currentChildNodes: SunburstNode[]): SunburstNode[] {
    try {
        const paramSevs = computeParameterSeverities(el, scope);
        if (paramSevs.length > 0) {
            return buildParameterChildNodes(paramSevs, String(el?.id || ''), {
                nameOf: _paramName,
            }) as unknown as SunburstNode[];
        }
    } catch (e: any) {
        console.debug('[relations:paramExpand]', e?.message || e);
    }
    return currentChildNodes;
}

/**
 * Propaga a maior severidade dos filhos para o nó pai.
 * @param {SliceSeverity} ownSev
 * @param {SunburstNode[]} childNodes
 * @returns {SliceSeverity}
 */
function computeInheritedSeverity(ownSev: SliceSeverity, childNodes: SunburstNode[]): SliceSeverity {
    let inheritedSev: SliceSeverity = ownSev;
    let bestRank = severityRank(ownSev);
    for (const cn of childNodes) {
        const r = severityRank((cn.severity ?? null) as SliceSeverity);
        if (r > bestRank) {
            bestRank = r;
            inheritedSev = (cn.severity ?? null) as SliceSeverity;
        }
    }
    return inheritedSev;
}

function _findNodeById(root: SunburstNode, targetId: string): SunburstNode | null {
    if (!root || !targetId) return null;
    const stack: SunburstNode[] = [root];
    while (stack.length > 0) {
        const cur = stack.pop()!;
        if (cur.id === targetId) return cur;
        if (cur.children) for (const c of cur.children) stack.push(c);
    }
    return null;
}

function _renderSunburstCanvas(selected: any) {
    const canvas: HTMLCanvasElement | null = _shellRightEl?.querySelector?.(
        '.relations-sunburst-canvas',
    );
    if (!canvas) return;
    const parent = canvas.parentElement as HTMLElement | null;
    const w = Math.max(220, Math.floor((parent?.clientWidth || 280) - 4));
    const h = w;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const fullTree = _buildDescendantTree(selected, 4);
    let displayedRoot: SunburstNode = fullTree;
    if (_focusedId && _focusedId !== fullTree.id) {
        const focused = _findNodeById(fullTree, _focusedId);
        if (focused) displayedRoot = focused;
        else {
            _focusedId = null;
            _focusStack = [];
        }
    }
    const layout = computeSunburstLayout(displayedRoot, { width: w, height: h, maxDepth: 2 });
    _paintSunburst(ctx, layout, displayedRoot);
    _wireSunburstInteraction(canvas, layout);
}

function _paintSunburst(
    ctx: CanvasRenderingContext2D,
    layout: SunburstLayout,
    displayedRoot: SunburstNode,
) {
    ctx.clearRect(0, 0, layout.width, layout.height);

    paintSunburstSlices(ctx, layout);
    paintSunburstRootBorder(ctx, layout, displayedRoot);
    paintSunburstCenter(ctx, layout, displayedRoot);
    paintSunburstLabels(ctx, layout);
}

/**
 * Desenha as fatias do sunburst.
 * @param {CanvasRenderingContext2D} ctx
 * @param {SunburstLayout} layout
 */
function paintSunburstSlices(ctx: CanvasRenderingContext2D, layout: SunburstLayout): void {
    const { cx, cy, slices } = layout;
    for (const s of slices) {
        ctx.beginPath();
        if (s.depth === 0) {
            ctx.arc(cx, cy, s.outerRadius, 0, 2 * Math.PI);
        } else {
            ctx.arc(cx, cy, s.outerRadius, s.startAngle, s.endAngle, false);
            ctx.arc(cx, cy, s.innerRadius, s.endAngle, s.startAngle, true);
            ctx.closePath();
        }
        ctx.fillStyle = s.depth === 0 ? '#252535' : familyColor(s.node.family);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(15, 15, 23, 0.85)';
        ctx.stroke();

        const sev = (s.node.severity ?? null) as SliceSeverity;
        const sevColor = severityStrokeColor(sev);
        if (sevColor && s.depth > 0) {
            ctx.beginPath();
            ctx.arc(cx, cy, s.outerRadius - 1.5, s.startAngle, s.endAngle, false);
            ctx.lineWidth = sev === 'intervention' ? 3 : 2;
            ctx.strokeStyle = sevColor;
            ctx.stroke();
        }
    }
}

/**
 * Desenha a borda da raiz do sunburst.
 * @param {CanvasRenderingContext2D} ctx
 * @param {SunburstLayout} layout
 * @param {SunburstNode} displayedRoot
 */
function paintSunburstRootBorder(ctx: CanvasRenderingContext2D, layout: SunburstLayout, displayedRoot: SunburstNode): void {
    const { cx, cy, slices } = layout;
    const rootSev = (displayedRoot.severity ?? null) as SliceSeverity;
    const rootBorderColor = severityStrokeColor(rootSev) || '#60a5fa';
    ctx.beginPath();
    ctx.arc(cx, cy, slices[0]!.outerRadius, 0, 2 * Math.PI);
    ctx.lineWidth = rootSev === 'intervention' ? 3 : 2;
    ctx.strokeStyle = rootBorderColor;
    ctx.stroke();
}

/**
 * Desenha o centro do sunburst (contagem de filhos ou nome do nó).
 * @param {CanvasRenderingContext2D} ctx
 * @param {SunburstLayout} layout
 * @param {SunburstNode} displayedRoot
 */
function paintSunburstCenter(ctx: CanvasRenderingContext2D, layout: SunburstLayout, displayedRoot: SunburstNode): void {
    const { cx, cy, slices } = layout;
    const centerR = slices[0]!.outerRadius;
    if (centerR < 22) return;

    const childCount = (displayedRoot.children || []).length;
    const big = centerR >= 36;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (childCount > 0) {
        ctx.fillStyle = '#e8ecf2';
        ctx.font = big ? 'bold 16px sans-serif' : 'bold 13px sans-serif';
        ctx.fillText(String(childCount), cx, big ? cy - 5 : cy - 4);
        ctx.font = big ? '9px sans-serif' : '8px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(childCount === 1 ? 'filho' : 'filhos', cx, big ? cy + 8 : cy + 6);
    } else {
        const nm = String(displayedRoot.name || '');
        const maxChars = Math.max(4, Math.floor(centerR / 4));
        const label = nm.length > maxChars ? nm.slice(0, maxChars - 1) + '…' : nm;
        ctx.fillStyle = '#c2cad6';
        ctx.font = big ? '12px sans-serif' : '10px sans-serif';
        ctx.fillText(label, cx, cy);
    }
}

/**
 * Desenha os rótulos das fatias do sunburst.
 * @param {CanvasRenderingContext2D} ctx
 * @param {SunburstLayout} layout
 */
function paintSunburstLabels(ctx: CanvasRenderingContext2D, layout: SunburstLayout): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const s of layout.slices) {
        if (!s.hasLabel || s.depth === 0) continue;
        const mid = sliceMidpoint(layout, s);
        ctx.fillStyle = '#0f0f17';
        ctx.font = s.depth === 1 ? '10px sans-serif' : '9px sans-serif';
        const arcLen = (s.endAngle - s.startAngle) * ((s.innerRadius + s.outerRadius) / 2);
        const maxChars = Math.max(3, Math.floor(arcLen / 7));
        const label =
            s.node.name.length > maxChars ? s.node.name.slice(0, maxChars - 1) + '…' : s.node.name;
        ctx.fillText(label, mid.x, mid.y);
    }
}

function _wireSunburstInteraction(canvas: HTMLCanvasElement, layout: SunburstLayout) {
    const tooltipEl = _shellRightEl?.querySelector('.relations-tooltip') as HTMLElement | null;
    const handleClick = (ev: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const hit = hitTestSlice(layout, px, py);
        if (!hit) return;
        if (hit.depth === 0) {
            if (_focusStack.length > 0) {
                _focusStack.pop();
                _focusedId = _focusStack.length > 0 ? _focusStack[_focusStack.length - 1]!.id : null;
                _paint();
            }
            return;
        }
        if (ev.shiftKey || ev.altKey) {
            if ((window as any).handleSelectElement) (window as any).handleSelectElement(hit.node.id);
            return;
        }
        _focusStack.push({ id: hit.node.id, name: hit.node.name });
        _focusedId = hit.node.id;
        _paint();
    };
    const handleMove = (ev: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const hit = hitTestSlice(layout, px, py);
        canvas.style.cursor = resolveSunburstCursor(hit);
        if (!tooltipEl) return;
        if (!hit) {
            hideTooltip(tooltipEl);
            return;
        }
        tooltipEl.innerHTML = buildSunburstTooltipContent(hit);
        positionTooltip(tooltipEl, px, py, layout);
        tooltipEl.style.opacity = '1';
        tooltipEl.setAttribute('aria-hidden', 'false');
    };
    const handleLeave = () => {
        if (tooltipEl) {
            tooltipEl.setAttribute('aria-hidden', 'true');
            tooltipEl.style.opacity = '0';
        }
        canvas.style.cursor = 'default';
    };
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseleave', handleLeave);
}

/**
 * Resolve o cursor do canvas do sunburst a partir do hit.
 * @param {any} hit
 * @returns {string}
 */
function resolveSunburstCursor(hit: any): string {
    if (hit && hit.depth !== 0) return 'pointer';
    if (hit) return 'zoom-out';
    return 'default';
}

/**
 * Esconde o tooltip.
 * @param {HTMLElement} tooltipEl
 */
function hideTooltip(tooltipEl: HTMLElement): void {
    tooltipEl.setAttribute('aria-hidden', 'true');
    tooltipEl.style.opacity = '0';
}

/**
 * Posiciona o tooltip dentro dos limites do canvas.
 * @param {HTMLElement} tooltipEl
 * @param {number} px
 * @param {number} py
 * @param {SunburstLayout} layout
 */
function positionTooltip(tooltipEl: HTMLElement, px: number, py: number, layout: SunburstLayout): void {
    tooltipEl.style.left = Math.min(px + 14, layout.width - 220) + 'px';
    tooltipEl.style.top = Math.min(py + 14, layout.height - 80) + 'px';
}

/**
 * Constrói o HTML do tooltip do sunburst.
 * @param {any} hit
 * @returns {string}
 */
function buildSunburstTooltipContent(hit: any): string {
    const n = hit.node;
    const sev = (n.severity ?? null) as SliceSeverity;
    const sevLabel =
        sev === 'intervention' ? 'Violação crítica (intervenção)'
        : sev === 'prevention' ? 'Atenção (prevenção)'
        : sev === 'reference' ? 'Referência'
        : '';
    const childN = (n.children || []).length;
    const familyLine = n.family ? `<span class="relations-tooltip-family">${escapeHtml(n.family)}</span>` : '';
    const childrenLine = childN > 0
        ? `<span class="relations-tooltip-count">${childN} ${childN === 1 ? 'filho' : 'filhos'}</span>`
        : '';
    const sevLine = sevLabel
        ? `<div class="relations-tooltip-sev relations-tooltip-sev--${sev}">${escapeHtml(sevLabel)}</div>`
        : '';
    const hint = hit.depth === 0 ? 'Clique para voltar' : 'Clique para focar · Shift+clique seleciona';
    return `
        <div class="relations-tooltip-name">${escapeHtml(n.name)}</div>
        <div class="relations-tooltip-meta">
            ${familyLine}
            ${childrenLine}
        </div>
        ${sevLine}
        <div class="relations-tooltip-hint">${hint}</div>`;
}

// Calvin 2026-06-07: pan/zoom state para o Diagrama (boxes top-down).
// Estado fica por canvas (dataset.diagramViewKey) para sobreviver re-paints.
interface DiagramView {
    offsetX: number;
    offsetY: number;
    scale: number;
}
const _diagramViewByCanvas = new WeakMap<HTMLCanvasElement, DiagramView>();
const DIAGRAM_MIN_SCALE = 0.25;
const DIAGRAM_MAX_SCALE = 3.0;
// Calvin 2026-06-07: auto-fit pode precisar scale < MIN_SCALE quando contentWidth >> canvas.
// MIN_SCALE só limita user-driven wheel zoom out; auto-fit honra conteúdo.
const DIAGRAM_AUTOFIT_FLOOR = 0.05;

function _getDiagramView(canvas: HTMLCanvasElement): DiagramView {
    let v = _diagramViewByCanvas.get(canvas);
    if (!v) {
        v = { offsetX: 0, offsetY: 0, scale: 1 };
        _diagramViewByCanvas.set(canvas, v);
    }
    return v;
}

/** Auto-fit inicial: scale para caber subtree na canvas + centralizar.
 *  Calvin 2026-06-07: NÃO clampa para MIN_SCALE — auto-fit precisa honrar
 *  conteúdo (35 children precisa scale 0.07, mas MIN_SCALE 0.25 perderia fit).
 *  AUTOFIT_FLOOR=0.05 garante que scale > 0 mesmo p/ extremos. */
function _autoFitDiagramView(layout: BoxTreeLayout, w: number, h: number): DiagramView {
    const padding = 16;
    const availW = Math.max(1, w - padding * 2);
    const availH = Math.max(1, h - padding * 2);
    const scaleW = availW / Math.max(1, layout.contentWidth);
    const scaleH = availH / Math.max(1, layout.contentHeight);
    const scaleNeeded = Math.min(scaleW, scaleH);
    // Cap em 1.0 (auto-fit nunca aumenta conteúdo pequeno).
    // Floor em AUTOFIT_FLOOR (não MIN_SCALE) para honrar conteúdo grande.
    const scale = Math.max(DIAGRAM_AUTOFIT_FLOOR, Math.min(1, scaleNeeded));
    const offsetX = Math.round((w - layout.contentWidth * scale) / 2);
    const offsetY = Math.round((h - layout.contentHeight * scale) / 2);
    return { offsetX, offsetY, scale };
}

/**
 * Calvin 2026-06-07: Diagrama hierárquico boxes top-down (3ª vista).
 * Reingold-Tilford 1981 simplificado via _relationsBoxTreeLayout.
 * Pan (drag) + Zoom (wheel) + Double-click reset.
 */
function _renderDiagramCanvas(selected: any) {
    const canvas: HTMLCanvasElement | null = _shellRightEl?.querySelector?.(
        '.relations-diagram-canvas',
    );
    if (!canvas) return;
    const parent = canvas.parentElement as HTMLElement | null;
    const w = Math.max(220, Math.floor((parent?.clientWidth || 280) - 4));
    const h = Math.max(220, Math.floor((parent?.clientHeight || 280) - 4));
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const root = _buildDescendantTree(selected, 3);
    const layout = computeBoxTreeLayout(root, {
        width: w,
        height: h,
        boxWidth: 84,
        boxHeight: 32,
        hGap: 10,
        vGap: 28,
        maxDepth: 3,
        margin: 10,
    });

    // Calvin 2026-06-07: auto-fit na primeira render — depois preserva o estado
    // do user. Re-fit explícito via double-click ou re-mount do canvas.
    const isFirstRender = !_diagramViewByCanvas.has(canvas);
    if (isFirstRender) {
        _diagramViewByCanvas.set(canvas, _autoFitDiagramView(layout, w, h));
    }
    const view = _getDiagramView(canvas);
    _paintDiagram(ctx, layout, w, h, view);
    _wireDiagramInteraction(canvas, layout, w, h);
}

function _paintDiagram(
    ctx: CanvasRenderingContext2D,
    layout: BoxTreeLayout,
    w: number,
    h: number,
    view: DiagramView,
) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    // Calvin 2026-06-07: pan + zoom — translate primeiro, depois scale.
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    paintDiagramEdges(ctx, layout);
    paintDiagramBoxes(ctx, layout);

    ctx.restore();
}

/**
 * Desenha as arestas do diagrama (caminhos ortogonais).
 * @param {CanvasRenderingContext2D} ctx
 * @param {BoxTreeLayout} layout
 */
function paintDiagramEdges(ctx: CanvasRenderingContext2D, layout: BoxTreeLayout): void {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 1.25;
    for (const e of layout.edges) {
        ctx.beginPath();
        const midY = (e.y1 + e.y2) / 2;
        ctx.moveTo(e.x1, e.y1);
        ctx.lineTo(e.x1, midY);
        ctx.lineTo(e.x2, midY);
        ctx.lineTo(e.x2, e.y2);
        ctx.stroke();
    }
}

/**
 * Desenha as caixas do diagrama.
 * @param {CanvasRenderingContext2D} ctx
 * @param {BoxTreeLayout} layout
 */
function paintDiagramBoxes(ctx: CanvasRenderingContext2D, layout: BoxTreeLayout): void {
    for (const b of layout.boxes) {
        paintDiagramBox(ctx, b);
    }
}

/**
 * Desenha uma única caixa do diagrama.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} b
 */
function paintDiagramBox(ctx: CanvasRenderingContext2D, b: any): void {
    ctx.fillStyle = b.depth === 0 ? '#252535' : familyColor(b.family);
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(b.x, b.y, b.w, b.h, 5);
    else ctx.rect(b.x, b.y, b.w, b.h);
    ctx.fill();

    ctx.strokeStyle = 'rgba(15, 15, 23, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    paintDiagramBoxSeverityOutline(ctx, b);
    paintDiagramBoxLabel(ctx, b);
}

/**
 * Desenha o contorno de severidade (ou destaque de raiz) de uma caixa.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} b
 */
function paintDiagramBoxSeverityOutline(ctx: CanvasRenderingContext2D, b: any): void {
    const sev = b.severity as BoxTreeSeverity;
    const sevColor = boxSeverityColor(sev);
    if (sevColor) {
        ctx.strokeStyle = sevColor;
        ctx.lineWidth = sev === 'intervention' ? 2.5 : 2;
    } else if (b.depth === 0) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
    } else {
        return;
    }
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function')
        ctx.roundRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2, 4);
    else ctx.rect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.stroke();
}

/**
 * Desenha o rótulo (e chip de família) de uma caixa.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} b
 */
function paintDiagramBoxLabel(ctx: CanvasRenderingContext2D, b: any): void {
    ctx.fillStyle = b.depth === 0 ? '#e8ecf2' : '#0f0f17';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxChars = Math.floor(b.w / 5.5);
    const label = b.name.length > maxChars ? b.name.slice(0, maxChars - 1) + '…' : b.name;
    ctx.fillText(label, b.x + b.w / 2, b.y + b.h / 2);

    if (b.depth > 0 && b.family && b.h >= 28) {
        ctx.font = '8px sans-serif';
        ctx.fillStyle = 'rgba(15, 15, 23, 0.65)';
        const fc = b.family.length > 10 ? b.family.slice(0, 9) + '…' : b.family;
        ctx.fillText(fc, b.x + b.w / 2, b.y + b.h - 7);
    }
}

/**
 * Calvin 2026-06-07: pan (drag) + zoom (wheel) + reset (dblclick) + hover tooltip +
 * click → handleSelectElement. Hit-test usa inverse transform (canvas px → world).
 */
function _wireDiagramInteraction(
    canvas: HTMLCanvasElement,
    layout: BoxTreeLayout,
    w: number,
    h: number,
) {
    const tooltipEl = _shellRightEl?.querySelector('.relations-tooltip') as HTMLElement | null;

    /** Converte coord canvas (px,py) → coord world (após inverse de view.translate+scale). */
    function canvasToWorld(px: number, py: number): { x: number; y: number } {
        const v = _getDiagramView(canvas);
        return { x: (px - v.offsetX) / v.scale, y: (py - v.offsetY) / v.scale };
    }

    function repaint() {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        _paintDiagram(ctx, layout, w, h, _getDiagramView(canvas));
    }

    // ===== Drag (pan) =====
    let dragActive = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let viewStartX = 0;
    let viewStartY = 0;
    let dragMoved = false;

    const handleMouseDown = (ev: MouseEvent) => {
        // Apenas botão esquerdo, e SEM modificadores → drag.
        if (ev.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        // Se clicar em um box, NÃO inicia drag — deixa o click handler resolver.
        const worldPt = canvasToWorld(px, py);
        const hit = hitTestBox(layout, worldPt.x, worldPt.y);
        if (hit && hit.depth !== 0 && !ev.shiftKey) {
            // box click — pula drag
            return;
        }
        dragActive = true;
        dragMoved = false;
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        const v = _getDiagramView(canvas);
        viewStartX = v.offsetX;
        viewStartY = v.offsetY;
        canvas.style.cursor = 'grabbing';
        ev.preventDefault();
    };
    const handleMouseUp = () => {
        if (dragActive) {
            dragActive = false;
            canvas.style.cursor = 'grab';
        }
    };
    const handleMouseMove = (ev: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        if (dragActive) {
            const dx = ev.clientX - dragStartX;
            const dy = ev.clientY - dragStartY;
            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
            const v = _getDiagramView(canvas);
            v.offsetX = viewStartX + dx;
            v.offsetY = viewStartY + dy;
            repaint();
            // Hide tooltip during drag
            if (tooltipEl) {
                tooltipEl.setAttribute('aria-hidden', 'true');
                tooltipEl.style.opacity = '0';
            }
            return;
        }
        // Hover (não-drag)
        const worldPt = canvasToWorld(px, py);
        const hit = hitTestBox(layout, worldPt.x, worldPt.y);
        canvas.style.cursor = hit && hit.depth !== 0 ? 'pointer' : 'grab';
        if (!tooltipEl) return;
        if (!hit) {
            tooltipEl.setAttribute('aria-hidden', 'true');
            tooltipEl.style.opacity = '0';
            return;
        }
        const sev = hit.severity as BoxTreeSeverity;
        const sevLabel =
            sev === 'intervention'
                ? 'Violação crítica (intervenção)'
                : sev === 'prevention'
                  ? 'Atenção (prevenção)'
                  : sev === 'reference'
                    ? 'Referência'
                    : '';
        tooltipEl.innerHTML = `
            <div class="relations-tooltip-name">${escapeHtml(hit.name)}</div>
            <div class="relations-tooltip-meta">
                ${hit.family ? `<span class="relations-tooltip-family">${escapeHtml(hit.family)}</span>` : ''}
            </div>
            ${sevLabel ? `<div class="relations-tooltip-sev relations-tooltip-sev--${sev}">${escapeHtml(sevLabel)}</div>` : ''}
            <div class="relations-tooltip-hint">${hit.depth === 0 ? 'Raiz · arraste para mover' : 'Clique para selecionar'}</div>`;
        tooltipEl.style.left = Math.min(px + 14, canvas.clientWidth - 220) + 'px';
        tooltipEl.style.top = Math.min(py + 14, canvas.clientHeight - 80) + 'px';
        tooltipEl.style.opacity = '1';
        tooltipEl.setAttribute('aria-hidden', 'false');
    };
    const handleLeave = () => {
        if (dragActive) {
            dragActive = false;
        }
        if (tooltipEl) {
            tooltipEl.setAttribute('aria-hidden', 'true');
            tooltipEl.style.opacity = '0';
        }
        canvas.style.cursor = 'default';
    };
    const handleClick = (ev: MouseEvent) => {
        // Se houve drag, NÃO trata como click.
        if (dragMoved) {
            dragMoved = false;
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const worldPt = canvasToWorld(px, py);
        const hit = hitTestBox(layout, worldPt.x, worldPt.y);
        if (!hit) return;
        if (hit.depth === 0) return;
        if ((window as any).handleSelectElement) {
            (window as any).handleSelectElement(hit.nodeId);
        }
    };

    // ===== Wheel (zoom centered no cursor) =====
    const handleWheel = (ev: WheelEvent) => {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const v = _getDiagramView(canvas);
        // Zoom factor: deltaY > 0 = zoom out, < 0 = zoom in
        const factor = ev.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(
            DIAGRAM_MIN_SCALE,
            Math.min(DIAGRAM_MAX_SCALE, v.scale * factor),
        );
        if (newScale === v.scale) return;
        // Zoom centered no ponto do cursor: ajusta offset para manter
        // (px, py) em world coords no mesmo ponto pré/pós zoom.
        const worldPx = (px - v.offsetX) / v.scale;
        const worldPy = (py - v.offsetY) / v.scale;
        v.scale = newScale;
        v.offsetX = px - worldPx * newScale;
        v.offsetY = py - worldPy * newScale;
        repaint();
    };

    // ===== Double-click: reset zoom + pan (auto-fit) =====
    const handleDoubleClick = (ev: MouseEvent) => {
        ev.preventDefault();
        const fit = _autoFitDiagramView(layout, w, h);
        const v = _getDiagramView(canvas);
        v.offsetX = fit.offsetX;
        v.offsetY = fit.offsetY;
        v.scale = fit.scale;
        repaint();
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseleave', handleLeave);
    // mouseup precisa ser no document para capturar release fora do canvas
    canvas.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('dblclick', handleDoubleClick);
}

function _renderTreeView(selected: any) {
    const container = _shellRightEl?.querySelector?.('.relations-side--tree') as HTMLElement | null;
    const canvas = container?.querySelector?.('.relations-tree-canvas') as HTMLCanvasElement | null;
    if (!container || !canvas) return;

    const sunburstRoot = _buildDescendantTree(selected, 4);
    const counts = computeTreeLayout(sunburstRoot as any, { indentPx: 16, maxDepth: 4 }).violationCounts;
    const displayRoot = resolveTreeDisplayRoot(container, sunburstRoot);

    renderTreeSummary(container, counts);
    renderTreeLegend(container, counts);

    const ctx = prepareTreeCanvas(canvas, container);
    if (!ctx) return;

    const { width, height } = canvasSizeFromContainer(container);
    const layout = computeTierGraphLayout(displayRoot as any, { width, height, maxDepth: 4 });
    _paintTierGraph(ctx, layout, width, height, _getTierView(canvas));
    _wireTierGraphInteraction(canvas, layout, width, height);
}

/**
 * Resolve a raiz de exibição da árvore, aplicando poda quando habilitada.
 * @param {HTMLElement} container
 * @param {SunburstNode} sunburstRoot
 * @returns {SunburstNode}
 */
function resolveTreeDisplayRoot(container: HTMLElement, sunburstRoot: SunburstNode): SunburstNode {
    if (!(CONFIG as any)?.FEATURES?.RELATIONS_PANEL_UX_V2) return sunburstRoot;
    const panelWidth = container.clientWidth || 360;
    return pruneTreeForDisplay(sunburstRoot as any, {
        maxChildrenPerNode: resolveMaxChildrenForWidth(panelWidth),
        keepIds: _highlightId ? [_highlightId] : [],
    }) as SunburstNode;
}

/**
 * Retorna o tamanho lógico do canvas a partir do container.
 * @param {HTMLElement} container
 * @returns {{ width: number, height: number }}
 */
function canvasSizeFromContainer(container: HTMLElement): { width: number; height: number } {
    return {
        width: Math.max(220, Math.floor((container.clientWidth || 280) - 4)),
        height: Math.max(220, Math.floor((container.clientHeight || 280) - 4)),
    };
}

/**
 * Prepara o canvas da árvore (DPR-aware) e retorna seu contexto 2D.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLElement} container
 * @returns {CanvasRenderingContext2D|null}
 */
function prepareTreeCanvas(canvas: HTMLCanvasElement, container: HTMLElement): CanvasRenderingContext2D | null {
    const { width, height } = canvasSizeFromContainer(container);
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
}

/**
 * Renderiza o summary de violações no modo árvore.
 * @param {HTMLElement} container
 * @param {any} counts
 */
function renderTreeSummary(container: HTMLElement, counts: any): void {
    let summaryEl = container.querySelector('.relations-tree-summary') as HTMLElement | null;
    const badgeVm = buildCriticalBadgeVM(counts, {
        featureOn: !!(CONFIG as any)?.FEATURES?.RELATIONS_PANEL_UX_V2,
    });
    if (!badgeVm.visible) {
        if (summaryEl) summaryEl.remove();
        return;
    }
    if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.className = 'relations-tree-summary';
        container.prepend(summaryEl);
    }
    summaryEl.innerHTML = buildTreeSummaryHtml(badgeVm);
    if (badgeVm.actionable) {
        const btn = summaryEl.querySelector('[data-relations-critical-action]') as HTMLElement | null;
        btn?.addEventListener('click', () => {
            const fn = (window as any).handleOpenViolationsPanel;
            if (typeof fn === 'function') fn();
        });
    }
}

/**
 * Gera o HTML do summary de violações.
 * @param {any} badgeVm
 * @returns {string}
 */
function buildTreeSummaryHtml(badgeVm: any): string {
    const critN = badgeVm.interventionCount;
    const critLabel = escapeHtml(
        t(badgeVm.labelKey, { n: critN }) || `${critN} crítica${critN > 1 ? 's' : ''}`,
    );
    const critAria = escapeHtml(t('relationsPanel.criticalBadgeAria', { n: critN }) || `${critN} críticas — abrir lista`);
    const critTag = badgeVm.actionable
        ? '<button type="button" class="relations-tree-sev-tag relations-tree-sev-tag--intervention relations-tree-sev-tag--action" ' +
          'data-relations-critical-action aria-label="' + critAria + '">&#9888; ' + critLabel + '</button>'
        : '<span class="relations-tree-sev-tag relations-tree-sev-tag--intervention">&#9888; ' + critLabel + '</span>';
    const preventionTag = badgeVm.preventionCount > 0
        ? '<span class="relations-tree-sev-tag relations-tree-sev-tag--prevention">&#9888; ' +
          badgeVm.preventionCount + ' ' + escapeHtml(t('relationsPanel.attention') || 'atenção') + '</span>'
        : '';
    return [critN > 0 ? critTag : '', preventionTag].join('');
}

/**
 * Renderiza a legenda de severidade no modo árvore.
 * @param {HTMLElement} container
 * @param {any} counts
 */
function renderTreeLegend(container: HTMLElement, counts: any): void {
    const legendOn = !!(CONFIG as any)?.FEATURES?.RELATIONS_PANEL_UX_V2;
    let legendEl = container.querySelector('.relations-legend') as HTMLElement | null;
    const legend = legendOn ? buildSeverityLegend(counts, (s) => severityDotColor(s as any)) : [];
    if (legend.length === 0) {
        if (legendEl) legendEl.remove();
        return;
    }
    if (!legendEl) {
        legendEl = document.createElement('div');
        legendEl.className = 'relations-legend';
        legendEl.setAttribute('role', 'group');
        legendEl.setAttribute('aria-label', t('relationsPanel.legendTitle') || 'Legenda');
        container.appendChild(legendEl);
    }
    legendEl.innerHTML = buildTreeLegendHtml([...legend]);
}

/**
 * Gera o HTML da legenda de severidade.
 * @param {any[]} legend
 * @returns {string}
 */
function buildTreeLegendHtml(legend: any[]): string {
    return (
        '<span class="relations-legend-title">' +
        escapeHtml(t('relationsPanel.legendTitle') || 'Legenda') +
        '</span>' +
        legend
            .map(
                (e) =>
                    '<span class="relations-legend-item">' +
                    '<span class="relations-legend-glyph relations-legend-glyph--' +
                    e.severity +
                    '" aria-hidden="true">' +
                    e.glyphChar +
                    '</span>' +
                    '<span class="relations-legend-label">' +
                    escapeHtml(t(e.labelKey) || e.severity) +
                    '</span></span>',
            )
            .join('')
    );
}

// ===== Tier graph (modo Tree) — interação completa =====
// Research: .runtime/research/interactive-tier-graph-ux-2026-06-11.md
// (Cambridge Intelligence + Tom Sawyer + Grafana + A11Y Collective):
// pan/zoom, drag de nós com arestas seguindo, hover focus+context
// (conectados acendem, resto esmaece), duplo-clique abre edição,
// teclado navegável (setas/Enter/Escape).

interface TierView { offsetX: number; offsetY: number; scale: number }
const TIER_MIN_SCALE = 0.3;
const TIER_MAX_SCALE = 4;
const _tierViewByCanvas = new WeakMap<HTMLCanvasElement, TierView>();
/** Offsets de drag por nó (sessão; reset no double-click do fundo). */
const _tierNodeOffsets = new Map<string, { dx: number; dy: number }>();
let _tierHoverId: string | null = null;

function _getTierView(canvas: HTMLCanvasElement): TierView {
    let v = _tierViewByCanvas.get(canvas);
    if (!v) {
        v = { offsetX: 0, offsetY: 0, scale: 1 };
        _tierViewByCanvas.set(canvas, v);
    }
    return v;
}

function _tierNodePos(n: { id: string; x: number; y: number }) {
    const off = _tierNodeOffsets.get(n.id);
    return off ? { x: n.x + off.dx, y: n.y + off.dy } : { x: n.x, y: n.y };
}

/**
 * Desenha uma seta na ponta de uma aresta (recuada do nó-alvo, sólida sem dash).
 * RELATIONS-UX-001 F4 (R8): comunica direção do fluxo (aproxima do modelo).
 */
function _drawEdgeArrowhead(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
    color: string,
): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 14) return; // arestas curtas: sem seta (evita poluir)
    const ux = dx / len;
    const uy = dy / len;
    const tipX = b.x - ux * 9; // recua do alvo p/ não cobrir o nó
    const tipY = b.y - uy * 9;
    const size = 4.5;
    const baseX = tipX - ux * size;
    const baseY = tipY - uy * size;
    const px = -uy; // perpendicular ao sentido
    const py = ux;
    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX + px * size * 0.6, baseY + py * size * 0.6);
    ctx.lineTo(baseX - px * size * 0.6, baseY - py * size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

/** Paint do grafo em camadas (referência visual: constellation tiers). */
function _paintTierGraph(
    ctx: CanvasRenderingContext2D,
    layout: TierGraphLayout,
    w: number,
    h: number,
    view: TierView,
) {
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);

    const pos = new Map<string, { x: number; y: number }>();
    for (const n of layout.nodes) pos.set(n.id, _tierNodePos(n));

    const hover = _tierHoverId;
    const connected = computeConnectedNodeIds(layout, hover);
    const v2 = !!(CONFIG as any)?.FEATURES?.RELATIONS_PANEL_UX_V2;

    drawTierEdges(ctx, layout, pos, hover, connected, v2);
    drawTierNodes(ctx, layout, pos, hover, connected, v2);

    ctx.restore();
}

/**
 * Computa o conjunto de ids conectados ao nó em hover.
 * @param {TierGraphLayout} layout
 * @param {string|null} hover
 * @returns {Set<string>}
 */
function computeConnectedNodeIds(layout: TierGraphLayout, hover: string | null): Set<string> {
    const connected = new Set<string>();
    if (!hover) return connected;
    connected.add(hover);
    for (const e of layout.edges) {
        if (e.sourceId === hover) connected.add(e.targetId);
        if (e.targetId === hover) connected.add(e.sourceId);
    }
    return connected;
}

/**
 * Resolve a cor de uma aresta do tier graph.
 * @param {boolean} lit
 * @param {boolean} faded
 * @param {boolean} v2
 * @returns {string}
 */
function tierEdgeColor(lit: boolean, faded: boolean, v2: boolean): string {
    if (lit) return 'rgba(94, 234, 212, 0.85)';
    if (faded) return 'rgba(148, 163, 184, 0.10)';
    return v2 ? 'rgba(242, 142, 43, 0.40)' : 'rgba(148, 163, 184, 0.30)';
}

/**
 * Desenha as arestas do tier graph.
 * @param {CanvasRenderingContext2D} ctx
 * @param {TierGraphLayout} layout
 * @param {Map<string, {x:number,y:number}>} pos
 * @param {string|null} hover
 * @param {Set<string>} connected
 * @param {boolean} v2
 */
function drawTierEdges(
    ctx: CanvasRenderingContext2D,
    layout: TierGraphLayout,
    pos: Map<string, { x: number; y: number }>,
    hover: string | null,
    connected: Set<string>,
    v2: boolean,
): void {
    ctx.save();
    ctx.setLineDash([2, 4]);
    for (const e of layout.edges) {
        const a = pos.get(e.sourceId);
        const b = pos.get(e.targetId);
        if (!a || !b) continue;
        const lit = hover === e.sourceId || hover === e.targetId;
        const faded = hover !== null && !lit;
        ctx.strokeStyle = tierEdgeColor(lit, faded, v2);
        ctx.lineWidth = lit ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        if (v2 && !faded) {
            _drawEdgeArrowhead(ctx, a, b, lit ? 'rgba(94, 234, 212, 0.9)' : 'rgba(242, 142, 43, 0.6)');
        }
    }
    ctx.restore();
}

/**
 * Desenha os nós do tier graph.
 * @param {CanvasRenderingContext2D} ctx
 * @param {TierGraphLayout} layout
 * @param {Map<string, {x:number,y:number}>} pos
 * @param {string|null} hover
 * @param {Set<string>} connected
 * @param {boolean} v2
 */
function drawTierNodes(
    ctx: CanvasRenderingContext2D,
    layout: TierGraphLayout,
    pos: Map<string, { x: number; y: number }>,
    hover: string | null,
    connected: Set<string>,
    v2: boolean,
): void {
    for (const n of layout.nodes) {
        const p = pos.get(n.id)!;
        const dimmed = hover ? !connected.has(n.id) : false;
        drawTierNode(ctx, n, p, dimmed, hover, v2);
    }
}

/**
 * Desenha um único nó do tier graph.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} n
 * @param {{x:number,y:number}} p
 * @param {boolean} dimmed
 * @param {string|null} hover
 * @param {boolean} v2
 */
function drawTierNode(
    ctx: CanvasRenderingContext2D,
    n: any,
    p: { x: number; y: number },
    dimmed: boolean,
    hover: string | null,
    v2: boolean,
): void {
    ctx.globalAlpha = dimmed ? 0.3 : 1;
    const fill = n.depth === 0 || !n.family ? '#8a93a3' : reserveSeverityRed(familyColor(n.family));

    ctx.beginPath();
    ctx.arc(p.x, p.y, n.r + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p.x, p.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();

    ctx.strokeStyle = 'rgba(15, 15, 23, 0.85)';
    ctx.lineWidth = 1;
    ctx.stroke();

    drawTierNodeSeverityRing(ctx, n, p);
    drawTierNodeHighlightRing(ctx, n, p, hover);
    if (v2 && !dimmed && (n.depth === 1 || /__more$/.test(n.id))) {
        drawTierNodeLabel(ctx, n, p);
    }
    ctx.globalAlpha = 1;
}

/**
 * Desenha o anel de severidade de um nó (raiz não recebe).
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} n
 * @param {{x:number,y:number}} p
 */
function drawTierNodeSeverityRing(ctx: CanvasRenderingContext2D, n: any, p: { x: number; y: number }): void {
    if (n.depth === 0) return;
    const sevColor = boxSeverityColor(n.severity as BoxTreeSeverity);
    if (!sevColor) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, n.r + 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = sevColor;
    ctx.lineWidth = n.severity === 'intervention' ? 2 : 1.5;
    ctx.stroke();
}

/**
 * Desenha o anel de destaque/hover de um nó.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} n
 * @param {{x:number,y:number}} p
 * @param {string|null} hover
 */
function drawTierNodeHighlightRing(
    ctx: CanvasRenderingContext2D,
    n: any,
    p: { x: number; y: number },
    hover: string | null,
): void {
    const isHighlight = _highlightId != null && n.id === _highlightId;
    if (hover !== n.id && !isHighlight) return;
    ctx.beginPath();
    ctx.arc(p.x, p.y, n.r + 4, 0, Math.PI * 2);
    ctx.strokeStyle = isHighlight && hover !== n.id ? 'rgba(255, 255, 255, 0.9)' : 'rgba(94, 234, 212, 0.9)';
    ctx.lineWidth = isHighlight ? 2 : 1.5;
    ctx.stroke();
}

/**
 * Desenha o rótulo direto de um nó de 1º nível ou agregador.
 * @param {CanvasRenderingContext2D} ctx
 * @param {any} n
 * @param {{x:number,y:number}} p
 */
function drawTierNodeLabel(ctx: CanvasRenderingContext2D, n: any, p: { x: number; y: number }): void {
    const isMore = /__more$/.test(n.id);
    const raw = String(n.name || '');
    const label = isMore || raw.length <= 12 ? raw : raw.slice(0, 11) + '…';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = isMore ? 'rgba(148, 163, 184, 0.95)' : 'rgba(226, 232, 240, 0.92)';
    ctx.fillText(label, p.x, p.y + n.r + 4);
}

/** Hit-test em coords de tela (inverte view e offsets de drag). */
function _tierHitAt(canvas: HTMLCanvasElement, layout: TierGraphLayout, px: number, py: number) {
    const v = _getTierView(canvas);
    const wx = (px - v.offsetX) / v.scale;
    const wy = (py - v.offsetY) / v.scale;
    let best: any = null;
    let bestDist = Infinity;
    for (const n of layout.nodes) {
        const p = _tierNodePos(n);
        const d = Math.hypot(p.x - wx, p.y - wy);
        if (d <= n.r + 4 && d < bestDist) {
            best = n;
            bestDist = d;
        }
    }
    return best;
}

/**
 * Interação completa: drag de nó / pan no fundo / zoom wheel /
 * duplo-clique nó = abrir edição, fundo = reset / hover focus+context /
 * teclado (setas navegam, Enter seleciona, Escape limpa).
 */
function _wireTierGraphInteraction(canvas: HTMLCanvasElement, layout: TierGraphLayout, w: number, h: number) {
    const tooltip = canvas.parentElement?.querySelector('.relations-tooltip') as HTMLElement | null;

    function repaint() {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        _paintTierGraph(ctx, layout, w, h, _getTierView(canvas));
    }

    function showTooltip(n: any) {
        if (!tooltip) return;
        const v = _getTierView(canvas);
        const p = _tierNodePos(n);
        // RELATIONS-UX-001 F8: tooltip RICO com info do elemento (Calvin
        // "ao colocar o mouse sobre os elementos dar informações"). Busca o
        // elemento real + conta filhos no grafo; monta VM pure.
        let element: any = null;
        try {
            if (n?.id && n.id !== '__model_root__' && !/__more$/.test(String(n.id))) {
                element = getElementById(String(n.id));
            }
        } catch (e: any) {
            console.debug('[relations:tooltip:getElement]', e?.message || e);
        }
        let childCount = 0;
        for (const e of layout.edges) if (e.sourceId === n.id) childCount++;
        const modelTotal = (() => {
            try {
                return getAllElements()?.length || 0;
            } catch {
                return 0;
            }
        })();
        const vm = buildNodeTooltipVM(n, element, { childCount, modelTotal });
        const rowsHtml = vm.rows
            .map(
                (r) =>
                    `<span class="relations-tooltip-count">${escapeHtml(tr(r.label, r.label))}: ${escapeHtml(r.value)}</span>`,
            )
            .join('');
        const sevHtml = vm.severityKey
            ? `<div class="relations-tooltip-sev relations-tooltip-sev--${vm.severity}">${escapeHtml(tr(vm.severityKey, ''))}</div>`
            : '';
        const descHtml = vm.description
            ? `<div class="relations-tooltip-desc">${escapeHtml(vm.description.slice(0, 140))}</div>`
            : '';
        const famHtml = vm.familyLabel
            ? `<span class="relations-tooltip-family">${escapeHtml(vm.familyLabel)}</span>`
            : '';
        tooltip.innerHTML =
            `<div class="relations-tooltip-name">${escapeHtml(vm.title)}</div>` +
            (famHtml || rowsHtml ? `<div class="relations-tooltip-meta">${famHtml}${rowsHtml}</div>` : '') +
            sevHtml +
            descHtml +
            `<div class="relations-tooltip-hint">${escapeHtml(tr(vm.hintKey, ''))}</div>`;
        tooltip.style.left = Math.round(p.x * v.scale + v.offsetX + 10) + 'px';
        tooltip.style.top = Math.round(p.y * v.scale + v.offsetY - 8) + 'px';
        tooltip.setAttribute('aria-hidden', 'false');
        tooltip.classList.add('is-visible');
    }
    function hideTooltip() {
        tooltip?.classList.remove('is-visible');
        tooltip?.setAttribute('aria-hidden', 'true');
    }

    function selectNode(id: string) {
        if (id !== '__model_root__' && (window as any).handleSelectElement) {
            (window as any).handleSelectElement(id);
        }
    }

    let mode: any = null;

    canvas.onmousedown = (ev: MouseEvent) => {
        if (ev.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        const hit = _tierHitAt(canvas, layout, ev.clientX - rect.left, ev.clientY - rect.top);
        if (hit) {
            const off = _tierNodeOffsets.get(hit.id) || { dx: 0, dy: 0 };
            mode = { kind: 'node', id: hit.id, startX: ev.clientX, startY: ev.clientY, baseDx: off.dx, baseDy: off.dy, moved: false };
        } else {
            const v = _getTierView(canvas);
            mode = { kind: 'pan', startX: ev.clientX, startY: ev.clientY, baseOx: v.offsetX, baseOy: v.offsetY, moved: false };
        }
        canvas.style.cursor = 'grabbing';
        ev.preventDefault();
    };

    canvas.onmousemove = (ev: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        if (mode) {
            const dx = ev.clientX - mode.startX;
            const dy = ev.clientY - mode.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) mode.moved = true;
            const v = _getTierView(canvas);
            if (mode.kind === 'node') {
                _tierNodeOffsets.set(mode.id, { dx: mode.baseDx + dx / v.scale, dy: mode.baseDy + dy / v.scale });
            } else {
                v.offsetX = mode.baseOx + dx;
                v.offsetY = mode.baseOy + dy;
            }
            hideTooltip();
            repaint();
            return;
        }
        const hit = _tierHitAt(canvas, layout, px, py);
        const newHover = hit ? hit.id : null;
        canvas.style.cursor = hit ? 'pointer' : 'grab';
        if (newHover !== _tierHoverId) {
            _tierHoverId = newHover;
            repaint();
        }
        if (hit) showTooltip(hit);
        else hideTooltip();
    };

    const endDrag = () => {
        if (!mode) return;
        const wasNodeClick = mode.kind === 'node' && !mode.moved;
        const id = mode.kind === 'node' ? mode.id : null;
        mode = null;
        canvas.style.cursor = 'grab';
        if (wasNodeClick && id) selectNode(id);
    };
    canvas.onmouseup = endDrag;
    canvas.onmouseleave = () => {
        if (mode) endDrag();
        _tierHoverId = null;
        hideTooltip();
        repaint();
    };

    canvas.ondblclick = (ev: MouseEvent) => {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const hit = _tierHitAt(canvas, layout, ev.clientX - rect.left, ev.clientY - rect.top);
        if (hit) {
            // Duplo-clique = editar: seleciona e abre o painel de detalhes
            selectNode(hit.id);
            const open =
                (window as any).handleOpenElementDetails ||
                (window as any).handleShowElementDetails ||
                (window as any).handleEditElement;
            if (typeof open === 'function' && hit.id !== '__model_root__') open(hit.id);
        } else {
            // Fundo: reset de view + posições arrastadas
            _tierNodeOffsets.clear();
            const v = _getTierView(canvas);
            v.offsetX = 0;
            v.offsetY = 0;
            v.scale = 1;
            repaint();
        }
    };

    canvas.onwheel = (ev: WheelEvent) => {
        ev.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const v = _getTierView(canvas);
        const factor = ev.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(TIER_MIN_SCALE, Math.min(TIER_MAX_SCALE, v.scale * factor));
        if (newScale === v.scale) return;
        const worldPx = (px - v.offsetX) / v.scale;
        const worldPy = (py - v.offsetY) / v.scale;
        v.scale = newScale;
        v.offsetX = px - worldPx * newScale;
        v.offsetY = py - worldPy * newScale;
        repaint();
    };

    // Teclado (A11Y Collective: grafo todo navegável sem mouse).
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.onkeydown = (ev: KeyboardEvent) => {
        const ids = layout.nodes.map((n) => n.id);
        if (ids.length === 0) return;
        const idx = _tierHoverId ? ids.indexOf(_tierHoverId) : -1;
        if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') {
            _tierHoverId = ids[(idx + 1) % ids.length] ?? null;
        } else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowUp') {
            _tierHoverId = ids[(idx - 1 + ids.length) % ids.length] ?? null;
        } else if (ev.key === 'Enter' && _tierHoverId) {
            selectNode(_tierHoverId);
            return;
        } else if (ev.key === 'Escape') {
            _tierHoverId = null;
            hideTooltip();
            repaint();
            return;
        } else {
            return;
        }
        ev.preventDefault();
        const n = layout.nodes.find((x) => x.id === _tierHoverId);
        if (n) showTooltip(n);
        repaint();
    };
}

function _wireViewToggle() {
    if (!_shellRightEl) return;
    _shellRightEl.querySelectorAll('.relations-view-btn').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            if (view !== 'sunburst' && view !== 'tree' && view !== 'diagram') return;
            if (view === _viewMode) return;
            _setViewMode(view as RelationsViewMode);
            _focusedId = null;
            _focusStack = [];
            _paint();
        });
    });
}

function _wireBreadcrumb() {
    if (!_shellRightEl) return;
    _shellRightEl.querySelectorAll('.relations-crumb').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-crumb-index') || '-1', 10);
            if (idx === -1) {
                _focusStack = [];
                _focusedId = null;
            } else {
                _focusStack = _focusStack.slice(0, idx + 1);
                _focusedId = _focusStack[_focusStack.length - 1]?.id || null;
            }
            _paint();
        });
    });
}

function _wireItemClicks() {
    if (!_shellRightEl) return;
    _shellRightEl.querySelectorAll('.relations-item[data-element-id]').forEach((el: any) => {
        const select = () => {
            const id = el.getAttribute('data-element-id');
            if (id && (window as any).handleSelectElement) (window as any).handleSelectElement(id);
        };
        el.addEventListener('click', select);
        el.addEventListener('keydown', (ev: any) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                select();
            }
        });
    });
}
