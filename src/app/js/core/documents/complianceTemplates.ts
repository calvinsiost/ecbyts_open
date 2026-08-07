// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Templates - Phase 17 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S20
 *
 * Phase 17 (2026-05-01) - pure-logic catálogo de templates de
 * documentos de compliance ambiental: laudo CONAMA, inventário GHG,
 * relatório EIS/RIMA, plano de remediação, etc.
 *
 * Estratégia:
 *   - Templates frozen com structure (sections + required fields)
 *   - Renderizador: template + data → markdown skeleton
 *   - Validator: check required sections preenchidas
 *   - Catalog: 6 builtin templates
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface TemplateValidationResult {
    valid: boolean;
    missingSections: ReadonlyArray<any>;
}

/** Template categories canônicas. */
export const TEMPLATE_CATEGORIES = Object.freeze([
    'environmental',
    'ghg',
    'audit',
    'remediation',
    'governance',
    'regulatory',
]);

/** Built-in templates. */
export const BUILTIN_TEMPLATES = Object.freeze({
    'laudo-conama-420': Object.freeze({
        id: 'laudo-conama-420',
        name: 'Laudo CONAMA 420/2009',
        category: 'regulatory',
        legalBasis: 'CONAMA 420/2009',
        sections: Object.freeze([
            'identificacao_area',
            'caracterizacao_ambiental',
            'avaliacao_preliminar',
            'investigacao_confirmatoria',
            'investigacao_detalhada',
            'avaliacao_risco',
            'medidas_controle',
            'monitoramento',
            'conclusao',
            'referencias',
        ]),
        requiredSections: Object.freeze(['identificacao_area', 'caracterizacao_ambiental', 'conclusao']),
    }),
    'eis-rima': Object.freeze({
        id: 'eis-rima',
        name: 'EIS/RIMA',
        category: 'environmental',
        legalBasis: 'CONAMA 1/1986',
        sections: Object.freeze([
            'sumario_executivo',
            'caracterizacao_empreendimento',
            'diagnostico_ambiental',
            'analise_impactos',
            'medidas_mitigadoras',
            'programa_monitoramento',
            'conclusao',
        ]),
        requiredSections: Object.freeze(['sumario_executivo', 'diagnostico_ambiental', 'analise_impactos']),
    }),
    'inventario-ghg': Object.freeze({
        id: 'inventario-ghg',
        name: 'Inventário GHG (GHG Protocol)',
        category: 'ghg',
        legalBasis: 'GHG Protocol Corporate Standard',
        sections: Object.freeze([
            'organizational_boundary',
            'operational_boundary',
            'base_year',
            'scope1_emissions',
            'scope2_emissions',
            'scope3_emissions',
            'methodology',
            'verification',
            'targets_reductions',
        ]),
        requiredSections: Object.freeze([
            'organizational_boundary',
            'scope1_emissions',
            'scope2_emissions',
            'methodology',
        ]),
    }),
    'plano-remediacao': Object.freeze({
        id: 'plano-remediacao',
        name: 'Plano de Remediação',
        category: 'remediation',
        legalBasis: 'CETESB DD 263/2009',
        sections: Object.freeze([
            'objetivo_metas',
            'tecnologia_proposta',
            'cronograma',
            'monitoramento_remedial',
            'criterios_encerramento',
            'orcamento',
        ]),
        requiredSections: Object.freeze(['objetivo_metas', 'tecnologia_proposta', 'cronograma']),
    }),
    'audit-iso14001': Object.freeze({
        id: 'audit-iso14001',
        name: 'Auditoria ISO 14001',
        category: 'audit',
        legalBasis: 'ISO 14001:2015',
        sections: Object.freeze([
            'escopo_auditoria',
            'criterios',
            'evidencias',
            'nao_conformidades',
            'oportunidades',
            'conclusao',
            'plano_acao',
        ]),
        requiredSections: Object.freeze(['escopo_auditoria', 'criterios', 'conclusao']),
    }),
    'governanca-esg': Object.freeze({
        id: 'governanca-esg',
        name: 'Relatório de Governança ESG',
        category: 'governance',
        legalBasis: 'ISSB IFRS S1/S2',
        sections: Object.freeze([
            'governance_structure',
            'strategy',
            'risk_management',
            'metrics_targets',
            'stakeholder_engagement',
            'materiality_assessment',
        ]),
        requiredSections: Object.freeze(['governance_structure', 'strategy', 'risk_management', 'metrics_targets']),
    }),
});

/** Identidade do módulo. */
export const TEMPLATES_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 17,
    deliveredAt: '2026-05-01',
    categories: TEMPLATE_CATEGORIES,
    builtinCount: Object.keys(BUILTIN_TEMPLATES).length,
});

/**
 * Verifica se category é canônica.
 */
export function isValidCategory(category: any): boolean {
    return typeof category === 'string' && TEMPLATE_CATEGORIES.includes(category);
}

/**
 * Resolve template por id.
 *
 * @param id
 */
export function resolveTemplate(id: string): object | null {
    return ((BUILTIN_TEMPLATES as Record<string, any>)[id] || null) as Record<string, any> | null;
}

/**
 * Lista templates por categoria.
 *
 * @param category
 */
export function listByCategory(category: string): Array<object> {
    if (!isValidCategory(category)) return [];
    return Object.values(BUILTIN_TEMPLATES).filter((t) => t.category === category);
}

/**
 * Cria custom template frozen.
 *
 * @param spec
 */
export function createTemplate(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createTemplate: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createTemplate: id required');
    }
    if (typeof spec.name !== 'string' || !spec.name.trim()) {
        throw new TypeError('createTemplate: name required');
    }
    if (!isValidCategory(spec.category)) {
        throw new TypeError('createTemplate: invalid category');
    }
    const sections = Array.isArray(spec.sections)
        ? spec.sections.filter((s: any) => typeof s === 'string' && s.trim())
        : [];
    if (sections.length === 0) {
        throw new TypeError('createTemplate: at least one section required');
    }
    const required = Array.isArray(spec.requiredSections)
        ? spec.requiredSections.filter((s: any) => sections.includes(s as any))
        : [];
    return Object.freeze({
        id: spec.id,
        name: spec.name,
        category: spec.category,
        legalBasis: spec.legalBasis || '',
        sections: Object.freeze(sections),
        requiredSections: Object.freeze(required),
    });
}

/**
 * Renderiza template + data em markdown.
 *
 * @param template
 * @param data - { sectionId: content }
 */
export function renderTemplate(template: Record<string, any>, data: Record<string, any> = {}): string {
    if (!template || !Array.isArray(template.sections)) return '';
    const lines = [];
    lines.push(`# ${template.name || ''}`);
    if (template.legalBasis) {
        lines.push(`> **Base legal:** ${template.legalBasis}`);
    }
    lines.push('');
    for (const sectionId of template.sections) {
        const title = sectionId.replace(/_/g, ' ').replace(/\b\w/g, (c: any) => c.toUpperCase());
        lines.push(`## ${title}`);
        const content = data && typeof data === 'object' ? data[sectionId] : null;
        lines.push(content || '*(em branco)*');
        lines.push('');
    }
    return lines.join('\n');
}

/**
 * Valida data preenche todas as required sections.
 *
 * @param template
 * @param any>
 */
export function validateTemplateData(
    template: Record<string, any>,
    data: Record<string, any>,
): Readonly<TemplateValidationResult> {
    if (!template || !Array.isArray(template.requiredSections)) {
        return Object.freeze({ valid: true, missingSections: [] });
    }
    const dataObj = data && typeof data === 'object' ? data : {};
    const missing = template.requiredSections.filter(
        (sectionId: any) => !dataObj[sectionId] || String(dataObj[sectionId]).trim() === '',
    );
    return Object.freeze({
        valid: missing.length === 0,
        missingSections: Object.freeze(missing),
    });
}

/**
 * Sumariza catálogo.
 */
export function summarizeCatalog(): object {
    const byCategory: Record<string, number> = {};
    for (const t of Object.values(BUILTIN_TEMPLATES)) {
        if (!t) continue;
        if (t.category) byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }
    return Object.freeze({
        total: Object.keys(BUILTIN_TEMPLATES).length,
        byCategory,
    });
}

/**
 * Module identity export.
 */
export const complianceTemplatesMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 17,
    deliveredAt: '2026-05-01',
    categories: TEMPLATE_CATEGORIES,
    builtinCount: Object.keys(BUILTIN_TEMPLATES).length,
    exports: [
        'TEMPLATE_CATEGORIES',
        'BUILTIN_TEMPLATES',
        'TEMPLATES_META',
        'isValidCategory',
        'resolveTemplate',
        'listByCategory',
        'createTemplate',
        'renderTemplate',
        'validateTemplateData',
        'summarizeCatalog',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
