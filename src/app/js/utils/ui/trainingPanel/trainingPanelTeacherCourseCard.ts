// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import {
    attr,
    difficultyLabel,
    formatMeta,
    itemId,
    lessonCountLabel,
    renderActionButton,
    shortDate,
    statusLabel,
    statusKey,
    text,
    trainingPanelLabel,
    type TrainingItemRecord,
} from './trainingPanelRenderPrimitives.js';
import { teacherCourseNextStep } from './trainingPanelTeacherModel.js';

function courseLessonCount(course: TrainingItemRecord): number {
    const lessons = Array.isArray(course.lessons) ? course.lessons.length : 0;
    return Number(course.lessons_count ?? course.lessonCount ?? lessons);
}

function latestBadge(index: number, courses: readonly TrainingItemRecord[]): string {
    if (index !== 0 || courses.length <= 1) return '';
    return `<span class="training-pill training-pill--latest">
        ${text(trainingPanelLabel('trainingPanel.teacherCourseLatest', 'Most recent'))}
    </span>`;
}

function courseUpdatedDate(course: TrainingItemRecord): string {
    const value = course.updated_at || course.updatedAt || course.created_at || course.createdAt;
    const date = shortDate(value);
    if (!date) return '';
    return `${text(trainingPanelLabel('trainingPanel.updatedLabel', 'Updated'))}: ${text(date)}`;
}

function courseBadgeRow(status: string, index: number, courses: readonly TrainingItemRecord[]): string {
    const key = statusKey(status);
    return `<span class="training-card-badges">
        <span class="training-pill training-pill--file">${text(
            trainingPanelLabel('trainingPanel.savedClassFileBadge', 'Class file'),
        )}</span>
        <span class="training-pill training-pill--${attr(key)}">${text(statusLabel(status))}</span>
        ${latestBadge(index, courses)}
    </span>`;
}

function courseMainBody(course: TrainingItemRecord, title: string, lessons: number, key: string): string {
    return `<h3>${text(title)}</h3>
        ${course.description ? `<p>${text(course.description)}</p>` : ''}
        ${formatMeta([lessonCountLabel(lessons), difficultyLabel(course.difficulty), course.category])}
        <span class="training-card-open-hint">${text(
            trainingPanelLabel('trainingPanel.openVisualClassHint', 'Click Open class to access the saved class file.'),
        )}</span>
        <div class="training-card-next-step">
            <span>${text(trainingPanelLabel('trainingPanel.teacherCourseNextLabel', 'Next step'))}</span>
            <strong>${text(teacherCourseNextStep(key))}</strong>
        </div>`;
}

export function renderCreatedCourseCard(
    course: TrainingItemRecord,
    index: number,
    courses: readonly TrainingItemRecord[],
): string {
    const id = itemId(course, `created-course-${index}`);
    const lessons = courseLessonCount(course);
    const status = String(course.status || 'draft');
    const key = statusKey(status);
    const title = course.title || trainingPanelLabel('trainingPanel.untitledCourse', 'Untitled course');
    return `<article class="training-course-card creator status-${attr(key)}"
        data-training-course-id="${attr(id)}" data-training-status="${attr(key)}">
        <div class="training-course-card-main status-${attr(key)}" role="button" tabindex="0"
            data-training-action="edit" data-training-id="${attr(id)}"
            aria-label="${attr(`${trainingPanelLabel('trainingPanel.action.prepareClass', 'Open class')}: ${title}`)}">
            <div class="training-card-topline">
                ${courseBadgeRow(status, index, courses)}
                <span>${courseUpdatedDate(course)}</span>
            </div>
            ${courseMainBody(course, String(title), lessons, key)}
        </div>
        <div class="training-card-actions">
            ${renderActionButton(
                'edit',
                id,
                trainingPanelLabel('trainingPanel.action.prepareClass', 'Open class'),
                // TRAINING-LEARNER-MIN-001 RF-4: 1 CTA preenchido por visão (class door).
                'secondary training-action-btn--open-class',
            )}
            ${renderActionButton(
                'start-class',
                id,
                trainingPanelLabel('trainingPanel.action.openVisualClass', 'Present'),
                'secondary',
            )}
        </div>
    </article>`;
}
