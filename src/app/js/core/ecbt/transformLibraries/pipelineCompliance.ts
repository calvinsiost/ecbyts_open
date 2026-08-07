// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Compliance Mapping (Phase 24)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S24
 *
 * Phase 24 (2026-05-01) - pure-logic catálogo mapeando pipeline patterns
 * para regulatórios (LGPD, CONAMA, ISSB, GHG Protocol). Permite verificar
 * se pipeline atende requirements de uma framework antes de execução.
 *
 * Estratégia:
 *   - Frameworks frozen catalog: rules + required pipeline patterns
 *   - mapToFramework: pipeline + framework → coverage report
 *   - findGaps: requirements não cobertos
 *   - generateAttestation: report formal de compliance
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Frameworks canônicos. */
export const FRAMEWORKS = Object.freeze(['LGPD', 'CONAMA', 'ISSB', 'GHG_PROTOCOL', 'ISO_14001', 'GDPR']);

/** Coverage levels. */
export const COVERAGE_LEVELS = Object.freeze(['none', 'partial', 'full']);

/** Built-in framework requirements. */
export const FRAMEWORK_REQUIREMENTS = Object.freeze({
    LGPD: Object.freeze({
        framework: 'LGPD',
        legalBasis: 'Lei 13.709/2018',
        requirements: Object.freeze([
            { id: 'data-minimization', requiredLibraries: ['validate', 'transform'] },
            { id: 'audit-trail', requiredLibraries: ['compliance-check'] },
            { id: 'consent-tracking', requiredLibraries: ['validate'] },
            { id: 'right-to-erasure', requiredLibraries: ['transform'] },
        ]),
    }),
    CONAMA: Object.freeze({
        framework: 'CONAMA',
        legalBasis: 'CONAMA 420/2009',
        requirements: Object.freeze([
            { id: 'threshold-validation', requiredLibraries: ['validate', 'compliance-check'] },
            { id: 'sample-traceability', requiredLibraries: ['transform'] },
            { id: 'reporting', requiredLibraries: ['export'] },
        ]),
    }),
    ISSB: Object.freeze({
        framework: 'ISSB',
        legalBasis: 'IFRS S1/S2',
        requirements: Object.freeze([
            { id: 'governance-disclosure', requiredLibraries: ['compliance-check'] },
            { id: 'risk-mgmt-disclosure', requiredLibraries: ['compliance-check', 'aggregate'] },
            { id: 'metrics-targets', requiredLibraries: ['aggregate', 'export'] },
            { id: 'verification', requiredLibraries: ['validate'] },
        ]),
    }),
    GHG_PROTOCOL: Object.freeze({
        framework: 'GHG_PROTOCOL',
        legalBasis: 'GHG Protocol Corporate Standard',
        requirements: Object.freeze([
            { id: 'organizational-boundary', requiredLibraries: ['validate'] },
            { id: 'scope-classification', requiredLibraries: ['transform'] },
            { id: 'emission-aggregation', requiredLibraries: ['aggregate'] },
            { id: 'methodology-disclosure', requiredLibraries: ['export'] },
        ]),
    }),
    ISO_14001: Object.freeze({
        framework: 'ISO_14001',
        legalBasis: 'ISO 14001:2015',
        requirements: Object.freeze([
            { id: 'environmental-policy', requiredLibraries: ['compliance-check'] },
            { id: 'objectives-targets', requiredLibraries: ['validate', 'aggregate'] },
            { id: 'audit', requiredLibraries: ['compliance-check'] },
        ]),
    }),
    GDPR: Object.freeze({
        framework: 'GDPR',
        legalBasis: 'EU 2016/679',
        requirements: Object.freeze([
            { id: 'lawful-basis', requiredLibraries: ['validate'] },
            { id: 'data-portability', requiredLibraries: ['export'] },
            { id: 'breach-notification', requiredLibraries: ['compliance-check'] },
        ]),
    }),
});

/** Identidade do módulo. */
export const COMPLIANCE_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 24,
    deliveredAt: '2026-05-01',
    frameworks: FRAMEWORKS,
    coverageLevels: COVERAGE_LEVELS,
});

/**
 * Verifica se framework é canônico.
 */
export function isValidFramework(framework: any): boolean {
    return typeof framework === 'string' && (FRAMEWORKS as readonly string[]).includes(framework);
}

/**
 * Resolve framework requirements.
 *
 * @param {string} framework
 * @returns {Object|null}
 */
export function resolveFramework(framework: string): object | null {
    const reqs = FRAMEWORK_REQUIREMENTS as Record<string, any>;
    return reqs[framework] || null;
}

/**
 * Mapeia pipeline contra framework requirements.
 *
 * @param {Array<any>} pipeline
 * @param {string} framework
 * @returns {Readonly<{framework: string, coverage: string, requirements: ReadonlyArray<{id: string, met: boolean, missing: ReadonlyArray<string>}>, coverageRatio?: number, legalBasis?: string, metCount?: number, totalRequirements?: number}>}
 */
export function mapToFramework(
    pipeline: any[],
    framework: string,
): Readonly<{
    framework: string;
    coverage: string;
    requirements: ReadonlyArray<{ id: string; met: boolean; missing: ReadonlyArray<string> }>;
    coverageRatio?: number;
    legalBasis?: string;
    metCount?: number;
    totalRequirements?: number;
}> {
    const empty = {
        framework,
        coverage: 'none',
        requirements: [],
        coverageRatio: 0,
    };
    if (!Array.isArray(pipeline) || !isValidFramework(framework)) {
        return Object.freeze(empty);
    }
    const fw = resolveFramework(framework) as any;
    if (!fw) return Object.freeze(empty);

    const presentLibs = new Set<string>();
    for (const step of pipeline) {
        if (step && typeof step.libraryId === 'string') {
            presentLibs.add(step.libraryId);
        }
    }

    let metCount = 0;
    const reqResults: any[] = [];
    for (const req of fw.requirements) {
        if (!req || !Array.isArray(req.requiredLibraries)) continue;
        const missing = req.requiredLibraries.filter((lib: any) => !presentLibs.has(lib as any));
        const met = missing.length === 0;
        if (met) metCount++;
        reqResults.push(
            Object.freeze({
                id: req.id,
                met,
                missing: Object.freeze(missing),
                requiredLibraries: req.requiredLibraries,
            }),
        );
    }

    const total = fw.requirements.length;
    const coverageRatio = total > 0 ? metCount / total : 0;
    let coverage = 'none';
    if (coverageRatio >= 1) coverage = 'full';
    else if (coverageRatio > 0) coverage = 'partial';

    return Object.freeze({
        framework,
        legalBasis: fw.legalBasis,
        coverage,
        coverageRatio,
        requirements: Object.freeze(reqResults),
        metCount,
        totalRequirements: total,
    });
}

/**
 * Lista requirements não cobertos.
 *
 * @param {Record<string, any>} mapping - output de mapToFramework
 * @returns {Array<{id: string, missing: ReadonlyArray<string>}>}
 */
export function findGaps(
    mapping: Record<string, any>,
): Array<{ id: string; missing: ReadonlyArray<string> }> {
    if (!mapping || !Array.isArray(mapping.requirements)) return [];
    return mapping.requirements
        .filter((r: any) => r && !r.met)
        .map((r: any) => Object.freeze({ id: r.id, missing: r.missing }));
}

/**
 * Mapeia pipeline contra TODOS os frameworks aplicáveis.
 *
 * @param {Array<any>} pipeline
 * @param {Array<string>} [targetFrameworks]
 * @returns {Record<string, any>}
 */
export function mapToAllFrameworks(
    pipeline: any[],
    targetFrameworks?: string[],
): Record<string, any> {
    const targets =
        Array.isArray(targetFrameworks) && targetFrameworks.length > 0
            ? targetFrameworks.filter(isValidFramework)
            : [...FRAMEWORKS];
    const out: Record<string, any> = {};
    for (const fw of targets) {
        out[fw] = mapToFramework(pipeline, fw);
    }
    return Object.freeze(out);
}

/**
 * Gera attestation report (markdown).
 *
 * @param {Record<string, any>} mapping
 * @returns {string}
 */
export function generateAttestation(mapping: Record<string, any>): string {
    if (!mapping || !mapping.framework) return '(no mapping)';
    const lines = [];
    lines.push(`# Compliance Attestation: ${mapping.framework}`);
    if (mapping.legalBasis) {
        lines.push(`> **Legal basis:** ${mapping.legalBasis}`);
    }
    lines.push('');
    lines.push(`**Coverage:** ${mapping.coverage} (${(mapping.coverageRatio * 100).toFixed(0)}%)`);
    lines.push(`**Requirements met:** ${mapping.metCount}/${mapping.totalRequirements}`);
    lines.push('');
    lines.push('## Requirements');
    for (const req of mapping.requirements || []) {
        if (!req) continue;
        const icon = req.met ? '[OK]' : '[X]';
        lines.push(`- ${icon} ${req.id}`);
        if (!req.met && req.missing.length > 0) {
            lines.push(`    - Missing libraries: ${req.missing.join(', ')}`);
        }
    }
    return lines.join('\n');
}

/**
 * Sumariza all-frameworks mapping.
 */
export function summarizeAllFrameworks(allMappings: any): Readonly<{
    total: number;
    fullCoverage: number;
    partial: number;
    none: number;
    byFramework: Record<string, any>;
}> {
    const empty = { total: 0, fullCoverage: 0, partial: 0, none: 0, byFramework: {} };
    if (!allMappings || typeof allMappings !== 'object') return empty;
    let fullCoverage = 0;
    let partial = 0;
    let none = 0;
    const byFramework: Record<string, any> = {};
    for (const [fw, mapping] of Object.entries(allMappings as Record<string, any>)) {
        if (!mapping) continue;
        byFramework[fw] = mapping.coverage;
        if (mapping.coverage === 'full') fullCoverage++;
        else if (mapping.coverage === 'partial') partial++;
        else none++;
    }
    return Object.freeze({
        total: Object.keys(allMappings).length,
        fullCoverage,
        partial,
        none,
        byFramework,
    });
}

/**
 * Module identity export.
 */
export const pipelineComplianceMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 24,
    deliveredAt: '2026-05-01',
    frameworks: FRAMEWORKS,
    builtinFrameworksCount: Object.keys(FRAMEWORK_REQUIREMENTS).length,
    exports: [
        'FRAMEWORKS',
        'COVERAGE_LEVELS',
        'FRAMEWORK_REQUIREMENTS',
        'COMPLIANCE_META',
        'isValidFramework',
        'resolveFramework',
        'mapToFramework',
        'findGaps',
        'mapToAllFrameworks',
        'generateAttestation',
        'summarizeAllFrameworks',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
