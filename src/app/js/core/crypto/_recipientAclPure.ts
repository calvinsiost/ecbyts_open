// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Recipient ACL — pure logic for SPEC_ECBT_KEY_ENCRYPTION_BY_RADAR_PROFILE.
 *
 * Manages the list of recipients authorized to decrypt an ECBT key Type D
 * envelope. Pure: caller passes the current ACL + an operation; module
 * returns a frozen new ACL. Append-only audit trail of grants/revokes.
 *
 * Anti-N:
 *   - Owner CANNOT be revoked (self-protection)
 *   - Duplicate grants → no-op (don't crash)
 *   - Revoke of absent recipient → no-op
 *   - Expired grants auto-excluded from `getActiveRecipients`
 *
 * Tests live in `tests/recipient-acl-pure.test.mjs`.
 */

export type RecipientRole = 'owner' | 'editor' | 'viewer';

export interface RecipientGrant {
    readonly userId: string;
    readonly role: RecipientRole;
    readonly grantedAt: string;
    readonly grantedBy: string;
    readonly expiresAt?: string; // ISO; absent = never expires
}

export interface RevocationEntry {
    readonly userId: string;
    readonly revokedAt: string;
    readonly revokedBy: string;
    readonly reason: string;
}

export interface AclState {
    readonly ownerUserId: string;
    readonly grants: ReadonlyArray<RecipientGrant>;
    readonly revocations: ReadonlyArray<RevocationEntry>;
}

export interface AclMutationResult {
    readonly state: AclState;
    readonly changed: boolean;
    readonly error?: string;
}

const ALLOWED_ROLES: ReadonlyArray<RecipientRole> = Object.freeze(['owner', 'editor', 'viewer']);

function isNonEmptyString(v: unknown): v is string {
    return typeof v === 'string' && v.length > 0;
}

function isAllowedRole(v: unknown): v is RecipientRole {
    return typeof v === 'string' && (ALLOWED_ROLES as ReadonlyArray<string>).includes(v);
}

function isValidIso(v: unknown): v is string {
    return isNonEmptyString(v) && Number.isFinite(Date.parse(v));
}

function freezeState(s: AclState): AclState {
    return Object.freeze({
        ownerUserId: s.ownerUserId,
        grants: Object.freeze(s.grants.map((g) => Object.freeze({ ...g }))),
        revocations: Object.freeze(s.revocations.map((r) => Object.freeze({ ...r }))),
    });
}

/**
 * Bootstrap a new ACL with an owner. Owner is implicitly granted with
 * role='owner' + never-expiring. Pure.
 */
export function createAcl(ownerUserId: string, nowIso: string): AclState | null {
    if (!isNonEmptyString(ownerUserId)) return null;
    if (!isValidIso(nowIso)) return null;
    return freezeState({
        ownerUserId,
        grants: [
            {
                userId: ownerUserId,
                role: 'owner',
                grantedAt: nowIso,
                grantedBy: ownerUserId,
            },
        ],
        revocations: [],
    });
}

/**
 * Add a grant. Pure: returns new frozen state + change flag.
 *
 * Rules:
 *   - Duplicate (userId, role) → no-op
 *   - Cannot grant 'owner' role to non-owner (use transferOwnership)
 *   - Invalid input → error
 */
export function grantRecipient(
    state: AclState | null | undefined,
    grant: Partial<RecipientGrant> | null | undefined,
): AclMutationResult {
    if (!state || typeof state !== 'object') {
        return Object.freeze({ state: state ?? createAcl('__null__', '1970-01-01T00:00:00Z')!, changed: false, error: 'state_invalid' });
    }
    if (!grant || typeof grant !== 'object') {
        return Object.freeze({ state, changed: false, error: 'grant_invalid' });
    }
    if (!isNonEmptyString(grant.userId)) {
        return Object.freeze({ state, changed: false, error: 'userId_missing' });
    }
    if (!isAllowedRole(grant.role)) {
        return Object.freeze({ state, changed: false, error: 'role_invalid' });
    }
    if (!isValidIso(grant.grantedAt)) {
        return Object.freeze({ state, changed: false, error: 'grantedAt_invalid' });
    }
    if (!isNonEmptyString(grant.grantedBy)) {
        return Object.freeze({ state, changed: false, error: 'grantedBy_missing' });
    }
    if (grant.role === 'owner' && grant.userId !== state.ownerUserId) {
        return Object.freeze({ state, changed: false, error: 'cannot_grant_owner_role' });
    }
    if (grant.expiresAt !== undefined && !isValidIso(grant.expiresAt)) {
        return Object.freeze({ state, changed: false, error: 'expiresAt_invalid' });
    }
    // Dup check (userId + role)
    const dup = state.grants.find((g) => g.userId === grant.userId && g.role === grant.role);
    if (dup) {
        return Object.freeze({ state, changed: false });
    }
    const newGrant: RecipientGrant = {
        userId: grant.userId,
        role: grant.role,
        grantedAt: grant.grantedAt,
        grantedBy: grant.grantedBy,
        ...(grant.expiresAt !== undefined ? { expiresAt: grant.expiresAt } : {}),
    };
    return Object.freeze({
        state: freezeState({ ...state, grants: [...state.grants, newGrant] }),
        changed: true,
    });
}

/**
 * Revoke a recipient. Pure: returns new frozen state + change flag.
 *
 * Rules:
 *   - Owner CANNOT be revoked (self-protection anti-N)
 *   - Revoke of non-existent recipient → no-op (changed=false)
 *   - All roles for the userId removed; revocation row appended
 */
export function revokeRecipient(
    state: AclState | null | undefined,
    userId: string,
    revokedBy: string,
    reason: string,
    nowIso: string,
): AclMutationResult {
    if (!state || typeof state !== 'object') {
        return Object.freeze({ state: state ?? createAcl('__null__', '1970-01-01T00:00:00Z')!, changed: false, error: 'state_invalid' });
    }
    if (!isNonEmptyString(userId)) {
        return Object.freeze({ state, changed: false, error: 'userId_missing' });
    }
    if (userId === state.ownerUserId) {
        return Object.freeze({ state, changed: false, error: 'cannot_revoke_owner' });
    }
    if (!isNonEmptyString(revokedBy)) {
        return Object.freeze({ state, changed: false, error: 'revokedBy_missing' });
    }
    if (!isNonEmptyString(reason)) {
        return Object.freeze({ state, changed: false, error: 'reason_missing' });
    }
    if (!isValidIso(nowIso)) {
        return Object.freeze({ state, changed: false, error: 'nowIso_invalid' });
    }
    const remaining = state.grants.filter((g) => g.userId !== userId);
    if (remaining.length === state.grants.length) {
        return Object.freeze({ state, changed: false });
    }
    const revocation: RevocationEntry = { userId, revokedAt: nowIso, revokedBy, reason };
    return Object.freeze({
        state: freezeState({
            ...state,
            grants: remaining,
            revocations: [...state.revocations, revocation],
        }),
        changed: true,
    });
}

/**
 * Return active (non-expired) recipients for a given role (or all roles
 * if `role` omitted). Pure.
 */
export function getActiveRecipients(
    state: AclState | null | undefined,
    nowIso: string,
    role?: RecipientRole,
): ReadonlyArray<RecipientGrant> {
    if (!state || !Array.isArray(state.grants)) return Object.freeze([]);
    const now = isValidIso(nowIso) ? Date.parse(nowIso) : Date.now();
    const list = state.grants.filter((g) => {
        if (role && g.role !== role) return false;
        if (g.expiresAt && isValidIso(g.expiresAt) && Date.parse(g.expiresAt) <= now) return false;
        return true;
    });
    return Object.freeze(list);
}

/**
 * Check if a userId is currently authorized for at least one role.
 */
export function isAuthorized(state: AclState | null | undefined, userId: string, nowIso: string): boolean {
    if (!state || !isNonEmptyString(userId)) return false;
    const actives = getActiveRecipients(state, nowIso);
    return actives.some((g) => g.userId === userId);
}
