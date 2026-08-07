// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) de GRÁFICO DE EVOLUÇÃO TEMPORAL — espelha as Figuras F14-F21
// dos relatórios CETESB reais (concentração de contaminante por poço/nível ao longo
// do tempo vs. limite regulatório). Sem Chart.js, sem DOM/canvas — cheap-testável.
// Reusa svgToDataUrl do radius plan.
import { svgToDataUrl } from './_radiusPlanRenderer.js';

export type TemporalPoint = { t: number | string | Date; v: number };
export type TemporalSeries = {
    label: string;
    color: string;
    points: TemporalPoint[];
};
export type TemporalThreshold = {
    label: string;
    value: number;
    /** 'vp' aviso amarelo | 'vi' intervenção vermelho | 'cma' meta laranja | 'custom' */
    severity?: 'vp' | 'vi' | 'cma' | 'custom';
    color?: string;
};
export type TemporalChartOpts = {
    title?: string;
    /** Unidade plotada no eixo Y (ex.: "µg/L", "mg/L"). */
    unit?: string;
    width?: number;
    height?: number;
    padding?: number;
    /** Escala vertical logarítmica (recomendado para concentrações). */
    logScale?: boolean;
    /** Linhas horizontais de limite regulatório (VP/VI/CMA). */
    thresholds?: TemporalThreshold[];
    /** Metadados cartográficos opcionais para o rodapé. */
    centerLabel?: { source?: string; datum?: string };
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

function _toMs(t: number | string | Date): number {
    if (t instanceof Date) return t.getTime();
    if (typeof t === 'number') return t;
    const parsed = Date.parse(String(t));
    return Number.isFinite(parsed) ? parsed : NaN;
}

function _niceTick(range: number, targetCount: number = 5): number {
    if (!Number.isFinite(range) || range <= 0) return 1;
    const target = range / targetCount;
    const candidates = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
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

function _fmtDate(ms: number): string {
    if (!Number.isFinite(ms)) return '';
    const d = new Date(ms);
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const yy = String(d.getUTCFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
}

/** Pure: SVG da evolução temporal. */
export function buildTemporalChartSvg(series: TemporalSeries[], opts: TemporalChartOpts = {}): string {
    const W = typeof opts.width === 'number' && opts.width >= 200 ? Math.floor(opts.width) : 720;
    const H = typeof opts.height === 'number' && opts.height >= 150 ? Math.floor(opts.height) : 320;
    const FOOTER_H = 50;
    const padding = typeof opts.padding === 'number' && opts.padding >= 20 ? opts.padding : 56;
    const safeSeries = Array.isArray(series)
        ? series
              .map((s) => ({
                  ...s,
                  points: Array.isArray(s?.points)
                      ? s.points
                            .map((p) => ({ ms: _toMs(p.t), v: Number(p.v) }))
                            .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.v))
                      : [],
              }))
              .filter((s) => s.points.length > 0)
        : [];

    if (safeSeries.length === 0) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="120" viewBox="0 0 ${W} 120" font-family="sans-serif">` +
            `<rect width="${W}" height="120" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="65" text-anchor="middle" font-size="13" fill="#555">Sem séries temporais para plotar</text></svg>`
        );
    }

    // Escala
    let tMin = Infinity;
    let tMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const s of safeSeries) {
        for (const p of s.points) {
            if (p.ms < tMin) tMin = p.ms;
            if (p.ms > tMax) tMax = p.ms;
            if (p.v < vMin) vMin = p.v;
            if (p.v > vMax) vMax = p.v;
        }
    }
    for (const th of opts.thresholds || []) {
        if (Number.isFinite(th?.value)) {
            if (th.value < vMin) vMin = th.value;
            if (th.value > vMax) vMax = th.value;
        }
    }
    if (tMin === tMax) tMax = tMin + 86400_000; // +1 dia se single point
    const useLog = opts.logScale && vMin > 0;
    const vPad = (vMax - vMin) * 0.1 || 1;
    const yLow = useLog ? Math.log10(Math.max(vMin / 1.2, 1e-9)) : vMin - vPad;
    const yHigh = useLog ? Math.log10(vMax * 1.2) : vMax + vPad;
    const drawX0 = padding;
    const drawX1 = W - padding * 0.5;
    const drawY0 = padding * 0.6;
    const drawY1 = H - padding;
    const innerW = drawX1 - drawX0;
    const innerH = drawY1 - drawY0;
    const mapX = (ms: number) => drawX0 + ((ms - tMin) / (tMax - tMin)) * innerW;
    const mapY = (v: number) => {
        const y = useLog ? Math.log10(Math.max(v, 1e-9)) : v;
        return drawY1 - ((y - yLow) / (yHigh - yLow)) * innerH;
    };

    // Linhas de threshold (atrás das séries)
    const thrEls = (opts.thresholds || [])
        .filter((th) => Number.isFinite(th?.value))
        .map((th) => {
            const y = mapY(th.value).toFixed(1);
            const color = th.color || SEVERITY_COLORS[th.severity || 'custom'] || '#7f8c8d';
            const lbl = _esc(`${th.label} = ${th.value}`);
            return (
                `<line x1="${drawX0}" y1="${y}" x2="${drawX1}" y2="${y}" stroke="${color}" stroke-width="1.2" stroke-dasharray="5 3"/>` +
                `<text x="${drawX1 - 4}" y="${(Number(y) - 3).toFixed(1)}" text-anchor="end" font-size="9" fill="${color}">${lbl}</text>`
            );
        })
        .join('');

    // Séries (polyline + dots)
    const seriesEls = safeSeries
        .map((s) => {
            const sorted = s.points.slice().sort((a, b) => a.ms - b.ms);
            const pts = sorted.map((p) => `${mapX(p.ms).toFixed(1)},${mapY(p.v).toFixed(1)}`).join(' ');
            const dots = sorted
                .map((p) => `<circle cx="${mapX(p.ms).toFixed(1)}" cy="${mapY(p.v).toFixed(1)}" r="2.5" fill="${_esc(s.color)}"/>`)
                .join('');
            return (
                `<polyline points="${pts}" fill="none" stroke="${_esc(s.color)}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>` +
                dots
            );
        })
        .join('');

    // Eixo X (datas)
    const tRange = tMax - tMin;
    const tStep = _niceTick(tRange / 86400_000, 5) * 86400_000;
    const xTicks: string[] = [];
    for (let m = tMin; m <= tMax + 1; m += tStep) {
        const tx = mapX(m);
        xTicks.push(`<line x1="${tx.toFixed(1)}" y1="${drawY1}" x2="${tx.toFixed(1)}" y2="${(drawY1 + 4).toFixed(1)}" stroke="#222"/>`);
        xTicks.push(`<text x="${tx.toFixed(1)}" y="${(drawY1 + 16).toFixed(1)}" text-anchor="middle" font-size="9" fill="#222">${_fmtDate(m)}</text>`);
    }
    const xAxis =
        `<line x1="${drawX0}" y1="${drawY1}" x2="${drawX1}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        xTicks.join('') +
        `<text x="${((drawX0 + drawX1) / 2).toFixed(1)}" y="${(drawY1 + 30).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444">Data</text>`;

    // Eixo Y
    const yTickV = _niceTick(useLog ? yHigh - yLow : vMax - vMin, 5);
    const yTicks: string[] = [];
    const yStart = useLog ? Math.ceil(yLow) : Math.ceil(vMin / yTickV) * yTickV;
    const yEnd = useLog ? yHigh : vMax;
    for (let v = yStart; v <= yEnd + 0.001; v += yTickV) {
        const realV = useLog ? Math.pow(10, v) : v;
        const ty = mapY(realV);
        yTicks.push(`<line x1="${(drawX0 - 4).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${drawX0}" y2="${ty.toFixed(1)}" stroke="#222"/>`);
        yTicks.push(
            `<text x="${(drawX0 - 6).toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#222">${useLog ? realV.toPrecision(2) : realV.toString()}</text>`,
        );
    }
    const yAxisLabel = _esc(`Concentração${opts.unit ? ` (${opts.unit})` : ''}${useLog ? ' [log]' : ''}`);
    const yAxis =
        `<line x1="${drawX0}" y1="${drawY0}" x2="${drawX0}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        yTicks.join('') +
        `<text x="14" y="${((drawY0 + drawY1) / 2).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444" transform="rotate(-90 14,${((drawY0 + drawY1) / 2).toFixed(1)})">${yAxisLabel}</text>`;

    // Legenda
    const legX = drawX1 - 130;
    const legY = drawY0 + 6;
    const legend = safeSeries
        .map((s, i) => {
            const ly = legY + i * 13;
            return (
                `<rect x="${legX}" y="${ly}" width="10" height="10" fill="${_esc(s.color)}"/>` +
                `<text x="${legX + 14}" y="${ly + 9}" font-size="9" fill="#222">${_esc(s.label)}</text>`
            );
        })
        .join('');
    const legendBg = `<rect x="${legX - 4}" y="${legY - 6}" width="134" height="${safeSeries.length * 13 + 10}" fill="#ffffff" fill-opacity="0.85" stroke="#cccccc" stroke-width="0.5"/>`;

    // Rodapé
    const title = _esc(opts.title || 'Evolução temporal de concentração');
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
        thrEls +
        seriesEls +
        xAxis +
        yAxis +
        legendBg +
        legend +
        footer +
        `</svg>`
    );
}

export function buildTemporalChartDataUrl(series: TemporalSeries[], opts: TemporalChartOpts = {}): string {
    return svgToDataUrl(buildTemporalChartSvg(series, opts));
}
