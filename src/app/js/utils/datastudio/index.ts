// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   DATA STUDIO — Entry point (lazy-loaded)
   Ponto de entrada do Data Studio — carregado sob demanda

   Cria DOM, carrega sql.js + CodeMirror via CDN, popula modelo ativo.
   ================================================================ */
import { CONFIG } from '../../config.js';
import { t } from '../i18n/translations.js';
import { initSqlEngine, loadCurrentModelData } from './sqlEngine.js';
import { initEditor, getEditorContent } from './editor.js';
import { initResultsGrid, renderResults, renderMultipleResults, exportResultsCSV, exportResultsJSON, getMultiViewMode, setMultiViewMode, getMultiViewModeOptions, getLatestResultSet, } from './resultsGrid.js';
import { initSchemaPanel, refreshSchema } from './schemaPanel.js';
import { initCollectionsPanel } from './collectionsPanel.js';
import { buildExtractionPanel } from './extractionPanel.js';
import { generateDefaultCollections } from './collectionDefaults.js';
import { initModelBrowser, refreshModelBrowser } from './modelBrowser.js';
import { addQueryToHistory, getQueryHistory, clearQueryHistory } from './queryHistory.js';
import { DS_MODULES, normalizeDataStudioModule } from './moduleLayout.js';
import { buildChartDataFromResultSet, detectChartType, renderNativeChart } from './nativeChart.js';
import { buildPivot, renderPivotTable } from './pivotTable.js';
import { showToast } from '../ui/toast.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
/**
 * @typedef {'extraction' | 'processing' | 'analytics' | 'radar'} DataStudioModule
 * @typedef {'line' | 'bar' | 'scatter'} ChartType
 * @typedef {{ columns: string[], values: unknown[][], [key: string]: any }} ResultSet
 * @typedef {{ id: string, label: string }} MultiViewOption
 * @typedef {{ value: string, label: string }} SelectOption
 * @typedef {{ wrapper: HTMLLabelElement, select: HTMLSelectElement }} SelectControl
 * @typedef {{ chartCanvas: HTMLCanvasElement, chartHeader: HTMLElement, chartTypeSelect: HTMLSelectElement, rowFieldSelect: HTMLSelectElement, colFieldSelect: HTMLSelectElement, valueFieldSelect: HTMLSelectElement, aggSelect: HTMLSelectElement, pivotBody: HTMLElement, pivotHeader: HTMLElement }} AnalyticsState
 * @typedef {{ sql: string, ts: number }} QueryHistoryEntry
 */
let _initialized = false;
/** @type {DataStudioModule} */
let _activeModule: any = DS_MODULES.PROCESSING;
/** @type {null | (() => void)} */
let _refreshAnalyticsPanel: any = null;
/**
 * @param {unknown} value
 * @returns {string}
 */
function _errorMessage(value: any) {
    const err = value;
    return typeof err?.message === 'string' ? err.message : String(value);
}
/**
 * @param {string} sql
 * @returns {string[]}
 */
function _splitSqlStatements(sql: any) {
    /** @type {string[]} */
    const out = [];
    let current = '';
    let inSingle = false;
    let inDouble = false;
    let inLineComment = false;
    let inBlockComment = false;
    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        const next = sql[i + 1];
        if (inLineComment) {
            current += ch;
            if (ch === '\n')
                inLineComment = false;
            continue;
        }
        if (inBlockComment) {
            current += ch;
            if (ch === '*' && next === '/') {
                current += '/';
                i++;
                inBlockComment = false;
            }
            continue;
        }
        if (!inSingle && !inDouble) {
            if (ch === '-' && next === '-') {
                inLineComment = true;
                current += ch + next;
                i++;
                continue;
            }
            if (ch === '/' && next === '*') {
                inBlockComment = true;
                current += ch + next;
                i++;
                continue;
            }
        }
        if (ch === "'" && !inDouble) {
            inSingle = !inSingle;
            current += ch;
            continue;
        }
        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            current += ch;
            continue;
        }
        if (ch === ';' && !inSingle && !inDouble) {
            const stmt = current.trim();
            if (stmt)
                out.push(stmt);
            current = '';
            continue;
        }
        current += ch;
    }
    const tail = current.trim();
    if (tail)
        out.push(tail);
    return out;
}
/**
 * @param {string} sql
 * @returns {string}
 */
function _stripSqlComments(sql: any) {
    return sql
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .replace(/--.*$/gm, ' ')
        .trim();
}
/**
 * Init cascade resilience helper - wraps a sub-init so one failure doesn't
 * abort `initDataStudio`. Each sub-step logs its own error but lets the next
 * step run. This prevents one broken module (e.g. Collections endpoint 404)
 * from showing a fatal "Falha ao carregar Data Studio" screen when everything
 * else would have worked.
 *
 * @param {string} name - diagnostic name shown in console on failure
 * @param {() => unknown | Promise<unknown>} fn  - init function (sync or async); may throw freely
 * @returns {Promise<boolean>} true if the step succeeded, false otherwise
 */
async function _safeInit(name: any,fn: any) {
    try {
        await fn();
        return true;
    }
    catch (e: any) {
        const err = e;
        const msg = _errorMessage(e);
        const stack = typeof err?.stack === 'string' ? err.stack : '';
        console.error(`[ecbyts:datastudio] ${name} failed:`, msg, stack);
        return false;
    }
}
/**
 * Initialize Data Studio: build DOM, load CDN deps, populate current model.
 * Chamado lazy na primeira navegacao para o grupo datastudio.
 *
 * Resilience contract: the only fatal failure is "datastudio-container not
 * found in DOM". Every sub-step (SQL engine, editor, schema, collections,
 * models, data load) runs inside `_safeInit` and can fail independently.
 * Data Studio will always load with whatever subset of features succeeded.
 */
export async function initDataStudio() {
    if (_initialized)
        return;
    const container = document.getElementById('datastudio-container');
    if (!container) {
        // This IS fatal - nothing to render into.
        throw new Error('datastudio-container not found in DOM');
    }
    // Build DOM structure (always runs first, must not throw)
    _buildDOM(container);
    _wireModuleNav(container);
    _setActiveModule(DS_MODULES.PROCESSING, container);
    // Each sub-init is isolated via _safeInit. Track sqlReady because
    // loadCurrentModelData depends on it.
    let sqlReady = false;
    await _safeInit('SQL engine init', async () => {
        await initSqlEngine();
        sqlReady = true;
    });
    await _safeInit('Results grid init', () => {
        const resultsEl = container.querySelector('.ds-results');
        if (resultsEl instanceof HTMLElement)
            initResultsGrid(resultsEl);
    });
    await _safeInit('CodeMirror editor init', async () => {
        const editorEl = container.querySelector('.ds-editor');
        if (editorEl instanceof HTMLElement)
            await initEditor(editorEl);
    });
    await _safeInit('Schema panel init', () => {
        const schemaEl = container.querySelector('.ds-schema');
        if (schemaEl instanceof HTMLElement)
            initSchemaPanel(schemaEl);
    });
    await _safeInit('Model browser init', () => {
        const modelsEl = container.querySelector('.ds-models');
        if (modelsEl instanceof HTMLElement)
            initModelBrowser(modelsEl);
    });
    // NOTE: collectionsPanel is now initialized in the dd-more "Mais" panel,
    // not here - see _initMorePanelCollections() called from initDataStudio.
    // Load current model into SQLite (only if engine loaded)
    if (sqlReady) {
        await _safeInit('Load current model data', async () => {
            const loaded = (await loadCurrentModelData()) as unknown;
            if (loaded !== false) {
                refreshSchema();
                refreshModelBrowser();
            }
        });
    }
    await _safeInit('Toolbar wiring', () => _wireToolbar(container));
    // Inject collections section into #dd-more (painel Mais)
    await _safeInit('Mais panel collections injection', () => _initMorePanelCollections());
    _initialized = true;
}
/**
 * Execute the current editor query.
 * Executa a query do editor e renderiza resultados.
 */
export async function executeQuery() {
    const sql = getEditorContent();
    if (!sql || !sql.trim())
        return;
    const statusEl = document.querySelector('.ds-status');
    const start = performance.now();
    try {
        const { exec } = await import('./sqlEngine.js' as string);
        const statements = _splitSqlStatements(sql).filter((stmt: any) => _stripSqlComments(stmt));
        const elapsed = (performance.now() - start).toFixed(1);
        /** @type {ResultSet[]} */
        const sets = [];
        for (const statement of statements) {
            try {
                const statementResults = exec(statement);
                const tabular = (statementResults || []).filter((r: any) => Array.isArray(r?.columns));
                if (tabular.length > 0) {
                    sets.push(...tabular);
                }
                else {
                    sets.push({
                        columns: ['status', 'message'],
                        values: [['OK', 'No tabular output']],
                    });
                }
            }
            catch (e: any) {
                sets.push({
                    columns: ['status', 'error'],
                    values: [['ERROR', _errorMessage(e) || 'query_failed']],
                });
            }
        }
        if (sets.length > 1) {
            const totalRows = sets.reduce((acc: any, s: any) => acc + ((s?.values || []).length || 0), 0);
            renderMultipleResults(sets);
            if (statusEl)
                statusEl.textContent = t('datastudio.resultSets', { sets: sets.length, rows: totalRows, elapsed });
        }
        else if (sets.length === 1) {
            const result = sets[0];
            renderResults(result.columns, result.values);
            if (statusEl)
                statusEl.textContent = t('datastudio.rowsElapsed', { rows: result.values.length, elapsed });
        }
        else {
            renderResults([], []);
            if (statusEl)
                statusEl.textContent = t('datastudio.okElapsed', { elapsed });
        }
        await addQueryToHistory(sql);
        _refreshAnalyticsPanel?.();
    }
    catch (e: any) {
        if (statusEl)
            statusEl.textContent = t('datastudio.errorWithMessage', { message: _errorMessage(e) });
        renderResults([], []);
        _refreshAnalyticsPanel?.();
    }
}
// --- Internal: DOM ---
/**
 * @param {HTMLElement} container
 */
function _buildDOM(container: any) {
    // Build DOM programmatically (avoid innerHTML with t() to prevent XSS)
    container.textContent = '';
    // ETLC breadcrumb nav - substitui ds-module-nav
    const moduleNav = document.createElement('nav');
    moduleNav.className = 'ds-etlc-nav';
    moduleNav.setAttribute('role', 'tablist');
    moduleNav.setAttribute('aria-label', 'Pipeline ETLC');
    const etlcSteps = [
        {
            id: DS_MODULES.EXTRACTION,
            label: t('dataStudio.extraction') || 'Extração',
            tooltip: t('dataStudio.extractionTooltip') || 'Importe EDD, faça entrada manual ou conecte sensores',
        },
        {
            id: DS_MODULES.PROCESSING,
            label: t('dataStudio.processing') || 'Processamento (SQL)',
            tooltip: t('dataStudio.processingTooltip') || 'Execute SQL sobre todos os dados do modelo ativo',
        },
        {
            id: DS_MODULES.ANALYTICS,
            label: t('dataStudio.analytics') || 'Análise',
            tooltip: t('dataStudio.analyticsTooltip') || 'Gráficos, pivôs e tendências temporais',
        },
        {
            id: DS_MODULES.RADAR,
            label: t('dataStudio.communicate') || 'Comunicação',
            tooltip: t('dataStudio.communicateTooltip') || 'Compartilhe dados com stakeholders via Radar',
        },
    ];
    etlcSteps.forEach((step: any, idx: any) => {
        if (idx > 0) {
            const sep = document.createElement('span');
            sep.className = 'ds-step-sep';
            sep.textContent = '›'; // ›
            sep.setAttribute('aria-hidden', 'true');
            moduleNav.appendChild(sep);
        }
        const btn = document.createElement('button');
        btn.className = 'ds-step';
        btn.type = 'button';
        btn.dataset.dsModuleBtn = step.id;
        btn.textContent = step.label;
        btn.title = step.tooltip;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        btn.setAttribute('aria-controls', `ds-panel-${step.id}`);
        moduleNav.appendChild(btn);
    });
    container.appendChild(moduleNav);
    // Aba Extração (Extraction) - substitui o antigo collectionPanel com Data Collection
    const extractionPanelEl = document.createElement('section');
    extractionPanelEl.className = 'ds-module-panel ds-module-panel-extraction';
    extractionPanelEl.id = 'ds-panel-extraction';
    extractionPanelEl.dataset.dsModulePanel = DS_MODULES.EXTRACTION;
    extractionPanelEl.appendChild(buildExtractionPanel());
    container.appendChild(extractionPanelEl);
    const toolbar = document.createElement('div');
    toolbar.className = 'ds-toolbar ds-processing-only';
    const runBtn = document.createElement('button');
    runBtn.className = 'btn-sm ds-run';
    runBtn.title = t('datastudio.runTooltip');
    runBtn.textContent = '\u25B6 ' + t('dsRun');
    toolbar.appendChild(runBtn);
    const csvBtn = document.createElement('button');
    csvBtn.className = 'btn-sm ds-export-csv';
    csvBtn.title = t('datastudio.exportCsvTooltip');
    csvBtn.textContent = t('datastudio.csvLabel');
    toolbar.appendChild(csvBtn);
    const jsonBtn = document.createElement('button');
    jsonBtn.className = 'btn-sm ds-export-json';
    jsonBtn.title = t('datastudio.exportJsonTooltip');
    jsonBtn.textContent = t('datastudio.jsonLabel');
    toolbar.appendChild(jsonBtn);
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-sm ds-refresh';
    refreshBtn.title = t('dsRefresh') || 'Refresh current model';
    refreshBtn.textContent = '\u21BB ' + (t('dsRefresh') || 'Refresh');
    toolbar.appendChild(refreshBtn);
    // Templates dropdown wrapper
    const templatesWrap = document.createElement('div');
    templatesWrap.className = 'ds-templates-wrap';
    const templatesBtn = document.createElement('button');
    templatesBtn.className = 'btn-sm ds-templates-btn';
    templatesBtn.title = t('datastudio.sqlTemplatesTooltip');
    templatesBtn.textContent = t('datastudio.templatesLabel');
    templatesWrap.appendChild(templatesBtn);
    const templatesDropdown = document.createElement('div');
    templatesDropdown.className = 'ds-templates-dropdown ds-history-dropdown';
    templatesDropdown.style.display = 'none';
    templatesWrap.appendChild(templatesDropdown);
    toolbar.appendChild(templatesWrap);
    // History dropdown wrapper
    const historyWrap = document.createElement('div');
    historyWrap.className = 'ds-history-wrap';
    const historyBtn = document.createElement('button');
    historyBtn.className = 'btn-sm ds-history-btn';
    historyBtn.title = t('dsHistory') || 'Query history';
    historyBtn.textContent = t('dsHistory') || 'History';
    historyWrap.appendChild(historyBtn);
    const historyDropdown = document.createElement('div');
    historyDropdown.className = 'ds-history-dropdown';
    historyDropdown.style.display = 'none';
    historyWrap.appendChild(historyDropdown);
    toolbar.appendChild(historyWrap);
    // Multi-view mode selector - controls how multiple result sets render
    const mvWrap = document.createElement('label');
    mvWrap.className = 'ds-mv-mode-wrap';
    mvWrap.title = 'Multi-result view mode';
    mvWrap.textContent = '\u25A6 ';
    const mvSelect = document.createElement('select');
    mvSelect.className = 'btn-sm ds-mv-mode-select';
    mvWrap.appendChild(mvSelect);
    toolbar.appendChild(mvWrap);
    const status = document.createElement('span');
    status.className = 'ds-status';
    toolbar.appendChild(status);
    const processingPanel = document.createElement('section');
    processingPanel.className = 'ds-module-panel ds-module-panel-processing';
    processingPanel.id = 'ds-panel-processing';
    processingPanel.dataset.dsModulePanel = DS_MODULES.PROCESSING;
    processingPanel.appendChild(toolbar);
    // Body: sidebar + main
    const body = document.createElement('div');
    body.className = 'ds-body ds-processing-only';
    const sidebar = document.createElement('aside');
    sidebar.className = 'ds-sidebar';
    const models = document.createElement('div');
    models.className = 'ds-models';
    sidebar.appendChild(models);
    const schema = document.createElement('div');
    schema.className = 'ds-schema';
    sidebar.appendChild(schema);
    body.appendChild(sidebar);
    // Mobile sidebar toggle (visible only on small screens via CSS)
    const sidebarToggle = document.createElement('button');
    sidebarToggle.className = 'ds-sidebar-toggle';
    sidebarToggle.title = 'Schema';
    sidebarToggle.textContent = '\u2630';
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('ds-sidebar--open');
    });
    body.appendChild(sidebarToggle);
    const main = document.createElement('div');
    main.className = 'ds-main';
    const editorEl = document.createElement('div');
    editorEl.className = 'ds-editor';
    main.appendChild(editorEl);
    const resizer = document.createElement('div');
    resizer.className = 'ds-resizer';
    main.appendChild(resizer);
    const results = document.createElement('div');
    results.className = 'ds-results';
    main.appendChild(results);
    body.appendChild(main);
    processingPanel.appendChild(body);
    container.appendChild(processingPanel);
    const analyticsPanel = document.createElement('section');
    analyticsPanel.className = 'ds-module-panel ds-module-panel-analytics';
    analyticsPanel.id = 'ds-panel-analytics';
    analyticsPanel.dataset.dsModulePanel = DS_MODULES.ANALYTICS;
    analyticsPanel.appendChild(_buildAnalyticsContent());
    container.appendChild(analyticsPanel);
    const radarPanel = document.createElement('section');
    radarPanel.className = 'ds-module-panel ds-module-panel-radar';
    radarPanel.id = 'ds-panel-radar';
    radarPanel.dataset.dsModulePanel = DS_MODULES.RADAR;
    radarPanel.appendChild(_buildRadarContent());
    container.appendChild(radarPanel);
    // Vertical resizer between editor and results
    if (resizer && editorEl && results) {
        _initVerticalResize(resizer, editorEl, results);
    }
}
/**
 * Inject a "Coleções de Dados" section into #dd-more (painel Mais).
 * Uses a simple HTML section approach since #dd-more is a plain container.
 * Idempotente: no-op if section already injected.
 */
function _initMorePanelCollections() {
    const ddMore = document.getElementById('dd-more');
    if (!ddMore)
        return; // painel Mais não encontrado — graceful no-op
    if (ddMore.querySelector('#ds-collections-section'))
        return; // já injetado
    const section = document.createElement('section');
    section.id = 'ds-collections-section';
    section.setAttribute('role', 'region');
    section.setAttribute('aria-label', t('dataStudio.collections') || 'Coleções de Dados');
    section.className = 'ds-collections-more-section';
    section.dataset.ddSection = 'collections';
    const header = document.createElement('div');
    header.className = 'ds-collections-more-header';
    const titleEl = document.createElement('span');
    titleEl.className = 'ds-collections-more-title';
    titleEl.textContent = t('dataStudio.collections') || 'Coleções de Dados';
    header.appendChild(titleEl);
    const newBtn = document.createElement('button');
    newBtn.className = 'btn-sm ds-collections-new-btn';
    newBtn.type = 'button';
    newBtn.textContent = t('dataStudio.newCollection') || '+ Nova Coleção';
    newBtn.addEventListener('click', (e: any) => {
        e.stopPropagation();
        // Open extraction panel (full Data Studio) on extraction module
        if (typeof window.handleOpenDataStudio === 'function') {
            window.handleOpenDataStudio('extraction');
        }
    });
    header.appendChild(newBtn);
    section.appendChild(header);
    const body = document.createElement('div');
    body.className = 'ds-collections-main ds-collections-more-body';
    body.id = 'ds-collections-more-body';
    section.appendChild(body);
    // Insert at top of dd-more (before any existing children)
    ddMore.insertBefore(section, ddMore.firstChild);
    // Initialize the collections panel inside the body element
    try {
        initCollectionsPanel(body);
    }
    catch (e: any) {
        console.error('[ecbyts:datastudio] collections panel in Mais failed:', e);
    }
    // Generate defaults if model loaded
    _maybeGenerateDefaultCollections();
}
/**
 * Generate default collections (idempotente) if model is loaded and no collections exist.
 */
async function _maybeGenerateDefaultCollections() {
    try {
        const [elemMod, campMod] = await Promise.all([
            import('../../core/elements/manager.js' as string).catch(() => null),
            import('../../core/campaigns/manager.js' as string).catch(() => null),
        ]);
        const elements = elemMod?.getAllElements?.() || [];
        const campaigns = campMod?.getAllCampaigns?.() || [];
        if (!elements.length && !campaigns.length)
            return;
        const defaults = generateDefaultCollections(elements, campaigns);
        if (!defaults.length)
            return;
        // Dispatch custom event so collectionsPanel can consume defaults if needed
        document.dispatchEvent(new CustomEvent('ecbyts:datastudio:defaults-ready', { detail: { defaults } }));
    }
    catch (e: any) {
        // Non-fatal - defaults are a UX convenience, not required
        console.warn('[ecbyts:datastudio] defaults generation failed:', _errorMessage(e));
    }
}
/**
 * @param {string} moduleId
 * @param {string} label
 * @returns {HTMLButtonElement}
 */
function _createModuleBtn(moduleId: any,label: any) {
    const btn = document.createElement('button');
    btn.className = 'ds-module-btn';
    btn.type = 'button';
    btn.dataset.dsModuleBtn = moduleId;
    btn.textContent = label;
    return btn;
}
function _buildAnalyticsContent() {
    if (CONFIG.FEATURES?.ENABLE_DATASTUDIO_ANALYTICS === true) {
        return _buildNativeAnalyticsContent();
    }
    _refreshAnalyticsPanel = null;
    return _buildLegacyAnalyticsContent();
}

function _appendAnalyticsShareButton(container: HTMLElement): void {
    try {
        const shareButton = createDeepLinkShareButton({
            toolId: 'analytics',
            getPayload: () => null,
            toast: showToast,
        });
        container.appendChild(shareButton);
    } catch (e) {
        console.debug('[datastudio:analytics-share-button] wire failed', (e as Error)?.message || e);
    }
}

function _buildLegacyAnalyticsContent() {
    const wrap = document.createElement('div');
    wrap.className = 'ds-module-shell';
    const title = document.createElement('h3');
    title.className = 'ds-module-title';
    title.textContent = 'Data Analytics';
    wrap.appendChild(title);
    const desc = document.createElement('p');
    desc.className = 'ds-module-desc';
    desc.textContent = t('datastudio.reuseAnalyticsModule');
    wrap.appendChild(desc);
    const actions = document.createElement('div');
    actions.className = 'ds-module-actions';
    const openAnalyticsBtn = document.createElement('button');
    openAnalyticsBtn.className = 'btn-sm ds-module-action-primary';
    openAnalyticsBtn.type = 'button';
    openAnalyticsBtn.textContent = 'Abrir Analytics Existente';
    openAnalyticsBtn.addEventListener('click', () => {
        import('../ui/tabs.js' as string).then(({ activateTabById }) => {
            activateTabById('analytics');
            if (typeof window.toggleAnalyticsFullscreen === 'function') {
                const tabEl = document.getElementById('tab-analytics');
                if (tabEl && !tabEl.classList.contains('analytics-fullscreen')) {
                    window.toggleAnalyticsFullscreen();
                }
            }
        }).catch((e: any) => console.debug('[datastudio:lazy-tabs:silent-catch]', e?.message || e));
    });
    actions.appendChild(openAnalyticsBtn);
    // DEEP-LINK-TOOLS-001 Sprint 2 - share button no Analytics panel.
    _appendAnalyticsShareButton(actions);
    const processingBtn = document.createElement('button');
    processingBtn.className = 'btn-sm';
    processingBtn.type = 'button';
    processingBtn.textContent = t('dsBackToSql') || 'Voltar para SQL';
    processingBtn.addEventListener('click', () => _setActiveModule(DS_MODULES.PROCESSING));
    actions.appendChild(processingBtn);
    wrap.appendChild(actions);
    return wrap;
}
function _buildNativeAnalyticsContent() {
    const wrap = document.createElement('section');
    wrap.className = 'ds-module-shell';
    wrap.setAttribute('aria-labelledby', 'ds-analytics-title');
    const title = document.createElement('h3');
    title.id = 'ds-analytics-title';
    title.className = 'ds-module-title';
    title.textContent = 'Data Analytics';
    wrap.appendChild(title);
    const desc = document.createElement('p');
    desc.className = 'ds-module-desc';
    desc.textContent = 'Charts e pivot table nativos sobre o ultimo result set executado no SQL.';
    wrap.appendChild(desc);
    const primaryActions = document.createElement('div');
    primaryActions.className = 'ds-module-actions';
    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-sm ds-module-action-primary';
    refreshBtn.type = 'button';
    refreshBtn.textContent = t('dsRefresh') || 'Atualizar';
    primaryActions.appendChild(refreshBtn);
    // DEEP-LINK-TOOLS-001 Sprint 2 - share button no Analytics panel.
    _appendAnalyticsShareButton(primaryActions);
    const processingBtn = document.createElement('button');
    processingBtn.className = 'btn-sm';
    processingBtn.type = 'button';
    processingBtn.textContent = t('dsBackToSql') || 'Voltar para SQL';
    processingBtn.addEventListener('click', () => _setActiveModule(DS_MODULES.PROCESSING));
    primaryActions.appendChild(processingBtn);
    const chartTypeControl = _createAnalyticsSelectControl('Chart', [
        { value: 'line', label: 'Line' },
        { value: 'bar', label: 'Bar' },
        { value: 'scatter', label: 'Scatter' },
    ]);
    primaryActions.appendChild(chartTypeControl.wrapper);
    wrap.appendChild(primaryActions);
    const pivotActions = document.createElement('div');
    pivotActions.className = 'ds-module-actions';
    const rowFieldControl = _createAnalyticsSelectControl('Rows');
    const colFieldControl = _createAnalyticsSelectControl('Columns');
    const valueFieldControl = _createAnalyticsSelectControl('Values');
    const aggControl = _createAnalyticsSelectControl('Agg', [
        { value: 'sum', label: 'sum' },
        { value: 'avg', label: 'avg' },
        { value: 'count', label: 'count' },
        { value: 'min', label: 'min' },
        { value: 'max', label: 'max' },
    ]);
    [rowFieldControl, colFieldControl, valueFieldControl, aggControl].forEach((control: any) => pivotActions.appendChild(control.wrapper));
    wrap.appendChild(pivotActions);
    const chartPane = document.createElement('div');
    chartPane.className = 'ds-mv-chart-pane';
    const chartHeader = document.createElement('div');
    chartHeader.className = 'ds-mv-chart-header';
    chartHeader.textContent = 'Native chart';
    chartPane.appendChild(chartHeader);
    const chartCanvasWrap = document.createElement('div');
    chartCanvasWrap.className = 'ds-mv-chart-canvas';
    const chartCanvas = document.createElement('canvas');
    chartCanvas.setAttribute('role', 'img');
    chartCanvas.setAttribute('aria-label', 'Data Studio native chart');
    chartCanvasWrap.appendChild(chartCanvas);
    chartPane.appendChild(chartCanvasWrap);
    wrap.appendChild(chartPane);
    const pivotPane = document.createElement('div');
    pivotPane.className = 'ds-mv-chart-pane';
    const pivotHeader = document.createElement('div');
    pivotHeader.className = 'ds-mv-chart-header';
    pivotHeader.textContent = 'Pivot table';
    pivotPane.appendChild(pivotHeader);
    const pivotBody = document.createElement('div');
    pivotBody.className = 'ds-mv-chart-grid';
    pivotPane.appendChild(pivotBody);
    wrap.appendChild(pivotPane);
    const state = {
        chartCanvas,
        chartHeader,
        chartTypeSelect: chartTypeControl.select,
        rowFieldSelect: rowFieldControl.select,
        colFieldSelect: colFieldControl.select,
        valueFieldSelect: valueFieldControl.select,
        aggSelect: aggControl.select,
        pivotBody,
        pivotHeader,
    };
    const renderPanel = () => _renderAnalyticsPanel(state);
    _refreshAnalyticsPanel = renderPanel;
    refreshBtn.addEventListener('click', renderPanel);
    [
        chartTypeControl.select,
        rowFieldControl.select,
        colFieldControl.select,
        valueFieldControl.select,
        aggControl.select,
    ].forEach((select: any) => select.addEventListener('change', renderPanel));
    return wrap;
}
/**
 * @param {string} labelText
 * @param {(string | SelectOption)[]} [options]
 * @returns {SelectControl}
 */
function _createAnalyticsSelectControl(labelText: any, options: any = []) {
    const wrapper = document.createElement('label');
    wrapper.className = 'ds-mv-mode-wrap';
    wrapper.textContent = `${labelText} `;
    const select = document.createElement('select');
    select.className = 'btn-sm ds-mv-mode-select';
    wrapper.appendChild(select);
    _populateAnalyticsSelect(select, options);
    return { wrapper, select };
}
/**
 * @param {HTMLSelectElement} select
 * @param {(string | SelectOption)[]} options
 * @param {string} [preferredValue?]
 */
function _populateAnalyticsSelect(select: any, options: any, preferredValue?: any) {
    const normalizedOptions = options.map((option: any) => typeof option === 'string' ? { value: option, label: option } : option);
    const nextValue = preferredValue ?? select.value;
    select.innerHTML = normalizedOptions
        .map((option: any) => `<option value="${option.value}">${option.label}</option>`)
        .join('');
    if (!normalizedOptions.length)
        return;
    const resolved = normalizedOptions.some((option: any) => option.value === nextValue)
        ? nextValue
        : normalizedOptions[0].value;
    select.value = resolved;
}
/**
 * @param {ResultSet | null | undefined} resultSet
 * @returns {{ numericIndexes: number[], categoricalIndexes: number[] }}
 */
function _getAnalyticsFieldIndexes(resultSet: any) {
    const columns = resultSet?.columns || [];
    const values = resultSet?.values || [];
    const numericIndexes = columns
        .map((_: any, index: any) => index)
        .filter((index: any) => values
        .slice(0, 20)
        .every((row: any) => row?.[index] == null || row[index] === '' || !Number.isNaN(Number(row[index]))));
    const categoricalIndexes = columns.map((_: any, index: any) => index).filter((index: any) => !numericIndexes.includes(index));
    return { numericIndexes, categoricalIndexes };
}
/**
 * @param {ResultSet | null | undefined} resultSet
 * @returns {{ chartType: string, rowField: string, colField: string, valueField: string }}
 */
function _pickAnalyticsDefaults(resultSet: any) {
    const columns = resultSet?.columns || [];
    const { numericIndexes, categoricalIndexes } = _getAnalyticsFieldIndexes(resultSet);
    return {
        chartType: detectChartType(resultSet) || 'bar',
        rowField: columns[categoricalIndexes[0] ?? 0] || '',
        colField: columns[categoricalIndexes[1] ?? numericIndexes[0] ?? 0] || '',
        valueField: columns[numericIndexes[0] ?? 0] || '',
    };
}
/**
 * @param {AnalyticsState} state
 */
function _renderAnalyticsPanel(state: any) {
    const resultSet = getLatestResultSet();
    const columns = resultSet?.columns || [];
    const values = resultSet?.values || [];
    const defaults = _pickAnalyticsDefaults(resultSet);
    _populateAnalyticsSelect(state.chartTypeSelect, ['line', 'bar', 'scatter'], state.chartTypeSelect.value || defaults.chartType);
    _populateAnalyticsSelect(state.rowFieldSelect, columns, state.rowFieldSelect.value || defaults.rowField);
    _populateAnalyticsSelect(state.colFieldSelect, columns, state.colFieldSelect.value || defaults.colField);
    _populateAnalyticsSelect(state.valueFieldSelect, columns, state.valueFieldSelect.value || defaults.valueField);
    _populateAnalyticsSelect(state.aggSelect, ['sum', 'avg', 'count', 'min', 'max'], state.aggSelect.value || 'sum');
    if (!columns.length || !values.length) {
        state.chartHeader.textContent = 'Native chart';
        renderNativeChart(state.chartCanvas, { labels: [], datasets: [] }, (state.chartTypeSelect.value || 'bar'));
        state.pivotHeader.textContent = 'Pivot table';
        state.pivotBody.innerHTML = '<div class="ds-results-empty">Execute uma query SQL para gerar analytics.</div>';
        return;
    }
    const chartType = (state.chartTypeSelect.value || defaults.chartType || 'bar');
    const chartData = buildChartDataFromResultSet(resultSet, chartType);
    state.chartHeader.textContent = `Native chart · ${chartType}`;
    state.chartCanvas.setAttribute('aria-label', `${chartType} chart: ${chartData.datasets.map((dataset: any) => dataset.label).join(', ') || 'sem series'}`);
    renderNativeChart(state.chartCanvas, chartData, chartType);
    const rowField = state.rowFieldSelect.value;
    const colField = state.colFieldSelect.value;
    const valueField = state.valueFieldSelect.value;
    const agg = state.aggSelect.value || 'sum';
    state.pivotHeader.textContent = `Pivot table · ${agg}(${valueField || 'value'})`;
    if (!rowField || !colField || !valueField) {
        state.pivotBody.innerHTML =
            '<div class="ds-results-empty">Selecione rows, columns e values para gerar a pivot.</div>';
        return;
    }
    const pivotResult = buildPivot(resultSet, { rowField, colField, valueField, agg });
    renderPivotTable(state.pivotBody, pivotResult);
}
function _buildRadarContent() {
    const wrap = document.createElement('div');
    wrap.className = 'ds-module-shell';
    const title = document.createElement('h3');
    title.className = 'ds-module-title';
    title.textContent = t('dsRadar') || 'Radar';
    wrap.appendChild(title);
    const desc = document.createElement('p');
    desc.className = 'ds-module-desc';
    desc.textContent =
        t('dsRadarDesc') ||
            'Broadcasting de modelos para stakeholders: gera share_code, perfis de broadcast e heartbeat.';
    wrap.appendChild(desc);
    const actions = document.createElement('div');
    actions.className = 'ds-module-actions';
    const openBtn = document.createElement('button');
    openBtn.className = 'btn-sm ds-module-action-primary';
    openBtn.type = 'button';
    openBtn.textContent = t('dsRadarOpen') || 'Abrir Radar';
    openBtn.addEventListener('click', () => {
        import('../ui/radarModal.js' as string)
            .then(({ openRadarModal }) => openRadarModal())
            .catch((e: any) => console.error('[ecbyts:datastudio] radar open failed:', e));
    });
    actions.appendChild(openBtn);
    const profilesBtn = document.createElement('button');
    profilesBtn.className = 'btn-sm';
    profilesBtn.type = 'button';
    profilesBtn.textContent = t('radar.profileManager.title') || 'Profiles';
    profilesBtn.addEventListener('click', () => {
        const fn = window.handleOpenRadarProfileManager;
        if (typeof fn === 'function')
            fn();
    });
    actions.appendChild(profilesBtn);
    const slicesBtn = document.createElement('button');
    slicesBtn.className = 'btn-sm';
    slicesBtn.type = 'button';
    slicesBtn.textContent = t('radar.sliceWizard.title') || 'Novo Slice';
    slicesBtn.addEventListener('click', () => {
        const fn = window.handleOpenRadarSliceWizard;
        if (typeof fn === 'function')
            fn();
    });
    actions.appendChild(slicesBtn);
    const walletBtn = document.createElement('button');
    walletBtn.className = 'btn-sm';
    walletBtn.type = 'button';
    walletBtn.textContent = t('radar.tokenWallet.title') || 'Token Wallet';
    walletBtn.addEventListener('click', () => {
        const fn = window.handleOpenRadarTokenWallet;
        if (typeof fn === 'function')
            fn();
    });
    actions.appendChild(walletBtn);
    const auditBtn = document.createElement('button');
    auditBtn.className = 'btn-sm';
    auditBtn.type = 'button';
    auditBtn.textContent = t('radar.auditLog.title') || 'Audit Log';
    auditBtn.addEventListener('click', () => {
        const fn = window.handleOpenRadarAuditLog;
        if (typeof fn === 'function')
            fn();
    });
    actions.appendChild(auditBtn);
    const processingBtn = document.createElement('button');
    processingBtn.className = 'btn-sm';
    processingBtn.type = 'button';
    processingBtn.textContent = t('dsBackToSql') || 'Voltar para SQL';
    processingBtn.addEventListener('click', () => _setActiveModule(DS_MODULES.PROCESSING));
    actions.appendChild(processingBtn);
    wrap.appendChild(actions);
    return wrap;
}
/**
 * @param {Document | HTMLElement} [container]
 */
function _wireModuleNav(container: any) {
    const root = container || document;
    root.querySelectorAll('[data-ds-module-btn]').forEach((btn: any) => {
        if (!(btn instanceof HTMLElement))
            return;
        btn.addEventListener('click', () => {
            _setActiveModule(btn.dataset.dsModuleBtn, root);
        });
    });
}
/**
 * @param {string | undefined} moduleId
 * @param {Document | HTMLElement} [container?]
 */
function _setActiveModule(moduleId: any, container?: any) {
    const root = container || document;
    _activeModule = normalizeDataStudioModule(moduleId || DS_MODULES.PROCESSING);
    const host = root.querySelector('#datastudio-container') || root;
    root.querySelectorAll('[data-ds-module-btn]').forEach((btn: any) => {
        if (!(btn instanceof HTMLElement))
            return;
        const active = btn.dataset.dsModuleBtn === _activeModule;
        btn.classList.toggle('active', active);
        btn.classList.toggle('ds-step--active', active);
        // Support both role="tab" (aria-selected) and role="button" (aria-pressed)
        if (btn.getAttribute('role') === 'tab') {
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        }
        else {
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        }
    });
    root.querySelectorAll('[data-ds-module-panel]').forEach((panel: any) => {
        if (!(panel instanceof HTMLElement))
            return;
        panel.classList.toggle('active', panel.dataset.dsModulePanel === _activeModule);
    });
    if (!(host instanceof HTMLElement))
        return;
    host.classList.remove('ds-module-extraction', 'ds-module-intake', // retrocompat
    'ds-module-collection', 'ds-module-processing', 'ds-module-analytics', 'ds-module-radar');
    host.classList.add(`ds-module-${_activeModule}`);
    // Fix Calvin bug 2026-06-03 (mouse-only journey): radar-modal NÃO deve abrir
    // automaticamente ao ativar a tab Comunicacao — o botão "Abrir Radar" (linha
    // 821-829) já faz isso explicitamente quando o usuário clica. Auto-open
    // bloqueava todos os outros botões (Profiles/Slice/Wallet/Audit) como overlay
    // fantasma. Ver tests/e2e/radar-mouse-user-journey.spec.ts.
    if (_activeModule === DS_MODULES.ANALYTICS && CONFIG.FEATURES?.ENABLE_DATASTUDIO_ANALYTICS === true) {
        _refreshAnalyticsPanel?.();
    }
}
/**
 * @param {HTMLElement} container
 */
function _wireToolbar(container: any) {
    const runBtn = container.querySelector('.ds-run');
    if (runBtn)
        runBtn.addEventListener('click', executeQuery);
    // Multi-view mode selector - populate options + wire change
    const mvSelect = container.querySelector('.ds-mv-mode-select');
    if (mvSelect instanceof HTMLSelectElement) {
        const current = getMultiViewMode();
        const options = getMultiViewModeOptions();
        mvSelect.innerHTML = options
            .map((opt: any) => `<option value="${opt.id}"${opt.id === current ? ' selected' : ''}>${opt.label}</option>`)
            .join('');
        mvSelect.addEventListener('change', () => {
            setMultiViewMode(mvSelect.value);
            showToast(`Multi-view: ${mvSelect.options[mvSelect.selectedIndex]!.text}`, 'info');
        });
    }
    const csvBtn = container.querySelector('.ds-export-csv');
    if (csvBtn)
        csvBtn.addEventListener('click', () => {
            exportResultsCSV();
            showToast(t('dsExported') || 'Exported CSV', 'success');
        });
    const jsonBtn = container.querySelector('.ds-export-json');
    if (jsonBtn)
        jsonBtn.addEventListener('click', () => {
            exportResultsJSON();
            showToast(t('dsExported') || 'Exported JSON', 'success');
        });
    const refreshBtn = container.querySelector('.ds-refresh');
    if (refreshBtn)
        refreshBtn.addEventListener('click', async () => {
            const loaded = (await loadCurrentModelData()) as unknown;
            if (loaded) {
                refreshSchema();
                showToast(t('dsRefreshed') || 'Model data refreshed', 'info');
            }
            else {
                showToast(t('dsNoCloudModels') || 'Nenhum modelo disponivel para carregar agora', 'warning');
            }
        });
    // Templates dropdown
    const templatesBtn = container.querySelector('.ds-templates-btn');
    const templatesDropdown = container.querySelector('.ds-templates-dropdown');
    if (templatesBtn instanceof HTMLElement && templatesDropdown instanceof HTMLElement) {
        templatesBtn.addEventListener('click', () => {
            const isOpen = templatesDropdown.style.display !== 'none';
            if (isOpen) {
                templatesDropdown.style.display = 'none';
                return;
            }
            _renderTemplatesDropdown(templatesDropdown);
            templatesDropdown.style.display = 'block';
        });
        document.addEventListener('click', (e: any) => {
            const target = e.target instanceof Element ? e.target : null;
            if (!target?.closest('.ds-templates-wrap')) {
                templatesDropdown.style.display = 'none';
            }
        });
    }
    // History dropdown
    const historyBtn = container.querySelector('.ds-history-btn');
    const historyDropdown = container.querySelector('.ds-history-dropdown');
    if (historyBtn instanceof HTMLElement && historyDropdown instanceof HTMLElement) {
        historyBtn.addEventListener('click', () => {
            const isOpen = historyDropdown.style.display !== 'none';
            if (isOpen) {
                historyDropdown.style.display = 'none';
                return;
            }
            _renderHistoryDropdown(historyDropdown);
            historyDropdown.style.display = 'block';
        });
        // Close on outside click
        document.addEventListener('click', (e: any) => {
            const target = e.target instanceof Element ? e.target : null;
            if (!target?.closest('.ds-history-wrap')) {
                historyDropdown.style.display = 'none';
            }
        });
    }
}
/**
 * @param {HTMLElement} dropdown
 */
function _renderHistoryDropdown(dropdown: any) {
    const history = getQueryHistory();
    dropdown.textContent = '';
    if (!history.length) {
        const empty = document.createElement('div');
        empty.className = 'ds-history-empty';
        empty.textContent = t('dsNoHistory') || 'No queries yet';
        dropdown.appendChild(empty);
        return;
    }
    for (const entry of history.slice(0, 20)) {
        const item = document.createElement('div');
        item.className = 'ds-history-item';
        item.title = entry.sql;
        const sqlSpan = document.createElement('span');
        sqlSpan.className = 'ds-history-sql';
        sqlSpan.textContent = entry.sql.length > 80 ? entry.sql.slice(0, 80) + '...' : entry.sql;
        item.appendChild(sqlSpan);
        const timeSpan = document.createElement('span');
        timeSpan.className = 'ds-history-time';
        timeSpan.textContent = _relativeTime(entry.ts);
        item.appendChild(timeSpan);
        item.addEventListener('click', () => {
            import('./editor.js' as string).then(({ setEditorContent }) => {
                setEditorContent(entry.sql);
            }).catch((e: any) => console.debug('[datastudio:lazy-editor:silent-catch]', e?.message || e));
            dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
    }
    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.className = 'ds-history-clear';
    clearBtn.textContent = t('dsClearHistory') || 'Clear history';
    clearBtn.addEventListener('click', (e: any) => {
        e.stopPropagation();
        clearQueryHistory();
        dropdown.style.display = 'none';
    });
    dropdown.appendChild(clearBtn);
}
/**
 * @param {HTMLElement} dropdown
 */
async function _renderTemplatesDropdown(dropdown: any) {
    dropdown.textContent = '';
    try {
        const { getStarterTemplates, setEditorContent, stripSqlComments } = await import('./editor.js' as string);
        const templates = getStarterTemplates();
        for (const tpl of templates) {
            const item = document.createElement('button');
            item.className = 'ds-history-item';
            item.textContent = tpl.label;
            item.style.width = '100%';
            item.style.textAlign = 'left';
            item.addEventListener('click', () => {
                setEditorContent(stripSqlComments(tpl.sql));
                dropdown.style.display = 'none';
                showToast(`Template aplicado: ${tpl.label}`, 'info');
            });
            dropdown.appendChild(item);
        }
    }
    catch (e: any) {
        const err = document.createElement('div');
        err.className = 'ds-history-empty';
        err.textContent = `Falha ao carregar templates: ${_errorMessage(e) || 'erro desconhecido'}`;
        dropdown.appendChild(err);
    }
}
/**
 * @param {number} ts
 * @returns {string}
 */
function _relativeTime(ts: any) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1)
        return 'now';
    if (mins < 60)
        return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24)
        return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
/**
 * @param {HTMLElement} resizer
 * @param {HTMLElement} topEl
 * @param {HTMLElement} _bottomEl
 */
function _initVerticalResize(resizer: any,topEl: any,_bottomEl: any) {
    let startY = 0;
    let startTopH = 0;
    /**
     * @param {MouseEvent} e
     */
    const onMove = (e: any) => {
        const dy = e.clientY - startY;
        const newTopH = Math.max(80, startTopH + dy);
        topEl.style.height = `${newTopH}px`;
        topEl.style.flex = 'none';
    };
    const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
    };
    resizer.addEventListener('mousedown', (event: any) => {
        const e = event;
        e.preventDefault();
        startY = e.clientY;
        startTopH = topEl.offsetHeight;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
