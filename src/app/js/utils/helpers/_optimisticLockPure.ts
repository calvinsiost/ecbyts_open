// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   OPTIMISTIC LOCK (utils/helpers — cross-spec pure-logic)
   ================================================================

   Version-token Compare-And-Swap (CAS) helpers. Protege contra
   stale-write overwrites quando dois clientes editam o mesmo row
   sem coordenação.

   Padrão Supabase:
     1. Cliente lê row → buildVersionToken({rev, updated_at, ...})
     2. Cliente edita localmente
     3. Cliente envia UPDATE com WHERE version_token = '<expected>'
     4. Se 0 rows afetadas → conflito (alguém escreveu antes)

   Cross-spec consumers:
     - core/billing/* (saldo updates)
     - core/sharing/* (permissões compartilhadas)
     - core/projectTabs/* (tab state em multi-tab)
     - utils/governance/* (contracts edit lock)
     - utils/auth/* (org membership updates)

   Pure-logic: caller injeta nowMs e fetch real. No async, no Date.
   ================================================================ */

import { fnv1aHashHex } from './hashFnv1a.js';

export const VERSION_PREFIX = 'v';
export const SEPARATOR = '.';
const MAX_FIELD_VALUE_LEN = 2048;

export interface VersionedRow {
    readonly [key: string]: unknown;
}

export interface WriteVerdict {
    readonly action: 'proceed' | 'conflict' | 'force_required' | 'absent_init';
    readonly reason: string;
    readonly nextVersion: string | null;
}

export interface ParsedToken {
    readonly seq: number;
    readonly hash: string;
    readonly valid: boolean;
}

function stableStringifyValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
        if (Number.isNaN(value)) return '<NaN>';
        if (!isFinite(value)) return value > 0 ? '<Infinity>' : '<-Infinity>';
        return String(value);
    }
    if (typeof value === 'boolean') return value ? '1' : '0';
    if (typeof value === 'string') {
        return value.length > MAX_FIELD_VALUE_LEN ? value.slice(0, MAX_FIELD_VALUE_LEN) : value;
    }
    try {
        const serialized = JSON.stringify(value);
        return typeof serialized === 'string' && serialized.length <= MAX_FIELD_VALUE_LEN
            ? serialized
            : (serialized ?? '').slice(0, MAX_FIELD_VALUE_LEN);
    } catch {
        return '<unserializable>';
    }
}

export function buildVersionToken(
    row: VersionedRow | null | undefined,
    fields?: readonly string[]
): string {
    if (row === null || row === undefined || typeof row !== 'object') {
        return `${VERSION_PREFIX}0${SEPARATOR}empty`;
    }
    const keys = Array.isArray(fields) && fields.length > 0
        ? [...fields].sort()
        : Object.keys(row).sort();
    if (keys.length === 0) {
        return `${VERSION_PREFIX}0${SEPARATOR}empty`;
    }
    const parts = keys.map(k => `${k}=${stableStringifyValue((row as Record<string, unknown>)[k])}`);
    const hash = fnv1aHashHex(parts.join('|'), 8);
    const seqRaw = (row as Record<string, unknown>).rev ?? (row as Record<string, unknown>).version;
    const seq = typeof seqRaw === 'number' && isFinite(seqRaw) && seqRaw >= 0 ? Math.floor(seqRaw) : 0;
    return `${VERSION_PREFIX}${seq}${SEPARATOR}${hash}`;
}

export function parseVersionToken(token: unknown): ParsedToken {
    if (typeof token !== 'string' || token.length === 0) {
        return Object.freeze({ seq: 0, hash: '', valid: false });
    }
    if (!token.startsWith(VERSION_PREFIX)) {
        return Object.freeze({ seq: 0, hash: '', valid: false });
    }
    const body = token.slice(VERSION_PREFIX.length);
    const sepIdx = body.indexOf(SEPARATOR);
    if (sepIdx < 0) {
        return Object.freeze({ seq: 0, hash: '', valid: false });
    }
    const seqStr = body.slice(0, sepIdx);
    const hash = body.slice(sepIdx + 1);
    if (!/^\d+$/.test(seqStr) || hash.length === 0) {
        return Object.freeze({ seq: 0, hash: '', valid: false });
    }
    const seq = parseInt(seqStr, 10);
    if (!isFinite(seq) || seq < 0) {
        return Object.freeze({ seq: 0, hash: '', valid: false });
    }
    return Object.freeze({ seq, hash, valid: true });
}

export function incrementVersion(prevToken: string | null | undefined, currentRow?: VersionedRow): string {
    const parsed = parseVersionToken(prevToken);
    const nextSeq = parsed.valid ? parsed.seq + 1 : 1;
    if (currentRow) {
        const newToken = buildVersionToken({ ...(currentRow as Record<string, unknown>), rev: nextSeq });
        return newToken;
    }
    return `${VERSION_PREFIX}${nextSeq}${SEPARATOR}${parsed.hash || 'init'}`;
}

export function decideOptimisticWrite(
    expectedToken: string | null | undefined,
    currentToken: string | null | undefined,
    options?: { allowForce?: boolean }
): WriteVerdict {
    const force = !!options?.allowForce;
    const expected = parseVersionToken(expectedToken);
    const current = parseVersionToken(currentToken);
    if (!current.valid) {
        return Object.freeze({
            action: 'absent_init' as const,
            reason: 'no_current_version',
            nextVersion: `${VERSION_PREFIX}1${SEPARATOR}init`,
        });
    }
    if (!expected.valid) {
        if (force) {
            return Object.freeze({
                action: 'proceed' as const,
                reason: 'force_with_invalid_expected',
                nextVersion: `${VERSION_PREFIX}${current.seq + 1}${SEPARATOR}${current.hash}`,
            });
        }
        return Object.freeze({
            action: 'force_required' as const,
            reason: 'invalid_expected_token',
            nextVersion: null,
        });
    }
    if (expected.seq === current.seq && expected.hash === current.hash) {
        return Object.freeze({
            action: 'proceed' as const,
            reason: 'match',
            nextVersion: `${VERSION_PREFIX}${current.seq + 1}${SEPARATOR}${current.hash}`,
        });
    }
    if (expected.seq < current.seq) {
        return Object.freeze({
            action: 'conflict' as const,
            reason: 'stale_read',
            nextVersion: null,
        });
    }
    return Object.freeze({
        action: 'conflict' as const,
        reason: 'mismatch',
        nextVersion: null,
    });
}

export function tokensEqual(a: string | null | undefined, b: string | null | undefined): boolean {
    const pa = parseVersionToken(a);
    const pb = parseVersionToken(b);
    return pa.valid && pb.valid && pa.seq === pb.seq && pa.hash === pb.hash;
}
