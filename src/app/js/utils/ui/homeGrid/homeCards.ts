// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render das seções + grid de cards.
 * claude - ui 2026-06-15.
 *
 * EN: Renders the home action cards grouped into category sections (header with
 *     title + count, then a grid of `.home-card` elements built by the injected
 *     `buildCardElement`). Click/keydown listeners are wired here but delegate to
 *     the injected `onCardClick` so the CSP-safe click flow (invite gate,
 *     telemetry, switchView) stays in homeGrid. Returns the list of cards whose
 *     handler is missing (for the caller's diagnostic warn). Pulls ~50 lines of
 *     the loop body out of the monolith; behavior identical.
 *
 * PT (leigo): desenha os cartões de ação da tela inicial agrupados em seções
 *     (cada seção tem título + contagem, depois a grade de cartões). O clique é
 *     ligado aqui mas chama de volta o homeGrid (que decide o que o clique faz).
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4 (J2: 4 seções, 16 cards).
 */

/** Card cuja ação não tem handler registrado (p/ diagnóstico do chamador). */
export interface MissingHandlerEntry {
    readonly cardId: string;
    readonly handler: string;
}

/** Seção pronta (de groupCardsByCategory): key + título + cards. */
interface CardSection {
    readonly key: string;
    readonly title: string;
    readonly cards: readonly any[];
}

/** Dependências injetadas — i18n, checagem/clique de handler, builder do card. */
export interface RenderCardSectionsDeps {
    readonly t: (key: string) => string;
    readonly hasHandler: (name: string) => boolean;
    /** Callback de clique (mantém o fluxo CSP-safe no homeGrid). */
    readonly onCardClick: (card: any) => void;
    /** Construtor do elemento de um card (homeCardElement.buildHomeCardElement). */
    readonly buildCardElement: (
        card: any,
        isPrimary: boolean,
        deps: { t: (k: string) => string; hasHandler: (n: string) => boolean },
    ) => { el: HTMLElement; unavailable: boolean };
}

/**
 * Renderiza as seções + grids de cards dentro de `gridEl`. Comportamento idêntico
 * ao loop inline legado de _renderCards. Devolve os handlers ausentes.
 *
 * @param gridEl Container da grade (#home-grid / _gridEl).
 * @param sections Seções não-vazias na ordem canônica (de groupCardsByCategory).
 * @param deps Dependências injetadas.
 */
export function renderHomeCardSections(
    gridEl: HTMLElement,
    sections: readonly CardSection[],
    deps: RenderCardSectionsDeps,
): MissingHandlerEntry[] {
    const missingHandlers: MissingHandlerEntry[] = [];

    for (const category of sections) {
        const key = category.key;

        // Cabeçalho da seção (título + contagem)
        const section = document.createElement('div');
        section.className = 'home-section';
        if (key === 'primary') section.classList.add('primary');

        const header = document.createElement('div');
        header.className = 'home-section-header';
        header.innerHTML = `
            <span class="home-section-title">${category.title}</span>
            <span class="home-section-count">${category.cards.length}</span>
        `;
        section.appendChild(header);

        // Grade de cards da seção
        const grid = document.createElement('div');
        grid.className = 'home-section-grid';
        if (key === 'primary') grid.classList.add('single');

        for (const card of category.cards) {
            const { el, unavailable } = deps.buildCardElement(card, key === 'primary', {
                t: deps.t,
                hasHandler: deps.hasHandler,
            });

            if (!unavailable) {
                el.addEventListener('click', () => deps.onCardClick(card));
                el.addEventListener('keydown', (e: any) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        deps.onCardClick(card);
                    }
                });
            } else if (card.handler) {
                missingHandlers.push({ cardId: card.id, handler: card.handler });
            }

            grid.appendChild(el);
        }

        section.appendChild(grid);
        gridEl.appendChild(section);
    }

    return missingHandlers;
}
