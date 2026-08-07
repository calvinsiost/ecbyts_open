// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: Scenario Simulation Handlers
/* ================================================================
   SCENARIO SIMULATION HANDLERS
   Handlers para simulação de cenários ambientais (Monte Carlo)
   ================================================================ */
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { escapeHtml } from '../helpers/html.js';
import { hydrateIcons } from '../ui/icons.js';
import { getAllDecisions, upsertCustomDecision } from '../../core/analytics/scenarioSimulation/decisionDefs.js';
import {
    getAllScenarioProfiles,
    upsertCustomScenario,
    deleteCustomScenario,
    getAllOverlays,
    upsertCustomOverlay,
    deleteCustomOverlay,
    resolveScenarioParams,
} from '../../core/analytics/scenarioSimulation/scenarioDefs.js';
import { HeroCard, Tabs, Dot } from '../ui/components.js';
import { getSimModelPickerGroups, runSimModel } from '../../core/analytics/scenarioSimulation/modelRegistry.js';
import { registerBuiltinSimModels } from '../../core/analytics/scenarioSimulation/models/index.js';
// Modelos genéricos plugáveis (item ECBYTS-ENERGY-SCENARIOS-001#9)
registerBuiltinSimModels();
/** Prefixo de option value para modelos genéricos (não-legados) no picker */
const GENERIC_MODEL_PREFIX = 'model:';
import { createLogger } from '../helpers/logger.js';
import { safeJsonParse } from '../helpers/safeJsonParse.js';
import { calculateStabilityMetrics as _calculateStabilityMetricsPure } from './_scenarioSimulationPure.js';
const log = createLogger('ScenarioSimulation');
const document = (globalThis.document) as Document & any;
const window = (globalThis.window) as Window & any;
// ----------------------------------------------------------------
// SCORE WEIGHTS - persistência e leitura
// ----------------------------------------------------------------
const SIM_WEIGHTS_KEY = 'ecbyts:simWeights';
/** @type {Record<string, number>} */
const DEFAULT_WEIGHTS = { compliance: 30, noFailure: 20, costEfficiency: 20, health: 15, speed: 15 };
function _loadSimWeights() {
    const parsed = safeJsonParse<Record<string, any>>(localStorage.getItem(SIM_WEIGHTS_KEY), {}, 'sim-weights');
    return { ...DEFAULT_WEIGHTS, ...parsed };
}
function _saveSimWeights(w: any) {
    try {
        localStorage.setItem(SIM_WEIGHTS_KEY, JSON.stringify(w));
    } catch (e: any) {
        console.debug('[scenarioSim] saveWeights:', /** @type {any} */ (e)?.message || e);
    }
}
/**
 * Lê os pesos do score dos inputs do modal e persiste.
 * Se a soma for 0, retorna os defaults para evitar score sempre 0.
 */
function _readWeightsFromModal() {
    /** @type {Record<string, number>} */
    const w: any = {};
    for (const k of Object.keys(DEFAULT_WEIGHTS)) {
        const v = parseFloat(document.getElementById(`sim-weight-${k}`)?.value);
        if (!isNaN(v)) w[k] = v;
    }
    const sum = Object.values(w).reduce((s: any, v: any) => s + v, 0);
    if (sum === 0) return { ...DEFAULT_WEIGHTS };
    _saveSimWeights(w);
    return w;
}
// ----------------------------------------------------------------
// GHG LABEL ADAPTATION
// ----------------------------------------------------------------
/**
 * Detecta se um cenário é GHG (projeção de emissões) para adaptar labels da UI.
 * @param {string} scenarioId
 * @returns {boolean}
 */
function _isGhgScenario(scenarioId: any) {
    if (!scenarioId) return false;
    const all = (getAllScenarioProfiles()) as Array<any>;
    const sc = all.find((s: any) => s.id === scenarioId);
    if (sc?.tags?.includes('ghg')) return true;
    if (sc?.params?.emissionFactorUncertainty > 0) return true;
    return false;
}
/**
 * Retorna mapa de labels adaptados ao modo (contaminação vs GHG).
 * @param {boolean} isGhg
 * @returns {any}
 */
function _getLabels(isGhg: any) {
    return {
        concentration: isGhg ? 'Emissões' : 'Concentração',
        concentrationUnit: isGhg ? 'tCO2e/yr' : 'µg/L',
        health: isGhg ? 'Score ESG' : 'Saúde Ambiental',
        healthShort: isGhg ? 'Score ESG' : 'Saúde Amb.',
        compliance: isGhg ? 'Meta atingida' : 'Conformidade',
        nonCompliance: isGhg ? 'Meta não atingida' : 'Não-conformidade',
        failureRisk: isGhg ? 'Risco Regulatório' : 'Risco de Falha',
        complianceReached: isGhg ? 'Meta de emissão atingida' : 'Conformidade atingida',
        complianceNotReached: isGhg ? 'Meta de emissão não atingida' : 'Conformidade não atingida',
    };
}
// Estado do cenário atual para adaptação de labels
const _currentScenarioId = null;
// Estado da última simulação - usado para export/import CSV
/** @type {any} */
let _lastSimResult: any = null;
let _lastSimScenarioName = '';
let _lastSimMode = 'single'; // 'single' | 'comparison'
// ----------------------------------------------------------------
// MODAL CONTROL
// ----------------------------------------------------------------
/**
 * Abre o modal de simulação de cenários.
 */
function handleOpenScenarioSimulationModal() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('scenarioSimulation')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    let modal = document.getElementById('scenario-simulation-modal');
    if (!modal) {
        modal = _createModal();
        document.body.appendChild(modal);
    }
    _populateDefaults();
    modal.style.display = 'flex';
    hydrateIcons(modal);
    const scenarioId = modal.querySelector('#sim-scenario')?.value;
    if (scenarioId) {
        _populateScenarioParams(scenarioId).catch((err: any) => {
            log.warn('Failed to refresh scenario defaults', /** @type {any} */ (err)?.message);
        });
    }
    _syncParamSourceVisibility(modal);
    _refreshCalculatorMappingOptions().catch((err: any) => {
        log.warn('Failed to refresh calculator options on open', /** @type {any} */ (err)?.message);
    });
}
/**
 * Fecha o modal.
 */
function handleCloseScenarioSimulationModal() {
    const modal = document.getElementById('scenario-simulation-modal');
    if (modal) modal.style.display = 'none';
}
// ----------------------------------------------------------------
// SIMULATION EXECUTION
// ----------------------------------------------------------------
/**
 * Executa simulação com parâmetros do modal.
 */
function _readRunInputs() {
    const scenarioSelect = document.getElementById('sim-scenario');
    const scenarioId = (scenarioSelect as any)?.value;
    const mode = (document.querySelector('input[name="sim-mode"]:checked') as any)?.value || 'single';
    const numRuns = Math.min(parseInt((document.getElementById('sim-runs') as any)?.value) || 100, 1000);
    const weights = _readWeightsFromModal();
    const seedRaw = (document.getElementById('sim-seed') as any)?.value;
    const seed = seedRaw ? parseInt(seedRaw) : undefined;
    const budgetRaw = (document.getElementById('sim-budget') as any)?.value;
    const budget = budgetRaw ? parseFloat(budgetRaw) : null;
    return { scenarioId, mode, numRuns, weights, seed, budget };
}

function _setRunButtonLoading(loading: boolean) {
    const btnRun = document.getElementById('sim-btn-run');
    if (!btnRun) return;
    (btnRun as any).disabled = loading;
    btnRun.innerHTML = loading
        ? '<span class="icon" data-icon="loader"></span> ' + t('scenario.simulating')
        : '<span class="icon" data-icon="play"></span> ' + t('scenario.runSimulation');
}

async function _runSingleScenario(runScenarioSimulation: any, params: any, inputs: any) {
    const result = runScenarioSimulation(params, {
        numRuns: inputs.numRuns,
        weights: inputs.weights,
        seed: inputs.seed,
        budget: inputs.budget,
    });
    if (!result) return;
    _lastSimResult = result;
    _lastSimMode = 'single';
    const opt = document.getElementById('sim-scenario')?.selectedOptions?.[0];
    _lastSimScenarioName = opt?.textContent?.trim() || 'custom';
    _showResults(result);
    showToast(t('scenario.simulationComplete'), 'success');
}

async function _runComparisonScenario(compareStrategies: any, params: any, inputs: any) {
    const selectedDecisions = Array.from(document.querySelectorAll('input[name="sim-decisions"]:checked')).map(
        (cb: any) => cb.value,
    );
    if (selectedDecisions.length === 0) {
        showToast(t('scenario.selectAtLeastOneStrategy'), 'warning');
        return;
    }
    const { getDecision } = await import('../../core/analytics/scenarioSimulation/index.js' as string);
    const decisionObjects = selectedDecisions.map((id: any) => getDecision(id)).filter(Boolean);
    const comparison = compareStrategies(params, decisionObjects, Math.min(inputs.numRuns, 300), inputs.weights, inputs.budget);
    if (!comparison) return;
    _lastSimResult = comparison;
    _lastSimMode = 'comparison';
    const opt = document.getElementById('sim-scenario')?.selectedOptions?.[0];
    _lastSimScenarioName = opt?.textContent?.trim() || 'custom';
    _showComparison(comparison);
    showToast(t('scenario.comparisonComplete'), 'success');
}

async function handleRunScenarioSimulation() {
    const { runScenarioSimulation, compareStrategies } =
        await import('../../core/analytics/scenarioSimulation/index.js' as string);
    const inputs = _readRunInputs();
    if (!inputs.scenarioId) {
        showToast(t('scenario.selectScenario'), 'warning');
        return;
    }
    _setRunButtonLoading(true);
    await new Promise((r: any) => setTimeout(r, 16));
    try {
        // Modelos genéricos plugáveis (categoria energético/financeiro) — item #9
        if (String(inputs.scenarioId).startsWith(GENERIC_MODEL_PREFIX)) {
            if (inputs.mode !== 'single') {
                showToast('Comparação de estratégias está disponível apenas para cenários ambientais.', 'warning');
            }
            const modelId = String(inputs.scenarioId).slice(GENERIC_MODEL_PREFIX.length);
            const result = runSimModel(modelId, {
                numRuns: inputs.numRuns,
                ...(inputs.seed !== undefined ? { seed: inputs.seed } : {}),
            });
            _lastSimResult = result;
            _lastSimMode = 'single';
            const opt = document.getElementById('sim-scenario')?.selectedOptions?.[0];
            _lastSimScenarioName = opt?.textContent?.trim() || modelId;
            _showGenericModelResults(result);
            showToast(t('scenario.simulationComplete'), 'success');
            return;
        }
        const params = await _getSimulationParams(inputs.scenarioId);
        if (inputs.mode === 'single') {
            await _runSingleScenario(runScenarioSimulation, params, inputs);
        } else {
            await _runComparisonScenario(compareStrategies, params, inputs);
        }
    } catch (err: any) {
        log.error('Simulation run failed', /** @type {any} */ (err).message);
        showToast(t('errorWithMessage', { message: /** @type {any} */ (err).message }), 'error');
        const resultsDiv = document.getElementById('sim-results');
        if (resultsDiv) {
            resultsDiv.innerHTML = `<div style="color:var(--danger)">${t('scenario.errorWithMessage', { message: escapeHtml(/** @type {any} */ (err).message) })}</div>`;
        }
    } finally {
        _setRunButtonLoading(false);
    }
}
function _populateDefaults() {
    const scenarioSelect = document.getElementById('sim-scenario');
    if (scenarioSelect && !scenarioSelect.dataset.populated) {
        // População será feita pelo modal
        scenarioSelect.dataset.populated = 'true';
    }
}
/**
 * Mostra resultados de simulação única - hero card + tabs Visão Geral / Projeções.
 */
function _computeResultMetricColors(p: any, stats: any) {
    return {
        conf: p.compliance > 0.7 ? '#34d399' : p.compliance > 0.4 ? '#f59e0b' : '#ef4444',
        fail: p.failure < 0.05 ? '#34d399' : p.failure < 0.15 ? '#f59e0b' : '#ef4444',
        hlth: stats.finalHealth.p50 > 60 ? '#34d399' : stats.finalHealth.p50 > 40 ? '#f59e0b' : '#ef4444',
        time: !stats.timeToCompliance
            ? '#ef4444'
            : stats.timeToCompliance.p50 < 36
              ? '#34d399'
              : stats.timeToCompliance.p50 < 72
                ? '#f59e0b'
                : '#ef4444',
    };
}

function _buildOverviewContent(p: any, stats: any, colors: any) {
    const costRows = [
        { label: 'P10', val: stats.totalCost.p10, color: '#34d399' },
        { label: 'P50', val: stats.totalCost.p50, color: '#60a5fa' },
        { label: 'P90', val: stats.totalCost.p90, color: '#f87171' },
    ];
    const costBars = costRows.map(
        (r: any) => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
                <span style="font-size:9px;width:28px;color:#64748b;font-family:monospace;">${r.label}</span>
                <div style="flex:1;background:#1e293b;height:8px;border-radius:4px;overflow:hidden;">
                    <div style="width:${Math.min(100, (r.val / stats.totalCost.p90) * 100).toFixed(0)}%;height:100%;background:${r.color};border-radius:4px;"></div>
                </div>
                <span style="font-size:10px;width:68px;text-align:right;color:#94a3b8;font-family:monospace;">R$ ${(r.val / 1000).toFixed(0)}k</span>
            </div>
        `,
    ).join('');
    return `
        <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">${t('scenario.risks')}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;">
            <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;">
                ${Dot({ color: colors.fail })}
                <div>
                    <div style="font-size:9px;color:#64748b;">${t('scenario.failureRisk')}</div>
                    <div style="font-size:14px;font-weight:700;color:${colors.fail};font-family:monospace;">${(p.failure * 100).toFixed(0)}%</div>
                </div>
            </div>
            <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;">
                ${Dot({ color: colors.conf })}
                <div>
                    <div style="font-size:9px;color:#64748b;">Não-conformidade</div>
                    <div style="font-size:14px;font-weight:700;color:${colors.conf};font-family:monospace;">${((1 - p.compliance) * 100).toFixed(0)}%</div>
                </div>
            </div>
            <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;">
                ${Dot({ color: '#f59e0b' })}
                <div>
                    <div style="font-size:9px;color:#64748b;">Custo P90</div>
                    <div style="font-size:14px;font-weight:700;color:#f59e0b;font-family:monospace;">R$ ${(stats.totalCost.p90 / 1000).toFixed(0)}k</div>
                </div>
            </div>
            <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px;display:flex;align-items:center;gap:8px;">
                ${Dot({ color: colors.time })}
                <div>
                    <div style="font-size:9px;color:#64748b;">Tempo P50</div>
                    <div style="font-size:14px;font-weight:700;color:${colors.time};font-family:monospace;">
                        ${stats.timeToCompliance ? stats.timeToCompliance.p50.toFixed(0) + ' m' : 'N/A'}
                    </div>
                </div>
            </div>
        </div>

        <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.04em;">${t('scenario.costDistribution')}</div>
        ${costBars}

        <div style="margin-top:12px;padding:10px;background:#111827;border:1px solid #1e293b;border-radius:8px;font-size:10px;color:#64748b;">
            ${
                stats.timeToCompliance
                    ? `Conformidade atingida &mdash; mediana <strong style="color:#34d399;">${stats.timeToCompliance.p50.toFixed(0)} meses</strong> &nbsp;·&nbsp; P90 ${stats.timeToCompliance.p90.toFixed(0)} meses`
                    : `<span style="color:#ef4444;">${t('scenario.complianceNotMet')}</span>`
            }
        </div>
    `;
}

function _buildSimMetaBadge(config: any) {
    const simSeed = config?.seed;
    const simRuns = config?.numRuns;
    const simBudget = config?.budget;
    return `<div style="font-size:9px;color:var(--text-muted);margin-bottom:6px;display:flex;gap:10px;flex-wrap:wrap;">
        <span>seed: ${simSeed != null ? simSeed : 'aleat&#243;ria'}</span>
        <span>${simRuns} simulac&#807;&#245;es</span>
        ${simBudget ? `<span>orc&#807;amento: R$ ${Number(simBudget).toLocaleString('pt-BR')}</span>` : ''}
    </div>`;
}

function _renderFanChartsForResults(container: any, timeline: any) {
    const chartsPanel = container.querySelector('[data-tab-panel="charts"]');
    const chartDefs = [
        { field: 'concentration', label: 'Concentração', unit: 'µg/L', color: '#22d3ee', refLine: null, fmt: (v: any) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0)) },
        { field: 'cost', label: 'Custo Acumulado', unit: 'R$', color: '#34d399', refLine: null, fmt: (v: any) => 'R$' + (v / 1000).toFixed(0) + 'k' },
        { field: 'health', label: 'Saúde Ambiental', unit: 'pts', color: '#a78bfa', refLine: 30, fmt: (v: any) => v.toFixed(0) },
    ];
    for (const def of chartDefs) {
        const canvas = document.createElement('canvas');
        canvas.width = 600;
        canvas.height = 130;
        canvas.style.cssText = 'width:100%;max-width:600px;height:130px;display:block;margin-bottom:8px;border-radius:6px;';
        chartsPanel.appendChild(canvas);
        const stabilityData = _calculateStabilityMetrics(timeline, def.field);
        _renderFanChart(canvas, timeline, { ...def, stabilityData });
    }
    return chartDefs;
}

function _stabilityClassLabel(stability: string) {
    if (stability === 'stable') return { color: '#34d399', label: 'Estável' };
    if (stability === 'converging') return { color: '#f59e0b', label: 'Convergindo' };
    return { color: '#ef4444', label: 'Instável' };
}

function _buildStabilityPanelHtml(stabilityMetrics: any[]) {
    return `
        <div style="margin-top:16px;padding:12px;background:#111827;border:1px solid #1e293b;border-radius:8px;">
            <div style="font-size:10px;font-weight:600;color:#94a3b8;margin-bottom:8px;text-transform:uppercase;letter-spacing:.04em;">
                <span class="icon" data-icon="trending-up"></span> Estabilidade do Modelo Monte Carlo
            </div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                ${stabilityMetrics.map((m: any) => {
                    const s = m.metrics;
                    const { color, label } = _stabilityClassLabel(s.stability);
                    return `
                        <div style="background:#1e293b;border-radius:6px;padding:8px;">
                            <div style="font-size:9px;color:#64748b;margin-bottom:4px;">${m.label}</div>
                            <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px;">
                                <div style="width:8px;height:8px;border-radius:50%;background:${color};"></div>
                                <div style="font-size:9px;font-weight:600;color:${color};">${label}</div>
                            </div>
                            ${s.metrics.relativeError !== null ? `<div style="font-size:8px;color:#94a3b8;">Erro relativo: <span style="color:#e2e8f0;font-family:monospace;">${(s.metrics.relativeError * 100).toFixed(1)}%</span></div>` : ''}
                            ${s.metrics.effectiveSampleSize !== null ? `<div style="font-size:8px;color:#94a3b8;">Amostras efetivas: <span style="color:#e2e8f0;font-family:monospace;">${s.metrics.effectiveSampleSize}</span></div>` : ''}
                        </div>`;
                }).join('')}
            </div>
            <div style="margin-top:10px;padding:8px;background:#1e293b;border-radius:6px;font-size:8px;color:#94a3b8;line-height:1.4;">
                <strong>Interpretação:</strong> 
                <span style="color:#34d399;">&#10003; Estável</span> = modelo convergiu, resultados confiáveis ·
                <span style="color:#f59e0b;">&#9889; Convergindo</span> = ainda melhorando com mais simulações ·
                <span style="color:#ef4444;">&#9888; Instável</span> = resultados podem variar significativamente
            </div>
        </div>`;
}

function _renderStabilityPanelForResults(container: any, timeline: any) {
    const labels: Record<string, string> = { concentration: 'Concentração', cost: 'Custo Acumulado', health: 'Saúde Ambiental' };
    const stabilityMetrics = ['concentration', 'cost', 'health'].map((field: string) => ({
        field,
        label: labels[field],
        metrics: _calculateStabilityMetrics(timeline, field),
    }));
    const chartsPanel = container.querySelector('[data-tab-panel="charts"]');
    chartsPanel.insertAdjacentHTML('beforeend', _buildStabilityPanelHtml(stabilityMetrics));
}

function _setupScenarioTabHandlers(container: any) {
    window._handleScenarioTabChange = function (e: any) {
        const tabId = e.target.dataset.tab;
        if (!tabId) return;
        container.querySelectorAll('[data-tab]').forEach((btn: any) => {
            btn.style.background = btn.dataset.tab === tabId ? '#22d3ee18' : '#0f172a';
            btn.style.color = btn.dataset.tab === tabId ? '#22d3ee' : '#475569';
            btn.style.fontWeight = btn.dataset.tab === tabId ? '700' : '400';
        });
        container.querySelectorAll('[data-tab-panel]').forEach((panel: any) => {
            panel.style.display = panel.dataset.tabPanel === tabId ? 'block' : 'none';
        });
    };
    container.querySelectorAll('[data-tab]').forEach((btn: any) => {
        btn.addEventListener('click', window._handleScenarioTabChange);
    });
}

function _showResults(result: any) {
    const container = document.getElementById('sim-results');
    if (!container) return;
    const { stats, score } = result;
    const p = stats.probabilities;
    const sc = Math.round(score?.score ?? 0);
    const colors = _computeResultMetricColors(p, stats);
    const heroCard = HeroCard({
        score: sc,
        title: `Conformidade: ${(p.compliance * 100).toFixed(0)}% · Custo mediano: R$ ${(stats.totalCost.p50 / 1000).toFixed(0)}k`,
        kpis: [
            { value: `${(p.compliance * 100).toFixed(0)}%`, label: 'Conformidade', color: colors.conf },
            { value: `${(p.failure * 100).toFixed(0)}%`, label: 'Risco Falha', color: colors.fail },
            { value: stats.finalHealth.p50.toFixed(0), label: 'Saúde Amb.', color: colors.hlth },
        ],
    });
    const tabsHtml = Tabs({
        tabs: [
            { id: 'overview', label: 'Visão Geral' },
            { id: 'charts', label: 'Projeções' },
        ],
        activeTab: 'overview',
        onTabChange: '_handleScenarioTabChange',
    });
    const overviewContent = _buildOverviewContent(p, stats, colors);
    const chartsContent = `
        <div style="font-size:9px;color:#475569;margin-bottom:10px;line-height:1.5;">
            Linha sólida = mediana &nbsp;·&nbsp; Banda escura = 50% dos cenários &nbsp;·&nbsp; Banda clara = 80%
        </div>
    `;
    const exportBtn = `
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
            <button data-cc-action="cc-813a5fa0"
                style="background:#111827;border:1px solid #1e293b;color:#94a3b8;padding:5px 12px;border-radius:6px;font-size:10px;cursor:pointer;display:flex;align-items:center;gap:4px;"
                title="${t('scenario.exportRawCsvTooltip')}">
                <span class="icon" data-icon="download"></span> Exportar CSV
            </button>
        </div>
    `;
    const metaBadge = _buildSimMetaBadge(result.config);
    container.innerHTML = `
        ${heroCard}
        ${metaBadge}
        ${exportBtn}
        ${tabsHtml}
        <div data-tab-panel="overview">
            ${overviewContent}
        </div>
        <div data-tab-panel="charts" style="display:none;">
            ${chartsContent}
        </div>
    `;
    _setupScenarioTabHandlers(container);
    if (stats.timeline && stats.timeline.length > 0) {
        _renderFanChartsForResults(container, stats.timeline);
        _renderStabilityPanelForResults(container, stats.timeline);
    }
    hydrateIcons(container);
}
// ----------------------------------------------------------------
// GENERIC MODEL RESULTS (motor × modelos plugáveis — item #9)
// ----------------------------------------------------------------
function _fmtMetricValue(v: any) {
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1000) return (n / 1000).toFixed(1) + 'k';
    if (abs >= 100) return n.toFixed(0);
    return n.toFixed(abs >= 10 ? 1 : 2);
}
/** Sparkline SVG da curva de convergência (P50 acumulada por n). */
function _buildConvergenceSvg(series: any, color: any) {
    if (!Array.isArray(series) || series.length < 2) return '';
    const vals = series.map((s: any) => s.p50);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const W = 130;
    const H = 28;
    const pts = series
        .map((s: any, i: number) => {
            const x = (i / (series.length - 1)) * W;
            const y = H - ((s.p50 - min) / span) * (H - 4) - 2;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;">
        <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
}
function _buildGenericMetricCard(meta: any, st: any, conv: any) {
    const color = meta?.better === 'lower' ? '#f59e0b' : '#34d399';
    const rows = [
        { label: 'P10', val: st.p10, color: '#34d399' },
        { label: 'P50', val: st.p50, color: '#60a5fa' },
        { label: 'P90', val: st.p90, color: '#f87171' },
    ];
    const maxAbs = Math.max(...rows.map((r: any) => Math.abs(r.val)), 1e-9);
    const bars = rows
        .map(
            (r: any) => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="font-size:9px;width:26px;color:#64748b;font-family:monospace;">${r.label}</span>
                <div style="flex:1;background:#1e293b;height:7px;border-radius:4px;overflow:hidden;">
                    <div style="width:${Math.min(100, (Math.abs(r.val) / maxAbs) * 100).toFixed(0)}%;height:100%;background:${r.color};border-radius:4px;"></div>
                </div>
                <span style="font-size:10px;width:64px;text-align:right;color:#94a3b8;font-family:monospace;">${_fmtMetricValue(r.val)}</span>
            </div>`,
        )
        .join('');
    return `
        <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px;">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
                <div style="font-size:10px;color:#94a3b8;font-weight:600;">${escapeHtml(meta?.name || meta?.key || '')}</div>
                <div style="font-size:9px;color:#475569;">${escapeHtml(meta?.unit || '')}</div>
            </div>
            <div style="font-size:16px;font-weight:700;color:${color};font-family:monospace;margin-bottom:6px;">
                ${_fmtMetricValue(st.p50)} <span style="font-size:9px;color:#64748b;">mediana</span>
            </div>
            ${bars}
            <div style="margin-top:6px;">
                <div style="font-size:8px;color:#475569;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px;">Convergência (P50)</div>
                ${_buildConvergenceSvg(conv, '#22d3ee')}
            </div>
        </div>`;
}
/**
 * Renderiza resultado de modelo genérico com o MESMO padrão visual dos
 * cenários legados: hero card com score, cards de métricas P10/P50/P90
 * e curvas de convergência.
 */
function _showGenericModelResults(result: any) {
    const container = document.getElementById('sim-results');
    if (!container) return;
    const model = result.model || {};
    const metricDefs = (model.metrics || Object.keys(result.metrics || {}).map((k: any) => ({ key: k, name: k }))) as Array<any>;
    const sc = Math.round(result.score?.score ?? 0);
    const kpis = metricDefs.slice(0, 3).map((m: any) => {
        const st = result.metrics?.[m.key];
        return {
            value: st ? _fmtMetricValue(st.p50) : '—',
            label: m.name + (m.unit ? ` (${m.unit})` : ''),
            color: m.better === 'lower' ? '#f59e0b' : '#34d399',
        };
    });
    const heroCard = HeroCard({
        score: sc,
        title: `${model.name || result.modelId}${result.score?.label ? ' · ' + result.score.label : ''}`,
        kpis,
    });
    const metaBadge = `<div style="font-size:9px;color:var(--text-muted);margin-bottom:6px;display:flex;gap:10px;flex-wrap:wrap;">
        <span>seed: ${result.seed != null ? result.seed : 'aleat&#243;ria'}</span>
        <span>${result.nRuns} simulac&#807;&#245;es</span>
        <span>modelo: ${escapeHtml(result.modelId || '')}</span>
    </div>`;
    const cards = metricDefs
        .map((m: any) => {
            const st = result.metrics?.[m.key];
            if (!st) return '';
            return _buildGenericMetricCard(m, st, result.convergence?.[m.key]);
        })
        .join('');
    container.innerHTML = `
        ${heroCard}
        ${metaBadge}
        <div style="font-size:10px;font-weight:600;color:#94a3b8;margin:10px 0 6px;text-transform:uppercase;letter-spacing:.04em;">Distribui&#231;&#245;es das m&#233;tricas</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px;">
            ${cards}
        </div>
    `;
    hydrateIcons(container);
}
function _buildComparisonHeaderHtml(baseline: any) {
    const baseScore = Math.round(baseline?.score?.score ?? 0);
    const baseConf = (baseline?.stats?.probabilities?.compliance ?? 0) * 100;
    return `
    <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;gap:20px;align-items:center;">
      <div>
        <div style="font-size:10px;color:#475569;text-transform:uppercase;margin-bottom:2px;">${t('scenario.baseline')}</div>
        <div style="font-size:22px;font-weight:800;color:#94a3b8;font-family:monospace;line-height:1;">${baseScore}</div>
      </div>
      <div style="width:1px;background:#1e293b;align-self:stretch;"></div>
      <div style="font-size:10px;color:#64748b;">
        ${baseConf.toFixed(0)}% conformidade<br>
        <span style="font-size:9px;">sem nenhuma interven&#231;&#227;o adicional</span>
      </div>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-bottom:8px;">
        <button data-cc-action="cc-813a5fa0"
            style="background:#111827;border:1px solid #1e293b;color:#94a3b8;padding:5px 12px;border-radius:6px;font-size:10px;cursor:pointer;display:flex;align-items:center;gap:4px;"
            title="${t('scenario.exportPercentilesTooltip')}">
            <span class="icon" data-icon="download"></span> Exportar CSV
        </button>
    </div>`;
}

function _scoreColorForDelta(sd: number) {
    return sd > 1 ? '#34d399' : sd < -1 ? '#ef4444' : '#64748b';
}

function _impactColor(impact: string) {
    return impact === 'alto' ? '#ef4444' : impact === 'medio' ? '#f59e0b' : '#475569';
}

function _deltaBarStyle(sd: number, maxDelta: number) {
    return {
        barW: Math.round(Math.min(100, (Math.abs(sd) / maxDelta) * 100)),
        barColor: sd >= 0 ? '#34d399' : '#ef4444',
    };
}

function _buildComparisonRowHtml(comp: any, maxDelta: number) {
    const sd = comp.deltas?.score ?? 0;
    const cd = comp.deltas?.compliance ?? 0;
    const costD = comp.deltas?.cost ?? 0;
    const scColor = _scoreColorForDelta(sd);
    const impactColor = _impactColor(comp.impact);
    const { barW, barColor } = _deltaBarStyle(sd, maxDelta);
    return `
        <div style="background:#111827;border:1px solid #1e293b;border-left:3px solid ${scColor};border-radius:0 8px 8px 0;padding:10px 12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
            <span style="font-size:11px;font-weight:600;color:#e2e8f0;">${escapeHtml(comp.name)}</span>
            <span style="font-size:8px;padding:2px 5px;border-radius:3px;background:#1e293b;color:${impactColor};text-transform:uppercase;letter-spacing:.04em;">${comp.impact}</span>
          </div>
          <div style="font-size:9px;color:#475569;margin-bottom:8px;">${escapeHtml(comp.description || '')}</div>

          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
            <span style="font-size:9px;color:#64748b;width:36px;">${t('scenario.score')}</span>
            <div style="flex:1;height:6px;background:#1e293b;border-radius:3px;overflow:hidden;">
              <div style="width:${barW}%;height:100%;background:${barColor};border-radius:3px;"></div>
            </div>
            <span style="font-size:10px;font-weight:700;color:${scColor};font-family:monospace;width:36px;text-align:right;">${sd >= 0 ? '+' : ''}${sd.toFixed(0)}</span>
          </div>

          <div style="display:flex;gap:12px;font-size:9px;color:#64748b;">
            <span>Conf: <strong style="color:${cd > 0.01 ? '#34d399' : cd < -0.01 ? '#ef4444' : '#64748b'};">${cd >= 0 ? '+' : ''}${(cd * 100).toFixed(0)}pp</strong></span>
            <span>Custo: <strong style="color:${costD < 0 ? '#34d399' : costD > 0 ? '#ef4444' : '#64748b'};">R$ ${costD >= 0 ? '+' : ''}${(costD / 1000).toFixed(0)}k</strong></span>
          </div>
        </div>
    `;
}

function _showComparison(comparison: any) {
    const container = document.getElementById('sim-results');
    if (!container) return;
    const { baseline, comparisons } = comparison;
    const maxDelta = Math.max(1, ...comparisons.map((c: any) => Math.abs(c.deltas?.score ?? 0)));
    let html = _buildComparisonHeaderHtml(baseline);
    html += '<div style="display:flex;flex-direction:column;gap:6px;">';
    for (const comp of comparisons) {
        html += _buildComparisonRowHtml(comp, maxDelta);
    }
    html += '</div>';
    container.innerHTML = html;
    hydrateIcons(container);
}
function _calculateStabilityMetrics(timeline: any, field: any) {
    // Delegates to the hardened pure module (NaN-safe, div-by-zero guards).
    // The DOM render path interpola effectiveSampleSize direto no HTML, então
    // mantemos o Math.round legado aqui para preservar a saída byte-identical.
    const result = _calculateStabilityMetricsPure(timeline, field);
    const ess = result?.metrics?.effectiveSampleSize;
    if (typeof ess === 'number' && Number.isFinite(ess)) {
        result.metrics.effectiveSampleSize = Math.round(ess);
    }
    return result;
}
// ----------------------------------------------------------------
// FAN CHART - Canvas P10/P50/P90 + Indicadores de Estabilidade
// ----------------------------------------------------------------
/**
 * Renderiza fan chart de percentis em canvas nativo com indicadores de estabilidade.
 * Inclui análise de convergência e métricas de estabilidade do modelo Monte Carlo.
 *
 * @param {HTMLCanvasElement} field
 * @param {Array<any>} field - stats.timeline de calculateStats()
 * @param {any} opts
 */
function _prepareFanData(timeline: any, field: any) {
    return timeline.map((m: any) => {
        const d = m[field] || {};
        return {
            p10: d.p10 ?? d.p25 ?? d.p50 ?? 0,
            p25: d.p25 ?? d.p50 ?? 0,
            p50: d.p50 ?? 0,
            p75: d.p75 ?? d.p50 ?? 0,
            p90: d.p90 ?? d.p75 ?? d.p50 ?? 0,
        };
    });
}

function _computeFanRange(data: any, refLine: any) {
    let minV = data[0].p10;
    let maxV = data[0].p90;
    for (const d of data) {
        if (d.p10 < minV) minV = d.p10;
        if (d.p90 > maxV) maxV = d.p90;
    }
    if (refLine != null) {
        if (refLine < minV) minV = refLine;
        if (refLine > maxV) maxV = refLine;
    }
    minV = minV * 0.95;
    maxV = maxV * 1.05;
    const rng = maxV - minV || 1;
    return { minV, maxV, rng };
}

function _drawFanBackground(ctx: any, W: number, H: number) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);
}

function _drawFanGrid(ctx: any, W: number, pad: any, iH: number) {
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (const frac of [0.25, 0.5, 0.75]) {
        const yGrid = pad.t + frac * iH;
        ctx.beginPath();
        ctx.moveTo(pad.l, yGrid);
        ctx.lineTo(W - pad.r, yGrid);
        ctx.stroke();
    }
}

function _drawFanBands(ctx: any, data: any, color: string, xS: any, yS: any, MO: number) {
    ctx.fillStyle = color + '28';
    ctx.beginPath();
    ctx.moveTo(xS(0), yS(data[0].p10));
    for (let i = 0; i < MO; i++) ctx.lineTo(xS(i), yS(data[i].p10));
    for (let i = MO - 1; i >= 0; i--) ctx.lineTo(xS(i), yS(data[i].p90));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = color + '50';
    ctx.beginPath();
    ctx.moveTo(xS(0), yS(data[0].p25));
    for (let i = 0; i < MO; i++) ctx.lineTo(xS(i), yS(data[i].p25));
    for (let i = MO - 1; i >= 0; i--) ctx.lineTo(xS(i), yS(data[i].p75));
    ctx.closePath();
    ctx.fill();
}

function _drawFanMedian(ctx: any, data: any, color: string, xS: any, yS: any, MO: number) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(xS(0), yS(data[0].p50));
    for (let i = 1; i < MO; i++) ctx.lineTo(xS(i), yS(data[i].p50));
    ctx.stroke();
}

function _drawFanRefLine(ctx: any, refLine: any, yS: any, W: number, pad: any) {
    ctx.strokeStyle = '#ef4444cc';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(pad.l, yS(refLine));
    ctx.lineTo(W - pad.r, yS(refLine));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ef4444';
    ctx.font = '7px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('meta', W - pad.r - 2, yS(refLine) - 3);
}

function _drawFanConvergence(ctx: any, convergence: any, color: string, W: number, pad: any, yS: any) {
    if (convergence?.finalValue != null) {
        const finalY = yS(convergence.finalValue);
        ctx.strokeStyle = '#34d399cc';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(pad.l, finalY);
        ctx.lineTo(W - pad.r, finalY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#34d399';
        ctx.font = '7px ui-monospace, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('estabilizado', W - pad.r - 2, finalY - 3);
    }
    if (convergence?.confidenceInterval) {
        const [lower, upper] = convergence.confidenceInterval;
        const yLower = yS(lower);
        const yUpper = yS(upper);
        ctx.fillStyle = color + '15';
        ctx.beginPath();
        ctx.moveTo(pad.l, yLower);
        ctx.lineTo(W - pad.r, yLower);
        ctx.lineTo(W - pad.r, yUpper);
        ctx.lineTo(pad.l, yUpper);
        ctx.closePath();
        ctx.fill();
    }
}

function _drawFanYLabels(ctx: any, pad: any, minV: number, maxV: number, iH: number, fmt: any) {
    const midV = (maxV + minV) / 2;
    ctx.fillStyle = '#64748b';
    ctx.font = '8px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(fmt(maxV), pad.l - 4, pad.t + 9);
    ctx.fillText(fmt(midV), pad.l - 4, pad.t + iH / 2 + 4);
    ctx.fillText(fmt(minV), pad.l - 4, pad.t + iH + 1);
}

function _drawFanTimeMarkers(ctx: any, W: number, H: number, pad: any, iH: number, MO: number, xS: any) {
    const timeMarkers = [6, 12, 24, 60, 120].filter((mo: any) => mo < MO);
    for (const mo of timeMarkers) {
        const x = xS(mo);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, pad.t);
        ctx.lineTo(x, pad.t + iH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#475569';
        ctx.font = '7px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(mo < 12 ? mo + 'm' : mo / 12 + 'a', x, H - 4);
    }
}

function _drawFanTitle(ctx: any, label: string, unit: string, color: string, stabilityData: any, pad: any) {
    ctx.fillStyle = color;
    ctx.font = 'bold 9px ui-monospace, monospace';
    ctx.textAlign = 'left';
    let stabilityIndicator = '';
    if (stabilityData?.stability === 'stable') {
        stabilityIndicator = ' \u2713';
        ctx.fillStyle = '#34d399';
    } else if (stabilityData?.stability === 'converging') {
        stabilityIndicator = ' \u26A1';
        ctx.fillStyle = '#f59e0b';
    } else if (stabilityData?.stability === 'unstable') {
        stabilityIndicator = ' \u26A0';
        ctx.fillStyle = '#ef4444';
    }
    ctx.fillText(label + ' (' + unit + ')' + stabilityIndicator, pad.l, 11);
}

function _renderFanChart(canvas: any, timeline: any, opts: any) {
    try {
        const ctx = canvas.getContext('2d');
        if (!ctx || !timeline.length) return;
        const W = canvas.width;
        const H = canvas.height;
        const pad = { t: 16, r: 12, b: 22, l: 56 };
        const iW = W - pad.l - pad.r;
        const iH = H - pad.t - pad.b;
        const MO = timeline.length;
        const { field, label, unit, color, refLine, fmt, stabilityData } = opts;
        const data = _prepareFanData(timeline, field);
        const { minV, maxV, rng } = _computeFanRange(data, refLine);
        const xS = (i: any) => pad.l + (i / (MO - 1)) * iW;
        const yS = (v: any) => pad.t + iH - ((v - minV) / rng) * iH;
        _drawFanBackground(ctx, W, H);
        _drawFanGrid(ctx, W, pad, iH);
        _drawFanBands(ctx, data, color, xS, yS, MO);
        _drawFanMedian(ctx, data, color, xS, yS, MO);
        if (refLine != null) _drawFanRefLine(ctx, refLine, yS, W, pad);
        if (stabilityData) _drawFanConvergence(ctx, stabilityData.convergence, color, W, pad, yS);
        _drawFanYLabels(ctx, pad, minV, maxV, iH, fmt || ((v: any) => v.toFixed(0)));
        _drawFanTimeMarkers(ctx, W, H, pad, iH, MO, xS);
        _drawFanTitle(ctx, label, unit, color, stabilityData, pad);
    } catch (err: any) {
        log.warn('Fan chart render error', /** @type {any} */ (err)?.message);
    }
}
// ----------------------------------------------------------------
// SCENARIO PARAMS EDITOR
// ----------------------------------------------------------------
import {
    PARAM_META as PARAM_META_RAW,
    PARAM_GROUPS as PARAM_GROUPS_RAW,
    PARAM_GROUP_ORDER as PARAM_GROUP_ORDER_RAW,
} from './scenarioSimulationParams.js';
const PARAM_META = (PARAM_META_RAW) as Array<any>;
const PARAM_GROUPS = (PARAM_GROUPS_RAW) as Record<string, any>;
const PARAM_GROUP_ORDER = (PARAM_GROUP_ORDER_RAW) as Array<any>;

function _renderParamEditorHtml(values: any = {}) {
    /** @type {Record<string, Array<any>>} */
    const grouped: any = {};
    for (const meta of PARAM_META) {
        const g = meta.group || 'geral';
        if (!grouped[g]) grouped[g] = [];
        grouped[g].push(meta);
    }
    return PARAM_GROUP_ORDER.filter((gk: any) => grouped[gk])
        .map((gk: any) => {
            const info = PARAM_GROUPS[gk] || PARAM_GROUPS.geral;
            const inputs = grouped[gk]
                .map((m: any) => {
                    const val = values[m.key];
                    if (m.type === 'checkbox') {
                        return `<label style="font-size:10px;display:flex;align-items:center;gap:6px;cursor:pointer;grid-column:1/-1;" title="${escapeHtml(m.tooltip || '')}">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:input:L1010" type="checkbox" name="sim-param-${m.key}" ${val ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0;">
                        <span>${escapeHtml(m.label)}</span>
                    </label>`;
                    }
                    return `<label style="font-size:10px;display:flex;flex-direction:column;gap:2px;" title="${escapeHtml(m.tooltip || '')}">
                    <span style="display:flex;justify-content:space-between;align-items:baseline;">
                        <span>${escapeHtml(m.label)}</span>
                        ${m.unit ? `<span style="font-size:8px;color:var(--text-muted);margin-left:4px;">${escapeHtml(m.unit)}</span>` : ''}
                    </span>
                    <input data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:input:L1019" type="number" name="sim-param-${m.key}"
                        value="${val !== undefined ? val : ''}"
                        step="${m.step}"
                        ${m.min !== undefined ? `min="${m.min}"` : ''}
                        ${m.max !== undefined ? `max="${m.max}"` : ''}
                        style="width:100%;padding:5px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);">
                </label>`;
                })
                .join('');
            return `<details open style="margin-bottom:6px;border:1px solid ${info.color}35;border-radius:6px;overflow:hidden;">
            <summary style="padding:7px 10px;cursor:pointer;font-size:10px;font-weight:600;color:${info.color};background:${info.color}12;user-select:none;">
                ${escapeHtml(info.label)}
            </summary>
            <div style="padding:10px;display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                ${inputs}
            </div>
        </details>`;
        })
        .join('');
}
/**
 * Gera options do select de cenários (builtin + custom).
 * @returns {string} HTML de <option> tags
 */
function _generateScenarioOptions() {
    const profiles = (getAllScenarioProfiles()) as Array<any>;
    const legacyIds = new Set(profiles.map((p: any) => p.id));
    // Grupo Ambiental = cenários legados (builtin + custom), comportamento intacto
    const ambientalOptions = profiles
        .map(
            (p: any) =>
                `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}${p._custom ? ' ✎' : ''}</option>`,
        )
        .join('');
    // Demais categorias = modelos genéricos do registry (registro declarativo)
    const groups = (getSimModelPickerGroups() as Array<any>)
        .filter((g: any) => g.category !== 'ambiental')
        .map((g: any) => {
            const opts = g.models
                .filter((m: any) => !legacyIds.has(m.id))
                .map(
                    (m: any) =>
                        `<option value="${GENERIC_MODEL_PREFIX}${escapeHtml(m.id)}">${escapeHtml(m.name)}</option>`,
                )
                .join('');
            return opts ? `<optgroup label="${escapeHtml(g.label)}">${opts}</optgroup>` : '';
        })
        .join('');
    return `<optgroup label="Ambiental">${ambientalOptions}</optgroup>${groups}`;
}
/**
 * Gera opções do dropdown de overlays climáticos.
 * Inclui opção "Sem overlay" + builtins + custom.
 * @returns {string} HTML
 */
function _generateOverlayOptions() {
    const overlays = (getAllOverlays()) as Array<any>;
    const opts = overlays
        .map(
            (o: any) =>
                `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}${o._custom ? ' ✎' : ''}</option>`,
        )
        .join('');
    return `<option value="">${t('scenario.noWeatherOverlay')}</option>${opts}`;
}
/**
 * Atualiza o dropdown de overlays mantendo a seleção atual.
 * @param {HTMLElement} modal
 * @param {string|null} [forceSelectId]
 */
function _refreshOverlayDropdown(modal: any,forceSelectId: any = null) {
    const select = modal?.querySelector('#sim-overlay');
    if (!select) return;
    const prev = forceSelectId ?? select.value;
    select.innerHTML = _generateOverlayOptions();
    if (prev) select.value = prev;
    _updateOverlayActionButtons(modal);
}
/**
 * Mostra/esconde botão de excluir overlay dependendo de ser custom.
 * @param {HTMLElement} modal
 */
function _updateOverlayActionButtons(modal: any) {
    const select = modal?.querySelector('#sim-overlay');
    const deleteBtn = modal?.querySelector('#sim-delete-overlay-btn');
    if (!deleteBtn || !select) return;
    const overlays = (getAllOverlays()) as Array<any>;
    const current = overlays.find((o: any) => o.id === select.value);
    deleteBtn.style.display = current?._custom ? 'inline-flex' : 'none';
}
/**
 * Atualiza o dropdown de cenários mantendo a seleção atual.
 * @param {HTMLElement} modal
 * @param {string|null} [forceSelectId] - se fornecido, seleciona esse ID após refresh
 */
function _refreshScenarioDropdown(modal: any,forceSelectId: any = null) {
    const select = modal?.querySelector('#sim-scenario');
    if (!select) return;
    const prev = forceSelectId ?? select.value;
    select.innerHTML = _generateScenarioOptions();
    if (prev) select.value = prev;
    _updateScenarioActionButtons(modal);
}
/**
 * Mostra/esconde botão de excluir dependendo de o cenário atual ser custom.
 * @param {HTMLElement} modal
 */
function _updateScenarioActionButtons(modal: any) {
    const select = modal?.querySelector('#sim-scenario');
    const deleteBtn = modal?.querySelector('#sim-delete-scenario-btn');
    if (!deleteBtn || !select) return;
    const profiles = (getAllScenarioProfiles()) as Array<any>;
    const current = profiles.find((p: any) => p.id === select.value);
    deleteBtn.style.display = current?._custom ? 'inline-flex' : 'none';
}
const PARAM_SOURCE = Object.freeze({
    RAW: 'raw',
    CALCULATOR: 'calculator',
});
function _normalizeParamValue(meta: any,value: any) {
    if (meta.type === 'checkbox') return !!value;
    let num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (meta.integer) num = Math.round(num);
    if (meta.min !== undefined) num = Math.max(num, Number(meta.min));
    if (meta.max !== undefined) num = Math.min(num, Number(meta.max));
    return num;
}
function _readScenarioDefaultsFromDataset() {
    const container = document.getElementById('sim-params-editor');
    if (!container?.dataset?.defaults) return null;
    return safeJsonParse(container.dataset.defaults);
}
function _fillParamsEditorWithValues(values: any) {
    const container = document.getElementById('sim-params-editor');
    if (!container) return;
    PARAM_META.forEach((meta: any) => {
        const input = container.querySelector(`[name="sim-param-${meta.key}"]`);
        if (!input) return;
        const val = values?.[meta.key];
        // Campos ausentes no cenário ficam desabilitados - sem valor = sem efeito na simulação
        const present = val !== undefined;
        if (meta.type === 'checkbox') {
            input.checked = !!val;
        } else {
            input.value = present ? val : '';
        }
        input.disabled = !present;
        // Aplicar opacidade visual na label pai
        const label = input.closest('label');
        if (label) label.style.opacity = present ? '1' : '0.35';
    });
}
async function _populateScenarioParams(scenarioId: any) {
    const container = document.getElementById('sim-params-editor');
    if (!container || !scenarioId) return;
    // Modelos genéricos: parâmetros vêm das distribuições do modelo, não do editor legado
    if (String(scenarioId).startsWith(GENERIC_MODEL_PREFIX)) {
        container.dataset.defaults = '{}';
        _fillParamsEditorWithValues({});
        return;
    }
    // Overlay selecionado (pode ser vazio = sem overlay)
    const overlayId = document.getElementById('sim-overlay')?.value || null;
    // Tenta usar resolveScenarioParams (merge base + overlay)
    const resolved = resolveScenarioParams(scenarioId, overlayId);
    let defaults = resolved;
    if (!defaults) {
        // Fallback: perfil custom direto
        const profiles = (getAllScenarioProfiles()) as Array<any>;
        const profile = profiles.find((p: any) => p.id === scenarioId);
        defaults = profile?.params ? { ...profile.params } : {};
    }
    container.dataset.defaults = JSON.stringify(defaults);
    _fillParamsEditorWithValues(defaults);
}
function _collectManualParamOverrides(baseParams: any = {}) {
    const container = document.getElementById('sim-params-editor');
    const params = { ...baseParams };
    PARAM_META.forEach((meta: any) => {
        const input = container?.querySelector(`[name="sim-param-${meta.key}"]`);
        // Campos desabilitados (ausentes no cenário) não devem sobrescrever o baseParams
        if (!input || input.disabled) return;
        if (meta.type === 'checkbox') {
            params[meta.key] = input.checked;
            return;
        }
        const normalized = _normalizeParamValue(meta, parseFloat(input.value));
        if (normalized !== null) params[meta.key] = normalized;
    });
    return params;
}
function _getSelectedParamSource() {
    return document.querySelector('input[name="sim-param-source"]:checked')?.value || PARAM_SOURCE.RAW;
}
function _renderCalculatorStatus(text: any,tone: any = 'normal') {
    const status = document.getElementById('sim-calculator-status');
    if (!status) return;
    const colors = {
        normal: 'var(--text-muted)',
        success: '#34d399',
        warning: '#f59e0b',
        error: '#ef4444',
    };
    status.textContent = text;
    status.style.color = (colors as any)[tone] || colors.normal;
}
async function _refreshCalculatorMappingOptions() {
    const mapping = document.getElementById('sim-calculator-mapping');
    if (!mapping) return;
    /** @type {Record<string, string>} */
    const previousSelection: any = {};
    PARAM_META.forEach((meta: any) => {
        const select = mapping.querySelector(`[name="sim-calc-map-${meta.key}"]`);
        if (select) previousSelection[meta.key] = select.value || '';
    });
    try {
        const { getCalculatorItems, computeAllCalculator } = await import('../../core/calculator/manager.js' as string);
        const items = getCalculatorItems().filter((item: any) => item.enabled !== false);
        const results = computeAllCalculator();
        const resultById = new Map(results.map((result: any) => [result.id, result]));
        const optionHtml = items
            .map((item: any) => {
                const result: any = resultById.get(item.id);
                const numeric = Number(result?.value);
                const preview = Number.isFinite(numeric) ? numeric.toFixed(2) : result?.error ? 'erro' : 'n/a';
                const label = item.label?.trim() || item.id;
                return `<option value="${escapeHtml(item.id)}">${escapeHtml(label)} [${preview}]</option>`;
            })
            .join('');
        PARAM_META.forEach((meta: any) => {
            const select = mapping.querySelector(`[name="sim-calc-map-${meta.key}"]`);
            if (!select) return;
            const previous = previousSelection[meta.key] || '';
            select.innerHTML = `<option value="">${t('scenario.usingScenarioValue')}</option>${optionHtml}`;
            if (previous) select.value = previous;
        });
        _renderCalculatorStatus(
            items.length > 0
                ? `${items.length} metricas disponiveis no Calculator`
                : 'Nenhuma metrica ativa no Calculator. Usando valores do cenario.',
            items.length > 0 ? 'success' : 'warning',
        );
    } catch (err: any) {
        log.warn('Calculator source unavailable', /** @type {any} */ (err)?.message);
        _renderCalculatorStatus('Falha ao carregar metricas do Calculator', 'error');
    }
}
async function _collectCalculatorParamOverrides() {
    const mapping = document.getElementById('sim-calculator-mapping');
    if (!mapping) return { overrides: {}, warnings: [] };
    const selectedMappings = PARAM_META.map((meta: any) => {
        const select = mapping.querySelector(`[name="sim-calc-map-${meta.key}"]`);
        return { meta, metricId: select?.value?.trim() || '' };
    }).filter((entry: any) => entry.metricId);
    if (selectedMappings.length === 0) return { overrides: {}, warnings: [] };
    try {
        const { computeAllCalculator, getCalculatorItemById } = await import('../../core/calculator/manager.js' as string);
        const computed = computeAllCalculator();
        const resultById = new Map(computed.map((result: any) => [result.id, result]));
        /** @type {Record<string, any>} */
        const overrides: any = {};
        /** @type {Array<string>} */
        const warnings: any[] = [];
        selectedMappings.forEach(({ meta, metricId }: any) => {
            const result: any = resultById.get(metricId);
            const metricLabel = (getCalculatorItemById(metricId))?.label || metricId;
            if (!result) {
                warnings.push(`Metrica nao encontrada: ${metricLabel}`) as any;
                return;
            }
            const raw = Number(result.value);
            if (!Number.isFinite(raw)) {
                warnings.push(`Metrica sem valor numerico: ${metricLabel}`);
                return;
            }
            const normalized = _normalizeParamValue(meta, meta.type === 'checkbox' ? raw >= 0.5 : raw);
            if (normalized === null) {
                warnings.push(`Valor invalido para ${meta.label}: ${metricLabel}`);
                return;
            }
            overrides[meta.key] = normalized;
        });
        return { overrides, warnings };
    } catch (err: any) {
        log.warn('Calculator override error', /** @type {any} */ (err)?.message);
        return {
            overrides: {},
            warnings: ['Falha ao ler dados do Calculator'],
        };
    }
}
async function _getSimulationParams(scenarioId: any) {
    let params = _readScenarioDefaultsFromDataset();
    if (!params) {
        const scenarioModule = (await import('../../core/analytics/scenarioSimulation/index.js' as string)) as any;
        params = scenarioModule.getScenarioParams(scenarioId) || {};
    }
    if (_getSelectedParamSource() === PARAM_SOURCE.CALCULATOR) {
        const { overrides, warnings } = await _collectCalculatorParamOverrides();
        if (warnings.length > 0) showToast(t('scenario.calculatorWarning', { warning: warnings[0] }), 'warning');
        return { ...(params as Record<string, any>), ...overrides };
    }
    const isEditing = document.getElementById('sim-edit-params-toggle')?.checked;
    if (isEditing) return _collectManualParamOverrides(params);
    return { ...(params as Record<string, any>) };
}
function _syncParamSourceVisibility(modal: any) {
    const source = modal?.querySelector('input[name="sim-param-source"]:checked')?.value || PARAM_SOURCE.RAW;
    const rawSection = modal?.querySelector('#sim-raw-params-section');
    const calculatorSection = modal?.querySelector('#sim-calculator-section');
    if (rawSection) rawSection.style.display = source === PARAM_SOURCE.RAW ? 'block' : 'none';
    if (calculatorSection) calculatorSection.style.display = source === PARAM_SOURCE.CALCULATOR ? 'block' : 'none';
}
// ----------------------------------------------------------------
// MODAL CREATION
// ----------------------------------------------------------------
function _buildScenarioModalHtml() {
    return `

    <div class="ecbt-dialog ecbt-dialog--lg scenario-simulation-dialog">
        <div class="ecbt-dialog-header">
            <h3>
                <span class="icon" data-icon="activity"></span>
                ${t('scenario.monteCarloTitle')}
            </h3>
            <button class="ecbt-dialog-close" data-cc-action="cc-ba5a7376">&times;</button>
        </div>

        <div class="ecbt-dialog-body" style="padding: 16px;">
            <!-- Cenario -->
            <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:12px;">
                <legend style="font-size:11px;font-weight:600;padding:0 8px;">${t('scenario.baseScenarioLegend')}</legend>
                <label style="display:block;margin-bottom:6px;font-size:11px;">
                    ${t('scenario.contaminationType')}
                    <select data-field-meta="true" data-field-meta-key="auto:sim-scenario" id="sim-scenario" style="width:100%;padding:6px;margin-top:4px;font-size:11px;">
                        ${_generateScenarioOptions()}
                    </select>
                </label>
                <div style="display:flex;gap:6px;margin-bottom:4px;">
                    <button type="button" id="sim-new-scenario-btn" class="btn btn-secondary" style="font-size:10px;padding:3px 8px;" title="${t('scenario.createNewScenarioTooltip')}">
                        + Novo cenário
                    </button>
                    <button type="button" id="sim-delete-scenario-btn" class="btn btn-secondary" style="font-size:10px;padding:3px 8px;display:none;color:#ef4444;border-color:#ef444430;" title="${t('scenario.deleteCustomScenarioTooltip')}">
                        &#x1F5D1; ${t('scenario.delete')}
                    </button>
                </div>
                <div id="sim-new-scenario-panel" style="display:none;margin-bottom:8px;padding:10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;">
                    <div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">${t('scenario.newCustomScenarioTitle')}</div>
                    <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;">${t('scenario.newScenarioHint')}</div>
                    <label style="display:block;margin-bottom:8px;font-size:11px;">
                        ${t('scenario.scenarioName')}
                        <input data-field-meta="true" data-field-meta-key="auto:sim-new-scenario-name" type="text" id="sim-new-scenario-name" placeholder="${t('scenario.scenarioNamePlaceholder')}"
                            style="width:100%;padding:6px;margin-top:4px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);box-sizing:border-box;">
                    </label>
                    <label style="display:block;margin-bottom:10px;font-size:11px;">
                        ${t('scenario.descriptionOptional')}
                        <input data-field-meta="true" data-field-meta-key="auto:sim-new-scenario-description" type="text" id="sim-new-scenario-description" placeholder="${t('scenario.describeContextPlaceholder')}"
                            style="width:100%;padding:6px;margin-top:4px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);box-sizing:border-box;">
                    </label>
                    <div style="font-size:9px;color:var(--text-muted);margin-bottom:10px;padding:6px;background:var(--bg-tertiary);border-radius:4px;">
                        ${t('scenario.editVariablesTip')}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button type="button" id="sim-save-new-scenario" class="btn btn-primary" style="font-size:11px;padding:5px 12px;">
                            ${t('scenario.saveScenario')}
                        </button>
                        <button type="button" id="sim-cancel-new-scenario" class="btn btn-secondary" style="font-size:11px;padding:5px 12px;">
                            ${t('scenario.cancel')}
                        </button>
                    </div>
                </div>

                <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
                    <div style="font-size:10px;color:var(--text-muted);margin-bottom:6px;">
                        ${t('scenario.parameterSource')}
                    </div>
                    <div style="display:flex;gap:16px;flex-wrap:wrap;">
                        <label style="font-size:11px;cursor:pointer;">
                            <input data-field-meta="true" data-field-meta-key="auto-name:sim-param-source" type="radio" name="sim-param-source" value="raw" checked style="margin-right:4px;">
                            ${t('scenario.rawScenarioData')}
                        </label>
                        <label style="font-size:11px;cursor:pointer;">
                            <input data-field-meta="true" data-field-meta-key="auto-name:sim-param-source" type="radio" name="sim-param-source" value="calculator" style="margin-right:4px;">
                            ${t('scenario.calculatorData')}
                        </label>
                    </div>
                </div>

                <div id="sim-raw-params-section" style="margin-top:10px;">
                    <label style="display:flex;align-items:center;gap:8px;font-size:11px;cursor:pointer;">
                        <input data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:input:L1444" type="checkbox" id="sim-edit-params-toggle" style="margin:0;">
                        <span>${t('scenario.editScenarioVariables')}</span>
                    </label>

                    <div id="sim-params-editor" style="display:none;margin-top:10px;" data-defaults="">
                        <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;">
                            ${t('scenario.adjustValuesHint')}
                        </div>
                        ${_renderParamEditorHtml({})}
                    </div>
                </div>

                <div id="sim-calculator-section" style="display:none;margin-top:10px;">
                    <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;">
                        Mapeie metricas do Calculator para cada variavel (campos sem mapeamento usam o valor do cenario).
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                        <button type="button" id="sim-refresh-calculator" class="btn btn-secondary" style="padding:4px 8px;font-size:10px;">
                            ${t('scenario.refreshMetrics')}
                        </button>
                        <span id="sim-calculator-status" style="font-size:10px;color:var(--text-muted);">
                            ${t('scenario.loadingMetrics')}
                        </span>
                    </div>
                    <div id="sim-calculator-mapping" style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
                        ${PARAM_META.map(
                            (m: any) => `
                            <label style="font-size:10px;display:flex;flex-direction:column;gap:3px;">
                                ${escapeHtml(m.label)}
                                <select data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:select:L1473" name="sim-calc-map-${m.key}" style="width:100%;padding:5px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);">
                                    <option value="">${t('scenario.usingScenarioValue')}</option>
                                </select>
                            </label>
                        `,
                        ).join('')}
                    </div>
                </div>
            </fieldset>

            <!-- Overlay Climático -->
            <fieldset style="border:1px solid #06b6d430;border-radius:6px;padding:12px;margin-bottom:12px;">
                <legend style="font-size:11px;font-weight:600;padding:0 8px;color:#06b6d4;">${t('scenario.climateOverlay')}</legend>
                <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;">
                    ${t('scenario.climateOverlayDescription')}
                </div>
                <label style="display:block;margin-bottom:6px;font-size:11px;">
                    ${t('scenario.climateCondition')}
                    <select data-field-meta="true" data-field-meta-key="auto:sim-overlay" id="sim-overlay" style="width:100%;padding:6px;margin-top:4px;font-size:11px;">
                        ${_generateOverlayOptions()}
                    </select>
                </label>
                <div style="display:flex;gap:6px;margin-bottom:4px;">
                    <button type="button" id="sim-new-overlay-btn" class="btn btn-secondary" style="font-size:10px;padding:3px 8px;" title="${t('scenario.createNewOverlayTooltip')}">
                        + Novo overlay
                    </button>
                    <button type="button" id="sim-delete-overlay-btn" class="btn btn-secondary" style="font-size:10px;padding:3px 8px;display:none;color:#ef4444;border-color:#ef444430;" title="${t('scenario.deleteCustomOverlayTooltip')}">
                        ${t('scenario.delete')}
                    </button>
                </div>
                <div id="sim-new-overlay-panel" style="display:none;margin-top:8px;padding:10px;background:var(--bg-secondary);border:1px solid #06b6d430;border-radius:6px;">
                    <div style="font-size:11px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">${t('scenario.newClimateOverlay')}</div>
                    <label style="display:block;margin-bottom:8px;font-size:11px;">
                        ${t('scenario.nameRequired')}
                        <input data-field-meta="true" data-field-meta-key="auto:sim-new-overlay-name" type="text" id="sim-new-overlay-name" placeholder="${t('scenario.extremeDroughtPlaceholder')}"
                            style="width:100%;padding:6px;margin-top:4px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);box-sizing:border-box;">
                    </label>
                    <label style="display:block;margin-bottom:8px;font-size:11px;">
                        ${t('scenario.descriptionOptional')}
                        <input data-field-meta="true" data-field-meta-key="auto:sim-new-overlay-description" type="text" id="sim-new-overlay-description" placeholder="${t('scenario.overlayContextPlaceholder')}"
                            style="width:100%;padding:6px;margin-top:4px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);box-sizing:border-box;">
                    </label>
                    <div style="font-size:10px;font-weight:600;color:#06b6d4;margin-bottom:4px;">${t('scenario.adders')}</div>
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:8px;">
                        ${['climateStress', 'seasonalAmplitude', 'climateTrend', 'extremeEventFreq']
                            .map(
                                (
                                    k: any,
                                ) => `<label style="font-size:10px;display:flex;flex-direction:column;gap:2px;">
                                ${escapeHtml(k)}
                                <input data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:input:L1522" type="number" name="sim-overlay-adder-${k}" step="0.01" value="0"
                                    style="padding:4px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);">
                            </label>`,
                            )
                            .join('')}
                    </div>
                    <div style="font-size:10px;font-weight:600;color:#06b6d4;margin-bottom:4px;">${t('scenario.multipliers')}</div>
                    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-bottom:10px;">
                        ${['dispersionRate', 'naturalDecayRate', 'failureProbability']
                            .map(
                                (
                                    k: any,
                                ) => `<label style="font-size:10px;display:flex;flex-direction:column;gap:2px;">
                                ${escapeHtml(k)} (&#215;)
                                <input data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:input:L1535" type="number" name="sim-overlay-mult-${k}" step="0.1" value="1" min="0"
                                    style="padding:4px;font-size:11px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);">
                            </label>`,
                            )
                            .join('')}
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button type="button" id="sim-save-new-overlay" class="btn btn-primary" style="font-size:11px;padding:5px 12px;">
                            ${t('scenario.saveOverlay')}
                        </button>
                        <button type="button" id="sim-cancel-new-overlay" class="btn btn-secondary" style="font-size:11px;padding:5px 12px;">
                            ${t('scenario.cancel')}
                        </button>
                    </div>
                </div>
            </fieldset>

            <!-- Modo -->
            <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:12px;">
                <legend style="font-size:11px;font-weight:600;padding:0 8px;">${t('scenario.simulationMode')}</legend>
                <div style="display:flex;gap:16px;margin-bottom:12px;">
                    <label style="font-size:11px;cursor:pointer;">
                        <input data-field-meta="true" data-field-meta-key="auto-name:sim-mode" type="radio" name="sim-mode" value="single" checked style="margin-right:4px;">
                        ${t('scenario.singleSimulation')}
                    </label>
                    <label style="font-size:11px;cursor:pointer;">
                        <input data-field-meta="true" data-field-meta-key="auto-name:sim-mode" type="radio" name="sim-mode" value="compare" style="margin-right:4px;">
                        ${t('scenario.compareStrategies')}
                    </label>
                </div>

                <!-- Decisões (mostrar apenas em modo compare) -->
                <div id="sim-decisions-container" style="display:none;">
                    <div style="font-size:10px;color:var(--text-muted);margin-bottom:8px;">
                        ${t('scenario.selectStrategiesToCompare')}
                    </div>
                    <div class="decisions-grid" style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;max-height:200px;overflow-y:auto;">
                        ${_generateDecisionCheckboxes()}
                    </div>
                    <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:6px;">
                        <button id="sim-new-decision-btn" class="btn btn-secondary" style="font-size:10px;width:100%;padding:3px 8px;">
                            + ${t('scenario.newDecision')}
                        </button>
                        <div id="sim-new-decision-panel" style="display:none;margin-top:8px;padding:10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:6px;">
                            <div style="font-size:10px;font-weight:600;margin-bottom:8px;">${t('scenario.newStrategicDecision')}</div>
                            <label style="font-size:10px;display:block;margin-bottom:6px;">Nome *
                                <input data-field-meta="true" data-field-meta-key="auto:sim-new-decision-name" id="sim-new-decision-name" type="text" placeholder="${t('scenario.decisionNamePlaceholder')}"
                                    style="width:100%;padding:4px;margin-top:2px;font-size:10px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);box-sizing:border-box;">
                            </label>
                            <label style="font-size:10px;display:block;margin-bottom:6px;">${t('scenario.description')}
                                <input data-field-meta="true" data-field-meta-key="auto:sim-new-decision-desc" id="sim-new-decision-desc" type="text"
                                    style="width:100%;padding:4px;margin-top:2px;font-size:10px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);box-sizing:border-box;">
                            </label>
                            <label style="font-size:10px;display:block;margin-bottom:8px;">${t('scenario.category')}
                                <select data-field-meta="true" data-field-meta-key="auto:sim-new-decision-tag" id="sim-new-decision-tag" style="width:100%;padding:4px;margin-top:2px;font-size:10px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);">
                                    <option value="custom">${t('scenario.custom')}</option>
                                    <option value="remediation">${t('scenario.remediation')}</option>
                                    <option value="monitoring">${t('scenario.monitoring')}</option>
                                    <option value="strategy">${t('scenario.strategy')}</option>
                                    <option value="financeiro">${t('scenario.financial')}</option>
                                    <option value="mitigation">${t('scenario.mitigation')}</option>
                                    <option value="adaptation">${t('scenario.adaptation')}</option>
                                </select>
                            </label>
                            <div style="font-size:10px;font-weight:600;margin-bottom:4px;">${t('scenario.modifiersEmptyNoChange')}</div>
                            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:4px;margin-bottom:10px;">
                                ${[
                                    'remediationEfficiency',
                                    'initialCost',
                                    'remediationOpex',
                                    'monitoringCost',
                                    'failureProbability',
                                    'naturalDecayRate',
                                ]
                                    .map(
                                        (k: any) => `<label style="font-size:9px;">${escapeHtml(k)}
                                        <input data-field-meta="true" data-field-meta-key="auto-pos:scenarioSimulation:input:L1612" type="number" name="sim-nd-mod-${k}" step="any"
                                            style="width:100%;padding:3px;margin-top:2px;font-size:9px;border:1px solid var(--border);border-radius:3px;background:var(--neutral-0);color:var(--text-primary);">
                                    </label>`,
                                    )
                                    .join('')}
                            </div>
                            <div style="display:flex;gap:6px;">
                                <button id="sim-save-new-decision" class="btn btn-primary" style="font-size:10px;flex:1;padding:4px 8px;">${t('scenario.save')}</button>
                                <button id="sim-cancel-new-decision" class="btn btn-secondary" style="font-size:10px;padding:4px 8px;">${t('scenario.cancel')}</button>
                            </div>
                        </div>
                    </div>
                </div>
            </fieldset>

            <!-- Configurações -->
            <fieldset style="border:1px solid var(--border);border-radius:6px;padding:12px;margin-bottom:12px;">
                <legend style="font-size:11px;font-weight:600;padding:0 8px;">${t('scenario.settings')}</legend>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:8px;">
                    <label style="font-size:11px;">
                        ${t('scenario.simulations')}
                        <input data-field-meta="true" data-field-meta-key="auto:sim-runs" type="number" id="sim-runs" value="100" min="50" max="1000" step="25"
                            style="width:100%;padding:6px;margin-top:4px;font-size:11px;"
                            data-cc-input="cc-8bc7be56">
                        <span id="sim-runs-warn" style="display:none;font-size:9px;color:#f59e0b;">${t('scenario.above300Warning')}</span>
                    </label>
                </div>

                <!-- Pesos do Score -->
                <details style="margin-bottom:8px;">
                    <summary style="font-size:10px;font-weight:600;cursor:pointer;color:var(--text-muted);user-select:none;">
                        ${t('scenario.scoreWeights')}
                        <span id="sim-weights-sum" style="margin-left:6px;font-size:9px;padding:1px 5px;border-radius:9px;background:var(--bg-tertiary);">&#8721; 100</span>
                    </summary>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px;">
                        ${['compliance', 'noFailure', 'costEfficiency', 'health', 'speed']
                            .map(
                                (k: any) => `<label style="font-size:9px;">${escapeHtml(k)}
                                <input data-field-meta="true" data-field-meta-key="auto-name:sim-weight" type="number" id="sim-weight-${k}" name="sim-weight" value="${(DEFAULT_WEIGHTS as Record<string,any>)[k]}"
                                    min="0" max="100" step="1" style="width:100%;padding:3px;margin-top:2px;font-size:9px;border:1px solid var(--border);border-radius:3px;background:var(--neutral-0);color:var(--text-primary);">
                            </label>`,
                            )
                            .join('')}
                    </div>
                    <div style="font-size:9px;color:var(--text-muted);margin-top:4px;">${t('scenario.relativeValuesHint')}</div>
                </details>

                <!-- Avançado: seed + orçamento -->
                <details style="margin-bottom:4px;">
                    <summary style="font-size:10px;font-weight:600;cursor:pointer;color:var(--text-muted);user-select:none;">${t('scenario.advanced')}</summary>
                    <div style="display:grid;grid-template-columns:1fr auto;gap:4px;align-items:end;margin-top:8px;">
                        <label style="font-size:10px;">
                            ${t('scenario.seedReproducibility')}
                            <input data-field-meta="true" data-field-meta-key="auto:sim-seed" type="number" id="sim-seed" placeholder="${t('scenario.emptyRandomPlaceholder')}" min="0" step="1"
                                style="width:100%;padding:4px;margin-top:2px;font-size:10px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);">
                        </label>
                        <button id="sim-seed-random-btn" class="btn btn-secondary" style="font-size:12px;padding:4px 8px;margin-bottom:2px;" title="${t('scenario.generateRandomSeed')}">&#x1F3B2;</button>
                    </div>
                    <label style="font-size:10px;display:block;margin-top:8px;">
                        ${t('scenario.totalBudget')}
                        <input data-field-meta="true" data-field-meta-key="auto:sim-budget" type="number" id="sim-budget" placeholder="${t('scenario.optionalUnlocksOverspend')}"
                            min="0" step="1000" style="width:100%;padding:4px;margin-top:2px;font-size:10px;border:1px solid var(--border);border-radius:4px;background:var(--neutral-0);color:var(--text-primary);">
                    </label>
                    <div style="font-size:9px;color:var(--text-muted);margin-top:4px;">${t('scenario.sameSeedSameRunsIdentical')}</div>
                </details>
            </fieldset>

            <!-- Resultados -->
            <div id="sim-results" style="margin-top:16px;"></div>
        </div>

        <div class="ecbt-dialog-footer" style="padding: 12px 16px; display: flex; gap: 8px; justify-content: flex-end;">
            <button class="btn btn-secondary" data-cc-action="cc-ea3cc851" title="${t('scenario.importCsvTooltip')}">
                <span class="icon" data-icon="upload"></span>
                ${t('scenario.importCsv')}
            </button>
            <button class="btn btn-secondary" data-cc-action="cc-ba5a7376">
                ${t('scenario.close')}
            </button>
            <button id="sim-btn-run" class="btn btn-primary" data-cc-action="cc-545f9f1e">
                <span class="icon" data-icon="play"></span>
                ${t('scenario.runSimulationBtn')}
            </button>
        </div>
    </div>

    `;
}

function _createModal() {
    const modal = document.createElement('div');
    modal.id = 'scenario-simulation-modal';
    modal.className = 'ecbt-overlay';
    modal.style.display = 'none';
    modal.onclick = (e: any) => {
        if (e.target === modal) handleCloseScenarioSimulationModal();
    };
    modal.innerHTML = _buildScenarioModalHtml();
    _attachModeToggleListeners(modal);
    _attachParamSourceListeners(modal);
    _attachScenarioListeners(modal);
    _attachScenarioPanelListeners(modal);
    _attachOverlayListeners(modal);
    _attachSeedAndWeightsListeners(modal);
    _attachDecisionPanelListeners(modal);
    _syncParamSourceVisibility(modal);
    _refreshCalculatorMappingOptions().catch((err: any) => {
        log.warn('Failed to preload calculator mapping', /** @type {any} */ (err)?.message);
    });
    return modal;
}
function _generateDecisionCheckboxes(decisions: any = undefined) {
    const all = (decisions ?? getAllDecisions()) as Array<any>;
    /** @type {Record<string, string>} */
    const tagLabels = {
        remediation: 'Remediação Ativa',
        monitoring: 'Monitoramento',
        strategy: 'Estratégias Combinadas',
        combo: 'Combos',
        financeiro: 'Gestão de Custos',
        mitigation: 'Mitigação Climática',
        adaptation: 'Adaptação Climática',
        ghg_reduction: 'Redução de Emissões GHG',
        custom: 'Personalizadas',
    };
    const tagOrder = [
        'remediation',
        'monitoring',
        'strategy',
        'combo',
        'financeiro',
        'mitigation',
        'adaptation',
        'ghg_reduction',
        'custom',
    ];
    /** @type {Record<string, Array<any>>} */
    const grouped: any = {};
    for (const d of all) {
        const tag = d.tag || 'outro';
        if (!grouped[tag]) grouped[tag] = [];
        grouped[tag].push(d);
    }
    const orderedTags = [...tagOrder, ...Object.keys(grouped).filter((t: any) => !tagOrder.includes(t))];
    return orderedTags
        .filter((tag: any) => grouped[tag])
        .map((tag: any) => {
            const label = (tagLabels as Record<string,any>)[tag] || tag;
            const items = grouped[tag]
                .map(
                    (
                        d: any,
                    ) => `<label style="font-size:10px;display:flex;align-items:flex-start;gap:4px;cursor:pointer;padding:4px;background:var(--bg-tertiary);border-radius:4px;" title="${escapeHtml(d.description || '')}">
            <input data-field-meta="true" data-field-meta-key="auto-name:sim-decisions" type="checkbox" name="sim-decisions" value="${escapeHtml(d.id)}" style="margin-top:2px;flex-shrink:0;">
            <span>${escapeHtml(d.name)}${d._custom ? ' <span style="font-size:8px;color:#a78bfa;">&#x270E;</span>' : ''}</span>
        </label>`,
                )
                .join('');
            return `<div style="grid-column:1/-1;font-size:9px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;margin-top:6px;margin-bottom:2px;padding-bottom:3px;border-bottom:1px solid var(--border);">${escapeHtml(label)}</div>${items}`;
        })
        .join('');
}
// ----------------------------------------------------------------
// CSV EXPORT / IMPORT
// ----------------------------------------------------------------
/**
 * Constrói CSV com dados brutos de todas as corridas (simulação única).
 * Formato: run,month,concentration,plumeRadius,health,compliance,cumulativeCost,failure
 *
 * @param {any} result - SimulationResult com .runs[]
 * @returns {string} CSV com BOM UTF-8
 */
function _buildSingleCSV(result: any) {
    const BOM = '\uFEFF';
    // Metadados de reprodutibilidade como comentário (# ignorado pelo parser)
    const seed = result.config?.seed;
    const numRuns = result.config?.numRuns ?? result.runs?.length;
    const budget = result.config?.budget;
    const meta = `# seed=${seed ?? 'random'},runs=${numRuns}${budget != null ? ',budget=' + budget : ''},score=${result.score?.score ?? ''},exported=${new Date().toISOString()}`;
    const header = 'run,month,concentration,plumeRadius,health,compliance,cumulativeCost,failure';
    const lines = [meta, header];
    for (let i = 0; i < result.runs.length; i++) {
        const run = result.runs[i];
        for (const t of run.T) {
            lines.push(
                [
                    i + 1,
                    t.m,
                    t.concentration.toFixed(2),
                    t.plumeRadius.toFixed(2),
                    t.health.toFixed(2),
                    t.compliance ? 1 : 0,
                    t.cumulativeCost.toFixed(2),
                    t.failure ? 1 : 0,
                ].join(','),
            );
        }
    }
    return BOM + lines.join('\n');
}
/**
 * Constrói CSV com percentis agregados por estratégia (modo comparação).
 * Formato: strategy,month,concentration_p10,...,cost_p50,cost_p90,health_p10,health_p50,health_p90
 *
 * @param {any} name - { baseline, comparisons[] }
 * @returns {string} CSV com BOM UTF-8
 */
function _csvEscapeName(name: string) {
    return '"' + name.replace(/"/g, '""') + '"';
}

function _buildComparisonCsvRow(secName: string, t: any) {
    return [
        _csvEscapeName(secName),
        t.month,
        ...['p10', 'p25', 'p50', 'p75', 'p90'].map((p: string) => (t.concentration?.[p] ?? 0).toFixed(2)),
        (t.cost?.p50 ?? 0).toFixed(2),
        (t.cost?.p90 ?? 0).toFixed(2),
        (t.health?.p10 ?? 0).toFixed(2),
        (t.health?.p50 ?? 0).toFixed(2),
        (t.health?.p90 ?? 0).toFixed(2),
    ].join(',');
}

function _buildComparisonCSV(comparison: any) {
    const BOM = '\uFEFF';
    const header =
        'strategy,month,concentration_p10,concentration_p25,concentration_p50,concentration_p75,concentration_p90,cost_p50,cost_p90,health_p10,health_p50,health_p90';
    const lines = [header];
    const sections = [
        { name: 'baseline', stats: comparison.baseline.stats },
        ...comparison.comparisons.map((c: any) => ({
            name: c.id || c.name,
            stats: c.stats,
        })),
    ];
    for (const sec of sections) {
        for (const t of sec.stats.timeline || []) {
            lines.push(_buildComparisonCsvRow(sec.name, t));
        }
    }
    return BOM + lines.join('\n');
}
async function handleExportMonteCarloCSV() {
    if (!_lastSimResult) {
        showToast(t('scenario.runSimulationFirst'), 'warning');
        return;
    }
    const csvContent =
        _lastSimMode === 'comparison' ? _buildComparisonCSV(_lastSimResult) : _buildSingleCSV(_lastSimResult);
    const slug = _lastSimScenarioName
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/gi, '_')
        .toLowerCase();
    const ts = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `montecarlo-${slug}-${ts}.csv`;
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], filename, { type: 'text/csv' });
    try {
        const { register } = await import('../files/fileManager.js' as string);
        const { renderFilesPanel } = await import('../files/filePanel.js' as string);
        const res = await register(file, {
            source: 'automation',
            tags: ['monte-carlo', 'simulation', 'csv'],
        });
        if (res.ok) {
            await renderFilesPanel();
            showToast(t('scenario.csvSavedInFilesTab'), 'success');
        } else if (res.code === 'files/not_authenticated') {
            _downloadBlob(blob, filename);
            showToast(t('scenario.csvDownloadedLoginRequired'), 'info');
        } else {
            showToast(res.error || t('scenario.errorSavingCsv'), 'error');
        }
    } catch (err: any) {
        log.warn('fileManager unavailable, falling back to download', /** @type {any} */ (err)?.message);
        _downloadBlob(blob, filename);
        showToast(t('scenario.csvDownloaded'), 'success');
    }
}
/**
 * Download direto de blob via link temporário.
 * @param {Blob} blob
 * @param {string} filename
 */
function _downloadBlob(blob: any,filename: any) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}
/**
 * Importa CSV de simulação Monte Carlo previamente exportada.
 * Reconstrói runs[], recalcula stats/score, e exibe resultados.
 */
async function _parseImportedCsv(file: File) {
    if (file.size > 10 * 1024 * 1024) {
        return { ok: false, error: t('scenario.fileExceeds10MB'), severity: 'error' };
    }
    let text = await file.text();
    text = text.replace(/^\uFEFF/, '');
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = text.split('\n').filter((l: any) => l.trim() && !l.trim().startsWith('#'));
    if (lines.length < 2) {
        return { ok: false, error: t('scenario.csvEmpty'), severity: 'error' };
    }
    const firstLine = lines[0] as string;
    const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ',';
    const headers = firstLine.split(sep).map((h: any) => h.trim().toLowerCase());
    if (headers.includes('strategy')) {
        return { ok: false, error: t('scenario.comparisonCsvsNotSupported'), severity: 'warning' };
    }
    const required = [
        'run',
        'month',
        'concentration',
        'plumeradius',
        'health',
        'compliance',
        'cumulativecost',
        'failure',
    ];
    const missing = required.filter((h: any) => !headers.includes(h));
    if (missing.length) {
        return { ok: false, error: t('scenario.missingColumns', { columns: missing.join(', ') }), severity: 'error' };
    }
    const colIdx = Object.fromEntries(required.map((h: any) => [h, headers.indexOf(h)]));
    const runsMap = new Map();
    let badRows = 0;
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i] as string;
        let cols = line.split(sep);
        if (sep === ';') cols = cols.map((c: any) => c.replace(',', '.'));
        const runId = parseInt(cols[colIdx.run]!);
        const month = parseInt(cols[colIdx.month]!);
        const conc = parseFloat(cols[colIdx.concentration]!);
        const radius = parseFloat(cols[colIdx.plumeradius]!);
        const hlth = parseFloat(cols[colIdx.health]!);
        const compl = parseInt(cols[colIdx.compliance]!);
        const cost = parseFloat(cols[colIdx.cumulativecost]!);
        const fail = parseInt(cols[colIdx.failure]!);
        if ([runId, month, conc, radius, hlth, cost].some((v: any) => isNaN(v))) {
            badRows++;
            continue;
        }
        if (!runsMap.has(runId)) runsMap.set(runId, []);
        runsMap.get(runId).push({
            m: month,
            concentration: conc,
            plumeRadius: radius,
            health: hlth,
            compliance: !!compl,
            cumulativeCost: cost,
            failure: !!fail,
        });
    }
    if (badRows > (lines.length - 1) * 0.1) {
        return { ok: false, error: t('scenario.tooManyInvalidRows', { bad: badRows, total: lines.length - 1 }), severity: 'error' };
    }
    for (const t of runsMap.values()) t.sort((a: any, b: any) => a.m - b.m);
    const monthCounts = [...runsMap.values()].map((t: any) => t.length);
    const uniqueCounts = new Set(monthCounts);
    const warnings: string[] = [];
    if (uniqueCounts.size > 1) {
        warnings.push(t('scenario.warningDifferentMonthCounts', { counts: [...uniqueCounts].join(', ') }));
    }
    const runs = _buildRunsFromImportedMap(runsMap);
    return { ok: true, runs, monthCounts, fileName: file.name, warnings };
}

function _buildRunsFromImportedMap(runsMap: Map<number, any[]>) {
    return [...runsMap.values()].map((T: any) => {
        const last = T[T.length - 1];
        const compEntry = T.find((t: any) => t.compliance);
        const compMonth = compEntry ? compEntry.m : -1;
        const failEntry = T.find((t: any) => t.failure);
        const failMonth = failEntry ? failEntry.m : -1;
        const maxR = Math.max(...T.map((t: any) => t.plumeRadius));
        return {
            T,
            F: {
                compliance: last.compliance,
                complianceMonth: compMonth,
                failure: T.some((t: any) => t.failure),
                failureMonth: failMonth,
                finalConcentration: last.concentration,
                finalHealth: last.health,
                maxRadius: maxR,
                totalCost: last.cumulativeCost,
                timeToCompliance: compMonth >= 0 ? compMonth : null,
                costEfficiency: compMonth >= 0 ? last.cumulativeCost / (compMonth + 1) : Infinity,
            },
        };
    });
}

async function handleImportMonteCarloCSV() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async () => {
        try {
            const file = input.files?.[0];
            if (!file) return;
            const parsed = await _parseImportedCsv(file);
            if (!parsed.ok) {
                showToast(parsed.error, parsed.severity || 'error');
                return;
            }
            for (const w of parsed.warnings || []) showToast(w, 'warning');
            const { calculateStats, calculateScore } =
                await import('../../core/analytics/scenarioSimulation/engine.js' as string);
            const runs = parsed.runs as any[];
            const fileName = parsed.fileName as string;
            const monthCounts = parsed.monthCounts as number[];
            const stats = calculateStats(runs);
            const score = calculateScore(stats);
            const result = { runs, stats, score };
            _lastSimResult = result;
            _lastSimMode = 'single';
            _lastSimScenarioName = fileName.replace(/\.csv$/i, '');
            _showResults(result);
            showToast(
                t('scenario.importedRunsMonths', { runs: runs.length, months: monthCounts[0] || '?' }),
                'success',
            );
        } catch (err: any) {
            log.error('Simulation CSV import failed', /** @type {any} */ (err).message);
            showToast(
                t('scenario.errorImportingCsv', { message: escapeHtml(/** @type {any} */ (err).message) }),
                'error',
            );
        }
    };
    input.click();
}

function _attachScenarioListeners(modal: any) {
    const scenarioSelect = modal.querySelector('#sim-scenario');
    if (scenarioSelect) {
        scenarioSelect.addEventListener('change', async (e: any) => {
            await _populateScenarioParams(e.target.value);
            _updateScenarioActionButtons(modal);
        });
        if (scenarioSelect.value) {
            _populateScenarioParams(scenarioSelect.value).catch((err: any) => {
                log.warn('Failed to populate initial params', /** @type {any} */ (err)?.message);
            });
        }
    }
    _updateScenarioActionButtons(modal);
    document.addEventListener('customScenarioChanged', () => {
        const select = modal?.querySelector('#sim-scenario');
        const currentId = select?.value;
        _refreshScenarioDropdown(modal, currentId);
    });
}

async function _handleSaveNewScenario(modal: any) {
    const name = modal.querySelector('#sim-new-scenario-name')?.value?.trim();
    if (!name) {
        showToast(t('scenario.enterScenarioName'), 'warning');
        return;
    }
    const id =
        name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 40) +
        '_' +
        Date.now().toString().slice(-6);
    const description = modal.querySelector('#sim-new-scenario-description')?.value?.trim() || '';
    const scenarioId = modal.querySelector('#sim-scenario')?.value;
    const params = await _getSimulationParams(scenarioId);
    const cleanParams: any = {};
    for (const meta of PARAM_META) {
        if (params[meta.key] !== undefined) cleanParams[meta.key] = params[meta.key];
    }
    const profile = { id, name, description, color: '#60a5fa', tags: ['custom'], params: cleanParams };
    try {
        const saved = upsertCustomScenario(profile);
        if (!saved) showToast(t('scenario.scenarioSavedExportBackup'), 'warning');
        else showToast(t('scenario.scenarioSaved', { name: escapeHtml(name) }), 'success');
        const newScenarioPanel = modal.querySelector('#sim-new-scenario-panel');
        const newScenarioBtn = modal.querySelector('#sim-new-scenario-btn');
        if (newScenarioPanel) newScenarioPanel.style.display = 'none';
        if (newScenarioBtn) newScenarioBtn.textContent = '+ ' + t('scenario.newScenario');
        _refreshScenarioDropdown(modal, id);
        await _populateScenarioParams(id);
    } catch (err: any) {
        log.error('Custom scenario save failed', /** @type {any} */ (err).message);
        showToast(t('errorWithMessage', { message: /** @type {any} */ (err).message }), 'error');
    }
}

async function _handleDeleteScenario(modal: any) {
    const select = modal.querySelector('#sim-scenario');
    const scenarioId = select?.value;
    if (!scenarioId) return;
    const profiles = (getAllScenarioProfiles()) as Array<any>;
    const profile = profiles.find((p: any) => p.id === scenarioId);
    if (!profile?._custom) {
        showToast(t('scenario.onlyCustomScenariosCanBeDeleted'), 'warning');
        return;
    }
    deleteCustomScenario(scenarioId);
    showToast(t('scenario.scenarioDeleted', { name: escapeHtml(profile.name) }), 'success');
    _refreshScenarioDropdown(modal, null);
    const firstOption = modal.querySelector('#sim-scenario option')?.value;
    if (firstOption) await _populateScenarioParams(firstOption);
}

function _attachScenarioPanelListeners(modal: any) {
    const newScenarioBtn = modal.querySelector('#sim-new-scenario-btn');
    const newScenarioPanel = modal.querySelector('#sim-new-scenario-panel');
    const cancelNewScenarioBtn = modal.querySelector('#sim-cancel-new-scenario');
    const saveNewScenarioBtn = modal.querySelector('#sim-save-new-scenario');
    const deleteScenarioBtn = modal.querySelector('#sim-delete-scenario-btn');
    if (newScenarioBtn && newScenarioPanel) {
        newScenarioBtn.addEventListener('click', () => {
            const isVisible = newScenarioPanel.style.display !== 'none';
            newScenarioPanel.style.display = isVisible ? 'none' : 'block';
            newScenarioBtn.textContent = isVisible ? '+ ' + t('scenario.newScenario') : '\u2715 ' + t('scenario.cancel');
        });
    }
    if (cancelNewScenarioBtn && newScenarioPanel) {
        cancelNewScenarioBtn.addEventListener('click', () => {
            newScenarioPanel.style.display = 'none';
            if (newScenarioBtn) newScenarioBtn.textContent = '+ ' + t('scenario.newScenario');
        });
    }
    if (saveNewScenarioBtn) saveNewScenarioBtn.addEventListener('click', async () => _handleSaveNewScenario(modal));
    if (deleteScenarioBtn) deleteScenarioBtn.addEventListener('click', async () => _handleDeleteScenario(modal));
}

function _buildCustomOverlayId(name: string) {
    return (
        'co_' +
        name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 36) +
        '_' +
        Date.now().toString().slice(-6)
    );
}

function _readOverlayAdders(modal: any) {
    const keys = ['climateStress', 'seasonalAmplitude', 'climateTrend', 'extremeEventFreq'];
    const adders: any = {};
    for (const k of keys) {
        const v = parseFloat(modal.querySelector(`[name="sim-overlay-adder-${k}"]`)?.value);
        if (!isNaN(v) && v !== 0) adders[k] = v;
    }
    return adders;
}

function _readOverlayMultipliers(modal: any) {
    const keys = ['dispersionRate', 'naturalDecayRate', 'failureProbability'];
    const multipliers: any = {};
    for (const k of keys) {
        const v = parseFloat(modal.querySelector(`[name="sim-overlay-mult-${k}"]`)?.value);
        if (!isNaN(v) && v !== 1) multipliers[k] = v;
    }
    return multipliers;
}

async function _handleSaveNewOverlay(modal: any) {
    const name = modal.querySelector('#sim-new-overlay-name')?.value?.trim();
    if (!name) {
        showToast(t('scenario.enterOverlayName'), 'warning');
        return;
    }
    const id = _buildCustomOverlayId(name);
    const description = modal.querySelector('#sim-new-overlay-description')?.value?.trim() || '';
    const adders = _readOverlayAdders(modal);
    const multipliers = _readOverlayMultipliers(modal);
    const profile = {
        id,
        name,
        description,
        color: '#06b6d4',
        tags: ['custom', 'climate'],
        adders,
        multipliers,
    };
    try {
        const saved = upsertCustomOverlay(profile);
        if (!saved) showToast(t('scenario.overlaySavedExportBackup'), 'warning');
        else showToast(t('scenario.overlaySaved', { name: escapeHtml(name) }), 'success');
        const newOverlayPanel = modal.querySelector('#sim-new-overlay-panel');
        const newOverlayBtn = modal.querySelector('#sim-new-overlay-btn');
        if (newOverlayPanel) newOverlayPanel.style.display = 'none';
        if (newOverlayBtn) newOverlayBtn.textContent = '+ ' + t('scenario.newOverlay');
        _refreshOverlayDropdown(modal, id);
        const scenarioId = modal.querySelector('#sim-scenario')?.value;
        if (scenarioId) await _populateScenarioParams(scenarioId);
    } catch (err: any) {
        log.error('Custom overlay save failed', /** @type {any} */ (err).message);
        showToast(t('errorWithMessage', { message: /** @type {any} */ (err).message }), 'error');
    }
}

async function _handleDeleteOverlay(modal: any) {
    const overlayId = modal.querySelector('#sim-overlay')?.value;
    if (!overlayId) return;
    const allOverlays = (getAllOverlays()) as Array<any>;
    const overlay = allOverlays.find((o: any) => o.id === overlayId);
    if (!overlay?._custom) {
        showToast(t('scenario.onlyCustomOverlaysCanBeDeleted'), 'warning');
        return;
    }
    deleteCustomOverlay(overlayId);
    showToast(t('scenario.overlayDeleted', { name: escapeHtml(overlay.name) }), 'success');
    _refreshOverlayDropdown(modal, null);
    const scenarioId = modal.querySelector('#sim-scenario')?.value;
    if (scenarioId) await _populateScenarioParams(scenarioId);
}

function _attachOverlayListeners(modal: any) {
    const overlaySelect = modal.querySelector('#sim-overlay');
    if (overlaySelect) {
        overlaySelect.addEventListener('change', async () => {
            const scenarioId = modal.querySelector('#sim-scenario')?.value;
            if (scenarioId) await _populateScenarioParams(scenarioId);
            _updateOverlayActionButtons(modal);
        });
    }
    _updateOverlayActionButtons(modal);
    const newOverlayBtn = modal.querySelector('#sim-new-overlay-btn');
    const newOverlayPanel = modal.querySelector('#sim-new-overlay-panel');
    const cancelNewOverlayBtn = modal.querySelector('#sim-cancel-new-overlay');
    const saveNewOverlayBtn = modal.querySelector('#sim-save-new-overlay');
    const deleteOverlayBtn = modal.querySelector('#sim-delete-overlay-btn');
    if (newOverlayBtn && newOverlayPanel) {
        newOverlayBtn.addEventListener('click', () => {
            const isVisible = newOverlayPanel.style.display !== 'none';
            newOverlayPanel.style.display = isVisible ? 'none' : 'block';
            newOverlayBtn.textContent = isVisible
                ? '+ ' + t('scenario.newOverlay')
                : '&#x2715; ' + t('scenario.cancel');
        });
    }
    if (cancelNewOverlayBtn && newOverlayPanel) {
        cancelNewOverlayBtn.addEventListener('click', () => {
            newOverlayPanel.style.display = 'none';
            if (newOverlayBtn) newOverlayBtn.textContent = '+ ' + t('scenario.newOverlay');
        });
    }
    if (saveNewOverlayBtn) saveNewOverlayBtn.addEventListener('click', async () => _handleSaveNewOverlay(modal));
    if (deleteOverlayBtn) deleteOverlayBtn.addEventListener('click', async () => _handleDeleteOverlay(modal));
    document.addEventListener('customOverlayChanged', () => {
        const select = modal?.querySelector('#sim-overlay');
        _refreshOverlayDropdown(modal, select?.value || null);
    });
    document.addEventListener('calculatorChanged', () => {
        _refreshCalculatorMappingOptions().catch((err: any) => {
            log.warn('Failed to refresh calculator mapping', /** @type {any} */ (err)?.message);
        });
    });
}

function _attachSeedAndWeightsListeners(modal: any) {
    modal.querySelector('#sim-seed-random-btn')?.addEventListener('click', () => {
        const inp = modal.querySelector('#sim-seed');
        if (inp) inp.value = Math.floor(Math.random() * 1e9);
    });
    const weightInputs = modal.querySelectorAll('input[name="sim-weight"]');
    const weightSumEl = modal.querySelector('#sim-weights-sum');
    function _syncWeightSum() {
        const sum = [...weightInputs].reduce(
            (s: any, i: any) => s + (parseFloat(i.value) || 0),
            0,
        );
        if (weightSumEl) {
            weightSumEl.textContent = t('scenario.sum', { value: Math.round(sum) });
            weightSumEl.style.color = Math.abs(sum - 100) < 1 ? 'var(--success, #34d399)' : '#f59e0b';
        }
    }
    const savedW = _loadSimWeights();
    for (const [k, v] of Object.entries(savedW)) {
        const inp = modal.querySelector(`#sim-weight-${k}`);
        if (inp) inp.value = v;
    }
    _syncWeightSum();
    weightInputs.forEach((inp: any) => inp.addEventListener('input', _syncWeightSum));
}

async function _handleSaveNewDecision(modal: any, resetPanel: () => void) {
    const name = modal.querySelector('#sim-new-decision-name')?.value?.trim();
    if (!name) {
        showToast(t('scenario.enterDecisionName'), 'warning');
        return;
    }
    const id =
        'cd_' +
        name
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 32) +
        '_' +
        Date.now().toString().slice(-6);
    const mods: any = {};
    for (const k of [
        'remediationEfficiency',
        'initialCost',
        'remediationOpex',
        'monitoringCost',
        'failureProbability',
        'naturalDecayRate',
    ]) {
        const v = parseFloat(modal.querySelector(`[name="sim-nd-mod-${k}"]`)?.value);
        if (!isNaN(v)) mods[k] = v;
    }
    try {
        upsertCustomDecision({
            id,
            name,
            description: modal.querySelector('#sim-new-decision-desc')?.value?.trim() || '',
            tag: modal.querySelector('#sim-new-decision-tag')?.value || 'custom',
            mods,
        });
        showToast(t('scenario.decisionSaved', { name: escapeHtml(name) }), 'success');
        resetPanel();
        const grid = modal.querySelector('.decisions-grid');
        if (grid) grid.innerHTML = _generateDecisionCheckboxes();
    } catch (err: any) {
        log.error('Custom decision save failed', /** @type {any} */ (err).message);
        showToast(t('errorWithMessage', { message: /** @type {any} */ (err).message }), 'error');
    }
}

function _attachDecisionPanelListeners(modal: any) {
    const newDecBtn = modal.querySelector('#sim-new-decision-btn');
    const newDecPanel = modal.querySelector('#sim-new-decision-panel');
    function _resetNewDecisionPanel() {
        if (newDecPanel) newDecPanel.style.display = 'none';
        if (newDecBtn) newDecBtn.textContent = '+ ' + t('scenario.newDecision');
        modal.querySelectorAll('[name^="sim-nd-mod-"]').forEach((i: any) => (i.value = ''));
        const nameEl = modal.querySelector('#sim-new-decision-name');
        const descEl = modal.querySelector('#sim-new-decision-desc');
        if (nameEl) nameEl.value = '';
        if (descEl) descEl.value = '';
    }
    newDecBtn?.addEventListener('click', () => {
        const open = newDecPanel?.style.display !== 'none';
        if (newDecPanel) newDecPanel.style.display = open ? 'none' : 'block';
        if (newDecBtn)
            newDecBtn.textContent = open ? '+ ' + t('scenario.newDecision') : '\u2715 ' + t('scenario.close');
    });
    modal.querySelector('#sim-cancel-new-decision')?.addEventListener('click', _resetNewDecisionPanel);
    modal.querySelector('#sim-save-new-decision')?.addEventListener('click', async () => {
        await _handleSaveNewDecision(modal, _resetNewDecisionPanel);
    });
}

function _attachModeToggleListeners(modal: any) {
    modal.querySelectorAll('input[name="sim-mode"]').forEach((radio: any) => {
        radio.addEventListener('change', (e: any) => {
            const container = modal.querySelector('#sim-decisions-container');
            if (container) container.style.display = e.target.value === 'compare' ? 'block' : 'none';
        });
    });
}

function _attachParamSourceListeners(modal: any) {
    const editToggle = modal.querySelector('#sim-edit-params-toggle');
    const paramsEditor = modal.querySelector('#sim-params-editor');
    if (editToggle && paramsEditor) {
        editToggle.addEventListener('change', (e: any) => {
            paramsEditor.style.display = e.target.checked ? 'block' : 'none';
        });
    }
    modal.querySelectorAll('input[name="sim-param-source"]').forEach((radio: any) => {
        radio.addEventListener('change', async () => {
            _syncParamSourceVisibility(modal);
            if (radio.checked && radio.value === PARAM_SOURCE.CALCULATOR) {
                await _refreshCalculatorMappingOptions();
            }
        });
    });
    const refreshCalculatorBtn = modal.querySelector('#sim-refresh-calculator');
    if (refreshCalculatorBtn) {
        refreshCalculatorBtn.addEventListener('click', async () => {
            await _refreshCalculatorMappingOptions();
        });
    }
}

// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const scenarioSimulationHandlers = {
    handleOpenScenarioSimulationModal,
    handleCloseScenarioSimulationModal,
    handleRunScenarioSimulation,
    handleExportMonteCarloCSV,
    handleImportMonteCarloCSV,
};
