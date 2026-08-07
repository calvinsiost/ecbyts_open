// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Cross-Section Math — pure-logic, zero DOM/three.js
 *
 * UX-31 Phase 4 of SPEC_3D_MODEL_EXPLORATION_JOURNEY.
 *
 * Vetores são objetos planos {x,y,z}. Sem dependências externas.
 * Tolerância numérica: 1e-9.
 */

const EPS = 1e-9;

export interface Vec3 {
    readonly x: number;
    readonly y: number;
    readonly z: number;
}

export interface Plane {
    readonly origin: Vec3;
    readonly normal: Vec3;
}

export interface Segment {
    readonly a: Vec3;
    readonly b: Vec3;
}

export interface VoxelGridDims {
    readonly nx: number;
    readonly ny: number;
    readonly nz: number;
}

export interface VoxelGrid {
    readonly origin: Vec3;
    readonly cellSize: number | Vec3;
    readonly dims: VoxelGridDims;
    getValue(i: number, j: number, k: number): unknown;
}

export interface SliceCell {
    readonly i: number;
    readonly j: number;
    readonly k: number;
    readonly value: unknown;
    readonly center: Vec3;
}

// ─── Helpers vetoriais (internos) ─────────────────────────────────────────

function sub(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function length(v: Vec3): number {
    return Math.sqrt(dot(v, v));
}

function normalize(v: Vec3): Vec3 {
    const l = length(v);
    if (l < EPS) {
        throw new Error('crossSectionMath: cannot normalize zero-length vector');
    }
    return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function scale(v: Vec3, s: number): Vec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

// ─── API pública ──────────────────────────────────────────────────────────

/**
 * Define plano vertical contendo p1-p2 e o vetor up.
 * Normal = normalize(cross(p2-p1, up)).
 */
export function definePlaneFromTwoPoints(
    p1: Vec3,
    p2: Vec3,
    upVector: Vec3 = { x: 0, y: 0, z: 1 },
): Plane {
    const dir = sub(p2, p1);
    if (length(dir) < EPS) {
        throw new Error('crossSectionMath: p1 and p2 are coincident');
    }
    const n = cross(dir, upVector);
    if (length(n) < EPS) {
        throw new Error('crossSectionMath: upVector is parallel to p2-p1; cannot define vertical plane');
    }
    return {
        origin: { x: p1.x, y: p1.y, z: p1.z },
        normal: normalize(n),
    };
}

/**
 * Distância assinada de um ponto ao plano.
 */
export function signedDistance(point: Vec3, plane: Plane): number {
    return dot(sub(point, plane.origin), plane.normal);
}

/**
 * Lado do ponto em relação ao plano: -1, 0, +1.
 */
export function pointSideOfPlane(point: Vec3, plane: Plane): -1 | 0 | 1 {
    const d = signedDistance(point, plane);
    if (d > EPS) return 1;
    if (d < -EPS) return -1;
    return 0;
}

/**
 * Intersecção de segmento {a,b} com plano. Retorna ponto ou null
 * (paralelo, ou não cruza).
 */
export function intersectSegmentPlane(seg: Segment, plane: Plane): Vec3 | null {
    const { a, b } = seg;
    const ab = sub(b, a);
    const denom = dot(ab, plane.normal);
    if (Math.abs(denom) < EPS) {
        return null;
    }
    const t = dot(sub(plane.origin, a), plane.normal) / denom;
    if (t < -EPS || t > 1 + EPS) return null;
    const tClamped = Math.max(0, Math.min(1, t));
    return add(a, scale(ab, tClamped));
}

/**
 * Projeta ponto sobre o plano.
 */
export function projectPointOntoPlane(point: Vec3, plane: Plane): Vec3 {
    const d = signedDistance(point, plane);
    return sub(point, scale(plane.normal, d));
}

/**
 * Slice de uma voxel grid: retorna lista plana de células {i,j,k,value,center}
 * cujos 8 cantos não estão todos do mesmo lado do plano (i.e., a célula é
 * atravessada pelo plano).
 */
export function sliceVoxelGrid(grid: VoxelGrid, plane: Plane): SliceCell[] {
    if (!grid || !grid.dims || !grid.origin || typeof grid.getValue !== 'function') {
        throw new Error('crossSectionMath: invalid grid');
    }
    const { nx, ny, nz } = grid.dims;
    const cs: Vec3 =
        typeof grid.cellSize === 'number'
            ? { x: grid.cellSize, y: grid.cellSize, z: grid.cellSize }
            : grid.cellSize;
    const o = grid.origin;
    const result: SliceCell[] = [];
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) {
            for (let k = 0; k < nz; k++) {
                let hasPos = false;
                let hasNeg = false;
                let hasZero = false;
                for (let dx = 0; dx <= 1 && !(hasPos && hasNeg); dx++) {
                    for (let dy = 0; dy <= 1 && !(hasPos && hasNeg); dy++) {
                        for (let dz = 0; dz <= 1 && !(hasPos && hasNeg); dz++) {
                            const corner: Vec3 = {
                                x: o.x + (i + dx) * cs.x,
                                y: o.y + (j + dy) * cs.y,
                                z: o.z + (k + dz) * cs.z,
                            };
                            const s = pointSideOfPlane(corner, plane);
                            if (s > 0) hasPos = true;
                            else if (s < 0) hasNeg = true;
                            else hasZero = true;
                        }
                    }
                }
                if ((hasPos && hasNeg) || hasZero) {
                    const center: Vec3 = {
                        x: o.x + (i + 0.5) * cs.x,
                        y: o.y + (j + 0.5) * cs.y,
                        z: o.z + (k + 0.5) * cs.z,
                    };
                    result.push({ i, j, k, value: grid.getValue(i, j, k), center });
                }
            }
        }
    }
    return result;
}

/**
 * Congela plano (deep) para uso como referência imutável.
 */
export function frozenPlane(plane: Plane): Plane {
    return Object.freeze({
        origin: Object.freeze({ ...plane.origin }),
        normal: Object.freeze({ ...plane.normal }),
    });
}
