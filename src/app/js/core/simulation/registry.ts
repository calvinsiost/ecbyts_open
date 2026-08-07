// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

const MODELS: Array<any> = [
    {
        id: 'gaussian-plume',
        name: 'Gaussian Plume Dispersion',
        version: '1.0.0',
        domain: 'atmospheric',
        fidelityLevel: 1,
        description: 'Screening-level atmospheric dispersion using Gaussian plume equation.',
        license: { spdx: 'MIT', name: 'MIT', badge: 'green' },
        source: { type: 'builtin', entry: './solvers/gaussianPlume.js', fn: 'runGaussianPlume' },
        inputs: [
            {
                id: 'sourcePosition',
                label: 'Source Element',
                type: 'elementPosition',
                familyFilter: ['tank', 'marker'],
                fallback: 'volumeCenter',
            },
            { id: 'emissionRate', label: 'Emission Rate (g/s)', type: 'number', min: 0, default: 10 },
            { id: 'windSpeed', label: 'Wind Speed (m/s)', type: 'number', min: 0.1, default: 3 },
            { id: 'stackHeight', label: 'Stack Height (m)', type: 'number', min: 0, default: 30 },
        ],
        outputs: [{ id: 'concentration', type: 'voxelChannel', unit: 'ug/m3', ramp: 'contamination' }],
    },
    {
        id: 'scs-curve-number',
        name: 'SCS Curve Number',
        version: '1.0.0',
        domain: 'watershed',
        fidelityLevel: 1,
        description: 'Screening runoff estimate from rainfall and curve number.',
        license: { spdx: 'Public-Domain', name: 'Public Domain', badge: 'green' },
        source: { type: 'builtin', entry: './solvers/scsCurveNumber.js', fn: 'runScsCurveNumber' },
        inputs: [
            { id: 'precipitation', label: 'Precipitation (mm)', type: 'number', min: 0, default: 60 },
            {
                id: 'curveNumber',
                label: 'Curve Number',
                type: 'observationField',
                parameterId: 'curve_number',
                interpolation: 'idw',
                scalarFallback: 75,
                min: 30,
                max: 100,
            },
            { id: 'slopeFactor', label: 'Slope Factor', type: 'number', min: 0.1, default: 1 },
        ],
        outputs: [{ id: 'runoff', type: 'voxelChannel', unit: 'mm', ramp: 'water_table' }],
    },
    {
        id: 'usle-rusle',
        name: 'USLE / RUSLE',
        version: '1.0.0',
        domain: 'sediment',
        fidelityLevel: 1,
        description: 'Empirical soil loss estimate.',
        license: { spdx: 'Public-Domain', name: 'Public Domain', badge: 'green' },
        source: { type: 'builtin', entry: './solvers/usleRusle.js', fn: 'runUsleRusle' },
        inputs: [
            { id: 'R', label: 'R factor', type: 'number', min: 0, default: 200 },
            {
                id: 'K',
                label: 'K factor (Soil Erodibility)',
                type: 'observationField',
                parameterId: 'soil_erodibility',
                interpolation: 'idw',
                scalarFallback: 0.03,
                min: 0,
            },
            { id: 'LS', label: 'LS factor', type: 'number', min: 0, default: 1.2 },
            {
                id: 'C',
                label: 'C factor (Cover)',
                type: 'observationField',
                parameterId: 'cover_factor',
                interpolation: 'idw',
                scalarFallback: 0.5,
                min: 0,
            },
            { id: 'P', label: 'P factor', type: 'number', min: 0, default: 1 },
        ],
        outputs: [{ id: 'erosion', type: 'voxelChannel', unit: 't/ha/yr', ramp: 'terrain' }],
    },
    {
        id: 'theis-thiem',
        name: 'Theis / Thiem Drawdown',
        version: '1.0.0',
        domain: 'groundwater',
        fidelityLevel: 1,
        description: 'Analytical drawdown screening around pumping center.',
        license: { spdx: 'Public-Domain', name: 'Public Domain', badge: 'green' },
        source: { type: 'builtin', entry: './solvers/theisThiem.js', fn: 'runTheisThiem' },
        inputs: [
            {
                id: 'sourcePosition',
                label: 'Pumping Well',
                type: 'elementPosition',
                familyFilter: ['well'],
                fallback: 'volumeCenter',
            },
            { id: 'pumpingRate', label: 'Pumping Rate', type: 'number', min: 0, default: 200 },
            { id: 'transmissivity', label: 'Transmissivity', type: 'number', min: 0.1, default: 120 },
        ],
        outputs: [{ id: 'drawdown', type: 'voxelChannel', unit: 'm', ramp: 'potentiometric' }],
    },
    {
        id: 'green-ampt',
        name: 'Green-Ampt Infiltration',
        version: '1.0.0',
        domain: 'watershed',
        fidelityLevel: 1,
        description: 'Infiltration screening with Green-Ampt approximation.',
        license: { spdx: 'Public-Domain', name: 'Public Domain', badge: 'green' },
        source: { type: 'builtin', entry: './solvers/greenAmpt.js', fn: 'runGreenAmpt' },
        inputs: [
            {
                id: 'hydraulicConductivity',
                label: 'Hydraulic Conductivity',
                type: 'observationField',
                parameterId: 'hydraulic_conductivity',
                interpolation: 'idw',
                scalarFallback: 5,
                min: 0.01,
            },
            { id: 'activeZones', label: 'Active Zones', type: 'zoneAware', zones: [1, 2], default: [1] },
            { id: 'suctionHead', label: 'Suction Head', type: 'number', min: 0.01, default: 100 },
            { id: 'moistureDeficit', label: 'Moisture Deficit', type: 'number', min: 0.01, default: 0.2 },
        ],
        outputs: [{ id: 'infiltration', type: 'voxelChannel', unit: 'mm/h', ramp: 'water_table' }],
    },
    {
        id: 'manning-equation',
        name: 'Manning Equation',
        version: '1.0.0',
        domain: 'surface_water',
        fidelityLevel: 1,
        description: 'Open-channel flow velocity screening.',
        license: { spdx: 'Public-Domain', name: 'Public Domain', badge: 'green' },
        source: { type: 'builtin', entry: './solvers/manningEquation.js', fn: 'runManningEquation' },
        inputs: [
            {
                id: 'roughnessN',
                label: 'Manning n',
                type: 'observationField',
                parameterId: 'manning_roughness',
                interpolation: 'idw',
                scalarFallback: 0.03,
                min: 0.01,
            },
            { id: 'hydraulicRadius', label: 'Hydraulic Radius', type: 'number', min: 0.05, default: 1 },
            { id: 'slope', label: 'Slope', type: 'number', min: 0.0001, default: 0.01 },
        ],
        outputs: [{ id: 'velocity', type: 'voxelChannel', unit: 'm/s', ramp: 'water_table' }],
    },
];

/**
 * @returns
 */
export function getAllSimulationModels(): Array<any> {
    return MODELS.slice();
}

/**
 * @param modelId
 * @returns
 */
export function getSimulationModel(modelId: string): object | null {
    return MODELS.find((m) => m.id === modelId) || null;
}

/**
 * @param domain
 * @returns
 */
export function getSimulationModelsByDomain(domain: string): Array<any> {
    return MODELS.filter((m) => m.domain === domain);
}

/**
 * @param model
 * @returns
 */
export function buildDefaultParams(model: { inputs?: Array<{ id: string; default?: any }> }): Record<string, any> {
    const out: Record<string, any> = {};
    for (const input of model.inputs || []) {
        out[input.id] = input.default;
    }
    return out;
}

// ----------------------------------------------------------------
// EXTERNAL MODELS (cdn-esm - persisted in localStorage)
// ----------------------------------------------------------------

const EXT_KEY = 'ecbyts-sim-external-models';

// IDs de modelos builtin - externos não podem sobrescrever
const _builtinIds = new Set(MODELS.map((m) => m.id));

// Carrega modelos externos ao inicializar
/**
 * @returns
 */
(function _loadExternal(): void {
    try {
        const saved = localStorage.getItem(EXT_KEY) || '';
        if (!saved) return;
        JSON.parse(saved).forEach((m: any) => MODELS.push({ ...m, _external: true }));
    } catch (e) {
        const err = e as Error;
        console.debug('[simulation/registry] loadExternal:', err?.message || e);
        /* silencioso */
    }
})();

/**
 * Register an external solver model (cdn-esm).
 * Registers in the MODELS array and persists to localStorage.
 * @param descriptor
 * @returns
 */
export function addExternalModel(
    descriptor: { id: string; source: { repository: string; fn: string } } & Record<string, any>,
): void {
    if (!descriptor?.id || !descriptor?.source?.repository || !descriptor?.source?.fn)
        throw new Error('Invalid external model descriptor: id, source.repository and source.fn are required');
    if (_builtinIds.has(descriptor.id)) throw new Error(`ID "${descriptor.id}" conflicts with a builtin model`);
    const idx = MODELS.findIndex((m) => m.id === descriptor.id);
    if (idx >= 0) MODELS.splice(idx, 1);
    MODELS.push({ ...descriptor, _external: true });
    _saveExternal();
}

/**
 * Remove an external solver model by id.
 * @param id
 * @returns
 */
export function removeExternalModel(id: string): void {
    const idx = MODELS.findIndex((m) => m.id === id && m._external);
    if (idx >= 0) {
        MODELS.splice(idx, 1);
        _saveExternal();
    }
}

/**
 * @returns
 */
function _saveExternal(): void {
    localStorage.setItem(EXT_KEY, JSON.stringify(MODELS.filter((m) => m._external)));
}
