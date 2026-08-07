// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// app/js/core/calculator/launchpadSeeds.ts
// V3 Phase 1: seeds canônicos dos KPIs do Launchpad Hero.
// São CalculatorItems injetados em initCalculator() — readonly, com
// hero=true + heroSlot reservado. Usuário pode esconder pin/reordenar
// mas não deletar.

export interface LaunchpadSeedItem {
    readonly id: string;
    readonly label: string;
    readonly labelKey: string;
    readonly type: string;
    readonly calculation: string;
    readonly filters: readonly unknown[];
    readonly precision: number;
    readonly suffix?: string;
    readonly hero: boolean;
    readonly heroSlot: number;
    readonly pinnedToLaunchpad: boolean;
    readonly readonly: boolean;
    readonly drillDownHandler: string;
    readonly iconKey: string;
    readonly integrityComponent?: boolean;
    readonly integrityAggregate?: boolean;
}

export interface LaunchpadItem {
    readonly id?: string;
    readonly hero?: boolean;
    readonly heroSlot?: number;
    readonly pinnedToLaunchpad?: boolean;
    readonly readonly?: boolean;
    readonly integrityComponent?: boolean;
    readonly integrityAggregate?: boolean;
    readonly [key: string]: unknown;
}

export interface FilterLaunchpadOptions {
    readonly aggregateEnabled?: boolean;
}

/**
 * Seeds canônicos. IDs reservados com prefixo `launchpad:` —
 * protegidos contra deleção pelo CRUD do Calculator.
 */
export const LAUNCHPAD_HERO_SEEDS: readonly LaunchpadSeedItem[] = [
    {
        id: 'launchpad:eis',
        label: 'EIS',
        labelKey: 'launchpad.kpi.eis',
        type: 'metric',
        calculation: 'custom-eis',
        filters: [],
        precision: 2,
        hero: true,
        heroSlot: 0,
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenEisModal',
        iconKey: 'activity',
    },
    {
        id: 'launchpad:vpl',
        label: 'VPL',
        labelKey: 'launchpad.kpi.vpl',
        type: 'metric',
        calculation: 'custom-vpl',
        filters: [],
        precision: 0,
        hero: true,
        heroSlot: 1,
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenCostAnalysis',
        iconKey: 'dollar-sign',
    },
    {
        id: 'launchpad:pdplu',
        label: 'Leituras',
        labelKey: 'launchpad.kpi.pdplu',
        type: 'metric',
        calculation: 'custom-pdplu',
        filters: [],
        precision: 0,
        hero: true,
        heroSlot: 2,
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenCalculator',
        iconKey: 'database',
    },
    // Integrity components (3 separate KPIs — default view per ADR)
    {
        id: 'launchpad:compliance',
        label: 'Conformidade',
        labelKey: 'launchpad.kpi.compliance',
        type: 'metric',
        calculation: 'custom-compliance',
        filters: [],
        precision: 0,
        suffix: '%',
        hero: true,
        heroSlot: 3,
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenComplianceModal',
        iconKey: 'check-circle-2',
        integrityComponent: true, // hidden when aggregate flag on
    },
    {
        id: 'launchpad:traceability',
        label: 'Rastreabilidade',
        labelKey: 'launchpad.kpi.traceability',
        type: 'metric',
        calculation: 'custom-traceability',
        filters: [],
        precision: 0,
        suffix: '%',
        hero: true,
        heroSlot: 4,
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenProvenance',
        iconKey: 'link',
        integrityComponent: true,
    },
    {
        id: 'launchpad:uncertainty',
        label: 'Incerteza',
        labelKey: 'launchpad.kpi.uncertainty',
        type: 'metric',
        calculation: 'custom-uncertainty-coverage',
        filters: [],
        precision: 0,
        suffix: '%',
        hero: true,
        heroSlot: 5,
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenUncertaintyHub',
        iconKey: 'sigma',
        integrityComponent: true,
    },
    // Integrity aggregate (replaces 3 components when flag on)
    {
        id: 'launchpad:integrity-aggregate',
        label: 'Integridade',
        labelKey: 'launchpad.kpi.integrity',
        type: 'metric',
        calculation: 'custom-integrity-aggregate',
        filters: [],
        precision: 0,
        hero: true,
        heroSlot: 3, // same slot as compliance — replaces the 3 components
        pinnedToLaunchpad: true,
        readonly: true,
        drillDownHandler: 'handleOpenIntegrityReport',
        iconKey: 'shield-check',
        integrityAggregate: true, // hidden unless aggregate flag on
    },
];

/**
 * Inject seeds into an existing items array. Idempotent: se o seed já
 * existe (por id), mantém o atual (preserva edições do usuário em
 * pin/heroSlot, desde que readonly=true ainda seja respeitado).
 *
 * @returns array resultante (não muta input)
 */
export function injectLaunchpadSeeds(existingItems: readonly LaunchpadItem[] | unknown): LaunchpadItem[] {
    const arr: LaunchpadItem[] = Array.isArray(existingItems) ? [...(existingItems as LaunchpadItem[])] : [];
    const existingIds = new Set<string>(arr.map((i) => i.id ?? '').filter((id): id is string => id !== ''));
    for (const seed of LAUNCHPAD_HERO_SEEDS) {
        if (!existingIds.has(seed.id)) {
            arr.push({ ...seed });
        } else {
            // Seed já existe — força campos readonly canônicos
            // (evita drift se usuário alterou)
            const idx = arr.findIndex((i) => i.id === seed.id);
            if (idx >= 0) {
                arr[idx] = {
                    ...arr[idx],
                    ...seed,
                    readonly: true,
                    hero: true,
                };
            }
        }
    }
    return arr;
}

/**
 * Filter items to those pinned to Launchpad, ordered by heroSlot asc.
 *
 * ADR-INTEGRITY-001 §Publish Gate: when the aggregate flag is off
 * (default), the 3 Integrity components are shown separately and the
 * aggregate is hidden. When the flag is on (post peer-review +
 * calibration), the aggregate replaces the 3 components.
 */
export function filterLaunchpadItems(
    items: readonly LaunchpadItem[] | unknown,
    opts: FilterLaunchpadOptions = {},
): LaunchpadItem[] {
    if (!Array.isArray(items)) return [];
    const aggregateEnabled = opts.aggregateEnabled === true;
    return (items as LaunchpadItem[])
        .filter((i) => i?.pinnedToLaunchpad === true && i?.hero === true)
        .filter((i) => {
            // Aggregate mode: show only aggregate, hide components
            if (aggregateEnabled) {
                return !i.integrityComponent; // hide the 3 components
            }
            // Default (pre-publish) mode: show components, hide aggregate
            return !i.integrityAggregate;
        })
        .sort((a, b) => (a.heroSlot ?? 99) - (b.heroSlot ?? 99));
}

/**
 * Check if an item is a canonical seed (by id prefix).
 */
export function isLaunchpadSeed(itemId: unknown): boolean {
    return typeof itemId === 'string' && itemId.startsWith('launchpad:');
}
