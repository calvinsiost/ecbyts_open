// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   CONSTELLATION INFO PANEL — Side panel for node/edge details
   SPEC_CONSTELLATION_HUD_9_75 §Q8

   Painel lateral mostrando detalhes do no selecionado, aresta
   selecionada, ou resumo do grafo quando nada esta selecionado.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { calculateGraphSummary } from './constellationControls.js';
import { createLogger } from '../helpers/logger.js';
const _log = createLogger('constellation:info');
// ──────────────────────────────────────────────────────────────────────
// Module state
// ──────────────────────────────────────────────────────────────────────
let _panelEl: any = null;
let _isOpen = false;
let _selectedNodes: any[] = [];
let _selectedEdge: any = null;
let _graphRef: any = null;
let _callbacks: any = {};
// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────
/**
 * Initialize info panel.
 * @param {object} [callbacks]
 * @param {Function} [callbacks.onViewIn3D]
 * @param {Function} [callbacks.onOpenInspector]
 * @param {Function} [callbacks.onFocus]
 * @param {Function} [callbacks.onViewEvidence]
 */
export function initConstellationInfoPanel(callbacks = {}) {
    _callbacks = callbacks;
}
/**
 * Show info panel.
 */
export function showInfoPanel() {
    if (_isOpen) {
        _render();
        return;
    }
    _panelEl = _buildPanel();
    const hud = document.getElementById('constellation-hud');
    if (hud) hud.appendChild(_panelEl);
    else document.body.appendChild(_panelEl);
    _isOpen = true;
    _render();
}
/**
 * Hide info panel.
 */
export function hideInfoPanel() {
    if (!_panelEl) return;
    _panelEl.remove();
    _panelEl = null;
    _isOpen = false;
}
/**
 * Toggle info panel.
 */
export function toggleInfoPanel() {
    if (_isOpen) hideInfoPanel();
    else showInfoPanel();
}
/**
 * Set selected nodes and refresh panel.
 * @param {any[]} nodes
 */
export function setSelectedNodes(nodes: any) {
    _selectedNodes = Array.isArray(nodes) ? nodes : [];
    _selectedEdge = null;
    if (_isOpen) _render();
}
/**
 * Set selected edge and refresh panel.
 * @param {any} edge
 */
export function setSelectedEdge(edge: any) {
    _selectedEdge = edge;
    _selectedNodes = [];
    if (_isOpen) _render();
}
/**
 * Set graph reference for summary view.
 * @param {any} graph
 */
export function setGraphRef(graph: any) {
    _graphRef = graph;
    if (_isOpen && !_selectedNodes.length && !_selectedEdge) _render();
}
/**
 * Check if panel is open.
 * @returns {boolean}
 */
export function isInfoPanelOpen() {
    return _isOpen;
}
// ──────────────────────────────────────────────────────────────────────
// DOM builders
// ──────────────────────────────────────────────────────────────────────
function _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'ci-panel';
    panel.id = 'constellation-info-panel';
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'Info');
    const header = document.createElement('div');
    header.className = 'ci-header';
    header.innerHTML = `
        <span class="ci-header-title">Info</span>
        <button type="button" class="ci-close-btn" aria-label="Fechar">×</button>
    `;
    (header.querySelector(".ci-close-btn") as any).addEventListener('click', hideInfoPanel);
    panel.appendChild(header);
    const body = document.createElement('div');
    body.className = 'ci-body';
    body.id = 'ci-body';
    panel.appendChild(body);
    return panel;
}
function _render() {
    const body = _panelEl?.querySelector('#ci-body');
    if (!body) return;
    body.innerHTML = '';
    if (_selectedEdge) {
        body.appendChild(_renderEdgeDetail(_selectedEdge));
    } else if (_selectedNodes.length === 1) {
        body.appendChild(_renderNodeDetail(_selectedNodes[0]));
    } else if (_selectedNodes.length > 1) {
        body.appendChild(_renderMultiNodeDetail(_selectedNodes));
    } else {
        body.appendChild(_renderGraphSummary());
    }
}
/**
 * @param {any} node
 */
function _renderNodeDetail(node: any) {
    const wrap = document.createElement('div');
    wrap.className = 'ci-detail';
    const type = node.type || node.family || '—';
    const status = node.status || 'active';
    const metrics = node.metrics || {};
    const connections = node.connections ?? node.degree ?? 0;
    wrap.innerHTML = `
        <div class="ci-row"><span class="ci-label">Name</span><span class="ci-value">${esc(node.name || node.id)}</span></div>
        <div class="ci-row"><span class="ci-label">Type</span><span class="ci-value">${esc(type)}</span></div>
        <div class="ci-row"><span class="ci-label">Status</span><span class="ci-value ci-status ci-status--${status}">${esc(status)}</span></div>
        <div class="ci-row"><span class="ci-label">Connections</span><span class="ci-value">${connections}</span></div>
        ${Object.entries(metrics)
            .map(
                ([k, v]) =>
                    `<div class="ci-row"><span class="ci-label">${esc(k)}</span><span class="ci-value">${esc(v)}</span></div>`,
            )
            .join('')}
    `;
    const actions = document.createElement('div');
    actions.className = 'ci-actions';
    const btn3D = document.createElement('button');
    btn3D.type = 'button';
    btn3D.className = 'ci-btn';
    btn3D.textContent = 'Ver no 3D';
    (btn3D as any).addEventListener('click', () => _callbacks.onViewIn3D?.(node));
    actions.appendChild(btn3D);
    const btnInspector = document.createElement('button');
    btnInspector.type = 'button';
    btnInspector.className = 'ci-btn';
    btnInspector.textContent = 'Inspector';
    (btnInspector as any).addEventListener('click', () => _callbacks.onOpenInspector?.(node));
    actions.appendChild(btnInspector);
    const btnFocus = document.createElement('button');
    btnFocus.type = 'button';
    btnFocus.className = 'ci-btn';
    btnFocus.textContent = 'Focar';
    (btnFocus as any).addEventListener('click', () => _callbacks.onFocus?.(node));
    actions.appendChild(btnFocus);
    wrap.appendChild(actions);
    return wrap;
}
/**
 * @param {any} edge
 */
function _renderEdgeDetail(edge: any) {
    const wrap = document.createElement('div');
    wrap.className = 'ci-detail';
    const type = edge.type || edge.relationship || '—';
    const subtype = edge.subtype || '—';
    const props = edge.properties || {};
    wrap.innerHTML = `
        <div class="ci-row"><span class="ci-label">Type</span><span class="ci-value">${esc(type)}</span></div>
        <div class="ci-row"><span class="ci-label">Subtype</span><span class="ci-value">${esc(subtype)}</span></div>
        <div class="ci-row"><span class="ci-label">Source</span><span class="ci-value">${esc(edge.source || edge.sourceId)}</span></div>
        <div class="ci-row"><span class="ci-label">Target</span><span class="ci-value">${esc(edge.target || edge.targetId)}</span></div>
        ${Object.entries(props)
            .map(
                ([k, v]) =>
                    `<div class="ci-row"><span class="ci-label">${esc(k)}</span><span class="ci-value">${esc(v)}</span></div>`,
            )
            .join('')}
    `;
    const actions = document.createElement('div');
    actions.className = 'ci-actions';
    const btnEvidence = document.createElement('button');
    btnEvidence.type = 'button';
    btnEvidence.className = 'ci-btn';
    btnEvidence.textContent = 'Ver evidencias';
    (btnEvidence as any).addEventListener('click', () => _callbacks.onViewEvidence?.(edge));
    actions.appendChild(btnEvidence);
    wrap.appendChild(actions);
    return wrap;
}
/**
 * @param {any} nodes
 */
function _renderMultiNodeDetail(nodes: any) {
    const wrap = document.createElement('div');
    wrap.className = 'ci-detail';
    const totalConnections = nodes.reduce(
        (sum: any, n: any) => sum + (n.connections ?? n.degree ?? 0),
        0,
    );
    const types: any = {};
    nodes.forEach((n: any) => {
        const t = n.type || n.family || 'unknown';
        types[t] = (types[t] || 0) + 1;
    });
    wrap.innerHTML = `
        <div class="ci-row"><span class="ci-label">Selected</span><span class="ci-value">${nodes.length} nodes</span></div>
        <div class="ci-row"><span class="ci-label">Total connections</span><span class="ci-value">${totalConnections}</span></div>
    `;
    const typeSection = document.createElement('div');
    typeSection.className = 'ci-sub-section';
    typeSection.innerHTML = `<div class="ci-sub-label">By type</div>`;
    Object.entries(types).forEach(([type, count]) => {
        const row = document.createElement('div');
        row.className = 'ci-row';
        row.innerHTML = `<span class="ci-label">${esc(type)}</span><span class="ci-value">${count}</span>`;
        typeSection.appendChild(row);
    });
    wrap.appendChild(typeSection);
    const actions = document.createElement('div');
    actions.className = 'ci-actions';
    const btnFocus = document.createElement('button');
    btnFocus.type = 'button';
    btnFocus.className = 'ci-btn';
    btnFocus.textContent = 'Focar selecionados';
    (btnFocus as any).addEventListener('click', () => _callbacks.onFocus?.(nodes));
    actions.appendChild(btnFocus);
    wrap.appendChild(actions);
    return wrap;
}
function _renderGraphSummary() {
    const wrap = document.createElement('div');
    wrap.className = 'ci-detail';
    const summary = calculateGraphSummary(_graphRef);
    wrap.innerHTML = `
        <div class="ci-row"><span class="ci-label">${t('constellation.info.nodes') || 'Nodes'}</span><span class="ci-value">${summary.nodes}</span></div>
        <div class="ci-row"><span class="ci-label">${t('constellation.info.edges') || 'Edges'}</span><span class="ci-value">${summary.edges}</span></div>
        <div class="ci-row"><span class="ci-label">${t('constellation.info.clusters') || 'Clusters'}</span><span class="ci-value">${summary.clusters}</span></div>
    `;
    return wrap;
}
/**
 * @param {any} str
 */
function esc(str: any) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
