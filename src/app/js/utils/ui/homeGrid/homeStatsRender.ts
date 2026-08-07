// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render dos cards de estatística da home.
 * claude - ui 2026-06-16.
 *
 * EN: Renders the 4 home stat cards (Elements / Campaigns / Completeness / Last
 *     Save) from the pure model built by `buildStatCards` (_homeStatsPure, S4).
 *     Short-circuits when the V3 hero flag is on. homeGrid state/helpers via
 *     `deps`. Behavior byte-identical to the legacy inline `_renderStats`.
 *
 * PT (leigo): desenha os 4 números do topo da tela inicial (elementos,
 *     campanhas, completude, último salvo) — o cálculo já vem da lógica pura;
 *     aqui só montamos os cartões na tela.
 *
 * DOM-coupled — validado pelo smoke E2E home-stats-s4.
 */
import { CONFIG } from '../../../config.js';
import { t } from '../../i18n/translations.js';
import { buildStatCards } from './_homeStatsPure.js';

/** Dependências injetadas (elemento + acessos de modelo via callbacks). */
export interface StatsRenderDeps {
    readonly getStatsEl: () => any;
    readonly getElements: () => any[];
    readonly getCampaigns: () => any[];
    readonly getLastSave: () => string;
    readonly computeCompleteness: () => any;
}

/**
 * Renderiza os cards de estatística. Comportamento idêntico ao inline legado.
 */
export function renderStats(deps: StatsRenderDeps): void {
    const statsEl = deps.getStatsEl();
    if (!statsEl) return;
    // V3: when hero KPIs flag is on, legacy stats are replaced by the
    // V3 hero (EIS/VPL/PDPLU/Compliance). Short-circuit every render
    // to survive re-renders that would otherwise wipe display:none.
    if ((CONFIG as any).FEATURES?.LAUNCHPAD_V3_HERO) {
        statsEl.style.display = 'none';
        statsEl.innerHTML = '';
        return;
    }

    const elements = deps.getElements();
    const campaigns = deps.getCampaigns();
    const lastSave = deps.getLastSave();

    statsEl.innerHTML = '';

    // D20: completeness score — lógica pura em _homeStatsPure (S4 split).
    const check = elements.length > 0 || campaigns.length > 0 ? deps.computeCompleteness() : null;
    const stats = buildStatCards({
        elementsCount: elements.length,
        campaignsCount: campaigns.length,
        completeness: check ? { score: check.score, total: check.total } : null,
        lastSaveLabel: lastSave,
    });

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
