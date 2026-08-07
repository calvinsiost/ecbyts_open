// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING — DECK WORKBENCH CONTEXT (glue)

   Extração MOVE-pura do bloco de glue do Deck Workbench que vivia em
   lmsAuthoringModal.ts (TRAINING-LMS-GAPS-001 G1.1). Liga o estado vivo
   do editor (_state, importado como live binding ESM do modal) às views
   puras já extraídas (lmsAuthoringDeckModel/lmsAuthoringDeckWorkbench).
   Zero mudança de comportamento: mesmas funções, mesmas assinaturas.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import {
    deckWorkbenchCurrentIndex,
    deckWorkbenchEditableBounds,
    deckWorkbenchEditableElementId,
    deckWorkbenchEditableElementLabel,
    deckWorkbenchEditableElements,
    deckWorkbenchSelectedEditableElement,
    deckWorkbenchSlideFromLesson,
    deckWorkbenchSlides,
    deckWorkbenchVisibleSlides,
    type DeckEditableSlideElement,
    type DeckWorkbenchSlide,
} from './lmsAuthoringDeckModel.js';
import {
    assetFileName as _assetFileName,
    assetTypeForRef as _assetTypeForRef,
    markdownAssetRefs as _markdownAssetRefs,
    normalizeAssetRef as _normalizeAssetRef,
} from './lmsAuthoringAssetRefs.js';
import { type LmsAuthoringDeckWorkbenchContext } from './lmsAuthoringDeckWorkbench.js';
import { getIntroModule01SlidePlan } from '../../core/training/teachingModelIntroModule01.js';
import {
    buildGacDd38PipelineModel,
    GAC_DD38_PIPELINE_ID,
    GAC_DD38_PIPELINE_NAME,
    GAC_DD38_SELECTED_NODE_ID,
} from '../../core/pipelines/gacDd38PipelinePreset.js';
import { buildPipelineDiagramSvg } from '../../core/pipelines/_diagramSvgPure.js';
import {
    normalizeTrainingSlideAppOptions,
    summarizeTrainingSlideAppOptionForProfessor,
    type NormalizedTrainingSlideAppOption,
} from './trainingSlideAppOptions.js';
import type { CourseDraft, LessonDraft } from '../../core/training/_courseAuthoringPure.js';
import type { TrainingCourseReadinessState } from '../../core/training/trainingCourseReadinessPure.js';
// Glue de volta ao modal (import circular ESM intencional e seguro: só
// referências em tempo de chamada, live bindings — nenhum uso top-level).
import {
    tf,
    MODAL_ID,
    authoringEditorState as _state,
    authoringLessonTypeLabel as _lessonTypeLabel,
    renderAuthoringModal as _render,
    clearAuthoringErrors as _clearErrors,
    alignDeckAtAuthoringBodyTop as _alignDeckAtAuthoringBodyTop,
    shouldShowDeckWorkbenchForDraft as _shouldShowDeckWorkbench,
    courseDraftStatusLabel as _courseDraftStatusLabel,
    buildClassReadyChecklistForDraft as _buildClassReadyChecklist,
    readinessStateLabelFor as _readinessStateLabel,
    renderClassReadyBlockForDraft as _renderClassReadyBlock,
    teachingPlanToPanelData as _teachingPlanToPanelData,
} from './lmsAuthoringModal.js';

function _deckWorkbenchSlideFromLesson(
    lesson: LessonDraft,
    lessonIndex: number,
    isIntroModule01: boolean,
): DeckWorkbenchSlide {
    return deckWorkbenchSlideFromLesson(lesson, lessonIndex, isIntroModule01, {
        lessonTypeLabel: _lessonTypeLabel,
        untitledLessonLabel: tf('lmsAuthor.lessonNoTitle', 'Licao sem titulo'),
    });
}

function _deckWorkbenchSlides(d: CourseDraft): DeckWorkbenchSlide[] {
    return deckWorkbenchSlides(d, {
        lessonTypeLabel: _lessonTypeLabel,
        untitledLessonLabel: tf('lmsAuthor.lessonNoTitle', 'Licao sem titulo'),
    });
}

function _setImportedDraftIntoEditor(draft: CourseDraft): void {
    if (!_state) return;
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    const openAsDeck = _shouldShowDeckWorkbench(draft);
    _state.draft = draft;
    _state.surfaceMode = openAsDeck ? 'deck' : 'form';
    _state.expandedLessonId = openAsDeck ? lessons[0]?.id || null : null;
    _state.lastSavedDraftKey = null;
    _clearErrors();
}

function _focusDeckWorkbenchAfterRender(): void {
    if (!_state || _state.surfaceMode !== 'deck') return;
    const overlay = document.getElementById(MODAL_ID);
    const deck = overlay?.querySelector<HTMLElement>('.lms-author-deck-workbench');
    if (!overlay || !deck) return;
    setTimeout(() => {
        _alignDeckAtAuthoringBodyTop(overlay, deck);
        try {
            deck.focus({ preventScroll: true });
        } catch (e: any) {
            console.debug('[lmsAuthoringModal] imported deck focus:', e?.message || e);
            deck.focus?.();
        }
    }, 0);
}

function _deckWorkbenchCurrentIndex(slides: readonly DeckWorkbenchSlide[]): number {
    return deckWorkbenchCurrentIndex(slides, _state?.expandedLessonId);
}

function _shiftDeckWorkbenchSlide(step: number): void {
    if (!_state) return;
    const slides = _deckWorkbenchSlides(_state.draft);
    if (!slides.length) return;
    const currentIndex = _deckWorkbenchCurrentIndex(slides);
    const nextIndex = Math.max(0, Math.min(slides.length - 1, currentIndex + step));
    const nextSlide = slides[nextIndex];
    if (!nextSlide || nextIndex === currentIndex) return;
    _state.expandedLessonId = nextSlide.lesson.id;
    _state.selectedEditableElementId = null;
    _render();
}

function _deckWorkbenchVisibleSlides(
    slides: readonly DeckWorkbenchSlide[],
    currentIndex: number,
): { slides: readonly DeckWorkbenchSlide[]; startIndex: number; endIndex: number; isWindowed: boolean } {
    return deckWorkbenchVisibleSlides(slides, currentIndex);
}

function _isDeckStageRenderableImageRef(ref: string): boolean {
    const lower = ref.toLowerCase();
    return (
        lower.startsWith('data:image/') ||
        lower.startsWith('http://') ||
        lower.startsWith('https://') ||
        lower.startsWith('/') ||
        lower.startsWith('./') ||
        lower.startsWith('../') ||
        (!lower.includes('://') && /\.(png|jpe?g|gif|webp|svg)([?#].*)?$/.test(lower))
    );
}

function _slideAssetRefValue(lesson: any): string {
    const asset = lesson?.slideAssetRef;
    if (!asset || typeof asset !== 'object') return '';
    return _normalizeAssetRef(asset.previewUrl || asset.signedUrl || asset.url || asset.ref || asset.filesPath || asset.supabasePath);
}

function _deckWorkbenchRawImageRef(slide: DeckWorkbenchSlide | undefined): string {
    if (!slide) return '';
    const markdownImage = _markdownAssetRefs(slide.lesson.markdown).find((ref) => _assetTypeForRef(ref) === 'image') || '';
    return markdownImage || _slideAssetRefValue(slide.lesson as any);
}

function _deckWorkbenchImageRef(slide: DeckWorkbenchSlide | undefined): string {
    const raw = _deckWorkbenchRawImageRef(slide);
    if (!raw) return '';
    return _state?.filesPreviewUrls?.[raw] || raw;
}

function _filesRefFileId(ref: string): string {
    const match = String(ref || '').match(/^files:\/\/([^/?#]+)/i);
    return match?.[1] ? decodeURIComponent(match[1]) : '';
}

function _isFilesImageRef(ref: string): boolean {
    return /^files:\/\//i.test(ref) && _assetTypeForRef(ref) === 'image';
}

function _deckWorkbenchImageAssetInfo(slide: DeckWorkbenchSlide | undefined): {
    rawRef: string;
    displayRef: string;
    fileId: string;
    status: 'linked' | 'loading' | 'ready' | 'failed' | 'none';
    filename: string;
} {
    const rawRef = _deckWorkbenchRawImageRef(slide);
    if (!rawRef) return { rawRef: '', displayRef: '', fileId: '', status: 'none', filename: '' };
    const displayRef = _deckWorkbenchImageRef(slide);
    const fileId = _filesRefFileId(rawRef);
    const status = _isFilesImageRef(rawRef)
        ? _state?.filesPreviewStatus?.[rawRef] || 'linked'
        : _isDeckStageRenderableImageRef(displayRef)
          ? 'ready'
          : 'linked';
    return {
        rawRef,
        displayRef,
        fileId,
        status,
        filename: _assetFileName(rawRef) || _assetFileName(displayRef),
    };
}

function _deckWorkbenchImageStats(slides: readonly DeckWorkbenchSlide[]): {
    total: number;
    withImage: number;
    renderable: number;
    linkedOnly: number;
    missing: number;
} {
    let withImage = 0;
    let renderable = 0;
    for (const slide of slides) {
        const info = _deckWorkbenchImageAssetInfo(slide);
        if (!info.rawRef) continue;
        withImage += 1;
        if (_isDeckStageRenderableImageRef(info.displayRef)) {
            renderable += 1;
        }
    }
    const total = slides.length;
    return {
        total,
        withImage,
        renderable,
        linkedOnly: Math.max(0, withImage - renderable),
        missing: Math.max(0, total - withImage),
    };
}

function _deckWorkbenchRenderContext(): LmsAuthoringDeckWorkbenchContext {
    return {
        selectedEditableElementId: _state?.selectedEditableElementId ?? null,
        translate: tf,
        courseDraftStatusLabel: _courseDraftStatusLabel,
        readinessForDraft: _buildClassReadyChecklist,
        readinessStateLabel: (state) => _readinessStateLabel(state as TrainingCourseReadinessState),
        renderClassReadyBlock: _renderClassReadyBlock,
        imageInfoForSlide: _deckWorkbenchImageAssetInfo,
        imageStatsForSlides: _deckWorkbenchImageStats,
        isRenderableImageRef: _isDeckStageRenderableImageRef,
        assetFileName: _assetFileName,
        teachingPlanToPanelData: _teachingPlanToPanelData,
    };
}

async function _resolveDeckFilePreviewUrls(draft: CourseDraft): Promise<void> {
    if (!_state || _state.surfaceMode !== 'deck') return;
    const refs = _deckWorkbenchSlides(draft)
        .map((slide) => _deckWorkbenchRawImageRef(slide))
        .filter((ref) => _isFilesImageRef(ref) && _filesRefFileId(ref))
        .filter((ref, index, all) => all.indexOf(ref) === index)
        .filter((ref) => !_state?.filesPreviewStatus?.[ref]);
    if (!refs.length) return;
    for (const ref of refs) {
        _state.filesPreviewStatus[ref] = 'loading';
    }
    let getDownloadUrl: ((id: string, options?: Record<string, unknown>) => Promise<any>) | null = null;
    try {
        const fileManager: any = await import('../files/fileManager.js' as string);
        getDownloadUrl = typeof fileManager.getDownloadUrl === 'function' ? fileManager.getDownloadUrl : null;
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] Files preview resolver indisponivel:', e?.message || e);
    }
    let changed = false;
    for (const ref of refs) {
        const fileId = _filesRefFileId(ref);
        if (!fileId || !getDownloadUrl) {
            if (_state) _state.filesPreviewStatus[ref] = 'failed';
            changed = true;
            continue;
        }
        try {
            const result = await getDownloadUrl(fileId, { expiresIn: 3600 });
            const url = result?.ok ? String(result?.data?.url || '') : '';
            if (url && _state) {
                _state.filesPreviewUrls[ref] = url;
                _state.filesPreviewStatus[ref] = 'ready';
            } else if (_state) {
                _state.filesPreviewStatus[ref] = 'failed';
            }
        } catch (e: any) {
            console.debug('[lmsAuthoringModal] Files preview URL falhou:', fileId, e?.message || e);
            if (_state) _state.filesPreviewStatus[ref] = 'failed';
        }
        changed = true;
    }
    if (changed && _state?.surfaceMode === 'deck') _render();
}

function _deckWorkbenchEditableElements(slide: DeckWorkbenchSlide | undefined): DeckEditableSlideElement[] {
    return deckWorkbenchEditableElements(slide);
}

function _deckWorkbenchEditableElementId(element: DeckEditableSlideElement, index: number): string {
    return deckWorkbenchEditableElementId(element, index);
}

function _deckWorkbenchEditableBounds(element: DeckEditableSlideElement): { x: number; y: number; w: number; h: number } {
    return deckWorkbenchEditableBounds(element);
}

function _deckWorkbenchEditableElementLabel(element: DeckEditableSlideElement, index: number): string {
    return deckWorkbenchEditableElementLabel(element, index);
}

function _deckWorkbenchSelectedEditableElement(
    slide: DeckWorkbenchSlide | undefined,
): { element: DeckEditableSlideElement; index: number; id: string } | null {
    return deckWorkbenchSelectedEditableElement(slide, _state?.selectedEditableElementId);
}

function _renderDeckWorkbenchEditableLayer(slide: DeckWorkbenchSlide | undefined): string {
    const elements = _deckWorkbenchEditableElements(slide);
    if (!elements.length) return '';
    const items = elements
        .map((element, index) => {
            const id = _deckWorkbenchEditableElementId(element, index);
            const bounds = _deckWorkbenchEditableBounds(element);
            const label = _deckWorkbenchEditableElementLabel(element, index);
            const type = String(element.type || element.kind || 'shape').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
            const reviewClass = element.needsPositionReview ? ' lms-author-slide-editable-element--needs-review' : '';
            const textClass = bounds.w >= 0.12 && bounds.h >= 0.055 ? '' : ' lms-author-slide-editable-element--compact';
            const selectedClass = _state?.selectedEditableElementId === id ? ' lms-author-slide-editable-element--selected' : '';
            const style = [
                `left:${(bounds.x * 100).toFixed(3)}%`,
                `top:${(bounds.y * 100).toFixed(3)}%`,
                `width:${(bounds.w * 100).toFixed(3)}%`,
                `height:${(bounds.h * 100).toFixed(3)}%`,
            ].join(';');
            return `<button type="button"
                class="lms-author-slide-editable-element lms-author-slide-editable-element--${escapeAttr(type)}${reviewClass}${textClass}${selectedClass}"
                style="${escapeAttr(style)}"
                data-editable-lesson-id="${escapeAttr(slide?.lesson.id || '')}"
                data-editable-element-id="${escapeAttr(id)}"
                data-editable-element-type="${escapeAttr(type)}"
                aria-label="${escapeAttr(`Elemento editavel ${index + 1}: ${label}`)}"
                title="${escapeAttr(label)}"><span>${escapeHtml(label)}</span></button>`;
        })
        .join('');
    return `<div class="lms-author-slide-editable-layer" aria-label="${escapeAttr('Elementos editaveis do slide')}">${items}</div>`;
}

function _renderDeckWorkbenchFidelityNotice(stats: ReturnType<typeof _deckWorkbenchImageStats>): string {
    if (!stats.total || (!stats.missing && !stats.linkedOnly)) return '';
    const status = stats.missing ? 'atencao' : 'files';
    const title = stats.missing
        ? `${stats.missing} slide${stats.missing === 1 ? '' : 's'} sem imagem fiel`
        : `${stats.linkedOnly} imagem${stats.linkedOnly === 1 ? '' : 'ns'} vinculada${stats.linkedOnly === 1 ? '' : 's'} ao Files`;
    const message = stats.missing
        ? 'Estes slides ainda aparecem como texto. Reimporte o pacote fiel ou confira a geracao das imagens antes de usar em sala.'
        : 'As imagens existem como referencia externa. Abra Files da aula para confirmar permissao e preview antes de apresentar.';
    const action = stats.missing
        ? `<div class="lms-author-deck-fidelity-actions">
                <button type="button" class="btn btn-secondary lms-author-fidelity-action lms-author-import-faithful-package">
                    ${escapeHtml('Importar pacote fiel')}
                </button>
           </div>`
        : '';
    return `
        <div class="lms-author-deck-fidelity lms-author-deck-fidelity--${escapeAttr(status)}"
            role="status" aria-label="${escapeAttr('Fidelidade visual do PowerPoint')}">
            <span>${escapeHtml('Fidelidade PPT')}</span>
            <strong>${escapeHtml(title)}</strong>
            <p>${escapeHtml(message)}</p>
            ${action}
        </div>`;
}

function _renderDeckWorkbenchThumbnail(slide: DeckWorkbenchSlide): string {
    const imageRef = _deckWorkbenchImageRef(slide);
    const label = `Miniatura do slide ${slide.displayNumber}: ${slide.title}`;
    if (imageRef && _isDeckStageRenderableImageRef(imageRef)) {
        const loading = slide.displayNumber === 1 ? 'eager' : 'lazy';
        const priority = slide.displayNumber === 1 ? ' fetchpriority="high"' : '';
        return `
            <img class="lms-author-slide-strip-thumb" src="${escapeAttr(imageRef)}" alt="${escapeAttr(label)}" loading="${loading}"${priority}>
            <span class="lms-author-slide-strip-number">${escapeHtml(String(slide.displayNumber))}</span>`;
    }
    if (imageRef) {
        return `
            <span class="lms-author-slide-strip-linked" aria-hidden="true"></span>
            <span class="lms-author-slide-strip-number">${escapeHtml(String(slide.displayNumber))}</span>`;
    }
    return `<span class="lms-author-slide-strip-number">${escapeHtml(String(slide.displayNumber))}</span>`;
}

function _deckWorkbenchStageMedia(slide: DeckWorkbenchSlide | undefined, plan: any = null): string {
    if (!slide) return '';
    const moduleEmbed = _renderDeckGacPipelineEmbed(slide, plan);
    if (moduleEmbed) return moduleEmbed;
    const imageInfo = _deckWorkbenchImageAssetInfo(slide);
    const imageRef = imageInfo.displayRef;
    if (!imageRef) return '';
    const label = `Imagem do slide ${slide.displayNumber}: ${slide.title}`;
    if (!_isDeckStageRenderableImageRef(imageRef)) {
        const statusText =
            imageInfo.status === 'loading'
                ? 'Buscando preview no Files'
                : imageInfo.status === 'failed'
                  ? 'Preview do Files indisponivel'
                  : 'Imagem vinculada';
        const detail = imageInfo.fileId
            ? `${imageInfo.filename || 'slide'} - arquivo ${imageInfo.fileId}`
            : _assetFileName(imageRef) || label;
        return `
        <div class="lms-author-deck-stage-placeholder lms-author-deck-stage-placeholder--linked">
            <span>${escapeHtml(statusText)}</span>
            <strong>${escapeHtml(detail)}</strong>
            <p>${escapeHtml('A imagem esta na sua area Files/Supabase e a chave ECBT guarda apenas a referencia leve. O preview aparece aqui quando a permissao de leitura estiver pronta.')}</p>
        </div>`;
    }
    return `
        <figure class="lms-author-deck-stage-media${_deckWorkbenchEditableElements(slide).length ? ' lms-author-deck-stage-media--editable' : ''}">
            <img src="${escapeAttr(imageRef)}" alt="${escapeAttr(label)}" loading="eager" fetchpriority="high">
            ${_renderDeckWorkbenchEditableLayer(slide)}
            <figcaption>${escapeHtml(
                _deckWorkbenchEditableElements(slide).length
                    ? `Slide editavel: ${_deckWorkbenchEditableElements(slide).length} elementos + imagem fiel como fundo`
                    : imageRef.startsWith('data:')
                      ? 'Imagem renderizada do slide'
                      : imageInfo.filename || _assetFileName(imageRef) || 'Imagem vinculada ao slide',
            )}</figcaption>
        </figure>`;
}

function _renderDeckWorkbenchStage(
    slide: DeckWorkbenchSlide | undefined,
    focusText: string,
    teacherGuideText = '',
    plan: any = null,
): string {
    const media = _deckWorkbenchStageMedia(slide, plan);
    const title = slide?.title || 'Sem slide selecionado';
    const journey = teacherGuideText ? _renderDeckWorkbenchStageJourney(plan) : '';
    return `
        <div class="lms-author-deck-stage" aria-label="${escapeAttr('Palco 16:9 do slide atual')}">
            ${media || `
                <div class="lms-author-deck-stage-placeholder">
                    <span>${escapeHtml(slide ? `Slide ${slide.displayNumber}` : 'Slide')}</span>
                    <strong>${escapeHtml(title)}</strong>
                    ${
                        journey
                            ? `<p>${escapeHtml('Roteiro rapido')}</p>${journey}`
                            : `<p>${escapeHtml(focusText || 'Sem imagem detectada. Use este palco como resumo visual do slide atual.')}</p>`
                    }
                </div>
            `}
        </div>`;
}

function _isGacPipelineSuggestion(suggestion: any): boolean {
    const handler = String(suggestion?.handler || '');
    const presetId = String(suggestion?.presetId || suggestion?.id || '').toLowerCase();
    const label = String(suggestion?.label || '').toLowerCase();
    const nodeId = String(suggestion?.nodeId || '').toLowerCase();
    return (
        handler === 'handleOpenPipelineManager' &&
        (presetId.includes('gac') || label.includes('gac') || nodeId.includes('gac'))
    );
}

function _deckWorkbenchGacSuggestion(plan: any): any | null {
    const suggestions = Array.isArray(plan?.suggestions) ? plan.suggestions : [];
    return (
        suggestions.find((suggestion: any) => String(suggestion?.presetId || suggestion?.id || '') === GAC_DD38_PIPELINE_ID) ||
        suggestions.find(_isGacPipelineSuggestion) ||
        null
    );
}

function _gacEmbedNodeId(suggestion: any, model: ReturnType<typeof buildGacDd38PipelineModel>): string {
    const nodeIds = new Set((model.nodes || []).map((node: any) => String(node?.id || '')));
    const explicit = String(suggestion?.nodeId || '').trim();
    if (explicit && nodeIds.has(explicit)) return explicit;
    const key = `${suggestion?.presetId || suggestion?.id || ''} ${suggestion?.label || ''}`.toLowerCase();
    if (key.includes('remediation') || key.includes('remediacao')) return 'gac.p3.l1.s1';
    if (key.includes('monitoring') || key.includes('acompanhamento')) return 'gac.p4.l1.s1';
    if (key.includes('closeout') || key.includes('fechamento')) return 'gac.p5.l1.s1';
    if (key.includes('detection') || key.includes('deteccao')) return 'gac.p1.l1.s1';
    return GAC_DD38_SELECTED_NODE_ID;
}

function _renderDeckGacPipelineEmbed(slide: DeckWorkbenchSlide, plan: any): string {
    const suggestion = _deckWorkbenchGacSuggestion(plan);
    if (!suggestion) return '';
    const model = buildGacDd38PipelineModel();
    const selectedNodeId = _gacEmbedNodeId(suggestion, model);
    const svg = buildPipelineDiagramSvg(model as any, {}, selectedNodeId);
    const presetId = String(suggestion.presetId || suggestion.id || GAC_DD38_PIPELINE_ID);
    const optionId = String(suggestion.id || presetId);
    const title = String(plan?.title || slide.title || GAC_DD38_PIPELINE_NAME);
    return `
        <figure class="lms-author-deck-stage-media lms-author-deck-stage-media--module lms-author-deck-gac-embed"
            data-module-preset-id="${escapeAttr(presetId)}"
            data-module-equivalent="pipelines.gac"
            aria-label="${escapeAttr('Fluxograma GAC nativo do ecbyts')}">
            <div class="lms-author-deck-gac-head">
                <div>
                    <span>${escapeHtml('Modulo equivalente')}</span>
                    <strong>${escapeHtml('Fluxograma GAC nativo')}</strong>
                    <small>${escapeHtml(`${GAC_DD38_PIPELINE_NAME} - ${title}`)}</small>
                </div>
                <button type="button"
                    class="lms-author-deck-action lms-author-deck-action--primary lms-author-deck-gac-open"
                    data-deck-action-option-id="${escapeAttr(optionId)}"
                    data-deck-action-preset-id="${escapeAttr(presetId)}"
                    aria-label="${escapeAttr('Abrir o fluxograma GAC editavel no modulo Pipelines')}">
                    <span>${escapeHtml('Abrir no Pipelines')}</span>
                    <small>${escapeHtml('Editar fluxo GAC')}</small>
                    <em>${escapeHtml('Voltar ao slide pelo Workbench da aula')}</em>
                </button>
            </div>
            <div class="lms-author-deck-gac-canvas" aria-hidden="false">${svg}</div>
            <figcaption>${escapeHtml(
                'Este slide usa o fluxograma GAC do proprio ecbyts. A imagem do PowerPoint fica como referencia secundaria, nao como o material principal da aula.',
            )}</figcaption>
        </figure>`;
}

function _deckWorkbenchStageJourneySteps(plan: any): string[] {
    const summary = _deckWorkbenchTeacherGuideSummary(plan);
    const summarySteps = summary
        .split(/\s*->\s*/u)
        .map((step) => step.trim())
        .filter(Boolean);
    if (summarySteps.length) return summarySteps.slice(0, 4);
    return Array.isArray(plan?.teacherGuide)
        ? plan.teacherGuide.map((step: unknown) => String(step || '').trim()).filter(Boolean).slice(0, 4)
        : [];
}

function _renderDeckWorkbenchStageJourney(plan: any): string {
    const steps = _deckWorkbenchStageJourneySteps(plan);
    if (!steps.length) return '';
    return `<div class="lms-author-teacher-steps lms-author-deck-stage-journey" aria-label="${escapeAttr('Roteiro visual do slide')}">${steps
        .map(
            (step, index) => `<span class="lms-author-teacher-step lms-author-teacher-step--${escapeAttr(
                index === 0 ? 'current' : 'todo',
            )}"><b>${escapeHtml(String(index + 1))}</b>${escapeHtml(_deckWorkbenchStageJourneyLabel(step))}</span>`,
        )
        .join('')}</div>`;
}

function _deckWorkbenchStageJourneyLabel(step: string): string {
    return String(step || '')
        .replace(/^decis[aã]o\s+/iu, '')
        .replace(/\s+da\s+fase\.?$/iu, '')
        .replace(/\s+passo\.?$/iu, '')
        .trim();
}

function _renderDeckWorkbenchAppOptionsMount(slide: DeckWorkbenchSlide | undefined): string {
    if (!slide?.hasPlan) return '';
    const plan = getIntroModule01SlidePlan(slide.modelSlideNumber);
    const optionCount = Array.isArray(plan?.suggestions) ? plan.suggestions.length : 0;
    return `<details class="lms-author-deck-app-details">
        <summary>
            <span>${escapeHtml('Plano completo do slide')}</span>
            <em>${escapeHtml(`${optionCount} opcoes`)}</em>
        </summary>
        <div class="lms-author-teaching-panel-mount lms-author-deck-app-options-mount"
            data-slide-index="${escapeAttr(String(slide.modelSlideNumber))}"
            data-lesson-id="${escapeAttr(slide.lesson.id)}"
            data-panel-placement="deck-workbench"></div>
    </details>`;
}

function _deckWorkbenchTeacherGuideSummary(plan: any): string {
    const explicitSummary = String(plan?.teacherGuideSummary || '').trim();
    if (explicitSummary) return explicitSummary;
    const guide = Array.isArray(plan?.teacherGuide)
        ? plan.teacherGuide.map((item: unknown) => String(item || '').trim()).filter(Boolean)
        : [];
    return guide.slice(0, 4).join(' -> ');
}

function _deckQuickActionsForPlan(plan: any): NormalizedTrainingSlideAppOption[] {
    if (!plan) return [];
    const options = normalizeTrainingSlideAppOptions(_teachingPlanToPanelData(plan));
    const quickActions: NormalizedTrainingSlideAppOption[] = [];
    const seenActionKeys = new Set<string>();
    const isGenericActionLabel = (option: NormalizedTrainingSlideAppOption): boolean => {
        const label = option.actionLabel.trim().toLowerCase();
        return label === 'abrir no app' || label === 'open app' || label === 'abrir app' || label === 'open in app';
    };
    const rank = (option: NormalizedTrainingSlideAppOption): number => {
        const actionLabel = option.actionLabel.toLowerCase();
        const presetId = option.modelPresetId.toLowerCase();
        if (
            option.handlerName === 'handleOpenPipelineManager'
            || actionLabel.includes('fluxo gac')
            || presetId.includes('gac.flow')
        ) {
            return -2;
        }
        if (option.actionLabel.includes('Mann-Kendall') || option.modelPresetId.includes('mann-kendall')) return -1;
        if (option.actionLabel.includes('Gantt') || option.modelPresetId.includes('gantt')) return -1;
        if (option.handlerName === 'handleOpenDataStudio') return -1;
        if (option.type === 'open-handler') return 0;
        if (option.type === 'resource') return 1;
        if (option.type === 'snapshot') return 2;
        return 3;
    };
    const actionKey = (option: NormalizedTrainingSlideAppOption): string => {
        const summary = summarizeTrainingSlideAppOptionForProfessor(option);
        const teacherLabel = option.actionLabel.trim().toLowerCase();
        const destination = summary.destinationLabel.trim().toLowerCase();
        const handler = option.handlerName || option.type;
        return [handler, destination, teacherLabel].join('|');
    };
    const rankedOptions = options
        .slice()
        .sort((a, b) => rank(a) - rank(b) || a.actionLabel.localeCompare(b.actionLabel, 'pt-BR'));
    const readableOptions = rankedOptions.filter((option) => !isGenericActionLabel(option));
    for (const option of readableOptions.length ? readableOptions : rankedOptions) {
        const key = actionKey(option);
        if (seenActionKeys.has(key)) continue;
        seenActionKeys.add(key);
        quickActions.push(option);
        if (quickActions.length >= 4) break;
    }
    return quickActions;
}

function _renderDeckQuickActionDock(plan: any): string {
    const actions = _deckQuickActionsForPlan(plan);
    const count = Array.isArray(plan?.suggestions) ? plan.suggestions.length : actions.length;
    if (!actions.length) {
        return `
        <aside class="lms-author-deck-ecbyts-dock" aria-label="${escapeAttr('Acoes ecbyts do slide')}">
            <div class="lms-author-deck-ecbyts-head">
                <span>${escapeHtml('Acoes ecbyts')}</span>
                <strong>${escapeHtml('Nenhum atalho')}</strong>
            </div>
            <p>${escapeHtml('Este slide fica como apresentacao estatica ate receber um destino do app.')}</p>
        </aside>`;
    }
    const actionButtons = actions
        .map((option, index) => {
            const primary = index === 0 ? ' lms-author-deck-action--primary' : '';
            const summary = summarizeTrainingSlideAppOptionForProfessor(option);
            const actionAriaLabel = [
                option.actionLabel,
                `Destino: ${summary.destinationLabel}`,
                `Por que abrir: ${summary.reasonLabel}`,
                summary.presetStatusLabel,
                summary.returnLabel,
            ]
                .filter(Boolean)
                .join('. ');
            return `
                <button type="button" class="lms-author-deck-action${primary}"
                    aria-label="${escapeAttr(actionAriaLabel)}"
                    data-deck-action-option-id="${escapeAttr(option.id)}"
                    data-deck-action-preset-id="${escapeAttr(option.modelPresetId)}"
                    title="${escapeAttr(option.description || option.fallbackText || option.title)}">
                    <span>${escapeHtml(option.actionLabel)}</span>
                    <small>${escapeHtml(summary.destinationLabel)}</small>
                    <em>${escapeHtml(`${summary.presetStatusLabel} - ${summary.returnLabel}`)}</em>
                </button>`;
        })
        .join('');
    const remainder = Math.max(0, count - actions.length);
    return `
        <aside class="lms-author-deck-ecbyts-dock" aria-label="${escapeAttr('Acoes ecbyts do slide')}">
            <div class="lms-author-deck-ecbyts-head">
                <span>${escapeHtml('Acoes ecbyts')}</span>
                <strong>${escapeHtml('Clique-go')}</strong>
            </div>
            <div class="lms-author-deck-action-list">${actionButtons}</div>
            <p>${escapeHtml(
                remainder > 0
                    ? `${remainder} acao extra fica no plano completo.`
                    : 'Acoes principais do slide prontas para testar.',
            )}</p>
        </aside>`;
}

function _renderDeckEditableInspector(slide: DeckWorkbenchSlide | undefined): string {
    const elements = _deckWorkbenchEditableElements(slide);
    if (!slide || !elements.length) {
        return `<aside class="lms-author-slide-editable-inspector" aria-label="${escapeAttr('Editor de elemento do slide')}">
            <div class="lms-author-slide-editable-inspector-head">
                <span>${escapeHtml('Editar slide')}</span>
                <strong>${escapeHtml('Sem objetos editaveis')}</strong>
            </div>
            <p>${escapeHtml('Importe ou gere um pacote editavel para transformar o slide em objetos internos do ecbyts.')}</p>
        </aside>`;
    }
    const selected = _deckWorkbenchSelectedEditableElement(slide);
    if (!selected) {
        return `<aside class="lms-author-slide-editable-inspector" aria-label="${escapeAttr('Editor de elemento do slide')}">
            <div class="lms-author-slide-editable-inspector-head">
                <span>${escapeHtml('Editar slide')}</span>
                <strong>${escapeHtml(`${elements.length} elementos`)}</strong>
            </div>
            <p>${escapeHtml('Clique em uma caixa azul no slide para editar texto, rotulo e posicao desse elemento.')}</p>
        </aside>`;
    }
    const element = selected.element;
    const label = _deckWorkbenchEditableElementLabel(element, selected.index);
    const type = String(element.type || element.kind || 'elemento');
    const bounds = _deckWorkbenchEditableBounds(element);
    const positionSource = element.needsPositionReview ? 'precisa revisar posicao' : 'posicao revisada';
    const numberField = (field: 'x' | 'y' | 'w' | 'h', value: number, labelText: string) => `
        <label>
            <span>${escapeHtml(labelText)}</span>
            <input type="number" min="0" max="100" step="0.1"
                data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
                data-editable-element-id="${escapeAttr(selected.id)}"
                data-editable-field="${escapeAttr(field)}"
                value="${escapeAttr((value * 100).toFixed(1))}">
        </label>`;
    return `<aside class="lms-author-slide-editable-inspector" aria-label="${escapeAttr('Editor de elemento do slide')}">
        <div class="lms-author-slide-editable-inspector-head">
            <span>${escapeHtml('Editar elemento')}</span>
            <strong>${escapeHtml(type)}</strong>
        </div>
        <label>
            <span>${escapeHtml('Rotulo')}</span>
            <input type="text"
                data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
                data-editable-element-id="${escapeAttr(selected.id)}"
                data-editable-field="label"
                value="${escapeAttr(label)}">
        </label>
        <label>
            <span>${escapeHtml('Texto')}</span>
            <textarea rows="4"
                data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
                data-editable-element-id="${escapeAttr(selected.id)}"
                data-editable-field="text">${escapeHtml(String(element.text || ''))}</textarea>
        </label>
        <div class="lms-author-slide-editable-grid" aria-label="${escapeAttr('Posicao em percentual do slide')}">
            ${numberField('x', bounds.x, 'X')}
            ${numberField('y', bounds.y, 'Y')}
            ${numberField('w', bounds.w, 'Largura')}
            ${numberField('h', bounds.h, 'Altura')}
        </div>
        <button type="button" class="btn btn-secondary lms-author-editable-position-reviewed"
            data-editable-lesson-id="${escapeAttr(slide.lesson.id)}"
            data-editable-element-id="${escapeAttr(selected.id)}">${escapeHtml('Marcar posicao revisada')}</button>
        <p>${escapeHtml(`${positionSource}. Alteracoes ficam no rascunho e entram na proxima chave ECBT exportada.`)}</p>
    </aside>`;
}


// Exports SEM prefixo _ (regra no-underscore-prefixed-imports) — o modal
// importa com alias de volta para os nomes históricos.
export {
    _deckWorkbenchSlideFromLesson as deckWorkbenchSlideFromLessonDraft,
    _deckWorkbenchSlides as deckWorkbenchSlidesForDraft,
    _setImportedDraftIntoEditor as setImportedDraftIntoEditor,
    _focusDeckWorkbenchAfterRender as focusDeckWorkbenchAfterRender,
    _deckWorkbenchCurrentIndex as deckWorkbenchCurrentIndexForState,
    _shiftDeckWorkbenchSlide as shiftDeckWorkbenchSlide,
    _deckWorkbenchVisibleSlides as deckWorkbenchVisibleSlidesFor,
    _isDeckStageRenderableImageRef as isDeckStageRenderableImageRef,
    _deckWorkbenchRawImageRef as deckWorkbenchRawImageRef,
    _deckWorkbenchImageRef as deckWorkbenchImageRef,
    _deckWorkbenchImageAssetInfo as deckWorkbenchImageAssetInfo,
    _deckWorkbenchImageStats as deckWorkbenchImageStats,
    _deckWorkbenchRenderContext as deckWorkbenchRenderContext,
    _resolveDeckFilePreviewUrls as resolveDeckFilePreviewUrls,
    _deckWorkbenchEditableElements as deckWorkbenchEditableElementsFor,
    _deckWorkbenchEditableElementId as deckWorkbenchEditableElementIdFor,
    _deckWorkbenchSelectedEditableElement as deckWorkbenchSelectedEditableElementFor,
    _renderDeckWorkbenchEditableLayer as renderDeckWorkbenchEditableLayer,
    _renderDeckWorkbenchFidelityNotice as renderDeckWorkbenchFidelityNotice,
    _renderDeckWorkbenchThumbnail as renderDeckWorkbenchThumbnail,
    _deckWorkbenchStageMedia as deckWorkbenchStageMedia,
    _renderDeckWorkbenchStage as renderDeckWorkbenchStageGlue,
    _renderDeckGacPipelineEmbed as renderDeckGacPipelineEmbed,
    _renderDeckWorkbenchAppOptionsMount as renderDeckWorkbenchAppOptionsMountGlue,
    _deckQuickActionsForPlan as deckQuickActionsForPlanGlue,
    _renderDeckQuickActionDock as renderDeckQuickActionDockGlue,
    _renderDeckEditableInspector as renderDeckEditableInspectorGlue,
};
