// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

export interface EndpointCostEntry {
    baseCost: number;
    multiplierPerUnit: number;
    unitLabel: string | null;
}

export type EndpointCostOverride = Partial<EndpointCostEntry>;
export type EndpointCostOverrides = Record<string, EndpointCostOverride>;

export const DEFAULT_COSTS: Readonly<Record<string, Readonly<EndpointCostEntry>>> = Object.freeze({
    metadata: Object.freeze({ baseCost: 1, multiplierPerUnit: 0, unitLabel: null }),
    elements: Object.freeze({ baseCost: 10, multiplierPerUnit: 0.1, unitLabel: 'rows' }),
    observations: Object.freeze({ baseCost: 5, multiplierPerUnit: 0.05, unitLabel: 'records' }),
    geojson: Object.freeze({ baseCost: 50, multiplierPerUnit: 0.5, unitLabel: 'features' }),
    snapshot_xlsx: Object.freeze({ baseCost: 500, multiplierPerUnit: 0.1, unitLabel: 'kb_size' }),
    snapshot_csv: Object.freeze({ baseCost: 200, multiplierPerUnit: 0.05, unitLabel: 'kb_size' }),
});

const ENDPOINT_LIST = Object.freeze(Object.keys(DEFAULT_COSTS));

export function listEndpoints(): readonly string[] {
    return ENDPOINT_LIST;
}

function resolveCostEntry(endpoint: string, perEndpointOverrides?: EndpointCostOverrides): Readonly<EndpointCostEntry> {
    const base = DEFAULT_COSTS[endpoint];
    if (!base) {
        throw new Error(`[radar:endpointCosts] Unknown endpoint: ${endpoint}`);
    }
    const override = perEndpointOverrides?.[endpoint];
    if (!override) return base;
    return Object.freeze({
        baseCost: typeof override.baseCost === 'number' ? override.baseCost : base.baseCost,
        multiplierPerUnit:
            typeof override.multiplierPerUnit === 'number' ? override.multiplierPerUnit : base.multiplierPerUnit,
        unitLabel: typeof override.unitLabel === 'string' ? override.unitLabel : base.unitLabel,
    });
}

export function computeCost(
    endpoint: string,
    unitsReturned: number,
    perEndpointOverrides?: EndpointCostOverrides,
): number {
    const entry = resolveCostEntry(endpoint, perEndpointOverrides);
    const units = Math.max(0, Number(unitsReturned) || 0);
    const raw = entry.baseCost + entry.multiplierPerUnit * units;
    return Math.ceil(raw);
}

export function estimateCostFromQuery(
    endpoint: string,
    queryParams?: Record<string, unknown>,
    perEndpointOverrides?: EndpointCostOverrides,
): number {
    const entry = resolveCostEntry(endpoint, perEndpointOverrides);
    const limitRaw = queryParams?.limit;
    if (limitRaw === undefined || limitRaw === null) {
        return Math.ceil(entry.baseCost);
    }
    const limit = Number(limitRaw);
    if (!Number.isFinite(limit) || limit <= 0) {
        return Math.ceil(entry.baseCost);
    }
    return Math.ceil(entry.baseCost + entry.multiplierPerUnit * limit);
}
