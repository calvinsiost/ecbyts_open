// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Minimap - Phase 1.27 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S27
 *
 * Phase 1.27 (2026-05-01) - pure-logic minimap viewport calculation
 * para navegação em grafos grandes. Mapeia world bounds → minimap
 * coords e calcula viewport rectangle.
 *
 * Estratégia:
 *   - computeWorldBounds: AABB de todos os nodes
 *   - worldToMinimap: world coord → minimap pixel
 *   - minimapToWorld: minimap pixel → world coord
 *   - computeViewportRect: camera viewport como rect no minimap
 *   - computeNodePositions: clusterizado para LOD
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Default config canônica. */
export const DEFAULT_CONFIG = Object.freeze({
    minimapWidth: 200,
    minimapHeight: 150,
    padding: 10,
    viewportColor: '#88ccff',
    nodeColor: '#bbbbbb',
});

/** Identidade do módulo. */
export const MINIMAP_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.27',
    deliveredAt: '2026-05-01',
});

/**
 * Computa bounding box AABB de nodes.
 *
 * @param {Array<{x:number, y:number}>} nodes
 * @returns {{minX:number, minY:number, maxX:number, maxY:number, width:number, height:number}|null}
 */
export function computeWorldBounds(nodes: Array<{x:number, y:number}>): {minX:number, minY:number, maxX:number, maxY:number, width:number, height:number}|null {
    if (!Array.isArray(nodes) || nodes.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let count = 0;
    for (const n of nodes) {
        if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
        count++;
    }
    if (count === 0) return null;
    return Object.freeze({
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    });
}

/**
 * Calcula scale para fit world em minimap.
 *
 * @param {Record<string, any>} bounds
 * @param {number} any>
 * @param {number} mapW
 * @param {number} mapH
 * @returns {{scaleX:number, scaleY:number, scale:number, offsetX:number, offsetY:number}}
 */
export function computeFitScale(bounds: Record<string, any>, mapW: number, mapH: number, padding: number = 0): {scaleX:number, scaleY:number, scale:number, offsetX:number, offsetY:number} {
    if (!bounds || !Number.isFinite(mapW) || !Number.isFinite(mapH)) {
        return Object.freeze({ scaleX: 1, scaleY: 1, scale: 1, offsetX: 0, offsetY: 0 });
    }
    const usableW = Math.max(1, mapW - padding * 2);
    const usableH = Math.max(1, mapH - padding * 2);
    const w = bounds.width || 1;
    const h = bounds.height || 1;
    const scaleX = usableW / w;
    const scaleY = usableH / h;
    const scale = Math.min(scaleX, scaleY);
    // Center: offset = padding + (usable - world*scale) / 2
    const offsetX = padding + (usableW - w * scale) / 2;
    const offsetY = padding + (usableH - h * scale) / 2;
    return Object.freeze({ scaleX, scaleY, scale, offsetX, offsetY });
}

/**
 * Converte world coord → minimap pixel.
 *
 * @param {{x:number, y:number}} point
 * @param {Record<string, any>} bounds
 * @param {Record<string, any>} fit
 * @returns {{x:number, y:number}}
 */
export function worldToMinimap(point: {x:number, y:number}, bounds: Record<string, any>, fit: Record<string, any>): {x:number, y:number} {
    if (!point || !bounds || !fit) return { x: 0, y: 0 };
    return Object.freeze({
        x: (point.x - bounds.minX) * fit.scale + fit.offsetX,
        y: (point.y - bounds.minY) * fit.scale + fit.offsetY,
    });
}

/**
 * Converte minimap pixel → world coord.
 *
 * @param {{x:number, y:number}} point
 * @param {Record<string, any>} bounds
 * @param {Record<string, any>} fit
 * @returns {{x:number, y:number}}
 */
export function minimapToWorld(point: {x:number, y:number}, bounds: Record<string, any>, fit: Record<string, any>): {x:number, y:number} {
    if (!point || !bounds || !fit) return { x: 0, y: 0 };
    if (fit.scale === 0) return { x: 0, y: 0 };
    return Object.freeze({
        x: (point.x - fit.offsetX) / fit.scale + bounds.minX,
        y: (point.y - fit.offsetY) / fit.scale + bounds.minY,
    });
}

/**
 * Computa viewport rect no minimap.
 *
 * @param {{x:number, y:number, width:number, height:number}} viewport (world coords)
 * @param {Record<string, any>} bounds
 * @param {Record<string, any>} fit
 * @returns {{x:number, y:number, width:number, height:number}}
 */
export function computeViewportRect(viewport: {x:number, y:number, width:number, height:number}, bounds: Record<string, any>, fit: Record<string, any>): {x:number, y:number, width:number, height:number} {
    if (!viewport || !bounds || !fit) {
        return Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
    }
    const tl = worldToMinimap({ x: viewport.x, y: viewport.y }, bounds, fit);
    return Object.freeze({
        x: tl.x,
        y: tl.y,
        width: (viewport.width || 0) * fit.scale,
        height: (viewport.height || 0) * fit.scale,
    });
}

/**
 * Computa todas as posições de nodes no minimap.
 *
 * @param {Array<{x:number, y:number, id?:string}>} nodes
 * @param {any} bounds
 * @param {any} fit
 * @returns {Array<{id:any, x:number, y:number}>}
 */
export function computeNodePositions(nodes: Array<{x:number, y:number, id?:string}>, bounds: any, fit: any): Array<{id:any, x:number, y:number}> {
    if (!Array.isArray(nodes) || !bounds || !fit) return [];
        const out: any[]= [];
    for (const n of nodes) {
        if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
        const p = worldToMinimap({ x: n.x, y: n.y }, bounds, fit);
        out.push(Object.freeze({ id: n.id || null, x: p.x, y: p.y }));
    }
    return (Object.freeze(out) as any);
}

/**
 * Verifica se ponto está dentro do viewport rect.
 */
export function isPointInRect( point: any, rect: any) {
    if (!point || !rect) return false;
    return (
        point.x >= rect.x &&
        point.x <= rect.x + (rect.width || 0) &&
        point.y >= rect.y &&
        point.y <= rect.y + (rect.height || 0)
    );
}

/**
 * Clamp viewport rect within minimap bounds.
 *
 * @param {Record<string, any>} rect
 * @param {number} any>
 * @param {number} mapW
 * @returns {Object}
 */
export function clampRect(rect: Record<string, any>, mapW: number, mapH: number): Object {
    if (!rect) return Object.freeze({ x: 0, y: 0, width: 0, height: 0 });
    const w = Math.max(0, Math.min(rect.width || 0, mapW || 0));
    const h = Math.max(0, Math.min(rect.height || 0, mapH || 0));
    const x = Math.max(0, Math.min(rect.x || 0, (mapW || 0) - w));
    const y = Math.max(0, Math.min(rect.y || 0, (mapH || 0) - h));
    return Object.freeze({ x, y, width: w, height: h });
}

/**
 * Constrói minimap state completo.
 *
 * @param {Array<{x:number, y:number}>} nodes
 * @param {any} viewport (world coords)
 * @param {any} [config]
 * @returns {any}
 */
export function buildMinimap(nodes: Array<{x:number, y:number}>, viewport: any, config: any = {}): any {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const bounds = computeWorldBounds(nodes);
    if (!bounds) {
        return Object.freeze({
            bounds: null,
            fit: null,
            nodePositions: [],
            viewportRect: null,
            config: cfg,
        });
    }
    const fit = computeFitScale(bounds, cfg.minimapWidth, cfg.minimapHeight, cfg.padding);
    const nodePositions = computeNodePositions(nodes, bounds, fit);
    const viewportRect = viewport ? computeViewportRect(viewport, bounds, fit) : null;
    return Object.freeze({
        bounds,
        fit,
        nodePositions,
        viewportRect,
        config: Object.freeze({ ...cfg }),
    });
}

/**
 * Sumariza minimap state.
 */
export function summarizeMinimap( state: any) {
    const empty = { hasNodes: false, hasViewport: false, nodeCount: 0, scale: 0 };
    if (!state) return empty;
    return Object.freeze({
        hasNodes: !!state.bounds,
        hasViewport: !!state.viewportRect,
        nodeCount: Array.isArray(state.nodePositions) ? state.nodePositions.length : 0,
        scale: state.fit?.scale || 0,
    });
}

/**
 * Module identity export.
 */
export const minimapMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.27',
    deliveredAt: '2026-05-01',
    exports: [
        'DEFAULT_CONFIG',
        'MINIMAP_META',
        'computeWorldBounds',
        'computeFitScale',
        'worldToMinimap',
        'minimapToWorld',
        'computeViewportRect',
        'computeNodePositions',
        'isPointInRect',
        'clampRect',
        'buildMinimap',
        'summarizeMinimap',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
