// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * homeEisDashboard.js - Home EIS and Purpose dashboard renderer.
 * Extracted from homeGrid.js per SPLIT-HOMEGRID-001 S4.
 */

import { CONFIG } from '../../../config.js';
import { getAllElements } from '../../../core/elements/manager.js';
import { getAllCampaigns } from '../../../core/campaigns/manager.js';
import {
    getSnapshots,
    computeDelta,
    getCurrentEIS,
    computeSimplifiedEIS,
    getAllScopeEIS,
} from '../../../core/purpose/index.js';
import { getModelIdSync } from '../../../core/io/modelLink.js';
import { escapeHtml } from '../../helpers/html.js';
import { t } from '../../i18n/translations.js';
import { getEcbtHudSnapshot } from '../ecbtScoreHud.js';
import {
    buildEisAxes,
    buildPurposeViewModel,
    buildScopeAttentionItems,
    getSparklinePoints,
    resolveEisVerdict,
} from './homeEisDashboardHelpers.js';

/** @type {any} */
let _eisEl: any = null;
/** @type {any} */
let _purposeEl: any = null;

/** @param {any} eisContainer @param {any} purposeContainer */
export function initEisDashboard(eisContainer: any, purposeContainer: any) {
    _eisEl = eisContainer;
    _purposeEl = purposeContainer;
}

export function renderEisDashboard() {
    renderEisCards();
    void updatePurposePanel();
}

export function renderEisCards() {
    if (!_eisEl) return;
    if (CONFIG.FEATURES?.LAUNCHPAD_V3_HERO) {
        _eisEl.style.display = 'none';
        _eisEl.innerHTML = '';
        return;
    }

    const elements = _safeGetElements();
    if (elements.length === 0) {
        _eisEl.innerHTML = '';
        _eisEl.style.display = 'none';
        return;
    }

    _eisEl.style.display = 'block';
    _eisEl.innerHTML = _buildEisDashboardHtml(elements);
}

function _buildEisDashboardHtml(elements: any[]): string {
    const campaigns = _safeGetCampaigns();
    const axisNames: Record<string, string> = {
        T: t('eisTransparency') || 'Transparency',
        A: t('eisAccuracy') || 'Accuracy',
        Cp: t('eisCompleteness') || 'Completeness',
        Ty: t('eisTimeliness') || 'Timeliness',
        Cs: t('eisConsistency') || 'Consistency',
        Cm: t('eisComparability') || 'Comparability',
    };
    const eisRaw = computeSimplifiedEIS(elements, campaigns);
    const eisScore = Number.isFinite(eisRaw?.eis) ? eisRaw.eis : 0;
    const axes = buildEisAxes(eisRaw, axisNames);
    const verdict = resolveEisVerdict(eisScore, {
        audit: t('eisVerdictAudit') || 'Audit Ready',
        management: t('eisVerdictManagement') || 'Management Ready',
        critical: t('eisVerdictCritical') || 'Critical Data',
    });
    const modelId = getModelIdSync();
    const modelBadgeHtml = modelId
        ? `<span class="purpose-model-badge" title="${escapeHtml(modelId)}">${escapeHtml(modelId.slice(0, 8))}</span>`
        : '';

    return `
        <div class="home-section-header">
            <span class="home-section-title">${t('homeEisTitle') || 'Model Integrity Score (EIS)'} ${modelBadgeHtml}</span>
            <span class="home-eis-badge ${verdict.color}">${verdict.label}</span>
        </div>
        <div class="home-eis-content">
            ${_renderEcbtScoreBlock()}
            <div class="home-eis-main">
                <div class="home-eis-score ${verdict.color}">${eisScore.toFixed(2)}</div>
                <div class="home-eis-scale">/ 5.00</div>
            </div>
            <div class="home-eis-axes">
                ${_renderAxesHtml(axes)}
            </div>
            ${_renderScopeAttention()}
        </div>
    `;
}

function _renderAxesHtml(axes: any[]): string {
    return axes
        .map(
            (axis: any) => `
                <div class="home-eis-axis" title="${escapeHtml(axis.name)}">
                    <span class="home-eis-axis-label">${escapeHtml(axis.key)}</span>
                    <div class="home-eis-axis-bar">
                        <div class="home-eis-axis-fill" style="width: ${axis.percent}%"></div>
                    </div>
                    <span class="home-eis-axis-value">${axis.score}</span>
                </div>
            `,
        )
        .join('');
}

/**
 * P4-1 (FRIEND-SCORE-001): o ECBT Score (resultado monetário líquido — o
 * indicador PRINCIPAL por diretiva Calvin) ao lado do EIS na home, para o
 * gestor ler impacto financeiro + ambiental juntos. Reusa o snapshot do HUD
 * (mesmo feed do costHud). Degrada gracioso: sem dados de custo → "—" + dica.
 */
function _renderEcbtScoreBlock(): string {
    const { amountTxt, tone, arrow } = _readEcbtSnapshot();
    const toneClass = _resolveToneClass(tone);
    const title = t('homeEcbtTitle') || 'ECBT Score';
    const hint = _renderEcbtHint(amountTxt);
    return `
        <div class="home-ecbt-main home-ecbt-${toneClass}" title="${escapeHtml(t('homeEcbtTooltip') || 'Net result (assets − liabilities)')}">
            <div class="home-ecbt-label">${escapeHtml(title)}</div>
            <div class="home-ecbt-value">${arrow ? escapeHtml(arrow) + ' ' : ''}${escapeHtml(amountTxt)}</div>
            ${hint}
        </div>`;
}

function _readEcbtSnapshot(): { amountTxt: string; tone: string; arrow: string } {
    let amountTxt = '—';
    let tone = 'neutral';
    let arrow = '';
    try {
        const snap = getEcbtHudSnapshot();
        // "−R$ 0"/"R$ 0" = sem dados de custo ainda → trata como "—" + dica
        // (evita exibir um zero confuso como se fosse o resultado real).
        if (snap && !_isZeroOrEmptyAmount(snap.amountTxt)) {
            amountTxt = snap.amountTxt;
            tone = String(snap.tone || 'neutral');
            arrow = String(snap.arrow || '');
        }
    } catch (e: any) {
        console.debug('[homeEis:ecbt-block]', e?.message || e);
    }
    return { amountTxt, tone, arrow };
}

function _isZeroOrEmptyAmount(amountTxt?: string): boolean {
    if (!amountTxt || amountTxt === '—') return true;
    return /^[−-]?\s*[A-Z$R]*\s*0([.,]0+)?$/.test(amountTxt.trim());
}

function _resolveToneClass(tone: string): string {
    if (tone.includes('22c55e') || tone === 'positive') return 'pos';
    if (tone.includes('ef4444') || tone === 'negative') return 'neg';
    return 'neu';
}

function _renderEcbtHint(amountTxt: string): string {
    if (amountTxt !== '—') return '';
    const hintText = t('homeEcbtHint') || 'Add cost data to compute';
    return `<div class="home-ecbt-hint">${escapeHtml(hintText)}</div>`;
}

export async function updatePurposePanel() {
    if (!_purposeEl) return;

    const elements = _safeGetElements();
    if (elements.length === 0) {
        _purposeEl.innerHTML = '';
        _purposeEl.style.display = 'none';
        return;
    }

    _purposeEl.style.display = 'block';

    let snapshots: any[] = [];
    let delta: any = { deltaEis: 0, deltaAxes: { T: 0, A: 0, Cp: 0, Ty: 0, Cs: 0, Cm: 0 } };
    let current = { eis: 0, axes: {}, verdict: 'Critical Data' };
    try {
        snapshots = await getSnapshots('30d');
        delta = await computeDelta('7d');
        current = getCurrentEIS();
    } catch (error: any) {
        console.debug('[homeGrid:eisDashboard] purpose-snapshots:', (error)?.message || error);
    }

    const viewModel = buildPurposeViewModel({ snapshots, current, delta });
    if (viewModel.state === 'empty') {
        _purposeEl.innerHTML = `
            <div class="purpose-home-section">
                <div class="purpose-home-header">
                    <span class="purpose-home-title">${t('purposeTitle') || 'Your Impact'}</span>
                </div>
                <div class="purpose-home-empty">
                    ${t('purposeEmpty') || 'Start adding data to track your impact on data quality'}
                </div>
            </div>
        `;
        return;
    }

    const changedAxesHtml = (viewModel.changedAxes || [])
        .map((axis: any) => `<span class="purpose-home-axis-delta">${escapeHtml(axis.label)}</span>`)
        .join('');
    _purposeEl.innerHTML = `
        <div class="purpose-home-section">
            <div class="purpose-home-header">
                <span class="purpose-home-title">${t('purposeTitle') || 'Your Impact'}</span>
                <button class="purpose-home-details-link" data-cc-action="cc-edaa1854">${t('purposeDetails') || 'View Details'}</button>
            </div>
            <div class="purpose-home-score-row">
                <span class="purpose-home-score purpose-status-${viewModel.verdictColor}">${viewModel.finalScore.toFixed(2)}</span>
                <span class="purpose-home-delta ${viewModel.deltaClass}">${viewModel.arrow} ${viewModel.sign}${viewModel.deltaEis.toFixed(2)} ${t('purposeThisWeek') || 'this week'}</span>
            </div>
            <div class="purpose-home-meta">Base ${viewModel.baseScore.toFixed(2)} | Adj ${viewModel.adjustmentLabel} | Conf ${escapeHtml(viewModel.confidenceLabel)}</div>
            <canvas class="purpose-home-sparkline" data-testid="purpose-sparkline" width="120" height="24"></canvas>
            ${changedAxesHtml ? `<div class="purpose-home-breakdown">${changedAxesHtml}</div>` : ''}
        </div>
    `;

    _drawSparkline(_purposeEl.querySelector('.purpose-home-sparkline'), viewModel.sparkData, viewModel.verdictColor);
}

export function destroyEisDashboard() {
    _eisEl = null;
    _purposeEl = null;
}

function _renderScopeAttention() {
    try {
        const items = buildScopeAttentionItems(getAllScopeEIS());
        if (items.length === 0) return '';
        const labels: Record<string, string> = {
            cnpj: t('eis.scope_lowest_cnpj') || 'Lowest CNPJ',
            area: t('eis.scope_lowest_area') || 'Lowest Area',
        };
        // Calvin 2026-06-06 (overflow vermelho UI fix): label explicativo + classes canônicas;
        // estilos antes inline causavam overflow visível em cards estreitos sem affordance.
        const attentionTitle = t('eis.scope_attention_title') || 'Atenção (escopo)';
        const html = items
            .map((item: any) => {
                const sevCls = item.score >= 3.5 ? 'home-eis-scope-item--warn' : 'home-eis-scope-item--crit';
                const label = labels[item.type] ?? '';
                return `<span class="home-eis-scope-item ${sevCls}" title="${escapeHtml(label)}">&#9679; ${escapeHtml(item.name)} <strong>${item.score.toFixed(1)}</strong></span>`;
            })
            .join('');
        return `<div class="home-eis-scope-attention">
            <span class="home-eis-scope-label">${escapeHtml(attentionTitle)}</span>
            <div class="home-eis-scope-items">${html}</div>
        </div>`;
    } catch (error: any) {
        console.debug('[homeGrid:eisDashboard] eisScope-aggregate:', (error)?.message || error);
        return '';
    }
}

/** @param {any} canvas @param {any} data @param {any} verdictColor */
function _drawSparkline(canvas: any, data: any, verdictColor: any) {
    if (!canvas || !data || data.length < 2) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const colors: Record<string, string> = { high: '#22c55e', medium: '#f59e0b', low: '#ef4444' };
    const color = colors[verdictColor] || '#888';
    const points = getSparklinePoints(data, width, height);
    if (points.length < 2) return;

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    points.forEach((point: any, index: number) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();

    const lastPoint = points[points.length - 1];
    if (!lastPoint) return;
    ctx.beginPath();
    ctx.arc(lastPoint.x, lastPoint.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function _safeGetElements() {
    try {
        const elements = getAllElements();
        return Array.isArray(elements) ? elements : [];
    } catch {
        return [];
    }
}

function _safeGetCampaigns() {
    try {
        const campaigns = getAllCampaigns();
        return Array.isArray(campaigns) ? campaigns : [];
    } catch {
        return [];
    }
}
