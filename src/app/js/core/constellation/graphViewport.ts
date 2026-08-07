// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: EHS & Mining
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

/**
 * Constellation Graph Viewport — Phase 1.62
 * Pure 2D viewport: pan, zoom, fit-to-bounds, world↔screen.
 * Zero browser/DOM/Three.js deps.
 */

export interface Viewport {
    readonly x: number;
    readonly y: number;
    readonly zoom: number;
    readonly width: number;
    readonly height: number;
}

export interface ViewportOptions {
    readonly x?: number;
    readonly y?: number;
    readonly zoom?: number;
    readonly width?: number;
    readonly height?: number;
}

export interface ScreenPoint {
    readonly sx: number;
    readonly sy: number;
}

export interface WorldPoint {
    readonly wx: number;
    readonly wy: number;
}

export interface Bounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
    readonly width: number;
    readonly height: number;
}

export interface ViewportNode {
    readonly position?: { readonly x?: number; readonly y?: number };
    readonly [k: string]: unknown;
}

export interface ViewportSummary {
    readonly zoom: number;
    readonly x: number;
    readonly y: number;
    readonly width?: number;
    readonly height?: number;
    readonly valid: boolean;
}

export const GRAPH_VIEWPORT_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.62',
    deliveredAt: '2026-05-02',
} as const);

export const ZOOM_LIMITS = Object.freeze({ min: 0.05, max: 20 } as const);

/** Cria viewport frozen. */
export function createViewport(options: ViewportOptions = {}): Viewport {
    const zoom = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, options.zoom ?? 1));
    return Object.freeze({
        x: options.x ?? 0,
        y: options.y ?? 0,
        zoom,
        width: options.width ?? 800,
        height: options.height ?? 600,
    });
}

/** Pan: desloca viewport por (dx, dy) no espaço de tela. */
export function pan(vp: Viewport | null | undefined, dx: number, dy: number): Viewport | null | undefined {
    if (!vp) return vp;
    return Object.freeze({ ...vp, x: vp.x + (dx || 0), y: vp.y + (dy || 0) });
}

/** Zoom: aplica fator de zoom centrado em (cx, cy) no espaço de tela. */
export function zoom(
    vp: Viewport | null | undefined,
    factor: number,
    cx?: number,
    cy?: number,
): Viewport | null | undefined {
    if (!vp || !factor || factor <= 0) return vp;
    const newZoom = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, vp.zoom * factor));
    const centerX = cx ?? vp.width / 2;
    const centerY = cy ?? vp.height / 2;
    const worldX = (centerX - vp.x) / vp.zoom;
    const worldY = (centerY - vp.y) / vp.zoom;
    const newX = centerX - worldX * newZoom;
    const newY = centerY - worldY * newZoom;
    return Object.freeze({ ...vp, zoom: newZoom, x: newX, y: newY });
}

/** Converte coordenada de mundo para tela. */
export function worldToScreen(vp: Viewport | null | undefined, wx: number, wy: number): ScreenPoint {
    if (!vp) return Object.freeze({ sx: 0, sy: 0 });
    return Object.freeze({
        sx: wx * vp.zoom + vp.x,
        sy: wy * vp.zoom + vp.y,
    });
}

/** Converte coordenada de tela para mundo. */
export function screenToWorld(vp: Viewport | null | undefined, sx: number, sy: number): WorldPoint {
    if (!vp || !vp.zoom) return Object.freeze({ wx: 0, wy: 0 });
    return Object.freeze({
        wx: (sx - vp.x) / vp.zoom,
        wy: (sy - vp.y) / vp.zoom,
    });
}

/** Computa bounding box de um conjunto de nodes com posições. */
export function computeBounds(nodes: ReadonlyArray<ViewportNode> | null | undefined): Bounds | null {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    const pts = nodes.filter(
        (n): n is ViewportNode & { position: { x: number; y: number } } =>
            !!n?.position && typeof n.position.x === 'number' && typeof n.position.y === 'number',
    );
    if (pts.length === 0) return null;
    const xs = pts.map((n) => n.position.x);
    const ys = pts.map((n) => n.position.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return Object.freeze({ minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY });
}

/** Ajusta viewport para exibir todos os nodes com padding. */
export function fitToBounds(
    vp: Viewport | null | undefined,
    nodes: ReadonlyArray<ViewportNode> | null | undefined,
    padding: number = 40,
): Viewport | null | undefined {
    if (!vp) return vp;
    const bounds = computeBounds(nodes);
    if (!bounds) return vp;
    const availW = vp.width - padding * 2;
    const availH = vp.height - padding * 2;
    const bw = bounds.width || 1;
    const bh = bounds.height || 1;
    const newZoom = Math.max(ZOOM_LIMITS.min, Math.min(ZOOM_LIMITS.max, Math.min(availW / bw, availH / bh)));
    const centerWorldX = (bounds.minX + bounds.maxX) / 2;
    const centerWorldY = (bounds.minY + bounds.maxY) / 2;
    const newX = vp.width / 2 - centerWorldX * newZoom;
    const newY = vp.height / 2 - centerWorldY * newZoom;
    return Object.freeze({ ...vp, zoom: newZoom, x: newX, y: newY });
}

/** Verifica se um ponto de mundo está visível no viewport. */
export function isVisible(vp: Viewport | null | undefined, wx: number, wy: number): boolean {
    if (!vp) return false;
    const { sx, sy } = worldToScreen(vp, wx, wy);
    return sx >= 0 && sx <= vp.width && sy >= 0 && sy <= vp.height;
}

/** Reseta viewport para origem com zoom 1. */
export function resetViewport(vp: Viewport | null | undefined): Viewport {
    if (!vp) return createViewport();
    return Object.freeze({ ...vp, x: 0, y: 0, zoom: 1 });
}

/** Sumariza viewport. */
export function summarizeViewport(vp: Viewport | null | undefined): ViewportSummary {
    if (!vp) return Object.freeze({ zoom: 0, x: 0, y: 0, valid: false });
    return Object.freeze({
        zoom: vp.zoom,
        x: vp.x,
        y: vp.y,
        width: vp.width,
        height: vp.height,
        valid: true,
    });
}

export const graphViewportMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.62',
    deliveredAt: '2026-05-02',
    exports: [
        'GRAPH_VIEWPORT_META',
        'ZOOM_LIMITS',
        'createViewport',
        'pan',
        'zoom',
        'worldToScreen',
        'screenToWorld',
        'computeBounds',
        'fitToBounds',
        'isVisible',
        'resetViewport',
        'summarizeViewport',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const);
