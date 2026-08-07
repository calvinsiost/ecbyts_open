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
   COST CENTER HANDLERS — User actions for cost centers & allocations
   Acoes do usuario para centros de custo e alocacoes

   FUNCIONALIDADES:
   - CRUD de centros de custo
   - Orcamento por ano fiscal
   - Alocacao de custos (rateio entre centros)
   - Quick-assign (atalho 100% para um unico CC)
   ================================================================ */
import { addCostCenter, updateCostCenter, removeCostCenter, getCostCenter, addAllocation, removeAllocation, getAllocationsForSource, setBudget, } from '../governance/costCenterManager.js';
import { renderCostCenterForm, renderCostAllocationForm } from '../ui/governancePanel.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { openModal, closeModal } from '../ui/modals.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// ----------------------------------------------------------------
// STATE
// ----------------------------------------------------------------
let requestUIRefresh: any = null;
let editingCostCenterId: any = null;
export function setCostCenterRequestUIRefresh(fn: any) {
    requestUIRefresh = fn;
}
function requestCostCenterUIRefresh(reason: string) {
    if (typeof requestUIRefresh !== 'function')
        return;
    for (const domain of [
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
        UI_INVALIDATION_DOMAINS.REPORT,
    ]) {
        requestUIRefresh(domain, reason);
    }
}
// ----------------------------------------------------------------
// COST CENTER CRUD
// ----------------------------------------------------------------
function handleAddCostCenter() {
    const cc = addCostCenter({
        name: t('newCostCenter') || 'New Cost Center',
        type: 'custom',
    });
    requestCostCenterUIRefresh('cost-center:add');
    showToast(`${t('costCenterSaved') || 'Cost center added'}: ${cc.name}`, 'success');
}
function handleEditCostCenter(id: any) {
    editingCostCenterId = id;
    renderCostCenterForm(id);
    openModal('cost-center-modal');
}
function handleRemoveCostCenter(id: any) {
    const cc = getCostCenter(id);
    if (!cc)
        return;
    removeCostCenter(id);
    requestCostCenterUIRefresh('cost-center:remove');
    showToast(t('costCenterRemoved') || 'Cost center removed', 'info');
}
function handleSaveCostCenter() {
    if (!editingCostCenterId)
        return;
    const $el = (id: any) => document.getElementById(id);
    const name = $el('cc-name')?.value || '';
    const code = $el('cc-code')?.value || '';
    const type = $el('cc-type')?.value || 'custom';
    const parentId = $el('cc-parent')?.value || null;
    const responsiblePerson = $el('cc-responsible')?.value || '';
    const active = $el('cc-active')?.checked !== false;
    updateCostCenter(editingCostCenterId, {
        name,
        code,
        type,
        parentId: parentId || null,
        responsiblePerson,
        active,
    });
    closeModal('cost-center-modal');
    requestCostCenterUIRefresh('cost-center:save');
    showToast(t('costCenterSaved') || 'Cost center saved', 'success');
}
// ----------------------------------------------------------------
// BUDGET
// ----------------------------------------------------------------
function handleAddCostCenterBudget(ccId: any) {
    const fy = new Date().getFullYear();
    setBudget(ccId, fy, { budgetCapex: 0, budgetOpex: 0, budgetTotal: 0, notes: '' });
    if (editingCostCenterId === ccId) {
        renderCostCenterForm(ccId);
    }
}
function handleRemoveCostCenterBudget(ccId: any, fiscalYear: any) {
    const cc = getCostCenter(ccId);
    if (!cc)
        return;
    cc.budgets = cc.budgets.filter((b: any) => b.fiscalYear !== fiscalYear);
    if (editingCostCenterId === ccId) {
        renderCostCenterForm(ccId);
    }
}
function handleSaveCostCenterBudget() {
    if (!editingCostCenterId)
        return;
    const cc = getCostCenter(editingCostCenterId);
    if (!cc)
        return;
    // Coleta budgets do formulario
    const rows = document.querySelectorAll('.cc-budget-row');
    for (const row of rows) {
        const $q = (sel: any) => row.querySelector(sel);
        const fy = parseInt($q('.cc-budget-fy')?.value) || new Date().getFullYear();
        const budgetCapex = parseFloat($q('.cc-budget-capex')?.value) || 0;
        const budgetOpex = parseFloat($q('.cc-budget-opex')?.value) || 0;
        const budgetTotal = parseFloat($q('.cc-budget-total')?.value) || budgetCapex + budgetOpex;
        const notes = $q('.cc-budget-notes')?.value || '';
        setBudget(editingCostCenterId, fy, { budgetCapex, budgetOpex, budgetTotal, notes });
    }
    requestCostCenterUIRefresh('cost-center:budget-save');
    showToast(t('costCenterSaved') || 'Budget saved', 'success');
}
// ----------------------------------------------------------------
// ALLOCATION
// ----------------------------------------------------------------
function handleAddCostAllocation(sourceType: any, sourceId: any) {
    renderCostAllocationForm(sourceType, sourceId);
    openModal('cost-allocation-modal');
}
function handleRemoveCostAllocation(allocationId: any) {
    removeAllocation(allocationId);
    requestCostCenterUIRefresh('cost-allocation:remove');
    showToast(t('allocationRemoved') || 'Allocation removed', 'info');
}
function handleSaveCostAllocation() {
    const $el = (id: any) => document.getElementById(id);
    const sourceType = $el('ca-source-type')?.value || '';
    const sourceId = $el('ca-source-id')?.value || '';
    if (!sourceType || !sourceId)
        return;
    // Coleta alocacoes do formulario
    const rows = document.querySelectorAll('.ca-alloc-row');
    const newAllocs = [];
    for (const row of rows) {
        const $q = (sel: any) => row.querySelector(sel);
        const costCenterId = $q('.ca-cc-select')?.value || '';
        const percentage = parseFloat($q('.ca-pct-input')?.value) || 0;
        const notes = $q('.ca-notes-input')?.value || '';
        if (costCenterId && percentage > 0) {
            newAllocs.push({ costCenterId, percentage, notes });
        }
    }
    // Validar soma <= 100
    const totalPct = newAllocs.reduce((s: any, a: any) => s + a.percentage, 0);
    if (totalPct > 100) {
        showToast(t('allocationMustNotExceed100') || 'Total allocation must not exceed 100%', 'error');
        return;
    }
    // Remover alocacoes existentes para esta source
    const existing = getAllocationsForSource(sourceType, sourceId);
    for (const a of existing) {
        removeAllocation(a.id);
    }
    // Adicionar novas
    for (const a of newAllocs) {
        addAllocation({
            sourceType,
            sourceId,
            costCenterId: a.costCenterId,
            percentage: a.percentage,
            notes: a.notes,
        });
    }
    closeModal('cost-allocation-modal');
    requestCostCenterUIRefresh('cost-allocation:save');
    showToast(t('costAllocationSaved') || 'Allocation saved', 'success');
}
function handleAssignCostCenter(sourceType: any, sourceId: any, costCenterId: any) {
    // Quick-assign: remove alocacoes existentes e atribui 100% a um CC
    const existing = getAllocationsForSource(sourceType, sourceId);
    for (const a of existing) {
        removeAllocation(a.id);
    }
    addAllocation({
        sourceType,
        sourceId,
        costCenterId,
        percentage: 100,
    });
    requestCostCenterUIRefresh('cost-center:assign');
    showToast(t('costCenterAssigned') || 'Cost center assigned', 'success');
}
function handleCostCenterVarianceReport() {
    // Dispara re-render do cost analysis panel com foco em cost centers
    requestCostCenterUIRefresh('cost-center:variance-report');
    showToast(t('varianceReportGenerated') || 'Variance report generated', 'info');
}
// ----------------------------------------------------------------
// EXPORT
// ----------------------------------------------------------------
export const costCenterHandlers = {
    handleAddCostCenter,
    handleEditCostCenter,
    handleRemoveCostCenter,
    handleSaveCostCenter,
    handleAddCostCenterBudget,
    handleRemoveCostCenterBudget,
    handleSaveCostCenterBudget,
    handleAddCostAllocation,
    handleRemoveCostAllocation,
    handleSaveCostAllocation,
    handleAssignCostCenter,
    handleCostCenterVarianceReport,
};
