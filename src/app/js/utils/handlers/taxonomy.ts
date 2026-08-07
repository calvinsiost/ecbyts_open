// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   TAXONOMY HANDLERS — Window event handlers for taxonomy UI
   Handlers para UI de dicionarios de dados (taxonomias)

   Funcoes registradas no window.* para serem chamadas por onclick/oninput
   em elementos HTML gerados dinamicamente.
   ================================================================ */
import { activateTaxonomy, deactivateTaxonomy, purgeTaxonomyData } from '../../core/taxonomy/manager.js';
import { setTaxonomyFieldValue } from '../../core/taxonomy/fieldResolver.js';
import { getElementById, getAllElements } from '../../core/elements/manager.js';
import { updateElementDetails } from '../ui/lists.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
// ----------------------------------------------------------------
// FIELD CHANGE
// Chamado pelo oninput/onchange dos campos no inspector
// ----------------------------------------------------------------
/**
 * Handle taxonomy field value change from inspector.
 * Escreve valor no element.data.taxonomy[taxId][fieldId].
 *
 * @param {string} elementId - Element ID
 * @param {string} taxonomyId - Taxonomy ID
 * @param {string} fieldId - Field ID
 * @param {any} value - New value
 */
function handleTaxonomyFieldChange(elementId: any, taxonomyId: any, fieldId: any, value: any) {
    const element = getElementById(elementId);
    if (!element)
        return;
    (setTaxonomyFieldValue as any)(element, taxonomyId, fieldId, value);
}
// ----------------------------------------------------------------
// TAXONOMY TOGGLE
// Ativar/desativar taxonomia (chamado pelo picker)
// ----------------------------------------------------------------
/**
 * Toggle a taxonomy on/off for the current model.
 * @param {string} taxonomyId
 * @param {boolean} active
 */
function handleTaxonomyToggle(taxonomyId: any, active: any) {
    if (active) {
        activateTaxonomy(taxonomyId);
        purposeMicroFeedback('handleTaxonomyToggle');
    }
    else {
        deactivateTaxonomy(taxonomyId);
    }
    // Re-render inspector if element is selected
    updateElementDetails();
}
/**
 * Purge taxonomy data from all elements (destructive).
 * @param {string} taxonomyId
 */
function handleTaxonomyPurge(taxonomyId: any) {
    purgeTaxonomyData(taxonomyId, getAllElements);
    updateElementDetails();
}
/**
 * Open taxonomy picker modal.
 * Abre modal de selecao de taxonomias.
 */
function handleOpenTaxonomyPicker() {
    import('../ui/taxonomyPicker.js' as string)
        .then((mod) => mod.openTaxonomyPicker())
        .catch((e) => console.error('[Taxonomy] Failed to open picker:', e));
}
// ----------------------------------------------------------------
// EXPORT - Handler object for registration in index.js
// ----------------------------------------------------------------
export const taxonomyHandlers = {
    handleTaxonomyFieldChange,
    handleTaxonomyToggle,
    handleTaxonomyPurge,
    handleOpenTaxonomyPicker,
};
