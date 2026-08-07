// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TAB-MODEL-SWITCH-001 F3 (claude - novaspec, 2026-05-31) — modelSwitchBridge.
 *
 * Orchestrator pure-logic que coordena snapshot + dispose + restore
 * entre tabs via Manager Registry (F2). 100% injetável (deps externas via
 * parâmetro) → testável sem browser/Three.js/IDB real.
 *
 * Fluxo canônico de switchTo(targetTabId):
 *   1. snapshotCurrent() — itera getOrderedForSnapshot(), chama exportState()
 *      em cada manager, persiste em IDB sob `tabSnapshots:{currentTabId}`
 *   2. resetAllManagers() — itera registry chamando resetState()
 *      (sceneOwner.dispose canonical 5-step incluído via resetState wrapper)
 *   3. loadSnapshot(targetTabId) — busca IDB tabSnapshots:{targetTabId}
 *      → se existe, restore; se não, deixa empty state
 *   4. restoreSnapshot() — itera getOrderedForRestore() (sceneOwner PRIMEIRO),
 *      chama importState() em cada manager. Promise.all para async (interpolation)
 *   5. Telemetria + progress callback
 *   6. Rollback automático se manager CRITICAL falhar (ADR §10 A4):
 *      → re-restore snapshot anterior + toast erro + telemetria failed
 *
 * Refs:
 *   - SPEC `docs/specs/features/SPEC_TAB_MODEL_SWITCH_INTEGRATION.md` §4
 *   - ADR §10 A1-A6 (snapshot completo, dispose+init, rollback critical)
 *   - F1 commits 8c27b7cf+b09f2fe8+dae3e893 (manager signatures)
 *   - F2 commit 6db3c3c6 (Manager Registry frozen)
 */

import {
    MANAGER_REGISTRY,
    getOrderedForSnapshot,
    getOrderedForRestore,
    type ManagerEntry,
} from './managerRegistry.js';

// =============================================================================
// Tipos públicos
// =============================================================================

export interface ManagerStateMap {
    [managerName: string]: unknown;
}

export interface TabSnapshot {
    schemaVersion: 1;
    tabId: string;
    capturedAtMs: number;
    managers: ManagerStateMap;
    /** Optional thumbnail PNG base64 — caller (UI) gera via sceneOwner.captureFrame() */
    thumbnail?: string;
}

export interface SwitchResult {
    ok: boolean;
    fromTabId: string | null;
    toTabId: string;
    durationMs: number;
    error?: string;
    rolledBack?: boolean;
}

export type SwitchPhase = 'started' | 'snapshot' | 'reset' | 'load' | 'restore' | 'completed' | 'failed';
export type ProgressCallback = (phase: SwitchPhase, pct: number) => void;

// =============================================================================
// Dependências injetáveis
// =============================================================================

/**
 * Loader assíncrono de módulo manager — caller browser implementa via
 * `(p) => import('/js/' + p)`. Testes injetam mock object.
 */
export type ModuleLoader = (modulePath: string) => Promise<{
    exportState?: () => unknown;
    importState?: (state: unknown) => void | Promise<void>;
    resetState?: () => void;
}>;

export interface IdbAdapter {
    get(key: string): Promise<TabSnapshot | null>;
    set(key: string, value: TabSnapshot): Promise<void>;
    delete(key: string): Promise<void>;
}

export interface BridgeDeps {
    loadModule: ModuleLoader;
    idb: IdbAdapter;
    /** Clock injetável para testes determinísticos */
    now?: () => number;
    /** Telemetria callback opcional */
    telemetry?: (event: string, payload: Record<string, unknown>) => void;
    /** Manager registry override (testes podem injetar subset) */
    registry?: ReadonlyArray<ManagerEntry>;
}

// =============================================================================
// Snapshot (export)
// =============================================================================

/**
 * Itera Manager Registry chamando exportState() em ordem snapshot
 * (managers de dados primeiro, sceneOwner último). Tolerante a manager
 * faltando exportState — apenas pula com warning.
 */
export async function snapshotCurrent(
    tabId: string,
    deps: BridgeDeps,
): Promise<TabSnapshot> {
    const now = deps.now || (() => Date.now());
    // eslint-disable-next-line
    const registry = deps.registry || getOrderedForSnapshot();
    const orderedRegistry = deps.registry
        ? deps.registry
        : getOrderedForSnapshot();
    const managers: ManagerStateMap = {};
    for (const entry of orderedRegistry) {
        try {
            const mod = await deps.loadModule(entry.modulePath);
            if (typeof mod.exportState !== 'function') {
                continue; // graceful degradation — manager sem signature ainda
            }
            managers[entry.name] = mod.exportState();
        }
        catch (e: any) {
            const msg = e?.message || String(e);
            if (entry.critical) {
                throw new Error(`snapshotCurrent: critical manager '${entry.name}' failed: ${msg}`, { cause: e });
            }
            // non-critical: skip silenciosamente (degradação graceful)
            console.debug('[tab-switch:snapshot] non-critical manager skipped', entry.name, msg);
        }
    }
    return {
        schemaVersion: 1,
        tabId,
        capturedAtMs: now(),
        managers,
    };
}

// =============================================================================
// Reset (dispose all)
// =============================================================================

/**
 * Itera registry chamando resetState() em cada manager.
 * Ordem: getOrderedForRestore() (sceneOwner PRIMEIRO — dispose canonical
 * antes dos managers de dados limparem).
 */
export async function resetAllManagers(deps: BridgeDeps): Promise<void> {
    const registry = deps.registry || getOrderedForRestore();
    for (const entry of registry) {
        try {
            const mod = await deps.loadModule(entry.modulePath);
            if (typeof mod.resetState === 'function') {
                mod.resetState();
            }
        }
        catch (e: any) {
            // reset é best-effort — continua mesmo em falha (managers não-critical
            // podem ter side effects fora de escopo do bridge)
            console.debug('[tab-switch:reset] manager reset failed', entry.name, e?.message || e);
        }
    }
}

// =============================================================================
// Restore (import)
// =============================================================================

/**
 * Itera Manager Registry chamando importState() em ordem restore
 * (sceneOwner primeiro, depois managers de dados). Async managers
 * (interpolation) são awaited via Promise.
 *
 * Falha de manager CRITICAL aborta restore e propaga erro para caller
 * (switchTo decide rollback).
 */
export async function restoreSnapshot(
    snapshot: TabSnapshot | null,
    deps: BridgeDeps,
): Promise<void> {
    if (!snapshot || !snapshot.managers) {
        return; // empty state — nada para restaurar
    }
    const registry = deps.registry || getOrderedForRestore();
    for (const entry of registry) {
        const state = snapshot.managers[entry.name];
        if (state === undefined) continue; // manager não no snapshot
        try {
            const mod = await deps.loadModule(entry.modulePath);
            if (typeof mod.importState !== 'function') continue;
            const result = mod.importState(state);
            // Async managers (interpolation) retornam Promise — aguardar
            if (result && typeof (result as any).then === 'function') {
                await result;
            }
        }
        catch (e: any) {
            const msg = e?.message || String(e);
            if (entry.critical) {
                throw new Error(`restoreSnapshot: critical manager '${entry.name}' failed: ${msg}`, { cause: e });
            }
            console.debug('[tab-switch:restore] non-critical manager skipped', entry.name, msg);
        }
    }
}

// =============================================================================
// Switch orchestrator (main entry)
// =============================================================================

let _currentTabId: string | null = null;
let _switchInFlight = false;
let _onProgress: ProgressCallback | null = null;

/**
 * Caller (UI projectTabBar) chama isto ao usuário clicar em outra tab.
 *
 * Fluxo:
 *   1. Verifica concorrência (1 switch por vez via _switchInFlight lock)
 *   2. Snapshot current → IDB
 *   3. Reset all managers (dispose + clear)
 *   4. Load snapshot target de IDB
 *   5. Restore snapshot
 *   6. Sucesso: atualiza _currentTabId + telemetria completed
 *   7. Falha: rollback (re-restore snapshot anterior) + telemetria failed
 */
export async function switchTo(
    targetTabId: string,
    deps: BridgeDeps,
): Promise<SwitchResult> {
    if (_switchInFlight) {
        return {
            ok: false,
            fromTabId: _currentTabId,
            toTabId: targetTabId,
            durationMs: 0,
            error: 'switch_in_flight',
        };
    }
    if (targetTabId === _currentTabId) {
        return {
            ok: true,
            fromTabId: _currentTabId,
            toTabId: targetTabId,
            durationMs: 0,
        };
    }
    _switchInFlight = true;
    const now = deps.now || (() => Date.now());
    const startedAtMs = now();
    const fromTabId = _currentTabId;
    deps.telemetry?.('tab.switch.started', { fromTabId, toTabId: targetTabId });
    _onProgress?.('started', 0);
    let previousSnapshot: TabSnapshot | null = null;
    try {
        // Phase 1: snapshot current
        _onProgress?.('snapshot', 10);
        if (fromTabId) {
            previousSnapshot = await snapshotCurrent(fromTabId, deps);
            // KEY FIX 2026-06-02: usar key canônica `tab-model-snapshot:`
            // (TAB_MODEL_SNAPSHOT_KEY_PREFIX em tabModelSnapshotsAdapter.ts).
            // Versão anterior usava `tabSnapshots:` que não batia com a
            // key escrita por wired_handleOpenProjectTab → snapshots nunca
            // eram recuperados pelo restore (IS-5/6 root cause).
            await deps.idb.set(`tab-model-snapshot:${fromTabId}`, previousSnapshot);
        }
        // Phase 2: reset all managers
        _onProgress?.('reset', 30);
        await resetAllManagers(deps);
        // Phase 3: load target snapshot (key canônica)
        _onProgress?.('load', 50);
        const targetSnapshot = await deps.idb.get(`tab-model-snapshot:${targetTabId}`);
        // Phase 4: restore target
        _onProgress?.('restore', 70);
        await restoreSnapshot(targetSnapshot, deps);
        // Phase 5: sucesso
        _currentTabId = targetTabId;
        _switchInFlight = false;
        const durationMs = now() - startedAtMs;
        _onProgress?.('completed', 100);
        deps.telemetry?.('tab.switch.completed', {
            fromTabId,
            toTabId: targetTabId,
            durationMs,
            hadPreviousSnapshot: previousSnapshot !== null,
            hadTargetSnapshot: targetSnapshot !== null,
        });
        return {
            ok: true,
            fromTabId,
            toTabId: targetTabId,
            durationMs,
        };
    }
    catch (e: any) {
        const msg = e?.message || String(e);
        // Rollback: restore snapshot anterior (best-effort)
        let rolledBack = false;
        if (previousSnapshot) {
            try {
                await resetAllManagers(deps);
                await restoreSnapshot(previousSnapshot, deps);
                rolledBack = true;
            }
            catch (rollbackError: any) {
                // rollback falhou — state está num limbo; caller deve mostrar erro grave
                console.debug('[tab-switch:rollback] failed', rollbackError?.message || rollbackError);
            }
        }
        _switchInFlight = false;
        const durationMs = now() - startedAtMs;
        _onProgress?.('failed', 100);
        deps.telemetry?.('tab.switch.failed', {
            fromTabId,
            toTabId: targetTabId,
            durationMs,
            error: msg,
            rolledBack,
        });
        return {
            ok: false,
            fromTabId,
            toTabId: targetTabId,
            durationMs,
            error: msg,
            rolledBack,
        };
    }
}

// =============================================================================
// State helpers + reset (test teardown)
// =============================================================================

export function getCurrentTabId(): string | null {
    return _currentTabId;
}

export function isSwitchInFlight(): boolean {
    return _switchInFlight;
}

export function setOnSwitchProgress(cb: ProgressCallback | null): void {
    _onProgress = cb;
}

/**
 * Reset state interno do bridge (teardown de testes).
 */
export function _resetBridgeForTesting(): void {
    _currentTabId = null;
    _switchInFlight = false;
    _onProgress = null;
}

/**
 * Set _currentTabId externamente (usado por bridgeWire ao criar tab nova
 * via wired_handleOpenProjectTab — caller controla creation+reset, bridge
 * só registra current sem disparar switchTo que faria snapshot vazio
 * sobrescrever).
 */
export function _setCurrentTabIdForWire(tabId: string | null): void {
    _currentTabId = tabId;
}

/**
 * Re-export do registry para conveniência caller.
 */
export { MANAGER_REGISTRY };

// Public aliases without underscore prefix (ecbyts-local/no-underscore-prefixed-imports)
export { _setCurrentTabIdForWire as setCurrentTabIdForWire };
