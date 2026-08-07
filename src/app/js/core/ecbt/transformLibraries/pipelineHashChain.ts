// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Hash Chain - Phase 50 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S50
 *
 * Phase 50 (2026-05-02) - pure-logic FNV-1a hash chain para integridade
 * de execução. Cada step gera hash sobre {prevHash, stepId, output}.
 * Permite verificar tampering offline.
 *
 * NÃO depende de browser. Sem Web Crypto/SHA - usa FNV-1a determinístico.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface HashChainMeta {
    readonly spec: string;
    readonly phase: number;
    readonly deliveredAt: string;
}

export const HASH_CHAIN_META = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 50,
    deliveredAt: '2026-05-02',
} as const;

export const GENESIS_HASH = '00000000';

import { fnv1aHashHex as _fnv1aHashHex } from '../../../utils/helpers/hashFnv1a.js';
export function fnv1a(s: string): string {
    if (typeof s !== 'string') return GENESIS_HASH;
    return _fnv1aHashHex(s, 8);
}

export interface ChainEntry {
    readonly stepId: string;
    readonly prevHash: string;
    readonly hash: string;
    readonly at: number;
}

export interface Chain {
    readonly head: string;
    readonly entries: readonly ChainEntry[];
    readonly broken: boolean;
}

export function createChain(): Chain {
    return Object.freeze({
        head: GENESIS_HASH,
        entries: Object.freeze([]),
        broken: false,
    });
}

export function computeLinkHash(prevHash: string, stepId: string, output: unknown): string {
    let outStr: string;
    try {
        outStr = JSON.stringify(output ?? null);
    } catch {
        outStr = '[unserializable]';
    }
    return fnv1a(`${prevHash}::${stepId}::${outStr}`);
}

export function appendLink(
    chain: Chain,
    stepId: string,
    output: unknown,
    now?: number,
): Chain {
    if (!chain || typeof stepId !== 'string' || !stepId.trim()) return chain;
    const at = Number.isFinite(now) ? Number(now) : Date.now();
    const linkHash = computeLinkHash(chain.head, stepId, output);
    const entry: ChainEntry = Object.freeze({
        stepId,
        prevHash: chain.head,
        hash: linkHash,
        at,
    });
    return Object.freeze({
        head: linkHash,
        entries: Object.freeze([...chain.entries, entry]),
        broken: chain.broken,
    });
}

export function verifyChain(
    chain: Chain,
    outputs: Array<{ stepId: string; output: unknown }>,
): { readonly valid: boolean; readonly breakAt: number } {
    if (!chain || !Array.isArray(outputs)) return Object.freeze({ valid: false, breakAt: -1 });
    if (outputs.length !== chain.entries.length) {
        return Object.freeze({ valid: false, breakAt: 0 });
    }
    let prev = GENESIS_HASH;
    for (let i = 0; i < outputs.length; i++) {
        const o = outputs[i];
        if (!o || typeof o.stepId !== 'string') {
            return Object.freeze({ valid: false, breakAt: i });
        }
        const expected = computeLinkHash(prev, o.stepId, o.output);
        const entry = chain.entries[i];
        if (!entry || entry.hash !== expected || entry.stepId !== o.stepId || entry.prevHash !== prev) {
            return Object.freeze({ valid: false, breakAt: i });
        }
        prev = entry.hash;
    }
    return Object.freeze({ valid: prev === chain.head, breakAt: -1 });
}

export function breakChain(chain: Chain): Chain {
    if (!chain) return chain;
    return Object.freeze({ ...chain, broken: true });
}

export function summarizeChain(chain: Chain): {
    readonly length: number;
    readonly head: string;
    readonly broken: boolean;
    readonly firstHash?: string | null;
} {
    const empty = { length: 0, head: GENESIS_HASH, broken: false };
    if (!chain) return empty;
    return Object.freeze({
        length: chain.entries.length,
        head: chain.head,
        broken: chain.broken,
        firstHash: chain.entries.length > 0 ? (chain.entries[0]?.hash ?? null) : null,
    });
}

export interface PipelineHashChainMeta {
    readonly spec: string;
    readonly phase: number;
    readonly deliveredAt: string;
    readonly exports: readonly string[];
    readonly provenance: {
        readonly generatedBy: string;
        readonly disclaimerAcknowledged: boolean;
    };
}

export const pipelineHashChainMeta = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 50,
    deliveredAt: '2026-05-02',
    exports: [
        'GENESIS_HASH',
        'HASH_CHAIN_META',
        'fnv1a',
        'createChain',
        'computeLinkHash',
        'appendLink',
        'verifyChain',
        'breakChain',
        'summarizeChain',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const satisfies PipelineHashChainMeta;