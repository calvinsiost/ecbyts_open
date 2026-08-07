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

/* ================================================================
   EDIT TOOLBAR — Ribbon tab + floating indicator for shape editing
   ================================================================

   Quando o shape editor é ativado:
   1. Mostra a aba "Edit" na ribbon e muda para ela
   2. Mostra um indicador flutuante no canvas (nome do elemento + dica)
   3. Atualiza contagem de vértices na ribbon

   A ribbon Edit contém: Add Vertices, Delete Vertex, Reset Shape, Done.
   O indicador flutuante é mínimo (só nome + status).

   ================================================================ */

import { t } from '../i18n/translations.js';
import { switchRibbonTab } from '../ui/ribbon.js';
import { hydrateIcons } from '../ui/icons.js';
import { isSnapEnabled, getGridSize } from './snapEngine.js';

// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------

let floatingIndicator: any = null;
let previousRibbonTab: any = null;
let callbacks: any = {};

// ----------------------------------------------------------------
// MOSTRAR / ATUALIZAR / ESCONDER
// ----------------------------------------------------------------

/**
 * Mostra a aba Edit na ribbon e o indicador flutuante.
 */
export function showEditToolbar(opts: any = {}): void {
    callbacks = opts;
    hideEditToolbar();
    // 1. Salva a aba ribbon ativa atual
    const activeItem = document.querySelector('#menubar .menu-item.active') as HTMLElement | null;
    previousRibbonTab = activeItem?.dataset?.ribbon || 'home';
    // 2. Mostra a aba Edit na ribbon
    const editTab = document.getElementById('menu-edit-tab');
    if (editTab) {
        editTab.style.display = '';
    }
    // 3. Muda para a aba Edit
    switchRibbonTab('edit');
    // 4. Atualiza info na ribbon
    _updateRibbonInfo(opts);
    // 5. Cria indicador flutuante mínimo no canvas
    floatingIndicator = document.createElement('div');
    floatingIndicator.className = 'edit-toolbar';
    floatingIndicator.setAttribute('aria-live', 'polite');
    floatingIndicator.setAttribute('aria-label', t('editingShape') || 'Shape editor toolbar');
    const showCarousel = (opts.editableCount || 0) > 1;
    const carouselHtml = showCarousel
        ? `<span class="edit-toolbar-carousel">
            <button class="edit-toolbar-carousel-btn" id="edit-carousel-prev" title="${t('previousElement') || 'Previous'}" aria-label="${t('previousElement') || 'Previous element'}">&#8249;</button>
            <span class="edit-toolbar-carousel-pos">${(opts.currentEditableIndex || 0) + 1}/${opts.editableCount}</span>
            <button class="edit-toolbar-carousel-btn" id="edit-carousel-next" title="${t('nextElement') || 'Next'}" aria-label="${t('nextElement') || 'Next element'}">&#8250;</button>
           </span>`
        : '';
    floatingIndicator.innerHTML = `
        <span class="edit-toolbar-label">${t('editingShape') || 'Editing Shape'}</span>
        ${carouselHtml}
        <span class="edit-toolbar-count" id="edit-vertex-count">${opts.vertexCount || 0} ${t('vertices') || 'vertices'}</span>
        <select class="edit-toolbar-opacity" id="edit-opacity-select" title="${t('opacity') || 'Opacity'}" aria-label="${t('opacity') || 'Opacity'}">
            <option value="1.0" selected>100%</option>
            <option value="0.6">60%</option>
            <option value="0.2">20%</option>
        </select>
    `;
    const canvasContainer = document.getElementById('canvas-container');
    if (canvasContainer) {
        canvasContainer.appendChild(floatingIndicator);
    }
    // Wire carousel buttons
    if (showCarousel) {
        const prevBtn = floatingIndicator.querySelector('#edit-carousel-prev');
        const nextBtn = floatingIndicator.querySelector('#edit-carousel-next');
        if (prevBtn && callbacks.onPrev) prevBtn.addEventListener('click', callbacks.onPrev);
        if (nextBtn && callbacks.onNext) nextBtn.addEventListener('click', callbacks.onNext);
    }
    // Wire opacity select
    const opacitySelect = floatingIndicator.querySelector('#edit-opacity-select');
    if (opacitySelect && callbacks.onOpacity) {
        opacitySelect.addEventListener('change', (e: any) => callbacks.onOpacity(parseFloat(e.target.value)));
    }
    // 6. Mostra/oculta grupos de gizmo vs shape edit na ribbon
    _updateModeGroups(opts);
    // 7. Sincroniza estado do snap na ribbon
    _syncSnapUI();
    // 8. Mostra painel de coordenadas em gizmo mode
    const coordsGroup = document.getElementById('edit-ribbon-coords-group');
    if (coordsGroup) {
        coordsGroup.style.display = opts.gizmoMode ? '' : 'none';
    }
    // 9. Hydrate ribbon icons
    hydrateIcons();
}

/**
 * Atualiza toolbar (contagem de vértices, draw mode, carousel position).
 */
export function updateEditToolbar(opts: any = {}): void {
    // Atualiza indicador flutuante
    if (floatingIndicator) {
        const countEl = floatingIndicator.querySelector('#edit-vertex-count');
        if (countEl && opts.vertexCount !== undefined) {
            const selectedInfo =
                opts.selectedCount > 0 ? ` (${opts.selectedCount} ${t('selected') || 'selected'})` : '';
            countEl.textContent = `${opts.vertexCount} ${t('vertices') || 'vertices'}${selectedInfo}`;
        }
        // Atualiza posição do carousel
        const carouselPos = floatingIndicator.querySelector('.edit-toolbar-carousel-pos');
        if (carouselPos && opts.editableCount !== undefined) {
            carouselPos.textContent = `${(opts.currentEditableIndex || 0) + 1}/${opts.editableCount}`;
        }
        // Atualiza nome do elemento
        const labelEl = floatingIndicator.querySelector('.edit-toolbar-label');
        if (labelEl && opts.elementName) {
            labelEl.textContent = opts.elementName;
        }
    }
    // Atualiza ribbon info
    _updateRibbonInfo(opts);
}

/**
 * Esconde tudo: remove indicador flutuante, esconde aba Edit, volta à ribbon anterior.
 */
export function hideEditToolbar(): void {
    // Remove indicador flutuante
    if (floatingIndicator) {
        floatingIndicator.remove();
        floatingIndicator = null;
    }
    // Esconde aba Edit na ribbon
    const editTab = document.getElementById('menu-edit-tab');
    if (editTab) {
        editTab.style.display = 'none';
    }
    // Volta à ribbon anterior
    if (previousRibbonTab) {
        switchRibbonTab(previousRibbonTab);
        previousRibbonTab = null;
    }
    callbacks = {};
}

// ----------------------------------------------------------------
// HELPERS INTERNOS
// ----------------------------------------------------------------

function _updateRibbonInfo(opts: any = {}): void {
    // Contagem de vértices na ribbon
    const ribbonCount = document.getElementById('edit-ribbon-vertex-count');
    if (ribbonCount && opts.vertexCount !== undefined) {
        ribbonCount.textContent = `${opts.vertexCount} ${t('vertices') || 'vertices'}`;
    }
    // Nome do elemento na ribbon
    const ribbonName = document.getElementById('edit-ribbon-element-name');
    if (ribbonName && opts.elementName) {
        ribbonName.textContent = opts.elementName;
    }
    // Toggle draw button ativo
    const drawBtn = document.getElementById('edit-ribbon-draw-btn');
    if (drawBtn) {
        drawBtn.classList.toggle('active', !!opts.drawActive);
        // Esconde botão se draw não é suportado
        if (opts.drawSupported === false) {
            drawBtn.style.display = 'none';
        } else {
            drawBtn.style.display = '';
        }
    }
}

function _updateModeGroups(opts: any = {}): void {
    const gizmoGroup = document.getElementById('edit-ribbon-gizmo-group');
    const toggleGroup = document.getElementById('edit-ribbon-toggle-group');
    const vertexGroup = document.querySelector('#ribbon-edit .toolbar-group:nth-child(2)') as HTMLElement | null; // Vertices group
    if (opts.gizmoMode) {
        // Modo gizmo: mostra gizmo controls, oculta vertex controls
        if (gizmoGroup) gizmoGroup.style.display = '';
        if (vertexGroup) vertexGroup.style.display = 'none';
        // Highlight translate por default
        const translateBtn = document.getElementById('edit-ribbon-gizmo-translate');
        if (translateBtn) translateBtn.classList.add('active');
    } else {
        // Modo shape edit: oculta gizmo controls, mostra vertex controls
        if (gizmoGroup) gizmoGroup.style.display = 'none';
        if (vertexGroup) vertexGroup.style.display = '';
    }
    // Toggle button (G) - mostra se elemento suporta ambos os modos
    if (toggleGroup) {
        toggleGroup.style.display = opts.canToggleShapeEdit ? '' : 'none';
        const label = document.getElementById('edit-ribbon-toggle-label');
        if (label) label.textContent = opts.gizmoMode ? 'Shape Edit' : 'Gizmo';
    }
}

function _syncSnapUI(): void {
    const snapBtn = document.getElementById('edit-ribbon-snap-btn');
    if (snapBtn) snapBtn.classList.toggle('active', isSnapEnabled());
    const gridSelect = document.getElementById('edit-ribbon-grid-select') as HTMLSelectElement | null;
    if (gridSelect) gridSelect.value = String(getGridSize());
}
