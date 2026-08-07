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
   REPORT DOCX EXPORT — Generate Word document from report
   Exporta relatorio como DOCX com métricas, tabelas e gráficos

   Carrega biblioteca docx via CDN (lazy-load), converte conteúdo
   HTML do editor em parágrafos/headings/listas do docx, e adiciona
   seções de métricas com tabelas e figuras embutidas.

   Usa mesma estrutura do pdfExport: parseHtmlToBlocks, scene
   screenshots, metricsCollector e chartCapture.
   ================================================================ */
import { getReport } from './manager.js';
import { parseHtmlToBlocks, captureSceneScreenshot } from './pdfExport.js';
import { getSceneById } from '../scenes/manager.js';
import { getCameraState, setCameraState } from '../scene/controls.js';
import { t } from '../i18n/translations.js';
import { loadScriptCDN } from '../helpers/cdnLoader.js';
import { sanitizeDocxXmlData, sanitizeDocxXmlText } from '../helpers/docxSanitizer.js';
// ----------------------------------------------------------------
// DOCX CDN LOADER
// ----------------------------------------------------------------
const DOCX_CDN = 'https://cdn.jsdelivr.net/npm/docx@9.1.1/build/index.umd.min.js';
let _docxExportInFlight = false;
/** @private */
function _loadDocx() {
    return loadScriptCDN(DOCX_CDN, { name: 'docx', globalVar: 'docx' });
}
// ----------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------
/**
 * Export the report as a DOCX with optional metrics, tables and charts.
 * Gera documento Word a partir do relatório com seções configuráveis.
 *
 * @param {Object} [options] - Export options
 * @param {string[]} [options.sections] - Sections to include
 */
export async function exportReportDOCX(options = {}) {
    if (_docxExportInFlight) {
        throw new Error('DOCX_EXPORT_IN_PROGRESS');
    }
    _docxExportInFlight = true;
    let originalState = null;
    try {
        await _loadDocx();
        const D = window.docx;
        let removedInvalidChars = 0;
        /** @param {unknown} value */
        const sanitizeText = (value: unknown) => {
            const sanitized = sanitizeDocxXmlText(value);
            removedInvalidChars += sanitized.removedInvalidChars;
            return sanitized.text;
        };
        /** @param {unknown} value */
        const sanitizeData = (value: unknown) => {
            const sanitized = sanitizeDocxXmlData(value);
            removedInvalidChars += sanitized.removedInvalidChars;
            return sanitized.value;
        };
        // Snapshot do report no inicio para manter consistencia da execucao.
        const reportState = getReport() || {};
        const reportSnapshot = {
            title: reportState.title || '',
            content: reportState.content || '',
            lastModified: reportState.lastModified || null,
        };
        const reportTitle = sanitizeText(reportSnapshot.title);
        const reportContent = sanitizeText(reportSnapshot.content);
        if (!reportContent) {
            throw new Error('DOCX_EMPTY_CONTENT');
        }
        const projectName = sanitizeText(document.getElementById('project-name')?.value || 'report');
        const date = new Date().toISOString().slice(0, 10);
        const sections = Array.isArray((options as any).sections) ? [...(options as any).sections] : [];
        const hasMetrics = sections.length > 0;
        // Salva camera para restaurar depois
        originalState = getCameraState();
        // Parse HTML from snapshot
        const parsedBlocks = parseHtmlToBlocks(reportContent);
        const blocksValue = sanitizeData(parsedBlocks);
        const blocks = Array.isArray(blocksValue) ? blocksValue : [];
        const hasMetricAnchors = blocks.some((b) => b.type === 'metric-anchor');
        // Coleta metricas se necessario (sem anchors = legado, metricas no topo)
        let metrics = null;
        let chartMod = null;
        if (hasMetrics && !hasMetricAnchors) {
            const metricsModule = await import('./metricsCollector.js');
            metrics = sanitizeData(metricsModule.collectReportMetrics(null));
            chartMod = await import('./chartCapture.js');
        }
        // Build document children
        const children = [];
        // --- Title ---
        if (reportTitle) {
            children.push(
                new D.Paragraph({
                    text: reportTitle,
                    heading: D.HeadingLevel.TITLE,
                    spacing: { after: 200 },
                }),
            );
        }
        children.push(
            new D.Paragraph({
                children: [new D.TextRun({ text: `${projectName} — ${date}`, color: '888888', size: 20 })],
                spacing: { after: 400 },
            }),
        );
        // --- Metrics sections (before user content, legado sem anchors) ---
        if (hasMetrics && metrics && !hasMetricAnchors) {
            const metricChildren = _buildMetricsSections(D, metrics, chartMod || {}, sections);
            children.push(...metricChildren);
            // Separator
            children.push(
                new D.Paragraph({
                    border: { bottom: { color: 'CCCCCC', size: 1, style: D.BorderStyle.SINGLE } },
                    spacing: { after: 400 },
                }),
            );
        }
        // --- Report content blocks ---
        for (const block of blocks) {
            if (block.type === 'heading') {
                const level =
                    block.level === 1
                        ? D.HeadingLevel.HEADING_1
                        : block.level === 2
                          ? D.HeadingLevel.HEADING_2
                          : D.HeadingLevel.HEADING_3;
                children.push(
                    new D.Paragraph({
                        text: block.text || '',
                        heading: level,
                        spacing: { before: 240, after: 120 },
                    }),
                );
            } else if (block.type === 'paragraph') {
                children.push(
                    new D.Paragraph({
                        children: [new D.TextRun({ text: block.text || '', size: 22 })],
                        spacing: { after: 120 },
                    }),
                );
            } else if (block.type === 'list-item') {
                children.push(
                    new D.Paragraph({
                        children: [new D.TextRun({ text: block.text || '', size: 22 })],
                        bullet: block.ordered ? undefined : { level: 0 },
                        numbering: block.ordered ? { reference: 'default-numbering', level: 0 } : undefined,
                        spacing: { after: 60 },
                    }),
                );
            } else if (block.type === 'blockquote') {
                children.push(
                    new D.Paragraph({
                        children: [new D.TextRun({ text: block.text || '', italics: true, color: '666666', size: 22 })],
                        indent: { left: 720 },
                        border: { left: { color: '3C82C8', size: 3, style: D.BorderStyle.SINGLE } },
                        spacing: { after: 120 },
                    }),
                );
            } else if (block.type === 'horizontal-rule') {
                children.push(
                    new D.Paragraph({
                        border: { bottom: { color: 'CCCCCC', size: 1, style: D.BorderStyle.SINGLE } },
                        spacing: { after: 200 },
                    }),
                );
            } else if (block.type === 'scene-anchor' && sections.includes('sceneScreenshots')) {
                // Captura screenshot da cena
                if (!block.sceneId) continue;
                const scene = getSceneById(block.sceneId);
                if (scene?.viewStart) {
                    try {
                        const imgData = captureSceneScreenshot(scene.viewStart);
                        if (imgData) {
                            const sceneCaption = sanitizeText(`Scene: ${scene.name || block.sceneId}`);
                            const imgParagraph = _buildFigure(D, imgData, sceneCaption);
                            children.push(...imgParagraph);
                        }
                    } catch (e) {
                        console.warn('[DOCX] Screenshot failed for scene', block.sceneId, e);
                    }
                }
            } else if (block.type === 'metric-anchor') {
                const metricType = block.metricType || '';
                // Inline metric anchor - renderiza secao na posicao do cursor
                if (hasMetrics && !sections.includes(metricType)) continue;
                // Lazy-load chart module para secoes com graficos
                const needsCharts = ['eis', 'costSummary', 'compliance', 'eva'].includes(metricType);
                if (needsCharts && !chartMod) {
                    chartMod = await import('./chartCapture.js');
                }
                const { collectSingleMetric } = await import('./metricsCollector.js');
                const singleMetrics = sanitizeData(collectSingleMetric(metricType, block.filterPresetId));
                const metricChildren = _buildMetricsSections(D, singleMetrics, chartMod || {}, [metricType]);
                children.push(...metricChildren);
            }
        }
        // Restaura camera antes do empacotamento
        if (originalState) {
            setCameraState(originalState);
            originalState = null;
        }
        // --- Build document ---
        const doc = new D.Document({
            numbering: {
                config: [
                    {
                        reference: 'default-numbering',
                        levels: [
                            {
                                level: 0,
                                format: D.LevelFormat.DECIMAL,
                                text: '%1.',
                                alignment: D.AlignmentType.START,
                            },
                        ],
                    },
                ],
            },
            sections: [
                {
                    properties: {
                        page: {
                            size: { orientation: D.PageOrientation.PORTRAIT },
                            margin: { top: 1440, right: 1080, bottom: 1440, left: 1080 },
                        },
                    },
                    headers: {
                        default: new D.Header({
                            children: [
                                new D.Paragraph({
                                    children: [
                                        new D.TextRun({ text: projectName, color: 'AAAAAA', size: 16 }),
                                        new D.TextRun({ text: `    ${date}`, color: 'AAAAAA', size: 16 }),
                                    ],
                                }),
                            ],
                        }),
                    },
                    footers: {
                        default: new D.Footer({
                            children: [
                                new D.Paragraph({
                                    alignment: D.AlignmentType.CENTER,
                                    children: [
                                        new D.TextRun({ children: [D.PageNumber.CURRENT], color: 'AAAAAA', size: 16 }),
                                        new D.TextRun({ text: ' / ', color: 'AAAAAA', size: 16 }),
                                        new D.TextRun({
                                            children: [D.PageNumber.TOTAL_PAGES],
                                            color: 'AAAAAA',
                                            size: 16,
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    },
                    children,
                },
            ],
        });
        // --- Download ---
        const blob = await D.Packer.toBlob(doc);
        const filename = `report-${_sanitizeFilename(projectName)}-${date}.docx`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return {
            filename,
            removedInvalidChars,
            hadInvalidChars: removedInvalidChars > 0,
        };
    } catch (err) {
        const error: any = err;
        if (error?.message === 'DOCX_EXPORT_IN_PROGRESS' || error?.message === 'DOCX_EMPTY_CONTENT') {
            throw err;
        }
        const wrapped = new Error('DOCX_GENERATION_FAILED');
        wrapped.cause = err;
        throw wrapped;
    } finally {
        if (originalState) {
            try {
                setCameraState(originalState);
            } catch (e) {
                console.debug('[docxExport] restoreCamera:', e instanceof Error ? e.message : e);
                // noop
            }
        }
        _docxExportInFlight = false;
    }
}
// ----------------------------------------------------------------
// METRICS SECTIONS BUILDER
// ----------------------------------------------------------------
/**
 * @private
 * @param {DocxModule} D
 * @param {Record<string, any>} metrics
 * @param {Record<string, any>} chartMod
 * @param {string[]} sections
 * @returns {any[]}
 */
function _buildMetricsSections(D: any, metrics: any, chartMod: any, sections: string[]) {
    const children = [];
    /** @param {string} text */
    const has = (s: string) => sections.includes(s);
    // --- Project Summary ---
    if (has('projectSummary') && metrics.projectSummary) {
        const ps = metrics.projectSummary;
        children.push(_heading(D, t('metricsProjectSummary') || 'Project Summary', 1));
        children.push(
            new D.Paragraph({
                children: [
                    new D.TextRun({
                        text: `${t('metricsElements') || 'Elements'}: ${ps.elementCount}   |   ${t('metricsObservations') || 'Observations'}: ${ps.observationCount}   |   ${t('metricsCampaigns') || 'Campaigns'}: ${ps.campaignCount}`,
                        size: 20,
                    }),
                ],
                spacing: { after: 200 },
            }),
        );
        if (ps.familyCounts && Object.keys(ps.familyCounts).length > 0) {
            const table = _buildTable(
                D,
                [t('family') || 'Family', t('count') || 'Count'],
                Object.entries(ps.familyCounts).map(([fam, count]) => [fam, String(count)]),
            );
            children.push(table);
        }
    }
    // --- EIS ---
    if (has('eis') && metrics.eis) {
        const eis = metrics.eis;
        children.push(_heading(D, t('metricsEISScore') || 'EIS — Environmental Integrity Score', 1));
        children.push(
            new D.Paragraph({
                children: [
                    new D.TextRun({
                        text: `${(eis.score ?? 0).toFixed(2)}  ${eis.verdict || ''}`,
                        bold: true,
                        size: 28,
                    }),
                ],
                spacing: { after: 120 },
            }),
        );
        children.push(
            new D.Paragraph({
                children: [
                    new D.TextRun({
                        text: `Mode: ${eis.mode}   |   Credential Multiplier: ${eis.credentialMultiplier?.toFixed(2) || '1.00'}`,
                        size: 18,
                        color: '666666',
                    }),
                ],
                spacing: { after: 200 },
            }),
        );
        const radarImg = chartMod.captureEISRadarChart(eis.axisScores, eis.axes);
        if (radarImg) children.push(..._buildFigure(D, radarImg, 'EIS Radar — 3CTA+ Axes'));
        // ODS Overlay section (SPEC_EIS_ODS_MONITORING_PACK §8)
        const overlay = eis.odsOverlay;
        if (overlay && overlay.enabled && Array.isArray(Object.keys(overlay.axes || {}))) {
            children.push(_heading(D, 'ODS / SDG Monitoring Overlay', 2));
            children.push(
                new D.Paragraph({
                    children: [
                        new D.TextRun({
                            text: `Composite: ${Number(overlay.composite || 0).toFixed(2)}   |   Coverage: ${Math.round(Number(overlay.coverage || 0) * 100)}%   |   Confidence: ${overlay.confidence?.level || 'low'} (${Number(overlay.confidence?.score || 0).toFixed(2)})`,
                            size: 18,
                            color: '666666',
                        }),
                    ],
                    spacing: { after: 160 },
                }),
            );
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
                    `E:${Number(axis?.eligibleElements || 0)} R:${Number(axis?.eligibleReadings || 0)}`,
                ]);
            if (odsRows.length > 0) {
                children.push(_buildTable(D, ['ODS', 'Title', 'Score', 'Evidence', 'Eligible'], odsRows));
            }
        }
    }
    // --- Cost Summary ---
    if (has('costSummary') && metrics.costSummary) {
        const cost = metrics.costSummary;
        children.push(_heading(D, t('metricsCostTotal') || 'Cost Summary', 1));
        const cur = cost.currency || 'BRL';
        children.push(
            new D.Paragraph({
                children: [
                    new D.TextRun({
                        text: `Total: ${cur} ${cost.grandTotal?.toLocaleString()}   |   CAPEX: ${cur} ${cost.totalCapex?.toLocaleString()}   |   OPEX: ${cur} ${cost.totalOpex?.toLocaleString()}`,
                        size: 20,
                    }),
                ],
                spacing: { after: 200 },
            }),
        );
        // Cost by family table
        if (cost.byFamily) {
            const famRows = Object.entries(cost.byFamily)
                .filter(([, v]) => (v as any).total > 0)
                .map(([fam, v]) => [
                    fam,
                    (v as any).capex?.toLocaleString(),
                    (v as any).opex?.toLocaleString(),
                    (v as any).total?.toLocaleString(),
                ]);
            if (famRows.length > 0) {
                children.push(_buildTable(D, [t('family') || 'Family', 'CAPEX', 'OPEX', 'Total'], famRows));
            }
        }
        // Charts
        const charts = [
            [chartMod.captureCapexOpexChart(cost.timeline), 'CAPEX vs OPEX by Fiscal Year'],
            [chartMod.captureCostByFamilyChart(cost.byFamily), 'Cost Distribution by Element Family'],
            [chartMod.captureCampaignCostChart(cost.byCampaign), 'Cost by Campaign'],
            [chartMod.captureCumulativeCostChart(cost.timeline), 'Cumulative Cost Over Time'],
        ];
        for (const [img, caption] of charts) {
            if (img) children.push(..._buildFigure(D, img, caption));
        }
    }
    // --- Compliance ---
    if (has('compliance') && metrics.compliance) {
        const comp = metrics.compliance;
        children.push(_heading(D, t('metricsViolations') || 'Regulatory Compliance', 1));
        children.push(
            new D.Paragraph({
                children: [
                    new D.TextRun({
                        text: `Total: ${comp.totalViolations}   |   ${t('metricsIntervention') || 'Intervention'}: ${comp.intervention}   |   ${t('metricsPrevention') || 'Prevention'}: ${comp.prevention}   |   ${t('metricsReference') || 'Reference'}: ${comp.reference}`,
                        size: 20,
                    }),
                ],
                spacing: { after: 200 },
            }),
        );
        const elEntries = Object.values(comp.violationsByElement);
        if (elEntries.length > 0) {
            const elRows = elEntries.sort((a: any, b: any) => b.count - a.count).map((e: any) => [e.name, e.family, String(e.count)]);
            children.push(
                _buildTable(
                    D,
                    [t('name') || 'Element', t('family') || 'Family', t('metricsViolations') || 'Violations'],
                    elRows,
                ),
            );
        }
        const violImg = chartMod.captureViolationsChart(comp.timeline);
        if (violImg) children.push(..._buildFigure(D, violImg, 'Violations Timeline by Severity'));
    }
    // --- EVA ---
    if (has('eva') && metrics.eva) {
        const eva = metrics.eva;
        children.push(_heading(D, 'EVA — Earned Value Analysis', 1));
        children.push(
            new D.Paragraph({
                children: [
                    new D.TextRun({
                        text: `BAC: ${(eva.BAC ?? 0).toLocaleString()}   |   EAC: ${(eva.EAC ?? 0).toLocaleString()}   |   VAC: ${(eva.VAC ?? 0).toLocaleString()}   |   SPI: ${(eva.SPI ?? 0).toFixed(2)}   |   CPI: ${(eva.CPI ?? 0).toFixed(2)}`,
                        size: 20,
                    }),
                ],
                spacing: { after: 200 },
            }),
        );
        const evaImg = chartMod.captureEVAChart(eva.itemEvas);
        if (evaImg) children.push(..._buildFigure(D, evaImg, 'Earned Value Analysis — PV / EV / AC'));
    }
    // --- Element Inventory ---
    if (has('elementInventory') && metrics.elementInventory?.length > 0) {
        children.push(_heading(D, t('metricsElements') || 'Element Inventory', 1));
        children.push(
            _buildTable(
                D,
                [
                    t('name') || 'Name',
                    t('family') || 'Family',
                    t('metricsObservations') || 'Obs.',
                    t('metricsCampaigns') || 'Latest Campaign',
                ],
                metrics.elementInventory.map((e: any) => [
                    e.name,
                    e.family,
                    String(e.observationCount),
                    e.latestCampaign,
                ]),
            ),
        );
    }
    // --- Campaign Summary ---
    if (has('campaignSummary') && metrics.campaignSummary?.length > 0) {
        children.push(_heading(D, t('metricsCampaigns') || 'Campaign Summary', 1));
        children.push(
            _buildTable(
                D,
                [
                    t('name') || 'Name',
                    t('date') || 'Date',
                    t('metricsElements') || 'Elements',
                    'Planned',
                    'Executed',
                    '%',
                ],
                metrics.campaignSummary.map((c: any) => [
                    c.name,
                    c.date,
                    String(c.elementsCovered),
                    String(c.planned),
                    String(c.executed),
                    `${((c.completeness ?? 0) * 100).toFixed(0)}%`,
                ]),
            ),
        );
    }
    // --- Calculator Metrics (Transposed Table) ---
    if (has('calculator') && metrics.calculator) {
        children.push(..._buildCalculatorSection(D, metrics.calculator));
    }
    // --- Compliance Matrix (Transposed Table) ---
    if (has('complianceMatrix') && metrics.complianceMatrix) {
        children.push(..._buildComplianceMatrixSection(D, metrics.complianceMatrix));
    }
    return children;
}
// ----------------------------------------------------------------
// DOCX HELPERS
// ----------------------------------------------------------------
/**
 * @private
 * @param {DocxModule} text
 * @param {string} text
 * @param {number} text
 * @returns {any}
 */
function _heading(D: any, text: string, level: number) {
    const headingLevel =
        level === 1 ? D.HeadingLevel.HEADING_1 : level === 2 ? D.HeadingLevel.HEADING_2 : D.HeadingLevel.HEADING_3;
    return new D.Paragraph({
        text,
        heading: headingLevel,
        spacing: { before: 360, after: 120 },
    });
}
/**
 * Build a docx Table with styled header.
 * @private
 * @param {DocxModule} D
 * @param {string[]} headers
 * @param {any[][]} rows
 * @returns {any}
 */
function _buildTable(D: any, headers: string[], rows: any[][]) {
    const headerRow = new D.TableRow({
        tableHeader: true,
        children: headers.map(
            (h: string) =>
                new D.TableCell({
                    children: [
                        new D.Paragraph({
                            children: [new D.TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })],
                            alignment: D.AlignmentType.LEFT,
                        }),
                    ],
                    shading: { fill: '2D3748' },
                    margins: { top: 40, bottom: 40, left: 80, right: 80 },
                }),
        ),
    });
    const maxRows = Math.min(rows.length, 60);
    const dataRows = rows.slice(0, maxRows).map(
        (row: any[], ri: number) =>
            new D.TableRow({
                children: row.map(
                    (cell: any) =>
                        new D.TableCell({
                            children: [
                                new D.Paragraph({
                                    children: [new D.TextRun({ text: String(cell || ''), size: 18 })],
                                }),
                            ],
                            shading: ri % 2 === 0 ? { fill: 'F5F7FA' } : undefined,
                            margins: { top: 30, bottom: 30, left: 80, right: 80 },
                        }),
                ),
            }),
    );
    const tableChildren = [headerRow, ...dataRows];
    // Truncation note
    if (rows.length > maxRows) {
        tableChildren.push(
            new D.TableRow({
                children: [
                    new D.TableCell({
                        children: [
                            new D.Paragraph({
                                children: [
                                    new D.TextRun({
                                        text: `+${rows.length - maxRows} more rows`,
                                        italics: true,
                                        color: '888888',
                                        size: 16,
                                    }),
                                ],
                            }),
                        ],
                        columnSpan: headers.length,
                    }),
                ],
            }),
        );
    }
    return new D.Table({
        rows: tableChildren,
        width: { size: 100, type: D.WidthType.PERCENTAGE },
    });
}
/**
 * Build a figure (image + caption) as array of Paragraphs.
 * @private
 * @param {DocxModule} D - docx module
 * @param {string} imageDataUrl - Base64 data URL
 * @param {string} caption
 * @returns {any[]}
 */
function _buildFigure(D: any, imageDataUrl: string | null | undefined, caption: string) {
    if (!imageDataUrl) return [];
    // Extrai base64 do data URL
    const base64 = imageDataUrl.split(',')[1];
    if (!base64) return [];
    // Converte base64 para Uint8Array
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    // Detecta formato da imagem (JPEG dos charts, PNG legado)
    const imgType = imageDataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png';
    return [
        new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            children: [
                new D.ImageRun({
                    data: bytes,
                    transformation: { width: 500, height: 250 },
                    type: imgType,
                }),
            ],
            spacing: { before: 200, after: 80 },
        }),
        new D.Paragraph({
            alignment: D.AlignmentType.CENTER,
            children: [new D.TextRun({ text: caption, italics: true, color: '888888', size: 18 })],
            spacing: { after: 240 },
        }),
    ];
}
// ----------------------------------------------------------------
// CALCULATOR SECTION - Tabela transposta (elementos x items)
// ----------------------------------------------------------------
/**
 * @private
 * @param {DocxModule} D
 * @param {MatrixSectionData} data
 * @returns {any[]}
 */
function _buildCalculatorSection(D: any, data: any) {
    if (!data || !data.rows || data.rows.length === 0) return [];
    const children = [];
    children.push(_heading(D, t('exportSectionCalculator') || 'Calculator Metrics', 1));
    // Transposed table: Element | Item1 | Item2 | ...
    const rows = data.rows.map((row: any) => {
        const cells = [row.element];
        for (const cell of row.cells) {
            if (cell.value == null || cell.value === '') {
                cells.push('\u2014');
            } else if (typeof cell.value === 'number') {
                cells.push(cell.value.toFixed(2));
            } else {
                cells.push(String(cell.value));
            }
        }
        return cells;
    });
    children.push(_buildTable(D, data.headers, rows));
    // Aggregates (totais/medias globais)
    if (data.aggregates && data.aggregates.length > 0) {
        children.push(
            new D.Paragraph({
                children: [new D.TextRun({ text: 'Aggregates:', bold: true, size: 18 })],
                spacing: { before: 200, after: 80 },
            }),
        );
        for (const agg of data.aggregates) {
            const val = typeof agg.value === 'number' ? agg.value.toFixed(2) : agg.value || '\u2014';
            children.push(
                new D.Paragraph({
                    children: [new D.TextRun({ text: `${agg.label}: ${val}`, size: 18 })],
                    indent: { left: 360 },
                    spacing: { after: 40 },
                }),
            );
        }
    }
    return children;
}
// ----------------------------------------------------------------
// COMPLIANCE MATRIX SECTION - Tabela transposta com cores severity
// ----------------------------------------------------------------
/**
 * @private
 * @param {DocxModule} D
 * @param {MatrixSectionData} data
 * @returns {any[]}
 */
function _buildComplianceMatrixSection(D: any, data: any) {
    if (!data || !data.rows || data.rows.length === 0) return [];
    const children = [];
    children.push(_heading(D, t('exportSectionComplianceMatrix') || 'Compliance Matrix', 1));
    // Tabela customizada com celulas coloridas por severidade
    const headers = data.headers;
    const headerRow = new D.TableRow({
        tableHeader: true,
        children: headers.map(
            (h: any) =>
                new D.TableCell({
                    children: [
                        new D.Paragraph({
                            children: [new D.TextRun({ text: String(h), bold: true, color: 'FFFFFF', size: 18 })],
                            alignment: D.AlignmentType.LEFT,
                        }),
                    ],
                    shading: { fill: '2D3748' },
                    margins: { top: 40, bottom: 40, left: 80, right: 80 },
                }),
        ),
    });
    const maxRows = Math.min(data.rows.length, 60);
    const dataRows = data.rows.slice(0, maxRows).map((row: any, ri: number) => {
        const cells = [
            // Coluna 0: nome do elemento
            new D.TableCell({
                children: [
                    new D.Paragraph({
                        children: [new D.TextRun({ text: row.element, size: 18 })],
                    }),
                ],
                shading: ri % 2 === 0 ? { fill: 'F5F7FA' } : undefined,
                margins: { top: 30, bottom: 30, left: 80, right: 80 },
            }),
            // Colunas 1+: valores com cor por severidade
            ...row.cells.map((cell: any) => {
                let textColor = '000000';
                let text = '\u2014';
                if (cell.value != null) {
                    const valStr = typeof cell.value === 'number' ? cell.value.toFixed(2) : String(cell.value);
                    text =
                        cell.uncertainty != null
                            ? `${valStr} \u00B1 ${cell.uncertainty}${cell.uncertaintyType === 'relative' ? '%' : ''}`
                            : valStr;
                    if (cell.severity === 'intervention') textColor = 'DC2626';
                    else if (cell.severity === 'prevention') textColor = 'B48200';
                    else if (cell.severity === 'reference') textColor = '2563EB';
                    else if (cell.severity?.endsWith('_uncertain')) textColor = 'EA580C';
                }
                return new D.TableCell({
                    children: [
                        new D.Paragraph({
                            children: [new D.TextRun({ text, color: textColor, size: 18 })],
                        }),
                    ],
                    shading: ri % 2 === 0 ? { fill: 'F5F7FA' } : undefined,
                    margins: { top: 30, bottom: 30, left: 80, right: 80 },
                });
            }),
        ];
        return new D.TableRow({ children: cells });
    });
    const tableChildren = [headerRow, ...dataRows];
    if (data.rows.length > maxRows) {
        tableChildren.push(
            new D.TableRow({
                children: [
                    new D.TableCell({
                        children: [
                            new D.Paragraph({
                                children: [
                                    new D.TextRun({
                                        text: `+${data.rows.length - maxRows} more elements`,
                                        italics: true,
                                        color: '888888',
                                        size: 16,
                                    }),
                                ],
                            }),
                        ],
                        columnSpan: headers.length,
                    }),
                ],
            }),
        );
    }
    children.push(
        new D.Table({
            rows: tableChildren,
            width: { size: 100, type: D.WidthType.PERCENTAGE },
        }),
    );
    return children;
}
/**
 * @private
 * @param {string} str
 * @returns {string}
 */
function _sanitizeFilename(str: string) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}
//# sourceMappingURL=docxExport.js.map
