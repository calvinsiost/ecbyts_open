// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Pure-logic onboarding tutorial state machine for SPEC_CONSTELLATION_HUD_9_75.
// Hand-authored R1-safe (claude-otimizacao Wave L1). Sem DOM, sem localStorage,
// sem side-effects. Caller passa state atual + ação, recebe próximo state.

import { toFiniteNumber } from '../../utils/helpers/toFiniteNumber.js';
//
// Spec NOT (anti-requisitos):
// - NÃO ler DOM (pure-logic)
// - NÃO ler localStorage (caller persiste)
// - NÃO emoji em strings (R1-violation)
// - NÃO depende de Three.js/canvas (pure JS)

/**
 * @typedef {'not_started'|'welcome'|'basics'|'interaction'|'advanced'|'completed'|'skipped'} OnboardingStep
 */

/**
 * @typedef {Object} OnboardingState
 * @property {OnboardingStep} step       Atual step
 * @property {number} index              Índice numérico (0-based, util progress bar)
 * @property {number} total              Total steps progredíveis (excl. terminal)
 * @property {boolean} completed         True se terminou (completed|skipped)
 * @property {number} hintCount          Quantos hints já mostrados (anti-spam)
 */

const STEPS = Object.freeze(['not_started', 'welcome', 'basics', 'interaction', 'advanced', 'completed']);

const TERMINAL = Object.freeze(['completed', 'skipped']);
const PROGRESSABLE_COUNT = 4; // welcome..advanced

const STEP_CONTENT = Object.freeze({
    welcome: {
        titleKey: 'constellation.onboarding.welcome.title',
        bodyKey: 'constellation.onboarding.welcome.body',
        ctaKey: 'constellation.onboarding.next',
    },
    basics: {
        titleKey: 'constellation.onboarding.basics.title',
        bodyKey: 'constellation.onboarding.basics.body',
        ctaKey: 'constellation.onboarding.next',
    },
    interaction: {
        titleKey: 'constellation.onboarding.interaction.title',
        bodyKey: 'constellation.onboarding.interaction.body',
        ctaKey: 'constellation.onboarding.next',
    },
    advanced: {
        titleKey: 'constellation.onboarding.advanced.title',
        bodyKey: 'constellation.onboarding.advanced.body',
        ctaKey: 'constellation.onboarding.finish',
    },
});

/**
 * Cria state inicial. Aceita state persisted como input.
 * @param {Partial<OnboardingState>} [persisted]
 * @returns {OnboardingState}
 */
export function createOnboardingState(persisted: any) {
    const safe = persisted && typeof persisted === 'object' ? persisted : {};
    const step =
        STEPS.includes(/** @type {any} */ (safe.step)) || TERMINAL.includes(/** @type {any} */ (safe.step))
            ? /** @type {OnboardingStep} */ (safe.step)
            : 'not_started';
    return Object.freeze({
        step,
        index: _resolveIndex(step),
        total: PROGRESSABLE_COUNT,
        completed: TERMINAL.includes(step),
        hintCount: toFiniteNumber(safe.hintCount, 0, { min: 0 }),
    });
}

/**
 * Resolve índice 0-based para progress bar (welcome=0, basics=1, etc).
 * @param {string} step
 * @returns {number}
 */
function _resolveIndex(step: any) {
    switch (step) {
        case 'welcome':
            return 0;
        case 'basics':
            return 1;
        case 'interaction':
            return 2;
        case 'advanced':
            return 3;
        case 'completed':
        case 'skipped':
            return PROGRESSABLE_COUNT;
        default:
            return -1;
    }
}

/**
 * Avança para próximo step. Estado terminal retorna inalterado.
 * @param {OnboardingState} state
 * @returns {OnboardingState}
 */
export function advanceStep(state: any) {
    const next = _nextStep(state.step);
    return _withStep(state, next);
}

/**
 * Volta para step anterior. Não volta antes de 'welcome'.
 * @param {OnboardingState} state
 * @returns {OnboardingState}
 */
export function regressStep(state: any) {
    if (state.completed) return state;
    const prev = _prevStep(state.step);
    return _withStep(state, prev);
}

/**
 * Inicia tutorial — não-started → welcome.
 * @param {OnboardingState} state
 * @returns {OnboardingState}
 */
export function startOnboarding(state: any) {
    if (state.step !== 'not_started') return state;
    return _withStep(state, 'welcome');
}

/**
 * Skip tutorial — qualquer step → 'skipped'.
 * @param {OnboardingState} state
 * @returns {OnboardingState}
 */
export function skipOnboarding(state: any) {
    if (state.completed) return state;
    return _withStep(state, 'skipped');
}

/**
 * Reset para not_started. Preserva hintCount.
 * @param {OnboardingState} state
 * @returns {OnboardingState}
 */
export function resetOnboarding(state: any) {
    return Object.freeze({
        step: 'not_started',
        index: -1,
        total: PROGRESSABLE_COUNT,
        completed: false,
        hintCount: state?.hintCount || 0,
    });
}

/**
 * Incrementa hintCount (caller chama ao mostrar hint contextual).
 * Cap em 100 para evitar overflow histórico ridiculo.
 * @param {OnboardingState} state
 * @returns {OnboardingState}
 */
export function incrementHintCount(state: any) {
    return Object.freeze({
        ...state,
        hintCount: Math.min(100, (state.hintCount || 0) + 1),
    });
}

/**
 * Retorna conteúdo i18n keys para step atual. Null se terminal/not_started.
 * @param {OnboardingState} state
 * @returns {{titleKey:string, bodyKey:string, ctaKey:string}|null}
 */
export function getStepContent(state: any) {
    return (STEP_CONTENT as Record<string, any>)[state.step] || null;
}

/**
 * Serializa state para persistência (caller localStorage).
 * @param {OnboardingState} state
 * @returns {{step:string, hintCount:number}}
 */
export function serializeOnboarding(state: any) {
    return { step: state.step, hintCount: state.hintCount };
}

/**
 * Decide se o tutorial deve auto-disparar na primeira visita ao Constellation.
 * Pure-logic: só considera o state persisted (caller checa seen-key separado).
 * Retorna true APENAS quando o onboarding nunca foi iniciado (not_started/vazio) —
 * step terminal (completed/skipped) ou em progresso NÃO re-dispara.
 * @param {Partial<OnboardingState>} [persisted]
 * @returns {boolean}
 */
export function shouldAutoTriggerOnboarding(persisted: any) {
    const state = createOnboardingState(persisted);
    return state.step === 'not_started';
}

/**
 * @param {string} step
 * @returns {OnboardingStep}
 */
function _nextStep(step: any) {
    switch (step) {
        case 'not_started':
            return 'welcome';
        case 'welcome':
            return 'basics';
        case 'basics':
            return 'interaction';
        case 'interaction':
            return 'advanced';
        case 'advanced':
            return 'completed';
        default:
            return /** @type {OnboardingStep} */ (step);
    }
}

/**
 * @param {string} step
 * @returns {OnboardingStep}
 */
function _prevStep(step: any) {
    switch (step) {
        case 'advanced':
            return 'interaction';
        case 'interaction':
            return 'basics';
        case 'basics':
            return 'welcome';
        case 'welcome':
            return 'welcome';
        default:
            return /** @type {OnboardingStep} */ (step);
    }
}

/**
 * Helper imutável: cria novo state com step trocado.
 * @param {OnboardingState} state
 * @param {OnboardingStep} step
 * @returns {OnboardingState}
 */
function _withStep(state: any, step: any) {
    return Object.freeze({
        step,
        index: _resolveIndex(step),
        total: PROGRESSABLE_COUNT,
        completed: TERMINAL.includes(step),
        hintCount: state.hintCount || 0,
    });
}

export { STEPS as ONBOARDING_STEPS, TERMINAL as ONBOARDING_TERMINAL_STEPS };
