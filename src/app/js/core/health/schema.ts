// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/* ================================================================
   HEALTH-MON-001 - Schema and validation for health entities

   Immutable schemas plus validation/normalization helpers.
   No DOM, no network - directly importable in Node.js.
   ================================================================ */

// ----------------------------------------------------------------
// Enums
// ----------------------------------------------------------------

export const SAMPLE_MATRIX = Object.freeze({
    urine: 'urine',
    blood: 'blood',
    exhaled_air: 'exhaled_air',
    other: 'other',
} as const);

export const HEALTH_STATUS = Object.freeze({
    green: 'green',
    yellow: 'yellow',
    red: 'red',
    critical: 'critical',
    unknown: 'unknown',
} as const);

export const REFERENCE_STANDARD = Object.freeze({
    ACGIH_BEI_2024: 'ACGIH-BEI-2024',
    SCOEL_BLV: 'SCOEL-BLV',
    OSHA_PEL: 'OSHA-PEL',
    NR15_BR: 'NR-15-BR',
    CUSTOM: 'custom',
} as const);

export const HEALTH_EVENTS = Object.freeze({
    WORKER_REGISTERED: 'health:worker:registered',
    WORKER_UPDATED: 'health:worker:updated',
    BIOMARKER_ADDED: 'health:biomarker:added',
    THRESHOLD_BREACHED: 'health:threshold:breached',
    RULE_CREATED: 'health:rule:created',
    RULE_UPDATED: 'health:rule:updated',
} as const);

export type SampleMatrix = (typeof SAMPLE_MATRIX)[keyof typeof SAMPLE_MATRIX];
export type HealthStatus = (typeof HEALTH_STATUS)[keyof typeof HEALTH_STATUS];
export type ReferenceStandard = (typeof REFERENCE_STANDARD)[keyof typeof REFERENCE_STANDARD];

export interface HealthWorker {
    readonly id: string;
    readonly pseudonym: string;
    readonly role: string;
    readonly hireDate: string | null;
    readonly birthYear: number | null;
    readonly smokingStatus: string;
    readonly gender: string;
    readonly projectId: string;
    readonly consentHash: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface HealthBiomarkerReading {
    readonly id: string;
    readonly workerPseudonym: string;
    readonly biomarkerType: string;
    readonly value: number;
    readonly unit: string;
    readonly sampleDate: string;
    readonly sampleMatrix: string;
    readonly labId: string | null;
    readonly campaignId: string | null;
    readonly elementId: string | null;
    readonly confounders: Record<string, unknown>;
    readonly status: HealthStatus;
    readonly createdAt: string;
}

export interface HealthThresholdRule {
    readonly id: string;
    readonly biomarkerType: string;
    readonly warningValue: number;
    readonly criticalValue: number;
    readonly actionValue: number | null;
    readonly unit: string;
    readonly formula: string | null;
    readonly referenceStandard: string;
    readonly active: boolean;
    readonly projectId: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}

export interface CreateWorkerParams {
    pseudonym?: string;
    role?: string | null;
    hireDate?: string | null;
    birthYear?: string | number | null;
    smokingStatus?: string | null;
    gender?: string | null;
    projectId?: string;
    consentHash?: string;
    id?: string | null;
}

export interface CreateReadingParams {
    workerPseudonym?: string;
    biomarkerType?: string;
    value?: number;
    unit?: string;
    sampleDate?: string | number | Date;
    sampleMatrix?: string;
    labId?: string | number | null;
    campaignId?: string | number | null;
    elementId?: string | number | null;
    confounders?: Record<string, unknown> | null;
    id?: string | null;
}

export interface CreateThresholdRuleParams {
    biomarkerType?: string;
    warningValue?: number;
    criticalValue?: number;
    actionValue?: number | null;
    unit?: string;
    formula?: string | number | null;
    referenceStandard?: string;
    active?: boolean;
    projectId?: string;
    id?: string | null;
}

// ----------------------------------------------------------------
// Schema factories (return plain objects - no class instances)
// ----------------------------------------------------------------

/**
 * Create a HealthWorkerRegistry entry.
 * LGPD: real name never stored in model - only pseudonym + consent_hash.
 */
export function createWorker({
    pseudonym,
    role = 'worker',
    hireDate = null,
    birthYear = null,
    smokingStatus = 'unknown',
    gender = 'unknown',
    projectId,
    consentHash,
    id = null,
}: CreateWorkerParams = {}): Readonly<HealthWorker> {
    if (!pseudonym || typeof pseudonym !== 'string' || !pseudonym.trim()) {
        throw new TypeError('worker.pseudonym is required');
    }
    if (!projectId || typeof projectId !== 'string') {
        throw new TypeError('worker.projectId is required');
    }
    if (!consentHash || typeof consentHash !== 'string') {
        throw new TypeError('worker.consentHash is required (LGPD compliance)');
    }
    const now = new Date().toISOString();
    return Object.freeze({
        id: id || _generateId('w'),
        pseudonym: pseudonym.trim(),
        role: String(role || 'worker'),
        hireDate: hireDate || null,
        birthYear: birthYear ? Number(birthYear) : null,
        smokingStatus: String(smokingStatus || 'unknown'),
        gender: String(gender || 'unknown'),
        projectId: String(projectId),
        consentHash: String(consentHash),
        createdAt: now,
        updatedAt: now,
    });
}

/**
 * Create a HealthBiomarkerReading.
 */
export function createReading({
    workerPseudonym,
    biomarkerType,
    value,
    unit,
    sampleDate,
    sampleMatrix = SAMPLE_MATRIX.urine,
    labId = null,
    campaignId = null,
    elementId = null,
    confounders = {},
    id = null,
}: CreateReadingParams = {}): Readonly<HealthBiomarkerReading> {
    if (!workerPseudonym || typeof workerPseudonym !== 'string') {
        throw new TypeError('reading.workerPseudonym is required');
    }
    if (!biomarkerType || typeof biomarkerType !== 'string') {
        throw new TypeError('reading.biomarkerType is required');
    }
    if (typeof value !== 'number' || isNaN(value)) {
        throw new TypeError('reading.value must be a finite number');
    }
    if (!unit || typeof unit !== 'string') {
        throw new TypeError('reading.unit is required');
    }
    if (!sampleDate) {
        throw new TypeError('reading.sampleDate is required');
    }
    if (!Object.values(SAMPLE_MATRIX).includes(sampleMatrix as SampleMatrix)) {
        throw new TypeError(`reading.sampleMatrix must be one of: ${Object.keys(SAMPLE_MATRIX).join(', ')}`);
    }
    const now = new Date().toISOString();
    return Object.freeze({
        id: id || _generateId('r'),
        workerPseudonym: String(workerPseudonym),
        biomarkerType: String(biomarkerType),
        value: Number(value),
        unit: String(unit),
        sampleDate: String(sampleDate),
        sampleMatrix: String(sampleMatrix),
        labId: labId ? String(labId) : null,
        campaignId: campaignId ? String(campaignId) : null,
        elementId: elementId ? String(elementId) : null,
        confounders: { ...(confounders || {}) },
        status: HEALTH_STATUS.unknown,
        createdAt: now,
    });
}

/**
 * Create a HealthThresholdRule.
 */
export function createThresholdRule({
    biomarkerType,
    warningValue,
    criticalValue,
    actionValue = null,
    unit,
    formula = null,
    referenceStandard = REFERENCE_STANDARD.CUSTOM,
    active = true,
    projectId,
    id = null,
}: CreateThresholdRuleParams = {}): Readonly<HealthThresholdRule> {
    if (!biomarkerType || typeof biomarkerType !== 'string') {
        throw new TypeError('rule.biomarkerType is required');
    }
    if (typeof warningValue !== 'number' || typeof criticalValue !== 'number') {
        throw new TypeError('rule.warningValue and rule.criticalValue must be numbers');
    }
    if (warningValue >= criticalValue) {
        throw new RangeError('rule.warningValue must be strictly less than rule.criticalValue');
    }
    if (actionValue !== null && typeof actionValue !== 'number') {
        throw new TypeError('rule.actionValue must be a number or null');
    }
    if (!unit || typeof unit !== 'string') {
        throw new TypeError('rule.unit is required');
    }
    if (!projectId || typeof projectId !== 'string') {
        throw new TypeError('rule.projectId is required');
    }
    const now = new Date().toISOString();
    return Object.freeze({
        id: id || _generateId('t'),
        biomarkerType: String(biomarkerType),
        warningValue: Number(warningValue),
        criticalValue: Number(criticalValue),
        actionValue: actionValue !== null ? Number(actionValue) : null,
        unit: String(unit),
        formula: formula ? String(formula) : null,
        referenceStandard: String(referenceStandard),
        active: Boolean(active),
        projectId: String(projectId),
        createdAt: now,
        updatedAt: now,
    });
}

// ----------------------------------------------------------------
// Validation helpers
// ----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

export function isValidWorker(w: unknown): w is HealthWorker {
    return (
        isRecord(w) &&
        typeof w.id === 'string' &&
        typeof w.pseudonym === 'string' &&
        typeof w.projectId === 'string' &&
        typeof w.consentHash === 'string'
    );
}

export function isValidReading(r: unknown): r is HealthBiomarkerReading {
    return (
        isRecord(r) &&
        typeof r.id === 'string' &&
        typeof r.workerPseudonym === 'string' &&
        typeof r.biomarkerType === 'string' &&
        typeof r.value === 'number' &&
        typeof r.unit === 'string'
    );
}

export function isValidThresholdRule(rule: unknown): rule is HealthThresholdRule {
    return (
        isRecord(rule) &&
        typeof rule.biomarkerType === 'string' &&
        typeof rule.warningValue === 'number' &&
        typeof rule.criticalValue === 'number' &&
        rule.warningValue < rule.criticalValue &&
        typeof rule.unit === 'string' &&
        typeof rule.projectId === 'string'
    );
}

// ----------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------

let _seq = 0;
function _generateId(prefix: string): string {
    _seq += 1;
    return `${prefix}-${Date.now()}-${_seq}`;
}
