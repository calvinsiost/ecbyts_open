// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TAB-MODEL-SWITCH-001 F5 (claude - novaspec, 2026-05-31) — Bridge Wire.
 *
 * Caller browser que substitui o handler `window.handleSwitchProjectTab(id)`
 * (legacy path em `utils/handlers/projectTabs.ts:57`) por chamada ao
 * `modelSwitchBridge.switchTo(id)` (F3 orchestrator com IDB + manager
 * snapshot/restore real).
 *
 * O legacy path apenas chama `switchProjectTab(id)` no registry e dispara
 * `handleSwitchModel(modelId)` opcional — sem snapshot/restore de state dos
 * managers. Esse era o caminho que crashou em 2026-05-31 quando Calvin
 * ligou PROJECT_TABS=true sem MULTI_MODEL_TABS sceneBridge wireado.
 *
 * Esta wire substitui o handler globalmente quando flag `TAB_MODEL_SWITCH`
 * está on. Quando off, handler legacy permanece (zero regressão).
 *
 * Caller (main.ts) chama `wireProjectTabBarToSwitchBridge()` UMA VEZ no
 * bootstrap após `initProjectTabBar()`. Ordem importa: handler legacy é
 * registrado primeiro, depois sobrescrito.
 *
 * Refs:
 *   - SPEC `docs/specs/features/SPEC_TAB_MODEL_SWITCH_INTEGRATION.md` §13 F5
 *   - F3 commit 2bbf851b (modelSwitchBridge)
 *   - F4 commit e01d3581 (tabModelSnapshotsAdapter)
 *   - Incidente 2026-05-31: PROJECT_TABS=true sem wire → crash HUD
 */

import { switchTo, setOnSwitchProgress, getCurrentTabId, type BridgeDeps, type SwitchPhase } from './modelSwitchBridge.js';
import { createTabModelSnapshotsAdapter, buildSnapshotKey } from './tabModelSnapshotsAdapter.js';

// =============================================================================
// State interno
// =============================================================================

let _wired = false;
let _originalHandler: ((id: any) => void) | null = null;
let _originalOpenHandler: ((opts?: any) => void) | null = null;
let _onProgressCallback: ((phase: SwitchPhase, pct: number) => void) | null = null;

function _callLegacySwitchHandler(id: any): void {
    if (!_originalHandler) return;
    try {
        _originalHandler(id);
    }
    catch (e: any) {
        console.debug('[tab-switch:wire] legacy handler error (non-fatal)', e?.message || e);
    }
}

// =============================================================================
// Loader de módulo (browser-side)
// =============================================================================

/**
 * Loader de manager module via dynamic import. Mapeia modulePath relativo
 * do registry para URL absoluta esperada pelo browser:
 *   'core/elements/manager.js' → '/js/core/elements/manager.js'
 *
 * Caller substitui em testes via deps.loadModule injetado.
 */
async function _defaultLoadModule(modulePath: string): Promise<any> {
    if (!modulePath || typeof modulePath !== 'string') {
        throw new Error('loadModule: invalid modulePath');
    }
    const url = '/js/' + modulePath;
    try {
        return await import(url);
    }
    catch (e: any) {
        throw new Error(`loadModule failed for ${url}: ${e?.message || String(e)}`, { cause: e });
    }
}

// =============================================================================
// Telemetria default
// =============================================================================

/**
 * Telemetria default: dispara CustomEvent que telemetry pipeline (se
 * existir) captura. Fallback console.debug em dev.
 */
function _defaultTelemetry(event: string, payload: Record<string, unknown>): void {
    try {
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
            window.dispatchEvent(new CustomEvent('telemetry:' + event, { detail: payload }));
        }
    }
    catch (e: any) {
        // graceful fallback
        console.debug('[tab-switch:telemetry] dispatch failed', e?.message || e);
    }
    if (typeof console !== 'undefined' && console.debug) {
        console.debug('[tab-switch:telemetry]', event, payload);
    }
}

// =============================================================================
// Build deps padrão (browser)
// =============================================================================

/**
 * Constrói BridgeDeps com defaults browser-side. Caller pode override
 * qualquer campo para testes ou customização.
 */
export function buildDefaultBridgeDeps(overrides?: Partial<BridgeDeps>): BridgeDeps {
    const idbAdapter = createTabModelSnapshotsAdapter();
    const deps: BridgeDeps = {
        loadModule: overrides?.loadModule || _defaultLoadModule,
        idb: overrides?.idb || {
            async get(key: string) {
                return await idbAdapter.get(key);
            },
            async set(key: string, value: any) {
                await idbAdapter.set(key, value);
            },
            async delete(key: string) {
                await idbAdapter.delete(key);
            },
        },
        telemetry: overrides?.telemetry || _defaultTelemetry,
    };
    if (overrides?.now) deps.now = overrides.now;
    if (overrides?.registry) deps.registry = overrides.registry;
    return deps;
}

// =============================================================================
// Wire principal
// =============================================================================

/**
 * Substitui `window.handleSwitchProjectTab` por handler novo que invoca
 * modelSwitchBridge.switchTo com snapshot/restore real.
 *
 * IMPORTANTE: composição de key via buildSnapshotKey acontece dentro do
 * adapter — caller (bridge) passa tabId cru, adapter compõe namespace.
 * Wire NÃO mexe em key building.
 *
 * Idempotente: chamadas repetidas são no-op (já wired). Para re-wire
 * (testes), usar unwireProjectTabBarFromSwitchBridge() antes.
 *
 * Caller browser (main.ts F5):
 *   if (CONFIG.FEATURES.TAB_MODEL_SWITCH) {
 *       wireProjectTabBarToSwitchBridge();
 *   }
 */
export function wireProjectTabBarToSwitchBridge(opts?: {
    deps?: Partial<BridgeDeps>;
    onProgress?: (phase: SwitchPhase, pct: number) => void;
}): boolean {
    if (_wired) return false;
    if (typeof window === 'undefined') return false;
    const w = window as any;
    // Preserva handlers legacy para fallback/unwire
    _originalHandler = typeof w.handleSwitchProjectTab === 'function' ? w.handleSwitchProjectTab : null;
    _originalOpenHandler = typeof w.handleOpenProjectTab === 'function' ? w.handleOpenProjectTab : null;
    const deps = buildDefaultBridgeDeps(opts?.deps);
    if (opts?.onProgress) {
        _onProgressCallback = opts.onProgress;
        setOnSwitchProgress(opts.onProgress);
    }
    // Substitui handler global
    w.handleSwitchProjectTab = async function wired_handleSwitchProjectTab(id: any) {
        if (!id) return;
        _callLegacySwitchHandler(id);
        if (id === getCurrentTabId()) return; // no-op same tab (bridge state)
        try {
            const result = await switchTo(id, deps);
            if (!result.ok) {
                console.warn('[tab-switch:wire] switch failed', {
                    error: result.error,
                    rolledBack: result.rolledBack,
                });
                // Toast erro UI (caller pode subscrever telemetry:tab.switch.failed)
            }
        }
        catch (e: any) {
            console.error('[tab-switch:wire] switch threw unexpectedly', e?.message || e);
        }
    };
    // CRÍTICO: também substitui handleOpenProjectTab para garantir que tab
    // nova começa com state ISOLADO (limpo). Bug 2026-06-01 vision IS-3:
    // tab nova herdava state (75 elementos) da tab anterior porque criação
    // não disparava reset/snapshot.
    w.handleOpenProjectTab = async function wired_handleOpenProjectTab(opts: any = {}) {
        if (!_originalOpenHandler) return;
        try {
            // Step 1: snapshot da tab ATUAL antes de criar nova
            const currentId = getCurrentTabId();
            if (currentId) {
                try {
                    const { snapshotCurrent } = (await import('./modelSwitchBridge.js')) as any;
                    const snap = await snapshotCurrent(currentId, deps);
                    await deps.idb.set(`tab-model-snapshot:${currentId}`, snap);
                }
                catch (e: any) {
                    console.debug('[tab-open:wire] snapshot atual falhou', e?.message || e);
                }
            }
            // Step 2: cria nova tab no registry (via handler legacy).
            // Legacy `handleOpenProjectTab` NÃO retorna a tab — apenas
            // dispara CustomEvent. Fallback: ler activeTabId DEPOIS do
            // legacy executar (registry já marcou via openProjectTab).
            let tab: any = _originalOpenHandler(opts);
            let newId: string | null = tab?.id || null;
            if (!newId) {
                try {
                    const mod: any = await import('/js/utils/ui/projectTabBar.js' as any);
                    // getProjectTabsSnapshot pode retornar activeTabId
                    // desatualizado em alguns codepaths — usar
                    // getActiveProjectTabId que lê diretamente o state
                    // interno _activeTabId atualizado por openProjectTab.
                    const getActive = mod?.getActiveProjectTabId;
                    newId = (typeof getActive === 'function' ? getActive() : null) || null;
                    if (newId && !tab) {
                        tab = { id: newId };
                    }
                }
                catch (e: any) {
                    console.debug('[tab-open:wire] active id fallback failed', e?.message || e);
                }
            }
            // Step 3: reset all managers (state limpo para nova tab)
            try {
                const { resetAllManagers } = (await import('./modelSwitchBridge.js')) as any;
                await resetAllManagers(deps);
            }
            catch (e: any) {
                console.debug('[tab-open:wire] reset falhou', e?.message || e);
            }
            // Step 4: marca nova tab como current no bridge (sem switchTo
            // que faria snapshot vazio sobrescrever)
            if (newId) {
                const { _setCurrentTabIdForWire } = (await import('./modelSwitchBridge.js')) as any;
                if (typeof _setCurrentTabIdForWire === 'function') {
                    _setCurrentTabIdForWire(newId);
                }
            }
            return tab;
        }
        catch (e: any) {
            console.error('[tab-open:wire] open threw unexpectedly', e?.message || e);
            return _originalOpenHandler(opts);
        }
    };
    _wired = true;
    return true;
}

/**
 * Reverte wire — restaura handler legacy. Útil para testes ou
 * desativação runtime via feature flag.
 */
export function unwireProjectTabBarFromSwitchBridge(): boolean {
    if (!_wired) return false;
    if (typeof window === 'undefined') return false;
    const w = window as any;
    if (_originalHandler) {
        w.handleSwitchProjectTab = _originalHandler;
    }
    else {
        delete w.handleSwitchProjectTab;
    }
    if (_originalOpenHandler) {
        w.handleOpenProjectTab = _originalOpenHandler;
    }
    else {
        delete w.handleOpenProjectTab;
    }
    _originalHandler = null;
    _originalOpenHandler = null;
    if (_onProgressCallback) {
        setOnSwitchProgress(null);
        _onProgressCallback = null;
    }
    _wired = false;
    return true;
}

/**
 * Indica se wire está ativo (introspecção para admin/debug).
 */
export function isWired(): boolean {
    return _wired;
}

/**
 * Re-export key builder para conveniência caller — útil para inspecionar
 * IDB store em DevTools.
 */
export { buildSnapshotKey };
