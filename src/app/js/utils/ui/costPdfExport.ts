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
   COST PDF EXPORT — Exporta relatório de custos em PDF
   ================================================================

   Usa jsPDF (mesmo CDN do pdfExport.js) para gerar relatório
   com KPIs, tabelas e breakdown de custos do projeto.
   ================================================================ */
import { buildCostRollup } from '../../core/analytics/economics/costRollup.js';
import { formatCurrency } from './governancePanel.js';
import { t } from '../i18n/translations.js';
import { showToast } from './toast.js';
import { loadScriptCDN } from '../helpers/cdnLoader.js';
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
// ----------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------
/**
 * Export cost analysis as PDF.
 * Exporta análise de custos como PDF.
 */
export async function exportCostAnalysisPDF() {
    try {
        await _ensureJsPDF();
        const rollup = buildCostRollup();
        if (rollup.grandTotal === 0) {
            showToast(t('noCostData') || 'No cost data to export', 'warning');
            return;
        }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        let y = 20;
        // Title
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text(t('costAnalysis') || 'Cost Analysis', 105, y, { align: 'center' });
        y += 8;
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120);
        doc.text(new Date().toLocaleDateString(), 105, y, { align: 'center' });
        doc.setTextColor(0);
        y += 12;
        // KPIs
        y = _addSection(doc, y, t('grandTotal') || 'Summary');
        y = _addKpiRow(doc, y, [
            ['CAPEX', formatCurrency(rollup.totalCapex)],
            ['OPEX', formatCurrency(rollup.totalOpex)],
            [t('grandTotal') || 'Total', formatCurrency(rollup.grandTotal)],
        ]);
        y += 4;
        y = _addKpiRow(doc, y, [
            [t('elementsWithCost') || 'Elements', String(rollup.kpis.elementsWithCost)],
            [t('campaignsWithCost') || 'Campaigns', String(rollup.kpis.campaignsWithCost)],
            [t('avgCostPerElement') || 'Avg/Element', formatCurrency(rollup.kpis.avgCostPerElement)],
        ]);
        y += 8;
        // By Fiscal Year
        if (rollup.timeline.length > 0) {
            y = _checkPage(doc, y, 30);
            y = _addSection(doc, y, t('costByFiscalYear') || 'By Fiscal Year');
            y = _addTable(
                doc,
                y,
                [t('fiscalYear') || 'Year', 'CAPEX', 'OPEX', t('grandTotal') || 'Total', t('cumulative') || 'Cumul.'],
                rollup.timeline.map((r: any) => [
                    String(r.fiscalYear),
                    formatCurrency(r.capex),
                    formatCurrency(r.opex),
                    formatCurrency(r.total),
                    formatCurrency(r.cumulative),
                ]),
            );
            y += 6;
        }
        // By Family
        const familyEntries = Object.entries(rollup.byFamily).filter(([, v]) => v.total > 0);
        if (familyEntries.length > 0) {
            y = _checkPage(doc, y, 30);
            y = _addSection(doc, y, t('costByFamily') || 'By Family');
            y = _addTable(
                doc,
                y,
                [t('family') || 'Family', 'CAPEX', 'OPEX', t('grandTotal') || 'Total', '#'],
                familyEntries.map(([fam, data]) => [
                    fam.charAt(0).toUpperCase() + fam.slice(1),
                    formatCurrency(data.capex),
                    formatCurrency(data.opex),
                    formatCurrency(data.total),
                    String(data.elementCount),
                ]),
            );
            y += 6;
        }
        // By Element
        const elEntries = Object.entries(rollup.byElement).sort((a: any, b: any) => b[1].total - a[1].total);
        if (elEntries.length > 0) {
            y = _checkPage(doc, y, 30);
            y = _addSection(doc, y, t('costByElement') || 'By Element');
            y = _addTable(
                doc,
                y,
                [t('name') || 'Name', t('family') || 'Family', 'CAPEX', 'OPEX', t('grandTotal') || 'Total'],
                elEntries
                    .slice(0, 30)
                    .map(([, data]) => [
                        data.name,
                        data.family,
                        formatCurrency(data.capex),
                        formatCurrency(data.opex),
                        formatCurrency(data.total),
                    ]),
            );
            if (elEntries.length > 30) {
                y += 3;
                doc.setFontSize(8);
                doc.setTextColor(120);
                doc.text(`+${elEntries.length - 30} more elements`, 14, y);
                doc.setTextColor(0);
                y += 4;
            }
            y += 6;
        }
        // By Campaign
        const campEntries = Object.entries(rollup.byCampaign);
        if (campEntries.length > 0) {
            y = _checkPage(doc, y, 30);
            y = _addSection(doc, y, t('costByCampaign') || 'By Campaign');
            y = _addTable(
                doc,
                y,
                [t('campaign') || 'Campaign', t('date') || 'Date', t('grandTotal') || 'Total'],
                campEntries.map(([, data]) => [
                    data.name,
                    data.date ? new Date(data.date).toLocaleDateString() : '-',
                    formatCurrency(data.total),
                ]),
            );
            y += 6;
        }
        // By Cost Center
        const ccEntries = Object.entries(rollup.byCostCenter || {}).filter(([, v]: [any, any]) => v.total > 0);
        if (ccEntries.length > 0) {
            y = _checkPage(doc, y, 30);
            y = _addSection(doc, y, t('byCostCenter') || 'By Cost Center');
            y = _addTable(
                doc,
                y,
                [
                    t('costCenterCode') || 'Code',
                    t('costCenterName') || 'Name',
                    'CAPEX',
                    'OPEX',
                    t('grandTotal') || 'Total',
                    t('costCenterBudget') || 'Budget',
                    t('costCenterVariance') || 'Variance',
                ],
                ccEntries
                    .sort((a: any, b: any) => b[1].total - a[1].total)
                    .map(([, data]: [any, any]) => [
                        data.code || '-',
                        data.name,
                        formatCurrency(data.capex),
                        formatCurrency(data.opex),
                        formatCurrency(data.total),
                        data.budget > 0 ? formatCurrency(data.budget) : '-',
                        data.budget > 0 ? formatCurrency(data.variance) : '-',
                    ]),
            );
            y += 6;
        }
        // Footer
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(150);
            doc.text(`ECBT — Cost Analysis Report — Page ${i}/${pageCount}`, 105, 290, { align: 'center' });
        }
        // Save
        const filename = `ecbt-cost-analysis-${new Date().toISOString().slice(0, 10)}.pdf`;
        doc.save(filename);
        showToast(t('costAnalysisRefreshed') || 'PDF exported', 'success');
    } catch (err: any) {
        console.error('[CostPdfExport] Error:', err);
        showToast('PDF export failed: ' + (err && err.message), 'error');
    }
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
async function _ensureJsPDF() {
    if (window.jspdf) return;
    await loadScriptCDN(JSPDF_CDN, { name: 'jsPDF', globalVar: 'jspdf' });
}
function _addSection(doc: any, y: any, title: any) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 14, y);
    y += 2;
    doc.setDrawColor(59, 107, 255);
    doc.setLineWidth(0.5);
    doc.line(14, y, 196, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    return y;
}
function _addKpiRow(doc: any, y: any, kpis: any) {
    const colW = 60;
    doc.setFontSize(8);
    for (let i = 0; i < kpis.length; i++) {
        const x = 14 + i * colW;
        doc.setTextColor(120);
        doc.text(kpis[i][0], x, y);
        doc.setTextColor(0);
        doc.setFont('helvetica', 'bold');
        doc.text(kpis[i][1], x, y + 5);
        doc.setFont('helvetica', 'normal');
    }
    return y + 10;
}
function _addTable(doc: any, y: any, headers: any, rows: any) {
    const colCount = headers.length;
    const colW = (196 - 14) / colCount;
    const startX = 14;
    // Header
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(startX, y - 3, 182, 5, 'F');
    for (let i = 0; i < colCount; i++) {
        doc.text(headers[i], startX + i * colW + 1, y);
    }
    y += 4;
    doc.setFont('helvetica', 'normal');
    // Rows
    doc.setFontSize(7);
    for (const row of rows) {
        y = _checkPage(doc, y, 6);
        for (let i = 0; i < colCount; i++) {
            const text = String(row[i] || '').substring(0, 25);
            doc.text(text, startX + i * colW + 1, y);
        }
        y += 4;
    }
    return y;
}
function _checkPage(doc: any, y: any, needed: any) {
    if (y + needed > 280) {
        doc.addPage();
        return 20;
    }
    return y;
}
