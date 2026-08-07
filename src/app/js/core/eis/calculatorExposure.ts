// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   EIS CALCULATOR DATA EXPOSURE — SPEC EIS-CALC-DATA-001

   Runtime helpers (Trilha A §2) para consultar/ponderar dados do EIS
   no Calculator. Pure, node-testable. SQL layer (Trilha B) fora deste
   módulo — é handler + Supabase.

   Implementa:
   - validateGovernancePack (schema v1)
   - normalizeWeight (numerator/denominator → 0..1)
   - computeCollectionWeightedAxis (valor + breakdown)
   - aggregateByKey (roll-up por area/campaign/collection/element/etc)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// Schema constants §3
// ──────────────────────────────────────────────────────────────────────

export const PACK_SCHEMA_VERSION = 'eis-governance-pack.v1';

export const ALLOWED_SCOPE_TYPES = Object.freeze([
    'area',
    'campaign',
    'collection',
    'family',
    'stamp',
    'document',
    'group',
    'element',
    'parameter',
    'matrix',
    'mixed',
    'custom',
    'global_default',
]);

export const ALLOWED_AGGREGATION_KEYS = Object.freeze([
    'area',
    'campaign',
    'collection',
    'family',
    'stamp',
    'document',
    'group',
    'element',
    'parameter',
    'matrix',
    'mixed',
]);

// ──────────────────────────────────────────────────────────────────────
// Pack validation
// ──────────────────────────────────────────────────────────────────────

interface ValidationResult {
    valid: boolean;
    errors: string[];
}

/**
 * Valida um EisGovernancePack (runtime Trilha A).
 */
export function validateGovernancePack(pack: Record<string, unknown>): ValidationResult {
    const errors: string[] = [];
    if (!pack || typeof pack !== 'object') return { valid: false, errors: ['pack not object'] };

    if (pack.schemaVersion !== PACK_SCHEMA_VERSION) {
        errors.push(`schemaVersion mismatch: expected ${PACK_SCHEMA_VERSION}`);
    }
    if (pack.groupingMode && pack.groupingMode !== 'campaign') {
        errors.push(`groupingMode unsupported: ${pack.groupingMode}`);
    }
    if (!Array.isArray(pack.documents)) errors.push('documents must be array');
    if (!Array.isArray(pack.datasetCollections)) errors.push('datasetCollections must be array');
    if (!Array.isArray(pack.campaignGroups)) errors.push('campaignGroups must be array');
    if (!Array.isArray(pack.axisWeightRules)) errors.push('axisWeightRules must be array');

    // Scope types whitelisted
    const checkScope = (scope: unknown, ctx: string) => {
        if (!scope || typeof scope !== 'object') return;
        const s = scope as Record<string, unknown>;
        if (!ALLOWED_SCOPE_TYPES.includes(s.type as string)) {
            errors.push(`${ctx}: scope.type not allowed: ${s.type}`);
        }
    };
    if (Array.isArray(pack.datasetCollections)) {
        pack.datasetCollections.forEach((c: unknown, i: number) =>
            checkScope((c as Record<string, unknown>)?.scope, `datasetCollections[${i}]`),
        );
    }
    if (Array.isArray(pack.axisWeightRules)) {
        pack.axisWeightRules.forEach((r: unknown, i: number) =>
            checkScope((r as Record<string, unknown>)?.scope, `axisWeightRules[${i}]`),
        );
    }

    return { valid: errors.length === 0, errors };
}

// ──────────────────────────────────────────────────────────────────────
// Weight normalization
// ──────────────────────────────────────────────────────────────────────

interface WeightInput {
    numerator: number;
    denominator: number;
}

interface NormalizedWeight {
    numerator: number;
    denominator: number;
    normalized: number;
}

/**
 * Normaliza peso {numerator, denominator} para [0, 1].
 */
export function normalizeWeight(weight: WeightInput): NormalizedWeight | null {
    if (!weight || typeof weight !== 'object') return null;
    const num = Number(weight.numerator);
    const den = Number(weight.denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den)) return null;
    if (den === 0) return null;
    const normalized = num / den;
    if (normalized < 0) return null;
    return { numerator: num, denominator: den, normalized };
}

interface WeightEntry {
    weight: { normalized: number };
}

/**
 * Normaliza array de pesos para somar 1 (soft-max).
 */
export function softNormalizeWeights(entries: Array<WeightEntry>): Array<WeightEntry> {
    if (!Array.isArray(entries) || entries.length === 0) return [];
    const sum = entries.reduce((s, e) => s + (Number(e?.weight?.normalized) || 0), 0);
    if (sum === 0) return entries.slice();
    return entries.map((e) => ({
        ...e,
        weight: {
            ...(e.weight || {}),
            normalized: (Number(e?.weight?.normalized) || 0) / sum,
        },
    }));
}

// ──────────────────────────────────────────────────────────────────────
// Filter helpers (§5.1 scope_filters)
// ──────────────────────────────────────────────────────────────────────

interface FilterInput {
    campaignId?: string;
    documentId?: string;
    areaKey?: string;
}

/**
 * Filtra collections por scopeFilters opcionais.
 */
export function filterCollections(collections: Array<unknown>, filters: FilterInput = {}): Array<unknown> {
    if (!Array.isArray(collections)) return [];
    return collections.filter((c) => {
        if (!c) return false;
        const col = c as Record<string, unknown>;
        if (filters.campaignId && col.campaignId !== filters.campaignId) return false;
        if (filters.documentId && col.linkedDocumentId !== filters.documentId) return false;
        if (filters.areaKey && col.scope && typeof col.scope === 'object' &&
            (col.scope as Record<string, unknown>).type === 'area' &&
            (col.scope as Record<string, unknown>).value !== filters.areaKey) {
            return false;
        }
        return true;
    });
}

// ──────────────────────────────────────────────────────────────────────
// Weighted axis computation (§5.1 collection_weighted_axis)
// ──────────────────────────────────────────────────────────────────────

interface Collection {
    id: string;
    campaignId?: string;
    weight: { normalized?: number };
    linkedDocumentId?: string;
}

interface BreakdownItem {
    collectionId: string;
    campaignId: string | null;
    documentId: string | null;
    raw: number;
    weight: number;
    weighted: number;
}

interface WeightedAxisResult {
    value: number | null;
    breakdown: BreakdownItem[];
    axis: string | null;
    totalWeight: number;
}

/**
 * Computa score ponderado de um eixo baseado em coleções × raw scores.
 */
export function computeCollectionWeightedAxis(params: {
    collections?: Array<Collection>;
    rawAxisScores?: Record<string, number>;
    axis?: string;
    scopeFilters?: FilterInput;
}): WeightedAxisResult {
    if (!params || typeof params !== 'object') {
        return { value: null, breakdown: [], axis: null, totalWeight: 0 };
    }
    const { axis, collections, rawAxisScores, scopeFilters } = params;
    if (!axis) return { value: null, breakdown: [], axis: null, totalWeight: 0 };

    const filtered = filterCollections(collections as Array<unknown>, scopeFilters);
    if (filtered.length === 0) {
        return { value: null, breakdown: [], axis, totalWeight: 0 };
    }

    let sumWeighted = 0;
    let totalWeight = 0;
    const breakdown: BreakdownItem[] = [];

    for (const col of filtered as Array<Collection>) {
        const raw = Number(rawAxisScores?.[col.id]);
        if (!Number.isFinite(raw)) continue;
        const w = Number(col.weight?.normalized);
        if (!Number.isFinite(w) || w < 0) continue;
        const weighted = raw * w;
        sumWeighted += weighted;
        totalWeight += w;
        breakdown.push({
            collectionId: col.id,
            campaignId: col.campaignId || null,
            documentId: col.linkedDocumentId || null,
            raw,
            weight: w,
            weighted,
        });
    }

    const value = totalWeight > 0 ? sumWeighted / totalWeight : null;
    return { value, breakdown, axis, totalWeight };
}

// ──────────────────────────────────────────────────────────────────────
// Aggregation roll-up (§5.1 aggregation_key)
// ──────────────────────────────────────────────────────────────────────

interface AggregationBucket {
    key: string;
    weightedSum: number;
    weightTotal: number;
    mean: number | null;
    items: number;
}

function _resolveAggregationKey(
    item: Record<string, unknown>,
    aggregationKey: string,
    lookups?: Map<string, unknown> | Record<string, unknown>,
): string | null {
    if (aggregationKey === 'collection') return (item.collectionId as string | undefined) ?? null;
    if (aggregationKey === 'campaign') return (item.campaignId as string | undefined) ?? null;
    if (aggregationKey === 'document') return (item.documentId as string | undefined) ?? null;

    // Busca via lookups (ex: area/family via metadata por collectionId)
    const meta = lookups instanceof Map
        ? lookups.get(item.collectionId as string)
        : lookups?.[item.collectionId as string];
    return ((meta as Record<string, unknown>)?.[aggregationKey] as string | undefined) || null;
}

/**
 * Agrega breakdown de computeCollectionWeightedAxis por uma chave
 * (campaign/document/collection/area/etc).
 */
export function aggregateByKey(
    breakdown: Array<unknown>,
    aggregationKey: string,
    lookups?: Map<string, unknown> | Record<string, unknown>,
): AggregationBucket[] {
    if (!Array.isArray(breakdown)) return [];
    if (!ALLOWED_AGGREGATION_KEYS.includes(aggregationKey)) return [];

    const buckets = new Map<string, { key: string; weightedSum: number; weightTotal: number; items: number }>();
    for (const b of breakdown) {
        if (!b || typeof b !== 'object') continue;
        const item = b as Record<string, unknown>;
        const key = _resolveAggregationKey(item, aggregationKey, lookups) ?? '__unspecified';
        const keyStr = String(key);
        if (!buckets.has(keyStr)) {
            buckets.set(keyStr, { key: keyStr, weightedSum: 0, weightTotal: 0, items: 0 });
        }
        const bucket = buckets.get(keyStr)!;
        bucket.weightedSum += Number(item.weighted) || 0;
        bucket.weightTotal += Number(item.weight) || 0;
        bucket.items += 1;
    }

    return Array.from(buckets.values()).map((b) => ({
        ...b,
        mean: b.weightTotal > 0 ? b.weightedSum / b.weightTotal : null,
    }));
}
