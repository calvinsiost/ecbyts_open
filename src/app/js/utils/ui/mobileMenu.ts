// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   MOBILE MENU — Navegação mobile (hamburger + drawers)
   ================================================================

   Gerencia o menu hamburger full-screen e os drawers laterais
   no modo mobile (< 768px).

   Funciona via classes CSS:
   - body.mobile: detectado via resize listener
   - #mobile-menu-overlay.open: menu visivel
   - .drawer-open: painel lateral visivel
   - #drawer-backdrop.active: overlay escuro atras do drawer

   ================================================================ */

import { handleResize } from '../scene/setup.js';
import { Z_INDEX } from './zIndex.js';

// ----------------------------------------------------------------
// MOBILE DETECTION
// ----------------------------------------------------------------

const MOBILE_BREAKPOINT = 768;
const TABLET_BREAKPOINT = 1024;

/** @returns {boolean} True se viewport é mobile */
export function isMobile(): boolean {
    return window.innerWidth < MOBILE_BREAKPOINT;
}

/** @returns {boolean} True se viewport é tablet */
export function isTablet(): boolean {
    return window.innerWidth >= MOBILE_BREAKPOINT && window.innerWidth < TABLET_BREAKPOINT;
}

/** Atualiza classes no body conforme viewport */
function updateDeviceClasses() {
    const mobile = isMobile();
    const tablet = isTablet();

    document.body.classList.toggle('mobile', mobile);
    document.body.classList.toggle('tablet', tablet);

    // Se saiu do mobile, fechar drawers e menu
    if (!mobile) {
        closeAllDrawers();
        closeMobileMenu();
    }
}

// ----------------------------------------------------------------
// MOBILE MENU (HAMBURGER)
// ----------------------------------------------------------------

/** Toggle do menu hamburger overlay */
export function toggleMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    if (!overlay) return;

    const isOpen = overlay.classList.contains('open');
    if (isOpen) {
        closeMobileMenu();
    } else {
        closeAllDrawers();
        overlay.classList.add('open');
    }
}

/** Fecha o menu hamburger */
export function closeMobileMenu() {
    const overlay = document.getElementById('mobile-menu-overlay');
    if (overlay) overlay.classList.remove('open');
}

/**
 * Seleciona uma tab do ribbon pelo menu mobile.
 * Chama switchRibbonTab() global e fecha o menu.
 * @param {string} tabId
 */
export function selectMobileMenuTab(tabId: any) {
    if (tabId === 'credits') {
        closeMobileMenu();
        if (typeof (window as any).handleOpenCreditsHub === 'function') {
            (window as any).handleOpenCreditsHub({ source: 'mobile-menu' });
        }
        return;
    }

    // Chamar o handler global do ribbon
    if (typeof (window as any).switchRibbonTab === 'function') {
        (window as any).switchRibbonTab(tabId);
    }

    // Mostrar toolbar temporariamente para a ação
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        toolbar.style.display = '';
        toolbar.style.position = 'fixed';
        toolbar.style.top = '48px';
        toolbar.style.left = '0';
        toolbar.style.right = '0';
        toolbar.style.zIndex = String(Z_INDEX.EXCEPTION_MOBILE_TOOLBAR);
        toolbar.style.background = 'var(--window-dark)';
        toolbar.style.borderBottom = '1px solid var(--window-border)';
        toolbar.style.maxHeight = '60vh';
        toolbar.style.overflowY = 'auto';
    }

    closeMobileMenu();

    // Backdrop para fechar toolbar ao tocar fora
    const backdrop = document.getElementById('drawer-backdrop');
    if (backdrop) {
        backdrop.classList.add('active');
        backdrop.onclick = () => {
            hideFloatingToolbar();
            backdrop.classList.remove('active');
            backdrop.onclick = null;
        };
    }
}

/** Esconde a toolbar flutuante (modo mobile) */
function hideFloatingToolbar() {
    if (!isMobile()) return;
    const toolbar = document.getElementById('toolbar');
    if (toolbar) {
        toolbar.style.display = 'none';
        toolbar.style.removeProperty('position');
        toolbar.style.removeProperty('top');
        toolbar.style.removeProperty('left');
        toolbar.style.removeProperty('right');
        toolbar.style.removeProperty('z-index');
        toolbar.style.removeProperty('background');
        toolbar.style.removeProperty('border-bottom');
        toolbar.style.removeProperty('max-height');
        toolbar.style.removeProperty('overflow-y');
    }
}

// ----------------------------------------------------------------
// DRAWER MANAGEMENT
// ----------------------------------------------------------------

/**
 * Toggle drawer lateral (painel esquerdo ou direito).
 * @param {'left'|'right'} side
 */
export function toggleMobileDrawer(side: any) {
    const panelId = side === 'left' ? 'left-panel' : 'right-panel';
    const panel = document.getElementById(panelId);
    if (!panel) return;

    const isOpen = panel.classList.contains('drawer-open');

    // Fechar tudo primeiro
    closeAllDrawers();

    if (!isOpen) {
        // Garantir visibilidade - usar setProperty com 'important' para bater
        // qualquer regra !important de CSS (inclusive .panel-minimized { display:none !important })
        panel.classList.remove('panel-minimized');
        panel.style.setProperty('display', 'flex', 'important');
        panel.classList.add('drawer-open');
        const backdrop = document.getElementById('drawer-backdrop');
        if (backdrop) {
            backdrop.classList.add('active');
            backdrop.onclick = () => closeAllDrawers();
        }
    }
}

/** Fecha todos os drawers e backdrops */
export function closeAllDrawers() {
    for (const id of ['left-panel', 'right-panel']) {
        const p = document.getElementById(id);
        if (!p) continue;
        p.classList.remove('drawer-open');
        // Restaurar display para que panelManager retome o controle
        p.style.display = '';
    }

    const backdrop = document.getElementById('drawer-backdrop');
    if (backdrop) {
        backdrop.classList.remove('active');
        backdrop.onclick = null;
    }

    hideFloatingToolbar();
}

// ----------------------------------------------------------------
// ORIENTATION CHANGE
// ----------------------------------------------------------------

function handleOrientationChange() {
    setTimeout(() => {
        updateDeviceClasses();
        const container = document.getElementById('canvas-container');
        if (container) handleResize(container);
    }, 200);
}

function ensureCreditsEntrypoints() {
    const menuTabs = document.querySelector('#mobile-menu-overlay .mobile-menu-tabs');
    if (menuTabs && !menuTabs.querySelector('[data-mobile-entry="credits"]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-menu-tab';
        btn.setAttribute('data-mobile-entry', 'credits');
        btn.setAttribute('onclick', "selectMobileMenuTab('credits')");
        btn.innerHTML = `
            <span class="icon" data-icon="award" data-icon-size="20px"></span>
            <span>Creditos</span>
        `;
        menuTabs.appendChild(btn);
    }

    const bottomNav = document.getElementById('mobile-bottom-nav');
    if (bottomNav && !document.getElementById('mobile-bottom-credits-btn')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mobile-nav-btn';
        btn.id = 'mobile-bottom-credits-btn';
        btn.setAttribute('onclick', "handleOpenCreditsHub({ source: 'bottom-nav' })");
        btn.innerHTML = `
            <span class="icon" data-icon="award" data-icon-size="22px"></span>
            <span>Creditos</span>
        `;
        bottomNav.insertBefore(btn, bottomNav.children[2] || null);
    }
}

// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------

export function initMobileMenu() {
    // Setar classes iniciais
    updateDeviceClasses();

    // Listener de resize (debounced)
    /** @type {any} */
    let resizeTimer: any;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(updateDeviceClasses, 150);
    });

    // Orientation change
    window.addEventListener('orientationchange', handleOrientationChange);

    // Registrar handlers globais
    (window as any).toggleMobileMenu = toggleMobileMenu;
    (window as any).closeMobileMenu = closeMobileMenu;
    (window as any).selectMobileMenuTab = selectMobileMenuTab;
    (window as any).toggleMobileDrawer = toggleMobileDrawer;
    (window as any).closeAllDrawers = closeAllDrawers;

    /** Forçar modo mobile/desktop para testes via API */
    (window as any).toggleMobileMode = (enable = true) => {
        document.body.classList.toggle('mobile', enable);
        document.body.classList.remove('tablet');
        if (!enable) closeAllDrawers();
    };

    ensureCreditsEntrypoints();
}
