// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

import {
    renderActionButton,
    renderEmptyState,
    renderTabContainer,
    trainingPanelLabel,
} from './trainingPanelRenderPrimitives.js';
import {
    sortCreatedCoursesForTeacher,
    type TrainingPanelState,
} from './trainingPanelTeacherModel.js';
import {
    renderCreatedCourseCard,
    renderTeacherClassDoor,
} from './trainingPanelTeacherCards.js';
import {
    renderTeacherJourney,
    renderTeacherWorkspaceGuide,
} from './trainingPanelTeacherGuides.js';

export type { TrainingItemRecord } from './trainingPanelRenderPrimitives.js';
export type { TrainingPanelState } from './trainingPanelTeacherModel.js';

// T3.8: renderTeacherIntro (kicker + paragrafo de prosa) e a intro geral de
// renderTeacherWorkspaceGuide diziam a MESMA coisa da class door 3x ("abra
// um .ecbt / suas aulas ficam aqui") — o TEXTO foi cortado, mas os 2 botões
// (open-class-file/create-course) continuam existindo, sem prosa, porque
// "Novo curso" e "Abrir .ecbt" não têm outro caminho na tela do professor.
// classDoor (1 headline + 1 CTA) fica no topo; workspaceGuide encolheu para
// 1 linha de status; journey vira <details> com summary curto.
function renderTeacherHomeActions(): string {
    return `
        <div class="training-teacher-home">
            <div class="training-teacher-home-actions">
                ${renderActionButton(
                    'open-class-file',
                    '',
                    trainingPanelLabel('trainingPanel.action.openSavedClassFile', 'Open .ecbt file'),
                    'secondary training-action-btn--file-open',
                )}
                ${renderActionButton(
                    'create-course',
                    '',
                    trainingPanelLabel('trainingPanel.action.createCourse', 'New class'),
                    'secondary',
                )}
            </div>
        </div>
    `;
}

export function renderCreatedCourses(state: TrainingPanelState): string {
    const courses = sortCreatedCoursesForTeacher(state.createdCourses);
    const journey = renderTeacherJourney(courses);
    const workspaceGuide = renderTeacherWorkspaceGuide(courses);
    const classDoor = renderTeacherClassDoor(courses);
    const homeActions = renderTeacherHomeActions();
    if (courses.length === 0) {
        return renderTabContainer(
            trainingPanelLabel('trainingPanel.createdCoursesTab', 'Saved classes'),
            classDoor +
                homeActions +
                workspaceGuide +
                journey +
                renderEmptyState(
                    trainingPanelLabel('trainingPanel.empty.createdTitle', 'No saved classes yet'),
                    trainingPanelLabel(
                        'trainingPanel.empty.createdCourses',
                        'Open an ECBT class file from your computer. After it loads, the class appears here like a saved file.',
                    ),
                    trainingPanelLabel(
                        'trainingPanel.empty.createdDetail',
                        'Use Open .ecbt file for ready classes or New class for a blank class.',
                    ),
                ),
        );
    }
    const cards = courses.map(renderCreatedCourseCard).join('');
    return renderTabContainer(
        trainingPanelLabel('trainingPanel.createdCoursesTab', 'Saved classes'),
        classDoor + homeActions + cards + journey + workspaceGuide,
    );
}
