// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

// Contracts for Random Module Rebuild V2 (RANDOM-REBUILD-V2).
// Data-only state machine and input boundary validation.

export const Phase = Object.freeze({
    IDLE: 'idle',
    CONTEXT_READY: 'context_ready',
    STRUCTURE_READY: 'structure_ready',
    ELEMENTS_READY: 'elements_ready',
    OBSERVATIONS_READY: 'observations_ready',
    GOVERNANCE_READY: 'governance_ready',
    INTERPOLATION_READY: 'interpolation_ready',
    FINALIZED: 'finalized',
    COMMITTED: 'committed',
} as const);

export const OriginPolicy = Object.freeze({
    KEEP_CURRENT: 'keep_current',
    DERIVE_FROM_BOUNDARY: 'derive_from_boundary',
} as const);

export const CameraPolicy = Object.freeze({
    ISOMETRIC_FIT: 'isometric_fit',
    PRESERVE_BOOT_CAMERA: 'preserve_boot_camera',
    NONE: 'none',
} as const);

export const SiteSize = Object.freeze({
    SMALL: 'small',
    MEDIUM: 'medium',
    LARGE: 'large',
} as const);

export const ContaminationLevel = Object.freeze({
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
} as const);

type ObjectValue<T extends Record<string, string>> = T[keyof T];

export type PhaseValue = ObjectValue<typeof Phase>;
export type OriginPolicyValue = ObjectValue<typeof OriginPolicy>;
export type CameraPolicyValue = ObjectValue<typeof CameraPolicy>;
export type SiteSizeValue = ObjectValue<typeof SiteSize>;
export type ContaminationLevelValue = ObjectValue<typeof ContaminationLevel>;

export interface TransitionResult {
    ok: boolean;
    reason?: string;
}

export interface ScenarioValidationResult {
    ok: boolean;
    errors: string[];
}

export const PHASE_ORDER = Object.freeze([
    Phase.IDLE,
    Phase.CONTEXT_READY,
    Phase.STRUCTURE_READY,
    Phase.ELEMENTS_READY,
    Phase.OBSERVATIONS_READY,
    Phase.GOVERNANCE_READY,
    Phase.INTERPOLATION_READY,
    Phase.FINALIZED,
    Phase.COMMITTED,
] as const);

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object';
}

function isValueIn<const T extends Record<string, string>>(catalog: T, value: unknown): boolean {
    return typeof value === 'string' && Object.values(catalog).includes(value);
}

export function canTransition(from: unknown, to: unknown): TransitionResult {
    const fromIdx = (PHASE_ORDER as readonly unknown[]).indexOf(from);
    const toIdx = (PHASE_ORDER as readonly unknown[]).indexOf(to);
    if (fromIdx === -1) return { ok: false, reason: `unknown from phase: ${String(from)}` };
    if (toIdx === -1) return { ok: false, reason: `unknown to phase: ${String(to)}` };
    if (toIdx !== fromIdx + 1) {
        return { ok: false, reason: `out-of-order: ${String(from)} → ${String(to)} (must be adjacent)` };
    }
    return { ok: true };
}

function collectSeedErrors(input: Record<string, unknown>): string[] {
    const seed = input.seed;
    if (seed !== undefined && typeof seed !== 'string' && typeof seed !== 'number') {
        return ['seed must be string or number if provided'];
    }
    return [];
}

function collectIncludeFamiliesErrors(input: Record<string, unknown>): string[] {
    const includeFamilies = input.includeFamilies;
    if (includeFamilies !== null && includeFamilies !== undefined) {
        if (!(includeFamilies instanceof Set) && !Array.isArray(includeFamilies)) {
            return ['includeFamilies must be Set, Array, or null'];
        }
    }
    return [];
}

function collectOptionsErrors(input: Record<string, unknown>): string[] {
    const options = input.options;
    if (options && typeof options !== 'object') {
        return ['options must be an object if provided'];
    }
    return [];
}

function collectSiteSizeErrors(optionRecord: Record<string, unknown>): string[] {
    const siteSize = optionRecord.siteSize;
    if (siteSize && !isValueIn(SiteSize, siteSize)) {
        return [`options.siteSize must be one of ${Object.values(SiteSize).join('|')}`];
    }
    return [];
}

function collectContaminationLevelErrors(optionRecord: Record<string, unknown>): string[] {
    const contaminationLevel = optionRecord.contaminationLevel;
    if (contaminationLevel && !isValueIn(ContaminationLevel, contaminationLevel)) {
        return [`options.contaminationLevel must be one of ${Object.values(ContaminationLevel).join('|')}`];
    }
    return [];
}

function collectOriginPolicyErrors(input: Record<string, unknown>): string[] {
    const originPolicy = input.originPolicy;
    if (originPolicy && !isValueIn(OriginPolicy, originPolicy)) {
        return [`originPolicy must be one of ${Object.values(OriginPolicy).join('|')}`];
    }
    return [];
}

function collectCameraPolicyErrors(input: Record<string, unknown>): string[] {
    const cameraPolicy = input.cameraPolicy;
    if (cameraPolicy && !isValueIn(CameraPolicy, cameraPolicy)) {
        return [`cameraPolicy must be one of ${Object.values(CameraPolicy).join('|')}`];
    }
    return [];
}

export function validateScenarioInput(input: unknown): ScenarioValidationResult {
    if (!isObjectRecord(input)) {
        return { ok: false, errors: ['input must be an object'] };
    }

    const optionRecord = isObjectRecord(input.options) ? input.options : {};
    const errors: string[] = [
        ...collectSeedErrors(input),
        ...collectIncludeFamiliesErrors(input),
        ...collectOptionsErrors(input),
        ...collectSiteSizeErrors(optionRecord),
        ...collectContaminationLevelErrors(optionRecord),
        ...collectOriginPolicyErrors(input),
        ...collectCameraPolicyErrors(input),
    ];

    return { ok: errors.length === 0, errors };
}

export const DEFAULT_SCENARIO_INPUT = Object.freeze({
    seed: undefined,
    includeFamilies: null,
    options: {},
    originPolicy: OriginPolicy.DERIVE_FROM_BOUNDARY,
    cameraPolicy: CameraPolicy.ISOMETRIC_FIT,
});
