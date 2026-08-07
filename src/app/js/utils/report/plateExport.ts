// @ts-check
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
   PLATE PDF EXPORT — Technical Drawing Plate (Prancha Tecnica)
   Gera PDF A4 paisagem no formato de prancha tecnica de engenharia

   Captura a cena 3D atual e monta uma prancha com:
   - Imagem principal do modelo 3D
   - Placeholder para planta baixa
   - Rosa dos ventos e metadados de coordenadas
   - Legenda das familias de elementos presentes
   - Carimbo com titulo, responsavel tecnico e data
   ================================================================ */

import { getRenderer, getScene, getCamera } from '../scene/setup.js';
import { countByFamily } from '../../core/elements/manager.js';
import { getAllFamilies, getFamilyName } from '../../core/elements/families.js';
import { t } from '../i18n/translations.js';
import { loadScriptCDN } from '../helpers/cdnLoader.js';

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

/** Cores CSS hex para cada familia — baseado nos mapas de aerial.js e kml.js */
const FAMILY_COLORS = {
    plume: '#FF7043',
    well: '#8e44ad',
    lake: '#3498db',
    river: '#2980b9',
    spring: '#27ae60',
    building: '#e74c3c',
    tank: '#e67e22',
    marker: '#95a5a6',
    boundary: '#78909C',
    stratum: '#8D6E63',
    habitat: '#27ae60',
    emission_source: '#A1887F',
    effluent_point: '#90CAF9',
    sample: '#AB47BC',
    area: '#81C784',
    individual: '#CE93D8',
    incident: '#FF8A65',
    waste: '#EF5350',
    waste_stream: '#80CBC4',
    sensor: '#00BCD4',
    default: '#90A4AE',
};

// ----------------------------------------------------------------
// JSPDF CDN LOADER
// ----------------------------------------------------------------

/** @private */
function _loadJsPDF() {
    return loadScriptCDN(JSPDF_CDN, { name: 'jsPDF', globalVar: 'jspdf' });
}

// ----------------------------------------------------------------
// DATA COLLECTORS
// ----------------------------------------------------------------

/**
 * Captura a cena 3D atual como data URL PNG.
 * Nao altera posicao da camera - captura exatamente o que o usuario ve.
 * @returns {string|null}
 * @private
 */
function _captureCurrentScene(): string|null {
    const renderer = getRenderer();
    const scene3d = getScene();
    const camera = getCamera();
    if (!renderer || !scene3d || !camera) return null;

    renderer.render(scene3d, camera);
    return renderer.domElement.toDataURL('image/png');
}

/**
 * Coleta metadados do projeto a partir dos inputs do DOM.
 * @returns {Object}
 * @private
 */
function _collectMetadata(): Record<string, any> {
    const val = (/** @type {string} */ id: any, fallback = '') =>
        (document.getElementById(id) as any)?.value?.trim() || fallback;

    return {
        projectName: val('project-name', t('plateDefaultProject')),
        projectDescription: val('project-description'),
        author: val('project-author'),
        responsibleTech: val('project-responsible-tech'),
        responsibleLegal: val('project-responsible-legal'),
        coordSystem: val('coord-system', 'UTM'),
        utmZone: val('utm-zone', '23'),
        utmHemisphere: val('utm-hemisphere', 'S'),
        date: new Date().toISOString().slice(0, 10),
        dateFormatted: new Date().toLocaleDateString(),
    };
}

/**
 * Gera entradas da legenda - familias presentes no modelo com cores e contagem.
 * @returns {Array<{id: string, name: string, color: string, count: number}>}
 * @private
 */
function _getLegendEntries(): Array<{id: string, name: string, color: string, count: number}> {
    const counts = countByFamily();
    const allFamilies = (getAllFamilies() as Record<string, any>);
    const entries: Array<{id: string, name: string, color: string, count: number}> = [];

    for (const [familyId, count] of Object.entries(counts)) {
        if (count === 0) continue;
        const family = allFamilies[familyId];
        const name = family ? getFamilyName(family) : familyId;
        const color = (FAMILY_COLORS as Record<string, string>)[familyId] || FAMILY_COLORS.default;
        entries.push({ id: familyId, name: name as string, color, count: count as number });
    }

    entries.sort((a: any, b: any) => a.name.localeCompare(b.name));
    return entries;
}

// ----------------------------------------------------------------
// DRAWING HELPERS
// ----------------------------------------------------------------

/**
 * Converte hex CSS (#rrggbb) para {r, g, b}.
 * @private
 */
function _hexToRgb(/** @type {string} */ hex: any) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) } : { r: 144, g: 164, b: 174 };
}

/**
 * Borda dupla tecnica.
 * @private
 */
function _drawBorder(/** @type {any} */ doc: any) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8);
    doc.rect(5, 5, 287, 200);

    doc.setLineWidth(0.3);
    doc.rect(7, 7, 283, 196);
}

/**
 * Rasteriza um SVG (string) em PNG data URL via canvas offscreen (browser).
 * @private
 */
function _svgToPngDataUrl(svg: string, pxW: number, pxH: number): Promise<string | null> {
    return new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(pxW));
                    canvas.height = Math.max(1, Math.round(pxH));
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(null);
                        return;
                    }
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/png'));
                } catch {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
        } catch {
            resolve(null);
        }
    });
}

/**
 * Planta baixa real: plano do raio de 500 m (GAC) gerado a partir do modelo. Cai para o
 * placeholder se não houver elementos georreferenciados ou se a rasterização falhar.
 * @private
 */
async function _drawPlantaBaixa(/** @type {any} */ doc: any, x: number, y: number, w: number, h: number) {
    let elements: any[] = [];
    try {
        const { getAllElements }: any = await import('../../core/elements/manager.js' as string);
        elements = getAllElements?.() || [];
    } catch (e: any) {
        console.debug('[plate:plantaBaixa:elements]', e?.message || e);
    }
    try {
        const { buildRadiusPlanSvg }: any = await import('./_radiusPlanRenderer.js' as string);
        const svg = buildRadiusPlanSvg(elements, { radiusM: 500, size: 480 });
        const side = Math.min(w, h);
        const png = await _svgToPngDataUrl(svg, side * 4, side * 4);
        if (png) {
            const ix = x + (w - side) / 2;
            doc.setDrawColor(120, 120, 120);
            doc.setLineWidth(0.3);
            doc.rect(ix, y, side, side);
            doc.addImage(png, 'PNG', ix, y, side, side);
            doc.setFontSize(7);
            doc.setTextColor(80, 80, 80);
            doc.text(t('plateFloorPlanReal') || 'Planta — entorno 500 m (GAC)', x + w / 2, y + h + 3, { align: 'center' });
            doc.setTextColor(0, 0, 0);
            return;
        }
    } catch (e: any) {
        console.debug('[plate:plantaBaixa:render]', e?.message || e);
    }
    _drawPlantaBaixaPlaceholder(doc);
}

/**
 * Placeholder da planta baixa - retangulo tracejado com label.
 * @private
 */
function _drawPlantaBaixaPlaceholder(/** @type {any} */ doc: any) {
    const x = 204,
        y = 8,
        w = 85,
        h = 68;

    // Borda tracejada
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0);
    doc.rect(x, y, w, h);
    doc.setLineDashPattern([], 0);

    // Label centralizado
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text(t('plateFloorPlan'), x + w / 2, y + h / 2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
}

/**
 * Rosa dos ventos com circulo, eixos e seta N.
 * @private
 */
function _drawCompassRose(
    /** @type {any} */ doc: any,
    /** @type {number} */ cx: any,
    /** @type {number} */ cy: any,
    /** @type {number} */ radius: any,
) {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.4);

    // Circulo
    doc.circle(cx, cy, radius);

    // Eixos N-S e E-W
    doc.line(cx, cy - radius + 1, cx, cy + radius - 1);
    doc.line(cx - radius + 1, cy, cx + radius - 1, cy);

    // Seta N (triangulo preenchido)
    doc.setFillColor(0, 0, 0);
    doc.triangle(cx, cy - radius + 2, cx - 2, cy - radius + 7, cx + 2, cy - radius + 7, 'F');

    // Labels cardeais
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('N', cx, cy - radius - 1, { align: 'center' });
    doc.text('S', cx, cy + radius + 3, { align: 'center' });
    doc.text('E', cx + radius + 2, cy + 1, { align: 'center' });
    doc.text('W', cx - radius - 2, cy + 1, { align: 'center' });
}

/**
 * Bloco de metadados de coordenadas (abaixo da rosa dos ventos).
 * @private
 */
function _drawMetadataBlock(/** @type {any} */ doc: any, /** @type {any} */ meta: any) {
    const x = 204,
        y = 78,
        w = 85,
        h = 42;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);

    // Rosa dos ventos centralizada na metade superior
    _drawCompassRose(doc, x + w / 2, y + 14, 10);

    // Metadados de coordenadas na metade inferior
    const textY = y + 30;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);

    doc.text(`${t('coordinateSystem') || 'Coord. System'}: ${meta.coordSystem}`, x + 4, textY);
    doc.text(`${meta.coordSystem === 'UTM' ? 'Zone' : 'Zone'}: ${meta.utmZone}${meta.utmHemisphere}`, x + 4, textY + 4);
    doc.text('Datum: SIRGAS 2000', x + 4, textY + 8);

    doc.setTextColor(0, 0, 0);
}

/**
 * Legenda com swatches coloridos das familias presentes no modelo.
 * @private
 */
function _drawLegend(/** @type {any} */ doc: any, /** @type {any[]} */ entries: any) {
    const x = 204,
        y = 122,
        w = 85,
        h = 50;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);

    // Titulo
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(t('plateLegend'), x + 3, y + 5);

    if (entries.length === 0) {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(150, 150, 150);
        doc.text(t('plateNoElements') || 'No elements', x + 3, y + 14);
        doc.setTextColor(0, 0, 0);
        return;
    }

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    const maxEntries = Math.min(entries.length, 10);
    const lineH = 4;

    for (let i = 0; i < maxEntries; i++) {
        const ey = y + 10 + i * lineH;
        const entry = entries[i];

        // Swatch colorido
        const rgb = _hexToRgb(entry.color);
        doc.setFillColor(rgb.r, rgb.g, rgb.b);
        doc.rect(x + 3, ey - 2.5, 4, 3, 'F');

        // Nome + contagem
        doc.setTextColor(0, 0, 0);
        doc.text(`${entry.name} (${entry.count})`, x + 9, ey);
    }

    if (entries.length > maxEntries) {
        const ey = y + 10 + maxEntries * lineH;
        doc.setTextColor(120, 120, 120);
        doc.text(`+ ${entries.length - maxEntries} ${t('plateMore')}`, x + 3, ey);
        doc.setTextColor(0, 0, 0);
    }
}

/**
 * Rodape / carimbo com titulo, responsavel, data e branding.
 * @private
 */
function _drawFooter(/** @type {any} */ doc: any, /** @type {any} */ meta: any) {
    const x = 8,
        y = 174,
        w = 281,
        h = 28;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(x, y, w, h);

    // Divisor vertical - separa titulo da grade de info
    const divX = 170;
    doc.line(divX, y, divX, y + h);

    // --- Lado esquerdo: Titulo do projeto ---
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text(meta.projectName, x + 4, y + 10);

    if (meta.projectDescription) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const descLines = doc.splitTextToSize(meta.projectDescription, 155);
        doc.text(descLines.slice(0, 2), x + 4, y + 16);
    }

    // Branding
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text('ecbyts \u2014 Environmental Digital Twin', x + 4, y + 25);
    doc.setTextColor(0, 0, 0);

    // --- Lado direito: grade 2x2 com metadados ---
    const infoX = divX + 2;
    const cellW = (x + w - divX - 2) / 2;
    const cellH = h / 2;

    // Linhas da grade
    doc.line(infoX + cellW, y, infoX + cellW, y + h);
    doc.line(divX, y + cellH, x + w, y + cellH);

    // Celula top-left: Responsavel tecnico
    _drawInfoCell(doc, infoX, y, t('technicalResponsible') || 'Resp. T\u00e9cnico', meta.responsibleTech || '\u2014');

    // Celula top-right: Data
    _drawInfoCell(doc, infoX + cellW, y, t('plateDate'), meta.dateFormatted);

    // Celula bottom-left: Autor
    _drawInfoCell(doc, infoX, y + cellH, t('author') || 'Author', meta.author || '\u2014');

    // Celula bottom-right: Sistema de coordenadas
    _drawInfoCell(
        doc,
        infoX + cellW,
        y + cellH,
        t('coordinateSystem') || 'Coord.',
        `${meta.coordSystem} ${meta.utmZone}${meta.utmHemisphere}`,
    );
}

/**
 * Desenha uma celula de info no carimbo (label pequeno + valor).
 * @private
 */
function _drawInfoCell(
    /** @type {any} */ doc: any,
    /** @type {number} */ x: any,
    /** @type {number} */ y: any,
    /** @type {string} */ label: any,
    /** @type {string} */ value: any,
) {
    doc.setFontSize(6);
    doc.setTextColor(120, 120, 120);
    doc.text(label, x + 2, y + 4);

    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(value, x + 2, y + 10);
}

/**
 * Sanitiza string para nome de arquivo.
 * @private
 */
function _sanitizeFilename(/** @type {string} */ str: any) {
    return str.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
}

// ----------------------------------------------------------------
// MAIN EXPORT
// ----------------------------------------------------------------

/**
 * Gera prancha tecnica PDF (A4 Paisagem) da cena atual.
 * Captura o canvas 3D, monta layout de engenharia e baixa o PDF.
 */
export async function exportPlatePDF() {
    // 1. Carrega jsPDF
    await _loadJsPDF();
    const { jsPDF } = ((window as any).jspdf as { jsPDF: new (opts?: unknown) => any });

    // 2. Documento A4 paisagem
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // 3. Metadados
    const meta = (_collectMetadata() as any);

    // 4. Captura da cena 3D
    const sceneImg = _captureCurrentScene();

    // 5. Borda tecnica dupla
    _drawBorder(doc);

    // 6. Imagem principal (preserva aspect ratio)
    if (sceneImg) {
        doc.addImage(sceneImg, 'PNG', 8, 8, 194, 164);
    }

    // 7. Coluna direita — planta baixa real (plano do raio de 500 m do GAC)
    await _drawPlantaBaixa(doc, 204, 8, 85, 68);
    _drawMetadataBlock(doc, meta);

    // 8. Legenda
    const legendEntries = _getLegendEntries();
    _drawLegend(doc, legendEntries);

    // 9. Rodape / carimbo
    _drawFooter(doc, meta);

    // 10. Download
    const filename = `plate-${_sanitizeFilename(meta.projectName)}-${meta.date}.pdf`;
    doc.save(filename);
}
