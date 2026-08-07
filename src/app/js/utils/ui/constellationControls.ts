// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   CONSTELLATION CONTROLS — Floating/docked controls panel
   SPEC_CONSTELLATION_HUD_9_75 §Q7

   Painel de controle flutuante/ancorado para a visualizacao
   Constellation. Gerencia layout, camadas Z3, modo de visualizacao,
   filtros e acoes.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { RELATION_LAYERS } from '../../core/constellation/graph.js';
import { createLogger } from '../helpers/logger.js';
import { escapeHtml } from '../helpers/html.js';
import {
    buildNodeContextHud,
    createOnboardingState,
    onboardingTransition,
    describeOnboardingStep,
} from '../../core/constellation/nodeContextHud.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
const _log = createLogger('constellation:controls');
// ──────────────────────────────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────────────────────────────
/** @type {HTMLElement | null} */
let _panelEl: any = null;
let _isOpen = false;
let _activeLayout = 'force';
/** @type {Set<string>} */
const _activeLayers: Set<any> = new Set([RELATION_LAYERS.SPATIAL, RELATION_LAYERS.HIERARCHICAL, RELATION_LAYERS.SEMANTIC]);
let _viewMode = '2d';
const _nodeTypeFilters = new Set(['elements', 'campaigns', 'families', 'observations']);
const _statusFilters = new Set(['active', 'inactive', 'alert']);
let _searchQuery = '';
let _impactModeActive = false;
/** @type {any} */
let _impactSummary: any = null;
let _metricSizingEnabled = true;
let _metricSizingMetric = 'violations';
let _callbacks: any = {};
// Onboarding + node-context HUD state (gap closure for SPEC_CONSTELLATION_HUD_9_75)
let _onboardingState = createOnboardingState();
/** @type {any} */
let _lastNodeHud: any = null;
const LAYOUT_MODES = ['force', 'hierarchical', 'spatial', 'circular'];
const LAYER_KEYS = [
    { key: RELATION_LAYERS.SPATIAL, labelKey: 'constellation.layer.spatial' },
    { key: RELATION_LAYERS.HIERARCHICAL, labelKey: 'constellation.layer.hierarchical' },
    { key: RELATION_LAYERS.TEMPORAL, labelKey: 'constellation.layer.temporal' },
    { key: RELATION_LAYERS.SEMANTIC, labelKey: 'constellation.layer.semantic' },
];
const VIEW_MODES = [
    { key: '2d', labelKey: 'constellation.view.2d' },
    { key: '3d', labelKey: 'constellation.view.3d' },
    { key: 'split', labelKey: 'constellation.view.split' },
];
const METRIC_OPTIONS = [
    { key: 'violations', field: 'violationScore', label: 'Violations' },
    { key: 'observation_count', field: 'obsCount', label: 'Observations' },
    { key: 'eis_score', field: 'eisScore', label: 'EIS score' },
    { key: 'connectivity', field: 'degree', label: 'Connections' },
    { key: 'uncertainty_aggregated', field: 'uncertainty', label: 'Uncertainty' },
    { key: 'uniform', field: 'degree', label: 'Uniform' },
];
// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────
/**
 * Initialize controls panel.
 * @param {Record<string, any>} [callbacks]
 */
export function initConstellationControls(callbacks = {}) {
    _callbacks = callbacks;
    _installWindowGlobals();
    _injectSceneHudButton();
    _bindKeyboardShortcut();
}
/**
 * Toggle controls panel open/closed.
 */
export function toggleConstellationControls() {
    if (_isOpen) closeControlsPanel();
    else openControlsPanel();
}
/**
 * Open controls panel.
 */
export function openControlsPanel() {
    if (_isOpen) return;
    _panelEl = _buildPanel();
    document.body.appendChild(_panelEl);
    _isOpen = true;
    syncDeepLinkUrl('constellation-controls');
    _renderImpactControlState();
    _updateHudButtonState();
}
/**
 * Close controls panel.
 */
export function closeControlsPanel() {
    if (!_panelEl) return;
    _panelEl.remove();
    _panelEl = null;
    _isOpen = false;
    clearDeepLinkUrl();
    _updateHudButtonState();
}
/**
 * Synchronize the visible Impact control from scene-level callers.
 * @param {boolean} active
 * @param {Object|null} [summary]
 */
export function setImpactControlActive(active: any, summary: any = null) {
    _impactModeActive = active === true;
    _impactSummary = summary || null;
    _renderImpactControlState();
}
/**
 * Synchronize metric sizing controls from scene-level callers.
 * @param {{enabled?: boolean, metric?: string}} [state]
 */
export function setMetricSizingControlState(state: any = {}) {
    if (typeof state.enabled === 'boolean') _metricSizingEnabled = state.enabled;
    if (state.metric && METRIC_OPTIONS.some((option: any) => option.key === state.metric)) {
        _metricSizingMetric = state.metric;
    }
    _renderMetricSizingControlState();
}
/**
 * Check if controls panel is open.
 * @returns {boolean}
 */
export function isControlsPanelOpen() {
    return _isOpen;
}
/**
 * Get current layout mode.
 * @returns {string}
 */
export function getActiveLayoutMode() {
    return _activeLayout;
}
/**
 * Get active Z3 layers.
 * @returns {Set<string>}
 */
export function getActiveLayers() {
    return new Set(_activeLayers);
}
/**
 * Get current view mode.
 * @returns {string}
 */
export function getViewMode() {
    return _viewMode;
}
/**
 * Get current node type filters.
 * @returns {Set<string>}
 */
export function getNodeTypeFilters() {
    return new Set(_nodeTypeFilters);
}
/**
 * Get current status filters.
 * @returns {Set<string>}
 */
export function getStatusFilters() {
    return new Set(_statusFilters);
}
/**
 * Get current search query.
 * @returns {string}
 */
export function getSearchQuery() {
    return _searchQuery;
}
export function getMetricSizingState() {
    const option = METRIC_OPTIONS.find((item: any) => item.key === _metricSizingMetric) || METRIC_OPTIONS[0];
    return {
        enabled: _metricSizingEnabled && option!.key !== "uniform",
        metric: option!.key,
        metricField: option!.field,
        label: option!.label,
    };
}
/**
 * Apply layer filter to edges.
 * @param {Array<any>} edges
 * @param {string[]} activeLayers
 * @returns {Array<any>}
 */
export function applyLayerFilter(edges: any, activeLayers: any) {
    if (!Array.isArray(edges)) return [];
    if (!activeLayers || activeLayers.length === 0) return [];
    const set = new Set(activeLayers);
    return edges.filter((e: any) => set.has(e.layer));
}
/**
 * Switch layout mode programmatically.
 * @param {string} mode
 */
export function switchLayoutMode(mode: any) {
    if (!LAYOUT_MODES.includes(mode)) return;
    _activeLayout = mode;
    _panelEl?.querySelectorAll('[data-layout]').forEach((btn: any) => {
        btn.classList.toggle('active', btn.dataset?.layout === mode);
    });
    if (_callbacks.onLayoutChange) _callbacks.onLayoutChange(mode);
}
/**
 * Export current graph to SVG string.
 * @param {any} graph
 * @returns {string}
 */
export function exportGraphToSvg(graph: any) {
    if (!graph || !graph.nodes) return '<svg></svg>';
    const nodes = Array.from(graph.nodes.values?.() || graph.nodes || []);
    const edges = graph.edges || [];
    const width = 800;
    const height = 600;
    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    svg += `  <rect width="100%" height="100%" fill="transparent"/>\n`;
    // Edges
    edges.forEach((e: any) => {
        const sx = e.sourceX ?? 100;
        const sy = e.sourceY ?? 100;
        const tx = e.targetX ?? 200;
        const ty = e.targetY ?? 200;
        svg += `  <line x1="${sx}" y1="${sy}" x2="${tx}" y2="${ty}" stroke="#90A4AE" stroke-width="1" opacity="0.6"/>\n`;
    });
    // Nodes
    nodes.forEach((n: any, i: any) => {
        const x = n.x ?? 100 + (i % 10) * 60;
        const y = n.y ?? 100 + Math.floor(i / 10) * 60;
        const r = n.radius ?? 8;
        const color = n.color ?? '#4FC3F7';
        svg += `  <circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>\n`;
        if (n.name) {
            svg += `  <text x="${x}" y="${y + r + 12}" text-anchor="middle" font-size="10" fill="#E0E0E0">${escapeXml(n.name)}</text>\n`;
        }
    });
    svg += `</svg>`;
    return svg;
}
/**
 * Calculate graph summary stats.
 * @param {any} graph
 * @returns {{ nodes: number, edges: number, clusters: number }}
 */
export function calculateGraphSummary(graph: any) {
    if (!graph) return { nodes: 0, edges: 0, clusters: 0 };
    const nodeCount =
        graph.stats?.nodeCount ?? graph.nodes?.size ?? (Array.isArray(graph.nodes) ? graph.nodes.length : 0);
    const edgeCount = graph.stats?.edgeCount ?? (Array.isArray(graph.edges) ? graph.edges.length : 0);
    // Simple cluster estimate: connected components would need full algorithm;
    // here we use a heuristic based on nodes without edges as isolated clusters
    let clusters: number;
    if (graph.edges && Array.isArray(graph.edges)) {
        /** @type {Set<any>} */
        const connected = new Set();
        graph.edges.forEach((e: any) => {
            if (e.source) connected.add(e.source);
            if (e.target) connected.add(e.target);
        });
        const isolated = Math.max(0, nodeCount - connected.size);
        clusters = isolated + Math.max(1, Math.ceil(connected.size / 5));
    } else {
        clusters = nodeCount;
    }
    return { nodes: nodeCount, edges: edgeCount, clusters };
}
// ──────────────────────────────────────────────────────────────────────
// DOM builders
// ──────────────────────────────────────────────────────────────────────
function _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'cc-panel';
    panel.id = 'constellation-controls-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('constellation.title') || 'Constellation');
    // Header
    const header = document.createElement('div');
    header.className = 'cc-header';
    header.innerHTML = `
        <span class="cc-header-title">${t('constellation.title') || 'Constellation'}</span>
        <button type="button" class="cc-close-btn" aria-label="Fechar">×</button>
    `;
    header.querySelector('.cc-close-btn')?.addEventListener('click', closeControlsPanel);
    panel.appendChild(header);
    // Sections
    panel.appendChild(_buildLayoutSection());
    panel.appendChild(_buildLayerSection());
    panel.appendChild(_buildViewModeSection());
    panel.appendChild(_buildFilterSection());
    panel.appendChild(_buildMetricSizingSection());
    panel.appendChild(_buildImpactSection());
    panel.appendChild(_buildNodeContextSection());
    panel.appendChild(_buildOnboardingSection());
    panel.appendChild(_buildActionSection());
    panel.appendChild(_buildSavedLayoutsSection());
    panel.appendChild(_buildIASection());
    // Close on Escape / click outside
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeControlsPanel();
    });
    const outsideHandler = (e: any) => {
        const target = e.target;
        if (_panelEl && !_panelEl.contains(target) && !target?.closest?.('#cc-hud-toggle-btn')) {
            closeControlsPanel();
            document.removeEventListener('mousedown', outsideHandler);
        }
    };
    requestAnimationFrame(() => document.addEventListener('mousedown', outsideHandler));
    return panel;
}
function _buildLayoutSection() {
    const section = document.createElement('div');
    section.className = 'cc-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'Layout';
    section.appendChild(label);
    const group = document.createElement('div');
    group.className = 'cc-btn-group';
    LAYOUT_MODES.forEach((mode: any) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cc-btn' + (mode === _activeLayout ? ' active' : '');
        btn.dataset.layout = mode;
        btn.textContent = t(`constellation.layout.${mode}`) || mode;
        btn.addEventListener('click', () => {
            switchLayoutMode(mode);
        });
        group.appendChild(btn);
    });
    section.appendChild(group);
    const regen = document.createElement('button');
    regen.type = 'button';
    regen.className = 'cc-btn cc-btn--secondary';
    regen.textContent = 'Regenerate';
    regen.addEventListener('click', () => {
        if (_callbacks.onLayoutChange) _callbacks.onLayoutChange(_activeLayout);
    });
    section.appendChild(regen);
    return section;
}
function _buildLayerSection() {
    const section = document.createElement('div');
    section.className = 'cc-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'Z3 Layers';
    section.appendChild(label);
    LAYER_KEYS.forEach(({ key, labelKey }) => {
        const row = document.createElement('label');
        row.className = 'cc-toggle-row';
        const checked = _activeLayers.has(key) ? 'checked' : '';
        row.innerHTML = `
            <input data-field-meta="true" data-field-meta-key="auto-pos:constellationControls:input:L346" type="checkbox" class="cc-checkbox" data-layer="${key}" ${checked}>
            <span class="cc-toggle-label">${t(labelKey) || key}</span>
        `;
        row.querySelector('input')?.addEventListener('change', (e) => {
            if ((e?.target as any)?.checked) _activeLayers.add(key);
            else _activeLayers.delete(key);
            if (_callbacks.onLayerChange) _callbacks.onLayerChange(Array.from(_activeLayers));
        });
        section.appendChild(row);
    });
    return section;
}
function _buildViewModeSection() {
    const section = document.createElement('div');
    section.className = 'cc-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'View Mode';
    section.appendChild(label);
    const group = document.createElement('div');
    group.className = 'cc-btn-group';
    VIEW_MODES.forEach(({ key, labelKey }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cc-btn' + (key === _viewMode ? ' active' : '');
        btn.dataset.view = key;
        btn.textContent = t(labelKey) || key;
        btn.addEventListener('click', () => {
            _viewMode = key;
            group.querySelectorAll('.cc-btn').forEach((b: any) => b.classList.toggle('active', b.dataset?.view === key));
            if (_callbacks.onViewModeChange) _callbacks.onViewModeChange(key);
        });
        group.appendChild(btn);
    });
    section.appendChild(group);
    return section;
}
function _buildFilterSection() {
    const section = document.createElement('div');
    section.className = 'cc-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'Filters';
    section.appendChild(label);
    // Node type
    const typeLabel = document.createElement('div');
    typeLabel.className = 'cc-sub-label';
    typeLabel.textContent = 'By type';
    section.appendChild(typeLabel);
    const types = ['elements', 'campaigns', 'families', 'observations'];
    types.forEach((type: any) => {
        const row = document.createElement('label');
        row.className = 'cc-toggle-row';
        const checked = _nodeTypeFilters.has(type) ? 'checked' : '';
        row.innerHTML = `
            <input data-field-meta="true" data-field-meta-key="auto-pos:constellationControls:input:L408" type="checkbox" class="cc-checkbox" data-node-type="${type}" ${checked}>
            <span class="cc-toggle-label">${type[0].toUpperCase() + type.slice(1)}</span>
        `;
        row.querySelector('input')?.addEventListener('change', (e) => {
            if ((e?.target as any)?.checked) _nodeTypeFilters.add(type);
            else _nodeTypeFilters.delete(type);
            if (_callbacks.onFilterChange)
                _callbacks.onFilterChange({
                    nodeTypes: Array.from(_nodeTypeFilters),
                    statuses: Array.from(_statusFilters),
                });
        });
        section.appendChild(row);
    });
    // Status
    const statusLabel = document.createElement('div');
    statusLabel.className = 'cc-sub-label';
    statusLabel.textContent = 'By status';
    section.appendChild(statusLabel);
    const statuses = ['active', 'inactive', 'alert'];
    statuses.forEach((status: any) => {
        const row = document.createElement('label');
        row.className = 'cc-toggle-row';
        const checked = _statusFilters.has(status) ? 'checked' : '';
        row.innerHTML = `
            <input data-field-meta="true" data-field-meta-key="auto-pos:constellationControls:input:L435" type="checkbox" class="cc-checkbox" data-status="${status}" ${checked}>
            <span class="cc-toggle-label">${status[0].toUpperCase() + status.slice(1)}</span>
        `;
        row.querySelector('input')?.addEventListener('change', (e) => {
            if ((e?.target as any)?.checked) _statusFilters.add(status);
            else _statusFilters.delete(status);
            if (_callbacks.onFilterChange)
                _callbacks.onFilterChange({
                    nodeTypes: Array.from(_nodeTypeFilters),
                    statuses: Array.from(_statusFilters),
                });
        });
        section.appendChild(row);
    });
    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'cc-search-wrap';
    const search = document.createElement('input');
    search.type = 'text';
    search.className = 'cc-search';
    search.placeholder = 'Search nodes...';
    search.value = _searchQuery;
    search.addEventListener('input', (e) => {
        _searchQuery = (e?.target as any)?.value || '';
        if (_callbacks.onSearch) _callbacks.onSearch(_searchQuery);
    });
    searchWrap.appendChild(search);
    section.appendChild(searchWrap);
    return section;
}
function _buildMetricSizingSection() {
    const section = document.createElement('div');
    section.className = 'cc-section cc-metric-sizing-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'Metric sizing';
    section.appendChild(label);
    const row = document.createElement('label');
    row.className = 'cc-toggle-row';
    row.innerHTML = `
        <input data-field-meta="true" data-field-meta-key="auto-pos:constellationControls:metricSizingEnabled" type="checkbox" class="cc-checkbox" id="cc-metric-sizing-enabled" ${_metricSizingEnabled ? 'checked' : ''}>
        <span class="cc-toggle-label">Scale node size</span>
    `;
    row.querySelector('input')?.addEventListener('change', (e) => {
        _metricSizingEnabled = !!(e?.target as any)?.checked;
        _emitMetricSizingChange();
    });
    section.appendChild(row);
    const select = document.createElement('select');
    select.id = 'cc-metric-sizing-select';
    select.className = 'cc-select';
    select.setAttribute('aria-label', 'Constellation node sizing metric');
    METRIC_OPTIONS.forEach((option: any) => {
        const opt = document.createElement('option');
        opt.value = option.key;
        opt.textContent = option.label;
        opt.selected = option.key === _metricSizingMetric;
        select.appendChild(opt);
    });
    select.addEventListener('change', (e) => {
        _metricSizingMetric = (e?.target as any)?.value || _metricSizingMetric;
        if (_metricSizingMetric === 'uniform') _metricSizingEnabled = false;
        else _metricSizingEnabled = true;
        _emitMetricSizingChange();
    });
    section.appendChild(select);
    const legend = document.createElement('div');
    legend.id = 'cc-metric-sizing-legend';
    legend.className = 'cc-metric-sizing-legend';
    section.appendChild(legend);
    requestAnimationFrame(_renderMetricSizingControlState);
    return section;
}
function _emitMetricSizingChange() {
    const state = getMetricSizingState();
    _renderMetricSizingControlState();
    if (_callbacks.onMetricSizingChange) _callbacks.onMetricSizingChange(state);
    else if (_callbacks.onAction) _callbacks.onAction('metricSizing', state);
}
function _buildImpactSection() {
    const section = document.createElement('div');
    section.className = 'cc-section cc-impact-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'Impact';
    section.appendChild(label);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cc-impact-toggle-btn';
    btn.className = 'cc-btn cc-btn--secondary cc-btn--block';
    btn.dataset.action = 'impact';
    btn.dataset.active = _impactModeActive ? 'true' : 'false';
    btn.setAttribute('aria-pressed', _impactModeActive ? 'true' : 'false');
    btn.textContent = t('constellation.action.impact') || 'Impact mode';
    btn.addEventListener('click', () => _handleImpactToggle());
    section.appendChild(btn);
    const status = document.createElement('div');
    status.id = 'cc-impact-status';
    status.className = 'cc-impact-status';
    status.dataset.state = _impactModeActive ? 'active' : 'inactive';
    status.textContent = _impactModeActive ? 'Select a node first' : 'Off';
    section.appendChild(status);
    return section;
}
function _handleImpactToggle() {
    const nextActive = !_impactModeActive;
    setImpactControlActive(nextActive, null);
    /** @type {any} */
    let result: any;
    try {
        result = _callbacks.onAction?.('impact', { active: nextActive }) || null;
    } catch (err: any) {
        _log.warn('impact toggle failed', err?.message || err);
        setImpactControlActive(!nextActive, _impactSummary);
        return;
    }
    if (result && typeof result.then === 'function') {
        result
            .then((summary: any) => setImpactControlActive(nextActive, summary || null))
            .catch((err: any) => {
                _log.warn('impact toggle failed', err?.message || err);
                setImpactControlActive(!nextActive, _impactSummary);
            });
        return;
    }
    setImpactControlActive(nextActive, result || null);
}
// ──────────────────────────────────────────────────────────────────────
// Node-context HUD overlay + onboarding (gap closure)
// ──────────────────────────────────────────────────────────────────────
/**
 * Section: contextual node-anchored health/uncertainty readout.
 * Populated by scene/selection callers via setConstellationNodeContext().
 * @returns {HTMLElement}
 */
function _buildNodeContextSection() {
    const section = document.createElement('div');
    section.className = 'cc-section cc-node-context';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = t('constellation.hud.contextTitle') || 'Node context';
    section.appendChild(label);
    const body = document.createElement('div');
    body.id = 'cc-node-context-body';
    body.setAttribute('role', 'status');
    body.setAttribute('aria-live', 'polite');
    section.appendChild(body);
    requestAnimationFrame(() => _renderNodeContext());
    return section;
}
/** Render the last node-context HUD payload into the panel. */
function _renderNodeContext() {
    const body = document.getElementById('cc-node-context-body');
    if (!body) return;
    if (!_lastNodeHud) {
        body.textContent = t('constellation.hud.contextEmpty') || 'Select a node to see health and data quality.';
        body.dataset.state = 'empty';
        return;
    }
    const h = _lastNodeHud;
    const rows = (h.lines || [])
        .map((ln: any) =>
                `<div class="cc-node-ctx-line" data-sev="${escapeHtml(ln.severity)}">` +
                `<span class="cc-node-ctx-kind">${escapeHtml(t(ln.textKey) || ln.kind)}</span>` +
                `<span class="cc-node-ctx-raw">${escapeHtml(ln.raw)}</span></div>`,
        )
        .join('');
    body.dataset.state = h.hasAlert ? 'alert' : 'ok';
    body.innerHTML =
        `<div class="cc-node-ctx-head"><span class="cc-node-ctx-anchor" ` +
        `style="background:${escapeHtml(h.anchorColor)}"></span>` +
        `<strong>${escapeHtml(h.label)}</strong></div>` +
        (rows || `<div class="cc-node-ctx-line">${escapeHtml(t('constellation.hud.noSignals') || 'No signals')}</div>`);
}
/**
 * Public: feed a selected node + its health/uncertainty context.
 * @param {any} node
 * @param {any} [context]
 */
export function setConstellationNodeContext(node: any, context: any = {}) {
    _lastNodeHud = buildNodeContextHud(node, context);
    if (_isOpen) _renderNodeContext();
    return _lastNodeHud;
}
/**
 * Section: guided 3-step onboarding tour over the Constellation HUD.
 * @returns {HTMLElement}
 */
function _buildOnboardingSection() {
    const section = document.createElement('div');
    section.className = 'cc-section cc-onboarding';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = t('constellation.tour.title') || 'Guided tour';
    section.appendChild(label);
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.id = 'cc-tour-start';
    startBtn.className = 'cc-btn cc-btn--secondary cc-btn--block';
    startBtn.textContent = t('constellation.tour.start') || 'Start guided tour';
    startBtn.addEventListener('click', () => {
        _onboardingState = onboardingTransition(createOnboardingState(), 'restart');
        _renderOnboarding();
    });
    section.appendChild(startBtn);
    const box = document.createElement('div');
    box.id = 'cc-tour-box';
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', t('constellation.tour.title') || 'Guided tour');
    section.appendChild(box);
    requestAnimationFrame(() => _renderOnboarding());
    return section;
}
/** Render the current onboarding step (or hide when done/dismissed). */
function _renderOnboarding() {
    const box = document.getElementById('cc-tour-box');
    if (!box) return;
    const step = describeOnboardingStep(_onboardingState);
    if (!step.visible) {
        box.innerHTML = '';
        box.hidden = true;
        return;
    }
    box.hidden = false;
    const title = t(step.titleKey) || step.stepId;
    const bodyTxt = t(step.bodyKey) || '';
    box.innerHTML =
        `<div class="cc-tour-progress">${step.index + 1}/${step.total}</div>` +
        `<div class="cc-tour-step-title">${escapeHtml(title)}</div>` +
        `<div class="cc-tour-step-body">${escapeHtml(bodyTxt)}</div>` +
        `<div class="cc-tour-nav">` +
        `<button type="button" class="cc-btn cc-btn--secondary" data-tour="prev"${step.isFirst ? ' disabled' : ''}>` +
        `${escapeHtml(t('constellation.tour.prev') || 'Back')}</button>` +
        `<button type="button" class="cc-btn cc-btn--secondary" data-tour="dismiss">` +
        `${escapeHtml(t('constellation.tour.skip') || 'Skip')}</button>` +
        `<button type="button" class="cc-btn" data-tour="next">` +
        `${escapeHtml(step.isLast ? t('constellation.tour.done') || 'Done' : t('constellation.tour.next') || 'Next')}` +
        `</button></div>`;
    box.querySelectorAll('[data-tour]').forEach((btn: any) => {
        btn.addEventListener('click', () => {
            const action = btn.dataset.tour;
            _onboardingState = onboardingTransition(_onboardingState, action);
            _renderOnboarding();
        });
    });
}
function _buildActionSection() {
    const section = document.createElement('div');
    section.className = 'cc-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'Actions';
    section.appendChild(label);
    const actions = [
        { key: 'saveLayout', labelKey: 'constellation.action.saveLayout', icon: 'save' },
        { key: 'exportPng', labelKey: 'constellation.action.exportPng', icon: 'image' },
        { key: 'exportSvg', labelKey: 'constellation.action.exportSvg', icon: 'code' },
        { key: 'fullscreen', labelKey: 'constellation.action.fullscreen', icon: 'maximize' },
    ];
    actions.forEach(({ key, labelKey }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cc-btn cc-btn--secondary cc-btn--block';
        btn.textContent = t(labelKey) || key;
        btn.addEventListener('click', () => {
            if (_callbacks.onAction) _callbacks.onAction(key);
            if (key === 'fullscreen') _toggleFullscreen();
        });
        section.appendChild(btn);
    });
    return section;
}
function _buildSavedLayoutsSection() {
    const section = document.createElement('div');
    section.className = 'cc-section cc-saved-layouts';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = t('constellation.savedLayouts') || 'Saved Layouts';
    section.appendChild(label);
    // Save new layout row
    const saveRow = document.createElement('div');
    saveRow.className = 'cc-save-row';
    saveRow.style.display = 'flex';
    saveRow.style.gap = '6px';
    saveRow.style.marginBottom = '8px';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'cc-search';
    nameInput.placeholder = t('constellation.layoutNamePlaceholder') || 'Layout name';
    nameInput.style.flex = '1';
    saveRow.appendChild(nameInput);
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'cc-btn cc-btn--secondary';
    saveBtn.textContent = t('constellation.action.saveLayout') || 'Save';
    saveBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        if (!name) return;
        if (_callbacks.onSaveLayout) {
            await _callbacks.onSaveLayout(name);
            nameInput.value = '';
            _refreshSavedLayoutsList(listContainer);
        }
    });
    saveRow.appendChild(saveBtn);
    section.appendChild(saveRow);
    // List container
    const listContainer = document.createElement('div');
    listContainer.className = 'cc-saved-layouts-list';
    section.appendChild(listContainer);
    // Initial population
    _refreshSavedLayoutsList(listContainer);
    return section;
}
/** @param {any} container */
async function _refreshSavedLayoutsList(container: any) {
    container.innerHTML = '';
    let layouts = [];
    try {
        layouts = (await _callbacks.onListLayouts?.()) || [];
    } catch (err: any) {
        console.debug('[constellation:controls]', err?.message || err);
    }
    if (layouts.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'cc-saved-layouts-empty';
        empty.textContent = t('constellation.noSavedLayouts') || 'No saved layouts';
        container.appendChild(empty);
        return;
    }
    layouts.forEach((layout: any) => {
        const row = document.createElement('div');
        row.className = 'cc-saved-layout-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.justifyContent = 'space-between';
        row.style.gap = '6px';
        row.style.padding = '4px 0';
        row.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
        const name = document.createElement('span');
        name.style.flex = '1';
        name.style.fontSize = '12px';
        name.style.overflow = 'hidden';
        name.style.textOverflow = 'ellipsis';
        name.style.whiteSpace = 'nowrap';
        name.textContent = layout.name || 'Untitled';
        row.appendChild(name);
        const loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.className = 'cc-btn cc-btn--xs';
        loadBtn.textContent = t('constellation.action.load') || 'Load';
        loadBtn.addEventListener('click', () => {
            if (_callbacks.onLoadLayout) _callbacks.onLoadLayout(layout.id);
        });
        row.appendChild(loadBtn);
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'cc-btn cc-btn--xs cc-btn--danger';
        delBtn.textContent = '×';
        delBtn.title = t('constellation.action.delete') || 'Delete';
        delBtn.addEventListener('click', async () => {
            if (_callbacks.onDeleteLayout) {
                await _callbacks.onDeleteLayout(layout.id);
                _refreshSavedLayoutsList(container);
            }
        });
        row.appendChild(delBtn);
        container.appendChild(row);
    });
}
function _buildIASection() {
    const section = document.createElement('div');
    section.className = 'cc-section';
    const label = document.createElement('div');
    label.className = 'cc-section-label';
    label.textContent = 'IA';
    section.appendChild(label);
    const suggest = document.createElement('button');
    suggest.type = 'button';
    suggest.className = 'cc-btn cc-btn--secondary cc-btn--block';
    suggest.disabled = true;
    suggest.textContent = t('constellation.ia.suggest') || 'Sugerir conexoes';
    section.appendChild(suggest);
    const detect = document.createElement('button');
    detect.type = 'button';
    detect.className = 'cc-btn cc-btn--secondary cc-btn--block';
    detect.disabled = true;
    detect.textContent = t('constellation.ia.detect') || 'Detectar anomalias';
    section.appendChild(detect);
    return section;
}
// ──────────────────────────────────────────────────────────────────────
// HUD button injection
// ──────────────────────────────────────────────────────────────────────
function _injectSceneHudButton() {
    const sceneHud = document.getElementById('scene-hud');
    const existing = document.getElementById('cc-hud-toggle-btn');
    if (existing) {
        _wireHudToggleButton(existing);
        _updateHudButtonState();
        return;
    }
    if (!sceneHud) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'cc-hud-toggle-btn';
    btn.className = 'scene-hud-btn';
    btn.title = t('constellation.toggle') || 'Constellation';
    btn.innerHTML = `<span class="icon" data-icon="share" data-icon-size="14px"></span>`;
    _wireHudToggleButton(btn);
    const row = sceneHud.querySelector('.scene-hud-row.scene-hud-body');
    if (row) row.appendChild(btn);
}
/** @param {any} btn */
function _wireHudToggleButton(btn: any) {
    if (!btn || btn.dataset.ccWired === 'true') return;
    btn.dataset.ccWired = 'true';
    btn.setAttribute('aria-pressed', _isOpen ? 'true' : 'false');
    btn.addEventListener("click", (event: any) => {
        event.preventDefault();
        event.stopPropagation();
        toggleConstellationControls();
    });
}
function _updateHudButtonState() {
    const btn = document.getElementById('cc-hud-toggle-btn');
    if (btn) {
        btn.classList.toggle('active', _isOpen);
        btn.setAttribute('aria-pressed', _isOpen ? 'true' : 'false');
    }
}
function _renderImpactControlState() {
    const btn = document.getElementById('cc-impact-toggle-btn');
    const status = document.getElementById('cc-impact-status');
    if (btn) {
        btn.classList.toggle('active', _impactModeActive);
        btn.dataset.active = _impactModeActive ? 'true' : 'false';
        btn.setAttribute('aria-pressed', _impactModeActive ? 'true' : 'false');
    }
    if (!status) return;
    status.dataset.state = _impactModeActive ? 'active' : 'inactive';
    if (!_impactModeActive) {
        status.textContent = 'Off';
        return;
    }
    if (!_impactSummary?.source) {
        status.textContent = 'Select a node first';
        return;
    }
    const critical = _impactSummary.criticalTarget ? `, critical ${_impactSummary.criticalTarget}` : '';
    status.textContent = `${_impactSummary.affected} affected, ${_impactSummary.direct} direct${critical}`;
}
function _renderMetricSizingControlState() {
    const enabled = document.getElementById('cc-metric-sizing-enabled');
    const select = document.getElementById('cc-metric-sizing-select');
    const legend = document.getElementById('cc-metric-sizing-legend');
    const state = getMetricSizingState();
    if (enabled) (enabled as any).checked = state.enabled;
    if (select) (select as any).value = _metricSizingMetric;
    if (!legend) return;
    legend.dataset.state = state.enabled ? 'active' : 'inactive';
    if (!state.enabled) {
        legend.textContent = 'Uniform node radius';
        return;
    }
    legend.innerHTML = `
        <span class="cc-metric-dot cc-metric-dot--small"></span>
        <span>low</span>
        <span class="cc-metric-dot cc-metric-dot--mid"></span>
        <span>median</span>
        <span class="cc-metric-dot cc-metric-dot--large"></span>
        <span>${state.label}</span>
    `;
}
function _installWindowGlobals() {
    if (typeof window === 'undefined') return;
    window.toggleConstellationControls = toggleConstellationControls;
    window.openConstellationControls = openControlsPanel;
    window.closeConstellationControls = closeControlsPanel;
    window.setConstellationMetricSizingControlState = setMetricSizingControlState;
    window.setConstellationNodeContext = setConstellationNodeContext;
    window.startConstellationTour = () => {
        _onboardingState = onboardingTransition(createOnboardingState(), 'restart');
        if (!_isOpen) openControlsPanel();
        else _renderOnboarding();
    };
}
// ──────────────────────────────────────────────────────────────────────
// Keyboard shortcut
// ──────────────────────────────────────────────────────────────────────
function _bindKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
        // Press 'C' to toggle Constellation controls (avoid inputs)
        if (e.key === 'c' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            const target = e.target;
            if (target && ((target as any).tagName === 'INPUT' || (target as any).tagName === "TEXTAREA" || (target as any).isContentEditable)) {
                return;
            }
            e.preventDefault();
            toggleConstellationControls();
        }
    });
}
// ──────────────────────────────────────────────────────────────────────
// Fullscreen helper
// ──────────────────────────────────────────────────────────────────────
function _toggleFullscreen() {
    const hud = document.getElementById('constellation-hud');
    if (!hud) return;
    if (!document.fullscreenElement) {
        hud.requestFullscreen?.().catch((e) => console.debug('[constellation:controls]', e?.message || e));
    } else {
        document.exitFullscreen?.().catch((e) => console.debug('[constellation:controls]', e?.message || e));
    }
}
// ──────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────
/** @param {any} str */
function escapeXml(str: any) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
