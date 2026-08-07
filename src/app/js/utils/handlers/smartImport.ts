// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost
/* ================================================================
   SMART IMPORT HANDLERS — AI-powered data import UI
   ================================================================

   Controla o modal de importacao inteligente:
   upload de arquivo, preview, mapeamento IA, ajustes e importacao.

   ================================================================ */
import {
    analyzeFileStructure,
    requestAIMapping,
    applyMapping,
    validateMappedData,
    TARGET_FIELDS,
} from '../../core/io/smartImport.js';
import { addElement } from '../../core/elements/manager.js';
import { openModal, closeModal } from '../ui/modals.js';
import { showToast as _showToastImpl } from '../ui/toast.js';
const showToast = _showToastImpl;
import { t } from '../i18n/translations.js';
import { hydrateIcons } from '../ui/icons.js';
import { escapeHtml, escapeJsAttr } from '../helpers/html.js';
import { createLogger } from '../helpers/logger.js';
import { purposeMicroFeedback } from '../../core/purpose/actionImpact.js';
import { UI_INVALIDATION_DOMAINS } from '../../main/uiInvalidationRegistry.js';
const log = createLogger('SmartImport');

type ColumnMappingInfo = { target: string; confidence: number; notes?: string } | string;

type SmartImportMapping = {
    fileType?: string;
    columnMappings: Record<string, ColumnMappingInfo>;
    warnings?: string[];
};
// Module state
let _currentContent: any = null;
let _currentStructure: any = null;
let _currentMapping: any = null;
let _requestUIRefresh: any = null;
/**
 * Set the UI refresh callback.
 * @param {Function} fn
 */
export function setSmartImportUpdateAllUI(fn: any) {
    _requestUIRefresh = fn;
}
function requestSmartImportUIRefresh(reason = 'smart-import.changed') {
    if (!_requestUIRefresh)
        return;
    const domains = [
        UI_INVALIDATION_DOMAINS.INGESTION,
        UI_INVALIDATION_DOMAINS.MODEL,
        UI_INVALIDATION_DOMAINS.LISTS,
        UI_INVALIDATION_DOMAINS.STATUS,
        UI_INVALIDATION_DOMAINS.INSPECTOR,
    ];
    for (const domain of domains) {
        _requestUIRefresh(domain, reason);
    }
}
// ================================================================
// MODAL CONTROLS
// ================================================================
/**
 * Open the smart import modal.
 * Abre o modal de importacao inteligente.
 */
export function openSmartImportModal() {
    // Reset state
    _currentContent = null;
    _currentStructure = null;
    _currentMapping = null;
    // Reset UI
    const fileInput = document.getElementById('smart-import-file');
    if (fileInput) fileInput.value = '';
    const preview = document.getElementById('smart-import-preview');
    if (preview) preview.style.display = 'none';
    const mapping = document.getElementById('smart-import-mapping');
    if (mapping) mapping.style.display = 'none';
    const warnings = document.getElementById('smart-import-warnings');
    if (warnings) warnings.innerHTML = '';
    const confirmBtn = document.getElementById('smart-import-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = true;
    const analyzing = document.getElementById('smart-import-analyzing');
    if (analyzing) analyzing.style.display = 'none';
    openModal('smart-import-modal');
}
// ================================================================
// FILE HANDLING
// ================================================================
/**
 * Handle file selection and analyze structure.
 * Quando usuario seleciona um arquivo, analisa a estrutura.
 */
export async function handleSmartImportFile() {
    const input = document.getElementById('smart-import-file') as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) return;
    try {
        _currentContent = await file.text();
        _currentStructure = analyzeFileStructure(_currentContent, file.name);
        // Show preview
        displayPreview(_currentStructure);
        // Request AI mapping
        const analyzing = document.getElementById('smart-import-analyzing');
        if (analyzing) analyzing.style.display = '';
        _currentMapping = await requestAIMapping(_currentStructure.columns, _currentStructure.sampleRows);
        if (analyzing) analyzing.style.display = 'none';
        // Show mapping
        displayMapping(_currentMapping);
        // Enable confirm button
        const confirmBtn = document.getElementById('smart-import-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = false;
    } catch (err: unknown) {
        const analyzing = document.getElementById('smart-import-analyzing');
        if (analyzing) analyzing.style.display = 'none';
        const message = err instanceof Error ? err.message : String(err);
        log.error('Smart import analysis failed', message);
        showToast(message, 'error');
    }
}
// ================================================================
// MAPPING ADJUSTMENT
// ================================================================
/**
 * Handle manual mapping adjustment from dropdown.
 * Quando usuario ajusta o mapeamento manualmente.
 *
 * @param {string} column - Source column name
 * @param {string} newTarget - New target field
 */
export function handleAdjustMapping(column: string, newTarget: string) {
    if (!_currentMapping?.columnMappings?.[column]) return;
    const existing = _currentMapping.columnMappings[column];
    if (typeof existing === 'object' && existing !== null) {
        existing.target = newTarget;
        existing.confidence = 1.0;
    } else {
        _currentMapping.columnMappings[column] = {
            target: newTarget,
            confidence: 1.0,
            notes: 'Manually adjusted',
        };
    }
}
// ================================================================
// IMPORT EXECUTION
// ================================================================
/**
 * Confirm and execute the import.
 * Confirma e executa a importacao com os dados mapeados.
 */
function importSmartElements(elements: Array<Record<string, unknown>>) {
    let importedCount = 0;
    for (const el of elements) {
        try {
            const family = String(el.family || el.familyId || 'marker');
            addElement(family, (el.id as string | undefined) || undefined, (el.name as string | undefined) || undefined, el);
            importedCount++;
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log.warn('Element import failed', message);
        }
    }
    return importedCount;
}

function finishSmartImport(importedCount: number, warnings: string[]) {
    if (warnings.length > 0) {
        log.warn('Import warnings', warnings.join('; '));
    }
    showToast(`${t('importSuccess') || 'Import successful'}: ${importedCount} records`, 'success');
    requestSmartImportUIRefresh('smart-import.confirmed');
    purposeMicroFeedback('handleConfirmSmartImport');
    closeModal('smart-import-modal');
}

export async function handleConfirmSmartImport() {
    if (!_currentContent || !_currentStructure || !_currentMapping) {
        showToast('No data to import', 'error');
        return;
    }
    try {
        const data = applyMapping(_currentContent, _currentStructure, _currentMapping);
        const validation = validateMappedData(data);
        if (!validation.valid) {
            showToast(validation.errors.join('; '), 'error');
            return;
        }
        const importedCount =
            importSmartElements(data.elements) +
            data.observations.length +
            data.campaigns.length;
        finishSmartImport(importedCount, validation.warnings);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        log.error('Import execution failed', message);
        showToast(message, 'error');
    }
}
// ================================================================
// UI RENDERING
// ================================================================
/**
 * Display data preview table.
 * Mostra tabela de pre-visualizacao dos dados.
 */
/** @param {any} structure */
function displayPreview(structure: any) {
    const container = document.getElementById('smart-import-preview');
    const table = document.getElementById('smart-import-preview-table');
    if (!container || !table) return;
    let html = '<table class="preview-table"><thead><tr>';
    structure.columns.forEach((col: string) => {
        html += `<th>${escapeHtml(col)}</th>`;
    });
    html += '</tr></thead><tbody>';
    structure.sampleRows.forEach((row: Record<string, any>) => {
        html += '<tr>';
        structure.columns.forEach((col: string) => {
            html += `<td>${escapeHtml(String(row[col] || ''))}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    html += `<small>${structure.rowCount} rows, ${structure.columns.length} columns</small>`;
    table.innerHTML = html;
    container.style.display = '';
}
/**
 * Display AI mapping table with adjustment dropdowns.
 * Mostra tabela de mapeamento IA com dropdowns para ajuste.
 */
/** @param {any} confidence */
function formatConfidenceClass(confidence: number) {
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.5) return 'medium';
    return 'low';
}

function renderMappingTargets(
    targets: ReadonlyArray<{ id: string; name: string }>,
    selectedTarget: string,
) {
    let html = '';
    for (const t of targets) {
        const selected = t.id === selectedTarget ? ' selected' : '';
        html += `<option value="${t.id}"${selected}>${t.name}</option>`;
    }
    return html;
}

function renderMappingRow(
    col: string,
    mapInfo: ColumnMappingInfo,
    targets: ReadonlyArray<{ id: string; name: string }>,
) {
    const target = typeof mapInfo === 'string' ? mapInfo : mapInfo.target;
    const confidence = typeof mapInfo === 'object' ? mapInfo.confidence : 0.5;
    const confClass = formatConfidenceClass(confidence);
    const confPct = Math.round(confidence * 100);
    const selectAttr = `data-field-meta="true" data-field-meta-key="auto-pos:smartImport:select:L289" data-cc-call-change="handleAdjustMapping|s:${encodeURIComponent(`${escapeJsAttr(col)}`)}|v"`;
    return (
        '<tr>' +
        `<td><strong>${escapeHtml(col)}</strong></td>` +
        `<td>${escapeHtml(target)}</td>` +
        `<td><span class="confidence-badge ${confClass}">${confPct}%</span></td>` +
        `<td><select ${selectAttr}>${renderMappingTargets(targets, target)}</select></td>` +
        '</tr>'
    );
}

function renderMappingWarnings(warnings: ReadonlyArray<string>) {
    if (!warnings || warnings.length === 0) return '';
    let html = '<div style="margin-top: 8px;">';
    for (const w of warnings) {
        html += `<small style="color: var(--warning, #ca8a04);"><span data-icon="alert-triangle" data-icon-size="10px"></span> ${escapeHtml(w)}</small><br>`;
    }
    html += '</div>';
    return html;
}

function renderMappingTable(
    columnMappings: Record<string, ColumnMappingInfo>,
    targets: ReadonlyArray<{ id: string; name: string }>,
    warnings: ReadonlyArray<string>,
) {
    let html = '<table class="mapping-table"><thead><tr>';
    html += `<th>${t('sourceColumn') || 'Source Column'}</th>`;
    html += `<th>${t('mapsTo') || 'Maps To'}</th>`;
    html += `<th>${t('confidence') || 'Confidence'}</th>`;
    html += `<th>${t('adjust') || 'Adjust'}</th>`;
    html += '</tr></thead><tbody>';
    for (const [col, mapInfo] of Object.entries(columnMappings)) {
        html += renderMappingRow(col, mapInfo, targets);
    }
    html += '</tbody></table>';
    html += renderMappingWarnings(warnings);
    return html;
}

function displayMapping(mapping: SmartImportMapping) {
    const container = document.getElementById('smart-import-mapping');
    const table = document.getElementById('smart-import-mapping-table');
    if (!container || !table) return;
    const fileType = String(mapping.fileType || 'observations') as keyof typeof TARGET_FIELDS;
    const targets = TARGET_FIELDS[fileType] || TARGET_FIELDS.observations;
    table.innerHTML = renderMappingTable(mapping.columnMappings, targets, mapping.warnings || []);
    hydrateIcons(table);
    container.style.display = '';
}
// ================================================================
// EXPORTED HANDLER OBJECT
// ================================================================
export const smartImportHandlers = {
    openSmartImportModal,
    handleSmartImportFile,
    handleAdjustMapping,
    handleConfirmSmartImport,
};
//# sourceMappingURL=smartImport.js.map
//# sourceMappingURL=smartImport.js.map
