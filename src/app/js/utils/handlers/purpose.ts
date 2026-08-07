// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.2.0
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   PURPOSE HANDLERS — Window handlers para o Modulo de Proposito
   Registra funcoes window.* para abertura do modal de proposito,
   refresh dos dados, e toggle do micro-feedback.
   ================================================================ */
import { getSnapshots, computeDelta, getCurrentEIS, getSessionDelta } from '../../core/purpose/index.js';
import { EIS_AXIS_NAMES } from '../../core/purpose/actionImpact.js';
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { openModal, closeModal } from '../ui/modals.js';
import { importCDN } from '../helpers/cdnLoader.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('Purpose');
// ================================================================
// AXIS COLORS - Cores por eixo (consistentes com micro-toast)
// ================================================================
const AXIS_COLORS = {
    T: '#4a9eff',
    A: '#22c55e',
    Cp: '#8b5cf6',
    Ty: '#f59e0b',
    Cs: '#06b6d4',
    Cm: '#ec4899',
};
type PurposeTimeWindow = '1d' | '7d' | '30d' | 'all';
const PURPOSE_TIME_WINDOWS = new Set<PurposeTimeWindow>(['1d', '7d', '30d', 'all']);
/**
 * @param {string | null} value
 * @returns {PurposeTimeWindow}
 */
function _normalizeTimeWindow(value: string | null): PurposeTimeWindow {
    const candidate = value || '';
    return PURPOSE_TIME_WINDOWS.has(candidate as PurposeTimeWindow) ? (candidate as PurposeTimeWindow) : '7d';
}
// ================================================================
// MODAL STATE
// ================================================================
let _modalEl: HTMLElement | null = null;
let _chartInstance: any = null;
/** @type {PurposeTimeWindow} */
let _activeWindow: PurposeTimeWindow = '7d';
// ================================================================
// HANDLERS
// ================================================================
/**
 * Open the Purpose reflection modal (Layer 4).
 * Abre o modal de reflexao com grafico de tendencia EIS,
 * tabs de janela temporal, e breakdown por eixo.
 */
export async function handleOpenPurpose() {
    try {
        _activeWindow = '7d';
        _ensureModalDOM();
        // .ecbt-overlay é sempre display:flex; precisa override inline ao abrir/fechar
        // pois openModal/closeModal só togglam .active (CSS rule .modal-overlay.active obsoleta aqui).
        const _purposeEl = document.getElementById('purpose-modal') as any;
        if (_purposeEl) _purposeEl.style.display = 'flex';
        openModal('purpose-modal');
        await _renderModalContent();
    }
    catch (e: any) {
        log.warn('Failed to open purpose modal:', /** @type {any} */ (e)?.message);
        showToast(t('purposeError') || 'Failed to load purpose data', 'error');
    }
}
/**
 * Refresh purpose data and update modal if open.
 * Atualiza dados de proposito.
 */
export function handlePurposeRefresh() {
    if (_modalEl?.classList.contains('active')) {
        _renderModalContent().catch((_e) => console.debug('[utils/handlers/purpose:silent-catch]', _e?.message || _e));
    }
}
/**
 * Toggle micro-feedback on/off.
 * Alterna micro-feedback (Camada 1) on/off via localStorage.
 */
export function handleToggleMicroFeedback() {
    try {
        const key = 'ecbyts-purpose-microfeedback';
        const current = localStorage.getItem(key) || '';
        const next = current === 'false' ? 'true' : 'false';
        localStorage.setItem(key, next);
        const label = next === 'true'
            ? t('purposeMicroFeedbackOn') || 'Purpose micro-feedback enabled'
            : t('purposeMicroFeedbackOff') || 'Purpose micro-feedback disabled';
        showToast(label, 'info');
    }
    catch {
        showToast('Failed to toggle micro-feedback', 'error');
    }
}
// ================================================================
// MODAL DOM
// ================================================================
/**
 * Create the Purpose modal DOM element if it doesn't exist.
 * Cria o elemento DOM do modal de proposito se ainda nao existir.
 */
function _ensureModalDOM() {
    if (document.getElementById('purpose-modal')) {
        _modalEl = document.getElementById('purpose-modal');
        return;
    }
    // B2 migração 2026-05-29: .modal-overlay → .ecbt-overlay + .ecbt-dialog--lg.
    // closeModal('purpose-modal') usado em outro lugar continua compatível (toggla .active no DOM)
    // mas adicionalmente seto style.display p/ ecbt-overlay (sempre flex) abrir/fechar real.
    const overlay = document.createElement('div');
    overlay.id = 'purpose-modal';
    overlay.className = 'ecbt-overlay';
    overlay.style.display = 'none';
    overlay.innerHTML = `
        <div class="ecbt-dialog ecbt-dialog--lg purpose-modal-box">
            <div class="ecbt-dialog-header">
                <h3 class="ecbt-dialog-title">${t('purposeModalTitle') || 'Data Quality Impact'}</h3>
                <button class="ecbt-dialog-close" data-cc-action="cc-e422ecbe">&#10005;</button>
            </div>
            <div class="purpose-modal-tabs">
                <button class="purpose-modal-tab active" data-window="1d">1D</button>
                <button class="purpose-modal-tab" data-window="7d">7D</button>
                <button class="purpose-modal-tab" data-window="30d">30D</button>
            </div>
            <div class="purpose-modal-body">
                <div class="purpose-modal-summary" id="purpose-modal-summary"></div>
                <div class="purpose-modal-chart-wrapper">
                    <canvas id="purpose-modal-chart"></canvas>
                </div>
                <div class="purpose-modal-axes" id="purpose-modal-axes"></div>
                <div class="purpose-modal-priorities" id="purpose-modal-priorities"></div>
            </div>
        </div>
    `;
    // Tab click handlers
    overlay.querySelectorAll('.purpose-modal-tab').forEach((/** @type {any} */ btn) => {
        btn.addEventListener('click', () => {
            _activeWindow = _normalizeTimeWindow(btn.getAttribute('data-window'));
            overlay.querySelectorAll('.purpose-modal-tab').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            _renderModalContent().catch((_e) => console.debug('[utils/handlers/purpose:silent-catch]', _e?.message || _e));
        });
    });
    // Click overlay to close
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay)
            closeModal('purpose-modal');
    });
    document.body.appendChild(overlay);
    _modalEl = overlay;
}
/**
 * Close purpose modal handler.
 */
export function handleClosePurpose() {
    closeModal('purpose-modal');
    const _purposeEl = document.getElementById('purpose-modal') as any;
    if (_purposeEl) _purposeEl.style.display = 'none';
    if (_chartInstance) {
        _chartInstance.destroy();
        _chartInstance = null;
    }
}
// ================================================================
// MODAL CONTENT RENDERING
// ================================================================
/**
 * Render the full modal content for the active time window.
 * Renderiza conteudo completo do modal para a janela temporal ativa.
 */
async function _renderModalContent() {
    const delta = await computeDelta(_activeWindow);
    const current = getCurrentEIS();
    const sessionDelta = getSessionDelta();
    const snapshots = await getSnapshots(_activeWindow);
    _renderSummary(current, delta, sessionDelta, snapshots.length);
    _renderAxesBreakdown(current, delta);
    _renderPriorities(current);
    await _renderChart(snapshots, current);
    // Sync active tab
    if (_modalEl) {
        _modalEl.querySelectorAll('.purpose-modal-tab').forEach((btn) => {
            (btn as HTMLElement).classList.toggle('active', (btn as HTMLElement).getAttribute('data-window') === _activeWindow);
        });
    }
}
/**
 * Resolve o rótulo legível do veredicto EIS.
 */
function _verdictLabelFromVerdict(verdict: string): string {
    if (verdict === 'Audit Ready') return t('eisVerdictAudit') || 'Audit Ready';
    if (verdict === 'Management Ready') return t('eisVerdictManagement') || 'Management Ready';
    return t('eisVerdictCritical') || 'Critical Data';
}

/**
 * Resolve a classe CSS de status a partir da nota EIS.
 */
function _verdictClassFromEis(eis: number): string {
    if (eis >= 4.5) return 'high';
    if (eis >= 3.5) return 'medium';
    return 'low';
}

/**
 * Resolve o rótulo do período ativo.
 */
function _periodLabelFromWindow(window: PurposeTimeWindow): string {
    if (window === '1d') return t('purposeToday') || 'Today';
    if (window === '7d') return t('purposeThisWeek') || 'This week';
    return t('purposeThisMonth') || 'This month';
}

/**
 * Retorna o indicador visual (seta) de um delta numérico.
 */
function _deltaArrow(v: number): string {
    if (v > 0) return '&#9650;';
    if (v < 0) return '&#9660;';
    return '&#8212;';
}

/**
 * Retorna o sinal '+' para valores positivos.
 */
function _deltaSign(v: number): string {
    return v > 0 ? '+' : '';
}

/**
 * Retorna a classe CSS de um delta numérico.
 */
function _deltaClass(v: number): string {
    if (v > 0) return 'positive';
    if (v < 0) return 'negative';
    return 'neutral';
}

/**
 * Render summary section (score, verdict, deltas).
 */
/** @param {any} current @param {any} delta @param {any} sessionDelta @param {any} snapshotCount */
function _renderSummary(current: any, delta: any, sessionDelta: any, snapshotCount: number) {
    const el = document.getElementById('purpose-modal-summary');
    if (!el)
        return;
    const verdictLabel = _verdictLabelFromVerdict(current.verdict);
    const verdictClass = _verdictClassFromEis(current.eis);
    const periodLabel = _periodLabelFromWindow(_activeWindow);
    el.innerHTML = `
        <div class="purpose-modal-score-row">
            <span class="purpose-modal-score purpose-status-${verdictClass}">${current.eis.toFixed(2)}</span>
            <span class="purpose-modal-scale">/ 5.00</span>
            <span class="purpose-modal-verdict purpose-status-${verdictClass}">${verdictLabel}</span>
        </div>
        <div class="purpose-modal-deltas">
            <div class="purpose-modal-delta">
                <span class="purpose-modal-delta-label">${periodLabel}</span>
                <span class="purpose-modal-delta-value purpose-status-delta-${_deltaClass(delta.deltaEis)}">
                    ${_deltaArrow(delta.deltaEis)} ${_deltaSign(delta.deltaEis)}${delta.deltaEis.toFixed(2)}
                </span>
            </div>
            <div class="purpose-modal-delta">
                <span class="purpose-modal-delta-label">${t('purposeSession') || 'Session'}</span>
                <span class="purpose-modal-delta-value purpose-status-delta-${_deltaClass(sessionDelta)}">
                    ${_deltaArrow(sessionDelta)} ${_deltaSign(sessionDelta)}${sessionDelta.toFixed(2)}
                </span>
            </div>
            <div class="purpose-modal-delta">
                <span class="purpose-modal-delta-label">${t('purposeSnapshots') || 'Snapshots'}</span>
                <span class="purpose-modal-delta-value purpose-status-delta-neutral">${snapshotCount}</span>
            </div>
        </div>
    `;
}
/**
 * Render per-axis breakdown with bars and deltas.
 */
/** @param {any} current @param {any} delta */
function _renderAxesBreakdown(current: any, delta: any) {
    const el = document.getElementById('purpose-modal-axes');
    if (!el)
        return;
    const axisKeys = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'];
    const axisColors: Record<string, string> = AXIS_COLORS;
    const axisNames: Record<string, any> = EIS_AXIS_NAMES;
    el.innerHTML = `
        <div class="purpose-modal-axes-title">${t('purposeAxesTitle') || 'Per-Axis Breakdown'}</div>
        <div class="purpose-modal-axes-grid">
            ${axisKeys
        .map((key) => {
        const score = current.axes[key] || 0;
        const axisDelta = delta.deltaAxes?.[key] || 0;
        const color = axisColors[key];
        const name = t(axisNames[key]?.i18nKey) || axisNames[key]?.name || key;
        const sign = axisDelta > 0 ? '+' : '';
        const deltaClass = axisDelta > 0 ? 'positive' : axisDelta < 0 ? 'negative' : 'neutral';
        return `
                        <div class="purpose-modal-axis-row">
                            <span class="purpose-modal-axis-label" style="color: ${color}">${key}</span>
                            <span class="purpose-modal-axis-name">${name}</span>
                            <div class="purpose-modal-axis-bar">
                                <div class="purpose-modal-axis-fill" style="width: ${(score / 5) * 100}%; background: ${color}"></div>
                            </div>
                            <span class="purpose-modal-axis-score">${score.toFixed(1)}</span>
                            <span class="purpose-modal-axis-delta purpose-status-delta-${deltaClass}">
                                ${axisDelta !== 0 ? `${sign}${axisDelta.toFixed(1)}` : ''}
                            </span>
                        </div>
                    `;
    })
        .join('')}
        </div>
    `;
}
/**
 * Render improvement priorities - axes with lowest scores.
 */
/** @param {any} current */
function _renderPriorities(current: any) {
    const el = document.getElementById('purpose-modal-priorities');
    if (!el)
        return;
    const axisKeys = ['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm'];
    const sorted = axisKeys.map((key) => ({ key, score: current.axes[key] || 0 })).sort((a, b) => a.score - b.score);
    // Show top 2 weakest axes (if score < 4)
    const weak = sorted.filter((a) => a.score < 4).slice(0, 2);
    if (weak.length === 0) {
        el.innerHTML = `
            <div class="purpose-modal-priorities-title">${t('purposePrioritiesTitle') || 'Focus Areas'}</div>
            <div class="purpose-modal-priority-ok">${t('purposeAllGood') || 'All axes above threshold. Keep monitoring.'}</div>
        `;
        return;
    }
    const PRIORITY_HINTS = {
        T: t('purposeHintT') || 'Add metadata (name, description) to elements',
        A: t('purposeHintA') || 'Add coordinates or connect sensors for accuracy',
        Cp: t('purposeHintCp') || 'Define a boundary element for site completeness',
        Ty: t('purposeHintTy') || 'Create additional campaigns for temporal coverage',
        Cs: t('purposeHintCs') || 'Add observations with standardized units',
        Cm: t('purposeHintCm') || 'Apply a taxonomy for data comparability',
    };
    el.innerHTML = `
        <div class="purpose-modal-priorities-title">${t('purposePrioritiesTitle') || 'Focus Areas'}</div>
        ${weak
        .map((a: any) => {
        const ac: Record<string, string> = AXIS_COLORS;
        const ph: Record<string, string> = PRIORITY_HINTS;
        return `
            <div class="purpose-modal-priority-item">
                <span class="purpose-modal-priority-axis" style="color: ${ac[a.key]}">${a.key}</span>
                <span class="purpose-modal-priority-hint">${ph[a.key] || ''}</span>
                <span class="purpose-modal-priority-score">${a.score.toFixed(1)}/5</span>
            </div>
        `;
    })
        .join('')}
    `;
}
/**
 * Formata o rótulo de tempo de um snapshot de acordo com a janela ativa.
 */
function _formatChartLabel(timestamp: number | string, window: PurposeTimeWindow): string {
    const d = new Date(timestamp);
    if (window === '1d') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Registra os componentes necessários do Chart.js quando disponíveis.
 */
function _registerChartComponents(ChartClass: any, Chart: any): void {
    if (!ChartClass.register) return;
    const comps = Chart.default || Chart;
    if (comps.LineController) {
        ChartClass.register(
            comps.LineController,
            comps.LineElement,
            comps.PointElement,
            comps.LinearScale,
            comps.CategoryScale,
            comps.Filler,
            comps.Tooltip,
            comps.Legend,
        );
    }
}

/**
 * Renderiza mensagem de "dados insuficientes" no canvas.
 */
function _renderNoDataMessage(canvas: HTMLCanvasElement): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = canvas.parentElement?.offsetWidth || 400;
    canvas.height = 120;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
        t('purposeNotEnoughData') || 'Not enough snapshots for trend chart',
        canvas.width / 2,
        canvas.height / 2,
    );
}

/**
 * Render the EIS trend chart using Chart.js.
 * Renderiza grafico de tendencia EIS via Chart.js (CDN).
 */
/** @param {any} snapshots @param {any} _current */
async function _renderChart(snapshots: any[], _current: any) {
    const canvas = document.getElementById('purpose-modal-chart') as HTMLCanvasElement | null;
    if (!canvas)
        return;
    // Destroy previous chart
    if (_chartInstance) {
        _chartInstance.destroy();
        _chartInstance = null;
    }
    if (snapshots.length < 2) {
        // Not enough data for chart - show message
        _renderNoDataMessage(canvas);
        return;
    }
    try {
        const Chart = await importCDN('https://cdn.jsdelivr.net/npm/chart.js@4.4.6/+esm');
        const ChartClass = Chart.Chart || Chart.default?.Chart || Chart;
        _registerChartComponents(ChartClass, Chart);
        const labels = snapshots.map((s: any) => _formatChartLabel(s.timestamp, _activeWindow));
        const scores = snapshots.map((s: any) => s.eis);
        _chartInstance = new ChartClass(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'EIS',
                        data: scores,
                        borderColor: '#4a9eff',
                        backgroundColor: 'rgba(74, 158, 255, 0.1)',
                        fill: true,
                        tension: 0.3,
                        pointRadius: snapshots.length > 30 ? 0 : 3,
                        pointHoverRadius: 5,
                        borderWidth: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0,
                        max: 5,
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        ticks: { color: '#888', stepSize: 1 },
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: '#888',
                            maxTicksLimit: 8,
                            maxRotation: 0,
                        },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx: any) => `EIS: ${ctx.raw.toFixed(2)}`,
                        },
                    },
                },
            },
        });
    }
    catch (e: any) {
        log.warn('Chart.js load failed, using canvas fallback:', /** @type {any} */ (e)?.message);
        _renderCanvasFallback(canvas, snapshots);
    }
}
/**
 * Fallback sparkline when Chart.js is unavailable.
 */
/** @param {any} canvas @param {any} snapshots */
function _renderCanvasFallback(canvas: HTMLCanvasElement, snapshots: any[]) {
    const w = canvas.parentElement?.offsetWidth || 400;
    const h = 120;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (snapshots.length < 2)
        return;
    const scores = snapshots.map((s: any) => s.eis);
    const pad = 10;
    const plotW = w - pad * 2;
    const plotH = h - pad * 2;
    ctx.beginPath();
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    scores.forEach((v: any, i: number) => {
        const x = pad + (i / (scores.length - 1)) * plotW;
        const y = pad + plotH - (v / 5) * plotH;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
}
// ================================================================
// EXPORTS - Objeto de handlers para registro em index.js
// ================================================================
export const purposeHandlers = {
    handleOpenPurpose,
    handleClosePurpose,
    handlePurposeRefresh,
    handleToggleMicroFeedback,
};
//# sourceMappingURL=purpose.js.map
