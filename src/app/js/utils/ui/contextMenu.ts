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
   CONTEXT MENU — Menu de contexto (botao direito) nos paineis
   ================================================================

   Menus de contexto para cards de elementos e itens de familia.
   Usa event delegation — um unico listener em cada container.

   PADRAO REUTILIZADO:
   - Mesmas classes CSS de panelManager (.panel-context-menu)
   - Mesmo padrao de show/hide com .visible
   - Mesma logica de reposicionamento se sair da tela

   ================================================================ */
import { getIcon } from './icons.js';
import { t } from '../i18n/translations.js';
import { getElementById, setSelectedElement, getElementsByFamily } from '../../core/elements/manager.js';
import { getElementGroups, getElementGroup, setElementGroup, clearElementGroup } from '../groups/manager.js';
import { hasStrategy } from '../editing/editManager.js';
import { getFamily } from '../../core/elements/families.js';
import { getDocsHelpLabel, openDocsHelp } from '../docs/helpRouter.js';
import { clampMenuToViewport, applyMenuA11y } from './contextMenuHelpers.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {any} */
let menuEl: HTMLElement | null = null;
/** @type {any} */
let currentElementId: string | null = null;
/** @type {any} */
let currentFamilyId: string | null = null;
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Cria o DOM do context menu e registra listeners.
 * Chamado uma vez durante init() em main.js.
 */
export function initElementContextMenu() {
    // Cria elemento DOM compartilhado
    menuEl = document.createElement('div');
    menuEl.className = 'panel-context-menu';
    menuEl.id = 'element-context-menu';
    document.body.appendChild(menuEl);
    // Impedir menu nativo sobre nosso menu
    menuEl.addEventListener('contextmenu', (e: Event) => e.preventDefault());
    // Clique nos itens do menu
    menuEl.addEventListener('click', (e: Event) => {
        const item = (e.target as Element | null)?.closest('.panel-context-menu-item') as HTMLElement | null;
        if (!item || item.classList.contains('disabled'))
            return;
        executeAction(item.dataset.action || '');
        hideMenu();
    });
    // Fechar ao clicar fora
    document.addEventListener('click', (e: MouseEvent) => {
        if (menuEl && !menuEl.contains(e.target as Node | null))
            hideMenu();
    });
    // Fechar com Escape
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape')
            hideMenu();
    });
    // Event delegation: botao direito em element cards
    const elementsContainer = document.getElementById('tab-elements');
    if (elementsContainer) {
        elementsContainer.addEventListener('contextmenu', handleElementContextMenu);
    }
    // Event delegation: botao direito em family items
    const familiesContainer = document.getElementById('families-list');
    if (familiesContainer) {
        familiesContainer.addEventListener('contextmenu', handleFamilyContextMenu);
    }
}
// ----------------------------------------------------------------
// EVENT HANDLERS
// ----------------------------------------------------------------
/**
 * Intercepta right-click em element cards.
 * @param {MouseEvent} e
 */
function handleElementContextMenu(e: MouseEvent) {
    const card = (e.target as Element | null)?.closest('.element-card') as HTMLElement | null;
    if (!card)
        return;
    e.preventDefault();
    e.stopPropagation();
    const elementId = card.dataset.elementId || '';
    if (!elementId)
        return;
    currentElementId = elementId;
    currentFamilyId = null;
    buildElementMenu(elementId);
    showMenu(e.clientX, e.clientY);
}
/**
 * Intercepta right-click em family items.
 * @param {MouseEvent} e
 */
function handleFamilyContextMenu(e: MouseEvent) {
    const item = (e.target as Element | null)?.closest('.family-item') as HTMLElement | null;
    if (!item)
        return;
    e.preventDefault();
    e.stopPropagation();
    const familyId = item.dataset.familyId || '';
    if (!familyId)
        return;
    currentFamilyId = familyId;
    currentElementId = null;
    buildFamilyMenu(familyId);
    showMenu(e.clientX, e.clientY);
}
// ----------------------------------------------------------------
// MENU BUILDERS
// ----------------------------------------------------------------
/**
 * Constroi menu para um element card.
 * @param {string} elementId
 */
function buildElementMenu(elementId: string) {
    if (!menuEl)
        return;
    const element = getElementById(elementId);
    if (!element)
        return;
    const _family = getFamily(element.family);
    const isVisible = element.visible;
    const group = getElementGroup(elementId);
    const groups = getElementGroups();
    const canEditShape = hasStrategy(element.family);
    let html = '';
    // Zoom to element
    html += menuItem('zoom-to', 'target', t('zoomToElement'));
    html += menuItem(isVisible ? 'hide' : 'show', isVisible ? 'eye-off' : 'eye', isVisible ? t('hideElement') : t('showElement'));
    html += separator();
    // Copy / Duplicate
    html += menuItem('copy', 'copy', t('copy'));
    html += menuItem('duplicate', 'copy', t('duplicate'));
    html += separator();
    // Edit shape (conditional) + Transform (always available)
    if (canEditShape) {
        html += menuItem('edit-shape', 'edit', t('editShape'));
    }
    html += menuItem('transform', 'move', t('transform') || 'Transform');
    // Move to group (submenu-like: flat list of groups)
    if (groups.length > 0) {
        html += `<div class="panel-context-menu-label">${t('moveToGroup')}</div>`;
        for (const g of groups) {
            const active = group === g.id ? ' active' : '';
            html += `<button class="panel-context-menu-item panel-context-menu-sub${active}" data-action="move-to-group:${g.id}">
                ${getIcon('layers', { size: '14px' })}
                <span>${g.name}</span>
            </button>`;
        }
        if (group) {
            html += menuItem('remove-from-group', 'x', t('removeFromGroup'));
        }
        html += separator();
    }
    // Delete
    html += menuItem('delete', 'trash', t('delete'), 'panel-context-menu-item danger');
    // Help + Report Bug
    html += separator();
    html += menuItem('docs-help', 'book-open', getDocsHelpLabel());
    html += menuItem('report-bug', 'alert-circle', t('reportBug.menuItem') || 'Reportar Bug');
    menuEl.innerHTML = html;
}
/**
 * Constroi menu para um family item.
 * @param {string} familyId
 */
function buildFamilyMenu(familyId: string) {
    if (!menuEl)
        return;
    const elements = getElementsByFamily(familyId);
    const hasElements = elements.length > 0;
    let html = '';
    // Add element
    html += menuItem('add-element', 'plus', t('addElement'));
    if (hasElements) {
        html += separator();
        html += menuItem('show-all', 'eye', t('showAll'));
        html += menuItem('hide-all', 'eye-off', t('hideAll'));
        html += separator();
        html += menuItem('zoom-to-family', 'target', t('zoomToFamily'));
    }
    // Help + Report Bug
    html += separator();
    html += menuItem('docs-help', 'book-open', getDocsHelpLabel());
    html += menuItem('report-bug', 'alert-circle', t('reportBug.menuItem') || 'Reportar Bug');
    menuEl.innerHTML = html;
}
// ----------------------------------------------------------------
// MENU ITEM HELPERS
// ----------------------------------------------------------------
function menuItem(action: string, icon: string, label: string, className = 'panel-context-menu-item') {
    return `<button class="${className}" data-action="${action}">
        ${getIcon(icon, { size: '14px' })}
        <span>${label}</span>
    </button>`;
}
function separator() {
    return '<div class="panel-context-menu-sep"></div>';
}
// ----------------------------------------------------------------
// ACTION EXECUTION
// ----------------------------------------------------------------
/**
 * Executa acao do menu.
 * Chama handlers existentes via window.* ou funcoes diretas.
 *
 * @param {string} action - Identificador da acao
 */
function executeAction(action: string) {
    /** @type {any} */
    const win = window;
    // Report Bug - independente de contexto (elemento ou família)
    if (action === 'report-bug') {
        win.handleReportBug?.();
        return;
    }
    if (action === 'docs-help') {
        openDocsHelp('elements');
        return;
    }
    // --- Element actions ---
    if (currentElementId) {
        const id = currentElementId;
        switch (action) {
            case 'zoom-to':
                win.handleZoomToElement?.(id);
                break;
            case 'show':
            case 'hide':
                win.handleToggleVisibility?.(id);
                break;
            case 'copy':
                // Seleciona o elemento antes de copiar (handleCopyElement usa getSelectedElement)
                setSelectedElement(id);
                win.handleCopyElement?.();
                break;
            case 'duplicate':
                win.handleDuplicateElement?.(id);
                break;
            case 'edit-shape':
                win.handleEnterShapeEdit?.(id);
                break;
            case 'transform':
                win.handleEnterGizmoMode?.(id);
                break;
            case 'remove-from-group':
                clearElementGroup(id);
                win.handleSelectElement?.(id);
                break;
            case 'delete':
                win.handleRemoveElement?.(id);
                break;
            default:
                // Move to group: action = "move-to-group:groupId"
                if (action.startsWith('move-to-group:')) {
                    const groupId = action.slice('move-to-group:'.length);
                    setElementGroup(id, groupId);
                    win.handleSelectElement?.(id);
                }
                break;
        }
    }
    // --- Family actions ---
    if (currentFamilyId) {
        const fid = currentFamilyId;
        switch (action) {
            case 'add-element':
                win.handleAddElement?.(fid);
                break;
            case 'show-all':
                win.handleShowAllFamily?.(fid);
                break;
            case 'hide-all':
                win.handleHideAllFamily?.(fid);
                break;
            case 'zoom-to-family':
                win.handleZoomToFamily?.(fid);
                break;
        }
    }
}
// ----------------------------------------------------------------
// SHOW / HIDE
// ----------------------------------------------------------------
function showMenu(x: number, y: number) {
    if (!menuEl)
        return;
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
    menuEl.classList.add('visible');
    const currentMenu = menuEl;
    // WAI-ARIA menu pattern (D2b)
    applyMenuA11y(currentMenu, { label: t('contextMenu.label') || 'Element actions' });
    // Reposicionar se sair da tela via helper D2 (precisa estar .visible para medir)
    requestAnimationFrame(() => {
        clampMenuToViewport(currentMenu, x, y, 8);
    });
}
function hideMenu() {
    if (menuEl) {
        menuEl.classList.remove('visible');
        currentElementId = null;
        currentFamilyId = null;
    }
}
//# sourceMappingURL=contextMenu.js.map
