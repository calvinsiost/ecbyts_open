// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pipeline Enrichment — ECBT Transformation Libraries Phase 62
 * Pure record enrichment: derived fields, lookup, normalize, annotate, classify.
 * No browser, synchronous.
 */

export type EnrichmentType = 'derived' | 'lookup' | 'normalize' | 'annotate' | 'classify';

export type RecordObj = { readonly [k: string]: unknown };

export type DerivedFn<R extends RecordObj = RecordObj> = (record: R) => unknown;

export interface NormalizeSpec {
    readonly min?: number;
    readonly max?: number;
    readonly field?: string;
}

export interface ClassifyTier {
    readonly label: string;
    readonly max: number;
}

export interface ClassifySpec {
    readonly field?: string;
    readonly tiers?: ReadonlyArray<ClassifyTier>;
    readonly fallback?: string;
}

export interface EnrichmentSpec {
    readonly type: EnrichmentType;
    readonly targetField: string;
    readonly spec: unknown;
}

export const ENRICHMENT_META: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 62,
    deliveredAt: '2026-05-02',
});

export const ENRICHMENT_TYPES: ReadonlyArray<EnrichmentType> = Object.freeze([
    'derived',
    'lookup',
    'normalize',
    'annotate',
    'classify',
] as const);

/**
 * Cria spec de enriquecimento frozen.
 */
export function createEnrichmentSpec(
    type: string,
    targetField: string,
    spec: unknown,
): EnrichmentSpec {
    if (!(ENRICHMENT_TYPES as ReadonlyArray<string>).includes(type)) {
        throw new TypeError(`enrichment type '${type}' not recognized`);
    }
    if (typeof targetField !== 'string' || !targetField.trim()) {
        throw new TypeError('targetField string required');
    }
    if (spec === null || spec === undefined) throw new TypeError('spec required');
    return Object.freeze({ type: type as EnrichmentType, targetField, spec });
}

/**
 * Aplica campo derivado a um registro.
 */
export function addDerivedField<R extends RecordObj = RecordObj>(
    record: R | unknown,
    targetField: string,
    fn: DerivedFn<R>,
): R | RecordObj {
    if (!record || typeof record !== 'object') return record as R;
    if (typeof fn !== 'function') return record as R;
    try {
        const value = fn(record as R);
        return Object.freeze({ ...(record as RecordObj), [targetField]: value });
    } catch (e) {
        // [pipelineEnrichment:addDerivedField] derived fn threw — fallback to null
        void e;
        return Object.freeze({ ...(record as RecordObj), [targetField]: null });
    }
}

/**
 * Lookup de valor em mapa frozen.
 */
export function addLookupField(
    record: RecordObj | unknown,
    sourceField: string,
    targetField: string,
    lookupMap: Readonly<{ [k: string]: unknown }> | null | undefined,
    fallback: unknown = null,
): RecordObj {
    if (!record || typeof record !== 'object') return record as RecordObj;
    const r = record as RecordObj;
    const key = r[sourceField];
    const value =
        lookupMap && key !== undefined && (key as string | number) in lookupMap
            ? lookupMap[key as string]
            : fallback;
    return Object.freeze({ ...r, [targetField]: value });
}

/**
 * Normaliza campo numérico para [0,1] dado min/max.
 */
export function normalizeField(
    record: RecordObj | unknown,
    field: string,
    min: number,
    max: number,
    targetField?: string,
): RecordObj {
    if (!record || typeof record !== 'object') return record as RecordObj;
    const r = record as RecordObj;
    const tf = targetField || `${field}_norm`;
    const v = r[field];
    if (typeof v !== 'number' || max === min) return Object.freeze({ ...r, [tf]: null });
    const norm = Math.max(0, Math.min(1, (v - min) / (max - min)));
    return Object.freeze({ ...r, [tf]: norm });
}

/**
 * Adiciona anotação livre a um registro.
 */
export function annotateRecord(
    record: RecordObj | unknown,
    annotationField: string,
    annotation: unknown,
): RecordObj {
    if (!record || typeof record !== 'object') return record as RecordObj;
    return Object.freeze({ ...(record as RecordObj), [annotationField]: annotation });
}

/**
 * Classifica registro em categoria segundo thresholds.
 */
export function classifyRecord(
    record: RecordObj | unknown,
    field: string,
    targetField: string,
    tiers: ReadonlyArray<ClassifyTier> | undefined,
    fallback = 'other',
): RecordObj {
    if (!record || typeof record !== 'object') return record as RecordObj;
    const r = record as RecordObj;
    const v = r[field];
    let label = fallback;
    if (typeof v === 'number' && Array.isArray(tiers)) {
        for (const tier of tiers) {
            if (v <= tier.max) {
                label = tier.label;
                break;
            }
        }
    }
    return Object.freeze({ ...r, [targetField]: label });
}

/**
 * Aplica lista de enrichment specs a um único registro.
 */
export function enrichRecord(
    record: RecordObj | unknown,
    specs: ReadonlyArray<EnrichmentSpec> | unknown,
    context: { readonly [k: string]: unknown } = {},
): RecordObj {
    if (!record || !Array.isArray(specs)) return record as RecordObj;
    let cur: RecordObj = record as RecordObj;
    for (const s of specs as ReadonlyArray<EnrichmentSpec>) {
        if (!s) continue;
        if (s.type === 'derived' && typeof s.spec === 'function') {
            cur = addDerivedField(cur, s.targetField, s.spec as DerivedFn) as RecordObj;
        } else if (s.type === 'lookup' && s.spec && typeof s.spec === 'object') {
            const sourceField =
                (context[`${s.targetField}_sourceField`] as string | undefined) || s.targetField;
            cur = addLookupField(
                cur,
                sourceField,
                s.targetField,
                s.spec as Readonly<{ [k: string]: unknown }>,
                context[`${s.targetField}_fallback`] ?? null,
            );
        } else if (s.type === 'normalize') {
            const ns = (s.spec as NormalizeSpec) || {};
            const min = ns.min ?? 0;
            const max = ns.max ?? 1;
            const field = ns.field ?? s.targetField;
            cur = normalizeField(cur, field, min, max, s.targetField);
        } else if (s.type === 'annotate') {
            const ann =
                typeof s.spec === 'function'
                    ? (s.spec as (r: RecordObj) => unknown)(cur)
                    : s.spec;
            cur = annotateRecord(cur, s.targetField, ann);
        } else if (s.type === 'classify' && s.spec) {
            const cs = s.spec as ClassifySpec;
            cur = classifyRecord(
                cur,
                cs.field || s.targetField,
                s.targetField,
                cs.tiers,
                cs.fallback,
            );
        }
    }
    return cur;
}

/**
 * Enriquece array de registros.
 */
export function enrichAll(
    records: ReadonlyArray<RecordObj> | unknown,
    specs: ReadonlyArray<EnrichmentSpec>,
    context: { readonly [k: string]: unknown } = {},
): ReadonlyArray<RecordObj> {
    if (!Array.isArray(records)) return Object.freeze([]);
    return Object.freeze(
        (records as ReadonlyArray<RecordObj>).map((r) => enrichRecord(r, specs, context)),
    );
}

/**
 * Sumariza enriquecimento: contagem de campos adicionados.
 */
export function summarizeEnrichment(
    original: RecordObj | null | undefined,
    enriched: RecordObj | null | undefined,
): Readonly<{ added: number; modified: number }> {
    if (!original || !enriched) return Object.freeze({ added: 0, modified: 0 });
    const origKeys = new Set(Object.keys(original));
    const newKeys = Object.keys(enriched).filter((k) => !origKeys.has(k));
    const modKeys = Object.keys(enriched).filter(
        (k) => origKeys.has(k) && enriched[k] !== original[k],
    );
    return Object.freeze({ added: newKeys.length, modified: modKeys.length });
}

export const pipelineEnrichmentMeta: Readonly<{
    spec: string;
    phase: number;
    deliveredAt: string;
    exports: ReadonlyArray<string>;
    provenance: Readonly<{ generatedBy: string; disclaimerAcknowledged: boolean }>;
}> = Object.freeze({
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 62,
    deliveredAt: '2026-05-02',
    exports: Object.freeze([
        'ENRICHMENT_META',
        'ENRICHMENT_TYPES',
        'createEnrichmentSpec',
        'addDerivedField',
        'addLookupField',
        'normalizeField',
        'annotateRecord',
        'classifyRecord',
        'enrichRecord',
        'enrichAll',
        'summarizeEnrichment',
    ] as const),
    provenance: Object.freeze({ generatedBy: 'AI', disclaimerAcknowledged: true }),
});
