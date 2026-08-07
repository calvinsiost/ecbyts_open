// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* ================================================================
   CREDITS BADGE — Indicador de saldo no statusbar
   Mostra saldo atual de creditos ECBT com barra mini e tooltip.
   Clique abre o painel detalhado de consumo.

   Localização: #status-credits no statusbar (index.html)
   Atualização: a cada recordUsage() e no login/refresh
   ================================================================ */
import { getUsageSummary, getUsagePercentages } from '../../core/metering/quota.js';
import { CREDIT_COSTS, CREDIT_PACKAGES } from '../../core/metering/creditPricing.js';
import { TIER_LIMITS } from '../../core/metering/tierLimits.js';
import { formatTokenProgress } from '../../core/metering/_tokenProgressPure.js';
import { projectMonthlyCost, getCurrentMonthProgress } from '../../core/metering/_costProjectionPure.js';
import { upsertCurrentMonth, loadHistoryVM } from '../../core/metering/monthlyHistoryStore.js';
import { computeMonthOverMonthDelta, toCSV, buildCsvFilename } from '../../core/metering/_monthlyHistoryPure.js';
import { recommendOptimalPlan } from '../../core/metering/_planRecommendationPure.js';
import * as _authNs from '../auth/session.js';
const getCurrentUser = _authNs.getCurrentUser;
import { t } from '../i18n/translations.js';
// ─── State ───────────────────────────────────────────────────────
let _currentPackage = 'free';
let _creditsUsed = 0;
let _creditsTotal = 200;
// F1 token progress state (gap G1 do CREDITS_TOKEN_METERING_EVALUATION_2026_06_02)
let _tokensUsed = 0;
let _tokensLimit = 10_000; // default free tier
// ─── Public API ──────────────────────────────────────────────────
/**
 * Inicializa o badge de creditos no statusbar.
 * Chamado no main.js apos initAuth().
 */
export function initCreditsBadge() {
    _updateFromCache();
    _render();
}
/**
 * Atualiza o badge apos consumo de creditos.
 * Chamado por quota.js apos recordUsage().
 * F4b: snapshot mensal IDB fire-and-forget para histórico.
 */
export function refreshCreditsBadge() {
    _updateFromCache();
    _render();
    // F4b snapshot histórico mensal (fire-and-forget)
    upsertCurrentMonth({
        tokens: _tokensUsed,
        credits: _creditsUsed,
        brl: +(_creditsUsed * 0.05).toFixed(2),
    }).catch((e: any) => console.debug('[creditsBadge:snapshot]', e?.message || e));
}
/**
 * Abre o painel/popup detalhado de consumo.
 * Registrado como window.handleOpenCreditsPanel.
 */
export function handleOpenCreditsPanel() {
    const existing = document.getElementById('credits-popup');
    if (existing) {
        existing.remove();
        return; // toggle
    }
    _showPopup();
}
// ─── Internal ────────────────────────────────────────────────────
function _updateFromCache() {
    const user = getCurrentUser();
    if (!user) {
        _currentPackage = 'free';
        _creditsUsed = 0;
        _creditsTotal = 200;
        return;
    }
    // Estimar creditos consumidos a partir do cache de quota
    const usage = getUsageSummary();
    let totalCredits = 0;
    for (const [metric, data] of Object.entries(usage)) {
        const cost = CREDIT_COSTS[metric];
        if (cost !== undefined && data.used > 0) {
            totalCredits += cost * data.used;
        }
    }
    _creditsUsed = Math.round(totalCredits);
    // Determinar pacote do usuario
    const tier = user.tier || user.subscription_tier || 'free';
    const pkg = CREDIT_PACKAGES.find((p: any) => p.id === tier);
    _currentPackage = pkg?.id || 'free';
    _creditsTotal = pkg?.credits || 200;
    // F1: token progress (gap G1)
    const tokensData = usage['llm_tokens'];
    _tokensUsed = tokensData?.used || 0;
    const tierLimits = TIER_LIMITS[_currentPackage as keyof typeof TIER_LIMITS] ?? TIER_LIMITS.free;
    _tokensLimit = tierLimits?.llm_tokens ?? 10_000;
}
function _render() {
    const el = document.getElementById('status-credits');
    if (!el) return;
    const user = getCurrentUser();
    if (!user) {
        el.style.display = 'none';
        return;
    }
    el.style.display = '';
    const remaining = Math.max(0, _creditsTotal - _creditsUsed);
    const pct = _creditsTotal > 0 ? Math.round((_creditsUsed / _creditsTotal) * 100) : 0;
    // Cor baseada no consumo
    let color = 'var(--accent-green, #49cc90)';
    let urgency = '';
    if (pct >= 100) {
        color = 'var(--accent-red, #f93e3e)';
        urgency = ' credits-critical';
    } else if (pct >= 80) {
        color = 'var(--accent-amber, #f59e0b)';
        urgency = ' credits-warning';
    }
    const label = t('credits.remaining') || 'credits';
    // F1 token progress badge — gap G1 (visibility no statusbar)
    const tokenVM = formatTokenProgress(_tokensUsed, _tokensLimit, { tier: _currentPackage });
    const tokenSpan =
        `<span class="credits-tokens credits-tokens--${tokenVM.color}" title="${_escapeHtml(tokenVM.tooltip)}">` +
        `&#9733; ${_escapeHtml(tokenVM.label)}` +
        `</span>`;
    el.innerHTML =
        `<span class="credits-badge${urgency}">` +
        `<span class="credits-bar-mini"><span class="credits-bar-fill" style="width:${Math.min(pct, 100)}%;background:${color}"></span></span>` +
        `<span class="credits-count">${remaining}</span>` +
        `<span class="credits-label">${_escapeHtml(label)}</span>` +
        tokenSpan +
        `</span>`;
    el.title = `${remaining}/${_creditsTotal} ${label} (${_currentPackage})\n${tokenVM.tooltip}`;
}
function _showPopup() {
    const badge = document.getElementById('status-credits');
    if (!badge) return;
    const popup = document.createElement('div');
    popup.id = 'credits-popup';
    popup.className = 'credits-popup';
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', t('credits.title') || 'Credits');
    const remaining = Math.max(0, _creditsTotal - _creditsUsed);
    const pct = _creditsTotal > 0 ? Math.round((_creditsUsed / _creditsTotal) * 100) : 0;
    const usage = getUsagePercentages();
    // Agrupar consumo por categoria
    const categories = [
        { key: 'elements', label: t('elements') || 'Elements', icon: '&#9679;' },
        { key: 'observations', label: t('observations') || 'Observations', icon: '&#9679;' },
        { key: 'eco1_exports', label: t('exports') || 'Exports', icon: '&#9654;' },
        { key: 'llm_tokens', label: 'AI Tokens', icon: '&#9733;' },
        { key: 'eis_runs', label: 'EIS', icon: '&#9737;' },
        { key: 'mcp_calls', label: 'MCP', icon: '&#9881;' },
    ];
    let breakdownHtml = '';
    for (const cat of categories) {
        const data = usage[cat.key];
        if (!data || data.used === 0) continue;
        const cost = CREDIT_COSTS[cat.key] || 0;
        const cred = Math.round(cost * data.used);
        breakdownHtml +=
            `<div class="credits-row">` +
            `<span class="credits-row-icon">${cat.icon}</span>` +
            `<span class="credits-row-label">${_escapeHtml(cat.label)}</span>` +
            `<span class="credits-row-value">${cred} cred</span>` +
            `</div>`;
    }
    if (!breakdownHtml) {
        breakdownHtml = `<div class="credits-row"><span class="credits-row-label">${t('credits.noUsage') || 'No usage this period'}</span></div>`;
    }
    // F3 Projeção mensal (gap G2: simulador "se você continuar nesse ritmo, gastará R$ Y no fim do mês")
    const { daysElapsed, daysInMonth } = getCurrentMonthProgress();
    const projectionVM = projectMonthlyCost({
        used: _tokensUsed,
        daysElapsed,
        daysInMonth,
        limit: _tokensLimit,
    });
    const projIcon =
        projectionVM.status === 'exceed' ? '&#9888;' : projectionVM.status === 'warn' ? '&#9650;' : '&#8599;';
    // F6 recomendação ótimo de plano baseada em projeção
    const recommendation = recommendOptimalPlan({
        projectedTokens: projectionVM.tokensProjected,
        currentPlanId: _currentPackage,
    });
    const recHtml = recommendation.shouldSwitch
        ? `<div class="credits-recommendation credits-recommendation--switch">` +
          `<div class="credits-recommendation-icon">&#128161;</div>` +
          `<div class="credits-recommendation-content">` +
          `<strong>${t('credits.recommendation') || 'Sugestão de plano'}</strong>` +
          `<div class="credits-recommendation-message">${_escapeHtml(recommendation.message)}</div>` +
          `</div>` +
          `</div>`
        : '';
    const projHtml =
        `<div class="credits-projection credits-projection--${projectionVM.status}">` +
        `<div class="credits-projection-header">` +
        `<span class="credits-projection-icon">${projIcon}</span>` +
        `<strong>${t('credits.projection') || 'Projeção fim do mês'}</strong>` +
        `</div>` +
        `<div class="credits-projection-message">${_escapeHtml(projectionVM.message)}</div>` +
        (projectionVM.willExceed && isFinite(projectionVM.daysUntilLimit)
            ? `<div class="credits-projection-warning">${t('credits.upgradeNow') || 'Considere upgrade para evitar bloqueio'}</div>`
            : '') +
        `</div>` +
        recHtml;
    // Calcular dias ate renovacao
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const daysLeft = Math.ceil((nextMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    // F4b: placeholder histórico (será preenchido async para não bloquear render)
    const historyPlaceholder =
        `<div class="credits-history" id="credits-history-block">` +
        `<div class="credits-history-loading">${t('credits.loadingHistory') || 'Carregando histórico…'}</div>` +
        `</div>`;
    popup.innerHTML =
        `<div class="credits-popup-header">` +
        `<strong>${t('credits.title') || 'ECBT Credits'}</strong>` +
        `<button class="credits-popup-close" data-cc-action="cc-55c99daa">&times;</button>` +
        `</div>` +
        `<div class="credits-popup-body">` +
        `<div class="credits-summary">` +
        `<div class="credits-big">${remaining}<span class="credits-total">/${_creditsTotal}</span></div>` +
        `<div class="credits-bar"><span class="credits-bar-fill" style="width:${Math.min(pct, 100)}%"></span></div>` +
        `<div class="credits-meta">${_escapeHtml(_currentPackage)} &#8226; ${t('credits.renewsIn') || 'Renews in'} ${daysLeft} ${t('days') || 'days'}</div>` +
        `</div>` +
        `<div class="credits-breakdown">${breakdownHtml}</div>` +
        projHtml +
        historyPlaceholder +
        `</div>` +
        `<div class="credits-popup-footer">` +
        `<button class="credits-btn-csv" id="credits-btn-csv" disabled>${t('credits.downloadCsv') || 'Baixar histórico (CSV)'}</button>` +
        `<button class="credits-btn-topup" data-cc-action="cc-1b057852">${t('credits.buyMore') || 'Buy more credits'}</button>` +
        `</div>`;
    // F4b: load history async + populate
    _populateHistoryBlock();
    // Posicionar acima do badge
    const rect = badge.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    popup.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(popup);
    // Fechar ao clicar fora
    const _close = (e: any) => {
        const target = e.target;
        if (!popup.contains(target) && target !== badge && !badge.contains(target)) {
            popup.remove();
            document.removeEventListener('mousedown', _close);
        }
    };
    window.requestAnimationFrame(() => document.addEventListener('mousedown', _close));
}
function _escapeHtml(str: any) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

/**
 * F4b: popula bloco de histórico mensal no popup (async).
 * Adiciona tabela 6 meses + delta vs mês anterior + handler do botão CSV.
 */
async function _populateHistoryBlock() {
    const block = document.getElementById('credits-history-block');
    const btnCsv = document.getElementById('credits-btn-csv') as HTMLButtonElement | null;
    if (!block) return;
    try {
        const vm = await loadHistoryVM();
        if (vm.monthCount === 0) {
            block.innerHTML = `<div class="credits-history-empty">${t('credits.historyEmpty') || 'Sem histórico (primeiro mês)'}</div>`;
            return;
        }
        // Delta mês atual vs anterior
        const deltaHtml =
            vm.entries.length >= 2
                ? `<div class="credits-history-delta credits-history-delta--${
                      computeMonthOverMonthDelta(vm.entries[0]!, vm.entries[1]!).direction
                  }">` +
                  _escapeHtml(computeMonthOverMonthDelta(vm.entries[0]!, vm.entries[1]!).message) +
                  `</div>`
                : '';
        // Tabela 6 meses (mais recente primeiro)
        const rowsHtml = vm.entries
            .map((e) => {
                const isEmpty = e.tokens === 0;
                const cls = isEmpty ? 'credits-history-row credits-history-row--empty' : 'credits-history-row';
                const tokensFmt = e.tokens.toLocaleString('pt-BR');
                const brlFmt = e.brl.toFixed(2).replace('.', ',');
                return (
                    `<div class="${cls}">` +
                    `<span class="credits-history-month">${_escapeHtml(e.monthKey)}</span>` +
                    `<span class="credits-history-tokens">${tokensFmt} tok</span>` +
                    `<span class="credits-history-brl">R$ ${brlFmt}</span>` +
                    `</div>`
                );
            })
            .join('');
        const avgBrl = vm.average.brl.toFixed(2).replace('.', ',');
        const totalBrl = vm.total.brl.toFixed(2).replace('.', ',');
        block.innerHTML =
            `<div class="credits-history-header">` +
            `<strong>${t('credits.historyTitle') || 'Histórico 6 meses'}</strong>` +
            `<span class="credits-history-summary">` +
            `${vm.monthCount} ${t('credits.monthsActive') || 'meses ativos'} &#8226; ` +
            `${t('credits.average') || 'média'} R$ ${avgBrl} &#8226; ` +
            `${t('credits.total') || 'total'} R$ ${totalBrl}` +
            `</span>` +
            `</div>` +
            deltaHtml +
            `<div class="credits-history-table">${rowsHtml}</div>`;
        // Enable + wire CSV button
        if (btnCsv) {
            btnCsv.disabled = false;
            btnCsv.onclick = () => _downloadCsv(vm);
        }
    } catch (e: any) {
        console.debug('[creditsBadge:populateHistory]', e?.message || e);
        block.innerHTML = `<div class="credits-history-error">${t('credits.historyError') || 'Erro ao carregar histórico'}</div>`;
    }
}

/**
 * F4b: download CSV do histórico mensal.
 * Usa Blob + URL.createObjectURL para gerar download sem servidor.
 */
function _downloadCsv(vm: any) {
    try {
        const csv = toCSV(vm);
        const filename = buildCsvFilename();
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // Cleanup async
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e: any) {
        console.debug('[creditsBadge:downloadCsv]', e?.message || e);
    }
}
