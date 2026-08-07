// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   USAGE DASHBOARD — Modal de consumo de quota freemium

   Exibe barras de progresso para cada metrica ativa (Fase 1:
   observations, eco1_exports, models), tier do usuario e botao
   de upgrade para free/pro.
   ================================================================ */
import { getUsagePercentages, initMeteringCache, ACTIVE_METRICS, METRIC_LABELS } from '../../core/metering/quota.js';
import { getCurrentUser } from '../auth/session.js';
/** @type {((e: KeyboardEvent) => void) | null} */
let _escHandler: any = null;
/**
 * Abre o modal de uso da conta.
 * Espera cache carregar antes de renderizar (evita exibir zeros).
 */
export async function openUsageDashboard() {
    if (!document.getElementById('usage-dashboard-modal')) {
        _injectModal();
    }
    const modal = (document.getElementById('usage-dashboard-modal')) as HTMLElement;
    modal.style.display = 'flex';
    // Mostra loading enquanto cache carrega
    const body = document.getElementById('usage-dashboard-body');
    if (body) {
        body.innerHTML = `<p style="text-align:center;padding:20px;color:var(--text-muted)">Carregando...</p>`;
    }
    // Garante cache atualizado antes de renderizar
    await initMeteringCache();
    _renderContent();
    if (_escHandler)
        document.removeEventListener('keydown', _escHandler);
    _escHandler = (e: any) => {
        if (e.key === 'Escape')
            closeUsageDashboard();
    };
    document.addEventListener('keydown', _escHandler);
}
/**
 * Fecha o modal de uso da conta.
 */
export function closeUsageDashboard() {
    const modal = document.getElementById('usage-dashboard-modal');
    if (modal)
        modal.style.display = 'none';
    if (_escHandler) {
        document.removeEventListener('keydown', _escHandler);
        _escHandler = null;
    }
}
function _injectModal() {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
        <div id="usage-dashboard-modal" class="modal-overlay" style="display:none;"
             role="dialog" aria-modal="true" aria-labelledby="usage-dashboard-title">
            <div class="modal-dialog" style="width:520px;max-width:95vw">
                <div class="modal-header">
                    <h3 id="usage-dashboard-title">
                        <span class="icon" data-icon="bar-chart-2"></span>
                        <span data-i18n="usageDashboard">Uso da Conta</span>
                    </h3>
                    <button class="modal-close" data-cc-action="cc-e264bea9"
                            aria-label="Fechar">&#x2715;</button>
                </div>
                <div class="modal-body" id="usage-dashboard-body" style="padding:20px 24px">
                </div>
            </div>
        </div>`;
    // firstElementChild ignora text nodes do whitespace
    document.body.appendChild((wrap.firstElementChild) as Node);
}
function _renderContent() {
    const body = document.getElementById('usage-dashboard-body');
    if (!body)
        return;
    const user = getCurrentUser();
    if (!user) {
        body.innerHTML = `<p style="text-align:center;color:var(--text-muted)">
            Fa&#231;a login para ver o uso da sua conta.</p>`;
        return;
    }
    const tier = user.tier || 'free';
    const tierLabels = { free: 'Free', pro: 'Pro', scale: 'Scale', enterprise: 'Enterprise' };
    const percentages = getUsagePercentages();
    const barsHtml = ACTIVE_METRICS.map((/** @type {string} */ metric) => {
        const data = (percentages)[metric];
        if (!data)
            return '';
        const { used, limit, pct } = data;
        const isUnlimited = limit === -1;
        const barColor = pct >= 95 ? '#e53e3e' : pct >= 80 ? '#d97706' : '#38a169';
        const limitText = isUnlimited ? 'Ilimitado' : limit.toLocaleString('pt-BR') as Record<string, any>;
        const usedText = used.toLocaleString('pt-BR');
        const label = (METRIC_LABELS as Record<string, any>)[metric] || metric;
        return `<div style="margin-bottom:18px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">
                <span style="font-size:13px;font-weight:500">${label}</span>
                <span style="font-size:12px;color:var(--text-muted)">
                    ${usedText} / ${limitText}${isUnlimited ? '' : ` (${pct}%)`}
                </span>
            </div>
            <div style="height:6px;background:var(--border-color) as Record<string, string>;border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${isUnlimited ? 0 : pct}%;background:${barColor};border-radius:3px;transition:width .3s"></div>
            </div>
        </div>`;
    }).join('');
    const upgradeHtml = tier === 'free' || tier === 'pro'
        ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border-color);text-align:center">
               <button class="btn btn-primary"
                       data-cc-action="cc-42fd2fae">
                   Fazer upgrade
               </button>
           </div>`
        : '';
    body.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
            <span style="font-size:12px;color:var(--text-muted)">Plano atual</span>
            <span style="font-size:13px;font-weight:600;padding:2px 8px;background:var(--accent-bg);border-radius:4px">
                ${ (tierLabels as Record<string, any>)[tier] || tier}
            </span>
        </div>
        ${barsHtml}
        <p style="font-size:11px;color:var(--text-muted);margin-top:4px">
            Cota reinicia no in&#237;cio de cada m&#234;s (UTC).</p>
        ${upgradeHtml}`;
}
