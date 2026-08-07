// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Constellation HUD onboarding tutorial modal (F2-wiring slice).
// Hand-authored R1-safe consumindo onboardingState FSM (Wave L1).
// SPEC_CONSTELLATION_HUD_9_75 §missing "onboarding tutorial" — UI surface.
//
// Spec NOT respeitados:
// - NÃO reimplementar FSM (delega 100% a onboardingState.js)
// - NÃO criar novo modal system (createModal factory)
// - NÃO ler/escrever localStorage diretamente (caller persiste serializeOnboarding)
// - NÃO emoji em strings (HTML entities)

import { createModal } from './modal.js';
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import {
    createOnboardingState,
    advanceStep,
    regressStep,
    startOnboarding,
    skipOnboarding,
    getStepContent,
    serializeOnboarding,
} from '../../core/constellation/onboardingState.js';

/**
 * @typedef {Object} OnboardingPanelOpts
 * @property {object} [persistedState]    State persisted (from localStorage)
 * @property {(state:object)=>void} [onChange]  Caller persiste serialized state
 * @property {()=>void} [onComplete]      Caller sinaliza tutorial fechado
 */

/**
 * Renderiza progress bar (4 dots + active highlight).
 * @param {object} state
 * @returns {string} HTML string (safe — no user data)
 */
function _renderProgress(state: any) {
    const dots = [0, 1, 2, 3].map((i: any) => {
        const cls =
            i === state.index ? 'cop-dot cop-dot--active' : i < state.index ? 'cop-dot cop-dot--done' : 'cop-dot';
        return `<span class="${cls}" aria-hidden="true"></span>`;
    });
    return `<div class="cop-progress" role="progressbar" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${state.index + 1}">
        ${dots.join('')}
    </div>`;
}

/**
 * Renderiza body do passo atual (title + body + actions).
 * @param {object} state
 * @returns {HTMLElement}
 */
function _renderStep(state: any) {
    const body = document.createElement('div');
    body.className = 'cop-body';
    const content = getStepContent(state);
    if (!content) {
        body.innerHTML = `<div class="cop-empty">${escapeHtml(t('constellation.onboarding.empty') || 'Sem conteúdo')}</div>`;
        return body;
    }
    const title = t(content.titleKey) || content.titleKey;
    const text = t(content.bodyKey) || content.bodyKey;
    const cta = t(content.ctaKey) || content.ctaKey;
    const back = t('constellation.onboarding.back') || 'Voltar';
    const skip = t('constellation.onboarding.skip') || 'Pular';
    const isFirst = state.index === 0;
    // eslint-disable-next-line
    const isLast = state.index === state.total - 1;
    body.innerHTML = `
        ${_renderProgress(state)}
        <h3 class="cop-title">${escapeHtml(title)}</h3>
        <p class="cop-text">${escapeHtml(text)}</p>
        <div class="cop-actions">
            <button type="button" class="cop-btn cop-btn--ghost" data-action="skip">${escapeHtml(skip)}</button>
            ${isFirst ? '' : `<button type="button" class="cop-btn cop-btn--ghost" data-action="back">${escapeHtml(back)}</button>`}
            <button type="button" class="cop-btn cop-btn--primary" data-action="advance">${escapeHtml(cta)}</button>
        </div>
    `;
    return body;
}

/**
 * Abre painel onboarding. Stateful — re-renderiza ao avançar/voltar.
 * @param {OnboardingPanelOpts} [opts]
 * @returns {{close:Function}}
 */
export function openConstellationOnboardingPanel(opts: any = {}) {
    let state = createOnboardingState(opts.persistedState);
    // Auto-start se vier not_started
    if (state.step === 'not_started') {
        state = startOnboarding(state);
    }
    if (state.completed) {
        // Já completado — não re-abrir
        return { close: () => {} };
    }
    const body = _renderStep(state);
    const handle = createModal({
        title: t('constellation.onboarding.modalTitle') || 'Tutorial Constellation',
        body,
        size: 'sm',
        extraClass: 'cop-modal',
        closeOnEsc: true,
        closeOnBackdropClick: false, // tutorial deve ser explicitamente fechado
        onClose: () => opts.onComplete?.(),
    });
    const rerender = () => {
        body.innerHTML = '';
        body.replaceWith(_renderStep(state));
        _wire(handle, state);
    };
    const _wire = (h: any, st: any) => {
        const dialog = h.dialog;
        dialog.querySelector('[data-action="advance"]')?.addEventListener('click', () => {
            state = advanceStep(st);
            opts.onChange?.(serializeOnboarding(state));
            if (state.completed) {
                handle.close();
                opts.onComplete?.();
                return;
            }
            rerender();
        });
        dialog.querySelector('[data-action="back"]')?.addEventListener('click', () => {
            state = regressStep(st);
            opts.onChange?.(serializeOnboarding(state));
            rerender();
        });
        dialog.querySelector('[data-action="skip"]')?.addEventListener('click', () => {
            state = skipOnboarding(st);
            opts.onChange?.(serializeOnboarding(state));
            handle.close();
            opts.onComplete?.();
        });
    };
    _wire(handle, state);
    return { close: handle.close };
}
