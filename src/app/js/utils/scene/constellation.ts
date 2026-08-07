// @ts-check
// Generated from src/app/js/utils/scene/constellation.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   CONSTELLATION — Element relationship graph visualization
   ================================================================

   Visualizacao interativa de relacoes entre elementos no viewport 3D.
   Inspirada na arvore de habilidades do Skyrim (constelacao).

   Barra fixa na parte inferior do viewport 3D mostrando:
   - Elemento selecionado como no central
   - Elementos conectados (edges) como nos satelite clicaveis
   - Observacoes como pontos ao redor do centro (clicaveis para editar)
   - Linhas de conexao coloridas por categoria de edge

   Renderizacao ESTATICA (sem requestAnimationFrame).
   Overlays HTML para edicao de observacoes.
   ================================================================ */
import { getElementById, getSelectedElement, getAllElements } from '../../core/elements/manager.js';
import { getConnectedEdges, getAllEdges } from '../edges/manager.js';
import { EDGE_CATEGORIES, getEdgeType } from '../edges/types.js';
import { CONFIG } from '../../config.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { createLogger } from '../helpers/logger.js';
import {
    buildGraph,
    layoutCircular,
    layoutForceDirected,
    layoutHierarchical,
    layoutSpatial,
    RELATION_LAYERS,
} from '../../core/constellation/graph.js';
import { hydrateIcons, getIcon } from '../ui/icons.js';
import { clampMenuToViewport, installCloseListeners, applyMenuA11y } from '../ui/contextMenuHelpers.js';
import {
    updatePDPLUTable,
    exportPDPLUCSV,
    switchConstellationTab as _switchTab,
    getActiveConstellationTab,
} from './constellationTable.js';
import { scheduleResizeSync } from './setup.js';
import { isConstellationVisible } from '../ui/panelManager.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { t } from '../i18n/translations.js';
import {
    initConstellationControls,
    exportGraphToSvg,
    getActiveLayoutMode,
    getActiveLayers,
    setImpactControlActive,
    setMetricSizingControlState,
} from '../ui/constellationControls.js';
import {
    initConstellationInfoPanel,
    showInfoPanel,
    setSelectedNodes,
    setSelectedEdge,
    setGraphRef,
} from '../ui/constellationInfoPanel.js';
import { ConstellationWebGLRenderer } from './constellationWebGL.js';
import { buildConstellationMetricSizingUiState } from './constellationMetricSizingUiBridge.js';
import { applyImpactHighlightsToScene, buildImpactHudState } from '../../core/constellation/impactAnalysis.js';
import { isPointInCircle, pickNodeAt } from '../../core/constellation/nodePicking.js';
import { LABEL_ZOOM_DAMP, labelScale as _pureLabelScale, resolveNodeLabel as _pureResolveNodeLabel, resolveNodeLabelTier as _pureResolveNodeLabelTier, baseFontForTier as _pureBaseFontForTier, maxCharsForTier as _pureMaxCharsForTier } from '../../core/constellation/nodeLabelSizing.js';
import {
    saveConstellationLayout,
    listConstellationLayouts,
    getConstellationLayout,
    deleteConstellationLayout,
} from '../../core/constellation/persistence.js';
const _logConstellation = createLogger('constellation');
const appWindow: any = () => (window as any);
/** @param {unknown} error */
const errorMessage = (error: any) =>
    error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
/**
 * @typedef {Record<string, any>} AnyRecord
 * @typedef {any} ConstellationNode
 * @typedef {any} ConstellationEdge
 * @typedef {any} ConstellationLine
 * @typedef {{enabled:boolean, metric:string, metricField:string, label:string}} MetricSizingState
 * @typedef {{signature:string, graph:any, nodes:Array<ConstellationNode>, lines:Array<ConstellationLine>, summary:any}} ModelGraphCache
 */
// --- Module state ---
let canvas: any = null;
let ctx: any = null;
let currentNodes: any = [];
let currentLines: any = [];
/** @type {Function|null} */
let _onSelect: any = null;
/** @type {string|null} */
let _selectedId: any = null;
let hoveredNodeId: any = null;
let activeEditIndex: any = null; // index of observation being edited
let activeObsList = false; // whether obs list popover is open
let canvasW = 800;
let canvasH = 120;
/** @type {ResizeObserver|null} */
let _resizeObserver: any = null; // ECBT05: Cleanup reference
/** @type {any} */
let _webglRenderer: any = null;
let _webglMode = false;
/** @type {string|null} */
let _dragNodeId: any = null;
let _dragStartX = 0;
let _dragStartY = 0;
let _dragHasMoved = false;
let _graphMode = 'focus';
/** @type {ReturnType<typeof setTimeout>|null} */
let _updateTimer: any = null; // PERF-G1: debounce timer
/** @type {string|null} */
let _lastModelSignature: any = null; // PERF-G2: skip rebuild when model unchanged
/** @type {string|null} */
let _lastUiBridgeSnapshot: any = null;
/** @type {any} */
let _lastUiBridgeState: any = null;
// ── NAV-002: View transform (zoom + pan) ──────────────────────────
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 4.0;
let _viewX = 0;
let _viewY = 0;
let _viewScale = 1.0;
// ── CONSTELLATION-ZOOM-CRISP (Calvin 2026-06-03): nitidez + zoom gracioso ──
// (A) HiDPI: o backing store do canvas era dimensionado em px CSS (canvas.width =
//     clientWidth), então em telas escaladas do Windows (devicePixelRatio > 1) o
//     browser fazia upscale → tudo borrado. Agora o buffer = px CSS × _dpr e o
//     desenho roda em coords lógicas (px CSS) com o _dpr embutido no transform.
//     _dpr é capeado em 2 para limitar memória do buffer em telas 3×/4×.
// (B) Zoom semântico: zoom geométrico puro inflava fontes/badges linearmente
//     (9px → 36px a 4×, ilegível). _labelScale() amortece o crescimento de texto
//     e decorações para que cresçam ~sub-linearmente — "graciosamente proporcional".
let _dpr = 1;
// LABEL_ZOOM_DAMP importado de core/constellation/nodeLabelSizing (ARCH-MONOLITH-ATOMIZATION-001)
// CONSTELLATION-CONFIG-MENU (Calvin 2026-06-03): menu de configuração por botão
// direito sobre o canvas. _userHideLabels é preferência persistida (oculta rótulos
// dos nós). _configMenuEl/_configMenuCloseCtrl gerenciam o ciclo de vida do menu.
let _userHideLabels = false;
let _configMenuEl: any = null;
let _configMenuCloseCtrl: AbortController | null = null;
// CONSTELLATION-A11Y (Calvin 2026-06-03): navegação por teclado nos nós. O canvas
// vira focável (tabindex=0, role=application); setas percorrem currentNodes,
// Enter/Espaço seleciona, Escape limpa. Um anel de foco é desenhado no nó focado e
// uma região aria-live (polite) anuncia o nó ao leitor de tela.
let _kbFocusedNodeId: string | null = null;
let _kbLiveRegion: any = null;
/**
 * Multiplicador (espaço-grafo) aplicado a fontes/badges para que o tamanho na
 * TELA cresça de forma amortecida quando o usuário dá zoom in. Em zoom ≤ 1
 * mantém o comportamento geométrico (retorna 1) para não destoar do default.
 * @returns {number}
 */
function _labelScale(): number {
    return _pureLabelScale(_viewScale, LABEL_ZOOM_DAMP);
}
/**
 * Redimensiona o backing store do canvas considerando devicePixelRatio.
 * canvasW/canvasH permanecem em px CSS (coords lógicas usadas por todo o layout);
 * o buffer real fica em px físicos (cssPx × _dpr). O _dpr é embutido no transform
 * em draw()/overlays.
 * @param {number} cssW
 * @param {number} cssH
 */
function _resyncCanvasBackingStore(cssW: number, cssH: number) {
    if (!canvas) return;
    _dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    canvasW = cssW;
    canvasH = cssH;
    const bw = Math.round(cssW * _dpr);
    const bh = Math.round(cssH * _dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
}
// ── NAV-002: Pan state ────────────────────────────────────────────
let _isPanning = false;
let _panStartX = 0;
let _panStartY = 0;
let _panOriginX = 0;
let _panOriginY = 0;
// ── NAV-002: Tooltip ──────────────────────────────────────────────
/** @type {ReturnType<typeof setTimeout>|null} */
let _tooltipTimer: any = null;
/** @type {HTMLDivElement|null} */
let _tooltipEl: any = null;
// ── NAV-002: Minimap ─────────────────────────────────────────────
/** @type {HTMLCanvasElement|null} */
let _minimapCanvas: any = null;
/** @type {CanvasRenderingContext2D|null} */
let _minimapCtx: any = null;
let _minimapVisible = false;
let _modelGraphCache: any = {
    signature: '',
    graph: null,
    nodes: [],
    lines: [],
    summary: null,
};
let _impactModeActive = false;
/** @type {string|null} */
let _impactSourceId: any = null;
/** @type {any} */
let _impactHudState: any = null;
let _impactSceneSignature = '';
let _impactOptions = Object.freeze({ depth: 3, direction: 'out' });
let _metricSizingState: any = Object.freeze({
    enabled: true,
    metric: 'violations',
    metricField: 'violationScore',
    label: 'Violations',
});
/** @type {Record<string, string>} */
const IMPACT_NODE_COLORS = Object.freeze({
    source: '#FFFFFF',
    critical: '#FF5252',
    direct: '#FF8A65',
    indirect: '#FFB74D',
});
/** @type {Record<string, string>} */
const IMPACT_LINE_COLORS = Object.freeze({
    critical: '#FF5252',
    affected: '#FFB74D',
});
/**
 * @param {AnyRecord|null|undefined} element
 * @returns {Array<AnyRecord>}
 */
function _getElementObservations( element: any) {
    return element?.data?.observations || element?.observations || [];
}
/**
 * @param {Array<AnyRecord>} observations
 * @returns {number}
 */
function _computeViolationScore( observations: any) {
    if (!Array.isArray(observations)) return 0;
    return observations.reduce((/** @type {any} */ sum, obs) => {
        if (!obs || typeof obs !== 'object') return sum;
        if (obs.exceedsVI || obs.exceedsCMA || obs.thresholdLevel === 'VI' || obs.thresholdLevel === 'CMA') {
            return sum + 4;
        }
        if (obs.exceedsVP || obs.thresholdLevel === 'VP') return sum + 2;
        if (obs.exceedsVR || obs.thresholdLevel === 'VR') return sum + 1;
        if (obs.exceeded === true || obs.isExceedance === true) return sum + 1;
        return sum;
    }, 0);
}
/**
 * @param {AnyRecord|null|undefined} element
 * @param {number} [degree]
 * @returns {AnyRecord}
 */
function _buildNodeMetricPayload( element: any, degree: any = 0) {
    const observations = _getElementObservations(element);
    const uncertainties = observations
        .map((obs: any) => Number(obs?.uncertainty ?? obs?.uncertaintyPct ?? 0))
        .filter((value: any) => Number.isFinite(value) && value >= 0);
    const uncertainty = uncertainties.length
        ? uncertainties.reduce((sum: any, value: any) => sum + value, 0) / uncertainties.length
        : 0;
    const eisScore = Number(element?.eisScore ?? element?.eis?.score ?? element?.data?.eisScore ?? 0);
    return {
        obsCount: observations.length,
        violationScore: _computeViolationScore(observations),
        eisScore: Number.isFinite(eisScore) ? Math.max(0, eisScore) : 0,
        degree: Number.isFinite(degree) ? Math.max(0, degree) : 0,
        uncertainty,
    };
}
/**
 * @param {Partial<MetricSizingState>|AnyRecord} [state]
 * @returns {Readonly<MetricSizingState>}
 */
export function setConstellationMetricSizingState( state: any = {}) {
    _metricSizingState = Object.freeze({
        enabled: state.enabled !== false,
        metric: state.metric || _metricSizingState.metric,
        metricField: state.metricField || _metricSizingState.metricField,
        label: state.label || _metricSizingState.label,
    });
    setMetricSizingControlState(_metricSizingState);
    drawStatic();
    return _metricSizingState;
}
function syncMainViewportLayout() {
    scheduleResizeSync(
        document.getElementById('canvas-container'),
        undefined,
        document.getElementById('constellation-hud'),
    );
}
function _isHostedInActionsShell() {
    return (
        document.getElementById('constellation-hud')?.classList.contains('actions-shell-constellation-hosted') === true
    );
}
/**
 * @param {string} eventName
 * @param {AnyRecord} [detail]
 */
function _dispatchHostedActionsIntegrationEvent( eventName: any, detail: any = {}) {
    if (!_isHostedInActionsShell()) return;
    window.dispatchEvent(
        new CustomEvent(`actions:integration:${eventName}`, {
            detail: {
                source: 'constellation',
                graphMode: _graphMode,
                timestamp: Date.now(),
                ...detail,
            },
        }),
    );
}
function _getActiveConstellationView() {
    const activeTab = getActiveConstellationTab?.() || 'graph';
    const activeView = document.getElementById(`constellation-view-${activeTab}`);
    if (activeView instanceof HTMLElement && getComputedStyle(activeView).display !== 'none') {
        return activeView;
    }
    const graphView = document.getElementById('constellation-view-graph');
    if (graphView instanceof HTMLElement && getComputedStyle(graphView).display !== 'none') {
        return graphView;
    }
    return canvas?.parentElement instanceof HTMLElement ? canvas.parentElement : null;
}
/**
 * @param {string} nodeId
 * @returns {boolean}
 */
function _openHostedNodeInModel( nodeId: any) {
    if (!_isHostedInActionsShell() || !nodeId) return false;
    if (_onSelect) _onSelect(nodeId);
    _dispatchHostedActionsIntegrationEvent('open-in-model', { nodeId });
    if (typeof appWindow().switchGroup === 'function') {
        const maybePromise = appWindow().switchGroup('model', { skipAuthGate: true });
        Promise.resolve(maybePromise)
            .catch(() => null)
            .finally(() => {
                window.setTimeout(() => {
                    appWindow().focusElementInViewport?.(nodeId);
                }, 260);
            });
        return true;
    }
    return false;
}
/**
 * @param {ConstellationNode|AnyRecord|null|undefined} node
 * @returns {string}
 */
function _sceneNodeId( node: any) {
    if (node?.id === null || node?.id === undefined) return '';
    return String(node.id).trim();
}
/**
 * @param {ConstellationLine|AnyRecord|null|undefined} obj
 * @param {'source'|'target'} key
 * @returns {string}
 */
/**
 * Safely reads a value from a possibly null object.
 * @param {any} obj
 * @param {string} key
 * @returns {any}
 */
function _safeGet(obj: any, key: string) {
    return obj ? obj[key] : undefined;
}

/**
 * Resolves the endpoint id of a scene line for the given side.
 * @param {any} line
 * @param {'source'|'target'} side
 * @returns {string}
 */
function _sceneLineEndpoint( line: any, side: any) {
    const isSource = side === 'source';
    const edge = _safeGet(line, 'edge') || {};
    const candidates = isSource
        ? [
            _safeGet(edge, 'sourceId'),
            _safeGet(edge, 'source'),
            _safeGet(line, 'sourceId'),
            _safeGet(line, 'source'),
            _safeGet(line, 'fromNodeId'),
            _safeGet(_safeGet(line, 'from'), 'id'),
        ]
        : [
            _safeGet(edge, 'targetId'),
            _safeGet(edge, 'target'),
            _safeGet(line, 'targetId'),
            _safeGet(line, 'target'),
            _safeGet(line, 'toNodeId'),
            _safeGet(_safeGet(line, 'to'), 'id'),
        ];
    for (const value of candidates) {
        if (value != null)
            return String(value).trim();
    }
    return '';
}
/**
 * Converts the live scene-node/line shape into the pure impact-analysis model.
 *
 * @param {Array<any>} node
 * @param {Array<any>} lines
 * @returns {any}
 */
/**
 * Builds a single impact-model node from a scene node.
 * @param {any} node
 * @returns {any|null}
 */
/**
 * Resolves the degree of an impact-model node.
 * @param {any} node
 * @returns {number}
 */
function _resolveImpactModelDegree(node: any) {
    if (node.degree != null)
        return node.degree;
    return node.edgeTypes?.length || 0;
}

function _buildImpactModelNode(node: any) {
    const id = _sceneNodeId(node);
    if (!id || node?.isObservation)
        return null;
    return Object.freeze({
        id,
        type: node.type || node.family || 'element',
        status: node.status || 'active',
        level: node.level ?? null,
        degree: _resolveImpactModelDegree(node),
    });
}

/**
 * Resolves the impact weight for an impact-model edge.
 * @param {any} edge
 * @param {any} line
 * @returns {number}
 */
function _resolveImpactWeight(edge: any, line: any) {
    const candidates = [
        edge?.impactWeight,
        edge?.weight,
        line?.impactWeight,
        line?.weight,
    ];
    for (const value of candidates) {
        if (value != null)
            return value;
    }
    return 1;
}

/**
 * Builds a single impact-model edge from a scene line.
 * @param {any} line
 * @param {Set<string>} ids
 * @param {Set<string>} seenEdges
 * @returns {any|null}
 */
function _buildImpactModelEdge(line: any, ids: Set<string>, seenEdges: Set<string>) {
    const source = _sceneLineEndpoint(line, 'source');
    const target = _sceneLineEndpoint(line, 'target');
    if (!source || !target || source === target || !ids.has(source) || !ids.has(target))
        return null;
    const edge = _safeGet(line, 'edge') || {};
    const type = edge.type || line.type || 'related_to';
    const layer = edge.layer || line.layer || edge.relationLayer || null;
    const key = `${source}|${target}|${type}|${layer || ''}`;
    if (seenEdges.has(key))
        return null;
    seenEdges.add(key);
    return Object.freeze({
        source,
        target,
        type,
        layer,
        impactWeight: _resolveImpactWeight(edge, line),
    });
}

export function buildConstellationSceneImpactModel( nodes: any = [], lines: any = []) {
    const sceneNodes = Array.isArray(nodes) ? nodes : [];
    const sceneLines = Array.isArray(lines) ? lines : [];
    const ids = new Set<string>();
    const modelNodes: any[] = [];
    for (const node of sceneNodes) {
        const modelNode = _buildImpactModelNode(node);
        if (!modelNode || ids.has(modelNode.id))
            continue;
        ids.add(modelNode.id);
        modelNodes.push(modelNode);
    }
    const modelEdges: any[] = [];
    const seenEdges = new Set<string>();
    for (const line of sceneLines) {
        const modelEdge = _buildImpactModelEdge(line, ids, seenEdges);
        if (modelEdge)
            modelEdges.push(modelEdge);
    }
    return Object.freeze({
        nodes: Object.freeze(modelNodes),
        edges: Object.freeze(modelEdges),
    });
}
function _clearImpactHudState() {
    _impactHudState = null;
    _impactSceneSignature = '';
}
function _getImpactSourceId() {
    return (
        _impactSourceId ||
        _selectedId ||
        currentNodes.find((node: any) => node.isCenter)?.id ||
        getSelectedElement()?.id ||
        ''
    );
}
/**
 * @param {{nodes:Array<AnyRecord>, edges:Array<AnyRecord>}} model
 * @param {string} model
 * @param {AnyRecord} sourceId
 * @returns {string}
 */
function _buildImpactSceneSignature( model: any, sourceId: any, options: any) {
    return JSON.stringify({
        sourceId,
        depth: options.depth,
        direction: options.direction,
        nodes: model.nodes.map((node: any) => node.id),
        edges: model.edges.map(
            (edge: any) => `${edge.source}>${edge.target}:${edge.type}:${edge.layer || ''}`,
        ),
    });
}
function _ensureImpactHudState() {
    if (!_impactModeActive) return null;
    const sourceId = _getImpactSourceId();
    if (!sourceId) {
        _clearImpactHudState();
        setImpactControlActive(true, null);
        return null;
    }
    const model = buildConstellationSceneImpactModel(currentNodes, currentLines);
    const hasLayeredEdges = model.edges.some((edge: any) => !!edge.layer);
    const options = {
        ..._impactOptions,
        ...(hasLayeredEdges ? { layers: Array.from(getActiveLayers?.() || []) } : {}),
    };
    const signature = _buildImpactSceneSignature(model, sourceId, options);
    if (_impactHudState && signature === _impactSceneSignature) return _impactHudState;
    _impactHudState = buildImpactHudState(model, sourceId, options);
    _impactSceneSignature = signature;
    _dispatchHostedActionsIntegrationEvent('impact-analysis-updated', {
        sourceId,
        summary: _impactHudState.summary,
    });
    setImpactControlActive(true, _impactHudState.summary);
    return _impactHudState;
}
/**
 * @param {string} statusText
 * @param {AnyRecord|null|undefined} summary
 * @returns {string}
 */
function _formatImpactStatus( statusText: any, summary: any) {
    if (!summary) return statusText;
    const impactText = `impact ${summary.source || '-'}: ${summary.affected} affected, ${summary.direct} direct`;
    return statusText ? `${statusText} | ${impactText}` : impactText;
}
/**
 * Modo debug do constellation: quando ligado (localStorage
 * ecbyts-constellation-debug=1), a legenda mostra o statusText técnico do bridge
 * (LOD/metric/diff). Por padrão fica oculto — é jargão de desenvolvedor que
 * poluía a legenda do usuário final (Calvin 2026-06-03).
 * @returns {boolean}
 */
function _isConstellationDebug(): boolean {
    try {
        return localStorage.getItem('ecbyts-constellation-debug') === '1';
    } catch {
        return false;
    }
}
/**
 * Toggle the scene impact overlay. It is intentionally independent from the
 * controls UI so tests and future HUD buttons can use the same contract.
 *
 * @param {boolean} active
 * @param {AnyRecord} [options]
 * @returns {AnyRecord|null}
 */
export function setConstellationImpactMode( active: any, options: any = {}) {
    _impactModeActive = active === true;
    _impactSourceId = options.sourceId ? String(options.sourceId).trim() : null;
    _impactOptions = Object.freeze({
        depth: Number.isInteger(options.depth) && options.depth >= 0 ? options.depth : 3,
        direction: ['out', 'in', 'both'].includes(options.direction) ? options.direction : 'out',
    });
    _clearImpactHudState();
    const state = _ensureImpactHudState();
    setImpactControlActive(_impactModeActive, state?.summary || null);
    if (canvas) drawStatic();
    return state?.summary || null;
}
/**
 * Resolves the active constellation canvas size.
 * @returns {{width:number,height:number}|null}
 */
function _resolveConstellationCanvasSize() {
    if (!canvas)
        return null;
    const activeView = _getActiveConstellationView();
    const rect = activeView?.getBoundingClientRect?.();
    const width = Math.round(rect?.width || canvas.clientWidth || 0);
    const height = Math.round(rect?.height || canvas.clientHeight || 0);
    if (width <= 50 || height <= 20)
        return null;
    return { width, height };
}

export function syncConstellationLayout( forceRebuild: any = false) {
    if (!canvas)
        canvas = document.getElementById('constellation-canvas');
    if (!canvas)
        return false;
    const size = _resolveConstellationCanvasSize();
    if (!size)
        return false;
    _resyncCanvasBackingStore(size.width, size.height);
    if (_webglRenderer)
        _webglRenderer.resize(canvasW, canvasH);
    if (_graphMode === 'model') {
        _buildHostedModelGraphLayout(true);
        drawStatic();
        return true;
    }
    const selected = getSelectedElement();
    if (selected && (_selectedId === selected.id || forceRebuild))
        buildNodeLayout(selected);
    drawStatic();
    return true;
}
/**
 * @param {AnyRecord|null|undefined} position
 * @returns {{x:number,y:number}|null}
 */
/**
 * Tries to build a 2D point from a position object.
 * @param {any} position
 * @returns {{x:number,y:number}|null}
 */
function _pointFromPosition(position: any) {
    if (!position || typeof position.x !== 'number')
        return null;
    if (typeof position.z === 'number')
        return { x: position.x, y: position.z };
    if (typeof position.y === 'number')
        return { x: position.x, y: position.y };
    return null;
}

/**
 * Tries to build a 2D point from element x/z or lng/lat fields.
 * @param {any} element
 * @returns {{x:number,y:number}|null}
 */
function _pointFromElementFields(element: any) {
    if (typeof element?.x === 'number' && typeof element?.z === 'number')
        return { x: element.x, y: element.z };
    if (typeof element?.lng === 'number' && typeof element?.lat === 'number')
        return { x: element.lng, y: element.lat };
    return null;
}

function _getElementSpatialPoint( element: any) {
    const fromPosition = _pointFromPosition(element?.data?.position || element?.position || null);
    if (fromPosition)
        return fromPosition;
    return _pointFromElementFields(element);
}
function _getHostedModelLayoutMode() {
    const requested = getActiveLayoutMode?.() || 'force';
    if (!_isHostedInActionsShell()) return requested;
    return requested === 'force' ? 'hierarchical' : requested;
}
/**
 * @param {Array<AnyRecord>} elements
 * @param {Array<AnyRecord>} edges
 * @returns {string}
 */
function _buildHostedModelGraphSignature( elements: any, edges: any) {
    return JSON.stringify({
        hosted: _isHostedInActionsShell(),
        layout: _getHostedModelLayoutMode(),
        layers: Array.from(getActiveLayers?.() || []).sort(),
        width: canvasW,
        height: canvasH,
        elements: elements.map((element: any) => `${element.id}:${element?.hierarchy?.parentId || ''}`),
        edges: edges.map(
            (edge: any) => `${edge.id || ''}:${edge.sourceId}>${edge.targetId}:${edge.type || ''}`,
        ),
    });
}
/**
 * Builds the raw node list for the hosted model graph.
 * @param {any[]} elements
 * @returns {any[]}
 */
function _buildHostedModelRawNodes(elements: any[]) {
    return elements.map((element: any) => {
        const spatial = _getElementSpatialPoint(element);
        return {
            id: element.id,
            name: element.name || element.label || element.id,
            family: element.family || 'generic',
            type: element.family || 'element',
            status: element?.data?.status || element.status || 'active',
            ..._buildNodeMetricPayload(element, 0),
            ...(spatial || {}),
        };
    });
}

/**
 * Collects hierarchy and semantic edges for the hosted model graph.
 * @param {any[]} elements
 * @param {any[]} explicitEdges
 * @param {Set<string>} activeLayers
 * @returns {any[]}
 */
function _collectHostedModelEdges(elements: any[], explicitEdges: any[], activeLayers: Set<string>) {
    const seenEdges = new Set<string>();
    const rawEdges: any[] = [];
    const pushEdge = (edge: any) => {
        if (!edge?.source || !edge?.target || edge.source === edge.target)
            return;
        const key = `${edge.source}|${edge.target}|${edge.type || ''}|${edge.layer || ''}`;
        if (seenEdges.has(key))
            return;
        seenEdges.add(key);
        rawEdges.push(edge);
    };
    if (activeLayers.has(RELATION_LAYERS.HIERARCHICAL)) {
        for (const element of elements) {
            const parentId = element?.hierarchy?.parentId;
            if (!parentId)
                continue;
            pushEdge({
                id: `hierarchy:${parentId}->${element.id}`,
                source: parentId,
                target: element.id,
                type: 'parent_to_child',
                layer: RELATION_LAYERS.HIERARCHICAL,
            });
        }
    }
    if (activeLayers.has(RELATION_LAYERS.SEMANTIC)) {
        for (const edge of explicitEdges) {
            pushEdge({
                id: edge.id || `${edge.sourceId}->${edge.targetId}:${edge.type || 'related_to'}`,
                source: edge.sourceId,
                target: edge.targetId,
                type: edge.type || 'related_to',
                layer: RELATION_LAYERS.SEMANTIC,
            });
        }
    }
    return rawEdges;
}

/**
 * Selects and runs the appropriate layout algorithm.
 * @param {any} graph
 * @param {string} layoutMode
 * @param {any} layoutOptions
 * @returns {any}
 */
function _selectHostedModelLayout(graph: any, layoutMode: string, layoutOptions: any) {
    if (layoutMode === 'spatial')
        return layoutSpatial(graph, layoutOptions);
    if (layoutMode === 'circular')
        return layoutCircular(graph, layoutOptions);
    if (layoutMode === 'hierarchical')
        return layoutHierarchical(graph, { ...layoutOptions, direction: 'TB' });
    return layoutForceDirected(graph, { ...layoutOptions, iterations: 180 });
}

/**
 * Resolves the display radius for a hosted model node from its degree.
 * @param {number} degree
 * @returns {number}
 */
function _hostedModelNodeRadius(degree: number) {
    if (degree >= 8)
        return 8;
    if (degree >= 4)
        return 7;
    if (degree >= 2)
        return 6;
    return 5;
}

/**
 * Builds the final scene node for the hosted model graph.
 * @param {any} rawNode
 * @param {Map<string,any>} positionedById
 * @param {any} any>
 * @returns {any}
 */
function _buildHostedModelSceneNode(rawNode: any, positionedById: Map<string, any>, graph: any) {
    const layoutOptions = {
        width: Math.max(canvasW, 280),
        height: Math.max(canvasH - 28, 180),
    };
    const positioned = positionedById.get(rawNode.id) || { x: layoutOptions.width / 2, y: layoutOptions.height / 2 };
    const degree = (graph.outAdj.get(rawNode.id)?.length || 0) + (graph.inAdj.get(rawNode.id)?.length || 0);
    return {
        id: rawNode.id,
        name: rawNode.name,
        family: rawNode.family,
        type: rawNode.type,
        status: rawNode.status,
        x: positioned.x,
        y: positioned.y,
        radius: _hostedModelNodeRadius(degree),
        level: 2,
        ..._buildNodeMetricPayload(getElementById(rawNode.id), degree),
        degree,
        isCenter: false,
        isObservation: false,
        suppressLabel: true,
    };
}

function _buildHostedModelGraphLayout( force: any = false) {
    const elements = getAllElements().filter((element: any) => !!element?.id);
    const explicitEdges = getAllEdges().filter((edge: any) => !!edge?.sourceId && !!edge?.targetId);
    const signature = _buildHostedModelGraphSignature(elements, explicitEdges);
    if (!force && _modelGraphCache.signature === signature) {
        _graphMode = 'model';
        currentNodes = _modelGraphCache.nodes;
        currentLines = _modelGraphCache.lines;
        setGraphRef(_modelGraphCache.graph);
        return currentNodes.length > 0;
    }
    const activeLayers = new Set(getActiveLayers?.() || [RELATION_LAYERS.HIERARCHICAL, RELATION_LAYERS.SEMANTIC]);
    const rawNodes = _buildHostedModelRawNodes(elements);
    const rawEdges = _collectHostedModelEdges(elements, explicitEdges, activeLayers);
    const graph = buildGraph(rawNodes, rawEdges);
    const layoutMode = _getHostedModelLayoutMode();
    const layoutOptions = {
        width: Math.max(canvasW, 280),
        height: Math.max(canvasH - 28, 180),
    };
    const laidOut = _selectHostedModelLayout(graph, layoutMode, layoutOptions);
    const positionedById = new Map((laidOut?.nodes || []).map((node: any) => [node.id, node]));
    const nodes = rawNodes.map((node: any) => _buildHostedModelSceneNode(node, positionedById, graph));
    const lines = graph.edges.map((edge: any) => ({
        fromNodeId: edge.source,
        toNodeId: edge.target,
        edge: { type: edge.type, layer: edge.layer, impactWeight: edge.impactWeight ?? edge.weight },
        isOutgoing: true,
        level: edge.layer === RELATION_LAYERS.HIERARCHICAL ? 2 : 1,
    }));
    _modelGraphCache = {
        signature,
        graph,
        nodes,
        lines,
        summary: {
            nodeCount: graph.stats.nodeCount,
            edgeCount: graph.stats.edgeCount,
        },
    };
    _graphMode = 'model';
    currentNodes = nodes;
    currentLines = lines;
    setGraphRef(graph);
    setSelectedEdge(null);
    _tryApplySavedLayout();
    return nodes.length > 0;
}
/**
 * Attempt to apply the most recently saved layout for current model.
 */
async function _tryApplySavedLayout() {
    try {
        const layouts = await listConstellationLayouts();
        const mostRecent = layouts[0];
        if (mostRecent) {
            const result = await getConstellationLayout(mostRecent.id);
            if (result.ok && result.layout?.node_positions) {
                _applySavedPositions(result.layout.node_positions);
            }
        }
    } catch (err: any) {
        console.debug('[constellation] auto-apply layout failed', errorMessage(err));
    }
}
// Node sizes
const CENTER_RADIUS = 22;
const SATELLITE_RADIUS = 14;
const L2_RADIUS = 9;
const L3_RADIUS = 6;
const OBS_RADIUS = 4;
// Level-2 caps
const MAX_L2_PER_PARENT = 3;
const MAX_TOTAL_L2 = 15;
// Level-3 caps
const MAX_L3_PER_PARENT = 2;
const MAX_TOTAL_L3 = 8;
// Procedural layout - distribui nodes por toda a largura do canvas
const PAD_LEFT = 60;
const PAD_RIGHT = 60;
const PAD_TOP = 16;
const PAD_BOT = 24;
const CENTER_DEADZONE = 72; // clearance ao redor do centro
const L2_ARC_MIN = 25;
const L2_ARC_MAX = 80;
const L3_ARC_MIN = 15;
const L3_ARC_MAX = 45;
const OVERLAP_GAP = 6; // gap entre circulos (labels resolvidos separadamente)
// Theme colors - read from CSS variables, updated only when dirty (PERF-G4)
let _theme: any = {};
let _themeColorsDirty = true;
function _updateThemeColors() {
    const s = getComputedStyle(document.documentElement);
    const get = (v: any) => s.getPropertyValue(v).trim();
    _theme = {
        text: get('--bottom-text') || 'rgba(255,255,255,0.75)',
        textMuted: get('--bottom-text-muted') || 'rgba(255,255,255,0.5)',
        textFaint: get('--bottom-text-faint') || 'rgba(255,255,255,0.25)',
        bgSolid: get('--bottom-bg-solid') || 'rgba(10,14,20,0.75)',
        hover: get('--bottom-hover') || 'rgba(255,255,255,0.08)',
    };
}
/** PERF-G4: Mark theme colors as stale. Call when theme changes. */
export function markConstellationThemeDirty() {
    _themeColorsDirty = true;
}
// Colors by element family
const FAMILY_COLORS: any = {
    well: '#4FC3F7',
    plume: '#FF7043',
    lake: '#29B6F6',
    river: '#26C6DA',
    spring: '#66BB6A',
    building: '#9E9E9E',
    tank: '#FFA726',
    waste: '#EF5350',
    boundary: '#78909C',
    sensor: '#00BCD4',
    area: '#81C784',
    individual: '#CE93D8',
    incident: '#FF8A65',
    emission_source: '#A1887F',
    waste_stream: '#80CBC4',
    effluent_point: '#90CAF9',
    habitat: '#AED581',
    sample: '#AB47BC',
    marker: '#EF5350',
    stratum: '#8D6E63',
    intangible: '#BA68C8',
    generic: '#B0BEC5',
    default: '#90A4AE',
};
// Family icons (unicode symbols for quick rendering)
const FAMILY_ICONS: any = {
    well: '\u25CE',
    plume: '\u2601',
    lake: '\u223F',
    river: '\u2248',
    spring: '\u2734',
    building: '\u25A3',
    tank: '\u25CB',
    waste: '\u26A0',
    boundary: '\u25A1',
    sensor: '\u25C8',
    area: '\u25A2',
    individual: '\u263A',
    stratum: '\u2261',
    intangible: '\u2666',
    generic: '\u25CF',
    default: '\u25CF',
};
// Edge direction descriptors where the SOURCE entity is the "upstream" role.
// Used to position neighbors: upstream (RIGHT) vs downstream (LEFT).
const SOURCE_UPSTREAM_DIRS = new Set([
    'parent_to_child', // contains: parent is upstream
    'monitor_to_target', // monitors: monitor is upstream
    'source_to_affected', // impacts: source is upstream
    'cause_to_effect', // causes: cause is upstream
    'action_to_impact', // mitigates: action is upstream
    'upstream_to_downstream', // upstream_of: source is upstream
    'individual_to_asset', // responsible_for: authority is upstream
    'incident_to_location', // occurred_in: event is upstream
    'individual_to_incident', // involved_in: agent is upstream
    'individual_to_habitat', // inhabits: agent is upstream
    'individual_to_location', // observed_at: agent is upstream
]);
/**
 * Builds the callbacks object for constellation controls.
 * @returns {any}
 */
function _createConstellationControlsCallbacks() {
    return {
        onLayoutChange: (mode: any) => {
            _logConstellation.debug('layout changed', mode);
            if (_graphMode === 'model' && _isHostedInActionsShell())
                _buildHostedModelGraphLayout(true);
            drawStatic();
        },
        onLayerChange: (layers: any) => {
            _logConstellation.debug('layers changed', layers);
            if (_graphMode === 'model' && _isHostedInActionsShell())
                _buildHostedModelGraphLayout(true);
            drawStatic();
        },
        onViewModeChange: (mode: any) => {
            _logConstellation.debug('view mode changed', mode);
        },
        onFilterChange: (filters: any) => {
            _logConstellation.debug('filters changed', filters);
            drawStatic();
        },
        onMetricSizingChange: (state: any) => setConstellationMetricSizingState(state),
        onAction: (action: any, payload: any = {}) => _handleConstellationControlAction(action, payload),
        onSearch: (query: any) => {
            _logConstellation.debug('search', query);
        },
        onSaveLayout: (name: any) => _saveLayoutToStorage(name),
        onLoadLayout: (layoutId: any) => _loadLayoutById(layoutId),
        onDeleteLayout: (layoutId: any) => _deleteLayoutById(layoutId),
        onListLayouts: () => listConstellationLayouts(),
    };
}

/**
 * Handles control actions from the constellation controls panel.
 * @param {string} action
 * @param {any} payload
 * @returns {any}
 */
function _handleConstellationControlAction(action: string, payload: any) {
    _logConstellation.debug('action', action);
    if (action === 'saveLayout')
        _saveLayoutToStorage();
    if (action === 'exportPng')
        _exportCanvasPng();
    if (action === 'exportSvg')
        (_exportCanvasSvg as any)();
    if (action === 'impact')
        return setConstellationImpactMode(payload.active === true);
    return null;
}

/**
 * Builds the callbacks object for the constellation info panel.
 * @returns {any}
 */
function _createConstellationInfoPanelCallbacks() {
    return {
        onViewIn3D: (node: any) => {
            _logConstellation.debug('view in 3D', node.id);
            if (appWindow().focusElementInViewport)
                appWindow().focusElementInViewport(node.id);
        },
        onOpenInspector: (node: any) => {
            _logConstellation.debug('open inspector', node.id);
            if (_onSelect)
                _onSelect(node.id);
        },
        onFocus: (nodeOrNodes: any) => {
            const id = Array.isArray(nodeOrNodes) ? nodeOrNodes[0]?.id : nodeOrNodes?.id;
            _logConstellation.debug('focus', id);
            if (id && _onSelect)
                _onSelect(id);
        },
        onViewEvidence: (edge: any) => {
            _logConstellation.debug('view evidence', edge);
        },
    };
}

/**
 * Handle keyboard navigation in the constellation tab bar.
 * @param {KeyboardEvent} e
 * @param {HTMLElement} tabsBar
 */
function _handleConstellationTabBarKeydown(e: any, tabsBar: any) {
    const tabs: any[] = [...tabsBar.querySelectorAll('.constellation-tab[data-ctab]')];
    const current = tabs.findIndex((t: any) => t === document.activeElement);
    if (current === -1) return;
    let next: number;
    if (e.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        tabs[current].click();
        return;
    } else if (e.key === 'Escape') {
        /** @type {any} */ (appWindow().toggleConstellationCollapse)?.();
        return;
    } else return;
    e.preventDefault();
    tabs.forEach((t: any) => {
        t.setAttribute('tabindex', '-1');
        t.setAttribute('aria-selected', 'false');
    });
    tabs[next].setAttribute('tabindex', '0');
    tabs[next].setAttribute('aria-selected', 'true');
    tabs[next].focus();
}

/**
 * Apply lazy-loaded side effects when switching to a specific constellation tab.
 * @param {string} tabId
 */
function _applyConstellationTabSideEffects(tabId: any) {
    if (tabId === 'pdplu') {
        updatePDPLUTable(getSelectedElement());
    }
    if (tabId === 'report') {
        import('../report/reportList.js' as string).then((m: any) => {
            const container = document.getElementById('report-editor-container');
            if (container && !container.dataset.listInitialized) {
                m.initReportList(container);
                container.dataset.listInitialized = 'true';
            } else {
                m.updateReportList();
            }
        }).catch((e: any) => console.debug('[constellation:lazy-reportList:silent-catch]', e?.message || e));
    }
    if (tabId === 'storyboard') {
        import('../../core/sequencer/manager.js' as string)
            .then((mgr: any) => {
                mgr.initSequencer();
                import('../../core/sequencer/renderer.js' as string)
                    .then((r: any) => {
                        r.initStoryboardUI();
                    })
                    .catch((err: any) =>
                        _logConstellation.debug('storyboard renderer import failed', errorMessage(err)),
                    );
            })
            .catch((err: any) =>
                _logConstellation.debug('sequencer manager import failed', errorMessage(err)),
            );
    }
    if (tabId === 'inspector') {
        import('../inspector/renderer.js' as string)
            .then((m: any) => {
                m.initInspectorPanel?.();
                import('../inspector/manager.js' as string)
                    .then((mm: any) => {
                        if (mm.getInspectorConfig?.().collapsed) mm.setInspectorCollapsed?.(false);
                        m.renderInspector?.();
                    })
                    .catch(() => m.renderInspector?.());
            })
            .catch((err: any) =>
                _logConstellation.debug('inspector renderer import failed', errorMessage(err)),
            );
    }
    if (tabId === 'preset') {
        import('../ui/complianceUiBootstrap.js' as string)
            .then((m: any) => {
                m.renderComplianceIntoPresetView?.();
            })
            .catch((err: any) =>
                _logConstellation.debug('compliance preset render failed', errorMessage(err)),
            );
    }
    if (tabId === 'action-plan') {
        import('../ui/actionPlanUiBootstrap.js' as string)
            .then((m: any) => {
                m.renderActionPlanIntoView?.();
            })
            .catch((err: any) =>
                _logConstellation.debug('action plan render failed', errorMessage(err)),
            );
    }
}

/**
 * Initialize the constellation canvas.
 * @param {Object} options
 * @param {Function} options.onSelect - Callback(elementId) when node clicked
 */
export function initConstellation( options: any = {}) {
    canvas = document.getElementById('constellation-canvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    _onSelect = options.onSelect || null;
    // CONSTELLATION-A11Y: canvas focável + descrito + navegação por teclado.
    if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
    canvas.setAttribute('role', 'application');
    if (!canvas.hasAttribute('aria-label')) {
        canvas.setAttribute(
            'aria-label',
            t('constellation.canvasAria') ||
                'Element relationship graph. Use arrow keys to navigate nodes, Enter to select.',
        );
    }
    canvas.addEventListener('keydown', _handleConstellationKeydown);
    // Initialize controls + info panels
    initConstellationControls(_createConstellationControlsCallbacks());
    initConstellationInfoPanel(_createConstellationInfoPanelCallbacks());
    // Keyboard shortcut: 'C' toggles Constellation visibility
    document.addEventListener('keydown', (e: any) => {
        if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const target = e.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            e.preventDefault();
            /** @type {any} */ (appWindow().toggleConstellation)?.();
        }
    });
    // Stop events from reaching the Three.js picker underneath
    canvas.addEventListener('click', handleCanvasClick, true);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick, true);
    canvas.addEventListener('mousedown', handleCanvasMouseDown, true);
    canvas.addEventListener('mouseup', handleCanvasMouseUp, true);
    canvas.addEventListener('mousemove', handleCanvasMouseMove);
    // CONSTELLATION-CONFIG-MENU (Calvin 2026-06-03): botão direito abre menu de
    // configuração. stopPropagation + preventDefault impedem o globalContextMenu
    // (fallback genérico) de também disparar sobre o canvas.
    canvas.addEventListener('contextmenu', _handleConstellationContextMenu);
    // NAV-002: wheel zoom (passive:false to allow preventDefault)
    canvas.addEventListener('wheel', handleCanvasWheel, { passive: false });
    // NAV-002: keyboard - 'F' for fit all (when HUD focused)
    document.getElementById('constellation-hud')?.addEventListener('keydown', (e: any) => {
        if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const target = e.target;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
            e.preventDefault();
            fitAll();
        }
    });
    // NAV-002: double-click empty → fit all (only when no node hit)
    const _origDblClick = handleCanvasDoubleClick;
    // NAV-002: create tooltip element
    _tooltipEl = document.createElement('div');
    _tooltipEl.id = 'constellation-tooltip';
    _tooltipEl.setAttribute('role', 'tooltip');
    _tooltipEl.setAttribute('aria-live', 'polite');
    _tooltipEl.className = 'constellation-tooltip';
    _tooltipEl.style.display = 'none';
    document.getElementById('constellation-hud')?.appendChild(_tooltipEl);
    // NAV-002: minimap canvas
    _minimapCanvas = document.createElement('canvas');
    _minimapCanvas.setAttribute('aria-hidden', 'true');
    _minimapCanvas.className = 'constellation-minimap-canvas';
    _minimapCtx = _minimapCanvas.getContext('2d');
    // Restore minimap visibility from localStorage
    const savedMinimap = localStorage.getItem('ecbyts-constellation-minimap') || '';
    _minimapVisible = savedMinimap === '1';
    // Restore label-visibility preference (config menu)
    _userHideLabels = localStorage.getItem('ecbyts-constellation-hide-labels') === '1';
    // Wire global handlers for nav toolbar buttons
    // Botões de zoom centram no nó focal (selecionado) se houver, senão no meio
    // do canvas — best practice graph-viz: manter o foco em tela ao aproximar
    // (antes o nó "saía pra cima" em zoom alto, Calvin 2026-06-03).
    window.handleConstellationZoomIn = () => {
        const p = _focalZoomPivot();
        _applyZoom(1.2, p.x, p.y);
    };
    window.handleConstellationZoomOut = () => {
        const p = _focalZoomPivot();
        _applyZoom(1 / 1.2, p.x, p.y);
    };
    window.handleConstellationFitAll = () => fitAll();
    window.handleConstellationToggleMinimap = () => {
        _minimapVisible = !_minimapVisible;
        safeSetItem('ecbyts-constellation-minimap', _minimapVisible ? '1' : '0');
        const btn = document.getElementById('btn-constellation-minimap');
        if (btn) btn.setAttribute('aria-pressed', String(_minimapVisible));
        drawStatic();
    };
    // Sync canvas drawing buffer to CSS display size via ResizeObserver
    // Observa o container pai - mais estavel que observar o canvas diretamente
    const viewContainer = canvas.parentElement;
    _resizeObserver = new ResizeObserver((entries: any) => {
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (width > 50 && height > 20) {
                _resyncCanvasBackingStore(Math.round(width), Math.round(height));
                drawStatic();
            }
        }
    });
    if (viewContainer) _resizeObserver.observe(viewContainer);
    // WebGL renderer init (lazy - será criado sob demanda em switchToWebGLMode)
    const graphView = document.getElementById('constellation-view-graph');
    if (graphView) {
        initWebGLRenderer(graphView);
    }
    // Hydrate tab icons (data-icon spans in static HTML)
    const tabsBar = document.getElementById('constellation-tabs');
    if (tabsBar) {
        hydrateIcons(tabsBar);
        // Restaurar tab salva e ativar keyboard navigation
        const savedTab = getActiveConstellationTab();
        if (savedTab && savedTab !== 'graph') {
            // Defer para apos o init completo - a tab sera ativada via window.switchConstellationTab
            requestAnimationFrame(() => {
                if (window.switchConstellationTab) window.switchConstellationTab(savedTab);
            });
        }
        // Keyboard navigation: ArrowLeft/Right para navegar tabs, Enter/Space para ativar
        tabsBar.setAttribute('role', 'tablist');
        const tabButtons = tabsBar.querySelectorAll('.constellation-tab[data-ctab]');
        tabButtons.forEach((/** @type {any} */ btn, _i) => {
            btn.setAttribute('role', 'tab');
            btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
            btn.setAttribute('aria-selected', btn.classList.contains('active') ? 'true' : 'false');
        });
        tabsBar.addEventListener('keydown', (e: any) => _handleConstellationTabBarKeydown(e, tabsBar));
    }
    // Register window helpers for HTML overlay callbacks
    // Tab switching and PDPLU export handlers
    (window as any).switchConstellationTab = (tabId: any, options: any = {}) => {
        _switchTab(tabId, options);
        _applyConstellationTabSideEffects(tabId);
    };
    // ACTION-PLAN-001 (FASE 2): revela a aba "Plano de Ação" AGORA que a barra de
    // abas do constellation já existe no DOM (initActionPlanUi roda no boot do main,
    // antes desta barra montar — ali o reveal vira no-op silencioso). Guard defensivo
    // (CONFIG.FEATURES.ACTION_PLAN) está dentro de initActionPlanUi; flag off = no-op.
    import('../ui/actionPlanUiBootstrap.js' as string)
        .then((m: any) => {
            m.initActionPlanUi?.();
        })
        .catch((err: any) =>
            _logConstellation.debug('action plan reveal failed', errorMessage(err)),
        );
    window.handleExportPDPLU = () => {
        const el = getSelectedElement();
        if (el) exportPDPLUCSV(el);
    };
    // PNG/SVG export handlers - SPEC_CONSTELLATION_HUD_9_75 Feature A
    window.handleExportConstellationPng = () => _exportCanvasPng();
    window.handleExportConstellationSvg = () => _exportCanvasSvg();
    // Force-directed layout handler - SPEC_CONSTELLATION_HUD_9_75 Feature B
    window.handleConstellationForceLayout = () => {
        import('./constellationLayout.js' as string)
            .then(({ forceDirectedLayout }: any) => {
                if (!currentNodes.length) return;
                const newPositions = forceDirectedLayout(
                    currentNodes.map((n: any) => ({ id: n.id, x: n.x ?? 0, y: n.y ?? 0 })),
                    currentLines.map((l: any) => ({
                        sourceId: typeof l.from === 'object' ? l.from?.id : l.from,
                        targetId: typeof l.to === 'object' ? l.to?.id : l.to,
                    })),
                    { width: canvasW, height: canvasH, iterations: 60 },
                );
                const posMap = new Map<string, any>(newPositions.map((p: any) => [p.id, p]));
                for (const node of currentNodes) {
                    const p: any = posMap.get(node.id);
                    if (p) {
                        node.x = p.x;
                        node.y = p.y;
                    }
                }
                drawStatic();
                if (_webglMode && _webglRenderer) {
                    _webglRenderer.setLayout(currentNodes, currentLines);
                }
            })
            .catch((err: any) => _logConstellation.warn('force layout import failed', errorMessage(err)));
    };
    // Layout-mode switch — SPEC_CONSTELLATION_HUD_9_75 §2.1 (force-directed /
    // circular). Aditivo: carrega lazy os módulos pure-logic em core/ e aplica
    // posições determinísticas aos nós atuais sem tocar no pipeline existente.
    window.setConstellationLayout = (mode: any) => {
        if (!currentNodes.length) return Promise.resolve(false);
        const layoutNodes = currentNodes.map((n: any) => ({
            id: n.id,
            x: n.x ?? 0,
            y: n.y ?? 0,
            family: n.family,
        }));
        const layoutEdges = currentLines.map((l: any) => ({
            source: typeof l.from === 'object' ? l.from?.id : (l.fromNodeId ?? l.from),
            target: typeof l.to === 'object' ? l.to?.id : (l.toNodeId ?? l.to),
        }));
        const applyPositions = (positions: any) => {
            if (!positions || typeof positions.get !== 'function') return false;
            for (const node of currentNodes) {
                const p = positions.get(node.id);
                if (p) {
                    node.x = p.x;
                    node.y = p.y;
                }
            }
            drawStatic();
            if (_webglMode && _webglRenderer) {
                _webglRenderer.setLayout(currentNodes, currentLines);
            }
            return true;
        };
        const importPath =
            mode === 'circular'
                ? '../../core/constellation/circularLayout.js'
                : '../../core/constellation/forceDirectedLayout.js';
        return import(importPath)
            .then((mod: any) => {
                if (mode === 'circular') {
                    const { computeCircularLayout } = mod;
                    const { positions } = computeCircularLayout(layoutNodes, {
                        centerX: canvasW / 2,
                        centerY: canvasH / 2,
                        radius: Math.max(60, Math.min(canvasW, canvasH) / 2 - 40),
                        groupBy: 'family',
                    });
                    return applyPositions(positions);
                }
                const { computeForceDirectedLayout } = mod;
                const { positions } = computeForceDirectedLayout(layoutNodes, layoutEdges, {
                    width: canvasW,
                    height: canvasH,
                    iterations: 180,
                    seed: 1,
                });
                return applyPositions(positions);
            })
            .catch((err: any) => {
                _logConstellation.warn('setConstellationLayout import failed', errorMessage(err));
                return false;
            });
    };
    // Collapse/expand constellation HUD
    // Gerencia --bottom-panel-height ao colapsar para evitar bug do flex auto-height
    const _COLLAPSED_HEIGHT = '28px';
    appWindow().toggleConstellationCollapse = () => {
        const hud = document.getElementById('constellation-hud');
        if (!hud) return;
        const mainArea = document.getElementById('main-area');
        if (!mainArea) return;
        const isCollapsing = !hud.classList.contains('constellation-collapsed');
        if (isCollapsing) {
            // Salvar altura atual antes de colapsar
            const currentH = getComputedStyle(mainArea).getPropertyValue('--bottom-panel-height').trim();
            if (currentH && currentH !== _COLLAPSED_HEIGHT) {
                try {
                    localStorage.setItem('ecbyts-constellation-height', parseInt(currentH, 10).toString());
                } catch (e: any) {
                    console.debug('[constellation] saveHeight:', errorMessage(e));
                }
            }
            mainArea.style.setProperty('--bottom-panel-height', _COLLAPSED_HEIGHT);
        } else {
            // Restaurar altura salva ao expandir
            const savedH = localStorage.getItem('ecbyts-constellation-height') || '';
            const h = savedH ? parseInt(savedH, 10) : 120;
            mainArea.style.setProperty('--bottom-panel-height', (isNaN(h) ? 120 : h) + 'px');
        }
        hud.classList.toggle('constellation-collapsed');
        safeSetItem('ecbyts-constellation-collapsed', isCollapsing ? '1' : '');
        // PERF-G5: freeze/resume WebGL simulation to save CPU when panel hidden
        if (isCollapsing) {
            _webglRenderer?.freezeSimulation();
        } else {
            _webglRenderer?.resumeSimulation();
            // COMMERCIAL-READINESS-DOD#T7.2: primeira visita ao Constellation
            // (expandir o HUD) auto-dispara o tutorial de onboarding. Idempotente
            // via seen-key — não reaparece após visto/dismiss.
            try {
                /** @type {any} */ (appWindow().maybeAutoOpenConstellationOnboarding)?.();
            } catch (e: any) {
                console.debug('[constellation] autoOnboarding:', errorMessage(e));
            }
        }
        syncMainViewportLayout();
    };
    // Click on tab bar when collapsed => expand
    const tabsBarEl = document.getElementById('constellation-tabs');
    const hudEl = document.getElementById('constellation-hud');
    if (tabsBarEl) {
        tabsBarEl.addEventListener('click', (e: any) => {
            if (!hudEl?.classList.contains('constellation-collapsed')) return;
            e.stopPropagation();
            /** @type {any} */ (appWindow().toggleConstellationCollapse)?.();
        });
    }
    // Restore collapsed state from localStorage
    if (localStorage.getItem('ecbyts-constellation-collapsed') === '1') {
        hudEl?.classList.add('constellation-collapsed');
        const mainArea = document.getElementById('main-area');
        if (mainArea) mainArea.style.setProperty('--bottom-panel-height', _COLLAPSED_HEIGHT);
    }
    appWindow()._constellationCloseEdit = () => hideObsEditCard();
    appWindow()._constellationCloseList = () => hideObsList();
    appWindow()._constellationEditObs = (obsIndex: any) => {
        hideObsList();
        const obsNode = currentNodes.find((n: any) => n.id === `obs-${obsIndex}`);
        showObsEditCard(obsIndex, obsNode ? obsNode.x : canvasW / 2, obsNode ? obsNode.y : canvasH / 2);
    };
    (appWindow() as any)._constellationParamChanged = (elementId: any, obsIndex: any, paramId: any) => {
        (appWindow() as any).handleObservationParameterChange?.(elementId, obsIndex, paramId);
        // Re-render the edit card with updated unit options
        const obsNode = currentNodes.find((n: any) => n.id === `obs-${obsIndex}`);
        setTimeout(
            () => showObsEditCard(obsIndex, obsNode ? obsNode.x : canvasW / 2, obsNode ? obsNode.y : canvasH / 2),
            50,
        );
    };
    // Expose mode switchers globally for controls panel / keyboard shortcuts
    window.switchToWebGLMode = switchToWebGLMode;
    window.switchToCanvasMode = switchToCanvasMode;
    window.syncConstellationLayout = syncConstellationLayout;
    (window as any).handleConstellationImpactMode = (sourceId: any, options: any = {}) =>
        setConstellationImpactMode(!_impactModeActive, { ...options, sourceId: sourceId || options.sourceId } as any);
    window.setConstellationMetricSizingState = setConstellationMetricSizingState;
}
// resizeCanvas() removida - ResizeObserver no canvas sincroniza automaticamente
/**
 * Draw the constellation once (no animation loop).
 * Desenha a constelacao uma unica vez.
 */
function drawStatic() {
    const ui = _buildConstellationMetricSizingUiState();
    if (_webglMode && _webglRenderer) {
        _webglRenderer.setLayout(ui.nodes, ui.lines);
        _webglRenderer.resize(canvasW, canvasH);
        return;
    }
    if (!ctx || !canvas) return;
    draw(ui);
}
function _buildConstellationMetricSizingUiState() {
    let ui = buildConstellationMetricSizingUiState({
        nodes: currentNodes,
        lines: currentLines,
        zoom: _viewScale,
        focusedNodeId: hoveredNodeId || null,
        previousSnapshot: _lastUiBridgeSnapshot,
        metricField: _metricSizingState.metricField,
        metricSizing: _metricSizingState,
        label: _graphMode,
    });
    const impactState = _ensureImpactHudState();
    if (impactState) {
        const impactUi = applyImpactHighlightsToScene(ui, impactState, {
            sourceId: impactState.analysis?.source,
            dimUnrelated: true,
        });
        ui = Object.freeze({
            ...ui,
            nodes: impactUi.nodes,
            lines: impactUi.lines,
            impactSummary: impactState.summary,
            // LEGENDA AMIGÁVEL (Calvin 2026-06-03): mantém statusText (debug do
            // bridge: "LOD …/… nodes | metric …") SEPARADO do texto de impacto
            // (user-facing). A legenda mostra impactText sempre e statusText só
            // em modo debug (ecbyts-constellation-debug=1).
            statusText: /** @type {any} */ (ui).statusText,
            impactText: _formatImpactStatus('', impactState.summary),
        });
    }
    _lastUiBridgeState = ui;
    _lastUiBridgeSnapshot = _lastUiBridgeState.snapshot;
    return _lastUiBridgeState;
}
/**
 * PERF-G2: Compute model signature for cache invalidation.
 * Changes in elementId, element count, or edge count invalidate the cache.
 */
function _getModelSignature( element: any) {
    const elementCount = getAllElements().length;
    const edgeCount = getAllEdges().length;
    return `${element?.id ?? 'null'}:${elementCount}:${edgeCount}`;
}
/**
 * PERF-G2: Invalidate layout cache. Call after any graph mutation.
 */
export function invalidateConstellationCache() {
    _lastModelSignature = null;
}
/**
 * Core update logic (no debounce).
 * @param {Object|null} element
 */
function _doUpdateConstellation( element: any) {
    const hud = document.getElementById('constellation-hud');
    if (!hud) return;
    // Respeita a preferencia do usuario - se HUD foi escondido, nao forca exibicao
    if (!isConstellationVisible()) return;
    hud.style.display = '';
    // Sync canvas buffer - fallback caso ResizeObserver nao tenha disparado
    if (canvas) {
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (cw > 50 && ch > 20 && (canvas.width !== Math.round(cw * _dpr) || canvas.height !== Math.round(ch * _dpr))) {
            _resyncCanvasBackingStore(cw, ch);
        }
    }
    // Sync WebGL renderer size
    if (_webglRenderer) {
        _webglRenderer.resize(canvasW, canvasH);
    }
    // Atualiza botao de observacao
    const obsBtn = document.getElementById('constellation-add-obs');
    if (obsBtn) {
        obsBtn.style.display = _isHostedInActionsShell() ? 'none' : element ? 'flex' : 'none';
        // HUD-UX-PAIN-DRAIN-001 W4.6 (D13): contexto do alvo no botão — sem
        // isso o "+ Obs" flutuante não dizia ONDE a observação seria criada.
        if (element) {
            const elName = String(element.name || element.id || '');
            const label = obsBtn.querySelector('[data-i18n="addObservation"]');
            if (label) label.textContent = `+ Obs. em ${elName}`;
            obsBtn.title = `Adicionar observação em ${elName}`;
            obsBtn.setAttribute('aria-label', `Adicionar observação em ${elName}`);
        }
    }
    // Fecha overlays se o elemento mudou
    const elementChanged = !element || element.id !== _selectedId;
    if (elementChanged) {
        hideObsEditCard();
        hideObsList();
    }
    if (_isHostedInActionsShell()) {
        if (_buildHostedModelGraphLayout()) {
            _selectedId = element?.id || null;
            drawStatic();
            return;
        }
    }
    if (!element) {
        _graphMode = 'focus';
        currentNodes = [];
        currentLines = [];
        _selectedId = null;
        _lastModelSignature = null;
        _clearImpactHudState();
        setGraphRef(null);
        drawStatic();
        return;
    }
    // PERF-G2: skip expensive buildNodeLayout if model unchanged
    const sig = _getModelSignature(element);
    if (sig === _lastModelSignature && currentNodes.length > 0) {
        drawStatic();
        return;
    }
    _lastModelSignature = sig;
    _graphMode = 'focus';
    _selectedId = element.id;
    buildNodeLayout(element);
    drawStatic();
    // Update PDPLU table if that tab is active
    if (getActiveConstellationTab() === 'pdplu') {
        updatePDPLUTable(element);
    }
}
/**
 * Update constellation for the currently selected element.
 * Debounced 50ms to absorb rapid event bursts (PERF-G1).
 * @param {Object|null} element - The selected element
 */
export function updateConstellation( element: any) {
    if (_updateTimer) clearTimeout(_updateTimer);
    _updateTimer = setTimeout(() => _doUpdateConstellation(element), 50);
}
/**
 * Immediate (no debounce) update - use for programmatic triggers
 * such as import, generate, or API calls where timing is controlled.
 * @param {Object|null} element
 */
export function updateConstellationImmediate( element: any) {
    if (_updateTimer) clearTimeout(_updateTimer);
    _doUpdateConstellation(element);
}
// ================================================================
// LAYOUT BUILDER
// ================================================================
function buildNodeLayout( element: any) {
    _graphMode = 'focus';
    currentNodes = [];
    currentLines = [];
    // Usable canvas region
    const usableW = canvasW - PAD_LEFT - PAD_RIGHT;
    const usableH = canvasH - PAD_TOP - PAD_BOT;
    const centerX = canvasW / 2;
    const centerY = PAD_TOP + usableH * 0.4; // biased up — label space below
    // Central node - elemento selecionado
    const obsCount = element.data?.observations?.length || 0;
    const centerNode: any = {
        id: element.id,
        x: centerX,
        y: centerY,
        radius: CENTER_RADIUS,
        name: element.name,
        family: element.family,
        isCenter: true,
        isObservation: false,
        ..._buildNodeMetricPayload(element, 0),
        obsCount,
        level: 0,
    };
    currentNodes.push(centerNode);
    // Get connected edges
    let connectedEdges: any[] = [];
    try {
        connectedEdges = getConnectedEdges(element.id) || [];
    } catch (e: any) {
        console.debug('[constellation] getEdgesL0:', errorMessage(e));
        /* edges module may not be initialized */
    }
    Object.assign(centerNode, _buildNodeMetricPayload(element, connectedEdges.length));
    // Group edges by neighbor
    const neighborMap = new Map();
    connectedEdges.forEach((edge: any) => {
        const neighborId = edge.sourceId === element.id ? edge.targetId : edge.sourceId;
        if (!neighborMap.has(neighborId)) neighborMap.set(neighborId, []);
        neighborMap.get(neighborId).push(edge);
    });
    // Satellite nodes - apenas elementos visiveis
    const allNeighbors = Array.from(neighborMap.entries());
    const neighbors = allNeighbors.filter(([nId]) => {
        const n = getElementById(nId);
        return n && n.visible !== false;
    });
    const hiddenCount = allNeighbors.length - neighbors.length;
    const maxVisible = 10;
    const visibleNeighbors = neighbors.slice(0, maxVisible);
    const extraCount = Math.max(0, neighbors.length - maxVisible);
    // Classify neighbors as upstream (RIGHT), downstream (LEFT), or neutral
    const upstreamGroup: any[] = [];
    const downstreamGroup: any[] = [];
    const neutralGroup: any[] = [];
    visibleNeighbors.forEach((entry: any) => {
        const [, edges] = entry;
        const firstEdge = edges[0];
        const edgeType = getEdgeType(firstEdge.type);
        const direction = edgeType?.direction;
        const isOutgoing = firstEdge.sourceId === element.id;
        if (!direction || direction === 'symmetric' || edgeType?.bidirectional) {
            neutralGroup.push(entry);
        } else {
            const srcIsUpstream = SOURCE_UPSTREAM_DIRS.has(direction);
            const neighborIsUpstream = isOutgoing ? !srcIsUpstream : srcIsUpstream;
            if (neighborIsUpstream) {
                upstreamGroup.push(entry);
            } else {
                downstreamGroup.push(entry);
            }
        }
    });
    // ---- Procedural L1 layout - distribute across full canvas width ----
    /**
     * Distribute L1 nodes evenly across a horizontal band.
     * useFraction adapts to count: few nodes dont stretch to extremes.
     */
    const distributeL1 = (group: any[], xMin: number, xMax: number, side: any) => {
        const count = group.length;
        if (count === 0) return;
        const availableW = xMax - xMin;
        // Adaptive: 1 node=55%, 2=70%, 3=85%, 4+=100%
        const useFraction = Math.min(1.0, 0.4 + count * 0.15);
        const effectiveW = availableW * useFraction;
        const offsetX = xMin + (availableW - effectiveW) / 2;
        group.forEach((entry: any, i: number) => {
            const [neighborId, edges] = entry;
            const neighbor = getElementById(neighborId);
            if (!neighbor) return;
            // Horizontal position - evenly distributed
            const nx = count === 1 ? offsetX + effectiveW / 2 : offsetX + (i / (count - 1)) * effectiveW;
            // Vertical jitter - alternate above/below center to avoid flat line
            const amplitude = Math.min(usableH * 0.15, 20);
            const jitter = count <= 1 ? 0 : amplitude * (i % 2 === 0 ? -1 : 1) * (0.5 + 0.5 * (i / count));
            let ny = centerY + jitter;
            ny = Math.max(PAD_TOP + SATELLITE_RADIUS, Math.min(canvasH - PAD_BOT - SATELLITE_RADIUS, ny));
            const nObs = neighbor.data?.observations?.length || 0;
            const node = {
                id: neighborId,
                x: nx,
                y: ny,
                radius: SATELLITE_RADIUS,
                name: neighbor.name,
                family: neighbor.family,
                isCenter: false,
                isObservation: false,
                ..._buildNodeMetricPayload(neighbor, edges.length),
                obsCount: nObs,
                edgeTypes: edges.map((e: any) => e.type),
                side,
                level: 1,
            };
            currentNodes.push(node);
            edges.forEach((edge: any) => {
                const isOutgoing = edge.sourceId === element.id;
                currentLines.push({
                    from: { x: centerX, y: centerY },
                    to: { x: node.x, y: node.y },
                    edge,
                    isOutgoing,
                    level: 1,
                    toNodeId: neighborId,
                });
            });
        });
    };
    // Neutral group: spread horizontally near top of canvas, centered
    const distributeNeutral = (group: any) => {
        const count = group.length;
        if (count === 0) return;
        const neutralY = PAD_TOP + SATELLITE_RADIUS + 4;
        const spread = Math.min(usableW * 0.3, count * 60);
        const startX = centerX - spread / 2;
        group.forEach((entry: any, i: number) => {
            const [neighborId, edges] = entry;
            const neighbor = getElementById(neighborId);
            if (!neighbor) return;
            const nx = count === 1 ? centerX : startX + (i / (count - 1)) * spread;
            const nObs = neighbor.data?.observations?.length || 0;
            const node = {
                id: neighborId,
                x: nx,
                y: neutralY,
                radius: SATELLITE_RADIUS,
                name: neighbor.name,
                family: neighbor.family,
                isCenter: false,
                isObservation: false,
                ..._buildNodeMetricPayload(neighbor, edges.length),
                obsCount: nObs,
                edgeTypes: edges.map((e: any) => e.type),
                side: 'neutral',
                level: 1,
            };
            currentNodes.push(node);
            edges.forEach((edge: any) => {
                const isOutgoing = edge.sourceId === element.id;
                currentLines.push({
                    from: { x: centerX, y: centerY },
                    to: { x: node.x, y: neutralY },
                    edge,
                    isOutgoing,
                    level: 1,
                    toNodeId: neighborId,
                });
            });
        });
    };
    // Right half for upstream, left half for downstream
    // Inset extra 30px from edges so L1 labels (up to ~45px half-width) dont clip
    const l1Inset = 30;
    distributeL1(upstreamGroup, centerX + CENTER_DEADZONE, canvasW - PAD_RIGHT - l1Inset, 'upstream');
    distributeL1(downstreamGroup, PAD_LEFT + l1Inset, centerX - CENTER_DEADZONE, 'downstream');
    distributeNeutral(neutralGroup);
    // ---- Level 2 neighbors - adaptive arc from parent to edge ----
    const l1Set = new Set(visibleNeighbors.map(([id]) => id));
    l1Set.add(element.id);
    const l2Set = new Set();
    let totalL2 = 0;
    const l1Nodes = currentNodes.filter((n: any) => n.level === 1);
    for (const l1Node of l1Nodes) {
        if (totalL2 >= MAX_TOTAL_L2) break;
        let l2Edges: any[];
        try {
            l2Edges = getConnectedEdges(l1Node.id) || [];
        } catch (e: any) {
            console.debug('[constellation] getEdgesL2:', errorMessage(e));
            continue;
        }
        const l2NeighborMap = new Map();
        l2Edges.forEach((edge: any) => {
            const nId = edge.sourceId === l1Node.id ? edge.targetId : edge.sourceId;
            if (l1Set.has(nId) || l2Set.has(nId)) return;
            if (!l2NeighborMap.has(nId)) l2NeighborMap.set(nId, []);
            l2NeighborMap.get(nId).push(edge);
        });
        const l2Candidates = Array.from(l2NeighborMap.entries()).filter(([nId]) => {
            const n = getElementById(nId);
            return n && n.visible !== false;
        });
        const l2Visible = l2Candidates.slice(0, MAX_L2_PER_PARENT);
        const l2Extra = Math.max(0, l2Candidates.length - MAX_L2_PER_PARENT);
        l1Node._extraL2 = l2Extra;
        // Adaptive arc: scales with distance to canvas edge
        const dir = Math.sign(l1Node.x - centerX) || 1;
        const distToEdge = dir > 0 ? canvasW - PAD_RIGHT - l1Node.x : l1Node.x - PAD_LEFT;
        const l2Arc = Math.max(L2_ARC_MIN, Math.min(L2_ARC_MAX, distToEdge * 0.4));
        const baseAngle = Math.atan2(l1Node.y - centerY, l1Node.x - centerX);
        const spreadAngle = Math.PI / 3;
        l2Visible.forEach(([l2Id, l2EdgesArr], i) => {
            if (totalL2 >= MAX_TOTAL_L2) return;
            const l2El = getElementById(l2Id);
            if (!l2El) return;
            const count = l2Visible.length;
            const angleFraction = count === 1 ? 0 : i / (count - 1) - 0.5;
            const angle = baseAngle + spreadAngle * angleFraction;
            let l2x = l1Node.x + Math.cos(angle) * l2Arc;
            let l2y = l1Node.y + Math.sin(angle) * l2Arc;
            // Label-aware clamp: label extends ~halfW beyond node center
            const l2LabelHW = (Math.min((l2El.name || '').length, 12) * 7 * 0.55) / 2 + 6;
            const l2PadX = Math.max(L2_RADIUS, l2LabelHW);
            l2x = Math.max(PAD_LEFT + l2PadX, Math.min(canvasW - PAD_RIGHT - l2PadX, l2x));
            l2y = Math.max(PAD_TOP + L2_RADIUS, Math.min(canvasH - PAD_BOT - L2_RADIUS, l2y));
            const l2Node = {
                id: l2Id,
                x: l2x,
                y: l2y,
                radius: L2_RADIUS,
                name: l2El.name,
                family: l2El.family,
                isCenter: false,
                isObservation: false,
                ..._buildNodeMetricPayload(l2El, l2EdgesArr.length),
                obsCount: 0,
                edgeTypes: l2EdgesArr.map((e: any) => e.type),
                level: 2,
                parentL1Id: l1Node.id,
            };
            currentNodes.push(l2Node);
            l2Set.add(l2Id);
            totalL2++;
            l2EdgesArr.forEach((edge: any) => {
                const isOutgoing = edge.sourceId === l1Node.id;
                currentLines.push({
                    from: { x: l1Node.x, y: l1Node.y },
                    to: { x: l2x, y: l2y },
                    edge,
                    isOutgoing,
                    level: 2,
                    toNodeId: l2Id,
                });
            });
        });
    }
    centerNode._totalL2 = totalL2;
    // ---- Level 3 neighbors - adaptive arc from L2 parent ----
    const allKnownIds = new Set([...l1Set, ...l2Set]);
    const l3Set = new Set();
    let totalL3 = 0;
    const l2Nodes = currentNodes.filter((n: any) => n.level === 2);
    for (const l2Node of l2Nodes) {
        if (totalL3 >= MAX_TOTAL_L3) break;
        let l3Edges: any[];
        try {
            l3Edges = getConnectedEdges(l2Node.id) || [];
        } catch (e: any) {
            console.debug('[constellation] getEdgesL3:', errorMessage(e));
            continue;
        }
        const l3NeighborMap = new Map();
        l3Edges.forEach((edge: any) => {
            const nId = edge.sourceId === l2Node.id ? edge.targetId : edge.sourceId;
            if (allKnownIds.has(nId) || l3Set.has(nId)) return;
            if (!l3NeighborMap.has(nId)) l3NeighborMap.set(nId, []);
            l3NeighborMap.get(nId).push(edge);
        });
        const l3Candidates = Array.from(l3NeighborMap.entries()).filter(([nId]) => {
            const n = getElementById(nId);
            return n && n.visible !== false;
        });
        const l3Visible = l3Candidates.slice(0, MAX_L3_PER_PARENT);
        const l3Extra = Math.max(0, l3Candidates.length - MAX_L3_PER_PARENT);
        l2Node._extraL3 = l3Extra;
        // Adaptive arc from L2 to canvas edge
        const l2Parent = currentNodes.find((n: any) => n.id === l2Node.parentL1Id);
        const refX = l2Parent ? l2Parent.x : centerX;
        const refY = l2Parent ? l2Parent.y : centerY;
        const dir3 = Math.sign(l2Node.x - refX) || Math.sign(l2Node.x - centerX) || 1;
        const distToEdge3 = dir3 > 0 ? canvasW - PAD_RIGHT - l2Node.x : l2Node.x - PAD_LEFT;
        const l3Arc = Math.max(L3_ARC_MIN, Math.min(L3_ARC_MAX, distToEdge3 * 0.25));
        const baseAngle = Math.atan2(l2Node.y - refY, l2Node.x - refX);
        const spreadAngle = Math.PI / 4;
        l3Visible.forEach(([l3Id, l3EdgesArr], i) => {
            if (totalL3 >= MAX_TOTAL_L3) return;
            const l3El = getElementById(l3Id);
            if (!l3El) return;
            const count = l3Visible.length;
            const angleFraction = count === 1 ? 0 : i / (count - 1) - 0.5;
            const angle = baseAngle + spreadAngle * angleFraction;
            let l3x = l2Node.x + Math.cos(angle) * l3Arc;
            let l3y = l2Node.y + Math.sin(angle) * l3Arc;
            const l3LabelHW = (Math.min((l3El.name || '').length, 8) * 5 * 0.55) / 2 + 4;
            const l3PadX = Math.max(L3_RADIUS, l3LabelHW);
            l3x = Math.max(PAD_LEFT + l3PadX, Math.min(canvasW - PAD_RIGHT - l3PadX, l3x));
            l3y = Math.max(PAD_TOP + L3_RADIUS, Math.min(canvasH - PAD_BOT - L3_RADIUS, l3y));
            const l3Node = {
                id: l3Id,
                x: l3x,
                y: l3y,
                radius: L3_RADIUS,
                name: l3El.name,
                family: l3El.family,
                isCenter: false,
                isObservation: false,
                ..._buildNodeMetricPayload(l3El, l3EdgesArr.length),
                obsCount: 0,
                edgeTypes: l3EdgesArr.map((e: any) => e.type),
                level: 3,
                parentL2Id: l2Node.id,
            };
            currentNodes.push(l3Node);
            l3Set.add(l3Id);
            totalL3++;
            l3EdgesArr.forEach((edge: any) => {
                const isOutgoing = edge.sourceId === l2Node.id;
                currentLines.push({
                    from: { x: l2Node.x, y: l2Node.y },
                    to: { x: l3x, y: l3y },
                    edge,
                    isOutgoing,
                    level: 3,
                    toNodeId: l3Id,
                });
            });
        });
    }
    centerNode._totalL3 = totalL3;
    // ---- Overlap resolution (3 passes) ----
    // Estimativa de bounding box incluindo label para evitar sobreposicao visual
    const estimateBBox = (n: any) => {
        const r = n.radius;
        // Largura do label: chars * avgCharWidth por nivel. Catálogo de fonte/chars
        // por tier reusado de core/constellation/nodeLabelSizing (sem isCenter aqui:
        // movableNodes exclui o centro). ARCH-MONOLITH-ATOMIZATION-001.
        const _tier = _pureResolveNodeLabelTier(n.level, false);
        const maxChars = _pureMaxCharsForTier(_tier);
        const fontSize = _pureBaseFontForTier(_tier);
        const labelChars = Math.min((n.name || '').length, maxChars);
        const labelW = labelChars * fontSize * 0.55; // estimativa conservadora
        const halfW = Math.max(r, labelW / 2) + 4; // margem horizontal
        const h = r + fontSize + 8; // raio + label height + gap
        return { halfW, h };
    };
    const movableNodes = currentNodes.filter((n: any) => !n.isCenter && !n.isObservation);
    for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < movableNodes.length; i++) {
            for (let j = i + 1; j < movableNodes.length; j++) {
                const a = movableNodes[i];
                const b = movableNodes[j];
                const bboxA = estimateBBox(a);
                const bboxB = estimateBBox(b);
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                // Check axis-aligned bounding box overlap (label-aware)
                const minDistX = bboxA.halfW + bboxB.halfW + OVERLAP_GAP;
                // eslint-disable-next-line
                const minDistY = bboxA.h + bboxB.h - (a.radius + b.radius); // vertical overlap zone
                const overlapX = minDistX - Math.abs(dx);
                const overlapY = Math.max(0, a.radius + b.radius + OVERLAP_GAP - Math.abs(dy));
                if (overlapX > 0 && overlapY > 0) {
                    // Resolve primarily on the axis with less overlap
                    const aWeight = a.level >= b.level ? 0.7 : 0.3;
                    const bWeight = 1 - aWeight;
                    if (overlapX <= overlapY) {
                        // Push apart horizontally
                        const signX = dx >= 0 ? 1 : -1;
                        a.x -= signX * overlapX * aWeight;
                        b.x += signX * overlapX * bWeight;
                    } else {
                        // Push apart vertically
                        const signY = dy >= 0 ? 1 : -1;
                        a.y -= signY * overlapY * aWeight;
                        b.y += signY * overlapY * bWeight;
                    }
                    // Re-clamp with label-aware padding
                    const clampNode = (n: any) => {
                        const bb = estimateBBox(n);
                        n.x = Math.max(PAD_LEFT + bb.halfW, Math.min(canvasW - PAD_RIGHT - bb.halfW, n.x));
                        n.y = Math.max(PAD_TOP + n.radius, Math.min(canvasH - PAD_BOT - n.radius, n.y));
                    };
                    clampNode(a);
                    clampNode(b);
                }
            }
        }
    }
    // Update line endpoints after overlap resolution
    currentLines.forEach((line: any) => {
        if (line.level === 1) {
            line.from.x = centerX;
            line.from.y = centerY;
            const toNode = currentNodes.find((n: any) => n.id === line.toNodeId);
            if (toNode) {
                line.to.x = toNode.x;
                line.to.y = toNode.y;
            }
        } else if (line.level === 2) {
            const toNode = currentNodes.find((n: any) => n.id === line.toNodeId);
            const parentNode = toNode ? currentNodes.find((n: any) => n.id === toNode.parentL1Id) : null;
            if (parentNode) {
                line.from.x = parentNode.x;
                line.from.y = parentNode.y;
            }
            if (toNode) {
                line.to.x = toNode.x;
                line.to.y = toNode.y;
            }
        } else if (line.level === 3) {
            const toNode = currentNodes.find((n: any) => n.id === line.toNodeId);
            const parentNode = toNode ? currentNodes.find((n: any) => n.id === toNode.parentL2Id) : null;
            if (parentNode) {
                line.from.x = parentNode.x;
                line.from.y = parentNode.y;
            }
            if (toNode) {
                line.to.x = toNode.x;
                line.to.y = toNode.y;
            }
        }
    });
    // Observation dots - pontos ao redor do centro (unchanged)
    const observations = element.data?.observations || [];
    const maxObs = 30;
    const visibleObs = observations.slice(0, maxObs);
    visibleObs.forEach((obs: any, i: number) => {
        const angle = (i / Math.max(visibleObs.length, 1)) * Math.PI * 2;
        const ring = Math.floor(i / 8);
        const dist = CENTER_RADIUS + 10 + ring * 8;
        currentNodes.push({
            id: `obs-${i}`,
            x: centerX + Math.cos(angle) * dist,
            y: centerY + Math.sin(angle) * dist * 0.45,
            radius: OBS_RADIUS,
            name: obs.parameterId || '',
            family: 'observation',
            isCenter: false,
            isObservation: true,
            obsData: obs,
        });
    });
    // Store extra count for legend
    centerNode._extraEdges = extraCount;
    centerNode._hiddenEdges = hiddenCount;
    centerNode._totalEdges = neighbors.length;
    centerNode._totalObs = observations.length;
    // PERF-G3: pre-compute level arrays once - reused in draw() hot path
    _nodesByLevel = new Map();
    _linesByLevel = new Map();
    for (let lvl = 1; lvl <= 3; lvl++) {
        _nodesByLevel.set(
            lvl,
            currentNodes.filter((n: any) => n.level === lvl),
        );
        _linesByLevel.set(
            lvl,
            currentLines.filter((l: any) => l.level === lvl),
        );
    }
    _obsNodes = currentNodes.filter((n: any) => n.isObservation);
}
// ================================================================
// DRAWING (static - no animation)
// ================================================================
// PERF-G3: Pre-computed level arrays - populated by buildNodeLayout, reused here
let _nodesByLevel = new Map();
let _linesByLevel = new Map();
let _obsNodes: any[] = [];
function _groupNodesByLevel( nodes: any) {
    const grouped = new Map();
    for (let lvl = 1; lvl <= 3; lvl++) {
        grouped.set(
            lvl,
            (nodes || []).filter((n: any) => n.level === lvl),
        );
    }
    return grouped;
}
function _groupLinesByLevel( lines: any) {
    const grouped = new Map();
    for (let lvl = 1; lvl <= 3; lvl++) {
        grouped.set(
            lvl,
            (lines || []).filter((l: any) => l.level === lvl),
        );
    }
    return grouped;
}
function draw( ui: any = _buildConstellationMetricSizingUiState()) {
    if (!ctx || !canvas) return;
    // PERF-G4: only recalculate CSS vars when theme changed
    if (_themeColorsDirty) {
        _updateThemeColors();
        _themeColorsDirty = false;
    }
    // HiDPI: limpa o backing store FÍSICO inteiro (canvas.width/height já em px
    // físicos = cssPx × _dpr), não só a região lógica top-left.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // NAV-002: apply view transform (zoom + pan) — _dpr embutido p/ nitidez HiDPI
    ctx.save();
    ctx.setTransform(_viewScale * _dpr, 0, 0, _viewScale * _dpr, _viewX * _dpr, _viewY * _dpr);
    if (_graphMode === 'model') {
        drawModelGraph(ui);
        ctx.restore();
        _drawZoomIndicator();
        _drawMinimap();
        return;
    }
    const visibleNodes = ui.nodes || currentNodes;
    const visibleLines = ui.lines || currentLines;
    const centerNode =
        visibleNodes.find((n: any) => n.isCenter) ||
        currentNodes.find((n: any) => n.isCenter);
    if (!centerNode) {
        // Empty state - nenhum elemento selecionado
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillStyle = _theme.textFaint;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            t('constellation.emptyState') || 'Select an element to see its connections',
            canvasW / 2,
            canvasH / 2,
        );
        return;
    }
    const nodesByLevel = _groupNodesByLevel(visibleNodes);
    const linesByLevel = _groupLinesByLevel(visibleLines);
    const visibleObsNodes = visibleNodes.filter((n: any) => n.isObservation);
    // 1. L3 connection lines (farthest back)
    (linesByLevel.get(3) ?? []).forEach((line: any) => drawConnectionLine(line, visibleNodes));
    // 2. L2 connection lines
    (linesByLevel.get(2) ?? []).forEach((line: any) => drawConnectionLine(line, visibleNodes));
    // 3. L1 connection lines
    (linesByLevel.get(1) ?? []).forEach((line: any) => drawConnectionLine(line, visibleNodes));
    // 4. Observation dots
    visibleObsNodes.forEach(drawObservationDot);
    // 5. L3 satellite nodes
    (nodesByLevel.get(3) ?? []).forEach((n: any) => drawNode(n, false));
    // 6. L2 satellite nodes
    (nodesByLevel.get(2) ?? []).forEach((n: any) => drawNode(n, false));
    // 7. L1 satellite nodes
    (nodesByLevel.get(1) ?? []).forEach((n: any) => drawNode(n, false));
    // 8. Central node (on top)
    drawNode(centerNode, true);
    // 9. Legend bar at bottom
    drawLegend(centerNode, ui);
}
function drawModelGraph( ui: any = _buildConstellationMetricSizingUiState()) {
    const visibleNodes = ui.nodes || currentNodes;
    const visibleLines = ui.lines || currentLines;
    if (!visibleNodes.length) {
        ctx.font = '12px Inter, system-ui, sans-serif';
        ctx.fillStyle = _theme.textFaint;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
            t('constellation.emptyState') || 'Select an element to see its connections',
            canvasW / 2,
            canvasH / 2,
        );
        return;
    }
    visibleLines.forEach((line: any) => drawConnectionLine(line, visibleNodes));
    visibleNodes.forEach((node: any) => drawNode(node, false));
    const summary = _modelGraphCache.summary || {
        nodeCount: currentNodes.length,
        edgeCount: currentLines.length,
    };
    const hint = hoveredNodeId
        ? currentNodes.find((node: any) => node.id === hoveredNodeId)?.name || hoveredNodeId
        : t('constellation.clickToFocus') || 'Click a node to focus';
    // statusText (debug bridge) só em modo debug; impactText é user-facing → sempre.
    const impactPart = ui?.impactText ? `  ·  ${ui.impactText}` : '';
    const bridgeStatus = ui?.statusText && _isConstellationDebug() ? `  ·  ${ui.statusText}` : '';
    const legendText = truncate(
        `${summary.nodeCount} nodes  ·  ${summary.edgeCount} edges  ·  ${hint}${impactPart}${bridgeStatus}`,
        120,
    );
    ctx.font = '9px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(legendText).width;
    ctx.fillStyle = _theme.bgSolid;
    roundRect(ctx, canvasW / 2 - tw / 2 - 8, canvasH - 18, tw + 16, 16, 4);
    ctx.fill();
    ctx.fillStyle = _theme.textFaint;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(legendText, canvasW / 2, canvasH - 7);
}
function _clampUiOpacity( value: any) {
    return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
function drawNode( node: any, isCenter: any) {
    const baseColor = FAMILY_COLORS[node.family] || FAMILY_COLORS.default;
    const color = (IMPACT_NODE_COLORS as Record<string, string>)[node._impactState] || baseColor;
    const isHovered = node.id === hoveredNodeId;
    const hoverScale = isHovered ? 1.15 : 1;
    const r = node.radius * hoverScale;
    const lvl = node.level || 0;
    const isDeep = lvl >= 2; // L2 or L3
    const isL3 = lvl === 3;
    // Zoom semântico: amortece o tamanho de fontes/badges para que cresçam
    // sub-linearmente no zoom in (ver _labelScale). 1 em zoom ≤ 1 (sem mudança).
    const ls = _labelScale();
    const uiOpacity = _clampUiOpacity(node._uiOpacity);
    if (uiOpacity <= 0.02) return;
    ctx.save();
    ctx.globalAlpha *= uiOpacity;
    // Subtle outer glow - skip for L2/L3 nodes (visual hierarchy)
    if (!isDeep) {
        const glowR = r + (isCenter ? 16 : 10);
        const glow = ctx.createRadialGradient(node.x, node.y, r * 0.3, node.x, node.y, glowR);
        glow.addColorStop(0, color + '20');
        glow.addColorStop(0.6, color + '10');
        glow.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(node.x, node.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
    }
    // Main circle - deeper levels use lower opacity
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = color + (isL3 ? '77' : isDeep ? '99' : 'DD');
    ctx.fill();
    ctx.strokeStyle = node._impactState === 'unaffected' ? _theme.textFaint : isHovered ? _theme.text : color;
    ctx.lineWidth =
        node._impactState && node._impactState !== 'unaffected' ? 2.5 : isDeep ? 0.5 : isCenter ? 2 : isHovered ? 2 : 1;
    ctx.stroke();
    // Inner highlight ring for depth
    if (!isDeep) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
    // Family icon inside node - L3 too small for icon
    if (!isL3) {
        const icon = FAMILY_ICONS[node.family] || FAMILY_ICONS.default;
        ctx.font = `${(isCenter ? 12 : isDeep ? 7 : 10) * ls}px sans-serif`;
        ctx.fillStyle = isDeep ? _theme.textMuted : _theme.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(icon, node.x, node.y);
    }
    ctx.restore();
    // CONSTELLATION-A11Y: anel de foco no nó navegado por teclado (acento, dashed).
    if (node.id === _kbFocusedNodeId) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = _theme.text || '#7dd3fc';
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 2]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }
    // Name label below node
    // L2: omit on canvasH < 100; L3: omit on canvasH < 120
    // LOD de legibilidade no zoom-out (Calvin 2026-06-03): tamanho de fonte
    // BASE (px de tela = base × _viewScale, pois ls=1 em zoom ≤ 1). Quando o
    // usuário afasta muito, rótulos ficam ilegíveis (< MIN) → esconde em vez de
    // inflar (boost causaria overlap). Best practice graph-viz: "detail on demand"
    // — o indicador de zoom encoraja aproximar para reler. Só atua em zoom < 1
    // (em zoom ≥ 1 o comportamento default é preservado; hover sempre mostra).
    // Decisão de tamanho/visibilidade do rótulo extraída para core puro
    // (core/constellation/nodeLabelSizing — ARCH-MONOLITH-ATOMIZATION-001).
    const _labelDecision = _pureResolveNodeLabel({
        level: lvl,
        isCenter,
        viewScale: _viewScale,
        isHovered,
        userHideLabels: _userHideLabels,
        lodShowLabel: node._lodShowLabel,
        suppressLabel: node.suppressLabel,
        name: node.name,
        canvasH,
    });
    const showLabel = _labelDecision.show;
    if (showLabel) {
        ctx.save();
        const fontSize = _labelDecision.fontSize;
        ctx.font = isCenter
            ? `bold ${fontSize}px Inter, system-ui, sans-serif`
            : `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = truncate(node.name, _labelDecision.maxChars);
        const tw = ctx.measureText(label).width;
        const lx = node.x;
        const ly = node.y + r + (isL3 ? 2 : 3);
        // Pill behind label
        ctx.fillStyle = _theme.bgSolid;
        const pad = isDeep ? 2 : 4;
        roundRect(ctx, lx - tw / 2 - pad, ly - 1, tw + pad * 2, fontSize + 4, 3);
        ctx.fill();
        ctx.fillStyle = isHovered ? _theme.text : isDeep ? _theme.textFaint : _theme.textMuted;
        ctx.fillText(label, lx, ly + 1);
        // Observation count badge - only for L0/L1
        if (!isDeep && node.obsCount > 0 && !node.isObservation) {
            const badge = `${node.obsCount}`;
            ctx.font = `bold ${8 * ls}px Inter, system-ui, sans-serif`;
            const bw = ctx.measureText(badge).width + 6 * ls;
            const bx = node.x + r - 2;
            const by = node.y - r - 2;
            ctx.fillStyle = '#FFA726';
            ctx.beginPath();
            ctx.arc(bx, by, Math.max(bw / 2, 7 * ls), 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(badge, bx, by);
        }
        ctx.restore();
    }
    // Edge type labels for L1 satellites only
    if (!isCenter && !isDeep && node.edgeTypes && node.edgeTypes.length > 0) {
        ctx.save();
        ctx.font = `${7 * ls}px JetBrains Mono, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const typeLabel = node.edgeTypes[0].replace(/_/g, ' ');
        ctx.fillStyle = _theme.textFaint;
        ctx.fillText(typeLabel, node.x, node.y - r - 4);
        ctx.restore();
    }
    // Overflow indicator "+N" for nodes with hidden children
    const extraChildren = node._extraL2 || node._extraL3 || 0;
    if (extraChildren > 0) {
        ctx.save();
        ctx.font = `bold ${(isDeep ? 6 : 7) * ls}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = _theme.textFaint;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${extraChildren}`, node.x + node.radius + 10, node.y - node.radius);
        ctx.restore();
    }
}
function drawConnectionLine( line: any, nodePool: any = currentNodes) {
    const { from, to, edge, isOutgoing, level: lineLevel, toNodeId, fromNodeId } = line;
    const fromNode = fromNodeId ? nodePool.find((node: any) => node.id === fromNodeId) : null;
    const toNode = toNodeId ? nodePool.find((node: any) => node.id === toNodeId) : null;
    const fromPoint = fromNode ? { x: fromNode.x, y: fromNode.y } : from;
    const toPoint = toNode ? { x: toNode.x, y: toNode.y } : to;
    if (!fromPoint || !toPoint) return;
    const edgeType = getEdgeType(edge.type);
    const category = edgeType ? /** @type {Record<string, any>} */ (EDGE_CATEGORIES)[edgeType.category] : null;
    const color = (IMPACT_LINE_COLORS as Record<string, string>)[line._impactState] || category?.color || '#607D8B';
    const isImpactCritical = line._impactState === 'critical';
    const isImpactAffected = line._impactState === 'affected';
    const isDeep = lineLevel >= 2;
    const isL3 = lineLevel === 3;
    // Highlight line when its target node is hovered
    const isHighlighted = toNodeId && toNodeId === hoveredNodeId;
    const uiOpacity = _clampUiOpacity(line._uiOpacity) * _clampUiOpacity(line._lodEdgeOpacity);
    if (uiOpacity <= 0.02) return;
    ctx.save();
    ctx.globalAlpha *= uiOpacity;
    // Main line - deeper levels are thinner and more transparent
    ctx.beginPath();
    ctx.moveTo(fromPoint.x, fromPoint.y);
    ctx.lineTo(toPoint.x, toPoint.y);
    const opacityHex = isImpactCritical
        ? 'F0'
        : isImpactAffected
          ? 'B0'
          : isHighlighted
            ? '80'
            : isL3
              ? '20'
              : isDeep
                ? '30'
                : '50';
    ctx.strokeStyle = color + opacityHex;
    ctx.lineWidth = isImpactCritical ? 3 : isImpactAffected ? 2 : isHighlighted ? 2 : isL3 ? 0.5 : isDeep ? 0.8 : 1.5;
    ctx.setLineDash(isImpactCritical ? [] : isL3 ? [2, 3] : isDeep ? [3, 4] : [6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Direction arrow - progressively smaller for deeper levels
    const t = isL3 ? 0.55 : isDeep ? 0.6 : 0.65;
    const ax = fromPoint.x + (toPoint.x - fromPoint.x) * t;
    const ay = fromPoint.y + (toPoint.y - fromPoint.y) * t;
    const angle = Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x);
    const arrowDir = isOutgoing ? 0 : Math.PI;
    const arrowSize = isL3 ? 2 : isDeep ? 3 : 5;
    const arrowHalf = isL3 ? 1.5 : isDeep ? 2 : 3;
    ctx.translate(ax, ay);
    ctx.rotate(angle + arrowDir);
    ctx.beginPath();
    ctx.moveTo(arrowSize, 0);
    ctx.lineTo(-arrowHalf, -arrowHalf);
    ctx.lineTo(-arrowHalf, arrowHalf);
    ctx.closePath();
    ctx.fillStyle = color + (isHighlighted ? '90' : '70');
    ctx.fill();
    ctx.restore();
}
function drawObservationDot( node: any) {
    const obsIndex = parseInt(node.id.replace('obs-', ''), 10);
    const isActive = activeEditIndex === obsIndex;
    const r = isActive ? node.radius * 1.6 : node.radius;
    const uiOpacity = _clampUiOpacity(node._uiOpacity);
    if (uiOpacity <= 0.02) return;
    ctx.save();
    ctx.globalAlpha *= uiOpacity;
    // Outer glow when active
    if (isActive) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 167, 38, 0.3)';
        ctx.fill();
    }
    // Main dot
    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? 'rgba(255, 200, 100, 0.9)' : 'rgba(255, 250, 200, 0.5)';
    ctx.fill();
    ctx.restore();
}
function drawLegend( centerNode: any, ui: any = _lastUiBridgeState) {
    const totalEdges = centerNode._totalEdges || 0;
    const totalObs = centerNode._totalObs || 0;
    const extra = centerNode._extraEdges || 0;
    const hidden = centerNode._hiddenEdges || 0;
    const totalL2 = centerNode._totalL2 || 0;
    const totalL3 = centerNode._totalL3 || 0;
    const parts = [];
    // FIX legenda (Calvin 2026-06-03): as strings i18n ".other" já carregam
    // {count} (ex.: "{count} conexões"), então NÃO prefixar `${totalEdges}` —
    // antes saía "11 11 conexões" / "260 260 observações" (contagem duplicada).
    if (totalEdges > 0)
        parts.push(
            totalEdges === 1
                ? t('constellation.connections.one') || '1 connection'
                : (t('constellation.connections.other') || '{count} connections').replace('{count}', String(totalEdges)),
        );
    if (totalL2 > 0) parts.push(`${totalL2} L2`);
    if (totalL3 > 0) parts.push(`${totalL3} L3`);
    if (totalObs > 0)
        parts.push(
            totalObs === 1
                ? t('constellation.observations.one') || '1 observation'
                : (t('constellation.observations.other') || '{count} observations').replace('{count}', String(totalObs)),
        );
    if (extra > 0) parts.push((t('constellation.more') || '+{count} more').replace('{count}', extra));
    if (hidden > 0) parts.push((t('constellation.hidden') || '{count} hidden').replace('{count}', hidden));
    if (parts.length === 0) parts.push(t('constellation.noConnections') || 'no connections');
    // Texto de impacto é user-facing → sempre. statusText é debug do bridge
    // (LOD/metric/diff) → só em modo debug (Calvin 2026-06-03).
    if (ui?.impactText) parts.push(ui.impactText);
    if (ui?.statusText && _isConstellationDebug()) parts.push(ui.statusText);
    const legendText = truncate(parts.join('  \u00B7  '), Math.max(48, Math.floor(canvasW / 7)));
    ctx.font = '9px Inter, system-ui, sans-serif';
    const tw = ctx.measureText(legendText).width;
    // Background strip for legend
    ctx.fillStyle = _theme.bgSolid;
    roundRect(ctx, canvasW / 2 - tw / 2 - 8, canvasH - 18, tw + 16, 16, 4);
    ctx.fill();
    ctx.fillStyle = _theme.textFaint;
    ctx.textAlign = 'center';
    ctx.fillText(legendText, canvasW / 2, canvasH - 8);
    // NAV-002: restore view transform before overlays
    ctx.restore();
    _drawZoomIndicator();
    _drawMinimap();
}
// ================================================================
// NAV-002: ZOOM INDICATOR + MINIMAP
// ================================================================
function _updateZoomIndicator() {
    const el = document.getElementById('constellation-zoom-indicator');
    if (!el) return;
    el.textContent = `${_viewScale.toFixed(1)}×`;
    el.style.display = _viewScale !== 1.0 ? 'block' : 'none';
}
function _drawZoomIndicator() {
    if (!ctx) return;
    if (Math.abs(_viewScale - 1.0) < 0.05) return;
    const label = `${_viewScale.toFixed(1)}×`;
    ctx.save();
    ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0); // overlay em coords lógicas (HiDPI)
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left';
    ctx.fillText(label, 8, 16);
    ctx.restore();
}
function _drawMinimap() {
    if (!_minimapVisible || !currentNodes.length || !ctx) return;
    const MW = 80;
    const MH = 60;
    const MX = canvasW - MW - 6;
    const MY = canvasH - MH - 6;
    // Background
    ctx.save();
    ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0); // overlay em coords lógicas (HiDPI)
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect?.(MX, MY, MW, MH, 4) || ctx.rect(MX, MY, MW, MH);
    ctx.fill();
    ctx.stroke();
    // Compute bounding box of nodes
    const xs = currentNodes.map((n: any) => n.x);
    const ys = currentNodes.map((n: any) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const mScale = Math.min((MW - 8) / spanX, (MH - 8) / spanY);
    const toMX = (x: any) => MX + 4 + (x - minX) * mScale;
    const toMY = (y: any) => MY + 4 + (y - minY) * mScale;
    // Draw nodes as small dots
    for (const node of currentNodes) {
        const color = FAMILY_COLORS[node.family] || FAMILY_COLORS.default;
        ctx.fillStyle = node.isCenter ? '#ffffff' : color;
        ctx.beginPath();
        ctx.arc(toMX(node.x), toMY(node.y), Math.max(1.5, node.radius * mScale), 0, Math.PI * 2);
        ctx.fill();
    }
    // Viewport rectangle
    const vpX1 = toMX(-_viewX / _viewScale);
    const vpY1 = toMY(-_viewY / _viewScale);
    const vpW = (canvasW / _viewScale) * mScale;
    const vpH = (canvasH / _viewScale) * mScale;
    ctx.strokeStyle = 'rgba(100,160,255,0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX1, vpY1, vpW, vpH);
    ctx.restore();
}
// ================================================================
// NAV-002: TOOLTIP
// ================================================================
function _scheduleTooltip( nodeId: any, clientX: any, clientY: any) {
    if (_tooltipTimer) clearTimeout(_tooltipTimer);
    if (!nodeId) {
        _hideTooltip();
        return;
    }
    _tooltipTimer = setTimeout(() => _showTooltip(nodeId, clientX, clientY), 400);
}
function _showTooltip( nodeId: any, clientX: any, clientY: any) {
    if (!_tooltipEl) return;
    const node = currentNodes.find((n: any) => n.id === nodeId);
    if (!node) return;
    const el = getElementById(nodeId);
    const obsCount = el?.data?.observations?.length || 0;
    const lastObs = el?.data?.observations?.[obsCount - 1];
    const lastVal = lastObs ? `${lastObs.parameterId || ''} ${lastObs.value ?? ''} ${lastObs.unitId || ''}`.trim() : '';
    // Build tooltip content using textContent (XSS-safe)
    _tooltipEl.innerHTML = '';
    const name = document.createElement('div');
    name.className = 'ctip-name';
    name.textContent = node.name || nodeId;
    _tooltipEl.appendChild(name);
    if (node.family) {
        const fam = document.createElement('div');
        fam.className = 'ctip-family';
        fam.textContent = node.family;
        _tooltipEl.appendChild(fam);
    }
    const obs = document.createElement('div');
    obs.className = 'ctip-obs';
    obs.textContent = `${obsCount} obs.`;
    _tooltipEl.appendChild(obs);
    if (lastVal) {
        const val = document.createElement('div');
        val.className = 'ctip-val';
        val.textContent = lastVal;
        _tooltipEl.appendChild(val);
    }
    // Position near cursor, constrained within HUD
    const hud = document.getElementById('constellation-hud');
    const hudRect = hud?.getBoundingClientRect() || { left: 0, top: 0, width: 9999, height: 9999 };
    const TW = 160;
    const TH = 80;
    let tx = clientX - hudRect.left + 12;
    let ty = clientY - hudRect.top - TH / 2;
    if (tx + TW > hudRect.width - 4) tx = clientX - hudRect.left - TW - 8;
    if (ty < 4) ty = 4;
    if (ty + TH > hudRect.height - 4) ty = hudRect.height - TH - 4;
    _tooltipEl.style.left = `${tx}px`;
    _tooltipEl.style.top = `${ty}px`;
    _tooltipEl.style.display = 'block';
}
function _hideTooltip() {
    if (_tooltipTimer) clearTimeout(_tooltipTimer);
    if (_tooltipEl) _tooltipEl.style.display = 'none';
}
// ================================================================
// INTERACTION
// ================================================================
function handleCanvasClick( e: any) {
    e.stopPropagation();
    e.preventDefault();
    // Ignore click if it was a drag gesture
    if (_dragHasMoved) return;
    const { mx, my } = getCanvasCoords(e);
    // Check satellite nodes first
    {
        const node = pickNodeAt(mx, my, currentNodes, (n: any) => !n.isObservation && !n.isCenter);
        if (node) {
            hideObsEditCard();
            hideObsList();
            if (_onSelect) _onSelect(node.id);
            _dispatchHostedActionsIntegrationEvent('node-selected', { nodeId: node.id });
            const el = getElementById(node.id);
            if (el && !_isHostedInActionsShell()) {
                setSelectedNodes([
                    {
                        id: el.id,
                        name: el.name,
                        type: el.family,
                        status: el.status || 'active',
                        connections: node.degree || node.edgeTypes?.length || 0,
                    },
                ]);
                showInfoPanel();
            }
            return;
        }
    }
    // Check observation dots - open HTML edit card
    {
        const node = pickNodeAt(mx, my, currentNodes, (n: any) => !!n.isObservation);
        if (node) {
            const obsIndex = parseInt(node.id.replace('obs-', ''), 10);
            if (activeEditIndex === obsIndex) {
                hideObsEditCard();
            } else {
                showObsEditCard(obsIndex, node.x, node.y);
            }
            return;
        }
    }
    // Check center node obs badge click - open list popover
    const centerNode = currentNodes.find((n: any) => n.isCenter);
    if (centerNode && centerNode.obsCount > 0) {
        const bx = centerNode.x + centerNode.radius - 2;
        const by = centerNode.y - centerNode.radius - 2;
        if (isPointInCircle(mx, my, bx, by, 12)) {
            if (activeObsList) {
                hideObsList();
            } else {
                showObsList();
            }
            return;
        }
    }
    // Click empty space - close overlays
    hideObsEditCard();
    hideObsList();
}
function handleCanvasDoubleClick( e: any) {
    e.stopPropagation();
    e.preventDefault();
    const { mx, my } = getCanvasCoords(e);
    const hit = pickNodeAt(mx, my, currentNodes, (n: any) => !n.isObservation && !n.isCenter);
    if (hit && _openHostedNodeInModel(hit.id)) return;
    // NAV-002: double-click on empty area → fit all
    fitAll();
}
function _findNodeAt( mx: any, my: any) {
    return pickNodeAt(mx, my, currentNodes);
}
function handleCanvasMouseDown( e: any) {
    e.stopPropagation();
    const { mx, my } = getCanvasCoords(e);
    const node = _findNodeAt(mx, my);
    if (node && !node.isObservation && !node.isCenter) {
        // Drag existing node
        _dragNodeId = node.id;
        _dragStartX = e.clientX;
        _dragStartY = e.clientY;
        _dragHasMoved = false;
        _isPanning = false;
    } else {
        // NAV-002: Pan background
        _isPanning = true;
        _panStartX = e.clientX;
        _panStartY = e.clientY;
        _panOriginX = _viewX;
        _panOriginY = _viewY;
        _dragNodeId = null;
        _dragHasMoved = false;
        canvas.style.cursor = 'grabbing';
    }
    // Document-level listeners ensure release fires even if cursor leaves canvas.
    document.addEventListener('mousemove', _docDragMouseMove, true);
    document.addEventListener('mouseup', _docDragMouseUp, true);
}
function _docDragMouseMove( e: any) {
    // Forward only when actually dragging/panning; otherwise the canvas hover
    // path runs from the canvas-bound mousemove listener.
    if (_dragNodeId || _isPanning) handleCanvasMouseMove(e);
}
function _docDragMouseUp( e: any) {
    document.removeEventListener('mousemove', _docDragMouseMove, true);
    document.removeEventListener('mouseup', _docDragMouseUp, true);
    handleCanvasMouseUp(e);
}
function handleCanvasMouseUp( e: any) {
    e.stopPropagation();
    _dragNodeId = null;
    _isPanning = false;
    if (canvas) canvas.style.cursor = 'default';
}
function handleCanvasMouseMove( e: any) {
    const { mx, my } = getCanvasCoords(e);
    // Drag node
    if (_dragNodeId) {
        const node = currentNodes.find((n: any) => n.id === _dragNodeId);
        if (node) {
            node.x = mx;
            node.y = my;
            drawStatic();
        }
        const moveDist = Math.hypot(e.clientX - _dragStartX, e.clientY - _dragStartY);
        if (moveDist > 3) _dragHasMoved = true;
        canvas.style.cursor = 'grabbing';
        return;
    }
    // NAV-002: Pan
    if (_isPanning) {
        _viewX = _panOriginX + (e.clientX - _panStartX);
        _viewY = _panOriginY + (e.clientY - _panStartY);
        drawStatic();
        canvas.style.cursor = 'grabbing';
        return;
    }
    // Hover detection
    let foundPointer = false;
    let newHovered: any = null;
    const hoveredSat = pickNodeAt(mx, my, currentNodes, (n: any) => !n.isObservation && !n.isCenter);
    if (hoveredSat) {
        newHovered = hoveredSat.id;
        foundPointer = true;
    }
    if (!foundPointer) {
        if (pickNodeAt(mx, my, currentNodes, (n: any) => !!n.isObservation)) foundPointer = true;
    }
    if (!foundPointer) {
        const centerNode = currentNodes.find((n: any) => n.isCenter);
        if (centerNode && centerNode.obsCount > 0) {
            const bx = centerNode.x + centerNode.radius - 2;
            const by = centerNode.y - centerNode.radius - 2;
            if (isPointInCircle(mx, my, bx, by, 12)) foundPointer = true;
        }
    }
    // NAV-002: Tooltip timer
    _scheduleTooltip(newHovered, e.clientX, e.clientY);
    if (hoveredNodeId !== newHovered) {
        hoveredNodeId = newHovered;
        drawStatic();
    }
    canvas.style.cursor = foundPointer ? 'grab' : 'default';
}
/** NAV-002: Wheel zoom handler. */
function handleCanvasWheel( e: any) {
    e.preventDefault();
    e.stopPropagation();
    const rect = canvas.getBoundingClientRect();
    const rawX = (e.clientX - rect.left) * (canvasW / rect.width);
    const rawY = (e.clientY - rect.top) * (canvasH / rect.height);
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    _applyZoom(factor, rawX, rawY);
}
function getCanvasCoords( e: any) {
    const rect = canvas.getBoundingClientRect();
    // Raw canvas pixel coords (accounting for CSS scaling)
    const rawX = (e.clientX - rect.left) * (canvasW / rect.width);
    const rawY = (e.clientY - rect.top) * (canvasH / rect.height);
    // NAV-002: apply inverse view transform to get graph-space coords
    return {
        mx: (rawX - _viewX) / _viewScale,
        my: (rawY - _viewY) / _viewScale,
    };
}
/** NAV-002: Reset view to identity (no zoom, centered). */
export function resetConstellationView() {
    _viewX = 0;
    _viewY = 0;
    _viewScale = 1.0;
    drawStatic();
}
/** NAV-002: Fit all nodes in viewport. */
function fitAll() {
    if (!currentNodes.length) return;
    const PADDING = 24;
    const xs = currentNodes.map((n: any) => n.x);
    const ys = currentNodes.map((n: any) => n.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = maxX - minX || 1;
    const spanY = maxY - minY || 1;
    const scaleX = (canvasW - 2 * PADDING) / spanX;
    const scaleY = (canvasH - 2 * PADDING) / spanY;
    _viewScale = Math.min(Math.max(Math.min(scaleX, scaleY), MIN_ZOOM), MAX_ZOOM);
    _viewX = (canvasW - (minX + maxX) * _viewScale) / 2;
    _viewY = (canvasH - (minY + maxY) * _viewScale) / 2;
    drawStatic();
}
/**
 * Pivô de zoom para os botões: posição (canvas-px) do nó focal/center se houver,
 * senão o meio do canvas. Mantém o nó selecionado estacionário ao aproximar.
 * @returns {{x:number,y:number}}
 */
function _focalZoomPivot(): { x: number; y: number } {
    const center = currentNodes.find((n: any) => n.isCenter);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
        return { x: center.x * _viewScale + _viewX, y: center.y * _viewScale + _viewY };
    }
    return { x: canvasW / 2, y: canvasH / 2 };
}
// ================================================================
// CONSTELLATION-A11Y (Calvin 2026-06-03) — navegação por teclado nos nós
// ================================================================
/** Cria (uma vez) a região aria-live polite para anúncios ao leitor de tela. */
function _ensureKbLiveRegion() {
    if (_kbLiveRegion) return _kbLiveRegion;
    _kbLiveRegion = document.createElement('div');
    _kbLiveRegion.id = 'constellation-aria-live';
    _kbLiveRegion.setAttribute('aria-live', 'polite');
    _kbLiveRegion.setAttribute('aria-atomic', 'true');
    // Visualmente oculto, acessível a leitores de tela (padrão sr-only).
    _kbLiveRegion.style.cssText =
        'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;';
    (document.getElementById('constellation-hud') || document.body).appendChild(_kbLiveRegion);
    return _kbLiveRegion;
}
/** Anuncia o nó focado na região aria-live. */
function _kbAnnounce(node: any) {
    if (!node) return;
    const fam = node.family || '';
    const obs = node.obsCount ? `, ${node.obsCount} obs` : '';
    _ensureKbLiveRegion().textContent = `${node.name || node.id}${fam ? ' (' + fam + ')' : ''}${obs}`;
}
/**
 * Move o foco de teclado entre os nós de currentNodes (cíclico). dir = +1/-1.
 * Atualiza _kbFocusedNodeId, redesenha (anel de foco) e anuncia.
 */
function _kbNavigate(dir: number) {
    if (!currentNodes.length) return;
    const idx = currentNodes.findIndex((n: any) => n.id === _kbFocusedNodeId);
    const next = idx < 0 ? (dir > 0 ? 0 : currentNodes.length - 1) : (idx + dir + currentNodes.length) % currentNodes.length;
    const node = currentNodes[next];
    _kbFocusedNodeId = node?.id || null;
    hoveredNodeId = _kbFocusedNodeId; // realça igual ao hover do mouse
    drawStatic();
    _kbAnnounce(node);
}
/** Teclado sobre o canvas focado: setas navegam, Enter/Espaço seleciona, Esc limpa. */
function _handleConstellationKeydown(e: any) {
    switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
            e.preventDefault();
            _kbNavigate(1);
            break;
        case 'ArrowLeft':
        case 'ArrowUp':
            e.preventDefault();
            _kbNavigate(-1);
            break;
        case 'Home':
            e.preventDefault();
            _kbFocusedNodeId = null;
            _kbNavigate(1);
            break;
        case 'End':
            e.preventDefault();
            _kbFocusedNodeId = null;
            _kbNavigate(-1);
            break;
        case 'Enter':
        case ' ': {
            const node = currentNodes.find((n: any) => n.id === _kbFocusedNodeId);
            if (node && _onSelect) {
                e.preventDefault();
                _onSelect(node.id);
            }
            break;
        }
        case 'Escape':
            if (_kbFocusedNodeId) {
                _kbFocusedNodeId = null;
                hoveredNodeId = null;
                drawStatic();
            }
            break;
    }
}
// ================================================================
// CONSTELLATION-CONFIG-MENU (Calvin 2026-06-03)
// Menu de configuração por botão direito sobre o canvas. Reúne as opções já
// existentes (layout, minimapa, fit/reset, export) + toggle de rótulos num único
// ponto descobrível. Reusa .panel-context-menu (CSS) + contextMenuHelpers
// (clamp/close/a11y) — mesma infraestrutura do globalContextMenu.
// ================================================================
function _handleConstellationContextMenu(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation(); // impede o globalContextMenu (fallback) de também abrir
    _showConstellationConfigMenu(e.clientX, e.clientY);
}
function _closeConstellationConfigMenu() {
    if (_configMenuCloseCtrl) {
        _configMenuCloseCtrl.abort();
        _configMenuCloseCtrl = null;
    }
    if (_configMenuEl) {
        _configMenuEl.remove();
        _configMenuEl = null;
    }
}
function _showConstellationConfigMenu(x: number, y: number) {
    _closeConstellationConfigMenu();
    const hasNodes = currentNodes.length > 0;
    const tt = (k: string, fb: string) => t(k) || fb;
    const item = (
        action: string,
        icon: string,
        label: string,
        opts: { active?: boolean; disabled?: boolean } = {},
    ) =>
        `<button class="panel-context-menu-item${opts.active ? ' active' : ''}${opts.disabled ? ' disabled' : ''}"` +
        ` data-action="${action}"${opts.disabled ? ' disabled aria-disabled="true"' : ''}>` +
        `${getIcon(icon, { size: '14px' })}<span>${label}</span></button>`;
    const header = (label: string) => `<div class="panel-context-menu-label">${label}</div>`;
    const sep = '<div class="panel-context-menu-sep"></div>';
    _configMenuEl = document.createElement('div');
    _configMenuEl.id = 'constellation-config-menu';
    _configMenuEl.className = 'panel-context-menu visible';
    _configMenuEl.innerHTML =
        header(tt('constellation.menu.layout', 'Layout')) +
        item('layout-force', 'git-merge', tt('constellation.menu.layoutForce', 'Force-directed'), {
            disabled: !hasNodes,
        }) +
        item('layout-circular', 'rotate-cw', tt('constellation.menu.layoutCircular', 'Circular'), {
            disabled: !hasNodes,
        }) +
        sep +
        header(tt('constellation.menu.display', 'Display')) +
        item('toggle-minimap', 'map-pin', tt('constellation.menu.minimap', 'Minimap'), {
            active: _minimapVisible,
        }) +
        item('toggle-labels', 'sticky-note', tt('constellation.menu.labels', 'Labels'), {
            active: !_userHideLabels,
        }) +
        sep +
        header(tt('constellation.menu.view', 'View')) +
        item('zoom-in', 'zoom-in', tt('constellation.menu.zoomIn', 'Zoom in')) +
        item('zoom-out', 'zoom-out', tt('constellation.menu.zoomOut', 'Zoom out')) +
        item('fit', 'maximize-2', tt('constellation.menu.fit', 'Fit to screen'), { disabled: !hasNodes }) +
        item('reset', 'refresh-cw', tt('constellation.menu.reset', 'Reset zoom')) +
        sep +
        header(tt('constellation.menu.export', 'Export')) +
        item('export-png', 'download-cloud', tt('constellation.menu.exportPng', 'Export PNG'), {
            disabled: !hasNodes,
        }) +
        item('export-svg', 'file-text', tt('constellation.menu.exportSvg', 'Export SVG'), {
            disabled: !hasNodes,
        });
    document.body.appendChild(_configMenuEl);
    clampMenuToViewport(_configMenuEl, x, y);
    applyMenuA11y(_configMenuEl, { label: tt('constellation.menu.title', 'Configure view') });
    const onAction = (action: string) => {
        switch (action) {
            case 'layout-force':
                window.setConstellationLayout?.('force');
                break;
            case 'layout-circular':
                window.setConstellationLayout?.('circular');
                break;
            case 'toggle-minimap':
                window.handleConstellationToggleMinimap?.();
                break;
            case 'toggle-labels':
                _userHideLabels = !_userHideLabels;
                safeSetItem('ecbyts-constellation-hide-labels', _userHideLabels ? '1' : '');
                drawStatic();
                break;
            case 'zoom-in':
                window.handleConstellationZoomIn?.();
                break;
            case 'zoom-out':
                window.handleConstellationZoomOut?.();
                break;
            case 'fit':
                window.handleConstellationFitAll?.();
                break;
            case 'reset':
                resetConstellationView();
                break;
            case 'export-png':
                window.handleExportConstellationPng?.();
                break;
            case 'export-svg':
                window.handleExportConstellationSvg?.();
                break;
        }
        _closeConstellationConfigMenu();
    };
    _configMenuEl.querySelectorAll('.panel-context-menu-item[data-action]').forEach((btn: any) => {
        btn.addEventListener('click', () => onAction(btn.dataset.action));
    });
    // Fecha em outside-click + Escape + scroll (menu position:fixed)
    _configMenuCloseCtrl = installCloseListeners(_configMenuEl, _closeConstellationConfigMenu, { scroll: true });
}
/** NAV-002: Zoom by factor, keeping pivot point (canvas-px) fixed. */
function _applyZoom( factor: any, pivotRawX: any, pivotRawY: any) {
    const newScale = Math.min(Math.max(_viewScale * factor, MIN_ZOOM), MAX_ZOOM);
    if (newScale === _viewScale) return;
    // Keep the pivot point stationary: pivotRaw = viewOffset + graphCoord * scale
    const graphX = (pivotRawX - _viewX) / _viewScale;
    const graphY = (pivotRawY - _viewY) / _viewScale;
    _viewScale = newScale;
    _viewX = pivotRawX - graphX * _viewScale;
    _viewY = pivotRawY - graphY * _viewScale;
    drawStatic();
    _updateZoomIndicator();
}
// ================================================================
// OBSERVATION EDIT CARD (HTML overlay)
// ================================================================
/**
 * Show editable observation card near the clicked dot.
 * Mostra cartao editavel de observacao com campos de formulario.
 */
function showObsEditCard( obsIndex: any, canvasX: any, _canvasY: any) {
    const container = document.getElementById('constellation-obs-edit');
    if (!container) return;
    const element = getSelectedElement();
    if (!element) return;
    const observations = element.data?.observations || [];
    const obs = observations[obsIndex];
    if (!obs) return;
    activeEditIndex = obsIndex;
    hideObsList();
    const parameters = CONFIG.PARAMETERS || [];
    const units = CONFIG.UNITS || [];
    const campaigns = getAllCampaigns();
    const elementId = element.id;
    // Resolve compatible units for selected parameter
    const selectedParam = parameters.find((p: any) => p.id === obs.parameterId);
    const selectedUnit = units.find((u: any) => u.id === (obs.unitId || selectedParam?.defaultUnitId));
    const compatibleUnits = selectedUnit
        ? units.filter((u: any) => u.dimension === selectedUnit.dimension)
        : units;
    // Family color for accent stripe
    const familyColor = FAMILY_COLORS[element.family] || FAMILY_COLORS.default;
    container.innerHTML = `
        <div class="constellation-edit-card" style="--obs-family-color: ${familyColor}">
            <div class="obs-header">
                <span class="obs-title">
                    <span class="obs-badge">#${obsIndex + 1}</span>
                    Observation
                </span>
                <button type="button" class="btn btn-icon" title="Close" aria-label="Close"
                        data-cc-action="cc-97a7bb90">
                    <span data-icon="x" data-icon-size="14px"></span>
                </button>
            </div>
            <div class="obs-section">
                <div class="obs-section-title">
                    <span class="section-icon" data-icon="activity" data-icon-size="12px"></span>
                    Reading
                </div>
                <div class="form-group">
                    <label class="form-label">Parameter</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:constellation:select:L1372" class="form-input"
                            data-cc-call-change="_constellationParamChanged|s:${encodeURIComponent(`${esc(elementId)}`)}|j:${encodeURIComponent(String(obsIndex))}|v">
                        <option value="">-- Select --</option>
                        ${parameters
                            .map(
                                (p: any) => `
                            <option value="${esc(p.id)}" ${p.id === obs.parameterId ? 'selected' : ''}>
                                ${esc(p.name)}
                            </option>
                        `,
                            )
                            .join('')}
                    </select>
                </div>
                <div class="constellation-edit-row">
                    <div class="form-group" style="flex:1;">
                        <label class="form-label">Value</label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:constellation:input:L1389" class="form-input value-input" type="number" step="any"
                               value="${obs.value ?? ''}"
                               data-cc-call-input="handleReadingChange|s:${encodeURIComponent(`${esc(elementId)}`)}|j:${encodeURIComponent(String(obsIndex))}|s:primary|s:value|v|j:false">
                    </div>
                    <div class="form-group" style="flex:0 0 90px;">
                        <label class="form-label">Unit</label>
                        <select data-field-meta="true" data-field-meta-key="auto-pos:constellation:select:L1395" class="form-input unit-select"
                                data-cc-call-change="handleUnitChange|s:${encodeURIComponent(`${esc(elementId)}`)}|j:${encodeURIComponent(String(obsIndex))}|s:primary|v|j:false">
                            ${compatibleUnits
                                .map(
                                    (u: any) => `
                                <option value="${esc(u.id)}" ${u.id === (obs.unitId || selectedUnit?.id) ? 'selected' : ''}>
                                    ${esc(u.symbol || u.name)}
                                </option>
                            `,
                                )
                                .join('')}
                        </select>
                    </div>
                </div>
            </div>
            <div class="obs-section">
                <div class="obs-section-title">
                    <span class="section-icon" data-icon="clock" data-icon-size="12px"></span>
                    Context
                </div>
                <div class="form-group">
                    <label class="form-label">Date</label>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:constellation:input:L1417" class="form-input" type="date"
                           value="${esc(obs.date || '')}"
                           data-cc-call-input="handleObservationChange|s:${encodeURIComponent(`${esc(elementId)}`)}|j:${encodeURIComponent(String(obsIndex))}|s:date|v">
                </div>
                <div class="form-group">
                    <label class="form-label">Campaign</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:constellation:select:L1423" class="form-input"
                            data-cc-call-change="handleObservationChange|s:${encodeURIComponent(`${esc(elementId)}`)}|j:${encodeURIComponent(String(obsIndex))}|s:campaignId|v">
                        <option value="">--</option>
                        ${campaigns
                            .map(
                                (c: any) => `
                            <option value="${esc(c.id)}" ${c.id === obs.campaignId ? 'selected' : ''}>
                                ${esc(c.name)}
                            </option>
                        `,
                            )
                            .join('')}
                    </select>
                </div>
            </div>
            <div class="constellation-edit-footer">
                <button type="button" class="obs-remove-btn"
                        data-cc-call-click="handleRemoveObservationAndCloseEdit|s:${encodeURIComponent(`${esc(elementId)}`)}|j:${encodeURIComponent(String(obsIndex))}">
                    <span class="remove-icon" data-icon="trash" data-icon-size="12px"></span>
                    Remove
                </button>
            </div>
        </div>
    `;
    // Position card above canvas near clicked dot
    const rect = canvas.getBoundingClientRect();
    const pxX = (canvasX / canvasW) * rect.width;
    const cardWidth = 280;
    let left = pxX - cardWidth / 2;
    left = Math.max(8, Math.min(rect.width - cardWidth - 8, left));
    container.style.left = left + 'px';
    const actualCanvasH = canvas.clientHeight || canvasH;
    container.style.bottom = actualCanvasH + 4 + 'px';
    container.style.display = 'block';
    hydrateIcons(container);
    drawStatic();
}
function hideObsEditCard() {
    const container = document.getElementById('constellation-obs-edit');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
    if (activeEditIndex !== null) {
        activeEditIndex = null;
        drawStatic();
    }
}
// ================================================================
// OBSERVATION LIST POPOVER (HTML overlay)
// ================================================================
/**
 * Show scrollable list of all observations.
 * Mostra lista de todas as observacoes com clique para editar.
 */
function showObsList() {
    const container = document.getElementById('constellation-obs-list');
    if (!container) return;
    const element = getSelectedElement();
    if (!element) return;
    const observations = element.data?.observations || [];
    if (observations.length === 0) return;
    activeObsList = true;
    hideObsEditCard();
    container.innerHTML = `
        <div class="constellation-list-card">
            <div class="obs-header">
                <span class="obs-title">${observations.length} Observations</span>
                <button type="button" class="btn btn-icon" title="Close" aria-label="Close"
                        data-cc-action="cc-5fb57144">
                    <span data-icon="x" data-icon-size="14px"></span>
                </button>
            </div>
            <div class="constellation-list-body">
                ${observations
                    .map((obs: any, i: number) => {
                        const paramName = resolveParamName(obs.parameterId);
                        const unitLabel = resolveUnitLabel(obs.unitId);
                        const valueStr = obs.value != null ? `${obs.value} ${unitLabel}` : '--';
                        return `
                        <div class="constellation-list-row"
                             data-cc-call-click="_constellationEditObs|j:${encodeURIComponent(String(i))}">
                            <span class="constellation-list-param">${esc(paramName)}</span>
                            <span class="constellation-list-value">${esc(valueStr)}</span>
                            <span class="constellation-list-date">${esc(obs.date || '--')}</span>
                        </div>
                    `;
                    })
                    .join('')}
            </div>
        </div>
    `;
    hydrateIcons(container);
    container.style.display = 'block';
}
function hideObsList() {
    const container = document.getElementById('constellation-obs-list');
    if (container) {
        container.style.display = 'none';
        container.innerHTML = '';
    }
    activeObsList = false;
}
// ================================================================
// RESOLVE HELPERS
// ================================================================
function resolveParamName( parameterId: any) {
    if (!parameterId) return '\u2014';
    const param = CONFIG.PARAMETERS.find((p: any) => p.id === parameterId);
    return param ? param.name : parameterId;
}
function resolveUnitLabel( unitId: any) {
    if (!unitId) return '';
    const unit = CONFIG.UNITS?.find((u: any) => u.id === unitId);
    return unit ? unit.symbol || unit.name : unitId;
}
// ================================================================
// HELPERS
// ================================================================
function truncate( text: any, maxLen: any) {
    return text.length > maxLen ? text.substring(0, maxLen - 1) + '\u2026' : text;
}
function roundRect(ctx: any, x: any, y: any, w: any, h: any, r: any) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
/**
 * Escape HTML to prevent XSS in dynamic content.
 */
function esc( text: any) {
    if (text == null) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
}
// ----------------------------------------------------------------
// CLEANUP (ECBT05) - Remove event listeners and disconnect observer
// ----------------------------------------------------------------
// REPORT EXPAND BUTTON
// Botao para abrir overlay full-screen do relatorio
// ----------------------------------------------------------------
/** @private */
function _ensureExpandButton( container: any) {
    if (!container || container.querySelector('.report-expand-btn')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'report-expand-btn';
    btn.title = 'Abrir editor full-screen';
    btn.innerHTML = '&#9974;';
    btn.addEventListener('click', (e: any) => {
        e.stopPropagation();
        window.handleOpenReportOverlay?.();
    });
    container.style.position = 'relative';
    container.appendChild(btn);
}
// ----------------------------------------------------------------
/**
 * Save current node positions to Supabase (or localStorage fallback).
 * @param {string} [name] - layout display name
 */
async function _saveLayoutToStorage( name: any = '') {
    try {
        const positions: Record<string, { x: number; y: number }> = {};
        currentNodes.forEach((n: any) => {
            positions[n.id] = { x: n.x, y: n.y };
        });
        const layoutType = getActiveLayoutMode?.() || 'manual';
        const result = await saveConstellationLayout({
            name: name || 'Layout',
            layoutType,
            nodePositions: positions,
            viewState: {},
        });
        if (result.ok) {
            appWindow().showToast?.(t('constellation.layoutSaved') || 'Layout saved', 'success');
        } else {
            appWindow().showToast?.(t('constellation.layoutSaveFailed') || 'Failed to save layout', 'error');
        }
    } catch (err: any) {
        console.debug('[constellation]', errorMessage(err));
    }
}
/**
 * Load a saved layout by ID and apply node positions.
 * @param {string} layoutId
 */
async function _loadLayoutById( layoutId: any) {
    try {
        const result = await getConstellationLayout(layoutId);
        if (!result.ok || !result.layout) {
            appWindow().showToast?.(t('constellation.layoutLoadFailed') || 'Failed to load layout', 'error');
            return;
        }
        _applySavedPositions(result.layout.node_positions);
        appWindow().showToast?.(t('constellation.layoutLoaded') || 'Layout loaded', 'success');
    } catch (err: any) {
        console.debug('[constellation]', errorMessage(err));
    }
}
/**
 * Delete a saved layout by ID.
 * @param {string} layoutId
 */
async function _deleteLayoutById( layoutId: any) {
    try {
        const result = await deleteConstellationLayout(layoutId);
        if (result.ok) {
            appWindow().showToast?.(t('constellation.layoutDeleted') || 'Layout deleted', 'success');
        } else {
            appWindow().showToast?.(t('constellation.layoutDeleteFailed') || 'Failed to delete layout', 'error');
        }
    } catch (err: any) {
        console.debug('[constellation]', errorMessage(err));
    }
}
/**
 * Apply saved positions to current nodes.
 * @param {Object} positions - { [nodeId]: { x, y } }
 */
function _applySavedPositions( positions: any) {
    if (!positions || typeof positions !== 'object') return;
    let changed = false;
    for (const node of currentNodes) {
        const pos = positions[node.id];
        if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
            node.x = pos.x;
            node.y = pos.y;
            changed = true;
        }
    }
    if (changed) {
        drawStatic();
        if (_webglMode && _webglRenderer) {
            _webglRenderer.setLayout(currentNodes, currentLines);
        }
    }
}
/**
 * Export canvas as PNG.
 */
function _exportCanvasPng() {
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `constellation-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}
/**
 * Export current graph as SVG.
 */
function _exportCanvasSvg() {
    const svgString = exportGraphToSvg({
        nodes: currentNodes.map((n: any) => ({
            ...n,
            color: FAMILY_COLORS[n.family] || FAMILY_COLORS.default,
        })),
        edges: currentLines.map((l: any) => ({
            source: l.from,
            target: l.to,
            sourceX: l.from.x,
            sourceY: l.from.y,
            targetX: l.to.x,
            targetY: l.to.y,
        })),
    });
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `constellation-${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
/**
 * Destroy constellation, removing all listeners and observers.
 * Limpa listeners e ResizeObserver para evitar memory leaks.
 */
export function destroyConstellation() {
    if (canvas) {
        canvas.removeEventListener('click', handleCanvasClick, true);
        canvas.removeEventListener('mousedown', handleCanvasMouseDown, true);
        canvas.removeEventListener('mouseup', handleCanvasMouseUp, true);
        canvas.removeEventListener('mousemove', handleCanvasMouseMove);
        canvas.removeEventListener('wheel', handleCanvasWheel);
    }
    if (_resizeObserver) {
        _resizeObserver.disconnect();
        _resizeObserver = null;
    }
    if (_webglRenderer) {
        _webglRenderer.destroy();
        _webglRenderer = null;
    }
    canvas = null;
    ctx = null;
}
// ================================================================
// WEBGL MODE - init + switch
// ================================================================
/**
 * Inicializa o renderizador WebGL no container fornecido.
 * Detecta suporte a WebGL; retorna null se indisponível.
 * @param {HTMLElement} container
 * @returns {ConstellationWebGLRenderer|null}
 */
export function initWebGLRenderer( container: any) {
    if (_webglRenderer) return _webglRenderer;
    if (!container) return null;
    // Feature-detect WebGL
    try {
        const testCanvas = document.createElement('canvas');
        const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
        if (!gl) {
            console.warn('[constellation] WebGL not available — keeping Canvas 2D');
            return null;
        }
    } catch (e: any) {
        console.warn('[constellation] WebGL detection failed:', errorMessage(e));
        return null;
    }
    try {
        _webglRenderer = new ConstellationWebGLRenderer(container, {
            mode: '2d',
            backgroundColor: null,
            onNodeClick: (nodeId: any) => {
                hideObsEditCard();
                hideObsList();
                if (_onSelect) _onSelect(nodeId);
                _dispatchHostedActionsIntegrationEvent('node-selected', { nodeId, renderer: 'webgl' });
            },
            onNodeDoubleClick: (nodeId: any) => {
                if (_openHostedNodeInModel(nodeId)) return;
                if (_webglRenderer) {
                    _webglRenderer.focusNode(nodeId);
                }
            },
        });
        // Esconde por padrão - canvas 2D continua ativo
        _webglRenderer.renderer.domElement.style.display = 'none';
        _logConstellation.info('WebGL renderer initialized');
    } catch (err: any) {
        console.warn('[constellation] WebGL renderer init failed:', errorMessage(err));
        _webglRenderer = null;
    }
    return _webglRenderer;
}
/**
 * Ativa modo WebGL (esconde canvas 2D, mostra WebGL).
 */
export function switchToWebGLMode() {
    if (!_webglRenderer) {
        const container = document.getElementById('constellation-view-graph');
        if (!container || !initWebGLRenderer(container)) {
            console.warn('[constellation] Cannot switch to WebGL — renderer unavailable');
            return;
        }
    }
    const canvas2d = document.getElementById('constellation-canvas');
    if (canvas2d) canvas2d.style.display = 'none';
    if (_webglRenderer) {
        _webglRenderer.renderer.domElement.style.display = 'block';
        _webglRenderer.setLayout(currentNodes, currentLines);
        _webglRenderer.resize(canvasW, canvasH);
    }
    _webglMode = true;
    _logConstellation.debug('switched to WebGL mode');
}
/**
 * Volta para modo Canvas 2D.
 */
export function switchToCanvasMode() {
    const canvas2d = document.getElementById('constellation-canvas');
    if (canvas2d) canvas2d.style.display = 'block';
    if (_webglRenderer) {
        _webglRenderer.renderer.domElement.style.display = 'none';
    }
    _webglMode = false;
    drawStatic();
    _logConstellation.debug('switched to Canvas 2D mode');
}

