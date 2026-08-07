// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

// SPEC_UI_REUSE_OPTIMIZATION_PROGRAM Tier A — scenarioSimulation.ts #9 monolito.
// Pure-logic extraction from src/app/js/utils/handlers/scenarioSimulation.ts (2248L).
//
// Read from canonical TS source per memory/feedback_read_ts_canonical_not_js_derived.md.
// TS-MIGRATION-001 phase 2 — apenas .ts no commit.
//
// Hand-authored R1-safe. Complementa _scenarioSimulationPure.ts existente
// (3 exports: isGhgScenarioProfile + getScenarioLabels + calculateStabilityMetrics).
//
// Spec NOT:
// - NÃO ler DOM (caller monta inputs)
// - NÃO ler localStorage direto (caller persiste via builder)
// - NÃO emoji
//
// Extracted helpers:
//   - SIM_WEIGHTS_STORAGE_KEY            (frozen 'ecbyts:simWeights')
//   - DEFAULT_SIM_WEIGHTS                (frozen 5 weights sum=100)
//   - normalizeParamValue                (meta + raw → clamp+round+checkbox-aware)
//   - normalizeWeightsFromRaw            (parseFloat + isNaN filter)
//   - mergeWithDefaultWeights            (partial → full weights merge)
//   - validateWeightsSum                 (sum→0 fallback to defaults)

export interface ParamMeta {
    key: string;
    type?: 'checkbox' | 'number' | 'integer' | string;
    integer?: boolean;
    min?: number | string;
    max?: number | string;
}

export interface SimWeights {
    compliance: number;
    noFailure: number;
    costEfficiency: number;
    health: number;
    speed: number;
}

/** Frozen storage key for sim weights persistence. */
export const SIM_WEIGHTS_STORAGE_KEY = 'ecbyts:simWeights';

/**
 * Frozen default weights (sum=100).
 * Used as fallback when localStorage missing/corrupt OR when user-supplied
 * weights sum to 0 (would make scoring trivially 0).
 */
export const DEFAULT_SIM_WEIGHTS: Readonly<SimWeights> = Object.freeze({
    compliance: 30,
    noFailure: 20,
    costEfficiency: 20,
    health: 15,
    speed: 15,
});

/**
 * Normalize a raw param value against its meta definition.
 *
 * Rules (matches _normalizeParamValue @ scenarioSimulation.ts:1034):
 *   - meta.type === 'checkbox' → !!value (boolean coercion)
 *   - else: Number(value); non-finite → null
 *   - meta.integer === true   → Math.round
 *   - meta.min defined         → Math.max(num, meta.min)
 *   - meta.max defined         → Math.min(num, meta.max)
 *
 * Caller can ship the same meta dict to UI rendering + validation.
 */
export function normalizeParamValue(meta: ParamMeta | null | undefined, value: unknown): number | boolean | null {
    if (!meta || typeof meta !== 'object') return null;
    if (meta.type === 'checkbox') return !!value;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    let result = meta.integer ? Math.round(num) : num;
    if (meta.min !== undefined) {
        const minN = Number(meta.min);
        if (Number.isFinite(minN)) result = Math.max(result, minN);
    }
    if (meta.max !== undefined) {
        const maxN = Number(meta.max);
        if (Number.isFinite(maxN)) result = Math.min(result, maxN);
    }
    return result;
}

/**
 * Parse a string-keyed weights object from string/unknown input.
 * Non-numeric or NaN values are filtered out.
 *
 * Caller (was _readWeightsFromModal) reads from inputs e.g.
 *   { compliance: '30', speed: 'abc', health: '15' }
 * → { compliance: 30, health: 15 } (speed dropped)
 */
export function normalizeWeightsFromRaw(raw: Record<string, unknown> | null | undefined): Partial<SimWeights> {
    if (!raw || typeof raw !== 'object') return {};
    const out: Record<string, number> = {};
    for (const k of Object.keys(DEFAULT_SIM_WEIGHTS)) {
        const v = parseFloat(String((raw as Record<string, unknown>)[k]));
        if (!Number.isNaN(v) && Number.isFinite(v)) {
            out[k] = v;
        }
    }
    return out as Partial<SimWeights>;
}

/**
 * Merge partial user-supplied weights on top of DEFAULT_SIM_WEIGHTS.
 *   - Missing keys → default value
 *   - Sum check: if final sum is 0 (user zeroed everything) → return clone of defaults
 */
export function mergeWithDefaultWeights(partial: Partial<SimWeights> | null | undefined): SimWeights {
    const merged = { ...DEFAULT_SIM_WEIGHTS, ...(partial || {}) };
    return validateWeightsSum(merged);
}

/**
 * Validate weights sum. If total === 0, return clone of defaults (avoid
 * trivial score=0 for all scenarios). Otherwise return input unchanged.
 *
 * Matches policy in _readWeightsFromModal @ scenarioSimulation.ts:56-72.
 */
export function validateWeightsSum(weights: SimWeights | Partial<SimWeights>): SimWeights {
    const compliance = Number((weights as SimWeights).compliance ?? DEFAULT_SIM_WEIGHTS.compliance);
    const noFailure = Number((weights as SimWeights).noFailure ?? DEFAULT_SIM_WEIGHTS.noFailure);
    const costEfficiency = Number((weights as SimWeights).costEfficiency ?? DEFAULT_SIM_WEIGHTS.costEfficiency);
    const health = Number((weights as SimWeights).health ?? DEFAULT_SIM_WEIGHTS.health);
    const speed = Number((weights as SimWeights).speed ?? DEFAULT_SIM_WEIGHTS.speed);
    const sum = compliance + noFailure + costEfficiency + health + speed;
    if (!Number.isFinite(sum) || sum === 0) {
        return { ...DEFAULT_SIM_WEIGHTS };
    }
    return { compliance, noFailure, costEfficiency, health, speed };
}

/**
 * Parse a JSON string from localStorage to a SimWeights object.
 * Defensive: empty string / invalid JSON → returns defaults clone.
 *
 * Used by callers to load persisted weights without try/catch boilerplate.
 */
export function parseSimWeightsFromJson(json: string | null | undefined): SimWeights {
    if (typeof json !== 'string' || !json) return { ...DEFAULT_SIM_WEIGHTS };
    try {
        const parsed = JSON.parse(json);
        return mergeWithDefaultWeights(parsed);
    } catch (e) {
        console.debug('[scenarioParamsPure:parseJson]', (e as Error)?.message || e);
        return { ...DEFAULT_SIM_WEIGHTS };
    }
}
