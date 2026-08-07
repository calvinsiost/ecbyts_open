// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) de SEÇÃO HIDROGEOLÓGICA / CORTE GEOLÓGICO 2D — espelha as
// Figuras F8-F13 dos relatórios CETESB reais (transecto A-A', B-B', ...). Recebe
// polígonos já calculados por `core/interpolation/crossSection.generateLayerPolygons`
// e produz um SVG estilizado (eixos rotulados em metros, legenda, título). Sem DOM/
// canvas — cheap-testável.
import { svgToDataUrl } from './_radiusPlanRenderer.js';

export type CrossSectionPolygonInput = {
    topId: string;
    bottomId: string;
    name: string;
    /** Pontos em (distance m ao longo do transecto, elevation m). */
    points: { x: number; y: number }[];
    color: string;
};

export type CrossSectionPlanOpts = {
    title?: string;
    /** Largura total do SVG (px). */
    width?: number;
    /** Altura da área de desenho (px); rodapé ocupa +50px abaixo. */
    height?: number;
    padding?: number;
    /** Comprimento total do transecto A-B em metros — usado nos ticks do eixo X. */
    transectLengthM?: number;
    /** Limites verticais explícitos (m). Se ausente, computa do min/max dos polígonos. */
    elevationRange?: { min: number; max: number };
    /** Metadados cartográficos opcionais no rodapé. */
    centerLabel?: { source?: string; datum?: string };
};

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Escolhe valor "redondo" para tick (ex.: 10, 25, 50, 100, 200). */
function _niceTick(rangeM: number, targetCount: number = 6): number {
    const target = rangeM / targetCount;
    const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
    let best = candidates[0] as number;
    let bestDelta = Math.abs(Math.log((candidates[0] as number) / target));
    for (const c of candidates) {
        const d = Math.abs(Math.log(c / target));
        if (d < bestDelta) {
            best = c;
            bestDelta = d;
        }
    }
    return best;
}

function _computeRange(polygons: CrossSectionPolygonInput[]): { min: number; max: number } {
    let min = Infinity;
    let max = -Infinity;
    for (const poly of polygons) {
        for (const p of poly.points) {
            if (Number.isFinite(p.y)) {
                if (p.y < min) min = p.y;
                if (p.y > max) max = p.y;
            }
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
        return { min: 0, max: 100 };
    }
    // Adiciona 5% de margem
    const pad = (max - min) * 0.05;
    return { min: min - pad, max: max + pad };
}

/** Pure: SVG string de uma seção hidrogeológica. */
export function buildCrossSectionSvg(polygons: CrossSectionPolygonInput[], opts: CrossSectionPlanOpts = {}): string {
    const W = typeof opts.width === 'number' && opts.width >= 200 ? Math.floor(opts.width) : 720;
    const H = typeof opts.height === 'number' && opts.height >= 150 ? Math.floor(opts.height) : 360;
    const FOOTER_H = 50;
    const padding = typeof opts.padding === 'number' && opts.padding >= 20 ? opts.padding : 56;
    const polys = Array.isArray(polygons) ? polygons.filter((p) => p && Array.isArray(p.points) && p.points.length >= 3) : [];
    const transectLengthM =
        typeof opts.transectLengthM === 'number' && opts.transectLengthM > 0
            ? opts.transectLengthM
            : polys.length
              ? polys[0]!.points.reduce((m, p) => (p.x > m ? p.x : m), 0)
              : 100;

    if (polys.length === 0) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="120" viewBox="0 0 ${W} 120" font-family="sans-serif">` +
            `<rect width="${W}" height="120" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="65" text-anchor="middle" font-size="13" fill="#555">Sem camadas geológicas visíveis para gerar o corte (carregue um modelo geológico)</text></svg>`
        );
    }

    const range = opts.elevationRange && opts.elevationRange.max > opts.elevationRange.min
        ? opts.elevationRange
        : _computeRange(polys);
    const elevSpan = range.max - range.min;
    const drawX0 = padding;
    const drawX1 = W - padding;
    const drawY0 = padding * 0.6;
    const drawY1 = H - padding;
    const innerW = drawX1 - drawX0;
    const innerH = drawY1 - drawY0;
    const mapX = (distM: number) => drawX0 + (distM / transectLengthM) * innerW;
    const mapY = (elevM: number) => drawY1 - ((elevM - range.min) / elevSpan) * innerH;

    // Polígonos das camadas
    const polyEls = polys
        .map((p) => {
            const pts = p.points
                .map((pt) => `${mapX(pt.x).toFixed(1)},${mapY(pt.y).toFixed(1)}`)
                .join(' ');
            return `<polygon points="${pts}" fill="${_esc(p.color)}" fill-opacity="0.85" stroke="#222" stroke-width="0.4"/>`;
        })
        .join('');

    // Eixo X (distância em m) — ticks a cada nice value
    const xTickM = _niceTick(transectLengthM, 6);
    const xTicks: string[] = [];
    for (let d = 0; d <= transectLengthM + 0.001; d += xTickM) {
        const tx = mapX(d);
        xTicks.push(`<line x1="${tx.toFixed(1)}" y1="${drawY1}" x2="${tx.toFixed(1)}" y2="${(drawY1 + 4).toFixed(1)}" stroke="#222"/>`);
        xTicks.push(`<text x="${tx.toFixed(1)}" y="${(drawY1 + 16).toFixed(1)}" text-anchor="middle" font-size="9" fill="#222">${Math.round(d)}</text>`);
    }
    const xAxis =
        `<line x1="${drawX0}" y1="${drawY1}" x2="${drawX1}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        xTicks.join('') +
        `<text x="${((drawX0 + drawX1) / 2).toFixed(1)}" y="${(drawY1 + 30).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444">Distância (m)</text>`;

    // Eixo Y (elevação em m)
    const yTickM = _niceTick(elevSpan, 5);
    const yTicks: string[] = [];
    const yStart = Math.ceil(range.min / yTickM) * yTickM;
    for (let e = yStart; e <= range.max + 0.001; e += yTickM) {
        const ty = mapY(e);
        yTicks.push(`<line x1="${(drawX0 - 4).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${drawX0}" y2="${ty.toFixed(1)}" stroke="#222"/>`);
        yTicks.push(`<text x="${(drawX0 - 6).toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#222">${Math.round(e)}</text>`);
    }
    const yAxis =
        `<line x1="${drawX0}" y1="${drawY0}" x2="${drawX0}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        yTicks.join('') +
        `<text x="14" y="${((drawY0 + drawY1) / 2).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444" transform="rotate(-90 14,${((drawY0 + drawY1) / 2).toFixed(1)})">Cota (m)</text>`;

    // Legenda das camadas (canto superior direito)
    const legX = drawX1 - 130;
    const legY = drawY0 + 6;
    const legend = polys
        .map((p, i) => {
            const ly = legY + i * 14;
            return (
                `<rect x="${legX}" y="${ly}" width="10" height="10" fill="${_esc(p.color)}" stroke="#222" stroke-width="0.4"/>` +
                `<text x="${legX + 14}" y="${ly + 9}" font-size="9" fill="#222">${_esc(p.name)}</text>`
            );
        })
        .join('');
    const legendBg =
        `<rect x="${legX - 4}" y="${legY - 6}" width="134" height="${polys.length * 14 + 10}" fill="#ffffff" fill-opacity="0.85" stroke="#cccccc" stroke-width="0.5"/>`;

    // Rodapé
    const title = _esc(opts.title || 'Seção Hidrogeológica');
    const datum = _esc(opts.centerLabel?.datum || '');
    const source = _esc(opts.centerLabel?.source || '');
    const footer =
        `<rect x="0" y="${H}" width="${W}" height="${FOOTER_H}" fill="#ffffff" stroke="#cccccc"/>` +
        `<text x="${W / 2}" y="${H + 14}" text-anchor="middle" font-size="11" fill="#222" font-weight="bold">${title}</text>` +
        (datum ? `<text x="${W / 2}" y="${H + 28}" text-anchor="middle" font-size="10" fill="#555">${datum}</text>` : '') +
        (source ? `<text x="${W / 2}" y="${H + 42}" text-anchor="middle" font-size="9" fill="#888" font-style="italic">${source}</text>` : '');

    const totalH = H + FOOTER_H;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" font-family="sans-serif">` +
        `<rect width="${W}" height="${totalH}" fill="#f8fafc"/>` +
        polyEls +
        xAxis +
        yAxis +
        legendBg +
        legend +
        footer +
        `</svg>`
    );
}

/** Conveniência: SVG → data URL base64. Reusa o helper do radius plan. */
export function buildCrossSectionDataUrl(polygons: CrossSectionPolygonInput[], opts: CrossSectionPlanOpts = {}): string {
    return svgToDataUrl(buildCrossSectionSvg(polygons, opts));
}
