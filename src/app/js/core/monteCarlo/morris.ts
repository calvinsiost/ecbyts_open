// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/* ================================================================
   Monte Carlo — Morris elementary effects (screening sensitivity).

   Global, derivative-based screening method to rank input factors by
   their influence on a model output at a fraction of the cost of a
   full variance decomposition (Sobol). For each factor i, "elementary
   effects" (EE) are sampled along one-at-a-time (OAT) trajectories and
   summarised by:

     - mu      = mean(EE_i)            overall influence (with sign)
     - mu_star = mean(|EE_i|)          overall influence magnitude
     - sigma   = std(EE_i)             non-linearity / interaction

   Interpretation (Morris 1991; Campolongo et al. 2007):
     - high mu_star, low sigma   → important, ~linear, additive
     - high mu_star, high sigma  → important, non-linear or interacting
     - low  mu_star              → negligible factor (can be screened out)

   Design: p-level grid on the unit hypercube with step Δ = p/(2(p-1)),
   which makes the OAT design (approximately) equiprobable for even p
   (Morris 1991, §3). r trajectories are sampled; each trajectory yields
   one EE per factor, so r EEs per factor and r*(d+1) model evaluations.
   Factor values are mapped from the unit grid to each variable's
   [min,max] support (uniform marginals).

   Elementary effect along a trajectory step in factor i:
     EE_i = ( y(x + Δ·e_i·support_i) - y(x) ) / Δ
   (computed on the original variable scale, so units are dY/dX_i.)

   References:
     - Morris, M.D. (1991). "Factorial Sampling Plans for Preliminary
       Computational Experiments". Technometrics 33(2):161-174.
       DOI:10.1080/00401706.1991.10484804
     - Campolongo, F., Cariboni, J., Saltelli, A. (2007). "An effective
       screening design for sensitivity analysis of large models".
       Environmental Modelling & Software 22(10):1509-1518.
       DOI:10.1016/j.envsoft.2006.10.004 (introduces mu_star)
   ================================================================ */

/** Minimal seeded PRNG (mulberry32) — reproducible, no Math.random. */
function _mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export interface MorrisVariable {
    /** Stable identifier; used as the key in the result maps and model sample. */
    id: string;
    /** Lower bound of the (uniform) support. */
    min: number;
    /** Upper bound of the (uniform) support. */
    max: number;
}

export interface MorrisConfig {
    variables: MorrisVariable[];
    /** Scalar model: receives { [id]: value } and returns a number (or {y}). */
    model: (sample: Record<string, number>) => number | Record<string, number>;
    /** Number of trajectories r (replicates per factor). Default 10. */
    trajectories?: number;
    /** Number of grid levels p (>= 2, even recommended). Default 4. */
    levels?: number;
    /** PRNG seed for reproducibility. Default 101. */
    seed?: number;
}

export interface MorrisFactorResult {
    /** Mean elementary effect (signed) — direction of influence. */
    mu: number;
    /** Mean absolute elementary effect (Campolongo 2007) — influence magnitude. */
    mu_star: number;
    /** Std-dev of elementary effects — non-linearity / interaction. */
    sigma: number;
}

export interface MorrisResult {
    /** Per-factor screening statistics, keyed by variable id. */
    effects: Record<string, MorrisFactorResult>;
    /** Variable ids sorted by mu_star descending (most influential first). */
    ranking: string[];
    /** Total number of model evaluations: trajectories * (d + 1). */
    n_evaluations: number;
    /** Echo of the design used. */
    design: { trajectories: number; levels: number; delta: number };
}

/** Population mean. */
function _mean(xs: number[]): number {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[i]!;
    return xs.length ? s / xs.length : 0;
}

/** Population standard deviation (Morris uses the sample SD over r effects). */
function _std(xs: number[]): number {
    const n = xs.length;
    if (n < 2) return 0;
    const m = _mean(xs);
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const dd = xs[i]! - m;
        acc += dd * dd;
    }
    return Math.sqrt(acc / (n - 1));
}

/** Coerce a model output (number or {y}/first-value object) to a finite number. */
function _scalar(y: number | Record<string, number>): number {
    if (typeof y === 'object' && y !== null) {
        const v = (y as Record<string, number>).y;
        return Number(v ?? Object.values(y)[0]);
    }
    return Number(y);
}

/**
 * Build a single Morris OAT trajectory on the unit grid.
 *
 * Returns d+1 points (rows of length d) where consecutive points differ in
 * exactly one coordinate by ±Δ, each factor moved exactly once, in a random
 * order and with a random base point on the {0, 1/(p-1), …} grid.
 *
 * @param d Number of factors.
 * @param delta Grid step Δ on the unit cube.
 * @param levels Grid level count p.
 * @param rng Seeded PRNG.
 * @returns Object with the trajectory points and the order factors were moved.
 */
function _trajectory(
    d: number,
    delta: number,
    levels: number,
    rng: () => number,
): { points: number[][]; order: number[]; signs: number[] } {
    // Base point: each coordinate on grid {0, g, 2g, …} such that x + Δ stays in [0,1].
    // Feasible grid values for the lower end of a +Δ step: 0 .. (1 - Δ) in steps of g.
    const g = 1 / (levels - 1);
    const maxStart = 1 - delta; // ensure x + delta <= 1
    const nStart = Math.max(1, Math.floor(maxStart / g + 1e-9) + 1);

    const base = new Array<number>(d);
    for (let j = 0; j < d; j++) {
        const k = Math.floor(rng() * nStart);
        base[j] = k * g;
    }

    // Random permutation of factor order (Fisher–Yates).
    const order = new Array<number>(d);
    for (let j = 0; j < d; j++) order[j] = j;
    for (let j = d - 1; j > 0; j--) {
        const k = Math.floor(rng() * (j + 1));
        const tmp = order[j]!;
        order[j] = order[k]!;
        order[k] = tmp;
    }

    // Random per-factor step direction. Because base ∈ [0, 1-Δ], +Δ is always
    // feasible; for a -Δ choice we shift the base up by Δ first so the step
    // lands back at the original base (keeps both endpoints inside [0,1]).
    const signs = new Array<number>(d);
    const start = base.slice();
    for (let j = 0; j < d; j++) {
        const s = rng() < 0.5 ? -1 : 1;
        signs[j] = s;
        if (s < 0) start[j] = base[j]! + delta; // pre-shift so −Δ stays feasible
    }

    const points: number[][] = [start.slice()];
    let cur = start.slice();
    for (let step = 0; step < d; step++) {
        const factor = order[step]!;
        const next = cur.slice();
        next[factor] = next[factor]! + signs[factor]! * delta;
        points.push(next);
        cur = next;
    }
    return { points, order, signs };
}

/**
 * Compute Morris elementary-effects screening statistics for each factor.
 *
 * Pure (no DOM, no Math.random). Deterministic for a given seed.
 *
 * @param config Variables (uniform [min,max] supports), scalar model, design.
 * @returns Per-factor mu / mu_star / sigma, a mu_star ranking, eval count.
 */
export function computeMorrisEffects(config: MorrisConfig): MorrisResult {
    const {
        variables,
        model,
        trajectories = 10,
        levels = 4,
        seed = 101,
    } = config || ({} as MorrisConfig);

    if (!Array.isArray(variables) || variables.length === 0) {
        throw new Error('computeMorrisEffects: variables array required');
    }
    if (typeof model !== 'function') {
        throw new Error('computeMorrisEffects: model must be a function');
    }
    if (!(levels >= 2)) {
        throw new Error('computeMorrisEffects: levels (p) must be >= 2');
    }
    if (!(trajectories >= 1)) {
        throw new Error('computeMorrisEffects: trajectories (r) must be >= 1');
    }

    const d = variables.length;
    // Morris (1991) recommended step: Δ = p / (2(p-1)).
    const delta = levels / (2 * (levels - 1));
    const supports = variables.map((v) => v.max - v.min);

    const rng = _mulberry32(seed >>> 0);

    // Accumulate elementary effects per factor across trajectories.
    const ee: number[][] = variables.map(() => []);
    let evals = 0;

    // Map a unit-cube row -> model sample object on the variable scale.
    const evalAt = (unitRow: number[]): number => {
        const sample: Record<string, number> = {};
        for (let j = 0; j < d; j++) {
            const v = variables[j]!;
            sample[v.id] = v.min + unitRow[j]! * supports[j]!;
        }
        evals += 1;
        return _scalar(model(sample));
    };

    for (let t = 0; t < trajectories; t++) {
        const { points, order, signs } = _trajectory(d, delta, levels, rng);
        // Evaluate the d+1 points once.
        const ys = points.map(evalAt);
        // Step `step` moves factor order[step]; EE uses the unit-step Δ but is
        // reported on the variable scale → divide additionally by support so the
        // result is dY/dX_i in physical units. (Δ on unit cube ⇒ Δ*support on X.)
        for (let step = 0; step < d; step++) {
            const factor = order[step]!;
            const dy = ys[step + 1]! - ys[step]!;
            const dxUnit = signs[factor]! * delta;
            const support = supports[factor]! || 1;
            const eeVal = dy / (dxUnit * support);
            ee[factor]!.push(eeVal);
        }
    }

    const effects: Record<string, MorrisFactorResult> = {};
    for (let j = 0; j < d; j++) {
        const id = variables[j]!.id;
        const effs = ee[j]!;
        const abs = effs.map((e) => Math.abs(e));
        effects[id] = {
            mu: Number(_mean(effs).toFixed(6)),
            mu_star: Number(_mean(abs).toFixed(6)),
            sigma: Number(_std(effs).toFixed(6)),
        };
    }

    const ranking = Object.keys(effects).sort(
        (a, b) => effects[b]!.mu_star - effects[a]!.mu_star,
    );

    return {
        effects,
        ranking,
        n_evaluations: evals,
        design: { trajectories, levels, delta: Number(delta.toFixed(6)) },
    };
}
