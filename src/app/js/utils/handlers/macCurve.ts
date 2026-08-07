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
   MAC CURVE HANDLERS — Marginal Abatement Cost curve modal
   Handlers para curvas de custo marginal de abatimento

   Cada medida pode ter valores manuais OU referenciar metricas
   do Calculator. Quando uma metrica esta vinculada, o valor
   computado e usado automaticamente.

   Padrao: exporta macCurveHandlers (objeto com funcoes window.*)
   ================================================================ */
import { getCalculatorItems, getCalculatorItemById } from '../../core/calculator/manager.js';
import { computeCalculatorItem } from '../../core/calculator/engine.js';
import { escapeHtml } from '../helpers/html.js';
import { getIcon } from '../ui/icons.js';
import { t } from '../i18n/translations.js';
import { generateId } from '../helpers/id.js';
import { applyProjectValuation } from './macCurveFinancialBridge.js';
/** @typedef {Record<string, any>} MacMeasure */
/** @typedef {Record<string, any>} MacReferenceLine */
/** @typedef {Record<string, any>} MacSeries */
/** @typedef {Record<string, any>} ChartLike */
/** @typedef {{ measures: MacMeasure[], abatementUnit: string, costUnit: string, referenceLines: MacReferenceLine[], startYear: number|null, targetYear: number|null, targetReduction: number|null, yMin: number|null, yMax: number|null, [key: string]: any }} MacState */
type MacMeasure = Record<string, any>;
type MacReferenceLine = Record<string, any>;
type MacSeries = Record<string, any>;
type MacState = {
    measures: MacMeasure[];
    abatementUnit: string;
    costUnit: string;
    referenceLines: MacReferenceLine[];
    startYear: number | null;
    targetYear: number | null;
    targetReduction: number | null;
    yMin: number | null;
    yMax: number | null;
    [key: string]: any;
};
/** @returns {any} */
function getChartCtor() {
    return (globalThis as any).Chart;
}
// ----------------------------------------------------------------
// MODULE STATE
// ----------------------------------------------------------------
const _state: MacState = {
    measures: [], // Array de medidas de abatimento
    abatementUnit: '', // Unidade de abatimento: "tCO2", "ug/L", "kWh", etc.
    costUnit: 'USD', // Unidade de custo: "USD", "BRL", etc.
    referenceLines: [], // Linhas de referencia: [{ axis, value, label, color, comment }]
    startYear: null, // Ano inicio (ex: 2020)
    targetYear: null, // Ano alvo/meta (ex: 2050)
    targetReduction: null, // Meta de reducao total (t/ano)
    yMin: null, // Eixo Y minimo (null = auto)
    yMax: null, // Eixo Y maximo (null = auto)
};
// Cada medida: { name, cost, abatement, costMetricId, abatementMetricId, enabled }
// Modo projeto: { ...measure, projectMode: true, capex, opex, revenue, periods, discountRate, reductionPerPeriod }
// Modo variavel: { ...projeto, variableMode: true, cashflows: [{ capex, opex, revenue, reduction }] }
let _chartInstance: any = null;
/** @type {'mac'|'temporal'} Vista ativa do modal */
let _activeView = 'mac';
let _temporalChartInstance: any = null;
/** Paleta de 12 cores para areas do grafico temporal */
const TEMPORAL_PALETTE = [
    'rgba(59,107,255,0.7)',
    'rgba(255,152,0,0.7)',
    'rgba(76,175,80,0.7)',
    'rgba(233,30,99,0.7)',
    'rgba(156,39,176,0.7)',
    'rgba(0,188,212,0.7)',
    'rgba(255,87,34,0.7)',
    'rgba(96,125,139,0.7)',
    'rgba(121,85,72,0.7)',
    'rgba(139,195,74,0.7)',
    'rgba(255,193,7,0.7)',
    'rgba(3,169,244,0.7)',
];
// ----------------------------------------------------------------
// MODAL OPEN / CLOSE
// ----------------------------------------------------------------
/**
 * Open the MAC Curve modal and render content.
 * Abre o modal de curva de custo marginal e renderiza.
 */
function handleOpenMACCurve() {
    const modal = document.getElementById('mac-curve-modal');
    if (!modal) return;
    modal.classList.add('visible');
    _render();
}
/**
 * Close the MAC Curve modal and destroy chart.
 * Fecha o modal e libera a instancia do grafico.
 */
function handleCloseMACCurve() {
    const modal = document.getElementById('mac-curve-modal');
    if (modal) modal.classList.remove('visible');
    _destroyChart();
    _destroyTemporalChart();
}
// ----------------------------------------------------------------
// MEASURE CRUD
// ----------------------------------------------------------------
/**
 * Add a new empty measure to the list.
 * Adiciona uma medida vazia na lista de abatimento.
 */
function handleAddMACMeasure() {
    _state.measures.push({
        id: generateId('mac'),
        name: '',
        cost: 0,
        abatement: 0,
        costMetricId: null,
        abatementMetricId: null,
        enabled: true,
        linkedProjectId: null,
    });
    _render();
}
/**
 * Remove a measure by index.
 * Remove a medida na posicao indicada.
 *
 * @param {number} index - Posicao no array de medidas
 */
function handleRemoveMACMeasure(index: any) {
    if (index < 0 || index >= _state.measures.length) return;
    _state.measures.splice(index, 1);
    _render();
}
/**
 * Update a single field of a measure.
 * Atualiza campo especifico de uma medida (nome, custo, abatimento, metricId).
 *
 * @param {number} index - Posicao no array
 * @param {string} field - Campo a atualizar
 * @param {*} value - Novo valor
 */
function handleUpdateMACMeasure(index: any, field: any, value: any) {
    const m = _state.measures[index];
    if (!m) return;
    if (field === 'cost' || field === 'abatement') {
        m[field] = parseFloat(String(value)) || 0;
    } else {
        m[field] = value;
    }
    _render();
}
/**
 * Toggle enabled/disabled state of a measure.
 * Ativa ou desativa uma medida (checkbox).
 *
 * @param {number} index - Posicao no array
 */
function handleToggleMACMeasure(index: any) {
    const m = _state.measures[index];
    if (!m) return;
    m.enabled = !m.enabled;
    _render();
}
/**
 * Set a global unit (abatement or cost).
 * Define unidade global de abatimento ou custo.
 *
 * @param {string} field - 'abatementUnit' ou 'costUnit'
 * @param {string} value - Valor da unidade
 */
function handleSetMACUnit(field: any, value: any) {
    if (field === 'abatementUnit' || field === 'costUnit') {
        _state[field] = value;
    }
    _render();
}
/**
 * Set Y-axis range (min or max). Null = auto.
 * Define limites do eixo Y do grafico.
 *
 * @param {string} field - 'yMin' ou 'yMax'
 * @param {string} value - Valor numerico ou '' para auto
 */
function handleSetMACYRange(field: any, value: any) {
    if (field === 'yMin' || field === 'yMax') {
        _state[field] = value === '' ? null : parseFloat(String(value)) || null;
    }
    _render();
}
/**
 * Set global project config (startYear, targetYear, targetReduction).
 * Define configuracoes globais do cenario de projetos.
 *
 * @param {string} field - Campo do state
 * @param {string} value - Valor
 */
function handleSetMACGlobal(field: any, value: any) {
    const numFields = ['startYear', 'targetYear', 'targetReduction'];
    if (numFields.includes(field)) {
        _state[field] = value === '' ? null : parseFloat(String(value)) || null;
    }
    _render();
}
// ----------------------------------------------------------------
// REFERENCE LINES CRUD
// Linhas de referencia: horizontais (custo) e verticais (meta)
// ----------------------------------------------------------------
function handleAddMACRefLine() {
    _state.referenceLines.push({ axis: 'y', value: 0, label: '', color: '#e74c3c', comment: '' });
    _render();
}
/** @param {number} index */
function handleRemoveMACRefLine(index: any) {
    _state.referenceLines.splice(index, 1);
    _render();
}
/** @param {number} index @param {string} field @param {any} value */
function handleUpdateMACRefLine(index: any, field: any, value: any) {
    const line = _state.referenceLines[index];
    if (!line) return;
    line[field] = field === 'value' ? parseFloat(String(value)) || 0 : value;
    _render();
}
// ----------------------------------------------------------------
// PROJECT MODE - CAPEX/OPEX/Receita/Taxa/Periodos → VPL/VPLA
// ----------------------------------------------------------------
/** @param {number} index @param {boolean} enabled */
function handleSetMACProjectMode(index: any, enabled: any) {
    const m = _state.measures[index];
    if (!m) return;
    m.projectMode = enabled;
    if (enabled && !m.capex) {
        Object.assign(m, { capex: 0, opex: 0, revenue: 0, periods: 10, discountRate: 0.1, reductionPerPeriod: 0 });
    }
    _render();
}
/** @param {number} index @param {string} field @param {any} value */
function handleUpdateMACProject(index: any, field: any, value: any) {
    const m = _state.measures[index];
    if (!m) return;
    m[field] = parseFloat(String(value)) || 0;
    // Recalcula custo e abatimento a partir dos dados do projeto
    _recalcProject(m);
    _render();
}
// ----------------------------------------------------------------
// VARIABLE MODE - Entrada de dados por periodo (cashflows[])
// Permite valores distintos de CAPEX/OPEX/Receita/Reducao por ano
// ----------------------------------------------------------------
/**
 * Toggle between constant and per-period variable mode.
 * Alterna entre modo constante e modo por periodo.
 *
 * @param {number} index - Indice da medida
 * @param {boolean} enabled - true = variavel, false = constante
 */
function handleToggleMACVariableMode(index: any, enabled: any) {
    const m = _state.measures[index];
    if (!m) return;
    m.variableMode = !!enabled;
    if (enabled && !Array.isArray(m.cashflows)) {
        _initCashflowsFromConstant(m);
    }
    _recalcProject(m);
    _render();
}
/**
 * Update a single cashflow cell value.
 * Atualiza um campo de um periodo especifico.
 *
 * @param {number} index - Indice da medida
 * @param {number} period - Indice do periodo (0..n)
 * @param {string} field - 'capex', 'opex', 'revenue' ou 'reduction'
 * @param {string} value - Valor numerico como string
 */
function handleUpdateMACCashflow(index: any, period: any, field: any, value: any) {
    const m = _state.measures[index];
    if (!m || !Array.isArray(m.cashflows)) return;
    const cf = m.cashflows[period];
    if (!cf) return;
    cf[field] = parseFloat(String(value)) || 0;
    _recalcProject(m);
    _renderAfterCashflowEdit(period, field);
}
/**
 * Bulk-fill a cashflow column from a given period onward.
 * Preenche todos os periodos >= fromPeriod com o mesmo valor.
 *
 * @param {number} index - Indice da medida
 * @param {string} field - 'capex', 'opex', 'revenue' ou 'reduction'
 * @param {number|string} value - Valor a preencher
 * @param {number|string} fromPeriod - Periodo inicial (inclusive)
 */
/**
 * CC-S1 B3 artesanal (CCC-001 Fase 11) — wrapper do botão "aplicar" do fill:
 * lê os 3 inputs por id (mac-fill-{field,value,from}-<i>) e delega (era
 * multi-arg inline com getElementById).
 */
function handleFillMACCashflowFromInputs(index: any) {
    const get = (p: string) => (document.getElementById(`mac-fill-${p}-${index}`) as any)?.value;
    handleFillMACCashflow(index, get('field'), get('value'), get('from'));
}

function handleFillMACCashflow(index: any, field: any, value: any, fromPeriod: any) {
    const m = _state.measures[index];
    if (!m || !Array.isArray(m.cashflows)) return;
    const v = parseFloat(String(value)) || 0;
    const from = parseInt(String(fromPeriod)) || 0;
    for (let t = from; t < m.cashflows.length; t++) {
        m.cashflows[t][field] = v;
    }
    _recalcProject(m);
    _render();
}
/**
 * Resize cashflows array when period count changes.
 * Redimensiona o array - novos periodos ganham zeros, extras sao removidos.
 *
 * @param {number} index - Indice da medida
 * @param {string} value - Novo numero de periodos (string do input)
 */
function handleResizeMACCashflows(index: any, value: any) {
    const m = _state.measures[index];
    if (!m || !Array.isArray(m.cashflows)) return;
    const newN = Math.max(1, parseInt(String(value)) || 1);
    const target = newN + 1; // +1 para incluir periodo 0
    while (m.cashflows.length < target) {
        m.cashflows.push({ capex: 0, opex: 0, revenue: 0, reduction: 0 });
    }
    if (m.cashflows.length > target) {
        m.cashflows.length = target;
    }
    m.periods = newN;
    _recalcProject(m);
    _render();
}
/**
 * Initialize cashflows array from constant-mode scalar values.
 * Cria array de periodos a partir dos valores escalares existentes.
 *
 * @param {MacMeasure} m - Medida com campos escalares
 */
function _initCashflowsFromConstant(m: MacMeasure) {
    const n = m.periods || 10;
    m.cashflows = [];
    for (let t = 0; t <= n; t++) {
        m.cashflows.push({
            capex: t === 0 ? m.capex || 0 : 0,
            opex: t > 0 ? m.opex || 0 : 0,
            revenue: t > 0 ? m.revenue || 0 : 0,
            reduction: t > 0 ? m.reductionPerPeriod || 0 : 0,
        });
    }
}
/**
 * Re-render only the summary metrics after a cashflow cell edit.
 * Evita perda de foco ao nao re-renderizar a tabela inteira.
 *
 * @param {number} _period - Periodo editado (para restaurar foco)
 * @param {string} _field - Campo editado
 */
function _renderAfterCashflowEdit(_period: any, _field: any) {
    // Atualiza totais e metricas sem reconstruir a tabela
    const summaryEl = document.getElementById('mac-cashflow-summary');
    const totalsEl = document.querySelector('.mac-totals');
    const interpEl = document.querySelector('.mac-interpretation');
    if (summaryEl) {
        const m = _state.measures.find((m) => m.variableMode && Array.isArray(m.cashflows));
        if (m) summaryEl.innerHTML = _buildProjectSummaryHtml(m);
    }
    // Atualiza footer totais da tabela
    _updateCashflowFooter();
    // Atualiza totais gerais e interpretacao
    if (totalsEl || interpEl) {
        const resolved = _resolveMeasureValues();
        let totalCost = 0,
            totalAbatement = 0;
        for (const r of resolved) {
            totalCost += r._cost;
            totalAbatement += r._abatement;
        }
        const abU = escapeHtml(_state.abatementUnit || '—');
        const cU = escapeHtml(_state.costUnit || '—');
        if (totalsEl) {
            const avgUnit = totalAbatement !== 0 ? (totalCost / totalAbatement).toFixed(2) : '—';
            totalsEl.innerHTML = `
                <span>${escapeHtml(t('macTotalAbatement') || 'Total abatement')}: ${totalAbatement.toFixed(2)} ${abU}</span>
                <span>${escapeHtml(t('macTotalCost') || 'Total cost')}: ${totalCost.toFixed(2)} ${cU}</span>
                <span>${escapeHtml(t('macAvgUnitCost') || 'Avg unit cost')}: ${avgUnit} ${cU}/${abU}</span>`;
        }
    }
    // Re-renderiza o grafico
    _renderChart();
}
/**
 * Update cashflow table footer totals.
 * Atualiza os totais no rodape da tabela de cashflows.
 */
function _updateCashflowFooter() {
    const footer = document.getElementById('mac-cashflow-footer');
    if (!footer) return;
    const m = _state.measures.find((m) => m.variableMode && Array.isArray(m.cashflows));
    if (!m) return;
    const sums = { capex: 0, opex: 0, revenue: 0, reduction: 0 };
    for (const cf of m.cashflows) {
        sums.capex += cf.capex || 0;
        sums.opex += cf.opex || 0;
        sums.revenue += cf.revenue || 0;
        sums.reduction += cf.reduction || 0;
    }
    /** @param {number} m */
    const fmt = (v: any) => v.toLocaleString('en', { maximumFractionDigits: 2 });
    footer.innerHTML = `<td style="padding:4px 6px;font-weight:700">${t('macCashflowSum') || 'Total'}</td>
        <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.capex)}</td>
        <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.opex)}</td>
        <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.revenue)}</td>
        <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.reduction)}</td>`;
}
/**
 * Recalcula custo anualizado (VPLA) e abatimento a partir dos dados do projeto.
 * Despacha para modo variavel quando cashflows[] esta ativo.
 *
 * Delega para core/financial/projectValuation via macCurveFinancialBridge
 * (ENV-VAL-001 Phase 4). Eliminada duplicacao de logica VPL/VPLA/CRF.
 *
 * @param {MacMeasure} m - Medida do MAC Curve
 */
/** @param {MacMeasure} m */
function _recalcProject(m: MacMeasure) {
    applyProjectValuation(m);
}
/**
 * Build HTML string for project summary metrics.
 * Gera HTML com CRF, VPL, VPLA, Marginal + totais de reducao.
 *
 * @param {MacMeasure} m - Medida com _vpl, _vpla, _crf
 * @returns {string} HTML da barra de metricas
 */
/** @param {MacMeasure} m */
function _buildProjectSummaryHtml(m: MacMeasure) {
    const cU = escapeHtml(_state.costUnit || '?');
    const abU = escapeHtml(_state.abatementUnit || '?');
    const vpl = m._vpl != null ? m._vpl.toFixed(2) : '—';
    const vpla = m._vpla != null ? m._vpla.toFixed(2) : '—';
    const crfVal = m._crf != null ? m._crf.toFixed(6) : '—';
    const marginal = m.abatement && m._vpla != null ? (m._vpla / m.abatement).toFixed(2) : '—';
    let extra = '';
    if (m.variableMode && m._totalReduction != null) {
        extra = `<span>${t('macTotalReduction') || 'Total reduction'}: ${m._totalReduction.toFixed(2)} ${abU}</span>
            <span>${t('macAvgReduction') || 'Avg/period'}: ${m.abatement.toFixed(2)} ${abU}</span>`;
    }
    return `<span>CRF: ${crfVal}</span>
        <span>VPL: ${vpl} ${cU}</span>
        <span><strong>VPLA: ${vpla} ${cU}</strong></span>
        <span><strong>${t('macMarginalCost') || 'Marginal'}: ${marginal} ${cU}/${abU}</strong></span>
        ${extra}`;
}
// ----------------------------------------------------------------
// METRIC RESOLUTION
// Resolve valores manuais ou vinculados a metricas do Calculator
// ----------------------------------------------------------------
/**
 * Resolve measure values, pulling from calculator metrics when linked.
 * Para cada medida habilitada, verifica se ha metrica vinculada e
 * substitui o valor manual pelo valor computado.
 *
 * @returns {MacMeasure[]} Medidas com _cost e _abatement resolvidos
 */
function _resolveMeasureValues() {
    return _state.measures
        .filter((m: any) => m.enabled !== false)
        .map((m: any) => {
            // Backfill: garante que medidas antigas tenham id
            if (!m.id) m.id = generateId('mac');
            let cost = m.cost || 0;
            let abatement = m.abatement || 0;
            // Resolve custo a partir de metrica do Calculator
            if (m.costMetricId) {
                const item = /** @type {MacMeasure|null} */ (getCalculatorItemById(m.costMetricId));
                if (item) {
                    const r: any = computeCalculatorItem(item as any);
                    if (r.value != null) cost = r.value;
                }
            }
            // Resolve abatimento a partir de metrica do Calculator
            if (m.abatementMetricId) {
                const item = /** @type {MacMeasure|null} */ (getCalculatorItemById(m.abatementMetricId));
                if (item) {
                    const r: any = computeCalculatorItem(item as any);
                    if (r.value != null) abatement = r.value;
                }
            }
            return { ...m, _cost: cost, _abatement: abatement };
        });
}
// ----------------------------------------------------------------
// RENDER - Main UI
// ----------------------------------------------------------------
/**
 * Render the full MAC Curve modal body.
 * Renderiza configuracao, tabela de medidas, totais e grafico.
 */
function _render() {
    const body = document.getElementById('mac-curve-body');
    if (!body) return;
    const disclaimer = _renderDisclaimer();
    const viewToggle = _renderViewToggle();
    const configHtml = _renderConfigRow();
    if (_activeView === 'temporal') {
        // Vista Temporal: disclaimer + toggle + config + grafico empilhado + tabelas
        _destroyChart();
        body.innerHTML = `
            ${disclaimer}
            ${viewToggle}
            ${configHtml}
            ${_renderTemporalView()}`;
        _renderTemporalChart();
    } else {
        // Vista MAC (padrao): disclaimer + toggle + config + tabela + grafico
        _destroyTemporalChart();
        const tableHtml = _renderMeasuresTable();
        const totalsHtml = _renderTotals();
        body.innerHTML = `
            ${disclaimer}
            ${viewToggle}
            ${configHtml}
            ${tableHtml}
            ${_renderRefLines()}
            ${totalsHtml}
            <div style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:10px;color:var(--text-secondary,#888)">
                <span>Y:</span>
                <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L624" type="number" value="${_state.yMin != null ? _state.yMin : ''}" placeholder="auto" style="width:55px;font-size:10px" data-cc-change="cc-f8c2a21f" />
                <span>&#8212;</span>
                <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L626" type="number" value="${_state.yMax != null ? _state.yMax : ''}" placeholder="auto" style="width:55px;font-size:10px" data-cc-change="cc-46da9005" />
            </div>
            <div class="mac-chart-wrap" style="position:relative;height:280px;margin-top:4px">
                <canvas id="mac-chart-canvas"></canvas>
                <div id="mac-chart-empty" style="display:none;position:absolute;inset:0;align-items:center;justify-content:center">
                    <span style="font-size:12px;color:var(--primary-text-muted,#888);font-style:italic">${t('macNoData') || 'Adicione medidas para ver a curva MAC'}</span>
                </div>
            </div>`;
        _renderChart();
    }
}
function _renderDisclaimer() {
    return `<div class="stats-disclaimer">
        <span class="stats-disclaimer-icon">!</span>
        <div>
            <p><strong>${t('macCurve') || 'MAC Curve'}</strong> &#8212;
            ${t('macDisclaimer') || 'Marginal Abatement Cost curve ranks measures by cost-effectiveness (cost per unit of reduction). Applicable to any domain: carbon emissions, energy efficiency, environmental remediation, monitoring optimization. Measures are sorted from cheapest to most expensive per unit abated. Cost and abatement values can be entered manually or linked to Calculator metrics for dynamic updates.'}</p>
        </div>
    </div>`;
}
/**
 * Render the configuration row with unit inputs.
 * Linha com inputs de unidade de abatimento e custo.
 *
 * @returns {string} HTML da linha de configuracao
 */
function _renderConfigRow() {
    const abLabel = t('macAbatementUnit') || 'Abatement unit';
    const costLabel = t('macCostUnit') || 'Cost unit';
    const abVal = escapeHtml(_state.abatementUnit);
    const costVal = escapeHtml(_state.costUnit);
    const syVal = _state.startYear != null ? _state.startYear : '';
    const tyVal = _state.targetYear != null ? _state.targetYear : '';
    const trVal = _state.targetReduction != null ? _state.targetReduction : '';
    return `<div class="mac-config-row" style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap;font-size:11px">
        <label style="display:flex;align-items:center;gap:4px">
            ${escapeHtml(abLabel)}
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L667" type="text" value="${abVal}" style="width:60px" data-cc-change="cc-2384850d" />
        </label>
        <label style="display:flex;align-items:center;gap:4px">
            ${escapeHtml(costLabel)}
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L671" type="text" value="${costVal}" style="width:60px" data-cc-change="cc-411ef35f" />
        </label>
        <span style="border-left:1px solid var(--border-color,#ccc);height:20px"></span>
        <label style="display:flex;align-items:center;gap:4px">
            ${t('macStartYear') || 'Start'}
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L676" type="number" value="${syVal}" placeholder="2020" style="width:60px" data-cc-change="cc-0c6af662" />
        </label>
        <label style="display:flex;align-items:center;gap:4px">
            ${t('macTargetYear') || 'Target'}
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L680" type="number" value="${tyVal}" placeholder="2050" style="width:60px" data-cc-change="cc-f9977bc5" />
        </label>
        <label style="display:flex;align-items:center;gap:4px">
            ${t('macTargetReduction') || 'Goal'}
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L684" type="number" value="${trVal}" placeholder="0" style="width:70px" data-cc-change="cc-2c6750ef" />
            <span style="color:var(--text-secondary,#888)">${abVal || '?'}</span>
        </label>
    </div>`;
}
// ----------------------------------------------------------------
// MEASURES TABLE
// ----------------------------------------------------------------
/**
 * Render the measures table header + rows + add button.
 * Tabela com checkbox, nome, custo, abatimento e botao de remover.
 *
 * @returns {string} HTML da tabela de medidas
 */
function _renderMeasuresTable() {
    const hdrName = t('macMeasureName') || 'Measure';
    const hdrCost = t('macCost') || 'Cost';
    const hdrAbat = t('macAbatement') || 'Abatement';
    const addLabel = t('macAddMeasure') || '+ Add Measure';
    const rows = _state.measures.map((m: any, i: any) => _renderMeasureRow(m, i)).join('');
    return `<table class="mac-table" style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
            <tr style="text-align:left;border-bottom:1px solid var(--border-color,#ccc)">
                <th style="width:28px"></th>
                <th style="padding:4px 6px">${escapeHtml(hdrName)}</th>
                <th style="padding:4px 6px">${escapeHtml(hdrCost)}</th>
                <th style="padding:4px 6px">${escapeHtml(hdrAbat)}</th>
                <th style="width:28px"></th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>
    <button type="button" class="btn-text" style="margin-top:6px"
        data-cc-action="cc-be86db94">
        ${getIcon('plus', { size: '14px' })} ${escapeHtml(addLabel)}
    </button>`;
}
/**
 * Render a single measure row.
 * Linha com checkbox, nome, custo (manual ou metrica), abatimento, remover.
 *
 * @param {MacMeasure} m - Medida
 * @param {number} i - Indice
 * @returns {string} HTML da linha
 */
/** @param {MacMeasure} m @param {number} i */
function _renderMeasureRow(m: MacMeasure, i: number) {
    const chk = m.enabled !== false ? 'checked' : '';
    const nameVal = escapeHtml(m.name || '');
    const costCell = _renderValueCell(i, 'cost', m.cost, m.costMetricId);
    const abatCell = _renderValueCell(i, 'abatement', m.abatement, m.abatementMetricId);
    const rowStyle =
        m.enabled === false
            ? 'opacity:0.5;border-bottom:1px solid var(--border-color,#eee)'
            : 'border-bottom:1px solid var(--border-color,#eee)';
    const projActive = m.projectMode ? 'color:var(--accent,#2d8a7a);font-weight:700' : '';
    const projTitle = m.projectMode ? 'Disable project mode' : 'Enable project mode (CAPEX/OPEX)';
    return `<tr style="${rowStyle}">
        <td style="text-align:center;padding:4px">
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L750" type="checkbox" ${chk}
                data-cc-call-change="handleToggleMACMeasure|j:${encodeURIComponent(String(i))}" />
        </td>
        <td style="padding:4px 6px">
            <div style="display:flex;align-items:center;gap:4px">
                <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L755" type="text" value="${nameVal}" style="flex:1"
                    data-cc-call-change="handleUpdateMACMeasure|j:${encodeURIComponent(String(i))}|s:name|v" />
                <button type="button" class="btn-icon" title="${projTitle}" style="${projActive}"
                    data-cc-call-click="handleSetMACProjectMode|j:${encodeURIComponent(String(i))}|j:${encodeURIComponent(String(!m.projectMode))}">
                    ${getIcon('dollar-sign', { size: '12px' })}
                </button>
            </div>
        </td>
        <td style="padding:4px 6px">${m.projectMode ? `<span style="font-size:11px;font-family:monospace">${m.cost.toFixed(2)}</span>` : costCell}</td>
        <td style="padding:4px 6px">${m.projectMode ? `<span style="font-size:11px;font-family:monospace">${m.abatement.toFixed(2)}</span>` : abatCell}</td>
        <td style="text-align:center;padding:4px">
            <button type="button" class="btn-icon" title="Remove"
                data-cc-call-click="handleRemoveMACMeasure|j:${encodeURIComponent(String(i))}">
                ${getIcon('trash', { size: '14px' })}
            </button>
        </td>
    </tr>${_renderProjectExpansion(m, i)}`;
}
/**
 * Render a value cell - manual input OR calculator metric selector.
 * Se metricId esta definido, mostra nome da metrica e valor resolvido;
 * caso contrario, mostra input numerico. Botao de link alterna o modo.
 *
 * @param {number} idx - Indice da medida
 * @param {string} field - 'cost' ou 'abatement'
 * @param {number} manualValue - Valor manual
 * @param {string|null} metricId - ID da metrica vinculada
 * @returns {string} HTML da celula
 */
function _renderValueCell(idx: any, field: any, manualValue: any, metricId: any) {
    const metricIdField = field === 'cost' ? 'costMetricId' : 'abatementMetricId';
    if (metricId) {
        return _renderMetricLinkedCell(idx, field, metricIdField, metricId);
    }
    return _renderManualInputCell(idx, field, manualValue, metricIdField);
}
/**
 * Render a cell showing a linked calculator metric.
 * Mostra nome da metrica vinculada + valor resolvido + botao para desvincular.
 *
 * @param {number} idx - Indice da medida
 * @param {string} field - 'cost' ou 'abatement'
 * @param {string} metricIdField - 'costMetricId' ou 'abatementMetricId'
 * @param {string} metricId - ID da metrica vinculada
 * @returns {string} HTML
 */
/** @param {number} idx @param {string} field @param {string} metricIdField @param {string} metricId */
function _renderMetricLinkedCell(idx: any, field: any, metricIdField: any, metricId: any) {
    const item: any = getCalculatorItemById(metricId);
    const label = item ? escapeHtml(item.label || metricId) : escapeHtml(metricId);
    let resolved = '—';
    if (item) {
        const r: any = computeCalculatorItem(item);
        if (r.value != null) resolved = r.value.toFixed(2);
    }
    // Botao de unlink: limpa metricId e volta para input manual
    return `<div style="display:flex;align-items:center;gap:4px">
        <span style="font-size:12px;color:var(--text-secondary,#666)"
            title="${label}">${label} = ${resolved}</span>
        <button type="button" class="btn-icon" title="Unlink metric"
            data-cc-call-click="handleUpdateMACMeasure|j:${encodeURIComponent(String(idx))}|s:${encodeURIComponent(`${metricIdField}`)}|j:null">
            ${getIcon('x', { size: '12px' })}
        </button>
    </div>`;
}
/**
 * Render a manual number input cell with link button.
 * Input numerico + botao de link para vincular metrica do Calculator.
 *
 * @param {number} idx - Indice da medida
 * @param {string} field - 'cost' ou 'abatement'
 * @param {number} value - Valor numerico manual
 * @param {string} metricIdField - 'costMetricId' ou 'abatementMetricId'
 * @returns {string} HTML
 */
/** @param {number} idx @param {string} field @param {any} value @param {string} metricIdField */
function _renderManualInputCell(idx: number, field: string, value: any, metricIdField: string) {
    const metrics = (getCalculatorItems() as any[]).filter((it: any) => it.enabled);
    const hasMetrics = metrics.length > 0;
    // Dropdown de selecao de metrica (oculto ate clicar no link)
    let selectHtml = '';
    if (hasMetrics) {
        const opts = metrics
            .map((it: any) => {
                const lbl = escapeHtml(it.label || it.id);
                return `<option value="${escapeHtml(it.id)}">${lbl}</option>`;
            })
            .join('');
        selectHtml = `<select data-field-meta="true" data-field-meta-key="auto-pos:macCurve:select:L849" style="display:none;font-size:12px;max-width:100px"
            class="mac-metric-select"
            data-cc-call-change="handleUpdateMACMeasure|j:${encodeURIComponent(String(idx))}|s:${encodeURIComponent(`${metricIdField}`)}|v">
            <option value="">--</option>
            ${opts}
        </select>`;
    }
    // Botao de link: alterna visibilidade do dropdown
    const linkBtn = hasMetrics
        ? `<button type="button" class="btn-icon" title="Link to calculator metric"
            data-cc-action="cc-7a511d79">
            ${getIcon('link', { size: '12px' })}
        </button>`
        : '';
    return `<div style="display:flex;align-items:center;gap:4px">
        <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L866" type="number" value="${value}" style="width:80px"
            data-cc-call-change="handleUpdateMACMeasure|j:${encodeURIComponent(String(idx))}|s:${encodeURIComponent(`${field}`)}|v" />
        ${selectHtml}${linkBtn}
    </div>`;
}
// ----------------------------------------------------------------
// REFERENCE LINES UI
// ----------------------------------------------------------------
function _renderRefLines() {
    const cU = escapeHtml(_state.costUnit || '?');
    const abU = escapeHtml(_state.abatementUnit || '?');
    const rows = _state.referenceLines
        .map((line: any, i: any) => {
            const axisOpts = ['y', 'x']
                .map(
                    (a) =>
                        `<option value="${a}" ${line.axis === a ? 'selected' : ''}>${a === 'y' ? `${cU} (horiz.)` : `${abU} (vert.)`}</option>`,
                )
                .join('');
            return `<div class="mac-refline-row" style="display:flex;gap:4px;align-items:center;margin-bottom:3px;font-size:11px">
            <select data-field-meta="true" data-field-meta-key="auto-pos:macCurve:select:L888" data-cc-call-change="handleUpdateMACRefLine|j:${encodeURIComponent(String(i))}|s:axis|v" style="width:100px">${axisOpts}</select>
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L889" type="number" value="${line.value}" style="width:70px" data-cc-call-change="handleUpdateMACRefLine|j:${encodeURIComponent(String(i))}|s:value|v" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L890" type="text" value="${escapeHtml(line.label)}" placeholder="Label" style="width:90px" data-cc-call-change="handleUpdateMACRefLine|j:${encodeURIComponent(String(i))}|s:label|v" />
            <input type="color" value="${line.color}" style="width:28px;height:22px;padding:0;border:none" data-cc-call-change="handleUpdateMACRefLine|j:${encodeURIComponent(String(i))}|s:color|v" />
            <input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L892" type="text" value="${escapeHtml(line.comment)}" placeholder="${t('macRefComment') || 'Comment'}" style="flex:1" data-cc-call-change="handleUpdateMACRefLine|j:${encodeURIComponent(String(i))}|s:comment|v" />
            <button class="btn-sm" data-cc-call-click="handleRemoveMACRefLine|j:${encodeURIComponent(String(i))}">${getIcon('x', { size: '10px' })}</button>
        </div>`;
        })
        .join('');
    return `<details class="mac-reflines" style="margin:10px 0;font-size:11px">
        <summary style="cursor:pointer;font-weight:600;color:var(--text-secondary,#666)">
            ${getIcon('minus', { size: '12px' })} ${t('macRefLines') || 'Reference Lines'} (${_state.referenceLines.length})
        </summary>
        <div style="margin-top:6px">${rows}</div>
        <button class="btn-sm" style="margin-top:4px" data-cc-action="cc-a728f1b3">
            ${getIcon('plus', { size: '10px' })} ${t('macAddRefLine') || 'Add Line'}
        </button>
    </details>`;
}
// ----------------------------------------------------------------
// PROJECT MODE UI - Formulario expandido abaixo da linha da medida
// ----------------------------------------------------------------
/** @param {MacMeasure} m @param {number} i */
function _renderProjectExpansion(m: MacMeasure, i: number) {
    if (!m.projectMode) return '';
    const cU = escapeHtml(_state.costUnit || '?');
    const abU = escapeHtml(_state.abatementUnit || '?');
    const isVar = !!m.variableMode;
    const constActive = !isVar ? 'active' : '';
    const varActive = isVar ? 'active' : '';
    const lblConst = t('macConstantMode') || 'Constant';
    const lblVar = t('macVariableMode') || 'Per-period';
    const modeToggle = `<div class="mac-mode-toggle">
        <button type="button" class="${constActive}" data-cc-call-click="handleToggleMACVariableMode|j:${encodeURIComponent(String(i))}|j:false">${escapeHtml(lblConst)}</button>
        <button type="button" class="${varActive}" data-cc-call-click="handleToggleMACVariableMode|j:${encodeURIComponent(String(i))}|j:true">${escapeHtml(lblVar)}</button>
    </div>`;
    const bodyHtml = isVar ? _renderVariableModeBody(m, i, cU, abU) : _renderConstantModeBody(m, i, cU, abU);
    const summaryHtml = _buildProjectSummaryHtml(m);
    return `<tr class="mac-project-row"><td colspan="5" style="padding:6px 10px;background:var(--neutral-100,#f5f5f5);border-bottom:2px solid var(--accent,#2d8a7a)">
        ${modeToggle}
        ${bodyHtml}
        <div id="mac-cashflow-summary" style="margin-top:6px;padding:4px 8px;background:var(--neutral-0,#fff);border-radius:4px;font-size:10px;font-family:monospace;display:flex;gap:12px;flex-wrap:wrap">
            ${summaryHtml}
        </div>
    </td></tr>`;
}
/**
 * Render the constant-mode (legacy) project body.
 * Grid 3x2 com CAPEX, OPEX, Receita, Periodos, Taxa, Reducao.
 */
/** @param {MacMeasure} m @param {number} i @param {string} cU @param {string} abU */
function _renderConstantModeBody(m: MacMeasure, i: number, cU: string, abU: string) {
    return `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:11px">
        <label>CAPEX (${cU})<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L948" type="number" value="${m.capex || 0}" style="width:100%" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:capex|v"></label>
        <label>OPEX/${t('macPeriod') || 'period'} (${cU})<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L949" type="number" value="${m.opex || 0}" style="width:100%" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:opex|v"></label>
        <label>${t('macRevenue') || 'Revenue'}/${t('macPeriod') || 'period'} (${cU})<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L950" type="number" value="${m.revenue || 0}" style="width:100%" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:revenue|v"></label>
        <label>${t('macPeriods') || 'Periods'}<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L951" type="number" value="${m.periods || 10}" min="1" style="width:100%" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:periods|v"></label>
        <label>${t('macDiscountRate') || 'Discount rate'}<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L952" type="number" value="${m.discountRate || 0.1}" step="0.01" min="0" max="1" style="width:100%" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:discountRate|v"></label>
        <label>${t('macReduction') || 'Reduction'}/period (${abU})<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L953" type="number" value="${m.reductionPerPeriod || 0}" style="width:100%" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:reductionPerPeriod|v"></label>
    </div>`;
}
/**
 * Render the variable-mode project body.
 * Linha de config (taxa + periodos) + toolbar fill + tabela cashflow.
 */
/** @param {MacMeasure} m @param {number} i @param {string} cU @param {string} abU */
function _renderVariableModeBody(m: MacMeasure, i: number, cU: string, abU: string) {
    const n = m.cashflows ? m.cashflows.length - 1 : m.periods || 10;
    const configRow = `<div style="display:flex;gap:12px;font-size:11px;margin-bottom:6px;align-items:end">
        <label>${t('macPeriods') || 'Periods'}<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L965" type="number" value="${n}" min="1" style="width:60px" data-cc-call-change="handleResizeMACCashflows|j:${encodeURIComponent(String(i))}|v"></label>
        <label>${t('macDiscountRate') || 'Discount rate'}<br><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L966" type="number" value="${m.discountRate || 0.1}" step="0.01" min="0" max="1" style="width:70px" data-cc-call-change="handleUpdateMACProject|j:${encodeURIComponent(String(i))}|s:discountRate|v"></label>
    </div>`;
    const fillToolbar = _renderFillToolbar(i);
    const table = _renderCashflowTable(m, i, cU, abU);
    return configRow + fillToolbar + table;
}
/**
 * Render compact fill toolbar for bulk-filling cashflow columns.
 * Barra com selecao de campo, valor, periodo inicial e botao aplicar.
 */
/** @param {number} i */
function _renderFillToolbar(i: number) {
    const _lblField = t('macFillField') || 'Field';
    const lblValue = t('macFillValue') || 'Value';
    const lblFrom = t('macFillFrom') || 'From period';
    const lblApply = t('macFillApply') || 'Apply';
    return `<div class="mac-fill-toolbar">
        <select data-field-meta="true" data-field-meta-key="auto-tpl:macCurve:select:L986" id="mac-fill-field-${i}" style="font-size:10px">
            <option value="capex">CAPEX</option>
            <option value="opex">OPEX</option>
            <option value="revenue">${t('macRevenue') || 'Revenue'}</option>
            <option value="reduction">${t('macReduction') || 'Reduction'}</option>
        </select>
        <input data-field-meta="true" data-field-meta-key="auto-tpl:macCurve:input:L992" id="mac-fill-value-${i}" type="number" placeholder="${escapeHtml(lblValue)}" style="width:80px;font-size:10px" />
        <input data-field-meta="true" data-field-meta-key="auto-tpl:macCurve:input:L993" id="mac-fill-from-${i}" type="number" placeholder="${escapeHtml(lblFrom)}" value="1" min="0" style="width:50px;font-size:10px" />
        <button type="button" class="btn-sm" data-cc-call-click="handleFillMACCashflowFromInputs|j:${encodeURIComponent(String(i))}">${escapeHtml(lblApply)}</button>
    </div>`;
}
/**
 * Render the per-period cashflow table.
 * Tabela com anos como linhas, 4 colunas de dados editaveis + footer totais.
 */
/** @param {MacMeasure} m @param {number} i @param {string} cU @param {string} abU */
function _renderCashflowTable(m: MacMeasure, i: number, cU: string, abU: string) {
    if (!Array.isArray(m.cashflows) || m.cashflows.length === 0) return '';
    const startYr = _state.startYear;
    const sums = { capex: 0, opex: 0, revenue: 0, reduction: 0 };
    const rows = m.cashflows
        .map((cf: any, ti: any) => {
            const yr = startYr != null ? startYr + ti : `P${ti}`;
            sums.capex += cf.capex || 0;
            sums.opex += cf.opex || 0;
            sums.revenue += cf.revenue || 0;
            sums.reduction += cf.reduction || 0;
            return `<tr>
            <td class="mac-cashflow-year">${yr}</td>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L1022" type="number" value="${cf.capex || 0}" data-period="${ti}" data-field="capex" data-cc-call-change="handleUpdateMACCashflow|j:${encodeURIComponent(String(i))}|j:${encodeURIComponent(String(ti))}|s:capex|v"></td>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L1023" type="number" value="${cf.opex || 0}" data-period="${ti}" data-field="opex" data-cc-call-change="handleUpdateMACCashflow|j:${encodeURIComponent(String(i))}|j:${encodeURIComponent(String(ti))}|s:opex|v"></td>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L1024" type="number" value="${cf.revenue || 0}" data-period="${ti}" data-field="revenue" data-cc-call-change="handleUpdateMACCashflow|j:${encodeURIComponent(String(i))}|j:${encodeURIComponent(String(ti))}|s:revenue|v"></td>
            <td><input data-field-meta="true" data-field-meta-key="auto-pos:macCurve:input:L1025" type="number" value="${cf.reduction || 0}" data-period="${ti}" data-field="reduction" data-cc-call-change="handleUpdateMACCashflow|j:${encodeURIComponent(String(i))}|j:${encodeURIComponent(String(ti))}|s:reduction|v"></td>
        </tr>`;
        })
        .join('');
    /** @param {number} v */
    const fmt = (v: any) => v.toLocaleString('en', { maximumFractionDigits: 2 });
    return `<div class="mac-cashflow-wrap">
        <table class="mac-cashflow-table">
            <thead><tr>
                <th>${t('macYear') || 'Year'}</th>
                <th>CAPEX (${cU})</th>
                <th>OPEX (${cU})</th>
                <th>${t('macRevenue') || 'Revenue'} (${cU})</th>
                <th>${t('macReduction') || 'Reduction'} (${abU})</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr id="mac-cashflow-footer">
                <td style="padding:4px 6px;font-weight:700">${t('macCashflowSum') || 'Total'}</td>
                <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.capex)}</td>
                <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.opex)}</td>
                <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.revenue)}</td>
                <td style="text-align:right;padding:4px 6px;font-weight:700;font-family:monospace">${fmt(sums.reduction)}</td>
            </tr></tfoot>
        </table>
    </div>`;
}
// ----------------------------------------------------------------
// TOTALS
// ----------------------------------------------------------------
/**
 * Render the totals summary row with interpretive analysis.
 * Exibe totais de abatimento, custo, custo unitario medio ponderado,
 * e uma secao interpretativa com a medida mais custo-efetiva e
 * cobertura acumulada das primeiras medidas.
 *
 * @returns {string} HTML dos totais + interpretacao
 */
function _renderTotals() {
    const resolved = _resolveMeasureValues();
    let totalCost = 0;
    let totalAbatement = 0;
    for (const m of resolved) {
        totalCost += m._cost;
        totalAbatement += m._abatement;
    }
    const avgUnit = totalAbatement !== 0 ? (totalCost / totalAbatement).toFixed(2) : '—';
    const lblTotal = t('macTotalAbatement') || 'Total abatement';
    const lblCost = t('macTotalCost') || 'Total cost';
    const lblAvg = t('macAvgUnitCost') || 'Avg unit cost';
    const abU = escapeHtml(_state.abatementUnit || '—');
    const cU = escapeHtml(_state.costUnit || '—');
    const totalsHtml = `<div class="mac-totals" style="display:flex;gap:24px;margin-top:10px;font-size:13px;font-weight:600">
        <span>${escapeHtml(lblTotal)}: ${totalAbatement.toFixed(2)} ${abU}</span>
        <span>${escapeHtml(lblCost)}: ${totalCost.toFixed(2)} ${cU}</span>
        <span>${escapeHtml(lblAvg)}: ${avgUnit} ${cU}/${abU}</span>
    </div>`;
    const interpretationHtml = _renderInterpretation(resolved, totalCost, totalAbatement, cU, abU);
    return totalsHtml + interpretationHtml;
}
/**
 * Render the interpretive summary of the MAC curve data.
 * Identifica a medida mais custo-efetiva e calcula quantas medidas
 * cobrem 80% do abatimento total, reportando custo proporcional.
 *
 * @param {MacMeasure[]} resolved - Medidas resolvidas com _cost e _abatement
 * @param {number} totalCost - Custo total agregado
 * @param {number} totalAbatement - Abatimento total agregado
 * @param {string} cU - Unidade de custo (escaped)
 * @param {string} abU - Unidade de abatimento (escaped)
 * @returns {string} HTML da secao de interpretacao
 */
function _renderInterpretation(resolved: MacMeasure[], totalCost: number, totalAbatement: number, cU: string, abU: string) {
    // Filtra medidas com abatimento positivo (custos negativos = receita, sao validos)
    const valid = resolved.filter((m: any) => m._abatement > 0);
    if (valid.length === 0) {
        const emptyMsg =
            t('macInterpretationEmpty') || 'Adicione medidas com valores de custo e abatimento para ver a analise';
        return `<div class="mac-interpretation" style="margin-top:8px;padding:8px 10px;font-size:12px;color:var(--text-secondary,#666);border-left:3px solid var(--border-color,#ccc)">
            ${escapeHtml(emptyMsg)}
        </div>`;
    }
    // Ordena por custo unitario crescente (mais custo-efetiva primeiro)
    const sorted = /** @type {MacMeasure[]} */ (
        valid
            .map((m: any) => ({
                ...m,
                unitCost: m._cost / m._abatement,
            }))
            .sort((a: any, b: any) => a.unitCost - b.unitCost)
    );
    const lines = [];
    // Medida mais custo-efetiva
    const cheapest = sorted[0];
    const cheapestName = escapeHtml(cheapest.name || '?');
    const cheapestUnitCost = cheapest.unitCost.toFixed(2);
    const lblCheapest = t('macCheapestMeasure') || 'A medida mais custo-efetiva e';
    lines.push(
        `&#9654; ${escapeHtml(lblCheapest)} <strong>${cheapestName}</strong> (${cU} ${cheapestUnitCost}/${abU})`,
    );
    // Top N medidas que cobrem 80% do abatimento total
    if (totalAbatement > 0) {
        const threshold = totalAbatement * 0.8;
        let cumAbatement = 0;
        let cumCost = 0;
        let count = 0;
        for (const m of sorted) {
            cumAbatement += m._abatement;
            cumCost += m._cost;
            count++;
            if (cumAbatement >= threshold) break;
        }
        const abatPct = ((cumAbatement / totalAbatement) * 100).toFixed(0);
        const costPct = totalCost > 0 ? ((cumCost / totalCost) * 100).toFixed(0) : '0';
        const coverageMsg = t('macCoverageMsg', { n: count, abatPct, costPct });
        lines.push(`&#9654; ${escapeHtml(coverageMsg)}`);
    }
    return `<div class="mac-interpretation" style="margin-top:8px;padding:8px 10px;font-size:12px;color:var(--text-secondary,#666);border-left:3px solid var(--border-color,#ccc);line-height:1.6">
        ${lines.join('<br>')}
    </div>`;
}
// ----------------------------------------------------------------
// CHART - Staircase MAC curve (X = cumulative abatement, Y = unit cost)
// Grafico staircase: cada degrau = uma medida, largura = abatimento,
// altura = custo unitario. Ordenado do mais barato ao mais caro.
// ----------------------------------------------------------------
/**
 * Destroy the current Chart.js instance.
 * Libera a instancia do grafico para evitar vazamento de memoria.
 */
function _destroyChart() {
    if (_chartInstance) {
        _chartInstance.destroy();
        _chartInstance = null;
    }
}
/**
 * Render the MAC Curve staircase chart.
 * X = massa removida acumulada, Y = custo marginal unitario.
 * Cada medida e um degrau com largura proporcional ao abatimento.
 */
function _renderChart() {
    const canvas = document.getElementById('mac-chart-canvas');
    const ChartCtor = getChartCtor();
    if (!canvas || !ChartCtor) return;
    _destroyChart();
    const resolved = _resolveMeasureValues();
    const stairData = _prepareStaircaseData(resolved);
    const emptyDiv = document.getElementById('mac-chart-empty');
    if (stairData.length === 0) {
        canvas.style.display = 'none';
        if (emptyDiv) emptyDiv.style.display = 'flex';
        return;
    }
    canvas.style.display = '';
    if (emptyDiv) emptyDiv.style.display = 'none';
    _createStaircaseChart(canvas as HTMLCanvasElement, stairData);
}
/**
 * Prepare staircase data: sort by unitCost, compute cumulative X positions.
 * Ordena por custo unitario crescente e calcula posicoes X acumuladas.
 *
 * @param {MacMeasure[]} resolved - Medidas com _cost e _abatement
 * @returns {MacMeasure[]} Dados com cumStart, cumEnd, unitCost, color
 */
function _prepareStaircaseData(resolved: MacMeasure[]) {
    const zeroAbat = /** @type {MacMeasure[]} */ ([]);
    const valid = /** @type {MacMeasure[]} */ ([]);
    for (const m of resolved) {
        if (m._abatement === 0) {
            zeroAbat.push(m);
            continue;
        }
        const abatAbs = Math.abs(m._abatement);
        const unitCost = m._cost / abatAbs;
        valid.push({ ...m, unitCost, abatAbs });
    }
    // Nota: nao usar showToast aqui pois _prepareStaircaseData e chamado a cada render
    // O aviso de zero abatement e mostrado no _renderTotals via _renderInterpretation
    // Ordena por custo unitario crescente (negativos primeiro = receita)
    valid.sort((a: any, b: any) => a.unitCost - b.unitCost);
    // Calcula posicoes X acumuladas
    let cumX = 0;
    const stairData = /** @type {MacMeasure[]} */ ([]);
    const len = valid.length;
    for (let i = 0; i < len; i++) {
        const m = valid[i]!;
        const cumStart = cumX;
        const cumEnd = cumX + m.abatAbs;
        const color = _staircaseColor(i, len, m.unitCost);
        stairData.push({
            ...m,
            cumStart,
            cumEnd,
            color,
            index: i + 1,
        });
        cumX = cumEnd;
    }
    return stairData;
}
/**
 * Determine color for a staircase step.
 * Verde para custo negativo (receita), gradiente verde->vermelho para positivo.
 *
 * @param {number} idx - Posicao na lista ordenada
 * @param {number} total - Total de medidas
 * @param {number} unitCost - Custo unitario
 * @returns {string} Cor rgba
 */
function _staircaseColor(idx: number, total: number, unitCost: number) {
    if (unitCost < 0) return 'rgba(39,174,96,0.75)'; // Verde: gera receita
    if (total <= 1) return 'rgba(241,196,15,0.75)'; // Amarelo unico
    // Filtra apenas positivos para gradiente
    const positiveIdx = idx;
    const ratio = total > 1 ? positiveIdx / (total - 1) : 0;
    return _interpolateColor(ratio);
}
/**
 * Interpolate from green to yellow to red based on ratio [0..1].
 * @param {number} ratio
 * @returns {string} Cor rgba
 */
function _interpolateColor(ratio: number) {
    let r, g, b;
    if (ratio < 0.5) {
        const t2 = ratio * 2;
        r = Math.round(39 + (241 - 39) * t2);
        g = Math.round(174 + (196 - 174) * t2);
        b = Math.round(96 + (15 - 96) * t2);
    } else {
        const t2 = (ratio - 0.5) * 2;
        r = Math.round(241 + (231 - 241) * t2);
        g = Math.round(196 + (76 - 196) * t2);
        b = Math.round(15 + (60 - 15) * t2);
    }
    return `rgba(${r},${g},${b},0.75)`;
}
/**
 * Render placeholder when no chart data is available.
 * @param {HTMLCanvasElement} canvas
 */
function _renderEmptyChart(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#999';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    const msg = t('macNoData') || 'Add measures with non-zero abatement to see the chart';
    ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
}
/**
 * Create the staircase MAC chart using Chart.js scatter + custom plugin.
 * Usa scatter chart (pontos invisiveis) como base para eixos,
 * e um plugin customizado que desenha os retangulos do staircase.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {MacMeasure[]} stairData - Dados preparados com cumStart/cumEnd/unitCost/color
 */
function _createStaircaseChart(canvas: HTMLCanvasElement, stairData: MacMeasure[]) {
    const ChartCtor = getChartCtor();
    if (!ChartCtor) return;
    const abU = _state.abatementUnit || '?';
    const cU = _state.costUnit || '?';
    const maxX = stairData[stairData.length - 1]!.cumEnd;
    const unitCosts = stairData.map((d: any) => d.unitCost);
    const minY = Math.min(0, ...unitCosts);
    const maxY = Math.max(0, ...unitCosts);
    const yPadding = Math.max(Math.abs(maxY - minY) * 0.15, 10);
    // Pontos invisiveis para definir os limites dos eixos
    const dummyPoints = [
        { x: 0, y: minY - yPadding },
        { x: maxX * 1.05, y: maxY + yPadding },
    ];
    // Plugin customizado para desenhar os degraus do staircase
    const staircasePlugin = {
        id: 'macStaircase',
        /** @param {ChartLike} chart */
        afterDatasetsDraw(chart: any) {
            _drawStaircaseRects(chart, stairData, cU, abU);
        },
    };
    _chartInstance = new ChartCtor(canvas, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    data: dummyPoints,
                    pointRadius: 0,
                    showLine: false,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: `${t('macXAxisLabel') || 'Reducao acumulada'} (${abU})`,
                    },
                    min: 0,
                    grid: { color: 'rgba(128,128,128,0.15)' },
                },
                y: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: `${t('macYAxisLabel') || 'Custo Marginal'} (${cU}/${abU})`,
                    },
                    grid: { color: 'rgba(128,128,128,0.15)' },
                    ...(_state.yMin != null ? { min: _state.yMin } : {}),
                    ...(_state.yMax != null ? { max: _state.yMax } : {}),
                },
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: false, // Tooltips manuais via hover nos retangulos
                },
            },
        },
        plugins: [staircasePlugin],
    });
}
/**
 * Draw the staircase rectangles on the chart canvas.
 * Cada retangulo: x de cumStart a cumEnd, y de 0 a unitCost.
 * Inclui labels com numero + nome da medida.
 *
 * @param {ChartLike} chart - Chart.js instance
 * @param {MacMeasure[]} stairData - Dados do staircase
 * @param {string} _cU - Unidade de custo
 * @param {string} _abU - Unidade de abatimento
 */
function _drawStaircaseRects(chart: any, stairData: MacMeasure[], _cU: string, _abU: string) {
    const ctx = chart.ctx;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    const y0px = yScale.getPixelForValue(0);
    for (const d of stairData) {
        const x1 = xScale.getPixelForValue(d.cumStart);
        const x2 = xScale.getPixelForValue(d.cumEnd);
        const yTop = yScale.getPixelForValue(d.unitCost);
        const width = x2 - x1;
        const height = y0px - yTop; // Pode ser negativo se unitCost < 0
        // Retangulo preenchido
        ctx.fillStyle = d.color;
        ctx.fillRect(x1, Math.min(y0px, yTop), width, Math.abs(height));
        // Borda do retangulo
        ctx.strokeStyle = d.color.replace('0.75', '1');
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x1, Math.min(y0px, yTop), width, Math.abs(height));
        // Label: "N - Nome" no topo do degrau
        _drawStepLabel(ctx, d, x1, x2, yTop, y0px);
    }
    // Linha horizontal no y=0 (eixo X de referencia)
    ctx.strokeStyle = 'rgba(128,128,128,0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(xScale.left, y0px);
    ctx.lineTo(xScale.right, y0px);
    ctx.stroke();
    ctx.setLineDash([]);
    // Linhas de referencia do usuario
    _drawReferenceLines(ctx, xScale, yScale);
}
/**
 * Draw user-defined reference lines on the chart.
 * Linhas de referencia horizontais (eixo Y) ou verticais (eixo X).
 */
/** @param {CanvasRenderingContext2D} ctx @param {any} xScale @param {any} yScale */
function _drawReferenceLines(ctx: any, xScale: any, yScale: any) {
    for (const line of _state.referenceLines) {
        const px = line.axis === 'y' ? yScale.getPixelForValue(line.value) : xScale.getPixelForValue(line.value);
        ctx.save();
        ctx.strokeStyle = line.color || '#e74c3c';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 3]);
        ctx.beginPath();
        if (line.axis === 'y') {
            ctx.moveTo(xScale.left, px);
            ctx.lineTo(xScale.right, px);
        } else {
            ctx.moveTo(px, yScale.top);
            ctx.lineTo(px, yScale.bottom);
        }
        ctx.stroke();
        // Label da linha
        if (line.label) {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            ctx.setLineDash([]);
            ctx.font = '10px sans-serif';
            ctx.fillStyle = isDark ? 'rgba(220,220,220,0.9)' : line.color || '#e74c3c';
            if (line.axis === 'y') {
                ctx.textAlign = 'left';
                ctx.fillText(line.label, xScale.left + 4, px - 4);
            } else {
                ctx.textAlign = 'center';
                ctx.fillText(line.label, px, yScale.top - 4);
            }
        }
        ctx.restore();
    }
}
/**
 * Draw the label for a single staircase step.
 * Posiciona o label acima do degrau (ou abaixo se custo negativo).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {MacMeasure} d - Dados do degrau
 * @param {number} x1 - Pixel X inicio
 * @param {number} x2 - Pixel X fim
 * @param {number} yTop - Pixel Y do topo do degrau
 * @param {number} _y0px - Pixel Y do zero
 */
function _drawStepLabel(ctx: any, d: MacMeasure, x1: number, x2: number, yTop: number, _y0px: number) {
    const midX = (x1 + x2) / 2;
    const name = d.name || '?';
    const label = `${d.index} - ${name}`;
    const barWidth = x2 - x1;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.font = barWidth > 60 ? '11px sans-serif' : '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? 'rgba(220,220,220,0.9)' : 'rgba(0,0,0,0.7)';
    // Posicao: acima do degrau (ou abaixo se custo negativo)
    if (d.unitCost >= 0) {
        ctx.fillText(label, midX, yTop - 6);
    } else {
        ctx.fillText(label, midX, yTop + 14);
    }
}
// ----------------------------------------------------------------
// TEMPORAL EVALUATION - Avaliacao Temporal (area empilhada + tabelas)
// ----------------------------------------------------------------
/**
 * Switch between MAC Curve and Temporal Evaluation views.
 * Alterna entre as visualizacoes Curva MAC e Avaliacao Temporal.
 *
 * @param {'mac'|'temporal'} view - Vista a exibir
 */
function handleSetMACView(view: any) {
    if (view === 'mac' || view === 'temporal') {
        _activeView = view;
    }
    _render();
}
/**
 * Destroy the temporal chart instance.
 * Libera a instancia do grafico temporal para evitar vazamento de memoria.
 */
function _destroyTemporalChart() {
    if (_temporalChartInstance) {
        _temporalChartInstance.destroy();
        _temporalChartInstance = null;
    }
}
/**
 * Render view toggle buttons (MAC Curve / Temporal Evaluation).
 * Abas para alternar entre as duas vistas do modal.
 *
 * @returns {string} HTML dos botoes de aba
 */
function _renderViewToggle() {
    const macCls = _activeView === 'mac' ? 'active' : '';
    const tmpCls = _activeView === 'temporal' ? 'active' : '';
    return `<div class="mac-view-toggle">
        <button type="button" class="${macCls}"
            data-cc-action="cc-d396d6fb">${escapeHtml(t('macViewMAC') || 'MAC Curve')}</button>
        <button type="button" class="${tmpCls}"
            data-cc-action="cc-2825b072">${escapeHtml(t('macViewTemporal') || 'Temporal Evaluation')}</button>
    </div>`;
}
/**
 * Prepare temporal data: per-year CUMULATIVE reduction for each project measure.
 * Extrai series temporais cumulativas, ordenadas por custo-efetividade (MAC rank).
 *
 * @returns {{ years: number[], series: MacSeries[], seriesByIndex: MacSeries[], excluded: number }}
 */
function _prepareTemporalData() {
    const resolved = _resolveMeasureValues();
    const startYear = _state.startYear || new Date().getFullYear();
    const projectMeasures = /** @type {MacMeasure[]} */ ([]);
    let excluded = 0;
    for (let i = 0; i < resolved.length; i++) {
        const m = resolved[i];
        if (!m.projectMode) {
            excluded++;
            continue;
        }
        projectMeasures.push({ ...m, _origIndex: i + 1 });
    }
    // Rank por custo unitario (MAC): mais custo-efetivo primeiro
    const ranked = /** @type {MacMeasure[]} */ (
        projectMeasures
            .filter((m: any) => m._abatement > 0)
            .map((m: any) => ({ ...m, unitCost: m._cost / m._abatement }))
            .sort((a: any, b: any) => a.unitCost - b.unitCost)
    );
    if (ranked.length === 0) {
        return { years: [], series: [], seriesByIndex: [], excluded };
    }
    // Max periodos entre todas as medidas
    let maxPeriods = 0;
    for (const m of ranked) {
        if (m.variableMode && Array.isArray(m.cashflows)) {
            maxPeriods = Math.max(maxPeriods, m.cashflows.length);
        } else {
            maxPeriods = Math.max(maxPeriods, (m.periods || 1) + 1);
        }
    }
    // Array de anos (inclui P0 = ano do investimento)
    const years = /** @type {number[]} */ ([]);
    for (let y = 0; y < maxPeriods; y++) {
        years.push(startYear + y);
    }
    // Extrai series com cumulativo
    const series = ranked.map((m: any, idx: any) => {
        const perPeriod = /** @type {number[]} */ ([]);
        for (let y = 0; y < maxPeriods; y++) {
            let red;
            if (m.variableMode && Array.isArray(m.cashflows)) {
                const cf = m.cashflows[y];
                red = cf ? cf.reduction || 0 : 0;
            } else {
                const periods = m.periods || 1;
                red = y >= 1 && y <= periods ? m.reductionPerPeriod || 0 : 0;
            }
            perPeriod.push(red);
        }
        // Cumulativo
        const cumulative = /** @type {number[]} */ ([]);
        let cumSum = 0;
        for (let y = 0; y < maxPeriods; y++) {
            cumSum += perPeriod[y];
            cumulative.push(cumSum);
        }
        // Nom Total = soma dos cumulativos (area sob a curva)
        const nomTotal = cumulative.reduce((a: any, b: any) => a + b, 0);
        return {
            name: m.name || `Measure ${idx + 1}`,
            rank: idx + 1,
            origIndex: m._origIndex,
            cumulative,
            nomTotal,
            color: TEMPORAL_PALETTE[idx % TEMPORAL_PALETTE.length],
        };
    });
    // Copia ordenada por indice original (para tabela 1)
    const seriesByIndex = [...series].sort((a: any, b: any) => a.origIndex - b.origIndex);
    return { years, series, seriesByIndex, excluded };
}
/**
 * Render the full Temporal Evaluation view.
 * Grafico de area empilhada + tabela por medida + tabela por rank.
 *
 * @returns {string} HTML da vista temporal
 */
function _renderTemporalView() {
    const data = _prepareTemporalData();
    if (data.series.length === 0) {
        const msg =
            t('macTemporalNoData') ||
            'No measures with temporal data (project mode). Enable project mode on at least one measure.';
        return `<div style="padding:20px;text-align:center;color:var(--primary-text-muted,#888);font-style:italic;font-size:12px">${escapeHtml(msg)}</div>`;
    }
    let html = '';
    // Nota de exclusao
    if (data.excluded > 0) {
        const note = t('macTemporalExcluded', { n: data.excluded });
        html += `<div style="font-size:10px;color:var(--primary-text-muted,#888);margin-bottom:8px;font-style:italic">${escapeHtml(note)}</div>`;
    }
    // Grafico
    html += `<div class="mac-chart-wrap" style="position:relative;height:320px;margin-bottom:14px">
        <canvas id="mac-temporal-canvas"></canvas>
    </div>`;
    // Tabela 1: por medida (ordem de criacao)
    html += _renderTemporalPerMeasureTable(data);
    // Tabela 2: por rank
    html += _renderTemporalRankTable(data);
    return html;
}
/**
 * Render the stacked area chart for temporal evaluation.
 * Grafico de linha com fill empilhado: cada medida = uma area colorida.
 * Valores negativos (reducao abaixo do zero). Meta = linha tracejada vermelha.
 */
function _renderTemporalChart() {
    const canvas = document.getElementById('mac-temporal-canvas');
    const ChartCtor = getChartCtor();
    if (!canvas || !ChartCtor) return;
    _destroyTemporalChart();
    const data = _prepareTemporalData();
    if (data.series.length === 0) return;
    const abU = _state.abatementUnit || '?';
    // Datasets: rank N (pior) primeiro -> rank 1 (melhor) ultimo
    // Chart.js empilha de baixo para cima na ordem dos datasets
    const reversed = [...data.series].reverse();
    const datasets = reversed.map((s: any, i: any) => ({
        label: `${s.rank} - ${s.name}`,
        data: s.cumulative.map((v: number) => -v),
        backgroundColor: s.color,
        borderColor: s.color.replace('0.7', '1'),
        borderWidth: 1,
        fill: i === 0 ? 'origin' : '-1',
        pointRadius: 0,
        pointHoverRadius: 3,
        tension: 0,
    }));
    const plugins = [];
    // Plugin: linha tracejada vermelha da meta
    if (_state.targetReduction && _state.targetReduction > 0) {
        plugins.push({
            id: 'macTemporalTarget',
            /** @param {ChartLike} chart */
            afterDatasetsDraw(chart: any) {
                const yScale = chart.scales.y;
                const xScale = chart.scales.x;
                const targetY = yScale.getPixelForValue(-Number(_state.targetReduction || 0));
                const ctx = chart.ctx;
                const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                ctx.save();
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 2;
                ctx.setLineDash([8, 4]);
                ctx.beginPath();
                ctx.moveTo(xScale.left, targetY);
                ctx.lineTo(xScale.right, targetY);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.font = '10px sans-serif';
                ctx.fillStyle = isDark ? '#ef9a9a' : '#c62828';
                ctx.textAlign = 'left';
                const lbl = `${t('macTargetReduction') || 'Goal'}: ${_state.targetReduction} ${abU}`;
                ctx.fillText(lbl, xScale.left + 4, targetY - 6);
                ctx.restore();
            },
        });
    }
    const config = {
        type: 'line',
        data: {
            labels: data.years.map(String),
            datasets,
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: {
                    title: { display: true, text: t('macYear') || 'Year', font: { size: 11 } },
                    ticks: { font: { size: 9 }, maxRotation: 45 },
                },
                y: {
                    stacked: true,
                    title: {
                        display: true,
                        text: `${t('macTotalReduction') || 'Reduction'} (${abU})`,
                        font: { size: 11 },
                    },
                    ticks: { font: { size: 10 } },
                    grid: { color: 'rgba(128,128,128,0.15)' },
                },
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { boxWidth: 12, font: { size: 10 }, padding: 8 },
                },
                tooltip: {
                    callbacks: {
                        label: (ctx: any) => {
                            const val = Math.abs(ctx.raw).toLocaleString();
                            return `${ctx.dataset.label}: ${val} ${abU}`;
                        },
                    },
                },
            },
        },
        plugins,
    };
    _temporalChartInstance = new ChartCtor(/** @type {HTMLCanvasElement} */ (canvas), config);
}
/**
 * Render per-measure yearly cumulative reduction table.
 * Tabela com reducao acumulada por ano, ordenada por indice do projeto.
 * Linha "Material total" no topo = meta repetida.
 *
 * @param {{ years: number[], seriesByIndex: MacSeries[] }} data
 * @returns {string} HTML da tabela
 */
function _renderTemporalPerMeasureTable(data: { years: number[]; seriesByIndex: MacSeries[] }) {
    const abU = escapeHtml(_state.abatementUnit || '?');
    /** @param {number} v */
    const fmt = (v: any) => (v === 0 ? '&#8212;' : Math.round(-v).toLocaleString());
    const target = _state.targetReduction || 0;
    let html = `<div class="mac-temporal-table-wrap"><table class="mac-temporal-table"><thead><tr>
        <th style="text-align:left;min-width:120px">${escapeHtml(t('macTemporalProject') || 'Project')}</th>
        <th style="text-align:right">${escapeHtml(t('macTemporalNomTotal') || 'Nom. Total')}</th>
        <th style="text-align:right">#Rank</th>
        ${data.years.map((y: any) => `<th>${y}</th>`).join('')}
    </tr></thead><tbody>`;
    // Linha Material total (meta repetida)
    if (target > 0) {
        const tVal = Math.round(-target).toLocaleString();
        html += `<tr class="mac-temporal-total-row">
            <td><strong>${escapeHtml(t('macTemporalMaterialTotal') || 'Material total')}</strong></td>
            <td></td><td>&#8212;</td>
            ${data.years.map(() => `<td><strong>${tVal}</strong></td>`).join('')}
        </tr>`;
    }
    // Linhas por medida (ordem de criacao)
    for (const s of data.seriesByIndex) {
        html += `<tr>
            <td style="text-align:left">${escapeHtml(s.name)}</td>
            <td>${Math.round(-s.nomTotal).toLocaleString()}</td>
            <td>${s.rank}</td>
            ${s.cumulative.map((v: number) => `<td>${fmt(v)}</td>`).join('')}
        </tr>`;
    }
    html += `</tbody></table></div>`;
    const title = t('macTemporalTableTitle') || 'Accumulated Reduction per Measure';
    return `<details open class="mac-temporal-details">
        <summary>${escapeHtml(title)} (${abU})</summary>
        ${html}
    </details>`;
}
/**
 * Render rank-ordered cumulative reduction table.
 * Mesmos dados cumulativos individuais, ordenados por rank MAC.
 *
 * @param {{ years: number[], series: MacSeries[] }} data
 * @returns {string} HTML da tabela
 */
function _renderTemporalRankTable(data: { years: number[]; series: MacSeries[] }) {
    const _abU = escapeHtml(_state.abatementUnit || '?');
    /** @param {number} v */
    const fmt = (v: any) => (v === 0 ? '&#8212;' : Math.round(-v).toLocaleString());
    let html = `<div class="mac-temporal-table-wrap"><table class="mac-temporal-table"><thead><tr>
        <th style="text-align:right">#Rank</th>
        <th style="text-align:left;min-width:120px">${escapeHtml(t('macTemporalProject') || 'Project')}</th>
        <th style="text-align:left;min-width:140px">${escapeHtml(t('macTemporalCompactName') || 'Name')}</th>
        ${data.years.map((y: any) => `<th>${y}</th>`).join('')}
    </tr></thead><tbody>`;
    for (const s of data.series) {
        html += `<tr>
            <td style="text-align:right">${s.rank}</td>
            <td style="text-align:left">${escapeHtml(s.name)}</td>
            <td style="text-align:left;font-size:10px">${s.rank} - ${escapeHtml(s.name)}</td>
            ${s.cumulative.map((v: number) => `<td>${fmt(v)}</td>`).join('')}
        </tr>`;
    }
    html += `</tbody></table></div>`;
    const title = t('macTemporalRankTitle') || 'Ranking by Cost-Effectiveness';
    return `<details open class="mac-temporal-details" style="margin-top:12px">
        <summary>${escapeHtml(title)}</summary>
        ${html}
    </details>`;
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// SERIALIZATION (ECO1 persistence - DA-3)
// ----------------------------------------------------------------
/**
 * Export MAC state for model serialization.
 * Exporta estado completo da curva MAC para ECO1.
 *
 * @returns {MacState}
 */
export function exportMACState() {
    return {
        measures: _state.measures.map((m: any) => ({ ...m })),
        abatementUnit: _state.abatementUnit,
        costUnit: _state.costUnit,
        referenceLines: _state.referenceLines.map((r: any) => ({ ...r })),
        startYear: _state.startYear,
        targetYear: _state.targetYear,
        targetReduction: _state.targetReduction,
        yMin: _state.yMin,
        yMax: _state.yMax,
    };
}
/**
 * Import MAC state from model data.
 * Importa estado da curva MAC de dados do modelo.
 *
 * @param {MacState} data
 */
export function importMACState(data: MacState) {
    if (!data) return;
    _state.measures = Array.isArray(data.measures)
        ? data.measures.map((m: any) => ({
              ...m,
              id: m.id || generateId('mac'),
              linkedProjectId: m.linkedProjectId || null,
          }))
        : [];
    _state.abatementUnit = data.abatementUnit || '';
    _state.costUnit = data.costUnit || 'USD';
    _state.referenceLines = Array.isArray(data.referenceLines) ? data.referenceLines : [];
    _state.startYear = data.startYear || null;
    _state.targetYear = data.targetYear || null;
    _state.targetReduction = data.targetReduction || null;
    _state.yMin = data.yMin || null;
    _state.yMax = data.yMax || null;
}
/**
 * Get MAC measures for external linking.
 * Retorna medidas MAC para referencia de outros modulos.
 *
 * @returns {MacMeasure[]}
 */
export function getMACMeasures() {
    return _state.measures;
}
// ----------------------------------------------------------------
// EXPORTS - Window handlers
// ----------------------------------------------------------------
export const macCurveHandlers = {
    handleOpenMACCurve,
    handleCloseMACCurve,
    handleAddMACMeasure,
    handleRemoveMACMeasure,
    handleUpdateMACMeasure,
    handleToggleMACMeasure,
    handleSetMACUnit,
    handleSetMACYRange,
    handleSetMACGlobal,
    handleAddMACRefLine,
    handleRemoveMACRefLine,
    handleUpdateMACRefLine,
    handleSetMACProjectMode,
    handleUpdateMACProject,
    handleToggleMACVariableMode,
    handleUpdateMACCashflow,
    handleFillMACCashflow,
    handleFillMACCashflowFromInputs,
    handleResizeMACCashflows,
    handleSetMACView,
};
//# sourceMappingURL=macCurve.js.map
