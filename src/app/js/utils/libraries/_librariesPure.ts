// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM — Module C extraction (utils/libraries/manager).
//
// Aplicação direta da recomendação #10 do scripts/refactor-opportunities.mjs:
// utils/libraries/manager.ts tem fan-in 12 no maior SCC. Adicionalmente,
// identificada DUPLICAÇÃO de lógica findDependents entre uninstallLibrary
// (linha 164-168) e deactivateLibrary (linha 232-237). Extração resolve dupe
// + reduz acoplamento entre callers.
//
// Read from canonical .ts source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Segue padrão dos commits 8a4759bc (bilinear dedup)
// + ba7cf7ab (_calculatorItemPure) + f014da01 (_scenesPure).
//
// Spec NOT:
// - NÃO ler module state (installed[] — caller passa array)
// - NÃO chamar persist/dispatchChange — caller dispara side-effects
// - NÃO chamar injectLibrary/removeLibrary — caller orquestra injeção
// - NÃO validateManifest aqui (mantido no validator.js dedicado)
// - NÃO emoji
//
// Extracted helpers:
//   - LibraryManifestLike / InstalledLibrary / DependencyRef (types canonical)
//   - InstallResult                          (canonical return shape)
//   - LIBRARY_RATING_BOUNDS                  (frozen [min,max])
//   - findLibraryById(installed, id)         pure lookup
//   - findActiveDependents(installed, libraryId)  pure dedup helper
//   - checkDependencies(manifest, installed)      pure validation
//   - checkIdConflicts(manifest, installed)       pure validation
//   - canUninstall(installed, libraryId)          pure pre-check → InstallResult
//   - canDeactivate(installed, libraryId)         pure pre-check → InstallResult
//   - createInstallationEntry(manifest, injectedIds, nowIso)
//   - normalizeRating(rating)                pure clamp 1-5
//   - serializeInstalledForExport(installed) pure deep copy
//   - isValidLibraryManifest(value)          type-guard

export interface DependencyRef {
    id: string;
    version?: string;
    [key: string]: unknown;
}

export interface LibraryManifestLike {
    id: string;
    name: string;
    version?: string;
    dependencies?: ReadonlyArray<DependencyRef>;
    [key: string]: unknown;
}

export interface InstalledLibrary {
    manifest: LibraryManifestLike;
    installedAt: string;
    active: boolean;
    rating: number | null;
    injectedIds: any;
    [key: string]: unknown;
}

export interface InstallResult {
    success: boolean;
    error?: string;
}

export const LIBRARY_RATING_BOUNDS: Readonly<{ min: number; max: number }> = Object.freeze({
    min: 1,
    max: 5,
});

/**
 * Pure lookup: find installed library by manifest.id.
 * Matches `installed.find((l) => l.manifest.id === libraryId)` repetido em
 * activateLibrary/deactivateLibrary/uninstallLibrary.
 */
export function findLibraryById(
    installed: ReadonlyArray<InstalledLibrary>,
    libraryId: string,
): InstalledLibrary | null {
    return installed.find((lib) => lib.manifest.id === libraryId) || null;
}

/**
 * Find ACTIVE libraries that declare libraryId in their dependencies.
 * Dedupe de lógica duplicada em uninstallLibrary (manager.ts:164-168) e
 * deactivateLibrary (manager.ts:232-237).
 *
 * Returns array de libs com manifest.name pronto para mensagem ao usuário.
 */
export function findActiveDependents(
    installed: ReadonlyArray<InstalledLibrary>,
    libraryId: string,
): InstalledLibrary[] {
    return installed.filter((lib) => {
        if (lib.manifest.id === libraryId) return false;
        if (!lib.active) return false;
        const deps = lib.manifest.dependencies || [];
        return deps.some((dep) => dep && dep.id === libraryId);
    });
}

/**
 * Check unmet dependencies: returns array de mensagens de erro.
 * Empty array = todas as dependências atendidas.
 *
 * Matches checkDependencies (referenciado de validator.js mas re-extraído aqui
 * porque é lógica de "manifest×installed", não de "manifest×schema").
 */
export function checkDependencies(
    manifest: LibraryManifestLike,
    installed: ReadonlyArray<InstalledLibrary>,
): string[] {
    const errors: string[] = [];
    const deps = manifest.dependencies || [];
    for (const dep of deps) {
        if (!dep || !dep.id) continue;
        const found = installed.find((lib) => lib.manifest.id === dep.id && lib.active);
        if (!found) {
            errors.push(`Missing or inactive dependency: ${dep.id}`);
        }
    }
    return errors;
}

/**
 * Check id conflicts: returns array de mensagens de erro.
 * Empty array = sem conflito (manifest.id não está em installed).
 */
export function checkIdConflicts(
    manifest: LibraryManifestLike,
    installed: ReadonlyArray<InstalledLibrary>,
): string[] {
    const errors: string[] = [];
    if (!manifest || !manifest.id) return errors;
    const exists = installed.find((lib) => lib.manifest.id === manifest.id);
    if (exists) {
        errors.push(`Library "${manifest.id}" already installed`);
    }
    return errors;
}

/**
 * Pure pre-check para uninstall: returns InstallResult.
 *   Library não encontrada → success: false
 *   Library bloqueada por dependentes ativos → success: false com lista
 *   OK para uninstall → success: true
 *
 * Matches uninstallLibrary pre-flight @ manager.ts:158-173.
 */
export function canUninstall(
    installed: ReadonlyArray<InstalledLibrary>,
    libraryId: string,
): InstallResult {
    const lib = findLibraryById(installed, libraryId);
    if (!lib) return { success: false, error: `Library "${libraryId}" not found` };
    const dependents = findActiveDependents(installed, libraryId);
    if (dependents.length > 0) {
        const names = dependents.map((d) => d.manifest.name || d.manifest.id).join(', ');
        return { success: false, error: `Cannot uninstall: required by ${names}` };
    }
    return { success: true };
}

/**
 * Pure pre-check para deactivate: returns InstallResult.
 * Matches deactivateLibrary pre-flight @ manager.ts:228-242.
 */
export function canDeactivate(
    installed: ReadonlyArray<InstalledLibrary>,
    libraryId: string,
): InstallResult {
    const lib = findLibraryById(installed, libraryId);
    if (!lib) return { success: false, error: `Library "${libraryId}" not found` };
    if (!lib.active) return { success: true };
    const dependents = findActiveDependents(installed, libraryId);
    if (dependents.length > 0) {
        const names = dependents.map((d) => d.manifest.name || d.manifest.id).join(', ');
        return { success: false, error: `Cannot deactivate: required by ${names}` };
    }
    return { success: true };
}

/**
 * Pure factory: create InstalledLibrary entry shape.
 * Caller injeta `nowIso` para testabilidade (Date.now control).
 *
 * Matches installed.push body @ manager.ts:140-146.
 */
export function createInstallationEntry(
    manifest: LibraryManifestLike,
    injectedIds: any,
    nowIso: string,
): InstalledLibrary {
    return {
        manifest,
        installedAt: nowIso,
        active: true,
        rating: null,
        injectedIds,
    };
}

/**
 * Normalize rating to LIBRARY_RATING_BOUNDS (clamp).
 *   < min → min
 *   > max → max
 *   non-finite → null (rejeita rating inválido)
 *
 * Matches rateLibrary body @ manager.ts:313+.
 */
export function normalizeRating(rating: unknown): number | null {
    const n = Number(rating);
    if (!Number.isFinite(n)) return null;
    if (n < LIBRARY_RATING_BOUNDS.min) return LIBRARY_RATING_BOUNDS.min;
    if (n > LIBRARY_RATING_BOUNDS.max) return LIBRARY_RATING_BOUNDS.max;
    return n;
}

/**
 * Pure deep copy for export — preserva manifest mas clona top-level fields.
 * Matches exportLibraries @ manager.ts:330+.
 */
export function serializeInstalledForExport(
    installed: ReadonlyArray<InstalledLibrary>,
): InstalledLibrary[] {
    return installed.map((lib) => ({
        manifest: { ...lib.manifest },
        installedAt: lib.installedAt,
        active: lib.active,
        rating: lib.rating,
        injectedIds: lib.injectedIds,
    }));
}

/**
 * Type-guard for LibraryManifestLike shape.
 * Aceita manifests vindos de import / API / IndexedDB.
 */
export function isValidLibraryManifest(value: unknown): value is LibraryManifestLike {
    if (!value || typeof value !== 'object') return false;
    const m = value as LibraryManifestLike;
    if (typeof m.id !== 'string' || m.id.length === 0) return false;
    if (typeof m.name !== 'string' || m.name.length === 0) return false;
    return true;
}
