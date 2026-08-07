// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render do cabeçalho de boas-vindas da home.
 * claude - ui 2026-06-15.
 *
 * EN: Renders the home welcome header (logo + title + subtitle + two CTAs). The
 *     header is shown ONLY in the empty state (no elements yet); once the model
 *     has data, the header is cleared and hidden. The `t` translator is injected
 *     and the empty/populated decision (`hasData`) is computed by the caller so
 *     this module reads no globals. Behavior, classes/IDs/attributes and the
 *     exact innerHTML are identical to the legacy inline `_renderHeader`,
 *     including the CSP-safe `data-cc-action` hooks on the buttons.
 *
 * PT (leigo): desenha o "cabeçalho de boas-vindas" da tela inicial — logo,
 *     título, subtítulo e os dois botões (Assistente de IA / Criar primeiro
 *     modelo). Esse cabeçalho só aparece quando ainda NÃO há nada no modelo
 *     (estado vazio); assim que existir dado, ele some. Quem decide se há dado
 *     é o homeGrid (passa `hasData`); aqui só montamos a aparência, sem mexer
 *     em nada global. Marcação 100% idêntica à versão antiga embutida.
 *
 * DOM-coupled (escreve innerHTML/style) — validado pelo smoke E2E da home.
 */

/** Dependências injetadas (i18n + estado vazio/populado) — sem globais ocultos. */
export interface HomeHeaderDeps {
    /** Tradutor i18n (chave → texto); cai no fallback se ausente. */
    readonly t: (key: string) => string;
    /** True quando o modelo já tem elementos (esconde o cabeçalho de boas-vindas). */
    readonly hasData: boolean;
}

/**
 * Renderiza (ou esconde) o cabeçalho de boas-vindas em `headerEl`. Comportamento
 * idêntico ao bloco inline legado de `_renderHeader`: estado populado limpa e
 * esconde; estado vazio mostra o herói com logo, título, subtítulo e 2 CTAs.
 *
 * @param headerEl Container do cabeçalho (#... / _headerEl). Se ausente, no-op.
 * @param deps Tradutor + flag de estado (hasData).
 */
export function renderHomeHeader(headerEl: HTMLElement | null | undefined, deps: HomeHeaderDeps): void {
    if (!headerEl) return;
    const t = deps.t;
    const hasData = deps.hasData;

    // Only show welcome message for empty state
    if (hasData) {
        headerEl.innerHTML = '';
        headerEl.style.display = 'none';
        return;
    }

    headerEl.style.display = 'block';
    headerEl.innerHTML = `
        <div class="home-header-content">
            <div class="home-header-icon">
                <img src="assets/logo.png" alt="ecbyts" class="home-header-logo">
            </div>
            <div class="home-header-text">
                <h1>${t('homeWelcomeTitle') || 'Environmental Digital Twin'}</h1>
                <p>${t('homeWelcomeSubtitle') || 'Create, analyze and share environmental models. Start by importing data or exploring a sample.'}</p>
            </div>
            <div class="home-header-actions">
                <button class="home-header-cta secondary" data-cc-action="cc-1c82d9ce">
                    <span data-icon="message-square" data-icon-size="14px"></span>
                    ${t('qaAiAssistant') || 'AI Assistant'}
                </button>
                <button class="home-header-cta" data-cc-action="cc-ea4a67ef">
                    <span data-icon="plus" data-icon-size="14px"></span>
                    ${t('homeWelcomeCta') || 'Create First Model'}
                </button>
            </div>
        </div>
    `;
}
