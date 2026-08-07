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
   GLOBAL CONTEXT MENU — Fallback de botão direito para áreas sem menu
   ================================================================

   Registra listener bubble-phase em document.contextmenu.
   Só atua quando:
     - nenhum handler existente chamou e.preventDefault()
     - não há texto selecionado (preserva copy/paste nativo)
     - o modal de report bug não está aberto (evita duplo modal)

   Exibe menu mínimo com apenas "Reportar Bug" na posição do cursor.
   Reutiliza CSS .panel-context-menu do panelManager (z-index 300).

   Também exporta showMinimalMenu(e) para uso direto pelo voxelEditController.

   ================================================================ */
import { t } from '../i18n/translations.js';
import { getIcon } from './icons.js';
import { detectActiveModule, showContextualTourMenu } from '../tour/contextualTour.js';
import { detectDocsSectionFromElement, getDocsHelpLabel, openDocsHelp } from '../docs/helpRouter.js';
import { buildModuleMenuItems } from '../handlers/moduleContextMenu.js';
import { clampMenuToViewport, installCloseListeners, applyMenuA11y } from './contextMenuHelpers.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
/** @type {any} */
let _menuEl: any = null;
let _closeCtrl: AbortController | null = null;
// ----------------------------------------------------------------
// PUBLIC API
// ----------------------------------------------------------------
/**
 * Registra o listener global de contextmenu no document.
 * Chamar uma única vez durante init (main.js).
 */
export function initGlobalContextMenu() {
    document.addEventListener('contextmenu', _handleGlobal);
    // Fechar menu ao rolar (menu fixed não segue o scroll)
    document.addEventListener('scroll', _closeExisting, { capture: true, passive: true });
}
/**
 * Exibe o menu mínimo na posição do evento.
 * Uso: voxelEditController chama diretamente do _onContextMenu.
 * @param {MouseEvent} e
 */
export function showMinimalMenu(e: any) {
    if (_isReportBugModalOpen()) return;
    _buildAndShow(e.clientX, e.clientY);
}
// ----------------------------------------------------------------
// INTERNAL
// ----------------------------------------------------------------
/**
 * Handler global de contextmenu (bubble phase).
 * Só atua quando nenhum outro handler tratou o evento.
 */
function _handleGlobal(e: any) {
    // Algum handler existente já tratou (preventDefault)
    if (e.defaultPrevented) return;
    // Texto selecionado: preservar menu nativo do browser (copy/paste)
    if ((window.getSelection()?.toString().length ?? 0) > 0) return;
    // Modal de report bug aberto: não abrir um segundo
    if (_isReportBugModalOpen()) return;
    e.preventDefault();
    _buildAndShow(e.clientX, e.clientY);
}
/**
 * Verifica se o modal de report bug está visível.
 */
function _isReportBugModalOpen() {
    return !!document.querySelector('#report-bug-modal:not([hidden])');
}
/**
 * Fecha e remove o menu global se existir.
 */
function _closeExisting() {
    if (_closeCtrl) {
        _closeCtrl.abort();
        _closeCtrl = null;
    }
    if (_menuEl) {
        _menuEl.remove();
        _menuEl = null;
    }
}
/**
 * Detecta se o evento ocorreu sobre o #constellation-hud (readings panel).
 * SPEC_READINGS_PANEL_DETACH_FLOAT MH1.
 * @param {number} x - clientX
 * @param {number} y - clientY
 * @returns {{isOnHud:boolean, isFloating:boolean}}
 */
function _resolveConstellationHudContext(x: any, y: any) {
    const el = document.elementFromPoint(x, y);
    const hud = document.getElementById('constellation-hud');
    if (!hud || !el) return { isOnHud: false, isFloating: false };
    const isOnHud = el === hud || hud.contains(el);
    const isFloating = hud.classList.contains('panel-floating');
    return { isOnHud, isFloating };
}

/**
 * Resolve moduleId do ancestor mais próximo com data-module-id.
 * SPEC_MODULE_PROVENANCE_LIBRARIES_NAV MH3.
 * @param {number} x - clientX
 * @param {number} y - clientY
 * @returns {string|null}
 */
function _resolveModuleId(x: any, y: any) {
    let el = /** @type {Element|null} */ (document.elementFromPoint(x, y));
    while (el && el.nodeType === 1) {
        const id = (el).dataset?.moduleId;
        if (typeof id === 'string' && id.length > 0) return id;
        el = el.parentElement;
    }
    return null;
}

/**
 * Cria e posiciona o menu mínimo na posição (x, y).
 * @param {number} x - clientX
 * @param {number} y - clientY
 */
function _buildAndShow(x: any, y: any) {
    _closeExisting() as any;
    const label = t('reportBug.menuItem') || 'Reportar Bug';
    const iconHtml = getIcon('alert-circle', { size: '14px' });
    const docsLabel = getDocsHelpLabel();
    const docsIconHtml = getIcon('book-open', { size: '14px' });
    const tourLabel = t('contextualTour.helpTitle') || 'Tours for this module';
    const tourIconHtml = getIcon('help-circle', { size: '14px' });
    // SPEC_READINGS_PANEL_DETACH_FLOAT MH1: trigger condicional sobre #constellation-hud
    const hudCtx = _resolveConstellationHudContext(x, y);
    const detachLabel = t('panel.constellation.detach') || 'Destacar (flutuante)';
    const dockLabel = t('panel.constellation.dock') || 'Encaixar (dock)';
    const moveIconHtml = getIcon('move', { size: '14px' });
    const constellationItemHtml = hudCtx.isOnHud
        ? `<button class="panel-context-menu-item" data-action="${hudCtx.isFloating ? 'dock-constellation' : 'float-constellation'}">
        ${moveIconHtml}
        <span>${hudCtx.isFloating ? dockLabel : detachLabel}</span>
    </button>`
        : '';

    // SPEC_MODULE_PROVENANCE_LIBRARIES_NAV MH3: trigger condicional sobre [data-module-id]
    const moduleId = _resolveModuleId(x, y);
    const moduleItemsHtml = moduleId
        ? buildModuleMenuItems({ moduleId })
              .map((item: any) => {
                  const labelMap = {
                      'open-libraries': t('module.menu.openLibraries') || 'Abrir no controle de bibliotecas',
                      'show-provenance': t('module.menu.showProvenance') || 'Ver proveniência',
                  };
                  const iconKey = item.id === 'open-libraries' ? 'package' : 'shield';
                  const iconH = getIcon(iconKey, { size: '14px' });
                  const dis = item.disabled ? ' disabled aria-disabled="true"' : '';
                  return `<button class="panel-context-menu-item" data-action="${item.action}" data-module-id="${moduleId}"${dis}>
        ${iconH}
        <span>${(labelMap as any)[item.id] || item.labelKey}</span>
    </button>`;
              })
              .join('')
        : '';
    _menuEl = document.createElement('div');
    _menuEl.id = 'global-context-menu';
    _menuEl.className = 'panel-context-menu visible';
    _menuEl.innerHTML = `${moduleItemsHtml}${constellationItemHtml}<button class="panel-context-menu-item" data-action="docs-help">
        ${docsIconHtml}
        <span>${docsLabel}</span>
    </button>
    <button class="panel-context-menu-item" data-action="contextual-tour">
        ${tourIconHtml}
        <span>${tourLabel}</span>
    </button>
    <button class="panel-context-menu-item" data-action="report-bug">
        ${iconHtml}
        <span>${label}</span>
    </button>`;
    document.body.appendChild(_menuEl);
    // Clampar ao viewport - evita menu cortado nas bordas (helper D2)
    clampMenuToViewport(_menuEl, x, y);
    // WAI-ARIA menu pattern (D2b)
    applyMenuA11y(_menuEl, { label: t('contextualTour.helpTitle') || 'Context menu' });
    _menuEl.querySelector('[data-action="docs-help"]').addEventListener('click', () => {
        openDocsHelp(detectDocsSectionFromElement(document.elementFromPoint(x, y)));
        _closeExisting();
    });
    // Abrir tours contextuais ao clicar
    _menuEl.querySelector('[data-action="contextual-tour"]').addEventListener('click', () => {
        const moduleKey = detectActiveModule();
        _closeExisting();
        showContextualTourMenu(x, y, moduleKey);
    });
    // Abrir modal de bug report ao clicar
    _menuEl.querySelector('[data-action="report-bug"]').addEventListener('click', () => {
        window.handleReportBug?.();
        _closeExisting();
    });
    // SPEC_READINGS_PANEL_DETACH_FLOAT MH2/MH3 — detach/dock via window.* (panelManager exporta)
    _menuEl.querySelector('[data-action="float-constellation"]')?.addEventListener('click', () => {
        /** @type {any} */ (window).floatConstellation?.();
        _closeExisting();
    });
    _menuEl.querySelector('[data-action="dock-constellation"]')?.addEventListener('click', () => {
        /** @type {any} */ (window).dockConstellation?.();
        _closeExisting();
    });
    // SPEC_MODULE_PROVENANCE_LIBRARIES_NAV MH4/MH5 — dispatch via window.* (handlers a registrar)
    _menuEl.querySelector('[data-action="handleOpenLibrariesForModule"]')?.addEventListener('click', (ev: any) => {
        const mid = (ev.currentTarget).dataset?.moduleId;
        /** @type {any} */ (window).handleOpenLibrariesForModule?.(mid) as any;
        _closeExisting();
    });
    _menuEl.querySelector('[data-action="handleShowModuleProvenance"]')?.addEventListener('click', (ev: any) => {
        const mid = (ev.currentTarget).dataset?.moduleId;
        /** @type {any} */ (window).handleShowModuleProvenance?.(mid) as any;
        _closeExisting();
    });
    // Fechar via helper D2: outside-click + Escape com AbortController.
    // (scroll-close já registrado permanentemente em initGlobalContextMenu.)
    _closeCtrl = installCloseListeners(_menuEl, _closeExisting);
}
