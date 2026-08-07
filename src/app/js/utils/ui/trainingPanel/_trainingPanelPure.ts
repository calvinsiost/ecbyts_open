// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// Pure-logic extraction from utils/ui/trainingPanel/trainingPanel.ts
// (screen training/panel).
//
// Strategy: lift the DOM-free data normalization / derivation / aggregation out
// of the stateful panel module. Pure: zero document/window/_state/i18n refs —
// inputs in, plain values out. The renderers/handlers keep the side effects.
// Typed without `any` so the host file can shed its `any` density.

/** A training course/certificate row — only the fields the pure logic reads. */
export interface TrainingItem {
    readonly id?: string | number | null;
    readonly training_id?: string | number | null;
    readonly certificate_id?: string | number | null;
    readonly status?: string | null;
    readonly progress_percent?: number | string | null;
    readonly progress?: number | string | null;
    readonly updated_at?: string | null;
    readonly updatedAt?: string | null;
    readonly created_at?: string | null;
    readonly createdAt?: string | null;
    readonly [key: string]: unknown;
}

/** Loose input shape accepted by {@link normalizeTrainingPanelData}. */
export interface TrainingPanelDataInput {
    readonly myCourses?: unknown;
    readonly enrollments?: unknown;
    readonly createdCourses?: unknown;
    readonly creatorCourses?: unknown;
    readonly authoredCourses?: unknown;
    readonly catalog?: unknown;
    readonly trainings?: unknown;
    readonly certificates?: unknown;
}

/** Normalized panel state shape held by the host module. */
export interface TrainingPanelState {
    readonly myCourses: TrainingItem[];
    readonly createdCourses: TrainingItem[];
    readonly catalog: TrainingItem[];
    readonly certificates: TrainingItem[];
    readonly creatorCourses: TrainingItem[];
}

/**
 * Keep only the well-formed object rows of a list, byte-identical to the inline
 * `_normalizeItems` previously in trainingPanel.ts:
 *   - non-array input → `[]`;
 *   - otherwise keep entries that are truthy AND `typeof === 'object'`
 *     (drops `null`, primitives, and functions).
 *
 * @param items raw list (any value)
 * @returns the filtered object rows (fresh array)
 */
export function normalizeTrainingItems(items: unknown): TrainingItem[] {
    return Array.isArray(items)
        ? (items.filter((item): item is TrainingItem => Boolean(item) && typeof item === 'object') as TrainingItem[])
        : [];
}

/**
 * Build the normalized panel state, byte-identical to the inline
 * `_normalizePanelData` previously in trainingPanel.ts:
 *   - `createdCourses` resolves from `createdCourses || creatorCourses ||
 *     authoredCourses` and is mirrored onto `creatorCourses`;
 *   - `myCourses` from `myCourses || enrollments`;
 *   - `catalog` from `catalog || trainings`;
 *   - `certificates` from `certificates`.
 * Each branch runs through {@link normalizeTrainingItems}.
 *
 * @param data loose panel data (defaults to `{}`)
 * @returns a fresh, normalized state object
 */
export function normalizeTrainingPanelData(data: TrainingPanelDataInput = {}): TrainingPanelState {
    const createdCourses = normalizeTrainingItems(
        data.createdCourses || data.creatorCourses || data.authoredCourses,
    );
    return {
        myCourses: normalizeTrainingItems(data.myCourses || data.enrollments),
        createdCourses,
        catalog: normalizeTrainingItems(data.catalog || data.trainings),
        certificates: normalizeTrainingItems(data.certificates),
        creatorCourses: createdCourses,
    };
}

/**
 * Clamp an arbitrary value to an integer percent in `[0, 100]`, byte-identical
 * to the inline `_coercePercent` previously in trainingPanel.ts:
 *   - non-finite `Number(value)` → `0`;
 *   - otherwise `clamp(round(n), 0, 100)`.
 *
 * @param value any value coercible to a number
 * @returns integer percent in `[0, 100]`
 */
export function coercePercent(value: unknown): number {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Normalize a course status into a CSS-class-safe key, byte-identical to the
 * inline `_statusKey` previously in trainingPanel.ts:
 *   - falsy status → `'draft'`;
 *   - lowercased, trimmed, non-`[a-z0-9_-]` runs collapsed to `-`;
 *   - empty result → `'draft'`.
 *
 * @param status raw status (any value)
 * @returns slug suitable for a CSS class / data attribute
 */
export function statusKey(status: unknown): string {
    const normalized = String(status || 'draft')
        .trim()
        .toLowerCase();
    return normalized.replace(/[^a-z0-9_-]+/g, '-') || 'draft';
}

/**
 * Resolve the comparable timestamp of a created course, byte-identical to the
 * inline `_createdCourseTimestamp` previously in trainingPanel.ts:
 *   - prefers `updated_at || updatedAt || created_at || createdAt`;
 *   - `Date.parse` the string; non-finite → `0`.
 *
 * @param course a created-course row (or nullish)
 * @returns epoch millis, or `0` when unparseable
 */
export function createdCourseTimestamp(course: TrainingItem | null | undefined): number {
    const raw = course?.updated_at || course?.updatedAt || course?.created_at || course?.createdAt || '';
    const timestamp = Date.parse(String(raw || ''));
    return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * Sort created courses most-recent-first for the teacher view, byte-identical to
 * the inline `_sortCreatedCoursesForTeacher` previously in trainingPanel.ts:
 *   1. normalize the rows ({@link normalizeTrainingItems});
 *   2. decorate with `{ course, index, timestamp }`
 *      ({@link createdCourseTimestamp});
 *   3. sort by `timestamp` desc, ties broken by original `index` asc (stable);
 *   4. project back to the course rows.
 *
 * @param courses raw created-course list
 * @returns a fresh array ordered newest-first
 */
export function sortCreatedCoursesForTeacher(courses: unknown): TrainingItem[] {
    return normalizeTrainingItems(courses)
        .map((course, index) => ({ course, index, timestamp: createdCourseTimestamp(course) }))
        .sort((left, right) => right.timestamp - left.timestamp || left.index - right.index)
        .map((entry) => entry.course);
}

/** Draft/ready tallies for the teacher workspace guide. */
export interface TeacherWorkspaceCounts {
    readonly draftCount: number;
    readonly readyCount: number;
}

/**
 * Tally drafts vs. ready (published/active) courses, byte-identical to the inline
 * `.filter(...).length` pair previously in `_renderTeacherWorkspaceGuide`:
 *   - `draftCount` = courses whose {@link statusKey} is `'draft'`;
 *   - `readyCount` = courses whose {@link statusKey} is `'published'` or
 *     `'active'`.
 * A single pass replaces the two filters (lower cognitive load, same counts).
 *
 * @param courses already-sorted created courses
 * @returns `{ draftCount, readyCount }`
 */
export function countTeacherWorkspace(courses: readonly TrainingItem[]): TeacherWorkspaceCounts {
    let draftCount = 0;
    let readyCount = 0;
    for (const course of courses) {
        const status = statusKey(course.status);
        if (status === 'draft') draftCount++;
        else if (status === 'published' || status === 'active') readyCount++;
    }
    return { draftCount, readyCount };
}

/**
 * Format a date value into the short locale string used on teacher cards,
 * byte-identical to the inline `_shortDate` previously in trainingPanel.ts:
 *   - falsy / blank → `''`;
 *   - valid `Date` → `toLocaleDateString(undefined, {day,month,year:'2-digit'})`,
 *     falling back to `raw.slice(0, 10)` if `toLocaleDateString` throws;
 *   - unparseable → `raw.slice(0, 24)`.
 *
 * Pure modulo the host's locale/timezone (same ambient the inline code used).
 *
 * @param value any date-ish value
 * @returns a short date string (possibly empty)
 */
export function shortDate(value: unknown): string {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
        try {
            return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' });
        } catch {
            return raw.slice(0, 10);
        }
    }
    return raw.slice(0, 24);
}

Object.freeze(normalizeTrainingItems);
Object.freeze(normalizeTrainingPanelData);
Object.freeze(coercePercent);
Object.freeze(statusKey);
Object.freeze(createdCourseTimestamp);
Object.freeze(sortCreatedCoursesForTeacher);
Object.freeze(countTeacherWorkspace);
Object.freeze(shortDate);
