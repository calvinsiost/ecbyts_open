// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5 (gridCards lógica pura) — decisão PURA de QUAIS
 * cards a home renderiza, em que ordem, quais visíveis, e o view-model (estado)
 * de cada card. claude (refactor) 2026-06-18.
 *
 * EN: Pure card-list / card-state decision for the home action grid. No DOM, no
 *     i18n side-effects, no globals, no innerHTML. The renderer in
 *     homeGrid/homeCards.ts (DOM) consumes these decisions and the barrel
 *     (homeGrid.ts) maps them to elements. The logic MIRRORS the legacy
 *     behaviour exactly:
 *       - `resolveCardList(state)` reproduces `_getVisibleOrderedCards()` →
 *         `filterOrderCards(getHomeCardsConfig(), ACTION_CARDS)`: undefined
 *         config = visible, `visible: false` hides, stable sort by `order`
 *         (default 999). The 6 default "primary" cards (spatial-view, training-
 *         lms, create-presentation, ai-assistant + any other 'primary') and the
 *         16 total cards are preserved when no config overrides exist.
 *       - `resolveCardState(cardId, model)` reproduces the per-card view-model
 *         that the legacy `_buildHomeCardElement` consumed: `unavailable` when
 *         the card needs a handler that is not registered, `isPrimary` for the
 *         'primary' category, and the dispatch shape (`viewTarget` first, else
 *         `handler`) that `_onCardClick` follows.
 *       - `renderCards(state)` (DoD literal name) is the PURE resolver of the
 *         full ordered+grouped card render plan (sections + per-card state) — it
 *         decides WHAT to draw, the DOM module draws it.
 *       - `updateCard(cardId, data)` (DoD literal name) is the PURE merge of new
 *         data into a card's state (e.g. availability flip after a handler is
 *         registered) — returns a new frozen state, never mutates input.
 *
 * PT (leigo): decide, sem mexer na tela, QUAIS cartões de ação a tela inicial
 *     mostra, em que ordem, quais ficam escondidos (conforme a configuração do
 *     usuário) e a "ficha" de cada cartão (se ele está disponível para clicar,
 *     se é cartão de destaque, e o que o clique faz). Quem desenha é o homeGrid;
 *     aqui só calculamos a lista e o estado. São exatamente os mesmos cartões
 *     que o código antigo decidia embutido — agora isolados e testáveis.
 *
 * Pure: entradas → saída congelada, determinística. Cheap tests:
 * tests/ui/homeGrid/grid-cards.test.mjs.
 */

import {
    filterOrderCards,
    computeCardListHash,
    groupCardsByCategory,
    type CardCategorySection,
} from '../_homeCardsPure.js';

/** Definição estática de um card (forma de ACTION_CARDS). */
export interface CardDef {
    readonly id: string;
    readonly icon?: string;
    readonly i18nKey?: string;
    readonly i18nDescKey?: string;
    /** Handler window.* a executar no clique (null quando navega por view). */
    readonly handler?: string | null;
    /** Modo de view para navegação direta (precede o handler). */
    readonly viewTarget?: string | null;
    /** Categoria/seção do card (primary/data/management/settings). */
    readonly category?: string;
}

/** Override de configuração do usuário para um card (de getHomeCardsConfig). */
export interface CardConfigEntry {
    readonly id: string;
    readonly visible?: boolean;
    readonly order?: number;
}

/** Estado/View-model de um card (forma literal pedida pela DoD). */
export interface CardState {
    readonly id: string;
    /** True quando o card é de destaque (categoria 'primary'). */
    readonly isPrimary: boolean;
    /**
     * True quando o card NÃO pode ser clicado: precisa de um handler que não
     * está registrado (e não tem viewTarget). Espelha o `unavailable` legado.
     */
    readonly unavailable: boolean;
    /** Modo de dispatch do clique: 'view' (viewTarget) ou 'handler'. */
    readonly dispatch: 'view' | 'handler' | 'none';
    /** Alvo de view (quando dispatch === 'view'). */
    readonly viewTarget: string | null;
    /** Handler (quando dispatch === 'handler'). */
    readonly handler: string | null;
}

/** Entrada para resolver lista/estado dos cards (sem DOM/globais). */
export interface GridCardsState {
    /** Lista completa de definições (ACTION_CARDS). */
    readonly cards: ReadonlyArray<CardDef>;
    /** Config do usuário (de getHomeCardsConfig). null = sem overrides. */
    readonly config?: ReadonlyArray<CardConfigEntry> | null;
    /**
     * Predicado de existência de handler (injetado — espelha `_hasHandler`).
     * Quando ausente, assume que todo handler existe (todos disponíveis).
     */
    readonly hasHandler?: (handlerName: string | null | undefined) => boolean;
}

/** Plano de render PURO: lista ordenada + hash + seções + estado por card. */
export interface CardRenderPlan {
    /** Cards visíveis na ordem final (saída de resolveCardList). */
    readonly cards: ReadonlyArray<CardDef>;
    /** Hash da lista (para detecção de re-render — espelha _lastCardHash). */
    readonly hash: string;
    /** Seções não-vazias agrupadas por categoria (de groupCardsByCategory). */
    readonly sections: ReadonlyArray<CardCategorySection>;
    /** Estado/view-model de cada card visível, indexado por id. */
    readonly states: Readonly<Record<string, CardState>>;
}

/** Predicado padrão: assume que todo handler existe (fail-open p/ disponível). */
function defaultHasHandler(): boolean {
    return true;
}

/**
 * Resolve QUAIS cards renderizar e em que ORDEM, aplicando visibilidade +
 * ordenação da config do usuário. Espelha exatamente `_getVisibleOrderedCards()`
 * do barrel (delega a `filterOrderCards`): config ausente = visível, `visible:
 * false` esconde, ordenação estável por `order` (default 999).
 *
 * @param state Lista de cards + config do usuário.
 * @returns Lista de cards visíveis, ordenada (mesma referência-forma do legado).
 */
export function resolveCardList(state: GridCardsState): CardDef[] {
    const cards = Array.isArray(state?.cards) ? state.cards : [];
    const config = state?.config ?? null;
    return filterOrderCards(config as any, cards as any[]) as CardDef[];
}

/**
 * Resolve o ESTADO (view-model) de um card específico a partir do modelo
 * (definição + predicado de handler). Espelha o que o `_buildHomeCardElement`
 * legado decidia: `unavailable` quando precisa de handler ausente sem
 * viewTarget; `isPrimary` para a categoria 'primary'; e a forma de dispatch
 * (`viewTarget` precede `handler`) que o `_onCardClick` segue.
 *
 * @param cardId Id do card.
 * @param model  Definição do card + predicado de existência de handler.
 * @returns Estado congelado, ou null quando o card não existe no modelo.
 */
export function resolveCardState(
    cardId: string,
    model: { readonly card?: CardDef | null; readonly hasHandler?: (h: string | null | undefined) => boolean },
): CardState | null {
    const card = model?.card;
    if (!card || card.id !== cardId) return null;
    const hasHandler = typeof model?.hasHandler === 'function' ? model.hasHandler : defaultHasHandler;

    const viewTarget = card.viewTarget || null;
    const handler = card.handler || null;

    let dispatch: 'view' | 'handler' | 'none';
    if (viewTarget) dispatch = 'view';
    else if (handler) dispatch = 'handler';
    else dispatch = 'none';

    // unavailable: card precisa de handler que NÃO está registrado e não navega
    // por view. (viewTarget sempre disponível; card sem handler nem view = none,
    // tratado como indisponível, igual ao legado que não anexava clique.)
    const unavailable = dispatch === 'handler' ? !hasHandler(handler) : dispatch === 'none';

    return Object.freeze({
        id: card.id,
        isPrimary: card.category === 'primary',
        unavailable,
        dispatch,
        viewTarget,
        handler,
    });
}

/**
 * (DoD literal) Resolve o PLANO de render PURO completo: lista visível
 * ordenada + hash + seções por categoria + estado de cada card. Decide O QUE
 * desenhar; o módulo DOM (homeCards.ts) desenha. Não toca DOM/i18n/globais.
 *
 * @param state Lista de cards + config + predicado de handler + títulos.
 * @param sectionTitles Títulos já-traduzidos por categoria (injetados).
 * @returns Plano de render congelado.
 */
export function renderCards(
    state: GridCardsState,
    sectionTitles: Record<string, string> = {},
): CardRenderPlan {
    const cards = resolveCardList(state);
    const hash = computeCardListHash(cards as any[]);
    const sections = groupCardsByCategory(cards as any[], sectionTitles);

    const hasHandler = typeof state?.hasHandler === 'function' ? state.hasHandler : defaultHasHandler;
    const states: Record<string, CardState> = {};
    for (const card of cards) {
        if (!card || typeof card.id !== 'string') continue;
        const cs = resolveCardState(card.id, { card, hasHandler });
        if (cs) states[card.id] = cs;
    }

    return Object.freeze({
        cards: Object.freeze([...cards]),
        hash,
        sections,
        states: Object.freeze(states),
    });
}

/**
 * (DoD literal) Merge PURO de novos dados no estado de um card — ex.: virar a
 * disponibilidade depois que um handler é registrado, ou trocar dispatch. NÃO
 * muta a entrada: devolve um NOVO estado congelado. Campos ausentes em `data`
 * preservam o valor anterior.
 *
 * @param state Estado atual do card (de resolveCardState/renderCards).
 * @param data  Campos parciais a sobrescrever.
 * @returns Novo estado congelado mesclado.
 */
export function updateCard(state: CardState, data: Partial<CardState>): CardState {
    const base = state || ({} as CardState);
    const patch = data || {};
    return Object.freeze({
        id: patch.id ?? base.id,
        isPrimary: patch.isPrimary ?? base.isPrimary,
        unavailable: patch.unavailable ?? base.unavailable,
        dispatch: patch.dispatch ?? base.dispatch,
        viewTarget: patch.viewTarget ?? base.viewTarget,
        handler: patch.handler ?? base.handler,
    });
}
