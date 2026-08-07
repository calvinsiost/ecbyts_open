// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 — Worker Registry + pseudonimização LGPD
   Referência: SPEC_HEALTH_ENVIRONMENTAL_MONITORING §S1, Q4

   LGPD compliance:
   - Nomes reais NUNCA persistem no modelo 3D.
   - CPF/documento NUNCA persiste; somente pseudônimo + consent_hash.
   - O mapeamento real→pseudônimo existe apenas na lookup table local
     e NÃO é exportado via ECBT (serialização pública).

   Sem DOM, sem rede — puro módulo ES.
   ================================================================ */

import { createWorker, isValidWorker, HEALTH_EVENTS } from './schema.js';
import { createLogger } from '../../utils/helpers/logger.js';

const _log = createLogger('health:workerRegistry');

// ----------------------------------------------------------------
// In-memory store (para testes e bootstrap sem IDB)
// ----------------------------------------------------------------

let _workers = new Map<string, any>(); // id → worker
let _nameToId = new Map<string, string>(); // pseudonym (lower) → id

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Register a new worker.
 * Pseudonym must be unique within a project.
 *
 * @param params - see schema.createWorker
 * @returns frozen worker record
 */
export function registerWorker(params: object = {}): object {
    const worker = createWorker(params as any) as any;
    const key = `${worker.projectId}:${String(worker.pseudonym).toLowerCase()}`;
    if (_nameToId.has(key)) {
        throw new Error(`worker pseudonym '${worker.pseudonym}' already exists in project '${worker.projectId}'`);
    }
    _workers.set(worker.id, worker);
    _nameToId.set(key, worker.id);
    _emit(HEALTH_EVENTS.WORKER_REGISTERED, { worker });
    return worker;
}

/**
 * Update mutable fields of an existing worker.
 * Returns the updated worker record.
 *
 * @returns frozen worker record
 */
export function updateWorker(id: string, patch: any = {}): object {
    const existing = _workers.get(id);
    if (!existing) throw new Error(`worker '${id}' not found`);

    const ALLOWED = new Set(['role', 'hireDate', 'birthYear', 'smokingStatus', 'gender']);
    const updates = Object.fromEntries(Object.entries(patch).filter(([k]) => ALLOWED.has(k)));

    const updated = Object.freeze({
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
    });
    _workers.set(id, updated);
    _emit(HEALTH_EVENTS.WORKER_UPDATED, { worker: updated });
    return updated;
}

/**
 * Get a worker by id.
 */
export function getWorker(id: string): object | null {
    return _workers.get(id) || null;
}

/**
 * Get a worker by pseudonym + projectId.
 */
export function getWorkerByPseudonym(pseudonym: string, projectId: string): object | null {
    const key = `${projectId}:${pseudonym.toLowerCase()}`;
    const id = _nameToId.get(key);
    return id ? _workers.get(id) || null : null;
}

/**
 * List all workers for a project.
 */
export function listWorkers(projectId: string): object[] {
    if (!projectId) return [];
    return [..._workers.values()].filter((w) => w.projectId === projectId);
}

/**
 * Remove a worker record (LGPD erasure request).
 */
export function removeWorker(id: string): boolean {
    const worker = _workers.get(id);
    if (!worker) return false;
    const key = `${worker.projectId}:${worker.pseudonym.toLowerCase()}`;
    _nameToId.delete(key);
    _workers.delete(id);
    return true;
}

/**
 * Count workers for a project.
 */
export function countWorkers(projectId: string): number {
    return listWorkers(projectId).length;
}

// ----------------------------------------------------------------
// Pseudonymization helpers
// ----------------------------------------------------------------

/**
 * Generate a stable pseudonym from a real name + project salt.
 * Uses a simple hash - the real name never leaves this function.
 * In production, use crypto.subtle.digest('SHA-256', ...) for stronger pseudonymization.
 *
 * @returns pseudonym like "Worker-a3f2b1"
 */
export function generatePseudonym(realName: string, projectSalt: string): string {
    if (typeof realName !== 'string' || !realName.trim()) {
        throw new TypeError('realName must be a non-empty string');
    }
    if (typeof projectSalt !== 'string' || !projectSalt.trim()) {
        throw new TypeError('projectSalt must be a non-empty string');
    }
    const combined = `${projectSalt}:${realName.trim().toLowerCase()}`;
    // Simple deterministic hash (djb2 variant) - sufficient for pseudonymization
    let hash = 5381;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) + hash) ^ combined.charCodeAt(i);
        hash = hash >>> 0; // keep 32-bit unsigned
    }
    return `Worker-${hash.toString(16).padStart(8, '0').slice(0, 6)}`;
}

/**
 * Generate a consent hash for LGPD audit trail.
 * @param pseudonym - ISO 8601
 * @param consentTimestamp - consent version (e.g. "v1.0")
 * @returns hash like "consent-<hex>"
 */
export function generateConsentHash(pseudonym: string, consentTimestamp: string, version = 'v1.0'): string {
    if (!pseudonym || !consentTimestamp) throw new TypeError('pseudonym and consentTimestamp are required');
    const combined = `${pseudonym}|${consentTimestamp}|${version}`;
    let hash = 5381;
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) + hash) ^ combined.charCodeAt(i);
        hash = hash >>> 0;
    }
    return `consent-${hash.toString(16).padStart(8, '0')}`;
}

// ----------------------------------------------------------------
// Export sanitization (LGPD anonymization)
// ----------------------------------------------------------------

/**
 * Sanitize a worker record for public export.
 * With anonymize=true: strips pseudonym, uses placeholder.
 * With anonymize=false: requires admin flag, returns record as-is.
 */
export function sanitizeWorkerForExport(
    worker: object,
    { anonymize = true, isAdmin = false }: { anonymize?: boolean; isAdmin?: boolean } = {},
): object {
    if (!isValidWorker(worker)) throw new TypeError('invalid worker record');

    if (!anonymize && !isAdmin) {
        throw new Error('anonymize=false requires isAdmin=true (LGPD compliance)');
    }

    if (anonymize) {
        const w = worker as any;
        return Object.freeze({
            id: '[ANONYMIZED]',
            pseudonym: '[ANONYMIZED]',
            role: w.role,
            hireDate: null,
            birthYear: null,
            smokingStatus: w.smokingStatus,
            gender: w.gender,
            projectId: w.projectId,
            consentHash: '[REDACTED]',
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
        });
    }

    return Object.freeze({ ...worker });
}

/**
 * Sanitize a readings array for public export.
 * Strips workerPseudonym when anonymize=true.
 */
export function sanitizeReadingsForExport(
    readings: object[],
    { anonymize = true }: { anonymize?: boolean } = {},
): object[] {
    if (!Array.isArray(readings)) return [];
    return readings.map((r: any) => {
        if (!r) return null;
        return Object.freeze({
            ...r,
            workerPseudonym: anonymize ? '[ANONYMIZED]' : r.workerPseudonym,
            labId: anonymize && r.labId ? '[REDACTED]' : r.labId,
        });
    }) as any;
}

// ----------------------------------------------------------------
// Reset (for tests)
// ----------------------------------------------------------------

export function _resetRegistryForTest(): void {
    _workers = new Map();
    _nameToId = new Map();
}

// ----------------------------------------------------------------
// Internal
// ----------------------------------------------------------------

function _emit(eventName: any, detail: any): void {
    try {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: false }));
        }
        // eslint-disable-next-line
    } catch (_) {
        _log.debug('event dispatch skipped (not in browser)', eventName);
    }
}
