// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS CATALOG PURE — Training Module LMS (SPEC_TRAINING_MODULE_LMS)

   Glue pure-logic entre o catálogo seed (lmsContent) + matrículas do
   usuário e o shape data-driven que o trainingPanel consome via
   setTrainingPanelData({ myCourses, catalog, certificates }).

   Reusa o quizEngine para progresso (computeLessonProgress) e
   elegibilidade (evaluateFreeEnrollment) — NÃO reimplementa. Sem DOM,
   sem IO: o runtime manager injeta enrollments/certificates carregados
   do IDB/Supabase. Node-testável.
   ================================================================ */

import { computeLessonProgress, evaluateFreeEnrollment } from './quizEngine.js';
import { getCatalogSeed, getTrainingById, listLessonIds, getLessonsForTraining } from './lmsContent.js';

export interface EnrollmentLike {
    readonly training_id: string;
    readonly status?: string;
    readonly progress_percent?: number;
    readonly completed_lesson_ids?: readonly string[];
    readonly completed_at?: string | null;
}

/** Lições completadas de uma matrícula (dedup, ordem irrelevante). */
function _completedIds(enr: EnrollmentLike | null | undefined): string[] {
    const raw = Array.isArray(enr?.completed_lesson_ids) ? enr!.completed_lesson_ids : [];
    return [...new Set(raw.filter((id) => typeof id === 'string' && id))];
}

function _isPaidCourse(course: any): boolean {
    const pricing = course?.pricing;
    if (pricing && typeof pricing === 'object') {
        if (pricing.is_paid === true || pricing.isPaid === true) return true;
        const priceCents = Number(pricing.price_cents ?? pricing.priceCents ?? 0);
        if (Number.isFinite(priceCents) && priceCents > 0) return true;
    }
    const priceCents = Number(course?.price_cents ?? course?.priceCents ?? 0);
    return Number.isFinite(priceCents) && priceCents > 0;
}

/**
 * Resolve a próxima lição não-completada de um training (ordem do seed).
 * @returns SeedLesson | null (null = todas concluídas ou training inexistente)
 */
export function resolveNextLesson(trainingId: string, completedLessonIds: readonly string[] = []) {
    const done = new Set(completedLessonIds);
    const lessons = getLessonsForTraining(trainingId);
    return lessons.find((l) => !done.has(l.id)) || null;
}

/**
 * Catalog view — cards de cursos disponíveis (apenas publicados/grátis no MVP).
 * Shape consumido por trainingPanel._renderCatalog.
 *
 * TRAINING-LEARNER-MIN-001 RF-2: quando `enrollments` é fornecido, cada card
 * ganha `enrolled` + `enrollment_progress` para o CTA refletir o estado real
 * ("Inscrever grátis" nunca aparece para curso já inscrito).
 */
export function buildCatalogView(
    catalog: readonly any[] = getCatalogSeed(),
    enrollments: readonly EnrollmentLike[] = [],
): readonly any[] {
    const byTrainingId = new Map(
        (Array.isArray(enrollments) ? enrollments : [])
            .filter((enr) => enr && typeof enr.training_id === 'string')
            .map((enr) => [enr.training_id, enr] as const),
    );
    return Object.freeze(
        (catalog || [])
            .filter((tr) => evaluateFreeEnrollment(tr).allowed && !_isPaidCourse(tr))
            .map((tr) => {
                const enr = byTrainingId.get(tr.id) || null;
                const totalLessons = Array.isArray(tr.lessons) ? tr.lessons.length : 0;
                const completedCount = enr ? _completedIds(enr).length : 0;
                return Object.freeze({
                    id: tr.id,
                    title: tr.title,
                    description: tr.description,
                    pricing_label: 'free',
                    pricing_type: tr.pricing_type || 'free',
                    difficulty: tr.difficulty,
                    estimated_hours: tr.estimated_hours,
                    content_types: Array.isArray(tr.content_types) ? [...tr.content_types] : [],
                    lessons_count: totalLessons,
                    enrolled: !!enr,
                    enrollment_status: enr ? enr.status || 'active' : null,
                    enrollment_progress:
                        enr && totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0,
                });
            }),
    );
}

/**
 * Created-courses view — cursos criados pelo professor, separados do catálogo do aluno.
 * Shape consumido pela aba "Meus cursos" / "Criados por mim" no Training.
 */
export function buildCreatedCoursesView(createdCourses: readonly any[] = []): readonly any[] {
    return Object.freeze(
        (Array.isArray(createdCourses) ? createdCourses : []).map((course) => {
            const isPaid = _isPaidCourse(course);
            return Object.freeze({
                id: course.id,
                title: course.title || 'Curso sem título',
                description: course.description || '',
                status: course.status || 'draft',
                pricing_label: isPaid ? 'paid' : 'free',
                pricing_type: isPaid ? 'paid' : course.pricing_type || course.pricingType || 'free',
                difficulty: course.difficulty || null,
                estimated_hours: course.estimated_hours ?? course.estimatedHours ?? null,
                lessons_count: Array.isArray(course.lessons) ? course.lessons.length : 0,
                updatedAt: course.updatedAt || course.updated_at || null,
                updated_at: course.updated_at || course.updatedAt || null,
            });
        }),
    );
}

/**
 * My-courses view — matrículas do usuário com progresso e próxima lição.
 * Junta enrollments (do storage) ao seed para título/provider/total de lições.
 * Shape consumido por trainingPanel._renderMyCourses.
 */
export function buildMyCoursesView(input: {
    enrollments?: readonly EnrollmentLike[];
    catalog?: readonly any[];
}): readonly any[] {
    const enrollments = Array.isArray(input?.enrollments) ? input.enrollments : [];
    return Object.freeze(
        enrollments
            .map((enr) => {
                const training = getTrainingById(enr.training_id);
                if (!training) return null; // matrícula órfã (curso removido do seed)
                const completed = _completedIds(enr);
                const totalIds = listLessonIds(enr.training_id);
                const prog = computeLessonProgress({ completedLessonIds: completed, totalLessons: totalIds.length });
                const next = resolveNextLesson(enr.training_id, completed);
                // TRAINING-LEARNER-MIN-001 RF-7: trilha com check por lição +
                // contador N/M pintados no card (progresso na trilha, não em dashboard).
                const doneSet = new Set(completed);
                const lessons = getLessonsForTraining(enr.training_id).map((lesson) =>
                    Object.freeze({ id: lesson.id, title: lesson.title, completed: doneSet.has(lesson.id) }),
                );
                return Object.freeze({
                    id: enr.training_id,
                    training_id: enr.training_id,
                    title: training.title,
                    provider: training.provider,
                    status: enr.status || (prog.complete ? 'completed' : 'active'),
                    progress_percent: prog.progress_percent,
                    next_lesson: next ? next.title : null,
                    next_lesson_id: next ? next.id : null,
                    completed: prog.complete,
                    completed_count: completed.length,
                    total_lessons: totalIds.length,
                    lessons,
                });
            })
            .filter(Boolean),
    );
}

/**
 * Certificates view — pass-through normalizado para o painel.
 * O quizEngine já produz o payload do certificado; aqui só garantimos o
 * shape mínimo que _renderCertificates espera.
 */
export function buildCertificatesView(certificates: readonly any[] = []): readonly any[] {
    return Object.freeze(
        (Array.isArray(certificates) ? certificates : []).map((c) =>
            Object.freeze({
                id: c.id || c.certificate_id,
                certificate_id: c.certificate_id || c.id,
                training_title: c.training_title || c.title || null,
                learner_name: c.learner_name || null,
                score: c.score ?? null,
                issued_at: c.issued_at || c.completion_date || null,
            }),
        ),
    );
}

/**
 * Monta o objeto completo para setTrainingPanelData a partir do estado.
 * @param input.enrollments matrículas carregadas do storage
 * @param input.certificates certificados emitidos
 * @param input.catalog override do catálogo (default: seed)
 */
export function buildPanelData(input: {
    enrollments?: readonly EnrollmentLike[];
    certificates?: readonly any[];
    catalog?: readonly any[];
    createdCourses?: readonly any[];
} = {}): {
    myCourses: readonly any[];
    createdCourses: readonly any[];
    creatorCourses: readonly any[];
    catalog: readonly any[];
    certificates: readonly any[];
} {
    const catalog = input.catalog || getCatalogSeed();
    const createdCourses = buildCreatedCoursesView(input.createdCourses);
    return {
        myCourses: buildMyCoursesView({ ...(input.enrollments ? { enrollments: input.enrollments } : {}), catalog }),
        createdCourses,
        creatorCourses: createdCourses,
        catalog: buildCatalogView(catalog, input.enrollments || []),
        certificates: buildCertificatesView(input.certificates),
    };
}
