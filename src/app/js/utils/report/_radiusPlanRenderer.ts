// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
/* global Buffer */
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// Renderer pure (SVG) do plano do raio de 500 m do GAC (CETESB DD 038/2017, Cap. 4
// Fase I — uso e ocupação do solo + bens a proteger no entorno). Desenha o centro da
// área + círculo do raio R + os elementos do entorno por família, em vista de planta
// (plano x/z). Embutível como figura de relatório via data:image/svg+xml. Sem DOM/canvas
// (cheap-testável). A imagem é gerada PELO próprio ecbyts a partir do modelo carregado.
import { distanceRelMeters, getActiveBufferRadiusM } from '../../core/io/geo/radiusBuffer.js';

/** Cores por família (consistente com a simbologia do app). */
const FAMILY_COLORS: Record<string, string> = {
    well: '#2980b9',
    plume: '#c0392b',
    lake: '#16a085',
    river: '#16a085',
    spring: '#16a085',
    building: '#7f8c8d',
    tank: '#e67e22',
    waste_stream: '#9b59b6',
    boundary: '#34495e',
    dam: '#8e44ad',
    pit: '#795548',
    sensor: '#f39c12',
};

/** Extrai a posição relativa de um elemento ({x,z}), tolerando `position` e `data.position`. */
function _pos(el: any): { x: number; z: number } | null {
    const p = el?.position || el?.data?.position;
    if (!p || typeof p !== 'object') return null;
    if (typeof p.x !== 'number' || typeof p.z !== 'number') return null;
    return { x: p.x, z: p.z };
}

function _esc(s: unknown): string {
    return String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function _centroid(pts: Array<{ x: number; z: number }>): { x: number; z: number } | null {
    if (!pts.length) return null;
    const s = pts.reduce((a, p) => ({ x: a.x + p.x, z: a.z + p.z }), { x: 0, z: 0 });
    return { x: s.x / pts.length, z: s.z / pts.length };
}

export type RadiusPlanOpts = {
    radiusM?: number;
    /** Raio EXTERNO de contexto (default = 2 × radiusM). Espelha a Figura 1 dos relatórios CETESB reais (R=500 m + R=1000 m). */
    radiusOuterM?: number;
    size?: number;
    title?: string;
    /**
     * Elementos da família `blueprint` (DXF/CAD importado em `core/spatial/`) — a
     * cartografia REAL surveyada. Cada elemento traz `position` (scene coords m) e
     * `data.vertices` (Array<{x,z}> relativo ao centroide do próprio blueprint).
     * Renderizados como polígono semi-transparente entre o basemap e os círculos.
     * RF cartografia from-blueprint (Calvin 2026-05-29).
     */
    blueprintElements?: any[];
    /** Metadados cartográficos opcionais — impressos no rodapé da prancha. */
    centerLabel?: {
        /** Coordenadas UTM da área (ex: "337.997,55 mE / 7.388.866,82 mN — 23S"). */
        utm?: string;
        /** Datum (ex: "SIRGAS 2000 / UTM 23S"). */
        datum?: string;
        /** Fonte cartográfica (ex: "Modelo ecbyts — coordenadas relativas"). */
        source?: string;
    };
    /**
     * Basemap aerofotogramétrico/satélite top-down (Fase 1.7 — RF-1.7b).
     * data URI `image/png|jpeg|webp;base64`. Aceito apenas neste allowlist (XSS).
     * Quando fornecido, é embutido por baixo do raio e dos elementos; caso contrário
     * a figura cai no fundo sintético (degradação graciosa — RF-1.7d).
     */
    basemapDataUrl?: string;
};

/** Allowlist conservadora p/ basemap (mesma família do sanitizeImageSrc). */
function _isValidBasemap(s: unknown): s is string {
    return typeof s === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/.test(s);
}

/**
 * Renderiza polígonos dos blueprints (DXF/CAD) como cartografia base. Pure.
 * Cada blueprint contribui um <polygon> em coordenadas SVG (world → relativo ao
 * centro do raio → px). Coords world do vértice = bpPos + vértice local.
 */
function _renderBlueprintCartography(
    bps: any[],
    cx: number,
    cy: number,
    center: { x: number; z: number },
    mPerPx: number,
): { svg: string; count: number; names: string[] } {
    const paths: string[] = [];
    const names: string[] = [];
    let count = 0;
    for (const bp of bps || []) {
        const bpPos = bp?.position || bp?.data?.position;
        if (!bpPos || typeof bpPos.x !== 'number' || typeof bpPos.z !== 'number') continue;
        const verts: any[] = Array.isArray(bp?.data?.vertices) ? bp.data.vertices : [];
        if (verts.length < 3) continue;
        const pts: string[] = [];
        for (const v of verts) {
            if (typeof v?.x !== 'number' || typeof v?.z !== 'number') continue;
            const wx = bpPos.x + v.x;
            const wz = bpPos.z + v.z;
            const px = cx + (wx - center.x) / mPerPx;
            const pz = cy + (wz - center.z) / mPerPx;
            pts.push(`${px.toFixed(1)},${pz.toFixed(1)}`);
        }
        if (pts.length >= 3) {
            paths.push(
                `<polygon points="${pts.join(' ')}" fill="#e6e3d3" fill-opacity="0.55" stroke="#3d3a2e" stroke-width="0.7"/>`,
            );
            count++;
            if (bp?.name) names.push(String(bp.name));
        }
    }
    return { svg: `<g aria-label="Cartografia blueprint">${paths.join('')}</g>`, count, names };
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
 * Constrói o SVG (string) do plano do raio. Pure — sem efeitos colaterais.
 * Inclui (espelhando Figura 1 dos relatórios CETESB reais): círculo R + círculo externo
 * R_outer de contexto, seta Norte, escala gráfica e rodapé com datum/UTM/fonte.
 * @param elements elementos do modelo (com position ou data.position)
 * @returns SVG string (>= placeholder se não houver elementos georreferenciados)
 */
export function buildRadiusPlanSvg(elements: any[], opts: RadiusPlanOpts = {}): string {
    // TRUST-010 W11 adoption: caller pode passar opts.radiusM explícito; sem isso,
    // usa framework regulatório ativo (default CETESB 500m backward compat).
    const radiusM = typeof opts.radiusM === 'number' && opts.radiusM > 0 ? opts.radiusM : getActiveBufferRadiusM();
    const radiusOuterM =
        typeof opts.radiusOuterM === 'number' && opts.radiusOuterM > radiusM ? opts.radiusOuterM : radiusM * 2;
    const S = typeof opts.size === 'number' && opts.size >= 200 ? Math.floor(opts.size) : 480;
    const els = (Array.isArray(elements) ? elements : []).filter((e) => _pos(e));
    const center = _centroid(els.map((e) => _pos(e) as { x: number; z: number }));
    if (!center) {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="90" viewBox="0 0 ${S} 90" font-family="sans-serif">` +
            `<rect width="${S}" height="90" fill="#f8fafc"/>` +
            `<text x="${S / 2}" y="50" text-anchor="middle" font-size="13" fill="#555">Sem elementos georreferenciados para o raio de ${radiusM} m</text></svg>`
        );
    }
    const margin = 56;
    const FOOTER_H = 50; // rodapé com título + datum/UTM + fonte
    const cx = S / 2;
    const cy = S / 2;
    const outerR = S / 2 - margin; // outer (1000 m) ocupa o canvas
    const mPerPx = radiusOuterM / outerR; // metros por pixel — escala pelo outer
    const innerR = outerR * (radiusM / radiusOuterM); // inner (500 m) proporcional
    const dots: string[] = [];
    const counts: Record<string, number> = {};
    const filterRadiusM = radiusOuterM * 1.05;
    for (const el of els) {
        const p = _pos(el) as { x: number; z: number };
        const dM = distanceRelMeters({ x: center.x, z: center.z }, { x: p.x, z: p.z });
        if (dM > filterRadiusM) continue;
        const px = cx + (p.x - center.x) / mPerPx;
        const pz = cy + (p.z - center.z) / mPerPx;
        const fam = String(el?.family || 'generic');
        const color = FAMILY_COLORS[fam] || '#555';
        const within = dM <= radiusM;
        if (within) counts[fam] = (counts[fam] || 0) + 1;
        const r = fam === 'plume' ? 7 : 4;
        dots.push(
            `<circle cx="${px.toFixed(1)}" cy="${pz.toFixed(1)}" r="${r}" fill="${color}" fill-opacity="${within ? '0.85' : '0.3'}" stroke="#ffffff" stroke-width="0.8"/>`,
        );
        // Rótulos: famílias instrumentais (poço, sensor) e plumas — só dentro do raio
        // R, para evitar polução visual no entorno. Usa el.name||el.id; halo branco
        // (paint-order=stroke) para legibilidade sobre o basemap.
        if (within && (fam === 'well' || fam === 'sensor' || fam === 'plume')) {
            const lbl = String(el?.name || el?.id || '').trim();
            if (lbl && lbl.length <= 16) {
                dots.push(
                    `<text x="${(px + r + 2).toFixed(1)}" y="${(pz + 3).toFixed(1)}" font-size="9" fill="#1a1a1a" font-weight="bold" stroke="#ffffff" stroke-width="2" paint-order="stroke">${_esc(lbl)}</text>`,
                );
            }
        }
    }
    const legend = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([fam, n], i) => {
            const ly = 18 + i * 16;
            return (
                `<circle cx="14" cy="${ly}" r="5" fill="${FAMILY_COLORS[fam] || '#555'}"/>` +
                `<text x="24" y="${ly + 4}" font-size="11" fill="#222">${_esc(fam)} (${n})</text>`
            );
        })
        .join('');
    const title = _esc(opts.title || `Entorno — raio de ${radiusM} m (GAC, CETESB DD 038/2017)`);
    // Seta Norte (top-right, dentro da área de desenho).
    const nx = S - 30;
    const ny = 30;
    const northArrow =
        `<g aria-label="Norte"><polygon points="${nx},${ny - 14} ${nx + 6},${ny + 4} ${nx},${ny} ${nx - 6},${ny + 4}" fill="#333"/>` +
        `<text x="${nx}" y="${ny + 22}" text-anchor="middle" font-size="11" font-weight="bold" fill="#333">N</text></g>`;
    // Escala gráfica (bottom-right da área de desenho).
    const scaleM = _niceScale(mPerPx, 90);
    const scalePx = scaleM / mPerPx;
    const sbX = S - 20 - scalePx;
    const sbY = S - 20;
    const seg = scalePx / 4;
    const scaleBar =
        `<g aria-label="Escala gráfica">` +
        `<rect x="${sbX}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#000"/>` +
        `<rect x="${(sbX + seg).toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#fff" stroke="#000"/>` +
        `<rect x="${(sbX + seg * 2).toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#000"/>` +
        `<rect x="${(sbX + seg * 3).toFixed(1)}" y="${sbY}" width="${seg.toFixed(1)}" height="6" fill="#fff" stroke="#000"/>` +
        `<text x="${sbX}" y="${sbY - 3}" font-size="9" fill="#333">0</text>` +
        `<text x="${sbX + scalePx}" y="${sbY - 3}" text-anchor="end" font-size="9" fill="#333">${scaleM} m</text>` +
        `</g>`;
    // Rodapé com título + datum/UTM + fonte.
    const utm = _esc(opts.centerLabel?.utm || '');
    const datum = _esc(opts.centerLabel?.datum || '');
    const source = _esc(opts.centerLabel?.source || '');
    const footerY1 = S + 14;
    const footerY2 = S + 28;
    const footerY3 = S + 42;
    const datumLine = utm || datum ? `${utm}${utm && datum ? ' · ' : ''}${datum}` : '';
    const footer =
        `<rect x="0" y="${S}" width="${S}" height="${FOOTER_H}" fill="#ffffff" stroke="#cccccc"/>` +
        `<text x="${S / 2}" y="${footerY1}" text-anchor="middle" font-size="11" fill="#222" font-weight="bold">${title}</text>` +
        (datumLine ? `<text x="${S / 2}" y="${footerY2}" text-anchor="middle" font-size="10" fill="#555">${datumLine}</text>` : '') +
        (source ? `<text x="${S / 2}" y="${footerY3}" text-anchor="middle" font-size="9" fill="#888" font-style="italic">${source}</text>` : '');
    const totalH = S + FOOTER_H;
    // Basemap top-down (Fase 1.7) — embutido entre o fundo e os círculos. Quando
    // presente, reduz a opacidade dos preenchimentos dos círculos p/ deixá-lo visível.
    const basemap = _isValidBasemap(opts.basemapDataUrl) ? opts.basemapDataUrl : null;
    const basemapImg = basemap
        ? `<image x="0" y="0" width="${S}" height="${S}" href="${basemap}" preserveAspectRatio="xMidYMid slice"/>`
        : '';
    // Cartografia blueprint (DXF/CAD) — between basemap e círculos. Calvin diretiva
    // 2026-05-29: cartografia SEMPRE do blueprint (não SVG sintético).
    const bpCart = Array.isArray(opts.blueprintElements) && opts.blueprintElements.length > 0
        ? _renderBlueprintCartography(opts.blueprintElements, cx, cy, center, mPerPx)
        : { svg: '', count: 0, names: [] };
    const hasCartography = !!basemap || bpCart.count > 0;
    const outerFillOp = hasCartography ? '0.15' : '0.6';
    const innerFillOp = hasCartography ? '0.12' : '0.5';
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${totalH}" viewBox="0 0 ${S} ${totalH}" font-family="sans-serif">` +
        `<rect width="${S}" height="${totalH}" fill="#f8fafc"/>` +
        basemapImg +
        bpCart.svg +
        // outer (contexto, R=1000 m default)
        `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="#f0f4f8" fill-opacity="${outerFillOp}" stroke="#7f8c8d" stroke-width="1" stroke-dasharray="4 6"/>` +
        // inner (R=500 m GAC)
        `<circle cx="${cx}" cy="${cy}" r="${innerR}" fill="#e8f4ff" fill-opacity="${innerFillOp}" stroke="#2980b9" stroke-width="1.5" stroke-dasharray="6 4"/>` +
        dots.join('') +
        `<circle cx="${cx}" cy="${cy}" r="4" fill="#000000"/>` +
        `<text x="${cx + 8}" y="${cy - 6}" font-size="11" fill="#000000">centro da área</text>` +
        `<text x="${cx}" y="${cy + innerR + 14}" text-anchor="middle" font-size="11" fill="#2980b9" font-weight="bold">raio de ${radiusM} m</text>` +
        `<text x="${cx}" y="${cy + outerR + 14}" text-anchor="middle" font-size="10" fill="#7f8c8d">contexto ${radiusOuterM} m</text>` +
        northArrow +
        scaleBar +
        legend +
        footer +
        `</svg>`
    );
}

/**
 * Converte um SVG string em data URL base64 — formato aceito por sanitizeImageSrc
 * (allowlist exige `data:image/svg+xml;base64,...`). UTF-8 safe, cross-env (node+browser).
 */
export function svgToDataUrl(svg: string): string {
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

/** Conveniência: SVG do raio direto como data URL embutível. */
export function buildRadiusPlanDataUrl(elements: any[], opts: RadiusPlanOpts = {}): string {
    return svgToDataUrl(buildRadiusPlanSvg(elements, opts));
}
