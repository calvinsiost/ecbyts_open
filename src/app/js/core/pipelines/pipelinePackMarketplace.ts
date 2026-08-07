// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK MARKETPLACE - pure publish-preparation helpers.

   No backend calls live here. These helpers only sanitize a PipelinePack-shaped
   payload and decide whether it is safe to offer for future Marketplace flow.
   ================================================================ */

import {
    normalizePipelinePack,
    validatePipelinePack,
    type PipelineAssetBinding,
    type PipelinePack,
    type PipelinePackPermission,
} from './pipelinePack.js';

export type PipelinePackMarketplaceChangeKind =
    | 'local-path-removed'
    | 'local-path-basename-kept'
    | 'signed-url-removed'
    | 'files-path-promoted';

export interface PipelinePackMarketplaceSanitizationChange {
    kind: PipelinePackMarketplaceChangeKind;
    path: string;
    message: string;
}

export interface PipelinePackMarketplaceSanitizationResult {
    pack: PipelinePack;
    changes: PipelinePackMarketplaceSanitizationChange[];
}

export interface PipelinePackMarketplacePermissionSummary {
    defaultPermission: PipelinePackPermission;
    allowedRoles: PipelinePackPermission[];
    shareableRoles: PipelinePackPermission[];
    isOwnerOnly: boolean;
    label: 'owner-only' | 'shareable' | 'restricted-shareable';
}

export interface PipelinePackMarketplaceNotice {
    code: string;
    message: string;
    path?: string;
    assetId?: string;
    targetId?: string;
}

export interface PipelinePackMarketplaceReadiness {
    publishable: boolean;
    permissionSummary: PipelinePackMarketplacePermissionSummary;
    blockers: PipelinePackMarketplaceNotice[];
    warnings: PipelinePackMarketplaceNotice[];
}

export interface PipelinePackMarketplacePreparation extends PipelinePackMarketplaceReadiness {
    pack: PipelinePack;
    sanitization: {
        changes: PipelinePackMarketplaceSanitizationChange[];
    };
}

const SIGNED_QUERY_KEYS = new Set([
    'access_token',
    'expires',
    'expires_at',
    'expiresin',
    'expires_in',
    'signature',
    'sig',
    'token',
    'x-amz-algorithm',
    'x-amz-credential',
    'x-amz-date',
    'x-amz-expires',
    'x-amz-security-token',
    'x-amz-signature',
]);

const BLOCKING_ASSET_STATUSES = new Set<PipelineAssetBinding['status']>([
    'local-only',
    'missing',
    'no-permission',
    'pending-validation',
]);

function _isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function _nonEmpty(value: unknown): string {
    return String(value ?? '').trim();
}

function _change(
    changes: PipelinePackMarketplaceSanitizationChange[],
    kind: PipelinePackMarketplaceChangeKind,
    path: string,
    message: string,
): void {
    changes.push({ kind, path, message });
}

function _basenameFromAnyPath(value: string): string {
    const normalized = value.replace(/\\/g, '/');
    return normalized.split('/').filter(Boolean).pop() || '';
}

function _isBasenameField(key: string): boolean {
    return key === 'fileName' || key === 'sourceFileName';
}

function _isSignedUrlField(key: string): boolean {
    return /^(signedUrl|signed_url|temporaryUrl|temporary_url|tempUrl|temp_url)$/i.test(key);
}

function _isLocalPersonalPath(value: string): boolean {
    const text = value.trim();
    if (!text) return false;
    return (
        /^[a-zA-Z]:[\\/]/.test(text) ||
        /^\\\\[^\\/]+[\\/][^\\/]+/.test(text) ||
        /^file:\/\//i.test(text) ||
        /^~[\\/]/.test(text) ||
        /(^|[\\/])Users[\\/][^\\/]+[\\/]/i.test(text) ||
        /^\/(?:Users|home)\/[^/]+\/.+/.test(text)
    );
}

function _isTemporarySignedUrl(value: string): boolean {
    const text = value.trim();
    if (!/^https?:\/\//i.test(text)) return false;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return false;
    }
    const path = url.pathname.toLowerCase();
    if (path.includes('/object/sign/') || path.includes('/signed/')) return true;
    for (const key of url.searchParams.keys()) {
        if (SIGNED_QUERY_KEYS.has(key.toLowerCase())) return true;
    }
    return /(?:token|signature|x-amz-signature)=/i.test(url.search);
}

function _isLogicalFilesPath(value: string): boolean {
    const text = value.trim();
    return /^(files|supabase|storage):\/\//i.test(text);
}

function _isShareableAssetPath(value: unknown): boolean {
    const text = _nonEmpty(value);
    if (!text) return false;
    if (_isLocalPersonalPath(text) || _isTemporarySignedUrl(text)) return false;
    if (/^https?:\/\//i.test(text) || /^file:\/\//i.test(text)) return false;
    if (text.includes('\\')) return false;
    if (text.split('/').includes('..')) return false;
    return true;
}

function _sanitizeString(
    value: string,
    path: string,
    key: string,
    changes: PipelinePackMarketplaceSanitizationChange[],
): string | undefined {
    if (_isTemporarySignedUrl(value)) {
        _change(changes, 'signed-url-removed', path, 'URL assinada temporaria removida do Pipeline Pack.');
        return undefined;
    }
    if (!_isLocalPersonalPath(value)) return value;

    if (_isBasenameField(key)) {
        const basename = _basenameFromAnyPath(value);
        if (basename) {
            _change(changes, 'local-path-basename-kept', path, 'Caminho local pessoal removido; apenas o nome do arquivo foi mantido.');
            return basename;
        }
    }

    _change(changes, 'local-path-removed', path, 'Caminho local pessoal removido do Pipeline Pack.');
    return undefined;
}

function _promoteLogicalFilesPath(
    record: Record<string, unknown>,
    path: string,
    changes: PipelinePackMarketplaceSanitizationChange[],
): void {
    const storagePath = _nonEmpty(record.storagePath);
    const filesPath = _nonEmpty(record.filesPath);
    if (!storagePath && _isLogicalFilesPath(filesPath)) {
        record.storagePath = filesPath;
        _change(changes, 'files-path-promoted', `${path}.storagePath`, 'Path logico de Files mantido como storagePath.');
    }
}

function _sanitizeValue(
    value: unknown,
    path: string,
    key: string,
    changes: PipelinePackMarketplaceSanitizationChange[],
): unknown {
    if (typeof value === 'string') {
        return _sanitizeString(value, path, key, changes);
    }
    if (Array.isArray(value)) {
        return value
            .map((item, index) => _sanitizeValue(item, `${path}[${index}]`, '', changes))
            .filter((item) => item !== undefined);
    }
    if (_isRecord(value)) {
        const out: Record<string, unknown> = {};
        for (const [childKey, childValue] of Object.entries(value)) {
            const childPath = path ? `${path}.${childKey}` : childKey;
            if (_isSignedUrlField(childKey)) {
                _change(changes, 'signed-url-removed', childPath, 'Campo de URL assinada removido do Pipeline Pack.');
                continue;
            }
            const sanitized = _sanitizeValue(childValue, childPath, childKey, changes);
            if (sanitized !== undefined) out[childKey] = sanitized;
        }
        _promoteLogicalFilesPath(out, path, changes);
        return out;
    }
    return value;
}

function _dedupeRoles(roles: PipelinePackPermission[]): PipelinePackPermission[] {
    const out: PipelinePackPermission[] = [];
    for (const role of roles) {
        if (role && !out.includes(role)) out.push(role);
    }
    return out;
}

export function sanitizePipelinePackForMarketplace(input: unknown): PipelinePackMarketplaceSanitizationResult {
    const changes: PipelinePackMarketplaceSanitizationChange[] = [];
    const sanitized = _sanitizeValue(input, 'pack', '', changes);
    return {
        pack: normalizePipelinePack(sanitized),
        changes,
    };
}

export function summarizePipelinePackMarketplacePermissions(input: unknown): PipelinePackMarketplacePermissionSummary {
    const pack = normalizePipelinePack(input);
    const defaultPermission = pack.permissions.defaultPermission;
    const allowedRoles = _dedupeRoles(pack.permissions.allowedRoles);
    const effectiveRoles = allowedRoles.length > 0 ? allowedRoles : [defaultPermission];
    const shareableRoles = _dedupeRoles(effectiveRoles.filter((role) => role !== 'owner'));
    const explicitOwnerOnly = allowedRoles.length > 0 && shareableRoles.length === 0;
    const defaultOwnerOnly = defaultPermission === 'owner' && shareableRoles.length === 0;
    const isOwnerOnly = explicitOwnerOnly || defaultOwnerOnly;
    const label = isOwnerOnly
        ? 'owner-only'
        : shareableRoles.includes('view') || shareableRoles.includes('student')
            ? 'shareable'
            : 'restricted-shareable';

    return {
        defaultPermission,
        allowedRoles,
        shareableRoles,
        isOwnerOnly,
        label,
    };
}

function _assetBlockers(pack: PipelinePack): PipelinePackMarketplaceNotice[] {
    const blockers: PipelinePackMarketplaceNotice[] = [];
    for (const asset of pack.assets) {
        if (BLOCKING_ASSET_STATUSES.has(asset.status)) {
            blockers.push({
                code: `asset.${asset.status}`,
                assetId: asset.id,
                message: `Asset pendente para Marketplace: ${asset.label} (${asset.status}).`,
            });
            continue;
        }
        if (asset.status === 'uploaded' && !_isShareableAssetPath(asset.storagePath)) {
            blockers.push({
                code: 'asset.path.missing',
                assetId: asset.id,
                message: `Asset enviado precisa de path logico de Files/Supabase: ${asset.label}.`,
            });
        }
    }
    return blockers;
}

function _noticeFromValidationIssue(
    code: string,
    issue: { message: string; assetId?: string; targetId?: string },
): PipelinePackMarketplaceNotice {
    const notice: PipelinePackMarketplaceNotice = {
        code,
        message: issue.message,
    };
    if (issue.assetId) notice.assetId = issue.assetId;
    if (issue.targetId) notice.targetId = issue.targetId;
    return notice;
}

function _readinessFromSanitizedPack(
    pack: PipelinePack,
    changes: PipelinePackMarketplaceSanitizationChange[],
): PipelinePackMarketplaceReadiness {
    const permissionSummary = summarizePipelinePackMarketplacePermissions(pack);
    const validation = validatePipelinePack(pack);
    const blockers: PipelinePackMarketplaceNotice[] = [];
    const warnings: PipelinePackMarketplaceNotice[] = changes.map((change) => ({
        code: `sanitization.${change.kind}`,
        path: change.path,
        message: change.message,
    }));

    if (permissionSummary.isOwnerOnly) {
        blockers.push({
            code: 'permission.owner-only',
            message: 'Permissao owner-only impede publicacao em Marketplace.',
        });
    }

    for (const issue of validation.errors) {
        if (issue.code.startsWith('asset.')) continue;
        blockers.push(_noticeFromValidationIssue(`validation.${issue.code}`, issue));
    }
    for (const issue of validation.warnings) {
        warnings.push(_noticeFromValidationIssue(`validation.${issue.code}`, issue));
    }

    blockers.push(..._assetBlockers(pack));

    return {
        publishable: blockers.length === 0,
        permissionSummary,
        blockers,
        warnings,
    };
}

export function evaluatePipelinePackMarketplaceReadiness(input: unknown): PipelinePackMarketplaceReadiness {
    const sanitized = sanitizePipelinePackForMarketplace(input);
    return _readinessFromSanitizedPack(sanitized.pack, sanitized.changes);
}

export function preparePipelinePackForMarketplace(input: unknown): PipelinePackMarketplacePreparation {
    const sanitized = sanitizePipelinePackForMarketplace(input);
    const readiness = _readinessFromSanitizedPack(sanitized.pack, sanitized.changes);
    return {
        ...readiness,
        pack: sanitized.pack,
        sanitization: {
            changes: sanitized.changes,
        },
    };
}
