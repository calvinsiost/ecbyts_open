// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-80 Export Wizard State - pure-logic, zero DOM.
 * Multi-format export selector + filter + estimate.
 * Imutável: toda mutação retorna novo state frozen.
 */

export const VALID_FORMATS = Object.freeze([
    'ecbt-a',
    'ecbt-b',
    'ecbt-c',
    'csv',
    'xlsx',
    'geojson',
    'gltf',
    'obj',
    'gdl',
    'ifc',
    'kml',
    'pdf-report',
    'json',
]);

export const VALID_INCLUDES = Object.freeze(['elements', 'campaigns', 'observations', 'scenes', 'analytics']);

export const VALID_DESTINATIONS = Object.freeze(['download', 'email', 'cloud-storage']);

export const STEPS = Object.freeze([
    'select-format',
    'choose-includes',
    'apply-filters',
    'configure-options',
    'review',
    'exporting',
    'completed',
    'failed',
]);

const FORMAT_SET = new Set(VALID_FORMATS);
const INCLUDE_SET = new Set(VALID_INCLUDES);
const DEST_SET = new Set(VALID_DESTINATIONS);
const STEP_SET = new Set(STEPS);
const VALID_FILTER_KEYS = new Set(['familyIds', 'campaignIds', 'dateRange']);

function freezeConfig(config: any): any {
    const filters = Object.freeze({
        familyIds: new Set(config.filters.familyIds),
        campaignIds: new Set(config.filters.campaignIds),
        dateRange: config.filters.dateRange ? Object.freeze({ ...config.filters.dateRange }) : null,
    });
    return Object.freeze({
        format: config.format,
        includes: new Set(config.includes),
        filters,
        options: Object.freeze({ ...config.options }),
        destination: config.destination,
    });
}

function freezeState(state: any): any {
    return Object.freeze({
        config: freezeConfig(state.config),
        step: state.step,
        progress: state.progress,
        errors: Object.freeze([...state.errors]),
        downloadUrl: state.downloadUrl ?? null,
    });
}

/** Create empty wizard. */
export function createExportWizard(): any {
    return freezeState({
        config: {
            format: null,
            includes: new Set(['elements']),
            filters: { familyIds: new Set(), campaignIds: new Set(), dateRange: null },
            options: {},
            destination: 'download',
        },
        step: 'select-format',
        progress: 0,
        errors: [],
    });
}

export function setFormat(state: any, format: any): any {
    if (!FORMAT_SET.has(format)) {
        throw new Error(`setFormat: invalid format "${format}"`);
    }
    return freezeState({
        ...state,
        config: { ...state.config, format },
        step: 'choose-includes',
        errors: [],
    });
}

export function toggleInclude(state: any, key: any): any {
    if (!INCLUDE_SET.has(key)) {
        throw new Error(`toggleInclude: invalid include "${key}"`);
    }
    const includes = new Set(state.config.includes);
    if (includes.has(key)) includes.delete(key);
    else includes.add(key);
    return freezeState({
        ...state,
        config: { ...state.config, includes },
    });
}

export function setFilter(state: any, filterKey: any, value: any): any {
    if (!VALID_FILTER_KEYS.has(filterKey)) {
        throw new Error(`setFilter: invalid filter key "${filterKey}"`);
    }
    const filters = {
        familyIds: new Set(state.config.filters.familyIds),
        campaignIds: new Set(state.config.filters.campaignIds),
        dateRange: state.config.filters.dateRange,
    };
    if (filterKey === 'familyIds' || filterKey === 'campaignIds') {
        if (!(value instanceof Set) && !Array.isArray(value)) {
            throw new Error(`setFilter: ${filterKey} requires Set or Array`);
        }
        (filters as Record<string, any>)[filterKey] = new Set(value);
    } else {
        // dateRange
        if (value !== null && (typeof value !== 'object' || !value.start || !value.end)) {
            throw new Error('setFilter: dateRange requires {start, end} or null');
        }
        filters.dateRange = value;
    }
    return freezeState({
        ...state,
        config: { ...state.config, filters },
    });
}

export function setOption(state: any, key: any, value: any): any {
    if (typeof key !== 'string' || !key) {
        throw new Error('setOption: key must be non-empty string');
    }
    return freezeState({
        ...state,
        config: { ...state.config, options: { ...state.config.options, [key]: value } },
    });
}

export function setDestination(state: any, destination: any): any {
    if (!DEST_SET.has(destination)) {
        throw new Error(`setDestination: invalid destination "${destination}"`);
    }
    return freezeState({
        ...state,
        config: { ...state.config, destination },
    });
}

const FORWARD_STEPS = ['select-format', 'choose-includes', 'apply-filters', 'configure-options', 'review'];

export function goToStep(state: any, step: any): any {
    if (!STEP_SET.has(step)) {
        throw new Error(`goToStep: invalid step "${step}"`);
    }
    const curIdx = FORWARD_STEPS.indexOf(state.step);
    const tgtIdx = FORWARD_STEPS.indexOf(step);
    // Both within forward sequence
    if (curIdx >= 0 && tgtIdx >= 0) {
        if (tgtIdx > curIdx + 1) {
            throw new Error(`goToStep: cannot skip forward from "${state.step}" to "${step}"`);
        }
        return freezeState({ ...state, step });
    }
    // Terminal/exporting steps: cannot freely jump
    throw new Error(`goToStep: invalid transition "${state.step}" → "${step}"`);
}

export function nextStep(state: any): any {
    const curIdx = FORWARD_STEPS.indexOf(state.step);
    if (curIdx < 0 || curIdx >= FORWARD_STEPS.length - 1) {
        throw new Error(`nextStep: no forward step from "${state.step}"`);
    }
    return freezeState({ ...state, step: FORWARD_STEPS[curIdx + 1] });
}

export function validateConfig(state: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { config } = state;
    if (!config.format) errors.push('format-required');
    if (config.includes.size === 0) errors.push('includes-required');
    // PDF report requires analytics include
    if (config.format === 'pdf-report' && !config.includes.has('analytics')) {
        errors.push('pdf-report-requires-analytics');
    }
    // GLTF/OBJ/GDL/IFC/KML require elements (geometria 3D vem dos elementos da cena)
    if (
        (config.format === 'gltf' || config.format === 'obj' || config.format === 'gdl' || config.format === 'ifc' || config.format === 'kml') &&
        !config.includes.has('elements')
    ) {
        errors.push(`${config.format}-requires-elements`);
    }
    if (!DEST_SET.has(config.destination)) errors.push('destination-invalid');
    return { valid: errors.length === 0, errors };
}

export function startExport(state: any): any {
    const v = validateConfig(state);
    if (!v.valid) {
        throw new Error(`startExport: invalid config [${v.errors.join(', ')}]`);
    }
    return freezeState({
        ...state,
        step: 'exporting',
        progress: 0,
        errors: [],
    });
}

export function updateExportProgress(state: any, percent: any): any {
    if (typeof percent !== 'number' || !Number.isFinite(percent)) {
        throw new Error('updateExportProgress: percent must be finite number');
    }
    if (percent < 0 || percent > 100) {
        throw new Error(`updateExportProgress: out of range ${percent}`);
    }
    return freezeState({ ...state, progress: percent });
}

export function completeExport(state: any, downloadUrl: any = null): any {
    return freezeState({
        ...state,
        step: 'completed',
        progress: 100,
        downloadUrl,
    });
}

export function failExport(state: any, error: any): any {
    const msg = typeof error === 'string' ? error : (error && error.message) || 'unknown-error';
    return freezeState({
        ...state,
        step: 'failed',
        errors: [...state.errors, msg],
    });
}

const PER_OBSERVATION_BYTES = {
    'ecbt-a': 200,
    'ecbt-b': 280,
    'ecbt-c': 100,
    csv: 100,
    xlsx: 140,
    geojson: 250,
    gltf: 0,
    ifc: 0,
    kml: 220,
    'pdf-report': 60,
    json: 300,
};

const PER_ELEMENT_BYTES = {
    'ecbt-a': 0,
    'ecbt-b': 0,
    'ecbt-c': 0,
    csv: 200,
    xlsx: 240,
    geojson: 600,
    gltf: 5120,
    ifc: 4096,
    kml: 800,
    'pdf-report': 120,
    json: 500,
};

const BASE_BYTES = {
    'ecbt-a': 2048,
    'ecbt-b': 4096,
    'ecbt-c': 1024,
    csv: 256,
    xlsx: 8192,
    geojson: 512,
    gltf: 16384,
    ifc: 32768,
    kml: 1024,
    'pdf-report': 51200,
    json: 512,
};

export function estimateOutputSize(state: any, modelStats: any): number {
    const { config } = state;
    if (!config.format) return 0;
    const stats = modelStats || {};
    const elements = Number(stats.elements) || 0;
    const observations = Number(stats.observations) || 0;
    const campaigns = Number(stats.campaigns) || 0;

    const fmt = config.format;
    let bytes = (BASE_BYTES as Record<string, number>)[fmt] || 0;
    if (config.includes.has('elements')) {
        bytes += elements * ((PER_ELEMENT_BYTES as Record<string, number>)[fmt] || 0);
    }
    if (config.includes.has('observations')) {
        bytes += observations * ((PER_OBSERVATION_BYTES as Record<string, number>)[fmt] || 0);
    }
    if (config.includes.has('campaigns')) {
        bytes += campaigns * 150;
    }
    if (config.includes.has('analytics')) {
        bytes += 4096;
    }
    if (config.includes.has('scenes')) {
        bytes += (Number(stats.scenes) || 0) * 800;
    }
    // ECBT-C compressed: ~40%
    if (fmt === 'ecbt-c') bytes = Math.round(bytes * 0.4);
    return bytes;
}

export function getEstimatedDuration(state: any, modelStats: any): number {
    const bytes = estimateOutputSize(state, modelStats);
    // ~1MB/s baseline + 50ms overhead
    const ms = 50 + Math.round(bytes / 1024);
    return ms;
}

export function summarizeExportWizard(state: any): any {
    const { valid } = validateConfig(state);
    return Object.freeze({
        step: state.step,
        format: state.config.format,
        includesCount: state.config.includes.size,
        hasFilters:
            state.config.filters.familyIds.size > 0 ||
            state.config.filters.campaignIds.size > 0 ||
            state.config.filters.dateRange !== null,
        valid,
        progress: state.progress,
    });
}
