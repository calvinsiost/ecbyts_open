// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// @ts-check
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
   SHAPE EDIT CONTEXT MENU — Right-click menu for shape editing
   ================================================================

   Menu de contexto para edição de formas 3D no viewport.
   Aparece ao clicar com botão direito no canvas durante edição.

   Itens mudam conforme o alvo do clique:
   - Vértice: Excluir Vértice, Draw Mode, Resetar, Sair
   - Ponto Médio: Inserir Vértice, Draw Mode, Resetar, Sair
   - Espaço Vazio (edit): Draw Mode, Resetar, Sair
   - Espaço Vazio (draw): Adicionar Vértice Aqui, Sair Draw, Resetar, Sair

   Reutiliza as classes CSS `.panel-context-menu` do panelManager.

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
const THREE: any = createTHREEProxy();
import { getCamera, getEditHandlesGroup, getRenderer } from '../scene/setup.js';
import { updateHandleScales } from './handleFactory.js';
import { isEditing, getEditMode, exitEditMode, toggleDrawMode, deleteSelectedVertex, resetShape, insertVertexAtMidpoint, addVertexAtPosition, selectVertexByIndex, } from './editManager.js';
import { isDragActive } from './dragController.js';
import { getIcon } from '../ui/icons.js';
import { t } from '../i18n/translations.js';
import { getDocsHelpLabel, openDocsHelp } from '../docs/helpRouter.js';
import { clampMenuToViewport, applyMenuA11y } from '../ui/contextMenuHelpers.js';
// ----------------------------------------------------------------
// ESTADO
// ----------------------------------------------------------------
let menuEl: HTMLElement | null = null;
let container: HTMLElement | null = null;
let raycaster: any = null;
let _mouse: any = null;
let _groundPlane: any = null;
let _worldPos: any = null;
function _getMouse() { if (!_mouse) _mouse = new THREE.Vector2(); return _mouse; }
function _getGroundPlane() { if (!_groundPlane) _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); return _groundPlane; }
function _getWorldPos() { if (!_worldPos) _worldPos = new THREE.Vector3(); return _worldPos; }
// Alvo do clique direito (preenchido pelo raycast)
let clickTarget: any = null;
// { type: 'vertex'|'midpoint'|'empty', handle?, vertexIndex?, afterIndex?, worldPos? }
// ----------------------------------------------------------------
// INICIALIZAÇÃO
// ----------------------------------------------------------------
/**
 * Inicializa o menu de contexto para shape editing.
 * Cria DOM, registra listeners no canvas container.
 *
 * @param {HTMLElement} canvasContainer
 */
export function initContextMenu(canvasContainer: any) {
    container = canvasContainer;
    raycaster = new (THREE.Raycaster)();
    // Cria elemento DOM (reusa classes do panel-context-menu)
    menuEl = document.createElement('div');
    menuEl.className = 'panel-context-menu';
    menuEl.id = 'shape-edit-context-menu';
    document.body.appendChild(menuEl);
    // Listener de contexto no canvas (capture para interceptar antes de OrbitControls)
    container?.addEventListener('contextmenu', handleContextMenu, { capture: true });
    // Clique no menu → executa ação
    menuEl.addEventListener('click', handleMenuClick);
    // Previne menu nativo sobre o nosso menu
    menuEl.addEventListener('contextmenu', (e: any) => e.preventDefault());
    // Fechar ao clicar fora
    document.addEventListener('mousedown', handleOutsideClick);
    // Fechar com Escape
    document.addEventListener('keydown', handleEscapeKey);
}
/**
 * Destrói o menu de contexto completamente.
 */
export function destroyContextMenu() {
    if (container) {
        container.removeEventListener('contextmenu', handleContextMenu, { capture: true });
    }
    if (menuEl) {
        menuEl.removeEventListener('click', handleMenuClick);
        menuEl.remove();
        menuEl = null;
    }
    document.removeEventListener('mousedown', handleOutsideClick);
    document.removeEventListener('keydown', handleEscapeKey);
    container = null;
    raycaster = null;
    clickTarget = null;
}
// ----------------------------------------------------------------
// EVENT HANDLERS
// ----------------------------------------------------------------
/**
 * Handler do evento contextmenu no canvas.
 * Determina o alvo via raycast e mostra menu contextual.
 */
/** @param {MouseEvent} event */
function handleContextMenu(event: any) {
    // Só mostra se está em modo de edição
    if (!isEditing())
        return;
    // Não mostra durante arrasto ativo
    if (isDragActive())
        return;
    event.preventDefault();
    event.stopPropagation();
    // Raycast contra handles para descobrir o alvo
    clickTarget = resolveTarget(event);
    // Monta e exibe o menu
    buildMenu();
    showMenu(event.clientX, event.clientY);
}
/**
 * Clique em item do menu → executa ação correspondente.
 */
/** @param {any} event */
function handleMenuClick(event: any) {
    const item = event.target.closest('[data-action]');
    if (!item || item.classList.contains('disabled'))
        return;
    const action = item.dataset.action || '';
    executeAction(action);
    hideMenu();
}
/**
 * Fechar menu ao clicar fora dele.
 */
/** @param {any} event */
function handleOutsideClick(event: any) {
    if (!menuEl || !menuEl.classList.contains('visible'))
        return;
    if (menuEl.contains(event.target))
        return;
    hideMenu();
}
/**
 * Fechar menu com Escape.
 */
/** @param {KeyboardEvent} event */
function handleEscapeKey(event: any) {
    if (event.key === 'Escape' && menuEl?.classList.contains('visible')) {
        event.stopPropagation(); // Não propaga para o exitEditMode do main.js
        hideMenu();
    }
}
// ----------------------------------------------------------------
// RAYCAST - DETERMINAR ALVO
// ----------------------------------------------------------------
/**
 * Faz raycast nos handles de edição para descobrir o que foi clicado.
 * @param {MouseEvent} event
 * @returns {{ type: string, handle?: any, vertexIndex?: number, afterIndex?: number, worldPos?: any }}
 */
function resolveTarget(event: any) {
    const handleGroup = getEditHandlesGroup();
    const camera = getCamera();
    if (!handleGroup || !camera)
        return { type: 'empty' };
    // Atualiza coordenadas normalizadas do mouse
    const renderer = getRenderer();
    const rect = renderer.domElement.getBoundingClientRect();
    _getMouse().x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _getMouse().y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    // Atualiza escala dos handles antes do raycast
    updateHandleScales(handleGroup);
    raycaster.setFromCamera(_getMouse(), camera);
    // Filtra apenas handles (não Lines/outlines)
    const handleMeshes = handleGroup.children.filter((c: any) => c.userData?.handleType);
    const intersects = raycaster.intersectObjects(handleMeshes, false);
    if (intersects.length > 0) {
        const hit = intersects[0].object;
        const type = hit.userData.handleType;
        if (type === 'vertex') {
            return {
                type: 'vertex',
                handle: hit,
                vertexIndex: hit.userData.vertexIndex,
            };
        }
        if (type === 'midpoint') {
            return {
                type: 'midpoint',
                handle: hit,
                afterIndex: hit.userData.afterIndex,
            };
        }
    }
    // Nenhum handle clicado - calcula posição no plano do chão
    _getGroundPlane().normal.set(0, 1, 0);
    _getGroundPlane().constant = 0;
    raycaster.ray.intersectPlane(_getGroundPlane(), _getWorldPos());
    return { type: 'empty', worldPos: _getWorldPos().clone() };
}
// ----------------------------------------------------------------
// CONSTRUÇÃO DO MENU
// ----------------------------------------------------------------
/**
 * Retorna os itens contextuais do menu conforme o alvo do clique.
 */
function getTargetSpecificItems(target: any, mode: string): string[] {
    if (target.type === 'vertex') {
        return [menuItem('delete-vertex', 'trash', t('deleteVertex') || 'Delete Vertex', 'Del')];
    }
    if (target.type === 'midpoint') {
        return [menuItem('insert-vertex', 'plus', t('insertVertex') || 'Insert Vertex')];
    }
    if (target.type === 'empty' && mode === 'draw') {
        return [menuItem('add-vertex-here', 'plus', t('addVertexHere') || 'Add Vertex Here')];
    }
    return [];
}

/**
 * Retorna o item de toggle do modo Draw.
 */
function getDrawToggleItem(mode: string): string {
    if (mode === 'draw') {
        return menuItem('toggle-draw', 'pen-tool', t('exitDrawMode') || 'Exit Draw Mode', 'D', true);
    }
    return menuItem('toggle-draw', 'pen-tool', t('enterDrawMode') || 'Enter Draw Mode', 'D');
}

/**
 * Retorna os itens padrão do menu (reset, done, help, report bug).
 */
function getStandardItems(): string[] {
    return [
        menuItem('reset-shape', 'rotate-ccw', t('resetShape') || 'Reset Shape', 'R'),
        separator(),
        menuItem('done', 'check', t('doneEditing') || 'Done', 'Enter'),
        separator(),
        menuItem('docs-help', 'book-open', getDocsHelpLabel()),
        menuItem('report-bug', 'alert-circle', t('reportBug.menuItem') || 'Reportar Bug'),
    ];
}

/**
 * Constrói o HTML do menu baseado no alvo e modo de edição.
 */
function buildMenu() {
    if (!menuEl || !clickTarget)
        return;
    const mode = getEditMode();
    const items: string[] = [];
    const contextual = getTargetSpecificItems(clickTarget, mode);
    if (contextual.length > 0) {
        items.push(...contextual, separator());
    }
    items.push(getDrawToggleItem(mode));
    items.push(...getStandardItems());
    menuEl.innerHTML = items.join('');
}
/**
 * Cria HTML de um item do menu.
 */
/**
 * @param {string} action
 * @param {string} icon
 * @param {string} label
 * @param {string} [shortcut]
 * @param {boolean} [active]
 */
function menuItem(action: string, icon: string, label: string, shortcut = '', active = false) {
    const iconHtml = getIcon(icon, { size: '14px' });
    const shortcutHtml = shortcut ? `<span class="panel-context-menu-shortcut">${shortcut}</span>` : '';
    const activeClass = active ? ' active' : '';
    return `<button class="panel-context-menu-item${activeClass}" data-action="${action}">
        ${iconHtml}
        <span>${label}</span>
        ${shortcutHtml}
    </button>`;
}
/**
 * Cria HTML de separador.
 */
function separator() {
    return '<div class="panel-context-menu-sep"></div>';
}
// ----------------------------------------------------------------
// MOSTRAR / ESCONDER
// ----------------------------------------------------------------
/**
 * Posiciona e mostra o menu no local do clique.
 */
/**
 * @param {number} x
 * @param {number} y
 */
function showMenu(x: any, y: any) {
    if (!menuEl)
        return;
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
    menuEl.classList.add('visible');
    // WAI-ARIA menu pattern (D2b)
    applyMenuA11y(menuEl, { label: t('editMenu.label') || 'Shape editing actions' });
    // Clamp ao viewport via helper D2 (pad=0 mantém comportamento legado)
    clampMenuToViewport(menuEl, x, y, 0);
}
/**
 * Esconde o menu de contexto.
 */
export function hideMenu() {
    if (menuEl) {
        menuEl.classList.remove('visible');
    }
    clickTarget = null;
}
// ----------------------------------------------------------------
// EXECUÇÃO DE AÇÕES
// ----------------------------------------------------------------
/**
 * Executa a ação selecionada no menu.
 * @param {string} action
 */
function executeAction(action: any) {
    switch (action) {
        case 'delete-vertex':
            // Seleciona o vértice que foi clicado com botão direito, depois deleta
            if (clickTarget?.type === 'vertex' && clickTarget.handle) {
                selectVertexByIndex(clickTarget.vertexIndex, clickTarget.handle);
            }
            deleteSelectedVertex();
            break;
        case 'insert-vertex':
            if (clickTarget?.afterIndex !== undefined) {
                insertVertexAtMidpoint(clickTarget.afterIndex);
            }
            break;
        case 'add-vertex-here':
            if (clickTarget?.worldPos) {
                addVertexAtPosition(clickTarget.worldPos);
            }
            break;
        case 'toggle-draw':
            toggleDrawMode();
            break;
        case 'reset-shape':
            resetShape();
            break;
        case 'done':
            exitEditMode();
            break;
        case 'docs-help':
            openDocsHelp('scene-3d');
            break;
        case 'report-bug':
            window.handleReportBug?.();
            break;
    }
}
//# sourceMappingURL=contextMenu.js.map
