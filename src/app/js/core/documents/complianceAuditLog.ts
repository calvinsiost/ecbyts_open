// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Audit Log - Phase 3 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S6
 *
 * Phase 3 (2026-05-01) - pure-logic append-only audit log para
 * compliance events em documentos. Complementa:
 *   - Phase 1 validator (validation engine)
 *   - Phase 2 store (provenance + revision FSM)
 *
 * Estratégia:
 *   - Log é append-only (immutable history)
 *   - Cada entry = {id, documentId, eventType, actor, timestamp, payload}
 *   - eventType frozen enum
 *   - Snapshot serializável v1
 *   - Filtros por documentId + eventType + dateRange
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

import { idbDelete, idbGet, idbSet } from '../../utils/storage/idbStore.js';

const LOG_VERSION = 1;
const MAX_PAYLOAD_BYTES = 4096;
const DEFAULT_IDB_KEY = 'document-compliance-audit-log:v1';

/** Tipos canônicos de evento de auditoria. */
export const AUDIT_EVENT_TYPES = Object.freeze([
    'created',
    'updated',
    'reviewed',
    'approved',
    'rejected',
    'archived',
    'deprecated',
    'restored',
    'commented',
    'compliance_check',
    'compliance_violation',
    'export',
    'import',
] as const);

type AuditEventType = typeof AUDIT_EVENT_TYPES[number];

interface AuditEntry {
    id: string;
    documentId: string;
    eventType: AuditEventType;
    actor: string | null;
    timestamp: string;
    payload: Record<string, any> | null;
}

interface CreateAuditEntryInput {
    documentId: string;
    eventType: AuditEventType | string;
    actor?: string;
    payload?: Record<string, any>;
    timestamp?: string;
}

interface ComplianceAuditLogMeta {
    spec: string;
    phase: number;
    deliveredAt: string;
    logVersion: number;
    eventTypes: readonly AuditEventType[];
    idbKey: string;
}

/** Identidade do log. */
export const COMPLIANCE_AUDIT_LOG_META: ComplianceAuditLogMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 3,
    deliveredAt: '2026-05-01',
    logVersion: LOG_VERSION,
    eventTypes: AUDIT_EVENT_TYPES,
    idbKey: DEFAULT_IDB_KEY,
});

export const COMPLIANCE_AUDIT_LOG_IDB_KEY = DEFAULT_IDB_KEY;

/**
 * Cria audit entry validado.
 *
 * @param {CreateAuditEntryInput} input
 * @returns {AuditEntry} entry frozen
 */
export function createAuditEntry(input: CreateAuditEntryInput): AuditEntry {
    if (!input || typeof input !== 'object') {
        throw new TypeError('input must be object');
    }
    const documentId = String(input.documentId || '').trim();
    if (!documentId) throw new Error('documentId required');

    const eventType = String(input.eventType || '').trim();
    if (!AUDIT_EVENT_TYPES.includes(eventType as AuditEventType)) {
        throw new Error(`Invalid eventType "${eventType}"`);
    }

    let payload: Record<string, any> | null = null;
    if (input.payload !== undefined && input.payload !== null) {
        if (typeof input.payload !== 'object') {
            throw new TypeError('payload must be object');
        }
        const serialized = JSON.stringify(input.payload);
        if (serialized.length > MAX_PAYLOAD_BYTES) {
            throw new Error(`payload exceeds ${MAX_PAYLOAD_BYTES} bytes (got ${serialized.length})`);
        }
        payload = JSON.parse(serialized); // deep clone
    }

    return Object.freeze({
        id: `audit-${documentId}-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`,
        documentId,
        eventType: eventType as AuditEventType,
        actor: input.actor ? String(input.actor) : null,
        timestamp: input.timestamp || new Date().toISOString(),
        payload: payload ? Object.freeze(payload) : null,
    });
}

/**
 * Append-only audit log.
 */
export class ComplianceAuditLog {
    private _entries: AuditEntry[]; // chronologically ordered

    constructor() {
        this._entries = []; // chronologically ordered
    }

    /**
     * Adiciona entry.
     */
    append(input: any): AuditEntry {
        const entry = input?.id?.startsWith('audit-') ? (input as AuditEntry) : createAuditEntry(input);
        this._entries.push(entry);
        return entry;
    }

    /**
     * Retorna todas as entries.
     */
    getAll(): AuditEntry[] {
        return [...this._entries];
    }

    /**
     * Retorna entries para um documento.
     */
    getByDocument(documentId: any): AuditEntry[] {
        const id = String(documentId || '');
        if (!id) return [];
        return this._entries.filter((e) => e.documentId === id);
    }

    /**
     * Retorna entries por tipo.
     */
    getByEventType(eventType: any): AuditEntry[] {
        const t = String(eventType || '').trim();
        if (!t) return [];
        return this._entries.filter((e) => e.eventType === t);
    }

    /**
     * Retorna entries num range temporal (ISO timestamps).
     *
     * @param {string} fromISO inclusive
     * @param {string} toISO inclusive
     * @returns {AuditEntry[]}
     */
    getByDateRange(fromISO: string, toISO: string): AuditEntry[] {
        const fromMs = Date.parse(fromISO);
        const toMs = Date.parse(toISO);
        if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return [];
        return this._entries.filter((e) => {
            const t = Date.parse(e.timestamp);
            return t >= fromMs && t <= toMs;
        });
    }

    /**
     * Conta total de entries.
     */
    size(): number {
        return this._entries.length;
    }

    /**
     * Sumário: contagem por eventType + por documentId.
     */
    summary(): { total: number; byEventType: Record<string, number>; byDocument: Record<string, number> } {
        const byEventType: Record<string, number> = {};
        const byDocument: Record<string, number> = {};
        for (const e of this._entries) {
            byEventType[e.eventType] = (byEventType[e.eventType] ?? 0) + 1;
            byDocument[e.documentId] = (byDocument[e.documentId] ?? 0) + 1;
        }
        return {
            total: this._entries.length,
            byEventType,
            byDocument,
        };
    }

    /**
     * Snapshot v1 para persistência.
     */
    toSnapshot(): { version: number; entries: AuditEntry[] } {
        return {
            version: LOG_VERSION,
            entries: [...this._entries],
        };
    }

    /**
     * Restaura log a partir de snapshot.
     *
     * @returns {ComplianceAuditLog}
     */
    static fromSnapshot(snapshot: any): ComplianceAuditLog {
        if (!snapshot || typeof snapshot !== 'object') {
            throw new TypeError('snapshot must be object');
        }
        if (snapshot.version !== LOG_VERSION) {
            throw new Error(`Unsupported snapshot version ${snapshot.version} (expected ${LOG_VERSION})`);
        }
        const log = new ComplianceAuditLog();
        const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
        for (const e of entries) {
            log._entries.push(e as AuditEntry);
        }
        return log;
    }

    /**
     * Limpa log (test helper).
     */
    clear(): void {
        this._entries = [];
    }
}

/**
 * Factory.
 */
export function createComplianceAuditLog(): ComplianceAuditLog {
    return new ComplianceAuditLog();
}

function _resolvePersistenceKey(key: any): string {
    const k = String(key || DEFAULT_IDB_KEY).trim();
    if (!k) throw new Error('compliance audit log persistence key required');
    return k;
}

/**
 * Persiste snapshot append-only do audit log no IndexedDB via wrapper canônico.
 *
 * @param {ComplianceAuditLog} log
 * @param {{key?: string}} [options]
 * @returns {Promise<boolean>}
 */
export async function persistComplianceAuditLog(log: ComplianceAuditLog, options: { key?: string } = {}): Promise<boolean> {
    if (!log || typeof log.toSnapshot !== 'function') {
        throw new TypeError('log with toSnapshot() required');
    }
    return idbSet(_resolvePersistenceKey(options.key), log.toSnapshot());
}

/**
 * Carrega audit log do IndexedDB. Ausência de dado retorna log vazio.
 *
 * @param {{key?: string}} [options]
 * @returns {Promise<ComplianceAuditLog>}
 */
export async function loadComplianceAuditLog(options: { key?: string } = {}): Promise<ComplianceAuditLog> {
    const snapshot = await idbGet(_resolvePersistenceKey(options.key));
    if (!snapshot) return createComplianceAuditLog();
    return ComplianceAuditLog.fromSnapshot(snapshot);
}

/**
 * Remove snapshot persistido do IndexedDB.
 *
 * @param {{key?: string}} [options]
 * @returns {Promise<boolean>}
 */
export async function deletePersistedComplianceAuditLog(options: { key?: string } = {}): Promise<boolean> {
    return idbDelete(_resolvePersistenceKey(options.key));
}

/**
 * Module identity export.
 */
export const complianceAuditLogMeta = COMPLIANCE_AUDIT_LOG_META;
