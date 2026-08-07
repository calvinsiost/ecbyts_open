// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

type ControlLevel = 'elimination' | 'substitution' | 'engineering' | 'administrative' | 'ppe';

interface Control {
    id: string;
    level: ControlLevel;
    name: string;
    description: string;
    cost: number;
    effectivenessOverride: number | null;
    [key: string]: unknown;
}

/**
 * SAO - NIOSH Hierarchy of Controls evaluator (P1-156)
 * Avaliador puro da Hierarquia de Controles NIOSH (5 níveis).
 *
 * Reference: NIOSH "Hierarchy of Controls"
 * https://www.cdc.gov/niosh/hierarchy-of-controls/
 *
 * Pure-logic - no DOM, no IO. Frozen registries.
 */

/** Ordered most→least effective. */
export const CONTROL_LEVELS = Object.freeze({
    ELIMINATION: 'elimination',
    SUBSTITUTION: 'substitution',
    ENGINEERING: 'engineering',
    ADMINISTRATIVE: 'administrative',
    PPE: 'ppe',
});

/** Numeric rank — higher is more effective. */
export const LEVEL_RANK = Object.freeze({
    elimination: 5,
    substitution: 4,
    engineering: 3,
    administrative: 2,
    ppe: 1,
});

/** Baseline effectiveness factors (0-1). */
export const EFFECTIVENESS_FACTORS = Object.freeze({
    elimination: 1.0,
    substitution: 0.85,
    engineering: 0.7,
    administrative: 0.4,
    ppe: 0.25,
});

const VALID_LEVELS = new Set(Object.values(CONTROL_LEVELS));

let _idCounter = 0;
function _nextId(): string {
    _idCounter += 1;
    return `ctrl_${Date.now().toString(36)}_${_idCounter}`;
}

/**
 * Create an immutable control descriptor.
 * @param level - one of CONTROL_LEVELS values
 * @param name
 * @param options
 */
export function createControl(
    level: ControlLevel,
    name: string,
    options: {
        id?: string;
        description?: string;
        cost?: number;
        effectivenessOverride?: number | null;
        [key: string]: unknown;
    } = {},
): Readonly<Control> {
    const opts = options || {};
    const base = {
        id: opts.id || _nextId(),
        level,
        name,
        description: opts.description || '',
        cost: typeof opts.cost === 'number' ? opts.cost : 0,
        effectivenessOverride: typeof opts.effectivenessOverride === 'number' ? opts.effectivenessOverride : null,
    };
    // Spread options last but preserve canonical fields
    const merged = { ...opts, ...base };
    return Object.freeze(merged as Control);
}

/**
 * Validate a control descriptor.
 */
export function validateControl(control: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!control || typeof control !== 'object') {
        return { valid: false, errors: ['control must be an object'] };
    }
    const c = control as Partial<Control>;
    if (!c.level || !VALID_LEVELS.has(c.level)) {
        errors.push(`invalid level: ${c.level}`);
    }
    if (!c.name || typeof c.name !== 'string') {
        errors.push('name is required');
    }
    if (typeof c.cost !== 'number' || c.cost < 0) {
        errors.push('cost must be a non-negative number');
    }
    if (c.effectivenessOverride !== null && c.effectivenessOverride !== undefined) {
        const v = c.effectivenessOverride;
        if (typeof v !== 'number' || v < 0 || v > 1) {
            errors.push('effectivenessOverride must be in [0,1]');
        }
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Effectiveness for a single control (0-1).
 */
export function getControlEffectiveness(control: Control | null | undefined): number {
    if (!control) return 0;
    if (
        typeof control.effectivenessOverride === 'number' &&
        control.effectivenessOverride >= 0 &&
        control.effectivenessOverride <= 1
    ) {
        return control.effectivenessOverride;
    }
    const f = EFFECTIVENESS_FACTORS[control.level];
    return typeof f === 'number' ? f : 0;
}

/**
 * Defense-in-depth combination: total = 1 - Π(1 - eff_i)
 * Identifies dominant level (highest rank present) and gaps relative to all levels.
 */
export function evaluateControlSet(controls: Control[]): {
    totalEffectiveness: number;
    dominantLevel: ControlLevel | null;
    levels: Record<string, number>;
    gaps: ControlLevel[];
} {
    const list = Array.isArray(controls) ? controls : [];
    const levels: Record<string, number> = {};
    let product = 1;
    let dominantLevel: ControlLevel | null = null;
    let dominantRank = -1;
    for (const c of list) {
        const eff = getControlEffectiveness(c);
        product *= 1 - eff;
        levels[c.level] = (levels[c.level] || 0) + 1;
        const r = LEVEL_RANK[c.level] || 0;
        if (r > dominantRank) {
            dominantRank = r;
            dominantLevel = c.level;
        }
    }
    const totalEffectiveness = list.length === 0 ? 0 : 1 - product;
    const gaps: ControlLevel[] = [];
    for (const lvl of Object.values(CONTROL_LEVELS) as ControlLevel[]) {
        if (!levels[lvl]) gaps.push(lvl);
    }
    return { totalEffectiveness, dominantLevel, levels, gaps };
}

/**
 * Recommend upgrades - for any control whose level is below ENGINEERING,
 * suggest considering a higher level (ELIMINATION/SUBSTITUTION/ENGINEERING).
 */
export function recommendUpgrades(controls: Control[]): Array<{
    controlId: string;
    currentLevel: ControlLevel;
    suggestedLevel: ControlLevel;
    rationale: string;
}> {
    const list = Array.isArray(controls) ? controls : [];
    const recs: Array<{
        controlId: string;
        currentLevel: ControlLevel;
        suggestedLevel: ControlLevel;
        rationale: string;
    }> = [];
    for (const c of list) {
        const rank = LEVEL_RANK[c.level] || 0;
        if (rank < LEVEL_RANK.engineering) {
            const suggested = (
                rank === LEVEL_RANK.administrative ? CONTROL_LEVELS.ENGINEERING : CONTROL_LEVELS.ENGINEERING
            ) as ControlLevel;
            recs.push({
                controlId: c.id,
                currentLevel: c.level,
                suggestedLevel: suggested,
                rationale: `NIOSH hierarchy favors '${suggested}' over '${c.level}' (rank ${LEVEL_RANK[suggested]} > ${rank}); evaluate elimination/substitution/engineering before relying on ${c.level}.`,
            });
        }
    }
    return recs;
}

/**
 * Cost-benefit ratio: ratio = riskReduction / cost.
 * paybackUnits = cost / riskReduction (units of risk-reduction per cost unit inverted).
 */
export function costBenefitOfControl(
    control: Control | null | undefined,
    riskReduction: number,
): { ratio: number; paybackUnits: number } {
    const cost = control && typeof control.cost === 'number' ? control.cost : 0;
    const rr = typeof riskReduction === 'number' ? riskReduction : 0;
    if (cost <= 0) {
        return { ratio: rr > 0 ? Infinity : 0, paybackUnits: 0 };
    }
    if (rr <= 0) {
        return { ratio: 0, paybackUnits: Infinity };
    }
    return { ratio: rr / cost, paybackUnits: cost / rr };
}

/**
 * Summarize a control set: counts by level, total cost, weighted effectiveness.
 */
export function summarizeControlSet(controls: Control[]): {
    totalControls: number;
    byLevel: Record<string, number>;
    totalCost: number;
    weightedEffectiveness: number;
} {
    const list = Array.isArray(controls) ? controls : [];
    const byLevel: Record<string, number> = {};
    for (const lvl of Object.values(CONTROL_LEVELS)) byLevel[lvl] = 0;
    let totalCost = 0;
    let weightedNum = 0;
    let weightedDen = 0;
    for (const c of list) {
        const cur = byLevel[c.level];
        if (cur !== undefined) byLevel[c.level] = cur + 1;
        totalCost += typeof c.cost === 'number' ? c.cost : 0;
        const rank = LEVEL_RANK[c.level] || 0;
        const eff = getControlEffectiveness(c);
        weightedNum += eff * rank;
        weightedDen += rank;
    }
    const weightedEffectiveness = weightedDen > 0 ? weightedNum / weightedDen : 0;
    return {
        totalControls: list.length,
        byLevel,
        totalCost,
        weightedEffectiveness,
    };
}
