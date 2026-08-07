// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * ECBT Transform Libraries - Pipeline Templates (Phase 12)
 * Spec: docs/specs/features/SPEC_ECBT_TRANSFORMATION_LIBRARIES.md §S12
 *
 * Phase 12 (2026-05-01) - pure-logic catalog de pipelines starter
 * que usuários podem copiar e personalizar. Cada template é uma
 * receita pré-validada (ex.: "compliance audit basic", "data prep
 * pipeline", "QC standard").
 *
 * Estratégia:
 *   - Templates são frozen objects descrevendo intent + steps recomendados
 *   - Categorias canônicas: ingestion, validation, audit, qc, reporting
 *   - resolveTemplate(id) retorna deep-clone (caller pode editar)
 *   - filterTemplates(criteria) busca por categoria/tag/text
 *   - Templates carregam metadata: difficulty, estimated_time, requires
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Categorias canônicas. */
export const TEMPLATE_CATEGORIES = Object.freeze([
    'ingestion',
    'validation',
    'audit',
    'qc',
    'reporting',
    'transformation',
    'custom',
]);

/** Difficulty levels. */
export const TEMPLATE_DIFFICULTIES = Object.freeze(['beginner', 'intermediate', 'advanced']);

/** Identidade do módulo. */
export const PIPELINE_TEMPLATES_META = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 12,
    deliveredAt: '2026-05-01',
    categories: TEMPLATE_CATEGORIES,
    difficulties: TEMPLATE_DIFFICULTIES,
});

/**
 * Catálogo de templates iniciais (frozen).
 * Cada entry: id, name, category, difficulty, description, tags, steps.
 */
export const BUILTIN_TEMPLATES = Object.freeze([
    Object.freeze({
        id: 'compliance-audit-basic',
        name: 'Compliance Audit (Basic)',
        category: 'audit',
        difficulty: 'beginner',
        description: 'Sequência mínima para auditoria de compliance: validate → tag provenance → record event.',
        tags: Object.freeze(['compliance', 'audit', 'starter']),
        steps: Object.freeze([
            Object.freeze({ libraryId: 'validateBasicSchema' }),
            Object.freeze({ libraryId: 'addProvenanceDefaults', config: Object.freeze({ source: 'human' }) }),
            Object.freeze({ libraryId: 'recordAuditEvent', config: Object.freeze({ eventType: 'compliance_check' }) }),
        ]),
    }),
    Object.freeze({
        id: 'data-prep-standard',
        name: 'Data Preparation (Standard)',
        category: 'ingestion',
        difficulty: 'beginner',
        description: 'Pipeline padrão para preparar dados brutos: deduplicate → sort → normalize.',
        tags: Object.freeze(['ingestion', 'data-prep', 'starter']),
        steps: Object.freeze([
            Object.freeze({ libraryId: 'deduplicateObservations' }),
            Object.freeze({ libraryId: 'sortCampaignsByDate' }),
            Object.freeze({ libraryId: 'normalizeUnits' }),
        ]),
    }),
    Object.freeze({
        id: 'qc-quality-control',
        name: 'Quality Control Pipeline',
        category: 'qc',
        difficulty: 'intermediate',
        description: 'QC completo com flagging de outliers, tag de duplicatas e cálculo de incerteza.',
        tags: Object.freeze(['qc', 'quality', 'uncertainty']),
        steps: Object.freeze([
            Object.freeze({ libraryId: 'flagOutliers', config: Object.freeze({ zScoreThreshold: 3 }) }),
            Object.freeze({ libraryId: 'markDuplicateQA' }),
            Object.freeze({ libraryId: 'computeUncertainty' }),
            Object.freeze({ libraryId: 'addQCTag' }),
        ]),
    }),
    Object.freeze({
        id: 'environmental-validation',
        name: 'Environmental Validation (CONAMA 420)',
        category: 'validation',
        difficulty: 'intermediate',
        description: 'Validação contra thresholds CONAMA 420 + CETESB DD-256 com flagging de exceedances.',
        tags: Object.freeze(['validation', 'CONAMA', 'CETESB', 'environmental']),
        steps: Object.freeze([
            Object.freeze({ libraryId: 'validateBasicSchema' }),
            Object.freeze({ libraryId: 'applyThresholds', config: Object.freeze({ profile: 'CONAMA-420' }) }),
            Object.freeze({ libraryId: 'flagExceedances' }),
            Object.freeze({ libraryId: 'recordAuditEvent', config: Object.freeze({ eventType: 'compliance_check' }) }),
        ]),
    }),
    Object.freeze({
        id: 'reporting-export-bundle',
        name: 'Reporting Export Bundle',
        category: 'reporting',
        difficulty: 'beginner',
        description: 'Bundle padrão para gerar relatórios: aggregate → export csv → export markdown.',
        tags: Object.freeze(['reporting', 'export', 'csv', 'markdown']),
        steps: Object.freeze([
            Object.freeze({ libraryId: 'aggregateByCampaign' }),
            Object.freeze({ libraryId: 'exportToCSV' }),
            Object.freeze({ libraryId: 'exportToMarkdown' }),
        ]),
    }),
]);

/**
 * Resolve um template por id e retorna deep-clone editável.
 *
 * @param {string} id
 * @returns {Object | null}
 */
export function resolveTemplate(id: string): object | null {
    if (typeof id !== 'string' || !id) return null;
    const template = BUILTIN_TEMPLATES.find((t) => t.id === id);
    if (!template) return null;
    return _deepClone(template);
}

/**
 * Lista todos os templates disponíveis (deep-clones).
 *
 * @returns {Array<Object>}
 */
export function listAllTemplates(): Array<object> {
    return BUILTIN_TEMPLATES.map(_deepClone);
}

/**
 * Filtra templates por critérios.
 *
 * @param {Object} [criteria]
 * @param {string} [criteria.category]
 * @param {string} [criteria.difficulty]
 * @param {string} [criteria.tag] - tag exata
 * @param {string} [criteria.search] - substring case-insensitive em name+description
 * @returns {Array<Object>}
 */
export function filterTemplates(criteria: { category?: string; difficulty?: string; tag?: string; search?: string } = {}): Array<object> {
    let results = [...BUILTIN_TEMPLATES];

    if (criteria.category) {
        const cat = String(criteria.category);
        results = results.filter((t) => t.category === cat);
    }
    if (criteria.difficulty) {
        const diff = String(criteria.difficulty);
        results = results.filter((t) => t.difficulty === diff);
    }
    if (criteria.tag) {
        const tag = String(criteria.tag);
        results = results.filter((t) => t.tags.includes(tag));
    }
    if (criteria.search) {
        const q = String(criteria.search).toLowerCase();
        if (q) {
            results = results.filter((t) => {
                return (t.name || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q);
            });
        }
    }

    return results.map(_deepClone);
}

/**
 * Conta templates por categoria.
 *
 * @returns {Map<string, number>}
 */
export function countByCategory(): Map<string, number> {
    const counts = new Map();
    for (const t of BUILTIN_TEMPLATES) {
        counts.set(t.category, (counts.get(t.category) || 0) + 1);
    }
    return counts;
}

/**
 * Lista todas as tags únicas em ordem alfabética.
 *
 * @returns {Array<string>}
 */
export function listAllTags(): Array<string> {
    const tags = new Set();
    for (const t of BUILTIN_TEMPLATES) {
        for (const tag of t.tags) tags.add(tag);
    }
    return [...tags].sort() as Array<string>;
}

/**
 * Valida uma definição custom de template (para CRUD futuro).
 *
 * @param {Record<string, any>} input
 * @returns {{valid: boolean, errors: Array<string>}}
 */
export function validateTemplate(input: Record<string, any>): {valid: boolean, errors: Array<string>} {
    const errors = [];
    if (!input || typeof input !== 'object') {
        return { valid: false, errors: ['input must be object'] };
    }
    if (!input.id || typeof input.id !== 'string') {
        errors.push('id required (string)');
    }
    if (!input.name || typeof input.name !== 'string') {
        errors.push('name required (string)');
    }
    if (!TEMPLATE_CATEGORIES.includes(input.category)) {
        errors.push(`category must be one of: ${TEMPLATE_CATEGORIES.join(', ')}`);
    }
    if (input.difficulty && !TEMPLATE_DIFFICULTIES.includes(input.difficulty)) {
        errors.push(`difficulty must be one of: ${TEMPLATE_DIFFICULTIES.join(', ')}`);
    }
    if (!Array.isArray(input.steps)) {
        errors.push('steps must be array');
    } else {
        input.steps.forEach(( step: any,  i: any) => {
            if (!step || typeof step !== 'object') {
                errors.push(`step ${i} must be object`);
            } else if (!step.libraryId || typeof step.libraryId !== 'string') {
                errors.push(`step ${i} requires libraryId (string)`);
            }
        });
    }
    return { valid: errors.length === 0, errors };
}

// ---------- helpers ----------

/**
 * @param {any} value
 * @returns {any}
 */
function _deepClone(value: any): any {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(_deepClone);
    if (typeof value === 'object') {
        const out: Record<string, any> = {};
        for (const k of Object.keys(value)) {
            out[k] = _deepClone(value[k]);
        }
        return out;
    }
    return value;
}

/**
 * Module identity export.
 */
export const pipelineTemplatesMeta = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 12,
    deliveredAt: '2026-05-01',
    builtinCount: BUILTIN_TEMPLATES.length,
    categories: TEMPLATE_CATEGORIES,
    difficulties: TEMPLATE_DIFFICULTIES,
    exports: [
        'TEMPLATE_CATEGORIES',
        'TEMPLATE_DIFFICULTIES',
        'PIPELINE_TEMPLATES_META',
        'BUILTIN_TEMPLATES',
        'resolveTemplate',
        'listAllTemplates',
        'filterTemplates',
        'countByCategory',
        'listAllTags',
        'validateTemplate',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
