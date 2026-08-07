// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WELL MESH SPEC — Pure geometry spec for tube renderer
   ================================================================
   P1-8 Family Fault Wells Directional Phase 5 parte 1/2 (Claude-owner)

   Converte trajetoria + segmentos litologicos em uma "spec geometrica"
   serializavel que qualquer renderer (Three.js, D3, WebGL, Canvas2D)
   pode consumir sem dependencia ao engine.

   Roadmap: Sec 0.2 P1-8 Phase 5
   ================================================================ */

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface CenterlinePoint extends Vec3 {
    md: number;
}

export interface BoundingBox {
    min: Vec3;
    max: Vec3;
}

export interface MeshSegment {
    fromIdx: number;
    toIdx: number;
    lithology: string;
    color: string;
    mdRange: [number, number];
}

export interface TubeMeshSpec {
    type: 'tube';
    centerline: CenterlinePoint[];
    segments: MeshSegment[];
    radius: number;
    bbox: BoundingBox;
}

export interface TrajectoryPoint {
    md: number;
    easting?: number;
    northing?: number;
    tvd?: number;
    x?: number;
    y?: number;
    z?: number;
}

export interface LithologySegmentInput {
    mdTop: number;
    mdBottom: number;
    lithology: string;
    color?: string;
}

export interface BuildWellMeshSpecInput {
    trajectory: TrajectoryPoint[];
    segments: LithologySegmentInput[];
}

export interface BuildWellMeshSpecOptions {
    radius?: number;
    defaultColor?: string;
    elevationY?: number;
}

export interface BuildWellMeshSpecResult {
    ok: boolean;
    spec?: TubeMeshSpec;
    error?: string;
}

export interface SpecSummary {
    centerlineCount: number;
    segmentCount: number;
    bboxExtent: Vec3;
    centerlineLength: number;
}

/**
 * Calcula bounding box de um array de pontos.
 */
export function computeBoundingBox(points: ReadonlyArray<Partial<Vec3> | null | undefined>): BoundingBox {
    if (!Array.isArray(points) || points.length === 0) {
        return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    }
    const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
    const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points) {
        if (!p) continue;
        const x = Number(p.x) || 0;
        const y = Number(p.y) || 0;
        const z = Number(p.z) || 0;
        if (x < min.x) min.x = x;
        if (y < min.y) min.y = y;
        if (z < min.z) min.z = z;
        if (x > max.x) max.x = x;
        if (y > max.y) max.y = y;
        if (z > max.z) max.z = z;
    }
    return { min, max };
}

/**
 * Encontra indice da station mais proxima (por MD) na lista ordenada.
 * Retorna -1 se MD fora do range total.
 */
export function findNearestStationIdx(stations: ReadonlyArray<{ md: number }>, targetMD: number): number {
    if (!Array.isArray(stations) || stations.length === 0) return -1;
    if (!Number.isFinite(targetMD)) return -1;
    const first = stations[0];
    const last = stations[stations.length - 1];
    if (!first || !last) return -1;
    if (targetMD < first.md - 1e-6) return -1;
    if (targetMD > last.md + 1e-6) return -1;

    let bestIdx = 0;
    let bestDist = Math.abs(first.md - targetMD);
    for (let i = 1; i < stations.length; i++) {
        const station = stations[i];
        if (!station) continue;
        const d = Math.abs(station.md - targetMD);
        if (d < bestDist) {
            bestDist = d;
            bestIdx = i;
        }
    }
    return bestIdx;
}

/**
 * Constroi TubeMeshSpec a partir de trajetoria + segmentos litologicos.
 */
export function buildWellMeshSpec(
    input: BuildWellMeshSpecInput | null | undefined,
    opts: BuildWellMeshSpecOptions = {},
): BuildWellMeshSpecResult {
    if (!input || typeof input !== 'object') return { ok: false, error: 'input_required' };
    const { trajectory, segments } = input;
    if (!Array.isArray(trajectory) || trajectory.length < 2) {
        return { ok: false, error: 'trajectory_min_2_points' };
    }
    if (!Array.isArray(segments)) {
        return { ok: false, error: 'segments_array_required' };
    }
    const radius = Number(opts.radius) || 0.15;
    const defaultColor = opts.defaultColor || '#888888';
    const elevationY = Number(opts.elevationY) || 0;

    const centerline: CenterlinePoint[] = trajectory.map((p) => {
        if (!p) return { x: 0, y: 0, z: 0, md: 0 };
        const md = Number(p.md) || 0;
        if (Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)) {
            return { x: p.x as number, y: p.y as number, z: p.z as number, md };
        }
        return {
            x: Number(p.easting) || 0,
            y: elevationY - (Number(p.tvd) || 0),
            z: Number(p.northing) || 0,
            md,
        };
    });

    for (let i = 1; i < centerline.length; i++) {
        const cur = centerline[i];
        const prev = centerline[i - 1];
        if (!cur || !prev) continue;
        if (cur.md < prev.md) {
            return { ok: false, error: `trajectory[${i}].md must be ≥ trajectory[${i - 1}].md` };
        }
    }

    const mappedSegments: MeshSegment[] = [];
    for (const seg of segments) {
        if (!seg) continue;
        const fromIdx = findNearestStationIdx(centerline, seg.mdTop);
        const toIdx = findNearestStationIdx(centerline, seg.mdBottom);
        if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) continue;
        mappedSegments.push({
            fromIdx,
            toIdx,
            lithology: String(seg.lithology || 'unknown'),
            color: seg.color || defaultColor,
            mdRange: [seg.mdTop, seg.mdBottom],
        });
    }

    const bbox = computeBoundingBox(centerline);

    return {
        ok: true,
        spec: {
            type: 'tube',
            centerline,
            segments: mappedSegments,
            radius,
            bbox,
        },
    };
}

/**
 * Calcula comprimento total da centerline (soma euclideana dos segmentos).
 */
export function computeCenterlineLength(centerline: ReadonlyArray<Partial<Vec3>>): number {
    if (!Array.isArray(centerline) || centerline.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < centerline.length; i++) {
        const a = centerline[i - 1];
        const b = centerline[i];
        if (!a || !b) continue;
        const dx = (b.x || 0) - (a.x || 0);
        const dy = (b.y || 0) - (a.y || 0);
        const dz = (b.z || 0) - (a.z || 0);
        total += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    return total;
}

/**
 * Sumario do spec para HUD/diagnostico.
 */
export function specSummary(spec: TubeMeshSpec | null | undefined): SpecSummary {
    if (!spec || typeof spec !== 'object') {
        return {
            centerlineCount: 0,
            segmentCount: 0,
            bboxExtent: { x: 0, y: 0, z: 0 },
            centerlineLength: 0,
        };
    }
    const cl = Array.isArray(spec.centerline) ? spec.centerline : [];
    const segs = Array.isArray(spec.segments) ? spec.segments : [];
    const bbox = spec.bbox || { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
    return {
        centerlineCount: cl.length,
        segmentCount: segs.length,
        bboxExtent: {
            x: bbox.max.x - bbox.min.x,
            y: bbox.max.y - bbox.min.y,
            z: bbox.max.z - bbox.min.z,
        },
        centerlineLength: computeCenterlineLength(cl),
    };
}
