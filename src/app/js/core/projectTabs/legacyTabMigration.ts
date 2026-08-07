// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TAB-MODEL-SWITCH-001 F8 (claude - novaspec, 2026-05-31) — Legacy Migration.
 *
 * Migration one-shot single-tab legacy → "Projeto 1" automático.
 *
 * Cenário: Calvin já tinha um modelo carregado no app (state in-memory)
 * ANTES de ligar PROJECT_TABS + TAB_MODEL_SWITCH. Sem migration, ligar
 * as flags criaria tab vazia "Projeto 1" e o state existente sumiria
 * (não está em nenhuma tab persistida).
 *
 * Migration F8 detecta esse cenário e:
 *   1. Captura snapshot do state in-memory atual via bridge.snapshotCurrent()
 *   2. Cria tab "Projeto 1" no tabRegistry com ID determinístico
 *   3. Persiste snapshot em IDB sob `tab-model-snapshot:{tabId}`
 *   4. Seta migration marker (idempotência)
 *   5. Próximo boot: marker presente → migration skip, app abre tab normal
 *
 * Pure-logic ish: 100% deps injetáveis (idb + bridge.snapshotCurrent +
 * registry creator + clock). Caller browser passa deps reais; testes
 * injetam mocks.
 *
 * Refs:
 *   - SPEC `docs/specs/features/SPEC_TAB_MODEL_SWITCH_INTEGRATION.md` §13 F8
 *   - F4 commit e01d3581 (runMigrationV1 stub + marker key)
 *   - F3 commit 2bbf851b (snapshotCurrent invocado para captura state)
 */

import type { TabSnapshot, BridgeDeps } from './modelSwitchBridge.js';
import { MIGRATION_MARKER_KEY, CURRENT_SCHEMA_VERSION, buildSnapshotKey } from './tabModelSnapshotsAdapter.js';

// =============================================================================
// Tipos
// =============================================================================

export interface LegacyMigrationDeps {
    /** Bridge.snapshotCurrent injetado (F3) */
    snapshotCurrent: (tabId: string, deps: BridgeDeps) => Promise<TabSnapshot>;
    /** Deps do bridge para passar ao snapshotCurrent */
    bridgeDeps: BridgeDeps;
    /**
     * Cria entry no tabRegistry (caller injeta — testes mockam).
     * Pode retornar string com tabId real (caso registry gere próprio ID
     * diferente do `entry.id` passado). Se void, migration usa `entry.id`.
     */
    createTabRegistryEntry: (entry: { id: string; title: string }) => void | string;
    /** Conta tabs atualmente abertas (caller injeta — registry.listOpen().length) */
    countOpenTabs: () => number;
    /** Indica se há state legacy detectável (caller chama snapshotCurrent + verifica managers não-vazios) */
    hasLegacyState?: () => Promise<boolean>;
    /** IDB adapter para persistir snapshot + marker */
    idb: {
        get(key: string): Promise<any | null>;
        set(key: string, value: any): Promise<void>;
    };
    /** Clock injetável (testes determinísticos) */
    now?: () => number;
    /** ID para "Projeto 1" — default determinístico baseado em now() */
    defaultTabIdForMigration?: string;
    /** Título — default 'Projeto 1' (caller pode i18n) */
    defaultTabTitle?: string;
    /** Force override marker (testes) */
    force?: boolean;
}

export interface LegacyMigrationResult {
    ranNow: boolean;
    alreadyMigrated: boolean;
    legacyDetected: boolean;
    createdTabId?: string;
    snapshotKey?: string;
    error?: string;
}

// =============================================================================
// Detecção heurística de state legacy
// =============================================================================

/**
 * Heurística default: snapshot é "não-vazio" se pelo menos UM manager
 * retornou state com conteúdo (managers.* não-empty).
 *
 * Caller pode override via deps.hasLegacyState para regra customizada.
 */
export function isSnapshotNonEmpty(snapshot: TabSnapshot | null | undefined): boolean {
    if (!snapshot || !snapshot.managers) return false;
    for (const key of Object.keys(snapshot.managers)) {
        const v = snapshot.managers[key];
        if (v === null || v === undefined) continue;
        if (typeof v !== 'object') continue;
        // Se manager retornou array com items OU object com keys não-vazias
        const obj = v as Record<string, unknown>;
        const hasContent =
            (Array.isArray(obj) && obj.length > 0) ||
            (typeof obj === 'object' && Object.values(obj).some((vv) => {
                if (Array.isArray(vv)) return vv.length > 0;
                if (typeof vv === 'object' && vv !== null) return Object.keys(vv).length > 0;
                if (typeof vv === 'number') return vv !== 0;
                return Boolean(vv);
            }));
        if (hasContent) return true;
    }
    return false;
}

// =============================================================================
// Migration principal
// =============================================================================

/**
 * Executa migration legacy → "Projeto 1" automático.
 * Idempotente: marker MIGRATION_MARKER_KEY em IDB indica que já rodou.
 *
 * Fluxo:
 *   1. Se marker existe e !force → return alreadyMigrated
 *   2. Se já há tabs abertas (countOpenTabs > 0) → skip + set marker
 *   3. Snapshot current state
 *   4. Se state vazio → skip + set marker (sem legacy a migrar)
 *   5. Cria tab "Projeto 1" no registry
 *   6. Persiste snapshot em IDB sob tab-model-snapshot:{tabId}
 *   7. Set marker (idempotência futura)
 *
 * Caller (main.ts bootstrap) chama UMA VEZ no boot quando flags
 * PROJECT_TABS + TAB_MODEL_SWITCH ambas ON.
 */
export async function runLegacyMigration(deps: LegacyMigrationDeps): Promise<LegacyMigrationResult> {
    const now = deps.now || (() => Date.now());
    const force = deps.force || false;
    // Step 1: idempotência marker
    if (!force) {
        try {
            const marker = await deps.idb.get(MIGRATION_MARKER_KEY);
            if (marker) {
                return {
                    ranNow: false,
                    alreadyMigrated: true,
                    legacyDetected: false,
                };
            }
        }
        catch (e: any) {
            return {
                ranNow: false,
                alreadyMigrated: false,
                legacyDetected: false,
                error: `marker_check_failed: ${e?.message || String(e)}`,
            };
        }
    }
    // Step 2: já tem tabs registradas? skip silencioso
    let openTabs: number;
    try {
        openTabs = deps.countOpenTabs();
    }
    catch {
        openTabs = 0;
    }
    if (openTabs > 0) {
        await deps.idb.set(MIGRATION_MARKER_KEY, {
            appliedAtMs: now(),
            version: CURRENT_SCHEMA_VERSION,
            skipReason: 'tabs_already_exist',
        });
        return {
            ranNow: true,
            alreadyMigrated: false,
            legacyDetected: false,
        };
    }
    // Step 3: snapshot current state
    const tempTabId = deps.defaultTabIdForMigration || `tab-${now()}`;
    let snapshot: TabSnapshot | null;
    try {
        snapshot = await deps.snapshotCurrent(tempTabId, deps.bridgeDeps);
    }
    catch (e: any) {
        return {
            ranNow: false,
            alreadyMigrated: false,
            legacyDetected: false,
            error: `snapshot_failed: ${e?.message || String(e)}`,
        };
    }
    // Step 4: state vazio? skip
    const hasLegacy = deps.hasLegacyState
        ? await deps.hasLegacyState()
        : isSnapshotNonEmpty(snapshot);
    if (!hasLegacy) {
        await deps.idb.set(MIGRATION_MARKER_KEY, {
            appliedAtMs: now(),
            version: CURRENT_SCHEMA_VERSION,
            skipReason: 'no_legacy_state',
        });
        return {
            ranNow: true,
            alreadyMigrated: false,
            legacyDetected: false,
        };
    }
    // Step 5: cria tab "Projeto 1" — caller pode retornar id real do registry
    // se registry gera próprio ID diferente do tempTabId.
    const title = deps.defaultTabTitle || 'Projeto 1';
    let actualTabId = tempTabId;
    try {
        const returnedId = deps.createTabRegistryEntry({ id: tempTabId, title });
        if (typeof returnedId === 'string' && returnedId) {
            actualTabId = returnedId;
            // Atualiza snapshot.tabId para bater com id real do registry
            if (snapshot) snapshot.tabId = actualTabId;
        }
    }
    catch (e: any) {
        return {
            ranNow: false,
            alreadyMigrated: false,
            legacyDetected: true,
            error: `create_tab_failed: ${e?.message || String(e)}`,
        };
    }
    // Step 6: persiste snapshot sob actualTabId (real do registry)
    const snapshotKey = buildSnapshotKey(actualTabId);
    try {
        await deps.idb.set(snapshotKey, snapshot);
    }
    catch (e: any) {
        return {
            ranNow: false,
            alreadyMigrated: false,
            legacyDetected: true,
            createdTabId: actualTabId,
            error: `persist_snapshot_failed: ${e?.message || String(e)}`,
        };
    }
    // Step 7: marker idempotência
    await deps.idb.set(MIGRATION_MARKER_KEY, {
        appliedAtMs: now(),
        version: CURRENT_SCHEMA_VERSION,
        createdTabId: actualTabId,
        legacyMigrated: true,
    });
    return {
        ranNow: true,
        alreadyMigrated: false,
        legacyDetected: true,
        createdTabId: actualTabId,
        snapshotKey,
    };
}

// =============================================================================
// Helper: integração browser bootstrap
// =============================================================================

/**
 * Builder de deps default para uso em browser (caller main.ts F8 wire).
 *
 * @example
 *   import { tabRegistry } from './tabRegistry.js';
 *   import { snapshotCurrent } from './modelSwitchBridge.js';
 *   import { buildDefaultBridgeDeps } from './bridgeWire.js';
 *
 *   const result = await runLegacyMigration({
 *       snapshotCurrent,
 *       bridgeDeps: buildDefaultBridgeDeps(),
 *       countOpenTabs: () => tabRegistry.listOpen().length,
 *       createTabRegistryEntry: ({ id, title }) => tabRegistry.openTab({ id, title }),
 *       idb: <adapter>,
 *   });
 */
export interface DefaultMigrationDepsInput {
    snapshotCurrent: LegacyMigrationDeps['snapshotCurrent'];
    bridgeDeps: BridgeDeps;
    countOpenTabs: LegacyMigrationDeps['countOpenTabs'];
    createTabRegistryEntry: LegacyMigrationDeps['createTabRegistryEntry'];
    idb: LegacyMigrationDeps['idb'];
    title?: string;
}

export function buildDefaultMigrationDeps(input: DefaultMigrationDepsInput): LegacyMigrationDeps {
    return {
        snapshotCurrent: input.snapshotCurrent,
        bridgeDeps: input.bridgeDeps,
        countOpenTabs: input.countOpenTabs,
        createTabRegistryEntry: input.createTabRegistryEntry,
        idb: input.idb,
        defaultTabTitle: input.title || 'Projeto 1',
    };
}
