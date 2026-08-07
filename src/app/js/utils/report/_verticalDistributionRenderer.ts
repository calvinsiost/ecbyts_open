// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) de DISTRIBUIÇÃO VERTICAL 3D / ISOCONCENTRAÇÃO — espelha as
// Figuras F22-F33 da gap analysis CETESB DD 038/2017 (IC §2.1.m: distribuição
// tridimensional dos contaminantes). Recebe amostras 3D (x,y,z,v) de uma grade voxel
// e produz 3 sub-vistas lado-a-lado: PLANTA (x×z), CORTE N-S (z×y), CORTE L-W (x×y),
// com gradiente de concentração + threshold overlay opcional. Sem DOM/canvas — cheap-testável.
import { svgToDataUrl } from './_radiusPlanRenderer.js';

/** Amostra 3D do grid voxel — uma medida em (x, y, z) com concentração v. */
export interface VoxelSample {
    /** Coordenada horizontal X (m). */
    x: number;
    /** Coordenada vertical Y / cota (m) — Y é vertical. */
    y: number;
    /** Coordenada horizontal Z (m). */
    z: number;
    /** Concentração na unidade do parâmetro. */
    v: number;
}

export interface VerticalDistributionPalette {
    low: string;
    mid: string;
    high: string;
}

export interface VerticalDistributionThreshold {
    label: string;
    value: number;
    severity?: 'vp' | 'vi' | 'cma' | 'custom';
    color?: string;
}

export interface VerticalDistributionOpts {
    title?: string;
    parameterId?: string;
    unit?: string;
    /** Largura total do SVG (px). Default 720 (3 views lado-a-lado). */
    width?: number;
    /** Threshold(s) para destacar amostras que excedem (VI/VP/CMA). */
    thresholds?: VerticalDistributionThreshold[];
    /** Cores do gradiente low → mid → high (default azul → amarelo → vermelho). */
    palette?: VerticalDistributionPalette;
    /** Metadados cartográficos opcionais para o rodapé. */
    centerLabel?: { source?: string; datum?: string };
}

const DEFAULT_PALETTE: VerticalDistributionPalette = {
    low: '#3b82f6',
    mid: '#fbbf24',
    high: '#c0392b',
};

const SEVERITY_COLORS: Record<string, string> = {
    vp: '#f1c40f',
    vi: '#c0392b',
    cma: '#e67e22',
    custom: '#7f8c8d',
};

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Escolhe valor "redondo" para tick (ex.: 10, 25, 50, 100, 200). */
function _niceTick(rangeM: number, targetCount: number = 5): number {
    if (!Number.isFinite(rangeM) || rangeM <= 0) return 1;
    const target = rangeM / targetCount;
    const candidates = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
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

/** Parseia "#RRGGBB" → {r,g,b}. Default cinza em caso de erro. */
function _hexToRgb(hex: string): { r: number; g: number; b: number } {
    const m = /^#([0-9a-fA-F]{6})$/.exec(String(hex || ''));
    if (!m) return { r: 128, g: 128, b: 128 };
    const v = parseInt(m[1] as string, 16);
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

/** Interpola linearmente entre 2 cores hex e retorna `rgb(r,g,b)`. */
function _lerpColor(c1: string, c2: string, t: number): string {
    const tt = Math.max(0, Math.min(1, t));
    const a = _hexToRgb(c1);
    const b = _hexToRgb(c2);
    const r = Math.round(a.r + (b.r - a.r) * tt);
    const g = Math.round(a.g + (b.g - a.g) * tt);
    const bb = Math.round(a.b + (b.b - a.b) * tt);
    return `rgb(${r},${g},${bb})`;
}

/** Mapeia v ∈ [vMin, vMax] → cor através de palette low→mid→high. */
function _valueToColor(v: number, vMin: number, vMax: number, palette: VerticalDistributionPalette): string {
    if (!Number.isFinite(v) || vMax <= vMin) return _lerpColor(palette.low, palette.mid, 0);
    const t = (v - vMin) / (vMax - vMin);
    if (t < 0.5) return _lerpColor(palette.low, palette.mid, t * 2);
    return _lerpColor(palette.mid, palette.high, (t - 0.5) * 2);
}

/** Filtra amostras inválidas (NaN/Infinity em qualquer campo). */
function _cleanSamples(samples: VoxelSample[]): VoxelSample[] {
    return (Array.isArray(samples) ? samples : []).filter(
        (s) =>
            s &&
            typeof s.x === 'number' &&
            typeof s.y === 'number' &&
            typeof s.z === 'number' &&
            typeof s.v === 'number' &&
            Number.isFinite(s.x) &&
            Number.isFinite(s.y) &&
            Number.isFinite(s.z) &&
            Number.isFinite(s.v),
    );
}

/** Bounding box agregado de todas as dimensões. */
function _bbox(samples: VoxelSample[]): {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    zMin: number;
    zMax: number;
    vMin: number;
    vMax: number;
} {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const s of samples) {
        if (s.x < xMin) xMin = s.x;
        if (s.x > xMax) xMax = s.x;
        if (s.y < yMin) yMin = s.y;
        if (s.y > yMax) yMax = s.y;
        if (s.z < zMin) zMin = s.z;
        if (s.z > zMax) zMax = s.z;
        if (s.v < vMin) vMin = s.v;
        if (s.v > vMax) vMax = s.v;
    }
    return { xMin, xMax, yMin, yMax, zMin, zMax, vMin, vMax };
}

/** Threshold de maior severity (vi > cma > vp > custom). */
function _topThreshold(thresholds: VerticalDistributionThreshold[] | undefined): VerticalDistributionThreshold | null {
    if (!Array.isArray(thresholds) || !thresholds.length) return null;
    const sevRank: Record<string, number> = { vi: 4, cma: 3, vp: 2, custom: 1 };
    let best: VerticalDistributionThreshold | null = null;
    let bestRank = -1;
    for (const t of thresholds) {
        const r = sevRank[t.severity || 'custom'] ?? 0;
        if (r > bestRank) {
            best = t;
            bestRank = r;
        }
    }
    return best;
}

interface SubViewLayout {
    title: string;
    xLabel: string;
    yLabel: string;
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
    /** Mapeamento sample → (xVal, yVal) na sub-vista. */
    project: (s: VoxelSample) => { xVal: number; yVal: number };
    /** Inverte Y? Em cortes verticais, Y maior = mais ALTO (cima do gráfico). */
    invertY: boolean;
}

function _renderSubView(
    samples: VoxelSample[],
    layout: SubViewLayout,
    plotX0: number,
    plotY0: number,
    plotW: number,
    plotH: number,
    vMin: number,
    vMax: number,
    palette: VerticalDistributionPalette,
    topThreshold: VerticalDistributionThreshold | null,
): string {
    const xSpan = layout.xMax - layout.xMin || 1;
    const ySpan = layout.yMax - layout.yMin || 1;
    const mapX = (val: number) => plotX0 + ((val - layout.xMin) / xSpan) * plotW;
    const mapY = (val: number) => {
        if (layout.invertY) {
            // Y maior = mais ALTO (topo do gráfico)
            return plotY0 + plotH - ((val - layout.yMin) / ySpan) * plotH;
        }
        // Y maior = mais BAIXO (PLANTA convencional, norte para baixo)
        return plotY0 + ((val - layout.yMin) / ySpan) * plotH;
    };

    const parts: string[] = [];
    // Fundo do plot
    parts.push(
        `<rect x="${plotX0.toFixed(1)}" y="${plotY0.toFixed(1)}" width="${plotW.toFixed(1)}" height="${plotH.toFixed(1)}" fill="#ffffff" stroke="#888" stroke-width="0.6"/>`,
    );
    // Título da sub-vista
    parts.push(
        `<text x="${(plotX0 + plotW / 2).toFixed(1)}" y="${(plotY0 - 6).toFixed(1)}" text-anchor="middle" font-size="10" fill="#222" font-weight="bold">${_esc(layout.title)}</text>`,
    );

    // Pontos
    for (const s of samples) {
        const { xVal, yVal } = layout.project(s);
        const px = mapX(xVal);
        const py = mapY(yVal);
        const color = _valueToColor(s.v, vMin, vMax, palette);
        const exceeds = topThreshold && s.v >= topThreshold.value;
        const strokeColor = exceeds ? '#000000' : '#ffffff';
        const strokeWidth = exceeds ? '1.5' : '0.5';
        parts.push(
            `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`,
        );
    }

    // Eixo X (bottom)
    const xTick = _niceTick(xSpan, 4);
    const xStart = Math.ceil(layout.xMin / xTick) * xTick;
    for (let v = xStart; v <= layout.xMax + 0.001; v += xTick) {
        const tx = mapX(v);
        parts.push(
            `<line x1="${tx.toFixed(1)}" y1="${(plotY0 + plotH).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(plotY0 + plotH + 3).toFixed(1)}" stroke="#222" stroke-width="0.5"/>`,
        );
        parts.push(
            `<text x="${tx.toFixed(1)}" y="${(plotY0 + plotH + 13).toFixed(1)}" text-anchor="middle" font-size="8" fill="#222">${Math.round(v)}</text>`,
        );
    }
    parts.push(
        `<text x="${(plotX0 + plotW / 2).toFixed(1)}" y="${(plotY0 + plotH + 26).toFixed(1)}" text-anchor="middle" font-size="9" fill="#444">${_esc(layout.xLabel)}</text>`,
    );

    // Eixo Y (left)
    const yTick = _niceTick(ySpan, 4);
    const yStart = Math.ceil(layout.yMin / yTick) * yTick;
    for (let v = yStart; v <= layout.yMax + 0.001; v += yTick) {
        const ty = mapY(v);
        parts.push(
            `<line x1="${(plotX0 - 3).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${plotX0.toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#222" stroke-width="0.5"/>`,
        );
        parts.push(
            `<text x="${(plotX0 - 5).toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="8" fill="#222">${Math.round(v)}</text>`,
        );
    }
    // Rótulo Y rotacionado
    const yLabelX = plotX0 - 30;
    const yLabelY = plotY0 + plotH / 2;
    parts.push(
        `<text x="${yLabelX.toFixed(1)}" y="${yLabelY.toFixed(1)}" text-anchor="middle" font-size="9" fill="#444" transform="rotate(-90 ${yLabelX.toFixed(1)},${yLabelY.toFixed(1)})">${_esc(layout.yLabel)}</text>`,
    );

    return parts.join('');
}

/** Pure: SVG string da distribuição vertical 3D (planta + 2 cortes verticais). */
export function buildVerticalDistributionSvg(samples: VoxelSample[], opts: VerticalDistributionOpts = {}): string {
    const W = typeof opts.width === 'number' && opts.width >= 360 ? Math.floor(opts.width) : 720;
    const cleaned = _cleanSamples(samples);
    const palette: VerticalDistributionPalette = opts.palette || DEFAULT_PALETTE;

    if (cleaned.length < 4) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="120" viewBox="0 0 ${W} 120" font-family="sans-serif">` +
            `<rect width="${W}" height="120" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="65" text-anchor="middle" font-size="13" fill="#555">Mínimo 4 amostras para distribuição vertical</text></svg>`
        );
    }

    const bb = _bbox(cleaned);
    const topTh = _topThreshold(opts.thresholds);

    // Layout: 3 sub-vistas lado-a-lado dentro da área plot principal.
    const padL = 50;
    const padR = 10;
    const padTop = 50;
    const padBottom = 50;
    const interSpace = 20; // espaçamento entre sub-vistas
    const totalInner = W - padL - padR - 2 * interSpace - 2 * padL; // descontando padL de cada subvista (eixo Y)
    const subPlotW = Math.max(120, Math.floor(totalInner / 3));
    const subPlotH = 220;

    // Posições X (eixo Y vem antes de plotX0 → padL de cada sub-vista)
    const subStarts: number[] = [];
    let cursorX = padL;
    for (let i = 0; i < 3; i++) {
        subStarts.push(cursorX);
        cursorX += subPlotW + interSpace + padL;
    }
    const subPlotY = padTop;

    // PLANTA: X horizontal, Z vertical (eixo Z=norte para baixo, invertY=false)
    const plantaLayout: SubViewLayout = {
        title: 'PLANTA',
        xLabel: 'Δx (m)',
        yLabel: 'Δz (m)',
        xMin: bb.xMin,
        xMax: bb.xMax,
        yMin: bb.zMin,
        yMax: bb.zMax,
        project: (s) => ({ xVal: s.x, yVal: s.z }),
        invertY: false,
    };
    // CORTE N-S: Z horizontal, Y vertical (Y maior = cota maior = topo)
    const corteNSLayout: SubViewLayout = {
        title: 'CORTE N-S',
        xLabel: 'Δz (m)',
        yLabel: 'Y cota (m)',
        xMin: bb.zMin,
        xMax: bb.zMax,
        yMin: bb.yMin,
        yMax: bb.yMax,
        project: (s) => ({ xVal: s.z, yVal: s.y }),
        invertY: true,
    };
    // CORTE L-W: X horizontal, Y vertical
    const corteLWLayout: SubViewLayout = {
        title: 'CORTE L-W',
        xLabel: 'Δx (m)',
        yLabel: 'Y cota (m)',
        xMin: bb.xMin,
        xMax: bb.xMax,
        yMin: bb.yMin,
        yMax: bb.yMax,
        project: (s) => ({ xVal: s.x, yVal: s.y }),
        invertY: true,
    };

    const subViews =
        _renderSubView(cleaned, plantaLayout, subStarts[0] as number, subPlotY, subPlotW, subPlotH, bb.vMin, bb.vMax, palette, topTh) +
        _renderSubView(cleaned, corteNSLayout, subStarts[1] as number, subPlotY, subPlotW, subPlotH, bb.vMin, bb.vMax, palette, topTh) +
        _renderSubView(cleaned, corteLWLayout, subStarts[2] as number, subPlotY, subPlotW, subPlotH, bb.vMin, bb.vMax, palette, topTh);

    // Legenda gradiente abaixo das sub-vistas
    const legendY = subPlotY + subPlotH + padBottom;
    const legendH = 16;
    const legendX0 = padL;
    const legendX1 = W - padR - 80; // reserva espaço p/ ticks à direita
    const legendW = legendX1 - legendX0;
    const gradientId = 'vd-gradient';
    const palLow = _esc(palette.low);
    const palMid = _esc(palette.mid);
    const palHigh = _esc(palette.high);
    const defs =
        `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="${palLow}"/>` +
        `<stop offset="50%" stop-color="${palMid}"/>` +
        `<stop offset="100%" stop-color="${palHigh}"/>` +
        `</linearGradient></defs>`;
    const legendBar =
        `<rect x="${legendX0}" y="${legendY}" width="${legendW}" height="${legendH}" fill="url(#${gradientId})" stroke="#222" stroke-width="0.5"/>`;
    // Ticks do gradiente — 5 valores (min, 25%, 50%, 75%, max)
    const vSpan = bb.vMax - bb.vMin;
    const fmtV = (v: number): string => {
        if (Math.abs(v) >= 100) return v.toFixed(0);
        if (Math.abs(v) >= 1) return v.toFixed(2);
        return v.toFixed(3);
    };
    const gradTicks: string[] = [];
    for (let i = 0; i <= 4; i++) {
        const tx = legendX0 + (legendW * i) / 4;
        const tv = bb.vMin + (vSpan * i) / 4;
        gradTicks.push(
            `<line x1="${tx.toFixed(1)}" y1="${(legendY + legendH).toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(legendY + legendH + 3).toFixed(1)}" stroke="#222" stroke-width="0.5"/>`,
        );
        gradTicks.push(
            `<text x="${tx.toFixed(1)}" y="${(legendY + legendH + 12).toFixed(1)}" text-anchor="middle" font-size="8" fill="#222">${fmtV(tv)}</text>`,
        );
    }
    const paramLabel = `${_esc(opts.parameterId || 'parâmetro')} (${_esc(opts.unit || '')})`;
    const legendLabel = `<text x="${(legendX1 + 6).toFixed(1)}" y="${(legendY + legendH / 2 + 3).toFixed(1)}" font-size="9" fill="#222">${paramLabel}</text>`;

    // Threshold sidebar (se aplicável) — desenhada ao lado do gradiente
    let thresholdLegend = '';
    if (Array.isArray(opts.thresholds) && opts.thresholds.length > 0) {
        const lines: string[] = [];
        let ty = legendY + legendH + 28;
        for (const t of opts.thresholds) {
            const color = t.color || SEVERITY_COLORS[t.severity || 'custom'] || '#7f8c8d';
            lines.push(
                `<rect x="${legendX0}" y="${ty.toFixed(1)}" width="10" height="10" fill="${_esc(color)}" stroke="#000" stroke-width="0.5"/>` +
                    `<text x="${(legendX0 + 14).toFixed(1)}" y="${(ty + 9).toFixed(1)}" font-size="9" fill="#222">${_esc(t.label)} = ${fmtV(t.value)}</text>`,
            );
            ty += 14;
        }
        thresholdLegend = lines.join('');
    }

    // Altura total
    const baseH = subPlotY + subPlotH + padBottom + legendH + 30;
    const thresholdH = Array.isArray(opts.thresholds) ? opts.thresholds.length * 14 + 10 : 0;
    const FOOTER_H = 50;
    const contentH = baseH + thresholdH;
    const totalH = contentH + FOOTER_H;

    // Rodapé com título + datum + fonte
    const title = _esc(opts.title || 'Distribuição vertical 3D');
    const datum = _esc(opts.centerLabel?.datum || '');
    const source = _esc(opts.centerLabel?.source || '');
    const footer =
        `<rect x="0" y="${contentH}" width="${W}" height="${FOOTER_H}" fill="#ffffff" stroke="#cccccc"/>` +
        `<text x="${W / 2}" y="${contentH + 14}" text-anchor="middle" font-size="11" fill="#222" font-weight="bold">${title}</text>` +
        (datum ? `<text x="${W / 2}" y="${contentH + 28}" text-anchor="middle" font-size="10" fill="#555">${datum}</text>` : '') +
        (source ? `<text x="${W / 2}" y="${contentH + 42}" text-anchor="middle" font-size="9" fill="#888" font-style="italic">${source}</text>` : '');

    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" font-family="sans-serif">` +
        defs +
        `<rect width="${W}" height="${totalH}" fill="#f8fafc"/>` +
        subViews +
        legendBar +
        gradTicks.join('') +
        legendLabel +
        thresholdLegend +
        footer +
        `</svg>`
    );
}

/** Conveniência: SVG → data URL base64. */
export function buildVerticalDistributionDataUrl(
    samples: VoxelSample[],
    opts: VerticalDistributionOpts = {},
): string {
    return svgToDataUrl(buildVerticalDistributionSvg(samples, opts));
}
