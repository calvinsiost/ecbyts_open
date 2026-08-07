// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * UX-66 - Wizard Step Navigation (pure-logic).
 * Multi-step forms com validacao e branching condicional.
 *
 * Sem DOM. Estado imutavel (frozen). Cada operacao retorna novo state.
 *
 * Step shape:
 *  { id, label, order, isOptional, validate?, condition?, branchNext? }
 */

type ValidateFn = (data: Record<string, unknown>, wizardData: Record<string, unknown>) => unknown;
type ConditionFn = (wizardData: Record<string, unknown>) => boolean;
type BranchNextFn = (wizardData: Record<string, unknown>) => string | null | undefined;

interface WizardStep {
    id: string;
    label: string;
    order: number;
    isOptional: boolean;
    validate: ValidateFn | null;
    condition: ConditionFn | null;
    branchNext: BranchNextFn | null;
}

interface WizardState {
    steps: Map<string, WizardStep>;
    currentStepId: string;
    completedStepIds: Set<string>;
    stepData: Map<string, Record<string, unknown>>;
    wizardData: Record<string, unknown>;
    history: string[];
}

function freeze(state: WizardState): WizardState {
    return Object.freeze({
        steps: state.steps,
        currentStepId: state.currentStepId,
        completedStepIds: state.completedStepIds,
        stepData: state.stepData,
        wizardData: state.wizardData,
        history: state.history,
    });
}

function cloneState(state: WizardState): WizardState {
    return {
        steps: state.steps,
        currentStepId: state.currentStepId,
        completedStepIds: new Set(state.completedStepIds),
        stepData: new Map(state.stepData),
        wizardData: { ...state.wizardData },
        history: state.history.slice(),
    };
}

function normalizeStep(step: unknown): WizardStep {
    if (!step || typeof step !== 'object') {
        throw new Error('wizardStepNav: step must be an object');
    }
    const s = step as Record<string, unknown>;
    if (typeof s.id !== 'string' || s.id.length === 0) {
        throw new Error('wizardStepNav: step.id required');
    }
    if (typeof s.order !== 'number' || !Number.isFinite(s.order)) {
        throw new Error(`wizardStepNav: step.order required (id=${s.id})`);
    }
    return Object.freeze({
        id: s.id,
        label: (s.label as string) || s.id,
        order: s.order,
        isOptional: Boolean(s.isOptional),
        validate: typeof s.validate === 'function' ? (s.validate as ValidateFn) : null,
        condition: typeof s.condition === 'function' ? (s.condition as ConditionFn) : null,
        branchNext: typeof s.branchNext === 'function' ? (s.branchNext as BranchNextFn) : null,
    });
}

/**
 * Cria wizard frozen. steps array nao vazio.
 * Throws em order duplicado, id duplicado, vazio.
 */
export function createWizard(steps: unknown, initialData: Record<string, unknown> = {}): WizardState {
    if (!Array.isArray(steps) || steps.length === 0) {
        throw new Error('wizardStepNav: steps must be non-empty array');
    }
    const map = new Map<string, WizardStep>();
    const seenOrders = new Set<number>();
    for (const raw of steps) {
        const step = normalizeStep(raw);
        if (map.has(step.id)) {
            throw new Error(`wizardStepNav: duplicate step id "${step.id}"`);
        }
        if (seenOrders.has(step.order)) {
            throw new Error(`wizardStepNav: duplicate step order ${step.order}`);
        }
        seenOrders.add(step.order);
        map.set(step.id, step);
    }
    const sorted = Array.from(map.values()).sort((a, b) => a.order - b.order);
    const first = sorted[0] as WizardStep;
    return freeze({
        steps: map,
        currentStepId: first.id,
        completedStepIds: new Set(),
        stepData: new Map(),
        wizardData: { ...initialData },
        history: [],
    });
}

function recomputeWizardData(
    stepData: Map<string, Record<string, unknown>>,
    initial: Record<string, unknown> = {},
): Record<string, unknown> {
    const merged = { ...initial };
    for (const [, data] of stepData) {
        Object.assign(merged, data);
    }
    return merged;
}

/** Merge data dentro de stepData[stepId] e recomputa wizardData. */
export function setStepData(state: WizardState, stepId: string, data: unknown): WizardState {
    if (!state.steps.has(stepId)) {
        throw new Error(`wizardStepNav: unknown step "${stepId}"`);
    }
    if (!data || typeof data !== 'object') {
        throw new Error('wizardStepNav: data must be an object');
    }
    const next = cloneState(state);
    const prev = next.stepData.get(stepId) || {};
    next.stepData.set(stepId, { ...prev, ...(data as Record<string, unknown>) });
    next.wizardData = recomputeWizardData(next.stepData);
    return freeze(next);
}

export function getCurrentStep(state: WizardState): WizardStep | null {
    return state.steps.get(state.currentStepId) || null;
}

export function validateCurrentStep(state: WizardState): { valid: boolean; errors: unknown[] } {
    const step = getCurrentStep(state);
    if (!step) return { valid: false, errors: ['no current step'] };
    if (!step.validate) return { valid: true, errors: [] };
    const data = state.stepData.get(step.id) || {};
    const result = step.validate(data, state.wizardData);
    if (!result || typeof result !== 'object') {
        return { valid: false, errors: ['invalid validate() return'] };
    }
    const r = result as { valid?: unknown; errors?: unknown };
    return {
        valid: Boolean(r.valid),
        errors: Array.isArray(r.errors) ? r.errors.slice() : [],
    };
}

export function canProceed(state: WizardState): boolean {
    const step = getCurrentStep(state);
    if (!step) return false;
    if (step.isOptional) return true;
    if (!step.validate) return true;
    return validateCurrentStep(state).valid;
}

export function canGoBack(state: WizardState): boolean {
    return state.history.length > 0;
}

/** Steps reachable respeitando conditions. */
export function getReachableSteps(state: WizardState): WizardStep[] {
    const all = Array.from(state.steps.values()).sort((a, b) => a.order - b.order);
    return all.filter((s) => !s.condition || s.condition(state.wizardData));
}

export function getRemainingSteps(state: WizardState): WizardStep[] {
    return getReachableSteps(state).filter((s) => !state.completedStepIds.has(s.id));
}

function resolveNextStepId(state: WizardState, current: WizardStep): string | null {
    if (current.branchNext) {
        const id = current.branchNext(state.wizardData);
        if (id === null || id === undefined) return null;
        if (!state.steps.has(id)) {
            throw new Error(`wizardStepNav: branchNext returned unknown step "${id}"`);
        }
        return id;
    }
    const reachable = getReachableSteps(state);
    const idx = reachable.findIndex((s) => s.id === current.id);
    if (idx === -1 || idx === reachable.length - 1) return null;
    return (reachable[idx + 1] as WizardStep).id;
}

export function next(state: WizardState): WizardState {
    const current = getCurrentStep(state);
    if (!current) throw new Error('wizardStepNav: no current step');
    if (!canProceed(state)) {
        throw new Error(`wizardStepNav: cannot proceed from "${current.id}" (validation failed)`);
    }
    const nextId = resolveNextStepId(state, current);
    if (nextId === null) {
        throw new Error('wizardStepNav: already at last step');
    }
    const ns = cloneState(state);
    ns.completedStepIds.add(current.id);
    ns.history.push(current.id);
    ns.currentStepId = nextId;
    return freeze(ns);
}

export function back(state: WizardState): WizardState {
    if (!canGoBack(state)) {
        throw new Error('wizardStepNav: cannot go back (history empty)');
    }
    const ns = cloneState(state);
    const prevId = ns.history.pop() as string;
    ns.completedStepIds.delete(prevId);
    ns.currentStepId = prevId;
    return freeze(ns);
}

export function jumpTo(state: WizardState, stepId: string): WizardState {
    if (!state.steps.has(stepId)) {
        throw new Error(`wizardStepNav: unknown step "${stepId}"`);
    }
    if (stepId === state.currentStepId) return state;
    if (!state.completedStepIds.has(stepId)) {
        throw new Error(`wizardStepNav: cannot jumpTo "${stepId}" (not completed and not current)`);
    }
    const ns = cloneState(state);
    // truncar history ate stepId (inclusive nao - voltamos para ele)
    const idx = ns.history.indexOf(stepId);
    if (idx >= 0) {
        const removed = ns.history.splice(idx);
        // o proprio stepId estava em history; remover de completed
        for (const id of removed) ns.completedStepIds.delete(id);
    } else {
        ns.completedStepIds.delete(stepId);
    }
    ns.currentStepId = stepId;
    return freeze(ns);
}

export function getProgress(state: WizardState): number {
    const reachable = getReachableSteps(state);
    if (reachable.length === 0) return 0;
    let completed = 0;
    for (const s of reachable) {
        if (state.completedStepIds.has(s.id)) completed += 1;
    }
    return Math.round((completed / reachable.length) * 100);
}

export function resetWizard(state: WizardState): WizardState {
    const sorted = Array.from(state.steps.values()).sort((a, b) => a.order - b.order);
    return freeze({
        steps: state.steps,
        currentStepId: (sorted[0] as WizardStep).id,
        completedStepIds: new Set(),
        stepData: new Map(),
        wizardData: {},
        history: [],
    });
}

export function summarizeWizard(state: WizardState): {
    totalSteps: number;
    reachable: number;
    completed: number;
    currentLabel: string | null;
    progressPercent: number;
} {
    const reachable = getReachableSteps(state);
    const current = getCurrentStep(state);
    return {
        totalSteps: state.steps.size,
        reachable: reachable.length,
        completed: state.completedStepIds.size,
        currentLabel: current ? current.label : null,
        progressPercent: getProgress(state),
    };
}
