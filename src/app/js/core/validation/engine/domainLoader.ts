// @ts-check
/**
 * ecbyts - Domain Loader
 * Deserializes JSON domain definitions into executable DomainConfig
 * objects and registers them in the validator engine.
 *
 * Users create domains via the UI or import JSON templates.
 * This module converts those JSON specs into rule functions.
 *
 * @license AGPL-3.0-only
 */

import {
    registerDomain,
    unregisterDomain,
    rule,
    required,
    ifAvailable,
    oneOf,
    numeric,
    matchPattern,
    uniqueKey,
} from './validatorEngine.js';
import { hint } from './errorCodes.js';

/**
 * Load a JSON domain definition and register all its entities in the engine.
 * @param {any} domainJSON - Domain definition with entities, rules, relations
 * @returns {string[]} - List of registered entity names
 */
export function loadDomainFromJSON(domainJSON: any) {
    if (!domainJSON?.entities?.length) {
        throw new Error('Domain definition must have at least one entity');
    }

    const registered = [];

    for (const entity of domainJSON.entities) {
        if (!entity.name) throw new Error('Each entity must have a name');

        const rules = (entity.rules || []).map((/** @type {any} */ r: any) => buildRuleFromSpec(r));
        const batchRules = (entity.batchRules || []).map((/** @type {any} */ r: any) => buildBatchRuleFromSpec(r));

        registerDomain(entity.name, { name: entity.name, rules, batchRules });
        registered.push(entity.name);
    }

    return registered;
}

/**
 * Unload all entities from a domain definition.
 * @param {any} domainJSON
 */
export function unloadDomain(domainJSON: any) {
    if (!domainJSON?.entities) return;
    for (const entity of domainJSON.entities) {
        if (entity.name) unregisterDomain(entity.name);
    }
}

/**
 * Convert a JSON rule spec into an engine-compatible VersionedRule.
 * @param {any} spec - { type, field, label, ... }
 * @returns {{ fn: Function, meta: object }}
 */
function buildRuleFromSpec(spec: any) {
    const meta = spec.meta || {};

    switch (spec.type) {
        case 'required':
            return required(spec.field, spec.label || spec.field, meta);

        case 'ifAvailable':
            return ifAvailable(spec.field, spec.label || spec.field, meta);

        case 'oneOf':
            if (!Array.isArray(spec.allowed) || spec.allowed.length === 0) {
                throw new Error(`oneOf rule for "${spec.field}" needs allowed[] array`);
            }
            return oneOf(spec.field, spec.label || spec.field, spec.allowed, meta);

        case 'numeric':
            return numeric(spec.field, spec.label || spec.field, spec.opts || {}, meta);

        case 'matchPattern': {
            let pattern;
            try {
                pattern = new RegExp(spec.pattern);
            } catch (_e) {
                throw new Error(`Invalid regex for "${spec.field}": ${spec.pattern}`, { cause: _e });
            }
            return matchPattern(spec.field, spec.label || spec.field, pattern, spec.formatHint || spec.pattern, meta);
        }

        case 'custom':
            return buildCustomRule(spec, meta);

        default:
            throw new Error(`Unknown rule type: "${spec.type}" for field "${spec.field}"`);
    }
}

/**
 * Convert a JSON batch rule spec into an engine-compatible BatchRule.
 * @param {any} spec - { type, fields, label, ... }
 * @returns {{ fn: Function, meta: object }}
 */
function buildBatchRuleFromSpec(spec: any) {
    const meta = spec.meta || {};

    switch (spec.type) {
        case 'uniqueKey':
            if (!Array.isArray(spec.fields) || spec.fields.length === 0) {
                throw new Error('uniqueKey batch rule needs fields[] array');
            }
            return uniqueKey(spec.fields, spec.label || spec.fields.join('+'), meta);

        default:
            throw new Error(`Unknown batch rule type: "${spec.type}"`);
    }
}

/**
 * Build a custom rule from a spec that includes comparison logic.
 * Supports: { type: 'custom', field, operator, value, severity, message, code }
 * Operators: eq, ne, gt, gte, lt, lte, contains, startsWith, endsWith
 */
/** @param {any} spec @param {any} meta */
function buildCustomRule(spec: any, meta: any) {
    const { field, operator, value, severity = 'error', message, code } = spec;
    const label = spec.label || field;
    const customCode = code || 'CUSTOM_RULE';

    return rule((/** @type {any} */ data: any) => {
        const val = data[field];
        if (val === undefined || val === null || val === '') return [];

        let failed: boolean;
        switch (operator) {
            case 'eq':
                failed = val !== value;
                break;
            case 'ne':
                failed = val === value;
                break;
            case 'gt':
                failed = Number(val) <= Number(value);
                break;
            case 'gte':
                failed = Number(val) < Number(value);
                break;
            case 'lt':
                failed = Number(val) >= Number(value);
                break;
            case 'lte':
                failed = Number(val) > Number(value);
                break;
            case 'contains':
                failed = !String(val).includes(String(value));
                break;
            case 'startsWith':
                failed = !String(val).startsWith(String(value));
                break;
            case 'endsWith':
                failed = !String(val).endsWith(String(value));
                break;
            default:
                return []; // Passagem silenciosa para operadores desconhecidos
        }

        if (failed) {
            return [
                {
                    field,
                    severity,
                    rule: 'custom',
                    message: message || `${label}: failed ${operator} check (expected ${operator} ${value})`,
                    code: customCode,
                    machine_hint: hint(customCode, 'change_value', field, `Expected ${operator} ${value}`),
                },
            ];
        }
        return [];
    }, meta);
}

/**
 * Validate a domain JSON definition structure (meta-validation).
 * Returns errors if the definition itself is malformed.
 * @param {any} domainJSON
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDomainDefinition(domainJSON: any) {
    const errors = [];

    if (!domainJSON) {
        errors.push('Domain definition is null/undefined');
        return { valid: false, errors };
    }
    if (!domainJSON.id) errors.push('Missing domain id');
    if (!domainJSON.name) errors.push('Missing domain name');
    if (!Array.isArray(domainJSON.entities) || domainJSON.entities.length === 0) {
        errors.push('Domain must have at least one entity');
    }

    const VALID_RULE_TYPES = new Set(['required', 'ifAvailable', 'oneOf', 'numeric', 'matchPattern', 'custom']);
    const VALID_BATCH_TYPES = new Set(['uniqueKey']);

    for (const entity of domainJSON.entities || []) {
        if (!entity.name) {
            errors.push('Entity missing name');
            continue;
        }
        for (const r of entity.rules || []) {
            if (!r.type) errors.push(`${entity.name}: rule missing type`);
            else if (!VALID_RULE_TYPES.has(r.type)) errors.push(`${entity.name}: unknown rule type "${r.type}"`);
            if (!r.field) errors.push(`${entity.name}: rule missing field`);
            if (r.type === 'oneOf' && (!Array.isArray(r.allowed) || r.allowed.length === 0)) {
                errors.push(`${entity.name}.${r.field}: oneOf needs allowed[] array`);
            }
            if (r.type === 'matchPattern' && !r.pattern) {
                errors.push(`${entity.name}.${r.field}: matchPattern needs pattern string`);
            }
        }
        for (const r of entity.batchRules || []) {
            if (!r.type) errors.push(`${entity.name}: batch rule missing type`);
            else if (!VALID_BATCH_TYPES.has(r.type)) errors.push(`${entity.name}: unknown batch rule type "${r.type}"`);
            if (r.type === 'uniqueKey' && (!Array.isArray(r.fields) || r.fields.length === 0)) {
                errors.push(`${entity.name}: uniqueKey needs fields[] array`);
            }
        }
    }

    for (const rel of domainJSON.relations || []) {
        if (!rel.from || !rel.to || !rel.fromField || !rel.toField) {
            errors.push(`Relation incomplete: ${JSON.stringify(rel)}`);
        }
    }

    return { valid: errors.length === 0, errors };
}
