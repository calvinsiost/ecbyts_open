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
   EDITOR DE VINCULOS (EDGE EDITOR)
   ================================================================

   UI para criar e gerenciar relacoes entre elementos.
   Suporta drag-drop para criar vinculos visualmente.

   FUNCIONALIDADES:
   - Listar vinculos do elemento selecionado
   - Criar vinculos via modal com selecao visual
   - Remover vinculos existentes
   - Visualizar grafo de conexoes

   ================================================================ */
import { getIcon } from './icons.js';
import { showToast } from './toast.js';
import { asyncConfirm } from './asyncDialogs.js';
import { openModal, closeModal } from './modals.js';
import { EDGE_CATEGORIES, getEdgeType, getValidEdgeTypesForSource, isValidEdge } from '../edges/types.js';
import { addEdge, removeEdge, getOutgoingEdges, getIncomingEdges, getNeighbors, getDegree } from '../edges/manager.js';
import { getAllElements, getElementById } from '../../core/elements/manager.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
/** @type {any} */
let currentElement: any = null;
/** @type {any} */
let selectedEdgeType: any = null;
/** @type {any} */
let selectedTargetId: any = null;
// ----------------------------------------------------------------
// INICIALIZACAO
// ----------------------------------------------------------------
/**
 * Inicializa o editor de vinculos.
 * Registra handlers globais.
 */
export function initEdgeEditor() {
    // Registrar handlers globais
    window.handleAddEdgeClick = handleAddEdgeClick;
    window.handleRemoveEdge = handleRemoveEdge;
    window.handleEdgeTypeSelect = handleEdgeTypeSelect;
    window.handleTargetSelect = handleTargetSelect;
    window.handleSaveEdge = handleSaveEdge;
    window.closeEdgeModal = () => closeModal('edge-modal');
}
// ----------------------------------------------------------------
// RENDERIZACAO DO PAINEL
// ----------------------------------------------------------------
/**
 * Atualiza o painel de vinculos para um elemento.
 * @param {Object} element - Elemento selecionado
 */
/** @param {any} element */
export function updateEdgePanel(element: any) {
    currentElement = element;
    const container = document.getElementById('edge-panel-content');
    if (!container) return;
    if (!element) {
        container.innerHTML = `
            <p style="color: var(--neutral-500); font-size: 11px; padding: 12px;">
                Selecione um elemento para ver seus vínculos.
            </p>
        `;
        return;
    }
    // Obter vinculos
    const _el = element;
    const outgoing = getOutgoingEdges(_el.id);
    const incoming = getIncomingEdges(_el.id);
    const degree = getDegree(_el.id);
    // Renderizar cabecalho
    let html = `
        <div class="edge-panel-header">
            <span class="edge-element-name">${_el.name}</span>
            <span class="edge-degree-badge" title="Conexões">
                ${getIcon('link', { size: '12px' })} ${degree.total} (↗${degree.out} ↙${degree.in})
            </span>
        </div>
    `;
    // Vinculos de saida
    if (outgoing.length > 0) {
        html += `
            <div class="edge-section">
                <div class="edge-section-header">
                    ↗ Saída (${outgoing.length})
                </div>
                <div class="edge-list">
                    ${outgoing.map((edge: any) => renderEdgeItem(edge, 'outgoing')).join('')}
                </div>
            </div>
        `;
    }
    // Vinculos de entrada
    if (incoming.length > 0) {
        html += `
            <div class="edge-section">
                <div class="edge-section-header">
                    ↙ Entrada (${incoming.length})
                </div>
                <div class="edge-list">
                    ${incoming.map((edge: any) => renderEdgeItem(edge, 'incoming')).join('')}
                </div>
            </div>
        `;
    }
    // Estado vazio
    if (outgoing.length === 0 && incoming.length === 0) {
        html += `
            <div class="edge-empty">
                <p>Nenhum vínculo definido.</p>
                <p style="font-size: 10px; color: var(--neutral-400);">
                    Vincule este elemento a outros para criar relações.
                </p>
            </div>
        `;
    }
    // Botao adicionar
    html += `
        <div class="edge-actions">
            <button type="button" class="btn btn-primary" data-cc-action="cc-9bd243f6">
                ${getIcon('plus', { size: '14px' })} Adicionar Vínculo
            </button>
        </div>
    `;
    container.innerHTML = html;
}
/**
 * Renderiza um item de vinculo.
 * @param {Object} edge - Vinculo
 * @param {string} direction - 'outgoing' ou 'incoming'
 * @returns {string} HTML
 */
/** @param {any} edge @param {any} direction */
function renderEdgeItem(edge: any, direction: any) {
    const edgeType = getEdgeType(edge.type);
    const catInfo = EDGE_CATEGORIES[edgeType?.category];
    // Determinar elemento relacionado
    const relatedId = direction === 'outgoing' ? edge.targetId : edge.sourceId;
    const relatedElement = getElementById(relatedId);
    const relatedName = relatedElement?.name || relatedId;
    const relatedFamily = relatedElement?.family || '?';
    const arrow =
        direction === 'outgoing' ? getIcon('arrow-right', { size: '12px' }) : getIcon('arrow-left', { size: '12px' });
    const biLabel = edge.bidirectional ? '↔' : '';
    return `
        <div class="edge-item" data-edge-id="${edge.id}">
            <div class="edge-item-header">
                <span class="edge-type-icon" style="color: ${catInfo?.color || '#666'}">
                    ${getIcon(edgeType?.icon || 'link', { size: '14px' })}
                </span>
                <span class="edge-type-name">${edgeType?.name || edge.type}</span>
                <span class="edge-direction">${arrow}${biLabel}</span>
                <button type="button" class="edge-remove-btn" data-cc-call-click="handleRemoveEdge|s:${encodeURIComponent(`${edge.id}`)}" title="Remover" aria-label="Remove">
                    ${getIcon('x', { size: '12px' })}
                </button>
            </div>
            <div class="edge-related">
                <span class="edge-related-family">${relatedFamily}</span>
                <span class="edge-related-name">${relatedName}</span>
            </div>
            ${
                Object.keys(edge.properties || {}).length > 0
                    ? `
                <div class="edge-properties">
                    ${Object.entries(edge.properties)
                        .map(
                            ([k, v]) => `
                        <span class="edge-prop">${k}: ${v}</span>
                    `,
                        )
                        .join('')}
                </div>
            `
                    : ''
            }
        </div>
    `;
}
// ----------------------------------------------------------------
// HANDLERS
// ----------------------------------------------------------------
/**
 * Handler para botao adicionar vinculo.
 */
function handleAddEdgeClick() {
    if (!currentElement) {
        showToast('Selecione um elemento primeiro', 'error');
        return;
    }
    // Resetar estado
    selectedEdgeType = null;
    selectedTargetId = null;
    // Abrir modal
    openAddEdgeModal();
}
/**
 * Handler para remover vinculo.
 * @param {string} edgeId - ID do vinculo
 */
/** @param {string} edgeId */
async function handleRemoveEdge(edgeId: any) {
    if (!(await asyncConfirm('Remover este vínculo?'))) return;
    const result = removeEdge(edgeId);
    if (result.success) {
        showToast('Vínculo removido', 'success');
        updateEdgePanel(currentElement);
    } else {
        showToast(result.error || 'Erro ao remover', 'error');
    }
}
// ----------------------------------------------------------------
// MODAL DE ADICIONAR VINCULO
// ----------------------------------------------------------------
/**
 * Abre modal para adicionar vinculo.
 */
function openAddEdgeModal() {
    const modalContent = document.getElementById('edge-modal-content');
    if (modalContent) {
        modalContent.innerHTML = renderEdgeTypeSelector();
    }
    openModal('edge-modal');
}
/**
 * Renderiza seletor de tipo de vinculo.
 * @returns {string} HTML
 */
function renderEdgeTypeSelector() {
    // Obter tipos validos para o elemento atual
    const validTypes = getValidEdgeTypesForSource(currentElement.family);
    let html = `
        <div class="edge-modal-header">
            <h3>Novo Vínculo</h3>
            <p>Vincular <strong>${currentElement.name}</strong> (${currentElement.family})</p>
        </div>
        <div class="edge-modal-steps">
            <span class="step active">1. Tipo</span>
            <span class="step">2. Destino</span>
            <span class="step">3. Confirmar</span>
        </div>
        <div class="edge-type-grid">
    `;
    // Agrupar por categoria
    const grouped: Record<string, any[]> = {};
    validTypes.forEach((type: any) => {
        if (!grouped[type.category]) {
            grouped[type.category] = [];
        }
        grouped[type.category]?.push(type);
    });
    for (const [catId, types] of Object.entries(grouped)) {
        const catInfo = EDGE_CATEGORIES[catId];
        const _types = types;
        html += `
            <div class="edge-type-category">
                <div class="edge-type-category-header" style="--cat-color: ${catInfo?.color || '#666'}">
                    ${getIcon(catInfo?.icon || 'link', { size: '12px' })} ${catInfo?.name || catId}
                </div>
                <div class="edge-type-list">
                    ${_types
                        .map((type: any) => `
                        <button type="button" class="edge-type-btn" data-cc-call-click="handleEdgeTypeSelect|s:${encodeURIComponent(`${type.id}`)}"
                                title="${type.description}">
                            <span class="edge-type-icon">${getIcon(type.icon, { size: '16px' })}</span>
                            <span class="edge-type-name">${type.name}</span>
                            ${type.bidirectional ? '<span class="edge-bi-badge">↔</span>' : ''}
                        </button>
                    `,
                        )
                        .join('')}
                </div>
            </div>
        `;
    }
    html += `</div>`;
    return html;
}
/**
 * Handler para selecao de tipo de vinculo.
 * @param {string} typeId - ID do tipo
 */
/** @param {string|null} typeId */
function handleEdgeTypeSelect(typeId: any) {
    if (!typeId) {
        selectedEdgeType = null;
        selectedTargetId = null;
        const modalContent = document.getElementById('edge-modal-content');
        if (modalContent) {
            modalContent.innerHTML = renderEdgeTypeSelector();
        }
        return;
    }
    selectedEdgeType = getEdgeType(typeId);
    if (!selectedEdgeType) return;
    const modalContent = document.getElementById('edge-modal-content');
    if (modalContent) {
        modalContent.innerHTML = renderTargetSelector();
    }
}
/**
 * Renderiza seletor de elemento destino.
 * @returns {string} HTML
 */
function renderTargetSelector() {
    const allElements = getAllElements();
    const catInfo = EDGE_CATEGORIES[selectedEdgeType.category];
    // Filtrar elementos validos como destino
    const validTargets = allElements.filter((el: any) => {
        if (el.id === currentElement.id) return false; // Nao permitir auto-referencia
        return isValidEdge(selectedEdgeType.id, currentElement.family, el.family);
    });
    // Agrupar por familia
    const grouped: Record<string, any[]> = {};
    validTargets.forEach((el: any) => {
        if (!grouped[el.family]) {
            grouped[el.family] = [];
        }
        grouped[el.family]?.push(el);
    });
    let html = `
        <div class="edge-modal-header">
            <button type="button" class="edge-back-btn" data-cc-action="cc-86c4f096">
                ← Voltar
            </button>
            <h3>${getIcon(selectedEdgeType.icon, { size: '18px' })} ${selectedEdgeType.name}</h3>
            <p>${selectedEdgeType.description}</p>
            <span class="edge-category-badge" style="--cat-color: ${catInfo?.color}">
                ${getIcon(catInfo?.icon || 'link', { size: '12px' })} ${catInfo?.name}
            </span>
        </div>
        <div class="edge-modal-steps">
            <span class="step completed">1. Tipo ${getIcon('check', { size: '10px' })}</span>
            <span class="step active">2. Destino</span>
            <span class="step">3. Confirmar</span>
        </div>
    `;
    if (validTargets.length === 0) {
        html += `
            <div class="edge-empty">
                <p>Nenhum elemento válido para este tipo de vínculo.</p>
            </div>
        `;
    } else {
        html += `<div class="edge-target-grid">`;
        for (const [family, elements] of Object.entries(grouped)) {
            const _els = elements as any[];
            html += `
                <div class="edge-target-family">
                    <div class="edge-target-family-header">${family}</div>
                    <div class="edge-target-list">
                        ${_els
                            .map((el: any) => `
                            <button type="button" class="edge-target-btn ${selectedTargetId === el.id ? 'selected' : ''}"
                                    data-cc-call-click="handleTargetSelect|s:${encodeURIComponent(`${el.id}`)}">
                                <span class="edge-target-name">${el.name}</span>
                            </button>
                        `,
                            )
                            .join('')}
                    </div>
                </div>
            `;
        }
        html += `</div>`;
    }
    return html;
}
/**
 * Handler para selecao de elemento destino.
 * @param {string} targetId - ID do elemento
 */
/** @param {string} targetId */
function handleTargetSelect(targetId: any) {
    selectedTargetId = targetId;
    const modalContent = document.getElementById('edge-modal-content');
    if (modalContent) {
        modalContent.innerHTML = renderConfirmation();
    }
}
/**
 * Renderiza tela de confirmacao.
 * @returns {string} HTML
 */
function renderConfirmation() {
    const targetElement = getElementById(selectedTargetId);
    const catInfo = EDGE_CATEGORIES[selectedEdgeType.category];
    const html = `
        <div class="edge-modal-header">
            <button type="button" class="edge-back-btn" data-cc-call-click="handleEdgeTypeSelect|s:${encodeURIComponent(`${selectedEdgeType.id}`)}">
                ← Voltar
            </button>
            <h3>Confirmar Vínculo</h3>
        </div>
        <div class="edge-modal-steps">
            <span class="step completed">1. Tipo ${getIcon('check', { size: '10px' })}</span>
            <span class="step completed">2. Destino ${getIcon('check', { size: '10px' })}</span>
            <span class="step active">3. Confirmar</span>
        </div>
        <div class="edge-confirmation">
            <div class="edge-confirm-diagram">
                <div class="edge-confirm-node source">
                    <span class="node-family">${currentElement.family}</span>
                    <span class="node-name">${currentElement.name}</span>
                </div>
                <div class="edge-confirm-arrow">
                    <span class="arrow-type" style="color: ${catInfo?.color}">
                        ${getIcon(selectedEdgeType.icon, { size: '16px' })} ${selectedEdgeType.name}
                    </span>
                    <span class="arrow-line">
                        ${selectedEdgeType.bidirectional ? getIcon('arrow-left', { size: '14px' }) + getIcon('arrow-right', { size: '14px' }) : getIcon('arrow-right', { size: '14px' })}
                    </span>
                </div>
                <div class="edge-confirm-node target">
                    <span class="node-family">${targetElement?.family}</span>
                    <span class="node-name">${targetElement?.name}</span>
                </div>
            </div>
        </div>
        <div class="edge-modal-actions">
            <button type="button" class="btn btn-secondary" data-cc-action="cc-ec65bb54">
                Cancelar
            </button>
            <button type="button" class="btn btn-primary" data-cc-action="cc-86e2ff3c">
                Criar Vínculo
            </button>
        </div>
    `;
    return html;
}
/**
 * Handler para salvar vinculo.
 */
function handleSaveEdge() {
    if (!currentElement || !selectedEdgeType || !selectedTargetId) return;
    const result = addEdge(currentElement.id, selectedTargetId, selectedEdgeType.id, {
        createdBy: 'user',
        getElement: getElementById,
    });
    if (result.success) {
        showToast('Vínculo criado!', 'success');
        closeModal('edge-modal');
        updateEdgePanel(currentElement);
    } else {
        showToast(result.errors?.join('\n') || 'Erro ao criar vínculo', 'error');
    }
}
// ----------------------------------------------------------------
// VISUALIZACAO DE GRAFO (MINI)
// ----------------------------------------------------------------
/**
 * Renderiza mini-visualizacao do grafo para um elemento.
 * @param {Object} element - Elemento central
 * @returns {string} HTML SVG
 */
/** @param {any} element */
export function renderMiniGraph(element: any) {
    if (!element) return '';
    const neighbors = getNeighbors(element.id, { outgoing: true, incoming: true });
    const maxNodes = 6;
    const displayNeighbors = neighbors.slice(0, maxNodes);
    const width = 200;
    const height = 120;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 40;
    let svg = `<svg width="${width}" height="${height}" class="mini-graph">`;
    // Desenhar arestas
    displayNeighbors.forEach((neighborId: any, i: any) => {
        const angle = (2 * Math.PI * i) / displayNeighbors.length - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        svg += `<line x1="${centerX}" y1="${centerY}" x2="${x}" y2="${y}"
                      stroke="#ccc" stroke-width="1"/>`;
    });
    // Desenhar nos vizinhos
    displayNeighbors.forEach((neighborId: any, i: any) => {
        const angle = (2 * Math.PI * i) / displayNeighbors.length - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        const neighbor = getElementById(neighborId);
        svg += `<circle cx="${x}" cy="${y}" r="8" fill="#e0e0e0" stroke="#999"/>`;
        svg += `<text x="${x}" y="${y + 3}" text-anchor="middle" font-size="6" fill="#666">
                    ${neighbor?.name?.substring(0, 3) || '?'}
                </text>`;
    });
    // Desenhar no central
    svg += `<circle cx="${centerX}" cy="${centerY}" r="12" fill="#2196F3" stroke="#1976D2"/>`;
    svg += `<text x="${centerX}" y="${centerY + 3}" text-anchor="middle" font-size="7" fill="white" font-weight="bold">
                ${element.name.substring(0, 4)}
            </text>`;
    // Indicador de mais nos
    if (neighbors.length > maxNodes) {
        svg += `<text x="${width - 10}" y="${height - 5}" font-size="8" fill="#999">
                    +${neighbors.length - maxNodes}
                </text>`;
    }
    svg += `</svg>`;
    return svg;
}
// ----------------------------------------------------------------
// ESTILOS (injetados no head)
// ----------------------------------------------------------------
/**
 * Injeta estilos CSS do editor de vinculos.
 */
export function injectEdgeStyles() {
    if (document.getElementById('edge-editor-styles')) return;
    const styles = document.createElement('style');
    styles.id = 'edge-editor-styles';
    styles.textContent = `
        /* Painel de vinculos */
        .edge-panel-header {
            padding: 12px;
            border-bottom: 1px solid var(--neutral-200);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .edge-element-name {
            font-weight: 600;
            font-size: 13px;
        }
        .edge-degree-badge {
            font-size: 10px;
            background: var(--neutral-100);
            padding: 4px 8px;
            border-radius: 4px;
            color: var(--neutral-600);
        }

        /* Secoes */
        .edge-section {
            margin: 8px;
        }
        .edge-section-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--neutral-600);
            padding: 4px 0;
            border-bottom: 1px solid var(--neutral-200);
            margin-bottom: 8px;
        }

        /* Lista de vinculos */
        .edge-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .edge-item {
            background: white;
            border: 1px solid var(--neutral-200);
            border-radius: 6px;
            padding: 8px;
        }
        .edge-item:hover {
            border-color: var(--primary);
        }
        .edge-item-header {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 4px;
        }
        .edge-type-icon {
            font-size: 14px;
        }
        .edge-type-name {
            font-weight: 500;
            font-size: 11px;
            flex: 1;
        }
        .edge-direction {
            font-size: 12px;
            color: var(--neutral-500);
        }
        .edge-remove-btn {
            width: 18px;
            height: 18px;
            border: none;
            background: var(--neutral-100);
            color: var(--neutral-500);
            border-radius: 50%;
            cursor: pointer;
            font-size: 10px;
        }
        .edge-remove-btn:hover {
            background: var(--danger);
            color: white;
        }
        .edge-related {
            display: flex;
            gap: 6px;
            font-size: 10px;
        }
        .edge-related-family {
            background: var(--neutral-100);
            padding: 2px 6px;
            border-radius: 3px;
            color: var(--neutral-600);
        }
        .edge-related-name {
            color: var(--neutral-700);
        }
        .edge-properties {
            margin-top: 4px;
            font-size: 9px;
            color: var(--neutral-500);
        }
        .edge-prop {
            margin-right: 8px;
        }

        /* Estado vazio */
        .edge-empty {
            padding: 24px;
            text-align: center;
            color: var(--neutral-500);
            font-size: 11px;
        }

        /* Acoes */
        .edge-actions {
            padding: 12px;
            border-top: 1px solid var(--neutral-200);
        }

        /* Modal de vinculos */
        .edge-modal-header {
            padding: 16px;
            border-bottom: 1px solid var(--neutral-200);
        }
        .edge-modal-header h3 {
            margin: 0 0 4px 0;
            font-size: 16px;
        }
        .edge-modal-header p {
            margin: 0;
            font-size: 12px;
            color: var(--neutral-600);
        }
        .edge-back-btn {
            background: none;
            border: none;
            color: var(--primary);
            cursor: pointer;
            font-size: 12px;
            padding: 0;
            margin-bottom: 8px;
        }
        .edge-category-badge {
            display: inline-block;
            font-size: 10px;
            padding: 2px 8px;
            border-radius: 4px;
            background: var(--cat-color, var(--neutral-200));
            color: white;
            margin-top: 8px;
        }

        /* Steps */
        .edge-modal-steps {
            display: flex;
            justify-content: center;
            gap: 16px;
            padding: 12px;
            background: var(--neutral-50);
            border-bottom: 1px solid var(--neutral-200);
        }
        .edge-modal-steps .step {
            font-size: 11px;
            color: var(--neutral-400);
        }
        .edge-modal-steps .step.active {
            color: var(--primary);
            font-weight: 600;
        }
        .edge-modal-steps .step.completed {
            color: var(--success);
        }

        /* Grid de tipos */
        .edge-type-grid {
            padding: 16px;
            max-height: 350px;
            overflow-y: auto;
        }
        .edge-type-category {
            margin-bottom: 16px;
        }
        .edge-type-category-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--cat-color);
            margin-bottom: 8px;
        }
        .edge-type-list {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
        }
        .edge-type-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px;
            border: 1px solid var(--neutral-200);
            border-radius: 6px;
            background: white;
            cursor: pointer;
            text-align: left;
        }
        .edge-type-btn:hover {
            border-color: var(--primary);
            background: var(--neutral-50);
        }
        .edge-type-icon {
            font-size: 16px;
        }
        .edge-type-name {
            font-size: 10px;
            flex: 1;
        }
        .edge-bi-badge {
            font-size: 10px;
            color: var(--neutral-500);
        }

        /* Grid de destinos */
        .edge-target-grid {
            padding: 16px;
            max-height: 350px;
            overflow-y: auto;
        }
        .edge-target-family {
            margin-bottom: 12px;
        }
        .edge-target-family-header {
            font-size: 11px;
            font-weight: 600;
            color: var(--neutral-600);
            margin-bottom: 6px;
            text-transform: capitalize;
        }
        .edge-target-list {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        .edge-target-btn {
            padding: 6px 12px;
            border: 1px solid var(--neutral-200);
            border-radius: 4px;
            background: white;
            cursor: pointer;
            font-size: 11px;
        }
        .edge-target-btn:hover {
            border-color: var(--primary);
        }
        .edge-target-btn.selected {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
        }

        /* Confirmacao */
        .edge-confirmation {
            padding: 24px;
        }
        .edge-confirm-diagram {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 16px;
        }
        .edge-confirm-node {
            padding: 12px 16px;
            border-radius: 8px;
            text-align: center;
        }
        .edge-confirm-node.source {
            background: var(--primary-bg);
            border: 2px solid var(--primary);
        }
        .edge-confirm-node.target {
            background: var(--success-bg);
            border: 2px solid var(--success);
        }
        .edge-confirm-node .node-family {
            display: block;
            font-size: 9px;
            color: var(--neutral-500);
            text-transform: uppercase;
        }
        .edge-confirm-node .node-name {
            display: block;
            font-size: 12px;
            font-weight: 600;
        }
        .edge-confirm-arrow {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }
        .edge-confirm-arrow .arrow-type {
            font-size: 10px;
            font-weight: 500;
        }
        .edge-confirm-arrow .arrow-line {
            font-size: 20px;
            color: var(--neutral-400);
        }

        /* Acoes do modal */
        .edge-modal-actions {
            padding: 12px 16px;
            border-top: 1px solid var(--neutral-200);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        }

        /* Mini grafo */
        .mini-graph {
            display: block;
            margin: 8px auto;
        }
    `;
    document.head.appendChild(styles);
}
