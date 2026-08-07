// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-81 Import Wizard State - pure-logic, zero DOM.
 * Multi-format import + field mapping + dry-run preview.
 * Imutável: toda mutação retorna novo state frozen.
 */

export const VALID_SOURCES = Object.freeze([
    'ecbt-key',
    'csv',
    'xlsx',
    'geojson',
    'gltf',
    'shapefile',
    'json',
    'lab-edd',
    'pdf',
]);

export const STEPS = Object.freeze([
    'select-source',
    'upload-file',
    'detect-fields',
    'map-fields',
    'validate',
    'dry-run',
    'commit',
    'completed',
    'failed',
]);

export const VALID_TRANSFORM_TYPES = Object.freeze(['unit_convert', 'date_parse', 'string_trim', 'number_clamp']);

const SOURCE_SET = new Set<string>(VALID_SOURCES);
const STEP_SET = new Set<string>(STEPS);
const TRANSFORM_SET = new Set<string>(VALID_TRANSFORM_TYPES);

const STEP_INDEX = new Map<string, number>(STEPS.map((s, i) => [s, i]));

interface WizardState {
    step: string;
    source: string | null;
    fileMetadata: Record<string, unknown> | null;
    detectedFields: ReadonlyArray<string>;
    targetFields: ReadonlyArray<string>;
    fieldMapping: ReadonlyMap<string, string>;
    transforms: ReadonlyMap<string, unknown>;
    validationReport: { errors: ReadonlyArray<unknown>; warnings: ReadonlyArray<unknown> } | null;
    importStats: Record<string, number> | null;
    errors: ReadonlyArray<string>;
}

function freezeState(s: {
    step: string;
    source: string | null;
    fileMetadata?: Record<string, unknown> | null;
    detectedFields: ReadonlyArray<string>;
    targetFields: ReadonlyArray<string>;
    fieldMapping: ReadonlyMap<string, string>;
    transforms: ReadonlyMap<string, unknown>;
    validationReport?: { errors?: ReadonlyArray<unknown>; warnings?: ReadonlyArray<unknown> } | null;
    importStats?: Record<string, number> | null;
    errors: ReadonlyArray<string>;
}): WizardState {
    return Object.freeze({
        step: s.step,
        source: s.source,
        fileMetadata: s.fileMetadata ? Object.freeze({ ...s.fileMetadata }) : null,
        detectedFields: Object.freeze([...s.detectedFields]),
        targetFields: Object.freeze([...s.targetFields]),
        fieldMapping: s.fieldMapping,
        transforms: s.transforms,
        validationReport: s.validationReport
            ? Object.freeze({
                  errors: Object.freeze([...(s.validationReport.errors || [])]),
                  warnings: Object.freeze([...(s.validationReport.warnings || [])]),
              })
            : null,
        importStats: s.importStats ? Object.freeze({ ...s.importStats }) : null,
        errors: Object.freeze([...s.errors]),
    });
}

function cloneMap<K, V>(m: ReadonlyMap<K, V>): Map<K, V> {
    return new Map(m);
}

export function createImportWizard(): WizardState {
    return freezeState({
        step: 'select-source',
        source: null,
        fileMetadata: null,
        detectedFields: [],
        targetFields: [],
        fieldMapping: Object.freeze(new Map()),
        transforms: Object.freeze(new Map()),
        validationReport: null,
        importStats: null,
        errors: [],
    });
}

export function setSource(state: WizardState, source: unknown): WizardState {
    if (!SOURCE_SET.has(source as string)) {
        throw new Error(`Invalid source: ${source}`);
    }
    return freezeState({ ...state, source: source as string, step: 'upload-file' });
}

export function setFileMetadata(state: WizardState, metadata: unknown): WizardState {
    if (!metadata || typeof metadata !== 'object') {
        throw new Error('fileMetadata must be object');
    }
    const md = metadata as Record<string, unknown>;
    if (!md.name || typeof md.name !== 'string') {
        throw new Error('fileMetadata.name required');
    }
    if (typeof md.size !== 'number' || md.size < 0) {
        throw new Error('fileMetadata.size must be non-negative number');
    }
    if (!md.type || typeof md.type !== 'string') {
        throw new Error('fileMetadata.type required');
    }
    const fm: Record<string, unknown> = { name: md.name, size: md.size, type: md.type };
    if (md.sha256) fm.sha256 = md.sha256;
    return freezeState({ ...state, fileMetadata: fm });
}

export function setDetectedFields(state: WizardState, fields: unknown): WizardState {
    if (!Array.isArray(fields)) throw new Error('fields must be array');
    return freezeState({ ...state, detectedFields: fields.slice() });
}

export function setTargetFields(state: WizardState, fields: unknown): WizardState {
    if (!Array.isArray(fields)) throw new Error('fields must be array');
    return freezeState({ ...state, targetFields: fields.slice() });
}

export function setFieldMapping(state: WizardState, sourceField: string, targetField: string | null): WizardState {
    if (!state.detectedFields.includes(sourceField)) {
        throw new Error(`sourceField not in detectedFields: ${sourceField}`);
    }
    const next = cloneMap(state.fieldMapping);
    if (targetField === null || targetField === undefined) {
        next.delete(sourceField);
    } else {
        if (!state.targetFields.includes(targetField)) {
            throw new Error(`targetField not in targetFields: ${targetField}`);
        }
        next.set(sourceField, targetField);
    }
    return freezeState({ ...state, fieldMapping: Object.freeze(next) });
}

export function clearFieldMapping(state: WizardState, sourceField: string): WizardState {
    const next = cloneMap(state.fieldMapping);
    next.delete(sourceField);
    return freezeState({ ...state, fieldMapping: Object.freeze(next) });
}

export function addTransform(
    state: WizardState,
    sourceField: string,
    transform: { type: string; params?: Record<string, unknown> },
): WizardState {
    if (!transform || typeof transform !== 'object') {
        throw new Error('transform must be object');
    }
    if (!TRANSFORM_SET.has(transform.type)) {
        throw new Error(`Invalid transform type: ${transform.type}`);
    }
    if (!state.detectedFields.includes(sourceField)) {
        throw new Error(`sourceField not in detectedFields: ${sourceField}`);
    }
    const next = cloneMap(state.transforms);
    next.set(
        sourceField,
        Object.freeze({ type: transform.type, params: Object.freeze({ ...(transform.params || {}) }) }),
    );
    return freezeState({ ...state, transforms: Object.freeze(next) });
}

export function goToStep(state: WizardState, step: string): WizardState {
    if (!STEP_SET.has(step)) throw new Error(`Invalid step: ${step}`);
    return freezeState({ ...state, step });
}

export function nextStep(state: WizardState): WizardState {
    const idx = STEP_INDEX.get(state.step);
    if (idx === undefined) throw new Error(`Unknown current step: ${state.step}`);
    if (idx >= STEPS.length - 2) {
        // 'completed' or 'failed' terminal
        return state;
    }
    return freezeState({ ...state, step: STEPS[idx + 1] as string });
}

export function setValidationReport(
    state: WizardState,
    report: { errors?: unknown; warnings?: unknown },
): WizardState {
    if (!report || typeof report !== 'object') throw new Error('report must be object');
    const errors = Array.isArray(report.errors) ? report.errors : [];
    const warnings = Array.isArray(report.warnings) ? report.warnings : [];
    return freezeState({ ...state, validationReport: { errors, warnings } });
}

export function setImportStats(state: WizardState, stats: Record<string, unknown>): WizardState {
    if (!stats || typeof stats !== 'object') throw new Error('stats must be object');
    const s = {
        rows: Number(stats.rows) || 0,
        accepted: Number(stats.accepted) || 0,
        rejected: Number(stats.rejected) || 0,
        conflicts: Number(stats.conflicts) || 0,
    };
    return freezeState({ ...state, importStats: s });
}

export function commitImport(state: WizardState): WizardState {
    if (!state.validationReport || state.validationReport.errors.length > 0) {
        throw new Error('Cannot commit: validation not valid');
    }
    return freezeState({ ...state, step: 'completed' });
}

export function failImport(state: WizardState, error: unknown): WizardState {
    const msg = error instanceof Error ? error.message : String(error);
    return freezeState({ ...state, step: 'failed', errors: [...state.errors, msg] });
}

export function getRequiredMappings(state: WizardState): string[] {
    const mapped = new Set(state.fieldMapping.values());
    return state.targetFields.filter((t: string) => !mapped.has(t));
}

export function validateMapping(state: WizardState): { valid: boolean; missing: string[] } {
    const missing = getRequiredMappings(state);
    return { valid: missing.length === 0, missing };
}

export function getMappingProgress(state: WizardState): number {
    if (state.targetFields.length === 0) return 0;
    const mapped = new Set(state.fieldMapping.values());
    const covered = state.targetFields.filter((t: string) => mapped.has(t)).length;
    return Math.round((covered / state.targetFields.length) * 100);
}

export function summarizeImportWizard(state: WizardState): {
    step: string;
    source: string | null;
    mappingProgress: number;
    validationStatus: string;
    statsSummary: string | null;
} {
    return {
        step: state.step,
        source: state.source,
        mappingProgress: getMappingProgress(state),
        validationStatus: state.validationReport
            ? state.validationReport.errors.length === 0
                ? 'valid'
                : 'invalid'
            : 'pending',
        statsSummary: state.importStats
            ? `${state.importStats.accepted}/${state.importStats.rows} accepted, ${state.importStats.rejected} rejected, ${state.importStats.conflicts} conflicts`
            : null,
    };
}
