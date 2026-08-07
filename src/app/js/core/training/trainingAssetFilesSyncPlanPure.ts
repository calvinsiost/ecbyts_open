// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   TRAINING ASSET FILES SYNC PLAN (pure)

   Contract-only bridge between a training asset manifest/readiness report and
   the future Files/Supabase runtime. It does not call Supabase, does not create
   signed URLs, and does not touch app/js generated output.
   ================================================================ */

export const TRAINING_ASSET_FILES_BUCKET = 'user-files';
export const TRAINING_ASSET_URL_EDGE_FUNCTION = 'training-asset-url';

export type TrainingCourseAssetRole =
    | 'original_pptx'
    | 'slide_image'
    | 'slide_thumbnail'
    | 'embedded_image'
    | 'video'
    | 'unsupported_media'
    | 'course_json'
    | 'ecbt_backup'
    | 'pipeline_artifact';

export type TrainingCourseAssetStatus =
    | 'local'
    | 'uploaded'
    | 'deduplicated'
    | 'missing'
    | 'unsupported'
    | 'failed';

export type TrainingAssetPlanSeverity = 'info' | 'warning' | 'blocked';
export type TrainingAssetQuotaState = 'ok' | 'warning' | 'blocked' | 'unknown';

export interface TrainingAssetReadinessLikeItem {
    readonly assetId?: string;
    readonly id?: string;
    readonly kind?: string;
    readonly mediaRef?: string;
    readonly courseId?: string;
    readonly lessonIndex?: number;
    readonly state?: string;
}

export interface TrainingAssetFilesSyncAsset {
    readonly assetId?: string;
    readonly id?: string;
    readonly role?: string;
    readonly type?: string;
    readonly required?: boolean;
    readonly needsUpload?: boolean;
    readonly status?: string;
    readonly state?: string;
    readonly readinessState?: string;
    readonly origin?: string | readonly string[];
    readonly origins?: readonly string[];
    readonly fileId?: string;
    readonly storagePath?: string;
    readonly storage_path?: string;
    readonly checksumSha256?: string;
    readonly checksum_sha256?: string;
    readonly hash?: string;
    readonly sha256?: string;
    readonly filename?: string;
    readonly name?: string;
    readonly originalName?: string;
    readonly original_name?: string;
    readonly mimeType?: string;
    readonly mime_type?: string;
    readonly sizeBytes?: number;
    readonly size_bytes?: number;
    readonly size?: number;
    readonly lessonId?: string;
    readonly lessonIndex?: number;
    readonly slideId?: string;
    readonly slideIndex?: number;
    readonly originalRef?: string;
    readonly mediaRef?: string;
    readonly path?: string;
    readonly localPath?: string;
    readonly filesPath?: string;
    readonly supabasePath?: string;
    readonly tags?: readonly string[];
}

export interface TrainingAssetUploadQuotaInput {
    readonly plan?: string;
    readonly usedBytes?: number;
    readonly maxBytes?: number;
    readonly availableBytes?: number;
    readonly warningRatio?: number;
}

export interface TrainingAssetFilesSyncInput {
    readonly userId?: string | null;
    readonly courseId?: string | null;
    readonly deckId?: string | null;
    readonly modelId?: string | null;
    readonly sourceChecksum?: string | null;
    readonly source?: string | null;
    readonly scopeType?: string | null;
    readonly assets?: readonly TrainingAssetFilesSyncAsset[];
    readonly manifest?:
        | readonly TrainingAssetFilesSyncAsset[]
        | {
              readonly assets?: readonly TrainingAssetFilesSyncAsset[];
              readonly items?: readonly TrainingAssetFilesSyncAsset[];
          }
        | null;
    readonly readiness?: {
        readonly items?: readonly TrainingAssetReadinessLikeItem[];
        readonly missingRequiredRefs?: readonly string[];
    } | null;
    readonly quota?: TrainingAssetUploadQuotaInput | null;
}

export interface TrainingAssetPlanDiagnostic {
    readonly code: string;
    readonly severity: TrainingAssetPlanSeverity;
    readonly message: string;
    readonly assetIds?: readonly string[];
}

export interface TrainingAssetUrlPolicy {
    readonly persistedUrlAllowed: false;
    readonly mode: 'signed-url-on-demand';
    readonly bucket: 'user-files';
    readonly ownerResolver: 'fileManager.getDownloadUrl(fileId)';
    readonly studentResolver: 'training-asset-url';
    readonly request: Readonly<{
        readonly courseId: string;
        readonly assetId: string;
    }>;
    readonly response: Readonly<{
        readonly url: 'signed-url';
        readonly expiresIn: 'seconds';
        readonly assetVersion: 'checksumSha256';
    }>;
}

export interface TrainingAssetFilesPlanItem {
    readonly assetId: string;
    readonly role: TrainingCourseAssetRole;
    readonly required: boolean;
    readonly status: TrainingCourseAssetStatus;
    readonly checksumSha256?: string;
    readonly filename: string;
    readonly extension: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly lessonId?: string;
    readonly lessonIndex?: number;
    readonly slideId?: string;
    readonly slideIndex?: number;
    readonly originalRef?: string;
    readonly fileId?: string;
    readonly storagePath?: string;
    readonly tags: readonly string[];
}

export interface TrainingAssetFilesMetadata {
    readonly user_id: string;
    readonly model_id: string | null;
    readonly scope_type: string;
    readonly filename: string;
    readonly mime_type: string;
    readonly extension: string;
    readonly size_bytes: number;
    readonly storage_path: string;
    readonly checksum_sha256: string;
    readonly tags: readonly string[];
    readonly source: string;
    readonly status: 'pending_upload';
}

export interface TrainingAssetFilesRegisterMetadata {
    readonly source: string;
    readonly scopeType: string;
    readonly modelId?: string;
    readonly tags: readonly string[];
}

export interface TrainingCourseAssetRecordDraft {
    readonly course_id: string | null;
    readonly owner_id: string | null;
    readonly asset_id: string;
    readonly role: TrainingCourseAssetRole;
    readonly file_id: string | null;
    readonly lesson_id: string | null;
    readonly slide_index: number | null;
    readonly original_ref: string | null;
    readonly storage_path: string | null;
    readonly checksum_sha256: string | null;
    readonly mime_type: string;
    readonly size_bytes: number;
    readonly status: TrainingCourseAssetStatus | 'pending_upload';
}

export interface TrainingAssetUploadStep {
    readonly action: 'upload-and-register-files';
    readonly assetId: string;
    readonly required: boolean;
    readonly bucket: 'user-files';
    readonly storagePath: string;
    readonly file: Readonly<{
        readonly filename: string;
        readonly mimeType: string;
        readonly sizeBytes: number;
    }>;
    readonly filesRegisterMetadata: TrainingAssetFilesRegisterMetadata;
    readonly filesRowPreview: TrainingAssetFilesMetadata;
    readonly courseAssetRecord: TrainingCourseAssetRecordDraft;
    readonly urlPolicy: TrainingAssetUrlPolicy;
    readonly message: string;
}

export interface TrainingAssetQuotaSummary {
    readonly state: TrainingAssetQuotaState;
    readonly plan?: string;
    readonly uploadBytes: number;
    readonly requiredBytes: number;
    readonly optionalBytes: number;
    readonly usedBytes?: number;
    readonly maxBytes?: number;
    readonly availableBytes?: number;
    readonly message: string;
}

export interface TrainingAssetFilesSyncPlan {
    readonly ok: boolean;
    readonly bucket: 'user-files';
    readonly userId: string | null;
    readonly courseId: string | null;
    readonly deckId: string | null;
    readonly items: readonly TrainingAssetFilesPlanItem[];
    readonly uploadSteps: readonly TrainingAssetUploadStep[];
    readonly courseAssetRecords: readonly TrainingCourseAssetRecordDraft[];
    readonly urlPolicy: TrainingAssetUrlPolicy;
    readonly quota: TrainingAssetQuotaSummary;
    readonly diagnostics: readonly TrainingAssetPlanDiagnostic[];
    readonly messages: Readonly<{
        readonly auth: string;
        readonly quota: string;
        readonly pending: string;
    }>;
}

const COURSE_ASSET_ROLES: readonly TrainingCourseAssetRole[] = [
    'original_pptx',
    'slide_image',
    'slide_thumbnail',
    'embedded_image',
    'video',
    'unsupported_media',
    'course_json',
    'ecbt_backup',
    'pipeline_artifact',
];

const COURSE_ASSET_STATUSES: readonly TrainingCourseAssetStatus[] = [
    'local',
    'uploaded',
    'deduplicated',
    'missing',
    'unsupported',
    'failed',
];

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
    bin: 'application/octet-stream',
    gif: 'image/gif',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    json: 'application/json',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    pdf: 'application/pdf',
    png: 'image/png',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    svg: 'image/svg+xml',
    webp: 'image/webp',
};

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
    'application/json': 'json',
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'audio/mpeg': 'mp3',
    'image/gif': 'gif',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/svg+xml': 'svg',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
};

export const TRAINING_ASSET_ON_DEMAND_URL_POLICY: TrainingAssetUrlPolicy = Object.freeze({
    persistedUrlAllowed: false,
    mode: 'signed-url-on-demand',
    bucket: TRAINING_ASSET_FILES_BUCKET,
    ownerResolver: 'fileManager.getDownloadUrl(fileId)',
    studentResolver: TRAINING_ASSET_URL_EDGE_FUNCTION,
    request: Object.freeze({
        courseId: '<courseId>',
        assetId: '<assetId>',
    }),
    response: Object.freeze({
        url: 'signed-url',
        expiresIn: 'seconds',
        assetVersion: 'checksumSha256',
    }),
});

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizePositiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function pickString(value: unknown, keys: readonly string[]): string {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    for (const key of keys) {
        const normalized = normalizeString(record[key]);
        if (normalized) return normalized;
    }
    return '';
}

function pickNumber(value: unknown, keys: readonly string[]): number {
    const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
    for (const key of keys) {
        const normalized = normalizeNumber(record[key]);
        if (normalized > 0) return normalized;
    }
    return 0;
}

function toArray<T>(value: unknown): readonly T[] {
    return Array.isArray(value) ? (value as readonly T[]) : [];
}

function toOriginList(asset: TrainingAssetFilesSyncAsset): readonly string[] {
    const values: string[] = [];
    const origin = asset.origin;
    if (Array.isArray(origin)) values.push(...origin.map(normalizeString));
    else values.push(normalizeString(origin));
    values.push(...toArray<string>(asset.origins).map(normalizeString));
    return values.map((value) => value.toLowerCase()).filter(Boolean);
}

function normalizeChecksum(value: unknown): string {
    let checksum = normalizeString(value).toLowerCase();
    if (checksum.startsWith('sha256:')) checksum = checksum.slice('sha256:'.length);
    return checksum.replace(/[^a-z0-9]/g, '');
}

function normalizePathSegment(value: string): string {
    return normalizeString(value)
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^A-Za-z0-9._-]/g, '-')
        .replace(/-+/g, '-');
}

function basename(value: string): string {
    const withoutQuery = normalizeString(value).split(/[?#]/)[0] || '';
    const parts = withoutQuery.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] || '';
}

function extensionFromName(value: string): string {
    const fileName = basename(value).toLowerCase();
    const idx = fileName.lastIndexOf('.');
    if (idx < 0 || idx === fileName.length - 1) return '';
    return fileName.slice(idx + 1).replace(/[^a-z0-9]/g, '');
}

function normalizeMimeType(asset: TrainingAssetFilesSyncAsset, extension: string): string {
    const explicit = pickString(asset, ['mimeType', 'mime_type', 'type']).toLowerCase();
    if (explicit.includes('/')) return explicit;
    return MIME_BY_EXTENSION[extension] || MIME_BY_EXTENSION.bin || 'application/octet-stream';
}

function normalizeExtension(asset: TrainingAssetFilesSyncAsset, fileName: string): string {
    const fromName = extensionFromName(fileName);
    if (fromName) return fromName;
    const mime = pickString(asset, ['mimeType', 'mime_type', 'type']).toLowerCase();
    return EXTENSION_BY_MIME[mime] || 'bin';
}

function normalizeRole(asset: TrainingAssetFilesSyncAsset): TrainingCourseAssetRole {
    const explicit = pickString(asset, ['role']).toLowerCase();
    if (COURSE_ASSET_ROLES.includes(explicit as TrainingCourseAssetRole)) {
        return explicit as TrainingCourseAssetRole;
    }

    const type = pickString(asset, ['type']).toLowerCase();
    if (type === 'video') return 'video';
    if (type === 'course' || type === 'deck') return 'course_json';
    if (type === 'slide') return 'slide_image';
    if (type === 'document' && extensionFromName(pickString(asset, ['filename', 'name'])) === 'pptx') {
        return 'original_pptx';
    }
    return 'embedded_image';
}

function isRawPptxItem(item: Pick<TrainingAssetFilesPlanItem, 'role' | 'extension' | 'mimeType'>): boolean {
    return (
        item.role === 'original_pptx' ||
        item.extension === 'pptx' ||
        item.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
}

function normalizeStatus(asset: TrainingAssetFilesSyncAsset): TrainingCourseAssetStatus {
    const explicit = pickString(asset, ['status', 'state', 'readinessState']).toLowerCase().replace(/_/g, '-');
    if (COURSE_ASSET_STATUSES.includes(explicit as TrainingCourseAssetStatus)) {
        return explicit as TrainingCourseAssetStatus;
    }
    if (explicit === 'supabase-ready' || explicit === 'files-ready') return 'uploaded';
    if (explicit === 'local-only' || explicit === 'upload-required') return 'local';

    const origins = toOriginList(asset);
    const fileId = pickString(asset, ['fileId']);
    const storagePath = pickString(asset, ['storagePath', 'storage_path']);
    if (asset.needsUpload === true) return 'local';
    if (fileId || storagePath || origins.includes('files') || origins.includes('supabase')) return 'uploaded';
    if (origins.includes('local') || pickString(asset, ['localPath', 'path', 'filename', 'name'])) return 'local';
    return 'missing';
}

function normalizeFileName(asset: TrainingAssetFilesSyncAsset, assetId: string): string {
    const explicit = pickString(asset, ['filename', 'name', 'originalName', 'original_name']);
    const fromRef = pickString(asset, ['originalRef', 'mediaRef', 'localPath', 'path']);
    const candidate = basename(explicit || fromRef);
    return candidate || `${assetId}.bin`;
}

function toOrderedUnique(values: readonly string[]): readonly string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const normalized = normalizeString(value);
        if (!normalized || seen.has(normalized)) continue;
        seen.add(normalized);
        out.push(normalized);
    }
    return Object.freeze(out);
}

function tagsForAsset(
    asset: TrainingAssetFilesSyncAsset,
    item: Pick<TrainingAssetFilesPlanItem, 'role' | 'lessonId' | 'slideIndex'>,
    context: Readonly<{
        courseId: string;
        deckId: string;
        sourceChecksum: string;
    }>,
): readonly string[] {
    const sourceChecksum = normalizeChecksum(context.sourceChecksum).slice(0, 12);
    return toOrderedUnique([
        'training',
        context.courseId ? `course:${context.courseId}` : '',
        context.deckId ? `deck:${context.deckId}` : '',
        item.lessonId ? `lesson:${item.lessonId}` : '',
        typeof item.slideIndex === 'number' ? `slide:${item.slideIndex}` : '',
        `role:${item.role}`,
        'source:pptx',
        sourceChecksum ? `source-checksum:${sourceChecksum}` : '',
        ...toArray<string>(asset.tags),
    ]);
}

function collectManifestAssets(input: TrainingAssetFilesSyncInput): readonly TrainingAssetFilesSyncAsset[] {
    const manifest = input.manifest;
    if (Array.isArray(manifest)) return manifest;
    if (manifest && typeof manifest === 'object') {
        const manifestObject = manifest as Record<string, unknown>;
        const items = manifestObject.items;
        const assets = manifestObject.assets;
        if (Array.isArray(items)) return items as readonly TrainingAssetFilesSyncAsset[];
        if (Array.isArray(assets)) return assets as readonly TrainingAssetFilesSyncAsset[];
    }
    return [];
}

function readinessStatusToAssetStatus(state: string): TrainingCourseAssetStatus {
    const normalized = state.toLowerCase();
    if (normalized === 'supabase-ready' || normalized === 'files-ready') return 'uploaded';
    if (normalized === 'missing') return 'missing';
    return 'local';
}

function collectReadinessAssets(input: TrainingAssetFilesSyncInput): readonly TrainingAssetFilesSyncAsset[] {
    const items = input.readiness?.items || [];
    const missingRequiredRefs = new Set((input.readiness?.missingRequiredRefs || []).map(normalizeString));
    return items
        .filter((item) => normalizeString(item.mediaRef))
        .map((item) => {
            const lessonIndex = normalizePositiveInteger(item.lessonIndex);
            return Object.freeze({
                assetId: normalizeString(item.assetId || item.id || item.mediaRef),
                mediaRef: normalizeString(item.mediaRef),
                required: missingRequiredRefs.has(normalizeString(item.mediaRef)),
                status: readinessStatusToAssetStatus(normalizeString(item.state)),
                ...(typeof lessonIndex === 'number' ? { lessonIndex } : {}),
            });
        });
}

function collectAssets(input: TrainingAssetFilesSyncInput): readonly TrainingAssetFilesSyncAsset[] {
    const raw = [...(input.assets || []), ...collectManifestAssets(input), ...collectReadinessAssets(input)];
    const seen = new Set<string>();
    const out: TrainingAssetFilesSyncAsset[] = [];
    raw.forEach((asset, index) => {
        const key =
            pickString(asset, ['assetId', 'id', 'mediaRef', 'originalRef', 'path']) ||
            normalizeChecksum(pickString(asset, ['checksumSha256', 'checksum_sha256', 'hash', 'sha256'])) ||
            `asset-${index + 1}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push(asset);
    });
    return Object.freeze(out);
}

function requiredRefSet(input: TrainingAssetFilesSyncInput): ReadonlySet<string> {
    return new Set((input.readiness?.missingRequiredRefs || []).map(normalizeString).filter(Boolean));
}

function isRequiredByReadiness(
    refs: ReadonlySet<string>,
    asset: TrainingAssetFilesSyncAsset,
    assetId: string,
    checksumSha256: string,
): boolean {
    if (refs.size === 0) return false;
    const candidates = [
        assetId,
        checksumSha256,
        pickString(asset, ['mediaRef', 'originalRef', 'path', 'localPath', 'filename', 'name']),
    ];
    return candidates.some((candidate) => refs.has(normalizeString(candidate)));
}

function normalizeAsset(
    asset: TrainingAssetFilesSyncAsset,
    index: number,
    context: Readonly<{
        userId: string;
        courseId: string;
        deckId: string;
        sourceChecksum: string;
    }>,
    requiredRefs: ReadonlySet<string>,
): TrainingAssetFilesPlanItem {
    const assetId = pickString(asset, ['assetId', 'id', 'mediaRef', 'originalRef']) || `asset-${index + 1}`;
    const filename = normalizeFileName(asset, assetId);
    const extension = normalizeExtension(asset, filename);
    const mimeType = normalizeMimeType(asset, extension);
    const checksumSha256 = normalizeChecksum(
        pickString(asset, ['checksumSha256', 'checksum_sha256', 'hash', 'sha256']),
    );
    const userSegment = normalizePathSegment(context.userId);
    const storagePath = checksumSha256 && userSegment ? `${userSegment}/${checksumSha256}.${extension}` : '';
    const role = normalizeRole(asset);
    const lessonId = pickString(asset, ['lessonId']);
    const slideId = pickString(asset, ['slideId']);
    const lessonIndex = normalizePositiveInteger(asset.lessonIndex);
    const slideIndex = normalizePositiveInteger(asset.slideIndex);
    const originalRef = pickString(asset, ['originalRef', 'mediaRef', 'localPath', 'path']);
    const required =
        asset.required === true || asset.needsUpload === true || isRequiredByReadiness(requiredRefs, asset, assetId, checksumSha256);
    const baseItem = {
        assetId,
        role,
        required,
        status: normalizeStatus(asset),
        filename,
        extension,
        mimeType,
        sizeBytes: pickNumber(asset, ['sizeBytes', 'size_bytes', 'size']),
        ...(checksumSha256 ? { checksumSha256 } : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(typeof lessonIndex === 'number' ? { lessonIndex } : {}),
        ...(slideId ? { slideId } : {}),
        ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
        ...(originalRef ? { originalRef } : {}),
        ...(pickString(asset, ['fileId']) ? { fileId: pickString(asset, ['fileId']) } : {}),
        ...(storagePath ? { storagePath } : {}),
    };
    return Object.freeze({
        ...baseItem,
        tags: tagsForAsset(asset, baseItem, context),
    });
}

function isUploadCandidate(item: TrainingAssetFilesPlanItem): boolean {
    return item.status === 'local' && !isRawPptxItem(item);
}

function sortRequiredFirst<T extends { readonly required: boolean }>(items: readonly T[]): readonly T[] {
    return Object.freeze([...items].sort((a, b) => Number(b.required) - Number(a.required)));
}

function fileRegisterMetadata(
    item: TrainingAssetFilesPlanItem,
    context: Readonly<{
        source: string;
        scopeType: string;
        modelId: string;
    }>,
): TrainingAssetFilesRegisterMetadata {
    return Object.freeze({
        source: context.source,
        scopeType: context.scopeType,
        ...(context.modelId ? { modelId: context.modelId } : {}),
        tags: item.tags,
    });
}

function filesRowPreview(
    item: TrainingAssetFilesPlanItem,
    context: Readonly<{
        userId: string;
        modelId: string;
        source: string;
        scopeType: string;
    }>,
): TrainingAssetFilesMetadata {
    return Object.freeze({
        user_id: context.userId,
        model_id: context.modelId || null,
        scope_type: context.scopeType,
        filename: item.filename,
        mime_type: item.mimeType,
        extension: item.extension,
        size_bytes: item.sizeBytes,
        storage_path: item.storagePath || '',
        checksum_sha256: item.checksumSha256 || '',
        tags: item.tags,
        source: context.source,
        status: 'pending_upload',
    });
}

function courseAssetRecord(
    item: TrainingAssetFilesPlanItem,
    context: Readonly<{
        userId: string;
        courseId: string;
    }>,
    status: TrainingCourseAssetStatus | 'pending_upload' = item.status,
): TrainingCourseAssetRecordDraft {
    return Object.freeze({
        course_id: context.courseId || null,
        owner_id: context.userId || null,
        asset_id: item.assetId,
        role: item.role,
        file_id: item.fileId || null,
        lesson_id: item.lessonId || null,
        slide_index: typeof item.slideIndex === 'number' ? item.slideIndex : null,
        original_ref: item.originalRef || null,
        storage_path: item.storagePath || null,
        checksum_sha256: item.checksumSha256 || null,
        mime_type: item.mimeType,
        size_bytes: item.sizeBytes,
        status,
    });
}

function buildUploadStep(
    item: TrainingAssetFilesPlanItem,
    context: Readonly<{
        userId: string;
        courseId: string;
        modelId: string;
        source: string;
        scopeType: string;
    }>,
): TrainingAssetUploadStep | null {
    if (!context.userId || !item.storagePath || !item.checksumSha256) return null;
    return Object.freeze({
        action: 'upload-and-register-files',
        assetId: item.assetId,
        required: item.required,
        bucket: TRAINING_ASSET_FILES_BUCKET,
        storagePath: item.storagePath,
        file: Object.freeze({
            filename: item.filename,
            mimeType: item.mimeType,
            sizeBytes: item.sizeBytes,
        }),
        filesRegisterMetadata: fileRegisterMetadata(item, context),
        filesRowPreview: filesRowPreview(item, context),
        courseAssetRecord: courseAssetRecord(item, context, 'pending_upload'),
        urlPolicy: TRAINING_ASSET_ON_DEMAND_URL_POLICY,
        message: `${item.required ? 'Asset obrigatorio' : 'Asset opcional'} ${item.assetId} vai para ${TRAINING_ASSET_FILES_BUCKET}/${item.storagePath}.`,
    });
}

function formatBytes(value: number): string {
    if (value < 1024) return `${value} bytes`;
    const kb = value / 1024;
    if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
    const mb = kb / 1024;
    return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

function sumUploadBytes(items: readonly TrainingAssetFilesPlanItem[]): {
    readonly requiredBytes: number;
    readonly optionalBytes: number;
    readonly uploadBytes: number;
} {
    const requiredBytes = items.filter((item) => item.required).reduce((sum, item) => sum + item.sizeBytes, 0);
    const optionalBytes = items.filter((item) => !item.required).reduce((sum, item) => sum + item.sizeBytes, 0);
    return Object.freeze({ requiredBytes, optionalBytes, uploadBytes: requiredBytes + optionalBytes });
}

function resolveAvailableBytes(
    quota: TrainingAssetUploadQuotaInput,
    usedBytes: number,
    maxBytes: number,
): number | undefined {
    const explicit = normalizeNumber(quota.availableBytes);
    if (explicit > 0) return explicit;
    if (maxBytes > 0) return Math.max(0, maxBytes - usedBytes);
    return undefined;
}

function resolveWarningRatio(warningRatio: unknown): number {
    return typeof warningRatio === 'number' && warningRatio > 0 && warningRatio < 1 ? warningRatio : 0.8;
}

function resolveQuotaState(
    uploadBytes: number,
    availableBytes: number | undefined,
    maxBytes: number,
    projectedBytes: number,
    warningRatio: number,
): TrainingAssetQuotaState {
    if (typeof availableBytes === 'number' && uploadBytes > availableBytes) return 'blocked';
    if (maxBytes > 0 && uploadBytes > 0 && projectedBytes / maxBytes >= warningRatio) return 'warning';
    return 'ok';
}

function buildQuotaMessage(
    state: TrainingAssetQuotaState,
    uploadBytes: number,
    availableBytes: number | undefined,
    maxBytes: number,
    projectedBytes: number,
): string {
    if (state === 'blocked') {
        return `Quota insuficiente: precisa de ${formatBytes(uploadBytes)}, mas ha ${formatBytes(
            availableBytes || 0,
        )} disponiveis.`;
    }
    if (state === 'warning') {
        return `Quota perto do limite: upload projetado chega a ${formatBytes(projectedBytes)} de ${formatBytes(
            maxBytes,
        )}.`;
    }
    if (typeof availableBytes === 'number') {
        return `Upload planejado usa ${formatBytes(uploadBytes)} de ${formatBytes(availableBytes)} disponiveis.`;
    }
    return `Upload planejado usa ${formatBytes(uploadBytes)}.`;
}

function evaluateQuota(
    quota: TrainingAssetUploadQuotaInput | null | undefined,
    uploadItems: readonly TrainingAssetFilesPlanItem[],
): TrainingAssetQuotaSummary {
    const { requiredBytes, optionalBytes, uploadBytes } = sumUploadBytes(uploadItems);
    if (!quota) {
        return Object.freeze({
            state: 'unknown',
            uploadBytes,
            requiredBytes,
            optionalBytes,
            message: uploadBytes > 0 ? 'Quota nao verificada para os assets planejados.' : 'Nenhum upload pendente.',
        });
    }

    const usedBytes = normalizeNumber(quota.usedBytes);
    const maxBytes = normalizeNumber(quota.maxBytes);
    const availableBytes = resolveAvailableBytes(quota, usedBytes, maxBytes);
    const projectedBytes = usedBytes + uploadBytes;
    const warningRatio = resolveWarningRatio(quota.warningRatio);
    const state = resolveQuotaState(uploadBytes, availableBytes, maxBytes, projectedBytes, warningRatio);
    const message = buildQuotaMessage(state, uploadBytes, availableBytes, maxBytes, projectedBytes);

    return Object.freeze({
        state,
        ...(quota.plan ? { plan: quota.plan } : {}),
        uploadBytes,
        requiredBytes,
        optionalBytes,
        usedBytes,
        ...(maxBytes ? { maxBytes } : {}),
        ...(typeof availableBytes === 'number' ? { availableBytes } : {}),
        message,
    });
}

function topList(values: readonly string[]): string {
    const visible = values.slice(0, 3);
    const remaining = values.length - visible.length;
    if (remaining <= 0) return visible.join(', ');
    return `${visible.join(', ')} e mais ${remaining}`;
}

function pendingMessage(uploadSteps: readonly TrainingAssetUploadStep[], blockedItems: readonly string[]): string {
    if (blockedItems.length > 0) {
        return `Pendencias sem plano de upload: ${topList(blockedItems)}.`;
    }
    if (uploadSteps.length === 0) {
        return 'Nenhum asset pendente para upload.';
    }
    const required = uploadSteps.filter((step) => step.required).map((step) => step.assetId);
    if (required.length > 0) {
        return `Upload pendente com obrigatorios primeiro: ${topList(required)}.`;
    }
    return `Upload pendente somente opcional: ${topList(uploadSteps.map((step) => step.assetId))}.`;
}

function buildDiagnostics(
    context: Readonly<{ userId: string }>,
    items: readonly TrainingAssetFilesPlanItem[],
    uploadSteps: readonly TrainingAssetUploadStep[],
    quota: TrainingAssetQuotaSummary,
): readonly TrainingAssetPlanDiagnostic[] {
    const diagnostics: TrainingAssetPlanDiagnostic[] = [];
    if (!context.userId) {
        diagnostics.push({
            code: 'user-id-required',
            severity: 'blocked',
            message: 'Usuario autenticado obrigatorio: informe userId antes de planejar upload em user-files.',
        });
    }

    const missingHash = items
        .filter((item) => isUploadCandidate(item) && !item.checksumSha256)
        .map((item) => item.assetId);
    if (missingHash.length > 0) {
        diagnostics.push({
            code: 'asset-hash-required',
            severity: 'blocked',
            message: `Hash/checksum obrigatorio para montar path por userId/hash: ${topList(missingHash)}.`,
            assetIds: Object.freeze(missingHash),
        });
    }

    const missingRequired = items
        .filter((item) => item.required && ['missing', 'unsupported', 'failed'].includes(item.status))
        .map((item) => item.assetId);
    if (missingRequired.length > 0) {
        diagnostics.push({
            code: 'required-asset-pending',
            severity: 'blocked',
            message: `Asset obrigatorio sem arquivo pronto para upload: ${topList(missingRequired)}.`,
            assetIds: Object.freeze(missingRequired),
        });
    }

    if (quota.state === 'blocked' || quota.state === 'warning') {
        diagnostics.push({
            code: quota.state === 'blocked' ? 'quota-blocked' : 'quota-warning',
            severity: quota.state === 'blocked' ? 'blocked' : 'warning',
            message: quota.message,
        });
    }

    const rawPptxItems = items.filter(isRawPptxItem).map((item) => item.assetId);
    if (rawPptxItems.length > 0) {
        diagnostics.push({
            code: 'raw-pptx-upload-skipped',
            severity: 'warning',
            message: `PPTX bruto nao sera enviado para Files/Supabase. Use apenas imagens, videos e assets referenciaveis: ${topList(
                rawPptxItems,
            )}.`,
            assetIds: Object.freeze(rawPptxItems),
        });
    }
    return Object.freeze(diagnostics);
}

function buildPlanContext(input: TrainingAssetFilesSyncInput | null | undefined) {
    return {
        userId: normalizePathSegment(normalizeString(input?.userId)),
        courseId: normalizeString(input?.courseId),
        deckId: normalizeString(input?.deckId),
        modelId: normalizeString(input?.modelId),
        sourceChecksum: normalizeString(input?.sourceChecksum),
        source: normalizeString(input?.source) || 'import',
        scopeType: normalizeString(input?.scopeType) || 'workspace',
    };
}

function buildPlanMessages(
    context: ReturnType<typeof buildPlanContext>,
    quota: TrainingAssetQuotaSummary,
    uploadSteps: readonly TrainingAssetUploadStep[],
    blockedItems: readonly string[],
) {
    return Object.freeze({
        auth: context.userId
            ? 'Usuario autenticado pronto para owner-based storage.'
            : 'Usuario autenticado obrigatorio para bucket user-files.',
        quota: quota.message,
        pending: pendingMessage(uploadSteps, blockedItems),
    });
}

function isPlanBlocked(diagnostics: readonly TrainingAssetPlanDiagnostic[]): boolean {
    return diagnostics.some((diagnostic) => diagnostic.severity === 'blocked');
}

/** Build a deterministic, testable Files/Supabase plan for training assets. */
export function buildTrainingAssetFilesSyncPlan(input: TrainingAssetFilesSyncInput): TrainingAssetFilesSyncPlan {
    const context = buildPlanContext(input);
    const requiredRefs = requiredRefSet(input || {});
    const items = Object.freeze(
        collectAssets(input || {}).map((asset, index) => normalizeAsset(asset || {}, index, context, requiredRefs)),
    );
    const uploadCandidates = sortRequiredFirst(items.filter(isUploadCandidate));
    const uploadSteps = Object.freeze(
        uploadCandidates
            .map((item) => buildUploadStep(item, context))
            .filter((step): step is TrainingAssetUploadStep => Boolean(step)),
    );
    const records = Object.freeze(items.map((item) => courseAssetRecord(item, context)));
    const quota = evaluateQuota(input?.quota, uploadCandidates);
    const diagnostics = buildDiagnostics(context, items, uploadSteps, quota);
    const blockedItems = diagnostics.flatMap((diagnostic) => [...(diagnostic.assetIds || [])]);
    const messages = buildPlanMessages(context, quota, uploadSteps, blockedItems);

    return Object.freeze({
        ok: !isPlanBlocked(diagnostics),
        bucket: TRAINING_ASSET_FILES_BUCKET,
        userId: context.userId || null,
        courseId: context.courseId || null,
        deckId: context.deckId || null,
        items,
        uploadSteps,
        courseAssetRecords: records,
        urlPolicy: TRAINING_ASSET_ON_DEMAND_URL_POLICY,
        quota,
        diagnostics,
        messages,
    });
}
