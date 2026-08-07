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
   CANVAS CONTEXT MENU — Right-click on empty 3D viewport space
   ================================================================

   Menu de contexto para clique direito no espaco vazio do canvas 3D.
   Aparece quando o usuario clica com botao direito fora de qualquer
   elemento ou handle de edicao.

   Itens:
   - Add Element (submenu por familia habilitada)
   - Paste (se clipboard tem conteudo)
   - Separator
   - Fit All, Isometric, Top, Front views
   - Separator
   - Generate Random Model

   Reutiliza classes CSS `.panel-context-menu` do panelManager.

   ================================================================ */
import { createTHREEProxy } from '../../core/three-lazy.js';
import { getCamera, getRenderer, getElementsGroup } from './setup.js';
import { getEnabledFamilies, getFamilyName } from '../../core/elements/families.js';
import { hasClipboard } from '../handlers/elements.js';
import { isEditing } from '../editing/editManager.js';
import { getIcon } from '../ui/icons.js';
import { Z_INDEX } from '../ui/zIndex.js';
import { clampMenuToViewport, applyMenuA11y } from '../ui/contextMenuHelpers.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { getDocsHelpLabel, openDocsHelp } from '../docs/helpRouter.js';
import {
    normalizeRightClickBehavior,
    shouldAllowNativeContextMenu,
    shouldStartRightDragPan,
} from './rightClickIntention.js';
const THREE: any = createTHREEProxy();
const appWindow: any = () => window;
/** @param {unknown} error */
const errorMessage = (error: any) =>
    error && typeof error === 'object' && 'message' in error ? String(error.message) : String(error);
let menuEl: any = null;
let submenuEl: any = null;
let container: any = null;
let _raycaster: any = null;
let _mouse: any = null;
function _getRaycaster() { if (!_raycaster) _raycaster = new THREE.Raycaster(); return _raycaster; }
function _getMouse() { if (!_mouse) _mouse = new THREE.Vector2(); return _mouse; }
// Posição 3D e elemento do último clique direito (para criação de issues/serviços)
let _lastMenuPos = { x: 0, y: 0, z: 0 };
/** @type {string|null} */
let _lastMenuElementId: any = null;
const RIGHT_CLICK_SETTINGS_KEY = 'ecbyts.input.rightClickSettings';
const DEFAULT_RIGHT_CLICK_SETTINGS = Object.freeze({
    behavior: 'pan',
    thresholdPx: 5,
    showGhostMarker: true,
    longPressMenu: false,
    longPressMs: 500,
});
const rightClickGesture: any = {
    tracking: false,
    dragging: false,
    startX: 0,
    startY: 0,
    suppressNextContextMenu: false,
    suppressTimer: null,
    longPressTimer: null,
    longPressSnapshot: null,
    menuOpenedByLongPress: false,
    ghostMarkerEl: null,
};
/**
 * @returns {RightClickInputSettings}
 */
function getRightClickInputSettings() {
    const fallback = { ...DEFAULT_RIGHT_CLICK_SETTINGS };
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return fallback;
    const parsed = safeJsonParse<any>(
        window.localStorage.getItem(RIGHT_CLICK_SETTINGS_KEY),
        null,
        'canvasContextMenu-readSettings'
    );
    return parsed ? _sanitizeRightClickInputSettings(parsed) : fallback;
}
/**
 * @param {Partial<RightClickInputSettings>} [nextSettings]
 * @returns {RightClickInputSettings}
 */
function setRightClickInputSettings( nextSettings: any = {}) {
    const merged = _sanitizeRightClickInputSettings({
        ...getRightClickInputSettings(),
        ...nextSettings,
    });
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
        try {
            window.localStorage.setItem(RIGHT_CLICK_SETTINGS_KEY, JSON.stringify(merged));
        } catch (e: any) {
            console.debug('[canvasContextMenu] writeSettings:', errorMessage(e));
            // ignore storage write failures
        }
    }
    return merged;
}
/**
 * @param {Partial<RightClickInputSettings>|Record<string, any>} [settings]
 * @returns {RightClickInputSettings}
 */
function _sanitizeRightClickInputSettings( settings: any = {}) {
    const thresholdRaw = Number(settings.thresholdPx);
    const longPressMsRaw = Number(settings.longPressMs);
    return {
        behavior: normalizeRightClickBehavior(settings.behavior),
        thresholdPx: Number.isFinite(thresholdRaw) ? Math.min(30, Math.max(1, Math.round(thresholdRaw))) : 5,
        showGhostMarker: settings.showGhostMarker !== false,
        longPressMenu: settings.longPressMenu === true,
        longPressMs: Number.isFinite(longPressMsRaw) ? Math.min(2000, Math.max(250, Math.round(longPressMsRaw))) : 500,
    };
}
/**
 * @param {number} x
 * @param {number} y
 * @returns {HTMLDivElement}
 */
function _ensurePanGhostMarker( x: any, y: any) {
    if (rightClickGesture.ghostMarkerEl) return rightClickGesture.ghostMarkerEl;
    const el = document.createElement('div');
    el.className = 'canvas-pan-ghost-marker';
    el.id = 'canvas-pan-ghost-marker';
    el.style.position = 'fixed';
    el.style.width = '20px';
    el.style.height = '20px';
    el.style.borderRadius = '50%';
    el.style.border = '1px solid rgba(120,220,255,0.9)';
    el.style.background = 'rgba(255,255,255,0.08)';
    el.style.pointerEvents = 'none';
    el.style.zIndex = String(Z_INDEX.EXCEPTION_CANVAS_CONTEXT_MENU);
    el.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.2) inset';
    el.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(el);
    rightClickGesture.ghostMarkerEl = el;
    _positionPanGhostMarker(x, y);
    return el;
}
/**
 * @param {number} x
 * @param {number} y
 */
function _positionPanGhostMarker( x: any, y: any) {
    if (!rightClickGesture.ghostMarkerEl) return;
    rightClickGesture.ghostMarkerEl.style.left = `${x}px`;
    rightClickGesture.ghostMarkerEl.style.top = `${y}px`;
}
function _removePanGhostMarker() {
    const marker = rightClickGesture.ghostMarkerEl;
    if (!marker) return;
    rightClickGesture.ghostMarkerEl = null;
    if (marker.parentNode) marker.parentNode.removeChild(marker);
}
function _clearRightClickSuppressTimer() {
    if (!rightClickGesture.suppressTimer) return;
    clearTimeout(rightClickGesture.suppressTimer);
    rightClickGesture.suppressTimer = null;
}
function _clearLongPressTimer() {
    if (!rightClickGesture.longPressTimer) return;
    clearTimeout(rightClickGesture.longPressTimer);
    rightClickGesture.longPressTimer = null;
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Inicializa o menu de contexto do canvas.
 * Cria DOM, registra listener de contextmenu no container do canvas.
 *
 * @param {HTMLElement} canvasContainer
 */
export function initCanvasContextMenu( canvasContainer: any) {
    container = canvasContainer;
    // Menu principal
    menuEl = document.createElement('div');
    menuEl.className = 'panel-context-menu';
    menuEl.id = 'canvas-context-menu';
    document.body.appendChild(menuEl);
    // Submenu para familias
    submenuEl = document.createElement('div');
    submenuEl.className = 'panel-context-menu';
    submenuEl.id = 'canvas-context-submenu';
    document.body.appendChild(submenuEl);
    // Listener no canvas - bubble phase (editing context menu usa capture)
    container.addEventListener('mousedown', handlePointerDown);
    container.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    container.addEventListener('contextmenu', handleContextMenu);
    // Clique nos itens
    menuEl.addEventListener('click', handleMenuClick);
    submenuEl.addEventListener('click', handleSubmenuClick);
    // Previne menu nativo sobre nossos menus
    menuEl.addEventListener('contextmenu', (e: any) => e.preventDefault());
    submenuEl.addEventListener('contextmenu', (e: any) => e.preventDefault());
    // Fechar ao clicar fora
    document.addEventListener('mousedown', handleOutsideClick);
    // Fechar com Escape
    document.addEventListener('keydown', handleEscapeKey);
    // Public API (settings page / debug console)
    if (typeof window !== 'undefined') {
        appWindow().getRightClickInputSettings = getRightClickInputSettings;
        appWindow().setRightClickInputSettings = setRightClickInputSettings;
    }
}
// ----------------------------------------------------------------
// EVENT HANDLERS
// ----------------------------------------------------------------
/**
 * Handler do contextmenu no canvas.
 * Captura posição 3D antes de exibir o menu (para criação de issues/serviços).
 */
/**
 * @param {MenuPointerEvent} event
 */
function handleContextMenu( event: any) {
    // Nao mostra durante edicao de formas (editing contextMenu cuida disso)
    if (isEditing()) return;
    if (shouldAllowNativeContextMenu(event)) {
        _clearRightClickSuppressTimer();
        _clearLongPressTimer();
        rightClickGesture.suppressNextContextMenu = false;
        return;
    }
    const settings = getRightClickInputSettings();
    if (settings.behavior === 'pan' && rightClickGesture.suppressNextContextMenu) {
        event.preventDefault();
        event.stopPropagation();
        _clearRightClickSuppressTimer();
        _clearLongPressTimer();
        rightClickGesture.suppressNextContextMenu = false;
        return;
    }
    event.preventDefault();
    event.stopPropagation();
    _clearRightClickSuppressTimer();
    _clearLongPressTimer();
    rightClickGesture.suppressNextContextMenu = false;
    rightClickGesture.menuOpenedByLongPress = false;
    _removePanGhostMarker();
    if (container) container.style.cursor = '';
    // Captura hit e posição 3D independente de ter clicado em elemento
    const hit = hitTest(event);
    _lastMenuElementId = hit?.elementId || null;
    _lastMenuPos = hit?.point || _projectCursorToGround(event);
    buildMenu();
    showMenu(event.clientX, event.clientY);
}
/**
 * @param {ContextMenuSnapshot|null} snapshot
 * @returns {MenuPointerEvent}
 */
function _createSyntheticContextMenuEvent( snapshot: any) {
    return {
        clientX: snapshot?.clientX ?? 0,
        clientY: snapshot?.clientY ?? 0,
        ctrlKey: Boolean(snapshot?.ctrlKey),
        metaKey: Boolean(snapshot?.metaKey),
        button: 2,
        preventDefault() {},
        stopPropagation() {},
    };
}
/**
 * @param {MouseEvent} event
 */
function handlePointerDown( event: any) {
    if (!container || isEditing()) return;
    if (event.button !== 2) return;
    if (shouldAllowNativeContextMenu(event)) {
        _clearRightClickSuppressTimer();
        rightClickGesture.suppressNextContextMenu = false;
        return;
    }
    const settings = getRightClickInputSettings();
    if (settings.behavior !== 'pan') return;
    _clearRightClickSuppressTimer();
    _clearLongPressTimer();
    rightClickGesture.tracking = true;
    rightClickGesture.dragging = false;
    rightClickGesture.startX = event.clientX;
    rightClickGesture.startY = event.clientY;
    rightClickGesture.suppressNextContextMenu = false;
    rightClickGesture.menuOpenedByLongPress = false;
    rightClickGesture.longPressSnapshot = {
        clientX: event.clientX,
        clientY: event.clientY,
        ctrlKey: Boolean(event.ctrlKey),
        metaKey: Boolean(event.metaKey),
        button: 2,
    };
    container.style.cursor = 'context-menu';
    if (settings.longPressMenu) {
        rightClickGesture.longPressTimer = setTimeout(() => {
            if (!rightClickGesture.tracking || rightClickGesture.dragging) return;
            const snapshot = rightClickGesture.longPressSnapshot;
            if (!snapshot) return;
            handleContextMenu(_createSyntheticContextMenuEvent(snapshot));
            rightClickGesture.menuOpenedByLongPress = true;
            rightClickGesture.suppressNextContextMenu = true;
            _clearRightClickSuppressTimer();
            rightClickGesture.suppressTimer = setTimeout(() => {
                rightClickGesture.suppressNextContextMenu = false;
                rightClickGesture.suppressTimer = null;
            }, 400);
        }, settings.longPressMs);
    }
}
/**
 * @param {MouseEvent} event
 */
function handlePointerMove( event: any) {
    if (!rightClickGesture.tracking) return;
    if ((event.buttons & 2) !== 2) return;
    const settings = getRightClickInputSettings();
    if (settings.behavior !== 'pan') return;
    if (rightClickGesture.dragging) return;
    const shouldStartPan = shouldStartRightDragPan({
        start: { x: rightClickGesture.startX, y: rightClickGesture.startY },
        current: { x: event.clientX, y: event.clientY },
        thresholdPx: settings.thresholdPx,
    });
    if (!shouldStartPan) return;
    rightClickGesture.dragging = true;
    rightClickGesture.suppressNextContextMenu = true;
    _clearLongPressTimer();
    if (!container) return;
    container.style.cursor = 'grabbing';
    hideMenu();
    if (settings.showGhostMarker) {
        _ensurePanGhostMarker(rightClickGesture.startX, rightClickGesture.startY);
    }
    _maybeShowFirstPanTooltip();
}
const FIRST_PAN_FLAG_KEY = 'ecbyts.onboarding.rightClickPanShown';
function _maybeShowFirstPanTooltip() {
    try {
        if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
        if (window.localStorage.getItem(FIRST_PAN_FLAG_KEY) === '1') return;
        window.localStorage.setItem(FIRST_PAN_FLAG_KEY, '1');
        // Lazy import evita circular dep toast/canvasContextMenu em tempo de boot
        import('../ui/toast.js' as string)
            .then(({ showToast }: any) => {
                const msg =
                    t('rightClickPanFirstUseToast') ||
                    'Tip: right-click + drag pans the camera. Static click opens the menu. Ctrl+right-click shows the browser menu.';
                showToast(msg, 'info', 6000);
            })
            .catch((_e: any) => console.debug('[canvasContextMenu:silent-catch]', errorMessage(_e)));
    } catch (e: any) {
        console.debug('[canvasContextMenu] firstPanFlag:', errorMessage(e));
        /* ignore storage errors */
    }
}
/**
 * @param {MouseEvent} event
 */
function handlePointerUp( event: any) {
    if (!rightClickGesture.tracking) return;
    if (event.button !== 2) return;
    const didDrag = rightClickGesture.dragging;
    const didOpenLongPressMenu = rightClickGesture.menuOpenedByLongPress;
    rightClickGesture.tracking = false;
    rightClickGesture.dragging = false;
    rightClickGesture.longPressSnapshot = null;
    _clearLongPressTimer();
    if (container) container.style.cursor = '';
    _removePanGhostMarker();
    if (didOpenLongPressMenu) {
        rightClickGesture.suppressNextContextMenu = true;
        _clearRightClickSuppressTimer();
        rightClickGesture.suppressTimer = setTimeout(() => {
            rightClickGesture.suppressNextContextMenu = false;
            rightClickGesture.suppressTimer = null;
        }, 400);
        return;
    }
    if (!didDrag) {
        rightClickGesture.suppressNextContextMenu = false;
        _clearRightClickSuppressTimer();
        return;
    }
    rightClickGesture.suppressNextContextMenu = true;
    _clearRightClickSuppressTimer();
    rightClickGesture.suppressTimer = setTimeout(() => {
        rightClickGesture.suppressNextContextMenu = false;
        rightClickGesture.suppressTimer = null;
    }, 300);
}
/**
 * Testa se o clique atinge algum elemento 3D.
 * Retorna { point, elementId } se atingiu, ou null.
 * @param {MouseEvent|MenuPointerEvent} event
 * @returns {HitTestResult|null}
 */
function hitTest( event: any) {
    const camera = getCamera();
    const renderer = getRenderer();
    const elementsGroup = getElementsGroup();
    if (!camera || !renderer || !elementsGroup) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    _getMouse().x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _getMouse().y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _getRaycaster().setFromCamera(_getMouse(), camera);
    const intersects = _getRaycaster().intersectObjects(elementsGroup.children, true);
    if (intersects.length === 0) return null;
    const hit = intersects[0];
    let elementId: any = null;
    let obj = hit.object;
    while (obj) {
        if (obj.userData?.id) {
            elementId = obj.userData.id;
            break;
        }
        obj = obj.parent;
    }
    return { point: { x: hit.point.x, y: hit.point.y, z: hit.point.z }, elementId };
}
/**
 * Projeta o cursor sobre o plano Y=0 (solo) quando não há hit em geometria.
 * @param {MouseEvent|MenuPointerEvent} event
 * @returns {{x:number, y:number, z:number}}
 */
function _projectCursorToGround( event: any) {
    const camera = getCamera();
    const renderer = getRenderer();
    if (!camera || !renderer) return { x: 0, y: 0, z: 0 };
    const rect = renderer.domElement.getBoundingClientRect();
    _getMouse().x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _getMouse().y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    _getRaycaster().setFromCamera(_getMouse(), camera);
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const target = new THREE.Vector3();
    _getRaycaster().ray.intersectPlane(ground, target);
    return { x: target.x, y: 0, z: target.z };
}
/**
 * Clique em item do menu principal.
 */
/**
 * @param {MouseEvent} event
 */
function handleMenuClick( event: any) {
    const item = /*as:HTMLElement|null*/ event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!item || item.classList.contains('disabled')) return;
    const action = item.dataset.action || '';
    // Add Element abre submenu de famílias
    if (action === 'add-element') {
        showFamilySubmenu(item);
        return;
    }
    // Service menu abre submenu de tipos de serviço
    if (action === 'service-menu') {
        showServiceSubmenu(item);
        return;
    }
    // HUDs submenu (Item 9.61)
    if (action === 'hud-menu') {
        showHudSubmenu(item);
        return;
    }
    executeAction(action);
    hideMenu();
}
/**
 * Clique em item do submenu (famílias ou tipos de serviço).
 */
/**
 * @param {MouseEvent} event
 */
function handleSubmenuClick( event: any) {
    const item = /*as:HTMLElement|null*/ event.target instanceof Element ? event.target.closest('[data-action]') : null;
    if (!item) return;
    if (item.classList.contains('disabled')) return;
    const action = item.dataset.action || '';
    if (action.startsWith('add:')) {
        const familyId = action.slice(4);
        appWindow().handleAddElement?.(familyId);
        hideMenu();
        return;
    }
    if (action.startsWith('service:')) {
        const serviceType = action.slice(8);
        appWindow().handleCreateServiceRequest?.({
            serviceType,
            position: _lastMenuPos,
            elementId: _lastMenuElementId,
        });
        hideMenu();
        return;
    }
    if (action.startsWith('hud-toggle:')) {
        // Item 9.61: HUD toggles do NOT close the menu - user often
        // wants to flip multiple in one session.
        _onHudToggle(action);
        // Re-render submenu to reflect new state
        const trigger = menuEl?.querySelector('[data-action="hud-menu"]') || null;
        if (trigger) showHudSubmenu(trigger);
        return;
    }
    hideMenu();
}
/**
 * Fechar menus ao clicar fora.
 */
/**
 * @param {MouseEvent} event
 */
function handleOutsideClick( event: any) {
    if (!menuEl?.classList.contains('visible')) return;
    const targetNode = event.target instanceof Node ? event.target : null;
    if (menuEl.contains(targetNode)) return;
    if (submenuEl?.contains(targetNode)) return;
    hideMenu();
}
/**
 * Fechar com Escape.
 */
/**
 * @param {KeyboardEvent} event
 */
function handleEscapeKey( event: any) {
    if (event.key === 'Escape' && menuEl?.classList.contains('visible')) {
        hideMenu();
    }
}
// ----------------------------------------------------------------
// MENU BUILDER
// ----------------------------------------------------------------
/**
 * Constroi o HTML do menu principal.
 */
function buildMenu() {
    if (!menuEl) return;
    const items = [];
    // H-012 (HUD Audit 2026-06-05, claude - ui): substitui separators
    // an\u00F4nimos por section headers sem\u00E2nticos. Antes o menu tinha 14
    // itens misturando edit/view/tools/help separados s\u00F3 por linha
    // t\u00EAnue \u2014 usu\u00E1rio leigo precisava ler todos para entender hierarquia.
    // Agora cada grupo tem r\u00F3tulo curto (Editar, Visualizar, etc) em
    // small-caps cinza. Nielsen H4 Consistency + WCAG 1.3.1 Info & Relationships.
    // Edit
    items.push(sectionHeader(_tr('context_menu.section_edit', 'Editar')));
    items.push(menuItem('add-element', 'plus', t('addElement'), '', true));
    const canPaste = hasClipboard();
    items.push(menuItem('paste', 'clipboard', t('paste'), 'Ctrl+V', false, !canPaste));
    // View presets
    items.push(sectionHeader(_tr('context_menu.section_view', 'Visualizar')));
    items.push(menuItem('fit-all', 'maximize', t('fitAll') || 'Fit All'));
    items.push(menuItem('isometric', 'box', t('isometric') || 'Isometric'));
    items.push(menuItem('top-view', 'arrow-down', t('topView') || 'Top'));
    items.push(menuItem('front-view', 'arrow-right', t('frontView') || 'Front'));
    items.push(menuItem('reset-view', 'rotate-ccw', t('resetView')));
    // HUDs toggle section (Item 9.61) - only visible when no element was hit.
    const appEl = document.getElementById('app');
    const inSpatialView =
        !appEl ||
        (!appEl.classList.contains('view-group-actions') && !appEl.classList.contains('view-group-datastudio'));
    if (!_lastMenuElementId && inSpatialView) {
        items.push(sectionHeader(_tr('context_menu.section_huds', 'HUDs')));
        items.push(menuItem('hud-menu', 'sliders', t('context_menu.toggle_huds') || 'Toggle HUDs \u25B6', '', true));
        items.push(
            menuItem('screenshot-mode', 'camera', t('context_menu.screenshot_mode') || 'Screenshot mode (hide HUDs)'),
        );
    }
    // Tools / Issue / Service Request
    items.push(sectionHeader(_tr('context_menu.section_tools', 'Ferramentas')));
    items.push(menuItem('create-issue', 'alert-circle', t('context_menu.create_issue') || 'Create Issue Here'));
    items.push(
        menuItem('service-menu', 'tool', t('context_menu.request_service') || 'Request Service \u25B6', '', true),
    );
    items.push(menuItem('random', 'shuffle', t('generateRandom') || 'Random Model'));
    // Help & feedback
    items.push(sectionHeader(_tr('context_menu.section_help', 'Ajuda')));
    items.push(menuItem('docs-help', 'book-open', getDocsHelpLabel()));
    items.push(menuItem('report-bug', 'alert-circle', t('reportBug.menuItem') || 'Reportar Bug'));
    menuEl.innerHTML = items.join('');
}
/**
 * Cria HTML de um item do menu.
 * @param {string} action
 * @param {string} icon
 * @param {string} label
 * @param {string} [shortcut]
 * @param {boolean} [hasSubmenu]
 * @param {boolean} [disabled]
 * @returns {string}
 */
function menuItem( action: any, icon: any, label: any, shortcut: any = '', hasSubmenu: any = false, disabled: any = false) {
    const iconHtml = getIcon(icon, { size: '14px' });
    let rightHtml = '';
    if (hasSubmenu) {
        rightHtml = `<span class="panel-context-menu-shortcut">${getIcon('chevron-right', { size: '12px' })}</span>`;
    } else if (shortcut) {
        rightHtml = `<span class="panel-context-menu-shortcut">${shortcut}</span>`;
    }
    const cls = disabled ? ' disabled' : '';
    return `<button class="panel-context-menu-item${cls}" data-action="${action}">
        ${iconHtml}
        <span>${label}</span>
        ${rightHtml}
    </button>`;
}
/**
 * H-012 (HUD Audit 2026-06-05, claude - ui): cria header de seção
 * semântico para agrupar itens do menu visual. Substitui separators
 * anônimos por rótulos curtos em small-caps (Editar/Visualizar/etc).
 * @param {string} label - texto curto da seção
 */
function sectionHeader( label: any) {
    const safe = String(label || '').trim();
    if (!safe) return '';
    return `<div class="panel-context-menu-header" role="presentation">${safe}</div>`;
}
/**
 * H-012 fix-2 (HUD Audit 2026-06-06, claude - ui): tradutor com fallback
 * robusto. Quando t(key) retorna a chave bruta (não traduzida), usa
 * fallback. Sem este helper, o padrão `t(key) || fallback` falha porque
 * a chave bruta é truthy. Mesmo bug do FINDING-013 / H-013 anterior
 * (auth.loginRequired). Calvin diretiva: chave nunca aparece literal
 * em UI pixel-real (Nielsen H4 + WCAG 3.1.1).
 */
function _tr(key: string, fallback: string): string {
    try {
        const v = t(key);
        return v && v !== key ? v : fallback;
    } catch (e: any) {
        console.debug('[canvasContextMenu:_tr]', e?.message || e);
        return fallback;
    }
}
// ----------------------------------------------------------------
// FAMILY SUBMENU
// ----------------------------------------------------------------
/**
 * Mostra submenu de familias ao lado do item "Add Element".
 * @param {HTMLElement} triggerItem
 */
function showFamilySubmenu( triggerItem: any) {
    if (!submenuEl) return;
    const submenu = submenuEl;
    const families = getEnabledFamilies();
    let html = '';
    for (const f of families) {
        const iconHtml = getIcon(f.icon || 'circle', { size: '14px' });
        const name = getFamilyName(f);
        html += `<button class="panel-context-menu-item" data-action="add:${f.id}">
            ${iconHtml}
            <span>${name}</span>
        </button>`;
    }
    submenu.innerHTML = html;
    // Posiciona ao lado direito do item trigger
    const triggerRect = triggerItem.getBoundingClientRect();
    submenu.style.left = `${triggerRect.right + 2}px`;
    submenu.style.top = `${triggerRect.top}px`;
    submenu.classList.add('visible');
    // Ajusta se sair da viewport
    requestAnimationFrame(() => {
        const rect = submenu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw) {
            // Mostra do lado esquerdo do trigger
            submenu.style.left = `${triggerRect.left - rect.width - 2}px`;
        }
        if (rect.bottom > vh) {
            submenu.style.top = `${Math.max(0, vh - rect.height - 8)}px`;
        }
    });
}
// ----------------------------------------------------------------
// SERVICE SUBMENU
// ----------------------------------------------------------------
/**
 * Mostra submenu de tipos de serviço ao lado do item "Request Service".
 * @param {HTMLElement} triggerItem
 */
async function showServiceSubmenu( triggerItem: any) {
    if (!submenuEl) return;
    const submenu = submenuEl;
    // Import dinâmico para evitar dependência circular no load
    let SERVICE_TYPES = {};
    try {
        const mod = await import('../../core/issues/manager.js' as string);
        SERVICE_TYPES = mod.SERVICE_TYPES || {};
    } catch (e: any) {
        console.debug('[canvasContextMenu] importIssues:', errorMessage(e));
    }
    let html = '';
    for (const [key, label] of Object.entries(SERVICE_TYPES)) {
        html += `<button class="panel-context-menu-item" data-action="service:${key}">
            <span>${escapeHtml(label)}</span>
        </button>`;
    }
    if (!html) {
        html = `<button class="panel-context-menu-item disabled">No services available</button>`;
    }
    submenu.innerHTML = html;
    // Posiciona ao lado direito do item trigger
    const triggerRect = triggerItem.getBoundingClientRect();
    submenu.style.left = `${triggerRect.right + 2}px`;
    submenu.style.top = `${triggerRect.top}px`;
    submenu.classList.add('visible');
    requestAnimationFrame(() => {
        const rect = submenu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw) {
            submenu.style.left = `${triggerRect.left - rect.width - 2}px`;
        }
        if (rect.bottom > vh) {
            submenu.style.top = `${Math.max(0, vh - rect.height - 8)}px`;
        }
    });
}
// ----------------------------------------------------------------
// SHOW / HIDE
// ----------------------------------------------------------------
/**
 * Posiciona e mostra o menu principal.
 */
/**
 * @param {number} x
 * @param {number} y
 */
function showMenu( x: any, y: any) {
    if (!menuEl) return;
    const menu = menuEl;
    // Esconde submenu anterior
    hideSubmenu();
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('visible');
    // WAI-ARIA menu pattern (D2b)
    applyMenuA11y(menu, { label: t('canvasMenu.label') || 'Canvas actions' });
    // Clamp ao viewport via helper D2 (pad=0 mantém comportamento legado de encostar)
    requestAnimationFrame(() => {
        clampMenuToViewport(menu, x, y, 0);
    });
}
/**
 * Esconde ambos os menus.
 */
function hideMenu() {
    menuEl?.classList.remove('visible');
    hideSubmenu();
}
/**
 * Esconde apenas o submenu.
 */
function hideSubmenu() {
    submenuEl?.classList.remove('visible');
}
// ----------------------------------------------------------------
// ACTION EXECUTION
// ----------------------------------------------------------------
/**
 * Executa a acao selecionada.
 * @param {string} action
 */
function executeAction( action: any) {
    switch (action) {
        case 'paste':
            appWindow().handlePasteElement?.();
            break;
        case 'fit-all':
            appWindow().fitAllElements?.();
            break;
        case 'isometric':
            appWindow().setIsometricView?.();
            break;
        case 'top-view':
            appWindow().setTopView?.();
            break;
        case 'front-view':
            appWindow().setFrontView?.();
            break;
        case 'reset-view':
            appWindow().resetView?.();
            break;
        case 'random':
            appWindow().generateRandomModel?.();
            break;
        case 'create-issue':
            appWindow().handleCreateIssueAtPosition?.(_lastMenuPos, _lastMenuElementId);
            break;
        case 'docs-help':
            openDocsHelp('scene-3d');
            break;
        case 'report-bug':
            appWindow().handleReportBug?.();
            break;
        case 'screenshot-mode':
            // Item 9.61: enter screenshot mode (hide all unlocked HUDs)
            if (typeof appWindow().handleEnterScreenshotMode === 'function') {
                appWindow().handleEnterScreenshotMode();
            }
            break;
    }
}
// ----------------------------------------------------------------
// HUD SUBMENU (Item 9.61 - toggle individual HUDs)
// ----------------------------------------------------------------
/** @type {HudStateContext|null} */
let _hudState: any = null; // lazy-loaded from hudContextMenuState
async function _ensureHudState() {
    if (_hudState) return _hudState;
    try {
        const mod = await import('../../core/hud/hudContextMenuState.js' as string);
        // Try to restore persisted state from localStorage
        const serialized = safeJsonParse<any>(localStorage.getItem('ecbyts.hud.state'), null, 'canvasContextMenu-hudState');
        const initial = serialized ? mod.deserializeState(serialized) : mod.createInitialState();
        _hudState = { mod, state: initial };
        return _hudState;
    } catch (err: any) {
        console.warn('[canvasContextMenu] hudContextMenuState load failed:', errorMessage(err));
        return null;
    }
}
function _persistHudState() {
    if (!_hudState) return;
    try {
        const ser = _hudState.mod.serializeState(_hudState.state);
        localStorage.setItem('ecbyts.hud.state', JSON.stringify(ser));
    } catch (e: any) {
        console.debug('[canvasContextMenu] hudStatePersist:', errorMessage(e));
        /* storage full or unavailable */
    }
}
/**
 * @param {HTMLElement} triggerItem
 */
async function showHudSubmenu( triggerItem: any) {
    const ctx = await _ensureHudState();
    if (!ctx || !submenuEl) return;
    const submenu = submenuEl;
    const { mod, state } = ctx;
    const ids = mod.HUD_IDS;
    const items = ids.map((id: any) => {
        const cat = mod.HUD_CATEGORIES[id];
        const visible = state[id];
        const lockedSuffix = cat.locked ? ' &#128274;' : '';
        // Differentiate visible vs hidden with explicit marker instead
        // of whitespace-only padding (fix #16 - checkmark invisível).
        const marker = visible ? '&#10003; ' : '&#9675; ';
        const cls = (cat.locked ? ' disabled' : '') + (visible ? '' : ' hud-item-hidden');
        return `<button class="panel-context-menu-item${cls}" data-action="hud-toggle:${id}">
            ${getIcon(visible ? 'eye' : 'eye-off', { size: '14px' })}
            <span>${marker}${escapeHtml(cat.label)}${lockedSuffix}</span>
        </button>`;
    });
    // Stats footer
    const counts = mod.countVisible(state);
    items.push(`<div class="panel-context-menu-item disabled">
        <span style="opacity:0.6;font-size:11px;">${counts.visible}/${counts.total} visible</span>
    </div>`);
    submenu.innerHTML = items.join('');
    // Position next to trigger (mirrors showFamilySubmenu logic)
    const triggerRect = triggerItem.getBoundingClientRect();
    submenu.style.left = `${triggerRect.right + 2}px`;
    submenu.style.top = `${triggerRect.top}px`;
    submenu.classList.add('visible');
    requestAnimationFrame(() => {
        const rect = submenu.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (rect.right > vw) {
            submenu.style.left = `${triggerRect.left - rect.width - 2}px`;
        }
        if (rect.bottom > vh) {
            submenu.style.top = `${Math.max(0, vh - rect.height - 8)}px`;
        }
    });
}
/**
 * @param {string} action
 */
function _onHudToggle( action: any) {
    if (!_hudState) return;
    const id = action.slice('hud-toggle:'.length);
    const result = _hudState.mod.toggleHud(_hudState.state, id);
    if (!result.changed) return;
    _hudState.state = result.state;
    _persistHudState();
    // Apply to DOM: dispatch a custom event so HUD components self-update
    try {
        document.dispatchEvent(
            new CustomEvent('ecbyts:hud-visibility-changed', { detail: { id, visible: result.state[id] } }),
        );
    } catch (e: any) {
        console.debug('[canvasContextMenu] hudVisibilityDispatch:', errorMessage(e));
        /* CustomEvent unsupported */
    }
}
