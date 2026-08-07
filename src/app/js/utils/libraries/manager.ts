// @ts-check
// Generated from src/app/js/utils/libraries/manager.ts by TS-MIGRATION-001. Do not edit manually.
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   LIBRARY MANAGER — Core CRUD and state management
   Gerenciador principal de bibliotecas

   Responsavel por instalar, desinstalar, ativar, desativar e
   persistir o estado das bibliotecas no localStorage.
   Segue o mesmo padrao de groups/manager.js e ticker/manager.js.
   ================================================================ */
import { validateManifest, checkDependencies, checkIdConflicts } from './validator.js';
import { injectLibrary, removeLibrary } from './loader.js';
import { isEphemeral, safeSetItem } from '../storage/storageMonitor.js';
type InstalledLibrary = {
    manifest: any;
    installedAt: string;
    active: boolean;
    rating: any;
    injectedIds: any;
};
// ----------------------------------------------------------------
// MODULE STATE
// Estado do modulo - closure privada
// ----------------------------------------------------------------
const STORAGE_KEY = 'ecbyts-libraries';
/**
 * Array of installed libraries.
 * Cada entrada: { manifest, installedAt, active, rating, injectedIds }
 * @type {any[]}
 */
let installed: InstalledLibrary[] = [];
// ----------------------------------------------------------------
// PERSISTENCE
// Salva/carrega do localStorage
// ----------------------------------------------------------------
function persist() {
    if (isEphemeral()) return;
    // Save manifests + metadata (not injectedIds runtime state)
    const serializable = installed.map((lib) => ({
        manifest: lib.manifest,
        installedAt: lib.installedAt,
        active: lib.active,
        rating: lib.rating,
        injectedIds: lib.injectedIds,
    }));
    safeSetItem(STORAGE_KEY, JSON.stringify(serializable));
}
function dispatchChange() {
    window.dispatchEvent(new CustomEvent('librariesChanged'));
}
// ----------------------------------------------------------------
// INITIALIZATION
// Restaura estado salvo e reativa bibliotecas ativas
// ----------------------------------------------------------------
/**
 * Initialize libraries from localStorage.
 * Restaura bibliotecas salvas e reativa as que estavam ativas.
 */
export function initLibraries() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY) || '';
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                // Restore entries but re-inject active ones
                installed = parsed.map((entry) => ({
                    manifest: entry.manifest,
                    installedAt: entry.installedAt,
                    active: false, // Will be re-activated below
                    rating: entry.rating || null,
                    injectedIds: null, // Will be re-populated on activation
                }));
                // Re-activate libraries that were active
                for (const entry of parsed) {
                    if (entry.active) {
                        const lib = installed.find((l) => l.manifest.id === entry.manifest.id);
                        if (lib) {
                            try {
                                lib.injectedIds = injectLibrary(lib.manifest);
                                lib.active = true;
                            } catch (e: any) {
                                console.warn(`[Libraries] Failed to re-activate "${lib.manifest.id}":`, e.message);
                            }
                        }
                    }
                }
            }
        }
    } catch (e: any) {
        console.warn('[Libraries] Error loading from localStorage:', e.message);
        installed = [];
    }
}
// ----------------------------------------------------------------
// INSTALL / UNINSTALL
// Instalar e desinstalar bibliotecas
// ----------------------------------------------------------------
/**
 * Install a library from its manifest.
 * Valida, verifica dependencias, injeta e persiste.
 *
 * @param {Object} manifest - Library manifest
 * @returns {{ success: boolean, error?: string }}
 */
export function installLibrary(manifest: any) {
    // Validate manifest structure
    const validation = validateManifest(manifest);
    if (!validation.valid) {
        return { success: false, error: `Invalid manifest: ${validation.errors.join('; ')}` };
    }
    // Check dependencies
    const depErrors = checkDependencies(manifest, installed);
    if (depErrors.length > 0) {
        return { success: false, error: depErrors.join('; ') };
    }
    // Check ID conflicts
    const conflictErrors = checkIdConflicts(manifest, installed);
    if (conflictErrors.length > 0) {
        return { success: false, error: conflictErrors.join('; ') };
    }
    // Inject content
    let injectedIds;
    try {
        injectedIds = injectLibrary(manifest);
    } catch (e: any) {
        return { success: false, error: `Injection failed: ${e.message}` };
    }
    // Store installed entry
    installed.push({
        manifest,
        installedAt: new Date().toISOString(),
        active: true,
        rating: null,
        injectedIds,
    });
    persist();
    dispatchChange();
    return { success: true };
}
/**
 * Uninstall a library by ID.
 * Remove todo o conteudo injetado e apaga do registro.
 *
 * @param {string} libraryId - Library ID
 * @returns {{ success: boolean, error?: string }}
 */
export function uninstallLibrary(libraryId: string) {
    const idx = installed.findIndex((lib) => lib.manifest.id === libraryId);
    if (idx === -1) {
        return { success: false, error: `Library "${libraryId}" not found` };
    }
    // Check if other libraries depend on this one
    const dependents = installed.filter(
        (lib) =>
            lib.manifest.id !== libraryId &&
            lib.active &&
            (lib.manifest.dependencies || []).some((dep: any) => dep.id === libraryId),
    );
    if (dependents.length > 0) {
        const names = dependents.map((d) => d.manifest.name).join(', ');
        return { success: false, error: `Cannot uninstall: required by ${names}` };
    }
    const lib = installed[idx];
    if (!lib) {
        return { success: false, error: `Library "${libraryId}" not found` };
    }
    // Remove injected content if active
    if (lib.active && lib.injectedIds) {
        try {
            removeLibrary(lib.manifest, lib.injectedIds);
        } catch (e: any) {
            console.warn(`[Libraries] Error removing content for "${libraryId}":`, e.message);
        }
    }
    installed.splice(idx, 1);
    persist();
    dispatchChange();
    return { success: true };
}
// ----------------------------------------------------------------
// ACTIVATE / DEACTIVATE
// Ativar e desativar bibliotecas sem desinstalar
// ----------------------------------------------------------------
/**
 * Activate an installed library.
 * Injeta o conteudo da biblioteca nos modulos.
 *
 * @param {string} libraryId
 * @returns {{ success: boolean, error?: string }}
 */
export function activateLibrary(libraryId: string) {
    const lib = installed.find((l) => l.manifest.id === libraryId);
    if (!lib) return { success: false, error: `Library "${libraryId}" not found` };
    if (lib.active) return { success: true };
    // Check dependencies are active
    const depErrors = checkDependencies(lib.manifest, installed);
    if (depErrors.length > 0) {
        return { success: false, error: depErrors.join('; ') };
    }
    try {
        lib.injectedIds = injectLibrary(lib.manifest);
        lib.active = true;
    } catch (e: any) {
        return { success: false, error: `Activation failed: ${e.message}` };
    }
    persist();
    dispatchChange();
    return { success: true };
}
/**
 * Deactivate an installed library.
 * Remove o conteudo injetado mas mantem instalada.
 *
 * @param {string} libraryId
 * @returns {{ success: boolean, error?: string }}
 */
export function deactivateLibrary(libraryId: string) {
    const lib = installed.find((l) => l.manifest.id === libraryId);
    if (!lib) return { success: false, error: `Library "${libraryId}" not found` };
    if (!lib.active) return { success: true };
    // Check if other active libraries depend on this one
    const dependents = installed.filter(
        (l) =>
            l.manifest.id !== libraryId &&
            l.active &&
            (l.manifest.dependencies || []).some((dep: any) => dep.id === libraryId),
    );
    if (dependents.length > 0) {
        const names = dependents.map((d) => d.manifest.name).join(', ');
        return { success: false, error: `Cannot deactivate: required by ${names}` };
    }
    if (lib.injectedIds) {
        try {
            removeLibrary(lib.manifest, lib.injectedIds);
        } catch (e: any) {
            console.warn(`[Libraries] Error removing content for "${libraryId}":`, e.message);
        }
    }
    lib.active = false;
    lib.injectedIds = null;
    persist();
    dispatchChange();
    return { success: true };
}
// ----------------------------------------------------------------
// CLEAR ALL
// Remove todas as bibliotecas (usado por handleClearModel)
// ----------------------------------------------------------------
/**
 * Uninstall all libraries and clear state.
 * Remove todo conteudo injetado e limpa localStorage.
 */
export function clearAllLibraries() {
    // Remove injected content from active libraries
    for (const lib of installed) {
        if (lib.active && lib.injectedIds) {
            try {
                removeLibrary(lib.manifest, lib.injectedIds);
            } catch (e: any) {
                console.warn('[Libraries] Error removing:', e.message);
            }
        }
    }
    installed = [];
    persist();
    dispatchChange();
}
// ----------------------------------------------------------------
// QUERY FUNCTIONS
// Funcoes de consulta
// ----------------------------------------------------------------
/** @returns {Object[]} All installed libraries */
export function getInstalledLibraries() {
    return [...installed];
}
/** @returns {Object[]} Only active libraries */
export function getActiveLibraries() {
    return installed.filter((lib) => lib.active);
}
/**
 * Get library by ID.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getLibraryById(id: string) {
    return installed.find((lib) => lib.manifest.id === id);
}
/**
 * Check if a library is active.
 * @param {string} id
 * @returns {boolean}
 */
export function isLibraryActive(id: string) {
    const lib = installed.find((l) => l.manifest.id === id);
    return lib?.active || false;
}
/**
 * Rate a library (1-5 stars).
 * @param {string} id
 * @param {number} rating
 */
export function rateLibrary(id: string, rating: number) {
    const lib = installed.find((l) => l.manifest.id === id);
    if (lib) {
        lib.rating = Math.max(1, Math.min(5, Math.round(rating)));
        persist();
    }
}
// ----------------------------------------------------------------
// EXPORT / IMPORT
// Serializacao para modelo (buildModel / applyModel)
// ----------------------------------------------------------------
/**
 * Export library state for model serialization.
 * Retorna dados para inclusao no buildModel().
 *
 * @returns {Object|null}
 */
export function exportLibraries() {
    if (installed.length === 0) return null;
    return installed.map((lib) => ({
        manifest: lib.manifest,
        active: lib.active,
        rating: lib.rating,
    }));
}
/**
 * Import library state from model.
 * Restaura bibliotecas a partir de dados importados.
 *
 * @param {any[]} data - Array of { manifest, active, rating }
 */
export function importLibraries(data: any[]) {
    if (!Array.isArray(data)) return;
    // First deactivate and clear current libraries
    for (const lib of installed) {
        if (lib.active && lib.injectedIds) {
            try {
                removeLibrary(lib.manifest, lib.injectedIds);
            } catch (e: any) {
                console.debug('[libraries/manager] removeLib:', e?.message || e);
                /* skip */
            }
        }
    }
    installed = [];
    // Install each library from imported data
    for (const entry of data) {
        if (!entry.manifest) continue;
        const validation = validateManifest(entry.manifest);
        if (!validation.valid) {
            console.warn(`[Libraries] Skipping invalid manifest "${entry.manifest.id}":`, validation.errors);
            continue;
        }
        let injectedIds = null;
        let active = false;
        if (entry.active) {
            try {
                injectedIds = injectLibrary(entry.manifest);
                active = true;
            } catch (e: any) {
                console.warn(`[Libraries] Failed to activate imported "${entry.manifest.id}":`, e.message);
            }
        }
        installed.push({
            manifest: entry.manifest,
            installedAt: new Date().toISOString(),
            active,
            rating: entry.rating || null,
            injectedIds,
        });
    }
    persist();
    dispatchChange();
}
//# sourceMappingURL=manager.js.map
//# sourceMappingURL=manager.js.map
