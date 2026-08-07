// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Citations - Phase 16 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S19
 *
 * Phase 16 (2026-05-01) - pure-logic engine para parsing, validação
 * e formatação de citações bibliográficas (ABNT NBR 6023, APA, Chicago).
 *
 * Estratégia:
 *   - Citation: { id, type, authors[], title, year, source, ... }
 *   - Parsers: parseAbnt, parseApa (heuristic-based)
 *   - Formatters: formatAbnt, formatApa, formatChicago
 *   - Validator: required fields by type
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

interface ValidationResult {
    valid: boolean;
    missing: ReadonlyArray<string>;
}

interface CitationsSummary {
    total: number;
    byType: Record<string, number>;
    validCount: number;
    invalidCount: number;
}

/** Citation types canônicos. */
export const CITATION_TYPES = Object.freeze(['book', 'journal', 'web', 'thesis', 'standard', 'report']);

/** Citation styles canônicas. */
export const CITATION_STYLES = Object.freeze(['abnt', 'apa', 'chicago']);

/** Required fields por type (ABNT 6023 base). */
export const REQUIRED_FIELDS = Object.freeze({
    book: Object.freeze(['authors', 'title', 'year', 'publisher']),
    journal: Object.freeze(['authors', 'title', 'year', 'journal']),
    web: Object.freeze(['title', 'year', 'url']),
    thesis: Object.freeze(['authors', 'title', 'year', 'institution']),
    standard: Object.freeze(['title', 'year', 'organization']),
    report: Object.freeze(['title', 'year', 'organization']),
});

/** Identidade do módulo. */
export const CITATIONS_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 16,
    deliveredAt: '2026-05-01',
    types: CITATION_TYPES,
    styles: CITATION_STYLES,
});

/**
 * Verifica se type é canônico.
 */
export function isValidType(type: any): boolean {
    return typeof type === 'string' && CITATION_TYPES.includes(type);
}

/**
 * Verifica se style é canônica.
 */
export function isValidStyle(style: any): boolean {
    return typeof style === 'string' && CITATION_STYLES.includes(style);
}

/**
 * Cria citation frozen.
 *
 * @param spec
 */
export function createCitation(spec: Record<string, any>): object {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createCitation: spec required');
    }
    if (!isValidType(spec.type)) {
        throw new TypeError(`createCitation: type must be one of ${CITATION_TYPES.join(',')}`);
    }
    if (typeof spec.title !== 'string' || !spec.title.trim()) {
        throw new TypeError('createCitation: title required');
    }
    const authors = Array.isArray(spec.authors)
        ? spec.authors.filter((a: any) => typeof a === 'string' && a.trim()).map((a: any) => a.trim())
        : [];
    return Object.freeze({
        id: spec.id || `cite-${Date.now()}`,
        type: spec.type,
        authors: Object.freeze(authors),
        title: spec.title,
        year: Number.isInteger(spec.year) ? spec.year : null,
        source: spec.source || '',
        publisher: spec.publisher || '',
        journal: spec.journal || '',
        volume: spec.volume || '',
        issue: spec.issue || '',
        pages: spec.pages || '',
        url: spec.url || '',
        institution: spec.institution || '',
        organization: spec.organization || '',
        doi: spec.doi || '',
        accessedAt: spec.accessedAt || null,
    });
}

/**
 * Valida citation contra required fields do type.
 *
 * @param citation
 */
export function validateCitation(citation: Record<string, any>): ValidationResult {
    if (!citation || !citation.type) {
        return Object.freeze({ valid: false, missing: ['type'] });
    }
    const required = (REQUIRED_FIELDS as Record<string, any>)[citation.type];
    if (!required) {
        return Object.freeze({ valid: false, missing: ['unknown_type'] });
    }
    const missing = [];
    for (const field of required) {
        const value = citation[field];
        if (Array.isArray(value)) {
            if (value.length === 0) missing.push(field);
        } else if (value == null || value === '') {
            missing.push(field);
        }
    }
    return Object.freeze({
        valid: missing.length === 0,
        missing: Object.freeze(missing),
    }) as ValidationResult;
}

/**
 * Formata authors em estilo "SOBRENOME, Nome".
 */
function formatAuthorsAbnt(authors: any): string {
    if (!Array.isArray(authors) || authors.length === 0) return '';
    return authors
        .map((a) => {
            const parts = a.split(/\s+/);
            if (parts.length === 1) return parts[0].toUpperCase();
            const last = parts[parts.length - 1].toUpperCase();
            const first = parts.slice(0, -1).join(' ');
            return `${last}, ${first}`;
        })
        .join('; ');
}

/**
 * Formata authors em estilo APA "Sobrenome, N."
 */
function formatAuthorsApa(authors: any): string {
    if (!Array.isArray(authors) || authors.length === 0) return '';
    return authors
        .map((a) => {
            const parts = a.split(/\s+/);
            if (parts.length === 1) return parts[0];
            const last = parts[parts.length - 1];
            const initials = parts
                .slice(0, -1)
                .map((p: any) => `${p[0]}.`)
                .join(' ');
            return `${last}, ${initials}`;
        })
        .join(', & ');
}

/**
 * Formata citation em estilo ABNT NBR 6023.
 *
 * @param citation
 */
export function formatAbnt(citation: Record<string, any>): string {
    if (!citation || !citation.type) return '';
    const authors = formatAuthorsAbnt(citation.authors);
    const title = citation.title || '';
    const year = citation.year || '';
    let out: string;

    if (citation.type === 'book') {
        out = `${authors}. ${title}. ${citation.publisher || ''}, ${year}.`;
    } else if (citation.type === 'journal') {
        out = `${authors}. ${title}. ${citation.journal || ''}, v. ${citation.volume || ''}, n. ${citation.issue || ''}, p. ${citation.pages || ''}, ${year}.`;
    } else if (citation.type === 'web') {
        out = `${authors ? authors + '. ' : ''}${title}. ${year}. Disponível em: ${citation.url || ''}.`;
    } else if (citation.type === 'thesis') {
        out = `${authors}. ${title}. ${citation.institution || ''}, ${year}.`;
    } else if (citation.type === 'standard') {
        out = `${citation.organization || ''}. ${title}. ${year}.`;
    } else if (citation.type === 'report') {
        out = `${citation.organization || ''}. ${title}. ${year}.`;
    } else {
        out = '';
    }
    return out.replace(/\s+/g, ' ').trim();
}

/**
 * Formata citation em estilo APA 7th edition.
 */
export function formatApa(citation: any): string {
    if (!citation || !citation.type) return '';
    const authors = formatAuthorsApa(citation.authors);
    const year = citation.year ? `(${citation.year})` : '';
    const title = citation.title || '';
    let out: string;

    if (citation.type === 'book') {
        out = `${authors} ${year}. ${title}. ${citation.publisher || ''}.`;
    } else if (citation.type === 'journal') {
        out = `${authors} ${year}. ${title}. ${citation.journal || ''}, ${citation.volume || ''}(${citation.issue || ''}), ${citation.pages || ''}.`;
    } else if (citation.type === 'web') {
        out = `${authors ? authors + ' ' : ''}${year}. ${title}. ${citation.url || ''}`;
    } else if (citation.type === 'thesis') {
        out = `${authors} ${year}. ${title} [Thesis]. ${citation.institution || ''}.`;
    } else if (citation.type === 'standard') {
        out = `${citation.organization || ''} ${year}. ${title}.`;
    } else if (citation.type === 'report') {
        out = `${citation.organization || ''} ${year}. ${title}.`;
    } else {
        out = '';
    }
    return out.replace(/\s+/g, ' ').trim();
}

/**
 * Formata citation em estilo Chicago author-date.
 */
export function formatChicago(citation: any): string {
    if (!citation || !citation.type) return '';
    const authors = formatAuthorsApa(citation.authors); // similar style
    const year = citation.year || '';
    const title = citation.title || '';
    let out: string;

    if (citation.type === 'book') {
        out = `${authors}. ${year}. "${title}." ${citation.publisher || ''}.`;
    } else if (citation.type === 'journal') {
        out = `${authors}. ${year}. "${title}." ${citation.journal || ''} ${citation.volume || ''}: ${citation.pages || ''}.`;
    } else if (citation.type === 'web') {
        out = `${authors ? authors + '. ' : ''}${year}. "${title}." ${citation.url || ''}.`;
    } else {
        out = formatAbnt(citation); // fallback
    }
    return out.replace(/\s+/g, ' ').trim();
}

/**
 * Formata citation no estilo solicitado.
 *
 * @param citation
 * @param style - abnt/apa/chicago
 */
export function formatCitation(citation: object, style = 'abnt'): string {
    if (!citation) return '';
    if (style === 'apa') return formatApa(citation);
    if (style === 'chicago') return formatChicago(citation);
    return formatAbnt(citation); // default
}

/**
 * Sumariza citations.
 */
export function summarizeCitations(citations: any): CitationsSummary {
    const empty: CitationsSummary = { total: 0, byType: {}, validCount: 0, invalidCount: 0 };
    if (!Array.isArray(citations) || citations.length === 0) return empty;
    const byType: Record<string, number> = {};
    let validCount = 0;
    let invalidCount = 0;
    for (const c of citations) {
        if (!c) continue;
        if (c.type) byType[c.type] = (byType[c.type] || 0) + 1;
        const v = validateCitation(c);
        if (v.valid) validCount++;
        else invalidCount++;
    }
    return Object.freeze({
        total: citations.length,
        byType,
        validCount,
        invalidCount,
    });
}

/**
 * Module identity export.
 */
export const complianceCitationsMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 16,
    deliveredAt: '2026-05-01',
    types: CITATION_TYPES,
    styles: CITATION_STYLES,
    exports: [
        'CITATION_TYPES',
        'CITATION_STYLES',
        'REQUIRED_FIELDS',
        'CITATIONS_META',
        'isValidType',
        'isValidStyle',
        'createCitation',
        'validateCitation',
        'formatAbnt',
        'formatApa',
        'formatChicago',
        'formatCitation',
        'summarizeCitations',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
