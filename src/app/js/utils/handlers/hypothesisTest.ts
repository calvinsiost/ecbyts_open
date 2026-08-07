// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   HYPOTHESIS TEST HANDLERS — Modal UI for paired statistical tests
   Handlers para o modulo de teste de hipotese pareado

   Permite comparar duas campanhas de monitoramento usando metodos
   estatisticos nao-parametricos (Wilcoxon, Sign) e parametricos
   (t pareado). Essencial para avaliar se houve mudanca significativa
   entre campanhas (ex: antes/depois de remediacao).

   Padrao: exporta hypothesisTestHandlers (sem refresh global — read-only)
   ================================================================ */
import { applyFilters, buildPairedData } from '../../core/calculator/filterPipeline.js';
import { wilcoxonSignedRanks, pairedTTest, signTest } from '../../core/analytics/statistics.js';
import { getAllCampaigns } from '../../core/campaigns/manager.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getAllFamilies } from '../../core/elements/families.js';
import { CONFIG } from '../../config.js';
import { escapeHtml } from '../helpers/html.js';
import { getIcon as getUiIcon } from '../ui/icons.js';
import { t } from '../i18n/translations.js';
import { showToast } from '../ui/toast.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { createTemplateMetrics } from '../../core/calculator/manager.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('HypothesisTest');
type HypothesisFilter = { dimension: string; operator: string; value: string };
type HypothesisResult = Record<string, any> & { reject?: boolean; pValue?: number | null; pairs?: any[] };
type HypothesisState = {
    testMethod: string;
    alpha: number;
    campaignA: string | null;
    campaignB: string | null;
    filters: HypothesisFilter[];
    unitId: string | null;
    lastResult: HypothesisResult | null;
};
/**
 * @typedef {{ dimension: string, operator: string, value: string }} HypothesisFilter
 * @typedef {{ testMethod: string, alpha: number, campaignA: string|null, campaignB: string|null, filters: HypothesisFilter[], unitId: string|null, lastResult: (Record<string, any>|null) }} HypothesisState
 * @typedef {Record<string, any> & { reject?: boolean, pValue?: number|null, pairs?: any[] }} HypothesisResult
 */
const _hypothesisTypedefsForCheckJs = null;
void _hypothesisTypedefsForCheckJs;
/**
 * Compatibility wrapper for legacy numeric icon sizes.
 * @param {string} name
 * @param {number|string|{size?: string, class?: string}} [opts]
 * @returns {string}
 */
function getIcon(name: string, opts: number | string | { size?: string; class?: string } = {}) {
    if (typeof opts === 'number')
        return getUiIcon(name, { size: `${opts}px` });
    if (typeof opts === 'string')
        return getUiIcon(name, { size: opts });
    return getUiIcon(name, opts);
}
// ----------------------------------------------------------------
// MODULE STATE - closure-scoped
// Estado do modulo: configuracao do teste e ultimo resultado
// ----------------------------------------------------------------
/** @type {HypothesisState} */
const _state: HypothesisState = {
    testMethod: 'wilcoxon',
    alpha: 0.05,
    campaignA: null,
    campaignB: null,
    filters: [],
    unitId: null,
    lastResult: null,
};
// ----------------------------------------------------------------
// MODAL OPEN / CLOSE
// Abrir e fechar o modal de teste de hipotese
// ----------------------------------------------------------------
/**
 * Open the hypothesis test modal and render its contents.
 * Abre o modal e renderiza a interface de configuracao.
 */
function handleOpenHypothesisTest() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('hypothesisTest')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    const modal = document.getElementById('hypothesis-test-modal');
    if (!modal)
        return;
    modal.classList.add('visible');
    _render();
}
/**
 * Close the hypothesis test modal.
 * Fecha o modal sem limpar o estado.
 */
function handleCloseHypothesisTest() {
    const modal = document.getElementById('hypothesis-test-modal');
    if (modal)
        modal.classList.remove('visible');
}
// ----------------------------------------------------------------
// CONFIGURATION SETTERS
// Setters para parametros do teste
// ----------------------------------------------------------------
/**
 * Set the test method.
 * Define o metodo estatistico: wilcoxon, paired_t, ou sign.
 *
 * @param {string} method - 'wilcoxon' | 'paired_t' | 'sign'
 */
function handleSetHypothesisMethod(method: any) {
    if (['wilcoxon', 'paired_t', 'sign'].includes(method)) {
        _state.testMethod = method;
        _state.lastResult = null;
        _render();
    }
}
/**
 * Set the significance level (alpha).
 * Define o nivel de significancia para rejeicao de H0.
 *
 * @param {number|string} alpha - 0.01, 0.05, or 0.10
 */
function handleSetHypothesisAlpha(alpha: any) {
    const parsed = parseFloat(String(alpha));
    if ([0.01, 0.05, 0.1].includes(parsed)) {
        _state.alpha = parsed;
        _state.lastResult = null;
        _render();
    }
}
/**
 * Set campaign A or B.
 * Define a campanha de referencia (A) ou de comparacao (B).
 *
 * @param {string} which - 'A' or 'B'
 * @param {string} id - Campaign ID
 */
function handleSetHypothesisCampaign(which: any, id: any) {
    if (which === 'A')
        _state.campaignA = id || null;
    else if (which === 'B')
        _state.campaignB = id || null;
    _state.lastResult = null;
    _render();
}
/**
 * Set the target unit for value conversion.
 * Define a unidade-alvo para conversao de valores.
 *
 * @param {string} unitId - Unit identifier (e.g., 'ug_L')
 */
function handleSetHypothesisUnit(unitId: any) {
    _state.unitId = unitId || null;
    _state.lastResult = null;
    _render();
}
// ----------------------------------------------------------------
// FILTER CRUD
// Adicionar, remover, atualizar filtros de dimensao
// ----------------------------------------------------------------
/**
 * Add a new empty filter to the list.
 * Adiciona um filtro em branco para o usuario configurar.
 */
function handleAddHypothesisFilter() {
    _state.filters.push({ dimension: 'parameter', operator: 'is', value: '' });
    _render();
}
/**
 * Remove a filter by index.
 * Remove o filtro na posicao indicada.
 *
 * @param {number} index - Filter index
 */
function handleRemoveHypothesisFilter(index: any) {
    if (index >= 0 && index < _state.filters.length) {
        _state.filters.splice(index, 1);
        _state.lastResult = null;
        _render();
    }
}
/**
 * Update a specific field of a filter.
 * Atualiza dimensao, operador, ou valor de um filtro.
 *
 * @param {number} index - Filter index
 * @param {string} field - 'dimension', 'operator', or 'value'
 * @param {string} value - New value
 */
function handleUpdateHypothesisFilter(index: any, field: keyof HypothesisFilter, value: any) {
    if (index < 0 || index >= _state.filters.length)
        return;
    if (field !== 'dimension' && field !== 'operator' && field !== 'value')
        return;
    const filter = _state.filters[index] as any;
    if (!filter)
        return;
    filter[field] = value;
    // Limpa valor ao trocar dimensao (opcoes mudam)
    if (field === 'dimension') {
        filter.value = '';
    }
    _state.lastResult = null;
    _render();
}
// ----------------------------------------------------------------
// RUN TEST
// Executa o teste estatistico selecionado
// ----------------------------------------------------------------
/**
 * Execute the configured hypothesis test.
 * Aplica filtros, constroi pares, executa teste, renderiza resultado.
 */
function handleRunHypothesisTest() {
    // Validacao basica
    if (!_state.campaignA || !_state.campaignB) {
        showToast(t('hypothesisNeedCampaigns') || 'Select both Campaign A and Campaign B', 'warning');
        return;
    }
    if (_state.campaignA === _state.campaignB) {
        showToast(t('hypothesisSameCampaign') || 'Campaign A and B must be different', 'warning');
        return;
    }
    try {
        const { elements, observations } = applyFilters(_state);
        const pairs = buildPairedData(elements, observations, _state.campaignA, _state.campaignB, _state.unitId || undefined);
        if (pairs.length < 2) {
            showToast(t('hypothesisInsufficientPairs') || 'Insufficient paired data (need at least 2 pairs)', 'warning');
            return;
        }
        let result: any;
        switch (_state.testMethod) {
            case 'paired_t':
                result = pairedTTest(pairs, _state.alpha);
                break;
            case 'sign':
                result = signTest(pairs, _state.alpha);
                break;
            default:
                result = wilcoxonSignedRanks(pairs, _state.alpha);
                break;
        }
        _state.lastResult = { ...result, pairs };
        _render();
    }
    catch (err: any) {
        const error = /** @type {any} */ (err);
        log.error('Hypothesis test execution failed', error.message);
        showToast(t('hypothesisError') || 'Test execution failed', 'error');
    }
}
// ----------------------------------------------------------------
// MAIN RENDER
// Renderiza todo o conteudo do modal
// ----------------------------------------------------------------
/**
 * Render the modal body with config, filters, and results.
 * Renderiza configuracao, filtros, botao de execucao e resultados.
 */
function _render() {
    const body = document.getElementById('hypothesis-test-body');
    if (!body)
        return;
    body.innerHTML = [
        _renderDisclaimer(),
        _renderConfig(),
        _renderFilters(),
        _renderRunButton(),
        _state.lastResult ? _renderResults() : '',
    ].join('');
}
// ----------------------------------------------------------------
// DISCLAIMER
// Explicacao do que faz o teste de hipotese
// ----------------------------------------------------------------
function _renderDisclaimer() {
    return `<div class="stats-disclaimer">
        <span class="stats-disclaimer-icon">!</span>
        <div>
            <p><strong>${t('hypothesisTest') || 'Hypothesis Test'}</strong> &#8212;
            ${t('hypothesisDisclaimer') || 'Compares paired observations between two sampling campaigns to determine if there was a statistically significant change. Commonly used to evaluate remediation effectiveness (before vs after). Choose Wilcoxon for non-parametric data (recommended for environmental monitoring), Paired t-test for normally distributed differences, or Sign test for the simplest directional analysis.'}</p>
            <p style="margin-top:6px"><button class="btn-sm" data-cc-action="cc-6b1f5994">${getIcon('copy', (10))} ${t('viewTemplates') || 'View example metrics in Calculator'}</button></p>
        </div>
    </div>`;
}
// ----------------------------------------------------------------
// CONFIG SECTION
// Dropdowns para metodo, alpha, campanhas e unidade
// ----------------------------------------------------------------
/**
 * Render the test configuration section.
 * Renderiza selecao de metodo, alpha, campanhas A/B, e unidade.
 *
 * @returns {string} HTML string
 */
function _renderConfig() {
    const methods = [
        { id: 'wilcoxon', label: 'Wilcoxon Signed-Ranks' },
        { id: 'paired_t', label: 'Paired t-Test' },
        { id: 'sign', label: 'Sign Test' },
    ];
    const alphas = [0.01, 0.05, 0.1];
    const campaigns = getAllCampaigns();
    const methodOpts = methods
        .map((m: any) => `<option value="${m.id}" ${_state.testMethod === m.id ? 'selected' : ''}>${m.label}</option>`)
        .join('');
    const alphaOpts = alphas
        .map((a: any) => `<option value="${a}" ${_state.alpha === a ? 'selected' : ''}>${a} (${Math.round((1 - a) * 100)}%)</option>`)
        .join('');
    const campAOpts = campaigns
        .map((c: any) => `<option value="${c.id}" ${_state.campaignA === c.id ? 'selected' : ''}>${escapeHtml(c.name || c.id)}</option>`)
        .join('');
    const campBOpts = campaigns
        .map((c: any) => `<option value="${c.id}" ${_state.campaignB === c.id ? 'selected' : ''}>${escapeHtml(c.name || c.id)}</option>`)
        .join('');
    return `<div class="hypothesis-config">
        <div class="hypothesis-config-row">
            <label>${t('hypothesisMethod') || 'Method'}</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L327" data-cc-change="cc-b2772eff">${methodOpts}</select>
        </div>
        <div class="hypothesis-config-row">
            <label>${t('hypothesisAlpha') || 'Significance (&#945;)'}</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L331" data-cc-change="cc-7663729e">${alphaOpts}</select>
        </div>
        <div class="hypothesis-config-row">
            <label>${t('hypothesisCampaignA') || 'Campaign A (baseline)'}</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L335" data-cc-change="cc-bd7810e9">
                <option value="">-- ${t('hypothesisSelectCampaign') || 'Select'} --</option>
                ${campAOpts}
            </select>
        </div>
        <div class="hypothesis-config-row">
            <label>${t('hypothesisCampaignB') || 'Campaign B (comparison)'}</label>
            <select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L342" data-cc-change="cc-baf031f2">
                <option value="">-- ${t('hypothesisSelectCampaign') || 'Select'} --</option>
                ${campBOpts}
            </select>
        </div>
        <div class="hypothesis-config-row">
            <label>${t('hypothesisUnit') || 'Unit'}</label>
            <input data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:input:L349" type="text" value="${escapeHtml(_state.unitId || '')}" placeholder="ug_L"
                data-cc-change="cc-eba5381c">
        </div>
    </div>`;
}
// ----------------------------------------------------------------
// FILTER SECTION
// Filtros de dimensao reutilizando padrao do calculator
// ----------------------------------------------------------------
/**
 * Render the filter rows.
 * Renderiza filtros de dimensao (parameter, family, element, etc.).
 *
 * @returns {string} HTML string
 */
function _renderFilters() {
    const dims = [
        { id: 'parameter', label: 'Parameter' },
        { id: 'family', label: 'Family' },
        { id: 'element', label: 'Element' },
        { id: 'area', label: 'Area' },
        { id: 'campaign', label: 'Campaign' },
        { id: 'category', label: 'Category' },
    ];
    const operators = [
        { id: 'is', label: 'is' },
        { id: 'is_not', label: 'is not' },
        { id: 'in', label: 'in' },
        { id: 'not_in', label: 'not in' },
    ];
    const filtersHtml = _state.filters
        .map((f: any, fi: any) => {
        const dimOpts = dims
            .map((d: any) => `<option value="${d.id}" ${f.dimension === d.id ? 'selected' : ''}>${d.label}</option>`)
            .join('');
        const opOpts = operators
            .map((o: any) => `<option value="${o.id}" ${f.operator === o.id ? 'selected' : ''}>${o.label}</option>`)
            .join('');
        const valueHtml = _renderFilterValue(fi, f);
        return `<div class="hypothesis-filter-row">
            <select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L393" data-cc-call-change="handleUpdateHypothesisFilter|j:${encodeURIComponent(String(fi))}|s:dimension|v">${dimOpts}</select>
            <select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L394" data-cc-call-change="handleUpdateHypothesisFilter|j:${encodeURIComponent(String(fi))}|s:operator|v">${opOpts}</select>
            ${valueHtml}
            <button data-cc-call-click="handleRemoveHypothesisFilter|j:${encodeURIComponent(String(fi))}" class="btn-sm" title="Remove filter">${getIcon('x', (12))}</button>
        </div>`;
    })
        .join('');
    return `<div class="hypothesis-filters">
        <div class="hypothesis-filters-label">
            ${t('hypothesisFilters') || 'Filters'}
            <button data-cc-action="cc-57d6b3fe" class="btn-sm">${getIcon('plus', (12))} ${t('hypothesisAddFilter') || 'Add'}</button>
        </div>
        ${filtersHtml}
    </div>`;
}
/**
 * Render the value dropdown for a specific filter.
 * Gera o dropdown de valores baseado na dimensao selecionada.
 *
 * @param {number} fi - Filter index
 * @param {HypothesisFilter} filter - Filter object { dimension, operator, value }
 * @returns {string} HTML string
 */
function _renderFilterValue(fi: number, filter: HypothesisFilter) {
    const options = _getDimensionOptions(filter.dimension);
    const opts = options
        .map((o: any) => `<option value="${o.id}" ${filter.value === o.id ? 'selected' : ''}>${escapeHtml(o.label)}</option>`)
        .join('');
    return `<select data-field-meta="true" data-field-meta-key="auto-pos:hypothesisTest:select:L426" data-cc-call-change="handleUpdateHypothesisFilter|j:${encodeURIComponent(String(fi))}|s:value|v">
        <option value="">--</option>${opts}</select>`;
}
/**
 * Get dropdown options for a given filter dimension.
 * Retorna opcoes de dropdown conforme a dimensao (parameter, family, etc.).
 *
 * @param {string} dimension - Filter dimension
 * @returns {Array<{id: string, label: string}>}
 */
function _getDimensionOptions(dimension: string) {
    switch (dimension) {
        case 'parameter':
            return (CONFIG.PARAMETERS || []).map((p: any) => ({ id: p.id, label: p.name }));
        case 'family':
            return Object.values(getAllFamilies() || {}).map((f: any) => ({
                id: f.id,
                label: f.nameKey || f.name || f.id,
            }));
        case 'element':
            return getAllElements().map((el: any) => ({ id: el.id, label: el.name || el.id }));
        case 'area':
            return getAllElements()
                .filter((e: any) => e.family === 'boundary' || e.family === 'area')
                .map((el: any) => ({ id: el.id, label: el.name || el.id }));
        case 'campaign':
            return getAllCampaigns().map((c: any) => ({ id: c.id, label: c.name || c.id }));
        case 'category': {
            const cats = new Set();
            (CONFIG.PARAMETERS || []).forEach((p: any) => {
                if (p.category)
                    cats.add(p.category);
            });
            return [...cats].sort().map((c: any) => ({ id: c, label: c }));
        }
        default:
            return [];
    }
}
// ----------------------------------------------------------------
// RUN BUTTON
// Botao de execucao do teste
// ----------------------------------------------------------------
/**
 * Render the run test button.
 * Renderiza o botao centralizado para executar o teste.
 *
 * @returns {string} HTML string
 */
function _renderRunButton() {
    const disabled = !_state.campaignA || !_state.campaignB ? 'disabled' : '';
    return `<div class="hypothesis-run">
        <button class="btn-primary" data-cc-action="cc-05eab542" ${disabled}>
            ${getIcon('activity', (14))} ${t('hypothesisRunTest') || 'Run Test'}
        </button>
    </div>`;
}
// ----------------------------------------------------------------
// RESULTS SECTION
// Renderiza veredicto acessivel, interpretacao, detalhes e pares
// ----------------------------------------------------------------
/**
 * Render the full results section with accessible language.
 * Renderiza banner claro, interpretacao para leigos, detalhes tecnicos
 * em collapsible, e tabela de pares com cores de direcao.
 *
 * @returns {string} HTML string
 */
function _renderResults() {
    const r = _state.lastResult;
    if (!r)
        return '';
    return `<div class="hypothesis-results">
        ${_renderVerdict(r)}
        ${_renderInterpretation(r)}
        ${_renderStats(r)}
        ${_renderPairTable(r)}
    </div>`;
}
/**
 * Render the verdict banner with plain-language explanation.
 * Renderiza banner com linguagem acessivel (sem jargao "H0").
 * Inclui icone, titulo claro, explicacao curta e p-value discreto.
 *
 * @param {*} r - Test result object
 * @returns {string} HTML string
 */
function _renderVerdict(r: HypothesisResult) {
    const reject = r.reject;
    const cls = reject ? 'hypothesis-verdict-reject' : 'hypothesis-verdict-accept';
    const icon = reject ? '&#10007;' : '&#10003;';
    const title = reject
        ? t('hypothesisVerdictRejectTitle') || 'Houve mudanca significativa'
        : t('hypothesisVerdictAcceptTitle') || 'Sem mudanca significativa detectada';
    const subtitle = reject
        ? t('hypothesisVerdictRejectSubtitle') ||
            'As concentracoes mudaram de forma que nao pode ser explicada por variacao aleatoria.'
        : t('hypothesisVerdictAcceptSubtitle') ||
            'As concentracoes sao compativeis com variacao natural entre campanhas.';
    const pVal = r.pValue != null ? Number(r.pValue).toFixed(4) : '—';
    return `<div class="hypothesis-verdict ${cls}">
        <span class="hypothesis-verdict-icon">${icon}</span>
        <div class="hypothesis-verdict-text">
            <strong>${title}</strong>
            <br>${subtitle}
        </div>
        <span class="hypothesis-verdict-pval">p = ${pVal}</span>
    </div>`;
}
/**
 * Render the plain-language interpretation section.
 * Renderiza secao explicativa para nao-estatisticos, com bullets
 * contextuais para rejeicao ou aceitacao.
 *
 * @param {*} r - Test result object
 * @returns {string} HTML string
 */
function _renderInterpretation(r: HypothesisResult) {
    const reject = r.reject;
    const pVal = r.pValue != null ? Number(r.pValue).toFixed(4) : '—';
    const confidence = Math.round((1 - _state.alpha) * 100);
    const header = t('hypothesisInterpretationHeader') || '&#9654; O que isso significa?';
    let bullets;
    if (reject) {
        bullets = [
            t('hypothesisInterpretReject1') || 'A remediacao (ou outro fator) teve efeito mensuravel nas concentracoes',
            t('hypothesisInterpretReject2', { p: pVal }),
            t('hypothesisInterpretReject3', { c: confidence }),
        ];
    }
    else {
        bullets = [
            t('hypothesisInterpretAccept1') ||
                'Nao ha evidencia de que houve alteracao significativa nas concentracoes',
            t('hypothesisInterpretAccept2') || 'A variacao observada e compativel com flutuacao natural',
            t('hypothesisInterpretAccept3') ||
                'Pode ser necessario mais tempo, mais amostras, ou sensibilidade do metodo',
        ];
    }
    const bulletsHtml = bullets.map((b: any) => `<li>${b}</li>`).join('');
    return `<div class="hypothesis-interpretation">
        <strong>${header}</strong>
        <ul>${bulletsHtml}</ul>
    </div>`;
}
/**
 * Format a numeric stat value, defaulting to em-dash for null/undefined.
 */
function _fmtStatValue(v: any): string {
    return v != null ? Number(v).toFixed(4) : '—';
}

/**
 * Render Wilcoxon-specific stat rows.
 */
function _renderWilcoxonStatsRows(r: HypothesisResult): string[] {
    const rows: string[] = [];
    rows.push(_statRow('T', _fmtStatValue(r.T)));
    rows.push(_statRow('W+', _fmtStatValue(r.W_plus)));
    rows.push(_statRow('W-', _fmtStatValue(r.W_minus)));
    rows.push(_statRow('n_eff', r.n_eff != null ? String(r.n_eff) : '—'));
    if (r.critical != null) rows.push(_statRow('Critical', String(r.critical)));
    if (r.zStat != null) rows.push(_statRow('z', _fmtStatValue(r.zStat)));
    return rows;
}

/**
 * Render paired-t-specific stat rows.
 */
function _renderPairedTStatsRows(r: HypothesisResult): string[] {
    return [
        _statRow('t-stat', _fmtStatValue(r.tStat)),
        _statRow('df', r.df != null ? String(r.df) : '—'),
        _statRow('Mean diff', _fmtStatValue(r.meanDiff)),
        _statRow('Std diff', _fmtStatValue(r.stdDiff)),
        _statRow('n', r.n != null ? String(r.n) : '—'),
    ];
}

/**
 * Render sign-test-specific stat rows.
 */
function _renderSignStatsRows(r: HypothesisResult): string[] {
    return [
        _statRow('n+', r.nPlus != null ? String(r.nPlus) : '—'),
        _statRow('n-', r.nMinus != null ? String(r.nMinus) : '—'),
        _statRow('n_zero', r.nZero != null ? String(r.nZero) : '—'),
        _statRow('n_eff', r.nEff != null ? String(r.nEff) : '—'),
        _statRow('Stat', _fmtStatValue(r.stat)),
    ];
}

/**
 * Render method-specific stat rows dispatched by current test method.
 */
function _renderMethodStatsRows(r: HypothesisResult): string[] {
    switch (_state.testMethod) {
        case 'wilcoxon':
            return _renderWilcoxonStatsRows(r);
        case 'paired_t':
            return _renderPairedTStatsRows(r);
        case 'sign':
            return _renderSignStatsRows(r);
        default:
            return [];
    }
}

/**
 * Render the technical statistics in a collapsible details element.
 * Renderiza estatisticas detalhadas dentro de <details> para
 * nao poluir a visualizacao principal.
 *
 * @param {*} r - Test result object
 * @returns {string} HTML string
 */
function _renderStats(r: HypothesisResult) {
    const rows: string[] = _renderMethodStatsRows(r);
    rows.push(_statRow('p-value', _fmtStatValue(r.pValue)));
    rows.push(_statRow('&#945;', String(_state.alpha)));
    if (r.critical != null && _state.testMethod !== 'wilcoxon') {
        rows.push(_statRow(t('hypothesisCriticalValue') || 'Critical value', String(r.critical)));
    }
    const summaryText = t('hypothesisTechnicalDetails') || 'Detalhes tecnicos';
    return `<div class="hypothesis-stats">
        <details>
            <summary>${summaryText}</summary>
            <table class="hypothesis-stats-table">
                <tbody>${rows.join('')}</tbody>
            </table>
        </details>
    </div>`;
}
/**
 * Build a single stats table row.
 * Gera uma linha de tabela para a secao de estatisticas.
 *
 * @param {string} label - Stat name
 * @param {string} value - Stat value (already escaped or numeric)
 * @returns {string} HTML tr string
 */
function _statRow(label: string, value: string) {
    return `<tr><td class="hypothesis-stat-label">${label}</td><td class="hypothesis-stat-value">${value}</td></tr>`;
}
// ----------------------------------------------------------------
// PAIR TABLE
// Tabela de pares elemento-a-elemento com explicacao
// ----------------------------------------------------------------
/**
 * Render the element-by-element pair comparison table.
 * Renderiza tabela com valor por campanha e diferenca por elemento,
 * com cabecalho explicativo e cores de direcao (vermelho/verde).
 *
 * @param {*} r - Test result object with pairs[]
 * @returns {string} HTML string
 */
function _renderPairTable(r: HypothesisResult) {
    if (!r.pairs || r.pairs.length === 0)
        return '';
    const headerA = _getCampaignLabel(_state.campaignA || '');
    const headerB = _getCampaignLabel(_state.campaignB || '');
    const tableLabel = t('hypothesisPairTableLabel') || 'Comparacao ponto a ponto';
    const tableSubtitle = t('hypothesisPairTableSubtitle') ||
        'Cada linha mostra um ponto de monitoramento com valores das duas campanhas';
    const rows = r.pairs
        .map(
        /** @param {any} campaignId */
        (p: any) => {
        const diff = p.y - p.x;
        const rowClass = diff > 0 ? 'pair-increase' : diff < 0 ? 'pair-decrease' : '';
        const diffSign = diff > 0 ? '+' : '';
        return `<tr class="${rowClass}">
            <td>${escapeHtml(p.elementName || p.elementId)}</td>
            <td class="hypothesis-value">${_fmtValue(p.x)}</td>
            <td class="hypothesis-value">${_fmtValue(p.y)}</td>
            <td class="hypothesis-value" style="font-weight:600">${diffSign}${_fmtValue(diff)}</td>
        </tr>`;
    })
        .join('');
    return `<div class="hypothesis-pairs">
        <div class="hypothesis-pairs-label">${tableLabel} (${r.pairs.length})
            <div style="font-weight:normal;font-size:0.85em;margin-top:2px">${tableSubtitle}</div>
        </div>
        <div class="hypothesis-pairs-scroll">
            <table class="hypothesis-pairs-table">
                <thead>
                    <tr>
                        <th>${t('hypothesisElement') || 'Element'}</th>
                        <th>${escapeHtml(headerA)}</th>
                        <th>${escapeHtml(headerB)}</th>
                        <th>${t('hypothesisDiff') || 'Diff'}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}
/**
 * Get the display label for a campaign ID.
 * Busca o nome legivel da campanha pelo ID.
 *
 * @param {string} campaignId - Campaign ID
 * @returns {string} Campaign name or ID fallback
 */
function _getCampaignLabel(campaignId: any) {
    if (!campaignId)
        return '—';
    const camp = getAllCampaigns().find((c: any) => c.id === campaignId);
    return camp ? camp.name || camp.id : campaignId;
}
/**
 * Format a numeric value for table display.
 * Formata valor numerico com ate 4 casas decimais.
 *
 * @param {number} v - Numeric value
 * @returns {string} Formatted string
 */
function _fmtValue(v: any) {
    if (v == null || isNaN(v))
        return '—';
    // Usa ate 4 casas, remove trailing zeros
    return Number(v.toFixed(4)).toString();
}
// ----------------------------------------------------------------
// EXPORTS - window.* handlers
// ----------------------------------------------------------------
function handleCreateHypothesisTemplates() {
    createTemplateMetrics('hypothesis');
    showToast(t('templatesCreated') || 'Template metrics created in Calculator', 'success');
}
export const hypothesisTestHandlers = {
    handleOpenHypothesisTest,
    handleCloseHypothesisTest,
    handleRunHypothesisTest,
    handleSetHypothesisMethod,
    handleSetHypothesisAlpha,
    handleSetHypothesisCampaign,
    handleSetHypothesisUnit,
    handleAddHypothesisFilter,
    handleRemoveHypothesisFilter,
    handleUpdateHypothesisFilter,
    handleCreateHypothesisTemplates,
};
