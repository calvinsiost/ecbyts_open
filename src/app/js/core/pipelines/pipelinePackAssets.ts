// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   PIPELINE PACK ASSETS - pure Files/Supabase manifest helpers.

   The manifest stores durable file identity only: file ids, logical storage
   paths and app-generated names. Signed URLs are ignored because they expire
   and must be generated on demand by the runtime.
   ================================================================ */

export const PIPELINE_PACK_ASSET_DEFAULT_BUCKET = 'user-files';

export const PIPELINE_PACK_ASSET_DEFAULT_ALLOWED_EXTENSIONS = [
    '.bpmn',
    '.ecbt',
    '.gif',
    '.jpeg',
    '.jpg',
    '.json',
    '.pdf',
    '.png',
    '.svg',
    '.vpp',
    '.webp',
    '.xml',
] as const;

export const PIPELINE_PACK_ASSET_TEMPORARY_URL_FIELDS = [
    'downloadUrl',
    'previewUrl',
    'publicUrl',
    'signedUrl',
    'temporaryUrl',
    'url',
] as const;

export type PipelinePackAssetManifestStatus = 'local' | 'uploaded' | 'missing' | 'no-permission' | 'pending-validation';

export type PipelinePackAssetManifestShareStatus =
    | 'local'
    | 'uploaded'
    | 'missing'
    | 'blocked'
    | 'pending-validation';

export type PipelinePackAssetValidationStatus = 'ready' | 'pending-upload' | 'pending-validation' | 'blocked';

export type PipelinePackAssetPendingSeverity = 'info' | 'warning' | 'blocked';

export interface PipelinePackAssetLike {
    readonly id?: string;
    readonly assetId?: string;
    readonly label?: string;
    readonly kind?: string;
    readonly required?: boolean;
    readonly status?: string;
    readonly state?: string;
    readonly fileName?: string;
    readonly filename?: string;
    readonly name?: string;
    readonly originalName?: string;
    readonly extension?: string;
    readonly mimeType?: string;
    readonly mime_type?: string;
    readonly checksum?: string;
    readonly checksumSha256?: string;
    readonly checksum_sha256?: string;
    readonly hash?: string;
    readonly sha256?: string;
    readonly sizeBytes?: number;
    readonly size_bytes?: number;
    readonly size?: number;
    readonly fileId?: string;
    readonly storagePath?: string;
    readonly storage_path?: string;
    readonly filesPath?: string;
    readonly supabasePath?: string;
    readonly localPath?: string;
    readonly path?: string;
    readonly allowed?: boolean;
    readonly canRead?: boolean;
    readonly canView?: boolean;
    readonly permission?: string;
    readonly linkedNodeIds?: readonly string[];
    readonly downloadUrl?: string;
    readonly previewUrl?: string;
    readonly publicUrl?: string;
    readonly signedUrl?: string;
    readonly temporaryUrl?: string;
    readonly url?: string;
}

export interface PipelinePackAssetManifestPolicy {
    readonly allowedExtensions?: readonly string[];
    readonly bucket?: string;
    readonly ownerId?: string | null;
    readonly packId?: string | null;
    readonly storagePrefix?: string | null;
    readonly fileNamePrefix?: string | null;
    readonly defaultRequired?: boolean;
}

export interface PipelinePackAssetPending {
    readonly code: string;
    readonly severity: PipelinePackAssetPendingSeverity;
    readonly assetId: string;
    readonly message: string;
}

export interface PipelinePackAssetManifestItem {
    readonly assetId: string;
    readonly label: string;
    readonly kind: string;
    readonly required: boolean;
    readonly status: PipelinePackAssetManifestStatus;
    readonly manifestStatus: PipelinePackAssetManifestShareStatus;
    readonly validationStatus: PipelinePackAssetValidationStatus;
    readonly validationCodes: readonly string[];
    readonly originalFileName: string;
    readonly extension: string;
    readonly extensionAllowed: boolean;
    readonly finalFileName: string;
    readonly bucket: string;
    readonly ownerId: string | null;
    readonly storagePath: string | null;
    readonly plannedStoragePath: string | null;
    readonly plannedFilesPath: string | null;
    readonly storagePathIsAuthoritative: boolean;
    readonly fileId?: string;
    readonly checksum?: string;
    readonly sizeBytes: number;
    readonly linkedNodeIds: readonly string[];
    readonly temporaryUrlIgnored: boolean;
}

export interface PipelinePackAssetManifest {
    readonly ok: boolean;
    readonly bucket: string;
    readonly allowedExtensions: readonly string[];
    readonly items: readonly PipelinePackAssetManifestItem[];
    readonly uploadCandidates: readonly PipelinePackAssetManifestItem[];
    readonly pending: readonly PipelinePackAssetPending[];
    readonly counts: Readonly<{
        readonly total: number;
        readonly local: number;
        readonly uploaded: number;
        readonly missing: number;
        readonly noPermission: number;
        readonly pendingValidation: number;
        readonly ready: number;
        readonly blocked: number;
        readonly extensionBlocked: number;
        readonly temporaryUrlsIgnored: number;
    }>;
    readonly urlPolicy: Readonly<{
        readonly persistedUrlAllowed: false;
        readonly mode: 'signed-url-on-demand';
        readonly durableTruth: 'file-id-or-logical-storage-path';
        readonly ignoredFields: readonly string[];
    }>;
}

export interface PipelinePackAssetManifestInput {
    readonly assets?: readonly PipelinePackAssetLike[];
    readonly policy?: PipelinePackAssetManifestPolicy;
}

const MIME_EXTENSION: Readonly<Record<string, string>> = {
    'application/json': '.json',
    'application/pdf': '.pdf',
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
    'text/xml': '.xml',
};

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function pickText(value: unknown, keys: readonly string[]): string {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    for (const key of keys) {
        const candidate = text(record[key]);
        if (candidate) return candidate;
    }
    return '';
}

function normalizeSegment(value: unknown, fallback = ''): string {
    const normalized = text(value || fallback)
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized || fallback;
}

function normalizeStorageOwner(value: unknown): string {
    return text(value)
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/-+/g, '-');
}

function normalizeChecksum(value: unknown): string {
    let checksum = text(value).toLowerCase();
    if (checksum.startsWith('sha256:')) checksum = checksum.slice('sha256:'.length);
    return checksum.replace(/[^a-z0-9]/g, '');
}

function basename(value: string): string {
    const clean = text(value).split(/[?#]/)[0] || '';
    const parts = clean.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || '';
}

function isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(text(value));
}

function normalizeExtension(value: unknown): string {
    const raw = text(value).toLowerCase();
    if (!raw) return '';
    const withDot = raw.startsWith('.') ? raw : `.${raw}`;
    return withDot.replace(/[^.a-z0-9]/g, '');
}

function extensionFromFileName(fileName: string): string {
    const file = basename(fileName).toLowerCase();
    const idx = file.lastIndexOf('.');
    if (idx < 0 || idx === file.length - 1) return '';
    return normalizeExtension(file.slice(idx + 1));
}

function normalizeAllowedExtensions(policy: PipelinePackAssetManifestPolicy): readonly string[] {
    const raw = policy.allowedExtensions?.length
        ? policy.allowedExtensions
        : PIPELINE_PACK_ASSET_DEFAULT_ALLOWED_EXTENSIONS;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const ext of raw) {
        const normalized = normalizeExtension(ext);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return Object.freeze(out);
}

function originalFileName(asset: PipelinePackAssetLike): string {
    return basename(
        pickText(asset, [
            'fileName',
            'filename',
            'name',
            'originalName',
            'localPath',
            'path',
            'storagePath',
            'storage_path',
            'filesPath',
            'supabasePath',
        ]),
    );
}

function assetExtension(asset: PipelinePackAssetLike, originalName: string): string {
    const explicit = normalizeExtension(asset.extension);
    if (explicit) return explicit;
    const fromFile = extensionFromFileName(originalName);
    if (fromFile) return fromFile;
    const mime = text(asset.mimeType || asset.mime_type).toLowerCase();
    return MIME_EXTENSION[mime] || '';
}

function hasTemporaryUrl(asset: PipelinePackAssetLike): boolean {
    const record = asset as Record<string, unknown>;
    return (
        PIPELINE_PACK_ASSET_TEMPORARY_URL_FIELDS.some((key) => Boolean(text(record[key]))) ||
        ['storagePath', 'storage_path', 'filesPath', 'supabasePath'].some((key) => isHttpUrl(text(record[key])))
    );
}

function durableStoragePath(asset: PipelinePackAssetLike): string {
    const path = pickText(asset, ['storagePath', 'storage_path', 'filesPath', 'supabasePath']);
    return path && !isHttpUrl(path) ? path.replace(/^\/+/, '') : '';
}

function permissionBlocked(asset: PipelinePackAssetLike): boolean {
    const permission = text(asset.permission).toLowerCase();
    return (
        asset.allowed === false ||
        asset.canRead === false ||
        asset.canView === false ||
        permission === 'no-permission' ||
        permission === 'denied' ||
        permission === 'blocked'
    );
}

function hasLocalSource(asset: PipelinePackAssetLike, originalName: string, checksum: string): boolean {
    if (pickText(asset, ['localPath', 'path'])) return true;
    const state = text(asset.status || asset.state)
        .toLowerCase()
        .replace(/_/g, '-');
    if (state === 'local' || state === 'local-only') return true;
    return Boolean(originalName && checksum);
}

function normalizeStatus(
    asset: PipelinePackAssetLike,
    originalName: string,
    checksum: string,
    storagePath: string,
): PipelinePackAssetManifestStatus {
    const state = text(asset.status || asset.state)
        .toLowerCase()
        .replace(/_/g, '-');
    if (permissionBlocked(asset) || state === 'no-permission' || state === 'forbidden') return 'no-permission';
    if (state === 'missing' || state === 'absent') return 'missing';
    if (storagePath || text(asset.fileId)) return 'uploaded';
    if (state === 'uploaded' || state === 'files-ready' || state === 'supabase-ready') return 'missing';
    if (state === 'pending-validation' || state === 'needs-validation') return 'pending-validation';
    if (hasLocalSource(asset, originalName, checksum)) return 'local';
    return 'missing';
}

function appGeneratedFileName(
    assetId: string,
    extension: string,
    checksum: string,
    policy: PipelinePackAssetManifestPolicy,
): string {
    const prefix = normalizeSegment(policy.fileNamePrefix, 'pipeline-pack-asset');
    const id = normalizeSegment(assetId, 'asset');
    const hash = checksum ? `-${checksum.slice(0, 12)}` : '';
    return `${prefix}-${id}${hash}${extension || '.bin'}`;
}

function plannedStoragePath(extension: string, checksum: string, policy: PipelinePackAssetManifestPolicy): string | null {
    const ownerId = normalizeStorageOwner(policy.ownerId);
    const cleanChecksum = normalizeChecksum(checksum);
    if (!ownerId || !cleanChecksum) return null;
    const objectExtension = normalizeExtension(extension).replace(/^\./, '') || 'bin';
    return `${ownerId}/${cleanChecksum}.${objectExtension}`;
}

function manifestShareStatus(
    status: PipelinePackAssetManifestStatus,
    extensionAllowed: boolean,
    uploadPlanBlocked: boolean,
): PipelinePackAssetManifestShareStatus {
    if (!extensionAllowed || status === 'no-permission' || uploadPlanBlocked) return 'blocked';
    if (status === 'pending-validation') return 'pending-validation';
    return status;
}

function pending(
    code: string,
    severity: PipelinePackAssetPendingSeverity,
    assetId: string,
    message: string,
): PipelinePackAssetPending {
    return Object.freeze({ code, severity, assetId, message });
}

function validationStatus(
    status: PipelinePackAssetManifestStatus,
    extensionAllowed: boolean,
    uploadPlanBlocked: boolean,
): PipelinePackAssetValidationStatus {
    if (!extensionAllowed || uploadPlanBlocked || status === 'missing' || status === 'no-permission') return 'blocked';
    if (status === 'pending-validation') return 'pending-validation';
    if (status === 'local') return 'pending-upload';
    return 'ready';
}

function assetToItem(
    asset: PipelinePackAssetLike,
    index: number,
    policy: PipelinePackAssetManifestPolicy,
    allowedExtensions: readonly string[],
): PipelinePackAssetManifestItem {
    const assetId = pickText(asset, ['assetId', 'id']) || `asset-${index + 1}`;
    const label = text(asset.label) || assetId;
    const originalName = originalFileName(asset);
    const extension = assetExtension(asset, originalName);
    const extensionAllowed = Boolean(extension && allowedExtensions.includes(extension));
    const checksum = normalizeChecksum(
        asset.checksum || asset.checksumSha256 || asset.checksum_sha256 || asset.hash || asset.sha256,
    );
    const finalFileName = appGeneratedFileName(assetId, extension, checksum, policy);
    const existingStoragePath = durableStoragePath(asset);
    const status = normalizeStatus(asset, originalName, checksum, existingStoragePath);
    const plannedPath = status === 'local' && extensionAllowed ? plannedStoragePath(extension, checksum, policy) : null;
    const uploadPlanBlocked = status === 'local' && extensionAllowed && !plannedPath;
    const validation = validationStatus(status, extensionAllowed, uploadPlanBlocked);
    const temporaryUrlIgnored = hasTemporaryUrl(asset);
    const bucket = text(policy.bucket) || PIPELINE_PACK_ASSET_DEFAULT_BUCKET;
    const ownerId = normalizeStorageOwner(policy.ownerId) || null;

    return Object.freeze({
        assetId,
        label,
        kind: text(asset.kind) || 'other',
        required: asset.required === true || policy.defaultRequired === true,
        status,
        manifestStatus: manifestShareStatus(status, extensionAllowed, uploadPlanBlocked),
        validationStatus: validation,
        validationCodes: Object.freeze([]),
        originalFileName: originalName,
        extension,
        extensionAllowed,
        finalFileName,
        bucket,
        ownerId,
        storagePath: existingStoragePath || null,
        plannedStoragePath: plannedPath,
        plannedFilesPath: plannedPath ? `${bucket}/${plannedPath}` : null,
        storagePathIsAuthoritative: Boolean(existingStoragePath || text(asset.fileId)),
        ...(text(asset.fileId) ? { fileId: text(asset.fileId) } : {}),
        ...(checksum ? { checksum } : {}),
        sizeBytes: positiveInteger(asset.sizeBytes || asset.size_bytes || asset.size),
        linkedNodeIds: Object.freeze((asset.linkedNodeIds || []).map(text).filter(Boolean)),
        temporaryUrlIgnored,
    });
}

function itemPending(
    item: PipelinePackAssetManifestItem,
    source: PipelinePackAssetLike,
): readonly PipelinePackAssetPending[] {
    const out: PipelinePackAssetPending[] = [];
    if (!item.extensionAllowed) {
        out.push(
            pending(
                'asset.extension.blocked',
                'blocked',
                item.assetId,
                `Extension not allowed for Pipeline Pack asset: ${item.extension || '(none)'}.`,
            ),
        );
    }
    if (item.status === 'missing') {
        out.push(
            pending(
                'asset.missing',
                item.required ? 'blocked' : 'warning',
                item.assetId,
                `Asset is missing durable Files/Supabase identity: ${item.label}.`,
            ),
        );
    }
    if (item.status === 'no-permission') {
        out.push(
            pending(
                'asset.no-permission',
                'blocked',
                item.assetId,
                `Asset has no permission for the current pack policy: ${item.label}.`,
            ),
        );
    }
    if (item.status === 'local') {
        out.push(
            pending(
                'asset.pending-upload',
                item.required ? 'warning' : 'info',
                item.assetId,
                `Asset is local and needs Files/Supabase upload before sharing: ${item.label}.`,
            ),
        );
        if (item.extensionAllowed && !item.ownerId) {
            out.push(
                pending(
                    'asset.owner-required',
                    'blocked',
                    item.assetId,
                    `Authenticated user id required before planning Files/Supabase upload: ${item.label}.`,
                ),
            );
        }
        if (item.extensionAllowed && !item.checksum) {
            out.push(
                pending(
                    'asset.hash-required',
                    'blocked',
                    item.assetId,
                    `SHA-256 hash required before planning private user-files path: ${item.label}.`,
                ),
            );
        }
    }
    if (item.status === 'pending-validation') {
        out.push(
            pending(
                'asset.pending-validation',
                item.required ? 'warning' : 'info',
                item.assetId,
                `Asset needs validation before publication: ${item.label}.`,
            ),
        );
    }
    if (item.temporaryUrlIgnored) {
        out.push(
            pending(
                'asset.temporary-url.ignored',
                'warning',
                item.assetId,
                `Temporary URL ignored; use file id or logical storage path for ${item.label}.`,
            ),
        );
    }
    const explicitUploaded =
        text(source.status || source.state)
            .toLowerCase()
            .replace(/_/g, '-') === 'uploaded';
    if (explicitUploaded && !item.storagePathIsAuthoritative) {
        out.push(
            pending(
                'asset.uploaded-truth.missing',
                'blocked',
                item.assetId,
                `Uploaded asset lacks durable file id or logical storage path: ${item.label}.`,
            ),
        );
    }
    return Object.freeze(out);
}

function withValidationCodes(
    item: PipelinePackAssetManifestItem,
    pendingItems: readonly PipelinePackAssetPending[],
): PipelinePackAssetManifestItem {
    return Object.freeze({
        ...item,
        validationCodes: Object.freeze(pendingItems.map((entry) => entry.code)),
    });
}

function manifestInput(
    assetsOrInput: readonly PipelinePackAssetLike[] | PipelinePackAssetManifestInput,
    policy?: PipelinePackAssetManifestPolicy,
): Readonly<{ assets: readonly PipelinePackAssetLike[]; policy: PipelinePackAssetManifestPolicy }> {
    if (Array.isArray(assetsOrInput)) {
        return Object.freeze({ assets: assetsOrInput, policy: policy || {} });
    }
    const manifest = assetsOrInput as PipelinePackAssetManifestInput;
    return Object.freeze({
        assets: manifest.assets || [],
        policy: { ...(manifest.policy || {}), ...(policy || {}) },
    });
}

export function buildPipelinePackAssetManifest(
    assetsOrInput: readonly PipelinePackAssetLike[] | PipelinePackAssetManifestInput,
    policy?: PipelinePackAssetManifestPolicy,
): PipelinePackAssetManifest {
    const input = manifestInput(assetsOrInput || [], policy);
    const allowedExtensions = normalizeAllowedExtensions(input.policy);
    const pendingRows: PipelinePackAssetPending[] = [];
    const items = input.assets.map((asset, index) => {
        const item = assetToItem(asset || {}, index, input.policy, allowedExtensions);
        const itemRows = itemPending(item, asset || {});
        pendingRows.push(...itemRows);
        return withValidationCodes(item, itemRows);
    });
    const uploadCandidates = items.filter(
        (item) => item.status === 'local' && item.extensionAllowed && Boolean(item.plannedStoragePath),
    );
    const counts = {
        total: items.length,
        local: items.filter((item) => item.status === 'local').length,
        uploaded: items.filter((item) => item.status === 'uploaded').length,
        missing: items.filter((item) => item.status === 'missing').length,
        noPermission: items.filter((item) => item.status === 'no-permission').length,
        pendingValidation: items.filter((item) => item.status === 'pending-validation').length,
        ready: items.filter((item) => item.validationStatus === 'ready').length,
        blocked: items.filter((item) => item.validationStatus === 'blocked').length,
        extensionBlocked: items.filter((item) => !item.extensionAllowed).length,
        temporaryUrlsIgnored: items.filter((item) => item.temporaryUrlIgnored).length,
    };

    return Object.freeze({
        ok: !pendingRows.some((entry) => entry.severity === 'blocked'),
        bucket: text(input.policy.bucket) || PIPELINE_PACK_ASSET_DEFAULT_BUCKET,
        allowedExtensions,
        items: Object.freeze(items),
        uploadCandidates: Object.freeze(uploadCandidates),
        pending: Object.freeze(pendingRows),
        counts: Object.freeze(counts),
        urlPolicy: Object.freeze({
            persistedUrlAllowed: false,
            mode: 'signed-url-on-demand',
            durableTruth: 'file-id-or-logical-storage-path',
            ignoredFields: Object.freeze([...PIPELINE_PACK_ASSET_TEMPORARY_URL_FIELDS]),
        }),
    });
}
