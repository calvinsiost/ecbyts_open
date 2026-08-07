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
   COST ANALYSIS PANEL — Dashboard de Análise de Custos
   ================================================================

   Aba do painel direito com duas sub-visões:
   - Sintético (Resumo): KPIs + gráficos agregados
   - Detalhado: Tabelas por elemento, campanha, ano fiscal, categoria

   Segue padrão do governancePanel.js:
   - renderCostAnalysisTab() gera HTML e injeta no container
   - Gráficos renderizados via requestAnimationFrame pós-DOM
   - CSS injetado dinamicamente
   ================================================================ */
import { buildCostRollupWithUncertainty, getCostByElement } from '../../core/analytics/economics/costRollup.js';
import { renderCostCharts, destroyAllCostCharts } from './costCharts.js';
import { formatCurrency } from './governancePanel.js';
// COST-CENTRAL-BOARD-001 F2 (Calvin 2026-06-10): tabela central DEVE mostrar
// passivo + ativo + líquido (ECBT Score), não só custos. Importa o mesmo
// extrator de ativos naturais que o ecbtScorePanel já usa para o HUD.
import { getAllElements as _getAllElementsForAssets } from '../../core/elements/manager.js';
import { t } from '../i18n/translations.js';
import * as _i18nNs from '../i18n/translations.js';
const applyTranslations = _i18nNs.applyTranslations;
import { escapeHtml } from '../helpers/html.js';
import { hydrateIcons } from './icons.js';
import { renderUncertaintyBadge, wireUncertaintyBadge } from './components/uncertaintyBadge.js';
// SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION F3 — opt-in valuation badges.
// Consumer migration legacy: helpers ficam disponíveis para uso incremental
// quando rollup contiver ValuationResult com provenance/integrity.
import { renderValuationBadges } from './valuationBadges.js';
import { createDeepLinkShareButton } from '../sharing/_deepLinkShareButton.js';
import { showToast } from './toast.js';
import { syncDeepLinkUrl, clearDeepLinkUrl } from '../sharing/deepLinkUrlSync.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let currentView = 'synthetic'; // 'synthetic' | 'detailed'
const expandedElements = new Set();

/**
 * COST-CENTRAL-BOARD-001 F2 (Calvin 2026-06-10): extrai ativos naturais por
 * elemento usando o mesmo extrator que o HUD ECBT card consome. Retorna mapa
 * {elementId → assetValue} + totalAssets para enriquecer rollup com a coluna
 * ATIVO + LÍQUIDO. Falha silenciosa retorna mapa vazio (degradação graciosa).
 */
async function _computeAssetsByElement(): Promise<{ byId: Record<string, number>; totalAssets: number; byCC: Record<string, number> }> {
    try {
        const naturalAssets: any = await import('../../core/ecbtScore/_naturalAssetsPure.js' as string);
        const catalogLoader: any = await import('../../core/ecbtScore/_naturalAssetCatalogLoaderPure.js' as string);
        const benchmarks: any = await import('../../core/ecbtScore/_naturalAssetBenchmarksPure.js' as string);
        const elements = _getAllElementsForAssets() || [];
        const catalog = _resolveNaturalAssetCatalog(catalogLoader, benchmarks);
        const assetEntries = naturalAssets.extractNaturalAssets(elements, catalog) as Array<{
            value: number;
            elementId?: string;
        }>;
        const { byId, totalAssets } = _accumulateAssetsByElement(assetEntries);
        // F2.2: também distribui ativos por CC via alocações (await async).
        const byCC = await _computeAssetsByCC(byId);
        return { byId, totalAssets, byCC };
    } catch (e: any) {
        console.debug('[costAnalysisPanel:assets] extract failed', e?.message || e);
        return { byId: {}, totalAssets: 0, byCC: {} };
    }
}

/**
 * Resolve o catálogo efetivo de ativos naturais a partir de seed, libraries e override do usuário.
 * @param catalogLoader - módulo de carregamento do catálogo
 * @param benchmarks - módulo de benchmarks
 * @returns catálogo efetivo
 */
function _resolveNaturalAssetCatalog(catalogLoader: any, benchmarks: any): Record<string, any> {
    const userOverride = (window as any).__ecbtNaturalAssetCatalog;
    const seedCatalog =
        (window as any).__ecbtNaturalAssetSeedCatalog
        || (typeof benchmarks.buildSeedCatalog === 'function'
            ? benchmarks.buildSeedCatalog({ tier: 'expected' })
            : {});
    const libraries = (window as any).__ecbtNaturalAssetLibraries || [];
    const merged = catalogLoader.resolveEffectiveCatalog
        ? catalogLoader.resolveEffectiveCatalog({
            seed: seedCatalog,
            libraries,
            userOverride: userOverride && typeof userOverride === 'object' ? userOverride : undefined,
        })
        : { catalog: seedCatalog };
    return merged.catalog || {};
}

/**
 * Agrega valores de ativos naturais por elementId e total.
 * @param assetEntries - entradas retornadas pelo extrator
 * @returns mapa por elementId e total acumulado
 */
function _accumulateAssetsByElement(
    assetEntries: Array<{ value: number; elementId?: string }>,
): { byId: Record<string, number>; totalAssets: number } {
    const byId: Record<string, number> = {};
    let totalAssets = 0;
    for (const e of assetEntries) {
        const v = Number(e.value || 0);
        if (!(v > 0)) continue;
        totalAssets += v;
        if (e.elementId) {
            byId[e.elementId] = (byId[e.elementId] || 0) + v;
        }
    }
    return { byId, totalAssets };
}

/**
 * F2.2 (Calvin 2026-06-10): distribui ativos por CC via alocações.
 * Async para garantir que costCenterManager está carregado antes do uso.
 */
async function _computeAssetsByCC(assetByElement: Record<string, number>): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    try {
        if (!assetByElement || Object.keys(assetByElement).length === 0) return out;
        const ccm: any = await import('../governance/costCenterManager.js' as string);
        const allocs = typeof ccm.getAllAllocations === 'function' ? ccm.getAllAllocations() || [] : [];
        const allocsByEl = _groupAllocationsByElement(allocs);
        for (const [elId, value] of Object.entries(assetByElement)) {
            _distributeElementAsset(out, elId, Number(value), allocsByEl.get(elId));
        }
    } catch (e: any) {
        console.debug('[costAnalysisPanel:assets-by-cc]', e?.message || e);
    }
    return out;
}

/**
 * Agrupa alocações por sourceId de elemento.
 * @param allocs - lista de alocações
 * @returns mapa sourceId → alocações
 */
function _groupAllocationsByElement(allocs: any[]): Map<string, any[]> {
    const allocsByEl = new Map<string, any[]>();
    for (const a of allocs) {
        if (a.sourceType !== 'element') continue;
        const list = allocsByEl.get(a.sourceId) || [];
        list.push(a);
        allocsByEl.set(a.sourceId, list);
    }
    return allocsByEl;
}

/**
 * Distribui o valor de um ativo pelos centros de custo alocados.
 * @param out - acumulador por costCenterId
 * @param elId - id do elemento
 * @param value - valor do ativo
 * @param allocations - alocações para o elemento
 */
function _distributeElementAsset(
    out: Record<string, number>,
    elId: string,
    value: number,
    allocations: any[] | undefined,
) {
    if (!allocations || allocations.length === 0) {
        out['_unassigned'] = (out['_unassigned'] || 0) + value;
        return;
    }
    let allocatedPct = 0;
    for (const a of allocations) {
        const frac = (a.percentage || 0) / 100;
        out[a.costCenterId] = (out[a.costCenterId] || 0) + value * frac;
        allocatedPct += a.percentage || 0;
    }
    if (allocatedPct < 100) {
        const remFrac = (100 - allocatedPct) / 100;
        out['_unassigned'] = (out['_unassigned'] || 0) + value * remFrac;
    }
}

// Cache do último cálculo de assets para o ciclo de render atual.
// Renovado a cada chamada de renderCostAnalysisTab.
let _lastAssetsCache: { byId: Record<string, number>; totalAssets: number; byCC: Record<string, number> } = {
    byId: {},
    totalAssets: 0,
    byCC: {},
};

// Guard anti-loop: evita re-render disparar novo _computeAssetsByElement async.
let _isRenderingFromAsync = false;
// ----------------------------------------------------------------
// MAIN RENDER
// ----------------------------------------------------------------
/**
 * Render the full cost analysis tab.
 * Renderiza toda a aba de análise de custos.
 *
 * @param containerIdOverride? - opcional: id alternativo (ex: 'cost-analysis-board-content')
 *   para reusar o mesmo render no modal central de "Tela Central de Custos".
 */
export function renderCostAnalysisTab(containerIdOverride?: string) {
    const containerId = containerIdOverride || 'cost-analysis-content';
    const container = document.getElementById(containerId);
    if (!container) return;
    injectCostAnalysisStyles();
    destroyAllCostCharts();
    const rollup = buildCostRollupWithUncertainty();
    // F2: dispara cálculo assíncrono de ativos em background; quando resolve,
    // re-renderiza tabelas para popular ATIVO + LÍQUIDO. Guard previne loop.
    if (!_isRenderingFromAsync) {
        _computeAssetsByElement().then((res) => {
            const changed = res.totalAssets !== _lastAssetsCache.totalAssets
                || Object.keys(res.byId).length !== Object.keys(_lastAssetsCache.byId).length
                || Object.keys(res.byCC).length !== Object.keys(_lastAssetsCache.byCC).length;
            _lastAssetsCache = res;
            if (!document.getElementById(containerId)) return;
            if (changed) {
                // Re-render completo para popular as tabelas POR ELEMENTO e POR CC.
                _isRenderingFromAsync = true;
                try {
                    renderCostAnalysisTab(containerIdOverride);
                } finally {
                    _isRenderingFromAsync = false;
                }
            } else {
                // Sem mudança: só atualiza KPI banner topo.
                _renderAssetsKpisSection(containerId, rollup);
            }
        }).catch((e: any) => console.debug('[costAnalysisPanel:assets:async]', e?.message || e));
    }
    let html = '';
    html += _renderActionBar(rollup?.uncertainty);
    html += _renderViewToggle();
    if (rollup.grandTotal === 0 && rollup.kpis.elementsWithCost === 0) {
        html += `<div class="ca-empty">${t('noCostData') || 'No cost data. Generate a model or add costs to elements.'}</div>`;
    } else if (currentView === 'synthetic') {
        html += _renderSyntheticView(rollup);
    } else {
        html += _renderDetailedView(rollup);
    }
    container.innerHTML = html;
    // F2: mount slot vazio para os KPIs ATIVO/LÍQUIDO (preenchido no callback).
    _renderAssetsKpisSection(containerId, rollup);
    hydrateIcons(container);
    applyTranslations();
    requestAnimationFrame(() => {
        renderCostCharts(rollup, currentView);
        wireUncertaintyBadge('cost-uncertainty');
        // DEEP-LINK-TOOLS-001 — botão Compartilhar para tools=cost-analysis.
        // Corrigido 2026-06-09 (claude - ui): wire original apontava para
        // toolId='cost-center' (módulo administrativo de centros de custo
        // DIFERENTE deste painel). A entry canônica deste painel é
        // 'cost-analysis' (registrada em deepLinkRegistry.ts no mesmo dia).
        // Pattern idempotente: skip se já existe para sobreviver re-renders
        // via setCostAnalysisView / toggleDrillDown.
        try {
            const actions = container.querySelector('.ca-actions');
            // Limpa botões antigos que apontavam para tool errada (cost-center) —
            // pode ter sido renderizado por versão anterior do código.
            const stale = actions?.querySelector('[data-tool-id="cost-center"]');
            if (stale) stale.remove();
            if (actions && !actions.querySelector('[data-tool-id="cost-analysis"]')) {
                const shareButton = createDeepLinkShareButton({
                    toolId: 'cost-analysis',
                    getPayload: () => ({ view: currentView }),
                    toast: showToast,
                });
                actions.appendChild(shareButton);
            }
        } catch (e: any) {
            console.debug('[costAnalysisPanel:share-button] wire failed', e?.message || e);
        }
    });
}
/**
 * Switch between synthetic and detailed views.
 * Alterna entre visão sintética e detalhada.
 *
 * @param {string} view - 'synthetic' or 'detailed'
 */
export function setCostAnalysisView( view: any) {
    currentView = view;
    expandedElements.clear();
    renderCostAnalysisTab();
}
/**
 * Toggle drill-down for an element in detailed view.
 * @param {string} elementId
 */
export function toggleCostElementDetail( elementId: any) {
    if (expandedElements.has(elementId)) {
        expandedElements.delete(elementId);
    } else {
        expandedElements.add(elementId);
    }
    renderCostAnalysisTab();
}

/**
 * COST-CENTRAL-BOARD-001 F2: renderiza seção de KPIs ATIVO + LÍQUIDO no topo.
 * Sumário: PASSIVO TOTAL (CAPEX+OPEX) | ATIVO TOTAL (capital natural) |
 * LÍQUIDO (ATIVO - PASSIVO) = ECBT Score.
 *
 * Cor: LÍQUIDO verde se >=0, vermelho se <0.
 */
function _renderAssetsKpisSection(containerId: string, rollup: any) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let slot = container.querySelector('.ca-assets-kpi-slot') as HTMLElement | null;
    if (!slot) {
        slot = document.createElement('div');
        slot.className = 'ca-assets-kpi-slot';
        // Inserir após action bar (antes do view toggle).
        const viewToggle = container.querySelector('.ca-view-toggle');
        if (viewToggle && viewToggle.parentElement) {
            viewToggle.parentElement.insertBefore(slot, viewToggle);
        } else {
            container.insertBefore(slot, container.firstChild);
        }
    }
    const totalPassivo = Number(rollup?.grandTotal || 0);
    const totalAtivo = Number(_lastAssetsCache.totalAssets || 0);
    const liquido = totalAtivo - totalPassivo;
    const liquidoClass = liquido >= 0 ? 'ca-net-positive' : 'ca-net-negative';
    const liquidoLabel = t('ecbtScoreNet') || 'LÍQUIDO (Ativo − Passivo)';
    slot.innerHTML = `
        <div class="ca-kpi-row ca-assets-kpi-row" role="region" aria-label="${escapeHtml(t('ecbtScoreSummary') || 'Resumo ECBT Score')}">
            ${_kpiCard(t('liabilityTotal') || 'PASSIVO', formatCurrency(totalPassivo), 'liability')}
            ${_kpiCard(t('assetTotal') || 'ATIVO', formatCurrency(totalAtivo), 'asset')}
            ${_kpiCard(liquidoLabel, formatCurrency(liquido), 'net ' + liquidoClass)}
        </div>`;
}
/**
 * DEEP-LINK-TOOLS-001 Tier-B entry point — invocado por
 * `?tools=cost-analysis[&payload=<b64url>]` via deepLinkDispatcher.
 *
 * Lazy-imports panelManager para evitar ciclo (panelManager carrega tabs
 * que importam este painel). O wrapper centraliza: (1) abrir right-panel
 * na tab cost-analysis, (2) aplicar view do payload, (3) renderizar.
 *
 * @param {*} initialView? - opcional { view?: 'synthetic'|'detailed' }
 */
// Guard contra registro duplicado do observer de manutenção (deep-link
// pode ser chamado 2x em dev/Playwright e queremos só um observer ativo).
let _maintenanceObserverActive = false;

/**
 * COST-CENTRAL-BOARD-001 (Calvin 2026-06-10): abre o tabelão de custos como
 * TELA CENTRAL (modal-xlarge), não como aba lateral espremida em 280px.
 * Reusa renderCostAnalysisTab() apontando para outro container.
 *
 * Calvin lembrava de uma "tela central com tabelão de custos" — sempre foi a
 * view 'detailed' do cost-analysis, mas no painel lateral 280px ficava
 * ilegível. Este handler abre o mesmo conteúdo em modal central.
 */
export function openCostAnalysisBoard(initialView?: 'synthetic' | 'detailed') {
    const modal = document.getElementById('cost-analysis-board-modal');
    if (!modal) {
        // Fallback: se modal não existir no HTML, abre a aba lateral antiga.
        console.debug('[costAnalysisPanel:board] modal ausente, fallback p/ aba lateral');
        const w = window as any;
        if (typeof w.handleOpenCostAnalysis === 'function') w.handleOpenCostAnalysis();
        return;
    }
    if (initialView === 'synthetic' || initialView === 'detailed') {
        currentView = initialView;
        expandedElements.clear();
    } else {
        // Default para detailed (tabelão completo é o que Calvin espera ver).
        currentView = 'detailed';
        expandedElements.clear();
    }
    modal.classList.add('active');
    (modal as HTMLElement).style.display = 'flex';
    renderCostAnalysisTab('cost-analysis-board-content');
    syncDeepLinkUrl('cost-analysis');
}

export function closeCostAnalysisBoard() {
    const modal = document.getElementById('cost-analysis-board-modal');
    if (!modal) return;
    modal.classList.remove('active');
    (modal as HTMLElement).style.display = 'none';
    clearDeepLinkUrl();
    destroyAllCostCharts();
}

export async function openCostAnalysisBoardFromPayload(payload?: any) {
    const view = payload && typeof payload === 'object' ? (payload as any).view : undefined;
    openCostAnalysisBoard(view === 'synthetic' || view === 'detailed' ? view : 'detailed');
}

export async function openCostAnalysisFromPayload(payload?: any) {
    await _ensureModelViewForCostAnalysis();
    await _openCostAnalysisLeftPanelWithRetry();
    if (payload && typeof payload === 'object') {
        const view = (payload as any).view;
        if (view === 'synthetic' || view === 'detailed') {
            currentView = view;
            expandedElements.clear();
        }
    }
    renderCostAnalysisTab();
    // INSTALA MutationObserver de manutenção (claude - ui 2026-06-10):
    // Após o wrapper restaurar view+layout corretamente, algum side-effect
    // posterior do boot (broadcast listener, applySavedView async, etc) está
    // revertendo. O observer dura 5s e re-aplica quando necessário, depois
    // se auto-desconecta para não consumir CPU.
    _installCostAnalysisMaintenanceObserver();
}

/** Garante que o app esteja na view de modelo antes de abrir o painel de custos. */
async function _ensureModelViewForCostAnalysis() {
    try {
        const app = document.getElementById('app');
        const isModel = !!app?.classList.contains('view-group-model');
        if (!isModel) {
            const viewMod: any = await import('../scene/viewRouter.js');
            if (typeof viewMod.switchView === 'function') {
                await viewMod.switchView('3d', { skipAuthGate: true });
            }
        }
    } catch (e: any) {
        console.debug('[costAnalysisPanel:deepLink:switchView]', e?.message || e);
    }
}

/** Abre a tab cost-analysis no painel esquerdo com retry de visibilidade. */
async function _openCostAnalysisLeftPanelWithRetry() {
    try {
        const mod: any = await import('./panelManager.js');
        const tryOpen = () => {
            if (typeof mod.openTabInPanel === 'function') {
                mod.openTabInPanel('left-panel', 'cost-analysis');
            }
        };
        const isPanelVisible = () => {
            const el = document.getElementById('left-panel');
            if (!el) return false;
            if (el.classList.contains('panel-minimized')) return false;
            const rect = el.getBoundingClientRect();
            return rect.width > 20 && rect.height > 100;
        };
        tryOpen();
        for (let attempt = 0; attempt < 5 && !isPanelVisible(); attempt++) {
            await new Promise((r) => setTimeout(r, 200));
            tryOpen();
        }
    } catch (e: any) {
        console.debug('[costAnalysisPanel:deepLink]', e?.message || e);
    }
}

function _installCostAnalysisMaintenanceObserver() {
    if (_maintenanceObserverActive) return;
    _maintenanceObserverActive = true;
    const app = document.getElementById('app');
    const left = document.getElementById('left-panel');
    if (!app || !left) {
        _maintenanceObserverActive = false;
        return;
    }
    let restoreCount = 0;
    const MAX_RESTORES = 10;

    const maintain = async () => {
        if (restoreCount >= MAX_RESTORES) return;
        const needViewFix = !app.classList.contains('view-group-model');
        const needPanelFix =
            left.classList.contains('panel-minimized')
            || getComputedStyle(left).display === 'none';
        if (!needViewFix && !needPanelFix) return;
        restoreCount++;
        console.debug('[cost-analysis:maintain] restoring', {
            restoreCount,
            needViewFix,
            needPanelFix,
        });
        if (needViewFix) {
            try {
                const viewMod: any = await import('../scene/viewRouter.js');
                if (typeof viewMod.switchView === 'function') {
                    await viewMod.switchView('3d', { skipAuthGate: true });
                }
            } catch (e: any) { console.debug('[cost-analysis:view-switch]', e?.message || e); }
        }
        if (needPanelFix) {
            try {
                const mod: any = await import('./panelManager.js');
                if (typeof mod.openTabInPanel === 'function') {
                    mod.openTabInPanel('left-panel', 'cost-analysis');
                }
            } catch (e: any) { console.debug('[cost-analysis:panel-open]', e?.message || e); }
        }
    };

    const observer = new MutationObserver(() => {
        maintain().catch((e: any) => console.debug('[cost-analysis:maintain]', e?.message || e));
    });
    observer.observe(app, { attributes: true, attributeFilter: ['class'] });
    observer.observe(left, { attributes: true, attributeFilter: ['class', 'style'] });

    // Auto-disconnect após 5s para não vazar CPU.
    setTimeout(() => {
        observer.disconnect();
        _maintenanceObserverActive = false;
        console.debug('[cost-analysis:maintain] observer disconnected', { restoreCount });
    }, 5000);
}
// ----------------------------------------------------------------
// ACTION BAR + VIEW TOGGLE
// ----------------------------------------------------------------
/**
 * @param {any} uncertaintyModel
 */
function _renderActionBar( uncertaintyModel: any) {
    const uncertaintyBadge = renderUncertaintyBadge(
        uncertaintyModel || { className: 'grey', metrics: { u: null, detectRate: 0 } },
        { id: 'cost-uncertainty' },
    );
    // COST-CENTRAL-BOARD-001 (Calvin 2026-06-10): botão "Tela Central" expande
    // o painel lateral 280px para modal-xlarge centralizado. Só aparece quando
    // o render está acontecendo no container lateral (não dentro do modal).
    const isInsideBoard = (() => {
        const board = document.getElementById('cost-analysis-board-content');
        if (!board) return false;
        return board.contains(document.querySelector('.ca-actions') as Node);
    })();
    const expandBtn = isInsideBoard
        ? '' // já está no modal central — esconde botão expandir
        : `<button class="btn btn-sm btn-secondary" data-cc-action="cc-c580df1a" title="${t('costAnalysisOpenBoard') || 'Abrir em Tela Central'}">
                <span data-icon="maximize-2" data-icon-size="12px"></span>
            </button>`;
    return `
        <div class="ca-actions">
            <div class="ca-uncertainty-slot">${uncertaintyBadge}</div>
            ${expandBtn}
            <button class="btn btn-sm btn-secondary" data-cc-action="cc-b8bdfbc7" title="${t('editCostCatalog') || 'Edit Cost Catalog'}">
                <span data-icon="settings" data-icon-size="12px"></span>
            </button>
            <button class="btn btn-sm btn-secondary" data-cc-action="cc-17da6d92" title="${t('refresh') || 'Refresh'}">
                <span data-icon="refresh-cw" data-icon-size="12px"></span>
            </button>
            <button class="btn btn-sm btn-secondary" data-cc-action="cc-497c34b9" title="${t('exportCostPDF') || 'Export PDF'}">
                <span data-icon="download" data-icon-size="12px"></span>
                <span>PDF</span>
            </button>
        </div>`;
}
function _renderViewToggle() {
    const synLabel = t('costSynthetic') || 'Summary';
    const detLabel = t('costDetailed') || 'Detailed';
    const synActive = currentView === 'synthetic' ? 'active' : '';
    const detActive = currentView === 'detailed' ? 'active' : '';
    return `
        <div class="ca-view-toggle">
            <button class="ca-view-btn ${synActive}" data-cc-action="cc-3e6eaef7">
                ${synLabel}
            </button>
            <button class="ca-view-btn ${detActive}" data-cc-action="cc-904fe77c">
                ${detLabel}
            </button>
        </div>`;
}
// ----------------------------------------------------------------
// SYNTHETIC VIEW (RESUMO)
// ----------------------------------------------------------------
/**
 * @param {any} rollup
 */
function _renderSyntheticView( rollup: any) {
    let html = '';
    // KPI cards
    html += `
        <div class="ca-kpi-row">
            ${_kpiCard('CAPEX', formatCurrency(rollup.totalCapex), 'capex')}
            ${_kpiCard('OPEX', formatCurrency(rollup.totalOpex), 'opex')}
            ${_kpiCard(t('grandTotal') || 'Total', formatCurrency(rollup.grandTotal), 'total')}
            ${_kpiCard(t('elementsWithCost') || 'Elements', String(rollup.kpis.elementsWithCost), 'count')}
        </div>`;
    // Second row of KPIs
    html += `
        <div class="ca-kpi-row">
            ${_kpiCard(t('campaignsWithCost') || 'Campaigns', String(rollup.kpis.campaignsWithCost), 'count')}
            ${_kpiCard(t('avgCostPerElement') || 'Avg/Element', formatCurrency(rollup.kpis.avgCostPerElement), 'avg')}
        </div>`;
    // CAPEX vs OPEX by Year chart
    if (rollup.timeline.length > 0) {
        html += `
            <div class="ca-section">
                <div class="ca-section-title">${t('costByFiscalYear') || 'CAPEX vs OPEX by Fiscal Year'}</div>
                <div class="ca-chart-container">
                    <canvas id="cost-chart-by-year"></canvas>
                </div>
            </div>`;
    }
    // Two side-by-side charts
    const hasFamilies = Object.keys(rollup.byFamily).some((f: any) => rollup.byFamily[f].total > 0);
    const hasCampaigns = Object.keys(rollup.byCampaign).length > 0;
    if (hasFamilies || hasCampaigns) {
        html += `<div class="ca-charts-row">`;
        if (hasFamilies) {
            html += `
                <div class="ca-chart-half">
                    <div class="ca-section-title">${t('costByFamily') || 'Cost by Family'}</div>
                    <div class="ca-chart-container ca-chart-sm">
                        <canvas id="cost-chart-by-family"></canvas>
                    </div>
                </div>`;
        }
        if (hasCampaigns) {
            html += `
                <div class="ca-chart-half">
                    <div class="ca-section-title">${t('costByCampaign') || 'Campaign Costs'}</div>
                    <div class="ca-chart-container ca-chart-sm">
                        <canvas id="cost-chart-campaigns"></canvas>
                    </div>
                </div>`;
        }
        html += `</div>`;
    }
    // L4 summary (if WBS data exists)
    if (rollup.l4Summary.itemCount > 0) {
        const l4 = rollup.l4Summary;
        html += `
            <div class="ca-section">
                <div class="ca-section-title">${t('l4ProjectCosts') || 'Project Costs (WBS)'}</div>
                <div class="ca-kpi-row ca-kpi-sm">
                    ${_kpiCard('BAC', formatCurrency(l4.wbsBAC), 'l4')}
                    ${_kpiCard('AC', formatCurrency(l4.wbsAC), 'l4')}
                    ${_kpiCard('EAC', formatCurrency(l4.wbsEAC), 'l4')}
                </div>
            </div>`;
    }
    // Cost Center breakdown
    html += _renderCostCenterSection(rollup);
    // Benchmark comparisons
    if (rollup.benchmarks) {
        html += _renderBenchmarkSection(rollup);
    }
    return html;
}
/**
 * Renderiza seção de benchmarks comparativos com indicadores ▲▼.
 * @param {any} rollup
 * @returns {string}
 */
function _renderBenchmarkSection( rollup: any) {
    const bm = rollup.benchmarks;
    const cur = rollup.currency || 'BRL';
    const benchmarkDefs = [
        {
            label: t('benchmark.cost_per_meter') || 'Cost/meter (well)',
            actual: bm.costPerMeter,
            ref: bm.costPerMeterRef,
            unit: `${cur}/m`,
        },
        {
            label: t('benchmark.cost_per_obs') || 'Cost/observation',
            actual: bm.costPerObservation,
            ref: bm.costPerObservationRef,
            unit: `${cur}/obs`,
        },
        {
            label: t('benchmark.cost_per_campaign') || 'Cost/campaign',
            actual: bm.costPerCampaign,
            ref: bm.costPerCampaignRef,
            unit: cur,
        },
        {
            label: t('benchmark.capex_opex_ratio') || 'CAPEX:OPEX ratio',
            actual: bm.capexOpexRatio,
            ref: bm.capexOpexRatioRef,
            unit: '×',
        },
        {
            label: t('benchmark.cost_per_element') || 'Cost/element',
            actual: bm.costPerElement,
            ref: bm.costPerElementRef,
            unit: cur,
        },
        {
            label: t('benchmark.analytical_per_param') || 'Analytical/param',
            actual: bm.analyticalCostPerParam,
            ref: bm.analyticalCostPerParamRef,
            unit: `${cur}/param`,
        },
    ];
    // Filtra apenas benchmarks com dados disponíveis
    const available = benchmarkDefs.filter((b: any) => b.actual != null);
    if (available.length === 0) return '';
    let html = `
        <div class="ca-section">
            <div class="ca-section-title">${t('benchmark.title') || 'Industry Benchmarks'}</div>
            <div class="ca-benchmark-grid">`;
    for (const b of available) {
        const ratio = b.ref > 0 ? b.actual / b.ref : 1;
        const isBelow = ratio <= 1.0;
        const indicator = isBelow ? '▼' : '▲';
        const colorClass =
            ratio <= 0.8
                ? 'benchmark-excellent'
                : ratio <= 1.0
                  ? 'benchmark-good'
                  : ratio <= 1.2
                    ? 'benchmark-warn'
                    : 'benchmark-over';
        const pct = Math.round(Math.abs(ratio - 1.0) * 100);
        html += `
            <div class="ca-benchmark-card ${colorClass}">
                <div class="ca-benchmark-label">${escapeHtml(b.label)}</div>
                <div class="ca-benchmark-actual">${_fmtNum(b.actual)} ${escapeHtml(b.unit)}</div>
                <div class="ca-benchmark-ref">${t('benchmark.ref') || 'Ref'}: ${_fmtNum(b.ref)} ${escapeHtml(b.unit)}</div>
                <div class="ca-benchmark-indicator ${colorClass}">
                    <span class="ca-benchmark-arrow">${indicator}</span>
                    <span>${pct}% ${isBelow ? t('benchmark.below') || 'below' : t('benchmark.above') || 'above'}</span>
                </div>
            </div>`;
    }
    html += `</div></div>`;
    return html;
}
/** Formata número para exibição compacta
 * @param {number|null|undefined} n
 */
function _fmtNum( n: any) {
    if (n == null) return '—';
    if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
    return n.toFixed(n < 10 ? 2 : 0);
}
/**
 * @param {any} label
 * @param {any} value
 * @param {any} type
 */
function _kpiCard( label: any, value: any, type: any) {
    return `
        <div class="ca-kpi ca-kpi-${type}">
            <div class="ca-kpi-label">${escapeHtml(label)}</div>
            <div class="ca-kpi-value">${escapeHtml(value)}</div>
        </div>`;
}

/**
 * Renderiza valuation badges (provenance + EIS integrity + GUM range)
 * para um ValuationResult. Opt-in — caller verifica se há dados.
 *
 * SPEC_COST_VALUATION_PROVENANCE_CONSOLIDATION F3 wire:
 * - Quando rollup item carrega `valuation: ValuationResult`, badges aparecem
 * - Quando ausente, retorna '' (zero impact em consumer legacy)
 *
 * @param item objeto possivelmente com .valuation: ValuationResult
 * @returns HTML inline ou string vazia
 */
function _renderValuationBadgesIfPresent(item: any): string {
    if (!item || !item.valuation) return '';
    return renderValuationBadges(item.valuation);
}
// ----------------------------------------------------------------
// DETAILED VIEW (DETALHADO)
// ----------------------------------------------------------------
/**
 * @param {any} rollup
 */
function _renderDetailedView( rollup: any) {
    let html = '';
    // By Element
    html += _renderElementsSection(rollup);
    // By Campaign
    html += _renderCampaignsSection(rollup);
    // By Fiscal Year
    html += _renderFiscalYearSection(rollup);
    // By Category
    html += _renderCategorySection(rollup);
    // By Cost Center
    html += _renderCostCenterSection(rollup);
    return html;
}
// --- By Cost Center ---
/**
 * @param {any} rollup
 */
function _renderCostCenterSection( rollup: any) {
    const bcc = rollup.byCostCenter;
    if (!bcc || Object.keys(bcc).length === 0) return '';
    const _cur = rollup.currency || 'BRL';
    // F2.2 (Calvin 2026-06-10): assets já distribuídos por CC pelo
    // _computeAssetsByElement async (mais robusto que lazy import inline).
    const assetByCC = _lastAssetsCache.byCC || {};
    let rows = '';
    // Ordenação por LÍQUIDO desc (alinha tabela CC com direção ECBT Score)
    const entries = Object.entries(bcc).sort((a: any, b: any) => {
        const aLiq = (assetByCC[a[0]] || 0) - Number((a[1] as any).total || 0);
        const bLiq = (assetByCC[b[0]] || 0) - Number((b[1] as any).total || 0);
        return bLiq - aLiq;
    });
    for (const [ccId, data] of entries as [string, any][]) {
        const ativo = Number(assetByCC[ccId] || 0);
        const passivo = Number(data.total || 0);
        const liquido = ativo - passivo;
        const liqClass = liquido >= 0 ? 'ca-td-net-positive' : 'ca-td-net-negative';
        const varianceClass = data.variance > 0 ? 'ca-benchmark-green' : data.variance < 0 ? 'ca-benchmark-red' : '';
        const varianceSign = data.variance > 0 ? '+' : '';
        rows += `
            <tr>
                <td>${escapeHtml(data.code)}</td>
                <td>${escapeHtml(data.name)}</td>
                <td class="ca-td-num">${formatCurrency(data.capex)}</td>
                <td class="ca-td-num">${formatCurrency(data.opex)}</td>
                <td class="ca-td-num ca-td-bold">${formatCurrency(passivo)}</td>
                <td class="ca-td-num ca-td-asset">${ativo > 0 ? formatCurrency(ativo) : '—'}</td>
                <td class="ca-td-num ${liqClass}">${formatCurrency(liquido)}</td>
                <td class="ca-td-num">${data.budget > 0 ? formatCurrency(data.budget) : '—'}</td>
                <td class="ca-td-num ${varianceClass}">
                    ${data.budget > 0 ? `${varianceSign}${formatCurrency(data.variance)} (${data.variancePct.toFixed(1)}%)` : '—'}
                </td>
            </tr>`;
    }
    return `
        <div class="ca-section">
            <div class="ca-section-title">${t('byCostCenter') || 'By Cost Center'}</div>
            <div class="ca-chart-container ca-chart-sm">
                <canvas id="cost-chart-by-cc"></canvas>
            </div>
            <div class="ca-cc-table-overflow">
                <table class="ca-table">
                    <thead>
                        <tr>
                            <th>${t('costCenterCode') || 'Code'}</th>
                            <th>${t('costCenterName') || 'Name'}</th>
                            <th class="ca-cc-th-right">CAPEX</th>
                            <th class="ca-cc-th-right">OPEX</th>
                            <th class="ca-cc-th-right">${t('liabilityTotal') || 'PASSIVO'}</th>
                            <th class="ca-cc-th-right">${t('assetTotal') || 'ATIVO'}</th>
                            <th class="ca-cc-th-right">${t('ecbtScoreNet') || 'LÍQUIDO'}</th>
                            <th class="ca-cc-th-right">${t('costCenterBudget') || 'Budget'}</th>
                            <th class="ca-cc-th-right">${t('costCenterVariance') || 'Variance'}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}

// --- By Element ---
/**
 * @param {any} rollup
 */
function _renderElementsSection( rollup: any) {
    const entries = Object.entries(rollup.byElement);
    if (entries.length === 0) return '';
    // F2: ordena por LÍQUIDO descendente (ativo - passivo) — Calvin direção
    // 2026-06-05: ECBT Score é indicador principal, não custo bruto.
    const assets = _lastAssetsCache.byId || {};
    entries.sort((a: any, b: any) => {
        const aAtivo = Number(assets[a[0]] || 0);
        const aPassivo = Number(a[1].total || 0);
        const bAtivo = Number(assets[b[0]] || 0);
        const bPassivo = Number(b[1].total || 0);
        return (bAtivo - bPassivo) - (aAtivo - aPassivo);
    });
    let rows = '';
    for (const [elId, data] of entries as [string, any][]) {
        const expanded = expandedElements.has(elId);
        const chevron = expanded ? '&#9660;' : '&#9654;';
        const ativo = Number(assets[elId] || 0);
        const passivo = Number(data.total || 0);
        const liquido = ativo - passivo;
        const liquidoClass = liquido >= 0 ? 'ca-td-net-positive' : 'ca-td-net-negative';
        rows += `
            <tr class="ca-table-row ca-clickable" data-cc-call-click="handleCostElementDrillDown|s:${encodeURIComponent(`${elId}`)}">
                <td><span class="ca-chevron">${chevron}</span> ${escapeHtml(data.name)}</td>
                <td class="ca-td-family">${escapeHtml(data.family)}</td>
                <td class="ca-td-num">${formatCurrency(data.capex)}</td>
                <td class="ca-td-num">${formatCurrency(data.opex)}</td>
                <td class="ca-td-num ca-td-bold">${formatCurrency(passivo)}</td>
                <td class="ca-td-num ca-td-asset">${ativo > 0 ? formatCurrency(ativo) : '—'}</td>
                <td class="ca-td-num ${liquidoClass}">${formatCurrency(liquido)}</td>
            </tr>`;
        if (expanded) {
            rows += _renderElementDrillDown(elId);
        }
    }
    return `
        <div class="section ${window.sectionClass?.('cost-by-element') ?? 'collapsed'}" data-section-id="cost-by-element">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('costByElement') || 'By Element'} (${entries.length})</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <table class="ca-table">
                    <thead>
                        <tr>
                            <th>${t('name') || 'Name'}</th>
                            <th>${t('family') || 'Family'}</th>
                            <th>CAPEX</th>
                            <th>OPEX</th>
                            <th>${t('liabilityTotal') || 'PASSIVO'}</th>
                            <th>${t('assetTotal') || 'ATIVO'}</th>
                            <th>${t('ecbtScoreNet') || 'LÍQUIDO'}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}
/**
 * @param {any} elementId
 */
function _renderElementDrillDown( elementId: any) {
    const detail = getCostByElement(elementId);
    if (!detail) return '';
    let html = '<tr class="ca-detail-row"><td colspan="7"><div class="ca-detail">';
    // Add year button
    html += `<div class="ca-add-year-bar">
        <button class="btn btn-xs btn-secondary ca-add-year-btn"
                data-cc-call-click="handleAddCostYear|s:${encodeURIComponent(`${escapeHtml(elementId)}`)}">
            + ${t('addCostYear') || 'Add Year'}
        </button>
    </div>`;
    // Costs by year
    if (detail.costsByYear.length > 0) {
        html += `<div class="ca-detail-sub">${t('costByFiscalYear') || 'By Fiscal Year'}:</div>`;
        for (const yr of detail.costsByYear) {
            html += `<div class="ca-detail-line">
                <span class="ca-detail-year">${yr.fiscalYear}</span>
                <select data-field-meta="true" data-field-meta-key="auto-pos:costAnalysisPanel:select:L488" class="ca-basis-select" data-cc-call-change="handleChangeCostBasis|s:${encodeURIComponent(`${escapeHtml(elementId)}`)}|j:${encodeURIComponent(String(yr.fiscalYear))}|v">
                    <option value="estimate" ${yr.basis === 'estimate' ? 'selected' : ''}>estimate</option>
                    <option value="budget" ${yr.basis === 'budget' ? 'selected' : ''}>budget</option>
                    <option value="actual" ${yr.basis === 'actual' ? 'selected' : ''}>actual</option>
                </select>
                CAPEX ${formatCurrency(yr.capex)} | OPEX ${formatCurrency(yr.opex)}
                = <strong>${formatCurrency(yr.total)}</strong>
                <button class="ca-btn-remove" title="${t('removeCostYear') || 'Remove year'}"
                        data-cc-call-click="handleRemoveCostYear|s:${encodeURIComponent(`${escapeHtml(elementId)}`)}|j:${encodeURIComponent(String(yr.fiscalYear))}">&#10005;</button>
            </div>`;
            // Item-level breakdown with inline edit
            if (yr.items.length > 0) {
                html += '<div class="ca-detail-items">';
                for (const item of yr.items) {
                    html += `<span class="ca-item">
                        ${item.categoryId}.${item.itemId}:
                        <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysisPanel:input:L505" class="ca-inline-input" type="number" step="0.01" value="${item.amount}"
                               data-cc-call-input="handleElementCostItemChange|s:${encodeURIComponent(`${escapeHtml(elementId)}`)}|j:${encodeURIComponent(String(yr.fiscalYear))}|s:${encodeURIComponent(`${escapeHtml(item.categoryId)}`)}|s:${encodeURIComponent(`${escapeHtml(item.itemId)}`)}|v">
                    </span>`;
                }
                html += '</div>';
            }
        }
    }
    // Observation costs
    if (detail.observationCosts.length > 0) {
        html += `<div class="ca-detail-sub">${t('observationCosts') || 'Observation Costs'} (${detail.observationCosts.length}):</div>`;
        for (const oc of detail.observationCosts.slice(0, 10)) {
            html += `<div class="ca-detail-line">
                <span class="ca-detail-param">${escapeHtml(oc.parameter)}</span>
                <span class="ca-detail-badge">${oc.source}</span>
                ${formatCurrency(oc.total)}
            </div>`;
        }
        if (detail.observationCosts.length > 10) {
            html += `<div class="ca-detail-more">+${detail.observationCosts.length - 10} more</div>`;
        }
    }
    html += '</div></td></tr>';
    return html;
}
// --- By Campaign ---
/**
 * @param {any} rollup
 */
function _renderCampaignsSection( rollup: any) {
    const entries = Object.entries(rollup.byCampaign);
    if (entries.length === 0) return '';
    entries.sort((a: any, b: any) => b[1].total - a[1].total);
    let rows = '';
    for (const [, data] of entries as [string, any][]) {
        const dateStr = data.date ? new Date(data.date).toLocaleDateString() : '-';
        rows += `
            <tr class="ca-table-row">
                <td>${escapeHtml(data.name)}</td>
                <td>${dateStr}</td>
                <td class="ca-td-num ca-td-bold">${formatCurrency(data.total)}</td>
            </tr>`;
    }
    return `
        <div class="section ${window.sectionClass?.('cost-by-campaign') ?? 'collapsed'}" data-section-id="cost-by-campaign">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('costByCampaign') || 'By Campaign'} (${entries.length})</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <table class="ca-table">
                    <thead>
                        <tr>
                            <th>${t('campaign') || 'Campaign'}</th>
                            <th>${t('date') || 'Date'}</th>
                            <th>${t('grandTotal') || 'Total'}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
}
// --- By Fiscal Year ---
/**
 * @param {any} rollup
 */
function _renderFiscalYearSection( rollup: any) {
    if (rollup.timeline.length === 0) return '';
    let rows = '';
    for (const yr of rollup.timeline) {
        rows += `
            <tr class="ca-table-row">
                <td>${yr.fiscalYear}</td>
                <td class="ca-td-num">${formatCurrency(yr.capex)}</td>
                <td class="ca-td-num">${formatCurrency(yr.opex)}</td>
                <td class="ca-td-num ca-td-bold">${formatCurrency(yr.total)}</td>
                <td class="ca-td-num">${formatCurrency(yr.cumulative)}</td>
            </tr>`;
    }
    return `
        <div class="section ${window.sectionClass?.('cost-by-year') ?? 'collapsed'}" data-section-id="cost-by-year">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('costByFiscalYear') || 'By Fiscal Year'}</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">
                <table class="ca-table">
                    <thead>
                        <tr>
                            <th>${t('fiscalYear') || 'Year'}</th>
                            <th>CAPEX</th>
                            <th>OPEX</th>
                            <th>${t('grandTotal') || 'Total'}</th>
                            <th>${t('cumulative') || 'Cumul.'}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="ca-chart-container ca-chart-sm ca-chart-mt">
                    <canvas id="cost-chart-cumulative"></canvas>
                </div>
            </div>
        </div>`;
}
// --- By Category ---
/**
 * @param {any} rollup
 */
function _renderCategorySection( rollup: any) {
    const cats = rollup.byCategory;
    if (!cats || Object.keys(cats).length === 0) return '';
    let html = '';
    for (const [catId, items] of Object.entries(cats) as [string, any][]) {
        const itemEntries = (Object.entries(items) as [string, number][])
            .filter(([, v]) => v > 0)
            .sort((a: any, b: any) => b[1] - a[1]);
        if (itemEntries.length === 0) continue;
        const catLabel = catId === 'capex' ? t('capexItems') || 'CAPEX Items' : t('opexItems') || 'OPEX Items';
        const catTotal = itemEntries.reduce((s, [, v]) => s + v, 0);
        let itemRows = '';
        for (const [itemId, amount] of itemEntries) {
            const pct = catTotal > 0 ? ((amount / catTotal) * 100).toFixed(1) : '0.0';
            itemRows += `
                <tr class="ca-table-row">
                    <td>${escapeHtml(itemId)}</td>
                    <td class="ca-td-num">${formatCurrency(amount)}</td>
                    <td class="ca-td-num">${pct}%</td>
                </tr>`;
        }
        html += `
            <div class="ca-category-block">
                <div class="ca-category-header">${catLabel} — ${formatCurrency(catTotal)}</div>
                <table class="ca-table ca-table-compact">
                    <thead>
                        <tr><th>Item</th><th>${t('amount') || 'Amount'}</th><th>%</th></tr>
                    </thead>
                    <tbody>${itemRows}</tbody>
                </table>
            </div>`;
    }
    if (!html) return '';
    return `
        <div class="section ${window.sectionClass?.('cost-by-category') ?? 'collapsed'}" data-section-id="cost-by-category">
            <div class="section-header" data-cc-action="cc-1cfbc592">
                <span>${t('costByCategory') || 'By Category'}</span>
                <span class="section-chevron">&#9660;</span>
            </div>
            <div class="section-content">${html}</div>
        </div>`;
}
// ----------------------------------------------------------------
// STYLES (injected dynamically)
// ----------------------------------------------------------------
/** @deprecated Styles moved to app/css/cost-analysis.css — loaded via <link> tag */
function injectCostAnalysisStyles() {
    // no-op: CSS now loaded from cost-analysis.css
}
