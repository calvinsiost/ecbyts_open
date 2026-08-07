// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   EXTENDED METADATA HANDLERS — wire-up for Calibração / Grupo de
   Dados / Dados Adicionais editor modal.

   - handleOpenExtendedMetadataEditor(elementId) — fetch element via
     manager.js and open editor pre-filled
   - handleSaveExtendedMetadata(elementId, payload) — write payload
     into element.data.metadata (3 sections)
   - handleCloseExtendedMetadataEditor() — close modal
   ================================================================ */
import { openExtendedMetadataEditor, closeExtendedMetadataEditor } from '../ui/extendedMetadataEditor.js';
import { getElementById } from '../../core/elements/manager.js';
import { showToast } from '../ui/toast.js';
import { t } from '../i18n/translations.js';
/**
 * @param {unknown} err
 * @returns {string}
 */
function errorMessage(err: any) {
    return err instanceof Error ? err.message : String(err);
}
/**
 * Open the editor for an element. Reads element via manager and passes
 * the data.metadata as the seed source.
 *
 * @param {string} elementId
 */
export function handleOpenExtendedMetadataEditor(elementId: any) {
    if (!elementId || typeof elementId !== 'string') {
        showToast(t('metaEditorMissingElement') || 'elementId required', 'error');
        return;
    }
    const element = getElementById(elementId);
    if (!element) {
        showToast(`${t('metaEditorElementNotFound') || 'Elemento não encontrado'}: ${elementId}`, 'error');
        return;
    }
    const projectId = element && element.projectId ? element.projectId : window.currentProjectId || null;
    const sourceObject = { metadata: (element.data && element.data.metadata) || {} };
    openExtendedMetadataEditor({
        elementId,
        sourceObject,
        projectId,
        onSave: ({ payload }: any) => {
            handleSaveExtendedMetadata(elementId, payload);
        },
    });
}
/**
 * Persist the 3-section payload into element.data.metadata.
 *
 * @param {string} elementId
 * @param {{calibration: any, dataGroup: any, additionalData: Array<any>}} payload
 */
export function handleSaveExtendedMetadata(elementId: any, payload: any) {
    if (!elementId || !payload)
        return;
    const element = getElementById(elementId);
    if (!element)
        return;
    if (!element.data || typeof element.data !== 'object')
        element.data = {};
    if (!element.data.metadata || typeof element.data.metadata !== 'object')
        element.data.metadata = {};
    element.data.metadata.calibration = payload.calibration;
    element.data.metadata.dataGroup = payload.dataGroup;
    element.data.metadata.additionalData = payload.additionalData;
    try {
        window.dispatchEvent(new CustomEvent('ecbt:elementMetadataUpdated', {
            detail: { elementId, sections: ['calibration', 'dataGroup', 'additionalData'] },
        }));
    }
    catch (e: any) {
        console.debug('[extendedMetadata] event dispatch failed:', errorMessage(e));
    }
}
/** Close the editor. */
export function handleCloseExtendedMetadataEditor() {
    closeExtendedMetadataEditor();
}
/**
 * Open editor para o elemento atualmente em foco. Tenta múltiplas fontes:
 * 1. (window as any)._currentInspectorElementId (set by inspector when opening detail)
 * 2. Primeiro element do scene (último recurso, com toast informativo)
 * Calvin diretiva 2026-05-15: discoverability via menu "Mais".
 */
export async function handleOpenExtendedMetadataForCurrentSelection() {
    // Cascata de fontes: header card do inspector → cache global → first element
    let elementId = (window)._currentInspectorElementId || null;
    // Inspector header card tem data-element-id no `.ecbt-edetails-header`
    if (!elementId && typeof document !== 'undefined') {
        const header = document.querySelector('.ecbt-edetails-header[data-element-id]');
        if (header) {
            elementId = header.getAttribute('data-element-id') || null;
        }
    }
    if (!elementId) {
        try {
            const mod = (await import('../../core/elements/manager.js' as string));
            const all = mod.getAllElements ? mod.getAllElements() : [];
            if (all.length > 0) {
                elementId = all[0].id;
                showToast(t('metaEditorUsingFirstElement') ||
                    `Editando primeiro elemento (${elementId}). Selecione outro no inspector para editar.`, 'info');
            }
        }
        catch (e: any) {
            console.debug('[extendedMetadata] fallback failed:', errorMessage(e));
        }
    }
    if (!elementId) {
        showToast(t('metaEditorNoElement') || 'Nenhum elemento no modelo. Crie um elemento antes.', 'warning');
        return;
    }
    handleOpenExtendedMetadataEditor(elementId);
}
export const extendedMetadataHandlers = {
    handleOpenExtendedMetadataEditor,
    handleOpenExtendedMetadataForCurrentSelection,
    handleSaveExtendedMetadata,
    handleCloseExtendedMetadataEditor,
};
