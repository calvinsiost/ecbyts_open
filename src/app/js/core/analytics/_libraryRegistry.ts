// @ts-check
// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Analytics Library Registry - bridge between the auto-generated _registryData
// and the marketplace UI. Surfaces analytics modules as Library entries grouped
// by familyTag, so all 490 analytics algorithms are discoverable in the UI
// without per-module wiring.
//
// Spec: SPEC_TYPESCRIPT_MIGRATION_PROGRAM.md §"Analytics Library Exposure".

'use strict';

import { ANALYTICS_REGISTRY } from './_registryData.js';

/**
 * @typedef {import('./_registryData.js').AnalyticsRegistryEntry} AnalyticsRegistryEntry
 */

/**
 * Get all analytics modules in the registry (flat list).
 * @returns {ReadonlyArray<AnalyticsRegistryEntry>}
 */
export function listAnalyticsModules() {
    return ANALYTICS_REGISTRY;
}

/**
 * Group analytics modules by their first familyTag. Untagged modules go to 'misc'.
 * @returns {Record<string, AnalyticsRegistryEntry[]>}
 */
export function groupByFamily() {
    /** @type {Record<string, AnalyticsRegistryEntry[]>} */
    const groups: Record<string, any[]> = {};
    for (const entry of ANALYTICS_REGISTRY) {
        const tag = (entry.familyTags && entry.familyTags[0]) || 'misc';
        if (!groups[tag]) groups[tag] = [];
        groups[tag].push(entry);
    }
    return groups;
}

/**
 * Build synthetic Library marketplace entries - one per familyTag - that the
 * marketplace UI surfaces as installable cards. Each card aggregates the
 * analytics modules belonging to that family.
 *
 * Shape matches the BUILTIN_EXAMPLES pattern in utils/libraries/marketplace.js
 * so the existing `_builtinToRemoteShape` adapter can convert without changes.
 *
 * @returns {Array<{
 *   ecbytsLibrary: string,
 *   id: string,
 *   name: string,
 *   version: string,
 *   author: { name: string },
 *   description: string,
 *   license: string,
 *   tags: string[],
 *   icon: string,
 *   dependencies: string[],
 *   contents: { analytics: AnalyticsRegistryEntry[] }
 * }>}
 */
export function buildAnalyticsLibraryEntries() {
    const groups = groupByFamily();
    const familyLabels = /** @type {Record<string, string>} */ ({
        air: 'Air Quality & Atmospheric',
        atmospheric: 'Atmospheric Science',
        aquatic: 'Aquatic Ecology',
        aquifer: 'Aquifer & Hydrogeology',
        bioaccumulation: 'Bioaccumulation',
        carbon: 'Carbon Footprint',
        chemical: 'Chemical Safety',
        climate: 'Climate',
        coastal: 'Coastal Processes',
        ecological: 'Ecological Risk',
        environmental: 'Environmental Compliance',
        epidemiology: 'Epidemiology',
        groundwater: 'Groundwater',
        health: 'Health Risk',
        hydrology: 'Hydrology',
        industrial: 'Industrial Processes',
        marine: 'Marine',
        mining: 'Mining',
        noise: 'Noise & Vibration',
        nuclear: 'Nuclear & Radiation',
        occupational: 'Occupational Health',
        risk: 'Risk Assessment',
        sediment: 'Sediment',
        soil: 'Soil',
        thermal: 'Thermal',
        urban: 'Urban',
        water: 'Water Quality',
        wetland: 'Wetlands',
        misc: 'Misc Analytics',
    });

    /** @type {Array<{ecbytsLibrary: string, id: string, name: string, version: string, author: {name: string}, description: string, license: string, tags: string[], icon: string, dependencies: string[], contents: {analytics: AnalyticsRegistryEntry[]}}>} */
    const entries = [];
    for (const [tag, modules] of Object.entries(groups) as Array<[string, any[]]>) {
        const label = familyLabels[tag as keyof typeof familyLabels] || tag.charAt(0).toUpperCase() + tag.slice(1);
        entries.push({
            ecbytsLibrary: '1.0.0',
            id: `analytics-${tag}`,
            name: `Analytics — ${label}`,
            version: '1.0.0',
            author: { name: 'ecbyts' },
            description: `${modules.length} algoritmo(s) cientifico(s) para ${label.toLowerCase()}. Pure-logic, type-checked. Inclui: ${modules
                .slice(0, 3)
                .map((m: any) => m.name)
                .join(', ')}${modules.length > 3 ? `, ... (+${modules.length - 3})` : ''}.`,
            license: 'AGPL-3.0',
            tags: [tag, 'analytics', 'core', 'algorithms'],
            icon: 'cpu',
            dependencies: [],
            contents: {
                analytics: modules,
            },
        });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    return entries;
}
