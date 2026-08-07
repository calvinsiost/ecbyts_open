// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

import { escapeAttr } from '../helpers/html.js';
import { showToast } from './toast.js';

export const PRINT_ASSET_READY_TIMEOUT_MS = 4500;

export interface LmsPresentationPrintLessonLike {
    readonly id?: string | null;
}

export interface LmsPresentationSlideRender {
    readonly html: string;
}

export interface LmsPresentationPrintOptions<TLesson extends LmsPresentationPrintLessonLike> {
    readonly lessons: readonly TLesson[] | null | undefined;
    readonly sourceLessons?: readonly TLesson[] | null;
    readonly renderSlide: (lesson: TLesson, lessonIndex: number, printIndex: number) => LmsPresentationSlideRender;
    readonly translate: (key: string, fallback: string) => string;
    readonly documentRef?: Document;
    readonly windowRef?: Window;
    readonly toast?: (message: string, type?: string) => unknown;
}

export function presentationLessonIndex<TLesson extends LmsPresentationPrintLessonLike>(
    lesson: TLesson,
    sourceLessons: readonly TLesson[] | null | undefined,
    fallbackIndex: number,
): number {
    const lessonId = lesson?.id;
    if (!lessonId || !Array.isArray(sourceLessons)) return fallbackIndex;
    const originalIndex = sourceLessons.findIndex((entry) => Boolean(entry?.id) && entry.id === lessonId);
    return originalIndex >= 0 ? originalIndex : fallbackIndex;
}

export function cleanupPresentationPrintRoot(documentRef: Document = document): void {
    documentRef.getElementById('lms-present-print-root')?.remove();
    documentRef.body.classList.remove('lms-present-printing');
}

function resolveOnce(callback: () => void): () => void {
    let resolved = false;
    return () => {
        if (resolved) return;
        resolved = true;
        callback();
    };
}

function waitForPresentationImage(img: HTMLImageElement): Promise<void> {
    if (img.complete) return Promise.resolve();
    if (typeof img.decode === 'function') {
        return img.decode().then(
            () => undefined,
            () => undefined,
        );
    }
    return new Promise((resolve) => {
        const done = resolveOnce(resolve);
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
    });
}

function withPrintAssetTimeout(
    promise: Promise<unknown>,
    windowRef: Window,
    timeoutMs = PRINT_ASSET_READY_TIMEOUT_MS,
): Promise<void> {
    return new Promise((resolve) => {
        const done = resolveOnce(resolve);
        const timer = windowRef.setTimeout(done, timeoutMs);
        void promise.finally(() => {
            windowRef.clearTimeout(timer);
            done();
        });
    });
}

export function waitForPresentationPrintAssets(
    root: ParentNode,
    documentRef: Document = document,
    windowRef: Window = window,
): Promise<void> {
    const images = Array.from(root.querySelectorAll<HTMLImageElement>('img'));
    const imageReady = Promise.all(images.map(waitForPresentationImage));
    const fontReady = documentRef.fonts?.ready?.then(
        () => undefined,
        () => undefined,
    ) ?? Promise.resolve();
    return withPrintAssetTimeout(Promise.all([imageReady, fontReady]), windowRef);
}

export function printPresentationSlidesToPdf<TLesson extends LmsPresentationPrintLessonLike>(
    options: LmsPresentationPrintOptions<TLesson>,
): void {
    const list = Array.isArray(options.lessons) ? options.lessons : [];
    if (!list.length) return;
    const documentRef = options.documentRef ?? document;
    const windowRef = options.windowRef ?? window;
    cleanupPresentationPrintRoot(documentRef);
    const root = documentRef.createElement('section');
    root.id = 'lms-present-print-root';
    root.className = 'lms-present-print-root';
    root.setAttribute('role', 'presentation');
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = list
        .map((lesson, index) => {
            const lessonIndex = presentationLessonIndex(lesson, options.sourceLessons, index);
            const rendered = options.renderSlide(lesson, lessonIndex, index);
            return `
                <article class="lms-present-print-slide" aria-label="${escapeAttr(`Slide ${index + 1}`)}">
                    <div class="lms-present-print-stage">${rendered.html}</div>
                </article>`;
        })
        .join('');
    documentRef.body.appendChild(root);
    documentRef.body.classList.add('lms-present-printing');
    const notify = options.toast ?? showToast;
    notify(
        options.translate(
            'lmsAuthor.present.exportPdfReady',
            'Abrindo a exportacao em PDF. Escolha "Salvar como PDF" na janela do navegador.',
        ),
        'info',
    );
    let cleaned = false;
    const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        cleanupPresentationPrintRoot(documentRef);
    };
    windowRef.addEventListener('afterprint', cleanup, { once: true });
    const printNow = () => {
        windowRef.focus();
        windowRef.print();
        windowRef.setTimeout(cleanup, 15000);
    };
    void waitForPresentationPrintAssets(root, documentRef, windowRef).then(printNow, printNow);
}
