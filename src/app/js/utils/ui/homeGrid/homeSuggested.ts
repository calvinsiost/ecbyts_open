// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 S5-runtime — render da seção "Ações Sugeridas".
 * claude - ui 2026-06-15.
 *
 * EN: Renders the home "Suggested Actions" section inside the target element.
 *     Reads the completeness check (injected `computeCompleteness`): when there
 *     are gaps it shows up to 3 actionable rows (icon + message + go button);
 *     when there are no gaps but the model has elements it shows a success row
 *     pointing to export. Click listeners are wired here but delegate to the
 *     injected `onAction` callback so the CSP-safe handler-execution flow stays
 *     in homeGrid. `validateSuggestedAction`/`resolveActionIcon` are stable
 *     imports from homeGridActions. Behavior identical to the legacy inline
 *     `_renderSuggested`/`_renderSuggestedSuccess` pair.
 *
 * PT (leigo): desenha a caixinha de "Ações Sugeridas" da tela inicial. Olha o
 *     que falta no modelo: se faltam coisas, mostra até 3 sugestões com um botão
 *     que executa a ação; se não falta nada (e já existem elementos), mostra um
 *     aviso de sucesso com botão para exportar. O clique é ligado aqui mas chama
 *     de volta o homeGrid (que decide o que o clique faz). Comportamento idêntico
 *     ao código antigo que ficava embutido no homeGrid.
 *
 * DOM-coupled (cria elementos + listeners) — mantém classes/IDs/atributos/
 * innerHTML idênticos ao legado.
 */

import { validateSuggestedAction, resolveActionIcon } from '../homeGridActions.js';

/** Dependências injetadas — i18n, checagem de completude e clique (CSP-safe). */
export interface SuggestedDeps {
    /** Tradutor i18n (chave → texto); cai no fallback literal se ausente. */
    readonly t: (key: string) => string;
    /** Retorna o check de completude (gaps + score) — mesmo do homeGrid. */
    readonly computeCompleteness: () => any;
    /** Elementos atuais do modelo (homeGrid `_safeGetElements`). */
    readonly getElements: () => any[];
    /** Flag de boot "preparando modelo aleatório" — avaliada no momento da chamada. */
    readonly bootPreparingRandom: boolean;
    /**
     * Callback de execução de ação por nome de handler (mantém o fluxo CSP-safe
     * de `_executeHandler` no homeGrid).
     */
    readonly onAction: (handlerName: string) => void;
}

/**
 * Renderiza a seção "Ações Sugeridas" dentro de `suggestedEl`. Comportamento
 * idêntico ao `_renderSuggested` legado (incluindo o estado de sucesso).
 *
 * @param suggestedEl Elemento-alvo da seção (homeGrid `_suggestedEl`).
 * @param deps Dependências injetadas.
 */
export function renderHomeSuggested(suggestedEl: HTMLElement | null, deps: SuggestedDeps): void {
    if (!suggestedEl) return;

    const { t, computeCompleteness, getElements, bootPreparingRandom, onAction } = deps;

    if (bootPreparingRandom) {
        suggestedEl.innerHTML = '';
        return;
    }

    const check = computeCompleteness();
    suggestedEl.innerHTML = '';

    if (!check || check.gaps.length === 0) {
        // Show success state when no gaps
        const elements = getElements();
        if (elements.length > 0) {
            _renderSuggestedSuccess(suggestedEl, t, onAction);
        }
        return;
    }

    // Header for suggested section
    const header = document.createElement('div');
    header.className = 'home-suggested-header';
    header.innerHTML = `
        <span data-icon="sparkles" data-icon-size="14px"></span>
        <span>${t('homeSuggestedTitle') || 'Suggested Actions'}</span>
    `;
    suggestedEl.appendChild(header);

    // Show up to 3 gaps as actionable suggestions (V2 G3: validate shape)
    const validGaps = check.gaps.filter((g: any) => {
        const { valid, errors } = validateSuggestedAction(g);
        if (!valid) {
            console.warn('[homeGrid] invalid SuggestedAction skipped:', g?.id || '(no id)', errors);
        }
        return valid;
    });
    const maxGaps = Math.min(validGaps.length, 3);
    for (let i = 0; i < maxGaps; i++) {
        const gap: any = validGaps[i];
        const row = document.createElement('div');
        row.className = 'home-suggested-row';

        const iconWrap = document.createElement('div');
        iconWrap.className = `home-suggested-icon ${gap.severity}`;
        const iconEl = document.createElement('span');
        iconEl.setAttribute('data-icon', resolveActionIcon(gap));
        iconEl.setAttribute('data-icon-size', '14px');
        iconWrap.appendChild(iconEl);

        const content = document.createElement('div');
        content.className = 'home-suggested-content';

        const msg = document.createElement('span');
        msg.className = 'home-suggested-msg';
        msg.textContent = gap.msg;

        content.appendChild(msg);

        const btn = document.createElement('button');
        btn.className = 'home-suggested-btn';
        btn.setAttribute('data-testid', 'suggested-action-btn');
        btn.innerHTML = `<span data-icon="arrow-right" data-icon-size="14px"></span>`;
        btn.title = t('homeSuggestedGo') || 'Go';
        btn.addEventListener('click', () => onAction(gap.handler));

        row.appendChild(iconWrap);
        row.appendChild(content);
        row.appendChild(btn);
        suggestedEl.appendChild(row);
    }

    // Hydrate icons in suggested section
    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(suggestedEl);
    }
}

/**
 * Estado de sucesso (sem gaps): linha "modelo completo — exporte". Equivalente
 * ao `_renderSuggestedSuccess` legado; mesmo onClick (`openExportModal`) via
 * o callback CSP-safe.
 *
 * @param suggestedEl Elemento-alvo da seção.
 * @param t Tradutor i18n.
 * @param onAction Callback de execução de ação por nome de handler.
 */
function _renderSuggestedSuccess(
    suggestedEl: HTMLElement,
    t: (key: string) => string,
    onAction: (handlerName: string) => void,
): void {
    const row = document.createElement('div');
    row.className = 'home-suggested-row success';

    const iconWrap = document.createElement('div');
    iconWrap.className = 'home-suggested-icon success';
    const iconEl = document.createElement('span');
    iconEl.setAttribute('data-icon', 'check-circle');
    iconEl.setAttribute('data-icon-size', '14px');
    iconWrap.appendChild(iconEl);

    const content = document.createElement('div');
    content.className = 'home-suggested-content';

    const msg = document.createElement('span');
    msg.className = 'home-suggested-msg';
    msg.textContent = t('homeSuggestExport') || 'Model complete! Export your model for sharing.';

    content.appendChild(msg);

    const btn = document.createElement('button');
    btn.className = 'home-suggested-btn';
    btn.setAttribute('data-testid', 'suggested-action-btn');
    btn.innerHTML = `<span data-icon="download" data-icon-size="14px"></span>`;
    btn.title = t('homeSuggestedExport') || 'Export';
    btn.addEventListener('click', () => onAction('openExportModal'));

    row.appendChild(iconWrap);
    row.appendChild(content);
    row.appendChild(btn);
    suggestedEl.appendChild(row);

    if (typeof window.hydrateIcons === 'function') {
        window.hydrateIcons(suggestedEl);
    }
}

/**
 * Sugestão de maior prioridade (msg + handler), ou o fallback de exportação.
 * Equivalente ao `_computeSuggestion` legado.
 *
 * @param deps `t` + `computeCompleteness` (mesmas do homeGrid).
 * @returns `{ msg, handler }` ou `null` quando não há check.
 */
export function computeHomeSuggestion(deps: {
    t: (key: string) => string;
    computeCompleteness: () => any;
}): { msg: string; handler: string } | null {
    const { t, computeCompleteness } = deps;
    const check = computeCompleteness();
    if (!check) return null;

    // Retorna a acao de maior prioridade
    for (const gap of check.gaps) {
        return { msg: gap.msg, handler: gap.handler };
    }
    return { msg: t('homeSuggestExport') || 'Export your model for sharing', handler: 'openExportModal' };
}
