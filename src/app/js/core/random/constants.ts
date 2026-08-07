// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * RANDOM_MODEL_DEFAULTS - extracted in RANDOM-REBUILD-V2 Phase C.1
 * from app/js/core/elements/randomModel.js.
 *
 * Frozen via Object.freeze to prevent accidental mutation. Consumed by
 * the 8 _rm* subfunctions (soon phase-*.js) and by 34 tests in
 * tests/random-model-defaults.test.mjs.
 *
 * Originally extracted in V1 F4 (commit 055e606 + c5f427b). This file is
 * the final resting place - randomModel.js re-exports it for backward
 * compatibility with 42+ callers + 96 preset tests.
 */

export type RandomModelSiteSize = 'small' | 'medium' | 'large';
export type RandomModelContaminationLevel = 'low' | 'medium' | 'high';

export interface RandomModelDefaultOptions {
    campaigns: number;
    wells: number;
    plumes: number;
    buildings: number;
    density: number;
    siteSize: RandomModelSiteSize;
    contaminationLevel: RandomModelContaminationLevel;
    includeCosts: boolean;
    transparentVisuals: boolean;
    seedDemoData: boolean;
    includeAerialOverlay: boolean;
    applyHighLodDefaults: boolean;
}

export type NumericRange = readonly [number, number];

export interface PlumeDepthPreset {
    level: 'shallow' | 'middle' | 'deep';
    top: number;
    bottom: number;
    yCenter: number;
}

export interface RandomModelDefaults {
    options: RandomModelDefaultOptions;
    siteSizes: Record<RandomModelSiteSize, NumericRange>;
    contaminationMultiplier: Record<RandomModelContaminationLevel, number>;
    plumeDepths: readonly PlumeDepthPreset[];
    counts: Record<
        | 'buildings'
        | 'tanks'
        | 'springs'
        | 'blueprints'
        | 'habitats'
        | 'individuals'
        | 'sensors'
        | 'emissionSources'
        | 'wasteStreams'
        | 'effluentPoints'
        | 'areas'
        | 'incidents'
        | 'samples',
        NumericRange
    >;
    polling: {
        maxAttempts: number;
        intervalMs: number;
    };
    plumeShrink: Record<'btex' | 'metals', NumericRange>;
}

// ----------------------------------------------------------------
// DEFAULTS - Constants extracted from generateRandomModel
// ----------------------------------------------------------------

export const RANDOM_MODEL_DEFAULTS = Object.freeze({
    // Options defaults merged with user opts.
    options: {
        campaigns: 18,
        wells: 22,
        plumes: 3,
        buildings: 4,
        density: 1.0,
        siteSize: 'medium',
        contaminationLevel: 'medium',
        includeCosts: true,
        transparentVisuals: true,
        seedDemoData: true,
        includeAerialOverlay: true,
        applyHighLodDefaults: true,
    },
    // Site dimensions (half-width x half-length) in meters by preset.
    siteSizes: {
        small: [80, 160],
        medium: [180, 320],
        large: [340, 680],
    },
    // Contamination multipliers by level.
    contaminationMultiplier: {
        low: 0.25,
        medium: 1.0,
        high: 2.8,
    },
    // Plume depths, keeping shallow.bottom = middle.top = deep linkage.
    plumeDepths: [
        { level: 'shallow', top: 0, bottom: -18, yCenter: -9 },
        { level: 'middle', top: -18, bottom: -45, yCenter: -31.5 },
        { level: 'deep', top: -45, bottom: -85, yCenter: -65 },
    ],
    // Variable counts as [min, max] tuples for randInt consumers.
    counts: {
        buildings: [2, 5],
        tanks: [1, 4],
        springs: [0, 3],
        blueprints: [1, 3],
        habitats: [2, 4],
        individuals: [6, 18],
        sensors: [2, 4],
        emissionSources: [2, 4],
        wasteStreams: [1, 4],
        effluentPoints: [1, 3],
        areas: [3, 5],
        incidents: [0, 4],
        samples: [2, 5],
    },
    // Polling for geology data readiness.
    polling: {
        maxAttempts: 8,
        intervalMs: 450,
    },
    // Shrink factors for plumes as [min, max].
    plumeShrink: {
        btex: [0.4, 0.6],
        metals: [0.06, 0.18],
    },
} as const satisfies RandomModelDefaults);
