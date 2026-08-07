// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
//
// TRAINING-LEARNER-MIN-001 — painel do aluno resume-first e minimalista:
// RF-1 hero "Continuar"/"Comece por aqui"; RF-2 CTA reflete inscrição;
// RF-3 card com ≤3 metadados + detalhes expandíveis; RF-4 um único botão
// primário por visão; RF-5 abas por persona (switch instrutor); RF-7 trilha
// com check por lição + N/M; RF-8b/c/f higiene de texto e a11y.

import { renderCreatedCourses } from './trainingPanelTeacherRenderers.js';
import {
    isInstructorModeEnabled,
    visibleTrainingTabs,
    type TrainingItemRecord,
    // eslint-disable-next-line
    type TrainingPanelDataInput,
    type TrainingPanelState,
    // eslint-disable-next-line
    type TrainingTabDefinition,
    type TrainingTabId,
} from './trainingPanelModel.js';
import {
    attr,
    coercePercent,
    contentTypeLabels,
    difficultyLabel,
    formatMeta,
    itemId,
    lessonCountLabel,
    pricingLabel,
    renderActionButton,
    renderEmptyState,
    renderTabContainer,
    // eslint-disable-next-line
    shortDate,
    statusLabel,
    text,
    trainingPanelLabel,
} from './trainingPanelRenderPrimitives.js';
import {
    computeOnboardingChecklistSteps,
    describeOnboardingChecklistProgress,
    shouldShowOnboardingChecklist,
    type OnboardingChecklistStep,
} from '../../../core/training/_onboardingChecklistPure.js';
import { FIRST_VISIT_KEY } from '../../tour/firstVisitTour.js';
import { getGuidedTourState } from '../../tour/engine.js';

export type {
    TrainingItemRecord,
    TrainingPanelDataInput,
    TrainingPanelState,
    TrainingTabDefinition,
    TrainingTabId,
} from './trainingPanelModel.js';
export {
    cloneTrainingPanelState,
    isInstructorModeEnabled,
    isTrainingTabId,
    normalizeTrainingPanelData,
    setInstructorModeEnabled,
    visibleTrainingTabs,
} from './trainingPanelModel.js';
export { trainingPanelLabel } from './trainingPanelRenderPrimitives.js';

function tabCount(tabId: TrainingTabId, state: TrainingPanelState): number {
    if (tabId === 'myCourses') return state.myCourses.length;
    if (tabId === 'createdCourses') return state.createdCourses.length;
    if (tabId === 'catalog') return state.catalog.length;
    if (tabId === 'certificates') return state.certificates.length;
    return 0;
}

/**
 * RF-5: aba destacada no tablist. O catálogo é sub-visão de "Aprender" quando a
 * aba Catálogo não está visível (modo aluno) — o highlight cai em `myCourses`.
 */
export function highlightedTrainingTab(activeTab: TrainingTabId, instructorMode: boolean): TrainingTabId {
    const visible = visibleTrainingTabs(instructorMode);
    if (visible.some((tab) => tab.id === activeTab)) return activeTab;
    if (activeTab === 'catalog') return 'myCourses';
    return activeTab;
}

export function renderTrainingTabsHtml(
    activeTab: TrainingTabId,
    state: TrainingPanelState,
    instructorMode: boolean = isInstructorModeEnabled(),
): string {
    const highlighted = highlightedTrainingTab(activeTab, instructorMode);
    return visibleTrainingTabs(instructorMode)
        .map((tab) => {
            const labelText = trainingPanelLabel(tab.i18nKey, tab.fallback || tab.id);
            const count = tabCount(tab.id, state);
            const countHtml = count > 0 ? `<span class="training-tab-count">${count}</span>` : '';
            const activeClass = highlighted === tab.id ? 'active' : '';
            const selected = highlighted === tab.id ? 'true' : 'false';
            return `
            <button class="training-tab-btn ${activeClass}" data-tab="${tab.id}"
                type="button" role="tab" aria-selected="${selected}" title="${attr(labelText)}">
                ${text(labelText)}${countHtml}
            </button>`;
        })
        .join('');
}

export function renderTrainingPanelShell(activeTab: TrainingTabId, state: TrainingPanelState): string {
    const instructorMode = isInstructorModeEnabled();
    const title = text(trainingPanelLabel('trainingPanel.title', 'Training'));
    // RF-8b: aria-label localizado via i18n (chave própria do painel; nada de "Close" fixo).
    const closeLabel = attr(trainingPanelLabel('trainingPanel.closeLabel', trainingPanelLabel('close', 'Close')));
    const modeLabel = text(trainingPanelLabel('trainingPanel.instructorMode', 'Instructor mode'));
    const modeHint = attr(
        trainingPanelLabel('trainingPanel.instructorModeHint', 'Show the teacher workspace (Saved classes)'),
    );
    return `
        <div class="training-panel-header">
            <span class="training-panel-title">${title}</span>
            <button class="training-panel-close" type="button"
                title="${closeLabel}" aria-label="${closeLabel}">&times;</button>
        </div>
        <div class="training-panel-tabs" role="tablist">
            ${renderTrainingTabsHtml(activeTab, state, instructorMode)}
        </div>
        <div class="training-panel-mode">
            <button class="training-instructor-toggle" type="button" role="switch"
                aria-checked="${instructorMode ? 'true' : 'false'}" title="${modeHint}">
                <span class="training-instructor-toggle-track" aria-hidden="true"><span class="training-instructor-toggle-thumb"></span></span>
                <span class="training-instructor-toggle-label">${modeLabel}</span>
            </button>
        </div>
        <div class="training-panel-body" id="training-panel-body"></div>
    `;
}

export function renderTrainingActiveTab(activeTab: TrainingTabId, state: TrainingPanelState): string {
    switch (activeTab) {
        case 'myCourses':
            return renderMyCourses(state);
        case 'createdCourses':
            return renderCreatedCourses(state);
        case 'catalog':
            return renderCatalog(state);
        case 'certificates':
            return renderCertificates(state);
        default:
            return renderEmptyState('Training', 'In development', '');
    }
}

// ----------------------------------------------------------------
// "Aprender" — RF-1 resume-first: hero único no topo (continuar OU começar),
// catálogo sempre a 1 clique ("Ver todos os treinamentos").
// ----------------------------------------------------------------

function renderMyCourses(state: TrainingPanelState): string {
    const tabTitle = trainingPanelLabel(
        'trainingPanel.learningTab',
        trainingPanelLabel('trainingPanel.myCoursesTab', 'My Courses'),
    );
    const courses = state.myCourses;
    const inProgress = courses.filter((course) => !(course.completed === true || course.status === 'completed'));
    const heroCourse = inProgress[0] || null;
    const hero = heroCourse ? renderContinueHero(heroCourse) : renderStartHero(state);
    const hintsSeen = renderHintsSeenSection(state);
    const onboardingChecklist = renderOnboardingChecklist(state);
    const rest = courses.filter((course) => course !== heroCourse);
    const cards = rest.map(renderLearningCard).join('');
    // RF-4: o único botão primário desta visão vive no hero; o resto é
    // link/outline. RF-7: dialog de competências rebaixado a ação on-demand.
    const footer = `
        <div class="training-learning-footer">
            <button class="training-link-btn" type="button" data-training-action="show-catalog">
                ${text(trainingPanelLabel('trainingPanel.action.viewCatalog', 'See all trainings'))}
            </button>
            ${renderActionButton(
                'show-competencies',
                '',
                trainingPanelLabel('trainingPanel.action.showCompetencies', 'My competencies'),
                'secondary',
            )}
            <button class="training-link-btn" type="button" data-training-action="open-tours">
                ${text(trainingPanelLabel('trainingPanel.action.openTours', 'Practice in the app (guided tours)'))}
            </button>
        </div>
    `;
    return renderTabContainer(tabTitle, hero + hintsSeen + onboardingChecklist + cards + footer);
}

// ----------------------------------------------------------------
// T8.2 — "Dicas que você já viu": agrega as dicas de intenção (T8.1)
// disparadas na 1ª abertura de módulos-chave, para revisita. Fica ATRÁS de
// 1 clique (<details> fechado por padrão, mesmo padrão RF-7 de
// renderLessonChecklist) — lista vazia esconde a seção inteira (RF-8f: sem
// poluição). Cada item reabre o painel de Treinamentos na aba Aprender via
// data-training-action="continue" (dispatcher já existe no controller).
// ----------------------------------------------------------------

function renderHintsSeenSection(state: TrainingPanelState): string {
    const items = Array.isArray(state.hintsSeen) ? state.hintsSeen : [];
    if (!items.length) return '';
    const title = trainingPanelLabel('trainingPanel.hintsSeen.title', "Hints you've already seen");
    const rows = items
        .map(
            (item) => `
                <li>
                    <button type="button" class="training-link-btn training-hint-seen-item"
                        data-training-action="open-module" data-training-id="${attr(String(item.moduleId ?? ''))}">
                        ${text(String(item.lessonLabel ?? ''))}
                    </button>
                </li>`,
        )
        .join('');
    return `
        <details class="training-hints-seen">
            <summary>${text(title)} &middot; ${items.length}</summary>
            <ul class="training-hints-seen-list">${rows}</ul>
        </details>
    `;
}

// ----------------------------------------------------------------
// T7.3 — checklist "Comece aqui": 3 passos que se marcam sozinhos por
// evento/estado real (inscreveu → 1ª lição → 1ª prática). So aparece para
// usuario novo (enquanto os 3 passos nao estiverem todos concluidos) e so
// depois que ele ja passou pelo welcome tour (FIRST_VISIT_KEY) — nao
// atropela quem ainda esta no fluxo de 1a visita. Reusa o padrao visual de
// renderLessonChecklist (details/ol/li com check), sem duplicar seu render.
// ----------------------------------------------------------------

function _hasSeenFirstVisit(): boolean {
    try {
        return typeof localStorage !== 'undefined' && Boolean(localStorage.getItem(FIRST_VISIT_KEY));
    } catch (error) {
        console.debug('[trainingPanel] hasSeenFirstVisit:', error instanceof Error ? error.message : error);
        return false;
    }
}

function _hasGuidedPracticeCompleted(): boolean {
    try {
        const guided = getGuidedTourState() as { totalCompleted?: number } | null | undefined;
        return Number(guided?.totalCompleted ?? 0) > 0;
    } catch (error) {
        console.debug('[trainingPanel] hasGuidedPracticeCompleted:', error instanceof Error ? error.message : error);
        return false;
    }
}

const ONBOARDING_STEP_LABELS: Record<OnboardingChecklistStep['id'], [string, string]> = {
    enrolled: ['trainingPanel.onboarding.stepEnrolled', 'Enroll in a course'],
    lesson_completed: ['trainingPanel.onboarding.stepLesson', 'Complete your first lesson'],
    guided_practice: ['trainingPanel.onboarding.stepPractice', 'Complete a guided practice'],
};

const ONBOARDING_STEP_HELP: Record<OnboardingChecklistStep['id'], [string, string]> = {
    enrolled: ['trainingPanel.onboarding.helpEnrolled', 'Choose the recommended course to begin.'],
    lesson_completed: ['trainingPanel.onboarding.helpLesson', 'Open your course and finish its next lesson.'],
    guided_practice: ['trainingPanel.onboarding.helpPractice', 'Use Guided tours to practise in the app.'],
};

function renderOnboardingChecklist(state: TrainingPanelState): string {
    if (!_hasSeenFirstVisit()) return '';
    const hasEnrollment = state.myCourses.length > 0;
    const hasCompletedLesson = state.myCourses.some((course) => Number(course.completed_count ?? 0) > 0);
    const hasGuidedPractice = _hasGuidedPracticeCompleted();
    const result = computeOnboardingChecklistSteps({ hasEnrollment, hasCompletedLesson, hasGuidedPractice });
    if (!shouldShowOnboardingChecklist(result)) return '';
    const progress = describeOnboardingChecklistProgress(result);

    const items = result.steps
        .map((step) => {
            const [key, fallback] = ONBOARDING_STEP_LABELS[step.id];
            const isNext = !step.done && result.steps.find((s) => !s.done)?.id === step.id;
            return `
                <li class="${step.done ? 'done' : ''}"${isNext ? ' aria-current="step"' : ''}>
                    <span class="training-lesson-check" aria-hidden="true">${step.done ? '&#10003;' : ''}</span>
                    ${text(trainingPanelLabel(key, fallback))}
                </li>`;
        })
        .join('');
    const title = trainingPanelLabel('trainingPanel.onboarding.title', 'Start here');
    const currentLabel = progress.currentStepId
        ? trainingPanelLabel(...ONBOARDING_STEP_LABELS[progress.currentStepId])
        : '';
    const nextLabel = progress.nextStepId
        ? trainingPanelLabel(...ONBOARDING_STEP_LABELS[progress.nextStepId])
        : '';
    const help = progress.currentStepId
        ? trainingPanelLabel(...ONBOARDING_STEP_HELP[progress.currentStepId])
        : '';
    return `
        <section class="training-onboarding-checklist" aria-label="${attr(title)}">
            <h4>${text(title)}</h4>
            <p class="training-onboarding-current"><strong>${text(trainingPanelLabel('trainingPanel.onboarding.current', 'Now'))}:</strong> ${text(currentLabel)}</p>
            ${nextLabel ? `<p class="training-onboarding-next"><strong>${text(trainingPanelLabel('trainingPanel.onboarding.next', 'Next'))}:</strong> ${text(nextLabel)}</p>` : ''}
            <p class="training-onboarding-help">${text(help)}</p>
            <ol class="training-lesson-list">${items}</ol>
        </section>
    `;
}

/** RF-1 (curso em andamento): hero "Continuar" — CTA dominante da visão. */
function renderContinueHero(course: TrainingItemRecord): string {
    const id = itemId(course, 'course-0');
    const progress = coercePercent(course.progress_percent ?? course.progress);
    const done = Math.max(0, Math.round(Number(course.completed_count ?? 0)));
    const total = Math.max(0, Math.round(Number(course.total_lessons ?? 0)));
    const counter = total > 0 ? `${done}/${total}` : `${progress}%`;
    const nextLesson = course.next_lesson
        || course.nextLesson
        || trainingPanelLabel('trainingPanel.nextLesson', 'Next lesson');
    const kicker = trainingPanelLabel('trainingPanel.hero.continueKicker', 'Continue where you left off');
    return `
        <section class="training-hero" aria-label="${attr(kicker)}">
            <span class="training-hero-kicker">${text(kicker)}</span>
            <h3>${text(course.title || course.training_title, 'Untitled training')}</h3>
            <p class="training-hero-next">
                ${text(trainingPanelLabel('trainingPanel.hero.nextLesson', 'Next lesson'))}:
                <strong>${text(nextLesson)}</strong>
                &middot; <span class="training-hero-counter">${text(counter)}</span>
            </p>
            ${renderProgress(progress)}
            ${renderLessonChecklist(course, done, total)}
            <div class="training-card-actions">
                ${renderActionButton('continue', id, trainingPanelLabel('trainingPanel.action.continue', 'Continue'))}
            </div>
        </section>
    `;
}

/** RF-1 (sem inscrição): hero "Comece por aqui" com 1 curso recomendado. */
function renderStartHero(state: TrainingPanelState): string {
    const recommended = state.catalog[0] || null;
    if (!recommended) {
        return renderEmptyState(
            trainingPanelLabel('trainingPanel.empty.learningTitle', 'No courses in progress'),
            trainingPanelLabel('trainingPanel.empty.myCourses', 'You are not enrolled in any course yet.'),
            trainingPanelLabel(
                'trainingPanel.empty.myCoursesDetail',
                'Classes you open as a teacher are in Saved classes. Courses where you participate as a learner appear here.',
            ),
        );
    }
    const id = itemId(recommended, 'catalog-course-0');
    const kicker = trainingPanelLabel('trainingPanel.hero.startKicker', 'Start here');
    const hours = recommended.estimated_hours ? `~${recommended.estimated_hours}h` : '';
    return `
        <section class="training-hero training-hero--start" aria-label="${attr(kicker)}">
            <span class="training-hero-kicker">${text(kicker)}</span>
            <h3>${text(recommended.title, 'Untitled training')}</h3>
            <p class="training-card-desc">${text(recommended.description, '')}</p>
            ${formatMeta([hours, difficultyLabel(recommended.difficulty)])}
            <div class="training-card-actions">
                ${renderActionButton(
                    'enroll',
                    id,
                    trainingPanelLabel('trainingPanel.action.enrollFree', 'Enroll free'),
                )}
            </div>
        </section>
    `;
}

function renderLearningCard(course: TrainingItemRecord, index: number): string {
    const id = itemId(course, `course-${index}`);
    const progress = coercePercent(course.progress_percent ?? course.progress);
    const done = Math.max(0, Math.round(Number(course.completed_count ?? 0)));
    const total = Math.max(0, Math.round(Number(course.total_lessons ?? 0)));
    const counter = total > 0 ? `${done}/${total}` : `${progress}%`;
    const nextLesson = course.next_lesson
        || course.nextLesson
        || trainingPanelLabel('trainingPanel.nextLesson', 'Next lesson');
    const status = course.status || 'active';
    const isCompleted = course.completed === true || status === 'completed';
    // RF-4: o hero detém o primário da visão — cards usam ações outline.
    const actionBtn = isCompleted
        ? renderActionButton('restart', id, trainingPanelLabel('trainingPanel.action.restart', 'Restart course'), 'secondary')
        : renderActionButton('continue', id, trainingPanelLabel('trainingPanel.action.continue', 'Continue'), 'secondary');
    return `
        <article class="training-course-card" data-training-course-id="${attr(id)}">
            <div class="training-card-topline">
                <span class="training-pill">${text(statusLabel(status))}</span>
                <span class="training-hero-counter">${text(counter)}</span>
            </div>
            <h3>${text(course.title || course.training_title, 'Untitled training')}</h3>
            ${formatMeta([course.provider || course.creator_name, isCompleted ? '' : nextLesson])}
            ${renderProgress(progress)}
            ${renderLessonChecklist(course, done, total)}
            <div class="training-card-actions">
                ${actionBtn}
            </div>
        </article>
    `;
}

/** RF-7: trilha expandível com check por lição concluída + aria-current na próxima. */
function renderLessonChecklist(course: TrainingItemRecord, done: number, total: number): string {
    const lessons = Array.isArray(course.lessons) ? (course.lessons as TrainingItemRecord[]) : [];
    if (!lessons.length) return '';
    const doneLabel = trainingPanelLabel('trainingPanel.lessonDoneLabel', 'Completed');
    const items = lessons
        .map((lesson) => {
            const isDone = lesson.completed === true;
            const isNext = !isDone && lesson.id === course.next_lesson_id;
            return `
                <li class="${isDone ? 'done' : ''}"${isNext ? ' aria-current="step"' : ''}>
                    <span class="training-lesson-check" aria-hidden="true">${isDone ? '&#10003;' : ''}</span>
                    ${text(lesson.title, '')}
                    ${isDone ? `<span class="lms-sr-only">${text(doneLabel)}</span>` : ''}
                </li>`;
        })
        .join('');
    return `
        <details class="training-lessons">
            <summary>${text(trainingPanelLabel('trainingPanel.lessonsListLabel', 'Lessons'))} &middot; ${done}/${total}</summary>
            <ol class="training-lesson-list">${items}</ol>
        </details>
    `;
}

// ----------------------------------------------------------------
// Catálogo — RF-2 (CTA reflete inscrição), RF-3 (teto de densidade),
// RF-4 (1 primário) e RF-8c (header deduplicado).
// ----------------------------------------------------------------

function renderCatalog(state: TrainingPanelState): string {
    const title = trainingPanelLabel('trainingPanel.catalogTab', 'Catalog');
    const backLink = `
        <button class="training-link-btn" type="button" data-training-action="back-to-learning">
            &#8592; ${text(trainingPanelLabel('trainingPanel.action.backToLearning', 'Back to Learning'))}
        </button>
    `;
    if (state.catalog.length === 0) {
        return renderTabContainer(
            title,
            backLink +
                renderEmptyState(
                    trainingPanelLabel('trainingPanel.empty.catalogTitle', 'Empty catalog'),
                    trainingPanelLabel('trainingPanel.empty.catalog', 'No trainings available in the catalog.'),
                    trainingPanelLabel(
                        'trainingPanel.empty.catalogDetail',
                        'Published courses for learners appear here. Teacher classes stay in Saved classes.',
                    ),
                ),
        );
    }
    // RF-4: só o primeiro curso ainda não inscrito ganha o CTA preenchido.
    const primaryIndex = state.catalog.findIndex((course) => course.enrolled !== true);
    const cards = state.catalog.map((course, index) => renderCatalogCard(course, index, primaryIndex)).join('');
    // RF-8c: sem o <h3>CATÁLOGO</h3> duplicado — o título já vem do renderTabContainer.
    return renderTabContainer(title, `${backLink}<section class="training-subsection">${cards}</section>`);
}

function renderCatalogCard(course: TrainingItemRecord, index: number, primaryIndex: number): string {
    const id = itemId(course, `catalog-course-${index}`);
    const pricing = course.pricing_label || course.pricing_type || course.pricingType || 'free';
    const enrolled = course.enrolled === true;
    const enrolledProgress = coercePercent(course.enrollment_progress ?? 0);
    const hours = course.estimated_hours ? `~${course.estimated_hours}h` : '';
    // RF-2: curso inscrito NUNCA volta a mostrar "Inscrever grátis".
    const cta = enrolled
        ? renderActionButton(
              'continue',
              id,
              enrolledProgress > 0
                  ? trainingPanelLabel('trainingPanel.action.continue', 'Continue')
                  : trainingPanelLabel('trainingPanel.action.startFirstLesson', 'Start lesson 1'),
              'secondary',
          )
        : renderActionButton(
              'enroll',
              id,
              pricing === 'free'
                  ? trainingPanelLabel('trainingPanel.action.enrollFree', 'Enroll free')
                  : trainingPanelLabel('trainingPanel.action.preview', 'Preview'),
              index === primaryIndex ? 'primary' : 'secondary',
          );
    const badge = enrolled
        ? `<span class="training-pill training-pill--enrolled">${text(
              trainingPanelLabel('trainingPanel.enrolledBadge', 'Enrolled'),
          )}</span>`
        : `<span class="training-pill">${text(pricingLabel(pricing))}</span>`;
    // RF-3: título + 1 linha de valor + ≤3 metadados + 1 CTA; o resto em "Detalhes".
    return `
        <article class="training-course-card catalog" data-training-course-id="${attr(id)}">
            <div class="training-card-topline">
                ${badge}
            </div>
            <h3>${text(course.title, 'Untitled training')}</h3>
            <p class="training-card-desc">${text(course.description, 'Compliance training for the ecbyts marketplace.')}</p>
            ${formatMeta([hours, difficultyLabel(course.difficulty)])}
            ${renderCatalogCardDetails(course)}
            <div class="training-card-actions">
                ${cta}
            </div>
        </article>
    `;
}

/** RF-3 progressive disclosure (máx 2 níveis): modalidades + nº de lições on-demand. */
function renderCatalogCardDetails(course: TrainingItemRecord): string {
    const formats = contentTypeLabels(course.content_types);
    const lessons = Number(
        course.lessons_count ?? course.lessonCount ?? (Array.isArray(course.lessons) ? course.lessons.length : 0),
    );
    const rows: string[] = [];
    if (formats) {
        rows.push(
            `<span>${text(trainingPanelLabel('trainingPanel.contentTypesLabel', 'Formats'))}: ${text(formats)}</span>`,
        );
    }
    if (lessons > 0) rows.push(`<span>${text(lessonCountLabel(lessons))}</span>`);
    if (!rows.length) return '';
    return `
        <details class="training-card-details">
            <summary>${text(trainingPanelLabel('trainingPanel.detailsLabel', 'Details'))}</summary>
            <div class="training-card-details-body">${rows.join('')}</div>
        </details>
    `;
}

function renderCertificates(state: TrainingPanelState): string {
    if (state.certificates.length === 0) {
        // T7.4: empty state ganha 1 CTA única ("Ver catálogo") reaproveitando
        // a mesma ação de navegação já roteada pelo controller (RF-1 footer).
        return renderTabContainer(
            trainingPanelLabel('trainingPanel.certificatesTab', 'Certificates'),
            renderEmptyState(
                trainingPanelLabel('trainingPanel.empty.certificatesTitle', 'No certificates'),
                trainingPanelLabel('trainingPanel.empty.certificates', "You don't have any certificates yet."),
                trainingPanelLabel(
                    'trainingPanel.empty.certificatesDetail',
                    'Completed courses with released assessment can export a PDF certificate.',
                ),
                renderActionButton(
                    'show-catalog',
                    '',
                    trainingPanelLabel('trainingPanel.action.viewCatalog', 'See all trainings'),
                ),
            ),
        );
    }
    return renderTabContainer(
        trainingPanelLabel('trainingPanel.certificatesTab', 'Certificates'),
        state.certificates.map(renderCertificateCard).join(''),
    );
}

function renderCertificateCard(certificate: TrainingItemRecord, index: number): string {
    const id = itemId(certificate, `certificate-${index}`);
    return `
        <article class="training-course-card certificate" data-training-certificate-id="${attr(id)}">
            <div class="training-card-topline">
                <span class="training-pill">PDF</span>
                <span>${text(certificate.score == null ? '' : `${certificate.score}%`)}</span>
            </div>
            <h3>${text(certificate.training_title || certificate.title, 'Training certificate')}</h3>
            ${formatMeta([certificate.learner_name, certificate.issued_at || certificate.completion_date, id])}
            <div class="training-card-actions">
                ${renderActionButton(
                    'download-certificate',
                    id,
                    trainingPanelLabel('trainingPanel.action.downloadPdf', 'Download PDF'),
                    index === 0 ? 'primary' : 'secondary',
                )}
            </div>
        </article>
    `;
}

function renderProgress(progress: unknown): string {
    const pct = coercePercent(progress);
    return `
        <div class="training-progress-row">
            <div class="training-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
                <span style="width:${pct}%"></span>
            </div>
        </div>
    `;
}
