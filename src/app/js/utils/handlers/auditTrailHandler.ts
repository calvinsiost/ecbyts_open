// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Generated from src/app/js/utils/handlers/auditTrailHandler.ts by TS-MIGRATION-001. Do not edit manually.
// utils/handlers/auditTrailHandler.js
// Wire-up of P1-62 audit trail schema (Codex SHA-256 variant) into UI.
// window.handleShowAuditTrailDemo() - async builds 4-entry chain and validates integrity.
import {
    AUDIT_ACTIONS,
    createAuditEntry,
    validateAuditChain,
    filterAuditEntries,
} from '../../core/audit/auditTrailSchema.js';
import { showToast } from '../ui/toast.js';
export async function handleShowAuditTrailDemo() {
    try {
        const entries = [];
        const e1Input: any = {
            action: AUDIT_ACTIONS.CREATE,
            actor: 'demo_user',
            target: { type: 'element', id: 'element_1' },
            metadata: { family: 'plume' },
        };
        const e1 = await createAuditEntry(e1Input);
        entries.push(e1);
        const e2 = await createAuditEntry({
            action: AUDIT_ACTIONS.UPDATE,
            actor: 'demo_user',
            target: { type: 'element', id: 'element_1' },
            metadata: { field: 'depth', oldValue: 5, newValue: 7 },
            prevHash: e1.hash,
        });
        entries.push(e2);
        const e3 = await createAuditEntry({
            action: AUDIT_ACTIONS.APPROVE,
            actor: 'reviewer',
            target: { type: 'element', id: 'element_1' },
            prevHash: e2.hash,
        });
        entries.push(e3);
        const validation = await validateAuditChain(entries);
        const updates = filterAuditEntries(entries, { action: AUDIT_ACTIONS.UPDATE });
        const lines = [
            `Audit trail demo — ${entries.length} entries (SHA-256 chain)`,
            `Chain valid: ${validation.valid ? 'YES' : 'NO (' + (validation.reason || 'invalid') + ')'}`,
            `Filter UPDATE: ${updates.length} | Last hash: ${e3.hash.slice(0, 8)}...`,
        ];
        showToast(lines.join(' • '), 'info', 7000);
    } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        showToast('Audit trail demo erro: ' + message, 'error');
    }
}
export const auditTrailHandlers = { handleShowAuditTrailDemo };
