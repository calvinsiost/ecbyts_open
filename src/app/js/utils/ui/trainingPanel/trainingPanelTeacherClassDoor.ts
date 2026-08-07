// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import { attr, itemId, renderActionButton, text, trainingPanelLabel, type TrainingItemRecord } from './trainingPanelRenderPrimitives.js';

function classDoorRoute(hasCreatedCourses: boolean): string[] {
    if (hasCreatedCourses) {
        return [
            trainingPanelLabel('trainingPanel.teacherClassDoorRoute1', 'Escolher aula'),
            trainingPanelLabel('trainingPanel.teacherClassDoorRoute2', 'Apresentar'),
            trainingPanelLabel('trainingPanel.teacherClassDoorRoute3', 'Editar se precisar'),
        ];
    }
    return [
        trainingPanelLabel('trainingPanel.teacherClassDoorEmptyRoute1', 'Abrir arquivo'),
        trainingPanelLabel('trainingPanel.teacherClassDoorEmptyRoute2', 'Conferir aula'),
        trainingPanelLabel('trainingPanel.teacherClassDoorEmptyRoute3', 'Apresentar'),
    ];
}

function classDoorHint(hasCreatedCourses: boolean): string {
    if (hasCreatedCourses) {
        return trainingPanelLabel(
            'trainingPanel.teacherClassDoorEditHint',
            'Use Editar detalhes apenas quando precisar alterar a aula.',
        );
    }
    return trainingPanelLabel(
        'trainingPanel.teacherClassDoorEmptyHint',
        'Escolha um arquivo .ecbt do computador; depois ele aparece nesta lista.',
    );
}

// TRAINING-LEARNER-MIN-001 RF-8e: stepper com semântica de lista ordenada —
// <ol>/<li> + aria-current="step" no passo atual (não <button> truncado).
function renderClassDoorRoute(route: readonly string[]): string {
    return route
        .map(
            (step, index) =>
                `<li${index === 0 ? ' aria-current="step"' : ''}><b aria-hidden="true">${index + 1}</b>${text(step)}</li>`,
        )
        .join('');
}

// T3.8: cortado o paragrafo longo (teacherClassDoorText) e o <small> de hint
// (repetiam o que a rota de 3 passos ja diz) — as chaves i18n antigas ficam
// como aria-label (nao-visivel) para nao quebrar o gate de paridade i18n.
export function renderTeacherClassDoor(courses: readonly TrainingItemRecord[]): string {
    const firstCourse = courses[0] || null;
    const hasCreatedCourses = !!firstCourse;
    const firstCourseId = firstCourse ? itemId(firstCourse, 'created-course-0') : '';
    const title = firstCourse?.title || trainingPanelLabel('trainingPanel.teacherClassDoorEmptyTitle', 'Sua proxima aula');
    const ctaAction = hasCreatedCourses ? 'edit' : 'open-class-file';
    const ctaLabel = hasCreatedCourses
        ? trainingPanelLabel('trainingPanel.teacherClassDoorStart', 'Abrir aula')
        : trainingPanelLabel('trainingPanel.teacherClassDoorCreate', 'Abrir arquivo .ecbt');
    const longText = trainingPanelLabel(
        'trainingPanel.teacherClassDoorText',
        'Entre direto na aula salva com slides, roteiro DD-38/GAC e modulos do ecbyts prontos para demonstrar.',
    );
    const hint = classDoorHint(hasCreatedCourses);
    return `<section class="training-teacher-class-door" aria-label="${attr(
        `${trainingPanelLabel('trainingPanel.teacherModeTitle', 'Professor preparando aula')} — ${longText} ${hint}`,
    )}">
        <div class="training-teacher-class-door-copy">
            <span>${text(trainingPanelLabel('trainingPanel.teacherClassDoorKicker', 'Professor preparando aula'))}</span>
            <strong>${text(title)}</strong>
            <ol class="training-teacher-class-door-route" aria-label="${attr(
                trainingPanelLabel('trainingPanel.teacherClassDoorRouteLabel', 'Rota curta da aula'),
            )}">
                ${renderClassDoorRoute(classDoorRoute(hasCreatedCourses))}
            </ol>
        </div>
        <div class="training-teacher-class-door-action">
            ${renderActionButton(ctaAction, firstCourseId, ctaLabel, 'primary training-action-btn--class-door')}
        </div>
    </section>`;
}
