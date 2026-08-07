// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
/**
 * ARCH-SPLIT-HOMEGRID-001 — lógica PURA do merge de feature-flags do Actions V2.
 * claude (refactor) 2026-06-20.
 *
 * EN: Pure precedence-merge for the Actions-V2 feature flags. No DOM, no globals,
 *     no localStorage/window access. Mirrors the legacy inline
 *     `_resolveActionsFeatureFlags()` in homeGrid.ts EXACTLY:
 *       1. start from `defaults` (spread copy);
 *       2. if `persisted` is a non-null object, overlay ONLY the two stable shell
 *          controls (`shellKey`, `z4ContextKey`) — premium panels GRAPH/AI_PANEL
 *          are intentionally NOT taken from localStorage (legacy resilience: old
 *          persisted values may keep them false even after rollout);
 *       3. if `windowOverride` is a non-null object, overlay it WHOLESALE (full
 *          precedence — the runtime escape hatch).
 *     The barrel (`homeGrid.ts`) keeps the localStorage read + JSON.parse and the
 *     `window.__ECBYTS_FEATURE_FLAGS` read, plus the try/catch I/O, and feeds the
 *     already-parsed objects in — behaviour identical.
 *
 * PT (leigo): junta, sem mexer na tela nem ler armazenamento, as "chavinhas" de
 *     recurso (feature flags) do painel de ações em ordem de prioridade: primeiro
 *     o padrão; depois, do que ficou salvo no navegador, SÓ as duas chaves estáveis
 *     (o painel premium fica de fora de propósito); por último, um override de
 *     runtime (window) que sobrepõe tudo. É exatamente a mesma regra que estava
 *     embutida no homeGrid — agora isolada e testável.
 *
 * Pure: entradas → saída determinística, sem efeitos colaterais. Cheap tests:
 * tests/ui/homeGrid/feature-flags.test.mjs.
 */

/** A flag map: feature-key → boolean. Loosely typed to mirror the legacy `any`. */
export type FeatureFlagMap = Record<string, unknown>;

/** The two stable shell-control keys overlaid from persisted (localStorage) state. */
export interface StableFeatureKeys {
    readonly shellKey: string;
    readonly z4ContextKey: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

/**
 * Merge Actions-V2 feature flags by precedence: defaults < persisted (stable keys
 * only) < window override (wholesale).
 *
 * Byte-identical to the legacy inline `_resolveActionsFeatureFlags`.
 *
 * @param params.defaults       the frozen default flags (always the base)
 * @param params.stableKeys     the two shell-control keys taken from `persisted`
 * @param params.persisted      the already-parsed localStorage value (or null)
 * @param params.windowOverride the runtime `window.__ECBYTS_FEATURE_FLAGS` (or null)
 * @returns a fresh merged flag map (never mutates the inputs)
 */
export function mergeActionsFeatureFlags(params: {
    defaults: FeatureFlagMap;
    stableKeys: StableFeatureKeys;
    persisted?: unknown;
    windowOverride?: unknown;
}): FeatureFlagMap {
    const { defaults, stableKeys, persisted, windowOverride } = params;
    let flags: FeatureFlagMap = { ...defaults };

    if (isPlainObject(persisted)) {
        // Legacy resilience: only the stable shell controls are honoured from
        // persisted state; premium panels are controlled by capability.
        const safeParsed: FeatureFlagMap = {
            [stableKeys.shellKey]: persisted[stableKeys.shellKey],
            [stableKeys.z4ContextKey]: persisted[stableKeys.z4ContextKey],
        };
        flags = { ...flags, ...safeParsed };
    }

    if (isPlainObject(windowOverride)) {
        flags = { ...flags, ...windowOverride };
    }

    return flags;
}
