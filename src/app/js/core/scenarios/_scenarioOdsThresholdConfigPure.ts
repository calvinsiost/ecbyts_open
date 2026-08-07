// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Curated, versioned per-ODS signal thresholds for the scenario impact engine
 * (CFG-32). SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md
 * (§2.4.8 CFG-32, NOT N9). Same curated/versioned philosophy as CFG-24
 * ({@link ./_scenarioOdsThresholdConfigPure} mirrors `_scenarioEcbtConfigPure`).
 *
 * ─── The point (Calvin 2026-07-08) ───
 * The comparator sinal ('melhora' | 'piora' | 'neutro') derived from a measurer
 * impact was decided by HARDCODED thresholds inside the engine's
 * `sinalFromImpact` (`impact >= 0.6 → melhora`, `impact <= 0.4 → piora`). Those
 * mid-band cutoffs were the SAME for every ODS. CFG-32 turns them into
 * parameters that:
 *
 *   - are configurable PER ODS INDICATOR — the water goal (ODS 6) may use a
 *     stricter/looser cutoff than the climate goal (ODS 13), because a healthy
 *     effluent load and a healthy emissions intensity live on different scales;
 *   - are CURATED and VERSIONED by admin (metodologia), NOT a free-text input in
 *     the end-user UI (NOT N9);
 *   - keep the current 0.6/0.4 as the DEFAULT for every goal, so anyone who does
 *     not curate anything sees exactly today's behaviour — zero regression
 *     (guard-rail §2.4.0-2).
 *
 * ─── Where curated config lives (NOT a new Supabase table) ───
 * Like CFG-24, these thresholds are curated and versioned in code, not written
 * by the end user and not stored in a new DB table (N7 keeps scenarios out of
 * the DB). The versioned DEFAULT lives here as a frozen, code-owned object; an
 * admin-curated per-goal override is passed in as a plain partial object (e.g.
 * loaded from a future versioned config artifact) and validated here before it
 * can reach {@link sinalFromThreshold}. A change to any goal's thresholds is
 * auditable as a `version` bump.
 *
 * ─── Validation (configurability ≠ blank slate, NOT N8) ───
 * A curated per-goal override is accepted only when its `melhora`/`piora` cutoffs
 * are finite numbers inside the impact band [0,1] AND keep the invariant
 * `piora <= melhora` (a 'melhora' cutoff must not sit below the 'piora' cutoff —
 * otherwise the neutral band would invert). Any goal whose override is invalid or
 * absent falls back to the {@link DEFAULT_ODS_THRESHOLD} pair. Keys outside the
 * ODS id range 1..17 are ignored.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

/** The signal comparator produces one of these three states. */
export type OdsSinal = 'melhora' | 'piora' | 'neutro';

/**
 * A single curated threshold pair for one ODS goal. `impact >= melhora` reads as
 * an improvement; `impact <= piora` reads as a worsening; the band in between is
 * neutral. Both are in the impact band [0,1] with `piora <= melhora`.
 */
export interface OdsSignalThreshold {
    /** Impact at/above which the sinal is 'melhora'. Default 0.6. */
    readonly melhora: number;
    /** Impact at/below which the sinal is 'piora'. Default 0.4. */
    readonly piora: number;
}

/**
 * The default curated threshold pair. Values chosen to REPRODUCE the pre-CFG-32
 * hardcode byte-for-byte: melhora at 0.6, piora at 0.4. Frozen.
 */
export const DEFAULT_ODS_THRESHOLD: OdsSignalThreshold = Object.freeze({
    melhora: 0.6,
    piora: 0.4,
});

/**
 * Curated, versioned per-goal signal thresholds. `byGoal` maps an ODS id (1..17)
 * to its curated {@link OdsSignalThreshold}; any goal absent from the map uses
 * {@link DEFAULT_ODS_THRESHOLD}. Only the cutoffs CFG-32 makes configurable live
 * here — the neutral-in-between rule stays fixed (NOT N9).
 */
export interface OdsThresholdConfig {
    /** Per-ODS-goal curated thresholds (id 1..17 → pair). Frozen. */
    readonly byGoal: Readonly<Record<number, OdsSignalThreshold>>;
    /**
     * Version tag of the curated config. Bumping this is the audit trail for a
     * change to any goal's thresholds (admin-curated, versioned — NOT N9).
     * Default 1.
     */
    readonly version: number;
}

/**
 * The default curated config: empty `byGoal` (every goal resolves to the frozen
 * {@link DEFAULT_ODS_THRESHOLD}), version 1. Reproduces today's behaviour with
 * zero regression. Frozen.
 */
export const DEFAULT_ODS_THRESHOLD_CONFIG: OdsThresholdConfig = Object.freeze({
    byGoal: Object.freeze({}) as Readonly<Record<number, OdsSignalThreshold>>,
    version: 1,
});

/** Partial curated override an admin may supply (any subset of goals). */
export interface OdsThresholdConfigOverride {
    /** Per-goal partial threshold overrides (id → partial pair). */
    readonly byGoal?: Readonly<Record<number, Partial<OdsSignalThreshold>>> | null;
    readonly version?: number;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** True iff `v` is a finite number inside the impact band [0,1]. */
function inBand(v: unknown): v is number {
    return isFiniteNumber(v) && v >= 0 && v <= 1;
}

function isValidGoalId(v: unknown): v is number {
    return isFiniteNumber(v) && Number.isInteger(v) && v >= 1 && v <= 17;
}

/**
 * Resolve ONE curated threshold pair from a partial override, validated against
 * {@link DEFAULT_ODS_THRESHOLD}. `melhora`/`piora` are accepted only when both
 * (after applying the override on top of the default) are inside [0,1] AND keep
 * `piora <= melhora`; otherwise the whole pair falls back to the default (never a
 * blank slate — NOT N8). Frozen.
 */
function resolveThresholdPair(
    partial: Partial<OdsSignalThreshold> | null | undefined,
): OdsSignalThreshold {
    if (!partial || typeof partial !== 'object') return DEFAULT_ODS_THRESHOLD;
    const melhora = inBand(partial.melhora) ? partial.melhora : DEFAULT_ODS_THRESHOLD.melhora;
    const piora = inBand(partial.piora) ? partial.piora : DEFAULT_ODS_THRESHOLD.piora;
    // Invariant: the improvement cutoff must not sit below the worsening cutoff,
    // otherwise the neutral band inverts. If the curated pair violates it, the
    // whole pair is rejected back to the default (candor over silent nonsense).
    if (piora > melhora) return DEFAULT_ODS_THRESHOLD;
    return Object.freeze({ melhora, piora });
}

/**
 * Resolve a curated ODS threshold config from an optional admin-curated partial
 * override, validated against {@link DEFAULT_ODS_THRESHOLD_CONFIG}. Each goal's
 * pair is validated independently (see {@link resolveThresholdPair}); invalid or
 * out-of-range goal keys are dropped. Passing nothing returns the default config
 * (current behaviour, zero regression).
 *
 * @param override? - Admin-curated partial (e.g. from a versioned config artifact).
 * @returns A frozen {@link OdsThresholdConfig} safe to feed to the engine.
 */
export function resolveOdsThresholdConfig(
    override?: OdsThresholdConfigOverride | null,
): OdsThresholdConfig {
    if (!override || typeof override !== 'object') {
        return DEFAULT_ODS_THRESHOLD_CONFIG;
    }
    const byGoal: Record<number, OdsSignalThreshold> = {};
    const raw = override.byGoal;
    if (raw && typeof raw === 'object') {
        for (const key of Object.keys(raw)) {
            const goal = Number(key);
            if (!isValidGoalId(goal)) continue;
            const pair = resolveThresholdPair(raw[goal]);
            // Only record goals the admin actually curated to something distinct
            // from the default — an all-default goal stays implicit (empty map ==
            // today). This keeps the resolved config's byGoal minimal + auditable.
            if (pair.melhora !== DEFAULT_ODS_THRESHOLD.melhora || pair.piora !== DEFAULT_ODS_THRESHOLD.piora) {
                byGoal[goal] = pair;
            }
        }
    }
    return Object.freeze({
        byGoal: Object.freeze(byGoal) as Readonly<Record<number, OdsSignalThreshold>>,
        version: isFiniteNumber(override.version)
            ? override.version
            : DEFAULT_ODS_THRESHOLD_CONFIG.version,
    });
}

/**
 * Look up the curated threshold pair for one ODS goal, falling back to the frozen
 * {@link DEFAULT_ODS_THRESHOLD} when the goal was not curated.
 *
 * @param config - A resolved {@link OdsThresholdConfig}.
 * @param goal - The ODS id (1..17).
 * @returns The curated (or default) {@link OdsSignalThreshold} for that goal.
 */
export function thresholdForGoal(config: OdsThresholdConfig, goal: number): OdsSignalThreshold {
    const pair = config.byGoal[goal];
    return pair ?? DEFAULT_ODS_THRESHOLD;
}

/**
 * The single source of truth for turning an impact score into a comparator sinal
 * given a curated threshold pair. `impact >= melhora → 'melhora'`,
 * `impact <= piora → 'piora'`, else 'neutro'. A null impact reads 'semDado' at
 * the call site (this helper only decides the three measurable states).
 *
 * @param impact - Impact score in [0,1].
 * @param threshold - The curated {@link OdsSignalThreshold} for the goal.
 * @returns 'melhora' | 'piora' | 'neutro'.
 */
export function sinalFromThreshold(impact: number, threshold: OdsSignalThreshold): OdsSinal {
    if (impact >= threshold.melhora) return 'melhora';
    if (impact <= threshold.piora) return 'piora';
    return 'neutro';
}
