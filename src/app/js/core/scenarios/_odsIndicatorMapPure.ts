// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * F6 — Curated, data-driven map from a physical process characteristic to the
 * OFFICIAL SDG (ODS) indicators it affects.
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§F6, §4.3, NOT N9).
 *
 * ─── The point ───
 * The scenario comparator never shows a vague "green/yellow/red ODS semaphore";
 * it lists the OFFICIAL indicator each process characteristic maps to, with a
 * citable source (IAEG-SDGs metadata / Plataforma ODS Brasil). Each entry is
 * `{ goal, target, indicator, tier, source }`:
 *
 *   - água/efluente        → ODS 6  (6.4.1 / 6.3.2)
 *   - rejeito/recurso      → ODS 12 (12.4.2, 12.5.1 / 12.2.1)
 *   - emissões/energia     → ODS 13 (13.2.2) / ODS 7 (7.3.1)
 *   - empregos/segurança   → ODS 8  (8.5.1 / 8.8.1)
 *   - poluente do ar       → ODS 3  (3.9.1) / ODS 11 (11.6.2)   [CFG-27]
 *
 * ─── `tier` is DERIVABLE data, not a fixed constant (anti-stale, NOT N3) ───
 * The IAEG-SDGs tier classification changes periodically (Tier III was
 * abolished; multi-tier indicators exist in 2026). So the tier shipped in
 * {@link DEFAULT_ODS_INDICATOR_MAP} is only the curated DEFAULT as of the map's
 * `version`; an admin can refresh tiers from the source via a validated
 * {@link OdsTierOverride} WITHOUT rewriting this module — same curated/versioned
 * philosophy as CFG-24/CFG-32 ({@link ./_scenarioOdsThresholdConfigPure}).
 *
 * ─── NOT N9 / guard-rail §2.4.0 ───
 * The map is curated and versioned by admin in code — the end user never edits
 * goals/targets/indicators (no blank slate, N8). An unknown characteristic kind
 * resolves to an EMPTY list ("sem dado"), never a fabricated indicator (N3).
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

/**
 * Physical process characteristics the scenario engine knows how to map to
 * official SDG indicators (SPEC §F6). Extending coverage (CFG-27: air
 * pollutant → ODS 3/11 — DONE in map version 2) means adding a kind +
 * curated entries here — admin-curated, versioned, never end-user input
 * (NOT N9).
 */
export type ProcessCharacteristicKind =
    | 'water'
    | 'effluent'
    | 'tailings'
    | 'resource'
    | 'emissions'
    | 'energy'
    | 'jobs'
    | 'safety'
    | 'air';

/** IAEG-SDGs tier classification (Tier III abolished — only I/II remain). */
export type OdsIndicatorTier = 'I' | 'II';

/** One official SDG indicator entry, fully citable (SPEC §4.3). */
export interface OdsIndicator {
    /** SDG goal number (1..17), e.g. 6. */
    readonly goal: number;
    /** SDG target code, e.g. '6.4'. */
    readonly target: string;
    /** Official indicator code, e.g. '6.4.1'. */
    readonly indicator: string;
    /**
     * IAEG-SDGs tier at the map's `version`. DERIVABLE from `source` — refresh
     * via {@link resolveOdsTierRegistry}, never by rewriting the map.
     */
    readonly tier: OdsIndicatorTier;
    /** Citable source (UN Stats IAEG-SDGs metadata / Plataforma ODS Brasil). Never ''. */
    readonly source: string;
}

const UNSTATS = 'https://unstats.un.org/sdgs/metadata/files/Metadata-';
const ODS_BR = 'https://odsbrasil.gov.br/objetivo/objetivo?n=';

function entry(
    goal: number,
    target: string,
    indicator: string,
    tier: OdsIndicatorTier,
): OdsIndicator {
    // Source pairs the official IAEG-SDGs metadata sheet (tier authority) with
    // the Plataforma ODS Brasil goal page — both citable in the comparator UI.
    const meta = `${UNSTATS}${indicator.split('.').map((p) => p.padStart(2, '0')).join('-')}.pdf`;
    return Object.freeze({ goal, target, indicator, tier, source: `${meta} ; ${ODS_BR}${goal}` });
}

/**
 * The curated, versioned characteristic → official-indicator map (SPEC §4.3,
 * data-driven like `subtypes.ts`). Tiers reflect the IAEG-SDGs classification
 * at {@link ODS_INDICATOR_MAP_VERSION}; refresh via {@link OdsTierOverride}.
 * Frozen.
 */
export const DEFAULT_ODS_INDICATOR_MAP: Readonly<
    Record<ProcessCharacteristicKind, readonly OdsIndicator[]>
> = Object.freeze({
    // Water withdrawal efficiency — 6.4.1 (change in water-use efficiency).
    water: Object.freeze([entry(6, '6.4', '6.4.1', 'I')]),
    // Effluent quality — 6.3.2 (bodies of water with good ambient quality).
    effluent: Object.freeze([entry(6, '6.3', '6.3.2', 'II')]),
    // Tailings/hazardous waste — 12.4.2 (hazardous waste generated/treated)
    // and 12.5.1 (national recycling rate, tonnes recycled).
    tailings: Object.freeze([entry(12, '12.4', '12.4.2', 'II'), entry(12, '12.5', '12.5.1', 'II')]),
    // Natural-resource intensity — 12.2.1 (material footprint).
    resource: Object.freeze([entry(12, '12.2', '12.2.1', 'II')]),
    // GHG emissions — 13.2.2 (total greenhouse gas emissions per year).
    emissions: Object.freeze([entry(13, '13.2', '13.2.2', 'I')]),
    // Energy intensity — 7.3.1 (energy intensity of primary energy and GDP).
    energy: Object.freeze([entry(7, '7.3', '7.3.1', 'I')]),
    // Employment — 8.5.1 (average hourly earnings of employees).
    jobs: Object.freeze([entry(8, '8.5', '8.5.1', 'I')]),
    // Occupational safety — 8.8.1 (fatal/non-fatal occupational injuries).
    safety: Object.freeze([entry(8, '8.8', '8.8.1', 'II')]),
    // CFG-27 — Air pollutant — 3.9.1 (mortality attributed to household and
    // ambient air pollution) and 11.6.2 (annual mean PM2.5/PM10 in cities).
    air: Object.freeze([entry(3, '3.9', '3.9.1', 'I'), entry(11, '11.6', '11.6.2', 'I')]),
});

/**
 * Version tag of the curated map + default tiers. Bumping it is the audit
 * trail for any curation change (NOT N9). v2: CFG-27 adds `air` → ODS 3/11.
 */
export const ODS_INDICATOR_MAP_VERSION = 2;

/**
 * Admin-curated tier refresh derived from the source (IAEG-SDGs metadata),
 * keyed by official indicator code (e.g. `{ '6.3.2': 'I' }`). Lets the map
 * follow periodic IAEG reclassifications WITHOUT a code rewrite (SPEC §F6).
 */
export interface OdsTierOverride {
    /** Indicator code → refreshed tier ('I' | 'II'). */
    readonly byIndicator?: Readonly<Record<string, OdsIndicatorTier>> | null;
    /** Version of the refreshed registry (audit trail). */
    readonly version?: number;
}

/** A resolved, validated tier registry ready to feed {@link mapProcessToOdsIndicators}. */
export interface OdsTierRegistry {
    /** Only VALID refreshes survive (known indicator code + tier I/II). Frozen. */
    readonly byIndicator: Readonly<Record<string, OdsIndicatorTier>>;
    readonly version: number;
}

/** The default registry: no refresh, tiers as shipped. Frozen. */
export const DEFAULT_ODS_TIER_REGISTRY: OdsTierRegistry = Object.freeze({
    byIndicator: Object.freeze({}) as Readonly<Record<string, OdsIndicatorTier>>,
    version: ODS_INDICATOR_MAP_VERSION,
});

/** Every official indicator code present in the curated map. */
function knownIndicatorCodes(): ReadonlySet<string> {
    const out = new Set<string>();
    for (const kind of Object.keys(DEFAULT_ODS_INDICATOR_MAP) as ProcessCharacteristicKind[]) {
        for (const e of DEFAULT_ODS_INDICATOR_MAP[kind]) out.add(e.indicator);
    }
    return out;
}

/**
 * Resolve a validated tier registry from an optional admin-curated override.
 * Unknown indicator codes and tiers outside {'I','II'} are dropped (Tier III
 * is abolished — never accepted); passing nothing returns the shipped tiers
 * (zero regression, guard-rail §2.4.0).
 *
 * @param override? - Admin-curated tier refresh derived from the IAEG source.
 * @returns A frozen {@link OdsTierRegistry}.
 */
export function resolveOdsTierRegistry(override?: OdsTierOverride | null): OdsTierRegistry {
    if (!override || typeof override !== 'object') return DEFAULT_ODS_TIER_REGISTRY;
    const known = knownIndicatorCodes();
    const byIndicator: Record<string, OdsIndicatorTier> = {};
    const raw = override.byIndicator;
    if (raw && typeof raw === 'object') {
        for (const code of Object.keys(raw)) {
            const tier = raw[code];
            if (!known.has(code)) continue;
            if (tier !== 'I' && tier !== 'II') continue;
            byIndicator[code] = tier;
        }
    }
    return Object.freeze({
        byIndicator: Object.freeze(byIndicator) as Readonly<Record<string, OdsIndicatorTier>>,
        version:
            typeof override.version === 'number' && Number.isFinite(override.version)
                ? override.version
                : ODS_INDICATOR_MAP_VERSION,
    });
}

/**
 * Resolve a physical process characteristic to its official SDG indicators.
 * The single F6 entry point the delta/comparator layers consume.
 *
 * @param kind - The characteristic kind (e.g. 'water', 'emissions').
 * @param registry? - Optional resolved tier registry (admin refresh); omitted →
 *   shipped tiers.
 * @returns Frozen list of citable {@link OdsIndicator}; EMPTY for an unknown
 *   kind ("sem dado" — never a fabricated indicator, NOT N3).
 */
export function mapProcessToOdsIndicators(
    kind: string,
    registry?: OdsTierRegistry | null,
): readonly OdsIndicator[] {
    const entries = (DEFAULT_ODS_INDICATOR_MAP as Record<string, readonly OdsIndicator[]>)[kind];
    if (!entries) return Object.freeze([]);
    const reg = registry ?? DEFAULT_ODS_TIER_REGISTRY;
    let refreshed = false;
    for (const e of entries) {
        if (reg.byIndicator[e.indicator] && reg.byIndicator[e.indicator] !== e.tier) refreshed = true;
    }
    if (!refreshed) return entries;
    return Object.freeze(
        entries.map((e) =>
            Object.freeze({ ...e, tier: reg.byIndicator[e.indicator] ?? e.tier }),
        ),
    );
}

/** All characteristic kinds the curated map covers (for validation/UI catalogs). */
export function listOdsMappedKinds(): readonly ProcessCharacteristicKind[] {
    return Object.freeze(
        Object.keys(DEFAULT_ODS_INDICATOR_MAP) as ProcessCharacteristicKind[],
    );
}
