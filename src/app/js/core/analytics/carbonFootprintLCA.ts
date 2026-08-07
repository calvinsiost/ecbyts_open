// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
'use strict';
//
// DISCLAIMER: This algorithm was implemented with assistance from Artificial
// Intelligence (LLM). Final scientific validation is the responsibility of the
// user and the technical consultant. See SPEC_SCIENTIFIC_MODULES_PROGRAM.md.
//

/**
 * Carbon Footprint Life Cycle Assessment (LCA) Module
 *
 * Implements GHG inventory and carbon intensity calculations per:
 * - ISO 14040:2006 - Environmental management - Life cycle assessment — Principles and framework
 * - ISO 14044:2006 - Environmental management - Life cycle assessment — Requirements and guidelines
 * - GHG Protocol Corporate Standard (WRI/WBCSD 2004, revised 2015)
 * - IPCC AR6 (2021) - Global Warming Potential over 100 years (GWP100)
 *
 * DOI: 10.1787/9789264236547-en (OECD LCA guidance)
 * Zero dependencies - pure math, no DOM/IDB/Three.js/fetch.
 *
 * @module carbonFootprintLCA
 */

interface AnalyticsModuleMeta {
    name: string;
    description: string;
    category: string;
    familyTags: string[];
    provenance: {
        generatedBy: string;
        version: string;
        validatedByHuman: boolean;
        disclaimerAcknowledged: boolean;
        specRef: string;
    };
    inputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
    outputSchema: { type: string; properties: Record<string, unknown>; required: string[] };
}

/**
 * GWP100 factors from IPCC AR6 WGI Table 7.SM.7 (2021).
 * Valores de potencial de aquecimento global para 100 anos (tCO2eq por tonelada de gás).
 */
const GWP100_AR6 = Object.freeze({
    CO2: 1,
    CH4: 27.9, // fossil methane
    CH4_bio: 27.0, // biogenic methane
    N2O: 273,
    HFC134a: 1526,
    HFC32: 771,
    SF6: 25200,
    NF3: 17400,
    PFC14: 7380, // CF4
    PFC116: 12400, // C2F6
});

/**
 * IPCC AR5 (2013) GWP100 - kept for backward compatibility.
 * Valores AR5 mantidos para compatibilidade.
 */
const GWP100_AR5 = Object.freeze({
    CO2: 1,
    CH4: 28,
    CH4_bio: 34,
    N2O: 265,
    HFC134a: 1300,
    SF6: 23500,
});

/**
 * GHG Protocol emission scopes.
 * Escopos do GHG Protocol para classificação de emissões.
 */
const EMISSION_SCOPES = Object.freeze({
    SCOPE_1: 'scope_1', // Direct emissions — combustão, processo, fugitivas
    SCOPE_2: 'scope_2', // Indirect from purchased energy — eletricidade, calor
    SCOPE_3: 'scope_3', // Other indirect — cadeia de valor upstream/downstream
});

/**
 * Sector classification for emission sources (GHG Protocol sector guidance).
 * Classificação setorial de fontes de emissão.
 */
const EMISSION_SECTORS = Object.freeze([
    'stationary_combustion',
    'mobile_combustion',
    'process_emissions',
    'fugitive_emissions',
    'purchased_electricity',
    'purchased_heat',
    'transportation_distribution',
    'waste',
    'business_travel',
    'employee_commuting',
    'upstream_activities',
    'downstream_activities',
]);

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Assert finite positive number.
 * Valida que o valor é um número finito positivo.
 * @param v
 * @param name
 */
function assertPositive(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v <= 0) {
        throw new RangeError(`${name} must be a finite positive number, got ${v}`);
    }
}

/**
 * Assert finite non-negative number.
 * Valida que o valor é um número finito não-negativo.
 * @param v
 * @param name
 */
function assertNonNegative(v: unknown, name: string): void {
    if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new RangeError(`${name} must be a finite non-negative number, got ${v}`);
    }
}

// ---------------------------------------------------------------------------
// Core exports
// ---------------------------------------------------------------------------

/**
 * Calculate CO2-equivalent mass for a single GHG emission using GWP100.
 * Calcula a massa equivalente em CO2 de uma emissão de GEE usando GWP100 (IPCC AR6 padrão).
 *
 * @param massKg   - Mass of gas emitted (kg)
 * @param gasId    - Gas identifier matching GWP100_AR6 keys (e.g. 'CH4', 'N2O')
 * @param ipccVersion - IPCC Assessment Report version
 * @returns
 *
 * @example
 * const r = calculateCO2Equivalent(1000, 'CH4');
 * // r.co2eKg === 27900 (1000 kg CH4 × GWP100=27.9)
 */
export function calculateCO2Equivalent(
    massKg: number,
    gasId: string,
    ipccVersion: 'AR6' | 'AR5' = 'AR6',
): { co2eKg: number; gwp: number; gasId: string } {
    assertPositive(massKg, 'massKg');
    if (typeof gasId !== 'string' || !gasId) {
        throw new TypeError('gasId must be a non-empty string');
    }
    const table = (ipccVersion === 'AR5' ? GWP100_AR5 : GWP100_AR6) as Record<string, number>;
    const gwp = table[gasId];
    if (gwp === undefined) {
        throw new RangeError(
            `Unknown gasId '${gasId}' for IPCC ${ipccVersion}. Known: ${Object.keys(table).join(', ')}`,
        );
    }
    return { co2eKg: massKg * gwp, gwp, gasId };
}

/**
 * Aggregate a GHG emission inventory into total CO2e and scope subtotals.
 * Agrega inventário de emissões de GEE em total CO2e e subtotais por escopo.
 *
 * Each entry: { massKg, gasId, scope, sector, ipccVersion? }
 * Escopo deve ser um de EMISSION_SCOPES values.
 *
 * @param inventory
 * @returns
 */
export function aggregateInventory(
    inventory: Array<{ massKg: number; gasId: string; scope: string; sector?: string; ipccVersion?: string }>,
): {
    totalCO2eKg: number;
    scope1CO2eKg: number;
    scope2CO2eKg: number;
    scope3CO2eKg: number;
    bySector: Record<string, number>;
    entries: number;
} {
    if (!Array.isArray(inventory) || inventory.length === 0) {
        throw new TypeError('inventory must be a non-empty array');
    }

    let totalCO2eKg = 0;
    let scope1CO2eKg = 0;
    let scope2CO2eKg = 0;
    let scope3CO2eKg = 0;
    const bySector: Record<string, number> = {};

    for (let i = 0; i < inventory.length; i++) {
        const entry = inventory[i];
        if (!entry || typeof entry !== 'object') {
            throw new TypeError(`inventory[${i}] must be an object`);
        }
        const { massKg, gasId, scope, sector = 'unspecified', ipccVersion = 'AR6' } = entry;
        const { co2eKg } = calculateCO2Equivalent(massKg, gasId, ipccVersion as 'AR6' | 'AR5');

        totalCO2eKg += co2eKg;
        if (scope === EMISSION_SCOPES.SCOPE_1) scope1CO2eKg += co2eKg;
        else if (scope === EMISSION_SCOPES.SCOPE_2) scope2CO2eKg += co2eKg;
        else if (scope === EMISSION_SCOPES.SCOPE_3) scope3CO2eKg += co2eKg;

        bySector[sector] = (bySector[sector] || 0) + co2eKg;
    }

    return { totalCO2eKg, scope1CO2eKg, scope2CO2eKg, scope3CO2eKg, bySector, entries: inventory.length };
}

/**
 * Calculate carbon intensity per functional unit (ISO 14044 §4.2.3).
 * Calcula intensidade de carbono por unidade funcional (ex: kg CO2e / kg produto).
 *
 * @param totalCO2eKg   - Total CO2 equivalent (kg)
 * @param functionalUnit - Quantity of functional unit (e.g. kg of product, kWh, km)
 * @param unitLabel - Label for functional unit (informational)
 * @returns
 */
export function carbonIntensity(
    totalCO2eKg: number,
    functionalUnit: number,
    unitLabel: string = 'unit',
): { intensity: number; unit: string; totalCO2eKg: number; functionalUnit: number } {
    assertPositive(totalCO2eKg, 'totalCO2eKg');
    assertPositive(functionalUnit, 'functionalUnit');
    return {
        intensity: totalCO2eKg / functionalUnit,
        unit: `kgCO2e/${unitLabel}`,
        totalCO2eKg,
        functionalUnit,
    };
}

/**
 * Classify emission level by sector benchmark thresholds.
 * Classifica o nível de emissão com base em benchmarks setoriais.
 *
 * Benchmarks derived from IEA (2022) and GHG Protocol sector guidance.
 * Benchmarks setoriais: IEA Net Zero by 2050 (2022), GHG Protocol Sector Guidance.
 *
 * @param intensityKgCO2ePerUnit  - Carbon intensity (kgCO2e per functional unit)
 * @param sector
 * @returns
 */
export function classifyEmissionsBySector(
    intensityKgCO2ePerUnit: number,
    sector: 'electricity' | 'cement' | 'steel' | 'agriculture' | 'transport' | 'generic' = 'generic',
): {
    level: 'low' | 'medium' | 'high' | 'critical';
    benchmark: { low: number; medium: number; high: number };
    sector: string;
} {
    assertNonNegative(intensityKgCO2ePerUnit, 'intensityKgCO2ePerUnit');

    // Benchmarks em kgCO2e por unidade funcional (fonte: IEA 2022 + IPCC AR6 WG3)
    // Electricity: per kWh; Cement/Steel: per tonne product; Agriculture: per tonne; Transport: per tonne-km
    const thresholds: Record<string, { low: number; medium: number; high: number }> = {
        electricity: { low: 0.1, medium: 0.3, high: 0.6 }, // kgCO2e/kWh
        cement: { low: 400, medium: 600, high: 800 }, // kgCO2e/t cement
        steel: { low: 500, medium: 1200, high: 2000 }, // kgCO2e/t steel
        agriculture: { low: 100, medium: 300, high: 600 }, // kgCO2e/t product
        transport: { low: 0.02, medium: 0.08, high: 0.15 }, // kgCO2e/tonne-km
        generic: { low: 10, medium: 50, high: 200 },
    };

    const t = thresholds[sector] || thresholds.generic!;
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (intensityKgCO2ePerUnit <= t.low) level = 'low';
    else if (intensityKgCO2ePerUnit <= t.medium) level = 'medium';
    else if (intensityKgCO2ePerUnit <= t.high) level = 'high';
    else level = 'critical';

    return { level, benchmark: t, sector };
}

/**
 * Export GWP100 lookup table for a given IPCC version.
 * Retorna a tabela GWP100 para o relatório IPCC especificado.
 *
 * @param version
 * @returns
 */
export function getGWP100Table(version: 'AR6' | 'AR5' = 'AR6'): Readonly<Record<string, number>> {
    if (version === 'AR5') return GWP100_AR5;
    if (version === 'AR6') return GWP100_AR6;
    throw new RangeError(`Unknown IPCC version '${version}'. Use 'AR6' or 'AR5'.`);
}

export { EMISSION_SCOPES, EMISSION_SECTORS, GWP100_AR6, GWP100_AR5 };

/**
 * Module metadata for Library catalog, fine-tuning pipeline and Data Studio.
 */
export const carbonFootprintLCAMeta: AnalyticsModuleMeta = {
    name: 'carbonFootprintLCA',
    description: 'carbonFootprintLCA',
    category: 'analytics',
    familyTags: ['climate', 'lca', 'footprint'],
    provenance: {
        generatedBy: 'claude',
        version: 'v0.1',
        validatedByHuman: false,
        disclaimerAcknowledged: true,
        specRef: 'SPEC_SCIENTIFIC_MODULES_PROGRAM.md',
    },
    // TODO: populate inputSchema/outputSchema when connector is built
    inputSchema: { type: 'object', properties: {}, required: [] },
    outputSchema: { type: 'object', properties: {}, required: [] },
};
