// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Constellation Node Aggregation - Phase 1.44 (P3)
 * Spec: docs/specs/features/SPEC_CONSTELLATION_METRIC_SIZING.md §S44
 *
 * Phase 1.44 (2026-05-01) - pure-logic agregação de N nodes próximos em
 * super-nodes quando a câmera afasta (zoom-out). Diferente de:
 *   - 1.37 (nodeGrouping.js) - agrupamento manual explícito do usuário
 *   - 1.8  (clusterDetection.js) - clusters automáticos por atributo/grafo
 *   - 1.32 (semanticZoom.js) - LOD por filtro/topK
 *
 * Aqui a agregação é **espacial + zoom-driven**: nodes cuja distância
 * euclidiana ≤ threshold(zoom) são fundidos em um super-node posicionado
 * no centróide. Idempotente, reversível via expandSuperNode.
 *
 * Modelo:
 *   - Aggregation: { superNodes:Array<SuperNode>, visibleNodes:Array<Node>,
 *                    nodeToSuper:Map<originalId, superId>, meta }
 *   - SuperNode:   { id, x, y, memberIds:Array<string>, count, isSuper:true,
 *                    bounds:{minX,minY,maxX,maxY} }
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface AggregationResult {
    superNodes: any[];
    visibleNodes: any[];
    nodeToSuper: Map<any, any>;
    meta: Record<string, any>;
}

/** Identidade do módulo. */
export const NODE_AGGREGATION_META = Object.freeze({
    spec: 'CONSTELLATION_METRIC_SIZING_001',
    phase: '1.44',
    deliveredAt: '2026-05-01',
});

/**
 * Resolve threshold de distância em função do zoom. Zoom alto (close-up)
 * → threshold pequeno (quase nenhum merge). Zoom baixo (far) → threshold
 * grande (mais agregação). Função monotônica decrescente em zoom.
 *
 * Heurística: thresholdAt(zoom) = baseDistance / max(zoom, epsilon)
 *
 * @param {number} zoom - fator de zoom (1.0 = neutro, 0.3 = far, 3.0 = close)
 * @param {number} baseDistance - distância de referência em pixels (default 60)
 * @returns {number}
 */
export function resolveAggregationThreshold(zoom: number, baseDistance: number = 60): number {
    if (!Number.isFinite(zoom) || zoom <= 0) {
        throw new RangeError('zoom must be positive finite number');
    }
    if (!Number.isFinite(baseDistance) || baseDistance < 0) {
        throw new RangeError('baseDistance must be non-negative finite number');
    }
    return baseDistance / zoom;
}

function ensureNodes(nodes: any): any[] {
    if (!Array.isArray(nodes)) throw new TypeError('nodes must be Array');
    return nodes;
}

function nodeXY(n: any): [number, number] {
    const x = Number(n?.x);
    const y = Number(n?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new TypeError(`node ${n?.id} requires finite numeric x and y`);
    }
    return [x, y];
}

function squaredDistance(ax: number, ay: number, bx: number, by: number): number {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
}

/**
 * Agrega nodes por distância euclidiana usando single-link clustering
 * (union-find). Determinístico: a iteração segue a ordem de entrada.
 * Nodes a uma distância ≤ threshold caem no mesmo super-node.
 *
 * @param {Array<any>} nodes
 * @param {number} threshold - distância máxima em pixels para fundir
 * @param {Record<string, any>} [opts] { minClusterSize=2, superIdPrefix='super:' }
 * @returns {{superNodes:Array<any>, visibleNodes:Array<any>, nodeToSuper:Map<any, any>, meta:Record<string, any>}}
 */
export function aggregateByDistance(
    nodes: any,
    threshold: number,
    opts: Record<string, any> = {} as any,
): AggregationResult {
    ensureNodes(nodes);
    if (!Number.isFinite(threshold) || threshold < 0) {
        throw new RangeError('threshold must be non-negative finite number');
    }
    const minClusterSize = Number.isFinite(opts.minClusterSize) ? Math.max(2, Math.floor(opts.minClusterSize)) : 2;
    const superIdPrefix = typeof opts.superIdPrefix === 'string' ? opts.superIdPrefix : 'super:';

    const n = nodes.length;
    if (n === 0) {
        return {
            superNodes: [],
            visibleNodes: [],
            nodeToSuper: new Map(),
            meta: { threshold, mergedCount: 0, superCount: 0, originalCount: 0 },
        };
    }

    // dedupe ids (defensivo)
    const seen = new Set();
    for (const node of nodes) {
        if (!node || typeof node.id !== 'string' || !node.id.length) {
            throw new Error('every node requires non-empty string id');
        }
        if (seen.has(node.id)) {
            throw new Error(`duplicate node id: ${node.id}`);
        }
        seen.add(node.id);
        nodeXY(node); // validates x/y
    }

    // union-find
    const parent: number[] = new Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    function find(i: number): number {
        while (parent[i] !== i) {
            parent[i] = parent[parent[i] as number] as number;
            i = parent[i] as number;
        }
        return i;
    }
    function union(a: number, b: number): void {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    }

    const t2 = threshold * threshold;
    // O(n²) - adequado para constellation (~ centenas de nodes em zoom-out)
    for (let i = 0; i < n; i++) {
        const [ax, ay] = nodeXY(nodes[i]);
        for (let j = i + 1; j < n; j++) {
            const [bx, by] = nodeXY(nodes[j]);
            if (squaredDistance(ax, ay, bx, by) <= t2) {
                union(i, j);
            }
        }
    }

    // bucket por raiz
    const buckets = new Map<number, number[]>();
    for (let i = 0; i < n; i++) {
        const r = find(i);
        let arr = buckets.get(r);
        if (!arr) {
            arr = [];
            buckets.set(r, arr);
        }
        arr.push(i);
    }

    const superNodes: any[] = [];
    const visibleNodes: any[] = [];
    const nodeToSuper = new Map<any, any>();
    let mergedCount = 0;

    // ordem determinística por menor índice de membro
    const rootIdxs = Array.from(buckets.keys()).sort((a, b) => {
        const aMin = Math.min(...(buckets.get(a) as number[]));
        const bMin = Math.min(...(buckets.get(b) as number[]));
        return aMin - bMin;
    });

    let superCount = 0;
    for (const root of rootIdxs) {
        const members = (buckets.get(root) as number[]).map((i: number) => nodes[i]);
        if (members.length < minClusterSize) {
            // mantém como nodes individuais
            for (const m of members) visibleNodes.push(m);
            continue;
        }
        let sx = 0;
        let sy = 0;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        const memberIds = [];
        for (const m of members) {
            const [x, y] = nodeXY(m);
            sx += x;
            sy += y;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            memberIds.push(m.id);
        }
        const cx = sx / members.length;
        const cy = sy / members.length;
        const superId = `${superIdPrefix}${superCount}`;
        const superNode = {
            id: superId,
            x: cx,
            y: cy,
            isSuper: true,
            count: members.length,
            memberIds: memberIds.slice(),
            bounds: { minX, minY, maxX, maxY },
        };
        superNodes.push(superNode);
        visibleNodes.push(superNode);
        for (const mid of memberIds) nodeToSuper.set(mid, superId);
        mergedCount += members.length;
        superCount += 1;
    }

    return {
        superNodes,
        visibleNodes,
        nodeToSuper,
        meta: {
            threshold,
            mergedCount,
            superCount,
            originalCount: n,
        },
    };
}

/**
 * Expande um super-node: retorna a lista de visibleNodes substituindo o
 * super-node alvo pelos seus nodes originais. Operação não-destrutiva
 * (retorna novo array).
 *
 * @param {Record<string, any>} aggregation - resultado de aggregateByDistance
 * @param {string} superId - id do super-node a expandir
 * @param {Array<any>} originalNodes - array original passado para aggregateByDistance
 * @returns {{visibleNodes:Array<any>, expandedIds:Array<string>}}
 */
export function expandSuperNode(
    aggregation: Record<string, any>,
    superId: string,
    originalNodes: any[],
): { visibleNodes: any[]; expandedIds: string[] } {
    if (!aggregation || !Array.isArray(aggregation.visibleNodes)) {
        throw new TypeError('aggregation must be an aggregation result');
    }
    if (typeof superId !== 'string' || !superId.length) {
        throw new TypeError('superId must be non-empty string');
    }
    ensureNodes(originalNodes);

    const target = aggregation.superNodes.find((s: any) => s.id === superId);
    if (!target) {
        throw new Error(`super-node not found: ${superId}`);
    }

    const memberSet = new Set(target.memberIds);
    const byId = new Map(originalNodes.map((n: any) => [n.id, n]));
    const restored = target.memberIds
        .map((mid: any) => byId.get(mid as any))
        .filter((n: any) => n !== undefined);

    if (restored.length !== target.memberIds.length) {
        throw new Error(`some member nodes missing in originalNodes for ${superId}`);
    }

    const next = [];
    for (const v of aggregation.visibleNodes) {
        if (v.id === superId) {
            for (const r of restored) next.push(r);
        } else {
            next.push(v);
        }
    }

    return {
        visibleNodes: next,
        expandedIds: Array.from(memberSet) as string[],
    };
}

/**
 * Resumo de uma agregação para HUD/telemetry/debug.
 *
 * @param {Record<string, any>} aggregation - resultado de aggregateByDistance
 * @returns {Record<string, any>} { originalCount, visibleCount, superCount, mergedCount,
 *   reductionRatio, avgClusterSize, largestCluster, smallestCluster, threshold }
 */
export function summarizeAggregation(aggregation: Record<string, any>): Record<string, any> {
    if (!aggregation || !Array.isArray(aggregation.superNodes)) {
        throw new TypeError('aggregation must be an aggregation result');
    }
    const { superNodes, visibleNodes, meta } = aggregation as any;
    const originalCount = meta?.originalCount ?? 0;
    const visibleCount = visibleNodes.length;
    const superCount = superNodes.length;
    const mergedCount = meta?.mergedCount ?? 0;
    const reductionRatio = originalCount > 0 ? 1 - visibleCount / originalCount : 0;

    let largest = null;
    let smallest = null;
    let sumSizes = 0;
    if (superCount > 0) {
        let lg = superNodes[0];
        let sm = superNodes[0];
        for (const s of superNodes) {
            sumSizes += s.count;
            if (s.count > lg.count) lg = s;
            if (s.count < sm.count) sm = s;
        }
        largest = { id: lg.id, size: lg.count };
        smallest = { id: sm.id, size: sm.count };
    }

    return {
        originalCount,
        visibleCount,
        superCount,
        mergedCount,
        reductionRatio,
        avgClusterSize: superCount > 0 ? sumSizes / superCount : 0,
        largestCluster: largest,
        smallestCluster: smallest,
        threshold: meta?.threshold ?? 0,
    };
}
