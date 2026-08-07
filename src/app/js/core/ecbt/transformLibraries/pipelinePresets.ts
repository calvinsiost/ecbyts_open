// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Presets - Phase 29 (P1-6)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S29
 *
 * Phase 29 (2026-05-01) - pure-logic curated pipeline preset catalog
 * para domain ambiental. 10 builtin presets cobrindo cenários comuns:
 * EDD ingestion, CETESB GAC, ESG reporting, GHG inventory, etc.
 *
 * Estratégia:
 *   - 10 builtin presets, cada um com category + steps
 *   - 6 categorias: ingestion / validation / analysis / reporting / qc / audit
 *   - Fork preset (clonar com customização)
 *   - Compatibility check (preset funciona em libraries disponíveis)
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface CompatibilityResult {
    compatible: boolean;
    missingLibraries: any;
}

/** Categories canônicas. */
export const PRESET_CATEGORIES = Object.freeze(['ingestion', 'validation', 'analysis', 'reporting', 'qc', 'audit']);

/** Identidade do módulo. */
export const PRESETS_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 29,
    deliveredAt: '2026-05-01',
    categories: PRESET_CATEGORIES,
});

/** Builtin presets — 10 entries cobrindo cenários ambientais. */
export const BUILTIN_PRESETS = Object.freeze([
    Object.freeze({
        id: 'edd-import-cetesb',
        category: 'ingestion',
        name: 'EDD Import (CETESB)',
        description: 'Importa Electronic Data Deliverable em formato CETESB GAC',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'edd-parser', config: { profile: 'cetesb' } }),
            Object.freeze({ libraryId: 'date-normalizer', config: {} }),
            Object.freeze({ libraryId: 'identity-resolver', config: { matrix: 'water' } }),
            Object.freeze({ libraryId: 'unit-converter', config: { target: 'mg/L' } }),
        ]),
        requiredLibraries: ['edd-parser', 'date-normalizer', 'identity-resolver', 'unit-converter'],
    }),
    Object.freeze({
        id: 'conama-validation',
        category: 'validation',
        name: 'CONAMA 420 Validation',
        description: 'Valida observações contra VR/VP/VI CONAMA 420',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'threshold-loader', config: { profile: 'conama_420' } }),
            Object.freeze({ libraryId: 'threshold-comparator', config: {} }),
            Object.freeze({ libraryId: 'severity-classifier', config: {} }),
        ]),
        requiredLibraries: ['threshold-loader', 'threshold-comparator', 'severity-classifier'],
    }),
    Object.freeze({
        id: 'cetesb-vr-vp-vi',
        category: 'validation',
        name: 'CETESB VR/VP/VI',
        description: 'Aplica thresholds CETESB DD-256 (referência/prevenção/intervenção)',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'threshold-loader', config: { profile: 'cetesb_dd256' } }),
            Object.freeze({ libraryId: 'threshold-comparator', config: {} }),
        ]),
        requiredLibraries: ['threshold-loader', 'threshold-comparator'],
    }),
    Object.freeze({
        id: 'plume-delineation',
        category: 'analysis',
        name: 'Plume Delineation',
        description: 'Delineia pluma 3D via Kriging + isossuperfície',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'spatial-aggregator', config: {} }),
            Object.freeze({ libraryId: 'kriging-interpolator', config: { variogram: 'spherical' } }),
            Object.freeze({ libraryId: 'isosurface-builder', config: { threshold: 'VI' } }),
        ]),
        requiredLibraries: ['spatial-aggregator', 'kriging-interpolator', 'isosurface-builder'],
    }),
    Object.freeze({
        id: 'mann-kendall-trend',
        category: 'analysis',
        name: 'Mann-Kendall Trend',
        description: 'Análise de tendência temporal não-paramétrica',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'temporal-aggregator', config: {} }),
            Object.freeze({ libraryId: 'mann-kendall', config: { alpha: 0.05 } }),
            Object.freeze({ libraryId: 'sen-slope', config: {} }),
        ]),
        requiredLibraries: ['temporal-aggregator', 'mann-kendall', 'sen-slope'],
    }),
    Object.freeze({
        id: 'ghg-inventory',
        category: 'reporting',
        name: 'GHG Inventory (Protocol)',
        description: 'Compila inventário GHG conforme GHG Protocol Corporate Standard',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'emission-factor-loader', config: { profile: 'ghg_protocol' } }),
            Object.freeze({ libraryId: 'scope-classifier', config: {} }),
            Object.freeze({ libraryId: 'co2eq-calculator', config: {} }),
            Object.freeze({ libraryId: 'inventory-aggregator', config: {} }),
        ]),
        requiredLibraries: ['emission-factor-loader', 'scope-classifier', 'co2eq-calculator', 'inventory-aggregator'],
    }),
    Object.freeze({
        id: 'esg-issb-report',
        category: 'reporting',
        name: 'ESG ISSB Report',
        description: 'Gera relatório ESG conforme ISSB IFRS S1/S2',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'data-collector', config: {} }),
            Object.freeze({ libraryId: 'kpi-calculator', config: { framework: 'issb' } }),
            Object.freeze({ libraryId: 'narrative-builder', config: {} }),
            Object.freeze({ libraryId: 'pdf-renderer', config: {} }),
        ]),
        requiredLibraries: ['data-collector', 'kpi-calculator', 'narrative-builder', 'pdf-renderer'],
    }),
    Object.freeze({
        id: 'qa-qc-replicates',
        category: 'qc',
        name: 'QA/QC Replicates Check',
        description: 'Valida replicatas e RPD entre amostras gemeas',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'replicate-pairer', config: {} }),
            Object.freeze({ libraryId: 'rpd-calculator', config: { tolerance: 0.2 } }),
            Object.freeze({ libraryId: 'outlier-detector', config: {} }),
        ]),
        requiredLibraries: ['replicate-pairer', 'rpd-calculator', 'outlier-detector'],
    }),
    Object.freeze({
        id: 'audit-trail-export',
        category: 'audit',
        name: 'Audit Trail Export',
        description: 'Exporta audit log com integridade hash-chain',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'audit-collector', config: {} }),
            Object.freeze({ libraryId: 'hash-chainer', config: { algorithm: 'sha256' } }),
            Object.freeze({ libraryId: 'pdf-renderer', config: {} }),
        ]),
        requiredLibraries: ['audit-collector', 'hash-chainer', 'pdf-renderer'],
    }),
    Object.freeze({
        id: 'compliance-scorecard',
        category: 'reporting',
        name: 'Compliance Scorecard',
        description: 'Calcula scorecard multi-dimensional de compliance',
        steps: Object.freeze([
            Object.freeze({ libraryId: 'compliance-loader', config: {} }),
            Object.freeze({ libraryId: 'scorecard-calculator', config: { weights: 'balanced' } }),
            Object.freeze({ libraryId: 'grade-assigner', config: {} }),
        ]),
        requiredLibraries: ['compliance-loader', 'scorecard-calculator', 'grade-assigner'],
    }),
]);

/**
 * Verifica se categoria é canônica.
 */
export function isValidCategory(cat: any): boolean {
    return typeof cat === 'string' && PRESET_CATEGORIES.includes(cat);
}

/**
 * Lookup preset por id.
 *
 * @param id
 * @param presets
 */
export function lookupPreset(id: string, presets: Array<any> = BUILTIN_PRESETS as any): object | null {
    if (typeof id !== 'string' || !id.trim()) return null;
    if (!Array.isArray(presets)) return null;
    return presets.find((p) => p && p.id === id) || null;
}

/**
 * Filtra presets por categoria.
 */
export function filterByCategory(category: any, presets: any = BUILTIN_PRESETS): ReadonlyArray<any> {
    if (!isValidCategory(category)) return [];
    if (!Array.isArray(presets)) return [];
    return Object.freeze(presets.filter((p) => p && p.category === category));
}

/**
 * Verifica se preset é compatível (todas required libraries disponíveis).
 *
 * @param preset
 * @param any>
 */
export function checkCompatibility(
    preset: Record<string, any>,
    availableLibraries: Array<string>,
): Readonly<CompatibilityResult> {
    if (!preset || !Array.isArray(preset.requiredLibraries)) {
        return Object.freeze({ compatible: false, missingLibraries: [] });
    }
    if (!Array.isArray(availableLibraries)) {
        return Object.freeze({
            compatible: false,
            missingLibraries: [...preset.requiredLibraries],
        });
    }
    const missing = preset.requiredLibraries.filter(
        (req: any) => !availableLibraries.includes(req as any),
    );
    return Object.freeze({
        compatible: missing.length === 0,
        missingLibraries: Object.freeze(missing),
    });
}

/**
 * Fork preset (clona com overrides).
 *
 * @param preset
 * @param overrides
 */
export function forkPreset(preset: Record<string, any>, overrides: Record<string, any> = {}): object {
    if (!preset || typeof preset !== 'object') {
        throw new TypeError('forkPreset: preset required');
    }
    const newId = overrides.id || `${preset.id}-fork-${Date.now()}`;
    const newSteps = Array.isArray(overrides.steps)
        ? Object.freeze(overrides.steps.map((s: any) => Object.freeze({ ...s })))
        : Object.freeze((preset.steps || []).map((s: any) => Object.freeze({ ...s })));
    return Object.freeze({
        id: newId,
        category: overrides.category || preset.category,
        name: overrides.name || `${preset.name} (Fork)`,
        description: overrides.description || preset.description,
        steps: newSteps,
        requiredLibraries: Array.isArray(overrides.requiredLibraries)
            ? Object.freeze([...overrides.requiredLibraries])
            : Object.freeze([...(preset.requiredLibraries || [])]),
        forkedFrom: preset.id,
    });
}

/**
 * Cria preset custom.
 */
export function createPreset(spec: any): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createPreset: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createPreset: id required');
    }
    if (!isValidCategory(spec.category)) {
        throw new TypeError(`createPreset: category must be one of ${PRESET_CATEGORIES.join(',')}`);
    }
    return Object.freeze({
        id: spec.id,
        category: spec.category,
        name: spec.name || spec.id,
        description: spec.description || '',
        steps: Array.isArray(spec.steps)
            ? Object.freeze(spec.steps.map((s: any) => Object.freeze({ ...s })))
            : Object.freeze([]),
        requiredLibraries: Array.isArray(spec.requiredLibraries)
            ? Object.freeze([...spec.requiredLibraries])
            : Object.freeze([]),
    });
}

/**
 * Sumariza catálogo de presets.
 */
export function summarizePresets(presets: any = BUILTIN_PRESETS as any): any {
    const empty = { total: 0, byCategory: {}, totalSteps: 0, avgStepsPerPreset: 0 };
    if (!Array.isArray(presets) || presets.length === 0) return empty;
    const byCategory: Record<string, number> = {};
    let totalSteps = 0;
    for (const p of presets) {
        if (!p) continue;
        if (p.category) byCategory[p.category] = (byCategory[p.category] || 0) + 1;
        if (Array.isArray(p.steps)) totalSteps += p.steps.length;
    }
    return Object.freeze({
        total: presets.length,
        byCategory,
        totalSteps,
        avgStepsPerPreset: totalSteps / presets.length,
    });
}

/**
 * Module identity export.
 */
export const pipelinePresetsMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 29,
    deliveredAt: '2026-05-01',
    categories: PRESET_CATEGORIES,
    builtinCount: BUILTIN_PRESETS.length,
    exports: [
        'PRESET_CATEGORIES',
        'PRESETS_META',
        'BUILTIN_PRESETS',
        'isValidCategory',
        'lookupPreset',
        'filterByCategory',
        'checkCompatibility',
        'forkPreset',
        'createPreset',
        'summarizePresets',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
