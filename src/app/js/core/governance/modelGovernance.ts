// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).

/**
 * Model Governance DD38 + DAMA-DMBOK validation - pure module.
 *
 * Implements Item 9.44 SPEC_MODEL_GOVERNANCE_DD38_DAMA. Enforces
 * separation of duties between two roles when creating an environmental
 * model:
 *
 *   - Responsável Técnico (DD38 / Marco Civil / Decreto 7.724/2012)
 *     accountable for system security, availability, backups, audit
 *   - Responsável por Dados (DAMA-DMBOK v2) - accountable for data
 *     quality, classification, LGPD compliance, usage approval
 *
 * Also validates AI governance declarations (LGPD Art. 33 consent for
 * international transfer when data leaves the platform) and data
 * classification / risk assessment.
 *
 * All functions are pure - no browser deps, no network, no mutation.
 * Testable from Node cheap tests.
 *
 * References:
 *   - DD38: Decreto 7.724/2012 (Marco Civil da Internet regulation)
 *   - LGPD: Lei 13.709/2018, Art. 33 (international transfer)
 *   - DAMA-DMBOK v2: Data Management Body of Knowledge
 *   - SPEC: docs/specs/features/SPEC_MODEL_GOVERNANCE_DD38_DAMA.md
 */

// ============================================================================
// Enums (frozen - single source of truth)
// ============================================================================

export const TECHNICAL_OFFICER_RESPONSIBILITIES = Object.freeze(['security', 'availability', 'backup', 'audit_logs']);

export const DATA_STEWARD_RESPONSIBILITIES = Object.freeze([
    'data_quality',
    'data_classification',
    'compliance',
    'usage_approval',
]);

export const DATA_CLASSIFICATION_LEVELS = Object.freeze(['public', 'internal', 'confidential', 'restricted']);

export const SENSITIVE_DATA_TYPES = Object.freeze([
    'location_precise',
    'indigenous',
    'competitor',
    'personal_health',
    'biometric',
    'financial',
    'child_data',
]);

export const RISK_SEVERITIES = Object.freeze(['low', 'medium', 'high', 'critical']);
export const RISK_STATUSES = Object.freeze(['open', 'mitigated', 'accepted']);

export const KNOWN_AI_TOOLS = Object.freeze([
    'ecbyts_local', // local LLM — data stays in-platform
    'openai', // external
    'anthropic', // external
    'groq', // external
    'openrouter', // external (proxies)
    'gemini', // external
    'lmstudio', // local
    'ollama', // local
]);

// Tools that keep data on-device (data never leaves platform)
const LOCAL_AI_TOOLS = new Set(['ecbyts_local', 'lmstudio', 'ollama']);

// ============================================================================
// Validators - generic helpers
// ============================================================================

type GovernanceRecord = Record<string, any>;
type FieldValidationResult = { ok: true } | { ok: false; field: string | null; reason: string };

/**
 * Loose email regex. Not RFC 5322 compliant but good enough for UI-level
 * fail-fast. Actual delivery validation is the email system's job.
 */
import {
    isValidEmail,
    isValidRegistrationNumber,
    isNonEmptyString,
} from './_modelGovernanceValidatorsPure.js';

// ============================================================================
// Technical Officer (DD38) validation
// ============================================================================

/**
 * Validate a technical officer (Responsável Técnico DD38) entry.
 * Must have: name, registration number, email, declaration timestamp.
 */
export function validateTechnicalOfficer(officer: GovernanceRecord | null | undefined): FieldValidationResult {
    if (!officer || typeof officer !== 'object') {
        return { ok: false, field: null, reason: 'officer_not_object' };
    }
    if (!isNonEmptyString(officer.name)) {
        return { ok: false, field: 'name', reason: 'invalid_name' };
    }
    if (!isValidRegistrationNumber(officer.registrationNumber)) {
        return { ok: false, field: 'registrationNumber', reason: 'invalid_registration' };
    }
    if (!isValidEmail(officer.email)) {
        return { ok: false, field: 'email', reason: 'invalid_email' };
    }
    if (!officer.declarationDate) {
        return { ok: false, field: 'declarationDate', reason: 'missing_declaration_date' };
    }
    // Declaration date cannot be in the future
    const decl = new Date(officer.declarationDate);
    if (!Number.isFinite(decl.getTime())) {
        return { ok: false, field: 'declarationDate', reason: 'invalid_date_format' };
    }
    if (decl.getTime() > Date.now() + 60_000) {
        // Small tolerance for clock skew
        return { ok: false, field: 'declarationDate', reason: 'future_date' };
    }
    return { ok: true };
}

// ============================================================================
// Data Steward (DAMA) validation
// ============================================================================

/**
 * Validate a data steward (Responsável por Dados DAMA) entry.
 * Must have: name, role description, registration, email, declaration date.
 */
export function validateDataSteward(steward: GovernanceRecord | null | undefined): FieldValidationResult {
    if (!steward || typeof steward !== 'object') {
        return { ok: false, field: null, reason: 'steward_not_object' };
    }
    if (!isNonEmptyString(steward.name)) {
        return { ok: false, field: 'name', reason: 'invalid_name' };
    }
    if (!isNonEmptyString(steward.role, 2, 100)) {
        return { ok: false, field: 'role', reason: 'invalid_role' };
    }
    if (!isValidRegistrationNumber(steward.registrationNumber)) {
        return { ok: false, field: 'registrationNumber', reason: 'invalid_registration' };
    }
    if (!isValidEmail(steward.email)) {
        return { ok: false, field: 'email', reason: 'invalid_email' };
    }
    if (!steward.declarationDate) {
        return { ok: false, field: 'declarationDate', reason: 'missing_declaration_date' };
    }
    return { ok: true };
}

// ============================================================================
// Separation of Duties (DD38 + DAMA)
// ============================================================================

/**
 * Enforce that the technical officer and the data steward are distinct
 * people. Same person in both roles violates the DD38 + DAMA separation
 * of duties principle - tech security accountability cannot be the same
 * as data quality/compliance accountability.
 *
 * Match is on email (canonical) and registration number (cross-check).
 * Name match alone is not a blocker (common names).
 */
export function validateSeparationOfDuties(
    officer: GovernanceRecord | null | undefined,
    steward: GovernanceRecord | null | undefined,
): { ok: true } | { ok: false; reason: string } {
    if (!officer || !steward) {
        return { ok: false, reason: 'roles_not_both_provided' };
    }
    const officerEmail = String(officer.email || '')
        .trim()
        .toLowerCase();
    const stewardEmail = String(steward.email || '')
        .trim()
        .toLowerCase();
    if (officerEmail && officerEmail === stewardEmail) {
        return { ok: false, reason: 'same_email' };
    }
    const officerReg = String(officer.registrationNumber || '')
        .trim()
        .toLowerCase();
    const stewardReg = String(steward.registrationNumber || '')
        .trim()
        .toLowerCase();
    if (officerReg && officerReg === stewardReg) {
        return { ok: false, reason: 'same_registration' };
    }
    return { ok: true };
}

// ============================================================================
// AI Governance validation (LGPD Art. 33 + XAI + tool declaration)
// ============================================================================

/**
 * Validate the AI governance block of a model. Enforces:
 *   - If any external AI tool is declared → dataLeavesPlatform must be true
 *   - If dataLeavesPlatform → consentForInternationalTransfer must be true (LGPD Art. 33)
 *   - If AI is used → aiOutputValidator must be named (accountability)
 *   - aiTools must be in KNOWN_AI_TOOLS (prevents silent typos)
 */
export function validateAIGovernance(ai: GovernanceRecord | null | undefined): FieldValidationResult {
    if (!ai || typeof ai !== 'object') {
        return { ok: false, field: null, reason: 'ai_not_object' };
    }
    if (ai.usesAI !== true) {
        // No AI declared - nothing to enforce
        return { ok: true };
    }

    // Must declare at least one tool
    if (!Array.isArray(ai.aiTools) || ai.aiTools.length === 0) {
        return { ok: false, field: 'aiTools', reason: 'empty_tools_list' };
    }

    // All tools must be known (prevents typos like 'openaii')
    for (const tool of ai.aiTools) {
        if (!KNOWN_AI_TOOLS.includes(tool)) {
            return { ok: false, field: 'aiTools', reason: `unknown_tool:${tool}` };
        }
    }

    // Determine if any tool sends data externally
    const hasExternalTool = ai.aiTools.some((t: string) => !LOCAL_AI_TOOLS.has(t));

    // If any external tool is declared, dataLeavesPlatform must be true
    // (honesty check - catches users who pick openai but claim local-only)
    if (hasExternalTool && ai.dataLeavesPlatform !== true) {
        return { ok: false, field: 'dataLeavesPlatform', reason: 'external_tool_but_claimed_local' };
    }

    // LGPD Art. 33: international transfer requires explicit consent
    if (ai.dataLeavesPlatform === true && ai.consentForInternationalTransfer !== true) {
        return {
            ok: false,
            field: 'consentForInternationalTransfer',
            reason: 'lgpd_art33_consent_required',
        };
    }

    // Accountability: AI-generated outputs must have a named validator
    if (!ai.aiOutputValidator || typeof ai.aiOutputValidator !== 'object') {
        return { ok: false, field: 'aiOutputValidator', reason: 'missing_validator' };
    }
    if (!isNonEmptyString(ai.aiOutputValidator.name)) {
        return { ok: false, field: 'aiOutputValidator.name', reason: 'invalid_validator_name' };
    }
    if (!isValidEmail(ai.aiOutputValidator.email)) {
        return { ok: false, field: 'aiOutputValidator.email', reason: 'invalid_validator_email' };
    }

    return { ok: true };
}

// ============================================================================
// Data classification validation (LGPD + DAMA)
// ============================================================================

/**
 * Validate the data classification block. Enforces enum + internal
 * consistency (if personal data → classification ≥ confidential).
 */
export function validateDataClassification(dc: GovernanceRecord | null | undefined): FieldValidationResult {
    if (!dc || typeof dc !== 'object') {
        return { ok: false, field: null, reason: 'classification_not_object' };
    }
    if (!DATA_CLASSIFICATION_LEVELS.includes(dc.level)) {
        return { ok: false, field: 'level', reason: 'not_in_enum' };
    }

    // LGPD applicability must be explicit (boolean)
    if (typeof dc.lgpdApplies !== 'boolean') {
        return { ok: false, field: 'lgpdApplies', reason: 'must_be_boolean' };
    }

    // If personal data involved, classification must be confidential or restricted
    if (dc.personalDataInvolved === true) {
        if (!['confidential', 'restricted'].includes(dc.level)) {
            return {
                ok: false,
                field: 'level',
                reason: 'personal_data_requires_confidential_or_restricted',
            };
        }
        // And LGPD must apply
        if (dc.lgpdApplies !== true) {
            return { ok: false, field: 'lgpdApplies', reason: 'personal_data_requires_lgpd' };
        }
    }

    // Sensitive data types (if declared) must be in enum
    if (Array.isArray(dc.sensitiveDataTypes)) {
        for (const type of dc.sensitiveDataTypes) {
            if (!SENSITIVE_DATA_TYPES.includes(type)) {
                return { ok: false, field: 'sensitiveDataTypes', reason: `unknown_type:${type}` };
            }
        }
    }

    // Retention period must be positive number (days)
    if (dc.retentionPeriod != null) {
        const days = Number(dc.retentionPeriod);
        if (!Number.isFinite(days) || days <= 0) {
            return { ok: false, field: 'retentionPeriod', reason: 'invalid_retention' };
        }
    }

    return { ok: true };
}

// ============================================================================
// Risk Assessment validation
// ============================================================================

/**
 * Validate the risk assessment block. Each risk must have type, severity,
 * mitigation, status. At least one "critical" risk that is still "open"
 * blocks model publication.
 */
export function validateRiskAssessment(
    risk: GovernanceRecord | null | undefined,
):
    | { ok: true; blockers: Array<{ index: number; type: string }> }
    | { ok: false; field: string | null; reason: string } {
    if (!risk || typeof risk !== 'object') {
        return { ok: false, field: null, reason: 'risk_not_object' };
    }
    if (!Array.isArray(risk.risksIdentified)) {
        return { ok: false, field: 'risksIdentified', reason: 'must_be_array' };
    }

    const blockers: Array<{ index: number; type: string }> = [];
    for (let i = 0; i < risk.risksIdentified.length; i++) {
        const r = risk.risksIdentified[i];
        if (!r || typeof r !== 'object') {
            return { ok: false, field: `risksIdentified[${i}]`, reason: 'not_object' };
        }
        if (!isNonEmptyString(r.type, 2, 200)) {
            return { ok: false, field: `risksIdentified[${i}].type`, reason: 'invalid_type' };
        }
        if (!RISK_SEVERITIES.includes(r.severity)) {
            return { ok: false, field: `risksIdentified[${i}].severity`, reason: 'invalid_severity' };
        }
        if (!isNonEmptyString(r.mitigation, 2, 1000)) {
            return {
                ok: false,
                field: `risksIdentified[${i}].mitigation`,
                reason: 'invalid_mitigation',
            };
        }
        if (!RISK_STATUSES.includes(r.status)) {
            return { ok: false, field: `risksIdentified[${i}].status`, reason: 'invalid_status' };
        }

        // Critical open risks block publication
        if (r.severity === 'critical' && r.status === 'open') {
            blockers.push({ index: i, type: r.type });
        }
    }

    return { ok: true, blockers };
}

// ============================================================================
// Full governance validation - aggregates all sub-validators
// ============================================================================

/**
 * Validate a complete model governance metadata object. Returns on the
 * first failure (fail-fast) with a structured field path so UI can
 * highlight the offending input.
 */
export function validateModelGovernance(
    governance: GovernanceRecord | null | undefined,
): { ok: true; warnings: Array<Record<string, any>> } | FieldValidationResult {
    if (!governance || typeof governance !== 'object') {
        return { ok: false, field: null, reason: 'governance_not_object' };
    }

    // 1. Technical officer
    const officer = validateTechnicalOfficer(governance.technicalOfficer);
    if (!officer.ok) {
        return { ok: false, field: `technicalOfficer.${officer.field}`, reason: officer.reason };
    }

    // 2. Data steward
    const steward = validateDataSteward(governance.dataSteward);
    if (!steward.ok) {
        return { ok: false, field: `dataSteward.${steward.field}`, reason: steward.reason };
    }

    // 3. Separation of duties
    const sod = validateSeparationOfDuties(governance.technicalOfficer, governance.dataSteward);
    if (!sod.ok) {
        return { ok: false, field: 'separationOfDuties', reason: sod.reason };
    }

    // 4. AI governance
    const ai = validateAIGovernance(governance.aiGovernance);
    if (!ai.ok) {
        return { ok: false, field: `aiGovernance.${ai.field}`, reason: ai.reason };
    }

    // 5. Data classification
    const dc = validateDataClassification(governance.dataClassification);
    if (!dc.ok) {
        return { ok: false, field: `dataClassification.${dc.field}`, reason: dc.reason };
    }

    // 6. Risk assessment (non-blocking - collects warnings)
    const warnings: Array<Record<string, any>> = [];
    if (governance.riskAssessment) {
        const risk = validateRiskAssessment(governance.riskAssessment);
        if (!risk.ok) {
            return { ok: false, field: `riskAssessment.${risk.field}`, reason: risk.reason };
        }
        if (risk.blockers?.length > 0) {
            warnings.push({
                type: 'critical_open_risks',
                count: risk.blockers.length,
                blockers: risk.blockers,
            });
        }
    }

    return { ok: true, warnings };
}
