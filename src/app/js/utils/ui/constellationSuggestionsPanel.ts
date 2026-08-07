// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Constellation IA Suggestions panel (consumes clusterDetection existing).
// Hand-authored R1-safe — SPEC_CONSTELLATION_HUD_9_75 §missing "IA suggestions
// (cluster detection, anomaly detection)".
// Sem novo algoritmo: delega 100% a clusterDetection.js (Phase 1.8 existente).
//
// Spec NOT:
// - NÃO reimplementar clustering (delega clusterDetection)
// - NÃO criar novo modal system (createModal)
// - NÃO emoji em strings
// - NÃO depende Three.js/canvas

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import {
    clusterByConnectedComponents,
    clusterByAttribute,
    summarizeClusters,
    CLUSTER_STRATEGIES,
} from '../../core/constellation/clusterDetection.js';

/**
 * Renderiza summary line (cluster count + total members + maior cluster).
 * @param {*} summary
 * @returns {string} HTML
 */
function _renderSummary(summary: any) {
    const count = summary?.clusterCount ?? 0;
    const largest = summary?.largestSize ?? 0;
    const isolated = summary?.isolatedCount ?? 0;
    return `<div class="csg-summary">
        <span class="csg-summary-count">${escapeHtml(String(count))} ${escapeHtml(t('constellation.suggestions.clusters') || 'clusters')}</span>
        <span class="csg-summary-largest">${escapeHtml(t('constellation.suggestions.largest') || 'maior:')} ${escapeHtml(String(largest))}</span>
        ${isolated > 0 ? `<span class="csg-summary-isolated">${escapeHtml(String(isolated))} ${escapeHtml(t('constellation.suggestions.isolated') || 'isolados')}</span>` : ''}
    </div>`;
}

/**
 * Renderiza lista de clusters (top N).
 * @param {Array<*>} clusters
 * @param {number} [topN=10]
 * @returns {string} HTML
 */
function _renderClusterList(clusters: any, topN: any = 10) {
    if (!Array.isArray(clusters) || !clusters.length) {
        return `<div class="csg-empty">${escapeHtml(t('constellation.suggestions.empty') || 'Nenhum cluster detectado')}</div>`;
    }
    const top = clusters
        .slice()
        .sort((a: any, b: any) => (b.members?.length || 0) - (a.members?.length || 0))
        .slice(0, topN);
    return `<ul class="csg-cluster-list">${top
        .map((c: any) => `<li class="csg-cluster-item" data-cluster-id="${escapeHtml(c.id || '')}">
            <span class="csg-cluster-id">${escapeHtml(c.id || '')}</span>
            <span class="csg-cluster-size">${escapeHtml(String(c.members?.length || 0))}</span>
        </li>`,
        )
        .join('')}</ul>`;
}

/**
 * Builds modal body — strategy picker + summary + cluster list.
 * @param {{nodes:Array<*>, edges:Array<*>}} input
 * @returns {HTMLElement}
 */
function _buildBody(input: any) {
    const body = document.createElement('div');
    body.className = 'csg-body';
    const nodes = Array.isArray(input?.nodes) ? input.nodes : [];
    const edges = Array.isArray(input?.edges) ? input.edges : [];
    // Default strategy: connected-components
    let result;
    try {
        result = clusterByConnectedComponents(nodes, edges);
    } catch (e: any) {
        console.debug('[constellationSuggestionsPanel:cc]', e?.message || e);
        result = { clusters: [], clusterByNode: new Map() };
    }
    const summary = summarizeClusters(result.clusters || []);
    const strategyPicker = `<div class="csg-strategy-picker">
        <label for="csg-strategy">${escapeHtml(t('constellation.suggestions.strategy') || 'Estratégia:')}</label>
        <select id="csg-strategy">
            <option value="${CLUSTER_STRATEGIES.CONNECTED_COMPONENTS}" selected>${escapeHtml(t('constellation.suggestions.strategy.cc') || 'Componentes conexos')}</option>
            <option value="${CLUSTER_STRATEGIES.ATTRIBUTE_GROUPING}">${escapeHtml(t('constellation.suggestions.strategy.attr') || 'Por atributo')}</option>
        </select>
    </div>`;
    body.innerHTML = `
        ${strategyPicker}
        ${_renderSummary(summary)}
        ${_renderClusterList(result.clusters || [])}
    `;
    // Strategy switcher
    body.querySelector('#csg-strategy')?.addEventListener("change", (ev: any) => {
        const value = (ev.target as any).value;
        let next;
        try {
            if (value === CLUSTER_STRATEGIES.ATTRIBUTE_GROUPING) {
                next = clusterByAttribute(nodes, 'family') as any;
            } else {
                next = clusterByConnectedComponents(nodes, edges);
            }
        } catch (e: any) {
            console.debug('[constellationSuggestionsPanel:switch]', e?.message || e);
            next = { clusters: [], clusterByNode: new Map() };
        }
        const nextSummary = summarizeClusters(next.clusters || []);
        const listEl = body.querySelector('.csg-cluster-list, .csg-empty');
        const sumEl = body.querySelector('.csg-summary');
        if (sumEl) sumEl.outerHTML = _renderSummary(nextSummary);
        if (listEl) listEl.outerHTML = _renderClusterList(next.clusters || []);
    });
    return body;
}

/**
 * Abre painel suggestions com nodes+edges fornecidos.
 * @param {{nodes:Array<*>, edges:Array<*>, onClose?:Function}} opts
 * @returns {{close:Function}}
 */
export function openConstellationSuggestionsPanel(opts: any) {
    const nodes = opts?.nodes || [];
    const edges = opts?.edges || [];
    const body = _buildBody({ nodes, edges });
    const handle = createModal({
        title: t('constellation.suggestions.title') || 'Sugestões IA — Constellation',
        body,
        size: 'md',
        extraClass: 'csg-modal',
        closeOnEsc: true,
        closeOnBackdropClick: true,
        onClose: opts?.onClose,
    });
    return { close: handle.close };
}
