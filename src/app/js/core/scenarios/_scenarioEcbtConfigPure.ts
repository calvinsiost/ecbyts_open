// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Curated, versioned ECBT parameters for the scenario impact engine (CFG-24).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2.4.7 CFG-24, NOT N9).
 *
 * ─── The point (Calvin 2026-07-08) ───
 * The ECBT confidence weight `kappa` and the ECBT `mode` were HARDCODED
 * (`kappa: 1, mode: 'absolute'`) inside the engine's ERP→ECBT chain. CFG-24
 * turns them into parameters that come from a CURATED, VERSIONED admin config
 * layer — NOT a free-text input in the end-user UI (NOT N9). This module is that
 * layer:
 *
 *   - {@link DEFAULT_ECBT_SCENARIO_CONFIG}: the frozen default whose values
 *     REPRODUCE the current behaviour exactly (kappa=1, mode='absolute'). Anyone
 *     who does not curate anything sees precisely what they see today — zero
 *     regression (guard-rail §2.4.0-2).
 *   - {@link resolveEcbtScenarioConfig}: validates a curated partial override
 *     against the defaults. kappa is clamped to the [0,1] confidence band; mode
 *     is accepted only if it is one of the curated {@link Mode} options (never a
 *     free string). Anything invalid falls back to the default — configurability
 *     is "choose among curated options + adjust within validated ranges", never a
 *     blank slate (guard-rail §2.4.0-1, NOT N8).
 *
 * ─── Where curated config lives (NOT a new Supabase table) ───
 * These parameters are metodologia — curated and versioned by admin, not written
 * by the end user. This module holds the versioned DEFAULT in code (the source of
 * truth for the current version); an admin-curated override is passed in as a
 * plain partial object (e.g. loaded from a future versioned config artifact) and
 * validated here before it can reach the score. We deliberately do NOT invent a
 * Supabase table for this in this phase (N7 keeps scenarios out of the DB); the
 * versioned config is a frozen, code-owned object carrying a `version` tag so a
 * change to kappa/mode is auditable as a version bump.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returned objects are frozen.
 */

import type { Mode } from '../ecbtScore/_ecbtScorePure.js';

/** The curated set of ECBT modes an admin may select (mirrors {@link Mode}). */
const CURATED_MODES: ReadonlyArray<Mode> = Object.freeze([
    'marketIntensity',
    'returnOnCost',
    'extension',
    'absolute',
]);

/**
 * Curated, versioned ECBT parameters the scenario engine feeds to
 * `computeEcbtScore`. Only the pieces CFG-24 makes configurable live here — the
 * rest of the ECBT algebra stays fixed (candor N6 / NOT N9).
 */
export interface EcbtScenarioConfig {
    /**
     * ECBT confidence weight κ (band widener). Clamped to [0,1]. κ never moves
     * `amount`; it only widens the uncertainty band (anti-N2 — see
     * `bandWidenerFromKappa`). Default 1 (no widening) reproduces today.
     */
    readonly kappa: number;
    /**
     * ECBT normalisation mode. One of the curated {@link Mode} options. Default
     * 'absolute' (V_net only, no denominator) reproduces today.
     */
    readonly mode: Mode;
    /**
     * Version tag of the curated config. Bumping this is the audit trail for a
     * change to kappa/mode (admin-curated, versioned — NOT N9). Default 1.
     */
    readonly version: number;
}

/**
 * The default curated config. Values chosen to REPRODUCE the pre-CFG-24
 * behaviour byte-for-byte: kappa=1 (band widener ×1), mode='absolute'. Frozen.
 */
export const DEFAULT_ECBT_SCENARIO_CONFIG: EcbtScenarioConfig = Object.freeze({
    kappa: 1,
    mode: 'absolute' as Mode,
    version: 1,
});

/** Partial curated override an admin may supply (any subset of the fields). */
export interface EcbtScenarioConfigOverride {
    readonly kappa?: number;
    readonly mode?: Mode;
    readonly version?: number;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/** Clamp a value into the [0,1] confidence band (invalid → default kappa). */
function clampKappa(v: unknown): number {
    if (!isFiniteNumber(v)) return DEFAULT_ECBT_SCENARIO_CONFIG.kappa;
    if (v < 0) return 0;
    if (v > 1) return 1;
    return v;
}

/** Accept a mode only if it is one of the curated options (else the default). */
function resolveMode(v: unknown): Mode {
    return CURATED_MODES.includes(v as Mode) ? (v as Mode) : DEFAULT_ECBT_SCENARIO_CONFIG.mode;
}

/**
 * Resolve a curated ECBT config from an optional admin-curated partial override,
 * validated against {@link DEFAULT_ECBT_SCENARIO_CONFIG}. kappa is clamped to
 * [0,1]; mode must be a curated option; anything else falls back to the default
 * (never a blank slate — NOT N8). Passing nothing returns the default (current
 * behaviour, zero regression).
 *
 * @param override? - Admin-curated partial (e.g. from a versioned config artifact).
 * @returns A frozen {@link EcbtScenarioConfig} safe to feed to `computeEcbtScore`.
 */
export function resolveEcbtScenarioConfig(
    override?: EcbtScenarioConfigOverride | null,
): EcbtScenarioConfig {
    if (!override || typeof override !== 'object') {
        return DEFAULT_ECBT_SCENARIO_CONFIG;
    }
    return Object.freeze({
        kappa: clampKappa(override.kappa),
        mode: resolveMode(override.mode),
        version: isFiniteNumber(override.version)
            ? override.version
            : DEFAULT_ECBT_SCENARIO_CONFIG.version,
    });
}
