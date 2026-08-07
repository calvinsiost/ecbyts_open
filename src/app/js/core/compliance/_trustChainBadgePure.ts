// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Compliance Trust Chain Badge resolver — pure logic (RF12 of
 * SPEC_MODEL_BASELINE_COMPLIANCE_PRESET, V1 per Calvin decision D6).
 *
 * V1 scope (this slice):
 *   - Structural verification: `publishedBy.authoritySignature` is present
 *     AND `publishedBy.authorityPublicKeyId` references a KNOWN authority
 *   - Badge resolver returns frozen VM with 3 levels: `verified` /
 *     `unverified` / `unknown_authority`
 *
 * V2 scope (deferred):
 *   - Real cryptographic verification (Ed25519/ECDSA) of `authoritySignature`
 *     over `contentHash` using `KNOWN_AUTHORITIES[id].publicKey`. Hook is
 *     prepared via optional `verifySignature` callback parameter — caller
 *     wires WebCrypto/Node crypto without polluting this module.
 *
 * Anti-spoof rationale (B2):
 *   Public registry is an attack surface — without trust chain, attacker
 *   publishes "CETESB DD256" with relaxed VI and user cannot distinguish
 *   it from official. V1 ships the badge UX (already useful: "verified" vs
 *   "unverified" flag); V2 elevates verification to crypto-real.
 *
 * Tests live in `tests/compliance-trust-chain-badge-pure.test.mjs`.
 */

import type { CompliancePreset } from './_presetPure';

export type TrustBadgeLevel = 'verified' | 'unverified' | 'unknown_authority';

export interface TrustBadgeVM {
    readonly level: TrustBadgeLevel;
    readonly labelKey: string;
    readonly color: string;
    readonly severity: 'info' | 'warning' | 'error';
    readonly detail: Readonly<Record<string, string>>;
}

/**
 * Known authority registry — V1 admin-curated. Map of public-key id →
 * authority name. The authority name MUST match `preset.publishedBy.authority`
 * (case-sensitive — authorities use canonical naming).
 *
 * V2: this map's values become actual public-key bytes for crypto verification.
 */
export const KNOWN_AUTHORITIES: Readonly<Record<string, string>> = Object.freeze({
    'conama-key-2024': 'CONAMA',
    'cetesb-sp-key-2024': 'CETESB',
    'ipcc-key-2024': 'IPCC',
    'epa-key-2024': 'EPA',
    'ifrs-issb-key-2024': 'IFRS',
    'eu-issb-key-2024': 'IFRS',
});

const LABEL_VERIFIED = 'compliance.trustBadge.verified';
const LABEL_UNVERIFIED = 'compliance.trustBadge.unverified';
const LABEL_UNKNOWN = 'compliance.trustBadge.unknownAuthority';

const COLOR_VERIFIED = '#10b981';
const COLOR_UNVERIFIED = '#f59e0b';
const COLOR_UNKNOWN = '#ef4444';

/**
 * Optional V2 verifier hook signature. Caller passes a function that
 * actually does the cryptographic check; this module just orchestrates
 * the verdict. V1 callers pass `undefined` and get structural-only.
 */
export type SignatureVerifier = (
    contentHash: string,
    signature: string,
    publicKeyId: string,
) => boolean;

function freezeVm(vm: TrustBadgeVM): TrustBadgeVM {
    return Object.freeze({
        ...vm,
        detail: Object.freeze({ ...vm.detail }),
    });
}

/**
 * Resolve the trust-chain badge for a preset. Pure: caller passes the
 * preset (and optional V2 verifier); module returns frozen VM.
 *
 * Verdict algorithm:
 *   1. publishedBy missing → unverified (structural fail)
 *   2. authoritySignature missing OR authorityPublicKeyId missing → unverified
 *   3. publicKeyId not in KNOWN_AUTHORITIES → unknown_authority (red)
 *   4. KNOWN_AUTHORITIES[keyId] != publishedBy.authority → unknown_authority
 *      (key claims a different authority than the preset declares)
 *   5. V2 verifier provided AND returns false → unverified
 *   6. otherwise → verified
 */
export function resolveTrustBadge(
    preset: CompliancePreset | null | undefined,
    verifier?: SignatureVerifier,
): TrustBadgeVM {
    if (!preset || typeof preset !== 'object') {
        return freezeVm({
            level: 'unverified',
            labelKey: LABEL_UNVERIFIED,
            color: COLOR_UNVERIFIED,
            severity: 'warning',
            detail: { reason: 'preset_missing' },
        });
    }
    const pub = (preset as CompliancePreset).publishedBy as
        | (CompliancePreset['publishedBy'] & {
              authoritySignature?: string;
              authorityPublicKeyId?: string;
          })
        | undefined;
    if (!pub) {
        return freezeVm({
            level: 'unverified',
            labelKey: LABEL_UNVERIFIED,
            color: COLOR_UNVERIFIED,
            severity: 'warning',
            detail: { reason: 'publishedBy_missing' },
        });
    }

    const sig = pub.authoritySignature;
    const keyId = pub.authorityPublicKeyId;

    if (typeof sig !== 'string' || sig.length === 0 || typeof keyId !== 'string' || keyId.length === 0) {
        return freezeVm({
            level: 'unverified',
            labelKey: LABEL_UNVERIFIED,
            color: COLOR_UNVERIFIED,
            severity: 'warning',
            detail: {
                reason: 'signature_or_keyId_missing',
                authority: pub.authority,
            },
        });
    }

    const expectedAuthority = KNOWN_AUTHORITIES[keyId];
    if (!expectedAuthority) {
        return freezeVm({
            level: 'unknown_authority',
            labelKey: LABEL_UNKNOWN,
            color: COLOR_UNKNOWN,
            severity: 'error',
            detail: {
                reason: 'publicKeyId_not_in_registry',
                publicKeyId: keyId,
                authority: pub.authority,
            },
        });
    }
    if (expectedAuthority !== pub.authority) {
        return freezeVm({
            level: 'unknown_authority',
            labelKey: LABEL_UNKNOWN,
            color: COLOR_UNKNOWN,
            severity: 'error',
            detail: {
                reason: 'publicKeyId_authority_mismatch',
                publicKeyId: keyId,
                declaredAuthority: pub.authority,
                expectedAuthority,
            },
        });
    }

    // V2 hook — only invoked when caller provides a verifier.
    if (typeof verifier === 'function') {
        let ok: boolean;
        try {
            ok = verifier(preset.contentHash, sig, keyId);
        } catch (e) {
            console.debug('[compliance:trustBadge] verifier_threw', e instanceof Error ? e.message : e);
            ok = false;
        }
        if (!ok) {
            return freezeVm({
                level: 'unverified',
                labelKey: LABEL_UNVERIFIED,
                color: COLOR_UNVERIFIED,
                severity: 'warning',
                detail: {
                    reason: 'crypto_signature_invalid',
                    publicKeyId: keyId,
                    authority: pub.authority,
                },
            });
        }
    }

    return freezeVm({
        level: 'verified',
        labelKey: LABEL_VERIFIED,
        color: COLOR_VERIFIED,
        severity: 'info',
        detail: {
            authority: pub.authority,
            publicKeyId: keyId,
        },
    });
}

/**
 * Convenience predicate — `true` when badge level is 'verified'. Used by
 * banner consumers to gate UI affordances (e.g., "Trusted" pill).
 */
export function isTrustBadgeVerified(vm: TrustBadgeVM | null | undefined): boolean {
    return !!vm && vm.level === 'verified';
}
