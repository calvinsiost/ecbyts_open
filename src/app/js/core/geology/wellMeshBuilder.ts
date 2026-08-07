// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   WELL MESH BUILDER — Engine-agnostic tube data builder
   ================================================================
   P1-8 Family Fault Wells Directional Phase 5 parte 2 (Claude-owner)

   Consume um TubeMeshSpec e produz buffers geometricos plain
   (Float32Array de positions/normals/colors + Uint32Array de
   indices) que qualquer renderer pode consumir.

   Algoritmo: parallel transport para frames ortonormais.
   Ref: https://janakiev.com/blog/framing-parametric-curves/
   ================================================================ */

console.debug('[mod:load]', 'app/js/core/geology/wellMeshBuilder.js');

export type Vec3Tuple = [number, number, number];

export interface CenterlinePoint {
    x: number;
    y: number;
    z: number;
}

export interface TubeFrame {
    tangent: Vec3Tuple;
    normal: Vec3Tuple;
    binormal: Vec3Tuple;
}

export interface TubeMeshSpecLike {
    type: string;
    centerline: CenterlinePoint[];
    segments?: ReadonlyArray<{ fromIdx: number; toIdx: number; color?: string }>;
    radius?: number;
}

export interface TubeMeshBuffers {
    positions: Float32Array;
    normals: Float32Array;
    colors: Float32Array;
    indices: Uint32Array;
    vertCount: number;
    ringCount: number;
    radialSegments: number;
}

export interface BuildTubeBuffersOptions {
    radialSegments?: number;
    defaultColor?: string;
}

export interface BuildTubeBuffersResult {
    ok: boolean;
    buffers?: TubeMeshBuffers;
    error?: string;
}

export interface BuffersSummary {
    vertCount: number;
    triCount: number;
    ringCount: number;
    radialSegments: number;
}

/**
 * Converte cor hex/rgb string para [r,g,b] em [0,1].
 */
export function parseColorToRGB(color: unknown): Vec3Tuple {
    if (typeof color !== 'string') return [0.5, 0.5, 0.5];
    const trimmed = color.trim().toLowerCase();

    if (/^#[0-9a-f]{6}$/.test(trimmed)) {
        const r = parseInt(trimmed.slice(1, 3), 16) / 255;
        const g = parseInt(trimmed.slice(3, 5), 16) / 255;
        const b = parseInt(trimmed.slice(5, 7), 16) / 255;
        return [r, g, b];
    }

    if (/^#[0-9a-f]{3}$/.test(trimmed)) {
        const c1 = trimmed[1] as string;
        const c2 = trimmed[2] as string;
        const c3 = trimmed[3] as string;
        const r = parseInt(c1 + c1, 16) / 255;
        const g = parseInt(c2 + c2, 16) / 255;
        const b = parseInt(c3 + c3, 16) / 255;
        return [r, g, b];
    }

    const rgbMatch = trimmed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (rgbMatch) {
        return [Number(rgbMatch[1]) / 255, Number(rgbMatch[2]) / 255, Number(rgbMatch[3]) / 255];
    }

    return [0.5, 0.5, 0.5];
}

/**
 * Normaliza vetor 3D. Vetor zero => (0,1,0).
 */
export function normalize3(v: Vec3Tuple): Vec3Tuple {
    const [x, y, z] = v;
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len < 1e-10) {
        return [0, 1, 0];
    }
    return [x / len, y / len, z / len];
}

/**
 * Produto vetorial 3D.
 */
export function cross3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Calcula tangente em cada ponto da centerline (forward/central differences).
 */
export function computeTangents(centerline: ReadonlyArray<CenterlinePoint>): Vec3Tuple[] {
    if (!Array.isArray(centerline) || centerline.length < 2) return [];
    const n = centerline.length;
    const tangents: Vec3Tuple[] = new Array(n);

    for (let i = 0; i < n; i++) {
        let tx: number;
        let ty: number;
        let tz: number;
        if (i === 0) {
            const p0 = centerline[0] as CenterlinePoint;
            const p1 = centerline[1] as CenterlinePoint;
            tx = p1.x - p0.x;
            ty = p1.y - p0.y;
            tz = p1.z - p0.z;
        } else if (i === n - 1) {
            const pN = centerline[n - 1] as CenterlinePoint;
            const pN1 = centerline[n - 2] as CenterlinePoint;
            tx = pN.x - pN1.x;
            ty = pN.y - pN1.y;
            tz = pN.z - pN1.z;
        } else {
            const pPrev = centerline[i - 1] as CenterlinePoint;
            const pNext = centerline[i + 1] as CenterlinePoint;
            tx = pNext.x - pPrev.x;
            ty = pNext.y - pPrev.y;
            tz = pNext.z - pPrev.z;
        }
        tangents[i] = normalize3([tx, ty, tz]);
    }
    return tangents;
}

/**
 * Rodrigues' rotation formula.
 */
export function rotateVectorByAxisAngle(v: Vec3Tuple, axis: Vec3Tuple, theta: number): Vec3Tuple {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const dot = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
    const cr = cross3(axis, v);

    return [
        v[0] * c + cr[0] * s + axis[0] * dot * (1 - c),
        v[1] * c + cr[1] * s + axis[1] * dot * (1 - c),
        v[2] * c + cr[2] * s + axis[2] * dot * (1 - c),
    ];
}

/**
 * Computa frames ortonormais (tangent, normal, binormal) via parallel transport.
 */
export function computeFrames(centerline: ReadonlyArray<CenterlinePoint>): TubeFrame[] {
    const tangents = computeTangents(centerline);
    if (tangents.length === 0) return [];
    const n = tangents.length;
    const frames: TubeFrame[] = new Array(n);

    const t0 = tangents[0] as Vec3Tuple;
    let ref: Vec3Tuple = [1, 0, 0];
    const dotX = Math.abs(t0[0]);
    if (dotX > 0.9) ref = [0, 1, 0];

    const normal = normalize3(cross3(t0, ref));
    const binormal = normalize3(cross3(t0, normal));

    frames[0] = { tangent: t0, normal, binormal };

    for (let i = 1; i < n; i++) {
        const tPrev = tangents[i - 1] as Vec3Tuple;
        const tCurr = tangents[i] as Vec3Tuple;

        const axis = cross3(tPrev, tCurr);
        const axisLen = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2);

        const prevFrame = frames[i - 1] as TubeFrame;

        if (axisLen < 1e-8) {
            frames[i] = {
                tangent: tCurr,
                normal: prevFrame.normal,
                binormal: prevFrame.binormal,
            };
            continue;
        }

        const axisN: Vec3Tuple = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
        const cosTheta = Math.max(-1, Math.min(1, tPrev[0] * tCurr[0] + tPrev[1] * tCurr[1] + tPrev[2] * tCurr[2]));
        const theta = Math.acos(cosTheta);

        const newNormal = rotateVectorByAxisAngle(prevFrame.normal, axisN, theta);
        const newBinormal = normalize3(cross3(tCurr, newNormal));
        const orthoNormal = normalize3(cross3(newBinormal, tCurr));

        frames[i] = { tangent: tCurr, normal: orthoNormal, binormal: newBinormal };
    }

    return frames;
}

/**
 * Determina cor por ring index baseando no mapeamento de segments.
 */
export function pickRingColor(
    ringIdx: number,
    segments: ReadonlyArray<{ fromIdx: number; toIdx: number; color?: string }> | null | undefined,
    defaultColor: string = '#888888',
): string {
    if (!Array.isArray(segments)) return defaultColor;
    for (const seg of segments) {
        if (!seg) continue;
        if (ringIdx >= seg.fromIdx && ringIdx < seg.toIdx) {
            return seg.color || defaultColor;
        }
    }
    return defaultColor;
}

/**
 * Constroi buffers geometricos a partir do TubeMeshSpec.
 */
export function buildTubeBuffers(
    spec: TubeMeshSpecLike | null | undefined,
    opts: BuildTubeBuffersOptions = {},
): BuildTubeBuffersResult {
    if (!spec || typeof spec !== 'object') return { ok: false, error: 'spec_required' };
    if (spec.type !== 'tube') return { ok: false, error: 'spec_type_must_be_tube' };
    const { centerline, segments } = spec;
    if (!Array.isArray(centerline) || centerline.length < 2) {
        return { ok: false, error: 'centerline_min_2_points' };
    }

    const radius = Number(spec.radius) || 0.15;
    const radialSegments = Math.max(3, Math.min(64, Number(opts.radialSegments) || 8));
    const defaultColor = opts.defaultColor || '#888888';

    const ringCount = centerline.length;
    const vertCount = ringCount * radialSegments;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const colors = new Float32Array(vertCount * 3);

    const frames = computeFrames(centerline);

    for (let r = 0; r < ringCount; r++) {
        const center = centerline[r] as CenterlinePoint;
        const frame = frames[r] as TubeFrame;
        const ringColor = pickRingColor(r, segments, defaultColor);
        const [cr, cg, cb] = parseColorToRGB(ringColor);

        for (let s = 0; s < radialSegments; s++) {
            const angle = (s / radialSegments) * Math.PI * 2;
            const cosA = Math.cos(angle);
            const sinA = Math.sin(angle);

            const nx = frame.normal[0] * cosA + frame.binormal[0] * sinA;
            const ny = frame.normal[1] * cosA + frame.binormal[1] * sinA;
            const nz = frame.normal[2] * cosA + frame.binormal[2] * sinA;

            const idx = (r * radialSegments + s) * 3;
            positions[idx] = center.x + nx * radius;
            positions[idx + 1] = center.y + ny * radius;
            positions[idx + 2] = center.z + nz * radius;
            normals[idx] = nx;
            normals[idx + 1] = ny;
            normals[idx + 2] = nz;
            colors[idx] = cr;
            colors[idx + 1] = cg;
            colors[idx + 2] = cb;
        }
    }

    const triCount = (ringCount - 1) * radialSegments * 2;
    const indices = new Uint32Array(triCount * 3);
    let idxOffset = 0;
    for (let r = 0; r < ringCount - 1; r++) {
        for (let s = 0; s < radialSegments; s++) {
            const sNext = (s + 1) % radialSegments;
            const a = r * radialSegments + s;
            const b = r * radialSegments + sNext;
            const c = (r + 1) * radialSegments + s;
            const d = (r + 1) * radialSegments + sNext;

            indices[idxOffset++] = a;
            indices[idxOffset++] = c;
            indices[idxOffset++] = b;

            indices[idxOffset++] = b;
            indices[idxOffset++] = c;
            indices[idxOffset++] = d;
        }
    }

    return {
        ok: true,
        buffers: {
            positions,
            normals,
            colors,
            indices,
            vertCount,
            ringCount,
            radialSegments,
        },
    };
}

/**
 * Sumariza buffers para diagnostico/HUD.
 */
export function buffersSummary(buffers: TubeMeshBuffers | null | undefined): BuffersSummary {
    if (!buffers || typeof buffers !== 'object') {
        return { vertCount: 0, triCount: 0, ringCount: 0, radialSegments: 0 };
    }
    const triCount = buffers.indices ? buffers.indices.length / 3 : 0;
    return {
        vertCount: buffers.vertCount || 0,
        triCount,
        ringCount: buffers.ringCount || 0,
        radialSegments: buffers.radialSegments || 0,
    };
}

console.debug('[mod:end]', 'app/js/core/geology/wellMeshBuilder.js');
