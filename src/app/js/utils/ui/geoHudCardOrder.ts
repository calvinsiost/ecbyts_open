// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// GEO-HUD-REORDER-001 :: wire runtime do reorder + visibility do geo-hud.
// Reordena DOM dos 5 canvas via drag-and-drop, persiste em localStorage,
// expõe popover de configuração para mostrar/ocultar cards individualmente.

import {
    DEFAULT_CARD_ORDER,
    DEFAULT_SECONDARY_COLLAPSED,
    GEO_HUD_ORDER_KEY,
    MIN_ROWS,
    MAX_ROWS,
    MIN_COLS,
    MAX_COLS,
    // eslint-disable-next-line
    MIN_GAP,
    // eslint-disable-next-line
    MAX_GAP,
    MIN_ROW_GAP,
    MAX_ROW_GAP,
    MIN_COLUMN_GAP,
    MAX_COLUMN_GAP,
    clampRows,
    clampCols,
    // eslint-disable-next-line
    clampGap,
    clampRowGap,
    clampColumnGap,
    defaultConfig,
    getHudCardTier,
    isCanonicalCardId,
    migrateOrderForRfC3,
    moveCard,
    parsePersistedConfig,
    resolveGridDims,
    sanitizeConfig,
    serializeConfig,
    toggleCardVisibility,
    toggleSecondaryCollapse,
    type GeoHudCardConfig,
    type GeoHudCardId,
} from './_geoHudCardOrderPure.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { escapeHtml } from '../helpers/html.js';

// eslint-disable-next-line
const DRAG_HANDLE_CLASS = 'geo-hud-card-drag-handle';
const SETTINGS_BTN_ID = 'geo-hud-settings-btn';
const SETTINGS_POPOVER_ID = 'geo-hud-settings-popover';
const HIDDEN_CARD_CLASS = 'geo-hud-card-hidden';
const DRAGGING_CARD_CLASS = 'geo-hud-card-dragging';
const DROP_TARGET_CLASS = 'geo-hud-card-drop-target';
// BOOT-ENTRY-UX-001 RF-C1 (#14): collapse dos secundários por padrão
const COLLAPSE_TOGGLE_BTN_ID = 'geo-hud-collapse-toggle';
const HUD_SECONDARY_COLLAPSED_CLASS = 'geo-hud-secondary-collapsed';

const CARD_LABELS: Record<GeoHudCardId, string> = {
    'compass-canvas': 'Bússola',
    'globe-canvas': 'Localização',
    'eis-hud-canvas': 'EIS',
    // HUD-UX-PAIN-DRAIN-001 W1.1: card rediagramado p/ "Custos" (sem balanço)
    'cost-hud-canvas': 'Custos',
    'ecbt-hud-canvas': 'ECBT Score',
    'violations-hud-canvas': 'Compliance',
};

let _initialized = false;
let _config: GeoHudCardConfig = defaultConfig();
let _hud: HTMLElement | null = null;
let _settingsCleanup: (() => void) | null = null;

function _loadConfig(): GeoHudCardConfig {
    try {
        const raw = window.localStorage.getItem(GEO_HUD_ORDER_KEY);
        const parsed = sanitizeConfig(parsePersistedConfig(raw));
        // BOOT-ENTRY-UX-001 RF-C3 (#16): migra usuários existentes que
        // ainda têm o default antigo (bússola/globo no topo) para o novo
        // default (KPIs primeiro). Customizações explícitas são preservadas.
        const migratedOrder = migrateOrderForRfC3(parsed.order);
        if (migratedOrder.join(',') !== parsed.order.join(',')) {
            const migrated = { ...parsed, order: migratedOrder };
            _persistConfig(migrated);
            return migrated;
        }
        return parsed;
    } catch (e: any) {
        console.debug('[geoHudCardOrder:load]', e?.message || e);
        return defaultConfig();
    }
}

function _persistConfig(config: GeoHudCardConfig): void {
    try {
        safeSetItem(GEO_HUD_ORDER_KEY, serializeConfig(config));
    } catch (e: any) {
        console.debug('[geoHudCardOrder:persist]', e?.message || e);
    }
}

/** Aplica ordem ao DOM: reordena os filhos canvas dentro do #geo-hud. */
function _applyOrderToDom(): void {
    if (!_hud) return;
    const cards: HTMLElement[] = [];
    for (const id of _config.order) {
        const el = document.getElementById(id);
        if (el) cards.push(el);
    }
    // Reanexa na nova ordem — appendChild move elementos
    for (const el of cards) {
        _hud.appendChild(el);
    }
}

/**
 * Aplica layout grid (linhas × colunas) ao DOM via CSS Grid.
 * Quando dims=1×1 ou 5×1, preserva flex-column legado (sem grid).
 * Quando dims envolvem ≥2 colunas OR matrix custom, ativa CSS grid.
 */
function _applyGridLayout(): void {
    if (!_hud) return;
    const { rows, cols } = resolveGridDims(_config);
    // GAP_HV_SPLIT: lê rowGap/columnGap separados (fallback legacy gap)
    const rowGap = clampRowGap((_config as any).rowGap ?? (_config as any).gap);
    const columnGap = clampColumnGap((_config as any).columnGap ?? (_config as any).gap);
    if (cols <= 1) {
        _hud.style.display = '';
        // SPEC §21 R21-d compliance: usar CSS vars em vez de inline grid-template-rows.
        // Regra do ratchet é sobre #app mestre, mas regex é global → evitar p/ todo HUD.
        _hud.style.removeProperty('--geo-hud-grid-rows');
        _hud.style.removeProperty('--geo-hud-grid-cols');
        _hud.style.gridTemplateColumns = '';
        _hud.style.gridAutoFlow = '';
        _hud.style.width = '';
        _hud.style.maxWidth = '';
        _hud.style.rowGap = `${rowGap}px`;
        _hud.style.columnGap = `${columnGap}px`;
        _hud.removeAttribute('data-grid');
        _hud.style.right = '44px';
        _hud.style.left = 'auto';
    } else {
        _hud.style.display = 'grid';
        // SPEC §21 R21-d: CSS var local + regra .geo-hud[style*="--geo-hud-grid-rows"]
        // em constellation.css lê a var. Equivalente funcional, mas não é "inline grid-template-rows".
        _hud.style.setProperty('--geo-hud-grid-rows', `repeat(${rows}, auto)`);
        _hud.style.setProperty('--geo-hud-grid-cols', `repeat(${cols}, auto)`);
        _hud.style.gridAutoFlow = 'row';
        _hud.style.rowGap = `${rowGap}px`;
        _hud.style.columnGap = `${columnGap}px`;
        _hud.setAttribute('data-grid', `${rows}x${cols}`);
        const firstCanvas = _hud.querySelector('canvas') as HTMLCanvasElement | null;
        const cellSize = firstCanvas ? Math.max(80, parseFloat(firstCanvas.style.width) || 118) : 118;
        const FRAME = 16;
        const desiredWidth = cellSize * cols + columnGap * (cols - 1) + FRAME;
        _hud.style.width = `${desiredWidth}px`;
        // Clamp ao viewport: se desiredWidth > viewport disponível à direita,
        // re-anchor com left para garantir visibilidade total.
        const viewportW = window.innerWidth || 1280;
        const RIGHT_MARGIN = 44;
        if (desiredWidth + RIGHT_MARGIN > viewportW) {
            _hud.style.left = '8px';
            _hud.style.right = 'auto';
            _hud.style.maxWidth = `${viewportW - 16}px`;
        } else {
            _hud.style.right = `${RIGHT_MARGIN}px`;
            _hud.style.left = 'auto';
            _hud.style.maxWidth = '';
        }
    }
}

/**
 * BOOT-ENTRY-UX-001 RF-C1 (Fase 3, 2026-07-02) — fatia 1:
 * marca cada card com `data-hud-tier="primary|secondary"`.
 *
 * BOOT-ENTRY-UX-001 RF-C1 #14 (2026-07-08): aplica collapse dos secundários
 * (bússola/globo) via classe CSS no container `#geo-hud`. Quando colapsado,
 * os cards secundários ficam recolhidos (display:none via CSS) — o usuário
 * expande com 1 clique no botão de toggle do header. Preferência persistida.
 */
function _applyTierToDom(): void {
    for (const id of DEFAULT_CARD_ORDER) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.setAttribute('data-hud-tier', getHudCardTier(id));
    }
}

/**
 * BOOT-ENTRY-UX-001 RF-C1 #14: aplica estado de collapse dos secundários.
 * Adiciona/remove classe no container `#geo-hud` (CSS controla a visibilidade
 * dos canvas[data-hud-tier="secondary"]). Atualiza o botão de toggle.
 */
function _applySecondaryCollapseToDom(): void {
    if (!_hud) return;
    const collapsed = _config.secondaryCollapsed ?? DEFAULT_SECONDARY_COLLAPSED;
    if (collapsed) {
        _hud.classList.add(HUD_SECONDARY_COLLAPSED_CLASS);
    } else {
        _hud.classList.remove(HUD_SECONDARY_COLLAPSED_CLASS);
    }
    // Atualiza o botão de toggle
    const btn = document.getElementById(COLLAPSE_TOGGLE_BTN_ID);
    if (btn) {
        btn.setAttribute('aria-expanded', String(!collapsed));
        btn.title = collapsed ? 'Mostrar bússola e localização' : 'Ocultar bússola e localização';
    }
}

/**
 * BOOT-ENTRY-UX-001 RF-C1 #14: adiciona botão de toggle (expand/collapse
 * dos cards secundários) no header do geo-hud. Um clique alterna o estado.
 */
function _attachCollapseToggleButton(): void {
    const header = document.getElementById('geo-hud-header');
    if (!header || document.getElementById(COLLAPSE_TOGGLE_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = COLLAPSE_TOGGLE_BTN_ID;
    btn.type = 'button';
    btn.className = 'geo-hud-btn geo-hud-collapse-toggle-btn';
    btn.innerHTML = '&#9654;'; // ▶ triângulo (expande) / muda para ▼ quando expandido
    btn.title = 'Mostrar bússola e localização';
    btn.setAttribute('aria-label', 'Alternar bússola e localização');
    btn.setAttribute('aria-expanded', String(!(_config.secondaryCollapsed ?? DEFAULT_SECONDARY_COLLAPSED)));
    btn.style.pointerEvents = 'auto';
    btn.style.position = 'relative';
    btn.style.zIndex = '5';
    btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        _config = toggleSecondaryCollapse(_config);
        _persistConfig(_config);
        _applySecondaryCollapseToDom();
    });
    // Inserir antes do botão de settings
    const settingsBtn = document.getElementById(SETTINGS_BTN_ID);
    if (settingsBtn) header.insertBefore(btn, settingsBtn);
    else {
        const hideBtn = document.getElementById('geo-hud-hide');
        if (hideBtn) header.insertBefore(btn, hideBtn);
        else header.appendChild(btn);
    }
}

/** Aplica visibilidade ao DOM via class CSS (preserva canvas no DOM p/ resize hooks). */
function _applyVisibilityToDom(): void {
    for (const id of DEFAULT_CARD_ORDER) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (_config.hidden.includes(id)) {
            el.classList.add(HIDDEN_CARD_CLASS);
        } else {
            el.classList.remove(HIDDEN_CARD_CLASS);
        }
    }
}

/** Adiciona drag-handles invisíveis em cada card. */
function _attachDragHandles(): void {
    for (const id of DEFAULT_CARD_ORDER) {
        const card = document.getElementById(id);
        if (!card || (card as any).__geoHudDragBound) continue;
        (card as any).__geoHudDragBound = true;
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', (ev: DragEvent) => _onDragStart(ev, id));
        card.addEventListener('dragover', _onDragOver);
        card.addEventListener('dragleave', _onDragLeave);
        card.addEventListener('drop', (ev: DragEvent) => _onDrop(ev, id));
        card.addEventListener('dragend', _onDragEnd);
    }
}

function _onDragStart(ev: DragEvent, cardId: GeoHudCardId): void {
    if (!ev.dataTransfer) return;
    ev.dataTransfer.setData('text/geo-hud-card', cardId);
    ev.dataTransfer.effectAllowed = 'move';
    const el = document.getElementById(cardId);
    if (el) el.classList.add(DRAGGING_CARD_CLASS);
}

function _onDragOver(ev: DragEvent): void {
    if (!ev.dataTransfer) return;
    const types = ev.dataTransfer.types;
    if (!types || !Array.from(types).includes('text/geo-hud-card')) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    const target = ev.currentTarget as HTMLElement;
    target.classList.add(DROP_TARGET_CLASS);
}

function _onDragLeave(ev: DragEvent): void {
    const target = ev.currentTarget as HTMLElement;
    target.classList.remove(DROP_TARGET_CLASS);
}

function _onDrop(ev: DragEvent, targetCardId: GeoHudCardId): void {
    if (!ev.dataTransfer) return;
    const sourceCardId = ev.dataTransfer.getData('text/geo-hud-card');
    ev.preventDefault();
    const target = ev.currentTarget as HTMLElement;
    target.classList.remove(DROP_TARGET_CLASS);
    if (!sourceCardId || !isCanonicalCardId(sourceCardId) || sourceCardId === targetCardId) return;

    const fromIdx = _config.order.indexOf(sourceCardId);
    const toIdx = _config.order.indexOf(targetCardId);
    if (fromIdx < 0 || toIdx < 0) return;
    _config = { ..._config, order: moveCard(_config.order, fromIdx, toIdx) };
    _persistConfig(_config);
    _applyOrderToDom();
}

function _onDragEnd(): void {
    for (const id of DEFAULT_CARD_ORDER) {
        const el = document.getElementById(id);
        if (!el) continue;
        el.classList.remove(DRAGGING_CARD_CLASS);
        el.classList.remove(DROP_TARGET_CLASS);
    }
}

/** Adiciona botão de configurações ao header do geo-hud. */
function _attachSettingsButton(): void {
    const header = document.getElementById('geo-hud-header');
    if (!header || document.getElementById(SETTINGS_BTN_ID)) return;
    const btn = document.createElement('button');
    btn.id = SETTINGS_BTN_ID;
    btn.type = 'button';
    btn.className = 'geo-hud-btn';
    btn.title = 'Configurar cards do HUD (linhas, colunas, mostrar/ocultar)';
    btn.setAttribute('aria-label', 'Configurar cards do HUD');
    btn.innerHTML = '&#9881;'; // ⚙ gear
    // Defesa: força pointer-events + z-index local para resistir overlays residuais
    btn.style.pointerEvents = 'auto';
    btn.style.position = 'relative';
    btn.style.zIndex = '5';
    btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        _toggleSettingsPopover();
    });
    // Inserir ANTES do botão hide (×) para preservar ordem visual
    const hideBtn = document.getElementById('geo-hud-hide');
    if (hideBtn) header.insertBefore(btn, hideBtn);
    else header.appendChild(btn);
    // Atalho Alt+H como fallback (não depende de click visual)
    if (!(document as any).__geoHudShortcutBound) {
        (document as any).__geoHudShortcutBound = true;
        document.addEventListener('keydown', (ev) => {
            if (ev.altKey && (ev.key === 'h' || ev.key === 'H')) {
                ev.preventDefault();
                _toggleSettingsPopover();
            }
        });
    }
}

function _toggleSettingsPopover(): void {
    const existing = document.getElementById(SETTINGS_POPOVER_ID);
    if (existing) {
        existing.remove();
        if (_settingsCleanup) {
            _settingsCleanup();
            _settingsCleanup = null;
        }
        return;
    }
    _openSettingsPopover();
}

function _openSettingsPopover(): void {
    if (!_hud) return;
    const popover = document.createElement('div');
    popover.id = SETTINGS_POPOVER_ID;
    popover.className = 'geo-hud-settings-popover';
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Configurações do HUD');
    // BUG-POPOVER-CLIPPED: posicionar via JS baseado no botão (não confiar
    // em CSS relative ao parent #geo-hud que tem overflow:auto e recorta).
    const btn = document.getElementById(SETTINGS_BTN_ID);
    if (btn) {
        const btnRect = btn.getBoundingClientRect();
        const GAP = 12;
        const right = window.innerWidth - btnRect.left + GAP;
        const top = btnRect.top;
        popover.style.right = `${Math.max(8, right)}px`;
        popover.style.top = `${Math.max(8, Math.min(window.innerHeight - 280, top))}px`;
        popover.style.left = 'auto';
    } else {
        popover.style.right = '20px';
        popover.style.top = '60px';
    }

    const checkboxesHtml = _config.order
        .map((id) => {
            const checked = !_config.hidden.includes(id);
            const label = CARD_LABELS[id] || id;
            return `
                <label class="geo-hud-settings-row">
                    <input type="checkbox" data-card-id="${escapeHtml(id)}" ${checked ? 'checked' : ''}>
                    <span class="geo-hud-settings-label">${escapeHtml(label)}</span>
                </label>
            `;
        })
        .join('');

    const rowsVal = clampRows(_config.rows);
    const colsVal = clampCols(_config.cols);
    const rowGapVal = clampRowGap((_config as any).rowGap ?? (_config as any).gap);
    const columnGapVal = clampColumnGap((_config as any).columnGap ?? (_config as any).gap);
    popover.innerHTML = `
        <div class="geo-hud-settings-header">
            <strong>HUD Cards</strong>
            <button type="button" class="geo-hud-settings-reset" data-action="reset">Restaurar padrão</button>
        </div>
        <div class="geo-hud-settings-grid">
            <label class="geo-hud-settings-dim">
                <span class="geo-hud-settings-dim-label">Linhas</span>
                <input type="range" min="${MIN_ROWS}" max="${MAX_ROWS}" step="1" value="${rowsVal}" data-dim="rows" aria-label="Número de linhas">
                <span class="geo-hud-settings-dim-value" data-dim-value="rows">${rowsVal}</span>
            </label>
            <label class="geo-hud-settings-dim">
                <span class="geo-hud-settings-dim-label">Colunas</span>
                <input type="range" min="${MIN_COLS}" max="${MAX_COLS}" step="1" value="${colsVal}" data-dim="cols" aria-label="Número de colunas">
                <span class="geo-hud-settings-dim-value" data-dim-value="cols">${colsVal}</span>
            </label>
            <label class="geo-hud-settings-dim">
                <span class="geo-hud-settings-dim-label">Esp. vertical</span>
                <input type="range" min="${MIN_ROW_GAP}" max="${MAX_ROW_GAP}" step="1" value="${rowGapVal}" data-dim="rowGap" aria-label="Espaçamento vertical entre linhas (px)">
                <span class="geo-hud-settings-dim-value" data-dim-value="rowGap">${rowGapVal}</span>
            </label>
            <label class="geo-hud-settings-dim">
                <span class="geo-hud-settings-dim-label">Esp. horizontal</span>
                <input type="range" min="${MIN_COLUMN_GAP}" max="${MAX_COLUMN_GAP}" step="1" value="${columnGapVal}" data-dim="columnGap" aria-label="Espaçamento horizontal entre colunas (px)">
                <span class="geo-hud-settings-dim-value" data-dim-value="columnGap">${columnGapVal}</span>
            </label>
        </div>
        <div class="geo-hud-settings-hint">Marque para mostrar · arraste cards para reordenar</div>
        <!-- HUD-UX-PAIN-DRAIN-001 AR-5 (D27): documentação in-place do grid 2×3 -->
        <div class="geo-hud-settings-hint">Dica: em telas largas, grid 2×3 (Linhas 3 · Colunas 2) aproveita melhor o espaço</div>
        <div class="geo-hud-settings-list">${checkboxesHtml}</div>
    `;

    // Anchor ao document.body para evitar overflow:auto recortar
    document.body.appendChild(popover);

    popover.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-card-id]').forEach((cb) => {
        cb.addEventListener('change', () => {
            const cardId = cb.getAttribute('data-card-id');
            if (!cardId || !isCanonicalCardId(cardId)) return;
            _config = { ..._config, hidden: toggleCardVisibility(_config.hidden, cardId) };
            _persistConfig(_config);
            _applyVisibilityToDom();
            _applyGridLayout(); // re-resolve dims (visibleCount mudou)
        });
    });

    // Sliders rows/cols
    popover.querySelectorAll<HTMLInputElement>('input[type="range"][data-dim]').forEach((slider) => {
        slider.addEventListener('input', () => {
            const dim = slider.getAttribute('data-dim');
            const val = Number(slider.value);
            if (dim === 'rows') {
                _config = { ..._config, rows: clampRows(val) };
            } else if (dim === 'cols') {
                _config = { ..._config, cols: clampCols(val) };
            } else if (dim === 'rowGap') {
                _config = { ..._config, rowGap: clampRowGap(val) } as any;
            } else if (dim === 'columnGap') {
                _config = { ..._config, columnGap: clampColumnGap(val) } as any;
            } else if (dim === 'gap') {
                _config = { ..._config, rowGap: clampRowGap(val), columnGap: clampColumnGap(val) } as any;
            } else {
                return;
            }
            const valueEl = popover.querySelector<HTMLSpanElement>(`[data-dim-value="${dim}"]`);
            if (valueEl) valueEl.textContent = String(val);
            _persistConfig(_config);
            _applyGridLayout();
        });
    });

    const resetBtn = popover.querySelector<HTMLButtonElement>('[data-action="reset"]');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            _config = defaultConfig();
            _persistConfig(_config);
            _applyOrderToDom();
            _applyVisibilityToDom();
            _applyGridLayout();
            popover.remove();
            if (_settingsCleanup) {
                _settingsCleanup();
                _settingsCleanup = null;
            }
        });
    }

    // Close on outside-click + Escape
    const close = () => {
        const existing = document.getElementById(SETTINGS_POPOVER_ID);
        if (existing) existing.remove();
        if (_settingsCleanup) {
            _settingsCleanup();
            _settingsCleanup = null;
        }
    };
    const onDocClick = (ev: MouseEvent) => {
        const target = ev.target as Node;
        if (popover.contains(target)) return;
        const btn = document.getElementById(SETTINGS_BTN_ID);
        if (btn && btn.contains(target)) return;
        close();
    };
    const onEsc = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') close();
    };
    // Adiar para evitar pegar o click que abriu
    setTimeout(() => {
        document.addEventListener('click', onDocClick);
        document.addEventListener('keydown', onEsc);
    }, 0);
    _settingsCleanup = () => {
        document.removeEventListener('click', onDocClick);
        document.removeEventListener('keydown', onEsc);
    };
}

/**
 * Inicializa reorder + settings no #geo-hud. Idempotente.
 * Deve ser chamado APÓS initGeoHud() (que cria/restaura o HUD).
 */
export function initGeoHudCardOrder(): void {
    if (_initialized) return;
    _hud = document.getElementById('geo-hud');
    if (!_hud) return;
    _config = _loadConfig();
    _applyOrderToDom();
    _applyVisibilityToDom();
    _applyTierToDom();
    _applySecondaryCollapseToDom();
    _applyGridLayout();
    _attachDragHandles();
    _attachCollapseToggleButton();
    _attachSettingsButton();
    _initialized = true;
}

/** Reset programático — útil p/ tests. */
export function resetGeoHudCardOrder(): void {
    _config = defaultConfig();
    _persistConfig(_config);
    _applyOrderToDom();
    _applyVisibilityToDom();
    _applyTierToDom();
    _applySecondaryCollapseToDom();
    _applyGridLayout();
}

/** Lê config atual (read-only snapshot). */
export function getGeoHudCardConfigSnapshot(): GeoHudCardConfig {
    return {
        order: [..._config.order],
        hidden: [..._config.hidden],
        rows: _config.rows,
        cols: _config.cols,
        rowGap: _config.rowGap,
        columnGap: _config.columnGap,
        secondaryCollapsed: _config.secondaryCollapsed ?? DEFAULT_SECONDARY_COLLAPSED,
    };
}

export { GEO_HUD_ORDER_KEY };
