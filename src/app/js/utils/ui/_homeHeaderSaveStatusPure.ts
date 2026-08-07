// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * home-header (contextual header — lógica pura) — duas derivações sem DOM nem
 * efeitos extraídas do monolito homeHeader.ts. claude (refactor) 2026-06-19.
 *
 * 1) shouldShowSaveStatus — visibilidade do pill de status de salvamento (H-016).
 * 2) buildViewMenuItemHtml — string HTML de UM item do menu "Exibição".
 *
 * EN: Both are deterministic (input → string/boolean), with NO DOM access and NO
 *     side effects, so the DOM-coupled barrel (`homeHeader.ts`) keeps only the
 *     wiring. Behaviour is IDENTICAL to the legacy inline code, quirk for quirk
 *     (same guards, same exact markup, same `escapeHtml`/`t` fallbacks).
 *
 * PT (leigo): duas decisões puras tiradas do arquivo grande do cabeçalho — uma
 *     diz se o "selo" de salvamento aparece; a outra monta o HTML de um item do
 *     menu de Exibição. Nenhuma toca a tela; quem desenha continua sendo o
 *     homeHeader. Mesma lógica/markup de antes, agora isolada e testável.
 *
 * Pure: cheap tests em tests/home-header-save-status-pure.test.mjs.
 */

/**
 * H-016 (HUD Audit 2026-06-05): pill "Salvo" + título "Sem título" era conflito
 * semântico. Esconde o pill quando o modelo não tem nome E o estado é 'saved';
 * mostra sempre que houver nome OU o estado for transient (saving/offline) que o
 * usuário precisa ver. Nielsen H4 (Consistency and standards). Espelha
 * exatamente o corpo do `_shouldShowSaveStatus` legado.
 *
 * @param {string} modelName nome atual do modelo (vazio/whitespace → estado vazio)
 * @param {string} saveStatus estado de salvamento ('saved' | 'saving' | 'offline' | ...)
 * @returns {boolean} true quando o pill deve ficar visível
 */
export function shouldShowSaveStatus(modelName: string, saveStatus: string): boolean {
    if (!modelName || modelName.trim() === '') {
        return saveStatus !== 'saved';
    }
    return true;
}

/** Item do menu "Exibição" — shape mínimo lido pelo builder (igual ao legado). */
export interface ViewMenuItem {
    /** Cabeçalho de seção (renderiza um label, sem botão). */
    readonly section?: string;
    /** Chave i18n + identificador do item (data-vk). */
    readonly key?: string;
    /** Item "action" (executa, sem estado on/off; ícone ↻). */
    readonly action?: boolean;
    // (demais campos do item — fn/el/lazy/etc — são ignorados pelo builder.)
}

/**
 * Monta o HTML de UM item do menu "Exibição" — espelha exatamente o corpo do
 * callback `.map()` do `rebuild` legado em `handleToggleViewMenu`:
 *   - `item.section`            → `<div class="ah-view-section">…</div>`;
 *   - `item.action`             → botão `menuitem` com check ↻ (&#8635;);
 *   - caso contrário (checkbox) → botão `menuitemcheckbox` com `on`/`aria-checked`
 *     e check ✓ (&#10003;) quando ligado.
 * `t` e `escapeHtml` são injetados (sem globais aqui dentro). Para itens de seção
 * e de ação o parâmetro `on` é ignorado (igual ao legado).
 *
 * @param {ViewMenuItem} item item do menu
 * @param {boolean} on estado ligado/desligado (só usado no ramo checkbox)
 * @param {(key: string) => string} t tradutor i18n
 * @param {(s: string) => string} escapeHtml escapador de HTML
 * @returns {string} HTML do item (idêntico ao markup inline legado)
 */
export function buildViewMenuItemHtml(
    item: ViewMenuItem,
    on: boolean,
    t: (key: string) => string,
    escapeHtml: (s: string) => string,
): string {
    if (item.section) {
        return `<div class="ah-view-section">${escapeHtml(t(item.section) || item.section)}</div>`;
    }
    const key = item.key as string;
    const label = escapeHtml(t(key) || key);
    // Items "action" executam (sem estado on/off) — ex.: refreshHuds.
    if (item.action) {
        return (
            `<button type="button" class="ah-view-item ah-view-action" role="menuitem" ` +
            `data-vk="${escapeHtml(key)}">` +
            `<span class="ah-view-check" aria-hidden="true">&#8635;</span>${label}</button>`
        );
    }
    return (
        `<button type="button" class="ah-view-item${on ? ' on' : ''}" role="menuitemcheckbox" ` +
        `aria-checked="${on}" data-vk="${escapeHtml(key)}">` +
        `<span class="ah-view-check" aria-hidden="true">${on ? '&#10003;' : ''}</span>${label}</button>`
    );
}
