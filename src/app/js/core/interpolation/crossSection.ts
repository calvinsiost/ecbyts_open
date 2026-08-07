// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Cross-section Visualization - Cortes geológicos 2D
 *
 * Amostra superfícies interpoladas ao longo de uma linha A-B
 * e renderiza um perfil 2D em SVG.
 */
import { t } from '../../utils/i18n/translations.js';
import { getAllLayers, getLayer } from './manager.js';
import { sampleRamp } from './colorRamps.js';
// @ts-check
/**
 * @typedef {{ minX: number, maxX: number, minZ: number, maxZ: number }} CrossSectionBounds
 * @typedef {{ cols: number, rows: number }} CrossSectionGridSize
 * @typedef {{ id: string, type?: string, visible?: boolean, grid?: ArrayLike<number>, bounds?: CrossSectionBounds, gridSize?: CrossSectionGridSize, fixedColor?: string, name?: string }} CrossSectionLayer
 * @typedef {{ x: number, z: number, distance: number, surfaceElevations: Record<string, number> }} CrossSectionSample
 * @typedef {{ topId: string, bottomId: string, name: string, points: Array<{ x: number, y: number }>, color: string }} CrossSectionPolygon
 */
type CrossSectionSample = { x: number; z: number; distance: number; surfaceElevations: Record<string, number> };
type CrossSectionPolygon = { topId: string; bottomId: string; name: string; points: Array<{ x: number; y: number }>; color: string };
/**
 * Amostra todas as superfícies geológicas ao longo de uma linha.
 * @param {{x:number, z:number}} start - Ponto A
 * @param {{x:number, z:number}} end - Ponto B
 * @param {number} start - Resolução do corte (default: 200)
 * @returns {CrossSectionSample[]}
 */
export function sampleAlongLine(start: any, end: any, numPoints: number = 200): any[] {
    const layers: any[] = (getAllLayers() as any[]).filter((l: any) => l.type === 'geology' && l.visible && l.grid);
    if (layers.length === 0)
        return [];
    /** @type {CrossSectionSample[]} */
    const samples = [];
    const dx = (end.x - start.x) / (numPoints - 1);
    const dz = (end.z - start.z) / (numPoints - 1);
    const totalLength = Math.sqrt((end.x - start.x) ** 2 + (end.z - start.z) ** 2);
    for (let i = 0; i < numPoints; i++) {
        const px = start.x + dx * i;
        const pz = start.z + dz * i;
        const distance = (i / (numPoints - 1)) * totalLength;
        // Amostra cada superfície neste ponto
        const surfaceElevations: Record<string, number> = {};
        for (const layer of layers) {
            if (!layer.grid || !layer.bounds || !layer.gridSize)
                continue;
            const elevation = _sampleGridAt(layer.grid, layer.bounds, layer.gridSize, px, pz);
            if (elevation !== null) {
                surfaceElevations[layer.id] = elevation;
            }
        }
        samples.push({ x: px, z: pz, distance, surfaceElevations });
    }
    return samples;
}
/**
 * Amostra valor de uma grid interpolada em coordenadas mundo.
 * @param {ArrayLike<number>} grid
 * @param {CrossSectionBounds} bounds
 * @param {CrossSectionGridSize} gridSize
 * @param {number} px
 * @param {number} pz
 * @returns {number|null}
 */
function _sampleGridAt(grid: any, bounds: any, gridSize: any, px: number, pz: number): number | null {
    const { cols, rows } = gridSize;
    const width = bounds.maxX - bounds.minX;
    const depth = bounds.maxZ - bounds.minZ;
    // Normaliza para [0,1]
    const nx = (px - bounds.minX) / width;
    const nz = (pz - bounds.minZ) / depth;
    if (nx < 0 || nx > 1 || nz < 0 || nz > 1)
        return null;
    // Converte para índices de grid
    const col = nx * (cols - 1);
    const row = nz * (rows - 1);
    const c0 = Math.floor(col);
    const c1 = Math.min(c0 + 1, cols - 1);
    const r0 = Math.floor(row);
    const r1 = Math.min(r0 + 1, rows - 1);
    const fc = col - c0;
    const fr = row - r0;
    // Bilinear interpolation
    const v00 = grid[r0 * cols + c0];
    const v01 = grid[r0 * cols + c1];
    const v10 = grid[r1 * cols + c0];
    const v11 = grid[r1 * cols + c1];
    const v0 = v00 + (v01 - v00) * fc;
    const v1 = v10 + (v11 - v10) * fc;
    return v0 + (v1 - v0) * fr;
}
/**
 * Gera polígonos de camadas preenchidas para o corte.
 * @param {CrossSectionSample[]} samples
 * @returns {CrossSectionPolygon[]}
 */
export function generateLayerPolygons(samples: CrossSectionSample[]): CrossSectionPolygon[] {
    if (samples.length === 0)
        return [];
    // Pega IDs de todas as superfícies presentes
    const firstSample = samples[0];
    if (!firstSample)
        return [];
    const surfaceIds = Object.keys(firstSample.surfaceElevations);
    if (surfaceIds.length === 0)
        return [];
    // Ordena superfícies por elevação média (mais alta primeiro = topo)
    const avgElevations = surfaceIds
        .map((id: string) => {
        const sum = samples.reduce((acc: number, s: CrossSectionSample) => acc + (s.surfaceElevations[id] || 0), 0);
        return { id, avg: sum / samples.length };
    })
        .sort((a, b) => b.avg - a.avg);
    /** @type {CrossSectionPolygon[]} */
    const polygons = [];
    // Para cada par de superfícies consecutivas, cria um polígono
    for (let i = 0; i < avgElevations.length - 1; i++) {
        const topId = avgElevations[i]!.id;
        const bottomId = avgElevations[i + 1]!.id;
        const layer = /** @type {CrossSectionLayer|null|undefined} */ (getLayer(topId));
        // Pontos do polígono: topo esquerda → topo direita → base direita → base esquerda
        /** @type {Array<{ x: number, y: number }>} */
        const points = [];
        // Topo (esquerda → direita)
        for (const s of samples) {
            const y = s.surfaceElevations[topId];
            if (y !== undefined)
                points.push({ x: s.distance, y });
        }
        // Base (direita → esquerda)
        for (let j = samples.length - 1; j >= 0; j--) {
            const s = samples[j];
            if (!s)
                continue;
            const y = s.surfaceElevations[bottomId];
            if (y !== undefined)
                points.push({ x: s.distance, y });
        }
        if (points.length > 0) {
            // Cor fixa da layer (ABGE) ou fallback para ramp por profundidade
            let colorStr;
            if (layer?.fixedColor) {
                colorStr = layer.fixedColor;
            }
            else {
                const t = i / (avgElevations.length - 1 || 1);
                const c = sampleRamp('geology', t);
                colorStr = `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
            }
            polygons.push({
                topId,
                bottomId,
                name: layer?.name || `Camada ${i + 1}`,
                points,
                color: colorStr,
            });
        }
    }
    return polygons;
}
/**
 * Renderiza um corte geológico em SVG.
 * @param {CrossSectionSample[]} samples - Resultado de sampleAlongLine
 * @param {HTMLElement} container - Elemento onde inserir o SVG
 * @param {{width?: number, height?: number, padding?: number}} options
 */
export function renderCrossSection(samples: CrossSectionSample[], container: HTMLElement, options: { width?: number; height?: number; padding?: number } = {}) {
    const { width = 800, height = 400, padding = 40 } = options;
    // Limpa container
    container.innerHTML = '';
    if (samples.length === 0) {
        container.innerHTML = `<div style="padding:20px;color:#666">${t('crossSection.noSurfaces')}</div>`;
        return;
    }
    // Calcula bounds do corte
    let minY = Infinity, maxY = -Infinity, maxDist = 0;
    for (const s of samples) {
        for (const y of Object.values(s.surfaceElevations) as number[]) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        maxDist = Math.max(maxDist, s.distance);
    }
    // Adiciona margem
    const yRange = maxY - minY || 1;
    minY -= yRange * 0.1;
    maxY += yRange * 0.1;
    // Escala
    const scaleX = (width - 2 * padding) / maxDist;
    const scaleY = (height - 2 * padding) / (maxY - minY);
    // Função de transformação
    const tx = (d: number) => padding + d * scaleX;
    const ty = (y: number) => height - padding - (y - minY) * scaleY;
    // Gera polígonos
    const polygons = generateLayerPolygons(samples);
    // Cria SVG
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.background = '#1a1a2e';
    svg.style.borderRadius = '8px';
    // Definições para gradientes/padrões
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    svg.appendChild(defs);
    // Desenha polígonos das camadas (ordem inversa = do fundo para o topo)
    for (let i = polygons.length - 1; i >= 0; i--) {
        const poly = polygons[i];
        if (!poly)
            continue;
        const pathData = poly.points
            .map((p: any, idx: number) => `${idx === 0 ? 'M' : 'L'} ${tx(p.x).toFixed(1)} ${ty(p.y).toFixed(1)}`)
            .join(' ') + ' Z';
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', poly.color);
        path.setAttribute('stroke', 'rgba(255,255,255,0.2)');
        path.setAttribute('stroke-width', '1');
        path.setAttribute('opacity', '0.85');
        // Tooltip
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = poly.name;
        path.appendChild(title);
        svg.appendChild(path);
    }
    // Desenha linhas das superfícies
    const firstRenderSample = samples[0];
    if (!firstRenderSample)
        return;
    const surfaceIds = Object.keys(firstRenderSample.surfaceElevations);
    for (const id of surfaceIds) {
        const layer = /** @type {CrossSectionLayer|null|undefined} */ (getLayer(id));
        const pathData = samples
            .filter((s: any) => s.surfaceElevations[id] !== undefined)
            .map((s: any, idx: number) => {
            const x = tx(s.distance);
            const y = ty(s.surfaceElevations[id]);
            return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
        })
            .join(' ');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'rgba(255,255,255,0.6)');
        path.setAttribute('stroke-width', '2');
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = layer?.name || t('crossSection.surface');
        path.appendChild(title);
        svg.appendChild(path);
    }
    // Eixos
    // Eixo X
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', String(padding));
    xAxis.setAttribute('y1', String(height - padding));
    xAxis.setAttribute('x2', String(width - padding));
    xAxis.setAttribute('y2', String(height - padding));
    xAxis.setAttribute('stroke', 'rgba(255,255,255,0.4)');
    xAxis.setAttribute('stroke-width', '1');
    svg.appendChild(xAxis);
    // Eixo Y
    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', String(padding));
    yAxis.setAttribute('y1', String(padding));
    yAxis.setAttribute('x2', String(padding));
    yAxis.setAttribute('y2', String(height - padding));
    yAxis.setAttribute('stroke', 'rgba(255,255,255,0.4)');
    yAxis.setAttribute('stroke-width', '1');
    svg.appendChild(yAxis);
    // Labels dos eixos
    const xLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    xLabel.setAttribute('x', String(width / 2));
    xLabel.setAttribute('y', String(height - 10));
    xLabel.setAttribute('text-anchor', 'middle');
    xLabel.setAttribute('fill', 'rgba(255,255,255,0.6)');
    xLabel.setAttribute('font-size', '12');
    xLabel.textContent = t('crossSection.distanceM');
    svg.appendChild(xLabel);
    const yLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yLabel.setAttribute('x', '15');
    yLabel.setAttribute('y', String(height / 2));
    yLabel.setAttribute('text-anchor', 'middle');
    yLabel.setAttribute('fill', 'rgba(255,255,255,0.6)');
    yLabel.setAttribute('font-size', '12');
    yLabel.setAttribute('transform', `rotate(-90, 15, ${height / 2})`);
    yLabel.textContent = t('crossSection.elevationM');
    svg.appendChild(yLabel);
    // Ticks e valores no eixo Y
    const numTicks = 5;
    for (let i = 0; i <= numTicks; i++) {
        const yVal = minY + (maxY - minY) * (i / numTicks);
        const yPos = ty(yVal);
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', String(padding - 5));
        tick.setAttribute('y1', String(yPos));
        tick.setAttribute('x2', String(padding));
        tick.setAttribute('y2', String(yPos));
        tick.setAttribute('stroke', 'rgba(255,255,255,0.3)');
        svg.appendChild(tick);
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(padding - 8));
        text.setAttribute('y', String(yPos + 4));
        text.setAttribute('text-anchor', 'end');
        text.setAttribute('fill', 'rgba(255,255,255,0.5)');
        text.setAttribute('font-size', '10');
        text.textContent = yVal.toFixed(1);
        svg.appendChild(text);
    }
    container.appendChild(svg);
    // Retorna dados para possível exportação
    return { samples, polygons, bounds: { minY, maxY, maxDist } };
}
/**
 * Exporta o corte como PNG.
 * @param {SVGElement} svgElement
 * @param {string} [filename]
 * @returns {Promise<string>}
 */
export async function exportCrossSectionPNG(svgElement: SVGElement, filename = 'corte-geologico.png') {
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    return new Promise((resolve, reject) => {
        img.onload = () => {
            canvas.width = img.width * 2; // High DPI
            canvas.height = img.height * 2;
            if (!ctx) {
                reject(new Error('Canvas 2D context unavailable'));
                return;
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            const pngUrl = canvas.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = filename;
            a.click();
            resolve(pngUrl);
        };
        img.onerror = reject;
        img.src = url;
    });
}
//# sourceMappingURL=crossSection.js.map
//# sourceMappingURL=crossSection.js.map
