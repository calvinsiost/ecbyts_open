// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
import { computeDelta, getScopedSnapshots } from '../purpose/snapshotEngine.js';
import { getContract } from '../../utils/governance/contractManager.js';
import { MIN_DELTA_THRESHOLD } from './creditRules.js';
function normalizeMethod(/** @type {any} */ value: any) {
    const method = String(value || 'automatic').toLowerCase();
    return method === 'auditor' ? 'auditor' : 'automatic';
}
export async function verifyAutomaticDelta(scope = null, timeWindow = '30d') {
    if (scope) {
        const scoped = await getScopedSnapshots(scope, timeWindow);
        if (!Array.isArray(scoped) || scoped.length < 2) {
            return { valid: false, error: 'insufficient_scoped_snapshots' };
        }
        const startSnapshot = scoped[0];
        const endSnapshot = scoped[scoped.length - 1];
        const deltaEis = Math.round((Number(endSnapshot.eis || 0) - Number(startSnapshot.eis || 0)) * 100) / 100;
        if (deltaEis < MIN_DELTA_THRESHOLD)
            return { valid: false, error: 'delta_below_threshold' };
        return {
            valid: true,
            method: 'automatic',
            deltaEis,
            deltaAxes: endSnapshot.axes || {},
            startSnapshot,
            endSnapshot,
            period: timeWindow,
        };
    }
    const delta = await computeDelta(timeWindow);
    if (Number(delta?.deltaEis || 0) < MIN_DELTA_THRESHOLD)
        return { valid: false, error: 'delta_below_threshold' };
    return { valid: true, method: 'automatic', ...delta };
}
export function verifyAuditorAttestation(attestation: any = {}, holderAddress: any = '') {
    const auditorAddress = String(attestation?.auditorAddress || '').toLowerCase();
    const holder = String(holderAddress || '').toLowerCase();
    if (!auditorAddress)
        return { valid: false, error: 'auditor_address_required' };
    if (auditorAddress === holder)
        return { valid: false, error: 'auditor_conflict_of_interest' };
    if (!attestation?.auditorRegistry)
        return { valid: false, error: 'auditor_registry_required' };
    return { valid: true, method: 'auditor' };
}
export function verifyCreditAgreement(/** @type {any} */ contractId: any, expectedMethod = 'automatic') {
    const contract = getContract(contractId);
    if (!contract)
        return { valid: false, error: 'credit_agreement_not_found' };
    if (contract.type !== 'credit_agreement')
        return { valid: false, error: 'contract_type_not_credit_agreement' };
    const method = normalizeMethod(contract?.creditTerms?.verificationMethod);
    if (method !== normalizeMethod(expectedMethod))
        return { valid: false, error: 'verification_method_mismatch' };
    return { valid: true, contract };
}
//# sourceMappingURL=creditVerifier.js.map