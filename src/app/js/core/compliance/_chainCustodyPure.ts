// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Chain-of-Custody anti-double-counting for environmental credits and
 * certified co-products (biorefinery cascade scenario).
 *
 * Traceability chain (ouro/ASM, De Tomi) applied to MRV of the credit
 * and the certified fertilizer — shielding against double-counting and
 * greenwashing. Extends SSOT/3CTA+ with a hash-chained custody ledger.
 *
 * Pure: no DOM, no external I/O. Uses Node `crypto.createHash` for
 * deterministic SHA-256 (acceptable per AGENTS.md pure-module rules).
 *
 * Tests live in `tests/chain-custody-pure.test.mjs`.
 */

import { createHash } from 'node:crypto';

export type CustodyAction = 'issue' | 'transfer' | 'retire' | 'verify';

export interface CustodyRecord {
    readonly id: string;
    readonly creditId: string;
    readonly holder: string;
    readonly timestamp: string;
    readonly action: CustodyAction;
    readonly previousHash: string;
    readonly hash: string;
}

export interface ChainValidation {
    readonly valid: boolean;
    readonly brokenAt?: string;
}

export interface DoubleCountingResult {
    readonly hasDoubleCounting: boolean;
    readonly duplicatedCreditIds: readonly string[];
}

const GENESIS_HASH = '0'.repeat(64);

export function genesisHash(): string {
    return GENESIS_HASH;
}

export function computeRecordHash(
    id: string,
    creditId: string,
    holder: string,
    timestamp: string,
    action: CustodyAction,
    previousHash: string,
): string {
    const payload = [id, creditId, holder, timestamp, action, previousHash].join('|');
    return createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function createRecord(
    id: string,
    creditId: string,
    holder: string,
    timestamp: string,
    action: CustodyAction,
    previousHash: string = GENESIS_HASH,
): CustodyRecord {
    const hash = computeRecordHash(id, creditId, holder, timestamp, action, previousHash);
    return Object.freeze({ id, creditId, holder, timestamp, action, previousHash, hash });
}

export function validateChain(records: readonly CustodyRecord[]): ChainValidation {
    if (records.length === 0) return Object.freeze({ valid: true });

    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        if (!rec) continue;
        const prevRecord = i === 0 ? undefined : records[i - 1];
        const expectedPrev = i === 0 ? GENESIS_HASH : prevRecord?.hash;
        if (rec.previousHash !== expectedPrev) {
            return Object.freeze({ valid: false, brokenAt: rec.id });
        }
        const recomputed = computeRecordHash(
            rec.id, rec.creditId, rec.holder, rec.timestamp, rec.action, rec.previousHash,
        );
        if (rec.hash !== recomputed) {
            return Object.freeze({ valid: false, brokenAt: rec.id });
        }
    }
    return Object.freeze({ valid: true });
}

export function detectDoubleCounting(records: readonly CustodyRecord[]): DoubleCountingResult {
    const retireCounts = new Map<string, number>();
    for (const rec of records) {
        if (rec.action === 'retire') {
            retireCounts.set(rec.creditId, (retireCounts.get(rec.creditId) ?? 0) + 1);
        }
    }
    const duplicated: string[] = [];
    for (const [creditId, count] of retireCounts) {
        if (count > 1) duplicated.push(creditId);
    }
    duplicated.sort();
    return Object.freeze({
        hasDoubleCounting: duplicated.length > 0,
        duplicatedCreditIds: Object.freeze(duplicated),
    });
}

export function buildCustodyTrail(
    creditId: string,
    records: readonly CustodyRecord[],
): readonly CustodyRecord[] {
    return Object.freeze(records.filter((r) => r.creditId === creditId));
}
