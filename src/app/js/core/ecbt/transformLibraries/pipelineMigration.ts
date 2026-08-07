// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Migration (Phase 10)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S10
 *
 * Phase 10 (2026-05-01) - pure-logic migration runner para evoluir
 * pipelines salvos quando o schema do catálogo (Phase 8) ou o formato
 * de step config muda entre versões.
 *
 * Estratégia:
 *   - Migração é função `(payload) => payload` registrada por
 *     `(fromVersion, toVersion)` no MIGRATION_REGISTRY
 *   - Runner aplica chain: v1→v2→v3 quando target distância > 1
 *   - Validação fail-closed: rejeita downgrades, gaps de versão
 *   - Side-effect free; entrada não é mutada
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

const SUPPORTED_FROM_VERSION = 1;
const CURRENT_VERSION = 1; // bump quando schema mudar; adicionar migration

/** Identidade do migration runner. */
export const PIPELINE_MIGRATION_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 10,
    deliveredAt: '2026-05-01',
    supportedFromVersion: SUPPORTED_FROM_VERSION,
    currentVersion: CURRENT_VERSION,
});

/**
 * Registry de migrations. Chave: "fromV→toV". Valor: pure function.
 *
 * Cada migration recebe `payload` (objeto com `version` + `pipelines`)
 * e retorna novo payload com versão incrementada.
 *
 * Quando schema mudar, adicionar entries aqui em ordem incremental.
 * Por enquanto, no-ops para identity (v1→v1).
 */
export const MIGRATION_REGISTRY = Object.freeze({
    // Future migrations:
    // '1→2': (payload) => ({ ...payload, version: 2, pipelines: payload.pipelines.map(...) }),
    // '2→3': (payload) => ({ ...payload, version: 3, pipelines: payload.pipelines.map(...) }),
});

/**
 * Detecta versão de um payload de catálogo.
 *
 * @param {Record<string, any>} payload
 * @returns {number} versão detectada
 */
export function detectVersion(payload: Record<string, any>): number {
    if (!payload || typeof payload !== 'object') {
        throw new TypeError('payload must be object');
    }
    const v = Number(payload.version);
    if (!Number.isInteger(v) || v < 1) {
        throw new Error(`Invalid version "${payload.version}"`);
    }
    return v;
}

/**
 * Determina caminho de migração de fromV até toV.
 *
 * @param {number} fromV
 * @param {number} toV
 * @returns {Array<string>} chain de chaves "x→y"
 */
export function planMigrationPath(fromV: number, toV: number): Array<string> {
    if (!Number.isInteger(fromV) || fromV < 1) {
        throw new RangeError('fromV must be positive integer');
    }
    if (!Number.isInteger(toV) || toV < 1) {
        throw new RangeError('toV must be positive integer');
    }
    if (fromV > toV) {
        throw new Error(`Downgrade not supported (from ${fromV} to ${toV})`);
    }
    if (fromV === toV) return [];

    const chain = [];
    for (let v = fromV; v < toV; v++) {
        const key = `${v}→${v + 1}`;
        if (!Object.prototype.hasOwnProperty.call(MIGRATION_REGISTRY, key)) {
            throw new Error(`No migration registered for ${key}`);
        }
        chain.push(key);
    }
    return chain;
}

/**
 * Aplica chain de migrations sequencialmente.
 *
 * @param {Object} payload
 * @param {number} [targetVersion] - default: CURRENT_VERSION
 * @returns {Object} payload migrado
 */
export function migrateToVersion(payload: any, targetVersion = CURRENT_VERSION): object {
    const fromV = detectVersion(payload);
    if (fromV < SUPPORTED_FROM_VERSION) {
        throw new Error(`Unsupported source version ${fromV} (min ${SUPPORTED_FROM_VERSION})`);
    }
    const chain = planMigrationPath(fromV, targetVersion);
    if (chain.length === 0) {
        // identity - return shallow clone para evitar mutação acidental
        return { ...payload };
    }
    let current = payload;
    for (const step of chain) {
        const fn = (MIGRATION_REGISTRY as Record<string, any>)[step];
        if (typeof fn !== 'function') {
            throw new Error(`Migration "${step}" is not a function`);
        }
        current = fn(current);
    }
    return current;
}

/**
 * Tenta migrar; retorna `{ok, payload, error}`.
 *
 * @param {Record<string, any>} payload
 * @param {number} [any>]
 * @returns {{ok: boolean, payload?: Object, error?: string}}
 */
export function tryMigrate(
    payload: Record<string, any>,
    targetVersion = CURRENT_VERSION,
): { ok: boolean; payload?: object; error?: string } {
    try {
        const migrated = migrateToVersion(payload, targetVersion);
        return { ok: true, payload: migrated };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
}

/**
 * Verifica se migração de fromV até toV é factível.
 *
 * @param {number} fromV
 * @param {number} toV
 * @returns {boolean}
 */
export function canMigrate(fromV: number, toV: number): boolean {
    try {
        planMigrationPath(fromV, toV);
        return true;
    } catch {
        return false;
    }
}

/**
 * Lista todas as migrations registradas.
 *
 * @returns {Array<string>}
 */
export function listMigrations(): Array<string> {
    return Object.keys(MIGRATION_REGISTRY).sort();
}

/**
 * Module identity export.
 */
export const pipelineMigrationMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 10,
    deliveredAt: '2026-05-01',
    supportedFromVersion: SUPPORTED_FROM_VERSION,
    currentVersion: CURRENT_VERSION,
    registeredMigrations: listMigrations(),
    exports: [
        'PIPELINE_MIGRATION_META',
        'MIGRATION_REGISTRY',
        'detectVersion',
        'planMigrationPath',
        'migrateToVersion',
        'tryMigrate',
        'canMigrate',
        'listMigrations',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
