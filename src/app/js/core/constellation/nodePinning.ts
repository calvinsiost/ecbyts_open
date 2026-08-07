// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Pinning - Phase 1.41 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S41
 *
 * Phase 1.41 (2026-05-01) - pure-logic pinning de nodes em posições fixas.
 * Nodes pinned mantêm coordenadas (x,y) durante force layout / transitions.
 *
 * Modelo:
 *   - PinRegistry: Map<nodeId, { x:number, y:number, pinnedAt:string }>
 *   - applyPinConstraints: snapshot pos para nodes pinned, skipping force updates
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

export interface PinRecord {
    x: number;
    y: number;
    pinnedAt: string;
}

export type PinRegistry = Map<string, PinRecord>;

export interface PinnableNode {
    id?: string;
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number;
    fy?: number;
}

export const NODE_PINNING_META = {
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.41',
    deliveredAt: '2026-05-01',
} as const;

function ensureRegistry(reg: unknown): PinRegistry {
    if (!(reg instanceof Map)) throw new TypeError('registry must be a Map');
    return reg as PinRegistry;
}

function ensureNodeId(id: unknown): string {
    if (typeof id !== 'string' || !id.trim()) {
        throw new TypeError('nodeId must be non-empty string');
    }
    return id;
}

function ensureFiniteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TypeError(`${name} must be finite number`);
    }
    return value;
}

/**
 * Cria registry vazio de pins.
 */
export function createPinRegistry(): PinRegistry {
    return new Map();
}

/**
 * Pin um node em (x, y). Sobrescreve pin existente.
 *
 * @param registry
 * @param nodeId
 * @param x
 * @param y
 * @param opts
 * @returns pin record
 */
export function pinNode(
    registry: PinRegistry,
    nodeId: string,
    x: number,
    y: number,
    opts: { pinnedAt?: string } = {},
): PinRecord {
    ensureRegistry(registry);
    ensureNodeId(nodeId);
    ensureFiniteNumber(x, 'x');
    ensureFiniteNumber(y, 'y');
    const record: PinRecord = Object.freeze({
        x,
        y,
        pinnedAt: typeof opts.pinnedAt === 'string' ? opts.pinnedAt : new Date().toISOString(),
    });
    registry.set(nodeId, record);
    return record;
}

/**
 * Remove pin de um node. Retorna true se removeu, false se não estava pinned.
 *
 * @param registry
 * @param nodeId
 * @returns boolean
 */
export function unpinNode(registry: PinRegistry, nodeId: string): boolean {
    ensureRegistry(registry);
    ensureNodeId(nodeId);
    return registry.delete(nodeId);
}

/**
 * Verifica se node está pinned.
 *
 * @param registry
 * @param nodeId
 * @returns boolean
 */
export function isPinned(registry: PinRegistry, nodeId: string): boolean {
    ensureRegistry(registry);
    ensureNodeId(nodeId);
    return registry.has(nodeId);
}

/**
 * Obtém pin record (frozen) ou null.
 *
 * @param registry
 * @param nodeId
 * @returns PinRecord|null
 */
export function getPin(registry: PinRegistry, nodeId: string): PinRecord | null {
    ensureRegistry(registry);
    ensureNodeId(nodeId);
    return registry.get(nodeId) || null;
}

/**
 * Aplica constraints de pin a um array de nodes (mutates in-place).
 * Para cada node com id pinned: força x,y para coords pinadas e zera vx/vy/fx/fy
 * (skip in force layout integrators).
 *
 * Retorna número de nodes affected.
 *
 * @param registry
 * @param nodes
 * @returns number
 */
export function applyPinConstraints(registry: PinRegistry, nodes: PinnableNode[]): number {
    ensureRegistry(registry);
    if (!Array.isArray(nodes)) throw new TypeError('nodes must be array');
    if (registry.size === 0) return 0;
    let affected = 0;
    for (const node of nodes) {
        if (!node || typeof node.id !== 'string') continue;
        const pin = registry.get(node.id);
        if (!pin) continue;
        node.x = pin.x;
        node.y = pin.y;
        if ('vx' in node) node.vx = 0;
        if ('vy' in node) node.vy = 0;
        if ('fx' in node) node.fx = 0;
        if ('fy' in node) node.fy = 0;
        affected += 1;
    }
    return affected;
}

/**
 * Resumo do estado de pinning.
 *
 * @param registry
 * @returns {{count:number, nodeIds:string[]}}
 */
export function summarizePins(registry: PinRegistry): Readonly<{ count: number; nodeIds: string[] }> {
    ensureRegistry(registry);
    return Object.freeze({
        count: registry.size,
        nodeIds: Array.from(registry.keys()),
    });
}

/**
 * Limpa todos os pins. Retorna número removido.
 *
 * @param registry
 * @returns number
 */
export function clearPins(registry: PinRegistry): number {
    ensureRegistry(registry);
    const n = registry.size;
    registry.clear();
    return n;
}