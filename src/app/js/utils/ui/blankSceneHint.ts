// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   BLANK SCENE HINT — guia visual mínimo da cena 3D vazia
   T7.3 SPEC_COMMERCIAL_READINESS_DOD: "Blank Project" caía numa cena
   vazia sem nenhum guia. Este cartão discreto (reusa as classes
   .tour-tooltip/.tour-btn de app/css/tour.css — zero CSS novo) oferece
   2-3 próximos passos clicáveis, é dispensável e NÃO reaparece depois
   de dispensado (persistência via safeSetItem).
   ================================================================ */
import { t } from '../i18n/translations.js';
import { safeSetItem } from '../storage/storageMonitor.js';
import { shouldShowBlankSceneHint, BLANK_SCENE_HINT_KEY } from './_blankSceneHintPure.js';

let hintEl: HTMLElement | null = null;

/** i18n com fallback (mesmo padrão de welcomeScreen._t). */
function _t(key: string, fallback: string): string {
    const translated = t(key);
    return translated && translated !== key ? translated : fallback;
}

function _dismiss(persist: boolean): void {
    if (persist) safeSetItem(BLANK_SCENE_HINT_KEY, new Date().toISOString());
    if (hintEl) {
        hintEl.remove();
        hintEl = null;
    }
}

function _callGlobal(name: string, arg: string | null): void {
    const fn = (window as any)[name];
    if (typeof fn === 'function') {
        try {
            fn(arg ?? undefined);
        } catch (e: any) {
            console.debug('[blankSceneHint] action failed:', e?.message || e);
        }
    }
}

/**
 * Mostra o hint da cena vazia (uma vez por máquina, até ser dispensado).
 * Reusa .tour-tooltip (position:fixed) com âncora inline bottom-left,
 * fora do caminho dos HUDs (geo-hud/scene-hud vivem bottom-right).
 *
 * @returns o elemento criado ou null quando suprimido.
 */
export function showBlankSceneHint(doc: Document = document): HTMLElement | null {
    let storage: Storage | null = null;
    try {
        storage = window.localStorage;
    } catch {
        storage = null;
    }
    if (!shouldShowBlankSceneHint(storage)) return null;
    if (hintEl) return hintEl;

    const el = doc.createElement('div');
    el.className = 'tour-tooltip';
    el.setAttribute('data-position', 'center'); // esconde a seta do tooltip
    el.setAttribute('role', 'complementary');
    el.setAttribute('data-testid', 'blank-scene-hint');
    el.style.left = '16px';
    el.style.bottom = '16px';
    el.style.top = 'auto';
    el.setAttribute('aria-label', _t('blankHintTitle', 'Your project is empty'));
    el.innerHTML = `
        <div class="tour-tooltip-header">
            <span class="tour-chapter-name">${_t('blankHintKicker', 'Getting started')}</span>
            <button type="button" class="tour-btn" data-action="dismiss"
                    aria-label="${_t('blankHintDismiss', 'Dismiss')}"
                    data-testid="blank-scene-hint-dismiss">&times;</button>
        </div>
        <h4 class="tour-tooltip-title">${_t('blankHintTitle', 'Your project is empty')}</h4>
        <p class="tour-tooltip-body">${_t('blankHintBody', 'Pick a next step to bring this scene to life:')}</p>
        <div class="tour-tooltip-nav">
            <button type="button" class="tour-btn primary" data-action="add-element"
                    data-testid="blank-scene-hint-add">${_t('blankHintAddElement', 'Add first element')}</button>
            <button type="button" class="tour-btn" data-action="demo-model"
                    data-testid="blank-scene-hint-demo">${_t('blankHintDemoModel', 'Load demo model')}</button>
            <button type="button" class="tour-btn" data-action="start-tour"
                    data-testid="blank-scene-hint-tour">${_t('blankHintStartTour', 'Take the tour')}</button>
        </div>
    `;
    el.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement | null)?.closest?.('[data-action]') as HTMLElement | null;
        if (!btn) return;
        const action = btn.getAttribute('data-action');
        // Qualquer escolha (ou dispensa) persiste a dispensa — não reaparece.
        _dismiss(true);
        if (action === 'add-element') _callGlobal('handleAddElement', 'well');
        else if (action === 'demo-model') _callGlobal('handleGenerateRandomModel', null);
        else if (action === 'start-tour') _callGlobal('handleStartTour', null);
    });
    doc.body.appendChild(el);
    hintEl = el;
    return el;
}

/** Remove o hint sem persistir (uso interno/testes). */
export function hideBlankSceneHint(): void {
    _dismiss(false);
}
