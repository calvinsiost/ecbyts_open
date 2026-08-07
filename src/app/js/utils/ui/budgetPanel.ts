// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Painel de Orçamento Cotado — UI clicável (micro_activity:acad:orcamento-cotado-001#08, RF-7).
 *
 * Renderiza orçamento acadêmico (padrão de agências de fomento) com 4 seções:
 * resumo, rubricas (expandir/colapsar), cronograma e checagens.
 *
 * Padrão: overlay `.ecbt-overlay` + `.ecbt-dialog` (mesmo trilho do
 * trlMaturityPanel / scenarioComparatorPanel). CSS via design-tokens,
 * ZERO hex hardcoded.
 *
 * Exposed handler: window.handleOpenBudgetPanel()
 */

import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { attachModalA11y } from './modalA11y.js';
import type { BudgetCheckResult } from '../../core/budget/budgetChecks.js';

declare global {
    interface Window {
        handleOpenBudget?: () => void;
    }
}

export interface BudgetRubricaVM {
    readonly id: string;
    readonly nome: string;
    readonly categoria: 'capex' | 'opex' | 'contrapartida' | 'outros';
    readonly valor: number;
    readonly justificativa?: string;
}

export interface BudgetCronogramaItem {
    readonly mes: number;
    readonly label: string;
    readonly valor: number;
}

export interface BudgetData {
    readonly titulo: string;
    readonly funder: string;
    readonly funderName: string;
    readonly currency: string;
    readonly envelopeTotal: number;
    readonly contrapartidaTotal?: number;
    readonly rubricas: ReadonlyArray<BudgetRubricaVM>;
    readonly cronograma: ReadonlyArray<BudgetCronogramaItem>;
    readonly checagens: ReadonlyArray<BudgetCheckResult>;
}

const OVERLAY_ID = 'budget-panel-overlay';
let _a11yCleanup: (() => void) | null = null;
let _currentData: BudgetData | null = null;

function tr(key: string, fallback: string): string {
    try {
        const out = t(key);
        return out && out !== key ? out : fallback;
    } catch {
        return fallback;
    }
}

function fmtCurrency(value: number, currency: string): string {
    if (!Number.isFinite(value)) return '—';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currency || 'BRL' }).format(value);
}

function pct(value: number, total: number): string {
    if (!Number.isFinite(total) || total <= 0) return '—';
    return ((value / total) * 100).toFixed(1) + '%';
}

function renderResumo(data: BudgetData): string {
    const total = data.rubricas.reduce((s, r) => s + r.valor, 0);
    const capex = data.rubricas.filter((r) => r.categoria === 'capex').reduce((s, r) => s + r.valor, 0);
    const opex = total - capex;
    const cur = data.currency;

    return `<section class="bp-section" aria-label="${escapeHtml(tr('budget.resumo', 'Resumo'))}">
        <h3 class="bp-section-title">${escapeHtml(tr('budget.resumo', 'Resumo'))}</h3>
        <dl class="bp-resumo-grid">
            <div class="bp-resumo-item">
                <dt>${escapeHtml(tr('budget.envelope', 'Envelope total'))}</dt>
                <dd class="bp-resumo-value">${escapeHtml(fmtCurrency(data.envelopeTotal, cur))}</dd>
            </div>
            <div class="bp-resumo-item">
                <dt>CAPEX</dt>
                <dd class="bp-resumo-value">${escapeHtml(fmtCurrency(capex, cur))} <span class="bp-pct">(${escapeHtml(pct(capex, data.envelopeTotal))})</span></dd>
            </div>
            <div class="bp-resumo-item">
                <dt>OPEX</dt>
                <dd class="bp-resumo-value">${escapeHtml(fmtCurrency(opex, cur))} <span class="bp-pct">(${escapeHtml(pct(opex, data.envelopeTotal))})</span></dd>
            </div>
            ${data.contrapartidaTotal != null ? `<div class="bp-resumo-item">
                <dt>${escapeHtml(tr('budget.contrapartida', 'Contrapartida'))}</dt>
                <dd class="bp-resumo-value">${escapeHtml(fmtCurrency(data.contrapartidaTotal, cur))} <span class="bp-pct">(${escapeHtml(pct(data.contrapartidaTotal, data.envelopeTotal))})</span></dd>
            </div>` : ''}
            <div class="bp-resumo-item">
                <dt>${escapeHtml(tr('budget.funder', 'Financiador'))}</dt>
                <dd>${escapeHtml(data.funderName)} (${escapeHtml(data.funder)})</dd>
            </div>
        </dl>
    </section>`;
}

function renderRubricaRow(r: BudgetRubricaVM, currency: string, envelope: number): string {
    const catLabel = r.categoria.toUpperCase();
    const justificativa = r.justificativa
        ? `<div class="bp-rubrica-just">${escapeHtml(r.justificativa)}</div>`
        : '';
    return `<div class="bp-rubrica-row" data-rubrica-id="${escapeHtml(r.id)}">
        <button type="button" class="bp-rubrica-toggle" aria-expanded="false" aria-controls="bp-rub-detail-${escapeHtml(r.id)}">
            <span class="bp-rubrica-arrow">&#9654;</span>
            <span class="bp-rubrica-cat bp-cat--${escapeHtml(r.categoria)}">${escapeHtml(catLabel)}</span>
            <span class="bp-rubrica-nome">${escapeHtml(r.nome)}</span>
            <span class="bp-rubrica-valor">${escapeHtml(fmtCurrency(r.valor, currency))}</span>
            <span class="bp-rubrica-pct">${escapeHtml(pct(r.valor, envelope))}</span>
        </button>
        <div class="bp-rubrica-detail" id="bp-rub-detail-${escapeHtml(r.id)}" hidden>
            ${justificativa || `<p class="bp-rubrica-nojust">${escapeHtml(tr('budget.noJustification', 'Sem justificativa registrada.'))}</p>`}
        </div>
    </div>`;
}

function renderRubricas(data: BudgetData): string {
    const rows = data.rubricas.map((r) => renderRubricaRow(r, data.currency, data.envelopeTotal)).join('');
    return `<section class="bp-section" aria-label="${escapeHtml(tr('budget.rubricas', 'Rubricas'))}">
        <h3 class="bp-section-title">${escapeHtml(tr('budget.rubricas', 'Rubricas'))} <span class="bp-count">(${data.rubricas.length})</span></h3>
        <div class="bp-rubrica-header">
            <span></span>
            <span>${escapeHtml(tr('budget.category', 'Categoria'))}</span>
            <span>${escapeHtml(tr('budget.item', 'Item'))}</span>
            <span>${escapeHtml(tr('budget.value', 'Valor'))}</span>
            <span>%</span>
        </div>
        <div class="bp-rubricas-list" role="list">${rows}</div>
    </section>`;
}

function renderCronograma(data: BudgetData): string {
    if (data.cronograma.length === 0) {
        return `<section class="bp-section" aria-label="${escapeHtml(tr('budget.cronograma', 'Cronograma'))}">
            <h3 class="bp-section-title">${escapeHtml(tr('budget.cronograma', 'Cronograma'))}</h3>
            <p class="bp-empty">${escapeHtml(tr('budget.noCronograma', 'Cronograma não informado.'))}</p>
        </section>`;
    }
    const maxVal = Math.max(...data.cronograma.map((c) => c.valor), 1);
    const bars = data.cronograma
        .map((c) => {
            const width = Math.max(2, (c.valor / maxVal) * 100);
            return `<div class="bp-cron-item">
                <span class="bp-cron-label">${escapeHtml(c.label)}</span>
                <div class="bp-cron-track">
                    <div class="bp-cron-bar" style="width:${width.toFixed(1)}%" role="img"
                        aria-label="${escapeHtml(c.label + ': ' + fmtCurrency(c.valor, data.currency))}"></div>
                </div>
                <span class="bp-cron-valor">${escapeHtml(fmtCurrency(c.valor, data.currency))}</span>
            </div>`;
        })
        .join('');
    return `<section class="bp-section" aria-label="${escapeHtml(tr('budget.cronograma', 'Cronograma'))}">
        <h3 class="bp-section-title">${escapeHtml(tr('budget.cronograma', 'Cronograma'))}</h3>
        <div class="bp-cronograma">${bars}</div>
    </section>`;
}

function renderChecagens(data: BudgetData): string {
    if (data.checagens.length === 0) {
        return `<section class="bp-section" aria-label="${escapeHtml(tr('budget.checagens', 'Checagens'))}">
            <h3 class="bp-section-title">${escapeHtml(tr('budget.checagens', 'Checagens'))}</h3>
            <p class="bp-empty">${escapeHtml(tr('budget.noChecks', 'Nenhuma checagem executada.'))}</p>
        </section>`;
    }
    const items = data.checagens
        .map((c) => {
            const icon = c.pass ? '&#10003;' : (c.severity === 'error' ? '&#10007;' : '&#9888;');
            const cls = c.pass ? 'bp-check--pass' : `bp-check--${c.severity}`;
            return `<li class="bp-check-item ${cls}">
                <span class="bp-check-icon" aria-hidden="true">${icon}</span>
                <span class="bp-check-msg">${escapeHtml(c.message)}</span>
                <span class="bp-check-rule">${escapeHtml(c.ruleId)}</span>
            </li>`;
        })
        .join('');
    const passCount = data.checagens.filter((c) => c.pass).length;
    const total = data.checagens.length;
    return `<section class="bp-section" aria-label="${escapeHtml(tr('budget.checagens', 'Checagens'))}">
        <h3 class="bp-section-title">${escapeHtml(tr('budget.checagens', 'Checagens'))}
            <span class="bp-check-summary ${passCount === total ? 'bp-check-summary--ok' : 'bp-check-summary--fail'}">${passCount}/${total}</span>
        </h3>
        <ul class="bp-checks-list" role="list">${items}</ul>
    </section>`;
}

function renderBody(data: BudgetData): string {
    return `
        <div class="bp-funder-badge">${escapeHtml(data.funderName)} &middot; ${escapeHtml(data.funder)} &middot; ${escapeHtml(data.currency)}</div>
        ${renderResumo(data)}
        ${renderRubricas(data)}
        ${renderCronograma(data)}
        ${renderChecagens(data)}`;
}

function onToggleRubrica(e: Event): void {
    const btn = (e.target as HTMLElement).closest('.bp-rubrica-toggle') as HTMLButtonElement | null;
    if (!btn) return;
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    const detailId = btn.getAttribute('aria-controls');
    if (!detailId) return;
    const detail = document.getElementById(detailId);
    if (detail) detail.hidden = expanded;
    const arrow = btn.querySelector('.bp-rubrica-arrow');
    if (arrow) arrow.innerHTML = expanded ? '&#9654;' : '&#9660;';
}

export function renderBudgetPanel(container: HTMLElement, budgetData: BudgetData): void {
    container.innerHTML = renderBody(budgetData);
    container.addEventListener('click', onToggleRubrica);
}

export function closeBudgetPanel(): void {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.remove();
    if (_a11yCleanup) {
        _a11yCleanup();
        _a11yCleanup = null;
    }
    _currentData = null;
}

export function openBudgetPanel(data?: BudgetData): void {
    closeBudgetPanel();
    const budgetData = data ?? _currentData;
    // R-OPEN BUG 3 (2026-08-06): sem dados o painel dava `return` silencioso —
    // o clique em "Mais → Orçamento Cotado" morria sem NENHUM feedback
    // (proibido pela §R3-F-a). Agora o overlay abre SEMPRE; sem dados ele
    // renderiza um empty state explícito e acionável.
    _currentData = budgetData ?? null;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'ecbt-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'budget-panel-title');

    const title = tr('budget.title', 'Orçamento Cotado');
    const subtitle = budgetData ? ` &mdash; ${escapeHtml(budgetData.titulo)}` : '';
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--xl bp-dialog">
            <div class="ecbt-header">
                <h2 class="ecbt-title" id="budget-panel-title">${escapeHtml(title)}${subtitle}</h2>
                <button type="button" class="ecbt-close" data-action="close" aria-label="${escapeHtml(tr('close', 'Fechar'))}">&#10005;</button>
            </div>
            <div class="ecbt-form bp-body" style="flex:1;overflow-y:auto;"></div>
        </div>`;

    overlay.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target === overlay || target.closest('[data-action="close"]')) closeBudgetPanel();
    });
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeBudgetPanel();
    });

    document.body.appendChild(overlay);

    const body = overlay.querySelector('.bp-body') as HTMLElement;
    if (body && budgetData) {
        renderBudgetPanel(body, budgetData);
    } else if (body) {
        body.innerHTML = `
            <div class="bp-empty" style="padding:24px;text-align:center;">
                <p style="margin:0 0 8px;font-weight:600;">${escapeHtml(
                    tr('budget.emptyTitle', 'Nenhum orçamento carregado ainda'),
                )}</p>
                <p style="margin:0;opacity:.8;">${escapeHtml(
                    tr(
                        'budget.emptyHint',
                        'Este painel exibe um orçamento cotado (padrão de agências de fomento) gerado por automação ou API: chame window.openBudgetPanel(dados) com rubricas, cronograma e checagens para visualizá-lo aqui.',
                    ),
                )}</p>
            </div>`;
    }

    try {
        _a11yCleanup = attachModalA11y(overlay, closeBudgetPanel);
    } catch {
        _a11yCleanup = null;
    }
}

export function refreshBudgetPanel(data?: BudgetData): void {
    if (!document.getElementById(OVERLAY_ID)) return;
    if (data) _currentData = data;
    if (!_currentData) return;
    const body = document.querySelector(`#${OVERLAY_ID} .bp-body`) as HTMLElement | null;
    if (body) renderBudgetPanel(body, _currentData);
}
