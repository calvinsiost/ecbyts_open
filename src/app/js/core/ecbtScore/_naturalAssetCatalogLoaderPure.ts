// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Natural Asset Catalog Loader — validação + merge multi-source pure-logic.
 *
 * Calvin D1 2026-06-08: "usuários poderão carregar os seus via libraries".
 *
 * Responsabilidades:
 *  1. validateCatalogPayload(json) — valida shape antes de instalar via Libraries
 *  2. mergeCatalogs(layers) — merge ordem-segura (last-write-wins) com trail
 *  3. resolveEffectiveCatalog({seed, libraries, userOverride}) — precedência canônica
 *  4. catalogToAuditEntries(merged) — proveniência por família para Bloco F
 *
 * Precedência canônica (lowest → highest):
 *   seed (built-in benchmark) → libraries (ordem ativação) → userOverride
 *
 * Cada camada pode sobrescrever famílias individuais; merge é POR-FAMÍLIA,
 * não somativo (lib que define `river: 45` substitui seed `river: 30`).
 *
 * Pure-logic: zero side-effects, frozen output, deterministic.
 */

import type { NaturalAssetCatalog } from './_naturalAssetsPure.js';

// ----------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------

export type ValidationCode =
    | 'ok'
    | 'not_object'
    | 'unknown_family_key'
    | 'invalid_number'
    | 'negative_value'
    | 'invalid_currency'
    | 'invalid_per_element_id'
    | 'invalid_uncertainty';

export interface ValidationIssue {
    readonly code: ValidationCode;
    readonly field: string;
    readonly message: string;
}

export interface ValidationResult {
    readonly valid: boolean;
    readonly issues: ReadonlyArray<ValidationIssue>;
    readonly normalized: NaturalAssetCatalog | null;
}

export type CatalogLayerKind = 'seed' | 'library' | 'userOverride';

export interface CatalogLayer {
    readonly kind: CatalogLayerKind;
    readonly source: string;
    readonly catalog: NaturalAssetCatalog;
}

export interface MergeResult {
    readonly catalog: NaturalAssetCatalog;
    readonly trail: ReadonlyArray<MergeTrailEntry>;
}

export interface MergeTrailEntry {
    readonly field: string;
    readonly winner: CatalogLayerKind;
    readonly winnerSource: string;
    readonly value: number | string;
    readonly overriddenLayers: ReadonlyArray<{ kind: CatalogLayerKind; source: string; value: number | string }>;
}

export interface ResolveInput {
    readonly seed: NaturalAssetCatalog;
    readonly libraries?: ReadonlyArray<{ source: string; catalog: NaturalAssetCatalog }>;
    readonly userOverride?: NaturalAssetCatalog;
}

export interface AuditEntry {
    readonly family: string;
    readonly value: number;
    readonly source: CatalogLayerKind;
    readonly sourceLabel: string;
}

// ----------------------------------------------------------------
// CONSTANTS
// ----------------------------------------------------------------

const KNOWN_FAMILY_KEYS: ReadonlySet<string> = new Set([
    'boundary',
    'habitat',
    'site_area',
    'area',
    'river',
    'lake',
    'spring',
    'individual',
]);

const NUMERIC_FAMILY_KEYS = KNOWN_FAMILY_KEYS;

const MAX_VALUE_PER_M2 = 1_000_000; // sanity: R$ 1MM/m² é absurdo
const VALID_CURRENCIES: ReadonlySet<string> = new Set([
    'BRL',
    'USD',
    'EUR',
    'GBP',
    'JPY',
    'CNY',
    'ARS',
    'CLP',
]);

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

/**
 * Valida payload livre (vindo de Libraries manifest ou JSON externo).
 *
 * Aceita campos conhecidos (8 famílias + defaultCurrency + perElement +
 * defaultUncertaintyFraction). Campos desconhecidos são reportados como
 * issue (não-bloqueante) — não jogamos fora silenciosamente.
 *
 * Retorna `normalized` apenas se valid=true (frozen).
 */
export function validateCatalogPayload(payload: unknown): ValidationResult {
    const issues: ValidationIssue[] = [];

    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
        return Object.freeze({
            valid: false,
            issues: Object.freeze([
                Object.freeze({
                    code: 'not_object' as ValidationCode,
                    field: '(root)',
                    message: 'Catalog payload deve ser objeto JSON (não array, não null).',
                }),
            ]),
            normalized: null,
        });
    }

    const src = payload as Record<string, unknown>;
    const normalized: Record<string, unknown> = {};

    // Famílias numéricas
    for (const key of NUMERIC_FAMILY_KEYS) {
        if (!(key in src)) continue;
        const raw = src[key];
        if (typeof raw !== 'number' || !Number.isFinite(raw)) {
            issues.push(
                Object.freeze({
                    code: 'invalid_number' as ValidationCode,
                    field: key,
                    message: `Esperado número finito em '${key}', recebeu ${typeof raw}.`,
                }),
            );
            continue;
        }
        if (raw < 0) {
            issues.push(
                Object.freeze({
                    code: 'negative_value' as ValidationCode,
                    field: key,
                    message: `'${key}' não pode ser negativo (recebeu ${raw}).`,
                }),
            );
            continue;
        }
        if (raw > MAX_VALUE_PER_M2) {
            issues.push(
                Object.freeze({
                    code: 'invalid_number' as ValidationCode,
                    field: key,
                    message: `'${key}' acima do limite sanity R$ ${MAX_VALUE_PER_M2}/m² (recebeu ${raw}).`,
                }),
            );
            continue;
        }
        normalized[key] = raw;
    }

    // defaultCurrency
    if ('defaultCurrency' in src) {
        const c = src.defaultCurrency;
        if (typeof c !== 'string' || !VALID_CURRENCIES.has(c.toUpperCase())) {
            issues.push(
                Object.freeze({
                    code: 'invalid_currency' as ValidationCode,
                    field: 'defaultCurrency',
                    message: `Moeda desconhecida '${String(c)}'. Aceitas: ${[...VALID_CURRENCIES].join(', ')}.`,
                }),
            );
        } else {
            normalized.defaultCurrency = c.toUpperCase();
        }
    }

    // defaultUncertaintyFraction (0..1)
    if ('defaultUncertaintyFraction' in src) {
        const u = src.defaultUncertaintyFraction;
        if (typeof u !== 'number' || !Number.isFinite(u) || u < 0 || u > 1) {
            issues.push(
                Object.freeze({
                    code: 'invalid_uncertainty' as ValidationCode,
                    field: 'defaultUncertaintyFraction',
                    message: `Esperado número em [0, 1], recebeu ${String(u)}.`,
                }),
            );
        } else {
            normalized.defaultUncertaintyFraction = u;
        }
    }

    // perElement
    if ('perElement' in src) {
        const pe = src.perElement;
        if (pe === null || typeof pe !== 'object' || Array.isArray(pe)) {
            issues.push(
                Object.freeze({
                    code: 'not_object' as ValidationCode,
                    field: 'perElement',
                    message: 'perElement deve ser objeto { [elementId]: number }.',
                }),
            );
        } else {
            const peNorm: Record<string, number> = {};
            for (const [id, v] of Object.entries(pe as Record<string, unknown>)) {
                if (typeof id !== 'string' || id.length === 0 || id.length > 200) {
                    issues.push(
                        Object.freeze({
                            code: 'invalid_per_element_id' as ValidationCode,
                            field: `perElement[${id}]`,
                            message: 'elementId deve ser string não-vazia ≤200 chars.',
                        }),
                    );
                    continue;
                }
                if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
                    issues.push(
                        Object.freeze({
                            code: 'invalid_number' as ValidationCode,
                            field: `perElement[${id}]`,
                            message: `Esperado número finito não-negativo, recebeu ${typeof v}.`,
                        }),
                    );
                    continue;
                }
                peNorm[id] = v;
            }
            normalized.perElement = Object.freeze(peNorm);
        }
    }

    // Unknown keys → soft warning (preservadas mas não normalizadas)
    for (const k of Object.keys(src)) {
        if (
            !NUMERIC_FAMILY_KEYS.has(k) &&
            k !== 'defaultCurrency' &&
            k !== 'defaultUncertaintyFraction' &&
            k !== 'perElement'
        ) {
            issues.push(
                Object.freeze({
                    code: 'unknown_family_key' as ValidationCode,
                    field: k,
                    message: `Chave '${k}' não reconhecida — ignorada. Conhecidas: ${[...KNOWN_FAMILY_KEYS].join(', ')}.`,
                }),
            );
        }
    }

    const hasErrors = issues.some(
        (i) =>
            i.code === 'not_object' ||
            i.code === 'invalid_number' ||
            i.code === 'negative_value' ||
            i.code === 'invalid_currency' ||
            i.code === 'invalid_per_element_id' ||
            i.code === 'invalid_uncertainty',
    );

    return Object.freeze({
        valid: !hasErrors,
        issues: Object.freeze(issues),
        normalized: hasErrors ? null : (Object.freeze(normalized) as NaturalAssetCatalog),
    });
}

// ----------------------------------------------------------------
// MERGE — last-write-wins por campo, com trail de auditoria
// ----------------------------------------------------------------

/**
 * Faz merge de N camadas em ordem (índice 0 = lowest priority, N-1 = highest).
 * Retorna catálogo + trail explicando quem ganhou cada campo.
 *
 * perElement é merged como dict union (mesmo last-write-wins por ID).
 */
export function mergeCatalogs(layers: ReadonlyArray<CatalogLayer>): MergeResult {
    if (!Array.isArray(layers) || layers.length === 0) {
        return Object.freeze({
            catalog: Object.freeze({}) as NaturalAssetCatalog,
            trail: Object.freeze([]),
        });
    }

    const allFields = new Set<string>();
    for (const layer of layers) {
        for (const k of Object.keys(layer.catalog || {})) allFields.add(k);
    }

    const merged: Record<string, unknown> = {};
    const trail: MergeTrailEntry[] = [];

    for (const field of allFields) {
        if (field === 'perElement') {
            // Special: dict union
            const peMerged: Record<string, number> = {};
            const peOverridden: { kind: CatalogLayerKind; source: string; value: number | string }[] = [];
            let lastWinner: CatalogLayer | null = null;
            for (const layer of layers) {
                const pe = (layer.catalog as any).perElement;
                if (!pe || typeof pe !== 'object') continue;
                for (const [id, v] of Object.entries(pe as Record<string, number>)) {
                    if (id in peMerged) {
                        peOverridden.push({
                            kind: layer.kind,
                            source: layer.source,
                            value: `${id}=${peMerged[id]}`,
                        });
                    }
                    peMerged[id] = v;
                }
                lastWinner = layer;
            }
            if (Object.keys(peMerged).length > 0 && lastWinner) {
                merged.perElement = Object.freeze(peMerged);
                trail.push(
                    Object.freeze({
                        field: 'perElement',
                        winner: lastWinner.kind,
                        winnerSource: lastWinner.source,
                        value: `${Object.keys(peMerged).length} overrides`,
                        overriddenLayers: Object.freeze(peOverridden),
                    }),
                );
            }
            continue;
        }

        let winner: CatalogLayer | null = null;
        let winnerValue: number | string | undefined;
        const overridden: { kind: CatalogLayerKind; source: string; value: number | string }[] = [];

        for (const layer of layers) {
            const v = (layer.catalog as any)[field];
            if (v === undefined || v === null) continue;
            if (winner) {
                overridden.push({
                    kind: winner.kind,
                    source: winner.source,
                    value: winnerValue as number | string,
                });
            }
            winner = layer;
            winnerValue = v;
        }

        if (winner && winnerValue !== undefined) {
            merged[field] = winnerValue;
            trail.push(
                Object.freeze({
                    field,
                    winner: winner.kind,
                    winnerSource: winner.source,
                    value: winnerValue,
                    overriddenLayers: Object.freeze(overridden),
                }),
            );
        }
    }

    return Object.freeze({
        catalog: Object.freeze(merged) as NaturalAssetCatalog,
        trail: Object.freeze(trail),
    });
}

// ----------------------------------------------------------------
// RESOLVE — convenience: seed + libraries + userOverride → MergeResult
// ----------------------------------------------------------------

export function resolveEffectiveCatalog(input: ResolveInput): MergeResult {
    const layers: CatalogLayer[] = [];
    if (input.seed) {
        layers.push(Object.freeze({ kind: 'seed' as const, source: 'built-in benchmark', catalog: input.seed }));
    }
    if (Array.isArray(input.libraries)) {
        for (const lib of input.libraries) {
            if (lib && lib.catalog) {
                layers.push(
                    Object.freeze({
                        kind: 'library' as const,
                        source: lib.source || 'library',
                        catalog: lib.catalog,
                    }),
                );
            }
        }
    }
    if (input.userOverride) {
        layers.push(
            Object.freeze({
                kind: 'userOverride' as const,
                source: 'user override (window.__ecbtNaturalAssetCatalog)',
                catalog: input.userOverride,
            }),
        );
    }
    return mergeCatalogs(layers);
}

// ----------------------------------------------------------------
// AUDIT — extrai entries para Bloco F do audit trail
// ----------------------------------------------------------------

/**
 * Converte MergeResult em lista de AuditEntry consumível pelo Bloco F
 * do audit trail (proveniência por família).
 *
 * Filtra apenas famílias com valor > 0 (não polui audit com zeros).
 */
export function catalogToAuditEntries(merge: MergeResult): ReadonlyArray<AuditEntry> {
    const out: AuditEntry[] = [];
    for (const entry of merge.trail) {
        if (!KNOWN_FAMILY_KEYS.has(entry.field)) continue;
        const v = entry.value;
        if (typeof v !== 'number' || v <= 0) continue;
        out.push(
            Object.freeze({
                family: entry.field,
                value: v,
                source: entry.winner,
                sourceLabel: entry.winnerSource,
            }),
        );
    }
    return Object.freeze(out);
}
