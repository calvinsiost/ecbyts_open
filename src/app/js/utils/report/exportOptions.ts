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
   EXPORT OPTIONS — Modal for report export format & section selection
   Modal de opções de exportação: formato (PDF/DOCX) e seções

   Mostra dialog com radio buttons para formato e checkboxes para
   seções de métricas. Retorna Promise com escolhas do usuário.
   ================================================================ */
import { t } from '../i18n/translations.js';
import { getMetricAnchors } from './manager.js';
const EXPORT_SECTIONS = [
    { id: 'projectSummary', labelKey: 'exportSectionProjectSummary', default: true },
    { id: 'eis', labelKey: 'exportSectionEIS', default: true },
    { id: 'costSummary', labelKey: 'exportSectionCost', default: true },
    { id: 'compliance', labelKey: 'exportSectionCompliance', default: true },
    { id: 'eva', labelKey: 'exportSectionEVA', default: true },
    { id: 'elementInventory', labelKey: 'exportSectionElementInventory', default: true },
    { id: 'campaignSummary', labelKey: 'exportSectionCampaignSummary', default: true },
    { id: 'calculator', labelKey: 'exportSectionCalculator', default: true },
    { id: 'complianceMatrix', labelKey: 'exportSectionComplianceMatrix', default: true },
    { id: 'histogram', labelKey: 'exportSectionHistogram', default: false },
    { id: 'sceneScreenshots', labelKey: 'exportSectionSceneScreenshots', default: true },
];
/**
 * Show export options dialog and return user choices.
 * Mostra modal de opções de exportação e retorna escolhas do usuário.
 *
 * @returns {Promise<ExportResult | null>}
 */
export function showExportOptionsDialog() {
    return new Promise((resolve) => {
        // Fecha diálogo anterior se existir
        const existing = document.getElementById('report-export-dialog');
        if (existing) existing.remove();
        // Overlay
        const overlay = document.createElement('div');
        overlay.id = 'report-export-dialog';
        overlay.className = 'report-export-overlay';
        // Dialog
        const dialog = document.createElement('div');
        dialog.className = 'report-export-dialog';
        // Header
        const header = document.createElement('div');
        header.className = 'report-export-header';
        header.textContent = t('exportReport') || 'Export Report';
        dialog.appendChild(header);
        // Format selection
        const formatGroup = document.createElement('div');
        formatGroup.className = 'report-export-format-group';
        const formatLabel = document.createElement('div');
        formatLabel.className = 'report-export-group-label';
        formatLabel.textContent = t('exportFormat') || 'Format';
        formatGroup.appendChild(formatLabel);
        const formats = [
            { id: 'pdf', label: t('exportFormatPDF') || 'PDF Document', icon: '&#9654;' },
            { id: 'docx', label: t('exportFormatDOCX') || 'Word Document (.docx)', icon: '&#9638;' },
        ];
        formats.forEach((fmt: any, i: any) => {
            const radio = document.createElement('label');
            radio.className = 'report-export-radio';
            radio.innerHTML = `
                <input data-field-meta="true" data-field-meta-key="auto-name:export-format" type="radio" name="export-format" value="${fmt.id}" ${i === 0 ? 'checked' : ''}>
                <span class="report-export-radio-icon">${fmt.icon}</span>
                <span>${fmt.label}</span>
            `;
            formatGroup.appendChild(radio);
        });
        dialog.appendChild(formatGroup);
        // Sections checkboxes
        const sectionGroup = document.createElement('div');
        sectionGroup.className = 'report-export-section-group';
        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'report-export-group-label';
        sectionLabel.textContent = t('exportSections') || 'Include Sections';
        sectionGroup.appendChild(sectionLabel);
        const sectionList = document.createElement('div');
        sectionList.className = 'report-export-section-list';
        EXPORT_SECTIONS.forEach((sec: any) => {
            const label = document.createElement('label');
            label.className = 'report-export-checkbox';
            label.innerHTML = `
                <input data-field-meta="true" data-field-meta-key="auto-name:export-section" type="checkbox" name="export-section" value="${sec.id}" ${sec.default ? 'checked' : ''}>
                <span>${t(sec.labelKey) || sec.id}</span>
            `;
            sectionList.appendChild(label);
        });
        // Select all / none
        const toggleAll = document.createElement('div');
        toggleAll.className = 'report-export-toggle-all';
        const selectAll = document.createElement('button');
        selectAll.type = 'button';
        selectAll.className = 'report-export-link-btn';
        selectAll.textContent = t('selectAll') || 'Select all';
        selectAll.addEventListener('click', () => {
            sectionList.querySelectorAll('input[type="checkbox"]').forEach((cb: any) => {
                cb.checked = true;
            });
        });
        const selectNone = document.createElement('button');
        selectNone.type = 'button';
        selectNone.className = 'report-export-link-btn';
        selectNone.textContent = t('selectNone') || 'Select none';
        selectNone.addEventListener('click', () => {
            sectionList.querySelectorAll('input[type="checkbox"]').forEach((cb: any) => {
                cb.checked = false;
            });
        });
        toggleAll.appendChild(selectAll);
        toggleAll.appendChild(selectNone);
        sectionGroup.appendChild(toggleAll);
        sectionGroup.appendChild(sectionList);
        // Info banner: metricas inline via anchors
        const anchors = getMetricAnchors();
        if (anchors.length > 0) {
            const banner = document.createElement('div');
            banner.className = 'report-export-anchor-info';
            banner.textContent =
                t('exportAnchorInfo') ||
                `${anchors.length} metric anchor(s) detected — sections will render inline at anchor positions.`;
            sectionGroup.appendChild(banner);
        }
        dialog.appendChild(sectionGroup);
        // Actions
        const actions = document.createElement('div');
        actions.className = 'report-export-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.className = 'report-export-btn report-export-btn-cancel';
        cancelBtn.textContent = t('exportCancel') || 'Cancel';
        cancelBtn.addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });
        const exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'report-export-btn report-export-btn-export';
        exportBtn.textContent = t('exportConfirm') || 'Export';
        exportBtn.addEventListener('click', () => {
            const format = (dialog.querySelector("input[name=\"export-format\"]:checked") as any)?.value || 'pdf';
            const sections = Array.from(dialog.querySelectorAll('input[name="export-section"]:checked')).map((cb: any) => cb.value,
            );
            overlay.remove();
            resolve({ format, sections });
        });
        actions.appendChild(cancelBtn);
        actions.appendChild(exportBtn);
        dialog.appendChild(actions);
        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(null);
            }
        });
        // ESC key
        const onKeyDown = (e: any) => {
            if (e.key === 'Escape') {
                overlay.remove();
                document.removeEventListener('keydown', onKeyDown);
                resolve(null);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        // Focus export button
        exportBtn.focus();
    });
}
