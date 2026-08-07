// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure SVG do perfil litológico/construtivo de poço (F3 da gap analysis
// CETESB DD 038/2017 IC §2.1.h). Recebe layers normalizados (do core/elements/families/
// well/stratigraphyEngine#normalizeWellProfile) + opts e produz SVG sem DOM/THREE.
//
// Convenções:
// - Eixo Y vertical = profundidade (m), 0 no topo, max embaixo
// - Coluna litológica à esquerda (largura fixa); coluna construtiva opcional à direita
// - Cor por soilType (palette pedológica); padrão tonal por grupo (fine/coarse/rock/anthropic/organic)
// - Rodapé com nome do poço, cota, datum, source

export interface WellProfileLayer {
    from: number;
    to: number;
    thickness?: number;
    soilType?: string;
    sucs?: string;
    description?: string;
    consistency?: string;
}

export interface WellConstructive {
    /** Profundidade máx do revestimento cego (tubo liso) em m */
    casingTo?: number;
    /** Profundidade do filtro [from, to] em m */
    screen?: { from: number; to: number };
    /** Profundidade do selo de cimento em m (do topo até) */
    sealTo?: number;
    /** Profundidade do pré-filtro de areia em m [from, to] */
    sandPack?: { from: number; to: number };
}

export interface WellProfileOpts {
    title?: string;
    wellName?: string;
    elevation?: number;
    coords?: { x: number; y?: number; z: number };
    datum?: string;
    width?: number;
    /** Escala vertical: pixels por metro (default auto) */
    pxPerM?: number;
    constructive?: WellConstructive;
    centerLabel?: { source?: string; datum?: string };
}

// ── Palette pedológica (cor por soilType) ─────────────────────────────────
const SOIL_COLORS: Record<string, string> = {
    topsoil: '#8b5a2b',
    peat: '#5d4037',
    fill: '#9e9e9e',
    clay: '#c19a6b',
    sandy_clay: '#d4b896',
    silt: '#bcaaa4',
    silty_sand: '#e3c587',
    sand: '#f4d35e',
    clayey_sand: '#deba8a',
    gravel: '#a8a29e',
    rock: '#6e7c8a',
    __gap__: '#ffffff',
    unknown: '#cbd5e1',
};

const SOIL_LABEL: Record<string, string> = {
    topsoil: 'Solo orgânico',
    peat: 'Turfa',
    fill: 'Aterro/Antrópico',
    clay: 'Argila',
    sandy_clay: 'Argila arenosa',
    silt: 'Silte',
    silty_sand: 'Areia siltosa',
    sand: 'Areia',
    clayey_sand: 'Areia argilosa',
    gravel: 'Pedregulho',
    rock: 'Rocha',
    __gap__: '(gap)',
    unknown: 'Não classificado',
};

const _esc = (s: unknown): string =>
    String(s ?? '').replace(/[&<>"']/g, (c) =>
        c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;',
    );

function _colorOf(soilType: string | undefined): string {
    return SOIL_COLORS[String(soilType || 'unknown')] || SOIL_COLORS.unknown!;
}
function _labelOf(soilType: string | undefined): string {
    return SOIL_LABEL[String(soilType || 'unknown')] || String(soilType || 'unknown');
}

function _hatchPattern(group: 'fine' | 'coarse' | 'rock' | 'anthropic' | 'organic'): string {
    // Hachuras por grupo: defs reutilizáveis (mantém SVG limpo)
    switch (group) {
        case 'fine':
            return '<pattern id="hatch-fine" patternUnits="userSpaceOnUse" width="6" height="6"><line x1="0" y1="3" x2="6" y2="3" stroke="#000" stroke-width="0.4"/></pattern>';
        case 'coarse':
            return '<pattern id="hatch-coarse" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="3" cy="3" r="0.6" fill="#000"/></pattern>';
        case 'rock':
            return '<pattern id="hatch-rock" patternUnits="userSpaceOnUse" width="6" height="6"><line x1="0" y1="0" x2="6" y2="6" stroke="#000" stroke-width="0.4"/><line x1="6" y1="0" x2="0" y2="6" stroke="#000" stroke-width="0.4"/></pattern>';
        case 'anthropic':
            return '<pattern id="hatch-anthropic" patternUnits="userSpaceOnUse" width="6" height="6"><line x1="0" y1="0" x2="6" y2="6" stroke="#444" stroke-width="0.5"/></pattern>';
        case 'organic':
            return '<pattern id="hatch-organic" patternUnits="userSpaceOnUse" width="6" height="6"><circle cx="3" cy="3" r="0.8" fill="#3e2723"/></pattern>';
    }
}

function _groupOf(soilType: string): 'fine' | 'coarse' | 'rock' | 'anthropic' | 'organic' | null {
    const g: Record<string, 'fine' | 'coarse' | 'rock' | 'anthropic' | 'organic'> = {
        clay: 'fine',
        silt: 'fine',
        sandy_clay: 'fine',
        topsoil: 'organic',
        peat: 'organic',
        sand: 'coarse',
        silty_sand: 'coarse',
        clayey_sand: 'coarse',
        gravel: 'coarse',
        fill: 'anthropic',
        rock: 'rock',
    };
    return g[soilType] || null;
}

function _niceTick(maxDepth: number): number {
    // Espaçamento bonito para grade de profundidade
    if (maxDepth <= 5) return 0.5;
    if (maxDepth <= 10) return 1;
    if (maxDepth <= 30) return 2;
    if (maxDepth <= 100) return 5;
    return 10;
}

export function buildWellProfileSvg(layers: WellProfileLayer[], opts: WellProfileOpts = {}): string {
    const valid: WellProfileLayer[] = (Array.isArray(layers) ? layers : []).filter(
        (l) =>
            l &&
            typeof l.from === 'number' &&
            typeof l.to === 'number' &&
            Number.isFinite(l.from) &&
            Number.isFinite(l.to) &&
            l.to > l.from,
    );

    const width = Math.max(280, Math.floor(opts.width || 420));
    const padL = 56; // espaço para eixo de profundidade
    // eslint-disable-next-line
    const padR = 16;
    const padTop = 60; // cabeçalho com nome/cota
    const padBottom = 80; // legenda + rodapé
    const colLitoW = 120;
    const colConstW = opts.constructive ? 90 : 0;
    const colGap = colConstW ? 18 : 0;

    if (valid.length === 0) {
        const footer = '<rect width="' + width + '" height="80" fill="#fff" stroke="#cccccc"/>'
            + '<text x="' + width / 2 + '" y="44" text-anchor="middle" font-size="11" fill="#777">Sem dados de perfil litológico</text>';
        const minH = 160;
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${minH}" viewBox="0 0 ${width} ${minH}" font-family="sans-serif">${footer}</svg>`;
    }

    const maxDepth = Math.max(...valid.map((l) => l.to));
    const tick = _niceTick(maxDepth);
    // Escala: garantir altura plotagem mínima 280 px, máxima 520 px
    let pxPerM = Number.isFinite(opts.pxPerM) ? Number(opts.pxPerM) : 0;
    if (!pxPerM || pxPerM <= 0) {
        pxPerM = Math.max(8, Math.min(28, 320 / Math.max(maxDepth, 1)));
    }
    const plotH = Math.max(180, Math.round(maxDepth * pxPerM));
    const totalH = padTop + plotH + padBottom;

    const colLitoX = padL;
    const colConstX = colLitoX + colLitoW + colGap;

    // ── Defs (hachuras + drop shadow leve) ───────────────────────────────
    const defs = '<defs>'
        + _hatchPattern('fine')
        + _hatchPattern('coarse')
        + _hatchPattern('rock')
        + _hatchPattern('anthropic')
        + _hatchPattern('organic')
        + '</defs>';

    // ── Cabeçalho ────────────────────────────────────────────────────────
    const wellName = _esc(opts.wellName || opts.title || 'Poço sem nome');
    const elev = typeof opts.elevation === 'number' ? `Cota: ${opts.elevation.toFixed(2)} m` : '';
    const coords = opts.coords ? `(${opts.coords.x.toFixed(1)}, ${opts.coords.z.toFixed(1)})` : '';
    const datumHdr = _esc(opts.datum || opts.centerLabel?.datum || '');

    const header = '<rect x="0" y="0" width="' + width + '" height="' + padTop + '" fill="#f8fafc" stroke="#e5e7eb"/>'
        + '<text x="' + width / 2 + '" y="22" text-anchor="middle" font-size="12" fill="#222" font-weight="bold">'
        + wellName + '</text>'
        + '<text x="' + width / 2 + '" y="38" text-anchor="middle" font-size="10" fill="#444">'
        + _esc(elev) + (elev && coords ? ' · ' : '') + _esc(coords) + '</text>'
        + (datumHdr ? '<text x="' + width / 2 + '" y="52" text-anchor="middle" font-size="9" fill="#666">' + datumHdr + '</text>' : '');

    // ── Eixo de profundidade ─────────────────────────────────────────────
    const axisX = padL - 4;
    let axisParts = '<line x1="' + axisX + '" y1="' + padTop + '" x2="' + axisX + '" y2="' + (padTop + plotH) + '" stroke="#222" stroke-width="1"/>';
    for (let d = 0; d <= maxDepth + 0.001; d += tick) {
        const y = padTop + d * pxPerM;
        if (y > padTop + plotH + 0.5) break;
        axisParts += '<line x1="' + (axisX - 4) + '" y1="' + y + '" x2="' + axisX + '" y2="' + y + '" stroke="#222"/>';
        axisParts += '<text x="' + (axisX - 6) + '" y="' + (y + 3) + '" text-anchor="end" font-size="9" fill="#222">' + d.toFixed(d % 1 === 0 ? 0 : 1) + '</text>';
    }
    // Rótulo "Profundidade (m)" — rotacionado
    axisParts += '<text x="14" y="' + (padTop + plotH / 2) + '" text-anchor="middle" font-size="10" fill="#444" transform="rotate(-90 14,' + (padTop + plotH / 2) + ')">Profundidade (m)</text>';

    // ── Coluna litológica ────────────────────────────────────────────────
    let litho = '<rect x="' + colLitoX + '" y="' + padTop + '" width="' + colLitoW + '" height="' + plotH + '" fill="#ffffff" stroke="#222"/>';
    const soilsUsed = new Set<string>();
    for (const l of valid) {
        const yTop = padTop + l.from * pxPerM;
        const yBot = padTop + l.to * pxPerM;
        const h = Math.max(1, yBot - yTop);
        const st = String(l.soilType || 'unknown');
        if (st === '__gap__') {
            litho += '<rect x="' + colLitoX + '" y="' + yTop + '" width="' + colLitoW + '" height="' + h + '" fill="#fef3c7" stroke="#fbbf24" stroke-dasharray="3 2"/>';
            soilsUsed.add('__gap__');
            continue;
        }
        const color = _colorOf(st);
        const group = _groupOf(st);
        litho += '<rect x="' + colLitoX + '" y="' + yTop + '" width="' + colLitoW + '" height="' + h + '" fill="' + color + '"/>';
        if (group) {
            litho += '<rect x="' + colLitoX + '" y="' + yTop + '" width="' + colLitoW + '" height="' + h + '" fill="url(#hatch-' + group + ')" opacity="0.45"/>';
        }
        soilsUsed.add(st);
        // Descrição inline (curta) — só se houver espaço vertical
        if (h >= 12 && l.description) {
            litho += '<text x="' + (colLitoX + colLitoW / 2) + '" y="' + ((yTop + yBot) / 2 + 3) + '" text-anchor="middle" font-size="8" fill="#222">'
                + _esc(String(l.description).slice(0, 18))
                + '</text>';
        }
    }

    // ── Coluna construtiva (opcional) ────────────────────────────────────
    let construct = '';
    if (opts.constructive && colConstW > 0) {
        const c = opts.constructive;
        construct = '<rect x="' + colConstX + '" y="' + padTop + '" width="' + colConstW + '" height="' + plotH + '" fill="#ffffff" stroke="#222"/>';
        construct += '<text x="' + (colConstX + colConstW / 2) + '" y="' + (padTop - 4) + '" text-anchor="middle" font-size="9" fill="#444">Construtivo</text>';
        // Cimentação (selo) — topo até sealTo
        if (typeof c.sealTo === 'number' && c.sealTo > 0) {
            const yEnd = padTop + Math.min(c.sealTo, maxDepth) * pxPerM;
            construct += '<rect x="' + colConstX + '" y="' + padTop + '" width="' + colConstW + '" height="' + (yEnd - padTop) + '" fill="#a16207" opacity="0.4"/>';
            construct += '<text x="' + (colConstX + 4) + '" y="' + (padTop + 10) + '" font-size="7" fill="#222">Cimento</text>';
        }
        // Pré-filtro areia
        if (c.sandPack && Number.isFinite(c.sandPack.from) && Number.isFinite(c.sandPack.to) && c.sandPack.to > c.sandPack.from) {
            const yA = padTop + Math.min(c.sandPack.from, maxDepth) * pxPerM;
            const yB = padTop + Math.min(c.sandPack.to, maxDepth) * pxPerM;
            construct += '<rect x="' + colConstX + '" y="' + yA + '" width="' + colConstW + '" height="' + (yB - yA) + '" fill="#fde68a" opacity="0.7"/>';
        }
        // Casing (revestimento cego) — barras laterais até casingTo
        if (typeof c.casingTo === 'number' && c.casingTo > 0) {
            const yEnd = padTop + Math.min(c.casingTo, maxDepth) * pxPerM;
            const cx1 = colConstX + 14;
            const cx2 = colConstX + colConstW - 14;
            construct += '<line x1="' + cx1 + '" y1="' + padTop + '" x2="' + cx1 + '" y2="' + yEnd + '" stroke="#111" stroke-width="2"/>';
            construct += '<line x1="' + cx2 + '" y1="' + padTop + '" x2="' + cx2 + '" y2="' + yEnd + '" stroke="#111" stroke-width="2"/>';
        }
        // Filtro (slot pattern)
        if (c.screen && Number.isFinite(c.screen.from) && Number.isFinite(c.screen.to) && c.screen.to > c.screen.from) {
            const yA = padTop + Math.min(c.screen.from, maxDepth) * pxPerM;
            const yB = padTop + Math.min(c.screen.to, maxDepth) * pxPerM;
            const cx1 = colConstX + 14;
            const cx2 = colConstX + colConstW - 14;
            // Linhas horizontais de filtro
            for (let yy = yA + 4; yy < yB; yy += 5) {
                construct += '<line x1="' + cx1 + '" y1="' + yy + '" x2="' + cx2 + '" y2="' + yy + '" stroke="#111" stroke-width="0.6"/>';
            }
            construct += '<text x="' + (colConstX + colConstW + 2) + '" y="' + ((yA + yB) / 2 + 3) + '" font-size="8" fill="#222">Filtro</text>';
        }
    }

    // ── Legenda (soilType usados) ───────────────────────────────────────
    const lgY = padTop + plotH + 8;
    let legend = '';
    let lx = padL;
    const items = Array.from(soilsUsed).filter((s) => s !== '__gap__');
    for (const s of items) {
        legend += '<rect x="' + lx + '" y="' + lgY + '" width="10" height="10" fill="' + _colorOf(s) + '" stroke="#222" stroke-width="0.4"/>';
        const lbl = _labelOf(s);
        legend += '<text x="' + (lx + 14) + '" y="' + (lgY + 9) + '" font-size="9" fill="#222">' + _esc(lbl) + '</text>';
        lx += 14 + lbl.length * 5.5 + 10;
        if (lx > width - 60) {
            lx = padL;
            // próxima linha (raro; só se >5 soilTypes distintos)
        }
    }

    // ── Rodapé ──────────────────────────────────────────────────────────
    const footerY = totalH - 36;
    const source = _esc(opts.centerLabel?.source || 'Modelo ecbyts — core/elements/families/well');
    const footerTitle = _esc(opts.title || 'Perfil litológico/construtivo');
    const footer = '<rect x="0" y="' + footerY + '" width="' + width + '" height="36" fill="#ffffff" stroke="#cccccc"/>'
        + '<text x="' + width / 2 + '" y="' + (footerY + 13) + '" text-anchor="middle" font-size="10" fill="#222" font-weight="bold">'
        + footerTitle + '</text>'
        + '<text x="' + width / 2 + '" y="' + (footerY + 27) + '" text-anchor="middle" font-size="8" fill="#888" font-style="italic">'
        + source + '</text>';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${totalH}" viewBox="0 0 ${width} ${totalH}" font-family="sans-serif">${defs}${header}${axisParts}${litho}${construct}${legend}${footer}</svg>`;
}

export function buildWellProfileDataUrl(layers: WellProfileLayer[], opts: WellProfileOpts = {}): string {
    const svg = buildWellProfileSvg(layers, opts);
    const b64 = typeof Buffer !== 'undefined'
        ? Buffer.from(svg, 'utf8').toString('base64')
        : (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(svg))) : '');
    return `data:image/svg+xml;base64,${b64}`;
}
