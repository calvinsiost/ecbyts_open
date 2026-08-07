// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Scenarios — panel VM adapter for the MULTI-scenario comparator (S3/CFG-07).
 * SPEC: docs/specs/features/SPEC_SCENARIOS_PROCESS_IMPACT.md (§2 F8/S3, §2.4.2 CFG-07/08).
 *
 * THE POINT: the DOM panel (`utils/ui/scenarios/scenarioComparatorPanel.ts`) now
 * holds a LIST of N scenario parameter-sets (each = subtype + 3 rates), the last
 * being the active/editable one driven by the sliders. This pure module bridges
 * that state to the published pure engine `buildMultiScenarioComparatorVM`
 * (Base + N columns) WITHOUT the panel having to touch the engine's validation
 * traps directly.
 *
 * Anti-crash contract (CFG-40): `computeRealScenarioMetrics` — and therefore
 * `buildMultiScenarioComparatorVM` — THROWS when a scenario's resulting rates are
 * physically incoherent (`yield > recoveryRate`). Because the user can now drag a
 * slider into an impossible combo on any of the N scenarios, this module
 * pre-screens every scenario with the non-throwing `validateRatesCrossRules` and
 * DROPS incoherent scenarios from the engine call, returning their diagnostics so
 * the UI can flag them honestly instead of the whole panel exploding.
 *
 * Pure — ZERO DOM, ZERO IO, deterministic. All returns frozen. This is only an
 * ADAPTER: no CAPEX/OPEX/ECBT/ODS formula lives here (anti-N4) — the engine owns
 * the algebra; we only decide which scenarios are safe to feed it and map params
 * to mutations.
 */

import { buildMultiScenarioComparatorVM } from './_multiScenarioVMPure.js';
import type { MultiScenarioComparatorVM } from './_multiScenarioVMPure.js';
import type { BaseProcess, ProcessMutation } from './_scenarioImpactEnginePure.js';
import { validateRatesCrossRules } from './_scenarioCrossValidationPure.js';

/** The universal per-scenario parameters the sliders expose. */
export interface ScenarioParamSet {
    readonly subtype: 'mining' | 'petroleum';
    readonly throughput: number;
    readonly recoveryRate: number;
    readonly yield: number;
}

/** One rejected scenario, kept for honest UI feedback (never silently dropped). */
export interface RejectedScenario {
    /** 1-based index of the scenario column it WOULD have occupied among inputs. */
    readonly inputIndex: number;
    /** Human label for the scenario ('Cenário {i}'). */
    readonly label: string;
    /** First cross-rule violation message (pt-BR, from the curated rules). */
    readonly message: string;
}

/** Result of adapting the panel state to the multi-scenario VM. */
export interface PanelMultiScenarioVM {
    /** The engine VM (Base + accepted scenario columns), never throws. */
    readonly vm: MultiScenarioComparatorVM;
    /** Scenarios excluded because their rates are physically incoherent (CFG-40). */
    readonly rejected: readonly RejectedScenario[];
    /** True iff the active (last) scenario was itself rejected. */
    readonly activeRejected: boolean;
}

/** Maps a scenario parameter-set to the engine mutation shape (subtype + 3 rates). */
export function paramSetToMutation(params: ScenarioParamSet): ProcessMutation {
    return Object.freeze({
        subtype: params.subtype,
        throughput: params.throughput,
        recoveryRate: params.recoveryRate,
        yield: params.yield,
    });
}

/** Derives the effective label for a scenario column ('Cenário {i}'). */
function scenarioLabel(oneBasedIndex: number): string {
    return `Cenário ${oneBasedIndex}`;
}

/**
 * Builds the multi-scenario VM for the panel from the base process and the list
 * of scenario parameter-sets. Physically-incoherent scenarios (yield >
 * recoveryRate, CFG-40) are pre-screened out with the non-throwing validator and
 * reported in `rejected`, so `buildMultiScenarioComparatorVM` is only ever called
 * with coherent mutations and NEVER throws from the panel.
 *
 * - Deterministic and pure: same inputs → same output; everything frozen.
 * - Column order is stable: accepted scenario `k` keeps its input order.
 * - Empty / all-rejected list ⇒ VM with only the Base column.
 * - The engine (anti-N4) still owns every number; this only filters + labels.
 *
 * @param base - The base process (never mutated).
 * @param scenarios - The N scenario parameter-sets (last = active/editable).
 * @returns Frozen `{ vm, rejected, activeRejected }`.
 */
export function buildPanelMultiScenarioVM(
    base: BaseProcess,
    scenarios: ReadonlyArray<ScenarioParamSet>,
): PanelMultiScenarioVM {
    const safeScenarios = Array.isArray(scenarios) ? scenarios : [];
    const lastIndex = safeScenarios.length - 1;

    const acceptedMutations: ProcessMutation[] = [];
    const acceptedLabels: string[] = [];
    const rejected: RejectedScenario[] = [];
    let activeRejected = false;

    safeScenarios.forEach((params, i) => {
        const violations = validateRatesCrossRules({
            throughput: params.throughput,
            recoveryRate: params.recoveryRate,
            yield: params.yield,
        });
        const label = scenarioLabel(i + 1);
        if (violations.length > 0) {
            rejected.push(
                Object.freeze({
                    inputIndex: i + 1,
                    label,
                    message: violations[0]!.message,
                }),
            );
            if (i === lastIndex) activeRejected = true;
            return;
        }
        acceptedMutations.push(paramSetToMutation(params));
        acceptedLabels.push(label);
    });

    const vm = buildMultiScenarioComparatorVM(base, acceptedMutations, {}, { labels: acceptedLabels });

    return Object.freeze({
        vm,
        rejected: Object.freeze(rejected) as readonly RejectedScenario[],
        activeRejected,
    });
}
