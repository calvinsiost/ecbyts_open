// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/* ================================================================
   GEOMETRY HELPERS (utils/helpers — Module C extraction)
   ================================================================

   Pure-logic geometry primitives.
   Extraído de 6+ implementações duplicadas detectadas via grep
   "function distance" + Math.sqrt(dx*dx + dy*dy [+ dz*dz]).
   ================================================================ */

export interface Point2D {
    x: number;
    y: number;
}

export interface Point3D {
    x: number;
    y: number;
    z: number;
}

/**
 * Euclidean distance 2D. Defensivo: null/non-finite → 0.
 * Aceita pontos com .x/.y; ignora .z se presente.
 */
export function distance2D(
    a: Point2D | { x: number; y: number } | null | undefined,
    b: Point2D | { x: number; y: number } | null | undefined,
): number {
    if (!a || !b) return 0;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Euclidean distance 3D. Defensivo: null/non-finite → 0.
 * Hot path em scene/lod/voxel/sequencer/trajectory.
 */
export function distance3D(
    a: Point3D | { x: number; y: number; z: number } | null | undefined,
    b: Point3D | { x: number; y: number; z: number } | null | undefined,
): number {
    if (!a || !b) return 0;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    const dz = Number(a.z) - Number(b.z);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz)) return 0;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Distance squared 2D (sem sqrt). Use para ordenação por distância
 * (sqrt é monotônica). Mesma defensividade.
 */
export function distanceSquared2D(
    a: Point2D | null | undefined,
    b: Point2D | null | undefined,
): number {
    if (!a || !b) return 0;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
    return dx * dx + dy * dy;
}
