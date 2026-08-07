// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 (render slice) — render-from-data da home (PURE-input).
 * claude - ui 2026-06-20.
 *
 * EN: DOM-coupled renderers whose OUTPUT is a pure function of their arguments
 *     (the target element + injected data + the i18n translator). They read NO
 *     module-level state of homeGrid.ts — the stateful caller resolves the data
 *     (stat cards, hydrateIcons availability) and injects it. Behaviour, classes,
 *     data-testids and the exact DOM/innerHTML are BYTE-identical to the legacy
 *     inline `_renderStats` card loop and `_renderEmptyState`.
 *
 * PT (leigo): desenha dois pedaços da tela inicial a partir de dados já prontos —
 *     a faixa de "estatísticas" (4 cartões) e o "estado vazio" (sem modelo). Esses
 *     desenhos dependem SÓ do que recebem (elemento + dados + tradutor); não leem
 *     nada escondido. Quem junta os dados é o homeGrid; aqui só montamos a aparência.
 *     Marcação 100% idêntica à versão antiga embutida.
 *
 * DOM-coupled (escreve innerHTML/cria nós) — sem efeitos além do elemento recebido.
 */
import type { StatCard } from './_homeStatsPure.js';

/** Tradutor i18n (chave → texto); cai no fallback se ausente. */
export type HomeRenderTranslate = (key: string) => string;

/** Dependências injetadas do render de stats (i18n) — sem globais ocultos. */
export interface HomeStatsRenderDeps {
    /** Tradutor i18n usado para os rótulos dos cards. */
    readonly t: HomeRenderTranslate;
}

/**
 * Renderiza a faixa de estatísticas (4 cartões) em `statsEl` a partir dos cards
 * já calculados (lógica pura em _homeStatsPure.buildStatCards). Comportamento
 * idêntico ao loop inline legado de `_renderStats`: limpa o container e recria os
 * cartões (ícone + valor + rótulo + barra de progresso quando hasProgress).
 *
 * @param statsEl Container `_statsEl` (no-op se ausente).
 * @param stats Cards já montados (ordem canônica) por buildStatCards.
 * @param deps Tradutor i18n injetado.
 */
export function renderHomeStats(
    statsEl: HTMLElement | null | undefined,
    stats: readonly StatCard[],
    deps: HomeStatsRenderDeps,
): void {
    if (!statsEl) return;
    const t = deps.t;

    statsEl.innerHTML = '';

    for (const stat of stats) {
        const card = document.createElement('div');
        card.className = 'home-stat-card';
        card.setAttribute('data-testid', 'stat-card');

        const iconWrap = document.createElement('div');
        iconWrap.className = 'home-stat-icon';
        const iconEl = document.createElement('span');
        iconEl.setAttribute('data-icon', stat.icon);
        iconEl.setAttribute('data-icon-size', '16px');
        iconWrap.appendChild(iconEl);

        const content = document.createElement('div');
        content.className = 'home-stat-content';

        const val = document.createElement('span');
        val.className = 'home-stat-value';
        val.setAttribute('data-testid', 'stat-value');
        val.textContent = String(stat.value);

        const label = document.createElement('span');
        label.className = 'home-stat-label';
        label.textContent = t(stat.labelKey) || stat.labelKey;

        content.appendChild(val);
        content.appendChild(label);

        // Progress bar for completeness — faixa de cor vem da lógica pura.
        if (stat.hasProgress) {
            const progressWrap = document.createElement('div');
            progressWrap.className = 'home-stat-progress';
            const progressBar = document.createElement('div');
            progressBar.className = 'home-stat-progress-bar';
            progressBar.style.width = `${stat.progressPct ?? 0}%`;
            progressBar.classList.add(stat.progressTier || 'low');
            progressWrap.appendChild(progressBar);
            content.appendChild(progressWrap);
        }

        card.appendChild(iconWrap);
        card.appendChild(content);
        statsEl.appendChild(card);
    }
}

/** Dependências injetadas do render do estado vazio (i18n + hydrateIcons). */
export interface HomeEmptyStateRenderDeps {
    /** Tradutor i18n usado nos textos/CTAs. */
    readonly t: HomeRenderTranslate;
    /** Hook opcional p/ hidratar os ícones SVG do CTA (window.hydrateIcons). */
    readonly hydrateIcons?: ((root?: HTMLElement) => void) | null;
}

/**
 * Renderiza o "estado vazio" da home (sem modelo carregado) em `emptyStateEl`.
 * Comportamento idêntico ao bloco inline legado `_renderEmptyState`: mesma
 * marcação (título + 2 CTAs com data-action) e mesma hidratação de ícones.
 *
 * @param emptyStateEl Container `_emptyStateEl` (no-op se ausente).
 * @param deps Tradutor i18n + hydrateIcons injetado.
 */
export function renderHomeEmptyState(
    emptyStateEl: HTMLElement | null | undefined,
    deps: HomeEmptyStateRenderDeps,
): void {
    if (!emptyStateEl) return;
    const t = deps.t;
    emptyStateEl.innerHTML = `
        <div class="home-empty-state-box">
            <div class="home-empty-state-title">${t('home.empty.title') || 'No model loaded'}</div>
            <div class="home-empty-state-actions">
                <button type="button" class="home-empty-state-cta primary" data-action="home:generate">
                    <span data-icon="shuffle" data-icon-size="16px"></span>
                    <span>${t('home.empty.cta.generate') || 'Generate random model'}</span>
                </button>
                <button type="button" class="home-empty-state-cta secondary" data-action="home:import">
                    <span>${t('home.empty.cta.import') || 'Import ECBT key'}</span>
                </button>
            </div>
        </div>
    `;
    if (typeof deps.hydrateIcons === 'function') deps.hydrateIcons(emptyStateEl);
}
