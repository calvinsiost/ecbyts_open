// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import {
    normalizeTrainingPanelItems,
    trainingPanelLabel,
    type TrainingItemRecord,
} from './trainingPanelRenderPrimitives.js';

export type { TrainingItemRecord } from './trainingPanelRenderPrimitives.js';

export interface TrainingPanelState {
    readonly createdCourses: readonly TrainingItemRecord[];
}

export const TEACHER_JOURNEY_STEPS = Object.freeze([
    {
        titleKey: 'trainingPanel.teacherJourney.step1.title',
        textKey: 'trainingPanel.teacherJourney.step1.text',
        titleFallback: 'Open file or class',
        textFallback: 'Open a saved ECBT class file from your computer or start a new class.',
    },
    {
        titleKey: 'trainingPanel.teacherJourney.step2.title',
        textKey: 'trainingPanel.teacherJourney.step2.text',
        titleFallback: 'Review the material',
        textFallback: 'Check title, description, lessons, slides, and what students will see.',
    },
    {
        titleKey: 'trainingPanel.teacherJourney.step3.title',
        textKey: 'trainingPanel.teacherJourney.step3.text',
        titleFallback: 'Connect files',
        textFallback: 'Keep slide images, videos, and supporting files visible in Files.',
    },
    {
        titleKey: 'trainingPanel.teacherJourney.step4.title',
        textKey: 'trainingPanel.teacherJourney.step4.text',
        titleFallback: 'Open and present',
        textFallback: 'Open the class view and test links to app modules before class.',
    },
    {
        titleKey: 'trainingPanel.teacherJourney.step5.title',
        textKey: 'trainingPanel.teacherJourney.step5.text',
        titleFallback: 'Publish or share',
        textFallback: 'Publish for learners or share the complete ECBT class key.',
    },
]);

export function createdCourseTimestamp(course: TrainingItemRecord): number {
    const raw = course?.updated_at || course?.updatedAt || course?.created_at || course?.createdAt || '';
    const timestamp = Date.parse(String(raw || ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortCreatedCoursesForTeacher(courses: unknown): TrainingItemRecord[] {
    return normalizeTrainingPanelItems(courses)
        .map((course, index) => ({ course, index, timestamp: createdCourseTimestamp(course) }))
        .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
        .map((entry) => entry.course);
}

export function teacherCourseNextStep(key: string): string {
    if (key === 'published' || key === 'active') {
        return trainingPanelLabel(
            'trainingPanel.teacherCourseNextPublished',
            'Ready course - present in teacher mode or share it with learners.',
        );
    }
    if (key === 'archived') {
        return trainingPanelLabel(
            'trainingPanel.teacherCourseNextArchived',
            'Archived course - use Edit only if you need to reuse it.',
        );
    }
    return trainingPanelLabel(
        'trainingPanel.teacherCourseNextDraft',
        'Saved draft - present directly, or use Edit details to review it first.',
    );
}
