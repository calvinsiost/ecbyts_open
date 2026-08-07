// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) do layout de planta com classificação fonte-caminho-receptor
// (F2 da gap analysis CETESB DD 038/2017 IC §2.1.i). Mostra fontes primárias/secundárias,
// caminhos potenciais e receptores humanos/ambientais em vista de planta (plano x/z),
// para suportar o Modelo Conceitual da Área (MCA / CSM ASTM E1689). Sem DOM/canvas
// (cheap-testável). Embutível como figura de relatório via data:image/svg+xml.
//
// Classificação de famílias (fonte-caminho-receptor):
// - PRIMARY_SOURCES  = tank, waste_stream                (quadrado vermelho)
// - SECONDARY_SOURCES = emission_source, effluent_point (quadrado laranja)
// - HUMAN_RECEPTORS  = building                          (círculo azul forte)
// - ENV_RECEPTORS    = well, lake, river, spring         (círculo azul claro)
// - PATHS            = route_flow                        (polyline tracejada cinza)
// - CONTEXT          = boundary, blueprint               (polígono cinza claro)

export interface PlantElement {
    id?: string;
    family: string;
    name?: string;
    position?: { x: number; z: number; y?: number };
    data?: {
        position?: { x: number; z: number; y?: number };
        vertices?: Array<{ x: number; z: number }>;
    };
}

export interface SourcePlantLayoutOpts {
    title?: string;
    /** Largura do SVG em px (default 520). Altura escala proporcionalmente ao bbox. */
    width?: number;
    /** Mostra legenda no lado direito (default true). */
    showLegend?: boolean;
    /** Metadados cartográficos para o rodapé. */
    centerLabel?: { source?: string; datum?: string };
}

// ── Classificação por família ──────────────────────────────────────────────
const PRIMARY_SOURCES = new Set(['tank', 'waste_stream']);
const SECONDARY_SOURCES = new Set(['emission_source', 'effluent_point']);
const HUMAN_RECEPTORS = new Set(['building']);
const ENV_RECEPTORS = new Set(['well', 'lake', 'river', 'spring']);
const PATHS = new Set(['route_flow']);
const CONTEXT = new Set(['boundary', 'blueprint']);

type StyleKey = 'primary' | 'secondary' | 'receptorH' | 'receptorE' | 'path' | 'context' | 'unknown';

interface StyleSpec {
    fill: string;
    stroke: string;
    symbol: 'square' | 'circle' | 'line' | 'polygon';
    label: string;
    size: number;
}

const STYLES: Record<StyleKey, StyleSpec> = {
    primary: { fill: '#c0392b', stroke: '#7b241c', symbol: 'square', label: 'Fonte primária', size: 10 },
    secondary: { fill: '#e67e22', stroke: '#a04000', symbol: 'square', label: 'Fonte secundária', size: 8 },
    receptorH: { fill: '#2980b9', stroke: '#1b4f72', symbol: 'circle', label: 'Receptor humano', size: 9 },
    receptorE: { fill: '#3498db', stroke: '#1b4f72', symbol: 'circle', label: 'Receptor ambiental', size: 7 },
    path: { fill: 'none', stroke: '#7f8c8d', symbol: 'line', label: 'Caminho', size: 1 },
    context: { fill: '#ecf0f1', stroke: '#bdc3c7', symbol: 'polygon', label: 'Contexto', size: 0 },
    unknown: { fill: '#bdc3c7', stroke: '#7f8c8d', symbol: 'circle', label: 'Outro', size: 4 },
};

function _classify(family: string): StyleKey {
    if (PRIMARY_SOURCES.has(family)) return 'primary';
    if (SECONDARY_SOURCES.has(family)) return 'secondary';
    if (HUMAN_RECEPTORS.has(family)) return 'receptorH';
    if (ENV_RECEPTORS.has(family)) return 'receptorE';
    if (PATHS.has(family)) return 'path';
    if (CONTEXT.has(family)) return 'context';
    return 'unknown';
}

function _pos(el: PlantElement | any): { x: number; z: number } | null {
    const p = el?.position || el?.data?.position;
    if (!p || typeof p !== 'object') return null;
    if (typeof p.x !== 'number' || typeof p.z !== 'number') return null;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null;
    return { x: p.x, z: p.z };
}

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Escolhe um step "redondo" para ticks dos eixos. */
function _niceStep(range: number, targetCount: number = 5): number {
    if (!Number.isFinite(range) || range <= 0) return 1;
    const target = range / targetCount;
    const candidates = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
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

/**
 * Constrói o SVG (string) do layout de planta. Pure — sem efeitos colaterais.
 * Ordem de renderização: context → paths → env-receptors → human-receptors →
 * secondary-sources → primary-sources (fontes por cima para destaque visual).
 * @param elements elementos do modelo (com position ou data.position)
 */
export function buildSourcePlantLayoutSvg(elements: PlantElement[], opts: SourcePlantLayoutOpts = {}): string {
    const W = typeof opts.width === 'number' && opts.width >= 200 ? Math.floor(opts.width) : 520;
    const showLegend = opts.showLegend !== false;
    const padL = 56;
    const padR = showLegend ? 160 : 24;
    const padTop = 40;
    const padBottom = 60;
    const FOOTER_H = 50;

    const all = Array.isArray(elements) ? elements : [];
    const positioned = all.filter((e) => _pos(e));

    if (positioned.length === 0) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="90" viewBox="0 0 ${W} 90" font-family="sans-serif">` +
            `<rect width="${W}" height="90" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="50" text-anchor="middle" font-size="13" fill="#555">Sem dados de layout</text></svg>`
        );
    }

    // Bounding box dos elementos posicionados (inclui vértices de polígonos para context).
    let xMin = Infinity;
    let xMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const el of positioned) {
        const p = _pos(el) as { x: number; z: number };
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.z < zMin) zMin = p.z;
        if (p.z > zMax) zMax = p.z;
        // expandir bbox por vértices de polígonos (context/path) para evitar clip
        const verts: any[] = Array.isArray(el?.data?.vertices) ? el.data!.vertices! : [];
        for (const v of verts) {
            if (typeof v?.x !== 'number' || typeof v?.z !== 'number') continue;
            const wx = p.x + v.x;
            const wz = p.z + v.z;
            if (wx < xMin) xMin = wx;
            if (wx > xMax) xMax = wx;
            if (wz < zMin) zMin = wz;
            if (wz > zMax) zMax = wz;
        }
    }
    // Single-point fallback
    if (xMin === xMax) {
        xMin -= 1;
        xMax += 1;
    }
    if (zMin === zMax) {
        zMin -= 1;
        zMax += 1;
    }

    // Padding 10% em cada lado.
    const xRange = xMax - xMin;
    const zRange = zMax - zMin;
    xMin -= xRange * 0.1;
    xMax += xRange * 0.1;
    zMin -= zRange * 0.1;
    zMax += zRange * 0.1;
    const xSpan = xMax - xMin;
    const zSpan = zMax - zMin;

    // Determina H mantendo aspect ratio do bbox (capeado para não ficar gigante).
    const innerW = W - padL - padR;
    const aspect = zSpan / xSpan;
    const innerH = Math.max(180, Math.min(560, innerW * aspect));
    const H = innerH + padTop + padBottom;
    const drawX0 = padL;
    const drawX1 = padL + innerW;
    const drawY0 = padTop;
    const drawY1 = padTop + innerH;

    const mapX = (x: number) => drawX0 + ((x - xMin) / xSpan) * innerW;
    // Y do SVG cresce para baixo; z geográfico cresce para cima → inverte.
    const mapZ = (z: number) => drawY1 - ((z - zMin) / zSpan) * innerH;

    // ── Coleta de categorias presentes (para legenda) ───────────────────────
    const presentCategories = new Set<StyleKey>();

    // Renderiza por categoria, em ordem de empilhamento (fundo → topo).
    const layers: Record<StyleKey, string[]> = {
        context: [],
        path: [],
        receptorE: [],
        receptorH: [],
        secondary: [],
        primary: [],
        unknown: [],
    };

    for (const el of positioned) {
        const p = _pos(el) as { x: number; z: number };
        const fam = String(el?.family || 'unknown');
        const cat = _classify(fam);
        presentCategories.add(cat);
        const style = STYLES[cat];
        const px = mapX(p.x);
        const py = mapZ(p.z);
        const name = String(el?.name || '').trim();

        if (cat === 'context') {
            // Se tiver vertices, desenha polígono; senão círculo translúcido grande.
            const verts: any[] = Array.isArray(el?.data?.vertices) ? el.data!.vertices! : [];
            if (verts.length >= 3) {
                const pts: string[] = [];
                for (const v of verts) {
                    if (typeof v?.x !== 'number' || typeof v?.z !== 'number') continue;
                    const vx = mapX(p.x + v.x);
                    const vz = mapZ(p.z + v.z);
                    pts.push(`${vx.toFixed(1)},${vz.toFixed(1)}`);
                }
                if (pts.length >= 3) {
                    layers.context.push(
                        `<polygon points="${pts.join(' ')}" fill="${style.fill}" fill-opacity="0.55" stroke="${style.stroke}" stroke-width="0.8"/>`,
                    );
                }
            } else {
                layers.context.push(
                    `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="14" fill="${style.fill}" fill-opacity="0.4" stroke="${style.stroke}" stroke-width="0.8" stroke-dasharray="3 2"/>`,
                );
            }
        } else if (cat === 'path') {
            // Polyline tracejada se houver vertices; senão único segmento curto.
            const verts: any[] = Array.isArray(el?.data?.vertices) ? el.data!.vertices! : [];
            if (verts.length >= 2) {
                const pts: string[] = [];
                for (const v of verts) {
                    if (typeof v?.x !== 'number' || typeof v?.z !== 'number') continue;
                    const vx = mapX(p.x + v.x);
                    const vz = mapZ(p.z + v.z);
                    pts.push(`${vx.toFixed(1)},${vz.toFixed(1)}`);
                }
                if (pts.length >= 2) {
                    layers.path.push(
                        `<polyline points="${pts.join(' ')}" fill="none" stroke="${style.stroke}" stroke-width="1.4" stroke-dasharray="4 3"/>`,
                    );
                }
            } else {
                // Sem vertices: marca o ponto como pequeno losango cinza tracejado.
                const s = 6;
                layers.path.push(
                    `<polygon points="${px.toFixed(1)},${(py - s).toFixed(1)} ${(px + s).toFixed(1)},${py.toFixed(1)} ${px.toFixed(1)},${(py + s).toFixed(1)} ${(px - s).toFixed(1)},${py.toFixed(1)}" fill="none" stroke="${style.stroke}" stroke-width="1.2" stroke-dasharray="4 3"/>`,
                );
            }
        } else if (cat === 'receptorH' || cat === 'receptorE') {
            const r = style.size;
            layers[cat].push(
                `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1" fill-opacity="0.9"/>`,
            );
            if (name && name.length <= 24) {
                layers[cat].push(
                    `<text x="${(px + r + 3).toFixed(1)}" y="${(py + 3).toFixed(1)}" font-size="9" fill="#1a1a1a" stroke="#ffffff" stroke-width="2" paint-order="stroke">${_esc(name)}</text>`,
                );
            }
        } else if (cat === 'primary' || cat === 'secondary') {
            const s = style.size;
            const half = s / 2;
            layers[cat].push(
                `<rect x="${(px - half).toFixed(1)}" y="${(py - half).toFixed(1)}" width="${s}" height="${s}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.2"/>`,
            );
            if (name && name.length <= 24) {
                const weight = cat === 'primary' ? 'bold' : 'normal';
                layers[cat].push(
                    `<text x="${(px + half + 3).toFixed(1)}" y="${(py + 3).toFixed(1)}" font-size="10" fill="#1a1a1a" font-weight="${weight}" stroke="#ffffff" stroke-width="2" paint-order="stroke">${_esc(name)}</text>`,
                );
            }
        } else {
            // unknown: cinza pequeno
            layers.unknown.push(
                `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${style.size}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="0.8"/>`,
            );
        }
    }

    const drawnElements =
        layers.context.join('') +
        layers.path.join('') +
        layers.receptorE.join('') +
        layers.receptorH.join('') +
        layers.secondary.join('') +
        layers.primary.join('') +
        layers.unknown.join('');

    // ── Eixos Δx (m) e Δz (m) ──────────────────────────────────────────────
    const xStep = _niceStep(xSpan, 5);
    const zStep = _niceStep(zSpan, 5);
    const xTicks: string[] = [];
    const xStart = Math.ceil(xMin / xStep) * xStep;
    for (let x = xStart; x <= xMax + 0.001; x += xStep) {
        const tx = mapX(x);
        xTicks.push(
            `<line x1="${tx.toFixed(1)}" y1="${drawY1}" x2="${tx.toFixed(1)}" y2="${(drawY1 + 4).toFixed(1)}" stroke="#222"/>`,
        );
        xTicks.push(
            `<text x="${tx.toFixed(1)}" y="${(drawY1 + 14).toFixed(1)}" text-anchor="middle" font-size="9" fill="#222">${x.toFixed(xStep < 1 ? 1 : 0)}</text>`,
        );
    }
    const zTicks: string[] = [];
    const zStart = Math.ceil(zMin / zStep) * zStep;
    for (let z = zStart; z <= zMax + 0.001; z += zStep) {
        const ty = mapZ(z);
        zTicks.push(
            `<line x1="${(drawX0 - 4).toFixed(1)}" y1="${ty.toFixed(1)}" x2="${drawX0}" y2="${ty.toFixed(1)}" stroke="#222"/>`,
        );
        zTicks.push(
            `<text x="${(drawX0 - 6).toFixed(1)}" y="${(ty + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#222">${z.toFixed(zStep < 1 ? 1 : 0)}</text>`,
        );
    }
    const xAxis =
        `<line x1="${drawX0}" y1="${drawY1}" x2="${drawX1}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        xTicks.join('') +
        `<text x="${((drawX0 + drawX1) / 2).toFixed(1)}" y="${(drawY1 + 28).toFixed(1)}" text-anchor="middle" font-size="10" fill="#444">Δx (m)</text>`;
    const zAxisLabelY = ((drawY0 + drawY1) / 2).toFixed(1);
    const zAxis =
        `<line x1="${drawX0}" y1="${drawY0}" x2="${drawX0}" y2="${drawY1}" stroke="#222" stroke-width="1"/>` +
        zTicks.join('') +
        `<text x="14" y="${zAxisLabelY}" text-anchor="middle" font-size="10" fill="#444" transform="rotate(-90 14,${zAxisLabelY})">Δz (m)</text>`;

    // ── Legenda (lado direito) ─────────────────────────────────────────────
    let legendSvg = '';
    if (showLegend && presentCategories.size > 0) {
        const legX = drawX1 + 14;
        const legY = drawY0 + 6;
        // Ordem preferencial da legenda (mais alto → mais baixo na hierarquia FCR).
        const legendOrder: StyleKey[] = [
            'primary',
            'secondary',
            'path',
            'receptorH',
            'receptorE',
            'context',
            'unknown',
        ];
        const visible = legendOrder.filter((k) => presentCategories.has(k));
        const lineH = 16;
        const legendItems: string[] = visible.map((k, i) => {
            const ly = legY + i * lineH;
            const style = STYLES[k];
            let sym: string;
            if (style.symbol === 'square') {
                sym = `<rect x="${legX}" y="${ly}" width="10" height="10" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1"/>`;
            } else if (style.symbol === 'circle') {
                sym = `<circle cx="${legX + 5}" cy="${ly + 5}" r="5" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1"/>`;
            } else if (style.symbol === 'line') {
                sym = `<line x1="${legX}" y1="${ly + 5}" x2="${legX + 10}" y2="${ly + 5}" stroke="${style.stroke}" stroke-width="1.4" stroke-dasharray="4 3"/>`;
            } else {
                // polygon (context)
                sym = `<rect x="${legX}" y="${ly}" width="10" height="10" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1" stroke-dasharray="2 1"/>`;
            }
            return sym + `<text x="${legX + 14}" y="${ly + 9}" font-size="10" fill="#222">${_esc(style.label)}</text>`;
        });
        const legendH = visible.length * lineH + 10;
        const legendBg = `<rect x="${legX - 4}" y="${legY - 6}" width="138" height="${legendH}" fill="#ffffff" fill-opacity="0.92" stroke="#cccccc" stroke-width="0.5"/>`;
        legendSvg = legendBg + legendItems.join('');
    }

    // ── Rodapé ─────────────────────────────────────────────────────────────
    const title = _esc(opts.title || 'Layout de planta — fontes e receptores potenciais');
    const datum = _esc(opts.centerLabel?.datum || '');
    const source = _esc(opts.centerLabel?.source || '');
    const footerY1 = H + 14;
    const footerY2 = H + 28;
    const footerY3 = H + 42;
    const footer =
        `<rect x="0" y="${H}" width="${W}" height="${FOOTER_H}" fill="#ffffff" stroke="#cccccc"/>` +
        `<text x="${W / 2}" y="${footerY1}" text-anchor="middle" font-size="11" fill="#222" font-weight="bold">${title}</text>` +
        (datum
            ? `<text x="${W / 2}" y="${footerY2}" text-anchor="middle" font-size="10" fill="#555">${datum}</text>`
            : '') +
        (source
            ? `<text x="${W / 2}" y="${footerY3}" text-anchor="middle" font-size="9" fill="#888" font-style="italic">${source}</text>`
            : '');

    const totalH = H + FOOTER_H;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" font-family="sans-serif">` +
        `<rect width="${W}" height="${totalH}" fill="#f8fafc"/>` +
        drawnElements +
        xAxis +
        zAxis +
        legendSvg +
        footer +
        `</svg>`
    );
}

/**
 * Converte um SVG string em data URL base64 (allowlist exige
 * `data:image/svg+xml;base64,...`). UTF-8 safe, cross-env (node+browser).
 */
function _svgToDataUrl(svg: string): string {
    const s = String(svg || '');
    let b64: string;
    if (typeof Buffer !== 'undefined') {
        b64 = Buffer.from(s, 'utf8').toString('base64');
    } else {
        const bytes = new TextEncoder().encode(s);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i] as number);
        b64 = btoa(bin);
    }
    return `data:image/svg+xml;base64,${b64}`;
}

/** Conveniência: SVG do layout direto como data URL embutível. */
export function buildSourcePlantLayoutDataUrl(elements: PlantElement[], opts: SourcePlantLayoutOpts = {}): string {
    return _svgToDataUrl(buildSourcePlantLayoutSvg(elements, opts));
}
