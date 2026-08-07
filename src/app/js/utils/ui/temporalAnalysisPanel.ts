// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Module: Temporal Analysis Panel - D2 UI
// Painel de análise estatística temporal de KPIs ambientais
import { autoSelectTest } from '../../core/analytics/temporalAnalysis.js';
import { getAllElements } from '../../core/elements/manager.js';
import { showToast } from './toast.js';
import { t } from '../i18n/translations.js';
import {
    clearTrainingReturnBanner,
    normalizeTrainingReturnContext,
    renderTrainingReturnBanner,
    type TrainingReturnContext,
} from './trainingReturnContext.js';
// ================================================================
// STATE
// ================================================================
const _state: any = {
    isRunning: false,
    lastResult: null,
    values: [], // série temporal atual
    groups: null, // grupos para comparação (opcional)
    period: null, // sazonalidade (null = sem)
    alpha: 0.05,
    teacherResultFocus: false,
};
let _lastTemporalTrainingReturnContext: TrainingReturnContext | null = null;

interface TemporalTeachingDemo {
    readonly title: string;
    readonly description: string;
    readonly values: readonly number[];
    readonly unit: string;
    readonly sourceLabel: string;
}

function _buildIntroModule01TemporalDemo(context: TrainingReturnContext | null): TemporalTeachingDemo | null {
    if (!context?.hasContext) return null;
    const raw = context.rawInput as Record<string, unknown> | null;
    const corpus = [
        context.source,
        context.purpose,
        context.presetId,
        context.label,
        raw && typeof raw === 'object' ? String(raw.elementId || '') : '',
        raw && typeof raw === 'object' ? String(raw.method || '') : '',
    ].join(' ');
    if (!/training|class-demo|m01\.temporal\.na\.mann-kendall|pm-na-class-series|mann/i.test(corpus)) return null;
    return {
        title: 'Serie demonstrativa de NA - PM-01',
        description: 'Dados didaticos carregados pelo preset do Modulo 01 para explicar tendencia temporal sem montar a serie durante a aula.',
        unit: 'm',
        sourceLabel: '12 campanhas trimestrais',
        values: [2.1, 2.18, 2.31, 2.36, 2.49, 2.58, 2.72, 2.81, 2.95, 3.02, 3.18, 3.27],
    };
}

function _applyTemporalTeachingDemo(demo: TemporalTeachingDemo | null): void {
    if (!demo || typeof document === 'undefined') return;
    _state.values = [...demo.values];
    document.querySelector('.temporal-panel')?.classList.add('temporal-panel--teacher-result-first');
    const section = document.querySelector('#temporal-view-individual .temporal-inputs');
    if (section && !section.querySelector('.temporal-teaching-demo')) {
        const banner = document.createElement('div');
        banner.className = 'temporal-teaching-demo';
        banner.innerHTML = `
            <strong>${demo.title}</strong>
            <span>${demo.sourceLabel} - ${demo.description}</span>
        `;
        const h4 = section.querySelector('h4');
        h4?.insertAdjacentElement('afterend', banner);
    }
    const details = document.querySelector('.temporal-manual-fallback') as HTMLDetailsElement | null;
    if (details) details.open = true;
    const input = document.getElementById('temporal-values-input') as HTMLTextAreaElement | null;
    if (input) {
        input.value = demo.values.map((value) => value.toFixed(2)).join(', ');
        input.setAttribute('aria-label', `${demo.title} (${demo.unit})`);
    }
}

function _focusTemporalTeachingResult(): void {
    if (typeof document === 'undefined') return;
    if (!_state.teacherResultFocus && !document.querySelector('.temporal-teaching-demo')) return;
    const panel = document.querySelector('.temporal-panel');
    const results = document.getElementById('temporal-results');
    const inputs = document.querySelector('#temporal-view-individual .temporal-inputs');
    if (!panel || !results || !inputs) return;
    panel.classList.add('temporal-panel--teacher-result-first');
    inputs.insertAdjacentElement('beforebegin', results);
    const modalBody = document.getElementById('temporal-analysis-body');
    if (modalBody) modalBody.scrollTop = 0;
}

function _renderTemporalTrainingReturnContext(context: TrainingReturnContext | null): void {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('temporal-analysis-panel');
    if (!host) return;
    if (context?.hasContext) {
        renderTrainingReturnBanner({ host, context, source: 'temporal-analysis' });
    } else {
        clearTrainingReturnBanner(host);
    }
}
// ================================================================
// OPEN / CLOSE
// ================================================================
/**
 * Opens the temporal analysis modal and renders the panel
 * Abre o modal de análise temporal e renderiza o painel
 */
export function openTemporalAnalysis(input?: unknown) {
    const trainingContext = normalizeTrainingReturnContext(input, {
        label: 'Mann-Kendall da aula',
        returnLabel: 'Voltar ao slide',
    });
    _lastTemporalTrainingReturnContext = trainingContext.hasContext ? trainingContext : null;
    const modal = (document.getElementById('temporal-analysis-modal')) as any;
    if (!modal)
        return;
    _state.values = []; // reset — evita análise com dados de sessão anterior
    _state.teacherResultFocus = false;
    renderPanel();
    _renderTemporalTrainingReturnContext(_lastTemporalTrainingReturnContext);
    const teachingDemo = _buildIntroModule01TemporalDemo(_lastTemporalTrainingReturnContext);
    _applyTemporalTeachingDemo(teachingDemo);
    _state.teacherResultFocus = Boolean(teachingDemo);
    modal.style.display = 'flex';
    if (teachingDemo) {
        setTimeout(() => {
            void runTemporalAnalysis();
        }, 0);
    }
    // Fechar com ESC
    /**
     * @param {any} e
     */
    const onKey = (e: any) => {
        if (e.key === 'Escape') {
            closeTemporalAnalysis();
            document.removeEventListener('keydown', onKey);
        }
    };
    document.addEventListener('keydown', onKey);
}
/**
 * Closes the temporal analysis modal
 * Fecha o modal de análise temporal
 */
export function closeTemporalAnalysis() {
    const modal = (document.getElementById('temporal-analysis-modal')) as any;
    if (modal)
        modal.style.display = 'none';
}
// ================================================================
// RENDER
// ================================================================
/**
 * Renders the panel content into #temporal-analysis-panel
 * Renderiza o conteúdo do painel com seletores de elemento/parâmetro do modelo
 */
function renderPanel() {
    const container = (document.getElementById('temporal-analysis-panel')) as any;
    if (!container)
        return;
    // Construir opções de elementos com observações
    const elements = getAllElements ? getAllElements() : [];
    const elementsWithObs = elements.filter((/** @type {any} */ el) => el.data?.observations && el.data.observations.length > 0);
    const elementOptions = elementsWithObs.length > 0
        ? elementsWithObs
            .map((/** @type {any} */ el) => `<option value="${el.id}">${el.name || el.id} (${el.data.observations.length} obs.)</option>`)
            .join('')
        : `<option value="">— nenhum elemento com dados —</option>`;
    const emptyState = `
        <div class="temporal-empty-state">
            <div class="temporal-empty-icon">&#9203;</div>
            <div class="temporal-empty-title">Nenhum dado dispon&#237;vel</div>
            <div class="temporal-empty-sub">Adicione observa&#231;&#245;es a um elemento do modelo para analisar a s&#233;rie temporal.</div>
        </div>`;
    const modelSource = elementsWithObs.length > 0
        ? `
        <div class="temporal-model-source">
            <div class="temporal-row">
                <label for="temporal-element-select">Elemento do modelo:</label>
                <select data-field-meta="true" data-field-meta-key="auto:temporal-element-select" id="temporal-element-select"
                    data-cc-change="cc-1f21a5a5">
                    <option value="">Selecione um elemento...</option>
                    ${elementOptions}
                </select>
            </div>
            <div class="temporal-row" id="temporal-param-row" style="display:none">
                <label for="temporal-param-select">Par&#226;metro:</label>
                <select data-field-meta="true" data-field-meta-key="auto:temporal-param-select" id="temporal-param-select"
                    data-cc-change="cc-18aff7d4">
                </select>
            </div>
        </div>`
        : emptyState;
    const manualFallback = `
        <details class="temporal-manual-fallback">
            <summary>${elementsWithObs.length > 0 ? t('temporal.orEnterManual') : t('temporal.enterManual')}</summary>
            <div class="temporal-row">
                <label for="temporal-values-input">${t('temporal.valuesLabel')}</label>
                <textarea data-field-meta="true" data-field-meta-key="auto:temporal-values-input" id="temporal-values-input" rows="3"
                    placeholder="${t('temporal.valuesPlaceholder')}"></textarea>
            </div>
        </details>`;
    container.innerHTML = `
        <div class="temporal-panel">
            <div class="temporal-tabs">
                <button class="temporal-tab active" id="temporal-tab-individual"
                    data-cc-action="cc-9336a2ee">${t('temporal.individualTab')}</button>
                <button class="temporal-tab" id="temporal-tab-matrix"
                    data-cc-action="cc-e6960328">${t('temporal.matrixTab')}</button>
            </div>

            <div id="temporal-view-individual">
                <section class="temporal-section temporal-inputs">
                    <h4>${t('temporalDataInput') || 'Dados para An&#225;lise'}</h4>
                    ${modelSource}
                    ${manualFallback}
                    <div class="temporal-options">
                        <div class="temporal-opt-group">
                            <label for="temporal-alpha-select">${t('temporalAlpha') || 'N&#237;vel de signific&#226;ncia (&#945;):'}</label>
                            <select data-field-meta="true" data-field-meta-key="auto:temporal-alpha-select" id="temporal-alpha-select">
                                <option value="0.01">0.01 (99%)</option>
                                <option value="0.05" selected>0.05 (95%)</option>
                                <option value="0.10">0.10 (90%)</option>
                            </select>
                        </div>
                        <div class="temporal-opt-group">
                            <label for="temporal-period-select">${t('temporalPeriod') || 'Sazonalidade:'}</label>
                            <select data-field-meta="true" data-field-meta-key="auto:temporal-period-select" id="temporal-period-select">
                                <option value="">Nenhuma</option>
                                <option value="4">Trimestral (4)</option>
                                <option value="12">Mensal (12)</option>
                                <option value="52">Semanal (52)</option>
                            </select>
                        </div>
                    </div>
                    <div class="temporal-actions">
                        <button class="btn btn-primary" id="temporal-run-btn"
                            data-cc-action="cc-cd8f96c7">
                            <span class="icon" data-icon="play"></span>
                            ${t('runAnalysis') || 'Analisar'}
                        </button>
                        <button class="btn btn-secondary"
                            data-cc-action="cc-f937e1cf">
                            <span class="icon" data-icon="x"></span>
                            ${t('clear') || 'Limpar'}
                        </button>
                    </div>
                </section>
                <div id="temporal-results"><div class="temporal-section-results">
                    <div class="temporal-results-header"><span>Resultado</span><span id="temporal-n-badge"></span></div>
                    <div class="temporal-results-body">
                        <div id="temporal-recommendation"></div>
                        <div id="temporal-results-grid" class="temporal-results-grid"></div>
                        <div id="temporal-chart-area"></div>
                    </div>
                </div></div>
            </div>

            <div id="temporal-view-matrix" style="display:none">
                <section class="temporal-section">
                    <div class="temporal-matrix-toolbar">
                        <div class="temporal-opt-group">
                            <label for="temporal-matrix-alpha">Signific&#226;ncia (&#945;):</label>
                            <select data-field-meta="true" data-field-meta-key="auto:temporal-matrix-alpha" id="temporal-matrix-alpha">
                                <option value="0.01">0.01</option>
                                <option value="0.05" selected>0.05</option>
                                <option value="0.10">0.10</option>
                            </select>
                        </div>
                        <button class="btn btn-primary" id="temporal-matrix-run-btn"
                            data-cc-action="cc-35ed5af8">
                            <span class="icon" data-icon="grid"></span>
                            Calcular Matriz
                        </button>
                    </div>
                    <div class="temporal-matrix-legend">
                        <span class="tmc tmc-up">&#8593; Crescente</span>
                        <span class="tmc tmc-down">&#8595; Decrescente</span>
                        <span class="tmc tmc-flat">&#9135; Sem tend.</span>
                        <span class="tmc tmc-break">&#9888; Ruptura</span>
                        <span class="tmc tmc-outlier">&#9650; Outlier</span>
                        <span class="tmc tmc-none">— Insuf.</span>
                    </div>
                </section>
                <div id="temporal-matrix-result"></div>
            </div>
        </div>
    `;
    // Ocultar results inicialmente
    const results = (document.getElementById('temporal-results')) as any;
    if (results)
        results.style.display = 'none';
    // Hidratar ícones
    if (window.hydrateIcons)
        window.hydrateIcons(container);
}
// ================================================================
// RUN ANALYSIS
// ================================================================
// ================================================================
// MODEL SOURCE HANDLERS
// ================================================================
/**
 * Handles element selection - populates parameter dropdown
 * Preenche o dropdown de parâmetros ao selecionar um elemento
 * @param {string} elementId
 */
export function onTemporalElementChange(elementId: any) {
    const paramRow = (document.getElementById('temporal-param-row')) as any;
    const paramSelect = (document.getElementById('temporal-param-select')) as any;
    _state.values = []; // limpa valores de seleção anterior
    if (!elementId) {
        if (paramRow)
            paramRow.style.display = 'none';
        return;
    }
    const elements = getAllElements ? getAllElements() : [];
    const el = elements.find((e: any) => e.id === elementId);
    if (!el || !el.data?.observations || el.data.observations.length === 0)
        return;
    // Coletar parâmetros únicos das observações
    const paramIds = [...new Set(el.data.observations.map((o: any) => o.parameterId).filter(Boolean))];
    if (paramIds.length === 0) {
        showToast(t('temporal.noParametersDefined'), 'warning');
        return;
    }
    if (paramSelect) {
        paramSelect.innerHTML = paramIds
            .map((pid: any) => `<option value="${pid}">${pid}</option>`)
            .join('');
    }
    if (paramRow)
        paramRow.style.display = 'block';
    // Auto-carregar o primeiro parâmetro
    _loadValuesFromElement(elementId, paramIds[0]);
}
/**
 * Handles parameter selection - loads values into textarea
 * Carrega os valores do parâmetro selecionado na textarea
 * @param {string} parameterId
 */
export function onTemporalParamChange(parameterId: any) {
    const elementSelect = (document.getElementById('temporal-element-select')) as any;
    if (!elementSelect || !elementSelect.value)
        return;
    _loadValuesFromElement(elementSelect.value, parameterId);
}
/**
 * Loads observation values for a given element+parameter into the textarea
 * Carrega observações de elemento+parâmetro na textarea, ordenadas por data
 * @param {string} elementId
 * @param {string} parameterId
 */
function _loadValuesFromElement(elementId: any, parameterId: any) {
    const elements = getAllElements ? getAllElements() : [];
    const el = elements.find((e: any) => e.id === elementId);
    if (!el)
        return;
    const obs = (el.data?.observations || [])
        .filter((o: any) => o.parameterId === parameterId && o.value != null)
        .sort((a: any, b: any) => (a.date || a.timestamp || '').localeCompare(b.date || b.timestamp || ''));
    if (obs.length === 0) {
        showToast(t('temporal.noDataFoundForParameter'), 'warning');
        return;
    }
    _state.values = obs.map((o: any) => Number(o.value));
    showToast(t('temporal.observationsLoaded', { count: obs.length, parameterId }), 'info');
}
// ================================================================
// RUN ANALYSIS
// ================================================================
/**
 * Reads inputs and runs autoSelectTest
 * Lê os inputs do painel e executa a análise estatística
 */
export async function runTemporalAnalysis() {
    if (_state.isRunning)
        return;
    // Prioridade: dados do modelo (_state.values). Fallback: textarea manual.
    let values: any[] = _state.values.filter((v: any) => Number.isFinite(v));
    if (values.length === 0) {
        const rawInput = (document.getElementById('temporal-values-input') as HTMLTextAreaElement | null)?.value || '';
        values = rawInput
            .split(/[\n,;]+/)
            .map((s: any) => parseFloat(s.trim()))
            .filter((v: any) => Number.isFinite(v)) as any;
    }
    if (values.length < 3) {
        showToast(t('temporalInsufficient') || 'Mínimo 3 valores. Selecione um elemento ou insira manualmente.', 'warning');
        return;
    }
    const alpha = parseFloat((document.getElementById('temporal-alpha-select') as HTMLSelectElement | null)?.value || '0.05');
    const periodRaw = (document.getElementById('temporal-period-select') as HTMLSelectElement | null)?.value;
    const period = periodRaw ? parseInt(periodRaw, 10) : null;
    _state.values = values as any;
    _state.alpha = alpha;
    (_state.period as any) = period;
    _state.isRunning = true;
    const btn = (document.getElementById('temporal-run-btn')) as any;
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('temporal.calculating');
    }
    try {
        const result = await autoSelectTest(values, null, { alpha, period });
        _state.lastResult = result;
        renderResults(result, values);
        _focusTemporalTeachingResult();
    }
    catch (err: any) {
        showToast(t('temporal.errorAnalysis', { message: /** @type {any} */ (err).message }), 'error');
        console.error('[temporalAnalysis]', err);
    }
    finally {
        _state.isRunning = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML =
                '<span class="icon" data-icon="play"></span>' + (t('runAnalysis') || t('temporal.runAnalysis'));
            if (window.hydrateIcons && btn)
                window.hydrateIcons(btn.parentElement);
        }
    }
}
/**
 * Clears the input and results
 * Limpa o input e os resultados
 */
export function clearTemporalAnalysis() {
    const results = (document.getElementById('temporal-results')) as any;
    if (results)
        results.style.display = 'none';
    const input = (document.getElementById('temporal-values-input')) as any;
    if (input)
        input.value = '';
    _state.lastResult = null;
    _state.values = [];
}
// ================================================================
// RENDER RESULTS
// ================================================================
/**
 * Renders analysis results in the panel
 * Renderiza os resultados da análise no painel
 * @param {any} result - output de autoSelectTest
 * @param {number[]} values
 */
function renderResults(result: any, values: any[]) {
    const section = (document.getElementById('temporal-results')) as any;
    if (!section)
        return;
    section.style.display = 'block';
    // Badge com n
    const badge = (document.getElementById('temporal-n-badge')) as any;
    if (badge)
        badge.textContent = t('temporal.nEquals', { count: values.length });
    // Recomendação principal
    const rec = (document.getElementById('temporal-recommendation')) as any;
    if (rec) {
        const trendIcon = _getTrendIcon(result.allResults?.mannKendall?.trend);
        rec.innerHTML = `
            <div class="temporal-rec-box">
                <div class="temporal-rec-test">${trendIcon} ${result.recommendedTest || '—'}</div>
                <div class="temporal-rec-reason">${result.reason || ''}</div>
            </div>
        `;
    }
    // Grid de resultados
    const grid = (document.getElementById('temporal-results-grid')) as any;
    if (grid) {
        grid.innerHTML = _buildResultsGrid(result.allResults, values);
    }
    // Gráfico simples ASCII-like em HTML
    const chartArea = (document.getElementById('temporal-chart-area')) as any;
    if (chartArea) {
        const pettitt = result.allResults?.pettitt;
        const changeIndex = pettitt?.significant === true ? pettitt.changeIndex : -1;
        chartArea.innerHTML = _buildMiniChart(values, changeIndex);
    }
    // Hidratar ícones novos
    if (window.hydrateIcons)
        window.hydrateIcons(section);
}
/**
 * Builds a grid of test result cards
 * Constrói o grid de cartões de resultados dos testes
 */
function _buildResultsGrid(results: any, values: any[]) {
    if (!results)
        return '';
    /**
     * @param {any} values
     */
    const fmt = (v: any) => v != null ? (typeof v === 'number' ? v.toFixed(3) : v) : '—';
    const cards = [];
    // Normalidade
    if (results.normality) {
        const r = results.normality;
        const icon = r.normal ? '&#10003;' : '&#10007;';
        const cls = r.normal ? 'result-pass' : 'result-fail';
        const normHint = r.normal
            ? 'Os dados seguem distribuição normal (curva em sino). Isso autoriza o uso de testes paramétricos mais robustos.'
            : 'Os dados não seguem distribuição normal. Serão usados testes não-paramétricos, que não exigem essa suposição.';
        cards.push(`
            <div class="result-card ${cls}">
                <div class="result-card-title">${r.method === 'Shapiro-Wilk' || r.W != null ? 'Shapiro-Wilk' : 'Kolmogorov-Smirnov'}</div>
                <div class="result-card-value">${icon} ${r.normal ? 'Normal' : 'Não-normal'}</div>
                <div class="result-card-detail">W=${fmt(r.W ?? r.D)} &nbsp; p=${fmt(r.pValue)}</div>
                <div class="result-card-hint">${normHint}</div>
            </div>
        `);
    }
    // Mann-Kendall
    if (results.mannKendall) {
        const r = results.mannKendall;
        const icon = r.trend === 'no trend' ? '&#9135;' : r.trend === 'increasing' ? '&#8593;' : '&#8595;';
        const cls = r.pValue < 0.05 ? 'result-warn' : 'result-neutral';
        const mkHint = r.trend === 'no trend'
            ? 'Não há tendência consistente ao longo do tempo. Os valores sobem e descem sem direção definida.'
            : r.trend === 'increasing'
                ? 'Os valores tendem a aumentar ao longo do tempo — possível agravamento da concentração ou do parâmetro monitorado.'
                : 'Os valores tendem a diminuir ao longo do tempo — possível melhora ou redução da concentração monitorada.';
        cards.push(`
            <div class="result-card ${cls}">
                <div class="result-card-title">Mann-Kendall</div>
                <div class="result-card-value">${icon} ${r.trend === 'no trend' ? 'Sem tendência' : r.trend === 'increasing' ? 'Crescente' : 'Decrescente'}</div>
                <div class="result-card-detail">Z=${fmt(r.Z)} &nbsp; p=${fmt(r.pValue)}</div>
                <div class="result-card-hint">${mkHint}</div>
            </div>
        `);
    }
    // Pettitt
    if (results.pettitt) {
        const r = results.pettitt;
        const cls = r.significant ? 'result-warn' : 'result-neutral';
        const pettittHint = r.significant
            ? `Detectada uma mudança abrupta no nível da série a partir da posição ${r.changeIndex}. Pode indicar evento pontual (derramamento, chuva intensa, mudança operacional).`
            : 'Nenhuma mudança abrupta identificada. A série evoluiu de forma contínua sem saltos significativos.';
        cards.push(`
            <div class="result-card ${cls}">
                <div class="result-card-title">Pettitt (Ruptura)</div>
                <div class="result-card-value">${r.significant ? '&#9888; Ruptura detectada' : '&#10003; Sem ruptura'}</div>
                <div class="result-card-detail">Índice=${fmt(r.changeIndex)} &nbsp; p=${fmt(r.pValue)}</div>
                <div class="result-card-hint">${pettittHint}</div>
            </div>
        `);
    }
    // Grubbs
    if (results.grubbs) {
        const r = results.grubbs;
        const cls = r.reject ? 'result-warn' : 'result-neutral';
        const grubbsHint = r.reject
            ? `O valor ${fmt(r.outlierValue)} está estatisticamente distante dos demais. Verifique se é erro de medição, evento real ou contaminação pontual.`
            : 'Nenhum valor extremo suspeito encontrado. Todos os dados são consistentes entre si.';
        cards.push(`
            <div class="result-card ${cls}">
                <div class="result-card-title">Grubbs (Outlier)</div>
                <div class="result-card-value">${r.reject ? `&#9888; Outlier: ${fmt(r.outlierValue)}` : '&#10003; Sem outlier'}</div>
                <div class="result-card-detail">G=${fmt(r.G)} &nbsp; Gcrit=${fmt(r.Gcritical)}</div>
                <div class="result-card-hint">${grubbsHint}</div>
            </div>
        `);
    }
    // ANOVA ou KW (se fornecidos grupos)
    if (results.anova) {
        const r = results.anova;
        const cls = r.reject ? 'result-warn' : 'result-neutral';
        const anovaHint = r.reject
            ? 'As médias dos grupos são estatisticamente diferentes entre si. Algum período ou campanha se destaca dos demais.'
            : 'Não há diferença significativa entre os grupos. As concentrações são homogêneas ao longo dos períodos comparados.';
        cards.push(`
            <div class="result-card ${cls}">
                <div class="result-card-title">ANOVA</div>
                <div class="result-card-value">${r.reject ? '&#9888; Grupos diferem' : '&#10003; Grupos homogêneos'}</div>
                <div class="result-card-detail">F=${fmt(r.F)} &nbsp; p=${fmt(r.pValue)}</div>
                <div class="result-card-hint">${anovaHint}</div>
            </div>
        `);
    }
    if (results.kruskalWallis) {
        const r = results.kruskalWallis;
        const cls = r.reject ? 'result-warn' : 'result-neutral';
        const kwHint = r.reject
            ? 'Versão não-paramétrica da ANOVA: as medianas dos grupos são distintas. Indicado quando os dados não seguem distribuição normal.'
            : 'As medianas dos grupos são equivalentes. Não há diferença estatística entre os períodos comparados.';
        cards.push(`
            <div class="result-card ${cls}">
                <div class="result-card-title">Kruskal-Wallis</div>
                <div class="result-card-value">${r.reject ? '&#9888; Grupos diferem' : '&#10003; Grupos homogêneos'}</div>
                <div class="result-card-detail">H=${fmt(r.H)} &nbsp; p=${fmt(r.pValue)}</div>
                <div class="result-card-hint">${kwHint}</div>
            </div>
        `);
    }
    // Seasonal MK (se calculado)
    if (results.seasonalMannKendall) {
        const r = results.seasonalMannKendall;
        const icon = r.trend === 'no trend' ? '&#9135;' : r.trend === 'increasing' ? '&#8593;' : '&#8595;';
        const smkHint = r.pValue < 0.05
            ? 'Tendência estatisticamente significativa mesmo descontando variações sazonais (ex.: seca/chuva). A mudança é real, não é efeito da época do ano.'
            : 'Sem tendência significativa após considerar sazonalidade. Variações observadas podem ser explicadas pelas estações do ano.';
        cards.push(`
            <div class="result-card ${r.pValue < 0.05 ? 'result-warn' : 'result-neutral'}">
                <div class="result-card-title">Mann-Kendall Sazonal</div>
                <div class="result-card-value">${icon} ${r.trend}</div>
                <div class="result-card-detail">Z=${fmt(r.Z)} &nbsp; p=${fmt(r.pValue)}</div>
                <div class="result-card-hint">${smkHint}</div>
            </div>
        `);
    }
    // Estatísticas descritivas
    if (values.length > 0) {
        const sorted = [...values].sort((a: any, b: any) => a - b);
        /**
         */
        const mean = (values.reduce((s: any, v: any) => s + v, 0) / values.length).toFixed(3);
        const std = Math.sqrt(values.reduce((s: any, v: any) => s + (v - Number(mean)) ** 2, 0) /
            (values.length - 1)).toFixed(3);
        const median = sorted.length % 2 === 0
            ? ((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2).toFixed(3)
            : sorted[Math.floor(sorted.length / 2)].toFixed(3);
        cards.push(`
            <div class="result-card result-neutral">
                <div class="result-card-title">Descritivas (n=${values.length})</div>
                <div class="result-card-detail">&#956;=${mean} &nbsp; &#963;=${std} &nbsp; md=${median}</div>
                <div class="result-card-detail">min=${sorted[0]} &nbsp; max=${sorted[sorted.length - 1]}</div>
                <div class="result-card-hint">&#956; = média &nbsp;|&nbsp; &#963; = desvio padrão (dispersão) &nbsp;|&nbsp; md = mediana (valor central). Quanto maior o desvio padrão em relação à média, mais variável é a série.</div>
            </div>
        `);
    }
    return cards.join('');
}
/**
 * Builds a minimal inline bar chart showing the time series
 * Constrói um mini gráfico inline mostrando a série temporal
 */
function _buildMiniChart(values: any, changeIndex: any) {
    if (!values || values.length < 2)
        return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const H = 60; // altura em px
    const W = Math.max(4, Math.min(16, Math.floor(500 / values.length))); // largura de cada barra
    const bars = values
        .map((v: any, i: any) => {
        const h = Math.round(((v - min) / range) * H);
        const isChange = i === changeIndex;
        const bg = isChange ? 'var(--warning, #b8862e)' : 'var(--primary-400, #5a8692)';
        return `<div class="temporal-chart-bar" style="width:${W}px;height:${h}px;background:${bg};" title="t=${i}: ${v}">
            ${isChange ? '<span style="position:absolute;top:-16px;left:50%;transform:translateX(-50%);font-size:10px;white-space:nowrap;">&#9660;</span>' : ''}
        </div>`;
    })
        .join('');
    return `
        <div class="temporal-chart">
            <div class="temporal-chart-label">${t('temporalChart')} (n=${values.length})</div>
            <div class="temporal-chart-bars" style="height:${H + 18}px;padding-top:18px;">
                ${bars}
            </div>
            <div class="temporal-chart-legend">
                min=${min.toFixed(2)} | max=${max.toFixed(2)}
                ${changeIndex >= 0 ? t('temporal.breakAt', { index: changeIndex }) : ''}
            </div>
        </div>
    `;
}
/**
 * @param {any} trend
 */
function _getTrendIcon(trend: any) {
    if (trend === 'increasing')
        return '&#8593;';
    if (trend === 'decreasing')
        return '&#8595;';
    return '&#9135;';
}
// ================================================================
// MATRIX VIEW
// ================================================================
/**
 * Alterna entre a aba Individual e a aba Matriz
 * @param {'individual'|'matrix'} tab
 */
export function switchTemporalTab(tab: any) {
    const indView = (document.getElementById('temporal-view-individual')) as any;
    const matView = (document.getElementById('temporal-view-matrix')) as any;
    const indTab = (document.getElementById('temporal-tab-individual')) as any;
    const matTab = (document.getElementById('temporal-tab-matrix')) as any;
    if (!indView || !matView)
        return;
    const isMatrix = tab === 'matrix';
    indView.style.display = isMatrix ? 'none' : '';
    matView.style.display = isMatrix ? '' : 'none';
    indTab.classList.toggle('active', !isMatrix);
    matTab.classList.toggle('active', isMatrix);
}
/**
 * Coleta todos os pares elemento×parâmetro com dados suficientes,
 * roda autoSelectTest para cada um e renderiza a matriz de resultados.
 * Runs autoSelectTest for every element×parameter pair with ≥3 observations
 * and renders a summary matrix where clicking a cell opens the individual detail.
 */
export async function runMatrixAnalysis() {
    const btn = (document.getElementById('temporal-matrix-run-btn')) as any;
    const resultEl = (document.getElementById('temporal-matrix-result')) as any;
    if (!resultEl)
        return;
    const matrixAlphaInput = document.getElementById('temporal-matrix-alpha') as HTMLInputElement | null;
    const alpha = parseFloat(matrixAlphaInput?.value || '0.05');
    const elements = getAllElements ? getAllElements() : [];
    const withObs = elements.filter((/** @type {any} */ el) => el.data?.observations?.length > 0);
    if (withObs.length === 0) {
        resultEl.innerHTML =
            '<div class="temporal-empty-state"><div class="temporal-empty-sub">Nenhum elemento com observações no modelo.</div></div>';
        return;
    }
    // Coletar todos os parâmetros únicos do modelo inteiro
    const allParams: any[] = [
        ...new Set(withObs.flatMap((/** @type {any} */ el) => el.data.observations.map((o: any) => o.parameterId).filter(Boolean))),
    ].sort();
    if (allParams.length === 0) {
        resultEl.innerHTML =
            '<div class="temporal-empty-state"><div class="temporal-empty-sub">Nenhum parâmetro com ID definido nas observações.</div></div>';
        return;
    }
    if (btn) {
        btn.disabled = true;
        btn.textContent = t('temporal.calculating');
    }
    resultEl.innerHTML =
        '<div style="padding:16px;text-align:center;color:var(--text-muted,#6b7280);font-size:12px;">Processando ' +
            withObs.length * allParams.length +
            ' combinações...</div>';
    // Mapa de resultados: matrixData[elementId][parameterId] = { result, values, n }
    /** @type {Record<string, any>} */ const matrixData: Record<string, any> = {};
    for (const el of withObs) {
        matrixData[el.id] = {};
        for (const pid of allParams) {
            const obs = el.data.observations
                .filter((o: any) => o.parameterId === pid && o.value != null)
                .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
            const vals = obs
                .map((o: any) => Number(o.value))
                .filter((v: any) => Number.isFinite(v));
            if (vals.length < 3) {
                matrixData[el.id][pid] = null; // insuficiente
                continue;
            }
            try {
                const res = await autoSelectTest(vals, null, { alpha });
                matrixData[el.id][pid] = { result: res, values: vals, n: vals.length };
            }
            catch {
                matrixData[el.id][pid] = null;
            }
        }
    }
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span class="icon" data-icon="grid"></span> ' + t('temporal.calculateMatrix');
        if (window.hydrateIcons)
            window.hydrateIcons(btn.parentElement);
    }
    resultEl.innerHTML = _buildMatrixTable(withObs, allParams, matrixData);
    if (window.hydrateIcons)
        window.hydrateIcons(resultEl);
}
/**
 * Builds the HTML matrix table
 * Constrói a tabela HTML da matriz elemento×parâmetro
 */
function _buildMatrixTable(elements: any[], params: any[], matrixData: any) {
    const headerCols = elements
        .map((el: any) => `<th title="${el.id}">${(el.name || el.id).substring(0, 14)}</th>`)
        .join('');
    const rows = params
        .map((pid: any) => {
        const cells = elements
            .map((el: any) => {
            const entry = matrixData[el.id]?.[pid];
            if (!entry)
                return `<td class="tmc-cell tmc-none" title="${t('temporal.insufficientDataTooltip')}">—</td>`;
            const { result, values, n } = entry;
            const mk = result.allResults?.mannKendall;
            const pett = result.allResults?.pettitt;
            const grub = result.allResults?.grubbs;
            // Ícone principal = tendência Mann-Kendall
            let cls = 'tmc-flat';
            let icon = '&#9135;';
            if (mk?.trend === 'increasing') {
                cls = 'tmc-up';
                icon = '&#8593;';
            }
            if (mk?.trend === 'decreasing') {
                cls = 'tmc-down';
                icon = '&#8595;';
            }
            // Badges secundários
            const badges: any[] = [];
            if (pett?.significant)
                badges.push(`<span class="tmc-badge tmc-break" title="${t('temporal.breakDetected')}">&#9888;</span>`);
            if (grub?.reject)
                badges.push(`<span class="tmc-badge tmc-outlier" title="${t('temporal.outlierDetected')}">&#9650;</span>`);
            // Tooltip completo
            /**
             */
            const mean = (values.reduce((s: any, v: any) => s + v, 0) / n).toFixed(2);
            const tip = `${el.name || el.id} / ${pid}\nn=${n} | µ=${mean}\nTendência: ${mk?.trend || '—'} (p=${mk?.pValue?.toFixed(3) || '—'})\nRuptura: ${pett?.significant ? 'sim (t=' + pett.changeIndex + ')' : 'não'}\nOutlier: ${grub?.reject ? grub.outlierValue : 'não'}`;
            // Ao clicar: carrega na aba individual e exibe resultado.
            // CC-S1 B3 artesanal: payload cc-call URI-encoded (cobre aspas
            // em ids sem escaping manual).
            const ccPayload = `handleTemporalMatrixCellClick|s:${encodeURIComponent(el.id)}|s:${encodeURIComponent(pid)}`;
            return `<td class="tmc-cell ${cls}" title="${tip.replace(/"/g, '&quot;')}" data-cc-call-click="${ccPayload}">
                ${icon}${badges.join('')}
                <div class="tmc-n">n=${n}</div>
            </td>`;
        })
            .join('');
        return `<tr><td class="tmc-param">${pid}</td>${cells}</tr>`;
    })
        .join('');
    return `
        <div class="temporal-matrix-wrap">
            <table class="temporal-matrix-table">
                <thead><tr>
                    <th class="tmc-corner">Par&#226;metro \\ Elemento</th>
                    ${headerCols}
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <div class="temporal-matrix-detail" id="temporal-matrix-detail" style="display:none">
            <div class="temporal-results-header">
                <span id="temporal-matrix-detail-title">Detalhe</span>
                <button class="btn btn-xs btn-secondary" data-cc-action="cc-e7a8f896">&#10005;</button>
            </div>
            <div id="temporal-matrix-detail-body"></div>
        </div>
    `;
}
/**
 * Handles click on a matrix cell - loads the individual result below the matrix
 * Trata clique numa célula da matriz - exibe resultado individual abaixo
 * @param {string} elementId
 * @param {string} parameterId
 */
export async function onTemporalMatrixCellClick(elementId: any, parameterId: any) {
    const detailBox = (document.getElementById('temporal-matrix-detail')) as any;
    const detailTitle = (document.getElementById('temporal-matrix-detail-title')) as any;
    const detailBody = (document.getElementById('temporal-matrix-detail-body')) as any;
    if (!detailBox || !detailBody)
        return;
    const elements = getAllElements ? getAllElements() : [];
    const el = elements.find((e: any) => e.id === elementId);
    if (!el)
        return;
    const obs = (el.data?.observations || [])
        .filter((o: any) => o.parameterId === parameterId && o.value != null)
        .sort((a: any, b: any) => (a.date || '').localeCompare(b.date || ''));
    const values = obs
        .map((o: any) => Number(o.value))
        .filter((v: any) => Number.isFinite(v));
    if (values.length < 3)
        return;
    const alphaInput = document.getElementById('temporal-matrix-alpha') as HTMLInputElement | null;
    const alpha = parseFloat(alphaInput?.value || '0.05');
    detailTitle.textContent = t('temporal.detailTitle', 
    /** @type {any} */ ({ name: el.name || el.id, parameterId, count: values.length }));
    detailBody.innerHTML =
        '<div style="padding:8px;font-size:11px;color:var(--text-muted,#6b7280)">Calculando...</div>';
    detailBox.style.display = '';
    detailBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
        const result = await autoSelectTest(values, null, { alpha });
        // Reutiliza o renderizador de grid existente
        const gridHtml = _buildResultsGrid(result.allResults, values);
        const pettitt = result.allResults?.pettitt;
        const changeIndex = pettitt?.significant ? pettitt.changeIndex : -1;
        const chartHtml = _buildMiniChart(values, changeIndex);
        detailBody.innerHTML = `
            <div class="temporal-rec-box" style="margin:8px 8px 0">
                <div class="temporal-rec-test">${_getTrendIcon(result.allResults?.mannKendall?.trend)} ${result.recommendedTest || '—'}</div>
                <div class="temporal-rec-reason">${result.reason || ''}</div>
            </div>
            <div class="temporal-results-grid">${gridHtml}</div>
            ${chartHtml}
        `;
        if (window.hydrateIcons)
            window.hydrateIcons(detailBody);
    }
    catch (err: any) {
        detailBody.innerHTML = `<div style="padding:8px;color:var(--danger,#c53030);font-size:11px;">${t('temporal.errorWithMessage', { message: /** @type {any} */ (err).message })}</div>`;
    }
}
