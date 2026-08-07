// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenario Physical Factors — pure-logic (CFG-02, TEMA A "Dados reais").
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4.2 CFG-02).
 *
 * Resolves the per-route PHYSICAL factors (water m³/unit, tailings t/unit,
 * energy, jobs) that feed the official ODS measurers — READ from the element,
 * never hardcoded in the comparator. Resolution order (most-real first):
 *
 *   1. 'element'  — an explicit physical attribute persisted on the element
 *                   (`data.physical`, e.g. `waterIntensity`), the user's datum;
 *   2. 'derived'  — derivable from the element's REAL universal rates: the
 *                   tailings mass fraction is `1 − recoveryRate` (mass balance),
 *                   so changing `recoveryRate` in the model changes the factor
 *                   used in the delta (the CFG-02 testable clause);
 *   3. 'curated'  — the curated per-subtype default catalog (the pre-CFG-02
 *                   numbers water 2.0 / tailings 0.6 / energy 0.045 / jobs 0.01,
 *                   now versioned per subtype as the spec mandates);
 *   4. none       — `factor: null` + `semDado: true` (N3): a non-derivable
 *                   factor is surfaced as "sem dado" (engine → ODS tier T0),
 *                   NEVER filled with an invented default.
 *
 * The `reference` (measurer ceiling — renewable resource, licensed area…) is
 * site-specific and comes ONLY from the element (`<key>Reference`); it is never
 * curated (a fabricated reference would fabricate an ODS verdict).
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

import {
    DEFAULT_IMPACT_TYPE_CATALOG,
    impactAttributeKeys,
    type EffectiveImpactTypeCatalog,
    type ImpactTypeId,
} from './_impactTypeCatalogPure.js';

/**
 * Impact type id whose physical factor is being resolved (CFG-25). Open by
 * design: a type REGISTERED by data carries its own `attributeKey`, so this
 * resolver reads it from the catalog instead of from a closed union.
 */
export type PhysicalKind = ImpactTypeId;

/** Provenance of a resolved physical factor (most-real first). */
export type PhysicalFactorSource = 'element' | 'derived' | 'curated';

/** One resolved physical factor + its provenance (CFG-02). */
export interface PhysicalFactorResolution {
    /** Physical factor per unit of A(t) — `null` = semDado (N3, never invented). */
    readonly factor: number | null;
    /** Measurer reference/ceiling — element-provided only, else `null` (→ tier T0). */
    readonly reference: number | null;
    /** Where the factor came from; `null` when semDado. */
    readonly source: PhysicalFactorSource | null;
    /** true iff no real, derivable or curated factor exists for this kind/subtype. */
    readonly semDado: boolean;
}

/** Inputs the resolver reads — all REAL element data, duck-typed. */
export interface PhysicalFactorInput {
    /** Production subtype id ('mining' | 'petroleum' | future). */
    readonly subtype: string;
    /**
     * The recoveryRate REALLY persisted on the element (`data.rates.recoveryRate`),
     * or `null` when the user never informed it. Catalog defaults must NOT be
     * passed here — only a real datum may drive the 'derived' tier.
     */
    readonly elementRecoveryRate?: number | null;
    /** Element-persisted physical attributes (`data.physical`), duck-typed. */
    readonly attributes?: Readonly<Record<string, unknown>> | null;
}

/**
 * Element attribute key per impact type (the schema vocabulary of
 * `data.physical`). DERIVED from the CFG-25 catalog (N4 — this used to be a
 * second map that had to be edited in lockstep with the engine's type union);
 * a type registered by data brings its own key along.
 */
const CANONICAL_ATTRIBUTE_KEY: Readonly<Record<string, string>> = impactAttributeKeys();

/**
 * Curated per-subtype default factors (CFG-02: "os números atuais como default
 * curado por subtipo"). These are the pre-CFG-02 comparator numbers, now scoped
 * per subtype and versioned here instead of hardcoded in the UI. Emissions has
 * NO curated default (no honest generic number exists) → semDado.
 */
export const CURATED_PHYSICAL_DEFAULTS: Readonly<
    Record<string, Readonly<Partial<Record<PhysicalKind, number>>>>
> = Object.freeze({
    mining: Object.freeze({ water: 2.0, waterStress: 2.0, tailings: 0.6, energy: 0.045, jobs: 0.01 }),
    petroleum: Object.freeze({ water: 2.0, waterStress: 2.0, tailings: 0.6, energy: 0.045, jobs: 0.01 }),
});

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Non-negative finite element attribute, or `null` (never coerced). */
function attrNumber(attributes: PhysicalFactorInput['attributes'], key: string): number | null {
    const v = attributes ? attributes[key] : undefined;
    return isFiniteNumber(v) && v >= 0 ? v : null;
}

function frozen(
    factor: number | null,
    reference: number | null,
    source: PhysicalFactorSource | null,
): PhysicalFactorResolution {
    return Object.freeze({ factor, reference, source, semDado: factor === null });
}

/**
 * Resolve the physical factor for one route kind from the REAL element data
 * (CFG-02). Order: element attribute → derived from real rates (tailings =
 * 1 − recoveryRate) → curated per-subtype default → semDado (N3).
 *
 * @param kind - The route's impact type id (CFG-25 catalog).
 * @param input - Real element data (subtype, real recoveryRate, physical attrs).
 * @param catalog - Effective impact type catalog (CFG-25); omitted → canonical.
 * @returns Frozen resolution with factor, element-only reference and provenance.
 */
export function resolvePhysicalFactor(
    kind: PhysicalKind,
    input: PhysicalFactorInput,
    catalog: EffectiveImpactTypeCatalog = DEFAULT_IMPACT_TYPE_CATALOG,
): PhysicalFactorResolution {
    // The attribute vocabulary follows the catalog, so a registered impact type
    // reads its own `data.physical` key; an id outside the catalog has no key
    // and therefore no honest factor to read (falls through to semDado, N3).
    const keys = catalog === DEFAULT_IMPACT_TYPE_CATALOG
        ? CANONICAL_ATTRIBUTE_KEY
        : impactAttributeKeys(catalog);
    const key = keys[kind] ?? null;
    const reference = key === null ? null : attrNumber(input.attributes, `${key}Reference`);
    if (key === null) return frozen(null, reference, null);

    // 1 — the user's own datum on the element schema.
    const fromElement = attrNumber(input.attributes, key);
    if (fromElement !== null) return frozen(fromElement, reference, 'element');

    // 2 — mass balance derivable from the REAL recoveryRate (tailings fraction).
    if (kind === 'tailings') {
        const rec = input.elementRecoveryRate;
        if (isFiniteNumber(rec) && rec >= 0 && rec <= 1) {
            return frozen(1 - rec, reference, 'derived');
        }
    }

    // 3 — curated per-subtype default (versioned here, never invented ad hoc).
    const curated = CURATED_PHYSICAL_DEFAULTS[input.subtype]?.[kind];
    if (isFiniteNumber(curated)) return frozen(curated, reference, 'curated');

    // 4 — no honest factor exists → semDado (engine surfaces ODS tier T0).
    return frozen(null, reference, null);
}
