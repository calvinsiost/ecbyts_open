// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * SHARE-001 Multi-tenancy Policy — pure module
 *
 * Centralizes the org-role + resource-share permission matrix that
 * organizations.js currently lacks. Pure functions only — no Supabase,
 * no DOM, no global state.
 */

// ============================================================================
// Types
// ============================================================================

export type OrgRole = 'guest' | 'member' | 'admin' | 'owner';
export type Action = 'read' | 'comment' | 'write' | 'share' | 'delete' | 'manage_members' | 'transfer';
export type ShareScope = 'read' | 'write' | 'share';
export type SharePermissionLevel = 'view' | 'comment' | 'edit' | 'admin';
export type PublicSharePermissionLevel = 'view' | 'comment';

export interface AccessRequirementsEntry {
    readonly action: Action;
    readonly orgRoles: ReadonlyArray<string>;
    readonly minOrgRole: string | null;
    readonly shareScopes: ReadonlyArray<ShareScope>;
    readonly permissionLevels: ReadonlyArray<SharePermissionLevel>;
}

export interface PermissionContext {
    readonly orgRole?: unknown;
    readonly action?: unknown;
    readonly share?: unknown;
}

export interface CanResult {
    readonly ok: boolean;
    readonly reason: string;
    readonly denialReason?: string | undefined;
    readonly requirements?: AccessRequirementsEntry | undefined;
}

export interface ExplainAccessResult {
    readonly ok: boolean;
    readonly reason: string;
    readonly action?: string | undefined;
    readonly via?: string | undefined;
    readonly orgRole?: string | null | undefined;
    readonly shareScope?: string | undefined;
    readonly permissionLevel?: string | null | undefined;
    readonly requirements?: AccessRequirementsEntry | undefined;
}

export interface ShareGrantInput {
    readonly resourceId?: unknown;
    readonly granteeId?: unknown;
    readonly scope?: unknown;
    readonly permissionLevel?: unknown;
    readonly permission_level?: unknown;
    readonly permission?: unknown;
    readonly expiresAt?: unknown;
    readonly expires_at?: unknown;
    readonly revokedAt?: unknown;
    readonly revoked_at?: unknown;
}

export interface ValidateGrantResult {
    readonly ok: boolean;
    readonly field?: string;
    readonly reason?: string;
}

export interface PublicShareLinkInput {
    readonly token?: unknown;
    readonly shareCode?: unknown;
    readonly share_code?: unknown;
    readonly code?: unknown;
    readonly permissionLevel?: unknown;
    readonly permission_level?: unknown;
    readonly permission?: unknown;
    readonly revokedAt?: unknown;
    readonly revoked_at?: unknown;
    readonly expiresAt?: unknown;
    readonly expires_at?: unknown;
    readonly maxUses?: unknown;
    readonly max_uses?: unknown;
    readonly useCount?: unknown;
    readonly use_count?: unknown;
    readonly requireAuth?: unknown;
    readonly require_auth?: unknown;
    readonly passwordHash?: unknown;
    readonly password_hash?: unknown;
}

export interface PublicShareLinkOptions {
    readonly authenticated?: boolean;
    readonly passwordVerified?: boolean;
    readonly now?: number;
}

export interface PublicShareLinkResult {
    readonly ok: boolean;
    readonly reason: string;
    readonly permissionLevel?: SharePermissionLevel;
}

interface ShareGrantResolution {
    readonly ok: boolean;
    readonly reason?: string;
    readonly scope?: ShareScope;
    readonly permissionLevel?: SharePermissionLevel | null;
    readonly actions?: ReadonlyArray<Action>;
}

interface GrantAccessRead {
    readonly field: string;
    readonly value: unknown;
}

interface GrantAccessResolved {
    readonly scope: ShareScope | null;
    readonly permissionLevel: SharePermissionLevel | null;
}

// ============================================================================
// Constants
// ============================================================================

export const ORG_ROLES: Readonly<Record<OrgRole, number>> = Object.freeze({
    guest: 0,
    member: 1,
    admin: 2,
    owner: 3,
});

const ORG_ROLE_ALIASES: Readonly<Record<string, OrgRole>> = Object.freeze({
    viewer: 'guest',
});

export const ACTIONS = Object.freeze({
    READ: 'read',
    COMMENT: 'comment',
    WRITE: 'write',
    SHARE: 'share',
    DELETE: 'delete',
    MANAGE_MEMBERS: 'manage_members',
    TRANSFER: 'transfer',
} as const);

export const DENIAL_REASONS = Object.freeze({
    INVALID_CONTEXT: 'invalid_context',
    INVALID_ACTION: 'invalid_action',
    INVALID_ORG_ROLE: 'invalid_org_role',
    ORG_ROLE_INSUFFICIENT: 'org_role_insufficient',
    SHARE_SCOPE_INSUFFICIENT: 'share_scope_insufficient',
    INVALID_SHARE_SCOPE: 'invalid_share_scope',
    INVALID_SHARE_EXPIRY: 'invalid_share_expiry',
    SHARE_EXPIRED: 'share_expired',
    SHARE_REVOKED: 'share_revoked',
    FORBIDDEN: 'forbidden',
} as const);

export const ROLE_PERMISSIONS: Readonly<Record<OrgRole, ReadonlyArray<Action>>> = Object.freeze({
    guest: Object.freeze([ACTIONS.READ]),
    member: Object.freeze([ACTIONS.READ, ACTIONS.COMMENT, ACTIONS.WRITE]),
    admin: Object.freeze([
        ACTIONS.READ,
        ACTIONS.COMMENT,
        ACTIONS.WRITE,
        ACTIONS.SHARE,
        ACTIONS.DELETE,
        ACTIONS.MANAGE_MEMBERS,
    ]),
    owner: Object.freeze([
        ACTIONS.READ,
        ACTIONS.COMMENT,
        ACTIONS.WRITE,
        ACTIONS.SHARE,
        ACTIONS.DELETE,
        ACTIONS.MANAGE_MEMBERS,
        ACTIONS.TRANSFER,
    ]),
});

export const SHARE_SCOPES = Object.freeze({
    READ: 'read',
    WRITE: 'write',
    SHARE: 'share',
} as const);

export const SHARE_PERMISSION_LEVELS = Object.freeze({
    VIEW: 'view',
    COMMENT: 'comment',
    EDIT: 'edit',
    ADMIN: 'admin',
} as const);

export const PUBLIC_SHARE_PERMISSION_LEVELS = Object.freeze({
    VIEW: SHARE_PERMISSION_LEVELS.VIEW,
    COMMENT: SHARE_PERMISSION_LEVELS.COMMENT,
} as const);

const SHARE_PERMISSION_ALIASES: Readonly<Record<string, SharePermissionLevel>> = Object.freeze({
    viewer: SHARE_PERMISSION_LEVELS.VIEW,
    reader: SHARE_PERMISSION_LEVELS.VIEW,
    editor: SHARE_PERMISSION_LEVELS.EDIT,
});

const SHARE_PERMISSION_TO_SCOPE: Readonly<Record<SharePermissionLevel, ShareScope>> = Object.freeze({
    view: SHARE_SCOPES.READ,
    comment: SHARE_SCOPES.READ,
    edit: SHARE_SCOPES.WRITE,
    admin: SHARE_SCOPES.SHARE,
});

const SHARE_PERMISSION_TO_ACTIONS: Readonly<Record<SharePermissionLevel, ReadonlyArray<Action>>> = Object.freeze({
    view: Object.freeze([ACTIONS.READ]),
    comment: Object.freeze([ACTIONS.READ, ACTIONS.COMMENT]),
    edit: Object.freeze([ACTIONS.READ, ACTIONS.COMMENT, ACTIONS.WRITE]),
    admin: Object.freeze([ACTIONS.READ, ACTIONS.COMMENT, ACTIONS.WRITE, ACTIONS.SHARE]),
});

const SHARE_SCOPE_TO_ACTIONS: Readonly<Record<ShareScope, ReadonlyArray<Action>>> = Object.freeze({
    read: Object.freeze([ACTIONS.READ]),
    write: Object.freeze([ACTIONS.READ, ACTIONS.COMMENT, ACTIONS.WRITE]),
    share: Object.freeze([ACTIONS.READ, ACTIONS.COMMENT, ACTIONS.WRITE, ACTIONS.SHARE]),
});

export const ACCESS_REQUIREMENTS: Readonly<Record<string, AccessRequirementsEntry>> = Object.freeze(
    _buildAccessRequirements(),
);

// ============================================================================
// Role helpers
// ============================================================================

export function normalizeOrgRole(role: unknown): OrgRole | null {
    if (typeof role !== 'string') return null;
    const key = role.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(ORG_ROLE_ALIASES, key)) {
        return ORG_ROLE_ALIASES[key] as OrgRole;
    }
    return Object.prototype.hasOwnProperty.call(ORG_ROLES, key) ? (key as OrgRole) : null;
}

export function isValidRole(role: unknown): boolean {
    return normalizeOrgRole(role) != null;
}

export function hasRoleAtLeast(role: unknown, minRole: unknown): boolean {
    const normalizedRole = normalizeOrgRole(role);
    const normalizedMinRole = normalizeOrgRole(minRole);
    if (!normalizedRole || !normalizedMinRole) return false;
    return ORG_ROLES[normalizedRole] >= ORG_ROLES[normalizedMinRole];
}

export function normalizeSharePermissionLevel(permissionLevel: unknown): SharePermissionLevel | null {
    if (typeof permissionLevel !== 'string') return null;
    const key = permissionLevel.trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(SHARE_PERMISSION_ALIASES, key)) {
        return SHARE_PERMISSION_ALIASES[key] as SharePermissionLevel;
    }
    const allLevels: ReadonlyArray<string> = Object.values(SHARE_PERMISSION_LEVELS);
    return allLevels.includes(key) ? (key as SharePermissionLevel) : null;
}

export function sharePermissionLevelToScope(permissionLevel: unknown): ShareScope | null {
    const normalized = normalizeSharePermissionLevel(permissionLevel);
    return normalized ? SHARE_PERMISSION_TO_SCOPE[normalized] : null;
}

export function normalizeShareScope(value: unknown): ShareScope | null {
    if (typeof value !== 'string') return null;
    const key = value.trim().toLowerCase();
    const allScopes: ReadonlyArray<string> = Object.values(SHARE_SCOPES);
    if (allScopes.includes(key)) return key as ShareScope;
    return sharePermissionLevelToScope(key);
}

export function sharePermissionLevelCan(permissionLevel: unknown, action: unknown): boolean {
    const allActions: ReadonlyArray<string> = Object.values(ACTIONS);
    if (typeof action !== 'string' || !allActions.includes(action)) return false;
    const normalized = normalizeSharePermissionLevel(permissionLevel);
    if (!normalized) return false;
    return (SHARE_PERMISSION_TO_ACTIONS[normalized] as ReadonlyArray<string>).includes(action);
}

export function getAccessRequirements(action: unknown): AccessRequirementsEntry | null {
    const allActions: ReadonlyArray<string> = Object.values(ACTIONS);
    if (typeof action !== 'string' || !allActions.includes(action)) return null;
    return ACCESS_REQUIREMENTS[action] ?? null;
}

// ============================================================================
// Permission resolution
// ============================================================================

export function can(ctx: PermissionContext | null | undefined): CanResult {
    const access = explainAccess(ctx);
    if (access.ok) {
        return { ok: true, reason: access.reason };
    }

    if (
        access.reason === DENIAL_REASONS.INVALID_CONTEXT ||
        access.reason === DENIAL_REASONS.INVALID_ACTION ||
        access.reason === DENIAL_REASONS.SHARE_EXPIRED ||
        access.reason === DENIAL_REASONS.SHARE_REVOKED
    ) {
        return { ok: false, reason: access.reason, denialReason: access.reason };
    }

    return {
        ok: false,
        reason: DENIAL_REASONS.FORBIDDEN,
        denialReason: access.reason,
        requirements: access.requirements,
    };
}

export function explainAccess(ctx: PermissionContext | null | undefined): ExplainAccessResult {
    if (!ctx || typeof ctx !== 'object') {
        return { ok: false, reason: DENIAL_REASONS.INVALID_CONTEXT };
    }
    const { orgRole, action, share } = ctx;

    const allActions: ReadonlyArray<string> = Object.values(ACTIONS);
    if (typeof action !== 'string' || !allActions.includes(action)) {
        return { ok: false, reason: DENIAL_REASONS.INVALID_ACTION };
    }

    const requirements = getAccessRequirements(action) ?? undefined;

    // 1. Org role grant
    const normalizedRole = normalizeOrgRole(orgRole);
    if (normalizedRole) {
        const allowed: ReadonlyArray<string> = ROLE_PERMISSIONS[normalizedRole] ?? [];
        if (allowed.includes(action)) {
            return {
                ok: true,
                reason: `org_role:${normalizedRole}`,
                via: 'org_role',
                action,
                orgRole: normalizedRole,
                requirements,
            };
        }
    }

    // 2. Resource share grant (only if not already authorized via role)
    if (share && typeof share === 'object') {
        const grant = _resolveShareGrant(share as ShareGrantInput);
        if (grant.ok && grant.actions && (grant.actions as ReadonlyArray<string>).includes(action)) {
            return {
                ok: true,
                reason: `share:${grant.scope ?? ''}`,
                via: 'share',
                action,
                orgRole: normalizedRole,
                shareScope: grant.scope,
                permissionLevel: grant.permissionLevel,
                requirements,
            };
        }
        if (grant.reason === DENIAL_REASONS.SHARE_EXPIRED || grant.reason === DENIAL_REASONS.SHARE_REVOKED) {
            return { ok: false, reason: grant.reason, action, orgRole: normalizedRole, requirements };
        }
        if (grant.reason === 'invalid_expiry') {
            return {
                ok: false,
                reason: DENIAL_REASONS.INVALID_SHARE_EXPIRY,
                action,
                orgRole: normalizedRole,
                requirements,
            };
        }
        if (grant.reason === 'invalid_scope') {
            return {
                ok: false,
                reason: DENIAL_REASONS.INVALID_SHARE_SCOPE,
                action,
                orgRole: normalizedRole,
                requirements,
            };
        }
        if (grant.ok && grant.actions && !(grant.actions as ReadonlyArray<string>).includes(action)) {
            return {
                ok: false,
                reason: DENIAL_REASONS.SHARE_SCOPE_INSUFFICIENT,
                action,
                orgRole: normalizedRole,
                shareScope: grant.scope,
                permissionLevel: grant.permissionLevel,
                requirements,
            };
        }
    }

    return {
        ok: false,
        reason: normalizedRole ? DENIAL_REASONS.ORG_ROLE_INSUFFICIENT : DENIAL_REASONS.INVALID_ORG_ROLE,
        action,
        orgRole: normalizedRole,
        requirements,
    };
}

export function validateShareGrant(grant: ShareGrantInput | null | undefined): ValidateGrantResult {
    if (!grant || typeof grant !== 'object') {
        return { ok: false, field: 'grant', reason: 'missing' };
    }
    if (typeof grant.resourceId !== 'string' || grant.resourceId.length < 1) {
        return { ok: false, field: 'resourceId', reason: 'missing' };
    }
    if (typeof grant.granteeId !== 'string' || grant.granteeId.length < 1) {
        return { ok: false, field: 'granteeId', reason: 'missing' };
    }
    const access = _readGrantAccess(grant);
    if (!access.value) {
        return { ok: false, field: 'scope', reason: 'missing' };
    }
    if (!_resolveGrantAccess(access).scope) {
        return { ok: false, field: access.field, reason: 'invalid' };
    }
    const expiresAt = _readGrantExpiry(grant);
    if (expiresAt != null) {
        const ts = _parseExpiry(expiresAt);
        const field = _readGrantExpiryField(grant);
        if (ts == null) {
            return { ok: false, field, reason: 'invalid' };
        }
        if (ts <= Date.now()) {
            return { ok: false, field, reason: 'in_past' };
        }
    }
    return { ok: true };
}

export function validatePublicShareLink(
    link: PublicShareLinkInput | null | undefined,
    options: PublicShareLinkOptions = {},
): PublicShareLinkResult {
    if (!link || typeof link !== 'object') {
        return { ok: false, reason: 'invalid_context' };
    }

    const token = _firstDefined(link.token, link.shareCode, link.share_code, link.code);
    if (typeof token !== 'string' || token.trim().length < 6) {
        return { ok: false, reason: 'invalid_token' };
    }

    const rawPermission = _firstDefined(link.permissionLevel, link.permission_level, link.permission);
    const permissionLevel = normalizeSharePermissionLevel(
        (rawPermission as string | undefined) || SHARE_PERMISSION_LEVELS.VIEW,
    );
    const publicLevels: ReadonlyArray<string> = Object.values(PUBLIC_SHARE_PERMISSION_LEVELS);
    if (!permissionLevel || !publicLevels.includes(permissionLevel)) {
        return { ok: false, reason: 'invalid_permission' };
    }

    if (_firstDefined(link.revokedAt, link.revoked_at) != null) {
        return { ok: false, reason: 'revoked' };
    }

    const expiresAt = _firstDefined(link.expiresAt, link.expires_at);
    const expiresTs = _parseExpiry(expiresAt);
    if (expiresTs == null) {
        return { ok: false, reason: 'invalid_expiry' };
    }
    const now = typeof options.now === 'number' && Number.isFinite(options.now) ? options.now : Date.now();
    if (expiresTs <= now) {
        return { ok: false, reason: 'expired' };
    }

    const maxUses = _firstDefined(link.maxUses, link.max_uses);
    const useCount = _firstDefined(link.useCount, link.use_count, 0);
    if (maxUses != null) {
        if (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 1) {
            return { ok: false, reason: 'invalid_max_uses' };
        }
        if (typeof useCount !== 'number' || !Number.isInteger(useCount) || useCount < 0) {
            return { ok: false, reason: 'invalid_use_count' };
        }
        if (useCount >= maxUses) {
            return { ok: false, reason: 'uses_exceeded' };
        }
    }

    const requireAuth = _firstDefined(link.requireAuth, link.require_auth, false);
    if (requireAuth === true && options.authenticated !== true) {
        return { ok: false, reason: 'auth_required' };
    }

    const passwordHash = _firstDefined(link.passwordHash, link.password_hash);
    if (passwordHash && options.passwordVerified !== true) {
        return { ok: false, reason: 'password_required' };
    }

    return { ok: true, reason: 'active', permissionLevel };
}

export function buildPublicShareLink(token: unknown, baseUrl: string = 'https://ecbyts.com'): string {
    if (!token || typeof token !== 'string') return '';
    return `${String(baseUrl).replace(/\/$/, '')}/broadcast.html?code=${encodeURIComponent(token.trim())}`;
}

// ============================================================================
// Internal
// ============================================================================

function _resolveShareGrant(share: ShareGrantInput): ShareGrantResolution {
    const access = _readGrantAccess(share);
    const grantAccess = _resolveGrantAccess(access);
    const scope = grantAccess.scope;
    if (!scope) {
        return { ok: false, reason: 'invalid_scope' };
    }
    if (_firstDefined(share.revokedAt, share.revoked_at) != null) {
        return { ok: false, reason: DENIAL_REASONS.SHARE_REVOKED };
    }
    const expiresAt = _readGrantExpiry(share);
    if (expiresAt != null) {
        const ts = _parseExpiry(expiresAt);
        if (ts == null) return { ok: false, reason: 'invalid_expiry' };
        if (ts <= Date.now()) return { ok: false, reason: DENIAL_REASONS.SHARE_EXPIRED };
    }
    const permissionLevel = grantAccess.permissionLevel || _readGrantPermissionLevel(share);
    const actions = permissionLevel
        ? SHARE_PERMISSION_TO_ACTIONS[permissionLevel]
        : SHARE_SCOPE_TO_ACTIONS[scope];
    return { ok: true, scope, permissionLevel, actions };
}

function _parseExpiry(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const t = Date.parse(value);
        return Number.isFinite(t) ? t : null;
    }
    return null;
}

function _readGrantAccess(grant: ShareGrantInput): GrantAccessRead {
    if (grant.scope != null) return { field: 'scope', value: grant.scope };
    if (grant.permissionLevel != null) return { field: 'permissionLevel', value: grant.permissionLevel };
    if (grant.permission_level != null) return { field: 'permission_level', value: grant.permission_level };
    if (grant.permission != null) return { field: 'permission', value: grant.permission };
    return { field: 'scope', value: null };
}

function _readGrantPermissionLevel(grant: ShareGrantInput): SharePermissionLevel | null {
    return normalizeSharePermissionLevel(
        _firstDefined(grant.permissionLevel, grant.permission_level, grant.permission),
    );
}

function _readGrantExpiry(grant: ShareGrantInput): unknown {
    return _firstDefined(grant.expiresAt, grant.expires_at);
}

function _readGrantExpiryField(grant: ShareGrantInput): string {
    return grant && Object.prototype.hasOwnProperty.call(grant, 'expires_at') ? 'expires_at' : 'expiresAt';
}

function _resolveGrantAccess(access: GrantAccessRead): GrantAccessResolved {
    if (access.field === 'scope') {
        const value = access.value;
        const allScopes: ReadonlyArray<string> = Object.values(SHARE_SCOPES);
        const scope =
            typeof value === 'string' && allScopes.includes(value.trim().toLowerCase())
                ? (value.trim().toLowerCase() as ShareScope)
                : null;
        return { scope, permissionLevel: null };
    }

    const permissionLevel = normalizeSharePermissionLevel(access.value);
    return {
        scope: permissionLevel ? SHARE_PERMISSION_TO_SCOPE[permissionLevel] : null,
        permissionLevel,
    };
}

function _buildAccessRequirements(): Record<string, AccessRequirementsEntry> {
    const matrix: Record<string, AccessRequirementsEntry> = {};
    for (const action of Object.values(ACTIONS)) {
        const orgRoles = Object.freeze(
            (Object.keys(ORG_ROLES) as OrgRole[]).filter((role) =>
                (ROLE_PERMISSIONS[role] as ReadonlyArray<string>).includes(action),
            ),
        );
        const shareScopes = Object.freeze(
            (Object.values(SHARE_SCOPES) as ShareScope[]).filter((scope) =>
                (SHARE_SCOPE_TO_ACTIONS[scope] as ReadonlyArray<string>).includes(action),
            ),
        );
        const permissionLevels = Object.freeze(
            (Object.values(SHARE_PERMISSION_LEVELS) as SharePermissionLevel[]).filter((level) =>
                (SHARE_PERMISSION_TO_ACTIONS[level] as ReadonlyArray<string>).includes(action),
            ),
        );

        matrix[action] = Object.freeze({
            action,
            orgRoles,
            minOrgRole: orgRoles[0] ?? null,
            shareScopes,
            permissionLevels,
        });
    }
    return matrix;
}

function _firstDefined(...values: ReadonlyArray<unknown>): unknown {
    for (const value of values) {
        if (value !== undefined) return value;
    }
    return undefined;
}
