// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Painel de Maturidade Tecnológica (TRL) por cenário/rota — DOM wire.
 * micro_activity:ECBYTS-ENERGY-SCENARIOS-001#6.
 *
 * Pure-UI: toda a lógica (extração de TRL dos elementos, timeline 1..9,
 * critérios de passagem com override) vive em
 * core/scenarios/_trlMaturityPure.ts. Aqui é só render + eventos, no padrão
 * dos overlays `.ecbt-overlay` + `.ecbt-dialog` (mesmo trilho do
 * scenarioComparatorPanel). Feature flag: CONFIG.FEATURES.TRL_MATURITY.
 *
 * Critérios de passagem são EDITÁVEIS inline (textarea por transição); os
 * overrides ficam em memória de sessão (NUNCA destroem o catálogo default).
 *
 * Exposed handler: window.handleOpenTrlMaturityPanel()
 */

import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';
import {
    buildTrlMaturityVM,
    TRL_LEVEL_LABELS,
    type TrlMaturityVM,
    type TrlRouteVM,
    type TrlElementLike,
} from '../../core/scenarios/_trlMaturityPure.js';
import { getAllElements } from '../../core/elements/manager.js';

declare global {
    interface Window {
        handleOpenTrlMaturityPanel?: () => void;
        handleCloseTrlMaturityPanel?: () => void;
    }
}

const OVERLAY_ID = 'trl-maturity-overlay';
let _a11yCleanup: (() => void) | null = null;

/** Overrides de critério editados na tela: routeId → (fromLevel → texto). */
const _criteriaOverrides: Record<string, Record<number, string>> = {};

/** i18n com fallback pt embutido (padrão do scenarioComparatorPanel). */
function tr(key: string, fallback: string): string {
    try {
        const out = t(key);
        return out && out !== key ? out : fallback;
    } catch {
        return fallback;
    }
}

const CELL_STATE_LABEL: Record<string, readonly [string, string]> = {
    done: ['trl.state.done', 'concluído'],
    current: ['trl.state.current', 'atual'],
    gap: ['trl.state.gap', 'em maturação'],
    target: ['trl.state.target', 'alvo'],
    future: ['trl.state.future', 'futuro'],
};

function renderTimeline(route: TrlRouteVM): string {
    const cells = route.cells
        .map((c) => {
            const [k, fb] = CELL_STATE_LABEL[c.state] ?? ['trl.state.future', 'futuro'];
            const stateLabel = tr(k, fb);
            const levelLabel = TRL_LEVEL_LABELS[c.level] ?? '';
            return (
                `<li class="trl-cell trl-cell--${c.state}" title="${escapeHtml(`TRL ${c.level} — ${levelLabel} (${stateLabel})`)}" ` +
                `aria-label="${escapeHtml(`TRL ${c.level}: ${stateLabel}`)}">` +
                `<span class="trl-cell-num">${c.level}</span></li>`
            );
        })
        .join('');
    return `<ol class="trl-timeline" role="list">${cells}</ol>`;
}

function renderCriteria(route: TrlRouteVM): string {
    if (route.criteria.length === 0) {
        return `<p class="trl-criteria-empty">${escapeHtml(tr('trl.criteria.none', 'Alvo já atingido — sem transições pendentes.'))}</p>`;
    }
    const items = route.criteria
        .map((c) => {
            const customBadge = c.isCustom
                ? ` <span class="trl-badge trl-badge--custom">${escapeHtml(tr('trl.criteria.custom', 'editado'))}</span>`
                : '';
            const label = `TRL ${c.fromLevel} → ${c.toLevel}`;
            return `<li class="trl-criterion">
                <span class="trl-criterion-label">${escapeHtml(label)}${customBadge}</span>
                <textarea class="trl-criterion-input" rows="2"
                    data-route="${escapeHtml(route.id)}" data-from-level="${c.fromLevel}"
                    aria-label="${escapeHtml(tr('trl.criteria.editAria', 'Critério de passagem') + ' ' + label)}">${escapeHtml(c.text)}</textarea>
            </li>`;
        })
        .join('');
    return `<ul class="trl-criteria" aria-label="${escapeHtml(tr('trl.criteria.title', 'Critérios de passagem (editáveis)'))}">${items}</ul>`;
}

function renderRoute(route: TrlRouteVM): string {
    return `<section class="trl-route" aria-label="${escapeHtml(route.name)}">
        <h3 class="trl-route-name">${escapeHtml(route.name)}</h3>
        <p class="trl-route-summary">${escapeHtml(route.summary)}</p>
        ${renderTimeline(route)}
        <details class="trl-criteria-details">
            <summary>${escapeHtml(tr('trl.criteria.title', 'Critérios de passagem (editáveis)'))}</summary>
            ${renderCriteria(route)}
        </details>
    </section>`;
}

function renderDataSourceBanner(vm: TrlMaturityVM): string {
    if (vm.dataSource === 'real') {
        return `<div class="scn-source scn-source--real" role="status">${escapeHtml(tr('trl.realData', 'Dados reais do modelo (data.trl por elemento)'))}</div>`;
    }
    return (
        `<div class="scn-source scn-source--example" role="alert">` +
        `<strong>${escapeHtml(tr('trl.exampleData', 'Usando dados de exemplo (rotas ilustrativas de biomassa)'))}</strong> ` +
        `${escapeHtml(tr('trl.exampleHint', 'declare data.trl / data.trlTarget / data.trlTargetMonths em elementos do modelo para a trilha real.'))}</div>`
    );
}

function renderBody(vm: TrlMaturityVM): string {
    return `
        ${renderDataSourceBanner(vm)}
        ${vm.routes.map(renderRoute).join('')}
        <p class="trl-footnote">${escapeHtml(
            tr(
                'trl.footnote',
                'Trilha de maturação tecnológica (escala TRL 1–9, NASA/EU): cada rota do gêmeo digital declara o nível atual, o alvo e o prazo — os critérios de passagem tornam a promessa de maturação avaliável.',
            ),
        )}</p>`;
}

function rerenderBody(): void {
    const body = document.querySelector(`#${OVERLAY_ID} .trl-body`);
    if (!body) return;
    const vm = buildTrlMaturityVM((getAllElements() || []) as TrlElementLike[], _criteriaOverrides);
    body.innerHTML = renderBody(vm);
}

function onBodyChange(e: Event): void {
    const target = e.target as HTMLTextAreaElement | null;
    if (!target || !target.classList.contains('trl-criterion-input')) return;
    const routeId = target.dataset['route'] ?? '';
    const from = Number(target.dataset['fromLevel']);
    if (!routeId || !Number.isFinite(from)) return;
    if (!_criteriaOverrides[routeId]) _criteriaOverrides[routeId] = {};
    _criteriaOverrides[routeId]![from] = target.value;
    // Re-render só o rótulo (badge "editado") na próxima abertura; manter o
    // textarea vivo evita perder foco/scroll durante a digitação.
}

export function closeTrlMaturityPanel(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
}

export function openTrlMaturityPanel(): void {
    closeTrlMaturityPanel();
    const vm = buildTrlMaturityVM((getAllElements() || []) as TrlElementLike[], _criteriaOverrides);
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'trl-maturity-title');
    const title = tr('trl.title', 'Maturidade Tecnológica (TRL) por cenário');
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--xl trl-dialog">
            <div class="ecbt-header">
                <h2 class="ecbt-title" id="trl-maturity-title">${escapeHtml(title)}</h2>
                <button type="button" class="ecbt-close" data-action="close" aria-label="${escapeHtml(tr('close', 'Fechar'))}">&#10005;</button>
            </div>
            <div class="ecbt-form trl-body" style="flex:1;overflow-y:auto;">${renderBody(vm)}</div>
        </div>`;
    overlay.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target.closest('[data-action="close"]')) closeTrlMaturityPanel();
    });
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeTrlMaturityPanel();
    });
    overlay.addEventListener('change', onBodyChange);
    document.body.appendChild(overlay);
    try {
        _a11yCleanup = attachModalA11y(overlay, closeTrlMaturityPanel);
    } catch {
        _a11yCleanup = null;
    }
}

/** Refresh externo (ex.: elementos mudaram com o painel aberto). */
export function refreshTrlMaturityPanel(): void {
    if (document.getElementById(OVERLAY_ID)) rerenderBody();
}
