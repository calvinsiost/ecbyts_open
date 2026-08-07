// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: GIS BBox Preview — vanilla canvas renderer
// Spec: SPEC_GIS_BBOX_PREVIEW_THUMBNAIL.md

/* ================================================================
   bboxPreviewCanvas.js
   ---------------------------------------------------------------
   Vanilla 2D canvas renderer for the bbox preview thumbnail shown
   in the shapefile import wizard. Consumes the pure-logic helpers
   from core/io/geo/bboxPreview.js (TS-generated).

   No external deps. No Three.js. No font assets — uses canvas
   default sans-serif at small px size.

   Equirectangular (plate carrée) projection is provided by
   bboxToCanvasCoords from pure logic; this file only handles
   drawing primitives.
   ================================================================ */

import {
    computeBBox,
    summarizeGeometries,
    formatExtentLabel,
    bboxToCanvasCoords,
} from '../../core/io/geo/bboxPreview.js';

interface DrawPreviewOptions {
    /** Polygon fill color (default '#3b82f6' alpha 0.3) */
    fillColor?: string;
    /** Line and polygon stroke color (default '#1e40af') */
    strokeColor?: string;
    /** Point marker color (default '#dc2626') */
    pointColor?: string;
    /** Canvas background (default '#fafafa') */
    bgColor?: string;
    /** Axis label color (default '#666') */
    axisColor?: string;
    /** Fallback text when no bbox (default 'Preview unavailable') */
    emptyText?: string;
    /** Inner padding in px (default 24 — room for axis labels) */
    padding?: number;
    /** Whether to draw lat/lng axis labels (default true) */
    drawAxes?: boolean;
}

/**
 * Render a static 2D preview of GeoJSON features onto a canvas.
 */
export function drawPreview(
    canvas: HTMLCanvasElement | null | undefined,
    features: Array<any>,
    options: DrawPreviewOptions = {},
): { bbox: any; summary: any; label: string; rendered: boolean } {
    const opts = _resolveOptions(options);
    const featList = Array.isArray(features) ? features : [];
    const bbox = computeBBox(featList);
    const summary = summarizeGeometries(featList);
    const label = formatExtentLabel(bbox);

    if (!canvas || typeof canvas.getContext !== 'function') {
        return { bbox, summary, label, rendered: false };
    }

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) return { bbox, summary, label, rendered: false };

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, w, h);

    // Border
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    if (!bbox) {
        _drawCenteredText(ctx, opts.emptyText, w / 2, h / 2, opts.axisColor);
        return { bbox, summary, label, rendered: true };
    }

    const transform = bboxToCanvasCoords(bbox, {
        width: w,
        height: h,
        padding: opts.padding,
    });

    // Draw features in z-order: polygons under lines under points
    _drawPolygons(ctx, featList, transform, opts);
    _drawLines(ctx, featList, transform, opts);
    _drawPoints(ctx, featList, transform, opts);

    if (opts.drawAxes) {
        _drawAxisLabels(ctx, bbox, w, h, opts);
    }

    return { bbox, summary, label, rendered: true };
}

// ──────────────────────────────────────────────────────────────────────
// Options resolution
// ──────────────────────────────────────────────────────────────────────

function _resolveOptions(o: DrawPreviewOptions) {
    return {
        fillColor: o.fillColor || 'rgba(59, 130, 246, 0.3)',
        strokeColor: o.strokeColor || '#1e40af',
        pointColor: o.pointColor || '#dc2626',
        bgColor: o.bgColor || '#fafafa',
        axisColor: o.axisColor || '#666',
        emptyText: o.emptyText || 'Preview unavailable',
        padding: typeof o.padding === 'number' ? o.padding : 24,
        drawAxes: o.drawAxes !== false,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Drawing primitives — per-geometry type
// ──────────────────────────────────────────────────────────────────────

function _drawPolygons(
    ctx: CanvasRenderingContext2D,
    features: Array<any>,
    transform: (lng: number, lat: number) => { x: number; y: number },
    opts: ReturnType<typeof _resolveOptions>,
) {
    ctx.fillStyle = opts.fillColor;
    ctx.strokeStyle = opts.strokeColor;
    ctx.lineWidth = 1;

    for (const feat of features) {
        const geom = feat?.geometry;
        if (!geom) continue;
        if (geom.type === 'Polygon') {
            _strokeFillRings(ctx, geom.coordinates, transform);
        } else if (geom.type === 'MultiPolygon') {
            const polys = (geom.coordinates as any[]) || [];
            for (const rings of polys) {
                _strokeFillRings(ctx, rings, transform);
            }
        } else if (geom.type === 'GeometryCollection') {
            _drawPolygons(
                ctx,
                [{ geometry: { type: 'GeometryCollection', geometries: geom.geometries } }].concat(
                    (geom.geometries || []).map((g: any) => ({ geometry: g })),
                ),
                transform,
                opts,
            );
        }
    }
}

function _strokeFillRings(
    ctx: CanvasRenderingContext2D,
    rings: any,
    transform: (lng: number, lat: number) => { x: number; y: number },
) {
    if (!Array.isArray(rings) || rings.length === 0) return;
    ctx.beginPath();
    for (const ring of rings) {
        if (!Array.isArray(ring) || ring.length < 3) continue;
        let first = true;
        for (const pt of ring) {
            if (!Array.isArray(pt) || pt.length < 2) continue;
            const lng = Number(pt[0]);
            const lat = Number(pt[1]);
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
            const { x, y } = transform(lng, lat);
            if (first) {
                ctx.moveTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.closePath();
    }
    ctx.fill('evenodd');
    ctx.stroke();
}

function _drawLines(
    ctx: CanvasRenderingContext2D,
    features: Array<any>,
    transform: (lng: number, lat: number) => { x: number; y: number },
    opts: ReturnType<typeof _resolveOptions>,
) {
    ctx.strokeStyle = opts.strokeColor;
    ctx.lineWidth = 1.5;

    for (const feat of features) {
        const geom = feat?.geometry;
        if (!geom) continue;
        if (geom.type === 'LineString') {
            _strokeLine(ctx, geom.coordinates, transform);
        } else if (geom.type === 'MultiLineString') {
            const lines = (geom.coordinates as any[]) || [];
            for (const line of lines) {
                _strokeLine(ctx, line, transform);
            }
        }
    }
}

function _strokeLine(
    ctx: CanvasRenderingContext2D,
    line: any,
    transform: (lng: number, lat: number) => { x: number; y: number },
) {
    if (!Array.isArray(line) || line.length < 2) return;
    ctx.beginPath();
    let first = true;
    for (const pt of line) {
        if (!Array.isArray(pt) || pt.length < 2) continue;
        const lng = Number(pt[0]);
        const lat = Number(pt[1]);
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
        const { x, y } = transform(lng, lat);
        if (first) {
            ctx.moveTo(x, y);
            first = false;
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
}

function _drawPoints(
    ctx: CanvasRenderingContext2D,
    features: Array<any>,
    transform: (lng: number, lat: number) => { x: number; y: number },
    opts: ReturnType<typeof _resolveOptions>,
) {
    ctx.fillStyle = opts.pointColor;
    for (const feat of features) {
        const geom = feat?.geometry;
        if (!geom) continue;
        if (geom.type === 'Point') {
            _drawPointAt(ctx, geom.coordinates, transform);
        } else if (geom.type === 'MultiPoint') {
            const pts = (geom.coordinates as any[]) || [];
            for (const pt of pts) {
                _drawPointAt(ctx, pt, transform);
            }
        }
    }
}

function _drawPointAt(
    ctx: CanvasRenderingContext2D,
    pt: any,
    transform: (lng: number, lat: number) => { x: number; y: number },
) {
    if (!Array.isArray(pt) || pt.length < 2) return;
    const lng = Number(pt[0]);
    const lat = Number(pt[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    const { x, y } = transform(lng, lat);
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
}

// ──────────────────────────────────────────────────────────────────────
// Axis labels (4 ticks/axis)
// ──────────────────────────────────────────────────────────────────────

function _drawAxisLabels(
    ctx: CanvasRenderingContext2D,
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number; crossesMeridian: boolean },
    w: number,
    h: number,
    opts: ReturnType<typeof _resolveOptions>,
) {
    ctx.fillStyle = opts.axisColor;
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'middle';

    // Latitude labels (left side, 2 values: minLat at bottom, maxLat at top)
    ctx.textAlign = 'left';
    ctx.fillText(_fmtLat(bbox.maxLat), 4, opts.padding);
    ctx.fillText(_fmtLat(bbox.minLat), 4, h - opts.padding);

    // Longitude labels (bottom side, 2 values: minLng left, maxLng right)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(_fmtLng(bbox.minLng), opts.padding + 8, h - 4);
    ctx.fillText(_fmtLng(bbox.maxLng), w - opts.padding - 8, h - 4);
}

function _fmtLat(lat: number) {
    return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? 'N' : 'S'}`;
}

function _fmtLng(lng: number) {
    return `${Math.abs(lng).toFixed(1)}°${lng >= 0 ? 'E' : 'W'}`;
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function _drawCenteredText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string) {
    ctx.fillStyle = color;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
}
