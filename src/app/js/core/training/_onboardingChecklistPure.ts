// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
//
// T7.3 — checklist "Comece aqui" (painel Treinamentos, jornada do aluno novo).
//
// Pure-logic extraction: computa os 3 passos ("inscreveu", "1a licao",
// "1a pratica") a partir de sinais JA persistidos (IDB enrollments + estado
// de tours), sem tocar DOM/localStorage/window diretamente — os call-sites
// (lmsManager.ts / trainingPanelRenderersView.ts) leem as fontes reais e
// passam valores simples para dentro.

/** Um passo do checklist "Comece aqui". */
export interface OnboardingChecklistStep {
    readonly id: 'enrolled' | 'lesson_completed' | 'guided_practice';
    readonly done: boolean;
}

/** Entradas cruas necessárias para computar os 3 passos. */
export interface OnboardingChecklistInput {
    /** `true` quando há pelo menos 1 matrícula (enrollments.length > 0). */
    readonly hasEnrollment: boolean;
    /** `true` quando pelo menos 1 lição foi concluída em qualquer curso. */
    readonly hasCompletedLesson: boolean;
    /** `true` quando pelo menos 1 prática guiada (tour) foi concluída. */
    readonly hasGuidedPractice: boolean;
}

/** Resultado do cômputo: os passos + se todos já foram concluídos. */
export interface OnboardingChecklistResult {
    readonly steps: readonly OnboardingChecklistStep[];
    readonly allDone: boolean;
    readonly doneCount: number;
}

export interface OnboardingChecklistProgress {
    readonly currentStepId: OnboardingChecklistStep['id'] | null;
    readonly nextStepId: OnboardingChecklistStep['id'] | null;
}

/**
 * Computa os 3 passos do checklist "Comece aqui", byte-identical à ordem
 * inscreveu → 1ª lição → 1ª prática (T7.3). Pura: nenhum acesso a
 * DOM/storage — apenas deriva a partir dos booleanos já resolvidos pelo
 * chamador a partir das fontes persistidas reais (IDB enrollments,
 * completed_lesson_ids, getGuidedTourState().totalCompleted).
 *
 * @param input sinais já resolvidos pelo chamador
 * @returns os 3 passos (ordem fixa) + `allDone`/`doneCount`
 */
export function computeOnboardingChecklistSteps(
    input: OnboardingChecklistInput,
): OnboardingChecklistResult {
    const steps: OnboardingChecklistStep[] = [
        { id: 'enrolled', done: Boolean(input.hasEnrollment) },
        { id: 'lesson_completed', done: Boolean(input.hasCompletedLesson) },
        { id: 'guided_practice', done: Boolean(input.hasGuidedPractice) },
    ];
    const doneCount = steps.filter((step) => step.done).length;
    return { steps, allDone: doneCount === steps.length, doneCount };
}

/**
 * Decide se o checklist "Comece aqui" deve aparecer: só para usuário novo —
 * ou seja, enquanto os 3 passos ainda não foram todos concluídos. Uma vez
 * `allDone`, o checklist se auto-oculta (painel não fica poluído para quem
 * já passou do onboarding).
 *
 * @param result saída de {@link computeOnboardingChecklistSteps}
 * @returns `true` quando o checklist deve ser renderizado
 */
export function shouldShowOnboardingChecklist(result: OnboardingChecklistResult): boolean {
    return !result.allDone;
}

/** Resolve o passo atual e o seguinte sem duplicar essa regra na camada visual. */
export function describeOnboardingChecklistProgress(
    result: OnboardingChecklistResult,
): OnboardingChecklistProgress {
    const currentIndex = result.steps.findIndex((step) => !step.done);
    if (currentIndex < 0) return { currentStepId: null, nextStepId: null };
    return {
        currentStepId: result.steps[currentIndex]?.id ?? null,
        nextStepId: result.steps.slice(currentIndex + 1).find((step) => !step.done)?.id ?? null,
    };
}

Object.freeze(computeOnboardingChecklistSteps);
Object.freeze(shouldShowOnboardingChecklist);
Object.freeze(describeOnboardingChecklistProgress);
