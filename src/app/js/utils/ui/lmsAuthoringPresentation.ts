// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING — PREVIEW / APRESENTAÇÃO

   Extração MOVE-pura do bloco de preview/apresentação do
   lmsAuthoringModal.ts (TRAINING-LMS-GAPS-001 G1.3): _onPreview,
   _openPreviewOverlay, _openPresentationOverlay e a superfície do
   professor (_wireTeacherPresentationSurface). Reusa o isolamento de
   fullscreen já extraído em lmsAuthoringFullscreen.ts. Mesmas funções
   e assinaturas — zero mudança de comportamento.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';
import { Z_INDEX } from './zIndex.js';
import { openLmsPresentationOverlay } from './lmsPresentationOverlay.js';
import {
    consumeFullscreenEscape as _consumeFullscreenEscape,
    exitFullscreenForOverlay as _exitFullscreenForOverlay,
} from './lmsAuthoringFullscreen.js';
import { firstMarkdownImageSrc as _firstImageSrc } from './lmsAuthoringAssetRefs.js';
import { isIntroModule01Draft as _isIntroModule01Draft } from './lmsAuthoringDeckModel.js';
import {
    deckQuickActionsForPlan as deckQuickActionsForPlanView,
    renderDeckEditableInspector as renderDeckEditableInspectorView,
    renderDeckQuickActionDock as renderDeckQuickActionDockView,
    renderDeckWorkbenchAppOptionsMount as renderDeckWorkbenchAppOptionsMountView,
    renderDeckWorkbenchStage as renderDeckWorkbenchStageView,
} from './lmsAuthoringDeckWorkbench.js';
import {
    deckWorkbenchEditableElementsFor as _deckWorkbenchEditableElements,
    deckWorkbenchRenderContext as _deckWorkbenchRenderContext,
    deckWorkbenchSlideFromLessonDraft as _deckWorkbenchSlideFromLesson,
} from './lmsAuthoringDeckContext.js';
import {
    getIntroModule01SlidePlan,
    inferIntroModule01SlideIndex,
} from '../../core/training/teachingModelIntroModule01.js';
import { isYouTubeUrl } from '../../core/training/_youtubeEmbedPure.js';
import { saveAuthoredCourse } from './lmsAuthoringStore.js';
import type { CourseDraft, LessonDraft } from '../../core/training/_courseAuthoringPure.js';
import {
    tf,
    authoringEditorState as _state,
    renderAuthoringModal as _render,
    markAuthoringDraftSaved as _markDraftSaved,
    emitAuthoredCoursesChanged as _emitAuthoredCoursesChanged,
    mountTeachingSlidePanels as _mountTeachingSlidePanels,
    runDeckQuickAction as _runDeckQuickAction,
    applyEditableElementField as _applyEditableElementField,
} from './lmsAuthoringModal.js';

/**
 * Pré-visualizar como aluno (F3.5).
 *
 * 1) Salva o rascunho corrente (o player real, quando existir, lê do store).
 * 2) Se o lmsManager expuser um player de curso AUTORADO
 *    (window.handlePreviewAuthoredCourse), delega a ele — esse é o caminho
 *    completo (todos os 12 tipos no player real). Hoje o player consome o
 *    catálogo seed (getLessonsForTraining), então esse hook pode não existir.
 * 3) Fallback embutido: abre um overlay read-only navegável com as lições de
 *    conteúdo (written/interactive=markdown ou video=embed) — uma prévia real do
 *    que o aluno vê para os tipos de leitura/vídeo. Tipos avaliados (quiz/case/
 *    decisão/ordenação/data-driven) exigem o player completo: nesse caso orienta
 *    salvar+publicar para testar no catálogo (limitação documentada).
 */
async function _onPreview(): Promise<void> {
    if (!_state) return;
    await _saveDraftBeforePresentation('preview');

    // 2) Player de curso autorado completo, se o runtime expuser.
    const previewFn = (window as any).handlePreviewAuthoredCourse;
    if (typeof previewFn === 'function') {
        try {
            previewFn(_state.draft);
            return;
        } catch (e: any) {
            console.debug('[lmsAuthoringModal] preview-delegate:', e?.message || e);
        }
    }

    // 3) Fallback embutido: prévia read-only navegável das lições de conteúdo.
    const previewable = _getPreviewableLessons(_state.draft);
    if (!previewable.length) {
        showToast(
            tf('lmsAuthor.toastPreviewNoLesson', 'Adicione uma lição de leitura ou vídeo para pré-visualizar. Tipos avaliados (quiz, caso, decisão) são testados publicando o curso.'),
            'info',
        );
        return;
    }
    _openPreviewOverlay(previewable, 0);
    showToast(tf('lmsAuthor.toastPreviewOpened', 'Pré-visualização da lição aberta.'), 'info');
}

async function _onStartClass(): Promise<void> {
    if (!_state) return;
    const previewableItems = _getPreviewableLessonItems(_state.draft);
    const previewable = previewableItems.map((entry) => entry.lesson);
    if (!previewable.length) {
        showToast(
            tf(
                'lmsAuthor.toastStartClassNoLesson',
                'Adicione uma licao de leitura, video ou slide antes de iniciar a aula.',
            ),
            'info',
        );
        return;
    }
    const expandedLessonId = _state.expandedLessonId;
    const startFromExpanded = previewableItems.findIndex((entry) => entry.lesson.id === expandedLessonId);
    const startIndex = startFromExpanded >= 0 ? startFromExpanded : 0;
    _openPresentationOverlay(previewable, startIndex);
    void _saveDraftBeforePresentation('start-class');
    showToast(tf('lmsAuthor.toastStartClassOpened', 'Apresentacao aberta.'), 'info');
}

async function _saveDraftBeforePresentation(reason: string): Promise<void> {
    if (!_state) return;
    try {
        const ok = await saveAuthoredCourse(_state.draft);
        if (ok) {
            _markDraftSaved();
            _emitAuthoredCoursesChanged(reason, _state.draft.id);
        }
    } catch (e: any) {
        console.debug(`[lmsAuthoringModal] ${reason}-save:`, e?.message || e);
    }
}

function _getPreviewableLessonItems(draft: CourseDraft): { lesson: LessonDraft; lessonIndex: number }[] {
    const lessons = Array.isArray(draft.lessons) ? draft.lessons : [];
    const isIntroModule01 = _isIntroModule01Draft(draft);
    return lessons
        .map((lesson, lessonIndex) => {
            if (!_isLessonPreviewable(lesson, lessonIndex, isIntroModule01)) return null;
            return { lesson, lessonIndex };
        })
        .filter((item): item is { lesson: LessonDraft; lessonIndex: number } => Boolean(item));
}

function _getPreviewableLessons(draft: CourseDraft): LessonDraft[] {
    return _getPreviewableLessonItems(draft).map((entry) => entry.lesson);
}

function _isLessonPreviewable(lesson: LessonDraft, lessonIndex: number, isIntroModule01 = false): boolean {
    if (!lesson) return false;
    const lessonType = String((lesson as any).type || '');
    if (
        lessonType !== 'written'
        && lessonType !== 'reading'
        && lessonType !== 'interactive'
        && lessonType !== 'video'
    ) {
        return false;
    }
    if (!isIntroModule01) return true;
    const slideIndex = inferIntroModule01SlideIndex(lesson, lessonIndex + 1);
    return Boolean(getIntroModule01SlidePlan(slideIndex));
}

/** Markdown mínimo → HTML (headings/bold/listas) XSS-safe — espelha o player. */
function _previewMarkdown(md: string): string {
    const lines = String(md || '').split('\n');
    const out: string[] = [];
    let inList = false;
    const inline = (s: string) =>
        escapeHtml(s)
            .replace(
                /!\[([^\]]*)\]\(([^)]+)\)/g,
                (_m, alt, src) => {
                    const safeSrc = String(src || '').trim();
                    const label = String(alt || safeSrc || 'mídia');
                    if (/^(data:video\/|https?:\/\/|files\/).+\.(mp4|webm|ogg)([?#].*)?$/i.test(safeSrc)) {
                        return `<video controls src="${escapeAttr(safeSrc)}" style="max-width:100%;height:auto"></video>`;
                    }
                    if (/\.(wdp)([?#].*)?$/i.test(safeSrc)) {
                        return `<a href="${escapeAttr(safeSrc)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
                    }
                    return `<img src="${escapeAttr(safeSrc)}" alt="${escapeAttr(label)}" style="max-width:100%;height:auto">`;
                },
            )
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    for (const raw of lines) {
        const line = raw.trimEnd();
        if (/^###\s+/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h4>${inline(line.replace(/^###\s+/, ''))}</h4>`);
        } else if (/^##\s+/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h3>${inline(line.replace(/^##\s+/, ''))}</h3>`);
        } else if (/^#\s+/.test(line)) {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<h2>${inline(line.replace(/^#\s+/, ''))}</h2>`);
        } else if (/^\s*-\s+/.test(line)) {
            if (!inList) { out.push('<ul>'); inList = true; }
            out.push(`<li>${inline(line.replace(/^\s*-\s+/, ''))}</li>`);
        } else if (line === '') {
            if (inList) { out.push('</ul>'); inList = false; }
        } else {
            if (inList) { out.push('</ul>'); inList = false; }
            out.push(`<p>${inline(line)}</p>`);
        }
    }
    if (inList) out.push('</ul>');
    return out.join('');
}

/**
 * Overlay read-only de prévia navegável. Próprio AbortController (fechado no
 * X/ESC/backdrop). NÃO interfere no editor por baixo.
 */
function _openPreviewOverlay(
    lessons: LessonDraft[],
    startIndex = 0,
    opts: {
        readonly mode?: 'student' | 'teacher';
        readonly lessonItems?: readonly { readonly lesson: LessonDraft; readonly lessonIndex: number }[];
        readonly presentationShell?: boolean;
        readonly requestFullscreen?: boolean;
    } = {},
): void {
    document.getElementById('lms-author-preview-overlay')?.remove();
    const ctl = new AbortController();
    const list = Array.isArray(lessons) ? lessons : [];
    let idx = Math.max(0, Math.min(list.length - 1, startIndex));
    const isTeacherMode = opts.mode === 'teacher';
    const dialogClass = `ecbt-dialog ecbt-dialog--md lms-author-preview${isTeacherMode ? ' lms-author-preview--teacher' : ''}`;
    const badgeLabel = isTeacherMode
        ? tf('lmsAuthor.teacherPreviewBadge', 'Modo professor')
        : tf('lmsAuthor.previewBadge', 'Prévia (como aluno)');

    const overlay = document.createElement('div');
    overlay.id = 'lms-author-preview-overlay';
    overlay.className = 'ecbt-overlay';
    if (isTeacherMode && (opts.presentationShell || opts.requestFullscreen)) {
        overlay.classList.add('lms-author-presentation-shell');
    }
    overlay.style.zIndex = String(Z_INDEX.EXCEPTION_LMS_AUTHORING_MODAL + 1); // por cima do editor
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
        <div class="${escapeAttr(dialogClass)}" role="document" tabindex="-1">
            <div class="ecbt-header">
                <span class="lms-author-preview-badge">${escapeHtml(badgeLabel)}</span>
                <h3 class="ecbt-title lms-author-preview-title"></h3>
                ${isTeacherMode ? _renderTeacherPreviewActionToolbar() : ''}
                ${isTeacherMode ? `<button class="btn btn-secondary lms-author-preview-back" type="button">${escapeHtml('Editar aula')}</button>` : ''}
                <button class="ecbt-close lms-author-preview-close" type="button"
                    aria-label="${escapeAttr(tf('lmsAuthor.close', 'Fechar'))}">&times;</button>
            </div>
            <div class="lms-author-preview-content"></div>
            <div class="lms-author-preview-nav">
                <button class="btn btn-secondary lms-author-preview-prev" type="button">${escapeHtml(
                    tf('lmsAuthor.previewPrev', 'Anterior'),
                )}</button>
                <span class="lms-author-preview-counter" aria-live="polite"></span>
                <button class="btn btn-secondary lms-author-preview-next" type="button">${escapeHtml(
                    tf('lmsAuthor.previewNext', 'Próxima'),
                )}</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    const titleEl = overlay.querySelector<HTMLElement>('.lms-author-preview-title');
    const contentEl = overlay.querySelector<HTMLElement>('.lms-author-preview-content');
    const counterEl = overlay.querySelector<HTMLElement>('.lms-author-preview-counter');
    const prevBtn = overlay.querySelector<HTMLButtonElement>('.lms-author-preview-prev');
    const nextBtn = overlay.querySelector<HTMLButtonElement>('.lms-author-preview-next');
    const renderAt = (nextIndex: number) => {
        idx = Math.max(0, Math.min(list.length - 1, nextIndex));
        const lesson = list[idx];
        if (!lesson || !contentEl) return;
        titleEl && (titleEl.textContent = lesson.title || (tf('lmsAuthor.lessonNoTitle', 'Lição')));
        let body: string;
        if (isTeacherMode) {
            body = _renderTeacherPresentationLesson(
                lesson,
                opts.lessonItems?.[idx]?.lessonIndex ?? idx,
                idx,
                list.length,
            );
        } else if (lesson.type === 'video') {
            const embed = lesson.videoUrl && isYouTubeUrl(lesson.videoUrl)
                ? buildPreviewEmbedUrl(lesson.videoUrl)
                : null;
            body = embed
                ? `<div class="lms-author-preview-video"><iframe src="${escapeAttr(embed)}" title="${escapeAttr(lesson.title || '')}" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
                : `<p class="lms-author-preview-note">${escapeHtml(tf('lmsAuthor.lessonVideoInvalid', 'URL de vídeo inválida.'))}</p>`;
            if (lesson.transcript) body += `<div class="lms-author-preview-transcript">${_previewMarkdown(lesson.transcript)}</div>`;
        } else {
            body = `<div class="lms-author-preview-body">${_previewMarkdown(lesson.markdown || '')}</div>`;
        }
        contentEl.innerHTML = body;
        if (isTeacherMode) _wireTeacherPresentationSurface(overlay, () => renderAt(idx), ctl.signal);
        counterEl && (counterEl.textContent = `${idx + 1} / ${list.length}`);
        if (prevBtn) prevBtn.disabled = idx <= 0;
        if (nextBtn) nextBtn.disabled = idx >= list.length - 1;
    };
    renderAt(idx);
    const close = () => {
        ctl.abort();
        _exitFullscreenForOverlay(overlay);
        overlay.remove();
    };
    prevBtn?.addEventListener('click', () => renderAt(idx - 1), { signal: ctl.signal });
    nextBtn?.addEventListener('click', () => renderAt(idx + 1), { signal: ctl.signal });
    if (isTeacherMode) {
        _wireTeacherPreviewActionToolbar(overlay, ctl.signal, () => {
            _openPresentationOverlay(list, idx);
        });
    }
    overlay.querySelector('.lms-author-preview-back')?.addEventListener('click', close, { signal: ctl.signal });
    overlay.querySelector('.lms-author-preview-close')?.addEventListener('click', close, { signal: ctl.signal });
    // Botão de ação dentro do slide (ex.: "Abrir fluxo do GAC") — captura ANTES
    // de qualquer navegação e abre a ferramenta ligada.
    contentEl?.addEventListener('click', (e) => { _handleSlideActionClick(e); }, { capture: true, signal: ctl.signal });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); }, { signal: ctl.signal });
    overlay.addEventListener(
        'keydown',
        (e: KeyboardEvent) => {
            if (e.key === 'Escape' && _consumeFullscreenEscape(e, overlay)) {
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                close();
            } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
                e.preventDefault();
                renderAt(idx + 1);
            } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                e.preventDefault();
                renderAt(idx - 1);
            }
        },
        { signal: ctl.signal },
    );
    if (isTeacherMode && opts.requestFullscreen) {
        const request = (overlay as HTMLElement & { requestFullscreen?: (options?: any) => Promise<void> }).requestFullscreen;
        if (typeof request === 'function' && document.fullscreenEnabled !== false) {
            request.call(overlay, { navigationUI: 'hide' }).catch((e: any) =>
                console.debug('[lmsAuthoringModal] start-class-fullscreen:', e?.message || e),
            );
        }
    }
    setTimeout(() => overlay.querySelector<HTMLElement>('.lms-author-preview-next')?.focus(), 0);
}

/**
 * Abre a ferramenta do app ligada a um BOTÃO DE AÇÃO do slide (ex.: o fluxo do
 * GAC). Resolve o `toolId` no registry de deep-links e faz lazy import do módulo
 * que abre o painel — a MESMA mecânica do despachante de deep-link, sem URL.
 */
async function _openSlideActionTool(toolId: string, payload?: unknown): Promise<void> {
    try {
        const reg: any = await import('../sharing/deepLinkRegistry.js' as string);
        const entry = reg.getDeepLinkEntry?.(toolId);
        if (!entry) { console.debug('[lmsAuthoringModal] slide-action toolId desconhecido:', toolId); return; }
        const mod: any = await import(entry.module as string);
        const fn = mod[entry.openExport];
        if (typeof fn === 'function') await fn(payload);
    } catch (e: any) {
        console.debug('[lmsAuthoringModal] slide-action open:', e?.message || e);
    }
}

/**
 * Se o clique caiu num botão de ação do slide (`.lms-slide-action`), abre a
 * ferramenta e retorna true (o chamador deve parar a navegação). Senão, false.
 */
function _handleSlideActionClick(e: Event): boolean {
    const target = e.target as Element | null;
    const el = target?.closest?.('.lms-slide-action') as Element | null;
    if (!el) return false;
    const toolId = el.getAttribute('data-tool-id') || '';
    if (!toolId) return false;
    e.preventDefault();
    e.stopPropagation();
    let payload: unknown;
    const raw = el.getAttribute('data-payload');
    if (raw) {
        try {
            payload = JSON.parse(raw);
        } catch (error) {
            console.debug('[lmsAuthoringModal] invalid slide action payload', error);
            payload = undefined;
        }
    }
    void _openSlideActionTool(toolId, payload);
    return true;
}

function _buildPresentationSlideRender(lesson: LessonDraft, lessonIndex: number, isIntroModule01: boolean) {
    const slide = _deckWorkbenchSlideFromLesson(lesson, lessonIndex, isIntroModule01);
    const plan = slide.hasPlan ? getIntroModule01SlidePlan(slide.modelSlideNumber) : null;
    const focusText = plan?.focus || slide.typeLabel || '';
    const src = _firstImageSrc(lesson.markdown || '');
    const structuredStage = renderDeckWorkbenchStageView(slide, focusText, '', plan, _deckWorkbenchRenderContext());
    const html = structuredStage
        ? `<div class="lms-present-slide">${structuredStage}</div>`
        : src
          ? `<img class="lms-present-img" src="${escapeAttr(src)}" alt="${escapeAttr(lesson.title || '')}">`
          : `<div class="lms-present-text">${_previewMarkdown(lesson.markdown || '')}</div>`;
    return { html, plan, slide };
}

/**
 * MODO APRESENTAÇÃO (tela cheia) — projeta o curso para a turma (LMS-PPTX-BRIDGE F7).
 * Mostra a IMAGEM fiel de cada slide grande, em fundo preto, sem o resto da UI.
 * Navegação: ←/→, PageUp/PageDown (clicker de apresentação), Espaço, clique
 * (metade direita avança / esquerda volta). Esc sai. Tecla "N" abre/fecha as
 * notas (o texto extraído do slide) — útil para o professor lembrar os pontos.
 */
function _openPresentationOverlay(lessons: LessonDraft[], startIndex = 0): void {
    const list = Array.isArray(lessons) ? lessons : [];
    if (list.length === 0) return;
    const sourceLessons = Array.isArray(_state?.draft.lessons) ? _state.draft.lessons : [];
    const isIntroModule01 = _state ? _isIntroModule01Draft(_state.draft) : false;
    openLmsPresentationOverlay({
        lessons: list,
        sourceLessons,
        startIndex,
        zIndex: Z_INDEX.EXCEPTION_LMS_AUTHORING_MODAL + 3,
        translate: tf,
        renderSlide: (lesson, lessonIndex) => _buildPresentationSlideRender(lesson, lessonIndex, isIntroModule01),
        renderNotes: (lesson) => {
            const noImg = String(lesson.markdown || '').replace(/!\[[^\]]*\]\([^)]+\)/g, '').trim();
            return `<h4>${escapeHtml(lesson.title || '')}</h4>${_previewMarkdown(noImg)}`;
        },
        renderActions: ({ plan, slide }) => {
            const context = _deckWorkbenchRenderContext();
            const quickActions = plan && deckQuickActionsForPlanView(plan, context).length
                ? renderDeckQuickActionDockView(plan, context)
                : '';
            const appOptionsMount = renderDeckWorkbenchAppOptionsMountView(slide);
            return quickActions ? `${quickActions}${appOptionsMount}` : '';
        },
        wireSurface: _wireTeacherPresentationSurface,
        handleSlideActionClick: _handleSlideActionClick,
    });
}

function _renderTeacherPresentationLesson(
    lesson: LessonDraft,
    lessonIndex: number,
    previewIndex: number,
    total: number,
): string {
    const isIntroModule01 = _state ? _isIntroModule01Draft(_state.draft) : false;
    const slide = _deckWorkbenchSlideFromLesson(lesson, lessonIndex, isIntroModule01);
    const plan = slide.hasPlan ? getIntroModule01SlidePlan(slide.modelSlideNumber) : null;
    const focusText = plan?.focus || slide.typeLabel || '';
    const editableElements = _deckWorkbenchEditableElements(slide);
    const context = _deckWorkbenchRenderContext();
    const quickActionOptions = deckQuickActionsForPlanView(plan, context);
    const hasPlanOptions = Array.isArray(plan?.suggestions) && plan.suggestions.length > 0;
    const editableInspector = editableElements.length ? renderDeckEditableInspectorView(slide, context) : '';
    const quickActions = quickActionOptions.length ? renderDeckQuickActionDockView(plan, context) : '';
    const appOptionsMount = hasPlanOptions ? renderDeckWorkbenchAppOptionsMountView(slide) : '';
    const sideTools = [editableInspector, quickActions, appOptionsMount].filter(Boolean).join('');
    const presentationClass = sideTools
        ? 'lms-author-presentation'
        : 'lms-author-presentation lms-author-presentation--stage-only';
    const sidePanel = sideTools
        ? `<div class="lms-author-presentation-side">
                ${sideTools}
                <p class="lms-author-presentation-return">${escapeHtml('Editar aula fecha esta tela e preserva o slide atual.')}</p>
            </div>`
        : '';
    return `
        <div class="${presentationClass}">
            <div class="lms-author-presentation-main">
                <div class="lms-author-presentation-meta">
                    <span>${escapeHtml('Slide em aula')}</span>
                    <strong>${escapeHtml(slide.title)}</strong>
                    <em>${escapeHtml(`Slide ${previewIndex + 1} de ${total}`)}</em>
                </div>
                ${renderDeckWorkbenchStageView(slide, focusText, '', plan, context)}
            </div>
            ${sidePanel}
        </div>`;
}

function _renderTeacherPreviewActionToolbar(): string {
    return `
        <div class="lms-author-preview-toolbar" aria-label="${escapeAttr('Acoes da apresentacao')}">
            <button class="btn btn-primary lms-author-preview-present-fullscreen" type="button"
                title="${escapeAttr(tf('lmsAuthor.present.projectHint', 'Projetar somente o slide em tela cheia'))}">
                ${escapeHtml(tf('lmsAuthor.present.fullscreen', 'Tela cheia'))}
            </button>
        </div>`;
}

function _wireTeacherPreviewActionToolbar(overlay: HTMLElement, signal: AbortSignal, onProjectFullscreen: () => void): void {
    overlay.querySelector<HTMLButtonElement>('.lms-author-preview-present-fullscreen')?.addEventListener(
        'click',
        (event) => {
            event.preventDefault();
            event.stopPropagation();
            onProjectFullscreen();
        },
        { signal },
    );
}

function _wireTeacherPresentationSurface(overlay: HTMLElement, rerender: () => void, signal: AbortSignal): void {
    if (!_state) return;
    _mountTeachingSlidePanels(overlay, _state.draft);
    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-deck-action').forEach((btn) => {
        btn.addEventListener(
            'click',
            (event) => {
                event.stopPropagation();
                _runDeckQuickAction(overlay, btn);
            },
            { signal },
        );
    });
    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-slide-editable-element').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                if (!_state) return;
                const lessonId = btn.dataset.editableLessonId || '';
                const elementId = btn.dataset.editableElementId || '';
                if (!lessonId || !elementId) return;
                _state.expandedLessonId = lessonId;
                _state.selectedEditableElementId = elementId;
                _render();
                rerender();
            },
            { signal },
        );
    });
    overlay.querySelectorAll<HTMLElement>('[data-editable-field]').forEach((el) => {
        const evt = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? 'change' : 'input';
        el.addEventListener(
            evt,
            () => {
                const lessonId = el.dataset.editableLessonId || '';
                const elementId = el.dataset.editableElementId || '';
                const field = el.dataset.editableField || '';
                const value = (el as HTMLInputElement | HTMLTextAreaElement).value;
                _applyEditableElementField(lessonId, elementId, field, value);
                rerender();
            },
            { signal },
        );
    });
    overlay.querySelectorAll<HTMLButtonElement>('.lms-author-editable-position-reviewed').forEach((btn) => {
        btn.addEventListener(
            'click',
            () => {
                _applyEditableElementField(btn.dataset.editableLessonId || '', btn.dataset.editableElementId || '', 'needsPositionReview', false);
                rerender();
            },
            { signal },
        );
    });
}

/** URL de embed privacy-enhanced (youtube-nocookie) via parser seguro do player. */
function buildPreviewEmbedUrl(url: string): string | null {
    // Reusa parseYouTubeId via isYouTubeUrl já validado; o id é a parte final.
    // (buildYouTubeEmbedUrl não é importado para manter a superfície mínima.)
    try {
        const u = new URL(url, 'https://x');
        const v = u.searchParams.get('v');
        const segs = u.pathname.split('/').filter(Boolean);
        const id = v || segs[segs.length - 1] || '';
        return /^[A-Za-z0-9_-]{11}$/.test(id)
            ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
            : null;
    } catch (error) {
        console.debug('[lmsAuthoringModal] preview URL fallback to raw id', error);
        // ID nu (11 chars)
        return /^[A-Za-z0-9_-]{11}$/.test(url.trim())
            ? `https://www.youtube-nocookie.com/embed/${url.trim()}?rel=0&modestbranding=1&playsinline=1`
            : null;
    }
}


// Exports SEM prefixo _ (regra no-underscore-prefixed-imports) — o modal
// importa com alias de volta para os nomes históricos.
export {
    _onPreview as onPreview,
    _onStartClass as onStartClass,
    _saveDraftBeforePresentation as saveDraftBeforePresentation,
    _getPreviewableLessonItems as getPreviewableLessonItems,
    _getPreviewableLessons as getPreviewableLessons,
    _isLessonPreviewable as isLessonPreviewableGlue,
    _previewMarkdown as previewMarkdown,
    _openPreviewOverlay as openPreviewOverlay,
    _openSlideActionTool as openSlideActionTool,
    _handleSlideActionClick as handleSlideActionClick,
    _buildPresentationSlideRender as buildPresentationSlideRender,
    _openPresentationOverlay as openPresentationOverlay,
    _renderTeacherPresentationLesson as renderTeacherPresentationLesson,
    _wireTeacherPresentationSurface as wireTeacherPresentationSurface,
    buildPreviewEmbedUrl,
};
