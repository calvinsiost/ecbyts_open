// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   FILTER PANEL — Global quick-filter popup para modelo 3D + listas
   Painel de filtragem rapida por familia, campanha e parametro

   Arquitetura:
   - Panel popup de posicao:fixed, ancorado no botao HUD
   - Estado persistido em localStorage('ecbyts-global-filter')
   - Apply usa setElementVisibility() do elements manager (ja sincroniza mesh)
   - Clear restaura apenas os elementos que o filtro ocultou (preserva visib. manual)
   - Dispara CustomEvent 'globalFilterChanged' para analytics recalcular
   ================================================================ */
import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { CONFIG } from '../../config.js';
// ----------------------------------------------------------------
// CONSTANTES
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-global-filter';
// ----------------------------------------------------------------
// ESTADO DO MODULO
// ----------------------------------------------------------------
/** @type {HTMLElement|null} */
let _panelEl: any = null;
/**
 * Estado atual do filtro.
 * @type {{ families: string[], campaigns: string[], parameters: string[] }}
 */
let _filterState = { families: [], campaigns: [], parameters: [] };
/**
 * IDs de elementos que FORAM ocultados pelo filtro global (para Clear seletivo).
 * @type {Set<string>}
 */
let _hiddenByFilter = new Set();
/**
 * Cached module references (populados no initFilterPanel).
 * Evita dynamic imports repetidos em _collectModelData e applyGlobalFilter.
 */
let _getAllElements: any = null;
let _setElementVisibility: any = null;
let _getAllCampaigns: any = null;
let _syncLabels: any = null;
let _initialized = false;
let _initPromise: Promise<void> | null = null;
// ----------------------------------------------------------------
// INIT
// ----------------------------------------------------------------
/**
 * Initialize filter panel - load persisted state from localStorage.
 * Chamado uma vez no init da aplicacao.
 */
export async function initFilterPanel() {
    if (_initialized) return;
    if (_initPromise) return _initPromise;
    _initPromise = _initFilterPanel().finally(() => {
        _initPromise = null;
    });
    await _initPromise;
}

async function _initFilterPanel() {
    // Pre-cache manager functions para uso sync no _collectModelData
    try {
        const elemMgr = await import('../../core/elements/manager.js' as string);
        _getAllElements = elemMgr.getAllElements;
        _setElementVisibility = elemMgr.setElementVisibility;
    } catch (e: any) {
        console.debug('[filterPanel] elements-manager-import:', e?.message || e);
        /* non-critical */
    }
    try {
        const campMgr = await import('../../core/campaigns/manager.js' as string);
        _getAllCampaigns = campMgr.getAllCampaigns;
    } catch (e: any) {
        console.debug('[filterPanel] campaigns-manager-import:', e?.message || e);
        /* non-critical */
    }
    try {
        const labelsMgr = await import('../labels/manager.js' as string);
        _syncLabels = labelsMgr.syncLabels;
    } catch (e: any) {
        console.debug('[filterPanel] labels-manager-import:', e?.message || e);
        /* labels module nao carregado ainda — ok */
    }
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            _filterState = {
                families: Array.isArray(parsed.families) ? parsed.families : [],
                campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
                parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
            };
            _updateBadge();
        }
    } catch (e: any) {
        console.debug('[filterPanel] state-restore:', e?.message || e);
        _filterState = { families: [], campaigns: [], parameters: [] };
    }
    // Fechar panel ao clicar fora
    document.addEventListener('mousedown', _onDocumentMouseDown);
    // Fechar com Escape (listener global - nao depende de foco no panel)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _panelEl) {
            closeFilterPanel();
            document.getElementById('filter-panel-btn')?.focus();
        }
    });
    // Auto-clear ao carregar novo modelo
    document.addEventListener('modelLoaded', clearGlobalFilter);
    document.addEventListener('modelImported', clearGlobalFilter);
    _initialized = true;
    _initPromise = null;
}
// ----------------------------------------------------------------
// OPEN / CLOSE
// ----------------------------------------------------------------
/**
 * Open or toggle the filter panel.
 * @param {HTMLElement|Event} anchorOrEvent - Botao HUD ou evento do click
 */
export async function openFilterPanel(anchorOrEvent: any) {
    await initFilterPanel();
    const anchor =
        anchorOrEvent instanceof Event
            ? anchorOrEvent.currentTarget || document.getElementById('filter-panel-btn')
            : anchorOrEvent;
    if (_panelEl) {
        closeFilterPanel();
        return;
    }
    _panelEl = _buildPanel();
    document.body.appendChild(_panelEl);
    _positionPanel(anchor);
    _panelEl.querySelector('.fp-close-btn')?.focus();
}
/**
 * Close the filter panel if open.
 */
export function closeFilterPanel() {
    if (_panelEl) {
        _panelEl.remove();
        _panelEl = null;
    }
}
/** @private @param {MouseEvent} e */
function _onDocumentMouseDown(e: any) {
    if (!_panelEl) return;
    const target = e.target;
    if (!_panelEl.contains(target) && target?.id !== 'filter-panel-btn') {
        closeFilterPanel();
    }
}
// ----------------------------------------------------------------
// BUILD PANEL DOM
// ----------------------------------------------------------------
/** @private */
function _buildPanel() {
    const panel = document.createElement('div');
    panel.className = 'fp-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', t('filterPanelTitle') || 'Filtros de Dados');
    // Keyboard: Escape fecha
    panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeFilterPanel();
            document.getElementById('filter-panel-btn')?.focus();
        }
    });
    // Header
    const header = document.createElement('div');
    header.className = 'fp-header';
    const titleIcon = document.createElement('span');
    titleIcon.className = 'icon';
    titleIcon.dataset.icon = 'filter';
    titleIcon.dataset.iconSize = '14px';
    const titleText = document.createElement('span');
    titleText.textContent = t('filterPanelTitle') || 'Filtros de Dados';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'fp-close-btn';
    closeBtn.setAttribute('aria-label', 'Fechar');
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => {
        closeFilterPanel();
        document.getElementById('filter-panel-btn')?.focus();
    });
    header.appendChild(titleIcon);
    header.appendChild(titleText);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    // Secoes de chips
    const { families, campaigns, parameters } = _collectModelData();
    if (families.length === 0 && campaigns.length === 0 && parameters.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'fp-empty';
        empty.textContent = t('filterNoElements') || 'Nenhum elemento carregado.';
        panel.appendChild(empty);
    } else {
        if (families.length > 0) {
            panel.appendChild(
                _buildSection(t('filterPanelFamilies') || 'FAMILIAS', families, _filterState.families, 'families'),
            );
        }
        if (campaigns.length > 0) {
            panel.appendChild(
                _buildSection(t('filterPanelCampaigns') || 'CAMPANHAS', campaigns, _filterState.campaigns, 'campaigns'),
            );
        }
        if (parameters.length > 0) {
            panel.appendChild(
                _buildSection(
                    t('filterPanelParams') || 'PARAMETROS',
                    parameters,
                    _filterState.parameters,
                    'parameters',
                ),
            );
        }
    }
    // Footer
    const footer = document.createElement('div');
    footer.className = 'fp-footer';
    const presetsBtn = document.createElement('button');
    presetsBtn.type = 'button';
    presetsBtn.className = 'fp-footer-btn fp-footer-btn--secondary';
    presetsBtn.textContent = t('filterPresetsBtn') || 'Presets Salvos...';
    presetsBtn.addEventListener('click', async () => {
        closeFilterPanel();
        try {
            const { openFilterPresetModal } = await import('./filterPresetModal.js' as string);
            openFilterPresetModal();
        } catch (_err: any) {
            showToast('Filter presets unavailable', 'error');
        }
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'fp-footer-btn fp-footer-btn--secondary';
    clearBtn.textContent = t('clearFilters') || 'Limpar';
    clearBtn.addEventListener('click', () => {
        clearGlobalFilter();
        closeFilterPanel();
    });
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'fp-footer-btn fp-footer-btn--primary';
    applyBtn.textContent = t('applyFilters') || 'Aplicar';
    applyBtn.addEventListener('click', () => {
        const state = _readPanelState(panel);
        applyGlobalFilter(state);
        closeFilterPanel();
    });
    footer.appendChild(presetsBtn);
    footer.appendChild(clearBtn);
    footer.appendChild(applyBtn);
    panel.appendChild(footer);
    return panel;
}
/**
 * Build a chip section (families / campaigns / parameters).
 * @param {string} label - Section label
 * @param {Array<{id:string,label:string}>} items - Available items
 * @param {string[]} items - IDs currently excluded (in filter state)
 * @param {string} activeExclusions - 'families' | 'campaigns' | 'parameters'
 * @returns {HTMLElement}
 */
function _buildSection(label: any, items: any, activeExclusions: any, dimension: any) {
    const section = document.createElement('div');
    section.className = 'fp-section';
    section.dataset.dimension = dimension;
    const sectionLabel = document.createElement('div');
    sectionLabel.className = 'fp-section-label';
    sectionLabel.textContent = label;
    section.appendChild(sectionLabel);
    const chips = document.createElement('div');
    chips.className = 'fp-chips';
    for (const item of items) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'fp-chip';
        chip.dataset.id = item.id;
        chip.dataset.dimension = dimension;
        chip.textContent = item.label;
        // Chip ativo = NAO esta nas exclusoes (sera mostrado), inativo = excluido
        const excluded = activeExclusions.includes(item.id);
        chip.setAttribute('aria-pressed', excluded ? 'false' : 'true');
        if (!excluded) chip.classList.add('fp-chip--active');
        chip.addEventListener('click', () => {
            const isActive = chip.classList.contains('fp-chip--active');
            if (isActive) {
                chip.classList.remove('fp-chip--active');
                chip.setAttribute('aria-pressed', 'false');
            } else {
                chip.classList.add('fp-chip--active');
                chip.setAttribute('aria-pressed', 'true');
            }
        });
        chips.appendChild(chip);
    }
    section.appendChild(chips);
    return section;
}
/**
 * Read current chip state from panel DOM.
 * Retorna as exclusoes (chips inativos = excluidos do filtro).
 * @param {HTMLElement} panel
 * @returns {{ families: string[], campaigns: string[], parameters: string[] }}
 */
function _readPanelState(panel: any) {
    const state = { families: [], campaigns: [], parameters: [] };
    const chips = panel.querySelectorAll('.fp-chip');
    for (const chip of chips) {
        if (!chip.classList.contains('fp-chip--active')) {
            const dim = chip.dataset.dimension || '';
            if (dim && (state as any)[dim] !== undefined) {
                (state as any)[dim].push(chip.dataset.id);
            }
        }
    }
    return state;
}
// ----------------------------------------------------------------
// POSICIONAMENTO DO PANEL
// ----------------------------------------------------------------
/** @private @param {HTMLElement|null} anchor */
function _positionPanel(anchor: any) {
    if (!_panelEl || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const panelW = 280;
    const panelMaxH = 480;
    const marginPx = 4;
    // Horizontal: align left with button, clamp to viewport
    let left = rect.left;
    if (left + panelW > window.innerWidth - marginPx) {
        left = window.innerWidth - panelW - marginPx;
    }
    if (left < marginPx) left = marginPx;
    // Vertical: open below if the full panel fits; otherwise open above
    const spaceBelow = window.innerHeight - rect.bottom - marginPx;
    const spaceAbove = rect.top - marginPx;
    /** @type {any} */ let top;
    if (spaceBelow >= panelMaxH) {
        // Full panel fits below - preferred
        top = rect.bottom + marginPx;
    } else if (spaceAbove >= panelMaxH) {
        // Full panel fits above
        top = rect.top - panelMaxH - marginPx;
    } else if (spaceBelow >= spaceAbove) {
        // More space below than above - open below, panel will scroll internally
        top = rect.bottom + marginPx;
    } else {
        // More space above - open above, clamp to viewport top
        top = Math.max(marginPx, rect.top - panelMaxH - marginPx);
    }
    _panelEl.style.top = `${top}px`;
    _panelEl.style.left = `${left}px`;
}
// ----------------------------------------------------------------
// COLETAR DADOS DO MODELO ATUAL
// ----------------------------------------------------------------
/**
 * Collect unique families, campaigns and parameters from loaded elements.
 * Uses cached module refs from initFilterPanel.
 * @returns {{ families: Array<{id:any,label:any}>, campaigns: Array<{id:any,label:any}>, parameters: Array<{id:any,label:any}> }}
 */
function _collectModelData() {
    const elements = typeof _getAllElements === 'function' ? _getAllElements() : [];
    const campaigns = typeof _getAllCampaigns === 'function' ? _getAllCampaigns() : [];
    // Unique families from elements
    const familyIds = [...new Set(elements.map((el: any) => el.familyId || el.family).filter(Boolean))];
    const allFamilies = { ...((CONFIG as any).DEFAULT_FAMILIES || {}) };
    const familyItems = familyIds.map((id: any) => ({
        id,
        label: allFamilies[id]?.name || id,
    }));
    // Unique campaigns from elements' observations
    /** @type {Map<string, string>} */
    const campMap = new Map();
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            if (obs.campaignId && !campMap.has(obs.campaignId)) {
                const camp = campaigns.find((c: any) => c.id === obs.campaignId);
                campMap.set(obs.campaignId, camp?.name || obs.campaignId);
            }
        }
    }
    const campaignItems = [...campMap.entries()].map(([id, label]) => ({ id, label }));
    // Unique parameters from observations
    /** @type {Map<string, string>} */
    const paramMap = new Map();
    for (const el of elements) {
        for (const obs of el.data?.observations || []) {
            if (obs.parameterId && !paramMap.has(obs.parameterId)) {
                const paramDef = (CONFIG.PARAMETERS || []).find((p: any) => p.id === obs.parameterId);
                paramMap.set(obs.parameterId, paramDef?.name || obs.parameterId);
            }
        }
    }
    const parameterItems = [...paramMap.entries()].map(([id, label]) => ({ id, label }));
    return { families: familyItems, campaigns: campaignItems, parameters: parameterItems };
}
// ----------------------------------------------------------------
// APPLY / CLEAR
// ----------------------------------------------------------------
/**
 * Apply global filter - set element visibility based on filter state.
 * Apenas oculta elementos que NAO passam nos criterios ativos.
 * @param {{ families: string[], campaigns: string[], parameters: string[] }} state
 */
export async function applyGlobalFilter(state: any) {
    try {
        // Use cached refs from initFilterPanel; fallback to dynamic import if not ready
        const getAllElements =
            _getAllElements ||
            (await import('../../core/elements/manager.js' as string).then((m) => {
                _getAllElements = m.getAllElements;
                _setElementVisibility = m.setElementVisibility;
                return m.getAllElements;
            }));
        const setElementVisibility =
            _setElementVisibility ||
            (await import('../../core/elements/manager.js' as string).then((m) => m.setElementVisibility));
        const elements = getAllElements();
        const newHidden = new Set();
        for (const el of elements) {
            const famId = el.familyId || el.family;
            const famOk = state.families.length === 0 || !state.families.includes(famId);
            const campOk =
                state.campaigns.length === 0 ||
                !state.campaigns.length ||
                _elementHasCampaign(el, state.campaigns, false);
            const paramOk =
                state.parameters.length === 0 ||
                !state.parameters.length ||
                _elementHasParameter(el, state.parameters, false);
            const visible = famOk && campOk && paramOk;
            if (!visible) {
                newHidden.add(el.id);
            }
            setElementVisibility(el.id, visible);
        }
        _hiddenByFilter = newHidden;
        _filterState = { ...state };
        _saveState(state);
        _updateBadge();
        // Sincronizar labels: CSS2DRenderer nao herda visibilidade do mesh pai,
        // entao e necessario reconstruir labels apenas para elementos visiveis
        _refreshLabels();
        document.dispatchEvent(new CustomEvent('globalFilterChanged', { detail: state }));
        showToast(t('filtersApplied') || 'Filtros aplicados', 'success', 2000);
    } catch (err: any) {
        showToast('Filter apply failed', 'error');
        console.error('[filterPanel] applyGlobalFilter error', err);
    }
}
/**
 * Elemento passa no filtro de campanha se tem ALGUMA obs com campaignId
 * que NAO esta excluido (excluded = incluido na lista de exclusoes = inativo).
 * @param {any} el
 * @param {string[]} excludedCampaigns - Campanhas excluidas
 * @param {boolean} [_mustHave] - true = deve ter obs de campanha incluida
 * @returns {boolean}
 */
function _elementHasCampaign(el: any, excludedCampaigns: any, _mustHave: any) {
    const obs = el.data?.observations || [];
    if (obs.length === 0) return false; // sem obs = nao passa quando filtro ativo
    return obs.some((o: any) => o.campaignId && !excludedCampaigns.includes(o.campaignId));
}
/**
 * Elemento passa no filtro de parametro se tem ALGUMA obs com parameterId
 * que NAO esta excluido.
 * @param {any} el
 * @param {string[]} excludedParams - Parametros excluidos
 * @param {boolean} [_mustHave]
 * @returns {boolean}
 */
function _elementHasParameter(el: any, excludedParams: any, _mustHave: any) {
    const obs = el.data?.observations || [];
    if (obs.length === 0) return false;
    return obs.some((o: any) => o.parameterId && !excludedParams.includes(o.parameterId));
}
/**
 * Clear global filter - restaura apenas os elementos que o filtro ocultou.
 * Visibilidade manual do usuario e preservada.
 */
export async function clearGlobalFilter() {
    try {
        await initFilterPanel();
        if (_hiddenByFilter.size > 0) {
            const setEV =
                _setElementVisibility ||
                (await import('../../core/elements/manager.js' as string).then((m) => {
                    _setElementVisibility = m.setElementVisibility;
                    return m.setElementVisibility;
                }));
            for (const id of _hiddenByFilter) {
                setEV(id, true);
            }
        }
        _hiddenByFilter = new Set();
        _filterState = { families: [], campaigns: [], parameters: [] };
        _saveState(_filterState);
        _updateBadge();
        // Sincronizar labels apos restaurar visibilidade
        _refreshLabels();
        document.dispatchEvent(new CustomEvent('globalFilterChanged', { detail: _filterState }));
    } catch (err: any) {
        console.error('[filterPanel] clearGlobalFilter error', err);
    }
}
/**
 * Get current filter state.
 * @returns {{ families: string[], campaigns: string[], parameters: string[] }}
 */
export function getFilterState() {
    return { ..._filterState };
}
/**
 * Rebuild labels respecting current element visibility.
 * CSS2DRenderer does not inherit parent (mesh) visibility for CSS2DObjects,
 * so labels of hidden elements must be explicitly removed via syncLabels().
 * @private
 */
function _refreshLabels() {
    if (typeof _syncLabels === 'function') {
        _syncLabels();
    } else {
        // Lazy-load se nao pre-cacheado ainda
        import('../labels/manager.js' as string)
            .then((m) => {
                _syncLabels = m.syncLabels;
                if (typeof m.isLabelsEnabled === 'function' && m.isLabelsEnabled()) {
                    m.syncLabels();
                }
            })
            .catch((_e) => console.debug('[utils/ui/filterPanel:silent-catch]', _e?.message || _e));
    }
}
// ----------------------------------------------------------------
// BADGE UPDATE
// ----------------------------------------------------------------
/** @private */
function _updateBadge() {
    const badge = document.getElementById('filter-panel-badge');
    const btn = document.getElementById('filter-panel-btn');
    if (!badge) return;
    // Count dimensoes ativas (com pelo menos 1 exclusao)
    const count =
        (_filterState.families.length > 0 ? 1 : 0) +
        (_filterState.campaigns.length > 0 ? 1 : 0) +
        (_filterState.parameters.length > 0 ? 1 : 0);
    if (count > 0) {
        badge.textContent = String(count);
        badge.removeAttribute('hidden');
        btn?.classList.add('scene-hud-btn--active');
    } else {
        badge.setAttribute('hidden', '');
        badge.textContent = '';
        btn?.classList.remove('scene-hud-btn--active');
    }
}
// ----------------------------------------------------------------
// PERSISTENCIA
// ----------------------------------------------------------------
/** @private @param {any} state */
function _saveState(state: any) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e: any) {
        console.debug('[filterPanel] state-save:', e?.message || e);
        // quota - ignora
    }
}
