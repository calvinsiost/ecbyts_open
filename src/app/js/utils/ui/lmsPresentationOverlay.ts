// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import {
    type LmsPresentationPrintLessonLike,
    printPresentationSlidesToPdf,
    presentationLessonIndex,
} from './lmsPresentationPrint.js';

type FullscreenOverlayElement = HTMLElement & {
    readonly webkitRequestFullscreen?: () => Promise<void> | void;
};

export interface LmsPresentationOverlayRender<TPlan, TSlide> {
    readonly html: string;
    readonly plan: TPlan | null | undefined;
    readonly slide: TSlide;
}

export interface LmsPresentationOverlayOptions<
    TLesson extends LmsPresentationPrintLessonLike,
    TPlan,
    TSlide,
> {
    readonly lessons: readonly TLesson[] | null | undefined;
    readonly sourceLessons?: readonly TLesson[] | null;
    readonly startIndex?: number;
    readonly zIndex: number;
    readonly translate: (key: string, fallback: string) => string;
    readonly renderSlide: (
        lesson: TLesson,
        lessonIndex: number,
        visibleIndex: number,
    ) => LmsPresentationOverlayRender<TPlan, TSlide>;
    readonly renderNotes: (lesson: TLesson) => string;
    readonly renderActions?: (rendered: LmsPresentationOverlayRender<TPlan, TSlide>) => string;
    readonly wireSurface?: (overlay: HTMLElement, renderCurrent: () => void, signal: AbortSignal) => void;
    readonly handleSlideActionClick?: (event: Event) => boolean;
    readonly documentRef?: Document;
    readonly windowRef?: Window;
    readonly logger?: Pick<Console, 'debug'>;
}

export function openLmsPresentationOverlay<
    TLesson extends LmsPresentationPrintLessonLike,
    TPlan,
    TSlide,
>(options: LmsPresentationOverlayOptions<TLesson, TPlan, TSlide>): void {
    const documentRef = options.documentRef ?? document;
    const windowRef = options.windowRef ?? window;
    const logger = options.logger ?? console;
    documentRef.getElementById('lms-present-overlay')?.remove();
    const list = Array.isArray(options.lessons) ? options.lessons : [];
    if (list.length === 0) return;
    const ctl = new AbortController();
    let idx = Math.max(0, Math.min(list.length - 1, options.startIndex ?? 0));
    let notesOpen = false;
    let closing = false;
    let nativeFullscreenRequested = false;
    const sourceLessons = Array.isArray(options.sourceLessons) ? options.sourceLessons : [];

    const overlay = documentRef.createElement('div');
    overlay.id = 'lms-present-overlay';
    overlay.className = 'lms-present-overlay';
    overlay.style.zIndex = String(options.zIndex);
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.tabIndex = -1;
    const previousLabel = escapeAttr(options.translate('lmsAuthor.previewPrev', 'Anterior'));
    const nextLabel = escapeAttr(options.translate('lmsAuthor.previewNext', 'Proxima'));
    const exportPdfHint = escapeAttr(options.translate(
        'lmsAuthor.present.exportPdfHint',
        'Exportar todos os slides desta aula para PDF',
    ));
    const exportPdfLabel = escapeHtml(options.translate('lmsAuthor.present.exportPdf', 'Exportar PDF'));
    const notesLabel = escapeHtml(options.translate('lmsAuthor.present.notes', 'Notas'));
    const exitLabel = escapeHtml(options.translate('lmsAuthor.present.exit', 'Sair'));
    overlay.innerHTML = `
        <div class="lms-present-stage"></div>
        <aside class="lms-present-notes" hidden></aside>
        <details class="lms-present-actions" hidden>
            <summary>${escapeHtml('Acoes ecbyts')}</summary>
            <div class="lms-present-actions-body"></div>
        </details>
        <div class="lms-present-bar">
            <button class="lms-present-prev" type="button"
                aria-label="${previousLabel}">&#8249;</button>
            <span class="lms-present-counter" aria-live="polite"></span>
            <button class="lms-present-export-pdf" type="button"
                title="${exportPdfHint}">
                ${exportPdfLabel}
            </button>
            <button class="lms-present-next" type="button"
                aria-label="${nextLabel}">&#8250;</button>
            <button class="lms-present-notes-btn" type="button">
                ${notesLabel}
            </button>
            <button class="lms-present-exit" type="button">
                ${exitLabel}
            </button>
        </div>`;
    documentRef.body.appendChild(overlay);
    overlay.inert = false;
    overlay.removeAttribute('inert');
    overlay.removeAttribute('aria-hidden');

    const stage = overlay.querySelector('.lms-present-stage') as HTMLElement;
    const notesEl = overlay.querySelector('.lms-present-notes') as HTMLElement;
    const counterEl = overlay.querySelector('.lms-present-counter') as HTMLElement;
    const bar = overlay.querySelector('.lms-present-bar') as HTMLElement;
    const actionsEl = overlay.querySelector('.lms-present-actions') as HTMLDetailsElement;
    const actionsBodyEl = overlay.querySelector('.lms-present-actions-body') as HTMLElement;

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    const peekBar = () => {
        overlay.classList.remove('lms-present-chrome--hidden');
        bar.classList.remove('lms-present-bar--hidden');
        if (hideTimer) clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            bar.classList.add('lms-present-bar--hidden');
            if (!actionsEl.open) overlay.classList.add('lms-present-chrome--hidden');
        }, 1200);
    };

    const renderAt = (i: number) => {
        idx = Math.max(0, Math.min(list.length - 1, i));
        const lesson = list[idx];
        if (!lesson) return;
        const lessonIndex = presentationLessonIndex(lesson, sourceLessons, idx);
        const rendered = options.renderSlide(lesson, lessonIndex, idx);
        stage.innerHTML = rendered.html;
        const actionsHtml = options.renderActions?.(rendered) || '';
        actionsBodyEl.innerHTML = actionsHtml;
        actionsEl.hidden = !actionsHtml;
        actionsEl.open = false;
        notesEl.innerHTML = options.renderNotes(lesson);
        counterEl.textContent = `${idx + 1} / ${list.length}`;
        options.wireSurface?.(overlay, () => renderAt(idx), ctl.signal);
        peekBar();
    };
    renderAt(idx);

    const exit = () => {
        if (closing) return;
        closing = true;
        ctl.abort();
        try {
            if (documentRef.fullscreenElement) void documentRef.exitFullscreen();
        } catch (error) {
            logger.debug('[lmsPresentationOverlay] fullscreen exit skipped', error);
        }
        overlay.remove();
    };
    const toggleNotes = () => {
        notesOpen = !notesOpen;
        notesEl.hidden = !notesOpen;
        overlay.classList.toggle('lms-present--with-notes', notesOpen);
        peekBar();
    };
    const exportSlidesToPdf = () => {
        const runExport = () => printPresentationSlidesToPdf({
            lessons: list,
            sourceLessons,
            translate: options.translate,
            renderSlide: (lesson, lessonIndex, printIndex) => options.renderSlide(lesson, lessonIndex, printIndex),
        });
        if (documentRef.fullscreenElement && typeof documentRef.exitFullscreen === 'function') {
            nativeFullscreenRequested = false;
            void documentRef.exitFullscreen()
                .catch((error) => logger.debug('[lmsPresentationOverlay] fullscreen exit before pdf:', error))
                .finally(() => windowRef.setTimeout(runExport, 120));
            return;
        }
        runExport();
    };

    bar.addEventListener('click', (e) => {
        const button = (e.target as Element | null)?.closest?.('button');
        if (!button || !bar.contains(button)) return;
        e.stopPropagation();
        if (button.classList.contains('lms-present-prev')) renderAt(idx - 1);
        else if (button.classList.contains('lms-present-next')) renderAt(idx + 1);
        else if (button.classList.contains('lms-present-export-pdf')) exportSlidesToPdf();
        else if (button.classList.contains('lms-present-notes-btn')) toggleNotes();
        else if (button.classList.contains('lms-present-exit')) exit();
    }, { signal: ctl.signal });
    documentRef.addEventListener(
        'fullscreenchange',
        () => {
            const shouldExit = nativeFullscreenRequested
                && !documentRef.fullscreenElement
                && documentRef.body.contains(overlay);
            if (!shouldExit) return;
            exit();
        },
        { signal: ctl.signal },
    );
    stage.addEventListener(
        'click',
        (e) => { options.handleSlideActionClick?.(e); },
        { capture: true, signal: ctl.signal },
    );
    stage.addEventListener('click', (e: MouseEvent) => {
        const rect = stage.getBoundingClientRect();
        if (e.clientX - rect.left > rect.width / 2) renderAt(idx + 1);
        else renderAt(idx - 1);
    }, { signal: ctl.signal });
    overlay.addEventListener('mousemove', peekBar, { signal: ctl.signal });
    const handlePresentationKeydown = (e: KeyboardEvent) => {
        if (!documentRef.body.contains(overlay)) return;
        switch (e.key) {
            case 'Escape': e.preventDefault(); exit(); break;
            case 'ArrowRight': case 'PageDown': case ' ': case 'Enter': e.preventDefault(); renderAt(idx + 1); break;
            case 'ArrowLeft': case 'PageUp': e.preventDefault(); renderAt(idx - 1); break;
            case 'n': case 'N': e.preventDefault(); toggleNotes(); break;
            case 'p': case 'P': e.preventDefault(); exportSlidesToPdf(); break;
            case 'a': case 'A':
                if (!actionsEl.hidden) {
                    e.preventDefault();
                    actionsEl.open = !actionsEl.open;
                    peekBar();
                }
                break;
            case 'Home': e.preventDefault(); renderAt(0); break;
            case 'End': e.preventDefault(); renderAt(list.length - 1); break;
        }
    };
    overlay.addEventListener('keydown', handlePresentationKeydown, { signal: ctl.signal });
    documentRef.addEventListener('keydown', handlePresentationKeydown, { capture: true, signal: ctl.signal });

    try {
        const fullscreenOverlay = overlay as FullscreenOverlayElement;
        const req = fullscreenOverlay.requestFullscreen || fullscreenOverlay.webkitRequestFullscreen;
        if (req) {
            nativeFullscreenRequested = true;
            void Promise.resolve(req.call(fullscreenOverlay)).catch((e: unknown) => {
                nativeFullscreenRequested = false;
                logger.debug('[lmsPresentationOverlay] fullscreen:', e);
            });
        }
    } catch (e: unknown) {
        nativeFullscreenRequested = false;
        logger.debug('[lmsPresentationOverlay] fullscreen:', e);
    }
    windowRef.setTimeout(() => overlay.focus(), 0);
}
