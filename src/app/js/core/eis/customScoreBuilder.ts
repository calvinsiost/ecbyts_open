// This file is part of ecbyts/ECBT (Environmental & Occupational Core Byte Tools).
// Copyright (C) 2026 Calvin Stefan Iost
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0-only).
// See LICENSE file or https://www.gnu.org/licenses/agpl-3.0.txt
//
// Project: ECBT (Environmental & Occupational Core Byte Tools)
// Version: 0.1-beta
// Architecture: Signed Provenance Chain (cryptographic chaining via ECO1).
//               CCC-001 CC-13 textual sweep 2026-06-10 — taxonomia honesta
//               (regime por campanha = Digital Model, NÃO Twin tempo real).
// Application: Environmental Data Governance - EIS Custom Score Builder
// Authorship: Calvin Stefan Iost
// Copyright (c) 2026 Calvin Stefan Iost

import { generateId } from '../../utils/helpers/id.js';
import { deepClone as _deepCloneCanonical } from '../../utils/helpers/deepClone.js';

/* ================================================================
   EIS-CUSTOM-001 — Custom Score Template Core

   Permite criar templates de EIS com eixos/pesos/veto/verdict bands
   custom. Template default é imutável — customs nascem como draft,
   validam invariantes antes de publicar.

   Pure — sem IDB, sem DOM, sem Three.js.

   PUBLIC API (EIS-CUSTOM-001 spec):
   - STANDARD_EIS_TEMPLATE   frozen canonical default (id='eis-standard')
   - createDraftTemplate()   factory from opts → frozen template
   - validateTemplate()      structural + semantic checks → {valid, errors}
   - computeEisFromTemplate() weighted geometric mean + veto → frozen result
   - diffTemplates()         field-by-field diff → frozen result
   - publishTemplate()       draft → published frozen (throws if invalid)

   LEGACY API (backward compat, do not remove without ADR):
   - DEFAULT_TEMPLATE        frozen, id='default'
   - EIS_AXES                ['T','A','Cp','Ty','Cs','Cm']
   - cloneBaselineTemplate() creates draft (non-frozen, legacy mutability)
   - createBlankTemplate()
   - computeCustomScore()    weighted arithmetic mean (legacy)
   ================================================================ */

// ──────────────────────────────────────────────────────────────────────
// INTERNAL CONSTANTS
// ──────────────────────────────────────────────────────────────────────

const VALID_OWNER_TYPES = new Set(['user', 'org']);
const VALID_STATUSES = new Set(['draft', 'published', 'archived']);
const VALID_OPS = new Set(['<=', '<', '>=', '>']);
const VALID_ACTIONS = new Set(['zero', 'cap']);

/**
 * @typedef {Object} AxisDef
 * @property {string} key
 * @property {boolean} enabled
 * @property {number} weight
 */
/**
 * @typedef {Object} VetoRule
 * @property {string} axis
 * @property {'<=' | '<' | '>=' | '>'} op
 * @property {number} value
 * @property {'zero' | 'cap'} action
 */
/**
 * @typedef {Object} VetoConfig
 * @property {boolean} enabled
 * @property {VetoRule[]} rules
 */
/**
 * @typedef {Object} VerdictThresholds
 * @property {number} green
 * @property {number} yellow
 * @property {number} red
 */
/**
 * @typedef {Object} VerdictBand
 * @property {string} label
 * @property {number} min
 * @property {number} max
 */
/**
 * @typedef {Object} EisScoreTemplate
 * @property {string} id
 * @property {string} name
 * @property {string} based_on
 * @property {string} owner_type
 * @property {string} owner_id
 * @property {string} status
 * @property {number} version
 * @property {AxisDef[]} axes
 * @property {VetoConfig} veto
 * @property {VerdictThresholds} verdictThresholds
 * @property {VerdictBand[]} [verdict_bands]
 */
/**
 * @typedef {Object} DraftOptions
 * @property {string} [name]
 * @property {string} [ownerId]
 * @property {'user' | 'org'} [ownerType]
 * @property {string} [basedOn]
 */
/**
 * @typedef {Object} AxisContribution
 * @property {number} score
 * @property {number} weight
 * @property {number} contribution
 */
/**
 * @typedef {Object} EisResult
 * @property {number} eis
 * @property {string} verdict
 * @property {Readonly<Record<string, Readonly<AxisContribution>>>} axisContributions
 * @property {boolean} vetoTriggered
 * @property {string | null} vetoAxis
 * @property {string} template_id
 */
/**
 * @typedef {Object} Change
 * @property {string} field
 * @property {unknown} from
 * @property {unknown} to
 */
/**
 * @typedef {Object} DiffResult
 * @property {ReadonlyArray<Readonly<Change>>} changes
 * @property {string} summary
 */
/**
 * @typedef {Object} PublishResult
 * @property {Readonly<EisScoreTemplate> | null} template
 * @property {ReadonlyArray<string>} errors
 */
/**
 * @typedef {Object} LegacyParams
 * @property {string} name
 * @property {string} ownerId
 * @property {string} [ownerType]
 */
/**
 * @typedef {Object} BlankParams
 * @property {string} name
 * @property {string} ownerId
 * @property {string} [ownerType]
 * @property {string} [description]
 */
/**
 * @typedef {Object} LegacyScoreResult
 * @property {number} score
 * @property {string | null} verdict
 * @property {boolean} vetoed
 * @property {string | null} [vetoedBy]
 * @property {Record<string, number>} axisContrib
 */

// ──────────────────────────────────────────────────────────────────────
// INTERNAL HELPERS
// ──────────────────────────────────────────────────────────────────────

/**
 * Evaluates a veto rule comparison: score OP ruleValue.
 *
 * @param {number} score
 * @param {'<=' | '<' | '>=' | '>'} op
 * @param {number} ruleValue
 * @returns {boolean}
 */
function _evalOp(score: number, op: '<=' | '<' | '>=' | '>', ruleValue: number): boolean {
    switch (op) {
        case '<=':
            return score <= ruleValue;
        case '<':
            return score < ruleValue;
        case '>=':
            return score >= ruleValue;
        case '>':
            return score > ruleValue;
        default:
            return false;
    }
}

/**
 * Deep-clones a plain object/array via JSON round-trip.
 *
 * @param {*} val
 * @returns {*}
 */
function _deepClone<T>(val: T): T {
    return _deepCloneCanonical(val);
}

// ──────────────────────────────────────────────────────────────────────
// LEGACY CONSTANTS (preserved for backward compat)
// ──────────────────────────────────────────────────────────────────────

/**
 * Standard EIS axes list.
 */
export const EIS_AXES: ReadonlyArray<string> = Object.freeze(['T', 'A', 'Cp', 'Ty', 'Cs', 'Cm']);

interface AxisDef {
    key: string;
    enabled: boolean;
    weight: number;
}

interface VetoRule {
    axis: string;
    op: '<=' | '<' | '>=' | '>';
    value: number;
    action: 'zero' | 'cap';
}

interface VetoConfig {
    enabled: boolean;
    rules: VetoRule[];
}

interface VerdictThresholds {
    green: number;
    yellow: number;
    red: number;
}

interface VerdictBand {
    label: string;
    min: number;
    max: number;
}

interface EisScoreTemplate {
    id: string;
    name: string;
    based_on: string;
    owner_type: 'user' | 'org';
    owner_id: string;
    status: 'draft' | 'published' | 'archived';
    version: number;
    axes: AxisDef[];
    veto: VetoConfig;
    verdictThresholds: VerdictThresholds;
    verdict_bands?: VerdictBand[];
}

/**
 * STANDARD_EIS_TEMPLATE - canonical frozen template (EIS-CUSTOM-001 spec).
 */
export const STANDARD_EIS_TEMPLATE = Object.freeze({
    id: 'eis-standard',
    name: 'EIS Standard (3CTA+)',
    based_on: 'default',
    owner_type: 'org',
    owner_id: 'ecbt-system',
    status: 'published',
    version: 1,
    axes: Object.freeze([
        Object.freeze({ key: 'T', enabled: true, weight: 3 }),
        Object.freeze({ key: 'A', enabled: true, weight: 3 }),
        Object.freeze({ key: 'Cp', enabled: true, weight: 2 }),
        Object.freeze({ key: 'Ty', enabled: true, weight: 2 }),
        Object.freeze({ key: 'Cs', enabled: true, weight: 1 }),
        Object.freeze({ key: 'Cm', enabled: true, weight: 1 }),
    ]),
    veto: Object.freeze({
        enabled: true,
        rules: Object.freeze([
            Object.freeze({ axis: 'T', op: '<=', value: 2, action: 'zero' }),
            Object.freeze({ axis: 'A', op: '<=', value: 2, action: 'zero' }),
        ]),
    }),
    verdictThresholds: Object.freeze({ green: 4.5, yellow: 3.5, red: 0 }),
});

/**
 * DEFAULT_TEMPLATE - legacy alias. id='default'. Kept for backward compat
 */
export const DEFAULT_TEMPLATE = Object.freeze({
    id: 'default',
    name: 'EIS Padrão',
    description: 'Baseline TCCCA+T imutável',
    based_on: 'default',
    owner_type: 'system',
    owner_id: 'ecbyts',
    status: 'published',
    version: 1,
    axes: Object.freeze([
        Object.freeze({ key: 'T', enabled: true, weight: 3.0 }),
        Object.freeze({ key: 'A', enabled: true, weight: 3.0 }),
        Object.freeze({ key: 'Cp', enabled: true, weight: 2.0 }),
        Object.freeze({ key: 'Ty', enabled: true, weight: 2.0 }),
        Object.freeze({ key: 'Cs', enabled: true, weight: 1.0 }),
        Object.freeze({ key: 'Cm', enabled: true, weight: 1.0 }),
    ]),
    veto: Object.freeze({
        enabled: true,
        rules: Object.freeze([
            Object.freeze({ axis: 'T', op: '<=', value: 2, action: 'zero' }),
            Object.freeze({ axis: 'A', op: '<=', value: 2, action: 'zero' }),
        ]),
    }),
    verdict_bands: Object.freeze([
        Object.freeze({ label: 'fail', min: 0, max: 3.5 }),
        Object.freeze({ label: 'warn', min: 3.5, max: 4.5 }),
        Object.freeze({ label: 'pass', min: 4.5, max: 5.0 }),
    ]),
    verdictThresholds: Object.freeze({ green: 4.5, yellow: 3.5, red: 0 }),
});

// ──────────────────────────────────────────────────────────────────────
// 1. createDraftTemplate (EIS-CUSTOM-001 spec)
// ──────────────────────────────────────────────────────────────────────

interface DraftOptions {
    name: string;
    ownerId: string;
    ownerType?: 'user' | 'org';
    basedOn?: string;
}

/**
 * Creates a new draft EIS score template copying the standard EIS axis
 * defaults (6 axes: T/A weight=3, Cp/Ty weight=2, Cs/Cm weight=1).
 *
 * @param {DraftOptions} [options]
 * @returns {Readonly<Record<string, unknown>>}
 */
export function createDraftTemplate(
    options: DraftOptions = {} as DraftOptions,
): Readonly<Record<string, unknown>> {
    const { name, ownerId, ownerType = 'user', basedOn = 'default' } = options;
    if (typeof name !== 'string' || name.trim() === '') {
        throw new TypeError('[EIS-CUSTOM] createDraftTemplate: "name" é obrigatório e não pode ser vazio.');
    }
    if (!ownerId) {
        throw new TypeError('[EIS-CUSTOM] createDraftTemplate: "ownerId" é obrigatório.');
    }

    const id = 'custom-' + Date.now().toString(36);

    return Object.freeze({
        id,
        name: name.trim(),
        based_on: basedOn,
        owner_type: ownerType,
        owner_id: String(ownerId),
        status: 'draft',
        version: 1,
        axes: Object.freeze([
            Object.freeze({ key: 'T', enabled: true, weight: 3 }),
            Object.freeze({ key: 'A', enabled: true, weight: 3 }),
            Object.freeze({ key: 'Cp', enabled: true, weight: 2 }),
            Object.freeze({ key: 'Ty', enabled: true, weight: 2 }),
            Object.freeze({ key: 'Cs', enabled: true, weight: 1 }),
            Object.freeze({ key: 'Cm', enabled: true, weight: 1 }),
        ]),
        veto: Object.freeze({
            enabled: true,
            rules: Object.freeze([
                Object.freeze({ axis: 'T', op: '<=', value: 2, action: 'zero' }),
                Object.freeze({ axis: 'A', op: '<=', value: 2, action: 'zero' }),
            ]),
        }),
        verdictThresholds: Object.freeze({ green: 4.5, yellow: 3.5, red: 0 }),
    });
}

// ──────────────────────────────────────────────────────────────────────
// 2. validateTemplate (EIS-CUSTOM-001 spec)
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {EisScoreTemplate | null | undefined} _template
 * @returns {Readonly<{ valid: boolean, errors: ReadonlyArray<string> }>}
 */
export function validateTemplate(_template: unknown): Readonly<{ valid: boolean; errors: ReadonlyArray<string> }> {
    const template = _template as EisScoreTemplate | null;
    const errors: string[] = [];

    if (!template || typeof template !== 'object') {
        errors.push('template must be an object');
        return Object.freeze({ valid: false, errors: Object.freeze(errors) }) as Readonly<{ valid: boolean; errors: ReadonlyArray<string> }>;
    }

    // Required string fields
    if (!template.id || typeof template.id !== 'string') {
        errors.push('id: required non-empty string');
    }
    if (!template.name || typeof template.name !== 'string') {
        errors.push('name required');
    }
    if (!template.owner_id || typeof template.owner_id !== 'string') {
        errors.push('owner_id required');
    }
    if (!VALID_OWNER_TYPES.has(template.owner_type)) {
        errors.push(`owner_type: must be one of ${[...VALID_OWNER_TYPES].join('|')}, got "${template.owner_type}"`);
    }
    if (!VALID_STATUSES.has(template.status)) {
        errors.push(`status: must be one of ${[...VALID_STATUSES].join('|')}, got "${template.status}"`);
    }

    // version: positive integer
    if (!Number.isInteger(template.version) || template.version < 1) {
        errors.push('version: must be a positive integer');
    }

    // axes validation
    if (!Array.isArray(template.axes)) {
        errors.push('axes must be array');
    } else {
        const enabledAxes = template.axes.filter((a) => a && a.enabled);

        if (enabledAxes.length === 0) {
            errors.push('axes: at least one axis must be enabled');
        }

        // Duplicate key check
        const keys = template.axes.map((a) => a?.key).filter(Boolean);
        const uniqueKeys = new Set(keys);
        if (uniqueKeys.size !== keys.length) {
            errors.push('axes: duplicate axis keys are not allowed');
        }

        // Each axis: weight check
        for (const axis of template.axes) {
            if (typeof axis?.weight !== 'number' || axis.weight < 0) {
                errors.push(`axis ${axis?.key || '?'}: weight must be ≥0 number`);
            } else if (axis.enabled && axis.weight <= 0) {
                errors.push(`axes[${axis.key}]: weight must be a positive number, got ${axis.weight}`);
            }
        }

        // Sum of enabled weights > 0
        const weightSum = enabledAxes.reduce(
            (s, a) => s + (typeof a.weight === 'number' ? a.weight : 0),
            0,
        );
        if (weightSum <= 0) {
            errors.push('sum of enabled weights must be > 0');
        }
    }

    // veto validation
    if (!template.veto || typeof template.veto !== 'object') {
        errors.push('veto: must be an object with enabled and rules fields');
    } else {
        if (typeof template.veto.enabled !== 'boolean') {
            errors.push('veto.enabled: must be boolean');
        }
        if (!Array.isArray(template.veto.rules)) {
            errors.push('veto.rules: must be an array');
        } else if (template.veto.enabled) {
            const axisKeys = Array.isArray(template.axes)
                ? new Set(template.axes.map((a) => a?.key))
                : new Set();
            for (const rule of template.veto.rules) {
                if (!rule || typeof rule !== 'object') continue;
                if (!axisKeys.has(rule?.axis)) {
                    errors.push(`veto rule refs unknown axis: ${rule?.axis}`);
                }
                if (!VALID_OPS.has(rule?.op)) {
                    errors.push(`veto rule: invalid op ${rule?.op}`);
                }
                if (!VALID_ACTIONS.has(rule?.action)) {
                    errors.push(`veto rule: invalid action ${rule?.action}`);
                }
                if (!Number.isFinite(rule?.value)) {
                    errors.push(`veto rule: value must be number`);
                }
            }
        }
    }

    // verdictThresholds validation (new spec field)
    if (template.verdictThresholds && typeof template.verdictThresholds === 'object') {
        const { green, yellow, red } = template.verdictThresholds;
        if (typeof green === 'number' && typeof yellow === 'number' && typeof red === 'number') {
            if (green <= yellow) {
                errors.push(`verdictThresholds: green (${green}) must be > yellow (${yellow})`);
            }
            if (yellow <= red) {
                errors.push(`verdictThresholds: yellow (${yellow}) must be > red (${red})`);
            }
            if (red < 0) {
                errors.push(`verdictThresholds: red (${red}) must be >= 0`);
            }
        }
    }

    // verdict_bands validation (legacy field - optional)
    if (template.verdict_bands !== undefined) {
        if (!Array.isArray(template.verdict_bands) || template.verdict_bands.length === 0) {
            errors.push('verdict_bands must have at least 1 band');
        } else {
            const sorted = template.verdict_bands
                .slice()
                .sort((a, b) => a.min - b.min);
            for (let i = 0; i < sorted.length; i++) {
                const b = sorted[i]!;
                if (typeof b?.min !== 'number' || typeof b?.max !== 'number') {
                    errors.push(`band ${b?.label || i}: min/max must be numbers`);
                    continue;
                }
                if (b.min >= b.max) errors.push(`band ${b.label}: min >= max`);
                const previous = i > 0 ? sorted[i - 1] : undefined;
                if (previous && b.min < previous.max) {
                    errors.push(`band overlap: ${previous.label} × ${b.label}`);
                }
            }
        }
    }

    const valid = errors.length === 0;
    return Object.freeze({ valid, errors: Object.freeze(errors) }) as Readonly<{ valid: boolean; errors: ReadonlyArray<string> }>;
}

// ──────────────────────────────────────────────────────────────────────
// 3. computeEisFromTemplate (EIS-CUSTOM-001 spec)
// ──────────────────────────────────────────────────────────────────────

interface AxisContribution {
    score: number;
    weight: number;
    contribution: number;
}

interface EisResult {
    eis: number;
    verdict: string;
    axisContributions: Readonly<Record<string, Readonly<AxisContribution>>>;
    vetoTriggered: boolean;
    vetoAxis: string | null;
    template_id: string;
}

/**
 * Computes an EIS score from a custom template and per-axis input scores.
 *
 * @param {EisScoreTemplate | null | undefined} _template
 * @param {Record<string, number>} axisScores
 * @returns {EisResult}
 */
export function computeEisFromTemplate(_template: unknown, axisScores: Record<string, number>): EisResult {
    const template = _template as EisScoreTemplate | null;
    if (!template || !Array.isArray(template.axes)) {
        throw new RangeError('[EIS-CUSTOM] computeEisFromTemplate: no enabled axes in template');
    }

    const enabledAxes = template.axes.filter((a) => a && a.enabled);
    if (enabledAxes.length === 0) {
        throw new RangeError('[EIS-CUSTOM] computeEisFromTemplate: no enabled axes in template');
    }

    const sumWeights = enabledAxes.reduce((s, a) => s + a.weight, 0);

    // Build clamped score map
    /** @type {Record<string, number>} */
    const clampedScores: Record<string, number> = {};
    for (const axis of enabledAxes) {
        const rawInput = (axisScores || {})[axis.key];
        const raw = typeof rawInput === 'number' ? rawInput : 0;
        clampedScores[axis.key] = Math.max(0, Math.min(5, raw));
    }

    // Veto evaluation (in rule order)
    let vetoTriggered = false;
    let vetoAxis: string | null = null;

    if (template?.veto && template.veto.enabled && Array.isArray(template.veto.rules)) {
        for (const rule of template.veto.rules) {
            const axisScore = clampedScores[rule.axis];
            if (axisScore === undefined) continue; // axis not in enabled set

            if (_evalOp(axisScore, rule.op, rule.value)) {
                if (rule.action === 'zero') {
                    vetoTriggered = true;
                    vetoAxis = rule.axis;
                    break;
                } else if (rule.action === 'cap') {
                    clampedScores[rule.axis] = Math.min(axisScore, rule.value);
                }
            }
        }
    }

    // Build axis contributions
    /** @type {Record<string, Readonly<AxisContribution>>} */
    const axisContributions: Record<string, Readonly<AxisContribution>> = {};
    for (const axis of enabledAxes) {
        const score = clampedScores[axis.key] ?? 0;
        const normWeight = axis.weight / sumWeights;
        axisContributions[axis.key] = Object.freeze({
            score,
            weight: axis.weight,
            contribution: Math.pow(score, normWeight),
        });
    }

    // Early return for veto=zero
    if (vetoTriggered) {
        return Object.freeze({
            eis: 0.0,
            verdict: 'red',
            axisContributions: Object.freeze(axisContributions),
            vetoTriggered: true,
            vetoAxis,
            template_id: template.id,
        });
    }

    // Weighted geometric mean: EIS = ∏(score_i ^ (w_i / sumW))
    let rawEis = 1;
    for (const axis of enabledAxes) {
        rawEis *= Math.pow(clampedScores[axis.key] ?? 0, axis.weight / sumWeights);
    }

    const eis = parseFloat(rawEis.toFixed(2));

    // Verdict from verdictThresholds
    const thresholds = template?.verdictThresholds || { green: 4.5, yellow: 3.5, red: 0 };
    let verdict: string;
    if (eis >= thresholds.green) {
        verdict = 'green';
    } else if (eis >= thresholds.yellow) {
        verdict = 'yellow';
    } else {
        verdict = 'red';
    }

    return Object.freeze({
        eis,
        verdict,
        axisContributions: Object.freeze(axisContributions),
        vetoTriggered: false,
        vetoAxis: null,
        template_id: template.id,
    });
}

// ──────────────────────────────────────────────────────────────────────
// 4. diffTemplates (EIS-CUSTOM-001 spec)
// ──────────────────────────────────────────────────────────────────────

interface Change {
    field: string;
    from: unknown;
    to: unknown;
}

interface DiffResult {
    changes: ReadonlyArray<Readonly<Change>>;
    summary: string;
}

/**
 * Compares two EIS templates field by field and returns the differences.
 *
 * @param {EisScoreTemplate | null | undefined} _templateA
 * @param {EisScoreTemplate | null | undefined} _templateB
 * @returns {DiffResult}
 */
export function diffTemplates(_templateA: unknown, _templateB: unknown): DiffResult {
    const templateA = _templateA as EisScoreTemplate | null;
    const templateB = _templateB as EisScoreTemplate | null;
    /** @type {Change[]} */
    const changes: Change[] = [];

    /**
     * @param {string} field
     * @param {unknown} from
     * @param {unknown} to
     */
    function checkField(field: string, from: unknown, to: unknown) {
        if (from !== to) {
            changes.push(Object.freeze({ field, from, to }));
        }
    }

    checkField('name', templateA?.name, templateB?.name);
    checkField('veto.enabled', templateA?.veto?.enabled, templateB?.veto?.enabled);

    /** @type {Record<string, unknown>} */
    const vtA: Record<string, unknown> = (templateA?.verdictThresholds || {}) as Record<string, unknown>;
    /** @type {Record<string, unknown>} */
    const vtB: Record<string, unknown> = (templateB?.verdictThresholds || {}) as Record<string, unknown>;
    for (const key of ['green', 'yellow', 'red'] as const) {
        checkField(`verdictThresholds.${key}`, vtA[key], vtB[key]);
    }

    /** @type {Record<string, AxisDef>} */
    const axesMapA: Record<string, AxisDef> = {};
    for (const axis of templateA?.axes || []) {
        if (axis?.key) axesMapA[axis.key] = axis;
    }
    /** @type {Record<string, AxisDef>} */
    const axesMapB: Record<string, AxisDef> = {};
    for (const axis of templateB?.axes || []) {
        if (axis?.key) axesMapB[axis.key] = axis;
    }

    const allKeys = new Set([...Object.keys(axesMapA), ...Object.keys(axesMapB)]);
    for (const key of allKeys) {
        const axA = axesMapA[key];
        const axB = axesMapB[key];
        checkField(`${key}.weight`, axA ? axA.weight : undefined, axB ? axB.weight : undefined);
        checkField(`${key}.enabled`, axA ? axA.enabled : undefined, axB ? axB.enabled : undefined);
    }

    const changeCount = changes.length;
    const summary =
        changeCount === 0
            ? 'no changes'
            : `${changeCount} change${changeCount !== 1 ? 's' : ''}: ${changes.map((c) => c.field).join(', ')}`;

    return Object.freeze({
        changes: Object.freeze(changes),
        summary,
    });
}

// ──────────────────────────────────────────────────────────────────────
// 5. publishTemplate (EIS-CUSTOM-001 spec - throws on invalid)
// ──────────────────────────────────────────────────────────────────────

interface PublishResult {
    template: Readonly<EisScoreTemplate> | null;
    errors: string[];
}

/**
 * Validates and publishes an EIS template.
 *
 * @param {EisScoreTemplate | null | undefined} _template
 * @returns {PublishResult}
 */
export function publishTemplate(_template: unknown): PublishResult {
    const template = _template as EisScoreTemplate | null;
    // Reject attempts to publish the DEFAULT_TEMPLATE directly.
    if (template && (template.id === 'default' || (template as any).owner_type === 'system')) {
        return {
            template: null,
            errors: ['Cannot publish the default template directly — clone it first via cloneBaselineTemplate()'],
        };
    }

    const validation = validateTemplate(template);
    if (!validation.valid) {
        return { template: null, errors: validation.errors as string[] };
    }

    if (!template) return { template: null, errors: ['template is null'] };
    const cloned = _deepClone(template);
    cloned.status = 'published';
    cloned.version = template.version + 1;

    // Re-freeze nested structures
    if (cloned.veto) {
        if (Array.isArray(cloned.veto.rules)) {
            cloned.veto.rules = Object.freeze(cloned.veto.rules.map(Object.freeze)) as any;
        }
        cloned.veto = Object.freeze(cloned.veto);
    }
    if (cloned.verdictThresholds) {
        cloned.verdictThresholds = Object.freeze(cloned.verdictThresholds);
    }
    if (Array.isArray(cloned.axes)) {
        cloned.axes = Object.freeze(cloned.axes.map(Object.freeze)) as any;
    }

    return { template: Object.freeze(cloned), errors: [] };
}

// ──────────────────────────────────────────────────────────────────────
// LEGACY API - backward compatibility (do not remove without ADR)
// ──────────────────────────────────────────────────────────────────────

interface LegacyParams {
    name: string;
    ownerId: string;
    ownerType?: string;
}

/**
 * @param {LegacyParams} params
 * @returns {Record<string, unknown>}
 *
 * @deprecated Use createDraftTemplate() instead.
 */
export function cloneBaselineTemplate(params: LegacyParams): Record<string, unknown> {
    if (!params || typeof params !== 'object') throw new Error('cloneBaselineTemplate: params required');
    const { name, ownerId } = params;
    if (!name || typeof name !== 'string' || name.trim() === '') throw new Error('name required');
    if (!ownerId || typeof ownerId !== 'string') throw new Error('ownerId required');

    // Deep-clone DEFAULT_TEMPLATE to get a mutable object
    const clone = _deepClone(DEFAULT_TEMPLATE);
    const now = new Date().toISOString();
    return {
        ...clone,
        id: generateId('eis-custom', 6),
        name: name.trim(),
        based_on: 'default',
        owner_type: params.ownerType || 'user',
        owner_id: ownerId,
        status: 'draft',
        version: 1,
        created_at: now,
        updated_at: now,
        created_by: ownerId,
        updated_by: ownerId,
    };
}

interface BlankParams {
    name: string;
    ownerId: string;
    ownerType?: string;
    description?: string;
}

/**
 * Cria template em branco (todos eixos disabled, weights=0).
 *
 * @param {BlankParams} params
 * @returns {Record<string, unknown>}
 */
export function createBlankTemplate(params: BlankParams): Record<string, unknown> {
    if (!params?.name || !params?.ownerId) throw new Error('name and ownerId required');
    const now = new Date().toISOString();
    return {
        id: generateId('eis-custom', 6),
        name: params.name.trim(),
        description: params.description || '',
        based_on: 'blank',
        owner_type: params.ownerType || 'user',
        owner_id: params.ownerId,
        status: 'draft',
        version: 1,
        axes: EIS_AXES.map((key) => ({ key, enabled: false, weight: 0 })),
        veto: { enabled: false, rules: [] },
        verdict_bands: [{ label: 'fail', min: 0, max: 5.0 }],
        verdictThresholds: { green: 4.5, yellow: 3.5, red: 0 },
        created_at: now,
        updated_at: now,
        created_by: params.ownerId,
        updated_by: params.ownerId,
    };
}

interface LegacyScoreResult {
    score: number;
    verdict: string | null;
    vetoed: boolean;
    vetoedBy?: string | null;
    axisContrib: Record<string, number>;
}

/**
 * @param {Record<string, number>} axisScores
 * @param {EisScoreTemplate | null | undefined} number>
 * @returns {LegacyScoreResult}
 *
 * @deprecated Use computeEisFromTemplate() for the weighted geometric mean.
 */
export function computeCustomScore(axisScores: Record<string, number>, _template: unknown): LegacyScoreResult {
    const template = _template as EisScoreTemplate | null;
    if (!template || !Array.isArray(template.axes)) {
        return { score: 0, verdict: null, vetoed: false, axisContrib: {} };
    }

    /** @type {Record<string, number>} */
    const scores = { ...(axisScores || {}) };
    let vetoedBy: string | null = null;

    if (template.veto?.enabled && Array.isArray(template.veto.rules)) {
        for (const rule of template.veto.rules) {
            const v = Number(scores[rule.axis]);
            if (!Number.isFinite(v)) continue;
            if (_evalOp(v, rule.op, rule.value)) {
                if (rule.action === 'zero') {
                    vetoedBy = rule.axis;
                    break;
                }
                if (rule.action === 'cap') {
                    scores[rule.axis] = rule.value;
                }
            }
        }
    }

    if (vetoedBy !== null) {
        return { score: 0, verdict: null, vetoed: true, vetoedBy, axisContrib: {} };
    }

    const enabled = template.axes.filter((a) => a?.enabled);
    const totalWeight = enabled.reduce((s, a) => s + (Number(a.weight) || 0), 0);
    if (totalWeight === 0) return { score: 0, verdict: null, vetoed: false, axisContrib: {} };

    let sum = 0;
    /** @type {Record<string, number>} */
    const axisContrib: Record<string, number> = {};
    for (const ax of enabled) {
        const v = Number(scores[ax.key]);
        if (Number.isFinite(v)) {
            const contrib = v * ax.weight;
            sum += contrib;
            axisContrib[ax.key] = contrib / totalWeight;
        }
    }

    const score = sum / totalWeight;

    // Classify verdict from verdict_bands (legacy) or verdictThresholds (new)
    let verdict: string | null = null;
    if (Array.isArray(template.verdict_bands)) {
        for (const b of template.verdict_bands) {
            if (score >= b.min && score < b.max) {
                verdict = b.label;
                break;
            }
        }
        if (verdict === null) {
            const last = template.verdict_bands[template.verdict_bands.length - 1];
            if (last && score === last.max) verdict = last.label;
        }
    }

    return { score, verdict, vetoed: false, axisContrib };
}
