// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Graph Node Pinning - Phase 1.64
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S64
 *
 * Phase 1.64 (2026-05-02) - immutable pinSet API for graph node position locking.
 * Complementa nodePinning.js (Map-based, Phase 1.41) com interface imutável
 * baseada em frozen objects - adequada para undo/redo e time-travel de estado.
 *
 * Modelo:
 *   PinSet: { pins: { [nodeId: string]: { x: number, y: number } }, count: number }
 *   Todas as operações retornam novos PinSets frozen (imutável).
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase/Promise/setTimeout.
 *
 * Owner: Claude (orquestrador)
 */

/** Identidade do módulo. */
export const NODE_PINNING_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.64',
    deliveredAt: '2026-05-02',
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Valida que pinSet possui a estrutura esperada.
 * @param {any} pinSet
 */
function assertPinSet(pinSet: any) {
    if (
        pinSet === null ||
        typeof pinSet !== 'object' ||
        typeof pinSet.pins !== 'object' ||
        pinSet.pins === null ||
        typeof pinSet.count !== 'number'
    ) {
        throw new TypeError('pinSet must be a frozen object with {pins, count}');
    }
}

/**
 * Valida que nodeId é string não-vazia.
 * @param {*} nodeId
 */
function assertNodeId(nodeId: any) {
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
        throw new TypeError('nodeId must be a non-empty string');
    }
}

/**
 * Valida que position é objeto com x,y números finitos.
 * @param {*} position
 */
function assertPosition(position: any) {
    if (
        position === null ||
        typeof position !== 'object' ||
        typeof position.x !== 'number' ||
        !Number.isFinite(position.x) ||
        typeof position.y !== 'number' ||
        !Number.isFinite(position.y)
    ) {
        throw new TypeError('position must be an object with finite numeric x and y');
    }
}

/**
 * Constrói novo PinSet frozen a partir de um objeto de pins.
 * @param {Record<string, any>} pins
 * @returns {{ pins: Record<string, any>, count: number }}
 */
function buildPinSet(pins: Record<string, any>): { pins: Record<string, any>, count: number } {
    const frozenPins = Object.freeze(
        Object.fromEntries(
            Object.entries(pins).map(([id, /** @type {any} */ pos]) => [id, Object.freeze({ x: pos.x, y: pos.y })]),
        ),
    );
    return Object.freeze({ pins: frozenPins, count: Object.keys(frozenPins).length });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Cria PinSet vazio.
 * @returns {{ pins: Record<string, any>, count: number }}
 */
export function createPinSet() {
    return (Object.freeze({ pins: Object.freeze({}), count: 0 }) as { pins: Record<string, any>, count: number });
}

/**
 * Pina um node na posição {x, y} fornecida.
 * Sobrescreve pin existente se nodeId já estava pinado.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @param {string} nodeId
 * @param {{ x: number, y: number }} position
 * @returns {{ pins: Record<string, any>, count: number }}
 * @throws {TypeError} se nodeId não for string ou position inválida
 */
export function pinNode(pinSet: { pins: Record<string, any>, count: number }, nodeId: string, position: { x: number, y: number }): { pins: Record<string, any>, count: number } {
    assertPinSet(pinSet);
    assertNodeId(nodeId);
    assertPosition(position);
    return buildPinSet({ ...pinSet.pins, [nodeId]: { x: position.x, y: position.y } });
}

/**
 * Remove o pin de um node. No-op se node não estava pinado.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @param {string} nodeId
 * @returns {{ pins: Record<string, any>, count: number }}
 */
export function unpinNode(pinSet: { pins: Record<string, any>, count: number }, nodeId: string): { pins: Record<string, any>, count: number } {
    assertPinSet(pinSet);
    assertNodeId(nodeId);
    if (!(nodeId in pinSet.pins)) return pinSet;
    const newPins = { ...pinSet.pins };
    delete ((newPins as Record<string, any>)[nodeId]);
    return buildPinSet(newPins);
}

/**
 * Verifica se um node está pinado.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @param {string} nodeId
 * @returns {boolean}
 */
export function isPinned(pinSet: { pins: Record<string, any>, count: number }, nodeId: string): boolean {
    assertPinSet(pinSet);
    assertNodeId(nodeId);
    return nodeId in pinSet.pins;
}

/**
 * Retorna a posição frozen {x, y} do node ou null se não pinado.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @param {string} nodeId
 * @returns {{ x: number, y: number } | null}
 */
export function getPinPosition(pinSet: { pins: Record<string, any>, count: number }, nodeId: string): { x: number, y: number } | null {
    assertPinSet(pinSet);
    assertNodeId(nodeId);
    return (pinSet.pins[nodeId] || null as {x:number,y:number}|null);
}

/**
 * Pina todos os nodes de um array [{id, position:{x,y}}].
 * Nodes sem id válido ou position inválida são silenciosamente ignorados.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @param {Array<{id: string, position: {x: number, y: number}}>} nodes
 * @returns {{ pins: Record<string, any>, count: number }}
 */
export function pinAll(pinSet: { pins: Record<string, any>, count: number }, nodes: Array<{id: string, position: {x: number, y: number}}>): { pins: Record<string, any>, count: number } {
    assertPinSet(pinSet);
    if (!Array.isArray(nodes)) throw new TypeError('nodes must be an array');
        const merged: Record<string, any>= { ...pinSet.pins };
    for (const node of nodes) {
        if (!node || typeof node.id !== 'string' || node.id.length === 0) continue;
        const pos = node.position;
        if (
            pos === null ||
            typeof pos !== 'object' ||
            typeof pos.x !== 'number' ||
            !Number.isFinite(pos.x) ||
            typeof pos.y !== 'number' ||
            !Number.isFinite(pos.y)
        ) {
            continue;
        }
        merged[node.id] = { x: pos.x, y: pos.y };
    }
    return buildPinSet(merged);
}

/**
 * Remove todos os pins - retorna PinSet vazio.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @returns {{ pins: Record<string, any>, count: number }}
 */
export function unpinAll(pinSet: { pins: Record<string, any>, count: number }): { pins: Record<string, any>, count: number } {
    assertPinSet(pinSet);
    return createPinSet();
}

/**
 * Aplica pins a um grafo: retorna novo grafo com nodes pinados tendo
 * `pinned: true` e `position: {x, y}` injetados em seu `data`.
 * Nodes não pinados permanecem inalterados.
 *
 * @param {{ nodes: Array<{id: string, data?: object}> }} graph
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @returns {{ nodes: any[] }}
 */
export function applyPinsToGraph(graph: { nodes: Array<{id: string, data?: object}> }, pinSet: { pins: Record<string, any>, count: number }): { nodes: any[] } {
    assertPinSet(pinSet);
    if (graph === null || typeof graph !== 'object') {
        throw new TypeError('graph must be an object');
    }
    if (!Array.isArray(graph.nodes)) throw new TypeError('graph.nodes must be an array');

    const newNodes = graph.nodes.map((node) => {
        if (!node || typeof node.id !== 'string') return node;
        const pos = pinSet.pins[node.id];
        if (!pos) return node;
        return Object.freeze({
            ...node,
            data: Object.freeze({
                ...(node.data || {}),
                pinned: true,
                position: Object.freeze({ x: pos.x, y: pos.y }),
            }),
        });
    });

    return (Object.freeze({ ...graph, nodes: Object.freeze(newNodes) }) as {nodes: any[]});
}

/**
 * Retorna array frozen com os nodeIds de todos os nodes pinados.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @returns {string[]}
 */
export function getPinnedNodeIds(pinSet: { pins: Record<string, any>, count: number }): string[] {
    assertPinSet(pinSet);
    return ((Object.freeze(Object.keys(pinSet.pins)) as unknown) as string[]);
}

/**
 * Resumo do estado de pinning.
 *
 * @param {{ pins: Record<string, any>, count: number }} pinSet
 * @returns {{ total: number, pinnedCount: number, unpinnedCount: number }}
 */
export function summarizePinning(pinSet: { pins: Record<string, any>; count: number }, totalNodes?: any) {
    assertPinSet(pinSet);
    const pinnedCount = pinSet.count;
    const total = typeof totalNodes === 'number' && Number.isFinite(totalNodes) ? totalNodes : pinnedCount;
    return Object.freeze({
        total,
        pinnedCount,
        unpinnedCount: total - pinnedCount,
    });
}

// ---------------------------------------------------------------------------
// Module manifest
// ---------------------------------------------------------------------------

export const graphNodePinningMeta = Object.freeze({
    exports: Object.freeze([
        'NODE_PINNING_META',
        'createPinSet',
        'pinNode',
        'unpinNode',
        'isPinned',
        'getPinPosition',
        'pinAll',
        'unpinAll',
        'applyPinsToGraph',
        'getPinnedNodeIds',
        'summarizePinning',
        'graphNodePinningMeta',
    ]),
    provenance: Object.freeze({
        generatedBy: 'AI',
        disclaimerAcknowledged: true,
    }),
});
