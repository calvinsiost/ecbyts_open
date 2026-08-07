// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   SYNC PAYLOAD (pure) — LMS-INTERACTIVE-ASSESS-001 F7 / B2
   ================================================================
   Blind-spot #2 (auditoria 2026-06-14): progresso/cert só viviam no IndexedDB
   (sem registro autoritativo no servidor). B2 sincroniza o estado offline-first
   do IDB para as tabelas Supabase (training_progress / training_certificates /
   training_audit_log). Este módulo é a parte PURA: mapeia os SHAPES do IDB para
   os SHAPES das colunas das tabelas, validando os enums. O upsert/insert em si
   fica no adapter de runtime (lmsSyncAdapter), best-effort e não-bloqueante.

   PURE: sem IO/DOM/THREE/Supabase. Testável isoladamente.
   ================================================================ */

export interface ProgressUpsertRow {
    readonly user_id: string;
    readonly training_id: string;
    readonly status: 'active' | 'completed';
    readonly completed_lesson_ids: readonly string[];
    readonly lesson_scores: Readonly<Record<string, number>>;
    readonly last_quiz_score: number | null;
    readonly enrolled_at: string;
    readonly completed_at: string | null;
    readonly updated_at: string;
}

/** Mapeia uma matrícula do IDB para a linha de upsert de training_progress. */
export function buildProgressUpsert(
    userId: string,
    enrollment: any,
    now: string = new Date().toISOString(),
): ProgressUpsertRow | null {
    if (!userId || !enrollment || typeof enrollment.training_id !== 'string' || !enrollment.training_id) {
        return null;
    }
    const status = enrollment.status === 'completed' ? 'completed' : 'active';
    const completed = Array.isArray(enrollment.completed_lesson_ids)
        ? enrollment.completed_lesson_ids.filter((x: unknown) => typeof x === 'string')
        : [];
    const scores: Record<string, number> = {};
    const src = enrollment.lesson_scores && typeof enrollment.lesson_scores === 'object' ? enrollment.lesson_scores : {};
    for (const k of Object.keys(src)) {
        if (Number.isFinite(src[k])) scores[k] = src[k];
    }
    return Object.freeze({
        user_id: userId,
        training_id: enrollment.training_id,
        status,
        completed_lesson_ids: Object.freeze(completed),
        lesson_scores: Object.freeze(scores),
        last_quiz_score: Number.isFinite(enrollment.last_quiz_score) ? enrollment.last_quiz_score : null,
        enrolled_at: typeof enrollment.enrolled_at === 'string' ? enrollment.enrolled_at : now,
        completed_at: typeof enrollment.completed_at === 'string' ? enrollment.completed_at : null,
        updated_at: now,
    });
}

export interface CertificateRow {
    readonly id: string;
    readonly user_id: string;
    readonly training_id: string;
    readonly training_title: string | null;
    readonly score: number | null;
    readonly payload: unknown;
    readonly payload_hash: string;
    readonly issued_at: string;
}

/** Mapeia um certificado do IDB + hash para a linha de training_certificates. */
export function buildCertificateRow(
    userId: string,
    cert: any,
    payloadHash: string,
    now: string = new Date().toISOString(),
): CertificateRow | null {
    if (!userId || !cert || typeof cert.id !== 'string' || !cert.id || typeof payloadHash !== 'string' || !payloadHash) {
        return null;
    }
    return Object.freeze({
        id: cert.id,
        user_id: userId,
        training_id: typeof cert.training_id === 'string' ? cert.training_id : '',
        training_title: typeof cert.training_title === 'string' ? cert.training_title : null,
        score: Number.isFinite(cert.score) ? cert.score : null,
        payload: cert.payload ?? cert,
        payload_hash: payloadHash,
        issued_at: typeof cert.issued_at === 'string' ? cert.issued_at : now,
    });
}

export type AuditEventType = 'lesson_completed' | 'lesson_skipped' | 'course_completed' | 'certificate_issued';

const AUDIT_EVENTS: ReadonlySet<string> = new Set([
    'lesson_completed',
    'lesson_skipped',
    'course_completed',
    'certificate_issued',
]);

export interface AuditRow {
    readonly user_id: string;
    readonly training_id: string;
    readonly lesson_id: string | null;
    readonly event_type: AuditEventType;
    readonly score: number | null;
    readonly meta: Readonly<Record<string, unknown>>;
    readonly occurred_at: string;
}

/** Monta uma entrada de auditoria (append-only). Retorna null se o evento é inválido. */
export function buildAuditEntry(
    userId: string,
    input: { trainingId?: string; lessonId?: string | null; eventType?: string; score?: number; meta?: Record<string, unknown> },
    now: string = new Date().toISOString(),
): AuditRow | null {
    if (!userId || !input || typeof input.trainingId !== 'string' || !input.trainingId) return null;
    if (!input.eventType || !AUDIT_EVENTS.has(input.eventType)) return null;
    return Object.freeze({
        user_id: userId,
        training_id: input.trainingId,
        lesson_id: typeof input.lessonId === 'string' ? input.lessonId : null,
        event_type: input.eventType as AuditEventType,
        score: Number.isFinite(input.score) ? (input.score as number) : null,
        meta: Object.freeze(input.meta && typeof input.meta === 'object' ? { ...input.meta } : {}),
        occurred_at: now,
    });
}

export function isAuditEventType(t: unknown): t is AuditEventType {
    return typeof t === 'string' && AUDIT_EVENTS.has(t);
}
