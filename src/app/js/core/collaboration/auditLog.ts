// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Audit Log - pure-logic (UX-39, Phase 3 SPEC_COLLABORATION_JOURNEY)
 *
 * Append-only log de eventos de colaboração com hash chain.
 * Zero DOM, zero rede. Estado imutável (frozen entries array + lastHash).
 *
 * Entry: {
 *   seq, timestamp, actorId, actorName, action,
 *   resourceType, resourceId, payload, prevHash, hash
 * }
 *
 * Hash combina DJB2 + FNV1a em 16 hex chars (8+8) - ver core/io/segmentValidator.js
 * para padrão DJB2 e core/io/encoder.js Tipo B para hash-chain.
 */

export const AUDIT_ACTIONS = Object.freeze([
    'create',
    'update',
    'delete',
    'comment',
    'resolve',
    'lock',
    'unlock',
    'transfer',
]);

const VALID_ACTIONS = new Set(AUDIT_ACTIONS);
const GENESIS_HASH = '0'.repeat(16);

// ----------------------------------------------------------------
// HASH PRIMITIVES
// ----------------------------------------------------------------

function djb2Hex(str: any) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0').slice(-8);
}

function fnv1aHex(str: any) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) | 0;
    }
    return (h >>> 0).toString(16).padStart(8, '0').slice(-8);
}

/**
 * Compute 16-hex hash combining DJB2 + FNV1a over (prevHash + canonical entry).
 *
 * @param {string} prevHash
 * @param {any} entry - without prevHash/hash
 * @returns {string} 16-char lowercase hex
 */
export function computeEntryHash(prevHash: string, entry: any): string {
    const canonical = [
        String(prevHash ?? ''),
        String(entry.seq),
        String(entry.timestamp),
        String(entry.actorId ?? ''),
        String(entry.actorName ?? ''),
        String(entry.action ?? ''),
        String(entry.resourceType ?? ''),
        String(entry.resourceId ?? ''),
        JSON.stringify(entry.payload ?? null),
    ].join('|');
    return djb2Hex(canonical) + fnv1aHex(canonical);
}

// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------

function freezeEntry(e: any) {
    const payload =
        e.payload && typeof e.payload === 'object'
            ? Object.freeze(JSON.parse(JSON.stringify(e.payload)))
            : (e.payload ?? null);
    return Object.freeze({
        seq: e.seq,
        timestamp: e.timestamp,
        actorId: e.actorId,
        actorName: e.actorName,
        action: e.action,
        resourceType: e.resourceType,
        resourceId: e.resourceId,
        payload,
        prevHash: e.prevHash,
        hash: e.hash,
    });
}

function freezeState(entries: any, lastHash: any) {
    return Object.freeze({
        entries: Object.freeze(entries.slice()),
        lastHash,
    });
}

/**
 * Cria log vazio com lastHash = '0'×16.
 */
export function createAuditLog() {
    return freezeState([], GENESIS_HASH);
}

/**
 * Append entry. Calcula hash sobre prevHash + entry. Retorna novo state.
 *
 * @throws Error se action inválida.
 */
export function appendEntry(state: any, params: any) {
    const { actorId, actorName, action, resourceType, resourceId, payload = null, timestamp } = params || {};

    if (!VALID_ACTIONS.has(action)) {
        throw new Error(`Invalid audit action: ${action}`);
    }

    const seq = state.entries.length;
    const ts = typeof timestamp === 'number' ? timestamp : Date.now();
    const draft = {
        seq,
        timestamp: ts,
        actorId: actorId ?? null,
        actorName: actorName ?? null,
        action,
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
        payload,
    };
    const prevHash = state.lastHash;
    const hash = computeEntryHash(prevHash, draft);
    const entry = freezeEntry({ ...draft, prevHash, hash });

    return freezeState([...state.entries, entry], hash);
}

/**
 * Re-computa hashes e detecta tampering.
 *
 * @returns {{valid:boolean, brokenAt:number|null}}
 */
export function verifyChain(state: any) {
    let prev = GENESIS_HASH;
    for (const e of state.entries) {
        if (e.prevHash !== prev) {
            return { valid: false, brokenAt: e.seq };
        }
        const expected = computeEntryHash(prev, {
            seq: e.seq,
            timestamp: e.timestamp,
            actorId: e.actorId,
            actorName: e.actorName,
            action: e.action,
            resourceType: e.resourceType,
            resourceId: e.resourceId,
            payload: e.payload,
        });
        if (expected !== e.hash) {
            return { valid: false, brokenAt: e.seq };
        }
        prev = e.hash;
    }
    if (prev !== state.lastHash) {
        return { valid: false, brokenAt: state.entries.length };
    }
    return { valid: true, brokenAt: null };
}

// ----------------------------------------------------------------
// FILTERS
// ----------------------------------------------------------------

export function filterByActor(state: any, actorId: any) {
    return state.entries.filter((e: any) => e.actorId === actorId);
}

export function filterByResource(
    state: any,
    resourceType: any,
    resourceId: any,
) {
    return state.entries.filter(
        (e: any) => e.resourceType === resourceType && e.resourceId === resourceId,
    );
}

export function filterByAction(state: any, action: any) {
    return state.entries.filter((e: any) => e.action === action);
}

/**
 * Slice entries por seq range [fromSeq, toSeq] (inclusive).
 */
export function getRange(state: any, fromSeq: any, toSeq: any) {
    const lo = Math.max(0, fromSeq | 0);
    const hi = Math.min(state.entries.length - 1, toSeq | 0);
    if (hi < lo) return [];
    return state.entries.filter((e: any) => e.seq >= lo && e.seq <= hi);
}

/**
 * Resumo: entryCount, actorCount, actionBreakdown, lastHash.
 */
export function summarizeAudit(state: any) {
    const actors = new Set();
    const breakdown = Object.create(null);
    for (const action of AUDIT_ACTIONS) breakdown[action] = 0;
    for (const e of state.entries) {
        if (e.actorId != null) actors.add(e.actorId);
        breakdown[e.action] = (breakdown[e.action] || 0) + 1;
    }
    return Object.freeze({
        entryCount: state.entries.length,
        actorCount: actors.size,
        actionBreakdown: Object.freeze(breakdown),
        lastHash: state.lastHash,
    });
}
