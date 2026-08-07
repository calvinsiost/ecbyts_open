// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   ROUTE FLOW GRAPH — SPEC_FAMILY_ROUTES_FLOWS (Item 9.46)

   Pure helpers para nova família route_flow (PDPL-U):
   - Taxonomy (§Q2): 12 tipos em 4 categorias
   - Graph topology (§Q3): nodes + edges com directed/bidirectional
   - Hydraulic properties validation
   - Connectivity queries (upstream/downstream)

   UI + Three.js polylines em handler. Core só data model + algoritmos.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Taxonomy (§Q2)
// ──────────────────────────────────────────────────────────────────────

interface RouteTypeDef {
    category: string;
    flowDirection: string;
    bidirectional: boolean;
}
// ──────────────────────────────────────────────────────────────────────
// Energy/mass flow payload (ECBYTS-ENERGY-SCENARIOS-001#1)
// Retrocompatível: rota SEM `payload` = comportamento hidráulico atual, intocado.
// ──────────────────────────────────────────────────────────────────────
export type FlowType = 'mass' | 'energy';

/** Carga de fluxo transportada por uma rota: valor + unidade + tipo. */
export interface FlowPayload {
    /** 'mass' (t/dia, kg/h…) ou 'energy' (MJ, GJ, MWh/d…). */
    flowType: FlowType;
    /** Valor numérico do fluxo. Deve ser finito e ≥ 0. */
    value: number;
    /** Unidade livre (ex.: 't/dia', 'MJ/dia', 'MWh/d'). Só rótulo — sem conversão automática. */
    unit: string;
    /** Rótulo opcional da corrente (ex.: 'biocarvão', 'gás de síntese'). */
    label?: string;
}

interface RouteElement {
    id?: string;
    type?: string;
    startNodeId?: string;
    endNodeId?: string;
    waypoints?: Array<unknown>;
    hydraulicProperties?: { flowRate?: number; velocity?: number; diameter?: number };
    /** Opcional: fluxo de massa/energia carregado pela rota. Ausente = rota sem balanço. */
    payload?: FlowPayload;
}
interface GraphNode {
    id?: string;
}
interface RouteGraph {
    nodes: Map<string, GraphNode>;
    routes: Array<RouteElement>;
    outEdges: Map<string, Array<string>>;
    inEdges: Map<string, Array<string>>;
    stats: { nodeCount: number; routeCount: number; droppedRoutes: number };
}

export const ROUTE_CATEGORIES = Object.freeze(['hydric', 'logistics', 'industrial', 'connectivity']);

export const ROUTE_TYPES: Readonly<Record<string, RouteTypeDef>> = Object.freeze({
    // Hydric
    River: { category: 'hydric', flowDirection: 'directional', bidirectional: false },
    Stream: { category: 'hydric', flowDirection: 'directional', bidirectional: false },
    Drain: { category: 'hydric', flowDirection: 'directional', bidirectional: false },
    Channel: { category: 'hydric', flowDirection: 'directional', bidirectional: false },
    Interceptor: { category: 'hydric', flowDirection: 'directional', bidirectional: false },
    // Logistics
    SamplingRoute: { category: 'logistics', flowDirection: 'bidirectional', bidirectional: true },
    VehicleRoute: { category: 'logistics', flowDirection: 'bidirectional', bidirectional: true },
    AccessPath: { category: 'logistics', flowDirection: 'bidirectional', bidirectional: true },
    PipelineRoute: { category: 'logistics', flowDirection: 'directional', bidirectional: false },
    // ECBYTS-ENERGY-SCENARIOS-001#5 — rota de voo drone/UAV (ida e volta)
    FlightRoute: { category: 'logistics', flowDirection: 'bidirectional', bidirectional: true },
    // Industrial
    Pipe: { category: 'industrial', flowDirection: 'directional', bidirectional: false },
    ProcessLine: { category: 'industrial', flowDirection: 'directional', bidirectional: false },
    Conveyor: { category: 'industrial', flowDirection: 'directional', bidirectional: false },
    CableTray: { category: 'industrial', flowDirection: 'none', bidirectional: true },
    // Connectivity
    FlowConnector: { category: 'connectivity', flowDirection: 'directional', bidirectional: false },
    Junction: { category: 'connectivity', flowDirection: 'none', bidirectional: true },
    ValvePoint: { category: 'connectivity', flowDirection: 'directional', bidirectional: false },
});

// MVP 6 types (§Q2 recomendação)
export const MVP_TYPES = Object.freeze(['River', 'Stream', 'SamplingRoute', 'VehicleRoute', 'Pipe', 'FlowConnector']);

// ──────────────────────────────────────────────────────────────────────
// Validators
// ──────────────────────────────────────────────────────────────────────

export function isValidRouteType(type: string): boolean {
    return typeof type === 'string' && ROUTE_TYPES[type] !== undefined;
}

export function isValidCategory(category: string): boolean {
    return typeof category === 'string' && ROUTE_CATEGORIES.includes(category);
}

/**
 * Lista types de uma categoria.
 */
export function getTypesByCategory(category: string): Array<string> {
    return Object.entries(ROUTE_TYPES)
        .filter(([, def]) => def.category === category)
        .map(([type]) => type);
}

/**
 * Valida shape de route element.
 */
export function validateRouteElement(route: RouteElement | any): { valid: boolean; errors: Array<string> } {
    const errors: Array<string> = [];
    if (!route || typeof route !== 'object') return { valid: false, errors: ['route not object'] };
    const r: RouteElement = route;
    if (!r.id || typeof r.id !== 'string') errors.push('id required');
    if (!isValidRouteType(r.type as string)) errors.push(`type not in whitelist: ${r.type}`);
    if (!r.startNodeId || typeof r.startNodeId !== 'string') errors.push('startNodeId required');
    if (!r.endNodeId || typeof r.endNodeId !== 'string') errors.push('endNodeId required');
    if (r.startNodeId && r.startNodeId === r.endNodeId) {
        errors.push('start and end must differ (self-loops not supported for routes)');
    }
    if (!Array.isArray(r.waypoints)) errors.push('waypoints must be array (empty allowed)');
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Hydraulic properties (hydric types)
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida propriedades hidráulicas se route for hídrica.
 */
export function validateHydraulicProperties(route: RouteElement | any): { valid: boolean; errors: Array<string> } {
    const errors: Array<string> = [];
    if (!route || !isValidRouteType(route.type)) return { valid: false, errors: ['invalid route'] };
    const r: RouteElement = route;
    const def = ROUTE_TYPES[r.type as string];
    if (def && def.category !== 'hydric') return { valid: true, errors: [] }; // só hydric tem hydraulics

    const props = r.hydraulicProperties || {};
    if (props.flowRate != null && (!Number.isFinite(props.flowRate) || props.flowRate < 0)) {
        errors.push('flowRate must be non-negative number');
    }
    if (props.velocity != null && (!Number.isFinite(props.velocity) || props.velocity < 0)) {
        errors.push('velocity must be non-negative');
    }
    if (props.diameter != null && (!Number.isFinite(props.diameter) || props.diameter <= 0)) {
        errors.push('diameter must be positive');
    }
    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Graph topology (§Q3)
// ──────────────────────────────────────────────────────────────────────

function buildNodeMap(nodes: Array<GraphNode>): Map<string, GraphNode> {
    const nodeMap: Map<string, GraphNode> = new Map();
    for (const n of Array.isArray(nodes) ? nodes : []) {
        if (n?.id) nodeMap.set(n.id, n);
    }
    return nodeMap;
}

function addDirectionalEdge(
    outEdges: Map<string, Array<string>>,
    inEdges: Map<string, Array<string>>,
    from: string,
    to: string,
): void {
    if (!outEdges.has(from)) outEdges.set(from, []);
    if (!inEdges.has(to)) inEdges.set(to, []);
    (outEdges.get(from) as Array<string>).push(to);
    (inEdges.get(to) as Array<string>).push(from);
}

function processRoute(
    route: RouteElement,
    nodeMap: Map<string, GraphNode>,
    outEdges: Map<string, Array<string>>,
    inEdges: Map<string, Array<string>>,
): { route: RouteElement | null; dropped: boolean } {
    const validation = validateRouteElement(route);
    if (!validation.valid) {
        return { route: null, dropped: true };
    }
    const startId = route.startNodeId as string;
    const endId = route.endNodeId as string;
    if (!nodeMap.has(startId) || !nodeMap.has(endId)) {
        return { route: null, dropped: true };
    }
    addDirectionalEdge(outEdges, inEdges, startId, endId);
    const def = ROUTE_TYPES[route.type as string];
    if (def && def.bidirectional) {
        addDirectionalEdge(outEdges, inEdges, endId, startId);
    }
    return { route, dropped: false };
}

/**
 * Constrói índice de grafo a partir de routes + nodes.
 */
export function buildRouteGraph(routes: Array<RouteElement> = [], nodes: Array<GraphNode> = []): RouteGraph {
    const nodeMap = buildNodeMap(nodes);
    const outEdges: Map<string, Array<string>> = new Map();
    const inEdges: Map<string, Array<string>> = new Map();
    const validRoutes: Array<RouteElement> = [];
    let dropped = 0;

    for (const route of Array.isArray(routes) ? routes : []) {
        const result = processRoute(route, nodeMap, outEdges, inEdges);
        if (result.dropped) {
            dropped++;
        } else if (result.route) {
            validRoutes.push(result.route);
        }
    }

    return {
        nodes: nodeMap,
        routes: validRoutes,
        outEdges,
        inEdges,
        stats: {
            nodeCount: nodeMap.size,
            routeCount: validRoutes.length,
            droppedRoutes: dropped,
        },
    };
}

/**
 * Encontra nodes upstream de um node (fluxo em direção oposta).
 */
export function findUpstreamNodes(graph: RouteGraph, nodeId: string, maxHops: number = Infinity): Set<string> {
    const result: Set<string> = new Set();
    if (!graph || !nodeId || !graph.nodes?.has(nodeId)) return result;
    const queue: Array<[string, number]> = [[nodeId, 0]];
    const visited = new Set([nodeId]);
    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const [cur, hops] = item;
        if (hops >= maxHops) continue;
        const preds = graph.inEdges.get(cur) || [];
        for (const p of preds) {
            if (!visited.has(p)) {
                visited.add(p);
                result.add(p);
                queue.push([p, hops + 1]);
            }
        }
    }
    return result;
}

/**
 * Encontra nodes downstream.
 */
export function findDownstreamNodes(graph: RouteGraph, nodeId: string, maxHops: number = Infinity): Set<string> {
    const result: Set<string> = new Set();
    if (!graph || !nodeId || !graph.nodes?.has(nodeId)) return result;
    const queue: Array<[string, number]> = [[nodeId, 0]];
    const visited = new Set([nodeId]);
    while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const [cur, hops] = item;
        if (hops >= maxHops) continue;
        const succs = graph.outEdges.get(cur) || [];
        for (const s of succs) {
            if (!visited.has(s)) {
                visited.add(s);
                result.add(s);
                queue.push([s, hops + 1]);
            }
        }
    }
    return result;
}

// ──────────────────────────────────────────────────────────────────────
// Energy/mass balance (ECBYTS-ENERGY-SCENARIOS-001#1)
// ──────────────────────────────────────────────────────────────────────

/** Valida um FlowPayload. Payload ausente é válido (rota sem balanço). */
export function validateFlowPayload(payload: FlowPayload | undefined | null): {
    valid: boolean;
    errors: Array<string>;
} {
    const errors: Array<string> = [];
    if (payload == null) return { valid: true, errors }; // ausência = ok (retrocompat)
    if (typeof payload !== 'object') return { valid: false, errors: ['payload not object'] };
    if (payload.flowType !== 'mass' && payload.flowType !== 'energy') {
        errors.push(`flowType must be 'mass' | 'energy' (got ${String(payload.flowType)})`);
    }
    if (!Number.isFinite(payload.value) || payload.value < 0) {
        errors.push('payload.value must be a non-negative finite number');
    }
    if (!payload.unit || typeof payload.unit !== 'string') {
        errors.push('payload.unit required (string)');
    }
    return { valid: errors.length === 0, errors };
}

interface NodeBalance {
    nodeId: string;
    inflow: number;
    outflow: number;
    /** inflow − outflow. >0 = acúmulo/perda não contabilizada; <0 = criação impossível. */
    delta: number;
    /** |delta| / max(inflow, outflow) — desbalanço relativo em [0,1+]. */
    relativeImbalance: number;
    /** true se |delta| ≤ tolerância (absoluta OU relativa). */
    balanced: boolean;
    unit: string | null;
    /** Nó só de entrada (fonte, ex.: biomassa) — não se espera balanço fechado. */
    isSource: boolean;
    /** Nó só de saída (sink, ex.: destino final) — não se espera balanço fechado. */
    isSink: boolean;
}

export interface ConserveFlowResult {
    flowType: FlowType;
    nodes: Array<NodeBalance>;
    /** Nós internos (não-fonte, não-sink) com desbalanço acima da tolerância. */
    imbalanced: Array<NodeBalance>;
    /** true se nenhum nó interno está desbalanceado. */
    conserved: boolean;
    totalInflow: number;
    totalOutflow: number;
}

/**
 * Soma entradas e saídas de fluxo (massa OU energia) por elemento/nó do grafo e
 * acusa desbalanço em nós internos. Só considera rotas cujo `payload.flowType`
 * bate com `flowType`. Rotas sem payload são ignoradas (retrocompat).
 *
 * Nós de fronteira (só-entrada = fonte, só-saída = sink) NÃO são cobrados por
 * balanço fechado — só nós internos com entrada E saída. Perdas conhecidas podem
 * ser modeladas como rotas de saída para um nó "perdas".
 *
 * @param routes rotas do grafo (podem ou não ter payload)
 * @param flowType 'mass' ou 'energy'
 * @param opts.absTol tolerância absoluta (default 1e-6); relTol relativa (default 0.01 = 1%)
 */
export function conserveFlow(
    routes: Array<RouteElement> = [],
    flowType: FlowType = 'mass',
    opts: { absTol?: number; relTol?: number } = {},
): ConserveFlowResult {
    const absTol = Number.isFinite(opts.absTol as number) ? (opts.absTol as number) : 1e-6;
    const relTol = Number.isFinite(opts.relTol as number) ? (opts.relTol as number) : 0.01;

    const inflow: Map<string, number> = new Map();
    const outflow: Map<string, number> = new Map();
    const unitByNode: Map<string, string> = new Map();
    const seen: Set<string> = new Set();
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const r of Array.isArray(routes) ? routes : []) {
        const p = r?.payload;
        if (!p || p.flowType !== flowType) continue;
        if (!validateFlowPayload(p).valid) continue;
        const from = r.startNodeId;
        const to = r.endNodeId;
        if (!from || !to) continue;
        outflow.set(from, (outflow.get(from) || 0) + p.value);
        inflow.set(to, (inflow.get(to) || 0) + p.value);
        seen.add(from);
        seen.add(to);
        if (p.unit) {
            if (!unitByNode.has(from)) unitByNode.set(from, p.unit);
            if (!unitByNode.has(to)) unitByNode.set(to, p.unit);
        }
        totalOutflow += p.value; // cada rota é uma saída de `from`
        totalInflow += p.value; // e uma entrada de `to`
    }

    const nodes: Array<NodeBalance> = [];
    for (const nodeId of seen) {
        const inV = inflow.get(nodeId) || 0;
        const outV = outflow.get(nodeId) || 0;
        const isSource = inV === 0 && outV > 0;
        const isSink = outV === 0 && inV > 0;
        const delta = inV - outV;
        const denom = Math.max(inV, outV) || 1;
        const relativeImbalance = Math.abs(delta) / denom;
        const balanced =
            isSource || isSink || Math.abs(delta) <= absTol || relativeImbalance <= relTol;
        nodes.push({
            nodeId,
            inflow: inV,
            outflow: outV,
            delta,
            relativeImbalance,
            balanced,
            unit: unitByNode.get(nodeId) || null,
            isSource,
            isSink,
        });
    }
    nodes.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

    const imbalanced = nodes.filter((n) => !n.isSource && !n.isSink && !n.balanced);
    return {
        flowType,
        nodes,
        imbalanced,
        conserved: imbalanced.length === 0,
        totalInflow,
        totalOutflow,
    };
}

/**
 * Detecta Junctions (nodes com out-degree > 1 OR in-degree > 1).
 */
export function findJunctions(
    graph: RouteGraph
): Array<{ nodeId: string; type: 'bifurcation' | 'confluence' | 'complex' }> {
    if (!graph?.nodes) return [];
    const junctions: Array<{ nodeId: string; type: 'bifurcation' | 'confluence' | 'complex' }> = [];
    for (const nodeId of graph.nodes.keys()) {
        const out = graph.outEdges.get(nodeId) || [];
        const inE = graph.inEdges.get(nodeId) || [];
        const outUnique = new Set(out).size;
        const inUnique = new Set(inE).size;
        if (outUnique > 1 && inUnique > 1) {
            junctions.push({ nodeId, type: 'complex' });
        } else if (outUnique > 1) {
            junctions.push({ nodeId, type: 'bifurcation' });
        } else if (inUnique > 1) {
            junctions.push({ nodeId, type: 'confluence' });
        }
    }
    return junctions;
}
