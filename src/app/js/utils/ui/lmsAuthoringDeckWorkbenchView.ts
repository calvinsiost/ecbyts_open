// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { getIntroModule01SlidePlan } from '../../core/training/teachingModelIntroModule01.js';
import { renderDeckEditableInspector } from './lmsAuthoringDeckEditableInspector.js';
import {
    deckWorkbenchTeacherGuideSummary,
} from './lmsAuthoringDeckGacEmbed.js';
import {
    renderDeckWorkbenchFidelityNotice,
    renderDeckWorkbenchStage,
    renderDeckWorkbenchThumbnail,
} from './lmsAuthoringDeckStage.js';
import {
    renderDeckQuickActionDock,
    renderDeckWorkbenchAppOptionsMount,
} from './lmsAuthoringDeckActions.js';
import type { RenderDeckWorkbenchOptions } from './lmsAuthoringDeckWorkbenchTypes.js';

export {
    deckQuickActionsForPlan,
    renderDeckQuickActionDock,
    renderDeckWorkbenchAppOptionsMount,
} from './lmsAuthoringDeckActions.js';
export { renderDeckEditableInspector } from './lmsAuthoringDeckEditableInspector.js';
export {
    deckWorkbenchTeacherGuideSummary,
    renderDeckGacPipelineEmbed,
    renderDeckWorkbenchStageJourney,
} from './lmsAuthoringDeckGacEmbed.js';
export {
    renderDeckWorkbenchFidelityNotice,
    renderDeckWorkbenchStage,
    renderDeckWorkbenchThumbnail,
} from './lmsAuthoringDeckStage.js';
export type {
    DeckWorkbenchImageInfo,
    DeckWorkbenchImageStats,
    DeckWorkbenchReadiness,
    LmsAuthoringDeckWorkbenchContext,
    RenderDeckWorkbenchOptions,
} from './lmsAuthoringDeckWorkbenchTypes.js';

export function renderDeckWorkbench(options: RenderDeckWorkbenchOptions): string {
    const { draft, slides, currentIndex, visibleSlides, context } = options;
    if (!slides.length) return '';
    const current = slides[currentIndex] || slides[0];
    const plannedCount = slides.filter((slide) => slide.hasPlan).length;
    const previewableCount = slides.filter((slide) => slide.isPreviewable).length;
    const imageStats = context.imageStatsForSlides(slides);
    const currentPlan = current?.hasPlan ? getIntroModule01SlidePlan(current.modelSlideNumber) : null;
    const focusText = currentPlan?.focus || current?.typeLabel || '';
    const teacherGuideText = deckWorkbenchTeacherGuideSummary(currentPlan);
    const readiness = context.readinessForDraft(draft);
    const slideWindowLabel = visibleSlides.isWindowed
        ? `Mostrando slides ${visibleSlides.startIndex + 1}-${visibleSlides.endIndex + 1} de ${slides.length}`
        : `${slides.length} slides`;
    return `
        <section class="lms-author-deck-workbench" aria-label="${escapeAttr('Deck Workbench')}">
            ${renderPresenterBar(options, readiness)}
            <div class="lms-author-deck-workbench-head">
                <span class="lms-author-deck-kicker">${escapeHtml('Mesa de slides')}</span>
                <strong>${escapeHtml('Preparar aula')}</strong>
                <span>${escapeHtml(current ? `Slide ${current.displayNumber} de ${slides.length}` : 'Sem slides')}</span>
            </div>
            <div class="lms-author-deck-ppt-layout">
                ${renderFilmstrip(options, slideWindowLabel)}
                <div class="lms-author-deck-ppt-main">
                    ${renderCurrentSlideHeader(options, focusText)}
                    ${renderDeckWorkbenchFidelityNotice(imageStats)}
                    ${renderDeckWorkbenchStage(current, focusText, teacherGuideText, currentPlan, context)}
                    ${renderDeckMetrics(slides.length, previewableCount, plannedCount, imageStats.withImage, imageStats.total)}
                </div>
                <div class="lms-author-deck-ppt-side">
                    ${renderDeckEditableInspector(current, context)}
                    ${renderDeckQuickActionDock(currentPlan, context)}
                    ${renderDeckWorkbenchAppOptionsMount(current)}
                </div>
            </div>
            ${context.renderClassReadyBlock(draft)}
        </section>`;
}

function renderPresenterBar(
    options: RenderDeckWorkbenchOptions,
    readiness: ReturnType<RenderDeckWorkbenchOptions['context']['readinessForDraft']>,
): string {
    const { draft, context } = options;
    return `
        <div class="lms-author-deck-presenterbar" aria-label="${escapeAttr('Painel de apresentacao')}">
            <div class="lms-author-deck-presenterbar-main">
                <span class="lms-author-deck-kicker">${escapeHtml('Painel de apresentacao')}</span>
                <strong>${escapeHtml(draft.title || context.translate('lmsAuthor.untitledCourse', 'Curso sem titulo'))}</strong>
                <p>${escapeHtml('Slides a esquerda, palco ao centro e modulos/edicao a direita para conduzir a aula sem procurar comandos.')}</p>
            </div>
            <div class="lms-author-deck-presenterbar-flow" aria-label="${escapeAttr('Fluxo de uso da aula')}">
                <span><b>${escapeHtml('1')}</b>${escapeHtml('Slides')}</span>
                <span><b>${escapeHtml('2')}</b>${escapeHtml('Palco')}</span>
                <span><b>${escapeHtml('3')}</b>${escapeHtml('Apresentar')}</span>
            </div>
            <div class="lms-author-deck-presenterbar-status" aria-label="${escapeAttr('Prontidao da aula')}">
                <span>${escapeHtml(context.readinessStateLabel(readiness.state))}</span>
                <strong>${escapeHtml(`${readiness.counts.pronto}/${readiness.counts.total}`)}</strong>
            </div>
            <div class="lms-author-deck-presenterbar-actions">
                <button class="btn btn-secondary lms-author-save" type="button">${escapeHtml(
                    context.translate('lmsAuthor.saveDraft', 'Salvar rascunho'),
                )}</button>
                <button class="btn btn-primary lms-author-start-class" type="button"
                    title="${escapeAttr(context.translate('lmsAuthor.present.hint', 'Iniciar a apresentacao para a turma'))}">${escapeHtml(
                    context.translate('lmsAuthor.present.start', 'Iniciar apresentacao'),
                )}</button>
            </div>
        </div>`;
}

function renderFilmstrip(options: RenderDeckWorkbenchOptions, slideWindowLabel: string): string {
    const { slides, currentIndex, visibleSlides, context } = options;
    const slideStrip = visibleSlides.slides.map((slide) => {
        const currentClass = slide.lessonIndex === currentIndex ? ' lms-author-slide-strip-item--current' : '';
        return `<button type="button" class="lms-author-slide-strip-item lms-author-slide-strip-item--${escapeAttr(
            slide.statusTone,
        )}${currentClass}" title="${escapeAttr(
            `Slide ${slide.displayNumber}: ${slide.title} - ${slide.statusLabel}`,
        )}" aria-current="${slide.lessonIndex === currentIndex ? 'true' : 'false'}"
            data-deck-slide-lesson-id="${escapeAttr(slide.lesson.id)}"
            aria-label="${escapeAttr(`Selecionar slide ${slide.displayNumber}: ${slide.title}`)}">${renderDeckWorkbenchThumbnail(slide, context)}</button>`;
    }).join('');
    return `
        <nav class="lms-author-deck-ppt-filmstrip" aria-label="${escapeAttr('Miniaturas dos slides')}">
            <div class="lms-author-slide-strip-head">
                <span>${escapeHtml('Slides')}</span>
                <strong>${escapeHtml(slideWindowLabel)}</strong>
            </div>
            ${visibleSlides.isWindowed ? renderFilmstripWindowControls(slides.length, currentIndex) : ''}
            <div class="lms-author-slide-strip lms-author-slide-strip--vertical" aria-label="${escapeAttr('Faixa visual de slides')}">${slideStrip}</div>
            ${
                visibleSlides.isWindowed
                    ? `<p class="lms-author-slide-strip-note">${escapeHtml('Use Anterior/Proximo para percorrer a aula sem perder o slide atual.')}</p>`
                    : ''
            }
        </nav>`;
}

function renderFilmstripWindowControls(totalSlides: number, currentIndex: number): string {
    return `<div class="lms-author-slide-window-controls" aria-label="${escapeAttr('Navegar entre slides')}">
        <button type="button" class="lms-author-slide-window-btn" data-deck-slide-step="-1"
            ${currentIndex <= 0 ? 'disabled' : ''}
            aria-label="${escapeAttr('Slide anterior')}">${escapeHtml('Anterior')}</button>
        <button type="button" class="lms-author-slide-window-btn" data-deck-slide-step="1"
            ${currentIndex >= totalSlides - 1 ? 'disabled' : ''}
            aria-label="${escapeAttr('Proximo slide')}">${escapeHtml('Proximo')}</button>
    </div>`;
}

function renderCurrentSlideHeader(options: RenderDeckWorkbenchOptions, focusText: string): string {
    const { draft, slides, currentIndex, context } = options;
    const current = slides[currentIndex] || slides[0];
    return `<div class="lms-author-deck-current">
        <div class="lms-author-deck-current-main">
            <span>${escapeHtml('Slide atual')}</span>
            <strong>${escapeHtml(current?.title || 'Sem titulo')}</strong>
            <p>${escapeHtml(focusText)}</p>
        </div>
        <div class="lms-author-deck-status" aria-label="${escapeAttr('Status do slide atual')}">
            <span class="lms-author-deck-pill lms-author-deck-pill--${escapeAttr(current?.statusTone || 'ready')}">${escapeHtml(
                current?.statusLabel || 'Apresentavel',
            )}</span>
            <span>${escapeHtml(current?.typeLabel || '')}</span>
            <span>${escapeHtml(context.courseDraftStatusLabel(draft.status))}</span>
        </div>
    </div>`;
}

function renderDeckMetrics(
    slideCount: number,
    previewableCount: number,
    plannedCount: number,
    imagesWithPreview: number,
    imageTotal: number,
): string {
    return `<div class="lms-author-deck-metrics" aria-label="${escapeAttr('Resumo do deck')}">
        <span><strong>${escapeHtml(String(slideCount))}</strong>${escapeHtml('slides')}</span>
        <span><strong>${escapeHtml(String(previewableCount))}</strong>${escapeHtml('apresentaveis')}</span>
        <span><strong>${escapeHtml(String(plannedCount))}</strong>${escapeHtml('com plano')}</span>
        <span><strong>${escapeHtml(String(imagesWithPreview))}</strong>${escapeHtml(`/${imageTotal} imagens PPT`)}</span>
    </div>`;
}
