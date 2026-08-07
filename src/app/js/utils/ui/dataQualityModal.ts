// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost
/* ================================================================
   DATA QUALITY DASHBOARD — Modal UI
   ================================================================

   Painel que exibe o indice composto de qualidade de dados por
   campanha (Completude, Consistencia, Cobertura, Replicacao,
   Incerteza) com nota A-F e recomendacoes acionaveis.

   Usa os tokens .ecbt-* (design-tokens.css). Sem grafico externo:
   barras de progresso CSS mantem o MVP leve e sem dependencias.
   ================================================================ */
import { escapeHtml } from '../helpers/html.js';
import { t } from '../i18n/translations.js';
import { createLogger } from '../helpers/logger.js';
import { computeDashboard } from '../../core/campaigns/dataQualityDashboard.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
const log = createLogger('DataQualityModal');
const STYLE_ID = 'dq-modal-styles';
/**
 * Injects scoped .dq-* styles once (kept here to respect CSS file
 * ownership rules — no bare component classes in shared CSS files).
 * Injeta os estilos .dq-* uma unica vez.
 */
function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
        .dq-summary{display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:12px;background:var(--neutral-100,#f1f3f5);border-radius:8px}
        .dq-summary-meta{font-size:12px;color:var(--neutral-500,#868e96)}
        .dq-card{border:1px solid var(--neutral-200,#dee2e6);border-radius:8px;padding:12px;margin-bottom:12px}
        .dq-card-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
        .dq-card-sub{font-size:12px;color:var(--neutral-500,#868e96);margin-bottom:10px}
        .dq-grade{font-weight:700;border-radius:6px;padding:2px 10px;color:#fff;font-size:14px}
        .dq-summary-grade{font-size:22px;padding:8px 16px}
        .dq-grade--A{background:var(--success-500,#2e9e5b)}
        .dq-grade--B{background:#3b9e7a}
        .dq-grade--C{background:var(--warning-500,#d99b1c)}
        .dq-grade--D{background:#d97a1c}
        .dq-grade--F{background:var(--danger-500,#d64545)}
        .dq-bar-row{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:12px}
        .dq-bar-label{flex:0 0 110px}
        .dq-bar-track{flex:1;height:8px;background:var(--neutral-200,#dee2e6);border-radius:4px;overflow:hidden}
        .dq-bar-fill{display:block;height:100%;border-radius:4px}
        .dq-bar-val{flex:0 0 40px;text-align:right;color:var(--neutral-500,#868e96)}
        .dq-recs{margin:8px 0 0;padding-left:18px;font-size:12px}
        .dq-recs li{margin:2px 0}
        .dq-recs-ok{font-size:12px;color:var(--success-500,#2e9e5b);margin:8px 0 0}
        .dq-empty{text-align:center;color:var(--neutral-500,#868e96);padding:24px}
    `;
    document.head.appendChild(s);
}
/** @type {HTMLElement|null} */
let _overlay: any = null;
/** @type {AbortController|null} */
let _abort: any = null;
const DIMENSION_LABELS = Object.freeze({
    completeness: 'Completeness',
    consistency: 'Consistency',
    coverage: 'Coverage',
    replication: 'Replication',
    uncertainty: 'Uncertainty',
});
/**
 * Picks a token color for a 0-1 score.
 * @param {number} v
 * @returns {string}
 */
function scoreColor(v: any) {
    if (v >= 0.7) return 'var(--success-500, #2e9e5b)';
    if (v >= 0.5) return 'var(--warning-500, #d99b1c)';
    return 'var(--danger-500, #d64545)';
}
/**
 * Renders one dimension progress bar.
 * @param {string} key
 * @param {number} v
 * @returns {string}
 */
function renderBar(key: any, v: any) {
    const pct = Math.round(Math.max(0, Math.min(1, v)) * 100);
    const label = t(`dataQuality.dim.${key}`) || (DIMENSION_LABELS as Record<string, any>)[key] || key;
    return `<div class="dq-bar-row">
        <span class="dq-bar-label">${escapeHtml(label)}</span>
        <span class="dq-bar-track" aria-hidden="true">
            <span class="dq-bar-fill" style="width:${pct}%;background:${scoreColor(v)}"></span>
        </span>
        <span class="dq-bar-val">${pct}%</span>
    </div>`;
}
/**
 * Renders one campaign quality card.
 * @param {import('../../core/campaigns/dataQualityDashboard.js' as string).CampaignQualityRow} row
 * @returns {string}
 */
function renderCard(row: any) {
    const bars = Object.entries(row.dimensions)
        .map(([k, v]) => renderBar(k, v))
        .join('');
    const recs = row.recommendations.length
        ? `<ul class="dq-recs">${row.recommendations.map((r: any) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>`
        : `<p class="dq-recs-ok">${escapeHtml(t('dataQuality.noRecs') || 'No issues detected.')}</p>`;
    return `<div class="dq-card">
        <div class="dq-card-head">
            <strong>${escapeHtml(row.campaignName)}</strong>
            <span class="dq-grade dq-grade--${row.grade}">${escapeHtml(row.grade)}</span>
        </div>
        <div class="dq-card-sub">${escapeHtml((t('dataQuality.observations') || 'Observations') + ': ' + row.observationCount)} · ${escapeHtml((t('dataQuality.score') || 'Score') + ': ' + Math.round(row.compositeScore * 100) + '%')}</div>
        ${bars}
        ${recs}
    </div>`;
}
/**
 * Builds the modal HTML body.
 * @param {import('../../core/campaigns/dataQualityDashboard.js' as string).DashboardModel} model
 * @returns {string}
 */
function renderBody(model: any) {
    if (model.rows.length === 0) {
        return `<p class="dq-empty">${escapeHtml(t('dataQuality.empty') || 'No observations found. Add monitoring data to campaigns first.')}</p>`;
    }
    const summary = `<div class="dq-summary">
        <div class="dq-summary-grade dq-grade dq-grade--${model.overallGrade}">${escapeHtml(model.overallGrade)}</div>
        <div>
            <div>${escapeHtml((t('dataQuality.overall') || 'Overall quality') + ': ' + Math.round(model.overallScore * 100) + '%')}</div>
            <div class="dq-summary-meta">${escapeHtml(
                model.totalElements +
                    ' ' +
                    (t('dataQuality.elements') || 'elements') +
                    ' · ' +
                    model.totalObservations +
                    ' ' +
                    (t('dataQuality.observations') || 'observations'),
            )}</div>
        </div>
    </div>`;
    return summary + model.rows.map(renderCard).join('');
}
/**
 * Opens the Data Quality Dashboard modal.
 * Abre o painel de qualidade de dados.
 */
export function openDataQualityModal() {
    closeDataQualityModal();
    try {
        injectStyles();
        const model = computeDashboard(getAllElements(), getAllCampaigns());
        _overlay = document.createElement('div');
        _overlay.className = 'ecbt-overlay';
        _overlay.id = 'data-quality-overlay';
        const modal = document.createElement('div');
        modal.className = 'ecbt-dialog ecbt-dialog--lg';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const title = t('dataQuality.title') || 'Data Quality Dashboard';
        const closeLabel = t('close') || 'Close';
        modal.innerHTML = `
            <div class="ecbt-header">
                <h3 class="ecbt-title">${escapeHtml(title)}</h3>
                <button id="dq-close" class="ecbt-close" aria-label="${escapeHtml(closeLabel)}">&times;</button>
            </div>
            <div class="ecbt-form" id="dq-body">${renderBody(model)}</div>
        `;
        _overlay.appendChild(modal);
        document.body.appendChild(_overlay);
        _abort = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const opts = _abort ? { signal: _abort.signal } : undefined;
        modal.querySelector('#dq-close')?.addEventListener('click', closeDataQualityModal, opts);
        _overlay.addEventListener(
            'click',
            (e: any) => {
                if (e.target === _overlay) closeDataQualityModal();
            },
            opts,
        );
        document.addEventListener(
            'keydown',
            (e: any) => {
                if (e.key === 'Escape') closeDataQualityModal();
            },
            opts,
        );
    } catch (err: any) {
        log.error('open failed:', err?.message || err);
    }
}
/**
 * Closes the modal and aborts its listeners.
 * Fecha o painel e cancela os listeners.
 */
export function closeDataQualityModal() {
    if (_abort) {
        try {
            _abort.abort();
        } catch (e: any) {
            console.debug('[dataQualityModal] abort:', e?.message || e);
        }
        _abort = null;
    }
    if (_overlay && _overlay.parentNode) {
        _overlay.parentNode.removeChild(_overlay);
    }
    _overlay = null;
}
