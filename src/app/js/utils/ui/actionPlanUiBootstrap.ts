// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// ACTION-PLAN-001 — UI Bootstrap (FASE 2 / RF-10..RF-14).
//
// Porta de entrada na UI do Plano de Ação Ambiental: renderiza DENTRO da view
// da aba `action-plan` do painel constellation (#constellation-view-action-plan),
// NÃO uma faixa fixed. Espelha o padrão de complianceUiBootstrap.ts:
//   - lista de ações filtrável (status/prazo/responsável/tipo/origem)
//   - modal de cadastro/edição (asyncDialogs — NUNCA dialog nativo)
//   - visão de andamento (% concluído, nº atrasadas, distribuição GUT)
//   - RF-11: geração em lote a partir dos achados (dedup por originRef)
//   - RF-12: campos extras de condicionante (LP/LI/LO)
//   - RF-14: export CSV/JSON/Markdown
//
// Tudo SÓ ativa com CONFIG.FEATURES.ACTION_PLAN === true (guard defensivo).

import { CONFIG } from '../../config.js';
import {
    createAction,
    createActionFromFinding,
    transitionStatus,
    verifyAction,
    computeGut,
    isOverdue,
    computeCycleKpi,
    ActionPlanError,
    type Action,
    type ActionStatus,
    type ActionType,
    type ActionOriginType,
    type ActionEvidence,
    type ActionSeverity,
} from '../../core/actionPlan/_actionPlanPure.js';
import { dueConditionAlerts } from '../../core/actionPlan/_conditionAlertsPure.js';
import {
    getActions,
    setActions,
} from '../../core/actionPlan/actionPlanModelState.js';
import { exportActionPlanAs, type ActionExportFormat } from '../../core/actionPlan/_actionPlanExportPure.js';
import { getMeasurableOds, isClaimedTierHonest } from '../../core/ods/_registryPure.js';
import { asyncConfirm, asyncPrompt } from './asyncDialogs.js';

// ----------------------------------------------------------------
// FLAG GUARD (RF / §8 Rollback)
// ----------------------------------------------------------------

/** A feature está habilitada? Guard defensivo: só liga com ===true. */
export function isActionPlanEnabled(): boolean {
    return CONFIG.FEATURES?.ACTION_PLAN === true;
}

const VIEW_ID = 'constellation-view-action-plan';

// ----------------------------------------------------------------
// I18N (fallback PT-BR — t() opcional, espelha complianceUiBootstrap)
// ----------------------------------------------------------------

interface MaybeT {
    (key: string, fallback?: string): string;
}

function _t(key: string, fallback: string): string {
    if (typeof window === 'undefined') return fallback;
    const t: MaybeT | undefined = window.t || (window.translations && window.translations.t);
    if (typeof t === 'function') {
        try {
            const v = t(key, fallback);
            if (typeof v === 'string' && v !== key) return v;
        } catch (e) {
            console.debug('[actionPlan:i18n]', (e as Error)?.message || e);
        }
    }
    return fallback;
}

function _escapeHtml(s: unknown): string {
    return String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!),
    );
}

function _escapeAttr(s: unknown): string {
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

/** "Hoje" em ISO date YYYY-MM-DD (para derivar `atrasada`). */
function _today(): string {
    return new Date().toISOString().slice(0, 10);
}

// ----------------------------------------------------------------
// LABELS (i18n com fallback)
// ----------------------------------------------------------------

const STATUS_ORDER: ActionStatus[] = [
    'aberta',
    'em_andamento',
    'pendente_verificacao',
    'concluida',
    'verificada',
    'reaberta',
    'cancelada',
];

function _statusLabel(s: ActionStatus): string {
    const fallback: Record<ActionStatus, string> = {
        aberta: 'Aberta',
        em_andamento: 'Em andamento',
        pendente_verificacao: 'Pendente de verificação',
        concluida: 'Concluída',
        verificada: 'Verificada',
        cancelada: 'Cancelada',
        reaberta: 'Reaberta',
    };
    return _t(`actionPlan.status.${s}`, fallback[s] ?? s);
}

function _typeLabel(t: ActionType): string {
    const fallback: Record<ActionType, string> = {
        corretiva: 'Corretiva',
        preventiva: 'Preventiva',
        mitigadora: 'Mitigadora',
        compensatoria: 'Compensatória',
    };
    return _t(`actionPlan.type.${t}`, fallback[t] ?? t);
}

function _originLabel(o: ActionOriginType): string {
    const fallback: Record<ActionOriginType, string> = {
        nonconformity: 'Não-conformidade',
        permitCondition: 'Condicionante de licença',
        cetesbRisk: 'Risco CETESB',
        auditRecommendation: 'Recomendação de auditoria',
        scenario: 'Cenário',
        manual: 'Manual',
    };
    return _t(`actionPlan.origin.${o}`, fallback[o] ?? o);
}

// ----------------------------------------------------------------
// A13 — badge de vencimento de condicionantes (consome dueConditionAlerts/A9)
// ----------------------------------------------------------------

/** Janela "a vencer" em dias corridos (§5 item 13) — fixa na v1 da UI. */
const CONDITION_DUE_SOON_WINDOW_DAYS = 30;

type ConditionAlertKind = 'overdue' | 'dueSoon' | 'evidenceExpired';

/** Rótulo i18n do badge de vencimento, por tipo de alerta (§5 consequência). */
function _conditionAlertLabel(kind: ConditionAlertKind): string {
    const fallback: Record<ConditionAlertKind, string> = {
        overdue: 'Vencida',
        dueSoon: 'Vencendo em breve',
        evidenceExpired: 'Evidência expirada',
    };
    return _t(`actionPlan.conditionAlert.${kind}`, fallback[kind]);
}

/**
 * Badges de vencimento (RF-12/A13) para UMA ação, a partir dos 3 conjuntos já
 * classificados por {@link dueConditionAlerts} (A9). `overdue` e
 * `evidenceExpired` são a mais alta severidade (ameaçam a licença — §5
 * consequência) e usam a mesma cor de GUT "Alta"; `dueSoon` é aviso (cor
 * "Média"). Uma ação pode acumular mais de um badge (ex.: vencida E com
 * evidência expirada ao mesmo tempo).
 */
function _conditionBadges(action: Action, alerts: ReturnType<typeof dueConditionAlerts>): string {
    const badges: string[] = [];
    if (alerts.overdue.includes(action)) {
        badges.push(
            `<span class="ap-chip ap-chip--alta" data-condition-alert="overdue">${_escapeHtml(_conditionAlertLabel('overdue'))}</span>`,
        );
    }
    if (alerts.evidenceExpired.includes(action)) {
        badges.push(
            `<span class="ap-chip ap-chip--alta" data-condition-alert="evidenceExpired">${_escapeHtml(_conditionAlertLabel('evidenceExpired'))}</span>`,
        );
    }
    if (alerts.dueSoon.includes(action)) {
        badges.push(
            `<span class="ap-chip ap-chip--media" data-condition-alert="dueSoon">${_escapeHtml(_conditionAlertLabel('dueSoon'))}</span>`,
        );
    }
    return badges.join(' ');
}

function _errorMessage(code: string): string {
    const fallback: Record<string, string> = {
        ERR_AP_ORPHAN: 'Toda ação precisa de uma causa: vincule a um problema.',
        ERR_AP_NO_EVIDENCE: 'Não dá para concluir sem prova: anexe ao menos uma evidência.',
        ERR_AP_SAME_VERIFIER: 'Quem executou a ação não pode verificá-la.',
        ERR_AP_INVALID_TRANSITION: 'Esta mudança de status não é permitida: siga a ordem do ciclo.',
        ERR_AP_CORRECTIVE_NO_CAUSE: 'Ação corretiva exige a causa-raiz preenchida.',
    };
    return _t(`actionPlan.errors.${code}`, fallback[code] ?? code);
}

// ----------------------------------------------------------------
// FILTER STATE
// ----------------------------------------------------------------

interface FilterState {
    status: string; // '' = todos
    type: string;
    origin: string;
    responsible: string; // substring
    overdueOnly: boolean;
}

const _filter: FilterState = {
    status: '',
    type: '',
    origin: '',
    responsible: '',
    overdueOnly: false,
};

/** Aplica os filtros à lista de ações (puro o suficiente — lê `_filter`). */
function _applyFilter(actions: Action[]): Action[] {
    const today = _today();
    const respNeedle = _filter.responsible.trim().toLowerCase();
    return actions.filter((a) => {
        if (_filter.status && a.status !== _filter.status) return false;
        if (_filter.type && a.type !== _filter.type) return false;
        if (_filter.origin && a.originType !== _filter.origin) return false;
        if (respNeedle && !String(a.responsible || '').toLowerCase().includes(respNeedle)) return false;
        if (_filter.overdueOnly && !isOverdue(a, today)) return false;
        return true;
    });
}

// ----------------------------------------------------------------
// STORE HELPERS (lê/grava no actionPlanModelState)
// ----------------------------------------------------------------

function _list(): Action[] {
    return getActions();
}

function _replaceAction(updated: Action): void {
    const next = _list().map((a) => (a.id === updated.id ? updated : a));
    setActions(next);
}

function _addAction(created: Action): void {
    setActions([..._list(), created]);
}

// ----------------------------------------------------------------
// PUBLIC: lazy-render into the tab view (called by constellation.ts)
// ----------------------------------------------------------------

/**
 * Renderiza o Plano de Ação dentro da view da aba `action-plan`. Chamado pelo
 * hook lazy-render de constellation.ts ao ativar a aba. Guard defensivo: no-op
 * silencioso se a flag estiver off ou a view não existir.
 */
export function renderActionPlanIntoView(): void {
    if (!isActionPlanEnabled()) {
        console.debug('[actionPlan:render] disabled via CONFIG.FEATURES.ACTION_PLAN — no-op');
        return;
    }
    const view = typeof document !== 'undefined' ? document.getElementById(VIEW_ID) : null;
    if (!view) return;
    _render(view);
}

/**
 * Inicializa a UI (idempotente). Mantido por simetria com initComplianceUi —
 * a renderização real é lazy (na aba). Guard defensivo aplicado.
 */
export function initActionPlanUi(): void {
    if (!isActionPlanEnabled()) {
        console.debug('[actionPlan:init] disabled via CONFIG.FEATURES.ACTION_PLAN — no-op');
        return;
    }
    // UI-First: revela o botão da aba (escondido por default no index.html via
    // style="display:none"). Com a flag off, o botão fica oculto e a aba some.
    if (typeof document !== 'undefined') {
        const tabBtn = document.querySelector('.constellation-tab[data-ctab="action-plan"]') as HTMLElement | null;
        if (tabBtn) tabBtn.style.display = '';
    }
    // Render imediato se a view já estiver visível (re-entrância segura).
    renderActionPlanIntoView();
}

// ----------------------------------------------------------------
// RENDER (lista + filtros + andamento + ações de toolbar)
// ----------------------------------------------------------------

function _render(view: HTMLElement): void {
    const all = _list();
    const filtered = _applyFilter(all);
    const today = _today();

    // KPI / andamento (RF-15 derivado)
    const total = all.length;
    const doneCount = all.filter((a) => a.status === 'concluida' || a.status === 'verificada').length;
    const overdueCount = all.filter((a) => isOverdue(a, today)).length;
    const kpi = computeCycleKpi([], all, today);
    const donePct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
    const gutDist = { Alta: 0, 'Média': 0, Baixa: 0 } as Record<string, number>;
    for (const a of all) gutDist[a.priority] = (gutDist[a.priority] ?? 0) + 1;

    view.innerHTML = `
        <section class="ap-root" aria-label="${_escapeAttr(_t('actionPlan.title', 'Plano de Ação Ambiental'))}">
            <div class="ap-toolbar">
                <strong class="ap-heading">${_escapeHtml(_t('actionPlan.title', 'Plano de Ação Ambiental'))}</strong>
                <span class="ap-spacer"></span>
                <button type="button" class="ap-btn ap-btn--primary" data-ap="new">${_escapeHtml(_t('actionPlan.newAction', 'Nova ação'))}</button>
                <button type="button" class="ap-btn" data-ap="generate">${_escapeHtml(_t('actionPlan.generateFromFindings', 'Gerar ações a partir dos achados'))}</button>
                <button type="button" class="ap-btn" data-ap="export" ${total === 0 ? 'disabled' : ''}>${_escapeHtml(_t('actionPlan.export', 'Exportar'))}</button>
            </div>

            <div class="ap-progress" role="group" aria-label="${_escapeAttr(_t('actionPlan.progress.aria', 'Andamento do plano'))}">
                <div class="ap-progress-bar"><div class="ap-progress-fill" style="width:${donePct}%"></div></div>
                <div class="ap-progress-stats">
                    <span class="ap-stat">${_escapeHtml(_t('actionPlan.progress.done', 'Concluído'))}: <b>${donePct}%</b></span>
                    <span class="ap-stat ap-stat--overdue">${_escapeHtml(_t('actionPlan.progress.overdue', 'Atrasadas'))}: <b>${overdueCount}</b></span>
                    <span class="ap-stat">${_escapeHtml(_t('actionPlan.kpi.verified', 'Eficácia verificada'))}: <b>${Math.round(kpi.verified * 100)}%</b></span>
                    <span class="ap-stat ap-gut-dist">GUT — <span class="ap-chip ap-chip--alta">Alta ${gutDist.Alta}</span> <span class="ap-chip ap-chip--media">Média ${gutDist['Média']}</span> <span class="ap-chip ap-chip--baixa">Baixa ${gutDist.Baixa}</span></span>
                </div>
            </div>

            <div class="ap-filters">
                <select class="ap-filter" data-ap-filter="status" aria-label="${_escapeAttr(_t('actionPlan.filter.status', 'Status'))}">
                    <option value="">${_escapeHtml(_t('actionPlan.filter.allStatus', 'Todos os status'))}</option>
                    ${STATUS_ORDER.map((s) => `<option value="${s}" ${_filter.status === s ? 'selected' : ''}>${_escapeHtml(_statusLabel(s))}</option>`).join('')}
                </select>
                <select class="ap-filter" data-ap-filter="type" aria-label="${_escapeAttr(_t('actionPlan.filter.type', 'Tipo'))}">
                    <option value="">${_escapeHtml(_t('actionPlan.filter.allTypes', 'Todos os tipos'))}</option>
                    ${(['corretiva', 'preventiva', 'mitigadora', 'compensatoria'] as ActionType[]).map((tp) => `<option value="${tp}" ${_filter.type === tp ? 'selected' : ''}>${_escapeHtml(_typeLabel(tp))}</option>`).join('')}
                </select>
                <select class="ap-filter" data-ap-filter="origin" aria-label="${_escapeAttr(_t('actionPlan.filter.origin', 'Origem'))}">
                    <option value="">${_escapeHtml(_t('actionPlan.filter.allOrigins', 'Todas as origens'))}</option>
                    ${(['nonconformity', 'permitCondition', 'cetesbRisk', 'auditRecommendation', 'scenario', 'manual'] as ActionOriginType[]).map((o) => `<option value="${o}" ${_filter.origin === o ? 'selected' : ''}>${_escapeHtml(_originLabel(o))}</option>`).join('')}
                </select>
                <input type="text" class="ap-filter ap-filter--text" data-ap-filter="responsible" value="${_escapeAttr(_filter.responsible)}" placeholder="${_escapeAttr(_t('actionPlan.filter.responsible', 'Responsável…'))}" aria-label="${_escapeAttr(_t('actionPlan.fields.responsible', 'Quem (responsável)'))}">
                <label class="ap-filter ap-filter--check"><input type="checkbox" data-ap-filter="overdueOnly" ${_filter.overdueOnly ? 'checked' : ''}> ${_escapeHtml(_t('actionPlan.filter.overdueOnly', 'Só atrasadas'))}</label>
            </div>

            <div class="ap-list-wrap">
                ${_renderTable(filtered, today, dueConditionAlerts(all, today, CONDITION_DUE_SOON_WINDOW_DAYS))}
            </div>
            <div id="ap-error" class="ap-error" role="alert" aria-live="polite"></div>
        </section>
    `;

    _wire(view);
}

function _renderTable(actions: Action[], today: string, alerts: ReturnType<typeof dueConditionAlerts>): string {
    if (actions.length === 0) {
        return `<p class="ap-empty">${_escapeHtml(_t('actionPlan.empty', 'Nenhuma ação. Crie uma ação nova ou gere a partir dos achados detectados.'))}</p>`;
    }
    const rows = actions
        .map((a) => {
            const overdue = isOverdue(a, today);
            const priClass = a.priority === 'Alta' ? 'alta' : a.priority === 'Média' ? 'media' : 'baixa';
            const conditionBadges = _conditionBadges(a, alerts);
            return `
            <tr class="ap-row ${overdue ? 'ap-row--overdue' : ''}" data-ap-id="${_escapeAttr(a.id)}">
                <th scope="row" class="ap-cell-title">${_escapeHtml(a.title)}</th>
                <td>${_escapeHtml(_originLabel(a.originType))}</td>
                <td>${_escapeHtml(_typeLabel(a.type))}</td>
                <td>${_escapeHtml(a.responsible)}</td>
                <td class="ap-cell-due ${overdue ? 'ap-overdue-text' : ''}">
                    ${_escapeHtml(a.dueDate)}${overdue ? ' ⚠' : ''}
                    ${conditionBadges ? `<div class="ap-condition-badges">${conditionBadges}</div>` : ''}
                </td>
                <td><span class="ap-chip ap-chip--${priClass}" aria-label="${_escapeAttr(_t('actionPlan.gut.priority', 'Prioridade') + ' ' + a.priority + ', GUT ' + a.gutScore)}">GUT ${a.gutScore}</span></td>
                <td><span class="ap-status ap-status--${a.status}">${_escapeHtml(_statusLabel(a.status))}</span></td>
                <td class="ap-cell-actions">
                    <button type="button" class="ap-mini" data-ap-edit="${_escapeAttr(a.id)}">${_escapeHtml(_t('actionPlan.edit', 'Editar'))}</button>
                    <button type="button" class="ap-mini" data-ap-advance="${_escapeAttr(a.id)}">${_escapeHtml(_t('actionPlan.advance', 'Avançar'))}</button>
                    <button type="button" class="ap-mini" data-ap-evidence="${_escapeAttr(a.id)}">${_escapeHtml(_t('actionPlan.attachEvidence', 'Evidência'))} (${a.evidence.length})</button>
                </td>
            </tr>`;
        })
        .join('');
    return `
        <table class="ap-table" aria-label="${_escapeAttr(_t('actionPlan.listAria', 'Lista de ações'))}">
            <thead>
                <tr>
                    <th scope="col">${_escapeHtml(_t('actionPlan.fields.title', 'O quê (ação)'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.col.origin', 'Origem'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.col.type', 'Tipo'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.fields.responsible', 'Quem (responsável)'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.fields.dueDate', 'Quando (prazo)'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.gut.priority', 'Prioridade'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.col.status', 'Status'))}</th>
                    <th scope="col">${_escapeHtml(_t('actionPlan.col.actions', 'Ações'))}</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>`;
}

// ----------------------------------------------------------------
// WIRE (event listeners — re-attached on every render)
// ----------------------------------------------------------------

function _showError(view: HTMLElement, msg: string): void {
    const el = view.querySelector('#ap-error') as HTMLElement | null;
    if (el) {
        el.textContent = msg;
        window.setTimeout(() => {
            if (el.textContent === msg) el.textContent = '';
        }, 6000);
    }
}

function _rerender(): void {
    const view = document.getElementById(VIEW_ID);
    if (view) _render(view);
}

function _wire(view: HTMLElement): void {
    // Toolbar
    view.querySelector('[data-ap="new"]')?.addEventListener('click', () => void _openActionModal(null));
    view.querySelector('[data-ap="generate"]')?.addEventListener('click', () => void _generateFromFindings());
    view.querySelector('[data-ap="export"]')?.addEventListener('click', () => void _openExport());

    // Filters
    view.querySelectorAll('[data-ap-filter]').forEach((node) => {
        const el = node as HTMLInputElement | HTMLSelectElement;
        const key = el.dataset.apFilter as keyof FilterState;
        const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(evt, () => {
            if (key === 'overdueOnly') {
                _filter.overdueOnly = (el as HTMLInputElement).checked;
            } else {
                (_filter as unknown as Record<string, string>)[key] = el.value;
            }
            _rerender();
            // Restaura foco no campo de texto após re-render
            if (key === 'responsible') {
                const again = document.querySelector('[data-ap-filter="responsible"]') as HTMLInputElement | null;
                if (again) {
                    again.focus();
                    again.setSelectionRange(again.value.length, again.value.length);
                }
            }
        });
    });

    // Row actions
    view.querySelectorAll('[data-ap-edit]').forEach((b) =>
        b.addEventListener('click', () => {
            const id = (b as HTMLElement).dataset.apEdit!;
            const a = _list().find((x) => x.id === id);
            if (a) void _openActionModal(a);
        }),
    );
    view.querySelectorAll('[data-ap-advance]').forEach((b) =>
        b.addEventListener('click', () => void _advanceAction((b as HTMLElement).dataset.apAdvance!)),
    );
    view.querySelectorAll('[data-ap-evidence]').forEach((b) =>
        b.addEventListener('click', () => void _attachEvidence((b as HTMLElement).dataset.apEvidence!)),
    );
}

// ----------------------------------------------------------------
// MODAL — cadastro/edição (asyncDialogs custom, NUNCA dialog nativo)
// ----------------------------------------------------------------

/** Constrói e mostra um modal próprio (overlay) com formulário 5W2H + GUT. */
function _openActionModal(existing: Action | null): Promise<void> {
    return new Promise<void>((resolve) => {
        const doc = document;
        const overlay = doc.createElement('div');
        overlay.className = 'ap-modal-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', _t('actionPlan.modal.title', 'Cadastro de ação'));

        const a = existing;
        const isPermit = (a?.originType ?? 'manual') === 'permitCondition';

        overlay.innerHTML = `
            <div class="ap-modal">
                <div class="ap-modal-head">${_escapeHtml(existing ? _t('actionPlan.modal.edit', 'Editar ação') : _t('actionPlan.modal.new', 'Nova ação'))}</div>
                <div class="ap-modal-body">
                    <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.title', 'O quê (ação)'))} *</span>
                        <input type="text" data-f="title" value="${_escapeAttr(a?.title ?? '')}"></label>
                    <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.cause', 'Por quê (causa-raiz)'))} *</span>
                        <textarea data-f="cause" rows="2">${_escapeHtml(a?.cause ?? '')}</textarea></label>
                    <div class="ap-field-row">
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.responsible', 'Quem (responsável)'))} *</span>
                            <input type="text" data-f="responsible" value="${_escapeAttr(a?.responsible ?? '')}"></label>
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.dueDate', 'Quando (prazo)'))} *</span>
                            <input type="date" data-f="dueDate" value="${_escapeAttr((a?.dueDate ?? '').slice(0, 10))}"></label>
                    </div>
                    <div class="ap-field-row">
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.location', 'Onde (local/unidade)'))}</span>
                            <input type="text" data-f="location" value="${_escapeAttr(a?.location ?? '')}"></label>
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.cost', 'Quanto (custo estimado)'))}</span>
                            <input type="number" step="any" data-f="cost" value="${_escapeAttr(a?.cost ?? '')}"></label>
                    </div>
                    <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.fields.method', 'Como (método)'))}</span>
                        <textarea data-f="method" rows="2">${_escapeHtml(a?.method ?? '')}</textarea></label>
                    <div class="ap-field-row">
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.col.origin', 'Origem'))} *</span>
                            <select data-f="originType">
                                ${(['manual', 'nonconformity', 'permitCondition', 'cetesbRisk', 'auditRecommendation', 'scenario'] as ActionOriginType[]).map((o) => `<option value="${o}" ${(a?.originType ?? 'manual') === o ? 'selected' : ''}>${_escapeHtml(_originLabel(o))}</option>`).join('')}
                            </select></label>
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.col.type', 'Tipo'))}</span>
                            <select data-f="type">
                                ${(['corretiva', 'preventiva', 'mitigadora', 'compensatoria'] as ActionType[]).map((tp) => `<option value="${tp}" ${(a?.type ?? 'corretiva') === tp ? 'selected' : ''}>${_escapeHtml(_typeLabel(tp))}</option>`).join('')}
                            </select></label>
                    </div>
                    <div class="ap-field-row ap-gut-row">
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.gut.gravity', 'Gravidade'))} (1-5)</span>
                            <input type="number" min="1" max="5" data-f="gravity" value="${_escapeAttr(a?.gravity ?? 3)}"></label>
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.gut.urgency', 'Urgência'))} (1-5)</span>
                            <input type="number" min="1" max="5" data-f="urgency" value="${_escapeAttr(a?.urgency ?? 3)}"></label>
                        <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.gut.trend', 'Tendência'))} (1-5)</span>
                            <input type="number" min="1" max="5" data-f="trend" value="${_escapeAttr(a?.trend ?? 3)}"></label>
                        <div class="ap-field ap-gut-preview"><span>GUT</span><b data-gut-preview>—</b></div>
                    </div>
                    <fieldset class="ap-permit ${isPermit ? '' : 'ap-hidden'}" data-permit-block>
                        <legend>${_escapeHtml(_t('actionPlan.permit.legend', 'Condicionante de licença (LP/LI/LO)'))}</legend>
                        <div class="ap-field-row">
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.licenseNumber', 'Nº da licença'))}</span>
                                <input type="text" data-f="licenseNumber" value="${_escapeAttr(a?.licenseNumber ?? '')}"></label>
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.agency', 'Órgão'))}</span>
                                <select data-f="agency">
                                    <option value="">—</option>
                                    ${(['CETESB', 'IBAMA', 'municipal'] as const).map((ag) => `<option value="${ag}" ${a?.regulators?.find((r) => r.role === 'primary')?.agencyCode === ag ? 'selected' : ''}>${ag}</option>`).join('')}
                                </select></label>
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.phase', 'Fase'))}</span>
                                <select data-f="phase">
                                    <option value="">—</option>
                                    ${(['LP', 'LI', 'LO'] as const).map((ph) => `<option value="${ph}" ${a?.phase === ph ? 'selected' : ''}>${ph}</option>`).join('')}
                                </select></label>
                        </div>
                        <div class="ap-field-row">
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.agencyDeadline', 'Prazo do órgão'))}</span>
                                <input type="date" data-f="agencyDeadline" value="${_escapeAttr((a?.agencyDeadline ?? '').slice(0, 10))}"></label>
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.proofPeriodicity', 'Periodicidade da comprovação'))}</span>
                                <input type="text" data-f="proofPeriodicity" value="${_escapeAttr(a?.proofPeriodicity ?? '')}"></label>
                        </div>
                        <div class="ap-field-row">
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.theme', 'Tema (categoria X)'))}</span>
                                <select data-f="monitoringTheme">
                                    <option value="">—</option>
                                    ${(['agua', 'ar', 'ruido', 'fauna', 'flora', 'residuos_efluentes', 'solo', 'social', 'compensacao'] as const).map((th) => `<option value="${th}" ${(a as any)?.monitoringTheme === th ? 'selected' : ''}>${_escapeHtml(th)}</option>`).join('')}
                                </select></label>
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.function', 'Função'))}</span>
                                <select data-f="monitoringFunction">
                                    <option value="">—</option>
                                    ${(['preventiva', 'mitigadora', 'compensatoria'] as const).map((fn) => `<option value="${fn}" ${(a as any)?.monitoringFunction === fn ? 'selected' : ''}>${_escapeHtml(fn)}</option>`).join('')}
                                </select></label>
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.regime', 'Regime'))}</span>
                                <select data-f="monitoringRegime">
                                    <option value="">—</option>
                                    ${(['prazo_fixo', 'continua'] as const).map((rg) => `<option value="${rg}" ${a?.monitoringRegime === rg ? 'selected' : ''}>${_escapeHtml(rg === 'prazo_fixo' ? 'Prazo fixo' : 'Contínua')}</option>`).join('')}
                                </select></label>
                        </div>
                        <div class="ap-field-row">
                            <label class="ap-field"><span>${_escapeHtml(_t('actionPlan.permit.odsId', 'ODS vinculado (mensurável)'))}</span>
                                <select data-f="odsId">
                                    <option value="">—</option>
                                    ${getMeasurableOds().map((ods) => `<option value="${ods.id}" ${a?.odsId === ods.id ? 'selected' : ''}>${_escapeHtml(ods.id + '. ' + ods.label_pt + ' (' + ods.tier + ')')}</option>`).join('')}
                                </select></label>
                            <label class="ap-field ap-field--hint"><span>${_escapeHtml(_t('actionPlan.permit.odsHint', 'Só ODS com tier mensurável (T1/T2/T3). T0 não aparece — anti-falso-verde.'))}</span></label>
                        </div>
                    </fieldset>
                </div>
                <div class="ap-modal-actions">
                    <button type="button" class="ap-btn" data-ap-cancel>${_escapeHtml(_t('actionPlan.cancel', 'Cancelar'))}</button>
                    <button type="button" class="ap-btn ap-btn--primary" data-ap-save>${_escapeHtml(_t('actionPlan.save', 'Salvar'))}</button>
                </div>
                <div class="ap-modal-error" role="alert" aria-live="polite" data-modal-error></div>
            </div>`;

        doc.body.appendChild(overlay);

        const q = <T extends Element>(sel: string): T | null => overlay.querySelector(sel) as T | null;
        const val = (f: string): string => (q<HTMLInputElement>(`[data-f="${f}"]`)?.value ?? '').trim();

        // GUT live preview
        const updateGut = () => {
            const g = Number(val('gravity')) || 3;
            const u = Number(val('urgency')) || 3;
            const tr = Number(val('trend')) || 3;
            const r = computeGut(g, u, tr);
            const prev = q<HTMLElement>('[data-gut-preview]');
            if (prev) prev.textContent = `${r.gutScore} (${r.priority})`;
        };
        ['gravity', 'urgency', 'trend'].forEach((f) =>
            q<HTMLInputElement>(`[data-f="${f}"]`)?.addEventListener('input', updateGut),
        );
        updateGut();

        // Toggle permit block by origin
        q<HTMLSelectElement>('[data-f="originType"]')?.addEventListener('change', (e) => {
            const block = q<HTMLElement>('[data-permit-block]');
            if (block) block.classList.toggle('ap-hidden', (e.target as HTMLSelectElement).value !== 'permitCondition');
        });

        const close = () => {
            overlay.remove();
            resolve();
        };
        q<HTMLButtonElement>('[data-ap-cancel]')?.addEventListener('click', close);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });
        overlay.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Escape') close();
        });

        q<HTMLButtonElement>('[data-ap-save]')?.addEventListener('click', () => {
            try {
                const originType = (val('originType') || 'manual') as ActionOriginType;
                // Constrói o draft sem atribuir `undefined` explícito a campos
                // opcionais (exactOptionalPropertyTypes): omite o campo se vazio.
                const draft: Record<string, unknown> = {
                    title: val('title'),
                    cause: val('cause'),
                    dueDate: val('dueDate'),
                    responsible: val('responsible'),
                    originType,
                    type: (val('type') || 'corretiva') as ActionType,
                    severity: (existing?.severity ?? 'medium') as ActionSeverity,
                    gravity: Number(val('gravity')) || 3,
                    urgency: Number(val('urgency')) || 3,
                    trend: Number(val('trend')) || 3,
                };
                if (existing) {
                    draft.id = existing.id;
                    draft.createdAt = existing.createdAt;
                    if (existing.originRef !== undefined) draft.originRef = existing.originRef;
                }
                if (val('location')) draft.location = val('location');
                if (val('method')) draft.method = val('method');
                if (val('cost')) draft.cost = Number(val('cost'));
                if (originType === 'permitCondition') {
                    if (val('licenseNumber')) draft.licenseNumber = val('licenseNumber');
                    const ag = val('agency');
                    // createAction migra o campo legado `agency` para `regulators[]` (ENV-CONDITIONS-001 A16).
                    if (ag === 'CETESB' || ag === 'IBAMA' || ag === 'municipal') (draft as { agency?: string }).agency = ag;
                    const ph = val('phase');
                    if (ph === 'LP' || ph === 'LI' || ph === 'LO') draft.phase = ph;
                    if (val('agencyDeadline')) draft.agencyDeadline = val('agencyDeadline');
                    if (val('proofPeriodicity')) draft.proofPeriodicity = val('proofPeriodicity');
                    // ENV-CONDITIONS-001 A11 — categoria X (theme/function/regime) + ODS
                    const regime = val('monitoringRegime');
                    if (regime === 'prazo_fixo' || regime === 'continua') draft.monitoringRegime = regime;
                    const odsRaw = val('odsId');
                    if (odsRaw) {
                        const odsId = Number(odsRaw);
                        // Anti-falso-verde: só grava ODS se o tier for honesto
                        // (isClaimedTierHonest). T0 nunca aparece no select, mas
                        // esta guarda extra protege contra manipulação de DOM.
                        if (Number.isFinite(odsId) && odsId >= 1 && odsId <= 17 && isClaimedTierHonest(odsId, 'T3')) {
                            draft.odsId = odsId;
                        }
                    }
                }
                const created = createAction(draft as Partial<Action>);
                // createAction reseta status para 'aberta'; preserva o ciclo de vida
                // (status/histórico/evidência/verificador) ao editar uma ação existente.
                const finalAction: Action = existing
                    ? {
                          ...created,
                          status: existing.status,
                          history: existing.history,
                          evidence: existing.evidence,
                          createdAt: existing.createdAt,
                          ...(existing.verifiedBy !== undefined ? { verifiedBy: existing.verifiedBy } : {}),
                      }
                    : created;
                if (existing) _replaceAction(finalAction);
                else _addAction(finalAction);
                close();
                _rerender();
            } catch (err) {
                const code = err instanceof ActionPlanError ? err.code : 'ERR_AP_ORPHAN';
                const me = q<HTMLElement>('[data-modal-error]');
                if (me) me.textContent = _errorMessage(code);
            }
        });

        q<HTMLInputElement>('[data-f="title"]')?.focus();
    });
}

// ----------------------------------------------------------------
// ADVANCE STATUS (PDCA) — escolha de próximo estado via prompt
// ----------------------------------------------------------------

const NEXT_STATES: Record<ActionStatus, ActionStatus[]> = {
    aberta: ['em_andamento', 'cancelada'],
    em_andamento: ['pendente_verificacao', 'cancelada'],
    pendente_verificacao: ['concluida', 'em_andamento'],
    concluida: ['verificada', 'reaberta'],
    verificada: ['reaberta'],
    reaberta: ['em_andamento'],
    cancelada: [],
};

async function _advanceAction(id: string): Promise<void> {
    const a = _list().find((x) => x.id === id);
    const view = document.getElementById(VIEW_ID);
    if (!a || !view) return;
    const options = NEXT_STATES[a.status] ?? [];
    if (options.length === 0) {
        _showError(view, _t('actionPlan.terminalState', 'Esta ação está num estado final (cancelada).'));
        return;
    }
    // Caminho especial: verificada exige verificador ≠ responsável (RF-5).
    if (a.status === 'concluida' && options.includes('verificada')) {
        const verifier = await asyncPrompt(
            _t('actionPlan.verifyPrompt', 'Quem verifica a eficácia? (precisa ser diferente do responsável)'),
            '',
            { confirmLabel: _t('actionPlan.verify', 'Verificar'), placeholder: _t('actionPlan.fields.verifier', 'Verificador') },
        );
        if (verifier === null) return;
        try {
            const updated = verifyAction(a, verifier);
            _replaceAction(updated);
            _rerender();
            return;
        } catch (err) {
            const code = err instanceof ActionPlanError ? err.code : 'ERR_AP_INVALID_TRANSITION';
            _showError(view, _errorMessage(code));
            return;
        }
    }
    // Demais transições: pega o primeiro destino "avançar" (ou confirma cancelar).
    const target = options[0];
    if (!target) return;
    if (target === 'cancelada') {
        const ok = await asyncConfirm(_t('actionPlan.confirmCancel', 'Cancelar esta ação?'), { danger: true });
        if (!ok) return;
    }
    try {
        const by = await asyncPrompt(
            _t('actionPlan.transitionBy', 'Quem registra esta transição?'),
            a.responsible || '',
            { confirmLabel: _t('actionPlan.advance', 'Avançar') },
        );
        if (by === null) return;
        const updated = transitionStatus(a, target, by.trim() || 'sistema');
        _replaceAction(updated);
        _rerender();
    } catch (err) {
        const code = err instanceof ActionPlanError ? err.code : 'ERR_AP_INVALID_TRANSITION';
        _showError(view, _errorMessage(code));
    }
}

// ----------------------------------------------------------------
// EVIDENCE (RF-4) — anexa item a evidence[] via asyncPrompt
// ----------------------------------------------------------------

async function _attachEvidence(id: string): Promise<void> {
    const a = _list().find((x) => x.id === id);
    const view = document.getElementById(VIEW_ID);
    if (!a || !view) return;
    const ref = await asyncPrompt(
        _t('actionPlan.evidencePrompt', 'Descreva/aponte a evidência (foto, laudo, protocolo, documento):'),
        '',
        { confirmLabel: _t('actionPlan.attachEvidence', 'Anexar'), placeholder: _t('actionPlan.evidencePlaceholder', 'ex.: laudo-2026-03.pdf') },
    );
    if (ref === null || !ref.trim()) return;
    const evidence: ActionEvidence = {
        kind: 'documento',
        ref: ref.trim(),
        date: new Date().toISOString(),
    };
    const updated: Action = { ...a, evidence: [...a.evidence, evidence], updatedAt: new Date().toISOString() };
    _replaceAction(updated);
    _rerender();
}

// ----------------------------------------------------------------
// RF-11 — Geração em lote a partir dos achados (dedup por originRef)
// ----------------------------------------------------------------

interface FindingLike {
    severity?: ActionSeverity | 'minor' | 'major';
    category?: string;
    finding?: string;
    recommendation?: string;
    elementId?: string;
}

/** Varre os módulos de finding que emitem o shape 1:1 (investigationQuality/greenwashing). */
async function _collectFindings(): Promise<Array<{ source: FindingLike; originType: ActionOriginType }>> {
    const out: Array<{ source: FindingLike; originType: ActionOriginType }> = [];
    try {
        const iq = await import('../../core/audit/investigationQuality.js');
        const collect = (arr: unknown): void => {
            if (Array.isArray(arr)) {
                for (const f of arr) {
                    if (f && typeof f === 'object') out.push({ source: f as FindingLike, originType: 'auditRecommendation' });
                }
            }
        };
        if (typeof iq.checkHydrostratigraphicIntegrity === 'function') collect(iq.checkHydrostratigraphicIntegrity());
        if (typeof iq.checkSpatialCoverage === 'function') collect(iq.checkSpatialCoverage());
        if (typeof iq.checkTemporalCoverage === 'function') collect(iq.checkTemporalCoverage());
        if (typeof iq.checkParameterCompleteness === 'function') collect(iq.checkParameterCompleteness());
    } catch (e) {
        console.debug('[actionPlan:findings:iq]', (e as Error)?.message || e);
    }
    return out;
}

async function _generateFromFindings(): Promise<void> {
    const view = document.getElementById(VIEW_ID);
    if (!view) return;
    const found = await _collectFindings();
    if (found.length === 0) {
        _showError(view, _t('actionPlan.noFindings', 'Nenhum achado aberto encontrado para gerar ações.'));
        return;
    }
    // Dedup por originRef já existente no plano.
    const existingRefs = new Set(_list().map((a) => a.originRef).filter(Boolean) as string[]);
    const candidates = found.filter((f) => {
        const ref = f.source.elementId ?? f.source.category;
        return !ref || !existingRefs.has(ref);
    });
    if (candidates.length === 0) {
        _showError(view, _t('actionPlan.allFindingsCovered', 'Todos os achados já têm ação vinculada.'));
        return;
    }
    const ok = await asyncConfirm(
        _t('actionPlan.confirmGenerate', 'Gerar {n} ações a partir dos achados detectados?').replace('{n}', String(candidates.length)),
        { confirmLabel: _t('actionPlan.generate', 'Gerar') },
    );
    if (!ok) return;
    const created: Action[] = [];
    const seenThisBatch = new Set<string>();
    for (const c of candidates) {
        const ref = c.source.elementId ?? c.source.category ?? '';
        if (ref && seenThisBatch.has(ref)) continue;
        if (ref) seenThisBatch.add(ref);
        try {
            created.push(createActionFromFinding(c.source, c.originType));
        } catch (e) {
            console.debug('[actionPlan:generate]', (e as Error)?.message || e);
        }
    }
    if (created.length > 0) setActions([..._list(), ...created]);
    _rerender();
}

// ----------------------------------------------------------------
// RF-14 — Export CSV/JSON/Markdown
// ----------------------------------------------------------------

async function _openExport(): Promise<void> {
    const actions = _list();
    if (actions.length === 0) return;
    const fmt = await asyncPrompt(
        _t('actionPlan.exportPrompt', 'Formato de export: csv, json ou markdown'),
        'csv',
        { confirmLabel: _t('actionPlan.export', 'Exportar'), placeholder: 'csv | json | markdown' },
    );
    if (fmt === null) return;
    const norm = fmt.trim().toLowerCase();
    const format: ActionExportFormat = norm === 'json' ? 'json' : norm === 'markdown' || norm === 'md' ? 'markdown' : 'csv';
    const { text, mime, ext } = exportActionPlanAs(actions, format, _t('actionPlan.title', 'Plano de Ação Ambiental'));
    const bom = format === 'csv' ? '﻿' : '';
    const blob = new Blob([bom + text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano-acao-${new Date().toISOString().slice(0, 10)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------
// RF-8 — "Criar ação corretiva" a partir de um finding (telas de problema)
// ----------------------------------------------------------------

/**
 * Cria uma ação pré-preenchida a partir de um finding e abre o modal de edição
 * para o usuário completar prazo/responsável. Exposta para as telas de problema
 * (compliance/CETESB/auditoria) wirearem o botão "Criar ação corretiva" (RF-8).
 * Guard defensivo: no-op se a flag estiver off.
 *
 * @param source - Finding `{ severity, category, finding, recommendation?, elementId? }`.
 * @param originType - Origem da ação (default `auditRecommendation`).
 */
export function createCorrectiveFromFinding(
    source: FindingLike,
    originType: ActionOriginType = 'auditRecommendation',
): void {
    if (!isActionPlanEnabled()) return;
    try {
        const action = createActionFromFinding(source, originType);
        _addAction(action);
        // Abre o painel na aba action-plan se houver wire global de tab.
        try {
            (window as unknown as { switchConstellationTab?: (t: string) => void }).switchConstellationTab?.('action-plan');
        } catch (e) {
            console.debug('[actionPlan:create-corrective:tab]', (e as Error)?.message || e);
        }
        _rerender();
        void _openActionModal(action);
    } catch (e) {
        console.debug('[actionPlan:create-corrective]', (e as Error)?.message || e);
    }
}

// Exposição global mínima para wire das telas de problema (RF-8) e e2e.
if (typeof window !== 'undefined') {
    (window as unknown as Record<string, unknown>).createCorrectiveActionFromFinding = createCorrectiveFromFinding;
    (window as unknown as Record<string, unknown>).renderActionPlanIntoView = renderActionPlanIntoView;
}
