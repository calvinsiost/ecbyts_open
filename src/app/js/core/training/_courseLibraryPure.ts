// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   TRAINING ↔ LIBRARY MARKETPLACE BRIDGE (F6 — SPEC_TRAINING_MODULE_LMS)
   ================================================================
   Calvin 2026-06-14: "os cursos individuais devem poder ser ofertados e
   comprados em libraries".

   Converte os cursos do catálogo LMS (lmsContent) em entradas do Library
   Marketplace — mesmo molde de buildAnalyticsLibraryEntries(): cada curso
   vira UM item de catálogo com kind 'course', preço (gratuito por padrão) e
   um link trainingId para a ação "Obter curso" matricular o usuário no LMS.

   PURE: sem IO, sem DOM. Consumido por utils/libraries/marketplace.ts.
   ================================================================ */

import { getCatalogSeed } from './lmsContent.js';

export interface CourseLibraryEntry {
    readonly ecbytsLibrary: string;
    readonly id: string;
    readonly library_id: string;
    readonly name: string;
    readonly version: string;
    readonly author: { readonly name: string };
    readonly description: string;
    readonly license: string;
    readonly icon: string;
    /** roteia o card para o renderer de curso (vs artifact/capability). */
    readonly kind: 'course';
    /** link para o curso LMS — usado por handleGetCourse para matricular. */
    readonly trainingId: string;
    readonly is_paid: boolean;
    readonly price_cents: number;
    readonly currency: string;
    readonly tags: readonly string[];
    readonly difficulty: string;
    readonly estimated_hours: number;
    readonly lessons_count: number;
    readonly contents: { readonly course: { readonly trainingId: string; readonly lessons: number } };
}

/**
 * Constrói as entradas de marketplace para todos os cursos do catálogo LMS.
 * Cursos gratuitos (default) recebem is_paid=false/price_cents=0.
 * @returns {CourseLibraryEntry[]}
 */
export function buildCourseLibraryEntries(): CourseLibraryEntry[] {
    return getCatalogSeed().map((course) => {
        const priceCents = Math.max(0, Math.round(Number(course.price_cents) || 0));
        const isPaid = !!course.is_paid && priceCents > 0;
        const lessons = Array.isArray(course.lessons) ? course.lessons.length : 0;
        return Object.freeze({
            ecbytsLibrary: '1.0.0',
            id: `course-${course.id}`,
            library_id: `course-${course.id}`,
            name: course.title,
            version: '1.0.0',
            author: { name: course.provider || 'ecbyts' },
            description: course.description,
            license: 'proprietary',
            icon: 'book-open',
            kind: 'course' as const,
            trainingId: course.id,
            is_paid: isPaid,
            price_cents: priceCents,
            currency: 'brl',
            tags: Object.freeze(
                ['curso', 'treinamento', course.category, course.difficulty].filter(Boolean) as string[],
            ),
            difficulty: course.difficulty,
            estimated_hours: course.estimated_hours,
            lessons_count: lessons,
            contents: Object.freeze({ course: Object.freeze({ trainingId: course.id, lessons }) }),
        });
    });
}

/** Resolve o trainingId a partir do id da entrada de curso (`course-<id>`). */
export function trainingIdFromLibraryId(libraryId: unknown): string | null {
    if (typeof libraryId !== 'string') return null;
    return libraryId.startsWith('course-') ? libraryId.slice('course-'.length) : null;
}
