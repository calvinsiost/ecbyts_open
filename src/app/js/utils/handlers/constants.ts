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
   CONSTANTS HANDLERS — window.* handlers para o modal de constantes
   Registra as funcoes globais chamadas pelo HTML do modal.
   ================================================================ */
import './constantsSetPortable.js'; // side-effect: registra kind 'constants_set' (P1-10 Fase B)
import { addUserConstant, updateUserConstant, removeUserConstant, forceRemoveUserConstant, generateRandomConstants, clearDemoConstants, } from '../../core/constants/manager.js';
import { openConstantsModal, closeConstantsModal, renderConstantsModal, renderNewConstantRow, setConstantsSearch, setConstantsFilterCategory, setConstantsSortBy, setConstantsEditingId, showConstantErrors, showRemoveConstantConfirm, } from '../ui/constantsModal.js';
import { requireOwnershipPermission } from '../../core/ownership/index.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
// ----------------------------------------------------------------
// UI refresh injection
// ----------------------------------------------------------------
let _requestUIRefresh: any = null;
function _ensureOwnership(actionLabel: any) {
    const ownership = (requireOwnershipPermission(actionLabel));
    if (!ownership.ok) {
        showToast(t('auth.actionDenied') || ((ownership) as any).error || 'Ownership permission required', 'error');
        return false;
    }
    return true;
}
/**
 * Inject UI refresh from the central handler registry.
 * @param {Function} fn
 */
export function setConstantsUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestConstantsUIRefresh(reason = 'constants.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.CONSTANTS,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.ANALYTICS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains)
        _requestUIRefresh(domain, reason);
}
// ----------------------------------------------------------------
// OPEN / CLOSE
// ----------------------------------------------------------------
function handleOpenConstantsModal() {
    openConstantsModal();
}
function handleCloseConstantsModal() {
    closeConstantsModal();
}
// ----------------------------------------------------------------
// SEARCH / FILTER / SORT
// ----------------------------------------------------------------
function handleConstantsSearch(query: any) {
    setConstantsSearch(query);
    renderConstantsModal();
}
function handleConstantsFilterCategory(cat: any) {
    setConstantsFilterCategory(cat);
    renderConstantsModal();
}
function handleConstantsSortBy(column: any) {
    setConstantsSortBy(column);
    renderConstantsModal();
}
// ----------------------------------------------------------------
// ADD ROW (open inline form)
// ----------------------------------------------------------------
function handleAddUserConstantRow() {
    setConstantsEditingId(null);
    renderConstantsModal();
    renderNewConstantRow();
}
// ----------------------------------------------------------------
// SAVE NEW CONSTANT
// ----------------------------------------------------------------
/**
 * Read values from the new-row form and save.
 * Le os valores do formulario de nova linha e salva.
 */
function handleSaveNewConstantRow() {
    if (!_ensureOwnership('constant_create'))
        return;
    const partial = _readFormFields('new');
    const { errors } = addUserConstant(partial);
    if (errors.length > 0) {
        showConstantErrors('new', errors);
        return;
    }
    renderConstantsModal();
    requestConstantsUIRefresh('constants.created');
}
function handleCancelNewConstantRow() {
    const row = document.getElementById('constants-new-row');
    if (row)
        row.remove();
}
// ----------------------------------------------------------------
// EDIT ROW (inline)
// ----------------------------------------------------------------
function handleEditConstantRow(id: any) {
    setConstantsEditingId(id);
    renderConstantsModal();
}
// ----------------------------------------------------------------
// SAVE EXISTING CONSTANT
// ----------------------------------------------------------------
/**
 * Read values from the editing row and save.
 * Le os valores da linha em edicao e salva.
 *
 * @param {string} id - Constant ID
 */
function handleSaveConstantRow(id: any) {
    if (!_ensureOwnership('constant_update'))
        return;
    const changes = _readFormFields(id);
    const { ok, errors } = updateUserConstant(id, changes);
    if (!ok) {
        showConstantErrors(id, errors);
        return;
    }
    setConstantsEditingId(null);
    renderConstantsModal();
    requestConstantsUIRefresh('constants.updated');
}
function handleCancelEditConstantRow() {
    setConstantsEditingId(null);
    renderConstantsModal();
}
// ----------------------------------------------------------------
// REMOVE
// ----------------------------------------------------------------
/**
 * Remove a constant, checking for dependents first.
 * Remove uma constante, verificando dependencias primeiro.
 *
 * @param {string} id
 */
function handleRemoveUserConstant(id: any) {
    if (!_ensureOwnership('constant_remove'))
        return;
    const { removed, dependents } = removeUserConstant(id);
    if (removed) {
        renderConstantsModal();
        requestConstantsUIRefresh('constants.removed');
        return;
    }
    // Ha dependentes - exibe confirmacao com lista
    showRemoveConstantConfirm(id, dependents);
}
function handleForceRemoveUserConstant(id: any) {
    if (!_ensureOwnership('constant_force_remove'))
        return;
    forceRemoveUserConstant(id);
    renderConstantsModal();
    requestConstantsUIRefresh('constants.force-removed');
}
// ----------------------------------------------------------------
// DEMO
// ----------------------------------------------------------------
function handleGenerateDemoConstants() {
    if (!_ensureOwnership('constant_generate_demo'))
        return;
    generateRandomConstants();
    renderConstantsModal();
}
function handleClearDemoConstants() {
    if (!_ensureOwnership('constant_clear_demo'))
        return;
    clearDemoConstants();
    renderConstantsModal();
    requestConstantsUIRefresh('constants.demo-cleared');
}
// ----------------------------------------------------------------
// HELPER - read form fields
// ----------------------------------------------------------------
/**
 * Read form fields from a row (new or editing).
 * Le os campos do formulario de uma linha (nova ou edicao).
 *
 * @param {string} prefix - 'new' or constant id
 * @returns {Object} partial constant object
 */
function _readFormFields(prefix: any) {
    const isNew = prefix === 'new';
    const get = (field: any) => {
        const el = document.getElementById(isNew ? `new-${field}` : `edit-${field}-${prefix}`) as any;
        return el ? el.value : '';
    };
    const rawUnc = get('uncertainty').trim();
    const rawK = get('coveragefactor').trim();
    return {
        name: get('name').trim(),
        symbol: get('symbol').trim(),
        value: parseFloat(get('value')),
        unitId: get('unit').trim(),
        category: get('cat').trim(),
        description: get('desc').trim(),
        source: get('source').trim(),
        validFrom: get('validfrom').trim() || null,
        validTo: get('validto').trim() || null,
        uncertainty: rawUnc !== '' ? parseFloat(rawUnc) : null,
        uncertaintyType: get('unctype').trim() || null,
        coverageFactor: rawK !== '' ? parseFloat(rawK) : null,
    };
}
// ----------------------------------------------------------------
// EXPORTS
// ----------------------------------------------------------------
export const constantHandlers = {
    handleOpenConstantsModal,
    handleCloseConstantsModal,
    handleConstantsSearch,
    handleConstantsFilterCategory,
    handleConstantsSortBy,
    handleAddUserConstantRow,
    handleSaveNewConstantRow,
    handleCancelNewConstantRow,
    handleEditConstantRow,
    handleSaveConstantRow,
    handleCancelEditConstantRow,
    handleRemoveUserConstant,
    handleForceRemoveUserConstant,
    handleGenerateDemoConstants,
    handleClearDemoConstants,
};
