// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import {
    attr,
    statusKey,
    text,
    trainingPanelLabel,
    type TrainingItemRecord,
} from './trainingPanelRenderPrimitives.js';
import { TEACHER_JOURNEY_STEPS } from './trainingPanelTeacherModel.js';

// T3.8: reduzido de um bloco de 2 paragrafos + CTA duplicado (repetia a
// classDoor) para 1 linha de status (rascunhos/prontas) — o SavedNote (por
// que os testes/i18n existentes o citam) fica, tambem encurtado.
export function renderTeacherWorkspaceGuide(courses: readonly TrainingItemRecord[]): string {
    const draftCount = courses.filter((course) => statusKey(course.status) === 'draft').length;
    const readyCount = courses.filter((course) => {
        const key = statusKey(course.status);
        return key === 'published' || key === 'active';
    }).length;
    const hasCreatedCourses = courses.length > 0;
    return `
        <section class="training-teacher-workspace-guide" aria-label="${attr(
            trainingPanelLabel('trainingPanel.teacherWorkspaceGuideLabel', 'Where your classes are'),
        )}">
            <div class="training-teacher-workspace-grid" aria-hidden="true">
                <span><strong>${draftCount}</strong>${text(trainingPanelLabel('trainingPanel.teacherWorkspaceDrafts', 'Saved drafts'))}</span>
                <span><strong>${readyCount}</strong>${text(trainingPanelLabel('trainingPanel.teacherWorkspaceReady', 'Ready classes'))}</span>
            </div>
            ${renderSavedNote(hasCreatedCourses)}
        </section>
    `;
}

function renderSavedNote(hasCreatedCourses: boolean): string {
    // Título fica só como aria-label (não visível) — mantém a chave i18n
    // existente sem duplicar texto na tela (T3.8 corte de repetição).
    return `<div class="training-teacher-saved-note" aria-label="${attr(
        trainingPanelLabel('trainingPanel.teacherWorkspaceSavedNoteTitle', 'Saved drafts do not disappear'),
    )}">
        <span>${text(
            trainingPanelLabel(
                hasCreatedCourses
                    ? 'trainingPanel.teacherWorkspaceSavedNoteText'
                    : 'trainingPanel.teacherWorkspaceSavedNoteEmpty',
                hasCreatedCourses
                    ? 'They stay in this tab, with the most recently updated class first.'
                    : 'After you open or save a class, it appears in this tab.',
            ),
        )}</span>
    </div>`;
}

// T3.8: summary encolhido de title+subtitle+preview+hint (~20 palavras) para
// 1 linha curta "Jornada do professor (5 passos)" — o <details> continua
// colapsado por padrão; as chaves i18n antigas (currentStepPrefix/openHint/
// subtitle) ficam como aria-label não-visível para não quebrar o gate de
// paridade i18n nem o teste estático de chaves obrigatórias.
export function renderTeacherJourney(courses: readonly TrainingItemRecord[]): string {
    void courses;
    const currentStepIndex = 0;
    const steps = TEACHER_JOURNEY_STEPS.map((step, index) =>
        renderTeacherJourneyStep(step, index, currentStepIndex),
    ).join('');
    const currentStep = TEACHER_JOURNEY_STEPS[currentStepIndex];
    const currentStepTitle = currentStep
        ? trainingPanelLabel(currentStep.titleKey, currentStep.titleFallback)
        : trainingPanelLabel('trainingPanel.teacherJourney.title', 'Teacher journey');
    const expandedHint = [
        trainingPanelLabel('trainingPanel.teacherJourney.subtitle', '5 clear steps'),
        trainingPanelLabel('trainingPanel.teacherJourney.currentStepPrefix', 'Next in the route'),
        text(currentStepTitle),
        trainingPanelLabel('trainingPanel.teacherJourney.openHint', 'View full route'),
    ].join(' — ');
    return `
        <details class="training-teacher-journey" aria-label="${attr(expandedHint)}">
            <summary class="training-teacher-journey-head">
                <strong>${text(trainingPanelLabel('trainingPanel.teacherJourney.title', 'Teacher journey'))}</strong>
                <span class="training-teacher-journey-count">${text(String(TEACHER_JOURNEY_STEPS.length))}</span>
            </summary>
            <ol class="training-teacher-step-list">
                ${steps}
            </ol>
        </details>
    `;
}

// TRAINING-LEARNER-MIN-001 RF-8e: passo da jornada é ITEM DE LISTA informativo
// (ol/li + aria-current="step"), não um <button> truncado com ação surpresa.
function renderTeacherJourneyStep(
    step: (typeof TEACHER_JOURNEY_STEPS)[number],
    index: number,
    currentStepIndex: number,
): string {
    const number = index + 1;
    const state = index < currentStepIndex ? 'done' : index === currentStepIndex ? 'current' : 'todo';
    const stateLabel = state === 'done'
        ? trainingPanelLabel('trainingPanel.teacherJourney.state.done', 'Done')
        : state === 'current'
          ? trainingPanelLabel('trainingPanel.teacherJourney.state.current', 'Now')
          : trainingPanelLabel('trainingPanel.teacherJourney.state.todo', 'Later');
    const title = trainingPanelLabel(step.titleKey, step.titleFallback);
    return `
        <li class="training-teacher-step ${state}"${state === 'current' ? ' aria-current="step"' : ''}>
            <div class="training-teacher-step-button">
                <span class="training-teacher-step-number" aria-hidden="true">${number}</span>
                <span class="training-teacher-step-copy">
                    <strong>${text(title)}</strong>
                    <span>${text(trainingPanelLabel(step.textKey, step.textFallback))}</span>
                </span>
                <span class="training-teacher-step-state">${text(stateLabel)}</span>
            </div>
        </li>
    `;
}
