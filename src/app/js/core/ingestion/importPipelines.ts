// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   IMPORT PIPELINES — SPEC_IMPORT_PIPELINES

   Pure helpers para pipelines de importação:
   - 4 engines canônicos (EDD, GHG, Cimento, Generic)
   - 3-step wizard state machine §Q2 (preview → mapping → confirm)
   - Chunking decision para grandes arquivos §Q3
   - Column mapping validation

   LLM inference + file upload em handler.
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Engine registry §Q1
// ──────────────────────────────────────────────────────────────────────

export const ENGINE_TYPES = Object.freeze({
    EDD: {
        id: 'edd',
        label: 'EPA EDD',
        specific: true,
        requiredSheets: ['Location', 'Sample', 'TestResultsQC'],
        requiredColumns: {
            Location: ['LocationID', 'Latitude', 'Longitude'],
            Sample: ['SampleID', 'LocationID', 'SampleDate'],
            TestResultsQC: ['SampleID', 'AnalyteCode', 'Result'],
        },
    },
    GHG: {
        id: 'ghg',
        label: 'GHG Protocol',
        specific: true,
        requiredSheets: ['Scope1', 'Scope2', 'Scope3'],
        requiredColumns: {
            Scope1: ['Source', 'EmissionKgCO2e'],
            Scope2: ['ElectricityMWh'],
            Scope3: ['Category', 'Quantity'],
        },
    },
    CEMENT: {
        id: 'cement',
        label: 'Indústria de Cimento',
        specific: true,
        requiredSheets: ['Clinker', 'Additives', 'Emissions'],
        requiredColumns: {
            Clinker: ['Date', 'Production_t', 'CaO_pct'],
        },
    },
    GENERIC: {
        id: 'generic',
        label: 'Genérico (IA)',
        specific: false,
        requiredSheets: [],
        requiredColumns: {},
    },
});

export const ENGINE_IDS = Object.freeze(Object.values(ENGINE_TYPES).map((e) => e.id));

// ──────────────────────────────────────────────────────────────────────
// Wizard state machine §Q2 (preview → mapping → confirm)
// ──────────────────────────────────────────────────────────────────────

export const WIZARD_STEPS = Object.freeze(['preview', 'mapping', 'confirm']);
export const DEFAULT_STEP = 'preview';

const STEP_TRANSITIONS = Object.freeze({
    preview: ['mapping'],
    mapping: ['preview', 'confirm'],
    confirm: ['mapping'],
});

/**
 * Valida transição de step.
 * @param from
 * @param to
 */
export function canTransitionStep(from: string, to: string): { allowed: boolean; reason: string } {
    if (!WIZARD_STEPS.includes(from)) return { allowed: false, reason: `invalid from: ${from}` };
    if (!WIZARD_STEPS.includes(to)) return { allowed: false, reason: `invalid to: ${to}` };
    if (from === to) return { allowed: false, reason: 'no_op' };
    const allowed = (STEP_TRANSITIONS as any)[from] || [];
    if (!allowed.includes(to)) return { allowed: false, reason: `not allowed: ${from} → ${to}` };
    return { allowed: true, reason: 'ok' };
}

// ──────────────────────────────────────────────────────────────────────
// Chunking decision §Q3
// ──────────────────────────────────────────────────────────────────────

export const CHUNK_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB
export const CHUNK_SIZE_ROWS = 5000;

/**
 * Decide se arquivo deve ser streamed/chunked.
 * @param fileSizeBytes
 */
export function shouldStream(fileSizeBytes: number): boolean {
    if (!Number.isFinite(fileSizeBytes)) return false;
    return fileSizeBytes > CHUNK_THRESHOLD_BYTES;
}

/**
 * Computa número de chunks para N rows.
 * @param rowCount
 * @param chunkSize
 */
export function computeChunkCount(rowCount: number, chunkSize: number = CHUNK_SIZE_ROWS): number {
    if (!Number.isFinite(rowCount) || rowCount <= 0) return 0;
    return Math.ceil(rowCount / chunkSize);
}

// ──────────────────────────────────────────────────────────────────────
// Engine validation
// ──────────────────────────────────────────────────────────────────────

/**
 * @param engineId
 */
export function isValidEngineId(engineId: string): boolean {
    return typeof engineId === 'string' && ENGINE_IDS.includes(engineId);
}

/**
 * @param engineId
 */
export function getEngine(engineId: string): any | null {
    for (const e of Object.values(ENGINE_TYPES)) {
        if (e.id === engineId) return e;
    }
    return null;
}

/**
 * Valida se arquivo parsed satisfaz requisitos do engine.
 *
 * @param parsedFile - { sheets: { [name]: { columns: [] } } }
 * @param any>
 */
export function validateForEngine(
    parsedFile: Record<string, any>,
    engineId: string,
): {
    valid: boolean;
    missingSheets: Array<string>;
    missingColumns: Record<string, Array<string>>;
    errors: Array<string>;
} {
    const engine = getEngine(engineId);
    if (!engine) {
        return { valid: false, missingSheets: [], missingColumns: {}, errors: ['unknown engine'] };
    }
    if (!engine.specific) {
        // Generic engine aceita qualquer shape
        return { valid: true, missingSheets: [], missingColumns: {}, errors: [] };
    }

    const sheets = parsedFile?.sheets || {};
    const missingSheets = engine.requiredSheets.filter((s: any) => !sheets[s]);
    const missingColumns: Record<string, string[]> = {};
    for (const [sheetName, requiredCols] of Object.entries(engine.requiredColumns)) {
        if (!sheets[sheetName]) continue;
        const available = Array.isArray(sheets[sheetName].columns) ? sheets[sheetName].columns : [];
        const missing = (requiredCols as any[]).filter((c: any) => !available.includes(c as any));
        if (missing.length > 0) missingColumns[sheetName] = missing;
    }
    const valid = missingSheets.length === 0 && Object.keys(missingColumns).length === 0;
    return { valid, missingSheets, missingColumns, errors: [] };
}

// ──────────────────────────────────────────────────────────────────────
// Auto-detect engine
// ──────────────────────────────────────────────────────────────────────

/**
 * Tenta detectar engine baseado em sheet names presentes.
 *
 * @param parsedFile
 */
export function autoDetectEngine(parsedFile: Record<string, any>): {
    engineId: string | null;
    confidence: number;
} {
    const sheets = parsedFile?.sheets || {};
    const sheetNames = Object.keys(sheets);
    if (sheetNames.length === 0) return { engineId: null, confidence: 0 };

    let bestMatch: string | null = null;
    let bestConfidence = 0;
    for (const engine of Object.values(ENGINE_TYPES)) {
        if (!engine.specific) continue;
        const required = engine.requiredSheets;
        if (required.length === 0) continue;
        const matched = required.filter((s) => sheetNames.includes(s)).length;
        const confidence = matched / required.length;
        if (confidence > bestConfidence) {
            bestMatch = engine.id;
            bestConfidence = confidence;
        }
    }
    if (bestConfidence >= 0.5) return { engineId: bestMatch, confidence: bestConfidence };
    return { engineId: 'generic', confidence: 0.3 };
}

// ──────────────────────────────────────────────────────────────────────
// Column mapping
// ──────────────────────────────────────────────────────────────────────

/**
 * Valida mapeamento de colunas user → schema target.
 *
 * @param mapping - { sourceCol: targetCol }
 * @param requiredTargets
 */
export function validateColumnMapping(
    mapping: { [key: string]: string },
    requiredTargets: Array<string> = [],
): { valid: boolean; unmappedRequired: Array<string>; duplicates: Array<string> } {
    const out: { valid: boolean; unmappedRequired: string[]; duplicates: string[] } = {
        valid: true,
        unmappedRequired: [],
        duplicates: [],
    };
    if (!mapping || typeof mapping !== 'object') {
        return { valid: false, unmappedRequired: requiredTargets, duplicates: [] };
    }
    const mappedTargets = Object.values(mapping);

    // Unmapped required
    out.unmappedRequired = requiredTargets.filter((t) => !mappedTargets.includes(t));

    // Duplicates: same target mapped from multiple sources
    const seen = new Set();
    const dups = new Set<string>();
    for (const t of mappedTargets) {
        if (seen.has(t)) dups.add(t);
        else seen.add(t);
    }
    out.duplicates = Array.from(dups);

    out.valid = out.unmappedRequired.length === 0 && out.duplicates.length === 0;
    return out;
}
