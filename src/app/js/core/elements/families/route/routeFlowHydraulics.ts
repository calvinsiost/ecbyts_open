// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Route Flow Family - hydraulics calculations
// Manning's equation + pipe flow + travel time + connectivity helpers.
// References:
//   Chow, V.T. (1959). Open-Channel Hydraulics. McGraw-Hill. (Manning's n table 5.1)
//   Mays, L.W. (2010). Water Resources Engineering, 2nd ed. (pipe flow §7.3)
// Spec: docs/specs/features/SPEC_FAMILY_ROUTES_FLOWS.md §2

// ---------------------------------------------------------------------------
// Manning's equation - open channel flow
// Q = (1/n) · A · R^(2/3) · S^(1/2)
//   Q  = discharge (m³/s)
//   n  = Manning's roughness coefficient (dimensionless)
//   A  = cross-sectional area (m²)
//   R  = hydraulic radius = A/P (m)
//   S  = channel slope (m/m, dimensionless)
// ---------------------------------------------------------------------------

interface ManningResult {
    Q_m3s: number;
    velocity_ms: number;
    hydraulicRadius_m: number;
}

interface RectangularChannelParams {
    width_m: number;
    depth_m: number;
    slope_mm: number;
    manning_n: number;
}

interface PipeParams {
    diameter_m: number;
    slope_mm: number;
    manning_n: number;
}

interface NormalDepthParams {
    Q_m3s: number;
    width_m: number;
    slope_mm: number;
    manning_n: number;
    tolerance?: number;
}

interface ConnectivityElement {
    id: string;
    connectivity: {
        upstream_elements: string[];
        downstream_elements: string[];
    };
}

interface GraphNode {
    upstream: Set<string>;
    downstream: Set<string>;
}

/**
 * Manning's discharge for a wide rectangular channel.
 * @param p
 * @param p.width_m channel top width (m)
 * @param p.depth_m flow depth (m)
 * @param p.slope_mm  slope (m/m)
 * @param p.manning_n Manning roughness coefficient
 * @returns or null if params invalid
 */
export function manningDischargeRectangular({
    width_m,
    depth_m,
    slope_mm,
    manning_n,
}: RectangularChannelParams): ManningResult | null {
    if (width_m <= 0 || depth_m <= 0 || slope_mm < 0 || manning_n <= 0) return null;
    const area = width_m * depth_m;
    const wetPerimeter = width_m + 2 * depth_m;
    const R = area / wetPerimeter; // hydraulic radius
    const Q = (1 / manning_n) * area * Math.pow(R, 2 / 3) * Math.sqrt(slope_mm);
    const V = Q / area;
    return { Q_m3s: Q, velocity_ms: V, hydraulicRadius_m: R };
}

/**
 * Manning's discharge for a circular pipe (full-flow condition).
 * @param p
 * @param p.diameter_m pipe internal diameter (m)
 * @param p.slope_mm  slope (m/m)
 * @param p.manning_n Manning roughness coefficient
 * @returns or null if params invalid
 */
export function manningDischargePipe({ diameter_m, slope_mm, manning_n }: PipeParams): ManningResult | null {
    if (diameter_m <= 0 || slope_mm < 0 || manning_n <= 0) return null;
    const radius = diameter_m / 2;
    const area = Math.PI * radius * radius;
    const wetPerimeter = Math.PI * diameter_m;
    const R = area / wetPerimeter; // = diameter/4 for full pipe
    const Q = (1 / manning_n) * area * Math.pow(R, 2 / 3) * Math.sqrt(slope_mm);
    const V = Q / area;
    return { Q_m3s: Q, velocity_ms: V, hydraulicRadius_m: R };
}

/**
 * Travel time along a route given velocity and length.
 * @param length_m total route length (m)
 * @param velocity_ms average velocity (m/s)
 * @returns travel time in seconds, or Infinity if velocity is 0
 */
export function travelTimeSeconds(length_m: number, velocity_ms: number): number {
    if (length_m <= 0) return 0;
    if (velocity_ms <= 0) return Infinity;
    return length_m / velocity_ms;
}

/**
 * Estimate normal depth for a wide rectangular channel using Manning.
 * Uses bisection to solve Q = (1/n)·(w·yn)·(w·yn/(w+2yn))^(2/3)·sqrt(S) for yn.
 * @param p
 * @param p.Q_m3s target discharge (m³/s)
 * @param p.width_m channel width (m)
 * @param p.slope_mm slope (m/m)
 * @param p.manning_n Manning's n
 * @param p.tolerance convergence tolerance (default 1e-6)
 * @returns normal depth (m) or null if no convergence
 */
export function normalDepthBisection({
    Q_m3s,
    width_m,
    slope_mm,
    manning_n,
    tolerance = 1e-6,
}: NormalDepthParams): number | null {
    if (Q_m3s <= 0 || width_m <= 0 || slope_mm <= 0 || manning_n <= 0) return null;

    const f = (yn: number): number => {
        const res = manningDischargeRectangular({ width_m, depth_m: yn, slope_mm, manning_n });
        return res ? res.Q_m3s - Q_m3s : -Q_m3s;
    };

    let lo = 1e-6;
    let hi = 100; // upper bound 100m depth
    if (f(lo) * f(hi) > 0) return null;

    for (let iter = 0; iter < 100; iter++) {
        const mid = (lo + hi) / 2;
        if (hi - lo < tolerance) return mid;
        if (f(mid) * f(lo) < 0) hi = mid;
        else lo = mid;
    }
    return (lo + hi) / 2;
}

/**
 * Froude number for rectangular open channel.
 * Fr < 1 = subcritical, Fr = 1 = critical, Fr > 1 = supercritical.
 * @param velocity_ms flow velocity (m/s)
 * @param depth_m flow depth (m)
 * @returns
 */
export function froudeNumber(velocity_ms: number, depth_m: number): number {
    const g = 9.81;
    if (depth_m <= 0) return NaN;
    return velocity_ms / Math.sqrt(g * depth_m);
}

// ---------------------------------------------------------------------------
// Connectivity graph helpers
// ---------------------------------------------------------------------------

/**
 * Build adjacency list from a set of route_flow elements.
 * @param elements
 * @returns
 */
export function buildConnectivityGraph(elements: ConnectivityElement[]): Map<string, GraphNode> {
    const graph = new Map<string, GraphNode>();

    for (const el of elements) {
        if (!graph.has(el.id)) graph.set(el.id, { upstream: new Set(), downstream: new Set() });
        const node = graph.get(el.id);
        if (!node) continue;
        for (const upId of el.connectivity?.upstream_elements ?? []) {
            node.upstream.add(upId);
            if (!graph.has(upId)) graph.set(upId, { upstream: new Set(), downstream: new Set() });
            graph.get(upId)?.downstream.add(el.id);
        }
        for (const downId of el.connectivity?.downstream_elements ?? []) {
            node.downstream.add(downId);
            if (!graph.has(downId)) graph.set(downId, { upstream: new Set(), downstream: new Set() });
            graph.get(downId)?.upstream.add(el.id);
        }
    }
    return graph;
}

/**
 * Find all upstream element IDs (recursive BFS) from a given node.
 * @param startId
 * @param graph
 * @param maxDepth guard against cycles
 * @returns
 */
export function findAllUpstream(
    startId: string,
    graph: Map<string, { upstream: Set<string> }>,
    maxDepth = 50
): Set<string> {
    const visited = new Set<string>();
    const queue: string[] = [startId];
    let depth = 0;
    while (queue.length > 0 && depth < maxDepth) {
        const current = queue.shift() as string;
        if (visited.has(current)) continue;
        visited.add(current);
        for (const upId of graph.get(current)?.upstream ?? []) {
            if (!visited.has(upId)) queue.push(upId);
        }
        depth++;
    }
    visited.delete(startId);
    return visited;
}

/**
 * Detect cycles in the connectivity graph (DFS-based).
 * @param graph
 * @returns true if a cycle exists
 */
export function hasCycle(graph: Map<string, { downstream: Set<string> }>): boolean {
    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color = new Map<string, number>();
    for (const id of graph.keys()) color.set(id, WHITE);

    function dfs(id: string): boolean {
        color.set(id, GRAY);
        for (const neighbor of graph.get(id)?.downstream ?? []) {
            if (!color.has(neighbor)) color.set(neighbor, WHITE);
            if (color.get(neighbor) === GRAY) return true;
            if (color.get(neighbor) === WHITE && dfs(neighbor)) return true;
        }
        color.set(id, BLACK);
        return false;
    }

    for (const id of graph.keys()) {
        if (color.get(id) === WHITE && dfs(id)) return true;
    }
    return false;
}
