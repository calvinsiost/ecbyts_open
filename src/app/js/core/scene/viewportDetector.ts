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
// @since v0.1.7
//
// SPEC: docs/specs/features/SPEC_GIS_OUT_OF_VIEWPORT_BANNER.md
//
// Pure-logic helpers for the "out-of-viewport banner" — detects when imported
// GIS elements land far from the current camera position so the UI layer can
// surface a non-modal "Center on data" CTA.
//
// Coordinates: all positions are in the Three.js relative coordinate system
// (metres). Conversion from lat/lon happens upstream in core/io/geo/coordinates.
// No THREE.* imports — callers pass plain `{x,y,z}` objects.

// ─── Types ─────────────────────────────────────────────────────────────────

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface BBox {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
    readonly minZ: number;
    readonly maxZ: number;
}

export interface CameraLike {
    readonly position: Vec3;
}

/** Element shape accepted by computeBoundsOfImportedElements. */
export interface ImportedElementLike {
    readonly data?: {
        readonly position?: Vec3 | null;
        readonly vertices?: ReadonlyArray<Vec3>;
        readonly path?: ReadonlyArray<Vec3>;
        readonly coordinates?: {
            readonly easting?: number;
            readonly northing?: number;
            readonly elevation?: number;
        } | null;
    } | null;
}

/**
 * Default distance threshold (metres) above which the banner becomes
 * eligible. 50 km maps to roughly "an entire metro region away from the
 * current camera focus" — same heuristic used by Felt / ArcGIS Web.
 */
export const DEFAULT_OUT_OF_VIEWPORT_THRESHOLD_M = 50000;

export interface CheckBannerDecisionInput {
    readonly camera: CameraLike | null | undefined;
    readonly elements: ReadonlyArray<ImportedElementLike>;
    readonly datasetId: string;
    readonly threshold?: number;
    readonly isDismissed: (datasetId: string) => boolean;
}

export type BannerDecisionReason =
    | 'show'
    | 'no-elements'
    | 'no-camera'
    | 'inside-viewport'
    | 'below-threshold'
    | 'dismissed';

export interface BannerDecision {
    readonly show: boolean;
    readonly distanceM: number;
    readonly reason: BannerDecisionReason;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

function isFiniteNumber(n: unknown): n is number {
    return typeof n === 'number' && Number.isFinite(n);
}

function bboxCenter(bbox: BBox): Vec3 {
    return {
        x: (bbox.minX + bbox.maxX) / 2,
        y: (bbox.minY + bbox.maxY) / 2,
        z: (bbox.minZ + bbox.maxZ) / 2,
    };
}

function isInsideBBox(p: Vec3, bbox: BBox): boolean {
    return (
        p.x >= bbox.minX &&
        p.x <= bbox.maxX &&
        p.y >= bbox.minY &&
        p.y <= bbox.maxY &&
        p.z >= bbox.minZ &&
        p.z <= bbox.maxZ
    );
}

function distanceVec3(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Updates a running min/max accumulator with a single point. Mutates the
 * acc object in place. Used by computeBoundsOfImportedElements.
 */
interface BoundsAcc {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
    count: number;
}

function accumulatePoint(acc: BoundsAcc, p: Vec3 | undefined | null): void {
    if (!p) return;
    const x = isFiniteNumber(p.x) ? p.x : 0;
    const y = isFiniteNumber(p.y) ? p.y : 0;
    const z = isFiniteNumber(p.z) ? p.z : 0;
    if (acc.count === 0) {
        acc.minX = acc.maxX = x;
        acc.minY = acc.maxY = y;
        acc.minZ = acc.maxZ = z;
    } else {
        if (x < acc.minX) acc.minX = x;
        if (x > acc.maxX) acc.maxX = x;
        if (y < acc.minY) acc.minY = y;
        if (y > acc.maxY) acc.maxY = y;
        if (z < acc.minZ) acc.minZ = z;
        if (z > acc.maxZ) acc.maxZ = z;
    }
    acc.count += 1;
}

function accumulateVertices(acc: BoundsAcc, verts: ReadonlyArray<Vec3> | undefined | null): void {
    if (!verts || verts.length === 0) return;
    for (const v of verts) accumulatePoint(acc, v);
}

function accumulatePath(acc: BoundsAcc, path: ReadonlyArray<Vec3> | undefined | null): void {
    if (!path || path.length === 0) return;
    for (const v of path) accumulatePoint(acc, v);
}

type ElementCoordinates = NonNullable<ImportedElementLike['data']>['coordinates'];

function accumulateCoordinates(
    acc: BoundsAcc,
    c: ElementCoordinates | undefined | null,
): void {
    if (!c || (!isFiniteNumber(c.easting) && !isFiniteNumber(c.northing))) return;
    accumulatePoint(acc, {
        x: isFiniteNumber(c.easting) ? c.easting : 0,
        y: isFiniteNumber(c.elevation) ? c.elevation : 0,
        z: isFiniteNumber(c.northing) ? c.northing : 0,
    });
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Computes the metric distance between the camera position and the centre
 * of the supplied bounding box. Returns 0 when the camera lies inside the
 * bbox (no need to surface the banner — user is already focused on the
 * data region).
 */
export function computeCameraDistance(camera: CameraLike, bbox: BBox): number {
    if (!camera || !camera.position) return 0;
    const p = camera.position;
    if (!isFiniteNumber(p.x) || !isFiniteNumber(p.y) || !isFiniteNumber(p.z)) {
        return 0;
    }
    if (isInsideBBox(p, bbox)) return 0;
    return distanceVec3(p, bboxCenter(bbox));
}

/**
 * Returns true iff distM is strictly greater than threshold. Default
 * threshold = 50000m. Strict comparison so dist===threshold does not fire
 * (predictable cheap-test behaviour).
 */
export function shouldShowOutOfViewportBanner(
    distM: number,
    threshold: number = DEFAULT_OUT_OF_VIEWPORT_THRESHOLD_M,
): boolean {
    if (!isFiniteNumber(distM) || !isFiniteNumber(threshold)) return false;
    return distM > threshold;
}

/**
 * Computes a bounding box around all positions / vertices / path points of
 * the supplied elements. Returns null when no usable geometry is found.
 *
 * Recognised geometry sources (in order of precedence):
 *  - data.position {x,y,z}
 *  - data.vertices [{x,y,z}...]  (boundaries, plumes, lakes)
 *  - data.path [{x,y,z}...]      (rivers, route_flow)
 *  - data.coordinates {easting, northing, elevation}  (wells — converted to {x,y,z})
 */
export function computeBoundsOfImportedElements(
    elements: ReadonlyArray<ImportedElementLike>,
): BBox | null {
    const acc: BoundsAcc = {
        minX: 0,
        maxX: 0,
        minY: 0,
        maxY: 0,
        minZ: 0,
        maxZ: 0,
        count: 0,
    };
    for (const el of elements) {
        const d = el?.data;
        if (!d) continue;
        if (d.position) accumulatePoint(acc, d.position);
        accumulateVertices(acc, d.vertices);
        accumulatePath(acc, d.path);
        accumulateCoordinates(acc, d.coordinates);
    }
    if (acc.count === 0) return null;
    return {
        minX: acc.minX,
        maxX: acc.maxX,
        minY: acc.minY,
        maxY: acc.maxY,
        minZ: acc.minZ,
        maxZ: acc.maxZ,
    };
}

/**
 * Orchestrator helper: combines bbox + distance + threshold + dismissal
 * check into a single decision object. UI layer reads `decision.show`
 * and `decision.distanceM`; cheap tests inspect `decision.reason` for
 * the negative cases.
 */
export function checkOutOfViewportBannerDecision(
    input: CheckBannerDecisionInput,
): BannerDecision {
    const { camera, elements, datasetId, threshold, isDismissed } = input;
    if (!elements || elements.length === 0) {
        return { show: false, distanceM: 0, reason: 'no-elements' };
    }
    if (!camera || !camera.position) {
        return { show: false, distanceM: 0, reason: 'no-camera' };
    }
    if (isDismissed(datasetId)) {
        return { show: false, distanceM: 0, reason: 'dismissed' };
    }
    const bbox = computeBoundsOfImportedElements(elements);
    if (!bbox) {
        return { show: false, distanceM: 0, reason: 'no-elements' };
    }
    const dist = computeCameraDistance(camera, bbox);
    if (dist === 0) {
        return { show: false, distanceM: 0, reason: 'inside-viewport' };
    }
    if (!shouldShowOutOfViewportBanner(dist, threshold)) {
        return { show: false, distanceM: dist, reason: 'below-threshold' };
    }
    return { show: true, distanceM: dist, reason: 'show' };
}

/**
 * Sanitises a dataset id for safe use as a sessionStorage key suffix.
 * Strips anything that is not a-z, A-Z, 0-9, '_' or '-'. Empty input
 * collapses to '_'.
 */
export function sanitizeDatasetId(id: string): string {
    const cleaned = String(id ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned.length > 0 ? cleaned : '_';
}

/**
 * Formats a metric distance into a short human-readable string ("87 km",
 * "1.2 km", "300 m"). Used by UI translation interpolation.
 */
export function formatDistanceM(distM: number): string {
    if (!isFiniteNumber(distM) || distM <= 0) return '0 m';
    if (distM >= 10000) return `${Math.round(distM / 1000)} km`;
    if (distM >= 1000) return `${(distM / 1000).toFixed(1)} km`;
    return `${Math.round(distM)} m`;
}
