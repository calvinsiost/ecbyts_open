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
   LOCKED FIELDS ENGINE — Campos travados por bibliotecas
   Motor de campos bloqueados injetados por bibliotecas

   Bibliotecas podem declarar campos "locked" que nao podem ser
   removidos, ocultados ou editados pelo usuario final.

   NIVEIS DE LOCK:
   - display: Campo visivel, nao removivel (ex: badge no ticker)
   - value:   Campo com valor fixo, nao editavel (ex: unidade padrao)
   - module:  Modulo inteiro obrigatorio enquanto lib ativa

   TIPOS DE LOCK:
   - ticker_badge:     Badge permanente na barra de metricas
   - parameter_value:  Trava campo de um parametro
   - family_enabled:   Impede desativar uma familia
   - module:           Impede desativar secao inteira
   - disclaimer:       Injeta texto de aviso na UI
   ================================================================ */

// ----------------------------------------------------------------
// STATE
// Registro de campos travados - Map<lockId, lockEntry>
// ----------------------------------------------------------------

const lockedFields = new Map<string, Record<string, any>>();

interface LockDef {
    id: string;
    type: string;
    lock: string;
    target?: string;
    field?: string;
    value?: unknown;
    content?: Record<string, any>;
}

// ----------------------------------------------------------------
// REGISTRATION
// Registra e remove locks
// ----------------------------------------------------------------

/**
 * Register a locked field from a library.
 * Registra um campo travado definido por uma biblioteca.
 *
 * @param lockDef - Lock definition from manifest
 * @param libraryId - ID of the library registering this lock
 */
export function registerLock(lockDef: LockDef, libraryId: string): void {
    lockedFields.set(lockDef.id, {
        ...lockDef,
        libraryId,
    });
}

/**
 * Unregister a single lock by ID.
 * Remove um lock especifico pelo ID.
 *
 * @param lockId - Lock ID to remove
 */
export function unregisterLock(lockId: string): void {
    lockedFields.delete(lockId);
}

/**
 * Unregister all locks from a library.
 * Remove todos os locks registrados por uma biblioteca.
 *
 * @param libraryId - Library ID
 */
export function unregisterLibraryLocks(libraryId: string): void {
    for (const [key, entry] of lockedFields) {
        if (entry.libraryId === libraryId) {
            lockedFields.delete(key);
        }
    }
}

// ----------------------------------------------------------------
// QUERY FUNCTIONS
// Funcoes de consulta para a UI
// ----------------------------------------------------------------

/**
 * Check if a target+field is locked and at what level.
 * Verifica se um campo esta travado e retorna o nivel de lock.
 *
 * @param target - Target ID (family ID, parameter ID, etc.)
 * @param field? - Specific field name (optional)
 * @returns Lock level ('display', 'value', 'module') or null
 */
export function isFieldLocked(target: string, field?: string): string | null {
    for (const entry of lockedFields.values()) {
        if (entry.target === target) {
            // If field is specified, check exact match
            if (field && entry.field === field) return entry.lock;
            // If no field specified, any lock on target counts
            if (!field) return entry.lock;
            // family_enabled locks apply to the whole family
            if (entry.type === 'family_enabled') return entry.lock;
        }
    }
    return null;
}

/**
 * Get all locked badges for the ticker bar.
 * Retorna todos os badges travados para renderizar no ticker.
 *
 * @returns Array of { id, label, icon, color, libraryId }
 */
export function getLockedBadges(): Record<string, unknown>[] {
    const badges: Record<string, unknown>[] = [];
    for (const entry of lockedFields.values()) {
        if (entry.type === 'ticker_badge' && entry.content) {
            badges.push({
                id: entry.id,
                label: entry.content.label || '',
                icon: entry.content.icon || 'lock',
                color: entry.content.color || '#888',
                libraryId: entry.libraryId,
            });
        }
    }
    return badges;
}

/**
 * Get all module-level locks.
 * Retorna todos os locks de nivel modulo.
 *
 * @returns Array of lock entries with type 'module'
 */
export function getModuleLocks(): Record<string, unknown>[] {
    const locks: Record<string, unknown>[] = [];
    for (const entry of lockedFields.values()) {
        if (entry.type === 'module') locks.push(entry);
    }
    return locks;
}

/**
 * Get all disclaimer locks.
 * Retorna todos os disclaimers ativos.
 *
 * @returns Array of disclaimer lock entries
 */
export function getDisclaimers(): Record<string, unknown>[] {
    const disclaimers: Record<string, unknown>[] = [];
    for (const entry of lockedFields.values()) {
        if (entry.type === 'disclaimer') disclaimers.push(entry);
    }
    return disclaimers;
}

/**
 * Get all active locks as array.
 * Retorna todos os locks registrados.
 */
export function getAllLocks(): Record<string, unknown>[] {
    return Array.from(lockedFields.values());
}

/**
 * Check if a specific lock ID is active.
 * Verifica se um lock especifico esta ativo.
 */
export function isLockActive(lockId: string): boolean {
    return lockedFields.has(lockId);
}

/**
 * Get all locks from a specific library.
 * Retorna todos os locks de uma biblioteca especifica.
 */
export function getLibraryLocks(libraryId: string): Record<string, unknown>[] {
    const locks: Record<string, unknown>[] = [];
    for (const entry of lockedFields.values()) {
        if (entry.libraryId === libraryId) locks.push(entry);
    }
    return locks;
}
