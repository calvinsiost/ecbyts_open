// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { FILE_BUCKET, FILE_SCOPE, FILE_SOURCE } from '../files/fileConstants.js';
import type { CourseDraft } from '../../core/training/_courseAuthoringPure.js';
import type { TrainingCourseAssetRole } from '../../core/training/trainingAssetFilesSyncPlanPure.js';

type FileRegisterMetadata = {
    readonly source?: string;
    readonly scopeType?: string;
    readonly modelId?: string | null;
    readonly tags?: readonly string[];
};

type FileRegisterResult = {
    readonly ok?: boolean;
    readonly data?: any;
    readonly error?: unknown;
    readonly code?: unknown;
};

export interface TrainingAssetFileInput {
    readonly assetId: string;
    readonly file: File;
    readonly role?: TrainingCourseAssetRole | string;
    readonly required?: boolean;
    readonly lessonId?: string;
    readonly lessonIndex?: number;
    readonly slideId?: string;
    readonly slideIndex?: number;
    readonly originalRef?: string;
    readonly tags?: readonly string[];
}

export interface TrainingAssetFilesSyncRuntimeOptions {
    readonly courseId?: string | null;
    readonly modelId?: string | null;
    readonly deckId?: string | null;
    readonly sourceChecksum?: string | null;
    readonly scopeType?: string | null;
    readonly registerFile?: (file: File, metadata: FileRegisterMetadata) => Promise<FileRegisterResult>;
}

export interface TrainingAssetRegisteredFile {
    readonly assetId: string;
    readonly role: string;
    readonly required: boolean;
    readonly fileId: string | null;
    readonly filename: string;
    readonly storagePath: string | null;
    readonly checksumSha256: string | null;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly tags: readonly string[];
    readonly lessonId?: string;
    readonly lessonIndex?: number;
    readonly slideId?: string;
    readonly slideIndex?: number;
    readonly originalRef?: string;
    readonly deduplicated: boolean;
}

export interface TrainingAssetSyncFailure {
    readonly assetId: string;
    readonly filename: string;
    readonly error: string;
    readonly code?: string;
}

export interface TrainingAssetFilesSyncRuntimeResult {
    readonly ok: boolean;
    readonly bucket: 'user-files';
    readonly courseId: string | null;
    readonly ownerUserId: string | null;
    readonly files: readonly TrainingAssetRegisteredFile[];
    readonly failures: readonly TrainingAssetSyncFailure[];
    readonly assetFiles: Readonly<{
        readonly bucket: 'user-files';
        readonly ownerUserId: string | null;
        readonly status: 'uploaded' | 'partial' | 'failed' | 'empty';
        readonly files: readonly TrainingAssetRegisteredFile[];
    }>;
    readonly filesSync: Readonly<{
        readonly status: 'uploaded' | 'partial' | 'failed' | 'empty';
        readonly syncedAt: string;
        readonly source: 'files-register';
        readonly courseAssetRecords: readonly Record<string, unknown>[];
        readonly failures: readonly TrainingAssetSyncFailure[];
    }>;
}

type CourseLessonLike = Record<string, any>;

function normalizeString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function toPositiveInteger(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function uniqueTags(values: readonly string[]): readonly string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const value of values) {
        const tag = normalizeString(value);
        if (!tag || seen.has(tag)) continue;
        seen.add(tag);
        out.push(tag);
    }
    return Object.freeze(out.slice(0, 20));
}

function tagsForAsset(input: TrainingAssetFileInput, options: TrainingAssetFilesSyncRuntimeOptions): readonly string[] {
    const role = normalizeString(input.role) || 'embedded_image';
    const sourceChecksum = normalizeString(options.sourceChecksum).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    return uniqueTags([
        'training',
        normalizeString(options.courseId) ? `course:${normalizeString(options.courseId)}` : '',
        normalizeString(options.deckId) ? `deck:${normalizeString(options.deckId)}` : '',
        normalizeString(input.assetId) ? `asset:${normalizeString(input.assetId)}` : '',
        normalizeString(input.lessonId) ? `lesson:${normalizeString(input.lessonId)}` : '',
        typeof input.lessonIndex === 'number' ? `lesson-index:${input.lessonIndex}` : '',
        typeof input.slideIndex === 'number' ? `slide:${input.slideIndex}` : '',
        `role:${role}`,
        'source:pptx',
        sourceChecksum ? `source-checksum:${sourceChecksum}` : '',
        ...(input.tags || []),
    ]);
}

function isRawPptxUpload(input: TrainingAssetFileInput): boolean {
    const role = normalizeString(input?.role).toLowerCase();
    const name = normalizeString(input?.file?.name).toLowerCase();
    const type = normalizeString(input?.file?.type).toLowerCase();
    return (
        role === 'original_pptx' ||
        name.endsWith('.pptx') ||
        type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    );
}

function statusFor(files: readonly unknown[], failures: readonly unknown[]): 'uploaded' | 'partial' | 'failed' | 'empty' {
    if (!files.length && !failures.length) return 'empty';
    if (files.length && !failures.length) return 'uploaded';
    if (files.length && failures.length) return 'partial';
    return 'failed';
}

function registeredFileFromRow(
    input: TrainingAssetFileInput,
    row: any,
    tags: readonly string[],
): TrainingAssetRegisteredFile {
    const lessonIndex = toPositiveInteger(input.lessonIndex);
    const slideIndex = toPositiveInteger(input.slideIndex);
    return Object.freeze({
        assetId: normalizeString(input.assetId),
        role: normalizeString(input.role) || 'embedded_image',
        required: input.required !== false,
        fileId: normalizeString(row?.id) || null,
        filename: normalizeString(row?.filename) || input.file.name || 'asset.bin',
        storagePath: normalizeString(row?.storage_path) || null,
        checksumSha256: normalizeString(row?.checksum_sha256) || null,
        mimeType: normalizeString(row?.mime_type) || input.file.type || 'application/octet-stream',
        sizeBytes: typeof row?.size_bytes === 'number' ? row.size_bytes : input.file.size || 0,
        tags,
        ...(normalizeString(input.lessonId) ? { lessonId: normalizeString(input.lessonId) } : {}),
        ...(typeof lessonIndex === 'number' ? { lessonIndex } : {}),
        ...(normalizeString(input.slideId) ? { slideId: normalizeString(input.slideId) } : {}),
        ...(typeof slideIndex === 'number' ? { slideIndex } : {}),
        ...(normalizeString(input.originalRef) ? { originalRef: normalizeString(input.originalRef) } : {}),
        deduplicated: row?.deduplicated === true,
    });
}

function courseAssetRecord(file: TrainingAssetRegisteredFile, courseId: string | null, ownerUserId: string | null) {
    return Object.freeze({
        course_id: courseId,
        owner_id: ownerUserId,
        asset_id: file.assetId,
        role: file.role,
        file_id: file.fileId,
        lesson_id: file.lessonId || null,
        slide_index: typeof file.slideIndex === 'number' ? file.slideIndex : null,
        original_ref: file.originalRef || null,
        storage_path: file.storagePath,
        checksum_sha256: file.checksumSha256,
        mime_type: file.mimeType,
        size_bytes: file.sizeBytes,
        status: file.fileId ? 'uploaded' : 'failed',
    });
}

function filesRefForRegisteredFile(file: TrainingAssetRegisteredFile): string {
    const fileId = normalizeString(file.fileId);
    const filename = normalizeString(file.filename) || normalizeString(file.originalRef) || file.assetId;
    if (!fileId || !filename) return '';
    return `files://${fileId}/${encodeURIComponent(filename)}`;
}

function hasMarkdownImage(value: unknown): boolean {
    return /!\[[^\]]*]\([^)]+\)/.test(String(value || ''));
}

function replaceFirstMarkdownImage(value: unknown, nextRef: string, fallbackAlt: string): string {
    const markdown = String(value || '');
    const replacement = `![${fallbackAlt || 'Slide'}](${nextRef})`;
    if (hasMarkdownImage(markdown)) {
        return markdown.replace(/!\[([^\]]*)]\([^)]+\)/, (_match, alt) => `![${alt || fallbackAlt || 'Slide'}](${nextRef})`);
    }
    return `${replacement}${markdown ? `\n\n${markdown}` : ''}`;
}

function lessonSlideIndexCandidates(lesson: CourseLessonLike, lessonIndex: number): readonly number[] {
    const candidates = [
        lesson.slideIndex,
        lesson.modelSlideNumber,
        lesson.slideNumber,
        lesson.order,
        lessonIndex + 1,
    ];
    return Object.freeze(
        candidates
            .map((value) => (typeof value === 'number' ? value : Number(value)))
            .filter((value) => Number.isInteger(value) && value > 0),
    );
}

function slideFileForLesson(
    files: readonly TrainingAssetRegisteredFile[],
    lesson: CourseLessonLike,
    lessonIndex: number,
): TrainingAssetRegisteredFile | null {
    const lessonId = normalizeString(lesson.id);
    const slideCandidates = new Set(lessonSlideIndexCandidates(lesson, lessonIndex));
    return (
        files.find((file) => file.role === 'slide_image' && normalizeString(file.lessonId) && normalizeString(file.lessonId) === lessonId) ||
        files.find((file) => file.role === 'slide_image' && typeof file.lessonIndex === 'number' && file.lessonIndex === lessonIndex + 1) ||
        files.find((file) => file.role === 'slide_image' && typeof file.slideIndex === 'number' && slideCandidates.has(file.slideIndex)) ||
        null
    );
}

function slideAssetRefForFile(file: TrainingAssetRegisteredFile, ref: string, lesson: CourseLessonLike): Record<string, unknown> {
    return Object.freeze({
        scheme: 'files',
        ref,
        bucket: FILE_BUCKET,
        assetId: file.assetId,
        fileId: file.fileId,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        storagePath: file.storagePath,
        checksumSha256: file.checksumSha256,
        role: file.role,
        ...(typeof file.slideIndex === 'number' ? { slideIndex: file.slideIndex } : {}),
        ...(normalizeString(file.lessonId || lesson.id) ? { lessonId: normalizeString(file.lessonId || lesson.id) } : {}),
        required: file.required,
    });
}

function externalizeSlideImagesInDraft<T extends CourseDraft>(draft: T, files: readonly TrainingAssetRegisteredFile[]): T {
    const lessons = Array.isArray((draft as any).lessons) ? (draft as any).lessons : [];
    if (!lessons.length || !files.some((file) => file.role === 'slide_image' && file.fileId)) return draft;
    let replaced = 0;
    const nextLessons = lessons.map((lesson: CourseLessonLike, lessonIndex: number) => {
        const slideFile = slideFileForLesson(files, lesson, lessonIndex);
        if (!slideFile) return lesson;
        const ref = filesRefForRegisteredFile(slideFile);
        if (!ref) return lesson;
        const markdown = replaceFirstMarkdownImage(lesson.markdown, ref, lesson.title || `Slide ${lessonIndex + 1}`);
        replaced += 1;
        return {
            ...lesson,
            markdown,
            slideAssetRef: slideAssetRefForFile(slideFile, ref, lesson),
        };
    });
    if (replaced === 0) return draft;
    return {
        ...(draft as any),
        lessons: nextLessons,
        externalizedSlideImages: Object.freeze({
            status: replaced === files.filter((file) => file.role === 'slide_image' && file.fileId).length ? 'complete' : 'partial',
            refScheme: 'files://',
            replaced,
            missing: 0,
            note: 'Slide images uploaded to Files/Supabase are referenced by file id instead of embedded in the ECBT key.',
        }),
    } as T;
}

async function resolveRegisterFile(
    options: TrainingAssetFilesSyncRuntimeOptions,
): Promise<(file: File, metadata: FileRegisterMetadata) => Promise<FileRegisterResult>> {
    if (options.registerFile) return options.registerFile;
    const fileManager: any = await import('../files/fileManager.js' as string);
    return fileManager.register;
}

export async function syncTrainingAssetFilesToFiles(
    assets: readonly TrainingAssetFileInput[],
    options: TrainingAssetFilesSyncRuntimeOptions = {},
): Promise<TrainingAssetFilesSyncRuntimeResult> {
    const registerFile = await resolveRegisterFile(options);
    const courseId = normalizeString(options.courseId) || null;
    const scopeType = normalizeString(options.scopeType) || FILE_SCOPE.WORKSPACE;
    const modelId = normalizeString(options.modelId) || null;
    const files: TrainingAssetRegisteredFile[] = [];
    const failures: TrainingAssetSyncFailure[] = [];

    for (const input of assets || []) {
        const assetId = normalizeString(input?.assetId);
        const filename = input?.file?.name || assetId || 'asset.bin';
        if (!assetId || !(input?.file instanceof File)) {
            failures.push({
                assetId: assetId || filename,
                filename,
                error: 'Asset invalido: informe assetId e File.',
                code: 'training-assets/invalid-asset',
            });
            continue;
        }
        if (isRawPptxUpload(input)) {
            failures.push({
                assetId,
                filename,
                error: 'PPTX bruto nao deve ser enviado para Files. Publique apenas imagens, videos e assets referenciaveis da aula.',
                code: 'training-assets/raw-pptx-not-allowed',
            });
            continue;
        }
        const tags = tagsForAsset(input, options);
        const res = await registerFile(input.file, {
            source: FILE_SOURCE.IMPORT,
            scopeType,
            ...(modelId ? { modelId } : {}),
            tags,
        });
        if (!res?.ok) {
            failures.push({
                assetId,
                filename,
                error: String(res?.error || 'Falha ao registrar arquivo em Files.'),
                ...(res?.code ? { code: String(res.code) } : {}),
            });
            continue;
        }
        files.push(registeredFileFromRow(input, res.data || {}, tags));
    }

    const ownerUserId = normalizeString(files[0]?.storagePath || '').split('/')[0] || null;
    const status = statusFor(files, failures);
    const courseAssetRecords = Object.freeze(files.map((file) => courseAssetRecord(file, courseId, ownerUserId)));
    const assetFiles = Object.freeze({
        bucket: FILE_BUCKET,
        ownerUserId,
        status,
        files: Object.freeze(files),
    });
    const filesSync = Object.freeze({
        status,
        syncedAt: new Date().toISOString(),
        source: 'files-register' as const,
        courseAssetRecords,
        failures: Object.freeze(failures),
    });

    return Object.freeze({
        ok: failures.length === 0 && files.length > 0,
        bucket: FILE_BUCKET,
        courseId,
        ownerUserId,
        files: Object.freeze(files),
        failures: Object.freeze(failures),
        assetFiles,
        filesSync,
    });
}

export function attachTrainingAssetFilesToDraft<T extends CourseDraft>(
    draft: T,
    syncResult: TrainingAssetFilesSyncRuntimeResult,
): T {
    const withExternalizedSlides = externalizeSlideImagesInDraft(draft, syncResult.files);
    return {
        ...(withExternalizedSlides as any),
        assetFiles: syncResult.assetFiles,
        filesSync: syncResult.filesSync,
        updatedAt: new Date().toISOString(),
    };
}
