// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/utils/ui/homeHeader.js
// Home Redesign V2 contextual header - REWRITE 2026-04-16
// Zero DOM mutation: builds all content from scratch inside #app-header.
// CSS scoped via #app-header - no inheritance from #titlebar.
import { CONFIG } from '../../config.js';
import { t } from '../i18n/translations.js';
import { escapeHtml } from '../helpers/html.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { registerPreserveKey } from '../startup/versionGate.js';
// Botões explícitos Salvar / Abrir saves (diretiva Calvin 2026-06-02) — explorer
// de saves com pastas/arquivos. Import side-effect registra window handlers também.
import { openSavesManager, quickSaveCurrentModel } from './savesManager.js';
import {
    shouldShowSaveStatus as _shouldShowSaveStatus,
    buildViewMenuItemHtml as _buildViewMenuItemHtml,
} from './_homeHeaderSaveStatusPure.js';
// ENV-BADGE-HEADER-V2 (fix): o badge de ambiente (Item 9.60) só existia dentro
// do #titlebar legado, que este header oculta (display:none) — nunca aparecia
// no header novo. initEnvironmentBadge() faz getElementById('environment-badge')
// e popula texto/cor/tooltip; ver initHomeHeader() para o elemento novo.
import { initEnvironmentBadge } from './environmentBadge.js';
let _headerEl: any = null;
let _modelNameEl: any = null;
let _saveStatusEl: any = null;
let _ctxEl: any = null;
let _hasModel = false;
let _modelName = '';
// NOTIF-BELL-V2 (2026-07-03): sino de notificações do header legado (#titlebar)
// ficava preso dentro do titlebar escondido pelo home-v2, sem nenhum outro
// caminho de acesso. `_notifPollTimer` mantém o badge próprio (#ah-notif-badge)
// atualizado localmente — não reaproveita o polling de auth.ts (esse só
// atualiza o #notification-badge legado, que não é mais visível).
let _notifPollTimer: any = null;
export function initHomeHeader() {
    if (!CONFIG.FEATURES.HOME_REDESIGN_V2) return;
    const app = document.getElementById('app');
    if (!app) return;
    app.classList.add('home-redesign-v2');
    const header = document.getElementById('app-header');
    if (!header) {
        console.warn('[home-v2] #app-header not found');
        return;
    }
    // Hide legacy titlebar (keep in DOM for backward compat)
    const titlebar = document.getElementById('titlebar');
    if (titlebar) titlebar.style.display = 'none';
    // ENV-BADGE-HEADER-V2: o #titlebar oculto ainda contém o #environment-badge
    // original (id duplicado é HTML inválido e getElementById sempre pega o
    // primeiro em document order — #titlebar vem antes de #app-header no HTML,
    // então o id novo nunca seria alcançado). Renomeia o antigo ANTES de criar
    // o elemento novo, para que getElementById('environment-badge') dentro de
    // initEnvironmentBadge() encontre só o do header novo.
    const legacyBadge = document.getElementById('environment-badge');
    if (legacyBadge) legacyBadge.id = 'environment-badge-legacy';
    // Build header entirely from scratch - zero reference to #titlebar DOM
    header.style.display = '';
    header.innerHTML = '';
    // LEFT: brand
    const left = document.createElement('div');
    left.className = 'ah-left';
    left.innerHTML = `
        <img src="assets/logo.png" alt="ecbyts" class="ah-logo">
        <span class="ah-brand">ecbyts</span>
<span
            class="ah-version"
            id="app-version-v2"
            role="button"
            tabindex="0"
            data-i18n-title="forceUpdateTooltip" title=""
            data-cc-action="cc-61c4366e"
            data-cc-keydown="cc-928c7653"
        ></span>
    `;
    header.appendChild(left);
    // ENV-BADGE-HEADER-V2: badge de ambiente (Item 9.60) — reusa a classe
    // .environment-badge (mesma semântica/dataset do original), mas o CSS
    // existente é escopado como `#titlebar .environment-badge` (ver app/css/
    // styles.css ~L1022) e não alcança este elemento fora do #titlebar. Sem
    // poder tocar CSS neste escopo, aplica-se um estilo inline mínimo aqui
    // (initEnvironmentBadge() já seta backgroundColor inline por env; isso só
    // completa padding/tipografia para não depender da regra CSS ausente).
    const envBadge = document.createElement('span');
    envBadge.id = 'environment-badge';
    envBadge.className = 'environment-badge';
    envBadge.hidden = true;
    // Nota: NÃO setar `display` inline aqui — initEnvironmentBadge() só alterna
    // a propriedade `hidden` (atributo nativo, display:none via UA stylesheet);
    // um `display` inline teria prioridade sobre isso e vazaria o badge visível
    // antes da 1a chamada de initEnvironmentBadge() em produção.
    envBadge.style.cssText =
        'margin-left:6px;padding:2px 8px;font-size:10px;font-weight:700;' +
        'letter-spacing:0.5px;color:#fff;border-radius:3px;text-transform:uppercase;white-space:nowrap;' +
        'cursor:help;user-select:none;';
    left.appendChild(envBadge);
    initEnvironmentBadge();
    // CENTER: breadcrumb + model name + save status + ctx buttons
    const center = document.createElement('div');
    center.className = 'ah-center';
    const breadcrumb = document.createElement('span');
    breadcrumb.className = 'ah-bc';
    breadcrumb.textContent = t('home') || 'Home';
    center.appendChild(breadcrumb);
    const sep = document.createElement('span');
    sep.className = 'ah-sep';
    sep.textContent = '/';
    center.appendChild(sep);
    _modelNameEl = document.createElement('span');
    _modelNameEl.className = 'ah-model-name';
    _modelNameEl.setAttribute('role', 'textbox');
    _modelNameEl.setAttribute('aria-label', t('header.model.editName') || 'Model name');
    _modelNameEl.contentEditable = 'false';
    _modelNameEl.addEventListener('click', _startEdit);
    _modelNameEl.addEventListener('blur', _endEdit);
    _modelNameEl.addEventListener('keydown', _onEditKey);
    center.appendChild(_modelNameEl);
    _saveStatusEl = document.createElement('span');
    _saveStatusEl.className = 'ah-save';
    _saveStatusEl.setAttribute('aria-live', 'polite');
    center.appendChild(_saveStatusEl);
    _ctxEl = document.createElement('div');
    _ctxEl.className = 'ah-ctx';
    center.appendChild(_ctxEl);
    header.appendChild(center);
    // RIGHT: core actions (ribbon toggle, lang, help, credits, login)
    const right = document.createElement('div');
    right.className = 'ah-right';
    right.innerHTML = `
        <button type="button" class="ah-btn ah-view-menu-btn" id="ah-view-menu-btn"
                data-cc-action="cc-18143d62"
                title="${escapeHtml(t('viewMenu') || 'Exibição: barras e HUDs')}"
                aria-label="${escapeHtml(t('viewMenu') || 'View: bars and HUDs')}" aria-haspopup="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/></svg>
        </button>
        <button type="button" class="ah-btn ah-ribbon-toggle" id="ah-ribbon-toggle-btn"
                data-cc-action="cc-ac70dcce"
                title="${escapeHtml(t('collapseToolbar') || 'Collapse toolbar (Ctrl+F1)')}"
                aria-label="${escapeHtml(t('collapseToolbar') || 'Collapse toolbar')}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15"/></svg>
            <span class="ribbon-toggle-label">${escapeHtml(t('ribbonToggleMenu') || 'Menu')}</span>
        </button>
        <button type="button" class="ah-btn" id="ah-lang-btn" data-cc-action="cc-bd78ab5a" title="Language">
            <span id="ah-lang-code">EN</span>
        </button>
        <button type="button" class="ah-btn" data-cc-action="cc-2e2513ec" title="Help">?</button>
        <button type="button" class="ah-btn ah-guided-tours-btn" id="ah-guided-tours-btn"
                title="${escapeHtml(t('guidedToursTitle') || 'Tours guiados por fluxo (50+ workflows)')}"
                aria-label="Open guided workflow tours">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
        </button>
        <button type="button" class="ah-btn ah-bug-btn" data-cc-action="cc-999e4c06"
                title="${escapeHtml(t('reportBug.menuItem') || 'Report Bug')}"
                aria-label="${escapeHtml(t('reportBug.menuItem') || 'Report Bug')}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>
        </button>
        <button type="button" class="ah-btn" data-cc-action="cc-2cab1f66" title="Credits">&#9679;</button>
        <span class="ah-notif-wrap" id="ah-notif-wrap" style="display:none;position:relative;">
            <button type="button" class="ah-btn ah-notif-btn" id="ah-notif-btn"
                    title="${escapeHtml(t('notifications') || 'Notifications')}"
                    aria-label="${escapeHtml(t('notifications') || 'Notifications')}" aria-haspopup="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
            </button>
            <!-- ID-COLLISION (2026-07-03): NAO reutilizar id="notification-badge" — esse id ja
                 existe (escondido) no #titlebar legado (app/index.html ~457) e
                 getElementById() sempre resolve o primeiro em document order, que e o do
                 titlebar (vem antes de #app-header no HTML). Id proprio evita colidir com o
                 badge legado; a contagem e mantida por _refreshNotifBadge() abaixo, chamada
                 a partir de updateHomeHeaderAuth() e de um polling local (ver initHomeHeader). -->
            <span class="notification-badge" id="ah-notif-badge" style="display:none;">0</span>
        </span>
        <span id="ah-auth-wrap">
            <button type="button" class="ah-btn" id="ah-auth-btn" data-cc-action="cc-b28ca5d2" title="Login">
                <span id="ah-auth-label">${escapeHtml(t('login') || 'Login')}</span>
            </button>
        </span>
    `;
    header.appendChild(right);
    // Sync initial ribbon state (if toolbar was collapsed in saved layout)
    const toolbarEl = document.getElementById('toolbar');
    const ribbonBtn = right.querySelector('#ah-ribbon-toggle-btn');
    if (toolbarEl && ribbonBtn && toolbarEl.classList.contains('ribbon-collapsed')) {
        ribbonBtn.classList.add('collapsed');
    }
    // GUIDED-TOURS-HEADER (regressão de acesso global → contextual, 2026-06-09
    // journey-hydromet-tour-mouse-real.spec.ts): o #guided-tours-titlebar-btn
    // original ficou preso no #titlebar oculto pelo home-v2. Botão global aqui
    // chama handleOpenGuidedTours diretamente (addEventListener, não depende
    // do resolvedor data-cc-action de inline-handlers-src.js).
    const guidedToursBtn = right.querySelector('#ah-guided-tours-btn');
    if (guidedToursBtn) {
        guidedToursBtn.addEventListener('click', () => {
            (window as any).handleOpenGuidedTours?.();
        });
    }
    // Notification bell (NOTIF-BELL-V2): o dropdown/lista/"marcar tudo como lido"
    // já são resolvidos por window.handleToggleNotifications (handler vencedor
    // real em runtime é o de handlers/auth.ts — confirmado via Object.assign em
    // handlers/index.ts: notificationHandlers.ts é aplicado por último mas não
    // define handleToggleNotifications, então não sobrescreve o de auth.ts).
    // Reaproveitar esse handler evita duplicar a renderização da lista aqui.
    const notifBtn = right.querySelector('#ah-notif-btn');
    if (notifBtn) {
        notifBtn.addEventListener('click', (e: any) => {
            const fn = (window as any).handleToggleNotifications;
            if (typeof fn === 'function') fn(e);
        });
    }
    // data-action delegation for ctx buttons
    _ctxEl.addEventListener('click', (e: any) => {
        const target = e.target?.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action || '';
        if (action === 'home:generate') {
            (window.handleGenerateRandomModel || window.handleHomeHeaderGenerate || (() => {}))();
        } else if (action === 'home:import') {
            // IMPORT-UX-001 RF-1: botão Importar do header abre o modal RICO (ingestion
// wizard com 3 cartões Modelo/Dados/Espacial + formatos + templates EDD/WQX)
// em vez do modal pobre (#import-modal). Fallback encadeado: rico → legado.
(window.handleOpenIngestionModal || window.openImportModal || window.handleHomeHeaderImport || (() => {}))();
        } else if (action === 'home:export') {
            (window.openExportModal || window.handleHomeHeaderExport || (() => {}))();
        } else if (action === 'home:share') {
            (window.shareURL || window.handleHomeHeaderShare || (() => {}))();
        } else if (action === 'home:save') {
            void quickSaveCurrentModel();
        } else if (action === 'home:opensaves') {
            void openSavesManager();
        }
    });
    _headerEl = header;
    registerPreserveKey('ecbyts-header-model-name', {
        reason: 'Persists inline-edited model name across versions',
        owner: 'homeHeader',
    });
    try {
        const saved = localStorage.getItem('ecbyts-header-model-name') || '';
        if (saved) _modelName = saved;
    } catch (e: any) {
        console.debug('[homeHeader] loadName:', e?.message || e);
    }
    _render();
    (window as any).handleToggleViewMenu = handleToggleViewMenu;
    // Notification badge: primeira leitura + polling leve (60s) próprio, já que
    // o polling de auth.ts só atualiza o #notification-badge legado (escondido).
    void _refreshNotifBadge();
    if (_notifPollTimer) clearInterval(_notifPollTimer);
    _notifPollTimer = setInterval(() => void _refreshNotifBadge(), 60000);
    console.debug('[home-v2] header initialized (clean rewrite)');
}
/**
 * Atualiza visibilidade do wrapper e a contagem do badge próprio do sino
 * (#ah-notif-badge). Chamado no init, no polling local e a partir de
 * updateHomeHeaderAuth() (login/logout) — não depende de auth.ts ser editado.
 */
async function _refreshNotifBadge() {
    const wrap = document.getElementById('ah-notif-wrap');
    const badge = document.getElementById('ah-notif-badge');
    if (!wrap) return;
    try {
        const { getCurrentUser } = await import('../auth/session.js' as string);
        const user = (getCurrentUser as any)?.();
        if (!user) {
            wrap.style.display = 'none';
            if (badge) badge.style.display = 'none';
            return;
        }
        wrap.style.display = '';
        const { getUnreadNotificationCount } = await import('../libraries/supabaseMarketplace.js' as string);
        const count = await (getUnreadNotificationCount as any)?.();
        if (!badge) return;
        const safeCount = Number.isFinite(count) ? Math.max(0, count) : 0;
        if (safeCount > 0) {
            badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    } catch (e: any) {
        console.debug('[homeHeader] notif badge refresh skipped:', e?.message || e);
    }
}

// ── View menu (Exibição) ─────────────────────────────────────────────
// Religar barras (superior/inferior/painéis) e HUDs de um ponto SEMPRE
// visível no header — evita o pain de perder o acesso quando uma barra é
// desligada (o menu "Painéis" vivia dentro do ribbon, que pode sumir).
const VIEW_MENU_ITEMS: Array<any> = [
    { section: 'viewMenu.bars' },
    { key: 'toolbar', fn: 'toggleToolbar', el: 'toolbar', collapsed: 'ribbon-collapsed' },
    { key: 'statusBar', fn: 'toggleStatusbar', el: 'statusbar' },
    { key: 'ticker', fn: 'handleToggleTicker', el: 'ticker-bar' },
    { key: 'leftPanel', fn: 'toggleLeftPanel', el: 'left-panel' },
    { key: 'rightPanel', fn: 'toggleRightPanel', el: 'right-panel' },
    { section: 'viewMenu.huds' },
    { key: 'constellation', fn: 'toggleConstellation', el: 'constellation-hud' },
    { key: 'geoHud', fn: 'handleToggleGeoHud', el: 'geo-hud' },
    { key: 'sceneHud', fn: 'handleToggleSceneHud', el: 'scene-hud' },
    // HUD-UX 2026-06-11 (Calvin): toggle do perf monitor no view menu.
    // PALETTE-IN-HUD (Calvin 2026-06-17): o toggle do FAB ⌘K foi REMOVIDO — a
    // paleta migrou para o botão #palette-toggle-btn dentro do scene HUD, então
    // ligar/desligar a paleta segue o toggle do próprio scene HUD (acima).
    { key: 'perfHud', fn: 'handleTogglePerfMonitor', el: 'perf-hud' },
    // HUD-REFRESH 2026-06-11 (Calvin): "botão de refresh todos os huds do dom
    // e organizar da melhor forma conforme a configuração atual do usuário".
    // Tipo action (sem checkbox) — re-render + re-layout de todos os HUDs.
    { key: 'refreshHuds', fn: 'handleRefreshAllHuds', action: true, lazy: './hudRefresh.js' },
    // P3-2 (FRIEND-SCORE-001, Calvin loop 2026-06-14): "verificar integridade"
    // sem botão na UI — a verificação Merkle/hash-chain existe no core mas o
    // regulador/auditor não a alcançava. Item action no menu Exibição.
    { section: 'viewMenu.integrity' },
    { key: 'verifyIntegrity', fn: 'handleVerifyModelIntegrity', action: true, lazy: '../handlers/integrity.js' },
    // P4-3 (FRIEND-SCORE-001, Calvin loop 2026-06-14): visão portfólio multi-site
    // — comparar os sites lado a lado (EIS/ECBT/conformidade por site).
    { section: 'viewMenu.portfolio' },
    { key: 'portfolio', fn: 'handleOpenPortfolio', action: true, lazy: './portfolioPanel.js' },
];
function _viewItemOn(item: any): boolean {
    const el = document.getElementById(item.el);
    if (!el) return false;
    if (item.collapsed && el.classList.contains(item.collapsed)) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    // position:fixed reporta offsetParent null mesmo visível (FAB ⌘K,
    // perf-hud) — usar bounding box como critério de visibilidade real.
    if (cs.position === 'fixed') return el.getBoundingClientRect().width > 0;
    return (el as any).offsetParent !== null;
}
function _viewItemToggle(item: any): void {
    const fn = (window as any)[item.fn];
    if (typeof fn === 'function') {
        try {
            fn();
        } catch (e: any) {
            console.debug('[viewMenu:toggle]', e?.message || e);
        }
        return;
    }
    // HUD-REFRESH 2026-06-11: items lazy carregam o módulo dono do handler
    // sob demanda (o import registra window[item.fn] como side-effect).
    if (item.lazy) {
        void import(item.lazy as string)
            .then(() => {
                const loaded = (window as any)[item.fn];
                if (typeof loaded === 'function') loaded();
            })
            .catch((e: any) => console.debug('[viewMenu:lazy]', e?.message || e));
        return;
    }
    // fallback: alterna display direto (scene-hud sem handler window dedicado)
    const el = document.getElementById(item.el);
    if (el) el.style.display = _viewItemOn(item) ? 'none' : '';
}
export function handleToggleViewMenu(e?: any): void {
    if (e) {
        e.preventDefault?.();
        e.stopPropagation?.();
    }
    const existing = document.getElementById('ah-view-menu');
    if (existing) {
        existing.remove();
        return; // toggle
    }
    const btn = document.getElementById('ah-view-menu-btn');
    const menu = document.createElement('div');
    menu.id = 'ah-view-menu';
    menu.className = 'ah-view-menu';
    menu.setAttribute('role', 'menu');
    const rebuild = () => {
        // Markup puro por item extraído para `_buildViewMenuItemHtml` (sem DOM):
        // section/action ignoram `on`; checkbox usa `_viewItemOn` para o estado.
        menu.innerHTML = VIEW_MENU_ITEMS.map((it: any) =>
            _buildViewMenuItemHtml(it, it.section || it.action ? false : _viewItemOn(it), t, escapeHtml),
        ).join('');
    };
    rebuild();
    menu.addEventListener('click', (ev: any) => {
        const target = ev.target?.closest('.ah-view-item');
        if (!target) return;
        const item = VIEW_MENU_ITEMS.find((x: any) => x.key === target.dataset.vk);
        if (item) {
            _viewItemToggle(item);
            setTimeout(rebuild, 60);
        }
    });
    document.body.appendChild(menu);
    if (btn) {
        const r = btn.getBoundingClientRect();
        menu.style.position = 'fixed';
        menu.style.top = `${Math.round(r.bottom + 4)}px`;
        menu.style.right = `${Math.round(window.innerWidth - r.right)}px`;
    }
    const close = (ev: any) => {
        if (!menu.contains(ev.target) && ev.target !== btn && !(btn as any)?.contains(ev.target)) {
            menu.remove();
            document.removeEventListener('mousedown', close);
        }
    };
    setTimeout(() => document.addEventListener('mousedown', close), 60);
}
function _startEdit() {
    if (!_modelNameEl) return;
    _modelNameEl.contentEditable = 'true';
    _modelNameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(_modelNameEl);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
}
function _endEdit() {
    if (!_modelNameEl) return;
    _modelNameEl.contentEditable = 'false';
    const val = (_modelNameEl.textContent || '').trim();
    if (val && val !== _modelName) {
        _modelName = val;
        safeSetItem('ecbyts-header-model-name', val);
        if (typeof window.showToast === 'function') {
            window.showToast(t('modelNameUpdated') || 'Model name updated', 'success');
        }
    }
}
function _onEditKey(e: any) {
    if (!_modelNameEl) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        _modelNameEl.blur();
    }
    if (e.key === 'Escape') {
        _modelNameEl.textContent = _modelName || t('header.model.untitled') || 'Untitled';
        _modelNameEl.contentEditable = 'false';
    }
}
// H-016 (HUD Audit 2026-06-05, claude - ui): pill "Salvo" + título "Sem título"
// era conflito semântico (nada nomeado mas marcado salvo). A regra pura de
// visibilidade foi extraída para `_homeHeaderSaveStatusPure.ts` (Nielsen H4
// Consistency and standards) — importada acima como `_shouldShowSaveStatus`.
function _render() {
    if (_modelNameEl) {
        _modelNameEl.textContent = _modelName || t('header.model.untitled') || 'Untitled';
    }
    if (_saveStatusEl) {
        _saveStatusEl.textContent = t('header.save.saved') || 'Saved';
        _saveStatusEl.className = 'ah-save ah-save-ok';
        _saveStatusEl.style.display = _shouldShowSaveStatus(_modelName, 'saved') ? '' : 'none';
    }
    _renderCtx();
}
function _renderCtx() {
    if (!_ctxEl) return;
    if (_hasModel) {
        const saveTitle = escapeHtml(t('saves.saveCurrent') || 'Salvar modelo atual na nuvem');
        const openTitle = escapeHtml(t('saves.openTitle') || 'Abrir saves (pastas e arquivos)');
        _ctxEl.innerHTML = `
            <button type="button" class="ah-ctx-btn ah-ctx-primary" data-action="home:save" title="${saveTitle}">
                ${escapeHtml(t('saves.save') || 'Salvar')}
            </button>
            <button type="button" class="ah-ctx-btn" data-action="home:opensaves" title="${openTitle}">
                ${escapeHtml(t('saves.openBtn') || 'Abrir')}
            </button>
            <button type="button" class="ah-ctx-btn" data-action="home:export">
                ${escapeHtml(t('export') || 'Export')}
            </button>
            <button type="button" class="ah-ctx-btn" data-action="home:share">
                ${escapeHtml(t('share') || 'Share')}
            </button>
        `;
    } else {
        // Fix #9 (2026-04-18): tooltip descritivo - 'Generate' isolado era ambíguo
        // (usuário novo não sabia que gera modelo 3D aleatório)
        const genTitle = escapeHtml(t('generate.tooltip') || 'Gerar modelo 3D aleatório para explorar');
        const impTitle = escapeHtml(t('import.tooltip') || 'Importar chave ECBT de modelo existente');
        _ctxEl.innerHTML = `
            <button type="button" class="ah-ctx-btn ah-ctx-primary" data-action="home:generate" title="${genTitle}">
                ${escapeHtml(t('generate') || 'Generate')}
            </button>
            <button type="button" class="ah-ctx-btn" data-action="home:import" title="${impTitle}">
                ${escapeHtml(t('import') || 'Import')}
            </button>
            <button type="button" class="ah-ctx-btn" data-action="home:opensaves" title="${escapeHtml(t('saves.openTitle') || 'Abrir saves')}">
                ${escapeHtml(t('saves.openBtn') || 'Abrir')}
            </button>
        `;
    }
}
export function updateHomeHeader({ modelName, saveStatus, hasModel }: { modelName?: string; saveStatus?: string; hasModel?: boolean } = {}) {
    if (!CONFIG.FEATURES.HOME_REDESIGN_V2 || !_headerEl) return;
    if (modelName !== undefined) {
        _modelName = modelName;
        if (_modelNameEl) _modelNameEl.textContent = _modelName || t('header.model.untitled') || 'Untitled';
    }
    if (saveStatus !== undefined) {
        if (!_saveStatusEl) return;
        const cls = saveStatus === 'saved' ? 'ah-save-ok' : saveStatus === 'saving' ? 'ah-save-warn' : 'ah-save-err';
        _saveStatusEl.className = `ah-save ${cls}`;
        _saveStatusEl.textContent =
            saveStatus === 'saved'
                ? t('header.save.saved') || 'Saved'
                : saveStatus === 'saving'
                  ? t('header.save.saving') || 'Saving...'
                  : t('header.save.offline') || 'Offline';
        // H-016: visibility coerente entre nome do modelo e status de save
        _saveStatusEl.style.display = _shouldShowSaveStatus(_modelName, saveStatus) ? '' : 'none';
    }
    if (hasModel !== undefined) {
        _hasModel = !!hasModel;
        _renderCtx();
    }
}
export function setHomeHeaderHasModel(value: any) {
    updateHomeHeader({ hasModel: value });
}
export function getHomeHeaderState() {
    return { modelName: _modelName, hasModel: _hasModel };
}
export function updateHomeHeaderAuth(user: any) {
    if (!CONFIG.FEATURES.HOME_REDESIGN_V2) return;
    // NOTIF-BELL-V2: auth.ts chama updateHomeHeaderAuth() em cada login/logout
    // (updateAuthButton, disparado por updateAuthUI). Reaproveitar esse gancho
    // dá resposta imediata ao badge de notificações sem precisar editar auth.ts.
    void _refreshNotifBadge();
    const wrap = document.getElementById('ah-auth-wrap');
    if (!wrap) return;
    if (user) {
        const initials = _extractInitials(user.displayName || '');
        const firstName = (user.displayName || '').split(' ')[0];
        wrap.innerHTML = `
            <button type="button" class="ah-avatar-btn" id="ah-auth-btn"
                    data-cc-action="cc-b28ca5d2"
                    title="${escapeHtml(user.displayName || '')}">
                <div class="ah-avatar-circle">${escapeHtml(initials)}</div>
                <span class="ah-avatar-label">${escapeHtml(firstName)}</span>
            </button>
        `;
    } else {
        wrap.innerHTML = `
            <button type="button" class="ah-btn" id="ah-auth-btn"
                    data-cc-action="cc-b28ca5d2"
                    title="Login">
                <span id="ah-auth-label">${escapeHtml(t('login') || 'Login')}</span>
            </button>
        `;
    }
}
function _extractInitials(fullName: any) {
    if (typeof fullName !== 'string') return '??';
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return (parts[0]?.[0] || '?').toUpperCase();
    return ((parts[0]?.[0] || '?') + (parts[parts.length - 1]?.[0] || '?')).toUpperCase();
}
