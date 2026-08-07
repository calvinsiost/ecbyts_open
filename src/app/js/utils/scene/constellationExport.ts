// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost

/* ================================================================
   CONSTELLATION EXPORT — PNG / SVG export utilities
   SPEC_CONSTELLATION_HUD_9_75 — Feature A (missing implementation)

   Funções puras testáveis em Node.js (SVG string generation).
   PNG export requer browser (HTMLCanvasElement.toDataURL).
   ================================================================ */

export interface ConstellationNode {
    id: string;
    x: number;
    y: number;
    family?: string;
    title?: string;
    name?: string;
    radius?: number;
    color?: string;
}

export interface ConstellationEdge {
    sourceId?: string;
    targetId?: string;
    source?: string;
    target?: string;
    sourceX?: number;
    sourceY?: number;
    targetX?: number;
    targetY?: number;
}

export interface ConstellationSize {
    width?: number;
    height?: number;
}

/**
 * Escapa caracteres especiais XML para uso seguro em atributos/conteúdo SVG.
 */
export function escapeXml(str: string): string {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Gera string SVG representando o grafo de constelação.
 * Pure function - sem DOM, testável em Node.js.
 */
export function generateConstellationSvg(
    nodes: unknown[],
    edges: unknown[],
    size: ConstellationSize = {}
): string {
    const width = size.width ?? 800;
    const height = size.height ?? 600;
    const safeNodes = Array.isArray(nodes) ? (nodes as ConstellationNode[]) : [];
    const safeEdges = Array.isArray(edges) ? (edges as ConstellationEdge[]) : [];

    // Build id → node map for edge coordinate lookup
    const nodeMap = new Map<string, ConstellationNode>();
    for (const n of safeNodes) {
        if (n && typeof n.id === 'string') nodeMap.set(n.id, n);
    }

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    svg += `  <rect width="100%" height="100%" fill="#1a1a2e"/>\n`;

    // Edges
    for (let i = 0; i < safeEdges.length; i++) {
        const e = safeEdges[i];
        if (!e) continue;
        const srcId = e.sourceId ?? e.source ?? '';
        const tgtId = e.targetId ?? e.target ?? '';
        const src = nodeMap.get(srcId);
        const tgt = nodeMap.get(tgtId);
        const x1 = e.sourceX ?? src?.x ?? 0;
        const y1 = e.sourceY ?? src?.y ?? 0;
        const x2 = e.targetX ?? tgt?.x ?? 0;
        const y2 = e.targetY ?? tgt?.y ?? 0;
        svg += `  <line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#90A4AE" stroke-width="1.5" opacity="0.6"/>\n`;
    }

    // Nodes + labels
    for (let i = 0; i < safeNodes.length; i++) {
        const n = safeNodes[i];
        if (!n) continue;
        const x = typeof n.x === 'number' ? n.x : 50 + (i % 12) * 60;
        const y = typeof n.y === 'number' ? n.y : 50 + Math.floor(i / 12) * 60;
        const r = typeof n.radius === 'number' ? n.radius : 8;
        const color = typeof n.color === 'string' ? n.color : '#4FC3F7';
        const label = n.title ?? n.name ?? '';
        svg += `  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${escapeXml(color)}" stroke="#fff" stroke-width="0.5" opacity="0.9"/>\n`;
        if (label) {
            svg += `  <text x="${x.toFixed(1)}" y="${(y + r + 13).toFixed(1)}" text-anchor="middle" font-size="10" font-family="sans-serif" fill="#E0E0E0">${escapeXml(label)}</text>\n`;
        }
    }

    svg += `</svg>`;
    return svg;
}

/**
 * Exporta o grafo de constelação como arquivo SVG via download.
 * Requer ambiente browser (Blob + URL.createObjectURL).
 */
export function exportConstellationSvg(
    nodes: unknown[],
    edges: unknown[],
    size: ConstellationSize,
    filename: string = 'constellation'
): void {
    const svgString = generateConstellationSvg(nodes, edges, size);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Exporta o canvas do renderer ativo como arquivo PNG via download.
 * Requer ambiente browser (HTMLCanvasElement.toDataURL).
 */
export function exportConstellationPng(
    canvas: HTMLCanvasElement | undefined | null,
    filename: string = 'constellation'
): void {
    if (!canvas || typeof canvas.toDataURL !== 'function') {
        console.warn('[constellationExport] canvas inválido para exportPng');
        return;
    }
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}