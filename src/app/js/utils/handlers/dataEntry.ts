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
   DATA ENTRY HANDLERS — Formulário de entrada de dados em matriz
   Registra funções window.* para o modal de entrada de dados.

   Todas as funções delegam para o componente dataEntryMatrix.js.
   Este arquivo serve como ponte entre o HTML (onclick) e o módulo.
   ================================================================ */
import {
    openDataEntryMatrix,
    closeDataEntryMatrix,
    goToEntry,
    goToSetup,
    setMode,
    setCellValue,
    saveAll,
    copyLastCampaign,
    clearAllCells,
    fieldNext,
    fieldPrev,
    setParamSearch,
    setElementFilter,
    toggleParam,
    toggleElement,
    selectAllParams,
    selectAllElements,
    setCampaign,
    setCampaignDate,
    setNewCampaignName,
    quickFromPlan,
    setElementDate,
    setParamUnit,
    openInsights,
    setDataEntryUpdateAllUI,
} from '../ui/dataEntryMatrix.js';
// ----------------------------------------------------------------
// RE-EXPORT setUpdateAllUI for handler registry
// ----------------------------------------------------------------
export { setDataEntryUpdateAllUI };
// ----------------------------------------------------------------
// HANDLERS - Exposed on window.* via handler registry
// ----------------------------------------------------------------
/**
 * Open the data entry matrix modal.
 * @param {string} [campaignId?] - Optional pre-selected campaign
 */
function handleOpenDataEntryMatrix(campaignId?: string) {
    openDataEntryMatrix(campaignId);
}
function handleCloseDataEntryMatrix() {
    closeDataEntryMatrix();
}
function handleDataEntryNext() {
    goToEntry();
}
function handleDataEntryBack() {
    goToSetup();
}
function handleDataEntryModeChange(mode: any) {
    setMode(mode);
}
function handleMatrixCellChange(paramId: any, elemId: any, value: any) {
    setCellValue(paramId, elemId, value);
}
/**
 * On blur, update input visual state (CSS classes).
 * Atualiza classes CSS do input quando perde o foco.
 */
function handleMatrixCellBlur(paramId: any, elemId: any, inputEl: any) {
    setCellValue(paramId, elemId, inputEl.value);
    // Atualiza classes visuais sem re-render completo
    const trimmed = inputEl.value.trim().replace(',', '.');
    const numeric = parseFloat(trimmed);
    inputEl.classList.toggle('dirty', trimmed !== '');
    inputEl.classList.toggle('error', trimmed !== '' && isNaN(numeric));
}
/**
 * R3: Arrow-key grid navigation for data-entry matrix.
 * Allows Up/Down/Enter to move between cells without Tab leaving the grid.
 */
function handleMatrixCellNav(event: any, inputEl: any) {
    const cell = inputEl.closest('td');
    if (!cell) return;
    const row = cell.parentElement;
    const table = row.closest('table');
    if (!table) return;
    const cellIndex = Array.from(row.cells).indexOf(cell);
    let targetRow;
    if (event.key === 'ArrowDown' || event.key === 'Enter') {
        event.preventDefault();
        targetRow = row.nextElementSibling;
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        targetRow = row.previousElementSibling;
    } else {
        return;
    }
    if (targetRow) {
        const targetCell = targetRow.cells[cellIndex];
        const targetInput = targetCell?.querySelector('input[type="text"]');
        if (targetInput) targetInput.focus();
    }
}
function handleMatrixSave() {
    saveAll();
}
function handleMatrixCopyLastCampaign() {
    copyLastCampaign();
}
function handleMatrixCopyFromPlan() {
    quickFromPlan();
}
function handleMatrixClearAll() {
    clearAllCells();
}
function handleFieldModeNext() {
    fieldNext();
}
function handleFieldModePrev() {
    fieldPrev();
}
function handleMatrixParamSearch(query: any) {
    setParamSearch(query);
}
function handleMatrixElementFilter(familyId: any) {
    setElementFilter(familyId);
}
function handleMatrixSelectAllParams() {
    selectAllParams(true);
}
function handleMatrixSelectNoneParams() {
    selectAllParams(false);
}
function handleMatrixSelectAllElements() {
    selectAllElements(true);
}
function handleMatrixSelectNoneElements() {
    selectAllElements(false);
}
function handleMatrixToggleParam(paramId: any, checked: any) {
    toggleParam(paramId, checked);
}
function handleMatrixToggleElement(elemId: any, checked: any) {
    toggleElement(elemId, checked);
}
function handleMatrixSetCampaign(campaignId: any) {
    setCampaign(campaignId);
}
function handleMatrixSetCampaignDate(date: any) {
    setCampaignDate(date);
}
function handleMatrixSetNewCampaignName(name: any) {
    setNewCampaignName(name);
}
function handleMatrixQuickFromPlan() {
    quickFromPlan();
}
function handleMatrixElementDate(elemId: any, date: any) {
    setElementDate(elemId, date);
}
function handleMatrixUnitChange(paramId: any, unitId: any) {
    setParamUnit(paramId, unitId);
}
function handleMatrixOpenInsights() {
    openInsights();
}
// ----------------------------------------------------------------
// EXPORT - Named handler object for registry
// ----------------------------------------------------------------
export const dataEntryHandlers = {
    handleOpenDataEntryMatrix,
    handleCloseDataEntryMatrix,
    handleDataEntryNext,
    handleDataEntryBack,
    handleDataEntryModeChange,
    handleMatrixCellChange,
    handleMatrixCellBlur,
    handleMatrixCellNav,
    handleMatrixSave,
    handleMatrixCopyLastCampaign,
    handleMatrixCopyFromPlan,
    handleMatrixClearAll,
    handleFieldModeNext,
    handleFieldModePrev,
    handleMatrixParamSearch,
    handleMatrixElementFilter,
    handleMatrixSelectAllParams,
    handleMatrixSelectNoneParams,
    handleMatrixSelectAllElements,
    handleMatrixSelectNoneElements,
    handleMatrixToggleParam,
    handleMatrixToggleElement,
    handleMatrixSetCampaign,
    handleMatrixSetCampaignDate,
    handleMatrixSetNewCampaignName,
    handleMatrixQuickFromPlan,
    handleMatrixElementDate,
    handleMatrixUnitChange,
    handleMatrixOpenInsights,
};
//# sourceMappingURL=dataEntry.js.map
