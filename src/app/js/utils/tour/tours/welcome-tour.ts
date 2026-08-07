// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Copyright (c) 2026 Calvin Stefan Iost

/* ================================================================
   WELCOME TOUR — 5 passos para primeira visita
   Apresenta os componentes principais da interface ao novo usuário.
   ================================================================ */

export const FIRST_VISIT_RANDOM_CTA_ID = 'first-visit-random-cta' as const;

export type FirstVisitRandomCtaId = typeof FIRST_VISIT_RANDOM_CTA_ID;

export interface TourStep {
    id: string;
    target: string;
    titleKey: string;
    bodyKey: string;
    placement: 'top' | 'bottom' | 'left' | 'right';
    action?: () => void;
    postAction?: () => void;
}

export interface WelcomeTour {
    id: string;
    titleKey: string;
    steps: TourStep[];
}

declare global {
    interface Window {
        t?: (key: string) => string | undefined;
        generateRandomModel?: (params: { source: string }) => Promise<unknown> | void;
        handleGenerateRandomModel?: (params: { source: string }) => Promise<unknown> | void;
        handleSwitchView?: (view: string) => Promise<unknown> | void;
    }
}

function _getFirstActionLabel(): string {
    try {
        const translated = globalThis.window?.t?.('home.empty.cta.generate');
        if (translated && translated !== 'home.empty.cta.generate') return translated;
    } catch (e: unknown) {
        console.debug('[welcomeTour] label:', (e as Error)?.message || e);
    }
    return 'Generate random model';
}

async function _runFirstAction(): Promise<void> {
    const win = globalThis.window;
    if (!win) return;

    const generate = win.generateRandomModel || win.handleGenerateRandomModel;
    if (typeof generate === 'function') {
        await Promise.resolve(generate({ source: 'first-visit-tour-cta' }));
    }
    win.dispatchEvent(new CustomEvent('modelChanged', { detail: { source: 'first-visit-tour-cta' } }));
    if (typeof win.handleSwitchView === 'function') {
        await Promise.resolve(win.handleSwitchView('3d'));
    }
}

export function showFirstVisitRandomCta(): void {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(FIRST_VISIT_RANDOM_CTA_ID);
    if (existing) {
        existing.classList.add('tour-first-action-cta', 'is-pulsing');
        existing.style.minHeight = '46px';
        return;
    }

    const button = document.createElement('button');
    button.id = FIRST_VISIT_RANDOM_CTA_ID;
    button.type = 'button';
    button.className = 'tour-first-action-cta is-pulsing';
    button.style.minHeight = '46px';
    button.setAttribute('data-testid', FIRST_VISIT_RANDOM_CTA_ID);
    button.setAttribute('aria-label', _getFirstActionLabel());
    button.innerHTML = `
        <span class="tour-first-action-cta-icon" aria-hidden="true">&#8635;</span>
        <span class="tour-first-action-cta-text">${_getFirstActionLabel()}</span>
    `;
    button.addEventListener('click', () => {
        _runFirstAction().catch((e: unknown) => console.warn('[welcomeTour] first action failed:', (e as Error)?.message || e));
    });
    document.body.appendChild(button);
}

export function removeFirstVisitRandomCta(): void {
    if (typeof document === 'undefined') return;
    document.getElementById(FIRST_VISIT_RANDOM_CTA_ID)?.remove();
}

/**
 * Tour de boas-vindas exibido na primeira visita do usuario.
 * Cobre: ribbon, painel esquerdo, inspector, HUD e CTA de primeiro valor.
 */
export const welcomeTour: WelcomeTour = {
    id: 'welcome',
    titleKey: 'tour.welcome.title',
    steps: [
        {
            id: 'w1',
            target: '#ribbon-main',
            titleKey: 'tour.welcome.step1.title',
            bodyKey: 'tour.welcome.step1.body',
            placement: 'bottom',
        },
        {
            id: 'w2',
            target: '#left-panel',
            titleKey: 'tour.welcome.step2.title',
            bodyKey: 'tour.welcome.step2.body',
            placement: 'right',
        },
        {
            id: 'w3',
            target: '#right-panel',
            titleKey: 'tour.welcome.step3.title',
            bodyKey: 'tour.welcome.step3.body',
            placement: 'left',
        },
        {
            id: 'w4',
            target: '#constellation-hud',
            titleKey: 'tour.welcome.step4.title',
            bodyKey: 'tour.welcome.step4.body',
            placement: 'top',
        },
        {
            id: 'w5',
            target: `#${FIRST_VISIT_RANDOM_CTA_ID}`,
            titleKey: 'tour.welcome.step5.title',
            bodyKey: 'tour.welcome.step5.body',
            placement: 'top',
            action: showFirstVisitRandomCta,
            postAction: removeFirstVisitRandomCta,
        },
    ],
};
