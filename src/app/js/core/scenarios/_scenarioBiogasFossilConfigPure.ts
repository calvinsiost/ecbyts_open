// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Curated, versioned fossil fraction of biogas for the scenario impact engine
 * (CFG-31). SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 * (§2.4.8 CFG-31, NOT N8/N9). Same curated/versioned philosophy as CFG-24
 * (`_scenarioEcbtConfigPure`) and CFG-32 (`_scenarioOdsThresholdConfigPure`).
 *
 * ─── The point ───
 * Biogas (landfill gas / anaerobic digester gas) is treated as 100% BIOGENIC
 * carbon: its CO2 is part of the short biological carbon cycle and is NOT
 * accounted as a fossil GHG emission (IPCC 2006, Vol. 5, Ch. 3 — waste; GHG
 * Protocol: biogenic CO2 reported separately). But real waste streams can carry
 * FOSSIL carbon (plastics/synthetics in MSW) or the biogas can be blended with
 * fossil gas — then a fraction of the burned gas IS a fossil emission and must
 * be counted. CFG-31 turns that fraction into a parameter that:
 *
 *   - is configurable in the validated range [0,1] — never a blank slate
 *     (NOT N8): an out-of-range or garbage override falls back to the default;
 *   - is CURATED and VERSIONED by admin (metodologia), NOT a free-text input in
 *     the end-user UI (NOT N9);
 *   - keeps 0 as the DEFAULT — the fundamented value for landfill/digester
 *     biogas (IPCC 2006, Vol. 5, Ch. 3: landfill gas carbon is of biogenic
 *     origin), which reproduces the pre-CFG-31 accounting exactly (zero
 *     regression, guard-rail §2.4.0-2).
 *
 * ─── Where curated config lives (NOT a new Supabase table) ───
 * Like CFG-24/CFG-32, the fraction is curated and versioned in code (N7 keeps
 * scenarios out of the DB). The versioned DEFAULT lives here as a frozen,
 * code-owned object; an admin-curated override is passed in as a plain partial
 * object and validated here before it can reach {@link partitionBiogasEmissions}.
 * A change to the fraction is auditable as a `version` bump.
 *
 * ─── Testable clause (spec §2.4.8 CFG-31) ───
 * fraction = 0.3 → 30% of the biogas emissions are classified as fossil:
 * `partitionBiogasEmissions(100, resolveBiogasFossilConfig({ fossilFraction: 0.3 }))`
 * yields `{ fossil: 30, biogenic: 70 }`.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

/** Citable methodology source for the biogenic default (guard-rail §2.4.0). */
export const BIOGAS_FOSSIL_FRACTION_SOURCE =
    'IPCC 2006 Guidelines for National GHG Inventories, Vol. 5 (Waste), Ch. 3 — carbono do biogás de aterro/digestor é biogênico; fração fóssil > 0 apenas em resíduo com carbono fóssil (ex.: plásticos) ou blend com gás fóssil.';

/**
 * The default curated fossil fraction: 0 — biogas treated as fully biogenic,
 * which reproduces the pre-CFG-31 accounting byte-for-byte (zero regression).
 */
export const DEFAULT_BIOGAS_FOSSIL_FRACTION = 0;

/**
 * Curated, versioned biogas fossil-fraction config. `fossilFraction` ∈ [0,1]:
 * the share of the biogas emissions accounted as FOSSIL GHG; the complement
 * (1 − fossilFraction) is biogenic and reported separately.
 */
export interface BiogasFossilConfig {
    /** Fossil share of the biogas emissions, in [0,1]. Default 0 (biogenic). */
    readonly fossilFraction: number;
    /**
     * Version tag of the curated config. Bumping this is the audit trail for a
     * change to the fraction (admin-curated, versioned — NOT N9). Default 1.
     */
    readonly version: number;
}

/**
 * The default curated config: fossilFraction=0 (fully biogenic), version 1.
 * Reproduces today's behaviour with zero regression. Frozen.
 */
export const DEFAULT_BIOGAS_FOSSIL_CONFIG: BiogasFossilConfig = Object.freeze({
    fossilFraction: DEFAULT_BIOGAS_FOSSIL_FRACTION,
    version: 1,
});

/** Partial curated override an admin may supply. */
export interface BiogasFossilConfigOverride {
    /** Curated fossil fraction; accepted only when finite and inside [0,1]. */
    readonly fossilFraction?: number | null;
    readonly version?: number;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** True iff `v` is a finite number inside the validated band [0,1]. */
function inBand(v: unknown): v is number {
    return isFiniteNumber(v) && v >= 0 && v <= 1;
}

/**
 * Resolve a curated biogas fossil-fraction config from an optional admin-curated
 * partial override, validated against {@link DEFAULT_BIOGAS_FOSSIL_CONFIG}. The
 * fraction is accepted only when finite and inside [0,1]; anything else falls
 * back to the default (never a blank slate — NOT N8). Passing nothing returns
 * the default config (current behaviour, zero regression).
 *
 * @param override? - Admin-curated partial (e.g. from a versioned config artifact).
 * @returns A frozen {@link BiogasFossilConfig} safe to feed to the partition.
 */
export function resolveBiogasFossilConfig(
    override?: BiogasFossilConfigOverride | null,
): BiogasFossilConfig {
    if (!override || typeof override !== 'object') {
        return DEFAULT_BIOGAS_FOSSIL_CONFIG;
    }
    const fossilFraction = inBand(override.fossilFraction)
        ? override.fossilFraction
        : DEFAULT_BIOGAS_FOSSIL_FRACTION;
    const version =
        isFiniteNumber(override.version) && Number.isInteger(override.version) && override.version >= 1
            ? override.version
            : DEFAULT_BIOGAS_FOSSIL_CONFIG.version;
    // An override that resolves to the default stays implicit (== today).
    if (fossilFraction === DEFAULT_BIOGAS_FOSSIL_FRACTION && version === DEFAULT_BIOGAS_FOSSIL_CONFIG.version) {
        return DEFAULT_BIOGAS_FOSSIL_CONFIG;
    }
    return Object.freeze({ fossilFraction, version });
}

/** Result of splitting biogas emissions into fossil vs. biogenic shares. */
export interface BiogasEmissionsPartition {
    /** Total biogas emissions handed in (tCO2e). */
    readonly total: number;
    /** Fossil share: total × fossilFraction (accounted as fossil GHG). */
    readonly fossil: number;
    /** Biogenic share: total × (1 − fossilFraction) (reported separately). */
    readonly biogenic: number;
    /** The fraction that drove the split (provenance). */
    readonly fossilFraction: number;
}

/**
 * Split a biogas emissions total into its fossil and biogenic parcels given a
 * curated config — the CFG-31 testable clause. The fossil parcel is the one
 * accounted as fossil GHG; the biogenic parcel is reported separately (IPCC /
 * GHG Protocol). A non-finite or negative total yields `null` (anti-N3: never
 * fabricate a split of a number that does not exist).
 *
 * @param totalCo2eq - Total biogas emissions (tCO2e, ≥ 0).
 * @param config - A resolved {@link BiogasFossilConfig} (default = fully biogenic).
 * @returns Frozen {@link BiogasEmissionsPartition}, or `null` when semDado.
 */
export function partitionBiogasEmissions(
    totalCo2eq: number,
    config: BiogasFossilConfig = DEFAULT_BIOGAS_FOSSIL_CONFIG,
): BiogasEmissionsPartition | null {
    if (!isFiniteNumber(totalCo2eq) || totalCo2eq < 0) return null;
    const fossilFraction = inBand(config?.fossilFraction)
        ? config.fossilFraction
        : DEFAULT_BIOGAS_FOSSIL_FRACTION;
    const fossil = totalCo2eq * fossilFraction;
    const biogenic = totalCo2eq - fossil;
    return Object.freeze({ total: totalCo2eq, fossil, biogenic, fossilFraction });
}
