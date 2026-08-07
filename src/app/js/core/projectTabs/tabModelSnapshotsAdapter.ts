// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * TAB-MODEL-SWITCH-001 F4 (claude - novaspec, 2026-05-31) — IDB Adapter.
 *
 * Implementação concreta do `IdbAdapter` interface esperado por
 * modelSwitchBridge (F3). Persiste TabSnapshot objects sob namespace
 * canônico `tab-model-snapshot:{tabId}` no IndexedDB via utils/storage/idbStore.
 *
 * Não confundir com `idbAdapter.ts` adjacente — aquele persiste a LISTA de
 * tabs abertas (registry + UI state); este persiste o CONTEÚDO da MODELO
 * (snapshots de managers) por tab. Namespaces separados evitam colisão.
 *
 * Schema versioning:
 *   - schemaVersion=1 (canônico atual)
 *   - migration helpers para futuras versões (currentlyt no-op)
 *   - Validação de payload no get (rejeita schemaVersion incompatível)
 *
 * Refs:
 *   - SPEC `docs/specs/features/SPEC_TAB_MODEL_SWITCH_INTEGRATION.md` §4.3
 *   - F3 commit 2bbf851b (IdbAdapter interface)
 */

import { idbSet, idbGet, idbDelete } from '../../utils/storage/idbStore.js';

// =============================================================================
// Constantes canônicas
// =============================================================================

/**
 * Namespace para snapshots de MODELO por tab. Distinto de
 * `ecbyts-project-tab-snapshot:` (idbAdapter.ts adjacente) para evitar
 * colisão semântica entre UI state e content state.
 */
export const TAB_MODEL_SNAPSHOT_KEY_PREFIX = 'tab-model-snapshot:';

/**
 * Schema version corrente. Incrementa em migrations breaking.
 */
export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * Marker IDB key indicando que migration v1 foi aplicada (idempotência).
 */
export const MIGRATION_MARKER_KEY = 'tab-model-snapshot:_migrated:v1';

// =============================================================================
// Helpers de chave
// =============================================================================

/**
 * Constrói key canônica para tabSnapshot. Caller (bridge) passa apenas o
 * tabId; adapter compõe namespace completo.
 *
 * @example
 *   buildSnapshotKey('tab-abc') → 'tab-model-snapshot:tab-abc'
 */
export function buildSnapshotKey(tabId: string): string {
    if (!tabId || typeof tabId !== 'string') {
        throw new TypeError('buildSnapshotKey: tabId must be a non-empty string');
    }
    return `${TAB_MODEL_SNAPSHOT_KEY_PREFIX}${tabId}`;
}

/**
 * Extrai tabId de uma key canônica. Retorna null se key não bate.
 */
export function parseSnapshotKey(key: string): string | null {
    if (!key || !key.startsWith(TAB_MODEL_SNAPSHOT_KEY_PREFIX)) return null;
    return key.slice(TAB_MODEL_SNAPSHOT_KEY_PREFIX.length) || null;
}

// =============================================================================
// Validação de payload
// =============================================================================

/**
 * Valida que payload tem shape de TabSnapshot esperado pelo bridge.
 * Rejeita schemaVersion incompatível (caller deve migrar).
 */
export interface PayloadValidation {
    valid: boolean;
    errors: string[];
}

export function validateSnapshotPayload(payload: unknown): PayloadValidation {
    const errors: string[] = [];
    if (!payload || typeof payload !== 'object') {
        return { valid: false, errors: ['payload_null'] };
    }
    const p = payload as any;
    if (p.schemaVersion !== CURRENT_SCHEMA_VERSION) {
        errors.push(`schema_version_mismatch:expected=${CURRENT_SCHEMA_VERSION},got=${p.schemaVersion}`);
    }
    if (!p.tabId || typeof p.tabId !== 'string') errors.push('missing_tabId');
    if (typeof p.capturedAtMs !== 'number') errors.push('missing_capturedAtMs');
    if (!p.managers || typeof p.managers !== 'object') errors.push('missing_managers');
    return { valid: errors.length === 0, errors };
}

/**
 * Hardening preventivo (2026-06-02, lição IS-5/6 ROOT CAUSE):
 *
 * `validateSnapshotPayload` valida SHAPE mas não detecta function refs ou
 * objetos não-cloneable que IndexedDB rejeita silenciosamente (tx aborta
 * sem throw visível ao caller).
 *
 * Esta função usa `structuredClone` para SIMULAR o que IDB fará. Se
 * lançar `DataCloneError`, snapshot tem function/Symbol/class instance
 * embutido que vazaria. Retorna validation com erro descritivo.
 *
 * Custo: structuredClone é O(payload size) — para snapshots típicos
 * ~6MB JSON, ~20-40ms. Aceitável em hot path (snapshot 1×/switch).
 *
 * Caller (adapter.set) chama isto ANTES de idbSet — converte falha
 * silenciosa em throw explícito, surfaceando bug em desenvolvimento.
 */
export function validateStructuredCloneable(payload: unknown): PayloadValidation {
    if (typeof (globalThis as any).structuredClone !== 'function') {
        // Environment sem structuredClone (Node test runner ≤17) — skip
        // gracioso. Browsers todos suportam desde 2022 (Safari 15.4+).
        return { valid: true, errors: [] };
    }
    try {
        (globalThis as any).structuredClone(payload);
        return { valid: true, errors: [] };
    }
    catch (e: any) {
        const msg = e?.message || String(e);
        return { valid: false, errors: [`structured_clone_failed:${msg.slice(0, 200)}`] };
    }
}

// =============================================================================
// IdbAdapter implementation
// =============================================================================

/**
 * Bridge F3 espera interface `IdbAdapter` com 3 métodos:
 *   - get(key) → TabSnapshot | null
 *   - set(key, value) → void
 *   - delete(key) → void
 *
 * Esta factory retorna implementação real que delega para utils/storage/idbStore.
 * Testes substituem por mock in-memory.
 *
 * IMPORTANTE: caller (bridge) JÁ compõe key completa via buildSnapshotKey.
 * Adapter recebe key crua e delega para idbStore. NÃO compõe namespace
 * internamente — separação de responsabilidades.
 */
export function createTabModelSnapshotsAdapter() {
    return {
        async get(key: string): Promise<any | null> {
            const raw = await idbGet(key);
            if (raw === null || raw === undefined) return null;
            // BUG-4 fix (2026-06-02): marker key não é TabSnapshot, retorna raw
            // sem validação. Caller (legacyTabMigration) lê marker para
            // idempotência — marker tem shape {appliedAtMs, version, skipReason}.
            if (key === MIGRATION_MARKER_KEY) return raw;
            const validation = validateSnapshotPayload(raw);
            if (!validation.valid) {
                console.debug('[tabModelSnapshotsAdapter:get] invalid payload', {
                    key,
                    errors: validation.errors,
                });
                return null; // graceful degradation — caller trata como cold tab
            }
            return raw;
        },
        async set(key: string, value: any): Promise<void> {
            // BUG-4 fix (2026-06-02): marker key tem shape própria
            // ({appliedAtMs, version, skipReason}) — bypassa validação
            // de TabSnapshot. Migration grava marker via mesmo adapter
            // para idempotência (apenas 1 chamada IDB por write).
            if (key === MIGRATION_MARKER_KEY) {
                await idbSet(key, value);
                return;
            }
            // L1: Validação shape (schemaVersion + tabId + managers + capturedAtMs)
            const validation = validateSnapshotPayload(value);
            if (!validation.valid) {
                throw new Error(`tabModelSnapshotsAdapter.set: invalid payload — ${validation.errors.join(', ')}`);
            }
            // L2 (2026-06-02 hardening, IS-5/6 ROOT CAUSE defense): validar
            // que payload é structured-cloneable. IndexedDB usa structured
            // clone internamente — se payload tem function/Symbol/class
            // instance, tx aborta SILENCIOSAMENTE (oncomplete não dispara,
            // mas adapter.set ainda resolve OK). Throw explícito surfacea
            // bug ao caller (manager.exportState vazando ref).
            const cloneValidation = validateStructuredCloneable(value);
            if (!cloneValidation.valid) {
                throw new Error(`tabModelSnapshotsAdapter.set: payload not cloneable — ${cloneValidation.errors.join(', ')}`);
            }
            await idbSet(key, value);
        },
        async delete(key: string): Promise<void> {
            await idbDelete(key);
        },
    };
}

// =============================================================================
// Migration v1 (one-shot legacy → tab-model-snapshot:)
// =============================================================================

/**
 * Migration v1: detecta state legacy single-tab (existência de chaves IDB
 * de managers que NÃO estão em namespace tab-model-snapshot:) e migra
 * para nova tab "Projeto 1".
 *
 * Idempotente: marker `tab-model-snapshot:_migrated:v1` em IDB indica que
 * já rodou. Re-execução é no-op.
 *
 * **NOTA F4:** esta migration é STUB nesta fase. Detecção de state legacy
 * + criação automática de "Projeto 1" são wired em F8 (migration legacy).
 * F4 entrega apenas adapter + idempotência marker.
 */
export interface MigrationResult {
    ranNow: boolean;
    alreadyMigrated: boolean;
    legacyDetected: boolean;
    createdTabId?: string;
}

export async function runMigrationV1(opts?: {
    /** Override para testes: força execução mesmo com marker */
    force?: boolean;
    /** Override para testes: substituir clock para tabId determinístico */
    now?: () => number;
}): Promise<MigrationResult> {
    const force = opts?.force || false;
    if (!force) {
        const marker = await idbGet(MIGRATION_MARKER_KEY);
        if (marker) {
            return {
                ranNow: false,
                alreadyMigrated: true,
                legacyDetected: false,
            };
        }
    }
    // F4 entrega stub — F8 implementará detecção real de state legacy e
    // criação automática de "Projeto 1"
    const legacyDetected = false;
    // Marca migração como aplicada (idempotência)
    await idbSet(MIGRATION_MARKER_KEY, {
        appliedAtMs: opts?.now ? opts.now() : Date.now(),
        version: CURRENT_SCHEMA_VERSION,
    });
    return {
        ranNow: true,
        alreadyMigrated: false,
        legacyDetected,
    };
}

/**
 * Reset migration marker (teardown de testes).
 * NÃO chamar em produção — invalida idempotência.
 */
export async function _resetMigrationMarkerForTesting(): Promise<void> {
    await idbDelete(MIGRATION_MARKER_KEY);
}

// =============================================================================
// Mock adapter (para testes do bridge sem IDB real)
// =============================================================================

/**
 * In-memory mock do IdbAdapter — útil para testes em Node sem IDB real.
 * NÃO usar em produção (state perdido em refresh).
 *
 * Implementa mesma interface IdbAdapter + helper _store para inspeção.
 */
export function createInMemoryMockAdapter() {
    const store = new Map<string, any>();
    return {
        async get(key: string): Promise<any | null> {
            const v = store.get(key);
            return v === undefined ? null : v;
        },
        async set(key: string, value: any): Promise<void> {
            const validation = validateSnapshotPayload(value);
            if (!validation.valid) {
                throw new Error(`mockAdapter.set: invalid payload — ${validation.errors.join(', ')}`);
            }
            store.set(key, value);
        },
        async delete(key: string): Promise<void> {
            store.delete(key);
        },
        _store: store,
        _clear() {
            store.clear();
        },
        _size() {
            return store.size;
        },
    };
}
