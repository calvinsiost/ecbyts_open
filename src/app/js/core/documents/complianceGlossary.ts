// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Compliance Glossary - Phase 22 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S25
 *
 * Phase 22 (2026-05-01) - pure-logic dicionário terminológico para
 * compliance ambiental. Mapeia termos canônicos para sinônimos +
 * traduções (PT/EN/ES) + referências (CONAMA/CETESB/ABNT/ISO).
 *
 * Estratégia:
 *   - 12 builtin glossary entries (VR/VP/VI/CMA/RAR/SDD/etc)
 *   - resolveTerm: sinônimo → canônico
 *   - lookupGlossary: canônico → entry completa
 *   - findRelated: relações entre termos
 *   - searchGlossary: full-text PT/EN/ES
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Term categories canônicas. */
export const TERM_CATEGORIES = Object.freeze([
    'thresholds',
    'matrices',
    'procedures',
    'documents',
    'agencies',
    'parameters',
]);

/** Identidade do módulo. */
export const GLOSSARY_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 22,
    deliveredAt: '2026-05-01',
    categories: TERM_CATEGORIES,
});

/** Builtin glossary — 12 entries de domain ambiental. */
export const BUILTIN_GLOSSARY = Object.freeze([
    Object.freeze({
        canonical: 'VR',
        category: 'thresholds',
        labels: { 'pt-BR': 'Valor de Referência', 'en-US': 'Reference Value', 'es-LA': 'Valor de Referencia' },
        synonyms: ['valor de referencia', 'background value', 'natural background'],
        source: 'CETESB DD-256/2016',
        related: ['VP', 'VI'],
    }),
    Object.freeze({
        canonical: 'VP',
        category: 'thresholds',
        labels: { 'pt-BR': 'Valor de Prevenção', 'en-US': 'Prevention Value', 'es-LA': 'Valor de Prevención' },
        synonyms: ['valor de prevencao', 'prevention threshold', 'umbral de prevencion'],
        source: 'CONAMA 420 Anexo II',
        related: ['VR', 'VI'],
    }),
    Object.freeze({
        canonical: 'VI',
        category: 'thresholds',
        labels: { 'pt-BR': 'Valor de Intervenção', 'en-US': 'Intervention Value', 'es-LA': 'Valor de Intervención' },
        synonyms: ['valor de intervencao', 'intervention threshold', 'umbral de intervencion'],
        source: 'CONAMA 420 Anexo II',
        related: ['VR', 'VP', 'CMA'],
    }),
    Object.freeze({
        canonical: 'CMA',
        category: 'thresholds',
        labels: {
            'pt-BR': 'Concentração Máxima Aceitável',
            'en-US': 'Maximum Acceptable Concentration',
            'es-LA': 'Concentración Máxima Aceptable',
        },
        synonyms: ['concentracao maxima aceitavel', 'site-specific risk-based threshold', 'CMAR'],
        source: 'CETESB site-specific',
        related: ['VI'],
    }),
    Object.freeze({
        canonical: 'GAC',
        category: 'procedures',
        labels: {
            'pt-BR': 'Gerenciamento de Áreas Contaminadas',
            'en-US': 'Contaminated Sites Management',
            'es-LA': 'Gestión de Áreas Contaminadas',
        },
        synonyms: ['gerenciamento de areas contaminadas', 'contaminated land management'],
        source: 'CETESB DD-038/2017',
        related: ['RAR', 'SDD'],
    }),
    Object.freeze({
        canonical: 'RAR',
        category: 'documents',
        labels: {
            'pt-BR': 'Relatório de Avaliação de Risco',
            'en-US': 'Risk Assessment Report',
            'es-LA': 'Reporte de Evaluación de Riesgo',
        },
        synonyms: ['relatorio avaliacao risco', 'risk assessment'],
        source: 'CETESB GAC',
        related: ['GAC', 'SDD'],
    }),
    Object.freeze({
        canonical: 'SDD',
        category: 'procedures',
        labels: {
            'pt-BR': 'Sistema de Detecção e Diagnóstico',
            'en-US': 'Detection & Diagnostic System',
            'es-LA': 'Sistema Detección y Diagnóstico',
        },
        synonyms: ['sistema deteccao diagnostico'],
        source: 'CETESB GAC',
        related: ['GAC', 'RAR'],
    }),
    Object.freeze({
        canonical: 'CONAMA',
        category: 'agencies',
        labels: {
            'pt-BR': 'Conselho Nacional do Meio Ambiente',
            'en-US': 'National Environment Council (Brazil)',
            'es-LA': 'Consejo Nacional del Medio Ambiente',
        },
        synonyms: ['conselho nacional meio ambiente'],
        source: 'Lei 6938/1981',
        related: ['IBAMA', 'CETESB'],
    }),
    Object.freeze({
        canonical: 'CETESB',
        category: 'agencies',
        labels: {
            'pt-BR': 'Companhia Ambiental do Estado de São Paulo',
            'en-US': 'São Paulo Environmental Agency',
            'es-LA': 'Compañía Ambiental de São Paulo',
        },
        synonyms: ['companhia ambiental sao paulo'],
        source: 'Lei 13542/2009',
        related: ['CONAMA'],
    }),
    Object.freeze({
        canonical: 'IBAMA',
        category: 'agencies',
        labels: {
            'pt-BR': 'Instituto Brasileiro do Meio Ambiente',
            'en-US': 'Brazilian Environment Institute',
            'es-LA': 'Instituto Brasileño del Medio Ambiente',
        },
        synonyms: ['instituto brasileiro meio ambiente'],
        source: 'Lei 7735/1989',
        related: ['CONAMA'],
    }),
    Object.freeze({
        canonical: 'plume',
        category: 'matrices',
        labels: { 'pt-BR': 'Pluma de Contaminação', 'en-US': 'Contamination Plume', 'es-LA': 'Pluma de Contaminación' },
        synonyms: ['pluma contaminacao', 'contaminant plume'],
        source: 'PDPL-U domain',
        related: ['well'],
    }),
    Object.freeze({
        canonical: 'monitoring_well',
        category: 'matrices',
        labels: { 'pt-BR': 'Poço de Monitoramento', 'en-US': 'Monitoring Well', 'es-LA': 'Pozo de Monitoreo' },
        synonyms: ['poco monitoramento', 'observation well'],
        source: 'ABNT NBR 13895',
        related: ['plume'],
    }),
]);

/**
 * Verifica se categoria é canônica.
 */
export function isValidCategory(cat: any): boolean {
    return typeof cat === 'string' && TERM_CATEGORIES.includes(cat);
}

/**
 * Normaliza string para match (lowercase + remove diacríticos).
 */
export function normalize(s: any): string {
    if (typeof s !== 'string') return '';
    return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

/**
 * Resolve sinônimo ou termo canônico para canonical key.
 */
export function resolveTerm(term: string, glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY): string | null {
    if (typeof term !== 'string' || !term.trim()) return null;
    if (!Array.isArray(glossary)) return null;
    const norm = normalize(term);
    for (const entry of glossary) {
        if (!entry) continue;
        if (normalize(entry.canonical) === norm) return entry.canonical;
        if (Array.isArray(entry.synonyms)) {
            for (const syn of entry.synonyms) {
                if (normalize(syn) === norm) return entry.canonical;
            }
        }
    }
    return null;
}

/**
 * Busca glossary entry por canonical.
 */
export function lookupGlossary(canonical: string, glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY): any | null {
    if (typeof canonical !== 'string' || !canonical.trim()) return null;
    if (!Array.isArray(glossary)) return null;
    return glossary.find((e: any) => e && e.canonical === canonical) || null;
}

/**
 * Encontra termos relacionados.
 */
export function findRelated(canonical: string, glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY): ReadonlyArray<any> {
    const entry = lookupGlossary(canonical, glossary);
    if (!entry || !Array.isArray(entry.related)) return [];
    const out: any[] = [];
    for (const rel of entry.related) {
        const r = lookupGlossary(rel, glossary);
        if (r) out.push(r);
    }
    return Object.freeze(out);
}

/**
 * Filtra glossary por categoria.
 */
export function filterByCategory(category: any, glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY): ReadonlyArray<any> {
    if (!isValidCategory(category)) return [];
    if (!Array.isArray(glossary)) return [];
    return Object.freeze(glossary.filter((e: any) => e && e.category === category));
}

/**
 * Busca full-text em labels + synonyms.
 */
export function searchGlossary(
    query: string,
    options: { locale?: string } = {},
    glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY,
): ReadonlyArray<any> {
    if (typeof query !== 'string' || !query.trim()) return [];
    if (!Array.isArray(glossary)) return [];
    const norm = normalize(query);
    const out: any[] = [];
    for (const entry of glossary) {
        if (!entry) continue;
        if (normalize(entry.canonical).includes(norm)) {
            out.push(entry);
            continue;
        }
        if (entry.labels) {
            const labels = options.locale ? [entry.labels[options.locale] || ''] : Object.values(entry.labels);
            if (labels.some((l: any) => normalize(l).includes(norm))) {
                out.push(entry);
                continue;
            }
        }
        if (
            Array.isArray(entry.synonyms) &&
            entry.synonyms.some((s: any) => normalize(s as any).includes(norm))
        ) {
            out.push(entry);
        }
    }
    return Object.freeze(out);
}

/**
 * Obtém label localizado.
 */
export function getLabel(canonical: string, locale: string, glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY): string | null {
    const entry = lookupGlossary(canonical, glossary);
    if (!entry || !entry.labels) return null;
    return entry.labels[locale] || entry.labels['en-US'] || entry.canonical;
}

/**
 * Cria glossary entry custom.
 */
export function createEntry(spec: any): any {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createEntry: spec required');
    }
    if (typeof spec.canonical !== 'string' || !spec.canonical.trim()) {
        throw new TypeError('createEntry: canonical required');
    }
    if (!isValidCategory(spec.category)) {
        throw new TypeError(`createEntry: category must be one of ${TERM_CATEGORIES.join(',')}`);
    }
    return Object.freeze({
        canonical: spec.canonical,
        category: spec.category,
        labels: spec.labels ? Object.freeze({ ...spec.labels }) : Object.freeze({}),
        synonyms: Array.isArray(spec.synonyms) ? Object.freeze([...spec.synonyms]) : Object.freeze([]),
        source: spec.source || null,
        related: Array.isArray(spec.related) ? Object.freeze([...spec.related]) : Object.freeze([]),
    });
}

/**
 * Sumariza glossary.
 */
export function summarizeGlossary(glossary: ReadonlyArray<any> = BUILTIN_GLOSSARY): any {
    const empty = { total: 0, byCategory: {}, withRelated: 0, totalSynonyms: 0 };
    if (!Array.isArray(glossary) || glossary.length === 0) return empty;
    const byCategory: Record<string, number> = {};
    let withRelated = 0;
    let totalSynonyms = 0;
    for (const e of glossary) {
        if (!e) continue;
        if (e.category) byCategory[e.category] = (byCategory[e.category] || 0) + 1;
        if (Array.isArray(e.related) && e.related.length > 0) withRelated++;
        if (Array.isArray(e.synonyms)) totalSynonyms += e.synonyms.length;
    }
    return Object.freeze({
        total: glossary.length,
        byCategory,
        withRelated,
        totalSynonyms,
    });
}

/**
 * Module identity export.
 */
export const complianceGlossaryMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 22,
    deliveredAt: '2026-05-01',
    categories: TERM_CATEGORIES,
    builtinCount: BUILTIN_GLOSSARY.length,
    exports: [
        'TERM_CATEGORIES',
        'GLOSSARY_META',
        'BUILTIN_GLOSSARY',
        'isValidCategory',
        'normalize',
        'resolveTerm',
        'lookupGlossary',
        'findRelated',
        'filterByCategory',
        'searchGlossary',
        'getLabel',
        'createEntry',
        'summarizeGlossary',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
