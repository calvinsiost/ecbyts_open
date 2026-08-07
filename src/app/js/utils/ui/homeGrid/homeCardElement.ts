// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — construtor DOM de UM card de ação.
 * claude - ui 2026-06-15.
 *
 * EN: Builds the DOM element for a single home action card (icon + title +
 *     desc + optional primary arrow), with its a11y attributes (role=button,
 *     aria-label, tabindex, aria-disabled when unavailable). Deps (t, hasHandler)
 *     are injected. It does NOT attach click/keydown listeners — the caller
 *     (homeGrid `_renderCards`) wires those so the CSP-safe click flow and
 *     missing-handler bookkeeping stay together. Returns `{ el, unavailable }`.
 *     Extraction of ~45 repetitive createElement lines out of the monolith.
 *
 * PT (leigo): monta o "cartão" (botão) de uma ação da tela inicial — ícone,
 *     título, descrição e a setinha (no card principal) — já com os atributos
 *     de acessibilidade. Quem liga o clique é o homeGrid; aqui só montamos a
 *     aparência. `unavailable` = ação sem handler disponível (fica desabilitada).
 *
 * DOM-coupled (cria elementos) — validado pelo smoke E2E home-stats-s4 (J2:
 * cards renderizam com estrutura/atributos corretos).
 */

/** Dependências injetadas (i18n + checagem de handler) — sem globais ocultos. */
export interface CardElementDeps {
    /** Tradutor i18n (chave → texto); cai na própria chave se ausente. */
    readonly t: (key: string) => string;
    /** True se existe um handler global registrado com esse nome. */
    readonly hasHandler: (name: string) => boolean;
}

/** Resultado: o elemento + se a ação está indisponível (sem handler). */
export interface CardElementResult {
    readonly el: HTMLElement;
    readonly unavailable: boolean;
}

/**
 * Constrói o elemento `.home-card` de um card. Comportamento idêntico ao bloco
 * inline legado de _renderCards (mesmas classes/atributos/ordem de filhos).
 *
 * @param card Descritor do card (id, icon, i18nKey, i18nDescKey, viewTarget, handler).
 * @param isPrimary Card da categoria "primary" (estilo destacado + seta).
 * @param deps Tradutor + checador de handler.
 */
export function buildHomeCardElement(card: any, isPrimary: boolean, deps: CardElementDeps): CardElementResult {
    const t = deps.t;
    const unavailable = !card.viewTarget && !deps.hasHandler(card.handler);

    const el = document.createElement('div');
    el.className = 'home-card';
    if (isPrimary) el.classList.add('home-card-primary');
    el.setAttribute('data-testid', 'action-card');
    el.setAttribute('data-card-id', card.id);
    el.setAttribute('data-route', card.viewTarget ? `#${card.viewTarget}` : `#${card.id}`);
    el.setAttribute('tabindex', '0');
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', t(card.i18nKey) || card.i18nKey);

    if (unavailable) {
        el.classList.add('home-card-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.setAttribute('tabindex', '-1');
    }

    const iconWrap = document.createElement('div');
    iconWrap.className = 'home-card-icon';
    if (isPrimary) iconWrap.classList.add('home-card-icon-large');
    const iconEl = document.createElement('span');
    iconEl.setAttribute('data-icon', card.icon);
    iconEl.setAttribute('data-icon-size', isPrimary ? '24px' : '20px');
    iconWrap.appendChild(iconEl);

    const title = document.createElement('div');
    title.className = 'home-card-title';
    title.textContent = t(card.i18nKey) || card.i18nKey;

    const desc = document.createElement('div');
    desc.className = 'home-card-desc';
    desc.textContent = t(card.i18nDescKey) || card.i18nDescKey;

    el.appendChild(iconWrap);
    el.appendChild(title);
    el.appendChild(desc);

    // Seta indicadora só no card primário (mesma ordem de filhos do legado).
    if (isPrimary) {
        const arrow = document.createElement('div');
        arrow.className = 'home-card-arrow';
        arrow.innerHTML = '<span data-icon="arrow-right" data-icon-size="16px"></span>';
        el.appendChild(arrow);
    }

    return { el, unavailable };
}
