// @ts-check
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
   BUILDER RENDERER — 3-panel drag & drop variable mapping UI
   Renderizador do construtor de mapeamento de variaveis

   Layout em 3 paineis: Catalogo (esquerda), Mapeamento (centro),
   Normalizacao (direita). O usuario arrasta pills de variaveis do
   catalogo para as zonas de Input/Output no painel central.
   ================================================================ */
import { buildVariableCatalog, groupByCategory, getCategoryLabel, getCategoryColor, isGeometricVariable, } from './variableCatalog.js';
import { getDefaultBounds } from './normalization.js';
import { getNetwork, getNetworkMapping, updateNetworkMapping, resizeNetwork, persistNetwork } from './manager.js';
import { getAllElements } from '../elements/manager.js';
import { showToast } from '../../utils/ui/toast.js';
import { t } from '../../utils/i18n/translations.js';
import { getIcon } from '../../utils/ui/icons.js';
import { escapeHtml } from '../../utils/helpers/html.js';
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// MODULE STATE - Current builder session
// Estado temporario da sessao de construcao
// ----------------------------------------------------------------
let _currentNetworkId: any = null;
/** @type {{ inputs: any[], outputs: any[] }} */
let _currentMapping: { inputs: any[]; outputs: any[]; [key: string]: any } = { inputs: [], outputs: [] };
// ----------------------------------------------------------------
// MAIN RENDER - 3-panel builder layout
// Renderiza o layout principal do construtor
// ----------------------------------------------------------------
/**
 * Render the variable mapping builder for a network.
 * Substitui o conteudo do nn-modal-body com o construtor 3 paineis.
 *
 * @param {string} networkId
 */
export function renderBuilder(networkId: any) {
    const body = document.getElementById('nn-modal-body');
    if (!body)
        return;
    const nn = getNetwork(networkId);
    if (!nn)
        return;
    _currentNetworkId = networkId;
    // Load existing mapping or start fresh
    const existing = getNetworkMapping(networkId);
    _currentMapping = existing
        ? { inputs: [...existing.inputs], outputs: [...existing.outputs] }
        : { inputs: [], outputs: [] };
    const catalog = buildVariableCatalog();
    const grouped: AnyRecord = groupByCategory(catalog) as AnyRecord;
    body.innerHTML = `
        <div class="nn-builder-header">
            <button class="btn btn-sm" data-cc-action="cc-51a0470e">
                ${getIcon('arrow-left', { size: '14px' })} ${t('nnBackToList')}
            </button>
            <h4>${getIcon('sliders', { size: '16px' })} ${t('nnBuilder')}: <span class="nn-card-id">${escapeHtml(networkId)}</span></h4>
        </div>
        <div class="nn-builder">
            <div class="nn-catalog-panel" id="nn-catalog-panel">
                ${_renderCatalogPanel(grouped)}
            </div>
            <div class="nn-mapping-panel">
                <div class="nn-mapping-section">
                    <div class="nn-mapping-label">${getIcon('log-in', { size: '14px' })} ${t('nnInputZone')}</div>
                    <div class="nn-dropzone" id="nn-dropzone-inputs" data-side="inputs">
                        ${_renderMappedVars(_currentMapping.inputs, 'inputs')}
                    </div>
                </div>
                <div class="nn-mapping-divider">${getIcon('chevrons-down', { size: '16px' })}</div>
                <div class="nn-mapping-section">
                    <div class="nn-mapping-label">${getIcon('log-out', { size: '14px' })} ${t('nnOutputZone')}</div>
                    <div class="nn-dropzone" id="nn-dropzone-outputs" data-side="outputs">
                        ${_renderMappedVars(_currentMapping.outputs, 'outputs')}
                    </div>
                </div>
            </div>
            <div class="nn-norm-panel" id="nn-norm-panel">
                ${_renderNormPanel()}
            </div>
        </div>
        <div class="nn-builder-footer">
            <button class="btn btn-primary btn-sm" data-cc-call-click="handleNNSaveBuilder|s:${encodeURIComponent(`${escapeHtml(networkId)}`)}">
                ${getIcon('save', { size: '14px' })} ${t('nnSaveMapping')}
            </button>
        </div>`;
    _installDnD(body);
}
// ----------------------------------------------------------------
// CATALOG PANEL - Draggable variable pills
// Painel esquerdo com pills arrastaveis agrupadas por categoria
// ----------------------------------------------------------------
/** @param {any} grouped */
function _renderCatalogPanel(grouped: any) {
    let html = `<div class="nn-catalog-title">${getIcon('book-open', { size: '14px' })} ${t('nnVariableCatalog')}</div>`;
    const allMapped = new Set([
        ..._currentMapping.inputs.map((v: any) => v.variableId),
        ..._currentMapping.outputs.map((v: any) => v.variableId),
    ]);
    for (const [category, vars] of Object.entries(grouped)) {
        const color = getCategoryColor(category);
        html += `
            <div class="nn-catalog-category">
                <div class="nn-catalog-category-header" style="border-left: 3px solid ${color}">
                    ${getCategoryLabel(category)}
                </div>`;
        for (const v of vars as any[]) {
            const disabled = allMapped.has(v.id) ? ' nn-pill-disabled' : '';
            const calcBadge = v._calcType
                ? `<span class="nn-calc-badge">${v._calcType === 'ratio' ? 'R' : v._calcType[0].toUpperCase()}</span>`
                : '';
            html += `
                <div class="nn-variable-pill${disabled}"
                     draggable="${allMapped.has(v.id) ? 'false' : 'true'}"
                     data-variable-id="${v.id}"
                     data-variable-name="${escapeHtml(v.name)}"
                     data-variable-unit="${v.unitId}"
                     data-variable-min="${v.min}"
                     data-variable-max="${v.max}"
                     style="--pill-color: ${color}">
                    <span class="nn-pill-dot" style="background: ${color}"></span>
                    ${calcBadge}${escapeHtml(v.name)}
                    <span class="nn-pill-unit">${v.unitId}</span>
                </div>`;
        }
        html += '</div>';
    }
    return html;
}
// ----------------------------------------------------------------
// MAPPING PANEL - Rendered mapped variables in dropzones
// Painel central com variaveis mapeadas nas zonas
// ----------------------------------------------------------------
/** @param {any[]} mappedVars @param {any} side */
function _renderMappedVars(mappedVars: any, side: any) {
    if (mappedVars.length === 0) {
        return `<div class="nn-dropzone-hint">${t('nnBuilderHint')}</div>`;
    }
    let html = '';
    for (const v of mappedVars) {
        html += `
            <div class="nn-mapped-var">
                <span class="nn-mapped-name">${escapeHtml(v.variableId)}</span>
                <span class="nn-mapped-unit">${v.unitId}</span>
                <button class="nn-mapped-remove" data-cc-call-click="handleNNUnmapVariable|s:${encodeURIComponent(`${escapeHtml(_currentNetworkId)}`)}|s:${encodeURIComponent(`${side}`)}|s:${encodeURIComponent(`${v.variableId}`)}" title="${t('remove')}">×</button>
            </div>`;
    }
    return html;
}
// ----------------------------------------------------------------
// NORMALIZATION PANEL - MIN/MAX fields per mapped variable
// Painel direito com campos de limites de normalizacao
// ----------------------------------------------------------------
function _renderNormPanel() {
    const allMapped = [..._currentMapping.inputs, ..._currentMapping.outputs];
    if (allMapped.length === 0) {
        return `<div class="nn-norm-empty">${t('nnNormalization')}</div>`;
    }
    let html = `<div class="nn-norm-title">${getIcon('settings', { size: '14px' })} ${t('nnNormalization')}</div>`;
    for (const v of allMapped) {
        const side = _currentMapping.inputs.includes(v) ? 'input' : 'output';
        const sideIcon = side === 'input' ? 'log-in' : 'log-out';
        html += `
            <div class="nn-norm-card">
                <div class="nn-norm-card-header">
                    ${getIcon(sideIcon, { size: '12px' })}
                    <strong>${escapeHtml(v.variableId)}</strong>
                    <span class="nn-pill-unit">${v.unitId}</span>
                </div>
                <div class="nn-norm-card-body">
                    <div class="nn-norm-field">
                        <label>${t('nnNormMin')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:builderRenderer:input:L209" type="number" class="form-control" value="${v.min}"
                               data-cc-call-change="handleNNUpdateNorm|s:${encodeURIComponent(`${escapeHtml(_currentNetworkId)}`)}|s:${encodeURIComponent(`${v.variableId}`)}|s:min|v" />
                    </div>
                    <div class="nn-norm-field">
                        <label>${t('nnNormMax')}</label>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:builderRenderer:input:L214" type="number" class="form-control" value="${v.max}"
                               data-cc-call-change="handleNNUpdateNorm|s:${encodeURIComponent(`${escapeHtml(_currentNetworkId)}`)}|s:${encodeURIComponent(`${v.variableId}`)}|s:max|v" />
                    </div>
                </div>
            </div>`;
    }
    return html;
}
// ----------------------------------------------------------------
// DRAG & DROP - HTML5 native DnD for variable pills → dropzones
// Sistema de arrastar e soltar nativo para pills nas zonas
// ----------------------------------------------------------------
/** @param {any} container */
function _installDnD(container: any) {
    // Drag start - set variable data on the dragged pill
    container.addEventListener('dragstart', (e: any) => {
        const pill = e.target.closest('.nn-variable-pill');
        if (!pill || pill.classList.contains('nn-pill-disabled')) {
            e.preventDefault();
            return;
        }
        e.dataTransfer.setData('text/plain', pill.dataset.variableId);
        e.dataTransfer.effectAllowed = 'copy';
        pill.classList.add('nn-pill-dragging');
    });
    container.addEventListener('dragend', (e: any) => {
        const pill = e.target.closest('.nn-variable-pill');
        if (pill)
            pill.classList.remove('nn-pill-dragging');
    });
    // Drop zones - accept dragged pills
    const zones = container.querySelectorAll('.nn-dropzone');
    for (const zone of zones) {
        zone.addEventListener('dragover', (e: any) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', (e: any) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const variableId = e.dataTransfer.getData('text/plain');
            if (!variableId)
                return;
            const side = zone.dataset.side || '';
            _onVariableMapped(variableId, side);
        });
    }
}
// ----------------------------------------------------------------
// MAPPING CALLBACKS - Add/remove variables to mapping
// Callbacks para adicionar/remover variaveis do mapeamento
// ----------------------------------------------------------------
/** @param {any} variableId @param {any} side */
function _onVariableMapped(variableId: any, side: any) {
    // Prevent duplicate mapping
    const existing = [..._currentMapping.inputs, ..._currentMapping.outputs];
    if (existing.some((v: any) => v.variableId === variableId))
        return;
    const bounds = getDefaultBounds(variableId);
    const entry = {
        variableId,
        min: bounds?.min ?? 0,
        max: bounds?.max ?? 1,
        unitId: bounds?.unitId ?? '',
    };
    /** @type {any} */ (_currentMapping)[side].push(entry);
    _refreshBuilder();
}
/**
 * Remove a variable from the mapping.
 * @param {string} networkId
 * @param {string} side - 'inputs' or 'outputs'
 * @param {string} variableId
 */
export function unmapVariable(networkId: any, side: any, variableId: any) {
    if (networkId !== _currentNetworkId)
        return;
    /** @type {any} */ (_currentMapping)[side] = /** @type {any} */ (_currentMapping)[side].filter((v: any) => v.variableId !== variableId);
    _refreshBuilder();
}
/**
 * Update normalization bounds for a mapped variable.
 * @param {string} networkId
 * @param {string} variableId
 * @param {string} field - 'min' or 'max'
 * @param {string} value
 */
export function updateNorm(networkId: any, variableId: any, field: any, value: any) {
    if (networkId !== _currentNetworkId)
        return;
    const numVal = parseFloat(value);
    if (isNaN(numVal))
        return;
    for (const side of ['inputs', 'outputs']) {
        const entry = /** @type {any} */ (_currentMapping)[side].find((v: any) => v.variableId === variableId);
        if (entry) {
            entry[field] = numVal;
            break;
        }
    }
}
/**
 * Save the current mapping to the network and resize topology.
 * Salva mapeamento, auto-ajusta topologia e persiste.
 *
 * @param {string} networkId
 */
export function saveBuilder(networkId: any) {
    if (networkId !== _currentNetworkId)
        return;
    // Auto-detect plume connection if outputs include geometric variables
    let targetElementId = getNetworkMapping(networkId)?.targetElementId || null;
    const hasGeoOutputs = _currentMapping.outputs.some((m: any) => isGeometricVariable(m.variableId));
    if (hasGeoOutputs && !targetElementId) {
        const plumes = getAllElements().filter((e: any) => e.family === 'plume');
        if (plumes.length > 0)
            targetElementId = plumes[0]?.id || null;
    }
    const mapping = {
        inputs: [..._currentMapping.inputs],
        outputs: [..._currentMapping.outputs],
        targetElementId: targetElementId || undefined,
    };
    updateNetworkMapping(networkId, mapping);
    // Auto-resize network topology to match mapping
    const inputSize = mapping.inputs.length || 1;
    const outputSize = mapping.outputs.length || 1;
    resizeNetwork(networkId, inputSize, outputSize);
    persistNetwork(networkId);
    showToast(`${t('nnSaveMapping')}: ${networkId}`, 'success');
}
/**
 * Go back to the network list view.
 * Volta para a lista de redes.
 */
export function backToList() {
    _currentNetworkId = null;
    _currentMapping = { inputs: [], outputs: [] };
    // Re-import handler to re-render modal
    import('../../utils/handlers/nn.js')
        .then((mod: any) => {
        mod.nnHandlers.handleOpenNNManager();
    })
        .catch((err: any) => console.warn('[nn/builderRenderer] import failed:', err));
}
// ----------------------------------------------------------------
// INTERNAL - Re-render builder without full rebuild
// ----------------------------------------------------------------
function _refreshBuilder() {
    if (!_currentNetworkId)
        return;
    const catalog = buildVariableCatalog();
    const grouped = groupByCategory(catalog);
    // Re-render catalog with updated disabled states
    const catalogPanel = document.getElementById('nn-catalog-panel');
    if (catalogPanel)
        catalogPanel.innerHTML = _renderCatalogPanel(grouped);
    // Re-render dropzones
    const inputZone = document.getElementById('nn-dropzone-inputs');
    if (inputZone)
        inputZone.innerHTML = _renderMappedVars(_currentMapping.inputs, 'inputs');
    const outputZone = document.getElementById('nn-dropzone-outputs');
    if (outputZone)
        outputZone.innerHTML = _renderMappedVars(_currentMapping.outputs, 'outputs');
    // Re-render normalization panel
    const normPanel = document.getElementById('nn-norm-panel');
    if (normPanel)
        normPanel.innerHTML = _renderNormPanel();
    // Re-install DnD on updated content
    const body = document.getElementById('nn-modal-body') || document.querySelector('.nn-panel-body');
    if (body)
        _installDnD(body);
}
//# sourceMappingURL=builderRenderer.js.map
