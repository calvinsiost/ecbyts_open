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
   COMPONENTE DE SELECT CUSTOMIZADO
   ================================================================

   Substitui o select nativo por um dropdown com:
   - Busca/filtro
   - Agrupamento por categoria (colapsável)
   - Botão de configuração

   ================================================================ */

import { t } from '../i18n/translations.js';
import { CONFIG } from '../../config.js';
import { SAO_MATRICES } from '../../core/sao/matrices.js';
import { getParamDisplayName } from '../../core/sao/paramNames.js';
import { escapeHtml } from '../helpers/html.js';

// Rastreia instâncias abertas para fechar ao clicar fora
/** @type {any} */
let activeDropdown: any = null;

/**
 * Renderiza um select customizado para parâmetros.
 */
export function renderParameterSelect(
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    selectedId: any,
    isAdditional = false,
) {
    const id = `param-select-${elementId}-${obsIndex}-${readingIndex}`;
    const selected = (CONFIG.PARAMETERS as any).find((p: any) => p.id === selectedId);

    return `
        <div class="custom-select-wrapper" id="${id}-wrapper">
            <div class="custom-select-trigger" id="${id}-trigger" data-cc-call-click="toggleParamDropdown|s:${encodeURIComponent(`${id}`)}">
                <span class="selected-value ${!selected ? 'placeholder-text' : ''}">
                    ${selected ? escapeHtml(getParamDisplayName(selected)) : t('selectParameter')}
                </span>
                <span class="trigger-icons">
                    <button type="button" class="config-btn" data-cc-call-click="openFieldManagerModal" data-cc-stop="1" title="${t('manageFields')}"><span data-icon="settings"></span></button>
                    <span class="arrow">▼</span>
                </span>
            </div>
            <div class="custom-select-dropdown" id="${id}-dropdown">
                <div class="custom-select-search">
                    <input data-field-meta="true" data-field-meta-key="auto-pos:customSelect:input:L54" type="text" placeholder="${t('searchParameter')}"
                           data-cc-call-input="filterParamOptions|s:${encodeURIComponent(`${id}`)}|v"
                           data-cc-call-click="__noop" data-cc-stop="1">
                </div>
                <div class="custom-select-options" id="${id}-options">
                    ${renderParameterOptions(id, selectedId, elementId, obsIndex, readingIndex, isAdditional)}
                </div>
                <div class="custom-select-footer">
                    <button type="button" data-cc-call-click="openFieldManagerModal" data-cc-stop="1">
                        <span data-icon="settings"></span> ${t('manageFields')}
                    </button>
                </div>
            </div>
        </div>
    `;
}

/**
 * Renderiza as opções agrupadas por categoria ou hierarquia SAO.
 * Quando parâmetros SAO estão presentes, agrupa por matrix → subcategory.
 * Para parâmetros legado (sem sao metadata), usa categoria plana.
 * Grupos colapsáveis: matrizes e subcategorias iniciam colapsadas.
 */
function renderParameterOptions(
    selectId: any,
    selectedId: any,
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    isAdditional: any,
) {
    const categories: Record<string, string> = {
        chemical: t('categoryChemical'),
        physical: t('categoryPhysical'),
        contaminant: t('categoryContaminant'),
        hydrogeology: t('categoryHydrogeology'),
        emission: t('categoryEmission'),
        air_quality: t('categoryAirQuality'),
        waste: t('categoryWaste'),
        effluent: t('categoryEffluent'),
        safety: t('categorySafety'),
        biodiversity: t('categoryBiodiversity'),
        custom: t('categoryCustom'),
    };

    const tierBadge: Record<string, string> = {
        essential: `<span class="sao-tier-dot sao-tier-essential" title="${t('saoTierEssential')}">&#9679;</span>`,
        recommended: `<span class="sao-tier-dot sao-tier-recommended" title="${t('saoTierRecommended')}">&#9679;</span>`,
        specialized: `<span class="sao-tier-dot sao-tier-specialized" title="${t('saoTierSpecialized')}">&#9679;</span>`,
    };

    // Separate SAO parameters from legacy parameters
    /** @type {any[]} */
    const saoParams: any = [];
    /** @type {any[]} */
    const legacyParams: any = [];
    (CONFIG.PARAMETERS as any[]).forEach((p: any) => {
        if (p.sao) {
            saoParams.push(p);
        } else {
            legacyParams.push(p);
        }
    });

    const hasSAO = saoParams.length > 0;

    let html = '';

    // Opção vazia
    html += `
        <div class="custom-select-option ${!selectedId ? 'selected' : ''}"
             data-value=""
             data-cc-call-click="selectParameter|s:${encodeURIComponent(`${selectId}`)}|s:|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|j:${encodeURIComponent(String(isAdditional))}">
            <span class="option-name placeholder-text">${t('selectParameter')}</span>
        </div>
    `;

    // SAO parameters - grouped by matrix → subcategory (collapsible)
    if (hasSAO) {
        // Group by matrix, then by subcategory
        const byMatrix: Record<string, Record<string, any[]>> = {};
        saoParams.forEach((p: any) => {
            const matrixId = p.sao.matrix;
            if (!byMatrix[matrixId]) byMatrix[matrixId] = {};
            const subcat = p.sao.subcategory || 'other';
            if (!byMatrix[matrixId][subcat]) byMatrix[matrixId][subcat] = [];
            byMatrix[matrixId][subcat].push(p);
        });

        Object.entries(byMatrix).forEach(([matrixId, subcats]) => {
            const matrix = (SAO_MATRICES as Record<string, any>)[matrixId];
            const matrixName = matrix ? t(matrix.nameKey) : matrixId;
            const matrixColor = matrix ? matrix.color : '#888';
            const matrixParamCount = Object.values(subcats).reduce(
                (sum: number, arr: any[]) => sum + arr.length,
                0,
            );

            // Check if the selected param is inside this matrix (auto-expand)
            const selectedInMatrix =
                selectedId &&
                Object.values(subcats).some((arr: any[]) =>
                    arr.some((p: any) => p.id === selectedId),
                );

            html += `<div class="custom-select-group sao-matrix-group ${selectedInMatrix ? '' : 'collapsed'}">`;
            html += `<div class="custom-select-group-label sao-matrix-label" style="border-left: 3px solid ${matrixColor};"
                          data-cc-call-click="toggleParamGroup|t" data-cc-stop="1">
                        <span class="group-arrow">${selectedInMatrix ? '▼' : '▶'}</span>
                        ${escapeHtml(matrixName)}
                        <span class="group-count">(${matrixParamCount})</span>
                     </div>`;
            html += `<div class="sao-matrix-content">`;

            Object.entries(subcats).forEach(([subcatId, params]) => {
                // Find subcategory name from matrix definition
                const subcatDef = matrix
                    ? matrix.subcategories.find((s: any) => s.id === subcatId)
                    : null;
                const subcatName = subcatDef ? t(subcatDef.nameKey) : subcatId;

                // Check if selected param is in this subcategory
                const selectedInSubcat = selectedId && params.some((p: any) => p.id === selectedId);

                html += `<div class="sao-subcat-group ${selectedInSubcat ? '' : 'collapsed'}">`;
                html += `<div class="sao-subcat-label" data-cc-call-click="toggleParamGroup|t" data-cc-stop="1">
                            <span class="group-arrow">${selectedInSubcat ? '▼' : '▶'}</span>
                            ${escapeHtml(subcatName)}
                            <span class="group-count">(${params.length})</span>
                         </div>`;
                html += `<div class="sao-subcat-content">`;

                params.forEach((p: any) => {
                    const unit = (CONFIG.UNITS as any[]).find(
                        (u: any) => u.id === p.defaultUnitId,
                    );
                    const dot = tierBadge[p.sao.tier] || '';
                    html += `
                        <div class="custom-select-option ${p.id === selectedId ? 'selected' : ''}"
                             data-value="${p.id}"
                             data-searchable="${getParamDisplayName(p).toLowerCase()} ${p.name.toLowerCase()} ${matrixName.toLowerCase()} ${subcatName.toLowerCase()}"
                             data-cc-call-click="selectParameter|s:${encodeURIComponent(`${selectId}`)}|s:${encodeURIComponent(`${p.id}`)}|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|j:${encodeURIComponent(String(isAdditional))}">
                            <span class="option-name">${dot} ${escapeHtml(getParamDisplayName(p))}</span>
                            <span class="option-badges">
                                ${unit ? `<span class="option-unit">${escapeHtml(unit.symbol)}</span>` : ''}
                            </span>
                        </div>
                    `;
                });

                html += `</div></div>`; // close sao-subcat-content + sao-subcat-group
            });

            html += `</div></div>`; // close sao-matrix-content + sao-matrix-group
        });
    }

    // Legacy parameters - grouped by flat category (collapsible)
    if (legacyParams.length > 0) {
        const grouped: Record<string, any[]> = {};
        legacyParams.forEach((p: any) => {
            const cat = p.category || 'custom';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(p);
        });

        Object.entries(grouped).forEach(([cat, params]) => {
            if (params.length === 0) return;

            // Auto-expand if selected param is in this category
            const selectedInCat = selectedId && params.some((p: any) => p.id === selectedId);

            html += `
                <div class="custom-select-group ${selectedInCat ? '' : 'collapsed'}">
                    <div class="custom-select-group-label" data-cc-call-click="toggleParamGroup|t" data-cc-stop="1">
                        <span class="group-arrow">${selectedInCat ? '▼' : '▶'}</span>
                        ${categories[cat] || cat}
                        <span class="group-count">(${params.length})</span>
                    </div>
                    <div class="legacy-group-content">
                    ${params
                        .map((p: any) => {
                            const unit = (CONFIG.UNITS as any[]).find(
                                (u: any) => u.id === p.defaultUnitId,
                            );
                            const isCustom = p.type === 'custom';
                            return `
                            <div class="custom-select-option ${p.id === selectedId ? 'selected' : ''}"
                                 data-value="${p.id}"
                                 data-searchable="${getParamDisplayName(p).toLowerCase()} ${p.name.toLowerCase()}"
                                 data-cc-call-click="selectParameter|s:${encodeURIComponent(`${selectId}`)}|s:${encodeURIComponent(`${p.id}`)}|s:${encodeURIComponent(`${elementId}`)}|j:${encodeURIComponent(String(obsIndex))}|s:${encodeURIComponent(`${readingIndex}`)}|j:${encodeURIComponent(String(isAdditional))}">
                                <span class="option-name">${escapeHtml(getParamDisplayName(p))}</span>
                                <span class="option-badges">
                                    ${unit ? `<span class="option-unit">${escapeHtml(unit.symbol)}</span>` : ''}
                                    ${isCustom ? '<span class="badge badge-custom">Custom</span>' : '<span class="badge badge-si">SI</span>'}
                                </span>
                            </div>
                        `;
                        })
                        .join('')}
                    </div>
                </div>
            `;
        });
    }

    return html;
}

/**
 * Toggle a collapsible group (matrix, subcategory, or legacy category).
 * Alterna a visibilidade de um grupo colapsável.
 * @param {HTMLElement} labelEl - The group label element clicked
 */
export function toggleParamGroup(labelEl: any) {
    const group = labelEl.parentElement;
    if (!group) return;
    group.classList.toggle('collapsed');
    const arrow = labelEl.querySelector('.group-arrow');
    if (arrow) {
        arrow.textContent = group.classList.contains('collapsed') ? '▶' : '▼';
    }
}

/**
 * Posiciona o dropdown abaixo do trigger usando coordenadas fixas.
 * O dropdown usa position: fixed para evitar clipping por overflow dos painéis.
 */
function positionDropdown(trigger: any, dropdown: any) {
    const rect = trigger.getBoundingClientRect();
    const dropdownHeight = 300; // max-height do dropdown
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;

    // Largura igual ao trigger
    const width = rect.width;

    // Abaixo do trigger por padrão; acima se não couber
    let top = rect.bottom + 4;
    if (top + dropdownHeight > viewportH && rect.top - dropdownHeight > 0) {
        top = rect.top - dropdownHeight - 4;
    }

    // Alinhado à esquerda do trigger; ajusta se sair da tela
    let left = rect.left;
    if (left + width > viewportW) {
        left = viewportW - width - 8;
    }

    dropdown.style.top = `${top}px`;
    dropdown.style.left = `${left}px`;
    dropdown.style.width = `${width}px`;
}

/**
 * Alterna a visibilidade do dropdown.
 */
export function toggleParamDropdown(selectId: any) {
    const trigger = document.getElementById(`${selectId}-trigger`);
    const dropdown = document.getElementById(`${selectId}-dropdown`);

    if (!trigger || !dropdown) return;

    const isOpen = dropdown.classList.contains('open');

    // Fecha dropdown ativo anterior
    if (activeDropdown && activeDropdown !== selectId) {
        const prevTrigger = document.getElementById(`${activeDropdown}-trigger`);
        const prevDropdown = document.getElementById(`${activeDropdown}-dropdown`);
        if (prevTrigger) prevTrigger.classList.remove('open');
        if (prevDropdown) prevDropdown.classList.remove('open');
    }

    if (isOpen) {
        trigger.classList.remove('open');
        dropdown.classList.remove('open');
        activeDropdown = null;
    } else {
        trigger.classList.add('open');
        dropdown.classList.add('open');
        activeDropdown = selectId;

        // Position dropdown using fixed coordinates (dropdown uses position: fixed)
        positionDropdown(trigger, dropdown);

        // Foca no input de busca
        const searchInput = dropdown.querySelector('input');
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 50);
        }
    }
}

/**
 * Filtra opções baseado na busca.
 * Quando buscando, expande todos os grupos automaticamente.
 * Quando busca limpa, restaura estado colapsado.
 */
export function filterParamOptions(selectId: any, query: any) {
    const optionsContainer = document.getElementById(`${selectId}-options`);
    if (!optionsContainer) return;

    const options = (optionsContainer.querySelectorAll('.custom-select-option') as NodeListOf<HTMLElement>);
    const groups = (optionsContainer.querySelectorAll('.custom-select-group') as NodeListOf<HTMLElement>);
    const normalizedQuery = query.toLowerCase().trim();

    // Classe 'searching' expande todos os grupos via CSS
    if (normalizedQuery) {
        optionsContainer.classList.add('searching');
    } else {
        optionsContainer.classList.remove('searching');
    }

    options.forEach((option) => {
        const searchable = option.dataset.searchable || '';
        if (!normalizedQuery || searchable.includes(normalizedQuery)) {
            option.classList.remove('hidden');
        } else {
            option.classList.add('hidden');
        }
    });

    // Esconde grupos sem opções visíveis (durante busca)
    if (normalizedQuery) {
        // Hide SAO subcategory groups with no visible options
        (optionsContainer.querySelectorAll('.sao-subcat-group') as NodeListOf<HTMLElement>).forEach(
            (subgroup) => {
                const vis = subgroup.querySelectorAll('.custom-select-option:not(.hidden)');
                subgroup.style.display = vis.length === 0 ? 'none' : '';
            },
        );

        // Hide matrix groups with no visible options
        groups.forEach((group) => {
            const visibleOptions = group.querySelectorAll('.custom-select-option:not(.hidden)');
            group.style.display = visibleOptions.length === 0 ? 'none' : '';
        });
    } else {
        // Restore visibility when search clears
        (optionsContainer.querySelectorAll('.sao-subcat-group') as NodeListOf<HTMLElement>).forEach(
            (sg) => (sg.style.display = ''),
        );
        groups.forEach((g) => (g.style.display = ''));
    }
}

/**
 * Seleciona uma opção.
 */
export function selectParameter(
    selectId: any,
    value: any,
    elementId: any,
    obsIndex: any,
    readingIndex: any,
    isAdditional: any,
) {
    // Atualiza visual
    const trigger = document.getElementById(`${selectId}-trigger`);
    const dropdown = document.getElementById(`${selectId}-dropdown`);

    if (trigger) {
        const selected = (CONFIG.PARAMETERS as any[]).find((p: any) => p.id === value);
        const valueSpan = trigger.querySelector('.selected-value');
        if (valueSpan) {
            valueSpan.textContent = selected ? getParamDisplayName(selected) : t('selectParameter');
            valueSpan.classList.toggle('placeholder-text', !selected);
        }
        trigger.classList.remove('open');
    }

    if (dropdown) {
        dropdown.classList.remove('open');
    }

    activeDropdown = null;

    // Dispara o handler de mudança
    const handleReadingChange = (window as any).handleReadingChange;
    if (handleReadingChange) {
        handleReadingChange(elementId, obsIndex, readingIndex, 'parameterId', value, isAdditional);
    }
}

/**
 * Fecha todos os dropdowns ao clicar fora.
 */
function handleClickOutside(event: any) {
    if (activeDropdown) {
        const wrapper = document.getElementById(`${activeDropdown}-wrapper`);
        if (wrapper && !wrapper.contains((event.target as Node | null))) {
            const trigger = document.getElementById(`${activeDropdown}-trigger`);
            const dropdown = document.getElementById(`${activeDropdown}-dropdown`);
            if (trigger) trigger.classList.remove('open');
            if (dropdown) dropdown.classList.remove('open');
            activeDropdown = null;
        }
    }
}

// Registra listener global
document.addEventListener('click', handleClickOutside);

// ----------------------------------------------------------------
// EXPOSIÇÃO GLOBAL
// ----------------------------------------------------------------

(window as any).toggleParamDropdown = toggleParamDropdown;
(window as any).filterParamOptions = filterParamOptions;
(window as any).selectParameter = selectParameter;
(window as any).toggleParamGroup = toggleParamGroup;
