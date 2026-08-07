// @ts-check
/**
 * ecbyts - Domain Validator Engine v3 (generic, entity-model)
 *
 * Architecture:
 *   Record rules  - validate single record
 *   Batch rules   - validate across records (uniqueKey, cross-record)
 *   Dataset rules - validate across entities (referential integrity)
 *
 * Domains are 100% user-defined via JSON. No built-in domains.
 * Use domainLoader.js to register JSON domain definitions.
 *
 * @license AGPL-3.0-only
 */

import { CODES, hint } from './errorCodes.js';

const ERROR_CODES = /** @type {Record<string, string>} */ (CODES);
const makeHint = /** @type {(code: string, action: string, field: string, message: string, allowed?: string[]) => any} */ (hint);

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {'ingest'|'sign'|'export'} ValidationMode
 * @typedef {'error'|'warning'|'info'} Severity
 * @typedef {{ field: string, severity: Severity, message: string, rule: string, code: string, machine_hint?: any, index?: number }} ValidationResult
 * @typedef {{ effective_from?: string, effective_until?: string, modes?: ValidationMode[], export_organs?: string[] }} RuleMeta
 * @typedef {(data: Record<string, any>, ctx: ValidationContext) => ValidationResult[]} ValidatorFn
 * @typedef {(records: Record<string, any>[], ctx: ValidationContext) => ValidationResult[]} BatchValidatorFn
 * @typedef {{ fn: ValidatorFn, meta: RuleMeta }} VersionedRule
 * @typedef {{ fn: BatchValidatorFn, meta: RuleMeta }} BatchRule
 * @typedef {{ name: string, rules: VersionedRule[], batchRules?: BatchRule[] }} DomainConfig
 * @typedef {{ mode: ValidationMode, reference_date: string, export_organ?: string }} ValidationContext
 * @typedef {{ mode: ValidationMode, reference_date?: string, export_organ?: string }} ValidationOptions
 * @typedef {{ min?: number, max?: number }} NumericOptions
 * @typedef {{ domain: string, mode: ValidationMode, reference_date: string, valid: boolean, errors: ValidationResult[], warnings: ValidationResult[], info: ValidationResult[], all: ValidationResult[], machine_summary: Record<string, any> }} ValidationOutput
 */

const VALID_MODES = new Set(['ingest', 'sign', 'export']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ── Registry ──────────────────────────────────────────────────────────────────

/** @type {Map<string, DomainConfig>} */
const _registry = new Map();

/** Register a domain configuration. */
/**
 * @param {string} domain
 * @param {DomainConfig} config
 */
export function registerDomain(domain: any, config: any) {
    _registry.set(domain.toUpperCase(), config);
}

/** Unregister a domain. */
/** @param {string} domain */
export function unregisterDomain(domain: any) {
    _registry.delete(domain.toUpperCase());
}

/** Clear all registered domains. */
export function clearRegistry() {
    _registry.clear();
}

/** List all registered domain names. */
export function listDomains() {
    return [..._registry.keys()];
}

/** Get a domain config by name. */
/** @param {string} domain */
export function getDomainConfig(domain: any) {
    return _registry.get(domain.toUpperCase());
}

// ── Input validation ──────────────────────────────────────────────────────────

/** @param {string} d */
function normalizeDate(d: any) {
    if (ISO_DATE_RE.test(d)) {
        const parsed = new Date(d + 'T00:00:00Z');
        if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== d) {
            throw new Error(`Invalid reference_date: "${d}". Not a real calendar date.`);
        }
        return d;
    }
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid reference_date: "${d}". Expected YYYY-MM-DD.`);
    }
    return parsed.toISOString().slice(0, 10);
}

/**
 * @param {Partial<ValidationContext>} opts
 * @returns {ValidationContext}
 */
function buildContext(opts: any) {
    const mode = /** @type {ValidationMode} */ (opts.mode ?? 'ingest');
    if (!VALID_MODES.has(mode)) {
        throw new Error(`Invalid mode: "${mode}". Valid: ${[...VALID_MODES].join(', ')}`);
    }
    if (mode === 'export' && !opts.export_organ) {
        throw new Error('export mode requires export_organ.');
    }
    return {
        mode,
        reference_date: normalizeDate(opts.reference_date || new Date().toISOString().slice(0, 10)),
        export_organ: opts.export_organ,
    };
}

// ── Rule filtering ────────────────────────────────────────────────────────────

/**
 * @template {{meta: RuleMeta}} T
 * @param {T[]} items
 * @param {ValidationContext} ctx
 * @returns {T[]}
 */
function filterByMeta(items: any, ctx: any) {
    return items.filter(({
        meta
    }: any) => {
        if (meta.effective_from && ctx.reference_date < meta.effective_from) return false;
        if (meta.effective_until && ctx.reference_date > meta.effective_until) return false;
        if (meta.modes?.length && !meta.modes.includes(ctx.mode)) return false;
        if (meta.export_organs?.length) {
            if (ctx.mode !== 'export') return false;
            if (!ctx.export_organ) return false;
            if (!meta.export_organs.includes(ctx.export_organ)) return false;
        }
        return true;
    });
}

/**
 * @param {ValidationResult[]} results
 * @param {ValidationMode} mode
 */
function escalateSeverities(results: any, mode: any) {
    if (mode !== 'sign') return;
    for (const r of results) {
        if (r.severity === 'warning') {
            r.severity = 'error';
            r.message = `[SIGN] ${r.message}`;
        }
    }
}

/**
 * @param {ValidationResult[]} all
 * @param {ValidationContext} ctx
 */
function buildOutput(all: any, ctx: any) {
    const errors = all.filter((r: any) => r.severity === 'error');
    const warnings = all.filter((r: any) => r.severity === 'warning');
    return {
        mode: ctx.mode,
        reference_date: ctx.reference_date,
        valid: errors.length === 0,
        errors,
        warnings,
        info: all.filter((r: any) => r.severity === 'info'),
        all,
        machine_summary: {
            blocking_codes: errors.map((e: any) => e.code),
            advisory_codes: warnings.map((w: any) => w.code),
            fix_hints: all.filter((r: any) => r.machine_hint).map((r: any) => r.machine_hint),
        },
    };
}

// ── Core: single record ───────────────────────────────────────────────────────

/**
 * Validate a single record against a registered domain.
 * @param {string} domain
 * @param {Record<string, any>} data
 * @param {Partial<ValidationContext>} [opts]
 */
export function validate(domain: any, data: any, opts = {}) {
    const key = domain.toUpperCase();
    const config = _registry.get(key);
    if (!config) throw new Error(`Domain not registered: ${key}. Available: ${listDomains().join(', ')}`);

    const ctx = buildContext(opts);
    const fns = filterByMeta(config.rules, ctx).map((/** @type {VersionedRule} */ r: any) => r.fn);
    const all = fns.flatMap((fn: any) => fn(data, ctx));
    escalateSeverities(all, ctx.mode);

    return { domain: key, ...buildOutput(all, ctx) };
}

// ── Core: batch ───────────────────────────────────────────────────────────────

/**
 * Validate a batch of records (record-level + batch rules).
 * @param {string} domain
 * @param {Record<string, any>[]} records
 * @param {Partial<ValidationContext>} [opts]
 */
export function validateBatch(domain: any, records: any, opts = {}) {
    const key = domain.toUpperCase();
    const config = _registry.get(key);
    if (!config) throw new Error(`Domain not registered: ${key}. Available: ${listDomains().join(', ')}`);

    const ctx = buildContext(opts);
    const recordFns = filterByMeta(config.rules, ctx).map((/** @type {VersionedRule} */ r: any) => r.fn);
    const batchFns = filterByMeta(config.batchRules || [], ctx).map((/** @type {BatchRule} */ r: any) => r.fn);

    const perRecord = records.map((record: any, index: any) => {
        const all = recordFns.flatMap((fn: any) => fn(record, ctx));
        escalateSeverities(all, ctx.mode);
        return { index, ...buildOutput(all, ctx) };
    });

    const batchResults = batchFns.flatMap((fn: any) => fn(records, ctx));
    escalateSeverities(batchResults, ctx.mode);

    return {
        domain: key,
        mode: ctx.mode,
        reference_date: ctx.reference_date,
        totalRecords: records.length,
        validCount: perRecord.filter((r: any) => r.valid).length,
        invalidCount: perRecord.filter((r: any) => !r.valid).length,
        results: perRecord,
        batchErrors: batchResults.filter((r: any) => r.severity === 'error'),
        batchWarnings: batchResults.filter((r: any) => r.severity === 'warning'),
        batchAll: batchResults,
        allValid: perRecord.every((r: any) => r.valid) && batchResults.filter((r: any) => r.severity === 'error').length === 0,
    };
}

// ── Core: dataset (cross-entity referential integrity) ────────────────────────

/**
 * Validate referential integrity across entities.
 * @param {Record<string, Record<string, any>[]>} dataset
 * @param {Array<{from: string, fromField: string, to: string, toField: string, label: string}>} relations
 * @param {Partial<ValidationContext>} [opts]
 */
export function validateDataset(dataset: any, relations: any, opts = {}) {
    const ctx = buildContext(opts);
    /** @type {ValidationResult[]} */
    const errors: any = [];

    for (const rel of relations) {
        const parentRecords = dataset[rel.to] || [];
        const childRecords = dataset[rel.from] || [];
        const parentKeys = new Set(parentRecords.map((r: any) => r[rel.toField]));

        childRecords.forEach((record: any, index: any) => {
            const val = record[rel.fromField];
            if (val && !parentKeys.has(val)) {
                errors.push({
                    field: rel.fromField,
                    severity: 'error',
                    rule: 'refIntegrity',
                    message: `${rel.label}: "${val}" not found in ${rel.to}.${rel.toField}`,
                    code: ERROR_CODES.COMMON_REF_INTEGRITY,
                    machine_hint: makeHint(
                        ERROR_CODES.COMMON_REF_INTEGRITY,
                        'check_reference',
                        String(rel.fromField),
                        `Value must exist in ${rel.to}.${rel.toField}`,
                    ),
                    index,
                });
            }
        });
    }

    escalateSeverities(errors, ctx.mode);
    return { valid: errors.length === 0, errors };
}

// ── Rule builders ─────────────────────────────────────────────────────────────

/** Wrap a validator function with metadata. */
/**
 * @param {ValidatorFn} fn
 * @param {RuleMeta} [meta]
 * @returns {VersionedRule}
 */
export function rule(fn: any, meta = {}) {
    return { fn, meta };
}

/** Wrap a batch validator function with metadata. */
/**
 * @param {BatchValidatorFn} fn
 * @param {RuleMeta} [meta]
 * @returns {BatchRule}
 */
export function batchRule(fn: any, meta = {}) {
    return { fn, meta };
}

/** Required field rule. */
/**
 * @param {string} field
 * @param {string} label
 * @param {RuleMeta} [meta]
 */
export function required(field: any, label: any, meta = {}) {
    return rule((data: any) => {
        const val = data[field];
        if (val === undefined || val === null || val === '') {
            return [
                {
                    field,
                    severity: 'error',
                    rule: 'required',
                    message: `${label} is required`,
                    code: ERROR_CODES.COMMON_REQUIRED,
                    machine_hint: makeHint(ERROR_CODES.COMMON_REQUIRED, 'set_value', String(field), `Provide ${field}`),
                },
            ];
        }
        return [];
    }, meta);
}

/** Field expected but nullable (EPA 2.9 "If available"). */
/**
 * @param {string} field
 * @param {string} label
 * @param {RuleMeta} [meta]
 */
export function ifAvailable(field: any, label: any, meta = {}) {
    return rule((data: any) => {
        if (!(field in data)) {
            return [
                {
                    field,
                    severity: 'warning',
                    rule: 'ifAvailable',
                    message: `${label} expected (if available). Field omitted.`,
                    code: ERROR_CODES.COMMON_FIELD_OMITTED,
                    machine_hint: makeHint(
                        ERROR_CODES.COMMON_FIELD_OMITTED,
                        'set_value',
                        String(field),
                        `Expected field, set null if unavailable`,
                    ),
                },
            ];
        }
        return [];
    }, meta);
}

/** Allowed values rule. */
/**
 * @param {string} field
 * @param {string} label
 * @param {string[]} allowed
 * @param {RuleMeta} [meta]
 */
export function oneOf(field: any, label: any, allowed: any, meta = {}) {
    const allowedSet = new Set(allowed);
    return rule((data: any) => {
        const val = data[field];
        if (val && !allowedSet.has(val)) {
            return [
                {
                    field,
                    severity: 'error',
                    rule: 'oneOf',
                    message: `${label} invalid: "${val}". Allowed: ${allowed.join(', ')}`,
                    code: ERROR_CODES.COMMON_INVALID_ENUM,
                    machine_hint: makeHint(
                        ERROR_CODES.COMMON_INVALID_ENUM,
                        'change_value',
                        String(field),
                        'Must be one of allowed values',
                        allowed,
                    ),
                },
            ];
        }
        return [];
    }, meta);
}

/** Numeric range rule. */
/**
 * @param {string} field
 * @param {string} label
 * @param {NumericOptions} [opts]
 * @param {RuleMeta} [meta]
 */
export function numeric(field: any, label: any, opts: any = {}, meta = {}) {
    const { min = -Infinity, max = Infinity } = opts;
    return rule((data: any) => {
        const val = data[field];
        if (val === undefined || val === null || val === '') return [];
        const num = Number(val);
        if (isNaN(num)) {
            return [
                {
                    field,
                    severity: 'error',
                    rule: 'numeric',
                    message: `${label} must be numeric`,
                    code: ERROR_CODES.COMMON_INVALID_NUMERIC,
                    machine_hint: makeHint(ERROR_CODES.COMMON_INVALID_NUMERIC, 'change_value', String(field), 'Must be a number'),
                },
            ];
        }
        if (num < min || num > max) {
            return [
                {
                    field,
                    severity: 'error',
                    rule: 'numeric.range',
                    message: `${label} out of range [${min}, ${max}]: ${num}`,
                    code: ERROR_CODES.COMMON_OUT_OF_RANGE,
                    machine_hint: makeHint(
                        ERROR_CODES.COMMON_OUT_OF_RANGE,
                        'change_value',
                        String(field),
                        `Must be between ${min} and ${max}`,
                    ),
                },
            ];
        }
        return [];
    }, meta);
}

/** Regex pattern rule. */
/**
 * @param {string} field
 * @param {string} label
 * @param {RegExp} pattern
 * @param {string} formatHint
 * @param {RuleMeta} [meta]
 */
export function matchPattern(field: any, label: any, pattern: any, formatHint: any, meta = {}) {
    return rule((data: any) => {
        const val = data[field];
        if (val && !pattern.test(String(val))) {
            return [
                {
                    field,
                    severity: 'error',
                    rule: 'pattern',
                    message: `${label} invalid format. Expected: ${formatHint}`,
                    code: ERROR_CODES.COMMON_INVALID_FORMAT,
                    machine_hint: makeHint(
                        ERROR_CODES.COMMON_INVALID_FORMAT,
                        'change_value',
                        String(field),
                        `Expected format: ${formatHint}`,
                    ),
                },
            ];
        }
        return [];
    }, meta);
}

/** Batch rule: composite primary key uniqueness. */
/**
 * @param {string[]} fields
 * @param {string} label
 * @param {RuleMeta} [meta]
 */
export function uniqueKey(fields: any, label: any, meta = {}) {
    return batchRule((records: any, _ctx: any) => {
        /** @type {Map<string, number>} */
        const seen = new Map();
        /** @type {ValidationResult[]} */
        const errors = [];
        for (let i = 0; i < records.length; i++) {
            const key = fields.map((f: any) => String(records[i][f] ?? '')).join('|');
            if (seen.has(key)) {
                errors.push({
                    field: fields.join('+'),
                    severity: 'error',
                    rule: 'uniqueKey',
                    message: `Duplicate PK [${label}]: rows ${seen.get(key)} and ${i}`,
                    code: ERROR_CODES.COMMON_DUPLICATE_KEY,
                    machine_hint: makeHint(
                        ERROR_CODES.COMMON_DUPLICATE_KEY,
                        'manual_review',
                        String(fields[0]),
                        `Duplicate composite key: ${fields.join(', ')}`,
                    ),
                    index: i,
                });
            } else {
                seen.set(key, i);
            }
        }
        return errors;
    }, meta);
}
