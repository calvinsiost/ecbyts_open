// @ts-check
// Generated from src/app/js/utils/ui/lists.ts by TS-MIGRATION-001. Do not edit manually.
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
   ATUALIZACAO DE LISTAS DA INTERFACE
   ================================================================

   Este modulo atualiza as listas visuais da interface:
   - Lista de familias (painel esquerdo)
   - Lista de elementos (aba Elements)
   - Barra de status

   SEPARACAO DE RESPONSABILIDADES:
   - Manager: gerencia dados dos elementos
   - Lists: atualiza representacao visual dos dados

   ================================================================ */
import { t } from '../i18n/translations.js';
import { getIcon, getFamilyIcon, hydrateIcons } from './icons.js';
import { renderTransformControls as renderTransformControlsPure } from './_transformControlsPure.js';
import {
    groupObservationsByCampaign,
    groupPlannedReadingsByElement,
    resolveComplianceBadge,
} from './_listsPure.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { getAllFamilies, getEnabledFamilies, getFamilyName } from '../../core/elements/families.js';
import {
    getAllElements,
    countByFamily,
    getElementCount,
    getSelectedElement,
    getElementTree,
    isEffectivelyVisible,
} from '../../core/elements/manager.js';
import { getAllCampaigns, getCampaignCompleteness } from '../../core/campaigns/manager.js';
import { getUserConstantById, getUserConstants } from '../../core/constants/manager.js';
import { applyPostProcessing } from '../../core/calculator/engine.js';
import { getAllScenes } from '../scenes/manager.js';
import { CONFIG } from '../../config.js';
import { buildStructuredHeader } from './elementDetailsRenderer.js';
import { renderParameterSelect } from './customSelect.js';
import { renderModeSwitcher } from './groupView/ModeSwitcher.js';
import { mountGroupViewContent, destroyAllGroupViews } from './groupView/GroupViewRenderer.js';
import { canEditElement, isObserver, isAccessControlActive } from '../auth/permissions.js';
import {
    getElementGroups,
    getElementGroup,
    isElementUngroupedCollapsed,
    setElementGroup,
    clearElementGroup,
    getFamilyGroups,
    getFamilyGroup,
    isFamilyUngroupedCollapsed,
    setFamilyGroup,
    clearFamilyGroup,
    getGroupViewMode,
} from '../groups/manager.js';
import { hasStrategy, isEditing, getEditingElementId, getEditMode } from '../editing/editManager.js';
import {
    renderBoundaryControls,
    renderAreaControls,
    renderSensorSummaryControls,
    renderOrgUnitDropdown,
} from './elementControls.js';
import { validateObservationFull } from '../../core/validation/rules.js';
import { EIS_CREDENTIAL_LABELS, EIS_CREDENTIAL_MULTIPLIERS } from '../../core/eis/eisCalculator.js';
import { getAllLayers, getSelectedLayer } from '../../core/interpolation/manager.js';
import { getPhotosByElement, getPhotoThumb } from '../../core/photolog/manager.js';
import { getAllVolumes, getSelectedVolume } from '../../core/voxel/manager.js';
import { getPerElementLabel } from '../labels/manager.js';
import { getProjects } from '../governance/projectManager.js';
import { resolveObservation } from '../../core/bindings/resolver.js';
import { safeSetItem } from '../storage/storageMonitor.js';
type AnyRecord = Record<string, any>;
// ----------------------------------------------------------------
// DETAILS RESIZE STATE
// Altura persistida do painel de detalhes (modo docked)
// ----------------------------------------------------------------
const _DETAILS_HEIGHT_KEY = 'ecbyts-details-height';
/**
 * Inicializa resize arrastavel entre lista e detalhes (modo docked).
 * Restaura altura salva do localStorage e liga listeners de drag.
 * Idempotente: guard _resizeBound impede duplicacao de listeners.
 */
function _initDetailsResize() {
    const tab = document.getElementById('tab-elements');
    if (!tab || !tab.classList.contains('details-docked')) return;
    const handle: any = tab.querySelector('.details-resize-handle');
    const section: any = tab.querySelector('.section[data-section-id="elementDetails"]');
    if (!handle || !section) return;
    // Restaurar altura salva
    const saved = localStorage.getItem(_DETAILS_HEIGHT_KEY) || '';
    if (saved) {
        const h = parseInt(saved, 10);
        if (h >= 32) {
            section.style.height = h + 'px';
            section.style.maxHeight = 'none';
        }
    }
    // Sem saved: CSS default (max-height: 45%, height: auto) permanece
    // Evitar duplo bind
    if (handle._resizeBound) return;
    handle._resizeBound = true;
    // --- Mouse drag ---
    handle.addEventListener('mousedown', (e: any) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = section.getBoundingClientRect().height;
        const tabH = tab.getBoundingClientRect().height;
        const minH = 32;
        const maxH = tabH * 0.7;
        const onMove = /** @param {any} elementId */ (ev: any) => {
            const delta = startY - ev.clientY;
            const newH = Math.max(minH, Math.min(maxH, startH + delta));
            section.style.height = newH + 'px';
            section.style.maxHeight = 'none';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            const finalH = Math.round(section.getBoundingClientRect().height);
            safeSetItem(_DETAILS_HEIGHT_KEY, finalH.toString());
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
    // --- Touch drag ---
    handle.addEventListener(
        'touchstart',
        (e: any) => {
            e.preventDefault(); // suprime mousedown sintetico
            const startY = e.touches[0].clientY;
            const startH = section.getBoundingClientRect().height;
            const tabH = tab.getBoundingClientRect().height;
            const minH = 32;
            const maxH = tabH * 0.7;
            const onMove = /** @param {any} elementId */ (ev: any) => {
                const delta = startY - ev.touches[0].clientY;
                const newH = Math.max(minH, Math.min(maxH, startH + delta));
                section.style.height = newH + 'px';
                section.style.maxHeight = 'none';
            };
            const onEnd = () => {
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onEnd);
                const finalH = Math.round(section.getBoundingClientRect().height);
                safeSetItem(_DETAILS_HEIGHT_KEY, finalH.toString());
            };
            document.addEventListener('touchmove', onMove);
            document.addEventListener('touchend', onEnd);
        },
        { passive: false },
    );
    // --- Double-click reseta para default ---
    handle.addEventListener('dblclick', () => {
        section.style.height = '';
        section.style.maxHeight = '';
        localStorage.removeItem(_DETAILS_HEIGHT_KEY);
    });
}
// ----------------------------------------------------------------
// OBSERVATION LAZY-LOAD STATE
// Paginacao de observacoes por elemento (default: 10 visiveis)
// ----------------------------------------------------------------
const _obsVisibleCounts: any = {};
/**
 * Incrementa observacoes visiveis para um elemento.
 * Chamada pelo botao "Mostrar mais" no painel de detalhes.
 * @param {string} elementId
 * @param {number} elementId
 */
export function showMoreObservations( elementId: any, increment: any) {
    _obsVisibleCounts[elementId] = (_obsVisibleCounts[elementId] || 10) + increment;
    updateElementDetails();
}
/**
 * Mostra todas as observacoes de um elemento.
 * @param {string} elementId
 * @param {number} total
 */
export function showAllObservations( elementId: any, total: any) {
    _obsVisibleCounts[elementId] = total;
    updateElementDetails();
}
// ----------------------------------------------------------------
// OBSERVATION CAMPAIGN GROUPING STATE
// ----------------------------------------------------------------
/** Set of expanded campaign keys: "elementId:campaignId" */
const _obsCampaignExpanded = new Set();
/** Currently expanded observation (full card): "elementId" → originalIndex or null */
const _obsExpandedIdx: any = {};
/**
 * Toggle campaign group expand/collapse.
 * @param {string} elementId
 * @param {string} campaignKey - campaignId or '__none__'
 */
export function toggleObsCampaign( elementId: any, campaignKey: any) {
    const key = `${elementId}:${campaignKey}`;
    if (_obsCampaignExpanded.has(key)) _obsCampaignExpanded.delete(key);
    else _obsCampaignExpanded.add(key);
    updateElementDetails();
}
/**
 * Expand a single observation to full card view.
 * @param {string} elementId
 * @param {number} originalIndex - Index in the flat observations array
 */
export function expandObservation( elementId: any, originalIndex: any) {
    if (_obsExpandedIdx[elementId] === originalIndex) {
        _obsExpandedIdx[elementId] = null; // toggle off
    } else {
        _obsExpandedIdx[elementId] = originalIndex;
    }
    updateElementDetails();
}
// ----------------------------------------------------------------
// LISTA DE FAMILIAS
// ----------------------------------------------------------------
/**
 * Atualiza lista de familias no painel esquerdo.
 * Agrupa familias em grupos customizaveis com drag-and-drop.
 *
 * @param {Function} _onAddElement - Callback quando usuario clica para adicionar
 */
/**
 * Partition families into groups and ungrouped list.
 * @param {any[]} families
 * @param {any[]} groups
 * @returns {{ grouped: Record<string, any[]>, ungrouped: any[] }}
 */
function _partitionFamiliesByGroup(families: any[], groups: any[]) {
    const grouped: any = {};
    const ungrouped: any[] = [];
    for (const family of families) {
        const gid = getFamilyGroup(family.id);
        if (gid && groups.find((g: any) => g.id === gid)) {
            (grouped[gid] = grouped[gid] || []).push(family);
        } else {
            ungrouped.push(family);
        }
    }
    return { grouped, ungrouped };
}

/**
 * Build the HTML for one family group.
 * @param {any} group
 * @param {any[]} items
 * @param {any} counts
 * @returns {string}
 */
function _buildFamilyGroupHtml(group: any, items: any[], counts: any): string {
    const collapsedClass = group.collapsed ? ' collapsed' : '';
    const chevron = group.collapsed ? '▶' : '▼';
    const label = group.labelKey && t(group.labelKey) !== group.labelKey ? t(group.labelKey) : group.name;
    return `
        <div class="element-group${collapsedClass}" data-group-id="${group.id}" data-drop-zone="family-group">
            <div class="element-group-header" data-cc-call-click="handleToggleFamilyGroupCollapse|s:${encodeURIComponent(`${group.id}`)}">
                <span class="element-group-chevron">${chevron}</span>
                <span class="element-group-color" style="background:${escapeHtml(group.color)};"></span>
                <span class="element-group-name">${escapeHtml(label)}</span>
                <span class="element-group-count">(${items.length})</span>
                <button class="element-group-btn" data-cc-call-click="handleRenameFamilyGroup|s:${encodeURIComponent(`${group.id}`)}" data-cc-stop="1" title="${t('editGroup')}">
                    ${getIcon('edit', { size: '11px' })}
                </button>
                <button class="element-group-btn" data-cc-call-click="handleRemoveFamilyGroup|s:${encodeURIComponent(`${group.id}`)}" data-cc-stop="1" title="${t('common.remove')}">
                    ${getIcon('x', { size: '11px' })}
                </button>
            </div>
            <div class="element-group-content">
                ${items.map((family: any) => _renderFamilyItem(family, counts)).join('')}
                ${items.length === 0 ? `<div class="element-group-empty">${t('dropHere')}"</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * Build the HTML for the ungrouped families section.
 * @param {any[]} ungrouped
 * @param {any} counts
 * @param {boolean} hasGroups
 * @returns {string}
 */
function _buildUngroupedFamiliesHtml(ungrouped: any[], counts: any, hasGroups: boolean): string {
    const itemsHtml = ungrouped.map((family: any) => _renderFamilyItem(family, counts)).join('');
    if (!hasGroups) return itemsHtml;
    const collapsed = isFamilyUngroupedCollapsed();
    const collapsedClass = collapsed ? ' collapsed' : '';
    const chevron = collapsed ? '▶' : '▼';
    return `
        <div class="element-group element-group-ungrouped${collapsedClass}" data-group-id="" data-drop-zone="family-group">
            <div class="element-group-header" data-cc-action="cc-0827be96">
                <span class="element-group-chevron">${chevron}</span>
                <span class="element-group-name">${t('ungrouped') || 'Ungrouped'}</span>
                <span class="element-group-count">(${ungrouped.length})</span>
            </div>
            <div class="element-group-content">
                ${itemsHtml}
            </div>
        </div>
    `;
}

export function updateFamiliesList( _onAddElement: any) {
    const container = document.getElementById('families-list');
    if (!container) return;
    const counts = countByFamily();
    const families = getEnabledFamilies();
    const groups = getFamilyGroups();
    const { grouped, ungrouped } = _partitionFamiliesByGroup(families, groups);
    let html = groups.map((group: any) => _buildFamilyGroupHtml(group, grouped[group.id] || [], counts)).join('');
    html += _buildUngroupedFamiliesHtml(ungrouped, counts, groups.length > 0);
    html += `
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px; width:100%;"
                data-cc-action="cc-baef7d3e">
            ${getIcon('folder-plus', { size: '14px' })} ${t('addGroup') || 'Add Group'}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:4px; width:100%;"
                data-cc-action="cc-35901cfc"
                title="${t('restoreCanonicalGroupsTitle') || 'Cria os 11 grupos padrão e mapeia famílias não agrupadas. Preserva seus grupos customizados.'}">
            ${getIcon('refresh-cw', { size: '14px' })} ${t('restoreCanonicalGroups') || 'Restaurar grupos padrão'}
        </button>
    `;
    container.innerHTML = html;
    _installFamilyDnD(container);
}
/** Render a single family item (used in grouped and ungrouped). */
/**
 * @param {any} counts
 * @param {any} counts
 */
function _renderFamilyItem( family: any, counts: any) {
    return `
        <div class="family-item" draggable="true" data-family-id="${family.id}"
             data-cc-call-click="handleAddElement|s:${encodeURIComponent(`${family.id}`)}">
            <div class="icon">${getFamilyIcon(family.id)}</div>
            <div class="info">
                <div class="name">${getFamilyName(family)}</div>
                <div class="count">${counts[family.id] || 0} ${t('elements')}</div>
            </div>
            <div class="actions">
                <button type="button"
                        class="family-action-btn"
                        data-cc-call-click="handleAddElement|s:${encodeURIComponent(`${family.id}`)}" data-cc-stop="1"
                        title="Add">
                    ${getIcon('plus', { size: '14px' })}
                </button>
            </div>
        </div>
    `;
}
/** Install HTML5 drag-and-drop for family items → group zones. */
/**
 * Instala DnD genérico para itens agrupáveis.
 * Reutilizado por famílias e elementos.
 *
 * @param {HTMLElement} container - Container com itens e drop zones
 * @param {{
 *   itemSelector: string,
 *   dataAttr: string,
 *   zoneSelector: string,
 *   onAssign: Function,
 *   onClear: Function,
 *   stopPropagation?: boolean,
 * }} opts
 */
function _installDnD( container: any, { itemSelector, dataAttr, zoneSelector, onAssign, onClear, stopPropagation }: any) {
    container.querySelectorAll(itemSelector).forEach((item: any) => {
        item.addEventListener('dragstart', (e: any) => {
            const dragItem = item;
            e.dataTransfer.setData('text/plain', dragItem.dataset[dataAttr]);
            e.dataTransfer.effectAllowed = 'move';
            dragItem.classList.add('dragging');
            if (stopPropagation) e.stopPropagation();
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
    });
    container.querySelectorAll(zoneSelector).forEach((zone: any) => {
        zone.addEventListener('dragover', (e: any) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', (e: any) => {
            if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', (e: any) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const id = e.dataTransfer.getData('text/plain');
            const groupId = zone.dataset.groupId || '';
            if (id) {
                if (groupId) onAssign(id, groupId);
                else onClear(id);
            }
        });
    });
}
/**
 * @param {any} container
 */
function _installFamilyDnD( container: any) {
    _installDnD(container, {
        itemSelector: '.family-item[draggable]',
        dataAttr: 'familyId',
        zoneSelector: '[data-drop-zone="family-group"]',
        onAssign: setFamilyGroup,
        onClear: clearFamilyGroup,
    });
}
// ----------------------------------------------------------------
// LISTA DE ELEMENTOS - filtro/pesquisa
// ----------------------------------------------------------------
/**
 * Atualiza as opcoes do <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L420"> de filtro por familia.
 * Mostra apenas as familias presentes no modelo atual.
 * @param {any[]} elements
 * @param {any} families
 */
function _updateFamilyFilterOptions( elements: any, families: any) {
    const sel = document.getElementById('elements-filter-family');
    if (!sel) return;
    const prev = sel.value;
    // Coleta familias unicas (nao-container) presentes no modelo
    const seen = new Set();
    for (const el of elements) {
        if (!families[el.family]?.isContainer) seen.add(el.family);
    }
    // Reconstroi opcoes preservando "All" como primeira
    const allLabel = sel.querySelector('option[value=""]')?.textContent || 'Todos';
    sel.innerHTML = `<option value="">${escapeHtml(allLabel)}</option>`;
    for (const fid of [...seen].sort() as any[]) {
        const label = families[fid]?.label || families[fid]?.name || fid;
        const opt = document.createElement('option');
        opt.value = fid as any;
        opt.textContent = label as any;
        if (fid === prev) opt.selected = true;
        sel.appendChild(opt);
    }
}
// ----------------------------------------------------------------
// LISTA DE ELEMENTOS
// ----------------------------------------------------------------
/**
 * Atualiza lista de elementos na aba Elements.
 * Agrupa elementos em grupos customizaveis com drag-and-drop.
 *
 * @param {Function} container - Callback para alternar visibilidade
 * @param {Function} _onRemove - Callback para remover elemento
 */
/**
 * Rescue the details section out of the elements list before DOM wipe.
 * @param {HTMLElement} container
 */
function _rescueDetailsSection(container: HTMLElement) {
    const detailsBefore = document.getElementById('element-details')?.closest('.section');
    if (detailsBefore && container.contains(detailsBefore)) {
        const tab = document.getElementById('tab-elements');
        if (tab) tab.appendChild(detailsBefore);
    }
}

/**
 * Position the details section as docked or side panel.
 * @param {boolean} docked
 */
function _positionDetailsSection(docked: boolean) {
    const detailsSection = document.getElementById('element-details')?.closest('.section');
    const tab = document.getElementById('tab-elements');
    if (!tab) {
        if (detailsSection) detailsSection.style.display = '';
        return;
    }
    if (docked) {
        tab.classList.remove('details-side');
        tab.classList.add('details-docked');
        if (detailsSection && detailsSection.parentElement !== tab) tab.appendChild(detailsSection);
        if (detailsSection) detailsSection.style.display = '';
        _initDetailsResize();
    }
    else {
        tab.classList.remove('details-docked');
        tab.classList.add('details-side');
        if (tab.style.display !== 'none') tab.style.display = 'flex';
        if (detailsSection && detailsSection.parentElement !== tab) tab.appendChild(detailsSection);
        if (detailsSection) detailsSection.style.display = '';
    }
}

/**
 * Render the empty state when no elements or layers exist.
 * @returns {string}
 */
function _renderElementsEmptyState(): string {
    return `
        <div style="text-align: center; padding: 20px; color: var(--neutral-500);">
            <p>No elements yet.</p>
            <p style="font-size: 11px;">Click on a family to add elements.</p>
        </div>`;
}

/**
 * Partition elements into grouped and ungrouped buckets.
 * @param {any[]} elements
 * @param {any[]} groups
 * @returns {{ grouped: AnyRecord, ungrouped: any[] }}
 */
function _partitionElementsByGroup(elements: any[], groups: any[]): { grouped: AnyRecord; ungrouped: any[] } {
    const grouped: any = {};
    const ungrouped: any[] = [];
    for (const el of elements) {
        const gid = getElementGroup(el.id);
        if (gid && groups.find((g: any) => g.id === gid)) {
            (grouped[gid] = grouped[gid] || []).push(el);
        }
        else {
            ungrouped.push(el);
        }
    }
    return { grouped, ungrouped };
}

/**
 * Render the content of a single element group card.
 * @param {any} group
 * @param {any[]} items
 * @param {any} families
 * @param {any|null} selected
 * @returns {string}
 */
function _renderElementGroupContent(group: any, items: any[], families: any, selected: any): string {
    const visualMode = getGroupViewMode(group.id) === 'visual';
    const cards = visualMode ? items.map((el: any) => _renderElementCard(el, families, selected)).join('') : '';
    const emptyPlaceholder = visualMode && items.length === 0 ? `<div class="element-group-empty">${t('dropHere')}</div>` : '';
    return `
        <div class="element-group-content">
            <div class="group-mode-switcher-host" data-group-mode-switcher-id="${group.id}"></div>
            <div class="group-view-content-host" data-gvch-id="${group.id}">
                ${cards}${emptyPlaceholder}
            </div>
        </div>`;
}

/**
 * Render all custom element groups.
 * @param {any[]} groups
 * @param {AnyRecord} grouped
 * @param {any} families
 * @param {any|null} selected
 * @returns {string}
 */
function _renderElementGroups(groups: any[], grouped: AnyRecord, families: any, selected: any): string {
    return groups
        .map((group: any) => {
            const items = grouped[group.id] || [];
            const collapsedClass = group.collapsed ? ' collapsed' : '';
            const chevron = group.collapsed ? '▶' : '▼';
            return `
                <div class="element-group${collapsedClass}" data-group-id="${group.id}" data-drop-zone="element-group">
                    <div class="element-group-header" data-cc-call-click="handleToggleElementGroupCollapse|s:${encodeURIComponent(`${group.id}`)}">
                        <span class="element-group-chevron">${chevron}</span>
                        <span class="element-group-color" style="background:${escapeHtml(group.color)};"></span>
                        <span class="element-group-name">${escapeHtml(group.name)}</span>
                        <span class="element-group-count">(${items.length})</span>
                        <button class="element-group-btn" data-cc-call-click="handleRenameElementGroup|s:${encodeURIComponent(`${group.id}`)}" data-cc-stop="1" title="${t('editGroup') || 'Edit'}">
                            ${getIcon('edit', { size: '11px' })}
                        </button>
                        <button class="element-group-btn" data-cc-call-click="handleRemoveElementGroup|s:${encodeURIComponent(`${group.id}`)}" data-cc-stop="1" title="${t('removeGroup') || 'Remove'}">
                            ${getIcon('x', { size: '11px' })}
                        </button>
                    </div>
                    ${_renderElementGroupContent(group, items, families, selected)}
                </div>`;
        })
        .join('');
}

/**
 * Render the ungrouped elements section or flat list.
 * @param {any[]} groups
 * @param {any[]} ungrouped
 * @param {any} families
 * @param {any|null} selected
 * @returns {string}
 */
function _renderUngroupedElements(groups: any[], ungrouped: any[], families: any, selected: any): string {
    const cards = ungrouped.map((el: any) => _renderElementCard(el, families, selected)).join('');
    if (groups.length === 0) return cards;
    const ungCollapsed = isElementUngroupedCollapsed();
    const ungCollapsedClass = ungCollapsed ? ' collapsed' : '';
    const ungChevron = ungCollapsed ? '▶' : '▼';
    return `
        <div class="element-group element-group-ungrouped${ungCollapsedClass}" data-group-id="" data-drop-zone="element-group">
            <div class="element-group-header" data-cc-action="cc-ce7fde08">
                <span class="element-group-chevron">${ungChevron}</span>
                <span class="element-group-name">${t('ungrouped') || 'Ungrouped'}</span>
                <span class="element-group-count">(${ungrouped.length})</span>
            </div>
            <div class="element-group-content">
                ${cards}
            </div>
        </div>`;
}

/**
 * Render the "Add Group" button.
 * @returns {string}
 */
function _renderAddGroupButton(): string {
    return `
        <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px; width:100%;"
                data-cc-action="cc-4f0206b2">
            ${getIcon('folder-plus', { size: '14px' })} ${t('addGroup') || 'Add Group'}
        </button>`;
}

/**
 * Render the interpolation layers (Surfaces) section.
 * @param {any[]} layers
 * @returns {string}
 */
function _renderSurfacesSection(layers: any[]): string {
    if (layers.length === 0) return '';
    const selLayer = getSelectedLayer();
    return `
        <div class="element-group" style="margin-top:8px;">
            <div class="element-group-header" style="cursor:default;">
                <span class="element-group-chevron">▼</span>
                <span class="element-group-name">${t('surfacesGroup') || 'Surfaces'}</span>
                <span class="element-group-count">(${layers.length})</span>
            </div>
            <div class="element-group-content">
                ${layers.map((l: any) => _renderLayerCard(l, selLayer)).join('')}
            </div>
        </div>`;
}

/**
 * Render the voxel volumes (Geology) section.
 * @param {any[]} volumes
 * @returns {string}
 */
function _renderGeologySection(volumes: any[]): string {
    if (volumes.length === 0) return '';
    const selVolume = getSelectedVolume();
    return `
        <div class="element-group" style="margin-top:8px;">
            <div class="element-group-header" style="cursor:default;">
                <span class="element-group-chevron">▼</span>
                <span class="element-group-name">${t('geologyGroup') || 'Geology'}</span>
                <span class="element-group-count">(${volumes.length})</span>
            </div>
            <div class="element-group-content">
                ${volumes.map((v: any) => _renderVolumeCard(v, selVolume)).join('')}
            </div>
        </div>`;
}

/**
 * Mount group mode switchers and non-visual group view renderers.
 * @param {HTMLElement} container
 */
function _mountGroupViewWidgets(container: HTMLElement) {
    const switcherHosts = container.querySelectorAll('[data-group-mode-switcher-id]');
    for (const host of switcherHosts) {
        const gid = host.getAttribute('data-group-mode-switcher-id');
        if (gid) renderModeSwitcher(host, gid);
    }
    const gvchHosts = container.querySelectorAll('[data-gvch-id]');
    for (const host of gvchHosts) {
        const gid = host.getAttribute('data-gvch-id');
        if (gid && getGroupViewMode(gid) !== 'visual') mountGroupViewContent(host, gid);
    }
}

export function updateElementsList( _onToggleVisibility: any = null, _onRemove: any = null) {
    const container = document.getElementById('elements-list');
    if (!container) return;
    const elements = getAllElements();
    const families = getAllFamilies();
    const selected = getSelectedElement();
    const groups = getElementGroups();
    const layers = getAllLayers();
    _updateFamilyFilterOptions(elements, families);
    _rescueDetailsSection(container);
    if (elements.length === 0 && layers.length === 0) {
        container.innerHTML = _renderElementsEmptyState();
        return;
    }
    if (CONFIG.FEATURES?.SPATIAL_HIERARCHY && _hasAnyContainer(elements, families)) {
        _renderHierarchyTreeIntoContainer(container, elements, families, selected);
        _positionDetailsSection((localStorage.getItem('ecbyts-details-docked') || '') === 'true');
        return;
    }
    const { grouped, ungrouped } = _partitionElementsByGroup(elements, groups);
    let html = '';
    html += _renderElementGroups(groups, grouped, families, selected);
    html += _renderUngroupedElements(groups, ungrouped, families, selected);
    html += _renderAddGroupButton();
    html += _renderSurfacesSection(layers);
    html += _renderGeologySection(getAllVolumes());
    destroyAllGroupViews();
    container.innerHTML = html;
    _mountGroupViewWidgets(container);
    _installElementDnD(container);
    _positionDetailsSection((localStorage.getItem('ecbyts-details-docked') || '') === 'true');
}
// ----------------------------------------------------------------
// HIERARQUIA ESPACIAL PDPL-U / PDPLU
// Renderiza arvore Project → Area → Zone → Element
// quando FEATURES.SPATIAL_HIERARCHY esta habilitado
// ----------------------------------------------------------------
/**
 * Verifica se o modelo tem algum elemento container.
 * Usado para decidir entre modo arvore e modo lista plana.
 *
 * @param {any[]} families - Lista de todos os elementos
 * @param {any} families - Mapa de familias
 * @returns {boolean}
 */
function _hasAnyContainer( elements: any, families: any) {
    return elements.some((el: any) => families[el.family]?.isContainer);
}
/**
 * Renderiza a arvore hierarquica completa no container.
 * Substitui a logica de lista plana quando SPATIAL_HIERARCHY esta ativo.
 *
 * @param {HTMLElement} container - Elemento DOM #elements-list
 * @param {any[]} elements - Todos os elementos
 * @param {any} families - Mapa de familias
 * @param {any|null} selected - Elemento selecionado
 */
function _renderHierarchyTreeIntoContainer( container: any, elements: any, families: any, selected: any) {
    const tree = getElementTree();
    let html = '';
    // Botoes para adicionar containers
    html += `<div class="hierarchy-add-bar">
        <button class="btn btn-secondary btn-xs hierarchy-add-btn"
                data-cc-action="cc-326f220d"
                title="${t('lists.addProjectTooltip')}">
            ${getIcon('folder-plus', { size: '13px' })} ${t('lists.projectButton')}
        </button>
        <button class="btn btn-secondary btn-xs hierarchy-add-btn"
                data-cc-action="cc-f8d43919"
                title="${t('lists.addAreaTooltip')}">
            ${getIcon('map', { size: '13px' })} ${t('lists.areaButton')}
        </button>
        <button class="btn btn-secondary btn-xs hierarchy-add-btn"
                data-cc-action="cc-57193b1e"
                title="${t('lists.addZoneTooltip')}">
            ${getIcon('square', { size: '13px' })} ${t('lists.zoneButton')}
        </button>
    </div>`;
    // Arvore recursiva
    for (const node of tree) {
        html += _renderHierarchyNode(node, families, selected, 0);
    }
    // Zona de drop para raiz (fora de qualquer container)
    html += `<div class="hierarchy-root-drop" data-parent-id="" title="${t('lists.dropRootTooltip')}"></div>`;
    container.innerHTML = html;
    _installHierarchyDnD(container);
}
/**
 * Renderiza um no da arvore hierarquica (container ou folha) recursivamente.
 *
 * @param {any} node - No da arvore
 * @param {any} families - Mapa de familias
 * @param {any|null} selected - Elemento selecionado
 * @param {number} depth - Nivel de profundidade (0 = raiz)
 * @returns {string} HTML
 */
function _renderHierarchyNode( node: any, families: any, selected: any, depth: any) {
    const { element, children } = node;
    const family = families[element.family];
    const isContainer = family?.isContainer === true;
    const indent = depth * 16;
    const collapsed = (localStorage.getItem(`ecbyts-container-expanded-${element.id}`) || '') !== '1';
    const effectiveVis = isEffectivelyVisible(element.id);
    const opacityClass = effectiveVis ? '' : 'opacity-50';
    const selectedClass = selected?.id === element.id ? 'selected' : '';
    if (isContainer) {
        const chevron = collapsed ? '&#9654;' : '&#9660;';
        const childCount = children.length;
        const visibilityIcon = element.visible
            ? getIcon('eye', { size: '13px' })
            : getIcon('eye-off', { size: '13px' });
        let html = `
            <div class="hierarchy-container-node ${opacityClass} ${selectedClass}"
                 data-element-id="${element.id}"
                 data-drop-zone="hierarchy-container"
                 style="padding-left:${indent}px"
                 draggable="true">
                <div class="hierarchy-container-header" data-cc-call-click="handleSelectElement|s:${encodeURIComponent(`${element.id}`)}">
                    <span class="hierarchy-chevron"
                          data-cc-call-click="handleToggleContainerCollapse|s:${encodeURIComponent(`${element.id}`)}" data-cc-stop="1">${chevron}</span>
                    <span class="hierarchy-container-icon">${getIcon(family?.icon || 'folder', { size: '13px' })}</span>
                    <span class="hierarchy-container-name" title="${escapeAttr(element.name)}">${escapeHtml(element.name)}</span>
                    <span class="hierarchy-child-count">(${childCount})</span>
                    <button class="element-card-toggle"
                            data-cc-call-click="handleToggleVisibility|s:${encodeURIComponent(`${element.id}`)}" data-cc-stop="1"
                            title="${element.visible ? t('common.show') : t('common.hide')}">${visibilityIcon}</button>
                    <button class="element-card-delete"
                            data-cc-call-click="handleRemoveElement|s:${encodeURIComponent(`${element.id}`)}" data-cc-stop="1"
                            title="${t('common.remove')}">${getIcon('x', { size: '12px' })}</button>
                </div>`;
        if (!collapsed) {
            html += `<div class="hierarchy-children">`;
            for (const child of children) {
                html += _renderHierarchyNode(child, families, selected, depth + 1);
            }
            if (children.length === 0) {
                html += `<div class="hierarchy-empty-drop" data-parent-id="${element.id}"
                               style="padding-left:${(depth + 1) * 16}px">
                            <span class="inspector-muted">Arraste elementos aqui</span>
                         </div>`;
            }
            html += `</div>`;
        }
        html += `</div>`;
        return html;
    }
    // Elemento folha - reutiliza card existente com indentacao
    return `<div style="padding-left:${indent}px" data-hierarchy-leaf="true">${_renderElementCard(element, families, selected)}</div>`;
}
/**
 * Instala drag-and-drop para reparentalizar elementos na arvore hierarquica.
 * Draggable: qualquer elemento; Target: containers e zona raiz.
 *
 * @param {HTMLElement} container - Container #elements-list
 */
function _installHierarchyDnD( container: any) {
    let draggingId: any = null;
    container.addEventListener(
        'dragstart',
        /** @param {any} elementId */ (e: any) => {
            const card = e.target.closest('[data-element-id]');
            if (!card) return;
            draggingId = card.dataset.elementId;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggingId);
            card.classList.add('hierarchy-dragging');
        },
    );
    container.addEventListener('dragend', (_e: any) => {
        draggingId = null;
        container.querySelectorAll('.hierarchy-drag-over').forEach((el: any) => el.classList.remove('hierarchy-drag-over'));
        container.querySelectorAll('.hierarchy-dragging').forEach((el: any) => el.classList.remove('hierarchy-dragging'));
    });
    container.addEventListener(
        'dragover',
        /** @param {any} elementId */ (e: any) => {
            const target = e.target.closest(
                '[data-drop-zone="hierarchy-container"], .hierarchy-root-drop, .hierarchy-empty-drop',
            );
            if (!target) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            container
                .querySelectorAll('.hierarchy-drag-over')
                .forEach((el: any) => el.classList.remove('hierarchy-drag-over'));
            target.classList.add('hierarchy-drag-over');
        },
    );
    container.addEventListener(
        'dragleave',
        /** @param {any} elementId */ (e: any) => {
            // Ignora dragleave disparado por filhos do mesmo target
            const target = e.target.closest(
                '[data-drop-zone="hierarchy-container"], .hierarchy-root-drop, .hierarchy-empty-drop',
            );
            if (target && !target.contains(e.relatedTarget)) {
                target.classList.remove('hierarchy-drag-over');
            }
        },
    );
    container.addEventListener(
        'drop',
        /** @param {any} elementId */ (e: any) => {
            const target = e.target.closest(
                '[data-drop-zone="hierarchy-container"], .hierarchy-root-drop, .hierarchy-empty-drop',
            );
            if (!target || !draggingId) return;
            e.preventDefault();
            target.classList.remove('hierarchy-drag-over');
            const parentId = target.dataset.parentId || target.dataset.elementId || null;
            if (parentId !== draggingId) {
                window.handleSetParent(draggingId, parentId || null);
            }
            draggingId = null;
        },
    );
}
// ARCH-MONO-001 Phase 4: card renderers extracted to ./cardRenderers.js
import {
    renderElementCard as _renderElementCard,
    renderLayerCard as _renderLayerCard,
    renderVolumeCard as _renderVolumeCard,
} from './cardRenderers.js';
/**
 * Lightweight selection highlight - swaps CSS class without innerHTML rebuild.
 * Troca a classe .selected entre cards de elemento sem reconstruir a lista.
 * @param {string|null} elementId - ID do elemento a destacar (null para limpar)
 */
export function highlightSelectedElement( elementId: any) {
    const container = document.getElementById('elements-list');
    if (!container) return;
    // Limpa seleção de layers quando um elemento é selecionado
    const prevLayer = container.querySelector('.element-card[data-layer-id].selected');
    if (prevLayer) prevLayer.classList.remove('selected');
    const prev = container.querySelector('.element-card.selected');
    if (prev) prev.classList.remove('selected');
    // Aplica modo de layout (side ou docked) sempre que seleção muda,
    // mesmo que o card ainda não esteja renderizado na lista
    const docked = (localStorage.getItem('ecbyts-details-docked') || '') === 'true';
    const detailsSection = document.getElementById('element-details')?.closest('.section');
    const tab = document.getElementById('tab-elements');
    if (tab) {
        if (docked) {
            tab.classList.remove('details-side');
            tab.classList.add('details-docked');
            _initDetailsResize();
        } else {
            tab.classList.remove('details-docked');
            tab.classList.add('details-side');
            if (tab.style.display !== 'none') tab.style.display = 'flex';
        }
        if (detailsSection && detailsSection.parentElement !== tab) {
            tab.appendChild(detailsSection);
            detailsSection.style.display = '';
        }
    }
    if (elementId) {
        const card = container.querySelector(`[data-element-id="${elementId}"]`);
        if (card) {
            card.classList.add('selected');
        }
    }
}
/**
 * Lightweight layer selection highlight - swaps CSS class.
 * @param {string|null} layerId - ID da layer (null para limpar)
 */
export function highlightSelectedLayer( layerId: any) {
    const container = document.getElementById('elements-list');
    if (!container) return;
    // Limpa seleção de elementos quando uma layer é selecionada
    const prevEl = container.querySelector('.element-card[data-element-id].selected');
    if (prevEl) prevEl.classList.remove('selected');
    const prevLayer = container.querySelector('.element-card[data-layer-id].selected');
    if (prevLayer) prevLayer.classList.remove('selected');
    if (layerId) {
        const card = container.querySelector(`[data-layer-id="${layerId}"]`);
        if (card) card.classList.add('selected');
    }
}
/** Install HTML5 drag-and-drop for element cards → group zones. */
/**
 * @param {any} container
 */
function _installElementDnD( container: any) {
    _installDnD(container, {
        itemSelector: '.element-card[draggable]',
        dataAttr: 'elementId',
        zoneSelector: '[data-drop-zone="element-group"]',
        onAssign: setElementGroup,
        onClear: clearElementGroup,
        stopPropagation: true,
    });
}
// ----------------------------------------------------------------
// CONTROLES DE TRANSFORMACAO 3D
// ----------------------------------------------------------------
/**
 * Renderiza controles de posicao, escala, rotacao e cor.
 *
 * ARCH-MONOLITH-ATOMIZATION-001: a lógica pura de montagem do HTML foi extraída
 * para `_transformControlsPure.ts`. Este wrapper mantém o call site idêntico e
 * injeta `getIcon` como dependência.
 *
 * @param {any} element - Elemento selecionado
 * @returns {string} HTML
 */
function renderTransformControls( element: any) {
    return renderTransformControlsPure(element, { getIcon });
}
// ----------------------------------------------------------------
// SHAPE EDIT BUTTON
// Botão para entrar no modo de edição de forma (GIS-like)
// ----------------------------------------------------------------
/**
 * Renderiza botoes de edicao para o elemento selecionado.
 * - Familias com strategy: botao "Edit Shape" (entra em shape edit)
 * - Todas as familias: botao "Transform" (entra em gizmo mode)
 * - Se ja editando: botao "Done" + toggle gizmo/shape edit
 *
 * @param {any} element
 * @param {boolean} editable
 * @returns {string} HTML
 */
function renderShapeEditButton( element: any, editable: any) {
    if (!editable) return '';
    const isCurrentElement = isEditing() && getEditingElementId() === element.id;
    const mode = getEditMode();
    const canShapeEdit = hasStrategy(element.family);
    // Ja editando este elemento - mostra Done + toggle
    if (isCurrentElement) {
        let toggleBtn = '';
        if (canShapeEdit) {
            const toggleLabel = mode === 'gizmo' ? t('editShape') || 'Edit Shape' : t('transform') || 'Transform';
            const toggleIcon = mode === 'gizmo' ? 'edit-3' : 'move';
            toggleBtn = `
                <button type="button" class="btn btn-secondary btn-sm" style="width:100%; margin-bottom: 4px;"
                        data-cc-action="cc-fd3b8c3b">
                    ${getIcon(toggleIcon, { size: '14px' })}
                    <span>${toggleLabel}</span>
                    <span style="font-size:10px;color:var(--neutral-400);margin-left:4px;">(G)</span>
                </button>`;
        }
        return `
            <div style="margin: 8px 0;">
                ${toggleBtn}
                <button type="button" class="btn btn-secondary btn-sm" style="width:100%; border-color: var(--accent-green);"
                        data-cc-action="cc-f4678947">
                    ${getIcon('check', { size: '14px' })}
                    <span data-i18n="exitEditMode">${t('exitEditMode') || 'Done Editing'}</span>
                </button>
            </div>`;
    }
    // Nao editando - mostra botoes para entrar
    let html = '<div style="margin: 8px 0;">';
    if (canShapeEdit) {
        html += `
            <button type="button" class="btn btn-primary btn-sm" style="width:100%; margin-bottom: 4px;"
                    data-cc-call-click="handleEnterShapeEdit|s:${encodeURIComponent(`${element.id}`)}">
                ${getIcon('edit-3', { size: '14px' })}
                <span data-i18n="editShape">${t('editShape') || 'Edit Shape'}</span>
            </button>`;
    }
    html += `
        <button type="button" class="btn btn-secondary btn-sm" style="width:100%;"
                data-cc-call-click="handleEnterGizmoMode|s:${encodeURIComponent(`${element.id}`)}">
            ${getIcon('move', { size: '14px' })}
            <span>${t('transform') || 'Transform'}</span>
            <span style="font-size:10px;color:var(--neutral-400);margin-left:4px;">(W/E/R)</span>
        </button>`;
    html += '</div>';
    return html;
}
// ----------------------------------------------------------------
// DETALHES DO ELEMENTO
// ----------------------------------------------------------------
/**
 * Atualiza painel de detalhes do elemento selecionado.
 */
/**
 * Resolve the display family name for an element.
 * @param {any} element
 * @returns {string}
 */
function _resolveFamilyName(element: any): string {
    try {
        const familiesById = getAllFamilies();
        return getFamilyName(familiesById[element.family]) || element.family;
    } catch {
        return element.family;
    }
}

/**
 * Build the inline compliance badge HTML for an observation row.
 * @param {any} obs
 * @returns {string}
 */
function _buildObservationComplianceBadge(obs: any): string {
    if (!obs.parameterId || obs.value == null) return '';
    const res = validateObservationFull(obs, obs.parameterId);
    if (res.length === 0) return '';
    const r = res[0];
    if (r.severity === 'intervention')
        return `<span style="color:var(--accent-red);font-weight:700;" title="${t('lists.viTooltip')}">&#9888;</span>`;
    if (r.severity === 'prevention')
        return `<span style="color:var(--accent-yellow);" title="${t('lists.vpTooltip')}">&#9650;</span>`;
    return '';
}

/**
 * Render a single observation summary row (and expanded card if active).
 * @param {string} elementId
 * @param {any} obs
 * @param {number} originalIndex
 * @param {number|null} expandedIdx
 * @param {any[]} parameters
 * @param {any[]} units
 * @param {boolean} editable
 * @param {any[]} allCampaignsCache
 * @returns {string}
 */
function _renderObservationSummaryRow(
    elementId: string,
    obs: any,
    originalIndex: number,
    expandedIdx: any,
    parameters: any[],
    units: any[],
    editable: boolean,
    allCampaignsCache: any[],
): string {
    const param = parameters.find((p: any) => p.id === obs.parameterId);
    const unit = units.find((u: any) => u.id === obs.unitId);
    const pName = param?.name || obs.parameterId || '—';
    const val = obs.detect_flag === 'N' ? '<LQ' : obs.value != null ? obs.value : '—';
    const uSymbol = unit?.symbol || obs.unitId || '';
    const date = obs.date ? obs.date.slice(5) : '';
    const isExp = expandedIdx === originalIndex;
    const badge = _buildObservationComplianceBadge(obs);
    return `
        <tr style="cursor:pointer;border-bottom:1px solid var(--neutral-800);${isExp ? 'background:var(--neutral-750);' : ''}"
            data-cc-call-click="handleExpandObservation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(originalIndex))}">
            <td style="padding:3px 4px;color:var(--neutral-500);">${originalIndex + 1}</td>
            <td style="padding:3px 4px;max-width:100px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(pName)}">${escapeHtml(pName)}</td>
            <td style="padding:3px 4px;text-align:right;font-variant-numeric:tabular-nums;">${val}</td>
            <td style="padding:3px 4px;color:var(--neutral-400);">${escapeHtml(uSymbol)}</td>
            <td style="padding:3px 4px;color:var(--neutral-500);">${date}</td>
            <td style="padding:3px 2px;">${badge}</td>
        </tr>
        ${isExp ? `<tr><td colspan="6" style="padding:0;">${observationRow(elementId, obs, originalIndex, editable, allCampaignsCache)}</td></tr>` : ''}`;
}

/**
 * Render the expanded body of an observation campaign group.
 * @param {string} elementId
 * @param {any[]} items
 * @param {number|null} expandedIdx
 * @param {any[]} parameters
 * @param {any[]} units
 * @param {boolean} editable
 * @param {any[]} allCampaignsCache
 * @returns {string}
 */
function _renderObsCampaignBody(
    elementId: string,
    items: any[],
    expandedIdx: any,
    parameters: any[],
    units: any[],
    editable: boolean,
    allCampaignsCache: any[],
): string {
    const rows = items
        .map(({ obs, originalIndex }: any) =>
            _renderObservationSummaryRow(elementId, obs, originalIndex, expandedIdx, parameters, units, editable, allCampaignsCache),
        )
        .join('');
    return `
        <div class="obs-campaign-body" style="margin-top:2px;">
            <table style="width:100%;border-collapse:collapse;font-size:10px;">
                <thead>
                    <tr style="color:var(--neutral-400);border-bottom:1px solid var(--neutral-700);">
                        <th style="text-align:left;padding:2px 4px;font-weight:500;">#</th>
                        <th style="text-align:left;padding:2px 4px;font-weight:500;">${t('parameter')}</th>
                        <th style="text-align:right;padding:2px 4px;font-weight:500;">${t('value')}</th>
                        <th style="text-align:left;padding:2px 4px;font-weight:500;">${t('unit')}</th>
                        <th style="text-align:left;padding:2px 4px;font-weight:500;">${t('date')}</th>
                        <th style="padding:2px;"></th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
        </div>`;
}

/**
 * Render one observation campaign group.
 * @param {string} elementId
 * @param {string} key
 * @param {any[]} items
 * @param {Map<string, any>} campaignMap
 * @param {number|null} expandedIdx
 * @param {any[]} parameters
 * @param {any[]} units
 * @param {boolean} editable
 * @param {any[]} allCampaignsCache
 * @returns {string}
 */
function _renderObsCampaignGroup(
    elementId: string,
    key: string,
    items: any[],
    campaignMap: Map<string, any>,
    expandedIdx: any,
    parameters: any[],
    units: any[],
    editable: boolean,
    allCampaignsCache: any[],
): string {
    const campaign = campaignMap.get(key);
    const campName = key === '__none__' ? t('noCampaign') || 'No Campaign' : campaign?.name || key;
    const isExpanded = _obsCampaignExpanded.has(`${elementId}:${key}`);
    const chevron = isExpanded ? '&#9662;' : '&#9656;';
    const borderColor = campaign?.color ? escapeHtml(campaign.color) : 'var(--neutral-600)';
    const body = isExpanded
        ? _renderObsCampaignBody(elementId, items, expandedIdx, parameters, units, editable, allCampaignsCache)
        : '';
    return `
        <div class="obs-campaign-group" style="margin-bottom:4px;">
            <div class="obs-campaign-header" style="display:flex;align-items:center;gap:6px;padding:5px 8px;background:var(--neutral-800);border-radius:4px;cursor:pointer;font-size:11px;border-left:3px solid ${borderColor};"
                 data-cc-call-click="handleToggleObsCampaign|s:${encodeURIComponent(`${elementId}`)}|s:${encodeURIComponent(`${key}`)}">
                <span style="font-size:10px;width:12px;color:var(--neutral-400);">${chevron}</span>
                <span style="font-weight:600;flex:1;color:var(--neutral-100);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(campName)}</span>
                <span style="font-size:10px;color:var(--neutral-400);flex-shrink:0;">${items.length} obs</span>
            </div>
            ${body}
        </div>`;
}

/**
 * Render the observations section content.
 * @param {any} element
 * @param {any[]} observations
 * @param {boolean} editable
 * @returns {string}
 */
function _renderObservationsSection(element: any, observations: any[], editable: boolean): string {
    const pendingCount = observations.filter((o: any) => o._status === 'pending').length;
    const pendingBadge = pendingCount > 0 ? ` <span class="badge badge-pending">${pendingCount} pending</span>` : '';
    const bodyHtml =
        observations.length === 0
            ? `
                <p style="color: var(--neutral-500); font-size: 11px;">
                    <span data-i18n="noObservations">No observations added.</span>
                </p>`
            : (() => {
                  const allCampaignsCache = getAllCampaigns();
                  const campaignMap = new Map<string, any>();
                  allCampaignsCache.forEach((c: any) => campaignMap.set(c.id, c));
                  const { grouped, keys } = groupObservationsByCampaign(
                      observations,
                      (key: any) => campaignMap.get(key)?.name,
                  );
                  const expandedIdx = _obsExpandedIdx[element.id];
                  const parameters = CONFIG.PARAMETERS || [];
                  const units = CONFIG.UNITS || [];
                  return keys
                      .map((key: any) =>
                          _renderObsCampaignGroup(
                              element.id,
                              key,
                              grouped[key],
                              campaignMap,
                              expandedIdx,
                              parameters,
                              units,
                              editable,
                              allCampaignsCache,
                          ),
                      )
                      .join('');
              })();
    const addButton = editable
        ? `
            <button type="button" class="btn btn-secondary" style="margin-top: 8px;"
                    data-cc-call-click="handleAddObservation|s:${encodeURIComponent(`${element.id}`)}">
                ${getIcon('plus', { size: '14px' })} <span data-i18n="addObservation">Add Observation</span>
            </button>`
        : '';
    const observerPanel = isObserver() ? renderObserverPanel() : '';
    return `
        <div class="section ${(window as any).sectionClass?.('obs-' + element.id) ?? 'collapsed'}" data-section-id="obs-${element.id}" style="margin-top: 12px;">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="observations">Observations</span>
                <span style="font-size:10px;color:var(--neutral-400);margin-left:4px;">(${observations.length})</span>
                ${pendingBadge}
                <span class="chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${bodyHtml}
                ${addButton}
                ${observerPanel}
            </div>
        </div>`;
}

export function updateElementDetails() {
    const container = document.getElementById('element-details');
    if (!container) return;
    const element = getSelectedElement();
    if (!element) {
        container.innerHTML = `
            <p style="color: var(--neutral-500); font-size: 11px;">
                <span data-i18n="selectElementPrompt">Select an element to edit its properties.</span>
            </p>
        `;
        return;
    }
    const observations = Array.isArray(element.data?.observations) ? element.data.observations : [];
    const editable = !isAccessControlActive() || canEditElement(element.id);
    const familyName = _resolveFamilyName(element);
    const nameLabelChecked = (() => {
        const p = getPerElementLabel(element.id);
        return !p || p.nameLabel !== false ? 'checked' : '';
    })();
    const obsLabelChecked = (() => {
        const p = getPerElementLabel(element.id);
        return !p || p.obsLabel !== false ? 'checked' : '';
    })();
    container.innerHTML = `
        ${buildStructuredHeader(element, { familyName, editable, t })}
        <div class="form-group" style="display:none">
            <input type="hidden" value="${escapeHtml(element.iconClass || '')}">
        </div>
        <div class="form-row label-3d-controls" style="gap:12px; margin: 4px 0 8px;">
            <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;">
                <input data-field-meta="true" data-field-meta-key="element:${element.id}:ui:nameLabel3d" type="checkbox" ${nameLabelChecked}
                    data-cc-call-change="handleToggleElementLabel|s:${encodeURIComponent(`${element.id}`)}|s:nameLabel|c">
                <span data-i18n="show3dNameLabel">Show 3D Name</span>
            </label>
            <label style="display:flex; align-items:center; gap:4px; font-size:12px; cursor:pointer;">
                <input data-field-meta="true" data-field-meta-key="element:${element.id}:ui:obsLabel3d" type="checkbox" ${obsLabelChecked}
                    data-cc-call-change="handleToggleElementLabel|s:${encodeURIComponent(`${element.id}`)}|s:obsLabel|c">
                <span data-i18n="show3dObsLabel">Show 3D Obs</span>
            </label>
        </div>
        ${_renderObservationsSection(element, observations, editable)}
        ${_renderPhotosSection(element)}
        ${_renderTaxonomyFields(element, editable)}
        ${renderElementCostsSection(element, editable)}
        <div class="section ${(window as any).sectionClass?.('transform-' + element.id) ?? 'collapsed'}" data-section-id="transform-${element.id}" style="margin-top: 12px;">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="transformAppearance">${t('transformAppearance') || 'Transform & Appearance'}</span>
                <span class="chevron">▼</span>
            </div>
            <div class="section-content">
                ${renderTransformControls(element)}
                ${renderShapeEditButton(element, editable)}
                ${element.family === 'boundary' ? renderBoundaryControls(element) : ''}
                ${element.family === 'sensor' ? renderSensorSummaryControls(element) : ''}
                ${element.family === 'area' ? renderAreaControls(element) : ''}
                ${renderOrgUnitDropdown(element)}
            </div>
        </div>
    `;
    hydrateIcons(container);
    _hydratePhotoThumbs(container);
}
/**
 * Lazy-load photo thumbnails from IDB after DOM render.
 * @param {HTMLElement} container
 */
function _hydratePhotoThumbs( container: any) {
    const imgs = container.querySelectorAll('.photolog-lazy-thumb');
    for (const img of imgs) {
        const photoImg = img;
        const photoId = photoImg.dataset.photoId || '';
        if (photoId) {
            getPhotoThumb(photoId)
                .then(
                    /** @param {any} element */ (blob: any) => {
                        if (blob) {
                            photoImg.src = URL.createObjectURL(blob);
                        }
                    },
                )
                .catch(
                    /** @param {any} _e */ (_e: any) => console.debug('[utils/ui/lists:silent-catch]', _e?.message || _e),
                );
        }
    }
}
/**
 * Render photos section for element detail panel.
 * Mostra strip horizontal de thumbnails com link para galeria.
 *
 * @param {any} element - Element object
 * @returns {string} HTML string
 */
function _renderPhotosSection( element: any) {
    const photos = getPhotosByElement(element.id);
    const count = photos.length;
    const maxShow = 6;
    return `
        <div class="section ${window.sectionClass?.('photos-' + element.id) ?? 'collapsed'}" data-section-id="photos-${element.id}" style="margin-top: 12px;">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="photolog.title">Fotos</span>
                <span style="font-size:10px;color:var(--neutral-400);margin-left:4px;">(${count})</span>
                <span class="chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${
                    count === 0
                        ? `<p style="color:var(--neutral-500);font-size:11px;">
                        <span data-i18n="photolog.noPhotos">Nenhuma foto ainda.</span>
                    </p>`
                        : `<div class="photolog-thumb-strip" style="display:flex;gap:6px;overflow-x:auto;padding:4px 0;">
                        ${photos
                            .slice(0, maxShow)
                            .map(
                                /** @param {any} element */ (p: any) => `
                            <div class="photolog-thumb-card" data-photo-id="${p.id}" style="flex-shrink:0;width:80px;height:80px;border-radius:6px;overflow:hidden;background:var(--neutral-800);cursor:pointer;position:relative;"
                                 data-cc-call-click="handleOpenPhotoLog|s:${encodeURIComponent(`${element.id}`)}">
                                <img class="photolog-lazy-thumb" data-photo-id="${p.id}" style="width:100%;height:100%;object-fit:cover;" alt="${escapeAttr(p.description || p.filename)}">
                            </div>
                        `,
                            )
                            .join('')}
                        ${
                            count > maxShow
                                ? `
                            <div style="flex-shrink:0;width:80px;height:80px;border-radius:6px;background:var(--neutral-800);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--neutral-400);font-size:12px;"
                                 data-cc-call-click="handleOpenPhotoLog|s:${encodeURIComponent(`${element.id}`)}">
                                +${count - maxShow}
                            </div>
                        `
                                : ''
                        }
                    </div>`
                }
                <button type="button" class="btn btn-secondary" style="margin-top:8px;"
                        data-cc-call-click="handleCapturePhoto|s:${encodeURIComponent(`${element.id}`)}">
                    ${getIcon('plus', { size: '14px' })} <span data-i18n="photolog.capture">Adicionar Foto</span>
                </button>
            </div>
        </div>
    `;
}
/**
 * Render taxonomy data dictionary fields for an element.
 * Renderiza campos de dicionarios de dados (taxonomias) ativos para o elemento.
 *
 * @param {any} element - Element with .family
 * @param {boolean} element - Se pode editar
 * @returns {string} HTML string (empty if no active taxonomies for this family)
 */
/**
 * Group taxonomy fields by taxonomyId + sectionId.
 * @param {any[]} fields
 * @returns {Map<string, any>}
 */
function _groupTaxonomyFields(fields: any[]) {
    const sections = new Map();
    for (const entry of fields) {
        const key = `${entry.taxonomyId}::${entry.sectionId}`;
        if (!sections.has(key)) {
            sections.set(key, {
                taxonomyId: entry.taxonomyId,
                taxonomyName: entry.taxonomyName,
                sectionId: entry.sectionId,
                sectionNameKey: entry.sectionNameKey,
                fields: [],
            });
        }
        sections.get(key).fields.push(entry.field);
    }
    return sections;
}

type TaxonomyFieldContext = {
    element: any;
    section: any;
    field: any;
    val: any;
    escapedVal: any;
    ro: string;
};

/**
 * Render an enum taxonomy field.
 * @param {TaxonomyFieldContext} ctx
 * @returns {string}
 */
function _renderTaxonomyEnumField(ctx: TaxonomyFieldContext): string {
    const { element, section, field, val, ro } = ctx;
    let html = `<select data-field-meta="true" data-field-meta-key="element:${element.id}:taxonomy:${section.taxonomyId}:${field.id}" class="form-input" style="font-size:11px;" ${ro}
        data-cc-call-change="handleTaxonomyFieldChange|s:${encodeURIComponent(`${element.id}`)}|s:${encodeURIComponent(`${section.taxonomyId}`)}|s:${encodeURIComponent(`${field.id}`)}|v">
        <option value="">--</option>`;
    for (const opt of field.options || []) {
        const sel = String(val) === String(opt.value) ? 'selected' : '';
        const optLabel = opt.labelKey || opt.value;
        html += `<option value="${escapeHtml(String(opt.value))}" ${sel} data-i18n="${escapeHtml(optLabel)}">${escapeHtml(optLabel)}</option>`;
    }
    html += `</select>`;
    return html;
}

/**
 * Render a boolean taxonomy field.
 * @param {TaxonomyFieldContext} ctx
 * @returns {string}
 */
function _renderTaxonomyBooleanField(ctx: TaxonomyFieldContext): string {
    const { element, section, field, val, ro } = ctx;
    return `<label style="display:flex;align-items:center;gap:4px;font-size:11px;cursor:pointer;">
        <input data-field-meta="true" data-field-meta-key="element:${element.id}:taxonomy:${section.taxonomyId}:${field.id}" type="checkbox" ${val ? 'checked' : ''} ${ro}
            data-cc-call-change="handleTaxonomyFieldChange|s:${encodeURIComponent(`${element.id}`)}|s:${encodeURIComponent(`${section.taxonomyId}`)}|s:${encodeURIComponent(`${field.id}`)}|c">
    </label>`;
}

/**
 * Render a number taxonomy field.
 * @param {TaxonomyFieldContext} ctx
 * @returns {string}
 */
function _renderTaxonomyNumberField(ctx: TaxonomyFieldContext): string {
    const { element, section, field, escapedVal, ro } = ctx;
    return `<input data-field-meta="true" data-field-meta-key="element:${element.id}:taxonomy:${section.taxonomyId}:${field.id}" class="form-input" type="number" style="font-size:11px;"
        value="${escapedVal}" ${ro}
        ${field.min !== undefined ? `min="${field.min}"` : ''}
        ${field.max !== undefined ? `max="${field.max}"` : ''}
        data-cc-call-input="handleTaxonomyFieldChange|s:${encodeURIComponent(`${element.id}`)}|s:${encodeURIComponent(`${section.taxonomyId}`)}|s:${encodeURIComponent(`${field.id}`)}|va">`;
}

/**
 * Render a date taxonomy field.
 * @param {TaxonomyFieldContext} ctx
 * @returns {string}
 */
function _renderTaxonomyDateField(ctx: TaxonomyFieldContext): string {
    const { element, section, field, escapedVal, ro } = ctx;
    return `<input data-field-meta="true" data-field-meta-key="element:${element.id}:taxonomy:${section.taxonomyId}:${field.id}" class="form-input" type="date" style="font-size:11px;"
        value="${escapedVal}" ${ro}
        data-cc-call-input="handleTaxonomyFieldChange|s:${encodeURIComponent(`${element.id}`)}|s:${encodeURIComponent(`${section.taxonomyId}`)}|s:${encodeURIComponent(`${field.id}`)}|v">`;
}

/**
 * Render a string taxonomy field (default).
 * @param {TaxonomyFieldContext} ctx
 * @returns {string}
 */
function _renderTaxonomyStringField(ctx: TaxonomyFieldContext): string {
    const { element, section, field, escapedVal, ro } = ctx;
    return `<input data-field-meta="true" data-field-meta-key="element:${element.id}:taxonomy:${section.taxonomyId}:${field.id}" class="form-input" type="text" style="font-size:11px;"
        value="${escapedVal}" ${ro}
        ${field.maxLength ? `maxlength="${field.maxLength}"` : ''}
        data-cc-call-input="handleTaxonomyFieldChange|s:${encodeURIComponent(`${element.id}`)}|s:${encodeURIComponent(`${section.taxonomyId}`)}|s:${encodeURIComponent(`${field.id}`)}|v">`;
}

/**
 * Render the input HTML for a single taxonomy field.
 * @param {TaxonomyFieldContext} ctx
 * @returns {string}
 */
function _renderTaxonomyFieldInput(ctx: TaxonomyFieldContext): string {
    switch (ctx.field.type) {
        case 'enum':
            return _renderTaxonomyEnumField(ctx);
        case 'boolean':
            return _renderTaxonomyBooleanField(ctx);
        case 'number':
            return _renderTaxonomyNumberField(ctx);
        case 'date':
            return _renderTaxonomyDateField(ctx);
        default:
            return _renderTaxonomyStringField(ctx);
    }
}

/**
 * Render one taxonomy field group (label + input + help).
 * @param {any} element
 * @param {any} section
 * @param {any} field
 * @param {string} ro
 * @returns {string}
 */
function _renderTaxonomyFieldGroup(element: any, section: any, field: any, ro: string): string {
    const val = element.data?.taxonomy?.[section.taxonomyId]?.[field.id] ?? '';
    const escapedVal = typeof val === 'string' ? escapeHtml(val) : val;
    const reqMark = field.required ? ' *' : '';
    const nameKey = field.nameKey || field.id;
    const ctx: TaxonomyFieldContext = { element, section, field, val, escapedVal, ro };
    let html = `<div class="form-group" style="margin-bottom:6px;">`;
    html += `<label class="form-label" style="font-size:11px;" data-i18n="${escapeHtml(nameKey)}">${escapeHtml(nameKey)}${reqMark}</label>`;
    html += _renderTaxonomyFieldInput(ctx);
    if (field.helpKey) {
        html += `<span class="form-help" style="font-size:10px;color:var(--neutral-400);" data-i18n="${escapeHtml(field.helpKey)}">${escapeHtml(field.helpKey)}</span>`;
    }
    html += `</div>`;
    return html;
}

/**
 * Build the HTML for one taxonomy section.
 * @param {any} element
 * @param {any} section
 * @param {string} ro
 * @returns {string}
 */
function _buildTaxonomySectionHtml(element: any, section: any, ro: string): string {
    const sectionKey = `tax-${section.taxonomyId}-${section.sectionId}-${element.id}`;
    let fieldsHtml = '';
    for (const field of section.fields) {
        fieldsHtml += _renderTaxonomyFieldGroup(element, section, field, ro);
    }
    return `
        <div class="section ${(window as any).sectionClass?.('tax-' + sectionKey) ?? 'collapsed'}" data-section-id="tax-${sectionKey}" style="margin-top: 8px;">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="${escapeHtml(section.sectionNameKey)}">${escapeHtml(section.sectionNameKey)}</span>
                <span class="badge" style="font-size:9px;padding:1px 5px;margin-left:4px;background:var(--primary-700);color:var(--neutral-100);border-radius:3px;">${escapeHtml(section.taxonomyName)}</span>
                <span class="chevron">&#9660;</span>
            </div>
            <div class="section-content">
                ${fieldsHtml}
            </div>
        </div>`;
}

function _renderTaxonomyFields( element: any, editable: any) {
    let fields;
    try {
        const resolver = (window as any).__ecbyts_taxonomy_resolver;
        if (!resolver) return '';
        fields = resolver.getFieldsForElement(element);
    } catch {
        return '';
    }
    if (!fields || fields.length === 0) return '';
    const ro = editable ? '' : 'readonly disabled';
    const sections = _groupTaxonomyFields(fields);
    let html = '';
    for (const [, section] of sections) {
        html += _buildTaxonomySectionHtml(element, section, ro);
    }
    return html;
}
/**
 * Render element costs section (L2 Cost Framework).
 * Mostra custos CAPEX/OPEX por fiscal year com totais.
 *
 * @param {any} element - Element object
 * @param {boolean} editable - Se pode editar
 * @returns {string} HTML string
 */
function renderElementCostsSection( element: any, editable: any) {
    const costs = Array.isArray(element?.data?.costs) ? element.data.costs : [];
    const hasCosts = costs.length > 0;
    const yearRows = costs
        .map(
            /** @param {any} entry */ (entry: any) => {
                const itemSummary = entry.items
                    .map(
                        /** @param {any} it */ (it: any) => `
            <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 0;">
                <span style="color:var(--neutral-400);text-transform:uppercase;font-size:9px;">${escapeHtml(it.categoryId)}·${escapeHtml(it.itemId)}</span>
                ${
                    editable
                        ? `
                    <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L1525" class="form-input form-input-sm" type="number" step="0.01"
                           style="width:80px;text-align:right;font-size:10px;" value="${it.amount}"
                           data-cc-call-input="handleElementCostItemChange|s:${encodeURIComponent(`${element.id}`)}|j:${encodeURIComponent(String(entry.fiscalYear))}|s:${encodeURIComponent(`${escapeHtml(it.categoryId)}`)}|s:${encodeURIComponent(`${escapeHtml(it.itemId)}`)}|v">
                `
                        : `<span>${it.amount.toFixed(2)}</span>`
                }
            </div>
        `,
                    )
                    .join('');
                // Basis selector (estimate / budget / actual)
                const basisOptions = ['estimate', 'budget', 'actual'];
                const basisHtml = editable
                    ? `
            <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L1540" style="font-size:9px;padding:0 2px;border:1px solid var(--neutral-600);border-radius:2px;background:transparent;color:var(--neutral-400);cursor:pointer;"
                    data-cc-call-change="handleChangeCostBasis|s:${encodeURIComponent(`${element.id}`)}|j:${encodeURIComponent(String(entry.fiscalYear))}|v">
                ${basisOptions.map((b: any) => `<option value="${b}" ${entry.basis === b ? 'selected' : ''}>${b}</option>`).join('')}
            </select>`
                    : `<span style="color:var(--neutral-400);font-size:9px;">${entry.basis || 'estimate'}</span>`;
                return `
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;font-weight:600;margin-bottom:2px;">
                    <span>${entry.fiscalYear}</span>
                    <div style="display:flex;align-items:center;gap:4px;">
                        ${basisHtml}
                        ${
                            editable
                                ? `<button class="btn-icon" style="font-size:9px;color:var(--neutral-400);cursor:pointer;border:none;background:none;padding:0 2px;" title="${t('removeCostYear') || 'Remove year'}"
                            data-cc-call-click="handleRemoveCostYear|s:${encodeURIComponent(`${element.id}`)}|j:${encodeURIComponent(String(entry.fiscalYear))}">&#10005;</button>`
                                : ''
                        }
                    </div>
                </div>
                ${itemSummary}
                <div style="display:flex;justify-content:space-between;font-size:10px;border-top:1px solid var(--neutral-700);margin-top:3px;padding-top:3px;">
                    <span style="color:var(--accent-blue);">CAPEX ${entry.currency || ''} ${(entry.capexTotal || 0).toFixed(2)}</span>
                    <span style="color:var(--accent-green);">OPEX ${entry.currency || ''} ${(entry.opexTotal || 0).toFixed(2)}</span>
                </div>
                <div style="text-align:right;font-size:11px;font-weight:600;">
                    Total: ${entry.currency || 'BRL'} ${(entry.total || 0).toFixed(2)}
                </div>
            </div>
        `;
            },
        )
        .join('');
    // Total geral do elemento (todos os anos)
    const grandTotal = costs.reduce((s: any, e: any) => s + (e.total || 0), 0);
    const grandCapex = costs.reduce((s: any, e: any) => s + (e.capexTotal || 0), 0);
    const grandOpex = costs.reduce((s: any, e: any) => s + (e.opexTotal || 0), 0);
    const currency = costs[0]?.currency || 'BRL';
    // Botão Add Year
    const addYearBtn = editable
        ? `
        <button class="btn btn-xs btn-secondary" style="font-size:10px;padding:2px 6px;margin-top:4px;"
                data-cc-call-click="handleAddCostYear|s:${encodeURIComponent(`${element.id}`)}">
            + ${t('addCostYear') || 'Add Year'}
        </button>`
        : '';
    return `
        <div class="section ${window.sectionClass?.('costs-' + element.id) ?? 'collapsed'}" data-section-id="costs-${element.id}" style="margin-top: 12px;">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span data-i18n="elementCosts">${t('elementCosts') || 'Costs'}</span>
                <span class="chevron">▼</span>
            </div>
            <div class="section-content">
                ${hasCosts ? yearRows : `<div style="font-size:11px;color:var(--neutral-400);padding:4px 0;">${t('noCostData') || 'No cost data.'}</div>`}
                ${
                    hasCosts
                        ? `
                    <div style="border-top:2px solid var(--neutral-600);margin-top:6px;padding-top:6px;font-size:11px;">
                        <div style="display:flex;justify-content:space-between;font-weight:600;">
                            <span data-i18n="totalAllYears">${t('totalAllYears') || 'Total (all years)'}</span>
                            <span>${currency} ${grandTotal.toFixed(2)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--neutral-400);">
                            <span>CAPEX: ${currency} ${grandCapex.toFixed(2)}</span>
                            <span>OPEX: ${currency} ${grandOpex.toFixed(2)}</span>
                        </div>
                    </div>
                `
                        : ''
                }
                ${addYearBtn}
            </div>
        </div>
    `;
}
/**
 * Render observer submission panel (for observers only).
 * Painel simplificado para observadores enviarem dados.
 */
function renderObserverPanel() {
    const parameters = CONFIG.PARAMETERS || [];
    const units = CONFIG.UNITS || [];
    return `
        <div class="observer-panel" style="margin-top: 12px; padding: 8px; border: 1px solid var(--neutral-700); border-radius: var(--radius-sm);">
            <div style="font-size: 11px; font-weight: 500; margin-bottom: 6px; color: var(--accent-blue);">
                ${getIcon('eye', { size: '12px' })} Observer — Submit Data
            </div>
            <div class="form-group" style="margin-bottom: 4px;">
                <select data-field-meta="true" data-field-meta-key="auto:observer-param" class="form-input form-input-sm" id="observer-param">
                    <option value="">Parameter...</option>
                    ${parameters.map((p: any) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
                </select>
            </div>
            <div style="display: flex; gap: 4px; margin-bottom: 4px;">
                <input data-field-meta="true" data-field-meta-key="auto:observer-value" class="form-input form-input-sm" type="number" step="any" id="observer-value"
                       placeholder="Value" style="flex: 1;">
                <select data-field-meta="true" data-field-meta-key="auto:observer-unit" class="form-input form-input-sm" id="observer-unit" style="flex: 1;">
                    <option value="">Unit...</option>
                    ${units.map((u: any) => `<option value="${u.id}">${escapeHtml(u.symbol || u.id)}</option>`).join('')}
                </select>
            </div>
            <div style="display: flex; gap: 4px; margin-bottom: 6px;">
                <input data-field-meta="true" data-field-meta-key="auto:observer-date" class="form-input form-input-sm" type="date" id="observer-date"
                       value="${new Date().toISOString().slice(0, 10)}" style="flex: 1;">
            </div>
            <button class="btn btn-sm btn-primary" data-cc-action="cc-be8f0090">
                Submit Observation
            </button>
            <div style="margin-top: 8px;">
                <textarea data-field-meta="true" data-field-meta-key="auto:observer-comment" class="form-input form-input-sm" id="observer-comment" rows="2"
                          placeholder="Add a comment..." style="resize: vertical;"></textarea>
                <button class="btn btn-sm btn-secondary" style="margin-top: 4px;"
                        data-cc-action="cc-82b0cac7">
                    Submit Comment
                </button>
            </div>
        </div>`;
}
// BINDING UI HELPERS - extracted to ./bindingHelpers.js in ARCH-MONO-001 Phase 4.
// Aliased to local names (leading `_`) to preserve existing call sites below.
import {
    isFieldBound as _isFieldBound,
    bindingClass as _bindingClass,
    bindableFieldLabel as _bindableFieldLabel,
    bindableNumberField as _bindableNumberField,
} from './bindingHelpers.js';
/**
 * @param {any} elementId
 * @param {any} obs
 * @param {any} index
 */
/**
 * Resolve bindings for an observation before rendering.
 * @param {any} obs
 * @param {any[]} campaigns
 */
function _resolveObservationBindings(obs: any, campaigns: any[]) {
    if (!obs.bindings || typeof obs.bindings !== 'object') return;
    const allElements = getAllElements();
    const elementMap = new Map();
    const observationMap = new Map();
    for (const el of allElements) {
        if (el?.id) elementMap.set(el.id, el);
        if (Array.isArray(el?.data?.observations)) {
            for (const o of el.data.observations) {
                if (o?.id) observationMap.set(o.id, o);
            }
        }
    }
    const campaignMap = new Map();
    for (const c of campaigns) {
        if (c?.id) campaignMap.set(c.id, c);
    }
    resolveObservation(obs, {
        getElementById: (id: any) => elementMap.get(id),
        getCampaignById: (id: any) => campaignMap.get(id),
        getObservationById: (id: any) => observationMap.get(id),
        getCalculatorMetric: () => null,
        getConstantById: (id: any) => getUserConstantById(id),
    });
}

/**
 * Compute status badge HTML for an observation.
 * @param {any} obs
 * @returns {string}
 */
function _buildObservationStatusBadge(obs: any): string {
    if (obs._status === 'pending') return ' <span class="badge badge-pending">pending</span>';
    if (obs._status === 'rejected') return ' <span class="badge badge-rejected">rejected</span>';
    if (obs._status === 'approved') return ' <span class="badge badge-approved">approved</span>';
    return '';
}

/**
 * Compute compliance badge HTML for an observation.
 * @param {any} obs
 * @returns {string}
 */
function _buildObservationComplianceBadge2(obs: any): string {
    if (!obs.parameterId || obs.value == null) return '';
    const results = validateObservationFull(obs, obs.parameterId);
    if (results.length === 0) return '';
    const r = results[0];
    const badge = resolveComplianceBadge(r.severity, r.exceedance);
    if (!badge) return '';
    return ` <span class="badge ${badge.cssClass}" title="${escapeHtml(r.message)}">${getIcon(badge.iconName, { size: '10px' })} ${badge.label}</span>`;
}

/**
 * Compute credential badge HTML for an observation.
 * @param {any} obs
 * @returns {string}
 */
function _buildObservationCredentialBadge(obs: any): string {
    const credLevel = obs.credentialLevel || 'common';
    if (credLevel === 'common') return '';
    const credLabel = EIS_CREDENTIAL_LABELS[credLevel] || '';
    const credMult = EIS_CREDENTIAL_MULTIPLIERS[credLevel] || 1.0;
    const credAuthor = obs.createdBy ? ` — ${escapeHtml(obs.createdBy)}` : '';
    return ` <span class="badge badge-credential badge-credential-${credLevel}" title="${t('eis.credential')}: ${credLabel} (T×${credMult})${credAuthor}">${credLabel}</span>`;
}

/**
 * Build the linked-project badge when planning mode is active.
 * @param {string} campaignId
 * @returns {string}
 */
function _buildLinkedProjectBadge(campaignId: string): string {
    const linkedProj = getProjects().find((p: any) => p.linkedCampaignIds.includes(campaignId));
    return linkedProj
        ? `<span class="gov-badge gov-status-active" style="font-size:0.6rem;cursor:default" title="${t('linkedProject') || 'Linked project'}">${escapeHtml(linkedProj.name)}</span>`
        : '';
}

/**
 * Render observation header action buttons.
 * @param {string} elementId
 * @param {number} index
 * @param {boolean} editable
 * @param {boolean} isPending
 * @returns {string}
 */
function _renderObservationHeaderActions(elementId: string, index: number, editable: boolean, isPending: boolean): string {
    if (!editable) return '';
    const approveReject = isPending
        ? `
            <button type="button" class="btn btn-icon" title="Approve"
                    data-cc-call-click="handleApproveObservation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}"
                    style="color:var(--accent-green);">
                ${getIcon('check', { size: '12px' })}
            </button>
            <button type="button" class="btn btn-icon" title="Reject"
                    data-cc-call-click="handleRejectObservation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}"
                    style="color:var(--accent-red);">
                ${getIcon('x', { size: '12px' })}
            </button>`
        : '';
    return `
        ${approveReject}
        <button type="button" class="btn btn-icon" title="${t('removeObservation')}"
                data-cc-call-click="handleRemoveObservation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}">
            ${getIcon('x', { size: '12px' })}
        </button>`;
}

/**
 * Render the observation card header.
 * @param {string} elementId
 * @param {number} index
 * @param {any} obs
 * @param {boolean} editable
 * @param {string} statusBadge
 * @param {string} credBadge
 * @param {string} nonDetectBadge
 * @param {string} complianceBadge
 * @returns {string}
 */
function _renderObservationHeader(
    elementId: string,
    index: number,
    obs: any,
    editable: boolean,
    statusBadge: string,
    credBadge: string,
    nonDetectBadge: string,
    complianceBadge: string,
): string {
    const isPending = obs._status === 'pending';
    const showPlanning = obs.showPlanning || false;
    const submitterInfo = obs._submittedBy
        ? `<span style="font-size:9px;color:var(--neutral-500);">by ${escapeHtml(obs._submittedBy)}</span>`
        : '';
    const planningToggle = editable
        ? `
            <label class="planning-toggle" title="${t('planningModeTooltip') || 'Toggle planning mode — shows planned fields and registers in campaign'}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L1780" type="checkbox" ${showPlanning ? 'checked' : ''}
                       data-cc-call-change="handleTogglePlanning|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}">
                <span class="planning-toggle-slider"></span>
                <span class="planning-toggle-label">${t('planningMode') || 'Plan'}</span>
            </label>`
        : '';
    const linkedProjectBadge = showPlanning && obs.campaignId ? _buildLinkedProjectBadge(obs.campaignId) : '';
    return `
        <div class="obs-header">
            <span class="obs-title">${t('observation')} #${index + 1}${statusBadge}${credBadge}${nonDetectBadge}${complianceBadge}</span>
            <div style="display:flex;gap:4px;align-items:center;">
                ${submitterInfo}
                ${planningToggle}
                ${linkedProjectBadge}
                ${_renderObservationHeaderActions(elementId, index, editable, isPending)}
            </div>
        </div>`;
}

/**
 * Render the position section of an observation card.
 * @param {string} elementId
 * @param {number} index
 * @param {any} obs
 * @param {boolean} editable
 * @returns {string}
 */
function _renderObservationPositionSection(elementId: string, index: number, obs: any, editable: boolean): string {
    return `
        <div class="obs-section">
            <div class="obs-section-title">${t('position')}</div>
            <div class="obs-position-grid">
                ${_bindableNumberField(elementId, index, obs, 'x', 'X', editable)}
                ${_bindableNumberField(elementId, index, obs, 'y', 'Cota', editable)}
                ${_bindableNumberField(elementId, index, obs, 'z', 'Y', editable)}
            </div>
        </div>`;
}

/**
 * Render the time/campaign section of an observation card.
 * @param {string} elementId
 * @param {number} index
 * @param {any} obs
 * @param {any[]} campaigns
 * @param {boolean} editable
 * @returns {string}
 */
function _renderObservationTimeSection(
    elementId: string,
    index: number,
    obs: any,
    campaigns: any[],
    editable: boolean,
): string {
    const dateReadonly = _isFieldBound(obs, 'date') ? 'readonly' : '';
    const campaignOptions = campaigns
        .map(
            (c: any) => `
                <option value="${c.id}" ${c.id === obs.campaignId ? 'selected' : ''}>
                    ${escapeHtml(c.name)}
                </option>`,
        )
        .join('');
    return `
        <div class="obs-section">
            <div class="obs-section-title">${t('time')}</div>
            <div class="obs-time-grid">
                <div class="form-group">
                    ${_bindableFieldLabel(elementId, index, obs, 'date', t('date'), editable)}
                    <input data-field-meta="true" data-field-meta-key="element:${elementId}:observation:${index}:date" class="form-input${_bindingClass(obs, 'date')}" type="date" value="${escapeHtml(obs.date || '')}"
                           ${dateReadonly}
                           data-cc-call-input="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:date|v">
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="campaign">${t('campaign')}</label>
                    <select data-field-meta="true" data-field-meta-key="element:${elementId}:observation:${index}:campaignId" class="form-input"
                            data-cc-call-change="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:campaignId|v">
                        <option value="">${t('selectCampaign')}</option>
                        ${campaignOptions}
                    </select>
                </div>
            </div>
        </div>`;
}

/**
 * Render the additional readings section of an observation card.
 * @param {string} elementId
 * @param {number} index
 * @param {any[]} additionalReadings
 * @param {any[]} parameters
 * @param {any[]} units
 * @returns {string}
 */
function _renderObservationAdditionalReadings(
    elementId: string,
    index: number,
    additionalReadings: any[],
    parameters: any[],
    units: any[],
): string {
    const readingsHtml = additionalReadings
        .map((reading: any, readingIndex: number) => {
            const rParam = parameters.find((p: any) => p.id === reading.parameterId);
            const rUnit = units.find((u: any) => u.id === (reading.unitId || rParam?.defaultUnitId));
            const rCompatible = rUnit ? units.filter((u: any) => u.dimension === rUnit.dimension) : [];
            const rBadge = rParam?.type === 'SI' ? '<span class="badge badge-si">SI</span>' : '<span class="badge badge-custom">Custom</span>';
            return renderReadingRow(
                elementId,
                index,
                readingIndex,
                reading,
                rParam,
                rUnit,
                rCompatible,
                parameters,
                units,
                rBadge,
                true,
            );
        })
        .join('');
    return `
        <div class="obs-section">
            <div class="obs-section-title">
                ${t('additionalData')}
                <button type="button" class="btn btn-link btn-sm add-field-btn"
                        data-cc-call-click="handleAddAdditionalReading|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}">
                    + ${t('addField')}
                </button>
            </div>
            <div class="obs-additional-readings">
                ${additionalReadings.length === 0 ? `<p class="obs-empty-msg">${t('noAdditionalReadings')}</p>` : readingsHtml}
            </div>
        </div>`;
}

/**
 * Compute the CSS class string for an observation card.
 * @param {any} obs
 * @returns {string}
 */
function _buildObservationCardClass(obs: any): string {
    let cls = 'obs-card';
    if (obs._status === 'pending') cls += ' obs-pending';
    if (obs._status === 'rejected') cls += ' obs-rejected';
    if (obs.showPlanning) cls += ' obs-planning-active';
    return cls;
}

/**
 * Compute the non-detect badge HTML for an observation.
 * @param {any} obs
 * @param {any} selectedUnit
 * @returns {string}
 */
function _buildNonDetectBadge(obs: any, selectedUnit: any): string {
    if (obs.detect_flag !== 'N') return '';
    return ` <span class="badge badge-nondetect" title="${t('lists.nonDetectTooltip', { limit: obs.detection_limit ?? '?', unit: selectedUnit?.symbol || '' })}" style="background:var(--neutral-700);color:var(--neutral-400);font-style:italic;">&lt;LQ</span>`;
}

function observationRow( elementId: any, obs: any, index: any, editable: any = true, campaignsCache: any = null) {
    const parameters = CONFIG.PARAMETERS || [];
    const units = CONFIG.UNITS || [];
    const campaigns = campaignsCache || getAllCampaigns();
    _resolveObservationBindings(obs, campaigns);
    const selectedParam = parameters.find((p: any) => p.id === obs.parameterId);
    const selectedUnit = units.find((u: any) => u.id === (obs.unitId || selectedParam?.defaultUnitId));
    const compatibleUnits = selectedUnit ? units.filter((u: any) => u.dimension === selectedUnit.dimension) : [];
    const paramType = selectedParam?.type || 'custom';
    const typeBadge = paramType === 'SI' ? '<span class="badge badge-si">SI</span>' : '<span class="badge badge-custom">Custom</span>';
    const additionalReadings = obs.additionalReadings || [];
    const statusBadge = _buildObservationStatusBadge(obs);
    const nonDetectBadge = _buildNonDetectBadge(obs, selectedUnit);
    const complianceBadge = _buildObservationComplianceBadge2(obs);
    const credBadge = _buildObservationCredentialBadge(obs);
    return `
        <div class="${_buildObservationCardClass(obs)}" data-obs-index="${index}">
            ${_renderObservationHeader(elementId, index, obs, editable, statusBadge, credBadge, nonDetectBadge, complianceBadge)}
            ${_renderObservationPositionSection(elementId, index, obs, editable)}
            ${_renderObservationTimeSection(elementId, index, obs, campaigns, editable)}
            <div class="obs-section">
                <div class="obs-section-title">QA/QC & Event</div>
                ${renderQaQcSection(elementId, obs, index, editable)}
            </div>
            <div class="obs-section">
                <div class="obs-section-title">${t('primaryReading')}</div>
                ${renderReadingRow(elementId, index, 'primary', obs, selectedParam, selectedUnit, compatibleUnits, parameters, units, typeBadge)}
            </div>
            ${_renderObservationAdditionalReadings(elementId, index, additionalReadings, parameters, units)}
            ${renderVariablesSection(elementId, obs, index)}
            ${renderObservationCostSection(elementId, obs, index, editable)}
        </div>
    `;
}
/**
 * Render QA/QC and event metadata section for an observation.
 * @param {string} elementId
 * @param {any} elementId
 * @param {number} index
 * @param {boolean} editable
 * @returns {string}
 */
function renderQaQcSection( elementId: any, obs: any, index: any, editable: any) {
    const sampleType = obs.sample_type || 'primary';
    const eventType = obs.event_type || 'routine';
    const eventSeverity = Number.isFinite(Number(obs.event_severity)) ? Number(obs.event_severity) : 0;
    const reviewedBy = obs.reviewed_by || '—';
    const reviewedAt = obs.reviewed_at ? new Date(obs.reviewed_at).toLocaleString() : '—';
    const dis = editable ? '' : 'disabled';
    return `
        <div style="display:flex;justify-content:flex-end;margin-bottom:6px;">
            <button type="button" class="btn btn-secondary btn-sm"
                    data-cc-action="cc-1de602df">
                ${getIcon('calculator', { size: '12px' })} Open Calculator
            </button>
        </div>
        <div class="obs-time-grid">
            <div class="form-group">
                <label class="form-label">Sample Type</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L1961" class="form-input" ${dis}
                        data-cc-call-change="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:sample_type|v">
                    ${[
                        'primary',
                        'duplicate',
                        'triplicate',
                        'split',
                        'blank_field',
                        'blank_trip',
                        'blank_equipment',
                        'blank_lab',
                        'spike',
                        'control',
                    ]
                        .map((v: any) => `<option value="${v}" ${v === sampleType ? 'selected' : ''}>${v}</option>`)
                        .join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">QA Pair ID</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L1981" class="form-input" type="text" ${dis}
                       value="${escapeHtml(obs.qa_pair_id || '')}"
                       data-cc-call-input="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:qa_pair_id|v">
            </div>
            <div class="form-group">
                <label class="form-label">Event Type</label>
                <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L1987" class="form-input" ${dis}
                        data-cc-call-change="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:event_type|v">
                    ${['routine', 'incident', 'catastrophic']
                        .map((v: any) => `<option value="${v}" ${v === eventType ? 'selected' : ''}>${v}</option>`)
                        .join('')}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label">Severity (0-5)</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L1996" class="form-input" type="number" min="0" max="5" step="0.1" ${dis}
                       value="${eventSeverity}"
                       data-cc-call-input="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:event_severity|v">
            </div>
        </div>
        <div class="obs-time-grid">
            <div class="form-group" style="grid-column: span 2;">
                <label class="form-label">Exception Justification</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2004" class="form-input" type="text" ${dis}
                       value="${escapeHtml(obs.exception_justification || '')}"
                       data-cc-call-input="handleObservationChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:exception_justification|v">
            </div>
            <div class="form-group">
                <label class="form-label">Reviewed By</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2010" class="form-input" type="text" disabled value="${escapeHtml(String(reviewedBy))}">
            </div>
            <div class="form-group">
                <label class="form-label">Reviewed At</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2014" class="form-input" type="text" disabled value="${escapeHtml(String(reviewedAt))}">
            </div>
        </div>
        ${
            editable && String(eventType).toLowerCase() === 'catastrophic' && !obs.reviewed_at
                ? `
            <div style="margin-top:6px;">
                <button type="button" class="btn btn-secondary btn-sm"
                        data-cc-call-click="handleReviewCatastrophicObservation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}">
                    ${getIcon('shield', { size: '12px' })} Mark Catastrophic Reviewed
                </button>
            </div>
        `
                : ''
        }
    `;
}
/**
 * Render cost section for an observation (L1 Cost Framework).
 * Mostra custo do ensaio analítico + coleta com fonte (catálogo/documento/usuário).
 *
 * @param {string} elementId - Element ID
 * @param {any} obs - Observation object
 * @param {number} index - Observation index
 * @param {boolean} editable - Se pode editar
 * @returns {string} HTML string
 */
function renderObservationCostSection( elementId: any, obs: any, index: any, editable: any) {
    const cost = obs.cost;
    if (!cost || !cost.items || cost.items.length === 0) {
        return `
            <div class="obs-section">
                <div class="obs-section-title">${t('cost') || 'Cost'}</div>
                <p class="obs-empty-msg">${t('noCostData') || 'No cost data.'}</p>
            </div>`;
    }
    const sourceBadge =
        cost.source === 'catalog'
            ? '<span class="badge badge-si" style="font-size:9px;">Catalog</span>'
            : cost.source === 'document'
              ? '<span class="badge badge-custom" style="font-size:9px;">Doc</span>'
              : '<span class="badge" style="font-size:9px;background:var(--accent-blue);color:#fff;">User</span>';
    const itemRows = cost.items
        .map(
            /** @param {any} obs */ (item: any) => `
        <div class="obs-cost-row" style="display:flex;justify-content:space-between;align-items:center;padding:2px 0;font-size:11px;">
            <span style="color:var(--neutral-400);text-transform:uppercase;font-size:9px;">${escapeHtml(item.categoryId)}·${escapeHtml(item.itemId)}</span>
            ${
                editable
                    ? `
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2067" class="form-input form-input-sm" type="number" step="0.01"
                       style="width:80px;text-align:right;" value="${item.amount}"
                       data-cc-call-input="handleObservationCostChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${escapeHtml(item.categoryId)}`)}|s:${encodeURIComponent(`${escapeHtml(item.itemId)}`)}|v">
            `
                    : `<span>${item.amount.toFixed(2)}</span>`
            }
        </div>
    `,
        )
        .join('');
    return `
        <div class="obs-section">
            <div class="obs-section-title">${t('cost') || 'Cost'} ${sourceBadge}</div>
            ${itemRows}
            <div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid var(--neutral-700);margin-top:4px;padding-top:4px;font-size:11px;font-weight:600;">
                <span>Total</span>
                <span>${cost.currency || 'BRL'} ${cost.total.toFixed(2)}</span>
            </div>
        </div>`;
}
/**
 * Render the variables section for an observation.
 * Renderiza variaveis como campos simplificados: nome = valor.
 * Cada variavel e uma linha editavel (nome e valor livres).
 *
 * @param {string} obs - Element ID
 * @param {any} obs - Observation object
 * @param {number} obs - Observation index
 * @returns {string} HTML string
 */
function renderVariablesSection( elementId: any, obs: any, index: any) {
    const variables = obs.variables || {};
    const varEntries = Object.entries(variables);
    return `
        <div class="obs-section">
            <div class="obs-section-title">
                ${t('variables')}
                <button type="button" class="btn btn-link btn-sm add-field-btn"
                        data-cc-call-click="handleAddObservationVariable|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}">
                    + ${t('addVariable')}
                </button>
            </div>
            <div class="obs-variables-list">
                ${
                    varEntries.length === 0
                        ? `
                    <p class="obs-empty-msg">${t('noVariables')}</p>
                `
                        : varEntries
                              .map(([varId, raw]: [string, any]) => {
                                  // Suporta formato legado (valor simples) e novo ({ value, unit })
                                  const isObj = typeof raw === 'object' && raw !== null;
                                  const val = isObj ? (raw.value ?? '') : String(raw ?? '');
                                  const unit = isObj ? (raw.unit ?? 'adimensional') : 'adimensional';
                                  return `
                    <div class="obs-var-row">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2126" class="form-input form-input-sm obs-var-name" type="text"
                               value="${escapeHtml(varId)}"
                               data-cc-call-change="handleRenameObservationVariable|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${escapeHtml(varId)}`)}|v">
                        <span class="obs-var-eq">=</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2130" class="form-input form-input-sm obs-var-value" type="text"
                               value="${escapeHtml(String(val))}"
                               data-cc-call-change="handleObservationVariableChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${escapeHtml(varId)}`)}|s:value|v">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2133" class="form-input form-input-sm obs-var-unit" type="text"
                               value="${escapeHtml(unit)}"
                               data-cc-call-change="handleObservationVariableChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${escapeHtml(varId)}`)}|s:unit|v">
                        <button type="button" class="btn btn-icon btn-danger btn-xs"
                                data-cc-call-click="handleRemoveObservationVariable|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(index))}|s:${encodeURIComponent(`${escapeHtml(varId)}`)}"
                                title="${t('removeVariable')}">
                            ${getIcon('x', { size: '10px' })}
                        </button>
                    </div>`;
                              })
                              .join('')
                }
            </div>
        </div>
    `;
}
/**
 * Render the uncertainty input section (active or toggle).
 * @param {any} typeSelected
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {any} reading
 * @param {boolean} isAdditional
 * @returns {string}
 */
/**
 * Render the active uncertainty input block.
 * @param {any} typeSelected
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {any} reading
 * @param {boolean} isAdditional
 * @returns {string}
 */
/**
 * Build the uncertainty type selector options.
 * @param {string} typeSelected
 * @returns {string}
 */
function _renderUncertaintyTypeOptions(typeSelected: string): string {
    const types = [
        { value: '', label: t('selectUncertaintyType') || 'Type', disabled: true },
        { value: 'absolute', label: t('uncertaintyAbsolute') || 'Abs' },
        { value: 'relative', label: t('uncertaintyRelative') || 'Rel (%)' },
    ];
    return types
        .map(
            (t: any) =>
                `<option value="${t.value}" ${t.disabled ? 'disabled' : ''} ${typeSelected === t.value ? 'selected' : ''}>${t.label}</option>`,
        )
        .join('');
}

/**
 * Build the coverage factor (k) input HTML.
 * @param {any} elementId
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {any} reading
 * @param {boolean} isAdditional
 * @returns {string}
 */
function _renderCoverageFactorInput(
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    reading: any,
    isAdditional: boolean,
): string {
    const cf = reading.coverageFactor;
    const showK = cf != null && cf !== 2 ? 'inline' : 'none';
    return `
        <input data-field-meta="true" data-field-meta-key="auto-tpl:lists:input:L2209" class="form-input uncertainty-k-input" type="number" step="any" min="0.1"
               id="unck-${elementId}-${obsIndex}-${readingIndex}"
               value="${cf ?? ''}"
               placeholder="k"
               title="${t('coverageFactorTooltip') || ''}"
               aria-label="${t('coverageFactor') || 'k'}"
               style="display:${showK}"
               data-cc-call-input="handleReadingChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|s:coverageFactor|v|j:${encodeURIComponent(String(isAdditional))}">`;
}

function _renderActiveUncertainty(
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    reading: any,
    isAdditional: boolean,
): string {
    const typeSelected = reading.uncertaintyType || '';
    return `
        <div class="form-group reading-uncertainty">
            <label class="form-label">&#177; ${t('uncertainty') || 'Uncertainty'}</label>
            <div class="uncertainty-input-wrapper">
                <input data-field-meta="true" data-field-meta-key="auto-tpl:lists:input:L2192" class="form-input uncertainty-input" type="number" step="any" min="0"
                       id="unc-${elementId}-${obsIndex}-${readingIndex}"
                       value="${reading.uncertainty ?? ''}"
                       placeholder="&#177;"
                       title="${t('uncertaintyTooltip') || ''}"
                       aria-label="${t('uncertainty') || 'Uncertainty'}"
                       data-cc-call-input="handleReadingChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|s:uncertainty|v|j:${encodeURIComponent(String(isAdditional))}">
                <select data-field-meta="true" data-field-meta-key="auto-tpl:lists:select:L2199" class="form-input uncertainty-type-select"
                        id="unctype-${elementId}-${obsIndex}-${readingIndex}"
                        aria-label="${t('constantUncertaintyType') || 'Type'}"
                        data-cc-call-change="handleReadingChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|s:uncertaintyType|v|j:${encodeURIComponent(String(isAdditional))}">
                    ${_renderUncertaintyTypeOptions(typeSelected)}
                </select>
                <a href="#" class="constants-k-toggle" data-cc-action="cc-c9289714"
                   title="${t('coverageFactorTooltip') || ''}">k=${reading.coverageFactor || 2}</a>
                ${_renderCoverageFactorInput(elementId, obsIndex, readingIndex, reading, isAdditional)}
            </div>
        </div>`;
}

/**
 * Render the uncertainty toggle button.
 * @param {any} elementId
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {boolean} isAdditional
 * @returns {string}
 */
function _renderUncertaintyToggle(elementId: any, obsIndex: any, readingIndex: any, isAdditional: boolean): string {
    return `
        <div class="form-group reading-uncertainty-toggle">
            <button type="button" class="btn btn-link btn-sm uncertainty-toggle-btn"
                    data-cc-call-click="handleReadingChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|s:uncertainty|s:0|j:${encodeURIComponent(String(isAdditional))}"
                    title="${t('uncertaintyTooltip') || 'Add measurement uncertainty'}">
                + &#177; ${t('uncertainty') || 'Uncertainty'}
            </button>
        </div>`;
}

function _renderReadingUncertaintySection(
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    reading: any,
    isAdditional: boolean,
): string {
    return reading.uncertainty != null
        ? _renderActiveUncertainty(elementId, obsIndex, readingIndex, reading, isAdditional)
        : _renderUncertaintyToggle(elementId, obsIndex, readingIndex, isAdditional);
}

/**
 * Render the unit selector for a reading row.
 * @param {any} elementId
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {any} reading
 * @param {any} selectedUnit
 * @param {any[]} compatibleUnits
 * @param {boolean} isAdditional
 * @returns {string}
 */
function _renderReadingUnitSection(
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    reading: any,
    selectedUnit: any,
    compatibleUnits: any[],
    isAdditional: boolean,
): string {
    const options =
        compatibleUnits.length === 0
            ? `<option value="">${selectedUnit ? escapeHtml(selectedUnit.symbol) : '-'}</option>`
            : compatibleUnits
                  .map(
                      (u: any) => `
                <option value="${u.id}" ${u.id === (reading.unitId || selectedUnit?.id) ? 'selected' : ''}>
                    ${escapeHtml(u.symbol)}
                </option>`,
                  )
                  .join('');
    return `
        <div class="form-group reading-unit">
            <label class="form-label">${t('unit')}</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2232" class="form-input"
                    data-cc-call-change="handleUnitChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|v|j:${encodeURIComponent(String(isAdditional))}">
                ${options}
            </select>
        </div>`;
}

/**
 * Render the auto-convert checkbox for a reading row.
 * @param {any} elementId
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {any} reading
 * @param {boolean} isAdditional
 * @returns {string}
 */
function _renderReadingConvertSection(
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    reading: any,
    isAdditional: boolean,
): string {
    return `
        <div class="form-group reading-convert">
            <label class="form-label">${t('convert')}</label>
            <label class="checkbox-label checkbox-label-inline">
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2254" type="checkbox"
                       ${reading.autoConvert ? 'checked' : ''}
                       data-cc-call-change="handleReadingChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|s:autoConvert|c|j:${encodeURIComponent(String(isAdditional))}">
                <span class="checkbox-text" title="${t('autoConvertTooltip')}">${t('autoConvert')}</span>
            </label>
        </div>`;
}

/**
 * Render the remove button for an additional reading.
 * @param {any} elementId
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @returns {string}
 */
function _renderReadingRemoveButton(elementId: any, obsIndex: any, readingIndex: any): string {
    return `
        <div class="form-group reading-remove">
            <button type="button" class="btn btn-icon btn-danger"
                    data-cc-call-click="handleRemoveAdditionalReading|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|j:${encodeURIComponent(String(readingIndex))}">
                ${getIcon('x', { size: '12px' })}
            </button>
        </div>`;
}

/**
 * Renderiza uma linha de leitura (principal ou adicional).
 * @param {any} elementId
 * @param {any} obsIndex
 * @param {any} readingIndex
 * @param {any} reading
 * @param {any} _selectedParam
 * @param {any} selectedUnit
 * @param {any[]} compatibleUnits
 * @param {any[]} parameters
 * @param {any} _units
 * @param {any} typeBadge
 * @param {boolean} [isAdditional]
 */
function renderReadingRow( elementId: any, obsIndex: any, readingIndex: any, reading: any, _selectedParam: any, selectedUnit: any, compatibleUnits: any, parameters: any, _units: any, typeBadge: any, isAdditional: any = false,
) {
    return `
        <div class="reading-row ${isAdditional ? 'reading-row-additional' : ''}" data-reading-index="${readingIndex}">
            <div class="reading-grid">
                <div class="form-group reading-param">
                    <label class="form-label">${t('parameter')}</label>
                    ${renderParameterSelect(elementId, obsIndex, readingIndex, reading.parameterId, isAdditional)}
                </div>
                <div class="form-group reading-value">
                    <label class="form-label">${t('value')}</label>
                    <div class="value-input-wrapper">
                        <span class="value-status" title="${t('custom')}">${typeBadge}</span>
                        <input data-field-meta="true" data-field-meta-key="auto-tpl:lists:input:L2179" class="form-input value-input" type="number" step="any"
                               id="value-${elementId}-${obsIndex}-${readingIndex}"
                               value="${reading.value ?? ''}"
                               placeholder="${t('enterValue')}"
                               data-cc-call-input="handleReadingChange|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|s:value|v|j:${encodeURIComponent(String(isAdditional))}">
                    </div>
                </div>
                ${_renderReadingUncertaintySection(elementId, obsIndex, readingIndex, reading, isAdditional)}
                ${_renderReadingUnitSection(elementId, obsIndex, readingIndex, reading, selectedUnit, compatibleUnits, isAdditional)}
                ${_renderReadingConvertSection(elementId, obsIndex, readingIndex, reading, isAdditional)}
                ${isAdditional ? _renderReadingRemoveButton(elementId, obsIndex, readingIndex) : ''}
            </div>
            ${_renderReadingDerivations(reading, elementId, obsIndex, readingIndex, isAdditional)}
        </div>
    `;
}
/**
 * Render the reading derivations section - factor × value chain.
 * Renderiza a secao de derivacoes inline por fator e constante.
 * Usa applyPostProcessing() on-the-fly; resultado NAO e persistido.
 *
 * @param {any} reading - The reading object (obs or additional reading)
 * @param {string} reading - Element ID
 * @param {number} reading - Observation index
 * @param {number|string} reading - Reading index
 * @param {boolean} reading - Whether this is an additional reading
 * @returns {string} HTML string
 */
const DERIVATION_OPS = [
    { id: 'multiply', sym: '&times;' },
    { id: 'divide', sym: '&divide;' },
    { id: 'add', sym: '+' },
    { id: 'subtract', sym: '&minus;' },
    { id: 'blend', sym: '&asymp;' },
];

/**
 * Build options HTML for constant selects.
 * @param {any[]} constants
 * @param {string|null} selectedId
 * @returns {string}
 */
function _renderConstantOptions(constants: any[], selectedId: string | null): string {
    return constants
        .map((c: any) => {
            const label = c.name.length > 28 ? c.name.slice(0, 28) + '\u2026' : c.name;
            return `<option value="${c.id}" ${selectedId === c.id ? 'selected' : ''}>${escapeHtml(c.symbol)} \u2014 ${escapeHtml(label)} (${c.value})</option>`;
        })
        .join('');
}

/**
 * Build the blend-specific inputs for a derivation step.
 * @param {AnyRecord} s
 * @param {any[]} constants
 * @param {string} elementId
 * @param {number} obsIdx
 * @param {string|number} readingIdx
 * @param {boolean} isAdditional
 * @param {number} si
 * @returns {string}
 */
function _renderDerivationBlendInputs(
    s: AnyRecord,
    constants: any[],
    elementId: string,
    obsIdx: number,
    readingIdx: any,
    isAdditional: boolean,
    si: number,
): string {
    const constOpts2 = _renderConstantOptions(constants, s.constantId2 || null);
    const constOpts = _renderConstantOptions(constants, s.constantId || null);
    const fA = Number.isFinite(s.fraction) ? s.fraction : 0.5;
    const fB = Number.isFinite(s.fraction2) ? s.fraction2 : 0.5;
    const warnBadge =
        Math.abs(fA + fB - 1) > 0.001
            ? `<span class="obs-deriv-hint" title="${t('lists.fractionsDontSumToOneTooltip')}">[!]</span>`
            : '';
    return `<div class="obs-deriv-blend-parts">
        <div class="obs-deriv-blend-part">
            <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2337" type="number" class="obs-deriv-fraction" step="0.01" min="0" max="1" value="${fA}"
                   title="${t('lists.fractionATooltip')}"
                   data-cc-call-change="handleUpdateReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:fraction|pf">
            <span class="obs-deriv-hint">&times;</span>
            <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2341" class="obs-deriv-const"
                    data-cc-call-change="handleUpdateReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:constantId|v">
                <option value="">\u2014 1\u00aa constante \u2014</option>
                ${constOpts}
            </select>
        </div>
        <div class="obs-deriv-blend-part">
            <span class="obs-deriv-hint">&plus;</span>
            <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2349" type="number" class="obs-deriv-fraction" step="0.01" min="0" max="1" value="${fB}"
                   title="${t('lists.fractionBTooltip')}"
                   data-cc-call-change="handleUpdateReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:fraction2|pf">
            <span class="obs-deriv-hint">&times;</span>
            <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2353" class="obs-deriv-const"
                    data-cc-call-change="handleUpdateReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:constantId2|v">
                <option value="">\u2014 2\u00aa constante \u2014</option>
                ${constOpts2}
            </select>
        </div>
        ${warnBadge}
    </div>`;
}

/**
 * Determine whether a derivation step has enough inputs to compute a result.
 * @param {AnyRecord} s
 * @param {number|null} rawVal
 * @returns {boolean}
 */
function _derivationHasResult(s: AnyRecord, rawVal: number | null): boolean {
    if (rawVal == null) return false;
    if (s.op === 'blend') return !!(s.constantId && s.constantId2);
    return !!s.constantId;
}

/**
 * Build the live-mode result HTML for a derivation step.
 * @param {AnyRecord} s
 * @param {number} rawVal
 * @param {AnyRecord} reading
 * @param {number} stepIndex
 * @returns {string}
 */
function _renderDerivationLiveResult(s: AnyRecord, rawVal: number, reading: AnyRecord, stepIndex: number): string {
    const pp = applyPostProcessing(rawVal, reading.postProcessing.slice(0, stepIndex + 1), reading.uncertainty ?? null);
    if (pp.value == null) return '';
    const constObj = getUserConstantById(s.constantId);
    const unitLbl = constObj?.unitId ? ' ' + escapeHtml(constObj.unitId) : '';
    const uncLbl = pp.uncertainty != null ? ` &plusmn; ${pp.uncertainty.toFixed(4)}` : '';
    const noteAttr = pp.note ? ` title="${escapeHtml(pp.note)}"` : '';
    return `<code class="obs-deriv-result"${noteAttr}>&nbsp;= ${pp.value.toFixed(4)}${uncLbl}${unitLbl}</code>`;
}

/**
 * Build the snapshot-mode result HTML for a derivation step.
 * @param {AnyRecord} s
 * @returns {string}
 */
function _renderDerivationSnapshotResult(s: AnyRecord): string {
    const stepSnap = s.snapshot ?? null;
    if (stepSnap?.value == null) return '';
    const uncLbl = stepSnap.uncertainty != null ? ` &plusmn; ${stepSnap.uncertainty.toFixed(4)}` : '';
    const noteAttr = stepSnap.note ? ` title="${escapeHtml(stepSnap.note)}"` : '';
    return `<code class="obs-deriv-snapshot-badge"${noteAttr}>&nbsp;= ${stepSnap.value.toFixed(4)}${uncLbl}</code>`;
}

/**
 * Build the result display HTML for a derivation step.
 * @param {AnyRecord} s
 * @param {number|null} rawVal
 * @param {AnyRecord} reading
 * @param {number} stepIndex
 * @returns {string}
 */
function _renderDerivationResult(s: AnyRecord, rawVal: number | null, reading: AnyRecord, stepIndex: number): string {
    if (!_derivationHasResult(s, rawVal)) return '';
    const stepMode = s.mode === 'snapshot' ? 'snapshot' : 'live';
    if (stepMode === 'live' && rawVal != null) return _renderDerivationLiveResult(s, rawVal, reading, stepIndex);
    if (stepMode === 'snapshot') return _renderDerivationSnapshotResult(s);
    return '';
}

/**
 * Build the snapshot refresh button HTML for a derivation step.
 * @param {AnyRecord} s
 * @param {string} elementId
 * @param {number} obsIdx
 * @param {string|number} readingIdx
 * @param {boolean} isAdditional
 * @param {number} si
 * @returns {string}
 */
function _renderDerivationRefresh(s: AnyRecord, elementId: string, obsIdx: number, readingIdx: any, isAdditional: boolean, si: number): string {
    const stepMode = s.mode === 'snapshot' ? 'snapshot' : 'live';
    const stepSnap = s.snapshot ?? null;
    if (stepMode !== 'snapshot') return '';
    return `<button class="obs-deriv-refresh-btn btn-icon"
        data-cc-call-click="handleRefreshReadingDerivationSnapshot|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}"
        title="Recapturar snapshot com valores atuais">${getIcon('refresh-cw', { size: '11px' })}</button>${stepSnap?.date ? `<span class="obs-deriv-snap-date">${stepSnap.date}</span>` : ''}`;
}

/**
 * Build the live/snapshot mode toggle HTML for a derivation step.
 * @param {AnyRecord} s
 * @param {string} elementId
 * @param {number} obsIdx
 * @param {string|number} readingIdx
 * @param {boolean} isAdditional
 * @param {number} si
 * @returns {string}
 */
function _renderDerivationModeToggle(s: AnyRecord, elementId: string, obsIdx: number, readingIdx: any, isAdditional: boolean, si: number): string {
    const stepMode = s.mode === 'snapshot' ? 'snapshot' : 'live';
    return `<div class="obs-deriv-mode-bar">
        <button class="obs-deriv-mode-btn ${stepMode === 'live' ? 'active' : ''}"
                data-cc-call-click="handleSetReadingDerivationMode|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:live"
                title="Calcular em tempo real">${getIcon('zap', { size: '11px' })} Live</button>
        <button class="obs-deriv-mode-btn ${stepMode === 'snapshot' ? 'active' : ''}"
                data-cc-call-click="handleSetReadingDerivationMode|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:snapshot"
                title="Congelar resultado para auditoria">${getIcon('lock', { size: '11px' })} Snap</button>
    </div>`;
}

/**
 * Build the constant select or blend inputs for a derivation step.
 * @param {AnyRecord} s
 * @param {any[]} constants
 * @param {string} elementId
 * @param {number} obsIdx
 * @param {string|number} readingIdx
 * @param {boolean} isAdditional
 * @param {number} si
 * @returns {string}
 */
function _renderDerivationInputSection(
    s: AnyRecord,
    constants: any[],
    elementId: string,
    obsIdx: number,
    readingIdx: any,
    isAdditional: boolean,
    si: number,
): string {
    if (s.op === 'blend') {
        return _renderDerivationBlendInputs(s, constants, elementId, obsIdx, readingIdx, isAdditional, si);
    }
    const constOpts = _renderConstantOptions(constants, s.constantId || null);
    return `<select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2411" class="obs-deriv-const"
            data-cc-call-change="handleUpdateReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:constantId|v">
        <option value="">\u2014 selecionar \u2014</option>
        ${constOpts}
    </select>`;
}

/**
 * Render a single derivation step row.
 * @param {AnyRecord} s
 * @param {number} si
 * @param {AnyRecord} ctx
 * @returns {string}
 */
function _renderDerivationStep(s: AnyRecord, si: number, ctx: AnyRecord): string {
    const { elementId, obsIdx, readingIdx, isAdditional, rawVal, reading, constants } = ctx;
    const opOpts = DERIVATION_OPS
        .map((o: any) => `<option value="${o.id}" ${s.op === o.id ? 'selected' : ''}>${o.sym}</option>`)
        .join('');
    const inputSection = _renderDerivationInputSection(s, constants, elementId, obsIdx, readingIdx, isAdditional, si);
    const resultHtml = _renderDerivationResult(s, rawVal, reading, si);
    const refreshHtml = _renderDerivationRefresh(s, elementId, obsIdx, readingIdx, isAdditional, si);
    const toggleHtml = _renderDerivationModeToggle(s, elementId, obsIdx, readingIdx, isAdditional, si);
    return `<div class="obs-deriv-row">
        <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2405" class="obs-deriv-op"
                data-cc-call-change="handleUpdateReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}|s:op|v">
            ${opOpts}
        </select>
        ${inputSection}
        ${resultHtml}
        ${refreshHtml}
        ${toggleHtml}
        <button class="obs-deriv-remove btn-icon"
                data-cc-call-click="handleRemoveReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}|j:${encodeURIComponent(String(si))}"
                title="Remover derivacao">${getIcon('x', { size: '12px' })}</button>
    </div>`;
}

function _renderReadingDerivations( reading: any, elementId: any, obsIdx: any, readingIdx: any, isAdditional: any) {
    const steps = Array.isArray(reading.postProcessing) ? reading.postProcessing : [];
    const constants = getUserConstants();
    const rawVal = reading.value != null && reading.value !== '' ? Number(reading.value) : null;
    const ctx = { elementId, obsIdx, readingIdx, isAdditional, rawVal, reading, constants };
    const stepsHtml = steps.map((s: any, si: number) => _renderDerivationStep(s, si, ctx)).join('');
    const noConstHint =
        constants.length === 0
            ? `<span class="obs-deriv-hint">Nenhuma constante. <a href="#" data-cc-action="cc-e226041b">Criar</a></span>`
            : '';
    return `<div class="obs-deriv-section">
        ${stepsHtml}
        ${noConstHint}
        <button class="obs-deriv-add-btn"
                data-cc-call-click="handleAddReadingDerivation|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIdx))}|s:${encodeURIComponent(`${readingIdx}`)}|j:${encodeURIComponent(String(isAdditional))}"
                title="Derivar por fator ou constante">
            ${getIcon('plus', { size: '12px' })} Derivar por fator
        </button>
    </div>`;
}
// ----------------------------------------------------------------
// CAMPANHAS
// ----------------------------------------------------------------
export function updateCampaignsList() {
    const container = document.getElementById('campaigns-list');
    if (!container) return;
    const campaigns = getAllCampaigns();
    if (campaigns.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 16px; color: var(--neutral-500);">
                <span data-i18n="noCampaigns">No campaigns yet.</span>
            </div>
        `;
        return;
    }
    // Coleta elementos e parametros uma vez para todos os cards
    const allElements = getAllElements();
    const parameters = CONFIG.PARAMETERS;
    container.innerHTML = [...campaigns]
        .sort((a: any, b: any) => _naturalCompare(a?.name || a?.id, b?.name || b?.id))
        .map((campaign: any) => _renderCampaignCard(campaign, allElements, parameters))
        .join('');
}

/**
 * Render a single campaign card.
 * @param {any} campaign
 * @param {any[]} allElements
 * @param {any[]} parameters
 * @returns {string}
 */
function _renderCampaignCard(campaign: any, allElements: any[], parameters: any[]): string {
    const completeness = getCampaignCompleteness(campaign.id, allElements);
    const readings = campaign.plannedReadings || [];
    const pct = completeness.planned > 0 ? Math.round(completeness.ratio * 100) : 0;
    const barColor = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
    return `
        <div class="element-card campaign-card">
            ${_renderCampaignHeader(campaign)}
            ${_renderCampaignDates(campaign)}
            ${_renderCampaignCompleteness(readings, completeness, pct, barColor)}
            ${_renderCampaignPlannedSection(campaign, readings, completeness, allElements, parameters)}
            ${renderCampaignCostSection(campaign)}
        </div>`;
}

/**
 * Render the campaign card header with color, name, visibility and actions.
 * @param {any} campaign
 * @returns {string}
 */
function _renderCampaignHeader(campaign: any): string {
    return `
        <div class="camp-header">
            <input class="camp-color-dot" type="color" value="${escapeHtml(campaign.color || '#3b6bff')}"
                   data-cc-call-input="handleCampaignChange|s:${encodeURIComponent(`${campaign.id}`)}|s:color|v"
                   title="${t('color') || 'Color'}">
            <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2482" class="camp-name" type="text" value="${escapeHtml(campaign.name)}"
                   data-cc-call-input="handleCampaignChange|s:${encodeURIComponent(`${campaign.id}`)}|s:name|v">
            <label class="camp-vis" title="${t('visible') || 'Visible'}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2485" type="checkbox" ${campaign.visible ? 'checked' : ''}
                       data-cc-call-change="handleCampaignVisibility|s:${encodeURIComponent(`${campaign.id}`)}|c">
            </label>
            <button type="button" class="btn btn-icon" data-cc-call-click="handleOpenDataEntryMatrix|s:${encodeURIComponent(`${campaign.id}`)}"
                    title="${t('dataEntryMatrix') || 'Data Entry Matrix'}" style="font-size:11px;padding:2px 5px;margin-right:2px;">&#9638;</button>
            <button type="button" class="camp-delete" data-cc-call-click="handleRemoveCampaign|s:${encodeURIComponent(`${campaign.id}`)}"
                    title="${t('delete')}">&#10005;</button>
        </div>`;
}

/**
 * Render the campaign inline date inputs.
 * @param {any} campaign
 * @returns {string}
 */
function _renderCampaignDates(campaign: any): string {
    return `
        <div class="camp-dates">
            <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2495" type="date" value="${escapeHtml(campaign.startDate || '')}"
                   data-cc-call-input="handleCampaignChange|s:${encodeURIComponent(`${campaign.id}`)}|s:startDate|v"
                   title="${t('startDate') || 'Start'}">
            <span class="camp-date-sep">&#8594;</span>
            <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2499" type="date" value="${escapeHtml(campaign.endDate || '')}"
                   data-cc-call-input="handleCampaignChange|s:${encodeURIComponent(`${campaign.id}`)}|s:endDate|v"
                   title="${t('endDate') || 'End'}">
        </div>`;
}

/**
 * Render the campaign completeness bar.
 * @param {any[]} readings
 * @param {AnyRecord} completeness
 * @param {number} pct
 * @param {string} barColor
 * @returns {string}
 */
function _renderCampaignCompleteness(readings: any[], completeness: AnyRecord, pct: number, barColor: string): string {
    if (readings.length === 0) return '';
    return `
        <div class="campaign-completeness">
            <div class="campaign-completeness-bar" title="${completeness.executed}/${completeness.planned} (${pct}%)">
                <div class="campaign-completeness-fill ${barColor}" style="width: ${pct}%"></div>
            </div>
        </div>`;
}

/**
 * Render the planned readings tags for a single element group.
 * @param {any} campaign
 * @param {any[]} items
 * @param {any[]} parameters
 * @returns {string}
 */
function _renderCampaignPlannedTags(campaign: any, items: any[], parameters: any[]): string {
    return items
        .map(({ reading, idx, detail }: any) => {
            const isExec = detail?.executed || false;
            const pName = reading.parameterId
                ? parameters.find((p: any) => p.id === reading.parameterId)?.name || reading.parameterId
                : '?';
            const cls = isExec ? 'done' : 'pending';
            const icon = isExec ? '&#10003;' : '';
            return `<span class="pr-tag ${cls}"
                title="${escapeHtml(pName)} — ${isExec ? t('readingExecuted') || 'Executed' : t('readingPending') || 'Pending'}">
                ${icon} ${escapeHtml(pName)}
                <button type="button" class="pr-tag-x"
                        data-cc-call-click="handleRemovePlannedReading|s:${encodeURIComponent(`${campaign.id}`)}|j:${encodeURIComponent(String(idx))}"
                        title="${t('delete')}">&#215;</button>
            </span>`;
        })
        .join('');
}

/**
 * Render the planned readings section for a campaign card.
 * @param {any} campaign
 * @param {any[]} readings
 * @param {AnyRecord} completeness
 * @param {any[]} allElements
 * @param {any[]} parameters
 * @returns {string}
 */
function _renderCampaignPlannedSection(
    campaign: any,
    readings: any[],
    completeness: AnyRecord,
    allElements: any[],
    parameters: any[],
): string {
    const countBadge = readings.length > 0 ? `<span class="pr-count-badge">${completeness.executed}/${completeness.planned}</span>` : '';
    const bodyHtml = readings.length === 0
        ? `<div class="planned-readings-empty" data-i18n="noPlannedReadings">${t('noPlannedReadings') || 'No planned readings.'}</div>`
        : groupPlannedReadingsByElement(readings, completeness.details)
            .map(({ elId, items, groupDone }: any) => {
                const elName = elId !== '__unset__' ? allElements.find((e: any) => e.id === elId)?.name || elId : t('selectElement') || '—';
                return `
                    <div class="pr-group">
                        <div class="pr-group-header">
                            <span class="pr-group-name" title="${escapeHtml(elName)}">${escapeHtml(elName)}</span>
                            <span class="pr-group-stats">${groupDone}/${items.length}</span>
                        </div>
                        <div class="pr-tags">
                            ${_renderCampaignPlannedTags(campaign, items, parameters)}
                        </div>
                    </div>`;
            })
            .join('');
    return `
        <div class="campaign-section ${window.sectionClass?.('campaign-planned-' + campaign.id) ?? 'collapsed'}" data-section-id="campaign-planned-${campaign.id}">
            <div class="campaign-section-title pr-toggle" data-cc-action="cc-1cfbc592">
                <span>
                    <span class="pr-chevron">&#9662;</span>
                    <span data-i18n="plannedReadings">${t('plannedReadings') || 'Planned'}</span>
                    ${countBadge}
                </span>
                <button type="button" class="btn-add-reading"
                        data-cc-call-click="handleAddPlannedReading|s:${encodeURIComponent(`${campaign.id}`)}" data-cc-stop="1">
                    +
                </button>
            </div>
            <div class="pr-body">${bodyHtml}</div>
        </div>`;
}
/**
 * Render campaign cost section (L3 Cost Framework).
 * Mostra custos de mobilização, coleta, logística e analíticos.
 *
 * @param {any} campaign - Campaign object
 * @returns {string} HTML string
 */
function renderCampaignCostSection( campaign: any) {
    const cost = campaign.costs;
    if (!cost || !cost.items || cost.items.length === 0) return '';
    const itemRows = cost.items
        .map(
            /** @param {any} field */ (item: any) => `
        <div style="display:flex;justify-content:space-between;font-size:10px;padding:1px 4px;">
            <span style="color:var(--neutral-400);text-transform:uppercase;font-size:9px;">${escapeHtml(item.itemId)}</span>
            <span>${item.amount.toFixed(2)}${item.note ? ` <span style="color:var(--neutral-500);font-size:8px;">(${escapeHtml(item.note)})</span>` : ''}</span>
        </div>
    `,
        )
        .join('');
    return `
        <div class="campaign-section ${window.sectionClass?.('campaign-costs-' + campaign.id) ?? 'collapsed'}" data-section-id="campaign-costs-${campaign.id}">
            <div class="campaign-section-title pr-toggle"
                 data-cc-action="cc-1cfbc592">
                <span>
                    <span class="pr-chevron">&#9662;</span>
                    <span data-i18n="campaignCosts">${t('campaignCosts') || 'Costs'}</span>
                </span>
                <span style="font-size:10px;color:var(--neutral-400);">${cost.currency || 'BRL'} ${cost.total.toFixed(2)}</span>
            </div>
            <div class="pr-body">
                ${itemRows}
                <div style="display:flex;justify-content:space-between;border-top:1px solid var(--neutral-700);margin-top:3px;padding:3px 4px 0;font-size:10px;font-weight:600;">
                    <span>Total</span>
                    <span>${cost.currency || 'BRL'} ${cost.total.toFixed(2)}</span>
                </div>
            </div>
        </div>
    `;
}
// ----------------------------------------------------------------
// CENAS
// ----------------------------------------------------------------
export function updateScenesList() {
    const container = document.getElementById('scenes-list');
    if (!container) return;
    const scenes = getAllScenes();
    const campaigns = getAllCampaigns();
    const elements = getAllElements();
    if (scenes.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 16px; color: var(--neutral-500);">
                <span data-i18n="noScenes">No scenes yet.</span>
            </div>
        `;
        return;
    }
    const campaignOptions = campaigns
        .map((c: any) => `
        <option value="${c.id}">${escapeHtml(c.name)}</option>
    `,
        )
        .join('');
    container.innerHTML = scenes
        .map((scene: any) => `
        <div class="element-card">
            <div class="form-group">
                <label class="form-label" data-i18n="sceneName">Scene Name</label>
                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2673" class="form-input" type="text" value="${escapeHtml(scene.name)}"
                       data-cc-call-input="handleSceneChange|s:${encodeURIComponent(`${scene.id}`)}|s:name|v">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label" data-i18n="viewStart">View Start</label>
                    <button type="button" class="btn btn-secondary" data-cc-call-click="handleCaptureViewStart|s:${encodeURIComponent(`${scene.id}`)}">
                        ${getIcon('camera', { size: '14px' })} <span data-i18n="capture">Capture</span>
                    </button>
                    <button type="button" class="btn btn-secondary" data-cc-call-click="handleApplyViewStart|s:${encodeURIComponent(`${scene.id}`)}">
                        ▶ <span data-i18n="apply">Apply</span>
                    </button>
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="viewEnd">View End</label>
                    <button type="button" class="btn btn-secondary" data-cc-call-click="handleCaptureViewEnd|s:${encodeURIComponent(`${scene.id}`)}">
                        ${getIcon('camera', { size: '14px' })} <span data-i18n="capture">Capture</span>
                    </button>
                    <button type="button" class="btn btn-secondary" data-cc-call-click="handleApplyViewEnd|s:${encodeURIComponent(`${scene.id}`)}">
                        ▶ <span data-i18n="apply">Apply</span>
                    </button>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label class="form-label" data-i18n="campaignsStart">Campaigns Start</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2699" class="form-input" multiple
                            data-cc-call-change="handleSceneCampaigns|s:${encodeURIComponent(`${scene.id}`)}|s:campaignsStart|t">
                        ${campaignOptions}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" data-i18n="campaignsEnd">Campaigns End</label>
                    <select data-field-meta="true" data-field-meta-key="auto-pos:lists:select:L2706" class="form-input" multiple
                            data-cc-call-change="handleSceneCampaigns|s:${encodeURIComponent(`${scene.id}`)}|s:campaignsEnd|t">
                        ${campaignOptions}
                    </select>
                </div>
            </div>
            <div class="section" style="margin-top: 8px;">
                <div class="section-header">
                    <span data-i18n="elementFilters">Element Filters</span>
                    <span class="chevron">▼</span>
                </div>
                <div class="section-content">
                    <div class="filters-grid">
                        ${elements
                            .map((element: any) => `
                            <label class="filter-item">
                                <input data-field-meta="true" data-field-meta-key="auto-pos:lists:input:L2723" type="checkbox"
                                       ${scene.elementVisibility?.[element.id] !== false ? 'checked' : ''}
                                       data-cc-call-change="handleSceneElementFilter|s:${encodeURIComponent(`${scene.id}`)}|s:${encodeURIComponent(`${element.id}`)}|c">
                                <span>${escapeHtml(element.name)}</span>
                            </label>
                        `,
                            )
                            .join('')}
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:4px; margin-top:4px;">
                <button type="button" class="btn btn-secondary" data-cc-call-click="handleScrollToReportAnchor|s:${encodeURIComponent(`${scene.id}`)}"
                        title="Go to Report anchor" style="flex:1;">
                    ${getIcon('file-text', { size: '14px' })} <span data-i18n="reportTab">Report</span>
                </button>
                <button type="button" class="btn btn-secondary" data-cc-call-click="handleRemoveScene|s:${encodeURIComponent(`${scene.id}`)}" style="flex:1;">
                    ${t('delete')}
                </button>
            </div>
        </div>
    `,
        )
        .join('');
    scenes.forEach((scene: any) => {
        syncMultiSelect(scene.id, 'campaignsStart', scene.campaignsStart || []);
        syncMultiSelect(scene.id, 'campaignsEnd', scene.campaignsEnd || []);
    });
}
/**
 * @param {any} field
 * @param {any} field
 * @param {any} field
 */
function syncMultiSelect( sceneId: any, field: any, values: any) {
    const selector: any = document.querySelector(`select[onchange*="${sceneId}"][onchange*="${field}"]`);
    if (!selector) return;
    Array.from(selector.options).forEach((option: any) => {
        option.selected = values.includes(option.value);
    });
}
// ----------------------------------------------------------------
// BARRA DE STATUS
// ----------------------------------------------------------------
/**
 * Atualiza informacoes na barra de status.
 * Mostra contagem de elementos e familias.
 */
export function updateStatusBar() {
    // Atualiza contagem de elementos
    const elementsSpan = document.getElementById('status-elements');
    if (elementsSpan) {
        const count = getElementCount();
        elementsSpan.innerHTML = `${count} <span data-i18n="elements">${t('elements')}</span>`;
    }
    // Atualiza contagem de familias ativas
    const familiesSpan = document.getElementById('status-families');
    if (familiesSpan) {
        const count = getEnabledFamilies().length;
        familiesSpan.innerHTML = `${count} <span data-i18n="families">${t('families')}</span>`;
    }
    // Purpose module: EIS widget no statusbar (Camada 2)
    _updatePurposeStatusWidget();
}
/** @type {number|null} Ultimo delta exibido no statusbar (para detectar mudanca e pulsar) */
let _lastStatusDelta: any = null;
/**
 * Update purpose EIS widget in statusbar (Layer 2).
 * Atualiza widget EIS no statusbar - score + delta da sessao.
 * Cria o widget na primeira chamada; atualiza nas subsequentes.
 */
/**
 * Resolve numeric score fields from the purpose module result.
 * @param {any} current
 * @returns {{ finalScore: number, baseScore: number, governanceAdjustment: number }}
 */
function _resolvePurposeScores(current: any) {
    return {
        finalScore: typeof current.finalScore === 'number' ? current.finalScore : current.eis,
        baseScore: typeof current.baseScore === 'number' ? current.baseScore : current.eis,
        governanceAdjustment: typeof current.governanceAdjustment === 'number' ? current.governanceAdjustment : 0,
    };
}

/**
 * Resolve session delta using the preferred API from the purpose module.
 * @param {any} purposeModule
 * @returns {number}
 */
function _resolvePurposeSessionDelta(purposeModule: any): number {
    return typeof purposeModule.getSessionDeltaFinal === 'function'
        ? purposeModule.getSessionDeltaFinal()
        : purposeModule.getSessionDelta();
}

/**
 * Create the purpose status widget DOM element.
 * @returns {HTMLElement}
 */
function _createPurposeWidget(): HTMLElement {
    const widget = document.createElement('span');
    widget.id = 'purpose-status-widget';
    widget.className = 'purpose-status-widget';
    widget.title = t('purposeTitle') || 'Your Impact';
    widget.onclick = () => {
        if ((window as any).handleOpenPurpose) (window as any).handleOpenPurpose();
    };
    widget.style.marginRight = '6px';
    return widget;
}

/**
 * Mount the purpose widget into the status bar center zone.
 * @param {HTMLElement} widget
 * @returns {boolean} false if no suitable mount point was found
 */
function _mountPurposeWidget(widget: HTMLElement): boolean {
    const center = document.querySelector('#statusbar .status-center');
    const feedbackMount = document.getElementById('feedback-mount-statusbar');
    if (center && feedbackMount && feedbackMount.parentElement === center) {
        center.insertBefore(widget, feedbackMount);
    } else if (center) {
        center.appendChild(widget);
    } else {
        const statusbar = document.getElementById('statusbar');
        if (statusbar) statusbar.appendChild(widget);
        else return false;
    }
    return true;
}

/**
 * Build the purpose widget HTML content.
 * @param {number} finalScore
 * @param {number} baseScore
 * @param {number} governanceAdjustment
 * @param {{ score?: number, level?: string }|null} confidence
 * @param {number} confidence
 * @returns {{ html: string, title: string }}
 */
function _buildPurposeWidgetContent(
    finalScore: number,
    baseScore: number,
    governanceAdjustment: number,
    confidence: any,
    sessionDelta: number,
) {
    const verdictClass = finalScore >= 4.5 ? 'high' : finalScore >= 3.5 ? 'medium' : 'low';
    const arrow = sessionDelta > 0 ? '&#9650;' : sessionDelta < 0 ? '&#9660;' : '';
    const sign = sessionDelta > 0 ? '+' : '';
    const deltaClass =
        sessionDelta > 0 ? 'purpose-status-delta-positive' : sessionDelta < 0 ? 'purpose-status-delta-negative' : 'purpose-status-delta-neutral';
    const adjustmentLabel = `${governanceAdjustment >= 0 ? '+' : ''}${governanceAdjustment.toFixed(2)}`;
    const confidenceLabel = confidence ? ` | conf ${Math.round(confidence.score * 100)}% (${confidence.level})` : '';
    const title =
        `${t('purposeTitle') || 'Your Impact'}\n` +
        `Final: ${finalScore.toFixed(2)} | Base: ${baseScore.toFixed(2)} | Adj: ${adjustmentLabel}${confidenceLabel}`;
    const showBase = Math.abs(finalScore - baseScore) >= 0.005;
    const html = `
        <span class="purpose-status-score purpose-status-${verdictClass}">EIS ${finalScore.toFixed(2)}</span>
        ${showBase ? `<span class="purpose-status-breakdown">(base ${baseScore.toFixed(2)})</span>` : ''}
        ${sessionDelta !== 0 ? `<span class="purpose-status-delta ${deltaClass}">${arrow}${sign}${sessionDelta.toFixed(2)}</span>` : ''}
    `;
    return { html, title };
}

/**
 * Trigger a brief pulse animation when the session delta changes.
 * @param {HTMLElement} widget
 * @param {number} sessionDelta
 */
function _pulsePurposeWidget(widget: HTMLElement, sessionDelta: number) {
    if (_lastStatusDelta !== null && _lastStatusDelta !== sessionDelta) {
        widget.classList.add('purpose-status-pulse');
        setTimeout(() => widget.classList.remove('purpose-status-pulse'), 400);
    }
    _lastStatusDelta = sessionDelta;
}

function _updatePurposeStatusWidget() {
    try {
        const purposeModule = _purposeStatusCache;
        if (!purposeModule) {
            if (!_purposeStatusLoading) {
                _purposeStatusLoading = true;
                import('../../core/purpose/index.js' as string)
                    .then((mod: any) => {
                        _purposeStatusCache = mod;
                    })
                    .catch(() => {
                        _purposeStatusLoading = false;
                    });
            }
            return;
        }
        const count = getElementCount();
        if (count === 0) {
            const existing = document.getElementById('purpose-status-widget');
            if (existing) existing.style.display = 'none';
            return;
        }
        const current = purposeModule.getCurrentEIS();
        const { finalScore, baseScore, governanceAdjustment } = _resolvePurposeScores(current);
        const confidence = current.confidence || null;
        const sessionDelta = _resolvePurposeSessionDelta(purposeModule);
        let widget = document.getElementById('purpose-status-widget') as HTMLElement;
        if (!widget) {
            widget = _createPurposeWidget();
            if (!_mountPurposeWidget(widget)) return;
        }
        widget.style.display = '';
        const { html, title } = _buildPurposeWidgetContent(
            finalScore,
            baseScore,
            governanceAdjustment,
            confidence,
            sessionDelta,
        );
        widget.title = title;
        widget.innerHTML = html;
        _pulsePurposeWidget(widget, sessionDelta);
    } catch (e) {
        console.debug('[lists:purposeStatusWidget]', (e as any)?.message || e);
    }
}
/** @type {any|null} Cache do modulo de proposito (importacao lazy) */
let _purposeStatusCache: any = null;
/** @type {boolean} Flag de importacao em andamento */
let _purposeStatusLoading = false;
/**
 * Compare strings using natural numeric ordering (e.g. "Campanha 2" < "Campanha 10").
 * Ordena de forma estavel para nomes com sufixos numericos.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function _naturalCompare( a: any, b: any) {
    return String(a || '').localeCompare(String(b || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
    });
}
// ----------------------------------------------------------------
// FUNCAO UTILITARIA (escapeHtml importado de utils/html.js)
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// ATUALIZACAO GERAL
// ----------------------------------------------------------------
