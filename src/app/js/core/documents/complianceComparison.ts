// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Document Compliance Comparison - Phase 15 (P1-5)
 * Spec: docs/specs/features/SPEC_DOCUMENT_COMPLIANCE_VALIDATOR.md §S18
 *
 * Phase 15 (2026-05-01) - pure-logic engine para comparar N documentos
 * simultaneamente. Identifica common fields, divergências, alinhamento
 * por similaridade. Útil para revisões de versões de relatório similares
 * de múltiplos sites.
 *
 * Estratégia:
 *   - extractFields: lista campos canônicos de doc
 *   - compareNDocs: matrix de comparação MxM
 *   - findCommonalities: campos com mesmo valor em todos
 *   - findDivergences: campos com valores diferentes
 *   - alignmentScore: 0-1 baseado em campo overlap
 *
 * NÃO depende de browser. Não toca em DOM/Three.js/Supabase.
 *
 * Owner: Claude (orquestrador apropriador)
 */

/** Tipos canônicos de outcome de comparação por field. */
export const FIELD_OUTCOMES = Object.freeze([
    'all_equal',
    'all_different',
    'majority_match',
    'minority_match',
    'partial_missing',
]);

/** Identidade do módulo. */
export const COMPARISON_META = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 15,
    deliveredAt: '2026-05-01',
    fieldOutcomes: FIELD_OUTCOMES,
});

/**
 * Extrai todos os field paths (achatado) de um doc.
 *
 * @param {Object} doc
 * @param {string} [prefix='']
 * @returns {Object<string, *>} — {path: value}
 */
export function extractFields(doc: object, prefix: string = ''): Record<string, any> {
    const out = ({} as Record<string, any>);
    if (!doc || typeof doc !== 'object') return out;
    for (const [key, value] of Object.entries(doc)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(out, extractFields(value, path));
        } else {
            out[path] = value;
        }
    }
    return out;
}

/**
 * Verifica se 2 valores são iguais (deep, JSON.stringify-based).
 */
function valueEquals( a: any,  b: any) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch (e) {
        console.debug('[comparison:valueEquals]', (e as any)?.message || e);
        return false;
    }
}

/**
 * Compara N documentos field-by-field.
 *
 * @param {Array<Object>} docs
 * @returns {Record<string, any>}
 */
export function compareNDocs(docs: Array<object>): Record<string, any> {
    const empty = ({ fields: {}, totalFields: 0, totalDocs: 0 } as Record<string, any>);
    if (!Array.isArray(docs) || docs.length === 0) return empty;

    const allFields = (new Set<string>());
    const docFields = docs.map((doc) => {
        const f = extractFields(doc);
        Object.keys(f).forEach((k) => allFields.add(k));
        return f;
    });

    const result = ({} as Record<string, any>);
    for (const field of allFields) {
        const values = docFields.map((f) => (field in f ? f[field] : undefined));
        const presentCount = values.filter((v) => v !== undefined).length;
        const presentValues = values.filter((v) => v !== undefined);

        let outcome: string;
        if (presentCount < docs.length) {
            outcome = 'partial_missing';
        } else {
            // Group by stringified value
            const groups = new Map();
            for (const v of presentValues) {
                const key = JSON.stringify(v);
                groups.set(key, (groups.get(key) || 0) + 1);
            }
            if (groups.size === 1) {
                outcome = 'all_equal';
            } else if (groups.size === presentValues.length) {
                outcome = 'all_different';
            } else {
                // mixed - find max group
                let maxCount = 0;
                for (const c of groups.values()) {
                    if (c > maxCount) maxCount = c;
                }
                if (maxCount > presentValues.length / 2) {
                    outcome = 'majority_match';
                } else {
                    outcome = 'minority_match';
                }
            }
        }
        result[field] = Object.freeze({ outcome, valuesByDoc: Object.freeze([...values]) });
    }

    return Object.freeze({
        fields: Object.freeze(result),
        totalFields: allFields.size,
        totalDocs: docs.length,
    });
}

/**
 * Lista fields com mesmo valor em todos os documentos.
 *
 * @param {Record<string, any>} comparison - output de compareNDocs
 * @returns {Array<any>}
 */
export function findCommonalities(comparison: Record<string, any>): Array<any> {
    if (!comparison || !comparison.fields) return [];
    const out = ([] as any[]);
    for (const [field, info] of Object.entries(comparison.fields)) {
        const i = (info as any);
        if (i.outcome === 'all_equal') {
            out.push(Object.freeze({ field, value: i.valuesByDoc[0] }));
        }
    }
    return (Object.freeze(out) as any);
}

/**
 * Lista fields com valores diferentes entre documentos.
 *
 * @param {Record<string, any>} comparison
 * @returns {Array<any>}
 */
export function findDivergences(comparison: Record<string, any>): Array<any> {
    if (!comparison || !comparison.fields) return [];
    const out = ([] as any[]);
    for (const [field, info] of Object.entries(comparison.fields)) {
        const i = (info as any);
        if (i.outcome !== 'all_equal') {
            out.push(
                Object.freeze({
                    field,
                    outcome: i.outcome,
                    valuesByDoc: i.valuesByDoc,
                }),
            );
        }
    }
    return (Object.freeze(out) as any);
}

/**
 * Computa alignment score 0-1 (proporção all_equal sobre total).
 *
 * @param {Record<string, any>} comparison
 * @returns {number}
 */
export function alignmentScore(comparison: Record<string, any>): number {
    if (!comparison || !comparison.fields || !comparison.totalFields) return 0;
    const equalCount = Object.values(comparison.fields).filter(
        ( info: any) => info && info.outcome === 'all_equal',
    ).length;
    return equalCount / comparison.totalFields;
}

/**
 * Compara DUAS docs (par específico) e retorna apenas mudanças entre elas.
 *
 * @param {Object} a
 * @param {Object} b
 * @returns {Record<string, any>}
 */
export function comparePair(a: object, b: object): Record<string, any> {
    const empty = ({ added: [], removed: [], changed: [] } as Record<string, any>);
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') {
        return Object.freeze(empty);
    }
    const fa = extractFields(a);
    const fb = extractFields(b);
    const added = [];
    const removed = [];
    const changed = [];

    for (const key of Object.keys(fb)) {
        if (!(key in fa)) {
            added.push({ field: key, value: fb[key] });
        } else if (!valueEquals(fa[key], fb[key])) {
            changed.push({ field: key, oldValue: fa[key], newValue: fb[key] });
        }
    }
    for (const key of Object.keys(fa)) {
        if (!(key in fb)) {
            removed.push({ field: key, value: fa[key] });
        }
    }
    return Object.freeze({
        added: Object.freeze(added),
        removed: Object.freeze(removed),
        changed: Object.freeze(changed),
    });
}

/**
 * Sumariza comparison.
 */
export function summarizeComparison( comparison: any) {
    const empty = {
        totalFields: 0,
        totalDocs: 0,
        commonalitiesCount: 0,
        divergencesCount: 0,
        alignment: 0,
        outcomeCounts: {},
    };
    if (!comparison || !comparison.fields) return empty;
    const outcomeCounts = ({
        all_equal: 0,
        all_different: 0,
        majority_match: 0,
        minority_match: 0,
        partial_missing: 0,
    } as Record<string, number>);
    for (const info of Object.values(comparison.fields)) {
        const i = (info as any);
        if (i && i.outcome in outcomeCounts) outcomeCounts[i.outcome]!++;
    }
    return Object.freeze({
        totalFields: comparison.totalFields,
        totalDocs: comparison.totalDocs,
        commonalitiesCount: outcomeCounts.all_equal,
        divergencesCount: comparison.totalFields - outcomeCounts.all_equal!,
        alignment: alignmentScore(comparison),
        outcomeCounts: Object.freeze(outcomeCounts),
    });
}

/**
 * Module identity export.
 */
export const complianceComparisonMeta = Object.freeze({
    spec: 'DOCUMENT_COMPLIANCE_VALIDATOR_001',
    phase: 15,
    deliveredAt: '2026-05-01',
    fieldOutcomes: FIELD_OUTCOMES,
    exports: [
        'FIELD_OUTCOMES',
        'COMPARISON_META',
        'extractFields',
        'compareNDocs',
        'findCommonalities',
        'findDivergences',
        'alignmentScore',
        'comparePair',
        'summarizeComparison',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
});
