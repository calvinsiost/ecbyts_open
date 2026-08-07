// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { deckWorkbenchEditableElements, type DeckWorkbenchSlide } from './lmsAuthoringDeckModel.js';
import { renderDeckWorkbenchEditableLayer } from './lmsAuthoringDeckEditableInspector.js';
import { renderDeckGacPipelineEmbed, renderDeckWorkbenchStageJourney } from './lmsAuthoringDeckGacEmbed.js';
import type { LmsAuthoringDeckWorkbenchContext, TeachingPlan } from './lmsAuthoringDeckWorkbenchTypes.js';

function linkedStatus(status: string): string {
    if (status === 'loading') return 'Buscando preview no Files';
    if (status === 'failed') return 'Preview do Files indisponivel';
    return 'Imagem vinculada';
}

function stageCaption(
    elementCount: number,
    imageRef: string,
    filename: string,
    context: LmsAuthoringDeckWorkbenchContext,
): string {
    if (elementCount) return `Slide editavel: ${elementCount} elementos + imagem fiel como fundo`;
    if (imageRef.startsWith('data:')) return 'Imagem renderizada do slide';
    return filename || context.assetFileName(imageRef) || 'Imagem vinculada ao slide';
}

function renderLinkedImagePlaceholder(
    slide: DeckWorkbenchSlide,
    imageInfo: ReturnType<LmsAuthoringDeckWorkbenchContext['imageInfoForSlide']>,
    context: LmsAuthoringDeckWorkbenchContext,
): string {
    const label = `Imagem do slide ${slide.displayNumber}: ${slide.title}`;
    const detail = imageInfo.fileId
        ? `${imageInfo.filename || 'slide'} - arquivo ${imageInfo.fileId}`
        : context.assetFileName(imageInfo.displayRef) || label;
    return `<div class="lms-author-deck-stage-placeholder lms-author-deck-stage-placeholder--linked">
        <span>${escapeHtml(linkedStatus(imageInfo.status))}</span>
        <strong>${escapeHtml(detail)}</strong>
        <p>${escapeHtml('A imagem esta na sua area Files/Supabase e a chave ECBT guarda apenas a referencia leve. O preview aparece aqui quando a permissao de leitura estiver pronta.')}</p>
    </div>`;
}

function renderStageImage(
    slide: DeckWorkbenchSlide,
    imageRef: string,
    filename: string,
    context: LmsAuthoringDeckWorkbenchContext,
): string {
    const elements = deckWorkbenchEditableElements(slide);
    const editableClass = elements.length ? ' lms-author-deck-stage-media--editable' : '';
    return `<figure class="lms-author-deck-stage-media${editableClass}">
        <img src="${escapeAttr(imageRef)}" alt="${escapeAttr(`Imagem do slide ${slide.displayNumber}: ${slide.title}`)}" loading="eager" fetchpriority="high">
        ${renderDeckWorkbenchEditableLayer(slide, context)}
        <figcaption>${escapeHtml(stageCaption(elements.length, imageRef, filename, context))}</figcaption>
    </figure>`;
}

function renderStageMedia(
    slide: DeckWorkbenchSlide | undefined,
    plan: TeachingPlan,
    context: LmsAuthoringDeckWorkbenchContext,
): string {
    if (!slide) return '';
    const moduleEmbed = renderDeckGacPipelineEmbed(slide, plan);
    if (moduleEmbed) return moduleEmbed;
    const imageInfo = context.imageInfoForSlide(slide);
    const imageRef = imageInfo.displayRef;
    if (!imageRef) return '';
    if (!context.isRenderableImageRef(imageRef)) {
        return renderLinkedImagePlaceholder(slide, imageInfo, context);
    }
    return renderStageImage(slide, imageRef, imageInfo.filename, context);
}

function renderStagePlaceholder(
    slide: DeckWorkbenchSlide | undefined,
    title: string,
    focusText: string,
    journey: string,
): string {
    const slideLabel = slide ? `Slide ${slide.displayNumber}` : 'Slide';
    const body = journey
        ? `<p>${escapeHtml('Roteiro rapido')}</p>${journey}`
        : `<p>${escapeHtml(focusText || 'Sem imagem detectada. Use este palco como resumo visual do slide atual.')}</p>`;
    return `<div class="lms-author-deck-stage-placeholder">
        <span>${escapeHtml(slideLabel)}</span>
        <strong>${escapeHtml(title)}</strong>
        ${body}
    </div>`;
}

export function renderDeckWorkbenchStage(
    slide: DeckWorkbenchSlide | undefined,
    focusText: string,
    teacherGuideText: string,
    plan: TeachingPlan,
    context: LmsAuthoringDeckWorkbenchContext,
): string {
    const media = renderStageMedia(slide, plan, context);
    const title = slide?.title || 'Sem slide selecionado';
    const journey = teacherGuideText ? renderDeckWorkbenchStageJourney(plan) : '';
    const content = media || renderStagePlaceholder(slide, title, focusText, journey);
    return `<div class="lms-author-deck-stage" aria-label="${escapeAttr('Palco 16:9 do slide atual')}">
        ${content}
    </div>`;
}
