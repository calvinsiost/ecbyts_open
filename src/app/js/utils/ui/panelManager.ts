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
   PANEL MANAGER — Dockable & Minimizable Panels
   ================================================================

   Gerencia paineis dockaveis com suporte a:
   - Dock em qualquer lado (left/right)
   - Minimizar com tab clicavel na borda
   - Arrastar header para floating
   - Redimensionar via drag handle
   - Persistir layout no localStorage

   PAINEIS REGISTRADOS:
   - families: Lista de familias de elementos (dock left)
   - properties: Propriedades e abas (dock right)

   ESTADOS DE PAINEL:
   - docked: fixado em um lado (left/right)
   - minimized: colapsado com tab visivel na borda
   - floating: janela flutuante arrastavel

   ================================================================ */
import { handleResize } from '../scene/setup.js';
import { CONFIG } from '../../config.js';
import { getIcon } from './icons.js';
import { activateTabById } from './tabs.js';
import { t } from '../i18n/translations.js';
import { Z_INDEX } from './zIndex.js';
import { addFloatingResizeHandles } from './resizeHandles.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import {
    // eslint-disable-next-line
    DEFAULT_TAB_POSITIONS,
    normalizeTabPositions,
    isLegacyRightHeavyLayout,
    resolveGridTemplateRows,
    resolveConstellationMaxHeight,
    clampConstellationHeight,
    clampLeftPanelWidth,
    clampRightPanelWidth,
    resolveNextConstellationPresetHeight,
} from './_panelManagerPure.js';
import { getDocsHelpLabel, getDocsSectionForPanelContext, openDocsHelp } from '../docs/helpRouter.js';
import { applyMenuA11y } from './contextMenuHelpers.js';
import { armBootOverlayFailsafe } from './bootOverlayFailsafe.js';
type AnyRecord = Record<string, any>;
const _document: any = document;
const _window: any = window;
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
const panels: any = new Map<string, any>();
/**
 * @typedef {Object} PanelState
 * @property {string} id
 * @property {string} title
 * @property {HTMLElement} el - O elemento DOM do painel
 * @property {'docked'|'minimized'|'floating'} state
 * @property {'left'|'right'} dock - Lado atual
 * @property {number} size - Largura em pixels
 * @property {number} minSize
 * @property {number} maxSize
 * @property {Function|null} [_cleanupResize]
 */
let analyticsFullscreen = false;
let _initialized = false;
let _analyticsEscBound = false;
let _analyticsTabChangedBound = false;
let _toolbarShortcutBound = false;
// Cleanup function para resize handles da constellation flutuante
/** @type {Function|null} */
let _constellationResizeCleanup: any = null;
// Containers para tabs minimizados (criados no init)
/** @type {HTMLElement|null} */
let minTabsLeft: any = null;
/** @type {HTMLElement|null} */
let minTabsRight: any = null;
/** @type {HTMLElement|null} */
let minTabsBottom: any = null;
// ARCH-MONOLITH-ATOMIZATION-001#22: RAF-batch para recálculo de canvas 3D.
// Múltiplas mutações de layout de painel (resize constellation, dock/float,
// mudança de grid) disparam requestAnimationFrame(() => handleResize(c))
// independentemente — cada um agenda seu próprio frame, causando jank quando
// 2+ mutações ocorrem no mesmo tick (ex: drag constellation + window resize).
// _scheduleCanvasResize() debunica todas as chamadas num único frame.
let _canvasResizeRafId: number = 0;
/**
 * Agenda uma única chamada a handleResize(canvas-container) no próximo frame.
 * Se já há uma chamada pendente, é no-op (idempotente). Múltiplas mutações de
 * layout dentro do mesmo tick do event loop resultam em exatamente 1 recálculo
 * de canvas, eliminando o jank de N frames de reflow sobrepostos.
 */
function _scheduleCanvasResize(): void {
    if (_canvasResizeRafId) return; // já agendado
    _canvasResizeRafId = _window.requestAnimationFrame(() => {
        _canvasResizeRafId = 0;
        const c = _document.getElementById('canvas-container');
        if (c) handleResize(c);
    });
}
// ----------------------------------------------------------------
// INITIALIZATION
// ----------------------------------------------------------------
/**
 * Initialize the panel manager.
 * Registra paineis, cria tabs containers, carrega layout salvo.
 */
export function initPanelManager() {
    if (_initialized) return;
    _initialized = true;
    // Criar containers para tabs minimizados
    createMinTabContainers();
    // Registrar paineis existentes
    registerPanel({
        id: 'families',
        title: t('panelElementFamilies'),
        elId: 'left-panel',
        dock: 'left',
        size: 300,
        minSize: 220,
        maxSize: 900,
    });
    registerPanel({
        id: 'properties',
        title: t('panelProperties'),
        elId: 'right-panel',
        dock: 'right',
        size: 280,
        minSize: 220,
        maxSize: 900,
    });
    // Setup resize handles
    setupResizeHandles();
    // Injetar botoes nos headers dos paineis
    injectPanelHeaders();
    // Injetar controles em toolbar e constellation
    injectBarControls();
    // Aplicar layout de tabs (posicoes padrao ou salvas)
    applyTabLayout();
    applyRailTabTitles();
    // Criar menu de contexto para tabs
    createContextMenu();
    // Carregar layout salvo (panel states)
    const _hadSavedLayout = loadLayout();
    // Registrar handlers globais
    _window.toggleLeftPanel = () => togglePanel('families');
    _window.toggleRightPanel = () => togglePanel('properties');
    _window.toggleAnalyticsFullscreen = toggleAnalyticsFullscreen;
    _window.exitAnalyticsFullscreen = () => {
        if (analyticsFullscreen) toggleAnalyticsFullscreen();
    };
    _window.dockPanel = dockPanel;
    _window.minimizePanel = minimizePanel;
    _window.restorePanel = restorePanel;
    _window.floatPanel = floatPanel;
    _window.moveTab = moveTab;
    // Toggle toolbar, statusbar e constellation
    _window.toggleToolbar = toggleToolbar;
    _window.toggleStatusbar = toggleStatusbar;
    _window.toggleConstellation = toggleConstellation;
    _window.floatToolbar = floatToolbar;
    _window.dockToolbar = dockToolbar;
    _window.floatConstellation = floatConstellation;
    _window.dockConstellation = dockConstellation;
    _window.restoreConstellation = _restoreConstellation;
    // Recovery handler: força reset do constellation HUD (Integration panel)
    // para estado expandido + altura default. Bug 2026-05-14: usuário relatou
    // "Painel de Integration não está aparecendo" quando o HUD ficou colapsado
    // sem caminho de descoberta para expandir.
    _window.handleResetConstellationLayout = handleResetConstellationLayout;
    // Carregar estado salvo de toolbar/statusbar
    const _hadSavedBars = loadBarsState();
    // Paineis iniciam recolhidos apenas se não há layout salvo
    if (!_hadSavedLayout) {
        minimizePanel('families');
        minimizePanel('properties');
    }
    // Toolbar: recolher na primeira abertura (sem estado salvo)
    if (!_hadSavedBars) {
        toolbarVisible = false;
        const toolbar = _document.getElementById('toolbar');
        if (toolbar) toolbar.classList.add('ribbon-collapsed');
        const toggleBtn = _document.getElementById('ribbon-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.add('collapsed');
            toggleBtn.title = t('panelManager.expandRibbon');
        }
        _document.documentElement.style.setProperty('--chrome-top', '40px');
        rebuildGridRows();
    }
    // Constellation HUD (Integration panel): respeitar estado salvo do usuário.
    // BUG 2026-05-14: lógica anterior auto-colapsava o HUD para 28px em qualquer
    // sessão sem estado salvo (incl. primeira visita), fazendo o painel
    // Integration parecer ausente. Agora: default = expandido a 120px, e
    // colapsado APENAS se o usuário explicitamente salvou esse estado.
    const hud = _document.getElementById('constellation-hud');
    if (hud) {
        const mainArea = _document.getElementById('main-area');
        const _collapsedFlag = (localStorage.getItem('ecbyts-constellation-collapsed') || '') === '1';
        const _savedH = localStorage.getItem('ecbyts-constellation-height') || '';
        if (_collapsedFlag) {
            // Usuário explicitamente colapsou em sessão anterior — respeitar.
            if (!hud.classList.contains('constellation-collapsed')) {
                hud.classList.add('constellation-collapsed');
            }
            if (mainArea) mainArea.style.setProperty('--bottom-panel-height', '28px');
        } else {
            // Default: expandido. Garante que a classe colapsada não esteja
            // pendurada e que a altura tenha um valor não-zero.
            hud.classList.remove('constellation-collapsed');
            if (mainArea) {
                const parsed = parseInt(_savedH, 10);
                const heightPx = isFinite(parsed) && parsed >= 80 ? parsed : 120;
                mainArea.style.setProperty('--bottom-panel-height', heightPx + 'px');
            }
        }
        // Defensive check: se por qualquer motivo (CSS regression, custom property
        // herdada de outro contexto) a altura resolver para 0px e o usuário NÃO
        // pediu colapso, força default 120px. Roda no próximo frame para que o
        // computed style esteja disponível.
        if (!_collapsedFlag) {
            _window.requestAnimationFrame(() => {
                try {
                    const resolved = _window.getComputedStyle(hud).height;
                    const px = parseFloat(resolved);
                    if (!isFinite(px) || px < 28) {
                        if (mainArea) mainArea.style.setProperty('--bottom-panel-height', '120px');
                        console.debug('[panelManager] constellation height recovered: ' + resolved + ' → 120px');
                    }
                } catch (e: any) {
                    console.debug('[panelManager] constellation height check:', e?.message || e);
                }
            });
        }
    }
    // Ticker bar: atualiza grid quando visibilidade muda
    _window.addEventListener('tickerChanged', () => rebuildGridRows());
    _window.addEventListener('languageChanged', () => {
        // Limpa o label cacheado para reler o textContent já traduzido pelo i18n
        _document.querySelectorAll('#left-panel .tab[data-tab], #right-panel .tab[data-tab]').forEach((tab: any) => {
            delete tab.dataset.railLabel;
        });
        applyRailTabTitles();
    });
    // Escape hatch: Esc always exits analytics fullscreen.
    if (!_analyticsEscBound) {
        _document.addEventListener('keydown', (e: any) => {
            if (e.key === 'Escape' && analyticsFullscreen) {
                toggleAnalyticsFullscreen();
            }
        });
        _analyticsEscBound = true;
    }
    // Safety: if user changes to another tab, disable analytics fullscreen.
    if (!_analyticsTabChangedBound) {
        _window.addEventListener('tabChanged', (e: any) => {
            const tabId = e?.detail?.tab;
            if (analyticsFullscreen && tabId && tabId !== 'analytics') {
                toggleAnalyticsFullscreen();
            }
        });
        _analyticsTabChangedBound = true;
    }
    // Auto-mostrar toolbar quando usuario clica no menu
    // Garante acesso ao ribbon mesmo quando colapsado
    _document.getElementById('menubar')?.addEventListener('click', (e: any) => {
        if (e.target.closest('.menu-item')) ensureToolbarVisible();
    });
    // Double-click no menubar (fora de tabs/botoes) toggle o ribbon
    _document.getElementById('menubar')?.addEventListener('dblclick', (e: any) => {
        if (!e.target.closest('.menu-item') && !e.target.closest('.ribbon-toggle-btn')) {
            toggleToolbar();
        }
    });
    // Ctrl+F1 - atalho para colapsar/expandir o ribbon
    if (!_toolbarShortcutBound) {
        _document.addEventListener('keydown', (e: any) => {
            if (e.key === 'F1' && e.ctrlKey) {
                e.preventDefault();
                toggleToolbar();
            }
        });
        _toolbarShortcutBound = true;
    }
    // Scroll arrows para tabs bars com overflow (mesmo pattern do ribbon)
    injectTabsScrollArrows();
    // Expor updateRibbonToggleState para outros modulos (evita deps circulares)
    _window._updateRibbonToggleState = updateRibbonToggleState;
    // Reposicionar paineis flutuantes quando janela encolhe
    _window.addEventListener('resize', _clampFloatingPanels);
    // Toggle do painel de chat IA - usa toggleAIWidget (FAB ↔ chat panel)
    _window.toggleLLMChatPanel = () => {
        if (_window.toggleAIWidget) _window.toggleAIWidget();
        else {
            const chatPanel = _document.getElementById('llm-chat-panel');
            if (chatPanel?.classList.contains('open')) {
                if (_window.closeLLMChat) _window.closeLLMChat();
            } else {
                if (_window.openLLMChat) _window.openLLMChat();
            }
        }
        updateRibbonToggleState();
    };
    // BOOT-RESILIENCE-001#menu-inalcancavel-offline: com o shell de UI de pe, o
    // splash de boot TEM que ter saida. Se uma fase posterior morrer (offline/
    // CDN bloqueado), _finishLoadingOverlay nunca roda E o `finally` de init()
    // ja limpou o bootWatchdog de 45s — o #loading-overlay ficaria no DOM para
    // sempre, deixando ribbon/chip "Menu"/menu "Mais" inalcancaveis. Este e o
    // mesmo ponto que BOOT-RESILIENCE-001 hoisteou para antes das fases com
    // timeout, entao herda a garantia de rodar no caminho degradado.
    armBootOverlayFailsafe();
}
// ----------------------------------------------------------------
// PANEL REGISTRATION
// ----------------------------------------------------------------
/**
 * Register a panel.
 * @param {any} config
 */
function registerPanel(config: any) {
    const el = _document.getElementById(config.elId);
    if (!el) return;
    panels.set(config.id, {
        id: config.id,
        title: config.title,
        el,
        state: 'docked',
        dock: config.dock,
        size: config.size,
        minSize: config.minSize || 180,
        maxSize: config.maxSize || 500,
    });
}
// ----------------------------------------------------------------
// MINIMIZE TAB CONTAINERS
// ----------------------------------------------------------------
/**
 * Create containers for minimized panel tabs.
 * Cria divs absolutas nas bordas do main area para tabs de paineis minimizados.
 */
function createMinTabContainers() {
    const mainArea = _document.getElementById('main-area');
    if (!mainArea) return;
    // Tab container na borda esquerda
    const leftTabs = _document.createElement('div');
    leftTabs.id = 'min-tabs-left';
    leftTabs.className = 'min-tabs min-tabs--left';
    minTabsLeft = leftTabs;
    mainArea.appendChild(leftTabs);
    // Tab container na borda direita
    const rightTabs = _document.createElement('div');
    rightTabs.id = 'min-tabs-right';
    rightTabs.className = 'min-tabs min-tabs--right';
    minTabsRight = rightTabs;
    mainArea.appendChild(rightTabs);
    // Tab container na borda inferior (para constellation minimizada)
    const bottomTabs = _document.createElement('div');
    bottomTabs.id = 'min-tabs-bottom';
    bottomTabs.className = 'min-tabs min-tabs--bottom';
    minTabsBottom = bottomTabs;
    mainArea.appendChild(bottomTabs);
}
// ----------------------------------------------------------------
// PANEL HEADER INJECTION
// ----------------------------------------------------------------
/**
 * Inject minimize button into panel tabs bars.
 * Adiciona botao de minimize na barra de tabs de cada painel.
 */
function injectPanelHeaders() {
    panels.forEach((panel: any) => {
        // Usa .tabs como header (ambos paineis agora tem .tabs)
        const tabsBar = panel.el.querySelector('.tabs');
        if (!tabsBar) return;
        // Chevron unico integrado na tabs bar (mesmo pattern do ribbon)
        const chevronIcon =
            panel.dock === 'left'
                ? '<polyline points="15 18 9 12 15 6"/>' // chevron-left
                : '<polyline points="9 6 15 12 9 18"/>'; // chevron-right
        const btn = _document.createElement('button');
        btn.type = 'button';
        btn.className = 'panel-toggle-btn';
        btn.title = t('minimizePanel');
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${chevronIcon}</svg>`;
        btn.addEventListener('click', () => minimizePanel(panel.id));
        tabsBar.appendChild(btn);
        // Tornar tabs bar arrastavel para float
        setupDragToFloat(panel.id, tabsBar);
    });
}
// ----------------------------------------------------------------
// TOOLBAR & CONSTELLATION BAR CONTROLS
// ----------------------------------------------------------------
let toolbarFloating = false;
let constellationFloating = false;
/**
 * Inject float + collapse controls into toolbar and constellation.
 * Adiciona botoes de flutuante e recolher na toolbar e constelacao.
 */
function injectBarControls() {
    // Toolbar controls REMOVED - now handled by #ribbon-toggle-btn in menubar
    // Constellation glassmorphic controls REMOVED - collapse via .constellation-collapse-btn
    // Float still available via View > Panels and window.floatConstellation()
    const hud = _document.getElementById('constellation-hud');
    if (hud) {
        setupBarDragToFloat(hud, floatConstellation, () => constellationFloating);
        setupConstellationVerticalResize(hud);
        // Restaurar altura salva do painel inferior via custom property
        // Se o painel estiver colapsado, usar altura minima em vez da salva
        const isCollapsed = (localStorage.getItem('ecbyts-constellation-collapsed') || '') === '1';
        if (isCollapsed) {
            const mainArea = _document.getElementById('main-area');
            if (mainArea) mainArea.style.setProperty('--bottom-panel-height', '28px');
        } else {
            const savedH = localStorage.getItem('ecbyts-constellation-height') || '';
            if (savedH) {
                const parsed = parseInt(savedH, 10);
                const clamped = clampConstellationHeight(parsed, _window.innerHeight);
                if (clamped !== null) {
                    const mainArea = _document.getElementById('main-area');
                    if (mainArea) mainArea.style.setProperty('--bottom-panel-height', clamped + 'px');
                    if (clamped !== parsed) {
                        try {
                            localStorage.setItem('ecbyts-constellation-height', String(clamped));
                        } catch (e: any) {
                            console.debug('[panelManager] persist-clamped-height:', e?.message || e);
                            /* no-op */
                        }
                    }
                }
            }
        }
    }
}
/**
 * Setup vertical resize handle at the top of docked constellation.
 * Permite o usuario redimensionar a altura da constellation arrastando a borda superior.
 * @param {HTMLElement} hud
 */
function setupConstellationVerticalResize(hud: any) {
    if (hud.querySelector('.constellation-resize-top')) return;
    const resizeDiv = _document.createElement('div');
    resizeDiv.className = 'constellation-resize-top';
    hud.insertBefore(resizeDiv, hud.firstChild);
    let startY: any = 0;
    let startH: any = 0;
    const mainArea = _document.getElementById('main-area');
    // Aplica nova altura via CSS custom property - todas as views respondem via flex
    const applyHeight = (h: any) => {
        if (mainArea) mainArea.style.setProperty('--bottom-panel-height', h + 'px');
    };
    resizeDiv.addEventListener('mousedown', (e: any) => {
        // Nao redimensionar se esta floating (usa handles do addFloatingResizeHandles)
        if (constellationFloating) return;
        e.stopPropagation(); // Impedir que setupBarDragToFloat intercepte o evento
        startY = e.clientY;
        startH = hud.offsetHeight;
        _document.body.style.cursor = 'ns-resize';
        _document.body.style.userSelect = 'none';
        const onMove = (me: any) => {
            const delta = startY - me.clientY; // arrastar para cima = aumentar
            const newH = clampConstellationHeight(startH + delta, _window.innerHeight);
            if (newH !== null) applyHeight(newH);
        };
        const onUp = () => {
            _document.removeEventListener('mousemove', onMove);
            _document.removeEventListener('mouseup', onUp);
            _document.body.style.cursor = '';
            _document.body.style.userSelect = '';
            // Persistir altura no localStorage
            const currentH = hud.offsetHeight;
            try {
                localStorage.setItem('ecbyts-constellation-height', String(currentH));
            } catch (e: any) {
                console.debug('[panelManager] persist-resize-end-height:', e?.message || e);
                /* no-op */
            }
            saveBarsState();
            // ARCH-MONOLITH-ATOMIZATION-001#22: RAF-batch via _scheduleCanvasResize
            _scheduleCanvasResize();
        };
        _document.addEventListener('mousemove', onMove);
        _document.addEventListener('mouseup', onUp);
        e.preventDefault();
    });
    // Re-clamp on window resize to prevent overflow
    _window.addEventListener('resize', () => {
        if (constellationFloating) return;
        const currentH = hud.offsetHeight;
        const maxH = resolveConstellationMaxHeight(_window.innerHeight);
        if (currentH > maxH) {
            applyHeight(maxH);
            try {
                localStorage.setItem('ecbyts-constellation-height', String(maxH));
            } catch (e: any) {
                console.debug('[panelManager] persist-max-height:', e?.message || e);
                /* no-op */
            }
            _scheduleCanvasResize();
        }
    });
    // Double-click cicla alturas preset: 120 -> 250 -> 40vh -> 120
    resizeDiv.addEventListener('dblclick', (e: any) => {
        if (constellationFloating) return;
        e.preventDefault();
        const currentH = hud.offsetHeight;
        // Encontra o proximo preset maior que o atual (com margem de 20px).
        // Pure: build presets + next-preset selection extraído p/ _panelManagerPure.
        const next = resolveNextConstellationPresetHeight(currentH, _window.innerHeight);
        applyHeight(next);
        try {
            localStorage.setItem('ecbyts-constellation-height', String(next));
        } catch (e: any) {
            console.debug('[panelManager] persist-preset-height:', e?.message || e);
            /* no-op */
        }
        saveBarsState();
        _scheduleCanvasResize();
    });
}
// ----------------------------------------------------------------
// TABS SCROLL ARROWS
// ----------------------------------------------------------------
const TABS_SCROLL_STEP = 120;
/**
 * Inject scroll arrows into .tabs bars that overflow horizontally.
 * Cria setas de navegacao lateral nas barras de abas dos paineis.
 * Mesmo pattern visual das setas do ribbon toolbar.
 */
function injectTabsScrollArrows() {
    _document.querySelectorAll('.tabs').forEach((tabs: any) => {
        if (tabs.parentElement?.classList.contains('tabs-wrapper')) return;
        // Envolve .tabs num wrapper para posicionar setas FORA do scroll
        // Mesmo pattern do ribbon: setas no container pai, scroll no filho
        const wrapper = _document.createElement('div');
        wrapper.className = 'tabs-wrapper';
        tabs.parentElement.insertBefore(wrapper, tabs);
        wrapper.appendChild(tabs);
        const arrowLeft = _document.createElement('button');
        arrowLeft.type = 'button';
        arrowLeft.className = 'tabs-scroll-arrow scroll-left';
        arrowLeft.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>';
        arrowLeft.addEventListener('click', (e: any) => {
            e.stopPropagation();
            tabs.scrollBy({ left: -TABS_SCROLL_STEP, behavior: 'smooth' });
        });
        const arrowRight = _document.createElement('button');
        arrowRight.type = 'button';
        arrowRight.className = 'tabs-scroll-arrow scroll-right';
        arrowRight.innerHTML =
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';
        arrowRight.addEventListener('click', (e: any) => {
            e.stopPropagation();
            tabs.scrollBy({ left: TABS_SCROLL_STEP, behavior: 'smooth' });
        });
        // Setas sao filhas do wrapper, NAO do .tabs (ficam fora do scroll)
        wrapper.appendChild(arrowLeft);
        wrapper.appendChild(arrowRight);
        const updateArrows = () => {
            if (tabs.scrollWidth <= tabs.clientWidth + 2) {
                arrowLeft.classList.remove('visible');
                arrowRight.classList.remove('visible');
                return;
            }
            arrowLeft.classList.toggle('visible', tabs.scrollLeft > 2);
            arrowRight.classList.toggle('visible', tabs.scrollLeft + tabs.clientWidth < tabs.scrollWidth - 2);
        };
        tabs.addEventListener('scroll', updateArrows, { passive: true });
        _window.addEventListener('resize', updateArrows);
        if (typeof ResizeObserver !== 'undefined') {
            new ResizeObserver(updateArrows).observe(tabs);
        }
        requestAnimationFrame(updateArrows);
    });
}
/**
 * Update bar control icons based on floating state.
 * @param {string} barId - 'toolbar-controls' ou 'constellation-controls'
 * @param {boolean} isFloating
 * @param {string} dockFn - Nome da funcao de dock no window
 * @param {string} floatFn - Nome da funcao de float no window
 */
function updateBarControlIcon(barId: any, isFloating: any, dockFn: any, floatFn: any) {
    const ctrl = _document.getElementById(barId);
    if (!ctrl) return;
    const btn = ctrl.querySelector('.panel-ctrl-btn[data-action="float"]');
    if (!btn) return;
    if (isFloating) {
        btn.innerHTML = getIcon('dock-top', { size: '14px' });
        btn.title = t('dockLeft');
        btn.setAttribute('onclick', `${dockFn}()`);
    } else {
        btn.innerHTML = getIcon('maximize', { size: '14px' });
        btn.title = t('floatPanel');
        btn.setAttribute('onclick', `${floatFn}()`);
    }
}
/**
 * Float the toolbar as a draggable window.
 * Destaca a toolbar do grid e posiciona como janela flutuante.
 */
function floatToolbar() {
    const toolbar = _document.getElementById('toolbar');
    if (!toolbar || toolbarFloating) return;
    toolbarFloating = true;
    toolbarVisible = true;
    toolbar.style.overflow = '';
    toolbar.classList.add('panel-floating');
    toolbar.style.position = 'fixed';
    toolbar.style.left = '80px';
    toolbar.style.top = '80px';
    toolbar.style.width = `${Math.min(_window.innerWidth - 160, 900)}px`;
    toolbar.style.height = 'auto';
    toolbar.style.zIndex = String(Z_INDEX.PANEL_FLOATING);
    rebuildGridRows();
    updateBarControlIcon('toolbar-controls', true, 'dockToolbar', 'floatToolbar');
    updateRibbonToggleState();
    saveBarsState();
}
/**
 * Dock the toolbar back to the grid.
 * Restaura a toolbar para sua posicao fixa no layout do grid.
 */
function dockToolbar() {
    const toolbar = _document.getElementById('toolbar');
    if (!toolbar) return;
    toolbarFloating = false;
    toolbarVisible = true;
    toolbar.classList.remove('panel-floating');
    toolbar.style.removeProperty('position');
    toolbar.style.removeProperty('left');
    toolbar.style.removeProperty('top');
    toolbar.style.removeProperty('width');
    toolbar.style.removeProperty('height');
    toolbar.style.removeProperty('z-index');
    toolbar.style.overflow = '';
    rebuildGridRows();
    updateBarControlIcon('toolbar-controls', false, 'dockToolbar', 'floatToolbar');
    updateRibbonToggleState();
    saveBarsState();
}
/**
 * Pure helper: resolve the i18n key for the readings (constellation) panel
 * detach/dock context-menu item, based on the current floating state.
 *
 * Docked (isFloating=false) → 'panel.readings.detach' (offer to float).
 * Floating (isFloating=true) → 'panel.readings.dock' (offer to dock).
 *
 * Pure (no DOM, no side effects) so it can be unit-tested in isolation.
 * The toggle is idempotent: calling it twice with flipped state returns
 * back to the original key.
 * @param {boolean} isFloating - true if the panel is currently floating
 * @returns {'panel.readings.detach'|'panel.readings.dock'}
 */
export function resolveReadingsDetachMenuKey(isFloating: any) {
    return isFloating ? 'panel.readings.dock' : 'panel.readings.detach';
}
/**
 * Float the constellation as a draggable window.
 * Destaca a constelacao do viewport e posiciona como janela flutuante.
 */
function floatConstellation() {
    const hud = _document.getElementById('constellation-hud');
    if (!hud || constellationFloating) return;
    constellationFloating = true;
    constellationVisible = true;
    hud.style.display = '';
    _removeConstellationMinTab();
    hud.classList.add('panel-floating');
    hud.style.position = 'fixed';
    hud.style.left = '80px';
    hud.style.bottom = '';
    hud.style.top = `${_window.innerHeight - 240}px`;
    hud.style.width = `${Math.min(_window.innerWidth - 160, 900)}px`;
    hud.style.height = '180px';
    hud.style.zIndex = String(Z_INDEX.PANEL_FLOATING);
    hud.style.right = '';
    // Adicionar handles de resize customizados
    _constellationResizeCleanup?.();
    _constellationResizeCleanup = addFloatingResizeHandles(hud, {
        minWidth: 300,
        maxWidth: _window.innerWidth - 100,
        minHeight: 120,
        maxHeight: 500,
        onEnd: () => saveBarsState(),
    });
    updateBarControlIcon('constellation-controls', true, 'dockConstellation', 'floatConstellation');
    updateRibbonToggleState();
    saveBarsState();
}
/**
 * Dock the constellation back to viewport bottom.
 * Restaura a constelacao para o fundo do viewport 3D.
 */
function dockConstellation() {
    const hud = _document.getElementById('constellation-hud');
    if (!hud) return;
    _constellationResizeCleanup?.();
    _constellationResizeCleanup = null;
    constellationFloating = false;
    constellationVisible = true;
    hud.classList.remove('panel-floating');
    // Remover TODOS os inline styles - CSS (position: relative; flex-shrink: 0) governa
    hud.style.removeProperty('position');
    hud.style.removeProperty('left');
    hud.style.removeProperty('right');
    hud.style.removeProperty('bottom');
    hud.style.removeProperty('top');
    hud.style.removeProperty('width');
    hud.style.removeProperty('height');
    hud.style.removeProperty('z-index');
    hud.style.display = '';
    _removeConstellationMinTab();
    // Restaurar altura salva via custom property (respeitar estado colapsado)
    const isCollapsed = hud.classList.contains('constellation-collapsed');
    if (!isCollapsed) {
        const savedH = localStorage.getItem('ecbyts-constellation-height') || '';
        if (savedH) {
            const parsed = parseInt(savedH, 10);
            if (!isNaN(parsed)) {
                const mainArea = _document.getElementById('main-area');
                if (mainArea) mainArea.style.setProperty('--bottom-panel-height', parsed + 'px');
            }
        }
    }
    updateBarControlIcon('constellation-controls', false, 'dockConstellation', 'floatConstellation');
    updateRibbonToggleState();
    saveBarsState();
}
/**
 * Setup drag-to-float on a bar element (toolbar/constellation).
 * @param {HTMLElement} el - O elemento da barra
 * @param {Function} floatFn - Funcao para flutuar
 * @param {Function} isFloatingFn - Funcao que retorna se ja esta flutuando
 */
function setupBarDragToFloat(el: any, floatFn: any, isFloatingFn: any) {
    const dragThreshold = 30;
    el.addEventListener('mousedown', (e: any) => {
        if (
            e.target.closest('button') ||
            e.target.closest('.panel-ctrl-btn') ||
            e.target.closest('select') ||
            e.target.closest('input') ||
            e.target.closest('.constellation-resize-top') ||
            e.target.closest('.float-resize')
        )
            return;
        // Se ja floating, permitir mover
        if (isFloatingFn()) {
            const offsetX = e.clientX - el.offsetLeft;
            const offsetY = e.clientY - el.offsetTop;
            const onMove = (me: any) => {
                el.style.left = `${me.clientX - offsetX}px`;
                el.style.top = `${me.clientY - offsetY}px`;
            };
            const onUp = () => {
                _document.removeEventListener('mousemove', onMove);
                _document.removeEventListener('mouseup', onUp);
                _document.body.style.cursor = '';
                _document.body.style.userSelect = '';
            };
            _document.addEventListener('mousemove', onMove);
            _document.addEventListener('mouseup', onUp);
            _document.body.style.cursor = 'grabbing';
            _document.body.style.userSelect = 'none';
            e.preventDefault();
            return;
        }
        // Drag threshold para ativar float
        const startX = e.clientX;
        const startY = e.clientY;
        const onMove = (me: any) => {
            if (Math.abs(me.clientX - startX) > dragThreshold || Math.abs(me.clientY - startY) > dragThreshold) {
                _document.removeEventListener('mousemove', onMove);
                _document.removeEventListener('mouseup', onUp);
                floatFn();
                // Iniciar drag imediatamente
                const ox = me.clientX - el.offsetLeft;
                const oy = me.clientY - el.offsetTop;
                const onFloatMove = (fe: any) => {
                    el.style.left = `${fe.clientX - ox}px`;
                    el.style.top = `${fe.clientY - oy}px`;
                };
                const onFloatUp = () => {
                    _document.removeEventListener('mousemove', onFloatMove);
                    _document.removeEventListener('mouseup', onFloatUp);
                    _document.body.style.cursor = '';
                    _document.body.style.userSelect = '';
                };
                _document.addEventListener('mousemove', onFloatMove);
                _document.addEventListener('mouseup', onFloatUp);
                _document.body.style.cursor = 'grabbing';
                _document.body.style.userSelect = 'none';
            }
        };
        const onUp = () => {
            _document.removeEventListener('mousemove', onMove);
            _document.removeEventListener('mouseup', onUp);
        };
        _document.addEventListener('mousemove', onMove);
        _document.addEventListener('mouseup', onUp);
    });
}
// ----------------------------------------------------------------
// PANEL CONTROL ICON UPDATES
// ----------------------------------------------------------------
/**
 * Update panel control button icons based on current state.
 * Atualiza icones dos botoes de controle conforme estado do painel.
 * @param {string} _panelId
 */
function updatePanelControlIcons(_panelId: any) {
    // Chevron unico nao precisa trocar icone - float nao tem mais botao visual
    // Float/dock feito via context menu ou View > Panels
}
/**
 * Update ribbon toggle button active states.
 * Sincroniza a aparencia dos botoes de toggle do ribbon com o estado dos paineis.
 */
export function updateRibbonToggleState() {
    // Left panel toggle
    const leftBtn = _document.getElementById('toggle-left-panel-btn');
    const leftPanel = panels.get('families');
    if (leftBtn && leftPanel) {
        leftBtn.classList.toggle('active', leftPanel.state !== 'minimized');
    }
    // Right panel toggle
    const rightBtn = _document.getElementById('toggle-right-panel-btn');
    const rightPanel = panels.get('properties');
    if (rightBtn && rightPanel) {
        rightBtn.classList.toggle('active', rightPanel.state !== 'minimized');
    }
    // Toolbar toggle
    const toolbarBtn = _document.getElementById('toggle-toolbar-btn');
    if (toolbarBtn) {
        toolbarBtn.classList.toggle('active', toolbarVisible);
    }
    // Statusbar toggle
    const statusbarBtn = _document.getElementById('toggle-statusbar-btn');
    if (statusbarBtn) {
        statusbarBtn.classList.toggle('active', statusbarVisible);
    }
    // Constellation toggle
    const constBtn = _document.getElementById('toggle-constellation-btn');
    if (constBtn) {
        constBtn.classList.toggle('active', constellationVisible);
    }
    // Chat panel toggle
    const chatBtn = _document.getElementById('toggle-chat-panel-btn');
    const chatPanel = _document.getElementById('llm-chat-panel');
    if (chatBtn && chatPanel) {
        chatBtn.classList.toggle('active', chatPanel.classList.contains('open'));
    }
}
// ----------------------------------------------------------------
// TOGGLE (backward compat)
// ----------------------------------------------------------------
/**
 * Toggle panel between docked and minimized.
 * @param {string} panelId
 */
function togglePanel(panelId: any) {
    const panel = panels.get(panelId);
    if (!panel) return;
    if (panel.state === 'minimized') {
        restorePanel(panelId);
    } else {
        minimizePanel(panelId);
    }
}
// ----------------------------------------------------------------
// DOCK PANEL
// ----------------------------------------------------------------
/**
 * Dock a panel to a specific side.
 * Move o painel para o lado especificado.
 *
 * @param {string} panelId - ID do painel
 * @param {'left'|'right'} position - Lado alvo
 */
export function dockPanel(panelId: any, position: any) {
    const panel = panels.get(panelId);
    if (!panel) return;
    // Se ja esta dockado nesse lado, nada a fazer
    if (panel.state === 'docked' && panel.dock === position) return;
    // Se tava floating, remover estado floating e handles de resize
    if (panel.state === 'floating') {
        panel._cleanupResize?.();
        panel._cleanupResize = null;
        panel.el.classList.remove('panel-floating');
        panel.el.style.removeProperty('left');
        panel.el.style.removeProperty('top');
        panel.el.style.removeProperty('width');
        panel.el.style.removeProperty('height');
        panel.el.style.removeProperty('position');
        panel.el.style.removeProperty('z-index');
    }
    // Remover tab de minimizado se existia
    removeMinTab(panelId);
    // Verificar se outro painel ja esta nessa posicao
    const otherPanel = findPanelAtDock(position, panelId);
    if (otherPanel && otherPanel.state === 'docked') {
        // Trocar posicoes: o outro vai pro lado oposto
        const otherSide = position === 'left' ? 'right' : 'left';
        otherPanel.dock = otherSide;
        otherPanel.el.setAttribute('data-dock', otherSide);
    }
    // Atualizar estado
    panel.dock = position;
    panel.state = 'docked';
    panel.el.setAttribute('data-dock', position);
    panel.el.classList.remove('collapsed', 'panel-floating', 'panel-minimized');
    rebuildLayout();
    saveLayout();
    updatePanelControlIcons(panelId);
    updateRibbonToggleState();
}
// ----------------------------------------------------------------
// MINIMIZE PANEL
// ----------------------------------------------------------------
/**
 * Minimize a panel to an edge tab.
 * @param {string} panelId
 */
export function minimizePanel(panelId: any) {
    const panel = panels.get(panelId);
    if (!panel) return;
    // Ja minimizado - nao duplicar min-tab
    if (panel.state === 'minimized') return;
    panel.state = 'minimized';
    panel.el.classList.add('panel-minimized');
    // Criar tab na borda
    createMinTab(panel);
    rebuildLayout();
    saveLayout();
    updateRibbonToggleState();
}
// ----------------------------------------------------------------
// RESTORE PANEL
// ----------------------------------------------------------------
/**
 * Restore a minimized panel to its dock position.
 * @param {string} panelId
 * @param {string|null} [tabId]
 */
export function restorePanel(panelId: any, tabId: any = null) {
    const panel = panels.get(panelId);
    if (!panel) return;
    panel.state = 'docked';
    panel.el.classList.remove('panel-minimized', 'panel-floating');
    // Ensure chevron stays immediately visible when restoring a scrolled tabs bar
    const tabs = panel.el.querySelector('.tabs');
    if (tabs) tabs.scrollTop = 0;
    // Remover tab
    removeMinTab(panelId);
    rebuildLayout();
    saveLayout();
    updatePanelControlIcons(panelId);
    updateRibbonToggleState();
    // Ativar sub-aba especifica se solicitado
    if (tabId) activateTabById(tabId);
}
/**
 * Garante que uma tab esteja visível: restaura o painel se minimizado,
 * depois ativa a tab. Safe para painéis já dockados (apenas ativa a tab).
 * Previne o bug onde tab.click() em painel minimizado não tem efeito visível.
 *
 * Aceita tanto o panel id registrado ('families' | 'properties') quanto o
 * element id ('left-panel' | 'right-panel'), para chamar-se de forma intuitiva
 * a partir de handlers que referenciam o DOM.
 *
 * @param {string} panelOrElId - 'families'|'properties'|'left-panel'|'right-panel'
 * @param {string} tabId       - valor de data-tab
 */
export function openTabInPanel(panelOrElId: any, tabId: any) {
    const EL_TO_PANEL: AnyRecord = { 'left-panel': 'families', 'right-panel': 'properties' };
    const panelId = EL_TO_PANEL[panelOrElId] || panelOrElId;
    const panel = panels.get(panelId);
    if (panel && panel.state !== 'docked') {
        restorePanel(panelId, tabId);
        return;
    }
    activateTabById(tabId);
}
// ----------------------------------------------------------------
// FLOAT PANEL
// ----------------------------------------------------------------
/**
 * Make a panel floating.
 * @param {string} panelId
 */
export function floatPanel(panelId: any) {
    const panel = panels.get(panelId);
    if (!panel) return;
    panel.state = 'floating';
    panel.el.classList.remove('panel-minimized');
    panel.el.classList.add('panel-floating');
    // Posicionar no centro da tela
    const _rect = panel.el.getBoundingClientRect();
    panel.el.style.position = 'fixed';
    panel.el.style.left = `${Math.max(50, (_window.innerWidth - panel.size) / 2)}px`;
    panel.el.style.top = '150px';
    panel.el.style.width = `${panel.size}px`;
    panel.el.style.height = `${_window.innerHeight - 250}px`;
    panel.el.style.zIndex = String(Z_INDEX.PANEL_FLOATING);
    // Remover tab se existia
    removeMinTab(panelId);
    // Adicionar handles de resize customizados
    panel._cleanupResize?.();
    panel._cleanupResize = addFloatingResizeHandles(panel.el, {
        minWidth: panel.minSize,
        maxWidth: panel.maxSize,
        minHeight: 150,
        maxHeight: _window.innerHeight - 100,
        onEnd: () => saveLayout(),
    });
    rebuildLayout();
    saveLayout();
    updatePanelControlIcons(panelId);
    updateRibbonToggleState();
}
// ----------------------------------------------------------------
// MINIMIZE TABS
// ----------------------------------------------------------------
/**
 * Create a minimized tab for a panel.
 * @param {PanelState} panel
 */
function createMinTab(panel: any) {
    removeMinTab(panel.id);
    const container = panel.dock === 'left' ? minTabsLeft : minTabsRight;
    if (!container) return;
    // Ler sub-abas do painel para criar um min-tab por aba
    const subTabs = /*as:any[]*/ Array.from(panel.el.querySelectorAll('.tabs .tab[data-tab]'));
    if (subTabs.length === 0) {
        // Fallback: min-tab unica com titulo do painel.
        // H-006 (HUD Audit 2026-06-05, claude - ui): garante label legível
        // mesmo quando panel.title é vazio + aria-label para acessibilidade.
        const fallbackTitle = panel.title || getMinTabFallbackLabel(panel.id) || panel.id || 'Painel';
        const tab = _document.createElement('button');
        tab.className = 'min-tab';
        tab.id = `min-tab-${panel.id}`;
        tab.title = fallbackTitle;
        tab.setAttribute('aria-label', fallbackTitle);
        tab.innerHTML = `<span class="min-tab-icon">${getIcon('grid', { size: '12px' })}</span><span class="min-tab-text">${fallbackTitle}</span>`;
        tab.addEventListener('click', () => restorePanel(panel.id));
        container.appendChild(tab);
        return;
    }
    // Wrapper agrupa todas as sub-abas deste painel
    const wrapper = _document.createElement('div');
    wrapper.className = 'min-tab-group';
    wrapper.id = `min-tab-${panel.id}`;
    // No painel direito minimizado, manter Automation sempre visivel no topo.
    // Evita que fique fora do viewport em alturas menores.
    if (panel.id === 'properties') {
        subTabs.sort((a: any, b: any) => {
            const aa = a.dataset.tab === 'automation' ? 0 : 1;
            const bb = b.dataset.tab === 'automation' ? 0 : 1;
            return aa - bb;
        });
    }
    subTabs.forEach((sub: any) => {
        const tabId = sub.dataset.tab || '';
        // H-006 (HUD Audit 2026-06-05, claude - ui): garantir label legível
        // mesmo quando textContent da tab original é vazio (só ícone).
        // Fallback via mapping PT-BR + aria-label para leitor de tela.
        // Nielsen H6 Recognition + WCAG 4.1.2 Name/Role/Value.
        const labelFromDom = (sub.textContent || '').trim();
        const label = labelFromDom || getMinTabFallbackLabel(tabId) || tabId || 'Painel';
        const isActive = sub.classList.contains('active');
        const icon = getMinTabIconName(tabId);
        const btn = _document.createElement('button');
        btn.className = 'min-tab' + (isActive ? ' min-tab--active' : '');
        btn.dataset.tab = tabId;
        btn.title = label;
        btn.setAttribute('aria-label', label);
        btn.innerHTML = `<span class="min-tab-icon">${getIcon(icon, { size: '12px' })}</span><span class="min-tab-text">${label}</span>`;
        btn.addEventListener('click', () => restorePanel(panel.id, tabId));
        wrapper.appendChild(btn);
    });
    container.appendChild(wrapper);
}
/**
 * Resolve icon name for a tab id in minimized rail chips.
 * @param {string} tabId
 * @returns {string}
 */
function getMinTabIconName(tabId: any) {
    const map: AnyRecord = {
        families: 'layers',
        elements: 'box',
        sensors: 'radio',
        areas: 'grid',
        project: 'folder',
        files: 'file-text',
        campaigns: 'target',
        scenes: 'camera',
        analytics: 'bar-chart',
        stamps: 'share',
        governance: 'shield',
        'cost-analysis': 'dollar-sign',
        automation: 'settings',
    };
    return map[tabId] || 'grid';
}
/**
 * H-006 (HUD Audit 2026-06-05, claude - ui): mapeia tabId para label PT-BR
 * usado como fallback quando textContent da aba original é vazio. Garante
 * que ícones na borda esquerda/direita SEMPRE tenham nome humano para
 * tooltip + aria-label. Mantém alinhamento 1:1 com getMinTabIconName().
 */
function getMinTabFallbackLabel(tabId: any): string {
    const map: AnyRecord = {
        families: 'Famílias',
        elements: 'Elementos',
        sensors: 'Sensores',
        areas: 'Áreas',
        project: 'Projeto',
        files: 'Arquivos',
        campaigns: 'Campanhas',
        scenes: 'Cenas',
        analytics: 'Análise',
        stamps: 'Compartilhar',
        governance: 'Governança',
        'cost-analysis': 'Análise de Custos',
        automation: 'Automação',
        properties: 'Propriedades',
    };
    return map[tabId] || '';
}
/**
 * Remove a minimized tab.
 * @param {string} panelId
 */
function removeMinTab(panelId: any) {
    const tab = _document.getElementById(`min-tab-${panelId}`);
    if (tab) tab.remove();
}
// ----------------------------------------------------------------
// CONSTELLATION MIN-TAB (bottom edge)
// ----------------------------------------------------------------
/**
 * Create minimized tab strip for constellation at bottom edge.
 * Mostra as sub-abas da constellation como botoes horizontais na borda inferior.
 */
function _createConstellationMinTab() {
    _removeConstellationMinTab();
    if (!minTabsBottom) return;
    const hud = _document.getElementById('constellation-hud');
    if (!hud) return;
    const wrapper = _document.createElement('div');
    wrapper.className = 'min-tab-group min-tab-group--horizontal';
    wrapper.id = 'min-tab-constellation';
    const cTabs = hud.querySelectorAll('.constellation-tab[data-ctab]');
    cTabs.forEach((ct: any) => {
        const ctabId = ct.dataset.ctab || '';
        const label = ct.textContent.trim();
        const isActive = ct.classList.contains('active');
        const btn = _document.createElement('button');
        btn.className = 'min-tab min-tab--horizontal' + (isActive ? ' min-tab--active' : '');
        btn.title = label;
        btn.innerHTML = `<span class="min-tab-text">${label}</span>`;
        btn.addEventListener('click', () => _restoreConstellation(ctabId));
        wrapper.appendChild(btn);
    });
    minTabsBottom.appendChild(wrapper);
}
function _removeConstellationMinTab() {
    const el = _document.getElementById('min-tab-constellation');
    if (el) el.remove();
}
/**
 * Restore constellation from minimized state.
 * @param {string} [ctabId] - Sub-aba da constellation para ativar (graph, pdplu, report)
 */
function _restoreConstellation(ctabId: any) {
    constellationVisible = true;
    const hud = _document.getElementById('constellation-hud');
    if (hud) hud.style.display = '';
    _removeConstellationMinTab();
    rebuildGridRows();
    updateRibbonToggleState();
    saveBarsState();
    if (ctabId && _window.switchConstellationTab) {
        _window.switchConstellationTab(ctabId);
    }
}
/**
 * Recovery: força o constellation HUD (Integration panel) para estado
 * expandido e visível, descarta colapso persistido. Útil quando o usuário
 * perde o HUD por estado localStorage corrompido ou regressão CSS.
 * Exposto como window.handleResetConstellationLayout — pode ser chamado
 * via console: window.handleResetConstellationLayout()
 */
function handleResetConstellationLayout() {
    const hud = _document.getElementById('constellation-hud');
    if (!hud) {
        console.warn('[panelManager] handleResetConstellationLayout: #constellation-hud not found');
        return;
    }
    try {
        localStorage.removeItem('ecbyts-constellation-collapsed');
    } catch (e: any) {
        console.debug('[panelManager] reset-constellation:rm-collapsed', e?.message || e);
    }
    // Se estava flutuante, docka primeiro
    if (constellationFloating) {
        try {
            dockConstellation();
        } catch (e: any) {
            console.debug('[panelManager] reset-constellation:dock', e?.message || e);
        }
    }
    hud.classList.remove('constellation-collapsed');
    hud.style.display = '';
    constellationVisible = true;
    const mainArea = _document.getElementById('main-area');
    if (mainArea) mainArea.style.setProperty('--bottom-panel-height', '120px');
    _removeConstellationMinTab();
    rebuildGridRows();
    updateRibbonToggleState();
    saveBarsState();
    console.debug('[panelManager] constellation HUD reset to expanded/120px');
}
// ----------------------------------------------------------------
// LAYOUT REBUILD
// ----------------------------------------------------------------
/**
 * Rebuild the CSS grid layout based on current panel states.
 * Recalcula grid-template-columns do #app baseado nos estados dos paineis.
 */
function rebuildLayout() {
    const app = _document.getElementById('app');
    if (!app) return;
    // No mobile, o layout é controlado por CSS (responsive.css) + drawers
    if (_document.body.classList.contains('mobile')) return;
    // Encontrar paineis em cada posicao
    const leftPanel = findDockedPanelAt('left');
    const rightPanel = findDockedPanelAt('right');
    // Calcular larguras
    const leftWidth = leftPanel ? `${leftPanel.size}px` : '0px';
    const rightWidth = rightPanel ? `${rightPanel.size}px` : '0px';
    const _leftResize = leftPanel ? '4px' : '0px';
    const _rightResize = rightPanel ? '4px' : '0px';
    // Atualizar CSS variables
    app.style.setProperty('--left-panel-width', leftWidth);
    app.style.setProperty('--right-panel-width', rightWidth);
    // Mostrar/esconder resize handles conforme estado dos paineis
    const leftResizeEl = _document.getElementById('resize-handle-left');
    if (leftResizeEl) leftResizeEl.style.display = leftPanel ? '' : 'none';
    const rightResizeEl = _document.getElementById('resize-handle-right');
    if (rightResizeEl) rightResizeEl.style.display = rightPanel ? '' : 'none';
    // Posicionar paineis na grid
    panels.forEach((panel: any) => {
        if (panel.state === 'floating') return;
        if (panel.state === 'minimized') {
            // Painel minimizado: esconder sem pointer-events issues
            panel.el.style.display = 'none';
        } else if (panel.state === 'docked') {
            panel.el.style.display = '';
            panel.el.style.removeProperty('position');
            panel.el.style.removeProperty('left');
            panel.el.style.removeProperty('top');
            panel.el.style.removeProperty('width');
            panel.el.style.removeProperty('height');
            panel.el.style.removeProperty('z-index');
            // Colocar na coluna certa
            if (panel.dock === 'left') {
                panel.el.style.gridColumn = '1';
            } else {
                panel.el.style.gridColumn = '5';
            }
        }
    });
    // Recalcular canvas 3D (ARCH-MONOLITH-ATOMIZATION-001#22: RAF-batch)
    _scheduleCanvasResize();
}
/**
 * Find a docked panel at a specific position (excludes minimized/floating).
 * @param {'left'|'right'} position
 * @returns {PanelState|null}
 */
function findDockedPanelAt(position: any) {
    for (const panel of panels.values()) {
        if (panel.dock === position && panel.state === 'docked') {
            return panel;
        }
    }
    return null;
}
/**
 * Find any panel at a dock position (any state).
 * @param {'left'|'right'} position
 * @param {string} [excludeId]
 * @returns {PanelState|null}
 */
function findPanelAtDock(position: any, excludeId: any) {
    for (const panel of panels.values()) {
        if (panel.dock === position && panel.id !== excludeId && panel.state !== 'floating') {
            return panel;
        }
    }
    return null;
}
// ----------------------------------------------------------------
// RESIZE HANDLES
// ----------------------------------------------------------------
/**
 * Setup resize handles for docked panels.
 */
function setupResizeHandles() {
    const app = _document.getElementById('app');
    // --- Left panel resize ---
    const leftHandle = _document.getElementById('resize-handle-left');
    if (leftHandle) {
        let isResizingLeft = false;
        /** @type {PanelState|null} */
        let leftPanel: any = null;
        leftHandle.addEventListener('mousedown', (e: any) => {
            leftPanel = findDockedPanelAt('left');
            if (!leftPanel) return;
            isResizingLeft = true;
            _document.body.style.cursor = 'col-resize';
            _document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        _document.addEventListener('mousemove', (e: any) => {
            if (!isResizingLeft || !leftPanel) return;
            const newWidth = clampLeftPanelWidth(e.clientX, _window.innerWidth, leftPanel.minSize);
            leftPanel.size = newWidth;
            app.style.setProperty('--left-panel-width', newWidth + 'px');
            const container = _document.getElementById('canvas-container');
            if (container) handleResize(container);
        });
        _document.addEventListener('mouseup', () => {
            if (isResizingLeft) {
                isResizingLeft = false;
                leftPanel = null;
                _document.body.style.cursor = '';
                _document.body.style.userSelect = '';
                saveLayout();
            }
        });
    }
    // --- Right panel resize ---
    const rightHandle = _document.getElementById('resize-handle-right');
    if (rightHandle) {
        let isResizingRight = false;
        /** @type {PanelState|null} */
        let rightPanel: any = null;
        rightHandle.addEventListener('mousedown', (e: any) => {
            rightPanel = findDockedPanelAt('right');
            if (!rightPanel) return;
            isResizingRight = true;
            _document.body.style.cursor = 'col-resize';
            _document.body.style.userSelect = 'none';
            e.preventDefault();
        });
        _document.addEventListener('mousemove', (e: any) => {
            if (!isResizingRight || !rightPanel) return;
            // Painel direito: largura = viewport width - posicao X do mouse
            const newWidth = clampRightPanelWidth(e.clientX, _window.innerWidth, rightPanel.minSize);
            rightPanel.size = newWidth;
            app.style.setProperty('--right-panel-width', newWidth + 'px');
            const container = _document.getElementById('canvas-container');
            if (container) handleResize(container);
        });
        _document.addEventListener('mouseup', () => {
            if (isResizingRight) {
                isResizingRight = false;
                rightPanel = null;
                _document.body.style.cursor = '';
                _document.body.style.userSelect = '';
                saveLayout();
            }
        });
    }
}
// ----------------------------------------------------------------
// DRAG TO FLOAT
// ----------------------------------------------------------------
/**
 * Setup drag-to-float on a panel header.
 * @param {string} panelId
 * @param {HTMLElement} header
 */
function setupDragToFloat(panelId: any, header: any) {
    const dragThreshold = 30; // px antes de ativar floating
    header.addEventListener('mousedown', (e: any) => {
        // Nao iniciar drag se clicou em um botao
        if (e.target.closest('button') || e.target.closest('.panel-ctrl-btn')) return;
        const panel = panels.get(panelId);
        if (!panel) return;
        // Se ja floating, permitir mover diretamente
        if (panel.state === 'floating') {
            const offsetX = e.clientX - panel.el.offsetLeft;
            const offsetY = e.clientY - panel.el.offsetTop;
            const onMove = (moveE: any) => {
                panel.el.style.left = `${moveE.clientX - offsetX}px`;
                panel.el.style.top = `${moveE.clientY - offsetY}px`;
            };
            const onUp = () => {
                _document.removeEventListener('mousemove', onMove);
                _document.removeEventListener('mouseup', onUp);
                _document.body.style.cursor = '';
                _document.body.style.userSelect = '';
            };
            _document.addEventListener('mousemove', onMove);
            _document.addEventListener('mouseup', onUp);
            _document.body.style.cursor = 'grabbing';
            _document.body.style.userSelect = 'none';
            e.preventDefault();
            return;
        }
        // Guardar posicao inicial
        const startX = e.clientX;
        const startY = e.clientY;
        const onMove = (moveE: any) => {
            const dx = Math.abs(moveE.clientX - startX);
            const dy = Math.abs(moveE.clientY - startY);
            if (dx > dragThreshold || dy > dragThreshold) {
                // Threshold reached - convert to floating
                _document.removeEventListener('mousemove', onMove);
                _document.removeEventListener('mouseup', onUp);
                floatPanel(panelId);
                // Reposicionar na posicao do mouse
                const panel = panels.get(panelId);
                if (panel) {
                    panel.el.style.left = `${moveE.clientX - 100}px`;
                    panel.el.style.top = `${moveE.clientY - 15}px`;
                    // Iniciar drag imediatamente
                    const floatStartX = moveE.clientX - panel.el.offsetLeft;
                    const floatStartY = moveE.clientY - panel.el.offsetTop;
                    const onFloatMove = (fmE: any) => {
                        panel.el.style.left = `${fmE.clientX - floatStartX}px`;
                        panel.el.style.top = `${fmE.clientY - floatStartY}px`;
                    };
                    const onFloatUp = () => {
                        _document.removeEventListener('mousemove', onFloatMove);
                        _document.removeEventListener('mouseup', onFloatUp);
                        _document.body.style.cursor = '';
                        _document.body.style.userSelect = '';
                    };
                    _document.addEventListener('mousemove', onFloatMove);
                    _document.addEventListener('mouseup', onFloatUp);
                    _document.body.style.cursor = 'grabbing';
                    _document.body.style.userSelect = 'none';
                }
            }
        };
        const onUp = () => {
            _document.removeEventListener('mousemove', onMove);
            _document.removeEventListener('mouseup', onUp);
        };
        _document.addEventListener('mousemove', onMove);
        _document.addEventListener('mouseup', onUp);
    });
}
// ----------------------------------------------------------------
// ANALYTICS FULLSCREEN
// ----------------------------------------------------------------
/**
 * Toggle analytics fullscreen mode.
 */
function toggleAnalyticsFullscreen() {
    const analyticsTab = _document.getElementById('tab-analytics');
    const btn = _document.getElementById('analytics-fullscreen-btn');
    if (!analyticsTab) return;
    analyticsFullscreen = !analyticsFullscreen;
    if (analyticsFullscreen) {
        analyticsTab.classList.add('analytics-fullscreen');
        if (btn) btn.textContent = t('collapseAnalytics');
        activateTabById('analytics');
        ensureAnalyticsFullscreenExitButton(true);
    } else {
        analyticsTab.classList.remove('analytics-fullscreen');
        if (btn) btn.textContent = t('expandAnalytics');
        ensureAnalyticsFullscreenExitButton(false);
    }
}
/**
 * Ensure we always have a visible way back from analytics fullscreen.
 * Creates/removes a fixed "Exit Fullscreen" button outside panel bounds.
 * @param {boolean} enabled
 */
function ensureAnalyticsFullscreenExitButton(enabled: any) {
    const id = 'analytics-fullscreen-exit-btn';
    let btn = _document.getElementById(id);
    if (!enabled) {
        if (btn) btn.remove();
        return;
    }
    if (!btn) {
        btn = _document.createElement('button');
        btn.id = id;
        btn.type = 'button';
        btn.className = 'analytics-fullscreen-exit-btn';
        btn.textContent = t('exitFullscreen');
        btn.title = t('exitAnalyticsFullscreen');
        btn.addEventListener('click', () => {
            if (analyticsFullscreen) toggleAnalyticsFullscreen();
        });
        _document.body.appendChild(btn);
    }
}
// ----------------------------------------------------------------
// TOOLBAR & STATUSBAR TOGGLE
// ----------------------------------------------------------------
let toolbarVisible = true;
let statusbarVisible = true;
let constellationVisible = true;
/**
 * Check if constellation HUD is visible.
 * Retorna se a barra de constelacao esta visivel (para outros modulos consultarem).
 * @returns {boolean}
 */
export function isConstellationVisible() {
    return constellationVisible;
}
const BARS_KEY = 'ecbyts-bars-layout';
/**
 * Rebuild grid rows based on toolbar/statusbar visibility.
 * Recalcula grid-template-rows conforme visibilidade da toolbar e statusbar.
 */
export function rebuildGridRows() {
    const app = _document.getElementById('app');
    if (!app) return;
    // SPEC_BUGFIX_HOME_REDESIGN_V2_2026_04_15 F2: honor V2 flag.
    // Previously this function hard-coded "40px" as the first row, which
    // overrode the CSS rule `#app.home-redesign-v2 { grid-template-rows: 48px ... }`
    // via inline-style specificity, making the V2 header never render at its
    // intended 48px height. When the V2 class is present, the title row
    // becomes 48px (header-contextual height).
    // Probe DOM-derived flags here (wire layer); the row-string math lives
    // in the pure resolveGridTemplateRows() — same six-track output.
    const tickerEl = _document.getElementById('ticker-bar');
    const viewMode = app.classList.contains('view-group-actions')
        ? 'group-actions'
        : app.classList.contains('view-group-datastudio')
          ? 'group-datastudio'
          : 'normal';
    const rows = resolveGridTemplateRows({
        viewMode,
        homeRedesignV2: app.classList.contains('home-redesign-v2'),
        toolbarVisible,
        toolbarFloating,
        tickerVisible: !!tickerEl && getComputedStyle(tickerEl).display !== 'none',
        statusbarVisible,
    });
    app.style.setProperty('--app-grid-rows', rows); // R21-a §21: CSS var lida por #app (não inline grid-template-rows)
    // Recalcular canvas 3D apos mudanca de grid (ARCH-MONOLITH-ATOMIZATION-001#22: RAF-batch)
    _scheduleCanvasResize();
}
/**
 * Clamp floating panels back inside the viewport after a window resize.
 * Garante que paineis flutuantes nao escapem da tela ao redimensionar.
 */
function _clampFloatingPanels() {
    const vw = _window.innerWidth;
    const vh = _window.innerHeight;
    panels.forEach((panel: any) => {
        if (panel.state !== 'floating') return;
        const el = panel.el;
        const rect = el.getBoundingClientRect();
        if (rect.right > vw) el.style.left = Math.max(0, vw - rect.width - 8) + 'px';
        if (rect.bottom > vh) el.style.top = Math.max(0, vh - rect.height - 8) + 'px';
        if (rect.left < 0) el.style.left = '0px';
        if (rect.top < 0) el.style.top = '0px';
    });
    // Clamp toolbar and constellation if floating
    [_document.getElementById('toolbar'), _document.getElementById('constellation-hud')].forEach(
        (el: any) => {
            if (!el || !el.classList.contains('panel-floating')) return;
            const rect = el.getBoundingClientRect();
            if (rect.right > vw) el.style.left = Math.max(0, vw - rect.width - 8) + 'px';
            if (rect.bottom > vh) el.style.top = Math.max(0, vh - rect.height - 8) + 'px';
            if (rect.left < 0) el.style.left = '0px';
            if (rect.top < 0) el.style.top = '0px';
        },
    );
}
/**
 * Toggle toolbar (ribbon) visibility.
 * Mostra/esconde a faixa de opcoes (ribbon).
 * Se flutuante, docka primeiro e depois recolhe.
 */
function toggleToolbar() {
    // Se flutuante, docka primeiro
    if (toolbarFloating) {
        dockToolbar();
        return;
    }
    toolbarVisible = !toolbarVisible;
    const toolbar = _document.getElementById('toolbar');
    if (toolbar) {
        toolbar.classList.toggle('ribbon-collapsed', !toolbarVisible);
    }
    // Atualiza chevron no menubar (legacy titlebar + V2 header)
    const nextTitle = toolbarVisible ? t('panelManager.collapseRibbon') : t('panelManager.expandRibbon');
    for (const id of ['ribbon-toggle-btn', 'ah-ribbon-toggle-btn']) {
        const toggleBtn = _document.getElementById(id);
        if (toggleBtn) {
            toggleBtn.classList.toggle('collapsed', !toolbarVisible);
            toggleBtn.title = nextTitle;
            toggleBtn.setAttribute('aria-label', nextTitle);
        }
    }
    rebuildGridRows();
    updateRibbonToggleState();
    saveBarsState();
    // Atualiza --chrome-top para analytics-fullscreen acompanhar
    const toolbarH = toolbarVisible ? 56 : 0;
    _document.documentElement.style.setProperty('--chrome-top', 40 + toolbarH + 'px');
}
/**
 * Toggle statusbar visibility.
 * Mostra/esconde a barra de status inferior.
 */
function toggleStatusbar() {
    statusbarVisible = !statusbarVisible;
    const statusbar = _document.getElementById('statusbar');
    if (statusbar) statusbar.style.display = statusbarVisible ? '' : 'none';
    rebuildGridRows();
    updateRibbonToggleState();
    saveBarsState();
    // Atualiza --chrome-bottom para analytics-fullscreen acompanhar
    _document.documentElement.style.setProperty('--chrome-bottom', statusbarVisible ? '26px' : '0px');
}
/**
 * Toggle constellation HUD visibility.
 * Mostra/esconde a barra de constelacao (relacoes do elemento) na parte inferior.
 * Se flutuante, docka primeiro e depois recolhe.
 */
function toggleConstellation() {
    // Se flutuante, docka primeiro
    if (constellationFloating) {
        dockConstellation();
        return;
    }
    constellationVisible = !constellationVisible;
    const hud = _document.getElementById('constellation-hud');
    if (hud) hud.style.display = constellationVisible ? '' : 'none';
    // Mostrar/esconder min-tab no bottom
    if (!constellationVisible) _createConstellationMinTab();
    else _removeConstellationMinTab();
    rebuildGridRows();
    updateRibbonToggleState();
    saveBarsState();
}
/**
 * Ensure toolbar is visible (called when menu item is clicked).
 * Garante que a toolbar esteja visivel quando o usuario clica no menu.
 */
function ensureToolbarVisible() {
    if (!toolbarVisible) {
        toolbarVisible = true;
        const toolbar = _document.getElementById('toolbar');
        if (toolbar) toolbar.classList.remove('ribbon-collapsed');
        const toggleBtn = _document.getElementById('ribbon-toggle-btn');
        if (toggleBtn) {
            toggleBtn.classList.remove('collapsed');
            toggleBtn.title = t('panelManager.collapseRibbon');
        }
        rebuildGridRows();
        updateRibbonToggleState();
        saveBarsState();
    }
}
/** Save toolbar/statusbar/constellation state to localStorage. */
function saveBarsState() {
    try {
        safeSetItem(
            BARS_KEY,
            JSON.stringify({
                toolbar: toolbarVisible,
                statusbar: statusbarVisible,
                constellation: constellationVisible,
                toolbarFloating,
                constellationFloating,
            }),
        );
        _window.dispatchEvent(new CustomEvent('panelLayoutChanged'));
    } catch (e: any) {
        console.debug('[panelManager] saveBarsState:', e?.message || e);
        /* no-op */
    }
}
/** Load toolbar/statusbar state from localStorage. */
function loadBarsState() {
    try {
        const saved = localStorage.getItem(BARS_KEY) || '';
        if (!saved) return false;
        const state = JSON.parse(saved);
        if (state.toolbar === false) {
            toolbarVisible = false;
            const toolbar = _document.getElementById('toolbar');
            if (toolbar) toolbar.classList.add('ribbon-collapsed');
            const toggleBtn = _document.getElementById('ribbon-toggle-btn');
            if (toggleBtn) toggleBtn.classList.add('collapsed');
        }
        // Statusbar sempre visivel por padrao - contem disclaimer legal
        // Ignorar estado salvo para garantir visibilidade
        if (state.constellation === false) {
            constellationVisible = false;
            const hud = _document.getElementById('constellation-hud');
            if (hud) hud.style.display = 'none';
            _createConstellationMinTab();
        }
        // Restaurar estado flutuante (toolbar e constellation)
        if (state.toolbarFloating) floatToolbar();
        if (state.constellationFloating) floatConstellation();
        rebuildGridRows();
        return true;
    } catch (_e: any) {
        return false;
    }
}
// ----------------------------------------------------------------
// PERSISTENCE
// ----------------------------------------------------------------
const LAYOUT_KEY = 'ecbyts-panel-layout';
/**
 * Save current layout to localStorage.
 */
function saveLayout() {
    try {
        const layout: AnyRecord = {};
        panels.forEach((panel: any, id: any) => {
            layout[id] = {
                state: panel.state,
                dock: panel.dock,
                size: panel.size,
            };
        });
        safeSetItem(LAYOUT_KEY, JSON.stringify(layout));
        _window.dispatchEvent(new CustomEvent('panelLayoutChanged'));
    } catch (e: any) {
        console.debug('[panelManager] saveLayout:', e?.message || e);
        /* no-op */
    }
}
/**
 * Load layout from localStorage.
 */
function loadLayout() {
    try {
        const saved = localStorage.getItem(LAYOUT_KEY) || '';
        if (!saved) return false;
        const layout: AnyRecord = JSON.parse(saved);
        for (const [id, config] of Object.entries(layout)) {
            const panel = panels.get(id);
            if (!panel) continue;
            panel.dock = config.dock || panel.dock;
            panel.size = config.size || panel.size;
            // Aplicar estado
            if (config.state === 'minimized') {
                minimizePanel(id);
            } else if (config.state === 'docked') {
                dockPanel(id, config.dock);
            }
            // Nao restaurar floating - sempre come back docked
        }
        return true;
    } catch (_e: any) {
        return false;
    }
}
// ----------------------------------------------------------------
// TAB LAYOUT - Move tabs between panels
// ----------------------------------------------------------------
// DEFAULT_TAB_POSITIONS + normalizeTabPositions + isLegacyRightHeavyLayout
// extracted to ./_panelManagerPure.js (pure-logic, ARCH-MONOLITH-ATOMIZATION-001).
const TAB_LAYOUT_KEY = 'ecbyts-tab-layout';
/**
 * Apply tab layout - move tabs to their assigned panels.
 * Carrega posicoes salvas (ou usa padrao) e move abas entre paineis.
 */
function applyTabLayout() {
    const positions = loadTabPositions();
    for (const [tabId, side] of Object.entries(positions)) {
        const tabBtn = _document.querySelector(`.tab[data-tab="${tabId}"]`);
        if (!tabBtn) continue;
        const currentPanel = tabBtn.closest('#left-panel, #right-panel');
        const currentSide = currentPanel?.id === 'left-panel' ? 'left' : 'right';
        // Mover apenas se esta no painel errado
        if (currentSide !== side) {
            moveTabDOM(tabId, side);
        }
    }
    // Garantir que cada painel tem uma aba ativa
    ensureActiveTab('left');
    ensureActiveTab('right');
    applyRailTabTitles();
}
/**
 * Ensure rail tabs expose full labels via native tooltip.
 * Mantem title sincronizado com o texto visivel de cada tab.
 */
function applyRailTabTitles() {
    _document.querySelectorAll('#left-panel .tab[data-tab], #right-panel .tab[data-tab]').forEach((tab: any) => {
        // Recupera o label original (guardado em dataset) ou lê o textContent atual
        const full = tab.dataset.railLabel || (tab.textContent || '').trim();
        if (!full) return;
        // Persiste o label original para sobreviver a chamadas repetidas (ex: troca de idioma)
        tab.dataset.railLabel = full;
        tab.title = full;
        // Trunca no limite de 8 caracteres visíveis; cobre labels com espaços e com "/"
        tab.textContent = full.length > 8 ? full.slice(0, 8) + '..' : full;
    });
}
/**
 * Move a tab to a different panel.
 * Move o botao da aba e seu conteudo para o painel alvo.
 *
 * @param {string} tabId - ID da aba (ex: 'elements', 'families')
 * @param {'left'|'right'} targetSide - Painel alvo
 */
function moveTab(tabId: any, targetSide: any) {
    const tabBtn = _document.querySelector(`.tab[data-tab="${tabId}"]`);
    if (!tabBtn) return;
    // Se a aba era ativa, desativar e esconder conteudo antes de mover
    const wasActive = tabBtn.classList.contains('active');
    if (wasActive) {
        tabBtn.classList.remove('active');
        const content = _document.getElementById(`tab-${tabId}`);
        if (content) content.style.display = 'none';
    }
    moveTabDOM(tabId, targetSide);
    // Ativar a aba movida no painel destino
    tabBtn.classList.add('active');
    const content = _document.getElementById(`tab-${tabId}`);
    if (content) content.style.display = 'block';
    // Desativar outras abas no painel destino
    const targetPanel = tabBtn.closest('#left-panel, #right-panel');
    if (targetPanel) {
        targetPanel.querySelectorAll('.tab[data-tab]').forEach((t: any) => {
            if (t !== tabBtn) {
                t.classList.remove('active');
                const c = _document.getElementById(`tab-${t.dataset.tab}`);
                if (c) c.style.display = 'none';
            }
        });
    }
    // Garantir que o painel de origem tem uma aba ativa
    ensureActiveTab('left');
    ensureActiveTab('right');
    saveTabPositions();
}
/**
 * Move tab DOM elements (button + content) to target panel.
 * @param {string} tabId
 * @param {'left'|'right'} targetSide
 */
function moveTabDOM(tabId: any, targetSide: any) {
    const tabBtn = _document.querySelector(`.tab[data-tab="${tabId}"]`);
    const tabContent = _document.getElementById(`tab-${tabId}`);
    if (!tabBtn) return;
    const targetTabsBar = _document.getElementById(targetSide === 'left' ? 'left-tabs' : 'right-tabs');
    const targetContent = _document.getElementById(
        targetSide === 'left' ? 'left-panel-content' : 'right-panel-content',
    );
    if (!targetTabsBar || !targetContent) return;
    // Inserir botao antes do .panel-controls (se existir)
    const controls = targetTabsBar.querySelector('.panel-controls');
    if (controls) {
        targetTabsBar.insertBefore(tabBtn, controls);
    } else {
        targetTabsBar.appendChild(tabBtn);
    }
    // Mover conteudo da aba
    if (tabContent) {
        targetContent.appendChild(tabContent);
    }
}
/**
 * Ensure a panel has an active tab.
 * Se nenhuma aba estiver ativa no painel, ativa a primeira.
 *
 * @param {'left'|'right'} side
 */
function ensureActiveTab(side: any) {
    const panel = _document.getElementById(side === 'left' ? 'left-panel' : 'right-panel');
    if (!panel) return;
    const tabs = panel.querySelectorAll('.tab[data-tab]');
    if (tabs.length === 0) return;
    const hasActive = panel.querySelector('.tab.active');
    if (hasActive) {
        // Garantir que o conteudo esta visivel
        const activeId = hasActive.dataset.tab || '';
        const content = _document.getElementById(`tab-${activeId}`);
        if (content) content.style.display = 'block';
        return;
    }
    // Nenhuma ativa - ativar primeira
    const first = tabs[0];
    first.classList.add('active');
    const content = _document.getElementById(`tab-${first.dataset.tab}`);
    if (content) content.style.display = 'block';
}
/**
 * Load tab positions from localStorage.
 * @returns {Object<string, 'left'|'right'>}
 */
function loadTabPositions() {
    try {
        const saved = localStorage.getItem(TAB_LAYOUT_KEY) || '';
        const parsed = saved ? JSON.parse(saved) : {};
        const shouldRebalanceLegacy = isLegacyRightHeavyLayout(parsed);
        const source = shouldRebalanceLegacy ? {} : parsed;
        const { positions, changed } = normalizeTabPositions(source);
        if (changed || shouldRebalanceLegacy) {
            safeSetItem(TAB_LAYOUT_KEY, JSON.stringify(positions));
        }
        return positions;
    } catch (e: any) {
        console.debug('[panelManager] loadTabPositions:', e?.message || e);
        /* no-op */
    }
    return normalizeTabPositions({}).positions;
}
/**
 * Save current tab positions to localStorage.
 */
function saveTabPositions() {
    try {
        const positions: any = {};
        _document.querySelectorAll('.tab[data-tab]').forEach((tab: any) => {
            const panel = tab.closest('#left-panel, #right-panel');
            if (panel) {
                positions[tab.dataset.tab] = panel.id === 'left-panel' ? 'left' : 'right';
            }
        });
        safeSetItem(TAB_LAYOUT_KEY, JSON.stringify(positions));
    } catch (e: any) {
        console.debug('[panelManager] saveTabPositions:', e?.message || e);
        /* no-op */
    }
}
// ----------------------------------------------------------------
// CONTEXT MENU - Right-click on panels, tabs, bars, and windows
// ----------------------------------------------------------------
let contextMenuEl: any = null;
let contextMenuCtx: any = null;
/**
 * Create the panel context menu element and register listeners.
 * Menu de contexto universal para todos os paineis, barras e janelas.
 */
function createContextMenu() {
    contextMenuEl = _document.createElement('div');
    contextMenuEl.className = 'panel-context-menu';
    contextMenuEl.id = 'panel-context-menu';
    _document.body.appendChild(contextMenuEl);
    // Click em item do menu - executa acao e fecha
    contextMenuEl.addEventListener('click', (e: any) => {
        const item = e.target.closest('.panel-context-menu-item');
        if (!item || !contextMenuCtx) return;
        executeContextAction(item.dataset.action, contextMenuCtx);
        hideContextMenu();
    });
    // Impedir menu nativo sobre nosso menu
    contextMenuEl.addEventListener('contextmenu', (e: any) => e.preventDefault());
    // Fechar ao clicar fora
    _document.addEventListener('click', (e: any) => {
        if (contextMenuEl && !contextMenuEl.contains(e.target)) hideContextMenu();
    });
    // Fechar com Escape
    _document.addEventListener('keydown', (e: any) => {
        if (e.key === 'Escape') hideContextMenu();
    });
    // Registrar listeners de contextmenu em todos os paineis e barras
    _document.getElementById('left-panel')?.addEventListener('contextmenu', handlePanelContextMenu);
    _document.getElementById('right-panel')?.addEventListener('contextmenu', handlePanelContextMenu);
    _document.getElementById('constellation-hud')?.addEventListener('contextmenu', handlePanelContextMenu);
    // Viz settings bar e criado dinamicamente - observar adição ao DOM
    const observer = new MutationObserver(() => {
        const vizBar = _document.getElementById('viz-settings-bar');
        if (vizBar && !vizBar._ctxRegistered) {
            vizBar.addEventListener('contextmenu', handlePanelContextMenu);
            vizBar._ctxRegistered = true;
        }
        const chatPanel = _document.querySelector('.llm-chat-panel');
        if (chatPanel && !chatPanel._ctxRegistered) {
            chatPanel.addEventListener('contextmenu', handlePanelContextMenu);
            chatPanel._ctxRegistered = true;
        }
    });
    const mainArea = _document.getElementById('main-area');
    if (mainArea) observer.observe(mainArea, { childList: true, subtree: false });
    // Tambem observar body para chat (fixed position, appendado em body ou main)
    observer.observe(_document.body, { childList: true, subtree: false });
}
/**
 * Handle right-click on any panel, bar, or window.
 * Detecta o contexto (tab, painel docked, constellation, viz, chat, floating, modal)
 * e mostra o menu apropriado.
 * @param {MouseEvent} e
 */
function handlePanelContextMenu(e: any) {
    const target = e.target;
    // Nao mostrar menu se clicou em input, select, textarea
    if (target.closest('input, select, textarea')) return;
    const x = e.clientX;
    const y = e.clientY;
    // 1. Tab em painel docked
    const tab = target.closest('.tab[data-tab]');
    const dockedPanel = target.closest('#left-panel, #right-panel');
    if (tab && dockedPanel) {
        e.preventDefault();
        const dockedElement = dockedPanel;
        const tabElement = tab;
        const panelId = findPanelIdByElement(dockedElement);
        showPanelContextMenu({ type: 'tab', tabId: tabElement.dataset.tab, panelId, id: dockedElement.id }, x, y);
        return;
    }
    // 2. Painel docked (fora de tab)
    if (dockedPanel) {
        e.preventDefault();
        const dockedElement = dockedPanel;
        const panelId = findPanelIdByElement(dockedElement);
        const isFloating = dockedPanel.classList.contains('panel-floating');
        showPanelContextMenu(
            {
                type: isFloating ? 'floating' : 'docked',
                panelId,
                id: dockedElement.id,
            },
            x,
            y,
        );
        return;
    }
    // 3. Constellation HUD
    const hud = target.closest('#constellation-hud');
    if (hud) {
        e.preventDefault();
        const isCollapsed = hud.classList.contains('constellation-collapsed');
        const isFloating = constellationFloating;
        showPanelContextMenu(
            {
                type: isFloating ? 'constellation-floating' : isCollapsed ? 'constellation-collapsed' : 'constellation',
                id: 'constellation-hud',
            },
            x,
            y,
        );
        return;
    }
    // 4. Viz Settings bar
    const vizBar = target.closest('#viz-settings-bar');
    if (vizBar) {
        e.preventDefault();
        showPanelContextMenu({ type: 'viz-settings', id: 'viz-settings-bar' }, x, y);
        return;
    }
    // 5. Chat LLM
    const chatPanel = target.closest('.llm-chat-panel');
    if (chatPanel) {
        e.preventDefault();
        showPanelContextMenu({ type: 'chat', id: chatPanel.id || 'llm-chat-panel' }, x, y);
        return;
    }
    // 6. Floating panel (generica)
    const floating = target.closest('.panel-floating');
    if (floating) {
        e.preventDefault();
        const floatingElement = floating;
        const panelId = findPanelIdByElement(floatingElement);
        showPanelContextMenu({ type: 'floating', panelId, id: floatingElement.id }, x, y);
        return;
    }
    // 7. Modal resizable
    const modal = target.closest('.modal-resizable');
    if (modal) {
        e.preventDefault();
        showPanelContextMenu({ type: 'modal', id: modal.closest('.modal-overlay')?.id || '' }, x, y);
        return;
    }
}
/**
 * Find panel state ID from a DOM element.
 * @param {HTMLElement} el
 * @returns {string|undefined}
 */
function findPanelIdByElement(el: any) {
    for (const panel of panels.values()) {
        if (panel.el === el) return panel.id;
    }
    return undefined;
}
/**
 * Build and show the context menu based on context type.
 * @param {any} ctx - Contexto: { type, id, panelId?, tabId? }
 * @param {number} x
 * @param {number} y
 */
function showPanelContextMenu(ctx: any, x: any, y: any) {
    if (!contextMenuEl) return;
    contextMenuCtx = ctx;
    const items: any[] = [];
    const sep = '<div class="panel-context-menu-sep"></div>';
    const ico = (name: any) => getIcon(name, { size: '14px' });
    // Readings detach/dock dedicated label (SPEC_READINGS_DETACH_MENU).
    // Feature-gated; the dedicated label is applied additively below, after
    // the generic items are built, without altering existing menu lines.
    const readingsMenuOn = CONFIG?.FEATURES?.READINGS_DETACH_MENU !== false;
    switch (ctx.type) {
        case 'tab': {
            // Determinar posicao atual
            const tabBtn = _document.querySelector(`.tab[data-tab="${ctx.tabId}"]`);
            const panel = tabBtn?.closest('#left-panel, #right-panel');
            const isLeft = panel?.id === 'left-panel';
            const isRight = panel?.id === 'right-panel';
            items.push(
                menuItem('dock-left', ico('dock-left'), t('dockLeft'), isLeft),
                menuItem('dock-right', ico('dock-right'), t('dockRight'), isRight),
                sep,
                menuItem('minimize', ico('minus'), t('minimizePanel')),
                menuItem('float', ico('external-link'), t('floatPanel')),
            );
            break;
        }
        case 'docked':
            items.push(
                menuItem('minimize', ico('minus'), t('minimizePanel')),
                menuItem('float', ico('external-link'), t('floatPanel')),
            );
            break;
        case 'floating':
            items.push(
                menuItem('dock', ico('dock-left'), t('dock') || 'Dock'),
                sep,
                menuItem('minimize', ico('minus'), t('minimizePanel')),
            );
            break;
        case 'constellation':
            items.push(
                menuItem('collapse', ico('chevron-down'), t('collapse')),
                menuItem('float-constellation', ico('external-link'), t('floatPanel')),
                sep,
                menuItem('hide', ico('eye-off'), t('hidePanel') || 'Hide'),
            );
            break;
        case 'constellation-collapsed':
            items.push(
                menuItem('expand', ico('chevron-up'), t('expandPanel') || 'Expand'),
                menuItem('float-constellation', ico('external-link'), t('floatPanel')),
                sep,
                menuItem('hide', ico('eye-off'), t('hidePanel') || 'Hide'),
            );
            break;
        case 'constellation-floating':
            items.push(
                menuItem('dock-constellation', ico('dock-left'), t('dock') || 'Dock'),
                sep,
                menuItem('hide', ico('eye-off'), t('hidePanel') || 'Hide'),
            );
            break;
        case 'viz-settings':
            items.push(menuItem('hide-viz', ico('eye-off'), t('hidePanel') || 'Hide'));
            break;
        case 'chat':
            items.push(
                menuItem('reset-size', ico('maximize'), t('resetSize') || 'Reset Size'),
                sep,
                menuItem('close-chat', ico('x'), t('close')),
            );
            break;
        case 'modal':
            items.push(
                menuItem('reset-size-modal', ico('maximize'), t('resetSize') || 'Reset Size'),
                sep,
                menuItem('close-modal', ico('x'), t('close')),
            );
            break;
        default:
            return;
    }
    // Help and bug report - always available from contextual panels.
    items.push(
        sep,
        menuItem('open-docs-help', ico('book-open'), getDocsHelpLabel()),
        menuItem('report-bug', ico('alert-circle'), t('reportBug.menuItem') || 'Reportar Bug'),
    );
    contextMenuEl.innerHTML = items.join('');
    // SPEC_READINGS_DETACH_MENU: for the readings (constellation) panel,
    // relabel the float/dock <span> with the reading-specific i18n label.
    // Purely additive — runs after the generic HTML is set, leaving the
    // menuItem() call sites and the assignment above untouched. Reuses
    // existing floatConstellation/dockConstellation (no new menu, no new key).
    if (
        readingsMenuOn &&
        (ctx.type === 'constellation' ||
            ctx.type === 'constellation-collapsed' ||
            ctx.type === 'constellation-floating')
    ) {
        const detachLbl = t(resolveReadingsDetachMenuKey(false));
        const dockLbl = t(resolveReadingsDetachMenuKey(true));
        if (ctx.type === 'constellation-floating' && dockLbl) {
            contextMenuEl.innerHTML = contextMenuEl.innerHTML.replace(
                /(data-action="dock-constellation">[\s\S]*?<span>)[^<]*(<\/span>)/,
                `$1${dockLbl}$2`,
            );
        } else if (detachLbl) {
            contextMenuEl.innerHTML = contextMenuEl.innerHTML.replace(
                /(data-action="float-constellation">[\s\S]*?<span>)[^<]*(<\/span>)/,
                `$1${detachLbl}$2`,
            );
        }
    }
    // Posicionar e mostrar
    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;
    contextMenuEl.classList.add('visible');
    applyMenuA11y(contextMenuEl, { label: 'Panel actions' });
    // Ajustar se sair da tela
    requestAnimationFrame(() => {
        const rect = contextMenuEl.getBoundingClientRect();
        if (rect.right > _window.innerWidth) {
            contextMenuEl.style.left = `${_window.innerWidth - rect.width - 8}px`;
        }
        if (rect.bottom > _window.innerHeight) {
            contextMenuEl.style.top = `${_window.innerHeight - rect.height - 8}px`;
        }
    });
}
/**
 * Build a single menu item HTML string.
 * @param {string} action
 * @param {string} icon - HTML do icone
 * @param {string} label
 * @param {boolean} [active=false]
 * @returns {string}
 */
function menuItem(action: any, icon: any, label: any, active: any = false) {
    return `<button class="panel-context-menu-item${active ? ' active' : ''}" data-action="${action}">
        ${icon}<span>${label}</span>
    </button>`;
}
/**
 * Execute a context menu action.
 * @param {string} action
 * @param {any} ctx - Contexto do menu
 */
function executeContextAction(action: any, ctx: any) {
    switch (action) {
        // Tab actions
        case 'dock-left':
            if (ctx.tabId) moveTab(ctx.tabId, 'left');
            break;
        case 'dock-right':
            if (ctx.tabId) moveTab(ctx.tabId, 'right');
            break;
        // Panel docked actions
        case 'minimize':
            if (ctx.panelId) minimizePanel(ctx.panelId);
            break;
        case 'float':
            if (ctx.panelId) floatPanel(ctx.panelId);
            break;
        // Floating panel actions
        case 'dock':
            if (ctx.panelId) {
                const panel = panels.get(ctx.panelId);
                if (panel) dockPanel(ctx.panelId, panel.dock);
            }
            break;
        // Constellation actions
        case 'collapse':
        case 'expand':
            if (_window.toggleConstellationCollapse) _window.toggleConstellationCollapse();
            break;
        case 'float-constellation':
            floatConstellation();
            // ARCH-MONOLITH-ATOMIZATION-001#22: RAF-batch via _scheduleCanvasResize
            _scheduleCanvasResize();
            break;
        case 'dock-constellation':
            dockConstellation();
            _scheduleCanvasResize();
            break;
        case 'hide':
            toggleConstellation();
            break;
        // Viz settings
        case 'hide-viz':
            if (_window.handleToggleVizSettings) _window.handleToggleVizSettings();
            break;
        // Chat LLM
        case 'reset-size': {
            const chat = _document.querySelector('.llm-chat-panel');
            if (chat) {
                chat.style.removeProperty('width');
                chat.style.removeProperty('height');
                try {
                    localStorage.removeItem('ecbyts-chat-dims');
                } catch (e: any) {
                    console.debug('[panelManager] chat-reset-size:', e?.message || e);
                    /* no-op */
                }
            }
            break;
        }
        case 'close-chat':
            if (_window.toggleAIWidget) _window.toggleAIWidget();
            break;
        // Modal
        case 'reset-size-modal': {
            const modal = ctx.id ? _document.querySelector(`#${ctx.id} .modal`) : null;
            if (modal) {
                modal.style.removeProperty('width');
                modal.style.removeProperty('height');
            }
            break;
        }
        case 'close-modal':
            if (_window.closeModal) _window.closeModal();
            break;
        case 'open-docs-help':
            openDocsHelp(getDocsSectionForPanelContext(ctx));
            break;
        case 'report-bug':
            _window.handleReportBug?.();
            break;
    }
}
/**
 * Hide the context menu.
 */
function hideContextMenu() {
    if (contextMenuEl) {
        contextMenuEl.classList.remove('visible');
        contextMenuCtx = null;
    }
}
//# sourceMappingURL=panelManager.js.map
