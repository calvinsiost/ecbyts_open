// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost - AGPL-3.0-only
//
// Route Flow Family - schema, types, defaults, validators
// Spec: docs/specs/features/SPEC_FAMILY_ROUTES_FLOWS.md §2

// ---------------------------------------------------------------------------
// Route type taxonomy
// ---------------------------------------------------------------------------

export const ROUTE_CATEGORIES = {
    hydric: 'hydric',
    logistics: 'logistics',
    industrial: 'industrial',
    connectivity: 'connectivity',
} as const;

export const ROUTE_TYPES: Record<string, { category: string; label: string; code: string }> = {
    river: { category: 'hydric', label: 'River', code: 'RV' },
    stream: { category: 'hydric', label: 'Stream', code: 'ST' },
    drain: { category: 'hydric', label: 'Urban Drain', code: 'DR' },
    channel: { category: 'hydric', label: 'Artificial Channel', code: 'CH' },
    interceptor: { category: 'hydric', label: 'Sewer Interceptor', code: 'IN' },
    sampling_route: { category: 'logistics', label: 'Sampling Route', code: 'SR' },
    vehicle_route: { category: 'logistics', label: 'Vehicle Route', code: 'VR' },
    access_path: { category: 'logistics', label: 'Access Path', code: 'AP' },
    // ECBYTS-ENERGY-SCENARIOS-001#5 — rota de VOO de drone/UAV. Logistics
    // (como sampling/vehicle route), mas renderizada ELEVADA na cena 3D
    // (flight_properties.altitude_m aplicado ao Y do path pelo meshFactory).
    flight_route: { category: 'logistics', label: 'Flight Route', code: 'FL' },
    pipe: { category: 'industrial', label: 'Pipe', code: 'PP' },
    process_line: { category: 'industrial', label: 'Process Line', code: 'PL' },
    conveyor: { category: 'industrial', label: 'Conveyor', code: 'CV' },
    flow_connector: { category: 'connectivity', label: 'Flow Connector', code: 'FC' },
    junction: { category: 'connectivity', label: 'Junction', code: 'JN' },
};

export const ROUTE_TYPE_IDS: string[] = Object.keys(ROUTE_TYPES);

export const FLOW_DIRECTIONS: string[] = ['unidirectional', 'bidirectional'];
export const GEOMETRY_TYPES: string[] = ['polyline', 'spline', 'arc'];
export const PIPE_MATERIALS: string[] = ['concrete', 'pvc', 'steel', 'hdpe', 'clay', 'cast_iron', 'unknown'];
export const ROUTE_SURFACE_TYPES: string[] = ['asphalt', 'dirt', 'paved', 'trail', 'water', 'unknown'];

// ---------------------------------------------------------------------------
// Default flow properties per route type (Manning's n coefficients)
// Source: Chow 1959 "Open-Channel Hydraulics", Table 5.1
// ---------------------------------------------------------------------------

/** Manning roughness n by surface/material */
export const MANNING_N_DEFAULTS: Record<string, number | null> = {
    // Channels
    river: 0.035, // natural channel with some weeds
    stream: 0.05, // small mountain stream
    drain: 0.015, // concrete drain
    channel: 0.025, // clean excavated earth channel
    interceptor: 0.013, // concrete sewer pipe
    pipe: 0.012, // smooth PVC pipe
    process_line: 0.011, // smooth steel pipe
    // Non-hydraulic routes - not applicable
    sampling_route: null,
    vehicle_route: null,
    access_path: null,
    flight_route: null,
    conveyor: null,
    flow_connector: 0.013,
    junction: 0.013,
};

// ---------------------------------------------------------------------------
// Schema defaults
// ---------------------------------------------------------------------------

/**
 * Create a default route_flow element with required fields populated.
 */
export function createRouteFlowDefaults(overrides: any = {}): any {
    const type = overrides.type ?? 'river';
    if (!ROUTE_TYPES[type]) throw new Error(`Unknown route_flow type: ${type}`);

    return {
        id: overrides.id ?? null,
        family: 'route_flow',
        type,
        name: overrides.name ?? ROUTE_TYPES[type].label,
        geometry: {
            type: 'polyline',
            coordinates: [],
            start_node: { id: null, connected_to: null },
            end_node: { id: null, connected_to: null },
            waypoints: [],
            ...overrides.geometry,
        },
        flow_properties: {
            direction: 'unidirectional',
            flow_rate: null,
            velocity: null,
            depth: null,
            width: null,
            slope: null,
            manning_n: MANNING_N_DEFAULTS[type] ?? null,
            diameter: null,
            material: 'unknown',
            ...overrides.flow_properties,
        },
        route_properties: {
            route_type: 'one_way',
            total_distance: null,
            surface_type: 'unknown',
            sampling_points: [],
            ...overrides.route_properties,
        },
        // Envelope de voo — só relevante para type 'flight_route'.
        // altitude_m: altura AGL da rota (default 60 m — teto legal típico
        // ANAC/RBAC-E94 para operação VLOS é 120 m; 60 m é conservador).
        flight_properties:
            type === 'flight_route'
                ? {
                      altitude_m: 60,
                      corridor_width_m: 10,
                      ...overrides.flight_properties,
                  }
                : (overrides.flight_properties ?? null),
        connectivity: {
            upstream_elements: [],
            downstream_elements: [],
            connected_equipment: [],
            network_id: null,
            ...overrides.connectivity,
        },
        metadata: {
            source: 'digitized',
            accuracy: { horizontal: null, vertical: null },
            survey_date: null,
            ...overrides.metadata,
        },
        createdAt: overrides.createdAt ?? new Date().toISOString(),
        updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

type RouteFlowErrors = string[];

function validateFamily(element: Record<string, any>, errors: RouteFlowErrors): void {
    if (element.family !== 'route_flow') {
        errors.push(`family must be 'route_flow', got '${element.family}'`);
    }
}

function validateRouteType(element: Record<string, any>, errors: RouteFlowErrors): void {
    if (!ROUTE_TYPES[element.type]) {
        errors.push(`type '${element.type}' is not a valid route_flow type`);
    }
}

function validateGeometry(element: Record<string, any>, errors: RouteFlowErrors): void {
    if (!element.geometry || !Array.isArray(element.geometry.coordinates)) {
        errors.push('geometry.coordinates must be an array');
        return;
    }
    if (element.geometry.coordinates.length === 0) {
        return;
    }
    for (const [i, pt] of element.geometry.coordinates.entries()) {
        if (typeof pt.lat !== 'number' || typeof pt.lon !== 'number') {
            errors.push(`coordinates[${i}] must have numeric lat and lon`);
            break;
        }
    }
}

function validateManningN(element: Record<string, any>, errors: RouteFlowErrors): void {
    const manningN = element.flow_properties?.manning_n;
    if (manningN !== null && typeof manningN === 'number' && (manningN <= 0 || manningN > 1)) {
        errors.push(`manning_n must be in range (0, 1], got ${manningN}`);
    }
}

function validateFlightAltitude(element: Record<string, any>, errors: RouteFlowErrors): void {
    if (element.type !== 'flight_route') return;
    const alt = element.flight_properties?.altitude_m;
    if (alt != null && (!Number.isFinite(alt) || alt <= 0)) {
        errors.push(`flight_properties.altitude_m must be a positive number, got ${alt}`);
    }
}

export function validateRouteFlowElement(element: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!element || typeof element !== 'object') {
        return { valid: false, errors: ['element must be an object'] };
    }
    validateFamily(element, errors);
    validateRouteType(element, errors);
    validateGeometry(element, errors);
    validateManningN(element, errors);
    validateFlightAltitude(element, errors);

    return { valid: errors.length === 0, errors };
}

/**
 * True if type belongs to hydric category (supports hydraulic calculations).
 */
export function isHydricType(type: string): boolean {
    return ROUTE_TYPES[type]?.category === 'hydric';
}

/**
 * True if type belongs to logistics category.
 */
export function isLogisticsType(type: string): boolean {
    return ROUTE_TYPES[type]?.category === 'logistics';
}

/**
 * True if type is an aerial (flight) route — rendered elevated in the 3D scene.
 */
export function isFlightType(type: string): boolean {
    return type === 'flight_route';
}
