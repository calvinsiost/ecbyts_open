// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) do mapa geológico 2D formatado (F7 da gap analysis CETESB
// DD 038/2017 IC §2.1.f). Renderiza unidades cronoestratigráficas com cores
// padronizadas CGMW/CPRM (Serviço Geológico Brasileiro / Commission for the
// Geological Map of the World) + lineamentos de falha com simbologia geológica.
// Distinto do provider `geo-pedo-maps` (que captura o viewport 3D): este é um
// mapa formatado 2D com legenda científica completa. Sem DOM/canvas
// (cheap-testável). Embutível como figura de relatório via data:image/svg+xml.
//
// Códigos cronoestratigráficos seguem CGMW International Stratigraphic Chart +
// convenção brasileira CPRM/SBG. Cores são as ISO 9001:2013 da CGMW (geological
// time scale globalmente padronizada).

import { toFiniteNumber } from '../helpers/toFiniteNumber.js';

export interface GeologicalUnit {
    id?: string;
    /** Código cronoestratigráfico (ex 'Q', 'K', 'Jb') — chave em GEO_COLORS. */
    code: string;
    /** Nome formal da unidade (ex 'Formação Botucatu'). */
    name?: string;
    description?: string;
    /** Polígono em coordenadas locais (relativo ao centroide) ou UTM. */
    polygon: Array<{ x: number; z: number }>;
    /** Idade geológica humanamente legível (ex 'Quaternário'). */
    age?: string;
    /** Litologia dominante (ex 'arenito eólico'). */
    lithology?: string;
}

export interface FaultLineament {
    id?: string;
    name?: string;
    /** Polyline da projeção em planta. */
    line: Array<{ x: number; z: number }>;
    /** Azimute da direção do plano de falha (graus). */
    strike?: number;
    /** Mergulho do plano de falha (graus). */
    dip?: number;
    /** Tipo de falha — define a simbologia geológica. */
    type?: 'normal' | 'reverse' | 'strike-slip' | 'unknown';
}

export interface GeologicalMapOpts {
    title?: string;
    /** Largura do SVG em px (default 600). Altura calculada a partir do bbox + headers. */
    width?: number;
    showLegend?: boolean;
    showFaults?: boolean;
    showNorthArrow?: boolean;
    showScaleBar?: boolean;
    centerLabel?: { source?: string; datum?: string };
}

// ── Cores padronizadas CGMW (ISO 9001:2013) / CPRM ─────────────────────────
// Códigos: Q/Qa = Quaternário(s); Tn = Neógeno; Tpa = Paleógeno; K = Cretáceo;
// Jb = Jurássico (Botucatu); Tt = Triássico; P = Permiano; C = Carbonífero;
// D = Devoniano; S = Siluriano; O = Ordoviciano; Cm = Cambriano;
// PC = Pré-cambriano indiferenciado; A = Arqueano; UND = Geologia indefinida.
const GEO_COLORS: Record<string, { fill: string; label: string; order: number }> = {
    // Cenozoico (mais novo → ordem menor para legenda)
    Q: { fill: '#FFFF99', label: 'Quaternário (sedimentos recentes)', order: 1 },
    Qa: { fill: '#FFFFB2', label: 'Quaternário aluvionar', order: 2 },
    Tn: { fill: '#FFE619', label: 'Neógeno', order: 3 },
    Tpa: { fill: '#FDB462', label: 'Paleógeno', order: 4 },
    // Mesozoico
    K: { fill: '#7FC97F', label: 'Cretáceo', order: 5 },
    Jb: { fill: '#84CD9E', label: 'Jurássico (Botucatu)', order: 6 },
    Tt: { fill: '#A6CEE3', label: 'Triássico', order: 7 },
    // Paleozoico
    P: { fill: '#EF8A62', label: 'Permiano', order: 8 },
    C: { fill: '#67E4C2', label: 'Carbonífero', order: 9 },
    D: { fill: '#CB81B6', label: 'Devoniano', order: 10 },
    S: { fill: '#B3CDE3', label: 'Siluriano', order: 11 },
    O: { fill: '#33A02C', label: 'Ordoviciano', order: 12 },
    Cm: { fill: '#7DDBC9', label: 'Cambriano', order: 13 },
    // Precambriano
    PC: { fill: '#F4A582', label: 'Pré-cambriano indiferenciado', order: 14 },
    A: { fill: '#FB9A99', label: 'Arqueano', order: 15 },
    // Default fallback
    UND: { fill: '#CCCCCC', label: 'Geologia indefinida', order: 99 },
};

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _resolveColor(code: string): { fill: string; label: string; order: number } {
    const upper = String(code || '').trim();
    if (Object.prototype.hasOwnProperty.call(GEO_COLORS, upper)) {
        return GEO_COLORS[upper] as { fill: string; label: string; order: number };
    }
    console.debug('[geologicalMap] código desconhecido:', upper);
    return GEO_COLORS.UND as { fill: string; label: string; order: number };
}

/** Calcula área aproximada de polígono (shoelace, valor absoluto). */
function _polyArea(pts: Array<{ x: number; z: number }>): number {
    if (pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i] as { x: number; z: number };
        const b = pts[(i + 1) % pts.length] as { x: number; z: number };
        area += a.x * b.z - b.x * a.z;
    }
    return Math.abs(area / 2);
}

/** Centroide aritmético simples dos vértices. */
function _polyCentroid(pts: Array<{ x: number; z: number }>): { x: number; z: number } {
    let sx = 0;
    let sz = 0;
    for (const p of pts) {
        sx += p.x;
        sz += p.z;
    }
    return { x: sx / pts.length, z: sz / pts.length };
}

/** Escolhe um valor "redondo" para a escala gráfica, próximo ao targetPx. */
function _niceScale(mPerPx: number, targetPx: number): number {
    const targetM = mPerPx * targetPx;
    const candidates = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];
    let best = candidates[0] as number;
    let bestDelta = Math.abs(Math.log((candidates[0] as number) / targetM));
    for (const c of candidates) {
        const d = Math.abs(Math.log(c / targetM));
        if (d < bestDelta) {
            best = c;
            bestDelta = d;
        }
    }
    return best;
}

/**
 * Constrói o SVG do mapa geológico 2D. Pure — sem efeitos colaterais.
 *
 * Ordem de empilhamento:
 *  1. fundo
 *  2. polígonos de unidades geológicas (maiores primeiro p/ não esconder pequenos)
 *  3. labels dos códigos no centroide (apenas polígonos ≥ 20% do bbox)
 *  4. linhas de falha + símbolos geológicos
 *  5. eixos / north arrow / scale bar / legenda / rodapé
 */
export function buildGeologicalMapSvg(
    units: GeologicalUnit[],
    faults: FaultLineament[],
    opts: GeologicalMapOpts = {},
): string {
    const W = typeof opts.width === 'number' && opts.width >= 200 ? Math.floor(opts.width) : 600;
    const showLegend = opts.showLegend !== false;
    const showFaults = opts.showFaults !== false;
    const showNorthArrow = opts.showNorthArrow !== false;
    const showScaleBar = opts.showScaleBar !== false;

    // Defensivo: filtra e limita.
    const rawUnits = (Array.isArray(units) ? units : []).filter(
        (u) => u && Array.isArray(u.polygon) && u.polygon.length >= 3,
    );
    const rawFaults = (Array.isArray(faults) ? faults : []).filter(
        (f) => f && Array.isArray(f.line) && f.line.length >= 2,
    );
    const cleanUnits = rawUnits.slice(0, 200);
    const cleanFaults = showFaults ? rawFaults.slice(0, 50) : [];

    // Placeholder se vazio.
    if (cleanUnits.length === 0 && cleanFaults.length === 0) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="100" viewBox="0 0 ${W} 100" font-family="sans-serif">` +
            `<rect width="${W}" height="100" fill="#f8fafc"/>` +
            `<text x="${W / 2}" y="40" text-anchor="middle" font-size="13" fill="#555">Sem dados geológicos</text>` +
            `<text x="${W / 2}" y="62" text-anchor="middle" font-size="11" fill="#888" font-style="italic">anexar layer vetorial CPRM/SBG</text>` +
            `</svg>`
        );
    }

    // ── Bounding box (inclui linhas de falha) ───────────────────────────────
    let xMin = Infinity;
    let xMax = -Infinity;
    let zMin = Infinity;
    let zMax = -Infinity;
    for (const u of cleanUnits) {
        for (const p of u.polygon) {
            if (typeof p.x !== 'number' || typeof p.z !== 'number') continue;
            if (p.x < xMin) xMin = p.x;
            if (p.x > xMax) xMax = p.x;
            if (p.z < zMin) zMin = p.z;
            if (p.z > zMax) zMax = p.z;
        }
    }
    for (const f of cleanFaults) {
        for (const p of f.line) {
            if (typeof p.x !== 'number' || typeof p.z !== 'number') continue;
            if (p.x < xMin) xMin = p.x;
            if (p.x > xMax) xMax = p.x;
            if (p.z < zMin) zMin = p.z;
            if (p.z > zMax) zMax = p.z;
        }
    }
    // Edge case: tudo coincidente.
    if (!Number.isFinite(xMin) || xMin === xMax) {
        xMin = toFiniteNumber(xMin, 0) - 1;
        xMax = toFiniteNumber(xMax, 0) + 1;
    }
    if (!Number.isFinite(zMin) || zMin === zMax) {
        zMin = toFiniteNumber(zMin, 0) - 1;
        zMax = toFiniteNumber(zMax, 0) + 1;
    }
    // Padding 10%.
    const xRange = xMax - xMin;
    const zRange = zMax - zMin;
    xMin -= xRange * 0.1;
    xMax += xRange * 0.1;
    zMin -= zRange * 0.1;
    zMax += zRange * 0.1;
    const xSpan = xMax - xMin;
    const zSpan = zMax - zMin;
    const bboxArea = xSpan * zSpan;

    // ── Layout (margens e dimensões) ────────────────────────────────────────
    const padL = 56;
    const padR = showLegend ? 180 : 24;
    const padTop = 50;
    const padBottom = 70;
    const FOOTER_H = 40;

    const innerW = W - padL - padR;
    const aspect = zSpan / xSpan;
    const innerH = Math.max(200, Math.min(560, innerW * aspect));
    const H = innerH + padTop + padBottom;
    const drawX0 = padL;
    const drawX1 = padL + innerW;
    const drawY0 = padTop;
    const drawY1 = padTop + innerH;

    const mapX = (x: number) => drawX0 + ((x - xMin) / xSpan) * innerW;
    // Y do SVG cresce para baixo; z geográfico cresce para cima → inverte.
    const mapZ = (z: number) => drawY1 - ((z - zMin) / zSpan) * innerH;
    const mPerPx = xSpan / innerW;

    // ── Polígonos (ordenados por área decrescente p/ não esconder pequenos) ─
    type UnitRender = {
        unit: GeologicalUnit;
        area: number;
        color: { fill: string; label: string; order: number };
    };
    const unitsRender: UnitRender[] = cleanUnits.map((u) => ({
        unit: u,
        area: _polyArea(u.polygon),
        color: _resolveColor(u.code),
    }));
    unitsRender.sort((a, b) => b.area - a.area);

    const polyParts: string[] = [];
    const labelParts: string[] = [];
    for (const ur of unitsRender) {
        const pts: string[] = [];
        for (const v of ur.unit.polygon) {
            if (typeof v.x !== 'number' || typeof v.z !== 'number') continue;
            const px = mapX(v.x);
            const py = mapZ(v.z);
            pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
        }
        if (pts.length < 3) continue;
        polyParts.push(
            `<polygon points="${pts.join(' ')}" fill="${ur.color.fill}" fill-opacity="0.85" stroke="#222" stroke-width="0.5"/>`,
        );
        // Label do code no centroide para polígonos ≥ 20% do bbox.
        if (bboxArea > 0 && ur.area / bboxArea >= 0.2) {
            const c = _polyCentroid(ur.unit.polygon);
            const cx = mapX(c.x);
            const cy = mapZ(c.z);
            labelParts.push(
                `<text x="${cx.toFixed(1)}" y="${(cy + 3).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="bold" fill="#1a1a1a" stroke="#ffffff" stroke-width="2" paint-order="stroke">${_esc(ur.unit.code)}</text>`,
            );
        }
    }

    // ── Linhas de falha + simbologia geológica ──────────────────────────────
    const faultParts: string[] = [];
    for (const f of cleanFaults) {
        const pts: string[] = [];
        const ptsXY: Array<{ x: number; y: number }> = [];
        for (const v of f.line) {
            if (typeof v.x !== 'number' || typeof v.z !== 'number') continue;
            const px = mapX(v.x);
            const py = mapZ(v.z);
            pts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
            ptsXY.push({ x: px, y: py });
        }
        if (pts.length < 2) continue;
        faultParts.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="#000" stroke-width="1.5"/>`);

        // Símbolos por tipo de falha — desenhados nos pontos intermediários.
        const type = String(f.type || 'unknown');
        for (let i = 0; i < ptsXY.length - 1; i++) {
            const a = ptsXY[i] as { x: number; y: number };
            const b = ptsXY[i + 1] as { x: number; y: number };
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 4) continue;
            // Vetor normal (rotação 90° anti-horário) — define o lado do bloco caído.
            const nxN = -dy / len;
            const nyN = dx / len;
            if (type === 'normal') {
                // Dentes pequenos do lado do bloco caído (hachuras leves).
                const s = 5;
                faultParts.push(
                    `<line x1="${mx.toFixed(1)}" y1="${my.toFixed(1)}" x2="${(mx + nxN * s).toFixed(1)}" y2="${(my + nyN * s).toFixed(1)}" stroke="#000" stroke-width="0.9"/>`,
                );
            } else if (type === 'reverse') {
                // Triângulos pequenos do lado caval.
                const s = 5;
                const tipX = mx + nxN * s;
                const tipY = my + nyN * s;
                const baseAX = mx - (dx / len) * 2.5;
                const baseAY = my - (dy / len) * 2.5;
                const baseBX = mx + (dx / len) * 2.5;
                const baseBY = my + (dy / len) * 2.5;
                faultParts.push(
                    `<polygon points="${baseAX.toFixed(1)},${baseAY.toFixed(1)} ${baseBX.toFixed(1)},${baseBY.toFixed(1)} ${tipX.toFixed(1)},${tipY.toFixed(1)}" fill="#000" stroke="#000" stroke-width="0.5"/>`,
                );
            } else if (type === 'strike-slip') {
                // Setas opostas paralelas à direção do strike.
                const s = 4;
                const arrowAX = mx - (dx / len) * s;
                const arrowAY = my - (dy / len) * s;
                const arrowBX = mx + (dx / len) * s;
                const arrowBY = my + (dy / len) * s;
                faultParts.push(
                    `<line x1="${arrowAX.toFixed(1)}" y1="${arrowAY.toFixed(1)}" x2="${(arrowAX + nxN * 2).toFixed(1)}" y2="${(arrowAY + nyN * 2).toFixed(1)}" stroke="#000" stroke-width="0.9"/>`,
                );
                faultParts.push(
                    `<line x1="${arrowBX.toFixed(1)}" y1="${arrowBY.toFixed(1)}" x2="${(arrowBX - nxN * 2).toFixed(1)}" y2="${(arrowBY - nyN * 2).toFixed(1)}" stroke="#000" stroke-width="0.9"/>`,
                );
            }
            // unknown → só a linha (sem símbolos)
            break; // só um símbolo por falha (no segmento médio)
        }

        // Label do nome + strike/dip se presente.
        if (f.name && ptsXY.length > 0) {
            const mid = ptsXY[Math.floor(ptsXY.length / 2)] as { x: number; y: number };
            const strikeDip =
                typeof f.strike === 'number' && typeof f.dip === 'number'
                    ? ` — N${Math.round(f.strike)}°E/${Math.round(f.dip)}°`
                    : '';
            const lbl = `${f.name}${strikeDip}`;
            if (lbl.length <= 40) {
                faultParts.push(
                    `<text x="${(mid.x + 6).toFixed(1)}" y="${(mid.y - 4).toFixed(1)}" font-size="9" fill="#1a1a1a" font-weight="bold" stroke="#ffffff" stroke-width="2" paint-order="stroke">${_esc(lbl)}</text>`,
                );
            }
        }
    }

    // ── North arrow (top-right da área de desenho) ──────────────────────────
    let northArrow = '';
    if (showNorthArrow) {
        const nx = drawX1 - 16;
        const ny = drawY0 + 22;
        northArrow =
            `<g aria-label="Norte"><polygon points="${nx},${ny - 14} ${nx + 6},${ny + 4} ${nx},${ny} ${nx - 6},${ny + 4}" fill="#333"/>` +
            `<text x="${nx}" y="${ny + 18}" text-anchor="middle" font-size="11" font-weight="bold" fill="#333">N</text></g>`;
    }

    // ── Scale bar (bottom-right da área de desenho) ─────────────────────────
    let scaleBar = '';
    if (showScaleBar) {
        const scaleM = _niceScale(mPerPx, 90);
        const scalePx = scaleM / mPerPx;
        const sbX = drawX1 - scalePx - 8;
        const sbY = drawY1 + 18;
        const seg = scalePx / 4;
        scaleBar =
            `<g aria-label="Escala gráfica">` +
            `<rect x="${sbX.toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#000"/>` +
            `<rect x="${(sbX + seg).toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#fff" stroke="#000"/>` +
            `<rect x="${(sbX + seg * 2).toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#000"/>` +
            `<rect x="${(sbX + seg * 3).toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#fff" stroke="#000"/>` +
            `<text x="${sbX.toFixed(1)}" y="${sbY - 3}" font-size="9" fill="#333">0</text>` +
            `<text x="${(sbX + scalePx).toFixed(1)}" y="${sbY - 3}" text-anchor="end" font-size="9" fill="#333">${scaleM} m</text>` +
            `</g>`;
    }

    // ── Cabeçalho (titulo + datum + area km² approx) ────────────────────────
    const totalAreaM2 = unitsRender.reduce((s, u) => s + u.area, 0);
    const areaKm2 = totalAreaM2 / 1e6;
    const title = _esc(opts.title || 'Mapa geológico do entorno');
    const datum = _esc(opts.centerLabel?.datum || '');
    const headerSubtitle = datum
        ? `${datum} · ~${areaKm2.toFixed(areaKm2 >= 1 ? 1 : 3)} km²`
        : `~${areaKm2.toFixed(areaKm2 >= 1 ? 1 : 3)} km²`;
    const header =
        `<text x="${W / 2}" y="22" text-anchor="middle" font-size="13" font-weight="bold" fill="#222">${title}</text>` +
        `<text x="${W / 2}" y="40" text-anchor="middle" font-size="10" fill="#555">${headerSubtitle}</text>`;

    // ── Legenda (lado direito) ──────────────────────────────────────────────
    let legendSvg = '';
    if (showLegend) {
        // Coletar codes únicos efetivamente presentes nos polígonos.
        const presentCodes = new Map<string, { fill: string; label: string; order: number; customName?: string }>();
        for (const ur of unitsRender) {
            const code = String(ur.unit.code || '').trim() || 'UND';
            const key = Object.prototype.hasOwnProperty.call(GEO_COLORS, code) ? code : 'UND';
            if (!presentCodes.has(key)) {
                const entry: { fill: string; label: string; order: number; customName?: string } = {
                    fill: ur.color.fill,
                    label: ur.color.label,
                    order: ur.color.order,
                };
                if (ur.unit.name && ur.unit.name !== ur.color.label) {
                    entry.customName = ur.unit.name;
                }
                presentCodes.set(key, entry);
            }
        }
        // Ordem cronoestratigráfica (mais novo em cima).
        const sortedCodes = Array.from(presentCodes.entries()).sort(
            (a, b) => (a[1].order || 99) - (b[1].order || 99),
        );
        if (sortedCodes.length > 0) {
            const legX = drawX1 + 14;
            const legY = drawY0 + 6;
            const lineH = 20;
            const items: string[] = [];
            items.push(
                `<text x="${legX}" y="${legY - 2}" font-size="10" font-weight="bold" fill="#222">Legenda estratigráfica</text>`,
            );
            sortedCodes.forEach(([code, info], i) => {
                const ly = legY + 8 + i * lineH;
                items.push(
                    `<rect x="${legX}" y="${ly}" width="14" height="12" fill="${info.fill}" stroke="#222" stroke-width="0.5"/>`,
                );
                items.push(
                    `<text x="${legX + 18}" y="${ly + 9}" font-size="9" font-weight="bold" fill="#222">${_esc(code)}</text>`,
                );
                items.push(
                    `<text x="${legX + 36}" y="${ly + 9}" font-size="9" fill="#444">${_esc(info.label)}</text>`,
                );
                if (info.customName) {
                    items.push(
                        `<text x="${legX + 18}" y="${ly + 19}" font-size="8" fill="#666" font-style="italic">${_esc(info.customName)}</text>`,
                    );
                }
            });
            // Fault legend entry se houver falhas.
            if (cleanFaults.length > 0) {
                const ly = legY + 8 + sortedCodes.length * lineH;
                items.push(
                    `<line x1="${legX}" y1="${ly + 6}" x2="${legX + 14}" y2="${ly + 6}" stroke="#000" stroke-width="1.5"/>`,
                );
                items.push(
                    `<text x="${legX + 18}" y="${ly + 9}" font-size="9" fill="#222">Falha geológica</text>`,
                );
            }
            const itemCount = sortedCodes.length + (cleanFaults.length > 0 ? 1 : 0);
            const legendH = 18 + itemCount * lineH + 6;
            const legendBg = `<rect x="${legX - 4}" y="${legY - 14}" width="${(padR - 18).toFixed(0)}" height="${legendH}" fill="#ffffff" fill-opacity="0.92" stroke="#cccccc" stroke-width="0.5"/>`;
            legendSvg = legendBg + items.join('');
        }
    }

    // ── Rodapé (source/datum centralizado) ──────────────────────────────────
    const source = _esc(opts.centerLabel?.source || '');
    const footer =
        `<rect x="0" y="${H}" width="${W}" height="${FOOTER_H}" fill="#ffffff" stroke="#cccccc"/>` +
        (source
            ? `<text x="${W / 2}" y="${H + 24}" text-anchor="middle" font-size="9" fill="#888" font-style="italic">${source}</text>`
            : '');

    const totalH = H + FOOTER_H;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" font-family="sans-serif">` +
        `<rect width="${W}" height="${totalH}" fill="#f8fafc"/>` +
        header +
        polyParts.join('') +
        labelParts.join('') +
        faultParts.join('') +
        northArrow +
        scaleBar +
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

/** Conveniência: SVG do mapa geológico direto como data URL embutível. */
export function buildGeologicalMapDataUrl(
    units: GeologicalUnit[],
    faults: FaultLineament[],
    opts: GeologicalMapOpts = {},
): string {
    return _svgToDataUrl(buildGeologicalMapSvg(units, faults, opts));
}
