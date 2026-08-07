// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import type { CourseDraft, LessonDraft } from '../../core/training/_courseAuthoringPure.js';
import {
    getIntroModule01SlidePlan,
    inferIntroModule01SlideIndex,
    isIntroModule01CourseTitle,
} from '../../core/training/teachingModelIntroModule01.js';

/**
 * T3.6: deck-first agora e o layout DEFAULT assim que o curso tem >=1 licao
 * (antes exigia draft do Modulo 01 introdutorio OU >=24 licoes — professor comum com poucos
 * slides caia no formulario monolitico de 8 campos + 10 botoes no rodape).
 */
export const DECK_WORKBENCH_MIN_LESSONS = 1;
/** Evita que uma aula longa vire uma parede de botoes numerados. */
export const DECK_WORKBENCH_VISIBLE_SLIDES = 7;

export interface DeckWorkbenchSlide {
    lesson: LessonDraft;
    lessonIndex: number;
    displayNumber: number;
    modelSlideNumber: number;
    title: string;
    typeLabel: string;
    hasPlan: boolean;
    isPreviewable: boolean;
    statusLabel: string;
    statusTone: 'planned' | 'ready' | 'needs-work';
}

export interface DeckEditableSlideElement {
    id?: string;
    type?: string;
    kind?: string;
    label?: string;
    text?: string;
    bounds?: { x?: unknown; y?: unknown; w?: unknown; h?: unknown };
    x?: unknown;
    y?: unknown;
    w?: unknown;
    h?: unknown;
    needsPositionReview?: boolean;
}

export interface DeckWorkbenchSlideOptions {
    readonly lessonTypeLabel: (type: LessonDraft['type']) => string;
    readonly untitledLessonLabel: string;
}

export interface DeckWorkbenchVisibleSlides {
    readonly slides: readonly DeckWorkbenchSlide[];
    readonly startIndex: number;
    readonly endIndex: number;
    readonly isWindowed: boolean;
}

export interface DeckEditableSelection {
    readonly element: DeckEditableSlideElement;
    readonly index: number;
    readonly id: string;
}

export function isIntroModule01Draft(draft: CourseDraft | null | undefined): boolean {
    if (!draft) return false;
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    const haystack = `${draft.title || ''} ${draft.description || ''} ${draft.category || ''}`;
    return isIntroModule01CourseTitle(haystack) || (lessons.length >= 30 && /dados/i.test(haystack));
}

export function shouldShowDeckWorkbench(draft: CourseDraft): boolean {
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    return lessons.length > 0 && (isIntroModule01Draft(draft) || lessons.length >= DECK_WORKBENCH_MIN_LESSONS);
}

export function isLessonPreviewable(
    lesson: LessonDraft,
    lessonIndex: number,
    isIntroModule01 = false,
): boolean {
    if (!lesson) return false;
    const lessonType = String((lesson as unknown as Record<string, unknown>).type || '');
    if (!['written', 'reading', 'interactive', 'video'].includes(lessonType)) return false;
    if (!isIntroModule01) return true;
    const slideIndex = inferIntroModule01SlideIndex(lesson, lessonIndex + 1);
    return Boolean(getIntroModule01SlidePlan(slideIndex));
}

export function deckWorkbenchSlideFromLesson(
    lesson: LessonDraft,
    lessonIndex: number,
    isIntroModule01: boolean,
    options: DeckWorkbenchSlideOptions,
): DeckWorkbenchSlide {
    const displayNumber = lessonIndex + 1;
    const modelSlideNumber = isIntroModule01 ? inferIntroModule01SlideIndex(lesson, displayNumber) : displayNumber;
    const hasPlan = isIntroModule01 && Boolean(getIntroModule01SlidePlan(modelSlideNumber));
    const previewable = isLessonPreviewable(lesson, lessonIndex, isIntroModule01);
    const statusTone: DeckWorkbenchSlide['statusTone'] = hasPlan ? 'planned' : previewable ? 'ready' : 'needs-work';
    const statusLabel = hasPlan ? 'Plano conectado' : previewable ? 'Apresentavel' : 'Atividade/player';
    return {
        lesson,
        lessonIndex,
        displayNumber,
        modelSlideNumber,
        title: lesson.title || options.untitledLessonLabel,
        typeLabel: options.lessonTypeLabel(lesson.type),
        hasPlan,
        isPreviewable: previewable,
        statusLabel,
        statusTone,
    };
}

export function deckWorkbenchSlides(
    draft: CourseDraft,
    options: DeckWorkbenchSlideOptions,
): DeckWorkbenchSlide[] {
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    const isIntroModule01 = isIntroModule01Draft(draft);
    return lessons.map((lesson, lessonIndex) =>
        deckWorkbenchSlideFromLesson(lesson, lessonIndex, isIntroModule01, options),
    );
}

export function deckWorkbenchCurrentIndex(
    slides: readonly DeckWorkbenchSlide[],
    expandedLessonId: string | null | undefined,
): number {
    if (!slides.length) return -1;
    const expandedIndex = expandedLessonId
        ? slides.findIndex((slide) => slide.lesson.id === expandedLessonId)
        : -1;
    return expandedIndex >= 0 ? expandedIndex : 0;
}

export function deckWorkbenchVisibleSlides(
    slides: readonly DeckWorkbenchSlide[],
    currentIndex: number,
): DeckWorkbenchVisibleSlides {
    if (slides.length <= DECK_WORKBENCH_VISIBLE_SLIDES) {
        return { slides, startIndex: 0, endIndex: Math.max(0, slides.length - 1), isWindowed: false };
    }
    const half = Math.floor(DECK_WORKBENCH_VISIBLE_SLIDES / 2);
    const maxStart = Math.max(0, slides.length - DECK_WORKBENCH_VISIBLE_SLIDES);
    const startIndex = Math.max(0, Math.min(maxStart, currentIndex - half));
    const endIndex = Math.min(slides.length - 1, startIndex + DECK_WORKBENCH_VISIBLE_SLIDES - 1);
    return {
        slides: slides.slice(startIndex, endIndex + 1),
        startIndex,
        endIndex,
        isWindowed: true,
    };
}

export function deckWorkbenchEditableElements(
    slide: DeckWorkbenchSlide | undefined,
): DeckEditableSlideElement[] {
    if (!slide) return [];
    const lesson = slide.lesson as unknown as Record<string, unknown>;
    const editableSlide = lesson.editableSlide as { elements?: unknown } | undefined;
    const slideModel = lesson.slideModel as { elements?: unknown } | undefined;
    const fromEditableSlide = editableSlide?.elements;
    const fromSlideModel = slideModel?.elements;
    const fromEditableElements = lesson.editableElements;
    const elements = Array.isArray(fromEditableSlide)
        ? fromEditableSlide
        : Array.isArray(fromSlideModel)
          ? fromSlideModel
          : Array.isArray(fromEditableElements)
            ? fromEditableElements
            : [];
    return elements.filter((element): element is DeckEditableSlideElement =>
        Boolean(element && typeof element === 'object'),
    );
}

export function deckWorkbenchEditableElementId(element: DeckEditableSlideElement, index: number): string {
    return String(element.id || `element-${index + 1}`);
}

export function deckWorkbenchElementNumber(value: unknown, fallback: number): number {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) return fallback;
    return Math.max(0, Math.min(1, numberValue));
}

export function deckWorkbenchEditableBounds(
    element: DeckEditableSlideElement,
): { x: number; y: number; w: number; h: number } {
    const bounds = element.bounds || element;
    const x = deckWorkbenchElementNumber(bounds.x, 0);
    const y = deckWorkbenchElementNumber(bounds.y, 0);
    const w = Math.max(0.012, deckWorkbenchElementNumber(bounds.w, 0.08));
    const h = Math.max(0.012, deckWorkbenchElementNumber(bounds.h, 0.06));
    return {
        x: Math.min(x, Math.max(0, 1 - w)),
        y: Math.min(y, Math.max(0, 1 - h)),
        w: Math.min(w, 1),
        h: Math.min(h, 1),
    };
}

export function deckWorkbenchEditableElementLabel(element: DeckEditableSlideElement, index: number): string {
    const text = String(element.label || element.text || '').replace(/\s+/g, ' ').trim();
    if (text) return text.length > 70 ? `${text.slice(0, 67)}...` : text;
    return `${element.type || element.kind || 'elemento'} ${index + 1}`;
}

export function deckWorkbenchSelectedEditableElement(
    slide: DeckWorkbenchSlide | undefined,
    selectedId: string | null | undefined,
): DeckEditableSelection | null {
    if (!slide || !selectedId) return null;
    const elements = deckWorkbenchEditableElements(slide);
    for (let index = 0; index < elements.length; index += 1) {
        const element = elements[index];
        if (!element) continue;
        const id = deckWorkbenchEditableElementId(element, index);
        if (id === selectedId) return { element, index, id };
    }
    return null;
}
