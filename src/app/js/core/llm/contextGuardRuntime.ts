// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { GUARD_POLICIES, sanitizeModelContext } from './contextGuard.js';

type GuardMode = 'strict' | 'open';
type Redaction = { field: string; type: string };

let _mode: GuardMode = GUARD_POLICIES.STRICT;
let _audit: Redaction[] = [];
const MAX_AUDIT_ENTRIES = 100;

export function getContextGuardMode(): GuardMode {
    return _mode;
}

export function isContextGuardEnabled(): boolean {
    return _mode !== GUARD_POLICIES.OPEN;
}

export function setContextGuardEnabled(enabled: boolean): GuardMode {
    _mode = enabled ? GUARD_POLICIES.STRICT : GUARD_POLICIES.OPEN;
    return _mode;
}

export function sanitizeContextForLlm(rawContext: any, policy: Record<string, any> = {}) {
    const result = sanitizeModelContext(rawContext, { ...policy, mode: _mode });
    if (result.redactions.length > 0) {
        _audit = [..._audit, ...result.redactions.map(({ field, type }: Redaction) => ({ field, type }))].slice(
            -MAX_AUDIT_ENTRIES,
        );
    }
    return result;
}

export function getContextGuardAudit(): Redaction[] {
    return _audit.map(({ field, type }) => ({ field, type }));
}

export function clearContextGuardAudit(): void {
    _audit = [];
}
