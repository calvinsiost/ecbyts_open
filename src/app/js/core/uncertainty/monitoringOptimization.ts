// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

type OptimizationWeights = { w_info: number; w_cost: number; w_risk: number };

const DEFAULT_WEIGHTS = Object.freeze({
    w_info: 0.5,
    w_cost: 0.3,
    w_risk: 0.2,
});

/**
 * Clamp a value to [0, 1].
 */
function clamp01(v: any): number {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
}

/**
 * Score a single candidate given the optimization weights.
 */
function scoreCandidate(candidate: any, weights: OptimizationWeights): number {
    const info = clamp01(Number(candidate?.infoGain));
    const cost = clamp01(Number(candidate?.normalizedCost));
    const risk = clamp01(Number(candidate?.residualRisk));
    return weights.w_info * info - weights.w_cost * cost - weights.w_risk * risk;
}

/**
 * Compute the total objective value J for a set of selected candidates.
 * J = sum(score) - we maximise this.
 */
function computeObjective(selectedCandidates: any[]): number {
    return selectedCandidates.reduce((sum, c) => sum + (Number.isFinite(c.score) ? c.score : 0), 0);
}

/**
 * Greedy selection pass: pick highest-score candidates that fit within budget.
 * @param scored  - candidates already decorated with .score
 */
function greedySelect(scored: any[], budget: number): { selected: any[]; spent: number } {
    // Sort descending by score, tie-break by id for determinism
    const ordered = [...scored].sort((a, b) => {
        const diff = b.score - a.score;
        if (diff !== 0) return diff;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });

    let spent = 0;
    const selected: any[] = [];
    for (const candidate of ordered) {
        const cost = Number(candidate?.cost || 0);
        if (!Number.isFinite(cost) || cost < 0) continue;
        if (spent + cost > budget) continue;
        selected.push(candidate);
        spent += cost;
    }
    return { selected, spent };
}

/**
 * Local-search improvement: try swapping each selected candidate with each
 * non-selected one; accept the swap when it strictly improves J without
 * violating the budget constraint.
 */
function localSearchImprove(
    selected: any[],
    notSelected: any[],
    budget: number,
    maxIterations: number,
    noImprovementWindow: number,
): { selected: any[]; spent: number; iterations: number } {
    let current = [...selected];
    let currentCost = current.reduce((s, c) => s + Number(c.cost || 0), 0);
    let currentJ = computeObjective(current);

    let iterations = 0;
    let stagnant = 0;

    outer: for (let iter = 0; iter < maxIterations; iter++) {
        iterations++;
        let improved = false;

        for (let si = 0; si < current.length; si++) {
            for (let ni = 0; ni < notSelected.length; ni++) {
                const outCandidate = current[si];
                const inCandidate = notSelected[ni];

                const newCost = currentCost - Number(outCandidate.cost || 0) + Number(inCandidate.cost || 0);
                if (newCost > budget) continue;

                const newSelected = [...current];
                newSelected[si] = inCandidate;
                const newJ = computeObjective(newSelected);

                if (newJ > currentJ + 1e-12) {
                    // Accept swap
                    notSelected = [...notSelected];
                    notSelected[ni] = outCandidate;
                    current = newSelected;
                    currentCost = newCost;
                    currentJ = newJ;
                    improved = true;
                    stagnant = 0;
                    break;
                }
            }
            if (improved) continue outer;
        }

        if (!improved) {
            stagnant++;
            if (stagnant >= noImprovementWindow) break;
        }
    }

    return {
        selected: current,
        spent: currentCost,
        iterations,
    };
}

/**
 * Optimize a monitoring plan using a greedy pass followed by local-search
 * improvement.
 */
export function optimizeMonitoringPlan(payload: any = {}): any {
    const seed = Number(payload?.seed);
    if (!Number.isInteger(seed)) {
        return {
            ok: false,
            infeasible: true,
            reason: 'missing_seed',
        };
    }

    const budget = Number(payload?.constraints?.budget ?? 1);
    const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
    const weights = { ...DEFAULT_WEIGHTS, ...(payload?.weights || {}) };
    const maxIterations = Number(payload?.maxIterations ?? 100);
    const noImprovementWindow = Number(payload?.noImprovementWindow ?? 10);

    // Decorate each candidate with a score
    const scored = candidates.map((c: any) => ({
        ...c,
        score: scoreCandidate(c as any, weights),
    }));

    // 1. Greedy pass
    const { selected: greedySelected } = greedySelect(scored, budget);

    if (!greedySelected.length && scored.length) {
        return {
            ok: false,
            infeasible: true,
            reason: 'budget_constraint',
            seed,
            weights,
            constraints: payload?.constraints || {},
        };
    }

    // 2. Local-search improvement
    const selectedIds = new Set(greedySelected.map((c) => c.id));
    const notSelected = scored.filter((c: any) => !selectedIds.has((c as any).id));

    const { selected, spent, iterations } = localSearchImprove(
        greedySelected,
        notSelected,
        budget,
        maxIterations,
        noImprovementWindow,
    );

    return {
        ok: true,
        infeasible: false,
        seed,
        weights,
        constraints: payload?.constraints || {},
        selected,
        spent,
        iterations,
    };
}

/**
 * Optimize sampling frequency for an existing monitoring network within a
 * total frequency-cost budget.
 *
 * Each station is assigned a `recommendedFrequency` between its min and max
 * using a greedy score/cost approach.
 *
 * @param network  - [{id, currentFrequency, infoGain, cost, minFrequency, maxFrequency}]
 */
export function optimizeFrequency(network: any[], opts: any = {}): any {
    if (!Array.isArray(network)) {
        return { ok: false, reason: 'invalid_network' };
    }

    const budget = Number(opts?.budget ?? 1);
    const weights = { ...DEFAULT_WEIGHTS, ...(opts?.weights || {}) };
    const seed = Number(opts?.seed ?? 0);

    // Build station records with base score
    const stations = network.map((s) => {
        const infoGain = clamp01(Number(s?.infoGain ?? 0));
        const cost = Math.max(0, Number(s?.cost ?? 0));
        const minFreq = Math.max(1, Number(s?.minFrequency ?? 1));
        const maxFreq = Math.max(minFreq, Number(s?.maxFrequency ?? minFreq));
        const baseScore =
            weights.w_info * infoGain -
            weights.w_cost * clamp01(cost) -
            weights.w_risk * clamp01(Number(s?.residualRisk ?? 0));
        return { ...s, _cost: cost, _minFreq: minFreq, _maxFreq: maxFreq, _baseScore: baseScore };
    });

    // Sort descending by score/cost ratio (avoid division by zero)
    stations.sort((a, b) => {
        const ra = a._cost > 0 ? a._baseScore / a._cost : a._baseScore * 1e6;
        const rb = b._cost > 0 ? b._baseScore / b._cost : b._baseScore * 1e6;
        const diff = rb - ra;
        if (diff !== 0) return diff;
        return String(a.id || '').localeCompare(String(b.id || ''));
    });

    let remaining = budget;
    const selected: any[] = [];

    for (const station of stations) {
        // Assign from minFrequency up to maxFrequency within remaining budget
        const costPerUnit = station._cost;
        const minRequired = station._minFreq * costPerUnit;
        if (minRequired > remaining) continue; // Can't afford even minimum

        const affordableMax = costPerUnit > 0 ? Math.floor(remaining / costPerUnit) : station._maxFreq;
        const recFreq = Math.min(station._maxFreq, affordableMax);
        const actualFreq = Math.max(station._minFreq, recFreq);
        const totalCostForStation = actualFreq * costPerUnit;

        if (totalCostForStation > remaining) continue;

        const deltaFrequency = actualFreq - Number(station?.currentFrequency ?? 0);
        const score = station._baseScore + weights.w_info * clamp01(actualFreq / Math.max(1, station._maxFreq));

        selected.push({
            id: station.id,
            recommendedFrequency: actualFreq,
            deltaFrequency,
            score,
        });
        remaining -= totalCostForStation;
    }

    const totalCost = budget - remaining;

    return {
        ok: true,
        seed,
        selected,
        totalCost,
    };
}

/**
 * Sensitivity analysis: run `optimizeMonitoringPlan` across combinations of
 * parameter variations and report whether the top-3 candidates are stable.
 *
 * @param payload  - base payload for `optimizeMonitoringPlan`
 * @param paramVariations  - {budget: number[], riskTolerance: number[]}
 */
export function sensitivityAnalysis(payload: any, paramVariations: any = {}): { results: any[]; stable: boolean } {
    const budgets = Array.isArray(paramVariations?.budget) ? paramVariations.budget : [1.0];
    const riskTolerances = Array.isArray(paramVariations?.riskTolerance) ? paramVariations.riskTolerance : [0.2];

    const baseConstraints = payload?.constraints || {};
    const baseBudget = Number(baseConstraints?.budget ?? 1);
    const results: any[] = [];

    for (const bFactor of budgets) {
        for (const rt of riskTolerances) {
            const scaledBudget = baseBudget * Number(bFactor);
            const modifiedPayload = {
                ...payload,
                constraints: { ...baseConstraints, budget: scaledBudget },
                weights: {
                    ...DEFAULT_WEIGHTS,
                    ...(payload?.weights || {}),
                    w_risk: clamp01(Number(rt)),
                },
            };
            const result = optimizeMonitoringPlan(modifiedPayload);
            results.push({
                params: { budgetFactor: bFactor, riskTolerance: rt, budget: scaledBudget },
                selected_count: result.ok ? result.selected.length : 0,
                spent: result.ok ? result.spent : 0,
                ok: result.ok,
                infeasible: result.infeasible,
                selected_ids: result.ok ? result.selected.map((c: any) => c.id) : [],
            });
        }
    }

    // Stable = same top-3 candidate IDs across all successful runs
    const successfulRuns = results.filter((r) => r.ok);
    let stable = false;
    if (successfulRuns.length > 0) {
        const top3Set = (ids: string[]) => ids.slice(0, 3).sort().join(',');
        const ref = top3Set(successfulRuns[0].selected_ids);
        stable = successfulRuns.every((r) => top3Set(r.selected_ids) === ref);
    }

    return { results, stable };
}

/**
 * Compare a baseline monitoring plan result against an optimized one.
 *
 * @param baseline  - result from `optimizeMonitoringPlan`
 * @param optimized  - result from `optimizeMonitoringPlan`
 */
export function compareScenarios(
    baseline: any,
    optimized: any,
): {
    added: string[];
    removed: string[];
    kept: string[];
    costDelta: number;
    countDelta: number;
    summary: string;
} {
    const baseIds: Set<string> = new Set(
        baseline?.ok ? baseline.selected.map((c: any) => String(c.id)) : [],
    );
    const optIds: Set<string> = new Set(
        optimized?.ok ? optimized.selected.map((c: any) => String(c.id)) : [],
    );

    const added = [...optIds].filter((id) => !baseIds.has(id));
    const removed = [...baseIds].filter((id) => !optIds.has(id));
    const kept = [...baseIds].filter((id) => optIds.has(id));

    const baseCost = baseline?.ok ? Number(baseline.spent ?? 0) : 0;
    const optCost = optimized?.ok ? Number(optimized.spent ?? 0) : 0;
    const costDelta = optCost - baseCost;
    const countDelta = optIds.size - baseIds.size;

    const parts = [];
    if (added.length) parts.push(`added ${added.length} (${added.join(', ')})`);
    if (removed.length) parts.push(`removed ${removed.length} (${removed.join(', ')})`);
    if (kept.length) parts.push(`kept ${kept.length}`);
    const summary = parts.length
        ? `Optimized vs baseline: ${parts.join('; ')}. Cost delta: ${costDelta.toFixed(2)}.`
        : 'No change between scenarios.';

    return { added, removed, kept, costDelta, countDelta, summary };
}

/**
 * Build a JSON-serializable evidence object from an optimization result,
 * suitable for audit trails and recommendation exports.
 *
 * @param result  - result from `optimizeMonitoringPlan`
 */
export function buildRecommendationEvidence(result: any): object {
    return {
        schema_version: '1.0',
        timestamp: new Date().toISOString(),
        seed: result?.seed ?? null,
        weights: result?.weights ?? null,
        constraints: result?.constraints ?? null,
        selected_ids: result?.ok ? result.selected.map((c: any) => c.id) : [],
        infeasible: result?.infeasible ?? true,
        spent: result?.ok ? result.spent : null,
        iterations: result?.iterations ?? null,
    };
}
