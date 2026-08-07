// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Authorship: Calvin Stefan Iost

/* ================================================================
   CONSTELLATION IMAGE EXPORT (SVG / PNG)
   Spec: docs/specs/features/SPEC_CONSTELLATION_HUD_9_75.md §2.1 (Missing:
   "Export PNG/SVG")

   serializeConstellationSVG: função PURA — produz uma string SVG 1.1
   bem-formada a partir de nós, arestas e um Map de posições. Sem DOM.
   Rótulos de nós são escapados (XSS / well-formed XML) via escapeHtml
   local (entidades XML seguras: & < > " ').

   constellationToPNGDataURL: caminho BROWSER-ONLY — depende de
   Image/OffscreenCanvas. Guardado com typeof checks; em ambiente sem
   DOM (Node) rejeita com mensagem actionable em vez de crashar.

   Engine-agnostic: nenhuma dependência de Three.js.
   ================================================================ */

/** Identidade do módulo. */
export const CONSTELLATION_EXPORT_META = Object.freeze({
    spec: 'CONSTELLATION_HUD_9_75',
    deliveredAt: '2026-05-15',
});

/** Defaults para serializeConstellationSVG. */
export const DEFAULT_SVG_OPTIONS = Object.freeze({
    width: 800,
    height: 600,
    padding: 24,
    background: '#0b0e14',
    edgeColor: '#3a4660',
    edgeWidth: 1,
    nodeColor: '#5b8def',
    nodeRadius: 6,
    labelColor: '#cfd8e3',
    labelFontSize: 11,
    showLabels: true,
    title: 'ECBT Constellation',
});

export type SvgOptions = Partial<typeof DEFAULT_SVG_OPTIONS>;

/**
 * Escapa texto para uso seguro em conteúdo/atributos XML/SVG.
 * Previne XSS e garante XML bem-formado. Não depende de DOM.
 *
 * @param {any} text
 * @returns {string}
 */
export function escapeHtml(text: any) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function num(/** @type {any} */ v: any, /** @type {number} */ fallback: any) {
    return typeof v === 'number' && isFinite(v) ? v : fallback;
}

function toArray(/** @type {any} */ x: any) {
    if (!x) return [];
    if (Array.isArray(x)) return x;
    if (x instanceof Set) return Array.from(x);
    return [];
}

function getPos(/** @type {any} */ positions: any, /** @type {any} */ id: any) {
    if (positions instanceof Map) return positions.get(id);
    if (positions && typeof positions === 'object') return positions[id];
    return undefined;
}

function buildSvgHeader(width: number, height: number, title: string): string[] {
    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
            `viewBox="0 0 ${width} ${height}" role="img" ` +
            `aria-label="${escapeHtml(title)}">`,
        `<title>${escapeHtml(title)}</title>`,
    ];
}

function buildBackgroundRect(width: number, height: number, background: string): string {
    return `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeHtml(background)}"/>`;
}

function renderEdgeLine(e: any, positions: any): string | null {
    if (!e) return null;
    const s = e.sourceId ?? e.source;
    const t = e.targetId ?? e.target;
    const ps = getPos(positions, s);
    const pt = getPos(positions, t);
    if (!ps || !pt) return null;
    return `<line x1="${num(ps.x, 0)}" y1="${num(ps.y, 0)}" ` + `x2="${num(pt.x, 0)}" y2="${num(pt.y, 0)}"/>`;
}

function renderEdges(eList: any[], positions: any, edgeColor: string, edgeWidth: number): string[] {
    const parts: string[] = [`<g stroke="${escapeHtml(edgeColor)}" stroke-width="${num(edgeWidth, 1)}">`];
    for (const e of eList) {
        const line = renderEdgeLine(e, positions);
        if (line) parts.push(line);
    }
    parts.push(`</g>`);
    return parts;
}

function renderNodeLabel(cx: number, cy: number, r: number, nd: any, cfg: typeof DEFAULT_SVG_OPTIONS): string | null {
    if (!cfg.showLabels) return null;
    const label = nd.label ?? nd.name ?? nd.id;
    return (
        `<text x="${cx + r + 3}" y="${cy + 4}" ` +
        `font-size="${num(cfg.labelFontSize, 11)}" ` +
        `fill="${escapeHtml(cfg.labelColor)}">${escapeHtml(label)}</text>`
    );
}

function renderNode(nd: any, positions: any, cfg: typeof DEFAULT_SVG_OPTIONS): string[] {
    if (!nd || typeof nd.id !== 'string') return [];
    const p = getPos(positions, nd.id);
    if (!p) return [];
    const cx = num(p.x, 0);
    const cy = num(p.y, 0);
    const r = num(nd.radius, cfg.nodeRadius);
    const fill = typeof nd.color === 'string' && nd.color ? nd.color : cfg.nodeColor;
    const parts: string[] = [`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${escapeHtml(fill)}"/>`];
    const label = renderNodeLabel(cx, cy, r, nd, cfg);
    if (label) parts.push(label);
    return parts;
}

function renderNodes(nList: any[], positions: any, cfg: typeof DEFAULT_SVG_OPTIONS): string[] {
    const parts: string[] = [`<g>`];
    for (const nd of nList) {
        parts.push(...renderNode(nd, positions, cfg));
    }
    parts.push(`</g>`);
    return parts;
}

/**
 * Serializa o grafo da constelação como uma string SVG bem-formada.
 * PURA — sem DOM. Coordenadas vêm do Map `positions`.
 *
 * @param {any} nodes Array de `{ id: string, label?, name?, color?, radius? }`
 * @param {any} edges Array de `{ source, target }` ou `{ sourceId, targetId }`
 * @param {any} positions Map<id,{x,y}> (ou objeto plano id->{x,y})
 * @param {any} [opts] ver DEFAULT_SVG_OPTIONS
 * @returns {string} documento SVG completo
 */
export function serializeConstellationSVG(nodes: any, edges: any, positions: any, opts: SvgOptions = {}) {
    const cfg = { ...DEFAULT_SVG_OPTIONS, ...opts };
    const nList = toArray(nodes);
    const eList = toArray(edges);

    const width = num(cfg.width, 800);
    const height = num(cfg.height, 600);

    /** @type {string[]} */
    const parts: string[] = [];
    parts.push(...buildSvgHeader(width, height, cfg.title));
    parts.push(buildBackgroundRect(width, height, cfg.background));

    // Arestas primeiro (ficam atrás dos nós).
    parts.push(...renderEdges(eList, positions, cfg.edgeColor, cfg.edgeWidth));

    // Nós.
    parts.push(...renderNodes(nList, positions, cfg));
    parts.push(`</svg>`);

    return parts.join('\n');
}

/**
 * Converte uma string SVG em um data URL PNG.
 *
 * CAMINHO BROWSER-ONLY: usa `Image`/`OffscreenCanvas` (ou `<canvas>`).
 * Em Node ou ambiente sem DOM, rejeita com erro actionable em vez de
 * lançar ReferenceError — quem chama deve usar `serializeConstellationSVG`
 * diretamente e salvar como `.svg`.
 *
 * @param {string} svgString saída de serializeConstellationSVG
 * @param {{ width?: number, height?: number, type?: string, quality?: number }} [opts]
 * @returns {Promise<string>} data URL (image/png)
 */
export function constellationToPNGDataURL(svgString: any, opts: { width?: number; height?: number; type?: string; quality?: number } = {}) {
    if (typeof svgString !== 'string' || svgString.length === 0) {
        return Promise.reject(new Error('constellationToPNGDataURL: svgString vazio'));
    }
    const hasImage = typeof Image !== 'undefined';
    const hasOffscreen = typeof OffscreenCanvas !== 'undefined';
    const hasDocument = typeof document !== 'undefined' && typeof document.createElement === 'function';
    if (!hasImage || (!hasOffscreen && !hasDocument)) {
        return Promise.reject(
            new Error(
                'constellationToPNGDataURL: caminho browser-only (Image/Canvas indisponível). ' +
                    'Em ambiente sem DOM use serializeConstellationSVG e salve como .svg.',
            ),
        );
    }

    const width = num(opts.width, 800);
    const height = num(opts.height, 600);
    const mime = typeof opts.type === 'string' ? opts.type : 'image/png';

    return new Promise((resolve, reject) => {
        try {
            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);
            const img = new Image();
            img.onload = () => {
                try {
                    /** @type {any} */
                    let canvas: any;
                    if (hasOffscreen) {
                        canvas = new OffscreenCanvas(width, height);
                    } else {
                        canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                    }
                    const ctx = canvas.getContext('2d');
                    ctx!.drawImage(img, 0, 0, width, height);
                    URL.revokeObjectURL(url);
                    if (typeof canvas.toDataURL === 'function') {
                        resolve(canvas.toDataURL(mime, opts.quality));
                        return;
                    }
                    // OffscreenCanvas: convertToBlob -> FileReader -> dataURL
                    canvas
                        .convertToBlob({ type: mime, quality: opts.quality })
                        .then((/** @type {any} */ blob: any) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(String(reader.result));
                            reader.onerror = () => reject(new Error('PNG FileReader falhou'));
                            reader.readAsDataURL(blob);
                        })
                        .catch(reject);
                } catch (err) {
                    URL.revokeObjectURL(url);
                    reject(err instanceof Error ? err : new Error(String(err)));
                }
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('constellationToPNGDataURL: falha ao carregar SVG'));
            };
            img.src = url;
        } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}
