// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Cluster Centroid + Bounding Box - Phase 1.36 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.36 (2026-05-01) - pure-logic helpers para computar geometria
 * agregada de clusters (centroid, bounding box, radius). Complementa:
 *   - Phase 1.8 clusterDetection (membros do cluster)
 *   - Phase 1.20 convexHull (centroid de polígono)
 *   - Phase 1.27 minimap (computeWorldBounds AABB)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface Point2D {
    x: number;
    y: number;
}

interface IdPoint extends Point2D {
    id: string;
}

interface ClusterInput {
    id?: string;
    members: Array<string>;
}

type PositionsInput =
    | Map<string, Point2D>
    | Array<{ id: string; x: number; y: number }>
    | null
    | undefined
    | unknown;

interface Centroid {
    x: number;
    y: number;
    count: number;
}

interface ClusterBBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
    count: number;
}

interface ClusterSummary {
    id: string | null;
    centroid: Centroid | null;
    bbox: ClusterBBox | null;
    radius: number;
    diameter: number;
    count: number;
}

/**
 * Resolve coordenadas {x,y} de um nó em um Map<id, {x,y}> ou em uma lista
 * de nós com {id, x, y}.
 */
function buildPositionLookup(positions: any): Map<string, Point2D> {
    if (positions instanceof Map) return positions;
    const map = new Map<string, Point2D>();
    if (!Array.isArray(positions)) return map;
    for (const p of positions) {
        if (!p || p.id == null) continue;
        if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        map.set(String(p.id), { x: p.x, y: p.y });
    }
    return map;
}

function resolveMembers(cluster: any, positionLookup: Map<string, Point2D>): IdPoint[] {
    const members = Array.isArray(cluster?.members) ? cluster.members : [];
    const points: IdPoint[] = [];
    for (const id of members) {
        const key = String(id);
        const p = positionLookup.get(key);
        if (!p) continue;
        if (typeof p.x !== 'number' || typeof p.y !== 'number') continue;
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        points.push({ id: key, x: p.x, y: p.y });
    }
    return points;
}

/**
 * Centroid (média aritmética x/y) de um cluster.
 *
 * @param {{members: Array<string>}} cluster
 * @param {Map<string,{x:number,y:number}>|Array<{id:string,x:number,y:number}>} positions
 * @returns {{x:number,y:number,count:number}|null} null se sem pontos válidos.
 */
export function computeClusterCentroid(cluster: ClusterInput, positions: PositionsInput): Centroid | null {
    const lookup = buildPositionLookup(positions);
    const points = resolveMembers(cluster, lookup);
    if (points.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
    }
    return { x: sx / points.length, y: sy / points.length, count: points.length };
}

/**
 * Bounding box (AABB) min/max x/y de um cluster.
 *
 * @param {{members: Array<string>}} cluster
 * @param {Map<string,{x:number,y:number}>|Array<{id:string,x:number,y:number}>} positions
 * @returns {{minX:number,minY:number,maxX:number,maxY:number,width:number,height:number,count:number}|null}
 */
export function computeClusterBBox(cluster: ClusterInput, positions: PositionsInput): ClusterBBox | null {
    const lookup = buildPositionLookup(positions);
    const points = resolveMembers(cluster, lookup);
    if (points.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
        count: points.length,
    };
}

/**
 * Raio do cluster: distância máxima entre o centroid e qualquer membro.
 *
 * @param {{members: Array<string>}} cluster
 * @param {Map<string,{x:number,y:number}>|Array<{id:string,x:number,y:number}>} positions
 * @returns {number} 0 se vazio ou inválido.
 */
export function clusterRadius(cluster: ClusterInput, positions: PositionsInput): number {
    const lookup = buildPositionLookup(positions);
    const points = resolveMembers(cluster, lookup);
    if (points.length === 0) return 0;
    let sx = 0;
    let sy = 0;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
    }
    const cx = sx / points.length;
    const cy = sy / points.length;
    let maxDistSq = 0;
    for (const p of points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxDistSq) maxDistSq = d2;
    }
    return Math.sqrt(maxDistSq);
}

/**
 * Sumário geométrico de um cluster: centroid + bbox + radius + diameter.
 *
 * @param {{id?:string, members: Array<string>}} cluster
 * @param {Map<string,{x:number,y:number}>|Array<{id:string,x:number,y:number}>} positions
 * @returns {{id:string|null, centroid:any, bbox:any, radius:number, diameter:number, count:number}}
 */
export function summarizeCluster(cluster: ClusterInput, positions: PositionsInput): ClusterSummary {
    const lookup = buildPositionLookup(positions);
    const points = resolveMembers(cluster, lookup);
    const id = cluster && cluster.id != null ? String(cluster.id) : null;
    if (points.length === 0) {
        return { id, centroid: null, bbox: null, radius: 0, diameter: 0, count: 0 };
    }
    let sx = 0;
    let sy = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        sx += p.x;
        sy += p.y;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
    }
    const cx = sx / points.length;
    const cy = sy / points.length;
    let maxDistSq = 0;
    for (const p of points) {
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > maxDistSq) maxDistSq = d2;
    }
    const radius = Math.sqrt(maxDistSq);
    return {
        id,
        centroid: { x: cx, y: cy, count: points.length },
        bbox: {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX,
            height: maxY - minY,
            count: points.length,
        },
        radius,
        diameter: radius * 2,
        count: points.length,
    };
}

/** Module identity. */
export const CLUSTER_CENTROID_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.36',
    deliveredAt: '2026-05-01',
    exports: [
        'computeClusterCentroid',
        'computeClusterBBox',
        'clusterRadius',
        'summarizeCluster',
        'CLUSTER_CENTROID_META',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
