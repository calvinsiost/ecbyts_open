// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   FAULT GEOMETRY — Geologia estrutural pure math
   ================================================================
   P1-8 Family Fault Wells Directional (Claude-owner)

   Convencoes:
   - X=East, Y=Up, Z=North (Three.js)
   - Strike: azimute clockwise desde Norte (0-360)
   - Dip: angulo desde horizontal (0-90), perpendicular ao strike
   - Right-hand rule per ISRM
   ================================================================ */

const DEG = Math.PI / 180;

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export interface Plane {
    a: number;
    b: number;
    c: number;
    d: number;
    normal: Vec3;
}

export interface LinePlaneIntersectionPoint extends Vec3 {
    t: number;
}

export interface FaultIntersection extends LinePlaneIntersectionPoint {
    segmentIndex: number;
}

export interface LinePlaneOptions {
    extendLine?: boolean;
}

export type FaultMovement = 'normal' | 'reverse' | 'strike-slip-left' | 'strike-slip-right' | 'oblique';

/**
 * Normaliza angulo para [0, 360).
 */
export function normalizeAzimuth(angle: number): number {
    if (!Number.isFinite(angle)) return 0;
    let a = angle % 360;
    if (a < 0) a += 360;
    return a;
}

/**
 * Clamp angulo de dip para [0, 90].
 */
export function clampDip(dip: number): number {
    if (!Number.isFinite(dip)) return 0;
    return Math.max(0, Math.min(90, dip));
}

/**
 * Direcao do dip (azimute) — 90 graus clockwise do strike.
 */
export function dipDirectionFromStrike(strike: number): number {
    return normalizeAzimuth(strike + 90);
}

/**
 * Calcula vetor normal ao plano de falha a partir de strike + dip.
 */
export function strikeDipToNormal(strike: number, dip: number): Vec3 {
    const S = normalizeAzimuth(strike) * DEG;
    const D = clampDip(dip) * DEG;
    return {
        x: Math.cos(S) * Math.sin(D),
        y: Math.cos(D),
        z: -Math.sin(S) * Math.sin(D),
    };
}

/**
 * Equacao do plano de falha: ax + by + cz = d.
 */
export function planeEquation(strike: number, dip: number, point0?: Partial<Vec3> | null): Plane {
    const n = strikeDipToNormal(strike, dip);
    const p = point0 || { x: 0, y: 0, z: 0 };
    const d = n.x * (p.x || 0) + n.y * (p.y || 0) + n.z * (p.z || 0);
    return { a: n.x, b: n.y, c: n.z, d, normal: n };
}

/**
 * Distancia sinalizada do ponto ao plano. Positivo = lado do normal.
 */
export function distancePointToPlane(
    point: Partial<Vec3> | null | undefined,
    plane: Pick<Plane, 'a' | 'b' | 'c' | 'd'> | null | undefined,
): number {
    if (!point || !plane) return 0;
    const { a, b, c, d } = plane;
    const norm = Math.sqrt(a * a + b * b + c * c);
    if (norm < 1e-15) return 0;
    return (a * (point.x || 0) + b * (point.y || 0) + c * (point.z || 0) - d) / norm;
}

/**
 * Verifica se o ponto esta acima do plano de falha (lado do normal).
 */
export function isPointAboveFault(
    point: Partial<Vec3> | null | undefined,
    plane: Pick<Plane, 'a' | 'b' | 'c' | 'd'> | null | undefined,
): boolean {
    return distancePointToPlane(point, plane) > 0;
}

/**
 * Intersecao linha-plano em 3D.
 */
export function linePlaneIntersection(
    lineStart: Partial<Vec3> | null | undefined,
    lineEnd: Partial<Vec3> | null | undefined,
    plane: Pick<Plane, 'a' | 'b' | 'c' | 'd'> | null | undefined,
    opts: LinePlaneOptions = {},
): LinePlaneIntersectionPoint | null {
    if (!lineStart || !lineEnd || !plane) return null;
    const dx = (lineEnd.x || 0) - (lineStart.x || 0);
    const dy = (lineEnd.y || 0) - (lineStart.y || 0);
    const dz = (lineEnd.z || 0) - (lineStart.z || 0);
    const denom = plane.a * dx + plane.b * dy + plane.c * dz;
    if (Math.abs(denom) < 1e-15) {
        return null;
    }
    const numer =
        plane.d - (plane.a * (lineStart.x || 0) + plane.b * (lineStart.y || 0) + plane.c * (lineStart.z || 0));
    const t = numer / denom;
    if (!opts.extendLine && (t < 0 || t > 1)) return null;
    return {
        x: (lineStart.x || 0) + t * dx,
        y: (lineStart.y || 0) + t * dy,
        z: (lineStart.z || 0) + t * dz,
        t,
    };
}

/**
 * Detecta intersecoes entre trajetoria de poco e plano de falha.
 */
export function intersectFaultWellTrajectory(
    trajectory: ReadonlyArray<Partial<Vec3>>,
    plane: Pick<Plane, 'a' | 'b' | 'c' | 'd'> | null | undefined,
): FaultIntersection[] {
    if (!Array.isArray(trajectory) || trajectory.length < 2 || !plane) return [];
    const intersections: FaultIntersection[] = [];
    for (let i = 0; i < trajectory.length - 1; i++) {
        const a = trajectory[i];
        const b = trajectory[i + 1];
        if (!a || !b) continue;
        const hit = linePlaneIntersection(a, b, plane);
        if (hit) {
            intersections.push({ ...hit, segmentIndex: i });
        }
    }
    return intersections;
}

/**
 * Classifica tipo de movimento da falha a partir do rake angle.
 */
export function classifyFaultMovement(rakeAngle: number): FaultMovement {
    if (!Number.isFinite(rakeAngle)) return 'oblique';
    const r = ((rakeAngle % 360) + 360) % 360;
    const TOL = 22.5;
    if (Math.abs(r - 0) < TOL || Math.abs(r - 360) < TOL) return 'strike-slip-left';
    if (Math.abs(r - 90) < TOL) return 'normal';
    if (Math.abs(r - 180) < TOL) return 'strike-slip-right';
    if (Math.abs(r - 270) < TOL) return 'reverse';
    return 'oblique';
}

/**
 * Apparent dip — angulo de mergulho aparente em secao nao-perpendicular ao strike.
 *   tan(alpha) = tan(delta) * sin(beta)
 */
export function apparentDip(trueDip: number, sectionAngleFromStrike: number): number {
    const D = clampDip(trueDip) * DEG;
    let beta = (Math.abs(sectionAngleFromStrike) || 0) % 180;
    if (beta > 90) beta = 180 - beta;
    const b = beta * DEG;
    const tanAlpha = Math.tan(D) * Math.sin(b);
    return Math.atan(tanAlpha) / DEG;
}
