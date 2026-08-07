// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

// ================================================================
// randomHelpers.js - Auxiliary data & functions for Random Model
// GAC 67-parameter catalog, well tiers, meteorology, financial templates
// ================================================================

import { generateId } from '../../utils/helpers/id.js';
import { yieldToMain } from '../../utils/performance/yielding.js';
import { runtimeDate, runtimeNow, runtimeRandom } from '../random/runtime.js';

// ----------------------------------------------------------------
// RANDOM UTILITIES
// ----------------------------------------------------------------

/**
 * Random float in [min, max).
 * @param min
 * @param max
 */
export const rand = (min: number, max: number): number => runtimeRandom('model') * (max - min) + min;

/**
 * Random integer in [min, max] (inclusive).
 * @param min
 * @param max
 */
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));

/**
 * Pick random element from array.
 * @param arr
 */
export const pick = <T>(arr: T[]): T => arr[Math.floor(runtimeRandom('model') * arr.length)] as T;

/** Gaussian random (Box-Muller, mean=0, std=1). */
export function gaussianRand(): number {
    let u = 0,
        v = 0;
    while (u === 0) u = runtimeRandom('model');
    while (v === 0) v = runtimeRandom('model');
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Gaussian random with mean and std.
 * @param value
 * @param std
 */
export const gaussianRange = (mean: number, std: number): number => mean + gaussianRand() * std;

/**
 * Shuffle array in-place (Fisher-Yates).
 * @param array
 */
export function shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(runtimeRandom('model') * (i + 1));
        [array[i], array[j]] = [array[j] as T, array[i] as T];
    }
    return array;
}

/**
 * Clamp value within ±limit.
 * @param v
 * @param limit
 */
export const clamp = (v: number, limit: number): number => Math.max(-limit * 0.9, Math.min(limit * 0.9, v));

/**
 * Format value precision based on magnitude.
 * @param value
 */
export function formatPrecision(value: number): number {
    if (value < 0.001) return Math.round(value * 1000000) / 1000000;
    if (value < 0.1) return Math.round(value * 10000) / 10000;
    if (value < 10) return Math.round(value * 100) / 100;
    return Math.round(value * 10) / 10;
}

/** Yield to UI (allows progress bar render between heavy loops). */
export function yieldToUI(): Promise<void> {
    return yieldToMain({ timeoutMs: 0 });
}

// ----------------------------------------------------------------
// GAC 67-PARAMETER CATALOG (CONAMA 420 / CETESB / EPA Method 8260)
// Faixas realistas para área contaminada por hidrocarbonetos
// ----------------------------------------------------------------

export const GAC_PARAMETERS: Record<string, any> = {
    // ── VOLÁTEIS (BTEX + clorados) - 12 params ──
    // Calibracao para cenarios contaminados (RANDOM-001 F6, 2026-04-09):
    // - max = ordem de grandeza acima do VI (cenario contaminado realista)
    // - vi_conama = threshold REGULATORIO (avaliacao posterior, nao limita geracao)
    // Refs: Equinor open data (publico) + literatura academica
    benzene: {
        min: 0.001,
        max: 10000, // VI=5; cenarios contaminados podem exceder em ~3 ordens de grandeza
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '71-43-2',
        detectionLimit: 0.001,
        vi_conama: 5,
    },
    toluene: {
        min: 0.1,
        max: 5000, // VI=700; cenarios contaminados podem exceder
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '108-88-3',
        detectionLimit: 0.1,
        vi_conama: 700,
    },
    ethylbenzene: {
        min: 0.05,
        max: 2000, // VI=300
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '100-41-4',
        detectionLimit: 0.05,
        vi_conama: 300,
    },
    xylenes: {
        min: 0.1,
        max: 3000, // VI=500; expandido para cenarios contaminados
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '1330-20-7',
        detectionLimit: 0.1,
        vi_conama: 500,
    },
    styrene: {
        min: 0.01,
        max: 20,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '100-42-5',
        detectionLimit: 0.01,
        vi_conama: 20,
    },
    vinyl_chloride: {
        min: 0.001,
        max: 5,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '75-01-4',
        detectionLimit: 0.001,
        vi_conama: 5,
    },
    dichloroethylene: {
        min: 0.01,
        max: 30,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '75-35-4',
        detectionLimit: 0.01,
        vi_conama: 30,
    },
    trichloroethylene: {
        min: 0.001,
        max: 70,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '79-01-6',
        detectionLimit: 0.001,
        vi_conama: 70,
    },
    tetrachloroethylene: {
        min: 0.001,
        max: 40,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '127-18-4',
        detectionLimit: 0.001,
        vi_conama: 40,
    },
    chloroform: {
        min: 0.01,
        max: 200,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '67-66-3',
        detectionLimit: 0.01,
        vi_conama: 200,
    },
    carbon_tetrachloride: {
        min: 0.001,
        max: 2,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '56-23-5',
        detectionLimit: 0.001,
        vi_conama: 2,
    },
    methyl_tert_butyl_ether: {
        min: 0.01,
        max: 40,
        unitId: 'ug_L',
        group: 'volatiles',
        casNumber: '1634-04-4',
        detectionLimit: 0.01,
        vi_conama: 40,
    },

    // ── SEMIVOLÁTEIS (PAH) - 16 params ──
    naphthalene: {
        min: 0.01,
        max: 60,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '91-20-3',
        detectionLimit: 0.01,
        vi_conama: 60,
    },
    acenaphthylene: { min: 0.001, max: 5, unitId: 'ug_L', group: 'pah', casNumber: '208-96-8', detectionLimit: 0.001 },
    acenaphthene: { min: 0.001, max: 5, unitId: 'ug_L', group: 'pah', casNumber: '83-32-9', detectionLimit: 0.001 },
    fluorene: { min: 0.001, max: 5, unitId: 'ug_L', group: 'pah', casNumber: '86-73-7', detectionLimit: 0.001 },
    phenanthrene: {
        min: 0.001,
        max: 5,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '85-01-8',
        detectionLimit: 0.001,
        vi_conama: 140,
    },
    anthracene: { min: 0.001, max: 3, unitId: 'ug_L', group: 'pah', casNumber: '120-12-7', detectionLimit: 0.001 },
    fluoranthene: { min: 0.001, max: 10, unitId: 'ug_L', group: 'pah', casNumber: '206-44-0', detectionLimit: 0.001 },
    pyrene: { min: 0.001, max: 10, unitId: 'ug_L', group: 'pah', casNumber: '129-00-0', detectionLimit: 0.001 },
    benzo_a_anthracene: {
        min: 0.0001,
        max: 1.75,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '56-55-3',
        detectionLimit: 0.0001,
        vi_conama: 1.75,
    },
    chrysene: { min: 0.0001, max: 1, unitId: 'ug_L', group: 'pah', casNumber: '218-01-9', detectionLimit: 0.0001 },
    benzo_b_fluoranthene: {
        min: 0.0001,
        max: 0.7,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '205-99-2',
        detectionLimit: 0.0001,
    },
    benzo_k_fluoranthene: {
        min: 0.0001,
        max: 0.7,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '207-08-9',
        detectionLimit: 0.0001,
    },
    benzo_a_pyrene: {
        min: 0.0001,
        max: 0.7,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '50-32-8',
        detectionLimit: 0.0001,
        vi_conama: 0.7,
    },
    indeno_123cd_pyrene: {
        min: 0.0001,
        max: 0.17,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '193-39-5',
        detectionLimit: 0.0001,
        vi_conama: 0.17,
    },
    dibenz_ah_anthracene: {
        min: 0.0001,
        max: 0.18,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '53-70-3',
        detectionLimit: 0.0001,
        vi_conama: 0.18,
    },
    benzo_ghi_perylene: {
        min: 0.0001,
        max: 0.5,
        unitId: 'ug_L',
        group: 'pah',
        casNumber: '191-24-2',
        detectionLimit: 0.0001,
    },

    // ── TPH - 4 params ──
    tph_gro: { min: 0.1, max: 50, unitId: 'mg_L', group: 'tph', detectionLimit: 0.1 },
    tph_dro: { min: 0.1, max: 100, unitId: 'mg_L', group: 'tph', detectionLimit: 0.1 },
    tph_oro: { min: 0.1, max: 50, unitId: 'mg_L', group: 'tph', detectionLimit: 0.1 },
    tph_total: { min: 0.5, max: 200, unitId: 'mg_L', group: 'tph', detectionLimit: 0.5 },

    // ── METAIS PESADOS - 12 params ──
    lead: {
        min: 0.001,
        max: 0.01,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7439-92-1',
        detectionLimit: 0.001,
        vi_conama: 0.01,
    },
    cadmium: {
        min: 0.0001,
        max: 0.005,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-43-9',
        detectionLimit: 0.0001,
        vi_conama: 0.005,
    },
    chromium_total: {
        min: 0.001,
        max: 0.05,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-47-3',
        detectionLimit: 0.001,
        vi_conama: 0.05,
    },
    mercury: {
        min: 0.0001,
        max: 0.001,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7439-97-6',
        detectionLimit: 0.0001,
        vi_conama: 0.001,
    },
    arsenic: {
        min: 0.001,
        max: 0.01,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-38-2',
        detectionLimit: 0.001,
        vi_conama: 0.01,
    },
    copper: {
        min: 0.001,
        max: 2,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-50-8',
        detectionLimit: 0.001,
        vi_conama: 2,
    },
    zinc: {
        min: 0.01,
        max: 5,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-66-6',
        detectionLimit: 0.01,
        vi_conama: 5,
    },
    nickel: {
        min: 0.001,
        max: 0.07,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-02-0',
        detectionLimit: 0.001,
        vi_conama: 0.07,
    },
    barium: {
        min: 0.01,
        max: 0.7,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7440-39-3',
        detectionLimit: 0.01,
        vi_conama: 0.7,
    },
    selenium: {
        min: 0.001,
        max: 0.01,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7782-49-2',
        detectionLimit: 0.001,
        vi_conama: 0.01,
    },
    manganese: {
        min: 0.01,
        max: 0.4,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7439-96-5',
        detectionLimit: 0.01,
        vi_conama: 0.4,
    },
    iron: {
        min: 0.01,
        max: 2,
        unitId: 'mg_L',
        group: 'metals',
        casNumber: '7439-89-6',
        detectionLimit: 0.01,
        vi_conama: 0.3,
    },

    // ── INORGÂNICOS - 8 params ──
    pH: { min: 5.5, max: 8.5, unitId: 'pH', group: 'inorganic' },
    conductivity: { min: 100, max: 2000, unitId: 'uS_cm', group: 'inorganic' },
    turbidity: { min: 0.5, max: 100, unitId: 'NTU', group: 'inorganic' },
    alkalinity: { min: 10, max: 500, unitId: 'mg_L', group: 'inorganic' },
    hardness: { min: 10, max: 500, unitId: 'mg_L', group: 'inorganic' },
    sulfate: { min: 1, max: 250, unitId: 'mg_L', group: 'inorganic' },
    chloride: { min: 1, max: 250, unitId: 'mg_L', group: 'inorganic' },
    nitrate: { min: 0.1, max: 10, unitId: 'mg_L', group: 'inorganic' },

    // ── MICROBIOLÓGICOS - 3 params ──
    coliforms_total: { min: 0, max: 5000, unitId: 'NMP_100mL', group: 'microbiology', detectionLimit: 1 },
    ecoli: { min: 0, max: 1000, unitId: 'NMP_100mL', group: 'microbiology', detectionLimit: 1 },
    heterotrophic_bacteria: { min: 0, max: 500, unitId: 'UFC_mL', group: 'microbiology', detectionLimit: 1 },

    // ── GASES DISSOLVIDOS - 4 params ──
    dissolved_oxygen: { min: 0.5, max: 9, unitId: 'mg_L', group: 'dissolved_gas' },
    methane_dissolved: { min: 0, max: 28, unitId: 'mg_L', group: 'dissolved_gas', detectionLimit: 0.01 },
    co2_dissolved: { min: 1, max: 50, unitId: 'mg_L', group: 'dissolved_gas' },
    h2s_dissolved: { min: 0, max: 5, unitId: 'mg_L', group: 'dissolved_gas', detectionLimit: 0.001 },

    // ── INDICADORES DE CAMPO - 8 params ──
    redox: { min: -400, max: 400, unitId: 'mV', group: 'field' },
    temperature: { min: 15, max: 25, unitId: 'celsius', group: 'field' },
    dissolved_oxygen_field: { min: 0.5, max: 9, unitId: 'mg_L', group: 'field' },
    static_level: { min: 0.5, max: 15, unitId: 'm', group: 'field' },
    dynamic_level: { min: 1, max: 20, unitId: 'm', group: 'field' },
    water_column: { min: 0.5, max: 15, unitId: 'm', group: 'field' },
    free_product: { min: 0, max: 5, unitId: 'cm', group: 'field', detectionLimit: 0 },
    dnapl: { min: 0, max: 3, unitId: 'cm', group: 'field', detectionLimit: 0 },
};

/** All 67 GAC parameter IDs. */
export const GAC_ALL_PARAMS = Object.keys(GAC_PARAMETERS);

// ----------------------------------------------------------------
// WELL TIER CONFIGURATION
// Downstream (GAC full), intermediate (20 selected), upstream (8 basic)
// ----------------------------------------------------------------

/** Intermediate tier: 20 most relevant params for routine monitoring. */
export const TIER_INTERMEDIATE_PARAMS = [
    'benzene',
    'toluene',
    'ethylbenzene',
    'xylenes',
    'naphthalene',
    'tph_gro',
    'tph_dro',
    'tph_total',
    'lead',
    'chromium_total',
    'arsenic',
    'pH',
    'conductivity',
    'turbidity',
    'nitrate',
    'dissolved_oxygen',
    'redox',
    'temperature',
    'static_level',
    'free_product',
];

/** Upstream/background tier: 8 basic field + inorganic params. */
export const TIER_UPSTREAM_PARAMS = [
    'pH',
    'conductivity',
    'temperature',
    'redox',
    'static_level',
    'dissolved_oxygen',
    'alkalinity',
    'nitrate',
];

/** Well tier definitions. */
export const WELL_TIERS: Record<string, any> = {
    downstream: { count: 8, params: GAC_ALL_PARAMS, prefix: 'PM', label: 'Jusante (GAC)' },
    intermediate: { count: 15, params: TIER_INTERMEDIATE_PARAMS, prefix: 'PM', label: 'Intermediário' },
    upstream: { count: 2, params: TIER_UPSTREAM_PARAMS, prefix: 'PM', label: 'Montante (BG)' },
};

/** Total well count across all tiers (default). */
export const TOTAL_WELLS = Object.values(WELL_TIERS).reduce((s, t) => s + t.count, 0);

/**
 * Scale well tiers proportionally to a custom total.
 * Ratios: ~32% downstream, ~8% upstream, remainder intermediate.
 * @param totalWells - Desired total well count
 */
export function scaleWellTiers(totalWells: number): { downstream: number; intermediate: number; upstream: number } {
    const downstream = Math.max(1, Math.round(totalWells * 0.32));
    const upstream = Math.max(1, Math.round(totalWells * 0.08));
    const intermediate = totalWells - downstream - upstream; // absorve rounding
    return { downstream, intermediate, upstream };
}

// ----------------------------------------------------------------
// CAMPAIGN TEMPORAL PATTERN
// 20 campaigns: monthly (1-3), then quarterly (4-12), then semi-annual (13-20)
// ----------------------------------------------------------------

/**
 * Generate campaign dates with realistic frequency pattern.
 * Phases scale proportionally: ~15% baseline (monthly), ~45% monitoring
 * (quarterly), ~40% validation (semi-annual).
 * @param startDate? - Optional start (default: ~3.5 years ago)
 * @param count - Total number of campaigns to generate
 */
export function generateCampaignDates(
    startDate?: Date,
    count = 20,
): Array<{ id: string; name: string; date: Date; type: string }> {
    const nBaseline = Math.max(1, Math.round(count * 0.15));
    const nMonitoring = Math.max(1, Math.round(count * 0.45));
    const nValidation = Math.max(1, count - nBaseline - nMonitoring);

    const campaigns: Date[] = [];
    const start = startDate || runtimeDate(runtimeNow() - 42 * 30.44 * 24 * 3600 * 1000); // ~3.5 years ago
    const current = runtimeDate(start);
    const types: string[] = [];

    // Phase 1: Baseline - monthly
    for (let i = 0; i < nBaseline; i++) {
        types.push('baseline');
        campaigns.push(runtimeDate(current));
        current.setMonth(current.getMonth() + 1);
        current.setDate(current.getDate() + randInt(-3, 3)); // jitter ±3 days
    }
    // Phase 2: Monitoring - quarterly
    for (let i = 0; i < nMonitoring; i++) {
        types.push('monitoring');
        campaigns.push(runtimeDate(current));
        current.setMonth(current.getMonth() + 3);
        current.setDate(current.getDate() + randInt(-7, 7)); // jitter ±7 days
    }
    // Phase 3: Validation - semi-annual
    for (let i = 0; i < nValidation; i++) {
        types.push('validation');
        campaigns.push(runtimeDate(current));
        current.setMonth(current.getMonth() + 6);
        current.setDate(current.getDate() + randInt(-10, 10)); // jitter ±10 days
    }

    return campaigns.slice(0, count).map((date, i) => ({
        id: `campaign-${i + 1}`,
        name: `Campanha ${i + 1}`,
        date,
        type: types[i] as string,
        description:
            types[i] === 'baseline'
                ? 'Linha de base'
                : types[i] === 'monitoring'
                  ? 'Monitoramento de rotina'
                  : 'Validação pós-remediação',
    }));
}

// ----------------------------------------------------------------
// CONTAMINANT GROUPS - for temporal trend correlation
// ----------------------------------------------------------------

export const CONTAMINANT_PARAM_IDS = new Set([
    'benzene',
    'toluene',
    'ethylbenzene',
    'xylenes',
    'styrene',
    'vinyl_chloride',
    'dichloroethylene',
    'trichloroethylene',
    'tetrachloroethylene',
    'chloroform',
    'carbon_tetrachloride',
    'methyl_tert_butyl_ether',
    'naphthalene',
    'acenaphthylene',
    'acenaphthene',
    'fluorene',
    'phenanthrene',
    'anthracene',
    'fluoranthene',
    'pyrene',
    'benzo_a_anthracene',
    'chrysene',
    'benzo_b_fluoranthene',
    'benzo_k_fluoranthene',
    'benzo_a_pyrene',
    'indeno_123cd_pyrene',
    'dibenz_ah_anthracene',
    'benzo_ghi_perylene',
    'tph_gro',
    'tph_dro',
    'tph_oro',
    'tph_total',
    'free_product',
    'dnapl',
]);

// ----------------------------------------------------------------
// METEOROLOGY - for aerial plumes
// ----------------------------------------------------------------

/** Pasquill stability classes and their σ coefficients. */
export const PASQUILL_CLASSES: Record<string, any> = {
    A: { label: 'Very Unstable', sigmaY: 0.22, sigmaZ: 0.2 },
    B: { label: 'Unstable', sigmaY: 0.16, sigmaZ: 0.12 },
    C: { label: 'Slightly Unstable', sigmaY: 0.11, sigmaZ: 0.08 },
    D: { label: 'Neutral', sigmaY: 0.08, sigmaZ: 0.06 },
    E: { label: 'Slightly Stable', sigmaY: 0.06, sigmaZ: 0.03 },
    F: { label: 'Stable', sigmaY: 0.04, sigmaZ: 0.016 },
};

/**
 * Generate realistic meteorological data for a site.
 */
export function generateSiteMeteorology(): {
    dominantWindDir: number;
    windSpeed: number;
    temperature: number;
    humidity: number;
    stabilityClass: string;
    pressureHPa: number;
} {
    // Dominant wind direction (NE/SE common for Brazil, varies globally)
    const dominantWindDir = rand(30, 150); // degrees, NE to SE
    return {
        dominantWindDir,
        windSpeed: rand(2, 12), // m/s (Weibull-like center)
        temperature: rand(18, 32), // °C
        humidity: rand(40, 90), // %
        stabilityClass: pick(['B', 'C', 'C', 'D', 'D', 'D', 'E']), // D (neutral) most common
        pressureHPa: rand(1008, 1025),
    };
}

/**
 * Generate campaign-specific meteorological variation.
 * @param baseMet - Site base meteorology
 */
export function varyCampaignMeteo(baseMet: {
    dominantWindDir: number;
    windSpeed: number;
    temperature: number;
    humidity: number;
    stabilityClass: string;
    pressureHPa: number;
}): {
    windDirection: number;
    windSpeed: number;
    temperature: number;
    humidity: number;
    stabilityClass: string;
    pressureHPa: number;
} {
    return {
        windDirection: baseMet.dominantWindDir + rand(-30, 30), // ±30° variation
        windSpeed: Math.max(1, baseMet.windSpeed + rand(-3, 3)),
        temperature: baseMet.temperature + rand(-5, 5),
        humidity: Math.min(98, Math.max(20, baseMet.humidity + rand(-15, 15))),
        stabilityClass: runtimeRandom('model') < 0.7 ? baseMet.stabilityClass : pick(Object.keys(PASQUILL_CLASSES)),
        pressureHPa: baseMet.pressureHPa + rand(-5, 5),
    };
}

// ----------------------------------------------------------------
// FINANCIAL - WBS, Contracts, EVA
// ----------------------------------------------------------------

/** WBS template for contaminated site remediation project. */
export const WBS_TEMPLATE = [
    {
        code: '1.0',
        name: 'Investigação',
        children: [
            { code: '1.1', name: 'Sondagens', budget: [80000, 250000], duration: [60, 120], weight: 10 },
            { code: '1.2', name: 'Instalação de Poços', budget: [150000, 400000], duration: [45, 90], weight: 15 },
            {
                code: '1.3',
                name: 'Campanhas de Monitoramento',
                budget: [200000, 600000],
                duration: [365, 730],
                weight: 20,
            },
        ],
    },
    {
        code: '2.0',
        name: 'Remediação',
        children: [
            { code: '2.1', name: 'Pump & Treat', budget: [300000, 1200000], duration: [180, 730], weight: 20 },
            { code: '2.2', name: 'Biorremediação', budget: [100000, 500000], duration: [180, 365], weight: 10 },
            {
                code: '2.3',
                name: 'SVE (Soil Vapor Extraction)',
                budget: [200000, 800000],
                duration: [90, 365],
                weight: 10,
            },
        ],
    },
    {
        code: '3.0',
        name: 'Gestão',
        children: [
            { code: '3.1', name: 'Relatórios Técnicos', budget: [50000, 150000], duration: [30, 90], weight: 5 },
            { code: '3.2', name: 'Licenciamento Ambiental', budget: [30000, 100000], duration: [90, 365], weight: 5 },
            { code: '3.3', name: 'Auditoria & Compliance', budget: [40000, 120000], duration: [30, 60], weight: 5 },
        ],
    },
];

/** Contract templates. */
export const CONTRACT_TEMPLATES = [
    { name: 'Perfuração e Instalação de Poços', type: 'drilling', budget: [150000, 400000] },
    { name: 'Análises Laboratoriais', type: 'laboratory', budget: [200000, 600000] },
    { name: 'Remediação do Solo e Água', type: 'remediation', budget: [500000, 2500000] },
    { name: 'Consultoria Ambiental', type: 'consulting', budget: [100000, 300000] },
    { name: 'Monitoramento Contínuo IoT', type: 'monitoring', budget: [80000, 200000] },
];

/**
 * Generate WBS items with realistic budgets and progress.
 */
export function generateWBS(): Array<Record<string, any>> {
    const items: Array<Record<string, any>> = [];
    const projectProgress = rand(0.3, 0.8); // 30-80% overall progress
    void projectProgress;

    for (const phase of WBS_TEMPLATE) {
        let phaseActualCost = 0;
        let phaseBudget = 0;

        for (const task of phase.children) {
            const budget = rand(task.budget[0]!, task.budget[1]!);
            const durationDays = randInt(task.duration[0]!, task.duration[1]!);
            const startDate = runtimeDate(runtimeNow() - randInt(90, 900) * 86400000);
            const endDate = runtimeDate(startDate.getTime() + durationDays * 86400000);
            const now = runtimeNow();

            // Calculate progress based on time elapsed
            const elapsed = Math.max(0, now - startDate.getTime());
            const totalDuration = endDate.getTime() - startDate.getTime();
            const timeProgress = Math.min(1, elapsed / totalDuration);

            // Planned Value (PV) = budget × time progress
            const pv = budget * timeProgress;

            // Earned Value (EV) = budget × actual progress (with variance)
            const actualProgress = Math.min(1, timeProgress * (0.7 + runtimeRandom('model') * 0.6)); // ±30% variance
            const ev = budget * actualProgress;

            // Actual Cost (AC) = EV × cost variance (sometimes over, sometimes under)
            const costVariance = 0.8 + runtimeRandom('model') * 0.5; // 80-130% of EV
            const ac = ev * costVariance;

            const spi = pv > 0 ? ev / pv : 1;
            const cpi = ac > 0 ? ev / ac : 1;

            // eslint-disable-next-line
            phaseActualCost += ac;
            // eslint-disable-next-line
            phaseBudget += budget;

            items.push({
                code: task.code,
                name: task.name,
                phaseCode: phase.code,
                phaseName: phase.name,
                budget: Math.round(budget),
                startDate: startDate.toISOString().slice(0, 10),
                endDate: endDate.toISOString().slice(0, 10),
                durationDays,
                progress: Math.round(actualProgress * 100),
                status: actualProgress >= 1 ? 'complete' : actualProgress > 0 ? 'in_progress' : 'planned',
                weight: task.weight || 0,
                eva: {
                    pv: Math.round(pv),
                    ev: Math.round(ev),
                    ac: Math.round(ac),
                    sv: Math.round(ev - pv),
                    cv: Math.round(ev - ac),
                    spi: Math.round(spi * 100) / 100,
                    cpi: Math.round(cpi * 100) / 100,
                },
            });
        }
    }
    return items;
}

/**
 * Generate random contracts for the project.
 */
export function generateContracts(): Array<Record<string, any>> {
    const numContracts = randInt(3, 5);
    const selected = shuffle([...CONTRACT_TEMPLATES]).slice(0, numContracts) as Array<{
        name: string;
        type: string;
        budget: [number, number];
    }>;
    const suppliers = ['GeoSonda Ltda', 'LabAnalítica S.A.', 'RemediaTech Eng.', 'EcoConsult Amb.', 'SensorNet IoT'];

    return selected.map((tpl, i) => {
        const value = rand(tpl.budget[0], tpl.budget[1]);
        const executedPct = rand(10, 95);
        const startDate = runtimeDate(runtimeNow() - randInt(180, 720) * 86400000);
        const endDate = runtimeDate(startDate.getTime() + randInt(180, 730) * 86400000);

        return {
            id: `contract-${i + 1}`,
            name: tpl.name,
            type: tpl.type,
            supplier: suppliers[i % suppliers.length],
            value: Math.round(value),
            currency: 'BRL',
            executedPct: Math.round(executedPct),
            executedValue: Math.round((value * executedPct) / 100),
            startDate: startDate.toISOString().slice(0, 10),
            endDate: endDate.toISOString().slice(0, 10),
            status: executedPct > 90 ? 'complete' : executedPct > 0 ? 'active' : 'pending',
            paymentTerms: pick(['30 dias', '45 dias', '60 dias', 'Medição mensal']),
            invoices: randInt(2, 12),
        };
    });
}

// ----------------------------------------------------------------
// CREDENTIAL WEIGHTS (for realistic team distribution)
// ----------------------------------------------------------------

const CREDENTIAL_WEIGHTS = [
    { level: 'common', weight: 50 },
    { level: 'professional', weight: 25 },
    { level: 'pos_graduado', weight: 12 },
    { level: 'mestre', weight: 8 },
    { level: 'doutor', weight: 5 },
];
const CREDENTIAL_TOTAL = CREDENTIAL_WEIGHTS.reduce((s, w) => s + w.weight, 0);

export function randomCredentialLevel(): string {
    let r = runtimeRandom('model') * CREDENTIAL_TOTAL;
    for (const { level, weight } of CREDENTIAL_WEIGHTS) {
        r -= weight;
        if (r <= 0) return level;
    }
    return 'common';
}

// ----------------------------------------------------------------
// PROJECT REGISTRY - Projects, Resources, Allocations for Random
// ----------------------------------------------------------------

/** Project name templates. */
const PROJECT_NAMES = [
    'Remediacao Area Industrial',
    'GRI Fase II',
    'Investigacao Detalhada',
    'Monitoramento Ambiental',
];

/** Phase color palette. */
const PHASE_COLORS = ['#3b6bff', '#27ae60', '#f39c12', '#e74c3c'];

/**
 * Generate a complete project registry (project + resources + allocations).
 * Gera registro de projeto com equipe e alocacoes para o modelo aleatorio.
 *
 * @param wbsItems - WBS items from generateWBS()
 * @param contracts - Contracts from generateContracts()
 * @param campaignIds - Campaign IDs created in randomModel
 */
export function generateProjectRegistry(
    wbsItems: Array<Record<string, any>>,
    contracts: Array<Record<string, any>>,
    campaignIds: string[],
): { project: Record<string, any>; resources: Array<Record<string, any>>; allocations: Array<Record<string, any>> } {
    // Agrupa WBS items por fase (phaseCode)
    const phases: Record<string, { name: any; items: Array<Record<string, any>> }> = {};
    for (const wbs of wbsItems) {
        if (!phases[wbs.phaseCode]) {
            phases[wbs.phaseCode] = { name: wbs.phaseName, items: [] };
        }
        phases[wbs.phaseCode]!.items.push(wbs);
    }

    // Calcula datas globais
    const allDates = wbsItems
        .flatMap((w) => [w.startDate, w.endDate])
        .filter(Boolean)
        .sort();
    const projectStart = allDates[0] || runtimeDate().toISOString().slice(0, 10);
    const projectEnd = allDates[allDates.length - 1] || projectStart;

    // Cria fases do projeto baseadas no WBS
    const phaseEntries = Object.entries(phases);
    const projectPhases: Array<Record<string, any>> = phaseEntries.map(([code, data], i) => {
        const dates = data.items
            .flatMap((w) => [w.startDate, w.endDate])
            .filter(Boolean)
            .sort();
        const avgProgress = Math.round(data.items.reduce((s, w) => s + (w.progress || 0), 0) / data.items.length);
        return {
            id: generateId('phase'),
            name: data.name,
            startDate: dates[0] || projectStart,
            endDate: dates[dates.length - 1] || projectEnd,
            percentComplete: avgProgress,
            color: PHASE_COLORS[i % PHASE_COLORS.length],
            isMilestone: false,
            dependencies: [],
            linkedWbsItemId: code,
        };
    });

    // Dependencias: cada fase depende da anterior (finish-to-start)
    for (let i = 1; i < projectPhases.length; i++) {
        projectPhases[i]!.dependencies = [projectPhases[i - 1]!.id];
    }

    // Milestone: Relatorio Final no endDate do projeto
    const milestoneId = generateId('phase');
    projectPhases.push({
        id: milestoneId,
        name: 'Relatorio Final',
        startDate: projectEnd,
        endDate: projectEnd,
        percentComplete: 0,
        color: '#e74c3c',
        isMilestone: true,
        dependencies: projectPhases.length > 0 ? [projectPhases[projectPhases.length - 1]!.id] : [],
        linkedWbsItemId: null,
    });

    // Projeto
    const project = {
        name: pick(PROJECT_NAMES),
        type: 'remediation',
        status: 'active',
        description: 'Projeto gerado automaticamente para demonstracao do sistema.',
        dates: { startDate: projectStart, endDate: projectEnd },
        phases: projectPhases,
        linkedContractIds: contracts.map((c) => c.id),
        linkedCampaignIds: campaignIds || [],
        linkedWbsRootIds: [],
        linkedMacMeasureIds: [],
        linkedElementIds: [],
    };

    // Recursos (nomes genericos - LGPD compliant)
    const now = runtimeDate().toISOString();
    const resourceDefs = [
        { name: 'NOME 01', role: 'Coordenador(a)', level: 'coordinator', hoursPerWeek: 40, costPerHour: 220 },
        { name: 'NOME 02', role: 'Engenheiro(a) Sr.', level: 'senior', hoursPerWeek: 40, costPerHour: 180 },
        { name: 'NOME 03', role: 'Geologo(a)', level: 'mid', hoursPerWeek: 40, costPerHour: 120 },
        { name: 'NOME 04', role: 'Tecnico(a)', level: 'junior', hoursPerWeek: 40, costPerHour: 75 },
        { name: 'NOME 05', role: 'Estagiario(a)', level: 'intern', hoursPerWeek: 20, costPerHour: 50 },
    ];

    const resources = resourceDefs.map((def) => ({
        id: generateId('resource'),
        name: def.name,
        role: def.role,
        level: def.level,
        email: '',
        hoursPerWeek: def.hoursPerWeek,
        costPerHour: def.costPerHour,
        consentGiven: true,
        consentDate: now,
        consentPurpose: 'Gerenciamento de alocacao de recursos em projetos ambientais',
        consentWithdrawn: false,
        active: true,
    }));

    // Alocacoes: mapeia recursos a fases (nao milestone)
    const workPhases = projectPhases.filter((p) => !p.isMilestone);
    const allocations: Array<Record<string, any>> = [];

    // NOME 01 (coordinator) → todas as fases, 2h/dia
    for (const phase of workPhases) {
        allocations.push({
            id: generateId('alloc'),
            resourceId: resources[0]!.id,
            projectId: '', // Sera preenchido pelo handler apos addProject
            phaseId: phase.id,
            hoursPerDay: 2,
            startDate: phase.startDate,
            endDate: phase.endDate,
        });
    }

    // NOME 02 (senior) → fase com mais duracao (tipicamente remediacao), 8h/dia
    const longestPhase = workPhases.reduce(
        (a: Record<string, any>, b: Record<string, any>) =>
            runtimeDate(b.endDate).getTime() - runtimeDate(b.startDate).getTime() >
            runtimeDate(a.endDate).getTime() - runtimeDate(a.startDate).getTime()
                ? b
                : a,
        workPhases[0]!,
    );
    if (longestPhase) {
        allocations.push({
            id: generateId('alloc'),
            resourceId: resources[1]!.id,
            projectId: '',
            phaseId: longestPhase.id,
            hoursPerDay: 8,
            startDate: longestPhase.startDate,
            endDate: longestPhase.endDate,
        });
    }

    // NOME 03 (mid) → primeira fase (investigacao), 8h/dia
    if (workPhases[0]) {
        allocations.push({
            id: generateId('alloc'),
            resourceId: resources[2]!.id,
            projectId: '',
            phaseId: workPhases[0].id,
            hoursPerDay: 8,
            startDate: workPhases[0].startDate,
            endDate: workPhases[0].endDate,
        });
    }

    // NOME 04 (junior) → ultima fase de trabalho (gestao), 6h/dia
    const lastWork = workPhases[workPhases.length - 1];
    if (lastWork) {
        allocations.push({
            id: generateId('alloc'),
            resourceId: resources[3]!.id,
            projectId: '',
            phaseId: lastWork.id,
            hoursPerDay: 6,
            startDate: lastWork.startDate,
            endDate: lastWork.endDate,
        });
    }

    // NOME 05 (intern) → primeira fase, 4h/dia
    if (workPhases[0]) {
        allocations.push({
            id: generateId('alloc'),
            resourceId: resources[4]!.id,
            projectId: '',
            phaseId: workPhases[0].id,
            hoursPerDay: 4,
            startDate: workPhases[0].startDate,
            endDate: workPhases[0].endDate,
        });
    }

    return { project, resources, allocations };
}
