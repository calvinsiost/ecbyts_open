// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   OSEDT-DM CONFORMANCE CHECKER — SPEC_RECONCILIATION_007_OPEN_SPEC

   Pure helpers para validar ECBT models contra os 3 níveis da
   "Open Specification for Environmental & Occupational Digital Twin
   Data Model" (OSEDT-DM) §Q7.4:

   L1 · Schema mínimo obrigatório
       - id, version, metadata.createdAt, elements[]
       - elements: cada um com {id, familyId, geometry}
   L2 · L1 + integridade criptográfica
       - merkleRoot, signature, hashChain presentes
   L3 · L2 + integração regulatória + interop
       - thresholds vinculados (CONAMA/CETESB)
       - exports multi-format listados

   Referência: docs/specification/OSEDT-DM-v0.1.md
   Licença spec: CC BY 4.0 §Q7.5 (código continua AGPL).
   ================================================================ */

interface ConformanceResult {
    passed: boolean;
    errors: string[];
    warnings: string[];
}

// ──────────────────────────────────────────────────────────────────────
// Constants §Q7.4
// ──────────────────────────────────────────────────────────────────────

export const CONFORMANCE_LEVELS = Object.freeze(['L1', 'L2', 'L3']);

export const SPEC_VERSION = 'OSEDT-DM-v0.1';

export const SPEC_LICENSE = 'CC BY 4.0';

export const CONFORMANCE_STATUS = Object.freeze(['passed', 'partial', 'failed']);

// L1 required fields
const L1_MODEL_REQUIRED = Object.freeze(['id', 'version', 'metadata', 'elements']);
const L1_ELEMENT_REQUIRED = Object.freeze(['id', 'familyId', 'geometry']);

// L2 integrity fields (adicionalmente a L1)
const L2_INTEGRITY_REQUIRED = Object.freeze(['merkleRoot', 'signature', 'hashChain']);

// L3 regulatory + interop fields (adicionalmente a L2)
const L3_REGULATORY_REQUIRED = Object.freeze(['thresholds', 'exports']);

// ──────────────────────────────────────────────────────────────────────
// L1 checks
// ──────────────────────────────────────────────────────────────────────

export function checkL1(model: Record<string, any>): ConformanceResult {
    const errors: string[] = [];
    const warnings: any[] = [];

    if (!model || typeof model !== 'object') {
        return { passed: false, errors: ['model is not object'], warnings };
    }

    for (const field of L1_MODEL_REQUIRED) {
        if (model[field] == null) errors.push(`L1: missing ${field}`);
    }

    if (!Array.isArray(model.elements)) {
        errors.push('L1: elements must be array');
    } else if (model.elements.length === 0) {
        warnings.push('L1: elements array is empty');
    } else {
        for (let i = 0; i < model.elements.length; i++) {
            const el = model.elements[i];
            if (!el || typeof el !== 'object') {
                errors.push(`L1: element[${i}] is not object`);
                continue;
            }
            for (const f of L1_ELEMENT_REQUIRED) {
                if (el[f] == null) errors.push(`L1: element[${i}] missing ${f}`);
            }
        }
    }

    if (model.metadata && typeof model.metadata === 'object') {
        if (!model.metadata.createdAt) {
            errors.push('L1: metadata.createdAt required');
        }
    }

    return {
        passed: errors.length === 0,
        errors,
        warnings,
    };
}

// ──────────────────────────────────────────────────────────────────────
// L2 checks (requires L1)
// ──────────────────────────────────────────────────────────────────────

export function checkL2(model: Record<string, any>): ConformanceResult {
    const l1 = checkL1(model);
    if (!l1.passed) {
        return {
            passed: false,
            errors: ['L2: L1 must pass first', ...l1.errors],
            warnings: l1.warnings,
        };
    }
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of L2_INTEGRITY_REQUIRED) {
        if (model[field] == null) errors.push(`L2: missing ${field}`);
    }

    if (model.merkleRoot != null) {
        if (typeof model.merkleRoot !== 'string' || !/^[0-9a-f]{64}$/i.test(model.merkleRoot)) {
            errors.push('L2: merkleRoot must be SHA-256 hex (64 chars)');
        }
    }

    if (model.signature != null) {
        if (typeof model.signature !== 'string' || model.signature.length < 32) {
            errors.push('L2: signature too short');
        }
    }

    if (Array.isArray(model.hashChain)) {
        if (model.hashChain.length === 0) warnings.push('L2: hashChain empty');
        for (let i = 0; i < model.hashChain.length; i++) {
            const h = model.hashChain[i];
            if (!h || typeof h !== 'object' || !h.hash || !h.prevHash) {
                errors.push(`L2: hashChain[${i}] missing hash/prevHash`);
            }
        }
    } else if (model.hashChain != null) {
        errors.push('L2: hashChain must be array');
    }

    return {
        passed: errors.length === 0,
        errors,
        warnings,
    };
}

// ──────────────────────────────────────────────────────────────────────
// L3 checks (requires L2)
// ──────────────────────────────────────────────────────────────────────

export function checkL3(model: Record<string, any>): ConformanceResult {
    const l2 = checkL2(model);
    if (!l2.passed) {
        return {
            passed: false,
            errors: ['L3: L2 must pass first', ...l2.errors],
            warnings: l2.warnings,
        };
    }
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of L3_REGULATORY_REQUIRED) {
        if (model[field] == null) errors.push(`L3: missing ${field}`);
    }

    if (Array.isArray(model.thresholds)) {
        if (model.thresholds.length === 0) {
            warnings.push('L3: thresholds array empty');
        }
        const validSources = ['CONAMA', 'CETESB', 'EPA', 'CMA', 'ISO', 'ABNT'];
        for (let i = 0; i < model.thresholds.length; i++) {
            const t = model.thresholds[i];
            if (!t || !t.source) {
                errors.push(`L3: threshold[${i}] missing source`);
                continue;
            }
            if (!validSources.includes(t.source)) {
                warnings.push(`L3: threshold[${i}] source="${t.source}" not in canonical list`);
            }
        }
    }

    if (Array.isArray(model.exports)) {
        const formats = model.exports.map((e: any) => e?.format).filter(Boolean);
        const required = ['GeoJSON', 'IFC', 'ECBT'];
        const missing = required.filter((f) => !formats.includes(f));
        if (missing.length > 0) {
            errors.push(`L3: missing export formats: ${missing.join(', ')}`);
        }
    }

    return {
        passed: errors.length === 0,
        errors,
        warnings,
    };
}

// ──────────────────────────────────────────────────────────────────────
// Aggregate report
// ──────────────────────────────────────────────────────────────────────

/**
 * Roda todos os níveis e retorna badges + report consolidado.
 */
export function runConformanceCheck(model: Record<string, any>): {
    spec: string;
    license: string;
    levels: { L1: ConformanceResult; L2: ConformanceResult; L3: ConformanceResult };
    badges: string[];
    highestLevel: 'L1' | 'L2' | 'L3' | null;
} {
    const l1 = checkL1(model);
    const l2 = checkL2(model);
    const l3 = checkL3(model);

    const badges: string[] = [];
    if (l1.passed) badges.push('L1 ✓');
    else badges.push('L1 ✗');
    if (l2.passed) badges.push('L2 ✓');
    else if (l1.passed) badges.push('L2 🚧');
    else badges.push('L2 ✗');
    if (l3.passed) badges.push('L3 ✓');
    else if (l2.passed) badges.push('L3 🚧');
    else badges.push('L3 ✗');

    let highestLevel: 'L1' | 'L2' | 'L3' | null = null;
    if (l3.passed) highestLevel = 'L3';
    else if (l2.passed) highestLevel = 'L2';
    else if (l1.passed) highestLevel = 'L1';

    return {
        spec: SPEC_VERSION,
        license: SPEC_LICENSE,
        levels: {
            L1: l1,
            L2: l2,
            L3: l3,
        },
        badges,
        highestLevel,
    };
}

export function getRequiredFieldsForLevel(level: 'L1' | 'L2' | 'L3'): Array<string> {
    if (level === 'L1') return [...L1_MODEL_REQUIRED, ...L1_ELEMENT_REQUIRED.map((f) => `element.${f}`)];
    if (level === 'L2') return [...L2_INTEGRITY_REQUIRED];
    if (level === 'L3') return [...L3_REGULATORY_REQUIRED];
    return [];
}
