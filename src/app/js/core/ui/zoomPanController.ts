// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-90 Zoom/Pan Controller (pure-logic, zero DOM).
 *
 * Modelo de zoom + pan para 2D viewports (charts, diagrams, planar maps).
 * Imutável: cada operação retorna estado novo congelado.
 *
 * Convenções:
 *  - screen-space: pixels da viewport, origin top-left, x→right, y→down.
 *  - content-space: coordenadas do conteúdo (unidades arbitrárias).
 *  - Transform: screen = (content - panOriginContent) * zoom + viewportOrigin
 *               Aqui usamos formulação simples: screen = content * zoom + pan.
 *               i.e., pan é offset em screen-space aplicado após escala.
 */

type ViewportSize = { w: number; h: number };
type ContentBounds = { minX: number; minY: number; maxX: number; maxY: number };
type Point2D = { x: number; y: number };
type ZoomPanState = {
    zoom: number;
    pan: Point2D;
    viewportSize: ViewportSize;
    contentBounds: ContentBounds;
    minZoom: number;
    maxZoom: number;
};
type ZoomPanPatch = {
    zoom?: number;
    pan?: Point2D;
    viewportSize?: ViewportSize;
    contentBounds?: ContentBounds;
    minZoom?: number;
    maxZoom?: number;
};

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

function freezeDeep<T>(obj: T): T {
    Object.freeze(obj);
    for (const k of Object.keys(obj as object)) {
        const v = (obj as Record<string, unknown>)[k];
        if (v && typeof v === 'object' && !Object.isFrozen(v)) freezeDeep(v);
    }
    return obj;
}

function validateViewport(size: unknown): asserts size is ViewportSize {
    if (!size || typeof size !== 'object') throw new Error('viewportSize must be object {w,h}');
    const s = size as { w?: unknown; h?: unknown };
    if (!isFiniteNumber(s.w) || !isFiniteNumber(s.h)) throw new Error('viewportSize w/h must be finite');
    if (s.w <= 0 || s.h <= 0) throw new Error('viewportSize w/h must be > 0');
}

function validateBounds(b: unknown): asserts b is ContentBounds {
    if (!b || typeof b !== 'object') throw new Error('contentBounds must be object');
    const bb = b as { minX?: unknown; minY?: unknown; maxX?: unknown; maxY?: unknown };
    const { minX, minY, maxX, maxY } = bb;
    if (![minX, minY, maxX, maxY].every(isFiniteNumber)) throw new Error('contentBounds must be finite');
    if ((minX as number) >= (maxX as number)) throw new Error('contentBounds: minX must be < maxX');
    if ((minY as number) >= (maxY as number)) throw new Error('contentBounds: minY must be < maxY');
}

function validateZoom(z: unknown): asserts z is number {
    if (!isFiniteNumber(z)) throw new Error('zoom must be a finite number');
    if (z <= 0) throw new Error('zoom must be > 0');
}

import { clamp } from '../../utils/helpers/math.js';

export function createZoomPanState({
    viewportSize,
    contentBounds,
    minZoom = 0.1,
    maxZoom = 20,
    initialZoom = 1,
    initialPan = { x: 0, y: 0 },
}: {
    viewportSize?: ViewportSize;
    contentBounds?: ContentBounds;
    minZoom?: number;
    maxZoom?: number;
    initialZoom?: number;
    initialPan?: Point2D;
} = {}): ZoomPanState {
    validateViewport(viewportSize);
    validateBounds(contentBounds);
    validateZoom(minZoom);
    validateZoom(maxZoom);
    if (minZoom > maxZoom) throw new Error('minZoom must be <= maxZoom');
    validateZoom(initialZoom);
    if (!initialPan || !isFiniteNumber(initialPan.x) || !isFiniteNumber(initialPan.y)) {
        throw new Error('initialPan {x,y} must be finite');
    }
    const zoom = clamp(initialZoom, minZoom, maxZoom);
    return freezeDeep({
        zoom,
        pan: { x: initialPan.x, y: initialPan.y },
        viewportSize: { w: viewportSize.w, h: viewportSize.h },
        contentBounds: {
            minX: contentBounds.minX,
            minY: contentBounds.minY,
            maxX: contentBounds.maxX,
            maxY: contentBounds.maxY,
        },
        minZoom,
        maxZoom,
    });
}

function rebuild(state: ZoomPanState, patch: ZoomPanPatch): ZoomPanState {
    return freezeDeep({
        zoom: patch.zoom ?? state.zoom,
        pan: patch.pan ? { x: patch.pan.x, y: patch.pan.y } : { x: state.pan.x, y: state.pan.y },
        viewportSize: patch.viewportSize
            ? { w: patch.viewportSize.w, h: patch.viewportSize.h }
            : { w: state.viewportSize.w, h: state.viewportSize.h },
        contentBounds: patch.contentBounds ? { ...patch.contentBounds } : { ...state.contentBounds },
        minZoom: patch.minZoom ?? state.minZoom,
        maxZoom: patch.maxZoom ?? state.maxZoom,
    });
}

export function setZoom(state: ZoomPanState, zoom: number, anchorPoint?: Point2D): ZoomPanState {
    validateZoom(zoom);
    const clamped = clamp(zoom, state.minZoom, state.maxZoom);
    if (anchorPoint !== undefined && anchorPoint !== null) {
        if (!isFiniteNumber(anchorPoint.x) || !isFiniteNumber(anchorPoint.y)) {
            throw new Error('anchorPoint {x,y} must be finite');
        }
        // Preserve content point under anchor: anchor = content*zoom + pan
        // content_at_anchor = (anchor - pan) / oldZoom
        // newPan = anchor - content_at_anchor * newZoom
        const contentX = (anchorPoint.x - state.pan.x) / state.zoom;
        const contentY = (anchorPoint.y - state.pan.y) / state.zoom;
        const newPanX = anchorPoint.x - contentX * clamped;
        const newPanY = anchorPoint.y - contentY * clamped;
        return rebuild(state, { zoom: clamped, pan: { x: newPanX, y: newPanY } });
    }
    return rebuild(state, { zoom: clamped });
}

export function zoomIn(state: ZoomPanState, step: number = 1.2, anchorPoint?: Point2D): ZoomPanState {
    if (!isFiniteNumber(step) || step <= 0) throw new Error('step must be > 0');
    return setZoom(state, state.zoom * step, anchorPoint);
}

export function zoomOut(state: ZoomPanState, step: number = 1.2, anchorPoint?: Point2D): ZoomPanState {
    if (!isFiniteNumber(step) || step <= 0) throw new Error('step must be > 0');
    return setZoom(state, state.zoom / step, anchorPoint);
}

export function setPan(state: ZoomPanState, pan: Point2D): ZoomPanState {
    if (!pan || !isFiniteNumber(pan.x) || !isFiniteNumber(pan.y)) {
        throw new Error('pan {x,y} must be finite');
    }
    return rebuild(state, { pan: { x: pan.x, y: pan.y } });
}

export function panBy(state: ZoomPanState, dx: number, dy: number): ZoomPanState {
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) throw new Error('dx/dy must be finite');
    return rebuild(state, { pan: { x: state.pan.x + dx, y: state.pan.y + dy } });
}

export function resetView(state: ZoomPanState): ZoomPanState {
    const z = clamp(1, state.minZoom, state.maxZoom);
    return rebuild(state, { zoom: z, pan: { x: 0, y: 0 } });
}

function computeFitScale(state: ZoomPanState, padding: number = 0.1): number {
    const { viewportSize, contentBounds } = state;
    const cw = contentBounds.maxX - contentBounds.minX;
    const ch = contentBounds.maxY - contentBounds.minY;
    const padFactor = 1 - 2 * padding;
    const scaleX = (viewportSize.w * padFactor) / cw;
    const scaleY = (viewportSize.h * padFactor) / ch;
    return Math.min(scaleX, scaleY);
}

export function fitToContent(state: ZoomPanState, padding: number = 0.1): ZoomPanState {
    if (!isFiniteNumber(padding) || padding < 0 || padding >= 0.5) {
        throw new Error('padding must be in [0, 0.5)');
    }
    const fit = computeFitScale(state, padding);
    const zoom = clamp(fit, state.minZoom, state.maxZoom);
    // Center content: content center maps to viewport center
    // viewportCenter = contentCenter * zoom + pan  →  pan = viewportCenter - contentCenter*zoom
    const cx = (state.contentBounds.minX + state.contentBounds.maxX) / 2;
    const cy = (state.contentBounds.minY + state.contentBounds.maxY) / 2;
    const panX = state.viewportSize.w / 2 - cx * zoom;
    const panY = state.viewportSize.h / 2 - cy * zoom;
    return rebuild(state, { zoom, pan: { x: panX, y: panY } });
}

export function screenToContent(state: ZoomPanState, screenPoint: Point2D): Point2D {
    if (!screenPoint || !isFiniteNumber(screenPoint.x) || !isFiniteNumber(screenPoint.y)) {
        throw new Error('screenPoint {x,y} must be finite');
    }
    return {
        x: (screenPoint.x - state.pan.x) / state.zoom,
        y: (screenPoint.y - state.pan.y) / state.zoom,
    };
}

export function contentToScreen(state: ZoomPanState, contentPoint: Point2D): Point2D {
    if (!contentPoint || !isFiniteNumber(contentPoint.x) || !isFiniteNumber(contentPoint.y)) {
        throw new Error('contentPoint {x,y} must be finite');
    }
    return {
        x: contentPoint.x * state.zoom + state.pan.x,
        y: contentPoint.y * state.zoom + state.pan.y,
    };
}

export function getVisibleContentBounds(state: ZoomPanState): ContentBounds {
    const tl = screenToContent(state, { x: 0, y: 0 });
    const br = screenToContent(state, { x: state.viewportSize.w, y: state.viewportSize.h });
    return {
        minX: Math.min(tl.x, br.x),
        minY: Math.min(tl.y, br.y),
        maxX: Math.max(tl.x, br.x),
        maxY: Math.max(tl.y, br.y),
    };
}

export function setViewportSize(state: ZoomPanState, size: ViewportSize): ZoomPanState {
    validateViewport(size);
    return rebuild(state, { viewportSize: { w: size.w, h: size.h } });
}

export function setContentBounds(state: ZoomPanState, bounds: ContentBounds): ZoomPanState {
    validateBounds(bounds);
    return rebuild(state, { contentBounds: { ...bounds } });
}

export function summarizeZoomPan(state: ZoomPanState): {
    zoom: number;
    panX: number;
    panY: number;
    fitScale: number;
    isAtMin: boolean;
    isAtMax: boolean;
} {
    const fitScale = computeFitScale(state, 0.1);
    return {
        zoom: state.zoom,
        panX: state.pan.x,
        panY: state.pan.y,
        fitScale,
        isAtMin: state.zoom <= state.minZoom + 1e-9,
        isAtMax: state.zoom >= state.maxZoom - 1e-9,
    };
}
