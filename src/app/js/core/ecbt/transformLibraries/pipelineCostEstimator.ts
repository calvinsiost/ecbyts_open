// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt

/**
 * Pure cost estimator helpers for ECBT transformation pipelines.
 */

export interface CostWeights {
    cpu: number;
    io: number;
    network: number;
    memory: number;
}

export interface StepCostSpec {
    id: string;
    cpu?: number;
    io?: number;
    network?: number;
    memory?: number;
}

export interface StepCost {
    id: string;
    cpu: number;
    io: number;
    network: number;
    memory: number;
}

export const DEFAULT_WEIGHTS = {
    cpu: 1.0,
    io: 5.0,
    network: 10.0,
    memory: 0.1,
} as const;

export type DefaultWeights = (typeof DEFAULT_WEIGHTS)[keyof typeof DEFAULT_WEIGHTS];

export const COST_META = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 49,
    deliveredAt: '2026-05-02',
} as const;

function validateSpec(spec: StepCostSpec | null | undefined): asserts spec is StepCostSpec {
    if (!spec || typeof spec !== 'object') {
        throw new TypeError('createStepCost: spec required');
    }
    if (typeof spec.id !== 'string' || !spec.id.trim()) {
        throw new TypeError('createStepCost: id required');
    }
}

function nonNegativeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function createStepCost(spec: StepCostSpec | null | undefined): Readonly<StepCost> {
    validateSpec(spec);

    const cpu = nonNegativeNumber(spec.cpu);
    const io = nonNegativeNumber(spec.io);
    const network = nonNegativeNumber(spec.network);
    const memory = nonNegativeNumber(spec.memory);

    return Object.freeze({ id: spec.id, cpu, io, network, memory });
}

export function computeStepCost(step: Partial<StepCost> | null | undefined, weights: Partial<CostWeights> = DEFAULT_WEIGHTS): number {
    if (!step) return 0;
    const w = { ...DEFAULT_WEIGHTS, ...(weights && typeof weights === 'object' ? weights : {}) };
    return (
        (step.cpu || 0) * (w.cpu || 0) +
        (step.io || 0) * (w.io || 0) +
        (step.network || 0) * (w.network || 0) +
        (step.memory || 0) * (w.memory || 0)
    );
}

export function computePipelineCost(steps: ReadonlyArray<Partial<StepCost>> | null | undefined, weights: Partial<CostWeights> = DEFAULT_WEIGHTS): number {
    if (!Array.isArray(steps)) return 0;
    return steps.reduce((sum, step) => sum + computeStepCost(step, weights), 0);
}

export function findHotspot(steps: ReadonlyArray<Partial<StepCost>> | null | undefined, weights: Partial<CostWeights> = DEFAULT_WEIGHTS): Readonly<{ step: Partial<StepCost>, cost: number }> | null {
    if (!Array.isArray(steps) || steps.length === 0) return null;

    let max = -Infinity;
    let hotspot: Partial<StepCost> | null = null;
    for (const step of steps) {
        const cost = computeStepCost(step, weights);
        if (cost > max) {
            max = cost;
            hotspot = step;
        }
    }
    return hotspot ? Object.freeze({ step: hotspot, cost: max }) : null;
}

export function compareCost(stepsA: ReadonlyArray<Partial<StepCost>> | null | undefined, stepsB: ReadonlyArray<Partial<StepCost>> | null | undefined, weights: Partial<CostWeights> = DEFAULT_WEIGHTS): Readonly<{ costA: number, costB: number, delta: number, percent: number }> {
    const costA = computePipelineCost(stepsA, weights);
    const costB = computePipelineCost(stepsB, weights);
    const delta = costB - costA;
    const percent = costA > 0 ? (delta / costA) * 100 : 0;
    return Object.freeze({ costA, costB, delta, percent });
}

export function costBreakdown(steps: ReadonlyArray<Partial<StepCost>> | null | undefined, weights: Partial<CostWeights> = DEFAULT_WEIGHTS): Readonly<{ cpu: number, io: number, network: number, memory: number, total: number }> {
    const empty = { cpu: 0, io: 0, network: 0, memory: 0, total: 0 };
    if (!Array.isArray(steps)) return Object.freeze(empty);

    const w = { ...DEFAULT_WEIGHTS, ...(weights && typeof weights === 'object' ? weights : {}) };
    let cpu = 0;
    let io = 0;
    let network = 0;
    let memory = 0;
    for (const step of steps) {
        if (!step) continue;
        cpu += (step.cpu || 0) * (w.cpu || 0);
        io += (step.io || 0) * (w.io || 0);
        network += (step.network || 0) * (w.network || 0);
        memory += (step.memory || 0) * (w.memory || 0);
    }
    return Object.freeze({ cpu, io, network, memory, total: cpu + io + network + memory });
}

export function summarizeCost(steps: ReadonlyArray<Partial<StepCost>> | null | undefined, weights: Partial<CostWeights> = DEFAULT_WEIGHTS): Readonly<{ stepCount: number, total: number, avgPerStep: number, hotspotId: string | null, hotspotCost?: number }> {
    const empty = { stepCount: 0, total: 0, avgPerStep: 0, hotspotId: null };
    if (!Array.isArray(steps) || steps.length === 0) return Object.freeze(empty);

    const total = computePipelineCost(steps, weights);
    const hotspot = findHotspot(steps, weights);
    const hotspotId = typeof hotspot?.step.id === 'string' ? hotspot.step.id : null;
    return Object.freeze({
        stepCount: steps.length,
        total,
        avgPerStep: total / steps.length,
        hotspotId,
        hotspotCost: hotspot ? hotspot.cost : 0,
    });
}

export const pipelineCostEstimatorMeta = {
    spec: 'ECBT_TRANSFORMATION_LIBRARIES_001',
    phase: 49,
    deliveredAt: '2026-05-02',
    exports: [
        'DEFAULT_WEIGHTS',
        'COST_META',
        'createStepCost',
        'computeStepCost',
        'computePipelineCost',
        'findHotspot',
        'compareCost',
        'costBreakdown',
        'summarizeCost',
    ],
    provenance: { generatedBy: 'AI', disclaimerAcknowledged: true },
} as const;
