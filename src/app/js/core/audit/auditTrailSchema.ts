// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   AUDIT TRAIL SCHEMA - append-only, hash-chained audit log
   Pure-logic, zero DOM. SHA-256 chain via Web Crypto API.

   Esquema de trilha de auditoria append-only.
   Cada entrada referencia o hash da anterior (cadeia verificavel).
   Spec: SPEC_AUDIT_TRAIL_SCHEMA (P1-62 / AUDIT-TRAIL-001).
   ================================================================ */

import { sha256 } from '../crypto/hashChain.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

export const AUDIT_ACTIONS = Object.freeze({
    CREATE: 'CREATE',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    EXPORT: 'EXPORT',
    IMPORT: 'IMPORT',
    APPROVE: 'APPROVE',
    REJECT: 'REJECT',
} as const);

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

const VALID_ACTIONS = new Set<string>(Object.values(AUDIT_ACTIONS));
const HASH_64_HEX = /^[0-9a-f]{64}$/i;

export const GENESIS_HASH = '0'.repeat(64);

export interface AuditTarget {
    type: string;
    id: string;
    [key: string]: unknown;
}

export type AuditMetadata = Record<string, unknown>;

export interface CreateAuditEntryInput {
    action: AuditAction;
    actor: string;
    target: AuditTarget;
    metadata?: AuditMetadata | null;
    prevHash?: string;
    timestamp?: number;
    id?: string;
}

export interface AuditEntry {
    id: string;
    timestamp: number;
    action: AuditAction;
    actor: string;
    target: Readonly<AuditTarget>;
    metadata: Readonly<AuditMetadata>;
    prevHash: string;
    hash: string;
}

export interface ValidateAuditChainResult {
    valid: boolean;
    brokenAt: number;
    reason: string | null;
}

export interface AuditFilterCriteria {
    action?: string;
    actor?: string;
    targetType?: string;
    targetId?: string;
    fromTs?: number;
    toTs?: number;
}

interface FilterableTarget {
    type?: unknown;
    id?: unknown;
}

export interface FilterableAuditEntry {
    action?: unknown;
    actor?: unknown;
    target?: unknown;
    timestamp?: unknown;
    [key: string]: unknown;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isUnknownArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
}

function isAuditTarget(value: unknown): value is AuditTarget {
    return isObjectRecord(value) && typeof value.type === 'string' && typeof value.id === 'string';
}

function getFilterableTarget(value: unknown): FilterableTarget | null {
    return isObjectRecord(value) ? value : null;
}

// ----------------------------------------------------------------
// CANONICAL SERIALIZATION
// ----------------------------------------------------------------

/**
 * Deterministic JSON: keys sorted recursively.
 * Garante que dois objetos equivalentes produzem o mesmo string.
 */
function canonicalJSON(value: unknown): string {
    if (value === null || typeof value !== 'object') {
        const serialized = JSON.stringify(value);
        return serialized === undefined ? 'undefined' : serialized;
    }
    if (Array.isArray(value)) return '[' + value.map(canonicalJSON).join(',') + ']';
    const keys = Object.keys(value).sort();
    const record = value as Record<string, unknown>;
    const parts = keys.map((k) => JSON.stringify(k) + ':' + canonicalJSON(record[k]));
    return '{' + parts.join(',') + '}';
}

// ----------------------------------------------------------------
// ID GENERATION
// ----------------------------------------------------------------

function generateId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'audit-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// ----------------------------------------------------------------
// CREATE ENTRY
// ----------------------------------------------------------------

/**
 * Build a new audit entry linked to prevHash.
 * Cria nova entrada de auditoria com hash chain.
 */
export async function createAuditEntry(input: CreateAuditEntryInput): Promise<Readonly<AuditEntry>>;
export async function createAuditEntry(input: unknown): Promise<Readonly<AuditEntry>> {
    if (!isObjectRecord(input)) {
        throw new TypeError('createAuditEntry: input must be an object');
    }

    const { action, actor, target } = input;
    const metadataValue = input.metadata ?? {};
    const prevHash = input.prevHash ?? GENESIS_HASH;

    if (typeof action !== 'string' || !VALID_ACTIONS.has(action)) {
        throw new Error(`createAuditEntry: invalid action "${String(action)}"`);
    }
    if (typeof actor !== 'string' || actor.trim() === '') {
        throw new Error('createAuditEntry: actor must be non-empty string');
    }
    if (!isAuditTarget(target)) {
        throw new Error('createAuditEntry: target must have string type and id');
    }
    if (typeof prevHash !== 'string' || !HASH_64_HEX.test(prevHash)) {
        throw new Error('createAuditEntry: prevHash must be 64-hex');
    }
    if (!isObjectRecord(metadataValue)) {
        throw new Error('createAuditEntry: metadata must be object or null');
    }

    const id = typeof input.id === 'string' && input.id !== '' ? input.id : generateId();
    const timestamp = typeof input.timestamp === 'number' ? input.timestamp : Date.now();

    const body = {
        id,
        timestamp,
        action: action as AuditAction,
        actor,
        target: { ...target },
        metadata: metadataValue,
        prevHash,
    };
    const hash = await sha256(canonicalJSON(body));
    return Object.freeze({
        ...body,
        target: Object.freeze(body.target),
        metadata: Object.freeze(body.metadata),
        hash,
    });
}

// ----------------------------------------------------------------
// VALIDATE CHAIN
// ----------------------------------------------------------------

/**
 * Verify integrity of an ordered audit chain.
 * Verifica integridade da cadeia (hash linkage + recomputation).
 */
export async function validateAuditChain(entries: unknown): Promise<ValidateAuditChainResult> {
    if (!isUnknownArray(entries)) {
        return { valid: false, brokenAt: -1, reason: 'entries must be an array' };
    }
    if (entries.length === 0) return { valid: true, brokenAt: -1, reason: null };

    let expectedPrev = GENESIS_HASH;
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (!isObjectRecord(entry)) {
            return { valid: false, brokenAt: i, reason: 'entry not an object' };
        }
        if (entry.prevHash !== expectedPrev) {
            return { valid: false, brokenAt: i, reason: 'prevHash mismatch' };
        }
        const { hash, ...body } = entry;
        const recomputed = await sha256(canonicalJSON(body));
        if (typeof hash !== 'string' || recomputed !== hash) {
            return { valid: false, brokenAt: i, reason: 'hash mismatch (tampered)' };
        }
        expectedPrev = hash;
    }
    return { valid: true, brokenAt: -1, reason: null };
}

function entryTimestamp(entry: FilterableAuditEntry): number {
    return typeof entry.timestamp === 'number' ? entry.timestamp : Number(entry.timestamp);
}

interface NormalizedFilterCriteria {
    action: unknown;
    actor: unknown;
    targetType: unknown;
    targetId: unknown;
    fromTs: unknown;
    toTs: unknown;
}

function normalizeCriteria(criteria: unknown): NormalizedFilterCriteria {
    const safe = isObjectRecord(criteria) ? criteria : {};
    return {
        action: safe.action,
        actor: safe.actor,
        targetType: safe.targetType,
        targetId: safe.targetId,
        fromTs: safe.fromTs,
        toTs: safe.toTs,
    };
}

function matchesFilterCriteria(
    entry: FilterableAuditEntry,
    criteria: NormalizedFilterCriteria,
): boolean {
    const target = getFilterableTarget(entry.target);
    const timestamp = entryTimestamp(entry);

    if (criteria.action !== undefined && entry.action !== criteria.action) return false;
    if (criteria.actor !== undefined && entry.actor !== criteria.actor) return false;
    if (criteria.targetType !== undefined && target?.type !== criteria.targetType) return false;
    if (criteria.targetId !== undefined && target?.id !== criteria.targetId) return false;
    if (typeof criteria.fromTs === 'number' && timestamp < criteria.fromTs) return false;
    if (typeof criteria.toTs === 'number' && timestamp > criteria.toTs) return false;
    return true;
}

// ----------------------------------------------------------------
// FILTER
// ----------------------------------------------------------------

/**
 * Filter entries by criteria. All criteria are AND-combined.
 * Filtra entradas - criterios omitidos sao ignorados.
 */
export function filterAuditEntries(
    entries: unknown,
    criteria: AuditFilterCriteria | null = {},
): FilterableAuditEntry[] {
    if (!isUnknownArray(entries)) return [];
    const normalized = normalizeCriteria(criteria);

    return entries.filter((entry): entry is FilterableAuditEntry => {
        if (!isObjectRecord(entry)) return false;
        return matchesFilterCriteria(entry, normalized);
    });
}
