// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { normalizeTrainingPanelItems, type TrainingItemRecord } from './trainingPanelRenderPrimitives.js';
import type { LmsHintSeenRecord } from '../../../core/training/_lmsHintsSeenPure.js';

export type { TrainingItemRecord } from './trainingPanelRenderPrimitives.js';
export type TrainingTabId = 'myCourses' | 'createdCourses' | 'catalog' | 'certificates';

export interface TrainingPanelState {
    myCourses: TrainingItemRecord[];
    createdCourses: TrainingItemRecord[];
    catalog: TrainingItemRecord[];
    certificates: TrainingItemRecord[];
    creatorCourses: TrainingItemRecord[];
    /** T8.2: dicas de intenção (T8.1) já vistas, para a seção "Dicas que você
     *  já viu" na aba Aprender. Pass-through (shape próprio, não é um
     *  TrainingItemRecord) — sempre um array, nunca undefined. */
    hintsSeen: LmsHintSeenRecord[];
}

export interface TrainingTabDefinition {
    readonly id: TrainingTabId;
    readonly i18nKey: string;
    readonly fallback: string;
}

export interface TrainingPanelDataInput extends Record<string, unknown> {
    readonly myCourses?: unknown;
    readonly createdCourses?: unknown;
    readonly creatorCourses?: unknown;
    readonly authoredCourses?: unknown;
    readonly enrollments?: unknown;
    readonly catalog?: unknown;
    readonly trainings?: unknown;
    readonly certificates?: unknown;
    readonly hintsSeen?: unknown;
}

export const TRAINING_PANEL_TABS: readonly TrainingTabDefinition[] = Object.freeze([
    { id: 'myCourses', i18nKey: 'trainingPanel.learningTab', fallback: 'Learning' },
    { id: 'createdCourses', i18nKey: 'trainingPanel.createdCoursesTab', fallback: 'Saved classes' },
    { id: 'catalog', i18nKey: 'trainingPanel.catalogTab', fallback: 'Catalog' },
    { id: 'certificates', i18nKey: 'trainingPanel.certificatesTab', fallback: 'Certificates' },
]);

// ----------------------------------------------------------------
// TRAINING-LEARNER-MIN-001 RF-5 — separação de personas.
// Aluno vê 2 seções ("Aprender" + "Certificados"); o catálogo fica a 1 clique
// atrás do link "Ver todos os treinamentos" (sub-visão de Aprender) e a aba do
// professor ("Aulas salvas") só aparece com o switch "Modo instrutor" ligado
// (persistido em localStorage — decisão Calvin 2026-07-01, sem papel Supabase).
// ----------------------------------------------------------------
const INSTRUCTOR_MODE_KEY = 'ecbyts-lms-instructor-mode';

export function isInstructorModeEnabled(): boolean {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(INSTRUCTOR_MODE_KEY) === '1';
    } catch (error) {
        console.debug('[trainingPanel] isInstructorModeEnabled:', error instanceof Error ? error.message : error);
        return false;
    }
}

export function setInstructorModeEnabled(enabled: boolean): void {
    try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(INSTRUCTOR_MODE_KEY, enabled ? '1' : '0');
    } catch (error) {
        // Storage indisponível (private mode) — o modo vale só para a sessão.
        console.debug('[trainingPanel] setInstructorModeEnabled:', error instanceof Error ? error.message : error);
    }
}

/**
 * Abas visíveis no tablist conforme a persona ativa:
 * - aluno (default): `myCourses` + `certificates` (catálogo é sub-visão);
 * - instrutor (switch on): todas as abas, incluindo "Aulas salvas" e "Catálogo".
 */
export function visibleTrainingTabs(instructorMode: boolean = isInstructorModeEnabled()): readonly TrainingTabDefinition[] {
    if (instructorMode) return TRAINING_PANEL_TABS;
    return TRAINING_PANEL_TABS.filter((tab) => tab.id === 'myCourses' || tab.id === 'certificates');
}

export function normalizeTrainingPanelData(data: TrainingPanelDataInput = {}): TrainingPanelState {
    const createdCourses = normalizeTrainingPanelItems(
        data.createdCourses || data.creatorCourses || data.authoredCourses,
    );
    return {
        myCourses: normalizeTrainingPanelItems(data.myCourses || data.enrollments),
        createdCourses,
        catalog: normalizeTrainingPanelItems(data.catalog || data.trainings),
        certificates: normalizeTrainingPanelItems(data.certificates),
        creatorCourses: createdCourses,
        hintsSeen: Array.isArray(data.hintsSeen) ? (data.hintsSeen as LmsHintSeenRecord[]) : [],
    };
}

export function cloneTrainingPanelState(state: TrainingPanelState): TrainingPanelState {
    return {
        myCourses: [...state.myCourses],
        createdCourses: [...state.createdCourses],
        catalog: [...state.catalog],
        certificates: [...state.certificates],
        creatorCourses: [...state.createdCourses],
        hintsSeen: [...(state.hintsSeen || [])],
    };
}

export function isTrainingTabId(tabId: unknown): tabId is TrainingTabId {
    return TRAINING_PANEL_TABS.some((tab) => tab.id === tabId);
}
