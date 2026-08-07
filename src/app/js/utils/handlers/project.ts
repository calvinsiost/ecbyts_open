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
   PROJECT HANDLERS — Project areas and organizational tree
   Handlers para areas do projeto e arvore organizacional

   "Areas" sao as divisoes fisicas ou funcionais de um site ambiental.
   A "arvore" organiza essas areas hierarquicamente.
   Ex: Fabrica > Setor de Manutencao > Almoxarifado
   ================================================================ */
import { t } from '../i18n/translations.js';
import { applyTranslations } from '../i18n/translations.js';
import { getIcon, hydrateIcons } from '../ui/icons.js';
import {
    addInputLink,
    addOutputLink,
    removeInputLink,
    removeOutputLink,
    resetModelIdentity,
    generateModelId,
    getCorporateInputs,
    getCorporateOutputs,
    addCorporateInput,
    addCorporateOutput,
    removeCorporateInput,
    removeCorporateOutput,
    getCorporateTotals,
    INPUT_CATEGORIES,
    OUTPUT_CATEGORIES,
    COMMON_UNITS,
} from '../../core/io/modelLink.js';
import { computeScopedEIS } from '../../core/purpose/snapshotEngine.js';
import { getModelIdSync } from '../../core/io/modelLink.js';
import { clearModelData, safeSetItem } from '../storage/storageMonitor.js';
import { escapeHtml, escapeAttr, escapeJsAttr } from '../helpers/html.js';
import { showToast } from '../ui/toast.js';
import {
    getAllElements,
    getMeshByElementId,
    addElement,
    nextElementCounter,
    removeElement,
} from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { getCurrency } from '../../core/ingestion/documents/costCatalog.js';
import { generateId } from '../helpers/id.js';
import { asyncPrompt, asyncConfirm } from '../ui/asyncDialogs.js';
import { createLogger } from '../helpers/logger.js';
import { lazyImport } from '../helpers/lazyImport.js';
import {
    SUPPORTED_COUNTRIES,
    getStatesForCountry,
    getMunicipalitiesForState,
    hasLazyMunicipalityData,
    getDefaultTimezone,
    getTimezonesForCountry,
    isValidPostalCode,
    DEFAULT_LOCATION,
    getCountryByCode,
} from '../geo/locationData.js';
import { MunicipalityAutocomplete } from '../../components/municipalityAutocomplete.js';
import {
    REGISTRY_TYPES,
    applyRegistryMask,
    validateRegistry,
    maskPersonalRegistry,
} from './_projectRegistryPure.js';
const log = createLogger('Project');
let _govCache: any = {};
type AnyRecord = Record<string, any>;
type SavedOriginLike = { easting: number; northing: number; zone: number | string; hemisphere: string };
declare global {
    interface HTMLElement {
        value?: any;
        checked?: any;
        files?: any;
        halfW?: any;
        halfL?: any;
        update?: any;
        skipConfirm?: any;
    }
    interface EventTarget {
        files?: any;
        value?: any;
    }
}
/**
 * @typedef {{ id: string }} BoundaryElementLike
 * @typedef {{ easting: number, northing: number, zone: number | string, hemisphere: string }} SavedOriginLike
 */
// ----------------------------------------------------------------
// REGISTRY TYPES + mask/validate/maskPersonal extraídos para
// _projectRegistryPure.ts (ARCH-MONOLITH-ATOMIZATION-001).
// REGISTRY_TYPES, applyRegistryMask, validateRegistry,
// maskPersonalRegistry agora importados do módulo puro.
// ----------------------------------------------------------------
// DOCUMENT TYPES - Tipos de documento/intangivel vinculaveis aos nos
// Cada no pode ter multiplos documentos comprobarorios (contrato
// social, alvara, licenca ambiental, etc.) com hash SHA-256.
// ----------------------------------------------------------------
const DOCUMENT_TYPES = [
    { id: 'contrato_social', label: 'Contrato Social / Articles of Incorporation' },
    { id: 'alvara', label: 'Alvará de Funcionamento / Business License' },
    { id: 'licenca_previa', label: 'Licença Prévia (LP)' },
    { id: 'licenca_instalacao', label: 'Licença de Instalação (LI)' },
    { id: 'licenca_operacao', label: 'Licença de Operação (LO)' },
    { id: 'certidao_ambiental', label: 'Certidão Ambiental' },
    { id: 'cnd', label: 'CND (Certidão Negativa de Débitos)' },
    { id: 'seguro', label: 'Seguro Ambiental' },
    { id: 'outorga', label: 'Outorga de Uso de Água' },
    { id: 'other', label: 'Outro / Other' },
];
/**
 * Find a tree node by ID (recursive).
 * Busca um no da arvore pelo ID de forma recursiva.
 *
 * @param {string} nodeId
 * @param {Array<any>} tree
 * @returns {any|null}
 */
function findNodeById(nodeId: any, tree: any): any {
    for (const node of tree) {
        if (node.id === nodeId) return node;
        if (Array.isArray(node.children)) {
            const found = findNodeById(nodeId, node.children);
            if (found) return found;
        }
    }
    return null;
}
/**
 * Flatten the areas tree into a linear array.
 * Achata a arvore em lista plana (para dropdowns e buscas).
 *
 * @param {Array<any>} nodes
 * @returns {Array<any>}
 */
export function flattenAreasTree(nodes: any) {
    /** @type {any[]} */
    const result: any[] = [];
    /** @param {any} node */
    function walk(node: any) {
        result.push(node);
        if (Array.isArray(node.children)) node.children.forEach(walk);
    }
    (nodes || []).forEach(walk);
    return result;
}
/**
 * Count elements linked to a specific tree node via data.areaId.
 * Conta quantos elementos 3D estao vinculados a um no da arvore.
 *
 * @param {string} nodeId
 * @returns {number}
 */
function getLinkedElementCount(nodeId: any) {
    const elements = getAllElements() || [];
    return elements.filter((el: any) => el.data?.areaId === nodeId).length;
}
// ----------------------------------------------------------------
// PROJECT AREAS
// Areas e subareas do projeto (divisoes do terreno).
// Ex: Area de Remediacao, Area de Monitoramento, etc.
// ----------------------------------------------------------------
/**
 * Initialize project areas with default data.
 * Inicializa as areas do projeto. Se nao existirem, cria uma vazia.
 */
export function initProjectAreas() {
    if (!Array.isArray(window.projectAreas) || window.projectAreas.length === 0) {
        window.projectAreas = [{ area: '', subarea: '' }];
    }
    renderProjectAreas();
}
/**
 * Render the project areas list in the UI.
 * Desenha a lista de areas na interface.
 * Cada area tem um campo de texto para nome e subarea.
 */
export function renderProjectAreas() {
    const container = document.getElementById('project-areas-list');
    if (!container) return;
    if (!Array.isArray(window.projectAreas) || window.projectAreas.length === 0) {
        window.projectAreas = [{ area: '', subarea: '' }];
    }
    container.innerHTML = /** @type {any} */ (window).projectAreas
        .map(
            (entry: any, index: number) => `
        <div class="project-area-row" data-project-area-row>
            <div class="form-group">
                <label class="form-label" data-i18n="projectArea">Area</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:project:input:L331" type="text"
                       class="form-input"
                       data-project-area
                       data-i18n-placeholder="projectAreaPlaceholder"
                       placeholder="Project area"
                       value="${entry.area || ''}"
                       data-cc-call-input="handleProjectAreaChange|j:${encodeURIComponent(String(index))}|s:area|v">
            </div>
            <div class="form-group">
                <label class="form-label" data-i18n="projectSubarea">Subarea</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:project:input:L341" type="text"
                       class="form-input"
                       data-project-subarea
                       data-i18n-placeholder="projectSubareaPlaceholder"
                       placeholder="Project subarea"
                       value="${entry.subarea || ''}"
                       data-cc-call-input="handleProjectAreaChange|j:${encodeURIComponent(String(index))}|s:subarea|v">
            </div>
            <button type="button"
                    class="btn btn-icon btn-danger project-area-remove"
                    title="${t('delete')}"
                    data-cc-call-click="handleRemoveProjectArea|j:${encodeURIComponent(String(index))}"
                    aria-label="${t('common.remove')}">
                <span data-icon="x" data-icon-size="12px"></span>
            </button>
        </div>
    `,
        )
        .join('');
    hydrateIcons(container);
    applyTranslations();
}
/**
 * Add a new empty project area.
 * Adiciona uma nova area vazia ao projeto.
 */
export function handleAddProjectArea() {
    if (!Array.isArray(window.projectAreas)) {
        window.projectAreas = [];
    }
    window.projectAreas.push({ area: '', subarea: '' });
    renderProjectAreas();
}
/**
 * Remove a project area by index.
 * Remove uma area do projeto. Mantem pelo menos uma area vazia.
 *
 * @param {number} index - Index of the area to remove
 */
export function handleRemoveProjectArea(index: any) {
    if (!Array.isArray(window.projectAreas)) return;
    window.projectAreas.splice(index, 1);
    if (window.projectAreas.length === 0) {
        window.projectAreas.push({ area: '', subarea: '' });
    }
    renderProjectAreas();
}
/**
 * Update a field in a project area.
 * Atualiza um campo (area ou subarea) de uma area do projeto.
 *
 * @param {number} index - Area index
 * @param {string} field - 'area' or 'subarea'
 * @param {string} value - New value
 */
export function handleProjectAreaChange(index: any, field: any, value: any) {
    if (!Array.isArray(window.projectAreas) || !window.projectAreas[index]) return;
    window.projectAreas[index] = { ...window.projectAreas[index], [field]: value };
}
/**
 * Set all project areas at once (used by import).
 * Define todas as areas do projeto de uma vez (usado na importacao).
 *
 * @param {Array<any>} areas - Array of { area, subarea } objects
 */
export function setProjectAreas(areas: any) {
    if (Array.isArray(areas) && areas.length > 0) {
        window.projectAreas = areas.map((entry: any) => ({
            area: entry?.area || '',
            subarea: entry?.subarea || '',
        }));
    } else {
        window.projectAreas = [{ area: '', subarea: '' }];
    }
    renderProjectAreas();
}
// ----------------------------------------------------------------
// AREAS TREE VIEW
// Arvore hierarquica de areas (visualizacao em arvore).
// Organiza as areas em niveis: controladora > area > subarea.
// ----------------------------------------------------------------
/**
 * Initialize the areas tree with default demo data.
 * Inicializa a arvore de areas. Se nao existir, cria dados de exemplo.
 */
export function initAreasTree() {
    if (!Array.isArray(window.areasTreeData)) {
        window.areasTreeData = [
            {
                id: 'controladora-1',
                name: 'Controladora Central',
                type: 'controller',
                badges: ['Operacional'],
                registryType: 'cnpj',
                registryNumber: '11.222.333/0001-81',
                expanded: true,
                children: [
                    {
                        id: 'manutencao',
                        name: 'Manutencao',
                        type: 'area',
                        badges: ['MRO'],
                        expanded: true,
                        children: [
                            { id: 'almoxarifado', name: 'Almoxarifado', type: 'subarea', badges: ['Operacional'] },
                            { id: 'ferramentaria', name: 'Ferramentaria', type: 'subarea', badges: ['Planejado'] },
                        ],
                    },
                    {
                        id: 'operacoes',
                        name: 'Operacoes',
                        type: 'area',
                        badges: ['Ativo'],
                        children: [
                            {
                                id: 'controle-qualidade',
                                name: 'Controle de Qualidade',
                                type: 'subarea',
                                badges: ['MRO'],
                            },
                        ],
                    },
                ],
            },
        ];
    }
    if (!window.areasTreeExpanded) {
        window.areasTreeExpanded = new Set();
        window.areasTreeData.forEach((node: any) => {
            if (node.expanded) window.areasTreeExpanded.add(node.id);
        });
    }
    renderAreasTree();
}
/**
 * Render the areas tree in the UI.
 * Desenha a arvore de areas na interface.
 */
export function renderAreasTree() {
    const container = document.getElementById('areas-tree');
    if (!container) return;
    if (!Array.isArray(window.areasTreeData)) return;
    container.innerHTML = window.areasTreeData.map((node: any) => renderTreeNode(node, 0)).join('');
}
/**
 * Render a single tree node recursively.
 * Desenha um no da arvore e seus filhos (recursivo).
 *
 * @param {any} registryType - Tree node data
 * @param {number} registryNumber - Nesting depth (for indentation)
 * @returns {string} HTML string
 */
/**
 * Build registry subtitle HTML for a tree node.
 * @param {any} registryType
 * @param {any} registryNumber
 * @returns {string}
 */
function _buildTreeRegistryHtml(registryType: any, registryNumber: any) {
    const registryDisplay = maskPersonalRegistry(registryType, registryNumber);
    return registryDisplay
        ? `<span class="areas-tree-registry">${escapeHtml(registryDisplay)}</span>`
        : '';
}

/**
 * Build linked-element count badge HTML.
 * @param {string} nodeId
 * @returns {string}
 */
function _buildTreeLinkedBadge(nodeId: any) {
    const linkedCount = getLinkedElementCount(nodeId);
    if (linkedCount <= 0) return '';
    return `<span class="areas-tree-badge areas-tree-badge--count" title="${linkedCount} ${t('linkedElements')}">${linkedCount}</span>`;
}

/**
 * Build document count badge HTML.
 * @param {number} docCount
 * @returns {string}
 */
function _buildTreeDocBadge(docCount: number) {
    if (docCount <= 0) return '';
    return `<span class="areas-tree-badge areas-tree-badge--docs" title="${docCount} ${t('documents')}">${getIcon('file-new', { size: '10px' })}${docCount}</span>`;
}

/**
 * Build EIS badge HTML for CNPJ nodes.
 * @param {any} node
 * @returns {string}
 */
function _buildTreeEisBadge(node: any) {
    if (node.registryType !== 'cnpj' || !node.registryNumber) return '';
    const linkedCount = getLinkedElementCount(node.id);
    if (linkedCount === 0) return '';
    try {
        const scope = { type: 'cnpj', nodeId: node.id, cnpj: node.registryNumber, modelId: getModelIdSync() };
        const eisResult = computeScopedEIS(scope);
        const eisScore = eisResult.eis.toFixed(1);
        const colorMap: Record<string, string> = { 'Audit Ready': '#22c55e', 'Management Ready': '#f59e0b' };
        const eisColor = colorMap[eisResult.verdict] || '#ef4444';
        const respNames = [
            eisResult.responsibles?.legal?.name,
            eisResult.responsibles?.technical?.name,
            eisResult.responsibles?.data?.name,
        ]
            .filter(Boolean)
            .join(', ');
        const tooltip = `EIS ${eisScore} \u2014 ${eisResult.verdict}${respNames ? '\n' + respNames : ''}`;
        return `<span class="areas-tree-badge" style="color:${eisColor};font-weight:700;font-size:10px" title="${escapeAttr(tooltip)}">&#9679; ${eisScore}</span>`;
    } catch (e: any) {
        console.debug('[project] renderAreaNode-eisBadge:', e?.message || e);
        return '';
    }
}
function _buildTreeChildrenHtml(node: any, level: any, isExpanded: any) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    if (!hasChildren) return '';
    return `
        <div class="areas-tree-children ${isExpanded ? '' : 'areas-tree-hidden'}">
            ${node.children.map((child: any) => renderTreeNode(child, level + 1)).join('')}
        </div>
    `;
}

function renderTreeNode(node: any, level: any) {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = window.areasTreeExpanded?.has(node.id);
    const isActive = window.activeAreaNodeId === node.id;
    const icon = getAreaNodeIcon(node.type);
    const badges = Array.isArray(node.badges) ? node.badges : [];
    const registryHtml = _buildTreeRegistryHtml(node.registryType, node.registryNumber);
    const linkedBadge = _buildTreeLinkedBadge(node.id);
    const docBadge = _buildTreeDocBadge(Array.isArray(node.documents) ? node.documents.length : 0);
    const eisBadge = _buildTreeEisBadge(node);
    const childrenHtml = _buildTreeChildrenHtml(node, level, isExpanded);
    return `
        <div class="areas-tree-node" style="margin-left: ${level * 14}px">
            <div class="areas-tree-item ${isActive ? 'active' : ''}" data-area-node="${escapeAttr(node.id)}">
                <span class="areas-tree-chevron ${hasChildren && isExpanded ? 'expanded' : ''}"
                      data-area-chevron
                      data-cc-call-click="toggleAreaNode|s:${encodeURIComponent(`${escapeJsAttr(node.id)}`)}|e">
                    ${hasChildren ? '\u25B6' : ''}
                </span>
                <span class="areas-tree-icon">${icon}</span>
                <span class="areas-tree-label-block"
                      data-cc-call-click="selectAreaNode|s:${encodeURIComponent(`${escapeJsAttr(node.id)}`)}">
                    <span class="areas-tree-label">${escapeHtml(node.name)}</span>
                    ${registryHtml}
                </span>
                <span class="areas-tree-badges">
                    ${eisBadge}
                    ${docBadge}
                    ${linkedBadge}
                    ${badges.map((badge: any) => `<span class="areas-tree-badge">${escapeHtml(badge)}</span>`).join('')}
                </span>
            </div>
            ${childrenHtml}
        </div>
    `;
}
function getAreaNodeIcon(type: any) {
    switch (type) {
        case 'controller':
            return getIcon('building', { size: '14px' });
        case 'area':
            return getIcon('layers', { size: '14px' });
        case 'subarea':
        default:
            return getIcon('file-new', { size: '14px' });
    }
}
/**
 * Toggle tree node expansion.
 * Expande ou recolhe um no da arvore.
 *
 * @param {string} nodeId - Node ID
 * @param {Event} event - Click event
 */
export function toggleAreaNode(nodeId: any, event: any) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    if (!window.areasTreeExpanded) window.areasTreeExpanded = new Set();
    if (window.areasTreeExpanded.has(nodeId)) {
        window.areasTreeExpanded.delete(nodeId);
    } else {
        window.areasTreeExpanded.add(nodeId);
    }
    renderAreasTree();
}
/**
 * Select a tree node as active.
 * Marca um no como selecionado (ativo) na arvore.
 *
 * @param {string} nodeId - Node ID
 */
export function selectAreaNode(nodeId: any) {
    // Desselecionar se clicar no mesmo no
    if (window.activeAreaNodeId === nodeId) {
        window.activeAreaNodeId = null;
        renderAreasTree();
        renderAreaNodeDetail(null);
        clearElementHighlights();
        return;
    }
    window.activeAreaNodeId = nodeId;
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
    highlightLinkedElements(nodeId);
}
/**
 * Set entire tree data (used by import).
 * Define toda a arvore de uma vez (usado na importacao).
 *
 * @param {Array<any>} treeData - Array of tree node objects
 */
export function setAreasTree(treeData: any) {
    window.areasTreeData = Array.isArray(treeData) ? treeData : [];
    window.areasTreeExpanded = new Set();
    window.areasTreeData.forEach((node: any) => {
        if (node.expanded) window.areasTreeExpanded.add(node.id);
    });
    renderAreasTree();
}
// ----------------------------------------------------------------
// CORPORATE I/O - Registro de compras, vendas e relação com investidores
// Cada transação pode ser vinculada a elementos 3D e campanhas.
// ----------------------------------------------------------------
/** State para controlar seções colapsadas e formulários abertos */
const _CIO_COLLAPSED_KEY = 'ecbyts-cio-collapsed';
const _cioCollapsed: any = (() => {
    try {
        const saved = localStorage.getItem(_CIO_COLLAPSED_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                inputs: typeof parsed.inputs === 'boolean' ? parsed.inputs : true,
                outputs: typeof parsed.outputs === 'boolean' ? parsed.outputs : true,
                ir: typeof parsed.ir === 'boolean' ? parsed.ir : true,
            };
        }
    } catch (err: any) {
        log.debug('CIO visibility parse ignored', err?.message);
    }
    return { inputs: true, outputs: true, ir: true };
})();
const _cioFormOpen: any = { input: false, output: false };
/**
 * Formata valor monetário.
 * @param {number} value
 * @returns {string}
 */
function _fmtCurrency(value: any) {
    const cur = getCurrency();
    return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: cur });
}
/**
 * Formata valor compacto (ex: R$ 42.8k).
 * @param {number} value
 * @returns {string}
 */
function _fmtCompact(value: any) {
    const cur = getCurrency();
    if (Math.abs(value) >= 1_000_000) return `${cur} ${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `${cur} ${(value / 1_000).toFixed(1)}k`;
    return _fmtCurrency(value);
}
/**
 * Render completo do registro corporativo (3 seções).
 * Substitui o antigo renderModelLinks().
 */
export function renderCorporateIO() {
    const container = document.getElementById('corporate-io-container');
    if (!container) return;
    let html = '';
    html += _renderInputsSection();
    html += _renderOutputsSection();
    html += _renderIRSection();
    container.innerHTML = html;
    hydrateIcons(container);
}
// Alias para retrocompatibilidade
export const renderModelLinks = renderCorporateIO;
// ---- SECTION 1: COMPRAS (INPUTS) ----
function _renderInputsSection() {
    const items = getCorporateInputs();
    const collapsed = _cioCollapsed.inputs;
    const total = items.reduce((/** @type {any} */ s, i: any) => s + (i.totalCost || 0), 0);
    let html = `
        <div class="pio-section">
            <div class="pio-section-header" data-cc-action="cc-30196f93">
                <span>${t('suppliesAcquired') || 'Compras / Insumos'} (${items.length})</span>
                <span class="pio-chevron">${collapsed ? '\u25B6' : '\u25BC'}</span>
            </div>`;
    if (!collapsed) {
        html += '<div class="pio-section-body">';
        if (items.length === 0) {
            html += `<div class="pio-empty">${t('noInputData') || 'Nenhuma compra registrada.'}</div>`;
        } else {
            for (const item of items) {
                html += _renderTransactionCard(item, 'input');
            }
            html += `
                <div class="pio-summary">
                    <span>${t('totalPurchases') || 'Total Compras'}</span>
                    <strong>${_fmtCurrency(total)}</strong>
                    <span class="pio-count">(${items.length} ${items.length === 1 ? 'item' : 'itens'})</span>
                </div>`;
        }
        // Formulário inline
        if (_cioFormOpen.input) {
            html += _renderTransactionForm('input');
        } else {
            html += `<button class="btn btn-sm btn-secondary pio-add-btn" data-cc-action="cc-197efd79">+ ${t('addPurchase') || 'Adicionar Compra'}</button>`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}
// ---- SECTION 2: VENDAS (OUTPUTS) ----
function _renderOutputsSection() {
    const items = getCorporateOutputs();
    const collapsed = _cioCollapsed.outputs;
    const total = items.reduce((/** @type {any} */ s, i: any) => s + (i.totalCost || 0), 0);
    let html = `
        <div class="pio-section">
            <div class="pio-section-header" data-cc-action="cc-40439704">
                <span>${t('servicesDelivered') || 'Vendas / Entregas'} (${items.length})</span>
                <span class="pio-chevron">${collapsed ? '\u25B6' : '\u25BC'}</span>
            </div>`;
    if (!collapsed) {
        html += '<div class="pio-section-body">';
        if (items.length === 0) {
            html += `<div class="pio-empty">${t('noOutputData') || 'Nenhuma venda registrada.'}</div>`;
        } else {
            for (const item of items) {
                html += _renderTransactionCard(item, 'output');
            }
            html += `
                <div class="pio-summary">
                    <span>${t('totalDeliveries') || 'Total Vendas'}</span>
                    <strong>${_fmtCurrency(total)}</strong>
                    <span class="pio-count">(${items.length} ${items.length === 1 ? 'item' : 'itens'})</span>
                </div>`;
        }
        if (_cioFormOpen.output) {
            html += _renderTransactionForm('output');
        } else {
            html += `<button class="btn btn-sm btn-secondary pio-add-btn" data-cc-action="cc-115f28ce">+ ${t('addDelivery') || 'Adicionar Venda'}</button>`;
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}
// ---- SECTION 3: RELAÇÃO COM INVESTIDORES ----
function _renderIRKpiCards(totals: any) {
    const marginSign = totals.margin >= 0 ? '+' : '';
    return `
        <div class="pio-kpi-grid">
            <div class="pio-kpi-card">
                <div class="pio-kpi-value">${_fmtCompact(totals.totalInputs)}</div>
                <div class="pio-kpi-label">${t('purchases') || 'Compras'}</div>
            </div>
            <div class="pio-kpi-card">
                <div class="pio-kpi-value">${_fmtCompact(totals.totalOutputs)}</div>
                <div class="pio-kpi-label">${t('sales') || 'Vendas'}</div>
            </div>
            <div class="pio-kpi-card ${totals.margin >= 0 ? 'pio-kpi-positive' : 'pio-kpi-negative'}">
                <div class="pio-kpi-value">${marginSign}${totals.marginPct}%</div>
                <div class="pio-kpi-label">${t('margin') || 'Margem'}</div>
            </div>
        </div>`;
}

function _renderFinancialIndicators(totals: any) {
    if (totals.inputCount <= 0 && totals.outputCount <= 0) return '';
    const ratio = totals.totalInputs > 0 ? (totals.totalOutputs / totals.totalInputs).toFixed(2) : '\u2014';
    const avgIn = totals.inputCount > 0 ? _fmtCurrency(totals.totalInputs / totals.inputCount) : '\u2014';
    const avgOut = totals.outputCount > 0 ? _fmtCurrency(totals.totalOutputs / totals.outputCount) : '\u2014';
    return `
        <div class="pio-tree">
            <div class="pio-tree-title">${t('financialIndicators') || 'Indicadores Financeiros'}</div>
            <div class="pio-tree-item"><span>${t('revenueCostRatio') || 'Receita / Custo'}</span><span>${ratio}\u00d7</span></div>
            <div class="pio-tree-item"><span>${t('avgSaleTicket') || 'Ticket Médio Venda'}</span><span>${avgOut}</span></div>
            <div class="pio-tree-item"><span>${t('avgPurchaseTicket') || 'Ticket Médio Compra'}</span><span>${avgIn}</span></div>
            <div class="pio-tree-item"><span>${t('itemsRatio') || 'Vendidos / Comprados'}</span><span>${totals.outputCount}/${totals.inputCount}</span></div>
        </div>`;
}

function _renderIRSection() {
    const collapsed = _cioCollapsed.ir;
    const totals = getCorporateTotals();
    let html = `
        <div class="pio-section">
            <div class="pio-section-header" data-cc-action="cc-6b41dad9">
                <span>${t('investorRelations') || 'Relação com Investidores'}</span>
                <span class="pio-chevron">${collapsed ? '\u25B6' : '\u25BC'}</span>
            </div>`;
    if (!collapsed) {
        html += '<div class="pio-section-body">';
        html += _renderIRKpiCards(totals);
        html += _renderFinancialIndicators(totals);
        html += _renderIRMetrics();
        html += '</div>';
    }
    html += '</div>';
    return html;
}
function _countComplianceObservations(elements: any) {
    let violations = 0,
        preventions = 0,
        compliant = 0;
    for (const el of elements) {
        const obs = el.data?.observations;
        if (!Array.isArray(obs)) continue;
        for (const o of obs) {
            if (o.complianceStatus === 'intervention') violations++;
            else if (o.complianceStatus === 'prevention') preventions++;
            else compliant++;
        }
    }
    return { violations, preventions, compliant };
}

function _renderComplianceBlock(stats: any) {
    const total = stats.violations + stats.preventions + stats.compliant;
    if (total === 0) return '';
    return `
        <div class="pio-tree">
            <div class="pio-tree-title">${t('regulatoryCompliance') || 'Conformidade Regulatória'}</div>
            <div class="pio-tree-item pio-danger"><span>${t('interventionViolations') || 'Violações VI'}</span><span>${stats.violations}</span></div>
            <div class="pio-tree-item pio-warning"><span>${t('preventionViolations') || 'Violações VP'}</span><span>${stats.preventions}</span></div>
            <div class="pio-tree-item pio-success"><span>${t('compliantObs') || 'Conformes'}</span><span>${stats.compliant}</span></div>
        </div>`;
}

function _renderContractsBlock(contracts: any, getContractFinancialSummary: any) {
    if (contracts.length === 0) return '';
    const active = contracts.filter((c: any) => c.status === 'active');
    let totalValue = 0,
        totalPaid = 0;
    for (const c of contracts) {
        const s = getContractFinancialSummary?.(c.id);
        if (s) {
            totalValue += s.totalValue || 0;
            totalPaid += s.totalPaid || 0;
        }
    }
    const pct = totalValue > 0 ? ((totalPaid / totalValue) * 100).toFixed(1) : 0;
    return `
        <div class="pio-tree">
            <div class="pio-tree-title">${t('contracts') || 'Contratos'}</div>
            <div class="pio-tree-item"><span>${t('activeContracts') || 'Ativos'}: ${active.length}</span><span>${_fmtCurrency(totalValue)}</span></div>
            <div class="pio-tree-item"><span>${t('disbursed') || 'Desembolsado'}</span><span>${_fmtCurrency(totalPaid)} (${pct}%)</span></div>
        </div>`;
}

function _renderEvaBlock(eva: any) {
    if (!eva || eva.BAC <= 0) return '';
    return `
        <div class="pio-tree">
            <div class="pio-tree-title">EVA</div>
            <div class="pio-tree-item"><span>BAC</span><span>${_fmtCurrency(eva.BAC)}</span></div>
            <div class="pio-tree-item"><span>EAC</span><span>${_fmtCurrency(eva.EAC)}</span></div>
            <div class="pio-tree-item"><span>SPI</span><span>${eva.SPI?.toFixed(2) || '\u2014'}</span></div>
            <div class="pio-tree-item"><span>CPI</span><span>${eva.CPI?.toFixed(2) || '\u2014'}</span></div>
            <div class="pio-tree-item"><span>VAC</span><span>${_fmtCurrency(eva.VAC)}</span></div>
        </div>`;
}

function _renderIRMetrics() {
    let html = '';
    try {
        const elements = getAllElements() || [];
        html += _renderComplianceBlock(_countComplianceObservations(elements));
    } catch (e: any) {
        console.debug('[project] renderProjectIO-compliance:', e?.message || e);
    }
    try {
        const { getContracts, getContractFinancialSummary } = window._importedGov || _tryImportGov();
        if (getContracts) {
            html += _renderContractsBlock(getContracts(), getContractFinancialSummary);
        }
    } catch (e: any) {
        console.debug('[project] renderProjectIO-contracts:', e?.message || e);
    }
    try {
        const { calculateProjectEVA } = window._importedGov || _tryImportGov();
        if (calculateProjectEVA) {
            html += _renderEvaBlock(calculateProjectEVA());
        }
    } catch (e: any) {
        console.debug('[project] renderProjectIO-eva:', e?.message || e);
    }
    return html;
}
function _tryImportGov() {
    if (_govCache) return _govCache;
    try {
        // Tenta acessar funções já registradas no window (via handlers)
        if (window.handleAddContract) {
            // Governance handlers estão carregados - importar módulos sincronamente não é possível,
            // mas os dados são acessíveis via lazy import no próximo render
            import('../governance/contractManager.js' as string)
                .then((mod: any) => {
                    _govCache = mod;
                    window._importedGov = mod;
                })
                .catch((err: any) => console.warn('[handlers/project] import contractManager failed:', err));
            import('../governance/wbsManager.js' as string)
                .then((mod: any) => {
                    _govCache = { ..._govCache, ...mod };
                    window._importedGov = _govCache;
                })
                .catch((err: any) => console.warn('[handlers/project] import wbsManager failed:', err));
        }
    } catch (e: any) {
        console.debug('[project] tryImportGov-window-access:', e?.message || e);
        /* ignore */
    }
    return {};
}
// ---- TRANSACTION CARD ----
function _transactionStatusHtml(item: any) {
    const statusClass =
        item.status === 'completed'
            ? 'pio-status-done'
            : item.status === 'in_progress'
              ? 'pio-status-wip'
              : 'pio-status-planned';
    const statusLabel = t(item.status) || item.status;
    return `<span class="pio-status ${statusClass}">&#9679; ${escapeHtml(statusLabel)}</span>`;
}

function _transactionLinkedElementsHtml(item: any) {
    if (!item.linkedElementIds?.length) return '';
    const elements = getAllElements() || [];
    const names = item.linkedElementIds
        .map((id: any) => elements.find((e: any) => e.id === id))
        .filter(Boolean)
        .map((e: any) => escapeHtml(e.name || e.id));
    if (names.length === 0) return '';
    return `<div class="pio-card-links" data-cc-call-click="handleSelectElement|s:${encodeURIComponent(`${item.linkedElementIds[0]}`)}" style="cursor:pointer">&#128279; ${names.join(', ')}</div>`;
}

function _renderTransactionCard(item: any, type: any) {
    const categories = type === 'input' ? INPUT_CATEGORIES : OUTPUT_CATEGORIES;
    const catDef = (categories.find((c: any) => c.id === item.category) || {}) as any;
    const catLabel = t(item.category) || item.category;
    const removeHandler = type === 'input' ? 'handleRemoveCorporateInput' : 'handleRemoveCorporateOutput';
    const statusHtml = _transactionStatusHtml(item);
    const linkedHtml = _transactionLinkedElementsHtml(item);
    return `
        <div class="pio-card" data-pio-id="${item.id}">
            <div class="pio-card-header">
                <span class="pio-card-icon" data-icon="${catDef.icon || 'box'}" data-icon-size="14px"></span>
                <span class="pio-card-cat">${escapeHtml(catLabel)}</span>
                <div class="pio-card-actions">
                    <button class="btn btn-icon" data-cc-call-click="${removeHandler}|s:${encodeURIComponent(`${item.id}`)}" aria-label="Remove">
                        <span data-icon="x" data-icon-size="12px"></span>
                    </button>
                </div>
            </div>
            <div class="pio-card-desc">${escapeHtml(item.description)}</div>
            <div class="pio-card-calc">
                ${item.quantity} ${escapeHtml(item.unit)} \u00d7 ${_fmtCurrency(item.unitCost)} = <strong>${_fmtCurrency(item.totalCost)}</strong>
            </div>
            <div class="pio-card-meta">
                <span>${escapeHtml(item.supplier)}</span>
                <span>${item.date || ''}</span>
                ${item.invoiceRef ? `<span>NF: ${escapeHtml(item.invoiceRef)}</span>` : ''}
                ${statusHtml}
            </div>
            ${linkedHtml}
        </div>`;
}
function _renderTransactionForm(type: any) {
    const categories = type === 'input' ? INPUT_CATEGORIES : OUTPUT_CATEGORIES;
    const elements = getAllElements() || [];
    const campaigns = getAllCampaigns() || [];
    const submitHandler = type === 'input' ? 'handleSubmitCorporateInput' : 'handleSubmitCorporateOutput';
    const cancelHandler = 'handleCancelCIOForm';
    return `
        <div class="pio-form" id="pio-form-${type}">
            <div class="pio-form-row">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L1062" class="form-input pio-form-field" id="pio-${type}-category">
                    ${categories.map((c: any) => `<option value="${c.id}">${t(c.id) || c.id}</option>`).join('')}
                </select>
            </div>
            <div class="pio-form-row">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L1067" class="form-input pio-form-field" id="pio-${type}-description" type="text"
                       placeholder="${t('description')}">
            </div>
            <div class="pio-form-row pio-form-row-multi">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L1071" class="form-input pio-form-sm" id="pio-${type}-quantity" type="number" min="0" step="any"
                       placeholder="${t('quantity')}">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L1073" class="form-input pio-form-sm" id="pio-${type}-unit">
                    ${COMMON_UNITS.map((u: any) => `<option value="${u}">${u}</option>`).join('')}
                </select>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L1076" class="form-input pio-form-sm" id="pio-${type}-unitcost" type="number" min="0" step="any"
                       placeholder="${t('unitCost')}">
            </div>
            <div class="pio-form-row pio-form-row-multi">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L1080" class="form-input pio-form-sm" id="pio-${type}-date" type="date">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L1081" class="form-input pio-form-sm" id="pio-${type}-supplier" type="text"
                       placeholder="${type === 'input' ? t('supplier') : t('client')}">
            </div>
            <div class="pio-form-row pio-form-row-multi">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L1085" class="form-input pio-form-sm" id="pio-${type}-invoice" type="text"
                       placeholder="${t('invoiceRef')}">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L1087" class="form-input pio-form-sm" id="pio-${type}-status">
                    <option value="completed">${t('completed') || 'Concluído'}</option>
                    <option value="in_progress">${t('inProgress') || 'Em Andamento'}</option>
                    <option value="planned">${t('planned') || 'Planejado'}</option>
                </select>
            </div>
            ${
                elements.length > 0
                    ? `
            <div class="pio-form-row">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L1097" class="form-input pio-form-field" id="pio-${type}-elements" multiple size="3">
                    ${elements.map((e: any) => `<option value="${e.id}">${escapeHtml(e.name || e.id)} (${e.family || ''})</option>`).join('')}
                </select>
            </div>`
                    : ''
            }
            ${
                campaigns.length > 0
                    ? `
            <div class="pio-form-row">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L1107" class="form-input pio-form-field" id="pio-${type}-campaign">
                    <option value="">${t('noCampaign') || '— Sem campanha —'}</option>
                    ${campaigns.map((c: any) => `<option value="${c.id}">${escapeHtml(c.name || c.id)}</option>`).join('')}
                </select>
            </div>`
                    : ''
            }
            <div class="pio-form-actions">
                <button class="btn btn-sm btn-primary" data-cc-call-click="${submitHandler}">${t('save') || 'Salvar'}</button>
                <button class="btn btn-sm btn-secondary" data-cc-call-click="${cancelHandler}|s:${encodeURIComponent(`${type}`)}">${t('cancel') || 'Cancelar'}</button>
            </div>
        </div>`;
}
// ---- HANDLERS ----
export function handleToggleCIOSection(section: any) {
    _cioCollapsed[section] = !_cioCollapsed[section];
    safeSetItem(_CIO_COLLAPSED_KEY, JSON.stringify(_cioCollapsed));
    renderCorporateIO();
}
export function handleOpenCIOForm(type: any) {
    _cioFormOpen[type] = true;
    renderCorporateIO();
}
export function handleCancelCIOForm(type: any) {
    _cioFormOpen[type] = false;
    renderCorporateIO();
}
/** @param {any} type */
function _readFormData(type: any) {
    const val = (id: any) =>
        /** @type {any} */ (document.getElementById(`pio-${type}-${id}`))?.value?.trim() || '';
    const num = (id: any) =>
        parseFloat(/** @type {any} */ (document.getElementById(`pio-${type}-${id}`))?.value) || 0;
    const elSelect = (document.getElementById(`pio-${type}-elements`)) as any;
    const linkedElementIds = elSelect
        ? Array.from(elSelect.selectedOptions).map((o: any) => o.value)
        : [];
    return {
        category: val('category'),
        description: val('description'),
        quantity: num('quantity'),
        unit: val('unit') || 'un',
        unitCost: num('unitcost'),
        currency: getCurrency(),
        date: val('date'),
        supplier: val('supplier'),
        invoiceRef: val('invoice'),
        status: val('status') || 'completed',
        linkedElementIds,
        linkedCampaignId: val('campaign') || null,
        linkedContractId: null,
    };
}
export function handleSubmitCorporateInput() {
    const data = _readFormData('input');
    if (!data.description && !data.category) return;
    addCorporateInput(data);
    _cioFormOpen.input = false;
    renderCorporateIO();
}
export function handleSubmitCorporateOutput() {
    const data = _readFormData('output');
    if (!data.description && !data.category) return;
    addCorporateOutput(data);
    _cioFormOpen.output = false;
    renderCorporateIO();
}
export function handleRemoveCorporateInput(id: any) {
    removeCorporateInput(id);
    renderCorporateIO();
}
export function handleRemoveCorporateOutput(id: any) {
    removeCorporateOutput(id);
    renderCorporateIO();
}
// Model links (mantidos para retrocompatibilidade)
export async function handleAddInputLink() {
    const mid = await asyncPrompt(t('project.upstreamModelIdPrompt'));
    if (!mid) return;
    const name = (await asyncPrompt(t('project.nameOptionalPrompt'))) || '';
    addInputLink(mid.trim(), name, '');
    renderCorporateIO();
}
export async function handleAddOutputLink() {
    const mid = await asyncPrompt('Enter downstream Model ID:');
    if (!mid) return;
    const name = (await asyncPrompt('Name (optional):')) || '';
    addOutputLink(mid.trim(), name, '');
    renderCorporateIO();
}
export function handleRemoveInputLink(linkedModelId: any) {
    removeInputLink(linkedModelId);
    renderCorporateIO();
}
export function handleRemoveOutputLink(linkedModelId: any) {
    removeOutputLink(linkedModelId);
    renderCorporateIO();
}
// ----------------------------------------------------------------
// SHARED HELPER - Criação de boundary padrão com aerial overlay
// Usado por _initMapPickerMode, _initLastLocationMode e handleOpenMapPicker
// ----------------------------------------------------------------
/**
 * Cria ou atualiza um boundary 200x200m com imagem aérea no local especificado.
 * Reutilizado por todos os modos de inicialização baseados em localização.
 * Exibe dialogo de confirmacao se ja existir um boundary (exceto no modo update
 * ou quando skipConfirm=true para inicializacao automatica).
 *
 * @param {number} latitude - Latitude WGS84
 * @param {number} longitude - Longitude WGS84
 * @param {any} [options] - { halfW: 100, halfL: 100, update: false, skipConfirm: false }
 * @returns {Promise<string|null>} - ID do boundary criado/atualizado, ou null
 */
export async function createDefaultBoundary(latitude: any, longitude: any, options: any = {}) {
    const halfW = options.halfW || 100;
    const halfL = options.halfL || 100;
    try {
        const { buildOverlayUrls } = await import('../../core/io/geo/overlayUrls.js' as string);
        const { overlayUrl, overlayFallbackUrls } = await buildOverlayUrls(halfW, halfL);
        // Atualiza boundary existente se solicitado
        if (options.update) {
            const existingBoundary = getAllElements().find((e: any) => e.family === 'boundary');
            if (existingBoundary) {
                existingBoundary.data.overlayUrl = overlayUrl;
                existingBoundary.data.overlayFallbackUrls = overlayFallbackUrls;
                existingBoundary.data.sourceLat = latitude;
                existingBoundary.data.sourceLon = longitude;
                const mesh = getMeshByElementId(existingBoundary.id);
                if (mesh) {
                    const overlay = mesh.getObjectByName('overlay');
                    if (overlay && overlay.material) {
                        const { loadOverlayTexture } = await import('../../core/elements/meshFactory.js' as string);
                        loadOverlayTexture([overlayUrl, ...overlayFallbackUrls], overlay.material);
                    }
                }
                return existingBoundary.id;
            }
        }
        // Verifica boundary existente e pede confirmacao (exceto em init automatico)
        if (!options.skipConfirm) {
            // REF-SWEEPS RF-2: lazyImport (fail-soft, toast unico + retry na reconexao).
            // O import() cru aqui era capturado pelo try/catch da funcao, mas degradava
            // como falha DURA ("Failed to create boundary element") — o modulo ausente e
            // uma queda de dependencia, nao um erro de criacao de boundary.
            // Guard de CONSENTIMENTO: sem o dialogo, aborta (fail-closed).
            const mod = await lazyImport('../ui/boundaryConfirm.js', {
                importer: () => import('../ui/boundaryConfirm.js' as string),
            });
            if (!mod) return null;
            const { boundaryOverwriteGuard, BOUNDARY_ACTION } = mod;
            const { action, existingBoundary } = await boundaryOverwriteGuard();
            if (action === BOUNDARY_ACTION.CANCEL) {
                return null;
            }
            if (action === BOUNDARY_ACTION.REPLACE && existingBoundary) {
                removeElement(/** @type {BoundaryElementLike} */ (existingBoundary).id);
            }
            // KEEP_BOTH: prossegue sem remover - cria boundary adicional
        }
        // Cria novo boundary
        const boundaryId = `boundary-${nextElementCounter()}`;
        addElement('boundary', boundaryId, t('defaultBoundaryName') || 'Area de Estudo', {
            vertices: [
                { x: -halfW, y: 0, z: -halfL },
                { x: halfW, y: 0, z: -halfL },
                { x: halfW, y: 0, z: halfL },
                { x: -halfW, y: 0, z: halfL },
            ],
            type: 'study_area',
            overlayUrl,
            overlayFallbackUrls,
            overlayOpacity: 0.85,
            sourceLat: latitude,
            sourceLon: longitude,
        });
        return boundaryId;
    } catch (err: any) {
        log.error('Failed to create boundary element', err.message);
        return null;
    }
}
// ----------------------------------------------------------------
// PROJECT INITIALIZATION OPTIONS
// Controla como o projeto nasce: random completo ou em branco.
// Persistido em localStorage para ser lido no main.js antes de init.
// ----------------------------------------------------------------
const INIT_STORAGE_KEY = 'ecbyts-init-mode';
/**
 * Retorna a configuração de inicialização salva.
 * @returns {{ mode: 'random'|'blank'|'lastProject'|'mapPicker'|'lastLocation', autoTerrain: boolean, resumeOnRandom?: boolean }}
 */
export function getInitConfig() {
    try {
        const raw = localStorage.getItem(INIT_STORAGE_KEY) || '';
        if (raw) return JSON.parse(raw);
    } catch (e: any) {
        console.debug('[project] getInitConfig-parse:', e?.message || e);
        /* corrupted — use defaults */
    }
    return { mode: 'random', autoTerrain: false };
}
/**
 * Persiste a configuração de inicialização no localStorage.
 */
function _persistInitConfig(config: any) {
    safeSetItem(INIT_STORAGE_KEY, JSON.stringify(config));
}
/**
 * Handler chamado pelo select #init-mode ao mudar.
 * Exibe/oculta opções conforme o modo.
 */
export function handleInitModeChange() {
    const select = (document.getElementById('init-mode')) as any;
    const randomOpts = document.getElementById('init-random-options');
    const blankInfo = document.getElementById('init-blank-info');
    const lastProjectInfo = document.getElementById('init-lastproject-info');
    const mapPickerInfo = document.getElementById('init-mappicker-info');
    const lastLocationInfo = document.getElementById('init-lastlocation-info');
    if (!select) return;
    const mode = select.value;
    if (randomOpts) randomOpts.style.display = mode === 'random' ? '' : 'none';
    if (blankInfo) blankInfo.style.display = mode === 'blank' ? '' : 'none';
    if (lastProjectInfo) lastProjectInfo.style.display = mode === 'lastProject' ? '' : 'none';
    if (mapPickerInfo) mapPickerInfo.style.display = mode === 'mapPicker' ? '' : 'none';
    if (lastLocationInfo) lastLocationInfo.style.display = mode === 'lastLocation' ? '' : 'none';
    // Mostra preview das coordenadas salvas no modo lastLocation
    if (mode === 'lastLocation') {
        _updateLastLocationPreview();
    }
    _persistInitConfig(_readInitForm());
    // Acao imediata ao selecionar modo (sem esperar reload)
    _executeInitModeNow(mode);
}
/**
 * Update the preview of saved coordinates in the lastLocation info panel.
 * Mostra as coordenadas salvas no localStorage para o modo "Último Local".
 */
async function _updateLastLocationPreview() {
    const preview = document.getElementById('init-lastlocation-preview');
    if (!preview) return;
    try {
        const { getLastSavedOrigin, utmToWGS84 } = await import('../../core/io/geo/coordinates.js' as string);
        const saved = getLastSavedOrigin();
        if (saved) {
            const origin = (saved) as SavedOriginLike;
            const wgs = utmToWGS84({
                easting: origin.easting,
                northing: origin.northing,
                zone: Number(origin.zone),
                hemisphere: origin.hemisphere,
            });
            preview.innerHTML = `&#127919; Zona ${origin.zone}${origin.hemisphere} | ${wgs.latitude.toFixed(4)}°, ${wgs.longitude.toFixed(4)}°`;
            preview.style.color = 'var(--neutral-300)';
        } else {
            preview.innerHTML = `&#9888; ${t('initLastLocationEmpty') || 'No saved location found. Use Map Picker first.'}`;
            preview.style.color = 'var(--neutral-500)';
        }
    } catch (e: any) {
        console.debug('[project] renderInitPreview-utm-convert:', e?.message || e);
        preview.innerHTML = '';
    }
}
/**
 * Lê os valores do formulário de inicialização.
 */
function _readInitForm() {
    const mode = (document.getElementById('init-mode'))?.value || 'random';
    const autoTerrain = /** @type {any} */ (document.getElementById('init-auto-terrain'))?.checked ?? true;
    return { mode, autoTerrain };
}
/**
 * Restaura o formulário a partir do localStorage.
 * Chamado no init para sincronizar UI ↔ persistência.
 */
export function restoreInitForm() {
    const config = getInitConfig() as any;
    const modeSelect = (document.getElementById('init-mode')) as any;
    const autoTerrainCheck = (document.getElementById('init-auto-terrain')) as any;
    const randomOpts = document.getElementById('init-random-options');
    const blankInfo = document.getElementById('init-blank-info');
    const lastProjectInfo = document.getElementById('init-lastproject-info');
    const mapPickerInfo = document.getElementById('init-mappicker-info');
    const lastLocationInfo = document.getElementById('init-lastlocation-info');
    if (modeSelect) modeSelect.value = config.mode;
    if (autoTerrainCheck) autoTerrainCheck.checked = config.autoTerrain;
    if (randomOpts) randomOpts.style.display = config.mode === 'random' ? '' : 'none';
    if (blankInfo) blankInfo.style.display = config.mode === 'blank' ? '' : 'none';
    if (lastProjectInfo) lastProjectInfo.style.display = config.mode === 'lastProject' ? '' : 'none';
    if (mapPickerInfo) mapPickerInfo.style.display = config.mode === 'mapPicker' ? '' : 'none';
    if (lastLocationInfo) lastLocationInfo.style.display = config.mode === 'lastLocation' ? '' : 'none';
    // Mostra preview se o modo atual é lastLocation
    if (config.mode === 'lastLocation') {
        _updateLastLocationPreview();
    }
    // Listener para persistir ao alterar checkbox
    if (autoTerrainCheck) autoTerrainCheck.addEventListener('change', () => _persistInitConfig(_readInitForm()));
}
/**
 * Execute the selected init mode immediately (without reload).
 * Executa acao imediata ao selecionar modo no dropdown.
 *
 * @param {string} mode - Modo selecionado
 */
async function _executeInitModeNow(mode: any) {
    if (mode === 'mapPicker') {
        handleOpenMapPicker();
    }
    // lastProject e random requerem reload completo para funcionar corretamente
    // (geram modelo novo, limpam state, etc.) - nao executam sob demanda
}
/**
 * Open the map picker modal for selecting UTM origin.
 * Abre modal com mapa interativo para selecionar origem UTM.
 */
async function handleOpenMapPicker() {
    try {
        const { openMapPickerModal } = await import('../ui/mapPicker.js' as string);
        const result = await openMapPickerModal();
        if (result) {
            const { wgs84ToUTM, setOrigin } = await import('../../core/io/geo/coordinates.js' as string);
            const { buildOverlayUrls } = await import('../../core/io/geo/overlayUrls.js' as string);
            const utm = wgs84ToUTM({ latitude: result.latitude, longitude: result.longitude });
            const hemisphere = result.latitude < 0 ? 'S' : 'N';
            setOrigin({
                easting: utm.easting,
                northing: utm.northing,
                elevation: 0,
                zone: utm.zone,
                hemisphere,
            });
            // Atualiza campos na UI
            const oeEl = (document.getElementById('utm-origin-easting')) as any;
            const onEl = (document.getElementById('utm-origin-northing')) as any;
            const zoneEl = (document.getElementById('utm-zone')) as any;
            const hemiEl = (document.getElementById('utm-hemisphere')) as any;
            const latEl = (document.getElementById('origin-latitude')) as any;
            const lonEl = (document.getElementById('origin-longitude')) as any;
            if (oeEl) oeEl.value = utm.easting.toFixed(2);
            if (onEl) onEl.value = utm.northing.toFixed(2);
            if (zoneEl) zoneEl.value = utm.zone;
            if (hemiEl) hemiEl.value = hemisphere;
            if (latEl) latEl.value = result.latitude.toFixed(6);
            if (lonEl) lonEl.value = result.longitude.toFixed(6);
            // Cria ou atualiza boundary com imagem aerial do local selecionado
            const halfW = 100;
            const halfL = 100;
            const { overlayUrl, overlayFallbackUrls } = await buildOverlayUrls(halfW, halfL);
            const existingBoundary = getAllElements().find((e: any) => e.family === 'boundary');
            if (existingBoundary) {
                // Atualiza overlay do boundary existente
                existingBoundary.data.overlayUrl = overlayUrl;
                existingBoundary.data.overlayFallbackUrls = overlayFallbackUrls;
                existingBoundary.data.sourceLat = result.latitude;
                existingBoundary.data.sourceLon = result.longitude;
                // Recarrega textura no mesh 3D
                const mesh = getMeshByElementId(existingBoundary.id);
                if (mesh) {
                    const overlay = mesh.getObjectByName('overlay');
                    if (overlay && overlay.material) {
                        const { loadOverlayTexture } = await import('../../core/elements/meshFactory.js' as string);
                        loadOverlayTexture([overlayUrl, ...overlayFallbackUrls], overlay.material);
                    }
                }
            } else {
                // Cria boundary novo (200x200m)
                const boundaryId = `boundary-${nextElementCounter()}`;
                addElement('boundary', boundaryId, t('defaultBoundaryName') || 'Area de Estudo', {
                    vertices: [
                        { x: -halfW, y: 0, z: -halfL },
                        { x: halfW, y: 0, z: -halfL },
                        { x: halfW, y: 0, z: halfL },
                        { x: -halfW, y: 0, z: halfL },
                    ],
                    type: 'study_area',
                    overlayUrl,
                    overlayFallbackUrls,
                    overlayOpacity: 0.85,
                    sourceLat: result.latitude,
                    sourceLon: result.longitude,
                });
            }
            // Enquadra camera no boundary
            const { fitAllElements } = await import('../scene/controls.js' as string);
            fitAllElements();
            showToast(t('initMapOriginSet'), 'success');
        }
    } catch (err: any) {
        log.error('Map picker initialization failed', err.message);
    }
}
/**
 * Open the map picker in polygon drawing mode.
 * Abre modal com mapa para desenhar poligono de boundary.
 */
async function handleOpenMapPickerPolygon() {
    // Contrato camada-4 (BOOT-RESILIENCE-001#mais-mappicker-morto): o clique DEVE produzir
    // efeito observável imediato. O picker carrega engine de mapa via CDN (preflight 7s +
    // script 12s) antes de montar qualquer DOM — sem este toast síncrono, o botão parecia
    // morto durante o load (e p/ sempre, se a rede/CDN falhar silenciosamente).
    showToast(t('mapPickerOpening') || 'Opening map…', 'info');
    try {
        const { openMapPickerModal } = await import('../ui/mapPicker.js' as string);
        const geojson = await openMapPickerModal({ mode: 'polygon', maxVertices: 50 });
        if (geojson && geojson.type === 'Polygon') {
            handleCreateBoundaryFromPolygon(geojson);
        }
    } catch (err: any) {
        log.error('Polygon map picker failed', err.message);
        showToast(t('mapPickerPolygonError') || 'Failed to open polygon picker', 'error');
    }
}
/**
 * Create a boundary element from a GeoJSON Polygon.
 * Converte coordenadas WGS84 para metros relativos e cria boundary.
 * Exibe dialogo de confirmacao se ja existir um boundary no modelo.
 *
 * @param {{ type: string, coordinates: number[][][] }} geojson - GeoJSON Polygon
 */
async function handleCreateBoundaryFromPolygon(geojson: any) {
    if (!geojson || geojson.type !== 'Polygon' || !geojson.coordinates?.[0]) {
        showToast(t('mapPickerInvalidPolygon') || 'Invalid polygon data', 'error');
        return;
    }
    try {
        // Verifica boundary existente e pede confirmacao se necessario.
        // REF-SWEEPS RF-2: lazyImport (fail-soft). O import() cru caia no catch da
        // funcao e exibia "Failed to create boundary" — mensagem enganosa para o caso
        // "dependencia lazy indisponivel". Guard de CONSENTIMENTO: aborta (fail-closed).
        const mod = await lazyImport('../ui/boundaryConfirm.js', {
            importer: () => import('../ui/boundaryConfirm.js' as string),
        });
        if (!mod) return;
        const { boundaryOverwriteGuard, BOUNDARY_ACTION } = mod;
        const { action, existingBoundary } = await boundaryOverwriteGuard();
        if (action === BOUNDARY_ACTION.CANCEL) {
            return;
        }
        // Se Replace, remove o boundary existente antes de criar o novo
        if (action === BOUNDARY_ACTION.REPLACE && existingBoundary) {
            removeElement(/** @type {BoundaryElementLike} */ (existingBoundary).id);
        }
        const ring = geojson.coordinates[0];
        // Use centroid as origin
        const centroid = _polygonCentroid(ring);
        const { wgs84ToUTM, setOrigin, hasOrigin: checkOrigin } = await import('../../core/io/geo/coordinates.js' as string);
        const utmCenter = wgs84ToUTM({ latitude: centroid[1], longitude: centroid[0] });
        // Set origin if not already set
        if (!checkOrigin()) {
            const hemisphere = (centroid[1] as number) < 0 ? 'S' : 'N';
            setOrigin({
                easting: utmCenter.easting,
                northing: utmCenter.northing,
                elevation: 0,
                zone: utmCenter.zone,
                hemisphere,
            });
        }
        // Convert WGS84 ring to local meter-based vertices
        const vertices = _wgs84RingToLocalVertices(ring, utmCenter);
        const boundaryId = `boundary-${nextElementCounter()}`;
        addElement('boundary', boundaryId, t('defaultBoundaryName') || 'Area de Estudo', {
            vertices,
            type: 'study_area',
            geojson,
            sourceLat: centroid[1],
            sourceLon: centroid[0],
        });
        const { fitAllElements } = await import('../scene/controls.js' as string);
        fitAllElements();
        showToast(t('mapPickerPolygonCreated') || 'Boundary created from polygon', 'success');
    } catch (err: any) {
        log.error('Failed to create boundary from polygon', err.message);
        showToast(t('mapPickerPolygonError') || 'Failed to create boundary', 'error');
    }
}
/**
 * Calculate centroid of a closed ring.
 * @param {number[][]} ring - [lon, lat] pairs
 * @returns {number[]} - [lon, lat] centroid
 */
function _polygonCentroid(ring: any) {
    const n = ring.length - 1;
    let lonSum = 0,
        latSum = 0;
    for (let i = 0; i < n; i++) {
        lonSum += ring[i][0];
        latSum += ring[i][1];
    }
    return [lonSum / n, latSum / n];
}
/**
 * Convert WGS84 ring to local vertices (meters relative to UTM center).
 * @param {number[][]} ring - Closed [lon, lat] ring
 * @param {{ easting: number, northing: number }} _utmCenter - Reference UTM point
 * @returns {{ x: number, y: number, z: number }[]}
 */
function _wgs84RingToLocalVertices(ring: any, _utmCenter: any) {
    const vertices: any[] = [];
    const n = ring.length - 1;
    for (let i = 0; i < n; i++) {
        // Approximate conversion: 1 degree lat ~111320m, lon varies
        const latRad = (ring[i][1] * Math.PI) / 180;
        const dx = (ring[i][0] - ring[0][0]) * 111320 * Math.cos(latRad);
        const dz = (ring[i][1] - ring[0][1]) * 111320;
        vertices.push({ x: dx, y: 0, z: -dz });
    }
    return vertices;
}
/**
 * Reopen the welcome screen (from settings button).
 * Reabre a tela de boas-vindas sob demanda.
 */
async function handleShowWelcome() {
    try {
        const { resetWelcomePreference, showWelcomeScreen } = await import('../ui/welcomeScreen.js' as string);
        resetWelcomePreference();
        const chosenMode = await showWelcomeScreen();
        if (chosenMode === 'tour') {
            // Inicia tour do produto
            if (window.handleStartTour) window.handleStartTour();
        } else if (chosenMode === 'mapPicker') {
            handleOpenMapPicker();
        } else if (chosenMode) {
            // Persiste modo escolhido e recarrega para aplicar
            const config = _readInitForm();
            config.mode = chosenMode;
            _persistInitConfig(config);
            const modeSelect = (document.getElementById('init-mode')) as any;
            if (modeSelect) modeSelect.value = chosenMode;
            handleInitModeChange();
        }
    } catch (err: any) {
        log.error('Welcome screen initialization failed', err.message);
    }
}
// ----------------------------------------------------------------
// UTM ↔ LAT/LON CONVERSION
// Conversão bidirecional entre UTM e coordenadas geográficas
// ----------------------------------------------------------------
/**
 * Convert current UTM origin to Lat/Lon and show in the fields.
 * Converte a origem UTM para Lat/Lon decimal.
 */
async function handleConvertToLatLon() {
    const { utmToWGS84 } = await import('../../core/io/geo/coordinates.js' as string);
    const easting = parseFloat(/** @type {any} */ (document.getElementById('utm-origin-easting'))?.value) || 0;
    const northing = parseFloat(/** @type {any} */ (document.getElementById('utm-origin-northing'))?.value) || 0;
    const zone = parseInt(/** @type {any} */ (document.getElementById('utm-zone'))?.value, 10) || 23;
    const hemisphere = (document.getElementById('utm-hemisphere'))?.value || 'S';
    if (easting === 0 && northing === 0) return;
    const { latitude, longitude } = utmToWGS84({ easting, northing, zone, hemisphere }) as any;
    const latEl = (document.getElementById('origin-latitude')) as any;
    const lonEl = (document.getElementById('origin-longitude')) as any;
    if (latEl) latEl.value = latitude.toFixed(6);
    if (lonEl) lonEl.value = longitude.toFixed(6);
}
/**
 * Convert Lat/Lon to UTM and fill the origin fields.
 * Converte Lat/Lon decimal para UTM e preenche os campos de origem.
 */
function _parseLatLonInputs() {
    const latEl = (document.getElementById('origin-latitude')) as any;
    const lonEl = (document.getElementById('origin-longitude')) as any;
    let latRaw = (latEl?.value || '').trim();
    let lonRaw = (lonEl?.value || '').trim();
    if (latRaw && !lonRaw) {
        const parts = latRaw.split(/[;\s]+/).filter(Boolean);
        if (parts.length >= 2) {
            latRaw = parts[0];
            lonRaw = parts[1];
            if (lonEl) lonEl.value = lonRaw.replace(',', '.');
        }
    }
    const lat = parseFloat(latRaw.replace(',', '.'));
    const lon = parseFloat(lonRaw.replace(',', '.'));
    return { lat, lon, latEl, lonEl };
}

async function handleConvertToUTM() {
    const { wgs84ToUTM, setOrigin } = await import('../../core/io/geo/coordinates.js' as string);
    const { lat, lon, latEl, lonEl } = _parseLatLonInputs();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (latEl) latEl.value = lat.toFixed(6);
    if (lonEl) lonEl.value = lon.toFixed(6);
    const utm = wgs84ToUTM({ latitude: lat, longitude: lon });
    const eastingEl = (document.getElementById('utm-origin-easting')) as any;
    const northingEl = (document.getElementById('utm-origin-northing')) as any;
    const zoneEl = (document.getElementById('utm-zone')) as any;
    const hemiEl = (document.getElementById('utm-hemisphere')) as any;
    if (eastingEl) eastingEl.value = utm.easting.toFixed(2);
    if (northingEl) northingEl.value = utm.northing.toFixed(2);
    if (zoneEl) zoneEl.value = utm.zone;
    if (hemiEl) hemiEl.value = utm.hemisphere;
    setOrigin({
        easting: utm.easting,
        northing: utm.northing,
        zone: utm.zone,
        hemisphere: utm.hemisphere,
    });
}
function renderDocumentsList(nodeId: any, docs: any) {
    if (!docs || docs.length === 0) {
        return `<div class="area-docs-empty" style="font-size:11px; color:var(--neutral-500); margin:4px 0;">${t('noDocuments') || 'No documents yet'}</div>`;
    }
    const today = new Date().toISOString().slice(0, 10);
    return docs
        .map((doc: any) => {
            const docTypeDef = DOCUMENT_TYPES.find((d: any) => d.id === doc.docType);
            const typeLabel = docTypeDef ? docTypeDef.label : doc.docType;
            const hashShort = doc.fileHash ? doc.fileHash.slice(0, 12) + '...' : '';
            const sizeKB = doc.fileSize ? (doc.fileSize / 1024).toFixed(0) + ' KB' : '';
            const eid = escapeJsAttr(nodeId);
            const did = escapeJsAttr(doc.id);
            let expiryBadge = '';
            if (doc.expiresAt) {
                if (doc.expiresAt < today) {
                    expiryBadge = `<span class="area-doc-badge area-doc-badge--expired">${t('docExpired') || 'Expired'}</span>`;
                } else {
                    const daysLeft = Math.ceil(
                        (new Date(doc.expiresAt).getTime() - new Date(today).getTime()) / 86400000,
                    );
                    if (daysLeft <= 30) {
                        expiryBadge = `<span class="area-doc-badge area-doc-badge--warning">${t('docExpiresSoon') || 'Expires soon'}</span>`;
                    }
                }
            }
            return `
            <div class="area-doc-item">
                <div class="area-doc-header">
                    <span class="area-doc-name">${escapeHtml(doc.name)}</span>
                    ${expiryBadge}
                </div>
                <div class="area-doc-meta">
                    ${escapeHtml(typeLabel)}${doc.issuer ? ' | ' + escapeHtml(doc.issuer) : ''}${doc.issueDate ? ' | ' + doc.issueDate : ''}
                    ${doc.expiresAt ? ' &rarr; ' + doc.expiresAt : ''}
                </div>
                <div class="area-doc-hash">
                    SHA-256: <code>${escapeHtml(hashShort)}</code>${sizeKB ? ' | ' + sizeKB : ''}
                </div>
                <div class="area-doc-actions">
                    <button type="button" class="btn btn-xs btn-outline"
                            data-cc-call-click="handleVerifyDocument|s:${encodeURIComponent(`${eid}`)}|s:${encodeURIComponent(`${did}`)}">
                        ${getIcon('check', { size: '10px' })} ${t('verifyDocument') || 'Verify'}
                    </button>
                    <button type="button" class="btn btn-xs btn-danger"
                            data-cc-call-click="handleRemoveNodeDocument|s:${encodeURIComponent(`${eid}`)}|s:${encodeURIComponent(`${did}`)}">
                        ${getIcon('x', { size: '10px' })}
                    </button>
                </div>
            </div>`;
        })
        .join('');
}
/**
 * Render the add-document form (inline, collapsible).
 * Formulario para adicionar um novo documento ao no.
 *
 * @param {string} nodeId
 * @returns {string} HTML string
 */
function renderDocumentForm(nodeId: any) {
    const eid = escapeJsAttr(nodeId);
    const docTypeOptions = DOCUMENT_TYPES.map((d: any) => `<option value="${d.id}">${escapeHtml(d.label)}</option>`).join(
        '',
    );
    return `
        <div class="area-doc-form" id="doc-add-form">
            <div class="form-group" style="margin-bottom:4px;">
                <label class="form-label">${t('type') || 'Type'}</label>
                <select data-field-meta="true" data-field-meta-key="auto:doc-type-select" class="form-input" id="doc-type-select">${docTypeOptions}</select>
            </div>
            <div class="form-group" style="margin-bottom:4px;">
                <label class="form-label">${t('name') || 'Name'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:doc-name-input" type="text" class="form-input" id="doc-name-input" placeholder="${t('documentName') || 'Document name'}">
            </div>
            <div style="display:flex; gap:6px; margin-bottom:4px;">
                <div class="form-group" style="flex:1; margin-bottom:0;">
                    <label class="form-label">${t('docIssuer') || 'Issuer'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:doc-issuer-input" type="text" class="form-input" id="doc-issuer-input" placeholder="CETESB, Junta Comercial...">
                </div>
            </div>
            <div style="display:flex; gap:6px; margin-bottom:4px;">
                <div class="form-group" style="flex:1; margin-bottom:0;">
                    <label class="form-label">${t('docIssueDate') || 'Issue date'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:doc-issuedate-input" type="date" class="form-input" id="doc-issuedate-input">
                </div>
                <div class="form-group" style="flex:1; margin-bottom:0;">
                    <label class="form-label">${t('docExpiresAt') || 'Expires at'}</label>
                    <input data-field-meta="true" data-field-meta-key="auto:doc-expires-input" type="date" class="form-input" id="doc-expires-input">
                </div>
            </div>
            <div class="form-group" style="margin-bottom:4px;">
                <label class="form-label">${t('file') || 'File'} (SHA-256)</label>
                <input type="file" class="form-input" accept="*/*"
                       data-cc-change="cc-91fbe8d7">
                <span class="area-doc-hash-preview" id="doc-file-hash"></span>
            </div>
            <div class="form-group" style="margin-bottom:6px;">
                <label class="form-label">${t('docNotes') || 'Notes'}</label>
                <textarea data-field-meta="true" data-field-meta-key="auto:doc-notes-input" class="form-input" id="doc-notes-input" rows="2" style="resize:vertical;"></textarea>
            </div>
            <div style="display:flex; gap:6px;">
                <button type="button" class="btn btn-sm btn-primary"
                        data-cc-call-click="handleSaveNodeDocument|s:${encodeURIComponent(`${eid}`)}">
                    ${t('save') || 'Save'}
                </button>
                <button type="button" class="btn btn-sm btn-outline"
                        data-cc-call-click="handleAddNodeDocument|s:${encodeURIComponent(`${eid}`)}">
                    ${t('cancel') || 'Cancel'}
                </button>
            </div>
        </div>`;
}
/**
 * Render the detail panel for the selected area node.
 * Renderiza o painel de detalhes do no selecionado na arvore.
 * Inclui: nome, tipo, badges, registro fiscal, documentos, acoes CRUD.
 *
 * @param {string|null} node
 */
function _buildNodeIdentityHtml(node: any, eid: any) {
    const nodeTypeOptions = ['controller', 'area', 'subarea']
        .map((t2: any) =>
            `<option value="${t2}" ${node.type === t2 ? 'selected' : ''}>${t2.charAt(0).toUpperCase() + t2.slice(1)}</option>`,
        )
        .join('');
    const badgesStr = Array.isArray(node.badges) ? node.badges.join(', ') : '';
    return `
        <div class="form-group" style="margin-bottom: 6px;">
            <label class="form-label">${t('name') || 'Name'}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:project:input:L1983" type="text" class="form-input area-detail-name-input"
                   value="${escapeAttr(node.name)}"
                   data-cc-call-change="handleRenameAreaNode|s:${encodeURIComponent(`${eid}`)}|v">
        </div>
        <div style="display:flex; gap:8px; margin-bottom:8px;">
            <div class="form-group" style="flex:1; margin-bottom:0;">
                <label class="form-label">${t('type') || 'Type'}</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:project:select:L1990" class="form-input area-detail-type-select"
                        data-cc-call-change="handleChangeAreaNodeType|s:${encodeURIComponent(`${eid}`)}|v">
                    ${nodeTypeOptions}
                </select>
            </div>
            <div class="form-group" style="flex:1; margin-bottom:0;">
                <label class="form-label">Badges</label>
                <input type="text" class="form-input area-detail-badges-input"
                       value="${escapeAttr(badgesStr)}"
                       placeholder="Operacional, MRO..."
                       data-cc-call-change="handleChangeAreaNodeBadges|s:${encodeURIComponent(`${eid}`)}|v">
            </div>
        </div>`;
}

function _buildRegistrySectionHtml(
    node: any,
    eid: any,
    currentRegType: any,
    currentNumber: any,
    typeEntry: any,
) {
    const regTypeOptions = REGISTRY_TYPES.map((r: any) =>
        `<option value="${r.id}" ${r.id === currentRegType ? 'selected' : ''}>${escapeHtml(r.label)}</option>`,
    ).join('');
    const lgpdNotice = typeEntry.personal
        ? `<div class="area-registry-lgpd-notice">
            \u26A0 ${t('lgpdNotice') || 'CPF \u00e9 dado pessoal protegido pela LGPD. Armazene apenas com consentimento do titular.'}
        </div>`
        : '';
    return `
        <div class="form-group" style="margin-bottom: 6px;">
            <label class="form-label">${t('registryType') || 'Registry Type'}</label>
            <select data-field-meta="true" data-field-meta-key="auto:area-registry-type-select" class="form-input"
                    id="area-registry-type-select"
                    data-cc-call-change="handleAreaRegistryTypeChange|s:${encodeURIComponent(`${eid}`)}|v">
                ${regTypeOptions}
            </select>
        </div>
        ${lgpdNotice}
        <div class="form-group" style="margin-bottom: 8px;">
            <label class="form-label">${t('registryNumber') || 'Registry Number'}</label>
            <input data-field-meta="true" data-field-meta-key="auto:area-registry-number-input" type="text"
                   class="form-input"
                   id="area-registry-number-input"
                   placeholder="${escapeAttr(typeEntry.placeholder)}"
                   value="${escapeAttr(currentNumber)}"
                   data-cc-call-input="handleAreaRegistryInput|s:${encodeURIComponent(`${eid}`)}|v"
                   autocomplete="off">
            <span class="area-registry-validation" id="area-registry-validation"></span>
        </div>
        <button type="button"
                class="btn btn-primary btn-sm"
                data-cc-call-click="handleSaveNodeRegistry|s:${encodeURIComponent(`${eid}`)}">
            ${t('save') || 'Save'}
        </button>`;
}

function _buildCityInputHtml(location: any, eid: any, hasLazyData: boolean, hasMunicipalityList: boolean) {
    if (hasLazyData) {
        return `<div id="city-autocomplete-${eid}" style="font-size: 11px;"></div>`;
    }
    if (hasMunicipalityList) {
        const municipalities = getMunicipalitiesForState(location.country, location.state);
        const municipalityOptions = municipalities
            .map((m: any) => `<option value="${escapeAttr(m.name)}" ${location.city === m.name ? 'selected' : ''}>${escapeHtml(m.name)}</option>`)
            .join('');
        return `<select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L2073" class="form-input" style="font-size: 11px;"
                    id="location-city-${eid}"
                    data-cc-call-change="handleLocationCityChange|s:${encodeURIComponent(`${eid}`)}|v">
                <option value="">-- ${t('select') || 'Selecione'} --</option>
                ${municipalityOptions}
            </select>`;
    }
    return `<input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L2081" type="text" class="form-input" style="font-size: 11px;"
               id="location-city-${eid}"
               value="${escapeAttr(location.city)}"
               placeholder="${t('city') || 'Município'}"
               data-cc-call-change="handleLocationCityChange|s:${encodeURIComponent(`${eid}`)}|v">`;
}

function _buildCountryInputHtml(location: any, eid: any) {
    const selectedCountry = getCountryByCode(location.country);
    return `
        <div class="form-group" style="margin-bottom: 6px;">
            <label class="form-label" style="font-size: 10px;">${t('country') || 'País'}</label>
            <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L2041" type="text" 
                   class="form-input" 
                   style="font-size: 11px;"
                   id="location-country-search-${eid}"
                   value="${escapeAttr(location.country_name || (selectedCountry as any)?.name_pt || location.country)}"
                   placeholder="${t('search_country') || 'Buscar país...'}"
                   data-cc-call-input="handleLocationCountrySearch|s:${encodeURIComponent(`${eid}`)}|v"
                   list="country-list-${eid}">
            <datalist id="country-list-${eid}">
                ${SUPPORTED_COUNTRIES.map((c: any) => `<option value="${escapeAttr(c.name_pt)}" data-code="${c.code}">${escapeHtml(c.name_en)}</option>`).join('')}
            </datalist>
            <input type="hidden" id="location-country-${eid}" value="${escapeAttr(location.country)}">
        </div>`;
}

function _buildStateCityRowHtml(location: any, eid: any) {
    const states = getStatesForCountry(location.country);
    const stateOptions = states
        .map((s: any) => `<option value="${s.code}" ${location.state === s.code ? 'selected' : ''}>${escapeHtml(s.name)}</option>`)
        .join('');
    const hasMunicipalityList = getMunicipalitiesForState(location.country, location.state).length > 0;
    const hasLazyData = hasLazyMunicipalityData(location.country);
    const cityInputHtml = _buildCityInputHtml(location, eid, hasLazyData, hasMunicipalityList);
    return `
        <div style="display: flex; gap: 8px; margin-bottom: 6px;">
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 10px;">${t('state') || 'Estado'}</label>
                <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L2057" class="form-input" style="font-size: 11px;"
                        id="location-state-${eid}"
                        data-cc-call-change="handleLocationStateChange|s:${encodeURIComponent(`${eid}`)}|v">
                    <option value="">-- ${t('select') || 'Selecione'} --</option>
                    ${stateOptions}
                </select>
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 10px;">${t('city') || 'Município'}</label>
                ${cityInputHtml}
            </div>
        </div>`;
}

function _buildCityCodeHtml(location: any) {
    if (!location.city_code) return '';
    return `
        <div class="form-group" style="margin-bottom: 6px;">
            <label class="form-label" style="font-size: 10px;">${t('cityCode') || 'Código'}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:project:input:L2095" type="text" class="form-input" style="font-size: 11px;" readonly
                   value="${escapeAttr(location.city_code)}">
        </div>`;
}

function _buildNeighborhoodPostalRowHtml(location: any, eid: any) {
    return `
        <div style="display: flex; gap: 8px; margin-bottom: 6px;">
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 10px;">${t('neighborhood') || 'Bairro'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L2104" type="text" class="form-input" style="font-size: 11px;"
                       id="location-neighborhood-${eid}"
                       value="${escapeAttr(location.neighborhood)}"
                       placeholder="${t('neighborhood') || 'Bairro'}"
                       data-cc-call-change="handleLocationNeighborhoodChange|s:${encodeURIComponent(`${eid}`)}|v">
            </div>
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 10px;">${t('postalCode') || 'CEP'}</label>
                <input data-field-meta="true" data-field-meta-key="auto-tpl:project:input:L2112" type="text" class="form-input" style="font-size: 11px;"
                       id="location-postal-${eid}"
                       value="${escapeAttr(location.postal_code)}"
                       placeholder="${t('postalCode') || 'CEP'}"
                       data-cc-call-change="handleLocationPostalChange|s:${encodeURIComponent(`${eid}`)}|v">
            </div>
        </div>`;
}

function _buildTimezoneHtml(location: any, eid: any) {
    const timezones = getTimezonesForCountry(location.country);
    const timezoneOptions = timezones
        .map((tz: any) => `<option value="${tz}" ${location.timezone === tz ? 'selected' : ''}>${escapeHtml(tz)}</option>`)
        .join('');
    return `
        <div class="form-group" style="margin-bottom: 8px;">
            <label class="form-label" style="font-size: 10px;">Timezone</label>
            <select data-field-meta="true" data-field-meta-key="auto-tpl:project:select:L2121" class="form-input" style="font-size: 11px;"
                    id="location-timezone-${eid}"
                    data-cc-call-change="handleLocationTimezoneChange|s:${encodeURIComponent(`${eid}`)}|v">
                ${timezoneOptions}
            </select>
        </div>`;
}

function _buildLocationSectionHtml(node: any, eid: any, location: any) {
    return `
        <div class="area-location-section" style="margin-top: 12px; border-top: 1px solid var(--neutral-800); padding-top: 12px;">
            <div class="section-header" style="margin-bottom: 8px; cursor: pointer;"
                 data-cc-call-click="toggleLocationSection|s:${encodeURIComponent(`${eid}`)}">
                <span>${getIcon('map-pin', { size: '14px' })} ${t('location') || 'Localização Administrativa'}</span>
                <span id="location-chevron-${eid}" style="margin-left: auto;">${location._expanded ? '&#9660;' : '&#9654;'}</span>
            </div>
            <div id="location-content-${eid}" style="display: ${location._expanded ? 'block' : 'none'};">
                ${_buildCountryInputHtml(location, eid)}
                ${_buildStateCityRowHtml(location, eid)}
                ${_buildCityCodeHtml(location)}
                ${_buildNeighborhoodPostalRowHtml(location, eid)}
                ${_buildTimezoneHtml(location, eid)}
                <button type="button" class="btn btn-primary btn-sm"
                        data-cc-call-click="handleSaveNodeLocation|s:${encodeURIComponent(`${eid}`)}">
                    ${t('save') || 'Salvar Localização'}
                </button>
            </div>
        </div>`;
}
function _buildDocumentsSectionHtml(nodeId: any, node: any, eid: any) {
    const docs = Array.isArray(node.documents) ? node.documents : [];
    const docsHtml = renderDocumentsList(nodeId, docs);
    const docFormHtml = _docFormOpenForNode === nodeId ? renderDocumentForm(nodeId) : '';
    return `
        <div class="area-docs-section" style="margin-top: 12px;">
            <div class="section-header" style="margin-bottom:6px;">
                <span>${getIcon('file-new', { size: '14px' })} ${t('documents') || 'Documents'}</span>
            </div>
            ${docsHtml}
            ${docFormHtml}
            <button type="button" class="btn btn-sm btn-outline" style="margin-top:6px;"
                    data-cc-call-click="handleAddNodeDocument|s:${encodeURIComponent(`${eid}`)}">
                ${getIcon('plus', { size: '12px' })} ${t('addDocument') || 'Add document'}
            </button>
        </div>`;
}

function _buildResponsiblesHtml(node: any, eid: any) {
    return `
        <div class="area-responsibles-section" style="margin-top: 12px;">
            <div class="section-header" style="margin-bottom:6px;">
                <span>${t('eis.responsible_legal') ? '&#9679; ' : ''}${t('eis.responsible_legal') || 'Responsibles'}</span>
            </div>
            <div class="form-group" style="margin-bottom:4px;">
                <label class="form-label" style="font-size:10px">${t('eis.responsible_legal') || 'Legal Responsible'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:area-responsible-legal" type="text" class="form-input" style="font-size:11px"
                       id="area-responsible-legal"
                       placeholder="${t('eis.responsible_legal') || 'Legal Responsible'}"
                       value="${escapeAttr(node.responsibleLegal?.name || '')}"
                       data-cc-call-change="handleSaveNodeResponsible|s:${encodeURIComponent(`${eid}`)}|s:legal|v">
            </div>
            <div class="form-group" style="margin-bottom:4px;">
                <label class="form-label" style="font-size:10px">${t('eis.responsible_technical') || 'Technical Responsible'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:area-responsible-technical" type="text" class="form-input" style="font-size:11px"
                       id="area-responsible-technical"
                       placeholder="${t('eis.responsible_technical') || 'Technical Responsible'}"
                       value="${escapeAttr(node.responsibleTechnical?.name || '')}"
                       data-cc-call-change="handleSaveNodeResponsible|s:${encodeURIComponent(`${eid}`)}|s:technical|v">
            </div>
            <div class="form-group" style="margin-bottom:4px;">
                <label class="form-label" style="font-size:10px">${t('eis.responsible_data') || 'Data Responsible'}</label>
                <input data-field-meta="true" data-field-meta-key="auto:area-responsible-data" type="text" class="form-input" style="font-size:11px"
                       id="area-responsible-data"
                       placeholder="${t('eis.responsible_data') || 'Data Responsible'}"
                       value="${escapeAttr(node.responsibleData?.name || '')}"
                       data-cc-call-change="handleSaveNodeResponsible|s:${encodeURIComponent(`${eid}`)}|s:data|v">
            </div>
        </div>`;
}

function _buildNodeCrudActionsHtml(eid: any) {
    return `
        <div class="area-detail-actions" style="margin-top: 12px;">
            <button type="button" class="btn btn-sm btn-outline"
                    data-cc-call-click="handleAddAreaNode|s:${encodeURIComponent(`${eid}`)}">
                ${getIcon('plus', { size: '12px' })} ${t('addChildNode') || 'Add child'}
            </button>
            <button type="button" class="btn btn-sm btn-outline"
                    data-cc-call-click="handleMoveAreaNode|s:${encodeURIComponent(`${eid}`)}|s:up"
                    title="${t('moveUp') || 'Move up'}">
                &#9650;
            </button>
            <button type="button" class="btn btn-sm btn-outline"
                    data-cc-call-click="handleMoveAreaNode|s:${encodeURIComponent(`${eid}`)}|s:down"
                    title="${t('moveDown') || 'Move down'}">
                &#9660;
            </button>
            <button type="button" class="btn btn-sm btn-danger"
                    data-cc-call-click="handleRemoveAreaNode|s:${encodeURIComponent(`${eid}`)}">
                ${getIcon('x', { size: '12px' })} ${t('removeNode') || 'Remove'}
            </button>
        </div>`;
}

function renderAreaNodeDetail(nodeId: any) {
    const panel = document.getElementById('areas-tree-detail');
    if (!panel) return;
    if (!nodeId) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) {
        panel.innerHTML = '';
        panel.style.display = 'none';
        return;
    }
    panel.style.display = '';
    const eid = escapeJsAttr(nodeId);
    const location = node.location || { ...DEFAULT_LOCATION };
    const currentRegType = node.registryType || 'cnpj';
    const currentNumber = node.registryNumber || '';
    const typeEntry = (REGISTRY_TYPES.find((r: any) => r.id === currentRegType) || REGISTRY_TYPES[0]) as any;
    panel.innerHTML = `
        <div class="area-registry-panel">
            ${_buildNodeIdentityHtml(node, eid)}
            ${_buildRegistrySectionHtml(node, eid, currentRegType, currentNumber, typeEntry)}
            ${_buildLocationSectionHtml(node, eid, location)}
            ${_buildDocumentsSectionHtml(nodeId, node, eid)}
            ${_buildResponsiblesHtml(node, eid)}
            ${_buildNodeCrudActionsHtml(eid)}
        </div>
    `;
    if (hasLazyMunicipalityData(location.country)) {
        setTimeout(() => {
            initMunicipalityAutocomplete(eid, location);
        }, 0);
    }
}
function initMunicipalityAutocomplete(eid: any, location: any) {
    const containerId = `city-autocomplete-${eid}`;
    const container = document.getElementById(containerId);
    if (!container) return;
    // Limpa autocomplete anterior se existir
    if (window._municipalityAutocompletes?.[eid]) {
        window._municipalityAutocompletes[eid].destroy();
    }
    // Cria novo autocomplete
    const autocomplete = new /** @type {any} */ (MunicipalityAutocomplete)(containerId, {
        placeholder: t('cityPlaceholder') || 'Digite para buscar cidade...',
        maxResults: 10,
        minChars: 2,
        onSelect: (municipality: any) => {
            handleLocationCitySelect(eid, municipality);
        },
        onClear: () => {
            handleLocationCitySelect(eid, null);
        },
    });
    // Define localização
    if (location.country && location.state) {
        autocomplete.setLocation(location.country, location.state);
    }
    // Define valor atual se existir
    if (location.city) {
        autocomplete.setValue({
            nome: location.city,
            codigo_ibge: location.city_code || '',
        });
    }
    // Armazena referência
    if (!window._municipalityAutocompletes) {
        window._municipalityAutocompletes = {};
    }
    window._municipalityAutocompletes[eid] = autocomplete;
}
/**
 * Handle municipality selection from autocomplete
 * @param {string} nodeId
 * @param {any|null} municipality
 */
function handleLocationCitySelect(nodeId: any, municipality: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    node.location = {
        ...node.location,
        city: municipality?.nome || '',
        city_code: municipality?.codigo_ibge || '',
        city_normalized: municipality?.nome_normalizado || municipality?.nome || '',
        _expanded: true,
    };
    // Re-renderiza para mostrar/esconder o campo de código
    const panel = document.getElementById(`area-registry-panel-${nodeId}`);
    if (panel) {
        const detail = panel.querySelector('.area-registry-detail');
        if (detail) {
            renderAreaNodeDetail(nodeId);
        }
    }
}
// ----------------------------------------------------------------
// REGISTRY HANDLERS - Interacao com o painel de cadastro fiscal
// ----------------------------------------------------------------
/**
 * Handle registry type selection change in the detail panel.
 * Atualiza placeholder e limpa o campo numero ao trocar o tipo.
 *
 * @param {string} nodeId
 * @param {string} newType
 */
export function handleAreaRegistryTypeChange(nodeId: any, newType: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    // Atualiza dados do no antes de re-renderizar
    node.registryType = newType;
    node.registryNumber = '';
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
}
/**
 * Live-format registry input with mask and show validation status.
 * Formata em tempo real e exibe validacao.
 *
 * @param {string} nodeId
 * @param {string} rawValue
 */
export function handleAreaRegistryInput(nodeId: any, rawValue: any) {
    const typeSelect = (document.getElementById('area-registry-type-select')) as any;
    const input = (document.getElementById('area-registry-number-input')) as any;
    const validation = document.getElementById('area-registry-validation');
    if (!typeSelect || !input) return;
    const type = typeSelect.value;
    const masked = applyRegistryMask(type, rawValue);
    if (input.value !== masked) {
        const pos = input.selectionStart;
        const diff = masked.length - input.value.length;
        input.value = masked;
        try {
            input.setSelectionRange(pos + diff, pos + diff);
        } catch (err: any) {
            log.debug('Selection range adjustment ignored', err?.message);
        }
    }
    if (validation) {
        const result = validateRegistry(type, masked);
        validation.textContent = result.valid ? '' : t(result.message) || result.message;
        validation.className = `area-registry-validation ${result.valid ? '' : 'area-registry-validation--error'}`;
    }
}
/**
 * Save registry data to the node in areasTreeData.
 * Salva tipo e numero de registro no no da arvore.
 *
 * @param {string} nodeId
 */
export function handleSaveNodeRegistry(nodeId: any) {
    const typeSelect = (document.getElementById('area-registry-type-select')) as any;
    const input = (document.getElementById('area-registry-number-input')) as any;
    if (!typeSelect || !input) return;
    const type = typeSelect.value;
    const value = input.value.trim();
    const result = validateRegistry(type, value);
    if (!result.valid && value) {
        showToast(t(result.message) || 'Invalid registry number', 'warning');
        return;
    }
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    node.registryType = type;
    node.registryNumber = value;
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
    showToast(t('registrySaved') || 'Registry saved', 'success');
}
// ----------------------------------------------------------------
// LOCATION HANDLERS - Localização administracional do nó
// ----------------------------------------------------------------
/**
 * Toggle location section visibility.
 * @param {string} nodeId
 */
export function toggleLocationSection(nodeId: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    if (!node.location) {
        node.location = { ...DEFAULT_LOCATION };
    }
    node.location._expanded = !node.location._expanded;
    renderAreaNodeDetail(nodeId);
}
/**
 * Handle country change - updates state list and timezone.
 * @param {string} nodeId
 * @param {string} searchValue
 */
export function handleLocationCountrySearch(nodeId: any, searchValue: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    // Encontra país pelo nome (português ou inglês)
    const country = SUPPORTED_COUNTRIES.find(
        (c: any) =>
            c.name_pt.toLowerCase() === searchValue.toLowerCase() ||
            c.name_en.toLowerCase() === searchValue.toLowerCase() ||
            c.code.toLowerCase() === searchValue.toLowerCase(),
    );
    if (!country) return; // Aguarda seleção válida
    // Atualiza o campo hidden com o código
    const hiddenInput = (document.getElementById(`location-country-${escapeJsAttr(nodeId)}`)) as any;
    if (hiddenInput) hiddenInput.value = country.code;
    // Dispara a mudança de país
    handleLocationCountryChange(nodeId, country.code);
}
export function handleLocationCountryChange(nodeId: any, countryCode: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    const country = SUPPORTED_COUNTRIES.find((c: any) => c.code === countryCode);
    if (!country) return;
    node.location = {
        ...DEFAULT_LOCATION,
        country: countryCode,
        country_name: country.name_pt,
        state: '',
        state_name: '',
        city: '',
        city_code: '',
        neighborhood: node.location?.neighborhood || '',
        postal_code: node.location?.postal_code || '',
        timezone: getDefaultTimezone(countryCode, ''),
        _expanded: true,
    };
    renderAreaNodeDetail(nodeId);
    // Limpa autocomplete anterior se existir
    if (window._municipalityAutocompletes?.[nodeId]) {
        window._municipalityAutocompletes[nodeId].destroy();
        delete window._municipalityAutocompletes[nodeId];
    }
}
/**
 * Handle state change - updates municipality list and timezone.
 * @param {string} nodeId
 * @param {string} stateCode
 */
export function handleLocationStateChange(nodeId: any, stateCode: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    const states = getStatesForCountry(node.location?.country || 'BR');
    const state = states.find((s: any) => s.code === stateCode);
    node.location = {
        ...node.location,
        state: stateCode,
        state_name: state?.name || stateCode,
        city: '',
        city_code: '',
        timezone: state?.timezone || getDefaultTimezone(node.location?.country || 'BR', stateCode),
        _expanded: true,
    };
    renderAreaNodeDetail(nodeId);
    // Atualiza autocomplete se estiver usando lazy data
    if (hasLazyMunicipalityData(node.location?.country)) {
        setTimeout(() => {
            const autocomplete = window._municipalityAutocompletes?.[nodeId];
            if (autocomplete) {
                autocomplete.setLocation(node.location.country, stateCode);
            }
        }, 50);
    }
}
/**
 * Handle city/municipality change.
 * @param {string} nodeId
 * @param {string} cityName
 */
export function handleLocationCityChange(nodeId: any, cityName: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    const municipalities = getMunicipalitiesForState(node.location?.country || 'BR', node.location?.state || '');
    const municipality = municipalities.find((m: any) => m.name === cityName);
    node.location = {
        ...node.location,
        city: cityName,
        city_code: municipality?.code || '',
        _expanded: true,
    };
    renderAreaNodeDetail(nodeId);
}
/**
 * Handle neighborhood change.
 * @param {string} nodeId
 * @param {string} value
 */
export function handleLocationNeighborhoodChange(nodeId: any, value: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node || !node.location) return;
    node.location.neighborhood = value;
}
/**
 * Handle postal code change.
 * @param {string} nodeId
 * @param {string} value
 */
export function handleLocationPostalChange(nodeId: any, value: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node || !node.location) return;
    node.location.postal_code = value;
}
/**
 * Handle timezone change.
 * @param {string} nodeId
 * @param {string} timezone
 */
export function handleLocationTimezoneChange(nodeId: any, timezone: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node || !node.location) return;
    node.location.timezone = timezone;
}
/**
 * Save location data to the node.
 * @param {string} nodeId
 */
function _readLocationInputs(nodeId: any) {
    const eid = escapeJsAttr(nodeId);
    return {
        country: (document.getElementById(`location-country-${eid}`)) as any,
        state: (document.getElementById(`location-state-${eid}`)) as any,
        city: (document.getElementById(`location-city-${eid}`)) as any,
        neighborhood: (document.getElementById(`location-neighborhood-${eid}`)) as any,
        postal: (document.getElementById(`location-postal-${eid}`)) as any,
        timezone: (document.getElementById(`location-timezone-${eid}`)) as any,
    };
}

function _lookupCountryName(code: any) {
    const country = SUPPORTED_COUNTRIES.find((c: any) => c.code === code);
    return (country as any)?.name || country?.name_pt || country?.name_en || code;
}

function _updateNodeLocationFromInputs(node: any, inputs: any) {
    if (inputs.country) {
        node.location.country = inputs.country.value;
        node.location.country_name = _lookupCountryName(inputs.country.value);
    }
    if (inputs.state) {
        const states = getStatesForCountry(node.location.country);
        const state = states.find((s: any) => s.code === inputs.state.value);
        node.location.state = inputs.state.value;
        node.location.state_name = state?.name || inputs.state.value;
    }
    if (inputs.city) {
        const municipalities = getMunicipalitiesForState(node.location.country, node.location.state);
        const municipality = municipalities.find((m: any) => m.name === inputs.city.value);
        node.location.city = inputs.city.value;
        node.location.city_code = municipality?.code || '';
    }
    if (inputs.neighborhood) node.location.neighborhood = inputs.neighborhood.value;
    if (inputs.postal) node.location.postal_code = inputs.postal.value;
    if (inputs.timezone) node.location.timezone = inputs.timezone.value;
}

export function handleSaveNodeLocation(nodeId: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    if (!node.location) {
        node.location = { ...DEFAULT_LOCATION };
    }
    const inputs = _readLocationInputs(nodeId);
    _updateNodeLocationFromInputs(node, inputs);
    if (!node.location.country || !node.location.state || !node.location.city) {
        showToast(t('locationRequiredFields') || 'País, Estado e Município são obrigatórios', 'warning');
        return;
    }
    if (node.location.postal_code && !isValidPostalCode(node.location.country, node.location.postal_code)) {
        showToast(t('invalidPostalCode') || 'Código postal inválido', 'warning');
        return;
    }
    delete node.location._expanded;
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
    showToast(t('locationSaved') || 'Localização salva', 'success');
}
function collectDescendantIds(node: any) {
    const ids = [node.id];
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            ids.push(...collectDescendantIds(child));
        }
    }
    return ids;
}
/**
 * Remove a node from the tree by ID. Returns removed node IDs.
 * Remove um no da arvore. Retorna lista de IDs removidos.
 *
 * @param {string} nodeId
 * @param {Array<any>} tree - Mutable tree array
 * @returns {string[]} IDs of removed nodes
 */
function removeNodeFromTree(nodeId: any, tree: any): any {
    for (let i = 0; i < tree.length; i++) {
        if (tree[i].id === nodeId) {
            const removedIds = collectDescendantIds(tree[i]);
            tree.splice(i, 1);
            return removedIds;
        }
        if (Array.isArray(tree[i].children)) {
            const removedIds = removeNodeFromTree(nodeId, tree[i].children);
            if (removedIds.length > 0) return removedIds;
        }
    }
    return [];
}
/**
 * Add a new child node (or root node if parentId is null).
 * Adiciona um no filho ao no selecionado, ou um no raiz.
 *
 * @param {string|null} parentId - Parent node ID, or null for root
 */
export function handleAddAreaNode(parentId: any) {
    if (!Array.isArray(window.areasTreeData)) {
        window.areasTreeData = [];
    }
    const isRoot = !parentId;
    const newNode = {
        id: generateId('area'),
        name: t('newNodeName') || 'New Node',
        type: isRoot ? 'controller' : 'subarea',
        badges: [],
        expanded: false,
        children: [],
    };
    if (isRoot) {
        window.areasTreeData.push(newNode);
    } else {
        const parent = findNodeById(parentId, window.areasTreeData);
        if (!parent) return;
        if (!Array.isArray(parent.children)) parent.children = [];
        parent.children.push(newNode);
        // Expande o pai para mostrar o novo filho
        if (!window.areasTreeExpanded) window.areasTreeExpanded = new Set();
        window.areasTreeExpanded.add(parentId);
    }
    // Seleciona o novo no
    window.activeAreaNodeId = newNode.id;
    renderAreasTree();
    renderAreaNodeDetail(newNode.id);
    showToast(t('addChildNode') || 'Node added', 'success');
}
/**
 * Remove a node and its descendants from the tree.
 * Remove um no e todos os filhos. Desvincula elementos orfaos.
 *
 * @param {string} hasChildren
 */
function _buildRemoveNodeConfirmMessage(hasChildren: boolean) {
    if (hasChildren) {
        return `${t('confirmRemoveNode') || 'Remove this node?'}\n${t('confirmRemoveNodeChildren') || 'Children will also be removed.'}`;
    }
    return t('confirmRemoveNode') || 'Remove this node?';
}

function _unlinkOrphanElementsFromTree(removedIds: string[]) {
    const elements = getAllElements() || [];
    for (const el of elements) {
        if (el.data?.areaId && removedIds.includes(el.data.areaId)) {
            el.data.areaId = '';
        }
    }
}

export async function handleRemoveAreaNode(nodeId: any) {
    if (!Array.isArray(window.areasTreeData)) return;
    const node = findNodeById(nodeId, window.areasTreeData);
    if (!node) return;
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    if (!(await asyncConfirm(_buildRemoveNodeConfirmMessage(hasChildren)))) return;
    const removedIds = removeNodeFromTree(nodeId, window.areasTreeData);
    _unlinkOrphanElementsFromTree(removedIds);
    if (window.activeAreaNodeId && removedIds.includes(window.activeAreaNodeId)) {
        window.activeAreaNodeId = null;
    }
    renderAreasTree();
    renderAreaNodeDetail(window.activeAreaNodeId);
    clearElementHighlights();
    showToast(t('removeNode') || 'Node removed', 'info');
}
export function handleRenameAreaNode(nodeId: any, newName: any) {
    const name = (newName || '').trim();
    if (!name) return;
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    node.name = name;
    renderAreasTree();
}
/**
 * Change the type of a tree node (controller/area/subarea).
 * Altera o tipo do no, afetando seu icone na arvore.
 *
 * @param {string} nodeId
 * @param {string} newType
 */
export function handleChangeAreaNodeType(nodeId: any, newType: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    node.type = newType;
    renderAreasTree();
}
/**
 * Update badges for a tree node from comma-separated input.
 * Atualiza os badges de um no a partir de entrada separada por virgula.
 *
 * @param {string} nodeId
 * @param {string} badgesStr - Comma-separated badge labels
 */
export function handleChangeAreaNodeBadges(nodeId: any, badgesStr: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    node.badges = (badgesStr || '')
        .split(',')
        .map((b: any) => b.trim())
        .filter(Boolean);
    renderAreasTree();
}
/**
 * Find the parent array that contains a given node, with its index.
 * Encontra o array-pai e o indice de um no na arvore.
 *
 * @param {string} nodeId
 * @param {Array<any>} tree
 * @returns {{ array: Array<any>, index: number }|null}
 */
function findParentArray(nodeId: any, tree: any): any {
    for (let i = 0; i < tree.length; i++) {
        if (tree[i].id === nodeId) return { array: tree, index: i };
        if (Array.isArray(tree[i].children)) {
            const found = findParentArray(nodeId, tree[i].children);
            if (found) return found;
        }
    }
    return null;
}
/**
 * Move a tree node up or down within its sibling list.
 * Reordena um no da arvore (troca posicao com vizinho).
 *
 * @param {string} nodeId - Node ID to move
 * @param {string} direction - 'up' or 'down'
 */
export function handleMoveAreaNode(nodeId: any, direction: any) {
    if (!Array.isArray(window.areasTreeData)) return;
    const loc = findParentArray(nodeId, window.areasTreeData);
    if (!loc) return;
    const { array, index } = loc;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= array.length) return;
    // Swap
    [array[index], array[targetIndex]] = [array[targetIndex], array[index]];
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
}
// ----------------------------------------------------------------
// DOCUMENTS - Documentos/intangiveis vinculados aos nos
// Cada no pode ter documentos comprobatorios (contrato social,
// alvara, licenca ambiental) com hash SHA-256 para integridade.
// ----------------------------------------------------------------
/** @type {string|null} ID do no com formulario de documento aberto */
let _docFormOpenForNode: any = null;
/**
 * Toggle the add-document form for a node.
 * Abre ou fecha o formulario de adicao de documento.
 *
 * @param {string} nodeId
 */
export function handleAddNodeDocument(nodeId: any) {
    _docFormOpenForNode = _docFormOpenForNode === nodeId ? null : nodeId;
    renderAreaNodeDetail(nodeId);
}
/**
 * Handle file selection for document hash calculation.
 * Calcula SHA-256 do arquivo selecionado (nao armazena o arquivo).
 *
 * @param {any} event - Input file change event
 */
export function handleDocFileSelected(event: any) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const hashDisplay = document.getElementById('doc-file-hash');
    const nameInput = (document.getElementById('doc-name-input')) as any;
    if (hashDisplay) hashDisplay.textContent = '...';
    // Auto-fill nome se vazio
    if (nameInput && !nameInput.value.trim()) {
        nameInput.value = file.name.replace(/\.[^.]+$/, '');
    }
    // Armazena metadados do arquivo no dataset do form
    const form = document.getElementById('doc-add-form');
    if (form) {
        form.dataset.fileName = file.name;
        form.dataset.fileSize = file.size;
    }
    const reader = new FileReader();
    reader.onload = async () => {
        try {
            const buffer = (reader.result) as ArrayBuffer;
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map((b: any) => b.toString(16).padStart(2, '0')).join('');
            if (hashDisplay) hashDisplay.textContent = hashHex.slice(0, 16) + '...';
            if (form) form.dataset.fileHash = hashHex;
        } catch (err: any) {
            log.error('SHA-256 hash computation failed', err.message);
            if (hashDisplay) hashDisplay.textContent = 'Error';
        }
    };
    reader.readAsArrayBuffer(file);
}
/**
 * Save the new document to the node.
 * Salva o documento preenchido no no da arvore.
 *
 * @param {string} nodeId
 */
function _readDocumentFormInputs() {
    return {
        form: document.getElementById('doc-add-form'),
        nameInput: (document.getElementById('doc-name-input')) as any,
        typeSelect: (document.getElementById('doc-type-select')) as any,
        issuerInput: (document.getElementById('doc-issuer-input')) as any,
        issueDateInput: (document.getElementById('doc-issuedate-input')) as any,
        expiresInput: (document.getElementById('doc-expires-input')) as any,
        notesInput: (document.getElementById('doc-notes-input')) as any,
    };
}

function _createDocumentObject(inputs: any, name: any, fileHash: any) {
    return {
        id: generateId('doc'),
        name,
        docType: inputs.typeSelect?.value || 'other',
        issuer: (inputs.issuerInput?.value || '').trim(),
        issueDate: inputs.issueDateInput?.value || '',
        expiresAt: inputs.expiresInput?.value || null,
        fileHash,
        fileName: inputs.form.dataset.fileName || '',
        fileSize: parseInt(inputs.form.dataset.fileSize || '0') || 0,
        notes: (inputs.notesInput?.value || '').trim(),
    };
}

function _validateAndBuildDocument(inputs: any) {
    if (!inputs.form || !inputs.nameInput) {
        return { valid: false, error: '', doc: null };
    }
    const name = (inputs.nameInput.value || '').trim();
    if (!name) {
        return { valid: false, error: t('docNameRequired') || 'Document name is required', doc: null };
    }
    const fileHash = inputs.form.dataset.fileHash || '';
    if (!fileHash) {
        return { valid: false, error: t('docFileRequired') || 'Select a file to calculate hash', doc: null };
    }
    return { valid: true, error: '', doc: _createDocumentObject(inputs, name, fileHash) };
}
export function handleSaveNodeDocument(nodeId: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    const inputs = _readDocumentFormInputs();
    const { valid, error, doc } = _validateAndBuildDocument(inputs);
    if (!valid) {
        showToast(error, 'warning');
        return;
    }
    if (!Array.isArray(node.documents)) node.documents = [];
    node.documents.push(doc);
    _docFormOpenForNode = null;
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
    showToast(t('addDocument') || 'Document added', 'success');
}
export function handleRemoveNodeDocument(nodeId: any, docId: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node || !Array.isArray(node.documents)) return;
    node.documents = node.documents.filter((d: any) => d.id !== docId);
    renderAreasTree();
    renderAreaNodeDetail(nodeId);
    showToast(t('removeDocument') || 'Document removed', 'info');
}
/**
 * Verify document integrity by comparing file hash.
 * Abre file picker, calcula SHA-256, compara com o hash armazenado.
 *
 * @param {string} nodeId
 * @param {string} docId
 */
export function handleVerifyDocument(nodeId: any, docId: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node || !Array.isArray(node.documents)) return;
    const doc = node.documents.find((d: any) => d.id === docId);
    if (!doc || !doc.fileHash) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.onchange = async (event: any) => {
        const file = event?.target?.files?.[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map((b: any) => b.toString(16).padStart(2, '0')).join('');
            if (hashHex === doc.fileHash) {
                showToast(t('hashMatch') || 'File integrity verified', 'success');
            } else {
                showToast(t('hashMismatch') || 'Hash mismatch - file may have been altered', 'error');
            }
        } catch (err: any) {
            log.error('Document hash verification failed', err.message);
            showToast('Verification failed', 'error');
        }
    };
    input.click();
}
// ----------------------------------------------------------------
// 3D HIGHLIGHT - Destaque visual de elementos vinculados ao no
// ----------------------------------------------------------------
/**
 * Highlight elements linked to the selected tree node.
 * Elementos vinculados ficam opacos, demais ficam semitransparentes.
 *
 * @param {string} nodeId
 */
function highlightLinkedElements(nodeId: any) {
    const elements = getAllElements() || [];
    if (elements.length === 0) return;
    for (const el of elements) {
        const mesh = getMeshByElementId(el.id);
        if (!mesh?.material) continue;
        // Salva opacidade original se ainda nao foi salva
        if (mesh.material._origOpacity === undefined) {
            mesh.material._origOpacity = mesh.material.opacity;
            mesh.material._origTransparent = mesh.material.transparent;
        }
        if (el.data?.areaId === nodeId) {
            mesh.material.opacity = mesh.material._origOpacity;
            mesh.material.transparent = mesh.material._origTransparent;
        } else {
            mesh.material.opacity = 0.15;
            mesh.material.transparent = true;
        }
        mesh.material.needsUpdate = true;
    }
}
/**
 * Clear all element highlights and restore original opacity.
 * Restaura a opacidade original de todos os elementos.
 */
function clearElementHighlights() {
    const elements = getAllElements() || [];
    for (const el of elements) {
        const mesh = getMeshByElementId(el.id);
        if (!mesh?.material) continue;
        if (mesh.material._origOpacity !== undefined) {
            mesh.material.opacity = mesh.material._origOpacity;
            mesh.material.transparent = mesh.material._origTransparent;
            delete mesh.material._origOpacity;
            delete mesh.material._origTransparent;
            mesh.material.needsUpdate = true;
        }
    }
}
/**
 * All project handler functions exposed to HTML via window.
 * Objeto com todas as funcoes de projeto para o HTML.
 */
/**
 * Save a responsible party to a tree node.
 * Salva um responsavel (legal, tecnico, dados) no no da arvore.
 *
 * @param {string} nodeId
 * @param {'legal'|'technical'|'data'} role
 * @param {string} name
 */
export function handleSaveNodeResponsible(nodeId: any, role: any, name: any) {
    const node = findNodeById(nodeId, window.areasTreeData || []);
    if (!node) return;
    const fieldMap = {
        legal: 'responsibleLegal',
        technical: 'responsibleTechnical',
        data: 'responsibleData',
    };
    const field = (fieldMap as AnyRecord)[role];
    if (!field) return;
    if (name && name.trim()) {
        node[field] = { name: name.trim(), registry: '', contact: '' };
    } else {
        node[field] = null;
    }
    renderAreasTree();
}
export const projectHandlers = {
    handleAddProjectArea,
    handleRemoveProjectArea,
    handleProjectAreaChange,
    setProjectAreas,
    toggleAreaNode,
    selectAreaNode,
    setAreasTree,
    handleAreaRegistryTypeChange,
    handleAreaRegistryInput,
    handleSaveNodeRegistry,
    handleSaveNodeResponsible,
    toggleLocationSection,
    handleLocationCountrySearch,
    handleLocationCountryChange,
    handleLocationStateChange,
    handleLocationCityChange,
    handleLocationNeighborhoodChange,
    handleLocationPostalChange,
    handleLocationTimezoneChange,
    handleSaveNodeLocation,
    handleAddAreaNode,
    handleRemoveAreaNode,
    handleRenameAreaNode,
    handleChangeAreaNodeType,
    handleChangeAreaNodeBadges,
    handleMoveAreaNode,
    handleAddNodeDocument,
    handleDocFileSelected,
    handleSaveNodeDocument,
    handleRemoveNodeDocument,
    handleVerifyDocument,
    handleAddInputLink,
    handleAddOutputLink,
    handleRemoveInputLink,
    handleRemoveOutputLink,
    handleToggleCIOSection,
    handleOpenCIOForm,
    handleCancelCIOForm,
    handleSubmitCorporateInput,
    handleSubmitCorporateOutput,
    handleRemoveCorporateInput,
    handleRemoveCorporateOutput,
    handleInitModeChange,
    handleOpenMapPicker,
    handleOpenMapPickerPolygon,
    handleCreateBoundaryFromPolygon,
    handleShowWelcome,
    handleConvertToLatLon,
    handleConvertToUTM,
    newProject: async () => {
        // Guard contra chamadas concorrentes
        if (window.__ecbyts_clearing) return;
        const elementCount = getAllElements().length;
        const campaignCount = getAllCampaigns().length;
        const hasData = elementCount > 0 || campaignCount > 0;
        if (!hasData) {
            // Modelo vazio - confirm simples
            if (await asyncConfirm(t('newProjectConfirm') || 'Start a new project?')) {
                window.__ecbyts_clearing = true;
                resetModelIdentity();
                await generateModelId();
                clearModelData();
                location.reload();
            }
            return;
        }
        // Modelo com dados - dialog com opcao de backup
        const backupPrompt = String(
            t('newProjectBackupPrompt') ||
                'Current model has {elements} elements and {campaigns} campaigns. All data will be lost.',
        );
        const msg =
            backupPrompt.replace('{elements}', String(elementCount)).replace('{campaigns}', String(campaignCount)) +
            '\n\n' +
            (t('newProjectBackupHint') || 'You can download a backup before clearing. Continue?');
        if (!(await asyncConfirm(msg))) return;
        // Oferecer backup antes de limpar
        try {
            const { createAutoBackup } = await import('../../core/io/export.js' as string);
            const backupResult = await createAutoBackup('pre-new-project');
            if (backupResult.success) {
                showToast(
                    (t('backupCreated') || 'Backup downloaded: {filename}').replace(
                        '{filename}',
                        String(backupResult.filename || ''),
                    ),
                    'success',
                    5000,
                );
            }
        } catch (err: any) {
            log.error('Backup before new project failed', err.message);
            showToast(t('backupFailed') || 'Backup failed. Proceeding without backup.', 'warning');
        }
        window.__ecbyts_clearing = true;
        resetModelIdentity();
        await generateModelId();
        clearModelData();
        location.reload();
    },
};
