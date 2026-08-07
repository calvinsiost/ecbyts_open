// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/** Pure, executable contract for Early Adopter participants and cohorts. */

export const EARLY_ADOPTER_CONTRACT_VERSION = 1 as const;

export const PARTICIPANT_STATES = Object.freeze([
    'candidate',
    'invited',
    'invite_expired',
    'declined',
    'accepted',
    'first_access',
    'first_value',
    'active',
    'paused',
    'left',
    'revoked',
    'beta_completed',
] as const);

export type ParticipantState = (typeof PARTICIPANT_STATES)[number];

export const PARTICIPANT_TRANSITIONS = Object.freeze({
    candidate: Object.freeze(['invited']),
    invited: Object.freeze(['invite_expired', 'declined', 'accepted']),
    invite_expired: Object.freeze([]),
    declined: Object.freeze([]),
    accepted: Object.freeze(['first_access']),
    first_access: Object.freeze(['first_value']),
    first_value: Object.freeze(['active']),
    active: Object.freeze(['paused', 'left', 'revoked', 'beta_completed']),
    paused: Object.freeze(['active', 'left', 'revoked']),
    left: Object.freeze([]),
    revoked: Object.freeze([]),
    beta_completed: Object.freeze([]),
} satisfies Record<ParticipantState, readonly ParticipantState[]>);

export const COHORT_STATES = Object.freeze(['draft', 'approved', 'active', 'paused', 'completed', 'cancelled'] as const);
export type CohortState = (typeof COHORT_STATES)[number];

export const COHORT_TRANSITIONS = Object.freeze({
    draft: Object.freeze(['approved', 'cancelled']),
    approved: Object.freeze(['active', 'cancelled']),
    active: Object.freeze(['paused', 'completed', 'cancelled']),
    paused: Object.freeze(['active', 'completed', 'cancelled']),
    completed: Object.freeze([]),
    cancelled: Object.freeze([]),
} satisfies Record<CohortState, readonly CohortState[]>);

export interface ParticipantContract {
    contractVersion: typeof EARLY_ADOPTER_CONTRACT_VERSION;
    id: string;
    cohortId: string;
    profile: string;
    purpose: string;
    ownerId: string;
    capabilityPackageId: string;
    state: ParticipantState;
    expiresAt: string;
}

export interface CohortContract {
    contractVersion: typeof EARLY_ADOPTER_CONTRACT_VERSION;
    id: string;
    name: string;
    ownerId: string;
    state: CohortState;
    maxParticipants: number;
    timezone: string;
    startsAt: string;
    endsAt: string;
}

export interface TransitionCommand {
    from: string;
    to: string;
    actorId: string;
    occurredAt: string;
    reason: string;
    source: string;
}

export interface ValidationIssue {
    field: string;
    reason: string;
}

export type ValidationResult = { ok: true } | { ok: false; issues: ValidationIssue[] };

const PARTICIPANT_FIELDS = Object.freeze([
    'contractVersion',
    'id',
    'cohortId',
    'profile',
    'purpose',
    'ownerId',
    'capabilityPackageId',
    'state',
    'expiresAt',
]);
const COHORT_FIELDS = Object.freeze([
    'contractVersion',
    'id',
    'name',
    'ownerId',
    'state',
    'maxParticipants',
    'timezone',
    'startsAt',
    'endsAt',
]);
const TRANSITION_FIELDS = Object.freeze(['from', 'to', 'actorId', 'occurredAt', 'reason', 'source']);

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonBlankString(value: unknown, maxLength = 500): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isIsoTimestamp(value: unknown): value is string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function unknownFieldIssues(value: Record<string, unknown>, allowed: readonly string[]): ValidationIssue[] {
    return Object.keys(value)
        .filter((key) => !allowed.includes(key))
        .map((field) => ({ field, reason: 'unknown_field' }));
}

function finish(issues: ValidationIssue[]): ValidationResult {
    return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function requireString(value: Record<string, unknown>, field: string, issues: ValidationIssue[], maxLength = 500): void {
    if (!isNonBlankString(value[field], maxLength)) issues.push({ field, reason: 'required_non_blank_string' });
}

export function validateParticipantContract(input: unknown): ValidationResult {
    if (!isRecord(input)) return { ok: false, issues: [{ field: '$', reason: 'expected_object' }] };
    const issues = unknownFieldIssues(input, PARTICIPANT_FIELDS);
    if (input.contractVersion !== EARLY_ADOPTER_CONTRACT_VERSION) {
        issues.push({ field: 'contractVersion', reason: 'unsupported_version' });
    }
    for (const field of ['id', 'cohortId', 'profile', 'purpose', 'ownerId', 'capabilityPackageId']) {
        requireString(input, field, issues);
    }
    if (!PARTICIPANT_STATES.includes(input.state as ParticipantState)) {
        issues.push({ field: 'state', reason: 'invalid_state' });
    }
    if (!isIsoTimestamp(input.expiresAt)) issues.push({ field: 'expiresAt', reason: 'invalid_iso_timestamp' });
    return finish(issues);
}

export function validateCohortContract(input: unknown): ValidationResult {
    if (!isRecord(input)) return { ok: false, issues: [{ field: '$', reason: 'expected_object' }] };
    const issues = unknownFieldIssues(input, COHORT_FIELDS);
    if (input.contractVersion !== EARLY_ADOPTER_CONTRACT_VERSION) {
        issues.push({ field: 'contractVersion', reason: 'unsupported_version' });
    }
    for (const field of ['id', 'name', 'ownerId', 'timezone']) requireString(input, field, issues);
    if (!COHORT_STATES.includes(input.state as CohortState)) issues.push({ field: 'state', reason: 'invalid_state' });
    if (!Number.isSafeInteger(input.maxParticipants) || (input.maxParticipants as number) < 1) {
        issues.push({ field: 'maxParticipants', reason: 'expected_positive_integer' });
    }
    if (!isIsoTimestamp(input.startsAt)) issues.push({ field: 'startsAt', reason: 'invalid_iso_timestamp' });
    if (!isIsoTimestamp(input.endsAt)) issues.push({ field: 'endsAt', reason: 'invalid_iso_timestamp' });
    if (isIsoTimestamp(input.startsAt) && isIsoTimestamp(input.endsAt) && input.endsAt <= input.startsAt) {
        issues.push({ field: 'endsAt', reason: 'must_be_after_startsAt' });
    }
    return finish(issues);
}

export function canTransitionParticipant(from: string, to: string): boolean {
    if (!PARTICIPANT_STATES.includes(from as ParticipantState) || !PARTICIPANT_STATES.includes(to as ParticipantState)) {
        return false;
    }
    const allowed = PARTICIPANT_TRANSITIONS[from as ParticipantState] as readonly ParticipantState[];
    return allowed.includes(to as ParticipantState);
}

export function canTransitionCohort(from: string, to: string): boolean {
    if (!COHORT_STATES.includes(from as CohortState) || !COHORT_STATES.includes(to as CohortState)) return false;
    const allowed = COHORT_TRANSITIONS[from as CohortState] as readonly CohortState[];
    return allowed.includes(to as CohortState);
}

export function validateTransitionCommand(input: unknown, kind: 'participant' | 'cohort'): ValidationResult {
    if (!isRecord(input)) return { ok: false, issues: [{ field: '$', reason: 'expected_object' }] };
    const issues = unknownFieldIssues(input, TRANSITION_FIELDS);
    for (const field of ['from', 'to', 'actorId', 'reason', 'source']) requireString(input, field, issues);
    if (!isIsoTimestamp(input.occurredAt)) issues.push({ field: 'occurredAt', reason: 'invalid_iso_timestamp' });
    if (kind !== 'participant' && kind !== 'cohort') issues.push({ field: 'kind', reason: 'invalid_contract_kind' });
    if (isNonBlankString(input.from) && isNonBlankString(input.to)) {
        const allowed = kind === 'participant'
            ? canTransitionParticipant(input.from, input.to)
            : kind === 'cohort'
              ? canTransitionCohort(input.from, input.to)
              : false;
        if (!allowed) issues.push({ field: 'to', reason: 'transition_not_allowed' });
    }
    return finish(issues);
}
