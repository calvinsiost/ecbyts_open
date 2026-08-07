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
   COST ANALYSIS HANDLERS — Window-level functions for cost tab
   Handlers globais para a aba de análise de custos
   ================================================================ */
import { renderCostAnalysisTab, setCostAnalysisView, toggleCostElementDetail, openCostAnalysisBoard, closeCostAnalysisBoard } from '../ui/costAnalysisPanel.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { isCapabilityEnabled } from '../../config/libraryCategories.js';
import { escapeHtml } from '../helpers/html.js';
import { getCostCatalog, getCurrency, getEscalationRate, saveCostOverrides, resetCostCatalog, exportCostCatalog, importCostCatalog, } from '../../core/ingestion/documents/costCatalog.js';
import { hydrateIcons } from '../ui/icons.js';
import { openTabInPanel } from '../ui/panelManager.js';
import { createLogger } from '../helpers/logger.js';
const log = createLogger('CostAnalysis');
/**
 * Open the cost analysis tab in the side panel layout.
 * Abre a aba de análise de custos no layout lateral.
 */
function handleOpenCostAnalysis() {
    // MOD-LIB-MIG-001 M2 — respeita o toggle do Library Hub. Default = enabled.
    if (!isCapabilityEnabled('costAnalysis')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    // CORREÇÃO 2026-06-10 (claude - ui): tab 'cost-analysis' está mapeada para
    // LEFT panel em panelManager.ts:1765 (`'cost-analysis': 'left'`). Versão
    // anterior chamava 'right-panel' → restaurava painel errado, deep-link e
    // click do HUD não abriam nada visível.
    // Restaura left-panel se minimizado e ativa a tab (bug reproduzido 2026-04-12:
    // tabBtn.click() em painel com panel-minimized não surte efeito visível).
    openTabInPanel('left-panel', 'cost-analysis');
}
/**
 * Toggle between synthetic/detailed views.
 * @param {string} view - 'synthetic' or 'detailed'
 */
function handleCostAnalysisViewToggle( view: any) {
    setCostAnalysisView(view);
}
/**
 * Refresh the cost analysis panel.
 */
function handleRefreshCostAnalysis() {
    renderCostAnalysisTab();
    showToast(t('costAnalysisRefreshed') || 'Cost data refreshed', 'success');
}
/**
 * Export cost analysis as PDF.
 * Exporta análise de custos em PDF.
 */
function handleExportCostPDF() {
    import('../ui/costPdfExport.js' as string)
        .then((mod: any) => {
        mod.exportCostAnalysisPDF();
    })
        .catch((err: any) => {
        log.error('PDF export failed', err.message);
        showToast(t('costAnalysis.pdfExportFailed'), 'error');
    });
}
/**
 * Drill-down into element cost details.
 * @param {string} elementId
 */
function handleCostElementDrillDown( elementId: any) {
    toggleCostElementDetail(elementId);
}
// ----------------------------------------------------------------
// COST CATALOG EDITOR - Modal para editar preços de referência
// ----------------------------------------------------------------
/**
 * Open the cost catalog editor modal.
 * Abre modal para editar catálogo de custos de referência.
 */
function handleOpenCostCatalogEditor() {
    _renderCostCatalogModal();
}
/**
 * Close the cost catalog editor modal.
 */
function handleCloseCostCatalogEditor() {
    const modal = document.getElementById('cost-catalog-modal');
    if (modal)
        modal.remove();
}
/**
 * Read a grouped set of inputs keyed by "group.field" into a nested object.
 * Pure DOM read; returns an empty object when no matching inputs exist.
 */
function _readGroupedInputs(modal: HTMLElement, selector: string, dataAttr: string): Record<string, Record<string, number>> {
    const inputs: NodeListOf<HTMLElement> = modal.querySelectorAll(selector);
    if (inputs.length === 0) return {};
    const grouped: Record<string, Record<string, number>> = {};
    for (const input of inputs as any) {
        const [group, field] = (input.dataset[dataAttr] || '').split('.');
        if (!group || !field) continue;
        if (!grouped[group]) grouped[group] = {};
        grouped[group][field] = parseFloat(input.value) || 0;
    }
    return grouped;
}

/**
 * Collect all overrides from the cost catalog modal form.
 */
function _collectCostOverrides(modal: HTMLElement): any {
    const overrides: any = {};
    const currencyInput = modal.querySelector('[data-field="currency"]') as HTMLInputElement | null;
    if (currencyInput) overrides.currency = currencyInput.value.trim().toUpperCase() || 'BRL';
    const escInput = modal.querySelector('[data-field="escalationRate"]') as HTMLInputElement | null;
    if (escInput) overrides.escalationRate = parseFloat(escInput.value) / 100 || 0;
    const elementCosts = _readGroupedInputs(modal, '[data-el-cost]', 'elCost');
    if (Object.keys(elementCosts).length > 0) overrides.elementCosts = elementCosts;
    const analyticalPrices = _readGroupedInputs(modal, '[data-an-price]', 'anPrice');
    if (Object.keys(analyticalPrices).length > 0) overrides.analyticalPrices = analyticalPrices;
    return overrides;
}

/**
 * Save cost catalog overrides from the modal form.
 * Salva alterações do catálogo a partir do formulário.
 */
function handleSaveCostCatalog() {
    const modal = document.getElementById('cost-catalog-modal');
    if (!modal) return;
    const overrides = _collectCostOverrides(modal);
    saveCostOverrides(overrides);
    handleCloseCostCatalogEditor();
    renderCostAnalysisTab();
    showToast(t('costCatalogSaved') || 'Cost catalog saved', 'success');
}
/**
 * Reset cost catalog to defaults.
 */
function handleResetCostCatalog() {
    resetCostCatalog();
    handleCloseCostCatalogEditor();
    renderCostAnalysisTab();
    showToast(t('costCatalogReset') || 'Cost catalog reset to defaults', 'info');
}
/**
 * Export cost catalog as JSON file.
 */
function handleExportCostCatalog() {
    const data = exportCostCatalog();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ecbyts-cost-catalog.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast(t('costCatalogExported') || 'Cost catalog exported', 'success');
}
/**
 * Import cost catalog from JSON file.
 */
function handleImportCostCatalog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
        const tgt = (e.target);
        const file = tgt?.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = (ev: any) => {
            try {
                const result = (ev.target?.result || '');
                const data = JSON.parse(result);
                importCostCatalog(data);
                handleCloseCostCatalogEditor();
                _renderCostCatalogModal(); // Re-open with imported data
                renderCostAnalysisTab();
                showToast(t('costCatalogImported') || 'Cost catalog imported', 'success');
            }
            catch (err: any) {
                log.error('Cost catalog import failed', (err)?.message);
                showToast(t('costAnalysis.invalidJSON'), 'error');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}
/**
 * Render the cost catalog editor modal.
 * Renderiza o modal de edição do catálogo de custos.
 */
function _renderCostCatalogModal() {
    // Remove existing
    const existing = document.getElementById('cost-catalog-modal');
    if (existing)
        existing.remove();
    const catalog = getCostCatalog();
    const currency = getCurrency();
    const escRate = (getEscalationRate() * 100).toFixed(1);
    // Element costs section
    let elCostsHtml = '';
    for (const [family, costs] of Object.entries(catalog.elementCosts) as [string, any][]) {
        elCostsHtml += `
            <div class="cce-row">
                <span class="cce-label">${escapeHtml(family)}</span>
                <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L235" class="cce-input" type="number" step="1" value="${costs.drilling}" data-el-cost="${family}.drilling" title="${t('costAnalysis.drillingTitle', { currency })}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L236" class="cce-input" type="number" step="1" value="${costs.installation}" data-el-cost="${family}.installation" title="${t('costAnalysis.installationTitle', { currency })}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L237" class="cce-input" type="number" step="1" value="${costs.decommission}" data-el-cost="${family}.decommission" title="${t('costAnalysis.decommissionTitle', { currency })}">
            </div>`;
    }
    // Analytical prices section (top 20 most common)
    const commonParams = (Object.entries(catalog.analyticalPrices) as [string, any][])
        .filter(([, v]) => v.price > 0)
        .sort((a: any, b: any) => b[1].price - a[1].price)
        .slice(0, 20);
    let anPricesHtml = '';
    for (const [param, info] of commonParams) {
        anPricesHtml += `
            <div class="cce-row">
                <span class="cce-label">${escapeHtml(param)}</span>
                <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L252" class="cce-input" type="number" step="1" value="${info.price}" data-an-price="${param}.price" title="${t('costAnalysis.priceTitle', { currency })}">
                <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L253" class="cce-input" type="number" step="1" value="${info.samplingCost}" data-an-price="${param}.samplingCost" title="${t('costAnalysis.samplingTitle', { currency })}">
                <span class="cce-method">${escapeHtml(info.method)}</span>
            </div>`;
    }
    const modal = document.createElement('div');
    modal.id = 'cost-catalog-modal';
    modal.className = 'async-dialog-overlay';
    modal.innerHTML = `
        <div class="async-dialog" style="max-width:560px;max-height:80vh;overflow:hidden;display:flex;flex-direction:column;">
            <div class="async-dialog-header">
                <h3 style="margin:0;font-size:0.9rem;">${t('editCostCatalog') || 'Cost Catalog Editor'}</h3>
                <button class="async-dialog-close" data-cc-action="cc-5af43bd8">&#10005;</button>
            </div>
            <div style="overflow-y:auto;flex:1;padding:0.8rem;">
                <!-- General settings -->
                <div class="cce-section">
                    <div class="cce-section-title">${t('generalSettings') || 'General'}</div>
                    <div class="cce-row">
                        <span class="cce-label">${t('currency') || 'Currency'}</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L273" class="cce-input" type="text" value="${escapeHtml(currency)}" data-field="currency" style="width:60px;">
                    </div>
                    <div class="cce-row">
                        <span class="cce-label">${t('escalationRate') || 'Escalation (%/yr)'}</span>
                        <input data-field-meta="true" data-field-meta-key="auto-pos:costAnalysis:input:L277" class="cce-input" type="number" step="0.1" value="${escRate}" data-field="escalationRate" style="width:60px;">
                    </div>
                </div>

                <!-- Element costs -->
                <div class="cce-section">
                    <div class="cce-section-title">${t('elementInstallCosts') || 'Element Install Costs'}</div>
                    <div class="cce-header-row">
                        <span class="cce-label">${t('family') || 'Family'}</span>
                        <span class="cce-col-header">Drilling/m</span>
                        <span class="cce-col-header">Install</span>
                        <span class="cce-col-header">Decomm.</span>
                    </div>
                    ${elCostsHtml}
                </div>

                <!-- Analytical prices -->
                <div class="cce-section">
                    <div class="cce-section-title">${t('analyticalPrices') || 'Analytical Prices'}</div>
                    <div class="cce-header-row">
                        <span class="cce-label">${t('parameter') || 'Parameter'}</span>
                        <span class="cce-col-header">Price</span>
                        <span class="cce-col-header">Sampling</span>
                        <span class="cce-col-header">Method</span>
                    </div>
                    ${anPricesHtml}
                </div>
            </div>
            <div class="async-dialog-footer" style="display:flex;gap:0.3rem;justify-content:space-between;padding:0.5rem 0.8rem;border-top:1px solid var(--border-color,#ddd);">
                <div style="display:flex;gap:0.3rem;">
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-53411c82">Import</button>
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-9c006ccb">Export</button>
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-2ff0e62c">Reset</button>
                </div>
                <div style="display:flex;gap:0.3rem;">
                    <button class="btn btn-sm btn-secondary" data-cc-action="cc-5af43bd8">${t('cancel') || 'Cancel'}</button>
                    <button class="btn btn-sm btn-primary" data-cc-action="cc-29db4652">${t('save') || 'Save'}</button>
                </div>
            </div>
        </div>`;
    // Inject styles if not present
    if (!document.getElementById('cost-catalog-editor-styles')) {
        const style = document.createElement('style');
        style.id = 'cost-catalog-editor-styles';
        style.textContent = `
            .cce-section { margin-bottom: 0.8rem; }
            .cce-section-title {
                font-size: 0.7rem; font-weight: 600; text-transform: uppercase;
                letter-spacing: 0.3px; color: var(--text-secondary); margin-bottom: 0.3rem;
                padding-bottom: 0.2rem; border-bottom: 1px solid var(--border-color, #ddd);
            }
            .cce-header-row, .cce-row {
                display: flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0;
            }
            .cce-header-row { font-size: 0.65rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
            .cce-label { flex: 1; font-size: 0.75rem; min-width: 80px; }
            .cce-col-header { width: 70px; text-align: right; font-size: 0.6rem; }
            .cce-input {
                width: 70px; text-align: right; font-size: 0.75rem;
                padding: 2px 4px; border: 1px solid var(--border-color, #ddd);
                border-radius: 3px; background: var(--bg-secondary, #fafafa);
            }
            .cce-input:focus { border-color: var(--primary-500, #3b6bff); outline: none; }
            .cce-method { font-size: 0.65rem; color: var(--text-secondary); width: 80px; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        `;
        document.head.appendChild(style);
    }
    document.body.appendChild(modal);
    hydrateIcons(modal);
}
/**
 * COST-CENTRAL-BOARD-001 (Calvin 2026-06-10):
 * abre o tabelão de custos como TELA CENTRAL (modal-xlarge), não como aba
 * lateral 280px. Calvin lembrava de "tela central" — sempre foi a view
 * detailed do cost-analysis, mas no painel lateral ficava ilegível.
 */
function handleOpenCostAnalysisBoard() {
    if (!isCapabilityEnabled('costAnalysis')) {
        showToast(
            t('library.capabilityDisabled')
                || 'Este módulo está desativado no Library Hub. Reative para usar.',
            'warning',
        );
        return;
    }
    openCostAnalysisBoard('detailed');
}
function handleCloseCostAnalysisBoard() {
    closeCostAnalysisBoard();
}
export const costAnalysisHandlers = {
    handleOpenCostAnalysis,
    handleOpenCostAnalysisBoard,
    handleCloseCostAnalysisBoard,
    handleCostAnalysisViewToggle,
    handleRefreshCostAnalysis,
    handleExportCostPDF,
    handleCostElementDrillDown,
    handleOpenCostCatalogEditor,
    handleCloseCostCatalogEditor,
    handleSaveCostCatalog,
    handleResetCostCatalog,
    handleExportCostCatalog,
    handleImportCostCatalog,
};
