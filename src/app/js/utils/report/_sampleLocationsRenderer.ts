// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) do mapa de locação de amostragem detalhada
// (F6 da gap analysis CETESB DD 038/2017 IC §2.1.k). Mostra estações de amostragem
// numeradas sequencialmente por matriz (solo: AS-01, AS-02; água subterrânea: PM-01,
// PM-02; etc.), com simbologia diferenciada por matriz e legenda de tipos+contagens.
// Diferente do _radiusPlanRenderer (visão geral GAC R=500 m) e do
// _sourcePlantLayoutRenderer (classificação fonte-caminho-receptor): este é o mapa
// de campo detalhado com NUMERAÇÃO sequencial das estações por campanha.
// Sem DOM/canvas (cheap-testável). Embutível como figura de relatório via
// data:image/svg+xml.
//
// Mapping family → matrix default (se element.data.matrix ausente):
//   well       → groundwater
//   sample     → soil
//   marker     → unknown
//   individual → biota
//   sensor     → air

export interface SampleLocation {
    id?: string;
    name?: string;
    family: string;
    position: { x: number; z: number; y?: number };
    matrix?: string;
    campaignIds?: string[];
    /** Número sequencial da estação no mapa (1-based). Atribuído pelo renderer se ausente. */
    stationNumber?: number;
    /** Profundidade da amostragem em metros (soil/well). */
    depth?: number;
}

export interface SampleLocationsOpts {
    title?: string;
    width?: number;
    /** Lista de campanhas para legenda. */
    campaigns?: Array<{ id: string; name: string; color?: string }>;
    /** Prefixos de numeração por matriz (ex {soil:'AS', groundwater:'PM'}). */
    numberingByMatrix?: Record<string, string>;
    showLegend?: boolean;
    centerLabel?: { source?: string; datum?: string };
}

interface MatrixStyle {
    fill: string;
    stroke: string;
    symbol: 'circle' | 'triangle' | 'diamond' | 'inverted-triangle' | 'star' | 'pentagon' | 'square';
    label: string;
}

// ── Estilos por matriz ────────────────────────────────────────────────────
const MATRIX_STYLES: Record<string, MatrixStyle> = {
    soil: { fill: '#8b5a2b', stroke: '#5d4037', symbol: 'triangle', label: 'Solo (sondagem)' },
    groundwater: { fill: '#2980b9', stroke: '#1b4f72', symbol: 'circle', label: 'Água subterrânea (poço)' },
    sediment: { fill: '#7d6608', stroke: '#5d4d05', symbol: 'diamond', label: 'Sedimento' },
    surface_water: {
        fill: '#1abc9c',
        stroke: '#0e6655',
        symbol: 'inverted-triangle',
        label: 'Água superficial',
    },
    air: { fill: '#9b59b6', stroke: '#6c3483', symbol: 'star', label: 'Ar / Vapores' },
    biota: { fill: '#27ae60', stroke: '#196f3d', symbol: 'pentagon', label: 'Biota / Receptor humano' },
    unknown: { fill: '#7f8c8d', stroke: '#34495e', symbol: 'square', label: 'Outro / Não classificado' },
};

const DEFAULT_NUMBERING: Record<string, string> = {
    soil: 'AS',
    groundwater: 'PM',
    sediment: 'SED',
    surface_water: 'AS',
    air: 'AR',
    biota: 'B',
    unknown: 'X',
};

const FAMILY_TO_MATRIX: Record<string, string> = {
    well: 'groundwater',
    sample: 'soil',
    marker: 'unknown',
    individual: 'biota',
    sensor: 'air',
};

/** Cap máximo de estações desenhadas (legibilidade). */
const MAX_RENDERED = 200;

function _familyToMatrix(family: string): string {
    return FAMILY_TO_MATRIX[family] || 'unknown';
}

function _normalizeMatrix(matrix: string | undefined, family: string): string {
    const m = (matrix || '').toLowerCase();
    if (m && MATRIX_STYLES[m]) return m;
    return _familyToMatrix(family);
}

function _isValidPos(p: any): p is { x: number; z: number } {
    return (
        p != null &&
        typeof p === 'object' &&
        typeof p.x === 'number' &&
        typeof p.z === 'number' &&
        Number.isFinite(p.x) &&
        Number.isFinite(p.z)
    );
}

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
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
 * Renderiza um símbolo em (cx, cy) com tamanho `size`. Retorna SVG fragment.
 * Pure — sem efeitos colaterais.
 */
function _symbol(
    cx: number,
    cy: number,
    size: number,
    type: MatrixStyle['symbol'],
    fill: string,
    stroke: string,
): string {
    const s = size;
    if (type === 'circle') {
        return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${s}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    if (type === 'square') {
        const half = s;
        return `<rect x="${(cx - half).toFixed(1)}" y="${(cy - half).toFixed(1)}" width="${(half * 2).toFixed(1)}" height="${(half * 2).toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    if (type === 'triangle') {
        // Triângulo equilátero apontando para cima
        const p1 = `${cx.toFixed(1)},${(cy - s).toFixed(1)}`;
        const p2 = `${(cx + s).toFixed(1)},${(cy + s).toFixed(1)}`;
        const p3 = `${(cx - s).toFixed(1)},${(cy + s).toFixed(1)}`;
        return `<polygon points="${p1} ${p2} ${p3}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    if (type === 'inverted-triangle') {
        const p1 = `${cx.toFixed(1)},${(cy + s).toFixed(1)}`;
        const p2 = `${(cx + s).toFixed(1)},${(cy - s).toFixed(1)}`;
        const p3 = `${(cx - s).toFixed(1)},${(cy - s).toFixed(1)}`;
        return `<polygon points="${p1} ${p2} ${p3}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    if (type === 'diamond') {
        const p1 = `${cx.toFixed(1)},${(cy - s).toFixed(1)}`;
        const p2 = `${(cx + s).toFixed(1)},${cy.toFixed(1)}`;
        const p3 = `${cx.toFixed(1)},${(cy + s).toFixed(1)}`;
        const p4 = `${(cx - s).toFixed(1)},${cy.toFixed(1)}`;
        return `<polygon points="${p1} ${p2} ${p3} ${p4}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    if (type === 'star') {
        // Estrela de 5 pontas
        const pts: string[] = [];
        for (let i = 0; i < 10; i++) {
            const angle = (Math.PI / 5) * i - Math.PI / 2;
            const r = i % 2 === 0 ? s : s * 0.45;
            pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    if (type === 'pentagon') {
        const pts: string[] = [];
        for (let i = 0; i < 5; i++) {
            const angle = (2 * Math.PI / 5) * i - Math.PI / 2;
            pts.push(`${(cx + s * Math.cos(angle)).toFixed(1)},${(cy + s * Math.sin(angle)).toFixed(1)}`);
        }
        return `<polygon points="${pts.join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
    }
    // fallback
    return `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${s}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
}

/**
 * Atribui `stationNumber` sequencialmente PER matriz (1, 2, 3...) a cada location,
 * mantendo a ordem original dos arrays. Pure — retorna nova lista.
 */
function _assignStationNumbers(
    locations: Array<SampleLocation & { _matrix: string }>,
): Array<SampleLocation & { _matrix: string; _stationNumber: number }> {
    const counters: Record<string, number> = {};
    return locations.map((loc) => {
        const matrix = loc._matrix;
        if (typeof loc.stationNumber === 'number' && Number.isFinite(loc.stationNumber)) {
            // Respeita número fornecido
            return { ...loc, _stationNumber: loc.stationNumber };
        }
        counters[matrix] = (counters[matrix] || 0) + 1;
        return { ...loc, _stationNumber: counters[matrix] as number };
    });
}

/**
 * Constrói o SVG (string) do mapa de locação. Pure — sem efeitos colaterais.
 * @param locations estações de amostragem com position e (opcionalmente) matrix
 * @returns SVG string (>= placeholder se locations vazio ou todas inválidas)
 */
export function buildSampleLocationsSvg(locations: SampleLocation[], opts: SampleLocationsOpts = {}): string {
    const W = typeof opts.width === 'number' && opts.width >= 200 ? Math.floor(opts.width) : 560;
    const showLegend = opts.showLegend !== false;
    const padL = 56;
    const padR = showLegend ? 150 : 24;
    const padTop = 40;
    const padBottom = 70;
    const FOOTER_H = 50;
    const numbering = { ...DEFAULT_NUMBERING, ...(opts.numberingByMatrix || {}) };

    const all = Array.isArray(locations) ? locations : [];
    const valid = all.filter((l) => l && _isValidPos(l.position));

    if (valid.length === 0) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="90" viewBox="0 0 ${W} 90" font-family="sans-serif">` +
            `<rect width="${W}" height="90" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="50" text-anchor="middle" font-size="13" fill="#555">Sem estações de amostragem</text></svg>`
        );
    }

    // Cap de renderização (legibilidade)
    const truncated = valid.length > MAX_RENDERED;
    const renderList = truncated ? valid.slice(0, MAX_RENDERED) : valid;
    const hiddenCount = truncated ? valid.length - MAX_RENDERED : 0;

    // Normaliza matriz para cada location
    const enriched = renderList.map((l) => ({
        ...l,
        _matrix: _normalizeMatrix(l.matrix, l.family),
    }));

    // Atribui números sequenciais por matriz
    const numbered = _assignStationNumbers(enriched);

    // Bounding box
    let xMin = Infinity;
    let xMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const l of numbered) {
        const p = l.position;
        if (p.x < xMin) xMin = p.x;
        if (p.x > xMax) xMax = p.x;
        if (p.z < zMin) zMin = p.z;
        if (p.z > zMax) zMax = p.z;
    }
    if (xMin === xMax) {
        xMin -= 1;
        xMax += 1;
    }
    if (zMin === zMax) {
        zMin -= 1;
        zMax += 1;
    }
    // Padding 12% em cada lado
    const xRange = xMax - xMin;
    const zRange = zMax - zMin;
    xMin -= xRange * 0.12;
    xMax += xRange * 0.12;
    zMin -= zRange * 0.12;
    zMax += zRange * 0.12;
    const xSpan = xMax - xMin;
    const zSpan = zMax - zMin;

    // Aspect ratio mantido
    const innerW = W - padL - padR;
    const aspect = zSpan / xSpan;
    const innerH = Math.max(200, Math.min(600, innerW * aspect));
    const H = innerH + padTop + padBottom;
    const drawX0 = padL;
    const drawX1 = padL + innerW;
    const drawY0 = padTop;
    const drawY1 = padTop + innerH;

    const mapX = (x: number) => drawX0 + ((x - xMin) / xSpan) * innerW;
    // Y do SVG cresce para baixo; z geográfico cresce para cima → inverte
    const mapZ = (z: number) => drawY1 - ((z - zMin) / zSpan) * innerH;

    // Contagem por matriz (para legenda)
    const countByMatrix: Record<string, number> = {};
    for (const l of numbered) {
        countByMatrix[l._matrix] = (countByMatrix[l._matrix] || 0) + 1;
    }

    // ── Renderiza pontos + códigos ──────────────────────────────────────
    const points: string[] = [];
    for (const l of numbered) {
        const style = MATRIX_STYLES[l._matrix] || MATRIX_STYLES.unknown;
        if (!style) continue;
        const px = mapX(l.position.x);
        const py = mapZ(l.position.z);
        const symSize = 6;
        points.push(_symbol(px, py, symSize, style.symbol, style.fill, style.stroke));

        // Código da estação: prefix-NN (ex: AS-01)
        const prefix = numbering[l._matrix] || numbering.unknown || 'X';
        const code = `${prefix}-${_pad2(l._stationNumber)}`;
        const name = String(l.name || '').trim();
        const showName = name && name.length <= 20 && name !== code;
        const codeLabel = showName ? `${code} (${name})` : code;

        const labelX = px + symSize + 3;
        const labelY = py + 3;
        points.push(
            `<text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" font-size="9" font-weight="bold" fill="#1a1a1a" stroke="#ffffff" stroke-width="2" paint-order="stroke">${_esc(codeLabel)}</text>`,
        );

        // Indicador de campanhas (subscrito abaixo do código)
        if (Array.isArray(l.campaignIds) && l.campaignIds.length > 0) {
            const campLabel = l.campaignIds.slice(0, 3).join(',');
            const campY = labelY + 9;
            points.push(
                `<text x="${labelX.toFixed(1)}" y="${campY.toFixed(1)}" font-size="7" fill="#555" stroke="#ffffff" stroke-width="1.5" paint-order="stroke">${_esc(campLabel)}</text>`,
            );
        }
    }

    // ── Eixos Δx (m) e Δz (m) ────────────────────────────────────────────
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

    // ── Legenda à direita (matrizes presentes + campanhas) ──────────────
    let legendSvg = '';
    if (showLegend) {
        const legX = drawX1 + 14;
        const legY = drawY0 + 6;
        const lineH = 16;
        const items: string[] = [];

        // Ordem preferencial da legenda
        const matrixOrder: string[] = ['soil', 'groundwater', 'sediment', 'surface_water', 'air', 'biota', 'unknown'];
        const presentMatrices = matrixOrder.filter((m) => (countByMatrix[m] || 0) > 0);

        // Título "Matriz"
        items.push(
            `<text x="${legX}" y="${legY + 9}" font-size="10" font-weight="bold" fill="#222">Matriz</text>`,
        );

        let lineIdx = 1;
        for (const m of presentMatrices) {
            const ly = legY + lineIdx * lineH;
            const style = MATRIX_STYLES[m];
            if (!style) continue;
            const sym = _symbol(legX + 5, ly + 5, 5, style.symbol, style.fill, style.stroke);
            const cnt = countByMatrix[m] || 0;
            items.push(
                sym +
                    `<text x="${legX + 16}" y="${ly + 9}" font-size="9" fill="#222">${_esc(style.label)} (${cnt})</text>`,
            );
            lineIdx++;
        }

        // Aviso de overflow
        if (hiddenCount > 0) {
            const ly = legY + lineIdx * lineH;
            items.push(
                `<text x="${legX}" y="${ly + 9}" font-size="9" fill="#c0392b" font-style="italic">+${hiddenCount} estações ocultas</text>`,
            );
            lineIdx++;
        }

        // Campanhas (se fornecido)
        const camps = Array.isArray(opts.campaigns) ? opts.campaigns : [];
        if (camps.length > 0) {
            lineIdx++; // espaço extra
            const lyTitle = legY + lineIdx * lineH;
            items.push(
                `<text x="${legX}" y="${lyTitle + 9}" font-size="10" font-weight="bold" fill="#222">Campanhas</text>`,
            );
            lineIdx++;
            for (const c of camps.slice(0, 6)) {
                const ly = legY + lineIdx * lineH;
                const color = c.color || '#7f8c8d';
                items.push(
                    `<rect x="${legX}" y="${ly}" width="10" height="10" fill="${color}" stroke="#444" stroke-width="0.6"/>` +
                        `<text x="${legX + 14}" y="${ly + 9}" font-size="9" fill="#222">${_esc(c.name || c.id)}</text>`,
                );
                lineIdx++;
            }
        }

        const legendH = lineIdx * lineH + 14;
        const legendBg = `<rect x="${legX - 4}" y="${legY - 6}" width="138" height="${legendH}" fill="#ffffff" fill-opacity="0.92" stroke="#cccccc" stroke-width="0.5"/>`;
        legendSvg = legendBg + items.join('');
    }

    // ── Cabeçalho (topo) ────────────────────────────────────────────────
    const title = _esc(opts.title || 'Mapa de locação de amostragem');
    const totalLabel = `Total: ${valid.length} estação(ões)`;
    const header =
        `<text x="${W / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#222">${title}</text>` +
        `<text x="${W / 2}" y="36" text-anchor="middle" font-size="10" fill="#555">${_esc(totalLabel)}</text>`;

    // ── Rodapé ───────────────────────────────────────────────────────────
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
        header +
        points.join('') +
        xAxis +
        zAxis +
        legendSvg +
        footer +
        `</svg>`
    );
}

/**
 * Converte um SVG string em data URL base64. UTF-8 safe, cross-env (node+browser).
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

/** Conveniência: SVG do mapa direto como data URL embutível. */
export function buildSampleLocationsDataUrl(
    locations: SampleLocation[],
    opts: SampleLocationsOpts = {},
): string {
    return _svgToDataUrl(buildSampleLocationsSvg(locations, opts));
}
