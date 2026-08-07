// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TRAINING QUIZ ENGINE — SPEC_TRAINING_MODULE_LMS (MVP Fase 1)

   Pure helpers para o motor de quiz + gamification:
   - 4 question types MVP §Quiz Engine
   - gradeQuiz: score + pass/fail
   - applyShuffling (determinístico via seed)
   - XP + streak bonus §Gamification
   - Certificate payload builder
   - Progress state (video watched ≥90%, scroll-to-bottom)

   Storage (DB/Object Store) + payments ficam em handler/backend.
   ================================================================ */

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';

// ──────────────────────────────────────────────────────────────────────
// Constants §MVP
// ──────────────────────────────────────────────────────────────────────

export const QUESTION_TYPES = Object.freeze([
    'multiple_choice_single',
    'multiple_choice_multi',
    'true_false',
    'fill_in_blank',
]);

export const CONTENT_BLOCK_TYPES = Object.freeze([
    'written', // Markdown + LaTeX
    'audio',
    'video',
    'pdf',
    'embed',
    'simulation_3d',
]);

export const DEFAULT_QUIZ_CONFIG = Object.freeze({
    passing_score: 70,
    max_attempts: 3,
    shuffle_questions: true,
    shuffle_options: true,
    show_correct_after: 'submission',
});

export const GAMIFICATION = Object.freeze({
    XP_PER_LESSON: 10,
    XP_PER_QUIZ_PASS: 20,
    XP_PER_QUIZ_PERFECT: 50,
    STREAK_BONUSES: Object.freeze([
        Object.freeze({ days: 3, multiplier: 1.1 }),
        Object.freeze({ days: 7, multiplier: 1.25 }),
        Object.freeze({ days: 30, multiplier: 2.0 }),
    ]),
});

export const PROGRESS_THRESHOLDS = Object.freeze({
    VIDEO_WATCHED_PCT: 0.9, // 90% §Journey 2
    READING_SCROLL_PCT: 0.95,
    READING_MIN_SECONDS: 15,
});

export const ENROLLMENT_STATUSES = Object.freeze(['active', 'completed', 'dropped']);

export const CERTIFICATE_FORMATS = Object.freeze(['pdf']);

export const DEFAULT_CERTIFICATE_PDF_CONTRACT = Object.freeze({
    format: 'pdf',
    mime_type: 'application/pdf',
    page_size: 'A4',
    orientation: 'landscape',
    template: 'default',
});

export const CERTIFICATE_EXPORT_STORAGE = Object.freeze({
    BUCKET: 'user-files',
    SOURCE: 'training_certificate',
    LOCAL_STORE_KEY: 'ecbyts-local-training-certificates',
    DOWNLOAD_URL_EXPIRES_SECONDS: 60 * 60,
});

export const CERTIFICATE_EXPORT_ERROR_CODES = Object.freeze({
    INVALID_INPUT: 'training_certificate/invalid_input',
    STORAGE_UNAVAILABLE: 'training_certificate/storage_unavailable',
    REMOTE_FAILED: 'training_certificate/remote_failed',
    LOCAL_FAILED: 'training_certificate/local_failed',
});

export const TRAINING_CONTENT_UPLOAD_STORAGE = Object.freeze({
    BUCKET: 'user-files',
    SOURCE: 'training_lesson_content',
    LOCAL_STORE_KEY: 'ecbyts-local-training-content-uploads',
});

export const TRAINING_CONTENT_UPLOAD_ERROR_CODES = Object.freeze({
    INVALID_INPUT: 'training_content_upload/invalid_input',
    STORAGE_UNAVAILABLE: 'training_content_upload/storage_unavailable',
    REMOTE_FAILED: 'training_content_upload/remote_failed',
    LOCAL_FAILED: 'training_content_upload/local_failed',
});

export const TRAINING_LOCAL_FALLBACK_STORAGE = Object.freeze({
    DB_NAME: 'ecbyts-training-lms-local-fallbacks',
    DB_VERSION: 1,
    STORE_NAME: 'records',
});

const CONTENT_BLOCK_TYPE_ALIASES = Object.freeze({
    text: 'written',
    written: 'written',
    markdown: 'written',
    audio: 'audio',
    video: 'video',
    pdf: 'pdf',
    embed: 'embed',
    '3d': 'simulation_3d',
    simulation: 'simulation_3d',
    simulation_3d: 'simulation_3d',
});

const LESSON_CONTENT_TYPE_BY_BLOCK_TYPE = Object.freeze({
    written: 'text',
    video: 'video',
    pdf: 'pdf',
    embed: 'embed',
    simulation_3d: '3d',
});

function _isNonEmptyString(value: any): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function _normalizeContentBlockType(type: any): string | null {
    if (!_isNonEmptyString(type)) return null;
    return (CONTENT_BLOCK_TYPE_ALIASES as Record<string, any>)[type.trim().toLowerCase()] || null;
}

function _isSafeHttpUrl(value: any): boolean {
    if (!_isNonEmptyString(value)) return false;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
}

function _stripTrailingSlashes(value: any): any {
    return value.replace(/\/+$/, '');
}

function _slugifyFileSegment(value: any): string {
    if (!_isNonEmptyString(value)) return 'certificate';
    const slug = value
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return slug || 'certificate';
}

function _normalizeFileName(value: any, fallback: any = 'training-content'): string {
    const raw = _isNonEmptyString(value) ? value.trim() : fallback;
    const extension = raw.includes('.') ? raw.split('.').pop() : '';
    const base = raw.includes('.') ? raw.slice(0, raw.lastIndexOf('.')) : raw;
    const safeBase = _slugifyFileSegment(base);
    const safeExt = String(extension || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
    return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

function _extractUploadAsset(input: any): any {
    return input?.file || input?.blob || input?.asset || input;
}

function _extractUploadFileName(file: any, input: any): string | undefined {
    return file?.name || input?.fileName || input?.file_name || input?.name;
}

function _extractUploadMimeType(file: any, input: any): string | undefined {
    return file?.type || input?.mimeType || input?.mime_type || input?.content_type;
}

function _extractUploadSizeBytes(file: any, input: any): any {
    return file?.size ?? input?.sizeBytes ?? input?.size_bytes ?? input?.byteLength ?? input?.byte_length;
}

function _resolveUploadFile(input: any): any {
    const file = _extractUploadAsset(input);
    const fileName = _extractUploadFileName(file, input);
    const mimeType = _extractUploadMimeType(file, input);
    const sizeBytes = _extractUploadSizeBytes(file, input);
    if (!_isNonEmptyString(fileName) || !_isNonEmptyString(mimeType)) return null;
    return Object.freeze({
        name: _normalizeFileName(fileName),
        original_name: fileName.trim(),
        mime_type: mimeType.trim().toLowerCase(),
        size_bytes: Math.max(0, Math.round(toFiniteNumber(sizeBytes, 0))),
        asset: file || null,
    });
}

function _isUploadableContentType(type: any): type is 'audio' | 'video' | 'pdf' {
    return type === 'audio' || type === 'video' || type === 'pdf';
}

function _validateUploadMimeType(type: any, mimeType: any): boolean {
    if (type === 'pdf') return mimeType === 'application/pdf';
    if (type === 'audio') return mimeType.startsWith('audio/');
    if (type === 'video') return mimeType.startsWith('video/');
    return false;
}

function _buildTrainingContentStoragePath({ userId, trainingId, lessonId, fileName }: any): string {
    const owner = _slugifyFileSegment(userId || 'anonymous');
    const training = _slugifyFileSegment(trainingId || 'training');
    const lesson = _slugifyFileSegment(lessonId || 'lesson');
    return `${owner}/training-content/${training}/${lesson}/${fileName}`;
}

// ──────────────────────────────────────────────────────────────────────
// Question validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {any} question
 * @returns {any}
 */
function _validateMultipleChoiceQuestion(question: any, errors: string[]): void {
    if (!Array.isArray(question.options) || question.options.length < 2) {
        errors.push('≥2 options required');
    }
    if (
        !question.correctOptionIds ||
        (Array.isArray(question.correctOptionIds) && question.correctOptionIds.length === 0)
    ) {
        errors.push('correctOptionIds required');
    }
}

function _validateTrueFalseQuestion(question: any, errors: string[]): void {
    if (typeof question.correctAnswer !== 'boolean') {
        errors.push('correctAnswer must be boolean');
    }
}

function _validateFillInBlankQuestion(question: any, errors: string[]): void {
    if (!question.answerPattern || typeof question.answerPattern !== 'string') {
        errors.push('answerPattern (regex) required');
    }
}

export function validateQuestion(question: any): any {
    const errors: string[] = [];
    if (!question || typeof question !== 'object') return { valid: false, errors: ['not object'] };
    if (!question.id) errors.push('id required');
    if (!QUESTION_TYPES.includes(question.type)) errors.push('invalid type');
    if (!question.text) errors.push('text required');

    if (question.type === 'multiple_choice_single' || question.type === 'multiple_choice_multi') {
        _validateMultipleChoiceQuestion(question, errors);
    } else if (question.type === 'true_false') {
        _validateTrueFalseQuestion(question, errors);
    } else if (question.type === 'fill_in_blank') {
        _validateFillInBlankQuestion(question, errors);
    }

    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Content block validation
// ──────────────────────────────────────────────────────────────────────

/**
 * Validates and normalizes one LMS content block before it is persisted as lesson content_json.
 * @param {any} block
 * @returns {{ valid: boolean, errors: string[], normalized: any }}
 */
function _validateWrittenBlock(block: any, normalized: Record<string, any>, errors: string[]): void {
    const markdown = [block.markdown, block.text, block.body].find(_isNonEmptyString);
    if (!_isNonEmptyString(markdown)) errors.push('markdown required');
    normalized.markdown = _isNonEmptyString(markdown) ? markdown.trim() : '';
}

function _extractMediaSource(block: any): string | undefined {
    return [block.url, block.storagePath, block.storage_path, block.filePath, block.file_path].find(_isNonEmptyString);
}

function _validateMediaMimeType(type: string, mimeType: string | null, errors: string[]): void {
    if (type === 'pdf' && mimeType && mimeType !== 'application/pdf') {
        errors.push('pdf mime_type must be application/pdf');
    }
    if ((type === 'audio' || type === 'video') && mimeType && !mimeType.startsWith(`${type}/`)) {
        errors.push(`${type} mime_type must start with ${type}/`);
    }
}

function _validateMediaBlock(block: any, type: string, normalized: Record<string, any>, errors: string[]): void {
    const source = _extractMediaSource(block);
    if (!_isNonEmptyString(source)) errors.push('source required');
    normalized.source = _isNonEmptyString(source) ? source.trim() : '';
    normalized.mime_type = _isNonEmptyString(block.mimeType || block.mime_type)
        ? (block.mimeType || block.mime_type).trim()
        : null;
    _validateMediaMimeType(type, normalized.mime_type, errors);
}

function _validateEmbedBlock(block: any, normalized: Record<string, any>, errors: string[]): void {
    const url = block.url || block.embedUrl || block.embed_url;
    if (!_isSafeHttpUrl(url)) errors.push('safe http(s) embed url required');
    normalized.url = _isNonEmptyString(url) ? url.trim() : '';
}

function _validateSimulation3dBlock(block: any, normalized: Record<string, any>, errors: string[]): void {
    const sceneId = block.sceneId || block.scene_id;
    const modelUrl = block.modelUrl || block.model_url;
    if (!_isNonEmptyString(sceneId) && !_isSafeHttpUrl(modelUrl)) {
        errors.push('sceneId or safe modelUrl required');
    }
    normalized.scene_id = _isNonEmptyString(sceneId) ? sceneId.trim() : null;
    normalized.model_url = _isNonEmptyString(modelUrl) ? modelUrl.trim() : null;
}

function _validateTypedContentBlock(
    type: string,
    block: any,
    normalized: Record<string, any>,
    errors: string[],
): void {
    if (type === 'written') _validateWrittenBlock(block, normalized, errors);
    else if (type === 'audio' || type === 'video' || type === 'pdf') _validateMediaBlock(block, type, normalized, errors);
    else if (type === 'embed') _validateEmbedBlock(block, normalized, errors);
    else if (type === 'simulation_3d') _validateSimulation3dBlock(block, normalized, errors);
}

export function validateContentBlock(block: any): { valid: boolean; errors: string[]; normalized: any } {
    const errors: string[] = [];
    if (!block || typeof block !== 'object' || Array.isArray(block)) {
        return { valid: false, errors: ['content block object required'], normalized: null };
    }

    const type = _normalizeContentBlockType(block.type || block.content_type || block.contentType);
    if (!type || !CONTENT_BLOCK_TYPES.includes(type)) {
        return { valid: false, errors: ['invalid content block type'], normalized: null };
    }

    const normalized: Record<string, any> = {
        type,
        title: _isNonEmptyString(block.title) ? block.title.trim() : null,
    };

    _validateTypedContentBlock(type, block, normalized, errors);

    return {
        valid: errors.length === 0,
        errors,
        normalized: errors.length === 0 ? Object.freeze(normalized) : normalized,
    };
}

/**
 * Builds a DB-shaped training_lessons content payload for MVP lesson inserts/updates.
 * Audio blocks validate above but are not DB-backed by the current migration yet.
 * @param {any} block
 * @returns {{ content_type: string, content_json: Object }|null}
 */
export function buildLessonContentPayload(block: any): { content_type: string; content_json: any } | null {
    const validation = validateContentBlock(block);
    if (!validation.valid) return null;

    const contentType = (LESSON_CONTENT_TYPE_BY_BLOCK_TYPE as Record<string, any>)[validation.normalized.type];
    if (!contentType) return null;

    return {
        content_type: contentType,
        content_json: Object.freeze({
            ...validation.normalized,
        }),
    };
}

// ──────────────────────────────────────────────────────────────────────
// Grade question
// ──────────────────────────────────────────────────────────────────────

/**
 * Pontua uma resposta (0 ou 1).
 * @param {any} input
 * @param {*} block
 * @returns {{ correct: boolean, score: number }}
 */
/**
 * Builds the storage and DB handoff contract for PDF/video/audio lesson uploads.
 * Audio can be uploaded and tracked, but the current migration does not yet
 * allow audio as training_lessons.content_type, so lesson_payload stays null.
 * @param {{ block?: Object, file?: Object, trainingId?: string, moduleId?: string, lessonId?: string, userId?: string, title?: string }} input
 * @param {{ now?: string }} [options]
 * @returns {any}
 */
function _extractTrainingContentIds(input: any, block: any): any {
    return {
        trainingId: input.trainingId || input.training_id || block.trainingId || block.training_id || null,
        moduleId: input.moduleId || input.module_id || block.moduleId || block.module_id || null,
        lessonId: input.lessonId || input.lesson_id || block.lessonId || block.lesson_id || null,
        userId: input.userId || input.user_id || block.userId || block.user_id || null,
    };
}

function _buildTrainingContentUploadTags(type: string, trainingId: string | null, lessonId: string | null): string[] {
    return ['training', 'lesson-content', type, trainingId, lessonId]
        .map((tag: any) => String(tag || '').trim())
        .filter(Boolean);
}

function _buildTrainingContentUploadRecord(
    ids: any,
    file: any,
    type: string,
    storagePath: string,
    recordId: string,
    now: string,
): any {
    return Object.freeze({
        id: recordId,
        training_id: ids.trainingId,
        module_id: ids.moduleId,
        lesson_id: ids.lessonId,
        content_block_type: type,
        file_name: file.name,
        original_file_name: file.original_name,
        mime_type: file.mime_type,
        size_bytes: file.size_bytes,
        storage_path: storagePath,
        status: 'pending_upload',
        created_at: now,
        updated_at: now,
    });
}

export function buildTrainingContentUploadPlan(input: any, options: any = {}): any {
    if (!input || typeof input !== 'object') return null;

    const block = input.block && typeof input.block === 'object' ? input.block : input;
    const type = _normalizeContentBlockType(block.type || block.content_type || block.contentType);
    if (!_isUploadableContentType(type)) return null;

    const file = _resolveUploadFile(input);
    if (!file || !_validateUploadMimeType(type, file.mime_type)) return null;

    const ids = _extractTrainingContentIds(input, block);
    const title = _isNonEmptyString(block.title || input.title) ? (block.title || input.title).trim() : null;
    const now = options.now || input.now || new Date().toISOString();
    const storagePath = _buildTrainingContentStoragePath({
        userId: ids.userId,
        trainingId: ids.trainingId,
        lessonId: ids.lessonId,
        fileName: file.name,
    });
    const tags = _buildTrainingContentUploadTags(type, ids.trainingId, ids.lessonId);
    const contentBlock = Object.freeze({
        type,
        title,
        storagePath,
        mimeType: file.mime_type,
        originalFileName: file.original_name,
    });
    const lessonPayload = buildLessonContentPayload(contentBlock);
    const recordId = `training-content:${_slugifyFileSegment(ids.lessonId || storagePath)}`;

    return Object.freeze({
        source: TRAINING_CONTENT_UPLOAD_STORAGE.SOURCE,
        bucket: TRAINING_CONTENT_UPLOAD_STORAGE.BUCKET,
        content_block_type: type,
        schema_supported: Boolean(lessonPayload),
        file: Object.freeze({
            name: file.name,
            original_name: file.original_name,
            mime_type: file.mime_type,
            size_bytes: file.size_bytes,
        }),
        direct_storage: Object.freeze({
            strategy: 'supabase_storage_upload',
            bucket: TRAINING_CONTENT_UPLOAD_STORAGE.BUCKET,
            storage_path: storagePath,
            content_type: file.mime_type,
            cache_control: '3600',
            upsert: true,
        }),
        primary: Object.freeze({
            strategy: 'files_register',
            metadata: Object.freeze({
                source: TRAINING_CONTENT_UPLOAD_STORAGE.SOURCE,
                scopeType: 'workspace',
                tags: Object.freeze(tags),
                training_id: ids.trainingId,
                module_id: ids.moduleId,
                lesson_id: ids.lessonId,
                content_block_type: type,
            }),
        }),
        fallback: Object.freeze({
            strategy: 'indexeddb',
            store_key: TRAINING_CONTENT_UPLOAD_STORAGE.LOCAL_STORE_KEY,
            record_id: recordId,
            local_only: true,
        }),
        content_block: contentBlock,
        lesson_payload: lessonPayload,
        record: _buildTrainingContentUploadRecord(ids, file, type, storagePath, recordId, now),
    });
}

/**
 * Adapter-driven persistence for LMS lesson media uploads.
 * Production can wire the remote adapter to Files/Supabase and the local
 * adapter to IndexedDB without changing the lesson payload contract.
 * @param {any} input
 * @param {{ remote?: {save:function}|function, storage?: {save:function}|function, local?: {save:function}|function, indexeddb?: {save:function}|function }} [adapters]
 * @param {any} [options]
 * @returns {Promise<{ok: boolean, data?: Object, error?: string, code?: string}>}
 */
export async function persistTrainingContentUpload(
    input: any,
    adapters: any = {},
    options: any = {},
): Promise<{ ok: boolean; data?: any; error?: string; code?: string }> {
    const plan = buildTrainingContentUploadPlan(input, options);
    if (!plan) {
        return _fail('Invalid training content upload input.', TRAINING_CONTENT_UPLOAD_ERROR_CODES.INVALID_INPUT);
    }

    const remoteSave = _resolveSaveAdapter(adapters, ['remote', 'storage', 'remoteStorage']);
    let remoteError = null;
    if (remoteSave) {
        const remote = await _callStorageAdapter(remoteSave, plan, 'remote');
        if (remote.ok) {
            return _ok(
                Object.freeze({
                    storage: 'remote',
                    fallback: false,
                    result: remote.data,
                    upload_plan: plan,
                    lesson_payload: plan.lesson_payload,
                }),
            );
        }
        remoteError = remote.error;
    }

    const localSave = _resolveSaveAdapter(adapters, ['local', 'indexeddb', 'localStorage']);
    if (localSave) {
        const local = await _callStorageAdapter(localSave, plan, 'local');
        if (local.ok) {
            return _ok(
                Object.freeze({
                    storage: 'local',
                    fallback: Boolean(remoteError),
                    remote_error: remoteError,
                    result: local.data,
                    upload_plan: plan,
                    lesson_payload: plan.lesson_payload,
                }),
            );
        }
        return _fail(local.error, TRAINING_CONTENT_UPLOAD_ERROR_CODES.LOCAL_FAILED, {
            remote_error: remoteError,
            upload_plan: plan,
        });
    }

    return _fail(
        remoteError || 'No training content upload adapter available.',
        remoteError
            ? TRAINING_CONTENT_UPLOAD_ERROR_CODES.REMOTE_FAILED
            : TRAINING_CONTENT_UPLOAD_ERROR_CODES.STORAGE_UNAVAILABLE,
        {
            upload_plan: plan,
        },
    );
}

export function gradeQuestion(question: any, userAnswer: any): { correct: boolean; score: number } {
    if (!question) return { correct: false, score: 0 };

    if (question.type === 'multiple_choice_single') {
        const correct = userAnswer === question.correctOptionIds[0];
        return { correct, score: correct ? 1 : 0 };
    }

    if (question.type === 'multiple_choice_multi') {
        if (!Array.isArray(userAnswer)) return { correct: false, score: 0 };
        const expected = new Set(question.correctOptionIds);
        const provided = new Set(userAnswer);
        if (expected.size !== provided.size) return { correct: false, score: 0 };
        for (const id of expected) if (!provided.has(id)) return { correct: false, score: 0 };
        return { correct: true, score: 1 };
    }

    if (question.type === 'true_false') {
        const correct = Boolean(userAnswer) === Boolean(question.correctAnswer);
        return { correct, score: correct ? 1 : 0 };
    }

    if (question.type === 'fill_in_blank') {
        if (typeof userAnswer !== 'string') return { correct: false, score: 0 };
        try {
            const re = new RegExp(question.answerPattern, 'i');
            const correct = re.test(userAnswer.trim());
            return { correct, score: correct ? 1 : 0 };
        } catch {
            return { correct: false, score: 0 };
        }
    }

    return { correct: false, score: 0 };
}

// ──────────────────────────────────────────────────────────────────────
// Grade whole quiz
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {Array<any>} questions
 * @param {Record<string, any>} userAnswers - questionId → answer
 * @param {any} [config]
 * @returns {any}
 */
export function gradeQuiz(questions: any, userAnswers: any, config: any = {}): any {
    const cfg = { ...DEFAULT_QUIZ_CONFIG, ...config };
    if (!Array.isArray(questions) || questions.length === 0) {
        return { score: 0, correctCount: 0, total: 0, passed: false, perfect: false, breakdown: [] };
    }
    const answers = userAnswers || {};
    let correct = 0;
    const breakdown: any[] = [];
    for (const q of questions) {
        const user = answers[q.id];
        const result = gradeQuestion(q, user);
        breakdown.push({ questionId: q.id, ...result });
        if (result.correct) correct++;
    }
    const score = Math.round((correct / questions.length) * 100);
    return {
        score,
        correctCount: correct,
        total: questions.length,
        passed: score >= cfg.passing_score,
        perfect: correct === questions.length,
        breakdown,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Deterministic shuffle (seed-based Fisher-Yates)
// ──────────────────────────────────────────────────────────────────────

/**
 * PRNG simples Mulberry32.
 * @param {number} seed
 * @returns {() => number}
 */
function _mulberry32(seed: any): () => number {
    let a = seed | 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * @param {Array<any>} arr
 * @param {number} seed
 * @returns {Array<any>} new shuffled array
 */
export function shuffleWithSeed(arr: any, seed: any): any[] {
    if (!Array.isArray(arr)) return [];
    const rng = _mulberry32(Number(seed) || 0);
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// XP computation §Gamification
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {number} streakDays
 * @returns {number} multiplier
 */
export function streakMultiplier(streakDays: any): number {
    const d = Number(streakDays) || 0;
    let mult = 1;
    for (const b of GAMIFICATION.STREAK_BONUSES) {
        if (d >= b.days) mult = b.multiplier;
    }
    return mult;
}

/**
 * Computa XP total dado sessão de aprendizagem.
 * @param {any} session
 * @returns {number}
 */
export function computeSessionXP(session: any): number {
    if (!session || typeof session !== 'object') return 0;
    const lessons = Math.max(0, Number(session.lessonsCompleted) || 0);
    const quizzesPassed = Math.max(0, Number(session.quizzesPassed) || 0);
    const quizzesPerfect = Math.max(0, Number(session.quizzesPerfect) || 0);
    const baseXP =
        lessons * GAMIFICATION.XP_PER_LESSON +
        (quizzesPassed - quizzesPerfect) * GAMIFICATION.XP_PER_QUIZ_PASS +
        quizzesPerfect * GAMIFICATION.XP_PER_QUIZ_PERFECT;
    const mult = streakMultiplier(session.streakDays);
    return Math.round(baseXP * mult);
}

// ──────────────────────────────────────────────────────────────────────
// Progress tracking
// ──────────────────────────────────────────────────────────────────────

/**
 * Decide se um bloco de vídeo conta como "watched".
 * @param {number} watchedSeconds
 * @param {number} totalSeconds
 * @returns {boolean}
 */
export function isVideoWatched(watchedSeconds: any, totalSeconds: any): boolean {
    const w = Number(watchedSeconds);
    const t = Number(totalSeconds);
    if (!Number.isFinite(w) || !Number.isFinite(t) || t <= 0) return false;
    return w / t >= PROGRESS_THRESHOLDS.VIDEO_WATCHED_PCT;
}

/**
 * @param {number} scrollPct - 0..1
 * @param {number} secondsOnPage
 * @returns {boolean}
 */
export function isReadingComplete(scrollPct: any, secondsOnPage: any): boolean {
    const s = Number(scrollPct) || 0;
    const t = Number(secondsOnPage) || 0;
    return s >= PROGRESS_THRESHOLDS.READING_SCROLL_PCT && t >= PROGRESS_THRESHOLDS.READING_MIN_SECONDS;
}

/**
 * Decide if a training can be enrolled through the MVP free-only path.
 * @param {any} training
 * @returns {{ allowed: boolean, reason: string|null }}
 */
export function evaluateFreeEnrollment(training: any): { allowed: boolean; reason: string | null } {
    if (!training || typeof training !== 'object') {
        return { allowed: false, reason: 'training_required' };
    }

    if (training.status !== 'published') {
        return { allowed: false, reason: 'training_not_published' };
    }

    const pricingType = training.pricing_type || training.pricingType || 'free';
    if (pricingType !== 'free') {
        return { allowed: false, reason: 'training_not_free' };
    }

    return { allowed: true, reason: null };
}

/**
 * Builds a DB-shaped training_enrollments insert payload for the MVP free-only path.
 * @param {{ training: Object, userId?: string, learnerId?: string, now?: string }} input
 * @returns {any}
 */
export function buildFreeEnrollmentPayload(input: any): any {
    if (!input || typeof input !== 'object') return null;
    const training = input.training;
    const trainingId = training?.id || input.trainingId;
    const userId = input.userId || input.learnerId || input.learner?.id;
    if (!trainingId || !userId) return null;

    const eligibility = evaluateFreeEnrollment(training);
    if (!eligibility.allowed) return null;

    return {
        training_id: trainingId,
        user_id: userId,
        status: 'active',
        progress_percent: 0,
        enrolled_at: input.now || new Date().toISOString(),
        completed_at: null,
    };
}

function _clampPercent(value: any): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * Computes lesson completion progress with duplicate completed lessons ignored.
 * @param {{ completedLessonIds?: Array<string>, totalLessons?: number|Array<any> }} input
 * @returns {{ completedCount: number, totalLessons: number, progress_percent: number, complete: boolean }}
 */
export function computeLessonProgress(input: any): {
    completedCount: number;
    totalLessons: number;
    progress_percent: number;
    complete: boolean;
} {
    const completedIds = Array.isArray(input?.completedLessonIds) ? input.completedLessonIds : [];
    const completedCount = new Set(completedIds.filter(Boolean)).size;
    const totalLessons = Array.isArray(input?.totalLessons)
        ? input.totalLessons.length
        : Math.max(0, Math.trunc(Number(input?.totalLessons) || 0));

    if (totalLessons <= 0) {
        return { completedCount: 0, totalLessons: 0, progress_percent: 0, complete: false };
    }

    const boundedCompleted = Math.min(completedCount, totalLessons);
    const progressPercent = _clampPercent((boundedCompleted / totalLessons) * 100);
    return {
        completedCount: boundedCompleted,
        totalLessons,
        progress_percent: progressPercent,
        complete: progressPercent >= 100,
    };
}

/**
 * Builds a monotonic training_enrollments update payload from lesson completion state.
 * @param {{ enrollment: Object, completedLessonIds?: Array<string>, totalLessons?: number|Array<any>, now?: string }} input
 * @returns {any}
 */
export function buildEnrollmentProgressUpdate(input: any): any {
    if (!input || typeof input !== 'object' || !input.enrollment) return null;
    const enrollment = input.enrollment;
    const currentStatus = ENROLLMENT_STATUSES.includes(enrollment.status) ? enrollment.status : 'active';
    const currentProgress = _clampPercent(enrollment.progress_percent);

    if (currentStatus === 'dropped') {
        return {
            status: 'dropped',
            progress_percent: currentProgress,
            completed_at: enrollment.completed_at || null,
        };
    }

    const next = computeLessonProgress(input);
    const completed = currentStatus === 'completed' || Math.max(currentProgress, next.progress_percent) >= 100;
    const progressPercent = completed ? 100 : Math.max(currentProgress, next.progress_percent);

    return {
        status: completed ? 'completed' : 'active',
        progress_percent: progressPercent,
        completed_at: completed ? enrollment.completed_at || input.now || new Date().toISOString() : null,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Certificate payload
// ──────────────────────────────────────────────────────────────────────

function _resolveCertificateScore(input: any): number | null {
    const rawScore = input?.score ?? input?.finalScore ?? input?.final_score;
    if (rawScore === null || rawScore === undefined || rawScore === '') return null;
    const score = Number(rawScore);
    return Number.isFinite(score) ? _clampPercent(score) : null;
}

function _resolveCertificateVerificationUrl(certificateId: any, baseUrl: any): string {
    const safeBaseUrl = _isSafeHttpUrl(baseUrl) ? baseUrl : 'https://ecbyts.com/verify';
    return `${_stripTrailingSlashes(safeBaseUrl)}/${encodeURIComponent(certificateId)}`;
}

function _resolveCertificateId(input: any): string | null {
    const certificateId = input?.certificateId ?? input?.certificate_id;
    return _isNonEmptyString(certificateId) ? certificateId.trim() : null;
}

function _resolveCertificateLearnerName(learner: any): string | null {
    const learnerName = learner?.fullName ?? learner?.full_name ?? learner?.name;
    return _isNonEmptyString(learnerName) ? learnerName.trim() : null;
}

function _resolveCertificateTrainingTitle(training: any): string | null {
    return _isNonEmptyString(training?.title) ? training.title.trim() : null;
}

function _buildCertificateFileName(payload: any): string {
    const trainingSlug = _slugifyFileSegment(payload.training_title);
    const certificateSlug = _slugifyFileSegment(payload.certificate_id);
    return `${trainingSlug}-${certificateSlug}.pdf`;
}

function _sanitizeFileName(value: any, fallback: any = 'certificate.pdf'): string {
    const raw = _isNonEmptyString(value) ? value.trim() : fallback;
    const safe = raw
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
    return safe || fallback;
}

function _ensurePdfFileName(value: any): string {
    const safe = _sanitizeFileName(value);
    return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

// WinAnsi specials (cp1252 0x80-0x9F) que diferem de Latin-1 — mapeia os
// símbolos Unicode comuns para o byte WinAnsi correto. Demais chars Latin-1
// (0xA0-0xFF) são identidade com WinAnsi (ê=0xEA, ç=0xE7, ã=0xE3, õ=0xF5…).
const _WINANSI_SPECIALS: Record<number, number> = Object.freeze({
    0x20ac: 0x80, // €
    0x201a: 0x82, // ‚
    0x0192: 0x83, // ƒ
    0x201e: 0x84, // „
    0x2026: 0x85, // …
    0x2020: 0x86, // †
    0x2021: 0x87, // ‡
    0x02c6: 0x88, // ˆ
    0x2030: 0x89, // ‰
    0x0160: 0x8a, // Š
    0x2039: 0x8b, // ‹
    0x0152: 0x8c, // Œ
    0x2018: 0x91, // ‘
    0x2019: 0x92, // ’
    0x201c: 0x93, // “
    0x201d: 0x94, // ”
    0x2022: 0x95, // •
    0x2013: 0x96, // – en-dash
    0x2014: 0x97, // — em-dash
    0x2122: 0x99, // ™
    0x0161: 0x9a, // š
    0x203a: 0x9b, // ›
    0x0153: 0x9c, // œ
    0x0178: 0x9f, // Ÿ
});

function _toWinAnsiByte(code: number): number {
    if (code >= 0x20 && code <= 0x7e) return code; // ASCII imprimível
    if (code >= 0xa0 && code <= 0xff) return code; // Latin-1 == WinAnsi
    if (Object.prototype.hasOwnProperty.call(_WINANSI_SPECIALS, code)) return _WINANSI_SPECIALS[code]!;
    return 0x3f; // '?' para chars fora do WinAnsi
}

/**
 * Codifica o texto como string literal PDF single-byte (WinAnsi) com escapes
 * octais para bytes não-ASCII e escape de ( ) \. Mantém o corpo do PDF
 * ASCII-safe (o TextEncoder UTF-8 não quebra bytes altos em multi-byte) e
 * renderiza acentos PT-BR corretamente com Helvetica /WinAnsiEncoding.
 *
 * Substitui o encoder UTF-16BE+BOM anterior, que com fonte single-byte
 * desenhava o BOM como "ÿ" e mapeava acentos para glifos errados (ê→Œ).
 */
function _toWinAnsiPdfString(value: any): string {
    const text = String(value ?? '');
    let out = '(';
    for (let i = 0; i < text.length; i++) {
        const byte = _toWinAnsiByte(text.charCodeAt(i));
        if (byte === 0x28) out += '\\(';
        else if (byte === 0x29) out += '\\)';
        else if (byte === 0x5c) out += '\\\\';
        else if (byte >= 0x20 && byte < 0x7f) out += String.fromCharCode(byte);
        else out += `\\${byte.toString(8).padStart(3, '0')}`;
    }
    return `${out})`;
}

function _pdfTextCommand({ text, x, y, size = 14, color = '0 0 0 rg' }: any): string {
    return ['BT', color, `/F1 ${size} Tf`, `1 0 0 1 ${x} ${y} Tm`, `${_toWinAnsiPdfString(text)} Tj`, 'ET'].join('\n');
}

function _truncatePdfText(value: any, maxLength: any): string {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

function _isCertificatePdfContract(input: any): boolean {
    return (
        input &&
        input.format === DEFAULT_CERTIFICATE_PDF_CONTRACT.format &&
        input.mime_type === DEFAULT_CERTIFICATE_PDF_CONTRACT.mime_type &&
        Array.isArray(input.sections) &&
        input.render_payload
    );
}

function _resolveCertificatePdfContract(input: any): any {
    if (_isCertificatePdfContract(input)) return input;
    if (_isCertificatePdfContract(input?.contract)) return input.contract;
    return buildCertificatePdfContract(input);
}

function _buildCertificatePdfStream(contract: any): string {
    const payload = contract.render_payload;
    const completionDate = String(payload.completion_date || '').slice(0, 10);
    const score = payload.score === null ? 'N/A' : `${payload.score}%`;
    const lines = [
        'q',
        '1 1 1 rg',
        '0 0 841.89 595.28 re',
        'f',
        '0.08 0.21 0.26 RG',
        '3 w',
        '44 44 753.89 507.28 re',
        'S',
        _pdfTextCommand({
            text: 'Certificate of Completion',
            x: 76,
            y: 494,
            size: 32,
            color: '0.05 0.18 0.22 rg',
        }),
        _pdfTextCommand({
            text: payload.learner_name,
            x: 76,
            y: 418,
            size: 28,
            color: '0 0 0 rg',
        }),
        _pdfTextCommand({
            text: `Completed: ${_truncatePdfText(payload.training_title, 68)}`,
            x: 76,
            y: 372,
            size: 18,
            color: '0.1 0.1 0.1 rg',
        }),
        _pdfTextCommand({
            text: `Completion date: ${completionDate}`,
            x: 76,
            y: 326,
            size: 13,
            color: '0.18 0.18 0.18 rg',
        }),
        _pdfTextCommand({
            text: `Final score: ${score}`,
            x: 76,
            y: 300,
            size: 13,
            color: '0.18 0.18 0.18 rg',
        }),
        _pdfTextCommand({
            text: `Certificate ID: ${payload.certificate_id}`,
            x: 76,
            y: 244,
            size: 12,
            color: '0.18 0.18 0.18 rg',
        }),
        _pdfTextCommand({
            text: `Verify: ${_truncatePdfText(payload.verification_url, 96)}`,
            x: 76,
            y: 220,
            size: 11,
            color: '0.1 0.31 0.38 rg',
        }),
        _pdfTextCommand({
            text: `Template: ${payload.template} | Format: PDF | Issued: ${String(payload.issued_at || '').slice(0, 10)}`,
            x: 76,
            y: 92,
            size: 10,
            color: '0.35 0.35 0.35 rg',
        }),
        'Q',
    ];
    return `${lines.join('\n')}\n`;
}

function _buildPdfBytesFromObjects(objects: any): Uint8Array | null {
    if (typeof TextEncoder === 'undefined') return null;
    let body = '%PDF-1.4\n';
    const offsets = [0];

    for (let i = 0; i < objects.length; i++) {
        offsets[i + 1] = body.length;
        body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
    }

    const xrefOffset = body.length;
    body += `xref\n0 ${objects.length + 1}\n`;
    body += '0000000000 65535 f \n';
    for (let i = 1; i <= objects.length; i++) {
        body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    body += `startxref\n${xrefOffset}\n%%EOF\n`;

    return new TextEncoder().encode(body);
}

function _renderCertificatePdfBytes(contract: any): Uint8Array | null {
    const stream = _buildCertificatePdfStream(contract);
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        [
            '<< /Type /Page /Parent 2 0 R',
            '/MediaBox [0 0 841.89 595.28]',
            '/Resources << /Font << /F1 4 0 R >> >>',
            '/Contents 5 0 R >>',
        ].join(' '),
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    ];
    return _buildPdfBytesFromObjects(objects);
}

function _isCertificatePdfBinary(input: any): boolean {
    return (
        input &&
        input.bytes instanceof Uint8Array &&
        input.mime_type === DEFAULT_CERTIFICATE_PDF_CONTRACT.mime_type &&
        _isCertificatePdfContract(input.contract)
    );
}

function _resolveCertificatePdfBinary(input: any): any {
    if (_isCertificatePdfBinary(input)) return input;
    if (_isCertificatePdfBinary(input?.binary)) return input.binary;
    return buildCertificatePdfBinary(input);
}

function _buildCertificateStoragePath({ payload, fileName, userId }: any): string {
    const owner = _slugifyFileSegment(userId || payload.metadata?.learner_id || 'anonymous');
    const certificateId = _slugifyFileSegment(payload.certificate_id);
    return `${owner}/training-certificates/${certificateId}/${fileName}`;
}

function _resolveSaveAdapter(adapters: any, names: any): any {
    for (const name of names) {
        const candidate = adapters?.[name];
        if (typeof candidate === 'function') return candidate;
        if (typeof candidate?.save === 'function') return candidate.save.bind(candidate);
    }
    return null;
}

function _resolveIndexedDb(options: any = {}): any {
    return options.indexedDB || options.indexedDb || globalThis.indexedDB || null;
}

function _idbRequest(request: any): Promise<any> {
    return new Promise((resolve: any, reject: any) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
    });
}

async function _openTrainingLocalFallbackDb(options: any = {}): Promise<any> {
    const indexedDb = _resolveIndexedDb(options);
    if (!indexedDb || typeof indexedDb.open !== 'function') {
        throw new Error('IndexedDB unavailable.');
    }

    const dbName = options.dbName || TRAINING_LOCAL_FALLBACK_STORAGE.DB_NAME;
    const storeName = options.storeName || TRAINING_LOCAL_FALLBACK_STORAGE.STORE_NAME;
    const request = indexedDb.open(dbName, options.version || TRAINING_LOCAL_FALLBACK_STORAGE.DB_VERSION);
    request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames?.contains?.(storeName)) {
            db.createObjectStore(storeName);
        }
    };
    return _idbRequest(request);
}

async function _putTrainingLocalFallbackRecord(record: any, options: any = {}): Promise<any> {
    const storeName = options.storeName || TRAINING_LOCAL_FALLBACK_STORAGE.STORE_NAME;
    const db = await _openTrainingLocalFallbackDb(options);
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await _idbRequest(store.put(record, record.id));
    return record;
}

function _buildCertificateFallbackRecord(input: any, now: string): any {
    const plan = input.storage;
    return Object.freeze({
        id: plan.fallback.record_id,
        kind: 'training_certificate_pdf_export',
        source: plan.source,
        bucket: plan.bucket,
        store_key: plan.fallback.store_key,
        local_only: true,
        file: plan.file,
        primary: plan.primary,
        direct_storage: plan.direct_storage,
        record: Object.freeze({
            ...plan.record,
            status: 'stored_local',
            updated_at: now,
        }),
        certificate_id: plan.record?.certificate_id || null,
        byte_length: input.binary?.byte_length || plan.file?.size_bytes || 0,
        bytes: input.binary?.bytes || null,
        created_at: now,
        updated_at: now,
    });
}

function _buildContentUploadFallbackRecord(input: any, now: string): any {
    return Object.freeze({
        id: input.fallback.record_id,
        kind: 'training_content_upload',
        source: input.source,
        bucket: input.bucket,
        store_key: input.fallback.store_key,
        local_only: true,
        content_block_type: input.content_block_type,
        schema_supported: input.schema_supported,
        file: input.file,
        primary: input.primary,
        direct_storage: input.direct_storage,
        content_block: input.content_block,
        lesson_payload: input.lesson_payload,
        record: Object.freeze({
            ...input.record,
            status: 'stored_local',
            updated_at: now,
        }),
        created_at: now,
        updated_at: now,
    });
}

function _buildTrainingLocalFallbackRecord(input: any, options: any = {}): any {
    const now = options.now || new Date().toISOString();

    if (input?.kind === 'training_certificate_pdf_export' && input.storage?.fallback) {
        return _buildCertificateFallbackRecord(input, now);
    }

    if (input?.source === TRAINING_CONTENT_UPLOAD_STORAGE.SOURCE && input.fallback) {
        return _buildContentUploadFallbackRecord(input, now);
    }

    return null;
}

/**
 * Creates the opt-in IndexedDB fallback adapter used by LMS upload/certificate
 * persistence when remote Files or Supabase Storage are unavailable.
 * @param {any} [options]
 * @returns {any}
 */
export function createTrainingIndexedDbLocalAdapter(options: any = {}): any {
    return Object.freeze({
        async save(input: any) {
            const record = _buildTrainingLocalFallbackRecord(input, options);
            if (!record) {
                return { ok: false, error: 'Unsupported training local fallback input.' };
            }
            const saved = await _putTrainingLocalFallbackRecord(record, options);
            return {
                ok: true,
                data: Object.freeze({
                    id: saved.id,
                    kind: saved.kind,
                    store_key: saved.store_key,
                    local_only: true,
                    byte_length: saved.byte_length || saved.file?.size_bytes || 0,
                }),
            };
        },
    });
}

async function _callStorageAdapter(save: any, bundle: any, target: any): Promise<any> {
    try {
        const result = await save(bundle, target);
        if (result?.ok === false) return { ok: false, error: result.error || `${target}_save_failed`, data: result };
        return { ok: true, data: result?.data ?? result ?? null };
    } catch (error) {
        return { ok: false, error: (error as any)?.message || `${target}_save_failed` };
    }
}

function _ok(data: any): { ok: boolean; data: any } {
    return { ok: true, data };
}

function _fail(error: any, code: any, data: any = null): { ok: boolean; error: any; code: any; data: any } {
    return { ok: false, error, code, data };
}

/**
 * Checks whether a completed MVP enrollment can receive a basic certificate.
 * If no enrollment is supplied, only certificate feature flags and score are evaluated.
 * @param {{ training?: Object, enrollment?: Object, score?: number, passingScore?: number }} input
 * @returns {{ eligible: boolean, reason: string|null }}
 */
export function evaluateCertificateEligibility(input: any): { eligible: boolean; reason: string | null } {
    if (!input || typeof input !== 'object') return { eligible: false, reason: 'certificate_input_required' };
    if (input.training?.certificate_enabled === false) {
        return { eligible: false, reason: 'certificate_disabled' };
    }

    const enrollment = input.enrollment;
    if (enrollment) {
        const status = ENROLLMENT_STATUSES.includes(enrollment.status) ? enrollment.status : 'active';
        const progressPercent = _clampPercent(enrollment.progress_percent);
        if (status !== 'completed' && progressPercent < 100) {
            return { eligible: false, reason: 'training_not_completed' };
        }
    }

    const score = _resolveCertificateScore(input);
    const passingScore = _clampPercent(
        input.passingScore ?? input.training?.passing_score ?? DEFAULT_QUIZ_CONFIG.passing_score,
    );
    if (score !== null && score < passingScore) {
        return { eligible: false, reason: 'score_below_passing' };
    }

    return { eligible: true, reason: null };
}

/**
 * Builds the stable payload used by storage/backend PDF generation for a basic LMS certificate.
 * @param {any} input
 * @returns {any}
 */
function _resolveCertificateCoreFields(input: any): any {
    const learnerName = _resolveCertificateLearnerName(input.learner);
    const trainingTitle = _resolveCertificateTrainingTitle(input.training);
    const certificateId = _resolveCertificateId(input);
    if (!learnerName || !trainingTitle || !certificateId) return null;

    const score = _resolveCertificateScore(input);
    const completionDate =
        input.completionDate || input.completion_date || input.enrollment?.completed_at || new Date().toISOString();
    const issuedAt = input.issuedAt || input.issued_at || completionDate;
    const verificationUrl = _resolveCertificateVerificationUrl(
        certificateId,
        input.verificationBaseUrl || input.verification_base_url,
    );

    return {
        learnerName,
        trainingTitle,
        certificateId,
        score,
        completionDate,
        issuedAt,
        verificationUrl,
    };
}

function _buildCertificateMetadata(input: any): any {
    return Object.freeze({
        learner_id: input.learner.id || input.learner.user_id || null,
        training_id: input.training.id || null,
        enrollment_id: input.enrollment?.id || null,
        locale: input.locale || input.training.locale || 'pt-BR',
    });
}

export function buildCertificatePayload(input: any): any {
    if (!input || !input.learner || !input.training) return null;

    const eligibility = evaluateCertificateEligibility(input);
    if (!eligibility.eligible) return null;

    const core = _resolveCertificateCoreFields(input);
    if (!core) return null;

    const fields = Object.freeze({
        learner_name: core.learnerName,
        training_title: core.trainingTitle,
        completion_date: core.completionDate,
        score: core.score,
        certificate_id: core.certificateId,
    });

    return Object.freeze({
        template: _isNonEmptyString(input.template) ? input.template.trim() : DEFAULT_CERTIFICATE_PDF_CONTRACT.template,
        format: DEFAULT_CERTIFICATE_PDF_CONTRACT.format,
        learner_name: core.learnerName,
        training_title: core.trainingTitle,
        completion_date: core.completionDate,
        issued_at: core.issuedAt,
        score: core.score,
        certificate_id: core.certificateId,
        verification_url: core.verificationUrl,
        fields,
        metadata: _buildCertificateMetadata(input),
    });
}

/**
 * Builds a renderer-ready contract for the basic certificate PDF.
 * It intentionally does not create a PDF binary, upload storage, or expose UI.
 * @param {any} input
 * @returns {any}
 */
export function buildCertificatePdfContract(input: any): any {
    const payload = buildCertificatePayload(input);
    if (!payload) return null;

    const fileName = _isNonEmptyString(input?.fileName || input?.file_name)
        ? (input.fileName || input.file_name).trim()
        : _buildCertificateFileName(payload);

    return Object.freeze({
        format: DEFAULT_CERTIFICATE_PDF_CONTRACT.format,
        mime_type: DEFAULT_CERTIFICATE_PDF_CONTRACT.mime_type,
        file_name: fileName,
        template: payload.template,
        certificate_id: payload.certificate_id,
        verification_url: payload.verification_url,
        page: Object.freeze({
            size: DEFAULT_CERTIFICATE_PDF_CONTRACT.page_size,
            orientation: DEFAULT_CERTIFICATE_PDF_CONTRACT.orientation,
        }),
        sections: Object.freeze([
            Object.freeze({ type: 'heading', text: 'Certificate of Completion' }),
            Object.freeze({ type: 'learner_name', text: payload.learner_name }),
            Object.freeze({ type: 'training_title', text: payload.training_title }),
            Object.freeze({ type: 'completion_date', text: payload.completion_date }),
            Object.freeze({ type: 'score', text: payload.score === null ? 'N/A' : `${payload.score}%` }),
            Object.freeze({ type: 'certificate_id', text: payload.certificate_id }),
        ]),
        qr_code: Object.freeze({
            value: payload.verification_url,
            alt: `Verify certificate ${payload.certificate_id}`,
        }),
        render_payload: payload,
    });
}

/**
 * Renders the basic certificate contract into a minimal, valid PDF binary.
 * The output is intentionally dependency-free so Node tests can validate the
 * binary contract before a browser UI or Supabase adapter exists.
 * @param {any} input - Raw certificate input, PDF contract, or binary bundle.
 * @returns {{ format: string, mime_type: string, file_name: string, byte_length: number, bytes: Uint8Array, contract: Object }|null}
 */
export function buildCertificatePdfBinary(input: any): {
    format: string;
    mime_type: string;
    file_name: string;
    byte_length: number;
    bytes: Uint8Array;
    contract: any;
} | null {
    const contract = _resolveCertificatePdfContract(input);
    if (!contract) return null;

    const bytes = _renderCertificatePdfBytes(contract);
    if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) return null;

    return Object.freeze({
        format: DEFAULT_CERTIFICATE_PDF_CONTRACT.format,
        mime_type: DEFAULT_CERTIFICATE_PDF_CONTRACT.mime_type,
        file_name: _ensurePdfFileName(contract.file_name),
        byte_length: bytes.byteLength,
        bytes,
        contract,
    });
}

/**
 * Builds the UI-facing download descriptor without touching the DOM.
 * A handler can turn `bytes` into `new Blob([bytes], { type: mime_type })`
 * and use the documented object-url anchor fallback.
 * @param {any} input - Raw certificate input, PDF contract, or binary bundle.
 * @returns {any}
 */
export function buildCertificateDownloadContract(input: any): any {
    const binary = _resolveCertificatePdfBinary(input);
    if (!binary) return null;

    return Object.freeze({
        action: 'download',
        strategy: 'browser_blob',
        file_name: binary.file_name,
        mime_type: binary.mime_type,
        byte_length: binary.byte_length,
        bytes: binary.bytes,
        fallback: Object.freeze({
            strategy: 'object_url_anchor',
            revoke_object_url: true,
        }),
        contract: binary.contract,
    });
}

/**
 * Builds the storage plan for certificate PDFs:
 * 1. primary Files-system registration,
 * 2. direct Supabase Storage target for backend workers,
 * 3. IndexedDB local fallback metadata for offline/browser-only operation.
 * @param {any} input - Raw certificate input, PDF contract, or binary bundle.
 * @param {{ userId?: string, now?: string }} [options]
 * @returns {any}
 */
export function buildCertificateStoragePlan(input: any, options: any = {}): any {
    const binary = _resolveCertificatePdfBinary(input);
    if (!binary) return null;

    const payload = binary.contract.render_payload;
    const fileName = _ensurePdfFileName(binary.file_name);
    const storagePath = _buildCertificateStoragePath({
        payload,
        fileName,
        userId: options.userId || payload.metadata?.learner_id,
    });
    const now = options.now || new Date().toISOString();
    const tags = ['training', 'certificate', 'pdf', payload.metadata?.training_id]
        .map((tag: any) => String(tag || '').trim())
        .filter(Boolean);

    return Object.freeze({
        source: CERTIFICATE_EXPORT_STORAGE.SOURCE,
        bucket: CERTIFICATE_EXPORT_STORAGE.BUCKET,
        file: Object.freeze({
            name: fileName,
            extension: 'pdf',
            mime_type: binary.mime_type,
            size_bytes: binary.byte_length,
        }),
        primary: Object.freeze({
            strategy: 'files_register',
            metadata: Object.freeze({
                source: CERTIFICATE_EXPORT_STORAGE.SOURCE,
                scopeType: 'workspace',
                tags: Object.freeze(tags),
                certificate_id: payload.certificate_id,
                training_id: payload.metadata?.training_id || null,
                enrollment_id: payload.metadata?.enrollment_id || null,
            }),
        }),
        direct_storage: Object.freeze({
            strategy: 'supabase_storage_upload',
            bucket: CERTIFICATE_EXPORT_STORAGE.BUCKET,
            storage_path: storagePath,
            content_type: binary.mime_type,
            cache_control: '3600',
            upsert: true,
        }),
        fallback: Object.freeze({
            strategy: 'indexeddb',
            store_key: CERTIFICATE_EXPORT_STORAGE.LOCAL_STORE_KEY,
            record_id: `training-certificate:${payload.certificate_id}`,
            local_only: true,
            download_only_when_unavailable: true,
        }),
        record: Object.freeze({
            certificate_id: payload.certificate_id,
            learner_id: payload.metadata?.learner_id || null,
            training_id: payload.metadata?.training_id || null,
            enrollment_id: payload.metadata?.enrollment_id || null,
            file_name: fileName,
            mime_type: binary.mime_type,
            size_bytes: binary.byte_length,
            storage_path: storagePath,
            status: 'pending_upload',
            created_at: now,
            updated_at: now,
        }),
    });
}

/**
 * Combines binary, browser download, and storage fallback contracts.
 * @param {any} input
 * @param {any} [options]
 * @returns {any}
 */
export function buildCertificateExportBundle(input: any, options: any = {}): any {
    const binary = _resolveCertificatePdfBinary(input);
    if (!binary) return null;

    return Object.freeze({
        kind: 'training_certificate_pdf_export',
        binary,
        download: buildCertificateDownloadContract(binary),
        storage: buildCertificateStoragePlan(binary, options),
    });
}

/**
 * Adapter-driven persistence for the certificate export bundle.
 * Tests can inject remote/local adapters; production UI can wire this to Files
 * and IDB without changing the core certificate contract.
 * @param {any} input
 * @param {{ remote?: {save:function}|function, storage?: {save:function}|function, local?: {save:function}|function, indexeddb?: {save:function}|function }} [adapters]
 * @param {any} [options]
 * @returns {Promise<{ok: boolean, data?: Object, error?: string, code?: string}>}
 */
export async function persistCertificatePdfExport(
    input: any,
    adapters: any = {},
    options: any = {},
): Promise<{ ok: boolean; data?: any; error?: string; code?: string }> {
    const bundle = buildCertificateExportBundle(input, options);
    if (!bundle) {
        return _fail('Invalid certificate PDF export input.', CERTIFICATE_EXPORT_ERROR_CODES.INVALID_INPUT);
    }

    const remoteSave = _resolveSaveAdapter(adapters, ['remote', 'storage', 'remoteStorage']);
    let remoteError = null;
    if (remoteSave) {
        const remote = await _callStorageAdapter(remoteSave, bundle, 'remote');
        if (remote.ok) {
            return _ok(
                Object.freeze({
                    storage: 'remote',
                    fallback: false,
                    result: remote.data,
                    download: bundle.download,
                    storage_plan: bundle.storage,
                }),
            );
        }
        remoteError = remote.error;
    }

    const localSave = _resolveSaveAdapter(adapters, ['local', 'indexeddb', 'localStorage']);
    if (localSave) {
        const local = await _callStorageAdapter(localSave, bundle, 'local');
        if (local.ok) {
            return _ok(
                Object.freeze({
                    storage: 'local',
                    fallback: Boolean(remoteError),
                    remote_error: remoteError,
                    result: local.data,
                    download: bundle.download,
                    storage_plan: bundle.storage,
                }),
            );
        }
        return _fail(local.error, CERTIFICATE_EXPORT_ERROR_CODES.LOCAL_FAILED, {
            remote_error: remoteError,
            download: bundle.download,
            storage_plan: bundle.storage,
        });
    }

    return _fail(
        remoteError || 'No certificate PDF storage adapter available.',
        remoteError ? CERTIFICATE_EXPORT_ERROR_CODES.REMOTE_FAILED : CERTIFICATE_EXPORT_ERROR_CODES.STORAGE_UNAVAILABLE,
        {
            download: bundle.download,
            storage_plan: bundle.storage,
        },
    );
}
