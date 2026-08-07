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
   REPORT PDF EXPORT — Generate PDF from report with scene screenshots
   Exporta relatorio como PDF com capturas de tela das cenas

   Carrega jsPDF via CDN (dynamic import), percorre o HTML do
   relatorio e converte texto + ancoras de cena em paginas PDF.
   Para cada ancora, renderiza a cena 3D e insere screenshot inline.

   Inclui: TOC page, page numbers, running headers/footers,
   suporte a blockquote, HR, tabelas.
   ================================================================ */
// @ts-check
import { getReport } from './manager.js';
import { getSceneById } from '../scenes/manager.js';
import { getCameraState, setCameraState } from '../scene/controls.js';
import { getScene, getCamera, getRenderer } from '../scene/setup.js';
import { getAllElements } from '../../core/elements/manager.js';
import { getThresholds, getExceededThreshold } from '../../core/validation/rules.js';
import { resolveRegulatoryContext } from '../../core/calculator/contextResolver.js';
import { t } from '../i18n/translations.js';
import { loadScriptCDN } from '../helpers/cdnLoader.js';
// ----------------------------------------------------------------
// JSPDF CDN LOADER
// Carrega jsPDF sob demanda com timeout protection
// ----------------------------------------------------------------
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
/**
 * @private
 * @param {string} src
 * @returns {Promise<unknown>}
 */
function _loadScript(src: string) {
    return loadScriptCDN(src, { name: 'jsPDF', globalVar: 'jspdf' });
}
// ----------------------------------------------------------------
// PDF GENERATION
// ----------------------------------------------------------------
/**
 * Export the report as a PDF with scene screenshots and optional metrics.
 * Gera PDF a partir do HTML do relatorio. Para cada ancora de cena,
 * captura screenshot do viewer 3D naquele estado de camera.
 * Opcionalmente inclui métricas, tabelas e gráficos.
 *
 * @param {Object} [options] - Export options
 * @param {string[]} [options.sections] - Sections to include (all if omitted)
 */
export async function exportReportPDF(options = {}) {
    // 1. Carrega jsPDF
    if (!window.jspdf) {
        await _loadScript(JSPDF_CDN);
    }
    const { jsPDF } = window.jspdf;
    const report = getReport();
    if (!report.content) {
        throw new Error('Report is empty');
    }
    // 2. Cria documento A4
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;
    let cursorY = margin + 8; // Espaco para header
    const projectName = document.getElementById('project-name')?.value || 'report';
    const date = new Date().toISOString().slice(0, 10);
    // Salva estado atual da camera para restaurar depois
    const originalState = getCameraState();
    // 3. Parse HTML em blocos
    const blocks = parseHtmlToBlocks(report.content);
    // 4. Extrai headings para TOC
    const headings = blocks.filter((b) => b.type === 'heading').map((b) => ({ text: b.text, level: b.level }));
    // 5. Titulo (pagina 1)
    if (report.title) {
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        const titleLines = doc.splitTextToSize(report.title, contentW);
        doc.text(titleLines, margin, cursorY);
        cursorY += titleLines.length * 8 + 4;
    }
    // Subtitulo - nome do projeto e data
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120, 120, 120);
    doc.text(`${projectName} — ${date}`, margin, cursorY);
    cursorY += 8;
    doc.setTextColor(0, 0, 0);
    // 6. TOC (se ha headings)
    if (headings.length > 0) {
        cursorY += 4;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Sumario', margin, cursorY);
        cursorY += 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        headings.forEach((h) => {
            if (cursorY > pageH - margin - 10) {
                _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
                cursorY = margin + 8;
            }
            const indent = (h.level - 1) * 6;
            const prefix = h.level === 1 ? '■ ' : h.level === 2 ? '  ● ' : '    ○ ';
            const lines = doc.splitTextToSize(prefix + h.text, contentW - indent);
            doc.text(lines, margin + indent, cursorY);
            cursorY += lines.length * 4.5 + 1;
        });
        // Linha separadora apos TOC
        cursorY += 4;
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, cursorY, pageW - margin, cursorY);
        cursorY += 8;
    }
    // 6b. Metricas: inline (metric anchors) ou bloco no topo (legado)
    const sections = (options as any).sections || [];
    const hasMetricSections = sections.length > 0;
    const hasMetricAnchors = blocks.some((b) => b.type === 'metric-anchor');
    // Carrega metricas e charts (lazy - reutilizado nos anchors inline)
    let _metricsCache: any;
    let _chartModCache: any;
    if (!hasMetricAnchors) {
        // Sem anchors: comportamento legado - metricas no topo
        if (hasMetricSections) {
            const { collectReportMetrics } = await import('./metricsCollector.js');
            _metricsCache = collectReportMetrics(null);
            _chartModCache = await import('./chartCapture.js');
            cursorY = _addMetricsSections(
                doc,
                cursorY,
                pageW,
                pageH,
                margin,
                contentW,
                projectName,
                _metricsCache,
                _chartModCache,
                sections,
            );
        } else {
            cursorY = _addComplianceSection(doc, cursorY, pageW, pageH, margin, contentW, projectName);
        }
    }
    // 7. Renderiza blocos de conteudo
    for (const block of blocks) {
        // Verifica se precisa nova pagina
        if (cursorY > pageH - margin - 20) {
            _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
            cursorY = margin + 8;
        }
        if (block.type === 'heading') {
            const size = block.level === 1 ? 14 : block.level === 2 ? 12 : 11;
            doc.setFontSize(size);
            doc.setFont('helvetica', 'bold');
            const lines = doc.splitTextToSize(block.text, contentW);
            cursorY += 3;
            doc.text(lines, margin, cursorY);
            cursorY += lines.length * (size * 0.4) + 3;
        } else if (block.type === 'paragraph') {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const lines = doc.splitTextToSize(block.text, contentW);
            doc.text(lines, margin, cursorY);
            cursorY += lines.length * 4.5 + 2;
        } else if (block.type === 'list-item') {
            doc.setFontSize(10);
            doc.setFont('helvetica', 'normal');
            const bullet = block.ordered ? `${block.index}. ` : '- ';
            const lines = doc.splitTextToSize(bullet + block.text, contentW - 5);
            doc.text(lines, margin + 5, cursorY);
            cursorY += lines.length * 4.5 + 1;
        } else if (block.type === 'blockquote') {
            // Citacao com barra lateral
            doc.setFontSize(10);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(100, 100, 100);
            const lines = doc.splitTextToSize(block.text, contentW - 10);
            doc.setDrawColor(60, 130, 200);
            doc.setLineWidth(0.5);
            doc.line(margin + 2, cursorY - 2, margin + 2, cursorY + lines.length * 4.5);
            doc.text(lines, margin + 6, cursorY);
            cursorY += lines.length * 4.5 + 3;
            doc.setTextColor(0, 0, 0);
        } else if (block.type === 'horizontal-rule') {
            doc.setDrawColor(200, 200, 200);
            doc.line(margin, cursorY, pageW - margin, cursorY);
            cursorY += 6;
        } else if (block.type === 'scene-anchor' && (!hasMetricSections || sections.includes('sceneScreenshots'))) {
            // Captura screenshot da cena (condicionado pela opção sceneScreenshots)
            const scene = getSceneById(block.sceneId);
            if (scene?.viewStart) {
                try {
                    const imgData = captureSceneScreenshot(scene.viewStart);
                    if (imgData) {
                        // Verifica espaco na pagina
                        const imgH = 50; // mm
                        if (cursorY + imgH + 10 > pageH - margin) {
                            _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
                            cursorY = margin + 8;
                        }
                        // Label da cena
                        doc.setFontSize(9);
                        doc.setFont('helvetica', 'italic');
                        doc.setTextColor(60, 130, 200);
                        doc.text(`>> Scene: ${scene.name || block.sceneId}`, margin, cursorY);
                        cursorY += 4;
                        doc.setTextColor(0, 0, 0);
                        // Imagem
                        const imgW = Math.min(contentW, 160);
                        const fmt = imgData.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
                        doc.addImage(imgData, fmt, margin, cursorY, imgW, imgH);
                        cursorY += imgH + 4;
                    }
                } catch (e) {
                    console.warn('[PDF] Screenshot failed for scene', block.sceneId, e);
                    // Fallback: texto da ancora
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'italic');
                    doc.setTextColor(60, 130, 200);
                    doc.text(`>> [Scene: ${scene?.name || block.sceneId}]`, margin, cursorY);
                    cursorY += 5;
                    doc.setTextColor(0, 0, 0);
                }
            }
        } else if (block.type === 'metric-anchor') {
            // Inline metric anchor - renderiza secao metrica na posicao do cursor
            // Se o usuario selecionou secoes no export dialog, respeita a selecao
            if (hasMetricSections && !sections.includes(block.metricType)) continue;
            // Lazy-load chart module apenas para secoes com graficos
            const needsCharts = ['eis', 'costSummary', 'compliance', 'eva'].includes(block.metricType);
            if (needsCharts && !_chartModCache) {
                _chartModCache = await import('./chartCapture.js');
            }
            // Coleta apenas a metrica deste anchor (lazy, nao computa tudo)
            // Passa filterPresetId se vinculado a ancora
            const { collectSingleMetric } = await import('./metricsCollector.js');
            const singleMetrics = collectSingleMetric(block.metricType, block.filterPresetId);
            // Renderiza inline usando _addMetricsSections com tipo unico
            cursorY = _addMetricsSections(
                doc,
                cursorY,
                pageW,
                pageH,
                margin,
                contentW,
                projectName,
                singleMetrics,
                _chartModCache || {},
                [block.metricType],
            );
        }
    }
    // 8. Restaura camera original
    setCameraState(originalState);
    // 9. Adiciona headers/footers em todas as paginas
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        // Header - nome do projeto
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(160, 160, 160);
        doc.text(projectName, margin, 8);
        doc.text(date, pageW - margin, 8, { align: 'right' });
        // Linha header
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, 10, pageW - margin, 10);
        // Footer - numero de pagina
        doc.text(`${i} / ${totalPages}`, pageW / 2, pageH - 6, { align: 'center' });
        // Linha footer
        doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
    }
    // 10. Download
    doc.save(`report-${_sanitizeFilename(projectName)}-${date}.pdf`);
}
// ----------------------------------------------------------------
// COMPLIANCE SECTION - Tabela de conformidade regulatoria
// Verifica observacoes contra thresholds VR/VP/VI e gera resumo
// ----------------------------------------------------------------
/**
 * Build and render compliance summary section in PDF.
 * Constroi tabela com excedencias regulatorias do modelo atual.
 * @private
 * @param {PdfDoc} doc
 * @param {number} y
 * @param {number} pageW
 * @param {number} pageH
 * @param {number} margin
 * @param {number} contentW
 * @param {string} projectName
 * @returns {number}
 */
function _addComplianceSection(doc: any, y: number, pageW: number, pageH: number, margin: number, contentW: number, projectName: string) {
    const elements = getAllElements();
    const wells = elements.filter((e) => Array.isArray(e.data?.observations) && e.data.observations.length > 0);
    if (wells.length === 0) return y;
    // Coleta excedencias
    const rows = [];
    let intervCount = 0;
    let prevCount = 0;
    let refCount = 0;
    for (const el of wells) {
        for (const obs of el.data.observations) {
            if (obs.value == null || isNaN(obs.value)) continue;
            const matrix = resolveRegulatoryContext(obs.variables, el.family);
            const thresholds = getThresholds(obs.parameterId, matrix);
            if (thresholds.length === 0) continue;
            const exceeded = getExceededThreshold(obs.value, thresholds);
            if (!exceeded) continue;
            if (exceeded.severity === 'intervention') intervCount++;
            else if (exceeded.severity === 'prevention') prevCount++;
            else if (exceeded.severity === 'reference') refCount++;
            rows.push([
                (el.name || el.id).substring(0, 18),
                (obs.parameterId || '').substring(0, 14),
                obs.uncertainty != null
                    ? `${obs.value} \u00B1 ${obs.uncertainty}${obs.uncertaintyType === 'relative' ? '%' : ''}`
                    : String(obs.value),
                `${exceeded.type.toUpperCase()}: ${exceeded.value}`,
                exceeded.severity === 'intervention' ? 'VI' : exceeded.severity === 'prevention' ? 'VP' : 'VR',
                (exceeded.source || '').substring(0, 20),
            ]);
        }
    }
    if (rows.length === 0) return y;
    // Section header
    if (y > pageH - margin - 40) {
        _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
        y = margin + 8;
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(t('complianceSummary') || 'Compliance Summary', margin, y);
    y += 2;
    doc.setDrawColor(239, 68, 68);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    // KPI summary
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
        `${t('tierIntervention') || 'Intervention'}: ${intervCount}   |   ${t('tierPrevention') || 'Prevention'}: ${prevCount}   |   ${t('tierReference') || 'Reference'}: ${refCount}   |   Total: ${rows.length}`,
        margin,
        y,
    );
    y += 6;
    // Table header
    const headers = [
        t('name') || 'Element',
        t('parameter') || 'Parameter',
        t('value') || 'Value',
        t('limit') || 'Limit',
        'Tier',
        t('source') || 'Source',
    ];
    const colW = contentW / headers.length;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, y - 3, contentW, 5, 'F');
    for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], margin + i * colW + 1, y);
    }
    y += 4;
    doc.setFont('helvetica', 'normal');
    // Rows (limit to 50 to avoid huge PDFs)
    doc.setFontSize(7);
    const maxRows = Math.min(rows.length, 50);
    for (let r = 0; r < maxRows; r++) {
        if (y > pageH - margin - 10) {
            _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
            y = margin + 8;
        }
        // Color-code severity column
        const row = rows[r] || [];
        const tier = row[4];
        if (tier === 'VI') doc.setTextColor(220, 38, 38);
        else if (tier === 'VP') doc.setTextColor(180, 130, 0);
        else doc.setTextColor(37, 99, 235);
        for (let i = 0; i < headers.length; i++) {
            const text = String(row[i] || '').substring(0, 25);
            if (i !== 4) doc.setTextColor(0, 0, 0);
            doc.text(text, margin + i * colW + 1, y);
            if (i === 4) doc.setTextColor(0, 0, 0);
        }
        y += 4;
    }
    if (rows.length > maxRows) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(`+${rows.length - maxRows} more exceedances`, margin, y);
        doc.setTextColor(0, 0, 0);
        y += 4;
    }
    // Separator
    y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
    return y;
}
// ----------------------------------------------------------------
// TABLE RENDERER
// Desenha tabela com header escuro, linhas alternadas e page break
// ----------------------------------------------------------------
/**
 * Render a data table in the PDF.
 * @private
 * @param {PdfDoc} doc
 * @param {string[]} headers - Column headers
 * @param {string[][]} rows - Row data
 * @param {number} y - Start Y position
 * @param {number} margin - Page margin
 * @param {number} contentW - Available content width
 * @param {number} pageW - Page width
 * @param {number} pageH - Page height
 * @param {string} projectName - For page break headers
 * @returns {number} New cursor Y after table
 */
function _renderTable(doc: any, headers: string[], rows: string[][], y: number, margin: number, contentW: number, pageW: number, pageH: number, projectName: string) {
    const colW = contentW / headers.length;
    const rowH = 5;
    // Header row
    doc.setFillColor(45, 55, 72);
    doc.rect(margin, y - 3, contentW, rowH + 1, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], margin + i * colW + 1, y);
    }
    y += rowH;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');
    // Data rows
    const maxRows = Math.min(rows.length, 60);
    for (let r = 0; r < maxRows; r++) {
        if (y > pageH - margin - 10) {
            _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
            y = margin + 8;
            // Repeat header on new page
            doc.setFillColor(45, 55, 72);
            doc.rect(margin, y - 3, contentW, rowH + 1, 'F');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            for (let i = 0; i < headers.length; i++) {
                doc.text(headers[i], margin + i * colW + 1, y);
            }
            y += rowH;
            doc.setTextColor(0, 0, 0);
            doc.setFont('helvetica', 'normal');
        }
        // Alternating background
        if (r % 2 === 0) {
            doc.setFillColor(245, 247, 250);
            doc.rect(margin, y - 3, contentW, rowH, 'F');
        }
        doc.setFontSize(7);
        for (let i = 0; i < headers.length; i++) {
            const row = rows[r] || [];
            const text = String(row[i] || '').substring(0, 28);
            doc.text(text, margin + i * colW + 1, y);
        }
        y += rowH - 1;
    }
    if (rows.length > maxRows) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(`+${rows.length - maxRows} more rows`, margin, y + 2);
        doc.setTextColor(0, 0, 0);
        y += 5;
    }
    return y + 4;
}
// ----------------------------------------------------------------
// FIGURE RENDERER
// Insere imagem com legenda centralizada
// ----------------------------------------------------------------
/**
 * Render a figure (chart image) in the PDF with caption.
 * @private
 * @param {PdfDoc} doc
 * @param {string} imageDataUrl - Base64 data URL
 * @param {string} caption - Figure caption
 * @param {number} y - Start Y position
 * @param {number} margin
 * @param {number} contentW
 * @param {number} pageW
 * @param {number} pageH
 * @param {string} projectName
 * @param {number} [imgH=55] - Image height in mm
 * @returns {number} New cursor Y
 */
function _renderFigure(doc: any, imageDataUrl: string | null | undefined, caption: string, y: number, margin: number, contentW: number, pageW: number, pageH: number, projectName: string, imgH: number = 55) {
    if (!imageDataUrl) return y;
    // Verifica espaco na pagina
    if (y + imgH + 12 > pageH - margin) {
        _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
        y = margin + 8;
    }
    const imgW = Math.min(contentW, 150);
    const imgX = margin + (contentW - imgW) / 2;
    const fmt = imageDataUrl.startsWith('data:image/jpeg') ? 'JPEG' : 'PNG';
    doc.addImage(imageDataUrl, fmt, imgX, y, imgW, imgH);
    y += imgH + 2;
    // Caption
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 100, 100);
    const captionLines = doc.splitTextToSize(caption, contentW);
    doc.text(captionLines, pageW / 2, y, { align: 'center' });
    y += captionLines.length * 3.5 + 4;
    doc.setTextColor(0, 0, 0);
    return y;
}
// ----------------------------------------------------------------
// SECTION HEADER HELPER
// ----------------------------------------------------------------
/**
 * @private
 * @param {PdfDoc} doc
 * @param {string} title
 * @param {number} y
 * @param {number} margin
 * @param {number} contentW
 * @param {number} pageW
 * @param {number} pageH
 * @param {string} projectName
 * @param {number[]} [color]
 * @returns {number}
 */
function _addSectionHeader(doc: any, title: string, y: number, margin: number, contentW: number, pageW: number, pageH: number, projectName: string, color: number[] = [45, 55, 72]) {
    if (y > pageH - margin - 30) {
        _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
        y = margin + 8;
    }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(title, margin, y);
    y += 2;
    doc.setDrawColor(...color);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageW - margin, y);
    y += 6;
    return y;
}
// ----------------------------------------------------------------
// METRICS SECTIONS
// Seções automatizadas: resumo, EIS, custos, compliance, EVA
// ----------------------------------------------------------------
/**
 * Add all enabled metrics sections to the PDF.
 * @private
 * @param {PdfDoc} doc
 * @param {number} y
 * @param {number} pageW
 * @param {number} pageH
 * @param {number} margin
 * @param {number} contentW
 * @param {string} projectName
 * @param {MetricBundle} metrics
 * @param {Record<string, any>} chartMod
 * @param {string[]} sections
 * @returns {number}
 */
function _addMetricsSections(doc: any, y: number, pageW: number, pageH: number, margin: number, contentW: number, projectName: string, metrics: any, chartMod: any, sections: any[]) {
    /** @param {string} y */
    const has = (s: string) => sections.includes(s);
    // --- Project Summary ---
    if (has('projectSummary') && metrics.projectSummary) {
        const ps = metrics.projectSummary;
        y = _addSectionHeader(
            doc,
            t('metricsProjectSummary') || 'Project Summary',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
        );
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `${t('metricsElements') || 'Elements'}: ${ps.elementCount}   |   ${t('metricsObservations') || 'Observations'}: ${ps.observationCount}   |   ${t('metricsCampaigns') || 'Campaigns'}: ${ps.campaignCount}`,
            margin,
            y,
        );
        y += 5;
        // Família breakdown
        if (ps.familyCounts && Object.keys(ps.familyCounts).length > 0) {
            const famHeaders = [t('family') || 'Family', t('count') || 'Count'];
            const famRows = Object.entries(ps.familyCounts).map(([fam, count]) => [fam, String(count)]);
            y = _renderTable(
                doc,
                famHeaders,
                famRows,
                y,
                margin,
                contentW * 0.4,
                margin + contentW * 0.4,
                pageH,
                projectName,
            );
        }
        y += 4;
    }
    // --- EIS Score ---
    if (has('eis') && metrics.eis) {
        const eis = metrics.eis;
        y = _addSectionHeader(
            doc,
            t('metricsEISScore') || 'EIS — Environmental Integrity Score',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
            [99, 102, 241],
        );
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`${(eis.score ?? 0).toFixed(2)}  ${eis.verdictEmoji || ''}  ${eis.verdict || ''}`, margin, y);
        y += 7;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `Mode: ${eis.mode}   |   Credential Multiplier: ${eis.credentialMultiplier?.toFixed(2) || '1.00'}`,
            margin,
            y,
        );
        y += 6;
        // Radar chart
        const radarImg = chartMod.captureEISRadarChart(eis.axisScores, eis.axes);
        y = _renderFigure(doc, radarImg, 'EIS Radar — 3CTA+ Axes', y, margin, contentW, pageW, pageH, projectName, 50);
        // ODS Overlay section (SPEC §8)
        const overlay = eis.odsOverlay;
        if (overlay && overlay.enabled && overlay.axes) {
            y = _addSectionHeader(doc, 'ODS / SDG Monitoring Overlay', y, margin, contentW, pageW, pageH, projectName);
            doc.setFontSize(9);
            doc.setTextColor(102, 102, 102);
            doc.text(
                `Composite: ${Number(overlay.composite || 0).toFixed(2)}   |   Coverage: ${Math.round(Number(overlay.coverage || 0) * 100)}%   |   Confidence: ${overlay.confidence?.level || 'low'} (${Number(overlay.confidence?.score || 0).toFixed(2)})`,
                margin,
                y,
            );
            y += 6;
            const odsRows = Object.entries(overlay.axes)
                .sort((a, b) => {
                    const na = Number(String(a[0]).replace('ODS', ''));
                    const nb = Number(String(b[0]).replace('ODS', ''));
                    return na - nb;
                })
                .map(([key, axis]: [string, any]) => [
                    key,
                    axis?.title || key,
                    axis?.score != null ? Number(axis.score).toFixed(2) : '—',
                    axis?.evidenceLevel || 'none',
                    `${Number(axis?.eligibleElements || 0)}/${Number(axis?.eligibleReadings || 0)}`,
                ]);
            y = _renderTable(
                doc,
                ['ODS', 'Title', 'Score', 'Evidence', 'E/R'],
                odsRows,
                y,
                margin,
                contentW,
                pageW,
                pageH,
                projectName,
            );
        }
    }
    // --- Cost Summary ---
    if (has('costSummary') && metrics.costSummary) {
        const cost = metrics.costSummary;
        y = _addSectionHeader(
            doc,
            t('metricsCostTotal') || 'Cost Summary',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
            [59, 107, 255],
        );
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const cur = cost.currency || 'BRL';
        doc.text(
            `Total: ${cur} ${cost.grandTotal?.toLocaleString()}   |   CAPEX: ${cur} ${cost.totalCapex?.toLocaleString()}   |   OPEX: ${cur} ${cost.totalOpex?.toLocaleString()}`,
            margin,
            y,
        );
        y += 6;
        // Cost by family table
        if (cost.byFamily) {
            const famHeaders = [t('family') || 'Family', 'CAPEX', 'OPEX', 'Total'];
            const famRows = Object.entries(cost.byFamily)
                .filter(([, v]) => (v as any).total > 0)
                .map(([fam, v]) => [
                    fam,
                    (v as any).capex?.toLocaleString(),
                    (v as any).opex?.toLocaleString(),
                    (v as any).total?.toLocaleString(),
                ]);
            if (famRows.length > 0) {
                y = _renderTable(doc, famHeaders, famRows, y, margin, contentW, pageW, pageH, projectName);
            }
        }
        // CAPEX/OPEX timeline chart
        const timelineImg = chartMod.captureCapexOpexChart(cost.timeline);
        y = _renderFigure(
            doc,
            timelineImg,
            'CAPEX vs OPEX by Fiscal Year',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
        );
        // Cost by family doughnut
        const familyImg = chartMod.captureCostByFamilyChart(cost.byFamily);
        y = _renderFigure(
            doc,
            familyImg,
            'Cost Distribution by Element Family',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
            45,
        );
        // Campaign cost chart
        const campaignImg = chartMod.captureCampaignCostChart(cost.byCampaign);
        y = _renderFigure(doc, campaignImg, 'Cost by Campaign', y, margin, contentW, pageW, pageH, projectName);
        // Cumulative chart
        const cumImg = chartMod.captureCumulativeCostChart(cost.timeline);
        y = _renderFigure(doc, cumImg, 'Cumulative Cost Over Time', y, margin, contentW, pageW, pageH, projectName);
    }
    // --- Compliance ---
    if (has('compliance') && metrics.compliance) {
        const comp = metrics.compliance;
        y = _addSectionHeader(
            doc,
            t('metricsViolations') || 'Regulatory Compliance',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
            [239, 68, 68],
        );
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `Total: ${comp.totalViolations}   |   ${t('metricsIntervention') || 'Intervention'}: ${comp.intervention}   |   ${t('metricsPrevention') || 'Prevention'}: ${comp.prevention}   |   ${t('metricsReference') || 'Reference'}: ${comp.reference}`,
            margin,
            y,
        );
        y += 6;
        // Violations by element table
        const elEntries = Object.values(comp.violationsByElement);
        if (elEntries.length > 0) {
            const elHeaders = [t('name') || 'Element', t('family') || 'Family', t('metricsViolations') || 'Violations'];
            const elRows = elEntries.sort((a: any, b: any) => b.count - a.count).map((e: any) => [e.name, e.family, String(e.count)]);
            y = _renderTable(doc, elHeaders, elRows, y, margin, contentW, pageW, pageH, projectName);
        }
        // Violations timeline chart
        const violImg = chartMod.captureViolationsChart(comp.timeline);
        y = _renderFigure(
            doc,
            violImg,
            'Violations Timeline by Severity',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
        );
    }
    // --- EVA ---
    if (has('eva') && metrics.eva) {
        const eva = metrics.eva;
        y = _addSectionHeader(
            doc,
            'EVA — Earned Value Analysis',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
            [76, 175, 80],
        );
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(
            `BAC: ${(eva.BAC ?? 0).toLocaleString()}   |   EAC: ${(eva.EAC ?? 0).toLocaleString()}   |   VAC: ${(eva.VAC ?? 0).toLocaleString()}   |   SPI: ${(eva.SPI ?? 0).toFixed(2)}   |   CPI: ${(eva.CPI ?? 0).toFixed(2)}`,
            margin,
            y,
        );
        y += 6;
        // EVA chart
        const evaImg = chartMod.captureEVAChart(eva.itemEvas);
        y = _renderFigure(
            doc,
            evaImg,
            'Earned Value Analysis — PV / EV / AC',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
        );
    }
    // --- Element Inventory Table ---
    if (has('elementInventory') && metrics.elementInventory?.length > 0) {
        y = _addSectionHeader(
            doc,
            t('metricsElements') || 'Element Inventory',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
        );
        const invHeaders = [
            t('name') || 'Name',
            t('family') || 'Family',
            t('metricsObservations') || 'Obs.',
            t('metricsCampaigns') || 'Latest Campaign',
        ];
        const invRows = metrics.elementInventory.map((e: any) => [
            e.name,
            e.family,
            String(e.observationCount),
            e.latestCampaign,
        ]);
        y = _renderTable(doc, invHeaders, invRows, y, margin, contentW, pageW, pageH, projectName);
    }
    // --- Campaign Summary Table ---
    if (has('campaignSummary') && metrics.campaignSummary?.length > 0) {
        y = _addSectionHeader(
            doc,
            t('metricsCampaigns') || 'Campaign Summary',
            y,
            margin,
            contentW,
            pageW,
            pageH,
            projectName,
        );
        const camHeaders = [
            t('name') || 'Name',
            t('date') || 'Date',
            t('metricsElements') || 'Elements',
            'Planned',
            'Executed',
            '%',
        ];
        const camRows = metrics.campaignSummary.map((c: any) => [
            c.name,
            c.date,
            String(c.elementsCovered),
            String(c.planned),
            String(c.executed),
            `${((c.completeness ?? 0) * 100).toFixed(0)}%`,
        ]);
        y = _renderTable(doc, camHeaders, camRows, y, margin, contentW, pageW, pageH, projectName);
    }
    // --- Calculator Metrics (Transposed Table) ---
    if (has('calculator') && metrics.calculator) {
        y = _addCalculatorSection(doc, y, pageW, pageH, margin, contentW, projectName, metrics.calculator);
    }
    // --- Compliance Matrix (Transposed Table) ---
    if (has('complianceMatrix') && metrics.complianceMatrix) {
        y = _addComplianceMatrixSection(doc, y, pageW, pageH, margin, contentW, projectName, metrics.complianceMatrix);
    }
    return y;
}
// ----------------------------------------------------------------
// CALCULATOR SECTION - Tabela transposta (elementos x items)
// Linhas = elementos, colunas = items do Calculator, celulas = valor
// ----------------------------------------------------------------
/**
 * @private
 * @param {PdfDoc} y
 * @param {number} y
 * @param {number} y
 * @param {number} y
 * @param {number} y
 * @param {number} y
 * @param {string} y
 * @param {MatrixSectionData} y
 * @returns {number}
 */
function _addCalculatorSection(doc: any, y: number, pageW: number, pageH: number, margin: number, contentW: number, projectName: string, data: any) {
    if (!data || !data.rows || data.rows.length === 0) return y;
    y = _addSectionHeader(
        doc,
        t('exportSectionCalculator') || 'Calculator Metrics',
        y,
        margin,
        contentW,
        pageW,
        pageH,
        projectName,
        [107, 114, 128],
    );
    // Transposed table: Element | Item1 | Item2 | ...
    const headers = data.headers.map((h: any) => String(h).substring(0, 20));
    const rows = data.rows.map((row: any) => {
        const cells = [row.element.substring(0, 18)];
        for (const cell of row.cells) {
            if (cell.value == null || cell.value === '') {
                cells.push('\u2014');
            } else if (typeof cell.value === 'number') {
                cells.push(cell.value.toFixed(2));
            } else {
                cells.push(String(cell.value).substring(0, 14));
            }
        }
        return cells;
    });
    y = _renderTable(doc, headers, rows, y, margin, contentW, pageW, pageH, projectName);
    // Aggregates (totais/medias globais do computeAllCalculator)
    if (data.aggregates && data.aggregates.length > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Aggregates:', margin, y);
        y += 4;
        doc.setFont('helvetica', 'normal');
        for (const agg of data.aggregates) {
            if (y > pageH - margin - 10) {
                _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
                y = margin + 8;
            }
            const val = typeof agg.value === 'number' ? agg.value.toFixed(2) : agg.value || '\u2014';
            doc.text(`${agg.label}: ${val}`, margin + 4, y);
            y += 4;
        }
    }
    y += 4;
    return y;
}
// ----------------------------------------------------------------
// COMPLIANCE MATRIX SECTION - Tabela transposta (elementos x params)
// Celulas coloridas por severidade regulatoria
// ----------------------------------------------------------------
/**
 * @private
 * @param {PdfDoc} doc
 * @param {number} y
 * @param {number} pageW
 * @param {number} pageH
 * @param {number} margin
 * @param {number} contentW
 * @param {string} projectName
 * @param {MatrixSectionData} data
 * @returns {number}
 */
function _addComplianceMatrixSection(doc: any, y: number, pageW: number, pageH: number, margin: number, contentW: number, projectName: string, data: any) {
    if (!data || !data.rows || data.rows.length === 0) return y;
    y = _addSectionHeader(
        doc,
        t('exportSectionComplianceMatrix') || 'Compliance Matrix',
        y,
        margin,
        contentW,
        pageW,
        pageH,
        projectName,
        [239, 68, 68],
    );
    const headers = data.headers.map((h: any) => String(h).substring(0, 16));
    const colW = contentW / headers.length;
    const rowH = 5;
    // Funcao interna para desenhar header row
    function drawHeader() {
        doc.setFillColor(45, 55, 72);
        doc.rect(margin, y - 3, contentW, rowH + 1, 'F');
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        for (let i = 0; i < headers.length; i++) {
            doc.text(headers[i], margin + i * colW + 1, y);
        }
        y += rowH;
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
    }
    // Header inicial
    if (y > pageH - margin - 20) {
        _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
        y = margin + 8;
    }
    drawHeader();
    // Data rows com coloracao por severidade
    const maxRows = Math.min(data.rows.length, 60);
    for (let r = 0; r < maxRows; r++) {
        if (y > pageH - margin - 10) {
            _addPageWithHeaderFooter(doc, pageW, pageH, margin, projectName);
            y = margin + 8;
            drawHeader();
        }
        // Fundo alternado
        if (r % 2 === 0) {
            doc.setFillColor(245, 247, 250);
            doc.rect(margin, y - 3, contentW, rowH, 'F');
        }
        const row = data.rows[r];
        doc.setFontSize(7);
        // Coluna 0: nome do elemento
        doc.setTextColor(0, 0, 0);
        doc.text(row.element.substring(0, 18), margin + 1, y);
        // Colunas 1+: valores com cor por severidade
        for (let c = 0; c < row.cells.length; c++) {
            const cell = row.cells[c];
            const colIdx = c + 1;
            if (cell.value == null) {
                doc.setTextColor(180, 180, 180);
                doc.text('\u2014', margin + colIdx * colW + 1, y);
            } else {
                // Cor por severidade regulatoria
                if (cell.severity === 'intervention') doc.setTextColor(220, 38, 38);
                else if (cell.severity === 'prevention') doc.setTextColor(180, 130, 0);
                else if (cell.severity === 'reference') doc.setTextColor(37, 99, 235);
                else doc.setTextColor(0, 0, 0);
                const valText =
                    typeof cell.value === 'number' ? cell.value.toFixed(2) : String(cell.value).substring(0, 12);
                doc.text(valText, margin + colIdx * colW + 1, y);
            }
        }
        doc.setTextColor(0, 0, 0);
        y += rowH - 1;
    }
    if (data.rows.length > maxRows) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(`+${data.rows.length - maxRows} more elements`, margin, y + 2);
        doc.setTextColor(0, 0, 0);
        y += 5;
    }
    y += 4;
    return y;
}
// ----------------------------------------------------------------
// HELPER - Nova pagina com reserva para header/footer
// ----------------------------------------------------------------
/**
 * @private
 * @param {PdfDoc} doc
 * @param {number} _pageW
 * @param {number} _pageH
 * @param {number} _margin
 * @param {string} _projectName
 */
function _addPageWithHeaderFooter(doc: any, _pageW: number, _pageH: number, _margin: number, _projectName: string) {
    doc.addPage();
    // Header e footer sao adicionados no loop final (passo 9)
}
// ----------------------------------------------------------------
// HTML PARSER
// Converte HTML do relatorio em lista de blocos tipados
// ----------------------------------------------------------------
/**
 * Parse HTML content into structured blocks for PDF rendering.
 * Exportado para reuso pelo docxExport.
 * @param {string} html
 * @returns {ReportBlock[]}
 */
export function parseHtmlToBlocks(html: string) {
    const blocks: any[] = [];
    const container = document.createElement('div');
    container.innerHTML = html;
    let listIndex: number;
    let inOrderedList: boolean;
    for (const node of container.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            const text = (node.textContent || '').trim();
            if (text) blocks.push({ type: 'paragraph', text });
            continue;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const element = node as HTMLElement;
        const tag = element.tagName.toLowerCase();
        // Headings
        if (/^h[1-6]$/.test(tag)) {
            blocks.push({
                type: 'heading',
                level: parseInt(tag[1] || '1'),
                text: (element.textContent || '').trim(),
            });
            continue;
        }
        // Lists
        if (tag === 'ul' || tag === 'ol') {
            inOrderedList = tag === 'ol';
            listIndex = 0;
            for (const li of element.querySelectorAll('li')) {
                listIndex++;
                blocks.push({
                    type: 'list-item',
                    text: (li.textContent || '').trim(),
                    ordered: inOrderedList,
                    index: listIndex,
                });
            }
            continue;
        }
        // Blockquote
        if (tag === 'blockquote') {
            blocks.push({ type: 'blockquote', text: (element.textContent || '').trim() });
            continue;
        }
        // Horizontal rule
        if (tag === 'hr') {
            blocks.push({ type: 'horizontal-rule' });
            continue;
        }
        // Paragraphs and divs - check for scene anchors inside
        if (tag === 'p' || tag === 'div') {
            _extractBlocksFromParagraph(element, blocks);
            continue;
        }
        // Scene anchor at top level
        if (element.classList?.contains('report-scene-anchor')) {
            blocks.push({ type: 'scene-anchor', sceneId: element.dataset.sceneId });
            continue;
        }
        // Metric anchor at top level
        if (element.classList?.contains('report-metric-anchor')) {
            blocks.push({
                type: 'metric-anchor',
                metricType: element.dataset.metricType,
                filterPresetId: element.dataset.filterPreset || null,
            });
            continue;
        }
        // Fallback: treat as paragraph
        const text = (element.textContent || '').trim();
        if (text) blocks.push({ type: 'paragraph', text });
    }
    return blocks;
}
/**
 * Extract text and scene anchor blocks from a paragraph element.
 * @param {HTMLElement} pNode
 * @param {Array<any>} blocks
 */
function _extractBlocksFromParagraph(pNode: HTMLElement, blocks: any[]) {
    let textParts: Array<string | null> = [];
    for (const child of pNode.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            textParts.push(child.textContent);
        } else if ((child as HTMLElement).classList?.contains('report-scene-anchor')) {
            // Flush text before anchor
            const text = textParts.join('').trim();
            if (text) blocks.push({ type: 'paragraph', text });
            textParts = [];
            blocks.push({ type: 'scene-anchor', sceneId: (child as HTMLElement).dataset.sceneId });
        } else if ((child as HTMLElement).classList?.contains('report-metric-anchor')) {
            const text = textParts.join('').trim();
            if (text) blocks.push({ type: 'paragraph', text });
            textParts = [];
            blocks.push({
                type: 'metric-anchor',
                metricType: (child as HTMLElement).dataset.metricType,
                filterPresetId: (child as HTMLElement).dataset.filterPreset || null,
            });
        } else {
            textParts.push(child.textContent);
        }
    }
    const remaining = textParts.join('').trim();
    if (remaining) blocks.push({ type: 'paragraph', text: remaining });
}
// ----------------------------------------------------------------
// SCENE SCREENSHOT
// Captura imagem do viewer 3D com estado de camera especifico
// ----------------------------------------------------------------
/**
 * Capture a screenshot of the 3D viewer at a given camera state.
 * Exportado para uso no thumbnail hover do editor.
 *
 * @param {Object} viewState - Camera state to apply
 * @returns {string|null} Data URL (image/png)
 */
export function captureSceneScreenshot(viewState: any) {
    const renderer = getRenderer();
    const scene3d = getScene();
    const camera = getCamera();
    if (!renderer || !scene3d || !camera) return null;
    // Aplica estado da camera
    setCameraState(viewState);
    // Renderiza um frame
    renderer.render(scene3d, camera);
    // Captura como JPEG comprimido (reduz ~5-8x vs PNG)
    return renderer.domElement.toDataURL('image/jpeg', 0.85);
}
// ----------------------------------------------------------------
// HELPERS
// ----------------------------------------------------------------
/**
 * @private
 * @param {string} str
 * @returns {string}
 */
function _sanitizeFilename(str: string) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}
//# sourceMappingURL=pdfExport.js.map
