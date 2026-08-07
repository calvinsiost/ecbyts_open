// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Graph Layout - Phase 1.6 pure logic helpers
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md (extension)
 *
 * Phase 1.6 (2026-05-01) - pure-logic helpers para posicionar nós do
 * grafo constellation. Complementa:
 *   - Phase 1 metricSizing (radius por métrica)
 *   - Phase 1.5 metricBinning (color ramp por bin)
 *
 * Estratégias de layout:
 *   - 'circular': nós distribuídos em anel uniforme
 *   - 'grid': layout em grade NxM
 *   - 'force': iteração simples force-directed (Fruchterman-Reingold simplificado)
 *   - 'hierarchical': agrupamento por level/depth
 *
 * Foco em determinismo (mesma entrada → mesma saída) para testes.
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Estratégias canônicas. */
export const LAYOUT_STRATEGIES = Object.freeze({
    CIRCULAR: 'circular',
    GRID: 'grid',
    FORCE: 'force',
    HIERARCHICAL: 'hierarchical',
});

/** Bounds default para layout (px). */
export const DEFAULT_LAYOUT_BOUNDS = Object.freeze({
    width: 800,
    height: 600,
    padding: 40,
});

/** Force-directed defaults. */
export const DEFAULT_FORCE_PARAMS = Object.freeze({
    iterations: 50,
    repulsion: 1000,
    attraction: 0.05,
    damping: 0.85,
    minDistance: 10,
});

/**
 * Posiciona nós em layout circular uniforme.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Object} [options]
 * @param {{width:number, height:number, padding:number}} [options.bounds]
 * @param {number} [options.startAngle] - radianos
 * @returns {Map<string, {x: number, y: number}>}
 */
export function computeCircularLayout(nodes: Array<{id: string}>, options: { bounds?: {width:number, height:number, padding:number}; startAngle?: number } = {}): Map<string, {x: number, y: number}> {
    const positions = new Map();
    if (!Array.isArray(nodes) || nodes.length === 0) return positions;

    const bounds = { ...DEFAULT_LAYOUT_BOUNDS, ...(options.bounds || {}) };
    const startAngle: number = Number.isFinite(options.startAngle) ? (options.startAngle as number) : 0;

    const cx = bounds.width / 2;
    const cy = bounds.height / 2;
    const radius = Math.min(cx, cy) - bounds.padding;
    const step = (Math.PI * 2) / nodes.length;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || node.id == null) continue;
        const angle = startAngle + i * step;
        positions.set(String(node.id), {
            x: cx + radius * Math.cos(angle),
            y: cy + radius * Math.sin(angle),
        });
    }
    return positions;
}

/**
 * Posiciona nós em layout grid NxM.
 *
 * @param {Array<{id: string}>} nodes
 * @param {Record<string, any>} [options]
 * @returns {Map<string, {x: number, y: number}>}
 */
export function computeGridLayout(nodes: Array<{id: string}>, options: Record<string, any> = {}): Map<string, {x: number, y: number}> {
    const positions = new Map();
    if (!Array.isArray(nodes) || nodes.length === 0) return positions;

    const bounds = { ...DEFAULT_LAYOUT_BOUNDS, ...(options.bounds || {}) };
    const usableWidth = bounds.width - 2 * bounds.padding;
    const usableHeight = bounds.height - 2 * bounds.padding;

    const cols = options.cols && options.cols > 0 ? Math.floor(options.cols) : Math.ceil(Math.sqrt(nodes.length));
    const rows = Math.ceil(nodes.length / cols);

    const cellW = cols > 1 ? usableWidth / (cols - 1) : 0;
    const cellH = rows > 1 ? usableHeight / (rows - 1) : 0;

    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (!node || node.id == null) continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions.set(String(node.id), {
            x: bounds.padding + col * cellW,
            y: bounds.padding + row * cellH,
        });
    }
    return positions;
}

type LevelNode = { id: string; level?: number };

function _groupNodesByLevel(nodes: LevelNode[]): { byLevel: Map<number, LevelNode[]>; maxLevel: number } {
    const byLevel = new Map<number, LevelNode[]>();
    let maxLevel = 0;
    for (const node of nodes) {
        if (!node || node.id == null) continue;
        const lvl = Number.isInteger(node.level) ? (node.level as number) : 0;
        if (!byLevel.has(lvl)) byLevel.set(lvl, []);
        byLevel.get(lvl)!.push(node);
        if (lvl > maxLevel) maxLevel = lvl;
    }
    return { byLevel, maxLevel };
}

/**
 * Layout hierárquico por level/depth.
 *
 * @param {Array<{id: string, level?: number}>} nodes
 * @param {Record<string, any>} [options]
 * @returns {Map<string, {x: number, y: number}>}
 */
export function computeHierarchicalLayout(nodes: Array<{id: string, level?: number}>, options: Record<string, any> = {}): Map<string, {x: number, y: number}> {
    const positions = new Map();
    if (!Array.isArray(nodes) || nodes.length === 0) return positions;

    const bounds = { ...DEFAULT_LAYOUT_BOUNDS, ...(options.bounds || {}) };
    const usableWidth = bounds.width - 2 * bounds.padding;
    const usableHeight = bounds.height - 2 * bounds.padding;

    const { byLevel, maxLevel } = _groupNodesByLevel(nodes);

    const levelCount = maxLevel + 1;
    const yStep = levelCount > 1 ? usableHeight / (levelCount - 1) : 0;

    for (const [level, levelNodes] of byLevel) {
        const y = bounds.padding + level * yStep;
        const xStep = levelNodes.length > 1 ? usableWidth / (levelNodes.length - 1) : 0;
        for (let i = 0; i < levelNodes.length; i++) {
            const node = levelNodes[i];
            if (!node) continue;
            const x = levelNodes.length > 1 ? bounds.padding + i * xStep : bounds.padding + usableWidth / 2;
            positions.set(String(node.id), { x, y });
        }
    }
    return positions;
}

type Point = { x: number; y: number };
type Force = { fx: number; fy: number };

function _applyRepulsionForces(
    ids: string[],
    positions: Map<string, Point>,
    forces: Map<string, Force>,
    params: { repulsion: number; minDistance: number },
): void {
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            const a = positions.get(ids[i]!)!;
            const b = positions.get(ids[j]!)!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.max(params.minDistance, Math.sqrt(dx * dx + dy * dy));
            const force = params.repulsion / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            forces.get(ids[i]!)!.fx += fx;
            forces.get(ids[i]!)!.fy += fy;
            const f2 = forces.get(ids[j]!);
            if (f2) {
                f2.fx -= fx;
                f2.fy -= fy;
            }
        }
    }
}

function _applyAttractionForces(
    edges: Array<{source: string; target: string}>,
    positions: Map<string, Point>,
    forces: Map<string, Force>,
    params: { attraction: number },
): void {
    for (const edge of edges) {
        const a = positions.get(String(edge.source))!;
        const b = positions.get(String(edge.target))!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const fx = dx * params.attraction;
        const fy = dy * params.attraction;
        forces.get(String(edge.source))!.fx += fx;
        forces.get(String(edge.source))!.fy += fy;
        forces.get(String(edge.target))!.fx -= fx;
        forces.get(String(edge.target))!.fy -= fy;
    }
}

/**
 * Layout force-directed simplificado (Fruchterman-Reingold pure JS).
 * Determinístico via seed inicial (positions iniciais por hash de id).
 *
 * @param {Array<{id: string}>} nodes
 * @param {Array<{source: string, target: string}>} edges
 * @param {Record<string, any>} [options]
 * @returns {Map<string, {x: number, y: number}>}
 */
export function computeForceLayout(nodes: Array<{id: string}>, edges: Array<{source: string, target: string}> = [], options: Record<string, any> = {}): Map<string, {x: number, y: number}> {
    const positions = new Map();
    if (!Array.isArray(nodes) || nodes.length === 0) return positions;

    const bounds = { ...DEFAULT_LAYOUT_BOUNDS, ...(options.bounds || {}) };
    const params = { ...DEFAULT_FORCE_PARAMS, ...(options.params || {}) };

    // Init positions deterministically via hash of id.
    for (const node of nodes) {
        if (!node || node.id == null) continue;
        const id = String(node.id);
        const seed = simpleHash(id);
        positions.set(id, {
            x: bounds.padding + ((seed % 1000) / 1000) * (bounds.width - 2 * bounds.padding),
            y: bounds.padding + (((seed >> 10) % 1000) / 1000) * (bounds.height - 2 * bounds.padding),
        });
    }

    if (positions.size < 2) return positions;

    const validEdges = (Array.isArray(edges) ? edges : []).filter(
        (e) => e && positions.has(String(e.source)) && positions.has(String(e.target)),
    );

    const ids = [...positions.keys()];
    const velocities = new Map(ids.map((id) => [id, { vx: 0, vy: 0 }]));

    for (let iter = 0; iter < params.iterations; iter++) {
        const forces = new Map(ids.map((id) => [id, { fx: 0, fy: 0 }]));

        _applyRepulsionForces(ids, positions, forces, params);
        _applyAttractionForces(validEdges, positions, forces, params);

        // Apply velocity + damping.
        for (const id of ids) {
            const vel = velocities.get(id)!;
            const force = forces.get(id)!;
            vel.vx = (vel.vx + force.fx) * params.damping;
            vel.vy = (vel.vy + force.fy) * params.damping;
            const pos = positions.get(id)!;
            pos.x = clamp(pos.x + vel.vx, bounds.padding, bounds.width - bounds.padding);
            pos.y = clamp(pos.y + vel.vy, bounds.padding, bounds.height - bounds.padding);
        }
    }

    return positions;
}

/**
 * Calcula bounding box de um conjunto de positions.
 *
 * @param {Map<string, {x: number, y: number}>} positions
 * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number} | null}
 */
export function computeBoundingBox(positions: Map<string, {x: number, y: number}>): {minX: number, minY: number, maxX: number, maxY: number, width: number, height: number} | null {
    if (!(positions instanceof Map) || positions.size === 0) return null;
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
    for (const { x, y } of positions.values()) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }
    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

/**
 * Normaliza positions para caber dentro de bounds (target).
 *
 * @param {Map<string, {x: number, y: number}>} positions
 * @param {Record<string, any>} bounds
 * @returns {Map<string, {x: number, y: number}>}
 */
export function fitPositionsToBounds(positions: Map<string, {x: number, y: number}>, bounds: Record<string, any> = DEFAULT_LAYOUT_BOUNDS): Map<string, {x: number, y: number}> {
    const out = new Map();
    if (!(positions instanceof Map) || positions.size === 0) return out;
    const bb = computeBoundingBox(positions);
    if (!bb || bb.width === 0 || bb.height === 0) {
        for (const [id, p] of positions) out.set(id, { ...p });
        return out;
    }
    const targetW = bounds.width - 2 * bounds.padding;
    const targetH = bounds.height - 2 * bounds.padding;
    const scale = Math.min(targetW / bb.width, targetH / bb.height);
    for (const [id, p] of positions) {
        const x = bounds.padding + (p.x - bb.minX) * scale;
        const y = bounds.padding + (p.y - bb.minY) * scale;
        out.set(id, { x, y });
    }
    return out;
}

// ---------- helpers ----------
function simpleHash(str: any) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = (hash * 33 + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
}

import { clamp } from '../../utils/helpers/math.js';

/**
 * Module identity export.
 */
export const constellationGraphLayoutMeta = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.6',
    deliveredAt: '2026-05-01',
    strategies: Object.values(LAYOUT_STRATEGIES),
    exports: [
        'LAYOUT_STRATEGIES',
        'DEFAULT_LAYOUT_BOUNDS',
        'DEFAULT_FORCE_PARAMS',
        'computeCircularLayout',
        'computeGridLayout',
        'computeHierarchicalLayout',
        'computeForceLayout',
        'computeBoundingBox',
        'fitPositionsToBounds',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
