// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)

/* ================================================================
   LMS AUTHORING — EDITOR DE QUIZ (T3.7)

   Extraido de lmsAuthoringModal.ts (~180 LOC): render + wire + leitura do DOM
   do construtor de quiz (perguntas/opcoes, marcar correta, adicionar/remover).
   Sem estado proprio — recebe getExpandedLessonId/commitQuestions/rerender do
   host (lmsAuthoringModal.ts) para mutar o draft e re-renderizar, mantendo o
   _state do editor como fonte unica de verdade no arquivo principal.
   ================================================================ */

import { escapeHtml, escapeAttr } from '../helpers/html.js';
import { t as _t } from '../i18n/translations.js';
import type { DraftQuizOption, DraftQuizQuestion } from '../../core/training/_courseAuthoringPure.js';

const t = _t as any;
const tf = (key: string, fallback: string): string => {
    const value = t(key);
    return value && value !== key ? value : fallback;
};

/** Callbacks que o host (lmsAuthoringModal.ts) fornece para o quiz editor. */
export interface QuizFieldsHost {
    readonly getExpandedLessonId: () => string | null | undefined;
    readonly commitQuestions: (lessonId: string, questions: DraftQuizQuestion[]) => void;
    readonly rerender: () => void;
}

export function renderQuizFields(l: { questions?: unknown }): string {
    const questions: DraftQuizQuestion[] =
        Array.isArray(l.questions) && l.questions.length
            ? (l.questions as DraftQuizQuestion[])
            : [{ id: 'q1', text: '', options: [{ id: 'o1', text: '', correct: false }, { id: 'o2', text: '', correct: false }] }];

    const qBlocks = questions
        .map((q, qi) => {
            const opts: DraftQuizOption[] =
                Array.isArray(q.options) && q.options.length
                    ? q.options
                    : [{ id: 'o1', text: '', correct: false }, { id: 'o2', text: '', correct: false }];
            const optRows = opts
                .map(
                    (o, oi) => `
                    <div class="lms-author-quiz-opt" data-q-index="${qi}" data-opt-index="${oi}">
                        <input type="radio" name="lms-author-quiz-correct-${qi}" class="lms-author-quiz-correct"
                            data-q-index="${qi}" data-opt-index="${oi}"${o.correct ? ' checked' : ''}
                            aria-label="${escapeAttr(tf('lmsAuthor.quizMarkCorrect', 'Marcar como correta'))}">
                        <input type="text" class="lms-author-input lms-author-quiz-opt-text"
                            data-q-index="${qi}" data-opt-index="${oi}"
                            value="${escapeAttr(o.text || '')}" placeholder="${escapeAttr((tf('lmsAuthor.quizOption', 'Opção')) + ' ' + (oi + 1))}">
                        <button type="button" class="lms-author-quiz-remove-opt" data-q-index="${qi}" data-opt-index="${oi}"
                            aria-label="${escapeAttr(tf('lmsAuthor.quizRemoveOption', 'Remover opção'))}"
                            title="${escapeAttr(tf('lmsAuthor.quizRemoveOption', 'Remover opção'))}">&times;</button>
                    </div>`,
                )
                .join('');
            const removeQ =
                questions.length > 1
                    ? `<button type="button" class="lms-author-quiz-remove-q" data-q-index="${qi}"
                        aria-label="${escapeAttr(tf('lmsAuthor.quizRemoveQuestion', 'Remover pergunta'))}"
                        title="${escapeAttr(tf('lmsAuthor.quizRemoveQuestion', 'Remover pergunta'))}">&times;</button>`
                    : '';
            return `
                <div class="lms-author-quiz-q" data-q-index="${qi}">
                    <label class="lms-author-field">
                        <span>${escapeHtml((tf('lmsAuthor.quizQuestionN', 'Pergunta')) + ' ' + (qi + 1))}</span>
                        <span class="lms-author-quiz-q-head">
                            <input type="text" class="lms-author-input lms-author-quiz-question" data-q-index="${qi}"
                                value="${escapeAttr(q.text || '')}" placeholder="${escapeAttr(tf('lmsAuthor.quizQuestionPh', 'Ex.: Qual valor define a necessidade de remediação?'))}">
                            ${removeQ}
                        </span>
                    </label>
                    <div class="lms-author-quiz-opts" data-q-index="${qi}">
                        <span class="lms-author-quiz-opts-label">${escapeHtml(tf('lmsAuthor.quizOptions', 'Opções (marque a correta)'))}</span>
                        ${optRows}
                        <button type="button" class="btn btn-secondary lms-author-quiz-add-opt" data-q-index="${qi}">${escapeHtml(tf('lmsAuthor.quizAddOption', '+ Opção'))}</button>
                    </div>
                </div>`;
        })
        .join('');

    return `
        <div class="lms-author-quiz">
            ${qBlocks}
            <button type="button" class="btn btn-secondary lms-author-quiz-add-q">${escapeHtml(tf('lmsAuthor.quizAddQuestion', '+ Adicionar pergunta'))}</button>
        </div>`;
}

/** Gera um id curto e estável para pergunta/opção autorada. */
function genQuizId(prefix: 'q' | 'o'): string {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`;
}

/**
 * Lê TODAS as perguntas/opções do DOM do construtor de quiz (escopo da lição) e
 * devolve o array de perguntas. Usa os ancoradores data-q-index/data-opt-index.
 */
export function readQuizFromDom(scope: Element): DraftQuizQuestion[] {
    const qEls = [...scope.querySelectorAll('.lms-author-quiz-q')] as HTMLElement[];
    if (!qEls.length) return [];
    return qEls.map((qEl, qi) => {
        const text = (qEl.querySelector('.lms-author-quiz-question') as HTMLInputElement | null)?.value || '';
        const optEls = [...qEl.querySelectorAll('.lms-author-quiz-opt')] as HTMLElement[];
        const options: DraftQuizOption[] = optEls.map((optEl, oi) => {
            const txt = (optEl.querySelector('.lms-author-quiz-opt-text') as HTMLInputElement | null)?.value || '';
            const correct = !!(optEl.querySelector('.lms-author-quiz-correct') as HTMLInputElement | null)?.checked;
            return { id: `o${oi + 1}`, text: txt, correct };
        });
        return { id: `q${qi + 1}`, text, options };
    });
}

/** Sync DOM→draft do quiz inteiro (sem re-render — preserva o foco do input). */
function syncQuizFromDom(overlay: HTMLElement, lessonId: string, host: QuizFieldsHost): void {
    const scope = overlay.querySelector(`.lms-author-lesson[data-lesson-id="${CSS.escape(lessonId)}"] .lms-author-quiz`);
    if (!scope) return;
    host.commitQuestions(lessonId, readQuizFromDom(scope));
}

export function wireQuizFields(overlay: HTMLElement, signal: AbortSignal, host: QuizFieldsHost): void {
    const lessonId = host.getExpandedLessonId();
    if (!lessonId) return;
    const scope = overlay.querySelector(`.lms-author-lesson[data-lesson-id="${CSS.escape(lessonId)}"] .lms-author-quiz`);
    if (!scope) return;

    const sync = () => syncQuizFromDom(overlay, lessonId, host);
    // Edição de texto (perguntas e opções) e marcação de correta: sync sem re-render.
    scope.querySelectorAll('.lms-author-quiz-question').forEach((el) => el.addEventListener('input', sync, { signal }));
    scope.querySelectorAll('.lms-author-quiz-opt-text').forEach((el) => el.addEventListener('input', sync, { signal }));
    scope.querySelectorAll('.lms-author-quiz-correct').forEach((el) => el.addEventListener('change', sync, { signal }));

    // "Adicionar pergunta": persiste o DOM, anexa uma pergunta em branco, re-render.
    scope.querySelector('.lms-author-quiz-add-q')?.addEventListener(
        'click',
        () => {
            const qs = readQuizFromDom(scope);
            qs.push({ id: genQuizId('q'), text: '', options: [{ id: 'o1', text: '', correct: false }, { id: 'o2', text: '', correct: false }] });
            host.commitQuestions(lessonId, qs);
            host.rerender();
        },
        { signal },
    );

    // "Adicionar opção" (por pergunta).
    scope.querySelectorAll('.lms-author-quiz-add-opt').forEach((btn) =>
        btn.addEventListener(
            'click',
            () => {
                const qi = Number((btn as HTMLElement).dataset.qIndex);
                const qs = readQuizFromDom(scope);
                const q = qs[qi];
                if (q) {
                    q.options = Array.isArray(q.options) ? q.options : [];
                    q.options.push({ id: `o${q.options.length + 1}`, text: '', correct: false });
                    host.commitQuestions(lessonId, qs);
                    host.rerender();
                }
            },
            { signal },
        ),
    );

    // Remover opção (mantém ≥1 opção por pergunta).
    scope.querySelectorAll('.lms-author-quiz-remove-opt').forEach((btn) =>
        btn.addEventListener(
            'click',
            () => {
                const qi = Number((btn as HTMLElement).dataset.qIndex);
                const oi = Number((btn as HTMLElement).dataset.optIndex);
                const qs = readQuizFromDom(scope);
                const q = qs[qi];
                if (q && Array.isArray(q.options) && q.options.length > 1) {
                    q.options.splice(oi, 1);
                    host.commitQuestions(lessonId, qs);
                    host.rerender();
                }
            },
            { signal },
        ),
    );

    // Remover pergunta (mantém ≥1 pergunta).
    scope.querySelectorAll('.lms-author-quiz-remove-q').forEach((btn) =>
        btn.addEventListener(
            'click',
            () => {
                const qi = Number((btn as HTMLElement).dataset.qIndex);
                const qs = readQuizFromDom(scope);
                if (qs.length > 1) {
                    qs.splice(qi, 1);
                    host.commitQuestions(lessonId, qs);
                    host.rerender();
                }
            },
            { signal },
        ),
    );
}
