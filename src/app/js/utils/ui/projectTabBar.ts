// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   PROJECT TAB BAR — Phase 1
   (SPEC_PROJECT_TABS_IMPLEMENTATION — UI layer)

   Renderiza uma barra de abas de projetos acima do menubar.
   Ativa apenas quando CONFIG.FEATURES.PROJECT_TABS === true.

   Usa core/projectTabs/tabRegistry (pure-logic) + localStorage
   para persistência de sessão (Phase 2 migra para IDB).

   Handlers públicos em utils/handlers/projectTabs.js:
   - window.handleOpenProjectTab(opts?)
   - window.handleCloseProjectTab(id)
   - window.handleSwitchProjectTab(id)
   - window.handlePinProjectTab(id)
   - window.handleRenameProjectTab(id, name)
   ================================================================ */
import { CONFIG } from '../../config.js';
import { createTabRegistry } from '../../core/projectTabs/tabRegistry.js';
import { TAB_STATE } from '../../core/projectTabs/tabFsm.js';
import {
    saveTabsToIDB,
    loadTabsFromIDB,
    pruneArchivedTabs,
    getTabRuntimeSnapshotKey,
    saveTabRuntimeSnapshot,
    loadTabRuntimeSnapshot,
    deleteTabRuntimeSnapshot,
} from '../../core/projectTabs/idbAdapter.js';
import { createBroadcastAdapter } from '../../core/projectTabs/broadcastAdapter.js';
import { buildModel } from '../../core/io/export.js';
import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
const BAR_ID = 'project-tab-bar';
const LS_KEY = 'ecbyts-project-tabs-session'; // Phase 1 fallback (ainda lido na migração)
const MAX_OPEN = 8;
const BC_CHANNEL_NAME = 'ecbyts-project-tabs';
const HIBERNATION_DELAY_MS = 30 * 1000;
const PROJECT_TABS_IDB_SAVE_FALLBACK_MS = 750;
const PROJECT_TABS_IDB_SAVE_IDLE_TIMEOUT_MS = 2500;
const PROJECT_TABS_AUTOSAVE_USER_ID = 'project-tabs-runtime';
const COMPACT_LS_KEY = 'ecbyts-project-tabs-compact';
const PROJECT_TAB_BAR_EXPANDED_HEIGHT = '36px';
const PROJECT_TAB_BAR_COMPACT_HEIGHT = '0px';
/** @type {any} */
let _registry: any = null;
/** @type {string|null} */
let _activeTabId: any = null;
/** @type {HTMLElement|null} */
let _mountPoint: any = null;
/** @type {any} */
let _broadcastAdapter: any = null;
let _isCompact = false;
let _compactPreferenceLoaded = false;
let _shortcutBound = false;
const _hibernationTimers = new Map();
const _runtimeSnapshots = new Map();
const _autosaveLaneBindingInFlight = new Map();
let _pendingIdbSavePayload: any = null;
let _pendingIdbSaveSignature: any = null;
let _pendingIdbSaveTimer: any = null;
let _pendingIdbIdleHandle: any = null;
let _inflightProjectTabsIdbSaveSignature: any = null;
let _lastProjectTabsIdbSaveSignature: any = null;
// ── Registry bootstrap ──────────────────────────────────────────────────────
function _createRegistry() {
    return createTabRegistry({ maxOpen: MAX_OPEN, maxArchived: 20 });
}
/**
 * Reabre uma aba a partir de seus dados serializados e ajusta seu estado.
 * @param {any} tabData
 * @returns {any|null} Aba aberta ou null se fechada/ignorada.
 */
function _rehydrateTab(tabData: any) {
    if (tabData.state === TAB_STATE.CLOSED) return null;
    const opened = _registry.openTab({
        modelId: tabData.modelId || null,
        title: tabData.title || 'Projeto',
        metadata: tabData.metadata || {},
    });
    if (tabData.state === TAB_STATE.PINNED) {
        _registry.pinTab(opened.id);
    } else if (tabData.state === TAB_STATE.ARCHIVED) {
        _registry.archiveTab(opened.id);
    }
    return opened;
}

/**
 * Atualiza a aba ativa a partir de um snapshot, se ainda existir.
 * @param {string|null} activeTabId
 */
function _setActiveTabFromSnapshot(activeTabId: any) {
    if (!activeTabId) return;
    const active = _registry.getTab(activeTabId);
    if (active && active.state !== TAB_STATE.CLOSED) {
        _activeTabId = activeTabId;
    }
}

/**
 * Carrega snapshot do localStorage e reconstitui registry. Idempotente.
 */
function _loadSession() {
    if (_registry) return;
    _registry = _createRegistry();
    try {
        const raw = localStorage.getItem(LS_KEY) || '';
        if (!raw) return;
        const snap = JSON.parse(raw);
        if (!snap || snap.version !== 1 || !Array.isArray(snap.tabs)) return;
        for (const tabData of snap.tabs) {
            try {
                _rehydrateTab(tabData);
            } catch (e: any) {
                console.debug(
                    '[projectTabBar] loadSession openTab skipped (limit?):',
                    /** @type {any} */ e?.message || e,
                );
                // Ignora abas que não cabem (limite) - continua as restantes
            }
        }
        _setActiveTabFromSnapshot(snap.activeTabId);
    } catch (_: any) {
        _registry = _createRegistry();
    }
}
/**
 * Persiste snapshot da sessão atual no localStorage (Phase 1 fallback)
 * e de forma assíncrona no IDB (Phase 2 durável).
 */
function _clearProjectTabsIdbSaveTimers() {
    if (_pendingIdbSaveTimer) {
        clearTimeout(_pendingIdbSaveTimer);
        _pendingIdbSaveTimer = null;
    }
    if (_pendingIdbIdleHandle && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(_pendingIdbIdleHandle);
    }
    _pendingIdbIdleHandle = null;
}

function _getProjectTabsPayloadSignature(payload: any) {
    try {
        return JSON.stringify(payload || null);
    } catch {
        return null;
    }
}

function _flushProjectTabsIdbSave() {
    const payload = _pendingIdbSavePayload;
    const signature = _pendingIdbSaveSignature;
    _pendingIdbSavePayload = null;
    _pendingIdbSaveSignature = null;
    _clearProjectTabsIdbSaveTimers();
    if (!payload) return;
    if (
        signature &&
        (signature === _lastProjectTabsIdbSaveSignature || signature === _inflightProjectTabsIdbSaveSignature)
    ) {
        return;
    }
    _inflightProjectTabsIdbSaveSignature = signature;
    saveTabsToIDB(payload)
        .then((saved: any) => {
            if (saved && signature) {
                _lastProjectTabsIdbSaveSignature = signature;
            }
        })
        .catch((/** @type {any} */ e) =>
            console.debug('[projectTabBar] IDB persist failed (non-fatal)', e?.message || e),
        )
        .finally(() => {
            if (_inflightProjectTabsIdbSaveSignature === signature) {
                _inflightProjectTabsIdbSaveSignature = null;
            }
        });
}

function _scheduleProjectTabsIdbSave(payload: any) {
    const signature = _getProjectTabsPayloadSignature(payload);
    if (
        signature &&
        (signature === _pendingIdbSaveSignature ||
            signature === _lastProjectTabsIdbSaveSignature ||
            signature === _inflightProjectTabsIdbSaveSignature)
    ) {
        return;
    }
    _pendingIdbSavePayload = payload;
    _pendingIdbSaveSignature = signature;
    _clearProjectTabsIdbSaveTimers();
    _pendingIdbSaveTimer = setTimeout(_flushProjectTabsIdbSave, PROJECT_TABS_IDB_SAVE_FALLBACK_MS);
    if (typeof window === 'undefined' || typeof window.requestIdleCallback !== 'function') return;
    _pendingIdbIdleHandle = window.requestIdleCallback(_flushProjectTabsIdbSave, {
        timeout: PROJECT_TABS_IDB_SAVE_IDLE_TIMEOUT_MS,
    });
}

function _saveSession() {
    if (!_registry) return;
    const snap = _registry.snapshot();
    const payload = { ...snap, activeTabId: _activeTabId };
    // Phase 1 fallback: localStorage para leitura síncrona inicial
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch (e: any) {
        console.debug('[projectTabBar] saveSession localStorage quota:', /** @type {any} */ e?.message || e);
        // Silencia quota errors
    }
    // Phase 2: IDB para persistência durável entre reloads
    _scheduleProjectTabsIdbSave(payload);
}

function _loadCompactPreference() {
    if (_compactPreferenceLoaded) return;
    _compactPreferenceLoaded = true;
    try {
        _isCompact = localStorage.getItem(COMPACT_LS_KEY) === '1';
    } catch (e: any) {
        console.debug('[projectTabBar] compact preference read failed:', /** @type {any} */ e?.message || e);
        _isCompact = false;
    }
}

function _saveCompactPreference() {
    try {
        localStorage.setItem(COMPACT_LS_KEY, _isCompact ? '1' : '0');
    } catch (e: any) {
        console.debug('[projectTabBar] compact preference save failed:', /** @type {any} */ e?.message || e);
    }
}

function _syncProjectTabBarLayout() {
    if (!_mountPoint) return;
    _mountPoint.classList.toggle('project-tab-bar--compact', _isCompact);
    // A11Y (aria-required-children): role="toolbar" (não "tablist"). A barra mistura
    // controles que NÃO são abas WAI-ARIA (botões "+"/recolher com aria-controls/
    // aria-label) e não há tabpanels vinculados — um tablist exigiria filhos só
    // role="tab", o que disparava aria-required-children. toolbar não tem filhos
    // obrigatórios e descreve melhor a faixa (botões + itens de projeto).
    _mountPoint.setAttribute('role', 'toolbar');
    _mountPoint.setAttribute('aria-expanded', _isCompact ? 'false' : 'true');
    _mountPoint.setAttribute('data-compact', _isCompact ? 'true' : 'false');
    try {
        document.body.style.setProperty(
            '--project-tab-bar-height',
            _isCompact ? PROJECT_TAB_BAR_COMPACT_HEIGHT : PROJECT_TAB_BAR_EXPANDED_HEIGHT,
        );
    } catch (e: any) {
        console.debug('[projectTabBar] layout sync failed:', /** @type {any} */ e?.message || e);
    }
}

function _setProjectTabBarCompact(compact: any) {
    _loadCompactPreference();
    _isCompact = !!compact;
    _saveCompactPreference();
    renderProjectTabBar();
    _dispatchProjectTabEvent('projectTabBar:compactChanged', { compact: _isCompact });
}

function _bindProjectTabBarShortcuts() {
    if (_shortcutBound || typeof document === 'undefined') return;
    _shortcutBound = true;
    document.addEventListener('keydown', (event: KeyboardEvent) => {
        const key = String(event.key || '').toLowerCase();
        if (!event.altKey || !event.shiftKey || key !== 'p') return;
        event.preventDefault();
        _setProjectTabBarCompact(!_isCompact);
    });
}

function _bindProjectTabBarClickHandlers(bar: HTMLElement) {
    if (bar.dataset.ptabClickBound === 'true') return;
    bar.dataset.ptabClickBound = 'true';
    bar.addEventListener('click', (event: MouseEvent) => {
        const target = event.target instanceof Element ? event.target.closest('[data-ptab-action]') : null;
        const action = target?.getAttribute('data-ptab-action') || '';
        if (!action) return;
        event.stopPropagation();
        if (action === 'collapse') {
            collapseProjectTabBar();
        } else if (action === 'expand') {
            expandProjectTabBar();
        } else if (action === 'new') {
            const w = window as any;
            if (typeof w.handleOpenProjectTab === 'function') {
                w.handleOpenProjectTab();
            } else {
                openProjectTab();
            }
        }
    });
}
/**
 * Publica evento de mudança para outras janelas via BroadcastChannel.
 * @param {string} type  ex: 'open-tab', 'close-tab', 'archive-tab', etc.
 * @param {any} [payload]
 */
function _broadcastChange(type: any, payload: any = null) {
    if (!_broadcastAdapter || _broadcastAdapter.isClosed()) return;
    try {
        _broadcastAdapter.publish(type, payload);
    } catch (e: any) {
        console.debug('[projectTabBar] broadcast failed (non-fatal)', /** @type {any} */ e?.message || e);
    }
}
/**
 * Inicializa o BroadcastAdapter (idempotente).
 * Em ambientes sem BroadcastChannel (Node, SSR) é silenciosamente ignorado.
 */
function _initBroadcastAdapter() {
    if (_broadcastAdapter && !_broadcastAdapter.isClosed()) return;
    if (typeof BroadcastChannel === 'undefined') return;
    try {
        const channel = new BroadcastChannel(BC_CHANNEL_NAME);
        _broadcastAdapter = createBroadcastAdapter({ channel });
        // Recebe mudanças de outras janelas e re-renderiza
        _broadcastAdapter.subscribe((_env: any) => {
            // Recarregar do IDB e re-renderizar para manter sincronismo
            loadTabsFromIDB()
                .then((/** @type {any} */ snap) => _syncRegistryFromSnapshot(snap))
                .then(() => renderProjectTabBar())
                .catch((/** @type {any} */ e) =>
                    console.debug(
                        '[projectTabBar] BroadcastChannel message handler failed (non-fatal)',
                        e?.message || e,
                    ),
                );
        });
    } catch (e: any) {
        console.debug('[projectTabBar] BroadcastChannel init failed (non-fatal)', /** @type {any} */ e?.message || e);
    }
}
/**
 * Sincroniza o registry a partir de um snapshot serializado.
 * @param {any} snap
 */
function _syncRegistryFromSnapshot(snap: any) {
    if (!snap || !Array.isArray(snap.tabs)) return;
    _registry = _createRegistry();
    const pruned = pruneArchivedTabs(snap.tabs);
    for (const tabData of pruned) {
        try {
            _rehydrateTab(tabData);
        } catch (e: any) {
            console.debug(
                '[projectTabBar] syncRegistryFromSnapshot openTab skipped:',
                /** @type {any} */ e?.message || e,
            );
            /* limite — pula */
        }
    }
    _setActiveTabFromSnapshot(snap.activeTabId);
}

/**
 * Carrega snapshot do IDB e reconstitui registry de forma assíncrona.
 * Usado no bootstrap do initProjectTabBar() para restaurar estado após F5.
 * Retorna true se alguma aba foi restaurada do IDB, false caso contrário.
 *
 * @returns {Promise<boolean>}
 */
async function _restoreFromIDB() {
    try {
        const snap = await loadTabsFromIDB();
        if (!snap || !Array.isArray(snap.tabs) || snap.tabs.length === 0) return false;
        _syncRegistryFromSnapshot(snap);
        return _registry.listOpen().length > 0;
    } catch (e: any) {
        console.debug('[projectTabBar] restoreFromIDB failed:', /** @type {any} */ e?.message || e);
        return false;
    }
}
// ── DOM ─────────────────────────────────────────────────────────────────────
// Hibernation/autosave helpers.
/** @param {any} tab */
function _isTabHibernated(tab: any) {
    return tab?.metadata?.hibernation?.state === 'hibernated';
}
/** @param {string} tabId */
function _cancelHibernationTimer(tabId: any) {
    const timer = _hibernationTimers.get(tabId);
    if (timer) {
        clearTimeout(timer);
        _hibernationTimers.delete(tabId);
    }
}
/** @param {string} name @param {any} detail */
function _dispatchProjectTabEvent(name: any, detail: any) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(name, { detail }));
}
/** @param {any} tab */
function _captureProjectSnapshot(tab: any) {
    try {
        if (typeof window !== 'undefined' && typeof window.__projectTabsCaptureSnapshot === 'function') {
            const injected = window.__projectTabsCaptureSnapshot({
                tabId: tab.id,
                modelId: tab.modelId || null,
                title: tab.title,
            });
            if (injected && typeof injected === 'object') return injected;
        }
    } catch (e: any) {
        console.debug('[projectTabBar] injected snapshot capture failed:', /** @type {any} */ e?.message || e);
    }
    try {
        return buildModel();
    } catch (e: any) {
        console.debug('[projectTabBar] buildModel snapshot capture failed:', /** @type {any} */ e?.message || e);
        return {
            schemaVersion: 2,
            timestamp: new Date().toISOString(),
            project: { name: tab.title || 'Project' },
            elements: [],
            campaigns: [],
            _projectTabsFallbackSnapshot: true,
            _projectTabId: tab.id,
        };
    }
}
/** @param {any} tab */
function _captureAndPersistTabSnapshot(tab: any) {
    const record = {
        version: 1,
        tabId: tab.id,
        capturedAt: Date.now(),
        snapshot: _captureProjectSnapshot(tab),
    };
    _runtimeSnapshots.set(tab.id, record);
    saveTabRuntimeSnapshot(tab.id, record.snapshot).catch((/** @type {any} */ e) =>
        console.debug('[projectTabBar] hibernation snapshot persist failed:', e?.message || e),
    );
    return record;
}
/** @param {any} snapshot */
async function _applyProjectSnapshot(snapshot: any) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    try {
        if (typeof window !== 'undefined' && typeof window.__projectTabsApplySnapshot === 'function') {
            await window.__projectTabsApplySnapshot(snapshot);
            return true;
        }
        const mod = await import('../../core/io/import.js' as string);
        if (typeof mod.applyModel === 'function') {
            await mod.applyModel(snapshot);
            return true;
        }
    } catch (e: any) {
        console.debug('[projectTabBar] hibernation snapshot restore failed:', /** @type {any} */ e?.message || e);
    }
    return false;
}
/** @param {string} tabId @param {any} snapshotRecord */
async function _markTabHibernated(tabId: any, snapshotRecord: any) {
    const tab = _registry?.getTab(tabId);
    if (!tab || tab.state === TAB_STATE.CLOSED || tabId === _activeTabId) return false;
    const hibernatedAt = Date.now();
    _registry.updateMetadata(tabId, {
        hibernation: {
            state: 'hibernated',
            snapshotKey: getTabRuntimeSnapshotKey(tabId),
            capturedAt: snapshotRecord?.capturedAt || hibernatedAt,
            hibernatedAt,
            modelId: tab.modelId || null,
        },
    });
    _hibernationTimers.delete(tabId);
    _saveSession();
    renderProjectTabBar();
    _dispatchProjectTabEvent('projectTab:hibernated', {
        id: tabId,
        snapshotKey: getTabRuntimeSnapshotKey(tabId),
        hibernatedAt,
    });
    return true;
}
/** @param {any} tab */
function _scheduleTabHibernation(tab: any) {
    if (!tab || tab.state === TAB_STATE.CLOSED) return;
    _cancelHibernationTimer(tab.id);
    const snapshotRecord = _captureAndPersistTabSnapshot(tab);
    const timer = setTimeout(() => {
        _markTabHibernated(tab.id, snapshotRecord).catch((/** @type {any} */ e) =>
            console.debug('[projectTabBar] hibernation timer failed:', e?.message || e),
        );
    }, HIBERNATION_DELAY_MS);
    _hibernationTimers.set(tab.id, timer);
}
/** @param {string|null} nextActiveId */
function _schedulePreviousActiveHibernation(nextActiveId: any) {
    if (!_activeTabId || _activeTabId === nextActiveId) return;
    const previous = _registry?.getTab(_activeTabId);
    _scheduleTabHibernation(previous);
}
/**
 * Carrega o snapshot de hibernação de uma aba, tentando IDB e depois memória.
 * @param {string} tabId
 * @returns {Promise<any|null>}
 */
async function _loadHibernationSnapshot(tabId: any) {
    try {
        return await loadTabRuntimeSnapshot(tabId);
    } catch (e: any) {
        console.debug('[projectTabBar] hibernation snapshot load failed:', /** @type {any} */ e?.message || e);
        return null;
    }
}

/**
 * Monta os metadados de hibernação para o estado ativo após restauração.
 * @param {any} tab
 * @param {any|null} record
 * @param {boolean} restored
 * @returns {any}
 */
function _buildRestoredHibernationMetadata(tab: any, record: any, restored: boolean) {
    return {
        state: 'active',
        snapshotKey: getTabRuntimeSnapshotKey(tab.id),
        capturedAt: record?.capturedAt || tab.metadata?.hibernation?.capturedAt || null,
        hibernatedAt: tab.metadata?.hibernation?.hibernatedAt || null,
        restoredAt: Date.now(),
        restored,
    };
}

/** @param {string} tabId */
async function _restoreHibernatedProjectTab(tabId: any) {
    const tab = _registry?.getTab(tabId);
    if (!_isTabHibernated(tab)) return false;
    _cancelHibernationTimer(tabId);
    const record = (await _loadHibernationSnapshot(tabId)) || _runtimeSnapshots.get(tabId) || null;
    const restored = record?.snapshot ? await _applyProjectSnapshot(record.snapshot) : false;
    const current = _registry?.getTab(tabId);
    if (current && current.state !== TAB_STATE.CLOSED) {
        _registry.updateMetadata(tabId, {
            hibernation: _buildRestoredHibernationMetadata(tab, record, restored),
        });
        _saveSession();
        renderProjectTabBar();
    }
    _dispatchProjectTabEvent('projectTab:restoredFromHibernation', {
        id: tabId,
        restored,
        snapshotKey: getTabRuntimeSnapshotKey(tabId),
    });
    return restored;
}
/**
 * Localiza uma lane existente vinculada a uma aba ou cria uma nova.
 * @param {string} tabId
 * @param {any} tab
 * @param {any} lanes
 * @returns {Promise<any|null>}
 */
async function _findOrCreateAutosaveLane(tabId: any, tab: any, lanes: any) {
    const existing = (await lanes.getLanesForUser(PROJECT_TABS_AUTOSAVE_USER_ID)).find(
        (entry: any) => entry?.snapshot?.projectTabId === tabId,
    );
    if (existing) {
        return lanes.switchLane(PROJECT_TABS_AUTOSAVE_USER_ID, existing.id);
    }
    const created = await lanes.createLane({
        userId: PROJECT_TABS_AUTOSAVE_USER_ID,
        name: `Project Tab: ${tab.title || tabId}`.slice(0, 120),
        tier: 'enterprise',
        snapshot: {
            projectTabId: tabId,
            modelId: tab.modelId || null,
            title: tab.title || '',
        },
    });
    return lanes.switchLane(PROJECT_TABS_AUTOSAVE_USER_ID, created.id);
}

/**
 * Resolve a lane de autosave para uma aba (via metadata, busca ou criação).
 * @param {string} tabId
 * @param {any} tab
 * @param {any} lanes
 * @returns {Promise<any|null>}
 */
async function _resolveAutosaveLane(tabId: any, tab: any, lanes: any) {
    const laneId = tab.metadata?.autosaveLaneId || null;
    const fromMetadata = laneId ? await lanes.switchLane(PROJECT_TABS_AUTOSAVE_USER_ID, laneId) : null;
    return fromMetadata || (await _findOrCreateAutosaveLane(tabId, tab, lanes));
}

/**
 * Persiste os metadados da lane no registry e dispara evento.
 * @param {string} tabId
 * @param {any} lane
 */
function _commitAutosaveLaneBinding(tabId: any, lane: any) {
    const current = _registry?.getTab(tabId);
    if (current && current.state !== TAB_STATE.CLOSED) {
        _registry.updateMetadata(tabId, {
            autosaveLaneId: lane.id,
            autosaveLaneUserId: PROJECT_TABS_AUTOSAVE_USER_ID,
        });
        _saveSession();
        renderProjectTabBar();
    }
    _dispatchProjectTabEvent('projectTab:autosaveLaneBound', {
        id: tabId,
        laneId: lane.id,
        userId: PROJECT_TABS_AUTOSAVE_USER_ID,
    });
}

/** @param {string} tabId @param {any} [sourceTab] */
async function _bindAutosaveLaneForTab(tabId: any, sourceTab: any = null) {
    if (_autosaveLaneBindingInFlight.has(tabId)) {
        return _autosaveLaneBindingInFlight.get(tabId);
    }
    const promise = (async () => {
        const tab = sourceTab || _registry?.getTab(tabId);
        if (!tab || tab.state === TAB_STATE.CLOSED) return null;
        try {
            const lanes = await import('../../core/autosaveLane/manager.js' as string);
            const lane = await _resolveAutosaveLane(tabId, tab, lanes);
            if (!lane) return null;
            _commitAutosaveLaneBinding(tabId, lane);
            return lane;
        } catch (e: any) {
            console.debug('[projectTabBar] autosave lane bind failed:', /** @type {any} */ e?.message || e);
            return null;
        }
    })();
    _autosaveLaneBindingInFlight.set(tabId, promise);
    promise.finally(() => _autosaveLaneBindingInFlight.delete(tabId));
    return promise;
}
/** @param {string} tabId */
function _cleanupTabRuntime(tabId: any) {
    _cancelHibernationTimer(tabId);
    _runtimeSnapshots.delete(tabId);
    deleteTabRuntimeSnapshot(tabId).catch((/** @type {any} */ e) =>
        console.debug('[projectTabBar] runtime snapshot delete failed:', e?.message || e),
    );
}
/**
 * Monta a barra no DOM (lazy, idempotente). So age se feature flag on.
 * @returns {Promise<HTMLElement|null>}
 */
export function initProjectTabBar() {
    return _initProjectTabBar();
}
/**
 * Garante que o ponto de montagem da barra exista no DOM.
 * @param {boolean} enabled
 * @returns {HTMLElement|null}
 */
function _ensureMountPoint(enabled: boolean) {
    const existing = document.getElementById(BAR_ID);
    if (!enabled) {
        if (existing) existing.remove();
        _mountPoint = null;
        document.body.style.removeProperty('--project-tab-bar-height');
        return null;
    }
    if (existing) {
        _mountPoint = existing;
        return existing;
    }
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.className = 'project-tab-bar';
    // A11Y: role="toolbar" (ver _syncProjectTabBarLayout). _syncProjectTabBarLayout
    // re-aplica o role a cada render; este valor inicial mantém consistência.
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', t ? t('projectTabs.barLabel') : 'Abas de projeto');
    // Anchor: antes de #app (no body). NÃO inserir dentro de #app porque
    // #app é CSS Grid rígido (grid-template-rows fixo) — adicionar child
    // quebra layout e canvas-container fica 0×0 (Calvin reportou bug
    // 2026-05-31). CSS .project-tab-bar usa background sólido + position
    // sticky para se vincular visualmente como header global.
    const appContainer = document.getElementById('app');
    const anchor = appContainer || document.body.firstElementChild;
    if (anchor?.parentElement) {
        anchor.parentElement.insertBefore(bar, anchor);
    } else {
        document.body.insertBefore(bar, document.body.firstChild);
    }
    _mountPoint = bar;
    return bar;
}

/**
 * Cria a aba inicial quando nenhuma aba foi restaurada dos storages.
 * @returns {boolean} true se uma aba inicial foi criada
 */
function _createInitialTabIfNeeded() {
    if (_registry.listOpen().length > 0) return false;
    const first = _registry.openTab({ title: t ? t('projectTabs.defaultTitle') : 'Projeto 1' });
    _activeTabId = first.id;
    return true;
}

async function _initProjectTabBar() {
    const enabled = !!CONFIG?.FEATURES?.PROJECT_TABS;
    _ensureMountPoint(enabled);
    if (!enabled) return null;
    // Bootstrap síncrono via localStorage (Phase 1 fallback) para render imediato
    _loadSession();
    _loadCompactPreference();
    // Phase 2: inicializa BroadcastChannel para sync cross-tab
    _initBroadcastAdapter();
    _bindProjectTabBarShortcuts();
    _bindProjectTabBarClickHandlers(_mountPoint);
    // Phase 2: restaurar do IDB (assíncrono) se localStorage vazio
    let needsInitialSave = false;
    if (_registry.listOpen().length === 0) {
        const restoredFromIDB = await _restoreFromIDB();
        if (!restoredFromIDB) {
            needsInitialSave = _createInitialTabIfNeeded();
        }
    }
    renderProjectTabBar();
    if (_activeTabId) {
        const bindPromise = _bindAutosaveLaneForTab(_activeTabId);
        if (needsInitialSave) {
            bindPromise.finally(_saveSession);
        }
    } else if (needsInitialSave) {
        _saveSession();
    }
    return _mountPoint;
}
/**
 * Re-renderiza a barra com estado atual do registry.
 */
export function renderProjectTabBar() {
    if (!_mountPoint) return;
    const openTabs = _registry.listOpen(); // inclui PINNED
    _syncProjectTabBarLayout();
    _mountPoint.innerHTML = _buildBarHtml(openTabs);
}
/** @param {any[]} tabs */
function _buildBarHtml(tabs: any) {
    /** @param {string} k @param {string} fb */
    const tStr = (k: any, fb: any) => (t ? t(k) || fb : fb);
    const newTitle = tStr('projectTabs.newTab', 'Nova aba');
    const newBtn = `<button class="ptab-new" type="button" data-cc-action="cc-ddf3435c" data-ptab-action="new" title="${escapeAttr(newTitle)}" aria-label="${escapeAttr(newTitle)}">+</button>`;
    if (_isCompact) {
        return '';
    }
    const collapseTitle = tStr('projectTabs.collapseBar', 'Recolher faixa de abas');
    const collapseBtn = `<button class="ptab-collapse" type="button" data-ptab-action="collapse" title="${escapeAttr(collapseTitle)}" aria-label="${escapeAttr(collapseTitle)}" aria-controls="${BAR_ID}" aria-expanded="true">&#x2212;</button>`;
    const tabItems = tabs
        .map((tab: any) => {
            const isActive = tab.id === _activeTabId;
            const isPinned = tab.state === TAB_STATE.PINNED;
            const isHibernated = _isTabHibernated(tab);
            const title = escapeHtml(tab.title);
            const id = escapeAttr(tab.id);
            const activeClass = isActive ? ' ptab-item--active' : '';
            const pinnedClass = isPinned ? ' ptab-item--pinned' : '';
            const hibernatedClass = isHibernated ? ' ptab-item--hibernated' : '';
            const pinTitle = isPinned
                ? tStr('projectTabs.unpinTab', 'Desafixar aba')
                : tStr('projectTabs.pinTab', 'Fixar aba');
            const pinIcon = isPinned ? '&#x1F4CC;' : '&#x22C5;&#x22C5;&#x22C5;';
            const switchAttr = `onclick="window.handleSwitchProjectTab('${id}')"`;
            const closeAttr = `onclick="event.stopPropagation(); window.handleCloseProjectTab('${id}')"`;
            const pinAttr = `onclick="event.stopPropagation(); window.handlePinProjectTab('${id}')"`;
            const archiveTitle = tStr('projectTabs.archiveTab', 'Arquivar aba');
            const archiveAttr = `onclick="event.stopPropagation(); window.handleArchiveProjectTab('${id}')"`;
            // A11Y (nested-interactive): o item NÃO usa role="tab" (papel interativo)
            // porque contém botões focáveis (.ptab-archive/.ptab-close) — role
            // interativo + descendentes focáveis disparava nested-interactive. É um
            // contêiner clicável (onclick) dentro de role="toolbar"; o estado ativo
            // vai em aria-current="true" (idioma de toolbar), não aria-selected (que
            // só vale em tab/option). Comportamento de clique inalterado.
            const ariaCurrent = isActive ? ' aria-current="true"' : '';
            return `<div class="ptab-item${activeClass}${pinnedClass}${hibernatedClass}"${ariaCurrent} data-tab-id="${id}" data-hibernated="${isHibernated ? 'true' : 'false'}" ${switchAttr}>
  <span class="ptab-pin" title="${escapeAttr(pinTitle)}" ${pinAttr} aria-label="${escapeAttr(pinTitle)}">${pinIcon}</span>
  <span class="ptab-title">${title}</span>
  <button class="ptab-archive" title="${escapeAttr(archiveTitle)}" ${archiveAttr} aria-label="${escapeAttr(archiveTitle)}">&#x21BA;</button>
  <button class="ptab-close" title="${tStr('projectTabs.closeTab', 'Fechar aba')}" ${closeAttr} aria-label="${tStr('projectTabs.closeTab', 'Fechar aba')}">&#x2715;</button>
</div>`;
        })
        .join('');
    return collapseBtn + tabItems + newBtn;
}
// ── Public API ───────────────────────────────────────────────────────────────
/**
 * Abre nova aba (UNINITIALIZED → OPEN). Persiste e re-renderiza.
 * @param {{title?: string, modelId?: string}} [opts]
 * @returns {object} tab frozen
 */
export function openProjectTab(opts: any = {}) {
    _loadSession();
    // HUD-UX-PAIN-DRAIN-001 W4.4 (D11): título default NUMERADO — duas tabs
    // "Projeto" idênticas eram indistinguíveis. "Projeto N" com N único.
    let title = opts && opts.title;
    if (!title) {
        const base = t ? t('projectTabs.defaultTitle') : 'Projeto';
        const existing = (_registry.snapshot()?.tabs || []) as Array<{ title?: string }>;
        let n = existing.length + 1;
        const titles = new Set(existing.map((x) => String(x?.title || '')));
        while (titles.has(`${base} ${n}`)) n++;
        title = `${base} ${n}`;
    }
    const tab = _registry.openTab({ title, modelId: opts.modelId || null });
    _schedulePreviousActiveHibernation(tab.id);
    _cancelHibernationTimer(tab.id);
    _activeTabId = tab.id;
    _saveSession();
    renderProjectTabBar();
    _broadcastChange('open-tab', { id: tab.id });
    _bindAutosaveLaneForTab(tab.id, tab);
    return tab;
}
/**
 * Fecha aba. Se for a ativa, ativa a aba anterior.
 * @param {string} id
 */
export function closeProjectTab(id: any) {
    _loadSession();
    const openTabs = _registry.listOpen();
    if (openTabs.length <= 1) return; // impossível fechar última aba
    _cleanupTabRuntime(id);
    _registry.closeTab(id);
    if (_activeTabId === id) {
        const remaining = _registry.listOpen();
        _activeTabId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        if (_activeTabId) _bindAutosaveLaneForTab(_activeTabId);
    }
    _saveSession();
    renderProjectTabBar();
    _broadcastChange('close-tab', { id });
}
/**
 * Torna a aba com `id` a ativa. Dispara 'projectTab:switched'.
 * @param {string} id
 * @returns {object|null} tab ou null se não encontrada
 */
export function switchProjectTab(id: any) {
    _loadSession();
    const tab = _registry.getTab(id);
    if (!tab || tab.state === TAB_STATE.CLOSED) return null;
    _schedulePreviousActiveHibernation(id);
    _cancelHibernationTimer(id);
    const wasHibernated = _isTabHibernated(tab);
    _activeTabId = id;
    _saveSession();
    renderProjectTabBar();
    _bindAutosaveLaneForTab(id, tab);
    if (wasHibernated) {
        _restoreHibernatedProjectTab(id);
    }
    _dispatchProjectTabEvent('projectTab:switched', { id, modelId: tab.modelId, wasHibernated });
    return tab;
}
/**
 * Alterna pin/unpin da aba.
 * @param {string} id
 */
export function pinProjectTab(id: any) {
    _loadSession();
    const tab = _registry.getTab(id);
    if (!tab) return;
    if (tab.state === TAB_STATE.PINNED) {
        _registry.unpinTab(id);
    } else {
        _registry.pinTab(id);
    }
    _saveSession();
    renderProjectTabBar();
    _broadcastChange('pin-tab', { id });
}
/**
 * Renomeia aba.
 * @param {string} id
 * @param {string} name
 */
export function renameProjectTab(id: any, name: any) {
    _loadSession();
    _registry.renameTab(id, name);
    _saveSession();
    renderProjectTabBar();
}
/**
 * Arquiva aba (OPEN/PINNED → ARCHIVED). Re-renderiza.
 * Se for a aba ativa, ativa a próxima disponível.
 * @param {string} id
 */
export function archiveProjectTab(id: any) {
    _loadSession();
    const openTabs = _registry.listOpen();
    // Não arquiva se for a única aba aberta
    if (openTabs.length <= 1) return;
    _cancelHibernationTimer(id);
    _registry.archiveTab(id);
    if (_activeTabId === id) {
        const remaining = _registry.listOpen();
        _activeTabId = remaining.length > 0 ? remaining[remaining.length - 1].id : null;
        if (_activeTabId) _bindAutosaveLaneForTab(_activeTabId);
    }
    _saveSession();
    renderProjectTabBar();
    _broadcastChange('archive-tab', { id });
}
/**
 * Restaura aba arquivada (ARCHIVED → OPEN). Re-renderiza.
 * @param {string} id
 */
export function restoreArchivedTab(id: any) {
    _loadSession();
    _registry.restoreTab(id);
    _schedulePreviousActiveHibernation(id);
    _cancelHibernationTimer(id);
    _activeTabId = id;
    _saveSession();
    renderProjectTabBar();
    _broadcastChange('restore-tab', { id });
    _bindAutosaveLaneForTab(id);
}

export function collapseProjectTabBar() {
    _setProjectTabBarCompact(true);
}

export function expandProjectTabBar() {
    _setProjectTabBarCompact(false);
}

export function toggleProjectTabBarCompact() {
    _setProjectTabBarCompact(!_isCompact);
}

export function isProjectTabBarCompact() {
    _loadCompactPreference();
    return _isCompact;
}
/**
 * Retorna o ID da aba atualmente ativa.
 * @returns {string|null}
 */
export function getActiveProjectTabId() {
    return _activeTabId;
}
/**
 * Retorna snapshot do registry (para inspeção/debug).
 */
export function getProjectTabsSnapshot() {
    _loadSession();
    return _registry.snapshot();
}
/**
 * Retorna estado operacional do runtime de Project Tabs para smoke tests.
 */
export function getProjectTabsRuntimeState() {
    _loadSession();
    const tabs = _registry.listAll();
    return {
        activeTabId: _activeTabId,
        hibernationDelayMs: HIBERNATION_DELAY_MS,
        pendingHibernationTabIds: Array.from(_hibernationTimers.keys()),
        hibernatedTabIds: tabs.filter((tab: any) => _isTabHibernated(tab)).map((tab: any) => tab.id),
        autosaveLaneBindings: tabs
            .filter((tab: any) => tab.metadata?.autosaveLaneId)
            .map((tab: any) => ({
                tabId: tab.id,
                laneId: tab.metadata.autosaveLaneId,
                userId: tab.metadata.autosaveLaneUserId || null,
            })),
    };
}
/**
 * Reseta session (para testes). Não exportado em produção - só via _resetForTest.
 * @private
 */
export function _resetProjectTabsForTest() {
    for (const tabId of Array.from(_hibernationTimers.keys())) {
        _cancelHibernationTimer(tabId);
    }
    _runtimeSnapshots.clear();
    _autosaveLaneBindingInFlight.clear();
    _pendingIdbSavePayload = null;
    _pendingIdbSaveSignature = null;
    _inflightProjectTabsIdbSaveSignature = null;
    _lastProjectTabsIdbSaveSignature = null;
    _clearProjectTabsIdbSaveTimers();
    _registry = null;
    _activeTabId = null;
    _mountPoint = null;
    _isCompact = false;
    _compactPreferenceLoaded = false;
    try {
        localStorage.removeItem(LS_KEY);
        localStorage.removeItem(COMPACT_LS_KEY);
    } catch (e: any) {
        console.debug('[projectTabBar] resetForTest removeItem:', /** @type {any} */ e?.message || e);
        /* */
    }
}
