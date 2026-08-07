// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Module: GIS BBox Preview (pure logic)
// Spec: SPEC_GIS_BBOX_PREVIEW_THUMBNAIL.md

/* ================================================================
   bboxPreview.ts
   ---------------------------------------------------------------
   Pure logic for the geographic preview thumbnail shown before
   shapefile import. Computes:

     1. computeBBox(features)         — lat/lng extent, cross-meridian aware
     2. summarizeGeometries(features) — counts by GeoJSON geometry type
     3. formatExtentLabel(bbox)       — human "−23.55°S → −23.42°S × ..."
     4. bboxToCanvasCoords(bbox, vp)  — equirectangular (plate carrée) projection
                                        with aspect-ratio preservation

   No DOM, no canvas, no Three.js. Ready for node:test.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface GeoJSONGeometry {
    readonly type: string;
    readonly coordinates?: unknown;
    readonly geometries?: readonly GeoJSONGeometry[];
}

export interface GeoJSONFeature {
    readonly type?: string;
    readonly geometry: GeoJSONGeometry | null | undefined;
    readonly properties?: Record<string, unknown> | null;
}

export interface LatLngBBox {
    readonly minLat: number;
    readonly maxLat: number;
    readonly minLng: number;
    readonly maxLng: number;
    /** True when the extent crosses ±180° (e.g. Pacific Rim datasets). */
    readonly crossesMeridian: boolean;
}

export interface GeometrySummary {
    Polygon: number;
    MultiPolygon: number;
    LineString: number;
    MultiLineString: number;
    Point: number;
    MultiPoint: number;
    GeometryCollection: number;
    Unknown: number;
    total: number;
}

export interface CanvasViewport {
    readonly width: number;
    readonly height: number;
    readonly padding: number;
}

export interface TransformFn {
    (lng: number, lat: number): { x: number; y: number };
}

// ──────────────────────────────────────────────────────────────────────
// Internal: walk coords
// ──────────────────────────────────────────────────────────────────────

type LngLat = readonly [number, number];

/**
 * Recursively flatten any GeoJSON coordinate structure into [lng, lat] tuples.
 * Skips invalid entries silently.
 */
function* walkCoords(coords: unknown): Generator<LngLat> {
    if (!Array.isArray(coords)) return;
    // Leaf [lng, lat] (possibly with z): both numeric
    if (
        coords.length >= 2 &&
        typeof coords[0] === 'number' &&
        typeof coords[1] === 'number' &&
        Number.isFinite(coords[0]) &&
        Number.isFinite(coords[1])
    ) {
        yield [coords[0] as number, coords[1] as number];
        return;
    }
    for (const inner of coords) {
        yield* walkCoords(inner);
    }
}

/**
 * Recursively walk a GeoJSON geometry (including GeometryCollection one level deep)
 * and yield all coordinate tuples.
 */
function* walkGeometry(geom: GeoJSONGeometry | null | undefined): Generator<LngLat> {
    if (!geom || typeof geom.type !== 'string') return;
    if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
        for (const child of geom.geometries) {
            yield* walkGeometry(child);
        }
        return;
    }
    yield* walkCoords(geom.coordinates);
}

// ──────────────────────────────────────────────────────────────────────
// computeBBox — cross-meridian aware
// ──────────────────────────────────────────────────────────────────────

/**
 * Compute the lat/lng bounding box of a feature collection.
 *
 * Cross-meridian datasets (e.g. Russian Far East + Alaska) are detected by
 * locating the largest angular gap between sorted longitudes; if that gap
 * exceeds the circular gap (360 − span), the dataset wraps ±180° and the
 * resulting bbox uses {minLng = after_gap, maxLng = before_gap, crossesMeridian = true}.
 *
 * @returns BBox object, or null if no valid coordinates exist.
 */
export function computeBBox(features: readonly GeoJSONFeature[]): LatLngBBox | null {
    if (!Array.isArray(features) || features.length === 0) return null;

    let minLat = Infinity;
    let maxLat = -Infinity;
    const lngs: number[] = [];

    for (const feat of features) {
        if (!feat || !feat.geometry) continue;
        for (const [lng, lat] of walkGeometry(feat.geometry)) {
            if (lat >= -90 && lat <= 90) {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
            }
            if (lng >= -180 && lng <= 180) {
                lngs.push(lng);
            }
        }
    }

    if (!Number.isFinite(minLat) || !Number.isFinite(maxLat) || lngs.length === 0) {
        return null;
    }

    const { minLng, maxLng, crossesMeridian } = resolveLongitudeExtent(lngs);

    return { minLat, maxLat, minLng, maxLng, crossesMeridian };
}

/**
 * Cross-meridian detection. See SPEC §C edge-case discussion.
 */
function resolveLongitudeExtent(lngs: readonly number[]): {
    minLng: number;
    maxLng: number;
    crossesMeridian: boolean;
} {
    const sorted = [...lngs].sort((a, b) => a - b);
    const n = sorted.length;
    const first = sorted[0] as number;
    const last = sorted[n - 1] as number;
    if (n === 1) return { minLng: first, maxLng: first, crossesMeridian: false };

    let maxGap = 0;
    let gapStart = -1;
    for (let i = 1; i < n; i++) {
        const prev = sorted[i - 1] as number;
        const cur = sorted[i] as number;
        const gap = cur - prev;
        if (gap > maxGap) {
            maxGap = gap;
            gapStart = i - 1;
        }
    }

    // Circular gap: span from last to first wrapping ±180°
    const span = last - first;
    const circularGap = 360 - span;

    // If the largest internal gap exceeds 180° and is larger than the circular gap,
    // the dataset wraps. Threshold of 180° prevents normal "Europe to Asia" datasets
    // from being misclassified.
    if (maxGap > 180 && maxGap > circularGap) {
        return {
            minLng: sorted[gapStart + 1] as number,
            maxLng: sorted[gapStart] as number,
            crossesMeridian: true,
        };
    }

    return { minLng: first, maxLng: last, crossesMeridian: false };
}

// ──────────────────────────────────────────────────────────────────────
// summarizeGeometries
// ──────────────────────────────────────────────────────────────────────

const SUMMARY_KEYS = [
    'Polygon',
    'MultiPolygon',
    'LineString',
    'MultiLineString',
    'Point',
    'MultiPoint',
    'GeometryCollection',
] as const;

type SummaryKey = (typeof SUMMARY_KEYS)[number];

function emptySummary(): GeometrySummary {
    return {
        Polygon: 0,
        MultiPolygon: 0,
        LineString: 0,
        MultiLineString: 0,
        Point: 0,
        MultiPoint: 0,
        GeometryCollection: 0,
        Unknown: 0,
        total: 0,
    };
}

/**
 * Count features by GeoJSON geometry type. Null geometries are skipped (not Unknown).
 * Types not in the canonical RFC 7946 list go to `Unknown`.
 */
export function summarizeGeometries(features: readonly GeoJSONFeature[]): GeometrySummary {
    const out = emptySummary();
    if (!Array.isArray(features)) return out;

    for (const feat of features) {
        if (!feat || !feat.geometry || typeof feat.geometry.type !== 'string') continue;
        const t = feat.geometry.type;
        if ((SUMMARY_KEYS as readonly string[]).includes(t)) {
            out[t as SummaryKey] += 1;
        } else {
            out.Unknown += 1;
        }
        out.total += 1;
    }
    return out;
}

// ──────────────────────────────────────────────────────────────────────
// formatExtentLabel
// ──────────────────────────────────────────────────────────────────────

function formatLat(lat: number): string {
    const abs = Math.abs(lat).toFixed(2);
    const hemi = lat >= 0 ? 'N' : 'S';
    return `${abs}°${hemi}`;
}

function formatLng(lng: number): string {
    const abs = Math.abs(lng).toFixed(2);
    const hemi = lng >= 0 ? 'E' : 'W';
    return `${abs}°${hemi}`;
}

/**
 * Human-readable extent label:
 *   "−23.55°S → −23.42°S × −46.63°W → −46.51°W"
 * Cross-meridian datasets append a marker:
 *   "... (crosses ±180°)"
 */
export function formatExtentLabel(bbox: LatLngBBox | null): string {
    if (!bbox) return 'Extent: unavailable';
    const lat = `${formatLat(bbox.minLat)} → ${formatLat(bbox.maxLat)}`;
    const lng = `${formatLng(bbox.minLng)} → ${formatLng(bbox.maxLng)}`;
    const suffix = bbox.crossesMeridian ? ' (crosses ±180°)' : '';
    return `${lat} × ${lng}${suffix}`;
}

// ──────────────────────────────────────────────────────────────────────
// bboxToCanvasCoords — equirectangular (plate carrée) projection
// ──────────────────────────────────────────────────────────────────────

/**
 * Build a transform function (lng, lat) → (x, y) in canvas pixel space.
 *
 * Projection: equirectangular (a.k.a. plate carrée).
 * Aspect-ratio preserving: if bbox is wider than the viewport, the y-axis
 * adds vertical padding (and vice-versa) so the rendered extent isn't distorted.
 *
 * Degenerate bbox (single point or zero-width/height) returns the viewport center.
 *
 * Cross-meridian bboxes are linearized by adding +360° to longitudes east of
 * minLng (i.e. those numerically less than minLng on the wrap side).
 */
export function bboxToCanvasCoords(bbox: LatLngBBox, viewport: CanvasViewport): TransformFn {
    const w = viewport.width;
    const h = viewport.height;
    const pad = Math.max(0, viewport.padding);

    const drawW = Math.max(1, w - 2 * pad);
    const drawH = Math.max(1, h - 2 * pad);

    // Effective bbox width in degrees, accounting for cross-meridian wrap
    let bboxWidth: number;
    if (bbox.crossesMeridian) {
        bboxWidth = bbox.maxLng + 360 - bbox.minLng;
    } else {
        bboxWidth = bbox.maxLng - bbox.minLng;
    }
    const bboxHeight = bbox.maxLat - bbox.minLat;

    // Degenerate: single point → return center
    if (bboxWidth < 1e-9 && bboxHeight < 1e-9) {
        const cx = w / 2;
        const cy = h / 2;
        return () => ({ x: cx, y: cy });
    }

    // Preserve aspect ratio
    let scale: number;
    let offsetX: number;
    let offsetY: number;
    const safeW = bboxWidth < 1e-9 ? 1e-9 : bboxWidth;
    const safeH = bboxHeight < 1e-9 ? 1e-9 : bboxHeight;
    const bboxAspect = safeW / safeH;
    const viewAspect = drawW / drawH;

    if (bboxAspect > viewAspect) {
        // BBox is wider — fit width, pad vertically
        scale = drawW / safeW;
        offsetX = pad;
        offsetY = pad + (drawH - safeH * scale) / 2;
    } else {
        // BBox is taller — fit height, pad horizontally
        scale = drawH / safeH;
        offsetX = pad + (drawW - safeW * scale) / 2;
        offsetY = pad;
    }

    const minLng = bbox.minLng;
    const maxLat = bbox.maxLat;
    const crosses = bbox.crossesMeridian;

    return (lng: number, lat: number) => {
        let effLng = lng;
        if (crosses && lng < minLng) {
            effLng = lng + 360;
        }
        const x = offsetX + (effLng - minLng) * scale;
        // Canvas Y grows downward; invert lat so maxLat lands near top
        const y = offsetY + (maxLat - lat) * scale;
        return { x, y };
    };
}
